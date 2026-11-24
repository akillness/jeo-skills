/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
  DOCUMENT_TABLE_MAX_COLUMNS,
  DOCUMENT_TABLE_MAX_ROWS,
  DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS,
  DOCUMENT_TABLE_MIN_COLUMNS,
  DOCUMENT_TABLE_MIN_ROWS,
  type DocumentTableLayoutMode,
  normalizeDocumentTableLayoutPolicy,
} from "./tableLayoutPolicy";

export const DOCUMENT_VIRTUAL_TABLE_NODE_NAME = "documentVirtualTable" as const;
export const DOCUMENT_VIRTUAL_TABLE_SCHEMA_VERSION = 1 as const;
export const DOCUMENT_VIRTUAL_TABLE_REPRESENTATION = "sparse_v1" as const;

// The server's sparse_v1 numbers (sparse_table_stream.MAX_*).
export const DOCUMENT_VIRTUAL_TABLE_MAX_SPARSE_CELLS = 100_000;
export const DOCUMENT_VIRTUAL_TABLE_MAX_CELL_TEXT_LENGTH = 32_767;
export const DOCUMENT_VIRTUAL_TABLE_MAX_TOTAL_TEXT_LENGTH = 16_000_000;
export const DOCUMENT_VIRTUAL_TABLE_MAX_ROW_OVERRIDES = 32_767;
export const DOCUMENT_VIRTUAL_TABLE_MAX_COLUMN_OVERRIDES =
  DOCUMENT_TABLE_MAX_COLUMNS;
export const DOCUMENT_VIRTUAL_TABLE_MAX_WINDOW_ROWS = 96;
export const DOCUMENT_VIRTUAL_TABLE_MAX_WINDOW_COLUMNS = 32;
export const DOCUMENT_VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT_PX = 28;
export const DOCUMENT_VIRTUAL_TABLE_DEFAULT_COLUMN_WIDTH_PX = 120;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_MAX_BYTES = 64 * 1024 * 1024;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_DOCUMENT_OVERHEAD_BYTES =
  16 * 1024;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_TABLE_OVERHEAD_BYTES = 4 * 1024;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_GRID_COLUMN_BYTES = 64;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_ROW_BYTES = 96;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_CELL_BYTES = 96;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_ROW_OVERRIDE_BYTES = 96;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_NONEMPTY_CELL_OVERHEAD_BYTES = 96;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_ORDINARY_NODE_BYTES = 4 * 1024;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_JSON_CONTAINER_BYTES = 512;
export const DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_STRING_EXPANSION = 16;

const TABLE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let fallbackTableIdSequence = 0;
const ATTR_KEYS = new Set([
  "schemaVersion",
  "representation",
  "tableId",
  "rows",
  "columns",
  "tableLayoutPolicy",
  "tableFixedWidthTwips",
  "cells",
  "rowOverrides",
  "columnOverrides",
  "formattingSimplified",
]);
/**
 * Node identity that the schema adds to every top-level block, this one
 * included since 146e4c34f4 (blockIds.ts MRNOTE_BLOCK_ID_ATTR and
 * MRNOTE_SOURCE_ATTR; the API read and write boundaries stamp `block_id` on
 * every top-level node). They are not sparse-table fields: a node carrying
 * them is still a valid table, and they never enter the normalized payload.
 * Literal names keep the DOCX worker free of the editor-extension import.
 */
const NODE_IDENTITY_ATTR_KEYS = new Set(["block_id", "source"]);
const MAX_NODE_BLOCK_ID_LENGTH = 128;

function acceptedNodeIdentityAttr(key: string, value: unknown): boolean {
  if (!NODE_IDENTITY_ATTR_KEYS.has(key)) return false;
  if (value === null || value === undefined) return true;
  if (key === "block_id") {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_NODE_BLOCK_ID_LENGTH
    );
  }
  return isRecord(value);
}

export interface DocumentVirtualTableCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
}

