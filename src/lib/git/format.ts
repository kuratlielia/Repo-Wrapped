// One shared git-log format string, parsed identically by the Node engine
// (child_process) and the Cloudflare Workspace engine (worker-shell `git`).
//
// Field separator: US (\x1f). Record separator: RS (\x1e).
// %aI is the author date in strict ISO-8601 WITH the author's tz offset, so the
// "3am club" and busiest-hour numbers reflect the author's own wall clock.

export const RS = "\x1e";
export const US = "\x1f";

// Leading RS starts each record; --name-only appends file paths on the lines
// that follow the header line, until the next RS.
export const LOG_PRETTY = `${RS}%H${US}%an${US}%ae${US}%aI${US}%s`;

/** Build the argv for the archaeology log call, scoped to the time window. */
export function logArgs(sinceIso: string): string[] {
  return [
    "log",
    `--since=${sinceIso}`,
    "--no-color",
    "--name-only",
    `--pretty=format:${LOG_PRETTY}`,
  ];
}
