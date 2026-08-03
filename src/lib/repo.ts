import type { WrapError } from "./types";

export interface ParsedRepo {
  owner: string;
  name: string;
  slug: string; // "owner/name"
  cloneUrl: string; // https clone url
}

/**
 * Accepts the many shapes people paste: full URLs, git@ SSH, "owner/name",
 * with or without .git, with trailing slashes or extra path segments.
 */
export function parseRepoInput(raw: string): ParsedRepo | WrapError {
  const input = raw.trim();
  if (!input) {
    return { ok: false, reason: "invalid_url", message: "Paste a GitHub repo URL to begin." };
  }

  let owner = "";
  let name = "";

  const ssh = input.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  const url = input.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  const short = input.match(/^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*?)(?:\.git)?\/?$/);

  if (ssh) {
    owner = ssh[1];
    name = ssh[2];
  } else if (url) {
    owner = url[1];
    name = url[2];
  } else if (short) {
    owner = short[1];
    name = short[2];
  } else {
    return {
      ok: false,
      reason: "invalid_url",
      message: "That does not look like a GitHub repo. Try a link like github.com/owner/name.",
    };
  }

  name = name.replace(/\.git$/i, "").replace(/\/$/, "");
  owner = owner.replace(/\/$/, "");

  if (!owner || !name) {
    return { ok: false, reason: "invalid_url", message: "Could not read the owner and repo name." };
  }

  return {
    owner,
    name,
    slug: `${owner}/${name}`,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
  };
}

export function isParsedRepo(v: ParsedRepo | WrapError): v is ParsedRepo {
  return (v as WrapError).ok !== false;
}

/** The default Wrapped window: the last N months, as ISO dates. */
export function windowRange(months = 12, now = new Date()): {
  months: number;
  startIso: string;
  endIso: string;
} {
  const end = now;
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  return {
    months,
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}
