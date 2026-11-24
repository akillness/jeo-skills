"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The PDF a LaTeX compile produced. On a canvas it opens in its own window
 * (windows/CompiledPdfWindow); a Code window with no canvas around it shows
 * it here, in its output.
 *
 * Pages are drawn with pdf.js onto canvases (the same read-only page the PDF
 * editor's comparison uses), fitted to the column's width and drawn only as
 * they scroll near view. The bytes stay in memory; nothing is uploaded,
 * framed or persisted, and Download saves them as they arrived.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

import { Download } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import type { LanguageExecutionArtifact } from "../../../../lib/code-runner/execution-artifact";
import {
  PDF_COMPARE_MAX_PAGES,
  destroyPdfCompareResources,
} from "@mrnote/pdf/web/lib/pdf/compare-view.ts";
import {
  PDF_JS_DOCUMENT_ASSETS,
  loadCompatiblePdfJs,
} from "@mrnote/core/web/lib/pdf/pdfjs-runtime.ts";
import {
  PdfReadOnlyPage,
  readPdfReadOnlyPageDescriptors,
  type PdfPageHighlight,
  type PdfPagePoint,
  type PdfReadOnlyPageDescriptor,
} from "@mrnote/pdf/web/components/notebook/contents/pdf/PdfReadOnlyPage.tsx";
import { CODE_OUTPUT_CHROME_CLASS, outputStyles } from "./codeOutputChrome";

/** Pages beyond this are left to the downloaded file. */
const MAX_PREVIEW_PAGES = PDF_COMPARE_MAX_PAGES;

export type CompiledPdfPagesState =
  | { readonly phase: "loading" }
  | {
      readonly phase: "ready";
      readonly pages: readonly PdfReadOnlyPageDescriptor[];
      readonly total: number;
    }
  | { readonly phase: "error" };

interface LoadedPdfResources {
  readonly loadingTask: PDFDocumentLoadingTask | null;
  readonly document: PDFDocumentProxy | null;
}

/**
 * Load `artifact` with pdf.js and read the geometry of its first pages.
 * Returns the load state and the handler a page reports a failed draw to.
 *
 * A recompile's document loads behind the one on screen, as Overleaf's
 * preview swaps its PDF: the pages shown stay (their document kept open, so
 * they still draw as they scroll into view) until the new pages are ready.
 */
export function useCompiledPdfPages(artifact: LanguageExecutionArtifact): {
  readonly state: CompiledPdfPagesState;
  readonly onRenderError: (sessionGeneration: number) => void;
} {
  const generationRef = useRef(0);
  const [state, setState] = useState<CompiledPdfPagesState>({
    phase: "loading",
  });
  // Documents replaced while their pages may still be on screen.
  const retiringRef = useRef<LoadedPdfResources[]>([]);
  const unmountedRef = useRef(false);
  const releaseRetiring = useCallback(() => {
    const retiring = retiringRef.current;
    retiringRef.current = [];
    for (const resources of retiring) void destroyPdfCompareResources(resources);
  }, []);
  // Declared before the loader, so on unmount it runs first and the loader's
  // own cleanup then closes its document at once.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      releaseRetiring();
    };
  }, [releaseRetiring]);

  useEffect(() => {
    const generation = ++generationRef.current;
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let documentProxy: PDFDocumentProxy | null = null;
    setState((current) => (current.phase === "ready" ? current : { phase: "loading" }));
    void (async () => {
      try {
        const pdfjs = await loadCompatiblePdfJs();
        if (disposed) return;
        // pdf.js transfers the buffer it is given to its worker. A copy keeps
        // the received bytes whole for Download and for the next render.
        loadingTask = pdfjs.getDocument({
          data: artifact.bytes.slice(),
          ...PDF_JS_DOCUMENT_ASSETS,
        });
        documentProxy = await loadingTask.promise;
        if (disposed) return;
        const total = documentProxy.numPages;
        if (total < 1) throw new Error("The PDF has no pages.");
        const pages = await readPdfReadOnlyPageDescriptors(
          documentProxy,
          generation,
          () => disposed,
          Math.min(total, MAX_PREVIEW_PAGES),
        );
        if (!pages || disposed) return;
        setState({ phase: "ready", pages, total });
        releaseRetiring();
      } catch {
        if (disposed) return;
        setState({ phase: "error" });
        releaseRetiring();
      }
    })();
    return () => {
      disposed = true;
      const resources = { loadingTask, document: documentProxy };
      if (unmountedRef.current) void destroyPdfCompareResources(resources);
      else retiringRef.current.push(resources);
    };
  }, [artifact, releaseRetiring]);

  const onRenderError = useCallback((sessionGeneration: number) => {
    if (sessionGeneration !== generationRef.current) return;
    setState({ phase: "error" });
  }, []);
  return { state, onRenderError };
}

