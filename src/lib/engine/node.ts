// The local/Node git engine: the verified path for `next dev`.
//
// It clones the target repo into a throwaway temp dir, runs ONE archaeology
// `git log`, and hands the raw stdout to the provider-agnostic assembler. The
// Cloudflare Workspace engine mirrors this shape with a worker-shell `git`.

import { spawn } from "node:child_process";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { logArgs } from "@/lib/git/format";
import { assembleFromLog } from "@/lib/engine/assemble";
import type { ParsedRepo } from "@/lib/repo";
import type { CaptionEnv } from "@/lib/captions";
import type { ProgressStep, WrappedResult, WrapError } from "@/lib/types";

const CLONE_TIMEOUT_MS = 90_000;
const LOG_TIMEOUT_MS = 90_000;
const LOG_MAX_BUFFER = 256 * 1024 * 1024;

export interface RunNodeEngineOptions {
  windowMonths: number;
  windowStart: string;
  windowEnd: string;
  captionEnv?: CaptionEnv;
  onProgress?: (step: ProgressStep, status: "start" | "done") => void;
  signal?: AbortSignal;
}

/** Narrow an unknown thrown value to our soft-error contract, else null. */
export function asWrapError(e: unknown): WrapError | null {
  if (e && typeof e === "object" && (e as { ok?: unknown }).ok === false) {
    return e as WrapError;
  }
  return null;
}

function wrapError(reason: WrapError["reason"], message: string): WrapError {
  return { ok: false, reason, message };
}

interface RunGitResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

interface RunGitOptions {
  cwd?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

/**
 * Spawn `git <args>`, collecting stdout/stderr with a hard timeout and abort
 * support. Never rejects on a non-zero exit code (the caller inspects stderr);
 * it only rejects if the process cannot be spawned at all.
 */
function runGit(args: string[], opts: RunGitOptions): Promise<RunGitResult> {
  return new Promise<RunGitResult>((resolve, reject) => {
    const maxBuffer = opts.maxBuffer ?? 16 * 1024 * 1024;
    const child = spawn("git", args, {
      cwd: opts.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...opts.env },
    });

    let stdout = "";
    let stderr = "";
    let stdoutLen = 0;
    let stderrLen = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    };

    const kill = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // process already gone
      }
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      kill();
      cleanup();
      reject(wrapError("server", "The request was cancelled."));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      kill();
      cleanup();
      reject(wrapError("timeout", "Cloning took too long. Try a smaller or faster repo."));
    }, opts.timeoutMs);

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutLen += chunk.length;
      if (stdoutLen <= maxBuffer) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrLen += chunk.length;
      if (stderrLen <= maxBuffer) stderr += chunk.toString("utf8");
    });

    child.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(wrapError("server", `git could not be started: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ stdout, stderr, code });
    });
  });
}

function classifyCloneFailure(stderr: string): WrapError {
  const s = stderr.toLowerCase();
  if (/repository not found/.test(s) || /not found/.test(s) || /does not exist/.test(s)) {
    return wrapError(
      "not_found",
      "That repo could not be found. Repo Wrapped is public only for now."
    );
  }
  if (
    /could not read username/.test(s) ||
    /authentication failed/.test(s) ||
    /permission denied/.test(s) ||
    /terminal prompts disabled/.test(s)
  ) {
    return wrapError(
      "private",
      "That repo looks private. Repo Wrapped is public only for now."
    );
  }
  return wrapError("server", "Could not clone this repo. Try again.");
}

/** The ordered clone strategies, from cheapest to most permissive. */
function cloneStrategies(cloneUrl: string, dir: string, windowStart: string): string[][] {
  return [
    ["clone", `--shallow-since=${windowStart}`, "--single-branch", "--no-tags", cloneUrl, dir],
    ["clone", "--filter=blob:none", "--single-branch", "--no-tags", cloneUrl, dir],
    ["clone", "--depth", "1000", "--single-branch", "--no-tags", cloneUrl, dir],
  ];
}

export async function runNodeEngine(
  repo: ParsedRepo,
  opts: RunNodeEngineOptions
): Promise<WrappedResult> {
  const { windowMonths, windowStart, windowEnd, captionEnv, onProgress, signal } = opts;
  const base = await mkdtemp(join(tmpdir(), "repo-wrapped-"));
  const dir = join(base, randomUUID());

  try {
    onProgress?.("clone", "start");

    const strategies = cloneStrategies(repo.cloneUrl, dir, windowStart);
    let lastFailure: WrapError | null = null;
    let cloned = false;

    for (const args of strategies) {
      // Clean the target dir between attempts so a partial clone can't poison
      // the next strategy.
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      const res = await runGit(args, { timeoutMs: CLONE_TIMEOUT_MS, signal });
      if (res.code === 0) {
        cloned = true;
        break;
      }
      const failure = classifyCloneFailure(res.stderr);
      lastFailure = failure;
      // A private/not-found repo will fail identically on every strategy, so
      // stop early instead of retrying a hopeless clone.
      if (failure.reason === "private" || failure.reason === "not_found") break;
    }

    if (!cloned) {
      throw lastFailure ?? wrapError("server", "Could not clone this repo. Try again.");
    }

    onProgress?.("clone", "done");

    onProgress?.("read", "start");
    const log = await runGit(["-C", dir, ...logArgs(windowStart)], {
      timeoutMs: LOG_TIMEOUT_MS,
      signal,
      maxBuffer: LOG_MAX_BUFFER,
    });
    if (log.code !== 0) {
      throw wrapError("server", "Could not read the git history. Try again.");
    }
    onProgress?.("read", "done");

    if (!log.stdout.trim()) {
      throw wrapError("empty", "No commits in the last 12 months. Nothing to wrap yet.");
    }

    onProgress?.("crunch", "start");
    onProgress?.("crunch", "done");

    onProgress?.("write", "start");
    const result = await assembleFromLog(log.stdout, repo, {
      windowMonths,
      windowStart,
      windowEnd,
      engine: "node",
      containersUsed: 0,
      captionEnv,
    });
    onProgress?.("write", "done");

    return result;
  } finally {
    await rm(base, { recursive: true, force: true }).catch(() => {});
  }
}
