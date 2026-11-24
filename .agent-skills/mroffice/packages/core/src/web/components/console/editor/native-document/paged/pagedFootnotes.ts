"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word 脚注区 computation for the paged editable mode.
 *
 * Word prints each footnote at the BOTTOM OF THE PAGE its marker sits on
 * (endnotes stay at the document end). Given the committed layout snapshot's
 * page ranges and the live document, this maps every FOOTNOTE-stream note to
 * the page of its first marker so the seam under that sheet can render the
 * note above the footer band. Pure — trivially unit-testable.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  FOOTNOTE_MARK_NAME,
  insertFootnoteMediaPictures,
  normalizeFootnotes,
  numberNoteStreams,
  resolveFootnoteMode,
  sanitizeCustomMark,
  sanitizeFootnoteId,
  type NumberedStreamNote,
  type OrderedNoteRef,
} from "../footnotes";
import type { PagedEditingSeamNote } from "./pagedEditingExtension";
import { documentNoteSettings } from "../noteSectionSettings";
import { withRootMeasurementSlot } from "./renderedTextHead";
import { noteBodyLineMetrics, planNoteBodyCutOffset } from "./blockSplitting";
import { sliceFootnoteRichBody } from "../footnotes";
import { applyNoteParagraphLines, noteParagraphIndexAt, noteTextNodes, renderNoteBodyInto } from "../noteRichText";
import { sheetNoteColumns } from "./unequalColumnProjection";
import {
  applyNoteRowTypography,
  applyNoteZoneTypography,
  footnoteTextStyleFromDocAttrs,
  type NoteTextStyle,
} from "../noteTextStyle";

export interface SeamFootnotePageRange {
  index: number;
  ranges: Array<{ pmFrom: number; pmTo: number }>;
}

type ScannedFootnoteBlock = {
  noteRefs: Array<{ id: string; customMark: string | null }>;
};

function footnoteMeasurementModel(
  doc: ProseMirrorNode,
  scanned: ReadonlyArray<ScannedFootnoteBlock>,
): {
  footnotes: NumberedStreamNote[];
  ownerBlockById: Map<string, number>;
} {
  const orderedRefs: OrderedNoteRef[] = [];
  const ownerBlockById = new Map<string, number>();
  scanned.forEach((block, blockIndex) => {
    for (const ref of block.noteRefs) {
      const id = sanitizeFootnoteId(ref.id);
      if (!id || ownerBlockById.has(id)) continue;
      ownerBlockById.set(id, blockIndex);
      orderedRefs.push({ id, customMark: sanitizeCustomMark(ref.customMark) });
    }
  });
  if (orderedRefs.length === 0) {
    return { footnotes: [], ownerBlockById };
  }

  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  const store = normalizeFootnotes(attrs.footnotes);
  const mode = resolveFootnoteMode(attrs.footnoteMode);
  const { footnotes } = numberNoteStreams(
    store,
    orderedRefs,
    mode,
    documentNoteSettings(attrs),
  );
  return { footnotes, ownerBlockById };
}

/** A scratch note zone appended to `host`, not measured yet. */
interface PendingFootnoteZone {
  zone: HTMLElement;
  rows: Array<[string, HTMLElement]>;
}

