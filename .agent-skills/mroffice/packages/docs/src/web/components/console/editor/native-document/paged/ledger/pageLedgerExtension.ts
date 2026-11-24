/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Page ledger extension — the deterministic pagination driver.
 *
 * One ProseMirror plugin (no state/appendTransaction, exactly like the
 * measurement-driven engine it replaces; its only prop is the input gate of
 * the initial settle, below) that on every trigger:
 *
 *   1. checks the editing-safety gates (suspended view mode, IME composition,
 *      focused note body, font plan readiness, pending metric projections);
 *   2. builds the ledger from the live sheets (ledgerAtoms);
 *   3. cuts it in one pass (ledgerCut);
 *   4. reconciles the sheeted document to the plan in ONE transaction
 *      (ledgerReconcile), carrying REBALANCE_META + addToHistory:false;
 *   5. re-runs after the DOM re-rendered, because the tails of freshly cut
 *      blocks are estimates until they exist as fragments; the pass converges
 *      when the plan reproduces the current composition (usually 1-2 extra
 *      passes, bounded by MAX_PASSES);
 *   6. verifies physical overflow and, purely as a lossless safety net,
 *      pushes an overflowing suffix forward while recording a mismatch
 *      diagnostic — the ledger's decisions are never re-tuned by tolerance.
 *
 */
import { MRNOTE_BLOCK_ID_ATTR } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { headRowTakesTailWord, staleRowSeamKeepPx } from "./ledgerStaleSeam";
import { msSinceTyping } from "@mrnote/core/web/lib/typing-session.ts";
import { hostHasTheKeyboard, keyTypesCharacter, returnKeysToWindow, takeKeysHeldForWindow, windowHoldsKeysFor, windowIdAround } from "@mrnote/core/web/lib/editor/held-keys.ts";
import { inkTraceWork } from "@mrnote/core/web/lib/ink-input-trace.ts";
import { HOLLOW_SHEET_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/pageSheetView.ts";
import { dispatchKeepingReader } from "../readerAnchor";
import { anyPageHollow, hollowPagePositions, hollowSheetsEnabled, NO_HOLLOW_ATTR, pageHollowSheetsKey, setHollowPages, viewMayDrawHollow } from "@mrnote/core/web/components/console/editor/native-document/paged/pageHollowSheets.ts";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import {
  DOCUMENT_AUTO_LINE_SPACING_PENDING,
  DOCUMENT_ENGINE_LINES_PENDING,
  DOCUMENT_JUSTIFIED_SHRINK_PENDING,
  DOCUMENT_WORD_CJK_SPACING_PENDING,
  LAYOUT_METRICS_FLUSH_EVENT,
  measureOutsideEditorObservation,
  PAGE_LEDGER_BACKGROUND_ATTR,
  PAGED_BULK_FILL_ATTR,
  PAGE_LEDGER_CYCLE_ATTR,
  PAGE_LEDGER_DEFERRED_ATTR,
  INITIAL_SETTLE_SHOWN_ATTR,
  sourceFontPlanIsReady,
  writeDocumentLayoutStatus,
} from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { collectDocumentFontCharacters } from "@mrnote/core/web/components/console/editor/native-document/documentFontCharacters.ts";
import { READ_ONLY_TRUSTED_MUTATION_META } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";
import { isImeCompositionActive, onImeCompositionSettled } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import {
  applyBoundaryMove,
  blockColumnFlowGeometry,
  collectPages,
  columnFlowGeometry,
  sheetColumnCount,
  readCapacity,
  DOCUMENT_VIEW_MODE_ATTR,
  INITIAL_PAGINATION_SETTLING_ATTR,
  PAGINATION_STALLED_ATTR,
  REBALANCE_META,
  sheetBodyOverflowPx,
  syncStructuralColumnFlow,
  syncStructuralPageStartSpacing,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import { copilotLeadingSpacePolicy } from "@mrnote/core/web/components/console/editor/native-document/paged/columnFlowDecorations.ts";
import { paginationLayoutRect, paginationLayoutScale, withPaginationScaleReuse } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationGeometry.ts";
import { projectUnequalColumnSheet, UNEQUAL_COLUMN_FLOW_ATTR, unequalColumnProjectionRulesText } from "@mrnote/core/web/components/console/editor/native-document/paged/unequalColumnProjection.ts";
import {
  invalidateWordAutofitMeasurements,
  projectWordAutofitTables,
} from "@mrnote/core/web/components/console/editor/native-document/wordTableAutofitDisplay.ts";
import { disposeWordRowspanHeights, projectWordRowspanHeights } from "../../wordRowspanHeights";
import { invalidateRenderedTextHeads, joinedTextBreaksAtSeam } from "@mrnote/core/web/components/console/editor/native-document/paged/renderedTextHead.ts";
import { engineJoinedRows } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerEngineLines.ts";
import { createTwitchWatch, noteLayoutTwitch, pageOnScreen, reportLayoutTwitch, type TwitchWatch } from "./ledgerTwitch";
import { refreshInlineImagePageProjection } from "../../ImageResizeNodeView";
import { INLINE_PICTURE_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import { isForcedBreakBlock, PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import { documentPartsStillToCome } from "../pageCountSettled";
import { dropRestoredSnapshot, markRestoredLayout, msSincePartArrived, restoredSnapshotOf, snapshotFontsHold, takePartArrival, takeRestoredLayout, takeRestoredSheets } from "@mrnote/core/web/components/console/editor/native-document/paged/restoredLayoutMark.ts";
import { holdForArrivingParts, PARTS_ARRIVING_POLL_MS, partsArrivingHoldOn, partsState } from "./ledgerPartsArriving";
import { layoutSnapshotsEnabled, noteRestoredPart, refuteKeptLayout, rowFontsHold, seedPartMeasures, sheetNodes } from "@mrnote/core/web/components/console/editor/native-document/paged/layoutSnapshot.ts";
import { markBlankLinesPastFloats, projectTablePageFrames } from "@mrnote/core/web/components/console/editor/native-document/tablePageFrame.ts";
import { publishTableBothSides } from "@mrnote/core/web/components/console/editor/native-document/floatBothSidesWrap.ts";
import { normalizeWordCompatibilityMode } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import { PAGE_LEDGER_CONVERGED_EVENT, PAGE_OVERSIZE_ATTR, PAGE_OVER_TALL_SHEETS_EVENT, PRINT_SHEETS_OVERRUN_REASON } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { docHoldsGiantTextBlock, splitGiantTextBlocks } from "./ledgerGiantBlocks";
import { isOverTallSheet, setOverTallSheet } from "@mrnote/core/web/components/console/editor/native-document/paged/overTallSheets.ts";
import { COLUMN_REGIONS_ATTR, sheetNoteColumns, unequalColumnPlacementForBlock, unequalColumnProjectionForSheet } from "@mrnote/core/web/components/console/editor/native-document/paged/unequalColumnProjection.ts";
import { flushMarkerTabFitsIn } from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import { overlayOnlyDocChange } from "@mrnote/core/web/components/console/editor/native-document/paged/overlayOnlyChange.ts";
import { clearRefusedColumnCuts, planUnequalColumnSplit, refuseColumnCuts } from "./ledgerColumns";
import { applyNestedBreakSplits } from "@mrnote/core/web/components/console/editor/native-document/paged/containerSplitting.ts";
import { PHYSICAL_PAGE_SPILL_TOLERANCE_PX } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetPageSpans.ts";
import {
  buildLedger,
  plannableWithoutDom,
  HEAD_PIECE_OVERRUN_PX,
  existingSeamKey,
  type LedgerMeasureHorizon,
  projectedFootZonesPx,
  sheetBlockElements,
  sheetProjectsFootZone,
  type LedgerBuild,
  type LogicalBlock,
  refuseTableRowCut,
  holdRecutRows,
  encodedBlockMeasure,
  forgetPageMeasures,
  documentVerified,
  forgetSeededReadings,
  markPageVerified,
  takeSeededReads,
  blockVerified,
  pageHoldsBlockOver,
  pageMeasuresKept,
  pageVerified,
  sectionCapacityForPlan,
  seededLayoutRefuted,
} from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerAtoms.ts";
import { sheetRunsPastItsPage } from "@mrnote/core/web/components/console/editor/native-document/paged/pageSpanExtension.ts";
import { TABLE_CONTINUES_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { LedgerMeasureCache } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerMeasureCache.ts";
import { planLedgerPages } from "./ledgerCut";
import { ledgerAddedGapPx, ledgerGapPx } from "./ledgerGap";
import { reconcileLedgerPlan } from "./ledgerReconcile";
import { allocationsContinueNotes, deriveNoteZoneAllocations } from "./ledgerNoteSlices";
import { planNoteZoneSlices, type NoteZoneSlice } from "@mrnote/core/web/components/console/editor/native-document/paged/pagedFootnotes.ts";
import {
  publishSheetNoteSlices,
  readSheetNoteSlices,
  SHEET_NOTE_SLICES_META,
  sheetedDocHasFootnoteRefs,
  structuralFootnoteReservations,
} from "@mrnote/core/web/components/console/editor/native-document/paged/structuralFootnotes.ts";
import { footnotesAllowProgressiveLayout } from "@mrnote/core/web/components/console/editor/native-document/paged/footnoteRefs.ts";
import { withRootMeasurementSlot } from "@mrnote/core/web/components/console/editor/native-document/paged/renderedTextHead.ts";
import { askKatexFacesIfFormulas, createLedgerTypesetMath, katexFaceNews } from "./ledgerTypesetMath";
import { projectionCoversHorizon, setMeasureHorizon, setSheetUnread, sheetsWithinMeasureHorizon , forgetDetachedHorizonSheets } from "@mrnote/core/web/components/console/editor/native-document/paged/measureHorizon.ts";
import type { LedgerCut, LedgerCutOptions, LedgerPage, LedgerPlan, LedgerSplitOracle } from "./ledgerTypes";
import { planWithFootZones } from "./ledgerFootZonePlan";
import { LedgerPhysicalRefusals } from "./ledgerRefusals";
import { faceArrivalBound, faceArrivalSince } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerFaceScan.ts";
import { editorFontFamilies, facesStartedByProbe, facesUsedBy, fontFamilyNames, loadFacesTheTextDraws, loadedFaceRanges, rangesDrawNarrowText, textDrawsCodePointIn } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerFontRanges.ts";
import { newFontFacesOf } from "@mrnote/core/web/lib/font-face-news.ts";
import { createBackgroundLane } from "@mrnote/core/web/lib/background-work.ts";
import { createLayoutCycleWatch } from "./ledgerLayoutCycle";
import { createSeamWanderWatch } from "./ledgerSeamWander";
import { SYNTHETIC_BOLD_ADVANCE_REASON } from "../../documentSyntheticBoldWordAdvance";
import { backgroundIsFar, createIdleStepper, FAR_STEP_INPUT_PAUSE_MS, FAR_STEP_REST_AFTER_MS, nextStepSizing, type StepSizing } from "./ledgerBackgroundPace";
import { PAGE_BANDS_MEASUREMENT_PENDING_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { bandsFirst, PAGE_BANDS_REBALANCE_REASON } from "../bandsFirst";
import { textEngineEnabled } from "@mrnote/core/web/lib/text-engine/flags.ts";
import { createSheetDormancy } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetDormancy.ts";
import {
  composeScopedPlan,
  type StandingNotes,
  currentPageStartAtoms,
  pageStartAtoms,
  sheetsKeptByPlan,
  resolvePassScope,
  scopedPlanStart,
  scopedStopAt,
  scopeWindowEnd,
  visibleSheetRange,
  type LedgerPassScope,
} from "./ledgerScope";
import { sheetsOf } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";
import { coldFirstLayout, holdFirstLayoutForFaces } from "@mrnote/core/web/components/console/editor/native-document/paged/coldFirstLayout.ts";

export const pageLedgerKey = new PluginKey("pageLedger");
export const PAGE_LEDGER_MISMATCH_ATTR = "data-pagination-ledger-mismatch";
export const PAGE_LEDGER_PASS_ATTR = "data-pagination-ledger-passes";

export interface PageLedgerOptions {
  waitForSourceFontPlan: boolean;
  /** No reader (the print surface): the background's far steps run back to
   * back instead of waiting for idle slots (ledgerBackgroundPace). The pages
   * and their layout are the same; they are only laid out sooner. */
  eagerBackground: boolean;
}

/** Convergence bound for one trigger: pass 1 plans, later passes refine the
 * tails it estimated. A cycle here means a render/ledger disagreement, which
 * is reported, not hidden. */
const MAX_PASSES = 24;
/** Passes a block drawn anew without a transaction (`drawnHeightChanged`)
 * may start after one change of the document. */
const DRAWN_CHANGE_PASSES = 8;










const lastLedgerDispatch = new WeakMap<EditorView, {
  before: string[];
  after: string[];
  doc: PmNode;
  /** The count of authored edits when the pass dispatched (LedgerEditState). */
  editSeq: number;
  /** The page capacities the dispatched plan was made with. */
  capacities: number[];
  /** How many times in a row a plan put back what the last one replaced
   * after the capacities of the pages above had changed. */
  capacityFlips: number;
  /** Each atom's measured extent (by atom index) the plan was made with. */
  extents: number[];
  /** The plan cut a paragraph's page seam again (LogicalBlock.editedSeams):
   * its head's last row sent on to be laid out with the tail. The pass after
   * takes back the rows that fit -- the same ones, when the row breaks where
   * it did -- and that is the cut's second half, not two layouts alternating. */
  seamRecut: boolean;
}>();

/** Each view's watch for pages that come back to openings they had (ledgerTwitch). */
const twitchWatches = new WeakMap<EditorView, TwitchWatch>();

const atomExtentPx = (atom: LedgerBuild["atoms"][number]): number => atom.heightPx + atom.spaceBeforePx + atom.spaceAfterPx;

/**
 * The edits since the last pass all lie before the block that opens the
 * first page the plan changes, and changed no measured extent of a block
 * before it: the plan reads there what the last pass read, as if nothing had
 * been edited. Typed one character at a time above a list whose two cuts
 * measure 3 px apart (corpus R280-D14: the cut piece reads 27.9 px on the
 * next page and 31.3 px pulled up), the plan moved the cut back and forth on
 * every keystroke, each pass after a new edit, which the guard never read as
 * putting the last one back: some 480 ms of every keystroke rebuilt the pages.
 */
function editLeavesOpeningInputs(
  last: { doc: PmNode; extents: readonly number[] },
  doc: PmNode,
  build: LedgerBuild,
  planned: readonly string[],
  current: readonly string[],
): boolean {
  const first = planned.findIndex((start, page) => start !== current[page]);
  if (first < 1) return false;
  const a = parseOpening(planned[first] ?? "");
  const b = parseOpening(current[first] ?? "");
  if (!a || !b) return false;
  const atom = Math.min(a.atom, b.atom);
  const from = build.logical[atom]?.parts[0]?.pos;
  if (from === undefined) return false;
  const start = last.doc.content.findDiffStart(doc.content);
  if (start === null || start === undefined) return true;
  const end = last.doc.content.findDiffEnd(doc.content);
  if (!end || Math.max(start, end.b) >= from) return false;
  for (const measured of build.atoms) {
    if (measured.index >= atom) continue;
    if (last.extents[measured.index] !== atomExtentPx(measured)) return false;
  }
  return true;
}

/** How many authored edits the document has had (LedgerEditState.seq). */
function authoredEditSeq(view: EditorView): number {
  return (pageLedgerKey.getState(view.state) as LedgerEditState | undefined)?.seq ?? 0;
}

/** How many edits (the reader's or another's) reached this view since it opened. */
export function documentAuthoredEditSeq(view: EditorView): number {
  return authoredEditSeq(view);
}

/**
 * The page openings a run of physical repairs started from (the plan the
 * painted pages refused), and the document the last repair of the run left.
 * A plan that would put that layout back on that very document plans from
 * measurements the painted page already contradicted: the ledger and the
 * verifier would alternate until the pass limit and stop on whichever came
 * last, an over-full page as often as not (R36-D29: a column region cut
 * mid-paragraph, the cut merged back every other pass). The repaired layout
 * is kept instead. A refusal (LedgerPhysicalRefusals) only holds a page
 * opened by a whole block, never one opened by a paragraph's continuation.
 */
const lastPhysicalRepair = new WeakMap<EditorView, { before: string[]; doc: PmNode; editSeq: number; capacities: number[] }>();

/** Whether the pages before the first opening `planned` changes still have
 * the capacities the repair saw: a page that grew may take back what it
 * refused. */
function repairedPagesUnchanged(capacities: readonly number[], now: readonly number[], planned: readonly string[], current: readonly string[]): boolean {
  let first = 0;
  while (first < planned.length && first < current.length && planned[first] === current[first]) first += 1;
  for (let page = 0; page < first; page += 1) {
    if (!(Math.abs((capacities[page] ?? Number.NaN) - (now[page] ?? Number.NaN)) <= 0.5)) return false;
  }
  return true;
}

/** Where a page opening stands in the document: its atom, whether it opens
 * the block whole (before any of its cuts), and for a cut whose key counts
 * through the block (a text offset, a code line, a table row) that count
 * with the kind it counts in. */
/** The first page where the last dispatch's two layouts differ, if a cut within a
 * row is one of them: refused. Whether that is a cut not refused before. */










export function seamWanderStops(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsSeamWanderStop?: boolean }) | null)?.__docsSeamWanderStop === true;
}

/** `window.__docsSeamRecutPutBackHeld = true`: the pass after a seam was cut
 * again is held like any plan that puts the last one's pages back, as before
 * (an A/B of one build). */
function seamRecutPutBackHeld(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsSeamRecutPutBackHeld?: boolean }) | null)?.__docsSeamRecutPutBackHeld === true;
}

/** `window.__dqc2BandCreditOn = true` (A/B): a page whose body ends at a
 * header or footer object (bandBodyFloorPx) still gives its last line the
 * page-bottom Auto leading credit, past the object's top, as before. */
function bandCreditStaysOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __dqc2BandCreditOn?: boolean }) | null)?.__dqc2BandCreditOn === true;
}

/** `window.__docsSectionColumnPage = false` reads a section's capacity on a
 * sheet of other columns as it was read on its own sheet (old, A/B). */
function sectionColumnPage(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsSectionColumnPage?: boolean }) | null)?.__docsSectionColumnPage !== false;
}

function refuseAlternatingRowCut(view: EditorView): boolean {
  const last = lastLedgerDispatch.get(view);
  if (!last) return false;
  const page = last.after.findIndex((start, index) => start !== last.before[index]);
  if (page < 0) return false;
  const cut = [last.after[page], last.before[page]].find((start) => start?.includes(":within"));
  if (!cut) return false;
  const editSeq = authoredEditSeq(view);
  return refuseTableRowCut(view, cut, () => authoredEditSeq(view) === editSeq);
}

function parseOpening(start: string): { atom: number; whole: boolean; cut: { kind: string; at: number } | null } | null {
  const plus = start.indexOf("+");
  const atom = Number(plus < 0 ? start : start.slice(0, plus));
  if (!Number.isInteger(atom)) return null;
  const counted = plus < 0 ? null : /^(text|code|rows|table:rows):(\d+)$/.exec(start.slice(plus + 1));
  return { atom, whole: plus < 0, cut: counted ? { kind: counted[1], at: Number(counted[2]) } : null };
}

/** The first page whose opening differs, and whether `a` opens it earlier
 * in the document than `b` (more of the document on the pages after it).
 * Null when the two cannot be ordered. */
/** How many pages from the first one a plan changes must read as they did
 * before the last pass for the plan to be putting those pages back. */
const LOCAL_CYCLE_PAGES = 3;

/**
 * A plan that puts back the pages the last pass replaced, from the first page
 * it changes on, while pages further on differ. Those stand elsewhere because
 * the background has reached them since, or a seam landed a little
 * differently, so the two whole layouts never compare equal though their
 * first pages alternate (R286-D01: 91 and 94 opening page 9, 28 of the 42
 * passes of a 420 s settle, each rebuilding every page after them; two passes
 * compared equal whole in all of it).
 */
export function putsPagesBack(before: readonly string[], planned: readonly string[], current: readonly string[]): boolean {
  const first = planned.findIndex((start, page) => start !== current[page]);
  if (first < 1) return false;
  const end = first + LOCAL_CYCLE_PAGES;
  if (planned.length < end || before.length < end) return false;
  for (let page = 0; page < end; page += 1) {
    if (planned[page] !== before[page]) return false;
  }
  return true;
}

export function earlierOpening(a: readonly string[], b: readonly string[]): { page: number; aEarlier: boolean } | null {
  const page = a.findIndex((start, index) => start !== b[index]);
  // One layout is the other with one more page at its end: the one that has
  // it opens that page earlier (the block that did not fit moved on, as Word
  // moves it). A page-count cycle on a document's last page (R26-D04: one
  // block pushed onto a 16th page, then pulled back) is held like any other.
  // (`findIndex` over `a` stops at its own end: the shorter one is a prefix
  // of the longer when the first difference is past the shorter's end,
  // whichever of the two that is. Read only for a shorter `a`, a one-page
  // layout and the same with a second page alternated unheld for good,
  // R30-D07.)
  if ((page < 0 || page >= Math.min(a.length, b.length)) && a.length !== b.length) {
    const opened = Math.min(a.length, b.length);
    return opened >= 1 ? { page: opened, aEarlier: a.length > b.length } : null;
  }
  if (page < 1 || page >= b.length) return null;
  const x = parseOpening(a[page]);
  const y = parseOpening(b[page]);
  if (!x || !y) return null;
  if (x.atom !== y.atom) return { page, aEarlier: x.atom < y.atom };
  if (x.whole !== y.whole) return { page, aEarlier: x.whole };
  // Two cuts of the same block: the one further back in it opens the page
  // earlier. They could not be ordered, so a paragraph whose page break
  // alternated between two lines was never held (R21-D04: "5+text:851" and
  // "5+text:1263" until the pass limit stalled it).
  if (x.cut && y.cut && x.cut.kind === y.cut.kind && x.cut.at !== y.cut.at) return { page, aEarlier: x.cut.at < y.cut.at };
  return null;
}

/** Whether the page that ends at the first opening two plans differ on
 * stands within its foot as painted. */
function unorderedSeamFits(view: EditorView, planned: readonly string[], current: readonly string[]): boolean {
  const page = planned.findIndex((start, index) => start !== current[index]);
  if (page < 1) return false;
  const sheet = sheetsOf(view.dom)[page - 1];
  return Boolean(sheet) && !(sheetBodyOverflowPx(sheet!) > PHYSICAL_PAGE_SPILL_TOLERANCE_PX);
}

/** A pass at least this long is noticeable between two keystrokes. */
const SLOW_PASS_MS = 120;
/** Past this many pages a pass of a frame already is (the next key waits). */
const LONG_DOCUMENT_PAGES = 30;
const LONG_DOCUMENT_SLOW_PASS_MS = 16;
/** How often a ledger held by the bridge's chunked fill looks again. */
const BULK_FILL_POLL_MS = 100;
/**
 * How long one frame may keep composing pages before the rest yields to the
 * next frame. A cut's tail is an estimate until it exists as a fragment, so a
 * page break usually needs a second pass; run it in the SAME frame when the
 * first was cheap, so no frame ever paints a page the ledger has not
 * finished (text over the bottom margin, the next page not yet there).
 */
const SAME_FRAME_PASS_BUDGET_MS = 24;
/** How long the first pass waits for the bands to be read (docs-layout). */
export const FIRST_PASS_BAND_WAIT_MAX_MS = 15_000;
/** A background step slower than this halves the pages of the next; one quicker than the other bound grows it. */
const SLOW_BACKGROUND_STEP_MS = 250;
const QUICK_BACKGROUND_STEP_MS = 80;
/** A metrics flush longer than this ends the pass's task; the pass goes on in the next frame. */
const FLUSH_YIELD_MS = 50;
/** How long typing pauses before a slow document re-paginates. */
export const LEDGER_EDIT_IDLE_MS = 350;
const EDIT_IDLE_MS = LEDGER_EDIT_IDLE_MS;
/**
 * Pages a pass of a settled document lays out at least beyond the first
 * page an edit can have changed, when the reader's own pages end sooner
 * (ledgerScope). The rest of the document follows pass by pass, a frame
 * each, as Word repaginates in the background.
 */
export const LEDGER_WINDOW_MIN_PAGES = 4;
/** A document of more sheets than this is laid out progressively when a
 * pass would otherwise lay out every page at once (its initial settle, a
 * font that changed every page): a pass lays out at most
 * PROGRESSIVE_MAX_PAGES pages and measures only those, the rest following
 * frame by frame. */
export const PROGRESSIVE_MIN_SHEETS = 8;
export const PROGRESSIVE_MAX_PAGES = 6;
/** Pages a background pass lays out once the reader's pages are shown and no
 * edit is waiting: each dispatch costs the editor's whole-document work
 * (plugins, overlays) once, whatever its size, so the background takes the
 * rest of a long document in fewer, larger passes. */
export const PROGRESSIVE_BACKGROUND_PAGES = 12;









export const PROGRESSIVE_REST_PAGES = 32;
const REST_STEP_SLOW_MS = 1500;
function restStepPages(dom: HTMLElement): number {
  const value = (dom.ownerDocument.defaultView as (Window & { __docsRestStepPages?: unknown }) | null)?.__docsRestStepPages;
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : PROGRESSIVE_REST_PAGES;
}
/** How many times a print reads all its pages' feet before it ends (each push lays out anew). */
const PRINT_FOOT_CHECKS = 4;

/** The least a cuttable block must keep of a page, past what the plan
 * measured short, for the repair to cut it shorter there rather than push
 * it whole (about two lines). */
const SHORTFALL_MIN_KEEP_PX = 40;
/** How many times a page is laid out shorter before its block is pushed
 * whole as before. */
const SHORTFALL_MAX_TRIES = 3;
/** The height `plan` gave each page that stands as it planned it (its
 * opening and the next page's as planned); NaN for the others. A pass that
 * held a layout against a cycle ends with the plan it refused. */
function plannedUsedAsStanding(plan: LedgerPlan, current: readonly string[]): number[] {
  const planned = pageStartAtoms(plan);
  return plan.pages.map((page, index) =>
    planned[index] === current[index] && (index + 1 >= planned.length ? index + 1 >= current.length : planned[index + 1] === current[index + 1])
      ? page.usedPx : Number.NaN);
}
/** The block kinds a plan can cut at a line or an item. */
const SHORTFALL_CUTTABLE = new Set(["paragraph", "heading", "orderedList", "bulletList", "taskList", "blockquote", "codeBlock"]);

/**
 * A print whose page ran past its foot with a cuttable block's piece at its
 * end (the plan measured the page short): the next plans lay that page out
 * shorter by what it ran over and cut the block earlier there, instead of
 * pushing the piece whole to the next page (LedgerPhysicalRefusals'
 * Shortfall). `window.__docsRepairShortfallOff = true` pushes it whole as
 * before; `window.__docsRepairShortfall = true` does it on screen too.
 */
function repairShortfallOn(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & {
    __docsRepairShortfallOff?: boolean;
    __docsRepairShortfall?: boolean;
    __MRAI_PAGE_PREVIEW_SHOW?: unknown;
  }) | null;
  if (!win || win.__docsRepairShortfallOff === true) return false;
  return win.__docsRepairShortfall === true || typeof win.__MRAI_PAGE_PREVIEW_SHOW === "function";
}

/** How long a print waits for the faces its text draws with before laying out without them. */
const PRINT_FACES_WAIT_MS = 15_000;

/** The pages of a step where nobody reads the pages (``eagerBackground``). */
const EAGER_BACKGROUND_PAGES = 64;
/** Harness switch (`window.__pageLedgerBackgroundPages = n`): every
 * background step lays out n pages, never halved or grown -- to measure how
 * a step's cost splits between its pages and what each step costs anyway. */
function backgroundPagesPinned(dom: HTMLElement): number | null {
  const value = (dom.ownerDocument.defaultView as (Window & { __pageLedgerBackgroundPages?: unknown }) | null)?.__pageLedgerBackgroundPages;
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
}

/** The sheets measured before the ledger's first progressive pass has
 * worked out its own horizon (the line-metric projection may run first). */
const INITIAL_MEASURE_HORIZON_SHEETS = 12;
/** How long after the last page came near the sheets behind are hollowed and
 * the new ones read. */
const HOLLOW_SCROLL_QUIET_MS = 300;
/** The walk that reads a settled document through (see verifyWalkStep). */
const VERIFY_WALK_REST_MS = 40;
const VERIFY_WALK_PAGES = 4;
const VERIFY_WALK_TRIES = 6;
/** How many pages of a document opened on a kept layout are read to check it. */
const KEPT_SAMPLE_PAGES = 8;
/** Pages of a part restored as it came in that are drawn to check its kept layout. */
const KEPT_SAMPLE_PER_PART = 2;
const KEPT_OVER_READ_AGAIN_MS = 1500;
/** How long after the reader's wheel, touch or key a scroll is still theirs. */
const READER_INTENT_MS = 800;
/** How long after a document's latest part came in it may be taken as all in. */
const PARTS_AT_REST_MS = 8000;
const VERIFY_WALK_REST_RETRY_MS = 2000;
const UNSIZED_MATH_SELECTOR = "[data-math-pending]:not([data-math-layout-ready])";

/** Whether the page holds a formula (its boxes come from a typeset clone). */
function pageHoldsMath(page: PmNode): boolean {
  let found = false;
  page.descendants((node) => {
    if (found) return false;
    if (node.type.name === "mathBlock" || node.type.name === "inlineMath") found = true;
    return !found;
  });
  return found;
}

/**
 * Where a progressive pass starts and how far it measures: from the page
 * before the first sheet not measured as it stands (or the first pending
 * page), through the pages it may lay out (ledgerScope's window) plus a
 * margin; null when the whole document can be planned from what is known
 * (nothing to lay out, a short document, footnotes).
 */
/** The first sheets of a long document, before the first pass. */
function initialMeasureHorizon(view: EditorView): Set<Element> {
  // The cold first layout measures the reader's first sheets only before the
  // first pass (coldFirstLayout): the pass widens it to what it lays out.
  const cold = coldFirstLayout(view.dom.ownerDocument.defaultView);
  return new Set(sheetsOf(view.dom).slice(0, cold ? cold.horizon : INITIAL_MEASURE_HORIZON_SHEETS + 1));
}

/** The fewest sheets a document is laid out progressively with: any of more
 * than a page under the cold first layout, a long one otherwise. */
function progressiveMinSheets(view: EditorView): number {
  return coldFirstLayout(view.dom.ownerDocument.defaultView)?.minSheets ?? PROGRESSIVE_MIN_SHEETS;
}

function progressiveScope(pagesPerPass: number): NonNullable<LedgerPassScope["progressive"]> {
  return { maxPages: Math.max(PROGRESSIVE_MAX_PAGES, pagesPerPass), minPages: pagesPerPass };
}

function progressiveEligible(view: EditorView): boolean {
  const pages = collectPages(view.state.doc);
  return Boolean(pages && pages.length >= progressiveMinSheets(view) && notesAllowProgress(view));
}

