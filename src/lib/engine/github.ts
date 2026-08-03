// A pure-`fetch` history reader backed by the GitHub REST API. Runs anywhere
// (Workers isolate, Node) with no git binary and no clone, so it is the
// resilient fallback for the Cloudflare path when the in-isolate clone cannot
// complete. Still zero containers: it is a handful of HTTPS calls.
//
// Fidelity note: the GitHub commits API does not return per-commit file lists
// (so the most-tortured-file card is omitted on this path), and dates may be
// normalized to UTC, so the hour-of-day stats are UTC-based here rather than
// the author's local wall clock.

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
const MAX_PAGES = 6; // up to 600 commits in the window; plenty for a Wrapped

export interface GitHubReadResult {
  commits: RawCommit[];
}

/**
 * Read up to MAX_PAGES*PER_PAGE commits in the window. Throws a typed WrapError
 * on private/missing/rate-limited so the caller can render the soft error.
 */
export async function readGitHubCommits(
  repo: ParsedRepo,
  windowStart: string,
  opts: { token?: string } = {}
): Promise<GitHubReadResult> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "repo-wrapped",
    "x-github-api-version": "2022-11-28",
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  const commits: RawCommit[] = [];
  const sinceIso = `${windowStart}T00:00:00Z`;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/` +
      `${encodeURIComponent(repo.name)}/commits?per_page=${PER_PAGE}&page=${page}` +
      `&since=${encodeURIComponent(sinceIso)}`;

    const res = await fetch(url, { headers });

    if (res.status === 404) {
      throw softError("not_found", "Could not find that repo on GitHub. Check the owner and name.");
    }
    if (res.status === 403 || res.status === 429) {
      // Distinguish rate limiting from a genuinely private/forbidden repo.
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        throw softError("timeout", "GitHub is rate limiting us right now. Try again in a minute.");
      }
      throw softError("private", "That repo looks private. Repo Wrapped only reads public repos.");
    }
    if (res.status === 409) {
      // Empty repository.
      break;
    }
    if (!res.ok) {
      throw softError("server", "GitHub did not cooperate. Try again in a moment.");
    }

    const page1 = (await res.json()) as GitHubCommit[];
    if (!Array.isArray(page1) || page1.length === 0) break;

    for (const c of page1) {
      const a = c.commit.author;
      commits.push({
        hash: c.sha,
        authorName: a?.name || c.author?.login || "Unknown",
        authorEmail: a?.email || "",
        iso: a?.date || sinceIso,
        message: (c.commit.message || "").split("\n")[0].trim(),
        files: [],
      });
    }

    if (page1.length < PER_PAGE) break;
  }

  return { commits };
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
