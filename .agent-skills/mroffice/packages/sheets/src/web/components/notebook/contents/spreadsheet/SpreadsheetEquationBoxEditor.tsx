"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A worksheet's equation text box open IN PLACE (Excel's Insert > Equation
 * box, XLS-A016): the shared in-place equation field (`EquationInPlaceEditor`,
 * the Docs MathBlock's MathLive editor, the one a slide's equation box opens
 * in) drawn over the box's own rectangle where the box draws its equation,
 * in the label's size and colour. While it is open the box's own
 * drawing of the equation is hidden (`SpreadsheetShapeView editingEquation`),
 * so the draft is the only equation there. An empty draft shows Office's
 * prompt ("Type equation here.").
 */

import { useEffect, useRef, type CSSProperties } from "react";

import type { EquationInputMode } from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import type {
  VisualMathEditorController,
  VisualMathEditorState,
} from "@mrnote/core/web/components/console/editor/extensions/visualMathEditor.ts";
import {
  EquationInPlaceEditor,
  type EquationInPlaceCommitVia,
} from "@mrnote/core/web/components/office-equation/EquationInPlaceEditor.tsx";
import { equationPromptLatex } from "@mrnote/slides/web/components/notebook/contents/presentation/PresentationEquationBoxEditor.tsx";
import type { SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";

import { SPREADSHEET_EQUATION_PADDING, spreadsheetEquationFontSizePx } from "./SpreadsheetEquationDrawing";

export function SpreadsheetEquationBoxEditor({
  shape,
  latex,
  inputMode,
  placeholder,
  pointer,
  onCommit,
  onCancel,
  onController,
  onDraftSize,
}: {
  readonly shape: SpreadsheetShapeStyle;
  readonly latex: string;
  readonly inputMode: EquationInputMode;
  /** Office's prompt, in the person's language. */
  readonly placeholder: string;
  readonly pointer: { readonly clientX: number; readonly clientY: number } | null;
  /** `direction`: the side a `"move-out"` left the equation by. */
  readonly onCommit: (
    state: VisualMathEditorState,
    via: EquationInPlaceCommitVia,
    direction?: "backward" | "forward",
  ) => void;
  readonly onCancel: () => void;
  readonly onController: (controller: VisualMathEditorController | null) => void;
  /**
   * The draft's own size (layout px) whenever it changes: Office's equation
   * box resizes to fit its text while it is typed, so the host sizes the box
   * to it live.
   */
  readonly onDraftSize?: (size: { width: number; height: number }) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const reportRef = useRef(onDraftSize);
  useEffect(() => {
    reportRef.current = onDraftSize;
  }, [onDraftSize]);
  useEffect(() => {
    const field = wrapperRef.current?.firstElementChild;
    if (!(field instanceof HTMLElement) || typeof ResizeObserver === "undefined") return;
    let last = "";
    const report = () => {
      const width = field.offsetWidth;
      const height = field.offsetHeight;
      const key = `${width}x${height}`;
      if (width <= 0 || height <= 0 || key === last) return;
      last = key;
      reportRef.current?.({ width, height });
    };
    const observer = new ResizeObserver(report);
    observer.observe(field);
    report();
    return () => observer.disconnect();
  }, []);
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    boxSizing: "border-box",
    // Laid out as the box draws its committed equation
    // (`SpreadsheetEquationDrawing`): centred on its line from the box's top,
    // inside its insets, at the label's size, so committing does not move it.
    padding: SPREADSHEET_EQUATION_PADDING,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    whiteSpace: "nowrap",
    fontSize: spreadsheetEquationFontSizePx(shape),
    lineHeight: "normal",
    color: shape.textColor ?? "#111827",
    caretColor: shape.textColor ?? "#111827",
    overflow: "visible",
    zIndex: 2,
  };
  return (
    <div ref={wrapperRef} style={style} data-spreadsheet-equation-box-editor="" data-testid="spreadsheet-equation-box-editor">
      <EquationInPlaceEditor
        latex={latex}
        inputMode={inputMode}
        layoutMode="professional"
        variant="block"
        emptyPlaceholderLatex={equationPromptLatex(placeholder)}
        pointerAnchor={pointer}
        onCommit={onCommit}
        onCancel={onCancel}
        onController={onController}
        testId="spreadsheet-equation-box-field"
      />
    </div>
  );
}
