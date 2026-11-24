"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { renderKatexInto } from "@mrnote/core/web/lib/katex-render.ts";
import { useIsDark } from "@mrnote/core/web/lib/theme.ts";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  Download,
  Info,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  CODE_OUTPUT_CHROME_CLASS,
  outputStyles,
} from "./codeOutputChrome";
import tracebackStyles from "./TracebackBlock.module.css";

import MarkdownContent from "@mrnote/core/web/__cut__/mf8d64ee10b.tsx";
import AnsiText from "./AnsiText";
import { downloadBlobFile, downloadTextFile } from "@mrnote/core/web/lib/download-file.ts";
import { toDelimitedText } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import {
  CODE_OUTPUT_EXPORT_FILENAME,
  createCellOutputExport,
} from "../../../../lib/code-runner/cell-output-export";
import {
  parseTraceback,
  type TracebackFrame,
} from "@mrnote/core/web/lib/code-runner/cell-output-format.ts";
import { resolveOutputAttachmentImageUrl } from "../../../../lib/code-runner/output-attachments";
import type { RunResult } from "@mrnote/core/web/lib/code-runner/js-runner.ts";
import {
  isAllowedRichImageMime,
  MAX_IMAGE_CHARS,
} from "../../../../lib/code-runner/output-persistence";
import {
  RUN_OUTPUT_LOG_PAGE_SIZE,
  buildRunOutputLogWindow,
} from "../../../../lib/code-runner/run-output-workbench";
import {
  RICH_TABLE_COLUMN_PAGE_SIZE,
  RICH_TABLE_ROW_PAGE_SIZE,
  buildRichTableWindow,
  buildJsonTree,
  isExtendedRichKind,
  type ExtendedRichOutput,
  type JsonTreeNode,
} from "./cell-rich-output";
import {
  buildCodeOutputDocument,
  emptyCodeOutputDocument,
  type CodeOutputSandboxMarkupKind,
} from "./cell-output-sandbox";
import { replaceBehind } from "@mrnote/core/web/lib/regexp-behind.ts";

const CODE_OUTPUT_TABLE_EXPORT_FILENAME = "code-output-table.csv";

/**
 * The traceback card's inks (TracebackBlock.module.css reads them as --tb-*).
 * The panel takes the theme's surface, so in the dark and high-contrast themes
 * the saturated reds would sit dark-on-dark (or as pale islands); there the
 * same roles take the dark steps. Everything else in an output takes the
 * shared dialog chrome's inks (CodeOutputContent.module.css).
 */
const OUTPUT_INKS = {
  light: {
    traceBorder: "#f3caca",
    traceCard: "var(--bg-surface, #fff)",
    traceHead: "#fdf4f4",
    traceHeadInk: "#7f1d1d",
    traceIcon: "#dc2626",
    traceLabel: "#991b1b",
    traceLabelBg: "#fde2e2",
    traceBody: "#991b1b",
    traceChipLink: "#fee2e2",
    traceMuted: "#8b5c5c",
    traceHintBg: "#fff7e6",
    traceHintInk: "#7c4a03",
  },
  dark: {
    traceBorder: "rgb(248 113 113 / 32%)",
    traceCard: "rgb(248 113 113 / 5%)",
    traceHead: "rgb(248 113 113 / 11%)",
    traceHeadInk: "#fecaca",
    traceIcon: "#f87171",
    traceLabel: "#fca5a5",
    traceLabelBg: "rgb(248 113 113 / 18%)",
    traceBody: "#fca5a5",
    traceChipLink: "rgb(248 113 113 / 20%)",
    traceMuted: "#c9a3a3",
    traceHintBg: "rgb(251 191 36 / 12%)",
    traceHintInk: "#fcd9a0",
  },
} as const;
type OutputInks = (typeof OUTPUT_INKS)[keyof typeof OUTPUT_INKS];

function useOutputInks(): OutputInks {
  return useIsDark() ? OUTPUT_INKS.dark : OUTPUT_INKS.light;
}

const RASTER_IMAGE_EXTENSIONS = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
} as const);

function outputImageBlob(data: string, mime: string): Blob | null {
  if (
    !isAllowedRichImageMime(mime) ||
    !data ||
    data.length > MAX_IMAGE_CHARS ||
    typeof globalThis.atob !== "function" ||
    typeof Blob === "undefined"
  ) {
    return null;
  }
  try {
    const binary = globalThis.atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes.buffer], { type: mime });
  } catch {
    return null;
  }
}

