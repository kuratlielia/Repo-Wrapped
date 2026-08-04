import type { RawCommit, RepoStats } from "@/lib/types";
import { dayOfWeek, localDate, localHour } from "./parse";

const DAY_MS = 86_400_000;

function dateToDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function dayNumberToDate(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Longest run of consecutive calendar days that each have >= 1 commit. */
function longestStreak(dates: Set<string>): RepoStats["longestStreak"] {
  if (dates.size === 0) return { days: 0, start: "", end: "" };
  const days = [...dates].map(dateToDayNumber).sort((a, b) => a - b);

  let best = 1;
  let bestEnd = days[0];
  let run = 1;
  let runStart = days[0];

  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      run++;
    } else if (days[i] === days[i - 1]) {
      continue; // duplicate, ignore
    } else {
      run = 1;
      runStart = days[i];
    }
    if (run > best) {
      best = run;
      bestEnd = days[i];
    }
  }
  void runStart;
  return {
    days: best,
    start: dayNumberToDate(bestEnd - (best - 1)),
    end: dayNumberToDate(bestEnd),
  };
}

const JUNK_EXACT =
  /^(fix|fixed|fixes|fix it|fix this|wip|asdf|asdfasdf|test|tests|testing|temp|tmp|stuff|things|oops|typo|update|updates|updated|changes|change|misc|cleanup|clean up|final|final2|finalv2|done|commit|commits|more|nope|ugh|argh|meh|blah|foo|bar|baz|\.+|\?+|x+)$/i;

const JUNK_CONTAINS =
  /(please work|why (is|does|won'?t)|it works now|should work|i hate|make it stop|no idea|not sure|revert the revert|last commit i swear|for real this time)/i;

/** Score how low-effort a subject is. Higher = worse (more roastable). */
function lowEffortScore(msg: string): number {
  const m = msg.trim();
  if (!m) return 6;
  if (/^(merge |revert )/i.test(m)) return -100; // auto-generated, never funny
  let score = 0;
  const len = m.length;
  if (JUNK_EXACT.test(m)) score += 6;
  if (JUNK_CONTAINS.test(m)) score += 5;
  if (len <= 3) score += 4;
  else if (len <= 6) score += 3;
  else if (len <= 12) score += 1;
  if (!/\s/.test(m) && len <= 8) score += 1;
  if (m === m.toLowerCase() && len <= 15) score += 1;
  if (/^[a-z]+\d*$/i.test(m) && len <= 8) score += 1; // "asdf", "wip2"
  return score;
}

export interface StatsMeta {
  owner: string;
  name: string;
  windowMonths: number;
  windowStart: string;
  windowEnd: string;
  /** Exact total commits when `commits` is only a most-recent sample. */
  knownTotal?: number;
}

export function computeStats(commits: RawCommit[], meta: StatsMeta): RepoStats {
  const sampleSize = commits.length;
  // When we only have a sample (kernel-scale repos read via the GitHub API), the
  // true total comes from the Link header. Absolute counts derived from the
  // sample are scaled up so the story stays internally consistent with it.
  const total = meta.knownTotal && meta.knownTotal > sampleSize ? meta.knownTotal : sampleSize;
  const scale = sampleSize > 0 ? total / sampleSize : 1;

  const byAuthor = new Map<string, number>();
  const byFile = new Map<string, number>();
  const byDate = new Map<string, number>();
  const byHour = new Array<number>(24).fill(0);
  const byDow = new Array<number>(7).fill(0);
  const dates = new Set<string>();

  let threeAmCount = 0;
  let weekendCount = 0;
  let nightCount = 0;

  let worst: { message: string; hash: string; score: number } | null = null;

  for (const c of commits) {
    const hour = localHour(c.iso);
    const date = localDate(c.iso);
    const dow = dayOfWeek(date);

    byAuthor.set(c.authorName, (byAuthor.get(c.authorName) ?? 0) + 1);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
    dates.add(date);
    byHour[hour]++;
    byDow[dow]++;

    if (hour >= 0 && hour < 5) threeAmCount++;
    if (dow === 0 || dow === 6) weekendCount++;
    if (hour >= 20 || hour < 6) nightCount++;

    for (const f of c.files) {
      byFile.set(f, (byFile.get(f) ?? 0) + 1);
    }

    const s = lowEffortScore(c.message);
    if (s > 0 && (!worst || s > worst.score || (s === worst.score && c.message.length < worst.message.length))) {
      worst = { message: c.message, hash: c.hash, score: s };
    }
  }

  // Most-edited single file.
  let torturedFile: RepoStats["torturedFile"] = null;
  for (const [path, edits] of byFile) {
    if (!torturedFile || edits > torturedFile.edits) torturedFile = { path, edits };
  }

  // Peak day.
  let peakDay = { date: meta.windowEnd, count: 0 };
  for (const [date, count] of byDate) {
    if (count > peakDay.count) peakDay = { date, count };
  }

  // Busiest hour / day-of-week.
  let busiestHour = { hour: 0, count: -1 };
  byHour.forEach((count, hour) => {
    if (count > busiestHour.count) busiestHour = { hour, count };
  });
  let busiestDow = { dow: 0, count: -1 };
  byDow.forEach((count, dow) => {
    if (count > busiestDow.count) busiestDow = { dow, count };
  });

  // Top contributor by commit share (share is a rate within the sample).
  let topContributor: RepoStats["topContributor"] = null;
  for (const [name, c] of byAuthor) {
    if (!topContributor || c > topContributor.commits) {
      topContributor = {
        name,
        commits: Math.round(c * scale),
        share: sampleSize ? c / sampleSize : 0,
      };
    }
  }

  return {
    repo: `${meta.owner}/${meta.name}`,
    owner: meta.owner,
    name: meta.name,
    windowMonths: meta.windowMonths,
    windowStart: meta.windowStart,
    windowEnd: meta.windowEnd,
    totalCommits: total,
    contributorCount: byAuthor.size,
    threeAm: {
      count: Math.round(threeAmCount * scale),
      percent: sampleSize ? Math.round((threeAmCount / sampleSize) * 100) : 0,
    },
    longestStreak: longestStreak(dates),
    torturedFile,
    peakDay,
    worstMessage: worst ? { message: worst.message, hash: worst.hash } : null,
    busiestHour: { hour: busiestHour.hour, count: Math.max(0, busiestHour.count) },
    busiestDow: { dow: busiestDow.dow, count: Math.max(0, busiestDow.count) },
    topContributor,
    weekendShare: sampleSize ? weekendCount / sampleSize : 0,
    nightShare: sampleSize ? nightCount / sampleSize : 0,
  };
}
