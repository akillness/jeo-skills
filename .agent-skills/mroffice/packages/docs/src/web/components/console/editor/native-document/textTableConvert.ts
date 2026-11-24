/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * CONVERT TEXT ↔ TABLE (Word/WPS "Convert Text to Table" / "Convert Table to
 * Text") — PURE parsing/conversion helpers.
 *
 * The editor commands that wire these into the toolbar live in DocumentToolbar
 * (they touch the live ProseMirror selection); this module is the SINGLE SOURCE
 * OF TRUTH for the row/cell math so the on-screen conversion and the unit tests
 * agree. It reuses the SAME tab/markdown-pipe heuristic the paste path uses
 * (NoteEditor.parsePlainTextTableRows) but is more lenient — it also accepts a
 * single delimited line (a 1-row table) and markdown `|`-pipe rows — because the
 * user has EXPLICITLY asked to convert a selection, so there is no ambiguity to
 * guard against (paste must avoid false positives; an explicit command need not).
 *
 * PURE: string / array math only, no DOM, no TipTap runtime (the two readers
 * of a live selection take a ProseMirror document and only read it).
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

/** Guard rails mirroring the paste heuristic so a huge selection can't blow up. */
export const TEXT_TO_TABLE_MAX_TEXT_LENGTH = 128 * 1024;
export const TEXT_TO_TABLE_MAX_ROWS = 200;
export const TEXT_TO_TABLE_MAX_COLUMNS = 50;
export const TEXT_TO_TABLE_MAX_CELLS = 5000;

/** How a text selection's columns are delimited when converting to a table. */
export type TextToTableDelimiter = "tab" | "comma" | "pipe";

/**
 * Word's conversion dialogs additionally allow paragraph marks or one explicit
 * character. Keep those choices structured so an arbitrary string can never be
 * mistaken for an enabled separator.
 */
export type TextTableConversionSeparator =
  | TextToTableDelimiter
  | "paragraph"
  | { readonly other: string };

/** One Unicode scalar, excluding line breaks (paragraph is a separate choice). */
export function normalizeTextTableOtherSeparator(value: string): string | null {
  const characters = Array.from(value);
  if (
    characters.length !== 1 ||
    characters[0] === "\n" ||
    characters[0] === "\r"
  ) {
    return null;
  }
  return characters[0] ?? null;
}

/** Inline editor JSON (text runs with marks, hard breaks, inline atoms). */
export type TextTableInlineJson = Record<string, unknown> & { type?: unknown };

/** One source paragraph of a text-to-table conversion. */
export interface TextTableSourceParagraph {
  /** Paragraph attributes (alignment, spacing, style) to carry into its cells. */
  readonly attrs?: Record<string, unknown> | null;
  /** The block's node type ("paragraph", "heading"): a heading stays a heading in its cell. */
  readonly type?: string | null;
  readonly content: readonly TextTableInlineJson[];
}

/** One cell of a conversion: the inline runs it holds. */
export interface TextTableCell {
  readonly content: TextTableInlineJson[];
}

/** One converted row, with the attributes of the paragraph it came from. */
export interface TextTableRow {
  readonly attrs: Record<string, unknown> | null;
  /** The source paragraph's node type; null for text-only sources. */
  readonly type?: string | null;
  readonly cells: TextTableCell[];
}

function isTextRun(
  node: TextTableInlineJson,
): node is TextTableInlineJson & { type: "text"; text: string } {
  return node.type === "text" && typeof node.text === "string";
}

function inlineText(content: readonly TextTableInlineJson[]): string {
  return content.map((node) => (isTextRun(node) ? node.text : "")).join("");
}

/** A text run with `text` and the original run's marks. */
function runWithText(
  run: TextTableInlineJson,
  text: string,
): TextTableInlineJson {
  return { ...run, text };
}

/** Split inline runs at every occurrence of `separator`, keeping each run's marks. */
function splitInlineAt(
  content: readonly TextTableInlineJson[],
  separator: string,
): TextTableInlineJson[][] {
  const cells: TextTableInlineJson[][] = [[]];
  for (const node of content) {
    if (!isTextRun(node)) {
      cells[cells.length - 1].push(node);
      continue;
    }
    const parts = node.text.split(separator);
    parts.forEach((part, index) => {
      if (index > 0) cells.push([]);
      if (part) cells[cells.length - 1].push(runWithText(node, part));
    });
  }
  return cells;
}

/** Remove leading (`side` start) or trailing whitespace from inline runs. */
function trimInline(
  content: TextTableInlineJson[],
  pattern: RegExp,
  side: "start" | "end",
): TextTableInlineJson[] {
  const nodes = [...content];
  while (nodes.length > 0) {
    const index = side === "start" ? 0 : nodes.length - 1;
    const node = nodes[index];
    if (!isTextRun(node)) break;
    const text = node.text.replace(pattern, "");
    if (text) {
      nodes[index] = runWithText(node, text);
      break;
    }
    nodes.splice(index, 1);
  }
  return nodes;
}

function trimInlineBothEnds(content: TextTableInlineJson[]): TextTableInlineJson[] {
  return trimInline(trimInline(content, /^\s+/, "start"), /\s+$/, "end");
}

/** A Markdown table line: starts with a pipe after optional indentation. */
function isMarkdownPipeLine(text: string): boolean {
  return /^\s*\|/.test(text);
}

/** A markdown header-separator row like `| --- | :--: |` carries no data. */
function isMarkdownSeparatorRow(cells: readonly TextTableCell[]): boolean {
  return (
    cells.length > 0 &&
    cells.every((cell) => /^\s*:?-+:?\s*$/.test(inlineText(cell.content)))
  );
}

/** Split one paragraph into cells for the given separator. */
function splitParagraph(
  content: readonly TextTableInlineJson[],
  delimiter: Exclude<TextTableConversionSeparator, "paragraph">,
): TextTableInlineJson[][] {
  if (typeof delimiter === "object") {
    const separator = normalizeTextTableOtherSeparator(delimiter.other);
    return separator ? splitInlineAt(content, separator) : [[...content]];
  }
  if (delimiter === "tab") return splitInlineAt(content, "\t");
  if (delimiter === "comma") return splitInlineAt(content, ",");
  // pipe: a Markdown table row ("| a | b |") has one optional outer pipe on
  // each side and pads its cells with spaces; that padding is Markdown
  // syntax, not cell text, so only such rows are trimmed.
  if (!isMarkdownPipeLine(inlineText(content))) {
    return splitInlineAt(content, "|");
  }
  const inner = trimInline(
    trimInline([...content], /^\s*\|/, "start"),
    /\|\s*$/,
    "end",
  );
  return splitInlineAt(inner, "|").map(trimInlineBothEnds);
}

/**
 * Convert source paragraphs into table rows, keeping every character and every
 * run's formatting (Word's Convert Text to Table only changes structure):
 *
 * - every paragraph is a row, empty ones included — an empty or all-separator
 *   paragraph is a row of empty cells, so records stay aligned;
 * - cell text is kept verbatim: no trimming, a literal "-" is data. Only a
 *   Markdown table row (pipe separator, "| a | b |") drops its Markdown
 *   padding, and only a Markdown table's own header-separator line (the
 *   second line, "| --- | --- |") is dropped;
 * - short rows are right-padded with empty cells to the widest row.
 *
 * Returns null when the paragraphs cannot be a table (no text at all, over the
 * size caps, or a single cell).
 */
export function convertParagraphsToTableRows(
  paragraphs: readonly TextTableSourceParagraph[],
  delimiter: TextTableConversionSeparator,
): TextTableRow[] | null {
  if (paragraphs.length === 0 || paragraphs.length > TEXT_TO_TABLE_MAX_ROWS) {
    return null;
  }
  const allText = paragraphs.map((paragraph) => inlineText(paragraph.content));
  if (allText.join("").length > TEXT_TO_TABLE_MAX_TEXT_LENGTH) return null;
  if (
    allText.every((text) => text.trim() === "") &&
    paragraphs.every((paragraph) =>
      paragraph.content.every((node) => isTextRun(node)),
    )
  ) {
    return null;
  }
  const markdown =
    delimiter === "pipe" && allText.length > 1 && isMarkdownPipeLine(allText[0]);
  const rows: TextTableRow[] = [];
  paragraphs.forEach((paragraph, index) => {
    const cells = (
      delimiter === "paragraph"
        ? [[...paragraph.content]]
        : splitParagraph(paragraph.content, delimiter)
    ).map((content) => ({ content }));
    // Markdown: "| h |" / "| --- |" / "| v |" → the header and value rows.
    if (markdown && index === 1 && isMarkdownSeparatorRow(cells)) return;
    rows.push({ attrs: paragraph.attrs ?? null, type: paragraph.type ?? null, cells });
  });
  if (rows.length === 0) return null;
  const width = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  // Require a real table shape: at least 2 columns OR at least 2 rows. A single
  // cell (no delimiter found, one line) is not a table.
  if (width < 1 || (width < 2 && rows.length < 2)) return null;
  if (width > TEXT_TO_TABLE_MAX_COLUMNS) return null;
  if (rows.length * width > TEXT_TO_TABLE_MAX_CELLS) return null;
  return rows.map((row) => ({
    attrs: row.attrs,
    type: row.type ?? null,
    cells:
      row.cells.length === width
        ? row.cells
        : [
            ...row.cells,
            ...Array.from({ length: width - row.cells.length }, () => ({
              content: [],
            })),
          ],
  }));
}

/**
 * The plain-text form of a conversion source: one paragraph per line. A single
 * trailing line break is the end of the last selected paragraph (a selection
 * that runs to the start of the next one), not an extra empty row.
 */
function textParagraphs(text: string): TextTableSourceParagraph[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n$/, "");
  return normalized
    .split("\n")
    .map((line) => ({ content: line ? [{ type: "text", text: line }] : [] }));
}

