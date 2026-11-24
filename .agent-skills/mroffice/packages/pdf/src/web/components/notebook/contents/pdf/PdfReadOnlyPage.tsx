"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A read-only PDF page drawn by pdf.js onto a canvas: fitted to its column,
 * drawn only once it comes near the visible part of its scroll container, and
 * cleared again when it unmounts. No text layer, no editing, no annotations.
 *
 * The PDF editor's side-by-side comparison and the Code window's compiled
 * LaTeX output both show a document this way, so the page and the loop that
 * reads page geometry out of a loaded document live here once. For the
 * compiled output a page can also mark places on it (where a source line is
 * typeset) and report the page point a double click lands on.
 */

import type { PdfReadOnlyDrawTurn } from "@/lib/pdf/preview-draw-turns";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import {
  PDFJS_ANNOTATION_MODE_ENABLE_STORAGE,
  maskPdfDocumentPasswordWidgets,
} from "../../../../lib/pdf/form-appearance-storage";
import { PAGE_LOCATE_FLASH_MS } from "@mrnote/core/web/lib/page-locate.ts";
import { isCompatMouseFromTouch } from "@mrnote/core/web/lib/pointer-capability.ts";

export interface PdfReadOnlyPageDescriptor {
  readonly page: PDFPageProxy;
  readonly pageNumber: number;
  /** The load this page belongs to, so a stale render error is ignored. */
  readonly sessionGeneration: number;
  readonly width: number;
  readonly height: number;
}

/** A point on a page in PDF points from its top left corner (SyncTeX's frame). */
export interface PdfPagePoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle on a page in PDF points from its top left corner. */
export interface PdfPageRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Places on a page to mark once; a new id marks them again. */
export interface PdfPageHighlight {
  readonly id: number;
  readonly rects: readonly PdfPageRect[];
}

/** The largest page edge, in PDF points, either surface will draw. */
const MAX_PAGE_EDGE = 20_000;






export function pdfReadOnlyPageScale(
  descriptor: Pick<PdfReadOnlyPageDescriptor, "width" | "height">,
  columnWidth: number,
): number {
  if (!(columnWidth > 0) || !(descriptor.width > 0)) return 1;
  return Math.min(2, Math.max(0.1, columnWidth / descriptor.width));
}

/**
 * The page point under (`cssX`, `cssY`), CSS pixels from the top left of the
 * page drawn `width` wide, through pdf.js's own viewport (so a rotated or
 * offset page maps too).
 */
export function pdfReadOnlyPagePoint(
  descriptor: Pick<PdfReadOnlyPageDescriptor, "page" | "width" | "height">,
  width: number,
  cssX: number,
  cssY: number,
): PdfPagePoint {
  const viewport = descriptor.page.getViewport({
    scale: pdfReadOnlyPageScale(descriptor, width),
  });
  const [userX, userY] = viewport.convertToPdfPoint(cssX, cssY) as [number, number];
  const [left, , , top] = descriptor.page.view;
  return { x: userX - left, y: top - userY };
}

