"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Read-only WYSIWYG page-view preview (Word "Print Layout" / Google Docs paged
 * view). Renders the document content sliced into discrete PAGE CARDS — each a
 * white paper rectangle at the configured page size with the configured margins,
 * a header band (header text) and a footer band (footer text + the page number
 * where configured), stacked vertically over a gray gutter.
 *
 * Pagination v1 is whole-blocks-only (no mid-block splitting): we clone the live
 * .ProseMirror rendered DOM (same approach as DocumentToolbar's printDocument),
 * measure each top-level block's height, pack blocks into pages by the existing
 * per-page content height (paginateBlocks), and distribute the cloned block
 * nodes across the cards. A single block taller than a page simply overflows its
 * page — documented in page-paginate.ts.
 *
 * The height-measuring step is INJECTABLE (`measureHeights` prop): the browser
 * measures with getBoundingClientRect, while tests supply fixed heights (jsdom
 * returns 0 for layout). This makes the pagination wiring unit-testable.
 */

import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import {
  documentDefaultIndentCss,
  EMPTY_DOCUMENT_DEFAULT_INDENTS,
  type DocumentDefaultIndents,
} from "@mrnote/core/web/components/console/editor/native-document/paragraphSetAsDefault.ts";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type {
  DocumentCharacterSpacingControl,
  DocumentDefaultTextAlign,
} from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";

import {
  paginateBlockLayout,
  type PaginationBreakKind,
} from "../../../../lib/document-export/page-paginate";
import {
  pageContentHeightPx,
  pageSetupSurfaceStyle,
  type CustomPageMarginsInches,
  type CustomPageSizeInches,
  type PageMargins,
  type PageOrientation,
  type PageSize,
} from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import { resolvePageBands, type FirstPageConfig } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { pageNumberLabel, type PageNumberFormat } from "@mrnote/core/web/components/console/editor/native-document/pageNumberFormat.ts";
import { watermarkCss, type WatermarkConfig } from "@mrnote/core/web/components/console/editor/native-document/watermark.ts";
import {
  isManuscriptGridEnabled,
  manuscriptGridCss,
  type ManuscriptGrid,
} from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import {
  measureFlowWithLayout,
  measureTypesetCloneBlockHeights,
  measureWithLayout,
  paginationControlKind,
  stripEditorChrome,
  typesetPendingMath,
} from "./typesetCloneMeasurement";
import { StableHtmlDiv } from "@mrnote/core/web/lib/stable-inner-html.tsx";

export { measureTypesetCloneBlockHeights } from "./typesetCloneMeasurement";

/** Measures the rendered height (CSS px) of each cloned top-level block. */
export type MeasureHeights = (blocks: HTMLElement[]) => number[];

export interface PagePreviewProps {
  /** The live ProseMirror editor DOM (`editor.view.dom`) to clone and slice. */
  sourceDom: HTMLElement | null;
  pageSize: PageSize;
  pageMargins: PageMargins;
  /**
   * Page orientation (portrait / landscape). Landscape swaps each preview card's
   * width↔height (and the usable content height the pagination slices against).
   * Defaults to portrait when absent, so a portrait document is unchanged.
   */
  pageOrientation?: PageOrientation;
  /** Concrete dimensions when `pageSize` is custom. */
  customPageSize?: CustomPageSizeInches | null;
  /** Per-side margins when `pageMargins` is custom. */
  customPageMargins?: CustomPageMarginsInches | null;
  /** Sanitized header text, or null when unset (no header band). */
  headerText: string | null;
  /** Sanitized footer text, or null when unset. */
  footerText: string | null;
  /** Whether to render the per-page page number in the footer band. */
  showPageNumbers: boolean;
  /**
   * Page-number NUMBERING STYLE (1/2/3, i/ii/iii, I/II/III, a/b/c, A/B/C). Only
   * applies when `showPageNumbers` is on. Defaults to decimal when absent, so a
   * document without an explicit format renders the plain arabic numbers as
   * before (byte-for-byte unchanged).
   */
  pageNumberFormat?: PageNumberFormat | null;
  /**
   * Page-number "Start at N" value — the first card's number. Only applies when
   * `showPageNumbers` is on. Defaults to 1 when absent.
   */
  pageNumberStart?: number | null;
  /**
   * Zero-based DOCX section where numbering begins. Imported documents can
   * attach the PAGE footer only to a later section (front matter stays
   * unnumbered). Native documents omit this and number from section zero.
   */
  pageNumberStartSection?: number | null;
  /**
   * Different-first-page header/footer config (Word w:titlePg). When
   * `differentFirstPage` is on, the FIRST card uses the first-page header/footer
   * (which may be null → no band) and the rest use the normal one. Defaults to
   * OFF so a document without the feature renders unchanged.
   */
  firstPage?: FirstPageConfig;
  /**
   * Word's line grid pitch (px) the live surface snaps lines to, or null.
   * The preview measures cloned blocks outside that surface, so it carries
   * the grid itself: unsnapped, a lines-grid document fitted far too much on
   * every card (corpus R50-D14: 37 cards for Word's 85 pages).
   */
  gridLinePitchPx?: number | null;
  /** Normalized watermark config, or null when unset (no stamp layer). */
  watermark?: WatermarkConfig | null;
  /**
   * Document-level manuscript-paper mode. Only the editor's explicit "grid"
   * mode paints cells; imported OOXML `docGrid type="lines"` is retained as
   * layout metadata and paints nothing. Absent / "off" → no grid.
   */
  manuscriptGrid?: ManuscriptGrid;
  /** Imported document base typography; shared by measurement + page cards. */
  defaultFontFamily?: string | null;
  defaultFontSize?: string | null;
  defaultTextColor?: string | null;
  defaultLineHeight?: string | null;
  defaultTextAlign?: DocumentDefaultTextAlign | null;
  characterSpacingControl?: DocumentCharacterSpacingControl | null;
  defaultKinsoku?: boolean | null;
  /** Word's strict line-start/end rules (w:strictFirstAndLastChars). */
  strictKinsoku?: boolean;
  defaultParagraphSpaceBefore?: number | null;
  defaultParagraphSpaceAfter?: number | null;
  /** Normal's indents (Paragraph > Set As Default) in points. */
  defaultIndents?: DocumentDefaultIndents;
  /**
   * Height-measuring step (INJECTABLE for tests). Defaults to a real layout read
   * via getBoundingClientRect; jsdom returns 0 there, so tests pass fixed
   * heights to exercise the pagination wiring deterministically.
   */
  measureHeights?: MeasureHeights;
}

interface PaginatedPreview {
  /** Outer HTML of each top-level block, in document order. */
  blockHtml: string[];
  /** Block indices per page (from paginateBlocks). */
  pages: number[][];
  /** Measured content height used by each page. */
  pageContentHeights: number[];
  /** Zero-based document section active on each page. */
  pageSections: number[];
  /** Pages whose first printable block arrived by natural height overflow. */
  naturalPageStarts: boolean[];
}

interface PreviewSourceBreakEdges {
  structuralBefore: boolean;
  markerBefore: boolean;
  markerAfter: boolean;
}

/** Whether a detached subtree contributes printable content around a marker. */
function hasPrintablePreviewContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.textContent?.trim());
  }
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) {
    return false;
  }
  if (
    node instanceof HTMLElement &&
    (node.matches(
      '[data-type="source-page-break"],.note-editor-editable-page-gap,.ProseMirror-gapcursor',
    ) ||
      node.style.display === "none")
  ) {
    return false;
  }
  const tag = node.tagName.toLowerCase();
  if (["br", "img", "svg", "canvas", "video", "hr", "table"].includes(tag)) {
    return true;
  }
  return Array.from(node.childNodes).some(hasPrintablePreviewContent);
}

