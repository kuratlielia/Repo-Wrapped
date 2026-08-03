// Shared types for the whole pipeline. The same Card[] powers the in-app
// story carousel and the image export, so nothing here is UI-specific.

export interface RawCommit {
  hash: string;
  authorName: string;
  authorEmail: string;
  /** Strict ISO-8601 author date WITH the author's own tz offset (git %aI). */
  iso: string;
  /** Commit subject line (git %s). No body, single line. */
  message: string;
  /** Files touched (git --name-only). Empty for merge commits. */
  files: string[];
}

export interface RepoStats {
  repo: string; // "owner/name"
  owner: string;
  name: string;
  windowMonths: number;
  windowStart: string; // ISO date (YYYY-MM-DD)
  windowEnd: string; // ISO date (YYYY-MM-DD)

  totalCommits: number;
  contributorCount: number;

  threeAm: { count: number; percent: number };
  longestStreak: { days: number; start: string; end: string };
  torturedFile: { path: string; edits: number } | null;
  peakDay: { date: string; count: number };
  worstMessage: { message: string; hash: string } | null;
  busiestHour: { hour: number; count: number };
  busiestDow: { dow: number; count: number }; // 0 = Sunday
  topContributor: { name: string; commits: number; share: number } | null;

  // Signals the archetype/caption model reasons over (tone only, never correctness).
  weekendShare: number; // fraction of commits on Sat/Sun
  nightShare: number; // fraction between 20:00 and 05:59
}

export type CardKind =
  | "intro"
  | "commits"
  | "threeAm"
  | "streak"
  | "torturedFile"
  | "peakDay"
  | "worstMessage"
  | "busiest"
  | "topContributor"
  | "personality"
  | "summary";

export interface Card {
  kind: CardKind;
  /** Small calm label, e.g. "Total commits". Never an all-caps eyebrow. */
  label: string;
  /** The big hero value, already formatted for display, e.g. "12,483". */
  headline: string;
  /** Numeric target for the count-up, when the headline is a number. */
  headlineNumber?: number;
  headlinePrefix?: string;
  headlineSuffix?: string;
  /** A secondary line under the hero value (filename, date, ranking). */
  detail?: string;
  /** The generated line with personality. No emojis, no em dashes. */
  quip: string;
}

export interface SummaryData {
  repo: string;
  archetype: string;
  stats: { label: string; value: string }[];
}

export interface WrappedResult {
  repo: string;
  owner: string;
  name: string;
  generatedAt: string;
  windowMonths: number;
  cards: Card[];
  summary: SummaryData;
  /** How captions were produced, surfaced for the "isolates only" cost story. */
  meta: {
    captionSource: "model" | "fallback";
    engine: "node" | "workspace";
    containersUsed: number;
    cached: boolean;
    model?: string;
  };
}

// Soft-error contract for private / missing repos (PRD 6.4).
export type WrapErrorReason = "not_found" | "private" | "invalid_url" | "empty" | "timeout" | "server";

export interface WrapError {
  ok: false;
  reason: WrapErrorReason;
  message: string;
}

// Progress events streamed to the client while the agent works (PRD 8.2).
export type ProgressStep =
  | "resolve"
  | "clone"
  | "read"
  | "crunch"
  | "write"
  | "done";

export interface ProgressEvent {
  type: "progress";
  step: ProgressStep;
  label: string;
  status: "start" | "done";
}

export interface ResultEvent {
  type: "result";
  result: WrappedResult;
}

export interface ErrorEvent {
  type: "error";
  error: WrapError;
}

export type StreamEvent = ProgressEvent | ResultEvent | ErrorEvent;
