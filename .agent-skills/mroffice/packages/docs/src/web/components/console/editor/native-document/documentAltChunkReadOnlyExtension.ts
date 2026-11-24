"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import React, { type CSSProperties, type ReactElement } from "react";
import { mergeAttributes, Node as TipTapNode } from "@tiptap/core";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { MRNOTE_BLOCK_IDENTITY_META } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import {
  PAGE_ROWS_ROOT_ATTR,
  PAGE_ROW_ATTR,
  PAGE_ROW_CONTINUED_ATTR,
  PAGE_ROW_CONTINUES_ATTR,
  PAGE_ROW_SLICE_ATTR,
  ROW_SLICE_END_ATTR,
  ROW_SLICE_INTEGRITY_META,
  ROW_SLICE_START_ATTR,
  isRowSliceTail,
  rowSlicePosition,
  rowSliceRange,
  rowSliceStamp,
  type RowSlicePosition,
  type RowSliceRange,
} from "@mrnote/core/web/components/console/editor/native-document/paged/atomRowSlices.ts";
import { updateRowSlicedNodeView } from "@mrnote/core/web/components/console/editor/native-document/paged/rowSliceNodeView.ts";
import { textRowChunks } from "./paged/textRowChunks";
import { READ_ONLY_TRUSTED_MUTATION_META } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";

export const DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME = "documentAltChunkReadOnly";

const SERIALIZED_ATTR = "data-altchunk-read-only-carrier";
const SHA256_RE = /^[0-9a-f]{64}$/;
const CARRIER_ID_RE = /^docx-altchunk-[0-9a-f]{24}$/;
const RELATIONSHIP_ID_RE = /^[A-Za-z_][A-Za-z0-9_.:-]{0,254}$/;
const RELATIONSHIP_TYPES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/afChunk",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk",
]);
// A plain-text chunk is Word's too: it imports the text as its lines (corpus R81-D29),
// and a web archive (MHTML) as its HTML document (corpus R495-D04).
const CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml", "text/plain", "message/rfc822"]);
const LOSS_REASONS = new Set([
  "altchunk_html_hidden_subtree_omitted",
  "altchunk_html_image_omitted",
  "altchunk_html_inline_format_simplified",
  "altchunk_html_inline_style_ignored",
  "altchunk_html_link_or_media_target_omitted",
  "altchunk_html_nested_list_simplified",
  "altchunk_html_table_span_simplified",
  "altchunk_html_unknown_element_simplified",
]);
const ALLOWED_ATTRS = new Set([
  "schemaVersion",
  "disposition",
  "carrierId",
  "fingerprint",
  "relationshipId",
  "relationshipType",
  "partName",
  "contentType",
  "blocks",
  "lossReasons",
  "nativePayload",
  "source",
  "block_id",
  // Which rows a copy on a later page draws (paged/atomRowSlices): layout
  // state of this view, like block_id no part of the carrier. The
  // normalised carrier never holds them.
  ROW_SLICE_START_ATTR,
  ROW_SLICE_END_ATTR,
]);
/**
 * The chunk part's own bytes, base64, exactly as the import read them: what
 * the server's whole-document Word writer puts back. This client never
 * decodes, renders, copies or sends them anywhere -- the card draws `blocks`,
 * the HTML serialization and the Copilot copy leave them out -- and a save
 * whose bytes no longer project the card loses them (server custody).
 */
const NATIVE_PAYLOAD_MAX_CHARS = 1_000_000;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SOURCE_ATTRS = new Set([
  "adapter",
  "nodeType",
  "sourceAnchor",
  "nodeId",
  "partName",
  "relationshipId",
]);
const TEXT_BLOCK_KINDS = new Set(["paragraph", "heading", "blockquote", "pre"]);
const LIST_BLOCK_KINDS = new Set(["unordered_list", "ordered_list"]);
const MAX_TOTAL_VISIBLE_CHARS = 1_000_000;
const MAX_TOTAL_LIST_ITEMS = 2_048;
const MAX_TOTAL_TABLE_ROWS = 512;
const MAX_TOTAL_TABLE_CELLS = 4_096;
/** A picture a web archive chunk holds itself (server reading generation
 * 321, altchunk_html._picture_block): PNG, JPEG or GIF bytes, base64, drawn
 * at the size Word draws it. The card builds the data URL from the kind it
 * names; the block holds no URL of its own. */
const PICTURE_FORMATS = new Set(["png", "jpeg", "gif"]);
const PICTURE_MAX_CHARS = 1_000_000;
const MAX_TOTAL_PICTURE_CHARS = 4_000_000;
const PICTURE_MAX_SIDE = 10_000;
/** The leading bytes of each picture kind, base64 of its signature. */
const PICTURE_SIGNATURE_PREFIXES: Record<string, readonly string[]> = {
  png: ["iVBORw0KGgo"],
  jpeg: ["/9j/"],
  gif: ["R0lGODdh", "R0lGODlh"],
};

interface AltChunkTextBlock {
  readonly kind: "paragraph" | "heading" | "blockquote" | "pre";
  readonly text: string;
  readonly level?: number;
}

interface AltChunkListBlock {
  readonly kind: "unordered_list" | "ordered_list";
  readonly items: readonly string[];
}

interface AltChunkTableCell {
  readonly kind: "header" | "data";
  readonly text: string;
}

interface AltChunkTableBlock {
  readonly kind: "table";
  readonly rows: readonly (readonly AltChunkTableCell[])[];
  readonly caption?: string;
}

interface AltChunkHorizontalRuleBlock {
  readonly kind: "horizontal_rule";
}

interface AltChunkPictureBlock {
  readonly kind: "image";
  readonly format: "png" | "jpeg" | "gif";
  readonly data: string;
  readonly width: number;
  readonly height: number;
}

export type DocumentAltChunkBlock =
  | AltChunkTextBlock
  | AltChunkListBlock
  | AltChunkTableBlock
  | AltChunkHorizontalRuleBlock
  | AltChunkPictureBlock;

export interface DocumentAltChunkSource {
  readonly adapter: "docx";
  readonly nodeType: "altChunk";
  readonly sourceAnchor: string;
  readonly nodeId: string;
  readonly partName: string;
  readonly relationshipId: string;
}

export interface DocumentAltChunkReadOnlyAttrs {
  readonly schemaVersion: 1;
  readonly disposition: "preserve-only";
  readonly carrierId: string;
  readonly fingerprint: string;
  readonly relationshipId: string;
  readonly relationshipType: string;
  readonly partName: string;
  readonly contentType: "text/html" | "application/xhtml+xml" | "text/plain" | "message/rfc822";
  readonly blocks: readonly DocumentAltChunkBlock[];
  readonly lossReasons: readonly string[];
  readonly nativePayload?: string;
  readonly source: DocumentAltChunkSource;
}

export interface DocumentAltChunkReadOnlyLabels {
  readonly label: string;
  readonly description: string;
  readonly simplified: string;
  readonly invalid: string;
}

interface DocumentAltChunkReadOnlyOptions {
  readonly labels: DocumentAltChunkReadOnlyLabels;
}

const DEFAULT_LABELS: DocumentAltChunkReadOnlyLabels = {
  label: "Imported HTML",
  description: "Read-only content preserved in the original Word file",
  simplified:
    "Some unsupported formatting or hidden content was omitted from this view.",
  invalid: "This imported content cannot be displayed safely.",
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeText(
  value: unknown,
  maximum: number,
  allowMultiline = false,
): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    return null;
  }
  if (
    [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      if (code >= 0x7f && code <= 0x9f) return true;
      if (code >= 0x20) return false;
      return !(allowMultiline && (character === "\n" || character === "\t"));
    })
  ) {
    return null;
  }
  return value;
}

function safePartName(value: unknown): string | null {
  const partName = safeText(value, 1_024);
  if (
    !partName ||
    partName.startsWith("/") ||
    partName.includes("\\") ||
    partName.includes("?") ||
    partName.includes("#") ||
    partName
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }
  return partName;
}

function normalizeSource(value: unknown): DocumentAltChunkSource | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, SOURCE_ATTRS)) return null;
  const sourceAnchor = safeText(value.sourceAnchor, 1_024);
  const nodeId = safeText(value.nodeId, 255);
  const partName = safePartName(value.partName);
  const relationshipId = safeText(value.relationshipId, 255);
  if (
    value.adapter !== "docx" ||
    value.nodeType !== "altChunk" ||
    !sourceAnchor ||
    !nodeId ||
    !partName ||
    !relationshipId
  ) {
    return null;
  }
  const suffix = `#altChunk[${relationshipId}]`;
  if (
    !sourceAnchor.endsWith(suffix) ||
    !safePartName(sourceAnchor.slice(0, -suffix.length))
  ) {
    return null;
  }
  return {
    adapter: "docx",
    nodeType: "altChunk",
    sourceAnchor,
    nodeId,
    partName,
    relationshipId,
  };
}