/**
 * The selection's text for the conversion dialog's preview: paragraphs on
 * separate lines; a line break inside a paragraph stays inside its line
 * (U+2028) and an inline object is one U+FFFC character, so the preview has
 * exactly the rows and columns the conversion of the real paragraphs makes.
 */
export function textTableSelectionText(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): string {
  // A paragraph the page cut is several textblocks on the page but one
  // paragraph of the document: its continuation fragments join their head
  // without a line break, so the preview has the rows the real conversion
  
  let text = "";
  let openBlock = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      if (openBlock && fragmentCarries("paragraphStart", node.attrs)) text += "\n";
      const contentStart = pos + 1;
      const start = Math.max(from, contentStart);
      const end = Math.min(to, contentStart + node.content.size);
      if (end > start) {
        text += doc.textBetween(start, end, "", (leaf) =>
          leaf.type.name === "hardBreak" ? "\u2028" : "\uFFFC",
        );
      }
      openBlock = true;
      return false;
    }
    if (node.isLeaf && openBlock) text += "\uFFFC";
    return true;
  });
  return text;
}

/**
 * The selected paragraphs with their formatted inline content, for converting
 * text to a table without flattening it to plain text. Partially selected
 * paragraphs contribute their selected part; an empty paragraph the selection
 * merely reaches into at its end is not a row. Null when the selection holds a
 * block that is not a paragraph of text (a picture, a rule, ...): converting it
 * would delete it.
 */