function appendFootnoteZone(
  footnotes: readonly NumberedStreamNote[],
  host: HTMLElement,
  textStyle: NoteTextStyle | null,
  /** Where the zone goes: `host` itself, or its off-screen clone. */
  container: HTMLElement = host,
): PendingFootnoteZone {
  const ownerDocument = host.ownerDocument;
  const zone = ownerDocument.createElement("div");
  zone.className = "paged-edit-seam__footnotes";
  // Measured in the document's "footnote text" style, exactly as the zone
  // builder paints it (pagedEditingExtension.ts).
  applyNoteZoneTypography(zone, textStyle);
  // The class positions the zone absolutely inside a seam; for measurement it
  // must participate in normal flow at the host's content width.
  Object.assign(zone.style, {
    position: "static",
    transform: "none",
    maxHeight: "none",
    overflow: "visible",
  });
  // Measured one column wide (below): the zone's own CSS columns would set
  // the rows in columns of that column, read off the sheet's --note-columns
  // its clone carries. A 4-line note of a two-column page (look22 probe
  // fn-f6b, Word: 2 + 2 lines) measured 5 lines in quarter-page columns and
  // the page's zone a row taller than it draws: every column of the page
  // held a line less than Word's. `window.__docsNoteMeasureColumnsOff = true`
  // measures as before (A/B).
  if (!noteMeasureColumnsOff()) zone.style.columnCount = "auto";
  // A page of newspaper columns sets its notes in those columns (Word's
  // "Columns: Match section layout"): each row is measured at a column's
  // width, and the page's zone balances them (projectedFootZonesPx).
  const noteColumns = sheetNoteColumns(host);
  if (noteColumns) {
    zone.style.width = `calc((100% - ${noteColumns.gapPx * (noteColumns.count - 1)}px) / ${noteColumns.count})`;
  }
  const rows: Array<[string, HTMLElement]> = [];
  for (const note of footnotes) {
    const row = ownerDocument.createElement("div");
    row.className = "paged-edit-seam__footnote";
    applyNoteRowTypography(row, textStyle, note.body, note.paragraphFormat);
    if (!note.customMark) {
      const marker = ownerDocument.createElement("span");
      marker.className = "paged-edit-seam__footnote-ref";
      marker.textContent = note.label;
      row.appendChild(marker);
    }
    const body = ownerDocument.createElement("span");
    body.className = "paged-edit-seam__footnote-body";
    // The note's own line breaks (U+2028 in its plain body) are `<br>`s, as
    // the zone paints them: CSS breaks no line at U+2028, so a note of
    // fourteen broken lines was measured as two wrapped ones and the page
    // ran on under a note Word continues (corpus R37-D15).
    body.appendChild(noteTextNodes(ownerDocument, note.body));
    // A read-only note's pictures take their room in its rows.
    insertFootnoteMediaPictures(body, note.pictures);
    row.appendChild(body);
    // Each paragraph on its own line, as Word sets it (R77-D14).
    applyNoteParagraphLines(body, note.paragraphLines, 0);
    zone.appendChild(row);
    rows.push([note.id, row]);
  }
  container.appendChild(zone);
  return { zone, rows };
}

function noteMeasureColumnsOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsNoteMeasureColumnsOff?: boolean }).__docsNoteMeasureColumnsOff === true;
}

function readFootnoteZone({ zone, rows }: PendingFootnoteZone): {
  rowHeights: Map<string, number>;
  /** Row pitch (px) of each note's body: a continued note moves in rows. */
  pitches: Map<string, number>;
  chrome: number;
} {
  const rowHeights = new Map<string, number>();
  const pitches = new Map<string, number>();
  let rowSum = 0;
  for (const [id, el] of rows) {
    const height = el.offsetHeight;
    rowHeights.set(id, height);
    rowSum += height;
    const body = el.querySelector<HTMLElement>(".paged-edit-seam__footnote-body");
    const pitch = body ? noteBodyLineMetrics(body).pitchPx : 0;
    pitches.set(id, pitch > 0 ? pitch : height);
  }
  const chrome = Math.max(0, zone.offsetHeight - rowSum);
  return { rowHeights, pitches, chrome };
}

function measureFootnoteRows(
  footnotes: readonly NumberedStreamNote[],
  host: HTMLElement,
  textStyle: NoteTextStyle | null,
): { rowHeights: Map<string, number>; chrome: number } {
  const pending = appendFootnoteZone(footnotes, host, textStyle);
  try {
    return readFootnoteZone(pending);
  } finally {
    pending.zone.remove();
  }
}

/**
 * page index → the footnote-stream notes anchored on that page, in marker
 * order, each carrying its Word-parity label (auto number or custom mark).
 */
/**
 * One page's share of a footnote body, in body characters: the ledger
 * continues a note the page cannot hold onto the following pages (Word), and
 * the zone of each page shows exactly its rows.
 */
export interface NoteZoneSlice {
  id: string;
  start: number;
  end: number;
  /** Not the note's first rows: the zone opens with the continuation
   * separator and the row shows no mark. */
  continued: boolean;
  /** More rows follow on a later page. */
  continues: boolean;
}

/** The rows (px) a note gets on one page, in the order the zone lists them. */
export interface PageNoteAllocation {
  id: string;
  px: number;
  first: boolean;
  last: boolean;
}

