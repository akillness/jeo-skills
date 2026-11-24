"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef } from "react";

import type { DataQueryRun, DataQuerySheet, DataQueryStatus } from "@mrnote/core/web/lib/spreadsheet/data-queries.ts";
import { effectiveDataQueryProperties } from "@mrnote/core/web/lib/spreadsheet/data-query-properties.ts";

export interface SpreadsheetQueryRefreshScheduleOptions {
  /** The page whose queries run; a new page is a new opening of a workbook. */
  readonly pageId: string;
  /** The workbook can take a query refresh now (writable, loaded, no busy query). */
  readonly enabled: boolean;
  readonly sheets: readonly DataQuerySheet[];
  readonly runs: readonly DataQueryRun[];
  readonly statusFor: (run: DataQueryRun) => Promise<DataQueryStatus>;
  readonly refresh: (runs: DataQueryRun[]) => Promise<boolean>;
}

/**
 * Usage > "Refresh data when opening the file" and "Refresh every n minutes"
 * (Excel's Query Properties) for the queries of an open workbook.
 *
 * When the page opens, every query set to refresh on open refreshes once; a
 * query whose result already matches its source is left as it is, since
 * refreshing it would write the same cells and only lengthen its history.
 * A query with a timer refreshes each n minutes while the workbook stays
 * open and writable, from when it was set or the workbook opened. A result
 * that was edited or cannot refresh is skipped by the timer (the manual
 * Refresh says why), as is a tick that comes while another refresh runs.
 */
export function useSpreadsheetQueryRefreshSchedule(
  options: SpreadsheetQueryRefreshScheduleOptions,
): void {
  const latest = useRef(options);
  latest.current = options;
  const openedPageRef = useRef<string | null>(null);

  const refreshStale = async (candidates: DataQueryRun[]) => {
    const live = latest.current;
    if (!live.enabled || candidates.length === 0) return;
    const statuses = await Promise.all(
      candidates.map(async (run) => [run, await live.statusFor(run)] as const),
    );
    const stale = statuses
      .filter(([, status]) => status === "stale")
      .map(([run]) => run);
    // The workbook may have changed or closed while the statuses ran.
    const now = latest.current;
    if (!now.enabled || stale.length === 0) return;
    const current = new Set(now.runs.map((run) => run.id));
    const still = stale.filter((run) => current.has(run.id));
    if (still.length) await now.refresh(still);
  };

  // Refresh data when opening the file: once per opening of the page.
  useEffect(() => {
    // The opening is the first moment the page's queries are loaded and can
    // refresh; a query loaded later in the session is not "opened".
    if (
      !options.enabled ||
      options.runs.length === 0 ||
      openedPageRef.current === options.pageId
    )
      return;
    openedPageRef.current = options.pageId;
    const onOpen = options.runs.filter(
      (run) => effectiveDataQueryProperties(options.sheets, run.queryId).refreshOnLoad,
    );
    void refreshStale(onOpen);
    // Only the page identity and first writability open a workbook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.enabled, options.pageId, options.runs.length]);

  // Refresh every n minutes: one timer per query and interval.
  const timerKey = options.runs
    .map((run) => {
      const minutes = effectiveDataQueryProperties(options.sheets, run.queryId).refreshInterval;
      return minutes > 0 ? `${run.queryId}=${minutes}` : "";
    })
    .filter(Boolean)
    .sort()
    .join("|");
  useEffect(() => {
    if (!timerKey) return;
    const timers = timerKey.split("|").map((entry) => {
      const [queryId, minutes] = entry.split("=");
      return window.setInterval(() => {
        const live = latest.current;
        const run = live.runs.find((candidate) => candidate.queryId === queryId);
        if (run) void refreshStale([run]);
      }, Number(minutes) * 60_000);
    });
    return () => timers.forEach((timer) => window.clearInterval(timer));
  }, [timerKey, options.pageId]);
}