export function textTableSelectionParagraphs(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): TextTableSourceParagraph[] | null {
  const paragraphs: TextTableSourceParagraph[] = [];
  let unsupported = false;
  let lastReachedOnlyItsStart = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (unsupported) return false;
    if (node.isTextblock) {
      const contentStart = pos + 1;
      const start = Math.max(from, contentStart) - contentStart;
      const end = Math.min(to, contentStart + node.content.size) - contentStart;
      const content = node.content.cut(start, Math.max(start, end)).toJSON() as
        | TextTableInlineJson[]
        | null;
      const previous = paragraphs[paragraphs.length - 1];
      if (previous && !fragmentCarries("paragraphStart", node.attrs)) {
        // A continuation fragment of the paragraph before it (the page cut
        // it): the same paragraph, so its runs join the row the head started
        
        paragraphs[paragraphs.length - 1] = {
          ...previous,
          content: [...previous.content, ...(content ?? [])],
        };
      } else {
        paragraphs.push({ attrs: { ...node.attrs }, type: node.type.name, content: content ?? [] });
      }
      lastReachedOnlyItsStart = to <= contentStart;
      return false;
    }
    if (node.isLeaf) unsupported = true;
    return true;
  });
  if (unsupported) return null;
  if (paragraphs.length > 1 && lastReachedOnlyItsStart) paragraphs.pop();
  return paragraphs;
}

