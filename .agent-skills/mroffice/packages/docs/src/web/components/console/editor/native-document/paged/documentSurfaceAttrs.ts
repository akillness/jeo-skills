/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The document attributes the page surface mirrors into React state: page
 * setup, columns and writing mode, header/footer bands, page numbering,
 * watermark, page colour and border, the pen's paper, the handwriting
 * document, and the document's base typography.
 *
 * One source for the editor (NoteEditor) and the print surface
 * (DocumentPrintSurface): both read the same attrs into the same state with
 * the same normalizers, so what prints is what the editor lays out.
 * Moved unchanged out of NoteEditor.tsx.
 */
"use client";

import { sameJsonValue } from "@mrnote/core/web/lib/same-json-value.ts";
import { documentDesignEquals, normalizeDocumentDesign, type DocumentDesign } from "@mrnote/core/web/lib/document-design.ts";
import { useEffect, useRef, useState } from "react";
import { isUsableEditor, type MaybeNoteEditor } from "./editorRuntime";
import { fontFamilyWithCjkRenderFallback, normalizeFontSize, normalizeTextColor, withThaiScriptFallback } from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import { documentDefaultParagraphSpacing, normalizeDefaultLineHeight, normalizeDoNotUseEastAsianBreakRules, normalizeDocumentCharacterSpacingControl, normalizeDocumentDefaultKinsoku, normalizeDocumentDefaultTextAlign, type DocumentCharacterSpacingControl, type DocumentDefaultTextAlign } from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";
import { normalizeFirstLineIndentPt, normalizeIndentPt } from "@mrnote/core/web/components/console/editor/native-document/preciseIndent.ts";
import { EMPTY_DOCUMENT_DEFAULT_INDENTS } from "@mrnote/core/web/components/console/editor/native-document/paragraphSetAsDefault.ts";
import { normalizeDocumentProtection, type DocumentProtection } from "@mrnote/core/web/components/console/editor/native-document/documentProtection.ts";
import { protectionHonorsEditableRanges } from "../rangePermissions";
import { normalizeHandwritingDocument, type HandwritingDocumentSetting } from "@mrnote/core/web/lib/handwriting-paper.ts";
import { normalizeCustomPageMargins, normalizeCustomPageSize, normalizeInkPaper, normalizePageBackgroundColor, normalizePageBackgroundFill, normalizePageBorder, resolvePageMargins, resolvePageOrientation, resolvePageSize, shouldSyncPageSetupFromDocumentAttrs, type CustomPageMarginsInches, type CustomPageSizeInches, type InkPaper, type PageBackgroundFill, type PageBorder, type PageMargins, type PageOrientation, type PageSize } from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import { resolveColumnSeparator, resolveColumns, resolveManuscriptGrid, resolveWritingMode, type ColumnCount, type ManuscriptGrid, type WritingMode } from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import { normalizeFirstPageConfig, normalizeHeaderFooterText, type FirstPageConfig } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { normalizePageNumberFormat, normalizePageNumberStart, normalizePageNumberStartSection, type PageNumberFormat } from "@mrnote/core/web/components/console/editor/native-document/pageNumberFormat.ts";
import { normalizePictureWatermark, normalizeWatermark, type PictureWatermarkConfig, type WatermarkConfig } from "@mrnote/core/web/components/console/editor/native-document/watermark.ts";

