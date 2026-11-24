"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * How long a LaTeX compile has been running ("Compiling · 7 s") and how long
 * the last one took ("6.2 s"), for the Code window's Run control and output
 * and for the compiled PDF's window.
 *
 * The running count is its own small component that re-renders once a
 * second, so the window around it does not.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Whole seconds since `startedAt` (Date.now()), counted once a second. */
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Tick on the second boundaries of the compile, not of the clock.
    const schedule = () => {
      const elapsed = Date.now() - startedAt;
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 1_000 - (elapsed % 1_000) + 5);
    };
    schedule();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [startedAt]);
  // A clock read before this compile started counts as its start.
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1_000));
}

/**
 * A compile's duration as the member reads it: tenths under ten seconds
 * ("6.2 s"), whole seconds above ("31 s"), in the locale's digits.
 */
export function latexCompileDurationLabel(ms: number, t: Translate): string {
  const seconds = ms / 1_000;
  const shown =
    seconds < 10 ? Math.max(0.1, Math.round(seconds * 10) / 10) : Math.round(seconds);
  return t("codeOutput.latex.seconds", { seconds: shown });
}

/** "Compiling · 7 s": just "Compiling" for its first second. */
export function latexCompilingLabel(elapsedSeconds: number, t: Translate): string {
  const compiling = t("codeOutput.latex.compiling");
  return elapsedSeconds < 1
    ? compiling
    : `${compiling} · ${t("codeOutput.latex.seconds", { seconds: elapsedSeconds })}`;
}

/** The running compile's label, counting up. */
export function LatexCompilingLabel({ startedAt }: { startedAt: number }) {
  const t = useTranslations("console-notebooks");
  const elapsed = useElapsedSeconds(startedAt);
  return <>{latexCompilingLabel(elapsed, t)}</>;
}
