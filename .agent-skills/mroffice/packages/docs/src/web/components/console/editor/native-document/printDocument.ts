/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Browser-print helpers shared by the native document toolbar and its tests.
 *
 * The editor's printable ProseMirror root intentionally contains body content
 * only. Document defaults live on an ancestor, while headers, footers and the
 * watermark are sibling overlays. A raw `cloneNode(true)` therefore loses all
 * of them. These helpers make that detached clone self-contained before it is
 * moved into the same-origin print window.
 */

import type { CSSProperties } from "react";

import {
  resolvePageDimensionsPx,
  resolvePageMarginsPx,
  type CustomPageMarginsInches,
  type CustomPageSizeInches,
  type PageMargins,
  type PageOrientation,
  type PageSize,
} from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import type { FirstPageConfig, OddEvenConfig } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import {
  documentColumnsCss,
  documentColumnSeparatorCss,
  documentWritingModeCss,
  isManuscriptGridEnabled,
  manuscriptGridCss,
  type ColumnCount,
  type ManuscriptGrid,
  type WritingMode,
} from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import {
  DEFAULT_PAGE_NUMBER_FORMAT,
  DEFAULT_PAGE_NUMBER_START,
  formatPageNumber,
  normalizePageNumberFormat,
  normalizePageNumberStart,
  normalizePageNumberStartSection,
  type PageNumberFormat,
} from "@mrnote/core/web/components/console/editor/native-document/pageNumberFormat.ts";
import { washoutPictureStyle, watermarkCss, type DocumentWatermark } from "@mrnote/core/web/components/console/editor/native-document/watermark.ts";
import { stripFormattingMarks } from "./formattingMarksExtension";
import { applyRevisionPolicyToDom } from "../../../../lib/document-export/revision-policy";

/** Document-default CSS variables that the ProseMirror root inherits. */
export const PRINT_TYPOGRAPHY_PROPERTIES = [
  "--doc-default-font",
  "--doc-default-font-size",
  "--doc-default-text-color",
  "--doc-default-line-height",
  "--doc-default-paragraph-space-before",
  "--doc-default-paragraph-space-after",
] as const;

const PRINT_TRANSIENT_CLASSES = [
  "is-selected",
  "ProseMirror-selectednode",
  "note-editor-page-boundary-before",
  "note-editor-page-boundary-after",
  "note-editor-pagination-control--hidden",
  "selectedCell",
  "resize-cursor",
] as const;

/**
 * Remove view-only editor chrome from a detached print clone.
 *
 * Editable pagination gaps are ProseMirror widget decorations, so they live
 * inside `editor.view.dom` even though they are absent from the document model.
 * Printing them would feed the already-paginated white fill, gray gutter and
 * page labels into the browser's paged-media engine a second time. Selection
 * rings and resize handles are the same kind of transient view state and must
 * not leak into a PDF either.
 */
/**
 * An empty SmartArt shape's `[Text]` prompt is the live editor's, never the
 * page's: a print drawn from a clone of the editor shows the empty shape, as
 * Word's does (the prompt is a placeholder, ISO/IEC 29500-1 §21.4.3.7
 * `phldr`). The print stylesheet hid it on paper only; the clone's own
 * preview showed it. (The editing views -- the single surface and the page
 * cards -- keep it, as Word's editing view does.)
 */
export function stripSmartArtTextPrompts(clone: HTMLElement): void {
  clone.querySelectorAll<HTMLElement>("[data-document-shape-text-prompt]").forEach((prompt) => {
    prompt.textContent = "";
    prompt.removeAttribute("data-document-shape-text-prompt");
  });
}