export function useDocumentSurfaceAttrState() {
  // Page setup (size + margins) lives on the top-level doc node's attrs. We
  // mirror the resolved values into local state so the on-screen "page" surface
  // repaints when the toolbar changes them, and after content hydration.
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    resolvePageSize(null),
  );
  const [pageMargins, setPageMargins] = useState<PageMargins>(() =>
    resolvePageMargins(null),
  );
  // The page orientation (portrait / landscape) also lives on the top-level doc
  // node's attrs. Landscape swaps the page width↔height; mirrored into local
  // state so the on-screen "page" surface repaints when the toolbar toggles it.
  const [pageOrientation, setPageOrientation] = useState<PageOrientation>(() =>
    resolvePageOrientation(null),
  );
  // Read-only protection (Word/WPS 限制编辑) also lives on the doc node's attrs.
  // Mirrored into state so the setEditable effect + the toolbar lock button react.
  const [documentProtection, setDocumentProtectionState] =
    useState<DocumentProtection | null>(null);
  // Word's editing exceptions (w:permStart/w:permEnd, rangePermissions.ts):
  // the document holds a region anyone may edit, which a "No changes" or
  // "Comments" restriction leaves editable.
  const [editableRangesInDocument, setEditableRangesInDocument] = useState(false);
  const rangeExceptionsEditable =
    editableRangesInDocument && protectionHonorsEditableRanges(documentProtection);
  // The optional CUSTOM size/margins (inches) also live on the doc node's attrs.
  // null = use the preset; a value (set via the toolbar's custom dialog or read
  // from an imported docx's <w:pgSz>/<w:pgMar>) drives the surface geometry.
  const [customPageSize, setCustomPageSizeState] =
    useState<CustomPageSizeInches | null>(null);
  const [customPageMargins, setCustomPageMarginsState] =
    useState<CustomPageMarginsInches | null>(null);
  // The multi-column count also lives on the top-level doc node's attrs. We
  // mirror the resolved value into local state so the editing surface repaints
  // its CSS multi-column flow when the toolbar changes it, and after hydration.
  const [columns, setColumns] = useState<ColumnCount>(() =>
    resolveColumns(null),
  );
  // The between-columns vertical rule (Word "Line between" 分栏分隔线) also lives
  // on the top-level doc node's attrs. We mirror it into local state so the
  // editing surface paints (or clears) its CSS `column-rule` when the toolbar
  // toggles it, and after content hydration.
  const [columnSeparator, setColumnSeparator] = useState<boolean>(() =>
    resolveColumnSeparator(null),
  );
  // The document-wide writing mode (horizontal-tb / vertical-rl 竖排) also lives
  // on the top-level doc node's attrs. We mirror it into local state so the
  // editing surface flips to `writing-mode: vertical-rl` when the toolbar
  // toggles it, and repaints after content hydration.
  const [writingMode, setWritingMode] = useState<WritingMode>(() =>
    resolveWritingMode(null),
  );
  // The document-wide manuscript grid (稿纸 / squared paper) also lives on the
  // top-level doc node's attrs. We mirror it into local state so the editing
  // surface paints (or clears) its repeating character-cell background when the
  // toolbar toggles it, and repaints after content hydration.
  const [manuscriptGrid, setManuscriptGrid] = useState<ManuscriptGrid>(() =>
    resolveManuscriptGrid(null),
  );
  // Document-level header/footer text also lives on the doc node's attrs. We
  // mirror the sanitized values into local state so the on-screen bands repaint
  // when the toolbar changes them and after content hydration. `null` = unset
  // (no band rendered).
  const [headerText, setHeaderText] = useState<string | null>(null);
  const [footerText, setFooterText] = useState<string | null>(null);
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  // RICH letterhead bands (pictures / mini tables) mirrored RAW off the doc
  // attrs with reference-stable updates (the attr values are immutable across
  // transactions unless actually changed, so identity compares keep every
  // keystroke from re-rendering the subtree). Normalization happens in the
  // richBands memo below.
  const [richBandRaw, setRichBandRaw] = useState<{
    header: unknown;
    footer: unknown;
    firstHeader: unknown;
    firstFooter: unknown;
    evenHeader: unknown;
    evenFooter: unknown;
  }>({
    header: null,
    footer: null,
    firstHeader: null,
    firstFooter: null,
    evenHeader: null,
    evenFooter: null,
  });
  const [differentOddEvenFlag, setDifferentOddEvenFlag] = useState(false);
  const [evenPageFooterText, setEvenPageFooterText] = useState<string | null>(
    null,
  );
  const [sectionBandsRaw, setSectionBandsRaw] = useState<unknown>(null);
  const [sectionLayoutsRaw, setSectionLayoutsRaw] = useState<unknown>(null);
  // Word settings.xml page/tab settings (mirror margins, default tab stops).
  const [wordSettingsRaw, setWordSettingsRaw] = useState<unknown>(null);
  const [sectionStoryGraphRaw, setSectionStoryGraphRaw] =
    useState<unknown>(null);
  // Word's styles: a header/footer run that states no size takes its style's.
  const [styleDefinitionsRaw, setStyleDefinitionsRaw] = useState<unknown>(null);
  const [wordCompatibilityModeRaw, setWordCompatibilityModeRaw] = useState<unknown>(null);
  // Page-number NUMBERING STYLE + "Start at N" (Word "Format Page Numbers").
  // Mirrored from the doc node attrs so the page-view preview renders the page
  // numbers in the chosen format (i/ii/iii, A/B/C) starting at the chosen value.
  // null = the editor defaults (decimal, start at 1).
  const [pageNumberFormat, setPageNumberFormat] =
    useState<PageNumberFormat | null>(null);
  const [pageNumberStart, setPageNumberStart] = useState<number | null>(null);
  const [pageNumberStartSection, setPageNumberStartSection] = useState<
    number | null
  >(null);
  // Different-first-page header/footer (Word w:titlePg). When on, page 1 shows
  // the first-page bands and the page preview's first card differs; the live
  // (unpaginated) flow editor shows a small indicator on the normal band.
  const [firstPageConfig, setFirstPageConfig] = useState<FirstPageConfig>({
    differentFirstPage: false,
    firstPageHeader: null,
    firstPageFooter: null,
  });
  // Document-level text watermark also lives on the doc node's attrs. We mirror
  // the normalized config into local state so the behind-content stamp layer
  // repaints when the toolbar changes it and after content hydration. `null` =
  // no watermark (no layer rendered).
  const [watermark, setWatermark] = useState<WatermarkConfig | null>(null);
  // Word's picture watermark shares the `watermark` attr (kind: "picture").
  const [pictureWatermark, setPictureWatermark] =
    useState<PictureWatermarkConfig | null>(null);
  // Document-level page border (Word 页面边框) also lives on the doc node's
  // attrs. Mirror the normalized config into local state so the on-screen page
  // surface paints the box when the toolbar changes it / after hydration. `null`
  // = no border (the surface carries no extra `border`).
  const [pageBorder, setPageBorder] = useState<PageBorder | null>(null);
  // Document-level page background color (Word/WPS 页面颜色) also lives on the
  // doc node's attrs. Mirror the normalized hex into local state so the on-screen
  // page surface repaints its fill when the toolbar changes it / after hydration.
  // `null` = no fill (the surface carries no extra `backgroundColor`).
  const [pageBackgroundColor, setPageBackgroundColor] = useState<string | null>(
    null,
  );
  // The page's Fill Effects gradient (Word 页面颜色 > 填充效果), painted over
  // the page colour.
  const [pageBackgroundFill, setPageBackgroundFill] = useState<PageBackgroundFill | null>(null);
  // The pen's paper (Draw ▸ Background), drawn on the pages, never printed.
  const [inkPaper, setInkPaper] = useState<InkPaper | null>(null);
  // A handwriting document (手写文档): its cover is the first page and its
  // paper is drawn on every page, on screen and in print (lib/handwriting-paper).
  const [handwriting, setHandwriting] = useState<HandwritingDocumentSetting | null>(null);
  const handwritingCoverRef = useRef<HTMLDivElement | null>(null);
  const isHandwriting = handwriting !== null;
  // Document-wide base typography (imported DOCX Normal-style font). Painted
  // on the page surface so unmarked runs inherit the document's own base font.
  const [docDefaultFontFamily, setDocDefaultFontFamily] = useState<
    string | null
  >(null);
  const [docDefaultFontSize, setDocDefaultFontSize] = useState<string | null>(
    null,
  );
  const [docDefaultTextColor, setDocDefaultTextColor] = useState<string | null>(
    null,
  );
  // The Design tab's choices (lib/document-design.ts): the Quick character
  // styles are drawn from them by a rule scoped to this surface.
  const [docDesign, setDocDesign] = useState<DocumentDesign | null>(null);
  const [docDefaultLineHeight, setDocDefaultLineHeight] = useState<
    string | null
  >(null);
  const [docDefaultTextAlign, setDocDefaultTextAlign] =
    useState<DocumentDefaultTextAlign | null>(null);
  const [docCharacterSpacingControl, setDocCharacterSpacingControl] =
    useState<DocumentCharacterSpacingControl | null>(null);
  const [docDoNotUseEastAsianBreakRules, setDocDoNotUseEastAsianBreakRules] =
    useState<boolean | null>(null);
  const [docDefaultKinsoku, setDocDefaultKinsoku] = useState<boolean | null>(
    null,
  );
  const [docStrictKinsoku, setDocStrictKinsoku] = useState(false);
  const [docDefaultSpaceBefore, setDocDefaultSpaceBefore] = useState<
    number | null
  >(null);
  const [docDefaultSpaceAfter, setDocDefaultSpaceAfter] = useState<
    number | null
  >(null);
  // Normal's indents in points (Paragraph > Set As Default), drawn on every
  // paragraph that states none of its own.
  const [docDefaultIndents, setDocDefaultIndents] = useState<{
    left: number | null;
    right: number | null;
    firstLine: number | null;
  }>(EMPTY_DOCUMENT_DEFAULT_INDENTS);
  // Persist across effect teardown/re-subscription: on large paged documents
  // a host re-render can recreate the transaction listener while the editor
  // still points at the exact same immutable doc attrs object. A local cache
  // would reset and fan a decoration-only pagination transaction back out to
  // every page-setup state setter, forming a React render feedback loop.
  const lastSyncedPageSetupAttrsRef = useRef<Readonly<
    Record<string, unknown>
  > | null>(null);
  return {
    pageSize,
    setPageSize,
    pageMargins,
    setPageMargins,
    pageOrientation,
    setPageOrientation,
    documentProtection,
    setDocumentProtectionState,
    editableRangesInDocument,
    setEditableRangesInDocument,
    customPageSize,
    setCustomPageSizeState,
    customPageMargins,
    setCustomPageMarginsState,
    columns,
    setColumns,
    columnSeparator,
    setColumnSeparator,
    writingMode,
    setWritingMode,
    manuscriptGrid,
    setManuscriptGrid,
    headerText,
    setHeaderText,
    footerText,
    setFooterText,
    showPageNumbers,
    setShowPageNumbers,
    richBandRaw,
    setRichBandRaw,
    differentOddEvenFlag,
    setDifferentOddEvenFlag,
    evenPageFooterText,
    setEvenPageFooterText,
    sectionBandsRaw,
    setSectionBandsRaw,
    sectionLayoutsRaw,
    setSectionLayoutsRaw,
    wordSettingsRaw,
    setWordSettingsRaw,
    sectionStoryGraphRaw,
    setSectionStoryGraphRaw,
    styleDefinitionsRaw,
    setStyleDefinitionsRaw,
    wordCompatibilityModeRaw,
    setWordCompatibilityModeRaw,
    pageNumberFormat,
    setPageNumberFormat,
    pageNumberStart,
    setPageNumberStart,
    pageNumberStartSection,
    setPageNumberStartSection,
    firstPageConfig,
    setFirstPageConfig,
    watermark,
    setWatermark,
    pictureWatermark,
    setPictureWatermark,
    pageBorder,
    setPageBorder,
    pageBackgroundColor,
    setPageBackgroundColor,
    pageBackgroundFill,
    setPageBackgroundFill,
    inkPaper,
    setInkPaper,
    handwriting,
    setHandwriting,
    rangeExceptionsEditable,
    handwritingCoverRef,
    isHandwriting,
    docDefaultFontFamily,
    setDocDefaultFontFamily,
    docDefaultFontSize,
    setDocDefaultFontSize,
    docDefaultTextColor,
    setDocDefaultTextColor,
    docDesign,
    setDocDesign,
    docDefaultLineHeight,
    setDocDefaultLineHeight,
    docDefaultTextAlign,
    setDocDefaultTextAlign,
    docCharacterSpacingControl,
    setDocCharacterSpacingControl,
    docDoNotUseEastAsianBreakRules,
    setDocDoNotUseEastAsianBreakRules,
    docDefaultKinsoku,
    setDocDefaultKinsoku,
    docStrictKinsoku,
    setDocStrictKinsoku,
    docDefaultSpaceBefore,
    setDocDefaultSpaceBefore,
    docDefaultSpaceAfter,
    setDocDefaultSpaceAfter,
    docDefaultIndents,
    setDocDefaultIndents,
    lastSyncedPageSetupAttrsRef,
  };
}

