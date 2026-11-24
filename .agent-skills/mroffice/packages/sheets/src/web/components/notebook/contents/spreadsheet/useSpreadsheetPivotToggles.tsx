"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type PivotGrouping, type PivotDateUnit, type PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { pivotSubtotalPosition } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";

/** What useSpreadsheetPivotToggles reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetPivotTogglesInputs {
  commitPivot: (rawConfig: PivotConfig | null) => void;
  pivotBase: () => PivotConfig;
  pivotConfig: PivotConfig | null;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetPivotToggles({
  commitPivot,
  pivotBase,
  pivotConfig,
  t,
}: SpreadsheetPivotTogglesInputs) {
  // Toggle ONE allowed value in a report filter's `selected` set. An empty set
  // means "(All)"; checking the first value starts restricting, unchecking the
  // last returns the filter to "(All)".
  const togglePivotFilterValue = useCallback(
    (colIndex: number, value: string) => {
      const base = pivotBase();
      if (!base.filters.some((f) => f.colIndex === colIndex)) return;
      commitPivot({
        ...base,
        filters: base.filters.map((f) => {
          if (f.colIndex !== colIndex) return f;
          const present = f.selected.includes(value);
          return {
            ...f,
            selected: present
              ? f.selected.filter((v) => v !== value)
              : [...f.selected, value],
          };
        }),
      });
    },
    [commitPivot, pivotBase],
  );

  // Set (or clear) the GROUPING of a row/column axis field (Excel "Group field":
  // bucket dates by period or numbers into bins). `null` removes any grouping for
  // the column. normalizePivotConfig drops a grouping on a non-axis column.
  const setPivotFieldGrouping = useCallback(
    (colIndex: number, grouping: PivotGrouping[] | null) => {
      const base = pivotBase();
      const others = base.grouping.filter((g) => g.colIndex !== colIndex);
      commitPivot({
        ...base,
        grouping: grouping ? [...others, ...grouping] : others,
      });
    },
    [commitPivot, pivotBase],
  );

  // The grouping dropdown for ONE field — rendered next to a field's checkbox in
  // the row/column builders, but only when the field is actually on an axis (a
  // non-axis field has nothing to group). Presets cover Excel's common buckets:
  // number bins (10 / 100) and date periods (year / quarter / month).
  const pivotGroupSelect = useCallback(
    (colIndex: number) => {
      // Callers gate on the field's OWN axis (rows are disjoint from columns), so
      // the select renders exactly once for a field — in its axis's builder.
      // A date field may be grouped by several units at once (Excel's Years,
      // Quarters, Months); the presets name the combinations Excel offers.
      const groups = pivotConfig?.grouping.filter((x) => x.colIndex === colIndex) ?? [];
      const g = groups[0];
      const units = groups
        .filter((x) => x.kind === "date")
        .map((x) => x.unit ?? "month")
        .sort((x, y) => ["year", "quarter", "month"].indexOf(x) - ["year", "quarter", "month"].indexOf(y))
        .join("+");
      const value = !g
        ? ""
        : g.kind === "number"
          ? g.size === 100
            ? "num100"
            : "num10"
          : units;
      return (
        <select
          value={value}
          onChange={(event) => {
            const p = event.target.value;
            setPivotFieldGrouping(
              colIndex,
              p === ""
                ? null
                : p === "num10"
                  ? [{ colIndex, kind: "number", size: 10, start: 0 }]
                  : p === "num100"
                    ? [{ colIndex, kind: "number", size: 100, start: 0 }]
                    : p
                        .split("+")
                        .map((unit) => ({ colIndex, kind: "date" as const, unit: unit as PivotDateUnit })),
            );
          }}
          data-testid={`spreadsheet-pivot-group-${colIndex}`}
          aria-label={t("spreadsheet.pivotGroupField")}
          style={{ marginLeft: 6, fontSize: 11 }}
        >
          <option value="">{t("spreadsheet.pivotGroupNone")}</option>
          <option value="num10">{t("spreadsheet.pivotGroupBin10")}</option>
          <option value="num100">{t("spreadsheet.pivotGroupBin100")}</option>
          <option value="year">{t("spreadsheet.pivotGroupYear")}</option>
          <option value="quarter">{t("spreadsheet.pivotGroupQuarter")}</option>
          <option value="month">{t("spreadsheet.pivotGroupMonth")}</option>
          <option value="year+quarter">{t("spreadsheet.pivotGroupYearQuarter")}</option>
          <option value="year+month">{t("spreadsheet.pivotGroupYearMonth")}</option>
          <option value="year+quarter+month">{t("spreadsheet.pivotGroupYearQuarterMonth")}</option>
        </select>
      );
    },
    [pivotConfig, setPivotFieldGrouping, t],
  );

  // Toggle per-outer-group subtotal rows (Excel PivotTable subtotals). Opt-in;
  // commitPivot persists it (normalize keeps it only when true → byte-stable off).
  // The Field List's Subtotals box turns every group's subtotal on or off. The
  // stored position is what the report reads (a PivotTable Create PivotTable
  // made carries "top"), so the box writes it too: off is "none", and on puts
  // them where Excel does for the layout — on the group's row in compact and
  // outline form, beneath it in tabular form.
  const togglePivotRowSubtotals = useCallback(() => {
    const base = pivotBase();
    const shown = pivotSubtotalPosition(base) !== "none";
    commitPivot({
      ...base,
      fieldSubtotals: undefined,
      rowSubtotals: !shown,
      subtotalPosition: shown
        ? "none"
        : base.reportLayout === "compact" || base.reportLayout === "outline"
          ? "top"
          : "bottom",
    });
  }, [commitPivot, pivotBase]);
  return {
    pivotGroupSelect,
    togglePivotFilterValue,
    togglePivotRowSubtotals,
  };
}
