// Storage-agnostic public leaderboard.
//
// Two implementations sit behind one `LeaderboardStore` interface:
//   - `memoryLeaderboard`: a dependency-free, module-level Map. Persists across
//     requests within a single process, so it works for local `next dev` and as
//     a safe fallback on Workers if the Durable Object binding is missing.
//   - `doLeaderboardStore`: a thin adapter over the global `LeaderboardDO`
//     Durable Object (SQLite-backed), used in Cloudflare production.
//
// `getStore()` picks the DO when the LEADERBOARD binding is present, else memory.

import type { CardKind, WrappedResult } from "@/lib/types";
import type { LeaderboardRpc } from "@/worker/leaderboard";

export interface LeaderboardEntry {
  slug: string;
  owner: string;
  name: string;
  wrapCount: number;
  commits: string;
  commitsNum: number;
  threeAm: number;
  streakDays: number;
  archetype: string;
  lastWrappedAt: string;
}

/** The rankable dimensions. "wraps" is the default headline board. */
export type LeaderboardCategory = "wraps" | "commits" | "threeam" | "streak";

export const LEADERBOARD_CATEGORIES: readonly LeaderboardCategory[] = [
  "wraps",
  "commits",
  "threeam",
  "streak",
];

export function isLeaderboardCategory(value: unknown): value is LeaderboardCategory {
  return (
    typeof value === "string" &&
    (LEADERBOARD_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface LeaderboardStore {
  record(result: WrappedResult): Promise<void>;
  top(limit: number, category?: LeaderboardCategory): Promise<LeaderboardEntry[]>;
}

/**
 * Derive the durable fields of an entry from a finished wrap. The slug is
 * lowercased so it is a stable key regardless of how the repo was typed in;
 * `owner`/`name` keep their original casing for display.
 */
export function entryFromResult(
  result: WrappedResult
): Omit<LeaderboardEntry, "wrapCount"> {
  const commits =
    result.summary.stats.find((s) => s.label.toLowerCase() === "commits")?.value ?? "0";
  const cardNumber = (kind: CardKind): number =>
    result.cards.find((c) => c.kind === kind)?.headlineNumber ?? 0;
  return {
    slug: `${result.owner}/${result.name}`.toLowerCase(),
    owner: result.owner,
    name: result.name,
    commits,
    commitsNum: cardNumber("commits"),
    threeAm: cardNumber("threeAm"),
    streakDays: cardNumber("streak"),
    archetype: result.summary.archetype,
    lastWrappedAt: result.generatedAt || new Date().toISOString(),
  };
}

/** The entry field ranked by each category. */
const CATEGORY_METRIC: Record<LeaderboardCategory, keyof LeaderboardEntry> = {
  wraps: "wrapCount",
  commits: "commitsNum",
  threeam: "threeAm",
  streak: "streakDays",
};

function metricValue(entry: LeaderboardEntry, category: LeaderboardCategory): number {
  const value = entry[CATEGORY_METRIC[category]];
  return typeof value === "number" ? value : 0;
}

function sortEntries(
  entries: LeaderboardEntry[],
  category: LeaderboardCategory
): LeaderboardEntry[] {
  return [...entries].sort(
    (a, b) =>
      metricValue(b, category) - metricValue(a, category) ||
      b.wrapCount - a.wrapCount ||
      b.lastWrappedAt.localeCompare(a.lastWrappedAt)
  );
}

// --- In-memory store --------------------------------------------------------

const memory = new Map<string, LeaderboardEntry>();

export const memoryLeaderboard: LeaderboardStore = {
  async record(result) {
    const base = entryFromResult(result);
    const existing = memory.get(base.slug);
    memory.set(base.slug, { ...base, wrapCount: (existing?.wrapCount ?? 0) + 1 });
  },
  async top(limit, category = "wraps") {
    const safe = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    return sortEntries([...memory.values()], category).slice(0, safe);
  },
};

// --- Durable-Object-backed store --------------------------------------------

/** The minimal namespace surface we need; kept local so this file has no hard
 *  dependency on the generated binding types (LEADERBOARD is added to
 *  wrangler.jsonc in this change but only appears in generated types after a
 *  `cf-typegen` run). */
interface LeaderboardNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): LeaderboardRpc;
}

function isNamespace(value: unknown): value is LeaderboardNamespace {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LeaderboardNamespace).idFromName === "function" &&
    typeof (value as LeaderboardNamespace).get === "function"
  );
}

/** Adapter turning the single global `LeaderboardDO` instance into a store. */
export function doLeaderboardStore(namespace: LeaderboardNamespace): LeaderboardStore {
  const stub = () => namespace.get(namespace.idFromName("global"));
  return {
    async record(result) {
      await stub().record(entryFromResult(result));
    },
    async top(limit, category = "wraps") {
      return stub().top(limit, category);
    },
  };
}

/**
 * Pick the backing store. On Cloudflare (with the LEADERBOARD binding) use the
 * Durable Object; otherwise (local dev, or a missing binding) use the in-memory
 * store. `@opennextjs/cloudflare` is imported lazily so this module still loads
 * in a plain Node context where that package's runtime hooks are absent.
 */
export async function getStore(): Promise<LeaderboardStore> {
  // Only reach for the Durable Object when we are actually in the Workers
  // runtime. In `next dev` a miniflare LEADERBOARD binding may be present, but
  // the DO is not wired there, so we must use the in-memory store locally.
  const onWorkers =
    typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  if (!onWorkers) return memoryLeaderboard;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = getCloudflareContext();
    const binding = (env as unknown as Record<string, unknown>).LEADERBOARD;
    if (isNamespace(binding)) {
      return doLeaderboardStore(binding);
    }
  } catch {
    // Context unavailable — fall through to the in-memory store.
  }
  return memoryLeaderboard;
}
