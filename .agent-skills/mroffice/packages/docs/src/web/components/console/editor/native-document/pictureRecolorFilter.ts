/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A Word picture's Recolor beyond Grayscale (Picture Format > Color: Sepia,
 * Black and White N %, the Dark and Light tiles), drawn as Office draws it:
 * the host-neutral `office-recolor-presets` steps, in one shared SVG filter
 * per preset and theme. The page keeps only the preset id (`pictureRecolor`),
 * as the file keeps only the transform; the theme is the document's own.
 */

import {
  isOfficeRecolorPreset,
  officeAdjustFilterSteps,
  type OfficeRecolorPresetId,
} from "@mrnote/core/web/lib/office-recolor-presets.ts";
import { officeAdjustStepsFilterCss } from "@mrnote/core/web/lib/office-picture-adjust-filter.ts";
import type { OfficeThemeGridColors } from "@mrnote/core/web/lib/office-theme-color-grid.ts";
import { documentThemeColorsForExport } from "@mrnote/core/web/lib/office-table-style-word.ts";

/** A preset drawn by this filter: every one but No Recolor and Grayscale
 * (a CSS grayscale already) and Washout (a correction, not a recolour). */
export function isPictureRecolorPreset(value: unknown): value is OfficeRecolorPresetId {
  return isOfficeRecolorPreset(value) && value !== "grayscale" && value !== "washout";
}

/** The document's theme as the recolour grid reads it. */
export function pictureRecolorTheme(
  docAttrs: Readonly<Record<string, unknown>> | null | undefined,
): OfficeThemeGridColors {
  const theme = documentThemeColorsForExport(docAttrs);
  return {
    bg1: theme.background1,
    tx1: theme.text1,
    bg2: theme.background2,
    tx2: theme.text2,
    accent1: theme.accent1,
    accent2: theme.accent2,
    accent3: theme.accent3,
    accent4: theme.accent4,
    accent5: theme.accent5,
    accent6: theme.accent6,
  };
}

/**
 * The CSS `filter` term for a picture's recolour preset (`url(#…)`), its SVG
 * filter defined once in `owner`; "" for none, Grayscale and Washout.
 */
export function pictureRecolorFilterCss(
  recolor: unknown,
  docAttrs: Readonly<Record<string, unknown>> | null | undefined,
  owner: Document | null = typeof document === "undefined" ? null : document,
): string {
  if (!owner || !owner.body || !isPictureRecolorPreset(recolor)) return "";
  return officeAdjustStepsFilterCss(officeAdjustFilterSteps({ recolor }, pictureRecolorTheme(docAttrs)), owner);
}
