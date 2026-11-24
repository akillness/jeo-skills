/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Page-span accounting for structural sheets (V3).
 *
 * A sheet article normally holds exactly one printed page (min-height =
 * --page-height-px; the rebalancer moves whole blocks between sheets). The
 * ONE case that can't hold is a single block taller than a page (e.g. a
 * 29000px table): the model cannot split one block across two pageBlocks
 * without changing the document (two <w:tbl> on export), so the sheet
 * stretches instead. Such a sheet still REPRESENTS ceil(content/capacity)
 * printed pages:
 *
 * - print: the article clone fragments across N @page boxes natively
 *   (browsers break tables at row boundaries), and
 * - numbering: the sheet's inline `counter-increment: mrn-page N` (stamped
 *   from the measured span) keeps CSS page numbers, band {PAGE} tokens and
 *   print pagination telling the same story.
 *
 * The edit surface draws dashed page-boundary guides at each capacity
 * multiple (estimation, same spirit as Word's draft-view boundaries — the
 * exact print break lands on the nearest row edge).
 */

export interface SheetSpanMeasurement {
  /** Printed pages this sheet stands for (>= 1). */
  span: number;
  /** Content-box height of one page slice, px. */
  capacity: number;
  /** Sheet-local offsets (from the sheet's top) of each internal page
   * boundary — length span-1. */
  seamOffsets: number[];
}

/** Spans are clamped so a pathological measurement can't explode the
 * overlay/counters; 500 pages of a single block is far beyond anything a
 * real document produces (th-5's 29000px table ≈ 34). */
const MAX_SPAN = 500;

/** Tolerance (px) before an overflowing sheet counts an extra page — sub-2px
 * spill is rounding noise from margins/zoom, not a real second page. */
export const PHYSICAL_PAGE_SPILL_TOLERANCE_PX = 2;

/** Section starts that can require one implicit physical parity page. */
export type PageParityBreak = "oddPage" | "evenPage" | null;

export interface PhysicalPageStarts {
  /** One-based physical page number of every editable sheet. */
  starts: number[];
  /** Total physical pages, including implicit parity blanks. */
  total: number;
  /** Zero/one implicit blank pages immediately before every editable sheet. */
  gapsBefore: number[];
}

export function measureSheetSpan(input: {
  sheetHeightPx: number;
  pageHeightPx: number;
  paddingTopPx: number;
  paddingBottomPx: number;
}): SheetSpanMeasurement {
  const pageHeight =
    Number.isFinite(input.pageHeightPx) && input.pageHeightPx > 0
      ? input.pageHeightPx
      : 1056;
  const padTop = Math.max(0, input.paddingTopPx || 0);
  const padBottom = Math.max(0, input.paddingBottomPx || 0);
  const capacity = Math.max(120, pageHeight - padTop - padBottom);
  const contentHeight = Math.max(
    0,
    (input.sheetHeightPx || 0) - padTop - padBottom,
  );
  const span = Math.min(
    MAX_SPAN,
    Math.max(1, Math.ceil((contentHeight - PHYSICAL_PAGE_SPILL_TOLERANCE_PX) / capacity)),
  );
  const seamOffsets: number[] = [];
  for (let page = 1; page < span; page += 1) {
    seamOffsets.push(padTop + page * capacity);
  }
  return { span, capacity, seamOffsets };
}

/**
 * Cumulative page numbering over per-sheet spans: sheet i covers pages
 * [starts[i], starts[i] + spans[i] - 1]; `total` matches what the CSS
 * counter reaches after the last sheet.
 */
export function computePageStarts(spans: ReadonlyArray<number>): {
  starts: number[];
  total: number;
} {
  const { starts, total } = computePhysicalPageStarts(spans);
  return { starts, total };
}

function normalizedSpan(raw: number): number {
  return Math.max(1, Math.floor(raw) || 1);
}

/**
 * Physical page accounting for structural editing.
 *
 * Word/WPS keep an odd/even section filler outside the editable story: two
 * editable sheets can therefore represent physical pages 1 and 3. The gap is
 * attached to the FOLLOWING sheet so its page number, even/odd band variant and
 * CSS counter all advance together without manufacturing an editable pageBlock.
 */
