// The public-leaderboard Durable Object.
//
// A single, global instance (addressed by name "global") owns a small SQLite
// table ranking repos by how many times they have been wrapped. It is a plain
// Cloudflare Durable Object (no @cloudflare/computer workspace): just SQLite +
// two RPC methods the Next.js route calls through the LEADERBOARD binding.
//
// NOTE: for the `migrations` entry in wrangler.jsonc to bind this class, the
// OpenNext Worker entry must RE-EXPORT `LeaderboardDO` alongside `Agent` (the
// same way `Agent` is re-exported today). That re-export lives in a file this
// change does not own; see the report.

import { DurableObject } from "cloudflare:workers";
import type { LeaderboardCategory, LeaderboardEntry } from "@/lib/leaderboard";

/** The callable RPC surface, used to type the namespace stub on the route side. */
export interface LeaderboardRpc {
  record(entry: Omit<LeaderboardEntry, "wrapCount">): Promise<void>;
  top(limit: number, category?: LeaderboardCategory): Promise<LeaderboardEntry[]>;
}

/** Row shape as stored in SQLite (snake_case columns). The index signature
 *  satisfies the `sql.exec<T>` row constraint. */
interface EntryRow {
  slug: string;
  owner: string;
  name: string;
  wrap_count: number;
  commits: string;
  commits_num: number;
  three_am: number;
  streak_days: number;
  archetype: string;
  last_wrapped_at: string;
  [column: string]: SqlStorageValue;
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS entries (
  slug TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  wrap_count INTEGER NOT NULL,
  commits TEXT NOT NULL,
  commits_num INTEGER NOT NULL,
  three_am INTEGER NOT NULL,
  streak_days INTEGER NOT NULL,
  archetype TEXT NOT NULL,
  last_wrapped_at TEXT NOT NULL
)`;

/** Whitelisted category -> ORDER BY column. Never interpolate raw input. */
const CATEGORY_COLUMN: Record<LeaderboardCategory, string> = {
  wraps: "wrap_count",
  commits: "commits_num",
  threeam: "three_am",
  streak: "streak_days",
};

function rowToEntry(row: EntryRow): LeaderboardEntry {
  return {
    slug: row.slug,
    owner: row.owner,
    name: row.name,
    wrapCount: row.wrap_count,
    commits: row.commits,
    commitsNum: row.commits_num,
    threeAm: row.three_am,
    streakDays: row.streak_days,
    archetype: row.archetype,
    lastWrappedAt: row.last_wrapped_at,
  };
}

export class LeaderboardDO extends DurableObject implements LeaderboardRpc {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Create the table once, before any request can touch storage.
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(CREATE_TABLE);
    });
  }

  /**
   * UPSERT one wrap: first sighting starts at wrap_count 1, repeats increment
   * and refresh the mutable fields (commits/archetype/last_wrapped_at).
   */
  async record(entry: Omit<LeaderboardEntry, "wrapCount">): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO entries
         (slug, owner, name, wrap_count, commits, commits_num, three_am, streak_days, archetype, last_wrapped_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         wrap_count = wrap_count + 1,
         owner = excluded.owner,
         name = excluded.name,
         commits = excluded.commits,
         commits_num = excluded.commits_num,
         three_am = excluded.three_am,
         streak_days = excluded.streak_days,
         archetype = excluded.archetype,
         last_wrapped_at = excluded.last_wrapped_at`,
      entry.slug,
      entry.owner,
      entry.name,
      entry.commits,
      entry.commitsNum,
      entry.threeAm,
      entry.streakDays,
      entry.archetype,
      entry.lastWrappedAt
    );
  }

  /** Top repos ranked by the category's metric, wrap_count then newest wrap
   *  breaking ties. The column comes from a whitelist, never raw input. */
  async top(limit: number, category: LeaderboardCategory = "wraps"): Promise<LeaderboardEntry[]> {
    const safe = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    const column = CATEGORY_COLUMN[category] ?? CATEGORY_COLUMN.wraps;
    const rows = this.ctx.storage.sql
      .exec<EntryRow>(
        `SELECT slug, owner, name, wrap_count, commits, commits_num, three_am, streak_days, archetype, last_wrapped_at
         FROM entries
         ORDER BY ${column} DESC, wrap_count DESC, last_wrapped_at DESC
         LIMIT ?`,
        safe
      )
      .toArray();
    return rows.map(rowToEntry);
  }
}
