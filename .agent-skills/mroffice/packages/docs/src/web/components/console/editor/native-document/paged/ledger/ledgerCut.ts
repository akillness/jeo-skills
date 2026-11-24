/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The cut — one deterministic pass over the ledger.
 *
 * Every step may only move content LATER, so the pass terminates, and the
 * same atoms always produce the same pages: there is no hysteresis, no
 * tolerance, no stale-merge rule and no cycle guard, because nothing here is
 * re-measured after a decision. Word precedence (WORD-VERTICAL-SPEC §11.3):
 *
 *   1. forced breaks (pageBreak / next-page section break) close the page and
 *      outrank every keep flag; so does a boundary the physical verifier
 *      refused (`breakBefore`, a natural break that Word would not revisit);
 *   2. a keepNext chain is planned as one unit; a chain taller than a page
 *      starts together on a fresh page and breaks from there as its pages
 *      fill (a chain a fresh page could not even start stays where it is);
 *   3. whole-atom fit, with the page-bottom Auto-leading credit applied to the
 *      fit comparison only — `usedPx` always holds the full height so no
 *      later atom can inherit the overrun;
 *   4. otherwise the split oracle plans the largest legal head (widow/orphan
 *      floors, cantSplit, keepLines live in the oracle); an atom that cannot
 *      be cut moves whole, and an atom taller than a page that still cannot be
 *      cut is placed alone and reported in `overflowingAtoms`.
 *
 * A newspaper-column page is a row of fragmentainers: every rule above is
 * applied at each column's foot exactly as at a page's, so a block that does
 * not fit the rest of a column moves whole into the next one and the space it
 * leaves behind is charged (Word). A column cut inside a page is the
 * projector's in-sheet seam, not a page seam: the page keeps one placement
 * for the atom, and only a cut at the page's last column becomes a page cut.
 * A column's foot is the page's bottom margin, and Word gives it the same
 * page-bottom Auto-leading credit (colcredit-b.docx, 3 columns: a first
 * column 2.2px over the foot keeps its 43rd line; 4.2px over, colcredit-c,
 * moves it). A column break closes its column, and, in the page's last (or
 * only) column, the page.
 */
import type {
  LedgerAtom,
  LedgerCut,
  LedgerCutOptions,
  LedgerPage,
  LedgerPlacement,
  LedgerPlan,
  LedgerPlanStop,
} from "./ledgerTypes";

import { balancedColumnHeightPx, type ColumnLineBreak } from "@mrnote/core/web/components/console/editor/native-document/paged/unequalColumnProjection.ts";

const EPSILON_PX = 1e-6;

/** The lowest common column height that holds a segment's pieces in its
 * columns, text broken between its lines under Word's widow/orphan floors
 * (the projector's own balance). */
function balancedSegmentHeightPx(
  columns: number,
  pieces: readonly SegmentPiece[],
  atoms: readonly LedgerAtom[],
  wordLegacy: boolean,
): number {
  if (!pieces.length) return 0;
  return balancedColumnHeightPx(columns, pieces.map((piece) => ({
    // A whole atom is balanced with the height each column gives it (the
    // projector's measure, track by track); a piece cut at the page is
    // known at the width it was drawn in only.
    heightsPx: wholeAtomHeightsPx(atoms[piece.atom], piece, columns) ?? [piece.heightPx],
    marginTopPx: piece.marginTopPx,
    marginRightPx: 0,
    marginBottomPx: piece.marginBottomPx,
    marginLeftPx: 0,
    forceNextColumnAfter: piece.forceNextColumnAfter === true,
    outOfFlow: false,
    region: 0,
    splittable: piece.splittable,
    ...(piece.linePitchPx > 0 ? { lineHeightPx: piece.linePitchPx } : {}),
    ...(piece.continuesPrevious ? { continuesPrevious: true } : {}),
    // A list of uneven lines is balanced at the breaks the projector
    // balances it at (its drawn lines), whole in the segment as there.
    ...(wholeAtomBreaksPx(atoms[piece.atom], piece, columns) ? { breaksPx: wholeAtomBreaksPx(atoms[piece.atom], piece, columns)!, splittable: true } : {}),
    minSplitLines: piece.minSplitLines,
    // Keep with next holds at a column seam as the projector applies it
    // (an anchored object's keepNext is no paragraph's: it costs no flow).
    ...(piece.complete && atoms[piece.atom]?.keepNext && !atoms[piece.atom]?.anchored ? { keepNext: true } : {}),
  })), wordLegacy ? { wordLegacy: true } : {});
}

function wholeAtomBreaksPx(
  atom: LedgerAtom | undefined,
  piece: SegmentPiece,
  columns: number,
): readonly ColumnLineBreak[] | null {
  const breaks = atom?.regionBreaksPx;
  return breaks && wholeAtomHeightsPx(atom, piece, columns) ? breaks : null;
}

function wholeAtomHeightsPx(
  atom: LedgerAtom | undefined,
  piece: SegmentPiece,
  columns: number,
): readonly number[] | null {
  const heights = atom?.regionHeightsPx;
  if (!heights || heights.length !== columns || atom.index !== piece.atom) return null;
  return piece.startsWhole && piece.complete ? heights : null;
}

interface OpenPage {
  placements: LedgerPage["placements"];
  /** Flow used in the current section segment (linear across its columns). */
  usedPx: number;
  /** Flow capacity of the current segment: its columns times `columnPx`. */
  capacityPx: number;
  /** Newspaper columns of the current segment; `columnPx` is one column's
   * height (the page's height below the segment's top). */
  columns: number;
  columnPx: number;
  preserveLeadingSpace: boolean;
  /** The space after of the last paragraph on the page before, which a
   * space before kept at this page's forced start overlapped. */
  leadingAfterPx: number;
  previous: LedgerAtom | null;
  /** One column's full height on this page (the page's text height). */
  pagePx: number;
  /** Where the current segment starts below the page's top: a continuous
   * section break starts the next section, in its own columns, below the one
   * that ends (Word; a multi-column section ending on the page is balanced). */
  segmentTopPx: number;
  /** What the current segment holds on this page, for balancing it. */
  segment: SegmentPiece[];
  /** A block placed on the page charged a footnote: the note area stands
   * below the body, and a last line's Auto leading may not cross into it. */
  notesBelow?: boolean;
  /** Per column, the top (content coordinates) of a top-and-bottom box drawn
   * at the column's foot: the column ends there (`columnBandTopsFor`). */
  bandTopsPx?: readonly (number | undefined)[] | null;
  /** The page's body ends at a header or footer object's top
   * (`footCreditBlockedFor`): no Auto leading credit past it. */
  footBand?: boolean;
}