export interface DocumentVirtualTableSizeOverride {
  readonly index: number;
  readonly sizeTwips: number;
}

export interface DocumentVirtualTableAttrs {
  readonly schemaVersion: typeof DOCUMENT_VIRTUAL_TABLE_SCHEMA_VERSION;
  readonly representation: typeof DOCUMENT_VIRTUAL_TABLE_REPRESENTATION;
  readonly tableId: string;
  readonly rows: number;
  readonly columns: number;
  readonly tableLayoutPolicy: DocumentTableLayoutMode;
  readonly tableFixedWidthTwips: number | null;
  readonly cells: readonly DocumentVirtualTableCell[];
  readonly rowOverrides: readonly DocumentVirtualTableSizeOverride[];
  readonly columnOverrides: readonly DocumentVirtualTableSizeOverride[];
  /** A rich Word table past the dense budget, read as its text: read-only,
   * never written back (the server's `formatting_simplified`). */
  readonly formattingSimplified?: true;
}

export interface DocumentVirtualTableWindow {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly columnStart: number;
  readonly columnEnd: number;
  readonly mountedCellCount: number;
  readonly totalHeightPx: number;
  readonly totalWidthPx: number;
}

export interface DocumentVirtualTableAxis {
  readonly count: number;
  readonly defaultSizePx: number;
  readonly totalSizePx: number;
  offsetAt(index: number): number;
  sizeAt(index: number): number;
  indexAtOffset(offsetPx: number): number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function compareCell(
  left: Pick<DocumentVirtualTableCell, "row" | "column">,
  right: Pick<DocumentVirtualTableCell, "row" | "column">,
): number {
  return left.row - right.row || left.column - right.column;
}

function isXml10Text(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) return false;
    if (codePoint > 0xffff) index += 1;
    if (
      codePoint !== 0x09 &&
      codePoint !== 0x0a &&
      codePoint !== 0x0d &&
      !(codePoint >= 0x20 && codePoint <= 0xd7ff) &&
      !(codePoint >= 0xe000 && codePoint <= 0xfffd) &&
      !(codePoint >= 0x10000 && codePoint <= 0x10ffff)
    ) {
      return false;
    }
  }
  return true;
}

function escapedXmlUtf8ByteLength(value: string): number {
  const encoded = new TextEncoder().encode(value).byteLength;
  let expansion = 0;
  for (const character of value) {
    if (character === "&") expansion += 4;
    else if (character === "<" || character === ">") expansion += 3;
    else if (character === "\r") expansion += 4;
  }
  return encoded + expansion;
}

const DOCUMENT_VIRTUAL_TABLE_NATIVE_SIBLING_TYPES = new Set([
  "doc",
  "pageBlock",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "pageBreak",
  "columnBreak",
  "horizontalRule",
  "blockquote",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
  "codeBlock",
  // A sparse table may coexist with ordinary TipTap tables. Keep those nodes
  // inside the same conservative per-node/attrs budget instead of treating a
  // previously inserted dense table as an unknown native export shape.
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  DOCUMENT_VIRTUAL_TABLE_NODE_NAME,
]);

/**
 * Containers a sparse table may never sit inside. It is one Word body-level
 * table (`w:tbl` directly in `w:body`): the page-content schema, the API page
 * validator and the DOCX writer all refuse it under a quote, a list or another
 * table, so the editor must refuse to put it there in the first place.
 */
export const DOCUMENT_VIRTUAL_TABLE_FORBIDDEN_ANCESTORS: ReadonlySet<string> =
  new Set([
    "blockquote",
    "bulletList",
    "orderedList",
    "taskList",
    "listItem",
    "taskItem",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
  ]);

function containsDocumentVirtualTable(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === DOCUMENT_VIRTUAL_TABLE_NODE_NAME) return true;
  return (
    Array.isArray(value.content) &&
    value.content.some(containsDocumentVirtualTable)
  );
}