function normalizeBlock(value: unknown): DocumentAltChunkBlock | null {
  if (!isPlainRecord(value) || typeof value.kind !== "string") return null;
  if (TEXT_BLOCK_KINDS.has(value.kind)) {
    const allowed =
      value.kind === "heading"
        ? new Set(["kind", "text", "level"])
        : new Set(["kind", "text"]);
    const text = safeText(value.text, 65_536, true);
    if (!hasOnlyKeys(value, allowed) || !text) return null;
    if (value.kind === "heading") {
      if (
        !Number.isInteger(value.level) ||
        Number(value.level) < 1 ||
        Number(value.level) > 6
      ) {
        return null;
      }
      return { kind: "heading", text, level: Number(value.level) };
    }
    return { kind: value.kind as AltChunkTextBlock["kind"], text };
  }
  if (LIST_BLOCK_KINDS.has(value.kind)) {
    if (
      !hasOnlyKeys(value, new Set(["kind", "items"])) ||
      !Array.isArray(value.items) ||
      value.items.length < 1 ||
      value.items.length > 2_048
    ) {
      return null;
    }
    const items = value.items.map((item) => safeText(item, 65_536, true));
    if (items.some((item) => item === null)) return null;
    return {
      kind: value.kind as AltChunkListBlock["kind"],
      items: items as string[],
    };
  }
  if (value.kind === "table") {
    if (
      !hasOnlyKeys(value, new Set(["kind", "rows", "caption"])) ||
      !Array.isArray(value.rows) ||
      value.rows.length < 1 ||
      value.rows.length > 512
    ) {
      return null;
    }
    const rows: AltChunkTableCell[][] = [];
    for (const rawRow of value.rows) {
      if (!Array.isArray(rawRow) || rawRow.length < 1 || rawRow.length > 64) {
        return null;
      }
      const row: AltChunkTableCell[] = [];
      for (const rawCell of rawRow) {
        if (
          !isPlainRecord(rawCell) ||
          !hasOnlyKeys(rawCell, new Set(["kind", "text"])) ||
          (rawCell.kind !== "header" && rawCell.kind !== "data")
        ) {
          return null;
        }
        const text =
          rawCell.text === "" ? "" : safeText(rawCell.text, 16_384, true);
        if (text === null) return null;
        row.push({ kind: rawCell.kind, text });
      }
      rows.push(row);
    }
    const caption =
      value.caption === undefined
        ? undefined
        : safeText(value.caption, 65_536, true);
    if (caption === null) return null;
    return { kind: "table", rows, ...(caption ? { caption } : {}) };
  }
  if (
    value.kind === "horizontal_rule" &&
    hasOnlyKeys(value, new Set(["kind"]))
  ) {
    return { kind: "horizontal_rule" };
  }
  if (value.kind === "image") {
    const side = (raw: unknown): number | null =>
      Number.isInteger(raw) && Number(raw) >= 1 && Number(raw) <= PICTURE_MAX_SIDE
        ? Number(raw)
        : null;
    const width = side(value.width);
    const height = side(value.height);
    if (
      !hasOnlyKeys(value, new Set(["kind", "format", "data", "width", "height"])) ||
      typeof value.format !== "string" ||
      !PICTURE_FORMATS.has(value.format) ||
      typeof value.data !== "string" ||
      value.data.length < 4 ||
      value.data.length > PICTURE_MAX_CHARS ||
      !BASE64_RE.test(value.data) ||
      !(PICTURE_SIGNATURE_PREFIXES[value.format] ?? []).some((prefix) =>
        (value.data as string).startsWith(prefix),
      ) ||
      width === null ||
      height === null
    ) {
      return null;
    }
    return {
      kind: "image",
      format: value.format as AltChunkPictureBlock["format"],
      data: value.data,
      width,
      height,
    };
  }
  return null;
}

interface CanonicalBlockBudget {
  pictureCharacters: number;
  characters: number;
  listItems: number;
  tableRows: number;
  tableCells: number;
}

function addCanonicalBlockToBudget(
  block: DocumentAltChunkBlock,
  budget: CanonicalBlockBudget,
): boolean {
  if ("text" in block) budget.characters += block.text.length;
  if (block.kind === "image") budget.pictureCharacters += block.data.length;
  if (block.kind === "ordered_list" || block.kind === "unordered_list") {
    budget.listItems += block.items.length;
    budget.characters += block.items.reduce(
      (total, item) => total + item.length,
      0,
    );
  } else if (block.kind === "table") {
    budget.tableRows += block.rows.length;
    budget.tableCells += block.rows.reduce(
      (total, row) => total + row.length,
      0,
    );
    budget.characters += block.caption?.length ?? 0;
    budget.characters += block.rows.reduce(
      (total, row) =>
        total + row.reduce((rowTotal, cell) => rowTotal + cell.text.length, 0),
      0,
    );
  }
  return (
    budget.pictureCharacters <= MAX_TOTAL_PICTURE_CHARS &&
    budget.characters <= MAX_TOTAL_VISIBLE_CHARS &&
    budget.listItems <= MAX_TOTAL_LIST_ITEMS &&
    budget.tableRows <= MAX_TOTAL_TABLE_ROWS &&
    budget.tableCells <= MAX_TOTAL_TABLE_CELLS
  );
}

/** Closed client mirror of the server carrier; no raw HTML, URL or CSS keys. */
export function normalizeDocumentAltChunkReadOnlyAttrs(
  value: unknown,
): DocumentAltChunkReadOnlyAttrs | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ALLOWED_ATTRS)) return null;
  const carrierId = safeText(value.carrierId, 64);
  const fingerprint = safeText(value.fingerprint, 64);
  const relationshipId = safeText(value.relationshipId, 255);
  const relationshipType = safeText(value.relationshipType, 512);
  const partName = safePartName(value.partName);
  const source = normalizeSource(value.source);
  if (
    value.schemaVersion !== 1 ||
    value.disposition !== "preserve-only" ||
    !carrierId ||
    !CARRIER_ID_RE.test(carrierId) ||
    !fingerprint ||
    !SHA256_RE.test(fingerprint) ||
    carrierId !== `docx-altchunk-${fingerprint.slice(0, 24)}` ||
    !relationshipId ||
    !RELATIONSHIP_ID_RE.test(relationshipId) ||
    !relationshipType ||
    !RELATIONSHIP_TYPES.has(relationshipType) ||
    !partName ||
    typeof value.contentType !== "string" ||
    !CONTENT_TYPES.has(value.contentType) ||
    !Array.isArray(value.blocks) ||
    value.blocks.length < 1 ||
    value.blocks.length > 2_048 ||
    !Array.isArray(value.lossReasons) ||
    value.lossReasons.length > 32 ||
    !source ||
    source.relationshipId !== relationshipId ||
    source.partName !== partName
  ) {
    return null;
  }
  const canonicalBlocks: DocumentAltChunkBlock[] = [];
  const budget: CanonicalBlockBudget = {
    pictureCharacters: 0,
    characters: 0,
    listItems: 0,
    tableRows: 0,
    tableCells: 0,
  };
  for (const rawBlock of value.blocks) {
    const block = normalizeBlock(rawBlock);
    if (!block || !addCanonicalBlockToBudget(block, budget)) return null;
    canonicalBlocks.push(block);
  }
  const lossReasons = value.lossReasons.filter(
    (reason): reason is string =>
      typeof reason === "string" && LOSS_REASONS.has(reason),
  );
  if (lossReasons.length !== value.lossReasons.length) return null;
  const rawPayload = value.nativePayload ?? null;
  if (
    rawPayload !== null &&
    (typeof rawPayload !== "string" ||
      rawPayload.length === 0 ||
      rawPayload.length > NATIVE_PAYLOAD_MAX_CHARS ||
      !BASE64_RE.test(rawPayload))
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    disposition: "preserve-only",
    carrierId,
    fingerprint,
    relationshipId,
    relationshipType,
    partName,
    contentType:
      value.contentType as DocumentAltChunkReadOnlyAttrs["contentType"],
    blocks: canonicalBlocks,
    lossReasons: Array.from(new Set(lossReasons)).sort(),
    ...(rawPayload !== null ? { nativePayload: rawPayload } : {}),
    source,
  };
}

