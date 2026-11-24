/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfTextBoxEdit } from "../PdfTextBoxOverlay";

/** By `${page}:${id}`: the box as the PDF holds it, null when it holds none. */
export type UnwrittenPdfTextBoxes = ReadonlyMap<string, PdfTextBoxEdit | null>;

export const NO_UNWRITTEN_PDF_TEXT_BOXES: UnwrittenPdfTextBoxes = new Map();

const keyOf = (edit: Readonly<{ page: number; id: string }>) => `${edit.page}:${edit.id}`;

/** A value written with its objects' keys in one order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
      : inner);
}

/** The same value as JSON keeps it, a number within a billionth of the
 * other (a place on the page kept as JSON comes back to twelve decimals or
 * so; the window holds it as it computed it). A field that is not set is
 * the field left out. */
function nearlySame(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) <= 1e-9;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => nearlySame(value, right[index]));
  }
  const one = left as Record<string, unknown>;
  const other = right as Record<string, unknown>;
  for (const key of new Set([...Object.keys(one), ...Object.keys(other)])) {
    if (one[key] === undefined && other[key] === undefined) continue;
    if (one[key] === undefined || other[key] === undefined || !nearlySame(one[key], other[key])) return false;
  }
  return true;
}

/** The same box, read by value: a page read in again holds equal boxes,
 * not the same objects -- nor, read from the page's JSON, their fields in
 * the order the window wrote them in. */
function sameBox(left: PdfTextBoxEdit | null | undefined, right: PdfTextBoxEdit | null | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    const one = JSON.stringify(left);
    const other = JSON.stringify(right);
    return one === other || (one.length === other.length && canonical(left) === canonical(right));
  } catch {
    return false;
  }
}

/** A box that is not on the page: absent, or kept as a deleted row. */
const gone = (edit: PdfTextBoxEdit | null | undefined) => !edit || edit.deleted === true;

/**
 * After a write of `proposed` over `before` failed: the boxes it carried,
 * each with what the PDF holds of it. The first failure of a box is the one
 * kept -- what a later failed write started from is itself not in the PDF.
 *
 * `heldByPdf` says whether the PDF holds a box as it stood before the write
 * (a box of the PDF's own text always is; a box the reader made is once a
 * verified save wrote it).
 */
export function markUnwrittenPdfTextBoxes(
  marks: UnwrittenPdfTextBoxes,
  before: readonly PdfTextBoxEdit[],
  proposed: readonly PdfTextBoxEdit[],
  heldByPdf: (edit: PdfTextBoxEdit) => boolean,
): UnwrittenPdfTextBoxes {
  const beforeByKey = new Map(before.map((edit) => [keyOf(edit), edit] as const));
  const proposedKeys = new Set<string>();
  let next: Map<string, PdfTextBoxEdit | null> | null = null;
  const mark = (key: string, held: PdfTextBoxEdit | null) => {
    if (marks.has(key) || next?.has(key)) return;
    (next ??= new Map(marks)).set(key, held);
  };
  for (const edit of proposed) {
    const key = keyOf(edit);
    proposedKeys.add(key);
    const was = beforeByKey.get(key);
    if (was === edit) continue;
    const held = was && !was.deleted && heldByPdf(was) ? was : null;
    // A box the PDF never held, taken away again: nothing is left to write.
    if (!held && gone(edit)) continue;
    mark(key, held);
  }
  for (const was of before) {
    const key = keyOf(was);
    if (proposedKeys.has(key) || was.deleted || !heldByPdf(was)) continue;
    mark(key, was);
  }
  return next ?? marks;
}

const NO_WORK = Object.freeze({ changes: 0, removals: 0, created: Object.freeze([]) as readonly string[] });

/**
 * What of the marks is still to be written, on the page as it stands:
 * `changes` -- boxes the PDF holds otherwise than the page shows them (a
 * write of the list carries them), `removals` -- those of them the page no
 * longer shows, `created` -- the keys of boxes the reader made that are on
 * the page and that the PDF does not hold at all (each written as a new box
 * is).
 */
