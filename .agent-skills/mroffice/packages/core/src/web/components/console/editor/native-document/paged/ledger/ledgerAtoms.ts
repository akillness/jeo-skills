/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Ledger atoms — the measurement oracles.
 *
 * Builds the page-independent ledger from the live sheeted document:
 *
 *   - logical blocks: consecutive runtime continuation fragments (text/code
 *     `pageSplitContinuation`, container item continuations, table
 *     `pageTableContinuation`, note slices) fold back into ONE atom;
 *   - heights: each fragment's own border box (offsetHeight / layout rect —
 *     never an offsetTop delta, so no margin collapse leaks in), quantized to
 *     whole slots on a Word line grid, plus the footnote reservation of the
 *     block carrying a note's first reference; repeated table header clones
 *     inside tails are not charged twice;
 *   - spacing: the AUTHORED margins, read off an interior block's computed
 *     style, or through the page-edge-free measurement shell when the block
 *     currently sits at a sheet edge (where CSS zeroes its margin);
 *   - split oracle: the existing geometry planners (character bisection for
 *     text, line metrics for code, `planContainerHead`, `planTablePageCut`
 *     over measured rows, note cursors) called with the ledger's available
 *     space — page-independent inputs, page-independent answers.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { GAP_ADDS_AFTER_ATTR } from "../../paragraphSpacingAddsUp";
import {
  isContinuationTail,
  isSplittableBlock,
  isTextSplitCapableTypeName,
  isTextSplittableBlock,
  measureCodeLineMetrics,
  measureTextLineBoxes,
  minimumTextSplitLines,
  planNoteHeadFrom,
  planPictureLineCut,
  planTextCutByChars,
  NOTE_LIST_NODE,
  NOTE_SLICE_START_ATTR,
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
} from "../blockSplitting";
import { joinedTextRebreak, joinedTextRebreakWhy, renderedTextTailHeightPx } from "../renderedTextHead";
import { isClosedBoxRowSlicedAtomType, isRowSliceTail, isRowSlicedAtomType, rowSliceRange } from "../atomRowSlices";
import { isOverTallTextNode } from "../pageSpanExtension";
import { HEAD_PIECE_OVERRUN_PX, PAGE_EDGE_FIRST_ATTR, PAGE_EDGE_LAST_ATTR } from "../paginationProjectionKeys";
import { planRowSliceHead, rowSliceClosedSeamJoinPx, rowSliceRestPx, rowSliceSeamGapPx } from "../rowSliceSplitting";
import {
  containerContinuationJoinMargin,
  containerDeepCutKey,
  edgeTextblock,
  isContainerContinuationTail,
  isSplittableContainer,
  planContainerHead,
  splitContainerNode,
  tableSeamSignature,
  LIST_ITEM_SPLIT_BRIDGE_ATTR,
  LIST_ITEM_SPLIT_CONTINUATION_ATTR,
  type ContainerSplitPlan,
} from "../containerSplitting";
import {
  TABLE_CONTINUATION_ATTR,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_FRAGMENT_START_ROW_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_SOURCE_ROW_ATTR,
  TABLE_BLOCK_CONTINUATION_ATTR,
  TABLE_CELL_EMPTY_HEAD_ATTR,
  TABLE_CELL_EMPTY_TAIL_ATTR,
  fragmentTableWithinRow,
  mergeAdjacentTableFragmentsJson,
  type TableCellTextCut,
  type TableJsonNode,
} from "../tablePagination";
import { continuousBreaksStartingPage, isForcedBreakBlock, trailingBreakOf } from "../pageBlockExtension";
import { DOMSerializer } from "@tiptap/pm/model";
import { estimatedBlockFlow, estimatedBlockHeightPx } from "../provisionalEstimate";
import { measureOutsideEditorObservation } from "../../documentLayoutStatus";
import { blockLinePitchPx, COLUMN_REGIONS_ATTR, COLUMN_TABLE_FRAME, columnPagePlacedTable, sheetNoteColumns, unequalColumnPlacementForBlock, unequalColumnProjectionForSheet, type ColumnLineBreak } from "../unequalColumnProjection";

/** The text blocks balanced by lines in a multi-column section. */
const TEXT_PITCH_BLOCKS = "p, h1, h2, h3, h4, h5, h6";
import { SECTION_UNEQUAL_COLUMN_TRACKS_ATTR } from "../../sectionLayouts";
import { paragraphKeepFlag } from "../../paragraphPagination";
import { isNonPrintingEmptyTailBlock } from "../../sourceHardBreakTail";
import { trailingAutoLeadingCreditPx, trailingAutoLeadingCreditUnlaidPx } from "../pageEdgeLeading";
import { textEngineEnabled } from "../../../../../../lib/text-engine/flags";
import { HOLLOW_SHEET_ATTR } from "../pageSheetView";
import { countEngineCut, engineBlockHeightPx, engineBlockLineCount, engineCutCompare, engineTextCut, unlaidEngineBlock, unlaidEngineList, unlaidEngineKatexMathBlock, unlaidEngineMathBlock, unlaidEnginePicture, unlaidEngineReason, unlaidEngineTable, unlaidEngineTableRows, unlaidEngineTextCut, freezeEngineLineStarts, engineJoinedRows } from "./ledgerEngineLines";
import { collapseMargins, collapsedInnerMarginPx, type AuthoredMarginPx } from "../marginCollapse";
import { paginationLayoutRect, paginationLayoutScale } from "../paginationGeometry";
import { BAND_RUN_RIDE_ATTR, BAND_RUN_ROOM_ATTR, FLOAT_PAGE_ROOM_ATTR } from "../../../../../../lib/office-float-anchor";
import { bandBodyFloorPx, bandBoxesBySheet, type BandBoxesBySheet } from "../bandFloatExclusion";
import { normalizeWordCompatibilityMode } from "../../documentOverflowPunctuation";
import { SheetMeasureMemo, querySheetsAll, sheetsOf } from "../sheetMeasureMemo";
import { LINE_GRID_FIT_TOLERANCE_PX } from "../pageRebalance";
import {
  lineGridChargedEngineHeight,
  collectPages,
  keepsFollowingBlock,
  tableKeepsFollowingBlock,
  lineGridQuantizedContainerHeight,
  lineGridQuantizedTextBlockHeight,
  truncatedTextRoomPx,
  textLineGridRows,
  measurePageEdgeMargins,
  planEngineTableFragment,
  planRenderedTableFragment,
  planRenderedTableTail,
  renderedTableRowsForPlan,
  rowFloorPx,
  type RenderedTableRows,
  type TableCellTail,
  tableFragmentPair,
  blockColumnFlowGeometry,
  columnFlowGeometry,
  readCapacity,
  sheetColumnCount,
  splitRowBorderPastFoot,
} from "../pageRebalanceExtension";
import {
  sheetedDocHasFootnoteRefs,
  structuralFootnoteReservations,
} from "../structuralFootnotes";
import { footnotesAllowProgressiveLayout } from "../footnoteRefs";
import type {
  LedgerAtom,
  LedgerAtomKind,
  LedgerCut,
  LedgerSplitOracle,
  LedgerSplitRequest,
} from "./ledgerTypes";
import type { LedgerEdgeMargins, LedgerFragmentMeasure, LedgerMeasureCache } from "./ledgerMeasureCache";

/** A sheet the column projector lays out in tracks ends every column above
 * the page-wide footnote zone (projectUnequalColumnSheet's `footZonePx`). */
export function sheetProjectsFootZone(sheet: HTMLElement): boolean {
  return sheet.hasAttribute(SECTION_UNEQUAL_COLUMN_TRACKS_ATTR) && !sheet.hasAttribute(COLUMN_REGIONS_ATTR);
}

/**
 * The page-wide note zone (px) of each sheet: the rows of the notes first
 * referenced on it plus the zone chrome, from the per-block reservations in
 * reading order (`hostSheets[i]` is block i's sheet). The projector and the
 * ledger both read it, so they lay a column out to the same foot.
 */
export function projectedFootZonesPx(
  sheetCount: number,
  hostSheets: readonly number[],
  reservations: readonly { totalPx: number; chromePx: number; pitches?: ReadonlyMap<string, number> }[],
  /** Each sheet's column height (its text height): a zone never takes the
   * last two note rows of body from a column. A zone as tall as the page
   * (long notes, or a provisional sheet holding many references) left the
   * sheet no room at all, the ledger read that as a page with no geometry
   * and never laid the document out (R37-D14: 47 provisional sheets of 22
   * lines, Word 35 pages). Two rows is the body the single-column
   * continuation keeps (noteContinuationMinBodyPx). */
  columnHeightsPx?: readonly number[],
  /** Each sheet's footnote columns (sheetNoteColumns; 1 when one): the rows,
   * measured at a column's width, stand balanced across them. */
  noteColumns?: readonly number[],
): number[] {
  const rows = new Array<number>(sheetCount).fill(0);
  const chrome = new Array<number>(sheetCount).fill(0);
  const pitch = new Array<number>(sheetCount).fill(0);
  reservations.forEach((reservation, index) => {
    const sheet = hostSheets[index];
    if (sheet === undefined || !(reservation.totalPx > 0)) return;
    rows[sheet] += Math.max(0, reservation.totalPx - reservation.chromePx);
    chrome[sheet] = Math.max(chrome[sheet], reservation.chromePx);
    for (const value of reservation.pitches?.values() ?? []) {
      if (value > pitch[sheet]) pitch[sheet] = value;
    }
  });
  return rows.map((value, index) => {
    if (!(value > 0)) return 0;
    const columns = Math.max(1, Math.trunc(noteColumns?.[index] ?? 1));
    const balanced = columns <= 1
      ? value
      : pitch[index] > 0
        ? Math.ceil(value / pitch[index] / columns - 1e-6) * pitch[index]
        : value / columns;
    const zone = balanced + chrome[index];
    const height = columnHeightsPx?.[index];
    if (!(typeof height === "number" && height > 0)) return zone;
    return Math.min(zone, Math.max(0, height - pitch[index] * 2));
  });
}

/** A footnote first referenced on a column-projected sheet: it is charged
 * to no block (its page's zone is held out of every column instead), so the
 * plan needs to know where in its block the reference stands to tell which
 * planned page holds it (ledgerFootZonePlan). */
export interface LedgerZoneNote {
  id: string;
  /** Content offset of the reference in its logical block. */
  logicalOffset: number;
  /** The fragment holding the reference as the block stands now. */
  partIndex: number;
  /** The note's rows (px) and their pitch, and the zone chrome a page
   * holding it pays once. */
  heightPx: number;
  pitchPx: number;
  chromePx: number;
}

/** What the page-wide note zones of the column-projected sheets are made
 * from, for a plan that reads each page's zone from the references it puts
 * there rather than from where the fragments stand. */
export interface LedgerFootZones {
  /** Each sheet's flow capacity before its zone was taken off. */
  baseCapacities: number[];
  /** The sheets whose notes stand in a page-wide zone. */
  zoneSheets: boolean[];
  /** Each sheet's footnote columns. */
  noteColumns: number[];
  /** The notes by logical block, in reading order. */
  notes: Map<number, LedgerZoneNote[]>;
}

export interface LedgerPart {
  /** On a sheet drawn hollow (pageSheetView): `dom` is the sheet, the part
   * has no DOM of its own, its measurement is the one kept by its node. */
  hollow?: boolean;
  /** Doc position of the fragment node. */
  pos: number;
  node: PmNode;
  dom: HTMLElement;
  sheet: number;
  /** Index of the fragment inside its sheet. */
  childIndex: number;
  /** Physical body height of this fragment (px) — what it costs where it
   * stands, repeated table header clones included. */
  heightPx: number;
  /** Height of repeated header clones inside a continuation table fragment:
   * physical here, absent from the merged logical table. */
  repeatedHeaderPx: number;
  /** Internal spacing the merged logical block has between this fragment
   * and the previous one (a list item's trailing margin that the seam drops):
   * absent from the fragments' physical heights, present in the whole. */
  joinBeforePx: number;
  /** This part continues the previous one in the next exact unequal-width
   * column of the SAME sheet: a structural in-sheet seam the projector owns,
   * never a page decision the plan may merge. */
  columnSeamBefore: boolean;
  /** Word page-bottom Auto-leading credit of this fragment's last line — the
   * fragment may end that far past the page edge (fit test only). */
  creditPx: number;
  /** The footnotes this fragment first references: the content offset of
   * each reference inside the fragment and the page-bottom row its note
   * needs. Word prints a note at the bottom of the page its reference lands
   * on, so a cut inside the fragment keeps the notes referenced before it
   * and hands the rest to the next page. */
  notes: Array<{
    id: string;
    offset: number;
    /** The note's whole row span (px). */
    heightPx: number;
    /** The rows that stay with the reference (px): the whole note when it is
     * short, else its first rows; the rest may continue on later pages. */
    minPx: number;
    /** Row pitch (px) the continued rows move by. */
    pitchPx: number;
  }>;
  /** Zone chrome (separator, padding) charged once on any page that holds
   * one of this fragment's notes. */
  noteChromePx: number;
}

export interface LogicalBlock {
  index: number;
  kind: LedgerAtomKind;
  parts: LedgerPart[];
  /** Seams (by the index of the part after them) of a paragraph cut across
   * pages that an edit reached since the last pass: the lines on either side
   * no longer show where the paragraph would break, so the planner cuts it
   * again from the joined text (planTextHeadOnce). */
  editedSeams?: ReadonlySet<number>;
  /** Seams of a table row cut across pages (by the index of the part after
   * them) whose head cell row now has room for its tail's first word: how far
   * from the head piece's top (layout px) the stale row starts. The planner
   * cuts the head again above it (staleRowSeamKeepPx). */
  staleRowKeepPx?: ReadonlyMap<number, number>;
}

export interface LedgerBuild {
  atoms: LedgerAtom[];
  logical: LogicalBlock[];
  capacities: number[];
  /** The section of each sheet's first block, and each section's page
   * capacity (the last of its sheets): a planned page that opens with
   * another section than its sheet's takes that section's capacity. */
  sheetSections: number[];
  sectionCapacities: ReadonlyMap<number, number>;
  /** The newspaper columns of the sheet each section's capacity was read
   * on: that capacity is its column height times these. */
  sectionCapacityColumns?: ReadonlyMap<number, number>;
  /** Newspaper columns per sheet (1 when not columned); `capacities` is
   * already the flow capacity across them. */
  columns: number[];
  /** The page-wide note zones `capacities` already has taken off, as the
   * fragments stand, and what they are made from; null when no sheet has one. */
  footZones?: LedgerFootZones | null;
  /** Per sheet, the band tops its column region's columns end at. */
  bandTops?: (readonly (number | undefined)[] | null)[];
  /** Per single-column sheet, whether its capacity ends at a header or footer
   * object's top (bandBodyFloorPx): no line's Auto leading crosses into it. */
  bandFloored?: boolean[];
  sheets: HTMLElement[];
  /** Sheets measured again in this build: anything in them changed since the
   * last one (every sheet, without a cache). */
  changedSheets: ReadonlySet<HTMLElement>;
  /** Why each changed sheet was measured again (development trace). */
  changedWhy: ReadonlyMap<HTMLElement, string>;
  oracle: LedgerSplitOracle;
  /** Sheets every block of which the text engine laid out with no layout of
   * the page (docs-layout, past the horizon): the ledger may leave them
   * unread until the reader nears them (restoredLayoutMark's trust). */
  engineSheets?: ReadonlySet<HTMLElement>;
  /** Hollow sheets with a part whose measurement is not kept: to draw whole. */
  hollowMissing?: readonly number[];
  /** (Trace) why the first of them were drawn again. */
  hollowMissingWhy?: readonly string[];
  /** A build limited by a measurement horizon: the index of the first atom
   * left unmeasured (null when every atom was measured), and how many times
   * the planner read the height of such an atom (its plan then reached past
   * what was measured and is void). */
  horizon?: {
    firstEstimated: number | null;
    firstEstimatedWhy?: string | null;
    unknownWhys?: Record<string, number>;
    /** Parts past the horizon read only as estimates (the page checks them). */
    guessed?: number;
    reads: () => number;
  } | null;
}

/**
 * The capacity a planned page takes when it opens with another section than
 * the sheet drawn at its index (planLedgerPages' `sectionCapacityFor`), in
 * the planner's terms: it divides the value by the columns of the sheet at
 * that index to get one column's height. A section's capacity is read on one
 * of its own sheets, times THAT sheet's columns, so it is rescaled to the
 * columns of the sheet at the index. Taken as it is, a two-column section's
 * 1636 px opening a page where a one-column sheet stood was read as columns
 * of 1636 px (3272 px of flow), and a one-column section's 818 px on a
 * two-column sheet as a 409 px page: R280-D01's capacities changed with
 * whichever sheet each pass had drawn at an index, and the plan never settled
 * (15, 16 or 17 pages; Word 17). `columnPage: false` keeps the old reading.
 */
export function sectionCapacityForPlan(
  source: Pick<LedgerBuild, "sheetSections" | "sectionCapacities" | "sectionCapacityColumns" | "columns">,
  columnPage = true,
): (index: number, section: number) => number | null {
  return (index, section) => {
    const sheets = source.sheetSections ?? [];
    const sheetSection = sheets[Math.min(index, sheets.length - 1)];
    if (sheetSection === undefined || sheetSection === section) return null;
    const capacity = source.sectionCapacities?.get(section);
    if (capacity === undefined) return null;
    if (!columnPage) return capacity;
    const readOn = source.sectionCapacityColumns?.get(section);
    const here = source.columns[Math.min(index, source.columns.length - 1)];
    if (!readOn || !here || readOn === here) return capacity;
    return (capacity / readOn) * here;
  };
}

/**
 * How far a progressive pass measures (see buildLedger): every block that
 * opens on a sheet up to `fromSheet`, and from there on blocks until their
 * heights add up to `budgetPx` or they open past `maxSheet`. Blocks after
 * that are left unmeasured: their sheets are not laid out at all.
 */
export interface LedgerMeasureHorizon {
  fromSheet: number;
  budgetPx: number;
  maxSheet: number;
}

/** Text cut payload: PM content offset inside the LOGICAL block plus the
 * measured row top of the cut inside the fragment that hosts it. */
export interface TextCutPayload {
  logicalOffset: number;
  partIndex: number;
  rowTop: number;
}
export interface CodeCutPayload {
  /** Absolute line index (0-based) at which the tail starts. */
  line: number;
  lineHeightPx: number;
  chromePx: number;
}
export interface ContainerCutPayload {
  plan: ContainerSplitPlan;
  partIndex: number;
  /** Where in its fragment the cut falls, from the fragment's top (px): the
   * next cut of the same fragment is planned below it (`planContainerHeadCut`). */
  partOffsetPx?: number;
  /** A head planned below an earlier cut of the same fragment in the same
   * plan (`planContainerHeadInPart`): the whole children that cut left in its
   * head, and how many children the fragment had. Its `plan` counts from the
   * fragment's start; once a page cut made the earlier head a fragment of its
   * own, it is applied to the rest (`rebasedContainerPlan`). */
  chainedAfter?: number;
  partChildCount?: number;
}
export interface TableCutPayload {
  planned: ReturnType<typeof planRenderedTableFragment>;
  partIndex: number;
  /** A cut of this plan's own tail: the fragment's row its tail starts at, and
   * the fragment's rows that repeat above it. */
  tail?: TableTailState;
}

/** Where a plan's tail of a fragment stands (the fragment is laid out, the tail
 * is not yet). */
export interface TableTailState {
  row: number;
  headerRows: readonly number[];
  /** The row before `row` was cut through: the rest of it opens the tail. */
  rest?: {
    px: number;
    tails: readonly TableCellTail[];
    /** The rest as a one-row table (`table:row` keys and progress). */
    piece: TableJsonNode;
    /** How many cuts have gone through the row. */
    ordinal: number;
  };
}
export interface NotesCutPayload {
  cursor: { entry: number; offset: number };
  partIndex: number;
  /** Where the rest stands in the fragment as laid out (px below its top). */
  topPx?: number;
}
export interface RowsCutPayload {
  /** Index, in the whole list, of the first row after the cut. */
  row: number;
  partIndex: number;
}

/** An atom's height in each column of its region: its fragments' summed,
 * when every fragment that takes room is a block of one such region. */
function regionHeightsOf(measures: readonly LedgerFragmentMeasure[]): number[] | null {
  let heights: number[] | null = null;
  for (const measure of measures) {
    if (measure.hidden || measure.outOfFlow) continue;
    const own = measure.regionHeightsPx;
    if (!own || own.length < 2 || (heights && heights.length !== own.length)) return null;
    heights = heights ? heights.map((height, column) => height + own[column]) : [...own];
  }
  return heights;
}

/** A list's breaks over all its fragments (`LedgerAtom.regionBreaksPx`):
 * each fragment's after the ones before it, the seam between two one more.
 * Null unless every fragment in flow has them. */
function regionBreaksOf(measures: readonly LedgerFragmentMeasure[]): ColumnLineBreak[] | null {
  let breaks: ColumnLineBreak[] | null = null;
  let offsetPx = 0;
  for (const measure of measures) {
    if (measure.hidden || measure.outOfFlow) continue;
    const own = measure.regionBreaksPx;
    const heightPx = measure.regionHeightsPx?.[0];
    if (!own || heightPx === undefined) return null;
    if (breaks) breaks.push({ endPx: offsetPx, nextPx: offsetPx });
    else breaks = [];
    for (const cut of own) breaks.push({ endPx: offsetPx + cut.endPx, nextPx: offsetPx + cut.nextPx });
    offsetPx += heightPx;
  }
  return breaks;
}

/** `window.__docsListKeepNextOff = true` (A/B): a list's paragraphs keep
 * nothing with what follows the list, the older reading. */
function listKeepNextOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsListKeepNextOff?: boolean }).__docsListKeepNextOff === true;
}

const KEPT_LIST_NODES = new Set(["bulletList", "orderedList"]);

/** A list's paragraphs (its items', nested lists' too), in order. */
function listParagraphs(node: PmNode): PmNode[] {
  const out: PmNode[] = [];
  node.descendants((child) => {
    if (child.isTextblock) {
      out.push(child);
      return false;
    }
    return true;
  });
  return out;
}

/**
 * Whether a list travels with what follows it: its last paragraph keeps with
 * the next, as any paragraph of Word's does -- a list item is a paragraph to
 * Word (Windows Word, docx-look/pc2/probes/kc and corpus R484-D98: a kept
 * question, 94 kept answer items and an empty paragraph after ten lines move
 * to page 2 together). Read as a block, the list kept nothing with the next
 * one and a chain ended at it.
 */
function listKeepsFollowingBlock(node: PmNode | null): boolean {
  if (!node || !KEPT_LIST_NODES.has(node.type.name) || listKeepNextOff()) return false;
  const paragraphs = listParagraphs(node);
  const last = paragraphs[paragraphs.length - 1];
  return last !== undefined && keepsFollowingBlock(last);
}

/** Whether every paragraph of a list keeps with the next (`keptWithin`). */
function listKeptWithin(node: PmNode | null): boolean {
  if (!node || !KEPT_LIST_NODES.has(node.type.name) || listKeepNextOff()) return false;
  const paragraphs = listParagraphs(node);
  return paragraphs.length > 1 && paragraphs.every((paragraph) => paragraphKeepFlag(paragraph, "keepNext"));
}

function atomKind(node: PmNode): LedgerAtomKind {
  const name = node.type.name;
  if (name === "paragraph" || name === "heading") return "text";
  if (name === "codeBlock") return "code";
  if (name === "table") return "table";
  if (name === NOTE_LIST_NODE) return "notes";
  if (isRowSlicedAtomType(name)) return "rows";
  if (name === "pageBreak" || name === "sectionBreak") return "break";
  if (isSplittableContainer(node) || name === "bulletList" || name === "orderedList" || name === "taskList" || name === "blockquote" || name === "callout") return "container";
  return "object";
}

function isTailOf(previous: PmNode | null, node: PmNode): boolean {
  if (!previous || previous.type.name !== node.type.name) return false;
  if (isContinuationTail(node)) return true;
  // A list (quote, callout) cut right after a break typed in it is two
  // blocks to the plan: the page closes after the head, which ends with the
  // break, and the rest opens the next page (nestedBreakCutPlan). Folded
  // into one atom, the cut would be a seam the plan is free to join again.
  if (isContainerContinuationTail(node)) return trailingBreakOf(previous) === null;
  if (node.type.name === "table" && node.attrs?.[TABLE_CONTINUATION_ATTR] === true) return true;
  if (node.type.name === NOTE_LIST_NODE) {
    const start = node.attrs?.[NOTE_SLICE_START_ATTR];
    const offset = node.attrs?.noteSliceStartOffset;
    return (Number.isInteger(start) && (start as number) > 0) || (Number.isInteger(offset) && (offset as number) > 0);
  }
  if (isRowSliceTail(node)) return rowSliceRange(previous.attrs).end === rowSliceRange(node.attrs).start;
  return false;
}

/**
 * The bottom border closing the head of a table row broken across pages:
 * Word fits the row's lines to the page foot and draws that border below it
 * (pageRebalanceExtension planTableCellCuts), so the head may run past the
 * foot by it. A style read.
 */
function splitRowFootCreditPx(part: LedgerPart): number {
  // Word keeps the closing border above the foot too (pageRebalanceExtension
  // splitHeadClosingBorderPx); the head is charged its full height.
  if (!splitRowBorderPastFoot()) return 0;
  const node = part.node;
  if (node.type.name !== "table" || node.attrs.pageTableContinues !== true) return 0;
  if (node.lastChild?.attrs.pageTableRowContinues !== true) return 0;
  const table = part.dom instanceof HTMLTableElement ? part.dom : part.dom.querySelector<HTMLTableElement>("table");
  const row = table?.rows[table.rows.length - 1];
  if (!row) return 0;
  let border = 0;
  for (const cell of Array.from(row.cells)) {
    border = Math.max(border, Number.parseFloat(getComputedStyle(cell).borderBottomWidth) || 0);
  }
  return border;
}

/** inkLightLayer's INK_LIGHT_ATTR (a stroke drawn by its sheet's layer). */
const INK_LIGHT_STAND_IN_ATTR = "data-ink-light";

function isHidden(dom: HTMLElement): boolean {
  return dom.offsetHeight === 0 && getComputedStyle(dom).display === "none";
}

/**
 * The document-end note list when it draws nothing: footnotes are shown at
 * the feet of their pages and there is no endnote to list, so the list is an
 * empty, zero-height box. Word has nothing there at all. Charged like a
 * hidden break marker -- no height and no spacing -- it stays on the page
 * of the block before it; charged the spacing after that block, it could
 * not fit under a table that filled its page and opened a blank last page
 * of its own (WUA 056).
 */
function drawsNoNotes(part: LedgerPart): boolean {
  if (part.node.type.name !== NOTE_LIST_NODE) return false;
  if (part.dom.querySelector(".mrnote-footnote-list__entry")) return false;
  return part.dom.getBoundingClientRect().height < 0.5;
}

/**
 * A block that is NOT in the page's vertical flow.
 *
 * Word's anchored objects are the case: a `wrapNone` text box is positioned
 * against the page and the text runs under it, and a square/tight/through one
 * is a CSS float whose cost the browser has ALREADY charged to the blocks it
 * pushes aside. Charging the block its own height as well would invent page
 * height that neither Word nor the painted sheet has — the two-floating-box
 * poster that Word shows on one page opened on two.
 *
 * `wrapTopAndBottom` is deliberately NOT here: it is an ordinary full-width
 * block in Word too, and it is charged like one.
 *
 * An overlay's wrapper (a text box or a shape, `data-float-mode="overlay"`)
 * is a zero-height, position-relative box whose painted object is absolute
 * INSIDE it. It is named here explicitly rather than trusted to measure zero:
 * the ledger then says what the paper shows by definition, whatever a margin
 * or a line-grid rounding would have made of an empty box.
 */
function isOutOfVerticalFlow(dom: HTMLElement): boolean {
  if (dom.dataset.floatMode === "overlay") return true;
  // A floating table drawn at its page point on a page of columns
  // (tablePageFrame placeColumnPageTable): the column flow does not charge it.
  if (dom.dataset.tablePageFrame === COLUMN_TABLE_FRAME || columnPagePlacedTable(dom)) return true;
  // Unequal-width columns place EVERY block of the sheet absolutely in its
  // Word track; that position is the flow, not an anchor. Reading it as out
  // of flow charged each block zero height, so the ledger always pulled the
  // next page's content back and the overflow net pushed it out again.
  if (unequalColumnPlacementForBlock(dom)) return false;
  const style = getComputedStyle(dom);
  if (style.position === "absolute" || style.position === "fixed") return true;
  // An engine that does not resolve `float` answers "" rather than "none"
  // (jsdom does). Reading that as "floated" would charge EVERY block zero
  // height and silently stop the paginator, so an unresolved value is read as
  // the initial value the CSS spec gives it.
  const floated = style.float || style.cssFloat || "none";
  return floated !== "none" && floated !== "";
}

/**
 * The room each block's floating objects ask of its page below the block's
 * top, as the float pass published it (`floatPageRoomPx`: Word 2013 layout,
 * an object the text wraps around placed from its paragraph or line): the
 * largest of the objects inside the block, or the block's own when it is the
 * object. An overlay, a page-placed object and a Word 2010 document's object
 * with room for text beside it ask none -- Word keeps those on the page instead
 * (`keepFloatOnPage`). An object no longer floating (no anchor) is not read.
 */
/** A floating table's drop below its anchor, which a page or column opening
 * with it keeps (`tablePageFrame`'s `--table-frame-lead`). */
function tableFrameLead(dom: HTMLElement | null | undefined): { pageTopLeadPx?: number } {
  const raw = dom?.style?.getPropertyValue("--table-frame-lead");
  const lead = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(lead) && lead > 0 ? { pageTopLeadPx: lead } : {};
}