export function computeSeamFootnotes(
  doc: ProseMirrorNode,
  pages: SeamFootnotePageRange[],
  slices?: ReadonlyMap<number, readonly NoteZoneSlice[]> | null,
): Map<number, PagedEditingSeamNote[]> {
  const zones = new Map<number, PagedEditingSeamNote[]>();
  const markers: Array<{
    id: string;
    customMark: string | null;
    pos: number;
    sectionIndex: number;
  }> = [];
  const seen = new Set<string>();
  let sectionIndex = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === "sectionBreak") sectionIndex += 1;
    if (node.type.name === FOOTNOTE_MARK_NAME) {
      const id = sanitizeFootnoteId(node.attrs?.noteId);
      if (id && !seen.has(id)) {
        seen.add(id);
        markers.push({
          id,
          customMark: sanitizeCustomMark(node.attrs?.customMark),
          pos,
          sectionIndex,
        });
      }
    }
    return true;
  });
  if (markers.length === 0) return zones;

  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  const store = normalizeFootnotes(attrs.footnotes);
  const mode = resolveFootnoteMode(attrs.footnoteMode);
  const pageOf = (pos: number): number | null => {
    for (const page of pages) {
      for (const range of page.ranges) {
        if (pos >= range.pmFrom && pos < range.pmTo) return page.index;
      }
    }
    return null;
  };
  // "Restart each page / each section" needs the page and section of every
  // marker; without them the zone labels ran on while the in-text marks
  
  const orderedRefs: OrderedNoteRef[] = markers.map(
    ({ id, customMark, pos, sectionIndex: section }) => ({
      id,
      customMark,
      sectionIndex: section,
      pageIndex: pageOf(pos) ?? 0,
    }),
  );
  // Word note numbering (numFmt + start) — same doc attrs the in-text
  // markers and the document-end list read, so the zone labels agree.
  const { footnotes } = numberNoteStreams(
    store,
    orderedRefs,
    mode,
    documentNoteSettings(attrs),
  );
  const byId = new Map(footnotes.map((note) => [note.id, note]));
  const seamNote = (note: NumberedStreamNote, slice?: NoteZoneSlice): PagedEditingSeamNote => ({
    id: note.id,
    // Word keeps a custom mark INSIDE the note text (the entry's first run is
    // the literal glyph, no footnoteRef) — an empty label tells the zone to
    // render the body alone instead of doubling the mark. A continued slice
    // shows no mark either.
    label: note.customMark || slice?.continued ? "" : note.label,
    body: note.body,
    ...(note.rich ? { rich: note.rich } : {}),
    ...(note.readOnly ? { readOnly: true } : {}),
    ...(note.pictures?.length ? { pictures: note.pictures } : {}),
    ...(note.paragraphFormat ? { paragraphFormat: note.paragraphFormat } : {}),
    ...(note.paragraphLines ? { paragraphLines: note.paragraphLines } : {}),
    ...(slice
      ? {
          sliceStart: Math.max(0, Math.min(slice.start, note.body.length)),
          sliceEnd: Math.max(0, Math.min(slice.end, note.body.length)),
          continued: slice.continued,
          continues: slice.continues,
        }
      : {}),
  });

  // The ledger's slices name every page that shows note rows (continued rows
  // included) once the layout has settled; a note they do not mention (a
  // reference the ledger has not seen yet) prints whole on its marker's
  // page, as before.
  const sliced = new Set<string>();
  if (slices) {
    for (const [pageIndex, pageSlices] of slices) {
      for (const slice of pageSlices) {
        const note = byId.get(slice.id);
        if (!note) continue;
        sliced.add(slice.id);
        const zone = zones.get(pageIndex) ?? [];
        zone.push(seamNote(note, slice));
        zones.set(pageIndex, zone);
      }
    }
  }

  for (const marker of markers) {
    const note = byId.get(marker.id);
    if (!note) continue; // endnote stream (document-end list) or dangling
    if (sliced.has(note.id)) continue;
    const pageIndex = pageOf(marker.pos);
    if (pageIndex === null) continue;
    const zone = zones.get(pageIndex) ?? [];
    zone.push(seamNote(note));
    zones.set(pageIndex, zone);
  }
  return zones;
}

/**
 * Turn the ledger's per-page row allocations into body character slices by
 * rendering each continued note the way the zone paints it and cutting it
 * at the page-bottom row rule, page after page. A note that gets all its
 * rows on one page yields one whole slice; a note whose rows cannot be
 * located (no layout) is left out so its marker's page prints it whole.
 */