interface CanonicalCarrier {
  readonly attrs: DocumentAltChunkReadOnlyAttrs;
  readonly serialized: string;
}

/**
 * The canonical carrier a node's attributes spell, or null for an invalid
 * one. ProseMirror never changes a node's attribute object, and a node the
 * document keeps across transactions keeps its object: the check (every
 * character of the content) and its JSON are worked out once per node, not
 * once per transaction and per copy on a later page.
 */
const canonicalCarriers = new WeakMap<object, CanonicalCarrier | null>();

function canonicalCarrier(nodeAttrs: unknown): CanonicalCarrier | null {
  if (typeof nodeAttrs !== "object" || nodeAttrs === null) return null;
  const known = canonicalCarriers.get(nodeAttrs);
  if (known !== undefined) return known;
  const attrs = normalizeDocumentAltChunkReadOnlyAttrs(nodeAttrs);
  const canonical = attrs ? { attrs, serialized: JSON.stringify(attrs) } : null;
  canonicalCarriers.set(nodeAttrs, canonical);
  return canonical;
}

const INVALID_CARRIER = "invalid-carrier";

function withoutNativePayload(
  attrs: DocumentAltChunkReadOnlyAttrs,
): DocumentAltChunkReadOnlyAttrs {
  const shown = { ...attrs };
  delete (shown as { nativePayload?: string }).nativePayload;
  return shown;
}

function parseSerializedAttrs(
  element: HTMLElement,
): Record<string, unknown> | false {
  const serialized = element.getAttribute(SERIALIZED_ATTR);
  if (!serialized || serialized.length > 1_000_000) return false;
  try {
    const normalized = normalizeDocumentAltChunkReadOnlyAttrs(
      JSON.parse(serialized),
    );
    return normalized ? { ...normalized } : false;
  } catch {
    return false;
  }
}

const CARD_BORDER_COLOR = "#cbd5e1";
const CARD_RADIUS_PX = 8;
const CARD_MARGIN_PX = 12;

const cardStyle: CSSProperties = {
  boxSizing: "border-box",
  maxWidth: "100%",
  margin: `${CARD_MARGIN_PX}px 0`,
  padding: "12px 14px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: CARD_BORDER_COLOR,
  borderRadius: CARD_RADIUS_PX,
  background: "#f8fafc",
  color: "#1e293b",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  userSelect: "text",
};

const tableCellStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  padding: "6px 8px",
  textAlign: "left",
  verticalAlign: "top",
  overflowWrap: "anywhere",
  whiteSpace: "pre-line",
};

/**
 * A carrier longer than its page flows on, piece by piece, the way Word
 * flows the content of an altChunk it has opened as ordinary paragraphs: the
 * page ledger repeats the carrier on every page its content reaches and
 * gives each copy its rows (paged/atomRowSlices). A row is a block of the
 * content, an item of a list, a row of a table, a line of preformatted
 * text; text longer than a page can hold is rows of its own words, so it is
 * cut between two of its lines (paged/textRowChunks). Rows are numbered
 * over the whole carrier, in reading order.
 */
interface RowCursor {
  /** Number of the next row. */
  next: number;
  readonly start: number;
  /** Infinity: through the last row. */
  readonly end: number;
}

function rowDrawn(cursor: RowCursor, row: number): boolean {
  return row >= cursor.start && row < cursor.end;
}

/**
 * What an element whose rows are [first, cursor.next) says about the pages
 * (atomRowSlices): it began on the page before, it goes on on the next. The
 * cut reads the space between the two copies' rows from these.
 */
function continuity(cursor: RowCursor, first: number): Record<string, string> {
  const end = cursor.next;
  return {
    ...(cursor.start > first && cursor.start < end ? { [PAGE_ROW_CONTINUED_ATTR]: "" } : {}),
    ...(cursor.end < end && cursor.end > first ? { [PAGE_ROW_CONTINUES_ATTR]: "" } : {}),
  };
}

interface TextRows {
  readonly children: React.ReactNode;
  readonly drawn: boolean;
  /** The text began on an earlier page. */
  readonly continued: boolean;
  /** What the element that holds the text carries: its row number when it
   * is one row (short text), else where its rows of words go on. */
  readonly stamps: Record<string, string | number>;
}

function textRows(text: string, cursor: RowCursor, key: string): TextRows {
  const words = textRowChunks(text);
  const first = cursor.next;
  if (!words) {
    cursor.next += 1;
    return { children: text, drawn: rowDrawn(cursor, first), continued: false, stamps: { [PAGE_ROW_ATTR]: first } };
  }
  const children: ReactElement[] = [];
  for (const word of words) {
    const row = cursor.next;
    cursor.next += 1;
    if (!rowDrawn(cursor, row)) continue;
    children.push(React.createElement("span", { key: `${key}-row-${row}`, [PAGE_ROW_ATTR]: row }, word));
  }
  const stamps = continuity(cursor, first);
  return {
    children,
    drawn: children.length > 0,
    continued: PAGE_ROW_CONTINUED_ATTR in stamps,
    stamps,
  };
}