export function CodeCompiledPdfPreview({
  artifact,
  root,
  onDownload,
  label,
  highlight = null,
  onPointDoubleClick,
}: {
  artifact: LanguageExecutionArtifact;
  /** The output's scroll container, which decides when a page is drawn. */
  root: RefObject<HTMLElement | null>;
  onDownload: () => void;
  /** The region's name when the PDF is not a compile's (a workspace file). */
  label?: string;
  /** Where a source line is typeset (SyncTeX), marked on its page. */
  highlight?: { readonly page: number; readonly marks: PdfPageHighlight } | null;
  /** A double click on a page (SyncTeX inverse search). */
  onPointDoubleClick?: (page: number, point: PdfPagePoint) => void;
}) {
  const t = useTranslations("console-notebooks");
  const columnRef = useRef<HTMLDivElement | null>(null);
  const { state, onRenderError: handleRenderError } =
    useCompiledPdfPages(artifact);
  const [columnWidth, setColumnWidth] = useState(0);

  useLayoutEffect(() => {
    const node = columnRef.current;
    if (!node) return;
    const measure = () => setColumnWidth(Math.max(120, node.clientWidth - 24));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pageCount = state.phase === "ready" ? state.total : null;
  return (
    <section
      aria-label={label ?? t("codeOutput.pdf.region")}
      data-testid="code-output-pdf"
      data-pdf-phase={state.phase}
      className={`${CODE_OUTPUT_CHROME_CLASS} ${outputStyles.pdf}`}
    >
      <div className={outputStyles.pdfHeader}>
        <span className={outputStyles.pdfName}>
          {artifact.name}
          {pageCount !== null
            ? ` · ${t("codeOutput.pdf.pageCount", { count: pageCount })}`
            : ""}
        </span>
        <button
          type="button"
          onClick={onDownload}
          data-testid="code-output-pdf-download"
          className={officeDialogParts.compactButton}
        >
          <Download size={13} aria-hidden="true" />
          {t("codeOutput.pdf.download")}
        </button>
      </div>
      <div
        ref={columnRef}
        className={`${officeDialogParts.well} ${outputStyles.pdfColumn}`}
      >
        {state.phase === "loading" ? (
          <EditorLoadingState
            kind="pdf"
            minimal
            label={t("codeOutput.pdf.loading")}
          />
        ) : state.phase === "error" ? (
          <div
            role="alert"
            data-testid="code-output-pdf-error"
            className={`${officeDialogParts.message} ${outputStyles.pdfStatus}`}
          >
            {t("codeOutput.pdf.failed")}
          </div>
        ) : (
          <div className={outputStyles.pdfPages}>
            {state.pages.map((descriptor) => (
              <PdfReadOnlyPage
                key={descriptor.pageNumber}
                descriptor={descriptor}
                onRenderError={handleRenderError}
                root={root}
                width={columnWidth}
                canvasTestId="code-output-pdf-page"
                releaseOffscreen
                keepDrawingUntilRedrawn
                pageLabel={t("codeOutput.pdf.page", {
                  page: descriptor.pageNumber,
                })}
                highlight={
                  highlight?.page === descriptor.pageNumber ? highlight.marks : null
                }
                onPointDoubleClick={
                  onPointDoubleClick
                    ? (point) => onPointDoubleClick(descriptor.pageNumber, point)
                    : undefined
                }
              />
            ))}
            {state.total > state.pages.length ? (
              <p role="note" className={officeDialogParts.message}>
                {t("codeOutput.pdf.truncated", {
                  shown: state.pages.length,
                  total: state.total,
                })}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
