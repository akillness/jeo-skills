/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Editable projection for Word/WPS unequal-width newspaper columns.
 *
 * CSS Multi-column deliberately supports equal tracks only. Applying
 * `column-count` to an OOXML `<w:cols w:equalWidth="0">` section therefore
 * changes line wrapping and eventually page boundaries. This module keeps the
 * real ProseMirror block DOM in place and projects each direct child into an
 * exact physical track. Splittable text, code, container/list, note-list, and
 * table blocks are reported back to the rebalancer so it can materialize the
 * same lossless continuation seam used at a page edge; serialization still
 * merges those seams into one semantic block.
 */

import {
  SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR,
  SECTION_UNEQUAL_COLUMN_TRACKS_ATTR,
} from "../sectionLayouts";
import { trailingAutoLeadingCreditPx } from "./pageEdgeLeading";
import { rejudgeInlinePicturesPastLine } from "../inlinePicturePastLine";

export const UNEQUAL_COLUMN_FLOW_ATTR = "data-page-unequal-column-flow";
/** A page holding several sections (continuous section breaks): one token
 * per section in page order, `1` for a single column or the section's track
 * token, joined by `|`. The page is placed as stacked column regions. */
export const COLUMN_REGIONS_ATTR = "data-page-column-regions";
export const UNEQUAL_COLUMN_SHEET_ID_ATTR = "data-page-unequal-column-id";
/** A part a print copy draws inside a sheet beside its blocks (its header and
 * footer, notes, line numbers): no column block, so never one of the slots. */
export const SHEET_PRINT_PART_ATTR = "data-sheet-print-part";

const COLUMN_RULE_IMAGE_VAR = "--page-unequal-column-rule-image";
const COLUMN_RULE_TOP_VAR = "--page-unequal-column-rule-top";
const COLUMN_RULE_HEIGHT_VAR = "--page-unequal-column-rule-height";
const MAX_TRACKS = 45;
const MAX_TWIPS = 69_120;
const MAX_GAP_TWIPS = 31_680;

export interface UnequalColumnTrack {
  widthPx: number;
  gapAfterPx: number;
}

export interface UnequalColumnBlockMetric {
  /** Border-box height at every corresponding track width. */
  heightsPx: readonly number[];
  marginTopPx: number;
  marginRightPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  forceNextColumnAfter?: boolean;
  /** Painted inline extent (scroll width) at every corresponding track
   * width: a chart or picture keeping its authored size paints wider than
   * its track and is eligible for Word's covered-by-the-next-column clip. */
  inlineExtentsPx?: readonly number[];
  /** An anchored object (overlay or float): not column content. It neither
   * covers a wide block in the previous column nor is clipped to a track. */
  outOfFlow?: boolean;
  /** A table: Word draws one wider than its column whole, running on across
   * the gutter over the next column (measured in Word 16.86 with a 6.5"
   * fixed-width table in a two-column section: every column stays visible).
   * The covering clip a picture gets would hide its last columns (WUA 013). */
  paintsAcrossColumns?: boolean;
  /** An overlay (In Front of / Behind Text, or a picture the wrap carries
   * out of the flow): it costs the column flow nothing, as the ledger
   * charges it nothing (`ledgerAtoms.isOutOfVerticalFlow`). It is placed
   * where the flow stands and the flow goes on from there. Charged its
   * painted height here, a page the ledger knew fits was projected into a
   * column past the paper; the overflow net pushed its blocks on, the ledger
   * pulled them back, and a 445-page document never settled. */
  flowless?: boolean;
  /** Auto leading below the block's last line that may hang past a column
   * foot standing on the page's bottom margin (pageEdgeLeading; Word). */
  footCreditPx?: number;
  /** Word's "Keep lines together": the paragraph is never cut at a column
   * seam; it opens the next column whole (Word 16: a 7-line paragraph after
   * 3 lines of a balanced 2-column section reads 3 | 7). */
  keepLines?: boolean;
  /** Word's "Keep with next": the paragraph stands in the column that holds
   * the first line of the block after it (Word 16: a keep-with-next line at
   * the balance point moves on with the next one, 3 | 4). */
  keepNext?: boolean;
}

export interface UnequalColumnPlacement {
  columnIndex: number;
  topPx: number;
  inlineStartPx: number;
  widthPx: number;
  flowStartPx: number;
  flowEndPx: number;
  /** Word: an object wider than its column runs on under the following
   * column, and that column's content (an empty paragraph counts) covers
   * it from the middle of the gutter on. The projector clips such a block
   * there only when a later track holds a block; an empty following column
   * leaves it visible. */
  clipInline: boolean;
  /** In a stacked multi-column region: what the page charges this block.
   * The region's last block carries the region's whole (balanced) height,
   * the others nothing and stay with it; the first keeps the space above
   * the region. */
  regionCharge?: ColumnRegionCharge;
  /** A block held whole ("Keep lines together") on a page of unequal
   * columns: its height in each column, for the page planner to stand it in
   * the first one that holds it (R76-D15). */
  wholeTrackHeightsPx?: readonly number[];
  /** On a page of stacked regions: the column count of the block's own
   * region (1 for a single-column section). The sheet's own column count is
   * that of the section the page opens with, which is not this block's. */
  regionColumns?: number;
  /** A floated object (wrap square/tight/through) of a single-column region:
   * what it moves the flow down, its margins included. It is drawn as the
   * browser floats it in a page that is not projected -- its space before
   * measured from where the flow stands, not from the float above it, and
   * below that float -- and the flow resumes under the lowest of them. The
   * ledger charges exactly this, with no margins of its own. */
  floatAdvancePx?: number;
  /** How far the floats before this block pushed it down: its box stands
   * that much below where the flow put it, as the lines of a paragraph a
   * float pushes aside do (the paragraph itself starts where the flow
   * stands). Its pictures are placed from where it starts. */
  floatPushPx?: number;
  /** How much of the block's own top margin this plan did not set it down by
   * (px): all of it at a column's top, the part its neighbour's space after
   * covers where the two collapse. Its box stands that much higher than the
   * margin says, and a float pass that reads "the box less the margin it
   * has" for its place in the flow takes it off (floatingTextBoxLayout
   * `givenTopMarginPx`): read whole, a Top and Bottom text box opening a
   * column was set its drop again from a place a drop higher on every pass
   * (R460-D16 p3: 3052, 948, 1422 px, page 4 between two openings). */
  marginDroppedPx?: number;
}

/** A place a block can be cut between two of its lines: the head ends at
 * `endPx` (its bottom chrome included), the rest starts at `nextPx` (px from
 * the block's top). */
export interface ColumnLineBreak {
  endPx: number;
  nextPx: number;
}

export interface ColumnRegionCharge {
  /** The block's height in each of its region's columns, for the page
   * planner's balance of the section (the projector's own, track by track). */
  trackHeightsPx?: readonly number[];
  heightPx: number;
  marginBeforePx: number;
  marginAfterPx: number;
  /** Keep with the next block: the region is charged as one. */
  tied: boolean;
  /** The region's column count and the block's line pitch (0 unknown):
   * the page planner lays the section out in these columns itself. */
  columns?: number;
  linePitchPx?: number;
  /** A list balanced by its lines (`ColumnRegionBlockMetric.listRows`): the
   * lines either side of a cut in it (1), for the planner's own balance. */
  minSplitLines?: number;
  /** A list balanced at its drawn line breaks
   * (`ColumnRegionBlockMetric.breaksPx`): the same breaks for the planner's
   * own balance. */
  breaksPx?: readonly ColumnLineBreak[];
}

export interface UnequalColumnSplitCandidate {
  blockIndex: number;
  columnIndex: number;
  availablePx: number;
  /** Border-box width used to plan the cut in the source column. */
  measurementWidthPx: number;
  /** The block opens its column: taller than a whole column, it must yield
   * SOME cut (widow/orphan floors do not apply, as at a page top). */
  opensColumn: boolean;
  /** The head's last row may end inside this much Auto leading (the column
   * foot is the page's bottom margin). */
  footCreditPx?: number;
}

export interface UnequalColumnFlowOptions {
  /** The columns' foot is the page's bottom margin (not a balanced section
   * ending above another one): Word lets a block's last line hang its Auto
   * leading below it, as at a single column's foot (colcredit-b.docx). */
  footCredit?: boolean;
  /** The flow starts at the page's top edge: the first block keeps the space
   * before it that the sheet paints there (its computed margin; zero unless
   * the page preserves its leading space, as Word's first page does). */
  pageTop?: boolean;
  /** The space the region's first block stands below the region's top in
   * the first column (px): its space before, which Word sets in its own
   * column only, the other columns starting at the region's top. */
  leadPx?: number;
  /** A column's own foot above the page's (px from the flow's top): a
   * top-and-bottom box drawn at the column's foot leaves the column only the
   * room above it (`ColumnBandExclusion`). */
  columnCapacitiesPx?: readonly (number | undefined)[];
  /** Word compatibility mode 15 or later: a keep-with-next paragraph that
   * fits but whose follower cannot start below it is cut where it stands,
   * its last lines (its widow floor) going on with the follower, rather
   * than opening the next column whole (`keptLastLinesCut`). */
  keepNextCutsLastLines?: boolean;
}

/** Options of a sheet's projection taken from the document. */
export interface UnequalColumnSheetOptions {
  /** Word compatibility mode 15 or later (`keepNextCutsLastLines`). */
  keepNextCutsLastLines?: boolean;
  /** Word compatibility mode 14 or earlier, or none: a section's columns
   * are balanced as that Word does (`ColumnBalanceOptions.wordLegacy`). */
  wordLegacyBalance?: boolean;
}

/** A page-placed top-and-bottom box drawn out of the flow on a page of
 * column regions, in the sheet's content coordinates (px). */
export interface ColumnBandExclusion {
  topPx: number;
  bottomPx: number;
  leftPx: number;
  rightPx: number;
}

/** The wrapper attribute a page-placed band writes (`floatingTextBoxLayout`):
 * "top,bottom,left,right" in the sheet's content coordinates. */
export const COLUMN_BAND_EXCLUSION_ATTR = "data-column-band-exclusion";

/**
 * `data-table-page-frame` of a floating table placed down the page or the
 * margins on a page of columns (`tablePageFrame` placeColumnPageTable): drawn
 * at its page point, it costs the column flow nothing, as an overlay.
 */
export const COLUMN_TABLE_FRAME = "column";

/** Blocks the column flow does not charge: overlays and page-placed tables. */
const FLOWLESS_SELECTOR = `[data-float-mode="overlay"], [data-table-page-frame="${COLUMN_TABLE_FRAME}"]`;
const OUT_OF_FLOW_SELECTOR = `[data-float-mode="float"], ${FLOWLESS_SELECTOR}`;

/**
 * A floating table placed down the page or the margins, whole, on a page of
 * columns, that its page can hold: drawn at its page point
 * (`tablePageFrame` placeColumnPageTable), it is never column content. Read
 * from the table itself, not from its frame: a table the page planner first
 * charged and cut in its anchor's column was broken before its frame was
 * written, and a broken table keeps the flow (corpus R423-D04's sidebar, cut
 * between column 2 of page 1 and column 1 of page 2, every page after it a
 * page late). `window.__docsColumnTableFloatOff = true` keeps the older
 * layout (A/B).
 */
export function columnPagePlacedTable(block: Element): boolean {
  const sheet = block.parentElement;
  if (!sheet || ownSectionColumnCount(block) < 2) return false;
  const win = block.ownerDocument.defaultView as (Window & { __docsColumnTableFloatOff?: boolean }) | null;
  if (win?.__docsColumnTableFloatOff === true) return false;
  const table = block.matches("table[data-table-positioning]")
    ? block
    : block.querySelector(":scope > table[data-table-positioning]");
  if (!(table instanceof HTMLElement)) return false;
  if (table.dataset.pageTableContinues === "true" || table.dataset.pageTableContinuation === "true") return false;
  let anchor: unknown = null;
  try {
    anchor = (JSON.parse(table.dataset.tablePositioning ?? "null") as { verticalAnchor?: unknown } | null)?.verticalAnchor;
  } catch {
    return false;
  }
  if (anchor !== "page" && anchor !== "margin") return false;
  const style = getComputedStyle(sheet);
  const room = (Number.parseFloat(style.minHeight) || sheet.offsetHeight) -
    (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0);
  return table.offsetHeight > 0 && table.offsetHeight <= room + 0.5;
}

/**
 * The column count of the section a block of a page of newspaper columns
 * stands in: the sheet's own, or -- on a page of stacked sections
 * (`COLUMN_REGIONS_ATTR`) -- its region's, the section breaks before it
 * counting the regions. A floating table of a single-column section on such
 * a page is placed as on a single-column page: drawn at its page point over
 * the column regions, nothing wrapped the region text round it (corpus
 * R363-D01 p3: the descriptive-statistics table of a one-column section
 * between two two-column ones drawn over both columns' text, 16 overlaps).
 * 1 for a block of no column page.
 */
export function ownSectionColumnCount(block: Element): number {
  const sheet = block.parentElement;
  if (!sheet) return 1;
  const regions = sheet.getAttribute(COLUMN_REGIONS_ATTR);
  if (!regions) return unequalColumnCount(sheet as HTMLElement) ?? 1;
  let region = 0;
  for (let sibling = block.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (sibling.matches('[data-type="section-break"]')) region += 1;
  }
  const token = regions.split("|")[region];
  if (!token || token === "1") return 1;
  return parseUnequalColumnTracks(token)?.length ?? 1;
}

/** `window.__dqc2SeamMarginOff = true` (A/B): a fragment its paragraph goes
 * on from keeps its paragraph's space after in the column flow, as before. */
function seamMarginOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __dqc2SeamMarginOff?: boolean }).__dqc2SeamMarginOff === true;
}

/**
 * A fragment its paragraph goes on from (a page or column cut's head) ends
 * mid-paragraph: its space after belongs to the paragraph's last line, where
 * the paragraph ends (Word), and the page planner charges the head none. Read
 * as the paragraph's margin, the piece that goes on in the same column stood
 * that much lower than planned: corpus R460-D16 p10, a head 497.8 px with
 * 13.33 px below it pushed its 29.3 px piece past the column's foot into a
 * third track; the overflow repair moved it on, the plan took it back, and
 * which of the two each opening kept depended on timing.
 */
function seamBottomMarginPx(block: HTMLElement, marginBottomPx: number): number {
  if (seamMarginOff() || block.getAttribute("data-page-split-continues") !== "true") return marginBottomPx;
  return Math.min(0, marginBottomPx);
}

export function parseColumnBandExclusion(token: string | null): ColumnBandExclusion | null {
  if (!token) return null;
  const values = token.split(",").map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [topPx, bottomPx, leftPx, rightPx] = values;
  return bottomPx > topPx && rightPx > leftPx ? { topPx, bottomPx, leftPx, rightPx } : null;
}

function footCreditOf(block: UnequalColumnBlockMetric, options: UnequalColumnFlowOptions): number {
  const credit = block.footCreditPx;
  return options.footCredit && Number.isFinite(credit) && credit! > 0 ? credit! : 0;
}

export interface UnequalColumnFlowPlan {
  placements: UnequalColumnPlacement[];
  splitCandidates: UnequalColumnSplitCandidate[];
  physicalOverflowPx: number;
  inlineOverflowPx: number;
}

export interface UnequalColumnProjection extends UnequalColumnFlowPlan {
  tracks: readonly UnequalColumnTrack[];
  capacityPx: number;
  /** A column-regions page: the band tops its filling region's columns end
   * at (`ColumnRegionFlowPlan.bandTopsPx`). */
  bandTopsPx?: readonly (number | undefined)[];
}

const placementByBlock = new WeakMap<HTMLElement, UnequalColumnPlacement>();
const projectionBySheet = new WeakMap<HTMLElement, UnequalColumnProjection>();




















interface ProjectionRuleState {
  /** Where the fixed rules sit in the cascade (the first projection created
   * it); the rules for further positions follow it, a style element each:
   * adding a sheet restyles nothing, changing one restyles everything. */
  element: HTMLStyleElement;
  /** The projected sheets by id, in the order they were first projected. */
  entries: Map<string, WeakRef<HTMLElement>>;
  /** Child positions the fixed rules cover so far. */
  slots: number;
}

interface BlockRuleAddress {
  sheet: WeakRef<HTMLElement>;
  childIndex: number;
}

const ruleStateByDocument = new WeakMap<Document, ProjectionRuleState>();
const ruleAddressByBlock = new WeakMap<HTMLElement, BlockRuleAddress>();
let nextUnequalColumnSheetId = 1;

/** How many child positions of the sheet carry projection properties. */
const SLOT_COUNT_VAR = "--uc-n";
/** The footnote area's columns on the sheet (sheetNoteColumns), read by the
 * note zone's stylesheet: `auto` when the notes stand in one column. */
export const NOTE_COLUMNS_VAR = "--note-columns";
export const NOTE_COLUMN_GAP_VAR = "--note-column-gap";
const slotTopVar = (position: number) => `--uc-t-${position}`;
const slotLeftVar = (position: number) => `--uc-l-${position}`;
const slotWidthVar = (position: number) => `--uc-w-${position}`;
const slotClipVar = (position: number) => `--uc-c-${position}`;
/** Fixed rules are added this many positions at a time. */
const SLOT_RULES_CHUNK = 32;
/** From this many changed properties on, one write of the sheet's style text
 * replaces the property-by-property writes: with a mutation observer asking
 * for old values (the paginator's), each single write serializes the whole
 * inline style, which is quadratic on a sheet of hundreds of blocks. */