function floatPageRooms(view: EditorView): Map<HTMLElement, number> {
  const rooms = new Map<HTMLElement, number>();
  const root = view.dom as HTMLElement;
  // Sheet by sheet, an unchanged sheet's matches kept (querySheetsAll).
  for (const element of querySheetsAll(root, `[${FLOAT_PAGE_ROOM_ATTR}]:is([data-float-anchor], figure[data-float-band="true"])`)) {
    const room = Number.parseFloat(element.getAttribute(FLOAT_PAGE_ROOM_ATTR) ?? "");
    if (!(room > 0)) continue;
    for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
      if ((rooms.get(node) ?? 0) < room) rooms.set(node, room);
      if (node.parentElement?.hasAttribute("data-page-sheet")) break;
    }
  }
  return rooms;
}

/** The paragraph index (`#p[N]`) a docx source anchor names, the paragraph
 * itself or an object inside it; `null` for any other anchor. */
function sourceParagraphIndex(node: PmNode | null | undefined, own: boolean): number | null {
  const source = node?.attrs?.source as { sourceAnchor?: unknown; hostAnchor?: unknown } | null | undefined;
  // An object moved onto another paragraph is that paragraph's (floatReanchor).
  if (!own && typeof source?.hostAnchor === "string") {
    const moved = /#p\[(\d+)\]$/.exec(source.hostAnchor);
    return moved ? Number(moved[1]) : null;
  }
  const anchor = source?.sourceAnchor;
  if (typeof anchor !== "string") return null;
  // A paragraph split at a hard break is `#p[N]` and `#p[N]/seg[k]`.
  const match = own ? /#p\[(\d+)\](?:\/seg\[\d+\])?$/.exec(anchor) : /#p\[(\d+)\]\/(?!seg\[)/.exec(anchor);
  return match ? Number(match[1]) : null;
}

/** `window.__docsLineUnderPageObjectsOff = true`: a paragraph's line goes on
 * past the foot under its page-filling Top and Bottom picture, as before. */
function lineUnderPageObjectsOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsLineUnderPageObjectsOff?: boolean }).__docsLineUnderPageObjectsOff === true;
}

/** A picture with Top and Bottom wrapping that stands in the flow as its own
 * block (`data-float-mode="band"`), holding no text. */
function bandPictureBlock(dom: HTMLElement): boolean {
  if (lineUnderPageObjectsOff()) return false;
  const band = '[data-float-mode="band"][data-float-anchor]';
  return (dom.matches(band) || dom.querySelector(band) !== null) && !(dom.textContent ?? "").trim();
}

/** Whether the object `node` is drawn from the paragraph `next` (the block
 * after it). */
function drawnFromNextBlock(node: PmNode, next: PmNode | undefined): boolean {
  const host = sourceParagraphIndex(node, false);
  return host !== null && sourceParagraphIndex(next, true) === host;
}

/** A text block of one line: no taller than half a line more than its own
 * line height. */
function oneLineBlock(dom: HTMLElement, heightPx: number): boolean {
  const style = getComputedStyle(dom);
  const line = Number.parseFloat(style.lineHeight);
  const pitch = Number.isFinite(line) && line > 0 ? line : (Number.parseFloat(style.fontSize) || 16) * 1.3;
  return heightPx > 0 && heightPx <= pitch * 1.5;
}

/** Whether an anchored object was placed after the paragraph it is anchored
 * in: its source names the block before it and not the one after. */
function anchoredInBlockBefore(object: PmNode, before: PmNode | undefined, after: PmNode | undefined): boolean {
  const host = sourceParagraphIndex(object, false);
  if (host === null) return false;
  return sourceParagraphIndex(before, true) === host && sourceParagraphIndex(after, true) !== host;
}

/** Border-box height of one fragment in document px, page independent. */
/**
 * Border-box height of one rendered fragment in the sheet's flow. In a
 * multi-column sheet the flow is linear across the columns (capacity is
 * charged per column), so a block that wraps to the next column measures
 * its flow extent, not its bounding box.
 */
function fragmentBodyHeightPx(sheet: HTMLElement, dom: HTMLElement): number {
  if (isHidden(dom) || isOutOfVerticalFlow(dom)) return 0;
  const columns = sheetColumnCount(sheet);
  if (columns > 1) {
    const placement = unequalColumnPlacementForBlock(dom);
    const flow = placement
      ? { start: placement.flowStartPx, end: placement.flowEndPx }
      : (() => {
          const geometry = columnFlowGeometry(sheet, columns);
          return geometry ? blockColumnFlowGeometry(dom, geometry) : null;
        })();
    if (flow) return lineGridQuantizedContainerHeight(sheet, dom, lineGridQuantizedTextBlockHeight(sheet, dom, Math.max(0, flow.end - flow.start)));
  }
  const scale = paginationLayoutScale(dom);
  const rect = paginationLayoutRect(dom, scale);
  const live = rect.height > 0 ? rect.height : dom.offsetHeight;
  return lineGridQuantizedContainerHeight(sheet, dom, lineGridQuantizedTextBlockHeight(sheet, dom, live));
}

/**
 * INTERIM (pageSpanExtension OVER_TALL_TEXT_NODE_NAMES). A block of running
 * text that nothing could cut scrolls inside its one page: its box is then
 * as tall as the page while its words are not. It is charged by its words.
 * Read by its box, the block that was just found too tall would fit, lose
 * the verdict and the scroller with it, grow back and be found too tall
 * again. Only a block that is scrolling is read this way: every other
 * fragment is its box, to the fraction of a pixel.
 */
function readLedgerBlockHeight(part: LedgerPart, sheet: HTMLElement, columned: boolean, docAttrs: unknown): number {
  const readPage = () => scrolledTextHeightPx(part, fragmentBodyHeightPx(sheet, part.dom));
  // A column's width and balance are the projector's, and an over-tall block
  // is charged by its words.
  if (columned || !textEngineEnabled("docs") || isOverTallTextNode(part.node)) return readPage();
  // A floated paragraph (a Word drop cap frame, note-editor.css) is out of
  // the flow: the page reads it 0 tall, and the engine, which lays its words
  // as any paragraph's, charged its whole exact line. In a two-column region
  // under a one-column title that was the cap's 31.7 pt off the first column
  // (corpus R441-D01: two lines fewer than Word's there; R363-D01: one).
  // `window.__docsDropCapFlowOff = true` charges it as before (A/B).
  if (isOutOfVerticalFlow(part.dom) &&
      (part.dom.ownerDocument.defaultView as (Window & { __docsDropCapFlowOff?: boolean }) | null)?.__docsDropCapFlowOff !== true) {
    return 0;
  }
  return engineBlockHeightPx(part.node, part.dom.ownerDocument.defaultView, sheet.getAttribute("style"), docAttrs, readPage,
    (heightPx, lines) => lineGridChargedEngineHeight(sheet, part.dom, heightPx, lines));
}

const NO_GROUP_FOOT = { footPx: 0, drawnPx: 0 } as const;

/** An inline length: `3px`, `1pt`, or the `calc(4.33px)` a fragment's edge is drawn in. */
function cssLengthPx(value: string): number {
  const match = /(\d*\.?\d+)(px|pt)/.exec(value);
  if (!match) return 0;
  const number = Number.parseFloat(match[1]);
  return match[2] === "pt" ? number * (96 / 72) : number;
}

/**
 * A paragraph of a border group closes the box where a page ends it: its bottom
 * border and spacing are drawn there and not under a paragraph with the group
 * going on beneath it. A member moved to a page's foot so grew past the foot,
 * moved on, shrank, was taken back, and grew again, on every pass. The height
 * is the same wherever it stands; what the foot asks more is `footPx`, a debt
 * the page's fit charges as it takes a credit. The block after it could not fit
 * where this one with its closing edge does not, so the fit is exact.
 *
 * `drawnPx`: the closing edge is on the page now (its height holds it).
 */
function bottomEdgePx(dom: HTMLElement): number {
  return dom.hasAttribute("data-border-member")
    ? cssLengthPx(dom.style.borderBottomWidth) + cssLengthPx(dom.style.paddingBottom)
    : 0;
}

function borderGroupFootPx(dom: HTMLElement): { footPx: number; drawnPx: number } {
  const footPx = bottomEdgePx(dom);
  if (!(footPx > 0)) return NO_GROUP_FOOT;
  if (dom.getAttribute("data-border-group-bottom") === "open") return { footPx, drawnPx: 0 };
  if (dom.nextElementSibling) return NO_GROUP_FOOT;
  const sheet = dom.closest("article[data-page-sheet]");
  let nextSheet = sheet?.nextElementSibling ?? null;
  while (nextSheet && !nextSheet.matches("article[data-page-sheet]")) nextSheet = nextSheet.nextElementSibling;
  const next = nextSheet?.firstElementChild;
  return next?.hasAttribute("data-border-member") &&
    next.getAttribute("data-paragraph-borders") === dom.getAttribute("data-paragraph-borders")
    ? { footPx, drawnPx: footPx }
    : NO_GROUP_FOOT;
}

function scrolledTextHeightPx(part: LedgerPart, boxPx: number): number {
  if (!isOverTallTextNode(part.node)) return boxPx;
  const dom = part.dom;
  return dom.scrollHeight > dom.clientHeight + 1 ? Math.max(boxPx, dom.scrollHeight) : boxPx;
}

/** Height of repeated header clones inside a continuation table fragment —
 * a physical projection the merged logical table does not contain. */
/**
 * Whether the reconciler could join these two adjacent fragments of one
 * table (ledgerReconcile.mergeSeam → mergeAdjacentTableFragmentsJson).
 * Memoized by node identity: ProseMirror keeps an untouched node's identity
 * across transactions, so a pair is examined once.
 */
/** A rough height per node for blocks the engine cannot read (roughEstimate). */
const roughHeights = new WeakMap<PmNode, number>();
/** Measured against guessed heights, by editor root (roughScale). */
const roughTallies = new WeakMap<HTMLElement, { measured: number; guessed: number; samples: number }>();
/** The same with the estimate's spacing, for a hollow sheet's block. */
const roughFlows = new WeakMap<PmNode, { beforePx: number; heightPx: number; afterPx: number }>();
/** A hollow sheet's paragraph read from a probe (probeHollowBlock), by node. */
const hollowProbes = new WeakMap<PmNode, { column: number; reading: { heightPx: number; beforePx: number; afterPx: number } | null }>();
/** Probe readings a build takes at most (a first open's pass reads the
 * reader's pages first; the rest come in later passes). */
const HOLLOW_PROBES_PER_BUILD = 400;
/** Fragments of one paragraph from which those past the measurement horizon
 * are left unread: only a paragraph many pages long has as many. */
const LONG_CHAIN_PARTS = 8;
/** Whether a block can be planned with its sheet drawn hollow: it keeps a
 * measurement, a probe reading or the page estimate's guess, by node. */
export function plannableWithoutDom(node: PmNode): boolean {
  return nodeMeasures.has(node) || hollowProbes.has(node) || roughFlows.has(node);
}
/**
 * A block's measurement as a kept layout holds it (layoutSnapshot): null when
 * nothing exact is known, or for a block its column region charges (the region
 * is laid out, not its blocks).
 */
export function encodedBlockMeasure(node: PmNode): number[] | null {
  const measure = nodeMeasures.get(node);
  if (!measure || measure.regionCharged || measure.regionTied || measure.regionColumns !== undefined ||
      measure.linePitchPx !== undefined || measure.regionHeightsPx !== undefined) return null;
  const r = (value: number) => Math.round(value * 1000) / 1000;
  return [r(measure.heightPx), r(measure.repeatedHeaderPx), r(measure.creditPx), (measure.hidden ? 1 : 0) | (measure.outOfFlow ? 2 : 0), r(measure.marginBeforePx), r(measure.marginAfterPx)];
}

/** A kept layout's measurement stands for this block until the page reads it:
 * a far page's plan needs no DOM of it. */
export function seedBlockMeasure(node: PmNode, encoded: readonly number[] | null | undefined): void {
  if (!encoded || encoded.length !== 6) return;
  seededMeasures.add(node);
  verifiedBlocks.add(node);
  nodeMeasures.set(node, {
    heightPx: encoded[0]!, repeatedHeaderPx: encoded[1]!, creditPx: encoded[2]!,
    hidden: (encoded[3]! & 1) !== 0, outOfFlow: (encoded[3]! & 2) !== 0,
    marginBeforePx: encoded[4]!, marginAfterPx: encoded[5]!,
  });
}

/**
 * Each block read on the page that a kept layout seeded, held against what it
 * said: `seededReadings` counts them per editor. A kept layout read under other
 * conditions (a style sheet late, a table missing) is wrong nearly everywhere,
 * and the ledger stops believing it; a block or two differing here and there is
 * what any reading corrects by itself.
 */
function noteSeededReading(root: HTMLElement, node: PmNode, heightPx: number): void {
  const seeded = seededMeasures.has(node) ? nodeMeasures.get(node) : undefined;
  if (!seeded) return;
  seededMeasures.delete(node);
  const reading = seededReadings.get(root) ?? { read: 0, off: 0 };
  reading.read += 1;
  if (Math.abs(seeded.heightPx - heightPx) > 2.5) reading.off += 1;
  seededReadings.set(root, reading);
  const read = seededReadSince.get(root) ?? new Set<PmNode>();
  read.add(node);
  seededReadSince.set(root, read);
}
const seededReadings = new WeakMap<HTMLElement, { read: number; off: number }>();
const seededReadSince = new WeakMap<HTMLElement, Set<PmNode>>();

/** The blocks a kept layout seeded that the page has read since this was last asked. */
export function takeSeededReads(root: HTMLElement): ReadonlySet<PmNode> | null {
  const read = seededReadSince.get(root);
  if (!read?.size) return null;
  seededReadSince.delete(root);
  return read;
}

/** Whether what the page has read says the kept layout under it is not this
 * reader's. */
export function seededLayoutRefuted(root: HTMLElement): boolean {
  const reading = seededReadings.get(root);
  return Boolean(reading && reading.off >= 3 && reading.off * 4 >= reading.read);
}

export function forgetSeededReadings(root: HTMLElement): void {
  seededReadings.delete(root);
}

/** The seeded measurement goes: the kept layout is not this reader's. */
export function forgetBlockMeasure(node: PmNode): void {
  seededMeasures.delete(node);
  nodeMeasures.delete(node);
}

/**
 * Forget what this hollow page's blocks stand on: a face arrived or the paper
 * changed, and no DOM of theirs can say so. A block seeded from a kept layout
 * stands (its row's fonts were checked and it was read with every face in),
 * unless `seeded` says its settings changed too.
 */
export function forgetPageMeasures(page: PmNode, seeded = false): void {
  page.forEach((child) => {
    if (!seeded && seededMeasures.has(child)) return;
    forgetBlockMeasure(child);
  });
}

/**
 * Blocks read on a drawn page with every projection in (Word's Chinese spacing,
 * a formula's typeset box), or kept from a layout that was. Only such a layout
 * is one to keep: a far page planned from the engine or read before its
 * projection runs is what the reader corrects on arriving.
 */
const verifiedBlocks = new WeakSet<PmNode>();

export function markPageVerified(page: PmNode): void {
  page.forEach((child) => verifiedBlocks.add(child));
}

export function pageVerified(page: PmNode): boolean {
  let verified = true;
  page.forEach((child) => {
    if (verified && !verifiedBlocks.has(child)) verified = false;
  });
  return verified;
}

const documentsVerified = new WeakMap<PmNode, boolean>();

/** Whether every block of the document was read or kept from a layout that was. */
export function documentVerified(doc: PmNode): boolean {
  const known = documentsVerified.get(doc);
  if (known !== undefined) return known;
  let verified = true;
  doc.forEach((page) => {
    if (verified && !pageVerified(page)) verified = false;
  });
  // Only "yes" stands for good: blocks are read later without a new document.
  if (verified) documentsVerified.set(doc, true);
  return verified;
}

export function blockVerified(node: PmNode): boolean {
  return verifiedBlocks.has(node);
}

/** Whether a block of this page is read as taller than `capacityPx`: it stays
 * drawn, where it is cut or held to what its page can do. */
export function pageHoldsBlockOver(page: PmNode, capacityPx: number): boolean {
  let over = false;
  page.forEach((child) => {
    const measure = nodeMeasures.get(child);
    if (measure && !measure.hidden && !measure.outOfFlow && measure.heightPx > capacityPx + 1) over = true;
  });
  return over;
}

/** Whether every block of this page keeps an exact measurement: planned as it
 * stands, hollow, with nothing to read of it. */
export function pageMeasuresKept(page: PmNode): boolean {
  let kept = page.childCount > 0;
  page.forEach((child) => {
    if (kept && !nodeMeasures.has(child)) kept = false;
  });
  return kept;
}

const ZERO_HEIGHT_BLOCKS: Readonly<Record<string, true>> = { pageBreak: true, sectionBreak: true, columnBreak: true };
const ZERO_MEASURE: LedgerFragmentMeasure = { heightPx: 0, repeatedHeaderPx: 0, creditPx: 0, hidden: false, outOfFlow: false, marginBeforePx: 0, marginAfterPx: 0 };
const tableSeamJoinMemo = new WeakMap<PmNode, WeakMap<PmNode, boolean>>();
function tableSeamJoins(head: PmNode, tail: PmNode): boolean {
  let byTail = tableSeamJoinMemo.get(head);
  if (!byTail) {
    byTail = new WeakMap();
    tableSeamJoinMemo.set(head, byTail);
  }
  const known = byTail.get(tail);
  if (known !== undefined) return known;
  let joins: boolean;
  try {
    joins = mergeAdjacentTableFragmentsJson(head.toJSON(), tail.toJSON()) !== null;
  } catch {
    joins = false;
  }
  byTail.set(tail, joins);
  return joins;
}

function repeatedHeaderHeightPx(node: PmNode, dom: HTMLElement): number {
  if (node.type.name !== "table" || node.attrs?.[TABLE_CONTINUATION_ATTR] !== true) return 0;
  const table = dom.tagName === "TABLE" ? dom : dom.querySelector("table");
  if (!(table instanceof HTMLTableElement)) return 0;
  let repeated = 0;
  node.forEach((row, _offset, index) => {
    if (row.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) {
      const tr = table.rows[index];
      if (tr) repeated += tr.getBoundingClientRect().height / paginationLayoutScale(dom).y;
    }
  });
  return repeated;
}

/**
 * What joining a split row's two pieces takes off: the piece a split row
 * ends with stands at least the row's "At least" height on its own page, as
 * Word draws it there (pluginRegistry rowHeight), but the row joined is that
 * height only once, at least: max(both pieces' lines, the height). Read as
 * the two pieces' sum, a row that a late face had split never fitted its
 * page again (corpus R436-D23: a 465pt floor under 683 px of abstract,
 * joined 696 px on a page with 715 px, charged 683 + 620; its last line, and
 * the section after it, a page late). A negative join, 0 when nothing joins.
 */
export function splitRowFloorJoinPx(previous: Pick<LedgerPart, "node" | "dom">, part: Pick<LedgerPart, "node" | "dom">): number {
  const head = previous.node.lastChild;
  if (part.node.type.name !== "table" || head?.attrs?.[TABLE_ROW_CONTINUES_ATTR] !== true) return 0;
  // Only a seam the reconciler can join: charged joined, a seam it refuses
  // would be planned onto one page and pushed off again.
  if (!tableSeamJoins(previous.node, part.node)) return 0;
  let tailIndex = -1;
  part.node.forEach((row, _offset, index) => {
    if (tailIndex < 0 && row.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true) tailIndex = index;
  });
  const tail = tailIndex >= 0 ? part.node.child(tailIndex) : null;
  if (!tail || tail.attrs?.rowHeightRule === "exact" || tail.attrs?.[TABLE_SOURCE_ROW_ATTR] !== head.attrs?.[TABLE_SOURCE_ROW_ATTR]) return 0;
  const twips = Number(tail.attrs?.rowHeightTwips);
  const floorPx = twips > 0 ? twips / 15 : Number(tail.attrs?.rowHeight);
  if (!(floorPx > 0)) return 0;
  const tableOf = (dom: HTMLElement) => (dom instanceof HTMLTableElement ? dom : dom.querySelector<HTMLTableElement>("table"));
  const headTr = tableOf(previous.dom)?.rows[previous.node.childCount - 1];
  const tailTr = tableOf(part.dom)?.rows[tailIndex];
  if (!headTr || !tailTr) return 0;
  const scale = paginationLayoutScale(part.dom).y || 1;
  const headPx = headTr.getBoundingClientRect().height / (paginationLayoutScale(previous.dom).y || 1);
  const tailBox = tailTr.getBoundingClientRect();
  const tailPx = tailBox.height / scale;
  // The tail's own lines: each cell's content to its bottom padding.
  let linesPx = 0;
  for (const cell of Array.from(tailTr.cells)) {
    const last = cell.lastElementChild;
    const style = getComputedStyle(cell);
    const bottom = last ? last.getBoundingClientRect().bottom : cell.getBoundingClientRect().top + (Number.parseFloat(style.paddingTop) || 0) * scale;
    const contentPx = (bottom - tailBox.top) / scale + (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
    linesPx = Math.max(linesPx, contentPx);
  }
  const joinedPx = Math.max(headPx + linesPx, floorPx);
  const overstatedPx = headPx + tailPx - joinedPx;
  traceOracle({ kind: "split-row-join", headPx: Math.round(headPx * 10) / 10, tailPx: Math.round(tailPx * 10) / 10, linesPx: Math.round(linesPx * 10) / 10, floorPx: Math.round(floorPx * 10) / 10 });
  return overstatedPx > 0.5 ? -overstatedPx : 0;
}

/**
 * What a split row's two pieces, joined back, take off their sum: the row
 * whole is its two pieces' lines, its cells' padding drawn once (the head's
 * bottom and the rest's top padding go), at least its "At least" height. The
 * head piece stands taller than its lines where its cut left room, and both
 * pieces draw their own padding (R291-D02: pieces of 61.4 + 44.6 px for a row
 * of 94.9 whole). Negative, 0 unless `part` opens with the rest of the row
 * `previous` ends with.
 */
function splitRowWholeJoinPx(previous: Pick<LedgerPart, "node" | "dom"> | undefined, part: Pick<LedgerPart, "node" | "dom">): number {
  const head = previous?.node.lastChild;
  if (!previous || part.node.type.name !== "table" || head?.attrs?.[TABLE_ROW_CONTINUES_ATTR] !== true) return 0;
  if (!tableSeamJoins(previous.node, part.node)) return 0;
  let tailIndex = -1;
  part.node.forEach((row, _offset, index) => {
    if (tailIndex < 0 && row.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true) tailIndex = index;
  });
  const tail = tailIndex >= 0 ? part.node.child(tailIndex) : null;
  if (!tail || tail.attrs?.rowHeightRule === "exact" || tail.attrs?.[TABLE_SOURCE_ROW_ATTR] !== head.attrs?.[TABLE_SOURCE_ROW_ATTR]) return 0;
  const tableOf = (dom: HTMLElement) => (dom instanceof HTMLTableElement ? dom : dom.querySelector<HTMLTableElement>("table"));
  const headTr = tableOf(previous.dom)?.rows[previous.node.childCount - 1];
  const tailTr = tableOf(part.dom)?.rows[tailIndex];
  if (!headTr || !tailTr) return 0;
  // A row's own lines: each cell's content, its first block's space before
  // to its last line, with its padding and borders, whatever its vertical
  // alignment (a middle-aligned cell's lines stand lower in a taller row).
  const read = (tr: HTMLTableRowElement, scale: number) => {
    const box = tr.getBoundingClientRect();
    const cells = Array.from(tr.cells).map((cell) => {
      const style = getComputedStyle(cell);
      // Each edge is its padding and border, drawn once in the row whole.
      const padTopPx = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.borderTopWidth) || 0);
      const padBottomPx = (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
      const first = cell.firstElementChild;
      const last = cell.lastElementChild;
      if (!first || !last) return { linesPx: padTopPx + padBottomPx, padTopPx, padBottomPx, leadPx: 0 };
      const leadPx = Number.parseFloat(getComputedStyle(first).marginTop) || 0;
      const linesPx = padTopPx + padBottomPx + leadPx + (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / scale;
      return { linesPx, padTopPx, padBottomPx, leadPx };
    });
    return { heightPx: box.height / scale, cells };
  };
  const headRow = read(headTr, paginationLayoutScale(previous.dom).y || 1);
  const tailRow = read(tailTr, paginationLayoutScale(part.dom).y || 1);
  const twips = Number(tail.attrs?.rowHeightTwips);
  const floorPx = twips > 0 ? twips / 15 : Number(tail.attrs?.rowHeight) || 0;
  // Cell by cell when the pieces have the same cells (one cell's lines may
  // stand mostly in the head, another's in the rest: R291-D02 table 682,
  // pieces of 44.6 + 120 px for a row of 95); the tallest of each otherwise.
  // A cell whose rest is only its empty shell joins as its head (and the
  // other way round); a paragraph the cut carried on draws its space before
  // again on the rest, once in the row whole (R291-D02 table 682: a five-line
  // label cut 3 + 2 lines stood 61 + 45 px for a row of 95; each piece also
  // draws the cut edges' padding and border).
  const most = (values: number[]) => Math.max(0, ...values);
  const sameCells = headRow.cells.length === tailRow.cells.length &&
    head.childCount === headRow.cells.length && tail.childCount === tailRow.cells.length;
  const linesPx = sameCells
    ? most(headRow.cells.map((cell, index) => {
      const rest = tailRow.cells[index]!;
      const headCell = head.child(index);
      const restCell = tail.child(index);
      if (restCell.attrs?.[TABLE_CELL_EMPTY_TAIL_ATTR] === true) return cell.linesPx;
      if (headCell.attrs?.[TABLE_CELL_EMPTY_HEAD_ATTR] === true) return rest.linesPx;
      const carried = restCell.firstChild?.attrs?.[TABLE_BLOCK_CONTINUATION_ATTR] === true ? rest.leadPx : 0;
      return cell.linesPx + rest.linesPx - cell.padBottomPx - rest.padTopPx - carried;
    }))
    : most(headRow.cells.map((cell) => cell.linesPx)) + most(tailRow.cells.map((cell) => cell.linesPx)) -
      most(headRow.cells.map((cell) => cell.padBottomPx)) - most(tailRow.cells.map((cell) => cell.padTopPx));
  const wholePx = Math.max(linesPx, floorPx);
  const overstatedPx = headRow.heightPx + tailRow.heightPx - wholePx;
  traceOracle({ kind: "split-row-whole", headPx: Math.round(headRow.heightPx * 10) / 10, tailPx: Math.round(tailRow.heightPx * 10) / 10, wholePx: Math.round(wholePx * 10) / 10 });
  return overstatedPx > 0.5 ? -overstatedPx : 0;
}

/** Authored margins in px, free of page-edge suppression. */
/** A block's own margins as last read where nothing suppressed them (the
 * page-edge probe, or the block standing inside its sheet), by node. */
const authoredOwnMargins = new WeakMap<PmNode, { before: number; after: number }>();

function authoredMarginsPx(
  part: LedgerPart,
  edgeMargins: ReadonlyMap<HTMLElement, { before: number; after: number }>,
): { before: number; after: number } {
  const own = (() => {
    // A sheet-edge block paints with the page-edge margin rules; its authored
    // margins come from the batched interior-child probe.
    const probed = edgeMargins.get(part.dom);
    if (probed) {
      authoredOwnMargins.set(part.node, probed);
      return probed;
    }
    // Not probed (past what the pass measures, read for an estimate), a block
    // at its sheet's edge draws there with the space Word drops at a page's
    // top or foot: its computed margin on that side is 0. Planned from that
    // 0 on a page where it no longer stands at the edge, a long book's page
    // 474 took one more block, the pass that measured it found it 13 px over
    // and gave it back, and the two layouts alternated until the ledger
    // stopped (the 333 pages after it left in the face before the last one
    // came). The side the rule drops is the one last read without it.
    const edgeFirst = part.dom.hasAttribute(PAGE_EDGE_FIRST_ATTR);
    const edgeLast = part.dom.hasAttribute(PAGE_EDGE_LAST_ATTR);
    const known = edgeFirst || edgeLast ? authoredOwnMargins.get(part.node) : undefined;
    const css = getComputedStyle(part.dom);
    // A paragraph that draws the space after of the one before it on top of
    // its own (`paragraphSpacingAddsUp`) is charged its own: the ledger adds
    // the two itself.
    const added = Number.parseFloat(part.dom.getAttribute(GAP_ADDS_AFTER_ATTR) ?? "");
    const addedPx = Number.isFinite(added) && added > 0 ? (added * 96) / 72 : 0;
    const marginTop = Number.parseFloat(css.marginTop) || 0;
    const read = {
      before: marginTop < 0 && drawsIntoSpaceAbove(part.dom) ? marginTop : Math.max(0, marginTop - addedPx),
      after: Number.parseFloat(css.marginBottom) || 0,
    };
    if (!edgeFirst && !edgeLast) {
      authoredOwnMargins.set(part.node, read);
      return read;
    }
    return {
      before: edgeFirst && known ? known.before : read.before,
      after: edgeLast && known ? known.after : read.after,
    };
  })();
  const authored = authoredMarginResolver(edgeMargins);
  const before = collapseMargins(own.before, collapsedInnerMarginPx(part.dom, "top", authored));
  return {
    // Only a Top and Bottom picture drawn up into the space after the block
    // above it (floatingTextBoxLayout's negative band margin, corpus R90-D01)
    // takes that space back; the gap (ledgerGap) adds it to the space after.
    before: before < 0 && !drawsIntoSpaceAbove(part.dom) ? 0 : before,
    after: collapseMargins(own.after, collapsedInnerMarginPx(part.dom, "bottom", authored)),
  };
}

/** The negative margin-top (px, at most 0) a Top and Bottom shape band is
 * drawn up by (`floatingTextBoxLayout`'s `layoutBandRuns` and its lift to its
 * paragraph's top); 0 for anything else. */
function shapeBandLiftPx(dom: HTMLElement): number {
  if (!dom.matches('figure[data-float-band="true"]')) return 0;
  const lift = Number.parseFloat(dom.style.marginTop);
  return Number.isFinite(lift) && lift < 0 ? lift : 0;
}

function drawsIntoSpaceAbove(dom: HTMLElement): boolean {
  const band = dom.matches('[data-float-mode="band"]') ? dom : dom.querySelector<HTMLElement>('[data-float-mode="band"]');
  return !!band && (Number.parseFloat(band.style.marginTop) || 0) < 0;
}

/** Authored own margins the off-screen probe measured (sheet-edge blocks and
 * their collapse chains, which the page-edge rules paint at zero). */
function authoredMarginResolver(
  edgeMargins: ReadonlyMap<HTMLElement, { before: number; after: number }>,
): AuthoredMarginPx {
  return (element, edge) => {
    const probed = edgeMargins.get(element);
    return probed ? (edge === "top" ? probed.before : probed.after) : undefined;
  };
}

function contextualKeyOf(node: PmNode): string | null {
  const style = node.attrs?.docxStyleId;
  if (typeof style === "string" && style) return style;
  return node.type.name;
}

/**
 * The "same style" identities a block meets its neighbours with. A list's
 * are its paragraphs': the first item's above it, the last item's below.
 * Read as the list node ("bulletList", never contextual), two List Paragraph
 * lists one after the other, or a list and the List Paragraph after it, were
 * charged their 6 pt where a page seam parts them (the page-edge rules draw
 * it at zero, the plan pulled nothing across), where Word sets none.
 * `window.__docsListAtomContextualOff = true` reads the list node (A/B).
 */
function atomContextualSpacing(kind: LedgerAtomKind, first: PmNode, last: PmNode): Pick<LedgerAtom, "contextualKey" | "contextualSpacing" | "contextualKeyAfter" | "contextualSpacingAfter"> {
  const list = kind === "container" && /^(bulletList|orderedList|taskList)$/.test(first.type.name) && !listAtomContextualOff();
  const opening = (list ? edgeTextblock(first, "first") : null) ?? first;
  const own = { contextualKey: contextualKeyOf(opening), contextualSpacing: opening.attrs?.contextualSpacing === true };
  if (!list) return own;
  const closing = edgeTextblock(last, "last");
  if (!closing || closing === opening) return own;
  return { ...own, contextualKeyAfter: contextualKeyOf(closing), contextualSpacingAfter: closing.attrs?.contextualSpacing === true };
}

function listAtomContextualOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsListAtomContextualOff?: boolean }).__docsListAtomContextualOff === true;
}

