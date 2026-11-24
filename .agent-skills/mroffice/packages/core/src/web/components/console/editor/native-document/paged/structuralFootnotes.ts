"use client";























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { FOOTNOTE_MARK_NAME } from "../footnotes";
import { PAGE_BLOCK_NODE } from "./pageBlockExtension";
import { sheetedDocHasFootnoteRefs } from "./footnoteRefs";
import {
  computeSeamFootnotes,
  measureBlockFootnoteHeights,
  measureBlockFootnoteReservationsByHosts,
  type BlockFootnoteReservation,
  measureBlockFootnoteHeightsByHosts,
  type NoteZoneSlice,
  type SeamFootnotePageRange,
} from "./pagedFootnotes";
import type { PagedEditingSeamNote } from "./pagedEditingExtension";

export { sheetedDocHasFootnoteRefs };

export interface SheetBlockNoteRefs {
  noteRefs: Array<{ id: string; customMark: string | null }>;
}

/**
 * Per-block footnote markers in reading order across ALL sheets — one entry
 * per pageBlock child, matching the rebalancer's measured-heights indexing.
 * Non-page top-level strays are skipped (the rebalancer adopts them into a
 * sheet BEFORE measuring, so by measurement time the indexes agree). The
 * document-end footnoteList itself never charges (its markers are the note
 * BODIES, not references).
 */
export function scanSheetedBlockNoteRefs(
  doc: ProseMirrorNode,
): SheetBlockNoteRefs[] {
  const blocks: SheetBlockNoteRefs[] = [];
  doc.forEach((child) => {
    if (child.type.name !== PAGE_BLOCK_NODE) return;
    child.forEach((block) => {
      const noteRefs: SheetBlockNoteRefs["noteRefs"] = [];
      if (block.type.name !== "footnoteList") {
        block.descendants((node) => {
          if (node.type.name === FOOTNOTE_MARK_NAME) {
            const rawId = node.attrs?.noteId;
            if (typeof rawId === "string" && rawId) {
              const rawMark = node.attrs?.customMark;
              noteRefs.push({
                id: rawId,
                customMark:
                  typeof rawMark === "string" && rawMark.trim()
                    ? rawMark.trim().slice(0, 8)
                    : null,
              });
            }
          }
          return true;
        });
      }
      blocks.push({ noteRefs });
    });
  });
  return blocks;
}








export function computeSheetFootnoteZones(
  doc: ProseMirrorNode,
  slices?: ReadonlyMap<number, readonly NoteZoneSlice[]> | null,
): Map<number, PagedEditingSeamNote[]> {
  const pages: SeamFootnotePageRange[] = [];
  let pos = 0;
  let sheetIndex = 0;
  doc.forEach((child) => {
    if (child.type.name === PAGE_BLOCK_NODE) {
      pages.push({
        index: sheetIndex,
        ranges: [{ pmFrom: pos + 1, pmTo: pos + 1 + child.content.size }],
      });
      sheetIndex += 1;
    }
    pos += child.nodeSize;
  });
  if (pages.length === 0) return new Map();
  // No footnote marker anywhere: no zone (what the full walk returns too).
  if (!sheetedDocHasFootnoteRefs(doc)) return new Map();
  return computeSeamFootnotes(doc, pages, slices);
}

/**
 * The continued-footnote slices the page ledger last settled on, per editor
 * view: the ledger publishes them when a pass converges and the sheet
 * overlay reads them when it rebuilds the zones. Not document state — a
 * reload re-derives them from the layout.
 */
const sheetNoteSlicesByView = new WeakMap<object, { slices: Map<number, NoteZoneSlice[]>; trailingPages: number }>();

export function readSheetNoteSlices(view: object | null | undefined): Map<number, NoteZoneSlice[]> | null {
  return view ? (sheetNoteSlicesByView.get(view)?.slices ?? null) : null;
}