const BATCHED_STYLE_WRITES = 48;

const twipsToPx = (twips: number): number =>
  Math.round((twips / 15) * 100) / 100;

const EQUAL_TRACKS_GRAMMAR = /^equal:(\d+):(\d+)$/;

/** `window.__docsWordColumnTwipsOff = true`: equal columns share the width
 * to the hundredth of a px and the sheet is read at its whole-px client
 * width, as before. */
function wordColumnTwipsOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsWordColumnTwipsOff?: boolean }).__docsWordColumnTwipsOff === true;
}

/**
 * Word's width of each of `count` equal columns: the share of the text width
 * less the gaps, cut to whole twips. Windows Word, docx-look/brk10/probes/
 * exact: a line exactly as wide as its measure stays whole (x3: 4675 twips
 * of TNR 10 in 4675), and a line of 5037.5 twips stays whole in a column of
 * 5038 but goes down in a two-column section whose share is 5037.5 twips
 * (text width 10435, gap 360; modes 14 and 15) -- the column is 5037.
 * Corpus R409-D06: "immunotherapeutic potential" filled that column to the
 * font unit, Word set "potential" on the next line and we kept it.
 */
export function equalColumnWidthPx(printableWidthPx: number, gapTwips: number, count: number): number {
  if (wordColumnTwipsOff()) return Math.round(((printableWidthPx - twipsToPx(gapTwips) * (count - 1)) / count) * 100) / 100;
  // In twips; a hair under a whole twip still counts as it (the sheet's
  // width is read in CSS px, a twip is 1/15 px).
  const twips = Math.floor((printableWidthPx * 15 - gapTwips * (count - 1)) / count + 0.02);
  return twips / 15;
}

/** The sheet's content width, px, as CSS sizes it: its computed width (a
 * fraction of a px where the page is, 11909 twips = 793.93 px), less padding
 * and border where the box includes them; `clientWidth` rounds to a whole px. */
function sheetContentWidthPx(sheet: HTMLElement, style: CSSStyleDeclaration, paddingLeftPx: number, paddingRightPx: number): number {
  const client = Math.max(0, sheet.clientWidth - paddingLeftPx - paddingRightPx);
  if (wordColumnTwipsOff()) return client;
  const width = Number.parseFloat(style.width);
  if (!(width > 0)) return client;
  const inner = style.boxSizing === "border-box"
    ? width - paddingLeftPx - paddingRightPx - (Number.parseFloat(style.borderLeftWidth) || 0) - (Number.parseFloat(style.borderRightWidth) || 0)
    : width;
  // Only a reading within a px of the client one (a sheet drawn at its
  // stated width); anything else keeps the client width.
  return inner > 0 && Math.abs(inner - client) < 1 ? inner : client;
}

/**
 * Parse the closed decoration grammar emitted by sectionLayouts.ts: an exact
 * unequal twip sequence, or `equal:<count>:<gapTwips>` whose tracks share the
 * printable width (`printableWidthPx`; without it an equal token yields
 * unit-width tracks, enough to count them).
 */
/**
 * The columns a page's footnote area is laid out in: Word's Footnote and
 * Endnote "Columns: Match section layout" (its default) sets the notes of a
 * page of newspaper columns in those columns, balanced, the separator over
 * the first (Word 16.86: two 1-line notes stand one at each column's foot;
 * notes of 1, 3 and 1 lines fill 3 lines of the first column and 2 of the
 * second; one 6-line note 3 and 3; corpus R74-D14). Equal columns of a page
 * of one section; null otherwise (one column, unequal widths, or a page of
 * stacked sections).
 */
export function sheetNoteColumns(sheet: Element | null | undefined): { count: number; gapPx: number } | null {
  if (!sheet || sheet.hasAttribute(COLUMN_REGIONS_ATTR)) return null;
  const match = EQUAL_TRACKS_GRAMMAR.exec(sheet.getAttribute(SECTION_UNEQUAL_COLUMN_TRACKS_ATTR) ?? "");
  if (!match) return null;
  const count = Number(match[1]);
  const gapTwips = Number(match[2]);
  if (!(count >= 2 && count <= MAX_TRACKS) || !(gapTwips >= 0 && gapTwips <= MAX_GAP_TWIPS)) return null;
  return { count, gapPx: twipsToPx(gapTwips) };
}

export function parseUnequalColumnTracks(
  value: string | null | undefined,
  printableWidthPx?: number,
): UnequalColumnTrack[] | null {
  if (!value) return null;
  const equal = EQUAL_TRACKS_GRAMMAR.exec(value);
  if (equal) {
    const count = Number(equal[1]);
    const gapTwips = Number(equal[2]);
    if (count < 2 || count > MAX_TRACKS || gapTwips > MAX_GAP_TWIPS) return null;
    const gapPx = twipsToPx(gapTwips);
    const widthPx =
      printableWidthPx !== undefined && printableWidthPx > 0
        ? Math.max(1, equalColumnWidthPx(printableWidthPx, gapTwips, count))
        : 1;
    return Array.from({ length: count }, (_, index) => ({
      widthPx,
      gapAfterPx: index === count - 1 ? 0 : gapPx,
    }));
  }
  const tokens = value.split(",");
  if (tokens.length < 2 || tokens.length > MAX_TRACKS) return null;
  const tracks: UnequalColumnTrack[] = [];
  for (const token of tokens) {
    const match = /^(\d+):(\d+)$/.exec(token);
    if (!match) return null;
    const widthTwips = Number(match[1]);
    const gapTwips = Number(match[2]);
    if (
      !Number.isInteger(widthTwips) ||
      widthTwips < 1 ||
      widthTwips > MAX_TWIPS ||
      !Number.isInteger(gapTwips) ||
      gapTwips < 0 ||
      gapTwips > MAX_GAP_TWIPS
    ) {
      return null;
    }
    tracks.push({
      widthPx: twipsToPx(widthTwips),
      gapAfterPx: twipsToPx(gapTwips),
    });
  }
  return tracks;
}

/** CSS adjoining-margin collapse for two vertical block margins. */
export function collapseUnequalColumnMargins(
  previousBottomPx: number,
  nextTopPx: number,
): number {
  const previous = Number.isFinite(previousBottomPx) ? previousBottomPx : 0;
  const next = Number.isFinite(nextTopPx) ? nextTopPx : 0;
  if (previous >= 0 && next >= 0) return Math.max(previous, next);
  if (previous <= 0 && next <= 0) return Math.min(previous, next);
  return previous + next;
}

function trackInlineStart(
  tracks: readonly UnequalColumnTrack[],
  columnIndex: number,
): number {
  let start = 0;
  const last = tracks[tracks.length - 1];
  for (let index = 0; index < columnIndex; index += 1) {
    const track = tracks[index] ?? last;
    start += track.widthPx + track.gapAfterPx;
  }
  return start;
}

/** Whether the block after `index` (skipping flowless ones) would start
 * past the column foot below a block ending at `endPx`: its first line when
 * it can be cut there, its whole box when it cannot. */
function followerStartsPast(
  blocks: readonly UnequalColumnBlockMetric[],
  index: number,
  columnIndex: number,
  endPx: number,
  capacityPx: number,
): boolean {
  const block = blocks[index];
  let nextIndex = index + 1;
  while (nextIndex < blocks.length && blocks[nextIndex].flowless) nextIndex += 1;
  const next = blocks[nextIndex] as (UnequalColumnBlockMetric & { splittable?: boolean; lineHeightPx?: number; minSplitLines?: number }) | undefined;
  if (!next) return false;
  const height = heightAt(next, columnIndex);
  // What of the follower must stand below: its first line, or under widow
  // control the two Word's orphan floor keeps together (its whole box when
  // it is too short to leave two on each side). Word moved "Introduction"
  // to the next column where only one line of the paragraph after it would
  // have fit (corpus R432-D07).
  const pitch = next.lineHeightPx && next.lineHeightPx > 0 ? next.lineHeightPx : 0;
  const floor = keepNextFloorOff() ? 1 : Math.max(1, next.minSplitLines ?? 1);
  const lines = pitch > 0 ? Math.round(height / pitch) : 0;
  const line = next.splittable && !next.keepLines && pitch > 0
    ? (lines >= floor * 2 ? Math.min(height, pitch * floor) : height)
    : height;
  return endPx + collapseUnequalColumnMargins(block.marginBottomPx, next.marginTopPx) + line > capacityPx + 1e-6;
}

/**
 * Plan whole editable block boxes into exact tracks. A block that could fill
 * the remainder of the current column is still placed whole in the following
 * column for this paint, but a split candidate records the exact free height.
 * The rebalancer can then replace that temporary whole-block move with a
 * lossless semantic continuation on its next transaction. A block taller
 * than a whole column opens one and the flow continues in the next column
 * below nothing (Word clips the object at the column's foot); the ledger's
 * column-aware cut (`planLedgerPages`) charges the same placement.
 */
/** Harness switch (`window.__docsColumnLastStays = true`): a block the last
 * column cannot hold stays in it, over the foot, for the page planner to
 * move on, rather than opening a column past the last track. */
/** Harness switch (`window.__docsColumnKeepNextOff = true`): a page of
 * newspaper columns lays its blocks into the columns without their Keep
 * with next, as it did before (an A/B of one build). */
/** `window.__docsKeepNextFloorOff = true` (A/B): a kept block only needs its
 * follower's first line below it, and a column region filled to the page's
 * foot drops keep-with-next, the older readings. */
/** `window.__dqc2RegionTopMarginOff = true`: the page's first column region
 * starts all its columns below its first block's space before, as before
 * (A/B of one build). */
function regionTopMarginOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __dqc2RegionTopMarginOff?: boolean }).__dqc2RegionTopMarginOff === true;
}

function keepNextFloorOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKeepNextFloorOff?: boolean }).__docsKeepNextFloorOff === true;
}

function columnKeepNextOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsColumnKeepNextOff?: boolean }).__docsColumnKeepNextOff === true;
}

/** What `followerStartsPast` reads of the block after a kept one: whether it
 * may break after its first line, and that line's pitch. */
function followerFacts(block: HTMLElement | undefined): { splittable?: boolean; lineHeightPx?: number; minSplitLines?: number } {
  if (!block) return {};
  // A list follows as its first item's paragraph does: keep with next holds
  // the kept paragraph with that paragraph's first lines, and the list is cut
  // between or inside its items like any text (R482-D01 p10: "References",
  // kept with a 30-item list, was moved into the second column because the
  // whole list did not fit below it in the first; the ledger kept it there
  // with the list's first items, and the page ran into a third column).
  if (!listFollowerWhole() && block.matches("ol, ul")) {
    const item = block.querySelector<HTMLElement>(":scope > li");
    const first = item?.querySelector<HTMLElement>(SPLITTABLE_TEXT_SELECTOR) ?? item;
    if (!first) return {};
    const pitch = blockLinePitchPx(first);
    return pitch > 0
      ? { splittable: true, lineHeightPx: pitch, minSplitLines: first.getAttribute("data-widow-control") === "false" ? 1 : 2 }
      : {};
  }
  if (!block.matches(SPLITTABLE_TEXT_SELECTOR)) return {};
  return { splittable: true, lineHeightPx: blockLinePitchPx(block), minSplitLines: block.getAttribute("data-widow-control") === "false" ? 1 : 2 };
}

/** `window.__dqc2ListFollowerWhole = true` (A/B): a list after a kept
 * paragraph must fit whole below it, as before. */
function listFollowerWhole(): boolean {
  return typeof window !== "undefined" && (window as Window & { __dqc2ListFollowerWhole?: boolean }).__dqc2ListFollowerWhole === true;
}

/** `window.__docsColumnKeepBackUpOff = true` (A/B): in a compatibility mode
 * 15 document a keep-with-next paragraph whose follower cannot start below
 * it opens the next column whole, as in earlier modes. */
function columnKeepBackUpOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsColumnKeepBackUpOff?: boolean }).__docsColumnKeepBackUpOff === true;
}

/** Word 2013+ (compatibility mode 15) keeps a kept paragraph's LAST line
 * with the next paragraph's first: one that fits at a column's foot but
 * whose follower cannot start there is cut where it stands, its widow floor
 * going on with the follower, when it holds lines enough for both floors.
 * The room the head is planned in: a little less than the whole paragraph
 * (the cut's widow floor leaves the last lines), or null when it cannot be
 * cut so (one too short, held whole, or itself the head of a cut). Windows
 * Word, docx-look/probes/vsp7 (mode 15): a 20-line paragraph above an
 * orphaned follower parts 18 | 2 across the columns (vsp5 E20), as does an
 * 11-line one below a single-column title (vsp6 G4: 9 | 2); mode 14 and
 * earlier move it whole. */
function keptLastLinesCut(block: UnequalColumnBlockMetric, heightPx: number, roomPx: number): number | null {
  const own = block as UnequalColumnBlockMetric & { splittable?: boolean; lineHeightPx?: number; minSplitLines?: number; continuesNext?: boolean; heldWhole?: boolean };
  if (!own.splittable || own.keepLines || own.heldWhole || own.continuesNext) return null;
  const pitch = own.lineHeightPx && own.lineHeightPx > 0 ? own.lineHeightPx : 0;
  if (!(pitch > 0)) return null;
  const floor = Math.max(1, own.minSplitLines ?? 2);
  if (Math.round(heightPx / pitch) < floor * 2) return null;
  const availablePx = Math.min(roomPx, heightPx - Math.min(0.5, pitch / 2));
  return availablePx >= pitch * floor - 0.5 ? availablePx : null;
}

/** `window.__dqc2SplitHeadKeepsNext = true` (A/B): the head of a paragraph
 * cut at a column's foot keeps with next as the whole paragraph does, as
 * before. Keep with next holds a paragraph's LAST line with the next one; a
 * head's last line is not that, and its follower is its own rest: kept, the
 * head was moved whole into the next column after its rest (R482-D01 pages
 * 5 and 6, body text in a Heading 1 style: the head, cut for 198 px of the
 * first column, drawn in the second over its rest, the rest in a third
 * column the page does not have; the ledger joined the two pieces in one
 * track and refused the cut there for the rest of the layout). */
function splitHeadKeepsNext(): boolean {
  return typeof window !== "undefined" && (window as Window & { __dqc2SplitHeadKeepsNext?: boolean }).__dqc2SplitHeadKeepsNext === true;
}

function lastColumnHolds(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsColumnLastStays?: boolean }).__docsColumnLastStays === true;
}

