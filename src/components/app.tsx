"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { StreamEvent, WrappedResult, WrapError } from "@/lib/types";
import { Landing } from "@/components/landing";
import { LoadingScreen, type LoadingStep } from "@/components/loading-screen";
import { SoftError } from "@/components/soft-error";
import { Story } from "@/components/story/story";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Phase = "landing" | "loading" | "story" | "error";

// The honest, ordered pipeline surfaced to the user (PRD 8.2).
const INITIAL_STEPS: LoadingStep[] = [
  { step: "resolve", label: "Resolving the repository", status: "pending" },
  { step: "clone", label: "Cloning it, shallow and fast", status: "pending" },
  { step: "read", label: "Reading the commit history", status: "pending" },
  { step: "crunch", label: "Crunching the numbers", status: "pending" },
  { step: "write", label: "Writing your story", status: "pending" },
];

const GENERIC_ERROR: WrapError = {
  ok: false,
  reason: "server",
  message: "Something went sideways on our end.",
};

/** Sync the browser URL so this exact wrap is shareable (PRD 9.1 copy link). */
function syncUrl(repoSlug: string | null) {
  if (typeof window === "undefined") return;
  const url = repoSlug ? `/?repo=${repoSlug}` : "/";
  window.history.replaceState(null, "", url);
}

export function App({ initialRepo }: { initialRepo?: string }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = React.useState<Phase>("landing");
  const [steps, setSteps] = React.useState<LoadingStep[]>(INITIAL_STEPS);
  const [result, setResult] = React.useState<WrappedResult | null>(null);
  const [error, setError] = React.useState<WrapError>(GENERIC_ERROR);

  const advanceStep = React.useCallback(
    (step: string, status: "start" | "done") => {
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.step === step);
        if (idx === -1) return prev;
        return prev.map((s, i) => {
          if (i < idx) return s.status === "done" ? s : { ...s, status: "done" };
          if (i === idx)
            return { ...s, status: status === "done" ? "done" : "active" };
          return s;
        });
      });
    },
    []
  );

  const runWrap = React.useCallback(
    async (url: string) => {
      setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
      setPhase("loading");

      try {
        const res = await fetch("/api/wrap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });

        if (!res.body) {
          setError(GENERIC_ERROR);
          setPhase("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let settled = false;

        const handleEvent = (evt: StreamEvent) => {
          if (evt.type === "progress") {
            advanceStep(evt.step, evt.status);
          } else if (evt.type === "result") {
            settled = true;
            setResult(evt.result);
            setPhase("story");
            syncUrl(`${evt.result.owner}/${evt.result.name}`);
          } else if (evt.type === "error") {
            settled = true;
            setError(evt.error);
            setPhase("error");
          }
        };

        // Read the NDJSON stream: buffer, split on newlines, parse each line.
        for (;;) {
          const { done, value } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              handleEvent(JSON.parse(line) as StreamEvent);
            } catch {
              // Ignore malformed lines; keep reading.
            }
          }

          if (done) break;
        }

        const tail = buffer.trim();
        if (tail) {
          try {
            handleEvent(JSON.parse(tail) as StreamEvent);
          } catch {
            /* ignore */
          }
        }

        if (!settled) {
          setError(GENERIC_ERROR);
          setPhase("error");
        }
      } catch {
        setError(GENERIC_ERROR);
        setPhase("error");
      }
    },
    [advanceStep]
  );

  // Auto-start from a shared ?repo= link, exactly once. The kickoff is deferred
  // a tick so the state updates inside runWrap don't run synchronously in the
  // effect body (and so a shared link lands on the loading screen cleanly).
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (startedRef.current) return;
    const repo = initialRepo?.trim();
    if (!repo) return;
    startedRef.current = true;
    const id = window.setTimeout(() => void runWrap(repo), 0);
    return () => window.clearTimeout(id);
  }, [initialRepo, runWrap]);

  const restart = React.useCallback(() => {
    setResult(null);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setPhase("landing");
    syncUrl(null);
  }, []);

  const phaseAnim = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.2 },
      }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.3, ease: EASE_OUT },
      };

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <AnimatePresence mode="wait">
        <motion.div key={phase} {...phaseAnim} className="min-h-dvh">
          {phase === "landing" && (
            <Landing onSubmit={runWrap} onOpenRepo={runWrap} loading={false} />
          )}
          {phase === "loading" && <LoadingScreen steps={steps} />}
          {phase === "story" && result && (
            <Story result={result} onRestart={restart} />
          )}
          {phase === "error" && (
            <SoftError error={error} onRetry={restart} onTryExample={runWrap} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