export function stripPrintEditorChrome(
  clone: HTMLElement,
  options: { printMarkup?: boolean } = {},
): void {
  // The final copy unless Word's Print Markup asks for the markup the screen
  // shows (paged/printRevisionMarkup): deletion tombstones never reach a
  // final copy's detached print document.
  if (options.printMarkup !== true) applyRevisionPolicyToDom(clone, "accept");
  clone.removeAttribute("contenteditable");
  clone.removeAttribute("data-selected");
  clone.classList.remove(...PRINT_TRANSIENT_CLASSES);

  clone
    .querySelectorAll<HTMLElement>(
      ".note-editor-editable-page-gap,.ProseMirror-gapcursor,.note-editor-image-handle,.column-resize-handle,[data-document-selection-chrome]",
    )
    .forEach((decoration) => decoration.remove());
  // Collaborators' carets, name labels and selection tints are presence,
  // not document: a label printed inside a table cell is not what the page
  // holds.
  clone
    .querySelectorAll<HTMLElement>(".collab-caret,.collab-caret__label,.ProseMirror-yjs-cursor")
    .forEach((presence) => presence.remove());
  clone
    .querySelectorAll<HTMLElement>(".ProseMirror-yjs-selection")
    .forEach((tint) => tint.replaceWith(...tint.childNodes));
  clone
    .querySelectorAll<HTMLElement>(
      ".is-selected,.ProseMirror-selectednode,.note-editor-page-boundary-before,.note-editor-page-boundary-after,.note-editor-pagination-control--hidden,.selectedCell,.resize-cursor",
    )
    .forEach((selected) =>
      selected.classList.remove(...PRINT_TRANSIENT_CLASSES),
    );
  clone
    .querySelectorAll<HTMLElement>("[data-selected]")
    .forEach((selected) => selected.removeAttribute("data-selected"));
  clone
    .querySelectorAll<HTMLElement>("[contenteditable]")
    .forEach((editable) => editable.removeAttribute("contenteditable"));
  // Formatting marks are a view overlay; Word never prints them.
  stripFormattingMarks(clone);
  // …nor an empty SmartArt shape's [Text] prompt.
  stripSmartArtTextPrompts(clone);

  // Selected editable charts temporarily replace their native axis names with
  // input controls. Print operates on a detached clone of that live DOM, so
  // project those controls back to static labels instead of printing form
  // chrome or dropping the axis title entirely. The data attribute carries
  // the committed document value; an unsaved draft must not leak into print.
  clone
    .querySelectorAll<HTMLInputElement>("input[data-print-chart-axis-title]")
    .forEach((input) => {
      const label = input.ownerDocument.createElement("span");
      label.setAttribute(
        "data-print-chart-axis-title",
        input.getAttribute("data-print-chart-axis-title") ?? "",
      );
      label.setAttribute("data-print-projected", "true");
      label.textContent =
        input.getAttribute("data-print-chart-axis-title-value") ?? "";
      const style = input.getAttribute("style");
      if (style) label.setAttribute("style", style);
      label.style.border = "0";
      label.style.borderRadius = "0";
      label.style.background = "transparent";
      label.style.padding = "0";
      label.style.minHeight = "0";
      label.style.pointerEvents = "none";
      input.replaceWith(label);
    });
}

/**
 * Copy inherited document typography onto a detached editor clone.
 *
 * `getComputedStyle()` returns the resolved custom-property tokens inherited by
 * the live ProseMirror root, so this also works when the variables are painted
 * several ancestors above it. Empty/unset values stay absent and continue to
 * use the stylesheet defaults in the print window.
 */
export function copyPrintTypographyVariables(
  source: HTMLElement,
  clone: HTMLElement,
): void {
  const view = source.ownerDocument.defaultView;
  if (!view) return;
  const computed = view.getComputedStyle(source);
  for (const property of PRINT_TYPOGRAPHY_PROPERTIES) {
    const value = computed.getPropertyValue(property).trim();
    if (value) clone.style.setProperty(property, value);
  }
}

export interface PrintLayoutContext {
  columns: ColumnCount;
  columnSeparator: boolean;
  writingMode: WritingMode;
  manuscriptGrid: ManuscriptGrid;
}

/**
 * Materialize document layout that normally lives on the editor's parent.
 *
 * The print clone contains only `editor.view.dom`, not the surrounding
 * `.note-editor-content-columns` element. Applying the same whitelisted helper
 * outputs directly to the clone preserves column flow, vertical writing and
 * manuscript-paper decoration without copying arbitrary ancestor CSS.
 */
export function applyPrintLayoutContext(
  clone: HTMLElement,
  context: PrintLayoutContext,
): void {
  Object.assign(
    clone.style,
    documentColumnsCss(context.columns),
    documentColumnSeparatorCss(context.columns, context.columnSeparator),
    documentWritingModeCss(context.writingMode),
    manuscriptGridCss(context.manuscriptGrid),
  );
  if (isManuscriptGridEnabled(context.manuscriptGrid)) {
    clone.classList.add("note-editor-content-manuscript");
  }
}

