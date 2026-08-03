"use client";

// Client-only image export. Renders the real share components off-screen and
// rasterizes them with html-to-image, so exports match the on-screen design
// exactly (same fonts, spacing, accent, theme). The hero downloadable is the
// landscape SharePoster (X-optimized); individual story cards use ExportCard.
// Offers light and dark variants (PRD 9.3).

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toBlob } from "html-to-image";
import { SharePoster, type PosterFormat } from "@/components/story/share-poster";
import { ExportCard } from "@/components/story/export-card";
import type { Card, WrappedResult } from "./types";

export type ExportTheme = "light" | "dark";
export type ExportVariant = "portrait" | "square";

function currentTheme(): ExportTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function slugify(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

const nextFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Mount a React element in an off-screen container, wait for fonts + layout,
 * rasterize the card node (the element carrying `data-export-card`), and clean
 * up. `hostWidth` sizes the off-screen host so the poster renders at the right
 * scale (wide for landscape, narrow for portrait/square); render size *
 * pixelRatio is the final pixel width.
 */
async function rasterize(
  element: React.ReactElement,
  opts: { theme: ExportTheme; pixelRatio?: number; hostWidth?: number } = { theme: "light" }
): Promise<Blob> {
  const host = document.createElement("div");
  const width = opts.hostWidth ?? 520;
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);

  let root: Root | null = null;
  try {
    root = createRoot(host);
    root.render(element);

    // Let fonts and layout settle so text metrics are final.
    if (document.fonts?.ready) await document.fonts.ready;
    await nextFrame();

    const target =
      (host.querySelector("[data-export-card]") as HTMLElement | null) ??
      (host.firstElementChild as HTMLElement | null);
    if (!target) throw new Error("export target not found");

    const blob = await toBlob(target, {
      pixelRatio: opts.pixelRatio ?? 3,
      cacheBust: true,
    });
    if (!blob) throw new Error("rasterization produced no blob");
    return blob;
  } finally {
    // Unmount on a microtask to avoid React warnings, then remove the host.
    const r = root;
    setTimeout(() => {
      try {
        r?.unmount();
      } catch {
        /* ignore */
      }
      host.remove();
    }, 0);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Host width + pixel ratio tuned per format for a crisp, social-ready export. */
function renderSpec(format: PosterFormat): { hostWidth: number; pixelRatio: number } {
  // Landscape needs a wide host; 1040 * 2 => ~2080px wide output.
  if (format === "x") return { hostWidth: 1040, pixelRatio: 2 };
  // Portrait / square render crisp from a narrow host; 520 * 3 => ~1560px wide.
  return { hostWidth: 520, pixelRatio: 3 };
}

export interface PosterOptions {
  theme?: ExportTheme;
  format?: PosterFormat;
}

/** Rasterize the hero SharePoster in the chosen format and theme. */
export async function posterBlob(
  result: WrappedResult,
  opts: PosterOptions = {}
): Promise<Blob> {
  const theme = opts.theme ?? currentTheme();
  const format = opts.format ?? "x";
  const el = createElement(SharePoster, { result, theme, format, id: "share-poster" });
  const spec = renderSpec(format);
  return rasterize(el, { theme, ...spec });
}

/**
 * Kept for backwards compatibility. Delegates to the SharePoster; the "portrait"
 * variant maps to the portrait poster, "square" to the square poster.
 */
export async function summaryBlob(
  result: WrappedResult,
  opts: { theme?: ExportTheme; variant?: ExportVariant } = {}
): Promise<Blob> {
  const format: PosterFormat = opts.variant === "square" ? "square" : "portrait";
  return posterBlob(result, { theme: opts.theme, format });
}

export async function downloadSummary(
  result: WrappedResult,
  opts: PosterOptions = {}
): Promise<void> {
  const theme = opts.theme ?? currentTheme();
  const format = opts.format ?? "x";
  const blob = await posterBlob(result, { theme, format });
  triggerDownload(blob, `repo-wrapped-${slugify(result.repo)}-${format}-${theme}.png`);
}

export async function copyImage(
  result: WrappedResult,
  opts: PosterOptions = {}
): Promise<boolean> {
  try {
    const format = opts.format ?? "x";
    const blob = await posterBlob(result, { theme: opts.theme, format });
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Export the selected cards as a set of images (PRD 9.1 carousel export). The
 * same Card[] powers the on-screen story and this export, so they always match.
 * The "summary" kind uses the SharePoster (in the carousel's portrait/square
 * shape); every other kind uses the framed ExportCard.
 */
export async function exportCarousel(
  result: WrappedResult,
  cardKinds?: string[],
  opts: { theme?: ExportTheme; variant?: ExportVariant } = {}
): Promise<void> {
  const theme = opts.theme ?? currentTheme();
  const variant = opts.variant ?? "portrait";
  const posterFormat: PosterFormat = variant === "square" ? "square" : "portrait";
  const wanted = cardKinds && cardKinds.length ? new Set(cardKinds) : null;

  const cards: Card[] = result.cards.filter((c) => (wanted ? wanted.has(c.kind) : true));
  let index = 0;
  for (const card of cards) {
    index += 1;
    if (card.kind === "summary") {
      const el = createElement(SharePoster, {
        result,
        theme,
        format: posterFormat,
        id: "share-poster",
      });
      const spec = renderSpec(posterFormat);
      const blob = await rasterize(el, { theme, hostWidth: spec.hostWidth, pixelRatio: 2 });
      const num = String(index).padStart(2, "0");
      triggerDownload(blob, `repo-wrapped-${slugify(result.repo)}-${num}-${card.kind}.png`);
    } else {
      const el = createElement(ExportCard, { card, owner: result.owner, theme, variant });
      const blob = await rasterize(el, { theme, pixelRatio: 2 });
      const num = String(index).padStart(2, "0");
      triggerDownload(blob, `repo-wrapped-${slugify(result.repo)}-${num}-${card.kind}.png`);
    }
    // Stagger downloads so browsers don't block the batch.
    await new Promise((r) => setTimeout(r, 350));
  }
}
