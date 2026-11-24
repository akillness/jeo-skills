/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The document's own definitions of Word's built-in reference-list styles:
 * "TOC 1".."TOC 9" (Table of Contents > Modify... > Modify) and "Table of
 * Figures" (Table of Figures > Modify...). Word keeps one definition of each
 * per document in styles.xml; the TOC and figure-list entries wear them.
 *
 * Carried on `doc.attrs.referenceStyles` as a closed map (style id to a
 * formatting subset: font, size, colour, bold/italic/underline, alignment,
 * spacing, line spacing, indents). A style the map does not name keeps the
 * definition the chosen Format writes (tocWordCatalog / referenceListWordCatalog).
 * Sanitized on every edge; an unknown id or property is dropped.
 */

import type { CSSProperties } from "react";

import {
  normalizeFontFamily,
  normalizeFontSize,
  normalizeTextColor,
} from "../extensions/TextStyling";
import {
  normalizeLineHeight,
  normalizeTextAlign,
  type DocumentTextAlign,
} from "../extensions/DocumentFormatting";
import {
  normalizeFirstLineIndentPt,
  normalizeIndentPt,
} from "./preciseIndent";

export const REFERENCE_STYLE_IDS = [
  "TOC1",
  "TOC2",
  "TOC3",
  "TOC4",
  "TOC5",
  "TOC6",
  "TOC7",
  "TOC8",
  "TOC9",
  "TableofFigures",
] as const;
export type ReferenceStyleId = (typeof REFERENCE_STYLE_IDS)[number];

export interface ReferenceStyleDefinition {
  fontFamily?: string;
  fontSize?: string;
  textColor?: string;
  bold?: true;
  italic?: true;
  underline?: true;
  textAlign?: DocumentTextAlign;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineHeight?: string;
  indentLeftPt?: number;
  indentRightPt?: number;
  firstLineIndentPt?: number;
}

export type ReferenceStyleMap = Partial<
  Record<ReferenceStyleId, ReferenceStyleDefinition>
>;

/** Word's style name for an id ("toc 1", "table of figures"). */
export function referenceStyleName(id: ReferenceStyleId): string {
  return id === "TableofFigures" ? "table of figures" : `toc ${id.slice(3)}`;
}

function spacingPt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1584) return null;
  return Math.round(value * 20) / 20;
}

export function normalizeReferenceStyleDefinition(
  value: unknown,
): ReferenceStyleDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const out: ReferenceStyleDefinition = {};
  const family = normalizeFontFamily(source.fontFamily);
  if (family) out.fontFamily = family;
  const size = normalizeFontSize(source.fontSize);
  if (size) out.fontSize = size;
  const color = normalizeTextColor(source.textColor);
  if (color) out.textColor = color;
  if (source.bold === true) out.bold = true;
  if (source.italic === true) out.italic = true;
  if (source.underline === true) out.underline = true;
  const align = normalizeTextAlign(source.textAlign);
  if (align) out.textAlign = align;
  const before = spacingPt(source.spaceBeforePt);
  if (before !== null) out.spaceBeforePt = before;
  const after = spacingPt(source.spaceAfterPt);
  if (after !== null) out.spaceAfterPt = after;
  const lineHeight = normalizeLineHeight(source.lineHeight);
  if (lineHeight) out.lineHeight = lineHeight;
  const left = normalizeIndentPt(source.indentLeftPt);
  if (left !== null) out.indentLeftPt = left;
  const right = normalizeIndentPt(source.indentRightPt);
  if (right !== null) out.indentRightPt = right;
  const first = normalizeFirstLineIndentPt(source.firstLineIndentPt);
  if (first !== null) out.firstLineIndentPt = first;
  return Object.keys(out).length > 0 ? out : null;
}

/** Closed map normalizer; null when nothing survives. */
export function normalizeReferenceStyles(value: unknown): ReferenceStyleMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const out: ReferenceStyleMap = {};
  for (const id of REFERENCE_STYLE_IDS) {
    const definition = normalizeReferenceStyleDefinition(source[id]);
    if (definition) out[id] = definition;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The CSS an entry wearing this style is painted with. */
export function referenceStyleCss(
  definition: ReferenceStyleDefinition | undefined,
): CSSProperties | undefined {
  if (!definition) return undefined;
  return {
    fontFamily: definition.fontFamily,
    fontSize: definition.fontSize,
    color: definition.textColor,
    fontWeight: definition.bold ? 700 : undefined,
    fontStyle: definition.italic ? "italic" : undefined,
    textDecoration: definition.underline ? "underline" : undefined,
    textAlign:
      definition.textAlign === "distribute" ? "justify" : definition.textAlign,
    textAlignLast: definition.textAlign === "distribute" ? "justify" : undefined,
    marginTop:
      definition.spaceBeforePt !== undefined
        ? `${definition.spaceBeforePt}pt`
        : undefined,
    marginBottom:
      definition.spaceAfterPt !== undefined
        ? `${definition.spaceAfterPt}pt`
        : undefined,
    lineHeight: definition.lineHeight,
    paddingLeft:
      definition.indentLeftPt !== undefined
        ? `${definition.indentLeftPt}pt`
        : undefined,
    paddingRight:
      definition.indentRightPt !== undefined
        ? `${definition.indentRightPt}pt`
        : undefined,
    textIndent:
      definition.firstLineIndentPt !== undefined
        ? `${definition.firstLineIndentPt}pt`
        : undefined,
  };
}