function checkedBudgetAdd(left: number, right: number): number | null {
  return Number.isSafeInteger(left) &&
    Number.isSafeInteger(right) &&
    left >= 0 &&
    right >= 0 &&
    left <= Number.MAX_SAFE_INTEGER - right
    ? left + right
    : null;
}

function estimateJsonScalarTreeBytes(value: unknown, depth = 0): number | null {
  if (depth > 40) return null;
  if (value === null || typeof value === "boolean") return 32;
  if (typeof value === "number") return Number.isFinite(value) ? 64 : null;
  if (typeof value === "string") {
    const escaped = escapedXmlUtf8ByteLength(value);
    return checkedBudgetAdd(
      64,
      escaped * DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_STRING_EXPANSION,
    );
  }
  if (Array.isArray(value)) {
    let estimate = DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_JSON_CONTAINER_BYTES;
    for (const item of value) {
      const itemBytes = estimateJsonScalarTreeBytes(item, depth + 1);
      if (itemBytes === null) return null;
      const next = checkedBudgetAdd(estimate, itemBytes);
      if (next === null) return null;
      estimate = next;
    }
    return estimate;
  }
  if (!isRecord(value)) return null;
  let estimate = DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_JSON_CONTAINER_BYTES;
  for (const [key, item] of Object.entries(value)) {
    const keyBytes = estimateJsonScalarTreeBytes(key, depth + 1);
    const itemBytes = estimateJsonScalarTreeBytes(item, depth + 1);
    if (keyBytes === null || itemBytes === null) return null;
    const withKey = checkedBudgetAdd(estimate, keyBytes);
    if (withKey === null) return null;
    const withItem = checkedBudgetAdd(withKey, itemBytes);
    if (withItem === null) return null;
    estimate = withItem;
  }
  return estimate;
}

/**
 * Conservative complete ``word/document.xml`` budget for pages containing a
 * sparse table.  Ordinary pages bypass this contract.  The accepted sibling
 * grammar is deliberately closed; every accepted node pays a 4 KiB structural
 * envelope plus 16x its escaped scalar payload (greater than XML's worst
 * single-scalar expansion, including CR -> ``&#13;``).  Unknown/complex block
 * types fail closed instead of relying on a fixed residual reserve.
 */
export function estimateDocumentWithVirtualTablesNativeXmlBytes(
  value: unknown,
): number | null {
  if (!containsDocumentVirtualTable(value)) return 0;
  if (!isRecord(value) || value.type !== "doc") return null;
  let estimate = DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_DOCUMENT_OVERHEAD_BYTES;

  const visit = (candidate: unknown, depth: number): boolean => {
    if (depth > 40 || !isRecord(candidate)) return false;
    const type = candidate.type;
    if (
      typeof type !== "string" ||
      !DOCUMENT_VIRTUAL_TABLE_NATIVE_SIBLING_TYPES.has(type)
    ) {
      return false;
    }
    if (type === DOCUMENT_VIRTUAL_TABLE_NODE_NAME) {
      const attrs = normalizeDocumentVirtualTableAttrs(candidate.attrs);
      if (
        !attrs ||
        candidate.text !== undefined ||
        candidate.content !== undefined
      ) {
        return false;
      }
      const tableBytes = estimateDocumentVirtualTableNativeTableXmlBytes(attrs);
      if (tableBytes === null) return false;
      const next = checkedBudgetAdd(estimate, tableBytes);
      if (next === null) return false;
      estimate = next;
      return true;
    }

    const structural = checkedBudgetAdd(
      estimate,
      DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_ORDINARY_NODE_BYTES,
    );
    if (structural === null) return false;
    estimate = structural;
    for (const key of ["attrs", "marks"] as const) {
      if (candidate[key] === undefined) continue;
      const bytes = estimateJsonScalarTreeBytes(candidate[key]);
      if (bytes === null) return false;
      const next = checkedBudgetAdd(estimate, bytes);
      if (next === null) return false;
      estimate = next;
    }
    if (candidate.text !== undefined) {
      if (typeof candidate.text !== "string") return false;
      const bytes =
        escapedXmlUtf8ByteLength(candidate.text) *
        DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_STRING_EXPANSION;
      const next = checkedBudgetAdd(estimate, bytes);
      if (next === null) return false;
      estimate = next;
    }
    if (candidate.content !== undefined) {
      if (!Array.isArray(candidate.content)) return false;
      for (const child of candidate.content) {
        if (!visit(child, depth + 1)) return false;
      }
    }
    return true;
  };

  return visit(value, 0) ? estimate : null;
}

