import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact number formatting for stat labels, e.g. 12483 -> "12,483". */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** A short ordinal, e.g. 1 -> "1st". */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
