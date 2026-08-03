"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Share2,
  RotateCcw,
  Download,
  Pause,
  Play,
} from "lucide-react";
import type { WrappedResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { StoryCard } from "./story-card";
import { SummaryCard } from "./summary-card";
import { ShareHub } from "./share-hub";
import * as share from "@/lib/share";

const SLIDE_EASE = [0.23, 1, 0.32, 1] as const;
const SWIPE_OFFSET = 80;
const SWIPE_VELOCITY = 400;
// Story-style auto-advance dwell per card. Hold to pause, like Instagram/IG.
const AUTO_MS = 6500;

export interface StoryProps {
  result: WrappedResult;
  onRestart: () => void;
}

/** Directional slide + fade. `custom` is +1 (next) or -1 (prev). */
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 320 : -320, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -320 : 320, opacity: 0 }),
};

export function Story({ result, onRestart }: StoryProps) {
  const reduce = useReducedMotion();
  const cards = result.cards;
  const count = cards.length;

  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(0);
  const [shareOpen, setShareOpen] = React.useState(false);
  // Hold-to-pause and manual-pause; combined with reduced motion / share sheet.
  const [held, setHeld] = React.useState(false);
  const [manualPause, setManualPause] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  const go = React.useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      if (clamped === index) return;
      setDirection(clamped > index ? 1 : -1);
      setIndex(clamped);
    },
    [count, index]
  );

  const goNext = React.useCallback(() => go(index + 1), [go, index]);
  const goPrev = React.useCallback(() => go(index - 1), [go, index]);

  // Keyboard navigation. Space toggles play/pause; arrows navigate.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shareOpen) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === " ") {
        e.preventDefault();
        setManualPause((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, shareOpen]);

  // Pause the timeline when the tab is hidden.
  React.useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const card = cards[index];
  const isSummary = card.kind === "summary";
  const atStart = index === 0;
  const atEnd = index === count - 1;

  // The timeline plays only when nothing is interrupting it.
  const playing =
    !reduce && !shareOpen && !held && !manualPause && !hidden && !atEnd;

  // Auto-advance. Track the remaining dwell so hold-to-pause resumes cleanly.
  const remainingRef = React.useRef(AUTO_MS);
  React.useEffect(() => {
    remainingRef.current = AUTO_MS;
  }, [index]);
  React.useEffect(() => {
    if (!playing) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(goNext, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(
        400,
        remainingRef.current - (Date.now() - startedAt)
      );
    };
  }, [playing, goNext]);

  const transition = reduce
    ? { duration: 0.18, ease: SLIDE_EASE }
    : { duration: 0.32, ease: SLIDE_EASE };

  const handleDownload = () => {
    if (typeof share.downloadSummary === "function") {
      void share.downloadSummary(result);
    }
  };

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background">
      {/* Progress segments */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-3 sm:px-6">
        <div className="mx-auto flex max-w-[720px] gap-1.5">
          {cards.map((c, i) => {
            const state: "done" | "active" | "upcoming" =
              i < index ? "done" : i === index ? "active" : "upcoming";
            // The active segment fills over the dwell time (a live countdown),
            // unless motion is reduced or we are parked on the summary.
            const timed = state === "active" && !reduce && !atEnd;
            return (
              <button
                key={c.kind + i}
                onClick={() => go(i)}
                aria-label={`Go to ${c.label}`}
                className="focus-ring pointer-events-auto h-1.5 flex-1 overflow-hidden rounded-full bg-border"
              >
                {timed ? (
                  <span
                    key={`fill-${index}`}
                    className="block h-full origin-left rounded-full bg-accent will-change-transform"
                    style={{
                      animationName: "story-fill",
                      animationDuration: `${AUTO_MS}ms`,
                      animationTimingFunction: "linear",
                      animationFillMode: "forwards",
                      animationPlayState: playing ? "running" : "paused",
                    }}
                  />
                ) : (
                  <span
                    className={cn(
                      "block h-full origin-left rounded-full bg-accent",
                      state === "upcoming" ? "scale-x-0" : "scale-x-100"
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top chrome */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-7 sm:px-6">
        <div className="flex items-center gap-1 rounded-full bg-surface/70 px-3 py-1.5 backdrop-blur-md">
          <span className="font-heading text-sm font-semibold">Repo Wrapped</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-surface/70 p-1 backdrop-blur-md">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShareOpen(true)}
            className="gap-1.5"
          >
            <Share2 size={16} />
            Share
          </Button>
          <button
            onClick={onRestart}
            aria-label="Wrap another repo"
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground active:scale-[0.92]"
          >
            <RotateCcw size={17} />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Card stage. Press and hold anywhere to pause the timeline. */}
      <div
        className="relative flex-1"
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={index}
            custom={direction}
            variants={reduce ? undefined : slideVariants}
            initial={reduce ? { opacity: 0 } : "enter"}
            animate={reduce ? { opacity: 1 } : "center"}
            exit={reduce ? { opacity: 0 } : "exit"}
            transition={transition}
            drag={reduce ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              const { offset, velocity } = info;
              if (offset.x < -SWIPE_OFFSET || velocity.x < -SWIPE_VELOCITY) {
                goNext();
              } else if (offset.x > SWIPE_OFFSET || velocity.x > SWIPE_VELOCITY) {
                goPrev();
              }
            }}
            className="absolute inset-0 touch-pan-y"
            style={{ willChange: "transform, opacity" }}
          >
            {isSummary ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-6 py-24">
                <SummaryCard result={result} />
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button variant="primary" onClick={handleDownload} className="gap-2">
                    <Download size={17} />
                    Download
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShareOpen(true)}
                    className="gap-2"
                  >
                    <Share2 size={17} />
                    Share
                  </Button>
                </div>
              </div>
            ) : (
              <StoryCard card={card} active reduce={!!reduce} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Click zones (left third back, right third forward). Sit under buttons. */}
        <button
          aria-label="Previous card"
          onClick={goPrev}
          disabled={atStart}
          className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-default disabled:pointer-events-none"
          tabIndex={-1}
        />
        <button
          aria-label="Next card"
          onClick={goNext}
          disabled={atEnd}
          className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-default disabled:pointer-events-none"
          tabIndex={-1}
        />
      </div>

      {/* Nav arrows */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-4 pb-8 sm:px-8">
        <NavButton
          direction="prev"
          onClick={goPrev}
          disabled={atStart}
          reduce={!!reduce}
        />
        <div className="pointer-events-auto flex items-center gap-2">
          {!atEnd && !reduce && (
            <button
              onClick={() => setManualPause((p) => !p)}
              aria-label={manualPause ? "Play" : "Pause"}
              className="focus-ring grid h-8 w-8 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-muted hover:text-foreground active:scale-[0.92]"
            >
              {manualPause ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
          <span className="text-sm text-muted-foreground tnum">
            {index + 1} / {count}
          </span>
        </div>
        <NavButton
          direction="next"
          onClick={goNext}
          disabled={atEnd}
          reduce={!!reduce}
        />
      </div>

      <ShareHub result={result} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

function NavButton({
  direction,
  onClick,
  disabled,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
  reduce: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Previous card" : "Next card"}
      className={cn(
        "focus-ring pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-foreground/80 transition-[opacity,transform,color] hover:bg-muted hover:text-foreground active:scale-[0.92]",
        disabled && "pointer-events-none opacity-0"
      )}
    >
      {direction === "prev" ? (
        <ChevronLeft size={22} />
      ) : (
        <ChevronRight size={22} />
      )}
    </button>
  );
}
