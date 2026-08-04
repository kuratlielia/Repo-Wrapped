import { parseGitLog } from "@/lib/git/parse";
import { computeStats } from "@/lib/git/stats";
import { buildCards } from "@/lib/cards";
import { generateQuips, type AiRunner, type CaptionEnv } from "@/lib/captions";
import type { ParsedRepo } from "@/lib/repo";
import type { RawCommit, WrappedResult } from "@/lib/types";

export interface AssembleOptions {
  windowMonths: number;
  windowStart: string;
  windowEnd: string;
  engine: "node" | "workspace";
  containersUsed: number;
  cached?: boolean;
  /** Exact total commits when `commits` is a sample (kernel-scale repos). */
  knownTotal?: number;
  aiRun?: AiRunner;
  captionEnv?: CaptionEnv;
  generatedAt?: string;
}

/**
 * The provider-agnostic tail of the pipeline: parse the git log, crunch the
 * deterministic stats, make ONE caption call, and assemble the card payload.
 * Shared by the Node engine and the Cloudflare Workspace engine so the output
 * is identical whichever backend produced the log.
 */
export async function assembleFromLog(
  logStdout: string,
  repo: ParsedRepo,
  opts: AssembleOptions
): Promise<WrappedResult> {
  return assembleFromCommits(parseGitLog(logStdout), repo, opts);
}

/**
 * Same tail of the pipeline, but starting from already-structured commits. Used
 * by the Cloudflare Workspace engine, which reads history via the in-isolate
 * isomorphic-git client (structured objects) rather than shelling out to a log.
 */
export async function assembleFromCommits(
  commits: RawCommit[],
  repo: ParsedRepo,
  opts: AssembleOptions
): Promise<WrappedResult> {
  const stats = computeStats(commits, {
    owner: repo.owner,
    name: repo.name,
    windowMonths: opts.windowMonths,
    windowStart: opts.windowStart,
    windowEnd: opts.windowEnd,
    knownTotal: opts.knownTotal,
  });

  const { quips, source, model } = await generateQuips(stats, {
    aiRun: opts.aiRun,
    env: opts.captionEnv,
  });

  const { cards, summary } = buildCards(stats, quips);

  return {
    repo: stats.repo,
    owner: stats.owner,
    name: stats.name,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    windowMonths: opts.windowMonths,
    cards,
    summary,
    meta: {
      captionSource: source,
      engine: opts.engine,
      containersUsed: opts.containersUsed,
      cached: opts.cached ?? false,
      model,
    },
  };
}
