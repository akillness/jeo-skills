/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The changes to a page's text boxes that wait for the write before them.
 *
 * One write of the list runs at a time. A change made meanwhile used to be
 * kept as the whole list it would leave, built when it was made from the
 * list as it stood then -- and only the newest such list was kept. A change
 * to one box followed by a change to another, both made during one write,
 * left the first of them out: the box went back to where it was, its words
 * to what they were, with nothing said. (The same list, built before the
 * running write had put its own change on the page, left that change out
 * too.)
 *
 * Here a change is kept as the change it is -- this box, as it is now, or
 * gone -- and every change that waits is laid on the list as it stands when
 * its write runs. None replaces another box's change.
 */
import type { PdfTextBoxEdit } from "../PdfTextBoxOverlay";

/** One box of one page: as it is after the change, or taken away (and, when
 * the editor said it, the box as the page held it before). */
export type PdfTextBoxListChange = Readonly<{
  page: number;
  id: string;
  before?: PdfTextBoxEdit | undefined;
  after: PdfTextBoxEdit | undefined;
  /** A key typed into the box (the editor's typing fold): a run of them is
   * one Undo step (pdfTextBoxTypingRunKey). */
  typed?: boolean;
}>;

const sameKey = (edit: Readonly<{ page: number; id: string }>, change: PdfTextBoxListChange) =>
  edit.page === change.page && edit.id === change.id;

















export function pdfTextBoxListWithBox(
  list: readonly PdfTextBoxEdit[],
  key: Readonly<{ page: number; id: string }>,
  after: PdfTextBoxEdit | undefined,
): PdfTextBoxEdit[] {
  const next: PdfTextBoxEdit[] = [];
  let placed = false;
  for (const edit of list) {
    if (edit.page !== key.page || edit.id !== key.id) {
      next.push(edit);
    } else if (after && !placed) {
      next.push(after);
      placed = true;
    }
  }
  if (after && !placed) next.push(after);
  return next;
}

/** The list with the changes laid on it, oldest first: a later change to a
 * box replaces an earlier one of the same box, and no other; each box in
 * the place the list has it. */
export function applyPdfTextBoxListChanges(
  list: readonly PdfTextBoxEdit[],
  changes: readonly PdfTextBoxListChange[],
): PdfTextBoxEdit[] {
  let next = [...list];
  for (const change of changes) next = pdfTextBoxListWithBox(next, change, change.after);
  return next;
}

/**
 * A change the page shows before its write has put it on the list.
 *
 * The list is the page's own: a write puts its boxes on it once it has the
 * command, seconds after the reader made the change when another write runs
 * first. Drawn from the list alone, a box moved meanwhile stood back where
 * it was, and its words read as they were, until its own write ran.
 *
 * `over` is absent while the change waits. Once its write is asked it is
 * the box the list held then (null: none): the change is shown for as long
 * as the list still holds that box, and the list's own box from then on --
 * the write has put it there, as it wrote it.
 */
export type PdfTextBoxShownChange = Readonly<{
  change: PdfTextBoxListChange;
  over?: PdfTextBoxEdit | null;
}>;

export const NO_SHOWN_PDF_TEXT_BOX_CHANGES: readonly PdfTextBoxShownChange[] = Object.freeze([]);

/**
 * The list as the page shows it: each shown change (oldest first, a later
 * one of a box replacing an earlier one) laid on it where the box stands --
 * a changed box in its own place, a new one at the end, one taken away left
 * out. Every other box, and their order, as the list has them. The list
 * itself when it shows them all already.
 */
export function pdfTextBoxListAsShown(
  list: PdfTextBoxEdit[],
  shown: readonly PdfTextBoxShownChange[],
): PdfTextBoxEdit[] {
  if (shown.length === 0) return list;
  const held = new Map<string, PdfTextBoxEdit>(list.map((edit) => [`${edit.page}:${edit.id}`, edit]));
  const last = new Map<string, PdfTextBoxListChange>();
  for (const { change, over } of shown) {
    const key = `${change.page}:${change.id}`;
    if (over !== undefined && (held.get(key) ?? null) !== over) continue;
    last.set(key, change);
  }
  if (last.size === 0) return list;
  let same = true;
  const next: PdfTextBoxEdit[] = [];
  for (const edit of list) {
    const change = last.get(`${edit.page}:${edit.id}`);
    if (!change) {
      next.push(edit);
      continue;
    }
    if (change.after !== edit) same = false;
    if (change.after) next.push(change.after);
  }
  for (const [key, change] of last) {
    if (!change.after || held.has(key)) continue;
    same = false;
    next.push(change.after);
  }
  return same ? list : next;
}