export type DocumentSurfaceAttrState = ReturnType<typeof useDocumentSurfaceAttrState>;

/** Mirrors the editor's document attrs into ``state`` on every transaction. */
export function useDocumentSurfaceAttrSync(
  editor: MaybeNoteEditor,
  state: DocumentSurfaceAttrState,
): void {
  useEffect(() => {
    if (!isUsableEditor(editor)) return;
    const activeEditor = editor;
    const sync = () => {
      if (!isUsableEditor(activeEditor)) return;
      const attrs = (activeEditor.state?.doc?.attrs ?? {}) as Record<
        string,
        unknown
      >;
      if (
        !shouldSyncPageSetupFromDocumentAttrs(
          state.lastSyncedPageSetupAttrsRef.current,
          attrs,
        )
      ) {
        return;
      }
      // Set this before scheduling React updates so a pagination-plugin meta
      // transaction cannot re-enter the listener with the same document attrs.
      state.lastSyncedPageSetupAttrsRef.current = attrs;
      state.setPageSize(resolvePageSize(attrs.pageSize));
      state.setPageMargins(resolvePageMargins(attrs.pageMargins));
      state.setPageOrientation(resolvePageOrientation(attrs.pageOrientation));
      state.setDocumentProtectionState(
        normalizeDocumentProtection(attrs.documentProtection),
      );
      state.setCustomPageSizeState(normalizeCustomPageSize(attrs.customPageSize));
      state.setCustomPageMarginsState(
        normalizeCustomPageMargins(attrs.customPageMargins),
      );
      state.setColumns(resolveColumns(attrs.columns));
      state.setColumnSeparator(resolveColumnSeparator(attrs.columnSeparator));
      state.setWritingMode(resolveWritingMode(attrs.writingMode));
      state.setManuscriptGrid(resolveManuscriptGrid(attrs.manuscriptGrid));
      state.setHeaderText(normalizeHeaderFooterText(attrs.headerText));
      state.setFooterText(normalizeHeaderFooterText(attrs.footerText));
      state.setShowPageNumbers(attrs.showPageNumbers === true);
      state.setDifferentOddEvenFlag(attrs.differentOddEven === true);
      state.setEvenPageFooterText(normalizeHeaderFooterText(attrs.evenPageFooter));
      state.setSectionBandsRaw((prev: unknown) =>
        sameJsonValue(prev, attrs.sectionBands) ? prev : attrs.sectionBands,
      );
      state.setSectionLayoutsRaw((prev: unknown) =>
        sameJsonValue(prev, attrs.sectionLayouts) ? prev : attrs.sectionLayouts,
      );
      state.setWordSettingsRaw((prev: unknown) =>
        sameJsonValue(prev, attrs.wordSettings) ? prev : attrs.wordSettings,
      );
      state.setSectionStoryGraphRaw((prev: unknown) =>
        sameJsonValue(prev, attrs.sectionStoryGraph) ? prev : attrs.sectionStoryGraph,
      );
      state.setStyleDefinitionsRaw((prev: unknown) =>
        sameJsonValue(prev, attrs.styleDefinitions) ? prev : attrs.styleDefinitions,
      );
      state.setWordCompatibilityModeRaw((prev: unknown) =>
        sameJsonValue(prev, attrs.wordCompatibilityMode) ? prev : attrs.wordCompatibilityMode,
      );
      state.setRichBandRaw((prev) =>
        prev.header === attrs.headerRich &&
        prev.footer === attrs.footerRich &&
        prev.firstHeader === attrs.firstPageHeaderRich &&
        prev.firstFooter === attrs.firstPageFooterRich &&
        prev.evenHeader === attrs.evenPageHeaderRich &&
        prev.evenFooter === attrs.evenPageFooterRich
          ? prev
          : {
              header: attrs.headerRich,
              footer: attrs.footerRich,
              firstHeader: attrs.firstPageHeaderRich,
              firstFooter: attrs.firstPageFooterRich,
              evenHeader: attrs.evenPageHeaderRich,
              evenFooter: attrs.evenPageFooterRich,
            },
      );
      // Page-number format/start — funneled through the SAME whitelist/clamp the
      // doc attr uses, so a default-numbered document leaves both at null (decimal
      // / start-1) and the preview keeps its "Page X of Y" rendering.
      state.setPageNumberFormat(normalizePageNumberFormat(attrs.pageNumberFormat));
      state.setPageNumberStart(normalizePageNumberStart(attrs.pageNumberStart));
      state.setPageNumberStartSection(
        normalizePageNumberStartSection(attrs.pageNumberStartSection),
      );
      // `normalizeFirstPageConfig` returns a FRESH object every call (even for the
      // universal default {false,null,null}), so a plain setState would change the
      // state reference on EVERY editor transaction (every keystroke / caret move)
      // and force a full NoteEditor re-render. Bail out when shallow-equal so the
      // reference stays stable and React can skip the re-render (the sibling
      // normalizers return primitives/null and bail for free). Perf: removes a
      // guaranteed full-subtree reconcile per keystroke that scales with doc size.
      state.setFirstPageConfig((prev) => {
        const next = normalizeFirstPageConfig(attrs);
        return prev.differentFirstPage === next.differentFirstPage &&
          prev.firstPageHeader === next.firstPageHeader &&
          prev.firstPageFooter === next.firstPageFooter
          ? prev
          : next;
      });
      state.setWatermark(normalizeWatermark(attrs.watermark));
      state.setPictureWatermark((prev) => {
        const next = normalizePictureWatermark(attrs.watermark);
        return prev &&
          next &&
          prev.src === next.src &&
          prev.widthPt === next.widthPt &&
          prev.heightPt === next.heightPt &&
          prev.washout === next.washout
          ? prev
          : next;
      });
      state.setPageBorder(normalizePageBorder(attrs.pageBorder));
      state.setPageBackgroundColor(
        normalizePageBackgroundColor(attrs.pageBackgroundColor),
      );
      state.setPageBackgroundFill((prev) => {
        const next = normalizePageBackgroundFill(attrs.pageBackgroundFill);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      state.setInkPaper(normalizeInkPaper(attrs.inkPaper));
      state.setHandwriting((prev) => {
        const next = normalizeHandwritingDocument(attrs.handwritingDocument);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      // Display-only routing, the same the run marks get: an unmarked run
      // (a heading with no direct font) otherwise inherits a stack that ends
      // at a generic family, whose face the browser picks per document
      // language — and the resulting line box, not just the glyphs, differs.
      state.setDocDefaultFontFamily(
        // Thai in a run naming no complex-script font: Word's Thai face.
        withThaiScriptFallback(fontFamilyWithCjkRenderFallback(attrs.defaultFontFamily)),
      );
      state.setDocDefaultFontSize(normalizeFontSize(attrs.defaultFontSize));
      state.setDocDefaultTextColor(normalizeTextColor(attrs.defaultTextColor));
      const design = normalizeDocumentDesign(attrs.documentDesign);
      state.setDocDesign((prev) => (documentDesignEquals(prev, design) ? prev : design));
      state.setDocDefaultLineHeight(
        normalizeDefaultLineHeight(attrs.defaultLineHeight),
      );
      state.setDocDefaultTextAlign(
        normalizeDocumentDefaultTextAlign(attrs.defaultTextAlign),
      );
      state.setDocCharacterSpacingControl(
        normalizeDocumentCharacterSpacingControl(attrs.characterSpacingControl),
      );
      state.setDocDoNotUseEastAsianBreakRules(
        normalizeDoNotUseEastAsianBreakRules(attrs.doNotUseEastAsianBreakRules),
      );
      state.setDocDefaultKinsoku(
        normalizeDocumentDefaultKinsoku(attrs.defaultKinsoku),
      );
      state.setDocStrictKinsoku(attrs.wordStrictKinsoku === true);
      const paragraphSpacing = documentDefaultParagraphSpacing(attrs);
      state.setDocDefaultSpaceBefore(paragraphSpacing.before);
      state.setDocDefaultSpaceAfter(paragraphSpacing.after);
      const left = normalizeIndentPt(attrs.defaultIndentLeftPt);
      const right = normalizeIndentPt(attrs.defaultIndentRightPt);
      const firstLine = normalizeFirstLineIndentPt(attrs.defaultFirstLineIndentPt);
      state.setDocDefaultIndents((prev) =>
        prev.left === left && prev.right === right && prev.firstLine === firstLine
          ? prev
          : left === null && right === null && firstLine === null
            ? EMPTY_DOCUMENT_DEFAULT_INDENTS
            : { left, right, firstLine },
      );
    };
    const runtime = activeEditor as unknown as {
      off?: (event: string, callback: () => void) => unknown;
      on?: (event: string, callback: () => void) => unknown;
    };
    sync();
    if (typeof runtime.on !== "function" || typeof runtime.off !== "function") {
      return;
    }
    // `transaction` covers both setDocAttribute changes (toolbar) and
    // setContent on hydration (which restores persisted page setup).
    runtime.on("transaction", sync);
    return () => {
      runtime.off?.("transaction", sync);
    };
    // The setters are stable; the effect follows the editor alone, as it did
    // inside NoteEditor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
}
