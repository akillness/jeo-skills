"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import { useId, useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { nativeCellPaddingPx } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";

export interface SpreadsheetCellControlFrame {
  width: number;
  height: number;
  fontScale: number;
}

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "style" | "checked"> {
  checked: boolean;
  containerTestId?: string;
  frame: SpreadsheetCellControlFrame;
  cellStyle: CSSProperties;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  dpi: number;
}

/** A cell control is source-colored, font-sized content. The browser checkbox
 * supplies focus, Space and change semantics, but never the document's paint.
 * Coordinates are resolved on the native device grid before page/view scaling.
 */
export function SpreadsheetCellCheckbox({
  frame, cellStyle, horizontalAlign, verticalAlign = "bottom", dpi, containerTestId,
  checked, disabled, onFocus, onBlur, ...inputProps
}: Props) {
  const [focused, setFocused] = useState(false);
  const cutoutId = useId();
  const unit = 96 / dpi;
  const font = typeof cellStyle.fontSize === "number" && Number.isFinite(cellStyle.fontSize) && cellStyle.fontSize > 0
    ? cellStyle.fontSize : ptToPx(11);
  const advance = Math.max(1, Math.round(font / unit));
  const device = unit * frame.fontScale;
  const glyphScale = font * frame.fontScale / 10;
  const width = frame.width / device;
  const height = frame.height / device;
  const spareX = Math.max(0, width - advance);
  const spareY = Math.max(0, height - advance);
  const padding = nativeCellPaddingPx(dpi) / unit;
  const x = horizontalAlign === "left" ? Math.min(padding, spareX)
    : horizontalAlign === "right" ? Math.max(0, spareX - padding) : Math.round(spareX / 2);
  const y = verticalAlign === "top" ? Math.min(2, spareY)
    : verticalAlign === "middle" ? Math.floor(spareY / 2) : Math.max(0, spareY - 2);
  return <span data-spreadsheet-cell-checkbox="" data-testid={containerTestId} className="spreadsheet-window__checkbox-layer" style={{
    // The 10x10 design box represents one source em, not a fixed point size.
    // Keep fractional source font sizes in the glyph while its origin follows
    // the native advance grid; transform once to avoid CSS layout quantization.
    position: "absolute", left: 0, top: 0, width: 10, height: 10,
    transform: `matrix(${glyphScale}, 0, 0, ${glyphScale}, ${x * device}, ${y * device})`,
    transformOrigin: "0 0", color: cellStyle.color ?? "inherit",
    lineHeight: 0, pointerEvents: "none",
    outline: focused && !disabled ? `${2 * device / glyphScale}px solid var(--console-accent, #0d9488)` : undefined,
    outlineOffset: 2 * device / glyphScale,
  }}>
    <input {...inputProps} type="checkbox" checked={checked} disabled={disabled}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
        opacity: 0, margin: 0, cursor: disabled ? "default" : "pointer", pointerEvents: "auto" }} />
    <svg aria-hidden="true" focusable="false" viewBox="0 0 10 10" width="100%" height="100%"
      style={{ display: "block", overflow: "visible", pointerEvents: "none" }}>
      {checked ? <>
        <defs><mask id={cutoutId} maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="10" style={{ maskType: "luminance" }}>
          <rect width="10" height="10" fill="#fff" />
          <path d="M2.4 5.1 4 6.8 7.9 2.9" fill="none" stroke="#000" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </mask></defs>
        {/* A monochrome control glyph leaves the tick unpainted, allowing the
            cell fill to show through instead of imposing a white checkmark. */}
        <rect width="10" height="10" rx="1.7" fill="currentColor" mask={`url(#${cutoutId})`} />
      </> : <rect x=".55" y=".55" width="8.9" height="8.9" rx="1.15" fill="none" stroke="currentColor" strokeWidth="1.1" />}
    </svg>
  </span>;
}
