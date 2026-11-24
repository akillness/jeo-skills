/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The paged surface's structural print: the options a print copy is built
 * from (the live sheets, bands, footnote zones, links) and the page
 * renderer's `__MRAI_PAGE_PREVIEW_PRINT`. Shared by the editor (NoteEditor)
 * and the print surface; moved unchanged out of NoteEditor.tsx.
 */
"use client";

import { resolveInternalLinkTarget } from "../tocNavigationExtension";
import { tocRowHeadingPos } from "@mrnote/core/web/components/console/editor/extensions/TableOfContents.tsx";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type Editor } from "@tiptap/core";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { normalizeWordCompatibilityMode } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import { documentMissingFontSubstitutes } from "@mrnote/core/web/components/console/editor/native-document/documentDisplayFonts.ts";
import { footnoteTextStyleFromDocAttrs } from "@mrnote/core/web/components/console/editor/native-document/noteTextStyle.ts";
import { printStructuralSheets, type StructuralPrintOptions } from "./structuralPrint";
import type { PrintRevisionMarkup } from "./printRevisionMarkup";
import { documentEvenAndOddHeaders } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetPageSpans.ts";
import { isUsableEditor, type MaybeNoteEditor } from "./editorRuntime";
import type { DocumentSurfaceAttrState } from "./documentSurfaceAttrs";
import type { UseDocumentPagedSurfaceResult } from "./useDocumentPagedSurface";

/** How long a print copy waits for the pages to finish laying out. */
export const STRUCTURAL_PRINT_SOURCE_TIMEOUT_MS = 180_000;

/**
 * The document's in-document links and where each leads, on the live sheets:
 * an internal link (a heading, a bookmark) by the editor's own resolver, and a
 * TOC row by its TOC's own levels -- only when that TOC makes hyperlinks, as
 * Word's \h switch decides. Print makes each a link in the PDF.
 */
function documentPrintLinks(editor: Editor, root: HTMLElement): Array<{ link: HTMLElement; target: HTMLElement }> {
  const pairs: Array<{ link: HTMLElement; target: HTMLElement }> = [];
  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href^='#']"))) {
    if (anchor.closest(".note-editor-toc")) continue;
    const target = resolveInternalLinkTarget(root, anchor);
    if (target) pairs.push({ link: anchor, target });
  }
  const { view } = editor;
  for (const row of Array.from(root.querySelectorAll<HTMLElement>(".note-editor-toc__link[data-anchor-id]"))) {
    const tocDom = row.closest<HTMLElement>(".note-editor-toc");
    if (!tocDom) continue;
    let tocAttrs: Record<string, unknown> | null = null;
    try {
      const pos = view.posAtDOM(tocDom, 0);
      for (const at of [pos, pos - 1]) {
        const node = at >= 0 ? view.state.doc.nodeAt(at) : null;
        if (node?.type.name === "tableOfContents") {
          tocAttrs = node.attrs as Record<string, unknown>;
          break;
        }
      }
    } catch {
      continue;
    }
    if (!tocAttrs || tocAttrs.hyperlinks === false) continue;
    const headingPos = tocRowHeadingPos(view.state.doc, tocAttrs, row.getAttribute("data-anchor-id") ?? "");
    const target = headingPos === null ? null : view.nodeDOM(headingPos);
    if (target instanceof HTMLElement) pairs.push({ link: row, target });
  }
  return pairs;
}

export interface UseDocumentStructuralPrintOptionsInputs {
  editor: MaybeNoteEditor;
  handwritingCoverRef: RefObject<HTMLDivElement | null>;
  pageId: string;
  pageNumberFormat: DocumentSurfaceAttrState["pageNumberFormat"];
  pageNumberStart: DocumentSurfaceAttrState["pageNumberStart"];
  pageNumberStartSection: DocumentSurfaceAttrState["pageNumberStartSection"];
  richBands: UseDocumentPagedSurfaceResult["richBands"];
  sectionBands: UseDocumentPagedSurfaceResult["sectionBands"];
  sheetFootnoteZones: UseDocumentPagedSurfaceResult["sheetFootnoteZones"];
  sheetNoteContinuationPages: UseDocumentPagedSurfaceResult["sheetNoteContinuationPages"];
  /** The page fields each drawn sheet's header and footer show (the
   * sections' own Start at / format / chapter numbers): the copy prints the
   * same, not a plain count of its own. */
  sheetBandBoxes?: UseDocumentPagedSurfaceResult["sheetBandBoxes"];
  sheetBandContext?: UseDocumentPagedSurfaceResult["sheetBandContext"];
  showPageNumbers: DocumentSurfaceAttrState["showPageNumbers"];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  titleRef: RefObject<string>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}