export function planUnequalColumnFlow(
  tracks: readonly UnequalColumnTrack[],
  capacityPx: number,
  blocks: readonly UnequalColumnBlockMetric[],
  options: UnequalColumnFlowOptions = {},
): UnequalColumnFlowPlan {
  if (tracks.length < 2 || !(capacityPx > 0)) {
    return {
      placements: [],
      splitCandidates: [],
      physicalOverflowPx: 0,
      inlineOverflowPx: 0,
    };
  }
  const placements: UnequalColumnPlacement[] = [];
  const splitCandidates: UnequalColumnSplitCandidate[] = [];
  // Each column's own foot: the page's, or the top of a band drawn there.
  const footOf = (column: number) => {
    const own = options.columnCapacitiesPx?.[column];
    return own !== undefined && Number.isFinite(own) && own > 0 ? Math.min(capacityPx, own) : capacityPx;
  };
  let columnIndex = 0;
  let cursorPx = 0;
  let previousBottomMarginPx = 0;
  let physicalOverflowPx = 0;

  blocks.forEach((block, blockIndex) => {
    if (block.flowless) {
      const track = tracks[columnIndex] ?? tracks[tracks.length - 1];
      const horizontalMargins =
        (Number.isFinite(block.marginLeftPx) ? block.marginLeftPx : 0) +
        (Number.isFinite(block.marginRightPx) ? block.marginRightPx : 0);
      // Painted where it stood before (below the previous block's space
      // after); only the flow behind it no longer moves.
      const topPx = cursorPx > 0
        ? Math.max(0, cursorPx + collapseUnequalColumnMargins(previousBottomMarginPx, block.marginTopPx))
        : cursorPx;
      const flowAtPx = columnIndex * capacityPx + topPx;
      placements.push({
        columnIndex,
        topPx,
        inlineStartPx: trackInlineStart(tracks, columnIndex),
        widthPx: Math.max(1, track.widthPx - horizontalMargins),
        flowStartPx: flowAtPx,
        flowEndPx: flowAtPx,
        clipInline: false,
      });
      return;
    }
    const heightFor = (index: number) => {
      const fallback = block.heightsPx[block.heightsPx.length - 1] ?? 0;
      const height = block.heightsPx[index] ?? fallback;
      return Number.isFinite(height) && height >= 0 ? height : 0;
    };
    let heightPx = heightFor(Math.min(columnIndex, tracks.length - 1));
    let gapBeforePx =
      cursorPx <= 0
        ? blockIndex === 0 && columnIndex === 0 && options.leadPx !== undefined
          ? Math.max(0, Number.isFinite(options.leadPx) ? options.leadPx : 0)
          : options.pageTop && blockIndex === 0 && columnIndex === 0
          ? Math.max(0, Number.isFinite(block.marginTopPx) ? block.marginTopPx : 0)
          : 0
        : collapseUnequalColumnMargins(
            previousBottomMarginPx,
            block.marginTopPx,
          );
    let topPx = Math.max(0, cursorPx + gapBeforePx);
    // Auto leading hangs below the page's foot, not into a band.
    const creditFor = (column: number) => (footOf(column) < capacityPx ? 0 : footCreditOf(block, options));
    let creditPx = creditFor(columnIndex);
    // Keep with next: a block that fits here but whose follower's first line
    // would not opens the next column with it (as the balance planned it).
    if (block.keepNext && !(splitHeadKeepsNext() ? false : (block as { continuesNext?: boolean }).continuesNext) &&
        cursorPx > 0 && columnIndex < tracks.length - 1 &&
        topPx + heightPx - creditPx <= footOf(columnIndex) &&
        followerStartsPast(blocks, blockIndex, columnIndex, topPx + heightPx, footOf(columnIndex))) {
      const lastLinesRoom = options.keepNextCutsLastLines && !columnKeepBackUpOff()
        ? keptLastLinesCut(block, heightPx, footOf(columnIndex) - topPx)
        : null;
      if (lastLinesRoom !== null) {
        const sourceTrack = tracks[columnIndex] ?? tracks[tracks.length - 1];
        splitCandidates.push({
          blockIndex,
          columnIndex,
          availablePx: lastLinesRoom,
          measurementWidthPx: Math.max(
            1,
            sourceTrack.widthPx -
              (Number.isFinite(block.marginLeftPx) ? block.marginLeftPx : 0) -
              (Number.isFinite(block.marginRightPx) ? block.marginRightPx : 0),
          ),
          opensColumn: false,
        });
      }
      columnIndex += 1;
      cursorPx = 0;
      previousBottomMarginPx = 0;
      gapBeforePx = 0;
      topPx = 0;
      heightPx = heightFor(Math.min(columnIndex, tracks.length - 1));
      creditPx = creditFor(columnIndex);
    }
    // A column break ends the column it stands in: drawn nothing tall, it is
    // never itself carried on to the next column by the space after the
    // paragraph before it. Carried there, the column it then opened was
    // ended too and everything after it stood one column on (R455-D56's
    // masthead, its second column's lines drawn in the third once the logo
    // no longer stood in its flow). `window.__docsColumnBreakStaysOff`.
    const breakStays = block.forceNextColumnAfter === true && !(heightPx > 0.5) && cursorPx > 0 && !columnBreakStaysOff();
    if (!breakStays && topPx + heightPx - creditPx > footOf(columnIndex)) {
      const availablePx = Math.max(0, footOf(columnIndex) - topPx);
      // Keep lines together: never cut where it stands after other text; it
      // opens the next column whole (cut only once it is taller than one).
      if (availablePx > 0 && !(block.keepLines && cursorPx > 0)) {
        const sourceTrack = tracks[columnIndex] ?? tracks[tracks.length - 1];
        const sourceHorizontalMargins =
          (Number.isFinite(block.marginLeftPx) ? block.marginLeftPx : 0) +
          (Number.isFinite(block.marginRightPx) ? block.marginRightPx : 0);
        splitCandidates.push({
          blockIndex,
          columnIndex,
          availablePx,
          measurementWidthPx: Math.max(
            1,
            sourceTrack.widthPx - sourceHorizontalMargins,
          ),
          opensColumn: cursorPx <= 0,
          ...(creditPx > 0 ? { footCreditPx: creditPx } : {}),
        });
      }
      // In the last column there is no column to open: the block stays
      // below what is there, over the foot, and the page planner moves it on
      // (physicalOverflowPx). Opened past the last track it was drawn in a
      // column the page does not have, off the paper and across the text
      // (R280-D01 p2: "support are limited…" at 720 px of an 816 px sheet),
      // and no overflow was reported, so it stayed there.
      if (cursorPx > 0 && (columnIndex < tracks.length - 1 || !lastColumnHolds())) {
        columnIndex += 1;
        cursorPx = 0;
        previousBottomMarginPx = 0;
        gapBeforePx = 0;
        topPx = 0;
        heightPx = heightFor(Math.min(columnIndex, tracks.length - 1));
        creditPx = creditFor(columnIndex);
      }
    }
    // A block held whole opening a column too narrow for it goes on to the
    // first later column wide enough to hold it, as Word sets it (R76-D15).
    if (block.keepLines && cursorPx <= 0 && topPx + heightPx - creditPx > footOf(columnIndex)) {
      for (let later = columnIndex + 1; later < tracks.length; later += 1) {
        if (heightFor(later) - creditFor(later) <= footOf(later)) {
          columnIndex = later;
          heightPx = heightFor(later);
          creditPx = creditFor(later);
          break;
        }
      }
    }
    // Opening a column and still taller than it: the block overflows the
    // column's foot and nothing follows it there.
    const overflowsColumn = topPx + heightPx - creditPx > footOf(columnIndex);

    const track = tracks[columnIndex] ?? tracks[tracks.length - 1];
    const horizontalMargins =
      (Number.isFinite(block.marginLeftPx) ? block.marginLeftPx : 0) +
      (Number.isFinite(block.marginRightPx) ? block.marginRightPx : 0);
    const widthPx = Math.max(1, track.widthPx - horizontalMargins);
    const flowStartPx = columnIndex * capacityPx + topPx;
    const flowEndPx = flowStartPx + heightPx;
    // The gap a block of no top margin of its own would have had here.
    const ownTopPx = Number.isFinite(block.marginTopPx) ? block.marginTopPx : 0;
    const bareGapPx = cursorPx <= 0
      ? blockIndex === 0 && columnIndex === 0 && options.leadPx !== undefined
        ? Math.max(0, Number.isFinite(options.leadPx) ? options.leadPx : 0)
        : 0
      : collapseUnequalColumnMargins(previousBottomMarginPx, 0);
    placements.push({
      columnIndex,
      topPx,
      inlineStartPx: trackInlineStart(tracks, columnIndex),
      widthPx,
      flowStartPx,
      flowEndPx,
      clipInline: false,
      marginDroppedPx: ownTopPx - (gapBeforePx - bareGapPx),
      ...(block.keepLines && tracks.length > 1 ? { wholeTrackHeightsPx: tracks.map((_track, column) => heightFor(column)) } : {}),
    });
    physicalOverflowPx = Math.max(
      physicalOverflowPx,
      Math.max(0, topPx + heightPx - creditPx - (columnIndex >= tracks.length - 1 ? footOf(columnIndex) : capacityPx)),
    );
    cursorPx = topPx + heightPx;
    previousBottomMarginPx = Number.isFinite(block.marginBottomPx)
      ? block.marginBottomPx
      : 0;
    // A column break in the last column has no column to open on this page:
    // what follows stays below it until the page planner moves it on (Word
    // starts the next page). Opened past the last track it stood at the top
    // of the last column over what was already there (corpus R158-D07 p1:
    // column 1's tail, carried into column 2 above the break, was drawn
    // under column 2's first three lines).
    if ((block.forceNextColumnAfter && columnIndex < tracks.length - 1) || (overflowsColumn && columnIndex < tracks.length - 1)) {
      columnIndex += 1;
      cursorPx = 0;
      previousBottomMarginPx = 0;
    }
  });
  // Word's covering rule: a block that paints wider than its track is
  // covered by the following track's content, whatever that content is.
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    if (blocks[index].outOfFlow || blocks[index].paintsAcrossColumns) continue;
    const extents = blocks[index].inlineExtentsPx;
    const extent = extents?.[Math.min(placement.columnIndex, extents.length - 1)] ?? 0;
    if (!(extent > placement.widthPx + 1)) continue;
    if (placement.columnIndex >= tracks.length - 1) continue;
    placement.clipInline = placements.some(
      (other, otherIndex) => other.columnIndex > placement.columnIndex && !blocks[otherIndex].outOfFlow,
    );
  }

  const definedInlineEnd = tracks.reduce(
    (total, track) => total + track.widthPx + track.gapAfterPx,
    0,
  );
  const lastDefinedEnd =
    definedInlineEnd - (tracks[tracks.length - 1]?.gapAfterPx ?? 0);
  // A block reaches past its track only into the next one. A paragraph
  // whose borders stand outside its text (negative side margins: Word draws
  // the border and its space beyond the text column) is no wider than its
  // track for this count: read as wider, every bordered page of a newspaper
  // section overflowed by its two border spaces (corpus R73-D22: 18.67 px,
  // 4 pt space and a 3 pt rule each side) and the overflow repair moved its
  // trailing page break onto a page by itself.
  const usedInlineEnd = placements.reduce((maximum, placement, index) => {
    const track = tracks[placement.columnIndex] ?? tracks[tracks.length - 1];
    const block = blocks[index];
    const outdent =
      Math.max(0, -(Number.isFinite(block.marginLeftPx) ? block.marginLeftPx : 0)) +
      Math.max(0, -(Number.isFinite(block.marginRightPx) ? block.marginRightPx : 0));
    const ownWidth = Math.max(Math.min(placement.widthPx, track.widthPx), placement.widthPx - outdent);
    return Math.max(maximum, placement.inlineStartPx + ownWidth);
  }, 0);
  const logicalOverflowPx = placements.reduce(
    (maximum, placement, index) =>
      Math.max(
        maximum,
        Math.max(0, placement.flowEndPx - footCreditOf(blocks[index], options) - tracks.length * capacityPx),
      ),
    0,
  );
  return {
    placements,
    splitCandidates,
    physicalOverflowPx: Math.max(physicalOverflowPx, logicalOverflowPx),
    inlineOverflowPx: Math.max(0, usedInlineEnd - lastDefinedEnd),
  };
}

export interface ColumnRegionSpec {
  /** One track for a single-column section. */
  tracks: readonly UnequalColumnTrack[];
  /** Balance the columns (the section ends on this page and the next one
   * follows it here); otherwise they fill to the foot of the page. */
  balance: boolean;
  /** Compatibility mode 15 or later, columns filled to the foot: a kept
   * paragraph's last lines go on with a follower that cannot start below it
   * (`UnequalColumnFlowOptions.keepNextCutsLastLines`). */
  keepNextCutsLastLines?: boolean;
  /** Compatibility mode 14 or earlier, or none: balanced as that Word
   * balances (`ColumnBalanceOptions.wordLegacy`). */
  wordLegacyBalance?: boolean;
}

export interface ColumnRegionBlockMetric extends UnequalColumnBlockMetric {
  region: number;
  /** A continuous section break's zero-height marker: the spacing of the
   * paragraphs on either side meets across it, as the page planner's gap
   * does (`ledgerGapPx` skips hidden markers). */
  sectionBreak?: boolean;
  /** Text Word may break between lines (a paragraph or heading). */
  splittable: boolean;
  /** Its line pitch, when known: a column takes whole lines of it. */
  lineHeightPx?: number;
  /** A fragment of a paragraph cut by an earlier pass: it goes on in the
   * next block (or page), or goes on from the previous one. */
  continuesNext?: boolean;
  continuesPrevious?: boolean;
  /** Word's widow/orphan floor for a break inside it, in rows (2 with widow
   * control, 1 without; blockSplitting's minimumTextSplitLines). */
  minSplitLines?: number;
  /** A list of even lines, balanced by them (`listRowPitchPx`): `splittable`
   * with the list's pitch, cut between any two lines. */
  listRows?: boolean;
  /** A list whose lines are not even (space between its items, lines of
   * different heights): where it can be cut, read off its drawn lines at the
   * region's (equal) track width (`listLineBreaksPx`). It is balanced at
   * those breaks, as the container splitter then cuts it. */
  breaksPx?: readonly ColumnLineBreak[];
  /** A float of a single-column region the text wraps beside (wrap square,
   * tight or through, floated left or right): the side it stands at and its
   * drawn width, its margins (Word's distL/distR) not included. */
  sideFloat?: { side: "left" | "right"; widthPx: number };
  /** A float anchored in the flow block just before it (its run's first):
   * Word measures its offset from that paragraph's top, not from below it. */
  hostIsPrevious?: boolean;
  /** The inline span its lines are drawn over, px from its border box's
   * start, at its track's width; null when it draws no line beside a float
   * (an empty paragraph, a drawing: Word lets floats overlap drawings).
   * Absent: it fills its box. Read only on a region holding a side float. */
  inkSpanPx?: readonly [number, number] | null;
}

/** Harness switch (`window.__docsRegionSideFloatOff = true`): a float of a
 * single-column region on a page of column regions is drawn at the region's
 * start and always pushes the flow below it (as before; an A/B of one build). */
/** The attribute `floatingTextBoxLayout` marks a float with when its host
 * paragraph is the flow block just before it. */
export const FLOAT_HOST_BEFORE_ATTR = "data-float-host-before";

/** Harness switch (`window.__docsRegionFloatHostTopOff = true`): a run of
 * floats on a page of column regions stands below the block before it even
 * when that block is the paragraph it is anchored in (as before; A/B). */
function regionFloatHostTopOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsRegionFloatHostTopOff?: boolean }).__docsRegionFloatHostTopOff === true;
}

function regionSideFloatOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsRegionSideFloatOff?: boolean }).__docsRegionSideFloatOff === true;
}

export interface ColumnRegionFlowPlan {
  placements: UnequalColumnPlacement[];
  splitCandidates: UnequalColumnSplitCandidate[];
  physicalOverflowPx: number;
  /** Per column of the page's filling region, the top of a band its column
   * ends at (content coordinates); absent where no band ends one. */
  bandTopsPx?: readonly (number | undefined)[];
}

const heightAt = (block: UnequalColumnBlockMetric, index: number): number => {
  const fallback = block.heightsPx[block.heightsPx.length - 1] ?? 0;
  const height = block.heightsPx[index] ?? fallback;
  return Number.isFinite(height) && height >= 0 ? height : 0;
};

interface BalancePiece {
  /** Its height in each column (the last one stands for the rest): columns
   * of unequal width wrap the same text into different heights. */
  heightsPx: number[];
  marginTopPx: number;
  marginBottomPx: number;
  splittable: boolean;
  lineHeightPx: number;
  /** Where it can be cut (`ColumnRegionBlockMetric.breaksPx`), at the first
   * column's width; null when it is not balanced at drawn breaks. */
  breaks: ColumnLineBreak[] | null;
  /** Rows the piece must keep with the paragraph's first line (orphan
   * floor) and leave for its last line (widow floor). */
  headFloor: number;
  tailFloor: number;
  keepNext: boolean;
  /** A column break follows: what comes next opens the next column. */
  forceNextColumnAfter: boolean;
}

/** A paragraph cut by an earlier pass is balanced whole: its fragments in
 * this region join back into one piece of their summed rows. A fragment
 * continuing one on an earlier page holds no first line (no orphan floor);
 * one continuing on a later page holds no last line (no widow floor). */
function balancePieces(columns: number, blocks: readonly ColumnRegionBlockMetric[]): BalancePiece[] {
  const pieces: BalancePiece[] = [];
  let joining = false;
  for (const block of blocks) {
    if (block.flowless) continue;
    const floor = block.minSplitLines && block.minSplitLines > 0 ? block.minSplitLines : 1;
    const heightsPx = Array.from({ length: Math.max(1, columns) }, (_unused, column) => heightAt(block, column));
    const previous = pieces[pieces.length - 1];
    // A column break (a box of no height) closes the column of the piece
    // before it; the page planner records it so (ledgerCut), with no space
    // of its own between the two.
    if (block.forceNextColumnAfter && heightsPx.every((height) => !(height > 0)) && previous) {
      previous.forceNextColumnAfter = true;
      joining = false;
      continue;
    }
    if (joining && previous && block.continuesPrevious) {
      // A list cut by an earlier pass joins its breaks too: the old seam is
      // one more place it can be cut, the tail's breaks follow the head.
      const headPx = previous.heightsPx[0] ?? 0;
      previous.breaks = previous.breaks && block.breaksPx
        ? [
            ...previous.breaks,
            { endPx: headPx, nextPx: headPx },
            ...block.breaksPx.map((cut) => ({ endPx: headPx + cut.endPx, nextPx: headPx + cut.nextPx })),
          ]
        : null;
      previous.heightsPx = previous.heightsPx.map((height, column) => height + heightsPx[column]);
      previous.marginBottomPx = block.marginBottomPx;
      previous.tailFloor = block.continuesNext ? 1 : floor;
      previous.keepNext = Boolean(block.keepNext) && !block.continuesNext;
      previous.forceNextColumnAfter = Boolean(block.forceNextColumnAfter);
    } else {
      pieces.push({
        heightsPx,
        marginTopPx: block.marginTopPx,
        marginBottomPx: block.marginBottomPx,
        splittable: block.splittable && !block.keepLines,
        lineHeightPx: block.lineHeightPx && block.lineHeightPx > 0 ? block.lineHeightPx : 0,
        breaks: block.breaksPx && block.splittable && !block.keepLines ? [...block.breaksPx] : null,
        headFloor: block.continuesPrevious ? 1 : floor,
        tailFloor: block.continuesNext ? 1 : floor,
        keepNext: Boolean(block.keepNext) && !block.continuesNext,
        forceNextColumnAfter: Boolean(block.forceNextColumnAfter),
      });
    }
    joining = Boolean(block.continuesNext);
  }
  return pieces;
}

























