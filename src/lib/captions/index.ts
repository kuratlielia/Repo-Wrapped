import type { RepoStats } from "@/lib/types";
import { dowName, hourLabel, prettyDate } from "@/lib/labels";
import { buildFallbackQuips, type Quips } from "./fallback";
import { sanitizeLine, sanitizeName } from "./sanitize";

// A Workers-AI-shaped runner. The Durable Object hands us `env.AI.run` bound
// with an AI Gateway id; locally we fall back to the Gateway REST endpoint.
export type AiRunner = (
  model: string,
  input: { messages: { role: string; content: string }[]; max_tokens?: number; temperature?: number }
) => Promise<{ response?: string } | string>;

export interface CaptionEnv {
  CF_ACCOUNT_ID?: string;
  CF_AI_GATEWAY?: string;
  CF_API_TOKEN?: string;
  WRAP_MODEL?: string;
}

// Small, cheap model. Confirm the exact string against the live Workers AI
// models list at build time (PRD 6.2.1); overridable via WRAP_MODEL.
const DEFAULT_MODEL = "@cf/meta/llama-3.2-3b-instruct";

const SYSTEM = [
  "You write the captions for Repo Wrapped, a Spotify-Wrapped-style story about a GitHub repo.",
  "Voice: dry, confident, a little roasting, genuinely funny. Never mean, never corporate, never hype.",
  "Hard rules you must never break:",
  "- No emojis. None.",
  "- No em dashes or en dashes. Use commas, periods, or restructure.",
  "- No hashtags, no exclamation-mark spam, no quotation-mark framing unless quoting a commit message.",
  "- One sentence per caption. Short. Under 140 characters.",
  "- Never invent numbers. Only riff on the stats provided. The numbers are already correct.",
  "Return ONLY compact JSON, no prose, no code fences.",
].join("\n");

function buildUserPrompt(stats: RepoStats): string {
  const facts = {
    repo: stats.repo,
    totalCommits: stats.totalCommits,
    commitsBefore5am: stats.threeAm.count,
    percentBefore5am: stats.threeAm.percent,
    longestStreakDays: stats.longestStreak.days,
    mostEditedFile: stats.torturedFile
      ? { file: stats.torturedFile.path.split("/").pop(), edits: stats.torturedFile.edits }
      : null,
    peakDay: { date: prettyDate(stats.peakDay.date), commits: stats.peakDay.count },
    worstCommitMessage: stats.worstMessage?.message ?? null,
    busiest: `${dowName(stats.busiestDow.dow)} ${hourLabel(stats.busiestHour.hour)}`,
    topContributor: stats.topContributor
      ? { name: stats.topContributor.name, share: Math.round(stats.topContributor.share * 100) }
      : null,
    weekendShare: Math.round(stats.weekendShare * 100),
    nightShare: Math.round(stats.nightShare * 100),
  };
  return [
    "Here are the precomputed, already-correct stats for this repo:",
    JSON.stringify(facts),
    "",
    "Write one caption for each key. Respond as JSON with exactly these keys:",
    '{"intro","commits","threeAm","streak","torturedFile","peakDay","worstMessage","busiest","topContributor","personality","archetypeName"}',
    "archetypeName is the payoff: a 2 to 4 word coding-personality title you INVENT fresh from this repo's specific numbers. Make it genuinely funny, specific, and a little unhinged. Surprise me. Avoid safe, generic titles like The Coder, The Developer, The Steady Hand, The Night Owl. Lean into whatever stat stands out most (the 3am commits, the one tortured file, the Friday deploys, the solo bus factor, the worst message). personality is one dry, roasting line that justifies the title.",
  ].join("\n");
}

function extractJson(text: string): Record<string, string> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function runViaRest(
  env: CaptionEnv,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string | null> {
  if (!env.CF_ACCOUNT_ID || !env.CF_AI_GATEWAY || !env.CF_API_TOKEN) return null;
  const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY}/workers-ai/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.CF_API_TOKEN}`,
    },
    body: JSON.stringify({ messages, max_tokens: 500, temperature: 0.85 }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: { response?: string }; response?: string };
  return data.result?.response ?? data.response ?? null;
}

export interface GenerateResult {
  quips: Quips;
  source: "model" | "fallback";
  model?: string;
}

/**
 * ONE batched model call per repo (PRD 6.2 step 3), routed through AI Gateway
 * with caching on. Any failure or missing config degrades to the deterministic
 * fallback so the story always renders.
 */
export async function generateQuips(
  stats: RepoStats,
  opts: { aiRun?: AiRunner; env?: CaptionEnv } = {}
): Promise<GenerateResult> {
  const fallback = buildFallbackQuips(stats);
  const env = opts.env ?? {};
  const model = env.WRAP_MODEL || DEFAULT_MODEL;
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: buildUserPrompt(stats) },
  ];

  let raw: string | null = null;
  try {
    if (opts.aiRun) {
      const out = await opts.aiRun(model, { messages, max_tokens: 500, temperature: 0.85 });
      raw = typeof out === "string" ? out : out.response ?? null;
    } else {
      raw = await runViaRest(env, model, messages);
    }
  } catch {
    raw = null;
  }

  if (!raw) return { quips: fallback, source: "fallback" };

  const parsed = extractJson(raw);
  if (!parsed) return { quips: fallback, source: "fallback" };

  // Merge: take the model's line where present and non-empty, else fallback.
  // Sanitize everything regardless of what the model returned.
  const merged: Quips = { ...fallback };
  (Object.keys(fallback) as (keyof Quips)[]).forEach((key) => {
    const v = parsed[key];
    if (typeof v === "string" && v.trim()) {
      merged[key] = key === "archetypeName" ? sanitizeName(v) : sanitizeLine(v);
    }
  });

  // If the model produced nothing usable, treat as fallback for honesty.
  const usedModel = (Object.keys(fallback) as (keyof Quips)[]).some(
    (k) => typeof parsed[k] === "string" && parsed[k].trim()
  );
  return usedModel
    ? { quips: merged, source: "model", model }
    : { quips: fallback, source: "fallback" };
}
