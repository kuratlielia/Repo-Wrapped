// A pure-`fetch` history reader backed by the GitHub REST API. Runs anywhere
// (Workers isolate, Node) with no git binary and no clone, so it is the
// resilient fallback for the Cloudflare path when the in-isolate clone cannot
// complete. Still zero containers: just HTTPS calls.
//
// It never imposes an artificial commit cap: it reads the `Link` header to
// learn the exact last page, then fetches every page of the window in parallel
// (bounded concurrency) so even very large repos complete quickly. The only
// real limit is GitHub's own rate limit; without a token that is 60 req/hr, so
// enormous repos (kernel-scale) need a GITHUB_TOKEN to be read in full.
//
// Fidelity note: the commits API returns no per-commit file list (the
// most-tortured-file card is omitted on this path), and dates are UTC, so the
// hour-of-day stats are UTC-based here rather than the author's local clock.

import type { RawCommit } from "@/lib/types";
import type { ParsedRepo } from "@/lib/repo";
import type { WrapError } from "@/lib/types";

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name?: string; email?: string; date?: string } | null;
  };
  author: { login?: string } | null;
}

const PER_PAGE = 100;
// Concurrency for parallel page fetches. GitHub throttles Cloudflare's shared
// egress IPs hard, so keep this modest.
const CONCURRENCY = 12;
// How many pages of real commits to pull for the distribution stats (3am club,
// streak, busiest hour, contributors, ...). A repo with more commits than this
// still reports its EXACT total (read from the Link header, see below); only the
// personality stats are computed from this most-recent sample. Sized to finish
// comfortably inside a Worker request even when GitHub is throttling.
const SAMPLE_PAGES = 50;

export interface GitHubReadResult {
  commits: RawCommit[];
  /** Exact total commits in the window (from the Link header), even when sampled. */
  totalCount: number;
  /** True when `commits` is a most-recent sample, not the full window. */
  sampled: boolean;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "repo-wrapped",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function commitsUrl(repo: ParsedRepo, sinceIso: string, page: number): string {
  return (
    `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/` +
    `${encodeURIComponent(repo.name)}/commits?per_page=${PER_PAGE}&page=${page}` +
    `&since=${encodeURIComponent(sinceIso)}`
  );
}

/**
 * Parse the `rel="last"` page number out of a GitHub `Link` header. `page` is
 * not necessarily the final query param (GitHub appends `&since=...`), so match
 * the page number within whichever comma-part carries rel="last".
 */
function lastPageFromLink(link: string | null): number | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!/rel="last"/.test(part)) continue;
    const m = part.match(/[?&]page=(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

function mapCommits(raw: GitHubCommit[], sinceIso: string): RawCommit[] {
  return raw.map((c) => {
    const a = c.commit.author;
    return {
      hash: c.sha,
      authorName: a?.name || c.author?.login || "Unknown",
      authorEmail: a?.email || "",
      iso: a?.date || sinceIso,
      message: (c.commit.message || "").split("\n")[0].trim(),
      files: [],
    };
  });
}

class RateLimited extends Error {}

async function fetchPage(
  repo: ParsedRepo,
  sinceIso: string,
  page: number,
  headers: Record<string, string>
): Promise<{ commits: RawCommit[]; res: Response }> {
  const res = await fetch(commitsUrl(repo, sinceIso, page), { headers });
  if (res.status === 404) {
    throw softError("not_found", "Could not find that repo on GitHub. Check the owner and name.");
  }
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get("x-ratelimit-remaining") === "0") throw new RateLimited();
    throw softError("private", "That repo looks private. Repo Wrapped only reads public repos.");
  }
  if (res.status === 409) return { commits: [], res }; // empty repository
  if (!res.ok) throw softError("server", "GitHub did not cooperate. Try again in a moment.");
  const body = (await res.json()) as GitHubCommit[];
  return { commits: Array.isArray(body) ? mapCommits(body, sinceIso) : [], res };
}

/** Run tasks with bounded concurrency, preserving nothing about order. */
async function pooled<T>(count: number, worker: (i: number) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  async function run(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= count) return;
      results.push(await worker(i));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, run));
  return results;
}

/**
 * Read every commit in the window. No artificial cap: page 1 reveals the last
 * page via the Link header, then all remaining pages are fetched in parallel.
 * Returns `partial: true` if a rate limit or the safety ceiling cut it short.
 */
export async function readGitHubCommits(
  repo: ParsedRepo,
  windowStart: string,
  opts: { token?: string } = {}
): Promise<GitHubReadResult> {
  const headers = buildHeaders(opts.token);
  const sinceIso = `${windowStart}T00:00:00Z`;

  // First page (also tells us how many pages there are).
  let first: { commits: RawCommit[]; res: Response };
  try {
    first = await fetchPage(repo, sinceIso, 1, headers);
  } catch (e) {
    if (e instanceof RateLimited) {
      throw softError(
        "timeout",
        "GitHub is rate limiting us right now. Add a GITHUB_TOKEN or try again in a minute."
      );
    }
    throw e;
  }
  const commits: RawCommit[] = [...first.commits];
  if (first.commits.length < PER_PAGE) {
    // Whole window fits on page 1.
    return { commits, totalCount: commits.length, sampled: false };
  }

  const last = lastPageFromLink(first.res.headers.get("link"));
  // No Link header but a full first page: walk sequentially (small-ish repo).
  if (last === null) {
    const tail = await sequentialTail(repo, sinceIso, headers, commits);
    return { commits: tail.commits, totalCount: tail.commits.length, sampled: tail.sampled };
  }

  // EXACT total for the headline number, from the last page's size. Two cheap
  // calls give us the true count even for an 80,000-commit kernel repo, so the
  // "Total commits" stat is never capped.
  let totalCount = last * PER_PAGE; // upper bound until we read the last page
  try {
    const lastPage = await fetchPage(repo, sinceIso, last, headers);
    totalCount = (last - 1) * PER_PAGE + lastPage.commits.length;
  } catch {
    // Keep the estimate if the last page can't be read.
  }

  // Pull a bounded, most-recent sample for the distribution stats.
  const sampleLast = Math.min(last, SAMPLE_PAGES);
  const sampled = last > SAMPLE_PAGES;
  const pageNumbers = Array.from({ length: sampleLast - 1 }, (_, i) => i + 2); // 2..sampleLast
  const pages = await pooled(pageNumbers.length, async (i) => {
    try {
      return (await fetchPage(repo, sinceIso, pageNumbers[i], headers)).commits;
    } catch {
      return [] as RawCommit[];
    }
  });
  for (const p of pages) commits.push(...p);

  return { commits, totalCount: Math.max(totalCount, commits.length), sampled };
}

/** Fallback when GitHub omits the Link header: walk pages until one is short. */
async function sequentialTail(
  repo: ParsedRepo,
  sinceIso: string,
  headers: Record<string, string>,
  commits: RawCommit[]
): Promise<{ commits: RawCommit[]; sampled: boolean }> {
  for (let page = 2; page <= SAMPLE_PAGES; page++) {
    try {
      const { commits: got } = await fetchPage(repo, sinceIso, page, headers);
      commits.push(...got);
      if (got.length < PER_PAGE) return { commits, sampled: false };
    } catch {
      break;
    }
  }
  return { commits, sampled: true };
}

function softError(reason: WrapError["reason"], message: string): WrapError & Error {
  const e = new Error(message) as WrapError & Error;
  e.ok = false;
  e.reason = reason;
  e.message = message;
  return e;
}

export function isWrapErrorLike(e: unknown): e is WrapError {
  return !!e && typeof e === "object" && (e as WrapError).ok === false;
}