function renderBlock(
  block: DocumentAltChunkBlock,
  index: number,
  cursor: RowCursor,
): ReactElement | null {
  const key = `altchunk-block-${index}`;
  if (block.kind === "paragraph") {
    const rows = textRows(block.text, cursor, key);
    if (!rows.drawn) return null;
    return React.createElement(
      "p",
      { key, style: { margin: "8px 0" }, ...rows.stamps },
      rows.children,
    );
  }
  if (block.kind === "heading") {
    const heading = `h${block.level}` as keyof React.JSX.IntrinsicElements;
    const rows = textRows(block.text, cursor, key);
    if (!rows.drawn) return null;
    return React.createElement(
      heading,
      { key, style: { margin: "10px 0 6px", fontWeight: 650 }, ...rows.stamps },
      rows.children,
    );
  }
  if (block.kind === "blockquote") {
    const rows = textRows(block.text, cursor, key);
    if (!rows.drawn) return null;
    return React.createElement(
      "blockquote",
      {
        key,
        style: {
          margin: "8px 0",
          paddingLeft: 12,
          borderLeft: "3px solid #94a3b8",
        },
        ...rows.stamps,
      },
      rows.children,
    );
  }
  if (block.kind === "pre") {
    // Each line the text itself breaks is a row: a listing is cut between
    // two of its lines.
    const firstLine = cursor.next;
    const lines: ReactElement[] = [];
    block.text.split("\n").forEach((line, lineIndex) => {
      const lineKey = `${key}-line-${lineIndex}`;
      // An empty line keeps its height by the line feed it is.
      const rows = textRows(line === "" ? "\n" : line, cursor, lineKey);
      if (!rows.drawn) return;
      lines.push(
        React.createElement(
          "span",
          { key: lineKey, style: { display: "block" }, ...rows.stamps },
          rows.children,
        ),
      );
    });
    if (lines.length === 0) return null;
    return React.createElement(
      "pre",
      {
        key,
        style: {
          margin: "8px 0",
          padding: 10,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          borderRadius: 6,
          background: "#e2e8f0",
        },
        ...continuity(cursor, firstLine),
      },
      lines,
    );
  }
  if (block.kind === "ordered_list" || block.kind === "unordered_list") {
    const listTag = block.kind === "ordered_list" ? "ol" : "ul";
    const firstItem = cursor.next;
    const items: ReactElement[] = [];
    let firstNumber: number | null = null;
    block.items.forEach((item, itemIndex) => {
      const rows = textRows(item, cursor, `${key}-item-${itemIndex}`);
      if (!rows.drawn) return;
      firstNumber ??= itemIndex + 1;
      items.push(
        React.createElement(
          "li",
          {
            key: `${key}-item-${itemIndex}`,
            // An item that began on the page before has its marker there.
            ...(rows.continued ? { style: { listStyleType: "none" } } : {}),
            ...rows.stamps,
          },
          rows.children,
        ),
      );
    });
    if (items.length === 0) return null;
    return React.createElement(
      listTag,
      {
        key,
        style: { margin: "8px 0", paddingLeft: 24 },
        ...(listTag === "ol" && firstNumber !== null && firstNumber > 1 ? { start: firstNumber } : {}),
        ...continuity(cursor, firstItem),
      },
      items,
    );
  }
  if (block.kind === "table") {
    const firstRow = cursor.next;
    const tableRows: ReactElement[] = [];
    block.rows.forEach((row, rowIndex) => {
      const rowKey = `${key}-row-${rowIndex}`;
      const cellElement = (
        cell: AltChunkTableCell,
        cellIndex: number,
        children: React.ReactNode,
        stamps: Record<string, string | number> = {},
      ) =>
        React.createElement(
          cell.kind === "header" ? "th" : "td",
          {
            key: `${key}-cell-${rowIndex}-${cellIndex}`,
            style: {
              ...tableCellStyle,
              ...(cell.kind === "header"
                ? { background: "#e2e8f0", fontWeight: 650 }
                : {}),
            },
            ...stamps,
          },
          children,
        );
      if (row.length === 1) {
        // A table of one column is text in a frame (a page laid out as a
        // table): its cell is cut between two of its lines like a paragraph.
        const rows = textRows(row[0].text, cursor, rowKey);
        if (!rows.drawn) return;
        // The row is the cell: one row when its text is short, else the
        // cell holds the rows of its words and says where they go on.
        const single = PAGE_ROW_ATTR in rows.stamps;
        tableRows.push(
          React.createElement(
            "tr",
            { key: rowKey, ...(single ? rows.stamps : {}) },
            cellElement(row[0], 0, rows.children, single ? {} : rows.stamps),
          ),
        );
        return;
      }
      const number = cursor.next;
      cursor.next += 1;
      if (!rowDrawn(cursor, number)) return;
      tableRows.push(
        React.createElement(
          "tr",
          { key: rowKey, [PAGE_ROW_ATTR]: number },
          row.map((cell, cellIndex) => cellElement(cell, cellIndex, cell.text)),
        ),
      );
    });
    if (tableRows.length === 0) return null;
    return React.createElement(
      "div",
      {
        key,
        style: { maxWidth: "100%", overflowX: "auto", margin: "8px 0" },
        ...continuity(cursor, firstRow),
      },
      React.createElement(
        "table",
        {
          style: {
            width: "100%",
            minWidth: 360,
            borderCollapse: "collapse",
            tableLayout: "fixed",
          },
        },
        // The caption stands over the table's first row only.
        block.caption && rowDrawn(cursor, firstRow)
          ? React.createElement(
              "caption",
              {
                style: { paddingBottom: 6, textAlign: "left", fontWeight: 600 },
              },
              block.caption,
            )
          : null,
        React.createElement("tbody", null, tableRows),
      ),
    );
  }
  if (block.kind === "image") {
    // A picture is one row: it moves to the next page whole.
    const row = cursor.next;
    cursor.next += 1;
    if (!rowDrawn(cursor, row)) return null;
    return React.createElement(
      "div",
      { key, style: { margin: "8px 0" }, [PAGE_ROW_ATTR]: row },
      React.createElement("img", {
        src: `data:image/${block.format};base64,${block.data}`,
        alt: "",
        width: block.width,
        height: block.height,
        draggable: false,
        style: {
          display: "block",
          maxWidth: "100%",
          height: "auto",
          aspectRatio: `${block.width} / ${block.height}`,
        },
      }),
    );
  }
  const rule = cursor.next;
  cursor.next += 1;
  if (!rowDrawn(cursor, rule)) return null;
  return React.createElement("hr", {
    key,
    style: { margin: "10px 0", border: 0, borderTop: "1px solid #cbd5e1" },
    [PAGE_ROW_ATTR]: rule,
  });
}

function renderBlocks(
  blocks: readonly DocumentAltChunkBlock[],
  range: RowSliceRange,
): ReactElement[] {
  const cursor: RowCursor = { next: 0, start: range.start, end: range.end ?? Number.POSITIVE_INFINITY };
  const drawn: ReactElement[] = [];
  blocks.forEach((block, index) => {
    const element = renderBlock(block, index, cursor);
    if (element) drawn.push(element);
  });
  return drawn;
}

/** The card of a copy: where the carrier goes on, its frame is left open on
 * that side (no line, no rounded corners) and stands against the page's
 * edge. Every copy keeps its padding, so the space around its first and last
 * row stays inside it: the cut counts that closing edge as part of the copy
 * (planRowSliceHead closedBox). */
function cardStyleFor(position: RowSlicePosition): CSSProperties {
  const continuesBelow = position === "head" || position === "middle";
  const continuesAbove = position === "tail" || position === "middle";
  const top = continuesAbove ? "transparent" : CARD_BORDER_COLOR;
  const bottom = continuesBelow ? "transparent" : CARD_BORDER_COLOR;
  const topRadius = continuesAbove ? 0 : CARD_RADIUS_PX;
  const bottomRadius = continuesBelow ? 0 : CARD_RADIUS_PX;
  // The same properties whatever the position, so a copy that becomes the
  // whole card again changes values only.
  return {
    ...cardStyle,
    margin: `${continuesAbove ? 0 : CARD_MARGIN_PX}px 0 ${continuesBelow ? 0 : CARD_MARGIN_PX}px`,
    borderColor: `${top} ${CARD_BORDER_COLOR} ${bottom}`,
    borderRadius: `${topRadius}px ${topRadius}px ${bottomRadius}px ${bottomRadius}px`,
  };
}

function AltChunkReadOnlyView(props: NodeViewProps): ReactElement {
  const labels = (props.extension.options as DocumentAltChunkReadOnlyOptions)
    .labels;
  const attrs = canonicalCarrier(props.node.attrs)?.attrs ?? null;
  const range = rowSliceRange(props.node.attrs);
  const position = rowSlicePosition(range);
  // The first copy says what the card is, the last what was left out.
  const opensCard = range.start === 0;
  const closesCard = range.end === null;
  const body = attrs
    ? renderBlocks(attrs.blocks, range)
    : React.createElement(
        "p",
        { style: { margin: "8px 0", color: "#991b1b" } },
        labels.invalid,
      );
  return React.createElement(
    NodeViewWrapper,
    {
      as: "section",
      role: "group",
      "aria-label": labels.label,
      "aria-readonly": "true",
      contentEditable: false,
      draggable: false,
      "data-document-altchunk-read-only": attrs?.carrierId ?? "invalid",
      [PAGE_ROW_SLICE_ATTR]: rowSliceStamp(position),
      style: cardStyleFor(position),
      onDragStart: (event: React.DragEvent) => event.preventDefault(),
    },
    opensCard
      ? React.createElement(
          "header",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "6px 10px",
              marginBottom: 8,
              paddingBottom: 8,
              borderBottom: "1px solid #e2e8f0",
            },
          },
          React.createElement(
            "strong",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                minHeight: 24,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#dbeafe",
                color: "#1e40af",
                fontSize: 12,
                lineHeight: "20px",
                letterSpacing: "0.01em",
              },
            },
            labels.label,
          ),
          React.createElement(
            "span",
            { style: { color: "#475569", fontSize: 13 } },
            labels.description,
          ),
        )
      : null,
    React.createElement(
      "div",
      { style: { lineHeight: 1.55, whiteSpace: "pre-line" }, [PAGE_ROWS_ROOT_ATTR]: "" },
      body,
    ),
    closesCard && attrs && attrs.lossReasons.length
      ? React.createElement(
          "p",
          {
            style: {
              margin: "10px 0 0",
              paddingTop: 8,
              borderTop: "1px solid #e2e8f0",
              color: "#64748b",
              fontSize: 12,
            },
          },
          labels.simplified,
        )
      : null,
  );
}

function documentAltChunkCarrierSnapshot(
  doc: ProseMirrorNode,
  withBlockIdentity = false,
): readonly string[] {
  const snapshot: string[] = [];
  doc.descendants((node) => {
    if (node.type.name !== DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) return true;
    if (isCarrierContinuation(node)) return false;
    const serialized = canonicalCarrier(node.attrs)?.serialized ?? INVALID_CARRIER;
    // The carrier's block identity is what a save stores with it: the copy
    // that opens the carrier keeps it whatever the pages do.
    snapshot.push(withBlockIdentity ? `${String(node.attrs.block_id ?? "")}:${serialized}` : serialized);
    return false;
  });
  return snapshot;
}

/**
 * Every carrier node of `doc` as it is laid out: the carriers and their
 * copies on later pages, each with the rows it draws. What an ordinary edit
 * must leave exactly as it found it.
 */
