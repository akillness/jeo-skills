/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { twipsToPx } from "../../../../lib/document-tabstops";
import { COLUMN_GAP_PX, resolveColumns } from "./documentLayout";
import { pageGeometryTwips } from "./pageSetup";
import type { SectionLayout } from "./sectionLayouts";

/**
 * Width AutoFit may occupy inside the current page/section column. It never
 * reads the editor shell DOM: ribbon/sidebar/window widths are not page
 * geometry. Unequal-column documents conservatively use the narrowest authored
 * column because block-to-column placement is not an editable model property.
 */
export function documentTableAutoFitWidthPx(
  layout: SectionLayout | null,
  docAttrs: Record<string, unknown>,
): number | undefined {
  let widthTwips: number;
  if (layout) {
    const printableTwips =
      layout.pageSize.widthTwips -
      layout.pageMargins.leftTwips -
      layout.pageMargins.rightTwips -
      layout.pageMargins.gutterTwips;
    const count = Math.max(1, Math.floor(layout.columns.count));
    const unequalWidths = layout.columns.equalWidth
      ? []
      : (layout.columns.items ?? [])
          .slice(0, count)
          .map((column) => column.widthTwips)
          .filter((value) => Number.isFinite(value) && value > 0);
    widthTwips =
      unequalWidths.length === count
        ? Math.min(...unequalWidths)
        : Math.floor(
            (printableTwips -
              Math.max(0, layout.columns.spaceTwips) * (count - 1)) /
              count,
          );
  } else {
    const geometry = pageGeometryTwips(
      docAttrs.pageSize,
      docAttrs.pageMargins,
      docAttrs.customPageSize,
      docAttrs.customPageMargins,
      docAttrs.pageOrientation,
    );
    const count = resolveColumns(docAttrs.columns);
    widthTwips = Math.floor(
      (geometry.width -
        geometry.left -
        geometry.right -
        COLUMN_GAP_PX * 15 * (count - 1)) /
        count,
    );
  }
  if (!Number.isFinite(widthTwips) || widthTwips <= 0) return undefined;
  const widthPx = twipsToPx(widthTwips);
  return widthPx > 0 ? widthPx : undefined;
}
