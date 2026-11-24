/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers + types for the code execution's *richer* output rendering
 * (Jupyter MIME parity). These extend the structured `RichOutput` channel
 * (js-runner.ts) with the common display MIME types a notebook produces that
 * are NOT opaque raster bytes — inline SVG figures, LaTeX/math, a JSON value,
 * and markdown — while keeping every existing output type byte-for-byte the
 * same.
 *
 * Everything here is synchronous and side-effect free (no DOM, no React) so the
 * JSON-tree builder can be unit-tested in isolation. The React rendering
 * (KaTeX / react-markdown reuse) lives in CellOutput.tsx.
 *
 * Security posture (additive, defensive):
 *   - SVG and HTML share the canonical sanitizer + no-network iframe builder in
 *     `cell-output-sandbox.ts`; there is no second SVG-only rendering path.
 *   - JSON is rendered as a React tree of text nodes (never innerHTML), so a
 *     string value that looks like markup stays inert text.
 *   - LaTeX is rendered by KaTeX with throwOnError:false (KaTeX escapes its
 *     input; bad input degrades to the raw source, never to live markup).
 *   - Markdown is rendered by the app's shared `MarkdownContent` (react-markdown
 *     WITHOUT rehype-raw), so embedded HTML is escaped, not parsed.
 */

import type { RichOutput } from "@mrnote/core/web/lib/code-runner/js-runner.ts";

/**
 * The richer structured outputs the multi-buffer host can render, on top of the base
 * `RichOutput` union (table / image / html). Each new member is additive and
 * discriminated by `kind`, so an existing `RichOutput` value is also an
 * `ExtendedRichOutput` and renders exactly as before.
 */
export type ExtendedRichOutput =
  | RichOutput
  | {
      /** An inline SVG figure (e.g. matplotlib's SVG backend, image/svg+xml). */
      readonly kind: "svg";
      /** Raw SVG markup; SANITISED before render (script/handlers/refs removed). */
      readonly svg: string;
    }
  | {
      /** A LaTeX / math expression (text/latex or a math MIME). */
      readonly kind: "latex";
      /** Raw LaTeX source; rendered with KaTeX (throwOnError:false). */
      readonly latex: string;
      /** Inline ($…$) vs. block ($$…$$) display. Defaults to block. */
      readonly displayMode?: boolean;
    }
  | {
      /** A JSON value (application/json), shown as a collapsible tree. */
      readonly kind: "json";
      /** The already-parsed JSON value (any JSON-compatible shape). */
      readonly json: unknown;
    }
  | {
      /** A markdown document (text/markdown). */
      readonly kind: "markdown";
      /** Raw markdown source; rendered by the app's safe markdown renderer. */
      readonly markdown: string;
    };

/** A richer kind is one of the new members (not a base table/image/html). */
export function isExtendedRichKind(
  rich: ExtendedRichOutput,
): rich is Exclude<ExtendedRichOutput, RichOutput> {
  return (
    rich.kind === "svg" ||
    rich.kind === "latex" ||
    rich.kind === "json" ||
    rich.kind === "markdown"
  );
}

// ---------------------------------------------------------------------------
// Rich table windowing
// ---------------------------------------------------------------------------

/** Hard row/column ceilings for one rendered rich-table page. */
export const RICH_TABLE_ROW_PAGE_SIZE = 100;
export const RICH_TABLE_COLUMN_PAGE_SIZE = 25;

export interface RichTableWindow {
  readonly rows: readonly (readonly unknown[])[];
  readonly columns: readonly string[];
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly columnStart: number;
  readonly columnEnd: number;
  readonly rowPage: number;
  readonly rowPageCount: number;
  readonly columnPage: number;
  readonly columnPageCount: number;
  readonly totalRows: number;
  readonly totalColumns: number;
}

function boundedPageSize(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return maximum;
  return Math.min(maximum, Math.max(1, Math.floor(value)));
}

function boundedPage(value: number, pageCount: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(pageCount - 1, Math.max(0, Math.floor(value)));
}

/**
 * Select one stable row × column window for a potentially hostile rich table.
 *
 * Both dimensions are capped before React sees them, so a 1,000 × 100 persisted
 * table (or a larger transient runner result) never expands into an unbounded
 * DOM. The source arrays stay untouched for copy/download and ipynb export.
 */
