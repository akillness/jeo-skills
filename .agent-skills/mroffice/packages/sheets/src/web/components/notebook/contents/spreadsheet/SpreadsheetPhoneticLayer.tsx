"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";
import {
  phoneticRubyFontPx,
  type PhoneticGuideLayout,
} from "@mrnote/core/web/lib/spreadsheet/cell-phonetic.ts";
import { cssFontFamilyOrUndefined } from "@mrnote/core/web/lib/css-font-family.ts";

/**
 * Show Phonetic Field: the cell's readings in their own font in the band
 * above the text, each over its base characters (Excel's Left / Center /
 * Distributed), or run together from the left edge (No control). One drawing
 * for the grid and for Page Layout (live audit B388), so a guide shown on one
 * is shown on the other. `scale` is the surface's zoom of the cell's own
 * sizes (Page Layout draws the cell at the page's scale).
 */
export function SpreadsheetPhoneticLayer({
  guide,
  textStyle,
  cellFontSize,
  textAlign,
  paddingPx,
  scale = 1,
  testId,
  baseParts,
  spillPx,
}: {
  guide: PhoneticGuideLayout;
  /** The cell's resolved text style (face, size, weight, slant, colour). */
  textStyle: CSSProperties;
  /** The cell's stored font size, which the guide's points are relative to. */
  cellFontSize: unknown;
  textAlign: unknown;
  paddingPx: number;
  scale?: number;
  testId: string;
  /** The cell's text as drawn when its runs vary the font (rich text): each
   * reading then sits over its base characters at their own size, not the
   * cell's (X-321: 16 pt runs in an 11 pt cell put げんき over みん). */
  baseParts?: readonly { text: string; style?: CSSProperties }[];
  /** How far the cell's text spills over its empty neighbours: the guide
   * spills with it (X-321: げんき over 元気 three columns on). */
  spillPx?: { left: number; right: number };
}) {
  const { font, alignment, segments } = guide;
  const baseCss = typeof textStyle.fontSize === "number" ? textStyle.fontSize : undefined;
  const rubyFont: CSSProperties = {
    fontFamily: cssFontFamilyOrUndefined(font.family || textStyle.fontFamily),
    fontSize: phoneticRubyFontPx(font, cellFontSize, baseCss) * scale,
    fontWeight: font.bold ? 700 : 400,
    fontStyle: font.italic ? "italic" : "normal",
    color: font.color ?? textStyle.color,
    whiteSpace: "nowrap",
    lineHeight: 1,
  };
  const baseFont: CSSProperties = {
    fontFamily: textStyle.fontFamily,
    fontSize: baseCss !== undefined ? baseCss * scale : textStyle.fontSize,
    fontWeight: textStyle.fontWeight,
    fontStyle: textStyle.fontStyle,
    whiteSpace: "pre",
  };
  // The base characters [start, start + text.length) in the runs' own fonts.
  const baseText = (start: number, text: string) => {
    if (!baseParts?.length) return text;
    const pieces: { text: string; style?: CSSProperties }[] = [];
    let offset = 0;
    for (const part of baseParts) {
      const from = Math.max(start, offset);
      const to = Math.min(start + text.length, offset + part.text.length);
      if (to > from) pieces.push({ text: part.text.slice(from - offset, to - offset), style: part.style });
      offset += part.text.length;
    }
    return pieces.map((piece, index) => (
      <span
        key={index}
        style={{
          fontFamily: piece.style?.fontFamily,
          fontWeight: piece.style?.fontWeight,
          fontStyle: piece.style?.fontStyle,
          fontSize: typeof piece.style?.fontSize === "number" ? piece.style.fontSize * scale : piece.style?.fontSize,
        }}
      >
        {piece.text}
      </span>
    ));
  };
  const segmentStarts = segments.reduce<number[]>(
    (starts, segment, index) => [...starts, index === 0 ? 0 : starts[index - 1]! + segments[index - 1]!.base.length],
    [],
  );
  return (
    <span
      className="spreadsheet-window__phonetic-layer"
      data-testid={testId}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: -(spillPx?.left ?? 0),
        right: -(spillPx?.right ?? 0),
        top: 0,
        height: guide.bandHeightPx * scale,
        padding: `0 ${paddingPx}px`,
        display: "flex",
        alignItems: "flex-start",
        justifyContent:
          textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {alignment === "noControl" ? (
        <span style={rubyFont}>{segments.map((segment) => segment.ruby ?? "").join("")}</span>
      ) : (
        segments.map((segment, index) =>
          segment.ruby ? (
            <span
              key={index}
              style={{ position: "relative", display: "inline-block", flexShrink: 0, ...baseFont }}
            >
              <span style={{ visibility: "hidden", display: "block", height: 0, overflow: "hidden" }}>
                {baseText(segmentStarts[index]!, segment.base)}
              </span>
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  textAlign:
                    alignment === "center"
                      ? "center"
                      : alignment === "distributed"
                        ? "justify"
                        : "left",
                  textAlignLast: alignment === "distributed" ? "justify" : undefined,
                  ...rubyFont,
                }}
              >
                {segment.ruby}
              </span>
            </span>
          ) : (
            <span
              key={index}
              style={{ display: "inline-block", flexShrink: 0, height: 0, overflow: "hidden", visibility: "hidden", ...baseFont }}
            >
              {baseText(segmentStarts[index]!, segment.base)}
            </span>
          ),
        )
      )}
    </span>
  );
}