function markerHasPrintableSibling(
  marker: HTMLElement,
  block: HTMLElement,
  direction: "before" | "after",
): boolean {
  let current: Node | null = marker;
  while (current && current !== block) {
    let sibling =
      direction === "before" ? current.previousSibling : current.nextSibling;
    while (sibling) {
      if (hasPrintablePreviewContent(sibling)) return true;
      sibling =
        direction === "before" ? sibling.previousSibling : sibling.nextSibling;
    }
    current = current.parentNode;
  }
  return false;
}

/**
 * Source boundaries representable by the detached whole-block preview.
 *
 * Block-level metadata is an explicit structural boundary. Inline markers at a
 * block edge are recorded separately: they remain soft cached-layout evidence,
 * except that a block-start marker immediately following a continuous section
 * control can recover that structural boundary. Mid-block markers need
 * line-level HTML slicing and are left to the editable paginator.
 */
export function previewSourceBreakEdges(
  block: HTMLElement,
): PreviewSourceBreakEdges {
  const structuralBefore =
    block.getAttribute("data-source-page-break-before") === "true";
  let markerBefore = false;
  let markerAfter = false;
  const markers = Array.from(
    block.querySelectorAll<HTMLElement>('[data-type="source-page-break"]'),
  );
  for (const marker of markers) {
    const hasBefore = markerHasPrintableSibling(marker, block, "before");
    const hasAfter = markerHasPrintableSibling(marker, block, "after");
    if (!hasBefore) markerBefore = true;
    else if (!hasAfter) markerAfter = true;
  }
  return { structuralBefore, markerBefore, markerAfter };
}