/** Pages after the last sheet that hold only continued footnote rows: the
 * overlay draws them after the last sheet (Word adds such pages). */
export function readSheetNoteContinuationPages(view: object | null | undefined): number {
  return view ? (sheetNoteSlicesByView.get(view)?.trailingPages ?? 0) : 0;
}

export function sheetNoteSlicesSignature(slices: ReadonlyMap<number, readonly NoteZoneSlice[]> | null | undefined): string {
  if (!slices || slices.size === 0) return "";
  return JSON.stringify(
    [...slices.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([page, list]) => [page, list.map((slice) => [slice.id, slice.start, slice.end, slice.continued, slice.continues])]),
  );
}

/** Store the slices for `view`; true when they differ from the last set. */
export function publishSheetNoteSlices(
  view: object,
  slices: Map<number, NoteZoneSlice[]>,
  trailingPages = 0,
): { changed: boolean; trailingChanged: boolean } {
  const previous = sheetNoteSlicesByView.get(view) ?? null;
  const trailingChanged = (previous?.trailingPages ?? 0) !== trailingPages;
  if (!trailingChanged && sheetNoteSlicesSignature(previous?.slices) === sheetNoteSlicesSignature(slices)) {
    return { changed: false, trailingChanged: false };
  }
  if (slices.size === 0 && trailingPages === 0) sheetNoteSlicesByView.delete(view);
  else sheetNoteSlicesByView.set(view, { slices, trailingPages });
  return { changed: true, trailingChanged };
}

/** Meta on the no-op transaction the ledger dispatches when the slices
 * change, so overlays listening to transactions rebuild their zones. */
export const SHEET_NOTE_SLICES_META = "sheetNoteSlices";

/**
 * The per-block page-bottom footnote cost for a SHEETED doc, aligned with the
 * rebalancer's reading-order heights. Returns null when the scan's block
 * count disagrees with `expectedBlocks` (mid-render mismatch — caller skips
 * the addend this pass rather than mischarging). All zeros for note-free
 * docs (fast path).
 */
/** The per-note form of {@link structuralFootnoteHeightAddend} for the page
 * ledger: each block's note rows by id and the zone chrome, so a text cut
 * can keep the notes referenced before it on its page. Null on the same
 * mid-render mismatch; all-empty reservations for a note-free document. */
export function structuralFootnoteReservations(
  doc: ProseMirrorNode,
  expectedBlocks: number,
  hosts: readonly HTMLElement[],
): BlockFootnoteReservation[] | null {
  const scanned = scanSheetedBlockNoteRefs(doc);
  if (scanned.length !== expectedBlocks || hosts.length !== scanned.length) return null;
  if (!scanned.some((block) => block.noteRefs.length > 0)) {
    return scanned.map(() => ({ notes: new Map(), pitches: new Map(), chromePx: 0, totalPx: 0 }));
  }
  return measureBlockFootnoteReservationsByHosts(doc, scanned, hosts);
}

export function structuralFootnoteHeightAddend(
  doc: ProseMirrorNode,
  expectedBlocks: number,
  hostOrHosts: HTMLElement | readonly HTMLElement[],
): number[] | null {
  const scanned = scanSheetedBlockNoteRefs(doc);
  if (scanned.length !== expectedBlocks) return null;
  if (!scanned.some((block) => block.noteRefs.length > 0)) {
    return new Array<number>(scanned.length).fill(0);
  }
  if (!Array.isArray(hostOrHosts)) {
    return measureBlockFootnoteHeights(
      doc,
      scanned,
      hostOrHosts as HTMLElement,
    );
  }
  if (hostOrHosts.length !== scanned.length) return null;
  // A note body wraps at the printable width of the sheet carrying its first
  // reference. The grouped measurer numbers the stream once and renders each
  // first-reference note in exactly one host, avoiding hosts x notes work.
  return measureBlockFootnoteHeightsByHosts(doc, scanned, hostOrHosts);
}