interface SegmentPiece {
  /** The atom placed: its pieces on one page (a column cut) are one. */
  atom: number;
  /** The atom entered the segment whole and ends in it: the piece is all of
   * it, and is balanced with the height each column gives it. */
  startsWhole: boolean;
  complete: boolean;
  heightPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  splittable: boolean;
  linePitchPx: number;
  /** It goes on from the previous page (no first line here). */
  continuesPrevious: boolean;
  minSplitLines: number;
  /** A column break follows it in the segment. */
  forceNextColumnAfter?: boolean;
}

/** Flow offset where the column holding `pos` starts. */
function columnStartOf(page: OpenPage, pos: number): number {
  if (page.columns <= 1) return 0;
  const column = Math.min(page.columns - 1, Math.floor((pos + EPSILON_PX) / page.columnPx));
  return column * page.columnPx;
}

/** Flow offset where the column holding `pos` ends (the page's, in its last column). */
function columnEndOf(page: OpenPage, pos: number): number {
  if (page.columns <= 1) return page.capacityPx;
  const start = columnStartOf(page, pos);
  return Math.min(page.capacityPx, start + Math.min(page.columnPx, columnFootOf(page, Math.round(start / page.columnPx))));
}

/** A column's own height: the page's, or down to a band drawn at its foot
 * in the segment it stands in. */
function columnFootOf(page: OpenPage, column: number): number {
  const band = page.bandTopsPx?.[column];
  if (band === undefined || !Number.isFinite(band)) return page.columnPx;
  const own = band - page.segmentTopPx;
  return own > EPSILON_PX ? own : page.columnPx;
}

/** The index of the column holding `pos`. */
function columnIndexOf(page: OpenPage, pos: number): number {
  if (page.columns <= 1) return 0;
  return Math.min(page.columns - 1, Math.floor((Math.max(0, pos) + EPSILON_PX) / page.columnPx));
}

/** `window.__docsKeepChainSplitOff = true` (A/B): a keep-with-next chain that
 * does not fit is moved as one unit unless a head of its LAST member fits,
 * the older reading, instead of breaking inside the first member that does
 * not fit whole. */
function keepChainSplitOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKeepChainSplitOff?: boolean }).__docsKeepChainSplitOff === true;
}

/** `window.__docsKeptTableRowsCutOff = true` (A/B): a table of kept rows in a
 * keep-with-next chain may be cut where it stands, the older reading. */
function keptTableRowsCutOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKeptTableRowsCutOff?: boolean }).__docsKeptTableRowsCutOff === true;
}

/** `window.__docsKeepChainBackUpOff = true` (A/B): in a compatibility mode
 * 15 document a keep-with-next chain whose unfitting member cannot be cut
 * moves whole, as in earlier modes, instead of cutting an earlier member so
 * that its last lines go on with it. */
function keepChainBackUpOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKeepChainBackUpOff?: boolean }).__docsKeepChainBackUpOff === true;
}

/** A head planned in less than a member's whole height is a cut that leaves
 * its last lines (its widow floor under widow control) for the next page. */
const BACK_UP_SLACK_PX = 0.5;

/** `window.__docsKeepBackUpCreditOff = true` (A/B): the member backed into
 * is planned in its whole height less the slack only, as before -- room the
 * oracle reads as the whole member (its last line's Auto leading credited,
 * or its last row's glyphs inside the room), so no cut came of it. */
function keepBackUpCreditOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKeepBackUpCreditOff?: boolean }).__docsKeepBackUpCreditOff === true;
}

/** `window.__docsKeepMemberCreditOff = true` (A/B): a keep chain member is
 * read as standing whole at the foot only with no credit, as before. */
function keepMemberCreditOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKeepMemberCreditOff?: boolean }).__docsKeepMemberCreditOff === true;
}