/**
 * A floating table raised above the paragraph it is placed from (a negative
 * `w:tblpY`) that a page can hold moves to the next page whole, where it does
 * not fit: Word 16 leaves page 1 unused even with room for three rows
 * (t-fl5-raised; LibreOffice's floattable-tab-join files R92-D26 / R93-D02).
 * One placed at or below its paragraph breaks at the page foot exactly as a
 * table in the flow does, inside a row too (t-fl3-room, t-fl4-float; corpus
 * R280-D10), and moves only when no row fits. So does one placed from the
 * margin or the page (wps-position-parity T06), and a raised one taller than
 * a page (R91-D08 / R93-D12).
 */
export function raisedFloatingTableFits(
  kind: LedgerAtomKind,
  node: PmNode,
  heightPx: number,
  capacities: readonly number[],
): boolean {
  if (kind !== "table") return false;
  const positioning = node.attrs?.tablePositioning as {
    verticalAnchor?: unknown;
    vertical?: { mode?: unknown; twips?: unknown } | null;
  } | null | undefined;
  if (!positioning || typeof positioning !== "object" || positioning.verticalAnchor !== "text") return false;
  const vertical = positioning.vertical;
  if (vertical?.mode !== "offset" || typeof vertical.twips !== "number" || !(vertical.twips < 0)) return false;
  return heightPx <= Math.max(0, ...capacities) + 0.5;
}

function splittableOf(kind: LedgerAtomKind, node: PmNode): boolean {
  switch (kind) {
    case "text":
      return isTextSplittableBlock(node);
    case "code":
      return isSplittableBlock(node);
    case "container":
      return isSplittableContainer(node);
    case "table":
      return !paragraphKeepFlag(node, "keepLines");
    case "notes":
    case "rows":
      return true;
    default:
      return false;
  }
}

/** The join last read at a seam, by its tail fragment's element. */
const seamJoins = new WeakMap<HTMLElement, { head: HTMLElement; headNode: PmNode; tailNode: PmNode; px: number }>();

/**
 * The join between two fragments of one block, read again only when either
 * fragment's sheet changed: both kept their measurements (the measure cache
 * saw no change on their sheets and they are the same nodes), so the rows and
 * margins the join is read from are as they were. Every seam of a long table
 * of contents or reference list was read on every key typed anywhere in the
 * book (row queries and boxes on two sheets each). (A container's join reads
 * the edge probe, which runs again for such seams each pass: not kept.)
 */
function keptSeamJoin(
  head: LedgerPart,
  tail: LedgerPart,
  kept: ReadonlyMap<LedgerPart, LedgerFragmentMeasure>,
  read: () => number,
): number {
  const known = seamJoins.get(tail.dom);
  if (known && kept.has(head) && kept.has(tail) && known.head === head.dom &&
      known.headNode === head.node && known.tailNode === tail.node) return known.px;
  const px = read();
  seamJoins.set(tail.dom, { head: head.dom, headNode: head.node, tailNode: tail.node, px });
  return px;
}

/** Group the sheeted document into logical blocks with their live DOM. */
/** True when two adjacent fragments of one block sit in two exact
 * unequal-width columns of the same sheet (the projector placed the tail in
 * a later track). Such a seam is structural, not a stale page decision. */
function isUnequalColumnSeam(headDom: HTMLElement, tailDom: HTMLElement): boolean {
  if (headDom.parentElement !== tailDom.parentElement) return false;
  const head = unequalColumnPlacementForBlock(headDom);
  const tail = unequalColumnPlacementForBlock(tailDom);
  return Boolean(head && tail && tail.columnIndex > head.columnIndex);
}

/** Seam `seamIndex` of `block` (between parts seamIndex and seamIndex+1)
 * is an in-sheet unequal-column seam. */
export function isColumnSeam(block: LogicalBlock, seamIndex: number): boolean {
  return block.parts[seamIndex + 1]?.columnSeamBefore === true;
}

/** The block node views of a sheet, in order, without decoration widgets. */
export function sheetBlockElements(sheet: HTMLElement): HTMLElement[] {
  // Every pass asks this of every sheet of the document, several times: a
  // sheet's list is kept while nothing in it changed (SheetMeasureMemo).
  const root = sheet.parentElement;
  let memo = root ? sheetBlockMemos.get(root) : undefined;
  if (root && !memo) sheetBlockMemos.set(root, (memo = new SheetMeasureMemo<readonly HTMLElement[]>(root)));
  const kept = memo?.get(sheet, null);
  if (kept) return kept.slice();
  const blocks = (Array.from(sheet.children) as HTMLElement[]).filter((child) => !child.classList.contains("ProseMirror-widget"));
  memo?.set(sheet, null, blocks);
  return blocks.slice();
}

const sheetBlockMemos = new WeakMap<HTMLElement, SheetMeasureMemo<readonly HTMLElement[]>>();

export function scanLogicalBlocks(view: EditorView): { logical: LogicalBlock[]; sheets: HTMLElement[] } | null {
  const doc = view.state.doc;
  const pages = collectPages(doc);
  if (!pages) return null;
  const sheets = sheetsOf(view.dom);
  if (sheets.length !== pages.length) return null;
  const logical: LogicalBlock[] = [];
  let previousNode: PmNode | null = null;
  for (let sheetIndex = 0; sheetIndex < pages.length; sheetIndex += 1) {
    const page = pages[sheetIndex];
    const sheet = sheets[sheetIndex];
    // Decoration widgets (footnote zones, page bands) sit among the block
    // node views; only the node views correspond to the page's children.
    // A hollow sheet holds no block DOM: its parts are its page's blocks.
    const hollow = sheet.hasAttribute(HOLLOW_SHEET_ATTR);
    const blockDoms = hollow ? [] : sheetBlockElements(sheet);
    if (!hollow && blockDoms.length !== page.node.childCount) return null;
    let pos = page.pos + 1;
    for (let childIndex = 0; childIndex < page.node.childCount; childIndex += 1) {
      const node = page.node.child(childIndex);
      const dom = hollow ? sheet : blockDoms[childIndex];
      if (!(dom instanceof HTMLElement)) return null;
      const part: LedgerPart = { pos, node, dom, sheet: sheetIndex, childIndex, heightPx: 0, repeatedHeaderPx: 0, joinBeforePx: 0, creditPx: 0, columnSeamBefore: false, notes: [], noteChromePx: 0, ...(hollow ? { hollow: true } : {}) };
      if (isTailOf(previousNode, node) && logical.length > 0) {
        const block = logical[logical.length - 1];
        const previous = block.parts[block.parts.length - 1];
        part.columnSeamBefore = previous.sheet === sheetIndex && isUnequalColumnSeam(previous.dom, part.dom);
        block.parts.push(part);
      } else {
        logical.push({ index: logical.length, kind: atomKind(node), parts: [part] });
      }
      previousNode = node;
      pos += node.nodeSize;
    }
  }
  return { logical, sheets };
}

/**
 * Build the ledger from the live sheets. With a `cache`, the sheets nothing
 * changed in keep the measurements of the pass before (ledgerMeasureCache):
 * only changed sheets are read again and only changed sheet-edge blocks are
 * probed, so a keystroke costs its own page, not the document.
 */