function documentAltChunkLayoutSnapshot(doc: ProseMirrorNode): readonly string[] {
  const snapshot: string[] = [];
  doc.descendants((node) => {
    if (node.type.name !== DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) return true;
    const range = rowSliceRange(node.attrs);
    snapshot.push(
      `${range.start}:${range.end ?? "end"}:${canonicalCarrier(node.attrs)?.serialized ?? INVALID_CARRIER}`,
    );
    return false;
  });
  return snapshot;
}

/**
 * The copies of `doc` are sound: each carrier that stops before its last row
 * is followed by copies that go on exactly where the one before stopped,
 * through the last row, and every copy is the carrier before it, attribute
 * for attribute. Then every row of every carrier is drawn once, by a node
 * that holds the carrier's own content: no row is missing from the pages,
 * and no node claims to be a later page of a carrier while holding other
 * content.
 */
function continuationsAreSound(doc: ProseMirrorNode): boolean {
  let open: { serialized: string; next: number } | null = null;
  let sound = true;
  doc.descendants((node) => {
    if (!sound) return false;
    if (node.type.name !== DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) return !node.isTextblock;
    const serialized = canonicalCarrier(node.attrs)?.serialized ?? INVALID_CARRIER;
    const range = rowSliceRange(node.attrs);
    if (range.start === 0) {
      // A carrier: the one before it must have drawn its last row.
      if (open) sound = false;
    } else if (!open || open.serialized !== serialized || open.next !== range.start || serialized === INVALID_CARRIER) {
      sound = false;
    }
    open = range.end === null ? null : { serialized, next: range.end };
    return false;
  });
  return sound && open === null;
}

/**
 * A copy of a carrier on a later page, drawing the rows its page holds
 * (paged/atomRowSlices). The page ledger makes and removes such copies as the
 * layout needs; a save, an export and the shared document hold the carrier
 * once. To this authority it is not a carrier: the canonical list is the
 * carriers themselves, and every rule about that list reads past the copies.
 * It is protected from edits exactly as the carrier is (see the filter).
 */
function isCarrierContinuation(node: ProseMirrorNode): boolean {
  return isRowSliceTail(node);
}

/** Where the continuation copies of `doc` stand. */
function carrierContinuationPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, position) => {
    if (node.type.name === DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) {
      if (isCarrierContinuation(node)) positions.push(position);
      return false;
    }
    // Copies are blocks of a page; nothing below a text block is one.
    return !node.isTextblock;
  });
  return positions;
}

const STRUCTURAL_REBALANCE_META = "structuralRebalance";

/**
 * A transaction that only lays the document out: the page ledger's own (its
 * closed meta together with its non-undoable contract, the pair
 * readOnlyTransactionAuthority names), the follow-up that keeps the copies
 * of one row-sliced atom together, and the stamp that gives a new node its
 * block identity. Such a transaction may make, re-slice and remove the
 * copies of a carrier. It is still held to the canonical list: the carriers,
 * their order and their content must be the same before and after it.
 */
function layoutOnlyTransaction(transaction: Transaction): boolean {
  if (
    transaction.getMeta(STRUCTURAL_REBALANCE_META) === true &&
    transaction.getMeta("addToHistory") === false
  ) {
    return true;
  }
  return (
    transaction.getMeta(ROW_SLICE_INTEGRITY_META) === true ||
    transaction.getMeta(MRNOTE_BLOCK_IDENTITY_META) === true
  );
}

