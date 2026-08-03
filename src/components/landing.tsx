"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { Leaderboard } from "@/components/leaderboard";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const EXAMPLES = ["facebook/react", "vercel/next.js", "torvalds/linux"];

export interface LandingProps {
  onSubmit: (url: string) => void;
  loading?: boolean;
  onOpenRepo?: (slug: string) => void;
}

export function Landing({ onSubmit, loading, onOpenRepo }: LandingProps) {
  const reduce = useReducedMotion();
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
  };

  const fill = (repo: string) => {
    setValue(repo);
    inputRef.current?.focus();
  };

  const enter = (y: number, delay: number) =>
    reduce
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.42, ease: EASE_OUT, delay },
        };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-5 sm:px-8">
        <span className="font-heading text-base font-semibold">Repo Wrapped</span>
        <ThemeToggle />
      </header>

      {/* Center */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <div className="flex w-full max-w-[560px] flex-col items-center text-center">
          <motion.h1
            {...enter(14, 0)}
            className="font-heading text-[clamp(2.25rem,7vw,3.5rem)] font-semibold text-balance"
          >
            Your year in a repo, wrapped.
          </motion.h1>

          <motion.p
            {...enter(12, 0.08)}
            className="mt-4 text-lg text-muted-foreground text-pretty"
          >
            Paste a public GitHub repo. Get a swipeable, screenshot-ready story
            of what the commits say about you.
          </motion.p>

          <motion.form
            {...enter(12, 0.16)}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="mt-9 flex w-full flex-col gap-3 sm:flex-row"
          >
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="github.com/owner/repo"
              aria-label="GitHub repository URL"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={loading}
            />
            <Button
              type="submit"
              size="lg"
              disabled={loading || !value.trim()}
              className="gap-2 sm:w-auto sm:shrink-0"
            >
              Wrap it
              <ArrowRight size={18} />
            </Button>
          </motion.form>

          <motion.div
            {...enter(10, 0.24)}
            className="mt-5 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-sm text-muted-foreground">Try</span>
            {EXAMPLES.map((repo) => (
              <Button
                key={repo}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fill(repo)}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground"
              >
                {repo}
              </Button>
            ))}
          </motion.div>
        </div>

        {/* Secondary "trending" section: clearly below the hero, never crowding
            the single-input focus. */}
        <motion.div
          {...enter(12, 0.32)}
          className="mt-20 w-full max-w-[560px] sm:mt-24"
        >
          <Leaderboard onOpen={onOpenRepo ?? onSubmit} />
        </motion.div>
      </main>
    </div>
  );
}
