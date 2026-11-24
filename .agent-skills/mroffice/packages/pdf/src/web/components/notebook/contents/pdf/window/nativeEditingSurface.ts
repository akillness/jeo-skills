/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  PDFJS_ANNOTATION_MODE_ENABLE_STORAGE,
  pdfPasswordWidgetIds,
  syncPdfCommentVisibilityStorage,
  syncPdfPasswordWidgetStorage,
} from "../../../../../lib/pdf/form-appearance-storage";
import {
  PDF_JS_DOCUMENT_ASSETS,
  loadCompatiblePdfJs,
} from "@mrnote/core/web/lib/pdf/pdfjs-runtime.ts";
import { readPdfCandidateTextGeometry, type PdfCandidateTextGeometryRequest, measurePdfCandidateTextInk, rememberPdfCandidateTextInk } from "../../../../../lib/pdf/native-candidate-text-geometry";
import { sha256PdfBytes } from "../../../../../lib/pdf/engine/native/content-stream-transaction";
import { rememberPdfNativeTextSourceGeometry } from "../../../../../lib/pdf/source-text-appearance";
import { notePdfNativeTextPreview } from "../../../../../lib/pdf/text-edit/invariant";
import { rememberPdfNativeCandidateDrawing } from "../../../../../lib/pdf/native-text-source-handoff";
import type { PdfRibbonTranslator } from "../pdfRibbonTranslator";
import { createPdfPageWindowPreviewLoadingOwner } from "./previewLoading";

/** The editor's erased-line surface outlives the editor as the committed
 * bridge (the viewer retires it once the page paints a later document): a
 * text edit saved in the background closes its editor before the saved page
 * exists, and the source glyphs must not show under the drawn box meanwhile.
 * True when the surface also carries the box itself, as the reader saw it
 * (a moved block's lifted pixels): the window draws no box over it. */
export function retainPdfNativeTextEditingSurfaceAsBridge(pageHost: HTMLElement | null): boolean {
  if (!pageHost) return false;
  const surfaces = Array.from(pageHost.querySelectorAll<HTMLCanvasElement>(
    'canvas[data-pdf-native-text-editing-surface="true"]',
  )).filter(canvas => canvas.isConnected && canvas.width > 0 && canvas.style.visibility !== "hidden");
  const surface = surfaces.at(-1);
  if (!surface) return false;
  for (const previous of pageHost.querySelectorAll<HTMLCanvasElement>(
    'canvas[data-pdf-native-text-committed-preview="true"]',
  )) {
    if (previous === surface) continue;
    previous.remove();
    previous.width = 0;
    previous.height = 0;
  }
  surface.setAttribute("data-pdf-native-text-committed-preview", "true");
  surface.setAttribute("data-pdf-native-text-committed-at", String(performance.now()));
  // The bytes it was cut from: it stays while the page repaints those.
  const paintedSource = pageHost.dataset.pdfPaintedSource;
  if (paintedSource) surface.setAttribute("data-pdf-native-text-committed-source", paintedSource);
  return surface.hasAttribute("data-pdf-native-text-bridge-box");
}