/** Whether the document's footnotes leave it to be laid out a window at a
 * time (footnotesAllowProgressiveLayout). */
function notesAllowProgress(view: EditorView): boolean {
  return footnotesAllowProgressiveLayout(view.state.doc, view.dom.ownerDocument.defaultView) &&
    notesClosingWhole.get(view) !== authoredEditSeq(view);
}

/**
 * Trial (closeNotesWhole): a document with footnotes laid out a window at a
 * time ends as one laid out whole does: once its parts are in and the passes
 * converge, it is laid out whole until a whole pass changes nothing (the authored edit count it closed
 * at; the next edit lays it out a window at a time again). A scoped pass plans
 * a page from what it measured where it stood: a table read by the engine
 * left on the next page whole where the rendered rows let one row stay, a
 * table's cut kept from a page that moved since. The whole pass reads every
 * page as a pass of the document laid out whole does, from a layout that is
 * almost always that one already (R205-D04, R291-D02).
 */
const notesClosingWhole = new WeakMap<EditorView, number>();

/** Trial, off: `window.__docsNotesCloseWhole = true`. On the documents it was
 * tried on (R205-D04, R291-D02) the whole passes changed nothing: what the
 * scoped passes leave there is a fixed point of the whole plan as well. */
function closeNotesWhole(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesCloseWhole?: boolean }) | null;
  if (win?.__docsNotesCloseWhole !== true) return false;
  if (notesClosingWhole.get(view) === authoredEditSeq(view)) return false;
  if (!sheetedDocHasFootnoteRefs(view.state.doc) || !footnotesAllowProgressiveLayout(view.state.doc, win)) return false;
  if (documentPartsStillToCome(view.dom as HTMLElement)) return false;
  notesClosingWhole.set(view, authoredEditSeq(view));
  traceLedgerPass(view, { notesCloseWhole: authoredEditSeq(view) });
  return true;
}

function progressiveHorizon(
  view: EditorView,
  cache: LedgerMeasureCache,
  pending: ReadonlySet<HTMLElement>,
  pagesPerPass: number,
  /** How much further than the window to measure (doubled each time a pass
   * reached past its horizon). */
  reach = 1,
  /** Sheets a restored receipt laid out, standing unmeasured as they are
   * (restoredLayoutMark): no background step goes to them. */
  trusted?: WeakSet<HTMLElement>,
  /** The initial settle's pass (the cold first layout measures less past its window). */
  initial = false,
): { horizon: LedgerMeasureHorizon; visible: { first: number; last: number } | null; pagesPerPass: number; startPage: number } | null {
  const sheets = sheetsOf(view.dom);
  if (sheets.length < progressiveMinSheets(view)) return null;
  if (!notesAllowProgress(view)) return null;
  // A sheet drawn hollow whose blocks all keep their measurements has nothing
  // to read (its element, new each time, was never "measured").
  const docPages = view.state.doc;
  const firstUnmeasured = sheets.findIndex((sheet, index) => !cache.isMeasured(sheet) && !trusted?.has(sheet) &&
    !(sheet.hasAttribute(HOLLOW_SHEET_ATTR) && index < docPages.childCount && pageMeasuresKept(docPages.child(index))));
  const firstPendingAnywhere = sheets.findIndex((sheet) => pending.has(sheet));
  if (firstUnmeasured < 0 && firstPendingAnywhere < 0) return null;
  const startPage = Math.min(
    firstUnmeasured >= 0 ? Math.max(0, firstUnmeasured - 1) : Number.POSITIVE_INFINITY,
    firstPendingAnywhere >= 0 ? firstPendingAnywhere : Number.POSITIVE_INFINITY,
  );
  const visible = visibleSheetRange(view, sheets);
  const firstPending = sheets.findIndex((sheet, index) => index >= startPage && pending.has(sheet));
  const scope: LedgerPassScope = { pending, visible, minPages: LEDGER_WINDOW_MIN_PAGES, progressive: progressiveScope(pagesPerPass) };
  const windowEnd = scopeWindowEnd(startPage, scope, firstPending >= 0 ? firstPending : undefined);
  // The pages before the first pending one were laid out by earlier passes:
  // planned again from their measurements (a changed one measured again), but
  // not charged to the budget of what this pass may measure anew.
  const newFrom = firstPending > startPage ? firstPending : startPage;
  const pages = Math.max(1, windowEnd - newFrom);
  const capacity = readCapacity(view, sheets[Math.min(newFrom, sheets.length - 1)]);
  // The cold first layout's opening passes measure their window and a sheet
  // or two past it: the reader's first page is shown once it stands, and the
  // margin sized for a long book's windows (the window's pages again, six
  // more) was the whole of a document of a few pages. A plan that reaches
  // past it widens the horizon as any (widenHorizon).
  const coldMargin = initial ? coldFirstLayout(view.dom.ownerDocument.defaultView)?.margin ?? null : null;
  if (coldMargin !== null) {
    return {
      visible,
      pagesPerPass,
      startPage,
      horizon: {
        fromSheet: newFrom,
        budgetPx: (Math.ceil(pages * 1.5) + 4) * reach * Math.max(120, capacity),
        maxSheet: Math.min(sheets.length - 1, windowEnd + coldMargin * reach),
      },
    };
  }
  return {
    visible,
    pagesPerPass,
    startPage,
    horizon: {
      fromSheet: newFrom,
      // The window's pages and half as many again: a page boundary is
      // planned from the block that opens the next page, a keepNext chain
      // looks ahead, and a page that opens with the tail of a block cut on
      // the page before is no place to stop, so the pass runs on to the next
      // page that opens whole (on the 296-page book, "+2 pages" fell short on
      // every window and each was measured twice).
      budgetPx: (Math.ceil(pages * 1.5) + 4) * reach * Math.max(120, capacity),
      maxSheet: Math.min(sheets.length - 1, newFrom + (windowEnd - newFrom + pages + 6) * reach),
    },
  };
}

function paginationIsSuspended(view: EditorView): boolean {
  const mode = view.dom.getAttribute(DOCUMENT_VIEW_MODE_ATTR);
  return mode === "web" || mode === "outline" || mode === "draft";
}

/**
 * Whether the fragments the last pass just made already have a layout to
 * read: every sheet and its last block report a height. A real view does,
 * synchronously; a view without layout (hidden, or a test harness that
 * supplies geometry per frame) yields the frame instead of composing again
 * on zero boxes.
 */
function fragmentsHaveLayout(view: EditorView, maxSheet: number | null = null): boolean {
  const all = sheetsOf(view.dom);
  if (all.length === 0) return false;
  // A progressive pass made fragments only up to its horizon; a sheet past
  // it is not laid out at all (and is not read, which would lay it out).
  const sheets = maxSheet === null ? all : all.slice(0, maxSheet + 1);
  for (const sheet of sheets) {
    if (!(sheet.getBoundingClientRect().height > 0)) return false;
    const last = sheet.lastElementChild;
    if (last && !(last.getBoundingClientRect().height > 0)) return false;
  }
  return true;
}

/** Which metric projections are pending, as one comparable string. */
function pendingMetricsKey(view: EditorView): string {
  const root = view.dom;
  return [
    root.hasAttribute(DOCUMENT_AUTO_LINE_SPACING_PENDING) ? "a" : "",
    root.hasAttribute(DOCUMENT_WORD_CJK_SPACING_PENDING) ? "c" : "",
    root.hasAttribute(DOCUMENT_ENGINE_LINES_PENDING) ? "e" : "",
    root.hasAttribute(DOCUMENT_JUSTIFIED_SHRINK_PENDING) ? "j" : "",
    root.hasAttribute("data-docs-display-fonts-pending") ? "f" : "",
    root.getAttribute("data-docs-word-cjk-spacing-measurement-pending") === "true" ? "m" : "",
  ].join("");
}

function metricsPending(view: EditorView): boolean {
  const root = view.dom;
  return (
    root.hasAttribute(DOCUMENT_AUTO_LINE_SPACING_PENDING) ||
    root.hasAttribute(DOCUMENT_WORD_CJK_SPACING_PENDING) ||
    root.hasAttribute(DOCUMENT_ENGINE_LINES_PENDING) ||
    root.hasAttribute(DOCUMENT_JUSTIFIED_SHRINK_PENDING) ||
    root.hasAttribute("data-docs-display-fonts-pending") ||
    root.getAttribute("data-docs-word-cjk-spacing-measurement-pending") === "true"
  );
}

/** A focused footnote/endnote body editor: structural page moves would
 * remount its host and drop the caret, so pagination waits for focusout. */
/** The document declares a Word line grid but the surface has not painted
 * it yet (React commits `data-doc-grid` after the doc attrs land): every
 * line box would measure without the grid's strut, so wait. */
function gridSurfaceReady(view: EditorView): boolean {
  const attrs = view.state.doc.attrs ?? {};
  const declared = attrs.manuscriptGrid === "lines" && Number(attrs.docGridLinePitch) > 0;
  if (!declared) return true;
  const surface = view.dom.closest<HTMLElement>('[data-testid="note-editor-page-surface"]') ?? view.dom.parentElement;
  return Boolean(surface?.closest('[data-doc-grid="lines"]') || surface?.querySelector('[data-doc-grid="lines"]') || view.dom.closest('[data-doc-grid="lines"]'));
}

function noteBodyFocused(view: EditorView): boolean {
  const active = view.dom.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !active.isConnected) return false;
  const host = active.closest<HTMLElement>("[data-footnote-body]");
  return Boolean(host && view.dom.contains(host));
}

/**
 * Bring the DOM the atoms are measured from up to date: the leading-space
 * and column-flow attributes the CSS margin rules key off, then the runtime
 * geometry projections the oracles read — exact unequal column tracks (first
 * paint establishes track widths), inline images fitted to their page box,
 * then the tracks again so the fitted heights are the ones measured. DOM
 * only; source attrs stay intact for save and round-trip.
 *
 * With the measurement cache, the projections run only for the sheets that
 * changed since they last ran (`needsProjection`): a keystroke changes one
 * page, and re-projecting every sheet, twice, forced a style and layout
 * flush of the whole document per sheet. A sheet whose projection did not
 * run keeps the one it has, which is what running it again would write.
 * The tracks are projected a second time only on a sheet whose pictures
 * were fitted in between: on any other the second run reads the same DOM.
 */
function projectSheetsForMeasurement(view: EditorView, cache?: LedgerMeasureCache | null, maxSheet: number | null = null): void {
  // These are runtime attributes and styles on the sheets ProseMirror owns.
  // Written while its DOM observer listens, each one read as typing on that
  // sheet: the whole page was parsed back from the DOM and replaced, and with
  // Track Changes on the replaced copy stayed as a deletion beside the new
  // one -- a freshly opened document grew duplicated pages and its first
  // save was refused.
  measureOutsideEditorObservation(view, () => projectSheetsUnobserved(view, cache, maxSheet));
}

function projectSheetsUnobserved(view: EditorView, cache?: LedgerMeasureCache | null, maxSheet: number | null = null): void {
  const pages = collectPages(view.state.doc);
  const sheets = sheetsOf(view.dom);
  if (!pages || sheets.length !== pages.length) return;
  // (Trace) each step's time, when the projection took long: R286-D01 in
  // Safari spent 31.6 s here in its first pass after the first plan.
  const tracing = ledgerTraceEnabled(view);
  const steps: Record<string, number> = {};
  let stepAt = performance.now();
  const startedAt = stepAt;
  const step = (name: string) => {
    if (!tracing) return;
    const now = performance.now();
    steps[name] = Math.round(now - stepAt);
    stepAt = now;
  };
  // Numbered paragraphs' markers waiting for their tab fit are fitted with
  // this pass's writes, before it measures (flushMarkerTabFitsIn).
  flushMarkerTabFitsIn(view.dom);
  step("markerTabs");
  syncStructuralPageStartSpacing(
    sheets,
    pages.map((_, index) => {
      const previous = pages[index - 1]?.node.lastChild;
      return previous ? isForcedBreakBlock(previous) : false;
    }),
    copilotLeadingSpacePolicy(view.state),
  );
  for (const sheet of sheets) syncStructuralColumnFlow(sheet);
  step("spacingColumns");
  // Floating tables are drawn where Word puts them, the text wrapped round
  // them (R37-D22; wps-position-parity T04-T06).
  const tableKeepOnPage = {
    wordCompatibilityMode: normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode),
    headerFooter: false,
  };
  const tableFrameOptions = { doNotBreakWrappedTables: view.state.doc.attrs.wordDoNotBreakWrappedTables === true };
  publishTableBothSides(view, sheets.flatMap((sheet) => projectTablePageFrames(sheet, tableKeepOnPage, tableFrameOptions)));
  step("tableFrames");
  for (const sheet of sheets) markBlankLinesPastFloats(sheet);
  step("blankLines");
  // The attribute writes above are changes of their sheets too.
  cache?.flush();
  const docAttrs: unknown = view.state.doc.attrs;
  // `__pageLedgerProjectAll` (development A/B): project every sheet each
  // pass, as before the sheet-by-sheet projection.
  const projectAll = Boolean((view.dom.ownerDocument.defaultView as (Window & { __pageLedgerProjectAll?: boolean }) | null)?.__pageLedgerProjectAll);
  // A progressive pass projects only the sheets it may measure (a sheet
  // past its horizon is projected by the pass that reaches it).
  const projectedIndexes = sheets.flatMap((sheet, index) =>
    (maxSheet === null || index <= maxSheet) &&
    (!cache || projectAll || cache.needsProjection(sheet, pages[index].node, docAttrs)) ? [index] : [],
  );
  const pictured = new Set<number>();
  const footZones = projectedSheetFootZones(view, pages, sheets);
  step("footZones");
  // Compatibility mode 15: a kept paragraph's last lines go on with a
  // follower that cannot start at its column's foot.
  const columnSheetOptions = {
    keepNextCutsLastLines: (normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode) ?? 0) >= 15,
    // Earlier modes (and none) balance a section's columns their own way.
    wordLegacyBalance: (normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode) ?? 0) < 15,
  };
  for (const index of projectedIndexes) projectUnequalColumnSheet(sheets[index], footZones?.[index] ?? 0, columnSheetOptions);
  step("columns");
  for (const pageIndex of projectedIndexes) {
    const page = pages[pageIndex];
    let childPos = page.pos + 1;
    page.node.forEach((child) => {
      if (child.type.name === "image") {
        const dom = view.nodeDOM(childPos);
        if (dom instanceof HTMLElement && dom.parentElement === sheets[pageIndex]) {
          refreshInlineImagePageProjection(child, dom);
          pictured.add(pageIndex);
        }
      } else if (child.isTextblock && child.childCount > 0) {
        // "In Line with Text" pictures among a top-level paragraph's runs get
        // the same page fit before this pass measures their line.
        child.forEach((inline, offset) => {
          if (inline.type.name !== INLINE_PICTURE_NODE_NAME) return;
          const dom = view.nodeDOM(childPos + 1 + offset);
          if (dom instanceof HTMLElement) {
            refreshInlineImagePageProjection(inline, dom);
            pictured.add(pageIndex);
          }
        });
      }
      childPos += child.nodeSize;
    });
  }
  step("pictures");
  for (const index of projectedIndexes) {
    if (pictured.has(index)) projectUnequalColumnSheet(sheets[index], footZones?.[index] ?? 0, columnSheetOptions);
  }
  step("columnsAgain");
  // The projections' own writes are part of the state they produced.
  cache?.flush();
  for (const index of projectedIndexes) cache?.markProjected(sheets[index], pages[index].node);
  // Content-fit Word tables take their widths from the final column tracks;
  // a sheet whose tables they change is projected again next pass. A table
  // past the sheets this pass measures waits for the pass that reaches it.
  projectWordAutofitTables(view, { measureThroughSheet: maxSheet });
  step("autofit");
  // Word gives a merged cell's extra height to the merge's last row, at the
  // widths just projected.
  const rowspanThrough = coldFirstLayout(view.dom.ownerDocument.defaultView) ? maxSheet : null;
  for (const table of projectWordRowspanHeights(view, rowspanThrough)) {
    const sheet = table.closest<HTMLElement>("article[data-page-sheet]");
    if (sheet) cache?.markSheet(sheet);
  }
  step("rowspan");
  if (tracing && performance.now() - startedAt >= 200) {
    traceLedgerPass(view, { projectSteps: { ...steps, sheets: sheets.length, projected: projectedIndexes.length } });
  }
}

/**
 * The footnote zone each column-projected sheet draws at its foot (px): the
 * rows of the notes first referenced on it plus the zone chrome, measured as
 * the ledger charges them. The zone spans the page, so every column of the
 * sheet ends above it (WUA 015: a table's last row was drawn under it).
 * Null when no sheet is projected or the document has no notes.
 */
function projectedSheetFootZones(
  view: EditorView,
  pages: ReadonlyArray<{ node: { childCount: number } }>,
  sheets: readonly HTMLElement[],
): number[] | null {
  if (!sheets.some(sheetProjectsFootZone)) return null;
  if (!sheetedDocHasFootnoteRefs(view.state.doc)) return null;
  const hostSheets = sheets.flatMap((_sheet, index) =>
    Array.from({ length: pages[index]?.node.childCount ?? 0 }, () => index));
  const hosts = hostSheets.map((index) => sheets[index]);
  const reservations = structuralFootnoteReservations(view.state.doc, hosts.length, hosts);
  return reservations
    ? projectedFootZonesPx(
        sheets.length,
        hostSheets,
        reservations,
        sheets.map((sheet) => readCapacity(view, sheet)),
        sheets.map((sheet) => sheetNoteColumns(sheet)?.count ?? 1),
      )
    : null;
}

/**
 * Development check of the sheet-by-sheet projection (with
 * `__pageLedgerVerifyFull`): project every sheet as a cache-less pass would
 * and compare what the projections wrote — the column track rules and the
 * picture fits — with what the incremental pass left in place.
 */
function verifyIncrementalProjection(view: EditorView): unknown {
  const doc = view.dom.ownerDocument;
  const snapshot = () => ({
    rules: unequalColumnProjectionRulesText(doc),
    pictures: Array.from(view.dom.querySelectorAll<HTMLElement>("[data-page-fit-inline-image], [data-page-fit-scale]"))
      .map((element) => `${element.getAttribute("data-page-fit-scale") ?? ""}|${element.style.getPropertyValue("--page-fit-image-width")}|${element.style.getPropertyValue("--page-fit-image-height")}`),
    flows: sheetsOf(view.dom)
      .map((sheet) => `${sheet.getAttribute(UNEQUAL_COLUMN_FLOW_ATTR) ?? ""}`),
  });
  const before = snapshot();
  projectSheetsForMeasurement(view, null);
  const after = snapshot();
  const differences: unknown[] = [];
  if (before.rules !== after.rules) differences.push({ rules: [before.rules.length, after.rules.length] });
  if (before.pictures.join("/") !== after.pictures.join("/")) differences.push({ pictures: [before.pictures.slice(0, 6), after.pictures.slice(0, 6)] });
  if (before.flows.join("/") !== after.flows.join("/")) differences.push({ flows: true });
  return differences.length ? differences : "same";
}

/** Development check of the page-by-page reuse: a harness that sets
 * `window.__pageLedgerVerifyFull` gets every cached pass compared with a
 * full one (atoms and the planned page starts), differences recorded in the
 * ledger trace. */
function verifyCachedPass(
  view: EditorView,
  build: LedgerBuild,
  plan: LedgerPlan,
  planWith: (build: LedgerBuild) => LedgerPlan,
): void {
  const win = view.dom.ownerDocument.defaultView as (Window & { __pageLedgerVerifyFull?: boolean; __pageLedgerTrace?: unknown[] }) | null;
  if (!win?.__pageLedgerVerifyFull) return;
  const full = buildLedger(view, null);
  if (!full) return;
  const round = (value: number) => Math.round(value * 100) / 100;
  const differences: unknown[] = [];
  if (full.atoms.length !== build.atoms.length) differences.push({ atoms: [build.atoms.length, full.atoms.length] });
  full.atoms.forEach((atom, index) => {
    const kept = build.atoms[index];
    if (!kept) return;
    for (const field of ["heightPx", "spaceBeforePx", "spaceAfterPx", "creditPx"] as const) {
      if (round(kept[field]) !== round(atom[field])) differences.push({ atom: index, field, cached: round(kept[field]), full: round(atom[field]) });
    }
    if (kept.hidden !== atom.hidden) differences.push({ atom: index, field: "hidden", cached: kept.hidden, full: atom.hidden });
  });
  const cachedStarts = pageStartAtoms(plan);
  const fullStarts = pageStartAtoms(planWith(full));
  if (cachedStarts.join("/") !== fullStarts.join("/")) differences.push({ pageStarts: { cached: cachedStarts, full: fullStarts } });
  if (Array.isArray(win.__pageLedgerTrace)) {
    win.__pageLedgerTrace.push({ at: Date.now(), cacheCheck: differences.length ? differences.slice(0, 20) : "same", atoms: full.atoms.length, pages: fullStarts.length });
  }
}

export interface LedgerPassOutcome {
  dispatched: boolean;
  converged: boolean;
  /** A page was held against a local alternation: run the plan again. */
  replan?: boolean;
  plan: LedgerPlan | null;
  build: LedgerBuild | null;
  /** What was dispatched is the plan itself (not a repair of a page's
   * overflow): the sheets it keeps are as they were. */
  planApplied?: boolean;
  /** The page whose opening this dispatch held against an alternation
   * (cycleHeld): the page before it refuses to take more from here on. */
  heldPage?: number;
  /** The pass laid out pages [startPage, stopPage) only (ledgerScope); null
   * for a whole-document pass. `yieldedAt` is the page it stopped at with
   * the rest of the document still to lay out; `leaves` the later sheets
   * that changed and are still to be laid out although the pass resynced. */
  scope: { startPage: number; stopPage: number | null; yieldedAt: number | null; leaves: HTMLElement[] } | null;
  /** Leading pages this pass laid out exactly as they stand, from sheets
   * measured as they stand: what the reader sees there is final. */
  stablePages?: number;
  /** The plan reached past the progressive pass's measurement horizon: the
   * next pass measures further (nothing was dispatched). */
  widenHorizon?: boolean;
  /** With `widenHorizon`: the sheets this pass measured anew. Their
   * measurements are kept, so the next build finds them unchanged; they are
   * still to be laid out (the caller makes them pending). */
  unplannedChanged?: readonly HTMLElement[];
}

/** The hollow sheets a pass would lay out: those from its start to its
 * window's end, or every one for a whole-document pass -- under docs-layout
 * only as far as the pass measures (`maxSheet`): the hollow sheets past it
 * are planned from what their blocks keep or the page estimate's guess
 * (buildLedger), and stay hollow. */
function hollowSheetsPlanned(build: LedgerBuild, scoped: { start: { page: number }; windowEnd: number } | null, maxSheet: number | null): number[] {
  const out: number[] = [];
  build.sheets.forEach((sheet, index) => {
    if (!sheet.hasAttribute(HOLLOW_SHEET_ATTR)) return;
    if (maxSheet !== null && index > maxSheet) return;
    if (!scoped || (index >= scoped.start.page && index < scoped.windowEnd)) out.push(index);
  });
  return out;
}

/** The hollow sheets a plan changes: those whose opening, or the next
 * sheet's, it moves (a page past the plan's last is not changed by it). */
function hollowSheetsChanged(build: LedgerBuild, plan: LedgerPlan | null | undefined): number[] {
  if (!plan) return [];
  const planned = pageStartAtoms(plan);
  const current = currentPageStartAtoms(build);
  const out = new Set<number>();
  // Whole blocks moving onto or off a hollow page need nothing of it drawn: the
  // plan stands on what they keep, and the move is the document's. A block the
  // plan cuts anew is cut where its lines are drawn: the sheet holding it now.
  // (Every sheet whose opening moved was drawn before: one move near the top of
  // a settled book drew all of it back, twelve pages a pass, for a minute.)
  const atomOf = (start: string | undefined) => (start ? Number.parseInt(start, 10) : Number.NaN);
  const sheetHolding = (atom: number) => {
    let at = -1;
    for (let index = 0; index < current.length; index += 1) {
      const first = atomOf(current[index]);
      if (Number.isFinite(first) && first <= atom) at = index;
      else if (Number.isFinite(first) && first > atom) break;
    }
    return at;
  };
  const wholeOnly = textEngineEnabled("docs-hollow");
  build.sheets.forEach((sheet, index) => {
    if (!sheet.hasAttribute(HOLLOW_SHEET_ATTR) || index >= planned.length) return;
    const last = index === planned.length - 1;
    const moved = planned[index] !== current[index] || (!last && planned[index + 1] !== current[index + 1]);
    if (!moved) return;
    if (!wholeOnly) {
      out.add(index);
      return;
    }
    // A piece at either end of it (planned, or as it stands) is a cut to make
    // or to take back: drawn, with the sheet now holding the block.
    for (const start of [planned[index], last ? undefined : planned[index + 1], current[index], current[index + 1]]) {
      if (!start || !start.includes("+")) continue;
      out.add(index);
      const holder = sheetHolding(atomOf(start));
      if (holder >= 0 && build.sheets[holder]?.hasAttribute(HOLLOW_SHEET_ATTR)) out.add(holder);
    }
  });
  return [...out].sort((a, b) => a - b);
}

/** Draw these sheets whole again; whether any was hollow. */
function fillHollowSheets(view: EditorView, sheets: readonly number[]): boolean {
  const pages = collectPages(view.state.doc);
  if (!pages) return false;
  const positions = sheets.map((index) => pages[index]?.pos).filter((pos): pos is number => typeof pos === "number");
  if (positions.length === 0) return false;
  setHollowPages(view, { fill: positions });
  return true;
}

export function runLedgerPass(
  view: EditorView,
  cache?: LedgerMeasureCache | null,
  refusals?: LedgerPhysicalRefusals | null,
  passScope?: LedgerPassScope | null,
  /** A progressive pass measures only as far as it can lay out (see
   * LedgerMeasureHorizon); null measures the whole document. */
  measureHorizon?: LedgerMeasureHorizon | null,
  /** Document ranges edits changed since the last pass: a paragraph cut
   * across pages is cut again where one reached its seam. */
  editedRanges?: ReadonlyArray<{ from: number; to: number }> | null,
  /** Whether the pages stand as a kept layout left them: no plan is made. */
  keptStands?: () => boolean,
): LedgerPassOutcome {
  const t0 = performance.now();
  const passEditSeq = authoredEditSeq(view);
  holdRecutRows(view, () => authoredEditSeq(view) === passEditSeq);
  // Footnotes laid out whole (notesAllowProgress) are measured whole too.
  let horizon = measureHorizon && cache && passScope && notesAllowProgress(view) ? measureHorizon : null;
  projectSheetsForMeasurement(view, cache, horizon?.maxSheet ?? null);
  if (cache) {
    const win = view.dom.ownerDocument.defaultView as (Window & { __pageLedgerVerifyFull?: boolean; __pageLedgerTrace?: unknown[] }) | null;
    if (win?.__pageLedgerVerifyFull && Array.isArray(win.__pageLedgerTrace)) {
      win.__pageLedgerTrace.push({ at: Date.now(), projectionCheck: verifyIncrementalProjection(view) });
    }
  }
  // Unequal-width columns: a block straddling a track boundary is cut at the
  // boundary first (an in-sheet seam); the plan then reads the fragments.
  const columnSplit = planUnequalColumnSplit(view, cache);
  if (columnSplit) {
    return { dispatched: dispatchWithinLayout(view, columnSplit), converged: false, plan: null, build: null, scope: null };
  }
  // A page or column break typed inside a list, quote or callout: the
  // container is cut right after it first, so the plan reads a block that
  // ends with the break and closes its page there (WUA 004).
  const breakSplit = view.state.tr;
  if (applyNestedBreakSplits(breakSplit)) {
    breakSplit.setMeta(REBALANCE_META, true).setMeta("addToHistory", false);
    return { dispatched: dispatchWithinLayout(view, breakSplit), converged: false, plan: null, build: null, scope: null };
  }
  const tProjected = performance.now();
  let build = buildLedger(view, cache, horizon);
  let tBuilt = performance.now();
  if (!build) {
    return { dispatched: false, converged: false, plan: null, build: null, scope: null };
  }
  markEditedSeams(view, build, editedRanges);
  markStaleSeams(view, build);
  // A hollow sheet whose blocks have no measurement kept is drawn whole
  // first; the pass runs again once it is.
  if (build.hollowMissing?.length && fillHollowSheets(view, build.hollowMissing)) {
    traceLedgerPass(view, { filledHollow: build.hollowMissing.length, buildMs: Math.round(tBuilt - tProjected), why: build.hollowMissingWhy?.join(" ") });
    return { dispatched: true, converged: false, plan: null, build: null, scope: null };
  }
  // Pages opened from a kept layout, nothing edited, and what was read so far
  // the same: they stand. A plan over them proposes cuts the page once refused
  // (a line that fits by the numbers and not as drawn), and each is drawn, read
  // and taken back: minutes of a book's opening to end where it began.
  if (keptStands?.()) {
    traceLedgerPass(view, { keptStands: true });
    return { dispatched: false, converged: true, plan: null, build, scope: null };
  }
  const unplannedChanged = new Set<HTMLElement>();
  for (let attempt = 0; ; attempt += 1) {
    const planning = planLedgerPass(view, build, refusals, passScope, cache);
    // A pass lays out no page drawn hollow: the ones its window reaches (all
    // of them, for a whole-document pass) are drawn whole first.
    // docs-layout: a hollow sheet's blocks all keep their measurements here
    // (a missing one had its sheet drawn whole above), so only the hollow
    // sheets the plan changes -- whose opening or the next one's it moves,
    // where it may cut a block -- are drawn whole first. Every hollow sheet
    // the window reached was before: settled, a whole-document pass drew
    // the whole book again when the reader jumped to its end (DOM 394 nodes
    // to 94k).
    const reached = textEngineEnabled("docs-layout")
      ? hollowSheetsChanged(build, planning.plan)
      : hollowSheetsPlanned(build, planning.scoped, null);
    if (reached.length && fillHollowSheets(view, reached)) {
      return { dispatched: true, converged: false, plan: null, build: null, scope: null };
    }
    const reach = build.horizon;
    // The plan reached past the measured blocks (pages shorter than the
    // horizon assumed): measure further and plan again; the third time, the
    // whole document.
    if (!reach || reach.firstEstimated === null || planning.estimatedReads === 0) {
      const hollowFrom = horizon && textEngineEnabled("docs-layout")
        ? Math.max(horizon.maxSheet, passScope?.visible?.last ?? 0) + 3
        : null;
      return finishLedgerPass(view, build, planning, refusals, cache, { t0, tProjected, tBuilt }, hollowFrom);
    }
    if (ledgerTraceEnabled(view)) traceLedgerPass(view, { horizonExceeded: { attempt, firstEstimated: reach.firstEstimated, why: reach.firstEstimatedWhy ?? null, whys: reach.unknownWhys ?? null, horizon } });
    // A progressive pass asks for a wider horizon on the next frame instead
    // of measuring further now: the pages it would add have not had their
    // formulas typeset or their line metrics projected (the frame does that
    // before it measures), and measured as they stand they would keep the
    // TeX placeholders' few pixels per line for good.
    //
    // The sheets this build measured anew go with it: their measurements are
    // kept, so the next build finds them unchanged and its pass would start
    // after them, keeping them as they stand -- composed before any pass laid
    // them out. (R01-D13, three columns a page: its first twelve sheets kept
    // the provisional one column's worth of text each, 42 pages against
    // Word's 18.)
    if (horizon && Number.isFinite(planning.estimatedReads)) {
      return { dispatched: false, converged: false, plan: null, build, scope: null, widenHorizon: true, unplannedChanged: [...unplannedChanged, ...build.changedSheets] };
    }
    for (const sheet of build.changedSheets) unplannedChanged.add(sheet);
    horizon = horizon && attempt < 2 && Number.isFinite(planning.estimatedReads)
      ? { fromSheet: horizon.fromSheet, budgetPx: horizon.budgetPx * 2, maxSheet: horizon.fromSheet + (horizon.maxSheet - horizon.fromSheet) * 2 + 2 }
      : null;
    if (horizon) projectSheetsForMeasurement(view, cache, horizon.maxSheet);
    else projectSheetsForMeasurement(view, cache, null);
    const rebuilt = buildLedger(view, cache, horizon);
    tBuilt = performance.now();
    if (!rebuilt) return { dispatched: false, converged: false, plan: null, build: null, scope: null };
    // The sheets the builds before measured anew changed in this pass too.
    const changedSheets = new Set(rebuilt.changedSheets);
    for (const sheet of unplannedChanged) changedSheets.add(sheet);
    build = { ...rebuilt, changedSheets };
    markEditedSeams(view, build, editedRanges);
    markStaleSeams(view, build);
  }
}