function sameSnapshot(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function trustedCarrierReplacement(transaction: Transaction): boolean {
  const reason = transaction.getMeta(READ_ONLY_TRUSTED_MUTATION_META);
  if (reason === "hydration-content" || reason === "content-restoration") {
    return (
      transaction.getMeta("preventUpdate") === true &&
      transaction.getMeta("addToHistory") === false
    );
  }
  return (
    reason === "hydration-restore" &&
    transaction.getMeta("addToHistory") === false
  );
}

interface CarrierAuthorityEntry {
  readonly position: number;
  readonly flowGap: number;
  readonly ancestorKeys: readonly string[];
  readonly attrs: DocumentAltChunkReadOnlyAttrs;
  readonly serialized: string;
}

interface CarrierAuthorityState {
  readonly entries: readonly CarrierAuthorityEntry[];
  readonly flowSignatures: readonly string[];
  readonly wrapperKeys: readonly string[];
  readonly repairPending: boolean;
}

const carrierAuthorityKey = new PluginKey<CarrierAuthorityState>(
  "documentAltChunkCanonicalAuthority",
);

interface FlowNode {
  readonly kind: "carrier" | "content";
  readonly position: number;
  readonly size: number;
  readonly node: ProseMirrorNode;
}

interface WrapperRecord {
  readonly key: string;
  readonly position: number;
  readonly depth: number;
  readonly typeName: string;
  readonly ancestorKeys: readonly string[];
}

interface WrapperContext {
  readonly wrappers: readonly WrapperRecord[];
  readonly carrierAncestors: ReadonlyMap<number, readonly string[]>;
}

function isCarrierWrapper(node: ProseMirrorNode): boolean {
  return node.type.name !== "pageBlock" && !node.isLeaf && !node.isTextblock;
}

function wrapperKey(
  node: ProseMirrorNode,
  structuralPath: readonly string[],
): string {
  const blockId = node.attrs?.block_id;
  if (typeof blockId === "string" && blockId) return `block:${blockId}`;
  const source = node.attrs?.source;
  if (typeof source === "object" && source !== null) {
    const sourceAnchor = (source as Record<string, unknown>).sourceAnchor;
    if (typeof sourceAnchor === "string" && sourceAnchor) {
      return `source:${sourceAnchor}`;
    }
  }
  return `struct:${structuralPath.join("/")}:${shortCoordinationHash(
    JSON.stringify(node.attrs),
  )}`;
}

function collectWrapperContext(doc: ProseMirrorNode): WrapperContext {
  const wrappers: WrapperRecord[] = [];
  const carrierAncestors = new Map<number, readonly string[]>();
  let structuralOrdinal = 0;
  const visit = (
    parent: ProseMirrorNode,
    contentStart: number,
    structuralPath: readonly string[],
    ancestorKeys: readonly string[],
    depth: number,
  ): void => {
    parent.forEach((child, offset) => {
      const position = contentStart + offset;
      if (child.type.name === DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) {
        if (!isCarrierContinuation(child)) carrierAncestors.set(position, ancestorKeys);
        return;
      }
      if (child.type.name === "pageBlock") {
        visit(child, position + 1, structuralPath, ancestorKeys, depth);
        return;
      }
      const childPath = [
        ...structuralPath,
        `${child.type.name}:${structuralOrdinal}`,
      ];
      structuralOrdinal += 1;
      if (!isCarrierWrapper(child)) return;
      const key = wrapperKey(child, childPath);
      wrappers.push({
        key,
        position,
        depth,
        typeName: child.type.name,
        ancestorKeys,
      });
      visit(child, position + 1, childPath, [...ancestorKeys, key], depth + 1);
    });
  };
  visit(doc, 0, [], [], 0);
  return { wrappers, carrierAncestors };
}

function documentFlow(doc: ProseMirrorNode): FlowNode[] {
  const flow: FlowNode[] = [];
  doc.descendants((node, position) => {
    if (node.type.name === DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) {
      // A continuation copy is neither a carrier nor content of the flow.
      if (!isCarrierContinuation(node)) {
        flow.push({ kind: "carrier", position, size: node.nodeSize, node });
      }
      return false;
    }
    if (node.type.name === "pageBlock") return true;
    if (node.isBlock) {
      flow.push({ kind: "content", position, size: node.nodeSize, node });
      return false;
    }
    return true;
  });
  return flow;
}

function flowNodeSignature(node: ProseMirrorNode): string {
  const blockId = node.attrs?.block_id;
  if (typeof blockId === "string" && blockId) return `block:${blockId}`;
  const source = node.attrs?.source;
  if (typeof source === "object" && source !== null) {
    const sourceAnchor = (source as Record<string, unknown>).sourceAnchor;
    if (typeof sourceAnchor === "string" && sourceAnchor) {
      return `source:${sourceAnchor}`;
    }
  }
  return `json:${node.type.name}:${shortCoordinationHash(
    JSON.stringify(node.toJSON()),
  )}`;
}

/**
 * The authority of a document that holds no carrier: there is nothing to
 * keep. Almost every document is one, and the full authority is not cheap
 * (the place of every block in the flow, a signature of each, every wrapper):
 * worked out on every transaction, selection moves included, it was a pass
 * over the whole document per keystroke for carriers that do not exist
 * (13 ms a key in WebKit on a 16-page document without one).
 */
const CARRIER_FREE: CarrierAuthorityState = Object.freeze({
  entries: Object.freeze([]) as readonly CarrierAuthorityEntry[],
  flowSignatures: Object.freeze([]) as readonly string[],
  wrapperKeys: Object.freeze([]) as readonly string[],
  repairPending: false,
});

/** Whether a document holds a carrier or a copy of one, read once per
 * document: carriers are blocks, so nothing below a text block is looked at. */
const HOLDS_CARRIER = new SheetFact((node) => node.type.name === DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME);
function documentHoldsCarrier(doc: ProseMirrorNode): boolean {
  return HOLDS_CARRIER.inDoc(doc);
}

function captureCarrierAuthority(state: EditorState): CarrierAuthorityState {
  return documentHoldsCarrier(state.doc) ? captureFullCarrierAuthority(state) : CARRIER_FREE;
}

function captureFullCarrierAuthority(state: EditorState): CarrierAuthorityState {
  const entries: CarrierAuthorityEntry[] = [];
  const flow = documentFlow(state.doc);
  const wrapperContext = collectWrapperContext(state.doc);
  const flowSignatures: string[] = [];
  for (const item of flow) {
    if (item.kind === "content") {
      flowSignatures.push(flowNodeSignature(item.node));
      continue;
    }
    const canonical = canonicalCarrier(item.node.attrs);
    if (!canonical) continue;
    entries.push({
      position: item.position,
      flowGap: flowSignatures.length,
      ancestorKeys: wrapperContext.carrierAncestors.get(item.position) ?? [],
      attrs: canonical.attrs,
      serialized: canonical.serialized,
    });
  }
  return {
    entries,
    flowSignatures,
    wrapperKeys: wrapperContext.wrappers.map((wrapper) => wrapper.key),
    // Copies that leave a row out (content put in place with copies that do
    // not line up) are replaced by the whole carriers; the page ledger cuts
    // them again.
    repairPending: !continuationsAreSound(state.doc),
  };
}

function uniqueSignaturePositions(
  signatures: readonly string[],
): Map<string, number> {
  const positions = new Map<string, number>();
  const duplicates = new Set<string>();
  signatures.forEach((signature, index) => {
    if (positions.has(signature)) duplicates.add(signature);
    else positions.set(signature, index);
  });
  duplicates.forEach((signature) => positions.delete(signature));
  return positions;
}

function remapFlowGap(
  oldSignatures: readonly string[],
  newSignatures: readonly string[],
  oldGap: number,
): number {
  const oldUnique = uniqueSignaturePositions(oldSignatures);
  const newUnique = uniqueSignaturePositions(newSignatures);
  for (let index = oldGap; index < oldSignatures.length; index += 1) {
    const signature = oldSignatures[index];
    if (oldUnique.get(signature) !== index) continue;
    const next = newUnique.get(signature);
    if (next !== undefined) return next;
  }
  for (let index = oldGap - 1; index >= 0; index -= 1) {
    const signature = oldSignatures[index];
    if (oldUnique.get(signature) !== index) continue;
    const previous = newUnique.get(signature);
    if (previous !== undefined) return previous + 1;
  }
  return Math.min(oldGap, newSignatures.length);
}

function insertionPositionForFlowGap(
  doc: ProseMirrorNode,
  gap: number,
): number {
  const content = documentFlow(doc).filter((item) => item.kind === "content");
  if (content.length === 0) return 0;
  if (gap < content.length) return content[Math.max(0, gap)].position;
  const last = content[content.length - 1];
  return last.position + last.size;
}

function remapCarrierAuthority(
  authority: CarrierAuthorityState,
  newState: EditorState,
): CarrierAuthorityState {
  const newSignatures = documentFlow(newState.doc)
    .filter((item) => item.kind === "content")
    .map((item) => flowNodeSignature(item.node));
  return {
    entries: authority.entries.map((entry) => {
      const flowGap = remapFlowGap(
        authority.flowSignatures,
        newSignatures,
        entry.flowGap,
      );
      return {
        ...entry,
        position: insertionPositionForFlowGap(newState.doc, flowGap),
        flowGap,
      };
    }),
    flowSignatures: newSignatures,
    wrapperKeys: authority.wrapperKeys,
    repairPending: authority.repairPending,
  };
}

function isYSyncTransaction(transaction: Transaction): boolean {
  return (
    transaction.getMeta(ySyncPluginKey) !== undefined ||
    transaction.getMeta("y-sync$") !== undefined
  );
}

function transactionTouchesCarrierRange(
  transaction: Transaction,
  authority: CarrierAuthorityState,
  continuations: readonly number[],
): boolean {
  // The copies on later pages are the carrier's own content: as untouchable
  // as the carrier itself.
  let positions = [...authority.entries.map((entry) => entry.position), ...continuations];
  for (const step of transaction.steps) {
    const stepMap = step.getMap();
    let touched = false;
    stepMap.forEach((oldStart, oldEnd) => {
      if (
        oldEnd > oldStart &&
        positions.some(
          (position) => oldStart < position + 1 && oldEnd > position,
        )
      ) {
        touched = true;
      }
    });
    if (touched) return true;
    positions = positions.map((position) => stepMap.map(position, 1));
  }
  return false;
}

/**
 * The carriers of `doc` are the authority's: the same ones, in the same
 * order, each between the same two blocks of the flow and inside the same
 * wrappers.
 *
 * A carrier's place is read as its place in the flow (how many blocks stand
 * before it), not as a document position. The position an authority entry
 * is remapped to is where the carrier would be put BACK (the start of the
 * block after it), which is never where a carrier that is still there
 * stands: compared by position, every change from the shared document, a
 * collaborator typing in another paragraph included, read as a moved
 * carrier, and each one was deleted and made again (its node view with it,
 * and since pages cut carriers, every copy on a later page).
 */
function currentCarriersMatchAuthority(
  doc: ProseMirrorNode,
  authority: CarrierAuthorityState,
  carriersOnly = false,
): boolean {
  const wrapperContext = collectWrapperContext(doc);
  const current: Array<{ flowGap: number; serialized: string; ancestors: string }> = [];
  let flowGap = 0;
  for (const item of documentFlow(doc)) {
    if (item.kind === "content") {
      flowGap += 1;
      continue;
    }
    current.push({
      flowGap,
      serialized: canonicalCarrier(item.node.attrs)?.serialized ?? INVALID_CARRIER,
      ancestors: (wrapperContext.carrierAncestors.get(item.position) ?? []).join("\u0000"),
    });
  }
  return (
    // Copies that leave a row out, or are not their carrier's, are repaired
    // too (canonicalCarrierRepair: the copies alone when the carriers stand).
    (carriersOnly || continuationsAreSound(doc)) &&
    current.length === authority.entries.length &&
    current.every((entry, index) => {
      const expected = authority.entries[index];
      return (
        expected !== undefined &&
        entry.flowGap === expected.flowGap &&
        entry.serialized === expected.serialized &&
        entry.ancestors === expected.ancestorKeys.join("\u0000")
      );
    })
  );
}

function carrierInsertionPositions(
  doc: ProseMirrorNode,
  carrierType: NodeType,
): number[] {
  const positions: number[] = [];
  const visit = (parent: ProseMirrorNode, contentStart: number): void => {
    let offset = 0;
    for (let index = 0; index <= parent.childCount; index += 1) {
      if (parent.canReplaceWith(index, index, carrierType)) {
        positions.push(contentStart + offset);
      }
      if (index === parent.childCount) break;
      const child = parent.child(index);
      if (!child.isLeaf) visit(child, contentStart + offset + 1);
      offset += child.nodeSize;
    }
  };
  visit(doc, 0);
  return positions;
}

function illegalCarrierWrapperCandidates(
  doc: ProseMirrorNode,
  authority: CarrierAuthorityState,
): WrapperRecord[] {
  const context = collectWrapperContext(doc);
  const canonicalWrappers = new Set(authority.wrapperKeys);
  const wrappersByKey = new Map(
    context.wrappers.map((wrapper) => [wrapper.key, wrapper]),
  );
  const authorityById = new Map(
    authority.entries.map((entry) => [entry.attrs.carrierId, entry]),
  );
  const candidates = new Map<string, WrapperRecord>();
  let carrierIndex = 0;
  doc.descendants((node, position) => {
    if (node.type.name !== DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) return true;
    if (isCarrierContinuation(node)) return false;
    const attrs = canonicalCarrier(node.attrs)?.attrs ?? null;
    const expected =
      (attrs ? authorityById.get(attrs.carrierId) : undefined) ??
      authority.entries[carrierIndex];
    carrierIndex += 1;
    if (!expected) return false;
    const expectedAncestors = new Set(expected.ancestorKeys);
    for (const key of context.carrierAncestors.get(position) ?? []) {
      if (expectedAncestors.has(key) || canonicalWrappers.has(key)) continue;
      const wrapper = wrappersByKey.get(key);
      if (wrapper) candidates.set(key, wrapper);
    }
    return false;
  });
  const candidateKeys = new Set(candidates.keys());
  return [...candidates.values()].filter(
    (wrapper) =>
      !wrapper.ancestorKeys.some((ancestor) => candidateKeys.has(ancestor)),
  );
}

function wrapperIsLogicallyEmpty(node: ProseMirrorNode): boolean {
  let meaningful = false;
  node.descendants((child) => {
    if (child.type.name === DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) return false;
    if (child.isText) {
      if (child.text?.trim()) meaningful = true;
      return !meaningful;
    }
    if (child.isLeaf) {
      meaningful = true;
      return false;
    }
    return !meaningful;
  });
  return !meaningful;
}

/** Deletes the carrier node at `position`. A sheet holds at least one block:
 * a carrier or a copy that is its sheet's only block goes with the sheet,
 * since deleted alone the sheet would be kept valid with an empty paragraph
 * nobody wrote. */
function deleteCarrierNode(transaction: Transaction, position: number, size: number): void {
  const resolved = transaction.doc.resolve(position);
  const sheet = resolved.parent;
  if (
    sheet.type.name === "pageBlock" &&
    sheet.childCount === 1 &&
    transaction.doc.childCount > 1
  ) {
    const sheetStart = resolved.before(resolved.depth);
    transaction.delete(sheetStart, sheetStart + sheet.nodeSize);
    return;
  }
  transaction.delete(position, position + size);
}

/**
 * The carriers stand as the authority has them and only their copies on
 * later pages are unsound (one is missing, one is not its carrier's): the
 * copies go and each carrier draws all its rows again, untouched otherwise.
 * The page ledger cuts it anew.
 */
function carrierCopiesReset(state: EditorState): Transaction | null {
  const transaction = state.tr;
  const nodes: Array<{ position: number; node: ProseMirrorNode }> = [];
  state.doc.descendants((node, position) => {
    if (node.type.name !== DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) return !node.isTextblock;
    nodes.push({ position, node });
    return false;
  });
  for (const { position, node } of nodes.sort((left, right) => right.position - left.position)) {
    if (isCarrierContinuation(node)) {
      deleteCarrierNode(transaction, position, node.nodeSize);
    } else if (rowSliceRange(node.attrs).end !== null) {
      transaction.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, [ROW_SLICE_START_ATTR]: null, [ROW_SLICE_END_ATTR]: null },
        node.marks,
      );
    }
  }
  if (!transaction.docChanged) return null;
  transaction.setMeta(READ_ONLY_TRUSTED_MUTATION_META, "hydration-restore");
  transaction.setMeta("addToHistory", false);
  return transaction;
}

