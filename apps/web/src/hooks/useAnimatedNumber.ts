"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 (or previous value) to `target` over `duration` ms.
 * Returns the current display value as a string, formatted with toLocaleString.
 */
export function useAnimatedNumber(target: number, duration = 900): string {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof target !== "number" || isNaN(target)) return;

    fromRef.current = display;
    startRef.current = null;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function step(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return Math.round(display).toLocaleString();
}
