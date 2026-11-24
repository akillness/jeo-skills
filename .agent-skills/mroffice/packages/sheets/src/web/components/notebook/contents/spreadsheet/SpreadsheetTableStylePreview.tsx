"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo } from "react";
import {
  nativeTableStyleChoiceName,
  tableStylePresetForTheme,
  tableStyleCellPaint,
  type DataTable,
  type TableStyleChoice,
  type TableStyleId,
} from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import type { SpreadsheetNativeTableStyle } from "@mrnote/core/web/lib/spreadsheet/native-table-styles.ts";

/** Keep recipe evaluation inside the mounted preview, beyond the menu portal. */
export const SpreadsheetTableStylePreview = memo(function SpreadsheetTableStylePreview({
  styleId,
  accentColors,
  nativeStyles,
}: {
  readonly styleId: TableStyleChoice;
  readonly accentColors: readonly string[];
  /** The workbook's own table styles, for a Custom-section tile. */
  readonly nativeStyles?: readonly SpreadsheetNativeTableStyle[];
}) {
  const nativeName = nativeTableStyleChoiceName(styleId);
  const preset = tableStylePresetForTheme(
    nativeName === undefined ? (styleId as TableStyleId) : undefined,
    accentColors,
  );
  const previewTable: DataTable = {
    id: "style-preview", name: "Preview",
    range: { r1: 0, c1: 0, r2: 5, c2: 4 },
    headerRow: true, bandedRows: true,
  };
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true" data-native-table-style={nativeName ?? preset.excelStyleName}>
      {Array.from({ length: 30 }, (_, index) => {
        const row = Math.floor(index / 5), col = index % 5;
        const x = 2 + col * 11.2, y = 2 + row * 9.3;
        const paint = tableStyleCellPaint(styleId, accentColors, previewTable, row, col, nativeStyles);
        const lines = {
          top: [x, y, x + 11.2, y], bottom: [x, y + 9.3, x + 11.2, y + 9.3],
          left: [x, y, x, y + 9.3], right: [x + 11.2, y, x + 11.2, y + 9.3],
        };
        return <g key={index}>
          <rect x={x} y={y} width="11.2" height="9.3" fill={paint.backgroundColor ?? "#ffffff"} />
          <path d={`M${x + 3} ${y + 4.7}h5.2`} stroke={paint.color ?? "#000000"} strokeWidth=".85" />
          {Object.entries(paint.borderEdges ?? {}).map(([edge, border]) => {
            const [x1, y1, x2, y2] = lines[edge as keyof typeof lines];
            return <line key={edge} x1={x1} y1={y1} x2={x2} y2={y2} stroke={border.color}
              strokeWidth={border.style === "thin" ? .55 : 1} />;
          })}
        </g>;
      })}
    </svg>
  );
});