/** How near a seam (document positions, ~a line of text) an edit makes the
 * paragraph's rows on either side of it stale. */
const EDITED_SEAM_REACH = 256;
/** Edit ranges kept for the next pass, at most (a run of keys is one area). */
const MAX_TRACKED_EDITS = 32;

interface LedgerEditState {
  ranges: Array<{ id: number; from: number; to: number }>;
  seq: number;
  /** Whole-document hydrations applied (READ_ONLY_TRUSTED_MUTATION_META
   * "hydration-content"): the view looks whether its initial settle was had
   * by the empty document before one. */
  hydrations?: number;
}

/**
 * Whether a page seam an edit came near has to be cut again: not when the
 * paragraph's joined text still starts a row where the tail starts.
 *
 * An edit near a seam used to cut it again whatever it changed: the head's
 * last row went to the next page and the pass after took it back. Every key
 * typed within some six rows of the seam (the end of a paragraph that had
 * just run on to the next page: where one types) moved the last row of the
 * page before down and up again, a second apart on a document whose pass
 * waits for a pause; and the pass that took it back read as putting the last
 * one's pages back, so every other key left the row on the next page (9 rows
 * and 2, then 8 and 3, then 7 and 4 for a frame and 9 and 2 again). Only an
 * edit that changes where the rows break at the seam needs the cut made
 * again -- a space typed or deleted there, text deleted above that leaves the
 * head's last row room for the tail's first word -- and the joined text laid
 * out off-screen says which (joinedTextBreaksAtSeam).
 *
 * `window.__docsEditedSeamProbeOff = true` cuts every seam an edit came near
 * again, as before (an A/B of one build).
 */
export function editedSeamNeedsRecut(
  head: { readonly dom: HTMLElement; readonly hollow?: boolean },
  tail: { readonly dom: HTMLElement; readonly hollow?: boolean },
  breaksAtSeam: (head: HTMLElement, tail: HTMLElement) => boolean | null = (h, t) => joinedTextBreaksAtSeam(h, t),
): boolean {
  if (head.hollow || tail.hollow) return true;
  const win = head.dom.ownerDocument?.defaultView as (Window & { __docsEditedSeamProbeOff?: boolean }) | null | undefined;
  if (win?.__docsEditedSeamProbeOff === true) return true;
  try {
    return breaksAtSeam(head.dom, tail.dom) !== true;
  } catch {
    return true;
  }
}

/** Mark the page seams of paragraphs cut across pages that an edit reached
 * and left stale (LogicalBlock.editedSeams). */
function markEditedSeams(view: EditorView, build: LedgerBuild, ranges: ReadonlyArray<{ from: number; to: number }> | null | undefined): void {
  if (!ranges || ranges.length === 0) return;
  for (const block of build.logical) {
    if (block.kind !== "text" || block.parts.length < 2) continue;
    let seams: Set<number> | null = null;
    for (let index = 1; index < block.parts.length; index += 1) {
      const head = block.parts[index - 1];
      const tail = block.parts[index];
      if (head.sheet === tail.sheet) continue;
      const headEnd = head.pos + head.node.nodeSize - 1;
      const tailStart = tail.pos + 1;
      if (ranges.some((range) => range.to >= headEnd - EDITED_SEAM_REACH && range.from <= tailStart + EDITED_SEAM_REACH) &&
          editedSeamNeedsRecut(head, tail, (h, t) => joinedTextBreaksAtSeam(h, t, (copy) => engineJoinedRows(view, head, tail, copy)))) {
        (seams ??= new Set()).add(index);
      }
    }
    if (seams) block.editedSeams = seams;
  }
}

/**
 * Page seams of a paragraph whose head ends a row short of the tail's first
 * word: a cut made at a row end the lines have since left (a line pulled up
 * by the justified-space shrink, a hyphen withheld, a face that arrived after
 * the cut). Word breaks a paragraph's lines first and its page after a line;
 * here the cut stood where it was made, inside what is now one line, and
 * which earlier line breaking it was made under decided the page boundary
 * (R283-D05: "content this paper" on page 2 or 3 on as many opens). Such a
 * seam is re-cut from the joined text, as an edited one is. Each seam (block,
 * text offset) is re-cut once until the layout's inputs change, so a
 * measurement that keeps reading a fit cannot cut the same seam forever.
 */
const recutStaleSeams = new WeakMap<EditorView, Set<string>>();
/**
 * Seams marked stale by this pass, counted as re-cut only once the pass
 * plans (finishLedgerPass). A pass that measures further first builds its
 * ledger again and marks again: counted at the first marking, the second
 * build found every seam tried and planned the old cut, and the re-cut never
 * reached a plan (corpus R425-D02: "…annual capacity of" ended page 1's
 * second column, its justified spaces 4x wide, with "25 million." on page 2;
 * Word sets both on one line).
 */
const staleSeamsThisPass = new WeakMap<EditorView, Set<string>>();

/** `window.__docsStaleSeamEarlyTriedOff = true`: a stale seam counts as
 * re-cut when it is marked, as before (an A/B of one build). */
function staleSeamTriedAtMark(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsStaleSeamEarlyTriedOff?: boolean }) | null)?.__docsStaleSeamEarlyTriedOff === true;
}

export function noteStaleSeamTry(view: EditorView, key: string): void {
  let into = staleSeamTriedAtMark(view) ? recutStaleSeams.get(view) : staleSeamsThisPass.get(view);
  if (!into) {
    into = new Set();
    (staleSeamTriedAtMark(view) ? recutStaleSeams : staleSeamsThisPass).set(view, into);
  }
  into.add(key);
}

/** The seams this pass marked count as re-cut from now on. */
export function commitStaleSeamTries(view: EditorView): void {
  const marked = staleSeamsThisPass.get(view);
  if (!marked) return;
  staleSeamsThisPass.delete(view);
  let tried = recutStaleSeams.get(view);
  if (!tried) recutStaleSeams.set(view, (tried = new Set()));
  for (const key of marked) tried.add(key);
}

/** Whether a stale seam was re-cut already (markStaleSeams skips it). */
export function staleSeamTried(view: EditorView, key: string): boolean {
  return recutStaleSeams.get(view)?.has(key) === true;
}

function markStaleSeams(view: EditorView, build: LedgerBuild): void {
  const tried = recutStaleSeams.get(view);
  // Word narrows a justified row's spaces to keep a word (compatibility mode 15,
  // justifiedSpaceShrink); the text engine keeps its kept words itself.
  const mode = normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode);
  const narrows = mode !== null && mode >= 15 && !textEngineEnabled("docs");
  const rows = staleRowSeamsOn(view);
  for (const block of build.logical) {
    if (rows && block.kind === "table" && block.parts.length >= 2) {
      let keep: Map<number, number> | null = null;
      for (let index = 1; index < block.parts.length; index += 1) {
        const head = block.parts[index - 1];
        const tail = block.parts[index];
        if (head.sheet === tail.sheet || tail.columnSeamBefore || head.hollow || tail.hollow) continue;
        if (!build.changedSheets.has(build.sheets[head.sheet]) && !build.changedSheets.has(build.sheets[tail.sheet])) continue;
        const seam = existingSeamKey(block, index - 1) ?? "";
        if (!seam.includes(":within")) continue;
        const id = block.parts[0].node.attrs?.[MRNOTE_BLOCK_ID_ATTR];
        // The seam's key carries its head's signature: a cut made again is
        // another seam, read once more; the same cut is read once.
        const key = `${typeof id === "string" ? id : block.parts[0].pos}:${seam}`;
        if (tried?.has(key)) continue;
        const px = staleRowSeamKeepPx(head.dom, tail.dom, narrows, paginationLayoutScale(head.dom).y);
        if (px === null) continue;
        noteStaleSeamTry(view, key);
        (keep ??= new Map()).set(index, px);
      }
      if (keep) block.staleRowKeepPx = keep;
      continue;
    }
    if (block.kind !== "text" || block.parts.length < 2) continue;
    let offset = 0;
    let seams: Set<number> | null = null;
    for (let index = 1; index < block.parts.length; index += 1) {
      const head = block.parts[index - 1];
      const tail = block.parts[index];
      offset += head.node.content.size;
      if (head.sheet === tail.sheet || tail.columnSeamBefore || head.hollow || tail.hollow) continue;
      if (block.editedSeams?.has(index)) continue;
      if (!build.changedSheets.has(build.sheets[head.sheet]) && !build.changedSheets.has(build.sheets[tail.sheet])) continue;
      const id = block.parts[0].node.attrs?.[MRNOTE_BLOCK_ID_ATTR];
      const key = `${typeof id === "string" ? id : block.parts[0].pos}:${offset}`;
      if (tried?.has(key)) continue;
      if (!headRowTakesTailWord(head.dom, tail.dom, narrows)) continue;
      noteStaleSeamTry(view, key);
      (seams ??= new Set(block.editedSeams ?? [])).add(index);
    }
    if (seams) block.editedSeams = seams;
  }
}

/** Table row cuts are read for stale cell rows (staleRowSeamKeepPx);
 * `window.__docsStaleRowSeamOff = true` reads text seams only, as before. */
function staleRowSeamsOn(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsStaleRowSeamOff?: boolean }) | null;
  return win?.__docsStaleRowSeamOff !== true;
}

interface LedgerPlanning {
  plan: LedgerPlan | null;
  planned: LedgerPlan | null;
  scoped: ReturnType<typeof resolvePassScope>;
  currentStarts: string[];
  noteChromePx: number;
  estimatedReads: number;
  tPlanned: number;
  /** No page geometry at all: nothing can be planned. */
  noGeometry: boolean;
}

/** Column sheets up to which a document's note zones are read from the plan. */
const FOOT_ZONE_PLAN_MAX_SHEETS = 40;

/** `window.__docsFootZonesFromLayout = true` (A/B): a column page's footnote
 * zone is read from where the fragments stand, as before, not from the plan. */
function footZonesFromLayout(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsFootZonesFromLayout?: boolean }) | null)?.__docsFootZonesFromLayout === true;
}

/**
 * Whether a zone note's reference stands before a planned cut of its block.
 * A text cut says where it falls. Any other (a table's rows, a list's items)
 * is held against the fragments as they stand: before a seam the cut is, or
 * in a fragment up to the one the cut is planned in.
 */
export function zoneNoteBeforeCut(
  block: LogicalBlock | undefined,
  note: { logicalOffset: number; partIndex: number },
  cut: LedgerCut,
): boolean {
  const payload = cut.payload as { logicalOffset?: unknown; partIndex?: unknown } | null | undefined;
  if (cut.kind === "text") {
    if (typeof payload?.logicalOffset === "number") return note.logicalOffset < payload.logicalOffset;
    const at = /^text:(\d+)$/.exec(cut.key);
    if (at) return note.logicalOffset < Number(at[1]);
  }
  if (block) {
    for (let seam = 0; seam < block.parts.length - 1; seam += 1) {
      if (existingSeamKey(block, seam) === cut.key) return note.partIndex <= seam;
    }
  }
  return typeof payload?.partIndex === "number" ? note.partIndex <= payload.partIndex : true;
}

/** Plan one pass from its build: scope, planner, the composed plan. */
function planLedgerPass(
  view: EditorView,
  build: LedgerBuild,
  refusals: LedgerPhysicalRefusals | null | undefined,
  passScope: LedgerPassScope | null | undefined,
  cache: LedgerMeasureCache | null | undefined,
): LedgerPlanning {
  const capacities = build.capacities;
  // No page geometry at all (no sheet height): nothing can be planned.
  if (capacities.some((capacity) => !(capacity > 0))) {
    return { plan: null, planned: null, scoped: null, currentStarts: [], noteChromePx: 0, estimatedReads: 0, tPlanned: performance.now(), noGeometry: true };
  }
  const leading = copilotLeadingSpacePolicy(view.state);
  const breakBefore = refusals?.breakBefore(view.state.doc, build);
  // Pages the physical verifier found the plan measured short (repairShortfallOn).
  const shortfalls = refusals?.shortfalls(build, authoredEditSeq(view));
  const shortOf = (index: number): number => (shortfalls?.size ? shortfalls.get(index) ?? 0 : 0);
  // Continued footnotes: the zone chrome a page with continued rows pays,
  // and the body text it keeps above them (two note rows' worth).
  const noteChromePx = Math.max(0, ...build.logical.flatMap((block) => block.parts.map((part) => part.noteChromePx)));
  const notePitchPx = Math.max(0, ...build.atoms.map((atom) => atom.notePitchPx ?? 0));
  const currentStarts = currentPageStartAtoms(build);
  // A settled document is laid out from the first page the edit can have
  // changed, the reader's pages first (ledgerScope). Continued footnote rows
  // carry across pages: a document with notes is laid out from a page no rows
  // are carried into and resyncs only at such a page (notesAllowProgress; laid
  // out whole, R286-D01 took 15 whole passes, 1,866 pages, to settle 125).
  const hasNotes = sheetedDocHasFootnoteRefs(view.state.doc);
  const noteScope = hasNotes && (footnoteScopeEnabled(view) || notesAllowProgress(view));
  const carriedInto = noteScope ? sheetsCarriedInto(view) : null;
  const scoped = passScope && cache && (!hasNotes || noteScope)
    ? resolvePassScope(build, passScope, carriedInto)
    : null;
  if (passScope && !scoped && ledgerTraceEnabled(view)) {
    traceLedgerPass(view, {
      scopeSkipped: {
        changed: build.sheets.filter((sheet) => build.changedSheets.has(sheet)).length,
        sheets: build.sheets.length,
        pending: passScope.pending.size,
        cache: Boolean(cache),
        notes: sheetedDocHasFootnoteRefs(view.state.doc),
        lastClear: cache?.lastClear ?? null,
        why: build.sheets.map((sheet, index) => [index, build.changedWhy.get(sheet) ?? null] as const).filter(([, why]) => why !== null).slice(0, 6),
      },
    });
    if (cache) cache.lastClear = null;
  }
  const standingCapacity = (index: number): number =>
    Math.max(0, (capacities[Math.min(index, capacities.length - 1)] ?? capacities[capacities.length - 1] ?? 0) - shortOf(index));
  const planPages = (
    source: LedgerBuild,
    capacityFor: (index: number) => number,
    oracle: LedgerSplitOracle = source.oracle,
    /** The plan may end at a page this says is past what is asked of it. */
    endsAt: ((page: number) => boolean) | null = null,
  ) => {
    const own = scoped && source === build ? scoped : null;
    // (A plan made more than once in a pass says where it resynced each time.)
    if (own) own.resyncLeaves = [];
    const scopedStop = own
      ? scopedStopAt(build, own, currentStarts, carriedInto, hasNotes && resyncsOnlyLaidOut(view) ? pagesLaidOut(view) : null)
      : null;
    const stopAt: LedgerCutOptions["stopAt"] = scopedStop || endsAt
      ? (page, atom, from) => scopedStop?.(page, atom, from) ?? (endsAt?.(page) ? "yield" : null)
      : undefined;
    return planLedgerPages(source.atoms, {
      ...(breakBefore?.size ? { breakBefore } : {}),
      noteContinuationChromePx: noteChromePx,
      noteContinuationMinBodyPx: notePitchPx * 2,
      capacityFor,
      sectionCapacityFor: sectionCapacityForPlan(source, sectionColumnPage(view)),
      columnsFor: (index) => source.columns[Math.min(index, source.columns.length - 1)] ?? 1,
      columnBandTopsFor: (index) => source.bandTops?.[index] ?? null,
      ...(bandCreditStaysOff(view) ? {} : {
        footCreditBlockedFor: (index: number) => source.bandFloored?.[Math.min(index, (source.bandFloored?.length ?? 1) - 1)] === true,
      }),
      preserveLeadingSpace: (index, forced, tail) => (index < leading.length ? leading[index] : index === 0 || (forced && !tail)),
      gapPx: view.state.doc.attrs?.wordSpacingAddsUp === true ? ledgerAddedGapPx : ledgerGapPx,
      oracle,
      keepChainBacksUp: (normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode) ?? 0) >= 15,
      wordLegacyBalance: (normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode) ?? 0) < 15,
      ...(own ? { start: scopedPlanStart(own.start, hasNotes ? notesCarryLeadingAfter(view) : null) } : {}),
      ...(stopAt ? { stopAt } : {}),
    });
  };
  // A column page's note zone comes off its capacity. Read from the plan
  // (ledgerFootZonePlan), not from where the fragments stand: the capacity no
  // longer follows the layout it is used to make (R372-D01).
  const planWith = (source: LedgerBuild) => {
    const footZones = footZonesFromLayout(view) ? null : source.footZones ?? null;
    const zoneSheetCount = footZones ? footZones.zoneSheets.filter(Boolean).length : 0;
    // Each try plans the document from its start as far as the page it is
    // settling (ledgerFootZonePlan): a long document of column pages keeps
    // the zones as they stand until a page can be planned again by itself.
    // By the sheets, so every pass of a document reads its zones the same
    // way. No note on a column page: nothing to find.
    if (!footZones || footZones.notes.size === 0 || zoneSheetCount > FOOT_ZONE_PLAN_MAX_SHEETS) return planPages(source, standingCapacity);
    const last = footZones.zoneSheets.length - 1;
    const sheetOf = (page: number): number => Math.min(page, last);
    const tZones = performance.now();
    // The pages above the one being tried are planned the same every time:
    // within this pass a cut asked for twice is the cut it was.
    const asked = new Map<string, LedgerCut | null>();
    const r = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : String(value));
    const oracle: LedgerSplitOracle = {
      planHead(request) {
        const key = `${request.atom.index}|${r(request.availablePx)}|${r(request.fullCapacityPx)}|${request.pageEmpty ? 1 : 0}|${request.keepReleased ? 1 : 0}|${request.from ? `${request.from.key}@${r(request.from.headHeightPx)}@${r(request.from.tailHeightPx)}` : "-"}`;
        const known = asked.get(key);
        if (known !== undefined) return known;
        const answer = source.oracle.planHead(request);
        asked.set(key, answer);
        return answer;
      },
    };
    const forcedHead = source.oracle.forcedHead?.bind(source.oracle);
    if (forcedHead) oracle.forcedHead = forcedHead;
    const zoned = planWithFootZones({
      plan: (zoneOf, through) => {
        let truncated = false;
        const plan = planPages(source, (index) => {
          const sheet = sheetOf(index);
          if (!footZones.zoneSheets[sheet]) return standingCapacity(index);
          return Math.max(0, (footZones.baseCapacities[sheet] ?? 0) - zoneOf(index) * (source.columns[sheet] ?? 1) - shortOf(index));
        }, oracle, (page) => {
          if (page > through) truncated = true;
          return truncated;
        });
        return { plan, truncated };
      },
      firstPage: scoped && source === build ? scoped.start.page : 0,
      zonePage: (page) => footZones.zoneSheets[sheetOf(page)] === true,
      nextZonePage: (from) => {
        for (let page = from; page <= last; page += 1) if (footZones.zoneSheets[page]) return page;
        return footZones.zoneSheets[last] ? Math.max(from, last + 1) : null;
      },
      notesOf: (atom) => footZones.notes.get(atom),
      noteBeforeCut: (atom, note, cut) => zoneNoteBeforeCut(source.logical[atom], note, cut),
      zonePx: (page, notes) => {
        const sheet = sheetOf(page);
        return projectedFootZonesPx(
          1,
          notes.map(() => 0),
          notes.map((note) => ({
            totalPx: note.heightPx > 0 ? note.heightPx + note.chromePx : 0,
            chromePx: note.chromePx,
            pitches: new Map([[note.id, note.pitchPx]]),
          })),
          [(footZones.baseCapacities[sheet] ?? 0) / Math.max(1, source.columns[sheet] ?? 1)],
          [footZones.noteColumns[sheet] ?? 1],
        )[0] ?? 0;
      },
    });
    if (ledgerTraceEnabled(view)) {
      traceLedgerPass(view, {
        footZonePlan: {
          plans: zoned.plans,
          settled: zoned.settled,
          ms: Math.round(performance.now() - tZones),
          cuts: asked.size,
          zones: [...zoned.zones.entries()].filter(([, px]) => px > 0).map(([page, px]) => [page + 1, Math.round(px * 100) / 100]),
        },
      });
    }
    // The zones would not settle: as before, the zones where the fragments stand.
    return zoned.settled ? zoned.plan : planPages(source, standingCapacity);
  };
  // A whole-document plan reads every atom: one left unmeasured voids it
  // before it is even made.
  if (!scoped && build.horizon && build.horizon.firstEstimated !== null) {
    return { plan: null, planned: null, scoped, currentStarts, noteChromePx, estimatedReads: Number.POSITIVE_INFINITY, tPlanned: performance.now(), noGeometry: false };
  }
  const readsBefore = build.horizon?.reads() ?? 0;
  const planned = planWith(build);
  const estimatedReads = (build.horizon?.reads() ?? 0) - readsBefore;
  const plan = scoped ? composeScopedPlan(build, planned, scoped.start, hasNotes && laidOutNotesKept(view) ? standingNotesOf(view) : null) : planned;
  const tPlanned = performance.now();
  if (cache && !scoped && !build.horizon) verifyCachedPass(view, build, plan, planWith);
  return { plan, planned, scoped, currentStarts, noteChromePx, estimatedReads, tPlanned, noGeometry: false };
}

