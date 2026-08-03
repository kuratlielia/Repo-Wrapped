"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export interface LoadingStep {
  step: string;
  label: string;
  status: "pending" | "active" | "done";
}

export interface LoadingScreenProps {
  steps: LoadingStep[];
}

export function LoadingScreen({ steps }: LoadingScreenProps) {
  const reduce = useReducedMotion();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-[420px]">
        <motion.p
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: EASE_OUT }}
          className="font-heading text-2xl font-semibold"
        >
          Reading the commits.
        </motion.p>
        <p className="mt-2 text-muted-foreground">
          Cloning shallow, crunching locally, writing your story.
        </p>

        {/* Steps */}
        <ol className="mt-8 flex flex-col gap-1">
          {steps.map((s) => (
            <li
              key={s.step}
              className="flex items-center gap-3 py-2"
              aria-current={s.status === "active" ? "step" : undefined}
            >
              <StepIcon status={s.status} reduce={!!reduce} />
              <motion.span
                initial={false}
                animate={{
                  color:
                    s.status === "pending"
                      ? "var(--muted-foreground)"
                      : "var(--foreground)",
                }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className={cn(
                  "text-[0.95rem]",
                  s.status === "done" && "font-medium"
                )}
              >
                {s.label}
              </motion.span>
            </li>
          ))}
        </ol>

        {/* Brand skeleton bars filling the space */}
        <div className="mt-9 flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

function StepIcon({
  status,
  reduce,
}: {
  status: LoadingStep["status"];
  reduce: boolean;
}) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        {status === "done" ? (
          <motion.span
            key="done"
            initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="text-accent"
          >
            <Check size={18} strokeWidth={2.5} />
          </motion.span>
        ) : status === "active" ? (
          <motion.span
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-foreground"
          >
            <Loader2 size={17} className={reduce ? "" : "animate-spin"} />
          </motion.span>
        ) : (
          <motion.span
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid place-items-center"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
