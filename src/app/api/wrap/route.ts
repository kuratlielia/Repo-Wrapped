// The streaming Route Handler that powers the whole app.
//
// It speaks NDJSON: every line is one JSON `StreamEvent`, newline-terminated.
// The client renders progress as the engine works, then swaps to the final
// story on the terminal `result` (or shows a soft error on `error`).
//
// Two engines, one contract:
//   - Locally / on a Node host: the Node git engine (clone + `git log` via a
//     real git binary). This is the verified dev path.
//   - On Cloudflare Workers: the Durable Object engine (`@cloudflare/computer`
//     in-isolate git, with a GitHub API fallback) reached through the Agent
//     binding. Selected at request time; imports are dynamic so the Workers
//     bundle never pulls in `node:child_process`.

import { parseRepoInput, isParsedRepo, windowRange } from "@/lib/repo";
import { memoryCache, cacheKey } from "@/lib/cache";
import { rateLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/leaderboard";
import type { CaptionEnv } from "@/lib/captions";
// Type-only imports: erased at build time, so the DO module (and its
// `cloudflare:workers` / `@cloudflare/computer` deps) never enter this bundle.
// The route reaches the DO purely through the Agent binding stub.
import type { Env as AgentEnv, AgentRpc } from "@/worker/agent";
import type { ProgressStep, StreamEvent, WrapError, WrappedResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEP_LABELS: Record<ProgressStep, string> = {
  resolve: "Resolving repository",
  clone: "Cloning the repo",
  read: "Reading the git history",
  crunch: "Crunching the numbers",
  write: "Writing your wrapped",
  done: "Done",
};

const encoder = new TextEncoder();

function encodeEvent(event: StreamEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + "\n");
}

/** Detect a thrown/returned WrapError without importing the Node engine. */
function asWrapError(e: unknown): WrapError | null {
  return e && typeof e === "object" && (e as WrapError).ok === false ? (e as WrapError) : null;
}

/** Best-effort leaderboard write. Never blocks or fails the response. */
async function recordWrap(result: WrappedResult): Promise<void> {
  try {
    await (await getStore()).record(result);
  } catch {
    // Leaderboard is non-essential; swallow any failure.
  }
}

/**
 * Return the Cloudflare env when running on Workers AND the Agent DO binding is
 * present, else null (so local `next dev` uses the Node engine).
 */
async function getWorkersEnv(): Promise<AgentEnv | null> {
  // Only use the DO path in the real Workers runtime. `next dev` may expose a
  // miniflare Agent binding, but the DO is not wired there, so run the Node
  // engine locally instead.
  const onWorkers =
    typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  if (!onWorkers) return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    const env = ctx?.env as unknown as
      | (AgentEnv & { Agent?: { idFromName?: unknown } })
      | undefined;
    if (env?.Agent && typeof env.Agent.idFromName === "function") return env;
    return null;
  } catch {
    return null;
  }
}

function ndjsonResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

function errorStream(error: WrapError): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeEvent({ type: "error", error }));
      controller.close();
    },
  });
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function captionEnvFromProcess(): CaptionEnv {
  return {
    CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
    CF_AI_GATEWAY: process.env.CF_AI_GATEWAY,
    CF_API_TOKEN: process.env.CF_API_TOKEN,
    WRAP_MODEL: process.env.WRAP_MODEL,
  };
}

export async function GET(): Promise<Response> {
  return Response.json({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const limited = rateLimit(ip);
  if (!limited.ok) {
    return ndjsonResponse(
      errorStream({ ok: false, reason: "server", message: "Slow down a moment and try again." })
    );
  }

  let body: { url?: unknown; months?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; months?: unknown };
  } catch {
    return ndjsonResponse(
      errorStream({ ok: false, reason: "invalid_url", message: "Send a JSON body with a repo url." })
    );
  }

  // Cap input length as a cheap abuse guard before any parsing.
  const url = (typeof body.url === "string" ? body.url : "").slice(0, 300);
  const months =
    typeof body.months === "number" && body.months > 0 ? Math.min(body.months, 60) : 12;

  const parsed = parseRepoInput(url);
  if (!isParsedRepo(parsed)) {
    return ndjsonResponse(errorStream(parsed));
  }

  const { months: windowMonths, startIso: windowStart, endIso: windowEnd } = windowRange(months);
  const key = cacheKey(parsed.slug, windowMonths);

  // Cache hit: replay a couple of quick "done" beats, then hand over the story.
  const cached = await memoryCache.get(key);
  if (cached) {
    const cachedResult: WrappedResult = { ...cached, meta: { ...cached.meta, cached: true } };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: StreamEvent) => controller.enqueue(encodeEvent(event));
        send({ type: "progress", step: "resolve", label: STEP_LABELS.resolve, status: "done" });
        send({ type: "progress", step: "read", label: STEP_LABELS.read, status: "done" });
        send({ type: "progress", step: "write", label: STEP_LABELS.write, status: "done" });
        send({ type: "result", result: cachedResult });
        void recordWrap(cachedResult);
        controller.close();
      },
    });
    return ndjsonResponse(stream);
  }

  const workersEnv = await getWorkersEnv();
  const captionEnv = captionEnvFromProcess();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encodeEvent(event));
      const progress = (step: ProgressStep, status: "start" | "done") =>
        send({ type: "progress", step, label: STEP_LABELS[step], status });

      progress("resolve", "start");
      progress("resolve", "done");

      try {
        let result: WrappedResult;

        if (workersEnv) {
          // Cloudflare path: the DO owns the workspace and does clone + log +
          // captions in one RPC. We reach it purely through the binding stub
          // (no import of the DO module), and emit coarse progress around it.
          progress("clone", "start");
          const stub = workersEnv.Agent.get(
            workersEnv.Agent.idFromName(parsed.slug)
          ) as unknown as AgentRpc;
          progress("clone", "done");
          progress("read", "start");
          const out = await stub.wrap({
            owner: parsed.owner,
            name: parsed.name,
            cloneUrl: parsed.cloneUrl,
            windowStart,
            windowMonths,
            windowEnd,
          });
          progress("read", "done");
          progress("write", "start");
          progress("write", "done");
          const wrapErr = asWrapError(out);
          if (wrapErr) {
            send({ type: "error", error: wrapErr });
            return;
          }
          result = out as WrappedResult;
        } else {
          // Node path: real git binary, fine-grained progress from the engine.
          const { runNodeEngine } = await import("@/lib/engine/node");
          result = await runNodeEngine(parsed, {
            windowMonths,
            windowStart,
            windowEnd,
            captionEnv,
            onProgress: (step, status) => progress(step, status),
          });
        }

        await memoryCache.set(key, result);
        send({ type: "result", result });
        void recordWrap(result);
      } catch (err) {
        const wrapErr = asWrapError(err);
        send({
          type: "error",
          error:
            wrapErr ?? {
              ok: false,
              reason: "server",
              message: "Something broke while wrapping this repo. Try again.",
            },
        });
      } finally {
        controller.close();
      }
    },
  });

  return ndjsonResponse(stream);
}