export function planLedgerPages(
  atoms: readonly LedgerAtom[],
  options: LedgerCutOptions,
): LedgerPlan {
  const pages: LedgerPage[] = [];
  const overflowingAtoms: number[] = [];
  // A pass may start inside the document (its earlier pages keep their
  // composition): page indexes are absolute, atoms start at `start.atom`.
  const startPage = options.start?.page ?? 0;
  const pageIndex = () => startPage + pages.length;
  let openedByForcedBreak = options.start?.openedByForcedBreak ?? false;
  let index = options.start?.atom ?? 0;
  let stop: LedgerPlanStop | null = null;
  const openPage = (): OpenPage => {
    // A page that opens with another section than the sheet drawn at its
    // index now has that section's page (R91-D08: a landscape section's
    // table row cut onto a new page was planned on the portrait sheet that
    // followed it, 918 px for a 590 px page; the plan and its overflow flipped
    // back and forth and the row was never cut).
    const openingSection = atoms[index]?.sectionIndex;
    const sectionCapacityPx = openingSection === undefined
      ? null : options.sectionCapacityFor?.(pageIndex(), openingSection) ?? null;
    const sheetCapacityPx = Math.max(0, sectionCapacityPx !== null && sectionCapacityPx > 0
      ? sectionCapacityPx : options.capacityFor(pageIndex()));
    const rawSheetColumns = options.columnsFor?.(pageIndex()) ?? 1;
    const sheetColumns = Number.isInteger(rawSheetColumns) && rawSheetColumns > 1 ? rawSheetColumns : 1;
    const pagePx = sheetCapacityPx / sheetColumns;
    // The page's columns are those of the section it opens with: a page the
    // planner gives to another section than the sheet now drawn there (a
    // continuous section break moved across it) is laid out in that
    // section's columns, not the sheet's.
    const opening = atoms[index]?.sectionColumns;
    const rawColumns = Number.isInteger(opening) && opening! >= 1 ? opening! : sheetColumns;
    const columns = rawColumns > 1 ? rawColumns : 1;
    const capacityPx = pagePx * columns;
    return {
      placements: [],
      usedPx: 0,
      capacityPx,
      columns,
      columnPx: pagePx,
      pagePx,
      segmentTopPx: 0,
      segment: [],
      preserveLeadingSpace: options.preserveLeadingSpace(
        pageIndex(),
        openedByForcedBreak,
        atoms[index]?.breakTail === true,
      ),
      leadingAfterPx: closingAfterPx,
      previous: null,
      bandTopsPx: options.columnBandTopsFor?.(pageIndex()) ?? null,
      // (Its own sheet's: a page given another section's capacity is not cut
      // at this sheet's band.)
      footBand: sectionCapacityPx === null && options.footCreditBlockedFor?.(pageIndex()) === true,
    };
  };
  let closingAfterPx = Math.max(0, options.start?.leadingAfterPx ?? 0);
  // Continued footnotes: rows a page's note area could not hold run on at
  // the head of the next page's note area, taken off its capacity (Word's
  // continuation), in whole rows of their own pitch, and so on page after
  // page until they are out.
  let carryPx = 0;
  let carryPitchPx = 0;
  let carryInPx = 0;
  const continuationChromePx = Math.max(0, options.noteContinuationChromePx ?? 0);
  const minBodyPx = Math.max(0, options.noteContinuationMinBodyPx ?? 0);
  const takeCarryIn = (capacityPx: number): number => {
    if (!(carryPx > EPSILON_PX) || !(carryPitchPx > 0)) return 0;
    const room = capacityPx - minBodyPx - continuationChromePx;
    const rows = Math.min(
      Math.ceil(carryPx / carryPitchPx - EPSILON_PX),
      Math.max(0, Math.floor((room + 1 / 64) / carryPitchPx)),
    );
    if (rows <= 0) return 0;
    const taken = Math.min(carryPx, rows * carryPitchPx);
    carryPx = Math.max(0, carryPx - taken);
    return taken + continuationChromePx;
  };
  let page = openPage();
  const close = (viaForcedBreak: boolean) => {
    pages.push({
      placements: page.placements,
      // A page of one section reports its flow as before; one holding several
      // sections reports the height its segments take.
      usedPx: page.segmentTopPx > 0
        ? page.segmentTopPx + (page.columns > 1 ? Math.min(page.usedPx, page.columnPx) : page.usedPx)
        : page.usedPx,
      capacityPx: page.segmentTopPx > 0 ? page.pagePx : page.capacityPx,
      preserveLeadingSpace: page.preserveLeadingSpace,
      ...(carryInPx > 0 ? { noteCarryInPx: carryInPx } : {}),
      ...(carryPx > EPSILON_PX ? { noteCarryOutPx: carryPx } : {}),
    });
    openedByForcedBreak = viaForcedBreak;
    // The last paragraph in the flow of the page closing (an anchored object
    // or a break marker is none).
    closingAfterPx = 0;
    for (let at = page.placements.length - 1; at >= 0; at -= 1) {
      const placed = atoms[page.placements[at].atom];
      if (placed && !placed.hidden && !placed.anchored) {
        closingAfterPx = Math.max(0, placed.spaceAfterPx || 0);
        break;
      }
    }
    page = openPage();
    carryInPx = takeCarryIn(page.capacityPx);
    if (carryInPx > 0) {
      page.capacityPx = Math.max(0, page.capacityPx - carryInPx);
      page.columnPx = page.capacityPx / page.columns;
      page.pagePx = page.columnPx;
    }
    // The page just opened starts with `atoms[index]` from `from`. With no
    // footnote rows carried into it, everything after depends on that
    // opening alone, so the caller may end the pass here.
    if (options.stopAt && index < atoms.length && !(carryPx > EPSILON_PX) && !(carryInPx > 0)) {
      const verdict = options.stopAt(pageIndex(), index, from);
      if (verdict) stop = { kind: verdict, page: pageIndex(), atom: index, from };
    }
  };
  /** Record what the current segment holds (for its balanced height): one
   * piece per atom, its column-cut head and tail joined, as the projector
   * balances a paragraph whole. */
  const record = (atom: LedgerAtom, heightPx: number, continuing: boolean, complete: boolean, notesPx?: number) => {
    // (`notesPx`: what the planner says this piece holds of notes; a block
    // with notes whose piece here holds none has not opened the note area.)
    if (notesPx !== undefined ? notesPx > EPSILON_PX : atom.hasNotes) page.notesBelow = true;
    if (atom.hidden || !(heightPx > EPSILON_PX)) return;
    const last = page.segment[page.segment.length - 1];
    if (last && last.atom === atom.index) {
      last.heightPx += heightPx;
      last.complete = last.complete || complete;
      return;
    }
    page.segment.push({
      atom: atom.index,
      startsWhole: !continuing,
      complete,
      heightPx,
      marginTopPx: atom.spaceBeforePx,
      marginBottomPx: atom.spaceAfterPx,
      splittable: atom.splittable,
      linePitchPx: atom.linePitchPx ?? 0,
      continuesPrevious: continuing,
      minSplitLines: atom.minSplitLines ?? 2,
    });
  };
  /**
   * A continuous section break just placed: the section ending here takes
   * its height on the page (a multi-column one balanced to its lowest
   * common column height, as Word does when the next section follows on
   * the same page) and the next section starts below it in its own columns.
   * A page with no room left below closes.
   */
  const startNextSegment = () => {
    const next = atoms[index];
    if (!next) return;
    const nextColumns = Number.isInteger(next.sectionColumns) && next.sectionColumns! > 1 ? next.sectionColumns! : 1;
    const heightPx = page.columns > 1
      ? Math.min(page.columnPx, balancedSegmentHeightPx(page.columns, page.segment, atoms, options.wordLegacyBalance === true))
      : page.usedPx;
    const gap = page.previous ? options.gapPx(page.previous, next) : 0;
    const top = page.segmentTopPx + heightPx + (heightPx > EPSILON_PX ? gap : 0);
    if (top >= page.pagePx - EPSILON_PX) {
      close(false);
      return;
    }
    page.segmentTopPx = top;
    page.columns = nextColumns;
    page.columnPx = page.pagePx - top;
    page.capacityPx = page.columnPx * nextColumns;
    page.usedPx = 0;
    page.segment = [];
  };
  /** Give a just-placed fragment's continued-footnote rows the room left on
   * its page (whole rows), carry the rest, and say whether the page is now
   * full. Newspaper columns keep the old whole-reservation accounting. */
  const spillNotes = (placement: LedgerPlacement, flexPx: number, pitchPx: number, end: number): boolean => {
    if (!(flexPx > EPSILON_PX) || !(pitchPx > 0) || page.columns > 1) return false;
    const room = end - page.usedPx;
    const rows = Math.max(0, Math.floor((room + 1 / 64) / pitchPx));
    const taken = Math.min(flexPx, rows * pitchPx);
    if (taken > 0) {
      page.usedPx += taken;
      placement.noteFlexTakenPx = taken;
    }
    const rest = flexPx - taken;
    if (rest > EPSILON_PX) {
      carryPx += rest;
      carryPitchPx = pitchPx;
      return true;
    }
    return false;
  };
  /** Close the column ending at `end` (the one the atom was tried in): the
   * next column opens with no gap (CSS truncates a margin at an unforced
   * column break, as the projector does); the page's last column closes the
   * page. */
  const closeColumn = (end: number, viaForcedBreak: boolean) => {
    // The column the flow stands in (a band can end it above the next
    // column's start): the next one opens at its own start.
    const column = columnIndexOf(page, Math.min(page.usedPx, end) - 2 * EPSILON_PX);
    if (page.columns <= 1 || end >= page.capacityPx - EPSILON_PX || column >= page.columns - 1) {
      close(viaForcedBreak);
      return;
    }
    page.usedPx = (column + 1) * page.columnPx;
    page.previous = null;
  };

  // `from`: the cut the atom's next fragment starts at (chained through
  // column and page cuts alike). `entry`: the cut the atom entered the open
  // PAGE with, which is what its placement on this page records.
  let from: LedgerCut | null = options.start?.from ?? null;
  let entry: LedgerCut | null = from;
  // The column `from` was cut in (null: not cut by this pass): its rest is
  // as tall as that column's width makes it.
  let fromColumn: number | null = null;
  // A safety bound: each loop iteration either places content or closes a
  // non-empty fragment, so this can never trigger; it only turns a logic
  // error into a diagnosable failure instead of a hang.
  let guard = atoms.length * 8 + 64;
  // The last atom of the keepNext chain that opened the current page or
  // column: up to it, no member is moved for its chain again.
  let keepReleasedThrough = -1;
  // Compatibility mode 15: a member of a keepNext chain cut where it stands
  // so that its last lines go on with a follower that cannot start here
  // (`keepChainBacksUp`): the atom and the room its head is planned in.
  let keepBackCut: { atom: number; availablePx: number } | null = null;
  const backsUp = options.keepChainBacksUp === true && !keepChainBackUpOff();
  while (index < atoms.length && !stop) {
    if (guard-- <= 0) {
      throw new Error("ledger cut did not make progress");
    }
    const atom = atoms[index];
    // A page holding only break tails has not started its flow yet.
    // Nor has one holding only anchored objects: they wait for the paragraph
    // they are drawn from. Nor one holding a page break that broke nothing
    // (Page Break Before on a page already started): it draws nothing.
    const pageEmpty = page.placements.every(
      (placement) =>
        atoms[placement.atom].breakTail || atoms[placement.atom].anchored ||
        atoms[placement.atom].paragraphPageStart === true,
    );
    // A page break before at a page top breaks nothing only on a page with
    // nothing on it. Floats drawn from the break itself (ink, shapes placed
    // before it) are its paragraph's anchors in Word: that paragraph has
    // started the page and still breaks it (Word 16.86: anchors + a page
    // break in one paragraph, then text, is two pages). Objects drawn from
    // the paragraph before them (`hostBefore`) belong to that one.
    const nothingPlaced = page.placements.every(
      (placement) => atoms[placement.atom].breakTail ||
        (atoms[placement.atom].anchored && atoms[placement.atom].hostBefore),
    );
    const columnStart = columnStartOf(page, page.usedPx);
    const columnEnd = columnEndOf(page, page.usedPx);
    const columnEmpty = pageEmpty || page.usedPx - columnStart <= EPSILON_PX;
    const lastColumn = page.columns <= 1 || columnEnd >= page.capacityPx - EPSILON_PX ||
      columnIndexOf(page, columnStart) >= page.columns - 1;
    const belowAnotherSection = page.segmentTopPx > EPSILON_PX && !pageEmpty;
    const fragmentCapacityPx = page.columns <= 1 ? page.capacityPx : page.columnPx;
    // A table row taller than a newspaper column that must start a fresh
    // fragment opens, and goes on on, the next page (LedgerAtom.freshRowPx).
    const pageRowOf = (candidate: LedgerAtom): boolean =>
      page.columns > 1 && (candidate.freshRowPx ?? 0) > page.columnPx + EPSILON_PX;
    const continuing: boolean = from !== null;
    // In a section of unequal columns the same text has another height in
    // each column: an atom drawn in one piece is tried at the height the
    // column it stands in gives it, and the rest of one cut here in a column
    // at its share of that. (An atom already drawn across the columns is
    // charged its fragments' own heights, as they stand.)
    const columnIndex = page.columns > 1
      ? Math.min(page.columns - 1, Math.floor((columnStart + EPSILON_PX) / page.columnPx))
      : 0;
    const trackHeights = atom.regionWhole && atom.regionHeightsPx && atom.regionHeightsPx.length === page.columns && page.columns > 1
      ? atom.regionHeightsPx
      : null;
    const tailScale = trackHeights && fromColumn !== null && fromColumn !== columnIndex && trackHeights[fromColumn] > EPSILON_PX
      ? trackHeights[columnIndex] / trackHeights[fromColumn]
      : 1;
    // A page's note zone has one separator: a block with notes below others
    // on the page adds its rows only (corpus R433-D10: two references in two
    // paragraphs, the chrome charged twice, a 21 px line that fits moved on).
    const sharedChromePx = !continuing && page.notesBelow && atom.noteChromePx ? atom.noteChromePx : 0;
    const height = continuing
      ? from!.tailHeightPx * tailScale
      : (trackHeights ? trackHeights[columnIndex] : atom.heightPx) - sharedChromePx;
    const noteFlexPx = continuing ? (from!.tailNoteFlexPx ?? 0) : (atom.noteFlexPx ?? 0);
    const notePitchPx = atom.notePitchPx ?? 0;
    // A floating table opening a page or column keeps its drop there.
    const lead = !continuing && atom.pageTopLeadPx && atom.pageTopLeadPx > 0 ? atom.pageTopLeadPx : 0;
    const gap: number = pageEmpty
      ? page.preserveLeadingSpace && !continuing
        ? Math.max(0, atom.spaceBeforePx - page.leadingAfterPx)
        : lead
      : columnEmpty
        ? lead
        : page.previous
          ? options.gapPx(page.previous, atom)
          : 0;
    // Word lets the last line's Auto leading cross the bottom margin, not
    // the footnote area above it (Word 16.86, corpus R51-D15: a double-spaced
    // line 0.15 pt into the note area of the page holding the reference moves
    // to the next page; without the footnote it stays).
    // Nor into a header or footer object the body ends at: Word sets no line
    // below its top (R484-D04: a tab-only paragraph fitted page 10 by 7 px of
    // credit over the footer's top, was drawn past the foot, put back, and
    // planned there again on every key).
    const footCredit = page.notesBelow || atom.hasNotes || carryInPx > EPSILON_PX || page.footBand ? 0 : atom.creditPx;
    // A paragraph whose Top and Bottom pictures opened its page keeps its
    // line there under them, however far past the foot: they cannot go on
    // without it and are already at a page top (Windows Word 16, mode 15,
    // docx-look/pc6/probes/fp: a picture filling the body from the top, its
    // paragraph's 18 pt line 10, 17 and 20 pt past the bottom margin -- the
    // picture 2 pt past it too -- stays on page 1, text or none; corpus
    // R472-D78's appendix of four full-page pictures, Word 4 pages, 7 here).
    const credit = !continuing && atom.lineUnderObjects === true && !page.notesBelow && pageOpenedByItsObjects(page, atoms, index)
      ? page.usedPx + gap + height
      : footCredit;

    // 1b. a boundary the painted page refused stays where the verifier put it.
    if (!pageEmpty && !continuing && options.breakBefore?.has(index)) {
      close(false);
      continue;
    }

    // 1c. a refused boundary before a paragraph falls before the anchored
    //     objects drawn from it: they open the next page with it.
    if (!pageEmpty && !continuing && atom.anchored && options.breakBefore?.size) {
      let owner = index;
      while (owner < atoms.length && atoms[owner].anchored) owner += 1;
      if (owner < atoms.length && options.breakBefore.has(owner)) {
        close(false);
        continue;
      }
    }

    // 1d. an object the text wraps around stays on its anchor paragraph's
    //     page (Word 2013 layout, `floatPageRoomPx`): with less room left
    //     than it reaches below the paragraph's top, the object and the
    //     paragraph it is drawn from open the next fragment -- the object's
    //     own block before the paragraph, or the paragraph holding it. One
    //     taller than a whole fragment goes on too, and opens it (Word 16.86,
    
    //     12 to 15, is drawn at the next page's top margin over the bottom
    //     one; the text after it starts the page after).
    if (
      !columnEmpty &&
      !continuing &&
      atom.roomPx !== undefined &&
      page.usedPx + gap + atom.roomPx > columnEnd + EPSILON_PX
    ) {
      closeColumn(columnEnd, false);
      continue;
    }

    // 2. keepNext chain, planned as one unit (only for a whole atom that is
    //    not already opening the fragment). Word keeps a heading with the
    //    START of the following block: when the chain's last member is
    //    splittable, it is enough that a legal head of it fits below the chain.
    // A chain whose first member opens a page (or a column) has been moved
    // as far as Word moves it: from there it breaks where the page fills,
    // whatever its members ask. (Measured in Word 16.86: three body lines,
    // then 15 to 63 consecutive Heading 1 paragraphs -- the body lines stay
    // alone on page 1, the headings start on page 2 and fill 2, 3, 4 ... with
    // no further pull; the last two of a chain that began at a page top part
    // at the foot like any two paragraphs.)
    if (columnEmpty && !belowAnotherSection && !continuing && atom.keepNext && index > keepReleasedThrough) {
      keepReleasedThrough = keepChainExtent(atoms, index, options).end;
    }
    // A column a continuous section opens below another one is no fresh
    // column: the chain is checked there as in a column with text above.
    if ((!columnEmpty || belowAnotherSection) && !continuing && atom.keepNext && index > keepReleasedThrough) {
      const chain = keepChainExtent(atoms, index, options);
      const chainCredit = page.footBand ? 0 : chain.creditPx;
      const chainFits =
        page.usedPx + gap + chain.heightPx - chainCredit <= columnEnd + EPSILON_PX;
      if (!chainFits) {
        const tail = atoms[chain.end];
        let headFits = false;
        // Word forbids a break BETWEEN kept paragraphs, not inside one: the
        // first member that does not fit whole may be cut where it stands
        // (a legal head of it here, its last lines with the next member on
        // the next page), and the members before it stay (Windows Word,
        // corpus R432-D07: ten keep-with-next body paragraphs after a list
        // in the second column -- Word fills the column and breaks inside
        // the one at its foot; moved as one unit, a whole column was left
        // empty). Only when that member cannot be cut does the run before it
        // go on with it.
        if (!keepChainSplitOff()) {
          let at = page.usedPx + gap;
          const starts: number[] = [];
          for (let member = index; member <= chain.end; member += 1) {
            if (member > index) at += options.gapPx(atoms[member - 1], atoms[member]);
            starts.push(at);
            const memberHeight = member === index ? height : atoms[member].heightPx;
            // In mode 15 a member whose last line ends inside its Auto
            // leading credit at the foot stands whole there (the page's
            // rule): the next member is the one that cannot start, and the
            // back-up below cuts this one. Read as not fitting, it was
            // asked for a head in that room, which the oracle answers
            // "whole" (null), and the back-up began a member above it.
            const memberCredit = backsUp && !keepMemberCreditOff() && !(page.notesBelow || atoms[member].hasNotes || carryInPx > EPSILON_PX || page.footBand)
              ? Math.max(0, atoms[member].creditPx)
              : 0;
            if (at + memberHeight - memberCredit <= columnEnd + EPSILON_PX) {
              at += memberHeight;
              continue;
            }
            const cut = atoms[member];
            // A table every row of which keeps with the next (the chain runs
            // on through it: `keepNext` on a table atom) has no break Word
            // allows between its rows: the chain moves on as one (Windows
            // Word, docx-look/pc2/probes/kt: a kept paragraph, then 20 rows
            // whose cells all keep with next, after ten body lines -- all go
            // to page 2; 44 rows, taller than a page, start page 2 and break
            // there; corpus R484-D90/D95/D98, Qualtrics exports, every
            // question and its answer table kept). Cut where it stood, the
            // seam a first estimate left was taken for one.
            // So is a list every paragraph of which keeps with the next.
            const keptRows = ((cut.kind === "table" && cut.keepNext === true) || cut.keptWithin === true) && !keptTableRowsCutOff();
            headFits = cut.splittable && !cut.hidden && !keptRows && columnEnd - at > EPSILON_PX &&
              options.oracle.planHead({
                atom: cut,
                from: null,
                availablePx: columnEnd - at,
                fullCapacityPx: fragmentCapacityPx,
                pageEmpty: false,
              }) !== null;
            // Word 2013+ (compatibility mode 15) keeps a kept paragraph's
            // LAST line with the next one's first: when the member that does
            // not fit cannot be cut, the nearest member before it that can
            // be is cut where it stands, its last lines (its widow floor)
            // going on with the follower; only a chain no member of which
            // can be cut so moves whole. Windows Word, probes/vsp7 (vsp2,
            // vsp4-6 re-run in mode 15): three kept 4-line paragraphs with
            // five lines left part 2|2 inside the first; a 20-line one
            // before an orphaned follower leaves 18; a keep-lines second
            // member takes 2 lines of the first; in mode 14 and earlier
            // every one of them moves whole (corpus R432-D07: nine lines
            // of "Another non-chemical method" at column 2's foot).
            if (!headFits && backsUp) {
              for (let back = member - 1; back >= index; back -= 1) {
                const candidate = atoms[back];
                const candidateHeight = back === index ? height : candidate.heightPx;
                if (!candidate.splittable || candidate.hidden || candidate.anchored) continue;
                if (!keptTableRowsCutOff() && (candidate.keptWithin === true || (candidate.kind === "table" && candidate.keepNext))) continue;
                // Room that leaves its last line out, however the oracle
                // judges "whole": its height less a line where its pitch is
                // known, else less its last line's Auto leading credit. A
                // head planned in its height less 0.5 px was the whole member
                // to the oracle -- by the credit (2.4 px), and on a page of
                // column regions, where no rendered head is laid out, by the
                // last row's glyph bottom (203.9 of 206 px) -- and no cut:
                // corpus R432-D07's "Another non-chemical method" moved whole
                // to page 2. The credit is the one its cut will be judged with
                // (none above notes).
                const candidateCredit = page.notesBelow || candidate.hasNotes || carryInPx > EPSILON_PX || page.footBand ? 0 : Math.max(0, candidate.creditPx);
                const pitch = candidate.linePitchPx && candidate.linePitchPx > 0 && candidateHeight >= 2 * candidate.linePitchPx - EPSILON_PX
                  ? candidate.linePitchPx
                  : 0;
                const shortOfWholePx = keepBackUpCreditOff()
                  ? BACK_UP_SLACK_PX
                  : Math.max(candidateCredit + BACK_UP_SLACK_PX, pitch - BACK_UP_SLACK_PX);
                const availablePx = Math.min(columnEnd - starts[back - index], candidateHeight - shortOfWholePx);
                if (!(availablePx > EPSILON_PX)) continue;
                const head = options.oracle.planHead({
                  atom: candidate,
                  from: null,
                  availablePx,
                  fullCapacityPx: fragmentCapacityPx,
                  pageEmpty: false,
                  ...(candidateCredit <= EPSILON_PX && candidate.creditPx > EPSILON_PX ? { noFootCredit: true } : {}),
                });
                if (!head) continue;
                keepBackCut = { atom: back, availablePx };
                keepReleasedThrough = Math.max(keepReleasedThrough, back);
                headFits = true;
                break;
              }
            }
            break;
          }
        } else if (tail.splittable && chain.end > index) {
          const availableForTail =
            columnEnd - page.usedPx - gap - chain.heightBeforeTailPx;
          headFits =
            availableForTail > EPSILON_PX &&
            options.oracle.planHead({
              atom: tail,
              from: null,
              availablePx: availableForTail,
              fullCapacityPx: fragmentCapacityPx,
              pageEmpty: false,
            }) !== null;
        }
        // The chain starts together on a fresh page even when it is taller
        // than one (WORD-VERTICAL-SPEC 6.2/6.4: "starts together on a new
        // page, then breaks"); it used to stay put once it was taller than a
        // page, so one more Enter in a run of headings threw the first one
        // back to the page before and broke right under it. What does not
        // move is a chain a fresh page could not even start: its first
        // member with the one after it (or a legal head of that one).
        // The fragment the chain would start on fresh is a whole column of
        // a page: a multi-column section begun near a page's foot has
        // columns only as tall as the room left there, and a chain taller
        // than those still starts together in the next page's (Word 16.86,
        // corpus R53-D14: "W8 kept" with keep-with-next, two lines left
        // under a continuous two-column break -- the heading and its
        // paragraph open page 19; without keep-with-next the heading stays
        // at the foot of page 18).
        const freshFragmentPx = page.columns > 1 ? Math.max(fragmentCapacityPx, page.pagePx) : fragmentCapacityPx;
        if (!headFits && (chain.heightPx <= freshFragmentPx + EPSILON_PX ||
            chainStartsOnFreshFragment(atoms, index, chain.end, freshFragmentPx, options))) {
          closeColumn(columnEnd, false);
          continue;
        }
      }
    }

    // 2b. a later table row that starts a new page (Word's page break before
    //     on its first paragraph, corpus R79-D05) ends the page above it,
    //     however much of the table would still fit.
    const forcedCut: LedgerCut | null =
      atom.rowPageBreaks && !atom.hidden && columnEnd - page.usedPx - gap > EPSILON_PX
        ? options.oracle.forcedHead?.({
            atom,
            from,
            availablePx: columnEnd - page.usedPx - gap,
            fullCapacityPx: fragmentCapacityPx,
            pageEmpty: columnEmpty && !belowAnotherSection,
          }) ?? null
        : null;

    // 3. whole-atom (or whole-remainder) fit. A break marker takes no room and
    // belongs to the block before it, even a last line whose hanging leading
    // ran past the margin: moved on, its break left a blank page (corpus
    // R281-D08: a double-spaced line 7 px over the foot, then a page break).
    const backCut = keepBackCut !== null && keepBackCut.atom === index && !continuing ? keepBackCut : null;
    if (keepBackCut !== null && (keepBackCut.atom < index || backCut)) keepBackCut = null;
    if (
      !forcedCut && !backCut &&
      (isZeroBreakMarker(atom) || page.usedPx + gap + height - credit <= columnEnd + EPSILON_PX)
    ) {
      const placement: LedgerPlacement = { atom: index, from: entry, to: null };
      page.placements.push(placement);
      page.usedPx += gap + height;
      record(atom, height, continuing, true, continuing ? from!.tailNotesPx : undefined);
      if (!atom.hidden) page.previous = atom;
      from = null;
      entry = null;
      fromColumn = null;
      index += 1;
      const full = lastColumn && spillNotes(placement, noteFlexPx, notePitchPx, columnEnd);
      // A paragraph's own page break before, on a page nothing has started:
      // the paragraph is already at a page top (Word).
      if (atom.forcedBreakAfter && !(atom.paragraphPageStart && nothingPlaced)) close(true);
      else if (atom.columnBreakAfter) {
        // The balance of the segment closes its column here too.
        const last = page.segment[page.segment.length - 1];
        if (last) last.forceNextColumnAfter = true;
        closeColumn(columnEnd, true);
      }
      else if (full) close(false);
      else if (atom.continuousSectionBreak) startNextSegment();
      continue;
    }

    // 4. split. A "keep lines together" paragraph taller than a page starts
    //    on a new page, then breaks (Word 16.86, WUA 141: 60 lines after
    //    half a page start at the top of page 2 and end on page 3).
    if (atom.keepLinesOverlong && !continuing && !columnEmpty && !belowAnotherSection) {
      closeColumn(columnEnd, false);
      continue;
    }
    if (forcedCut || (atom.splittable && !atom.hidden)) {
      const availablePx: number = backCut
        ? Math.min(columnEnd - page.usedPx - gap, backCut.availablePx)
        : columnEnd - page.usedPx - gap;
      const cut: LedgerCut | null = forcedCut ??
        (availablePx > EPSILON_PX
          ? options.oracle.planHead({
              atom,
              from,
              availablePx,
              fullCapacityPx: fragmentCapacityPx,
              // An empty column of a section that starts below another one
              // is no page top: it is short because of what stands above
              // it, so Word's widow/orphan floors hold (a heading four lines
              // tall there left one line at the foot of the page).
              pageEmpty: columnEmpty && !belowAnotherSection,
              ...(page.notesBelow && atom.noteChromePx ? { pageNoteChromePx: atom.noteChromePx } : {}),
              ...(credit <= EPSILON_PX && atom.creditPx > EPSILON_PX ? { noFootCredit: true } : {}),
              // A chain that opened the page breaks where the page fills:
              // its table of kept rows too (Windows Word, pc2/probes/kt: a
              // kept question and 44 kept rows open page 2 and part at its
              // foot, row 24 on page 3). Asked as kept, the rows found no
              // break and the seam an earlier page had cut stood.
              ...(index <= keepReleasedThrough && !keptTableRowsCutOff() ? { keepReleased: true } : {}),
            })
          : null);
      if (cut) {
        page.usedPx += gap + cut.headHeightPx;
        record(atom, cut.headHeightPx, continuing, false, cut.headNotesPx);
        page.previous = atom;
        from = cut;
        fromColumn = columnIndex;
        if (lastColumn || pageRowOf(atom)) {
          const placement: LedgerPlacement = { atom: index, from: entry, to: cut };
          page.placements.push(placement);
          spillNotes(placement, cut.headNoteFlexPx ?? 0, notePitchPx, columnEnd);
          entry = cut;
          close(false);
        } else {
          // An in-column cut: the atom continues in the next column of the
          // same page (the projector's seam), one placement for the page.
          closeColumn(columnEnd, false);
        }
        continue;
      }
    }

    if (!columnEmpty) {
      // Retry the atom (or its remainder) at the top of a fresh fragment:
      // the next page's for a table row taller than a column (freshRowPx).
      if (pageRowOf(atom)) close(false);
      else closeColumn(columnEnd, false);
      continue;
    }

    // A page that opened with continued footnote rows gives rows back to
    // the body (whole rows, into the carry) so the atom opening it can stand:
    // every page keeps body text (Word), and no page is a note-only page
    // except after the document's last block.
    if (carryInPx > continuationChromePx + EPSILON_PX && carryPitchPx > 0 && columnEmpty) {
      const fullPx = options.capacityFor(pageIndex());
      const wanted = Math.min(height - credit, fullPx) - (columnEnd - page.usedPx - gap);
      if (wanted > EPSILON_PX) {
        const rows = Math.min(
          Math.ceil(wanted / carryPitchPx - EPSILON_PX),
          Math.floor((carryInPx - continuationChromePx + 1 / 64) / carryPitchPx),
        );
        if (rows > 0) {
          const give = rows * carryPitchPx;
          carryInPx -= give;
          carryPx += give;
          if (carryInPx <= continuationChromePx + EPSILON_PX) {
            carryPx += carryInPx;
            carryInPx = 0;
          }
          page.capacityPx = Math.min(fullPx, page.capacityPx + give);
          page.columnPx = page.capacityPx / page.columns;
          guard += 1;
          continue;
        }
      }
    }

    // A section that starts below another one on the page has columns only
    // as tall as the room left: an atom that cannot stand in them is not
    // "taller than a page". The page closes and it opens the next one (Word
    // leaves the room blank), where the rule below applies to a full page.
    // Placed here instead, it ran past the foot for the verifier to push out
    // and this planner to pull back (complex2010.docx: a heading of one line
    // in the wide column and four in the narrow one, 44px above the foot).
    if (belowAnotherSection) {
      if (from !== entry) {
        page.placements.push({ atom: index, from: entry, to: from });
        entry = from;
      }
      close(false);
      continue;
    }

    // In a section of unequal columns a block held whole that a later
    // column of the page is wide enough to hold goes on to it, leaving this
    // one empty (Word 16.86, corpus R76-D15: a kept paragraph too tall for
    // the 1.04" and 1.74" columns stands at the top of the 2.8" third one).
    if (
      trackHeights && !continuing && !atom.splittable && !lastColumn &&
      trackHeights.slice(columnIndex + 1).some((later) => later <= page.columnPx + EPSILON_PX)
    ) {
      closeColumn(columnEnd, false);
      continue;
    }

    // The atom opens the fragment and still does not fit: it is taller than
    // a column (page) and could not be cut. Place it alone; the column's
    // foot clips it and the flow continues in the next column, the sheet
    // overflows in the last one and the physical verifier reports it.
    const placement: LedgerPlacement = { atom: index, from: entry, to: null };
    page.placements.push(placement);
    page.usedPx += height;
    page.previous = atom;
    overflowingAtoms.push(index);
    from = null;
    entry = null;
    fromColumn = null;
    index += 1;
    if (lastColumn || pageRowOf(atom)) {
      spillNotes(placement, noteFlexPx, notePitchPx, columnEnd);
      // A break marker right after it takes no room and belongs to it (Word
      // keeps the mark in that block's paragraph): it stays on this page
      // (corpus R42-D16: a cover page atom a footer's height over its page,
      // then the cover's next-page section break -- the mark took a page of
      // its own and "Inhalt" landed on page 3, not 2).
      let forced = atom.forcedBreakAfter;
      // A Top and Bottom picture taller than the page it opened keeps its
      // paragraph's one line there under it too, past the foot as the
      // picture already is (Windows Word 16, mode 15, docx-look/pc6/probes/fp
      // fp-c: a 700 pt picture in a 697.89 pt body, its line on page 1).
      const line = atoms[index];
      if (
        !forced && lastColumn && line?.lineUnderObjects === true && !line.hasNotes && !page.notesBelow &&
        pageOpenedByItsObjects(page, atoms, index) && !lineUnderTallPictureOff()
      ) {
        page.placements.push({ atom: index, from: null, to: null });
        page.usedPx += line.heightPx;
        page.previous = line;
        forced = line.forcedBreakAfter;
        index += 1;
      }
      while (!forced && index < atoms.length && isZeroBreakMarker(atoms[index])) {
        page.placements.push({ atom: index, from: null, to: null });
        forced = atoms[index].forcedBreakAfter;
        index += 1;
      }
      close(forced);
    } else {
      page.usedPx = columnStart + page.columnPx;
      page.previous = null;
      if (atom.forcedBreakAfter) close(true);
    }
  }
  if (stop) {
    carryAnchoredObjectsToTheirParagraph(pages, atoms);
    return { pages, overflowingAtoms, stop };
  }
  if (page.placements.length > 0) close(false);
  carryAnchoredObjectsToTheirParagraph(pages, atoms);
  // Rows still carried after the last block: pages of continued footnote
  // rows only, drawn by the overlay (no document block stands on them).
  const notePages: LedgerPage[] = [];
  let noteGuard = 256;
  while (carryInPx > 0 && noteGuard-- > 0) {
    notePages.push({
      placements: [],
      usedPx: 0,
      capacityPx: page.capacityPx,
      preserveLeadingSpace: false,
      noteCarryInPx: carryInPx,
      ...(carryPx > EPSILON_PX ? { noteCarryOutPx: carryPx } : {}),
    });
    page = openPage();
    carryInPx = takeCarryIn(page.capacityPx);
  }
  return { pages, overflowingAtoms, ...(notePages.length ? { notePages } : {}) };
}