export function buildLedger(
  view: EditorView,
  cache?: LedgerMeasureCache | null,
  measureHorizon?: LedgerMeasureHorizon | null,
): LedgerBuild | null {
  const scanned = scanLogicalBlocks(view);
  if (!scanned) return null;
  const { logical, sheets } = scanned;
  cache?.flush();
  const doc = view.state.doc;
  const pageStarters = continuousBreaksStartingPage(doc);
  const columns = sheets.map((sheet) => Math.max(1, sheetColumnCount(sheet)));
  const bandFloored = sheets.map(() => false);
  // The overlay's band boxes, read once for all the sheets (not per sheet;
  // `window.__docsBandBoxesOnceOff = true`: per sheet, as before).
  const bandBoxesOnce =
    (view.dom.ownerDocument.defaultView as (Window & { __docsBandBoxesOnceOff?: boolean }) | null)?.__docsBandBoxesOnceOff !== true;
  let bandBoxes: BandBoxesBySheet | null | undefined;
  const capacities = sheets.map((sheet, index) => {
    const capacity = readCapacity(view, sheet);
    if (columns[index] > 1) return capacity * columns[index];
    // A header or footer object with no strip beside it ends the body's text
    // at its top (bandBodyFloorPx).
    if (bandBoxesOnce && bandBoxes === undefined) bandBoxes = bandBoxesBySheet(view);
    const floor = bandBodyFloorPx(view, index, sheet, bandBoxes);
    if (floor === null || !(floor < capacity)) return capacity;
    bandFloored[index] = true;
    return floor;
  });
  // Fragments whose sheet is unchanged keep their measurements; a sheet with
  // any fragment to measure again changed in this pass.
  const kept = new Map<LedgerPart, LedgerFragmentMeasure>();
  const changed = new Set<HTMLElement>(cache ? [] : sheets);
  const changedWhy = new Map<HTMLElement, string>();
  // The parts of a hollow sheet stand as they were last measured or read;
  // one with no measurement kept has its sheet drawn whole again.
  const hollowMissing = new Set<number>();
  const hollowMissingWhy: string[] = [];
  // docs-layout: a hollow sheet past what the pass measures is planned from
  // the page estimate's guess for each block it never measured (a long
  // document opens with every page but the first few hollow: drawn whole to
  // be measured, its DOM was the book's 99k nodes before a page showed).
  const roughBeyond = textEngineEnabled("docs-layout") && cache && measureHorizon ? measureHorizon.maxSheet : null;
  for (const block of logical) {
    for (const part of block.parts) {
      if (!part.hollow) continue;
      const measure = nodeMeasures.get(part.node);
      // A block taller than its page is cut on its drawn page, with its own
      // lines or rows to read: a sheet standing hollow would stand over-tall.
      if (measure && measure.heightPx > capacities[part.sheet]! + 1 && !measure.hidden && !measure.outOfFlow) {
        hollowMissing.add(part.sheet);
        if (hollowMissingWhy.length < 12) hollowMissingWhy.push(`${part.sheet}:over:${Math.round(measure.heightPx)}>${Math.round(capacities[part.sheet]!)}`);
      }
      if (measure) kept.set(part, measure);
      else if (roughBeyond === null || part.sheet <= roughBeyond) {
        hollowMissing.add(part.sheet);
        if (hollowMissingWhy.length < 12) hollowMissingWhy.push(`${part.sheet}:none:${part.node.type.name}:${part.node.nodeSize}`);
      }
    }
  }
  if (cache) {
    for (const block of logical) {
      for (const part of block.parts) {
        if (part.hollow) continue;
        const sheet = sheets[part.sheet];
        const measure = cache.fragment(part.dom, part.node, sheet);
        if (measure) {
          kept.set(part, measure);
          nodeMeasures.set(part.node, measure);
        }
        else {
          if (!changed.has(sheet)) changedWhy.set(sheet, cache.explainMiss(part.dom, part.node, sheet));
          changed.add(sheet);
        }
      }
    }
  }
  // The one DOM write of a build happens first: every sheet-edge block's
  // authored margins in a single off-screen shell. Everything after is a read.
  // The edge set is the one the page-edge rules paint: the first block, the
  // first block that is not a non-printing source-break tail, and the last.
  // A sheet past the horizon is not probed: nothing on it is measured.
  const horizon = cache && measureHorizon ? measureHorizon : null;
  const edgeIndexes = sheets.map((sheet, index) => {
    if (horizon && index > horizon.maxSheet) return new Set<number>();
    const blocks = sheetBlockElements(sheet);
    const lead = blocks.findIndex((element) => element.getAttribute("data-mrnote-source-break-tail") !== "true");
    return new Set([0, lead, blocks.length - 1]);
  });
  const edgeBlocks = new Map<HTMLElement, HTMLElement[]>();
  const edgeMargins = new Map<HTMLElement, LedgerEdgeMargins>();
  const probed: LedgerPart[] = [];
  for (const block of logical) {
    for (const part of block.parts) {
      if (part.hollow || !edgeIndexes[part.sheet].has(part.childIndex)) continue;
      // A kept fragment already carries its margins. A fragment of a
      // container cut over pages is read again all the same: the join
      // between two fragments (containerContinuationJoinMargin) reads the
      // authored margins of their edge blocks' descendants from this probe,
      // and a kept fragment answered with its painted, edge-suppressed ones.
      // A document pasted into one list item: the 24 px after item 1's rule
      // read 0 whenever the first sheet was kept, the planner pulled item 2's
      // empty line back onto it, the next pass (sheet re-measured) found it
      // 52 px over, and the ledger cycled with the rest of the item uncut on
      
      if (kept.has(part) && !(block.kind === "container" && block.parts.length > 1)) continue;
      const known = cache?.edgeProbe(part.dom, part.node);
      if (known) {
        for (const [element, margins] of known) edgeMargins.set(element, margins);
        continue;
      }
      const sheet = sheets[part.sheet];
      const list = edgeBlocks.get(sheet) ?? [];
      list.push(part.dom);
      edgeBlocks.set(sheet, list);
      probed.push(part);
    }
  }
  const measuredEdges = edgeBlocks.size > 0 ? measurePageEdgeMargins(sheets, edgeBlocks) : new Map<HTMLElement, LedgerEdgeMargins>();
  for (const [element, margins] of measuredEdges) edgeMargins.set(element, margins);
  if (cache) {
    for (const part of probed) {
      const entries: Array<[HTMLElement, LedgerEdgeMargins]> = [];
      for (const [element, margins] of measuredEdges) {
        if (element === part.dom || part.dom.contains(element)) entries.push([element, margins]);
      }
      cache.storeEdgeProbe(part.dom, part.node, entries);
    }
  }
  const authoredMargin = authoredMarginResolver(edgeMargins);

  // Footnote reservation per doc block (first-reference discipline).
  const partCount = logical.reduce((sum, block) => sum + block.parts.length, 0);
  let footnoteReservations: ReturnType<typeof structuralFootnoteReservations> = null;
  if (sheetedDocHasFootnoteRefs(doc)) {
    const hosts = sheets.flatMap((sheet) => Array.from({ length: sheetBlockElements(sheet).length }, () => sheet));
    // The note rows are measured in a scratch zone inside each sheet; keep
    // that probe out of ProseMirror's DOM observer (see the helper) and out
    // of the measure cache's change record.
    const measureNotes = () => structuralFootnoteReservations(doc, partCount, hosts);
    footnoteReservations = measureOutsideEditorObservation(view, () =>
      cache ? cache.unrecorded(measureNotes) : measureNotes());
  }
  // The note zone of a column-projected sheet spans the page and every column
  // ends above it (projectUnequalColumnSheet): the page has that much less
  // room in each of its columns, exactly as the projector lays them out.
  // Charged once on the referencing block instead, the plan filled the last
  // column to the margin, the projector could not hold it and the two
  // cycled until pagination stalled (WUA 015: three columns, a tall table).
  const zoneSheets = sheets.map((sheet, index) => columns[index] > 1 && sheetProjectsFootZone(sheet));
  const footZones: LedgerFootZones | null = footnoteReservations && zoneSheets.some(Boolean)
    ? { baseCapacities: [...capacities], zoneSheets, noteColumns: sheets.map((sheet) => sheetNoteColumns(sheet)?.count ?? 1), notes: new Map() }
    : null;
  if (footnoteReservations && footZones) {
    const hostSheets = logical.flatMap((block) => block.parts.map((part) => part.sheet));
    const zones = projectedFootZonesPx(sheets.length, hostSheets, footnoteReservations,
      capacities.map((capacity, index) => capacity / columns[index]),
      footZones.noteColumns);
    zones.forEach((zone, index) => {
      if (zoneSheets[index] && zone > 0) capacities[index] = Math.max(0, capacities[index] - zone * columns[index]);
    });
  }

  const docAttrs: unknown = view.state.doc.attrs;
  // Harness switch (`window.__docsUnlaidCompare = []`): each block the engine
  // estimated with no layout, held against the page once its page is laid
  // out -- which kinds of estimate the plan could trust.
  const unlaidCompare = (view.dom.ownerDocument.defaultView as (Window & { __docsUnlaidCompare?: unknown[] }) | null)?.__docsUnlaidCompare;
  const compareWithEstimate = Array.isArray(unlaidCompare)
    ? (part: LedgerPart, drawnPx: number) => {
        const estimate = unlaidEstimates.get(part.node);
        if (!estimate) return;
        unlaidEstimates.delete(part.node);
        if (unlaidCompare.length >= 5000) return;
        unlaidCompare.push({ kind: estimate.kind, approximate: estimate.approximate, estimate: Math.round(estimate.heightPx * 100) / 100, drawn: Math.round(drawnPx * 100) / 100, text: part.node.textContent.slice(0, 40) });
      }
    : null;
  // A stroke of ink drawn by its sheet's layer stands in the flow as an empty
  // hidden figure (inkLightLayer's LightInkView), all of them alike: what one
  // measures, every other one of the same sheet measures. Read once per sheet
  // and pass, a 3000-stroke note's first pass no longer asked the style and
  // layout of each (WebKit: 70-180 ms of the opening). Not for one at the
  // sheet's edge (its margins are probed with the page-edge rules) nor on a
  // page of unequal columns (each block has its own track).
  const lightMeasures = new Map<number, LedgerFragmentMeasure>();
  const lightStandIn = (part: LedgerPart): boolean =>
    part.dom.hasAttribute(INK_LIGHT_STAND_IN_ATTR) && part.dom.style.display === "none" &&
    !edgeMargins.has(part.dom) && !unequalColumnPlacementForBlock(part.dom) &&
    !(view.dom.ownerDocument.defaultView as (Window & { __mraiLedgerEachStroke?: boolean }) | null)?.__mraiLedgerEachStroke;
  const measure = (part: LedgerPart): LedgerFragmentMeasure => {
    const known = kept.get(part);
    if (known) return known;
    // A hollow sheet's block nothing measured (past the pass's horizon): no
    // DOM to read; the page estimate's guess.
    if (part.hollow) return roughEstimate(part) ?? ZERO_MEASURE;
    const sheet = sheets[part.sheet];
    const standIn = lightStandIn(part);
    const alike = standIn ? lightMeasures.get(part.sheet) : undefined;
    if (alike) {
      const fresh: LedgerFragmentMeasure = { ...alike };
      cache?.storeFragment(part.dom, part.node, sheet, fresh);
      noteSeededReading(view.dom, part.node, fresh.heightPx);
      nodeMeasures.set(part.node, fresh);
      compareWithEstimate?.(part, fresh.heightPx);
      return fresh;
    }
    const fresh = measureFragment(part, sheet);
    if (standIn && fresh.hidden) lightMeasures.set(part.sheet, { ...fresh });
    return fresh;
  };
  const measureFragment = (part: LedgerPart, sheet: HTMLElement): LedgerFragmentMeasure => {
    const hidden = isHidden(part.dom) || drawsNoNotes(part);
    // A block of a stacked column region (a continuous multi-column section
    // starting mid-page) is charged by its region: the region's balanced
    // height on its last block, the space above it on its first.
    // A block of a stacked column region (a continuous multi-column section
    // starting mid-page) is drawn at its column's width; the page planner
    // lays the section out in its columns (ledgerCut), so the block is
    // charged its own height there, with its region's column count.
    // A block on a page of stacked regions belongs to its own section's
    // columns, hidden or not (a section break closes its section): the
    // sheet's column count is that of the section the page opens with, and
    // read for every block it laid single-column sections out in columns.
    const placement = unequalColumnPlacementForBlock(part.dom);
    const region = hidden ? undefined : placement?.regionCharge;
    // A float the projector placed in a single-column region is charged
    // what it moves the flow down there, its margins included (its space
    // before is its offset from the flow, not a gap above it).
    const floatAdvancePx = hidden ? undefined : placement?.floatAdvancePx;
    const margins = floatAdvancePx !== undefined ? { before: 0, after: 0 } : authoredMarginsPx(part, edgeMargins);
    // A Top and Bottom shape drawn up beside or over the band before it, or
    // to its paragraph's top (floatingTextBoxLayout's band runs: a negative
    // margin-top), moves the flow down only by what reaches below: charged
    // whole, two shapes side by side cost twice their row (corpus R281-D21:
    // eight rows of a number box and a text box, Word's one page drawn on four).
    const bandLiftPx = hidden || floatAdvancePx !== undefined ? 0 : shapeBandLiftPx(part.dom);
    const groupFoot = hidden ? NO_GROUP_FOOT : borderGroupFootPx(part.dom);
    // A run of Top and Bottom objects laid out whole is charged as one
    // block (floatingTextBoxLayout's `layoutMixedBandRuns`): its first
    // object down to the run's lowest object, the blocks after it nothing.
    if (!hidden && floatAdvancePx === undefined) {
      if (part.dom.hasAttribute(BAND_RUN_RIDE_ATTR)) {
        return { heightPx: 0, repeatedHeaderPx: 0, creditPx: 0, hidden: false, outOfFlow: false, marginBeforePx: 0, marginAfterPx: 0 };
      }
      const runRoom = Number.parseFloat(part.dom.getAttribute(BAND_RUN_ROOM_ATTR) ?? "");
      if (Number.isFinite(runRoom) && runRoom >= 0) {
        return {
          heightPx: Math.max(0, readLedgerBlockHeight(part, sheet, columns[part.sheet] > 1, docAttrs) + bandLiftPx) + runRoom,
          repeatedHeaderPx: 0,
          creditPx: 0,
          hidden: false,
          outOfFlow: false,
          marginBeforePx: margins.before,
          marginAfterPx: 0,
        };
      }
    }
    const fresh: LedgerFragmentMeasure = {
      heightPx: floatAdvancePx ?? Math.max(0, readLedgerBlockHeight(part, sheet, columns[part.sheet] > 1, docAttrs) + bandLiftPx - groupFoot.drawnPx),
      repeatedHeaderPx: repeatedHeaderHeightPx(part.node, part.dom),
      // A region block is laid out in its own columns like any text (above),
      // so its last line takes the page-bottom credit at a column foot too.
      creditPx: hidden ? 0 : trailingAutoLeadingCreditPx(part.dom) + splitRowFootCreditPx(part) - groupFoot.footPx,
      hidden,
      outOfFlow: !hidden && isOutOfVerticalFlow(part.dom),
      marginBeforePx: margins.before,
      marginAfterPx: margins.after,
      ...(region?.columns
        ? { regionColumns: region.columns, linePitchPx: region.linePitchPx ?? 0, ...(region.minSplitLines ? { regionMinSplitLines: region.minSplitLines } : {}) }
        : placement?.regionColumns ? { regionColumns: placement.regionColumns } : {}),
      // Text in a section of several columns is balanced by whole lines
      // (the projector's balancedColumnHeightPx), on a page projected as
      // stacked regions or not. Without its pitch the planner balanced it
      // to the pixel, a region came out ~13 px shorter than the projector
      // then drew it, and the two moved one block back and forth for good
      // (R26-D04's last page, 15 pages then 16).
      ...(!region?.columns && !hidden && columns[part.sheet] > 1 && part.dom.matches(TEXT_PITCH_BLOCKS)
        ? { linePitchPx: blockLinePitchPx(part.dom) }
        : {}),
      ...(region?.columns && region.trackHeightsPx ? { regionHeightsPx: region.trackHeightsPx } : {}),
      ...(region?.columns && region.breaksPx ? { regionBreaksPx: region.breaksPx } : {}),
      // A block held whole on a page of unequal columns: its height in each
      // column, so the planner tries it at the one it would stand in.
      ...(!region?.columns && !hidden && placement?.wholeTrackHeightsPx && placement.wholeTrackHeightsPx.length === columns[part.sheet]
        ? { regionHeightsPx: placement.wholeTrackHeightsPx }
        : {}),
    };
    // A table just moved is read before its column widths are drawn on it:
    // far taller, once. Believed, the pages after it moved for it and back
    // again on the next pass (R286-D01: 413 -> 14,069 -> 436 -> 413 px, two
    // passes of 81 pages). Asked again before it is believed, and again while
    // it stays so: with a long print's pages still being drawn the second
    // reading was as tall, a 37 px row was cut for it and a blank page followed.
    const lastKnown = part.node.type.name === "table" ? nodeMeasures.get(part.node) : undefined;
    const doubts = doubtedTables.get(part.node) ?? 0;
    if (lastKnown && doubts < DOUBTED_TABLE_RETRIES && tableHeightLooksTransient(lastKnown.heightPx, fresh.heightPx)) {
      doubtedTables.set(part.node, doubts + 1);
      cache?.markSheet(sheet);
      const win = view.dom.ownerDocument.defaultView;
      win?.setTimeout(() => {
        win.dispatchEvent(new CustomEvent("mrn-page-rebalance", { detail: { reason: "table-transient" } }));
      }, DOUBTED_TABLE_RETRY_MS * 2 ** doubts);
      return lastKnown;
    }
    doubtedTables.delete(part.node);
    cache?.storeFragment(part.dom, part.node, sheet, fresh);
    noteSeededReading(view.dom, part.node, fresh.heightPx);
    nodeMeasures.set(part.node, fresh);
    compareWithEstimate?.(part, fresh.heightPx);
    // A block once guessed, now measured: the guesses learn how far off
    // they run on this document (roughScale).
    const guessed = roughFlows.get(part.node)?.heightPx ?? roughHeights.get(part.node);
    if (!hidden && guessed !== undefined && guessed > 0 && fresh.heightPx > 0) {
      const tally = roughTallies.get(view.dom) ?? { measured: 0, guessed: 0, samples: 0 };
      tally.measured += fresh.heightPx;
      tally.guessed += guessed;
      tally.samples += 1;
      roughTallies.set(view.dom, tally);
    }
    return fresh;
  };

  // Past the horizon a block keeps the measurement it had (none, on a sheet
  // never laid out) and is not read from the DOM. Its atom counts the reads
  // of its height: a plan that read one reached past what was measured.
  let horizonUsedPx = 0;
  let firstEstimated: number | null = null;
  let firstUnknown: number | null = null;
  let firstUnknownWhy: string | null = null;
  // Harness traces: why each block past the horizon was not known, counted.
  const unknownWhys: Record<string, number> = {};
  let estimatedReads = 0;
  // With the docs-layout engine on, a paragraph past the horizon is laid
  // out by the engine from its style and its column (no layout of its page,
  // L3-DESIGN step 4), so the plan reaches past the pages measured so far
  // instead of stopping at the first block not measured: a long document
  // was planned a few pages a pass, each pass laying those pages out.
  const engineLaid = textEngineEnabled("docs-layout");
  // A document with footnotes laid out a window at a time
  // (`__docsFootnoteProgressive`) reads its tables in the page, never from the
  // engine: a plan to the end over the engine's rows cut R291-D02's tables
  // inside rows where the rendered rows (and Word) break between them, and the
  // seams it left stood once the pages were read (a fixed point of their own).
  // `window.__docsNotesEngineTables = true` reads them from the engine as any.
  const notesWin = view.dom.ownerDocument.defaultView as (Window & { __docsNotesEngineTables?: boolean }) | null;
  const notesReadTables = sheetedDocHasFootnoteRefs(doc) && footnotesAllowProgressiveLayout(doc, notesWin) &&
    notesWin?.__docsNotesEngineTables !== true;
  const engineKnown = new Set<LedgerPart>();
  // Engine heights the plan may go past but the page must still check.
  const engineApprox = new Set<LedgerPart>();
  const columnWidths = new Map<HTMLElement, number | null>();
  const columnWidthOf = (sheet: HTMLElement): number | null => {
    if (columnWidths.has(sheet)) return columnWidths.get(sheet)!;
    const css = getComputedStyle(sheet);
    const width = Number.parseFloat(css.width) - (Number.parseFloat(css.paddingLeft) || 0) - (Number.parseFloat(css.paddingRight) || 0);
    const column = Number.isFinite(width) && width > 0 ? width : null;
    columnWidths.set(sheet, column);
    return column;
  };
  // A whole block past the horizon the engine cannot read (a formula it
  // cannot box, an object on a line, a run in a face it has no file of): a
  // rough guess from its text and stated sizes (the page estimate's), never
  // 0, so a plan can go past it; its sheet is not trusted and the page lays
  // it out when the reader nears it. Counted with the guesses (horizon
  // .guessed) and named in the reasons as "rough <why>".
  let probesLeft = HOLLOW_PROBES_PER_BUILD;
  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const probeHollowBlock = (part: LedgerPart, sheet: HTMLElement, column: number): { heightPx: number; beforePx: number; afterPx: number } | null => {
    const name = part.node.type.name;
    const list = name === "bulletList" || name === "orderedList";
    if (name !== "paragraph" && name !== "heading" && !list) return null;
    const known = hollowProbes.get(part.node);
    if (known && known.column === column) return known.reading;
    if (probesLeft <= 0) return null;
    probesLeft -= 1;
    let reading: { heightPx: number; beforePx: number; afterPx: number } | null = null;
    let probe: Node | null = null;
    try {
      probe = serializer.serializeNode(part.node);
      if (probe instanceof HTMLElement) {
        sheet.appendChild(probe);
        const px = (value: string) => (value.endsWith("px") ? Number.parseFloat(value) || 0 : 0);
        const css = getComputedStyle(probe);
        if (list) {
          // A list's paragraphs stand in the probe in document order: the
          // reader's element for each is found by that order.
          const offsets: number[] = [];
          part.node.descendants((child, offset) => {
            if (child.type.name === "paragraph" || child.type.name === "heading") offsets.push(offset);
            return true;
          });
          const elements = Array.from(probe.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6"));
          if (elements.length === offsets.length) {
            const byOffset = new Map(offsets.map((offset, index) => [offset, elements[index]!]));
            const heightPx = unlaidEngineList(part.node, probe, column, docAttrs as Record<string, unknown>,
              (offset) => byOffset.get(offset) ?? null, (_dom, block) => block.heightPx, undefined, true);
            if (heightPx !== null) reading = { heightPx, beforePx: px(css.marginTop), afterPx: px(css.marginBottom) };
          }
        } else {
          const engine = unlaidEngineBlock(part.node, probe, column, docAttrs as Record<string, unknown>, false, undefined, false, true);
          if (engine) reading = { heightPx: engine.heightPx, beforePx: px(css.marginTop), afterPx: px(css.marginBottom) };
        }
      }
    } catch {
      reading = null;
    } finally {
      probe?.parentNode?.removeChild(probe);
    }
    hollowProbes.set(part.node, { column, reading });
    return reading;
  };
  // The guesses' scale on this document: measured over guessed heights of
  // the blocks measured since they were guessed (20 at least), within 0.5-2.
  const roughScale = (): number => {
    const tally = roughTallies.get(view.dom);
    if (!tally || tally.samples < 20 || !(tally.guessed > 0)) return 1;
    return Math.min(2, Math.max(0.5, tally.measured / tally.guessed));
  };
  const roughEstimate = (part: LedgerPart): LedgerFragmentMeasure | null => {
    const sheet = sheets[part.sheet];
    if (!sheet || columns[part.sheet] > 1) return null;
    const column = columnWidthOf(sheet);
    if (column === null) return null;
    if (part.hollow) {
      // A paragraph or heading drawn into its hollow sheet for the reading
      // alone (the sheet ignores what is drawn in it; nothing is laid out:
      // the engine reads computed styles only), then taken out: the engine's
      // lines with no page laid out, as an estimate (no decoration a plugin
      // draws on the page is in it). A budget a build: the rest wait for a
      // later pass, on the page estimate's guess meanwhile.
      const probed = probeHollowBlock(part, sheet, column);
      if (probed) {
        engineKnown.add(part);
        engineApprox.add(part);
        engineGuessedParts.add(part);
        return { heightPx: probed.heightPx, repeatedHeaderPx: 0, creditPx: 0, hidden: false, outOfFlow: false, marginBeforePx: probed.beforePx, marginAfterPx: probed.afterPx };
      }
      // No element of its own to read margins from: the estimate's spacing.
      let flow = roughFlows.get(part.node);
      if (!flow) {
        flow = estimatedBlockFlow(part.node.toJSON() as Parameters<typeof estimatedBlockFlow>[0], column, docAttrs as Record<string, unknown>);
        roughFlows.set(part.node, flow);
      }
      engineKnown.add(part);
      engineApprox.add(part);
      engineGuessedParts.add(part);
      return { heightPx: flow.heightPx * roughScale(), repeatedHeaderPx: 0, creditPx: 0, hidden: false, outOfFlow: false, marginBeforePx: flow.beforePx, marginAfterPx: flow.afterPx };
    }
    let heightPx = roughHeights.get(part.node);
    if (heightPx === undefined) {
      heightPx = estimatedBlockHeightPx(part.node.toJSON() as Parameters<typeof estimatedBlockHeightPx>[0], column, docAttrs as Record<string, unknown>);
      roughHeights.set(part.node, heightPx);
    }
    if (!(heightPx > 0)) return null;
    engineKnown.add(part);
    engineApprox.add(part);
    engineGuessedParts.add(part);
    const why = `rough ${part.node.type.name}:${unlaidEngineReason(part.node) ?? "no reading"}`;
    if (Object.keys(unknownWhys).length < 40 || why in unknownWhys) unknownWhys[why] = (unknownWhys[why] ?? 0) + 1;
    const margins = authoredMarginsPx(part, edgeMargins);
    return { heightPx: heightPx * roughScale(), repeatedHeaderPx: 0, creditPx: 0, hidden: false, outOfFlow: false, marginBeforePx: margins.before, marginAfterPx: margins.after };
  };
  const engineEstimate = (part: LedgerPart, whole: boolean): LedgerFragmentMeasure | null => {
    // A break takes no room: nothing is left to read. Asked of the page, the
    // first one past what was measured stopped a plan to the document's end
    // (R279-D30: 9 page breaks, 277 opening sheets for 141 pages brought down
    // twelve pages a step).
    if (engineLaid && part.node.type.name in ZERO_HEIGHT_BLOCKS) {
      engineKnown.add(part);
      return ZERO_MEASURE;
    }
    if (part.hollow) return engineLaid ? roughEstimate(part) : null;
    if (!engineLaid || !whole) return null;
    const list = part.node.type.name === "orderedList" || part.node.type.name === "bulletList";
    const table = part.node.type.name === "table";
    const math = part.node.type.name === "mathBlock";
    const picture = part.node.type.name === "image" && !part.node.isInline;
    if (table && notesReadTables) return null;
    if (!part.node.isTextblock && !list && !table && !math && !picture) {
      // An object out of the vertical flow (a floating shape, an absolutely
      // placed box) moves the flow by nothing: planned past as an estimate
      // (the text it narrows beside it is the page's to read).
      if (!isOutOfVerticalFlow(part.dom)) return roughEstimate(part);
      engineKnown.add(part);
      engineApprox.add(part);
      engineGuessedParts.add(part);
      return { heightPx: 0, repeatedHeaderPx: 0, creditPx: 0, hidden: false, outOfFlow: true, marginBeforePx: 0, marginAfterPx: 0 };
    }
    const sheet = sheets[part.sheet];
    if (!sheet || columns[part.sheet] > 1 || getComputedStyle(part.dom).display === "none") return null;
    const column = columnWidthOf(sheet);
    if (column === null) return null;
    const charge = (dom: HTMLElement, block: { heightPx: number; lineHeightsPx: readonly number[] }) =>
      lineGridChargedEngineHeight(sheet, dom, block.heightPx, block.lineHeightsPx);
    let heightPx: number | null = null;
    if (picture) {
      heightPx = unlaidEnginePicture(part.node, part.dom);
      if (heightPx !== null) engineApprox.add(part);
    } else if (math) {
      heightPx = unlaidEngineMathBlock(part.node, part.dom);
      // On a line grid the page may round it to its slots: checked there.
      if (heightPx !== null && sheet.closest('[data-doc-grid="lines"]')) engineApprox.add(part);
      if (heightPx === null) {
        // One Word's metrics do not box: KaTeX's, as an estimate.
        heightPx = unlaidEngineKatexMathBlock(part.node, part.dom);
        if (heightPx !== null) engineApprox.add(part);
      }
    } else if (table) {
      // For the plan only: the table's page is laid out again (not trusted).
      heightPx = unlaidEngineTable(part.node, part.dom, docAttrs as Record<string, unknown>,
        (offset) => view.nodeDOM(part.pos + 1 + offset));
      if (heightPx !== null) {
        engineApprox.add(part);
        engineTableParts.add(part);
      }
    } else if (list) {
      heightPx = unlaidEngineList(part.node, part.dom, column, docAttrs as Record<string, unknown>,
        (offset) => view.nodeDOM(part.pos + 1 + offset), charge, () => engineApprox.add(part));
    } else {
      const engine = unlaidEngineBlock(part.node, part.dom, column, docAttrs as Record<string, unknown>);
      heightPx = engine ? charge(part.dom, engine) : null;
      // Its line starts as content offsets now, while its text is drawn.
      if (engine) {
        const from = part.pos + 1;
        freezeEngineLineStarts(part.node, (start) => view.posAtDOM(start.node, start.offset) - from);
      }
      // A face and alignment the page laid out otherwise than the engine
      // does: the plan may go past it, the page still checks it.
      if (engine?.approximate || (engine && !calibrationTrusts(view.dom, calibrationKey(part.dom, part.node)))) engineApprox.add(part);
    }
    if (heightPx === null) return roughEstimate(part);
    if (compareWithEstimate) {
      const kind = picture ? "picture" : math ? "math" : table ? "table" : list ? "list" : part.node.type.name;
      unlaidEstimates.set(part.node, { kind, approximate: engineApprox.has(part), heightPx });
    }
    const margins = authoredMarginsPx(part, edgeMargins);
    engineKnown.add(part);
    if (!engineApprox.has(part)) engineLaidParts.add(part);
    else engineGuessedParts.add(part);
    const estimated: LedgerFragmentMeasure = {
      heightPx,
      repeatedHeaderPx: 0,
      creditPx: trailingAutoLeadingCreditUnlaidPx(part.dom),
      hidden: false,
      outOfFlow: false,
      marginBeforePx: margins.before,
      marginAfterPx: margins.after,
    };
    // An exact reading stands for the part on a hollow sheet (an estimate
    // is never hollowed: its sheet is not trusted).
    if (!engineApprox.has(part)) nodeMeasures.set(part.node, estimated);
    return estimated;
  };
  const calibrate = (part: LedgerPart, drawn: LedgerFragmentMeasure) => {
    if (part.hollow || drawn.hidden || drawn.outOfFlow || drawn.regionColumns || !part.node.isTextblock) return;
    if (part.node.type.name !== "paragraph" && part.node.type.name !== "heading") return;
    // Held against the page once: no style of its sheet is read again (a
    // keystroke's build read every laid paragraph's sheet, a style
    // recalculation each after the edit's writes).
    if (calibrated.has(part.node)) return;
    const sheet = sheets[part.sheet];
    if (!sheet || columns[part.sheet] > 1 || !part.dom.isConnected) return;
    const column = columnWidthOf(sheet);
    if (column === null) return;
    const seen = calibrated.get(part.node);
    if (seen === column) return;
    const key = calibrationKey(part.dom, part.node);
    // Enough paragraphs of a face have spoken for it (a long book read every
    // paragraph it laid out a second time).
    if (calibrationSamples(view.dom, key) >= CALIBRATION_SAMPLES) return;
    calibrated.set(part.node, column);
    const engine = unlaidEngineBlock(part.node, part.dom, column, docAttrs as Record<string, unknown>, false, undefined, true);
    if (!engine || engine.approximate) return;
    const engineHeight = lineGridChargedEngineHeight(sheet, part.dom, engine.heightPx, engine.lineHeightsPx);
    noteCalibration(view.dom, key, Math.abs(engineHeight - drawn.heightPx) <= CALIBRATION_SAME_PX);
  };
  const estimate = (part: LedgerPart, whole = false): LedgerFragmentMeasure =>
    kept.get(part) ?? engineEstimate(part, whole) ?? { heightPx: 0, repeatedHeaderPx: 0, creditPx: 0, hidden: false, outOfFlow: false, marginBeforePx: 0, marginAfterPx: 0 };
  const atoms: LedgerAtom[] = [];
  const rooms = floatPageRooms(view);
  // The section of each block: a section break closes its section, the
  // blocks after it are the next one's.
  const blockSections: number[] = [];
  {
    let section = 0;
    for (const block of logical) {
      blockSections.push(section);
      if (block.parts[block.parts.length - 1]?.node.type.name === "sectionBreak") section += 1;
    }
  }
  let partCursor = 0;
  let blockOrdinal = -1;
  // The first sheet holding a fragment left unread (below): not measured yet.
  let firstUnreadChainSheet = Number.POSITIVE_INFINITY;
  for (const block of logical) {
    blockOrdinal += 1;
    let heightPx = 0;
    let noteFlexPx = 0;
    let notePitchPx = 0;
    let noteChromePx = 0;
    const openingSheet = block.parts[0].sheet;
    if (horizon && firstEstimated === null && openingSheet > horizon.fromSheet &&
        (horizonUsedPx >= horizon.budgetPx || openingSheet > horizon.maxSheet)) {
      firstEstimated = block.index;
    }
    const pastHorizon = firstEstimated !== null;
    // A paragraph many pages long that opens within the horizon: its fragments
    // past the horizon are not read now (each would lay out its sheet; a
    // paragraph as long as a book, every sheet of it). So tall an atom is
    // planned as a cut whatever they add up to, and the cut walks only the
    // fragments of the page it is cutting.
    const farFromSheet = !pastHorizon && horizon && block.kind === "text" && block.parts.length >= LONG_CHAIN_PARTS
      ? horizon.maxSheet
      : null;
    if (farFromSheet !== null && block.parts.some((part) => part.sheet > farFromSheet)) {
      firstUnreadChainSheet = Math.min(firstUnreadChainSheet, farFromSheet + 1);
      // Nothing about the pages past them is known yet: no plan to the
      // document's end from here.
      if (firstUnknown === null) {
        firstUnknown = block.index;
        firstUnknownWhy = "long paragraph: fragments unread";
      }
    }
    // (Their share of the height: as the fragments read so far ran, per unit
    // of content. What a tail asks of a page is only compared with a page.)
    let readPx = 0;
    let readSize = 0;
    const measures = block.parts.map(pastHorizon
      ? (part) => estimate(part, block.parts.length === 1 && (block.kind === "text" || block.kind === "container" || block.kind === "table" || block.kind === "object"))
      : (part) => {
          if (farFromSheet === null || part.sheet <= farFromSheet) {
            const read = measure(part);
            readPx += read.heightPx;
            readSize += part.node.content.size;
            return read;
          }
          const known = kept.get(part);
          if (known) return known;
          return { ...ZERO_MEASURE, heightPx: part.node.content.size * (readSize > 0 ? readPx / readSize : 1) };
        });
    // A whole paragraph the page laid out: held against the engine's own
    // no-layout reading of it, so the plan knows whether to trust that
    // reading for the pages it has not laid out.
    if (engineLaid && !pastHorizon && block.parts.length === 1 && block.kind === "text") calibrate(block.parts[0], measures[0]);
    // Past the horizon, a block whose every fragment kept its measurement
    // is as known as a measured one; only the others are estimates.
    // (A continued list or container also charges the join between its
    // fragments, read from the DOM: past the horizon it is an estimate.)
    // Under docs-layout a continued container whose every fragment is known
    // is not stopped at for the join between them alone (read from the DOM,
    // so charged nothing past the horizon): a guess, as its sheets are not
    // trusted; a book opened on line-count sheets cut a list at almost every
    // one, and each cut stopped the plan.
    const joinOnly = pastHorizon && engineLaid && block.parts.length > 1 && (block.kind === "container" || block.kind === "rows") &&
      block.parts.every((part) => kept.has(part) || engineKnown.has(part));
    if (joinOnly) for (const part of block.parts) { engineApprox.add(part); engineGuessedParts.add(part); }
    const estimated = pastHorizon && (
      block.parts.some((part) => !kept.has(part) && !engineKnown.has(part)) ||
      (block.parts.length > 1 && (block.kind === "container" || block.kind === "rows") && !joinOnly) ||
      (block.kind !== "break" && block.parts.every((part) => kept.get(part)?.outOfFlow)));
    if (estimated && firstUnknown === null) {
      firstUnknown = block.index;
      const part = block.parts.find((candidate) => !kept.has(candidate) && !engineKnown.has(candidate)) ?? block.parts[0];
      firstUnknownWhy = part ? `${part.node.type.name}:${unlaidEngineReason(part.node) ?? (block.parts.length > 1 ? "fragments" : "no reading")}` : null;
    }
    if (estimated) {
      const part = block.parts.find((candidate) => !kept.has(candidate) && !engineKnown.has(candidate)) ?? block.parts[0];
      const why = part ? `${part.node.type.name}:${unlaidEngineReason(part.node) ?? (block.parts.length > 1 ? "fragments" : "no reading")}` : "?";
      if (Object.keys(unknownWhys).length < 40 || why in unknownWhys) unknownWhys[why] = (unknownWhys[why] ?? 0) + 1;
    }
    block.parts.forEach((part, partIndex) => {
      const own = measures[partIndex];
      const previous = block.parts[partIndex - 1];
      part.heightPx = own.heightPx;
      // A continuation's repeated header clones are given back to the plan
      // because a merge paints them no more — but only a seam the
      // reconciler CAN join loses them. A table whose fragments cannot be
      // re-joined (a row split within, a row continuation the join helper
      // refuses) keeps every fragment, header clones and all: charging the
      // atom as if joined let the plan fit three fragments on a page they
      // physically overran by their headers, the verifier pushed them off,
      // the next plan pulled them back — two dispatches per keystroke on
      // the D010 import, forever.
      part.repeatedHeaderPx =
        previous && block.kind === "table" && !tableSeamJoins(previous.node, part.node)
          ? 0
          : own.repeatedHeaderPx;
      part.creditPx = own.creditPx;
      if (previous && block.kind === "table" && !pastHorizon && !part.hollow && !previous.hollow) {
        part.joinBeforePx = splitRowFloorJoinPx(previous, part);
      }
      if (previous && block.kind === "container" && !pastHorizon && !part.hollow && !previous.hollow) {
        const join = containerContinuationJoinMargin(previous.dom, previous.node, part.dom, part.node, authoredMargin);
        part.joinBeforePx = Number.isFinite(join) ? Math.max(0, join) : 0;
      }
      // A list's continuation starts at its first row; joined, the space
      // between two rows is drawn before it again.
      if (previous && block.kind === "rows" && !pastHorizon && !part.hollow && !previous.hollow) {
        part.joinBeforePx = keptSeamJoin(previous, part, kept, () => {
          // A closed box (a card with its own frame) joins shorter than its
          // two copies stand apart: the exact, usually negative, difference.
          const closed = isClosedBoxRowSlicedAtomType(part.node.type.name)
            ? rowSliceClosedSeamJoinPx(previous.dom, part.dom)
            : null;
          return closed ?? rowSliceSeamGapPx(previous.dom, part.dom);
        });
      }
      // A column-projected sheet holds its note zone out of every column's
      // capacity (projectedFootZonesPx below): its blocks carry none.
      const reservation = zoneSheets[part.sheet] ? null : footnoteReservations?.[partCursor] ?? null;
      const zoned = footZones && zoneSheets[part.sheet] ? footnoteReservations?.[partCursor] ?? null : null;
      if (footZones && zoned && zoned.totalPx > 0) {
        const list = footZones.notes.get(blockOrdinal) ?? [];
        const seen = new Set<string>();
        part.node.descendants((child, offset) => {
          if (child.type.name !== "footnoteRef") return true;
          const id = child.attrs?.noteId;
          const rowPx = typeof id === "string" ? zoned.notes.get(id) : undefined;
          if (rowPx !== undefined && !seen.has(id)) {
            seen.add(id);
            list.push({ id, logicalOffset: contentOffsetBefore(block, partIndex) + offset, partIndex, heightPx: rowPx, pitchPx: zoned.pitches.get(id) ?? 0, chromePx: zoned.chromePx });
          }
          return true;
        });
        if (list.length > 0) footZones.notes.set(blockOrdinal, list);
      }
      let reservedPx = 0;
      if (reservation && reservation.totalPx > 0) {
        const charged = new Set<string>();
        part.node.descendants((child, offset) => {
          if (child.type.name !== "footnoteRef") return true;
          const id = child.attrs?.noteId;
          const rowPx = typeof id === "string" ? reservation.notes.get(id) : undefined;
          if (rowPx !== undefined && !charged.has(id)) {
            charged.add(id);
            const pitchPx = reservation.pitches.get(id) ?? 0;
            const minPx = continuedNoteMinPx(rowPx, pitchPx);
            part.notes.push({ id, offset, heightPx: rowPx, minPx, pitchPx });
            reservedPx += minPx;
            noteFlexPx += rowPx - minPx;
            notePitchPx = Math.max(notePitchPx, pitchPx);
          }
          return true;
        });
        part.noteChromePx = reservation.chromePx;
        if (reservedPx > 0) {
          reservedPx += reservation.chromePx;
          noteChromePx += reservation.chromePx;
        }
      }
      // The whole logical atom (what a merge would render) carries no header
      // clones but does carry the spacing its seams currently drop. A note's
      // rows beyond its minimum are not charged here: the cut gives them the
      // room left on the page and continues the rest (noteFlexPx).
      heightPx += Math.max(0, part.heightPx - part.repeatedHeaderPx) + part.joinBeforePx + reservedPx;
      partCursor += 1;
    });
    const first = block.parts[0];
    const last = block.parts[block.parts.length - 1];
    const lastMeasure = measures[measures.length - 1];
    // An out-of-flow block (an anchored text box) costs no height AND no
    // inter-block spacing: nothing in the flow sits above or below it.
    // A page break followed by nothing but the empty paragraph of a section
    // break that starts a new page: Word opens one new page, not two. The
    // section paragraph stands on the break's page and takes no line there
    // (Word 16.86, corpus R13-D09: the break and the section paragraph both
    // on page 1 line 1, "Enclosure 3" on page 2 -- 2 pages, where the break
    // and the section each opened a page and left a blank one between).
    const absorbedBreak = pageBreakAbsorbedBySection(logical, blockOrdinal) || pageBreakEndsDocument(logical, blockOrdinal);
    const absorbedParagraph = blockOrdinal > 0 && pageBreakAbsorbedBySection(logical, blockOrdinal - 1);
    if (absorbedParagraph) heightPx = 0;
    const hidden =
      block.kind === "break" ||
      absorbedParagraph ||
      measures.every((own) => own.hidden || own.outOfFlow);
    const margins = hidden
      ? { before: 0, after: 0 }
      : {
          before: measures[0].marginBeforePx,
          after: lastMeasure.marginAfterPx,
        };
    const anchored =
      block.kind !== "break" && measures.every((own) => !own.hidden && own.outOfFlow);
    // The paragraph an object after it is drawn from is the block before
    // the objects drawn from that paragraph: the second of two text boxes
    // anchored in one paragraph follows the first, not the paragraph (corpus
    // R75-D10: read as drawn from the paragraph after it, the second box went
    // to the next page alone and its paragraph stayed behind).
    let hostOrdinal = blockOrdinal - 1;
    // A Top and Bottom picture stands in the flow (its band), not out of it,
    // yet is drawn from its paragraph as any floating object: the room it asks
    // is measured from that paragraph's top too (corpus R90-D01: a 326 pt
    // picture 18 pt below an empty paragraph 390 pt down a 792 pt page --
    // charged from below the paragraph, it went to page 2 alone and the
    // document ran to 8 pages, Word's 7).
    // A run of Top and Bottom shapes asks its room on its first shape
    // (publishShapeBandRooms), of the paragraph before it.
    const floatObject = anchored || (!pastHorizon && first.dom.hasAttribute(FLOAT_PAGE_ROOM_ATTR) &&
      (first.dom.hasAttribute("data-float-anchor") || first.dom.getAttribute("data-float-band") === "true"));
    const objectHost = floatObject ? sourceParagraphIndex(first.node, false) : null;
    while (
      objectHost !== null &&
      hostOrdinal >= 0 &&
      atoms[hostOrdinal]?.anchored === true &&
      sourceParagraphIndex(logical[hostOrdinal].parts[0]?.node, false) === objectHost
    ) {
      hostOrdinal -= 1;
    }
    const hostBefore = floatObject && anchoredInBlockBefore(
      first.node,
      logical[hostOrdinal]?.parts.at(-1)?.node,
      logical[blockOrdinal + 1]?.parts[0]?.node,
    );
    // A floated object is out of the flow, so its fragment measures no
    // height: the room it asks is what the float pass published, from its
    // paragraph's top (R45-D23: a 313 pt text box anchored 120 pt above the
    // foot opens the next page with its paragraph). Read from the block's
    // first fragment, where it starts. An object drawn from the paragraph
    // before it asks nothing: that paragraph is placed already. Past the
    // measurement horizon nothing asks yet (the next pass reaches it).
    // A block riding on its run's first object asks nothing, of its page or
    // its paragraph's: the run's room is its first object's.
    const riding = first.dom.hasAttribute(BAND_RUN_RIDE_ATTR);
    const roomPx = pastHorizon || hostBefore || riding ? 0 : rooms.get(first.dom) ?? 0;
    // An object drawn from the paragraph before it asks its room of that
    // paragraph, measured from the paragraph's top as the float pass
    // publishes it: with too little room left, Word opens the next page with
    // the paragraph and its objects (Word 16.86, corpus R75-D10: a 346 pt
    // text box below an empty paragraph 593 px down the page moves that
    // paragraph to page 2).
    const hostAtom = hostBefore && !pastHorizon && !riding ? atoms[hostOrdinal] : undefined;
    const hostRoomPx = hostAtom ? rooms.get(first.dom) ?? 0 : 0;
    if (hostAtom && !hostAtom.anchored && hostRoomPx > (hostAtom.roomPx ?? 0)) hostAtom.roomPx = hostRoomPx;
    if (horizon && openingSheet >= horizon.fromSheet && !pastHorizon) horizonUsedPx += heightPx;
    // A block held whole ("Keep lines together") in a section of unequal
    // columns is too tall for a page only when it is too tall for every
    // column: it goes on to the first column wide enough to hold it (Word
    // 16.86, corpus R76-D15: a kept paragraph too tall for the 1.04" and
    // 1.74" columns stands at the top of the 2.8" one on the same page;
    // read at the first column's height, it went on to a page of its own).
    // A Top and Bottom picture before the paragraph it is drawn from, and
    // that paragraph's one line (`objectOfNext` / `lineUnderObjects`): when
    // the picture opens the page, Word keeps the line under it there.
    const objectOfNext = !hidden && !anchored && !hostBefore && !pastHorizon &&
      bandPictureBlock(first.dom) && drawnFromNextBlock(first.node, logical[blockOrdinal + 1]?.parts[0]?.node);
    const previousAtom = atoms[atoms.length - 1];
    const lineUnderObjects = !hidden && !pastHorizon && block.kind === "text" && block.parts.length === 1 &&
      previousAtom?.objectOfNext === true && oneLineBlock(first.dom, heightPx);
    const wholeTrackHeights = block.parts.length === 1 ? regionHeightsOf(measures) : null;
    const wholeFitHeightPx = wholeTrackHeights ? Math.min(heightPx, ...wholeTrackHeights) : heightPx;
    atoms.push({
      index: block.index,
      kind: block.kind,
      heightPx,
      spaceBeforePx: margins.before,
      spaceAfterPx: margins.after,
      ...(hidden ? {} : tableFrameLead(first.dom)),
      ...atomContextualSpacing(block.kind, first.node, last.node),
      forcedBreakAfter: ((isForcedBreakBlock(last.node) || pageStarters.has(last.node)) && !absorbedBreak) ||
        (block.kind === "table" &&
          overPageHeaderTable(block, (capacities[first.sheet] ?? 0) / (columns[first.sheet] ?? 1))),
      ...(paragraphPageStartBreak(block, logical[blockOrdinal + 1], logical[blockOrdinal - 1]) ? { paragraphPageStart: true } : {}),
      columnBreakAfter: trailingBreakOf(last.node) === "columnBreak",
      ...(block.kind === "table" && block.parts.some((part) => tableRowStartingPage(part.node, 0) !== null)
        ? { rowPageBreaks: true } : {}),
      // An anchored object (a floating shape, an ink stroke, a text box)
      // takes no room in the flow and is drawn from the paragraph after it:
      // it travels with that paragraph. Left to fit on its own, the object
      // drawn over a page's first paragraph stayed at the foot of the page
      // before, and was painted there, a page gap above where it was put.
      // A picture placed AFTER the paragraph it is anchored in (its source
      // anchor names that paragraph, not the next) belongs to that one: tied
      // to the next, it took that paragraph to a page of its own (corpus
      // R04-D09: six behind-text pictures each opened an extra page, 11
      // pages where Word has 6).
      // A Top and Bottom picture keeps with the paragraph it is drawn from:
      // where its line does not fit under it, Word opens the next page with
      // both (pc6/probes/fp-d, fp-f).
      keepNext: keepsFollowingBlock(last.node) || (anchored && !hostBefore) || objectOfNext ||
        (block.kind === "table" && block.parts.every((part) => tableKeepsFollowingBlock(part.node))) ||
        (block.kind === "container" && listKeepsFollowingBlock(last.node)),
      ...(block.kind === "container" && block.parts.every((part) => listKeptWithin(part.node)) ? { keptWithin: true } : {}),
      ...(hostBefore ? { hostBefore } : {}),
      ...(objectOfNext ? { objectOfNext } : {}),
      ...(lineUnderObjects ? { lineUnderObjects } : {}),
      // The section's columns: its region's on a page of several sections,
      // else the sheet's.
      sectionColumns: measures[0].regionColumns ?? columns[first.sheet] ?? 1,
      sectionIndex: blockSections[blockOrdinal],
      ...(last.node.type.name === "sectionBreak" && last.node.attrs?.breakType === "continuous" && !pageStarters.has(last.node)
        ? { continuousSectionBreak: true } : {}),
      ...(measures[0].linePitchPx ? { linePitchPx: measures[0].linePitchPx } : {}),
      ...(regionHeightsOf(measures) ? { regionHeightsPx: regionHeightsOf(measures)! } : {}),
      ...(regionHeightsOf(measures) && block.parts.length === 1 ? { regionWhole: true } : {}),
      ...(regionBreaksOf(measures) ? { regionBreaksPx: regionBreaksOf(measures)! } : {}),
      ...(anchored ? { anchored } : {}),
      ...(roomPx > 0 ? { roomPx } : {}),
      ...(block.kind === "table" && tableFreshRowPx(block) > 0 ? { freshRowPx: tableFreshRowPx(block) } : {}),
      // Word's "Keep lines together" holds a paragraph on one page while it
      // can fit on one. A paragraph taller than a whole page cannot, and Word
      // breaks it across pages like any other: refusing to cut left it on a
      
      // A region's blocks move whole: its charge is the region's, not the
      // block's own lines.
      splittable: (
        (splittableOf(block.kind, first.node) && !raisedFloatingTableFits(block.kind, first.node, heightPx, capacities)) ||
        (block.kind === "text" &&
          isTextSplitCapableTypeName(first.node.type.name) &&
          wholeFitHeightPx > Math.max(0, ...capacities) + 0.5)),
      ...(!splittableOf(block.kind, first.node) &&
      block.kind === "text" &&
      isTextSplitCapableTypeName(first.node.type.name) &&
      wholeFitHeightPx > Math.max(0, ...capacities) + 0.5
        ? { keepLinesOverlong: true }
        : {}),
      ...(block.kind === "text"
        ? { minSplitLines: minimumTextSplitLines(first.node.attrs?.widowControl) }
        // A list its region balances by its lines is cut between any two.
        : measures[0].regionMinSplitLines ? { minSplitLines: measures[0].regionMinSplitLines } : {}),
      creditPx: hidden ? 0 : lastMeasure.creditPx,
      hidden,
      breakTail: block.parts.length === 1 && first.dom.getAttribute("data-mrnote-source-break-tail") === "true",
      ...(noteFlexPx > 0 && notePitchPx > 0 ? { noteFlexPx, notePitchPx } : {}),
      ...(block.parts.some((part) => part.notes.length > 0) ? { hasNotes: true } : {}),
      ...(noteChromePx > 0 ? { noteChromePx } : {}),
    });
    if (estimated) {
      const atom = atoms[atoms.length - 1];
      let value = atom.heightPx;
      Object.defineProperty(atom, "heightPx", {
        enumerable: true,
        configurable: true,
        get: () => { estimatedReads += 1; return value; },
        set: (next: number) => { value = next; },
      });
    }
  }

  // Every sheet is now either unchanged or measured again whole; past the
  // horizon a sheet stays as it was (changed, until a pass measures it).
  if (firstEstimated === null) cache?.settle(sheets.slice(0, firstUnreadChainSheet));
  else {
    const lastMeasuredSheet = (logical[firstEstimated]?.parts[0]?.sheet ?? sheets.length) - 1;
    cache?.settle(sheets.slice(0, Math.max(0, Math.min(lastMeasuredSheet, firstUnreadChainSheet))));
  }
  // A note's zone chrome (separator and padding) is the zone's, not the
  // note's: measured per group of notes sharing a sheet, it came out
  // differently as the notes stood grouped differently, and the plan's zones
  // with it (R372-D01). One value for the build: the largest measured.
  if (footZones && footZones.notes.size > 0) {
    let chromePx = 0;
    for (const list of footZones.notes.values()) for (const note of list) chromePx = Math.max(chromePx, note.chromePx);
    for (const list of footZones.notes.values()) for (const note of list) note.chromePx = chromePx;
  }
  // Each sheet's section is that of the first block opening on it; a
  // section's page capacity is the last of its sheets' (not its first page,
  // which a title-page header may shorten).
  const sheetSections = sheets.map(() => -1);
  logical.forEach((block, ordinal) => {
    const sheet = block.parts[0]?.sheet;
    if (sheet !== undefined && sheetSections[sheet] === -1) sheetSections[sheet] = blockSections[ordinal] ?? 0;
  });
  for (let sheet = 0; sheet < sheetSections.length; sheet += 1) {
    if (sheetSections[sheet] === -1) sheetSections[sheet] = sheet > 0 ? sheetSections[sheet - 1] : 0;
  }
  const sectionCapacities = new Map<number, number>();
  const sectionCapacityColumns = new Map<number, number>();
  sheetSections.forEach((section, sheet) => {
    if (capacities[sheet] > 0) {
      sectionCapacities.set(section, capacities[sheet]);
      sectionCapacityColumns.set(section, columns[sheet] ?? 1);
    }
  });
  // A sheet whose every part the engine laid out.
  const engineSheets = new Set<HTMLElement>();
  if (engineKnown.size > 0) {
    const mixed = new Set<number>();
    for (const block of logical) {
      for (const part of block.parts) if (!engineKnown.has(part) || engineApprox.has(part)) mixed.add(part.sheet);
    }
    for (const part of engineKnown) if (!mixed.has(part.sheet) && sheets[part.sheet]) engineSheets.add(sheets[part.sheet]);
  }
  return {
    atoms, logical, capacities, sheetSections, sectionCapacities, sectionCapacityColumns, columns, sheets, changedSheets: changed, changedWhy,
    footZones,
    bandFloored,
    engineSheets,
    hollowMissing: [...hollowMissing],
    hollowMissingWhy,
    bandTops: sheets.map((sheet) => (sheet.hasAttribute(COLUMN_REGIONS_ATTR) ? unequalColumnProjectionForSheet(sheet)?.bandTopsPx ?? null : null)),
    oracle: createSplitOracle(view, logical, cache ? { cache, sheets, changed } : null),
    horizon: horizon ? { firstEstimated: firstUnknown, firstEstimatedWhy: firstUnknownWhy, unknownWhys, guessed: engineApprox.size, reads: () => estimatedReads } : null,
  };
}

// ---------------------------------------------------------------------------
// Split oracle

/** Each part's content offset, per build: a pass asks for every seam of a
 * paragraph, and a walk of the parts before it each time was the square of a
 * paragraph many pages long. */
const partOffsets = new WeakMap<readonly LedgerPart[], number[]>();

function contentOffsetBefore(block: LogicalBlock, partIndex: number): number {
  let offsets = partOffsets.get(block.parts);
  if (!offsets || offsets.length !== block.parts.length + 1) {
    offsets = [0];
    for (const part of block.parts) offsets.push(offsets[offsets.length - 1] + part.node.content.size);
    partOffsets.set(block.parts, offsets);
  }
  return offsets[Math.min(partIndex, block.parts.length)];
}

/** The block types a lone page break before is that block's own Word
 * `w:pageBreakBefore` for (the DOCX writer's reading, notebooks.py). A list holds
 * the paragraph that has it: an appendix heading numbered by its style, on the new
 * page of a section, opened a blank page before it three times (corpus R283-D02). */
const PAGE_BREAK_BEFORE_HOSTS = new Set(["paragraph", "heading", "image", "imageRow", "orderedList", "bulletList"]);

/**
 * A `pageBreak` standing alone before a paragraph that is not the tail of a
 * break inside a source paragraph (`<w:br w:type="page"/>`, whose own line
 * Word keeps on the page it ends): the paragraph's page break before. Corpus
 * R38-D14: a next-page section break, then a paragraph with
 * `w:pageBreakBefore` -- Word starts it on the section's new page, not one
 * page later.
 */
/** Whether block `ordinal` is a page break whose page the next section
 * starts anyway: the blocks after it are one empty paragraph and a section
 * break that begins a new page. */
function pageBreakAbsorbedBySection(logical: readonly LogicalBlock[], ordinal: number): boolean {
  const block = logical[ordinal];
  if (!block || block.kind !== "break" || block.parts.length !== 1) return false;
  if (block.parts[0].node.type.name !== "pageBreak") return false;
  const paragraph = logical[ordinal + 1];
  if (!paragraph || paragraph.parts.length !== 1) return false;
  const host = paragraph.parts[0].node;
  if (host.type.name !== "paragraph" || host.childCount !== 0) return false;
  // The boxes the broken paragraph anchors stand between its empty tail and
  // the section's mark on the page, out of the flow: they do not separate
  // the break from the section (corpus R27-D13: "[box]<w:br type=page/>"
  // four times, then the section break; Word starts the next section on
  // the page the last break opened, and the table of contents lands on
  // page 6, not 7).
  const anchorBase = paragraphSourceAnchorBase(host);
  let next = ordinal + 2;
  while (anchorBase && logical[next]?.parts.length === 1 && isAnchoredCompanion(logical[next].parts[0].node, anchorBase)) next += 1;
  const section = logical[next];
  if (!section || section.parts.length !== 1) return false;
  const mark = section.parts[0].node;
  return mark.type.name === "sectionBreak" && mark.attrs?.breakType !== "continuous";
}

/**
 * Whether block `ordinal` is the page break of the document's last paragraph:
 * after it comes nothing but that paragraph's empty, non-printing tail (its
 * mark). Word opens no page for it: the mark stays on the break's page, and
 * the document ends there (Windows Word, probes/cjk9: a last paragraph of a
 * page break alone, or of text and a page break, is one page in
 * compatibility modes 14 and 15 and with no mode written; an empty paragraph
 * after it, or text, makes two). Corpus R410-D21: the tail stood alone on a
 * 13th page, Word 12. `window.__docsDocumentEndBreakPage = true` restores
 * the page (A/B).
 */
export function pageBreakEndsDocument(logical: readonly LogicalBlock[], ordinal: number): boolean {
  if (ordinal + 2 !== logical.length) return false;
  const block = logical[ordinal];
  if (!block || block.kind !== "break" || block.parts.length !== 1) return false;
  if (block.parts[0].node.type.name !== "pageBreak") return false;
  const tail = logical[ordinal + 1];
  if (tail.parts.length !== 1 || !isNonPrintingEmptyTailBlock(tail.parts[0].node)) return false;
  return typeof window === "undefined" ||
    (window as Window & { __docsDocumentEndBreakPage?: boolean }).__docsDocumentEndBreakPage !== true;
}

/** A split paragraph's own source anchor (`…#p[6]` of `…#p[6]/seg[1]`). */
function paragraphSourceAnchorBase(node: PmNode): string | null {
  const anchor = (node.attrs?.source as { sourceAnchor?: unknown } | null | undefined)?.sourceAnchor;
  if (typeof anchor !== "string") return null;
  const match = /^(.*#p\[\d+\])\/seg\[\d+\]$/.exec(anchor);
  return match ? match[1] : null;
}

/** A text box the paragraph at `anchorBase` anchors (`…#p[6]/txbxframe[0]`). */
function isAnchoredCompanion(node: PmNode, anchorBase: string): boolean {
  if (node.type.name !== "textBox") return false;
  const anchor = (node.attrs?.source as { sourceAnchor?: unknown } | null | undefined)?.sourceAnchor;
  return typeof anchor === "string" && anchor.startsWith(`${anchorBase}/`);
}

function paragraphPageStartBreak(
  block: LogicalBlock,
  next: LogicalBlock | undefined,
  previous: LogicalBlock | undefined,
): boolean {
  if (block.kind !== "break" || block.parts.length !== 1) return false;
  if (block.parts[0].node.type.name !== "pageBreak") return false;
  // A break right after another break is Word's break paragraph of its own
  // (Insert > Blank Page in a table: two breaks in a row): it stands at the
  // top of the page the first one opened and breaks that page too, as the
  // DOCX writer writes it (a paragraph of its own, not the next paragraph's
  // page break before). Read as "page break before", the empty page it
  // opens took nothing and the blank page was lost.
  if (previous?.kind === "break" && previous.parts.length === 1 && previous.parts[0].node.type.name === "pageBreak") {
    return false;
  }
  const first = next?.parts[0];
  if (!first || !PAGE_BREAK_BEFORE_HOSTS.has(first.node.type.name)) return false;
  const segment = (first.node.attrs?.source as { hardBreakSegment?: { index?: unknown } } | null | undefined)?.hardBreakSegment;
  return !(typeof segment?.index === "number" && segment.index >= 1);
}

/** Word keeps a continued footnote's first rows with its reference (and
 * the whole note when it is this short). */
export const CONTINUED_NOTE_MIN_ROWS = 2;

/** The rows (px) of a note that stay on the page of its reference. */
export function continuedNoteMinPx(rowPx: number, pitchPx: number): number {
  if (!(pitchPx > 0)) return rowPx;
  return Math.min(rowPx, CONTINUED_NOTE_MIN_ROWS * pitchPx);
}

/** A footnote a text atom references, in the atom's logical content
 * offsets, with the page-bottom rows its note keeps with the reference
 * (`heightPx`) and the rows that may continue on later pages (`flexPx`). */
export interface TextAtomNote {
  logicalOffset: number;
  heightPx: number;
  flexPx?: number;
}

/**
 * Word prints a note at the bottom of the page its reference lands on, so
 * the space a head of the paragraph may take depends on which references it
 * contains, which depends on where it ends. Iterate to a fixed point (three
 * rounds cover every document seen; the plan for the largest reservation
 * seen is the fallback, the one plan that cannot overflow): plan the head
 * with the current reservation, reserve the notes it references, plan again.
 * The cut charges the head its notes and the tail the rest, each page's
 * zone chrome once. A paragraph that fits whole with all its notes is
 * reported as fitting whole (null).
 */
export function planTextHeadWithNotes(
  notes: readonly TextAtomNote[],
  chromePx: number,
  planHead: (reservedPx: number) => (LedgerCut & { payload: TextCutPayload }) | null,
  /** Where the fragment and its cuts stand in the block's text, when the
   * caller can say for more than a cut made inside a fragment
   * (`payload.logicalOffset`): `cutOffset` for a cut at an existing seam
   * (null: not known), `fromOffset` where the fragment being cut starts (the
   * notes before it are on the pages before). Absent: as before. */
  where: { cutOffset?: (cut: LedgerCut) => number | null; fromOffset?: number; pageChromePx?: number; sayNotes?: boolean } = {},
): LedgerCut | null {
  const fromOffset = where.fromOffset ?? 0;
  if (fromOffset > 0) notes = notes.filter((note) => note.logicalOffset >= fromOffset);
  // (`pageChromePx`: the note area's chrome this page has paid already; the
  // tail's page pays its own.)
  const headChromePx = Math.max(0, chromePx - Math.max(0, where.pageChromePx ?? 0));
  const reservationOf = (selected: readonly TextAtomNote[], chrome = headChromePx) =>
    selected.length ? selected.reduce((sum, note) => sum + note.heightPx, 0) + chrome : 0;
  const totalPx = reservationOf(notes);
  if (!(totalPx > 0)) return planHead(0);
  const flexOf = (selected: readonly TextAtomNote[]) =>
    selected.reduce((sum, note) => sum + (note.flexPx ?? 0), 0);
  const charge = (cut: LedgerCut & { payload: TextCutPayload }) => {
    // (A cut at an existing seam states no offset of its own: compared with
    // `undefined`, no note was the head's nor the tail's, and the seam's two
    // sides were charged no notes at all.)
    const at = Number.isFinite(cut.payload.logicalOffset) ? cut.payload.logicalOffset : where.cutOffset?.(cut) ?? Number.NaN;
    const head = notes.filter((note) => note.logicalOffset < at);
    const tail = notes.filter((note) => note.logicalOffset >= at);
    const headPx = reservationOf(head);
    const headNoteFlexPx = flexOf(head);
    const tailNoteFlexPx = flexOf(tail);
    return {
      headPx,
      charged: {
        ...cut,
        headHeightPx: cut.headHeightPx + headPx,
        tailHeightPx: cut.tailHeightPx + reservationOf(tail, chromePx),
        ...(headNoteFlexPx > 0 ? { headNoteFlexPx } : {}),
        ...(tailNoteFlexPx > 0 ? { tailNoteFlexPx } : {}),
        ...(where.sayNotes && Number.isFinite(at) ? { headNotesPx: headPx, tailNotesPx: reservationOf(tail, chromePx) } : {}),
      } as LedgerCut,
    };
  };
  let reservedPx = 0;
  // A head planned under at least its own reservation cannot overflow; the
  // last such plan stands when the rounds run out before a fixed point.
  let safe: LedgerCut | null = null;
  for (let round = 0; round < 3; round += 1) {
    const cut = planHead(reservedPx);
    if (!cut) {
      // The text fits; the notes must too before the whole atom may stay.
      if (reservedPx >= totalPx - 1e-6) return null;
      reservedPx = totalPx;
      continue;
    }
    const { headPx, charged } = charge(cut);
    if (Math.abs(headPx - reservedPx) <= 1e-6) return charged;
    if (headPx < reservedPx) safe = charged;
    reservedPx = headPx;
  }
  if (safe) return safe;
  const last = planHead(totalPx);
  return last ? charge(last).charged : null;
}

/** Parts of this build whose height the docs-layout engine gave with no
 * layout of their page, exactly (not an estimate): they are cut at its lines. */
const engineLaidParts = new WeakSet<LedgerPart>();
/** Every block's last measurement or exact engine reading, by its node: what
 * it stands as on a sheet drawn hollow, where it has no DOM to read. */
const nodeMeasures = new WeakMap<PmNode, LedgerFragmentMeasure>();
/** Those from a kept layout, not yet read by this page. */
const seededMeasures = new WeakSet<PmNode>();
/** Tables read far taller than they stood, not believed yet. */
const doubtedTables = new WeakMap<PmNode, number>();
/** How soon a doubted table is first read again; each reading after waits twice as long. */
const DOUBTED_TABLE_RETRY_MS = 300;
/** How many readings a table is doubted for (about 9 s in all); after them it stands as read. */
const DOUBTED_TABLE_RETRIES = 5;

/** The same table read far taller than it stood, nothing in it changed (the
 * node is the same): more likely not yet drawn at its widths than truly so. */
export function tableHeightLooksTransient(lastPx: number, nowPx: number): boolean {
  return lastPx > 0 && nowPx > lastPx * 3 && nowPx - lastPx > 1000;
}
/** Parts the engine read as an estimate (a formula boxed by the engine, a
 * tab at a default stop): cut at its lines too when a plan goes past them,
 * their sheets never trusted, so the page checks them when it lays them out. */
const engineGuessedParts = new WeakSet<LedgerPart>();
/** Tables the engine read with no layout: cut between their rows from the
 * engine's row heights (planEngineTableFragment). */
const engineTableParts = new WeakSet<LedgerPart>();
/** Within this much the page's height of a laid-out paragraph and the
 * engine's no-layout one agree, px. */
const CALIBRATION_SAME_PX = 0.5;
/** Per editor: how often the engine's no-layout paragraphs agreed with the
 * page, by face and alignment (`calibrationKey`), and the paragraphs held. */
const calibrations = new WeakMap<HTMLElement, Map<string, { agreed: number; differed: number }>>();
const calibrated = new WeakMap<PmNode, number>();

/** How many laid-out paragraphs of a face are held against the engine. */
const CALIBRATION_SAMPLES = 60;

function calibrationSamples(root: HTMLElement, key: string): number {
  const count = calibrations.get(root)?.get(key);
  return count ? count.agreed + count.differed : 0;
}

const calibrationKeys = new WeakMap<PmNode, string>();

function calibrationKey(dom: HTMLElement, node: PmNode): string {
  // By node: an unchanged block keeps its face and alignment (a computed
  // style read per far paragraph per build recalculated styles after every
  // keystroke's writes).
  const kept = calibrationKeys.get(node);
  if (kept !== undefined) return kept;
  const key = readCalibrationKey(dom, node);
  calibrationKeys.set(node, key);
  return key;
}

function readCalibrationKey(dom: HTMLElement, node: PmNode): string {
  const style = getComputedStyle(dom);
  // A paragraph with in-line formulas is read with the engine's boxes for
  // them: it earns its trust apart (the boxes are KaTeX's metrics, the
  // page's the browser's typesetting of the same formulas).
  let math = false;
  node.descendants((child) => {
    if (child.type.name === "inlineMath") math = true;
    return !math;
  });
  return `${style.fontFamily}|${style.textAlign}${math ? "|math" : ""}`;
}

function noteCalibration(root: HTMLElement, key: string, agreed: boolean): void {
  let byKey = calibrations.get(root);
  if (!byKey) calibrations.set(root, (byKey = new Map()));
  const count = byKey.get(key) ?? { agreed: 0, differed: 0 };
  if (agreed) count.agreed += 1;
  else count.differed += 1;
  byKey.set(key, count);
  const win = root.ownerDocument.defaultView as (Window & { __docsLedgerCalibration?: Record<string, { agreed: number; differed: number }> }) | null;
  if (win) (win.__docsLedgerCalibration ??= {})[key] = count;
}

/**
 * Whether the engine's no-layout paragraphs of this face and alignment may
 * stand for the page: the paragraphs of it the page laid out agreed with
 * the engine, but for one in fifty (a model the page disagrees with -- an
 * unserved face, a markup the engine does not draw -- falls back on its own,
 * as the laid-out blocks do). A face no paragraph of has been laid out yet
 * is trusted.
 */
function calibrationTrusts(root: HTMLElement, key: string): boolean {
  const count = calibrations.get(root)?.get(key);
  if (!count) return true;
  return count.differed <= Math.floor((count.agreed + count.differed) / 50);
}

/** The engine's estimates the harness compares (`__docsUnlaidCompare`). */
const unlaidEstimates = new WeakMap<PmNode, { kind: string; approximate: boolean; heightPx: number }>();

function planTextHead(
  view: EditorView,
  block: LogicalBlock,
  request: LedgerSplitRequest,
): LedgerCut | null {
  const notes: TextAtomNote[] = block.parts.flatMap((part, partIndex) =>
    part.notes.map((note) => ({
      logicalOffset: contentOffsetBefore(block, partIndex) + note.offset,
      heightPx: note.minPx,
      flexPx: note.heightPx - note.minPx,
    })),
  );
  const chromePx = Math.max(0, ...block.parts.map((part) => part.noteChromePx));
  const plan = (reservedPx: number) =>
    planTextHeadOnce(view, block, { ...request, availablePx: request.availablePx - reservedPx }, reservedPx) as (LedgerCut & { payload: TextCutPayload }) | null;
  if (seamNotesUncharged(view)) return planTextHeadWithNotes(notes, chromePx, plan);
  // A cut at a seam the block already has falls where that seam's tail
  // starts, and a fragment that continues from a cut starts there: the notes
  // on either side are charged as for a cut made now. Charged no notes, a
  // paragraph whose tail holds references stood above a note area the page
  // had no room for (corpus R480-D03 page 2: the next paragraph's rows drawn
  // 63 px into the notes), and every key near the seam above planned the
  // page with the notes, the pass after without them: five pages there and
  // back.
  const seamOffset = (payload: unknown): number | null => {
    const at = payload as { partIndex?: unknown; boundary?: unknown; logicalOffset?: unknown } | null;
    if (!at) return null;
    if (typeof at.logicalOffset === "number" && Number.isFinite(at.logicalOffset)) return at.logicalOffset;
    if (at.boundary !== true || !Number.isInteger(at.partIndex)) return null;
    const tailPart = (at.partIndex as number) + 1;
    return tailPart < block.parts.length ? contentOffsetBefore(block, tailPart) : null;
  };
  return planTextHeadWithNotes(notes, chromePx, plan, {
    cutOffset: (cut) => seamOffset(cut.payload),
    fromOffset: request.from ? seamOffset(request.from.payload) ?? 0 : 0,
    // One note area a page: a head under notes the page already holds adds
    // its rows, not a second separator (the cut says which side holds notes,
    // so the page knows whether it has paid: ledgerCut `notesBelow`).
    pageChromePx: request.pageNoteChromePx ?? 0,
    sayNotes: true,
  });
}

/** `window.__docsSeamNotesUncharged = true`: a cut at an existing seam is
 * charged no notes, and a continued fragment all of its block's, as before
 * (an A/B of one build). */
function seamNotesUncharged(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsSeamNotesUncharged?: boolean }) | null)?.__docsSeamNotesUncharged === true;
}