export interface ColumnBalanceOptions {
  wordLegacy?: boolean;
}

/** What the last column may run over the height Word tries: a twip and a
 * half (40 lines, the 8th two twips short: 20 | 20, the second column a
 * twip over). The other columns take no line over it (ten 10 pt lines and
 * one of 37 after the thin ones: the 13th thin line, a twip over 236.5 +
 * 436/80, stays out). */
const WORD_LEGACY_BALANCE_SLACK_PX = 0.1;

/** Harness switch (`window.__docsWordLegacyBalanceOff = true`): a section's
 * columns are balanced to their lowest common height in every compatibility
 * mode (as before; an A/B of one build). */
function wordLegacyBalanceOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsWordLegacyBalanceOff?: boolean }).__docsWordLegacyBalanceOff === true;
}

/**
 * The lowest column height that holds a region's blocks in its columns,
 * text broken between its lines (Word balances a continuous section's
 * columns line by line); anything else moves whole. A break inside a
 * paragraph leaves Word's widow/orphan floor on each side of it, the rule
 * the column splitter then applies: balanced without it, the height let a
 * 2-row tail split 1|1 that the splitter refused, the tail moved whole and
 * the last column ran past the others (regionflow.docx p3 read 17/18/19
 * rows where Word's 19/19/16 keeps each paragraph's lines together).
 *
 * Each piece is taken at the height it has in the column that holds it
 * (`heightsPx` per track). Columns of unequal width wrap the same text
 * into different heights: balanced with the first track's heights for
 * every column, a heading that is one line in the wide column was planned
 * into the narrow one, where it is four, and a paragraph's tail was given
 * to the narrow column at the height it has in the wide one. The region
 * then painted past the page's foot while the page planner knew it fits,
 * and the two moved the same blocks back and forth for good
 * (complex2010.docx, "Left Wide Column, Right Small Column").
 */
export function balancedColumnHeightPx(
  columns: number,
  blocks: readonly ColumnRegionBlockMetric[],
  options: ColumnBalanceOptions = {},
): number {
  if (blocks.length === 0) return 0;
  const pieces = balancePieces(columns, blocks);
  const last = Math.max(0, columns - 1);
  const heightIn = (piece: BalancePiece, column: number): number =>
    piece.heightsPx[Math.min(column, last, piece.heightsPx.length - 1)] ?? 0;
  // What the columns hold when a flow ends (it fitted, or the last column
  // ran over): the height placed, its lines, and the tallest column.
  let placedPx = 0;
  let placedRows = 0;
  let tallestPx = 0;
  const rowsOf = (piece: BalancePiece, column: number): number =>
    piece.splittable && piece.lineHeightPx > 0 ? Math.max(1, Math.round(heightIn(piece, column) / piece.lineHeightPx)) : 1;
  // A keep-with-next piece whose follower's first line (its whole box when
  // it cannot be cut) would not stand in the same column opens the next one.
  const keepsOffColumn = (piece: BalancePiece, next: BalancePiece | undefined, column: number, end: number, limit: number): boolean => {
    if (!piece.keepNext || !next) return false;
    const nextHeight = heightIn(next, column);
    const first = next.splittable && next.lineHeightPx > 0 ? Math.min(nextHeight, next.lineHeightPx) : nextHeight;
    return end + collapseUnequalColumnMargins(piece.marginBottomPx, next.marginTopPx) + first > limit + 1e-6;
  };
  const fits = (limit: number, lastSlackPx = 0): boolean => {
    // The height a column holds: the last one may run `lastSlackPx` over.
    const cap = (at: number): number => (at >= columns - 1 ? limit + lastSlackPx : limit);
    let column = 0;
    let cursor = 0;
    let previousBottom = 0;
    placedPx = 0;
    placedRows = 0;
    tallestPx = 0;
    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
      const piece = pieces[pieceIndex];
      const height = heightIn(piece, column);
      const gap = cursor > 0 ? collapseUnequalColumnMargins(previousBottom, piece.marginTopPx) : 0;
      // No tolerance: the projector places the pieces at this height with
      // the same strict test, and a piece judged to fit a hair over it
      // moved to the next column there.
      const keptOff = cursor > 0 && column < columns - 1 &&
        cursor + gap + height <= limit + 1e-6 &&
        keepsOffColumn(piece, pieces[pieceIndex + 1], column, cursor + gap + height, limit);
      if (keptOff) {
        // It goes on with its follower: whole, into the next column.
        tallestPx = Math.max(tallestPx, cursor);
        column += 1;
        const moved = heightIn(piece, column);
        if (moved > cap(column) + 1e-6) return false;
        cursor = moved;
        placedPx += moved;
        placedRows += rowsOf(piece, column);
      } else if (cursor + gap + height <= cap(column) + 1e-6) {
        cursor += gap + height;
        placedPx += gap + height;
        placedRows += rowsOf(piece, column);
      } else if (piece.breaks) {
        // A list of uneven lines is cut where its lines end (the container
        // splitter cuts it there): each column takes its lines up to the
        // last break that fits, the next column the rest from the line after.
        // Balanced by a pitch it does not have, it moved whole (R494-D03 p6:
        // a two-column list drawn 540 | 43 under a plan of 292 | 291, the
        // page's last blocks moved off and back on every key).
        const breaks = piece.breaks;
        const totalPx = height;
        let startPx = 0;
        let base = cursor + gap;
        let atTop = cursor <= 0;
        for (;;) {
          const restPx = totalPx - startPx;
          if (base + restPx <= cap(column) + 1e-6) {
            placedPx += (atTop ? restPx : gap + restPx);
            cursor = base + restPx;
            placedRows += 1;
            break;
          }
          const room = cap(column) - base;
          let taken: ColumnLineBreak | null = null;
          for (const cut of breaks) {
            if (cut.endPx <= startPx + 1e-6) continue;
            if (cut.endPx - startPx > room + 1e-6) break;
            taken = cut;
          }
          if (taken) {
            placedPx += (atTop ? 0 : gap) + (taken.endPx - startPx);
            placedRows += 1;
            tallestPx = Math.max(tallestPx, base + taken.endPx - startPx);
            startPx = taken.nextPx;
          } else {
            // Not one line fits: a column it opens cannot hold it.
            if (atTop) return false;
            tallestPx = Math.max(tallestPx, cursor);
          }
          column += 1;
          if (column >= columns) return false;
          base = 0;
          atTop = true;
        }
      } else if (piece.splittable && piece.lineHeightPx > 0) {
        // A column holds whole lines (Word balances line by line: 41 lines
        // in three columns read 14, 14, 13), under the paragraph's floors.
        const pitch = piece.lineHeightPx;
        const rowsAt = (at: number) => Math.max(1, Math.round(heightIn(piece, at) / pitch));
        // Rows still to place, counted at the current column's width, each
        // as tall as the piece's box makes it there (its height over its
        // rows: a hair over the pitch for a block with its own padding).
        // Counted at the bare pitch, a two-line heading 59.2px tall "fit"
        // 59px, and the projector, placing its real box, cut it 1 | 1.
        let total = rowsAt(column);
        let line = heightIn(piece, column) / total;
        const rowsIn = (room: number) => Math.max(0, Math.floor(room / line + 1e-6));
        let left = total;
        let first = true;
        let base = cursor + gap;
        let atTop = cursor <= 0;
        for (;;) {
          let take = Math.min(left, rowsIn(cap(column) - base));
          if (take >= left) {
            cursor = base + left * line;
            placedPx += cursor - (atTop ? 0 : base - gap);
            placedRows += left;
            break;
          }
          if (left - take < piece.tailFloor) take = left - piece.tailFloor;
          if (take < (first ? piece.headFloor : 1)) take = 0;
          if (take <= 0 && atTop) {
            // A column too short for the floors still takes what it holds.
            take = Math.min(left - 1, rowsIn(cap(column) - base));
            if (take <= 0) return false;
          }
          if (take > 0) {
            first = false;
            placedPx += (atTop ? 0 : gap) + take * line;
            placedRows += take;
            tallestPx = Math.max(tallestPx, base + take * line);
          } else {
            tallestPx = Math.max(tallestPx, cursor);
          }
          left -= take;
          column += 1;
          if (column >= columns) return false;
          // The rest of the text wraps to the next column's width.
          const nextTotal = rowsAt(column);
          if (nextTotal !== total) {
            left = Math.max(1, Math.ceil((left / total) * nextTotal - 1e-6));
            total = nextTotal;
          }
          line = heightIn(piece, column) / total;
          base = 0;
          atTop = true;
        }
      } else if (piece.splittable) {
        // What is left of the piece, as a share of its text.
        let share = height > 0 ? 1 - Math.max(0, cap(column) - (cursor + gap)) / height : 0;
        const headPx = Math.max(0, Math.min(height, cap(column) - (cursor + gap)));
        if (headPx > 0) placedPx += gap + headPx;
        tallestPx = Math.max(tallestPx, headPx > 0 ? cursor + gap + headPx : cursor);
        column += 1;
        while (column < columns && share * heightIn(piece, column) > cap(column) + 1e-6) {
          share -= cap(column) / heightIn(piece, column);
          placedPx += cap(column);
          tallestPx = Math.max(tallestPx, cap(column));
          column += 1;
        }
        cursor = column < columns ? Math.max(0, share) * heightIn(piece, column) : 0;
        placedPx += cursor;
        // A block with no lines of its own to count is one line of the
        // step's average.
        placedRows += 1;
      } else {
        // Opening its column and still too tall: the projector leaves it
        // there (it never skips an empty column).
        if (cursor <= 0 && height > cap(column) + 1e-6) return false;
        tallestPx = Math.max(tallestPx, cursor);
        column += 1;
        if (column >= columns) return false;
        const moved = heightIn(piece, column);
        if (moved > cap(column) + 1e-6) return false;
        cursor = moved;
        placedPx += moved;
        placedRows += 1;
      }
      previousBottom = piece.marginBottomPx;
      if (column >= columns) return false;
      // Word's column break: the next piece opens the next column, however
      // much room this one left. Balanced as if the break were not there, a
      // section of five columns cut by breaks was given a fifth of its
      // height; its taller columns ran past it, the projector cut their
      // blocks at the region's foot, the page planner (which closes a column
      // at the break) joined them back, and the page never settled
      // (R30-D07).
      if (piece.forceNextColumnAfter && pieceIndex < pieces.length - 1 && column < columns - 1) {
        tallestPx = Math.max(tallestPx, cursor);
        column += 1;
        cursor = 0;
        previousBottom = 0;
      }
    }
    tallestPx = Math.max(tallestPx, cursor);
    return true;
  };
  if (options.wordLegacy && !wordLegacyBalanceOff()) {
    // Word, compatibility mode 14 and earlier (see ColumnBalanceOptions).
    let total = 0;
    let bottom = 0;
    pieces.forEach((piece, pieceIndex) => {
      total += (pieceIndex > 0 ? collapseUnequalColumnMargins(bottom, piece.marginTopPx) : 0) + heightIn(piece, 0);
      bottom = piece.marginBottomPx;
    });
    let limit = total / Math.max(1, columns);
    for (let pass = 0; pass < 400 && limit <= total + 1; pass += 1) {
      if (fits(limit, WORD_LEGACY_BALANCE_SLACK_PX)) return Math.ceil(tallestPx - 0.05);
      limit += Math.max(0.5, placedRows > 0 ? placedPx / placedRows : 0);
    }
  }
  let low = 0;
  let high = pieces.reduce(
    (sum, piece) => sum + Math.max(...piece.heightsPx) + Math.max(0, piece.marginTopPx),
    0,
  ) + 1;
  for (let step = 0; step < 40 && high - low > 0.01; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) high = middle;
    else low = middle;
  }
  return Math.ceil(high - 0.05);
}

/** Harness switch (`window.__docsColumnSeamHeadOff = true`): a balanced
 * region keeps the balanced height when a cut paragraph's head no longer
 * fits it (as before; an A/B of one build). */
function staleSeamGrowthOn(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsListBalanceBreaksOff?: boolean }).__docsListBalanceBreaksOff === true;
}

function columnSeamHeadOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsColumnSeamHeadOff?: boolean }).__docsColumnSeamHeadOff === true;
}

/**
 * The column height that keeps a cut paragraph's head in the column before
 * its tail, when the plan put the two in one column: where that column's
 * blocks end, its gap, and the head as tall as it is drawn there. Null when
 * every head stands in a column before its tail.
 */
export function seamHeadColumnHeightPx(
  placements: readonly UnequalColumnPlacement[],
  blocks: readonly ColumnRegionBlockMetric[],
  columns: number,
): number | null {
  for (let index = 0; index + 1 < blocks.length; index += 1) {
    const head = blocks[index];
    const tail = blocks[index + 1];
    if (!head.continuesNext || !tail.continuesPrevious || head.flowless) continue;
    // A middle piece under its own head's column: the seam after it is an
    // older cut (a column filled to the foot before the section was
    // balanced), which the page planner joins; the head before it is the cut
    // this balance made. Grown to hold it, the columns drew the old cut
    // again (R494-D03 p6: 540 | 43 for a list balanced 292 | 291).
    if (head.continuesPrevious && blocks[index - 1]?.continuesNext && head.breaksPx && !staleSeamGrowthOn()) continue;
    // A block past the last track is drawn in it (the region's placement
    // clamps it there), over what stands in it.
    const columnOf = (at: number) => {
      const placed = placements[at]?.columnIndex;
      return placed === undefined ? undefined : Math.min(placed, columns - 1);
    };
    const column = columnOf(index);
    if (column === undefined || column !== columnOf(index + 1) || column <= 0) continue;
    // The column the head was cut for: where the block before it stands.
    const before = column - 1;
    let end = 0;
    let marginBottom = 0;
    for (let other = 0; other < index; other += 1) {
      const placed = placements[other];
      if (!placed || placed.columnIndex !== before || blocks[other].flowless) continue;
      const bottom = placed.topPx + heightAt(blocks[other], before);
      if (bottom >= end) {
        end = bottom;
        marginBottom = blocks[other].marginBottomPx;
      }
    }
    const gap = end > 0 ? collapseUnequalColumnMargins(marginBottom, head.marginTopPx) : 0;
    return end + gap + heightAt(head, before);
  }
  return null;
}

/**
 * Place a page holding several sections as regions stacked from the top of
 * its text area: a single-column region flows as the page does, a column
 * region fills its tracks from its own top -- balanced to the lowest common
 * height when the section ends on this page (Word, a continuous section
 * followed by the next one on the same page), else down to the foot of the
 * page. Placements and split candidates are those of the column projection;
 * a column region's blocks also carry what the page charges for them.
 */
