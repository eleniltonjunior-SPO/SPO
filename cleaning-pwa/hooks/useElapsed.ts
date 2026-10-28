"use client";

import { useEffect, useState } from "react";

/** Seconds elapsed since `startIso`, ticking every second while `running`. */
export function useElapsed(startIso: string | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return startIso ? Math.max(0, (now - new Date(startIso).getTime()) / 1000) : 0;
}