function DownloadableOutputImage({
  data,
  mime,
  index,
  alt,
}: {
  data: string;
  mime: string;
  index: number;
  alt: string;
}) {
  const t = useTranslations("console-notebooks");
  const trustedMime = isAllowedRichImageMime(mime);
  const normalizedMime = trustedMime ? mime : "image/png";
  const [downloadFailure, setDownloadFailure] = useState<{
    data: string;
    mime: string;
    message: string;
  } | null>(null);
  const error =
    downloadFailure?.data === data && downloadFailure.mime === normalizedMime
      ? downloadFailure.message
      : null;
  const downloadLabel = `${t("code.download")} ${alt}`;
  const downloadImage = useCallback(() => {
    const fail = () =>
      setDownloadFailure({
        data,
        mime: normalizedMime,
        message: t("toolbar.exportFailed", { format: normalizedMime }),
      });
    if (!trustedMime) {
      fail();
      return;
    }
    const blob = outputImageBlob(data, normalizedMime);
    const extension =
      RASTER_IMAGE_EXTENSIONS[
        normalizedMime as keyof typeof RASTER_IMAGE_EXTENSIONS
      ];
    if (
      !blob ||
      !extension ||
      !downloadBlobFile(`code-output-image-${index + 1}.${extension}`, blob)
    ) {
      fail();
      return;
    }
    setDownloadFailure(null);
  }, [data, index, normalizedMime, t, trustedMime]);

  return (
    <div data-testid="code-output-image-frame" className={outputStyles.figure}>
      <div className={`${officeDialogParts.well} ${outputStyles.figureWell}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="code-output-image"
          src={`data:${normalizedMime};base64,${data}`}
          alt={alt}
        />
      </div>
      <button
        type="button"
        onClick={downloadImage}
        data-testid="code-output-image-download"
        title={downloadLabel}
        aria-label={downloadLabel}
        className={officeDialogParts.compactButton}
      >
        <Download size={12} aria-hidden="true" />
        {t("code.download")}
      </button>
      {error ? (
        <div
          role="alert"
          data-testid="code-output-image-download-error"
          className={officeDialogParts.error}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders a code execution's result, Jupyter-style: stderr/error, stdout lines,
 * matplotlib PNG figures, a rich HTML repr (e.g. a pandas DataFrame), structured
 * tabular/image outputs, and the final expression's text value.
 *
 * Security: a `rich` table is rendered as a native React `<table>` so every cell
 * is auto-escaped (no `dangerouslySetInnerHTML`, so untrusted strings can never
 * become markup). HTML (legacy `output.html` or `rich.kind === "html"`) is only
 * ever rendered inside a locked-down sandbox iframe (`sandbox=""`, no
 * allow-scripts) with a fixed no-network CSP. The shared output builder also
 * strips active/navigation elements and remote URL/CSS fetch primitives before
 * HTML or SVG reaches `srcDoc`.
 */

/** Stringify a table cell for display; React escapes the returned text. */
function cellText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

type RichTableSortDirection = "ascending" | "descending";

function compareRichTableCells(left: unknown, right: unknown): number {
  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";
  if (leftMissing || rightMissing) {
    if (leftMissing === rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }
  if (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right)
  ) {
    return left - right;
  }
  return cellText(left).localeCompare(cellText(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function RichTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly (readonly unknown[])[];
}) {
  const t = useTranslations("console-notebooks");
  const [rowPage, setRowPage] = useState(0);
  const [columnPage, setColumnPage] = useState(0);
  const [sortState, setSortState] = useState<{
    columns: readonly string[];
    columnIndex: number;
    direction: RichTableSortDirection;
  } | null>(null);
  const [csvFailure, setCsvFailure] = useState<{
    columns: readonly string[];
    rows: readonly (readonly unknown[])[];
    message: string;
  } | null>(null);
  const activeSort =
    sortState?.columns === columns &&
    sortState.columnIndex >= 0 &&
    sortState.columnIndex < columns.length
      ? sortState
      : null;
  const sortedRows = useMemo(() => {
    if (!activeSort) return rows;
    const direction = activeSort.direction === "ascending" ? 1 : -1;
    return rows
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .sort((left, right) => {
        const leftValue = left.row[activeSort.columnIndex];
        const rightValue = right.row[activeSort.columnIndex];
        const compared = compareRichTableCells(leftValue, rightValue);
        if (compared === 0) return left.sourceIndex - right.sourceIndex;
        const missing =
          leftValue === null ||
          leftValue === undefined ||
          leftValue === "" ||
          rightValue === null ||
          rightValue === undefined ||
          rightValue === "";
        return missing ? compared : compared * direction;
      })
      .map((entry) => entry.row);
  }, [activeSort, rows]);
  const window = useMemo(
    () => buildRichTableWindow(columns, sortedRows, rowPage, columnPage),
    [columnPage, columns, rowPage, sortedRows],
  );
  const rowsLabel = t("toolbar.insertTableRows");
  const columnsLabel = t("toolbar.insertTableColumns");
  const rowRange = `${rowsLabel} ${
    window.totalRows === 0 ? 0 : window.rowStart + 1
  }–${window.rowEnd} / ${window.totalRows}`;
  const columnRange = `${columnsLabel} ${
    window.totalColumns === 0 ? 0 : window.columnStart + 1
  }–${window.columnEnd} / ${window.totalColumns}`;
  const csvLabel = `${t("code.download")} CSV`;
  const csvError =
    csvFailure?.columns === columns && csvFailure.rows === sortedRows
      ? csvFailure.message
      : null;
  const downloadCsv = useCallback(() => {
    const fail = () =>
      setCsvFailure({
        columns,
        rows: sortedRows,
        message: t("toolbar.exportFailed", { format: "CSV" }),
      });
    try {
      if (columns.length === 0) {
        fail();
        return;
      }
      const csv = toDelimitedText(
        [
          [...columns],
          ...sortedRows.map((row) =>
            columns.map((_column, index) => cellText(row[index])),
          ),
        ],
        ",",
        true,
      );
      if (
        !downloadTextFile(
          CODE_OUTPUT_TABLE_EXPORT_FILENAME,
          `\uFEFF${csv}`,
          "text/csv;charset=utf-8",
        )
      ) {
        fail();
        return;
      }
      setCsvFailure(null);
    } catch {
      fail();
    }
  }, [columns, sortedRows, t]);
  const toggleSort = (columnIndex: number) => {
    setRowPage(0);
    setSortState((current) => {
      if (current?.columns !== columns || current.columnIndex !== columnIndex) {
        return { columns, columnIndex, direction: "ascending" };
      }
      if (current.direction === "ascending") {
        return { columns, columnIndex, direction: "descending" };
      }
      return null;
    });
  };

  const rowPager =
    window.rowPageCount > 1 ? (
      <span className={outputStyles.pagerAxis}>
        <button
          type="button"
          data-testid="code-output-table-rows-previous"
          disabled={window.rowPage === 0}
          onClick={() => setRowPage(window.rowPage - 1)}
          aria-label={
            window.rowPage === 0
              ? rowRange
              : `${rowsLabel} ${Math.max(
                  1,
                  window.rowStart - RICH_TABLE_ROW_PAGE_SIZE + 1,
                )}–${window.rowStart}`
          }
          className={officeDialogParts.iconButton}
        >
          <ChevronLeft size={13} aria-hidden="true" />
        </button>
        <span
          data-testid="code-output-table-rows-range"
          aria-live="polite"
          className={outputStyles.pagerRange}
        >
          {rowRange}
        </span>
        <button
          type="button"
          data-testid="code-output-table-rows-next"
          disabled={window.rowPage >= window.rowPageCount - 1}
          onClick={() => setRowPage(window.rowPage + 1)}
          aria-label={
            window.rowPage >= window.rowPageCount - 1
              ? rowRange
              : `${rowsLabel} ${window.rowEnd + 1}–${Math.min(
                  window.totalRows,
                  window.rowEnd + RICH_TABLE_ROW_PAGE_SIZE,
                )}`
          }
          className={officeDialogParts.iconButton}
        >
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </span>
    ) : null;
  const columnPager =
    window.columnPageCount > 1 ? (
      <span className={outputStyles.pagerAxis}>
        <button
          type="button"
          data-testid="code-output-table-columns-previous"
          disabled={window.columnPage === 0}
          onClick={() => setColumnPage(window.columnPage - 1)}
          aria-label={
            window.columnPage === 0
              ? columnRange
              : `${columnsLabel} ${Math.max(
                  1,
                  window.columnStart - RICH_TABLE_COLUMN_PAGE_SIZE + 1,
                )}–${window.columnStart}`
          }
          className={officeDialogParts.iconButton}
        >
          <ChevronLeft size={13} aria-hidden="true" />
        </button>
        <span
          data-testid="code-output-table-columns-range"
          aria-live="polite"
          className={outputStyles.pagerRange}
        >
          {columnRange}
        </span>
        <button
          type="button"
          data-testid="code-output-table-columns-next"
          disabled={window.columnPage >= window.columnPageCount - 1}
          onClick={() => setColumnPage(window.columnPage + 1)}
          aria-label={
            window.columnPage >= window.columnPageCount - 1
              ? columnRange
              : `${columnsLabel} ${window.columnEnd + 1}–${Math.min(
                  window.totalColumns,
                  window.columnEnd + RICH_TABLE_COLUMN_PAGE_SIZE,
                )}`
          }
          className={officeDialogParts.iconButton}
        >
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </span>
    ) : null;

  return (
    <div className={outputStyles.table}>
      <div className={outputStyles.tableToolbar}>
        {rowPager || columnPager ? (
          <div
            data-testid="code-output-table-pagination"
            role="group"
            aria-label={t("codeOutput.showOutput")}
            className={outputStyles.pager}
          >
            {rowPager}
            {columnPager}
          </div>
        ) : null}
        <div
          data-testid="code-output-table-actions"
          className={outputStyles.tableActions}
        >
          <button
            type="button"
            onClick={downloadCsv}
            disabled={columns.length === 0}
            data-testid="code-output-table-download-csv"
            title={csvLabel}
            aria-label={csvLabel}
            className={officeDialogParts.compactButton}
          >
            <Download size={12} aria-hidden="true" />
            {csvLabel}
          </button>
        </div>
      </div>
      {csvError ? (
        <div
          role="alert"
          data-testid="code-output-table-export-error"
          className={officeDialogParts.error}
        >
          {csvError}
        </div>
      ) : null}
      <div className={`${officeDialogParts.well} ${outputStyles.tableWell}`}>
        <table
          data-testid="code-output-table"
          aria-rowcount={window.totalRows + 1}
          aria-colcount={window.totalColumns}
          className={officeDialogParts.table}
        >
          <thead>
            <tr aria-rowindex={1}>
              {window.columns.map((col, index) => {
                const sourceColumnIndex = window.columnStart + index;
                const direction =
                  activeSort?.columnIndex === sourceColumnIndex
                    ? activeSort.direction
                    : null;
                const nextAction =
                  direction === "ascending"
                    ? t("spreadsheet.sortDesc")
                    : direction === "descending"
                      ? `${t("code.console.clear")}: ${t("toolbar.sort")}`
                      : t("spreadsheet.sortAsc");
                const SortGlyph =
                  direction === "ascending"
                    ? ArrowUp
                    : direction === "descending"
                      ? ArrowDown
                      : ChevronsUpDown;
                return (
                  <th
                    key={sourceColumnIndex}
                    aria-colindex={sourceColumnIndex + 1}
                    aria-sort={direction ?? "none"}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(sourceColumnIndex)}
                      data-testid={`code-output-table-sort-${sourceColumnIndex}`}
                      data-sort={direction ?? undefined}
                      title={`${col}: ${nextAction}`}
                      aria-label={`${col}: ${nextAction}`}
                      className={outputStyles.sortButton}
                    >
                      <span>{col}</span>
                      <span aria-hidden="true" className={outputStyles.sortGlyph}>
                        <SortGlyph size={11} aria-hidden="true" />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {window.rows.map((row, rowIndex) => (
              <tr
                key={window.rowStart + rowIndex}
                aria-rowindex={window.rowStart + rowIndex + 2}
              >
                {window.columns.map((_, colIndex) => {
                  const sourceColumnIndex = window.columnStart + colIndex;
                  return (
                    <td
                      key={sourceColumnIndex}
                      aria-colindex={sourceColumnIndex + 1}
                    >
                      {cellText(row[sourceColumnIndex])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "Show output (+N)" at a long log's (or notebook's) hidden end. */
function ShowMoreOutputButton({
  testId,
  hidden,
  count,
  direction,
  label,
  onClick,
}: {
  testId: string;
  hidden: number;
  count: number;
  direction: "older" | "newer";
  label: string;
  onClick: () => void;
}) {
  const Glyph = direction === "older" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      data-testid={testId}
      data-hidden={hidden}
      onClick={onClick}
      aria-label={`${label} (+${count})`}
      className={`${officeDialogParts.compactButton} ${outputStyles.more}`}
    >
      <Glyph size={11} aria-hidden="true" />
      {label} (+{count})
    </button>
  );
}

function SandboxedMarkup({
  markup,
  kind,
  title,
  testId,
}: {
  markup: string;
  kind: CodeOutputSandboxMarkupKind;
  title: string;
  testId: "code-output-html" | "code-output-svg";
}) {
  // Keep SSR and the first hydrated render deterministic and empty. Sanitizing
  // requires the browser DOM, so untrusted markup is only installed after mount
  // and is never transiently exposed in an unsanitized srcdoc.
  const [srcDoc, setSrcDoc] = useState(() => emptyCodeOutputDocument(kind));
  useEffect(() => {
    setSrcDoc(buildCodeOutputDocument(markup, kind));
  }, [kind, markup]);

  return (
    <iframe
      data-testid={testId}
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      className={`${officeDialogParts.well} ${outputStyles.sandbox}`}
    />
  );
}

function SandboxedHtml({ html, title }: { html: string; title: string }) {
  return (
    <SandboxedMarkup
      markup={html}
      kind="html"
      title={title}
      testId="code-output-html"
    />
  );
}

/**
 * An inline SVG figure (e.g. matplotlib's SVG backend). SVG is XML markup, not
 * opaque raster bytes, so it can carry <script>, on* handlers, and external
 * refs. SVG and HTML deliberately use the same sanitizer + sandbox-document
 * builder: active elements and remote fetch primitives are removed, then a
 * fixed CSP independently blocks any missed network/script capability.
 */
function SvgOutput({ svg, title }: { svg: string; title: string }) {
  return (
    <SandboxedMarkup
      markup={svg}
      kind="svg"
      title={title}
      testId="code-output-svg"
    />
  );
}

/**
 * A LaTeX / math expression, rendered with KaTeX (already an app dependency;
 * the document editor's MathBlock/InlineMath use the same library). We render
 * into a ref'd node via `katex.render(..., { throwOnError: false })` — the same
 * safe pattern as MathBlock — so malformed LaTeX degrades to the raw source
 * text instead of throwing or injecting markup (KaTeX escapes its input).
 */
function LatexOutput({
  latex,
  displayMode,
  label,
}: {
  latex: string;
  displayMode: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    try {
      renderKatexInto(node, latex, { displayMode, throwOnError: false });
    } catch {
      // Last-resort fallback: show the raw source as text (auto-escaped).
      node.textContent = latex;
    }
  }, [latex, displayMode]);
  return (
    <div
      data-testid="code-output-latex"
      ref={ref}
      role="math"
      aria-label={label}
      className={outputStyles.latex}
    />
  );
}

/** The ink of a JSON leaf, by its value's type. */
const JSON_LEAF_CLASS: Readonly<Record<string, string>> = {
  string: outputStyles.jsonString,
  number: outputStyles.jsonNumber,
  bigint: outputStyles.jsonNumber,
  boolean: outputStyles.jsonBoolean,
  null: outputStyles.jsonMuted,
  undefined: outputStyles.jsonMuted,
};

/** One row of the JSON tree (a key + its value/subtree). Recurses for containers. */
function JsonTreeRow({
  label,
  isIndex,
  node,
  expandLabel,
  collapseLabel,
  defaultOpen,
}: {
  label: string | null;
  isIndex: boolean;
  node: JsonTreeNode;
  expandLabel: string;
  collapseLabel: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isContainer = node.kind === "array" || node.kind === "object";
  const keyNode =
    label === null ? null : (
      <span className={isIndex ? outputStyles.jsonMuted : outputStyles.jsonKey}>
        {isIndex ? `${label}: ` : `${JSON.stringify(label)}: `}
      </span>
    );

  if (!isContainer) {
    // A primitive leaf: key (if any) + the stringified value, both text nodes.
    return (
      <div className={outputStyles.jsonRow}>
        {keyNode}
        <span className={JSON_LEAF_CLASS[node.type]}>{node.text}</span>
      </div>
    );
  }

  const open_ = node.kind === "array" ? "[" : "{";
  const close = node.kind === "array" ? "]" : "}";
  return (
    <div className={outputStyles.jsonRow}>
      <button
        type="button"
        data-testid="code-output-json-toggle"
        aria-expanded={open}
        aria-label={open ? collapseLabel : expandLabel}
        onClick={() => setOpen((v) => !v)}
        className={outputStyles.jsonToggle}
      >
        <span className={outputStyles.jsonChevron}>
          <ChevronRight size={11} aria-hidden="true" />
        </span>
        {keyNode}
        <span className={outputStyles.jsonMuted}>
          {open ? open_ : `${open_}…${close}`}
        </span>
      </button>
      {open ? (
        <div>
          {node.children.map((entry, index) => (
            <JsonTreeRow
              key={index}
              label={entry.key}
              isIndex={entry.isIndex}
              node={entry.node}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
              defaultOpen={defaultOpen}
            />
          ))}
          {node.truncated ? (
            <div className={`${outputStyles.jsonRow} ${outputStyles.jsonMuted}`}>
              …
            </div>
          ) : null}
          <div className={outputStyles.jsonMuted}>{close}</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A pretty, collapsible JSON tree (application/json). Built in-house from a
 * pure tree description (`buildJsonTree`) and rendered entirely as React text
 * nodes — never `innerHTML` — so a string value that looks like markup stays
 * inert text. Top-level containers start expanded.
 */
function JsonTree({
  value,
  expandLabel,
  collapseLabel,
}: {
  value: unknown;
  expandLabel: string;
  collapseLabel: string;
}) {
  const tree = useMemo(() => buildJsonTree(value), [value]);
  return (
    <div
      data-testid="code-output-json"
      className={`${officeDialogParts.mono} ${outputStyles.json}`}
    >
      <JsonTreeRow
        label={null}
        isIndex={false}
        node={tree}
        expandLabel={expandLabel}
        collapseLabel={collapseLabel}
        defaultOpen
      />
    </div>
  );
}

/**
 * A markdown document (text/markdown), rendered with the app's shared
 * `MarkdownContent` (react-markdown, GFM + math, WITHOUT rehype-raw), so
 * embedded HTML is escaped rather than parsed and links go through the app's
 * safe-href transform. Reusing this component means no new markdown dependency
 * and identical rendering to chat/AI output.
 */
function MarkdownOutput({ markdown }: { markdown: string }) {
  return (
    <div data-testid="code-output-markdown" className={outputStyles.markdown}>
      <MarkdownContent
        text={markdown}
        className="code-output-markdown"
        // Notebook output has no authored-cell attachment context. Reject every
        // Markdown image source instead of letting an imported output trigger a
        // network request (or smuggle a different URL scheme) during render.
        resolveImageUrl={() => null}
      />
    </div>
  );
}

function RichOutputView({
  rich,
  imageIndex,
  htmlTitle,
  imageAlt,
  svgTitle,
  latexLabel,
  jsonExpandLabel,
  jsonCollapseLabel,
}: {
  rich: ExtendedRichOutput;
  imageIndex: number;
  htmlTitle: string;
  imageAlt: string;
  svgTitle: string;
  latexLabel: string;
  jsonExpandLabel: string;
  jsonCollapseLabel: string;
}) {
  // New (additive) richer MIME kinds first; the base table/image/html branches
  // below are unchanged, so every existing rich output renders exactly as before.
  if (isExtendedRichKind(rich)) {
    if (rich.kind === "svg") {
      return <SvgOutput svg={rich.svg} title={svgTitle} />;
    }
    if (rich.kind === "latex") {
      return (
        <LatexOutput
          latex={rich.latex}
          displayMode={rich.displayMode ?? true}
          label={latexLabel}
        />
      );
    }
    if (rich.kind === "json") {
      return (
        <JsonTree
          value={rich.json}
          expandLabel={jsonExpandLabel}
          collapseLabel={jsonCollapseLabel}
        />
      );
    }
    // rich.kind === "markdown"
    return <MarkdownOutput markdown={rich.markdown} />;
  }
  if (rich.kind === "table") {
    return <RichTable columns={rich.columns} rows={rich.rows} />;
  }
  if (rich.kind === "image") {
    return (
      <DownloadableOutputImage
        data={rich.data}
        mime={rich.mime}
        index={imageIndex}
        alt={imageAlt}
      />
    );
  }
  return <SandboxedHtml html={rich.html} title={htmlTitle} />;
}

/**
 * Modules Python in the browser (Pyodide) cannot provide: they open a desktop
 * window or drive a terminal. Their import fails with ModuleNotFoundError.
 */
const BROWSER_UNAVAILABLE_MODULES = new Set([
  "tkinter",
  "_tkinter",
  "turtle",
  "turtledemo",
  "idlelib",
  "curses",
  "readline",
]);

function browserUnavailableModule(
  errorType: string | undefined,
  message: string | undefined,
): string | null {
  if (errorType !== "ModuleNotFoundError" || !message) return null;
  const name = /No module named '([\w.]+)'/.exec(message)?.[1];
  if (!name) return null;
  const root = name.split(".")[0];
  return BROWSER_UNAVAILABLE_MODULES.has(root) ? root : null;
}

/**
 * One source location of a traceback. A frame in the run's own source is a
 * button that moves the editor there (Jupyter/Colab parity); a frame in another
 * file is shown, inert. All text is React-escaped.
 */
function TracebackFrameRow({
  frame,
  lineLabel,
  jumpLabel,
  ownCodeLabel,
  onFrameClick,
}: {
  frame: TracebackFrame;
  lineLabel: (line: number) => string;
  jumpLabel: (line: number) => string;
  ownCodeLabel: string;
  onFrameClick?: (frame: TracebackFrame) => void;
}) {
  const navigable = frame.cell && Boolean(onFrameClick);
  const file = frame.file && !frame.cell ? frame.file : null;
  const content = (
    <>
      <span className={tracebackStyles.frameWhere}>
        {frame.func ?? frame.file ?? ""}
        {file ? <span className={tracebackStyles.frameFile}>{file}</span> : null}
        {frame.cell ? <span className={tracebackStyles.frameTag}>{ownCodeLabel}</span> : null}
      </span>
      <span className={tracebackStyles.frameLine}>{lineLabel(frame.line)}</span>
    </>
  );
  return navigable ? (
    <button
      type="button"
      className={tracebackStyles.frame}
      data-testid="code-traceback-frame"
      data-frame-navigable="true"
      onClick={() => onFrameClick?.(frame)}
      title={jumpLabel(frame.line)}
      aria-label={jumpLabel(frame.line)}
    >
      {content}
    </button>
  ) : (
    <span
      className={tracebackStyles.frame}
      data-testid="code-traceback-frame"
      data-frame-navigable="false"
      // The location verbatim, so the user sees where it points even though
      // the caret cannot go there.
      title={frame.file}
    >
      {content}
    </span>
  );
}

/**
 * Where a traceback happened: the frames in the code the user wrote or
 * imported, in printed order, and the runtime's own evaluation frames
 * (Pyodide's `_pyodide/_base.py`) folded behind a disclosure.
 */
function TracebackFrames({
  frames,
  framesLabel,
  jumpLabel,
  lineLabel,
  onFrameClick,
}: {
  frames: readonly TracebackFrame[];
  framesLabel: string;
  jumpLabel: (line: number) => string;
  lineLabel: (line: number) => string;
  onFrameClick?: (frame: TracebackFrame) => void;
}) {
  const t = useTranslations("console-notebooks");
  if (frames.length === 0) return null;
  const own = frames.filter((frame) => !frame.runtime);
  const runtime = frames.filter((frame) => frame.runtime);
  const row = (frame: TracebackFrame, index: number) => (
    <TracebackFrameRow
      key={index}
      frame={frame}
      lineLabel={lineLabel}
      jumpLabel={jumpLabel}
      ownCodeLabel={t("codeOutput.tracebackYourCode")}
      onFrameClick={onFrameClick}
    />
  );
  return (
    <div
      className={tracebackStyles.section}
      data-testid="code-output-traceback-frames"
      role="group"
      aria-label={framesLabel}
    >
      <div className={tracebackStyles.sectionTitle}>
        {t("codeOutput.tracebackWhere")}
      </div>
      {own.length > 0 ? (
        <div className={tracebackStyles.frames}>{own.map(row)}</div>
      ) : null}
      {runtime.length > 0 ? (
        <details className={tracebackStyles.runtime}>
          <summary>
            <ChevronRight size={12} aria-hidden="true" />
            {t("codeOutput.tracebackRuntimeFrames", { count: runtime.length })}
          </summary>
          <div className={tracebackStyles.frames}>{runtime.map(row)}</div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * A raised error / traceback: the error class as the title and its message
 * under it, a plain-language hint when we know why it happened, where it
 * happened, and the full traceback behind a disclosure (open when the text is
 * all there is, e.g. a compiler's output). Parsed (pure) from the runner's
 * `error`; React escapes everything, so an error string never injects markup.
 */
function TracebackBlock({
  error,
  label,
  framesLabel,
  jumpLabel,
  lineLabel,
  onFrameClick,
  action,
  details,
}: {
  error: string;
  /** The kind of error, over its title ("Traceback"); none for a failure
   * that is not one (a compile that failed). */
  label: string | null;
  framesLabel: string;
  jumpLabel: (line: number) => string;
  lineLabel: (line: number) => string;
  onFrameClick?: (frame: TracebackFrame) => void;
  /** Shown at the right of the header (the Code window's AI action). */
  action?: ReactNode;
  /** Shown under the header (the Code window's located problems). */
  details?: ReactNode;
}) {
  const t = useTranslations("console-notebooks");
  const { header, errorType, message, note, body, frames } = parseTraceback(error);
  // When the body is just the header line (e.g. a one-line "Type: message"),
  // don't repeat it underneath.
  const showBody = body.trim() !== "" && body.trim() !== header.trim();
  const ink = useOutputInks();
  // The header reads as a title: "Compilation failed", not "...failed."
  // One closing full stop, not an ellipsis's last (tested in code: Safari
  // before 16.4 cannot compile a lookbehind).
  const title = errorType ?? replaceBehind(header, /[.。．]$/u, { char: /\./, not: true }, () => "", false);
  const unavailableModule = browserUnavailableModule(errorType, message);
  const inks = {
    "--tb-border": ink.traceBorder,
    "--tb-card": ink.traceCard,
    "--tb-head": ink.traceHead,
    "--tb-head-ink": ink.traceHeadInk,
    "--tb-icon": ink.traceIcon,
    "--tb-label": ink.traceLabel,
    "--tb-label-bg": ink.traceLabelBg,
    "--tb-body": ink.traceBody,
    "--tb-chip-link": ink.traceChipLink,
    "--tb-muted": ink.traceMuted,
    "--tb-hint-bg": ink.traceHintBg,
    "--tb-hint-ink": ink.traceHintInk,
  } as CSSProperties;
  return (
    <div
      className={tracebackStyles.card}
      data-testid="code-output-traceback"
      role="alert"
      style={inks}
    >
      <div
        className={tracebackStyles.head}
        data-testid="code-output-traceback-header"
      >
        <span className={tracebackStyles.badge}>
          <CircleAlert size={16} aria-hidden="true" />
        </span>
        <div className={tracebackStyles.titles}>
          {label ? <span className={tracebackStyles.eyebrow}>{label}</span> : null}
          <span className={tracebackStyles.title}>
            {title}
            {/* Read and copied as "Type: message"; shown as two lines. */}
            {errorType && message ? (
              <span className={tracebackStyles.separator}>: </span>
            ) : null}
          </span>
          {errorType && message ? (
            <span className={tracebackStyles.message}>{message}</span>
          ) : null}
          {note && !unavailableModule ? (
            <span className={tracebackStyles.note}>{note}</span>
          ) : null}
        </div>
        {action ? <div className={tracebackStyles.action}>{action}</div> : null}
      </div>
      {unavailableModule ? (
        <p className={tracebackStyles.hint} data-testid="code-output-traceback-hint">
          <Info size={14} aria-hidden="true" />
          <span>
            {t("codeOutput.browserModuleUnavailable", { module: unavailableModule })}
          </span>
        </p>
      ) : null}
      {details ? <div className={tracebackStyles.section}>{details}</div> : null}
      <TracebackFrames
        frames={frames}
        framesLabel={framesLabel}
        jumpLabel={jumpLabel}
        lineLabel={lineLabel}
        onFrameClick={onFrameClick}
      />
      {showBody ? (
        <details
          className={`${tracebackStyles.section} ${tracebackStyles.full}`}
          open={!errorType && frames.length === 0}
        >
          <summary>
            <ChevronRight size={12} aria-hidden="true" />
            {t("codeOutput.tracebackFull")}
          </summary>
          <pre
            className={tracebackStyles.body}
            data-testid="code-output-traceback-body"
          >
            {body}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

type OrderedMimeSelection =
  | { kind: "html"; value: string }
  | { kind: "svg"; value: string }
  | { kind: "raster"; mime: string; value: string }
  | { kind: "latex"; value: string }
  | { kind: "json"; value: unknown }
  | { kind: "markdown"; value: string }
  | { kind: "text"; value: string }
  | { kind: "unsupported"; mimes: string[] }
  | { kind: "empty" };

const ORDERED_RASTER_MIME_PRIORITY = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
] as const;
const ORDERED_JSON_MIME = /^application\/(?:.*\+)?json$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Join an nbformat multiline string without interpreting any of its contents. */
function orderedText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((part) => typeof part === "string")) {
    return value.join("");
  }
  return null;
}

/**
 * Select exactly one safe representation from a display MIME bundle. The order
 * is explicit and deterministic: sandboxed HTML, sanitised SVG, validated
 * raster, LaTeX, JSON, safe Markdown, then React-escaped plain text. Unknown
 * bundles remain persisted by the ordered snapshot but render as a visible
 * unsupported placeholder rather than being executed or silently hidden.
 */
function selectOrderedMime(
  data: Record<string, unknown>,
): OrderedMimeSelection {
  const textFor = (mime: string) =>
    hasOwn(data, mime) ? orderedText(data[mime]) : null;

  const html = textFor("text/html");
  if (html !== null) return { kind: "html", value: html };

  const svg = textFor("image/svg+xml");
  if (svg !== null) return { kind: "svg", value: svg };

  for (const mime of ORDERED_RASTER_MIME_PRIORITY) {
    const encoded = textFor(mime);
    if (encoded !== null) {
      // nbformat permits multiline strings. Whitespace is not image data, so
      // remove it only from the render projection; the authoritative snapshot
      // remains byte-for-byte unchanged for export.
      const compact = encoded.replace(/\s+/g, "");
      const safeUrl = resolveOutputAttachmentImageUrl(
        { output: { [mime]: compact } },
        "attachment:output",
      );
      if (safeUrl) return { kind: "raster", mime, value: compact };
    }
  }

  const latex = textFor("text/latex");
  if (latex !== null) return { kind: "latex", value: latex };

  const jsonMime = Object.keys(data).find((mime) =>
    ORDERED_JSON_MIME.test(mime),
  );
  if (jsonMime !== undefined) return { kind: "json", value: data[jsonMime] };

  const markdown = textFor("text/markdown");
  if (markdown !== null) return { kind: "markdown", value: markdown };

  const text = textFor("text/plain");
  if (text !== null) return { kind: "text", value: text };

  const mimes = Object.keys(data);
  return mimes.length > 0 ? { kind: "unsupported", mimes } : { kind: "empty" };
}

function OrderedMimeOutput({
  data,
  outputType,
  outputIndex,
}: {
  data: Record<string, unknown>;
  outputType: "display_data" | "execute_result";
  /** Source position in the notebook's output array; names a raster download. */
  outputIndex: number;
}) {
  const t = useTranslations("console-notebooks");
  const selected = selectOrderedMime(data);
  if (selected.kind === "empty") {
    return (
      <span data-testid="code-output-empty" className={`${officeDialogParts.message} ${outputStyles.note}`}>
        {t("codeOutput.noOutput")}
      </span>
    );
  }
  if (selected.kind === "unsupported") {
    return (
      <span data-testid="code-output-unsupported" className={`${officeDialogParts.message} ${outputStyles.note}`}>
        {t("codeOutput.unsupportedOutput", {
          mimes: selected.mimes.join(", "),
        })}
      </span>
    );
  }
  if (selected.kind === "text") {
    return (
      <pre
        data-testid="code-output-text"
        className={
          outputType === "execute_result"
            ? outputStyles.result
            : outputStyles.line
        }
      >
        {outputType === "execute_result" ? "⇒ " : null}
        {selected.value}
      </pre>
    );
  }
  if (selected.kind === "raster") {
    return (
      <RichOutputView
        rich={{ kind: "image", mime: selected.mime, data: selected.value }}
        imageIndex={outputIndex}
        htmlTitle={t("codeOutput.htmlOutputTitle")}
        imageAlt={t("codeOutput.figureAlt")}
        svgTitle={t("codeOutput.svgOutputTitle")}
        latexLabel={t("codeOutput.latexOutputLabel")}
        jsonExpandLabel={t("codeOutput.jsonExpand")}
        jsonCollapseLabel={t("codeOutput.jsonCollapse")}
      />
    );
  }

  const rich: ExtendedRichOutput =
    selected.kind === "html"
      ? { kind: "html", html: selected.value }
      : selected.kind === "svg"
        ? { kind: "svg", svg: selected.value }
        : selected.kind === "latex"
          ? { kind: "latex", latex: selected.value }
          : selected.kind === "json"
            ? { kind: "json", json: selected.value }
            : { kind: "markdown", markdown: selected.value };
  return (
    <RichOutputView
      rich={rich}
      imageIndex={outputIndex}
      htmlTitle={t("codeOutput.htmlOutputTitle")}
      imageAlt={t("codeOutput.figureAlt")}
      svgTitle={t("codeOutput.svgOutputTitle")}
      latexLabel={t("codeOutput.latexOutputLabel")}
      jsonExpandLabel={t("codeOutput.jsonExpand")}
      jsonCollapseLabel={t("codeOutput.jsonCollapse")}
    />
  );
}

/**
 * A single nbformat output may contain a table, sanitized HTML iframe, image,
 * or expandable JSON tree, so its DOM cost is much higher than one terminal
 * log row. Keep imported notebooks inside a fixed rich-output window.
 */
export const ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE = 50;

export interface OrderedNotebookOutputWindow {
  readonly start: number;
  readonly end: number;
  readonly total: number;
  readonly hiddenBefore: number;
  readonly hiddenAfter: number;
  readonly items: readonly {
    readonly index: number;
    readonly output: Record<string, unknown>;
  }[];
}

/** Select a stable, bounded page while retaining each output's source index. */
export function buildOrderedNotebookOutputWindow(
  outputs: readonly Record<string, unknown>[],
  requestedStart: number,
  requestedPageSize = ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE,
): OrderedNotebookOutputWindow {
  const pageSize = Math.min(
    ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE,
    Math.max(
      1,
      Number.isFinite(requestedPageSize)
        ? Math.floor(requestedPageSize)
        : ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE,
    ),
  );
  const total = outputs.length;
  const lastPageStart =
    total === 0 ? 0 : Math.floor((total - 1) / pageSize) * pageSize;
  const start = Number.isFinite(requestedStart)
    ? Math.min(lastPageStart, Math.max(0, Math.floor(requestedStart)))
    : 0;
  const end = Math.min(total, start + pageSize);
  return {
    start,
    end,
    total,
    hiddenBefore: start,
    hiddenAfter: total - end,
    items: outputs.slice(start, end).map((output, offset) => ({
      index: start + offset,
      output,
    })),
  };
}

/** Render an imported notebook's authoritative output array without aggregation. */
function OrderedNotebookOutputs({
  outputs,
  onFrameClick,
}: {
  outputs: readonly Record<string, unknown>[];
  onFrameClick?: (frame: TracebackFrame) => void;
}) {
  const t = useTranslations("console-notebooks");
  const firstOutput = outputs[0] ?? null;
  const [outputPage, setOutputPage] = useState<{
    firstOutput: Record<string, unknown> | null;
    start: number;
  }>(() => ({ firstOutput, start: 0 }));
  const outputPageStart =
    outputPage.firstOutput === firstOutput ? outputPage.start : 0;
  const outputWindow = useMemo(
    () => buildOrderedNotebookOutputWindow(outputs, outputPageStart),
    [outputPageStart, outputs],
  );
  if (outputs.length === 0) {
    return (
      <span className={`${officeDialogParts.message} ${outputStyles.note}`}>
        {t("codeOutput.noOutput")}
      </span>
    );
  }
  return (
    <div
      data-testid="code-output-items-window"
      data-window-start={outputWindow.start}
      data-window-end={outputWindow.end}
      data-window-total={outputWindow.total}
    >
      {outputWindow.hiddenBefore > 0 ? (
        <ShowMoreOutputButton
          testId="code-output-items-previous"
          hidden={outputWindow.hiddenBefore}
          count={Math.min(
            ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE,
            outputWindow.hiddenBefore,
          )}
          direction="older"
          label={t("codeOutput.showOutput")}
          onClick={() =>
            setOutputPage({
              firstOutput,
              start: Math.max(
                0,
                outputWindow.start - ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE,
              ),
            })
          }
        />
      ) : null}
      {outputWindow.items.map(({ output: raw, index }) => {
        const outputType =
          typeof raw.output_type === "string" ? raw.output_type : "unknown";
        let rendered: React.ReactNode;
        if (outputType === "stream") {
          const stream = typeof raw.name === "string" ? raw.name : "unknown";
          const isStderr = stream === "stderr";
          rendered = (
            <pre
              data-testid={
                isStderr ? "code-output-stderr" : "code-output-stdout"
              }
              data-stream={stream}
              className={
                isStderr
                  ? `${outputStyles.line} ${outputStyles.stderr}`
                  : outputStyles.line
              }
            >
              <AnsiText text={orderedText(raw.text) ?? ""} />
            </pre>
          );
        } else if (outputType === "error") {
          const traceback = Array.isArray(raw.traceback)
            ? raw.traceback
                .filter((line): line is string => typeof line === "string")
                .join("\n")
            : "";
          const ename = typeof raw.ename === "string" ? raw.ename : "";
          const evalue = typeof raw.evalue === "string" ? raw.evalue : "";
          const summary = [ename, evalue].filter(Boolean).join(": ");
          rendered = (
            <TracebackBlock
              error={traceback || summary || "Error"}
              label={t("codeOutput.tracebackLabel")}
              framesLabel={t("codeOutput.tracebackFrames")}
              jumpLabel={(line) => t("codeOutput.jumpToLine", { line })}
              lineLabel={(line) => t("codeOutput.frameLine", { line })}
              onFrameClick={onFrameClick}
            />
          );
        } else if (
          outputType === "display_data" ||
          outputType === "execute_result"
        ) {
          rendered = (
            <OrderedMimeOutput
              data={isRecord(raw.data) ? raw.data : {}}
              outputType={outputType}
              outputIndex={index}
            />
          );
        } else {
          rendered = (
            <span
              data-testid="code-output-unsupported"
              className={`${officeDialogParts.message} ${outputStyles.note}`}
            >
              {t("codeOutput.unsupportedOutput", { mimes: outputType })}
            </span>
          );
        }
        return (
          <div
            key={index}
            data-testid="code-output-item"
            data-output-index={index}
            data-output-type={outputType}
          >
            {rendered}
          </div>
        );
      })}
      {outputWindow.hiddenAfter > 0 ? (
        <ShowMoreOutputButton
          testId="code-output-items-next"
          hidden={outputWindow.hiddenAfter}
          count={Math.min(
            ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE,
            outputWindow.hiddenAfter,
          )}
          direction="newer"
          label={t("codeOutput.showOutput")}
          onClick={() =>
            setOutputPage({
              firstOutput,
              start: outputWindow.start + ORDERED_NOTEBOOK_OUTPUT_PAGE_SIZE,
            })
          }
        />
      ) : null}
    </div>
  );
}

export default function CellOutput({
  output,
  onFrameClick,
  containerTestId = "code-output",
  showExportControl = true,
  errorLabel,
  errorAction,
  errorDetails,
}: {
  /**
   * The cell's run result. `rich` is widened to `ExtendedRichOutput` so the
   * richer Jupyter MIME kinds (svg/latex/json/markdown) are expressible here;
   * this is a SUPERSET of `RunResult.rich`, so any `RunResult` is still a valid
   * `output` and every existing field/value renders exactly as before.
   */
  output: Omit<RunResult, "rich"> & { readonly rich?: ExtendedRichOutput };
  /**
   * Called when the user clicks a navigable (in-cell) traceback frame, so the
   * parent can scroll + place the editor caret at that line. Absent ⇒ frames
   * still render but in-cell ones aren't clickable.
   */
  onFrameClick?: (frame: TracebackFrame) => void;
  /**
   * Lets an embedding surface avoid duplicate test ids while retaining the
   * same safe traceback/rich-output renderer. Code executions keep the existing
   * default; the standalone output workbench supplies its own scoped id.
   */
  containerTestId?: string;
  /**
   * Embedding workbenches that already own a whole-run download action can
   * suppress the redundant per-result action while keeping the standalone
   * output renderer's export boundary intact.
   */
  showExportControl?: boolean;
  /**
   * The run error's kind label; defaults to "Traceback". The Code window
   * passes null for a compile that failed, which is not a traceback.
   */
  errorLabel?: string | null;
  /** The run error card's header action (the Code window's AI fix). */
  errorAction?: ReactNode;
  /** Shown in the run error card under its header (located problems). */
  errorDetails?: ReactNode;
}) {
  const t = useTranslations("console-notebooks");
  const firstLog = output.logs[0] ?? null;
  const [logPage, setLogPage] = useState<{
    firstLog: string | null;
    start: number | null;
  }>(() => ({ firstLog, start: null }));
  // A different first row denotes a replacement run/output snapshot. Follow
  // its newest page even if the reader had anchored an older page previously.
  // Streaming appends keep the same first row and therefore preserve the
  // reader's chosen page.
  const logPageStart = logPage.firstLog === firstLog ? logPage.start : null;
  const logWindow = useMemo(
    () => buildRunOutputLogWindow(output, "all", logPageStart),
    [logPageStart, output],
  );
  const [exportFailure, setExportFailure] = useState<{
    owner: unknown;
    message: string;
  } | null>(null);
  const exportError =
    exportFailure?.owner === output ? exportFailure.message : null;
  const outputHasContent =
    output.notebookOutputs !== undefined
      ? output.notebookOutputs.length > 0
      : Boolean(
          output.error ||
          output.logs.length > 0 ||
          output.result !== undefined ||
          output.html ||
          output.rich !== undefined ||
          (output.images?.length ?? 0) > 0,
        );
  const downloadOutput = useCallback(() => {
    try {
      const receipt = createCellOutputExport(output);
      if (
        !receipt.ok ||
        !downloadTextFile(
          CODE_OUTPUT_EXPORT_FILENAME,
          receipt.ok ? receipt.json : "",
          "application/json;charset=utf-8",
        )
      ) {
        setExportFailure({
          owner: output,
          message: t("toolbar.exportFailed", { format: t("code.download") }),
        });
        return;
      }
      setExportFailure(null);
    } catch {
      setExportFailure({
        owner: output,
        message: t("toolbar.exportFailed", { format: t("code.download") }),
      });
    }
  }, [output, t]);
  const exportControl =
    showExportControl && outputHasContent ? (
      <>
        <div data-testid="code-output-actions" className={outputStyles.actions}>
          <button
            type="button"
            onClick={downloadOutput}
            data-testid="code-output-download"
            title={t("code.download")}
            aria-label={t("code.download")}
            className={officeDialogParts.compactButton}
          >
            <Download size={12} aria-hidden="true" />
            {t("code.download")}
          </button>
        </div>
        {exportError ? (
          <div
            role="alert"
            data-testid="code-output-export-error"
            className={`${officeDialogParts.error} ${outputStyles.actionError}`}
          >
            {exportError}
          </div>
        ) : null}
      </>
    ) : null;
  if (output.notebookOutputs !== undefined) {
    return (
      <div className={`code-output ${CODE_OUTPUT_CHROME_CLASS}`} data-testid={containerTestId}>
        {exportControl}
        <OrderedNotebookOutputs
          outputs={output.notebookOutputs}
          onFrameClick={onFrameClick}
        />
      </div>
    );
  }
  const images = output.images ?? [];
  const imageMimes = output.imageMimes ?? [];
  const rich = output.rich;
  // A structured rich output supersedes the redundant text result for the same
  // value, so don't print both the table/image and its stringified form.
  const showTextResult = output.result !== undefined && rich === undefined;
  const empty =
    !output.error &&
    output.logs.length === 0 &&
    output.result === undefined &&
    !output.html &&
    rich === undefined &&
    images.length === 0;
  return (
    <div className={`code-output ${CODE_OUTPUT_CHROME_CLASS}`} data-testid={containerTestId}>
      {exportControl}
      {output.error ? (
        <TracebackBlock
          error={output.error}
          label={
            errorLabel === undefined
              ? t("codeOutput.tracebackLabel")
              : errorLabel
          }
          framesLabel={t("codeOutput.tracebackFrames")}
          jumpLabel={(line) => t("codeOutput.jumpToLine", { line })}
          lineLabel={(line) => t("codeOutput.frameLine", { line })}
          onFrameClick={onFrameClick}
          action={errorAction}
          details={errorDetails}
        />
      ) : null}
      {output.logs.length > 0 ? (
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          data-testid="code-output-log-window"
          data-window-start={logWindow.start}
          data-window-end={logWindow.end}
          data-window-total={logWindow.total}
        >
          {logWindow.hiddenBefore > 0 ? (
            <ShowMoreOutputButton
              testId="code-output-older"
              hidden={logWindow.hiddenBefore}
              count={Math.min(RUN_OUTPUT_LOG_PAGE_SIZE, logWindow.hiddenBefore)}
              direction="older"
              label={t("codeOutput.showOutput")}
              onClick={() =>
                setLogPage({
                  firstLog,
                  start: Math.max(
                    0,
                    logWindow.start - RUN_OUTPUT_LOG_PAGE_SIZE,
                  ),
                })
              }
            />
          ) : null}
          {logWindow.lines.map((line) => {
            const isStderr = line.stream === "stderr";
            return (
              <pre
                key={line.index}
                data-testid={
                  isStderr ? "code-output-stderr" : "code-output-stdout"
                }
                data-stream={line.stream}
                data-log-index={line.index}
                className={
                  isStderr
                    ? `${outputStyles.line} ${outputStyles.stderr}`
                    : outputStyles.line
                }
              >
                <AnsiText text={line.text} />
              </pre>
            );
          })}
          {logWindow.hiddenAfter > 0 ? (
            <ShowMoreOutputButton
              testId="code-output-newer"
              hidden={logWindow.hiddenAfter}
              count={Math.min(RUN_OUTPUT_LOG_PAGE_SIZE, logWindow.hiddenAfter)}
              direction="newer"
              label={t("codeOutput.showOutput")}
              onClick={() => {
                const latestStart = Math.max(
                  0,
                  logWindow.total - RUN_OUTPUT_LOG_PAGE_SIZE,
                );
                const nextStart = Math.min(
                  latestStart,
                  logWindow.start + RUN_OUTPUT_LOG_PAGE_SIZE,
                );
                setLogPage({
                  firstLog,
                  start: nextStart >= latestStart ? null : nextStart,
                });
              }}
            />
          ) : null}
        </div>
      ) : null}
      {images.map((b64, index) => (
        <DownloadableOutputImage
          key={index}
          data={b64}
          mime={imageMimes[index] ?? "image/png"}
          index={index}
          alt={t("codeOutput.figureAlt")}
        />
      ))}
      {output.html ? (
        <SandboxedHtml
          html={output.html}
          title={t("codeOutput.htmlOutputTitle")}
        />
      ) : null}
      {rich ? (
        <RichOutputView
          rich={rich}
          imageIndex={images.length}
          htmlTitle={t("codeOutput.htmlOutputTitle")}
          imageAlt={t("codeOutput.figureAlt")}
          svgTitle={t("codeOutput.svgOutputTitle")}
          latexLabel={t("codeOutput.latexOutputLabel")}
          jsonExpandLabel={t("codeOutput.jsonExpand")}
          jsonCollapseLabel={t("codeOutput.jsonCollapse")}
        />
      ) : null}
      {showTextResult ? (
        <pre className={outputStyles.result}>
          {"⇒ "}
          {output.result}
        </pre>
      ) : null}
      {empty ? (
        <span className={`${officeDialogParts.message} ${outputStyles.note}`}>
          {t("codeOutput.noOutput")}
        </span>
      ) : null}
    </div>
  );
}