function finishLedgerPass(
  view: EditorView,
  build: LedgerBuild,
  planning: LedgerPlanning,
  refusals: LedgerPhysicalRefusals | null | undefined,
  _cache: LedgerMeasureCache | null | undefined,
  times: { t0: number; tProjected: number; tBuilt: number },
  /** docs-hollow: the first page index the plan may leave hollow (past what
   * the pass measured and the reader's pages); null keeps every page whole. */
  hollowFrom: number | null = null,
): LedgerPassOutcome {
  commitStaleSeamTries(view);
  if (planning.noGeometry || !planning.plan || !planning.planned) {
    return { dispatched: false, converged: true, plan: null, build, scope: null };
  }
  const { plan, planned, scoped, currentStarts, noteChromePx, tPlanned } = planning;
  const { t0, tProjected, tBuilt } = times;
  const capacities = build.capacities;
  const stopPage = planned.stop ? planned.stop.page : null;
  const yieldedAt = planned.stop?.kind === "yield" ? planned.stop.page : null;
  const leaves = scoped && planned.stop?.kind === "resync"
    ? scoped.resyncLeaves.map((index) => build.sheets[index]).filter((sheet): sheet is HTMLElement => Boolean(sheet))
    : [];
  const scopeOutcome = scoped ? { startPage: scoped.start.page, stopPage, yieldedAt, leaves } : null;
  // Pages still to lay out after this pass: the one it yielded at, a changed
  // sheet a resync left behind, or a pending page beyond where it stopped.
  // Until they are done the layout is not settled: no physical
  // verification, no footnote publication.
  const laterPending = yieldedAt !== null || leaves.length > 0 ||
    (scoped !== null && stopPage !== null && scoped.pendingPages.some((pending) => pending >= stopPage));
  const plannedStarts = pageStartAtoms(plan);
  let stablePages = 0;
  const laidOut = Math.min(stopPage ?? plannedStarts.length, plannedStarts.length);
  // A page is stable when this pass, measuring its fragments as they stand
  // (a sheet that changed was measured again in this build), planned it
  // exactly as it is. Requiring the sheet to be unchanged as well never
  // revealed a book whose cover page something restyles on every frame.
  while (
    stablePages + 1 < laidOut &&
    plannedStarts[stablePages] === currentStarts[stablePages] &&
    plannedStarts[stablePages + 1] === currentStarts[stablePages + 1]
  ) stablePages += 1;
  const same =
    currentStarts.length === plannedStarts.length &&
    currentStarts.every((start, index) => start === plannedStarts[index]) &&
    plan.pages.every((page, index) => {
      // Every placement must correspond to a fragment that already exists —
      // a planned NEW cut inside a whole block is a difference even when the
      // page starts agree.
      const last = page.placements[page.placements.length - 1];
      if (!last?.to) return true;
      const block = build.logical[last.atom];
      return block.parts.some((part, partIndex) => partIndex > 0 && part.sheet === index + 1 && part.childIndex === 0 && existingKeyMatches(block, partIndex - 1, last.to!.key));
    });
  if (same && ledgerTraceEnabled(view)) {
    traceLedgerPass(view, {
      same: true,
      laterPending,
      ...(scopeOutcome ? { scope: scopeOutcome, pendingPages: scoped?.pendingPages, stop: planned.stop ? { kind: planned.stop.kind, page: planned.stop.page } : null } : {}),
      measuredAgain: build.sheets.map((sheet, index) => [index, build.changedWhy.get(sheet) ?? null] as const).filter(([, why]) => why !== null).slice(0, 4),
      currentStarts,
      plannedUsed: plan.pages.map((page) => Math.round(page.usedPx)),
      capacities: plan.pages.map((page) => Math.round(page.capacityPx)),
    });
  }
  // A scoped pass verifies the pages it laid out (a long document's pages are
  // verified window by window as the background lays them out, never all of
  // them at the end: reading every page lays out every page); a whole pass
  // verifies every page.
  const verifyRange = scoped ? { from: scoped.start.page, to: stopPage ?? build.sheets.length } : null;
  // The pages this plan laid out, as they stand once it is the layout.
  const recordLaidOut = () => {
    markLaidOutPages(view, scoped ? scoped.start.page : 0, yieldedAt);
    recordLaidOutNotes(view, plan, scoped ? scoped.start.page : 0, yieldedAt);
  };
  if (same) recordLaidOut();
  if (same && laterPending) {
    const repaired = repairPhysicalOverflow(view, refusals, overTallSheetsOf(plan, build), build.changedSheets, verifyRange, { starts: currentStarts, capacities, plannedUsed: plannedUsedAsStanding(plan, currentStarts) });
    return { dispatched: repaired, converged: false, plan, build, scope: scopeOutcome, stablePages };
  }
  if (same) {
    // The document already is the plan: verify the painted pages and push
    // any lossless suffix that physically spills (the safety net for
    // geometry the atoms could not foresee).
    const overTall = overTallSheetsOf(plan, build);
    const range = verifyRange && notesVerifyEvery(view) ? null : verifyRange;
    const repaired = repairPhysicalOverflow(view, refusals, overTall, build.changedSheets, range, { starts: currentStarts, capacities, plannedUsed: plannedUsedAsStanding(plan, currentStarts) });
    if (!repaired) {
      publishOverTallSheets(view, build, overTall, scoped ? scoped.start.page : 0, stopPage);
      publishContinuedFootnotes(view, plan, build, noteChromePx);
    }
    return { dispatched: repaired, converged: !repaired, plan, build, scope: scopeOutcome, stablePages };
  }
  const result = reconcileLedgerPlan(view.state.tr, plan, build.logical, () => view.state.tr);
  const tReconciled = performance.now();
  traceLedgerPass(view, {
    timing: { project: Math.round(tProjected - t0), build: Math.round(tBuilt - tProjected), plan: Math.round(tPlanned - tBuilt), reconcile: Math.round(tReconciled - tPlanned) },
    ...(scopeOutcome ? { scope: scopeOutcome, stablePages } : {}),
    measuredAgain: build.sheets.map((sheet, index) => [index, build.changedWhy.get(sheet) ?? null] as const).filter(([, why]) => why !== null).slice(0, 4),
    currentStarts,
    plannedStarts,
    mergedSeams: result.mergedSeams,
    splits: result.splits,
    moves: result.moves,
    refusedCuts: result.refusedCuts,
    changed: result.changed,
    overflowingAtoms: plan.overflowingAtoms,
    plannedUsed: plan.pages.map((page) => Math.round(page.usedPx)),
    capacities: plan.pages.map((page) => Math.round(page.capacityPx)),
    steps: result.steps,
    pages: plan.pages.map((page) => page.placements.map((p) => `${p.atom}${p.from ? "[" + p.from.key + "]" : ""}${p.to ? "->" + p.to.key + "@" + Math.round(p.to.headHeightPx) : ""}`)),
    atoms: build.atoms.map((a) => [a.index, Math.round(a.heightPx * 10) / 10, Math.round(a.spaceBeforePx), Math.round(a.spaceAfterPx), a.kind, build.logical[a.index].parts.length,
      // A section's columns and, where they differ in width, the atom's
      // height in each (see ledgerCut).
      ...(a.sectionColumns && a.sectionColumns > 1 ? [a.sectionColumns, a.regionHeightsPx?.map((height) => Math.round(height * 10) / 10) ?? null, a.regionWhole === true, a.splittable, a.keepNext, Math.round(a.creditPx * 10) / 10] : [])]),
  });
  if (!result.changed) {
    recordLaidOut();
    if (laterPending) return { dispatched: false, converged: false, plan, build, scope: scopeOutcome, stablePages };
    publishOverTallSheets(view, build, overTallSheetsOf(plan, build), scoped ? scoped.start.page : 0, stopPage);
    publishContinuedFootnotes(view, plan, build, noteChromePx);
    return { dispatched: false, converged: true, plan, build, scope: scopeOutcome, stablePages };
  }
  // This plan puts back what the last pass replaced, on the document that
  // pass produced: the two layouts would alternate. The one that opens the
  // page where they differ earlier (the block moved whole to the next page,
  // as Word moves a list item that does not fit) is kept, and its boundary
  // is held like one the physical verifier settled: the next plan keeps it.
  const repaired = lastPhysicalRepair.get(view);
  // (On the document the repair left, or one only the layout's own outputs
  // changed since: see `sameInputs` below.)
  // A scoped pass of a document with footnotes compares the pages it puts
  // back (putsPagesBack): its plan past a yield is the sheets as they stand,
  // which the parts and passes since the repair moved, and the whole layouts
  // never compared equal (R205-D04 under `__docsFootnoteProgressive`: the
  // cover page's repair undone two passes later, its figure over its foot for
  // good).
  const repairPutBack = Boolean(repaired) && (repaired!.before.join("/") === plannedStarts.join("/") ||
    (scoped !== null && repairPutBackLocal(view) && sheetedDocHasFootnoteRefs(view.state.doc) && putsPagesBack(repaired!.before, plannedStarts, currentStarts)));
  if (repaired && (repaired.doc === view.state.doc || repaired.editSeq === authoredEditSeq(view)) &&
      repairPutBack &&
      repairedPagesUnchanged(repaired.capacities, capacities, plannedStarts, currentStarts)) {
    traceLedgerPass(view, { repairHeld: { kept: currentStarts, refused: plannedStarts } });
    // A scoped pass with pages still to lay out (a yield behind it): the
    // pages after the held one stand as an earlier layout left them, never
    // laid out with the repair in. The repaired page is held as a refusal and
    // the plan made again around it, once per layout (R205-D04 under
    // `__docsFootnoteProgressive`: its pages 24 on kept from before the cover
    // page's repair, 38-59 a page off).
    if (scoped && refusals && scoped.pendingPages.length > 0 && repairPutBackLocal(view) &&
        sheetedDocHasFootnoteRefs(view.state.doc) && !repairReplanned.has(view.state.doc)) {
      const page = plannedStarts.findIndex((start, index) => start !== currentStarts[index]);
      if (page >= 1 && parseOpening(currentStarts[page] ?? "")?.whole) {
        repairReplanned.add(view.state.doc);
        refusals.record(view.state.doc, [{ sheet: page - 1, capacityPx: capacities[page - 1] ?? 0 }]);
        traceLedgerPass(view, { repairHeldGoesOn: { page, pending: scoped.pendingPages.length } });
        return { dispatched: false, converged: false, plan, build, scope: scopeOutcome, stablePages, replan: true };
      }
    }
    publishOverTallSheets(view, build, overTallSheetsOf(plan, build), scoped ? scoped.start.page : 0, stopPage);
    publishContinuedFootnotes(view, plan, build, noteChromePx);
    return { dispatched: false, converged: !laterPending, plan, build, scope: scopeOutcome, stablePages };
  }
  const last = lastLedgerDispatch.get(view);
  // The document the last pass produced, or one only the layout's own
  // outputs have changed since (a page number, a continued note, a table's
  // page frame -- nothing an author did): R286-D01 alternated two layouts of
  // its pages 8-10 for 70 passes, each one rebuilding every page after them,
  // because something published after every dispatch made the document a
  // new one and no plan was ever read as putting the last one back.
  //
  // On those inputs the pages as they stand ARE what the last pass's plan
  // came to, whether or not it came to that plan exactly: a plan putting back
  // the openings that pass replaced is the alternation, compared with the
  // pages as they stand. Requiring the standing pages to read as the plan
  // read missed every alternation whose dispatch landed a seam or a later
  // page a little differently from its plan (R286-D01: never held once).
  const sameInputs = Boolean(last) && (last!.doc === view.state.doc || last!.editSeq === authoredEditSeq(view) ||
    editLeavesOpeningInputs(last!, view.state.doc, build, plannedStarts, currentStarts));
  // (Taking back the rows a seam cut again sent on is that cut's second
  // half: read as an alternation, the row stayed on the next page.)
  const afterSeamRecut = last?.seamRecut === true && !seamRecutPutBackHeld(view);
  const putsBackWhole = Boolean(last && sameInputs && !afterSeamRecut && last.before.join("/") === plannedStarts.join("/"));
  const putsBackLocally = Boolean(last && sameInputs && !afterSeamRecut && !putsBackWhole && putsPagesBack(last.before, plannedStarts, currentStarts));
  const putsBack = putsBackWhole || putsBackLocally;
  // Putting back what the last pass replaced is a cycle only when the pages
  // above the change still have the room that pass planned with. A header
  // whose band was measured after the first pass took 18 px from the page:
  // the first plan put a block on it, the second moved it on, and the guard
  // read the correction as a cycle (R25-D21). A capacity that changes with
  // the layout itself (a running head that wraps) alternates as well: it is
  // held at its second alternation.
  const capacitiesHeld = Boolean(last) && repairedPagesUnchanged(last!.capacities, capacities, plannedStarts, currentStarts);
  if (last && (!putsBack || last.doc !== view.state.doc) && ledgerTraceEnabled(view) && last.before.join("/") === plannedStarts.join("/")) {
    // A plan that puts back the last pass's starts on a document changed
    // since, or one not read as a cycle: what differs (development trace of
    // a layout alternating).
    const sameDoc = last.doc === view.state.doc;
    let docDiff: unknown = null;
    if (!sameDoc) {
      const at = last.doc.content.findDiffStart(view.state.doc.content);
      if (at !== null && at !== undefined) {
        const $at = view.state.doc.resolve(Math.min(at, view.state.doc.content.size));
        docDiff = { at, path: Array.from({ length: $at.depth + 1 }, (_, depth) => $at.node(depth).type.name).join(">"), page: $at.index(0) };
      }
    }
    traceLedgerPass(view, { putBack: { held: putsBack, sameDoc, editSeq: [last.editSeq, authoredEditSeq(view)], afterIsCurrent: last.after.join("/") === currentStarts.join("/"), capacitiesHeld, flips: last.capacityFlips, docDiff } });
  }
  const alternates = putsBack && (capacitiesHeld || last!.capacityFlips >= 1);
  const cycle = alternates ? earlierOpening(plannedStarts, currentStarts) : null;
  // A cycle between two layouts of as many pages keeps the one that opens
  // the page where they differ earlier (the block moved whole to the next
  // page, as Word moves a list item that does not fit). A cycle between a
  // layout and the same with one more page at its end keeps the shorter one
  // when the painted pages hold it: its last page was planned full from the
  // block measured there, the longer one from the block measured alone on a
  // page of its own (R26-D04: 602 of 605 px against 615; Word keeps 15
  // pages).
  const pageCountCycle = cycle !== null && putsBackWhole && plannedStarts.length !== currentStarts.length;
  const keepCurrent = cycle !== null && (pageCountCycle ? currentStarts.length < plannedStarts.length : !cycle.aEarlier);
  if (cycle && keepCurrent && putsBackLocally) {
    // The pages further on still have to be laid out, so the kept page is
    // held and the plan made again around it. A page a continuation opens
    // cannot be held (the refusal below): it goes on as it was.
    const opening = parseOpening(currentStarts[cycle.page] ?? "");
    if (refusals && opening?.whole) {
      refusals.record(view.state.doc, [{ sheet: cycle.page - 1, capacityPx: capacities[cycle.page - 1] ?? 0 }]);
      traceLedgerPass(view, { cycleHeld: { page: cycle.page, kept: currentStarts[cycle.page], over: plannedStarts[cycle.page], local: true } });
      return { dispatched: false, converged: false, plan, build, scope: scopeOutcome, stablePages, replan: true };
    }
    // A paragraph's continuation opens the page: its other cut is refused, and
    // the plan goes on past it. Dispatched instead, every page after it went
    // back and forth with it until the cycle watch stopped the layout, and
    // anything that woke it started it all again (the 272-page book's print: 56
    // of its 130 s of layout at two such paragraphs).
    const over = plannedStarts[cycle.page] ?? "";
    const seq = authoredEditSeq(view);
    if (opening && !opening.whole && over.includes("+text:") && refuseTableRowCut(view, over, () => authoredEditSeq(view) === seq)) {
      traceLedgerPass(view, { cycleHeld: { page: cycle.page, kept: currentStarts[cycle.page], over, local: true, refused: true } });
      return { dispatched: false, converged: false, plan, build, scope: scopeOutcome, stablePages, replan: true };
    }
  } else if (cycle && keepCurrent) {
    // Put back, the other layout would alternate again. The refusal recorded
    // when the kept one was laid out holds a page only when a whole block
    // opens it, never a paragraph's continuation (the 296-page book
    // alternated a page opened by "1380+text" with one opened by "1381"
    // until the pass limit and stalled its background there).
    if (pageCountCycle) {
      const pushed = repairPhysicalOverflow(view, refusals, overTallSheetsOf(plan, build), build.changedSheets, verifyRange, { starts: currentStarts, capacities });
      if (pushed) return { dispatched: true, converged: false, plan, build, scope: scopeOutcome, stablePages };
    }
    traceLedgerPass(view, { cycleHeld: { page: cycle.page, kept: currentStarts[cycle.page] ?? "(none)", over: plannedStarts[cycle.page] ?? "(none)" } });
    {
      const refusedCut = plannedStarts[cycle.page] ?? "";
      const held = parseOpening(currentStarts[cycle.page] ?? "");
      const seq = authoredEditSeq(view);
      if (held && !held.whole && refusedCut.includes("+text:")) refuseTableRowCut(view, refusedCut, () => authoredEditSeq(view) === seq);
    }
    publishOverTallSheets(view, build, overTallSheetsOf(plan, build), scoped ? scoped.start.page : 0, stopPage);
    publishContinuedFootnotes(view, plan, build, noteChromePx);
    return { dispatched: false, converged: !laterPending, plan, build, scope: scopeOutcome, stablePages };
  } else if (alternates && cycle === null && unorderedSeamFits(view, plannedStarts, currentStarts)) {
    // Two layouts the plan alternates between that cannot be ordered (two
    // cuts inside one list, R280-D14 "68+container:deep:37" and ":38", one
    // planned from the other's measure on every keystroke): the pages as
    // they stand are kept, as Word keeps a page it has settled, when the
    // page ending at that seam fits its paper. One that paints past it takes
    // the plan (the verifier cannot push a page's only block on: R280-D14's
    // sheet 5 stood 14.8 px over its foot under a held cut).
    const page = plannedStarts.findIndex((start, index) => start !== currentStarts[index]);
    traceLedgerPass(view, { cycleHeld: { page, kept: currentStarts[page] ?? "(none)", over: plannedStarts[page] ?? "(none)", unordered: true } });
    // A cut within a row this page takes back as soon as it stands: refused, the
    // plan goes on past it to the pages still to be cut.
    const refused = plannedStarts[page] ?? "";
    const editSeq = authoredEditSeq(view);
    if (refused.includes(":within") && parseOpening(currentStarts[page] ?? "")?.whole !== true &&
        refuseTableRowCut(view, refused, () => authoredEditSeq(view) === editSeq)) {
      return { dispatched: false, converged: false, plan, build, scope: scopeOutcome, stablePages, replan: true };
    }
    publishOverTallSheets(view, build, overTallSheetsOf(plan, build), scoped ? scoped.start.page : 0, stopPage);
    publishContinuedFootnotes(view, plan, build, noteChromePx);
    return { dispatched: false, converged: !laterPending, plan, build, scope: scopeOutcome, stablePages };
  }
  const tDispatch = performance.now();
  // docs-hollow: the pages the plan leaves past what the pass measured and
  // away from the reader stay hollow through it: a plan that moves pages
  // makes them new nodes, which lost the hollow drawing, and a plan to the
  // end drew the whole document again (the book: DOM 7.9k -> 81k nodes).
  if (hollowFrom !== null && viewMayDrawHollow(view, result.tr.doc)) {
    const hollow: number[] = [];
    let index = 0;
    result.tr.doc.forEach((page, offset) => {
      const at = index;
      index += 1;
      if (page.type.name !== "pageBlock" || at < hollowFrom) return;
      let plannable = page.childCount > 0;
      page.forEach((block) => { if (plannable && !plannableWithoutDom(block)) plannable = false; });
      if (plannable) hollow.push(offset);
    });
    if (hollow.length) result.tr.setMeta(pageHollowSheetsKey, { hollow });
  }
  const dispatched = safeDispatch(view, result.tr);
  traceLedgerPass(view, { dispatchMs: Math.round(performance.now() - tDispatch), steps: result.tr.steps.length });
  if (!dispatched) {
    lastLedgerDispatch.delete(view);
    return { dispatched: false, converged: true, plan, build, scope: scopeOutcome, stablePages };
  }
  refuseColumnCuts(view, result.mergedInSheet);
  recordLaidOut();
  {
    // Pages that came back to openings they had since the last authored
    // edit: a twitch, counted (ledgerTwitch).
    let watch = twitchWatches.get(view);
    if (!watch) twitchWatches.set(view, (watch = createTwitchWatch()));
    const page = watch.dispatched(currentStarts, plannedStarts, authoredEditSeq(view));
    if (page !== null) {
      const seen = pageOnScreen(view.dom, page);
      noteLayoutTwitch(view.dom.ownerDocument.defaultView, {
        kind: "returned", page, seen, at: Date.now(), detail: `${currentStarts[page] ?? "(none)"} -> ${plannedStarts[page] ?? "(none)"}`,
      });
      if (seen) reportLayoutTwitch("returned");
    }
  }
  lastLedgerDispatch.set(view, {
    before: currentStarts,
    after: plannedStarts,
    doc: view.state.doc,
    editSeq: authoredEditSeq(view),
    capacities: [...capacities],
    capacityFlips: putsBack && !capacitiesHeld ? (last?.capacityFlips ?? 0) + 1 : 0,
    extents: build.atoms.reduce<number[]>((extents, atom) => { extents[atom.index] = atomExtentPx(atom); return extents; }, []),
    seamRecut: build.logical.some((block) => block.kind === "text" && Boolean(block.editedSeams?.size)),
  });
  let heldPage: number | undefined;
  if (cycle?.aEarlier && !pageCountCycle && refusals) {
    refusals.record(view.state.doc, [{ sheet: cycle.page - 1, capacityPx: capacities[cycle.page - 1] ?? 0 }]);
    traceLedgerPass(view, { cycleHeld: { page: cycle.page, kept: plannedStarts[cycle.page], over: currentStarts[cycle.page] } });
    heldPage = cycle.page;
  }
  return { dispatched: true, converged: false, plan, build, scope: scopeOutcome, stablePages, planApplied: true, ...(heldPage !== undefined ? { heldPage } : {}) };
}

/** The sheets `plan` gave to a block that could not be cut and is taller
 * than its page: the fragments of the plan's overflowing atoms that do not
 * fit a page by themselves. */
function overTallSheetsOf(plan: LedgerPlan, build: LedgerBuild): Set<HTMLElement> {
  const sheets = new Set<HTMLElement>();
  for (const atom of plan.overflowingAtoms) {
    for (const part of build.logical[atom]?.parts ?? []) {
      if (part.heightPx > (build.capacities[part.sheet] ?? 0)) sheets.add(build.sheets[part.sheet]);
    }
  }
  return sheets;
}

/**
 * Record the plan's verdict for the sheets it laid out (`from` up to `to`,
 * or the document's end) and tell the page-span measurement when it
 * changed: a paragraph whose one line is taller than the page is one page
 * ended by the paper's edge, as an over-tall atom is.
 */
function publishOverTallSheets(
  view: EditorView,
  build: LedgerBuild,
  overTall: ReadonlySet<HTMLElement>,
  from: number,
  to: number | null,
): void {
  let changed = false;
  const end = Math.min(to ?? build.sheets.length, build.sheets.length);
  for (let index = Math.max(0, from); index < end; index += 1) {
    if (setOverTallSheet(build.sheets[index], overTall.has(build.sheets[index]))) changed = true;
  }
  if (changed) view.dom.dispatchEvent(new CustomEvent(PAGE_OVER_TALL_SHEETS_EVENT));
}







function publishContinuedFootnotes(view: EditorView, plan: LedgerPlan, build: LedgerBuild, chromePx: number): void {
  if (view.isDestroyed) return;
  let slices = new Map<number, NoteZoneSlice[]>();
  if (sheetedDocHasFootnoteRefs(view.state.doc)) {
    const allocations = deriveNoteZoneAllocations(plan, build.logical, chromePx);
    if (allocationsContinueNotes(allocations)) {
      const root = build.sheets[0]?.parentElement ?? null;
      const planned = root?.isConnected
        ? withRootMeasurementSlot(root, (slot) => {
            const sheet = (build.sheets[0] as HTMLElement).cloneNode(false) as HTMLElement;
            sheet.removeAttribute("id");
            slot.append(sheet);
            return planNoteZoneSlices(view.state.doc, allocations, sheet);
          })
        : null;
      slices = planned ?? planNoteZoneSlices(view.state.doc, allocations, build.sheets[0] ?? null);
    }
  }
  const trailingPages = slices.size > 0 ? (plan.notePages?.length ?? 0) : 0;
  const published = publishSheetNoteSlices(view, slices, trailingPages);
  if (!published.changed) return;
  safeDispatch(view, view.state.tr.setMeta(SHEET_NOTE_SLICES_META, true).setMeta("addToHistory", false));
  // The last sheet's page-span stamp carries the continuation pages.
  if (published.trailingChanged) window.dispatchEvent(new Event("mrn-page-rebalance"));
}

/** A React window switch can destroy the view inside TipTap's synchronous
 * transaction listeners (WebKit throws from `descAt`); a destroyed view has
 * nothing left to paginate, so that failure is swallowed. */
/**
 * Dispatch a cut the ledger makes inside the layout that stands (a block cut
 * at an unequal-column seam, a container cut after a break): the page
 * openings are those of the layout the last pass dispatched, so its record
 * follows the document. Left on the document before the cut, the next plan
 * could not see that it put back what the last one replaced, and a page that
 * cuts a block at a column seam on every other pass alternated two layouts
 * with no cycle ever held (R30-D07: 16k mutations per 5 s, for good).
 */
function dispatchWithinLayout(view: EditorView, tr: Transaction): boolean {
  const before = view.state.doc;
  const dispatched = safeDispatch(view, tr);
  if (!dispatched) return false;
  const last = lastLedgerDispatch.get(view);
  if (last && last.doc === before) last.doc = view.state.doc;
  const repaired = lastPhysicalRepair.get(view);
  if (repaired && repaired.doc === before) repaired.doc = view.state.doc;
  return true;
}

function safeDispatch(view: EditorView, tr: Transaction): boolean {
  try {
    // The text the reader looks at stays where it is in the view (readerAnchor).
    dispatchKeepingReader(view, tr);
    return true;
  } catch (error) {
    if (view.isDestroyed) return false;
    throw error;
  }
}

/** The Auto line spacing's answer to new fonts keeps the measurements (see
 * onNudge). `window.__docsAutoLineNudgeKeeps = false` forgets every one, as
 * before. */
function autoLineNudgeKeeps(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsAutoLineNudgeKeeps?: boolean }) | null;
  return win?.__docsAutoLineNudgeKeeps !== false;
}











function nudgeMath(view: EditorView): "all" | "none" {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNudgeKeepsMath?: boolean }) | null;
  return win?.__docsNudgeKeepsMath === true ? "none" : "all";
}

/** Harness switch for the footnote scope (see planPass). */
function footnoteScopeEnabled(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsFootnoteScope?: boolean }) | null;
  return win?.__docsFootnoteScope === true;
}

/** The sheets the last settled layout carried footnote rows into (their zone
 * opens with a continuation): a scoped pass neither starts nor resyncs at
 * one, since what is carried in comes from the page before. */
function sheetsCarriedInto(view: EditorView): (page: number) => boolean {
  const slices = readSheetNoteSlices(view);
  const doc = view.state.doc;
  const kept = laidOutNotesKept(view);
  return (page) => {
    // The page as the pass that laid it out planned it: the slices are
    // published only once the layout settles, and a progressive pass reads
    // them while the pages are still being laid out (none at all before the
    // first settle).
    const laidOut = kept && page < doc.childCount ? laidOutNotePages.get(doc.child(page)) : undefined;
    if (laidOut) return (laidOut.noteCarryInPx ?? 0) > 0;
    return Boolean(slices?.get(page)?.some((slice) => slice.continued));
  };
}

/**
 * The page nodes a pass laid out (planned from their opening, its plan now
 * the layout), a physical repair settled, or a kept layout restored: a scoped
 * pass resyncs only at one of them (scopedStopAt). Keyed by the node: a page
 * an edit changed since is a new one.
 */
const laidOutPages = new WeakSet<PmNode>();

function markLaidOutPages(view: EditorView, from: number, to: number | null): void {
  const doc = view.state.doc;
  const end = Math.min(to ?? doc.childCount, doc.childCount);
  for (let index = Math.max(0, from); index < end; index += 1) laidOutPages.add(doc.child(index));
}

function pagesLaidOut(view: EditorView): (page: number) => boolean {
  const doc = view.state.doc;
  return (page) => page < doc.childCount && laidOutPages.has(doc.child(page));
}










function notesStepOn(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesSteadySteps?: boolean }) | null;
  if (win?.__docsNotesSteadySteps === false) return false;
  return sheetedDocHasFootnoteRefs(view.state.doc) && notesAllowProgress(view);
}

/**
 * A document with footnotes laid out a window at a time, settled: every page
 * is verified, not only the window the last pass laid out. A page a window
 * laid out (dispatched) and none verified since, the layout resynced short of
 * it, stood over its foot for good (R286-D01 page 118: 5.6 px, the last block
 * moved on by the whole layout's repair). Sheets found within their foot and
 * unchanged since are not read again (repairPhysicalOverflow).
 * `window.__docsNotesVerifyEvery = false` verifies the window only, as before.
 */
function notesVerifyEvery(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesVerifyEvery?: boolean }) | null;
  if (win?.__docsNotesVerifyEvery === false) return false;
  return sheetedDocHasFootnoteRefs(view.state.doc) && notesAllowProgress(view);
}

/** A document with footnotes laid out a window at a time: a physical repair
 * does not move a suffix of section breaks alone (repairPhysicalOverflow).
 * `window.__docsNotesSectionBreaksMove = true` moves them, as before. */
function notesSectionBreaksDrawNothing(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesSectionBreaksMove?: boolean }) | null;
  if (win?.__docsNotesSectionBreaksMove === true) return false;
  return sheetedDocHasFootnoteRefs(view.state.doc) && notesAllowProgress(view);
}

/**
 * A document with footnotes laid out a window at a time: a pass starting
 * inside the document reduces the first page's preserved leading space by
 * the space after the page before's last paragraph, as a plan from an
 * earlier page does (resolvePassScope). Started at 0, R280-D17's page after a
 * page break was planned 6 px fuller than the whole plan made it, a list cut a
 * line early and held against the whole plan as a cycle.
 * `window.__docsNotesLeadingAfter = false` starts at 0 as before.
 */
function notesCarryLeadingAfter(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesLeadingAfter?: boolean }) | null;
  if (win?.__docsNotesLeadingAfter === false) return false;
  return notesAllowProgress(view);
}

/** The documents a held repair was planned around once (finishLedgerPass). */
const repairReplanned = new WeakSet<PmNode>();

/** `window.__docsRepairPutBackLocal = false`: a scoped pass of a document
 * with footnotes holds a physical repair only when its whole plan is the
 * layout the repair replaced, as before. */
function repairPutBackLocal(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsRepairPutBackLocal?: boolean }) | null;
  return win?.__docsRepairPutBackLocal !== false;
}

/** `window.__docsResyncLaidOut = false`: a scoped pass of a document with
 * footnotes resyncs at any page whose opening it planned, laid out or not,
 * as before. */
function resyncsOnlyLaidOut(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsResyncLaidOut?: boolean }) | null;
  return win?.__docsResyncLaidOut !== false;
}

/**
 * A document with footnotes: the page each page node was laid out as, by the
 * pass whose plan it is (its note rows carried in and out), and the note-only
 * pages a last page node was laid out with. A scoped pass reads them for the
 * pages it does not lay out (composeScopedPlan's StandingNotes) and for where
 * it may start and resync (sheetsCarriedInto). Keyed by the page node: a page
 * an edit or a later pass changed is a new node, with no record.
 */
const laidOutNotePages = new WeakMap<PmNode, LedgerPage>();
const laidOutTrailingNotes = new WeakMap<PmNode, LedgerPage[]>();

/** `window.__docsLaidOutNotes = false`: standing pages and the scope's
 * carried-into test read the published slices only, as before. */
function laidOutNotesKept(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsLaidOutNotes?: boolean }) | null;
  return win?.__docsLaidOutNotes !== false;
}

/** Record the pages `plan` laid out, now standing in the document, from
 * `from` up to `to` (the document's end when null, with its note-only pages). */
function recordLaidOutNotes(view: EditorView, plan: LedgerPlan, from: number, to: number | null): void {
  if (!laidOutNotesKept(view) || !sheetedDocHasFootnoteRefs(view.state.doc)) return;
  const doc = view.state.doc;
  const end = Math.min(to ?? doc.childCount, doc.childCount, plan.pages.length);
  for (let index = Math.max(0, from); index < end; index += 1) laidOutNotePages.set(doc.child(index), plan.pages[index]!);
  if (to === null && doc.childCount > 0 && plan.pages.length === doc.childCount) {
    laidOutTrailingNotes.set(doc.child(doc.childCount - 1), plan.notePages ?? []);
  }
}

function standingNotesOf(view: EditorView): StandingNotes {
  const doc = view.state.doc;
  return {
    page: (index) => (index < doc.childCount ? laidOutNotePages.get(doc.child(index)) : undefined),
    notePages: () => (doc.childCount > 0 ? laidOutTrailingNotes.get(doc.child(doc.childCount - 1)) : undefined),
  };
}

/** Development trace of every dispatching pass (read by verification
 * harnesses through `window.__pageLedgerTrace`). */
function ledgerTraceEnabled(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __pageLedgerTrace?: unknown[] }) | null;
  return Boolean(win && Array.isArray(win.__pageLedgerTrace));
}

function traceLedgerPass(view: EditorView, entry: Record<string, unknown>): void {
  const win = view.dom.ownerDocument.defaultView as (Window & { __pageLedgerTrace?: unknown[] }) | null;
  // A guard that stopped two layouts alternating is a twitch whether or not
  // anything traces (ledgerTwitch).
  const held = (entry.cycleHeld ?? entry.repairHeld) as { page?: unknown; kept?: unknown; over?: unknown; refused?: unknown } | undefined;
  if (held && typeof held === "object") {
    const text = (value: unknown) => (Array.isArray(value) ? value.join("/") : String(value ?? "")).slice(0, 80);
    const page = typeof held.page === "number" ? held.page : -1;
    const seen = page >= 0 && pageOnScreen(view.dom, page);
    noteLayoutTwitch(win, {
      kind: "held",
      page,
      seen,
      at: Date.now(),
      detail: `${entry.cycleHeld ? "cycle" : "repair"}: kept ${text(held.kept)}, refused ${text(held.over ?? held.refused)}`,
    });
    if (seen) reportLayoutTwitch(entry.cycleHeld ? "held-cycle" : "held-repair");
  }
  // Only a harness that pre-creates the array receives the trace.
  if (!win || !Array.isArray(win.__pageLedgerTrace)) return;
  win.__pageLedgerTrace.push({ at: Date.now(), ...entry });
}

function existingKeyMatches(block: LedgerBuild["logical"][number], seam: number, key: string): boolean {
  return existingSeamKey(block, seam) === key;
}

/** Lossless safety net: after the ledger converged, any sheet that still
 * physically overflows pushes its smallest overflowing suffix forward. This
 * is a render/ledger disagreement, recorded as a diagnostic. */
/** Sheets the physical verification found within their foot, with the page
 * node each held then (see repairPhysicalOverflow). */
const sheetsWithinFoot = new WeakMap<HTMLElement, PmNode>();