function pageRectToCss(
  descriptor: Pick<PdfReadOnlyPageDescriptor, "page" | "width" | "height">,
  width: number,
  rect: PdfPageRect,
): { left: number; top: number; width: number; height: number } {
  const viewport = descriptor.page.getViewport({
    scale: pdfReadOnlyPageScale(descriptor, width),
  });
  const [viewLeft, , , viewTop] = descriptor.page.view;
  const [x1, y1] = viewport.convertToViewportPoint(
    viewLeft + rect.left,
    viewTop - rect.top,
  ) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(
    viewLeft + rect.right,
    viewTop - rect.bottom,
  ) as [number, number];
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/**
 * Read pages 1..`pageCount` of a loaded document with their unscaled size.
 * Resolves to null when `isDisposed` turns true part-way, and throws for a
 * page whose geometry is not a drawable size.
 */
export async function readPdfReadOnlyPageDescriptors(
  documentProxy: PDFDocumentProxy,
  sessionGeneration: number,
  isDisposed: () => boolean,
  pageCount: number = documentProxy.numPages,
): Promise<PdfReadOnlyPageDescriptor[] | null> {
  const pages: PdfReadOnlyPageDescriptor[] = [];
  // A password field is never painted from its appearance, which can hold
  // the value as plain text (user audit PDF 0006).
  await maskPdfDocumentPasswordWidgets(documentProxy);
  if (isDisposed()) return null;
  const last = Math.min(pageCount, documentProxy.numPages);
  for (let pageNumber = 1; pageNumber <= last; pageNumber += 1) {
    const page = await documentProxy.getPage(pageNumber);
    if (isDisposed()) return null;
    const viewport = page.getViewport({ scale: 1 });
    if (
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0 ||
      viewport.width > MAX_PAGE_EDGE ||
      viewport.height > MAX_PAGE_EDGE
    ) {
      throw new Error("Unsafe PDF page geometry");
    }
    pages.push({
      page,
      pageNumber,
      sessionGeneration,
      width: viewport.width,
      height: viewport.height,
    });
  }
  return pages;
}

export function PdfReadOnlyPage({
  descriptor,
  onRenderError,
  root,
  width,
  canvasTestId,
  pageLabel,
  releaseOffscreen = false,
  keepDrawingUntilRedrawn = false,
  highlight = null,
  onPointDoubleClick,
  appearance = "sheet",
  drawTurn,
}: {
  descriptor: PdfReadOnlyPageDescriptor;
  /**
   * "sheet": a plain sheet with its page number in the corner. "reader": the
   * PDF reader's paper (rounded, soft shadow, no corner number), for a view
   * whose status bar already says which page is in view.
   */
  appearance?: "sheet" | "reader";
  onRenderError: (sessionGeneration: number) => void;
  /** The scroll container whose viewport decides when the page is drawn. */
  root: RefObject<HTMLElement | null>;
  /** The column width the page is fitted to, in CSS pixels. */
  width: number;
  canvasTestId: string;
  /** Accessible name of the page; the bare page number when omitted. */
  pageLabel?: string;
  /**
   * Clear the canvas again once the page scrolls far out of view, so a long
   * document holds only the pages around the reader. Off by default: a page
   * is otherwise drawn once and kept.
   */
  releaseOffscreen?: boolean;
  /**
   * A new document or size for a page already drawn is drawn off screen and
   * swapped in when done, so a recompiled PDF replaces its pages without a
   * blank frame. The canvas is still cleared when the page leaves the view.
   */
  keepDrawingUntilRedrawn?: boolean;
  /**
   * Places to mark with the shared locate tint (a SyncTeX forward search);
   * the first is scrolled into view each time the id changes.
   */
  highlight?: PdfPageHighlight | null;
  /** A double click on the page, at its page point (SyncTeX inverse search). */
  onPointDoubleClick?: (point: PdfPagePoint) => void;
  /**
   * When the page may draw, for pages that take turns (a file's local
   * preview, LocalFilePreviewLayer): asked before each drawing, which starts
   * once `ready` says true and gives the turn back with `settle`. `yieldNow`
   * is called when the drawing should stop and ask again (the canvas keeps
   * its size; the next turn draws it).
   */
  drawTurn?: PdfReadOnlyDrawTurn;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const firstMarkRef = useRef<HTMLDivElement | null>(null);
  // The highlight being shown; it goes when the tint has faded.
  const [fadedHighlight, setFadedHighlight] = useState<number | null>(null);
  const shownHighlight =
    highlight && highlight.rects.length > 0 && highlight.id !== fadedHighlight
      ? highlight.id
      : null;
  useEffect(() => {
    if (shownHighlight === null) return;
    const timer = window.setTimeout(
      () => setFadedHighlight(shownHighlight),
      PAGE_LOCATE_FLASH_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shownHighlight]);

  useEffect(() => {
    const mark = firstMarkRef.current;
    const scroller = root.current;
    if (shownHighlight === null || !mark || !scroller) return;
    // Only the page's own scroll container moves (scrollIntoView would also
    // scroll the canvas the window sits on).
    const markBounds = mark.getBoundingClientRect();
    const scrollerBounds = scroller.getBoundingClientRect();
    const top =
      scroller.scrollTop +
      markBounds.top -
      scrollerBounds.top -
      Math.max(0, (scroller.clientHeight - markBounds.height) / 2);
    const outside =
      markBounds.left < scrollerBounds.left ||
      markBounds.right > scrollerBounds.left + scroller.clientWidth;
    const left = outside
      ? scroller.scrollLeft + markBounds.left - scrollerBounds.left - 16
      : scroller.scrollLeft;
    scroller.scrollTo?.({ top: Math.max(0, top), left: Math.max(0, left), behavior: "smooth" });
  }, [root, shownHighlight]);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  // Read by the draw's cleanup: whether the page is still in view once the
  // render that replaces the drawing has committed.
  const visibleRef = useRef(visible);
  useLayoutEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = releaseOffscreen
          ? entries[entries.length - 1]?.isIntersecting === true
          : entries.some((entry) => entry.isIntersecting);
        if (intersecting) {
          setVisible(true);
          if (!releaseOffscreen) observer.disconnect();
        } else if (releaseOffscreen) {
          // The render effect's cleanup clears the canvas; the paper frame
          // keeps its size, so the scroll position does not move.
          setVisible(false);
        }
      },
      { root: root.current, rootMargin: "800px 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [releaseOffscreen, root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas || !(width > 0)) return;
    const cssScale = pdfReadOnlyPageScale(descriptor, width);
    const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const cssViewport = descriptor.page.getViewport({ scale: cssScale });
    const renderViewport = descriptor.page.getViewport({
      scale: cssScale * pixelRatio,
    });
    // The drawing on screen stays until this one is done (the old bitmap
    // scaled to the new size meanwhile).
    const behind = keepDrawingUntilRedrawn && canvas.width > 0 && canvas.height > 0;
    const target = behind ? document.createElement("canvas") : canvas;
    const context = target.getContext("2d");
    if (!context) return;

    target.width = Math.max(1, Math.ceil(renderViewport.width));
    target.height = Math.max(1, Math.ceil(renderViewport.height));
    canvas.style.width = `${cssViewport.width}px`;
    canvas.style.height = `${cssViewport.height}px`;
    let disposed = false;
    let task: RenderTask | null = null;
    let turn: ReturnType<PdfReadOnlyDrawTurn> | null = null;
    const draw = () => {
      let yielded = false;
      const attempt = drawTurn?.(descriptor.pageNumber, () => {
        // Asked to give the thread up: this drawing stops, and asks again.
        if (disposed || yielded) return;
        yielded = true;
        const stopped = task;
        task = null;
        try {
          stopped?.cancel();
        } catch {
          // A settled task: the next turn draws again regardless.
        }
        attempt?.settle();
        draw();
      }) ?? null;
      turn = attempt;
      const start = () => {
        if (disposed || yielded) return;
        const drawing = descriptor.page.render({
          canvas: target,
          canvasContext: context,
          viewport: renderViewport,
          // The document's own storage: password widgets flagged noView.
          annotationMode: PDFJS_ANNOTATION_MODE_ENABLE_STORAGE,
        });
        task = drawing;
        drawing.promise.then(
          () => {
            attempt?.settle(true);
            if (disposed || !behind) return;
            canvas.width = target.width;
            canvas.height = target.height;
            canvas.getContext("2d")?.drawImage(target, 0, 0);
            target.width = 0;
            target.height = 0;
          },
          () => {
            attempt?.settle();
            // Cleanup marks this render disposed BEFORE cancellation, so only a
            // real post-parse render failure reaches the owner. Close,
            // replacement, and unmount cannot revive an already-retired document.
            // A drawing stopped to yield its turn draws again (above).
            if (!disposed && !yielded) onRenderError(descriptor.sessionGeneration);
          },
        );
      };
      if (!attempt) {
        start();
        return;
      }
      void attempt.ready.then((go) => {
        if (go) start();
        else attempt.settle();
      });
    };
    draw();
    return () => {
      disposed = true;
      turn?.settle();
      try {
        task?.cancel();
      } catch {
        // Settled pdf.js tasks may reject cancellation; the canvas is still
        // terminally cleared below.
      }
      task = null;
      if (behind) {
        target.width = 0;
        target.height = 0;
      }
      // Still in view: the next drawing replaces this one when it is done.
      if (keepDrawingUntilRedrawn && visibleRef.current) return;
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [descriptor, drawTurn, keepDrawingUntilRedrawn, onRenderError, visible, width]);

  // The paper frame is the page at the one scale the canvas is drawn at, so
  // a small label gets no white margin it does not have and a large drawing
  
  const scale = pdfReadOnlyPageScale(descriptor, width);
  const placeholderWidth = Math.max(1, descriptor.width * scale);
  const placeholderHeight = Math.max(1, descriptor.height * scale);
  const reportPoint = (event: ReactMouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onPointDoubleClick?.(
      pdfReadOnlyPagePoint(
        descriptor,
        width,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      ),
    );
  };
  const marks =
    highlight && shownHighlight !== null
      ? highlight.rects.map((rect) => pageRectToCss(descriptor, width, rect))
      : [];
  return (
    <div
      ref={frameRef}
      // The PDF page keeps its ltr geometry under an rtl interface.
      dir="ltr"
      data-pdf-page={descriptor.pageNumber}
      onDoubleClick={
        onPointDoubleClick
          ? (event) => {
              // A finger's double tap is read from its clicks below.
              if (isCompatMouseFromTouch(event.nativeEvent)) return;
              event.preventDefault();
              reportPoint(event);
            }
          : undefined
      }
      onClick={
        onPointDoubleClick
          ? (event) => {
              // iPad Safari does not dependably turn two taps into dblclick.
              if (isDoubleTap(event.nativeEvent, event.currentTarget)) reportPoint(event);
            }
          : undefined
      }
      style={{
        position: "relative",
        width: placeholderWidth,
        height: placeholderHeight,
        flex: "none",
        background: "#fff",
        ...(appearance === "reader"
          ? {
              borderRadius: 6,
              overflow: "clip",
              boxShadow:
                "0 0 0 1px rgba(15, 23, 42, 0.05), 0 4px 18px rgba(15, 23, 42, 0.08)",
              scrollMarginTop: 12,
            }
          : { boxShadow: "0 1px 8px rgba(15, 23, 42, 0.16)" }),
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label={pageLabel ?? `${descriptor.pageNumber}`}
        data-testid={canvasTestId}
        style={{ display: "block" }}
      />
      {marks.map((mark, index) => (
        <div
          key={`${highlight?.id}:${index}`}
          ref={index === 0 ? firstMarkRef : undefined}
          aria-hidden
          data-located="true"
          data-testid="pdf-page-sync-mark"
          style={{
            position: "absolute",
            left: mark.left - 2,
            top: mark.top - 2,
            width: mark.width + 4,
            height: Math.max(mark.height, 4) + 4,
            borderRadius: 3,
            boxShadow:
              "0 0 0 1px color-mix(in srgb, var(--console-accent-strong, #0a7d72) 45%, transparent)",
            pointerEvents: "none",
          }}
        />
      ))}
      {appearance === "reader" ? null : (
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 6,
          bottom: 4,
          borderRadius: 4,
          background: "rgba(15, 23, 42, 0.64)",
          color: "#fff",
          fontSize: 10,
          lineHeight: 1,
          padding: "3px 5px",
        }}
      >
        {descriptor.pageNumber}
      </span>
      )}
    </div>
  );
}