export function unwrittenPdfTextBoxWork(
  marks: UnwrittenPdfTextBoxes,
  current: readonly PdfTextBoxEdit[],
): Readonly<{ changes: number; removals: number; created: readonly string[] }> {
  if (marks.size === 0) return NO_WORK;
  const currentByKey = new Map(current.map((edit) => [keyOf(edit), edit] as const));
  let changes = 0;
  let removals = 0;
  const created: string[] = [];
  for (const [key, held] of marks) {
    const now = currentByKey.get(key);
    if (held === null) {
      if (!now || now.deleted) continue;
      // A box the reader made is written as a new box is; any other box
      // goes with the list.
      if (now.created) created.push(key);
      else changes += 1;
      continue;
    }
    if (sameBox(now, held)) continue;
    changes += 1;
    if (gone(now)) removals += 1;
  }
  return changes === 0 && created.length === 0 ? NO_WORK : { changes, removals, created };
}

/**
 * The list as the PDF holds it, for the Undo of the write that at last
 * carries the marked boxes: each changed box as it was, each removed box
 * back, each box the PDF does not hold left out.
 */
export function pdfTextBoxesBeforeUnwritten(
  marks: UnwrittenPdfTextBoxes,
  current: readonly PdfTextBoxEdit[],
): PdfTextBoxEdit[] {
  if (marks.size === 0) return [...current];
  const seen = new Set<string>();
  const before: PdfTextBoxEdit[] = [];
  for (const edit of current) {
    const key = keyOf(edit);
    seen.add(key);
    if (!marks.has(key)) {
      before.push(edit);
      continue;
    }
    const held = marks.get(key);
    if (held) before.push(sameBox(edit, held) ? edit : held);
  }
  for (const [key, held] of marks) {
    if (held && !seen.has(key)) before.push(held);
  }
  return before;
}

/** The marks without the given boxes (each written by its own commit). */
export function withoutUnwrittenPdfTextBoxes(
  marks: UnwrittenPdfTextBoxes,
  keys: Iterable<string>,
): UnwrittenPdfTextBoxes {
  let next: Map<string, PdfTextBoxEdit | null> | null = null;
  for (const key of keys) {
    if (!marks.has(key)) continue;
    (next ??= new Map(marks)).delete(key);
  }
  if (!next) return marks;
  return next.size === 0 ? NO_UNWRITTEN_PDF_TEXT_BOXES : next;
}




























export function carryUnwrittenPdfTextBoxesOverLoad(
  marks: UnwrittenPdfTextBoxes,
  windowBoxes: readonly PdfTextBoxEdit[],
  loaded: readonly PdfTextBoxEdit[],
  onlyInRecord?: (row: PdfTextBoxEdit) => boolean,
): Readonly<{ boxes: readonly PdfTextBoxEdit[]; marks: UnwrittenPdfTextBoxes }> {
  if (marks.size === 0) return { boxes: loaded, marks };
  const nowByKey = new Map(windowBoxes.map((edit) => [keyOf(edit), edit] as const));
  const loadedAt = new Map(loaded.map((edit, index) => [keyOf(edit), index] as const));
  const placed = new Map<number, PdfTextBoxEdit | null>();
  const added: PdfTextBoxEdit[] = [];
  const next = new Map<string, PdfTextBoxEdit | null>();
  let same = true;
  const keep = (key: string, held: PdfTextBoxEdit | null, was: PdfTextBoxEdit | null) => {
    next.set(key, held);
    if (held !== was) same = false;
  };
  const drop = () => { same = false; };
  /** The window's box where the page's stood (taken out when the window
   * holds none), or after the page's boxes when the page holds no row of it. */
  const put = (at: number | undefined, now: PdfTextBoxEdit | undefined) => {
    if (at !== undefined) placed.set(at, now ?? null);
    else if (now) added.push(now);
  };
  for (const [key, held] of marks) {
    const now = nowByKey.get(key);
    const at = loadedAt.get(key);
    const row = at === undefined ? undefined : loaded[at];
    const onPage = row && !row.deleted ? row : undefined;
    if (held === null) {
      // A box the PDF did not hold when its write failed.
      if (gone(now)) { drop(); continue; }
      if (onPage && onlyInRecord?.(onPage)) {
        // In the record's list and in no row of the PDF: still to write.
        if (!sameBox(onPage, now)) put(at, now);
        keep(key, null, held);
        continue;
      }
      if (onPage) {
        // A write nobody answered put it there after all.
        if (sameBox(onPage, now)) { drop(); continue; }
        put(at, now);
        keep(key, onPage, held);
        continue;
      }
      if (row || !now!.created) put(at, now);
      keep(key, null, held);
      continue;
    }
    // Back as the PDF held it: nothing of the reader's is left to write.
    if (sameBox(now, held)) { drop(); continue; }
    if (onPage) {
      if (sameBox(onPage, now)) { drop(); continue; }
      put(at, now);
      keep(key, onPage, held);
      continue;
    }
    // The page holds it no longer (taken away in another window).
    if (gone(now)) { drop(); continue; }
    put(at, now);
    keep(key, null, held);
  }
  const boxes = placed.size === 0 && added.length === 0
    ? loaded
    : [
      ...loaded.flatMap((edit, index) => {
        if (!placed.has(index)) return [edit];
        const now = placed.get(index);
        return now ? [now] : [];
      }),
      ...added,
    ];
  return { boxes, marks: same ? marks : next.size === 0 ? NO_UNWRITTEN_PDF_TEXT_BOXES : next };
}