export function estimateDocumentVirtualTableNativeTableXmlBytes(
  attrs: Pick<
    DocumentVirtualTableAttrs,
    "rows" | "columns" | "cells" | "rowOverrides"
  >,
): number | null {
  const cellCount = attrs.rows * attrs.columns;
  if (!Number.isSafeInteger(cellCount)) return null;
  let estimate = DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_TABLE_OVERHEAD_BYTES;
  const add = (count: number, unit: number): boolean => {
    const value = count * unit;
    if (
      !Number.isSafeInteger(value) ||
      estimate > Number.MAX_SAFE_INTEGER - value
    )
      return false;
    estimate += value;
    return true;
  };
  if (
    !add(attrs.columns, DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_GRID_COLUMN_BYTES) ||
    !add(attrs.rows, DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_ROW_BYTES) ||
    !add(cellCount, DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_CELL_BYTES) ||
    !add(
      attrs.rowOverrides.length,
      DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_ROW_OVERRIDE_BYTES,
    ) ||
    !add(
      attrs.cells.length,
      DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_NONEMPTY_CELL_OVERHEAD_BYTES,
    )
  ) {
    return null;
  }
  for (const cell of attrs.cells) {
    const bytes = escapedXmlUtf8ByteLength(cell.text);
    if (estimate > Number.MAX_SAFE_INTEGER - bytes) return null;
    estimate += bytes;
  }
  return estimate;
}

function normalizeCells(
  value: unknown,
  rows: number,
  columns: number,
): readonly DocumentVirtualTableCell[] | null {
  if (
    !Array.isArray(value) ||
    value.length > DOCUMENT_VIRTUAL_TABLE_MAX_SPARSE_CELLS
  ) {
    return null;
  }
  let totalTextLength = 0;
  const cells: DocumentVirtualTableCell[] = [];
  const coordinates = new Set<string>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some(
        (key) => key !== "row" && key !== "column" && key !== "text",
      ) ||
      !isBoundedInteger(candidate.row, 0, rows - 1) ||
      !isBoundedInteger(candidate.column, 0, columns - 1) ||
      typeof candidate.text !== "string" ||
      candidate.text.length < 1 ||
      candidate.text.length > DOCUMENT_VIRTUAL_TABLE_MAX_CELL_TEXT_LENGTH ||
      !isXml10Text(candidate.text)
    ) {
      return null;
    }
    totalTextLength += candidate.text.length;
    if (totalTextLength > DOCUMENT_VIRTUAL_TABLE_MAX_TOTAL_TEXT_LENGTH) {
      return null;
    }
    const coordinate = `${candidate.row}:${candidate.column}`;
    if (coordinates.has(coordinate)) return null;
    coordinates.add(coordinate);
    cells.push({
      row: candidate.row,
      column: candidate.column,
      text: candidate.text,
    });
  }
  return cells.sort(compareCell);
}

function normalizeSizeOverrides(
  value: unknown,
  count: number,
  maximumItems: number,
): readonly DocumentVirtualTableSizeOverride[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const overrides: DocumentVirtualTableSizeOverride[] = [];
  const indexes = new Set<number>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some(
        (key) => key !== "index" && key !== "sizeTwips",
      ) ||
      !isBoundedInteger(candidate.index, 0, count - 1) ||
      !isBoundedInteger(
        candidate.sizeTwips,
        1,
        DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS,
      ) ||
      indexes.has(candidate.index)
    ) {
      return null;
    }
    indexes.add(candidate.index);
    overrides.push({
      index: candidate.index,
      sizeTwips: candidate.sizeTwips,
    });
  }
  return overrides.sort((left, right) => left.index - right.index);
}

