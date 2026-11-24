/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Landed ink strokes opened in bulk are painted after the open, sheet by
 * sheet from the one in view, in short slices that leave the thread free.
 *
 * Opening a page of handwriting built every stroke's node view in the one
 * task that built the document, and each one fitted its stroke's pressure
 * outline then and there: a 2,335-stroke page held the whole site for over
 * four seconds before its first sheet showed. A stroke's drawing changes
 * nothing about the layout (its box, margins and float anchor are set by
 * the render that schedules the paint; the outline only fills the SVG), so
 * it can wait. The first strokes of a task paint at once, which keeps one
 * pen landing, an eraser cut or a small page exactly as before; the rest
 * wait in a queue drained in slices of a few milliseconds, the strokes of
 * the sheets nearest the viewport first. A stroke that is selected, printed
 * or painted again for a change of its own attributes is painted right then.
 */

/** Paints the stroke; `queued` is true when run from the queue, outside any
 * ProseMirror update (the job then keeps its writes from the view's DOM
 * observer itself). */
type PaintJob = (queued: boolean) => void;

/** Strokes painted at once in one task before the rest wait. */
const PAINTED_AT_ONCE_PER_TASK = 32;
/** One slice of the queue keeps the thread at most this long. */
const SLICE_BUDGET_MS = 6;
const SHEET_SELECTOR = "[data-page-sheet]";

const pending = new Map<HTMLElement, PaintJob>();
let paintedThisTask = 0;
let taskResetQueued = false;
let sliceQueued = false;
let printHooked = false;

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

function countThisTask(): number {
  if (!taskResetQueued) {
    taskResetQueued = true;
    queueMicrotask(() => {
      paintedThisTask = 0;
      taskResetQueued = false;
    });
  }
  paintedThisTask += 1;
  return paintedThisTask;
}

function hookPrint(): void {
  if (printHooked || typeof window === "undefined") return;
  printHooked = true;
  window.addEventListener("beforeprint", flushDeferredInkPaints);
}

function queueSlice(): void {
  if (sliceQueued) return;
  sliceQueued = true;
  setTimeout(runSlice, 0);
}

/** How far a sheet (or a stroke outside any sheet) is from the viewport, in px. */
function distanceFromViewport(element: Element | null): number {
  if (!element || !element.isConnected) return Number.POSITIVE_INFINITY;
  const rect = element.getBoundingClientRect();
  const height = typeof window !== "undefined" ? window.innerHeight : 0;
  if (rect.bottom < 0) return -rect.bottom;
  if (rect.top > height) return rect.top - height;
  return 0;
}

function runSlice(): void {
  sliceQueued = false;
  if (pending.size === 0) return;
  const started = now();
  // The queue's strokes by sheet, nearest sheet first: one rectangle per
  // sheet, read once per slice (the sheets move while the ledger lays out).
  const bySheet = new Map<Element | null, HTMLElement[]>();
  for (const root of pending.keys()) {
    const sheet = root.isConnected ? root.closest(SHEET_SELECTOR) : null;
    const group = bySheet.get(sheet);
    if (group) group.push(root);
    else bySheet.set(sheet, [root]);
  }
  const order = Array.from(bySheet.entries())
    .map(([sheet, roots]) => ({ roots, distance: distanceFromViewport(sheet ?? roots[0]) }))
    .sort((a, b) => a.distance - b.distance);
  outer: for (const { roots } of order) {
    for (const root of roots) {
      const job = pending.get(root);
      if (!job) continue;
      pending.delete(root);
      job(true);
      if (now() - started >= SLICE_BUDGET_MS) break outer;
    }
  }
  if (pending.size > 0) queueSlice();
}

/**
 * Paint a landed stroke now, or (when many are built in one task) queue it.
 * Returns whether it was painted now. `root` identifies the stroke's node
 * view; a later request for the same root replaces the queued job.
 */
export function paintInkStroke(root: HTMLElement, job: PaintJob, options: { bulk: boolean }): boolean {
  if (!options.bulk || typeof window === "undefined" || countThisTask() <= PAINTED_AT_ONCE_PER_TASK) {
    pending.delete(root);
    job(false);
    return true;
  }
  hookPrint();
  pending.set(root, job);
  queueSlice();
  return false;
}

/** Whether this stroke's paint is still waiting in the queue. */
export function inkStrokePaintPending(root: HTMLElement): boolean {
  return pending.has(root);
}

/** Paint this stroke now if it is waiting (it is selected, hit, measured). */
export function paintInkStrokeNow(root: HTMLElement): void {
  const job = pending.get(root);
  if (!job) return;
  pending.delete(root);
  job(false);
}

/** Forget a stroke whose node view is gone. */
export function cancelInkStrokePaint(root: HTMLElement): void {
  pending.delete(root);
}

/** Paint every waiting stroke (print, a whole-document snapshot). */
export function flushDeferredInkPaints(): void {
  for (const [root, job] of Array.from(pending.entries())) {
    pending.delete(root);
    job(true);
  }
}

/** Strokes still waiting, for probes and tests. */
export function deferredInkPaintCount(): number {
  return pending.size;
}