export async function renderPdfNativeTextEditingSurface(
  candidateBytes: Uint8Array,
  pageHost: HTMLElement,
  pageNumber: number,
  hiddenTextBoxAnnotationId: string | null,
  signal: AbortSignal,
  t: PdfRibbonTranslator,
  previewWorker?: import("pdfjs-dist").PDFWorker,
  /** The edited box, read back from the candidate as the canvas is drawn:
   * its character geometry goes with the canvas (rememberPdfNativeTextSource
   * Geometry), so what the editor draws over the preview is placed by the
   * pixels of this very canvas. */
  textGeometry?: PdfCandidateTextGeometryRequest,
  /** These bytes already parsed (a staged revision about to go up): drawn from
   * that document, not parsed a second time. Its owner keeps it. */
  openedDocument?: import("pdfjs-dist").PDFDocumentProxy | null,
): Promise<HTMLCanvasElement> {
  const abort = () => new DOMException("Preview cancelled", "AbortError");
  let candidateCanvas: HTMLCanvasElement | null = null;
  try {
    if (signal.aborted) throw abort();
    const sourceCanvas = pageHost.querySelector<HTMLCanvasElement>(
      "canvas[data-pdf-page]",
    );
    if (
      !sourceCanvas ||
      sourceCanvas.width < 1 ||
      sourceCanvas.height < 1
    ) {
      throw new Error(
        t("pdf.pageWindow.sourcePdfPageNotFinished"),
      );
    }
    const rotation = Number(pageHost.dataset.pdfRenderRotation ?? "0");
    if (![0, 90, 180, 270].includes(rotation)) {
      throw new Error(
        t("pdf.pageWindow.currentPageRotationCannotPreviewed"),
      );
    }

    // The page the host draws, in the candidate's numbering: a saved file
    // holding the page's structure is shown read as the upload, and its page
    // elements name the file's page they draw (lib/pdf/structured-document).
    const declaredFilePage = Number(pageHost.dataset.filePageNumber);
    const filePageNumber = Number.isSafeInteger(declaredFilePage) && declaredFilePage >= 1
      ? declaredFilePage : pageNumber;
    const pdfjs = await loadCompatiblePdfJs();
    if (signal.aborted) throw abort();
    const previewOwner = openedDocument ? null : createPdfPageWindowPreviewLoadingOwner(
      pdfjs.getDocument({
        data: Uint8Array.from(candidateBytes),
        ...(previewWorker ? { worker: previewWorker } : {}),
        ...PDF_JS_DOCUMENT_ASSETS,
      }),
      signal,
      abort,
    );
    try {
      const documentProxy = openedDocument ?? await previewOwner!.acquire();
      // The preview has its own storage. Hide only this exact managed
      // FreeText appearance, while the native plan blanks the old glyphs.
      // Otherwise re-entering a promoted box paints old AP + new draft.
      if (hiddenTextBoxAnnotationId) {
        documentProxy.annotationStorage.setValue(hiddenTextBoxAnnotationId, {
          noView: true,
        });
      }
      const page = await documentProxy.getPage(filePageNumber);
      // Hidden comments are noView entries too, exactly as the viewer's own
      // page paints them (lib/pdf/form-appearance-storage.ts): the form
      // widgets, which only the page paints now, stay visible in the preview
      // while the markup is hidden.
      // A password field is never painted from its appearance, which can
      // hold the value (PDF 0006): its control draws it, masked.
      let previewAnnotations: unknown[] = [];
      try {
        previewAnnotations = await page.getAnnotations();
      } catch {
        previewAnnotations = [];
      }
      if (signal.aborted) throw abort();
      syncPdfPasswordWidgetStorage(
        documentProxy.annotationStorage,
        pdfPasswordWidgetIds(previewAnnotations),
      );
      const commentsHidden = pageHost.closest<HTMLElement>(".pdf-viewer")?.dataset
        .pdfCommentsHidden === "true";
      if (commentsHidden) {
        syncPdfCommentVisibilityStorage(
          documentProxy.annotationStorage,
          previewAnnotations,
          true,
          new Set(),
        );
      }
      try {
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const renderScale = sourceCanvas.width / baseViewport.width;
        const viewport = page.getViewport({
          scale: renderScale,
          rotation,
        });
        if (
          !Number.isFinite(renderScale) ||
          renderScale <= 0 ||
          Math.abs(viewport.height - sourceCanvas.height) > 2
        ) {
          throw new Error(
            t("pdf.pageWindow.candidateSourcePageGeometriesDo"),
          );
        }
        candidateCanvas =
          sourceCanvas.ownerDocument.createElement("canvas");
      candidateCanvas.dataset.pdfSurfaceOrigin = "bytes";
        candidateCanvas.width = sourceCanvas.width;
        candidateCanvas.height = sourceCanvas.height;
        candidateCanvas.style.filter = sourceCanvas.style.filter;
        candidateCanvas.style.opacity = sourceCanvas.style.opacity;
        candidateCanvas.style.transform = sourceCanvas.style.transform;
        candidateCanvas.style.transformOrigin =
          sourceCanvas.style.transformOrigin;
        const context = candidateCanvas.getContext("2d");
        if (!context) {
          throw new Error(
            t("pdf.pageWindow.browserCouldNotCreatePdf"),
          );
        }
        const renderParams = {
          canvas: candidateCanvas,
          canvasContext: context,
          viewport,
          annotationMode: PDFJS_ANNOTATION_MODE_ENABLE_STORAGE,
        } as Parameters<typeof page.render>[0];
        // Read while the page draws: the canvas is not handed out without it.
        const candidateSha256 = textGeometry ? sha256PdfBytes(candidateBytes) : null;
        const geometry = textGeometry && candidateSha256
          ? candidateSha256.then((sha) => readPdfCandidateTextGeometry({
            page, candidateSha256: sha, request: textGeometry,
            ops: (pdfjs as unknown as { OPS: Record<string, number> }).OPS, signal,
          })).catch(() => null)
          : null;
        const renderTask = page.render(renderParams);
        const cancelRender = () => renderTask.cancel();
        signal.addEventListener("abort", cancelRender, { once: true });
        try {
          await renderTask.promise;
        } catch (error) {
          if (signal.aborted) throw abort();
          throw error;
        } finally {
          signal.removeEventListener("abort", cancelRender);
        }
        if (signal.aborted) throw abort();
        const read = geometry ? await geometry : null;
        if (signal.aborted) throw abort();
        if (read && textGeometry) rememberPdfNativeTextSourceGeometry(candidateCanvas, textGeometry.key, read);
        const ink = textGeometry ? await measurePdfCandidateTextInk({ page, request: textGeometry }) : null;
        if (signal.aborted) throw abort();
        if (ink) rememberPdfCandidateTextInk(candidateCanvas, ink);
        if (textGeometry && candidateSha256) notePdfNativeTextPreview(textGeometry.key, textGeometry.text, await candidateSha256);
        // How it was drawn: a later hand of these very bytes (their digest
        // proved) may put it up as the page instead of drawing it again.
        rememberPdfNativeCandidateDrawing(candidateCanvas, { rotation, filePageNumber, commentsHidden,
          hiddenAnnotation: Boolean(hiddenTextBoxAnnotationId) });
        return candidateCanvas;
      } finally {
        page.cleanup();
      }
    } finally {
      await previewOwner?.dispose();
    }
  } catch (error) {
    candidateCanvas?.remove();
    if (candidateCanvas) { candidateCanvas.width = 0; candidateCanvas.height = 0; }
    throw error;
  } finally {
    previewWorker?.destroy();
  }
}






export function copyPdfPagePaintedCanvas(host: HTMLElement): HTMLCanvasElement | null {
  const source = Array.from(host.querySelectorAll<HTMLCanvasElement>("canvas")).find(
    (canvas) =>
      canvas.isConnected && canvas.width > 0 && canvas.height > 0 &&
      !canvas.dataset.pdfNativeTextSourceHandoff && !canvas.dataset.pdfReadModePhoto &&
      !canvas.closest("[data-pdf-native-candidate], .pdf-native-text-editing-surface"),
  );
  if (!source) return null;
  const copy = host.ownerDocument.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext("2d");
  if (!context) return null;
  try {
    context.drawImage(source, 0, 0);
    for (const preview of host.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-pdf-native-text-committed-preview="true"]',
    )) {
      if (
        preview.isConnected && preview.style.visibility !== "hidden" &&
        preview.width === source.width && preview.height === source.height
      ) {
        context.drawImage(preview, 0, 0);
      }
    }
  } catch {
    return null;
  }
  return copy;
}