/**
 * The notes a text block's fragments from `partIndex` on hold, as a cut there
 * charges its tail (their minimum rows and the note area's chrome): what a
 * page that opens with that continuation pays besides the fragments' rows.
 */
export function textTailNotesPx(block: LogicalBlock, partIndex: number): number {
  if (block.kind !== "text") return 0;
  let rows = 0;
  let chrome = 0;
  for (let index = partIndex; index < block.parts.length; index += 1) {
    const part = block.parts[index];
    if (!part.notes.length) continue;
    for (const note of part.notes) rows += note.minPx;
    chrome = Math.max(chrome, part.noteChromePx);
  }
  return rows > 0 ? rows + chrome : 0;
}

function planTextHeadOnce(
  view: EditorView,
  block: LogicalBlock,
  request: LedgerSplitRequest,
  reservedPx = 0,
): LedgerCut | null {
  const chained = chainedStartPart(block, request);
  // An inner text cut chained in this same pass carries the row it stops at.
  const inner = request.from && chained === null ? (request.from.payload as TextCutPayload) : null;
  if (request.from && chained === null && !(inner && Number.isFinite(inner.rowTop))) return null;
  const from = inner;
  const minLines = request.pageEmpty ? 1 : minimumTextSplitLines(block.parts[0].node.attrs?.widowControl);
  let remaining = request.availablePx;
  let headHeight = 0;
  const startPart = from ? from.partIndex : (chained ?? 0);
  // The whole block was judged with no page-bottom credit (notes stand
  // below it on this page): its head is judged so too. Judged with the
  // credit, a paragraph a hair over the room left "fitted" here and was
  // answered "fits whole" -- to a caller that had just found it does not,
  // and moved it on whole (corpus R380-D22 page 1: 303.6 px against 302.4
  // left above the notes, the paragraph sent to page 2 and 300 px left
  // blank; Word cuts it there). `window.__docsOracleCreditAlways = true`
  // gives the credit as before.
  const noCredit = request.noFootCredit === true &&
    (view.dom.ownerDocument.defaultView as (Window & { __docsOracleCreditAlways?: boolean }) | null)?.__docsOracleCreditAlways !== true;
  const creditOf = (part: LedgerPart): number => (noCredit ? 0 : part.creditPx);
  const tracing = oracleTraceEnabled();
  const visited: string[] = [];
  const trace = (failedPart: number, result: LedgerCut | null, why: string) => {
    if (!tracing) return;
    traceOracle({
      atom: block.index, kind: "text", why, visited, ...(noCredit ? { noCredit } : {}),
      parts: block.parts.map((p) => Math.round(p.heightPx * 100) / 100),
      credits: block.parts.map((p) => Math.round(p.creditPx * 100) / 100),
      availablePx: Math.round(request.availablePx * 100) / 100, reservedPx: Math.round(reservedPx * 100) / 100, startPart, minLines,
      failedPart, remaining: Math.round(remaining * 100) / 100, result: result?.key ?? null,
    });
  };
  for (let partIndex = startPart; partIndex < block.parts.length; partIndex += 1) {
    const part = block.parts[partIndex];
    const fromTop = from && partIndex === from.partIndex ? from.rowTop : 0;
    // On a Word line grid every row costs whole slots, and the fragment's
    // height is that slot sum. The painted rows can advance by less (WebKit
    // paints a 20.8px line-height 20px apart), so the page-edge decision is
    // made in slots too: the same accounting the fragment is charged with.
    // Reasoning in painted pixels here let 13 painted rows "fit" a space that
    // only holds 12 slots; the next pass then charged the head 13 slots and
    // moved it back, forever.
    const grid = textLineGridRows(part.dom);
    // (From the block's top, every row. A glyph box taller than its line stands a
    // pixel above the block: filtered out, the first row was never charged, the
    // rows to keep counted it all the same, and the head stood a row over the
    // page's foot: 8 px, 18 px, an extra PDF page each on a 310-page book.)
    const gridRows = grid ? (fromTop > 0 ? grid.rows.filter((row) => row.topPx >= fromTop - 0.5) : grid.rows) : null;
    const partRemaining = gridRows && fromTop > 0
      ? gridRows.reduce((sum, row) => sum + row.heightPx, 0)
      : part.heightPx - fromTop;
    if (tracing) visited.push(`part ${partIndex}: ${Math.round(partRemaining * 100) / 100} - credit ${Math.round(part.creditPx * 100) / 100} vs ${Math.round(remaining * 100) / 100}`);
    if (partRemaining - creditOf(part) <= remaining + (gridRows ? LINE_GRID_FIT_TOLERANCE_PX : 1e-6)) {
      // An edit at a page seam of this paragraph (a space deleted or typed
      // where the head ends or the tail starts): the head's last row and the
      // tail's first row were laid out apart, so neither shows where the
      // joined text breaks now -- a word joined across the seam stayed split
      // over two pages, a word that fits back stayed on the next one, until
      // reopening laid the paragraph out whole (WUA 074). Word re-breaks at
      // once: cut before the head's last row, which joins that row to the
      // tail, and the next pass takes back from the joined tail exactly the
      // rows that fit.
      const nextPart = block.parts[partIndex + 1];
      if (nextPart && nextPart.sheet !== part.sheet && !nextPart.columnSeamBefore && block.editedSeams?.has(partIndex + 1)) {
        const rows = measureTextLineBoxes(part.dom).filter((row) => row.top >= fromTop - 0.5);
        // Where the seam belongs is read from the two pieces laid out as one,
        // off-screen, and the cut is made there in this pass: nothing is drawn
        // on the way (seamRebreakCut).
        const rebreak = fromTop <= 0 && !gridRows && (rows.length >= minLines || partIndex > startPart)
          ? seamRebreakCut(view, block, partIndex, rows, headHeight + partRemaining, minLines, tailBoundPx(request))
          : null;
        if (tracing) traceOracle({ atom: block.index, editedSeam: partIndex + 1, fromTop, grid: Boolean(gridRows), rows: rows.length, minLines, rebreak: rebreak === "stands" ? "stands" : rebreak?.key ?? null });
        if (rebreak === "stands") {
          // The joined text breaks where the seam is: nothing to cut again.
          remaining -= partRemaining;
          headHeight += partRemaining;
          continue;
        }
        if (rebreak) {
          trace(partIndex, rebreak, "edited-seam-rebreak");
          return rebreak;
        }
        const lastTop = rows.length >= 2 ? rows[rows.length - 1].top : null;
        if (lastTop !== null && lastTop > fromTop + 1) {
          const recut = planTextHeadOnce(
            view,
            { ...block, editedSeams: undefined },
            { ...request, availablePx: request.availablePx - remaining + (lastTop - fromTop) },
            reservedPx,
          );
          const payload = recut?.kind === "text" ? (recut.payload as TextCutPayload) : null;
          if (recut && payload && payload.partIndex === partIndex) {
            trace(partIndex, recut, "edited-seam-recut");
            return recut;
          }
        }
      }
      // The whole (remaining) fragment fits; keep walking into the next one.
      remaining -= partRemaining;
      headHeight += partRemaining;
      continue;
    }
    // Cut inside this fragment: the planner measures from the fragment top.
    // When the fragment is not the first one visited, an existing seam right
    // before it is a legal cut too; prefer the inner cut, fall back to the seam.
    const atSeam = partIndex > startPart ? boundaryCut(block, partIndex, startPart) : null;
    // Word's widow / orphan floors count the PARAGRAPH's lines: rows in its
    // later fragments (an in-sheet column seam, an earlier page cut) go with
    // the tail, rows of the fragments already walked are the head's. Counted
    // on this fragment alone, a cut one row above a column seam saw a one-row
    // "widow" and gave up a row the column holds (regionflow.docx p1: a
    // 3-row head planned as 2, the next column charged a row it never held).
    // (Only as far as the floor: every later fragment read would lay out every
    // later sheet of a paragraph many pages long.)
    let rowsAfter = 0;
    for (let later = partIndex + 1; later < block.parts.length && rowsAfter < minLines; later += 1) {
      rowsAfter += engineBlockLineCount(block.parts[later].node) ?? measureTextLineBoxes(block.parts[later].dom).length;
    }
    const rowsBefore = block.parts.slice(startPart, partIndex).reduce((sum, earlier, offset) => {
      const top = from && startPart + offset === from.partIndex ? from.rowTop : 0;
      return sum + measureTextLineBoxes(earlier.dom).filter((line) => line.top >= top - 0.5).length;
    }, 0);
    // Off the line grid's rows, the head is cut on its painted lines: the room the
    // charge leaves, in the pixels WebKit paints a fractional line at.
    let cutBudgetPx = fromTop + (gridRows && gridRows.length > 0 ? remaining : truncatedTextRoomPx(part.dom, remaining));
    let gridHeadPx: number | null = null;
    let gridRowsToKeep: number | null = null;
    let gridHeadEdgePx = 0;
    if (gridRows && gridRows.length > 0) {
      let kept = 0;
      let cost = 0;
      // A head keeps the room of the paragraph's bottom edge (its border and
      // spacing, drawn transparent on the fragment). Rows counted without it
      // made a head that did not fit the page: the next pass moved the paragraph
      // on whole and the one after cut it again, every page after it with it.
      gridHeadEdgePx = bottomEdgePx(part.dom);
      while (kept < gridRows.length && cost + gridRows[kept].heightPx + gridHeadEdgePx - Math.max(0, creditOf(part)) <= remaining + LINE_GRID_FIT_TOLERANCE_PX) {
        cost += gridRows[kept].heightPx;
        kept += 1;
      }
      if (kept >= gridRows.length) { trace(partIndex, atSeam, "grid-all-rows"); return atSeam; }
      // Word moves the row before a widow to the next page as well.
      kept = Math.min(kept, gridRows.length - Math.max(0, minLines - rowsAfter));
      if (kept + rowsBefore < minLines || kept < 1) { trace(partIndex, atSeam, `grid-floor:${kept}/${gridRows.length}`); return atSeam; }
      cost = gridRows.slice(0, kept).reduce((sum, row) => sum + row.heightPx, 0);
      // Cut before the first row that does not fit. The planner is given the
      // row COUNT, not a pixel budget: painted glyph boxes only locate rows.
      cutBudgetPx = gridRows[kept].topPx;
      gridHeadPx = cost;
      gridRowsToKeep = (grid!.rows.length - gridRows.length) + kept;
    }
    // Off the grid, a row is kept by the same page-bottom rule the fragment
    // is then judged by: the head fragment ending with it, less its own last
    // line's Auto leading, fits the budget. The planner renders that head to
    // decide; glyph boxes (or the whole block's credit) only propose a row,
    // and a head kept by them failed the fragment rule on the next pass,
    // which moved the text back.
    // (The rendered head that confirms the row has a credit of its own: it
    // is told too, or a row kept by that credit made a head the next pass,
    // judging the fragment with none, cut back -- R380-D22 page 3, a row
    // 25.3 px tall kept in 19 px, the page 874 px for 867, one layout and
    // the other on every key.)
    const cutContext = { rowsBefore, rowsAfter, footCreditPx: creditOf(part), ...(noCredit ? { noFootCredit: true } : {}) };
    const pageCut = () => gridRowsToKeep !== null
      ? planTextCutByChars(part.dom, cutBudgetPx, minLines, false, gridRowsToKeep, { rowsBefore, rowsAfter, formulasOpenRows: true })
      : planTextCutByChars(part.dom, cutBudgetPx, minLines, true, null, cutContext);
    // A block whose lines agreed with the page is cut by them, with no
    // search of the page; from a cut made on this page the page is asked.
    const partFromPos = part.pos + 1;
    // A paragraph the docs-layout engine laid out unread (past the horizon)
    // is cut at its engine lines: asking the page laid that page out.
    const lineCut = gridRowsToKeep === null && fromTop <= 0 && textEngineEnabled("docs")
      ? engineTextCut(part.node, cutBudgetPx, minLines, cutContext)
      : gridRowsToKeep === null && fromTop <= 0 && block.parts.length === 1 && (engineLaidParts.has(part) || engineGuessedParts.has(part))
        ? unlaidEngineTextCut(part.node, cutBudgetPx, minLines, { ...cutContext, estimate: engineGuessedParts.has(part) }, (start) => {
          try {
            return view.posAtDOM(start.node, start.offset) - partFromPos;
          } catch {
            return null;
          }
        })
        : undefined;
    const win = part.dom.ownerDocument.defaultView;
    const partFrom = part.pos + 1;
    let cut: { rowTop: number; node?: Node; offset?: number } | null;
    if (lineCut === undefined) {
      // (Empty only for the piece that opens the page: under another one the
      // picture goes to the next page. R282-D07: read so, the second picture
      // stayed under the first, 1,586 px on a 1,123 px sheet.)
      cut = pageCut() ?? planPictureLineCut(part.dom, cutBudgetPx, fromTop, request.pageEmpty && partIndex === startPart);
    } else {
      cut = lineCut;
      let same: boolean | undefined;
      if (engineCutCompare(win)) {
        const drawn = pageCut();
        try {
          same = drawn && lineCut ? view.posAtDOM(drawn.node, drawn.offset) === partFrom + lineCut.contentOffset : !drawn && !lineCut;
        } catch {
          same = false;
        }
      }
      countEngineCut(win, same);
    }
    if (!cut || cut.rowTop <= fromTop + 1e-6) {
      trace(partIndex, atSeam, cut ? `row-at-top:${Math.round(cut.rowTop * 100) / 100}` : `no-row:${Math.round(cutBudgetPx * 100) / 100}`);
      return atSeam;
    }
    // A formula left the head fewer rows than the rows that fit (planTextCutByChars).
    const rowsKept = (cut as { rowsKept?: number }).rowsKept;
    if (rowsKept !== undefined && gridRowsToKeep !== null && gridRows && grid && rowsKept < gridRowsToKeep) {
      gridHeadPx = gridRows.slice(0, rowsKept - (grid.rows.length - gridRows.length)).reduce((sum, row) => sum + row.heightPx, 0);
    }
    let cutPos: number;
    try {
      cutPos = lineCut ? partFrom + lineCut.contentOffset : view.posAtDOM(cut.node!, cut.offset!);
    } catch {
      trace(partIndex, atSeam, "pos");
      return atSeam;
    }
    const partTo = part.pos + part.node.nodeSize - 1;
    // Word's last-rendered page break (an invisible source page boundary)
    // at the start of the cut row opens the tail with that row. Left at the
    // head's end after a line break it stood alone on a row of its own: a
    // two-row head measured three and the paragraph left the page whole
    // (corpus R91-D04, Word keeps the two rows).
    for (let before = view.state.doc.resolve(cutPos).nodeBefore;
      before?.type.name === "sourcePageBreak" && cutPos - before.nodeSize > partFrom;
      before = view.state.doc.resolve(cutPos).nodeBefore) {
      cutPos -= before.nodeSize;
    }
    if (cutPos <= partFrom || cutPos >= partTo) { trace(partIndex, atSeam, "edge"); return atSeam; }
    const logicalOffset = contentOffsetBefore(block, partIndex) + (cutPos - partFrom);
    const headInPart = gridHeadPx ?? cut.rowTop - fromTop;
    headHeight += headInPart;
    const totalHeight = block.parts.reduce((sum, p) => sum + p.heightPx, 0);
    const headFromPartTop = gridHeadPx !== null
      ? (grid ? grid.rows.filter((row) => row.topPx < fromTop - 0.5).reduce((sum, row) => sum + row.heightPx, 0) : 0) + gridHeadPx
      : cut.rowTop;
    const headAbsolute = contentOffsetBefore(block, partIndex) === 0 && partIndex === 0 ? headFromPartTop : partHeightsBefore(block, partIndex) + headFromPartTop;
    // A cut the page and the plan disagree on (see refusedRowCuts): the seam it
    // would have taken back stands, and the plan goes on from there.
    if (atSeam && ledgerCutRefused(view, `${block.index}+text:${logicalOffset}`)) {
      trace(partIndex, atSeam, "refused");
      return atSeam;
    }
    const result: LedgerCut = {
      kind: "text",
      key: `text:${logicalOffset}`,
      payload: { logicalOffset, partIndex, rowTop: cut.rowTop } satisfies TextCutPayload,
      headHeightPx: headHeight + gridHeadEdgePx,
      // What the next page is charged. Where fragments follow the one cut,
      // what the cut leaves of it joins them and their rows flow again: the
      // tail as it will stand, laid out before it exists. A block cut for
      // the first time keeps its rows: its height less the head's (and so a
      // document laid out for the first time pays nothing for this). On a
      // line grid too: the copy is drawn on the grid's slots as the
      // fragment will be, and the slots' arithmetic charged the row a typed
      // character pushed out of the head a slot of its own though the tail's
      // first row took it up (corpus R481-D06, East Asian text on a grid:
      // the next page planned a row short, the pass after a row back, on
      // every key in the head's last row). `window.__docsGridTailArithmetic
      // = true` keeps the slots' arithmetic on a grid (A/B).
      tailHeightPx: ((gridRows && gridTailArithmetic(view)) || partIndex + 1 >= block.parts.length
        ? null
        : measuredTailHeightPx(view, block, partIndex, cutPos, tailBoundPx(request), Math.max(0, totalHeight - headAbsolute))) ??
        Math.max(0, totalHeight - headAbsolute),
    };
    trace(partIndex, result, `cut:${Math.round(cut.rowTop * 100) / 100}`);
    return result;
  }
  // Everything remaining fits — the caller should have placed it whole.
  trace(-1, null, "all-fits");
  return null;
}

