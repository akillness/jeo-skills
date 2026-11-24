/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The paged document surface's layout state, shared by the editor
 * (NoteEditor) and the print surface: the header/footer bands of every
 * sheet (rich, per section, page fields), the sheets' band boxes and the
 * room the bands take, the footnote zones and continuation, page numbering
 * (formats, chapters, parity), the band editing callbacks, and the page
 * surface's own styles (page geometry, columns, writing mode, manuscript
 * grid, watermark, design character styles).
 *
 * Moved unchanged out of NoteEditor.tsx: the same hooks in the same order,
 * reading the same inputs; the print surface passes its own (no band
 * editing, preview mode).
 */
"use client";

import type { RefObject } from "react";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { documentDefaultIndentCss } from "@mrnote/core/web/components/console/editor/native-document/paragraphSetAsDefault.ts";
import type { DocumentSurfaceAttrState } from "./documentSurfaceAttrs";
import {
  DRAWING_NODE_TYPES,
  documentRenderGridPitchPx,
  manuscriptGridNeedsDetachedPreview,
  MULTIPLE_PAGE_SPREAD_GAP_PX,
  NATIVE_STORY_REFUSAL_KEYS,
} from "./surfaceShared";
import { documentDesignCharacterStyleCss } from "@mrnote/core/web/lib/document-design.ts";
import { editorViewDom } from "@mrnote/core/web/components/console/editor/native-document/editorViewDom.ts";
import { readHeaderFooterNativeContextState } from "../headerFooterButtons";
import { PAGED_BULK_FILL_ATTR, writeDocumentLayoutStatus } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { restyleFromRecipeStyleSets } from "@mrnote/core/web/components/console/editor/native-document/documentDesignRestyle.ts";
import { type CSSProperties, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { effectiveDocumentCharacterSpacingControl } from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";
import { useChangedState } from "@mrnote/core/web/hooks/useChangedState.ts";
import { captureSavedPaginationProjection, readDocumentLayoutSnapshot, runtimeDocumentJson } from "@mrnote/core/web/__cut__/m2c7d818b46.ts";
import { handwritingPaperDataUrl } from "@mrnote/core/web/lib/handwriting-paper.ts";
import { pageBackgroundCss, pageBackgroundFillImage, pageBorderCss, pageSetupSurfaceCss, resolvePageDimensionsPx } from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import { documentColumnSeparatorCss, documentColumnsCss, isManuscriptGridEnabled, isVerticalWritingMode, manuscriptGridCss } from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import { normalizeSectionLayouts, sectionLayoutBandCss, sectionLayoutSheetCss, widestSectionPageWidthPx } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import { bandHasFieldTokens, bandStoriesOwnPageNumber, cssBandString, normalizeBandRichBlocks, normalizeSectionBands, resolveRichPageBands, resolveSectionSheetBands, sanitizeHeaderFooterText, type BandFieldToken, type BandRichBlock, type BandVariant, type RichBandsConfig } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import SheetBandBoxView from "./SheetBandBoxView";
import { normalizeWordCompatibilityMode } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import { documentMissingFontSubstitutes } from "@mrnote/core/web/components/console/editor/native-document/documentDisplayFonts.ts";
import { NAVIGATE_BAND_EDITOR_EVENT, OPEN_BAND_EDITOR_EVENT, type BandKind, type HeaderFooterEditingContext, type HeaderFooterNavigationTarget, type SheetBandBox } from "./SheetBandEditLayer";
import { formattingMarksPresentation } from "../formattingMarksExtension";
import { normalizeSectionStoryGraph, sectionStoryBandEditMode, sectionStoryEditableBlocks, sectionStoryNativeCommit } from "@mrnote/core/web/components/console/editor/native-document/sectionStoryGraph.ts";
import { ensureSheetStartsSection, sheetOpensSectionMidPage } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetSectionIsolation.ts";
import { resolveSectionSheetPageNumberLabels } from "@mrnote/core/web/components/console/editor/native-document/pageNumberFormat.ts";
import { useSheetChapterNumbers } from "../pageNumberChapters";
import { watermarkCss } from "@mrnote/core/web/components/console/editor/native-document/watermark.ts";
import { normalizeWordDocumentSettings } from "@mrnote/core/web/components/console/editor/native-document/wordDocumentSettings.ts";
import { type PagedEditingSeamNote, type SeamNoteHooks } from "@mrnote/core/web/components/console/editor/native-document/paged/pagedEditingExtension.ts";
import { SHEET_NOTE_SLICES_META, computeSheetFootnoteZones, readSheetNoteContinuationPages, readSheetNoteSlices } from "@mrnote/core/web/components/console/editor/native-document/paged/structuralFootnotes.ts";
import { pageBlockDistribution } from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import { mergePagedRuntimeContinuationsJson } from "@mrnote/core/web/components/console/editor/native-document/paged/serialization.ts";
import { preloadDocsLayoutReceipt, storeDocsLayoutReceipt } from "@mrnote/core/web/lib/docs-layout-receipt-cache.ts";
import { canonicalProjectionSample, capturePaginationProjectionRecipe, receiptForOpenedContent } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionReceipt.ts";
import { keepLayoutSnapshots, layoutSnapshotsEnabled } from "@mrnote/core/web/components/console/editor/native-document/paged/layoutSnapshot.ts";
import { documentAuthoredEditSeq } from "./ledger/pageLedgerExtension";
import { PAGE_BANDS_MEASUREMENT_PENDING_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { inkLayoutSettlesInMs } from "@mrnote/core/web/lib/ink-writing-session.ts";
import { bandsFirst, PAGE_BANDS_REBALANCE_REASON } from "./bandsFirst";
import { publishBandOverflowSections } from "@mrnote/core/web/components/console/editor/native-document/paged/bandOverflowSections.ts";
import { paginationBoxRelativeTo, paginationTransformScale } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationGeometry.ts";
import { clipBandsToHalfPage, measureFooterBandOverflowBySheet, measureHeaderBandOverflow, measureHeaderBandOverflowBySheet } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import { computePhysicalPageStarts, documentEvenAndOddHeaders, endingSheetParityBreak, measureSheetSpan, sectionRestartNumbers, type PageParityBreak } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetPageSpans.ts";
import { PAGE_SPAN_META } from "@mrnote/core/web/components/console/editor/native-document/paged/pageSpanExtension.ts";
import { SheetMeasureMemo, sheetsOf } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";
import { useOfficeDataVersion } from "@mrnote/core/web/lib/office-data/use-office-data.ts";
import { editorDom, executeEditorCommand, getEditorCommands, isUsableEditor, type MaybeNoteEditor } from "./editorRuntime";

export interface UseDocumentPagedSurfaceInputs {
  /** The document attrs the surface mirrors (useDocumentSurfaceAttrState). */
  attrs: DocumentSurfaceAttrState;
  detachedPagePreviewActive: boolean;
  docPageViewMode: "single" | "multiple-pages";
  documentLayoutViewMode: "print" | "web" | "outline" | "draft";
  editor: MaybeNoteEditor;
  editorHydrated: boolean;
  guestMode: boolean;
  loadedContent: unknown;
  pageId: string;
  shellEventMayStart: () => boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}

/** Where the caret goes back to in the body when a header or footer of the
 * sheet at `sheetIndex` closes: where it is when that is on the sheet, else
 * the sheet's first text position; null keeps it where it is. */
export function bodyCaretOnSheet(state: Editor["state"], sheetIndex: number | null): number | null {
  if (sheetIndex === null || sheetIndex < 0 || sheetIndex >= state.doc.childCount) return null;
  let start = 0;
  for (let index = 0; index < sheetIndex; index += 1) start += state.doc.child(index).nodeSize;
  const end = start + state.doc.child(sheetIndex).nodeSize;
  const { from } = state.selection;
  if (from > start && from < end) return null;
  const near = TextSelection.near(state.doc.resolve(Math.min(start + 1, state.doc.content.size)));
  return near.from > start && near.from < end ? near.from : null;
}

export function useDocumentPagedSurface(inputs: UseDocumentPagedSurfaceInputs) {
  const {
    attrs: {
      columnSeparator,
      columns,
      customPageMargins,
      customPageSize,
      differentOddEvenFlag,
      docCharacterSpacingControl,
      docDefaultFontFamily,
      docDefaultFontSize,
      docDefaultIndents,
      docDefaultLineHeight,
      docDefaultSpaceAfter,
      docDefaultSpaceBefore,
      docDefaultTextColor,
      docDesign,
      docDoNotUseEastAsianBreakRules,
      evenPageFooterText,
      firstPageConfig,
      footerText,
      handwriting,
      headerText,
      manuscriptGrid,
      pageBackgroundColor,
      pageBackgroundFill,
      pageBorder,
      pageMargins,
      pageNumberFormat,
      pageNumberStart,
      pageNumberStartSection,
      pageOrientation,
      pageSize,
      richBandRaw,
      sectionBandsRaw,
      sectionLayoutsRaw,
      sectionStoryGraphRaw,
      showPageNumbers,
      styleDefinitionsRaw,
      watermark,
      wordCompatibilityModeRaw,
      wordSettingsRaw,
      writingMode,
    },
    detachedPagePreviewActive,
    docPageViewMode,
    documentLayoutViewMode,
    editor,
    editorHydrated,
    guestMode,
    loadedContent,
    pageId,
    shellEventMayStart,
    t,
    wrapperRef,
  } = inputs;
  // Word docGrid line pitch (twips → px) when the document carries it; the
  // pure engine applies snap-to-grid slot accounting, and the paged surface +
  // measured flow snap sub-slot paragraphs (empty lines) to the same pitch so
  // the RENDER agrees with the accounting. Documents imported before the attr
  // existed simply run unquantized (pitch null).
  const docGridLinePitchPx = useMemo(() => {
    const attrs = (
      loadedContent as { attrs?: Record<string, unknown> } | null | undefined
    )?.attrs;
    return documentRenderGridPitchPx(attrs);
  }, [loadedContent]);
  // Word's "Adjust line height to grid height in the table": table lines
  // snap to the same pitch (note-editor.css [data-doc-grid-tables]).
  const docGridInTables = useMemo(
    () =>
      (loadedContent as { attrs?: Record<string, unknown> } | null | undefined)
        ?.attrs?.wordTableLinesOnGrid === true,
    [loadedContent],
  );

  // RICH letterhead bands: normalized once per raw-attr change; null when the
  // document carries none (the overlay then renders nothing at all).
  const richBands = useMemo<RichBandsConfig | null>(() => {
    const header = normalizeBandRichBlocks(richBandRaw.header);
    const footer = normalizeBandRichBlocks(richBandRaw.footer);
    const firstPageHeader = normalizeBandRichBlocks(richBandRaw.firstHeader);
    const firstPageFooter = normalizeBandRichBlocks(richBandRaw.firstFooter);
    const evenPageHeader = normalizeBandRichBlocks(richBandRaw.evenHeader);
    const evenPageFooter = normalizeBandRichBlocks(richBandRaw.evenFooter);
    if (
      !header &&
      !footer &&
      !firstPageHeader &&
      !firstPageFooter &&
      !evenPageHeader &&
      !evenPageFooter
    ) {
      return null;
    }
    return {
      header,
      footer,
      firstPageHeader,
      firstPageFooter,
      evenPageHeader,
      evenPageFooter,
      differentFirstPage: firstPageConfig.differentFirstPage,
      differentOddEven: differentOddEvenFlag,
    };
  }, [richBandRaw, firstPageConfig.differentFirstPage, differentOddEvenFlag]);

  // Per-section bands (Word renders each section's own header/footer).
  const sectionBands = useMemo(
    () => normalizeSectionBands(sectionBandsRaw),
    [sectionBandsRaw],
  );
  const sectionLayouts = useMemo(
    () => normalizeSectionLayouts(sectionLayoutsRaw),
    [sectionLayoutsRaw],
  );
  const wordSettings = useMemo(
    () => normalizeWordDocumentSettings(wordSettingsRaw),
    [wordSettingsRaw],
  );
  const effectiveCharacterSpacingControl = useMemo(
    () =>
      effectiveDocumentCharacterSpacingControl({
        characterSpacingControl: docCharacterSpacingControl,
        doNotUseEastAsianBreakRules: docDoNotUseEastAsianBreakRules,
        sectionLayouts: sectionLayoutsRaw,
        manuscriptGrid,
        docGridLinePitch:
          docGridLinePitchPx === null ? null : docGridLinePitchPx * 15,
      }),
    [
      docCharacterSpacingControl,
      docDoNotUseEastAsianBreakRules,
      docGridLinePitchPx,
      manuscriptGrid,
      sectionLayoutsRaw,
    ],
  );
  const sectionStoryGraph = useMemo(
    () =>
      normalizeSectionStoryGraph(sectionStoryGraphRaw, sectionLayouts?.length),
    [sectionLayouts?.length, sectionStoryGraphRaw],
  );
  // A PAGE field already embedded in a footer IS the page-number story.
  // The old screen path also enabled the sheet's CSS counter whenever
  // showPageNumbers was true, so one OOXML PAGE field painted twice ("77",
  // "22", …).  Exporters already avoid adding a second field; the screen now
  // applies the same ownership rule to both rich and plain-token imports.
  const bandOwnsPageNumber = useMemo(() => {
    if (sectionBands) {
      return bandStoriesOwnPageNumber(
        sectionBands.flatMap((entry) => [
          { text: entry.footerText, blocks: entry.footerRich },
          {
            text: entry.firstPageFooter,
            blocks: entry.firstPageFooterRich,
          },
          { text: entry.evenPageFooter, blocks: entry.evenPageFooterRich },
        ]),
      );
    }
    return bandStoriesOwnPageNumber([
      { text: footerText, blocks: richBands?.footer },
      {
        text: firstPageConfig.firstPageFooter,
        blocks: richBands?.firstPageFooter,
      },
      { text: evenPageFooterText, blocks: richBands?.evenPageFooter },
    ]);
  }, [
    evenPageFooterText,
    firstPageConfig.firstPageFooter,
    footerText,
    richBands,
    sectionBands,
  ]);

  // Per-sheet boxes for the band overlay (structural sheets are
  // fixed-size boxes, so the geometry only changes when the sheet COUNT or
  // the page setup does — measured off the live articles after each doc
  // change, in layout space so the zoom transform needs no compensation).
  // Each box also carries the sheet's SECTION index (cumulative section
  // breaks in earlier sheets) for per-section band resolution.
  const [sheetBandBoxes, setSheetBandBoxes] = useChangedState<
    Array<{
      top: number;
      left: number;
      width: number;
      height: number;
      sectionIndex: number;
      /** The sheet's section began on an earlier sheet, mid-page. */
      sectionContinues?: boolean;
      /** Printed pages this sheet stands for (single blocks taller than a
       * page stretch their sheet — see sheetPageSpans). */
      pageSpan: number;
      /** Odd/even section start that can create a non-editable physical page
       * before the following sheet. */
      parityBreakAfter: PageParityBreak;
      /** Overlay-space tops of each internal page boundary (span-1 lines). */
      seamTops: number[];
      /** Sheet padding (page margins), for anchoring the V3.4 footnote zone
       * inside the content box. */
      paddingLeft: number;
      paddingRight: number;
      paddingBottom: number;
    }>
  >([]);
  useLayoutEffect(() => {
    if (!isUsableEditor(editor)) {
      setSheetBandBoxes((prev) => (prev.length ? [] : prev));
      return;
    }
    const observedRoot = editorDom(editor);
    if ((richBands || sectionBands) && !detachedPagePreviewActive)
      writeDocumentLayoutStatus(observedRoot, PAGE_BANDS_MEASUREMENT_PENDING_ATTR, "true", editor);
    let raf = 0;
    // A sheet's section breaks and the break that ends it: what it holds,
    // not how it is laid out, so kept until something in the sheet changes.
    // Every update of a long book queried all its sheets for them (~300
    // subtree searches a key).
    const sheetBreaks = observedRoot ? new SheetMeasureMemo<{ sections: number; parity: ReturnType<typeof endingSheetParityBreak> }>(observedRoot) : null;
    const forgetExtents = (event?: Event) => {
      const reason = event instanceof CustomEvent ? String(event.detail?.reason ?? "") : "";
      if (reason !== "word-cjk-spacing-projection" && reason !== "document-auto-line-spacing-projection") {
        lastBoxes = null;
      }
    };
    // Until the browser has decided which sheets it skips (it does so in the
    // first frame it renders after they mount), reading any sheet lays the
    // whole document out: the first measurement after the 298-page book was
    // filled took a 1 s forced layout inside the frame that drew it. The
    // measurement waits for that decision (a few frames at most; a browser
    // that skips nothing never sends one).
    let skipStatesKnown = false;
    let framesWaited = 0;
    const onSheetVisibility = (event: Event) => {
      skipStatesKnown = true;
      const sheet = event.target;
      if (!(sheet instanceof HTMLElement) || !sheet.matches("article[data-page-sheet]")) return;
      if (!(event as Event & { skipped?: boolean }).skipped) schedule();
    };
    let lastBoxes: {
      sheets: HTMLElement[];
      nodes: readonly unknown[];
      boxes: typeof sheetBandBoxes;
      sections: number[];
      styles: Array<string | null>;
      settling: boolean;
      surfaceStyle: string;
      height: number;
      width: number;
      scaleX: number;
      scaleY: number;
      scrollLeft: number;
    } | null = null;
    const measure = () => {
      raf = 0;
      // A frame scheduled just before teardown can fire after the editor is
      // destroyed, and command-object mock harnesses pass isUsableEditor
      // without carrying a view at all — re-check both at fire time.
      if (!isUsableEditor(editor)) return;
      const root = editorViewDom(editor);
      if (!root?.isConnected) return;
      // While the first layout settles, the pages and this overlay are
      // hidden (note-editor.css: the initial-settling gate), and the fill's
      // chunks keep adding sheets the browser has not decided to skip yet:
      // each reading laid them all out (0.1-0.3 s apiece, ~1.1 s while the
      // 298-page book opened). The overlay is measured once the gate lifts
      // (the observer below), still before it is shown.
      //
      // Laying the pages out once on opening (L3-DESIGN) needs the room a
      // header or footer takes before the first pass, not after the last: a
      // one-line header under a header distance equal to the top margin took
      // 15 px off 120 pages of R286-D01 only when the gate lifted, and moved
      // 112 page starts. So the bands are read as soon as the document is
      // filled: where the sheets stand does not matter to a hidden overlay,
      // and no sheet's blocks are read for it.
      const settling = root.hasAttribute("data-pagination-initial-settling");
      if (settling && (!bandsFirst() || root.hasAttribute(PAGED_BULK_FILL_ATTR))) return;
      if (!skipStatesKnown) {
        if (framesWaited < 4) {
          framesWaited += 1;
          schedule();
          return;
        }
        skipStatesKnown = true;
      }
      const sheets = sheetsOf(root);
      const rootBox = root.getBoundingClientRect();
      const sameFrame = lastBoxes !== null && lastBoxes.sheets.length === sheets.length && lastBoxes.height === rootBox.height && lastBoxes.width === rootBox.width;
      // (Every sheet has a width while the root stands as it did.)
      if (!sheets.length || (!sameFrame && sheets.some((sheet) => sheet.offsetWidth <= 0))) return;
      const fallbackPageHeightPx = Number.parseFloat(
        getComputedStyle(root).getPropertyValue("--page-height-px"),
      );
      let sectionCursor = 0;
      const container = root.closest<HTMLElement>(".note-editor-content-columns");
      if (!container) return;
      const overlayScale = paginationTransformScale(container);
      const doc = editor.state.doc;
      const sheetNodes = doc.childCount === sheets.length ? sheets.map((_sheet, index) => doc.child(index)) : null;
      // A key changes one sheet and moves no other while the pages stand as
      // tall as they did: their boxes are the ones read last time. (A box per
      // sheet per key was a tenth of a key on a book.)
      const standing = lastBoxes;
      const surfaceStyleNow = root.closest('[data-testid="note-editor-page-surface"]')?.getAttribute("style") ?? "";
      let unchangedLayout = Boolean(
        sameFrame && standing && sheetNodes &&
        standing.scaleX === overlayScale?.x && standing.scaleY === overlayScale?.y &&
        container.scrollLeft === standing.scrollLeft &&
        standing.settling === settling && standing.surfaceStyle === surfaceStyleNow,
      );
      if (unchangedLayout && standing && sheetNodes) {
        let changedSheets = 0;
        for (let index = 0; index < sheets.length && unchangedLayout; index += 1) {
          if (standing.sheets[index] !== sheets[index]) unchangedLayout = false;
          else if (standing.nodes[index] !== sheetNodes[index]) {
            changedSheets += 1;
            if (changedSheets > 1) unchangedLayout = false;
          }
        }
      }
      const sections: number[] = [];
      const boxes = sheets.map((sheet, index) => {
        // A sheet nothing changed in, on paper as it was, is the box it was.
        if (unchangedLayout && standing && sheetNodes && standing.nodes[index] === sheetNodes[index] &&
            standing.boxes[index].sectionIndex === sectionCursor && standing.styles[index] === sheet.getAttribute("style")) {
          sections.push(standing.sections[index]);
          sectionCursor += standing.sections[index];
          return standing.boxes[index];
        }
        const geometry = paginationBoxRelativeTo(sheet, container, overlayScale);
        const top = settling ? 0 : geometry.top;
        const left = settling ? 0 : geometry.left;
        // A single block taller than a page stretches its sheet past the
        // nominal page height; the sheet then STANDS FOR span printed pages.
        // The article's data-page-span/counter-increment stamp is owned by
        // PageSpanExtension (a PM node decoration — direct DOM writes here
        // get reverted by ProseMirror's observer); this measurement only
        // feeds the seam-guide overlay and band numbering.
        const sheetNode = sheetNodes?.[index] ?? null;
        let breaks = sheetNode ? sheetBreaks?.get(sheet, sheetNode) : undefined;
        if (!breaks) {
          breaks = { sections: sheet.querySelectorAll('[data-type="section-break"]').length, parity: endingSheetParityBreak(sheet) };
          if (sheetNode) sheetBreaks?.set(sheet, sheetNode, breaks);
        }
        const sheetStyle = getComputedStyle(sheet);
        const pageHeightPx =
          Number.parseFloat(sheetStyle.minHeight) ||
          Number.parseFloat(sheetStyle.getPropertyValue("--page-height-px")) ||
          fallbackPageHeightPx;
        // The pages this sheet stands for are the stamp's (PageSpanExtension): it
        // alone knows what does not open a page, the blank end of a last line's
        // Auto leading, a table's first piece, a block nothing can cut. A second
        // reading of the sheet's height here numbered the bands past the pages
        // (corpus R283-D20: first page "2", third "5", the sheets said 1 and 3).
        const paddingTopPx = Number.parseFloat(sheetStyle.paddingTop) || 0;
        const paddingBottomPx = Number.parseFloat(sheetStyle.paddingBottom) || 0;
        const stampedSpan = Math.max(1, Number.parseInt(sheet.getAttribute("data-page-span") ?? "1", 10) || 1);
        const capacity = Math.max(120, (pageHeightPx || 1056) - paddingTopPx - paddingBottomPx);
        const { span, seamOffsets } = measureSheetSpan({
          sheetHeightPx: paddingTopPx + paddingBottomPx + (stampedSpan - 0.5) * capacity,
          pageHeightPx,
          paddingTopPx,
          paddingBottomPx,
        });
        const box = {
          top,
          left,
          width: geometry.width,
          height: geometry.height,
          // Section breaks close their section, so a sheet belongs to the
          // section counted BEFORE its content.
          sectionIndex: sectionCursor,
          // The section at this sheet's top began on the sheet before, under
          // its top (a continuous break mid-page): not its first page.
          sectionContinues: index > 0 && sheetOpensSectionMidPage(sheets[index - 1]),
          pageSpan: span,
          parityBreakAfter: breaks.parity,
          seamTops: seamOffsets.map((offset) => top + offset),
          paddingLeft: Number.parseFloat(sheetStyle.paddingLeft) || 0,
          paddingRight: Number.parseFloat(sheetStyle.paddingRight) || 0,
          paddingBottom: Number.parseFloat(sheetStyle.paddingBottom) || 0,
        };
        sections.push(breaks.sections);
        sectionCursor += breaks.sections;
        return box;
      });
      lastBoxes = sheetNodes && overlayScale
        ? {
            sheets, nodes: sheetNodes, boxes, sections, styles: sheets.map((sheet) => sheet.getAttribute("style")),
            height: rootBox.height, width: rootBox.width, scaleX: overlayScale.x, scaleY: overlayScale.y,
            scrollLeft: container.scrollLeft, settling, surfaceStyle: surfaceStyleNow,
          }
        : null;
      setSheetBandBoxes((prev) =>
        prev.length === boxes.length &&
        prev.every(
          (box, i) =>
            box.top === boxes[i].top &&
            box.left === boxes[i].left &&
            box.width === boxes[i].width &&
            box.height === boxes[i].height &&
            box.sectionIndex === boxes[i].sectionIndex &&
            box.sectionContinues === boxes[i].sectionContinues &&
            box.pageSpan === boxes[i].pageSpan &&
            box.parityBreakAfter === boxes[i].parityBreakAfter &&
            box.seamTops.length === boxes[i].seamTops.length &&
            box.seamTops.every((t, k) => t === boxes[i].seamTops[k]) &&
            box.paddingLeft === boxes[i].paddingLeft &&
            box.paddingRight === boxes[i].paddingRight &&
            box.paddingBottom === boxes[i].paddingBottom,
        )
          ? prev
          : boxes,
      );
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    schedule();
    // Defensive: command-object mock harnesses have no event emitter.
    const runtime = editor as unknown as {
      on?: (event: string, callback: () => void) => unknown;
      off?: (event: string, callback: () => void) => unknown;
    };
    if (typeof runtime.on === "function") runtime.on("update", schedule);
    // A new stamp changes no document: no "update" tells of it.
    const onStampedSpans = ({ transaction }: { transaction: { getMeta(key: string): unknown } }) => {
      if (transaction.getMeta(PAGE_SPAN_META) === undefined) return;
      lastBoxes = null;
      schedule();
    };
    if (typeof runtime.on === "function") runtime.on("transaction", onStampedSpans as () => void);
    const relayout = (event?: Event) => {
      forgetExtents(event);
      schedule();
    };
    window.addEventListener("resize", relayout);
    observedRoot?.addEventListener("mrn-page-rebalance", forgetExtents);
    observedRoot?.addEventListener("contentvisibilityautostatechange", onSheetVisibility, true);
    const settleGate = observedRoot && typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
        if (!observedRoot.hasAttribute("data-pagination-initial-settling")) schedule();
      })
      : null;
    settleGate?.observe(observedRoot as HTMLElement, { attributes: true, attributeFilter: ["data-pagination-initial-settling"] });
    const fonts = typeof document === "undefined" ? null : document.fonts;
    fonts?.addEventListener?.("loadingdone", relayout);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null : new ResizeObserver(() => relayout());
    if (observedRoot) resizeObserver?.observe(observedRoot);
    return () => {
      resizeObserver?.disconnect();
      sheetBreaks?.disconnect();
      observedRoot?.removeEventListener("mrn-page-rebalance", forgetExtents);
      observedRoot?.removeEventListener("contentvisibilityautostatechange", onSheetVisibility, true);
      settleGate?.disconnect();
      fonts?.removeEventListener?.("loadingdone", relayout);
      writeDocumentLayoutStatus(observedRoot, PAGE_BANDS_MEASUREMENT_PENDING_ATTR, null, editor);
      if (typeof runtime.off === "function") runtime.off("update", schedule);
      if (typeof runtime.off === "function") runtime.off("transaction", onStampedSpans as () => void);
      window.removeEventListener("resize", relayout);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [richBands, sectionBands, editor, editorHydrated, detachedPagePreviewActive]);

  // Word header-distance semantics: a letterhead TALLER than the top margin
  // pushes the body down. The overflow (band content vs its margin box) maps
  // onto extra sheet padding via --sheet-band-extra-top; the rebalancer reads
  // capacity from computed padding, so pagination stays honest — the nudge
  // event below re-settles the pages after the padding change.
  const [bandExtraTop, setBandExtraTop] = useChangedState(0);
  // Word pushes the body down only on the page whose header overflows its
  // top margin; a page whose header fits starts at the margin. Each sheet's
  // own overflow.
  const [bandExtraTopBySheet, setBandExtraTopBySheet] = useChangedState<Readonly<Record<number, number>>>({});
  // The same at the foot: a footer taller than the bottom margin lifts the
  // body's end on its own page (measureFooterBandOverflowBySheet).
  const [bandExtraBottomBySheet, setBandExtraBottomBySheet] = useChangedState<Readonly<Record<number, number>>>({});
  // The section each index's overflow above was measured for: a page a pass
  // moved to another section reads its section's (bandOverflowSections).
  const [bandOverflowSections, setBandOverflowSections] = useChangedState<readonly number[]>([]);
  useLayoutEffect(() => {
    const root = editorDom(editor);
    // A vertical or manuscript-grid page shows its detached preview and hides
    // the editor's own sheets (display: none): their bands are never laid out
    // to be measured, and waiting for them left the page "laying out" for
    // good (corpus R83-D02, a tbRl section: the bands-pending mark never
    // cleared). The preview draws the bands itself.
    if ((!richBands && !sectionBands) || detachedPagePreviewActive) {
      writeDocumentLayoutStatus(root, PAGE_BANDS_MEASUREMENT_PENDING_ATTR, null, editor);
      setBandExtraTop((prev) => (prev === 0 ? prev : 0));
      return;
    }
    if (!root) return;
    writeDocumentLayoutStatus(root, PAGE_BANDS_MEASUREMENT_PENDING_ATTR, "true", editor);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const overlay = wrapperRef.current?.querySelector(".sheet-band-overlay");
      // A Word 2010 layout band grows to half its page at most: cut before it
      // is measured, whichever of this and the band's own layout runs first.
      if (overlay && root?.isConnected) clipBandsToHalfPage(overlay);
      const extra = root?.isConnected && overlay && sheetBandBoxes.length
        ? measureHeaderBandOverflow(overlay) : null;
      if (extra === null) {
        raf = window.requestAnimationFrame(measure);
        return;
      }
      const bySheet = overlay ? measureHeaderBandOverflowBySheet(overlay) : {};
      setBandExtraTopBySheet((prev) =>
        JSON.stringify(prev) === JSON.stringify(bySheet) ? prev : bySheet);
      const footBySheet = overlay ? measureFooterBandOverflowBySheet(overlay) : {};
      setBandExtraBottomBySheet((prev) =>
        JSON.stringify(prev) === JSON.stringify(footBySheet) ? prev : footBySheet);
      const sectionsBySheet = sheetBandBoxes.map((box) => box.sectionIndex);
      setBandOverflowSections((prev) =>
        prev.length === sectionsBySheet.length && prev.every((section, index) => section === sectionsBySheet[index]) ? prev : sectionsBySheet);
      if (extra === bandExtraTop) {
        writeDocumentLayoutStatus(root, PAGE_BANDS_MEASUREMENT_PENDING_ATTR, null, editor);
      } else {
        setBandExtraTop(extra);
      }
    };
    raf = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(raf);
  }, [richBands, sectionBands, sheetBandBoxes, editor, bandExtraTop, editorHydrated, detachedPagePreviewActive, wrapperRef]);
  // Published with the overflow it names, in the commit that carries it.
  useLayoutEffect(() => {
    publishBandOverflowSections(editorDom(editor), bandOverflowSections);
  }, [editor, bandOverflowSections, bandExtraTopBySheet, bandExtraBottomBySheet]);
  
  // notes anchored on that sheet, recomputed per doc update with a cheap
  // signature compare so unchanged zones never re-render. Endnotes stay in
  
  const [sheetFootnoteZones, setSheetFootnoteZones] = useChangedState<
    Map<number, PagedEditingSeamNote[]>
  >(() => new Map());
  
  const [sheetNoteContinuationPages, setSheetNoteContinuationPages] = useChangedState(0);
  useEffect(() => {
    if (!isUsableEditor(editor)) {
      setSheetFootnoteZones((prev) => (prev.size ? new Map() : prev));
      return;
    }
    const zoneSignature = (
      zones: Map<number, PagedEditingSeamNote[]>,
    ): string =>
      JSON.stringify(
        [...zones.entries()].map(([index, notes]) => [
          index,
          notes.map((note) => [
            note.id,
            note.label,
            note.body,
            note.rich ?? null,
            note.sliceStart ?? null,
            note.sliceEnd ?? null,
            note.continued ?? false,
            note.continues ?? false,
          ]),
        ]),
      );
    const recompute = () => {
      const state = (editor as { state?: { doc?: unknown } }).state;
      const candidate = state?.doc;
      if (!candidate || typeof candidate !== "object") return;
      const runtimeNode = candidate as {
        forEach?: unknown;
        descendants?: unknown;
      };
      // Editor boot/teardown and compatibility adapters can briefly expose a
      // partial state object. Footnote zones are derived UI, so only traverse
      // once the live document exposes the ProseMirror methods we require.
      if (
        typeof runtimeNode.forEach !== "function" ||
        typeof runtimeNode.descendants !== "function"
      ) {
        return;
      }
      const doc = candidate as Parameters<typeof computeSheetFootnoteZones>[0];
      
      // not hold run on in the next page's zone.
      const zones = computeSheetFootnoteZones(
        doc,
        readSheetNoteSlices((editor as { view?: object }).view),
      );
      setSheetFootnoteZones((prev) =>
        zoneSignature(prev) === zoneSignature(zones) ? prev : zones,
      );
      setSheetNoteContinuationPages(
        readSheetNoteContinuationPages((editor as { view?: object }).view),
      );
    };
    recompute();
    const runtime = editor as unknown as {
      on?: (event: string, callback: (payload?: unknown) => void) => unknown;
      off?: (event: string, callback: (payload?: unknown) => void) => unknown;
    };
    // The ledger publishes new slices with a no-op transaction.
    const onTransaction = (payload?: unknown) => {
      const transaction = (payload as { transaction?: { getMeta?: (key: string) => unknown } } | undefined)?.transaction;
      if (transaction?.getMeta?.(SHEET_NOTE_SLICES_META)) recompute();
    };
    if (typeof runtime.on === "function") {
      runtime.on("update", recompute);
      runtime.on("transaction", onTransaction);
    }
    return () => {
      if (typeof runtime.off === "function") {
        runtime.off("update", recompute);
        runtime.off("transaction", onTransaction);
      }
    };
  }, [editor]);
  // Zone note bodies write back through the footnote store command; the
  // editor is resolved AT EVENT TIME (blur), never captured.
  const sheetFootnoteHooksRef = useRef<SeamNoteHooks>({
    canEdit: () => false,
    commitBody: () => false,
  });
  sheetFootnoteHooksRef.current = {
    canEdit: () => Boolean(editor && !editor.isDestroyed && editor.isEditable),
    commitBody: (noteId, body, rich) => {
      const commands = (editor as { commands?: Record<string, unknown> })
        ?.commands as
        | {
            setFootnoteBody?: (
              id: string,
              body: string,
              rich?: unknown,
            ) => boolean;
          }
        | undefined;
      return commands?.setFootnoteBody?.(noteId, body, rich) === true;
    },
    // Undo / Redo from a note go through the document's one history (WUA 007).
    history: (command) => {
      const commands = (editor as { commands?: Record<string, unknown> })?.commands as
        | { undo?: () => boolean; redo?: () => boolean }
        | undefined;
      if (!editor || editor.isDestroyed || !editor.isEditable) return false;
      return (command === "undo" ? commands?.undo?.() : commands?.redo?.()) === true;
    },
  };

  // Cumulative page numbering across sheet SPANS — one source of truth for
  // band {PAGE}/{NUMPAGES} tokens, seam guides, and print contexts.
  const sheetPageNumbering = useMemo(
    () =>
      computePhysicalPageStarts(
        sheetBandBoxes.map((box) => box.pageSpan),
        sheetBandBoxes.map((box) => box.parityBreakAfter),
        sectionRestartNumbers(
          sheetBandBoxes.map((box) => box.sectionIndex),
          sectionLayouts,
          documentEvenAndOddHeaders({
            differentOddEven: differentOddEvenFlag,
            sectionStoryGraph,
            sectionBands,
          }),
        ),
      ),
    [sheetBandBoxes, sectionLayouts, sectionBands, differentOddEvenFlag, sectionStoryGraph],
  );
  // Each section's own w:pgNumType (Format Page Numbers: number format,
  // Start at / Continue, chapter number) numbers its pages; a document with
  // none of them and no imported page-number scheme keeps the plain count.
  const sectionPageNumberSchemes = useMemo(
    () => sectionLayouts?.map((layout) => layout.pageNumber ?? null) ?? [],
    [sectionLayouts],
  );
  const sheetChapterNumbers = useSheetChapterNumbers(
    isUsableEditor(editor) ? editor : null,
    sectionPageNumberSchemes.some((scheme) => scheme?.chapterStyle !== undefined),
  );
  const sheetPageNumberLabels = useMemo(
    () =>
      showPageNumbers || sectionPageNumberSchemes.some(Boolean)
        ? resolveSectionSheetPageNumberLabels(
            sheetBandBoxes.map((box, index) => ({
              physicalStart: sheetPageNumbering.starts[index],
              span: box.pageSpan,
              sectionIndex: box.sectionIndex,
              sectionContinues: box.sectionContinues,
            })),
            sectionPageNumberSchemes,
            {
              legacy: showPageNumbers
                ? {
                    format: pageNumberFormat,
                    start: pageNumberStart,
                    startSection: pageNumberStartSection,
                  }
                : null,
              chapters: sheetChapterNumbers,
            },
          )
        : null,
    [
      pageNumberFormat,
      pageNumberStart,
      pageNumberStartSection,
      sectionPageNumberSchemes,
      sheetBandBoxes,
      sheetChapterNumbers,
      sheetPageNumbering.starts,
      showPageNumbers,
    ],
  );
  // The index Word's odd/even header choice reads for a sheet: its page
  // NUMBER less one. A section whose numbering restarts (Start at 1 on the
  // second sheet) shows the odd header on its first page, as Word does (in
  // print Word inserts a blank page there; the number decides either way).
  const sheetParityIndexes = useMemo(
    () =>
      sheetBandBoxes.map(
        (_, index) =>
          (sheetPageNumberLabels?.[index]?.firstNumber ??
            sheetPageNumbering.starts[index]) - 1,
      ),
    [sheetBandBoxes, sheetPageNumberLabels, sheetPageNumbering.starts],
  );
  const sheetParityPageStarts = useMemo(
    () => sheetParityIndexes.map((value) => value + 1),
    [sheetParityIndexes],
  );
  // What a sheet's header or footer shows for its page fields, and the Word
  // styles its runs are sized from: the painted band and an open story both
  // read it. Numbering runs over page SPANS (a stretched single-block sheet
  // stands for several printed pages): the header speaks for the span's
  // first page, the footer for its last -- matching the CSS counter, which
  // increments by the sheet's stamped span.
  // Word's replacements for the faces the page cannot draw arrive with the
  // display-font plan, after the bands may have been drawn.
  const [bandMissingFonts, setBandMissingFonts] = useState<Readonly<Record<string, readonly string[]>> | null>(null);
  useEffect(() => {
    if (!isUsableEditor(editor)) return;
    const read = () => setBandMissingFonts(documentMissingFontSubstitutes(editor.state));
    read();
    editor.on("transaction", read);
    return () => {
      editor.off("transaction", read);
    };
  }, [editor]);
  const sheetBandContext = useCallback(
    (index: number, kind: "header" | "footer") => {
      const labels = sheetPageNumberLabels?.[index];
      const span = sheetBandBoxes[index]?.pageSpan ?? 1;
      const firstValue = sheetPageNumberLabels
        ? labels?.firstNumber
        : sheetPageNumbering.starts[index];
      return {
        pageLabel: sheetPageNumberLabels
          ? ((kind === "header" ? labels?.first : labels?.last) ?? "")
          : String(sheetPageNumbering.starts[index] + (kind === "header" ? 0 : span - 1)),
        ...(typeof firstValue === "number"
          ? { pageNumberValue: firstValue + (kind === "header" ? 0 : span - 1) }
          : {}),
        totalPages: sheetPageNumbering.total,
        styleDefinitions: styleDefinitionsRaw,
        wordCompatibilityMode: normalizeWordCompatibilityMode(wordCompatibilityModeRaw),
        ...(bandMissingFonts ? { missingFontSubstitutes: bandMissingFonts } : {}),
      };
    },
    [sheetBandBoxes, sheetPageNumberLabels, sheetPageNumbering, styleDefinitionsRaw, wordCompatibilityModeRaw, bandMissingFonts],
  );
  // Each page's own header overflow re-plans its page too: a page whose
  // band was measured after the last pass (the maximum unchanged) kept the
  // block planned with the room the band then took, 17 px past its margin
  // (R25-D21, page 3).
  //
  // With the bands read first (bandsFirst) only the sheets whose room changed
  // are named: a new sheet a table's cut made gets its footer measured, and a
  // plain event made the ledger forget every measurement for it.
  const bandsSentRef = useRef<{ top: number; topBy: Readonly<Record<number, number>>; bottomBy: Readonly<Record<number, number>> } | null>(null);
  useEffect(() => {
    const sent = bandsSentRef.current;
    bandsSentRef.current = { top: bandExtraTop, topBy: bandExtraTopBySheet, bottomBy: bandExtraBottomBySheet };
    if (!bandsFirst()) {
      window.dispatchEvent(new Event("mrn-page-rebalance"));
      return;
    }
    let sheets: number[] | null = null;
    if (sent && sent.top === bandExtraTop) {
      const changed = new Set<number>();
      for (const [before, after] of [[sent.topBy, bandExtraTopBySheet], [sent.bottomBy, bandExtraBottomBySheet]] as const) {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          const index = Number(key);
          if (before[index] !== after[index]) changed.add(index);
        }
      }
      if (!changed.size) return;
      sheets = [...changed].sort((a, b) => a - b);
    }
    window.dispatchEvent(new CustomEvent("mrn-page-rebalance", { detail: { reason: PAGE_BANDS_REBALANCE_REASON, sheets } }));
  }, [bandExtraTop, bandExtraTopBySheet, bandExtraBottomBySheet]);

  // ---- On-page header/footer editing (WPS parity) ------------------------
  const [headerFooterContext, setHeaderFooterContext] =
    useState<HeaderFooterEditingContext | null>(null);
  const bandEditing = headerFooterContext !== null;
  const headerFooterOpenRef = useRef(false);
  // Close Header and Footer returns the insertion point to the body, as in
  // Word. The ribbon button that closed it unmounts with its contextual tab,
  // which would otherwise leave the keyboard on <body>.
  const headerFooterSheetRef = useRef<number | null>(null);
  const changeHeaderFooterEditing = useCallback(
    (context: HeaderFooterEditingContext | null) => {
      setHeaderFooterContext(context);
      // Told as the layer mounts too, with nothing being closed: that used to
      // focus the body as a document opened, scrolling to wherever its caret was.
      const closed = headerFooterOpenRef.current && context === null;
      headerFooterOpenRef.current = context !== null;
      if (context) headerFooterSheetRef.current = context.sheetIndex;
      if (!closed || !editor) return;
      const sheetIndex = headerFooterSheetRef.current;
      headerFooterSheetRef.current = null;
      window.requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const active = document.activeElement;
        if (!active || active === document.body || !active.isConnected) {
          // Word goes back to the body of the page whose header or footer
          // closed, the view where it is: the caret stays where it was on
          // that page, else it starts that page's body. Focused as it was
          // (scrolled to the caret), closing a header on page 9 brought the
          // reader back to page 1, where a caret never placed stands.
          editor.commands.focus(bodyCaretOnSheet(editor.state, sheetIndex), { scrollIntoView: false });
        }
      });
    },
    [editor],
  );
  const [headerFooterDocumentTextVisible, setHeaderFooterDocumentTextVisible] =
    useState(true);
  const toggleHeaderFooterDocumentText = useCallback(
    () => setHeaderFooterDocumentTextVisible((visible) => !visible),
    [],
  );
  // A floating editor popup (the selection BubbleMenu) is open over the
  // sheet. The band-edit layer's hit strips share the top/bottom margin
  // pixels with a toolbar positioned near the sheet edge; while the popup is
  // open the strips go inert so the 双击编辑 affordance can neither paint
  
  const [editorPopupOpen, setEditorPopupOpen] = useState(false);
  // A selected drawing (a shape, a SmartArt graphic, a picture) wears its
  // handles outside its own box: the rotation grip sits 22px above it. On a
  // drawing at the top of the body that grip lies in the header margin,
  // under the header's double-click strip, which is painted above every
  // page sheet (its own stacking context) and swallowed the press. While a
  // drawing is selected the strips go inert, as they do under a popup; the
  // ribbon's Header / Footer route stays live.
  const [drawingSelected, setDrawingSelected] = useChangedState(false);
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const selection = editor.state.selection;
      setDrawingSelected(
        selection instanceof NodeSelection &&
          DRAWING_NODE_TYPES.has(selection.node.type.name),
      );
    };
    sync();
    editor.on("selectionUpdate", sync);
    editor.on("blur", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("blur", sync);
    };
  }, [editor]);
  const bandAttrKey = useCallback(
    (kind: BandKind, variant: BandVariant): string =>
      variant === "first"
        ? kind === "header"
          ? "firstPageHeader"
          : "firstPageFooter"
        : variant === "even"
          ? kind === "header"
            ? "evenPageHeader"
            : "evenPageFooter"
          : kind === "header"
            ? "headerText"
            : "footerText",
    [],
  );
  const sectionBandKey = useCallback(
    (
      kind: BandKind,
      variant: BandVariant,
    ):
      | "headerText"
      | "footerText"
      | "firstPageHeader"
      | "firstPageFooter"
      | "evenPageHeader"
      | "evenPageFooter" =>
      variant === "first"
        ? kind === "header"
          ? "firstPageHeader"
          : "firstPageFooter"
        : variant === "even"
          ? kind === "header"
            ? "evenPageHeader"
            : "evenPageFooter"
          : kind === "header"
            ? "headerText"
            : "footerText",
    [],
  );
  const getBandText = useCallback(
    (
      kind: BandKind,
      variant: BandVariant,
      sectionIndex: number,
      sheetIndex?: number,
    ): string => {
      if (!isUsableEditor(editor)) return "";
      if (sectionBands) {
        const entry =
          sectionBands[
            Math.min(Math.max(sectionIndex, 0), sectionBands.length - 1)
          ];
        // Page-scoped (native) entries belong to their section's FIRST
        // sheet: a continuation sheet renders no band, so its editor
        // island starts from a CLEAN draft (committing will isolate the
        // sheet into its own section).
        if (
          entry?.pageScoped === true &&
          typeof sheetIndex === "number" &&
          sheetIndex > 0 &&
          sheetBandBoxes[sheetIndex - 1]?.sectionIndex === sectionIndex
        ) {
          return "";
        }
        return sanitizeHeaderFooterText(entry?.[sectionBandKey(kind, variant)]);
      }
      const attrs = (editor.state?.doc?.attrs ?? {}) as Record<string, unknown>;
      return sanitizeHeaderFooterText(attrs[bandAttrKey(kind, variant)]);
    },
    [bandAttrKey, editor, sectionBandKey, sectionBands, sheetBandBoxes],
  );
  const commitBandText = useCallback(
    (
      kind: BandKind,
      variant: BandVariant,
      text: string,
      sectionIndex: number,
      sheetIndex?: number,
    ) => {
      if (
        !shellEventMayStart() ||
        !isUsableEditor(editor) ||
        !editor.isEditable
      ) {
        return;
      }
      // Per-PAGE independence is the product default: a band belongs to
      // exactly the page it was edited on, and pages born from typing
      // overflow stay CLEAN (pageScoped entries render on their section's
      // first sheet only - the repeatedly reported "回车出来的新页继承
      // 页眉页脚" bug). Imported docx sections (entries without
      // pageScoped) keep Word's per-section semantics.
      // A document with its own section stories (an imported .docx) keeps
      // Word's sections: a band edit writes its section's story and never
      // inserts a section boundary, whether or not the page carries
      // sectionBands yet (an import whose bands all read empty has none).
      const nativeSectionCount = sectionStoryGraph?.sections.length ?? 0;
      const importedSections =
        nativeSectionCount > 0 ||
        (sectionBands !== null &&
          !sectionBands.some((entry) => entry.pageScoped === true));
      const importedSectionCount = sectionBands?.length ?? nativeSectionCount;
      if (importedSections && importedSectionCount > 0) {
        const commands = getEditorCommands<{
          setSectionBand?: (
            sectionIndex: number,
            kind: BandKind,
            variant: BandVariant,
            text: string,
          ) => boolean;
        }>(editor);
        commands?.setSectionBand?.(
          Math.min(Math.max(sectionIndex, 0), importedSectionCount - 1),
          kind,
          variant,
          text,
        );
        return;
      }
      // NATIVE per-page flow. Dispatch order matters (mismatched-
      // transaction lesson: editor.commands snapshots at ACCESS time, so
      // every dispatch below acquires its commands FRESH):
      // 1. ensure the edited sheet STARTS a section (start boundary only;
      //    sheet 0 and already-boundary sheets are no-ops);
      // 2. when that inserted a boundary into an EXISTING entries array,
      //    split the covering entry so indexes stay aligned;
      // 3. write the band into the sheet's own section (materializes
      //    page-scoped entries on first use - even for a sectionless
      //    single-page document).
      let targetSectionIndex = sectionIndex;
      if (typeof sheetIndex === "number" && isUsableEditor(editor)) {
        const ensured = ensureSheetStartsSection(editor as Editor, sheetIndex);
        if (ensured) {
          targetSectionIndex = ensured.sectionIndex;
          if (ensured.insertedBoundary && sectionBands) {
            const splitCommands = getEditorCommands<{
              splitSectionBandEntry?: (index: number) => boolean;
            }>(editor);
            splitCommands?.splitSectionBandEntry?.(ensured.sectionIndex - 1);
          }
        }
      }
      const commands = getEditorCommands<{
        setDocumentHeader?: (t: string) => boolean;
        setDocumentFooter?: (t: string) => boolean;
        setFirstPageHeader?: (t: string) => boolean;
        setFirstPageFooter?: (t: string) => boolean;
        setEvenPageHeader?: (t: string) => boolean;
        setEvenPageFooter?: (t: string) => boolean;
        setSectionBand?: (
          sectionIndex: number,
          kind: BandKind,
          variant: BandVariant,
          text: string,
        ) => boolean;
      }>(editor);
      // setSectionBand materializes page-scoped entries on first use (a
      // sectionless document is ONE section, single page included), so the
      // write lands on the edited sheet's section alone. The doc-level
      // fallback below only serves mock editors without the extension.
      if (commands?.setSectionBand?.(targetSectionIndex, kind, variant, text)) {
        return;
      }
      const command =
        variant === "first"
          ? kind === "header"
            ? commands?.setFirstPageHeader
            : commands?.setFirstPageFooter
          : variant === "even"
            ? kind === "header"
              ? commands?.setEvenPageHeader
              : commands?.setEvenPageFooter
            : kind === "header"
              ? commands?.setDocumentHeader
              : commands?.setDocumentFooter;
      executeEditorCommand(command, text);
    },
    [editor, sectionBands, sectionStoryGraph, shellEventMayStart],
  );
  // The band the canvas draws for one slot.
  const getPaintedBand = useCallback(
    (
      kind: BandKind,
      variant: BandVariant,
      sectionIndex: number,
    ): BandRichBlock[] | null => {
      if (sectionBands) {
        const entry =
          sectionBands[
            Math.min(Math.max(sectionIndex, 0), sectionBands.length - 1)
          ];
        if (!entry) return null;
        if (variant === "first") {
          return kind === "header"
            ? (entry.firstPageHeaderRich ?? null)
            : (entry.firstPageFooterRich ?? null);
        }
        if (variant === "even") {
          return kind === "header"
            ? (entry.evenPageHeaderRich ?? null)
            : (entry.evenPageFooterRich ?? null);
        }
        return kind === "header"
          ? (entry.headerRich ?? null)
          : (entry.footerRich ?? null);
      }
      if (!richBands) return null;
      if (variant === "first") {
        return kind === "header"
          ? richBands.firstPageHeader
          : richBands.firstPageFooter;
      }
      if (variant === "even") {
        return kind === "header"
          ? richBands.evenPageHeader
          : richBands.evenPageFooter;
      }
      return kind === "header" ? richBands.header : richBands.footer;
    },
    [richBands, sectionBands],
  );
  const getBandRich = useCallback(
    (
      kind: BandKind,
      variant: BandVariant,
      sectionIndex: number,
    ): BandRichBlock[] | null => {
      const paint = getPaintedBand(kind, variant, sectionIndex);
      // An editable native story opens as the blocks its save writes (a blank
      // Word part as its empty lines); the painted band is only a display
      // reading of the part.
      const storyBlocks = sectionStoryEditableBlocks(
        sectionStoryGraphRaw,
        sectionBands?.length,
        sectionIndex,
        kind,
        variant === "normal" ? "default" : variant,
        paint,
      );
      return storyBlocks ?? paint;
    },
    [getPaintedBand, sectionBands?.length, sectionStoryGraphRaw],
  );
  // A doc-attr change a ribbon command made through a header/footer story
  // editor (page setup, a band option) lands on the document, not the mirror.
  const forwardStoryDocumentAttrs = useCallback(
    (patch: Record<string, unknown>) => {
      if (!editor || editor.isDestroyed || !editor.isEditable) return;
      const spec = editor.schema.nodes.doc.spec.attrs ?? {};
      const tr = editor.state.tr;
      let changed = false;
      for (const [key, value] of Object.entries(patch)) {
        if (!(key in spec) || editor.state.doc.attrs[key] === value) continue;
        tr.setDocAttribute(key, value);
        changed = true;
      }
      if (changed) editor.view.dispatch(tr);
    },
    [editor],
  );

  const commitBandRich = useCallback(
    (
      kind: BandKind,
      variant: BandVariant,
      blocks: BandRichBlock[] | null,
      sectionIndex: number,
      sheetIndex?: number,
    ) => {
      if (
        !shellEventMayStart() ||
        !isUsableEditor(editor) ||
        !editor.isEditable
      ) {
        return;
      }
      // A document with its own section stories (an imported .docx) keeps
      // Word's sections: a band edit writes its section's story and never
      // inserts a section boundary, whether or not the page carries
      // sectionBands yet (an import whose bands all read empty has none).
      const nativeSectionCount = sectionStoryGraph?.sections.length ?? 0;
      const importedSections =
        nativeSectionCount > 0 ||
        (sectionBands !== null &&
          !sectionBands.some((entry) => entry.pageScoped === true));
      const importedSectionCount = sectionBands?.length ?? nativeSectionCount;
      if (importedSections && importedSectionCount > 0) {
        const commands = getEditorCommands<{
          setSectionBandRich?: (
            sectionIndex: number,
            kind: BandKind,
            variant: BandVariant,
            blocks: BandRichBlock[] | null,
          ) => boolean;
        }>(editor);
        commands?.setSectionBandRich?.(
          Math.min(Math.max(sectionIndex, 0), importedSectionCount - 1),
          kind,
          variant,
          blocks,
        );
        return;
      }
      let targetSectionIndex = sectionIndex;
      if (typeof sheetIndex === "number" && isUsableEditor(editor)) {
        const ensured = ensureSheetStartsSection(editor as Editor, sheetIndex);
        if (ensured) {
          targetSectionIndex = ensured.sectionIndex;
          if (ensured.insertedBoundary && sectionBands) {
            getEditorCommands<{
              splitSectionBandEntry?: (index: number) => boolean;
            }>(editor)?.splitSectionBandEntry?.(ensured.sectionIndex - 1);
          }
        }
      }
      const commands = getEditorCommands<{
        setSectionBandRich?: (
          sectionIndex: number,
          kind: BandKind,
          variant: BandVariant,
          blocks: BandRichBlock[] | null,
        ) => boolean;
        setDocumentBandRich?: (
          kind: BandKind,
          variant: BandVariant,
          blocks: BandRichBlock[] | null,
        ) => boolean;
      }>(editor);
      if (
        commands?.setSectionBandRich?.(
          targetSectionIndex,
          kind,
          variant,
          blocks,
        )
      ) {
        return;
      }
      commands?.setDocumentBandRich?.(kind, variant, blocks);
    },
    [editor, sectionBands, sectionStoryGraph, shellEventMayStart],
  );
  const isRichBandVariant = useCallback(
    (kind: BandKind, variant: BandVariant, sectionIndex: number): boolean =>
      getBandRich(kind, variant, sectionIndex) !== null,
    [getBandRich],
  );
  // The same graph and section count setSectionBandRich authenticates with,
  // so the island offers exactly the edits the command will keep.
  const getBandEditMode = useCallback(
    (kind: BandKind, variant: BandVariant, sectionIndex: number) =>
      sectionStoryBandEditMode(
        sectionStoryGraphRaw,
        sectionBands?.length,
        sectionIndex,
        kind,
        variant === "normal" ? "default" : variant,
        getPaintedBand(kind, variant, sectionIndex),
      ),
    [getPaintedBand, sectionBands?.length, sectionStoryGraphRaw],
  );
  // Word's own part opened in the story editor takes only the edits its save
  // can write into it; the island names the reason for any other.
  const getBandCommitRefusal = useCallback(
    (kind: BandKind, variant: BandVariant, sectionIndex: number, blocks: BandRichBlock[]) => {
      const committed = sectionStoryNativeCommit(
        sectionStoryGraphRaw,
        sectionBands?.length,
        sectionIndex,
        kind,
        variant === "normal" ? "default" : variant,
        normalizeBandRichBlocks(blocks) ?? blocks,
        getPaintedBand(kind, variant, sectionIndex),
      );
      return committed && !committed.ok ? committed.refusal : null;
    },
    [getPaintedBand, sectionBands?.length, sectionStoryGraphRaw],
  );
  // Per-section variant flags for the edit layer (mirrors the render's
  // resolveSectionSheetBands precedence at document page positions).
  const sectionBandFlags = useCallback(
    (sectionIndex: number) => {
      const nativeSection = sectionStoryGraph?.sections[sectionIndex];
      if (nativeSection) {
        return {
          differentFirstPage: nativeSection.titlePage,
          differentOddEven: sectionStoryGraph.evenAndOddHeaders,
        };
      }
      const entry = sectionBands
        ? sectionBands[
            Math.min(Math.max(sectionIndex, 0), sectionBands.length - 1)
          ]
        : undefined;
      return {
        differentFirstPage: entry?.differentFirstPage === true,
        differentOddEven: entry?.differentOddEven === true,
      };
    },
    [sectionBands, sectionStoryGraph],
  );
  // Ribbon 页眉/页脚 route: open the in-place island on the sheet nearest
  // the viewport center (WPS semantics) instead of the legacy toolbar
  // textarea panel. DOM-resolved so page spans/zoom cannot desync it.
  const openBandEditorOnPage = useCallback(
    (kind: BandKind) => {
      if (!isUsableEditor(editor)) return;
      const root = editorViewDom(editor);
      if (!root) return;
      const sheets = sheetsOf(root);
      if (sheets.length === 0) return;
      // The CARET's sheet wins: "改第二页的页脚" means the page the user
      // just clicked into, not whichever sheet happens to straddle the
      // viewport center (that heuristic sent the island - and the band
      // write - to a DIFFERENT page than the caret). Viewport center stays
      // as the fallback for caret-less states.
      let caretSheet = -1;
      try {
        const caretPos = editor.state.selection.$from.pos;
        let index = 0;
        editor.state.doc.forEach((child, offset) => {
          if (child.type.name !== "pageBlock") return;
          if (
            caretSheet === -1 &&
            caretPos >= offset &&
            caretPos <= offset + child.nodeSize
          ) {
            caretSheet = index;
          }
          index += 1;
        });
      } catch {
        caretSheet = -1;
      }
      const viewportCenter = window.innerHeight / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      sheets.forEach((sheet, index) => {
        const rect = sheet.getBoundingClientRect();
        const covers =
          rect.top <= viewportCenter && rect.bottom >= viewportCenter;
        const distance = covers
          ? 0
          : Math.min(
              Math.abs(rect.top - viewportCenter),
              Math.abs(rect.bottom - viewportCenter),
            );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      if (caretSheet >= 0 && caretSheet < sheets.length) {
        best = caretSheet;
      }
      sheets[best]?.scrollIntoView({
        block: kind === "footer" ? "end" : "start",
        behavior: "smooth",
      });
      window.dispatchEvent(
        new CustomEvent(OPEN_BAND_EDITOR_EVENT, {
          detail: { kind, sheetIndex: best },
        }),
      );
    },
    [editor],
  );
  const navigateBandEditor = useCallback(
    (target: HeaderFooterNavigationTarget) => {
      window.dispatchEvent(
        new CustomEvent(NAVIGATE_BAND_EDITOR_EVENT, { detail: { target } }),
      );
    },
    [],
  );

  const bandStoryLinkedToPrevious = useCallback(
    (sectionIndex: number, kind: BandKind, variant: BandVariant) =>
      isUsableEditor(editor) &&
      readHeaderFooterNativeContextState(editor, {
        sheetIndex: 0,
        sectionIndex,
        kind,
        variant,
        availableVariants: [],
        canPrevious: false,
        canNext: false,
      }).linkedToPrevious === true,
    [editor],
  );
  const bandEditLabels = useMemo(
    () => ({
      header: t("editor.band.header"),
      footer: t("editor.band.footer"),
      firstPageHeader: t("editor.band.firstPageHeader"),
      firstPageFooter: t("editor.band.firstPageFooter"),
      evenPageHeader: t("editor.band.evenPageHeader"),
      evenPageFooter: t("editor.band.evenPageFooter"),
      oddPageHeader: t("editor.band.oddPageHeader"),
      oddPageFooter: t("editor.band.oddPageFooter"),
      sameAsPrevious: t("editor.band.sameAsPrevious"),
      sectionTag: (label: string, sectionNumber: number) =>
        t("editor.band.sectionTag", { label, n: sectionNumber }),
      insertPageNumber: t("editor.band.insertPageNumber"),
      insertPageCount: t("editor.band.insertPageCount"),
      done: t("editor.band.done"),
      editHint: t("editor.band.editHint"),
      richHint: t("editor.band.richHint"),
      removeImage: t("editor.band.removeImage"),
      removeField: (field: BandFieldToken) =>
        t("editor.band.removeField", { field }),
      nativeReadOnly: t("editor.band.nativeReadOnly"),
      nativeTextOnly: t("editor.band.nativeTextOnly"),
      nativeRefusal: (reason: string) =>
        NATIVE_STORY_REFUSAL_KEYS.has(reason)
          ? t(`editor.band.nativeRefusal.${reason}`)
          : t("editor.band.nativeRefusal.native_story_edit_invalid"),
    }),
    [t],
  );

  // A plain band (no rich or section story) with {PAGE}/{NUMPAGES} tokens is
  // painted per sheet by the band overlay, as a rich band is: the sheet's CSS
  // chrome draws one string on every sheet and showed the tokens themselves,
  // while the band's editor showed the numbers.
  const plainHeaderTokens = !sectionBands && !richBands?.header && bandHasFieldTokens(headerText);
  const plainFooterTokens = !sectionBands && !richBands?.footer && bandHasFieldTokens(footerText);

  // The painted header/footer bands of every page. NoteEditor renders on each
  // transaction of a long document (its causal model publishes a snapshot per
  // keystroke), and this per-page tree only changes with the bands, the boxes,
  // the numbering, the section layouts or the band editing context.
  // A long document reopens on the pages it was last laid out on in this
  // browser (lib/docs-layout-receipt-cache): read as the page opens, kept
  // once its pagination has settled and the page is idle. Nothing is saved
  // to the server; the receipt applies only to the exact same content.
  useEffect(() => {
    if (pageId) void preloadDocsLayoutReceipt(pageId);
  }, [pageId]);
  useEffect(() => {
    if (!pageId || !isUsableEditor(editor)) return;
    const root = editorDom(editor);
    if (!root || typeof MutationObserver === "undefined") return;
    const view = root.ownerDocument.defaultView;
    if (!view) return;
    const PENDING = [
      "data-pagination-initial-settling",
      "data-pagination-background",
      "data-pagination-stalled",
      "data-pagination-ledger-deferred",
      "data-paged-bulk-filling",
    ];
    let timer: number | undefined;
    let idle: number | undefined;
    let keptFor: unknown = null;
    let keptAt = 0;
    /** Kept once, a long document's layout is kept again no sooner than this. */
    const KEEP_AGAIN_AFTER_MS = 60_000;
    // A harness that pre-creates `__docsLayoutReceiptTrace` sees each step.
    const trace = (entry: string) => {
      const sink = (view as Window & { __docsLayoutReceiptTrace?: unknown[] }).__docsLayoutReceiptTrace;
      if (Array.isArray(sink)) sink.push(`${Math.round(view.performance.now())} ${entry}`);
    };
    const keep = () => {
      idle = undefined;
      if (editor.isDestroyed) return;
      // A print or a picture of the pages (PagePreviewRender) keeps nothing
      // of its own: its layout goes back through the API
      // (__MRAI_PAGE_PREVIEW_LAYOUT, printLayoutToKeep), and the page has no
      // reader to store for. Reading it through here took R286's print 3 s of
      // the main thread while it was recorded (21 segments, never stored).
      // `window.__docsPrintKeepsOwn = true` keeps it as before.
      const host = view as Window & { __MRAI_PAGE_PREVIEW_SHOW?: unknown; __docsPrintKeepsOwn?: boolean };
      if (typeof host.__MRAI_PAGE_PREVIEW_SHOW === "function" && host.__docsPrintKeepsOwn !== true) {
        trace("print: kept by the API");
        return;
      }
      const pending = PENDING.filter((name) => root.hasAttribute(name));
      if (pending.length) {
        trace(`pending ${pending.join(",")}`);
        return;
      }
      // Not under the pen: keeping the receipt reads the whole document (its
      // projection, digests and layout key) in one task, 140-300 ms of a
      // 3000-stroke note in WebKit, which landed between two strokes of a
      // reader writing from the moment the note opened. It waits until the
      // pen has been away as long as a save's layout records do; what it
      // keeps is the same. `__mraiReceiptUnderPen` keeps it as before.
      const penWait = (view as Window & { __mraiReceiptUnderPen?: boolean }).__mraiReceiptUnderPen ? 0 : inkLayoutSettlesInMs();
      if (penWait > 0) {
        trace(`pen ${Math.round(penWait)}`);
        later(penWait + 50);
        return;
      }
      // Short documents lay out at once; only a long one is worth keeping.
      const sheets = sheetsOf(root).length;
      if (sheets < 8) {
        trace(`short ${sheets}`);
        return;
      }
      if (keptFor === editor.state.doc && !layoutSnapshotsEnabled()) return;
      // Kept a moment ago: kept again a minute on. Measuring every sheet and
      // hashing the whole document takes a second of a long one's main thread,
      // and while others edit it live each of their changes asked for it again,
      
      // 52 receiving a member's words in a book's part room).
      const since = view.performance.now() - keptAt;
      if (keptFor !== null && since < KEEP_AGAIN_AFTER_MS && !layoutSnapshotsEnabled()) {
        trace(`kept ${Math.round(since)} ms ago`);
        if (timer !== undefined) view.clearTimeout(timer);
        timer = view.setTimeout(schedule, KEEP_AGAIN_AFTER_MS - since);
        return;
      }
      // With kept layouts on the server, those are what is kept (each part
      // once it has been read through and when it changes).
      if (layoutSnapshotsEnabled()) {
        void keepLayoutSnapshots(editor.view, pageId, () => PENDING.some((name) => root.hasAttribute(name)), () => documentAuthoredEditSeq(editor.view));
        return;
      }
      try {
        const json = runtimeDocumentJson(editor.state.doc);
        let receipt = captureSavedPaginationProjection(editor, json);
        if (!receipt) {
          // A save withholds the receipt of a layout with a page running past
          // its foot (it would be stored as the printed pages). This one only
          // starts the next opening from the same pages, which the ledger
          // then checks again, so a measured, settled layout is kept as it is.
          // Only a measured layout is kept: one past measuring (a long
          // book's) is not read through to the end for the trace's sake.
          const layout = readDocumentLayoutSnapshot(editor.view, { readableOnly: true });
          const over = layout.overflow.map((value, index) => (value > 0.5 ? index + 1 : 0)).filter(Boolean);
          trace(`saved receipt withheld measured=${layout.measured} settling=${layout.settling} stalled=${layout.stalled} fonts=${layout.fontsReady} images=${layout.imagesReady} overflowing pages=${over.join(",")}`);
          // Pictures out of view load lazily and may never be in: their
          // boxes are laid out at their stated size, which the next opening's
          // ledger checks again with the rest.
          if (layout.measured && !layout.settling && !layout.stalled && layout.fontsReady) {
            receipt = capturePaginationProjectionRecipe(json, [...layout.pages]);
          }
        }
        // Named by the content the room opened with (receiptForOpenedContent).
        if (receipt) receipt = receiptForOpenedContent(editor.view.dom, receipt, json);
        // The whole-block distribution as a save stamps it (split pieces
        // merged back), the fallback when the receipt does not restore.
        const sizes = pageBlockDistribution(mergePagedRuntimeContinuationsJson(json));
        trace(`kept receipt=${receipt ? receipt.pages.length : "none"} sizes=${sizes ? sizes.length : "none"}${receipt ? ` hash=${receipt.canonicalHash.slice(0, 12)} ${canonicalProjectionSample(json)}` : ""}`);
        if (receipt || sizes) {
          keptFor = editor.state.doc;
          keptAt = view.performance.now();
          storeDocsLayoutReceipt(pageId, receipt, sizes);
        }
      } catch (error) {
        trace(`error ${String(error).slice(0, 120)}`);
        // Best-effort: the next opening lays the pages out again.
      }
    };
    function later(ms: number) {
      if (timer !== undefined) view!.clearTimeout(timer);
      if (idle !== undefined) view!.cancelIdleCallback?.(idle);
      idle = undefined;
      timer = view!.setTimeout(() => {
        timer = undefined;
        if (typeof view!.requestIdleCallback === "function") idle = view!.requestIdleCallback(keep, { timeout: 10_000 });
        else keep();
      }, ms);
    }
    const schedule = () => later(4_000);
    const observer = new MutationObserver(schedule);
    observer.observe(root, { attributes: true, attributeFilter: PENDING });
    schedule();
    return () => {
      observer.disconnect();
      if (timer !== undefined) view.clearTimeout(timer);
      if (idle !== undefined) view.cancelIdleCallback?.(idle);
    };
  }, [editor, pageId]);
  const sheetBandOverlay = useMemo(
    () =>
      (richBands || sectionBands || plainHeaderTokens || plainFooterTokens) &&
      sheetBandBoxes.length > 0 ? (
      <div
        className="sheet-band-overlay"
        data-testid="sheet-band-overlay"
        contentEditable={false}
        aria-hidden
      >
        {sheetBandBoxes.map((box, index) => {
          const context = sheetBandContext(index, "header");
          const footerContext = sheetBandContext(index, "footer");
          const physicalPageIndex = sheetParityIndexes[index];
          let headerRich = null;
          let footerRich = null;
          let headerBandText: string | null = null;
          let footerBandText: string | null = null;
          if (sectionBands) {
            const resolved = resolveSectionSheetBands(
              physicalPageIndex,
              box.sectionIndex,
              sectionBands,
              {
                // Page-scoped (native) entries paint only the
                // FIRST sheet of their section, so pages born
                // from typing overflow stay clean.
                isFirstSheetOfSection:
                  index === 0 ||
                  (sheetBandBoxes[index - 1]?.sectionIndex !==
                    box.sectionIndex &&
                    box.sectionContinues !== true),
              },
            );
            headerRich = resolved.headerRich;
            footerRich = resolved.footerRich;
            headerBandText = resolved.headerRich
              ? null
              : resolved.headerText;
            footerBandText = resolved.footerRich
              ? null
              : resolved.footerText;
          } else if (richBands) {
            const bands = resolveRichPageBands(
              physicalPageIndex,
              richBands,
            );
            headerRich = bands.header;
            footerRich = bands.footer;
          }
          if (!headerRich && plainHeaderTokens) headerBandText = headerText;
          if (!footerRich && plainFooterTokens) footerBandText = footerText;
          if (
            !headerRich &&
            !footerRich &&
            !headerBandText &&
            !footerBandText
          ) {
            return null;
          }
          return (
            <SheetBandBoxView
              key={index}
              index={index}
              className={`sheet-band-box${
                headerFooterContext?.sheetIndex === index
                  ? ` sheet-band-box--editing-${headerFooterContext.kind}`
                  : ""
              }`}
              style={{
                ...sectionLayoutBandCss(
                  sectionLayouts?.[box.sectionIndex],
                  wordSettings,
                  physicalPageIndex,
                ),
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
              }}
              headerRich={headerRich}
              footerRich={footerRich}
              headerBandText={headerBandText}
              footerBandText={footerBandText}
              context={context}
              footerContext={footerContext}
            />
          );
        })}
      </div>
      ) : null,
    [
      footerText,
      headerFooterContext,
      headerText,
      plainFooterTokens,
      plainHeaderTokens,
      richBands,
      sectionBands,
      sectionLayouts,
      sheetBandBoxes,
      sheetBandContext,
      sheetPageNumbering,
      sheetParityIndexes,
      wordSettings,
    ],
  );
  // Word shows crop marks at the corners of the text area by default in the
  // East Asian UI, as it does paragraph marks.
  const showCropMarks = useMemo(
    () => formattingMarksPresentation((key) => t(key as never)).showCropMarks,
    [t],
  );
  // An open band takes the layout variables its painted twin is placed with
  // (the rich-band overlay below), so opening it moves nothing.
  const sheetBandBoxStyle = useCallback(
    (box: SheetBandBox, index: number) =>
      sectionLayoutBandCss(
        sectionLayouts?.[box.sectionIndex],
        wordSettings,
        sheetPageNumbering.starts[index] - 1,
      ) as CSSProperties,
    [sectionLayouts, sheetPageNumbering.starts, wordSettings],
  );
  // While a band is open its editor draws it in place: the painted band of
  // that sheet steps aside (the plain text band is the sheet's own
  // ::before/::after, so it is hidden by position in this surface only).
  const bandEditScope = useId();
  // Word's style sets (served Office data) draw the character styles: the
  // rule follows them in when they arrive.
  const wordStyleSetsVersion = useOfficeDataVersion("word-style-sets");
  const designCharacterStyleRule = useMemo(
    () =>
      docDesign && wordStyleSetsVersion >= 0
        ? documentDesignCharacterStyleCss(
            docDesign,
            `[data-band-edit-scope="${bandEditScope}"]`,
          ) || null
        : null,
    [bandEditScope, docDesign, wordStyleSetsVersion],
  );
  // A document designed on a guest page wears MRAI's recipe of the style
  // sets; once Word's own are here (the visitor signed up and opened it),
  // what still wears the recipe takes Word's, as one automatic step.
  useEffect(() => {
    if (guestMode || !docDesign || !editorHydrated) return;
    if (!editor || editor.isDestroyed || !editor.isEditable) return;
    const tr = restyleFromRecipeStyleSets(editor.state.tr);
    if (tr) editor.view.dispatch(tr.setMeta("addToHistory", false));
  }, [docDesign, editor, editorHydrated, guestMode, wordStyleSetsVersion]);
  const bandEditingSheetRule = headerFooterContext
    ? `[data-band-edit-scope="${bandEditScope}"] .note-editor-content > article[data-page-sheet]:nth-of-type(${
        headerFooterContext.sheetIndex + 1
      })::${headerFooterContext.kind === "header" ? "before" : "after"} { visibility: hidden; }`
    : null;

  // The page margins are exposed as `--page-margin-x/y` custom properties so the
  // stylesheet can fold them into a responsive clamp() (see note-editor.css);
  // CSS custom properties are cast through CSSProperties for the inline style.
  const pageSurfaceStyle = useMemo(() => {
    const surfaceCss = pageSetupSurfaceCss(
      pageSize,
      pageMargins,
      customPageSize,
      customPageMargins,
      pageOrientation,
    );
    const sectionWidth = sectionLayouts
      ? widestSectionPageWidthPx(sectionLayouts)
      : null;
    const firstSectionGeometry = sectionLayouts?.[0]
      ? sectionLayoutSheetCss(sectionLayouts[0])
      : null;
    const physicalPageWidth =
      sectionWidth ?? Number.parseFloat(surfaceCss.maxWidth);
    const surfaceWidth =
      docPageViewMode === "multiple-pages"
        ? physicalPageWidth * 2 + MULTIPLE_PAGE_SPREAD_GAP_PX
        : physicalPageWidth;
    const continuousLayout = documentLayoutViewMode !== "print";
    return {
      ...surfaceCss,
      flexBasis: continuousLayout ? "100%" : `${surfaceWidth}px`,
      width: continuousLayout ? "100%" : undefined,
      maxWidth: continuousLayout ? "none" : `${surfaceWidth}px`,
      minWidth: continuousLayout ? 0 : `${surfaceWidth}px`,
      // The surface can be widened to fit a later landscape section, but its
      // inherited paper fallback must describe the first physical section.
      // Safari may ignore named @page rules and consumes this exact fallback.
      "--page-width-px":
        firstSectionGeometry?.width ?? `${physicalPageWidth}px`,
      "--sheet-paper-gap": `${MULTIPLE_PAGE_SPREAD_GAP_PX}px`,
      // Structural pages (v3): each sheet sizes itself to one page.
      "--page-height-px":
        firstSectionGeometry?.pageHeight ?? surfaceCss.minHeight,
      // Sheet chrome (v3.3): header/footer band text rendered by CSS
      // content on each sheet. JSON.stringify produces a valid CSS
      // string literal - no markup can escape into the stylesheet. A
      // multi-line band (Word letterhead blocks) joins its lines with the
      // CSS \a escape - a raw newline would end the CSS string token -
      // and the band rule's white-space: pre-line renders the breaks.
      "--sheet-header-text": cssBandString(headerText || ""),
      "--sheet-footer-text": cssBandString(footerText || ""),
      // Exposed as CSS variables (consumed by .note-editor-content rules in
      // note-editor.css) so the document's own base typography wins over the
      // stylesheet's app-font defaults. Both values pass the TextStyling
      // sanitizers in sync() above, so the inline style can never carry an
      // unvalidated value.
      ...(docDefaultFontFamily
        ? { "--doc-default-font": docDefaultFontFamily }
        : {}),
      ...(docDefaultFontSize
        ? { "--doc-default-font-size": docDefaultFontSize }
        : {}),
      ...(docDefaultTextColor
        ? { "--doc-default-text-color": docDefaultTextColor }
        : {}),
      ...(docDefaultLineHeight
        ? { "--doc-default-line-height": docDefaultLineHeight }
        : {}),
      ...(docDefaultSpaceBefore !== null
        ? {
            "--doc-default-paragraph-space-before": `${docDefaultSpaceBefore}pt`,
          }
        : {}),
      ...(docDefaultSpaceAfter !== null
        ? {
            "--doc-default-paragraph-space-after": `${docDefaultSpaceAfter}pt`,
          }
        : {}),
      ...documentDefaultIndentCss(docDefaultIndents),
      // Whole-page border (Word 页面边框): a single `border` shorthand built
      // only from whitelisted px/style/hex values (see pageBorderCss), so it
      // can never carry injected CSS. `null` border = empty object (no CSS),
      // so a border-free document's surface is byte-for-byte unchanged. Once
      // the document carries `sectionLayouts`, each sheet paints its own exact
      // `pageBorders` and the DOCX exporter ignores this legacy box, so it is
      // drawn only while no section layouts exist.
      ...(sectionLayoutsRaw === null || sectionLayoutsRaw === undefined
        ? pageBorderCss(pageBorder)
        : {}),
      // Page background color (Word 页面颜色): a single `backgroundColor`
      // built only from a whitelisted `#rrggbb` value (see pageBackgroundCss),
      // so it can never carry injected CSS. `null` color = empty object (no
      // CSS), so a fill-free document's surface is byte-for-byte unchanged.
      // Word colours the PAPER: in the paged view the colour goes to the
      // sheets through their variable (the desk around them stays), in the
      // continuous views the surface itself is the page.
      ...(continuousLayout
        ? pageBackgroundCss(pageBackgroundColor)
        : pageBackgroundCss(pageBackgroundColor).backgroundColor
          ? {
              "--doc-page-background":
                pageBackgroundCss(pageBackgroundColor).backgroundColor,
            }
          : {}),
      // The page's Fill Effects gradient over that colour, along the page
      // box as Word draws it.
      ...((() => {
        const image = pageBackgroundFillImage(
          pageBackgroundFill,
          physicalPageWidth,
          Number.parseFloat(String(surfaceCss.minHeight ?? "")) || undefined,
        );
        if (!image) return {};
        return continuousLayout ? { backgroundImage: image } : { "--doc-page-background-image": image };
      })()),
      // Word docGrid: sub-slot paragraphs (empty lines) snap their rendered
      // height to the grid pitch in paged mode (note-editor.css), matching
      // the engine's slot accounting — Word charges every line one slot.
      ...(docGridLinePitchPx
        ? { "--doc-grid-pitch": `${docGridLinePitchPx}px` }
        : {}),
      // Word's Default tab stops (settings.xml w:defaultTabStop): a tab with
      // no custom stop ahead advances to the next multiple of this interval.
      ...(wordSettings?.defaultTabStopTwips !== undefined
        ? {
            "--doc-default-tab-size": `${Math.round(wordSettings.defaultTabStopTwips / 15)}px`,
          }
        : {}),
      // Word header-distance: a letterhead taller than the top margin
      // pushes the body down via extra sheet padding (rebalance-aware).
      ...Object.fromEntries(
        Object.entries(bandExtraTopBySheet).map(([sheet, px]) => [`--sheet-band-extra-top-${sheet}`, `${px}px`]),
      ),
      ...(bandExtraTop
        ? { "--sheet-band-extra-top": `${bandExtraTop}px` }
        : {}),
      // Word footer-distance: a footer taller than the bottom margin lifts
      // the body's end on that page.
      ...Object.fromEntries(
        Object.entries(bandExtraBottomBySheet).map(([sheet, px]) => [`--sheet-band-extra-bottom-${sheet}`, `${px}px`]),
      ),
      ...(Object.keys(bandExtraBottomBySheet).length
        ? { "--sheet-band-extra-bottom": `${Math.max(...Object.values(bandExtraBottomBySheet))}px` }
        : {}),
      // A handwriting document's paper on every sheet, in the page's own
      // size, so a page added later wears it too (note-editor.css).
      ...((() => {
        if (!handwriting) return {};
        const page = resolvePageDimensionsPx(pageSize, customPageSize, pageOrientation);
        const mm = (px: number) => (px * 25.4) / 96;
        const url = handwritingPaperDataUrl(
          handwriting.paper,
          handwriting.paperColor,
          mm(page.width),
          mm(page.height),
        );
        return { "--handwriting-paper-image": `url("${url}")` };
      })()),
    } as unknown as CSSProperties;
  }, [
    handwriting,
    pageSize,
    pageMargins,
    customPageSize,
    customPageMargins,
    pageOrientation,
    headerText,
    footerText,
    bandExtraTop,
    // Each sheet's own push (a later sheet's header can be measured after the
    // first one: hdrlist-word.docx sheets 2-3 drew their body over the header).
    bandExtraTopBySheet,
    bandExtraBottomBySheet,
    docDefaultFontFamily,
    docDefaultFontSize,
    docDefaultTextColor,
    docDefaultLineHeight,
    docDefaultSpaceBefore,
    docDefaultSpaceAfter,
    docDefaultIndents,
    pageBorder,
    pageBackgroundColor,
    pageBackgroundFill,
    docGridLinePitchPx,
    docPageViewMode,
    documentLayoutViewMode,
    sectionLayouts,
    sectionLayoutsRaw,
    wordSettings,
  ]);

  
  // are page sheets, so doc-level multi-column flow lives INSIDE each
  // sheet's content box. The wrapper carries CSS custom properties (numeric
  // / whitelisted values only) that a per-sheet stylesheet rule consumes
  // (note-editor.css `.note-editor-content-sheet-columns`); per-SECTION
  // layouts paint their own per-sheet columns instead.
  const columnsStyle = useMemo(() => {
    if (sectionLayouts) return {} as CSSProperties;
    const css = documentColumnsCss(columns);
    if (!css.columnCount || css.columnCount <= 1) return {} as CSSProperties;
    return {
      "--sheet-column-count": String(css.columnCount),
      ...(css.columnGap ? { "--sheet-column-gap": css.columnGap } : {}),
    } as CSSProperties;
  }, [columns, sectionLayouts]);

  // The between-columns vertical rule (Word "Line between" 分栏分隔线) rides
  // the same per-sheet rule via a CSS var. Empty unless the rule is on AND
  // the document is genuinely multi-column.
  const columnSeparatorStyle = useMemo(() => {
    if (sectionLayouts) return {} as CSSProperties;
    const css = documentColumnSeparatorCss(columns, columnSeparator);
    return (
      css.columnRule ? { "--sheet-column-rule": css.columnRule } : {}
    ) as CSSProperties;
  }, [columns, columnSeparator, sectionLayouts]);

  // Vertical text (竖排) — BEST-EFFORT inside sheets (the toggle is disabled
  // pending a real paged implementation; existing docs keep their attr and
  // render vertical-rl per sheet via the `note-editor-content-vertical`
  // class rule — never on the wrapper, which would rotate the sheet stack).
  const verticalText = isVerticalWritingMode(writingMode);

  // Manuscript grid (稿纸) — BEST-EFFORT inside sheets: the whitelisted
  // repeating-gradient is passed per sheet via CSS vars consumed by the
  // `note-editor-content-manuscript` per-sheet rule.
  const manuscriptGridOn = isManuscriptGridEnabled(manuscriptGrid);
  const manuscriptGridStyle = useMemo(() => {
    const css = manuscriptGridCss(manuscriptGrid);
    return {
      ...(css.backgroundImage
        ? { "--sheet-manuscript-background": css.backgroundImage }
        : {}),
      ...(css.backgroundSize
        ? { "--sheet-manuscript-background-size": css.backgroundSize }
        : {}),
    } as CSSProperties;
  }, [manuscriptGrid]);

  // In-editor notice for layouts the sheet surface renders only best-effort
  // (竖排 / 稿纸方格): the doc attrs are preserved (no data loss) but the
  // paged rendering does not reproduce them faithfully yet.
  const bestEffortSheetLayout =
    verticalText || manuscriptGridNeedsDetachedPreview(manuscriptGrid);

  // Watermark layer inline style: only a whitelisted #rrggbb color, a clamped
  // numeric opacity, and a fixed rotation transform (see watermarkCss). The
  // layer's position/size/pointer-events live in the stylesheet, so this can
  // never carry injected CSS. `null` watermark = no layer (memo returns null).
  const watermarkStyle = useMemo(
    () => (watermark ? (watermarkCss(watermark) as CSSProperties) : null),
    [watermark],
  );
  return {
    bandEditLabels,
    bandEditScope,
    bandEditing,
    bandEditingSheetRule,
    bandOwnsPageNumber,
    bandStoryLinkedToPrevious,
    bestEffortSheetLayout,
    changeHeaderFooterEditing,
    columnSeparatorStyle,
    columnsStyle,
    commitBandRich,
    commitBandText,
    designCharacterStyleRule,
    docGridInTables,
    docGridLinePitchPx,
    drawingSelected,
    editorPopupOpen,
    effectiveCharacterSpacingControl,
    forwardStoryDocumentAttrs,
    getBandCommitRefusal,
    getBandEditMode,
    getBandRich,
    getBandText,
    headerFooterContext,
    headerFooterDocumentTextVisible,
    isRichBandVariant,
    manuscriptGridOn,
    manuscriptGridStyle,
    navigateBandEditor,
    openBandEditorOnPage,
    pageSurfaceStyle,
    plainFooterTokens,
    plainHeaderTokens,
    richBands,
    sectionBandFlags,
    sectionBands,
    sectionStoryGraph,
    setEditorPopupOpen,
    sheetBandBoxStyle,
    sheetBandBoxes,
    sheetBandContext,
    sheetBandOverlay,
    sheetFootnoteHooksRef,
    sheetFootnoteZones,
    sheetNoteContinuationPages,
    sheetPageNumbering,
    sheetParityPageStarts,
    showCropMarks,
    toggleHeaderFooterDocumentText,
    verticalText,
    watermarkStyle,
  };
}

export type UseDocumentPagedSurfaceResult = ReturnType<typeof useDocumentPagedSurface>;