/** Escape a plain text value for a double-quoted CSS `content` string. */
export function cssContentString(value: string): string {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\\" || char === '"') {
      out += `\\${char}`;
    } else if (code === 0 || code < 0x20 || code === 0x7f) {
      // CSS hex escapes need a trailing space so the following glyph cannot be
      // consumed as another hex digit.
      out += `\\${code.toString(16)} `;
    } else {
      out += char;
    }
  }
  return `${out}"`;
}

function inch(px: number): string {
  return `${(px / 96).toFixed(3)}in`;
}

/**
 * Pages a flow print numbers in a Word style other than decimal: CSS's own
 * counter styles do not draw Word's (`lower-alpha` reads 28 as "ab" where Word
 * prints "bb", and no CSS system writes Word's zero glyphs, ranges or error
 * text), so the print sheet lists each label from the start value on, drawn
 * by `formatPageNumber`; past the last one the page counter falls back to
 * arabic numbers.
 */
const PRINT_PAGE_LABELS = 2_000;

function counterSymbols(labels: readonly string[]): string {
  return labels.map((label) => cssContentString(label)).join(" ");
}

/** The `@counter-style` a Word page-number style prints with, or "" for
 * decimal (and Number in dash, decimal between dashes). */
function pageCounterStyleRule(format: PageNumberFormat, start: number): string {
  if (format === "decimal" || format === "numberInDash") return "";
  const labels = Array.from({ length: PRINT_PAGE_LABELS }, (_, index) =>
    formatPageNumber(format, start + index),
  );
  return `@counter-style mrai-page-${format}{system:fixed ${start};symbols:${counterSymbols(
    labels,
  )};fallback:decimal;}`;
}

function pageCounterContent(format: PageNumberFormat): string {
  switch (format) {
    case "numberInDash":
      return '"- " counter(page, decimal) " -"';
    case "decimal":
      return "counter(page, decimal)";
    default:
      return `counter(page, mrai-page-${format})`;
  }
}

interface PageBandValues {
  header: string;
  footer: string;
}

const PAGE_BAND_TYPOGRAPHY =
  "font-family:var(--doc-default-font,system-ui,sans-serif);" +
  "font-size:var(--doc-default-font-size,13px);" +
  "color:var(--doc-default-text-color,#6b7280);" +
  "line-height:var(--doc-default-line-height,1.4);";

function pageMarginBox(name: string, content: string): string {
  return `@${name}{content:${content};${PAGE_BAND_TYPOGRAPHY}}`;
}

function pageMarginBoxes(
  bands: PageBandValues,
  showPageNumbers: boolean,
  pageCounter: string,
): string {
  const header = bands.header ? cssContentString(bands.header) : "none";
  const footer = bands.footer ? cssContentString(bands.footer) : "none";
  const centeredNumber =
    showPageNumbers && !bands.footer ? pageCounter : "none";
  const rightNumber = showPageNumbers && bands.footer ? pageCounter : "none";
  return (
    pageMarginBox("top-center", header) +
    pageMarginBox("bottom-left", footer) +
    pageMarginBox("bottom-center", centeredNumber) +
    pageMarginBox("bottom-right", rightNumber)
  );
}

export interface PrintPageCssOptions {
  pageSize: PageSize;
  pageMargins: PageMargins;
  pageOrientation: PageOrientation;
  customPageSize?: CustomPageSizeInches | null;
  customPageMargins?: CustomPageMarginsInches | null;
  headerText?: string | null;
  footerText?: string | null;
  showPageNumbers?: boolean;
  pageNumberFormat?: PageNumberFormat | null;
  pageNumberStart?: number | null;
  /**
   * Zero-based section where numbering begins. CSS margin boxes cannot
   * reliably reset their built-in page counter at an arbitrary DOM section,
   * so a non-zero value intentionally suppresses the counter (rather than
   * printing confidently wrong physical-page numbers).
   */
  pageNumberStartSection?: number | null;
  firstPage?: FirstPageConfig | null;
  oddEven?: OddEvenConfig | null;
}

/**
 * Build the print window's real page geometry and repeated margin-box bands.
 *
 * Chromium's paged-media margin boxes repeat once per physical sheet and expose
 * the built-in `page` counter, unlike a fixed DOM footer whose text cannot know
 * which printed page it is on. We emit complete bottom slots for every override
 * so a blank first/even footer also clears the normal page's slot.
 */