function gridTailArithmetic(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsGridTailArithmetic?: boolean }) | null)?.__docsGridTailArithmetic === true;
}

/**
 * The height of the tail a cut at `cutPos` inside part `partIndex` leaves,
 * laid out off-screen (renderedTextTailHeightPx): what the next page is
 * charged. Null where it is not read so (a hollow fragment, a position the
 * page cannot place, columns): the caller's arithmetic stands.
 * `window.__docsRenderedTailOff = true` is the arithmetic throughout (A/B).
 */
function measuredTailHeightPx(
  view: EditorView,
  block: LogicalBlock,
  partIndex: number,
  cutPos: number,
  boundPx?: number,
  /** The tail as its fragments stand (the caller's arithmetic). */
  standingPx?: number,
): number | null {
  const win = view.dom.ownerDocument.defaultView as (Window & {
    __docsRenderedTailOff?: boolean;
    __docsRenderedTailBoundOff?: boolean;
    __docsRenderedTailStandingOff?: boolean;
  }) | null;
  if (win?.__docsRenderedTailOff === true) return null;
  const bound = win?.__docsRenderedTailBoundOff === true ? undefined : boundPx;
  // A tail standing twice the page's room or more is past the room however
  // its rows flow joined: it is charged as it stands, and the next page cuts
  // it from its own fragments (tailStandsPastRoom).
  if (win?.__docsRenderedTailStandingOff !== true && tailStandsPastRoom(standingPx, bound)) return null;
  const { through, beyondPx } = boundedTailParts(block, partIndex, bound);
  if (block.parts.some((part, index) => index >= partIndex && index <= through && part.hollow)) return null;
  try {
    const at = view.domAtPos(cutPos, 1);
    const laidOut = renderedTextTailHeightPx(
      block.parts.slice(0, through + 1).map((part) => part.dom), partIndex, at.node, at.offset, cutPos - block.parts[partIndex]!.pos,
    );
    return laidOut === null ? null : laidOut + beyondPx;
  } catch {
    return null;
  }
}

/**
 * Whether a tail is charged as its fragments stand, never laid out: they stand
 * at least `boundPx` (twice the page's room) after the cut.
 *
 * What the next page is charged decides only whether the tail fits there, and
 * the cut it then makes is planned from the tail's own fragments. Joined, the
 * rows of a tail move at its seams by a row or so each, never by a page: one
 * standing twice the room is past it either way. Laid out through twice the
 * room (boundedTailParts), each such tail still cloned two pages of runs and
 * forced their layout -- every cut of a code listing over 20 sheets, every pass
 * (R461-D71's print: 1,580 tails at 23 ms, 36 s of its first 250 s; tails
 * asked again of the same fragments, 1.4%). Only a tail within twice the room
 * is laid out now, as before.
 * `window.__docsRenderedTailStandingOff = true`: laid out as before (A/B).
 */
export function tailStandsPastRoom(standingPx: number | undefined, boundPx: number | undefined): boolean {
  return standingPx !== undefined && boundPx !== undefined && boundPx > 0 && Number.isFinite(standingPx) && standingPx >= boundPx;
}

/**
 * The fragments of a tail cut in part `partIndex` that are laid out: through
 * the first one after it where those after the cut stand at least `boundPx`
 * tall as they are (all of them without a bound), and what the fragments past
 * that one are charged as they stand (their heights and the spacing their
 * seams drop).
 */
export function boundedTailParts(
  block: Pick<LogicalBlock, "parts">,
  partIndex: number,
  boundPx: number | undefined,
): { through: number; beyondPx: number } {
  const last = block.parts.length - 1;
  if (boundPx === undefined || !(boundPx > 0)) return { through: last, beyondPx: 0 };
  let through = partIndex;
  for (let laidOutPx = 0; through < last && laidOutPx < boundPx;) {
    through += 1;
    laidOutPx += block.parts[through]!.heightPx + block.parts[through]!.joinBeforePx;
  }
  let beyondPx = 0;
  for (let index = through + 1; index <= last; index += 1) beyondPx += block.parts[index]!.heightPx + block.parts[index]!.joinBeforePx;
  return { through, beyondPx };
}
















function tailBoundPx(request: { fullCapacityPx: number }): number | undefined {
  return Number.isFinite(request.fullCapacityPx) && request.fullCapacityPx > 0 ? request.fullCapacityPx * 2 : undefined;
}

/** `window.__docsSeamRebreakOnePassOff = true`: a stale seam is cut before
 * the head's last row and taken back a pass later, as before (an A/B). */
function seamRebreakOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsSeamRebreakOnePassOff?: boolean }) | null)?.__docsSeamRebreakOnePassOff === true;
}

/**
 * The cut a stale page seam of a paragraph is replaced by, in one pass.
 *
 * A seam the rows no longer break at (an edit beside it, a line pulled up
 * since the cut was made) used to be cut again in two passes: before the
 * head's last row, so that row was laid out with the tail, then back to the
 * rows that fit. The pass between drew the row on the next page, and every
 * page after it moved and came back with it (a key typed in a row above a
 * seam: the three pages after it re-cut twice each). Here the two pieces are
 * laid out as one off-screen (joinedTextRebreak) and the cut goes straight
 * to where the joined text starts its next row: the page keeps the rows the
 * head has, the tail keeps its widow floor.
 *
 * `"stands"`: the joined text breaks at the seam. Null: not read so (columns,
 * anything but plain text in the two pieces, the floor not kept, a cut the
 * page refused), and the seam is cut again the old way.
 */
function seamRebreakCut(
  view: EditorView,
  block: LogicalBlock,
  partIndex: number,
  rows: readonly { top: number }[],
  headHeightPx: number,
  minLines: number,
  tailBound?: number,
): LedgerCut | "stands" | null {
  const why = (reason: string): null => {
    if (oracleTraceEnabled()) traceOracle({ atom: block.index, seamRebreak: reason });
    return null;
  };
  if (seamRebreakOff(view)) return why("off");
  const part = block.parts[partIndex];
  const next = block.parts[partIndex + 1];
  if (!next || part.hollow || next.hollow) return why("hollow");
  // The widow floor counts the paragraph's rows: those of the pieces after
  // the tail are the next pages' already.
  let later = 0;
  for (let index = partIndex + 2; index < block.parts.length && later < minLines; index += 1) {
    later += engineBlockLineCount(block.parts[index].node) ?? measureTextLineBoxes(block.parts[index].dom).length;
  }
  const need = Math.max(1, minLines - later);
  let read: ReturnType<typeof joinedTextRebreak>;
  try {
    read = joinedTextRebreak(part.dom, next.dom, need, (copy) => engineJoinedRows(view, part, next, copy));
  } catch {
    return why("threw");
  }
  if (!read) return why(`read: ${joinedTextRebreakWhy ?? "copy"}`);
  if (read.rowsAfter < need) return why(`rows-after ${read.rowsAfter} < ${need}`);
  let cutPos: number;
  try {
    cutPos = view.posAtDOM(read.node, read.offset);
  } catch {
    return why("pos");
  }
  const own = read.side === "head" ? part : next;
  const ownIndex = read.side === "head" ? partIndex : partIndex + 1;
  const from = own.pos + 1;
  const to = own.pos + own.node.nodeSize - 1;
  if (read.side === "tail" && cutPos <= from) return "stands";
  if (cutPos <= from || cutPos >= to) return why(`outside ${read.side} ${cutPos} ${from}..${to}`);
  const logicalOffset = contentOffsetBefore(block, ownIndex) + (cutPos - from);
  if (ledgerCutRefused(view, `${block.index}+text:${logicalOffset}`)) return why(`refused ${logicalOffset}`);
  if (oracleTraceEnabled()) traceOracle({ atom: block.index, seamRebreak: `cut ${read.side} text:${logicalOffset}` });
  // (A cut in the head leaves its last row's start where it is: the word a
  // join made too long for the row goes on, the rows above stay.)
  const lastRowTop = rows.length > 0 ? rows[rows.length - 1].top : 0;
  const standingTailPx = (read.side === "head" ? Math.max(0, part.heightPx - lastRowTop) : 0) + partHeightsAfter(block, partIndex);
  return {
    kind: "text",
    key: `text:${logicalOffset}`,
    payload: { logicalOffset, partIndex: ownIndex, rowTop: read.side === "head" ? lastRowTop : 0 } satisfies TextCutPayload,
    headHeightPx,
    tailHeightPx: measuredTailHeightPx(view, block, ownIndex, cutPos, tailBound, standingTailPx) ?? standingTailPx,
  };
}

/** Height of parts `startPart..partIndex-1` rendered joined on one page:
 * their physical heights plus the spacing each interior seam currently drops. */
function partHeightsBetween(block: LogicalBlock, startPart: number, partIndex: number): number {
  let sum = 0;
  for (let i = startPart; i < partIndex; i += 1) sum += block.parts[i].heightPx + (i > startPart ? block.parts[i].joinBeforePx : 0);
  return sum;
}
function partHeightsBefore(block: LogicalBlock, partIndex: number): number {
  return partHeightsBetween(block, 0, partIndex);
}

/**
 * First part a chained request continues from. A chained cut that is an
 * existing seam (`boundary` payload) continues with the part after it — its
 * fragments are rendered and measurable. A chained cut planned inside a
 * fragment in this same pass has no rendered tail yet: null, the next pass
 * refines it once the seam exists.
 */
function chainedStartPart(block: LogicalBlock, request: LedgerSplitRequest): number | null {
  if (!request.from) return 0;
  const payload = request.from.payload as { partIndex?: unknown; boundary?: unknown } | null;
  if (!payload || payload.boundary !== true || !Number.isInteger(payload.partIndex)) return null;
  const start = (payload.partIndex as number) + 1;
  return start < block.parts.length ? start : null;
}

function planCodeHead(block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  const part = block.parts[0];
  const metrics = measureCodeLineMetrics(part.dom, part.node, part.heightPx);
  if (!(metrics.lineHeightPx > 0)) return null;
  const totalLines = block.parts.reduce((sum, p) => sum + p.node.textContent.split("\n").length, 0);
  const chained = chainedStartPart(block, request);
  const from = request.from && chained === null ? (request.from.payload as CodeCutPayload) : null;
  if (request.from && chained === null && !(from && Number.isInteger(from.line))) return null;
  const linesBefore = (partIndex: number) => block.parts.slice(0, partIndex).reduce((sum, p) => sum + p.node.textContent.split("\n").length, 0);
  const startLine = from ? from.line : linesBefore(chained ?? 0);
  const remainingLines = totalLines - startLine;
  const minLines = request.pageEmpty ? 1 : 2;
  const k = Math.floor((request.availablePx - Math.max(0, metrics.chromePx)) / metrics.lineHeightPx);
  const head = Math.min(k, remainingLines - minLines);
  if (head < minLines) {
    // An existing seam may still be a legal cut for a multi-fragment block.
    const startPart = chained ?? 0;
    for (let partIndex = startPart; partIndex < block.parts.length - 1; partIndex += 1) {
      if (partHeightsBetween(block, startPart, partIndex + 1) <= request.availablePx + 1e-6) continue;
      return partIndex > startPart ? boundaryCut(block, partIndex, startPart) : null;
    }
    return null;
  }
  return {
    kind: "code",
    key: `code:${startLine + head}`,
    payload: { line: startLine + head, lineHeightPx: metrics.lineHeightPx, chromePx: metrics.chromePx } satisfies CodeCutPayload,
    headHeightPx: head * metrics.lineHeightPx + Math.max(0, metrics.chromePx),
    tailHeightPx: (remainingLines - head) * metrics.lineHeightPx + Math.max(0, metrics.chromePx),
  };
}

/** Absolute index (inside the LOGICAL container) of the first child of
 * fragment `partIndex`. A fragment whose first child continues the previous
 * fragment's last child shares that child's index. */
function containerChildStart(block: LogicalBlock, partIndex: number): number {
  let start = 0;
  for (let i = 0; i < partIndex; i += 1) {
    start += block.parts[i].node.childCount;
    const next = block.parts[i + 1];
    if (next && childContinues(next.node)) start -= 1;
  }
  return start;
}

function childContinues(fragment: PmNode): boolean {
  const first = fragment.firstChild;
  return Boolean(first && (first.attrs?.[LIST_ITEM_SPLIT_CONTINUATION_ATTR] === true || first.attrs?.[SPLIT_CONTINUATION_ATTR] === true));
}

function containerPlanKey(block: LogicalBlock, partIndex: number, plan: ContainerSplitPlan): string {
  const base = containerChildStart(block, partIndex);
  switch (plan.kind) {
    case "listItemBoundary":
      return `items:${base + plan.headItemCount}`;
    case "listItemBlockBoundary":
      return `item:${base + plan.itemIndex}:blocks:${plan.headBlockCount}`;
    case "listItemText":
      return `item:${base + plan.itemIndex}:child:${plan.childIndex}:text:${plan.textOffset}`;
    case "listItemTable":
      return `item:${base + plan.itemIndex}:child:${plan.childIndex}:table:${plan.signature}`;
    case "listItemNested":
    case "blockquoteNested":
    case "calloutNested": {
      // Keyed by position, as identifiableSeamKey keys the seam it leaves.
      const part = block.parts[partIndex];
      const pair = part ? splitContainerNode(part.node, plan) : null;
      if (!pair) return `nested:${base + ("itemIndex" in plan ? plan.itemIndex : 0)}:${plan.childIndex}`;
      return containerDeepCutKey(
        [...block.parts.slice(0, partIndex).map((entry) => entry.node), pair.head],
        pair.tail,
      );
    }
    case "blockquoteBlockBoundary":
    case "calloutBlockBoundary":
      return `blocks:${base + plan.headBlockCount}`;
    case "blockquoteText":
    case "calloutText":
      return `child:${base + plan.childIndex}:text:${plan.textOffset}`;
  }
}

/** Walk the fragments of a multi-part atom: whole fragments that fit are
 * absorbed; the first fragment that does not fit is cut inside (relative to
 * that fragment, which the reconciler keeps as the opener) or, failing that,
 * at the seam before it. */
export { HEAD_PIECE_OVERRUN_PX };

