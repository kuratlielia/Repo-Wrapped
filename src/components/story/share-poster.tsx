"use client";

import * as React from "react";
import type { WrappedResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PosterFormat = "x" | "portrait" | "square";

/** CSSProperties that also permits `--custom` properties. */
type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

/**
 * The light palette, mirrored from globals.css `:root`. Applied inline when a
 * light poster is exported off-screen: the base `.dark {}` block only declares
 * vars on the document root and everything else inherits, so a light override
 * on the poster wrapper cascades to the whole card even under a dark ancestor.
 */
const LIGHT_VARS: CSSVars = {
  colorScheme: "light",
  "--background": "oklch(0.994 0 0)",
  "--foreground": "oklch(0.17 0 0)",
  "--surface": "oklch(1 0 0)",
  "--surface-foreground": "oklch(0.17 0 0)",
  "--muted": "oklch(0.968 0 0)",
  "--muted-foreground": "oklch(0.44 0 0)",
  "--subtle": "oklch(0.92 0 0)",
  "--border": "oklch(0.9 0 0)",
  "--border-strong": "oklch(0.82 0 0)",
  "--accent": "oklch(0.522 0.185 257.7)",
  "--accent-foreground": "oklch(0.99 0.01 257)",
  "--accent-quiet": "oklch(0.522 0.185 257.7 / 0.12)",
  "--ring": "oklch(0.522 0.185 257.7 / 0.5)",
};

export interface SharePosterProps {
  result: WrappedResult;
  /** "x" = 16:9 landscape (X-optimized, default), "portrait" = 4:5, "square" = 1:1. */
  format?: PosterFormat;
  /** Force a palette regardless of the site theme (used by off-screen exports). */
  theme?: "light" | "dark";
  className?: string;
  /** Stable id on the export root so the image module can target it. */
  id?: string;
}

/** Human window label, e.g. "last 12 months". */
function windowLabel(months: number): string {
  if (months === 12) return "last 12 months";
  if (months % 12 === 0) {
    const y = months / 12;
    return `last ${y} ${y === 1 ? "year" : "years"}`;
  }
  return `last ${months} months`;
}

/**
 * The oversized, ghosted commit count for the background. Falls back to the
 * first summary stat so there is always a confident numeral bleeding off-edge.
 */
function ghostNumeral(result: WrappedResult): string {
  const commits = result.cards.find((c) => c.kind === "commits");
  if (commits?.headline) return commits.headline;
  return result.summary.stats[0]?.value ?? result.summary.archetype;
}

/**
 * Abstract decorative layer, captured by html-to-image. Kept behind content at
 * low opacity so text stays crisp and high-contrast in both themes:
 *  - a very large ghosted numeral of the commit count bleeding off an edge,
 *  - thin concentric arcs in the accent tucked into a corner,
 *  - a faint hairline dotted matrix across the whole surface.
 */
function Decor({ format, numeral }: { format: PosterFormat; numeral: string }) {
  const landscape = format === "x";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Hairline dotted matrix */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--border-strong) 1px, transparent 1px)",
          backgroundSize: landscape ? "26px 26px" : "22px 22px",
          opacity: 0.4,
        }}
      />

      {/* Concentric accent arcs, tucked beyond a corner */}
      <svg
        viewBox="0 0 240 240"
        className={cn(
          "absolute",
          landscape ? "right-[-70px] top-[-70px] h-[300px] w-[300px]" : "right-[-58px] top-[-58px] h-[230px] w-[230px]"
        )}
        style={{ opacity: 0.16 }}
      >
        <g fill="none" stroke="var(--accent)" strokeWidth={1.5}>
          <circle cx={120} cy={120} r={48} />
          <circle cx={120} cy={120} r={84} />
          <circle cx={120} cy={120} r={120} />
        </g>
      </svg>

      {/* Oversized ghost numeral, bleeding off the bottom edge, behind content */}
      <span
        className="font-heading absolute font-semibold leading-none tnum"
        style={{
          color: "var(--accent)",
          opacity: 0.06,
          bottom: landscape ? "-0.24em" : "-0.18em",
          left: landscape ? "-0.06em" : "-0.04em",
          fontSize: landscape ? "20rem" : "15rem",
          letterSpacing: "-0.05em",
          whiteSpace: "nowrap",
        }}
      >
        {numeral}
      </span>
    </div>
  );
}

