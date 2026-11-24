/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";





export const LONG_SAVE_AFTER_MS = 8_000;

/** `m:ss` (or `h:mm:ss`) of a duration. */
export function formatSaveElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * How long the save sent at `sentAt` has been working, once it is a long one
 * (`LONG_SAVE_AFTER_MS`), as `m:ss`; `null` while there is none or it is
 * still short. Re-renders once a second only while a save is on the wire.
 */
export function useSaveElapsed(sentAt: number | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (typeof sentAt !== "number") return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentAt]);
  if (typeof sentAt !== "number") return null;
  const elapsed = now - sentAt;
  return elapsed >= LONG_SAVE_AFTER_MS ? formatSaveElapsed(elapsed) : null;
}
