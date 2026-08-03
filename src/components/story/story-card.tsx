"use client";

import * as React from "react";
import { motion } from "motion/react";
import type { Card } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Kinds whose hero is a NUMBER and gets the accent treatment. */
const ACCENT_NUMBER_KINDS = new Set<Card["kind"]>(["commits", "threeAm", "streak"]);

/** Kinds whose headline is TEXT, not a number, so they size down. */
function heroSizeClass(card: Card): string {
  switch (card.kind) {
    case "worstMessage":
      // A quoted message: reads as text, wraps, noticeably smaller.
      return "text-[clamp(1.6rem,4.5vw,2.6rem)] leading-[1.15]";
    case "intro":
    case "personality":
      // Repo name / archetype: prominent but text-shaped.
      return "text-[clamp(2.5rem,8vw,5rem)] leading-[1.05]";
    case "torturedFile":
    case "topContributor":
    case "busiest":
      return "text-[clamp(2.25rem,7vw,4.25rem)] leading-[1.08]";
    default:
      // Numeric heroes: very large.
      return "text-[clamp(3.5rem,12vw,8rem)] leading-[0.95]";
  }
}

export interface StoryCardProps {
  card: Card;
  active: boolean;
  reduce: boolean;
}

export function StoryCard({ card, active, reduce }: StoryCardProps) {
  const hasNumber = typeof card.headlineNumber === "number";
  // Only count up when this card is on screen; reduced motion shows final value.
  const countEnabled = hasNumber && active && !reduce;
  const counted = useCountUp(hasNumber ? (card.headlineNumber as number) : 0, {
    enabled: countEnabled,
  });

  const heroText = hasNumber ? formatNumber(counted) : card.headline;
  const accentHero = ACCENT_NUMBER_KINDS.has(card.kind);

  // Stagger: hero lands first, quip a beat later. Skipped under reduced motion.
  const heroAnim = reduce
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: active ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
      };
  const quipAnim = reduce
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
      };

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-[620px] flex-col items-center gap-6 text-center">
        {/* Calm label */}
        <motion.p
          {...heroAnim}
          transition={{ duration: 0.32, ease: EASE_OUT }}
          className="text-sm font-medium text-muted-foreground sm:text-base"
        >
          {card.label}
        </motion.p>

        {/* Hero */}
        <motion.h2
          {...heroAnim}
          transition={{ duration: 0.32, ease: EASE_OUT, delay: reduce ? 0 : 0.04 }}
          className={cn(
            "font-heading font-semibold text-balance",
            heroSizeClass(card),
            hasNumber && "tnum",
            accentHero ? "text-accent" : "text-foreground"
          )}
          style={{ willChange: "transform, opacity" }}
        >
          {card.headlinePrefix && (
            <span className="align-middle text-[0.45em] font-medium text-muted-foreground">
              {card.headlinePrefix}{" "}
            </span>
          )}
          <span className={cn(hasNumber && "tabular-nums")}>{heroText}</span>
          {card.headlineSuffix && (
            <span className="ml-3 align-baseline text-[0.32em] font-medium text-muted-foreground">
              {card.headlineSuffix}
            </span>
          )}
        </motion.h2>

        {/* Detail line */}
        {card.detail && (
          <motion.p
            {...heroAnim}
            transition={{ duration: 0.32, ease: EASE_OUT, delay: reduce ? 0 : 0.08 }}
            className="text-base text-muted-foreground"
          >
            {card.detail}
          </motion.p>
        )}

        {/* Quip, revealed a beat after the hero */}
        <motion.p
          {...quipAnim}
          transition={{
            duration: 0.34,
            ease: EASE_OUT,
            delay: reduce ? 0 : 0.16,
          }}
          className="mt-2 max-w-[34ch] text-[1.2rem] leading-snug text-foreground text-pretty"
        >
          {card.quip}
        </motion.p>
      </div>
    </div>
  );
}