/**
 * Parse a text selection into a rectangular grid of cell strings, or null when
 * it cannot be a table. Same rules as {@link convertParagraphsToTableRows}
 * (which the editor command uses on the real paragraphs, so the dialog's
 * preview and the result agree).
 */
export function parseTextToTableRows(
  text: string,
  delimiter: TextTableConversionSeparator = detectTextToTableDelimiter(text),
): string[][] | null {
  if (typeof text !== "string" || text.length > TEXT_TO_TABLE_MAX_TEXT_LENGTH) {
    return null;
  }
  if (text.trim() === "") return null;
  const rows = convertParagraphsToTableRows(textParagraphs(text), delimiter);
  return rows
    ? rows.map((row) => row.cells.map((cell) => inlineText(cell.content)))
    : null;
}

/**
 * Auto-detect the most likely delimiter of a text block: tab if any line has a
 * tab, else pipe if any line has a pipe, else comma. Mirrors how Word's dialog
 * defaults the delimiter from the selection.
 */
export function detectTextToTableDelimiter(text: string): TextToTableDelimiter {
  if (text.includes("\t")) return "tab";
  if (text.includes("|")) return "pipe";
  return "comma";
}

/**
 * Paragraph attributes that are not formatting and are not copied into cells:
 * the identity of ONE source paragraph, and the pagination runtime flags
 * (`page…`) a paragraph cut by a page boundary carries.
 */
const PARAGRAPH_IDENTITY_ATTRS = new Set(["block_id", "source"]);
function isCopiedParagraphAttr(key: string): boolean {
  return !PARAGRAPH_IDENTITY_ATTRS.has(key) && !/^page[A-Z]/.test(key);
}

/**
 * Build the editor `table` JSON node from converted rows, one paragraph per
 * cell holding the cell's formatted runs; each cell paragraph keeps its source
 * paragraph's formatting attributes. Word's conversion default is an ordinary
 * table; callers opt into a header row explicitly. PURE.
 */
export function tableNodeFromConvertedRows(
  rows: readonly TextTableRow[],
  options: { withHeaderRow?: boolean } = {},
): Record<string, unknown> {
  const withHeaderRow = options.withHeaderRow ?? false;
  return {
    type: "table",
    content: rows.map((row, rowIdx) => {
      const attrs = row.attrs
        ? Object.fromEntries(
            Object.entries(row.attrs).filter(
              ([key, value]) => isCopiedParagraphAttr(key) && value !== null,
            ),
          )
        : null;
      return {
        type: "tableRow",
        content: row.cells.map((cell) => ({
          type: withHeaderRow && rowIdx === 0 ? "tableHeader" : "tableCell",
          content: [
            {
              // A heading converted into a cell is still a heading (Word keeps
              // the paragraph style); it was rebuilt as a paragraph and lost
              
              type: row.type === "heading" ? "heading" : "paragraph",
              ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
              ...(cell.content.length > 0 ? { content: cell.content } : {}),
            },
          ],
        })),
      };
    }),
  };
}

