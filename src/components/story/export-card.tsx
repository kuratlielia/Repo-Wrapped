"use client";

import * as React from "react";
import type { Card } from "@/lib/types";
import { cn } from "@/lib/utils";

// A static, framed, standalone-postable version of a single story card. It
// reuses the exact design tokens and hero-sizing rules of the on-screen
// StoryCard (PRD 9.3: "do not ship a second, uglier template"), minus the
// motion, so what people see is what they share. Rendered off-screen by the
// image export, optionally forcing light/dark via `theme`.

const ACCENT_NUMBER_KINDS = new Set<Card["kind"]>(["commits", "threeAm", "streak"]);

function heroSizeClass(card: Card): string {
  switch (card.kind) {
    case "worstMessage":
      return "text-[2.4rem] leading-[1.15]";
    case "intro":
    case "personality":
      return "text-[3.4rem] leading-[1.03]";
    case "torturedFile":
    case "topContributor":
    case "busiest":
      return "text-[3rem] leading-[1.06]";
    default:
      return "text-[5.5rem] leading-[0.95]";
  }
}

export interface ExportCardProps {
  card: Card;
  owner: string;
  theme?: "light" | "dark";
  variant?: "portrait" | "square";
  id?: string;
}

export function ExportCard({
  card,
  owner,
  theme,
  variant = "portrait",
  id,
}: ExportCardProps) {
  const forcedTheme = theme ? (theme === "dark" ? "dark" : "") : undefined;
  const aspect = variant === "square" ? "aspect-square" : "aspect-[4/5]";
  const hasNumber = typeof card.headlineNumber === "number";
  const accentHero = ACCENT_NUMBER_KINDS.has(card.kind);

  return (
    <div className={cn(forcedTheme)}>
      <div
        id={id}
        data-export-card
        className={cn(
          "flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground",
          aspect
        )}
      >
        {/* Body: mirrors the on-screen card layout, centered. */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-9 text-center">
          <p className="text-base font-medium text-muted-foreground">{card.label}</p>

          <h2
            className={cn(
              "font-heading font-semibold text-balance",
              heroSizeClass(card),
              hasNumber && "tnum",
              accentHero ? "text-accent" : "text-foreground"
            )}
          >
            {card.headlinePrefix && (
              <span className="align-middle text-[0.45em] font-medium text-muted-foreground">
                {card.headlinePrefix}{" "}
              </span>
            )}
            <span>{card.headline}</span>
            {card.headlineSuffix && (
              <span className="ml-2 align-baseline text-[0.32em] font-medium text-muted-foreground">
                {card.headlineSuffix}
              </span>
            )}
          </h2>

          {card.detail && (
            <p className="text-base text-muted-foreground">{card.detail}</p>
          )}

          <p className="mt-1 max-w-[32ch] text-[1.15rem] leading-snug text-foreground text-pretty">
            {card.quip}
          </p>
        </div>

        {/* Footer wordmark so every exported card is postable on its own. */}
        <div className="flex items-center justify-between border-t border-border px-9 py-5">
          <span className="text-sm font-medium text-foreground">Repo Wrapped</span>
          <span className="text-sm text-muted-foreground">{owner}</span>
        </div>
      </div>
    </div>
  );
}
