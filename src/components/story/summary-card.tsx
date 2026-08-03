"use client";

import * as React from "react";
import type { WrappedResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SummaryCardProps {
  result: WrappedResult;
  /** Force a palette regardless of the site theme (used by off-screen exports). */
  theme?: "light" | "dark";
  /** Aspect ratio of the shareable artifact. */
  variant?: "portrait" | "square";
  className?: string;
  /** Stable id on the export root so the image module can target it. */
  id?: string;
}

/**
 * The shareable hero summary. Self-contained and postable standalone: a solid
 * background, the repo name, the highlighted archetype, and a connected grid of
 * stats with shared borders. Exported so the image module can render it
 * off-screen, optionally forcing light/dark via the `theme` prop.
 */
export const SummaryCard = React.forwardRef<HTMLDivElement, SummaryCardProps>(
  function SummaryCard(
    { result, theme, variant = "portrait", className, id = "summary-card" },
    ref
  ) {
    const stats = result.summary.stats;
    // Pad to an even count so the 2-col grid always reads as a full rectangle.
    const forcedTheme = theme
      ? theme === "dark"
        ? "dark"
        : ""
      : undefined; // undefined = inherit the site theme

    const aspect = variant === "square" ? "aspect-square" : "aspect-[4/5]";

    return (
      <div className={cn(forcedTheme)}>
        <div
          ref={ref}
          id={id}
          className={cn(
            "flex w-full max-w-[440px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-background text-foreground",
            aspect,
            className
          )}
        >
          {/* Header */}
          <div className="flex flex-col gap-3 p-7 pb-5">
            <span className="text-sm font-medium text-muted-foreground">
              Repo Wrapped
            </span>
            <h3 className="font-heading text-[clamp(1.75rem,7vw,2.5rem)] font-semibold leading-[1.05] text-balance">
              {result.repo}
            </h3>
            <p className="font-heading text-lg font-semibold text-accent">
              {result.summary.archetype}
            </p>
          </div>

          {/* Connected stat grid: cells share borders, no gaps. */}
          <div className="grid grid-cols-2 border-t border-border">
            {stats.map((stat, i) => {
              const isLeftCol = i % 2 === 0;
              const isTopRow = i < 2;
              return (
                <div
                  key={stat.label + i}
                  className={cn(
                    "flex flex-col gap-1 p-6",
                    !isLeftCol && "border-l border-border",
                    !isTopRow && "border-t border-border"
                  )}
                >
                  <span className="font-heading text-[1.75rem] font-semibold leading-none tnum">
                    {stat.value}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer wordmark */}
          <div className="flex items-center justify-between border-t border-border px-7 py-4">
            <span className="text-sm font-medium text-foreground">
              Repo Wrapped
            </span>
            <span className="text-sm text-muted-foreground">
              {result.owner}
            </span>
          </div>
        </div>
      </div>
    );
  }
);
