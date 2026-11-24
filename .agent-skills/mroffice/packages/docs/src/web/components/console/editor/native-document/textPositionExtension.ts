"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Word's Font > Advanced > Position (ECMA-376 17.3.2.24 `w:position`): the
 * run raised (Raised) or lowered (Lowered) from the baseline by a number of
 * points, stored as Word stores it, in signed half-points.
 *
 * Word grows the line to hold raised or lowered text (measured in Word 16: a
 * run raised 20pt adds 20pt above the line's ascent), which is what CSS
 * `vertical-align: <length>` does, so the mark renders as exactly that. It
 * does not change the font size, unlike superscript / subscript, and the two
 * combine (a raised superscript is raised from the superscript's place).
 */

export const TEXT_POSITION_MARK_NAME = "textPosition";

/** Word's Position "By" box accepts -1584pt..1584pt (half-points: +-3168). */
export const TEXT_POSITION_HALF_POINT_LIMIT = 3168;

/** Word's Font dialog fills "By" with 3pt when Raised or Lowered is chosen. */
export const DEFAULT_TEXT_POSITION_POINTS = 3;

export function normalizeTextPositionHalfPoints(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(number) || number === 0) return null;
  if (Math.abs(number) > TEXT_POSITION_HALF_POINT_LIMIT) return null;
  return number;
}

/** A typed "By" value in points to half-points (Word rounds to 0.5pt). */
export function textPositionPointsToHalfPoints(value: unknown): number | null {
  const points =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim().replace(/\s*pt$/i, ""))
        : Number.NaN;
  if (!Number.isFinite(points) || points < 0) return null;
  const halfPoints = Math.round(points * 2);
  return halfPoints > TEXT_POSITION_HALF_POINT_LIMIT ? null : halfPoints;
}

/** The fixed CSS of a normalized position (never interpolates user text). */
export function textPositionCss(halfPoints: number): string {
  return `vertical-align: ${halfPoints / 2}pt`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentTextPosition: {
      /** Raise (positive) or lower (negative) the selection, in half-points. */
      setTextPosition: (halfPoints: number) => ReturnType;
      /** Word's Position: Normal. */
      unsetTextPosition: () => ReturnType;
    };
  }
}

export const DocumentTextPosition = Mark.create({
  name: TEXT_POSITION_MARK_NAME,

  addAttributes() {
    return {
      halfPoints: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizeTextPositionHalfPoints(element.getAttribute("data-text-position")),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-text-position]",
        getAttrs: (element) =>
          element instanceof HTMLElement &&
          normalizeTextPositionHalfPoints(element.getAttribute("data-text-position")) !== null
            ? null
            : false,
      },
    ];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const halfPoints = normalizeTextPositionHalfPoints(mark.attrs.halfPoints);
    if (halfPoints === null) return ["span", mergeAttributes(HTMLAttributes), 0];
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-text-position": String(halfPoints),
        style: textPositionCss(halfPoints),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setTextPosition:
        (halfPoints) =>
        ({ commands, editor }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeTextPositionHalfPoints(halfPoints);
          if (normalized === null) {
            return commands.unsetMark(TEXT_POSITION_MARK_NAME, {
              extendEmptyMarkRange: true,
            });
          }
          return commands.setMark(TEXT_POSITION_MARK_NAME, { halfPoints: normalized });
        },
      unsetTextPosition:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(TEXT_POSITION_MARK_NAME, { extendEmptyMarkRange: true }),
    };
  },
});

export default DocumentTextPosition;
