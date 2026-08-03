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
// Concurrency for parallel page fetches. High enough to be fast, low enough to
// be polite and to not open too many sockets at once inside the isolate.
const CONCURRENCY = 24;
// Absolute safety ceiling so a pathological repo cannot spin forever. 100k
// commits in a single 12-month window is far beyond any real project.
const PAGE_CEILING = 1000;

export interface GitHubReadResult {
  commits: RawCommit[];
  /** True if we stopped early (rate limit / ceiling) and the count is partial. */
  partial: boolean;
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

/** Parse the `rel="last"` page number out of a GitHub `Link` header. */
function lastPageFromLink(link: string | null): number | null {
  if (!link) return null;
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
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
    return { commits, partial: false };
  }

  const last = lastPageFromLink(first.res.headers.get("link"));
  // No Link header but a full first page: fall back to sequential discovery.
  if (last === null) {
    return sequentialTail(repo, sinceIso, headers, commits);
  }

  const target = Math.min(last, PAGE_CEILING);
  const pageNumbers = Array.from({ length: target - 1 }, (_, i) => i + 2); // 2..target
  let partial = last > PAGE_CEILING;

  try {
    const pages = await pooled(pageNumbers.length, (i) =>
      fetchPage(repo, sinceIso, pageNumbers[i], headers)
    );
    for (const p of pages) commits.push(...p.commits);
  } catch (e) {
    if (e instanceof RateLimited) {
      partial = true; // keep whatever pages resolved before the limit
    } else {
      throw e;
    }
  }

  return { commits, partial };
}

/** Fallback when GitHub omits the Link header: walk pages until one is short. */
async function sequentialTail(
  repo: ParsedRepo,
  sinceIso: string,
  headers: Record<string, string>,
  commits: RawCommit[]
): Promise<GitHubReadResult> {
  let partial = false;
  for (let page = 2; page <= PAGE_CEILING; page++) {
    try {
      const { commits: got } = await fetchPage(repo, sinceIso, page, headers);
      commits.push(...got);
      if (got.length < PER_PAGE) return { commits, partial };
    } catch (e) {
      if (e instanceof RateLimited) {
        partial = true;
        break;
      }
      throw e;
    }
  }
  return { commits, partial: true };
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