export const unwrittenPdfTextBoxKey = keyOf;

/**
 * One text box as the window alone has it. `held`: the box as the PDF holds
 * it (null: it holds none). `now`: the box as the reader left it (null:
 * taken away). `after`: the edits of the working copy the box goes with and
 * that are not saved yet (the delete of the line it became) -- the box
 * comes back with them, or not at all.
 */
export type UnwrittenPdfTextBoxRecord = Readonly<{
  key: string;
  held: PdfTextBoxEdit | null;
  now: PdfTextBoxEdit | null;
  after: readonly string[];
}>;

type TextBoxWrite = Readonly<{ before: readonly PdfTextBoxEdit[]; proposed: readonly PdfTextBoxEdit[] }>;

/**
 * What the window alone holds of the page's text boxes, right now:
 *
 * - the marks (writes that were not taken),
 * - `writes`: the writes of the list on their way (not answered yet),
 * - `shown` over `list`: the changes waiting for the write before them,
 * - `made`: the boxes the reader made that the PDF does not hold as they
 *   stand (new, or typed in since). Kept when `keepsMade` (AutoSave on:
 *   with it off they are held edits, kept with those). `madeHeld` gives the
 *   box as the PDF holds it, for one typed in since it was written; a new
 *   one is kept unless `madeGoesAfter` says null for it (one kept by
 *   another record, or one whose line cannot be named).
 *
 * A box with no words yet is nothing to keep.
 */
