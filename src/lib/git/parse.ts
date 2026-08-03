import { RS, US } from "./format";
import type { RawCommit } from "@/lib/types";

/**
 * Parse the raw stdout of `git log --name-only --pretty=format:<LOG_PRETTY>`
 * into structured commits. Pure and deterministic. Tolerant of trailing
 * whitespace and the empty segment before the first record separator.
 */
export function parseGitLog(stdout: string): RawCommit[] {
  const commits: RawCommit[] = [];
  const records = stdout.split(RS);

  for (const record of records) {
    if (!record.trim()) continue;

    const newline = record.indexOf("\n");
    const headerLine = newline === -1 ? record : record.slice(0, newline);
    const rest = newline === -1 ? "" : record.slice(newline + 1);

    const fields = headerLine.split(US);
    if (fields.length < 5) continue;

    const [hash, authorName, authorEmail, iso, ...messageParts] = fields;
    // Subject can, in theory, contain no US chars; rejoin defensively.
    const message = messageParts.join(US).trim();

    const files = rest
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (!hash || !iso) continue;

    commits.push({
      hash: hash.trim(),
      authorName: (authorName || "Unknown").trim(),
      authorEmail: (authorEmail || "").trim(),
      iso: iso.trim(),
      message,
      files,
    });
  }

  return commits;
}

/** Extract local hour (0-23) from a strict ISO-8601 string with offset. */
export function localHour(iso: string): number {
  // "2024-03-05T02:13:44+01:00" -> hour is chars 11..13, already local.
  const h = Number(iso.slice(11, 13));
  return Number.isFinite(h) ? h : 0;
}

/** Extract the local calendar date (YYYY-MM-DD) from an ISO string. */
export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD date, tz-safe via UTC math. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