export function planColumnRegionFlow(
  regions: readonly ColumnRegionSpec[],
  capacityPx: number,
  blocks: readonly ColumnRegionBlockMetric[],
  /** Top-and-bottom boxes drawn out of the flow at their page point. */
  bands: readonly ColumnBandExclusion[] = [],
): ColumnRegionFlowPlan {
  const placements: UnequalColumnPlacement[] = new Array(blocks.length);
  const splitCandidates: UnequalColumnSplitCandidate[] = [];
  // The top of the band each column of the page's filling region ends at
  // (content coordinates), for the page planner (`columnBandTopsFor`).
  let bandTopsPx: (number | undefined)[] | undefined;
  let pageCursor = 0;
  let previousBottomMargin = 0;
  let bottom = 0;
  regions.forEach((region, regionIndex) => {
    const members = blocks
      .map((block, index) => ({ block, index }))
      .filter((entry) => entry.block.region === regionIndex);
    if (members.length === 0 || region.tracks.length === 0) return;
    // A float opening the region keeps its space before as its offset from
    // the flow (below), not as the region's.
    const opensWithFloat = region.tracks.length === 1 && members[0].block.outOfFlow === true && !members[0].block.flowless;
    const firstMargin = opensWithFloat ? 0 : members[0].block.marginTopPx;
    // Columns of a region: the first block's space before is its own
    // column's, not the region's. Word sets the first column's paragraph
    // that far down and the next column's from the top of the region (corpus
    // R460-D16 p1: "Received" 48 pt down the narrow title column, the title
    // at the top of the wide one; "Introduction" 20 pt down the body's first
    // column, the second column's text from the body's top). Taken as the
    // region's, the title, the abstract and the two-column body stood 64 px
    // low and the body's second column 23 px more; it ran over its foot by
    // what Word fits there, and the page planner, planning Word's cut,
    // alternated with the repair that undid it on every open.
    const columnsLead = region.tracks.length > 1 && !regionTopMarginOff();
    const atPageTop = pageCursor <= 0;
    // The page's first block keeps the space before it the sheet paints
    // (its computed margin, zero unless the page preserves leading space).
    const sharedTop = atPageTop ? 0 : pageCursor + previousBottomMargin;
    const firstTop =
      !atPageTop
        ? pageCursor + collapseUnequalColumnMargins(previousBottomMargin, firstMargin)
        : members[0].index === 0 ? Math.max(0, Number.isFinite(firstMargin) ? firstMargin : 0) : 0;
    const regionTop = columnsLead ? Math.min(sharedTop, firstTop) : firstTop;
    const pageTopMarginPx = columnsLead ? Math.max(0, firstTop - regionTop) : 0;
    if (region.tracks.length === 1) {
      const track = region.tracks[0];
      let cursor = regionTop;
      let previous: number | null = null;
      // A run of floats stands at one flow position: each float's space
      // before is the offset its placement wrote against that position (the
      // browser floats it so on a page that is not projected), each opens
      // below the one before, and the flow resumes under the lowest. Stacked
      // like ordinary blocks, the second float's offset was added below the
      // first one's: two anchored pictures took 595 px of a page they take
      // 384 px of unprojected, and the page alternated forever between the
      // layout that projects them and the one that does not (R30-D07).
      let floatBase: number | null = null;
      let floatBottom = 0;
      let runCursor = cursor;
      let runPrevious: number | null = null;
      // The top of the last flow block placed, and whether the float run
      // stands from it (its first float is anchored in it): Word measures a
      // paragraph-placed float from its paragraph's top (corpus R351-D09 p1:
      // the "Check for updates" group 3.55pt below an empty paragraph was
      // drawn under it, and the title 9pt low).
      let lastFlowTop: number | null = null;
      let runFromHostTop = false;
      const hostTop = !regionFloatHostTopOff();
      // Where the flow resumes after a float run: under the lowest float, but
      // never above where the next block stands with no float at all.
      const resumeAfterFloats = () => {
        const natural = runPrevious === null ? runCursor : runCursor + Math.max(0, runPrevious);
        if (runFromHostTop && floatBottom <= natural) {
          cursor = runCursor;
          previous = runPrevious;
        } else {
          cursor = floatBottom;
          previous = 0;
        }
      };
      const sideFloats = !regionSideFloatOff();
      // Where a side float stands across the track: at its side, its
      // margins inside the track (`float: right` on a page not projected).
      const sideStartOf = (block: ColumnRegionBlockMetric): number | null => {
        if (!sideFloats || !block.sideFloat) return null;
        const outer = block.sideFloat.widthPx + Math.max(0, block.marginLeftPx || 0) + Math.max(0, block.marginRightPx || 0);
        if (!(outer < track.widthPx - 1)) return null;
        return block.sideFloat.side === "right" ? track.widthPx - outer : 0;
      };
      // A side float the text of its region stands beside, in Word's wrap,
      // with no line of it reaching into the float: it moves the flow
      // nothing (corpus R351-D09 p1: a journal logo square-wrapped at the
      // right of the masthead lines; drawn as one more float of the run,
      // it pushed the page's text 33pt down and its last lines to page 2).
      // A line that would reach into it keeps the run's push below it.
      const besideFlow = (position: number, top: number, bottom: number, start: number, end: number): boolean => {
        let y = cursor;
        let before = previous;
        for (let next = position + 1; next < members.length; next += 1) {
          const other = members[next].block;
          if (other.sectionBreak) break;
          if (other.flowless || other.outOfFlow) continue;
          const height = heightAt(other, 0);
          const at = before === null ? y : y + collapseUnequalColumnMargins(before, other.marginTopPx);
          if (at >= bottom) break;
          if (at + height > top && other.inkSpanPx !== null) {
            const left = (other.marginLeftPx || 0) + (other.inkSpanPx ? other.inkSpanPx[0] : 0);
            const right = other.inkSpanPx
              ? (other.marginLeftPx || 0) + other.inkSpanPx[1]
              : track.widthPx - (other.marginRightPx || 0);
            if (right > start + 0.5 && left < end - 0.5) return false;
          }
          y = at + height;
          before = other.marginBottomPx;
        }
        return true;
      };
      for (const [position, { block, index }] of members.entries()) {
        if (block.sectionBreak) {
          // Drawn where the flow is; the space after the paragraph before it
          // still meets the next block's space before (below or across the
          // next region's top). Taken as a block of zero margins, it kept
          // both spaces: the paragraph after it stood their sum below the
          // one before, where the planner charged the larger one, and a
          // column that held a block in the plan ran over in the drawing
          // (corpus R11-D21: page 18's last list held, cycled, never ready).
          placements[index] = {
            columnIndex: 0,
            topPx: cursor,
            inlineStartPx: 0,
            widthPx: Math.max(1, track.widthPx),
            flowStartPx: cursor,
            flowEndPx: cursor,
            clipInline: false,
            regionColumns: 1,
          };
          continue;
        }
        if (block.outOfFlow && !block.flowless) {
          const sideStart = sideStartOf(block);
          if (sideStart !== null && floatBase === null && block.sideFloat) {
            const height = heightAt(block, 0);
            const top = (previous === null ? cursor : cursor + Math.max(0, previous)) + Math.max(0, block.marginTopPx || 0);
            const outerEnd = sideStart + block.sideFloat.widthPx + Math.max(0, block.marginLeftPx || 0) + Math.max(0, block.marginRightPx || 0);
            if (besideFlow(position, top, top + height + Math.max(0, block.marginBottomPx || 0), sideStart, outerEnd)) {
              placements[index] = {
                columnIndex: 0,
                topPx: top,
                inlineStartPx: sideStart,
                widthPx: Math.max(1, block.sideFloat.widthPx),
                flowStartPx: top,
                flowEndPx: top + height,
                clipInline: false,
                regionColumns: 1,
                floatAdvancePx: 0,
                marginDroppedPx: (block.marginTopPx || 0) - Math.max(0, block.marginTopPx || 0),
              };
              continue;
            }
          }
          if (floatBase === null) {
            runCursor = cursor;
            runPrevious = previous;
            runFromHostTop = hostTop && block.hostIsPrevious === true && lastFlowTop !== null;
            floatBase = runFromHostTop ? lastFlowTop! : previous === null ? cursor : cursor + Math.max(0, previous);
            floatBottom = floatBase;
          }
          const height = heightAt(block, 0);
          const top = Math.max(floatBase + Math.max(0, block.marginTopPx || 0), floatBottom);
          const bareTop = Math.max(floatBase, floatBottom);
          const outerBottom = top + height + Math.max(0, block.marginBottomPx || 0);
          const horizontal = (block.marginLeftPx || 0) + (block.marginRightPx || 0);
          // Still at its side when it pushes the flow (a right float was
          // drawn at the region's left edge).
          placements[index] = {
            columnIndex: 0,
            topPx: top,
            inlineStartPx: sideStart ?? 0,
            widthPx: Math.max(1, sideStart !== null && block.sideFloat ? block.sideFloat.widthPx : track.widthPx - horizontal),
            flowStartPx: top,
            flowEndPx: top + height,
            clipInline: false,
            regionColumns: 1,
            floatAdvancePx: Math.max(0, outerBottom - floatBottom),
            marginDroppedPx: (block.marginTopPx || 0) - (top - bareTop),
          };
          floatBottom = Math.max(floatBottom, outerBottom);
          continue;
        }
        let pushedFromPx: number | null = null;
        if (floatBase !== null && !block.flowless) {
          // The flow resumes under the floats: this block's space before
          // stands below them (the ledger charges the floats their advance
          // and this block its own space before).
          pushedFromPx = runPrevious === null ? runCursor : runCursor + collapseUnequalColumnMargins(runPrevious, block.marginTopPx);
          resumeAfterFloats();
          floatBase = null;
        }
        if (block.flowless) {
          const horizontal = (block.marginLeftPx || 0) + (block.marginRightPx || 0);
          const at = previous === null ? cursor : cursor + collapseUnequalColumnMargins(previous, block.marginTopPx);
          placements[index] = {
            columnIndex: 0,
            topPx: at,
            inlineStartPx: 0,
            widthPx: Math.max(1, track.widthPx - horizontal),
            flowStartPx: at,
            flowEndPx: at,
            clipInline: false,
            regionColumns: 1,
          };
          continue;
        }
        const height = heightAt(block, 0);
        const top = previous === null ? cursor : cursor + collapseUnequalColumnMargins(previous, block.marginTopPx);
        const bareTop = previous === null ? cursor : cursor + collapseUnequalColumnMargins(previous, 0);
        const horizontal = (block.marginLeftPx || 0) + (block.marginRightPx || 0);
        placements[index] = {
          columnIndex: 0,
          topPx: top,
          inlineStartPx: 0,
          widthPx: Math.max(1, track.widthPx - horizontal),
          flowStartPx: top,
          flowEndPx: top + height,
          clipInline: false,
          regionColumns: 1,
          marginDroppedPx: (block.marginTopPx || 0) - (top - bareTop),
          ...(pushedFromPx !== null && top - pushedFromPx > 0 ? { floatPushPx: top - pushedFromPx } : {}),
        };
        cursor = top + height;
        previous = block.marginBottomPx;
        lastFlowTop = top;
      }
      if (floatBase !== null) resumeAfterFloats();
      pageCursor = cursor;
      previousBottomMargin = previous ?? 0;
      // The page's last line may hang its Auto leading below the foot.
      bottom = Math.max(bottom, cursor - footCreditOf(members[members.length - 1].block, { footCredit: true }));
      return;
    }
    const room = Math.max(1, capacityPx - regionTop);
    // Keep with next / keep lines together shape a balanced section's seams
    // (the balance and the page planner's own balance read them alike). A
    // section filling its columns to the page's foot is cut by the page
    // planner at the page's foot only: a seam between two of its columns is
    // this plan's, so keep with next stays (Word: "Introduction" of corpus
    // R432-D07, under a single-column title, opens column 2 with its
    // paragraph; here it stood alone at column 1's foot while the planner
    // had charged it to column 2).
    const regionBlocks = members.map((entry) =>
      region.balance ? entry.block : {
        ...entry.block,
        keepNext: keepNextFloorOff() ? false : entry.block.keepNext,
        keepLines: false,
        // Still never cut for its last lines to go with its follower.
        ...(entry.block.keepLines ? { heldWhole: true } : {}),
      });
    // The balance charges the first block its space before in the column it
    // opens (the first): as tall there as it stands.
    const balanceBlocks = pageTopMarginPx > 0
      ? regionBlocks.map((block, position) => position === 0
        ? { ...block, heightsPx: block.heightsPx.map((height, column) => column === 0 ? height + pageTopMarginPx : height) }
        : block)
      : regionBlocks;
    let height = region.balance
      ? Math.min(room, Math.max(1, balancedColumnHeightPx(region.tracks.length, balanceBlocks, region.wordLegacyBalance ? { wordLegacy: true } : {})))
      : room;
    // Columns filled to the page's foot take Word's page-bottom credit; a
    // balanced section ends above the next one, not at the foot.
    const flowOptions: UnequalColumnFlowOptions = {
      ...(columnsLead ? { leadPx: pageTopMarginPx } : {}),
      footCredit: !region.balance,
      ...(region.keepNextCutsLastLines && !region.balance ? { keepNextCutsLastLines: true } : {}),
      ...(region.balance ? {} : { columnCapacitiesPx: bandedColumnFeet(region.tracks, regionTop, height, bands) }),
    };
    const footOf = (column: number) => {
      const own = flowOptions.columnCapacitiesPx?.[column];
      return own !== undefined ? Math.min(height, own) : height;
    };
    if (flowOptions.columnCapacitiesPx?.some((foot) => foot !== undefined)) {
      bandTopsPx = flowOptions.columnCapacitiesPx.map((foot) => (foot === undefined ? undefined : regionTop + foot));
    }
    let plan = planUnequalColumnFlow(region.tracks, height, regionBlocks, flowOptions);
    // A paragraph cut at a balanced column's foot keeps its head there: the
    // balance counts its rows at the paragraph's pitch, and a head holding a
    // line taller than that (an inline formula's stacked fraction) is taller
    // than its rows. Placed at the balanced height, the head no longer fit
    // its column and went on to stand over its own tail in the next one;
    // the page planner joined the two (a seam inside one track) and never
    // cut the paragraph again, which stood whole in the next column (corpus
    // R350-D01: "This article is about ..." whole in column 2, "1.
    // INTRODUCTION" alone in column 1; Word cuts it after "not universal").
    // The columns grow to hold the head as it is drawn.
    if (region.balance && !columnSeamHeadOff()) {
      for (let pass = 0; pass < 4; pass += 1) {
        const needed = seamHeadColumnHeightPx(plan.placements, regionBlocks, region.tracks.length);
        if (needed === null || !(needed > height + 0.5) || needed > room + 0.5) break;
        height = Math.ceil(needed - 0.05);
        plan = planUnequalColumnFlow(region.tracks, height, regionBlocks, flowOptions);
      }
    }
    let regionBottom = regionTop;
    let regionFlowBottom = regionTop;
    members.forEach(({ block, index }, memberIndex) => {
      const placed = plan.placements[memberIndex];
      // The region's last column takes what it is given: there is no
      // further track inside this region.
      const column = Math.min(placed.columnIndex, region.tracks.length - 1);
      const top = regionTop + placed.topPx;
      const own = block.flowless ? 0 : heightAt(block, column);
      placements[index] = {
        ...placed,
        columnIndex: column,
        inlineStartPx: trackInlineStart(region.tracks, column),
        topPx: top,
        flowStartPx: top,
        flowEndPx: top + own,
        regionColumns: region.tracks.length,
      };
      regionBottom = Math.max(regionBottom, top + own);
      regionFlowBottom = Math.max(regionFlowBottom, top + own - footCreditOf(block, flowOptions));
    });
    const cutBlocks = new Set<number>();
    plan.splitCandidates.forEach((candidate) => {
      // A cut is a column seam inside the region; in its last column it
      // would be the page's, which the page planner makes.
      if (candidate.columnIndex >= region.tracks.length - 1) return;
      // Under a full column the balanced height (whole pixels) can leave
      // less than a line of room: no line goes there, so asking for a cut
      // would carve one line per pass. The block opens the next column.
      const block = regionBlocks[candidate.blockIndex];
      const line = block.splittable && block.lineHeightPx && block.lineHeightPx > 0 ? block.lineHeightPx : 0;
      if (line > 0 && candidate.availablePx + (candidate.footCreditPx ?? 0) < line - 0.5) return;
      cutBlocks.add(candidate.blockIndex);
      splitCandidates.push({ ...candidate, blockIndex: members[candidate.blockIndex].index });
    });
    // A block that opens a column and still runs past the region's height
    // is cut at that column's foot (the column flow reports only the seam
    // it was moved across).
    members.forEach(({ block, index }, memberIndex) => {
      if (cutBlocks.has(memberIndex) || block.flowless) return;
      const placed = plan.placements[memberIndex];
      if (placed.columnIndex >= region.tracks.length - 1) return;
      const own = heightAt(block, placed.columnIndex);
      const foot = footOf(placed.columnIndex);
      const creditPx = foot < height ? 0 : footCreditOf(block, flowOptions);
      if (!(placed.topPx + own - creditPx > foot + 0.5) || !(foot - placed.topPx > 0)) return;
      const track = region.tracks[placed.columnIndex];
      splitCandidates.push({
        blockIndex: index,
        columnIndex: placed.columnIndex,
        availablePx: foot - placed.topPx,
        measurementWidthPx: Math.max(1, track.widthPx - (block.marginLeftPx || 0) - (block.marginRightPx || 0)),
        opensColumn: placed.topPx <= 0,
        ...(creditPx > 0 ? { footCreditPx: creditPx } : {}),
      });
    });
    members.forEach(({ block, index }, memberIndex) => {
      const last = memberIndex === members.length - 1;
      placements[index].regionCharge = {
        heightPx: last ? Math.max(0, regionBottom - regionTop) : 0,
        marginBeforePx: memberIndex === 0 ? block.marginTopPx : 0,
        marginAfterPx: last ? block.marginBottomPx : 0,
        tied: !last,
        trackHeightsPx: region.tracks.map((_track, column) => (block.flowless ? 0 : heightAt(block, column))),
        columns: region.tracks.length,
        linePitchPx: block.lineHeightPx && block.lineHeightPx > 0 ? block.lineHeightPx : 0,
        ...(block.listRows || block.breaksPx ? { minSplitLines: 1 } : {}),
        ...(block.breaksPx && !block.flowless ? { breaksPx: block.breaksPx } : {}),
      };
    });
    pageCursor = regionBottom;
    previousBottomMargin = members[members.length - 1].block.marginBottomPx;
    // What the columns could not hold (past the region's last track) is the
    // page's overflow; the page planner moves it on.
    bottom = Math.max(bottom, regionFlowBottom, regionTop + height + plan.physicalOverflowPx);
  });
  return {
    placements: Array.from(placements, (placement) =>
      placement ?? { columnIndex: 0, topPx: 0, inlineStartPx: 0, widthPx: 1, flowStartPx: 0, flowEndPx: 0, clipInline: false },
    ),
    splitCandidates,
    physicalOverflowPx: Math.max(0, bottom - capacityPx),
    ...(bandTopsPx ? { bandTopsPx } : {}),
  };
}

/**
 * Each column's own foot under the bands drawn at it: a top-and-bottom box
 * standing across a column with no room for a line below it ends the column
 * at the box's top (Word wraps the column's text above it; corpus R94-D21
 * and R93-D23, a conference template's footnote box at the first column's
 * foot). A band with room below it is left as drawn.
 */