export function unwrittenPdfTextBoxRecords(input: Readonly<{
  marks: UnwrittenPdfTextBoxes;
  list: readonly PdfTextBoxEdit[];
  shown: readonly PdfTextBoxEdit[];
  writes: Iterable<TextBoxWrite>;
  made: readonly PdfTextBoxEdit[];
  keepsMade: boolean;
  heldByPdf: (edit: PdfTextBoxEdit) => boolean;
  madeHeld?: (edit: PdfTextBoxEdit) => PdfTextBoxEdit | null;
  madeGoesAfter?: (edit: PdfTextBoxEdit) => readonly string[] | null;
}>): UnwrittenPdfTextBoxRecord[] {
  const writes = [...input.writes];
  if (input.marks.size === 0 && writes.length === 0 && input.shown === input.list &&
    (!input.keepsMade || input.made.length === 0)) return [];
  let marks = input.marks;
  // Each box as the reader left it: the list, then what each write on its
  // way carries, then the changes that wait.
  const listed = new Map<string, PdfTextBoxEdit>(input.list.map((edit) => [keyOf(edit), edit] as const));
  const now = new Map<string, PdfTextBoxEdit | null>(listed);
  // `onItsWay`: a write asked a while ago. The list may hold the box as the
  // reader has changed it since (typed on, grown to its words): that one is
  // the later, and the write's is not set over it.
  const over = (before: readonly PdfTextBoxEdit[], after: readonly PdfTextBoxEdit[], onItsWay: boolean) => {
    if (before === after) return;
    marks = markUnwrittenPdfTextBoxes(marks, before, after, input.heldByPdf);
    const beforeByKey = new Map(before.map((edit) => [keyOf(edit), edit] as const));
    const afterKeys = new Set<string>();
    for (const edit of after) {
      const key = keyOf(edit);
      afterKeys.add(key);
      const was = beforeByKey.get(key);
      if (was === edit) continue;
      const held = listed.get(key);
      if (onItsWay && held !== was && held !== edit) continue;
      now.set(key, edit);
    }
    for (const was of before) {
      const key = keyOf(was);
      if (afterKeys.has(key)) continue;
      const held = listed.get(key);
      if (onItsWay && held !== undefined && held !== was) continue;
      now.set(key, null);
    }
  };
  for (const write of writes) over(write.before, write.proposed, true);
  over(input.list, input.shown, false);
  const records: UnwrittenPdfTextBoxRecord[] = [];
  const seen = new Set<string>();
  const keepMade = (edit: PdfTextBoxEdit) => {
    const key = keyOf(edit);
    if (seen.has(key)) return;
    seen.add(key);
    if (!input.keepsMade || (!edit.text?.trim() && !edit.latex?.trim())) return;
    const after = input.madeGoesAfter ? input.madeGoesAfter(edit) : [];
    if (after) records.push({ key, held: null, now: edit, after });
  };
  for (const [key, held] of marks) {
    const at = now.get(key) ?? null;
    if (held === null) {
      if (gone(at)) continue;
      if (at!.created) keepMade(at!);
      else records.push({ key, held: null, now: at, after: [] });
      continue;
    }
    if (sameBox(at, held)) continue;
    records.push({ key, held, now: at, after: [] });
  }
  for (const edit of input.made) {
    const key = keyOf(edit);
    if (!edit.created || marks.has(key)) continue;
    const at = now.get(key);
    if (!at || at.deleted) continue;
    const held = input.madeHeld?.(at) ?? null;
    if (!held) keepMade(at);
    else if (input.keepsMade && !seen.has(key) && !sameBox(at, held)) records.push({ key, held, now: at, after: [] });
  }
  return records;
}

const RECORD_VERSION = 1;

/** A record as two strings (what the PDF holds, what the reader left). */
export function encodeUnwrittenPdfTextBoxRecord(record: UnwrittenPdfTextBoxRecord): Readonly<{ held: string; now: string }> {
  return {
    held: record.held ? JSON.stringify(record.held) : "",
    now: JSON.stringify({ v: RECORD_VERSION, now: record.now, after: record.after }),
  };
}

function isBoxOf(value: unknown, key: string): value is PdfTextBoxEdit {
  if (!value || typeof value !== "object") return false;
  const edit = value as Record<string, unknown>;
  return typeof edit.id === "string" && Number.isSafeInteger(edit.page) && typeof edit.text === "string" &&
    [edit.x, edit.y, edit.width, edit.height].every((side) => typeof side === "number" && Number.isFinite(side)) &&
    keyOf(edit as { page: number; id: string }) === key;
}

/** The record the strings were written from; null when they are not one. */
export function decodeUnwrittenPdfTextBoxRecord(key: string, held: string, now: string): UnwrittenPdfTextBoxRecord | null {
  try {
    const heldBox: unknown = held ? JSON.parse(held) : null;
    const left = JSON.parse(now) as { v?: unknown; now?: unknown; after?: unknown } | null;
    if (!left || left.v !== RECORD_VERSION) return null;
    const nowBox = left.now ?? null;
    if ((heldBox !== null && !isBoxOf(heldBox, key)) || (nowBox !== null && !isBoxOf(nowBox, key))) return null;
    if (heldBox === null && nowBox === null) return null;
    const after = Array.isArray(left.after) ? left.after.filter((id): id is string => typeof id === "string") : [];
    return { key, held: heldBox, now: nowBox, after };
  } catch {
    return null;
  }
}