export function normalizeDocumentVirtualTableAttrs(
  value: unknown,
): DocumentVirtualTableAttrs | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        !ATTR_KEYS.has(key) && !acceptedNodeIdentityAttr(key, value[key]),
    ) ||
    value.schemaVersion !== DOCUMENT_VIRTUAL_TABLE_SCHEMA_VERSION ||
    value.representation !== DOCUMENT_VIRTUAL_TABLE_REPRESENTATION ||
    (value.formattingSimplified !== undefined &&
      value.formattingSimplified !== null &&
      value.formattingSimplified !== true) ||
    typeof value.tableId !== "string" ||
    !TABLE_ID_PATTERN.test(value.tableId) ||
    !isBoundedInteger(
      value.rows,
      DOCUMENT_TABLE_MIN_ROWS,
      DOCUMENT_TABLE_MAX_ROWS,
    ) ||
    !isBoundedInteger(
      value.columns,
      DOCUMENT_TABLE_MIN_COLUMNS,
      DOCUMENT_TABLE_MAX_COLUMNS,
    )
  ) {
    return null;
  }

  const policy = normalizeDocumentTableLayoutPolicy({
    schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
    mode: value.tableLayoutPolicy,
    fixedWidthTwips: value.tableFixedWidthTwips,
  });
  if (
    !policy ||
    (policy.mode === "initial_fixed" &&
      (policy.fixedWidthTwips ?? 0) * value.columns >
        DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS) ||
    (policy.mode !== "initial_fixed" && value.tableFixedWidthTwips !== null)
  ) {
    return null;
  }

  const cells = normalizeCells(value.cells, value.rows, value.columns);
  const rowOverrides = normalizeSizeOverrides(
    value.rowOverrides,
    value.rows,
    DOCUMENT_VIRTUAL_TABLE_MAX_ROW_OVERRIDES,
  );
  const columnOverrides = normalizeSizeOverrides(
    value.columnOverrides,
    value.columns,
    DOCUMENT_VIRTUAL_TABLE_MAX_COLUMN_OVERRIDES,
  );
  if (!cells || !rowOverrides || !columnOverrides) return null;

  const normalized: DocumentVirtualTableAttrs = {
    schemaVersion: DOCUMENT_VIRTUAL_TABLE_SCHEMA_VERSION,
    representation: DOCUMENT_VIRTUAL_TABLE_REPRESENTATION,
    tableId: value.tableId,
    rows: value.rows,
    columns: value.columns,
    tableLayoutPolicy: policy.mode,
    tableFixedWidthTwips:
      policy.mode === "initial_fixed" ? (policy.fixedWidthTwips ?? null) : null,
    cells,
    rowOverrides,
    columnOverrides,
    ...(value.formattingSimplified === true ? { formattingSimplified: true as const } : {}),
  };
  const nativeXmlBytes =
    estimateDocumentVirtualTableNativeTableXmlBytes(normalized);
  if (
    nativeXmlBytes === null ||
    nativeXmlBytes +
      DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_DOCUMENT_OVERHEAD_BYTES >=
      DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_MAX_BYTES
  ) {
    return null;
  }
  return normalized;
}

export function isPersistableDocumentVirtualTableAttrs(
  value: unknown,
): value is DocumentVirtualTableAttrs {
  return normalizeDocumentVirtualTableAttrs(value) !== null;
}