/**
 * The changes to show: those of the write that runs (`over` -- by
 * `${page}:${id}`, the box the list held when the write was asked -- is
 * null until it is) and those that wait, without the ones in `unshown`
 * (the reader has changed their box again since, on the list itself).
 */
export function pdfTextBoxShownChanges(
  writing: readonly PdfTextBoxListChange[],
  over: ReadonlyMap<string, PdfTextBoxEdit | null> | null,
  waiting: readonly PdfTextBoxListChange[],
  unshown: ReadonlySet<PdfTextBoxListChange>,
): readonly PdfTextBoxShownChange[] {
  const shown: PdfTextBoxShownChange[] = [];
  for (const change of writing) {
    if (unshown.has(change)) continue;
    shown.push(over ? { change, over: over.get(`${change.page}:${change.id}`) ?? null } : { change });
  }
  for (const change of waiting) {
    if (!unshown.has(change)) shown.push({ change });
  }
  return shown.length === 0 ? NO_SHOWN_PDF_TEXT_BOX_CHANGES : shown;
}

/**
 * The run a write of these changes is of, when they are all keys typed into
 * boxes (and into the same boxes as the run's other writes: the key names
 * them): its writes are one Undo step, as the editor folds a run of typing
 * (Word, WPS: the words typed in a row are taken back together). Null for a
 * write that carries anything else (a move, a format, a box taken away): a
 * step of its own, which ends the run.
 */
export function pdfTextBoxTypingRunKey(changes: readonly PdfTextBoxListChange[]): string | null {
  if (changes.length === 0 || !changes.every((change) => change.typed === true && change.after !== undefined)) return null;
  return `text-box-typing:${[...new Set(changes.map((change) => `${change.page}:${change.id}`))].sort().join("|")}`;
}

/** Whether the list holds every change as it was made (its last one, for a
 * box changed more than once). */
export function pdfTextBoxListHoldsChanges(
  list: readonly PdfTextBoxEdit[],
  changes: readonly PdfTextBoxListChange[],
): boolean {
  const last = new Map<string, PdfTextBoxListChange>();
  for (const change of changes) last.set(`${change.page}:${change.id}`, change);
  for (const change of last.values()) {
    const held = list.find((edit) => sameKey(edit, change));
    if (held !== change.after) return false;
  }
  return true;
}

/** Each changed box as it was before the first of its changes (undefined:
 * there was none), by `${page}:${id}`: as the editor said it, else as the
 * list holds it. (The list may hold the change already -- a write that
 * failed keeps its boxes on the page.) */
export function pdfTextBoxListChangeOrigin(
  list: readonly PdfTextBoxEdit[],
  changes: readonly PdfTextBoxListChange[],
): ReadonlyMap<string, PdfTextBoxEdit | undefined> {
  const origin = new Map<string, PdfTextBoxEdit | undefined>();
  for (const change of changes) {
    const key = `${change.page}:${change.id}`;
    if (!origin.has(key)) origin.set(key, change.before ?? list.find((edit) => sameKey(edit, change)));
  }
  return origin;
}

/**
 * The list as it stands without the changes, for the Undo of their write:
 * each changed box as `origin` holds it (in its place when the list still
 * has the box, at the end otherwise), a box the changes made left out, every
 * other box as the list has it. The list itself when it holds none of the
 * changes.
 */
export function pdfTextBoxListBeforeChanges(
  list: PdfTextBoxEdit[],
  origin: ReadonlyMap<string, PdfTextBoxEdit | undefined>,
): PdfTextBoxEdit[] {
  const seen = new Set<string>();
  const before: PdfTextBoxEdit[] = [];
  let same = true;
  for (const edit of list) {
    const key = `${edit.page}:${edit.id}`;
    if (!origin.has(key)) {
      before.push(edit);
      continue;
    }
    seen.add(key);
    const was = origin.get(key);
    if (was !== edit) same = false;
    if (was) before.push(was);
  }
  for (const [key, was] of origin) {
    if (!was || seen.has(key)) continue;
    same = false;
    before.push(was);
  }
  return same ? list : before;
}
