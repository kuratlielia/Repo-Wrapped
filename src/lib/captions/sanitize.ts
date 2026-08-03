// The design rules ban emojis and em dashes everywhere, including generated
// copy (PRD 7.4). We instruct the model, and then we enforce it anyway.

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}️‍]/gu;

export function sanitizeLine(input: string): string {
  let s = input ?? "";
  s = s.replace(EMOJI, "");
  // Em dash / en dash / horizontal bar -> comma. Keep the sentence readable.
  s = s.replace(/\s*[—–―]\s*/g, ", ");
  // Collapse any doubled punctuation the swap may create.
  s = s.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ");
  s = s.replace(/^["'\s]+|["'\s]+$/g, "");
  return s.trim();
}

export function sanitizeName(input: string): string {
  // Archetype names: same rules, but keep it title-ish and short.
  return sanitizeLine(input).replace(/[.]+$/, "").slice(0, 42).trim();
}
