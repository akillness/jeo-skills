"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";










export function useQuietValue<T>(value: T, quietMs: number): T {
  const [quiet, setQuiet] = useState(() => value);
  useEffect(() => {
    if (Object.is(quiet, value)) return;
    const timer = window.setTimeout(() => setQuiet(() => value), quietMs);
    return () => window.clearTimeout(timer);
  }, [quiet, quietMs, value]);
  return quiet;
}
