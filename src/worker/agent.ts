// The Cloudflare production path for Repo Wrapped.
//
// One Durable Object per repo owns a `@cloudflare/computer` Workspace backed by
// the DO's own SQLite storage. It clones the target repo into the workspace and
// reads the history with the in-isolate isomorphic-git client (`ws.git.clone`
// + `ws.git.log`) with ZERO containers and NO Worker Loader: pure DO + SQLite
// VFS + `nodejs_compat`. That is the cost story: a Wrapped costs a bounded
// clone, in-isolate log parsing, and ONE batched Workers AI caption call.
//
// NOTE: `@cloudflare/computer` is a PREVIEW package (v0.1.x). Where a shape is
// not yet nailed down we use a narrow, commented `as` cast rather than `any`.

import { DurableObject } from "cloudflare:workers";
import {
  withWorkspace,
  getWorkspace,
  type WorkspaceHandle,
  type DurableObjectStorageLike,
} from "@cloudflare/computer";
import { createGitClient } from "@cloudflare/computer/git";

import { assembleFromCommits } from "@/lib/engine/assemble";
import { readGitHubCommits, isWrapErrorLike } from "@/lib/engine/github";
import type { AiRunner } from "@/lib/captions";
import type { ParsedRepo } from "@/lib/repo";
import type { RawCommit, WrappedResult, WrapError } from "@/lib/types";

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------

interface AiBinding {
  run: (model: string, input: unknown, options?: unknown) => Promise<unknown>;
}

