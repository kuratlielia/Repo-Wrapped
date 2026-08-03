"use client";

import * as React from "react";
import { animate } from "motion/react";

interface CountUpOptions {
  /** Duration of the count in seconds. Defaults to 0.9s (PRD 7.5). */
  duration?: number;
  /** When false (reduced motion / inactive), snap to target instantly. */
  enabled?: boolean;
}

/**
 * Counts an integer from 0 up to `target` once, on mount and whenever `target`
 * changes. When `enabled` is false the final value is returned immediately with
 * no animation, which is how reduced-motion and off-screen cards behave.
 */
export function useCountUp(target: number, opts: CountUpOptions = {}): number {
  const { duration = 0.9, enabled = true } = opts;
  // Always start from zero; the value is only surfaced when `enabled`.
  const [value, setValue] = React.useState<number>(0);

  React.useEffect(() => {
    if (!enabled) return;

    // motion drives onUpdate on its frame loop (not synchronously here), so the
    // count animates from 0 to the target once for this mount. Consumers remount
    // per card, so there is no stale value to reset.
    const controls = animate(0, target, {
      duration,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (latest) => setValue(Math.round(latest)),
    });

    return () => controls.stop();
  }, [target, enabled, duration]);

  return enabled ? value : target;
}