export function planNoteZoneSlices(
  doc: ProseMirrorNode,
  allocations: ReadonlyMap<number, readonly PageNoteAllocation[]>,
  host: HTMLElement | null,
): Map<number, NoteZoneSlice[]> {
  const result = new Map<number, NoteZoneSlice[]>();
  if (allocations.size === 0) return result;
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  const store = normalizeFootnotes(attrs.footnotes);
  const notesById = new Map(store.map((note) => [note.id, note]));
  const textStyle = footnoteTextStyleFromDocAttrs(attrs);

  // The pages each note is allocated on, in order.
  const pagesOf = new Map<string, Array<{ page: number; px: number }>>();
  const pageOrder = [...allocations.keys()].sort((a, b) => a - b);
  for (const page of pageOrder) {
    for (const allocation of allocations.get(page) ?? []) {
      const list = pagesOf.get(allocation.id) ?? [];
      list.push({ page, px: allocation.px });
      pagesOf.set(allocation.id, list);
    }
  }

  const cutsOf = (id: string, parts: ReadonlyArray<{ page: number; px: number }>): number[] | null => {
    const note = notesById.get(id);
    if (!note || parts.length < 2) return [];
    if (!host) return null;
    const ownerDocument = host.ownerDocument;
    const zone = ownerDocument.createElement("div");
    zone.className = "paged-edit-seam__footnotes";
    applyNoteZoneTypography(zone, textStyle);
    Object.assign(zone.style, { position: "static", transform: "none", maxHeight: "none", overflow: "visible" });
    const row = ownerDocument.createElement("div");
    row.className = "paged-edit-seam__footnote";
    applyNoteRowTypography(row, textStyle, note.body, note.paragraphFormat);
    const body = ownerDocument.createElement("span");
    body.className = "paged-edit-seam__footnote-body";
    row.appendChild(body);
    zone.appendChild(row);
    host.appendChild(zone);
    try {
      const cuts: number[] = [];
      let start = 0;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const rest = sliceFootnoteRichBody(note.body, note.rich, start, note.body.length);
        if (rest) renderNoteBodyInto(body, rest);
        else {
          body.textContent = "";
          body.appendChild(noteTextNodes(ownerDocument, note.body.slice(start)));
        }
        insertFootnoteMediaPictures(body, note.sourceMediaPictures, start);
        applyNoteParagraphLines(body, note.paragraphLines, noteParagraphIndexAt(note.body, start));
        const offset = planNoteBodyCutOffset(body, parts[index].px);
        if (offset === null || start + offset >= note.body.length) return null;
        start += offset;
        cuts.push(start);
      }
      return cuts;
    } finally {
      zone.remove();
    }
  };

  const push = (page: number, slice: NoteZoneSlice) => {
    const list = result.get(page) ?? [];
    list.push(slice);
    result.set(page, list);
  };
  // Zones list continued rows first, then the page's own notes: the
  // allocation order already is that order.
  const sliceByPage = new Map<number, Map<string, NoteZoneSlice>>();
  for (const [id, parts] of pagesOf) {
    const note = notesById.get(id);
    if (!note) continue;
    const cuts = cutsOf(id, parts);
    if (cuts === null) continue;
    const bounds = [0, ...cuts, note.body.length];
    parts.forEach((part, index) => {
      const slice: NoteZoneSlice = {
        id,
        start: bounds[index] ?? 0,
        end: bounds[index + 1] ?? note.body.length,
        continued: index > 0,
        continues: index < parts.length - 1,
      };
      const page = sliceByPage.get(part.page) ?? new Map();
      page.set(id, slice);
      sliceByPage.set(part.page, page);
    });
  }
  for (const page of pageOrder) {
    const slicesOnPage = sliceByPage.get(page);
    if (!slicesOnPage) continue;
    for (const allocation of allocations.get(page) ?? []) {
      const slice = slicesOnPage.get(allocation.id);
      if (slice) push(page, slice);
    }
  }
  return result;
}

/**
 * Word 脚注预留 measurement: render each footnote-stream note as a zone row
 * at the measured-flow host's content width and return, per top-level block,
 * the page-bottom height its notes will need (zone chrome included; a note
 * referenced from several blocks is charged to the FIRST one, matching the
 * zone assignment). Endnotes cost nothing here — they live at the document
 * end. Returns all zeros for a note-free document.
 */
export function measureBlockFootnoteHeights(
  doc: ProseMirrorNode,
  scanned: ReadonlyArray<ScannedFootnoteBlock>,
  host: HTMLElement,
): number[] {
  const heights = new Array<number>(scanned.length).fill(0);
  const { footnotes } = footnoteMeasurementModel(doc, scanned);
  if (footnotes.length === 0) return heights;
  const textStyle = footnoteTextStyleFromDocAttrs(doc.attrs);
  const { rowHeights, chrome } = measureFootnoteRows(footnotes, host, textStyle);

  const consumed = new Set<string>();
  scanned.forEach((block, index) => {
    let sum = 0;
    for (const ref of block.noteRefs) {
      const id = sanitizeFootnoteId(ref.id);
      if (!id || consumed.has(id)) continue;
      consumed.add(id);
      const h = rowHeights.get(id);
      if (h) sum += h;
    }
    if (sum > 0) heights[index] = sum + chrome;
  });
  return heights;
}

