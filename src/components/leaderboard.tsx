"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { TrendingUp } from "lucide-react";
import type { LeaderboardCategory, LeaderboardEntry } from "@/lib/leaderboard";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const TABS: { category: LeaderboardCategory; label: string }[] = [
  { category: "wraps", label: "Most wrapped" },
  { category: "commits", label: "Most commits" },
  { category: "threeam", label: "3am club" },
  { category: "streak", label: "Longest streak" },
];

export interface LeaderboardProps {
  onOpen: (slug: string) => void;
}

interface View {
  category: LeaderboardCategory;
  entries: LeaderboardEntry[];
}

/** The right-aligned metric for the active category, formatted and labeled. */
function metricText(entry: LeaderboardEntry, category: LeaderboardCategory): string {
  switch (category) {
    case "commits":
      return `${formatNumber(entry.commitsNum)} commits`;
    case "threeam":
      return `${formatNumber(entry.threeAm)} before 5am`;
    case "streak":
      return `${formatNumber(entry.streakDays)} ${entry.streakDays === 1 ? "day" : "days"}`;
    case "wraps":
    default:
      return `${formatNumber(entry.wrapCount)} ${entry.wrapCount === 1 ? "wrap" : "wraps"}`;
  }
}

export function Leaderboard({ onOpen }: LeaderboardProps) {
  const reduce = useReducedMotion();
  const [selected, setSelected] = React.useState<LeaderboardCategory>("wraps");
  const [view, setView] = React.useState<View | null>(null);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    const id = ++requestRef.current;
    (async () => {
      try {
        const res = await fetch(`/api/leaderboard?category=${selected}&limit=10`);
        const data = (await res.json()) as { entries?: LeaderboardEntry[] };
        if (id !== requestRef.current) return;
        setView({
          category: selected,
          entries: Array.isArray(data.entries) ? data.entries : [],
        });
      } catch {
        if (id !== requestRef.current) return;
        setView({ category: selected, entries: [] });
      }
    })();
  }, [selected]);

  // First load has no view yet; a category switch keeps the old view visible
  // (dimmed) until the new one resolves, so rows never jump.
  const firstLoad = view === null;
  const refetching = view !== null && view.category !== selected;
  const entries = view?.entries ?? [];
  const isEmpty = view !== null && entries.length === 0;

  return (
    <section aria-labelledby="trending-heading" className="w-full">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-muted-foreground" aria-hidden />
        <h2 id="trending-heading" className="font-heading text-base font-semibold">
          Trending repos
        </h2>
      </div>

      <div className="mb-4 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Leaderboard category"
          className="inline-flex overflow-hidden rounded-lg border border-border bg-surface"
        >
          {TABS.map((tab) => {
            const active = tab.category === selected;
            return (
              <button
                key={tab.category}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(tab.category)}
                className={cn(
                  "focus-ring whitespace-nowrap border-l border-border px-3.5 py-1.5 text-sm first:border-l-0",
                  "transition-colors duration-200 ease-[var(--ease-out)]",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-surface",
          "transition-opacity duration-200 ease-[var(--ease-out)]",
          refetching && "pointer-events-none opacity-60"
        )}
        aria-busy={firstLoad || refetching}
      >
        {firstLoad && <LoadingRows />}

        {isEmpty && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">Be the first to wrap a repo.</p>
          </div>
        )}

        {!firstLoad &&
          !isEmpty &&
          entries.map((entry, i) => (
            <Row
              key={`${view?.category}-${entry.slug}`}
              entry={entry}
              category={view?.category ?? "wraps"}
              rank={i + 1}
              index={i}
              reduce={!!reduce}
              onOpen={onOpen}
            />
          ))}
      </div>
    </section>
  );
}

function Row({
  entry,
  category,
  rank,
  index,
  reduce,
  onOpen,
}: {
  entry: LeaderboardEntry;
  category: LeaderboardCategory;
  rank: number;
  index: number;
  reduce: boolean;
  onOpen: (slug: string) => void;
}) {
  const anim = reduce
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, ease: EASE_OUT, delay: index * 0.03 },
      };

  return (
    <motion.button
      type="button"
      {...anim}
      onClick={() => onOpen(entry.slug)}
      className={cn(
        "flex w-full items-center gap-4 px-5 py-3.5 text-left",
        "border-t border-border first:border-t-0",
        "transition-colors duration-200 ease-[var(--ease-out)] hover:bg-muted",
        "focus-ring"
      )}
    >
      <span className="tnum w-7 shrink-0 text-sm text-muted-foreground">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[0.95rem] font-medium">
          {entry.owner}/{entry.name}
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          {entry.archetype}
        </span>
        <span className="tnum block truncate text-xs text-muted-foreground">
          {entry.commits} commits
        </span>
      </span>
      <span className="tnum shrink-0 text-sm text-muted-foreground">
        {metricText(entry, category)}
      </span>
    </motion.button>
  );
}

function LoadingRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-t border-border px-5 py-3.5 first:border-t-0"
        >
          <Skeleton className="h-4 w-5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </>
  );
}