export function bandedColumnFeet(
  tracks: readonly UnequalColumnTrack[],
  regionTopPx: number,
  heightPx: number,
  bands: readonly ColumnBandExclusion[],
): (number | undefined)[] {
  return tracks.map((track, column) => {
    const start = trackInlineStart(tracks, column);
    const end = start + track.widthPx;
    let foot: number | undefined;
    for (const band of bands) {
      if (band.rightPx <= start + 0.5 || band.leftPx >= end - 0.5) continue;
      const top = band.topPx - regionTopPx;
      // Below the band no line fits: within a line pitch (24px) of the foot.
      if (!(top > 0 && top < heightPx) || band.bottomPx - regionTopPx < heightPx - BAND_FOOT_SLACK_PX) continue;
      foot = Math.min(foot ?? heightPx, top);
    }
    return foot;
  });
}

/** How far above a column's foot a band may end and still close the column. */
const BAND_FOOT_SLACK_PX = 24;

function px(style: CSSStyleDeclaration, property: string): number {
  const value = Number.parseFloat(style.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

function projectionRuleState(document: Document): ProjectionRuleState {
  const existing = ruleStateByDocument.get(document);
  if (existing) return existing;
  const element = document.createElement("style");
  element.setAttribute("data-mrnote-unequal-column-rules", "true");
  (document.head ?? document.documentElement).appendChild(element);
  const created: ProjectionRuleState = {
    element,
    entries: new Map<string, WeakRef<HTMLElement>>(),
    slots: 0,
  };
  ruleStateByDocument.set(document, created);
  return created;
}

/** The fixed rules of child positions `from`..`to`. An unset property makes
 * its declaration invalid at computed-value time: the block then keeps the
 * automatic top, left and width of its absolute position, and no clip. A print
 * copy's own parts after the blocks are left alone (zero specificity added):
 * taken for slots, a page's header lost its margin-box left and stood at the
 * paper's right edge, and Chromium shrank every page of the PDF to fit it
 * (R308-D01's even headers, its pages printed at 78 %). */
function slotRulesText(from: number, to: number): string {
  const rules: string[] = [];
  for (let position = from; position <= to; position += 1) {
    rules.push(
      `article[${UNEQUAL_COLUMN_SHEET_ID_ATTR}][${UNEQUAL_COLUMN_FLOW_ATTR}="true"] > :nth-child(${position}):where(:not([${SHEET_PRINT_PART_ATTR}])) { ` +
        `top: var(${slotTopVar(position)}); left: var(${slotLeftVar(position)}); ` +
        `width: var(${slotWidthVar(position)}) !important; clip-path: var(${slotClipVar(position)}); }`,
    );
  }
  return rules.join("\n");
}

/** Make sure the fixed rules reach child position `count`. */
function ensureSlotRules(state: ProjectionRuleState, count: number): void {
  if (count <= state.slots) return;
  const to = Math.ceil(count / SLOT_RULES_CHUNK) * SLOT_RULES_CHUNK;
  const style = state.element.ownerDocument.createElement("style");
  style.setAttribute("data-mrnote-unequal-column-slots", `${state.slots + 1}-${to}`);
  style.textContent = slotRulesText(state.slots + 1, to);
  // After the rules already there: the same place in the cascade.
  let last: Element = state.element;
  while (last.nextElementSibling?.hasAttribute("data-mrnote-unequal-column-slots")) last = last.nextElementSibling;
  last.after(style);
  state.slots = to;
}

/**
 * Bring the sheet's inline custom properties to `next` (null: remove), and
 * write only what differs from what is there: a projection that changes
 * nothing writes nothing, so the page is not styled or measured again.
 */
function writeSheetProperties(sheet: HTMLElement, next: ReadonlyMap<string, string | null>): void {
  const style = sheet.style;
  const changed: Array<[string, string]> = [];
  for (const [name, value] of next) {
    const current = style.getPropertyValue(name);
    if (value === null) {
      if (current !== "") style.removeProperty(name);
    } else if (current !== value) {
      changed.push([name, value]);
    }
  }
  if (changed.length === 0) return;
  if (changed.length < BATCHED_STYLE_WRITES) {
    for (const [name, value] of changed) style.setProperty(name, value);
    return;
  }
  // A later declaration of a property replaces the earlier one.
  const text = style.cssText.trim();
  style.cssText = `${text}${text === "" || text.endsWith(";") ? "" : ";"} ${changed.map(([name, value]) => `${name}: ${value}`).join("; ")};`;
}

/** How much the sheet is drawn larger than it is laid out (a zoom
 * transform on it or an ancestor), so a drawn box reads back in layout px. */
function sheetDrawScale(sheet: HTMLElement): number {
  const drawn = sheet.getBoundingClientRect().width;
  return sheet.offsetWidth > 0 && drawn > 0 ? drawn / sheet.offsetWidth : 1;
}

/** A block's laid-out height, unrounded. offsetHeight rounds to whole
 * pixels: R02-D14's 6.52px label and 20.81px pair of lines stacked at 28px
 * a block instead of 27.33, 24px over a column, and its last block's second
 * line went to the next column (34 pages where Word has 33). */
function columnBreakStaysOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsColumnBreakStaysOff?: boolean }).__docsColumnBreakStaysOff === true;
}

function laidOutHeightPx(block: HTMLElement, scale: number): number {
  const drawn = block.getBoundingClientRect().height;
  if (!(drawn > 0) || !(scale > 0)) return Math.max(0, block.offsetHeight);
  return drawn / scale;
}

/** The number of child positions whose properties the sheet carries. */
function sheetSlotCount(sheet: HTMLElement): number {
  const count = Number.parseInt(sheet.style.getPropertyValue(SLOT_COUNT_VAR), 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** Every projection rule now in force, in the order the sheets were first
 * projected (tests, checks): read back from the sheets, written as the
 * rules the properties amount to. */
export function unequalColumnProjectionRulesText(document: Document): string {
  const state = ruleStateByDocument.get(document);
  if (!state) return "";
  const texts: string[] = [];
  for (const [id, reference] of state.entries) {
    const sheet = reference.deref();
    if (!sheet || !sheet.isConnected || sheet.getAttribute(UNEQUAL_COLUMN_SHEET_ID_ATTR) !== id) continue;
    const selector = projectionSelector(id);
    const style = sheet.style;
    const rules: string[] = [];
    const sheetDeclarations = [COLUMN_RULE_IMAGE_VAR, COLUMN_RULE_TOP_VAR, COLUMN_RULE_HEIGHT_VAR]
      .map((name) => [name, style.getPropertyValue(name)] as const)
      .filter(([, value]) => value !== "")
      .map(([name, value]) => `${name}: ${value}`);
    if (sheetDeclarations.length > 0) rules.push(`${selector} { ${sheetDeclarations.join("; ")}; }`);
    const count = sheetSlotCount(sheet);
    for (let position = 1; position <= count; position += 1) {
      const top = style.getPropertyValue(slotTopVar(position));
      const left = style.getPropertyValue(slotLeftVar(position));
      const width = style.getPropertyValue(slotWidthVar(position));
      const clip = style.getPropertyValue(slotClipVar(position));
      const declarations = [
        ...(top !== "" ? [`top: ${top};`] : []),
        ...(left !== "" ? [`left: ${left};`] : []),
        ...(width !== "" ? [`width: ${width} !important;`] : []),
        ...(clip !== "" ? [`clip-path: ${clip};`] : []),
      ];
      if (declarations.length > 0) rules.push(`${selector} > :nth-child(${position}) { ${declarations.join(" ")} }`);
    }
    if (rules.length > 0) texts.push(rules.join("\n"));
  }
  return texts.join("\n");
}

/** The sheet's id (the decoration's, or one given here) and its place among
 * the projected sheets. */
function projectionSheetId(sheet: HTMLElement): {
  id: string;
  state: ProjectionRuleState;
} {
  const state = projectionRuleState(sheet.ownerDocument);
  for (const [known, reference] of state.entries) {
    const other = reference.deref();
    if (!other || !other.isConnected) state.entries.delete(known);
  }
  let id = sheet.getAttribute(UNEQUAL_COLUMN_SHEET_ID_ATTR);
  const existing = id ? state.entries.get(id)?.deref() : undefined;
  if (
    !id ||
    !/^uc-\d+(?:-\d+)?$/.test(id) ||
    (existing?.isConnected && existing !== sheet)
  ) {
    id = `uc-${nextUnequalColumnSheetId}`;
    nextUnequalColumnSheetId += 1;
    sheet.setAttribute(UNEQUAL_COLUMN_SHEET_ID_ATTR, id);
  }
  if (state.entries.get(id)?.deref() !== sheet) state.entries.set(id, new WeakRef(sheet));
  return { id, state };
}

function projectionSelector(sheetId: string): string {
  return `article[${UNEQUAL_COLUMN_SHEET_ID_ATTR}="${sheetId}"][${UNEQUAL_COLUMN_FLOW_ATTR}="true"]`;
}

/** Start a projection of `sheet` over `count` blocks: its id, and the fixed
 * rules for that many child positions. */
function beginProjection(sheet: HTMLElement, count: number): void {
  const { state } = projectionSheetId(sheet);
  ensureSlotRules(state, count);
}

/** Give the blocks at `widths`' positions (1-based) those widths, for a
 * measurement at one track width. */
function writeMeasurementWidths(sheet: HTMLElement, widths: ReadonlyMap<number, number>): void {
  const next = new Map<string, string | null>();
  for (const [position, widthPx] of widths) next.set(slotWidthVar(position), `${widthPx}px`);
  writeSheetProperties(sheet, next);
}

interface SlotPlacement {
  topPx: number;
  leftPx: number;
  widthPx: number;
  /** A `clip-path` value, or null for none. */
  clip: string | null;
}

/** Write a finished projection: the sheet's own declarations and every
 * block's place, and drop the places of positions the sheet no longer has. */
function writeProjection(
  sheet: HTMLElement,
  sheetDeclarations: ReadonlyArray<readonly [string, string]>,
  placements: readonly SlotPlacement[],
): void {
  const next = new Map<string, string | null>(sheetDeclarations);
  placements.forEach((placement, index) => {
    const position = index + 1;
    next.set(slotTopVar(position), `${placement.topPx}px`);
    next.set(slotLeftVar(position), `${placement.leftPx}px`);
    next.set(slotWidthVar(position), `${placement.widthPx}px`);
    next.set(slotClipVar(position), placement.clip);
  });
  const before = sheetSlotCount(sheet);
  for (let position = placements.length + 1; position <= before; position += 1) {
    next.set(slotTopVar(position), null);
    next.set(slotLeftVar(position), null);
    next.set(slotWidthVar(position), null);
    next.set(slotClipVar(position), null);
  }
  next.set(SLOT_COUNT_VAR, String(placements.length));
  writeSheetProperties(sheet, next);
}

/**
 * Read geometry at one source-track width without mutating the block
 * (ProseMirror's): its position's width property on the sheet is set for the
 * measurement and put back. `write` runs each of the two writes; a caller
 * with an editor view and a mutation record of its own passes one that keeps
 * them out of both (the sheet is ProseMirror's too, and a recorded write
 * reads as a change of the page).
 */
export function measureUnequalColumnBlockAtWidth<T>(
  block: HTMLElement,
  widthPx: number,
  measure: () => T,
  write: (apply: () => void) => void = (apply) => apply(),
): T {
  const address = ruleAddressByBlock.get(block);
  const sheet = address?.sheet.deref();
  if (!address || !sheet || block.parentElement !== sheet || !(widthPx > 0)) return measure();
  const name = slotWidthVar(address.childIndex + 1);
  const previous = sheet.style.getPropertyValue(name);
  const next = `${widthPx}px`;
  if (previous === next) return measure();
  write(() => sheet.style.setProperty(name, next));
  try {
    return measure();
  } finally {
    write(() => {
      if (previous === "") sheet.style.removeProperty(name);
      else sheet.style.setProperty(name, previous);
    });
  }
}

export function clearUnequalColumnProjection(sheet: HTMLElement): void {
  if (
    !sheet.hasAttribute(UNEQUAL_COLUMN_FLOW_ATTR) &&
    !projectionBySheet.has(sheet)
  ) {
    return;
  }
  sheet.removeAttribute(UNEQUAL_COLUMN_FLOW_ATTR);
  const sheetId = sheet.getAttribute(UNEQUAL_COLUMN_SHEET_ID_ATTR);
  if (sheetId) {
    const state = ruleStateByDocument.get(sheet.ownerDocument);
    if (state?.entries.get(sheetId)?.deref() === sheet) state.entries.delete(sheetId);
    sheet.removeAttribute(UNEQUAL_COLUMN_SHEET_ID_ATTR);
  }
  const cleared = new Map<string, string | null>([
    [COLUMN_RULE_IMAGE_VAR, null],
    [COLUMN_RULE_TOP_VAR, null],
    [COLUMN_RULE_HEIGHT_VAR, null],
    [SLOT_COUNT_VAR, null],
    [NOTE_COLUMNS_VAR, null],
    [NOTE_COLUMN_GAP_VAR, null],
  ]);
  const count = sheetSlotCount(sheet);
  for (let position = 1; position <= count; position += 1) {
    cleared.set(slotTopVar(position), null);
    cleared.set(slotLeftVar(position), null);
    cleared.set(slotWidthVar(position), null);
    cleared.set(slotClipVar(position), null);
  }
  writeSheetProperties(sheet, cleared);
  for (const child of Array.from(sheet.children)) {
    if (!(child instanceof HTMLElement)) continue;
    placementByBlock.delete(child);
    ruleAddressByBlock.delete(child);
  }
  projectionBySheet.delete(sheet);
}

/** The region specs a page's regions token names, or null. */
/**
 * A Top and Bottom box wider than its column at the head of a multi-column
 * section: Word keeps every column's text clear of it, so the columns start
 * below it (corpus R432-D04, the IJDR journal: the abstract box 551.5 pt wide
 * anchored in the first paragraph of a two-column section; drawn as a block
 * of the first column, the second column's text ran over it). The box and the
 * empty lines before it in the section become a full-width region of their
 * own, stacked above the section's columns. `regionOf` and `regionTracks` are
 * rewritten in place.
 */
const SPANNING_BAND_SELECTOR = '[data-float-mode="band"], figure[data-document-shape][data-float-band="true"]';

function splitRegionsAtSpanningBands(
  blocks: readonly HTMLElement[],
  regionOf: number[],
  regionTracks: Array<readonly UnequalColumnTrack[]>,
  printableWidthPx: number,
  /** Each region's side insets (parseColumnRegionInsets), split alike. */
  insets?: Array<{ startPx: number; endPx: number }>,
): void {
  for (let region = regionTracks.length - 1; region >= 0; region -= 1) {
    const tracks = regionTracks[region];
    if (tracks.length < 2) continue;
    const widest = Math.max(...tracks.map((track) => track.widthPx));
    const first = regionOf.indexOf(region);
    if (first < 0) continue;
    let band = -1;
    for (let index = first; index < blocks.length && regionOf[index] === region; index += 1) {
      const block = blocks[index];
      // A Top and Bottom picture or box (`data-float-mode="band"`), or a
      // drawing (`figure[data-document-shape][data-float-band]`), as the
      // sheet's child or the node view's one figure.
      const bandElement = block.matches(SPANNING_BAND_SELECTOR)
        ? block
        : block.querySelector<HTMLElement>(`:scope > ${SPANNING_BAND_SELECTOR.split(", ").join(", :scope > ")}`);
      if (bandElement) {
        // The wrapper keeps to its column (max-width); the box is its frame.
        const drawnPx = Math.max(
          bandElement.getBoundingClientRect().width,
          ...Array.from(bandElement.querySelectorAll<HTMLElement>(":scope > *, :scope > * > *"), (child) => child.getBoundingClientRect().width),
        ) / Math.max(1e-6, sheetDrawScaleOf(block));
        if (drawnPx > widest + 2) band = index;
        break;
      }
      // Only empty lines (and section marks) may stand above it in the section.
      if ((block.textContent ?? "").trim() || block.querySelector("img, svg, table, canvas")) break;
    }
    if (band < 0) continue;
    const inset = insets?.[region] ?? { startPx: 0, endPx: 0 };
    regionTracks.splice(region, 0, [{ widthPx: printableWidthPx - inset.startPx - inset.endPx, gapAfterPx: 0 }]);
    insets?.splice(region, 0, inset);
    for (let index = 0; index < regionOf.length; index += 1) {
      if (regionOf[index] > region || (regionOf[index] === region && index > band)) regionOf[index] += 1;
    }
  }
}

function sheetDrawScaleOf(block: HTMLElement): number {
  const sheet = block.closest<HTMLElement>("article[data-page-sheet]");
  return sheet ? sheetDrawScale(sheet) : 1;
}

export function parseColumnRegions(
  value: string | null | undefined,
  printableWidthPx: number,
): Array<readonly UnequalColumnTrack[]> | null {
  if (!value || !(printableWidthPx > 0)) return null;
  const tokens = value.split("|");
  if (tokens.length < 2 || tokens.length > 64) return null;
  const regions: Array<readonly UnequalColumnTrack[]> = [];
  for (const raw of tokens) {
    const inset = regionInsetOf(raw);
    if (!inset) return null;
    const widthPx = printableWidthPx - inset.startPx - inset.endPx;
    if (!(widthPx > 0)) return null;
    if (inset.token === "1") {
      regions.push([{ widthPx, gapAfterPx: 0 }]);
      continue;
    }
    const tracks = parseUnequalColumnTracks(inset.token, widthPx);
    if (!tracks) return null;
    regions.push(tracks);
  }
  return regions;
}

const REGION_MARGINS_GRAMMAR = /^(.*)@(-?\d{1,6}),(-?\d{1,6})$/;

/** A region token's own side margins against the sheet's
 * (columnFlowDecorations' `@<left>,<right>` twips), px; none: 0. */
function regionInsetOf(raw: string): { token: string; startPx: number; endPx: number } | null {
  const match = REGION_MARGINS_GRAMMAR.exec(raw);
  if (!match) return raw.includes("@") ? null : { token: raw, startPx: 0, endPx: 0 };
  return { token: match[1]!, startPx: Number(match[2]) / 15, endPx: Number(match[3]) / 15 };
}

/** Each region's left and right inset from the sheet's content box, px
 * (a section of the page with side margins of its own). */
export function parseColumnRegionInsets(value: string | null | undefined): Array<{ startPx: number; endPx: number }> {
  return (value ?? "").split("|").map((raw) => {
    const inset = regionInsetOf(raw);
    return { startPx: inset?.startPx ?? 0, endPx: inset?.endPx ?? 0 };
  });
}

const SPLITTABLE_TEXT_SELECTOR = "p, h1, h2, h3, h4, h5, h6";

/**
 * A paragraph's effective "Keep with next" / "Keep lines together" as its
 * DOM states it: the attribute when the paragraph sets it, else the value
 * paragraphKeepFlag gives a paragraph that sets none (a heading keeps both).
 */
function domKeepFlag(block: HTMLElement, key: "keepNext" | "keepLines"): boolean {
  if (!block.matches(SPLITTABLE_TEXT_SELECTOR)) return false;
  const value = block.getAttribute(key === "keepNext" ? "data-keep-next" : "data-keep-lines");
  if (value === "true") return true;
  if (value === "false") return false;
  return /^H[1-6]$/.test(block.tagName);
}

/** A text block's line pitch: its line-height, or -- for a paragraph drawn
 * in Word's auto line boxes, whose own line-height is 0 -- the box height
 * those lines take (`--document-auto-line-height`). 0 when unknown. */
/** A text block's line pitch, as the projector balances it by lines (the
 * page ledger's planner charges a multi-column section's text with the same
 * pitch). */
export function blockLinePitchPx(block: HTMLElement): number {
  const style = getComputedStyle(block);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const auto = Number.parseFloat(style.getPropertyValue("--document-auto-line-height"));
  return Number.isFinite(auto) && auto > 0 ? auto : 0;
}

/** Harness switch (`window.__docsListBalanceBreaksOff = true`): a list of
 * uneven lines in a balanced section moves whole between its columns, and a
 * middle piece of one grows its column to stay over its tail (as before; an
 * A/B of one build). */
function listBalanceBreaksOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsListBalanceBreaksOff?: boolean }).__docsListBalanceBreaksOff === true;
}