/**
 * The page opened again: the kept records put back onto its boxes.
 *
 * A record is put back only onto the page it was kept on: a change of a box
 * onto the box as the PDF held it when the change was made, a box the
 * reader made onto a page that holds no such box. A page that has moved on
 * since (the box changed or taken away in another window, on another
 * device) keeps what it holds -- a record met late never undoes later work
 * -- and the reader is told (`notRestored`). A record whose change the page
 * holds was written after all. A box that goes with edits of the working
 * copy (`after`) comes back once that queue has (`awaiting`), and is not
 * restored when the queue does not hold them.
 *
 * `boxes`, `marks`: the window's. `normalize`: a box as the page's reader
 * reads it (the kept box is as the window wrote it). Returns the boxes and
 * marks to stand, the keys put back (`restored`, kept until written), and
 * the keys that are nobody's any more (`spent`).
 */
export function restoreUnwrittenPdfTextBoxes(
  records: readonly UnwrittenPdfTextBoxRecord[],
  boxes: readonly PdfTextBoxEdit[],
  marks: UnwrittenPdfTextBoxes,
  options: Readonly<{
    queued: (operationId: string) => boolean;
    normalize?: (edit: PdfTextBoxEdit) => PdfTextBoxEdit;
  }>,
): Readonly<{
    boxes: readonly PdfTextBoxEdit[];
    marks: UnwrittenPdfTextBoxes;
    restored: readonly string[];
    awaiting: readonly UnwrittenPdfTextBoxRecord[];
    spent: readonly string[];
    notRestored: boolean;
  }> {
  const read = (edit: PdfTextBoxEdit) => {
    try { return options.normalize ? options.normalize(edit) : edit; } catch { return edit; }
  };
  // (To a billionth of the page: the kept box holds its place as the window
  // computed it, the page's as its JSON gave it back.)
  const same = (left: PdfTextBoxEdit, right: PdfTextBoxEdit) => {
    if (sameBox(left, right)) return true;
    try { return nearlySame(read(left), read(right)); } catch { return false; }
  };
  const next = [...boxes];
  const nextMarks = new Map(marks);
  const restored: string[] = [];
  const awaiting: UnwrittenPdfTextBoxRecord[] = [];
  const spent: string[] = [];
  let notRestored = false;
  const refuse = (key: string) => { notRestored = true; spent.push(key); };
  for (const record of records) {
    const { key, held, now } = record;
    // The window has work of its own on the box already: that stands.
    if (nextMarks.has(key)) { spent.push(key); continue; }
    const at = next.findIndex((edit) => keyOf(edit) === key);
    const row = at < 0 ? undefined : next[at];
    const onPage = row && !row.deleted ? row : undefined;
    if (!now || now.deleted) {
      // Taken away: from a page that still holds the box as it was.
      if (!held || !onPage) { spent.push(key); continue; }
      if (!same(onPage, held)) { refuse(key); continue; }
      if (now) next[at] = now;
      else next.splice(at, 1);
      nextMarks.set(key, onPage);
      restored.push(key);
      continue;
    }
    if (onPage && same(onPage, now)) { spent.push(key); continue; }
    if (held === null) {
      // The page holds a box of that name, and not as the reader left it
      // (that one was written after all, above): which of the two is the
      // later cannot be told from here, so the page's stands, and it is said.
      if (onPage) { refuse(key); continue; }
      if (record.after.length) {
        if (record.after.every(options.queued)) awaiting.push(record);
        else refuse(key);
        continue;
      }
      if (row) next[at] = now;
      else next.push(now);
      nextMarks.set(key, null);
      restored.push(key);
      continue;
    }
    if (!onPage || !same(onPage, held)) { refuse(key); continue; }
    next[at] = now;
    nextMarks.set(key, onPage);
    restored.push(key);
  }
  return restored.length === 0
    ? { boxes, marks, restored, awaiting, spent, notRestored }
    : { boxes: next, marks: nextMarks, restored, awaiting, spent, notRestored };
}
