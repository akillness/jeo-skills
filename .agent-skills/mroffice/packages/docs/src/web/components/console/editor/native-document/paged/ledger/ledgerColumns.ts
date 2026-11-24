/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Unequal-width newspaper columns inside one sheet.
 *
 * CSS multicol only knows equal tracks, so `unequalColumnProjection` places
 * every direct child of such a sheet into an exact track itself and reports
 * the blocks that straddle a track boundary as split candidates. Word cuts
 * those blocks at the boundary; this step materialises that cut as an
 * IN-SHEET continuation seam (both fragments stay in the same pageBlock, the
 * projector paints the tail in the next track) with the same lossless split
 * helpers a page edge uses. The seam is structural: the ledger reads it as a
 * column seam and never merges it while the two fragments sit in different
 * tracks.
 *
 * Planning happens at the SOURCE track width: the candidate is currently
 * painted whole in the following track, so the projector temporarily
 * measures it at the width it is being cut for.
 */
import type { Transaction } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { normalizeWordCompatibilityMode } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import {
  NOTE_LIST_NODE,
  isContinuationTail,
  isSplittableBlock,
  isTextSplittableBlock,
  measureCodeLineMetrics,
  measureTextLineBoxes,
  minimumTextSplitLines,
  planHeadLines,
  planNoteHeadCursor,
  planTextCutByChars,
} from "@mrnote/core/web/components/console/editor/native-document/paged/blockSplitting.ts";
import { applyContainerColumnSplit, isSplittableContainer, planContainerHead } from "@mrnote/core/web/components/console/editor/native-document/paged/containerSplitting.ts";
import {
  applyCodeBlockColumnSplit,
  applyNoteListColumnSplit,
  applyTableColumnSplit,
  applyTextBlockColumnSplit,
  collectPages,
  planRenderedTableFragment,
  REBALANCE_META,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import { measureUnequalColumnBlockAtWidth, unequalColumnProjectionForSheet } from "@mrnote/core/web/components/console/editor/native-document/paged/unequalColumnProjection.ts";
import { sheetBlockElements } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerAtoms.ts";
import { engineBlockLineCount } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerEngineLines.ts";
import { measureOutsideEditorObservation } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import type { LedgerMeasureCache } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerMeasureCache.ts";
import { MRNOTE_BLOCK_ID_ATTR } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { sheetsOf } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";

/**
 * Column cuts the ledger took back. The ledger joins a seam between two
 * fragments on one sheet unless the projector placed the tail in a later
 * track. A cut the projector then placed with both pieces in one track
 * (R13-D13: a paragraph cut for the narrow first column, both pieces drawn
 * in the second) was joined by the next pass and made again by the one
 * after, for as long as the passes lasted: the background never got past
 * it. A block the ledger joined so is not cut on that sheet again until the
 * layout's inputs change (an edit, fonts, the width): the ledger's own
 * composition stands.
 *
 * Refused is the cut that failed, not the block: the room its column had
 * when the projector cut it (`madeColumnCuts`), and only when the head now
 * stands whole in the next track with that same room left behind it -- the
 * projector's own cut did not fit the room it was made for, and would be
 * made again. A join of pieces cut in another layout (on the first open's
 * one long sheet, on another sheet, for a column whose room has since
 * changed) is no such failure: refused, the block was drawn whole on that
 * sheet for the rest of the layout while the plan cut it at the column's
 * foot, so the page ran into a third column the sheet does not have, the
 * verifier moved its last block on and the plan put it back (R482-D01:
 * "In-processing" cut at 19 px on the first open's sheet, joined on page 2
 * and never cut there again where 69 px were free; R372-D01 page 6).
 */
const refusedColumnCuts = new WeakMap<EditorView, Map<string, number[]>>();
/** The room (px) each block's last column cut was made for, by `blockId@sheet`. */
const madeColumnCuts = new WeakMap<EditorView, Map<string, number>>();
/** Rooms within this of each other are one room (the fragment rule's slack). */
const SAME_ROOM_PX = 0.5;

/** A seam the ledger joined inside one sheet with both pieces in one track:
 * `blockId@sheet`, and the room the head's track now leaves before it (the
 * projector's split candidate for the head; null when the head fits there). */
export interface JoinedColumnCut {
  key: string;
  roomPx: number | null;
}

/** `window.__dqc2RefuseAnyRoom = true` (A/B): every join in one track
 * refuses its block on that sheet at any room, as before. */
function refuseAnyRoom(view: EditorView): boolean {
  const win = view.dom.ownerDocument?.defaultView as (Window & { __dqc2RefuseAnyRoom?: boolean }) | null;
  return win?.__dqc2RefuseAnyRoom === true;
}

export function refuseColumnCuts(view: EditorView, joined: readonly JoinedColumnCut[]): void {
  if (joined.length === 0) return;
  const anyRoom = refuseAnyRoom(view);
  const made = madeColumnCuts.get(view);
  for (const { key, roomPx } of joined) {
    let room: number;
    if (anyRoom) room = Number.NaN;
    else {
      const madeFor = made?.get(key);
      if (madeFor === undefined || roomPx === null || Math.abs(madeFor - roomPx) > SAME_ROOM_PX) continue;
      room = madeFor;
    }
    let refused = refusedColumnCuts.get(view);
    if (!refused) refusedColumnCuts.set(view, (refused = new Map()));
    const rooms = refused.get(key) ?? [];
    rooms.push(room);
    refused.set(key, rooms);
  }
}

/** Whether the projector's cut of `key` for `roomPx` was refused (NaN: at any room). */
export function columnCutRefused(view: EditorView, key: string, roomPx: number): boolean {
  const rooms = refusedColumnCuts.get(view)?.get(key);
  return rooms !== undefined && rooms.some((room) => Number.isNaN(room) || Math.abs(room - roomPx) <= SAME_ROOM_PX);
}

/** The projector cut `key` for a column with `roomPx` left. */
export function noteColumnCutMade(view: EditorView, key: string, roomPx: number): void {
  let made = madeColumnCuts.get(view);
  if (!made) madeColumnCuts.set(view, (made = new Map()));
  made.set(key, roomPx);
}

export function clearRefusedColumnCuts(view: EditorView): void {
  refusedColumnCuts.delete(view);
  madeColumnCuts.delete(view);
}

/**
 * Cut the first block that straddles an unequal-track boundary. Returns the
 * transaction to dispatch, or null when no candidate yields a legal cut.
 */
export function planUnequalColumnSplit(view: EditorView, cache?: LedgerMeasureCache | null): Transaction | null {
  const pages = collectPages(view.state.doc);
  if (!pages) return null;
  // The measurement width is a property of the sheet, set and put back:
  // ProseMirror must not read either write as a change of the page, nor the
  // measurement cache as a reason to measure the sheet again.
  const writeUnobserved = (apply: () => void) =>
    measureOutsideEditorObservation(view, () => (cache ? cache.unrecorded(apply) : apply()));
  const sheets = sheetsOf(view.dom);
  if (sheets.length !== pages.length) return null;
  for (let sheetIndex = 0; sheetIndex < pages.length; sheetIndex += 1) {
    const sheet = sheets[sheetIndex];
    const projection = unequalColumnProjectionForSheet(sheet);
    if (!projection) continue;
    const page = pages[sheetIndex];
    for (const candidate of projection.splitCandidates) {
      if (candidate.blockIndex < 0 || candidate.blockIndex >= page.node.childCount) continue;
      const block = page.node.child(candidate.blockIndex);
      const blockId = block.attrs?.[MRNOTE_BLOCK_ID_ATTR];
      const cutKey = typeof blockId === "string" && blockId ? `${blockId}@${sheetIndex}` : null;
      if (cutKey && columnCutRefused(view, cutKey, candidate.availablePx)) continue;
      const dom = sheetBlockElements(sheet)[candidate.blockIndex];
      if (!(dom instanceof HTMLElement)) continue;
      const isCode = isSplittableBlock(block);
      const isText = isTextSplittableBlock(block);
      const isNotes = block.type.name === NOTE_LIST_NODE;
      const isContainer = isSplittableContainer(block);
      const isTable = block.type.name === "table";
      if (!isCode && !isText && !isNotes && !isContainer && !isTable) continue;
      let blockPos = page.pos + 1;
      for (let index = 0; index < candidate.blockIndex; index += 1) blockPos += page.node.child(index).nodeSize;
      const tr = view.state.tr;
      const changed = measureUnequalColumnBlockAtWidth(dom, candidate.measurementWidthPx, () => {
        if (isCode) {
          const metrics = measureCodeLineMetrics(dom, block, dom.offsetHeight);
          const headLines = planHeadLines(candidate.availablePx, metrics);
          return headLines !== null && applyCodeBlockColumnSplit(tr, sheetIndex, candidate.blockIndex, headLines);
        }
        if (isText) {
          // The same head the ledger's column-aware cut plans (ledgerAtoms'
          // text oracle): the fragment rule for the last row, Word's
          // page-bottom credit at a foot on the bottom margin, and no
          // widow/orphan floor for a block opening its column.
          const minLines = candidate.opensColumn ? 1 : minimumTextSplitLines(block.attrs?.widowControl);
          // Word's widow and orphan floors count the paragraph's lines, as
          // the oracle counts them: rows of its fragments before this one on
          // the sheet go with the head, rows of the ones after it with the
          // tail. Counted on the fragment alone, a middle fragment of three
          // rows under the paragraph's head in the same column (R486-D01
          // p4: 31 px left, two rows fit) saw a one-row widow, then a
          // one-row orphan, and was refused, while the plan cut it after two
          // rows: the second column was planned two rows longer than drawn
          // and every key's pass moved the page back.
          const floors = minLines > 1 && !columnCutFloorsAloneOn(view)
            ? paragraphRowsAround(pages, sheets, sheetIndex, candidate.blockIndex, minLines)
            : { rowsBefore: 0, rowsAfter: 0 };
          const cut = planTextCutByChars(dom, candidate.availablePx, minLines, true, null, {
            footCreditPx: candidate.footCreditPx ?? 0,
            ...floors,
          });
          if (!cut) return false;
          let cutPos: number;
          try {
            cutPos = view.posAtDOM(cut.node, cut.offset);
          } catch {
            return false;
          }
          const from = blockPos + 1;
          const to = blockPos + block.nodeSize - 1;
          if (cutPos <= from || cutPos >= to) return false;
          return applyTextBlockColumnSplit(tr, sheetIndex, candidate.blockIndex, cutPos);
        }
        if (isNotes) {
          const cut = planNoteHeadCursor(dom, candidate.availablePx);
          return cut !== null && applyNoteListColumnSplit(tr, sheetIndex, candidate.blockIndex, cut);
        }
        if (isContainer) {
          const plan = planContainerHead(dom, block, candidate.availablePx, {
            containerPos: blockPos,
            posAtDOM: (node, offset) => {
              try {
                return view.posAtDOM(node, offset);
              } catch {
                return null;
              }
            },
          });
          return plan !== null && applyContainerColumnSplit(tr, sheetIndex, candidate.blockIndex, plan);
        }
        const mode = normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode);
        const planned = planRenderedTableFragment(dom, block, candidate.availablePx, projection.capacityPx, 0, {
          overPageCantSplitStands: mode !== null && mode < 15,
          cellWidowControl: mode !== null && mode >= 15,
        });
        return planned !== null && applyTableColumnSplit(tr, sheetIndex, candidate.blockIndex, planned.plan, planned.cuts);
      }, writeUnobserved);
      if (!changed || !tr.docChanged) continue;
      if (cutKey) noteColumnCutMade(view, cutKey, candidate.availablePx);
      tr.setMeta(REBALANCE_META, true);
      tr.setMeta("addToHistory", false);
      return tr;
    }
  }
  return null;
}

