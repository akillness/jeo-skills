/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Structural print (v3.3): a sheeted document's pages ARE the print
 * pages. Each `article[data-page-sheet]` clones into the popup under a
 * wrapper carrying the live surface's classes + inline style (page vars,
 * typography, chrome vars), so sheets, page numbers (CSS counters) and
 * header/footer bands render byte-identically to the screen — WYSIWYG by
 * construction instead of by re-computation.
 */

import { flushDeferredInkPaints } from "@mrnote/core/web/components/console/editor/native-document/deferredInkPaint.ts";
import { PAPER_UNDERLAY_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/paperUnderlay.ts";
import { SHEET_PRINT_PART_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/unequalColumnProjection.ts";
import { flushInkLightLayers, INK_LIGHT_HOST_ATTR, printInkLightLayer } from "@mrnote/core/web/components/console/editor/native-document/paged/inkLightLayer.ts";
import type { RichBandsConfig, SectionBandEntry } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import {
  applyPrintMarkupToContent,
  applyPrintMarkupToSheet,
  changeBarsBySheet,
  printMarkupCss,
  type PrintRevisionMarkup,
  type SheetChangeBar,
} from "./printRevisionMarkup";
import {
  PrintReadinessError,
  printWindowWhenReady,
  documentPrintSourceReadiness,
  waitForDocumentPrintSource,
  renderPrintReadinessFailure,
  type PrintWindowResult,
  PRINT_ASSET_TIMEOUT_MS,
  PRINT_READY_ATTRIBUTE,
  PRINT_PAGES_ATTRIBUTE,
} from "../printReadiness";
import { installDocumentFontRules } from "@mrnote/core/web/components/office-ribbon/officeFontAssets.ts";
import { captureChartPrintSnapshot } from "@mrnote/core/web/components/console/editor/extensions/chartPrintSnapshot.ts";
import { typesetPendingMathIn } from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import { layoutTocLeaders } from "@mrnote/core/web/components/console/editor/extensions/TableOfContents.tsx";
import {
  resolveBandFieldTokens,
  resolveRichPageBands,
  resolveSectionSheetBands,
} from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { buildBandRichDom, clipBandsToHalfPage, keepBandObjectsOnPaper, paintBandTextWarps, wrapBandTextAroundObjects } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import { stripFormattingMarks } from "../formattingMarksExtension";
import {
  buildFootnoteZoneDom,
  type PagedEditingSeamNote,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pagedEditingExtension.ts";
import type { NoteTextStyle } from "@mrnote/core/web/components/console/editor/native-document/noteTextStyle.ts";
import {
  PAGE_NUMBER_FIRST_LABEL_ATTR,
  PAGE_NUMBER_LAST_LABEL_ATTR,
  PAGE_NUMBER_VISIBLE_ATTR,
  PAGE_PARITY_GAP_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pageSpanExtension.ts";
import {
  computePhysicalPageStarts,
  sectionRestartNumbers,
  endingSheetParityBreak,
} from "@mrnote/core/web/components/console/editor/native-document/paged/sheetPageSpans.ts";
import {
  resolvePhysicalSheetPageNumberLabels,
  type PageNumberFormat,
} from "@mrnote/core/web/components/console/editor/native-document/pageNumberFormat.ts";
import { settleLayoutNow } from "@mrnote/core/web/components/console/editor/native-document/paged/layoutPending.ts";
import { notedFontFaceRules } from "@mrnote/core/web/lib/font-face-declarations.ts";
import { sheetOpensSectionMidPage } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetSectionIsolation.ts";

const inch = (px: number) => `${(px / 96).toFixed(4)}in`;

const LINE_NUMBER_OVERLAY_CLASS = "document-line-number-overlay";
const LINE_NUMBER_CLASS = "document-line-number-overlay__number";
const MAX_PRINT_LINE_NUMBER_COORDINATE = 1_000_000;

interface MeasuredPrintLineNumber {
  left: number;
  top: number;
  value: number;
  /** A right-to-left section's number, left-aligned from `left`. */
  rightSide?: boolean;
}

function measuredLineNumberError(detail?: unknown): PrintReadinessError {
  return new PrintReadinessError(
    "print-failed",
    "The measured line-number projection is not safe to print.",
    detail,
  );
}

/** `window.__docsPrintColumnsHostOff = true`: the copy leaves the
 * content-columns host out, as before (A/B of one build). */
function printColumnsHostOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsPrintColumnsHostOff?: boolean }).__docsPrintColumnsHostOff === true;
}

/** `window.__docsPrintCoverFirstOff = true`: a handwriting cover goes in
 * front of the first sheet's blocks, as before (A/B of one build). */
function printCoverFirstOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsPrintCoverFirstOff?: boolean }).__docsPrintCoverFirstOff === true;
}

/** `window.__docsPrintBandBodyRulesOff = true`: the body's table and picture
 * rules reach the copy's headers and footers again, as before (A/B of one
 * build; styles/note-editor.css `data-docs-print-band-body-rules`). */
function printBandBodyRulesOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsPrintBandBodyRulesOff?: boolean }).__docsPrintBandBodyRulesOff === true;
}

/** `window.__docsPrintScreenPageFieldsOff = true`: the copy numbers its
 * pages by itself, as before (A/B of one build). */
function screenPageFieldsOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsPrintScreenPageFieldsOff?: boolean }).__docsPrintScreenPageFieldsOff === true;
}

/** A sheet's page fields as the screen shows them, for a band context. */
function withPageFields(fields: { pageLabel: string; pageNumberValue?: number; totalPages: number }) {
  return {
    pageLabel: fields.pageLabel,
    totalPages: fields.totalPages,
    ...(typeof fields.pageNumberValue === "number" ? { pageNumberValue: fields.pageNumberValue } : {}),
  };
}

