/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Zero-dependency names shared by pagination, its mergers and receipt codec.
 * Merger modules must not import the page node extension just for these keys. */
export const PAGE_BLOCK_NODE = "pageBlock";
/** A block a page split cut from an earlier fragment of the same block. Named
 * here so a reader outside pagination (the Word line-spacing projection, which
 * must answer for every fragment of one paragraph alike) can recognise one
 * without importing the splitter and its whole measurement graph. */
export const SPLIT_CONTINUES_ATTR = "pageSplitContinues";
export const SPLIT_CONTINUATION_ATTR = "pageSplitContinuation";
/** On a fragment a page split cut (editor runtime only, never stored): the
 * block id of the block's first fragment, whatever ids the later fragments
 * were given. A fragment that names the identity of the fragment before it
 * is provably a piece of the same block. */
export const SPLIT_PIECE_OF_ATTR = "pageSplitPieceOf";

/** The identity a fragment's pieces name: its own `pageSplitPieceOf`, else
 * its block id (the first fragment). */
export function splitPieceRoot(attrs: Record<string, unknown> | null | undefined): string | null {
  const own = attrs?.[SPLIT_PIECE_OF_ATTR];
  if (typeof own === "string" && own) return own;
  const id = attrs?.block_id;
  return typeof id === "string" && id ? id : null;
}
export const PAGE_REGION_RECEIPT = "pageRegionLayoutReceipt";

/** The attributes only the paginated editor holds (the room, the store and
 * a canonical layout receipt never do): its sheets' layout and the pieces a
 * block was cut into. */
export const PAGINATION_RUNTIME_ATTRIBUTES: ReadonlySet<string> = new Set([
  "pageBlockSizes", "pageBlockLayoutKey", "pageRegionLayoutReceipt",
  "pageSplitContinues", "pageSplitContinuation", "pageSplitPieceOf",
  "pageSplitItemContinues", "pageSplitItemContinuation", "pageSplitListItemBridge",
  "pageUnbreakableContainerFallback",
  "noteSliceStart", "noteSliceEnd", "noteSliceStartOffset", "noteSliceEndOffset",
  "pageTableFragmentId", "pageTableContinues", "pageTableContinuation",
  "pageTableFragmentStartRow", "pageTableFragmentEndRow", "pageTableUnbreakableFallback",
  "pageTableSourceRow", "pageTableRepeatedHeader", "pageTableRowContinues", "pageTableRowContinuation",
  "pageTableSourceCellCol", "pageTableVerticalContinuation", "pageTableOriginalRowspan",
  "pageTableCellContinues", "pageTableCellContinuation", "pageTableCellEmptyHead", "pageTableCellEmptyTail",
  "pageTableBlockContinues", "pageTableBlockContinuation",
]);

export const COPILOT_PROJECTION_ORIGIN = "copilotProjectionOrigin";

export const PAGE_BANDS_MEASUREMENT_PENDING_ATTR = "data-docs-page-bands-pending";
/** Stamped on a sheet that holds a block which cannot be cut and is taller
 * than the text area (pageSpanExtension): the block is drawn at full size
 * and the paper's edge ends it, as Word draws an over-tall picture. What
 * runs past the page there is the page's design, not text that spilled. */
export const PAGE_OVERSIZE_ATTR = "data-page-oversize";
/** Fired on the editor root when the set of sheets the page ledger gave to
 * a block it could not cut (overTallSheets) changed. */
export const PAGE_OVER_TALL_SHEETS_EVENT = "mrn-page-over-tall-sheets";
/** Fired on the editor root when the page ledger has laid the whole document
 * out and the painted pages agree with it: every block is on its page. */
export const PAGE_LEDGER_CONVERGED_EVENT = "mrn-page-ledger-converged";

/** On the first block of a sheet that is not a hard-break segment's tail (pageEdgeMarks). */
export const PAGE_EDGE_FIRST_ATTR = "data-page-edge-first";
/** On the last block of a sheet (pageEdgeMarks). */
export const PAGE_EDGE_LAST_ATTR = "data-page-edge-last";

/**
 * A measurement clone stands wherever its probe puts it, not at the edge of
 * the live sheet its original stood at: take the page-edge marks off.
 */
export function clearPageEdgeMarks(clone: Element): void {
  clone.removeAttribute(PAGE_EDGE_FIRST_ATTR);
  clone.removeAttribute(PAGE_EDGE_LAST_ATTR);
}

/** How far past its page a table's head piece may stand rather than move the
 * table on: inside the bottom margin of any page Word would cut it on. */
export const HEAD_PIECE_OVERRUN_PX = 48;

/** A print asks for the sheets past their foot (`sheets`, by index) to be read again. */
export const PRINT_SHEETS_OVERRUN_REASON = "print-sheets-overrun";