function repairPhysicalOverflow(
  view: EditorView,
  refusals?: LedgerPhysicalRefusals | null,
  /** Sheets the plan gave to a block that cannot be cut and is taller than
   * a page: they run past their foot by design (the paper ends the block,
   * as in Word), and pushing what stands with it only moves a page break. */
  overTall?: ReadonlySet<HTMLElement> | null,
  /** Sheets something changed in since the pass before. A sheet nothing
   * changed in keeps the over-tall stamp the page-span measurement gave it
   * (a pass that plans only the pages an edit can reach names no others). */
  changed?: ReadonlySet<HTMLElement> | null,
  /** The sheets to verify (by index, `to` exclusive); null: every sheet. */
  range?: { from: number; to: number } | null,
  /** The page openings as they stand before this repair, and the pages'
   * capacities (see lastPhysicalRepair); `plannedUsed`, the height the plan
   * of the pages as they stand gave each (repairShortfallOn). */
  before?: { starts: readonly string[]; capacities: readonly number[]; plannedUsed?: readonly number[] } | null,
): boolean {
  const docBefore = view.state.doc;
  const pages = collectPages(view.state.doc);
  if (!pages) return false;
  const sheets = sheetsOf(view.dom);
  if (sheets.length !== pages.length) return false;
  const tr = view.state.tr;
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  let mismatches = 0;
  const repairedSheets: Array<{ sheet: number; capacityPx: number }> = [];
  const shortSheets: Array<{ sheet: number; capacityPx: number; shortfallPx: number }> = [];
  const shortfallOn = Boolean(refusals) && repairShortfallOn(view);
  const editSeq = authoredEditSeq(view);
  const last = range ? Math.min(sheets.length, range.to) - 1 : sheets.length - 1;
  const first = range ? Math.max(0, range.from) : 0;
  for (let i = last; i >= first; i -= 1) {
    if (overTall?.has(sheets[i])) continue;
    if (changed && !changed.has(sheets[i]) && (isOverTallSheet(sheets[i]) || sheets[i].hasAttribute(PAGE_OVERSIZE_ATTR))) continue;
    // A sheet found within its foot, holding the same page and with nothing
    // changed in it since (the measure cache's record, which a font or a
    // width clears), is within it still: reading every later sheet's body
    // after every keystroke laid out sheets the browser had skipped.
    if (changed && !changed.has(sheets[i]) && sheetsWithinFoot.get(sheets[i]) === pages[i].node) continue;
    const overflow = sheetBodyOverflowPx(sheets[i]);
    if (!(overflow > PHYSICAL_PAGE_SPILL_TOLERANCE_PX)) {
      sheetsWithinFoot.set(sheets[i], pages[i].node);
      continue;
    }
    sheetsWithinFoot.delete(sheets[i]);
    const page = pages[i];
    if (page.node.childCount < 2) continue;
    const children = sheetBlockElements(sheets[i]);
    // In document pixels, like the capacity below: client rects are in canvas
    // pixels, and on a zoomed document a block's end read past the page foot
    // (the repair moved on more than spilled) or short of it (zoomed out, it
    // kept what does not fit and the page stayed over its foot).
    const repairScale = paginationLayoutScale(sheets[i]);
    const sheetRect = paginationLayoutRect(sheets[i], repairScale);
    const paddingTop = Number.parseFloat(getComputedStyle(sheets[i]).paddingTop) || 0;
    // A page of stacked column regions (several sections) is laid out down
    // the page: its blocks end at page heights, whatever columns the section
    // it opens with has. Read as that many columns of linear flow, every
    // block "fit" in twice the page and the repair only ever moved the last
    // child (a zero-height section break), pass after pass.
    const stackedRegions = sheets[i].hasAttribute(COLUMN_REGIONS_ATTR) && unequalColumnProjectionForSheet(sheets[i]) !== null;
    const columns = stackedRegions ? 1 : Math.max(1, sheetColumnCount(sheets[i]));
    const capacity = (Number.parseFloat(getComputedStyle(sheets[i]).minHeight) - paddingTop - (Number.parseFloat(getComputedStyle(sheets[i]).paddingBottom) || 0)) * columns;
    // Where a block ends in the sheet's flow: its border-box bottom in a
    // single column, its linear flow end across newspaper columns.
    const flowEnd = (child: HTMLElement): number => {
      if (columns > 1) {
        const placement = unequalColumnPlacementForBlock(child);
        if (placement) return placement.flowEndPx;
        const geometry = columnFlowGeometry(sheets[i], columns);
        const flow = geometry ? blockColumnFlowGeometry(child, geometry) : null;
        if (flow) return flow.end;
      }
      return paginationLayoutRect(child, repairScale).bottom - sheetRect.top - paddingTop;
    };
    let keep = children.length;
    if (stackedRegions) {
      // Regions put blocks side by side and their section breaks draw
      // nothing: the suffix starts at the first block ending past the foot.
      const first = children.findIndex((child, index) =>
        index >= 1 && flowEnd(child) > capacity + PHYSICAL_PAGE_SPILL_TOLERANCE_PX);
      if (first >= 1) keep = first;
    } else {
      for (let c = children.length - 1; c >= 1; c -= 1) {
        if (flowEnd(children[c - 1]) <= capacity + PHYSICAL_PAGE_SPILL_TOLERANCE_PX) {
          keep = c;
          break;
        }
        keep = c;
      }
    }
    if (keep >= children.length || keep < 1) continue;
    if (isForcedBreakBlock(page.node.child(keep - 1))) continue;
    // A table's head piece the plan left a little past the foot (ledgerAtoms
    // HEAD_PIECE_OVERRUN_PX). Moved, the whole table left the page with the
    // words it had room for (corpus R283-D10: page 1 nearly blank, 12 px over
    // after a late face made the footer taller).
    if (keep === children.length - 1 && overflow <= HEAD_PIECE_OVERRUN_PX && textEngineEnabled("docs-layout")) {
      const lastBlock = page.node.child(page.node.childCount - 1);
      if (lastBlock.type.name === "table" && lastBlock.attrs[TABLE_CONTINUES_ATTR] === true) continue;
    }
    // A suffix of nothing but break atoms holds no height: moving it cannot
    // bring the page within its foot, and a page break moved onto the next
    // page only opens a blank page after it (corpus R73-D22: the trailing
    // page break of each two-column page moved alone, four blank pages).
    // A section break draws nothing either (R205-D04 under
    // `__docsFootnoteProgressive`: the cover's second page, a figure anchored
    // past its foot and the cover section's break, read when every page is
    // verified; the break moved alone opened a blank page).
    {
      let breaksOnly = true;
      const sectionsDrawNothing = notesSectionBreaksDrawNothing(view);
      for (let c = keep; c < page.node.childCount; c += 1) {
        const name = page.node.child(c).type.name;
        if (name !== "pageBreak" && name !== "columnBreak" && !(sectionsDrawNothing && name === "sectionBreak")) { breaksOnly = false; break; }
      }
      if (breaksOnly) {
        if (ledgerTraceEnabled(view)) {
          traceLedgerPass(view, {
            repairSkipped: i,
            reason: "breaks-only suffix",
            overflowPx: Math.round(overflow * 100) / 100,
            capacity: Math.round(capacity * 100) / 100,
            blocks: children.map((child) => [child.tagName, Math.round(flowEnd(child) * 10) / 10, child.getAttribute("data-type") ?? (child.textContent ?? "").slice(0, 16)]),
          });
        }
        continue;
      }
    }
    // A cuttable block's piece the page ran over with, the rest of the page
    // its own: the plan measured the page short by what the painted blocks
    // run past the height it planned. Laid out that much shorter, the block
    // is cut earlier on this page; pushed whole, the page kept only what
    // stood before it (R465-D87's print: list B's head, 730 px of the page,
    // went whole to the next one, a page more than Word).
    let shortfallPx: number | null = null;
    if (shortfallOn && columns === 1 && !stackedRegions && keep === children.length - 1 &&
        SHORTFALL_CUTTABLE.has(page.node.child(keep).type.name)) {
      const end = flowEnd(children[children.length - 1]);
      const planned = before?.plannedUsed?.[i];
      const plannedPx = typeof planned === "number" && Number.isFinite(planned) && planned > 0 && planned <= capacity + PHYSICAL_PAGE_SPILL_TOLERANCE_PX
        ? planned : capacity;
      const short = end - plannedPx + 0.5;
      const blockTop = paginationLayoutRect(children[keep], repairScale).top - sheetRect.top - paddingTop;
      if (end > capacity + PHYSICAL_PAGE_SPILL_TOLERANCE_PX && short > 0 &&
          capacity - short - blockTop >= SHORTFALL_MIN_KEEP_PX &&
          refusals!.shortfallTries(page.node, capacity, editSeq) < SHORTFALL_MAX_TRIES) {
        shortfallPx = short;
      }
    }
    if (ledgerTraceEnabled(view)) {
      const top = sheetRect.top + paddingTop;
      traceLedgerPass(view, {
        repair: i,
        overflowPx: Math.round(overflow * 100) / 100,
        ...(shortfallPx !== null ? { shortfallPx: Math.round(shortfallPx * 100) / 100, plannedUsed: Math.round((before?.plannedUsed?.[i] ?? Number.NaN) * 100) / 100 } : {}),
        keep,
        children: children.length,
        capacity: Math.round(capacity * 100) / 100,
        blocks: children.map((child) => {
          const rect = paginationLayoutRect(child, repairScale);
          const css = getComputedStyle(child);
          return [child.tagName, Math.round((rect.top - top) * 10) / 10, Math.round((rect.bottom - top) * 10) / 10, css.marginTop, css.marginBottom, Array.from(child.attributes).filter((a) => a.name.startsWith("data-")).map((a) => `${a.name}=${a.value.slice(0, 24)}`).join(" ")];
        }),
      });
    }
    applyBoundaryMove(tr, pageType, i, children.length - keep, { isolateTrailingForcedBreak: true });
    mismatches += 1;
    if (shortfallPx !== null) shortSheets.push({ sheet: i, capacityPx: capacity, shortfallPx });
    else repairedSheets.push({ sheet: i, capacityPx: capacity });
  }
  if (!tr.docChanged) return false;
  writeDocumentLayoutStatus(view.dom, PAGE_LEDGER_MISMATCH_ATTR, String(mismatches), view);
  tr.setMeta(REBALANCE_META, true).setMeta("addToHistory", false);
  const dispatched = safeDispatch(view, tr);
  // The painted page is the verdict: later plans keep these boundaries.
  if (dispatched) refusals?.record(view.state.doc, repairedSheets);
  // ...or lay out the short pages shorter (the piece pushed now comes back
  // cut earlier).
  // (Its opening as the document now has it: a block id the push's own
  // transaction gave is the one the next plans read.)
  if (dispatched && shortSheets.length > 0) {
    const after = collectPages(view.state.doc);
    for (const short of shortSheets) {
      const node = after?.[short.sheet]?.node;
      if (node) refusals?.recordShortfall(node, short.capacityPx, short.shortfallPx, editSeq);
    }
  }
  if (dispatched) for (const { sheet } of repairedSheets) markLaidOutPages(view, sheet, sheet + 2);
  if (dispatched && before) {
    // A repair right after another one continues its run: the layout the run
    // refused is the one before the first.
    const run = lastPhysicalRepair.get(view);
    const continued = run && run.doc === docBefore ? run : null;
    lastPhysicalRepair.set(view, {
      before: continued ? continued.before : [...before.starts],
      capacities: continued ? continued.capacities : [...before.capacities],
      doc: view.state.doc,
      editSeq: authoredEditSeq(view),
    });
  }
  return dispatched;
}

/**
 * Whether the faces the sheets on screen draw their text in are loaded
 * (FontFaceSet.check of each element's font with the characters it draws;
 * a font no face of the document declares counts as there). Those not yet
 * are asked to load once (`asked`), and `settled` is called when each load
 * settles. A first layout composed before them measured the fallback faces'
 * lines and moved when the real ones came: a long book's first screen took
 * its line heights and its page count ("about 170" to "about 487") from the
 * fallback, whatever the document was imported from.
 */
/** What a sheet draws in which font (collectDocumentFontCharacters), kept for
 * the editor state it was read in, under the cold first layout: the settle asks
 * again every frame it holds for the faces, each time walking the sheet's text
 * and reading a computed style per element. The sheet's text and styles come
 * from the state; a new state (any transaction, a font plan applied) reads it
 * again. */
const sheetFontCharacters = new WeakMap<HTMLElement, { state: EditorState; groups: ReturnType<typeof collectDocumentFontCharacters> }>();

function sheetFontCharactersOf(view: EditorView, sheet: HTMLElement): ReturnType<typeof collectDocumentFontCharacters> {
  if (!coldFirstLayout(view.dom.ownerDocument.defaultView)) return collectDocumentFontCharacters(sheet);
  const kept = sheetFontCharacters.get(sheet);
  if (kept && kept.state === view.state) return kept.groups;
  const groups = collectDocumentFontCharacters(sheet);
  sheetFontCharacters.set(sheet, { state: view.state, groups });
  return groups;
}

function screenFacesLoaded(view: EditorView, sheets: readonly HTMLElement[], asked: Set<string>, settled: () => void): boolean {
  const fonts = view.dom.ownerDocument.fonts as FontFaceSet | undefined;
  if (!fonts || typeof fonts.check !== "function" || sheets.length === 0) return true;
  // The sheets on screen (the first, where nothing is on screen yet), three
  // at most. Under the cold first layout every sheet: its document opens on
  // provisional sheets of about a page, and a face only the later sheets'
  // text draws with was never asked for -- those sheets were measured in
  // the fallback and laid out otherwise than the document opened as one
  // sheet, which asks for every face its text draws (float.docx, cold7
  
  const whole = coldFirstLayout(view.dom.ownerDocument.defaultView) !== null;
  const range = whole ? null : visibleSheetRange(view, sheets);
  const first = whole ? 0 : range && range.first >= 0 && range.first < sheets.length ? range.first : 0;
  const last = whole ? sheets.length - 1 : range && range.last >= first ? Math.min(range.last, first + 2, sheets.length - 1) : first;
  let loaded = true;
  for (let index = first; index <= last; index += 1) {
    const sheet = sheets[index];
    if (!sheet) continue;
    let groups: ReturnType<typeof collectDocumentFontCharacters>;
    try {
      groups = sheetFontCharactersOf(view, sheet);
    } catch {
      return true;
    }
    for (const { font, characters } of groups) {
      try {
        if (fonts.check(font, characters)) continue;
      } catch {
        continue;
      }
      loaded = false;
      const key = `${font}\u0000${characters}`;
      if (asked.has(key)) continue;
      asked.add(key);
      void fonts.load(font, characters).then(settled, settled);
    }
  }
  return loaded;
}

/** Whether the document holds any text (stops at the first). */
function documentHasText(doc: PmNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.isText && node.text) found = true;
    return !found;
  });
  return found;
}

/**
 * The longest the settle may hold the pages back. A settle that has not finished
 * by then (a long first layout, a stalled measurement, an environment without
 * layout) shows them as they stand and takes input: the reader sees the document
 * move rather than nothing. Editable alone was not enough: the pages stayed
 * hidden, the caret had nowhere to be, and every key was dropped without a word
 * (corpus R329-D02: 44 pages blank for about 100 s, five keys lost). The first
 * page standing as a page shows them sooner (firstPageStands).
 */
export const INITIAL_SETTLE_INPUT_GATE_MAX_MS = 3_000;

/** How often a gate held for the document's faces looks whether they have
 * answered. */
const GATE_FACES_POLL_MS = 250;

/** The longest the gate holds the pages back past its own time for the
 * document's faces (giveGateUp). */
const GATE_FACES_GRACE_MS = 3_000;

/**
 * Whether the opening screen is a page already: its rest has gone to the sheets
 * after it, and it stands no taller than a page. The pages after it may go on
 * moving; what the reader looks at and types into will not, so nothing is gained
 * by holding it back for the rest of a long document.
 */
export function firstPageStands(sheets: readonly HTMLElement[]): boolean {
  const first = sheets[0];
  if (!first || sheets.length < 2) return false;
  const floor = Number.parseFloat(getComputedStyle(first).minHeight);
  return floor > 0 && first.offsetHeight <= floor + 1;
}

/**
 * Whether the initial settle has the page sheets hidden right now:
 * note-editor.css gives every page `visibility: hidden` while the root carries
 * the settling flag, except in a header/footer story editor. Read from the
 * computed style, so nothing is gated where nothing hides the pages (no
 * stylesheet, no layout, a story editor).
 */
export function pagesHiddenForInitialSettle(root: HTMLElement): boolean {
  if (
    root.getAttribute(INITIAL_PAGINATION_SETTLING_ATTR) !== "true" ||
    root.classList.contains("sheet-band-story") ||
    !root.isConnected
  ) return false;
  if (!root.firstElementChild || !root.ownerDocument.defaultView) return false;
  return settleHidesPagesFor(root);
}

/**
 * Whether the stylesheet hides a settling page of `root`, read once per
 * editor root and kept.
 *
 * ProseMirror asks the `editable` prop on every state update, and reading
 * the computed style forces a style recalculation of whatever the update
 * just changed: on a 157-page import that was ~1.5 s of the open. Whether
 * the stylesheet hides a settling page is a property of the document the
 * editor lives in, not of the update; the settle's own flag change is
 * answered without it.
 *
 * The reading is taken off a probe shaped like a settling root with a page,
 * and the ledger takes it when it raises the flag, while the editor's root
 * is not yet in the page. Read later, in the update that mounts the editor
 * (ahead of ProseMirror drawing every node again for its node views), it
 * styled the whole freshly built document only for it to be replaced: the
 * settle shimmer runs then, and an animation running makes Chromium bring
 * every style up to date for any computed-style read (0.17-0.23 s of a
 * 16-sheet open, 0.88 s in a development build of a long one).
 */
function settleHidesPagesFor(root: HTMLElement): boolean {
  const known = settleHidesPages.get(root);
  if (known !== undefined) return known;
  const win = root.ownerDocument.defaultView;
  const sample = settleStyleProbe(root.ownerDocument) ?? root.firstElementChild;
  if (!win || !sample) return false;
  let hidden = false;
  try {
    hidden = win.getComputedStyle(sample).visibility === "hidden";
  } catch {
    hidden = false;
  }
  settleHidesPages.set(root, hidden);
  return hidden;
}

const settleHidesPages = new WeakMap<HTMLElement, boolean>();

/** Marks the probe `settleStyleProbe` keeps in the document body. */
const SETTLE_STYLE_PROBE_ATTR = "data-mrnote-settle-style-probe";

/**
 * The page of a hidden element that the stylesheet's settling rules match as
 * they match a page editor's root (note-editor.css): made once per document,
 * never shown (`display: none` draws nothing and runs no shimmer), and only
 * read for its computed visibility.
 */
function settleStyleProbe(doc: Document): HTMLElement | null {
  const body = doc.body;
  if (!body) return null;
  let probe = body.querySelector<HTMLElement>(`:scope > [${SETTLE_STYLE_PROBE_ATTR}]`);
  if (!probe) {
    probe = doc.createElement("div");
    probe.className = "note-editor-content";
    probe.setAttribute(INITIAL_PAGINATION_SETTLING_ATTR, "true");
    probe.setAttribute(SETTLE_STYLE_PROBE_ATTR, "");
    probe.setAttribute("aria-hidden", "true");
    probe.style.display = "none";
    probe.appendChild(doc.createElement("div"));
    body.appendChild(probe);
  }
  return probe.firstElementChild as HTMLElement | null;
}

// Made when the editor's code loads, frames before any document mounts.
if (typeof document !== "undefined") settleStyleProbe(document);