export default function PagePreview({
  sourceDom,
  pageSize,
  pageMargins,
  pageOrientation,
  customPageSize = null,
  customPageMargins = null,
  headerText,
  footerText,
  showPageNumbers,
  pageNumberFormat = null,
  pageNumberStart = null,
  pageNumberStartSection = null,
  watermark = null,
  manuscriptGrid,
  defaultFontFamily = null,
  defaultFontSize = null,
  defaultTextColor = null,
  defaultLineHeight = null,
  defaultTextAlign = null,
  characterSpacingControl = null,
  defaultKinsoku = null,
  strictKinsoku = false,
  defaultParagraphSpaceBefore = null,
  defaultParagraphSpaceAfter = null,
  defaultIndents = EMPTY_DOCUMENT_DEFAULT_INDENTS,
  firstPage,
  gridLinePitchPx = null,
  measureHeights = measureWithLayout,
}: PagePreviewProps) {
  const t = useTranslations("console-notebooks");
  const descriptionId = useId();
  // Hidden scratch host where the cloned ProseMirror node is mounted so its
  // blocks can be measured at the real content width before slicing into cards.
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const typesetMeasurementJobRef = useRef<symbol | null>(null);
  const [preview, setPreview] = useState<PaginatedPreview>({
    blockHtml: [],
    pages: [[]],
    pageContentHeights: [0],
    pageSections: [0],
    naturalPageStarts: [false],
  });
  // While the (potentially heavy) clone + math typesetting + measure pass runs,
  // show a lightweight "laying out pages" state. Deferring the work one frame
  // lets this paint before a formula-dense document's typesetting blocks the
  // main thread.
  const [preparing, setPreparing] = useState(false);
  // The editor mutates one stable ProseMirror DOM node in place. Its identity
  // therefore cannot tell the pagination effect that setContent/typing changed
  // the body. Observe content/layout-affecting mutations and turn them into a
  // small revision dependency; selection-only class churn is intentionally not
  // observed.
  const [sourceRevision, setSourceRevision] = useState(0);
  useEffect(() => {
    if (!sourceDom || typeof MutationObserver === "undefined") return;
    let revisionTimer: number | null = null;
    const scheduleRevision = () => {
      if (revisionTimer !== null) window.clearTimeout(revisionTimer);
      // A lazy KaTeX pass can replace thousands of preview subtrees in chunks.
      // One trailing revision after the burst is enough; cloning the full book
      // once per formula would make page view unusable.
      revisionTimer = window.setTimeout(() => {
        revisionTimer = null;
        setSourceRevision((revision) => revision + 1);
      }, 80);
    };
    const observer = new MutationObserver(() => {
      scheduleRevision();
    });
    observer.observe(sourceDom, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "style",
        "src",
        "width",
        "height",
        "data-line-height",
        "data-space-before",
        "data-space-after",
        "data-math-style",
        "data-latex",
        "data-source-page-break-before",
      ],
    });
    const fonts = document.fonts;
    const handleFontsLoaded = () => {
      // The formula-heavy path explicitly awaits the complete KaTeX font set
      // before measuring. Its own font-load edge is therefore already part of
      // the pending result and must not cancel/relaunch that same full clone.
      if (typesetMeasurementJobRef.current) return;
      scheduleRevision();
    };
    // Intrinsic image dimensions can settle without any DOM mutation. Listen in
    // the capture phase because `load` does not bubble; otherwise a detached
    // preview measured before a native/pasted/VML image decodes stays stale until
    // some unrelated edit happens to trigger a revision.
    const handleSourceLoad = () => scheduleRevision();
    sourceDom.addEventListener("load", handleSourceLoad, true);
    fonts?.addEventListener?.("loadingdone", handleFontsLoaded);
    void fonts?.ready?.then(handleFontsLoaded);
    return () => {
      observer.disconnect();
      sourceDom.removeEventListener("load", handleSourceLoad, true);
      fonts?.removeEventListener?.("loadingdone", handleFontsLoaded);
      if (revisionTimer !== null) window.clearTimeout(revisionTimer);
    };
  }, [sourceDom]);

  const surface = useMemo(
    () =>
      pageSetupSurfaceStyle(
        pageSize,
        pageMargins,
        customPageSize,
        customPageMargins,
        pageOrientation,
      ),
    [pageSize, pageMargins, customPageSize, customPageMargins, pageOrientation],
  );
  const contentHeight = useMemo(
    () =>
      pageContentHeightPx(
        pageSize,
        pageMargins,
        customPageSize,
        customPageMargins,
        pageOrientation,
      ),
    [pageSize, pageMargins, customPageSize, customPageMargins, pageOrientation],
  );
  const contentWidth =
    surface.width - surface.paddingLeft - surface.paddingRight;
  // Watermark style (whitelisted color + clamped opacity + fixed rotation), or
  // null when unset. Each page card paints its own copy so every printed page
  // carries the stamp (Word parity).
  const watermarkStyle = useMemo(
    () => (watermark ? (watermarkCss(watermark) as CSSProperties) : null),
    [watermark],
  );
  // Manuscript grid (稿纸 / squared paper) CSS for the page content area. A
  // repeating linear-gradient paints character-cell rules only for the editor's
  // explicit grid mode. Imported OOXML `docGrid type="lines"` is a layout
  // constraint, not visible ruling, and deliberately paints nothing. The CSS is
  // built from fixed constants and matches the live NoteEditor surface.
  const manuscriptGridStyle = useMemo(
    () => manuscriptGridCss(manuscriptGrid) as CSSProperties,
    [manuscriptGrid],
  );
  const manuscriptGridVisible = isManuscriptGridEnabled(manuscriptGrid);

  // Re-paginate whenever the source DOM, page geometry, or measurer changes.
  // This effect *synchronizes with an external system* — it clones the live
  // ProseMirror DOM and reads each block's rendered height via the injected
  // measurer (getBoundingClientRect in the browser) — exactly the carve-out the
  // set-state-in-effect rule docs describe. The derived pagination is then
  // stored. The setState calls are the synchronization seam, so the scoped
  // disables below are the legitimate pattern (the rule stays active elsewhere).
  useEffect(() => {
    const host = measureHostRef.current;
    if (!sourceDom || !host) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset derived pagination when the external source disappears
      setPreview({
        blockHtml: [],
        pages: [[]],
        pageContentHeights: [0],
        pageSections: [0],
        naturalPageStarts: [false],
      });
      return;
    }

    // `clone` is a detached copy of the live editor DOM; math typesetting and
    // measuring happen on IT, never on the live editor, so the fast editing
    // path is untouched.
    const finishMeasured = (
      blockHtml: string[],
      measuredHeights: number[],
      flowSpacingBefore: number[],
      controlKinds: Array<PaginationBreakKind | "continuous" | null>,
      sectionBreaks: boolean[],
      sourceBreakEdges: PreviewSourceBreakEdges[],
      liveHost: HTMLDivElement,
    ) => {
      const heights = blockHtml.map((_, index) =>
        controlKinds[index] ? 0 : (measuredHeights[index] ?? 0),
      );
      const breaksBefore = new Map<number, PaginationBreakKind>();
      for (let index = 0; index < sourceBreakEdges.length; index += 1) {
        const edges = sourceBreakEdges[index];
        const followsContinuous =
          index > 0 && controlKinds[index - 1] === "continuous";
        if (
          (edges?.structuralBefore ||
            (edges?.markerBefore && followsContinuous)) &&
          !breaksBefore.has(index)
        ) {
          breaksBefore.set(index, "nextPage");
        }
      }
      for (let index = 0; index < controlKinds.length; index += 1) {
        const kind = controlKinds[index];
        if (kind && kind !== "continuous") {
          // `index + 1 === blocks.length` is a terminal hard break; the pure
          // paginator preserves it as a trailing blank page.
          // Assignment deliberately overrides a cached source boundary at the
          // same position so explicit even/odd/page semantics win.
          breaksBefore.set(index + 1, kind);
        }
      }
      const pagination = paginateBlockLayout(
        heights,
        contentHeight,
        breaksBefore,
        flowSpacingBefore,
      );
      const pages = pagination.pages;
      const naturalStartIndices = new Set(pagination.naturalPageStarts);
      const pageContentHeights = pages.map((indices) =>
        indices.reduce(
          (sum, index) => sum + (pagination.effectiveBlockHeights[index] ?? 0),
          0,
        ),
      );
      const naturalPageStarts = pages.map(
        (indices, pageIndex) =>
          pageIndex > 0 &&
          indices.some(
            (index) =>
              controlKinds[index] === null && naturalStartIndices.has(index),
          ),
      );
      const sectionByBlock: number[] = [];
      let section = 0;
      for (let index = 0; index < controlKinds.length; index += 1) {
        sectionByBlock[index] = section;
        if (sectionBreaks[index]) {
          section += 1;
        }
      }
      let lastSection = 0;
      const pageSections = pages.map((indices) => {
        const firstPrintable = indices.find(
          (index) => controlKinds[index] === null,
        );
        if (firstPrintable !== undefined) {
          lastSection = sectionByBlock[firstPrintable] ?? lastSection;
          return lastSection;
        }
        // A blank parity/trailing page follows the most recently reached
        // section. This is the closest deterministic model without a full line
        // layout engine.
        const lastIndex = indices.at(-1);
        if (lastIndex !== undefined) {
          lastSection =
            (sectionByBlock[lastIndex] ?? lastSection) +
            (sectionBreaks[lastIndex] ? 1 : 0);
        }
        return lastSection;
      });
      liveHost.replaceChildren();
      setPreview({
        blockHtml,
        pages,
        pageContentHeights,
        pageSections,
        naturalPageStarts,
      });
      setPreparing(false);
    };

    const finish = (clone: HTMLElement, liveHost: HTMLDivElement) => {
      liveHost.replaceChildren(clone);
      const blocks = Array.from(clone.children).filter(
        (node): node is HTMLElement => node instanceof HTMLElement,
      );
      const controlKinds = blocks.map(paginationControlKind);
      const sourceBreakEdges = blocks.map(previewSourceBreakEdges);
      controlKinds.forEach((kind, index) => {
        if (!kind) return;
        const control = blocks[index];
        // Keep a zero-height index for hard-break semantics, but remove the
        // editable divider's text, rules, margins, and pseudo-element chrome
        // from the detached print-layout measurement.
        control.replaceChildren();
        control.setAttribute("aria-hidden", "true");
        control.style.setProperty("display", "none", "important");
        control.style.setProperty("margin", "0", "important");
      });
      // Break nodes are editing controls, not printable content. Keep their
      // zero-height indices in the packing model so leading/consecutive breaks
      // can create blank pages, but omit their divider chrome from page cards.
      const measured =
        measureHeights === measureWithLayout
          ? measureFlowWithLayout(blocks)
          : {
              heights: measureHeights(blocks),
              // An injected height function is authoritative and cannot expose
              // how much of each number is collapsible flow spacing.
              flowSpacingBefore: blocks.map(() => 0),
            };
      finishMeasured(
        blocks.map((block, index) =>
          controlKinds[index] ? "" : block.outerHTML,
        ),
        measured.heights,
        measured.flowSpacingBefore,
        controlKinds,
        blocks.map(
          (block) => block.getAttribute("data-type") === "section-break",
        ),
        sourceBreakEdges,
        liveHost,
      );
    };

    // Only a document with lazily-deferred formulas needs the heavy typeset
    // pass; for everything else (and every test fixture, which carries no
    // pending math) compute synchronously so the paged cards are ready on the
    // same tick — preserving the prior behavior exactly.
    const hasPendingMath =
      typeof sourceDom.querySelector === "function" &&
      sourceDom.querySelector("[data-math-pending]") !== null;

    if (!hasPendingMath) {
      const clone = sourceDom.cloneNode(true) as HTMLElement;
      stripEditorChrome(clone);
      typesetPendingMath(clone);
      finish(clone, host);
      return;
    }

    // Formula-dense document: show the "laying out pages" state and typeset in
    // bounded slices. Clone/typeset/measure one top-level block at a time and
    // retain only its HTML string, never a book-sized KaTeX DOM.
    setPreparing(true);
    let cancelled = false;
    const sourceBlocks = Array.from(sourceDom.children).filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement &&
        !node.classList.contains("note-editor-editable-page-gap") &&
        !node.classList.contains("ProseMirror-gapcursor"),
    );
    const controlKinds = sourceBlocks.map(paginationControlKind);
    const sourceBreakEdges = sourceBlocks.map(previewSourceBreakEdges);
    const blockHtml = new Array<string>(sourceBlocks.length).fill("");
    const injectedHeights = new Array<number>(sourceBlocks.length).fill(0);
    const measuredFlowSpacings = new Array<number>(sourceBlocks.length).fill(0);
    const measurementJob = Symbol("typeset-page-preview");
    typesetMeasurementJobRef.current = measurementJob;
    void measureTypesetCloneBlockHeights(
      sourceDom,
      () => cancelled,
      undefined,
      (index, block, flowSpacingBefore) => {
        if (!controlKinds[index]) blockHtml[index] = block.outerHTML;
        measuredFlowSpacings[index] = flowSpacingBefore;
        if (measureHeights !== measureWithLayout) {
          injectedHeights[index] = measureHeights([block])[0] ?? 0;
        }
      },
      "flow",
      { parent: host, width: contentWidth },
    )
      .then((measuredHeights) => {
        const liveHost = measureHostRef.current;
        if (!measuredHeights || cancelled || !liveHost) return;
        finishMeasured(
          blockHtml,
          measureHeights === measureWithLayout
            ? measuredHeights
            : injectedHeights,
          measureHeights === measureWithLayout
            ? measuredFlowSpacings
            : sourceBlocks.map(() => 0),
          controlKinds,
          sourceBlocks.map(
            (block) => block.getAttribute("data-type") === "section-break",
          ),
          sourceBreakEdges,
          liveHost,
        );
      })
      .finally(() => {
        if (typesetMeasurementJobRef.current === measurementJob) {
          typesetMeasurementJobRef.current = null;
        }
      });
    return () => {
      cancelled = true;
      if (typesetMeasurementJobRef.current === measurementJob) {
        typesetMeasurementJobRef.current = null;
      }
    };
  }, [
    sourceDom,
    sourceRevision,
    contentHeight,
    contentWidth,
    defaultFontFamily,
    defaultFontSize,
    defaultTextColor,
    defaultLineHeight,
    defaultTextAlign,
    characterSpacingControl,
    defaultKinsoku,
    defaultParagraphSpaceBefore,
    defaultParagraphSpaceAfter,
    defaultIndents,
    measureHeights,
  ]);

  const cardStyle: CSSProperties = {
    width: surface.width,
    paddingTop: surface.paddingTop,
    paddingRight: surface.paddingRight,
    paddingBottom: surface.paddingBottom,
    paddingLeft: surface.paddingLeft,
  };
  const typographyStyle = {
    ...(defaultFontFamily ? { "--doc-default-font": defaultFontFamily } : {}),
    ...(defaultFontSize ? { "--doc-default-font-size": defaultFontSize } : {}),
    ...(defaultTextColor
      ? { "--doc-default-text-color": defaultTextColor }
      : {}),
    ...(defaultLineHeight
      ? { "--doc-default-line-height": defaultLineHeight }
      : {}),
    ...(defaultParagraphSpaceBefore !== null
      ? {
          "--doc-default-paragraph-space-before": `${defaultParagraphSpaceBefore}pt`,
        }
      : {}),
    ...(defaultParagraphSpaceAfter !== null
      ? {
          "--doc-default-paragraph-space-after": `${defaultParagraphSpaceAfter}pt`,
        }
      : {}),
    ...documentDefaultIndentCss(defaultIndents),
  } as CSSProperties;
  const headerBandStyle: CSSProperties = {
    top: Math.max(12, Math.round(surface.paddingTop / 3)),
    left: surface.paddingLeft,
    right: surface.paddingRight,
  };
  const footerBandStyle: CSSProperties = {
    bottom: Math.max(12, Math.round(surface.paddingBottom / 3)),
    left: surface.paddingLeft,
    right: surface.paddingRight,
  };

  const pageCount = preview.pages.length;
  const numberedSection = Math.max(
    0,
    Math.floor(Number(pageNumberStartSection) || 0),
  );
  const firstNumberedPage = Math.max(
    0,
    preview.pageSections.findIndex((section) => section >= numberedSection),
  );
  // Different-first-page config, defaulted to OFF so an absent prop renders
  // every card with the normal header/footer (byte-for-byte unchanged).
  const firstPageConfig: FirstPageConfig = firstPage ?? {
    differentFirstPage: false,
    firstPageHeader: null,
    firstPageFooter: null,
  };

  return (
    <div
      // Document content keeps its ltr geometry under an rtl interface.
      dir="ltr"
      className="note-editor-page-preview"
      data-testid="note-editor-page-preview"
      data-page-size={pageSize}
      data-page-margins={pageMargins}
      data-pagination-fidelity="whole-block"
      data-doc-default-text-align={defaultTextAlign ?? undefined}
      data-doc-default-indent={
        defaultIndents === EMPTY_DOCUMENT_DEFAULT_INDENTS ? undefined : "true"
      }
      data-character-spacing-control={characterSpacingControl ?? undefined}
      data-doc-default-kinsoku={
        defaultKinsoku === null ? undefined : String(defaultKinsoku)
      }
      data-doc-strict-kinsoku={strictKinsoku ? "true" : undefined}
      aria-label={t("toolbar.pageView")}
      aria-describedby={descriptionId}
      aria-busy={preparing}
      data-doc-grid={gridLinePitchPx ? "lines" : undefined}
      style={
        gridLinePitchPx
          ? ({ ...typographyStyle, "--doc-grid-pitch": `${gridLinePitchPx}px` } as CSSProperties)
          : typographyStyle
      }
    >
      <p
        id={descriptionId}
        className="note-editor-page-preview__notice"
        role="note"
      >
        {t("toolbar.pageViewApproximation")}
      </p>
      {/* Hidden measuring host: the cloned ProseMirror node lives here only long
          enough to measure block heights, then is cleared. */}
      <div
        ref={measureHostRef}
        className="note-editor-page-preview__measure"
        style={{
          width: contentWidth,
        }}
        aria-hidden
      />
      {preparing ? (
        <div
          className="note-editor-page-preview__preparing"
          data-testid="note-editor-page-preview-preparing"
          role="status"
        >
          <EditorLoadingState
            kind="document"
            compact
            label={t("toolbar.pageViewPreparing")}
            announce={false}
          />
        </div>
      ) : null}
      {preview.pages.map((blockIndexes, pageIndex) => {
        // Resolve which header/footer this card shows: the first card uses the
        // first-page band when different-first-page is on; the rest use normal.
        const bands = resolvePageBands(
          pageIndex,
          headerText,
          footerText,
          firstPageConfig,
        );
        const numberedPage =
          showPageNumbers &&
          (preview.pageSections[pageIndex] ?? 0) >= numberedSection;
        const usedContentHeight = preview.pageContentHeights[pageIndex] ?? 0;
        // Never silently crop an oversized paragraph/table/image. Whole-block
        // pagination cannot split it yet, so that exceptional card expands by
        // the exact overflow and remains visibly marked as an approximation.
        const pageHeight =
          surface.minHeight + Math.max(0, usedContentHeight - contentHeight);
        const pageCardStyle: CSSProperties = {
          ...cardStyle,
          height: pageHeight,
          minHeight: pageHeight,
        };
        return (
          <div
            // Page index is a stable key here: pages are positional slices, not
            // identified entities, and the whole list re-derives on every change.
            key={pageIndex}
            className="note-editor-page-preview__page"
            data-testid="note-editor-page-preview-page"
            role="group"
            aria-label={t("toolbar.pagePreviewPageLabel", {
              page: pageIndex + 1,
              total: pageCount,
            })}
            style={pageCardStyle}
          >
            {watermark && watermarkStyle ? (
              <div
                className="note-editor-watermark"
                data-testid="note-editor-page-preview-watermark"
                aria-hidden
              >
                <span
                  className="note-editor-watermark__text"
                  style={watermarkStyle}
                >
                  {watermark.text}
                </span>
              </div>
            ) : null}
            {bands.header ? (
              <div
                className="note-editor-page-preview__header"
                data-testid="note-editor-page-preview-header"
                style={headerBandStyle}
              >
                {bands.header}
              </div>
            ) : null}
            <StableHtmlDiv
              className={`note-editor-page-preview__content note-editor-content ProseMirror${manuscriptGridVisible ? " note-editor-content-manuscript" : ""}`}
              data-testid="note-editor-page-preview-content"
              data-natural-page-start={
                preview.naturalPageStarts[pageIndex] ? "true" : undefined
              }
              // Manuscript-grid (稿纸) background: applied inline when the
              // document has an active grid mode, matching the NoteEditor surface.
              // The style object is built from fixed px constants (injection-safe).
              style={manuscriptGridVisible ? manuscriptGridStyle : undefined}
              // The cloned block HTML originates from the editor's own rendered
              // ProseMirror DOM (already-sanitized schema output), re-inserted to
              // paint the read-only page slice with the editor's content styles.
              // Parsed again only when the page's blocks change.
              html={blockIndexes
                .map((index) => preview.blockHtml[index] ?? "")
                .join("")}
            />
            {bands.footer || numberedPage ? (
              <div
                className="note-editor-page-preview__footer"
                data-testid="note-editor-page-preview-footer"
                style={{
                  ...footerBandStyle,
                  justifyContent: bands.footer ? "space-between" : "center",
                }}
              >
                {bands.footer ? <span>{bands.footer}</span> : null}
                {numberedPage ? (
                  <span
                    className="note-editor-page-preview__page-number"
                    data-testid="note-editor-page-preview-page-number"
                  >
                    {pageNumberLabel(
                      pageIndex - firstNumberedPage,
                      pageNumberStart,
                      pageNumberFormat,
                    )}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