export interface Env {
  /** This DO's own namespace, used to name/route one workspace per repo slug. */
  Agent: DurableObjectNamespace;
  /** Workers AI binding; the single caption call runs through it via AI Gateway. */
  AI?: AiBinding;
  /** AI Gateway id so the one caption call is cached / rate-limited / logged (PRD 6.2.1). */
  CF_AI_GATEWAY?: string;
  /** Overridable caption model. Defaults to a small llama in @/lib/captions. */
  WRAP_MODEL?: string;
  /** Optional GitHub token: raises the fallback reader's rate limit (60 -> 5000/hr). */
  GITHUB_TOKEN?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Working-tree directory the repo is cloned into, inside the workspace VFS. */
const REPO_DIR = "/workspace/repo";

/** Identity the git client wants even though we never commit. */
const GIT_IDENTITY = { name: "Repo Wrapped", email: "bot@repo-wrapped.dev" } as const;

/**
 * Clone / log depth cap. `git.log` has no `--since`, so we pull a bounded slice
 * of history and filter to the window in JS. This also caps clone CPU inside the
 * isolate. 12 months of a busy repo comfortably fits.
 */
const HISTORY_DEPTH = 2500;

// ---------------------------------------------------------------------------
// DO input / RPC surface
// ---------------------------------------------------------------------------

export interface WrapInput {
  owner: string;
  name: string;
  cloneUrl: string;
  /** ISO date (YYYY-MM-DD) the window opens on. Commits before it are dropped. */
  windowStart: string;
  windowMonths: number;
  /** ISO date (YYYY-MM-DD) the window closes on. Defaults to "today" in the DO. */
  windowEnd?: string;
}

export interface AgentRpc {
  wrap(input: WrapInput): Promise<WrappedResult | WrapError>;
}

// ---------------------------------------------------------------------------
// Commit mapping
// ---------------------------------------------------------------------------

interface GitPerson {
  name: string;
  email: string;
  timestamp: number; // seconds since epoch
  timezoneOffset: number; // minutes east of UTC
}
interface CommitView {
  oid: string;
  message: string;
  author: GitPerson;
  committer: GitPerson;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Build a strict ISO-8601 string carrying the author's own tz offset, so the
 * stats layer reads the same local wall-clock the Node engine's `%aI` gives.
 */
function isoFromPerson(p: GitPerson): string {
  const localMs = (p.timestamp + p.timezoneOffset * 60) * 1000;
  const d = new Date(localMs);
  const off = p.timezoneOffset;
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const tz = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${tz}`
  );
}

function toRawCommit(c: CommitView): RawCommit {
  return {
    hash: c.oid,
    authorName: c.author.name || "Unknown",
    authorEmail: c.author.email || "",
    iso: isoFromPerson(c.author),
    // First line only: the subject, matching the Node engine's `%s`.
    message: (c.message || "").split("\n")[0].trim(),
    // The in-isolate log has no per-commit file list; the most-tortured-file
    // card is simply omitted on this path (buildCards drops it when null).
    files: [],
  };
}

// ---------------------------------------------------------------------------
// The Durable Object
// ---------------------------------------------------------------------------

export const Agent = withWorkspace(
  class extends DurableObject<Env> {
    async wrap(input: WrapInput): Promise<WrappedResult | WrapError> {
      const windowEnd = input.windowEnd ?? new Date().toISOString().slice(0, 10);
      const repo: ParsedRepo = {
        owner: input.owner,
        name: input.name,
        slug: `${input.owner}/${input.name}`,
        cloneUrl: input.cloneUrl,
      };

      // Primary path: clone + log entirely IN THE ISOLATE (the cost story). If
      // the preview clone cannot complete, fall back to the GitHub REST reader,
      // which is also isolate-only (a few HTTPS calls, zero containers).
      let commits: RawCommit[] | null = null;
      try {
        // getWorkspace(this) resolves to the LOCAL workspace this DO owns, so
        // `ws.git` is the full isomorphic-git client (with `.clone` / `.log`).
        using ws = await getWorkspace(this as unknown as WorkspaceHandle);
        await ws.git.clone({
          url: repo.cloneUrl,
          dir: REPO_DIR,
          singleBranch: true,
          noTags: true,
          depth: HISTORY_DEPTH,
        });
        const view = (await ws.git.log({ dir: REPO_DIR, depth: HISTORY_DEPTH })) as CommitView[];
        commits = view
          .map(toRawCommit)
          .filter((c) => c.iso.slice(0, 10) >= input.windowStart);
      } catch {
        commits = null; // fall back below
      }

      if (!commits || commits.length === 0) {
        try {
          const gh = await readGitHubCommits(repo, input.windowStart, {
            token: this.env.GITHUB_TOKEN,
          });
          commits = gh.commits;
        } catch (err) {
          if (isWrapErrorLike(err)) return err;
          return {
            ok: false,
            reason: "server",
            message: "Something went wrong reading the git history. Try again in a moment.",
          };
        }
      }

      if (commits.length === 0) {
        return {
          ok: false,
          reason: "empty",
          message: "No commits in this window. Try a longer window or a busier repo.",
        };
      }

      // 3. ONE batched caption call through the AI binding + AI Gateway.
      const aiRun = this.buildAiRunner();

      // 4. Provider-agnostic tail: crunch, caption, assemble.
      return assembleFromCommits(commits, repo, {
        windowMonths: input.windowMonths,
        windowStart: input.windowStart,
        windowEnd,
        engine: "workspace",
        containersUsed: 0, // isolates only — the cost story.
        aiRun,
        captionEnv: { WRAP_MODEL: this.env.WRAP_MODEL },
      });
    }

    override async fetch(request: Request): Promise<Response> {
      const input = (await request.json()) as WrapInput;
      const out = await this.wrap(input);
      const status = "ok" in out && out.ok === false ? 422 : 200;
      return Response.json(out, { status });
    }

    private buildAiRunner(): AiRunner | undefined {
      const ai = this.env.AI;
      if (!ai) return undefined;
      const gatewayId = this.env.CF_AI_GATEWAY;
      return async (model, body) => {
        // Prefer routing through AI Gateway (caching / rate limiting / logging).
        // If the gateway is not set up yet, retry the call directly so captions
        // still come from the model rather than silently degrading to fallback.
        if (gatewayId) {
          try {
            const out = await ai.run(model, body, {
              gateway: { id: gatewayId, skipCache: false },
            });
            return out as { response?: string } | string;
          } catch {
            // Gateway not configured or unavailable; fall through to a direct call.
          }
        }
        return (await ai.run(model, body)) as { response?: string } | string;
      };
    }
  },
  (self) => {
    // `ctx`/`env` are `protected`; the options factory runs outside the class.
    const { ctx } = self as unknown as { ctx: DurableObjectState; env: Env };
    return {
      // TODO(preview): drop the cast once @cloudflare/computer widens the type.
      storage: ctx.storage as unknown as DurableObjectStorageLike,
      git: createGitClient(),
      defaultGitIdentity: GIT_IDENTITY,
    };
  }
);

// ---------------------------------------------------------------------------
// Worker/route entry helper
// ---------------------------------------------------------------------------

/**
 * Invoke the workspace pipeline from a Next.js route handler. The heavy lifting
 * happens INSIDE the DO (it owns the workspace); this just names the workspace
 * after the repo slug and forwards over RPC. The DO returns plain JSON.
 */
export async function wrapWithWorkspace(
  env: Env,
  repo: ParsedRepo,
  window: { windowStart: string; windowMonths: number; windowEnd?: string }
): Promise<WrappedResult | WrapError> {
  const id = env.Agent.idFromName(repo.slug);
  const stub = env.Agent.get(id) as unknown as AgentRpc;
  return stub.wrap({
    owner: repo.owner,
    name: repo.name,
    cloneUrl: repo.cloneUrl,
    windowStart: window.windowStart,
    windowMonths: window.windowMonths,
    windowEnd: window.windowEnd,
  });
}

