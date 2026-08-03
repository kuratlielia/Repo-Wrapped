// Minimal share helpers. Another agent may replace the image-based exports
// (downloadSummary, copyImage, exportCarousel) with real html-to-image
// implementations; the story/share UI guards every call with `typeof` so
// these stubs are safe to ship as-is.

import type { WrappedResult } from "./types";

/** Public URL of the app, best-effort from the current location. */
export function appUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://repo-wrapped.workers.dev";
}

/** Pull the single most postable stat, e.g. "12,483 commits". */
export function topStat(result: WrappedResult): string {
  const stat = result.summary.stats[0];
  if (!stat) return result.summary.archetype;
  return `${stat.value} ${stat.label.toLowerCase()}`;
}

/** Compose the dry, specific share line. No emoji, no em dash. */
export function shareText(result: WrappedResult): string {
  return `My year in ${result.repo}: ${topStat(result)}. Wrapped by Repo Wrapped.`;
}

/** A clean, shareable deep link that reopens this exact wrap and auto-starts it. */
export function wrapUrl(result: WrappedResult): string {
  return `${appUrl()}/?repo=${result.owner}/${result.name}`;
}

/** Open the X (Twitter) intent with pre-filled text and the deep link. */
export function shareToX(result: WrappedResult): void {
  if (typeof window === "undefined") return;
  const intent = new URL("https://twitter.com/intent/tweet");
  intent.searchParams.set("text", shareText(result));
  intent.searchParams.set("url", wrapUrl(result));
  window.open(intent.toString(), "_blank", "noopener,noreferrer");
}

/** Copy the deep link to this wrap to the clipboard. Returns true on success. */
export async function copyLink(result: WrappedResult): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(wrapUrl(result));
    return true;
  } catch {
    return false;
  }
}

// --- Image-based exports ---
// Real implementations live in `export-image` (client-only, html-to-image).
// They are imported lazily so the heavy rasterization code and React DOM
// rendering only load when someone actually exports, keeping the story bundle
// lean. Every call is still safe to invoke from guarded UI handlers.

/** Share image options: theme, and the poster format (X landscape by default). */
export interface ShareImageOptions {
  theme?: "light" | "dark";
  format?: "x" | "portrait" | "square";
  variant?: "portrait" | "square";
}

/** Download the hero share poster (X-optimized) matching the on-screen design. */
export async function downloadSummary(
  result: WrappedResult,
  opts?: ShareImageOptions
): Promise<void> {
  const { downloadSummary: run } = await import("./export-image");
  await run(result, opts);
}

/** Copy the share poster image straight to the clipboard. */
export async function copyImage(
  result: WrappedResult,
  opts?: ShareImageOptions
): Promise<boolean> {
  const { copyImage: run } = await import("./export-image");
  return run(result, opts);
}

/** Export the selected story cards as a set of postable images. */
export async function exportCarousel(
  result: WrappedResult,
  cardKinds?: string[],
  opts?: ShareImageOptions
): Promise<void> {
  const { exportCarousel: run } = await import("./export-image");
  await run(result, cardKinds, opts);
}