function walkFragments(
  block: LogicalBlock,
  request: LedgerSplitRequest,
  inner: (part: LedgerPart, partIndex: number, availablePx: number, startPart: number) => LedgerCut | null,
  /** Whether a split row's rest ("atom:row") may be joined back whole when
   * the page has the room for it joined (rejoinedSplitRowCut); null never. */
  rejoinRow: SplitRowRejoins | null = null,
): LedgerCut | null {
  const startPart = chainedStartPart(block, request);
  if (startPart === null) return null;
  let remaining = request.availablePx;
  for (let partIndex = startPart; partIndex < block.parts.length; partIndex += 1) {
    const part = block.parts[partIndex];
    // The same page-bottom rule the planners use: a fragment fits when its
    // last line's text box fits; its Auto leading may cross the edge.
    // Parts absorbed onto one page render joined, so the spacing this part's
    // seam currently drops is painted again before it.
    const join = partIndex > startPart ? part.joinBeforePx : 0;
    // A continuation fragment joined onto this page paints no repeated
    // header clones: they belong to a fresh page only.
    const joinedHeightPx = part.heightPx - (partIndex > startPart ? part.repeatedHeaderPx : 0);
    if (join + joinedHeightPx - part.creditPx <= remaining + 1e-6) {
      // A row cut whose head cell row has room for its tail's first word
      // since (markStaleSeams): the head is cut again above that row, which
      // joins it to the tail; the next plan takes back the lines that fit.
      const keepPx = block.kind === "table" ? block.staleRowKeepPx?.get(partIndex + 1) : undefined;
      if (keepPx !== undefined && block.parts[partIndex + 1]?.sheet !== part.sheet) {
        const room = Math.min(remaining - (partIndex > startPart ? Math.max(0, join) : 0), keepPx);
        const recut = room > 0 ? inner(part, partIndex, room, startPart) : null;
        const plan = (recut?.payload as TableCutPayload | undefined)?.planned?.plan;
        traceOracle({ atom: block.index, kind: "stale-row-recut", partIndex, keepPx: Math.round(keepPx * 10) / 10, roomPx: Math.round(room * 10) / 10, result: recut?.key ?? null });
        if (recut && plan?.kind === "withinRow" && recut.key !== existingSeamKey(block, partIndex)) return recut;
      }
      remaining -= join + joinedHeightPx;
      continue;
    }
    // A split row's join gives back its tail's floor only when the tail fits
    // whole; cut, its lines stand where they are drawn.
    const seamBefore = partIndex > startPart ? existingSeamKey(block, partIndex - 1) ?? "" : "";
    const splitRow = /^table:row:(\d+):within/.exec(seamBefore);
    if (rejoinRow && block.kind === "table" && partIndex > startPart &&
        (join < 0 || splitRow) && rejoinRow.may(`${block.index}:${splitRow?.[1] ?? "?"}`)) {
      // Joined, the row is its lines once (splitRowWholeJoinPx).
      const giveBack = Math.min(join, splitRowWholeJoinPx(block.parts[partIndex - 1], part));
      const rejoined = rejoinedSplitRowCut(part, remaining - giveBack, giveBack, (room) => inner(part, partIndex, room, startPart));
      traceOracle({ atom: block.index, kind: "rejoin", join: Math.round(giveBack * 10) / 10, roomPx: Math.round((remaining - giveBack) * 10) / 10, result: rejoined?.key ?? null });
      if (rejoined) {
        rejoinRow.joined(`${block.index}:${splitRow?.[1] ?? "?"}`);
        return rejoined;
      }
    }
    remaining -= block.kind === "table" ? Math.max(0, join) : join;
    // What is left under a row's head piece is no room for more of the row:
    // cut there the head paints taller than the plan by its own stand-ins,
    // the next plan takes the cut back, and the two alternate (corpus
    // R283-D10: page 6's cut of its one 19,000 px row, for the rest of the
    // passes, the row's later pages never reached).
    const rowSeamBefore = block.kind === "table" && partIndex > startPart && remaining <= HEAD_PIECE_OVERRUN_PX &&
      (existingSeamKey(block, partIndex - 1) ?? "").includes(":within");
    if (remaining <= 0 || rowSeamBefore) {
      const result = partIndex > startPart ? boundaryCut(block, partIndex, startPart) : null;
      traceOracle({ atom: block.index, kind: block.kind, parts: block.parts.map((p) => Math.round(p.heightPx * 10) / 10), availablePx: Math.round(request.availablePx * 10) / 10, failedPart: partIndex, remaining: Math.round(remaining * 10) / 10, inner: null, result: result?.key ?? null });
      return result;
    }
    const overrunPx = part.heightPx - remaining;
    const headOfMore = block.kind === "table" && partIndex === startPart && partIndex + 1 < block.parts.length;
    // A head piece painted taller than the space it was cut for (the cut's
    // own stand-ins are not in the plan: corpus R283-D10, 876 px for 845) is
    // cut again by the same overrun further up.
    const cut =
      inner(part, partIndex, remaining, startPart) ??
      (headOfMore && overrunPx > 0 && remaining - overrunPx > 0
        ? inner(part, partIndex, remaining - overrunPx, startPart)
        : null);
    // The piece opening an empty page that cannot be cut again keeps the
    // seam it already ends at: answering no cut stood every later piece of
    // the atom on this page with it. A tall row's head piece painted 1.4 px
    // past the page it was cut for found no cut of its own, was merged
    // with the rest of the row (2308 px on a 590 px page), cut again and
    // drawn 1.4 px over again, and the plan alternated (corpus R91-D08).
    // So does a head that stands below other blocks and overruns its page
    // by little. Answering no cut moved the table to the next page, where
    // the head fitted and was pulled back again: R283-D10 alternated the two
    // for 711 passes with its 26 pages on one sheet.
    const result =
      cut ??
      (partIndex > startPart
        ? boundaryCut(block, partIndex, startPart)
        : request.pageEmpty || (headOfMore && overrunPx <= HEAD_PIECE_OVERRUN_PX)
          ? boundaryCut(block, partIndex + 1, startPart)
          : null);
    traceOracle({ atom: block.index, kind: block.kind, parts: block.parts.map((p) => Math.round(p.heightPx * 10) / 10), availablePx: Math.round(request.availablePx * 10) / 10, failedPart: partIndex, remaining: Math.round(remaining * 10) / 10, inner: cut?.key ?? null, result: result?.key ?? null });
    return result;
  }
  traceOracle({ atom: block.index, kind: block.kind, parts: block.parts.map((p) => Math.round(p.heightPx * 10) / 10), availablePx: Math.round(request.availablePx * 10) / 10, failedPart: -1, remaining: Math.round(remaining * 10) / 10, inner: null, result: null });
  return null;
}

/**
 * A table cut within a row whose rest, joined back, now fits the page: the cut
 * the tail plans in the room left (with a split row's overstated floor given
 * back, splitRowFloorJoinPx), when it falls past the rest of the row (the row
 * whole on this page). Without it the walk stopped at the seam whenever little
 * room was left under the head piece (HEAD_PIECE_OVERRUN_PX), and a cut made
 * once from a page with less room never came back (R291-D02 under
 * `__docsFootnoteProgressive`: page 88's table cut in its fifth row from a
 * list block read 17 px too tall on a provisional sheet; read right, 45.1 px
 * were left for the row's 44.6 px rest; laid out whole, and in Word, the cut
 * falls between rows). Null otherwise.
 */
function rejoinedSplitRowCut(part: LedgerPart, roomPx: number, joinPx: number, plan: (roomPx: number) => LedgerCut | null): LedgerCut | null {
  if (!(roomPx > 0)) return null;
  const cut = plan(roomPx);
  const planned = (cut?.payload as TableCutPayload | undefined)?.planned?.plan;
  if (!cut || !planned) return null;
  const rest = firstBodyRow(part.node);
  const past = planned.kind === "betweenRows" ? planned.cutBeforeRow > rest : planned.kind === "withinRow" && planned.rowIndex > rest;
  if (!past) return null;
  return { ...cut, headHeightPx: cut.headHeightPx + joinPx };
}

/** Harness-only oracle trace (`window.__pageLedgerOracle` pre-created). */
function oracleTraceEnabled(): boolean {
  const win = (typeof window === "undefined" ? null : window) as (Window & { __pageLedgerOracle?: unknown[] }) | null;
  return Boolean(win && Array.isArray(win.__pageLedgerOracle));
}

function traceOracle(entry: Record<string, unknown>): void {
  const win = (typeof window === "undefined" ? null : window) as (Window & { __pageLedgerOracle?: unknown[] }) | null;
  if (win && Array.isArray(win.__pageLedgerOracle)) win.__pageLedgerOracle.push(entry);
}

/** The document's Word layout rules a table cut follows. No stated mode is
 * no Word document: its rows are cut. */
function wordTableRowOptions(view: EditorView): { overPageCantSplitStands: boolean; cellWidowControl: boolean } {
  const mode = normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode);
  return { overPageCantSplitStands: mode !== null && mode < 15, cellWidowControl: mode !== null && mode >= 15 };
}

/** Where a cut between whole children of a list or container falls in its
 * fragment: the top of the first child its rest starts with, from the
 * fragment's top (px). Null for a cut inside a child (its rest starts within
 * a line the head does not end at; not chained). */
function containerCutTopPx(dom: HTMLElement, plan: ContainerSplitPlan): number | null {
  const count = plan.kind === "listItemBoundary"
    ? plan.headItemCount
    : plan.kind === "blockquoteBlockBoundary" || plan.kind === "calloutBlockBoundary"
      ? plan.headBlockCount
      : null;
  if (count === null) return null;
  const children = Array.from(dom.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const first = children[count];
  if (!first) return null;
  const scale = paginationLayoutScale(dom);
  const top = paginationLayoutRect(first, scale).top - paginationLayoutRect(dom, scale).top;
  return Number.isFinite(top) && top > 0 ? top : null;
}

function withCutTop(topPx: number | null): { partOffsetPx?: number } {
  return topPx !== null ? { partOffsetPx: topPx } : {};
}

/** `window.__dqc2ContainerChainOff = true` (A/B): a list or container cut
 * inside a fragment is not cut again below that cut in the same plan. */
function containerChainOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __dqc2ContainerChainOff?: boolean }).__dqc2ContainerChainOff === true;
}

/** The whole children a cut between whole children leaves in its head
 * (counted from its fragment's start); null for any other cut. */
function boundaryChildCount(plan: ContainerSplitPlan): number | null {
  return plan.kind === "listItemBoundary"
    ? plan.headItemCount
    : plan.kind === "blockquoteBlockBoundary" || plan.kind === "calloutBlockBoundary"
      ? plan.headBlockCount
      : null;
}

/** `window.__dqc2ContainerRebaseOff = true` (A/B): a chained head's plan is
 * applied as counted from its fragment's start, as before. */
function containerChainRebaseOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __dqc2ContainerRebaseOff?: boolean }).__dqc2ContainerRebaseOff === true;
}

/**
 * The plan of a container cut, for the fragment it is applied to. A head
 * planned below an earlier cut of the same fragment counts its children from
 * that fragment's start; when the earlier cut was a page cut of the same
 * transaction, the fragment it is applied to is that cut's rest, and the
 * count is the rest's. Applied as counted, the head of a list cut over three
 * pages was the whole rest, the cut refused, and the second page held the
 * rest of the list over its foot until the next pass (a column cut is drawn
 * by the projection, not here: its rest is the same fragment, as counted).
 */
export function rebasedContainerPlan(payload: ContainerCutPayload, opener: PmNode): ContainerSplitPlan | null {
  const plan = payload.plan;
  const after = payload.chainedAfter, total = payload.partChildCount;
  if (!Number.isInteger(after) || !Number.isInteger(total) || after! <= 0) return plan;
  if (opener.childCount === total) return plan;
  if (opener.childCount !== total! - after!) return null;
  if (plan.kind === "listItemBoundary") {
    const count = plan.headItemCount - after!;
    return count > 0 ? { ...plan, headItemCount: count } : null;
  }
  if (plan.kind === "blockquoteBlockBoundary" || plan.kind === "calloutBlockBoundary") {
    const count = plan.headBlockCount - after!;
    return count > 0 ? { ...plan, headBlockCount: count } : null;
  }
  return plan;
}

/**
 * The next head of a list or container whose fragment was cut by this plan
 * (a column cut, then the page's): planned in the same fragment, below the
 * cut it starts at. Chained cuts were planned only from a seam that stands,
 * so a list cut at the foot of a page's first column could not be cut again
 * at the page's foot: the rest was placed whole, over the foot, and the
 * verifier cut it where the drawn page put it -- the plan put it back on
 * every pass and every key (R482-D01 p10: the references list, 2,388 px).
 * Null when `from` is not such a cut (the seam walk applies) or none fits.
 */
export function planContainerHeadInPart(view: EditorView, block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null | undefined {
  const from = request.from;
  if (!from || from.kind !== "container" || containerChainOff()) return undefined;
  const payload = from.payload as Partial<ContainerCutPayload> & { boundary?: unknown };
  if (payload.boundary === true || !Number.isInteger(payload.partIndex) || typeof payload.partOffsetPx !== "number") return undefined;
  const partIndex = payload.partIndex as number;
  const part = block.parts[partIndex];
  if (!part || part.hollow) return null;
  const offsetPx = payload.partOffsetPx;
  const restPx = part.heightPx - offsetPx;
  if (restPx <= request.availablePx + 1e-6) {
    // The rest of this fragment fits: the head goes on past its seam.
    if (partIndex + 1 >= block.parts.length) return null;
    const seamKey = existingSeamKey(block, partIndex);
    if (seamKey === null) return null;
    const atSeam: LedgerCut = {
      kind: block.kind,
      key: seamKey,
      payload: { partIndex, boundary: true },
      headHeightPx: restPx,
      tailHeightPx: partHeightsAfter(block, partIndex),
    };
    const beyond = planContainerHeadCut(view, block, { ...request, from: atSeam, availablePx: request.availablePx - restPx });
    return beyond ? { ...beyond, headHeightPx: beyond.headHeightPx + restPx } : atSeam;
  }
  const atPx = offsetPx + request.availablePx;
  const plan = planContainerHead(part.dom, part.node, atPx, {
    containerPos: part.pos,
    freshPage: false,
    splitTable: (dom, table, tableAvailablePx) => {
      const planned = planRenderedTableFragment(dom, table, tableAvailablePx, request.fullCapacityPx, 0, wordTableRowOptions(view));
      return planned ? tableFragmentPair(view.state.doc, table, planned.plan, planned.cuts) : null;
    },
    posAtDOM: (node, offset) => {
      try {
        return view.posAtDOM(node, offset);
      } catch {
        return null;
      }
    },
  });
  if (!plan) return null;
  const key = `container:${containerPlanKey(block, partIndex, plan)}`;
  // No room for one more legal piece below the cut it starts at.
  if (key === from.key) return null;
  const topPx = containerCutTopPx(part.dom, plan);
  const before = payload.plan ? boundaryChildCount(payload.plan) : null;
  const chained = before !== null && before > 0 && boundaryChildCount(plan) !== null && !containerChainRebaseOff()
    ? { chainedAfter: before, partChildCount: part.node.childCount }
    : {};
  return {
    kind: "container",
    key,
    payload: { plan, partIndex, ...(topPx !== null && topPx > offsetPx ? { partOffsetPx: topPx } : {}), ...chained } satisfies ContainerCutPayload,
    headHeightPx: request.availablePx,
    tailHeightPx: Math.max(0, part.heightPx - atPx) + partHeightsAfter(block, partIndex),
  };
}

function planContainerHeadCut(view: EditorView, block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  const inPart = planContainerHeadInPart(view, block, request);
  if (inPart !== undefined) return inPart;
  return walkFragments(block, request, (part, partIndex, availablePx, startPart) => {
  const plan = planContainerHead(part.dom, part.node, availablePx, {
    containerPos: part.pos,
    freshPage: request.pageEmpty === true && partIndex === startPart,
    // A table in a list item flows its rows over pages as a top-level one does.
    splitTable: (dom, table, tableAvailablePx) => {
      const planned = planRenderedTableFragment(dom, table, tableAvailablePx, request.fullCapacityPx, 0, { ...wordTableRowOptions(view), keepWithNextReleased: request.keepReleased === true });
      return planned ? tableFragmentPair(view.state.doc, table, planned.plan, planned.cuts) : null;
    },
    posAtDOM: (node, offset) => {
      try {
        return view.posAtDOM(node, offset);
      } catch {
        return null;
      }
    },
  });
  if (!plan) return null;
  return {
    kind: "container",
    key: `container:${containerPlanKey(block, partIndex, plan)}`,
    payload: { plan, partIndex, ...withCutTop(containerCutTopPx(part.dom, plan)) } satisfies ContainerCutPayload,
    headHeightPx: partHeightsBetween(block, startPart, partIndex) + availablePx,
    tailHeightPx: Math.max(0, part.heightPx - availablePx) + partHeightsAfter(block, partIndex),
  };
  });
}

/** Height of parts `partIndex+1..` rendered joined on one page. */
function partHeightsAfter(block: LogicalBlock, partIndex: number): number {
  let sum = 0;
  for (let i = partIndex + 1; i < block.parts.length; i += 1) sum += block.parts[i].heightPx + (i > partIndex + 1 ? block.parts[i].joinBeforePx : 0);
  return sum;
}

/** Each fragment's rows, read once for all the cuts one plan makes in it. */
const fragmentRowsForPlan = new WeakMap<LedgerPart, RenderedTableRows | null>();

/** A one-row table holding `row` of `table`: enough to cut that row and name
 * the cut (headRowSignature reads the head's last row), with no copy of the
 * rows around it. */
function oneRowTable(table: PmNode, row: PmNode): TableJsonNode {
  return { type: table.type.name, attrs: { ...table.attrs }, content: [row.toJSON() as TableJsonNode] };
}

/** The cut of a one-row table, what is left of the row, and the key's signature;
 * null when the cut moves nothing to one side of the page. */
function cutOneRow(piece: TableJsonNode, cuts: ReadonlyArray<TableCellTextCut>): { signature: string; rest: TableJsonNode } | null {
  try {
    const pair = fragmentTableWithinRow(piece, 0, cuts, "signature");
    return pair ? { signature: headRowSignature(pair.head), rest: { ...piece, content: pair.tail.content?.slice(-1) } } : null;
  } catch {
    return null;
  }
}

/** The rest of the row a plan cut through, from the cut as planned. */
function restOfPlannedRowCut(
  part: LedgerPart,
  rowIndex: number,
  planned: PlannedTableCut,
  ordinal: number,
): TableTailState["rest"] | null {
  const row = part.node.maybeChild(rowIndex);
  if (!row || !planned.tails?.length) return null;
  const cut = cutOneRow(oneRowTable(part.node, row), planned.cuts);
  if (!cut) return null;
  return { px: Math.max(0, ...planned.tails.map((cell) => cell.heightPx)), tails: planned.tails, piece: cut.rest, ordinal };
}

type PlannedTableCut = NonNullable<ReturnType<typeof planRenderedTableFragment>>;

/** A page opening in the tail a cut of this plan left: the plan goes on from
 * the rows of the fragment it cut (planRenderedTableTail). */
function planTableTailCut(view: EditorView, block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  const from = request.from?.payload as Partial<TableCutPayload> | null | undefined;
  const cut = from?.planned?.plan;
  if (!from || !cut || (cut.kind !== "betweenRows" && cut.kind !== "withinRow") || !Number.isInteger(from.partIndex)) return null;
  const partIndex = from.partIndex as number;
  const part = block.parts[partIndex];
  if (!part || engineTableParts.has(part)) return null;
  let rows = fragmentRowsForPlan.get(part);
  if (rows === undefined) {
    rows = renderedTableRowsForPlan(part.dom, part.node);
    fragmentRowsForPlan.set(part, rows);
  }
  if (!rows) return null;
  const headerRows = from.tail?.headerRows ?? cut.repeatHeaderRows;
  // A page cut through a row leaves the rest of that row to open the next one.
  const cutRow = cut.kind === "withinRow" && !from.tail ? rows.measurements[cut.rowIndex] : undefined;
  if (cut.kind === "withinRow" && !from.tail && !cutRow) return null;
  const source = (index: number): number => {
    const value = part.node.maybeChild(index)?.attrs?.[TABLE_SOURCE_ROW_ATTR];
    return Number.isInteger(value) ? (value as number) : index;
  };
  const ordinalOf = (row: number) => (partIndex > 0 ? withinRowSeamsThrough(block, partIndex - 1, row) : 0) + 1;
  const firstRest = cut.kind === "withinRow" && !from.tail && from.planned
    ? restOfPlannedRowCut(part, cut.rowIndex, from.planned, ordinalOf(source(cut.rowIndex)))
    : null;
  const rest = from.tail ? from.tail.rest : firstRest ?? undefined;
  const tailRow = from.tail?.row ?? (cut.kind === "withinRow" ? cut.rowIndex + 1 : cut.cutBeforeRow);
  const restPx = rest?.px ?? (cutRow && cut.kind === "withinRow" ? cutRow.heightPx - cut.headAvailablePx : undefined);
  const options = wordTableRowOptions(view);
  const planned = planRenderedTableTail(rows, tailRow, headerRows, request.availablePx, request.fullCapacityPx, {
    ...options,
    ...(restPx !== undefined ? { restOfCutRowPx: restPx } : {}),
    ...(rest ? { restTails: rest.tails } : {}),
  });
  if (!planned) return planTableAfterTail(view, block, request, partIndex, rows, tailRow, headerRows, restPx ?? 0);
  if (planned.cutThrough) {
    const { row, ofRest } = planned.cutThrough;
    const sourceRow = source(row);
    const ordinal = ofRest && rest ? rest.ordinal + 1 : ordinalOf(sourceRow);
    const piece = ofRest && rest ? rest.piece : part.node.maybeChild(row) ? oneRowTable(part.node, part.node.child(row)) : null;
    const pieceCut = piece ? cutOneRow(piece, planned.planned.cuts) : null;
    if (!pieceCut || !planned.planned.tails) return null;
    return {
      kind: "table",
      key: `table:${withinRowCutKey(sourceRow, ordinal)}${pieceCut.signature}`,
      payload: {
        planned: planned.planned,
        partIndex,
        tail: {
          row: planned.row,
          headerRows,
          rest: { px: Math.max(0, ...planned.planned.tails.map((cell) => cell.heightPx)), tails: planned.planned.tails, piece: pieceCut.rest, ordinal },
        },
      } satisfies TableCutPayload,
      headHeightPx: request.availablePx,
      tailHeightPx: planned.tailPx + partHeightsAfter(block, partIndex),
    };
  }
  return {
    kind: "table",
    key: `table:rows:${source(planned.row)}`,
    payload: {
      planned: planned.planned,
      partIndex,
      tail: { row: planned.row, headerRows },
    } satisfies TableCutPayload,
    headHeightPx: request.availablePx,
    tailHeightPx: planned.tailPx + partHeightsAfter(block, partIndex),
  };
}

/**
 * The tail of a fragment fits this page and more of the table stands in the
 * fragments after it: the page goes on into them. Answered with no cut, the rest
 * of the table stood on this page whole and every seam after it was joined, so
 * one line planned differently on one page undid all the pages after it (R329-D02:
 * 19 seams joined, 19 cut again, for each page in turn).
 */
function planTableAfterTail(
  view: EditorView,
  block: LogicalBlock,
  request: LedgerSplitRequest,
  partIndex: number,
  rows: RenderedTableRows,
  tailRow: number,
  headerRows: readonly number[],
  restPx: number,
): LedgerCut | null {
  const next = block.parts[partIndex + 1];
  if (!next) return null;
  let tailPx = rows.chromePx + restPx;
  for (const index of headerRows) tailPx += rows.measurements[index]?.heightPx ?? 0;
  for (let index = tailRow; index < rows.measurements.length; index += 1) tailPx += rows.measurements[index]!.heightPx;
  const room = request.availablePx - tailPx;
  if (room < 0) return null;
  const seam = boundaryCut(block, partIndex + 1, partIndex);
  const seamCut = seam ? { ...seam, headHeightPx: tailPx } : null;
  const inNext = room - next.joinBeforePx + next.repeatedHeaderPx;
  if (inNext <= 0) return seamCut;
  const cut = planTableHeadCut(view, block, {
    ...request,
    availablePx: inNext,
    pageEmpty: false,
    from: seam,
  });
  return cut ? { ...cut, headHeightPx: cut.headHeightPx + tailPx + next.joinBeforePx - next.repeatedHeaderPx } : seamCut;
}

/**
 * Cuts within a row the plan and the painted page disagree on for as long as
 * nothing is edited: laid out, the row's head paints taller than the room it was
 * planned for and the plan takes it back to the row's start; there, the room
 * reads enough again. Holding the pages as they stood stopped the alternation
 * but each pass planned the page again, so the pages cut after it were thrown
 * away (corpus R282-D26: a 21,800 px sheet of a 45-row table, 4 pages for Word's
 * 25). A refused cut stays at the row's start and the plan goes on from there.
 */
const refusedRowCuts = new WeakMap<EditorView, { stillCurrent: () => boolean; keys: Set<string> }>();

/** "2+table:row:4:within@1ymf5ee": the atom and the cut, no tail signature. */
const refusedCutKey = (opening: string): string => opening.split("@", 1)[0];

/** Refuse the cut `opening` until `stillCurrent` no longer holds (an author's
 * edit); whether it was not refused already. */
export function refuseTableRowCut(view: EditorView, opening: string, stillCurrent: () => boolean): boolean {
  const key = refusedCutKey(opening);
  const held = refusedRowCuts.get(view);
  if (!held?.stillCurrent()) {
    refusedRowCuts.set(view, { stillCurrent, keys: new Set([key]) });
    return true;
  }
  if (held.keys.has(key)) return false;
  held.keys.add(key);
  return true;
}

function tableRowCutRefused(view: EditorView, atomIndex: number, key: string): boolean {
  return ledgerCutRefused(view, `${atomIndex}+table:${key}`);
}

function ledgerCutRefused(view: EditorView, opening: string): boolean {
  const held = refusedRowCuts.get(view);
  if (!held) return false;
  if (!held.stillCurrent()) {
    refusedRowCuts.delete(view);
    return false;
  }
  return held.keys.has(refusedCutKey(opening));
}

function planTableHeadCut(view: EditorView, block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  if (request.from && chainedStartPart(block, request) === null) return planTableTailCut(view, block, request);
  if (splitRowFloorMovesTable(block, request)) return null;
  const rejoinRows = notesRejoinSplitRows(view) ? splitRowRejoins(view) : null;
  const recutWhole = notesRecutSplitRowsWhole(view);
  return walkFragments(block, request, (part, partIndex, availablePx, startPart) => {
  // A continuation fragment's repeated header clones are its first rows, and
  // the row planner charges them before any body row. Joined onto this page
  // they are not painted (the head already carries the table's header), so
  // the planner is given their height back; the head keeps the real space.
  const joinedHeaderPx = partIndex > startPart ? part.repeatedHeaderPx : 0;
  const engineRows = engineTableParts.has(part) ? unlaidEngineTableRows(part.node) : null;
  const plannedAsDrawn = engineRows
    ? planEngineTableFragment(part.node, engineRows.rowHeightsPx, engineRows.chromePx, availablePx + joinedHeaderPx, request.fullCapacityPx, { ...wordTableRowOptions(view), keepWithNextReleased: request.keepReleased === true })
    : planRenderedTableFragment(part.dom, part.node, availablePx + joinedHeaderPx, request.fullCapacityPx, 0, { ...wordTableRowOptions(view), keepWithNextReleased: request.keepReleased === true });
  if (!plannedAsDrawn) return null;
  const planned = recutWhole && partIndex === startPart ? splitRowRecutFromWhole(view, block, partIndex, part.node, plannedAsDrawn) : plannedAsDrawn;
  if (!planned) return null;
  const plan = planned.plan;
  const table = part.dom.tagName === "TABLE" ? part.dom : part.dom.querySelector("table");
  const repeatedPx = plan.repeatHeaderRows.reduce((sum, index) => {
    if (engineRows) return sum + (engineRows.rowHeightsPx[index] ?? 0);
    const tr = table instanceof HTMLTableElement ? table.rows[index] : null;
    return sum + (tr ? tr.getBoundingClientRect().height / paginationLayoutScale(part.dom).y : 0);
  }, 0);
  const sourceRow = (index: number): number => {
    const row = part.node.maybeChild(index);
    const source = row?.attrs?.[TABLE_SOURCE_ROW_ATTR];
    return Number.isInteger(source) ? (source as number) : index;
  };
  const key =
    plan.kind === "betweenRows"
      ? `rows:${sourceRow(plan.cutBeforeRow)}`
      : plan.kind === "withinRow"
        ? `${tableWithinRowCutKey(block, partIndex, sourceRow(plan.rowIndex)).slice("table:".length)}${plannedTailSignature(part.node, plan.rowIndex, planned.cuts, plan.repeatHeaderRows)}`
        : `move:${sourceRow(plan.rowIndex)}`;
  if (plan.kind === "withinRow" && partIndex > startPart && tableRowCutRefused(view, block.index, key)) {
    return boundaryCut(block, partIndex, startPart);
  }
  // A row cut the piece already ends at (its head is the piece as it stands)
  // is that seam: given as a planned cut, the page after it was asked for a
  // cut chained to it, which no table cut answers, and the rest of the row
  // stood whole on one sheet (corpus R03-D23: a 10,636 px piece).
  if (plan.kind === "withinRow" && existingSeamKey(block, partIndex) === `table:${key}`) {
    return boundaryCut(block, partIndex + 1, startPart);
  }
  // The tail as the head leaves it: the head is charged all the room left
  // (nothing else goes on its page), but it keeps only its rows. Charged
  // with that room too, the tail came out short by the head's slack and the
  // table's own frame, which both pieces draw (R286-D01: +8.3 px a split
  // table, the next page's cut moved back a line on the next pass, 21 of
  
  // laid out the same pages in 22 plans instead of 30, 223 s instead of 336.
  const leftTail = Math.max(0, part.heightPx - joinedHeaderPx - availablePx);
  const rowsTail = planned.headRowsPx !== undefined
    ? Math.max(0, part.heightPx - planned.headRowsPx - (plan.kind === "withinRow" ? plan.headAvailablePx : 0))
    : 0;
  return {
    kind: "table",
    key: `table:${key}`,
    payload: { planned, partIndex } satisfies TableCutPayload,
    headHeightPx: partHeightsBetween(block, startPart, partIndex) + availablePx,
    tailHeightPx: Math.max(leftTail, rowsTail) + repeatedPx + partHeightsAfter(block, partIndex),
  };
  }, rejoinRows);
}

/**
 * A head piece that ends inside row R (a cut within it standing), planned
 * again with less room, cut within row R once more: the cut is made before row
 * R instead, and the next plan cuts the row from its whole drawing. Read from
 * the head piece, the row's lines are the piece's (its paragraphs end at the
 * seam), and the same room cut the row where the whole row is not cut
 * (R286-D01 under `__docsFootnoteProgressive`: 142 px for table 1170, row 3
 * cut one line in from the piece a window left, kept between rows by the
 * whole layout). A row R opening the fragment (no row before it) is cut as
 * drawn.
 */
type PlannedTableFragmentLike = NonNullable<ReturnType<typeof planRenderedTableFragment>>;

function splitRowRecutFromWhole(view: EditorView, block: LogicalBlock, partIndex: number, node: PmNode, planned: PlannedTableFragmentLike): PlannedTableFragmentLike {
  const plan = planned.plan;
  if (plan.kind !== "withinRow") return planned;
  const seam = existingSeamKey(block, partIndex) ?? "";
  const standing = /^table:row:(\d+):within/.exec(seam);
  const source = node.maybeChild(plan.rowIndex)?.attrs?.[TABLE_SOURCE_ROW_ATTR];
  const row = Number.isInteger(source) ? (source as number) : plan.rowIndex;
  if (!standing || Number(standing[1]) !== row) return planned;
  if (plan.rowIndex <= firstBodyRow(node)) return planned;
  if (!recutRowOnce(view, `${block.index}:${row}`)) return planned;
  return {
    plan: { kind: "betweenRows", cutBeforeRow: plan.rowIndex, repeatHeaderRows: plan.repeatHeaderRows },
    cuts: [],
    headRowsPx: planned.headRowsPx,
  };
}

/**
 * Rows a head piece was cut before once (splitRowRecutFromWhole), until an
 * author's edit. Cut from the whole row, a row's head can paint a little
 * taller than its plan (its own stand-ins), and planned again it is cut
 * within the same row: recut each time, the row went back and forth between
 * its pages and the pages after it with it (R286-D01 under
 * `__docsFootnoteProgressive`: pages 37-50 alternated for six passes, and a
 * cut made in one of them stood). The second time it is cut as drawn.
 */
const recutRows = new WeakMap<EditorView, { stillCurrent: () => boolean; keys: Set<string>; pass: number }>();

/** Each ledger pass opens (or goes on with) the recut and rejoin record of
 * its edit, and counts itself. */
export function holdRecutRows(view: EditorView, stillCurrent: () => boolean): void {
  const held = recutRows.get(view);
  if (!held?.stillCurrent()) recutRows.set(view, { stillCurrent, keys: new Set(), pass: 0 });
  else held.pass += 1;
}

/** Whether row `key` ("atom:row") may be recut now (its first time this
 * edit); `window.__docsNotesRecutOnce = false` recuts every time. */
function recutRowOnce(view: EditorView, key: string): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesRecutOnce?: boolean }) | null;
  if (win?.__docsNotesRecutOnce === false) return true;
  const held = recutRows.get(view);
  if (!held || !held.stillCurrent()) return true;
  if (held.keys.has(key)) return false;
  held.keys.add(key);
  return true;
}

