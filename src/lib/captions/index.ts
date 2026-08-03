import type { RepoStats } from "@/lib/types";
import { dowName, hourLabel, prettyDate } from "@/lib/labels";
import { buildFallbackQuips, type Quips } from "./fallback";
import { sanitizeLine, sanitizeName } from "./sanitize";

// A Workers-AI-shaped runner. The Durable Object hands us `env.AI.run` bound
// with an AI Gateway id; locally we fall back to the Gateway REST endpoint.
export type AiRunner = (
  model: string,
  input: {
    messages: { role: string; content: string }[];
    max_tokens?: number;
    temperature?: number;
    response_format?: unknown;
  }
) => Promise<{ response?: string } | string>;

// The 11 caption keys, as a JSON schema for Workers AI guided generation. This
// forces the model to emit exactly-shaped, valid JSON (no more malformed output
// from small models).
const QUIP_KEYS = [
  "intro",
  "commits",
  "threeAm",
  "streak",
  "torturedFile",
  "peakDay",
  "worstMessage",
  "busiest",
  "topContributor",
  "personality",
  "archetypeName",
] as const;

const QUIP_SCHEMA = {
  type: "json_schema",
  json_schema: {
    type: "object",
    properties: Object.fromEntries(QUIP_KEYS.map((k) => [k, { type: "string" }])),
    required: [...QUIP_KEYS],
  },
} as const;

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
  "- One complete, witty sentence per caption. Short, under 140 characters. Never just echo a number or a single word.",
  "- Never invent numbers. Only riff on the stats provided. The numbers are already correct.",
  "- Keep it clean: no profanity, no slurs, no sexual content, no insults about a person. Roast the code and the habits, not the human.",
  "Return ONLY compact JSON, no prose, no code fences.",
].join("\n");

// A short banned list; anything matching is rejected and falls back per key.
const BANNED = /\b(wh0re|whore|slut|bitch|f+u+c+k|sh[i1]t|cunt|d[i1]ck|cock|n[i1]gg|fag|retard|rape|damn|bastard)\b/i;

/**
 * Is a model-produced line good enough to use, or should we keep the
 * deterministic fallback for this key? Guards against echoed numbers, one-word
 * answers, and anything off-brand or unsafe.
 */
function acceptableQuip(key: keyof Quips, value: string): boolean {
  const v = value.trim();
  if (!v || BANNED.test(v)) return false;
  if (key === "archetypeName") {
    const words = v.split(/\s+/).length;
    return v.length >= 3 && v.length <= 42 && words >= 1 && words <= 5 && !/^\d/.test(v);
  }
  // A real caption: has a space, is not just a number/percent, reads like a sentence.
  if (v.length < 16 || !/\s/.test(v)) return false;
  if (/^[\d.,%\s]+$/.test(v)) return false;
  return true;
}

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
  // Strip markdown code fences some models wrap JSON in, then take the widest
  // brace span and parse it.
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch {
    // Tolerate trailing commas, a common small-model slip.
    try {
      return JSON.parse(t.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
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
    body: JSON.stringify({
      messages,
      max_tokens: 700,
      temperature: 0.7,
      response_format: QUIP_SCHEMA,
    }),
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
      const out = await opts.aiRun(model, {
        messages,
        max_tokens: 700,
        temperature: 0.7,
        response_format: QUIP_SCHEMA,
      });
      // With guided JSON, `response` may come back as a string or an already
      // parsed object; normalize both to a JSON string for extractJson.
      const r = typeof out === "string" ? out : out.response;
      raw = typeof r === "string" ? r : r != null ? JSON.stringify(r) : null;
    } else {
      raw = await runViaRest(env, model, messages);
    }
  } catch {
    raw = null;
  }

  if (!raw) return { quips: fallback, source: "fallback" };

  const parsed = extractJson(raw);
  if (!parsed) return { quips: fallback, source: "fallback" };

  // Merge per key: take the model's line only if it clears the quality/safety
  // bar, else keep the deterministic fallback for that key. Sanitize regardless.
  const merged: Quips = { ...fallback };
  let acceptedCount = 0;
  (Object.keys(fallback) as (keyof Quips)[]).forEach((key) => {
    const v = parsed[key];
    if (typeof v === "string" && acceptableQuip(key, v)) {
      merged[key] = key === "archetypeName" ? sanitizeName(v) : sanitizeLine(v);
      acceptedCount += 1;
    }
  });

  // Only call it a model result if enough lines actually landed; otherwise the
  // deterministic story (which is already good) is the honest label.
  return acceptedCount >= 4
    ? { quips: merged, source: "model", model }
    : { quips: fallback, source: "fallback" };
}
