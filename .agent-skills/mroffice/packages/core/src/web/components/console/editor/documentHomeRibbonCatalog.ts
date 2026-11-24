/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { pxToPt } from "../../../lib/office-units";
import { OFFICE_FONT_SIZE_POINTS } from "../../office-ribbon/officeTypographyCatalog";
import { OFFICE_FONT_SIZE_LIMITS } from "../../office-ribbon/officeFontSizeCatalog";
import { documentFontSizePx } from "./native-document/documentFontSize";
import {
  OFFICE_STANDARD_COLORS,
  OFFICE_THEME_COLOR_COLUMNS,
  officeThemeColorsRowMajor,
} from "../../office-ribbon/officeColorCatalog";

/**
 * UI-only catalogs for Docs > Home.
 *
 * The editor stores font sizes in CSS pixels because that is what TipTap
 * renders. Office exposes typographic points, so the ribbon converts only at
 * its boundary. Keeping the conversion here prevents a visual menu change from
 * altering page geometry or imported document data.
 */

export const WORD_FONT_SIZE_POINTS = OFFICE_FONT_SIZE_POINTS;

// The Chinese size names live with the shared Office size catalog, which the
// PDF text editor lists too.
export {
  CHINESE_FONT_SIZE_PRESETS,
  type ChineseFontSizePreset,
} from "../../office-ribbon/officeFontSizeCatalog";

function compactNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Convert an editor CSS-pixel font size to the point value shown by Office. */
export function fontPixelsToPoints(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const numeric = Number.parseFloat(String(value).replace(/px$/i, "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return compactNumber(pxToPt(numeric));
}

/**
 * Convert a user-entered Office point size to the editor's CSS-pixel value:
 * Word's range, 1 to 1638 points, on its half-point grid (the ribbon, the
 * Font dialog and the style dialogs refused anything past 72 or under 4.5,
 * so a typed 96 or 3 did nothing).
 */
export function fontPointsToPixels(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = Number.parseFloat(String(value).replace(/pt$/i, "").trim());
  const { min, max, step } = OFFICE_FONT_SIZE_LIMITS.word;
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return documentFontSizePx(Math.round(numeric / step) * step);
}

/**
 * Word-compatible theme swatches. Columns are accent families and rows are
 * tonal variants; the UI transposes this into a compact 10 × 6 matrix.
 */
export const HOME_THEME_COLOR_COLUMNS = OFFICE_THEME_COLOR_COLUMNS;

export const HOME_THEME_COLORS = HOME_THEME_COLOR_COLUMNS.flatMap((column) =>
  column.map((color) => color),
);

export const HOME_STANDARD_COLORS = OFFICE_STANDARD_COLORS;

export const HOME_HIGHLIGHT_COLORS = [
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#ff00ff",
  "#0000ff",
  "#ff0000",
  "#000080",
  "#008080",
  "#008000",
  "#800080",
  "#800000",
  "#808000",
  "#808080",
  "#c0c0c0",
  "#000000",
  "#fef3c7",
] as const;

/** Row-major matrix used by CSS grid so shades line up like the Office menu. */
export function homeThemeColorsRowMajor(): string[] {
  return officeThemeColorsRowMajor();
}