/**
 * Split rows joined back (rejoinedSplitRowCut), until an author's edit. The
 * room a join is judged by is read from the two pieces, the row cut again
 * from its whole drawing: where the two disagree the row went back and forth
 * (2a6f8d2e under `__docsFootnoteProgressive`: table 531's row 1 joined, cut
 * again at the same seam, joined, five times, the pages after it with it). A
 * row joined once and found cut again after a pass that did not find it cut
 * (it stood whole) stays cut, as the whole layout cuts it.
 * `window.__docsNotesRejoinOnce = false` joins it every time.
 */
interface SplitRowRejoins {
  may(row: string): boolean;
  joined(row: string): void;
}

const rejoinedRows = new WeakMap<EditorView, { stillCurrent: () => boolean; rows: Map<string, { joined: boolean; seenPass: number }> }>();

function splitRowRejoins(view: EditorView): SplitRowRejoins {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesRejoinOnce?: boolean }) | null;
  const once = win?.__docsNotesRejoinOnce !== false;
  const record = () => {
    const held = recutRows.get(view);
    if (!once || !held || !held.stillCurrent()) return null;
    let entry = rejoinedRows.get(view);
    if (!entry || !entry.stillCurrent()) {
      entry = { stillCurrent: held.stillCurrent, rows: new Map() };
      rejoinedRows.set(view, entry);
    }
    return { rows: entry.rows, pass: held.pass };
  };
  return {
    may(row) {
      const known = record();
      if (!known) return true;
      const seen = known.rows.get(row);
      if (seen?.joined && known.pass - seen.seenPass > 1) return false;
      known.rows.set(row, { joined: seen?.joined ?? false, seenPass: known.pass });
      return true;
    },
    joined(row) {
      const known = record();
      if (known) known.rows.set(row, { joined: true, seenPass: known.pass });
    },
  };
}

/** `window.__docsNotesRecutWhole = true` (trial, off): a split row's head
 * piece planned again is cut before the row (splitRowRecutFromWhole), for a
 * document with footnotes laid out a window at a time. Off because each
 * recut lays the pages after it out once with the row whole on the next
 * page, and a within-row cut made in that pass stood (R286-D01: pages 44-52
 * differ from the whole layout with it, only 103-104 without). */
function notesRecutSplitRowsWhole(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesRecutWhole?: boolean }) | null;
  if (win?.__docsNotesRecutWhole !== true) return false;
  return sheetedDocHasFootnoteRefs(view.state.doc) && footnotesAllowProgressiveLayout(view.state.doc, win);
}

/**
 * A document with footnotes laid out a window at a time
 * (`__docsFootnoteProgressive`) joins a split row back when its page has the
 * room for it joined (rejoinedSplitRowCut): its windows plan a page from cuts
 * an earlier window made with other room, which a document laid out whole
 * plans again. `window.__docsNotesRejoinRows = false` keeps the split as before.
 */
function notesRejoinSplitRows(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesRejoinRows?: boolean }) | null;
  if (win?.__docsNotesRejoinRows === false) return false;
  return sheetedDocHasFootnoteRefs(view.state.doc) && footnotesAllowProgressiveLayout(view.state.doc, win);
}

/** The first row of table fragment `table` from row `from` on that starts a
 * new page (`pageBreakBefore`: Word's `w:pageBreakBefore` on its first
 * cell's first paragraph), skipping repeated header clones and the
 * continuation of a split row; null when none does. */
function tableRowStartingPage(table: PmNode, from: number): number | null {
  for (let index = Math.max(0, from); index < table.childCount; index += 1) {
    const attrs = table.child(index).attrs;
    if (attrs?.[TABLE_REPEATED_HEADER_ATTR] === true || attrs?.[TABLE_ROW_CONTINUATION_ATTR] === true) continue;
    if (attrs?.pageBreakBefore === true) return index;
  }
  return null;
}

/** The first body row of table fragment `table` (past its repeated header
 * clones). */
function firstBodyRow(table: PmNode): number {
  let index = 0;
  while (index < table.childCount && table.child(index).attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) index += 1;
  return index;
}

/**
 * Word starts a table row whose first paragraph has "page break before" on a
 * new page (Word 16.86, corpus R79-D05; the first row's is the break before
 * the table): the table ends the page above it. The head is the fragments
 * up to that row when they fit the room left, as the seam before a fragment
 * that opens with the row or as a cut between rows; otherwise none, and the
 * table is cut as usual and asked again on the next page.
 */
function planTableForcedHead(block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  const startPart = chainedStartPart(block, request);
  if (startPart === null) return null;
  let usedPx = 0;
  for (let partIndex = startPart; partIndex < block.parts.length; partIndex += 1) {
    const part = block.parts[partIndex];
    const join = partIndex > startPart ? part.joinBeforePx : 0;
    const body = firstBodyRow(part.node);
    if (partIndex > startPart && tableRowStartingPage(part.node, body) === body) {
      return usedPx <= request.availablePx + 1e-6 ? boundaryCut(block, partIndex, startPart) : null;
    }
    const row = tableRowStartingPage(part.node, body + 1);
    if (row !== null) {
      const table = part.dom.tagName === "TABLE" ? part.dom : part.dom.querySelector("table");
      const tr = table instanceof HTMLTableElement ? table.rows[row] : null;
      if (!tr || !(table instanceof HTMLTableElement) || table.rows.length !== part.node.childCount) return null;
      const scale = paginationLayoutScale(part.dom).y;
      const headPx = (tr.getBoundingClientRect().top - part.dom.getBoundingClientRect().top) / scale;
      if (!(headPx > 0) || usedPx + join + headPx > request.availablePx + 1e-6) return null;
      let headers = 0;
      while (headers < row && part.node.child(headers).attrs?.headerRow === true) headers += 1;
      const source = part.node.child(row).attrs?.[TABLE_SOURCE_ROW_ATTR];
      const planned = {
        plan: {
          kind: "betweenRows" as const,
          cutBeforeRow: row,
          repeatHeaderRows: Array.from({ length: row > headers ? headers : 0 }, (_, index) => index),
        },
        cuts: [],
      };
      const repeatedPx = planned.plan.repeatHeaderRows.reduce(
        (sum, index) => sum + table.rows[index].getBoundingClientRect().height / scale, 0);
      return {
        kind: "table",
        key: `table:rows:${Number.isInteger(source) ? (source as number) : row}`,
        payload: { planned, partIndex } satisfies TableCutPayload,
        headHeightPx: partHeightsBetween(block, startPart, partIndex) + join + headPx,
        tailHeightPx: Math.max(0, part.heightPx - headPx) + repeatedPx + partHeightsAfter(block, partIndex),
      };
    }
    usedPx += join + part.heightPx - (partIndex > startPart ? part.repeatedHeaderPx : 0);
  }
  return null;
}

/** Whether the table's repeating header row is exactly higher than a page.
 * Word 16.86 puts what follows such a table on a new page, however little
 * the table's last page holds (rows probes H1/H2/H4: 5 or 10 body rows on
 * the page after the header, the next paragraph on the page after that;
 * R82-D18 RW18). A header row that fits a page does not (H3). */
function overPageHeaderTable(block: LogicalBlock, columnPx: number): boolean {
  const first = block.parts[0]?.node.firstChild;
  if (!first || first.attrs?.headerRow !== true || first.attrs?.rowHeightRule !== "exact") return false;
  const declared = Number(first.attrs?.rowHeight);
  return columnPx > 0 && declared > columnPx + 0.5;
}

/** Whether the piece opening this request ends with the head of a split row
 * whose "At least" floor the space left at the row's top cannot hold, with
 * no row above it in the piece: the row moves whole, as it does unsplit
 * (planTablePageCut floorPx). Read piece by piece, the head fitted and the
 * seam an earlier plan left was kept (R82-D18 RW17). */
function splitRowFloorMovesTable(block: LogicalBlock, request: LedgerSplitRequest): boolean {
  if (request.availablePx >= request.fullCapacityPx - 1) return false;
  const startPart = chainedStartPart(block, request);
  if (startPart === null || startPart + 1 >= block.parts.length) return false;
  const part = block.parts[startPart];
  if (part.node.childCount !== 1) return false;
  const row = part.node.firstChild;
  if (row?.attrs?.[TABLE_ROW_CONTINUES_ATTR] !== true || row.attrs?.rowHeightRule === "exact") return false;
  const declared = Number(row.attrs?.rowHeight);
  if (!(declared > 0)) return false;
  // Its height and its cells' margins, as the cut reads the row whole
  // (rowFloorPx; corpus R417-D03 page 35).
  const tr = (part.dom instanceof HTMLTableElement ? part.dom : part.dom.querySelector<HTMLTableElement>("table"))?.rows[0];
  const floor = tr ? rowFloorPx(tr, row, declared) : declared;
  return floor > request.availablePx + 0.5;
}

/** The tallest row of the table that cannot break where it stands (see
 * LedgerAtom.freshRowPx): its exact or "At least" height, or its tallest
 * kept cell paragraph. */
function tableFreshRowPx(block: LogicalBlock): number {
  let tallest = 0;
  for (const part of block.parts) {
    part.node.forEach((row) => {
      const declared = Number(row.attrs?.rowHeight);
      if (declared > 0) tallest = Math.max(tallest, declared);
    });
    const kept = part.dom.querySelectorAll<HTMLElement>(':is(p, h1, h2, h3, h4, h5, h6)[data-keep-lines="true"]');
    if (!kept.length) continue;
    const scale = paginationLayoutScale(part.dom).y;
    for (const paragraph of kept) tallest = Math.max(tallest, paragraph.getBoundingClientRect().height / scale);
  }
  return tallest;
}

function planNotesHeadCut(block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  if (request.from?.kind === "notes" && chainedStartPart(block, request) === null) return planNotesTailCut(block, request);
  return walkFragments(block, request, (part, partIndex, availablePx, startPart) => {
  const planned = planNoteHeadFrom(part.dom, availablePx);
  if (!planned) return null;
  return {
    kind: "notes",
    key: `notes:${planned.cursor.entry}:${planned.cursor.offset}`,
    payload: { cursor: planned.cursor, partIndex, topPx: planned.topPx } satisfies NotesCutPayload,
    headHeightPx: partHeightsBetween(block, startPart, partIndex) + availablePx,
    tailHeightPx: Math.max(0, part.heightPx - planned.topPx) + partHeightsAfter(block, partIndex),
  };
  });
}

/** The next page's cut of a note list this plan cut on the page before, read
 * from the fragment as it is laid out. When the fragment's rest fits, the page
 * goes on into the fragments after it. */
function planNotesTailCut(block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  const from = request.from?.payload as Partial<NotesCutPayload> | null | undefined;
  if (!from?.cursor || !Number.isInteger(from.partIndex) || from.topPx === undefined) return null;
  const partIndex = from.partIndex as number;
  const part = block.parts[partIndex];
  if (!part) return null;
  const restPx = Math.max(0, part.heightPx - from.topPx);
  if (restPx - part.creditPx > request.availablePx + 1e-6) {
    const planned = planNoteHeadFrom(part.dom, request.availablePx, { cursor: from.cursor, topPx: from.topPx });
    if (!planned) return null;
    return {
      kind: "notes",
      key: `notes:${planned.cursor.entry}:${planned.cursor.offset}`,
      payload: { cursor: planned.cursor, partIndex, topPx: planned.topPx } satisfies NotesCutPayload,
      headHeightPx: request.availablePx,
      tailHeightPx: Math.max(0, part.heightPx - planned.topPx) + partHeightsAfter(block, partIndex),
    };
  }
  const next = block.parts[partIndex + 1];
  if (!next) return null;
  const seam = boundaryCut(block, partIndex + 1, partIndex);
  const seamCut = seam ? { ...seam, headHeightPx: restPx } : null;
  const room = request.availablePx - restPx - next.joinBeforePx;
  if (room <= 0) return seamCut;
  const cut = planNotesHeadCut(block, { ...request, availablePx: room, pageEmpty: false, from: seam });
  return cut ? { ...cut, headHeightPx: cut.headHeightPx + restPx + next.joinBeforePx } : seamCut;
}

/**
 * A generated list (a table of contents, a table of figures) is cut between
 * two rows: the rows whose boxes end on the page stay, the next opens the
 * following page, as the entry paragraphs of Word's field result flow.
 */
function planRowsHeadCut(block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  // A page that opens inside a copy (this pass cut the list on the page
  // before) is planned from that copy's own rows.
  if (request.from?.kind === "rows" && chainedStartPart(block, request) === null) return planRowsContinuationCut(block, request);
  return walkFragments(block, request, (part, partIndex, availablePx, startPart) => {
  const planned = planRowSliceHead(part.dom, availablePx, { closedBox: isClosedBoxRowSlicedAtomType(part.node.type.name) });
  if (!planned) return null;
  return {
    kind: "rows",
    key: `rows:${planned.row}`,
    payload: { row: planned.row, partIndex } satisfies RowsCutPayload,
    // The fragments before this one, the join that draws them as one with
    // it (negative for a card with its own frame), and its rows up to the cut.
    headHeightPx:
      partHeightsBetween(block, startPart, partIndex) +
      (partIndex > startPart ? part.joinBeforePx : 0) +
      planned.headPx,
    tailHeightPx: Math.max(0, part.heightPx - planned.headPx) + partHeightsAfter(block, partIndex),
  };
  });
}

/**
 * The next cut of a list this pass already cut on the page before, inside
 * the same copy: the copy that will open at that row is planned from the
 * rows the copy draws now (planRowSliceHead's `fromRow`). Each later page of
 * a long list is cut in the same pass, and every new copy is made drawing
 * only its own rows. Planned one page a pass, every cut made a copy of all
 * the rows still to place and drew them again: a 2,000-entry table of
 * contents mounted 96,288 rows to lay out its 87 pages.
 *
 * Only from a continuation copy, whose first row stands where a copy opening
 * mid-list puts its first row; the list's first copy (its title above the
 * rows) answers no cut, and the copy cut there is planned in the next pass,
 * as before. The next pass measures every copy it made; a copy that does not
 * fit as planned is cut again from there.
 */
function planRowsContinuationCut(block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null {
  const from = request.from?.payload as Partial<RowsCutPayload> | null | undefined;
  if (!from || !Number.isInteger(from.row) || !Number.isInteger(from.partIndex)) return null;
  const fromPart = from.partIndex as number;
  const part = block.parts[fromPart];
  if (!part || rowSliceRange(part.node.attrs).start === 0) return null;
  const closedBox = isClosedBoxRowSlicedAtomType(part.node.type.name);
  const restPx = rowSliceRestPx(part.dom, from.row as number, { closedBox });
  if (restPx === null) return null;
  if (restPx - part.creditPx > request.availablePx + 1e-6) {
    // The page ends among this copy's rows.
    const planned = planRowSliceHead(part.dom, request.availablePx, { closedBox, fromRow: from.row as number });
    if (!planned) return null;
    return {
      kind: "rows",
      key: `rows:${planned.row}`,
      payload: { row: planned.row, partIndex: fromPart } satisfies RowsCutPayload,
      headHeightPx: planned.headPx,
      tailHeightPx: planned.tailPx + partHeightsAfter(block, fromPart),
    };
  }
  // The rest of this copy fits: the page goes on into the copies after it,
  // as walkFragments takes a list that opens at a copy's first row.
  let remaining = request.availablePx - restPx;
  for (let partIndex = fromPart + 1; partIndex < block.parts.length; partIndex += 1) {
    const next = block.parts[partIndex];
    const joinedHeightPx = next.heightPx - next.repeatedHeaderPx;
    if (next.joinBeforePx + joinedHeightPx - next.creditPx <= remaining + 1e-6) {
      remaining -= next.joinBeforePx + joinedHeightPx;
      continue;
    }
    remaining -= next.joinBeforePx;
    const planned = remaining > 0
      ? planRowSliceHead(next.dom, remaining, { closedBox: isClosedBoxRowSlicedAtomType(next.node.type.name) })
      : null;
    if (planned) {
      return {
        kind: "rows",
        key: `rows:${planned.row}`,
        payload: { row: planned.row, partIndex } satisfies RowsCutPayload,
        headHeightPx: request.availablePx - remaining + planned.headPx,
        tailHeightPx: Math.max(0, next.heightPx - planned.headPx) + partHeightsAfter(block, partIndex),
      };
    }
    const seam = boundaryCut(block, partIndex, fromPart);
    return seam ? { ...seam, headHeightPx: request.availablePx - remaining - next.joinBeforePx } : null;
  }
  return null;
}

/** The inputs a split answer depends on besides the block's fragments:
 * the request and the block's measured atom, fragments and note rows. */
function splitRequestKey(block: LogicalBlock, request: LedgerSplitRequest): string {
  const r = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : String(value));
  const atom = request.atom;
  const parts = block.parts
    .map((part) => `${r(part.heightPx)},${r(part.repeatedHeaderPx)},${r(part.joinBeforePx)},${r(part.creditPx)},${r(part.noteChromePx)},${part.notes.map((note) => `${note.offset}:${r(note.heightPx)}`).join(" ")}`)
    .join(";");
  return [
    r(request.availablePx),
    r(request.fullCapacityPx),
    request.pageEmpty ? 1 : 0,
    r(request.pageNoteChromePx ?? 0),
    request.noFootCredit ? 1 : 0,
    request.from ? `${request.from.key}@${r(request.from.headHeightPx)}` : "-",
    r(atom.heightPx),
    r(atom.spaceBeforePx),
    r(atom.spaceAfterPx),
    r(atom.creditPx),
    parts,
  ].join("|");
}

function createSplitOracle(
  view: EditorView,
  logical: LogicalBlock[],
  memo: { cache: LedgerMeasureCache; sheets: readonly HTMLElement[]; changed: ReadonlySet<HTMLElement> } | null = null,
): LedgerSplitOracle {
  const plan = (block: LogicalBlock, request: LedgerSplitRequest): LedgerCut | null => {
    try {
      switch (block.kind) {
        case "text":
          return planTextHead(view, block, request);
        case "code":
          return planCodeHead(block, request);
        case "container":
          return planContainerHeadCut(view, block, request);
        case "table":
          return planTableHeadCut(view, block, request);
        case "notes":
          return planNotesHeadCut(block, request);
        case "rows":
          return planRowsHeadCut(block, request);
        default:
          return null;
      }
    } catch {
      return null;
    }
  };
  return {
    forcedHead(request) {
      const block = logical[request.atom.index];
      if (!block || block.kind !== "table") return null;
      try {
        return planTableForcedHead(block, request);
      } catch {
        return null;
      }
    },
    planHead(request) {
      const block = logical[request.atom.index];
      if (!block) return null;
      if (!memo) return plan(block, request);
      // A block whose sheets did not change answers as it did before: the
      // answer measures only its own fragments.
      const parts = block.parts.map((part) => [part.dom, part.node] as const);
      const key = splitRequestKey(block, request);
      // An edited seam is cut again from the joined text once: that answer
      // is not the block's lasting one.
      const edited = Boolean(block.editedSeams?.size) || Boolean(block.staleRowKeepPx?.size);
      const unchanged = !edited && block.parts.every((part) => !memo.changed.has(memo.sheets[part.sheet]));
      if (unchanged) {
        const known = memo.cache.oracleAnswer(parts, key);
        if (known !== undefined) return known;
      }
      const answer = plan(block, request);
      if (!edited) memo.cache.storeOracleAnswer(parts, key, answer);
      return answer;
    },
  };
}

/** A cut exactly at an existing seam: the head is every fragment before
 * `partIndex`, the tail starts with that fragment. Carries the seam's own key
 * so the reconciler keeps the seam untouched. */
export function boundaryCut(block: LogicalBlock, partIndex: number, startPart = 0): LedgerCut | null {
  if (partIndex <= startPart || partIndex >= block.parts.length) return null;
  const key = existingSeamKey(block, partIndex - 1);
  if (key === null) return null;
  return {
    kind: block.kind,
    key,
    payload: { partIndex: partIndex - 1, boundary: true },
    headHeightPx: partHeightsBetween(block, startPart, partIndex),
    tailHeightPx: partHeightsAfter(block, partIndex - 1),
  };
}

/** Stable identity of an EXISTING seam between two fragments of a logical
 * block, in the same vocabulary the oracle uses for planned cuts, so the
 * reconciler can keep a seam that the plan reproduces. Seams whose logical
 * position cannot be expressed (in-item list seams, complex table row seams)
 * are keyed by ordinal so a plan can still reproduce them as boundaries. */
/** The source row whose continuation is the first body row of table
 * fragment `table` (-1 when it states none), or null when that row starts
 * whole. */
function continuedSourceRow(table: PmNode): number | null {
  for (let index = 0; index < table.childCount; index += 1) {
    const row = table.child(index);
    if (row.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) continue;
    if (row.attrs?.[TABLE_ROW_CONTINUATION_ATTR] !== true) return null;
    const source = row.attrs?.[TABLE_SOURCE_ROW_ATTR];
    return Number.isInteger(source) ? (source as number) : -1;
  }
  return null;
}

/** How many of a table's seams up to `seamIndex` cut inside source row `row`. */
function withinRowSeamsThrough(block: LogicalBlock, seamIndex: number, row: number): number {
  let count = 0;
  for (let seam = 0; seam <= seamIndex && seam + 1 < block.parts.length; seam += 1) {
    if (continuedSourceRow(block.parts[seam + 1].node) === row) count += 1;
  }
  return count;
}

/**
 * The key of the `ordinal`-th cut inside source row `row`. A row taller than
 * two pages is cut on every page, as Word breaks it (a 130-paragraph cell runs
 * over six pages, its row continued on each). Every cut of one row had the
 * same key, so the cut planned on the continuation page read as the seam that
 * was already there: it was planned again on every pass and never made, and
 * the continuation ran off the paper.
 */
/**
 * Where a cut inside a row falls, as the end of the row piece it leaves on
 * its page: each cell's last words. (The head piece stays as it was cut; the
 * tail is joined with the pieces after it.) The ordinal alone named every
 * cut of one row on one page alike, so re-cutting a page and pulling the
 * next piece up read as the same layout, and the cycle guard never saw the
 * two alternate (corpus R03-D23, nested tables four deep).
 *
 * Each block's end is marked, so a cut before an empty paragraph is told
 * from the cut after it: read as words alone the two were one key, a head
 * piece 11px past the foot of the page (two empty paragraphs closing a cell
 * four tables deep) planned the cut it already had, and the page stayed
 * overfull (corpus R03-D23).
 */
function headRowSignature(head: TableJsonNode | null | undefined): string {
  const rows = Array.isArray(head?.content) ? head!.content : [];
  const row = rows[rows.length - 1];
  if (!row || !Array.isArray(row.content)) return "";
  const text = (node: TableJsonNode): string =>
    node.type === "text"
      ? String(node.text ?? "")
      : `${(node.content ?? []).map(text).join("")}${BLOCK_END_MARKS[node.type ?? ""] ?? ""}`;
  const start = row.content.map((cell) => text(cell).replace(/\s+/g, " ").trim().slice(-24)).join("|");
  let hash = 0;
  for (let index = 0; index < start.length; index += 1) hash = (hash * 31 + start.charCodeAt(index)) | 0;
  return `@${(hash >>> 0).toString(36)}`;
}

const BLOCK_END_MARKS: Readonly<Record<string, string>> = {
  paragraph: "\u00b6",
  heading: "\u00b6",
  table: "\u2020",
  tableRow: "/",
};

/** The signature of the head a planned row cut would leave (headRowSignature). */
export function plannedTailSignature(
  table: PmNode,
  rowIndex: number,
  cuts: ReadonlyArray<import("../tablePagination").TableCellTextCut>,
  repeatHeaderRows: readonly number[],
): string {
  try {
    const pair = fragmentTableWithinRow(table.toJSON() as TableJsonNode, rowIndex, cuts, "signature", { repeatHeaderRows });
    return pair ? headRowSignature(pair.head) : "";
  } catch {
    return "";
  }
}

function withinRowCutKey(row: number, ordinal: number): string {
  return ordinal > 1 ? `row:${row}:within:${ordinal}` : `row:${row}:within`;
}

/** The ledger key of a cut inside source row `row` of part `partIndex`:
 * the next cut of that row after the seams already made in it. */
export function tableWithinRowCutKey(block: LogicalBlock, partIndex: number, row: number): string {
  const before = partIndex > 0 ? withinRowSeamsThrough(block, partIndex - 1, row) : 0;
  return `table:${withinRowCutKey(row, before + 1)}`;
}

export function existingSeamKey(block: LogicalBlock, seamIndex: number): string | null {
  const head = block.parts[seamIndex];
  const tail = block.parts[seamIndex + 1];
  if (!head || !tail) return null;
  const key = identifiableSeamKey(block, seamIndex);
  return key ?? `${block.kind}:seam${seamIndex}`;
}

function identifiableSeamKey(block: LogicalBlock, seamIndex: number): string | null {
  const tail = block.parts[seamIndex + 1];
  switch (block.kind) {
    case "text":
      return `text:${contentOffsetBefore(block, seamIndex + 1)}`;
    case "code": {
      let lines = 0;
      for (let i = 0; i <= seamIndex; i += 1) lines += block.parts[i].node.textContent.split("\n").length;
      return `code:${lines}`;
    }
    case "table": {
      // A row continuation seam: the tail's first body row continues a source row.
      const continued = continuedSourceRow(tail.node);
      if (continued !== null && continued >= 0) {
        return `table:${withinRowCutKey(continued, withinRowSeamsThrough(block, seamIndex, continued))}${headRowSignature(block.parts[seamIndex].node.toJSON() as TableJsonNode)}`;
      }
      const start = tail.node.attrs?.[TABLE_FRAGMENT_START_ROW_ATTR];
      return Number.isInteger(start) ? `table:rows:${start}` : null;
    }
    case "container": {
      const head = block.parts[seamIndex];
      const tailStart = containerChildStart(block, seamIndex + 1);
      if (!childContinues(tail.node)) return `container:items:${tailStart}`;
      // The head's last child was split: at a block boundary or inside text.
      const lastItem = head.node.lastChild;
      if (!lastItem) return null;
      const kindPrefix = block.parts[0].node.type.name === "blockquote" || block.parts[0].node.type.name === "callout" ? null : "item";
      const lastBlock = lastItem.lastChild;
      if (kindPrefix === null) {
        // blockquote/callout: children are blocks directly. A cut inside a
        // nested list or quote (…Nested) left that container's head last.
        if (isSplittableContainer(lastItem) && lastItem.attrs?.[SPLIT_CONTINUES_ATTR] === true) {
          return `container:${containerDeepCutKey(block.parts.slice(0, seamIndex + 1).map((entry) => entry.node), tail.node)}`;
        }
        if (lastItem.attrs?.[SPLIT_CONTINUATION_ATTR] !== undefined && lastItem.isTextblock && lastItem.attrs?.pageSplitContinues === true) {
          return `container:child:${tailStart}:text:${lastItem.content.size}`;
        }
        return `container:blocks:${tailStart + 1}`;
      }
      if (lastBlock && lastBlock.isTextblock && lastBlock.attrs?.pageSplitContinues === true) {
        return `container:item:${tailStart}:child:${lastItem.childCount - 1}:text:${lastBlock.content.size}`;
      }
      // A cut through a table (listItemTable) left its head fragment last and
      // its tail fragment first in the next piece (after the schema bridge).
      if (lastBlock?.type.name === "table") {
        const tailItem = tail.node.firstChild;
        let tailTable: PmNode | null = null;
        for (let index = 0; tailItem && index < tailItem.childCount; index += 1) {
          const child = tailItem.child(index);
          if (child.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true) continue;
          tailTable = child;
          break;
        }
        const id = lastBlock.attrs?.[TABLE_FRAGMENT_ID_ATTR];
        if (tailTable?.type.name === "table" && typeof id === "string" && id && tailTable.attrs?.[TABLE_FRAGMENT_ID_ATTR] === id) {
          return `container:item:${tailStart}:child:${lastItem.childCount - 1}:table:${tableSeamSignature(lastBlock, tailTable)}`;
        }
      }
      // A cut inside a nested list (listItemNested) left that list's head last.
      if (lastBlock && isSplittableContainer(lastBlock) && lastBlock.attrs?.[SPLIT_CONTINUES_ATTR] === true) {
        return `container:${containerDeepCutKey(block.parts.slice(0, seamIndex + 1).map((entry) => entry.node), tail.node)}`;
      }
      return `container:item:${tailStart}:blocks:${lastItem.childCount}`;
    }
    case "notes": {
      const entry = tail.node.attrs?.[NOTE_SLICE_START_ATTR];
      const offset = tail.node.attrs?.noteSliceStartOffset;
      return `notes:${Number.isInteger(entry) ? entry : 0}:${Number.isInteger(offset) ? offset : 0}`;
    }
    case "rows":
      return `rows:${rowSliceRange(tail.node.attrs).start}`;
    default:
      return null;
  }
}
