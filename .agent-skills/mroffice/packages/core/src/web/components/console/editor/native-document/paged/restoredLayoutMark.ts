/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Whether the pages an editor opened on came from a layout receipt that
 * restored (paginationProjectionReceipt): the pages a converged ledger laid
 * out for this very content, on paper of this geometry. The page ledger lays
 * out the reader's pages as ever and, when that changes nothing, trusts the
 * rest instead of laying every page of a long document out again in the
 * background (a 271-page book's reopening: 70 s of background passes that
 * came to the pages it opened on; its PDF print waited them out).
 */

import type { JSONContent } from "@tiptap/core";
import type { LayoutSnapshotRow } from "../../../../../lib/docs-layout-snapshot-store";

/** Hydrated stored content (JSON) that a receipt restored. */
const restoredHydrations = new WeakSet<object>();
/** Editor roots whose current pages came from a restored receipt. */
const restoredRoots = new WeakSet<object>();

export function noteRestoredHydration(content: object): void {
  restoredHydrations.add(content);
}

export function hydrationWasRestored(content: unknown): boolean {
  return typeof content === "object" && content !== null && restoredHydrations.has(content);
}

/** The editor rooted at `root` was just filled with `restored` pages (or not). */
export function markRestoredLayout(root: object | null | undefined, restored: boolean): void {
  if (!root) return;
  if (restored) restoredRoots.add(root);
  else {
    restoredRoots.delete(root);
    restoredSnapshots.delete(root);
  }
}

/**
 * A restored layout that came from a kept row (layoutSnapshot), for the ledger's
 * first look: it checks the row's fonts before the pages show, then gives the
 * blocks the row's measurements.
 */
export interface RestoredSnapshot {
  readonly pageId: string;
  readonly row: LayoutSnapshotRow;
  readonly content: JSONContent;
  /** A print's other parts: their fonts are checked too, and every sheet is
   * drawn, so no block is given a measurement. */
  readonly printParts?: readonly { readonly row: LayoutSnapshotRow; readonly content: JSONContent }[];
  /** The row's fonts asked for as the row was found (rowFontsHold): the faces
   * load while the restored pages are built, instead of after the first pass
   * reaches them (a reopening's pages held about a second for it). */
  readonly fontsHold?: Promise<boolean>;
  state: "new" | "checking" | "holds" | "refused";
}
/**
 * Whether a restored row's fonts hold: the answer asked for early when it is
 * yes; otherwise asked again now (`check`). An early no may be the page's own
 * faces not declared yet (they come after it opens, and rowFontsHold waits
 * only so long from when it was asked): it is not taken for the answer.
 */
export async function snapshotFontsHold(snapshot: Pick<RestoredSnapshot, "fontsHold">, check: () => Promise<boolean>): Promise<boolean> {
  const early = snapshot.fontsHold ? await snapshot.fontsHold.catch(() => false) : false;
  return early || check();
}

const restoredSnapshots = new WeakMap<object, RestoredSnapshot>();

export function markRestoredSnapshot(root: object | null | undefined, snapshot: Omit<RestoredSnapshot, "state">): void {
  if (root) restoredSnapshots.set(root, { ...snapshot, state: "new" });
}

export function restoredSnapshotOf(root: object): RestoredSnapshot | null {
  return restoredSnapshots.get(root) ?? null;
}

export function dropRestoredSnapshot(root: object): void {
  restoredSnapshots.delete(root);
}

/** Sheets a later part brought in from its kept layout, by index: the ledger
 * trusts them as it trusts a restored opening's (nothing walks them). */
const restoredSheets = new WeakMap<object, { from: number; to: number; pageId: string }[]>();

export function noteRestoredSheets(root: object, pageId: string, from: number, to: number): void {
  const ranges = restoredSheets.get(root);
  if (ranges) ranges.push({ from, to, pageId });
  else restoredSheets.set(root, [{ from, to, pageId }]);
}

export function takeRestoredSheets(root: object): { from: number; to: number; pageId: string }[] {
  const ranges = restoredSheets.get(root) ?? [];
  restoredSheets.delete(root);
  return ranges;
}

/** Read once, by the ledger's first reveal: whether to trust the pages. */
export function takeRestoredLayout(root: object): boolean {
  const restored = restoredRoots.has(root);
  restoredRoots.delete(root);
  return restored;
}

/** When a document's latest part came in (a document held as parts). */
const partArrivals = new WeakMap<object, number>();

/** A part's append about to be dispatched, for the ledger's update to tell it from an edit. */
const partDispatches = new WeakMap<object, number>();

export function notePartArrived(root: object): void {
  const now = performance.now();
  partArrivals.set(root, now);
  partDispatches.set(root, now);
}

/** Whether the change the ledger sees now is a part's append (once per part). */
export function takePartArrival(root: object): boolean {
  const at = partDispatches.get(root);
  partDispatches.delete(root);
  return at !== undefined && performance.now() - at < 2000;
}

/** How long since the document's latest part came in; Infinity if none did. */
export function msSincePartArrived(root: object): number {
  const at = partArrivals.get(root);
  return at === undefined ? Number.POSITIVE_INFINITY : performance.now() - at;
}