function strictCoordinate(value: string | null): number | null {
  if (!value || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    Math.abs(parsed) <= MAX_PRINT_LINE_NUMBER_COORDINATE
    ? parsed
    : null;
}

function strictUnsignedInteger(value: string | null): number | null {
  if (!value || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Read the screen projection's authenticated, sheet-local line coordinates.
 * Printing must never remeasure text: doing so in a separate popup can choose
 * different font fallback or line wrapping and silently move the numbers.
 */
function measuredLineNumbersBySheet(
  root: HTMLElement,
  sheetCount: number,
): Map<number, MeasuredPrintLineNumber[]> {
  // Tiptap mounts the ProseMirror root inside EditorContent's own host div;
  // the measured overlay is its sibling at the content-columns boundary.
  const host = root.closest<HTMLElement>(".note-editor-content-columns");
  if (!host) return new Map();
  const overlays = Array.from(host.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.classList.contains(LINE_NUMBER_OVERLAY_CLASS),
  );
  if (overlays.length === 0) return new Map();
  if (overlays.length !== 1) {
    throw measuredLineNumberError({ reason: "duplicate-overlay" });
  }

  const overlay = overlays[0];
  if (
    overlay.getAttribute("aria-hidden") !== "true" ||
    overlay.getAttribute("contenteditable") !== "false"
  ) {
    throw measuredLineNumberError({ reason: "interactive-overlay" });
  }

  const bySheet = new Map<number, MeasuredPrintLineNumber[]>();
  const identities = new Set<string>();
  for (const child of Array.from(overlay.children)) {
    if (
      !(child instanceof HTMLElement) ||
      child.tagName !== "SPAN" ||
      !child.classList.contains(LINE_NUMBER_CLASS)
    ) {
      throw measuredLineNumberError({ reason: "unexpected-overlay-child" });
    }
    const sheetIndex = strictUnsignedInteger(
      child.getAttribute("data-line-number-sheet-index"),
    );
    const left = strictCoordinate(
      child.getAttribute("data-line-number-sheet-left"),
    );
    const top = strictCoordinate(
      child.getAttribute("data-line-number-sheet-top"),
    );
    const value = strictUnsignedInteger(
      child.getAttribute("data-line-number-value"),
    );
    if (
      sheetIndex === null ||
      sheetIndex >= sheetCount ||
      left === null ||
      top === null ||
      top < 0 ||
      value === null ||
      value < 1 ||
      child.textContent !== String(value)
    ) {
      throw measuredLineNumberError({ reason: "invalid-overlay-entry" });
    }
    const identity = `${sheetIndex}:${left}:${top}:${value}`;
    if (identities.has(identity)) {
      throw measuredLineNumberError({ reason: "duplicate-overlay-entry" });
    }
    identities.add(identity);
    const entries = bySheet.get(sheetIndex) ?? [];
    entries.push({ left, top, value, ...(child.getAttribute("data-line-number-side") === "right" ? { rightSide: true } : {}) });
    bySheet.set(sheetIndex, entries);
  }
  return bySheet;
}

function appendMeasuredLineNumbers(
  doc: Document,
  sheet: HTMLElement,
  entries: readonly MeasuredPrintLineNumber[] | undefined,
): void {
  if (!entries || entries.length === 0) return;
  const overlay = doc.createElement("div");
  overlay.className = LINE_NUMBER_OVERLAY_CLASS;
  overlay.setAttribute("data-line-number-print-copy", "true");
  overlay.setAttribute(SHEET_PRINT_PART_ATTR, "");
  overlay.setAttribute("contenteditable", "false");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  overlay.style.pointerEvents = "none";
  for (const entry of entries) {
    const number = doc.createElement("span");
    number.className = LINE_NUMBER_CLASS;
    number.setAttribute("data-line-number-value", String(entry.value));
    if (entry.rightSide) number.setAttribute("data-line-number-side", "right");
    number.style.left = `${entry.left}px`;
    number.style.top = `${entry.top}px`;
    number.textContent = String(entry.value);
    overlay.appendChild(number);
  }
  sheet.appendChild(overlay);
}

function positivePixelLength(value: string | null | undefined): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)px\s*$/i.exec(value ?? "");
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * A Web-layout sheet intentionally computes to width:100% / min-height:0.
 * Those are view projection values, never paper authority. Physical sheet
 * geometry stays in the per-section inline contract and inherited page CSS
 * variables, with the caller's normalized page size as the final fallback.
 */
function physicalPrintPageSize(
  sheet: HTMLElement,
  surface: HTMLElement,
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  const sheetStyle = getComputedStyle(sheet);
  const surfaceStyle = getComputedStyle(surface);
  const width =
    positivePixelLength(sheet.style.width) ??
    positivePixelLength(sheet.style.getPropertyValue("--page-width-px")) ??
    positivePixelLength(surface.style.getPropertyValue("--page-width-px")) ??
    positivePixelLength(sheetStyle.getPropertyValue("--page-width-px")) ??
    positivePixelLength(surfaceStyle.getPropertyValue("--page-width-px")) ??
    fallbackWidth;
  const height =
    positivePixelLength(sheet.style.minHeight) ??
    positivePixelLength(sheet.style.getPropertyValue("--page-height-px")) ??
    positivePixelLength(surface.style.getPropertyValue("--page-height-px")) ??
    positivePixelLength(sheetStyle.getPropertyValue("--page-height-px")) ??
    positivePixelLength(surfaceStyle.getPropertyValue("--page-height-px")) ??
    fallbackHeight;
  return { width, height };
}

/**
 * Resolve the unnamed @page fallback from the first physical sheet rather than
 * from legacy document-level Letter attrs. Safari can ignore named @page rules;
 * in that case the generic rule still has to match the active section's paper.
 */
export function structuralPrintFallbackPageSize(
  root: HTMLElement,
  surface: HTMLElement,
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  const firstSheet = root.querySelector<HTMLElement>(
    ":scope > article[data-page-sheet]",
  );
  return firstSheet
    ? physicalPrintPageSize(firstSheet, surface, fallbackWidth, fallbackHeight)
    : { width: fallbackWidth, height: fallbackHeight };
}

export interface StructuralPrintOptions {
  /** The live ProseMirror root containing the sheet articles. */
  root: HTMLElement;
  /**
   * "dialog" (the default): the print dialog. "ready": stop once the print
   * copy is ready, for a headless browser to print it to PDF.
   */
  deliver?: "dialog" | "ready";
  /** How long the source may take to settle before the copy is made (the
   * print readiness default otherwise): the PDF renderer waits for a long
   * document's background layout to finish. */
  sourceTimeoutMs?: number;
  /** How long the copy's stylesheets, fonts and pictures may take (the print
   * readiness default otherwise; the PDF renderer is not in a hurry). */
  assetTimeoutMs?: number;
  /** The document's in-document links and where each leads (a TOC row, a
   * link to a heading or a bookmark), on the live sheets: the copy makes each
   * a link to its target, so the PDF Print makes can be followed as Word's. */
  printLinks?: () => ReadonlyArray<{ link: HTMLElement; target: HTMLElement }>;
  /** Refresh sheet-dependent React data after an asynchronous source wait. */
  resolveAfterSourceReady?: () => StructuralPrintOptions | null;
  /** One part of a longer document, printed on its own (the page renderer's
   * parallel drawing): its first page is physical page `pageOffset + 1` of
   * the document, which has `totalPages` pages ({NUMPAGES}). Unset: the
   * document printed whole. */
  pageOffset?: number;
  totalPages?: number;
  sourceIdentity?: string;
  /**
   * Word's Print Markup (printRevisionMarkup): the review display the copy
   * prints its tracked changes in (the screen's), or null / unset for the
   * final copy (Print Markup cleared, Save as PDF's "Document").
   */
  revisionMarkup?: PrintRevisionMarkup;
  /**
   * The final copy laid out before it is copied: a display that lays out
   * deleted text inline (All Markup) is not the final copy's layout, so the
   * host shows No Markup for the copy and gets back the function that puts
   * its display back (null: nothing changed). Asked only for a final copy.
   */
  layOutFinalCopy?: () => (() => void) | null;
  /** The page surface element (classes + inline style are mirrored). */
  surface: HTMLElement;
  pageWidthPx: number;
  pageHeightPx: number;
  title?: string;
  /** RICH letterhead bands (pictures / mini tables) injected per sheet. */
  richBands?: RichBandsConfig | null;
  /** Per-section bands; wins over richBands when present. */
  sectionBands?: SectionBandEntry[] | null;
  /** The sections' layouts and Different Odd & Even Pages: a section
   * restarting its numbers prints on paper of its first number's parity. */
  sectionLayouts?: unknown;
  evenAndOddHeaders?: boolean;
  /** The document's Word styles: band runs that state no size take their
   * style's, as on screen (`BandTokenContext.styleDefinitions`). */
  bandStyleDefinitions?: unknown;
  /** The document's `wordCompatibilityMode` for the bands (`BandTokenContext`). */
  bandWordCompatibilityMode?: number | null;
  /** Word's replacements for the faces the page cannot draw (`BandTokenContext`). */
  bandMissingFontSubstitutes?: Readonly<Record<string, readonly string[]>> | null;
  /** Automatic PAGE field settings persisted on the document root. */
  showPageNumbers?: boolean;
  pageNumberFormat?: PageNumberFormat | null;
  pageNumberStart?: number | null;
  pageNumberStartSection?: number | null;
  /** The page fields the screen's header and footer show on each of its
   * `sheets` sheets (useDocumentPagedSurface `sheetBandContext`: the sections'
   * own Start at, format and chapter numbers). A whole copy of those sheets
   * prints the same fields and picks odd / even bands by the same numbers. */
  sheetPageFields?: {
    sheets: number;
    at: (index: number, kind: "header" | "footer") => { pageLabel: string; pageNumberValue?: number; totalPages: number };
  } | null;
  /** Localized failure copied into the popup when an asset cannot be printed. */
  readinessErrorMessage?: string;
  preparingMessage?: string;
  onReadinessError?: (error: PrintReadinessError) => void;
  /** The browser refused the print window; the host tells the user, since
   * nothing else on screen changes. */
  onPrintWindowBlocked?: () => void;
  /** V3.4 Word 脚注区: sheet index → its footnote-stream notes, printed
   * read-only at the bottom of the content box (above the footer band). */
  footnoteZones?: Map<number, PagedEditingSeamNote[]> | null;
  /** The document's "footnote text" style the zones are set in. */
  footnoteTextStyle?: NoteTextStyle | null;
  

  footnoteContinuationPages?: number;
  /** What the first sheet is drawn on, behind its text and ink: a
   * handwriting document's cover (HandwritingCoverFace), which the screen
   * lays under the sheet outside ProseMirror's DOM. Copied into the first
   * sheet's clone, filling it. */
  firstSheetUnderlay?: HTMLElement | null;
}

type PrintLinkPlan = Map<number, { targets: Array<{ path: number[]; id: string }>; links: Array<{ path: number[]; id: string }> }>;

function elementPath(root: Element, element: Element): number[] | null {
  const path: number[] = [];
  let node: Element | null = element;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (!parent) return null;
    path.push(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === root ? path.reverse() : null;
}

function elementAtPath(root: Element, path: readonly number[]): Element | null {
  let node: Element | undefined = root;
  for (const index of path) node = node?.children[index];
  return node ?? null;
}

/** Each link's and target's place in its sheet, by the sheet it is on. */
function printLinkPlan(
  sheets: readonly HTMLElement[],
  resolve: StructuralPrintOptions["printLinks"],
): PrintLinkPlan {
  const plan: PrintLinkPlan = new Map();
  let pairs: ReadonlyArray<{ link: HTMLElement; target: HTMLElement }> = [];
  try {
    pairs = resolve?.() ?? [];
  } catch {
    return plan; // the copy prints without its links rather than not at all
  }
  const sheetOf = (element: HTMLElement) => sheets.findIndex((sheet) => sheet.contains(element));
  const entry = (index: number) => {
    let found = plan.get(index);
    if (!found) plan.set(index, (found = { targets: [], links: [] }));
    return found;
  };
  const ids = new Map<HTMLElement, string>();
  for (const { link, target } of pairs) {
    const linkSheet = sheetOf(link);
    const targetSheet = sheetOf(target);
    if (linkSheet < 0 || targetSheet < 0) continue;
    const linkPath = elementPath(sheets[linkSheet]!, link);
    let id = ids.get(target);
    if (!id) {
      const targetPath = elementPath(sheets[targetSheet]!, target);
      if (!targetPath) continue;
      id = `mrai-print-target-${ids.size + 1}`;
      ids.set(target, id);
      entry(targetSheet).targets.push({ path: targetPath, id });
    }
    if (linkPath) entry(linkSheet).links.push({ path: linkPath, id });
  }
  return plan;
}

/** A target gets its id; an anchor points at it; anything else (a TOC row's
 * button) is covered by an anchor of its size. */
function applyPrintLinks(clone: HTMLElement, plan: { targets: Array<{ path: number[]; id: string }>; links: Array<{ path: number[]; id: string }> } | undefined, doc: Document): void {
  if (!plan) return;
  for (const { path, id } of plan.targets) elementAtPath(clone, path)?.setAttribute("id", id);
  for (const { path, id } of plan.links) {
    const link = elementAtPath(clone, path) as HTMLElement | null;
    if (!link) continue;
    if (link.tagName === "A") {
      link.setAttribute("href", `#${id}`);
      link.removeAttribute("target");
      continue;
    }
    const host = link.parentElement ?? link;
    if (!host.style.position) host.style.position = "relative";
    const anchor = doc.createElement("a");
    anchor.setAttribute("href", `#${id}`);
    anchor.setAttribute("aria-hidden", "true");
    anchor.style.cssText = "position:absolute;inset:0;z-index:1";
    host.appendChild(anchor);
  }
}

function replaceChartCanvasesWithSnapshots(
  liveSheet: HTMLElement,
  clonedSheet: HTMLElement,
  doc: Document,
): void {
  const liveShells = Array.from(
    liveSheet.querySelectorAll<HTMLElement>(
      '[data-chart-print-source="echarts"]',
    ),
  );
  if (liveShells.length === 0) return;

  const clonedShells = Array.from(
    clonedSheet.querySelectorAll<HTMLElement>(
      '[data-chart-print-source="echarts"]',
    ),
  );
  if (clonedShells.length !== liveShells.length) {
    throw new PrintReadinessError(
      "chart-render",
      "The print document did not preserve every chart container.",
    );
  }

  liveShells.forEach((liveShell, index) => {
    if (liveShell.dataset.chartRenderStatus !== "ready") {
      throw new PrintReadinessError(
        "chart-render",
        "A chart is not ready for printing.",
        {
          family: liveShell.dataset.chartFamily,
          subtype: liveShell.dataset.chartSubtype,
          status: liveShell.dataset.chartRenderStatus,
        },
      );
    }

    let snapshot: string | null;
    try {
      snapshot = captureChartPrintSnapshot(liveShell);
    } catch (error) {
      throw new PrintReadinessError(
        "chart-render",
        "A chart could not be captured for printing.",
        error,
      );
    }
    if (!snapshot) {
      throw new PrintReadinessError(
        "chart-render",
        "A chart has no printable snapshot.",
        {
          family: liveShell.dataset.chartFamily,
          subtype: liveShell.dataset.chartSubtype,
        },
      );
    }

    const clonedShell = clonedShells[index];
    const clonedHost = clonedShell.querySelector<HTMLElement>(
      '[data-chart-canvas-host="true"]',
    );
    if (!clonedHost) {
      throw new PrintReadinessError(
        "chart-render",
        "The cloned chart has no render host.",
      );
    }

    const liveHost = liveShell.querySelector<HTMLElement>(
      '[data-chart-canvas-host="true"]',
    );
    // DOM rects include the document zoom transform; a clone prints in CSS
    // pixels. Prefer the chart's explicit layout height to avoid scaling twice.
    const heightStyle=liveHost?.style.height ?? "";
    const cssHeight = heightStyle.endsWith("px") ? Number.parseFloat(heightStyle) : Number.NaN;
    const renderedHeight = Number.isFinite(cssHeight) && cssHeight > 0
      ? cssHeight : liveHost?.getBoundingClientRect().height || 300;
    const image = doc.createElement("img");
    image.src = snapshot;
    image.alt = liveShell.getAttribute("aria-label") ?? "";
    image.setAttribute("data-chart-print-snapshot", "true");
    image.setAttribute(
      "style",
      `display:block;width:100%;height:${renderedHeight}px;object-fit:contain`,
    );
    clonedHost.replaceWith(image);
    clonedShell.dataset.chartRenderStatus = "snapshot";
  });
}

/**
 * Editor-only overflow guards must never clip a print clone. Span sheets keep
 * their data-page-span marker (numbering + box-decoration-break need it), but
 * their paper viewport is released so Chromium/WebKit can fragment the full
 * scroll flow across named @page boxes. A sheet holding a block that cannot
 * be cut and is taller than the text area (data-page-oversize) keeps its
 * paper: Word prints such a block on one page, ended by the paper's edge.
 */
/** Under every body object's rank (`--picture-float-rank`). */
const PRINT_BAND_Z_INDEX = -2147483000;

/**
 * A picture that runs past its paper's foot, as the copy may hold it.
 *
 * A picture is one box the printer cannot cut. One that starts on the page and
 * ends past it is moved whole to the next page, where the sheet's clip takes all
 * of it: a questionnaire scanned to the paper's size, 4-16 px too tall behind its
 * page's blank lines, printed as an empty page (R286-D01, 10 of its 12 scans). So
 * the box ends at the paper, and what it draws stays the size and place it was:
 * the paper cuts it, as Word's PDF does.
 */
export function pictureEndingAtPaper(
  box: { readonly top: number; readonly width: number; readonly height: number },
  paperHeight: number,
  drawn: {
    readonly image: string;
    readonly size?: string;
    readonly position?: string;
  },
): Record<string, string> | null {
  if (!(paperHeight > 0) || !(box.height > 0) || !(box.width > 0)) return null;
  const room = paperHeight - box.top;
  if (box.top + box.height <= paperHeight + 0.5 || !(room > 0)) return null;
  const fraction = (value: string | undefined, whole: number): number | null => {
    if (!value) return null;
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) return null;
    return value.endsWith("%") ? (number / 100) * whole : value.endsWith("px") ? number : null;
  };
  const [sizeX, sizeY] = (drawn.size ?? "100% 100%").trim().split(/\s+/);
  const width = fraction(sizeX, box.width);
  const height = fraction(sizeY, box.height);
  if (width === null || height === null) return null;
  const [positionX, positionY] = (drawn.position ?? "0% 0%").trim().split(/\s+/);
  const place = (value: string | undefined, free: number): number | null => {
    if (!value) return 0;
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) return null;
    return value.endsWith("%") ? (number / 100) * free : value.endsWith("px") ? number : null;
  };
  const left = place(positionX, box.width - width);
  const top = place(positionY, box.height - height);
  if (left === null || top === null) return null;
  return {
    height: `${room}px`,
    "max-height": `${room}px`,
    "object-fit": "none",
    "object-position": "-100000px -100000px",
    "background-image": drawn.image,
    "background-repeat": "no-repeat",
    "background-size": `${width}px ${height}px`,
    "background-position": `${left}px ${top}px`,
    "print-color-adjust": "exact",
  };
}

/** `pictureEndingAtPaper` over a sheet's copy, read from the live sheet it was
 * cloned from (before anything in the copy moves). */
function endPicturesAtPaper(sheet: HTMLElement, clone: HTMLElement): void {
  if (clone.hasAttribute("data-page-span")) return;
  const live = Array.from(sheet.querySelectorAll<HTMLImageElement>("img"));
  const copies = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  if (live.length === 0 || live.length !== copies.length) return;
  const paper = sheet.getBoundingClientRect();
  const scale = sheet.offsetHeight > 0 && paper.height > 0 ? paper.height / sheet.offsetHeight : 1;
  const paperHeight = sheet.offsetHeight;
  live.forEach((image, index) => {
    if (image.classList.contains("ProseMirror-separator")) return;
    const rect = image.getBoundingClientRect();
    const style = sheet.ownerDocument.defaultView?.getComputedStyle(image);
    // A turned picture's box is not its bounds; it is left as it stands.
    if (!style || (style.transform !== "none" && style.transform !== "")) return;
    const source = image.currentSrc || image.getAttribute("src") || "";
    const painted = style.backgroundImage && style.backgroundImage !== "none" ? style.backgroundImage : null;
    if (!painted && !source) return;
    const fitted = pictureEndingAtPaper(
      { top: (rect.top - paper.top) / scale, width: rect.width / scale, height: rect.height / scale },
      paperHeight,
      {
        image: painted ?? `url("${source.replace(/"/g, "%22")}")`,
        size: painted ? style.backgroundSize : undefined,
        position: painted ? style.backgroundPosition : undefined,
      },
    );
    if (!fitted) return;
    const copy = copies[index]!;
    for (const [name, value] of Object.entries(fitted)) copy.style.setProperty(name, value, "important");
    copy.parentElement?.style.setProperty("height", fitted.height!, "important");
  });
}

/** A rounding's worth past the foot is no page past it. */
const PRINT_FOOT_TOLERANCE_PX = 1;

/**
 * The copy is laid out with every formula typeset, as it prints. A page past its
 * foot here is one the layout read another way (a book's formulas drawn shorter
 * as placeholders: nine sheets, up to 47 px into the bottom margin): the copy
 * cannot be laid out again, so it says so for whoever reads the print's log.
 */
/**
 * A mark hung at a line's end (Word's terminal punctuation: `documentTerminalPunctuation`
 * takes its whole advance away, so it stands past the margin) was decided on the page,
 * its formulas placeholders. Typeset in the copy, a formula may break where its
 * placeholder could not, and words then follow the mark on its line: with no advance
 * they stood over it, and the mark was gone from the page (a book's "Z(G)。值得", one
 * print in two). A mark with something after it on its line takes its advance back.
 * So does one hung past the edge by overflowPunctuationHang (a negative margin of its
 * own width), after a formula among others.
 */
function restoreMarksNoLongerAtLineEnd(surface: HTMLElement, doc: Document): void {
  const marks = Array.from(
    surface.querySelectorAll<HTMLElement>('[data-docs-word-cjk-spacing="terminal"], [data-docs-hanging-punctuation]'),
  );
  const range = doc.createRange();
  const stranded = marks.filter((mark) => {
    const block = mark.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6, li");
    const last = block?.lastChild;
    if (!block || !last) return false;
    const box = mark.getBoundingClientRect();
    range.setStartAfter(mark);
    range.setEndAfter(last);
    const middle = (box.top + box.bottom) / 2;
    return Array.from(range.getClientRects()).some(
      (rect) => rect.width > 0.5 && rect.top < middle && rect.bottom > middle,
    );
  });
  // Written after all are read: each write would lay the page out for the next read.
  for (const mark of stranded) {
    if (mark.hasAttribute("data-docs-hanging-punctuation")) {
      mark.style.removeProperty("margin-inline-start");
      mark.style.removeProperty("left");
      continue;
    }
    const base = Number.parseFloat(mark.getAttribute("data-docs-word-cjk-base-letter-spacing") ?? "");
    mark.style.setProperty("letter-spacing", `${Number.isFinite(base) ? base : 0}px`, "important");
  }
}

function notePagesPastTheirFoot(surface: HTMLElement, doc: Document): void {
  const over: string[] = [];
  surface.querySelectorAll<HTMLElement>("article[data-page-sheet]").forEach((sheet, index) => {
    if (sheet.hasAttribute("data-page-span")) return;
    const px = bodyPastItsFootPx(sheet);
    if (px > PRINT_FOOT_TOLERANCE_PX) over.push(`${index}:${Math.round(px * 10) / 10}`);
  });
  if (over.length) doc.documentElement.setAttribute("data-mrai-print-over-foot", over.join(","));
}

/** Read here, not by the pagination's readers: this runs in the page over a copy in
 * another window, where their `instanceof HTMLElement` is false for every child
 * and they answer with the sheet's scroll height (a footer's own reach:
 * R283-D03's 44 sheets all "170 px over"). */
function bodyPastItsFootPx(sheet: HTMLElement): number {
  const style = getComputedStyle(sheet);
  const foot = Number.parseFloat(style.minHeight) - (Number.parseFloat(style.paddingBottom) || 0);
  if (!(foot > 0)) return 0;
  const top = sheet.getBoundingClientRect().top;
  let bottom = 0;
  for (const child of Array.from(sheet.children)) {
    if (child.matches('.ProseMirror-widget, .sheet-band-print, [data-float-mode="overlay"], [data-float-mode="float"]')) continue;
    const box = child.getBoundingClientRect();
    if (box.height > 0) bottom = Math.max(bottom, box.bottom - top);
  }
  return bottom - foot;
}

function releaseLivePaginationBounds(clonedSheet: HTMLElement): void {
  // Text that scrolls inside its one page on screen (INTERIM, see
  // OVER_TALL_TEXT_NODE_NAMES) is printed whole, over as many pages as it
  // takes: a scroller prints only what it shows.
  const scrollsText = clonedSheet.getAttribute("data-page-oversize") === "text";
  // A row the sheet shows past the paper on screen prints as Word prints it:
  // the paper ends it.
  if (clonedSheet.getAttribute("data-page-oversize") === "row") {
    clonedSheet.style.setProperty("overflow", "clip", "important");
  }
  if (clonedSheet.hasAttribute("data-page-span") || scrollsText) {
    clonedSheet.style.setProperty("max-height", "none", "important");
    clonedSheet.style.setProperty("overflow", "visible", "important");
  }
  if (scrollsText) {
    for (const child of Array.from(clonedSheet.children)) {
      if (!(child instanceof HTMLElement)) continue;
      child.style.setProperty("max-height", "none", "important");
      child.style.setProperty("overflow", "visible", "important");
    }
  }
}

/**
 * Word/WPS do not expose a parity filler as editable story content. Printing
 * does emit a real paper sheet, but it is completely empty: no body, header,
 * footer or page number. Clone only the following section's paper geometry and
 * suppress every authored/view decoration.
 */
function createImplicitParityBlank(
  doc: Document,
  followingSheet: HTMLElement,
  pageName: string,
): HTMLElement {
  const blank = doc.importNode(followingSheet, false);
  blank.replaceChildren();
  blank.setAttribute("data-page-sheet", "true");
  blank.setAttribute("data-page-parity-blank", "true");
  blank.setAttribute("aria-hidden", "true");
  blank.removeAttribute("contenteditable");
  blank.removeAttribute("data-page-span");
  blank.removeAttribute(PAGE_PARITY_GAP_ATTR);
  blank.removeAttribute(PAGE_NUMBER_FIRST_LABEL_ATTR);
  blank.removeAttribute(PAGE_NUMBER_LAST_LABEL_ATTR);
  blank.removeAttribute(PAGE_NUMBER_VISIBLE_ATTR);
  // A shallow sheet clone still carries runtime layout switches and authored
  // page backgrounds. Those can paint column rules, manuscript grids or page
  // colours even with no children, contradicting Word's implicit blank-page
  // contract. Preserve only the following section's paper geometry.
  blank.removeAttribute("data-page-column-flow");
  for (const attribute of Array.from(blank.attributes)) {
    if (attribute.name.startsWith("data-page-unequal-column")) {
      blank.removeAttribute(attribute.name);
    }
  }
  blank.style.setProperty("page", pageName);
  blank.style.setProperty("counter-increment", "none", "important");
  blank.style.setProperty("max-height", "none", "important");
  blank.style.setProperty("overflow", "hidden", "important");
  blank.style.setProperty("background-color", "white", "important");
  blank.style.setProperty("background-image", "none", "important");
  return blank;
}

export function printStructuralSheets(
  options: StructuralPrintOptions,
): Promise<PrintWindowResult> | undefined {
  if (typeof window === "undefined") return;
  const sheets = Array.from(
    options.root.querySelectorAll<HTMLElement>(
      ":scope > article[data-page-sheet]",
    ),
  );
  if (sheets.length === 0) return;
  const printWindow = window.open("", "_blank", "width=920,height=760");
  if (!printWindow) {
    // A pop-up blocker: Print must not end in silence.
    options.onPrintWindowBlocked?.();
    return Promise.resolve<PrintWindowResult>({
      status: "failed",
      error: new PrintReadinessError("popup-blocked", "The print window was blocked."),
    });
  }
  const doc = printWindow.document;
  doc.open();
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
  );
  doc.close();
  if (options.title) doc.title = options.title;

  // A headless printer waits for the copy's ready mark: a copy that cannot be
  // made says so, rather than leaving it to wait out its own deadline.
  const delivered = (result: Promise<PrintWindowResult>): Promise<PrintWindowResult> =>
    options.deliver !== "ready" ? result : result.then(
      (value) => {
        if (value.status !== "ready" && !printWindow.closed) doc.documentElement.setAttribute(PRINT_READY_ATTRIBUTE, "failed");
        return value;
      },
      (error: unknown) => {
        if (!printWindow.closed) doc.documentElement.setAttribute(PRINT_READY_ATTRIBUTE, "failed");
        throw error;
      },
    );
  // A final copy whose sheets show deleted text is laid out again under the
  // final view, and copied once that layout has settled; the screen's own
  // display comes back as soon as the copy is made (or the print ends).
  let restoreView = options.revisionMarkup == null ? (options.layOutFinalCopy?.() ?? null) : null;
  const putViewBack = () => {
    const restore = restoreView;
    restoreView = null;
    restore?.();
  };
  const viewPutBack = (result: Promise<PrintWindowResult>): Promise<PrintWindowResult> => {
    if (!restoreView) return result;
    return result.then(
      (value) => {
        putViewBack();
        return value;
      },
      (error: unknown) => {
        putViewBack();
        throw error;
      },
    );
  };
  const preparing = doc.createElement("div");
  const prepare = (refresh = false) => {
    if (printWindow.closed) return Promise.resolve<PrintWindowResult>({status: "closed"});
    // What a face arriving lays out again (the tab stops) is laid out now,
    // from scratch, with the faces that are in: the copy is not taken
    // between two arrivals, half laid out (layoutPending).
    settleLayoutNow(options.root);
    const refreshed = refresh && options.resolveAfterSourceReady ? options.resolveAfterSourceReady() : options;
    // The caller's own delivery, time limits and error report hold for the
    // copy made after the wait, whatever the refreshed sheet data says.
    const current = refreshed && refreshed !== options
      ? { ...refreshed, deliver: options.deliver, sourceTimeoutMs: options.sourceTimeoutMs,
          assetTimeoutMs: options.assetTimeoutMs, onReadinessError: options.onReadinessError ?? refreshed.onReadinessError }
      : refreshed;
    if (!current || current.root !== options.root || current.sourceIdentity !== options.sourceIdentity) throw new PrintReadinessError("aborted", "The source document changed.");
    preparing?.remove();
    const made = prepareStructuralSheets(
      { ...current, revisionMarkup: options.revisionMarkup ?? null },
      printWindow,
    );
    // The sheets are copied by now (the copy waits only for its assets).
    putViewBack();
    return made;
  };
  if (!restoreView && documentPrintSourceReadiness(options.root) === "ready") return delivered(prepare());
  preparing.dataset.testid = "print-source-preparing";
  preparing.textContent = options.preparingMessage ?? "Preparing document…";
  preparing.style.cssText = "font:14px/1.6 system-ui;padding:40px;text-align:center";
  doc.body.appendChild(preparing);
  return delivered(viewPutBack(waitForDocumentPrintSource(options.root, {cancelled: () => printWindow.closed, timeoutMs: options.sourceTimeoutMs}).then(() => prepare(true)).catch((raw: unknown): PrintWindowResult => {
    if (printWindow.closed) return {status:"closed"};
    const error = raw instanceof PrintReadinessError ? raw : new PrintReadinessError("print-failed", "The source document could not be prepared.", raw);
    renderPrintReadinessFailure(doc, options.readinessErrorMessage, error);
    options.onReadinessError?.(error);
    return {status:"failed", error};
  })));
}