/**
 * The plain-text preview of a single editor table CELL node
 * (`tableCell`/`tableHeader`). Inline runs remain adjacent, hard breaks and
 * paragraph boundaries remain line breaks. Unknown shapes degrade to "".
 */
function cellNodeText(cell: unknown): string {
  if (!cell || typeof cell !== "object") return "";
  const content = (cell as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const nodeText = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { type?: unknown; text?: unknown; content?: unknown };
    if (n.type === "text" && typeof n.text === "string") {
      return n.text;
    }
    if (n.type === "hardBreak") return "\n";
    if (Array.isArray(n.content)) {
      return n.content.map(nodeText).join("");
    }
    return "";
  };
  return content.map(nodeText).join("\n");
}

/**
 * Flatten an editor `table` JSON node into rows of cell strings. Returns null
 * when the node is not a table or has no rows. Each row is one `tableRow`; each
 * cell is the joined text of a `tableCell`/`tableHeader`. PURE.
 */
export function tableNodeToRows(tableNode: unknown): string[][] | null {
  if (!tableNode || typeof tableNode !== "object") return null;
  const node = tableNode as { type?: unknown; content?: unknown };
  if (node.type !== "table" || !Array.isArray(node.content)) return null;
  const rows: string[][] = [];
  for (const row of node.content) {
    if (!row || typeof row !== "object") continue;
    const r = row as { type?: unknown; content?: unknown };
    if (r.type !== "tableRow" || !Array.isArray(r.content)) continue;
    rows.push(r.content.map((cell) => cellNodeText(cell)));
  }
  return rows.length ? rows : null;
}

/**
 * Render flattened table rows back to delimited text (Word "Convert Table to
 * Text"). Cells join with the delimiter char (tab/comma/pipe), rows with "\n".
 * PURE.
 */
export function tableRowsToText(
  rows: string[][],
  delimiter: TextTableConversionSeparator = "tab",
): string {
  if (delimiter === "paragraph") {
    return rows.flat().join("\n");
  }
  const sep =
    typeof delimiter === "object"
      ? normalizeTextTableOtherSeparator(delimiter.other)
      : delimiter === "tab"
        ? "\t"
        : delimiter === "comma"
          ? ", "
          : " | ";
  if (!sep) return "";
  return rows.map((row) => row.join(sep)).join("\n");
}

type TableTextJsonNode = Record<string, unknown>;

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]),
  );
}

function cellParagraphs(
  cell: unknown,
  separator: TextTableConversionSeparator,
): TableTextJsonNode[] | null {
  if (!cell || typeof cell !== "object") return null;
  const node = cell as { type?: unknown; content?: unknown };
  if (
    (node.type !== "tableCell" && node.type !== "tableHeader") ||
    !Array.isArray(node.content) ||
    node.content.length === 0
  ) {
    return null;
  }
  const paragraphs: TableTextJsonNode[] = [];
  for (const block of node.content) {
    if (!block || typeof block !== "object") return null;
    const paragraph = block as { type?: unknown; content?: unknown };
    // A table in the cell converts with it, its rows paragraphs of their own
    // with the same separator, as Word's Convert Table to Text does (Convert
    // nested tables, on by default; Word 16 measured: "A1\tb", "n00\tn01",
    // "n10\tn11", the cell's own last paragraph, "A2\tB2"). Refused, the
    // outer table could not be converted at all and the dialog said the
    // selection had changed (WUA 103).
    if (paragraph.type === "table") {
      const nested = tableNodeToTextBlocks(block, separator);
      if (!nested) return null;
      paragraphs.push(...nested);
      continue;
    }
    // Converting nested tables/lists by flattening them would silently destroy
    // structure. Keep the native command fail-closed until a typed conversion
    // rule exists for those block kinds.
    // A heading is a text block like a paragraph (Text to Table keeps it
    
    if (
      (paragraph.type !== "paragraph" && paragraph.type !== "heading") ||
      (paragraph.content !== undefined && !Array.isArray(paragraph.content))
    ) {
      return null;
    }
    paragraphs.push(cloneJsonValue(block) as TableTextJsonNode);
  }
  return paragraphs;
}