/** A connected strip/grid of summary stats: cells share borders, read as one unit. */
function StatBlock({
  stats,
  orientation,
}: {
  stats: WrappedResult["summary"]["stats"];
  orientation: "row" | "grid";
}) {
  if (orientation === "row") {
    // Landscape: a full-height vertical stack down the right rail.
    return (
      <div className="flex h-full flex-col">
        {stats.map((stat, i) => (
          <div
            key={stat.label + i}
            className={cn(
              "flex flex-1 flex-col justify-center gap-1.5 px-9",
              i !== 0 && "border-t border-border"
            )}
          >
            <span className="font-heading text-[2.1rem] font-semibold leading-none tnum">
              {stat.value}
            </span>
            <span className="text-[0.95rem] text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
    );
  }

  // Portrait / square: a connected 2-column grid.
  return (
    <div className="grid grid-cols-2 border-t border-border">
      {stats.map((stat, i) => {
        const isLeftCol = i % 2 === 0;
        const isTopRow = i < 2;
        return (
          <div
            key={stat.label + i}
            className={cn(
              "flex flex-col gap-1.5 p-7",
              !isLeftCol && "border-l border-border",
              !isTopRow && "border-t border-border"
            )}
          >
            <span className="font-heading text-[1.9rem] font-semibold leading-none tnum">
              {stat.value}
            </span>
            <span className="text-[0.95rem] text-muted-foreground">{stat.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The hero share artifact. A confidently art-directed developer "wrapped" card,
 * postable standalone and stunning in both light and dark. The landscape "x"
 * format is the primary, X-optimized layout (horizontal split); portrait and
 * square stack vertically. Rendered off-screen by the image module, optionally
 * forcing a palette via `theme`; an explicit solid `bg-background` guarantees a
 * non-transparent export.
 */
export const SharePoster = React.forwardRef<HTMLDivElement, SharePosterProps>(
  function SharePoster(
    { result, format = "x", theme, className, id = "share-poster" },
    ref
  ) {
    const stats = result.summary.stats;
    const numeral = ghostNumeral(result);
    const win = windowLabel(result.windowMonths);

    // Theme forcing for off-screen export: dark adds the `.dark` class (its vars
    // then cascade to the card); light re-declares the light palette inline so it
    // wins even when an ancestor is `.dark`. Undefined inherits the site theme.
    const wrapperClass = theme === "dark" ? "dark" : undefined;
    const wrapperStyle: CSSVars | undefined = theme === "light" ? LIGHT_VARS : undefined;

    if (format === "x") {
      return (
        <div className={wrapperClass} style={wrapperStyle}>
          <div
            ref={ref}
            id={id}
            data-export-card
            className={cn(
              "relative aspect-video w-full max-w-[1120px] overflow-hidden rounded-2xl border border-border bg-background text-foreground",
              className
            )}
          >
            <Decor format="x" numeral={numeral} />

            <div className="relative z-10 flex h-full">
              {/* Left rail: wordmark, hero, footer */}
              <div className="flex flex-[1.4] flex-col justify-between p-12">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                  <span className="text-[0.95rem] font-medium text-muted-foreground">
                    Repo Wrapped
                  </span>
                </div>

                <div className="flex flex-col gap-5">
                  <h1 className="font-heading text-[3.4rem] font-semibold leading-[1.02] text-balance">
                    {result.repo}
                  </h1>
                  <div className="flex flex-col gap-3">
                    <p className="font-heading text-[1.6rem] font-semibold text-accent">
                      {result.summary.archetype}
                    </p>
                    <span className="h-[3px] w-16 rounded-full bg-accent" />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[0.95rem]">
                  <span className="font-medium text-foreground">{result.owner}</span>
                  <span className="h-1 w-1 rounded-full bg-border-strong" />
                  <span className="text-muted-foreground">{win}</span>
                </div>
              </div>

              {/* Right rail: full-height stat strip */}
              <div className="flex-1 border-l border-border">
                <StatBlock stats={stats} orientation="row" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Portrait (4:5) and square (1:1): a vertical stack.
    const aspect = format === "square" ? "aspect-square" : "aspect-[4/5]";
    return (
      <div className={wrapperClass} style={wrapperStyle}>
        <div
          ref={ref}
          id={id}
          data-export-card
          className={cn(
            "relative flex w-full max-w-[520px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background text-foreground",
            aspect,
            className
          )}
        >
          <Decor format={format} numeral={numeral} />

          {/* Header */}
          <div className="relative z-10 flex flex-col gap-5 p-9 pb-7">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="text-[0.95rem] font-medium text-muted-foreground">
                Repo Wrapped
              </span>
            </div>
            <h1 className="font-heading text-[2.8rem] font-semibold leading-[1.03] text-balance">
              {result.repo}
            </h1>
            <div className="flex flex-col gap-3">
              <p className="font-heading text-[1.4rem] font-semibold text-accent">
                {result.summary.archetype}
              </p>
              <span className="h-[3px] w-14 rounded-full bg-accent" />
            </div>
          </div>

          {/* Connected stat grid */}
          <div className="relative z-10 mt-auto">
            <StatBlock stats={stats} orientation="grid" />

            {/* Footer wordmark */}
            <div className="flex items-center justify-between border-t border-border px-9 py-5 text-[0.95rem]">
              <span className="font-medium text-foreground">{result.owner}</span>
              <span className="text-muted-foreground">{win}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
