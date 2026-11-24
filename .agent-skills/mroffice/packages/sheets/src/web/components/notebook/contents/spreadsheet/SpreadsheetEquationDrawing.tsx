"use client";














/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo } from "react";
import "katex/dist/katex.min.css";

import { renderValidatedKatexMarkup } from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import { officeEquationBlockLatex } from "@mrnote/core/web/components/console/editor/extensions/wordDisplayMath.ts";
import { type DrawingGrid, type SpreadsheetObjectAnchor } from "../../../../lib/spreadsheet/object-buttons";
import {
  SPREADSHEET_EQUATION_BOX_INSETS,
  spreadsheetEquationAnchorAtSize,
  spreadsheetEquationBoxLatex,
  spreadsheetEquationBoxSizeFor,
  spreadsheetEquationFontSizePx,
} from "../../../../lib/spreadsheet/equation-box";
import { normalizeShapeStyle, type SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";

import type { SpreadsheetObject } from "./spreadsheetSheetModel";
import { useInnerHtml } from "@mrnote/core/web/lib/stable-inner-html.tsx";

const EMU_PER_PX = 9_525;

/** The box's body insets as CSS padding (top right bottom left). */
export const SPREADSHEET_EQUATION_PADDING = [
  SPREADSHEET_EQUATION_BOX_INSETS.top,
  SPREADSHEET_EQUATION_BOX_INSETS.right,
  SPREADSHEET_EQUATION_BOX_INSETS.bottom,
  SPREADSHEET_EQUATION_BOX_INSETS.left,
]
  .map((emu) => `${emu / EMU_PER_PX}px`)
  .join(" ");

/** The size the box's equation is drawn at (the label's own text size). */
export { spreadsheetEquationFontSizePx };

/** Display style without the display block's own margins: the box's insets frame it. */
function equationMarkup(latex: string): string | null {
  return renderValidatedKatexMarkup(`\\displaystyle ${officeEquationBlockLatex(latex)}`, false);
}

/** The committed equation, drawn inside its box (the box's element is the positioned parent). */
export function SpreadsheetEquationDrawing({
  latex,
  shape,
}: {
  readonly latex: string;
  readonly shape: SpreadsheetShapeStyle;
}) {
  const markup = useMemo(() => equationMarkup(latex), [latex]);
  const markupHtml = useInnerHtml(markup);
  return (
    <span
      data-spreadsheet-shape-equation=""
      style={{
        position: "absolute",
        inset: 0,
        boxSizing: "border-box",
        padding: SPREADSHEET_EQUATION_PADDING,
        display: "flex",
        // A display equation is centred on its line; a text box's text
        // starts at its top.
        justifyContent: "center",
        alignItems: "flex-start",
        whiteSpace: "nowrap",
        overflow: "visible",
        fontSize: spreadsheetEquationFontSizePx(shape),
        lineHeight: "normal",
        color: shape.textColor ?? "#111827",
        pointerEvents: "none",
      }}
    >
      {markup === null ? (
        // An equation KaTeX cannot typeset shows its readable text (the
        // linear form stored with it, or a file's own text), as the deck
        // shows its writer's characters -- never the TeX source.
        <span data-invalid="true" data-testid="spreadsheet-shape-equation-preview">
          {shape.text?.trim() || latex}
        </span>
      ) : (
        <span
          data-testid="spreadsheet-shape-equation-preview"
          // A flex box, not a line: the formula's own box starts at the inset,
          // with no line leading above it, exactly where the in-place draft
          // (which hugs the formula) puts it.
          style={{ display: "inline-flex" }}
          // The shared renderer's own markup (trust off, throwOnError on).
          dangerouslySetInnerHTML={markupHtml}
        />
      )}
    </span>
  );
}

/**
 * How large `latex` is drawn at `fontSizePx` (unscaled layout px), laid out
 * exactly as the box draws it. Null when nothing is laid out (no layout
 * engine, or LaTeX the renderer refuses).
 */
export function measureSpreadsheetEquation(
  latex: string,
  fontSizePx: number,
): { width: number; height: number } | null {
  if (typeof document === "undefined" || !latex.trim()) return null;
  const markup = equationMarkup(latex);
  if (markup === null) return null;
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.setAttribute("data-spreadsheet-equation-measure", "");
  Object.assign(probe.style, {
    position: "absolute",
    left: "-10000px",
    top: "0px",
    // Laid out as the drawing lays it out: the formula's own box, no line box.
    display: "inline-flex",
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    fontSize: `${fontSizePx}px`,
    lineHeight: "normal",
  });
  probe.innerHTML = markup;
  document.body.appendChild(probe);
  try {
    const width = probe.offsetWidth;
    const height = probe.offsetHeight;
    return width > 0 && height > 0 ? { width, height } : null;
  } finally {
    probe.remove();
  }
}

/** The equation box's size in px for an equation drawn at `content` px (its insets added). */
export function spreadsheetEquationBoxPixels(content: {
  readonly width: number;
  readonly height: number;
}): { width: number; height: number } {
  const size = spreadsheetEquationBoxSizeFor(content);
  return { width: Math.round(size.width / EMU_PER_PX), height: Math.round(size.height / EMU_PER_PX) };
}

/** `anchor` at `size` (EMU), its top-left kept. */
const anchorAtSize = spreadsheetEquationAnchorAtSize;

/**
 * The equation box sized to its equation ("Resize shape to fit text", no
 * wrap), its top-left kept. `fit` sizes it exactly (a box just inserted);
 * `grow` only widens or heightens a box too small for its equation, so a box
 * that is already larger is never shrunk by editing it. A box from a file
 * keeps the frame the file gave it, as Excel draws it. Unchanged when nothing
 * can be measured.
 */
export function fitSpreadsheetEquationBox(
  object: SpreadsheetObject,
  mode: "fit" | "grow",
  currentPx?: { readonly width: number; readonly height: number } | null,
  /** The grid a Move-and-size box's far marker is placed on. */
  grid?: DrawingGrid,
): SpreadsheetObject {
  if (object.type !== "shape" || (object as { source?: unknown }).source) return object;
  const shape = normalizeShapeStyle(object.shape);
  const latex = spreadsheetEquationBoxLatex(shape) ?? "";
  const content = measureSpreadsheetEquation(latex, spreadsheetEquationFontSizePx(shape));
  if (!content) return object;
  const needed = spreadsheetEquationBoxSizeFor(content);
  let size: { width: number; height: number } = { ...needed };
  if (mode === "grow" && currentPx) {
    const now = { width: currentPx.width * EMU_PER_PX, height: currentPx.height * EMU_PER_PX };
    if (needed.width <= now.width && needed.height <= now.height) return object;
    size = { width: Math.max(now.width, needed.width), height: Math.max(now.height, needed.height) };
  }
  return {
    ...object,
    anchor: anchorAtSize((object as { anchor?: SpreadsheetObjectAnchor }).anchor, size, grid),
  } as SpreadsheetObject;
}