export function carryAnchoredObjectsToTheirParagraph(
  pages: readonly LedgerPage[],
  atoms: readonly LedgerAtom[],
): void {
  for (let pageIndex = 0; pageIndex + 1 < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    const next = pages[pageIndex + 1];
    const opener = next.placements[0];
    if (!opener || opener.from !== null) continue;
    let runStart = page.placements.length;
    while (runStart > 0) {
      const placement = page.placements[runStart - 1];
      if (
        placement.from !== null || placement.to !== null || !atoms[placement.atom]?.anchored ||
        // Placed after the paragraph it is anchored in: it stays with that one.
        atoms[placement.atom]?.hostBefore
      ) break;
      runStart -= 1;
    }
    if (runStart === page.placements.length || runStart === 0) continue;
    // The run is drawn from the atom right after it, which opens the next page.
    if (opener.atom !== page.placements[page.placements.length - 1].atom + 1) continue;
    next.placements.unshift(...page.placements.splice(runStart));
  }
}

/** Whether the page holds only the Top and Bottom pictures drawn from
 * `atoms[index]`, placed right before it (and nothing of the flow above them):
 * they opened it. */
function pageOpenedByItsObjects(page: OpenPage, atoms: readonly LedgerAtom[], index: number): boolean {
  if (page.columns > 1 || page.segmentTopPx > EPSILON_PX || page.placements.length === 0) return false;
  const last = page.placements[page.placements.length - 1];
  if (last.atom !== index - 1 || !atoms[index - 1]?.objectOfNext || last.from !== null || last.to !== null) return false;
  return page.placements.every((placement) => {
    const placed = atoms[placement.atom];
    return placed.breakTail || placed.anchored === true || placed.objectOfNext === true ||
      (placed.hidden && !(placed.heightPx > EPSILON_PX));
  });
}