/** The page-bottom reservation one block's first-reference notes need:
 * each note's zone row by id, and the zone chrome (separator, padding)
 * charged once wherever any of them lands. */
export interface BlockFootnoteReservation {
  /** Row height per note id, in reference order. */
  notes: Map<string, number>;
  /** Row pitch per note id (px): the step a continued note moves by. */
  pitches: Map<string, number>;
  chromePx: number;
  /** Rows plus chrome, 0 for a block that references no note. */
  totalPx: number;
}

/**
 * Section-aware structural measurement. The document's note stream is
 * numbered once, then each first-reference note is rendered only in the host
 * of its owning block. This keeps the rebalance hot path O(notes + hosts)
 * instead of re-rendering every document note once per referenced sheet.
 */
export function measureBlockFootnoteHeightsByHosts(
  doc: ProseMirrorNode,
  scanned: ReadonlyArray<ScannedFootnoteBlock>,
  hosts: readonly HTMLElement[],
): number[] | null {
  const reservations = measureBlockFootnoteReservationsByHosts(doc, scanned, hosts);
  return reservations ? reservations.map((reservation) => reservation.totalPx) : null;
}

/** The per-note reservation behind {@link measureBlockFootnoteHeightsByHosts}:
 * a paragraph cut at a page edge keeps the notes whose references sit
 * before the cut and hands the rest to the next page, as Word does. */
export function measureBlockFootnoteReservationsByHosts(
  doc: ProseMirrorNode,
  scanned: ReadonlyArray<ScannedFootnoteBlock>,
  hosts: readonly HTMLElement[],
): BlockFootnoteReservation[] | null {
  if (hosts.length !== scanned.length) return null;
  const reservations: BlockFootnoteReservation[] = scanned.map(() => ({ notes: new Map(), pitches: new Map(), chromePx: 0, totalPx: 0 }));
  const { footnotes, ownerBlockById } = footnoteMeasurementModel(doc, scanned);
  if (footnotes.length === 0) return reservations;
  const textStyle = footnoteTextStyleFromDocAttrs(doc.attrs);

  const notesByHost = new Map<HTMLElement, NumberedStreamNote[]>();
  for (const note of footnotes) {
    const ownerIndex = ownerBlockById.get(note.id);
    const host = ownerIndex === undefined ? undefined : hosts[ownerIndex];
    if (!host) continue;
    const group = notesByHost.get(host) ?? [];
    group.push(note);
    notesByHost.set(host, group);
  }

  // Every zone is measured in ONE contained host beside the editor
  // (renderedTextHead's task host): a layout-neutral clone of the editor
  // root holding a shallow clone of each sheet that has notes, the zone
  // inside it, so the zone reads the sheet's own width, padding and
  // typography. The zones used to be appended to the live sheets and removed
  // again, which dirtied the whole document twice a pass; on a 157-page
  // import every measurement that followed then paid a full-document layout
  // — about a second a keystroke. Nothing in the editor is touched now.
  const read = (slot: HTMLElement | null): void => {
    const pending: Array<[NumberedStreamNote[], PendingFootnoteZone]> = [];
    try {
      for (const [host, notes] of notesByHost) {
        let container = host;
        if (slot) {
          const sheet = host.cloneNode(false) as HTMLElement;
          sheet.removeAttribute("id");
          slot.append(sheet);
          container = sheet;
        }
        pending.push([notes, appendFootnoteZone(notes, host, textStyle, container)]);
      }
      for (const [notes, zone] of pending) {
        const { rowHeights, pitches, chrome } = readFootnoteZone(zone);
        for (const note of notes) {
          const ownerIndex = ownerBlockById.get(note.id);
          if (ownerIndex === undefined) continue;
          const reservation = reservations[ownerIndex];
          reservation.notes.set(note.id, rowHeights.get(note.id) ?? 0);
          reservation.pitches.set(note.id, pitches.get(note.id) ?? 0);
          reservation.chromePx = chrome;
        }
      }
    } finally {
      // The slot's clones go with the slot; a zone in a live host is removed.
      if (!slot) for (const [, { zone }] of pending) zone.remove();
    }
  };
  const root = hosts[0]?.parentElement ?? null;
  const hosted = root?.isConnected
    ? withRootMeasurementSlot(root, (slot) => {
        read(slot);
        return true;
      })
    : null;
  if (!hosted) read(null);
  for (const reservation of reservations) {
    let rows = 0;
    for (const height of reservation.notes.values()) rows += height;
    reservation.totalPx = rows > 0 ? rows + reservation.chromePx : 0;
  }
  return reservations;
}
