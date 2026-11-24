"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import type { PdfHeldPageFrameLayout } from "../../../../../lib/pdf/held-page-frame";

/**
 * The paper of a page frame held for Save (lib/pdf/held-page-frame): behind
 * the page shown, across the whole held page. Where the held page reaches
 * past the page shown (a crop let out), what the file draws there is drawn
 * on it, from the same page at the reader's zoom. It takes no input: what is
 * on it is not the page's until Save writes it.
 */
export function HeldPageFrameBackdrop({
  layout,
  pdfDoc,
  pageNumber,
  rotation,
  scale,
  drawBeyond,
}: {
  layout: PdfHeldPageFrameLayout;
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number;
  rotation: number;
  scale: number;
  /** Draw the file's own content past the page shown (a crop let out); an
   * enlarged page has only paper there. */
  drawBeyond: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { left, top, width, height } = layout.region;
  const draws = drawBeyond && layout.extends && Boolean(pdfDoc);
  useEffect(() => {
    if (!draws || !pdfDoc) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const shown = page.getViewport({ scale, rotation });
        // The held page in user space: its corners read back from the page's px.
        const corners = [
          [left, top], [left + width, top], [left, top + height], [left + width, top + height],
        ].map(([x, y]) => shown.convertToPdfPoint(x, y));
        const xs = corners.map(([x]) => x), ys = corners.map(([, y]) => y);
        const viewBox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const Viewport = shown.constructor as new (options: {
          viewBox: number[]; userUnit?: number; scale: number; rotation: number;
          offsetX?: number; offsetY?: number; dontFlip?: boolean;
        }) => typeof shown;
        const viewport = new Viewport({
          viewBox,
          userUnit: (page as { userUnit?: number }).userUnit ?? 1,
          scale: scale * ratio,
          rotation: shown.rotation,
          offsetX: 0,
          offsetY: 0,
          dontFlip: false,
        });
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        task = page.render({ canvas, canvasContext: context, viewport });
        await task.promise;
      } catch {
        // Paper alone: the file's own drawing there shows once Save writes it.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [draws, height, left, pageNumber, pdfDoc, rotation, scale, top, width]);
  return (
    <div
      aria-hidden
      className="pdf-viewer__held-frame"
      data-testid="pdf-held-page-frame"
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        zIndex: -1,
        background: "#fff",
        pointerEvents: "none",
      }}
    >
      {draws ? (
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      ) : null}
    </div>
  );
}
