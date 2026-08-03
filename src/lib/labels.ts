// Human-readable labels for computed stats. Kept out of the stats module so
// the numbers stay pure and the wording stays in one place.

const DOW_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dowName(dow: number): string {
  return DOW_LONG[dow] ?? "Sunday";
}

/** 0 -> "12am", 13 -> "1pm", 23 -> "11pm". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** "2024-03-05" -> "March 5, 2024". */
export function prettyDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2024-03-05" -> "Mar 5". */
export function shortDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