const LIST_BREAK_TEXT = "p, h1, h2, h3, h4, h5, h6";

/** The drawn lines of a text block: [top, bottom] px from `originPx`. */
function drawnLineSpans(block: HTMLElement, originPx: number, scale: number): Array<[number, number]> {
  const doc = block.ownerDocument;
  const range = doc?.createRange?.();
  if (!range || typeof range.getClientRects !== "function") return [];
  range.selectNodeContents(block);
  const rects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0.5 && rect.height > 0)
    .map((rect) => [rect.top / scale - originPx, rect.bottom / scale - originPx] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  range.detach?.();
  const lines: Array<[number, number]> = [];
  for (const [top, bottom] of rects) {
    const line = lines[lines.length - 1];
    // A rect starting above the current line's bottom is on that line.
    if (line && top < line[1] - 1) {
      line[0] = Math.min(line[0], top);
      line[1] = Math.max(line[1], bottom);
    } else {
      lines.push([top, bottom]);
    }
  }
  return lines;
}

/**
 * Where a list can be cut between its lines, as the container splitter cuts
 * it (`planContainerHead`): after any block of an item, and inside a
 * paragraph between two lines that leave its widow/orphan floor on each
 * side. Px from the list's top; a head's end counts the list's bottom
 * chrome it then carries. Null when there is nothing to read.
 */
function listLineBreaksPx(list: HTMLElement, scale: number): ColumnLineBreak[] | null {
  const drawn = scale > 0 ? scale : 1;
  const listRect = list.getBoundingClientRect();
  if (!(listRect.height > 0)) return null;
  const origin = listRect.top / drawn;
  const items = (Array.from(list.children) as HTMLElement[]).filter((child) => child.matches("li"));
  if (items.length === 0) return null;
  const blocks = items.flatMap((item) => {
    const host = item.matches('[data-type="taskItem"]')
      ? (Array.from(item.children) as HTMLElement[]).find((child) => child.tagName === "DIV") ?? item
      : item;
    return (Array.from(host.children) as HTMLElement[]).filter((child) => !child.classList.contains("ProseMirror-widget") && child.tagName !== "LABEL");
  });
  const lastBottom = items[items.length - 1].getBoundingClientRect().bottom / drawn - origin;
  const chrome = Math.max(0, listRect.height / drawn - lastBottom);
  const rects = blocks.map((block) => block.getBoundingClientRect());
  const breaks: ColumnLineBreak[] = [];
  blocks.forEach((block, index) => {
    const rect = rects[index];
    if (!(rect.height > 0)) return;
    if (block.matches(LIST_BREAK_TEXT) && !domKeepFlag(block, "keepLines")) {
      const floor = block.getAttribute("data-widow-control") === "false" ? 1 : 2;
      const lines = drawnLineSpans(block, origin, drawn);
      for (let head = floor; head <= lines.length - floor; head += 1) {
        if (head >= lines.length) break;
        breaks.push({ endPx: lines[head - 1][1] + chrome, nextPx: lines[head][0] });
      }
    }
    let next = index + 1;
    while (next < rects.length && !(rects[next].height > 0)) next += 1;
    if (next >= rects.length) return;
    breaks.push({ endPx: rect.bottom / drawn - origin + chrome, nextPx: rects[next].top / drawn - origin });
  });
  breaks.sort((a, b) => a.endPx - b.endPx);
  return breaks.filter((cut) => cut.endPx > 0 && cut.nextPx >= cut.endPx - chrome - 1);
}

/** Harness switch (`window.__docsListBalanceRowsOff = true`): a list of a
 * balanced section moves whole between its columns' heights (as before; an
 * A/B of one build). */
function listBalanceRowsOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsListBalanceRowsOff?: boolean }).__docsListBalanceRowsOff === true;
}

/**
 * The line pitch of a list whose every line is one pitch tall (its box, at
 * each width it was measured at, a whole number of its first paragraph's
 * lines: no space between its items), else 0.
 *
 * Word balances a section's columns line by line whatever the lines are in:
 * a list is a run of paragraphs, cut between any two of its lines. The
 * balance took a list as a box that moves whole (only `p` and headings
 * were text), so a section that is mostly lists was "balanced" at its
 * tallest list's height, while the page planner, which cuts a list where
 * it likes, charged the section half its height (corpus R470-D37 page 1: a
 * form's 40 lines, 23 of them one list of five questions; Word 21 | 19).
 * Only a list of even lines is counted so: its rows are then exactly where
 * the list can be cut.
 */
function listRowPitchPx(block: HTMLElement, heightsPx: readonly number[]): number {
  if (!block.matches("ul, ol") || listBalanceRowsOff()) return 0;
  const first = block.querySelector("p");
  const pitch = first instanceof HTMLElement ? blockLinePitchPx(first) : 0;
  if (!(pitch > 0)) return 0;
  const even = heightsPx.every((height) => {
    if (!(height > 0)) return false;
    const rows = Math.round(height / pitch);
    return rows >= 1 && Math.abs(height - rows * pitch) <= 0.5;
  });
  return even && heightsPx.length > 0 ? pitch : 0;
}

const EMU_PER_PX = 9525;

/** A float the text wraps beside (`float: left|right`, not an overlay): its
 * side and drawn width, from its anchor's extent and effect extent (the
 * box the browser floats; its margins are Word's distL/distR). */
function sideFloatOf(block: HTMLElement): { side: "left" | "right"; widthPx: number } | undefined {
  if (!block.matches('[data-float-mode="float"]')) return undefined;
  const side = block.getAttribute("data-float") || block.style.float;
  if (side !== "left" && side !== "right") return undefined;
  type AnchorExtent = { widthEmu?: unknown; effectLEmu?: unknown; effectREmu?: unknown };
  let anchor: AnchorExtent | null;
  try {
    anchor = JSON.parse(block.getAttribute("data-float-anchor") ?? "null") as AnchorExtent | null;
  } catch {
    return undefined;
  }
  const emu = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const widthEmu = emu(anchor?.widthEmu);
  if (!(widthEmu > 0)) return undefined;
  return { side, widthPx: (widthEmu + Math.max(0, emu(anchor?.effectLEmu)) + Math.max(0, emu(anchor?.effectREmu))) / EMU_PER_PX };
}

/** The inline span a block's lines are drawn over (layout px from its
 * border box's start); null for a drawing or a block with no line ink,
 * undefined for a block taken as filling its box (a table). */
function blockInkSpanPx(block: HTMLElement, scale: number): readonly [number, number] | null | undefined {
  if (block.matches("[data-document-shape], [data-float-band], [data-float-mode]")) return null;
  if (!block.matches(SPLITTABLE_TEXT_SELECTOR)) return undefined;
  const range = block.ownerDocument.createRange();
  range.selectNodeContents(block);
  const box = block.getBoundingClientRect();
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const rect of Array.from(range.getClientRects())) {
    if (!(rect.width > 0.5) || !(rect.height > 0)) continue;
    start = Math.min(start, rect.left - box.left);
    end = Math.max(end, rect.right - box.left);
  }
  range.detach?.();
  if (!(end > start)) return null;
  const drawn = scale > 0 ? scale : 1;
  return [start / drawn, end / drawn];
}

/**
 * Place a page holding several sections (continuous section breaks) as
 * stacked column regions (`planColumnRegionFlow`), with the same editable
 * DOM projection, split candidates and block placements as a column page.
 */