/** A page or section break marker: no height, nothing drawn. */
function isZeroBreakMarker(atom: LedgerAtom): boolean {
  return atom.kind === "break" && atom.hidden && !(atom.heightPx > EPSILON_PX);
}

/** Whether a chain taller than a fragment can at least begin on a fresh one:
 * its first member together with the next (whole, or a legal head of it). */
function chainStartsOnFreshFragment(
  atoms: readonly LedgerAtom[],
  start: number,
  end: number,
  fragmentCapacityPx: number,
  options: LedgerCutOptions,
): boolean {
  if (end <= start) return false;
  const first = atoms[start];
  const next = atoms[start + 1];
  const roomPx = fragmentCapacityPx - first.heightPx - options.gapPx(first, next);
  if (roomPx <= EPSILON_PX) return false;
  if (next.heightPx - next.creditPx <= roomPx + EPSILON_PX) return true;
  return next.splittable && options.oracle.planHead({
    atom: next,
    from: null,
    availablePx: roomPx,
    fullCapacityPx: fragmentCapacityPx,
    pageEmpty: false,
  }) !== null;
}

/** Height of the keepNext chain starting at `start`, including the gaps
 * between its members, up to (and including) the first atom that does not
 * keep with the next one or that carries a forced break. */
function keepChainExtent(
  atoms: readonly LedgerAtom[],
  start: number,
  options: LedgerCutOptions,
): { end: number; heightPx: number; creditPx: number; heightBeforeTailPx: number } {
  let heightPx = atoms[start].heightPx;
  let heightBeforeTailPx = 0;
  let end = start;
  while (
    end + 1 < atoms.length &&
    atoms[end].keepNext &&
    !atoms[end].forcedBreakAfter &&
    !atoms[end].columnBreakAfter
  ) {
    heightBeforeTailPx = heightPx + options.gapPx(atoms[end], atoms[end + 1]);
    heightPx = heightBeforeTailPx + atoms[end + 1].heightPx;
    end += 1;
  }
  return { end, heightPx, creditPx: atoms[end].creditPx, heightBeforeTailPx };
}

/** `window.__docsLineUnderTallPictureOff = true`: the line of a paragraph
 * whose Top and Bottom picture is taller than the page it opened goes on to
 * the next page, as before (A/B). */
function lineUnderTallPictureOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsLineUnderTallPictureOff?: boolean }).__docsLineUnderTallPictureOff === true;
}