export function buildRichTableWindow(
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  requestedRowPage = 0,
  requestedColumnPage = 0,
  requestedRowPageSize = RICH_TABLE_ROW_PAGE_SIZE,
  requestedColumnPageSize = RICH_TABLE_COLUMN_PAGE_SIZE,
): RichTableWindow {
  const rowPageSize = boundedPageSize(
    requestedRowPageSize,
    RICH_TABLE_ROW_PAGE_SIZE,
  );
  const columnPageSize = boundedPageSize(
    requestedColumnPageSize,
    RICH_TABLE_COLUMN_PAGE_SIZE,
  );
  const rowPageCount = Math.max(1, Math.ceil(rows.length / rowPageSize));
  const columnPageCount = Math.max(
    1,
    Math.ceil(columns.length / columnPageSize),
  );
  const rowPage = boundedPage(requestedRowPage, rowPageCount);
  const columnPage = boundedPage(requestedColumnPage, columnPageCount);
  const rowStart = rowPage * rowPageSize;
  const rowEnd = Math.min(rows.length, rowStart + rowPageSize);
  const columnStart = columnPage * columnPageSize;
  const columnEnd = Math.min(columns.length, columnStart + columnPageSize);

  return {
    rows: rows.slice(rowStart, rowEnd),
    columns: columns.slice(columnStart, columnEnd),
    rowStart,
    rowEnd,
    columnStart,
    columnEnd,
    rowPage,
    rowPageCount,
    columnPage,
    columnPageCount,
    totalRows: rows.length,
    totalColumns: columns.length,
  };
}

// ---------------------------------------------------------------------------
// JSON tree
// ---------------------------------------------------------------------------

/** A single node in the collapsible JSON tree (a flat, renderable description). */
export type JsonTreeNode =
  | {
      readonly kind: "primitive";
      readonly type: JsonPrimitiveType;
      readonly text: string;
    }
  | {
      readonly kind: "array";
      readonly children: readonly JsonTreeEntry[];
      /** True when the original array exceeded the node cap and was clipped. */
      readonly truncated: boolean;
    }
  | {
      readonly kind: "object";
      readonly children: readonly JsonTreeEntry[];
      readonly truncated: boolean;
    };

export type JsonPrimitiveType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "bigint";

/** A child of an array (numeric index) or object (string key). */
export interface JsonTreeEntry {
  /** Object key, or the array index as a string. */
  readonly key: string;
  /** True for an array element (renders without quoting the key). */
  readonly isIndex: boolean;
  readonly node: JsonTreeNode;
}

/** Largest number of entries we expand per container (anti-bloat guard). */
const JSON_MAX_ENTRIES = 1_000;
/** Deepest nesting we descend before rendering a `…` primitive (cycle guard). */
const JSON_MAX_DEPTH = 64;

/** Stringify a primitive for the tree (React escapes the returned text). */
function primitiveNode(value: unknown): JsonTreeNode {
  if (value === null) return { kind: "primitive", type: "null", text: "null" };
  switch (typeof value) {
    case "string":
      // Quote strings so they're visually distinct from keywords/numbers.
      return { kind: "primitive", type: "string", text: JSON.stringify(value) };
    case "number":
      return {
        kind: "primitive",
        type: "number",
        text: Number.isFinite(value) ? String(value) : String(value),
      };
    case "boolean":
      return {
        kind: "primitive",
        type: "boolean",
        text: value ? "true" : "false",
      };
    case "bigint":
      return {
        kind: "primitive",
        type: "bigint",
        text: `${value.toString()}n`,
      };
    case "undefined":
      return { kind: "primitive", type: "undefined", text: "undefined" };
    default:
      // Functions/symbols and anything else: a safe textual stand-in.
      return { kind: "primitive", type: "string", text: String(value) };
  }
}

/**
 * Build a renderable tree from an arbitrary JSON-compatible value. Caps the
 * number of children per container and the recursion depth so a huge or cyclic
 * structure can't build an unbounded payload or blow the stack. Pure.
 */
export function buildJsonTree(value: unknown, depth = 0): JsonTreeNode {
  if (depth >= JSON_MAX_DEPTH) {
    return { kind: "primitive", type: "string", text: "…" };
  }
  if (Array.isArray(value)) {
    const slice = value.slice(0, JSON_MAX_ENTRIES);
    const children: JsonTreeEntry[] = slice.map((item, index) => ({
      key: String(index),
      isIndex: true,
      node: buildJsonTree(item, depth + 1),
    }));
    return {
      kind: "array",
      children,
      truncated: value.length > slice.length,
    };
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).slice(0, JSON_MAX_ENTRIES);
    const children: JsonTreeEntry[] = keys.map((key) => ({
      key,
      isIndex: false,
      node: buildJsonTree(record[key], depth + 1),
    }));
    return {
      kind: "object",
      children,
      truncated: Object.keys(record).length > keys.length,
    };
  }
  return primitiveNode(value);
}
