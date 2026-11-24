/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Row-sliced atoms: generated lists that flow across pages by their rows.
 *
 * A table of contents, a table of figures or a bibliography is ONE atom of
 * the document (the References dialog reads and writes its settings, a save
 * writes one field), yet in Word its result is ordinary paragraphs, one per
 * entry in the TOC 1-9, "table of figures" or Bibliography style, and those
 * paragraphs flow over as many pages as they need (the TOC field of ECMA-376
 * Part 1, 17.16.5; the API's document_docx_toc_field.py spells the package
 * shape). Bounding the atom to one page showed a long table in a scrolling
 * box no printed page has.
 *
 * So the page ledger cuts such an atom between two rows, exactly the way it
 * already cuts the footnote list between two notes: the atom is repeated on
 * each page it reaches, and each copy draws only the rows [start, end) of the
 * one list. The copies are a runtime projection:
 *
 *   - `mergeSplitContinuationsJson` keeps the first copy, without its range,
 *     and drops the rest before any save, export, comparison or AI read;
 *   - the range lives in the two attribute names the footnote list's slices
 *     use. The collaborative projection (PAGINATION_RUNTIME_ATTRIBUTES), the
 *     API's causal CRDT (RUNTIME_ATTRS) and the pagination receipt already
 *     treat exactly these names as layout state on any node, so a second
 *     sliced atom changes no protocol and no stored document.
 *
 * This module is the vocabulary only (no editor, no DOM, no paginator), so a
 * node view may import it without pulling the pagination graph in.
 */

/** First row this copy draws (null or 0: from the list's first row). */
export const ROW_SLICE_START_ATTR = "noteSliceStart";
/** Row this copy stops before (null: through the list's last row). */
export const ROW_SLICE_END_ATTR = "noteSliceEnd";

/**
 * Stamped by the node view on every row it draws: the row's index in the
 * WHOLE list. The cut is planned from these elements and named by this
 * index, so it stays valid whichever copy the row is drawn in.
 */
export const PAGE_ROW_ATTR = "data-page-row";
/** Stamped by the node view on its wrapper: which part of the list a copy
 * draws ("head" continues on a later page, "middle" both, "tail" ends it). */
export const PAGE_ROW_SLICE_ATTR = "data-page-row-slice";

/**
 * A closed-box atom (isClosedBoxRowSlicedAtomType) says where its rows are
 * and which of the elements around them go on across a page, so the space
 * the whole atom has between the last row of one copy and the first row of
 * the next can be read exactly from the two copies (rowSliceSplitting):
 *
 *   - PAGE_ROWS_ROOT_ATTR on the element whose content is the rows and what
 *     holds them (everything outside it is the copy's own frame);
 *   - PAGE_ROW_CONTINUES_ATTR on an element (a list, a table, a paragraph
 *     drawn word by word) whose rows go on in the next copy;
 *   - PAGE_ROW_CONTINUED_ATTR on one whose rows began in the copy before.
 */
export const PAGE_ROWS_ROOT_ATTR = "data-page-rows";
export const PAGE_ROW_CONTINUES_ATTR = "data-page-row-continues";
export const PAGE_ROW_CONTINUED_ATTR = "data-page-row-continued";

/**
 * Block atoms whose node view draws stamped rows and honours a row range.
 *
 * `documentAltChunkReadOnly` is the read-only carrier of an HTML part a Word
 * file embeds (altChunk). Word opens such a part as ordinary paragraphs that
 * flow over pages; the carrier draws the same content as rows (its blocks,
 * list items, table rows, lines) and flows the same way. Its own authority
 * plugin keeps the carrier canonical and knows these copies.
 *
 * `ai_output` is not a generated list: it is the card earlier versions of
 * the assistant wrote its answer in (nothing creates one any more; old
 * documents and the `:::ai-output` Markdown directive still hold them). Its
 * text is Markdown in one attribute, so no paragraph of it is a node the
 * paginator could cut between. It flows the same way: its rows are the
 * blocks of that Markdown (and the items of its top-level lists), so an
 * answer longer than a page is read page after page like the text it is.
 */
export const ROW_SLICED_ATOM_TYPES: ReadonlySet<string> = new Set([
  "tableOfContents",
  "listOfFigures",
  "bibliography",
  "ai_output",
  "documentAltChunkReadOnly",
]);

export function isRowSlicedAtomType(name: unknown): boolean {
  return typeof name === "string" && ROW_SLICED_ATOM_TYPES.has(name);
}

/**
 * Meta of the follow-up transaction that keeps the copies of one row-sliced
 * atom one object (atomRowSliceExtension): it changes row ranges and copies
 * only, never what an atom holds. A plugin that guards an atom's content
 * (the altChunk carrier's authority) tells it by this name.
 */
