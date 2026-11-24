"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef } from "react";
import { renderKatexInto } from "@mrnote/core/web/lib/katex-render.ts";
import "katex/dist/katex.min.css";

import {
  normalizePdfFormulaForRender,
  pdfFormulaCompactFitScale,
  PDF_FORMULA_KATEX_RENDER_OPTIONS,
} from "@mrnote/core/web/lib/pdf/formula-render.ts";

function fitCompactFormulaPreview(node: HTMLDivElement): void {
  const display = node.querySelector<HTMLElement>(".katex-display");
  const katexNode = node.querySelector<HTMLElement>(".katex");
  if (!display || !katexNode) return;

  display.style.margin = "0";
  display.style.width = "100%";
  display.style.height = "100%";
  display.style.display = "flex";
  display.style.alignItems = "center";
  display.style.justifyContent = "center";
  display.style.overflow = "visible";

  katexNode.style.transform = "";
  katexNode.style.transformOrigin = "center center";
  katexNode.style.maxWidth = "none";

  const availableWidth = Math.max(1, node.clientWidth - 2);
  const availableHeight = Math.max(1, node.clientHeight - 2);
  const rect = katexNode.getBoundingClientRect();
  const contentWidth = Math.max(katexNode.scrollWidth, rect.width);
  const contentHeight = Math.max(katexNode.scrollHeight, rect.height);
  if (contentWidth <= 0 || contentHeight <= 0) return;

  const fit = pdfFormulaCompactFitScale({
    availableWidth,
    availableHeight,
    contentWidth,
    contentHeight,
  });
  if (fit.overflows) {
    node.setAttribute("data-overflow", "true");
    display.style.overflow = "visible";
  } else {
    node.removeAttribute("data-overflow");
  }
  node.setAttribute("data-fit-scale", fit.scale.toFixed(3));
  node.setAttribute("data-fit-raw-scale", fit.rawScale.toFixed(3));
  katexNode.style.transform =
    fit.scale < 0.995 ? `scale(${fit.scale})` : "";
}

export interface PdfFormulaPreviewProps {
  latex: string;
  color: string;
  compact?: boolean;
  testId?: string;
}

export default function PdfFormulaPreview({
  latex,
  color,
  compact = false,
  testId = "pdf-formula-preview",
}: PdfFormulaPreviewProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const renderLatex = normalizePdfFormulaForRender(latex);
    if (renderLatex.trim() === "") {
      node.textContent = "";
      node.setAttribute("data-empty", "true");
      node.removeAttribute("data-invalid");
      node.removeAttribute("data-overflow");
      node.removeAttribute("data-fit-scale");
      node.removeAttribute("data-fit-raw-scale");
      return;
    }
    node.removeAttribute("data-empty");
    try {
      renderKatexInto(node, renderLatex, PDF_FORMULA_KATEX_RENDER_OPTIONS);
      node.removeAttribute("data-invalid");
    } catch {
      node.textContent = renderLatex;
      node.setAttribute("data-invalid", "true");
      node.removeAttribute("data-overflow");
      node.removeAttribute("data-fit-scale");
      node.removeAttribute("data-fit-raw-scale");
    }

    if (!compact) {
      node.removeAttribute("data-overflow");
      node.removeAttribute("data-fit-scale");
      node.removeAttribute("data-fit-raw-scale");
      return;
    }
    fitCompactFormulaPreview(node);
    const raf =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(() => fitCompactFormulaPreview(node))
        : undefined;
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => fitCompactFormulaPreview(node))
        : undefined;
    resizeObserver?.observe(node);
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
    };
  }, [compact, latex]);

  return (
    <div
      ref={previewRef}
      data-testid={testId}
      className={
        compact
          ? "pdf-formula-preview pdf-formula-preview--compact"
          : "pdf-formula-preview"
      }
      style={{
        minHeight: compact ? "100%" : 56,
        maxHeight: compact ? "100%" : 104,
        width: "100%",
        height: compact ? "100%" : undefined,
        display: compact ? "flex" : undefined,
        alignItems: compact ? "center" : undefined,
        justifyContent: compact ? "center" : undefined,
        overflow: compact ? "visible" : "auto",
        color,
        background: compact ? "transparent" : "#f8fafc",
        border: compact ? "none" : "1px solid #dbeafe",
        borderRadius: compact ? 0 : 4,
        padding: compact ? 0 : "6px 8px",
        fontSize: compact ? "inherit" : 14,
        lineHeight: 1.2,
        pointerEvents: compact ? "none" : undefined,
        boxSizing: "border-box",
      }}
    />
  );
}