export const PageLedger = Extension.create<PageLedgerOptions>({
  name: "pageLedger",
  addOptions() {
    return { waitForSourceFontPlan: false, eagerBackground: false };
  },
  addProseMirrorPlugins() {
    const { waitForSourceFontPlan, eagerBackground } = this.options;
    // Per editor, not per plugin view. ProseMirror rebuilds every plugin view
    // whenever any plugin is registered or removed (the floating toolbar, Find),
    // and a rebuilt view must not start the INITIAL settle over: re-marking the
    // root hid every page again under a caret that was typing, the browser
    // dropped its selection in the hidden text, and the keys typed meanwhile
    // were lost.
    let initialSettleDone = false;
    // The view whose pages the settle hides; read by the input gate.
    let gatedView: EditorView | null = null;
    let gateExpired = false;
    // Boundaries the painted pages refused, kept across passes (and across
    // plugin-view rebuilds) until the page or block involved changes.
    const refusals = new LedgerPhysicalRefusals();
    return [
      new Plugin<LedgerEditState>({
        key: pageLedgerKey,
        // Where authored edits changed the document, mapped through every
        // later change until a pass has read them (markEditedSeams). The
        // ledger's own moves and what normalizers append are not edits.
        state: {
          init: (): LedgerEditState => ({ ranges: [], seq: 0 }),
          apply(tr, value): LedgerEditState {
            if (!tr.docChanged) return value;
            if (tr.getMeta(READ_ONLY_TRUSTED_MUTATION_META) === "hydration-content") {
              value = { ...value, hydrations: (value.hydrations ?? 0) + 1 };
            }
            const ranges = value.ranges.map((range) => ({ id: range.id, from: tr.mapping.map(range.from, -1), to: tr.mapping.map(range.to, 1) }));
            // Only what an author did: never the ledger's own moves, nor what
            // a plugin appends to a transaction (identity back-fill, page
            // numbers): appended to each background pass near a seam, those
            // re-cut the seam every pass and the background never finished.
            if (tr.getMeta(REBALANCE_META) === true || tr.getMeta("addToHistory") === false || tr.getMeta("appendedTransaction")) {
              return { ranges, seq: value.seq, hydrations: value.hydrations };
            }
            let seq = value.seq;
            tr.steps.forEach((step, index) => {
              const rest = tr.mapping.slice(index + 1);
              step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                seq += 1;
                ranges.push({ id: seq, from: rest.map(newStart, -1), to: rest.map(newEnd, 1) });
              });
            });
            return { ranges: ranges.slice(-MAX_TRACKED_EDITS), seq, hydrations: value.hydrations };
          },
        },
        props: {
          // A document whose pages are hidden takes no input, as Word takes
          // none before it has laid the document out. Hidden text holds no
          // caret: the browser drops its selection, every key typed there was
          // discarded (keydown without beforeinput), and once the pages showed
          // the next key put the caret at the start of the document, so the
          // rest of the typing landed before the title (measured on an
          
          // becomes editable in the same frame the pages are shown.
          editable: () =>
            !gatedView || gatedView.isDestroyed || gateExpired ||
            !pagesHiddenForInitialSettle(gatedView.dom),
        },
        view(editorView) {
          gatedView = editorView;
          const win = editorView.dom.ownerDocument.defaultView;
          let raf = 0;
          let destroyed = false;
          let selfDispatching = false;
          let passes = 0;
          let pendingAfterComposition = false;
          let pendingAfterNoteEdit = false;
          let gridRetries = 0;
          let yieldedAfterFlush = false;
          // The pages a background step lays out, by what the last one cost:
          // twelve pages of the 298-page book (their line-metric projection,
          // their measurement) held the main thread 1.5-2.3 s at a time
          // while the rest of the app waited. A slow step halves the next,
          // a quick one grows it back; the pages it reaches are the same.
          // (No reader, as on the print surface: nothing waits for a step, and
          // 4 pages a pass was 35 passes from a page to the end of a book.)
          // A harness's window on what the plan stands on (with the pass trace).
          if (ledgerTraceEnabled(editorView)) (editorView.dom as HTMLElement & { __ledgerMeasureOf?: unknown }).__ledgerMeasureOf = encodedBlockMeasure;
          const pinnedBackgroundPages = backgroundPagesPinned(editorView.dom) ?? (eagerBackground ? EAGER_BACKGROUND_PAGES : null);
          let backgroundPagesPerPass = pinnedBackgroundPages ?? PROGRESSIVE_BACKGROUND_PAGES;
          /** How long the last step taken at rest took (restStepPages). */
          let lastRestStepMs = 0;
          let stepSizing: StepSizing = { pages: backgroundPagesPerPass, last: null, fixedMs: 0 };
          // The step's metrics flush, which may have ended an earlier task.
          let stepFlushMs = 0;
          let sheetRetries = 0;
          let settledOnce = initialSettleDone;
          let gateTimer: number | undefined;
          // The first layout waits for the faces of the sheets on screen
          // (screenFacesLoaded) until this time at the latest: the gate's
          // bounded time and its grace (GATE_FACES_GRACE_MS).
          let facesHoldUntil = 0;
          let facesTimer: number | undefined;
          const screenFacesAsked = new Set<string>();
          // The first layout was held for the document's faces (its font plan
          // or the faces on screen), and whether a pass has composed since the
          // initial settle opened: a layout the faces let go just before the
          // gate's time has its pass still to come (giveGateUp).
          let fontsHeldFirstLayout = false;
          let composedSinceSettleOpened = false;
          // How long the latest pass took, and the pending re-pagination after
          // an edit of a slow document (see scheduleAfterEdit).
          let lastPassMs = 0;
          let editTimer: number | undefined;
          let fillPoll: number | undefined;
          // Sheets a scoped pass yielded at: the background goes on from
          // them (ledgerScope). A yield page whose sheet had not committed
          // yet is remembered by index until it has.
          const pending = new Set<HTMLElement>();
          let pendingIndex: number | null = null;
          // Sheets a restored receipt or the text engine laid out, trusted as
          // they stand until the reader nears them: then they are laid out.
          const trustedSheets = new WeakSet<HTMLElement>();
          // docs-hollow: a trusted sheet far from the reader is drawn as its
          // paper alone (pageSheetView); one coming near is drawn whole.
          const toHollow = new Set<HTMLElement>();
          const toFill = new Set<HTMLElement>();
          let hollowQueued = false;
          // While the reader scrolls, a page coming near is drawn and nothing
          // else happens: the sheets left far behind and the pass that reads the
          // new ones wait until the scrolling stops (each pass and each
          // transaction was as long as a frame, a quarter of a scroll's time).
          let hollowQuiet: number | undefined;
          const holdForTheReader = () => {
            if (hollowQuiet !== undefined) win?.clearTimeout(hollowQuiet);
            hollowQuiet = win?.setTimeout(() => {
              hollowQuiet = undefined;
              if (destroyed || editorView.isDestroyed) return;
              flushHollow();
              schedule();
            }, HOLLOW_SCROLL_QUIET_MS);
          };
          // While pages stand hollow a scroll holds passes back by itself: at a
          // reader's pace pages come a third of a second apart.
          // Only the reader's own scrolling holds them (a wheel, a touch, a key,
          // a pointer on the scrollbar): a page scrolled into view by the app
          // (a part's sentinel, a jump) holds nothing, or a long document coming
          // in part by part was laid out only once its last part had come.
          let readerIntentAt = -Infinity;
          let pointerHeld = false;
          const noteIntent = () => {
            readerIntentAt = performance.now();
          };
          const onPointerDown = () => {
            pointerHeld = true;
            noteIntent();
          };
          const onPointerUp = () => {
            pointerHeld = false;
          };
          const onReaderScroll = () => {
            if (!pointerHeld && performance.now() - readerIntentAt > READER_INTENT_MS) return;
            if (anyPageHollow(editorView.state)) holdForTheReader();
          };
          const intentDoc = editorView.dom.ownerDocument;
          intentDoc.addEventListener("scroll", onReaderScroll, { capture: true, passive: true });
          for (const type of ["wheel", "touchmove", "keydown"] as const) intentDoc.addEventListener(type, noteIntent, { capture: true, passive: true });
          intentDoc.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
          intentDoc.addEventListener("pointerup", onPointerUp, { capture: true, passive: true });
          intentDoc.addEventListener("pointercancel", onPointerUp, { capture: true, passive: true });
          const hollowFamilies = new Set<string>();
          // The look at the faces after each page let go was last measured
          // (ledgerFaceScan), by its node.
          const hollowLooks = new WeakMap<PmNode, number>();
          const flushHollow = () => {
            hollowQueued = false;
            if (destroyed || editorView.isDestroyed) return;
            const pages = collectPages(editorView.state.doc);
            const sheets = sheetsOf(editorView.dom);
            if (!pages || pages.length !== sheets.length) return;
            const positionOf = new Map(sheets.map((sheet, index) => [sheet, pages[index]!.pos] as const));
            const positions = (list: readonly HTMLElement[]) => list.map((sheet) => positionOf.get(sheet)).filter((pos): pos is number => pos !== undefined);
            const fill = positions([...toFill].filter((sheet) => sheet.isConnected));
            toFill.clear();
            if (fill.length) holdForTheReader();
            const hollowSheets = hollowQuiet !== undefined ? [] : [...toHollow].filter(hollowable);
            const hollow = positions(hollowSheets);
            for (const sheet of hollowSheets) {
              const pos = positionOf.get(sheet);
              const look = measureCache.settledLook(sheet);
              const page = pos === undefined ? null : editorView.state.doc.nodeAt(pos);
              if (page && look !== undefined) hollowLooks.set(page, look);
            }
            if (hollowQuiet === undefined) toHollow.clear();
            if (!hollow.length && !fill.length) return;
            // The families the pages let go draw with, read while they are
            // drawn: a face of none of them changes no page, hollow or not.
            if (hollow.length) for (const family of editorFontFamilies(editorView.dom)) hollowFamilies.add(family);
            setHollowPages(editorView, { hollow, fill });
            forgetDetachedHorizonSheets(editorView.dom);
            // The sheets drawn hollow are new elements: watched for the reader.
            for (const sheet of Array.from(editorView.dom.querySelectorAll<HTMLElement>(`:scope > article[${HOLLOW_SHEET_ATTR}]`))) nearing?.observe(sheet);
          };
          // A sheet whose layout is known with no DOM: one the engine laid out
          // and the ledger trusts, or one laid out and measured that no pass
          // is still to lay out (its blocks keep their measurements by node).
          // Laid out before the document settled, a measured sheet was never
          // hollowed: on the book every sheet the background verified stayed
          // whole, one hollow sheet in 271.
          // The page a kept layout was restored for (layoutSnapshot).
          let keptLayoutPageId: string | null = null;
          // (Edits by anyone since the kept layout was first taken up.)
          let editsWhenKept = 0;
          let keptWhy = "";
          let keptOverran = false;
          // A page read from a kept layout may read a little otherwise (a
          // block a few pixels off) and stand: its pages are the ones the
          // layout was finished on, and a plan over them is what moves them.
          // A page it no longer holds does not stand.
          let keptPagesToCheck = new Set<PmNode>();
          const keptOverReads = new WeakMap<PmNode, number>();
          const keptPageOverran = () => {
            const read = takeSeededReads(editorView.dom);
            if (read) for (const node of read) keptPagesToCheck.add(node);
            if (keptOverran || !keptPagesToCheck.size) return keptOverran;
            const sheets = sheetsOf(editorView.dom);
            // What the page reads with a formula or a face still on its way
            // is not what it will read: asked again at the next pass.
            const later = new Set<PmNode>();
            const facesComing = editorView.dom.ownerDocument.fonts?.status === "loading";
            editorView.state.doc.forEach((page, _offset, index) => {
              if (keptOverran) return;
              const asked: PmNode[] = [];
              page.forEach((child) => {
                if (keptPagesToCheck.has(child)) asked.push(child);
              });
              if (!asked.length) return;
              const sheet = sheets[index];
              if (!sheet || sheet.hasAttribute(HOLLOW_SHEET_ATTR)) return;
              if (facesComing || sheet.querySelector(UNSIZED_MATH_SELECTOR)) {
                for (const node of asked) later.add(node);
                return;
              }
              if (!sheetRunsPastItsPage(sheet, page)) return;
              // Drawn just now, a face its text needs may only start on its way
              // with this reading: read once more before it is believed.
              const seenOver = keptOverReads.get(asked[0]!) ?? 0;
              if (seenOver < 1) {
                keptOverReads.set(asked[0]!, seenOver + 1);
                for (const node of asked) later.add(node);
                win?.setTimeout(() => schedule(), KEPT_OVER_READ_AGAIN_MS);
                return;
              }
              keptOverran = true;
              traceLedgerPass(editorView, { keptOverran: index, blocks: page.childCount });
            });
            keptPagesToCheck = later;
            return keptOverran;
          };
          const keptStands = () => {
            if (keptLayoutPageId === null) return false;
            let why = "";
            if (authoredEditSeq(editorView) !== editsWhenKept) why = "edited";
            else if (keptPageOverran()) why = "overran";
            else if (!documentVerified(editorView.state.doc)) {
              why = "unread";
              if (ledgerTraceEnabled(editorView)) {
                const unread: string[] = [];
                editorView.state.doc.forEach((page, _offset, index) => {
                  if (unread.length < 16 && !pageVerified(page)) {
                    let blocks = 0;
                    page.forEach((child) => {
                      if (blockVerified(child)) return;
                      blocks += 1;
                      if (blocks === 1) unread.push(`${index}:${child.type.name}:${child.nodeSize}:${Object.keys(child.attrs).filter((key) => child.attrs[key] !== null && key !== "block_id").slice(0, 6).join(",")}`);
                    });
                    unread.push(`${blocks}/${page.childCount}`);
                  }
                });
                why = `unread ${unread.join(" ")}`;
              }
            }
            if (why !== keptWhy) traceLedgerPass(editorView, { keptWhy: why || "stands" });
            keptWhy = why;
            return why === "";
          };
          // With kept layouts on, a settled document is read through once on
          // idle moments, a few pages at a time, drawn and let go again: what
          // it settles on is then the layout it prints, and what the next
          // reader opens on. The reader's input comes first.
          // (The walk runs for kept layouts, and for hollow pages: a page goes
          // hollow once it is read.)
          const snapshotsOn = () => (layoutSnapshotsEnabled() || hollowSheetsEnabled()) && !printing() && !editorView.dom.hasAttribute(NO_HOLLOW_ATTR);
          let verifyTimer: number | undefined;
          let verifyLast: PmNode | null = null;
          const overTallTries = new WeakMap<PmNode, number>();
          let verifyTries = 0;
          let keptSampledFor: string | null = null;
          // The sheets of the parts restored since the last sample.
          let keptSampleRange: { from: number; to: number } | null = null;
          let verifyWalking = false;
          // Laid out, every face in, and no part come in for a while: the
          // document as it will stand (a book's parts come seconds apart).
          // (A part still to come counts: the walk and the pages it lets go
          // move the end of what is in, which a part waits on to hold still.)
          const layoutAtRest = () => pending.size === 0 && pendingIndex === null &&
            editorView.dom.ownerDocument.fonts?.status !== "loading" &&
            msSincePartArrived(editorView.dom) > PARTS_AT_REST_MS &&
            !documentPartsStillToCome(editorView.dom as HTMLElement);
          const queueVerifyWalk = () => {
            if (verifyTimer !== undefined || destroyed || !snapshotsOn()) return;
            verifyTimer = win?.setTimeout(() => {
              verifyTimer = undefined;
              const run = () => verifyWalkStep();
              if (typeof win?.requestIdleCallback === "function") win.requestIdleCallback(run, { timeout: 1000 });
              else run();
            }, VERIFY_WALK_REST_MS);
          };
          const verifyWalkStep = () => {
            if (destroyed || editorView.isDestroyed || !snapshotsOn()) return;
            // Not yet at rest: asked again in a while, not every frame.
            if (keptLayoutPageId === null && !layoutAtRest() && pending.size === 0 && pendingIndex === null) {
              if (verifyTimer === undefined) {
                verifyTimer = win?.setTimeout(() => {
                  verifyTimer = undefined;
                  queueVerifyWalk();
                }, VERIFY_WALK_REST_RETRY_MS);
              }
              return;
            }
            if (hollowQuiet !== undefined || pending.size > 0 || pendingIndex !== null || !ledgerLane.inputQuiet() ||
                isImeCompositionActive(editorView) || editorView.dom.ownerDocument.visibilityState !== "visible") {
              queueVerifyWalk();
              return;
            }
            const doc = editorView.state.doc;
            const pages = collectPages(doc);
            const sheets = sheetsOf(editorView.dom);
            if (!pages || pages.length !== sheets.length) {
              queueVerifyWalk();
              return;
            }
            // A block taller than its page and left so (read once, and no pass
            // since had a reason to come back: a part opened cold among parts
            // from their kept layouts) is laid out now, where it can be cut.
            const capacity = readCapacity(editorView, sheets[0]!) * Math.max(1, sheetColumnCount(sheets[0]!));
            for (let index = 0; index < pages.length; index += 1) {
              const page = doc.child(index);
              if (!pageHoldsBlockOver(page, capacity) || (overTallTries.get(page) ?? 0) >= 2) continue;
              overTallTries.set(page, (overTallTries.get(page) ?? 0) + 1);
              const sheet = sheets[index]!;
              if (sheet.hasAttribute(HOLLOW_SHEET_ATTR)) setHollowPages(editorView, { fill: [pages[index]!.pos] });
              else measureCache.markSheet(sheet);
              pendingIndex = index;
              traceLedgerPass(editorView, { verifyWalk: "over-tall", sheet: index });
              schedule();
              return;
            }
            const unread: number[] = [];
            for (let index = 0; index < pages.length && unread.length < VERIFY_WALK_PAGES; index += 1) {
              if (!pageVerified(doc.child(index)) && (unread.length === 0 || index === unread[unread.length - 1]! + 1)) unread.push(index);
            }
            if (!unread.length) {
              // A kept layout stands on what its row says for pages no one has
              // drawn: a few of them, spread through the document, are read
              // once against it (a run of them differing refutes it below).
              if (keptLayoutPageId !== null && keptSampledFor !== keptLayoutPageId && pages.length >= KEPT_SAMPLE_PAGES) {
                keptSampledFor = keptLayoutPageId;
                const fill: number[] = [];
                // A part restored as it came in is sampled in its own pages, a
                // few of them: sampled through the whole document again, each of
                // a book's eleven parts drew eight far pages (88 in all).
                const range = keptSampleRange;
                keptSampleRange = null;
                const from = range ? Math.max(0, range.from) : 0;
                const to = range ? Math.min(pages.length, range.to) : pages.length;
                const count = range ? Math.min(KEPT_SAMPLE_PER_PART, to - from) : KEPT_SAMPLE_PAGES;
                for (let n = 0; n < count; n += 1) {
                  const index = from + Math.floor(((n + 0.5) * (to - from)) / count);
                  if (sheets[index]?.hasAttribute(HOLLOW_SHEET_ATTR)) fill.push(pages[index]!.pos);
                }
                traceLedgerPass(editorView, { keptSample: fill.length });
                if (fill.length) {
                  setHollowPages(editorView, { fill });
                  schedule();
                  queueVerifyWalk();
                  return;
                }
              }
              verifyWalking = false;
              // All read: what keeps the layout looks again.
              traceLedgerPass(editorView, { verifyWalk: "done" });
              writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_BACKGROUND_ATTR, "true", editorView);
              writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_BACKGROUND_ATTR, null, editorView);
              return;
            }
            // A page that will not read through (it never holds still) ends the
            // walk: nothing is kept of its part, the page is as it would be.
            const firstUnread = doc.child(unread[0]!).firstChild;
            if (firstUnread === verifyLast) verifyTries += 1;
            else verifyTries = 0;
            verifyLast = firstUnread;
            if (verifyTries >= VERIFY_WALK_TRIES) {
              verifyWalking = false;
              traceLedgerPass(editorView, { verifyWalk: "stuck", sheet: unread[0] });
              return;
            }
            const fill: number[] = [];
            for (const index of unread) {
              const sheet = sheets[index]!;
              if (sheet.hasAttribute(HOLLOW_SHEET_ATTR)) fill.push(pages[index]!.pos);
              else measureCache.markSheet(sheet);
            }
            verifyWalking = true;
            if (fill.length) setHollowPages(editorView, { fill });
            schedule();
          };
          const hollowable = (sheet: HTMLElement) => {
            if (!sheet.isConnected || pending.has(sheet)) return false;
            // While the document is still being laid out, or a face is still
            // coming, a page goes hollow only on a kept layout: a face arriving
            // forgets what hollow pages were read on, and every one of them is
            // drawn again for the next pass to read (a book's cold opening: 39,
            // 89, then 155 pages drawn back at once as its CJK subsets came).
            if (keptLayoutPageId === null && !layoutAtRest()) return false;
            // A formula with no typeset size yet was measured lines off, and
            // it is its drawn page that is measured again (remeasureUnsizedMath):
            // hollowed now, its page would stand on that reading for good (the
            // book: 60 of 316 sheets cut elsewhere until the reader reached them).
            if (sheet.querySelector(UNSIZED_MATH_SELECTOR)) return false;
            // Something changed in it since it was read (a formula typeset, a
            // face arrived): read again first. Hollowed now, its page would
            // stand on the old reading for good (a heading at two lines, and
            // fifty pages after it cut elsewhere until the reader reached them).
            // A page only drawn for a reader passing by was never read as drawn:
            // what it stood on before stands.
            if (measureCache.isDirty(sheet) && measureCache.wasSettled(sheet)) return false;
            const index = sheetsOf(editorView.dom).indexOf(sheet);
            const doc = editorView.state.doc;
            if (index < 0 || index >= doc.childCount) return false;
            if (pageHoldsBlockOver(doc.child(index), readCapacity(editorView, sheet) * Math.max(1, sheetColumnCount(sheet)))) return false;
            // Only a page read drawn with every projection in (or kept from a
            // layout that was) goes hollow: one the engine planned and nothing
            // read stays drawn until a pass or the walk reads it. Hollowed on the
            // engine's word, its blocks were read again a few at a time with
            // probes and stood on readings no drawn page gave (the book, docs-hollow
            // alone: 65 of 313 sheets cut otherwise than the same book drawn whole).
            if (!pageVerified(doc.child(index))) return false;
            // And every block of it keeps its measurement by node: a page let go
            // with one missing is drawn again by the next pass that reaches it
            // (the book, once settled: all 312 far pages let go, then drawn back
            // twelve at a time by a pass sweeping the document, for 100 s).
            return pageMeasuresKept(doc.child(index));
          };
          // Settled: every sheet whose layout is known may be drawn hollow
          // while the reader is far from it (docs-hollow). Watched afresh: a
          // sheet already watched since before its layout was known gives
          // no new answer to a second observe(), and stayed whole (the book
          // settled with one hollow sheet in 271 until the reader scrolled).
          // `keep`: sheets around where the background works next, left whole
          // (re-hollowed there, the next pass would draw them again at once).
          const watchHollowable = (keep?: { from: number; to: number }) => {
            if (!nearing || !viewMayDrawHollow(editorView)) return;
            sheetsOf(editorView.dom).forEach((sheet, index) => {
              if (keep && index >= keep.from && index <= keep.to) return;
              if (sheet.hasAttribute(HOLLOW_SHEET_ATTR) || !hollowable(sheet)) return;
              nearing.unobserve(sheet);
              nearing.observe(sheet);
            });
          };
          // Every sheet drawn hollow is watched for the reader, whoever drew it
          // so (the bridge's fill draws a long document's later sheets hollow).
          const watchHollowSheets = () => {
            if (!nearing || !hollowSheetsEnabled()) return;
            for (const sheet of Array.from(editorView.dom.querySelectorAll<HTMLElement>(`:scope > article[${HOLLOW_SHEET_ATTR}]`))) nearing.observe(sheet);
          };
          const queueHollow = () => {
            if (hollowQueued) return;
            hollowQueued = true;
            queueMicrotask(flushHollow);
          };
          const nearing = typeof win?.IntersectionObserver === "function"
            ? new win.IntersectionObserver((entries) => {
              let near = false;
              const hollows = viewMayDrawHollow(editorView);
              for (const entry of entries) {
                const sheet = entry.target as HTMLElement;
                if (!entry.isIntersecting) {
                  // Far, its layout known: hollowed (not while printing).
                  if (hollows && hollowable(sheet) && !printing()) {
                    toHollow.add(sheet);
                    queueHollow();
                  }
                  continue;
                }
                if (sheet.hasAttribute(HOLLOW_SHEET_ATTR)) {
                  nearing?.unobserve(sheet);
                  toFill.add(sheet);
                  // With the next one the way the reader is going: drawn in one
                  // transaction, half as many frames stop for a page. Asked for
                  // by a pass or a jump, the same.
                  const ahead = entry.boundingClientRect.top > 0 ? sheet.nextElementSibling : sheet.previousElementSibling;
                  if (ahead instanceof HTMLElement && ahead.hasAttribute(HOLLOW_SHEET_ATTR)) {
                    nearing?.unobserve(ahead);
                    toFill.add(ahead);
                  }
                  queueHollow();
                  continue;
                }
                // A measured sheet stays watched: hollowed again once the
                // reader is far from it.
                if (!trustedSheets.has(sheet) || !sheet.isConnected) continue;
                nearing?.unobserve(sheet);
                trustedSheets.delete(sheet);
                setSheetUnread(editorView.dom, sheet, false);
                pending.add(sheet);
                near = true;
              }
              if (near && !destroyed) schedule();
            }, { rootMargin: "100% 0px" })
            : null;
          // A print or a picture of the pages (PagePreviewRender) draws every
          // page: there the engine's pages are not trusted, and the metric
          // projections leave no page unread.
          const printing = () =>
            typeof (win as (Window & { __MRAI_PAGE_PREVIEW_SHOW?: unknown }) | null)?.__MRAI_PAGE_PREVIEW_SHOW === "function";
          const trust = (sheet: HTMLElement) => {
            trustedSheets.add(sheet);
            // A page a kept layout or the engine's plan put there stands laid
            // out (a scoped pass may resync at it).
            const at = sheetsOf(editorView.dom).indexOf(sheet);
            if (at >= 0) markLaidOutPages(editorView, at, at + 1);
            // The metric projections leave it unread too (measureHorizon).
            if (!printing()) setSheetUnread(editorView.dom, sheet, true);
            nearing?.observe(sheet);
          };
          const trustsEngine = () => textEngineEnabled("docs-layout") && nearing !== null && !printing();
          let backgroundPasses = 0;
          // Passes that only cut a block at a column boundary or after a
          // nested break (no plan): bounded by the document, not by the
          // convergence budget of one plan.
          let splitPasses = 0;
          let lastScopeStart: number | null = null;
          /** The most pages a plan has reached: the budget is per page. */
          let mostPlannedPages = 0;
          // The last edit range a pass has read (LedgerEditState ids).
          let editsReadThrough = 0;
          // Widened while passes reach past their measurement horizon.
          let horizonReach = 1;
          // A far background step runs in an idle slot (ledgerBackgroundPace):
          // set while it runs, so it neither waits again nor chains the next
          // step into its own task.
          let idleSlot = false;
          // A foreign change (typing, an AI edit) arrived since the last pass.
          let editedSinceLastPass = false;
          // ...and one that was not a document part's append (ledgerPartsArriving).
          let readerEditedSinceLastPass = false;
          let partsPoll: number | undefined;
          // ProseMirror reads `editable` before it builds plugin views and
          // again on every state update. Re-read it now that the gate changed.
          const refreshEditable = () => {
            if (destroyed || editorView.isDestroyed) return;
            const editable = gateExpired || !pagesHiddenForInitialSettle(editorView.dom);
            if (editorView.editable !== editable) editorView.updateState(editorView.state);
          };

          let facesAsked: "not yet" | "asked" | "arrived" = "not yet";
          let printFootChecks = 0;
          const typesetMath = createLedgerTypesetMath(editorView, () => schedule(), eagerBackground);
          // Page-by-page reuse of the measurements: a pass reads again only
          // the sheets that changed. A picture that finished loading changed
          // its sheet without a transaction, so it starts a cycle of its own.
          // A block a pass measured, drawn taller or shorter since without a
          // transaction the ledger saw (a projection's decorations put back
          // in its own frame, a field result or a node view's text drawn
          // late): the pass that would read it again never came, and what
          // the block had pushed to the next page stayed there when it
          // shrank (R417-D03 page 40: a cell's tab stops dropped by a
          // re-cut, then put back). Read here, once a frame, the sheets it
          // changed are laid out again; the pass budget and the cycle watch
          // stay as they are, and at most DRAWN_CHANGE_PASSES such passes
          // follow one change of the document.
          // `window.__docsDrawnChangeWatchOff = true` turns it off (A/B).
          let drawnChangeFrame = 0;
          let drawnChangePasses = 0;
          const drawnChangeSheets = new Set<HTMLElement>();
          const drawnChangeWatchOff = () =>
            (win as (Window & { __docsDrawnChangeWatchOff?: boolean }) | null)?.__docsDrawnChangeWatchOff === true;
          const onMeasuredSheetChanged = (changed: readonly HTMLElement[]) => {
            if (destroyed || !win || drawnChangePasses >= DRAWN_CHANGE_PASSES || drawnChangeWatchOff()) return;
            for (const sheet of changed) drawnChangeSheets.add(sheet);
            if (drawnChangeFrame) return;
            drawnChangeFrame = win.requestAnimationFrame(() => {
              drawnChangeFrame = 0;
              const sheets = [...drawnChangeSheets];
              drawnChangeSheets.clear();
              // A pass already coming reads the changed sheets itself; a
              // ledger stopped on a cycle stays stopped.
              if (destroyed || stalled || raf || turnAsked || editTimer !== undefined || selfDispatching) return;
              if (drawnChangePasses >= DRAWN_CHANGE_PASSES) return;
              const moved = sheets.filter((sheet) => sheet.isConnected && measureCache.drawnHeightChanged(sheet));
              if (moved.length === 0) return;
              drawnChangePasses += 1;
              if (ledgerTraceEnabled(editorView)) {
                const all = sheetsOf(editorView.dom);
                traceLedgerPass(editorView, { drawnChange: { sheets: moved.map((sheet) => all.indexOf(sheet)), passes: drawnChangePasses } });
              }
              schedule();
            });
          };
          const measureCache = new LedgerMeasureCache(editorView.dom, () => {
            passes = 0;
            stalled = false;
            schedule();
          }, onMeasuredSheetChanged);
          // WebKit: the sheets far from the reader that this ledger measured
          // as they stand leave the render tree (sheetDormancy).
          const dormancy = createSheetDormancy(editorView, {
            isMeasured: (sheet) => measureCache.isMeasured(sheet),
            isPending: (sheet) => pending.has(sheet),
            inputQuiet: () => ledgerLane.inputQuiet(),
            ready: () => settledOnce && !editorView.dom.hasAttribute(PAGED_BULK_FILL_ATTR),
          });
          // Laying the pages out once on opening (L3-DESIGN): the first pass
          // waits for the room the headers and footers take, read as soon as
          // the fill ended. Passes laid out with the margins alone all go
          // when the bands arrive, every page of the document moved. The
          // wait ends once, and it is bounded: a band that cannot be read
          // holds nothing up.
          let bandWaitStarted: number | null = null;
          let bandWaitOver = false;
          const bandsHoldFirstPass = (): boolean => {
            if (bandWaitOver) return false;
            if (settledOnce || !bandsFirst() || !editorView.dom.hasAttribute(PAGE_BANDS_MEASUREMENT_PENDING_ATTR)) {
              bandWaitOver = true;
              return false;
            }
            bandWaitStarted ??= performance.now();
            if (performance.now() - bandWaitStarted < FIRST_PASS_BAND_WAIT_MAX_MS) return true;
            bandWaitOver = true;
            return false;
          };
          // What is typed while the pages are held back goes in when they show, at
          // the insertion point, in the order typed: the reader sees a blank page
          // for a moment, a keyboard does not (corpus R329-D02: five keys lost).
          // A document with a room is written to a moment after its pages show:
          // the keys of that moment wait for it too, and for no longer than this.
          const LONGEST_WAIT_TO_WRITE_MS = 30_000;
          let heldKeys = "";
          let keysStillHeld = false;
          let keysGiveUp: ReturnType<typeof setTimeout> | undefined;
          let keysWindowId: string | null = null;
          const ownerDocument = editorView.dom.ownerDocument;
          const holdKey = (event: KeyboardEvent) => {
            if (!keyTypesCharacter(event)) return;
            if (editorView.editable) return;
            if (windowHoldsKeysFor(editorView.dom)) return;
            const held = editorView.dom.closest(".wm-window");
            if (held && !held.classList.contains("wm-window--focused")) return;
            if (hostHasTheKeyboard(held ?? editorView.dom, ownerDocument)) heldKeys += event.key;
          };
          const heldKeysOn = !editorView.dom.classList.contains("sheet-band-story");
          if (heldKeysOn) ownerDocument.addEventListener("keydown", holdKey, true);
          const releaseHeldKeys = () => {
            if (!heldKeysOn) return;
            keysWindowId = windowIdAround(editorView.dom) ?? keysWindowId;
            heldKeys = takeKeysHeldForWindow(editorView.dom) + heldKeys;
            if (!destroyed && !editorView.isDestroyed && !editorView.editable) {
              if (!keysStillHeld) {
                keysStillHeld = true;
                keysGiveUp = setTimeout(() => {
                  keysStillHeld = false;
                  heldKeys = "";
                  ownerDocument.removeEventListener("keydown", holdKey, true);
                }, LONGEST_WAIT_TO_WRITE_MS);
              }
              return;
            }
            keysStillHeld = false;
            if (keysGiveUp !== undefined) clearTimeout(keysGiveUp);
            ownerDocument.removeEventListener("keydown", holdKey, true);
            const text = heldKeys;
            heldKeys = "";
            if (!text || destroyed || editorView.isDestroyed) return;
            editorView.focus();
            editorView.dispatch(editorView.state.tr.insertText(text));
          };
          const showPagesBeforeSettled = () => {
            if (gateTimer !== undefined) win?.clearTimeout(gateTimer);
            gateTimer = undefined;
            gateExpired = true;
            writeDocumentLayoutStatus(editorView.dom, INITIAL_SETTLE_SHOWN_ATTR, "true", editorView);
            refreshEditable();
            releaseHeldKeys();
          };
          // The input gate's bounded time is up. A first layout still waiting
          // for the document's own faces (the source font plan, loading under
          // its own deadline: sourceFontPlanIsReady) is held back a while
          // longer: shown, its pages stood in the fallback faces and line
          // heights and moved under the reader once the faces came (a
          // 12,000-paragraph book: shown at 8.6 s, its lines respaced at 12 s,
          // its page count going from "about 170" to "about 487"). The pass
          // that has the faces shows the first page as soon as it stands
          // (firstPageStands). The wait is bounded too: GATE_FACES_GRACE_MS
          // past the gate's own time, the pages are shown as they stand.
          // Whether the first layout may be composed as far as the faces go:
          // the faces of the sheets on screen are loaded, or it has waited for
          // them as long as it may. A face still loading brings the pass back
          // when it settles, the end of the wait brings it back in any case.
          // The document's display font plan still being read: whatever the
          // document was imported from, the plan sets the faces' line boxes
          // (an unbound plan too), and a layout composed before it moved when
          // it came. Its answer nudges the ledger (mrn-page-rebalance).
          const displayFontPlanLoading = (): boolean =>
            waitForSourceFontPlan && editorView.dom.getAttribute("data-document-display-fonts") === "loading";
          const screenFacesReady = (): boolean => {
            const now = performance.now();
            if (now >= facesHoldUntil) return true;
            if (!displayFontPlanLoading() && screenFacesLoaded(editorView, sheetsOf(editorView.dom), screenFacesAsked, () => schedule())) return true;
            if (facesTimer === undefined) {
              facesTimer = win?.setTimeout(() => { facesTimer = undefined; schedule(); }, Math.max(0, facesHoldUntil - now));
            }
            return false;
          };
          let gateGraceEndsAt: number | null = null;
          const giveGateUp = () => {
            gateTimer = undefined;
            if (settledOnce || gateExpired || destroyed || editorView.isDestroyed) return;
            const now = performance.now();
            const facesPending = displayFontPlanLoading() ||
              !screenFacesLoaded(editorView, sheetsOf(editorView.dom), screenFacesAsked, () => schedule());
            // The faces held the first layout and let it go so late that its
            // pass has not composed yet: shown now, the pages stood unlaid out
            // (a long book's first screen at the gate's 6.1 s, laid out at
            // 8.1 s). It has the grace as a layout still waiting for them.
            const firstLayoutDue = fontsHeldFirstLayout && !composedSinceSettleOpened;
            const waiting = facesPending || firstLayoutDue;
            if (gateGraceEndsAt === null) {
              if (!waiting) {
                showPagesBeforeSettled();
                return;
              }
              gateGraceEndsAt = now + GATE_FACES_GRACE_MS;
            }
            const left = gateGraceEndsAt - now;
            if (left <= 0) {
              showPagesBeforeSettled();
              return;
            }
            // While the faces load, look again shortly; once they have
            // answered, the rest of the grace is the pass's to show the page.
            gateTimer = win?.setTimeout(waiting ? giveGateUp : showPagesBeforeSettled, waiting ? Math.min(GATE_FACES_POLL_MS, left) : left);
          };
          const finishInitial = () => {
            if (settledOnce) return;
            holdFirstLayoutForFaces(editorView.dom, false);
            takeRestoredLayout(editorView.dom);
            settledOnce = true;
            initialSettleDone = true;
            if (gateTimer !== undefined) {
              win?.clearTimeout(gateTimer);
              gateTimer = undefined;
            }
            writeDocumentLayoutStatus(editorView.dom, INITIAL_PAGINATION_SETTLING_ATTR, null, editorView);
            writeDocumentLayoutStatus(editorView.dom, INITIAL_SETTLE_SHOWN_ATTR, null, editorView);
            writeDocumentLayoutStatus(editorView.dom, "aria-busy", null, editorView);
            refreshEditable();
            releaseHeldKeys();
          };

          let flushingMetrics = false;
          let frameStartedAt = 0;
          // A pass moved the pages and another follows to read what it made:
          // the layout is not the document's yet. Cleared between the two
          // passes, a reader polling the marks saw a settled document that
          
          // it opened, 13 sheets, two of them 1.4k and 2.5k px over their foot,
          // the ledger still dispatching): a capture, a print, the layout
          // receipt kept for the next opening all read a layout in passing.
          let settlingAfterMove = false;
          const setDeferred = (deferred: boolean, why = "") => {
            if (ledgerTraceEnabled(editorView) && (editorView.dom.getAttribute(PAGE_LEDGER_DEFERRED_ATTR) === "true") !== deferred) {
              traceLedgerPass(editorView, { deferred, why });
            }
            writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_DEFERRED_ATTR, deferred ? "true" : null, editorView);
            // Background composition: the pages past its position are not
            // the document's layout yet (no capture, no "settled" fact).
            if (!deferred && !settlingAfterMove) writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_BACKGROUND_ATTR, null, editorView);
            else if (why === "background") writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_BACKGROUND_ATTR, "true", editorView);
          };
          // The pass limit was reached on layouts that keep alternating. The
          // pages as they stand are the layout from here on, until the next
          // change: nothing may wait for this layout to finish (print, export,
          // a capture, the lifecycle facts all read the stall and background
          // marks as "not yet"), so both go and only a diagnostic stays. Left
          // set, a 15-page document (R26-D04) was never ready to print.
          const layoutCycle = createLayoutCycleWatch();
          // The pages held against an alternation on which the background
          // went on (below), since the last authored edit.
          const heldGoingOn = new Set<number>();
          const laidPastRound = new Set<number>();
          let heldGoingOnSeq: number | null = null;
          const seamWander = createSeamWanderWatch();
          const stopOnCycle = () => {
            stalled = true;
            traceLedgerPass(editorView, { stalled: "ledger-cycle", passes, backgroundPasses, pending: pending.size, pendingFrom: pendingIndex });
            pending.clear();
            pendingIndex = null;
            settlingAfterMove = false;
            setDeferred(false, "ledger-cycle");
            writeDocumentLayoutStatus(editorView.dom, PAGINATION_STALLED_ATTR, null, editorView);
            writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_CYCLE_ATTR, "true", editorView);
            finishInitial();
          };
          // A round of layouts (any of the cycle watches below) met while the
          // background still has pages to lay out does not stop it: stopped,
          // the pages past the round kept the layout they had (a long book:
          // the 333 pages after page 475 in the face before the last one came,
          // for good). The page the round turns on is held as it stands (the
          // page before it takes no more: a refusal) and the background goes
          // on. A second round on a page already held lays the pages after it
          // out from there, the pages up to it taken as they stand (no longer
          // pending). Once per page and per edit; only a round with no page
          // left to lay out stops the ledger.
          const roundPage = (outcome: LedgerPassOutcome): number | null => {
            if (outcome.heldPage !== undefined) return outcome.heldPage;
            const last = lastLedgerDispatch.get(editorView);
            if (last && last.doc === editorView.state.doc) {
              const page = last.after.findIndex((start, index) => start !== last.before[index]);
              if (page > 0) return page;
            }
            return outcome.scope ? Math.max(1, outcome.scope.startPage) : null;
          };
          const goOnPastRound = (outcome: LedgerPassOutcome, why: string, at?: number): boolean => {
            if (!(pending.size > 0 || pendingIndex !== null)) return false;
            const seq = authoredEditSeq(editorView);
            if (heldGoingOnSeq !== seq) { heldGoingOn.clear(); laidPastRound.clear(); heldGoingOnSeq = seq; }
            const page = at ?? roundPage(outcome);
            if (page === null || page < 1) return false;
            const sheets = sheetsOf(editorView.dom);
            if (!heldGoingOn.has(page)) {
              heldGoingOn.add(page);
              if (outcome.heldPage === undefined) {
                const capacityPx = outcome.build?.capacities[page - 1] ?? 0;
                refusals.record(editorView.state.doc, [{ sheet: page - 1, capacityPx }]);
              }
              traceLedgerPass(editorView, { cycleHeldGoesOn: { page, why, pending: pending.size } });
            } else if (!laidPastRound.has(page)) {
              laidPastRound.add(page);
              for (let index = 0; index <= Math.min(page, sheets.length - 1); index += 1) pending.delete(sheets[index]!);
              if (pendingIndex !== null && pendingIndex <= page) pendingIndex = page + 1 < sheets.length ? page + 1 : null;
              traceLedgerPass(editorView, { cycleLaidPast: { page, why, pending: pending.size } });
              if (!(pending.size > 0 || pendingIndex !== null)) return false;
            } else return false;
            layoutCycle.forget();
            seamWander.forget();
            passes = 0;
            backgroundPasses = 0;
            splitPasses = 0;
            return true;
          };
          // `run` is the frame callback (rAF hands it a timestamp, so the
          // chained form is a separate function): one frame's composition.
          // A paragraph as long as a book (opened or just pasted) is cut into
          // pieces before anything lays it out (ledgerGiantBlocks). As soon as
          // a change shows one: the measurements that wait for a frame run
          // after this.
          let giantLook = false;
          const cutGiantBlocks = () => {
            if (destroyed || editorView.isDestroyed) return;
            if (editorView.dom.hasAttribute(PAGED_BULK_FILL_ATTR) || paginationIsSuspended(editorView) || isImeCompositionActive(editorView)) return;
            // Harness A/B (`window.__docsGiantBlocksOff`): the paragraph laid out whole.
            if ((win as (Window & { __docsGiantBlocksOff?: boolean }) | null)?.__docsGiantBlocksOff) return;
            if (!docHoldsGiantTextBlock(editorView.state.doc)) return;
            const tr = editorView.state.tr;
            if (!splitGiantTextBlocks(tr)) return;
            tr.setMeta(REBALANCE_META, true).setMeta("addToHistory", false);
            selfDispatching = true;
            try {
              safeDispatch(editorView, tr);
            } finally {
              selfDispatching = false;
            }
            schedule();
          };
          const lookForGiantBlocks = () => {
            if (giantLook) return;
            giantLook = true;
            queueMicrotask(() => {
              giantLook = false;
              cutGiantBlocks();
            });
          };
          let lastHeld = "";
          const held = (why: string) => {
            if (why === lastHeld || !ledgerTraceEnabled(editorView)) return;
            lastHeld = why;
            traceLedgerPass(editorView, { composeHeld: why });
          };
          const compose = (chained: boolean) => {
            raf = 0;
            if (!chained) frameStartedAt = performance.now();
            if (destroyed || editorView.isDestroyed) return;
            // Before any hold: the faces load while the pass waits for the rest.
            askKatexFacesIfFormulas(editorView);
            // The reader is scrolling through pages drawn just now: the pass
            // comes when that stops (flushHollow's timer schedules it).
            if (hollowQuiet !== undefined) {
              held("reader scrolling");
              return;
            }
            // A document's parts still coming in: pages past the reader are laid
            // out once they are in, or once none has come for a while.
            if (partsArrivingHoldOn(editorView)) {
              const sheets = sheetsOf(editorView.dom);
              let frontier = pendingIndex ?? Number.POSITIVE_INFINITY;
              for (const sheet of pending) {
                const index = sheets.indexOf(sheet);
                if (index >= 0 && index < frontier) frontier = index;
              }
              const hasFrontier = Number.isFinite(frontier);
              const parts = partsState(editorView.dom as HTMLElement, () => documentPartsStillToCome(editorView.dom as HTMLElement));
              if (holdForArrivingParts({
                settledOnce,
                readerEdited: readerEditedSinceLastPass,
                partsToCome: parts.toCome,
                partLoading: parts.loading,
                eager: parts.eager,
                msSincePart: msSincePartArrived(editorView.dom),
                frontier: hasFrontier ? frontier : null,
                frontierFar: hasFrontier && backgroundIsFar(frontier, visibleSheetRange(editorView, sheets)),
              })) {
                held("parts arriving");
                if (win && partsPoll === undefined) {
                  partsPoll = win.setTimeout(() => {
                    partsPoll = undefined;
                    schedule();
                  }, PARTS_ARRIVING_POLL_MS);
                }
                return;
              }
            }
            lastHeld = "";
            cutGiantBlocks();
            watchHollowSheets();
            // A sheet this pass may read wakes before anything is read (the
            // measurements it was put to sleep on were forgotten, it changed).
            dormancy?.wakeIneligible();
            // The bridge is still appending the document's sheets: a pass now
            // would lay out a document that ends early, then again for every
            // chunk. The first pass waits for the last chunk; the hidden
            // pages stay hidden meanwhile. The bridge lifts the flag before
            // its last dispatch, which schedules a pass; a short poll covers
            // a fill that ends without one (the room changed mid-fill).
            if (editorView.dom.hasAttribute(PAGED_BULK_FILL_ATTR)) {
              if (win && fillPoll === undefined) {
                fillPoll = win.setTimeout(() => {
                  fillPoll = undefined;
                  schedule();
                }, BULK_FILL_POLL_MS);
              }
              held("bulk fill");
              return;
            }
            // Pages restored from a kept layout (layoutSnapshot): its fonts must
            // read here as they did then, before anything believes the pages;
            // then each block has the measurement kept, and a far page plans
            // with none of it drawn.
            const snapshot = restoredSnapshotOf(editorView.dom);
            if (snapshot) {
              if (snapshot.state === "new") {
                snapshot.state = "checking";
                const toCheck = snapshot.printParts ?? [{ row: snapshot.row, content: snapshot.content }];
                const checkNow = () => Promise.all(toCheck.map((part) => rowFontsHold(part.row, part.content))).then((holds) => holds.every(Boolean));
                void (snapshot.printParts ? checkNow() : snapshotFontsHold(snapshot, checkNow)).then((hold) => [hold]).then((holds) => {
                  snapshot.state = holds.every(Boolean) ? "holds" : "refused";
                  schedule();
                }).catch(() => {
                  snapshot.state = "refused";
                  schedule();
                });
              }
              if (snapshot.state === "checking") {
                if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "snapshot fonts" });
                return;
              }
              dropRestoredSnapshot(editorView.dom);
              // (The part's pages stand first: no pass ran while its faces were
              // checked, and the parts after it may have come in meanwhile.)
              const rowPages = snapshot.row.measures;
              // (And the last holds what the next part carried onto it after its own.)
              const pagesNow = sheetNodes(editorView.state.doc).slice(0, rowPages.length)
                .map((page, index) => (index === rowPages.length - 1 ? page.slice(0, rowPages[index]!.length) : page));
              keptLayoutPageId = snapshot.pageId;
              editsWhenKept = authoredEditSeq(editorView);
              if (snapshot.state === "holds" && snapshot.printParts) {
                // Each part's blocks take the measurements its row keeps, read
                // off the pages as they stand (a part that continues another
                // begins on its last page, after the blocks that part left there).
                const pages = sheetNodes(editorView.state.doc);
                let page = 0;
                let offset = 0;
                let seeded = 0;
                for (const part of snapshot.printParts) {
                  const own: PmNode[][] = [];
                  for (const kept of part.row.measures) {
                    const on = pages[page];
                    if (!on) break;
                    own.push(on.slice(offset, offset + kept.length));
                    if (offset + kept.length >= on.length) {
                      page += 1;
                      offset = 0;
                    } else offset += kept.length;
                  }
                  if (seedPartMeasures(own, part.row)) seeded += 1;
                }
                traceLedgerPass(editorView, { snapshotPrint: snapshot.printParts.length, seeded });
              } else if (snapshot.state === "holds" && seedPartMeasures(pagesNow, snapshot.row)) {
                noteRestoredPart(snapshot.pageId, snapshot.row.part, pagesNow);
                traceLedgerPass(editorView, { snapshotSeeded: snapshot.row.part });
              } else {
                markRestoredLayout(editorView.dom, false);
                traceLedgerPass(editorView, { snapshotRefused: snapshot.state });
              }
            }
            if (paginationIsSuspended(editorView)) {
              if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "suspended" }); 
              passes = 0;
              if (settlingAfterMove) {
                settlingAfterMove = false;
                if (pending.size === 0 && pendingIndex === null) setDeferred(false, "suspended");
              }
              // Unpaginated views still draw Word's content-fit widths.
              if (!metricsPending(editorView)) {
                projectWordAutofitTables(editorView);
                measureOutsideEditorObservation(editorView, () => projectWordRowspanHeights(editorView));
              }
              finishInitial();
              return;
            }
            if (isImeCompositionActive(editorView)) {
              // The composed text may already run past the page's foot; the
              // sheet grows under it until the composition settles.
              pendingAfterComposition = true;
              setDeferred(true, "ime");
              return;
            }
            if (noteBodyFocused(editorView)) {
              pendingAfterNoteEdit = true;
              held("note body");
              return;
            }
            // An IME or slow-edit deferral ends with this pass; a background
            // one ends when the document converged (below), not twice a frame.
            if (pending.size === 0 && pendingIndex === null) setDeferred(false);
            if (bandsHoldFirstPass()) {
              if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "bands" }); 
              schedule();
              return;
            }
            if (!sourceFontPlanIsReady(editorView.state.doc, editorView.dom, waitForSourceFontPlan)) {
              if (!settledOnce) fontsHeldFirstLayout = true;
              if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "source-fonts" });
              return;
            }
            if (!settledOnce && !screenFacesReady()) {
              fontsHeldFirstLayout = true;
              if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "screen-faces" });
              return;
            }
            // The faces are in (or waited for as long as they may be): the
            // line projections held meanwhile are scheduled now, and the
            // flush below reads them in this frame (coldFirstLayout).
            holdFirstLayoutForFaces(editorView.dom, false);
            // The background's pages far past the reader's wait for a pause.
            if (waitForIdleSlot()) { if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "idle-slot" }); return; }
            // A long document is laid out progressively: this pass measures
            // (and typesets, and has its line metrics projected) only as far
            // as it can lay out (see progressiveHorizon, measureHorizon).
            const bypassCache = Boolean((win as (Window & { __pageLedgerNoCache?: boolean }) | null)?.__pageLedgerNoCache);
            // The background takes larger steps once the pages are shown,
            // unless an edit is what this pass answers.
            const coldTuning = coldFirstLayout(win);
            const pagesPerPass = !settledOnce && coldTuning && !editedSinceLastPass
              ? coldTuning.window
              : !settledOnce || editedSinceLastPass
              ? LEDGER_WINDOW_MIN_PAGES
              // Nobody has touched the app for a while: a step's work done once
              // whatever its pages is worth sharing out over more of them. Four
              // pages a step on a loaded machine took R279-D30 33 steps and 34 s
              // from its plan to its last page, twelve 12 steps and 18 s.
              : pinnedBackgroundPages === null && ledgerLane.sinceLastKeyOrPress() >= FAR_STEP_REST_AFTER_MS && ledgerLane.inputQuiet()
                ? Math.max(backgroundPagesPerPass, lastRestStepMs > REST_STEP_SLOW_MS ? PROGRESSIVE_BACKGROUND_PAGES : restStepPages(editorView.dom))
                : backgroundPagesPerPass;
            const restStep = pagesPerPass > backgroundPagesPerPass;
            editedSinceLastPass = false;
            readerEditedSinceLastPass = false;
            for (const range of takeRestoredSheets(editorView.dom)) {
              if (keptLayoutPageId === null) editsWhenKept = authoredEditSeq(editorView);
              keptLayoutPageId = range.pageId;
              // (Checked again with this part in, in its own pages.)
              keptSampledFor = null;
              keptSampleRange = keptSampleRange
                ? { from: Math.min(keptSampleRange.from, range.from), to: Math.max(keptSampleRange.to, range.to) }
                : { from: range.from, to: range.to };
              sheetsOf(editorView.dom).slice(range.from, range.to).forEach((sheet) => {
                if (!measureCache.isMeasured(sheet)) trust(sheet);
              });
              traceLedgerPass(editorView, { restoredSheets: range });
            }
            const progressive = bypassCache ? null : progressiveHorizon(editorView, measureCache, pending, pagesPerPass, horizonReach, trustedSheets, !settledOnce);
            let projectAgain = false;
            if (progressive) {
              // The sheets this pass may measure anew, and the changed ones
              // before them (a sheet laid out earlier and unchanged keeps its
              // projection; reading it would lay it out again).
              const all = sheetsOf(editorView.dom);
              const range = new Set<Element>();
              all.forEach((sheet, index) => {
                if (index > progressive.horizon.maxSheet || index < progressive.startPage) return;
                if (index >= progressive.horizon.fromSheet || !measureCache.isMeasured(sheet)) {
                  range.add(sheet);
                  // A sheet the engine's plan left unread that this pass reads
                  // is no longer unread: the metric projections leave an unread
                  // sheet alone, and the page's lines were cut at the bare font
                  // size (R279-D30: 59 lines to a sheet where Word has 51, and
                  // 137 to 139 pages where it has 141).
                  if (trustedSheets.has(sheet)) {
                    nearing?.unobserve(sheet);
                    trustedSheets.delete(sheet);
                    setSheetUnread(editorView.dom, sheet, false);
                  }
                }
              });
              setMeasureHorizon(editorView.dom, range);
              // Sheets the line-metric projection has not measured yet: ask
              // for them now, whether or not a projection is pending.
              projectAgain = !projectionCoversHorizon(editorView.dom, range);
            } else if (bypassCache || !progressiveEligible(editorView)) {
              setMeasureHorizon(editorView.dom, null);
              projectAgain = !projectionCoversHorizon(editorView.dom, null);
            }
            // (A long document every sheet of which is measured keeps its
            // horizon: its whole-document verification reads the measurements
            // it has, and the projection keeps what it projected.)
            //
            // Formulas are measured as their exact typeset boxes (the typeset
            // clone's placeholders, ledgerTypesetMath): typesetting them in
            // the page first put a KaTeX tree back for every formula the
            // background reached.
            const tFlush = performance.now();
            if (projectAgain || metricsPending(editorView)) {
              // The line boxes this page depends on are still waiting for
              // their own frame: measure them now, in this frame (Word lays
              // out the lines before it paints the page), and only wait for
              // a frame when something genuinely asynchronous (a font) holds.
              flushingMetrics = true;
              try {
                // One projection may wait on another (CJK spacing on Auto
                // line spacing): flush until a round clears nothing more.
                for (let round = 0; round < 3 && ((round === 0 && projectAgain) || metricsPending(editorView)); round += 1) {
                  const before = pendingMetricsKey(editorView);
                  editorView.dom.dispatchEvent(new CustomEvent(LAYOUT_METRICS_FLUSH_EVENT));
                  if (pendingMetricsKey(editorView) === before) break;
                }
              } finally {
                flushingMetrics = false;
              }
              if (metricsPending(editorView)) {
                if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "metrics", pendingKey: pendingMetricsKey(editorView) }); 
                schedule();
                return;
              }
              // A long flush (the CJK spacing of the horizon's changed
              // sheets: up to 0.9 s of a 1.6 s pass on the 298-page book)
              // ends this task: the pass measures in the next frame, with
              // the lines the flush drew, and the input waiting in between
              // is handled first.
              stepFlushMs += performance.now() - tFlush;
              // Once: a flush that takes as long in the next frame is measured
              // after, so a slow projection can never hold the pass.
              if (!yieldedAfterFlush && performance.now() - tFlush > FLUSH_YIELD_MS) {
                yieldedAfterFlush = true;
                schedule();
                return;
              }
            }
            yieldedAfterFlush = false;
            if (!gridSurfaceReady(editorView) && gridRetries < 120) {
              // The surface attribute observer below re-schedules once the grid paints.
              gridRetries += 1;
              schedule();
              return;
            }
            // A surface that never paints the declared grid (one handed no
            // document attributes) is laid out without it: holding the first
            // pass for it left the document settling for good, and every
            // print of it waited out its timeout.
            if (gridSurfaceReady(editorView)) gridRetries = 0;
            // Pending lazy formulas have no trustworthy height until the
            // typeset clone supplied their placeholder geometry.
            if (eagerBackground && facesAsked !== "arrived") {
              if (facesAsked === "not yet") {
                facesAsked = "asked";
                const arrived = () => {
                  if (facesAsked === "arrived") return;
                  facesAsked = "arrived";
                  schedule();
                };
                void loadFacesTheTextDraws(editorView.dom, editorView.state.doc.textContent).then(arrived, arrived);
                win?.setTimeout(arrived, PRINT_FACES_WAIT_MS);
              }
              if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "faces" });
              return;
            }
            const tTypeset = performance.now();
            if (!typesetMath.ensure(eagerBackground ? null : progressive?.horizon.maxSheet ?? null)) { if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { composeHeld: "typeset-math" }); return; }
            const tTypeset2 = performance.now();
            // Keep the leading-space + column-flow DOM attributes the CSS
            // margin rules key off in step with the current sheets.
            const pages = collectPages(editorView.state.doc);
            if (!pages) {
              // Not a sheeted document: there is nothing to paginate.
              projectWordAutofitTables(editorView);
              measureOutsideEditorObservation(editorView, () => projectWordRowspanHeights(editorView));
              passes = 0;
              writeDocumentLayoutStatus(editorView.dom, PAGINATION_STALLED_ATTR, null, editorView);
              finishInitial();
              return;
            }
            const sheets = sheetsOf(editorView.dom);
            if (sheets.length !== pages.length) {
              // Node views can trail the model by a frame; a surface that
              // never commits its sheets must not hold the document busy
              // forever — finish, but flag the layout so no projection is
              // captured from it.
              sheetRetries += 1;
              if (sheetRetries < 120) {
                held("sheets pending");
                schedule();
              } else {
                writeDocumentLayoutStatus(editorView.dom, PAGINATION_STALLED_ATTR, "sheets-pending", editorView);
                finishInitial();
              }
              return;
            }
            sheetRetries = 0;
            // (The cold first layout opens on provisional sheets, the first of
            // which may stand as a page before any pass laid it out: shown, it
            // took the blocks the pass brought back from the next sheet under
            // the reader. Only a page a pass laid out shows the pages early.)
            if (!settledOnce && !gateExpired && firstPageStands(sheets) &&
                (!coldTuning || pagesLaidOut(editorView)(0))) showPagesBeforeSettled();
            if (pendingIndex !== null) {
              const sheet = sheets[Math.min(pendingIndex, sheets.length - 1)];
              if (sheet) pending.add(sheet);
              pendingIndex = null;
            }
            // A pending sheet that left the document (its page was drained)
            // has nothing left to lay out.
            for (const sheet of pending) if (!sheets.includes(sheet)) pending.delete(sheet);

            let outcome: LedgerPassOutcome;
            selfDispatching = true;
            try {
              // `window.__pageLedgerNoCache` (development A/B): every pass
              // reads the whole document, as before the page-by-page reuse.
              const bypass = bypassCache;
              // A settled document lays out the reader's pages first and the
              // rest in later frames; so does the initial settle of a long
              // document (its first pages are shown as soon as they are laid
              // out). The initial settle of a short one (and a pass without
              // the measurement cache) lays out the whole document at once.
              const passScope: LedgerPassScope | null = (settledOnce || progressive) && !bypass
                ? {
                    pending,
                    visible: progressive?.visible ?? visibleSheetRange(editorView, sheets),
                    minPages: LEDGER_WINDOW_MIN_PAGES,
                    progressive: progressive ? progressiveScope(progressive.pagesPerPass) : null,
                  }
                : null;
              const passStarted = performance.now();
              const backgroundStep = pending.size > 0 || pendingIndex !== null;
              const edits = (pageLedgerKey.getState(editorView.state) as LedgerEditState | undefined)?.ranges ?? [];
              const unread = edits.filter((range) => range.id > editsReadThrough);
              outcome = withPaginationScaleReuse(() =>
                runLedgerPass(editorView, bypass ? null : measureCache, refusals, passScope, progressive?.horizon ?? null, unread, keptStands));
              if (!outcome.widenHorizon && unread.length > 0) editsReadThrough = Math.max(...unread.map((range) => range.id));
              // How long a pass takes between two keystrokes is the edit's
              // own pass; a background step (the rest of a long document) is
              // not what the next key waits for.
              if (!backgroundStep) lastPassMs = performance.now() - passStarted;
              else {
                const stepMs = performance.now() - passStarted + stepFlushMs;
                if (restStep) lastRestStepMs = stepMs;
                // A harness pins the step's size (see backgroundPagesPinned).
                if (pinnedBackgroundPages === null) {
                  stepSizing = nextStepSizing({ ...stepSizing, pages: backgroundPagesPerPass }, stepMs, {
                    minPages: LEDGER_WINDOW_MIN_PAGES,
                    maxPages: PROGRESSIVE_BACKGROUND_PAGES,
                    slowMs: SLOW_BACKGROUND_STEP_MS,
                    quickMs: QUICK_BACKGROUND_STEP_MS,
                  });
                  backgroundPagesPerPass = stepSizing.pages;
                }
              }
              stepFlushMs = 0;
              composedSinceSettleOpened = true;
              inkTraceWork(backgroundStep ? "ledger-bg" : "ledger", performance.now() - passStarted);
              if (ledgerTraceEnabled(editorView)) {
                traceLedgerPass(editorView, { composeTiming: {
                  flush: Math.round(tTypeset - tFlush),
                  typeset: Math.round(tTypeset2 - tTypeset),
                  pass: Math.round(performance.now() - passStarted),
                  before: Math.round(tFlush - frameStartedAt),
                } });
              }
            } catch (error) {
              selfDispatching = false;
              writeDocumentLayoutStatus(editorView.dom, PAGINATION_STALLED_ATTR, "ledger-error", editorView);
              if (process.env.NODE_ENV !== "production") console.error("[pageLedger]", error);
              finishInitial();
              return;
            } finally {
              selfDispatching = false;
              measureCache.flushOwn();
            }
            if (outcome.widenHorizon) {
              for (const sheet of outcome.unplannedChanged ?? []) pending.add(sheet);
              horizonReach = Math.min(16, horizonReach * 2);
              schedule();
              return;
            }
            horizonReach = 1;
            // Book-keep the pages still to lay out: the pages this pass
            // covered are done, the page it yielded at is pending.
            if (outcome.scope) {
              const covered = outcome.build?.sheets.slice(outcome.scope.startPage, outcome.scope.stopPage ?? undefined) ?? [];
              for (const sheet of covered) pending.delete(sheet);
              if (outcome.scope.yieldedAt !== null) {
                const after = sheetsOf(editorView.dom);
                const sheet = after[outcome.scope.yieldedAt] ?? null;
                if (sheet) pending.add(sheet);
                else pendingIndex = outcome.scope.yieldedAt;
              }
              for (const sheet of outcome.scope.leaves) pending.add(sheet);
            } else if (outcome.plan) {
              pending.clear();
              pendingIndex = null;
            }
            // (A pass without a plan laid no page out: an unequal-column or
            // nested-break cut, or a document whose sheets had not committed.
            // The pages still to lay out stay pending. Dropped, the
            // background stopped where the cut came: every later pass
            // resynced on pages it had never laid out (R13-D13: from its
            // ninth page on as the first estimate left them, 22 pages for 20).)
            // Pages this pass read drawn, within its horizon (their projections
            // ran first): read for good (layoutSnapshot keeps only those).
            if ((progressive || outcome.converged) && snapshotsOn()) {
              const readSheets = sheetsOf(editorView.dom);
              const docNow = editorView.state.doc;
              const firstRead = progressive?.startPage ?? 0;
              const lastRead = progressive?.horizon.maxSheet ?? readSheets.length - 1;
              for (let index = firstRead; index <= lastRead && index < readSheets.length && index < docNow.childCount; index += 1) {
                const read = readSheets[index]!;
                if (!read.hasAttribute(HOLLOW_SHEET_ATTR) && measureCache.isMeasured(read)) markPageVerified(docNow.child(index));
              }
            }
            if (outcome.converged) {
              pending.clear();
              pendingIndex = null;
              watchHollowable();
              queueVerifyWalk();
            }
            // A pass that changed nothing found the engine's far pages where
            // its plan puts them: they stand as they are, unread, until the
            // reader nears them (docs-layout; L3-DESIGN step 4).
            // A pass that moved pages leaves the sheets its plan did not touch
            // as they were: the engine's among them stand too, and the
            // background does not walk them a window at a time to find that
            // out (the book after its first plan to the end: 255 sheets laid
            // out again four pages a pass).
            if (outcome.build?.engineSheets?.size && trustsEngine() && (!outcome.dispatched || (outcome.planApplied && outcome.plan))) {
              const kept = outcome.dispatched && outcome.plan
                ? sheetsKeptByPlan(outcome.build, outcome.plan, outcome.scope?.stopPage == null)
                : null;
              for (const sheet of outcome.build.engineSheets) {
                if (!sheet.isConnected || measureCache.isMeasured(sheet) || (kept && !kept.has(sheet))) continue;
                pending.delete(sheet);
                trust(sheet);
              }
              if (pendingIndex !== null && pending.size === 0) pendingIndex = null;
            }
            // What the page read says the kept layout is not this reader's: its
            // measurements go, the sheets it left trusted are read like any.
            if (keptLayoutPageId !== null && seededLayoutRefuted(editorView.dom)) {
              traceLedgerPass(editorView, { keptLayoutRefuted: keptLayoutPageId });
              refuteKeptLayout(keptLayoutPageId, editorView.state.doc);
              forgetSeededReadings(editorView.dom);
              keptLayoutPageId = null;
              markRestoredLayout(editorView.dom, false);
              for (const sheet of sheetsOf(editorView.dom)) {
                if (!trustedSheets.has(sheet)) continue;
                trustedSheets.delete(sheet);
                setSheetUnread(editorView.dom, sheet, false);
                nearing?.unobserve(sheet);
              }
            }
            let backgroundPending = pending.size > 0 || pendingIndex !== null;
            // While the background lays the document out a window at a time,
            // the sheets it has measured behind it are drawn hollow again:
            // the DOM holds the reader's pages and the window's, not every
            // page the background has passed through.
            if (backgroundPending && outcome.scope) {
              const to = outcome.scope.stopPage ?? Number.POSITIVE_INFINITY;
              watchHollowable({ from: Math.max(0, outcome.scope.startPage - 1), to: to + 2 });
            }
            // The background moved on (a later page than the last pass
            // started from): the convergence budget is per page reached, not
            // per document. Hundreds of pages each need a pass or two that
            // stops at a resync rather than a yield, and the long document
            // ran out of the 24 passes half way through ("ledger-cycle").
            // So is a row a page at a time: one row running through 23 pages
            // gets one more cut a pass (corpus R283-D10).
            if (outcome.plan && outcome.plan.pages.length > mostPlannedPages) {
              mostPlannedPages = outcome.plan.pages.length;
              passes = 0;
            }
            if (outcome.scope) {
              if (lastScopeStart !== null && outcome.scope.startPage > lastScopeStart) passes = 0;
              lastScopeStart = outcome.scope.startPage;
            }
            // A long document is shown as soon as the reader's pages are
            // laid out and stable; the rest follows in the background (its
            // pages stand as provisional sheets until the background reaches
            // them, and nothing ever shows a page the ledger has not
            // finished in front of the reader).
            if (!settledOnce && outcome.scope && progressive &&
                (outcome.stablePages ?? 0) >= Math.max(1, (progressive.visible?.last ?? 0) + 1)) {
              traceLedgerPass(editorView, { revealed: { stablePages: outcome.stablePages, visible: progressive.visible } });
              const restored = takeRestoredLayout(editorView.dom);
              finishInitial();
              // Pages a receipt restored are the layout a converged ledger
              // made of this content (restoredLayoutMark): when the reader's
              // pages, laid out, changed nothing, the rest stand as they are
              // and only a sheet that paints past its foot is laid out again.
              if (restored && !outcome.dispatched) {
                pending.clear();
                pendingIndex = null;
                for (const sheet of sheetsOf(editorView.dom)) {
                  if (sheetBodyOverflowPx(sheet) > PHYSICAL_PAGE_SPILL_TOLERANCE_PX) pending.add(sheet);
                  else if (!measureCache.isMeasured(sheet)) trust(sheet);
                }
                backgroundPending = pending.size > 0;
                if (!backgroundPending) setDeferred(false, "restored");
                traceLedgerPass(editorView, { restoredTrusted: { spilling: pending.size } });
              }
            }
            // Pages the background has not reached yet may run over their
            // foot: their sheets grow under the overrun meanwhile.
            // (A pass that moved the pages leaves the mark up for the pass
            // that reads them; the mark goes when one changes nothing.)
            // Only the background mark: the deferred one also lets the sheets
            // grow under an overrun (contain: layout on every sheet), a
            // relayout of every page each time an edit moves a break.
            settlingAfterMove = outcome.dispatched && !outcome.converged;
            if (outcome.dispatched && outcome.planApplied &&
                layoutCycle.cameBack(editorView.state.doc, authoredEditSeq(editorView))) {
              // Coming back through a cut within a row: the plan goes on without
              // that cut, with pages after it still uncut. A round that this
              // dispatch broke by holding one page (cycleHeld: the page before
              // it takes no more) while the background still has pages to lay
              // out: that page stays held and the background goes on, once per
              // page. Stopped there, a long book's pages past the held one
              // kept the layout of the faces before the last one came (page
              // 475 of 865, 1 px back and forth, 333 pages laid out in the
              // fallback face for good). Anything else stops.
              if (refuseAlternatingRowCut(editorView)) layoutCycle.forget();
              else if (goOnPastRound(outcome, "layout-came-back")) { schedule(); return; }
              else {
                stopOnCycle();
                return;
              }
            }
            // A page seam wandering inside one paragraph, no whole layout coming
            // round (ledgerSeamWander): the pages stop where they stand.
            if (outcome.dispatched && outcome.planApplied && seamWanderStops(editorView)) {
              const after = lastLedgerDispatch.get(editorView)?.after;
              const page = after ? seamWander.observe(after, authoredEditSeq(editorView)) : null;
              if (page !== null) {
                if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { seamWanderStop: { page, opening: after?.[page] ?? null } });
                if (goOnPastRound(outcome, "seam-wander", page)) { schedule(); return; }
                stopOnCycle();
                return;
              }
            }
            // The walk reads what stands; what it finds moved is laid out like
            // any change, and only then is the document's layout not finished.
            if (backgroundPending && verifyWalking && !outcome.dispatched) {
              // (No status: the reader's document is finished.)
            } else if (backgroundPending) setDeferred(true, "background");
            else if (settlingAfterMove) writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_BACKGROUND_ATTR, "true", editorView);
            else if (outcome.converged) setDeferred(false, "converged");
            if (outcome.dispatched && outcome.scope?.yieldedAt !== null && outcome.scope) {
              // Background progress: bounded by the document's length, not
              // by the convergence budget of one page's cuts.
              backgroundPasses += 1;
              if (backgroundPasses > sheets.length * 2 + MAX_PASSES) {
                if (goOnPastRound(outcome, "background-budget")) { schedule(); return; }
                stopOnCycle();
                return;
              }
              if (!idleSlot && performance.now() - frameStartedAt < SAME_FRAME_PASS_BUDGET_MS && ledgerLane.inputQuiet() && fragmentsHaveLayout(editorView, progressive?.horizon.maxSheet ?? null)) {
                compose(true);
              } else {
                schedule();
              }
              return;
            }
            if (outcome.replan) {
              // A page held against a local alternation: the plan again.
              passes += 1;
              if (passes < MAX_PASSES) schedule();
              else if (goOnPastRound(outcome, "replan-budget")) schedule();
              else stopOnCycle();
              return;
            }
            if (!outcome.dispatched && !outcome.converged && backgroundPending) {
              // Nothing to change in the pages this pass covered; the rest
              // of the document follows in the next frame.
              backgroundPasses += 1;
              if (backgroundPasses > sheets.length * 2 + MAX_PASSES) {
                if (goOnPastRound(outcome, "background-budget")) { schedule(); return; }
                stopOnCycle();
                return;
              }
              schedule();
              return;
            }
            if (outcome.dispatched && !outcome.plan) {
              // A cut at a column boundary or after a nested break: one block
              // a pass, every straddling block of every unequal-column page
              // before the plan can be laid. Counted against the plan's 24
              // passes, a document of such pages (R13-D13: ten cuts, a plan,
              // ten more) ran out half way through and was left as it stood.
              splitPasses += 1;
              if (splitPasses > sheets.length * 2 + MAX_PASSES) {
                if (goOnPastRound(outcome, "split-budget")) { schedule(); return; }
                stopOnCycle();
                return;
              }
              if (!idleSlot && performance.now() - frameStartedAt < SAME_FRAME_PASS_BUDGET_MS && ledgerLane.inputQuiet() && fragmentsHaveLayout(editorView, progressive?.horizon.maxSheet ?? null)) {
                compose(true);
              } else {
                schedule();
              }
              return;
            }
            if (outcome.dispatched) {
              passes += 1;
              writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_PASS_ATTR, String(passes), editorView);
              if (passes < MAX_PASSES) {
                // The next pass reads the fragments this one just made. While
                // the frame has budget left, run it now, before anything
                // paints; a costly document yields to the next frame.
                if (!idleSlot && performance.now() - frameStartedAt < SAME_FRAME_PASS_BUDGET_MS && ledgerLane.inputQuiet() && fragmentsHaveLayout(editorView, progressive?.horizon.maxSheet ?? null)) {
                  compose(true);
                } else {
                  schedule();
                }
              } else if (goOnPastRound(outcome, "pass-budget")) {
                schedule();
              } else {
                stopOnCycle();
              }
              return;
            }
            // A page measured while one of its formulas was raw TeX with no
            // typeset size (its block was drawn anew after the typeset clone
            // ran, or the clone never saw it) was measured lines off: a 16 px
            // paragraph read as 53 px moved a page break (296-page book, page
            // 44). Such pages are measured again, typeset, before the layout
            // counts as finished; twice at most per page.
            if (outcome.converged && !backgroundPending && remeasureUnsizedMath()) {
              schedule();
              return;
            }
            if (outcome.converged && !backgroundPending && closeNotesWhole(editorView)) {
              setMeasureHorizon(editorView.dom, null);
              schedule();
              return;
            }
            // A print counts every page: it may only end with each within its
            // foot. A pass that held a layout against a cycle ended without
            // reading its pages, and a head a row over its foot printed on a
            // page of its own (a 313-sheet book, 318 PDF pages).
            if (eagerBackground && outcome.converged && !backgroundPending && outcome.build && outcome.plan && printFootChecks < PRINT_FOOT_CHECKS) {
              printFootChecks += 1;
              const pushed = repairPhysicalOverflow(editorView, refusals, overTallSheetsOf(outcome.plan, outcome.build), new Set(), null, {
                starts: currentPageStartAtoms(outcome.build),
                capacities: outcome.build.capacities,
                plannedUsed: plannedUsedAsStanding(outcome.plan, currentPageStartAtoms(outcome.build)),
              });
              if (pushed) {
                schedule();
                return;
              }
            }
            // Converged and physically verified (or held where it stands: a
            // pass that changed nothing ends the chain the last move opened).
            if (!backgroundPending) {
              setDeferred(false, "settled");
              watchHollowable();
            }
            // Converged and physically verified.
            writeDocumentLayoutStatus(editorView.dom, PAGINATION_STALLED_ATTR, null, editorView);
            writeDocumentLayoutStatus(editorView.dom, PAGE_LEDGER_CYCLE_ATTR, null, editorView);
            passes = 0;
            backgroundPasses = 0;
            splitPasses = 0;
            lastScopeStart = null;
            finishInitial();
            // What reads page numbers off the finished layout (a table of
            // contents just inserted or updated) may read them now.
            if (outcome.converged && !backgroundPending) {
              editorView.dom.dispatchEvent(new CustomEvent(PAGE_LEDGER_CONVERGED_EVENT));
            }
          };

          const unsizedMathRetries = new WeakMap<HTMLElement, number>();
          const remeasureUnsizedMath = (): boolean => {
            const previews = editorView.dom.querySelectorAll<HTMLElement>(
              ":scope > article[data-page-sheet] [data-math-pending]:not([data-math-layout-ready])",
            );
            let marked = false;
            const seen = new Set<HTMLElement>();
            for (const preview of Array.from(previews)) {
              const sheet = preview.closest<HTMLElement>("article[data-page-sheet]");
              if (!sheet || seen.has(sheet)) continue;
              seen.add(sheet);
              const tries = unsizedMathRetries.get(sheet) ?? 0;
              if (tries >= 2) continue;
              unsizedMathRetries.set(sheet, tries + 1);
              measureCache.markSheet(sheet);
              marked = true;
            }
            if (marked) {
              passes = 0;
              traceLedgerPass(editorView, { unsizedMath: seen.size });
            }
            return marked;
          };
          // A pass is background work of the shared scheduler
          // (lib/background-work): while the reader uses the rest of the app
          // (typing in another window, the sidebar, a drag) it waits for a
          // pause or for its share of the thread, right after a frame has
          // painted, and never longer than the scheduler's deferral cap.
          // Input in this document's own window does not hold it. A pass
          // that may run now still runs in the frame, before it paints.
          const ledgerLane = createBackgroundLane({
            label: "docs-ledger",
            owner: () => editorView.dom.closest(".wm-window") ?? editorView.dom,
          });
          // The background's next page is far from the reader's: the step
          // waits for an idle slot (no input, the gap after the last step).
          // Not while the initial settle or an edit is waiting on a pass,
          // and not in the `__pageLedgerNoCache` A/B (whole-document passes).
          const idleStepper = win && !eagerBackground
            ? createIdleStepper(win, () => ledgerLane.inputQuiet(), undefined, () => ledgerLane.sinceLastKeyOrPress() < FAR_STEP_INPUT_PAUSE_MS)
            : null;
          const waitForIdleSlot = (): boolean => {
            if (idleSlot || !idleStepper || !settledOnce || editedSinceLastPass) return false;
            if (pending.size === 0 && pendingIndex === null) return false;
            if ((win as (Window & { __pageLedgerNoCache?: boolean }) | null)?.__pageLedgerNoCache) return false;
            // A document with footnotes laid out a window at a time goes on
            // step after step, each in a frame of its own when input waits.
            if (notesStepOn(editorView)) return false;
            const edits = (pageLedgerKey.getState(editorView.state) as LedgerEditState | undefined)?.ranges ?? [];
            if (edits.some((range) => range.id > editsReadThrough)) return false;
            const sheets = sheetsOf(editorView.dom);
            let frontier = pendingIndex ?? Number.POSITIVE_INFINITY;
            for (const sheet of pending) {
              const index = sheets.indexOf(sheet);
              if (index >= 0 && index < frontier) frontier = index;
            }
            if (!Number.isFinite(frontier)) return false;
            if (!backgroundIsFar(frontier, visibleSheetRange(editorView, sheets))) return false;
            idleStepper.request(() => {
              if (destroyed || editorView.isDestroyed) return;
              idleSlot = true;
              const started = performance.now();
              try {
                composeAndRest();
              } finally {
                idleSlot = false;
                idleStepper.ran(performance.now() - started);
              }
            });
            return true;
          };
          // The reader scrolling towards the far pages makes them near: look
          // again (at most once a frame) while a far step waits.
          let scrollLook = 0;
          const onScroll = (event: Event) => {
            if (!idleStepper?.waiting || scrollLook || !win) return;
            const target = event.target;
            if (!(target instanceof Node) || !target.contains(editorView.dom)) return;
            scrollLook = win.requestAnimationFrame(() => {
              scrollLook = 0;
              if (destroyed || !idleStepper.waiting) return;
              idleStepper.cancel();
              schedule();
            });
          };
          editorView.dom.ownerDocument.addEventListener("scroll", onScroll, { capture: true, passive: true });
          // After a pass, the sheets it left measured and far may sleep.
          const composeAndRest = () => {
            compose(false);
            dormancy?.scheduleSleep();
          };
          let turnAsked = false;
          const run = () => {
            raf = 0;
            if (destroyed || !win || ledgerLane.tryTurn()) {
              composeAndRest();
              return;
            }
            if (turnAsked) return;
            turnAsked = true;
            void ledgerLane.turn().then(() => {
              turnAsked = false;
              if (!ledgerLane.disposed) composeAndRest();
            });
          };
          const schedule = () => {
            if (destroyed || !win || raf || turnAsked) return;
            raf = win.requestAnimationFrame(run);
          };

          // A pass runs in the frame that would paint the key just typed. On a
          // document whose pass is felt (a 158-page import: seconds), an edit
          // re-paginates once typing pauses instead, as Word repaginates in
          // the background; a short document re-paginates in the same frame.
          const scheduleAfterEdit = () => {
            // A long document re-paginates once typing pauses as soon as its
            // pass costs a frame: on the 272-page book a 30 ms pass ran
            // after every key and the next key waited for it.
            // A key's pass counts as slow past a frame on any document: 40 ms a
            // key on 24 pages is the next key's wait as well (corpus R323-D11).
            const slowPassMs =
              editorView.state.doc.childCount > LONG_DOCUMENT_PAGES || msSinceTyping() < EDIT_IDLE_MS
                ? LONG_DOCUMENT_SLOW_PASS_MS
                : SLOW_PASS_MS;
            if (!settledOnce || lastPassMs < slowPassMs || !win) {
              schedule();
              return;
            }
            if (editTimer !== undefined) win.clearTimeout(editTimer);
            // Until the pass runs, the edited sheet grows under its overrun
            // instead of drawing the words over the footer band.
            setDeferred(true, "slow-edit");
            editTimer = win.setTimeout(() => {
              editTimer = undefined;
              schedule();
            }, EDIT_IDLE_MS);
          };
          let stalled = false;
          /** The faces' families, when every face names one. */
          /** The sheets drawn hollow keep what was read of them with no DOM to
           * say it no longer holds: forgotten here, they are read again (their
           * pages drawn) when a pass or the reader reaches them. Measurements
           * from a kept layout stand unless the document's settings changed. */
          let hollowSettingsOf: unknown = editorView.state.doc.attrs;
          let hollowSettingsText: string | null = null;
          const settingsText = (attrs: unknown) => {
            const rest = { ...(attrs as Record<string, unknown>) };
            delete rest.pageBlockSizes;
            delete rest.pageBlockLayoutKey;
            delete rest.pageRegionLayoutReceipt;
            return JSON.stringify(rest);
          };
          const forgetHollowMeasures = (test?: (page: PmNode) => boolean) => {
            const doc = editorView.state.doc;
            // By what they say: a transaction can make the object anew.
            let settingsChanged = false;
            if (doc.attrs !== hollowSettingsOf) {
              hollowSettingsText ??= settingsText(hollowSettingsOf);
              const text = settingsText(doc.attrs);
              settingsChanged = text !== hollowSettingsText;
              hollowSettingsText = text;
              hollowSettingsOf = doc.attrs;
            }
            const hollow = new Set(hollowPagePositions(editorView.state));
            if (!hollow.size) return;
            let forgot = 0;
            doc.forEach((page, offset) => {
              if (hollow.has(offset) && (!test || test(page))) {
                forgetPageMeasures(page, settingsChanged);
                forgot += 1;
              }
            });
            if (forgot && ledgerTraceEnabled(editorView)) {
              traceLedgerPass(editorView, { forgotHollow: forgot, settingsChanged, from: new Error().stack?.split("\n").slice(2, 4).map((line) => line.trim().slice(0, 80)).join(" < ") });
            }
          };
          const facesFamilies = (faces: ReadonlyArray<{ family?: string }> | null | undefined): string[] | null => {
            if (!faces || faces.length === 0) return null;
            const families = faces.map((face) => String(face.family ?? "").trim()).filter(Boolean);
            return families.length === faces.length ? families : null;
          };
          /** `math`: the formulas' typeset boxes it voids -- all of them, those
           * drawn with these families (a face that arrived), or none (a new
           * width: the boxes are kept by width). */
          const relayout = (verdictsHold: boolean, reason = "external", math: "all" | "none" | readonly string[] = "all", keepHollow = false) => {
            if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { relayout: reason, hollow: hollowPagePositions(editorView.state).length });
            passes = 0;
            stalled = false;
            // New fonts or a new width lay every line out anew: an earlier
            // physical verdict is void. A generic nudge keeps them: it follows
            // the ledger's own moves too (page decorations re-stamped), and a
            // refusal already lapses when its page, its block or the page's
            // capacity changes.
            if (!verdictsHold) {
              refusals.clear();
              clearRefusedColumnCuts(editorView);
              recutStaleSeams.delete(editorView);
              staleSeamsThisPass.delete(editorView);
            }
            // Fonts, width, zoom or page geometry lay out every sheet anew.
            measureCache.clear(reason);
            if (!keepHollow) forgetHollowMeasures();
            // A nudge (a projection redrawn after the ledger's own move, a band) is no
            // new input: the cycle watch keeps what it saw, or a layout going round
            // with a nudge each time was never caught.
            if (!reason.startsWith("nudge:") || reason === "nudge:plain") {
              layoutCycle.forget();
              seamWander.forget();
            }
            if (math === "all") typesetMath.invalidate();
            else if (math !== "none") typesetMath.invalidateFamilies(math);
            if (ledgerTraceEnabled(editorView)) {
              traceLedgerPass(editorView, { mathInvalidated: `relayout:${reason}:${math === "all" || math === "none" ? math : math.join("|")}` });
            }
            // Fonts, surface geometry or the view mode changed: text widths
            // measured before no longer hold.
            invalidateWordAutofitMeasurements(editorView);
            invalidateRenderedTextHeads(editorView.dom);
            schedule();
          };
          const onExternal = (event?: Event, math: "all" | readonly string[] = "all", keepHollow = false) =>
            relayout(false, event ? `event:${event.type}` : "external", math, keepHollow);
          // A font subset that arrived lays out anew only the pages that draw
          // its glyphs (a new line of Chinese at a page break fetches one);
          // a face for every character, or a load that names none, every page.
          const onFontsLoaded = (event: Event) => {
            // The faces that arrived, not every face the set holds: WebKit
            // names them all in each event (lib/font-face-news).
            const faces = newFontFacesOf(event) ??
              (event as Event & { fontfaces?: ReadonlyArray<{ family?: string; unicodeRange?: string }> }).fontfaces;
            // KaTeX's faces are named by its classes, never by the editor's
            // font lists, so the filter below drops them. A formula typeset
            // in the page before its face arrived was measured with fallback
            // metrics: its sheet is measured again. A face that arrived after
            // the clone's preload settled voids the clone's geometry too.
            if (faces && faces.length > 0) {
              const doc = editorView.dom.ownerDocument;
              const news = faces.map((face) => katexFaceNews(doc, face));
              if (news.some((kind) => kind !== "none")) {
                if (news.includes("late")) {
                  typesetMath.invalidate();
                  if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { mathInvalidated: "late-katex-face" });
                }
                const typeset = news.includes("late") ? ".katex,[data-math-pending]" : ".katex";
                for (const sheet of sheetsOf(editorView.dom)) {
                  if (sheet.querySelector(typeset)) measureCache.markSheet(sheet);
                }
                if (news.includes("late")) forgetHollowMeasures(pageHoldsMath);
                passes = 0;
                stalled = false;
                schedule();
              }
            }
            // A face of a family no page draws with (the application's own
            // UI font) changes no page at all.
            // (The families of pages drawn hollow are not in the DOM: those
            // read when they were let go stand for them. A family a hollow page
            // gained since (an edit is drawn first) is read when it is drawn.)
            // Faces a fonts reading brought in (layoutSnapshot's fontsKeyFor),
            // none asked for by a page: no hollow page draws with them.
            const probed = facesStartedByProbe(faces);
            const anyHollow = !probed && hollowPagePositions(editorView.state).length > 0;
            const drawnFamilies = editorFontFamilies(editorView.dom);
            if (anyHollow) for (const family of hollowFamilies) drawnFamilies.add(family);
            const used = faces && faces.length > 0 ? facesUsedBy(faces, drawnFamilies) : null;
            if (used && used.length === 0) return;
            const ranges = loadedFaceRanges(used ?? faces);
            const arrived = (used ?? faces ?? []) as ReadonlyArray<{ family?: string; unicodeRange?: string }>;
            if (faceArrivalSince(win) && arrived.length > 0) {
              // What was measured before these faces were asked for stands
              // (ledgerFaceScan), but for text of the family of a face added
              // already loading, drawn without it until now.
              const { through, fresh } = faceArrivalBound(arrived);
              const freshFamilies = new Set((facesFamilies(fresh as typeof arrived) ?? []).flatMap((family) => fontFamilyNames(family)));
              const usesFresh = (root: HTMLElement) => {
                if (fresh.length === 0) return false;
                if (freshFamilies.size === 0) return true;
                for (const family of editorFontFamilies(root)) if (freshFamilies.has(family)) return true;
                return false;
              };
              let marked = 0;
              for (const sheet of sheetsOf(editorView.dom)) {
                if (ranges && !textDrawsCodePointIn(sheet.textContent ?? "", ranges)) continue;
                if ((measureCache.settledLook(sheet) ?? Number.POSITIVE_INFINITY) > through || usesFresh(sheet)) {
                  measureCache.markSheet(sheet);
                  marked += 1;
                }
              }
              const hollowFresh = fresh.length > 0 && (freshFamilies.size === 0 || [...hollowFamilies].some((family) => fontFamilyNames(family).some((name) => freshFamilies.has(name))));
              if (anyHollow) {
                forgetHollowMeasures((page) => (!ranges || textDrawsCodePointIn(page.textContent, ranges)) &&
                  (hollowFresh || (hollowLooks.get(page) ?? Number.POSITIVE_INFINITY) > through));
              }
              if (!ranges || rangesDrawNarrowText(ranges)) {
                const families = facesFamilies(arrived);
                if (families) typesetMath.invalidateFamilies(families, fresh.length > 0 ? 0 : through);
                else typesetMath.invalidate();
              }
              if (!ranges) invalidateWordAutofitMeasurements(editorView);
              if (ledgerTraceEnabled(editorView)) {
                traceLedgerPass(editorView, { faceSince: { through: Number.isFinite(through) ? through : null, fresh: fresh.length, faces: arrived.length, marked, whole: !ranges, families: (facesFamilies(arrived) ?? []).slice(0, 3) } });
              }
              invalidateRenderedTextHeads(editorView.dom);
              passes = 0;
              stalled = false;
              schedule();
              return;
            }
            if (!ranges) {
              // A whole face of a named family voids the boxes drawn with it.
              onExternal(event, facesFamilies(used ?? faces) ?? "all", probed);
              return;
            }
            const sheets = sheetsOf(editorView.dom);
            for (const sheet of sheets) {
              if (textDrawsCodePointIn(sheet.textContent ?? "", ranges)) measureCache.markSheet(sheet);
            }
            if (anyHollow) forgetHollowMeasures((page) => textDrawsCodePointIn(page.textContent, ranges));
            passes = 0;
            stalled = false;
            // A formula's typeset box and its line's breaks change only with
            // the narrow text around it: each wide subset of a Chinese book
            // measured every formula of the book again (some 20 s an opening).
            if (rangesDrawNarrowText(ranges)) {
              const families = facesFamilies(used ?? faces);
              if (families) typesetMath.invalidateFamilies(families);
              else typesetMath.invalidate();
              if (ledgerTraceEnabled(editorView)) {
                traceLedgerPass(editorView, { mathInvalidated: `narrow-face:${(used ?? faces ?? []).map((face) => `${(face as { family?: string }).family ?? "?"} ${(face as { unicodeRange?: string }).unicodeRange?.slice(0, 40) ?? ""}`).slice(0, 3).join(" | ")}` });
              }
            }
            invalidateRenderedTextHeads(editorView.dom);
            schedule();
          };
          const onNudge = (event: Event) => {
            // A plain Event (view-mode switch, page band geometry, image
            // resize) carries no reason: the layout inputs changed.
            if (!(event instanceof CustomEvent)) {
              relayout(true, "nudge:plain", nudgeMath(editorView));
              return;
            }
            const reason = String(event.detail?.reason ?? "");
            // A table read while its widths were not drawn yet: its sheet is
            // marked already and read again; the others hold. Laid out anew on
            // each of these, R286-D01's print spent 18 of its 33 s three times over.
            if (reason === "table-transient") {
              passes = 0;
              stalled = false;
              schedule();
              return;
            }
            // Derived metric projections re-run after our own dispatch; they
            // refresh the ledger's inputs but must not restart a cycle the
            // ledger already declared stalled, or reset the pass budget.
            // So is Word's emboldening advance (documentSyntheticBoldWordAdvance):
            // a pass that moves a block drops the advance's decorations over it
            // and the projection puts them back, the same widths. Read as a new
            // layout input, each pass forgot every measurement, its pass budget
            // and the cycle watch: a table of 2-10 px columns, re-cut each pass,
            // never settled (ec0ad3e4: 441 relayouts in 60 s, the print never
            // ready). The spans it draws mark their sheets (LedgerMeasureCache).
            // So are the hyphens withheld after the ledger's own moves
            // (documentHyphenationRules): every move makes new paragraphs,
            // whose breaks it reads again. Read as a new layout input, each one
            // reset the pass budget and the cycle watch, and a document going
            // round three layouts never stopped (R345-D08: 14 minutes, about
            // 1,200 changes a second, a tab burning a core for as long as it
            // stays open).
            // So are the tabs' widths (bandTabLayout): they change no
            // document, and a row they made short again on a page the
            // ledger had pushed past was never read (R417-D03 page 40).
            if (reason === "document-auto-line-spacing-projection" || reason === "word-cjk-spacing-projection" ||
                reason === SYNTHETIC_BOLD_ADVANCE_REASON || reason === "hyphenation-rules" || reason === "band-tab-layout") {
              // A projection the ledger flushed itself is read by the pass
              // about to run; only an unsolicited one needs a frame.
              // While an edit's pass waits for typing to pause (a long
              // document), the projection is read by that pass: run now, it
              // laid the pages out after every key the typing was meant to
              // leave alone.
              if (!stalled && !flushingMetrics && editTimer === undefined) schedule();
              return;
            }
            // The display-font plan announces both its verdict and every later
            // change of a planned face's loading state. The verdict changes a
            // root status attribute, which empties the measurements by itself
            // (LedgerMeasureCache); a face that finished loading changes only
            // the text drawn with it, which the font events mark sheet by
            // sheet (onFontsLoaded) and the plan's decorations mark by their
            // own mutations. Forgetting every measurement here laid a 296-page
            // book out a second time, whole, once its last face arrived.
            if (reason === "document-display-fonts") {
              passes = 0;
              stalled = false;
              schedule();
              return;
            }
            // So is the Auto line spacing's answer to a change of its inputs (a
            // face arrived, a new font plan): the line boxes it sets are
            // attributes of the blocks they change, whose sheets they mark,
            // and the change itself reached the ledger on its own (the font
            // events, the plan's verdict). Forgetting every measurement here
            // laid R286-D01 out whole from its first page again after each
            // face it waited for, every page of it (continued footnotes), one
            // pass 3.8 s in Chromium. Hollow pages keep their measures in the
            // document, with no element to mark: those are read again
            // (autoLineNudgeKeeps). Every line box it sets marks its sheet: the
            // same pages, page by page, on R286-D01, the book and sixteen
            
            // forgot every measurement four times a cold opening.
            if (reason === "document-auto-line-spacing" && autoLineNudgeKeeps(editorView)) {
              passes = 0;
              stalled = false;
              forgetHollowMeasures();
              schedule();
              return;
            }
            // A band's room changed on some sheets (bandsFirst): their
            // capacity is read again, every measurement kept. Read as a
            // layout change, each new sheet a table's next cut made (its
            // footer measured) forgot every measurement and the table was
            // planned whole again from its first cut (R283-D10: 7 pages
            // left, a 15,760 px piece, when the bands came first).
            if (reason === PAGE_BANDS_REBALANCE_REASON || reason === PRINT_SHEETS_OVERRUN_REASON) {
              const changed = (event as CustomEvent<{ sheets?: number[] | null }>).detail?.sheets;
              if (!Array.isArray(changed)) {
                relayout(true, "nudge:page-bands", nudgeMath(editorView));
                return;
              }
              const sheets = sheetsOf(editorView.dom);
              for (const index of changed) {
                const sheet = sheets[index];
                if (sheet) measureCache.markSheet(sheet);
              }
              stalled = false;
              schedule();
              return;
            }
            relayout(false, `nudge:${reason}`, nudgeMath(editorView));
          };
          const onComposition = () => {
            if (pendingAfterComposition) {
              pendingAfterComposition = false;
              relayout(false, "composition");
            }
          };
          const onNoteBodyFocusOut = () => {
            if (!pendingAfterNoteEdit || destroyed) return;
            // The next focus target may be another note body; the queued
            // run re-checks the active editor before moving anything.
            pendingAfterNoteEdit = false;
            schedule();
          };
          editorView.dom.addEventListener("focusout", onNoteBodyFocusOut, true);
          const fonts = editorView.dom.ownerDocument.fonts;
          fonts?.addEventListener("loadingdone", onFontsLoaded);
          win?.addEventListener("mrn-page-rebalance", onNudge);
          editorView.dom.addEventListener("compositionend", onComposition);
          // `compositionend` fires inside the guard's post-end grace, in which
          // the composition still reads as active and the pass defers again
          // with nothing left to wake it; the guard's settled hook is the
          // first safe task after the commit.
          const stopCompositionSettled = onImeCompositionSettled(editorView, onComposition);
          let width = editorView.dom.getBoundingClientRect().width;
          const resize = typeof ResizeObserver === "function"
            ? new ResizeObserver(() => {
                const next = editorView.dom.getBoundingClientRect().width;
                if (Math.abs(next - width) > 0.5) {
                  if (ledgerTraceEnabled(editorView)) traceLedgerPass(editorView, { resized: `${Math.round(width)}->${Math.round(next)}` });
                  width = next;
                  relayout(false, "resize", "none");
                }
              })
            : null;
          resize?.observe(editorView.dom);
          // Surface-level layout inputs (`data-doc-grid`, page geometry CSS
          // variables) are React props committed after the doc attrs change;
          // they alter every measured line box without any doc transaction.
          const surfaceHost = editorView.dom.closest<HTMLElement>('[data-testid="note-editor-page-surface"]');
          // React rewrites the surface `style` on every render; only a real
          // change of the geometry variables (page size, grid pitch, margins)
          // is a layout input change.
          let surfaceStyle = surfaceHost?.getAttribute("style") ?? "";
          const surfaceObserver = surfaceHost && typeof MutationObserver === "function"
            ? new MutationObserver((records) => {
                for (const record of records) {
                  if (record.attributeName === "style") {
                    const next = surfaceHost.getAttribute("style") ?? "";
                    if (next === surfaceStyle) continue;
                    surfaceStyle = next;
                  }
                  relayout(false, `surface:${record.attributeName}`);
                  return;
                }
              })
            : null;
          surfaceObserver?.observe(surfaceHost!, { attributes: true, attributeFilter: ["data-doc-grid", "style"] });
          if (!settledOnce && progressiveEligible(editorView)) {
            setMeasureHorizon(editorView.dom, initialMeasureHorizon(editorView));
          }
          const openInitialSettle = () => {
            writeDocumentLayoutStatus(editorView.dom, INITIAL_PAGINATION_SETTLING_ATTR, "true", editorView);
            writeDocumentLayoutStatus(editorView.dom, "aria-busy", "true", editorView);
            // Read the gate's one style fact now, before the root is in the
            // page (see settleHidesPagesFor).
            if (!editorView.dom.classList.contains("sheet-band-story")) settleHidesPagesFor(editorView.dom);
            // Plugin views are built inside a state update, after it read
            // `editable`; apply the gate once that update has returned.
            queueMicrotask(refreshEditable);
            facesHoldUntil = performance.now() + INITIAL_SETTLE_INPUT_GATE_MAX_MS + GATE_FACES_GRACE_MS;
            // The cold first layout: the line projections take no pass of
            // their own until the first pass has the document's faces.
            if (coldFirstLayout(win)?.fontsOnce && !editorView.dom.classList.contains("sheet-band-story")) holdFirstLayoutForFaces(editorView.dom, true);
            fontsHeldFirstLayout = false;
            composedSinceSettleOpened = false;
            if (gateTimer !== undefined) win?.clearTimeout(gateTimer);
            gateTimer = win?.setTimeout(giveGateUp, INITIAL_SETTLE_INPUT_GATE_MAX_MS);
          };
          if (!settledOnce) openInitialSettle();
          let hydrationsSeen = (pageLedgerKey.getState(editorView.state) as LedgerEditState | undefined)?.hydrations ?? 0;
          schedule();
          lookForGiantBlocks();
          return {
            update(view, previousState) {
              // The initial settle was had by the empty document the editor
              // opened with, and its content has just come (a page held as
              // parts opens its editor before its body is in): the settle is
              // the content's. Shown at once, a long book's first screen was
              // the unlaid layout, moving under the reader seconds later.
              const hydrations = (pageLedgerKey.getState(view.state) as LedgerEditState | undefined)?.hydrations ?? 0;
              if (hydrations !== hydrationsSeen) {
                hydrationsSeen = hydrations;
                if (settledOnce && !documentHasText(previousState.doc) && documentHasText(view.state.doc)) {
                  settledOnce = false;
                  initialSettleDone = false;
                  gateExpired = false;
                  gateGraceEndsAt = null;
                  passes = 0;
                  if (progressiveEligible(view)) setMeasureHorizon(view.dom, initialMeasureHorizon(view));
                  openInitialSettle();
                }
              }
              if (keysStillHeld && view.editable) releaseHeldKeys();
              // A long document just filled in (the collaboration bridge
              // fills an empty view): its line-metric projection is
              // scheduled for the next frame, ahead of the ledger's first
              // pass, and must not measure every sheet of it then.
              if (view.state.doc !== previousState.doc && !settledOnce && sheetsWithinMeasureHorizon(view.dom) === null && progressiveEligible(view)) {
                setMeasureHorizon(view.dom, initialMeasureHorizon(view));
              }
              if (!view.state.selection.eq(previousState.selection)) dormancy?.selectionChanged();
              const partArrived = takePartArrival(view.dom);
              if (selfDispatching) return;
              if (view.state.doc !== previousState.doc) {
                lookForGiantBlocks();
                // An object drawn over the text inside a page (a pen stroke,
                // a shape in front of the text) moves no line: the pages a
                // settled document has are still its pages, and a pass
                // would read the document to find nothing.
                if (settledOnce && !stalled && raf === 0 && editTimer === undefined &&
                    overlayOnlyDocChange(previousState.doc, view.state.doc)) {
                  return;
                }
                // A foreign change (typing, AI apply, undo) starts a fresh cycle.
                passes = 0;
                drawnChangePasses = 0;
                backgroundPasses = 0;
                splitPasses = 0;
                clearRefusedColumnCuts(view);
                lastScopeStart = null;
                stalled = false;
                // A document part appended (useDocumentPageParts) is nobody's
                // edit: its pages are laid out as the background's, at the
                // background's pace and step, not after a pause for typing and
                
                // hold of 1.4-3 s after each of its parts, and the pass after it
                // four pages). `window.__docsPartArrivalAsEdit = true` treats it
                // as an edit again (A/B).
                const asEdit = !partArrived || (win as (Window & { __docsPartArrivalAsEdit?: boolean }) | null)?.__docsPartArrivalAsEdit === true;
                if (asEdit) editedSinceLastPass = true;
                if (!partArrived) readerEditedSinceLastPass = true;
                if (asEdit) {
                  // The edit's pass runs now; a far step waiting is asked anew after it.
                  idleStepper?.cancel();
                  scheduleAfterEdit();
                } else {
                  schedule();
                }
                watchHollowSheets();
              }
            },
            destroy() {
              destroyed = true;
              holdFirstLayoutForFaces(editorView.dom, false, true);
              disposeWordRowspanHeights(editorView);
              if (hollowQuiet !== undefined) win?.clearTimeout(hollowQuiet);
              if (verifyTimer !== undefined) win?.clearTimeout(verifyTimer);
              intentDoc.removeEventListener("scroll", onReaderScroll, { capture: true });
              for (const type of ["wheel", "touchmove", "keydown"] as const) intentDoc.removeEventListener(type, noteIntent, { capture: true });
              intentDoc.removeEventListener("pointerdown", onPointerDown, { capture: true });
              intentDoc.removeEventListener("pointerup", onPointerUp, { capture: true });
              intentDoc.removeEventListener("pointercancel", onPointerUp, { capture: true });
              if (keysGiveUp !== undefined) clearTimeout(keysGiveUp);
              returnKeysToWindow(keysWindowId ?? windowIdAround(editorView.dom), heldKeys);
              ownerDocument.removeEventListener("keydown", holdKey, true);
              if (gatedView === editorView) gatedView = null;
              if (gateTimer !== undefined) win?.clearTimeout(gateTimer);
              if (facesTimer !== undefined) win?.clearTimeout(facesTimer);
              if (editTimer !== undefined) win?.clearTimeout(editTimer);
              ledgerLane.dispose();
              idleStepper?.dispose();
              dormancy?.destroy();
              if (scrollLook && win) win.cancelAnimationFrame(scrollLook);
              editorView.dom.ownerDocument.removeEventListener("scroll", onScroll, { capture: true });
              nearing?.disconnect();
              if (fillPoll !== undefined) win?.clearTimeout(fillPoll);
              if (partsPoll !== undefined) win?.clearTimeout(partsPoll);
              measureCache.disconnect();
              typesetMath.dispose();
              if (raf && win) win.cancelAnimationFrame(raf);
              if (drawnChangeFrame && win) win.cancelAnimationFrame(drawnChangeFrame);
              fonts?.removeEventListener("loadingdone", onFontsLoaded);
              win?.removeEventListener("mrn-page-rebalance", onNudge);
              editorView.dom.removeEventListener("compositionend", onComposition);
              stopCompositionSettled();
              editorView.dom.removeEventListener("focusout", onNoteBodyFocusOut, true);
              resize?.disconnect();
              surfaceObserver?.disconnect();
            },
          };
        },
      }),
    ];
  },
});

export default PageLedger;