export const ROW_SLICE_INTEGRITY_META = "mrnoteRowSliceIntegrity";

/**
 * Row-sliced atoms whose every copy is a closed box: a frame with its own
 * padding around the rows it draws. A copy that ends before the list does
 * still draws what closes it (the space under its last row, the box's bottom
 * padding and border), so the cut counts that as part of the head. A
 * generated list has no such frame: its copy ends with its last row.
 */
const CLOSED_BOX_ROW_SLICED_ATOM_TYPES: ReadonlySet<string> = new Set(["ai_output", "documentAltChunkReadOnly"]);

export function isClosedBoxRowSlicedAtomType(name: unknown): boolean {
  return typeof name === "string" && CLOSED_BOX_ROW_SLICED_ATOM_TYPES.has(name);
}

export interface RowSliceRange {
  start: number;
  /** null: the end of the list. */
  end: number | null;
}

type Attrs = Readonly<Record<string, unknown>> | null | undefined;

function rowIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function rowSliceRange(attrs: Attrs): RowSliceRange {
  const start = rowIndex(attrs?.[ROW_SLICE_START_ATTR]) ?? 0;
  const end = rowIndex(attrs?.[ROW_SLICE_END_ATTR]);
  return { start, end: end !== null && end > start ? end : null };
}

/** The copy draws less than the whole list. */
export function isRowSliced(attrs: Attrs): boolean {
  const range = rowSliceRange(attrs);
  return range.start > 0 || range.end !== null;
}

interface TypedNode {
  type: { name: string } | string | undefined;
  attrs?: Attrs;
}

function typeNameOf(node: TypedNode | null | undefined): string | undefined {
  const type = node?.type;
  return typeof type === "string" ? type : type?.name;
}

/** A copy that continues an earlier one: never the list's first row. */
export function isRowSliceTail(node: TypedNode | null | undefined): boolean {
  return isRowSlicedAtomType(typeNameOf(node)) && rowSliceRange(node?.attrs).start > 0;
}

/** `attrs` drawing rows [start, end) of its list. */
export function withRowSlice(
  attrs: Readonly<Record<string, unknown>>,
  start: number,
  end: number | null,
): Record<string, unknown> {
  return {
    ...attrs,
    [ROW_SLICE_START_ATTR]: start > 0 ? start : null,
    [ROW_SLICE_END_ATTR]: end,
  };
}

/** `attrs` without a row range: the whole list, as it is stored. */
export function withoutRowSlice(attrs: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const next = { ...attrs };
  delete next[ROW_SLICE_START_ATTR];
  delete next[ROW_SLICE_END_ATTR];
  return next;
}

export type RowSlicePosition = "whole" | "head" | "middle" | "tail";

export interface RowSliceView<Row> {
  /** The rows this copy draws, each with its index in the whole list. */
  rows: Array<{ row: Row; index: number }>;
  position: RowSlicePosition;
}

/** What a node view draws of `rows` for the node's row range. */
export function rowSliceView<Row>(rows: readonly Row[], attrs: Attrs): RowSliceView<Row> {
  const range = rowSliceRange(attrs);
  const from = Math.min(range.start, rows.length);
  const to = range.end === null ? rows.length : Math.min(Math.max(range.end, from), rows.length);
  return {
    rows: rows.slice(from, to).map((row, offset) => ({ row, index: from + offset })),
    position: rowSlicePosition(range),
  };
}

/** Which part of its list a copy with `range` draws. */
export function rowSlicePosition(range: RowSliceRange): RowSlicePosition {
  return range.start > 0 ? (range.end === null ? "tail" : "middle") : range.end === null ? "whole" : "head";
}

/** The wrapper stamp for a copy (absent on a whole list). */
export function rowSliceStamp(position: RowSlicePosition): string | undefined {
  return position === "whole" ? undefined : position;
}

// ---------------------------------------------------------------------------
// Storage boundary (pure JSON; used by mergeSplitContinuationsJson).
// ---------------------------------------------------------------------------

interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
}

/** A row-sliced atom whose JSON spells a row range key, set or not: the
 * editor writes both keys with their null default on every such node. */
export function hasRowSliceKeysJson(node: JsonNode | null | undefined): boolean {
  if (!node || !isRowSlicedAtomType(node.type) || !node.attrs) return false;
  return (
    Object.prototype.hasOwnProperty.call(node.attrs, ROW_SLICE_START_ATTR) ||
    Object.prototype.hasOwnProperty.call(node.attrs, ROW_SLICE_END_ATTR)
  );
}

export function isRowSliceTailJson(node: JsonNode | null | undefined): boolean {
  return Boolean(node) && isRowSlicedAtomType(node?.type) && rowSliceRange(node?.attrs).start > 0;
}