/** `window.__dqc2ColumnCutFloorsAlone = true`: a projector column cut counts
 * the widow and orphan floors on the fragment alone, as before (A/B). */
function columnCutFloorsAloneOn(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __dqc2ColumnCutFloorsAlone?: boolean }) | null)?.__dqc2ColumnCutFloorsAlone === true;
}

/**
 * The rows of the paragraph that block `blockIndex` of sheet `sheetIndex` is
 * a fragment of, in its other fragments: before it on the same sheet (the
 * oracle's rows of the fragments already walked on the page) and after it,
 * on this sheet or the next ones. Each side is read only as far as the floor.
 */
function paragraphRowsAround(
  pages: NonNullable<ReturnType<typeof collectPages>>,
  sheets: readonly HTMLElement[],
  sheetIndex: number,
  blockIndex: number,
  minLines: number,
): { rowsBefore: number; rowsAfter: number } {
  const rowsOf = (node: PmNode, dom: HTMLElement | undefined): number =>
    engineBlockLineCount(node) ?? (dom ? measureTextLineBoxes(dom).length : 0);
  const page = pages[sheetIndex].node;
  let rowsBefore = 0;
  const own = sheetBlockElements(sheets[sheetIndex]);
  for (let index = blockIndex; index > 0 && rowsBefore < minLines && isContinuationTail(page.child(index)); index -= 1) {
    const before = page.child(index - 1);
    if (before.type.name !== page.child(index).type.name) break;
    const dom = own[index - 1];
    if (dom) rowsBefore += measureTextLineBoxes(dom).length;
  }
  let rowsAfter = 0;
  let sheet = sheetIndex;
  let index = blockIndex;
  let current = page.child(blockIndex);
  while (rowsAfter < minLines) {
    index += 1;
    if (index >= pages[sheet].node.childCount) {
      sheet += 1;
      index = 0;
      if (sheet >= pages.length || pages[sheet].node.childCount === 0) break;
    }
    const next = pages[sheet].node.child(index);
    if (next.type.name !== current.type.name || !isContinuationTail(next)) break;
    rowsAfter += rowsOf(next, sheetBlockElements(sheets[sheet])[index]);
    current = next;
  }
  return { rowsBefore, rowsAfter };
}