function projectColumnRegionSheet(sheet: HTMLElement, sheetOptions: UnequalColumnSheetOptions): UnequalColumnProjection | null {
  const blocks = Array.from(sheet.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const sheetStyle = getComputedStyle(sheet);
  const paddingTopPx = px(sheetStyle, "padding-top");
  const paddingRightPx = px(sheetStyle, "padding-right");
  const paddingBottomPx = px(sheetStyle, "padding-bottom");
  const paddingLeftPx = px(sheetStyle, "padding-left");
  const minHeightPx = px(sheetStyle, "min-height");
  const capacityPx = Math.max(0, minHeightPx - paddingTopPx - paddingBottomPx);
  const printableWidthPx = sheetContentWidthPx(sheet, sheetStyle, paddingLeftPx, paddingRightPx);
  const regionTracks = parseColumnRegions(sheet.getAttribute(COLUMN_REGIONS_ATTR), printableWidthPx);
  const regionInsets = parseColumnRegionInsets(sheet.getAttribute(COLUMN_REGIONS_ATTR));
  if (!regionTracks || blocks.length === 0 || !(capacityPx > 0)) {
    clearUnequalColumnProjection(sheet);
    return null;
  }
  // The section each block belongs to: a section break closes its section.
  const regionOf: number[] = [];
  let region = 0;
  blocks.forEach((block, index) => {
    regionOf.push(region);
    const isBreak = block.matches('[data-type="section-break"]');
    if (isBreak && index < blocks.length - 1) region += 1;
  });
  if (region !== regionTracks.length - 1) {
    clearUnequalColumnProjection(sheet);
    return null;
  }
  // A section that ends on this page before one starting on the same page
  // (a continuous break) balances; the last one, running on to the next
  // page or followed by a section that starts a new page, fills its
  // columns. Word balances only at a continuous break (Word 16.86, corpus
  // R158-D07 p1: a two-column section closed by a next-page break fills
  // column 1 to the foot, 3 lines below where the balanced height cut it
  // here, and the page planner -- which balances only there too -- put the
  // column's tail into column 2 under its own text).
  const closing = blocks[blocks.length - 1];
  const endsHere = closing.matches('[data-type="section-break"]') &&
    (closing.getAttribute("data-break-type") ?? "nextPage") === "continuous";
  splitRegionsAtSpanningBands(blocks, regionOf, regionTracks, printableWidthPx, regionInsets);
  const regions: ColumnRegionSpec[] = regionTracks.map((tracks, index) => ({
    tracks,
    balance: index < regionTracks.length - 1 || endsHere,
    ...(sheetOptions.keepNextCutsLastLines ? { keepNextCutsLastLines: true } : {}),
    ...(sheetOptions.wordLegacyBalance ? { wordLegacyBalance: true } : {}),
  }));

  sheet.setAttribute(UNEQUAL_COLUMN_FLOW_ATTR, "true");
  beginProjection(sheet, blocks.length);
  const blockMargins = blocks.map((block) => {
    const style = getComputedStyle(block);
    return {
      top: px(style, "margin-top"),
      right: px(style, "margin-right"),
      bottom: seamBottomMarginPx(block, px(style, "margin-bottom")),
      left: px(style, "margin-left"),
    };
  });
  const heightsByBlock = blocks.map(() => [] as number[]);
  const scale = sheetDrawScale(sheet);
  const sideFloats = blocks.map((block, blockIndex) =>
    regionTracks[regionOf[blockIndex]].length === 1 && sheetStyle.direction !== "rtl" ? sideFloatOf(block) : undefined);
  // The lines of a single-column region holding a side float, read at its
  // width: the float moves the flow only when one reaches into it.
  const inkRegions = new Set(blocks.flatMap((_block, blockIndex) => (sideFloats[blockIndex] ? [regionOf[blockIndex]] : [])));
  const inkSpans = new Map<number, readonly [number, number] | null>();
  // Lists of a balanced section of equal columns: where they can be cut.
  const listBreaks = new Map<number, ColumnLineBreak[] | null>();
  const breaksOff = listBalanceBreaksOff();
  const widths = new Set<number>();
  regionTracks.forEach((tracks) => tracks.forEach((track) => widths.add(track.widthPx)));
  widths.forEach((widthPx) => {
    // One layout per distinct track width: every block of a region with a
    // track that wide is measured at it.
    const measured = new Map<number, number>();
    blocks.forEach((_block, blockIndex) => {
      if (!regionTracks[regionOf[blockIndex]].some((track) => track.widthPx === widthPx)) return;
      const margins = blockMargins[blockIndex];
      measured.set(blockIndex + 1, Math.max(1, widthPx - margins.left - margins.right));
    });
    if (measured.size === 0) return;
    writeMeasurementWidths(sheet, measured);
    blocks.forEach((block, blockIndex) => {
      const tracks = regionTracks[regionOf[blockIndex]];
      tracks.forEach((track, trackIndex) => {
        if (track.widthPx === widthPx) heightsByBlock[blockIndex][trackIndex] = laidOutHeightPx(block, scale);
      });
      if (!breaksOff && tracks.length > 1 && regions[regionOf[blockIndex]]?.balance &&
          tracks.every((track) => track.widthPx === widthPx) && block.matches("ul, ol")) {
        listBreaks.set(blockIndex, listLineBreaksPx(block, scale));
      }
      if (inkRegions.has(regionOf[blockIndex]) && tracks[0]?.widthPx === widthPx) {
        const span = blockInkSpanPx(block, scale);
        if (span !== undefined) inkSpans.set(blockIndex, span);
      }
    });
  });
  const metrics = blocks.map<ColumnRegionBlockMetric>((block, blockIndex) => {
    const margins = blockMargins[blockIndex];
    // A list of even lines is balanced by its lines, cut between any two.
    const listPitchPx = regionTracks[regionOf[blockIndex]].length > 1 ? listRowPitchPx(block, heightsByBlock[blockIndex]) : 0;
    // (An empty list of breaks still counts: a piece of a list cut before
    // joins its neighbours' breaks with the seam between them.)
    const breaks = listPitchPx > 0 ? null : listBreaks.get(blockIndex) ?? null;
    return {
      heightsPx: heightsByBlock[blockIndex],
      marginTopPx: margins.top,
      marginRightPx: margins.right,
      marginBottomPx: margins.bottom,
      marginLeftPx: margins.left,
      forceNextColumnAfter: block.matches('[data-type="column-break"]'),
      outOfFlow: block.matches(OUT_OF_FLOW_SELECTOR) || columnPagePlacedTable(block),
      flowless: block.matches(FLOWLESS_SELECTOR) || columnPagePlacedTable(block),
      region: regionOf[blockIndex],
      ...(block.matches('[data-type="section-break"]') && heightsByBlock[blockIndex].every((height) => !(height > 0.5))
        ? { sectionBreak: true }
        : {}),
      splittable: block.matches(SPLITTABLE_TEXT_SELECTOR) || listPitchPx > 0 || breaks !== null,
      lineHeightPx: listPitchPx > 0 ? listPitchPx : blockLinePitchPx(block),
      footCreditPx: trailingAutoLeadingCreditPx(block),
      ...(block.getAttribute("data-page-split-continues") === "true" ? { continuesNext: true } : {}),
      ...(block.hasAttribute("data-page-split-continuation") ? { continuesPrevious: true } : {}),
      // minimumTextSplitLines: widow control unless the paragraph turns it off.
      minSplitLines: listPitchPx > 0 || breaks !== null || block.getAttribute("data-widow-control") === "false" ? 1 : 2,
      ...(breaks ? { breaksPx: breaks } : {}),
      ...(listPitchPx > 0 ? { listRows: true } : {}),
      ...(domKeepFlag(block, "keepLines") ? { keepLines: true } : {}),
      ...(domKeepFlag(block, "keepNext") ? { keepNext: true } : {}),
      ...(sideFloats[blockIndex] ? { sideFloat: sideFloats[blockIndex] } : {}),
      ...(block.getAttribute(FLOAT_HOST_BEFORE_ATTR) === "true" ? { hostIsPrevious: true } : {}),
      ...(inkSpans.has(blockIndex) ? { inkSpanPx: inkSpans.get(blockIndex)! } : {}),
    };
  });
  // Page-placed top-and-bottom boxes drawn out of the flow
  // (`floatingTextBoxLayout`): the columns they stand at the foot of end
  // above them.
  const bands = blocks
    .map((block) => parseColumnBandExclusion(block.getAttribute(COLUMN_BAND_EXCLUSION_ATTR)))
    .filter((band): band is ColumnBandExclusion => band !== null);
  const plan = planColumnRegionFlow(regions, capacityPx, metrics, bands);
  // Split candidates name the page's node children (widgets excluded).
  const nodeIndexOf = blocks.map((_block, index) =>
    blocks.slice(0, index).filter((other) => !other.classList.contains("ProseMirror-widget")).length,
  );
  const rtl = sheetStyle.direction === "rtl";
  const sheetReference = new WeakRef(sheet);
  const slotPlacements = plan.placements.map<SlotPlacement>((placement, blockIndex) => {
    const block = blocks[blockIndex];
    const metric = metrics[blockIndex];
    const trackWidthPx = placement.widthPx + metric.marginLeftPx + metric.marginRightPx;
    // A region with side margins of its own starts that far in from the
    // sheet's: its blocks' inline starts are the sheet's from here on (the
    // table frame and the floats read them).
    const inset = regionInsets[regionOf[blockIndex]!];
    if (inset && (inset.startPx || inset.endPx)) placement.inlineStartPx += rtl ? inset.endPx : inset.startPx;
    const physicalInlineStart = rtl
      ? printableWidthPx - placement.inlineStartPx - trackWidthPx
      : placement.inlineStartPx;
    placementByBlock.set(block, placement);
    ruleAddressByBlock.set(block, { sheet: sheetReference, childIndex: blockIndex });
    return {
      topPx: paddingTopPx + placement.topPx - metric.marginTopPx,
      leftPx: paddingLeftPx + physicalInlineStart,
      widthPx: placement.widthPx,
      clip: null,
    };
  });
  writeProjection(
    sheet,
    [[COLUMN_RULE_IMAGE_VAR, "none"], [COLUMN_RULE_TOP_VAR, "0px"], [COLUMN_RULE_HEIGHT_VAR, "auto"]],
    slotPlacements,
  );
  const projection: UnequalColumnProjection = {
    placements: plan.placements,
    splitCandidates: plan.splitCandidates.map((candidate) => ({
      ...candidate,
      blockIndex: nodeIndexOf[candidate.blockIndex] ?? candidate.blockIndex,
    })),
    physicalOverflowPx: plan.physicalOverflowPx,
    inlineOverflowPx: 0,
    tracks: [{ widthPx: printableWidthPx, gapAfterPx: 0 }],
    capacityPx,
    ...(plan.bandTopsPx ? { bandTopsPx: plan.bandTopsPx } : {}),
  };
  projectionBySheet.set(sheet, projection);
  return projection;
}

/** Apply one exact, editable DOM projection and retain its measured geometry. */
export function projectUnequalColumnSheet(
  sheet: HTMLElement,
  /** The page-wide footnote zone drawn at the sheet's foot (px): every
   * column ends above it, as body text and table rows never run under the
   * note area (WUA 015). */
  footZonePx = 0,
  sheetOptions: UnequalColumnSheetOptions = {},
): UnequalColumnProjection | null {
  if (sheet.hasAttribute(COLUMN_REGIONS_ATTR)) return projectColumnRegionSheet(sheet, sheetOptions);
  const token = sheet.getAttribute(SECTION_UNEQUAL_COLUMN_TRACKS_ATTR);
  if (!parseUnequalColumnTracks(token)) {
    clearUnequalColumnProjection(sheet);
    return null;
  }
  const blocks = Array.from(sheet.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const sheetStyle = getComputedStyle(sheet);
  const paddingTopPx = px(sheetStyle, "padding-top");
  const paddingRightPx = px(sheetStyle, "padding-right");
  const paddingBottomPx = px(sheetStyle, "padding-bottom");
  const paddingLeftPx = px(sheetStyle, "padding-left");
  const minHeightPx = px(sheetStyle, "min-height");
  const capacityPx = Math.max(
    0,
    minHeightPx - paddingTopPx - paddingBottomPx - (Number.isFinite(footZonePx) ? Math.max(0, footZonePx) : 0),
  );
  const printableWidthPx = sheetContentWidthPx(sheet, sheetStyle, paddingLeftPx, paddingRightPx);
  const tracks = parseUnequalColumnTracks(token, printableWidthPx);
  if (!tracks || blocks.length === 0 || !(capacityPx > 0)) {
    clearUnequalColumnProjection(sheet);
    return null;
  }

  // Activate the fixed rules once. Width writes are then batched per track:
  // one layout flush per distinct source width, not one per block.
  sheet.setAttribute(UNEQUAL_COLUMN_FLOW_ATTR, "true");
  beginProjection(sheet, blocks.length);
  const blockMargins = blocks.map((block) => {
    const style = getComputedStyle(block);
    return {
      top: px(style, "margin-top"),
      right: px(style, "margin-right"),
      bottom: seamBottomMarginPx(block, px(style, "margin-bottom")),
      left: px(style, "margin-left"),
    };
  });
  const heightsByBlock = blocks.map(() => [] as number[]);
  const scale = sheetDrawScale(sheet);
  const inlineExtentsByBlock = blocks.map(() => [] as number[]);
  // Equal tracks share one width: one layout flush measures every track.
  const distinctTracks = tracks.filter(
    (track, index) => tracks.findIndex((other) => other.widthPx === track.widthPx) === index,
  );
  // `window.__dqc2PastLineAsPlaced = true`: judge a picture past its line at
  // the width its paragraph last stood at, as before (A/B).
  const picturesByTrack = (sheet.ownerDocument.defaultView as (Window & { __dqc2PastLineAsPlaced?: boolean }) | null)
    ?.__dqc2PastLineAsPlaced !== true;
  distinctTracks.forEach((track) => {
    const measured = new Map<number, number>();
    blocks.forEach((_block, blockIndex) => {
      const margins = blockMargins[blockIndex];
      measured.set(blockIndex + 1, Math.max(1, track.widthPx - margins.left - margins.right));
    });
    writeMeasurementWidths(sheet, measured);
    blocks.forEach((block, blockIndex) => {
      // A picture wider than this track's line takes no extra line under it
      // here, whatever track the paragraph stood in before.
      if (picturesByTrack) rejudgeInlinePicturesPastLine(block);
      const height = laidOutHeightPx(block, scale);
      const extent = Math.max(0, block.scrollWidth);
      tracks.forEach((candidate, trackIndex) => {
        if (candidate.widthPx !== track.widthPx) return;
        heightsByBlock[blockIndex][trackIndex] = height;
        inlineExtentsByBlock[blockIndex][trackIndex] = extent;
      });
    });
  });
  const metrics = blocks.map<UnequalColumnBlockMetric>((block, blockIndex) => {
    const margins = blockMargins[blockIndex];
    return {
      heightsPx: heightsByBlock[blockIndex],
      marginTopPx: margins.top,
      marginRightPx: margins.right,
      marginBottomPx: margins.bottom,
      marginLeftPx: margins.left,
      forceNextColumnAfter: block.matches('[data-type="column-break"]'),
      inlineExtentsPx: inlineExtentsByBlock[blockIndex],
      outOfFlow: block.matches(OUT_OF_FLOW_SELECTOR) || columnPagePlacedTable(block),
      flowless: block.matches(FLOWLESS_SELECTOR) || columnPagePlacedTable(block),
      paintsAcrossColumns: block.matches(".tableWrapper, table"),
      footCreditPx: trailingAutoLeadingCreditPx(block),
      // Keep with next at a column's foot: a heading whose follower's first
      // lines do not fit below it opens the next column with them, as Word
      // lays it (docx-look/probes kn_probe.py kn30: "Introduction" after a
      // column of one-line paragraphs, at the top of column 2 in Word; it was
      // drawn alone at column 1's foot; corpus R432-D07). The page planner
      // already charged the column so (ledgerCut's keep chains).
      ...(!columnKeepNextOff() && domKeepFlag(block, "keepNext") ? { keepNext: true } : {}),
      // A cut paragraph's head: its rest follows, so it keeps nothing with
      // its follower (`splitHeadKeepsNext`).
      ...(block.getAttribute("data-page-split-continues") === "true" && !splitHeadKeepsNext() ? { continuesNext: true } : {}),
      ...(!columnKeepNextOff() && blockIndex > 0 && domKeepFlag(blocks[blockIndex - 1], "keepNext")
        ? followerFacts(block)
        : {}),
      // A kept paragraph's own lines, for its last lines to go on with its
      // follower (compatibility mode 15, `keptLastLinesCut`).
      ...(sheetOptions.keepNextCutsLastLines && !columnKeepNextOff() && domKeepFlag(block, "keepNext")
        ? { ...followerFacts(block), ...(block.getAttribute("data-page-split-continues") === "true" ? { continuesNext: true } : {}) }
        : {}),
    };
  });
  // The page's columns run from its top edge to its bottom margin: the first
  // block keeps its painted space before, the foot takes Word's credit.
  // Page-placed blocks drawn out of the flow (a floating table placed down
  // the page, `tablePageFrame`): a column they stand at the foot of ends
  // above them, as on a page of column regions.
  const bands = blocks
    .map((block) => parseColumnBandExclusion(block.getAttribute(COLUMN_BAND_EXCLUSION_ATTR)))
    .filter((band): band is ColumnBandExclusion => band !== null);
  const columnCapacitiesPx = bands.length > 0 ? bandedColumnFeet(tracks, 0, capacityPx, bands) : undefined;
  const plan = planUnequalColumnFlow(tracks, capacityPx, metrics, {
    footCredit: true,
    pageTop: true,
    ...(sheetOptions.keepNextCutsLastLines ? { keepNextCutsLastLines: true } : {}),
    ...(columnCapacitiesPx?.some((foot) => foot !== undefined) ? { columnCapacitiesPx } : {}),
  });
  const rtl = sheetStyle.direction === "rtl";
  let sheetDeclarations: Array<readonly [string, string]> = [
    [COLUMN_RULE_IMAGE_VAR, "none"],
    [COLUMN_RULE_TOP_VAR, "0px"],
    [COLUMN_RULE_HEIGHT_VAR, "auto"],
  ];
  if (sheet.getAttribute(SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR) === "true") {
    let inlineCursorPx = 0;
    const rulePositions = tracks
      .slice(0, -1)
      .map((track) => {
        inlineCursorPx += track.widthPx;
        const logicalPosition = inlineCursorPx + track.gapAfterPx / 2;
        inlineCursorPx += track.gapAfterPx;
        return (
          paddingLeftPx +
          (rtl ? printableWidthPx - logicalPosition : logicalPosition)
        );
      })
      .sort((left, right) => left - right);
    // The same black hairline as COLUMN_RULE (Word's automatic colour).
    const color = "#000000";
    const stops = ["transparent 0"];
    for (const position of rulePositions) {
      const start = Math.max(0, position - 0.5);
      const end = position + 0.5;
      stops.push(
        `transparent ${start}px`,
        `${color} ${start}px`,
        `${color} ${end}px`,
        `transparent ${end}px`,
      );
    }
    stops.push("transparent 100%");
    sheetDeclarations = [
      [COLUMN_RULE_IMAGE_VAR, `linear-gradient(to right, ${stops.join(", ")})`],
      [COLUMN_RULE_TOP_VAR, `${paddingTopPx}px`],
      [COLUMN_RULE_HEIGHT_VAR, `${capacityPx}px`],
    ];
  }
  // The page's notes stand in its columns (Word's "Match section layout").
  const noteColumns = sheetNoteColumns(sheet);
  sheetDeclarations = [
    ...sheetDeclarations,
    [NOTE_COLUMNS_VAR, noteColumns ? String(noteColumns.count) : "auto"],
    [NOTE_COLUMN_GAP_VAR, noteColumns ? `${noteColumns.gapPx}px` : "0px"],
  ];
  const sheetReference = new WeakRef(sheet);
  const slotPlacements = plan.placements.map<SlotPlacement>((placement, blockIndex) => {
    const block = blocks[blockIndex];
    const metric = metrics[blockIndex];
    const trackWidthPx =
      placement.widthPx + metric.marginLeftPx + metric.marginRightPx;
    const physicalInlineStart = rtl
      ? printableWidthPx - placement.inlineStartPx - trackWidthPx
      : placement.inlineStartPx;
    // Absolute-position offsets place the margin box; compensate the existing
    // margins so the border box lands on the planned Word track coordinates.
    placementByBlock.set(block, placement);
    ruleAddressByBlock.set(block, { sheet: sheetReference, childIndex: blockIndex });
    // Word's covering rule for an object wider than its column: the next
    // column's content hides the overrun from the middle of the gutter on
    // (Word 16.86, a 6.5" picture in the first of two or three columns, a
    // 0.5" or 1" gutter, equal or unequal: visible to the gutter's middle,
    // never further); with nothing in the next column it stays whole and
    // visible, but no further than the paper's edge.
    let clip: string | null = null;
    const extents = metric.outOfFlow ? undefined : metric.inlineExtentsPx;
    const extent = extents?.[Math.min(placement.columnIndex, extents.length - 1)] ?? 0;
    const borderLeftPx = paddingLeftPx + physicalInlineStart + metric.marginLeftPx;
    if (placement.clipInline) {
      const halfGutterPx = Math.max(0, tracks[placement.columnIndex]?.gapAfterPx ?? 0) / 2;
      const runOnPx =
        Math.round(((rtl ? metric.marginLeftPx : metric.marginRightPx) + halfGutterPx) * 100) / 100;
      clip = !(runOnPx > 0)
        ? "inset(0)"
        : rtl
          ? `inset(0 0 0 ${-runOnPx}px)`
          : `inset(0 ${-runOnPx}px 0 0)`;
    } else if (extent > placement.widthPx + 1 && borderLeftPx + extent > sheet.clientWidth + 0.5) {
      const allowancePx = Math.max(0, sheet.clientWidth - (borderLeftPx + placement.widthPx));
      clip = `inset(0 ${-Math.round(allowancePx * 100) / 100}px 0 0)`;
    }
    return {
      topPx: paddingTopPx + placement.topPx - metric.marginTopPx,
      leftPx: paddingLeftPx + physicalInlineStart,
      widthPx: placement.widthPx,
      clip,
    };
  });
  writeProjection(sheet, sheetDeclarations, slotPlacements);
  // ...and is drawn as it was measured in the track it stands in.
  if (picturesByTrack) for (const block of blocks) rejudgeInlinePicturesPastLine(block);
  // The columns a section declares wider than its text area (R456-D20: 5509
  // and 5040 twips in 10520, 2.07 px over) stand a little into the margin, as
  // Word draws them. That is the section's geometry, not flow spilling: read
  // as the page's overflow, no block moved on could cure it, and the physical
  // repair moved the page's last block on after every pass that verified it
  // (13 times a page in one opening), so the pages came out as many blocks
  // short as passes had run: another layout on every opening.
  // `window.__dqc2TrackOverhangSpills = true` reads it as overflow, as before.
  const overhangSpills = (sheet.ownerDocument.defaultView as (Window & { __dqc2TrackOverhangSpills?: boolean }) | null)
    ?.__dqc2TrackOverhangSpills === true;
  const trackOverhangPx = Math.max(
    0,
    tracks.reduce((total, track) => total + track.widthPx + track.gapAfterPx, 0) -
      (tracks[tracks.length - 1]?.gapAfterPx ?? 0) -
      printableWidthPx,
  );
  const projection: UnequalColumnProjection = {
    ...plan,
    tracks,
    capacityPx,
    inlineOverflowPx: overhangSpills ? Math.max(plan.inlineOverflowPx, trackOverhangPx) : plan.inlineOverflowPx,
  };
  projectionBySheet.set(sheet, projection);
  return projection;
}

export function unequalColumnProjectionForSheet(
  sheet: HTMLElement,
): UnequalColumnProjection | null {
  return projectionBySheet.get(sheet) ?? null;
}

export function unequalColumnPlacementForBlock(
  block: HTMLElement,
): UnequalColumnPlacement | null {
  return placementByBlock.get(block) ?? null;
}

export function unequalColumnCount(sheet: HTMLElement): number | null {
  return (
    parseUnequalColumnTracks(
      sheet.getAttribute(SECTION_UNEQUAL_COLUMN_TRACKS_ATTR),
    )?.length ?? null
  );
}