export function computePhysicalPageStarts(
  spans: ReadonlyArray<number>,
  parityBreaksAfter: ReadonlyArray<PageParityBreak> = [],
  restartNumbers: ReadonlyArray<number | null> = [],
): PhysicalPageStarts {
  const starts: number[] = [];
  const gapsBefore = spans.map(() => 0);
  // Every section's own restart, whatever the odd/even header setting
  // (`sectionRestartNumbers` attaches them): an Odd/Even Page section break
  // starts the section on the next odd/even page NUMBER. Word 16 (corpus
  // R89-D26): an odd-page section restarting at 1 after three pages opens
  // page 4 with "1", no blank before it (the paper parity would have asked
  // for one, 5 pages where Word has 4).
  const numberRestarts = (restartNumbers as SectionRestartNumbers).numberRestarts ?? [];
  let cursor = 1;
  let number = 1;
  for (let index = 0; index < spans.length; index += 1) {
    const span = normalizedSpan(spans[index]);
    starts.push(cursor);
    cursor += span;
    number += span;
    if (index >= spans.length - 1) continue;
    const parity = parityBreaksAfter[index];
    // A section restarting its page numbers under Different Odd & Even
    // Pages starts on paper of its first number's parity: Word's print puts
    // a blank page before "1" when it would fall on an even page.
    const restart = restartNumbers[index + 1];
    const ownRestart = numberRestarts[index + 1];
    const nextNumber = typeof ownRestart === "number" ? ownRestart : number;
    const needsBlank =
      (parity === "oddPage" && nextNumber % 2 === 0) ||
      (parity === "evenPage" && nextNumber % 2 === 1) ||
      (typeof restart === "number" && Math.abs(cursor % 2) !== Math.abs(restart % 2));
    if (typeof ownRestart === "number") number = ownRestart;
    if (needsBlank) {
      gapsBefore[index + 1] = 1;
      cursor += 1;
      number += 1;
    }
  }
  return { starts, total: cursor - 1, gapsBefore };
}

const EDITOR_ONLY_DIRECT_CHILD_SELECTOR =
  ".note-editor-editable-page-gap,.ProseMirror-gapcursor";

/**
 * Return the parity break that semantically closes an editable sheet.
 *
 * Only the final authored direct child counts. A section break followed by
 * ordinary content is not a sheet boundary, while ProseMirror gap widgets are
 * ignored because they are view chrome rather than document nodes.
 */
export function endingSheetParityBreak(sheet: Element): PageParityBreak {
  const authored = Array.from(sheet.children).filter(
    (child) => !child.matches(EDITOR_ONLY_DIRECT_CHILD_SELECTOR),
  );
  const final = authored.at(-1);
  if (final?.getAttribute("data-type") !== "section-break") return null;
  const value = final.getAttribute("data-break-type");
  return value === "oddPage" || value === "evenPage" ? value : null;
}

/** Whether the document has Word's Different Odd & Even Pages on (one
 * setting for the whole document, `w:evenAndOddHeaders`). */
export function documentEvenAndOddHeaders(attrs: Record<string, unknown> | null | undefined): boolean {
  if (!attrs) return false;
  if (attrs.differentOddEven === true) return true;
  const graph = attrs.sectionStoryGraph as { evenAndOddHeaders?: unknown } | null | undefined;
  if (graph && typeof graph === "object" && graph.evenAndOddHeaders === true) return true;
  const bands = attrs.sectionBands;
  return Array.isArray(bands) && bands.some((entry) => (entry as { differentOddEven?: unknown } | null)?.differentOddEven === true);
}

/**
 * For each sheet, the page number its section restarts at when that sheet
 * opens the section and Word's print must put it on paper of its parity
 * (Different Odd & Even Pages on; wp-fix-a/oddeven.docx: Start at 1 on what
 * would be page 2 prints a blank page 2 first), else null.
 */
/** Restart numbers that force paper parity (Different Odd & Even Pages),
 * carrying every section's own restart as `numberRestarts`. */
export type SectionRestartNumbers = (number | null)[] & { numberRestarts?: (number | null)[] };

export function sectionRestartNumbers(
  sectionIndexes: ReadonlyArray<number>,
  sectionLayouts: unknown,
  evenAndOddHeaders: boolean,
): SectionRestartNumbers {
  const own: (number | null)[] = !Array.isArray(sectionLayouts)
    ? sectionIndexes.map(() => null)
    : sectionIndexes.map((sectionIndex, index) => {
        if (index === 0 || sectionIndexes[index - 1] === sectionIndex) return null;
        const layout = sectionLayouts[sectionIndex] as { pageNumber?: { start?: unknown } } | null | undefined;
        const start = layout?.pageNumber?.start;
        return typeof start === "number" && Number.isInteger(start) && start >= 0 ? start : null;
      });
  const forced: SectionRestartNumbers = evenAndOddHeaders ? [...own] : sectionIndexes.map(() => null);
  // Not enumerable: the array still reads (and compares) as the forced restarts.
  Object.defineProperty(forced, "numberRestarts", { value: own, enumerable: false });
  return forced;
}