/** The latest print options, read when a print starts (null: nothing to print yet). */
export function useDocumentStructuralPrintOptions({
  editor,
  handwritingCoverRef,
  pageId,
  pageNumberFormat,
  pageNumberStart,
  pageNumberStartSection,
  richBands,
  sectionBands,
  sheetFootnoteZones,
  sheetNoteContinuationPages,
  sheetBandBoxes,
  sheetBandContext,
  showPageNumbers,
  t,
  titleRef,
  wrapperRef,
}: UseDocumentStructuralPrintOptionsInputs): RefObject<() => StructuralPrintOptions | null> {
  const structuralPrintOptions = useMemo(() => {
    return (): StructuralPrintOptions | null => {
      const wrapper = wrapperRef.current;
      const surface = wrapper?.querySelector<HTMLElement>(
        '[data-testid="note-editor-page-surface"]',
      );
      const root = surface?.querySelector<HTMLElement>(".note-editor-content");
      if (!surface || !root) return null;
      const pageHeight = Number.parseFloat(
        getComputedStyle(surface).getPropertyValue("--page-height-px"),
      );
      const firstSheet = root.querySelector<HTMLElement>(
        ":scope > article[data-page-sheet]",
      );
      const pageWidth =
        Number.parseFloat(
          getComputedStyle(surface).getPropertyValue("--page-width-px"),
        ) ||
        firstSheet?.offsetWidth ||
        surface.offsetWidth;
      // Screen-only spread/zoom geometry must never leak into the print clone.
      // A detached shell keeps every document CSS variable while restoring one
      // physical paper width and an unscaled, single-page print flow.
      const printSurface = surface.cloneNode(false) as HTMLElement;
      printSurface.dataset.pageViewMode = "single";
      printSurface.style.flexBasis = `${pageWidth}px`;
      printSurface.style.maxWidth = `${pageWidth}px`;
      printSurface.style.minWidth = `${pageWidth}px`;
      printSurface.style.left = "";
      printSurface.style.transform = "none";
      printSurface.style.transformOrigin = "";
      // Nor the space a zoomed surface reserves for its scaled paper
      // (usePagedSurfaceZoomReserve): kept on the clone, the paper printed
      // shifted sideways by (zoom - 1) x width / 2 -- 15.84 px left for a
      // landscape page the page renderer fits at 97%, more at a reader's
      
      printSurface.style.marginLeft = "";
      printSurface.style.marginRight = "";
      printSurface.style.marginBottom = "";
      return {
        root,
        sourceIdentity: pageId,
        surface: printSurface,
        pageWidthPx: pageWidth,
        pageHeightPx: Number.isFinite(pageHeight) ? pageHeight : 1056,
        title: titleRef.current || undefined,
        richBands,
        sectionBands,
        sectionLayouts: isUsableEditor(editor) ? editor.state.doc.attrs.sectionLayouts : null,
        evenAndOddHeaders: documentEvenAndOddHeaders(isUsableEditor(editor) ? editor.state.doc.attrs : null),
        bandStyleDefinitions: isUsableEditor(editor)
          ? editor.state.doc.attrs.styleDefinitions
          : null,
        bandMissingFontSubstitutes: isUsableEditor(editor) ? documentMissingFontSubstitutes(editor.state) : null,
        bandWordCompatibilityMode: isUsableEditor(editor)
          ? normalizeWordCompatibilityMode(editor.state.doc.attrs.wordCompatibilityMode)
          : null,
        showPageNumbers,
        pageNumberFormat,
        pageNumberStart,
        pageNumberStartSection,
        sheetPageFields: sheetBandContext && sheetBandBoxes
          ? { sheets: sheetBandBoxes.length, at: (index: number, kind: "header" | "footer") => sheetBandContext(index, kind) }
          : null,
        // V3.4: per-sheet footnote zones print above the footer band.
        footnoteZones: sheetFootnoteZones.size > 0 ? sheetFootnoteZones : null,
        footnoteContinuationPages: sheetNoteContinuationPages,
        footnoteTextStyle: footnoteTextStyleFromDocAttrs(
          isUsableEditor(editor) ? editor.state.doc.attrs : null,
        ),
        printLinks: () => (isUsableEditor(editor) ? documentPrintLinks(editor as unknown as Editor, root) : []),
        firstSheetUnderlay:
          handwritingCoverRef.current?.querySelector<HTMLElement>("[data-handwriting-cover-face]") ?? null,
        readinessErrorMessage: t("toolbar.printReadinessFailed"),
        preparingMessage: t("toolbar.printPreparing"),
        onReadinessError: () =>
          toast({ title: t("toolbar.printReadinessFailed") }),
        onPrintWindowBlocked: () =>
          toast({ title: t("toolbar.printPopupBlocked"), variant: "destructive" }),
      };
    };
  }, [
    handwritingCoverRef,
    pageId,
    pageNumberFormat,
    pageNumberStart,
    pageNumberStartSection,
    richBands,
    sectionBands,
    sheetFootnoteZones,
    sheetNoteContinuationPages,
    sheetBandBoxes,
    sheetBandContext,
    showPageNumbers,
    t,
    titleRef,
    wrapperRef,
  ]);
  const latestStructuralPrintOptionsRef = useRef(structuralPrintOptions);
  useLayoutEffect(() => { latestStructuralPrintOptionsRef.current = structuralPrintOptions; }, [structuralPrintOptions]);
  return latestStructuralPrintOptionsRef;
}

