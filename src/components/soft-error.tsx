"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Lock, SearchX, AlertCircle } from "lucide-react";
import type { WrapError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const EXAMPLES = ["facebook/react", "vercel/next.js"];

export interface SoftErrorProps {
  error: WrapError;
  onRetry: () => void;
  onTryExample: (url: string) => void;
}

function ErrorIcon({ reason }: { reason: WrapError["reason"] }) {
  const props = { size: 28, strokeWidth: 1.75 } as const;
  if (reason === "private") return <Lock {...props} />;
  if (reason === "not_found") return <SearchX {...props} />;
  return <AlertCircle {...props} />;
}

export function SoftError({ error, onRetry, onTryExample }: SoftErrorProps) {
  const reduce = useReducedMotion();
  const [email, setEmail] = React.useState("");
  const [noted, setNoted] = React.useState(false);

  const submitWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setNoted(true);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <motion.div
        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="w-full max-w-[460px] text-center"
      >
        <span className="mx-auto mb-5 grid place-items-center text-muted-foreground">
          <ErrorIcon reason={error.reason} />
        </span>

        <h1 className="font-heading text-2xl font-semibold text-balance">
          {error.message}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Repo Wrapped is public only for now.
        </p>

        {/* Public examples: connected pair sharing a border. */}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {EXAMPLES.map((repo) => (
            <Button
              key={repo}
              variant="secondary"
              onClick={() => onTryExample(repo)}
            >
              {repo}
            </Button>
          ))}
        </div>

        <div className="mt-4">
          <Button variant="primary" onClick={onRetry}>
            Try another repo
          </Button>
        </div>

        {/* Waitlist demand signal, no backend. */}
        <div className="mt-10 border-t border-border pt-6">
          {noted ? (
            <motion.p
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="text-sm text-muted-foreground"
            >
              Thanks, noted. We will reach out when private repos land.
            </motion.p>
          ) : (
            <form onSubmit={submitWaitlist} className="flex flex-col gap-2">
              <label
                htmlFor="waitlist-email"
                className="text-sm text-muted-foreground"
              >
                Want private repo support? Leave your email.
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="waitlist-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-11"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="md"
                  disabled={!email.trim()}
                  className="sm:shrink-0"
                >
                  Notify me
                </Button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