function prepareStructuralSheets(options: StructuralPrintOptions, printWindow: Window): Promise<PrintWindowResult> {
  // Handwriting opened in bulk paints from a queue (deferredInkPaint): a
  // stroke still waiting is an empty drawing on its sheet. The copy is made
  // from the sheets, not by the browser's own print (whose "beforeprint"
  // drains the queue), so it drains here first -- the server's PDF of a
  // five-page page of ink kept page 1's first strokes alone (production,
  
  flushDeferredInkPaints();
  // Strokes drawn by their sheets' layers (inkLightLayer): every one drawn.
  flushInkLightLayers(options.root);
  const doc = printWindow.document;
  doc.title = options.title ?? "";
  doc.documentElement.toggleAttribute("data-docs-print-band-body-rules", printBandBodyRulesOff());
  const sheets = Array.from(options.root.querySelectorAll<HTMLElement>(":scope > article[data-page-sheet]"));
  if (!sheets.length) return Promise.resolve({status:"failed", error:new PrintReadinessError("aborted", "The source pages are unavailable.")});
  const revisionMarkup = options.revisionMarkup ?? null;
  // The change bars beside the live sheets, read before anything is copied.
  const changeBars = revisionMarkup === null ? new Map<number, SheetChangeBar[]>() : changeBarsBySheet(options.root, sheets);
  let measuredLineNumbers: Map<number, MeasuredPrintLineNumber[]>;
  try {
    measuredLineNumbers = measuredLineNumbersBySheet(
      options.root,
      sheets.length,
    );
  } catch (rawError) {
    const error =
      rawError instanceof PrintReadinessError
        ? rawError
        : measuredLineNumberError(rawError);
    renderPrintReadinessFailure(doc, options.readinessErrorMessage, error);
    options.onReadinessError?.(error);
    printWindow.focus();
    return Promise.resolve({ status: "failed", error });
  }

  // Same-origin stylesheets (editor content styles, KaTeX, fonts). The copy
  // is ready only once they have loaded: printed before, a page came out
  // with no margins, no alignment and the browser's own font (the PDF the
  // server prints from this copy has no dialog delay to hide the race).
  const stylesheetLoads: Promise<void>[] = [];
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      const clone = doc.createElement("link");
      clone.rel = "stylesheet";
      stylesheetLoads.push(
        new Promise<void>((resolve) => {
          clone.addEventListener("load", () => resolve(), { once: true });
          clone.addEventListener("error", () => resolve(), { once: true });
        }),
      );
      clone.href = link.href;
      doc.head.appendChild(clone);
    });
  document.querySelectorAll("style").forEach((style) => {
    doc.head.appendChild(style.cloneNode(true));
  });

  const pageCss = doc.createElement("style");
  const pageNames = sheets.map((_, index) => `mrn-sheet-${index}`);
  const fallbackPageSize = structuralPrintFallbackPageSize(
    options.root,
    options.surface,
    options.pageWidthPx,
    options.pageHeightPx,
  );
  const sheetPaperHeights: string[] = [];
  const perSheetPages = sheets
    .map((sheet, index) => {
      const { width, height } = physicalPrintPageSize(
        sheet,
        options.surface,
        fallbackPageSize.width,
        fallbackPageSize.height,
      );
      sheetPaperHeights[index] = inch(height);
      return `@page ${pageNames[index]}{size:${inch(width)} ${inch(height)};margin:0}`;
    })
    .join("");
  pageCss.textContent =
    `@page{size:${inch(fallbackPageSize.width)} ${inch(fallbackPageSize.height)};margin:0}` +
    perSheetPages +
    "html,body{margin:0;padding:0;background:#fff}" +
    // The surface's bottom gutter on screen would print as a blank last page.
    ".note-editor-content{padding:0!important}" +
    // Containment on a sheet (its fixed-size contain, and the screen's
    // off-viewport content-visibility) makes Chromium print it on the default
    // paper: a landscape section came out portrait and a page short (R25-D13
    // against Word). The copy's sheets state their size anyway; what runs
    // past one is cut at the paper's edge, as Word's PDF cuts it, instead of
    // spilling onto a page of its own.
    ".note-editor-content>article[data-page-sheet]{" +
    "content-visibility:visible!important;contain:none!important;overflow:clip!important;" +
    "page-break-after:always;break-after:page;margin:0!important;" +
    "box-shadow:none!important;border:none!important;border-radius:0!important}" +
    ".note-editor-content>article[data-page-sheet]:last-child{page-break-after:auto;break-after:auto}" +
    // Word's auto-inserted odd/even filler is a real blank physical page.
    // Surface-level header/footer/page-number pseudo-elements must not paint.
    ".note-editor-content>article[data-page-sheet][data-page-parity-blank]::before," +
    ".note-editor-content>article[data-page-sheet][data-page-parity-blank]::after{" +
    "content:none!important;display:none!important}" +
    // A span sheet (single block taller than a page) fragments across
    // several @page boxes; cloning the box decoration re-applies the sheet's
    // vertical padding on every fragment so continuation pages keep margins.
    ".note-editor-content>article[data-page-sheet][data-page-span]{" +
    "max-height:none!important;overflow:visible!important;" +
    "-webkit-box-decoration-break:clone;box-decoration-break:clone}" +
    // The trailing ghost paragraph is editor chrome, not document content.
    ".note-editor-content>p:last-child{display:none}" +
    printMarkupCss(revisionMarkup);
  doc.head.appendChild(pageCss);

  // Wrapper mirrors the surface so every scoped rule + CSS variable
  // (page geometry, typography, sheet chrome) resolves for the clones.
  const surfaceClone = doc.createElement("div");
  surfaceClone.className = options.surface.className.replace(
    /\bnote-editor-body-main--hidden\b/g,
    "",
  );
  const surfaceStyle = options.surface.getAttribute("style");
  if (surfaceStyle) surfaceClone.setAttribute("style", surfaceStyle);
  for (const attr of Array.from(options.surface.attributes)) {
    if (attr.name.startsWith("data-")) {
      surfaceClone.setAttribute(attr.name, attr.value);
    }
  }
  // Printing is always a physical-page projection. A direct print invocation
  // while Web Layout is active must not let its 100%-wide, zero-height sheet
  // rules survive in the popup clone.
  surfaceClone.dataset.documentViewMode = "print";
  surfaceClone.dataset.pageViewMode = "single";
  if (surfaceClone.dataset.paginationMode === "web") {
    surfaceClone.dataset.paginationMode = "continuous";
  }
  surfaceClone.style.width = `${fallbackPageSize.width}px`;
  surfaceClone.style.flexBasis = `${fallbackPageSize.width}px`;
  surfaceClone.style.maxWidth = `${fallbackPageSize.width}px`;
  surfaceClone.style.minWidth = `${fallbackPageSize.width}px`;
  surfaceClone.style.left = "";
  surfaceClone.style.transform = "none";
  surfaceClone.style.transformOrigin = "";
  // The content-columns host between the surface and the content: every
  // per-section column rule (newspaper columns projected into their tracks,
  // `data-page-unequal-column-flow`), doc-level column flow, vertical text
  // and the manuscript grid are scoped under it (note-editor.css
  // `.note-editor-content-columns .note-editor-content > article`). Left out,
  // the copy printed a two-column section as one column with its projected
  // blocks scattered over the page (AI70H H128 E04: a table drawn over the
  // footer, its words gone from the PDF).
  // The surface the editors hand over is a childless copy of theirs
  // (useDocumentStructuralPrintOptions: cloneNode(false)), which contains no
  // host: asked whether it contained one, the copy never had it, and every
  // print and server PDF of a newspaper-column section came out one narrow
  // column, its second column's words lost (R308-D01, R459-D17). The host is
  // taken unless it is the surface or stands outside it.
  const columnsHost = options.root.closest<HTMLElement>(".note-editor-content-columns");
  let contentParent: HTMLElement = surfaceClone;
  if (
    columnsHost &&
    columnsHost !== options.surface &&
    !columnsHost.contains(options.surface) &&
    !printColumnsHostOff()
  ) {
    const hostClone = doc.createElement("div");
    hostClone.className = columnsHost.className;
    const hostStyle = columnsHost.getAttribute("style");
    if (hostStyle) hostClone.setAttribute("style", hostStyle);
    for (const attr of Array.from(columnsHost.attributes)) {
      // The copy's sheets keep their own paper, its bands drawn inside each
      // one under the lines (no paper layer is copied: paperUnderlay.ts).
      if (attr.name === PAPER_UNDERLAY_ATTR) continue;
      if (attr.name.startsWith("data-")) hostClone.setAttribute(attr.name, attr.value);
    }
    surfaceClone.appendChild(hostClone);
    contentParent = hostClone;
  }
  const contentClone = doc.createElement("div");
  contentClone.className = options.root.className;
  applyPrintMarkupToContent(contentClone, revisionMarkup);
  // The measured gaps a bordered group's side edges run through are inline
  // properties of the paragraphs, which their clones carry into the print.
  contentClone.removeAttribute?.("contenteditable");
  // A sheet stretched by a single page-tall block stands for several printed
  // pages (data-page-span, stamped by the edit surface): its clone fragments
  // across that many @page boxes, so band {PAGE}/{NUMPAGES} tokens count the
  // same pages the printer emits.
  const spans = sheets.map((sheet) =>
    Number.parseInt(sheet.dataset.pageSpan || "1", 10),
  );
  let sectionCursor = 0;
  const sectionIndexes = sheets.map((sheet) => {
    const current = sectionCursor;
    sectionCursor += sheet.querySelectorAll(
      '[data-type="section-break"]',
    ).length;
    return current;
  });
  const ownNumbering = computePhysicalPageStarts(
    spans,
    sheets.map(endingSheetParityBreak),
    sectionRestartNumbers(sectionIndexes, options.sectionLayouts, options.evenAndOddHeaders === true),
  );
  // The pages this copy prints, for a printer putting parts together.
  doc.documentElement.setAttribute(PRINT_PAGES_ATTRIBUTE, String(ownNumbering.total));
  // A part of a longer document numbers its pages as they stand in it.
  const pageOffset = Math.max(0, Math.floor(options.pageOffset ?? 0));
  const numbering = pageOffset === 0 && options.totalPages === undefined ? ownNumbering : {
    ...ownNumbering,
    starts: ownNumbering.starts.map((start) => start + pageOffset),
    total: options.totalPages ?? ownNumbering.total + pageOffset,
  };
  if (pageOffset > 0) contentClone.style.setProperty("counter-reset", `mrn-page ${pageOffset}`);
  const pageNumberLabels =
    options.showPageNumbers === true
      ? resolvePhysicalSheetPageNumberLabels(
          sheets.map((_, index) => ({
            physicalStart: numbering.starts[index],
            span: spans[index],
            sectionIndex: sectionIndexes[index],
          })),
          {
            format: options.pageNumberFormat,
            start: options.pageNumberStart,
            startSection: options.pageNumberStartSection,
          },
        )
      : null;
  // The screen's own page fields, for a copy of the very sheets it draws
  // (not a part of a longer print, which numbers itself): R308-D01's pages
  // are 135, 136... on screen and in Word (w:pgNumType w:start="135"), and
  // the copy, counting by itself, printed 1, 2, 3.
  const screenFields =
    options.sheetPageFields &&
    !screenPageFieldsOff() &&
    pageOffset === 0 &&
    options.totalPages === undefined &&
    options.sheetPageFields.sheets === sheets.length
      ? options.sheetPageFields
      : null;
  const printLinks = printLinkPlan(sheets, options.printLinks);
  for (const [index, sheet] of sheets.entries()) {
    const clone = doc.importNode(sheet, true);
    // The page's strokes drawn as one layer (inkSheetLayer): the copy prints the
    // strokes themselves.
    // Strokes drawn from the note's data (inkLightLayer) print as their
    // layers, drawn in the copy's own tree.
    const liveLightHosts = sheet.querySelectorAll(`:scope > [${INK_LIGHT_HOST_ATTR}]`);
    clone.querySelectorAll(`:scope > [${INK_LIGHT_HOST_ATTR}]`).forEach((host, at) => printInkLightLayer(liveLightHosts[at], host, doc));
    clone.querySelectorAll(`[data-ink-sheet-layer]:not([${INK_LIGHT_HOST_ATTR}])`).forEach((layer) => layer.remove());
    clone.querySelectorAll("[data-ink-merged]").forEach((stroke) => stroke.removeAttribute("data-ink-merged"));
    endPicturesAtPaper(sheet, clone);
    // Before anything in the copy moves: the plan's paths are the live sheet's.
    applyPrintLinks(clone, printLinks.get(index), doc);
    if (index === 0 && options.firstSheetUnderlay) {
      // The sheet is its own stacking context: under its lines, over its
      // (transparent) paper.
      const underlay = doc.createElement("div");
      underlay.setAttribute("aria-hidden", "true");
      underlay.setAttribute("data-print-sheet-underlay", "");
      underlay.setAttribute(SHEET_PRINT_PART_ATTR, "");
      underlay.style.cssText = `position:absolute;inset:0;z-index:${PRINT_BAND_Z_INDEX - 1};pointer-events:none;overflow:hidden`;
      underlay.appendChild(doc.importNode(options.firstSheetUnderlay, true));
      // After the blocks, as the copy's other parts: its z-index puts it
      // under them. First, it moved every block one child on, so a page of
      // newspaper columns took each block's place from the block before it
      // (the projector's `:nth-child` slots), and the first block was no
      // longer the sheet's first child.
      if (printCoverFirstOff()) clone.insertBefore(underlay, clone.firstChild);
      else clone.appendChild(underlay);
    }
    // The live canvas reserves parity paper with a margin on the following
    // editable sheet. Print has already materialized that paper as a separate
    // clone, so carrying the live marker would reserve the same page twice.
    clone.removeAttribute(PAGE_PARITY_GAP_ATTR);
    clone.style.setProperty("page", pageNames[index]);
    // The sheet is its paper: exactly that tall (a span sheet runs over
    // several and keeps its own height).
    if (!clone.hasAttribute("data-page-span") && sheetPaperHeights[index]) {
      clone.style.setProperty("height", sheetPaperHeights[index]!, "important");
      clone.style.setProperty("max-height", sheetPaperHeights[index]!, "important");
    }
    clone.style.setProperty(
      "counter-increment",
      `mrn-page ${spans[index] + numbering.gapsBefore[index]}`,
    );
    const labels = pageNumberLabels?.[index];
    if (labels) {
      clone.setAttribute(PAGE_NUMBER_FIRST_LABEL_ATTR, labels.first ?? "");
      clone.setAttribute(PAGE_NUMBER_LAST_LABEL_ATTR, labels.last ?? "");
      if (labels.last !== null) {
        clone.setAttribute(PAGE_NUMBER_VISIBLE_ATTR, "true");
      } else {
        clone.removeAttribute(PAGE_NUMBER_VISIBLE_ATTR);
      }
    } else {
      clone.removeAttribute(PAGE_NUMBER_FIRST_LABEL_ATTR);
      clone.removeAttribute(PAGE_NUMBER_LAST_LABEL_ATTR);
      clone.removeAttribute(PAGE_NUMBER_VISIBLE_ATTR);
    }
    releaseLivePaginationBounds(clone);
    try {
      replaceChartCanvasesWithSnapshots(sheet, clone, doc);
    } catch (rawError) {
      const error =
        rawError instanceof PrintReadinessError
          ? rawError
          : new PrintReadinessError(
              "chart-render",
              "Preparing a chart for printing failed.",
              rawError,
            );
      renderPrintReadinessFailure(doc, options.readinessErrorMessage, error);
      options.onReadinessError?.(error);
      printWindow.focus();
      return Promise.resolve({ status: "failed", error });
    }
    // Snapshot before settling revisions so live and cloned chart indexes
    // still match. A final copy's pass then removes snapshots inside
    // deletions; a copy printed with its markup keeps them as shown.
    applyPrintMarkupToSheet(clone, revisionMarkup, changeBars.get(index), doc);
    // Formatting marks are a view overlay; Word never prints them.
    stripFormattingMarks(clone);
    if (numbering.gapsBefore[index] > 0) {
      contentClone.appendChild(
        createImplicitParityBlank(doc, sheet, pageNames[index]),
      );
    }
    const firstValue = labels ? labels.firstNumber : numbering.starts[index];
    const headerFields = screenFields?.at(index, "header") ?? null;
    const footerFields = screenFields?.at(index, "footer") ?? null;
    const headerContext = {
      pageLabel: labels
        ? (labels.first ?? "")
        : String(numbering.starts[index]),
      ...(!headerFields && typeof firstValue === "number" ? { pageNumberValue: firstValue } : {}),
      totalPages: numbering.total,
      styleDefinitions: options.bandStyleDefinitions,
      wordCompatibilityMode: options.bandWordCompatibilityMode ?? null,
      missingFontSubstitutes: options.bandMissingFontSubstitutes ?? null,
      ...(headerFields ? withPageFields(headerFields) : {}),
    };
    const footerContext = {
      pageLabel: labels
        ? (labels.last ?? "")
        : String(numbering.starts[index] + spans[index] - 1),
      ...(!footerFields && typeof firstValue === "number" ? { pageNumberValue: firstValue + spans[index] - 1 } : {}),
      totalPages: numbering.total,
      styleDefinitions: options.bandStyleDefinitions,
      wordCompatibilityMode: options.bandWordCompatibilityMode ?? null,
      missingFontSubstitutes: options.bandMissingFontSubstitutes ?? null,
      ...(footerFields ? withPageFields(footerFields) : {}),
    };
    // Odd and even headers go by the page's number, as on screen.
    const parityIndex = (headerFields ? headerFields.pageNumberValue ?? numbering.starts[index] : numbering.starts[index]) - 1;
    // Bands live in an overlay on screen (outside the ProseMirror DOM), so
    // the clone re-injects them per sheet with the same builders.
    const sectionCursor = sectionIndexes[index] ?? 0;
    const previousSectionCursor =
      index === 0 ? -1 : (sectionIndexes[index - 1] ?? -1);
    let headerRich = null;
    let footerRich = null;
    let headerBandText: string | null = null;
    let footerBandText: string | null = null;
    if (options.sectionBands) {
      const resolved = resolveSectionSheetBands(
        parityIndex,
        sectionCursor,
        options.sectionBands,
        {
          // Mirrors the on-screen overlay: page-scoped (native) entries
          // print on the FIRST sheet of their section only.
          // (A later part of a longer document starts mid-section.)
          isFirstSheetOfSection:
            (index === 0 && pageOffset === 0) ||
            (sectionCursor !== previousSectionCursor && !sheetOpensSectionMidPage(sheets[index - 1])),
        },
      );
      headerRich = resolved.headerRich;
      footerRich = resolved.footerRich;
      headerBandText = headerRich ? null : resolved.headerText;
      footerBandText = footerRich ? null : resolved.footerText;
    } else if (options.richBands) {
      const bands = resolveRichPageBands(
        parityIndex,
        options.richBands,
      );
      headerRich = bands.header;
      footerRich = bands.footer;
    }
    const inject = (
      className: string,
      rich: typeof headerRich,
      text: string | null,
      context: typeof headerContext,
    ) => {
      if (!rich && !text) return;
      const band = doc.createElement("div");
      band.className = `sheet-band-print ${className}`;
      band.setAttribute(SHEET_PRINT_PART_ATTR, "");
      // Word draws the header and footer stories under the body, its pictures
      // behind the text included: a shape in the header stood over the scans
      // behind R286-D01's pages, white over all but their last lines.
      band.style.zIndex = String(PRINT_BAND_Z_INDEX);
      if (rich) {
        band.appendChild(buildBandRichDom(doc, rich, context));
      } else if (text) {
        const inner = doc.createElement("div");
        inner.className = "sheet-band-rich sheet-band-rich--text";
        inner.textContent = resolveBandFieldTokens(text, context);
        band.appendChild(inner);
      }
      clone.appendChild(band);
    };
    inject(
      "sheet-band-print--header",
      headerRich,
      headerBandText,
      headerContext,
    );
    inject(
      "sheet-band-print--footer",
      footerRich,
      footerBandText,
      footerContext,
    );
    // V3.4 Word 脚注区: read-only per-sheet zone above the footer band.
    // importNode adopts the opener-document DOM into the popup (listeners
    // dropped — print output is inert by design).
    const zoneNotes = options.footnoteZones?.get(index);
    if (zoneNotes && zoneNotes.length > 0) {
      const zone = buildFootnoteZoneDom(
        zoneNotes,
        null,
        options.footnoteTextStyle ?? null,
      );
      if (zone) {
        const wrapper = doc.createElement("div");
        wrapper.className = "sheet-footnote-print";
        wrapper.setAttribute(SHEET_PRINT_PART_ATTR, "");
        wrapper.appendChild(doc.importNode(zone, true));
        clone.appendChild(wrapper);
      }
    }
    // The overlay is measured once against the live, fully typeset sheets.
    // Reuse those authenticated sheet-local coordinates in print; never infer
    // line boxes again from the cloned popup DOM.
    appendMeasuredLineNumbers(doc, clone, measuredLineNumbers.get(index));
    contentClone.appendChild(clone);
  }
  // Continued footnote rows after the last sheet print on pages of their
  
  const lastSheet = sheets[sheets.length - 1];
  for (let extra = 0; lastSheet && extra < (options.footnoteContinuationPages ?? 0); extra += 1) {
    const zoneNotes = options.footnoteZones?.get(sheets.length + extra);
    if (!zoneNotes || zoneNotes.length === 0) continue;
    const zone = buildFootnoteZoneDom(zoneNotes, null, options.footnoteTextStyle ?? null);
    if (!zone) continue;
    const paper = doc.importNode(lastSheet, false);
    paper.removeAttribute(PAGE_PARITY_GAP_ATTR);
    paper.removeAttribute("data-note-continuation-pages");
    paper.style.removeProperty("--note-continuation-pages");
    paper.style.setProperty("page", pageNames[sheets.length - 1]);
    paper.style.setProperty("counter-increment", "mrn-page 1");
    const wrapper = doc.createElement("div");
    wrapper.className = "sheet-footnote-print";
    wrapper.appendChild(doc.importNode(zone, true));
    paper.appendChild(wrapper);
    contentClone.appendChild(paper);
  }
  // A formula the editor has not typeset yet (lazy KaTeX: off screen, or
  // rebuilt away from the reader) is a transparent placeholder in the clone:
  // typeset every one before the copy is shown, or it prints as nothing.
  const finish = (): Promise<PrintWindowResult> => {
  // The faces the page built with `new FontFace` (the stand-ins for Office
  // families) are not in any stylesheet the copy took.
  const notedFaces = notedFontFaceRules(options.root.ownerDocument);
  if (notedFaces.length > 0) {
    const notedStyle = doc.createElement("style");
    notedStyle.setAttribute("data-noted-font-faces", "true");
    notedStyle.textContent = notedFaces.join("");
    doc.head.append(notedStyle);
  }
  contentParent.appendChild(contentClone);
  doc.body.appendChild(surfaceClone);

  printWindow.focus();
  const assetBudgetMs = options.assetTimeoutMs ?? PRINT_ASSET_TIMEOUT_MS;
  const fontReadinessStartedAt = performance.now();
  const stylesheetsLoaded = Promise.race([
    Promise.all(stylesheetLoads),
    new Promise<void>((resolve) => setTimeout(resolve, assetBudgetMs)),
  ]);
  return stylesheetsLoaded.then(() => installDocumentFontRules(surfaceClone, doc, {
    timeoutMs: assetBudgetMs,
  })).then(
    () => {
      // Laid out with its fonts: the bands' objects Word keeps on the paper.
      keepBandObjectsOnPaper(surfaceClone);
      wrapBandTextAroundObjects(surfaceClone);
      // A Word 2010 layout band, cut at half its page.
      clipBandsToHalfPage(surfaceClone);
      // A band WordArt box's words, bent (laid out with its fonts first).
      paintBandTextWarps(surfaceClone);
      // A table of contents' leaders are measured in the editor when a row
      // first shows; on a sheet the browser skipped (a print's far sheets, never
      // scrolled to) that is never, and a page of the table printed none. Here
      // every row is laid out.
      layoutTocLeaders(surfaceClone);
      restoreMarksNoLongerAtLineEnd(surfaceClone, doc);
      notePagesPastTheirFoot(surfaceClone, doc);
      return printWindowWhenReady(printWindow, surfaceClone, {
        skipDialog: options.deliver === "ready",
        errorMessage: options.readinessErrorMessage,
        onError: options.onReadinessError,
        timeoutMs: Math.max(
          1,
          assetBudgetMs - (performance.now() - fontReadinessStartedAt),
        ),
      });
    },
    (rawError: unknown): PrintWindowResult => {
      if (printWindow.closed) return { status: "closed" };
      const error =
        rawError instanceof PrintReadinessError
          ? rawError
          : new PrintReadinessError(
              "font-load",
              "Document fonts are unavailable for printing.",
              rawError,
            );
      renderPrintReadinessFailure(doc, options.readinessErrorMessage, error);
      options.onReadinessError?.(error);
      return { status: "failed", error };
    },
  );
  };
  return contentClone.querySelector("[data-math-pending]") ? typesetPendingMathIn(contentClone).then(finish) : finish();
}