function separatorText(
  separator: Exclude<TextTableConversionSeparator, "paragraph">,
): string | null {
  if (typeof separator === "object") {
    return normalizeTextTableOtherSeparator(separator.other);
  }
  if (separator === "tab") return "\t";
  if (separator === "comma") return ", ";
  return " | ";
}

function mergeCellIntoLastParagraph(
  output: TableTextJsonNode[],
  cell: TableTextJsonNode[],
  separator: string,
): void {
  const previous = output[output.length - 1];
  const first = cell[0];
  if (!previous || !first) return;
  const previousContent = Array.isArray(previous.content)
    ? [...previous.content]
    : [];
  const firstContent = Array.isArray(first.content) ? first.content : [];
  output[output.length - 1] = {
    ...previous,
    content: [
      ...previousContent,
      { type: "text", text: separator },
      ...firstContent,
    ],
  };
  output.push(...cell.slice(1));
}

/**
 * Convert a native editor `table` JSON node into ordinary paragraph JSON while
 * preserving inline marks, hard breaks, authored whitespace and cell-internal
 * paragraph boundaries. Cell boundaries use the chosen separator; every table
 * row starts a new paragraph. Unsupported nested block content fails closed
 * instead of being flattened into lossy plain text. PURE.
 */
export function tableNodeToTextBlocks(
  tableNode: unknown,
  separator: TextTableConversionSeparator = "tab",
): TableTextJsonNode[] | null {
  if (!tableNode || typeof tableNode !== "object") return null;
  const table = tableNode as { type?: unknown; content?: unknown };
  if (
    table.type !== "table" ||
    !Array.isArray(table.content) ||
    table.content.length === 0
  ) {
    return null;
  }
  const boundary = separator === "paragraph" ? null : separatorText(separator);
  if (separator !== "paragraph" && !boundary) return null;

  const output: TableTextJsonNode[] = [];
  for (const row of table.content) {
    if (!row || typeof row !== "object") return null;
    const rowNode = row as { type?: unknown; content?: unknown };
    if (
      rowNode.type !== "tableRow" ||
      !Array.isArray(rowNode.content) ||
      rowNode.content.length === 0
    ) {
      return null;
    }
    const rowParagraphs: TableTextJsonNode[] = [];
    for (const [cellIndex, cell] of rowNode.content.entries()) {
      const paragraphs = cellParagraphs(cell, separator);
      if (!paragraphs) return null;
      if (cellIndex === 0 || separator === "paragraph") {
        rowParagraphs.push(...paragraphs);
      } else if (boundary) {
        mergeCellIntoLastParagraph(rowParagraphs, paragraphs, boundary);
      }
    }
    output.push(...rowParagraphs);
  }
  return output.length ? output : null;
}

/**
 * Build the editor `table` JSON node from a rectangular grid of cell strings
 * (the shape `parseTextToTableRows` returns). Word's conversion default is an
 * ordinary table; callers must opt into a header row explicitly. Mirrors the
 * node shape produced by the markdown parser
 * (table > tableRow > cell > paragraph). PURE.
 */
export function tableNodeFromRows(
  rows: string[][],
  options: { withHeaderRow?: boolean } = {},
): Record<string, unknown> {
  const withHeaderRow = options.withHeaderRow ?? false;
  return {
    type: "table",
    content: rows.map((row, rowIdx) => ({
      type: "tableRow",
      content: row.map((cellText) => ({
        type: withHeaderRow && rowIdx === 0 ? "tableHeader" : "tableCell",
        content: [
          cellText
            ? { type: "paragraph", content: [{ type: "text", text: cellText }] }
            : { type: "paragraph" },
        ],
      })),
    })),
  };
}
