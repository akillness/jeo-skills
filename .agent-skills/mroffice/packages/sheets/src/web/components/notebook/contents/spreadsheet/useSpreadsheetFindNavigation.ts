"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { spreadsheetCellEditorAt } from "./spreadsheetCellLookup";

interface FindTarget { sheetId: string; row: number; col: number }
interface FindNavigationView {
  pageId: string | null | undefined;
  sheetId: string;
  activeCell: { row: number; col: number };
  viewport: RefObject<HTMLElement | null>;
  navigate: (target: FindTarget) => boolean;
  scrollTo: (row: number, col: number) => void;
  focus: (input: HTMLInputElement) => void;
  scheduleFrame: (callback: () => void) => void;
  /** Hear each commit of the grid's band (a scroll mounting cells renders only the band). */
  onGridCommit?: (listener: () => void) => () => void;
}
interface PendingFind extends FindTarget {
  pageId: string | null | undefined;
  scheduled: boolean;
}

function findInput(current: FindNavigationView, target: FindTarget) {
  return spreadsheetCellEditorAt<HTMLInputElement>(current.viewport.current, `${target.row}:${target.col}`) ?? null;
}

/** Find results are absolute source coordinates, not arrow-key steps. A new
 * sheet must commit before its current geometry is used for scroll/focus. */
export function useSpreadsheetFindNavigation(view: FindNavigationView) {
  const latest = useRef<FindNavigationView | null>(null);
  const pending = useRef<PendingFind | null>(null);
  const cancel = useCallback(() => { pending.current = null; }, []);

  const schedule = useCallback((request: PendingFind) => {
    const run = () => {
      request.scheduled = false;
      const current = latest.current;
      if (!current || pending.current !== request) return;
      if (current.pageId !== request.pageId) { pending.current = null; return; }
      if (current.sheetId !== request.sheetId) return;
      if (current.activeCell.row !== request.row || current.activeCell.col !== request.col) {
        pending.current = null;
        return;
      }
      current.scrollTo(request.row, request.col);
      const input = findInput(current, request);
      if (input && pending.current === request) {
        pending.current = null;
        current.focus(input);
      }
      // Otherwise the requested input is not mounted yet. The grid's scroll
      // commit will retry with fresh geometry; do not poll or guess a delay.
    };
    if (request.scheduled || !latest.current) return;
    request.scheduled = true;
    latest.current.scheduleFrame(run);
  }, []);

  useLayoutEffect(() => {
    latest.current = view;
    const request = pending.current;
    if (!request) return;
    if (request.pageId !== view.pageId) { pending.current = null; return; }
    if (request.sheetId === view.sheetId) schedule(request);
  });

  // A scroll that brings the target in renders only the grid's band: its
  // commit retries the pending focus, as a render of the window does above.
  const onGridCommit = view.onGridCommit;
  useEffect(() => onGridCommit?.(() => {
    const request = pending.current;
    const current = latest.current;
    if (!request || !current) return;
    if (request.pageId !== current.pageId) { pending.current = null; return; }
    if (request.sheetId === current.sheetId) schedule(request);
  }), [onGridCommit, schedule]);

  useEffect(() => {
    // Capture runs before the action handler can create a newer Find request.
    // A later cell click, key command, or another window interaction cancels
    // pending focus rather than allowing it to steal the user's selection.
    document.addEventListener("pointerdown", cancel, true);
    document.addEventListener("keydown", cancel, true);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", cancel, true);
      document.removeEventListener("keydown", cancel, true);
      window.removeEventListener("blur", cancel);
    };
  }, [cancel]);

  return useCallback((target: FindTarget) => {
    const current = latest.current;
    if (!current || !Number.isSafeInteger(target.row) || !Number.isSafeInteger(target.col) || target.row < 0 || target.col < 0) return;
    const request: PendingFind = { ...target, pageId: current.pageId, scheduled: false };
    pending.current = request;
    if (!current.navigate(target)) { pending.current = null; return; }
    // Same-sheet visible hits can focus immediately with committed geometry.
    // Cross-sheet hits are serviced only by the target sheet's layout effect.
    if (current.sheetId === target.sheetId) {
      current.scrollTo(target.row, target.col);
      const input = findInput(current, target);
      if (input && pending.current === request) {
        pending.current = null;
        current.focus(input);
      }
    }
  }, []);
}