function canonicalCarrierRepair(
  state: EditorState,
  authority: CarrierAuthorityState,
): Transaction | null {
  const carrierType = state.schema.nodes[DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME];
  if (!carrierType) return null;
  if (
    currentCarriersMatchAuthority(state.doc, authority, true) &&
    !continuationsAreSound(state.doc)
  ) {
    return carrierCopiesReset(state);
  }
  const wrapperCandidates = illegalCarrierWrapperCandidates(
    state.doc,
    authority,
  );
  const transaction = state.tr;
  const existing: Array<{ position: number; size: number }> = [];
  state.doc.descendants((node, position) => {
    if (node.type.name === DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) {
      existing.push({ position, size: node.nodeSize });
      return false;
    }
    return true;
  });
  for (const entry of existing.sort(
    (left, right) => right.position - left.position,
  )) {
    deleteCarrierNode(transaction, entry.position, entry.size);
  }
  for (const wrapper of wrapperCandidates.sort(
    (left, right) => right.position - left.position,
  )) {
    const position = transaction.mapping.map(wrapper.position, -1);
    const current = transaction.doc.nodeAt(position);
    if (
      current?.type.name === wrapper.typeName &&
      wrapperIsLogicallyEmpty(current)
    ) {
      transaction.delete(position, position + current.nodeSize);
    }
  }
  for (const entry of [...authority.entries].sort(
    (left, right) => left.position - right.position,
  )) {
    const expected = transaction.mapping.map(entry.position, 1);
    const candidates = carrierInsertionPositions(transaction.doc, carrierType);
    const position = candidates.reduce<number | null>((nearest, candidate) => {
      if (nearest === null) return candidate;
      return Math.abs(candidate - expected) < Math.abs(nearest - expected)
        ? candidate
        : nearest;
    }, null);
    if (position === null) return null;
    transaction.insert(position, carrierType.create(entry.attrs));
  }
  if (!transaction.docChanged) return null;
  transaction.setMeta(READ_ONLY_TRUSTED_MUTATION_META, "hydration-restore");
  transaction.setMeta("addToHistory", false);
  return transaction;
}

function trailingTableHydration(
  state: EditorState,
  authority: CarrierAuthorityState,
): Transaction | null {
  if (authority.entries.length === 0) return null;
  const flow = documentFlow(state.doc);
  const last = flow.at(-1);
  const paragraphType = state.schema.nodes.paragraph;
  if (!last || last.kind !== "content" || last.node.type.name !== "table") {
    return null;
  }
  if (!paragraphType) return null;
  const position = last.position + last.size;
  const resolved = state.doc.resolve(position);
  if (
    !resolved.parent.canReplaceWith(
      resolved.index(),
      resolved.index(),
      paragraphType,
    )
  ) {
    return null;
  }
  const paragraph = paragraphType.createAndFill();
  if (!paragraph) return null;
  return state.tr
    .insert(position, paragraph)
    .setMeta(READ_ONLY_TRUSTED_MUTATION_META, "hydration-restore")
    .setMeta("addToHistory", false);
}

interface RepairClaim {
  readonly repairKey: string;
  readonly clientId: number;
}

const REPAIR_COORDINATOR_MAP = "mrnote:document-altchunk-repair-v1";
const REPAIR_COORDINATOR_CLAIM = "claim";

function shortCoordinationHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function repairCoordinationKey(
  state: EditorState,
  authority: CarrierAuthorityState,
): string {
  const current: Array<[number, string, string]> = [];
  state.doc.descendants((node, position) => {
    if (node.type.name !== DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME) return true;
    if (isCarrierContinuation(node)) return false;
    const fingerprint =
      typeof node.attrs.fingerprint === "string" &&
      SHA256_RE.test(node.attrs.fingerprint)
        ? node.attrs.fingerprint
        : "invalid";
    const carrierId =
      typeof node.attrs.carrierId === "string" &&
      CARRIER_ID_RE.test(node.attrs.carrierId)
        ? node.attrs.carrierId
        : "invalid";
    current.push([position, carrierId, fingerprint]);
    return false;
  });
  return shortCoordinationHash(
    JSON.stringify({
      authority: authority.entries.map((entry) => [
        entry.position,
        entry.attrs.carrierId,
        entry.attrs.fingerprint,
      ]),
      current,
    }),
  );
}

function claimCollaborativeRepair(
  state: EditorState,
  authority: CarrierAuthorityState,
): (() => boolean) | null {
  const syncState = ySyncPluginKey.getState(state) as
    | {
        doc?: {
          clientID: number;
          getMap: (name: string) => {
            get: (key: string) => unknown;
            set: (key: string, value: unknown) => void;
          };
        };
      }
    | undefined;
  const ydoc = syncState?.doc;
  if (!ydoc) return null;
  const repairKey = repairCoordinationKey(state, authority);
  const claim: RepairClaim = { repairKey, clientId: ydoc.clientID };
  const coordinator = ydoc.getMap(REPAIR_COORDINATOR_MAP);
  coordinator.set(REPAIR_COORDINATOR_CLAIM, claim);
  return () => {
    const winner = coordinator.get(REPAIR_COORDINATOR_CLAIM);
    return (
      typeof winner === "object" &&
      winner !== null &&
      (winner as Partial<RepairClaim>).repairKey === repairKey &&
      (winner as Partial<RepairClaim>).clientId === ydoc.clientID
    );
  };
}

