"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FilterVisibilityClient, drainFilterVisibility } from "../../../../lib/spreadsheet/filter-visibility-client";
import { yieldCalculationTask } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import type { PreparedFilterVisibility } from "../../../../lib/spreadsheet/filter-visibility";

const EMPTY_ROWS: ReadonlySet<number> = new Set();

interface Source {
  identity: object; sheetId: string; enabled: boolean;
  isCurrent(): boolean;
  prepare(): Generator<void, PreparedFilterVisibility>;
}
interface Settled { identity: object; sheetId: string; rows: ReadonlySet<number> }

export function useSpreadsheetFilterVisibility(source: Source) {
  const live = useRef(source);
  useLayoutEffect(() => { live.current = source; }, [source]);
  const client = useRef<FilterVisibilityClient | null>(null);
  const job = useRef<{ identity: object; promise: Promise<boolean> } | null>(null);
  const settledRef = useRef<Settled | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const committed = useRef<object | null>(null);
  const commitWaiters = useRef<Array<{ identity: object; resolve(value: boolean): void }>>([]);
  useLayoutEffect(() => {
    const ready = !source.enabled || settled?.identity === source.identity;
    committed.current = ready ? source.identity : null;
    commitWaiters.current = commitWaiters.current.filter(waiter => {
      if (waiter.identity !== source.identity) { waiter.resolve(false); return false; }
      if (ready) { waiter.resolve(source.isCurrent()); return false; }
      return true;
    });
  }, [source, settled]);
  const [failure, setFailure] = useState<object | null>(null);
  const start = useCallback((candidate: Source): Promise<boolean> => {
    if (!candidate.enabled) return Promise.resolve(candidate.isCurrent());
    if (settledRef.current?.identity === candidate.identity) return Promise.resolve(candidate.isCurrent());
    if (job.current?.identity === candidate.identity) return job.current.promise;
    const engine = client.current ??= new FilterVisibilityClient(); engine.cancel();
    const current = () => live.current.enabled && live.current.identity === candidate.identity && candidate.isCurrent();
    const promise = (async () => {
      try {
        await yieldCalculationTask();
        if (!current()) return false;
        const input = await drainFilterVisibility(candidate.prepare(), current);
        const rows = await engine.calculate(input, current);
        if (!current()) return false;
        const next = {identity:candidate.identity, sheetId:candidate.sheetId, rows:new Set(rows)};
        settledRef.current = next; setSettled(next); setFailure(null); return true;
      } catch {
        if (current()) setFailure(candidate.identity);
        return false;
      }
    })();
    job.current = {identity:candidate.identity, promise}; return promise;
  }, []);
  useLayoutEffect(() => { if (!source.enabled) { client.current?.cancel(); job.current = null; } }, [source.identity, source.enabled]);
  useEffect(() => { if (live.current.enabled) void start(live.current); }, [source.identity, source.enabled, start]);
  useEffect(() => () => { live.current = {...live.current, identity:{}}; client.current?.cancel(); job.current = null; commitWaiters.current.splice(0).forEach(waiter => waiter.resolve(false)); }, []);
  const wait = useCallback(async () => {
    const candidate = live.current;
    if (!await start(candidate) || !candidate.isCurrent() || live.current.identity !== candidate.identity) return false;
    if (committed.current === candidate.identity) return true;
    return new Promise<boolean>(resolve => commitWaiters.current.push({identity:candidate.identity, resolve}));
  }, [start]);
  const retry = useCallback(() => { job.current = null; setFailure(null); void start(live.current); }, [start]);
  return {
    wait, retry,
    pending: source.enabled && settled?.identity !== source.identity,
    failed: failure === source.identity,
    rows: settled?.sheetId === source.sheetId ? settled.rows : EMPTY_ROWS,
  };
}