function fallbackTableId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    fallbackTableIdSequence = (fallbackTableIdSequence + 1) >>> 0;
    let seed = BigInt(Date.now()) ^ BigInt(fallbackTableIdSequence);
    for (let index = 0; index < bytes.length; index += 1) {
      seed =
        (seed * 6364136223846793005n + 1442695040888963407n) &
        0xffffffffffffffffn;
      bytes[index] = Number(seed & 0xffn);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

/**
 * A column's width before its own override: the Fixed column width Insert
 * Table set (tableFixedWidthTwips is per column, 15 twips a CSS px), else the
 * default. Every column axis the table draws or scrolls by starts here.
 */
export function documentVirtualTableColumnWidthPx(
  attrs: Pick<DocumentVirtualTableAttrs, "tableLayoutPolicy" | "tableFixedWidthTwips">,
): number {
  return attrs.tableLayoutPolicy === "initial_fixed" &&
    typeof attrs.tableFixedWidthTwips === "number" &&
    attrs.tableFixedWidthTwips > 0
    ? attrs.tableFixedWidthTwips / 15
    : DOCUMENT_VIRTUAL_TABLE_DEFAULT_COLUMN_WIDTH_PX;
}

export function createDocumentVirtualTableAttrs(input: {
  readonly rows: number;
  readonly columns: number;
  readonly tableLayoutPolicy: DocumentTableLayoutMode;
  readonly tableFixedWidthTwips?: number | null;
  readonly tableId?: string;
}): DocumentVirtualTableAttrs | null {
  const tableId =
    input.tableId ?? globalThis.crypto?.randomUUID?.() ?? fallbackTableId();
  return normalizeDocumentVirtualTableAttrs({
    schemaVersion: DOCUMENT_VIRTUAL_TABLE_SCHEMA_VERSION,
    representation: DOCUMENT_VIRTUAL_TABLE_REPRESENTATION,
    tableId: tableId.toLowerCase(),
    rows: input.rows,
    columns: input.columns,
    tableLayoutPolicy: input.tableLayoutPolicy,
    tableFixedWidthTwips: input.tableFixedWidthTwips ?? null,
    cells: [],
    rowOverrides: [],
    columnOverrides: [],
  });
}

function cellInsertionIndex(
  cells: readonly DocumentVirtualTableCell[],
  row: number,
  column: number,
): number {
  let low = 0;
  let high = cells.length;
  const target = { row, column };
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareCell(cells[middle], target) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function documentVirtualTableCellText(
  attrs: DocumentVirtualTableAttrs,
  row: number,
  column: number,
): string {
  const index = cellInsertionIndex(attrs.cells, row, column);
  const cell = attrs.cells[index];
  return cell?.row === row && cell.column === column ? cell.text : "";
}

export function updateDocumentVirtualTableCell(
  value: unknown,
  row: number,
  column: number,
  text: string,
): DocumentVirtualTableAttrs | null {
  const attrs = normalizeDocumentVirtualTableAttrs(value);
  if (
    !attrs ||
    !isBoundedInteger(row, 0, attrs.rows - 1) ||
    !isBoundedInteger(column, 0, attrs.columns - 1) ||
    typeof text !== "string" ||
    text.length > DOCUMENT_VIRTUAL_TABLE_MAX_CELL_TEXT_LENGTH
  ) {
    return null;
  }
  const cells = [...attrs.cells];
  const index = cellInsertionIndex(cells, row, column);
  const exists = cells[index]?.row === row && cells[index]?.column === column;
  if (!text) {
    if (exists) cells.splice(index, 1);
  } else if (exists) {
    cells[index] = { row, column, text };
  } else {
    if (cells.length >= DOCUMENT_VIRTUAL_TABLE_MAX_SPARSE_CELLS) return null;
    cells.splice(index, 0, { row, column, text });
  }
  return normalizeDocumentVirtualTableAttrs({ ...attrs, cells });
}

function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function createDocumentVirtualTableAxis(
  count: number,
  defaultSizePx: number,
  overrides: readonly DocumentVirtualTableSizeOverride[],
): DocumentVirtualTableAxis {
  const safeCount = Math.max(1, Math.trunc(count));
  const safeDefault = Math.max(1, defaultSizePx);
  const indexes: number[] = [];
  const sizes = new Map<number, number>();
  const prefixDeltas: number[] = [];
  let deltaTotal = 0;
  for (const override of overrides) {
    if (override.index < 0 || override.index >= safeCount) continue;
    const sizePx = Math.max(1, override.sizeTwips / 15);
    indexes.push(override.index);
    sizes.set(override.index, sizePx);
    deltaTotal += sizePx - safeDefault;
    prefixDeltas.push(deltaTotal);
  }
  const deltaBefore = (index: number): number => {
    const end = upperBound(indexes, index - 1);
    return end === 0 ? 0 : prefixDeltas[end - 1];
  };
  const offsetAt = (index: number): number => {
    const bounded = Math.min(Math.max(Math.trunc(index), 0), safeCount);
    return bounded * safeDefault + deltaBefore(bounded);
  };
  const sizeAt = (index: number): number =>
    sizes.get(Math.min(Math.max(Math.trunc(index), 0), safeCount - 1)) ??
    safeDefault;
  const totalSizePx = offsetAt(safeCount);
  const indexAtOffset = (offsetPx: number): number => {
    const target = Math.min(
      Math.max(offsetPx, 0),
      Math.max(0, totalSizePx - 1),
    );
    let low = 0;
    let high = safeCount - 1;
    while (low < high) {
      const middle = (low + high + 1) >>> 1;
      if (offsetAt(middle) <= target) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  return {
    count: safeCount,
    defaultSizePx: safeDefault,
    totalSizePx,
    offsetAt,
    sizeAt,
    indexAtOffset,
  };
}

function boundedWindowRange(
  start: number,
  end: number,
  count: number,
  maximum: number,
): readonly [number, number] {
  let rangeStart = Math.max(0, Math.min(start, count - 1));
  let rangeEnd = Math.max(rangeStart + 1, Math.min(end, count));
  if (rangeEnd - rangeStart > maximum) rangeEnd = rangeStart + maximum;
  if (rangeEnd > count) {
    rangeEnd = count;
    rangeStart = Math.max(0, rangeEnd - maximum);
  }
  return [rangeStart, rangeEnd];
}

export function computeDocumentVirtualTableWindow(input: {
  readonly attrs: DocumentVirtualTableAttrs;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
  readonly overscan?: number;
}): DocumentVirtualTableWindow {
  const rowAxis = createDocumentVirtualTableAxis(
    input.attrs.rows,
    DOCUMENT_VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT_PX,
    input.attrs.rowOverrides,
  );
  const columnAxis = createDocumentVirtualTableAxis(
    input.attrs.columns,
    documentVirtualTableColumnWidthPx(input.attrs),
    input.attrs.columnOverrides,
  );
  const overscan = Math.min(Math.max(Math.trunc(input.overscan ?? 2), 0), 8);
  const [rowStart, rowEnd] = boundedWindowRange(
    rowAxis.indexAtOffset(input.scrollTop) - overscan,
    rowAxis.indexAtOffset(input.scrollTop + input.viewportHeight) +
      overscan +
      1,
    input.attrs.rows,
    DOCUMENT_VIRTUAL_TABLE_MAX_WINDOW_ROWS,
  );
  const [columnStart, columnEnd] = boundedWindowRange(
    columnAxis.indexAtOffset(input.scrollLeft) - overscan,
    columnAxis.indexAtOffset(input.scrollLeft + input.viewportWidth) +
      overscan +
      1,
    input.attrs.columns,
    DOCUMENT_VIRTUAL_TABLE_MAX_WINDOW_COLUMNS,
  );
  return {
    rowStart,
    rowEnd,
    columnStart,
    columnEnd,
    mountedCellCount: (rowEnd - rowStart) * (columnEnd - columnStart),
    totalHeightPx: rowAxis.totalSizePx,
    totalWidthPx: columnAxis.totalSizePx,
  };
}
