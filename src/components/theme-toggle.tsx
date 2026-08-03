"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// Returns false during SSR and the first client render, true thereafter, with
// no setState-in-effect. Guards the theme-dependent icon against hydration
// mismatch (next-themes only knows the resolved theme on the client).
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const reduce = useReducedMotion();

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={
        "focus-ring relative grid h-10 w-10 place-items-center rounded-full text-foreground/80 transition-colors hover:text-foreground active:scale-[0.92] " +
        (className ?? "")
      }
    >
      <span className="sr-only">Toggle theme</span>
      {mounted ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, rotate: -40, scale: 0.6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 40, scale: 0.6 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 grid place-items-center"
          >
            {isDark ? <Moon size={19} strokeWidth={2} /> : <Sun size={19} strokeWidth={2} />}
          </motion.span>
        </AnimatePresence>
      ) : (
        <Sun size={19} strokeWidth={2} />
      )}
    </button>
  );
}
