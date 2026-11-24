"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useCallback } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type SpreadsheetSortValueKind, type SpreadsheetSortDialogFormatOption, type SpreadsheetSortDialogLabels, type SpreadsheetSortDialogLevel } from "./SpreadsheetSortDialog";
import { type SortDisplayKeyCell } from "../../../../lib/spreadsheet/multi-sort";
import { sortKeyOf } from "../../../../lib/spreadsheet/sort-filter";
import { classifySpreadsheetNumberFormat } from "@mrnote/core/web/lib/spreadsheet/date-filter-tree.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { iconSetDisplayName, type IconSetNameTranslator } from "./iconSetLabel";
import { MAX_SORT_FORMAT_OPTIONS_PER_KIND } from "./spreadsheetDialogDrafts";

/** What useSpreadsheetSortDialogOptions reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSortDialogOptionsInputs {
  cellSortKeyAt: (row: number, col: number) => { valueType: "boolean"; booleanValue: boolean; numericValue?: number | undefined; value: string; } | { valueType: "error"; numericValue?: number | undefined; value: string; } | { valueType: "text"; numericValue?: number | undefined; value: string; } | { numericValue?: number | undefined; value: string; };
  sheet: SheetModel;
  sortDialogAuthority: { readonly sheetId: string; readonly range: { readonly r1: number; readonly c1: number; readonly r2: number; readonly c2: number; }; readonly currentRegion?: true; } | null;
  sortDialogColumns: number[];
  sortDialogHasHeader: boolean;
  sortDialogLabels: SpreadsheetSortDialogLabels;
  sortDialogLevels: SpreadsheetSortDialogLevel[];
  sortDialogOpen: boolean;
  sortDialogOrientation: "rows" | "columns";
  sortDialogRange: { readonly r1: number; readonly c1: number; readonly r2: number; readonly c2: number; };
  sortDisplayCellAt: (row: number, col: number) => SortDisplayKeyCell;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSortDialogOptions({
  cellSortKeyAt,
  sheet,
  sortDialogAuthority,
  sortDialogColumns,
  sortDialogHasHeader,
  sortDialogLabels,
  sortDialogLevels,
  sortDialogOpen,
  sortDialogOrientation,
  sortDialogRange,
  sortDisplayCellAt,
  t,
}: SpreadsheetSortDialogOptionsInputs) {
  // What each level's key line holds, for Excel's Order wording: A to Z for
  // text, Smallest to Largest for numbers, Oldest to Newest for dates. A mixed
  // line takes the kind it holds most, the rule Excel states for its AutoFilter
  // commands; a tie reads as text. A bounded sample keeps a huge range cheap.
  const sortDialogValueKinds = useMemo((): SpreadsheetSortValueKind[] => {
    if (!sortDialogOpen || sortDialogAuthority === null) return [];
    const { r1, r2, c1, c2 } = sortDialogAuthority.range;
    const byLine = new Map<number, SpreadsheetSortValueKind>();
    const kindOfLine = (line: number): SpreadsheetSortValueKind => {
      const counts = { text: 0, number: 0, date: 0 };
      let sampled = 0;
      const visit = (row: number, col: number) => {
        let key: ReturnType<typeof sortKeyOf>;
        try {
          key = sortKeyOf(cellSortKeyAt(row, col));
        } catch {
          return;
        }
        if (key.kind === "empty") return;
        sampled += 1;
        if (key.kind !== "number") {
          counts.text += 1;
          return;
        }
        const format = sheet.cells[`${row}:${col}`]?.style?.numberFormat;
        const semantics =
          typeof format === "string"
            ? classifySpreadsheetNumberFormat(format, key.n)
            : null;
        if (
          semantics?.valid === true &&
          (semantics.hasCalendarDate || semantics.hasClock)
        ) {
          counts.date += 1;
        } else {
          counts.number += 1;
        }
      };
      const columns = sortDialogOrientation === "columns";
      const first = columns
        ? sortDialogHasHeader ? c1 + 1 : c1
        : sortDialogHasHeader ? r1 + 1 : r1;
      const last = columns ? c2 : r2;
      for (let at = first; at <= last && sampled < 1_000; at += 1) {
        if (columns) visit(line, at);
        else visit(at, line);
      }
      if (counts.date > counts.number && counts.date > counts.text) {
        return "date";
      }
      return counts.number > counts.text ? "number" : "text";
    };
    return sortDialogLevels.map((level) => {
      const known = byLine.get(level.column);
      if (known) return known;
      const kind = kindOfLine(level.column);
      byLine.set(level.column, kind);
      return kind;
    });
  }, [
    cellSortKeyAt,
    sheet.cells,
    sortDialogAuthority,
    sortDialogHasHeader,
    sortDialogLevels,
    sortDialogOpen,
    sortDialogOrientation,
  ]);

  // The key-line options shown in each sort level's picker: COLUMNS in row
  // (top-to-bottom) orientation, ROWS in column (left-to-right) orientation.
  const sortDialogKeyLines = useMemo(() => {
    if (sortDialogOrientation === "columns") {
      const rows: number[] = [];
      for (let r = sortDialogRange.r1; r <= sortDialogRange.r2; r += 1)
        rows.push(r);
      return rows;
    }
    return sortDialogColumns;
  }, [
    sortDialogOrientation,
    sortDialogRange.r1,
    sortDialogRange.r2,
    sortDialogColumns,
  ]);

  // Only formats truly displayed on the selected key line become targets.
  // Labels retain the exact color/icon identity, so the swatch is never the
  // only cue. A per-kind bound contains color-scale option growth.
  const sortDialogFormatOptionsForLine = useCallback(
    (line: number): SpreadsheetSortDialogFormatOption[] => {
      const options: SpreadsheetSortDialogFormatOption[] = [];
      const seen = {
        cellColor: new Set<string>(),
        fontColor: new Set<string>(),
        icon: new Set<string>(),
      };
      const append = (option: SpreadsheetSortDialogFormatOption) => {
        const bucket = seen[option.kind];
        if (
          bucket.has(option.key) ||
          bucket.size >= MAX_SORT_FORMAT_OPTIONS_PER_KIND
        ) {
          return;
        }
        bucket.add(option.key);
        options.push(option);
      };
      const inspect = (row: number, col: number) => {
        const display = sortDisplayCellAt(row, col);
        if (display.fillColor) {
          append({
            kind: "cellColor",
            key: display.fillColor,
            label: `${sortDialogLabels.cellColor} ${display.fillColor.toUpperCase()}`,
            color: display.fillColor,
          });
        }
        if (display.fontColor) {
          append({
            kind: "fontColor",
            key: display.fontColor,
            label: `${sortDialogLabels.fontColor} ${display.fontColor.toUpperCase()}`,
            color: display.fontColor,
          });
        }
        if (display.iconKey) {
          const [iconSet, rawIndex, rawCount] = display.iconKey.split(":");
          const index = Number(rawIndex);
          const count = Number(rawCount);
          if (
            iconSet &&
            Number.isSafeInteger(index) &&
            (count === 3 || count === 4 || count === 5) &&
            index >= 0 &&
            index < count
          ) {
            // The set's localized gallery name, not its key (S-108).
            const family = iconSetDisplayName(iconSet, t as unknown as IconSetNameTranslator);
            append({
              kind: "icon",
              key: display.iconKey,
              label: t("spreadsheet.dynamicCopy.iconPosition", { family, index: index + 1, count }),
              icon: { iconSet, index, count },
            });
          }
        }
      };
      if (sortDialogOrientation === "columns") {
        const dataC1 = sortDialogHasHeader
          ? sortDialogRange.c1 + 1
          : sortDialogRange.c1;
        for (let col = dataC1; col <= sortDialogRange.c2; col += 1) {
          inspect(line, col);
        }
      } else {
        const dataR1 = sortDialogHasHeader
          ? sortDialogRange.r1 + 1
          : sortDialogRange.r1;
        for (let row = dataR1; row <= sortDialogRange.r2; row += 1) {
          inspect(row, line);
        }
      }
      return options;
    },
    [sortDialogHasHeader, sortDialogLabels.cellColor, sortDialogLabels.fontColor, sortDialogOrientation, sortDialogRange.c1, sortDialogRange.c2, sortDialogRange.r1, sortDialogRange.r2, sortDisplayCellAt, t],
  );
  return {
    sortDialogFormatOptionsForLine,
    sortDialogKeyLines,
    sortDialogValueKinds,
  };
}