/** One part of a longer document printed on its own (the page renderer's
 * parallel drawing): where its pages stand in the document. */
export interface StructuralPrintPart {
  pageOffset?: number;
  totalPages?: number;
}

function printPart(value: unknown): StructuralPrintPart {
  const part = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const count = (raw: unknown) =>
    typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
  const pageOffset = count(part.pageOffset);
  const totalPages = count(part.totalPages);
  return {
    ...(pageOffset !== undefined ? { pageOffset } : {}),
    ...(totalPages !== undefined && totalPages > 0 ? { totalPages } : {}),
  };
}

/** The page renderer's print: `__MRAI_PAGE_PREVIEW_PRINT` builds the copy and
 * delivers it ready; given a part (`{ pageOffset, totalPages }`), its pages
 * are numbered as they stand in the whole document. `revisionMarkup`: the
 * review display a PDF showing markup prints (the page shows it already,
 * usePrintRevisionMarkupDisplay), null for the final copy. */
export function useExposedStructuralPrint(
  exposeStructuralPrint: boolean,
  latestStructuralPrintOptionsRef: RefObject<() => StructuralPrintOptions | null>,
  revisionMarkup: PrintRevisionMarkup = null,
): void {
  useEffect(() => {
    if (!exposeStructuralPrint || typeof window === "undefined") return;
    const host = window as Window & { __MRAI_PAGE_PREVIEW_PRINT?: (part?: unknown) => boolean };
    host.__MRAI_PAGE_PREVIEW_PRINT = (requestedPart?: unknown) => {
      const options = latestStructuralPrintOptionsRef.current();
      if (!options) return false;
      const part = printPart(requestedPart);
      void printStructuralSheets({
        ...options,
        ...part,
        revisionMarkup,
        // The renderer's log names what stopped the copy (the PDF export
        // falls back to its own drawing, and says why).
        onReadinessError: (error) => console.warn("[page-preview-print] failed", error.code, error.message, String((error.detail as { target?: { src?: string } } | undefined)?.target?.src ?? error.detail ?? "").slice(0, 300)),
        deliver: "ready",
        // The renderer has minutes: a long document's background layout
        // finishes before its copy is made.
        sourceTimeoutMs: STRUCTURAL_PRINT_SOURCE_TIMEOUT_MS,
        assetTimeoutMs: 120_000,
        resolveAfterSourceReady: () => {
          const latest = latestStructuralPrintOptionsRef.current();
          return latest ? { ...latest, ...part, deliver: "ready" } : null;
        },
      });
      return true;
    };
    return () => {
      delete host.__MRAI_PAGE_PREVIEW_PRINT;
    };
  }, [exposeStructuralPrint, latestStructuralPrintOptionsRef, revisionMarkup]);
}

/**
 * A page printed to PDF with its markup shows the review display it prints
 * from the start, before its pages are laid out (the PDF's page count and
 * every {NUMPAGES} are the markup's). Session state only: no document attr.
 */
export function usePrintRevisionMarkupDisplay(
  editor: MaybeNoteEditor,
  revisionMarkup: PrintRevisionMarkup,
  hydrated: boolean,
): void {
  // Set once the stored document is in: hydration starts the editor state
  // afresh (clearHydrationUndoHistory), and the review display, plugin state,
  // with it. The editor object is the same before and after its view mounts.
  const usable = isUsableEditor(editor);
  useLayoutEffect(() => {
    if (!revisionMarkup || !hydrated || !usable || !isUsableEditor(editor)) return;
    (editor as Editor).commands.setTrackedChangeMarkupFilter(revisionMarkup);
  }, [editor, usable, hydrated, revisionMarkup]);
}