export function buildPrintPageCss(options: PrintPageCssOptions): string {
  const dims = resolvePageDimensionsPx(
    options.pageSize,
    options.customPageSize,
    options.pageOrientation,
  );
  const margins = resolvePageMarginsPx(
    options.pageMargins,
    options.customPageMargins,
  );
  const pageNumberStartSection =
    normalizePageNumberStartSection(options.pageNumberStartSection) ?? 0;
  const showPageNumbers =
    options.showPageNumbers === true && pageNumberStartSection === 0;
  const format =
    normalizePageNumberFormat(options.pageNumberFormat) ??
    DEFAULT_PAGE_NUMBER_FORMAT;
  const start =
    normalizePageNumberStart(options.pageNumberStart) ??
    DEFAULT_PAGE_NUMBER_START;
  const counter = pageCounterContent(format);
  const counterStyle = showPageNumbers ? pageCounterStyleRule(format, start) : "";
  const normalBands = {
    header: options.headerText ?? "",
    footer: options.footerText ?? "",
  };
  const firstPage = options.firstPage ?? {
    differentFirstPage: false,
    firstPageHeader: null,
    firstPageFooter: null,
  };
  const oddEven = options.oddEven ?? {
    differentOddEven: false,
    evenPageHeader: null,
    evenPageFooter: null,
  };
  const geometry =
    `size:${inch(dims.width)} ${inch(dims.height)};` +
    `margin:${inch(margins.top)} ${inch(margins.right)} ` +
    `${inch(margins.bottom)} ${inch(margins.left)};`;
  let css = `${counterStyle}@page{${geometry}${pageMarginBoxes(
    normalBands,
    showPageNumbers,
    counter,
  )}}`;

  // In left-to-right paged media, `:left` is the even-page selector. It is
  // harmless for one-sided output and gives imported odd/even bands parity.
  if (oddEven.differentOddEven) {
    css += `@page:left{${pageMarginBoxes(
      {
        header: oddEven.evenPageHeader ?? "",
        footer: oddEven.evenPageFooter ?? "",
      },
      showPageNumbers,
      counter,
    )}}`;
  }

  // The page counter starts at one by default. Reset it only when the document
  // explicitly asks for another start value, preserving the browser default.
  const counterReset =
    showPageNumbers && start !== DEFAULT_PAGE_NUMBER_START
      ? `counter-reset:page ${start};`
      : "";
  if (firstPage.differentFirstPage || counterReset) {
    const bands = firstPage.differentFirstPage
      ? {
          header: firstPage.firstPageHeader ?? "",
          footer: firstPage.firstPageFooter ?? "",
        }
      : normalBands;
    // Defined after `:left` so a first page wins when both selectors match.
    css += `@page:first{${counterReset}${pageMarginBoxes(
      bands,
      showPageNumbers,
      counter,
    )}}`;
  }

  return css;
}

/** Add the document watermark as a fixed layer repeated by the print engine. */
export function appendPrintWatermark(
  doc: Document,
  watermark: DocumentWatermark | null | undefined,
): HTMLElement | null {
  if (!watermark) return null;
  const layer = doc.createElement("div");
  layer.className = "note-editor-print-watermark";
  layer.setAttribute("aria-hidden", "true");
  if ("kind" in watermark) {
    // Word's picture watermark: centred at its drawn size, faded by Washout.
    const picture = doc.createElement("img");
    picture.className = "note-editor-print-watermark__picture";
    picture.src = watermark.src;
    picture.alt = "";
    picture.style.width = `${watermark.widthPt}pt`;
    picture.style.height = `${watermark.heightPt}pt`;
    const washout = watermark.washout ? washoutPictureStyle(doc) : null;
    picture.style.opacity = washout ? washout.opacity : "1";
    if (washout?.filter) picture.style.filter = washout.filter;
    layer.appendChild(picture);
    doc.body.appendChild(layer);
    return layer;
  }
  const text = doc.createElement("span");
  text.className = "note-editor-print-watermark__text";
  const style = watermarkCss(watermark) as CSSProperties;
  text.style.color = style.color ?? "";
  text.style.opacity = String(style.opacity ?? "");
  text.style.transform = style.transform ?? "";
  text.textContent = watermark.text;
  layer.appendChild(text);
  doc.body.appendChild(layer);
  return layer;
}