/** Copy selected visible text only; never serialize the carrier or its attrs. */
function copyDocumentAltChunkSelectionAsPlainText(
  editorRoot: HTMLElement,
  event: ClipboardEvent,
): boolean {
  if (typeof window === "undefined" || !event.clipboardData) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount < 1)
    return false;
  const range = selection.getRangeAt(0);
  const intersectsCarrier = Array.from(
    editorRoot.querySelectorAll<HTMLElement>(
      "[data-document-altchunk-read-only]",
    ),
  ).some((carrier) => {
    try {
      return range.intersectsNode(carrier);
    } catch {
      return false;
    }
  });
  if (!intersectsCarrier) return false;
  const selectedText = selection.toString();
  if (!selectedText) return false;
  event.clipboardData.clearData();
  event.clipboardData.setData("text/plain", selectedText);
  event.preventDefault();
  return true;
}

export const DocumentAltChunkReadOnly =
  TipTapNode.create<DocumentAltChunkReadOnlyOptions>({
    name: DOCUMENT_ALTCHUNK_READ_ONLY_NODE_NAME,
    group: "block",
    atom: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addOptions() {
      return { labels: DEFAULT_LABELS };
    },

    addAttributes() {
      const hidden = (defaultValue: unknown) => ({
        default: defaultValue,
        rendered: false,
      });
      return {
        schemaVersion: hidden(1),
        disposition: hidden("preserve-only"),
        carrierId: hidden(""),
        fingerprint: hidden(""),
        relationshipId: hidden(""),
        relationshipType: hidden(""),
        partName: hidden(""),
        contentType: hidden("text/html"),
        blocks: hidden([]),
        lossReasons: hidden([]),
        nativePayload: hidden(null),
        source: hidden(null),
      };
    },

    parseHTML() {
      return [
        {
          tag: "div[data-document-altchunk-read-only]",
          getAttrs: (element) => parseSerializedAttrs(element as HTMLElement),
        },
      ];
    },

    renderHTML({ node, HTMLAttributes }) {
      const attrs = normalizeDocumentAltChunkReadOnlyAttrs(node.attrs);
      // The chunk's bytes never leave the document model (clipboard HTML,
      // HTML export): a pasted card has none, and nothing writes it back.
      const shown = attrs ? withoutNativePayload(attrs) : null;
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-document-altchunk-read-only": shown?.carrierId ?? "invalid",
          ...(shown ? { [SERIALIZED_ATTR]: JSON.stringify(shown) } : {}),
          role: "group",
          "aria-readonly": "true",
          contenteditable: "false",
        }),
      ];
    },

    addNodeView() {
      return reactNodeViewWithLivePosition(AltChunkReadOnlyView, {
        // A copy whose row range the page ledger changed draws its rows at
        // once: the ledger reads them in the same frame.
        update: updateRowSlicedNodeView,
      });
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: carrierAuthorityKey,
          state: {
            init: (_config, state) => captureCarrierAuthority(state),
            apply: (transaction, stored, oldState, newState) => {
              if (trustedCarrierReplacement(transaction)) {
                return captureCarrierAuthority(newState);
              }
              // No carrier before, none now: no authority to move or compare.
              if (stored === CARRIER_FREE && !documentHoldsCarrier(newState.doc)) {
                return CARRIER_FREE;
              }
              // None before and one now (only a step from the shared document
              // gets this far): the authority of the document as it was, all
              // of it, is read now that it is needed.
              const authority = stored === CARRIER_FREE
                ? captureFullCarrierAuthority(oldState)
                : stored;
              const mapped = remapCarrierAuthority(authority, newState);
              if (transaction.docChanged && isYSyncTransaction(transaction)) {
                if (currentCarriersMatchAuthority(newState.doc, mapped)) {
                  return captureCarrierAuthority(newState);
                }
                return {
                  ...mapped,
                  repairPending: true,
                };
              }
              if (transaction.docChanged) {
                return captureCarrierAuthority(newState);
              }
              return mapped;
            },
          },
          filterTransaction(transaction, state) {
            if (!transaction.docChanged) return true;
            if (isYSyncTransaction(transaction)) return true;
            if (trustedCarrierReplacement(transaction)) return true;
            // No carrier before the transaction and none after it: there is
            // nothing it could have touched, removed or put in.
            if (!documentHoldsCarrier(state.doc) && !documentHoldsCarrier(transaction.doc)) {
              return true;
            }
            const authority =
              carrierAuthorityKey.getState(state) ??
              captureCarrierAuthority(state);
            if (layoutOnlyTransaction(transaction)) {
              // Layout may make, re-slice and remove the copies on later
              // pages. The canonical list is not layout: the same carriers,
              // in the same order, with the same content and the same block
              // identity, every row of each drawn once, and no copy that is
              // not its carrier's.
              return (
                sameSnapshot(
                  documentAltChunkCarrierSnapshot(state.doc, true),
                  documentAltChunkCarrierSnapshot(transaction.doc, true),
                ) &&
                // Copies that were sound stay sound; copies that were not
                // (the repair below is on its way) may only be put right.
                (continuationsAreSound(transaction.doc) || !continuationsAreSound(state.doc))
              );
            }
            if (
              transactionTouchesCarrierRange(
                transaction,
                authority,
                carrierContinuationPositions(state.doc),
              )
            ) {
              return false;
            }
            // An edit leaves every carrier node as it found it: the
            // carriers, their copies and the rows each one draws.
            return sameSnapshot(
              documentAltChunkLayoutSnapshot(state.doc),
              documentAltChunkLayoutSnapshot(transaction.doc),
            );
          },
          view(view) {
            let queued = false;
            let trailingQueued = false;
            let destroyed = false;
            let repairTimer: ReturnType<typeof setTimeout> | null = null;
            let trailingTimer: ReturnType<typeof setTimeout> | null = null;
            const scheduleTrailingHydration = () => {
              const authority = carrierAuthorityKey.getState(view.state);
              if (!authority || trailingQueued || destroyed) return;
              if (!trailingTableHydration(view.state, authority)) return;
              trailingQueued = true;
              const ownsCollaborativeClaim = claimCollaborativeRepair(
                view.state,
                authority,
              );
              const hydrate = () => {
                trailingQueued = false;
                if (destroyed) return;
                const current = carrierAuthorityKey.getState(view.state);
                if (!current) return;
                const transaction = trailingTableHydration(view.state, current);
                if (!transaction) return;
                if (ownsCollaborativeClaim && !ownsCollaborativeClaim()) {
                  trailingTimer = setTimeout(scheduleTrailingHydration, 8);
                  return;
                }
                view.dispatch(transaction);
              };
              if (ownsCollaborativeClaim) {
                trailingTimer = setTimeout(hydrate, 8);
              } else {
                queueMicrotask(hydrate);
              }
            };
            const scheduleRepair = () => {
              const authority = carrierAuthorityKey.getState(view.state);
              if (!authority?.repairPending || queued || destroyed) return;
              queued = true;
              const ownsCollaborativeClaim = claimCollaborativeRepair(
                view.state,
                authority,
              );
              const repair = () => {
                queued = false;
                if (destroyed) return;
                const current = carrierAuthorityKey.getState(view.state);
                if (!current?.repairPending) return;
                if (ownsCollaborativeClaim && !ownsCollaborativeClaim()) {
                  repairTimer = setTimeout(scheduleRepair, 8);
                  return;
                }
                const transaction = canonicalCarrierRepair(view.state, current);
                if (transaction) view.dispatch(transaction);
              };
              if (ownsCollaborativeClaim) {
                repairTimer = setTimeout(repair, 8);
              } else {
                queueMicrotask(repair);
              }
            };
            scheduleTrailingHydration();
            scheduleRepair();
            return {
              update() {
                scheduleTrailingHydration();
                scheduleRepair();
              },
              destroy() {
                destroyed = true;
                if (repairTimer !== null) clearTimeout(repairTimer);
                if (trailingTimer !== null) clearTimeout(trailingTimer);
              },
            };
          },
          props: {
            handleDOMEvents: {
              copy: (view, event) =>
                copyDocumentAltChunkSelectionAsPlainText(view.dom, event),
              dragstart: (_view, event) =>
                Boolean(
                  (event.target as Element | null)?.closest?.(
                    "[data-document-altchunk-read-only]",
                  ),
                ),
            },
          },
        }),
      ];
    },
  });

export default DocumentAltChunkReadOnly;
