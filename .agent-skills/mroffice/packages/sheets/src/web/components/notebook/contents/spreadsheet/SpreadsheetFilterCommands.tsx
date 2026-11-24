"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The COMMAND BLOCK at the top of an AutoFilter dropdown, and the Custom
 * AutoFilter dialog its "…" items open — Excel's shape, on MRAI's existing
 * filter engine.
 *
 * Microsoft Support, "Filter data in a range or table" and "Quick start: Filter
 * data by using an AutoFilter": clicking a column's arrow drops a menu whose
 * top half is a short command list, above the search box and the checkbox list:
 *
 *   升序 / 降序            — worded by what the column holds: A→Z for text,
 *                           smallest-to-largest for numbers, oldest-to-newest
 *                           for dates (the same rule the Custom Sort dialog's
 *                           Order box follows).
 *   按颜色排序 ▸           — the fills, font colours and icons the column has.
 *   从"<header>"中清除筛选 — dimmed while the column carries no criteria.
 *   按颜色筛选 ▸
 *   文本/数字/日期筛选 ▸    — ONE of the three, chosen by the column's dominant
 *                           type, holding Excel's own item list. Every item
 *                           ending in "…" opens the Custom AutoFilter dialog
 *                           seeded with that operator; 高于平均值 / 低于平均值
 *                           and the relative-date items apply straight away.
 *
 * The dialog speaks OOXML's own `customFilters` grammar (operator + value, two
 * criteria joined by And/Or) and hands it to `conditionFilterFromNativeAutoFilter`
 * — the ONE reader MRAI already uses for an imported AutoFilter. There is no
 * second condition engine here: any one or two lines Excel writes become the
 * canonical condition an import of the same `<customFilters>` would, and
 * reopening the dialog reads the column's condition back through
 * `nativeCustomFiltersFromCondition`, so it shows the saved criteria.
 *
 * Wildcards follow Microsoft Support, "Filter by using advanced criteria": `?`
 * stands for one character and `*` for any run of them, and `~` escapes a
 * literal one. The operator-supplied wildcards of 开头是 / 结尾是 / 包含 wrap an
 * escaped literal; 等于 / 不等于 pass the typed pattern through, so a user can
 * write their own.
 */

import { useMemo, useState, type ReactElement, type ReactNode } from "react";

import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  officeDialogClassName,
  officeDialogParts as dialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { SpreadsheetDataIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDataRibbonIcons.tsx";
import {
  DATA_TABLE_RELATIVE_DATE_PERIODS,
  type DataTableRelativeDatePeriod,
} from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { parseSpreadsheetEntry } from "@mrnote/core/web/lib/spreadsheet/entry-parse.ts";
import { excelSystemSerialToParts } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import {
  conditionFilterFromNativeAutoFilter,
  isCustomCriterionCondition,
  nativeCustomFiltersFromCondition,
  type ConditionFilter,
  type CustomCriterionCondition,
  type NativeCustomFilterCriterion,
} from "@mrnote/core/web/lib/spreadsheet/filter-conditions.ts";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { excelMinDateSerial } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** What a column mostly holds, which names its sort items and its filter menu. */
export type SpreadsheetFilterColumnKind = "text" | "number" | "date";

const SORT_LABEL_KEYS: Record<
  SpreadsheetFilterColumnKind,
  { readonly asc: string; readonly desc: string }
> = {
  text: {
    asc: "spreadsheet.filterSortTextAsc",
    desc: "spreadsheet.filterSortTextDesc",
  },
  number: {
    asc: "spreadsheet.filterSortNumberAsc",
    desc: "spreadsheet.filterSortNumberDesc",
  },
  date: {
    asc: "spreadsheet.filterSortDateAsc",
    desc: "spreadsheet.filterSortDateDesc",
  },
};

const FILTERS_LABEL_KEYS: Record<SpreadsheetFilterColumnKind, string> = {
  text: "spreadsheet.filterTextFilters",
  number: "spreadsheet.filterNumberFilters",
  date: "spreadsheet.filterDateFilters",
};

/**
 * One operator line of the Custom AutoFilter dialog. `native` is the OOXML
 * `customFilter/@operator`; `wrap` is the `*` the operator adds around the
 * typed pattern, "" meaning "pass the pattern through".
 */
interface CustomOperator {
  readonly id: string;
  readonly labelKey: string;
  readonly native: "equal" | "notEqual" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual";
  readonly wrap: "" | "prefix" | "suffix" | "both";
}

const op = (
  id: string,
  labelKey: string,
  native: CustomOperator["native"],
  wrap: CustomOperator["wrap"] = "",
): CustomOperator => ({ id, labelKey, native, wrap });

/**
 * Excel's Custom AutoFilter operator list, in its order. Every line offers all
 * twelve whatever the column holds: a comparison against a number compares
 * numbers, against text it orders the text of text cells.
 */
const CUSTOM_OPERATORS: readonly CustomOperator[] = [
  op("equals", "spreadsheet.filterCondEquals", "equal"),
  op("not-equals", "spreadsheet.filterCondNotEquals", "notEqual"),
  op("greater-than", "spreadsheet.filterCondGreaterThan", "greaterThan"),
  op("greater-or-equal", "spreadsheet.filterCondGreaterOrEqual", "greaterThanOrEqual"),
  op("less-than", "spreadsheet.filterCondLessThan", "lessThan"),
  op("less-or-equal", "spreadsheet.filterCondLessOrEqual", "lessThanOrEqual"),
  op("begins-with", "spreadsheet.filterCondBeginsWith", "equal", "prefix"),
  op("does-not-begin-with", "spreadsheet.filterCondNotBeginsWith", "notEqual", "prefix"),
  op("ends-with", "spreadsheet.filterCondEndsWith", "equal", "suffix"),
  op("does-not-end-with", "spreadsheet.filterCondNotEndsWith", "notEqual", "suffix"),
  op("contains", "spreadsheet.filterCondContains", "equal", "both"),
  op("does-not-contain", "spreadsheet.filterCondNotContains", "notEqual", "both"),
];

const customOperator = (id: string) =>
  CUSTOM_OPERATORS.find((operator) => operator.id === id)!;

/** Excel's 文本筛选 ▸ items, each opening the dialog seeded with it. */
const TEXT_CUSTOM_OPERATORS: readonly CustomOperator[] = [
  "equals",
  "not-equals",
  "begins-with",
  "ends-with",
  "contains",
  "does-not-contain",
].map(customOperator);

/** Excel's 数字筛选 ▸ items, each opening the dialog seeded with it. */
const NUMBER_CUSTOM_OPERATORS: readonly CustomOperator[] = [
  "equals",
  "not-equals",
  "greater-than",
  "greater-or-equal",
  "less-than",
  "less-or-equal",
].map(customOperator);

/**
 * The operators a Custom AutoFilter line offers: Excel's twelve, in its order,
 * for a text, number or date column alike.
 */
export function customAutoFilterOperators(
  kind: SpreadsheetFilterColumnKind,
): readonly CustomOperator[] {
  void kind;
  return CUSTOM_OPERATORS;
}

/**
 * The typed value is the wildcard pattern the dialog's hint promises (`?` one
 * character, `*` any run, `~` before either to mean it literally), exactly as
 * Excel writes it into the workbook; the operator only wraps it.
 */
function nativeCustomFilterValue(operator: CustomOperator, raw: string): string {
  const pattern = raw.trim();
  if (operator.wrap === "prefix") return `${pattern}*`;
  if (operator.wrap === "suffix") return `*${pattern}`;
  if (operator.wrap === "both") return `*${pattern}*`;
  return pattern;
}

/** One line of the dialog: an operator and the value typed beside it. */
export interface CustomAutoFilterLine {
  readonly operator: CustomOperator;
  readonly value: string;
}

/**
 * The value a line writes. A line the operator does not wrap reads what was
 * typed the way a cell entry does, so "1,000", "50%" or a date are the number
 * they mean on any comparison and against a number or date column; an
 * equality on a text column keeps the text exactly as typed.
 */
function nativeLineValue(
  line: CustomAutoFilterLine,
  options: { kind?: SpreadsheetFilterColumnKind; locale?: string; date1904?: ExcelDateSystemArg },
): string {
  const typed = nativeCustomFilterValue(line.operator, line.value);
  if (line.operator.wrap !== "" || typed === "" || /[*?~]/.test(typed)) {
    return typed;
  }
  const comparison =
    line.operator.native !== "equal" && line.operator.native !== "notEqual";
  if (!comparison && (options.kind ?? "text") === "text") return typed;
  // A date is the serial of the workbook's own date system (S-129: a 1904
  // workbook's dates were compared with their 1900 serials and none matched).
  const entry = parseSpreadsheetEntry(typed, {
    locale: options.locale ?? "en-US",
    date1904: options.date1904,
  });
  return entry.kind === "number" ? entry.value : typed;
}

/**
 * The canonical condition a Custom AutoFilter form describes, or null when no
 * line has a value or a line is not one Excel writes. Both lines go through
 * the native grammar so this agrees with what an imported workbook of the
 * same criteria would produce. A lone second line is the whole criterion.
 */
export function customAutoFilterCondition(
  form: {
    readonly first: CustomAutoFilterLine;
    readonly second?: CustomAutoFilterLine | null;
    readonly and: boolean;
  },
  options: { kind?: SpreadsheetFilterColumnKind; locale?: string; date1904?: ExcelDateSystemArg } = {},
): ConditionFilter | null {
  const lines = [form.first, form.second].filter(
    (line): line is CustomAutoFilterLine =>
      Boolean(line && line.value.trim() !== ""),
  );
  if (lines.length === 0) return null;
  return conditionFilterFromNativeAutoFilter({
    kind: "custom",
    and: form.and,
    filters: lines.map((line) => ({
      operator: line.operator.native,
      value: nativeLineValue(line, options),
    })),
  });
}

/** Whether the pattern's last `*` is a wildcard, not a `~*` literal. */
function endsWithWildcard(value: string): boolean {
  if (!value.endsWith("*")) return false;
  let tildes = 0;
  for (
    let index = value.length - 2;
    index >= 0 && value[index] === "~";
    index -= 1
  ) {
    tildes += 1;
  }
  return tildes % 2 === 0;
}

/**
 * How a stored `<customFilter>` reads back as a dialog line: the `*` an
 * operator adds is taken off again and names the operator (`x*` begins with,
 * `*x` ends with, `*x*` contains, each negated under notEqual); every other
 * pattern is the value of equals / does not equal exactly as written.
 */
function dialogLineFromNative(filter: NativeCustomFilterCriterion): {
  operatorId: string;
  value: string;
} {
  const comparisons: Record<string, string> = {
    greaterThan: "greater-than",
    greaterThanOrEqual: "greater-or-equal",
    lessThan: "less-than",
    lessThanOrEqual: "less-or-equal",
  };
  if (comparisons[filter.operator]) {
    return { operatorId: comparisons[filter.operator], value: filter.value };
  }
  const equal = filter.operator !== "notEqual";
  const value = filter.value;
  const leading = value.length > 1 && value.startsWith("*");
  const trailing = value.length > 1 && endsWithWildcard(value);
  if (leading && trailing && value.length > 2) {
    return {
      operatorId: equal ? "contains" : "does-not-contain",
      value: value.slice(1, -1),
    };
  }
  if (trailing && !leading) {
    return {
      operatorId: equal ? "begins-with" : "does-not-begin-with",
      value: value.slice(0, -1),
    };
  }
  if (leading && !trailing) {
    return {
      operatorId: equal ? "ends-with" : "does-not-end-with",
      value: value.slice(1),
    };
  }
  return { operatorId: equal ? "equals" : "not-equals", value };
}

/** A whole date serial as the ISO date a dialog line reads back as that date. */
export function customAutoFilterDateText(value: number, date1904: ExcelDateSystemArg = false): string {
  // Serial 0 is a date of the 1904 system (1904-01-01), not of the 1900 one.
  if (!Number.isInteger(value) || value < excelMinDateSerial(date1904)) return String(value);
  const { year, month, day } = excelSystemSerialToParts(value, date1904);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface CustomAutoFilterForm {
  readonly first: { readonly operatorId: string; readonly value: string };
  readonly second: { readonly operatorId: string; readonly value: string } | null;
  readonly and: boolean;
}

/**
 * The dialog lines a saved condition reads as, so reopening Custom AutoFilter
 * shows the column's criteria, as Excel's does. Null for a criterion the
 * dialog does not author (Top 10, above / below average). A number on a date
 * column shows as its date.
 */
export function customAutoFilterFormFromCondition(
  condition: ConditionFilter | null | undefined,
  kind: SpreadsheetFilterColumnKind = "text",
  date1904: ExcelDateSystemArg = false,
): CustomAutoFilterForm | null {
  if (!condition) return null;
  let members: CustomCriterionCondition[] = [];
  if (condition.type === "compound") {
    members = [...condition.conditions];
  } else if (condition.type === "number" && condition.operator === "between") {
    const lo = condition.operands[0] ?? 0;
    const hi = condition.operands[1] ?? 0;
    members = [
      { type: "number", operator: "greater-or-equal", operands: [Math.min(lo, hi)] },
      { type: "number", operator: "less-or-equal", operands: [Math.max(lo, hi)] },
    ];
  } else if (isCustomCriterionCondition(condition)) {
    members = [condition];
  }
  if (members.length === 0) return null;
  const lines = members.map((member) => {
    const native = nativeCustomFiltersFromCondition(member)?.filters[0];
    if (!native) return null;
    const line = dialogLineFromNative(native);
    return member.type === "number" && kind === "date"
      ? { ...line, value: customAutoFilterDateText(member.operands[0] ?? 0, date1904) }
      : line;
  });
  const [first, second] = lines;
  if (!first || (lines.length > 1 && !second)) return null;
  return {
    first,
    second: second ?? null,
    and: condition.type === "compound" ? condition.join === "and" : true,
  };
}

const ITEM_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  width: "100%",
  minHeight: 28,
  padding: "3px 6px",
  border: 0,
  borderRadius: 4,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
  textAlign: "left" as const,
};

const SUBMENU_SUMMARY_STYLE = {
  display: "flex",
  minHeight: 28,
  alignItems: "center",
  gap: 7,
  padding: "3px 6px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  listStyle: "none" as const,
};

const SUBMENU_BODY_STYLE = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 2,
  padding: "2px 6px 6px 29px",
};

/**
 * Excel's "数字筛选 ▸ / 文本筛选 ▸ / 日期筛选 ▸" submenu for one column kind.
 * Every "…" item raises the Custom AutoFilter dialog seeded with its operator;
 * 前 10 项, 高于/低于平均值 and the relative-date items are whole criteria and
 * commit straight away.
 */
function TypedFilterSubmenu({
  col,
  kind,
  t,
  onCondition,
  onCustom,
  onRelativeDate,
  relativeDatesAvailable,
}: {
  col: number;
  kind: SpreadsheetFilterColumnKind;
  t: (key: string, values?: Record<string, string | number>) => string;
  onCondition: (condition: ConditionFilter) => void;
  onCustom: (operatorId: string) => void;
  onRelativeDate: (period: DataTableRelativeDatePeriod) => void;
  relativeDatesAvailable: boolean;
}): ReactElement {
  const seeded = (operator: CustomOperator) => (
    <button
      key={operator.id}
      type="button"
      role="menuitem"
      onClick={() => onCustom(operator.id)}
      data-testid={`spreadsheet-filter-typed-item-${col}`}
      data-operator={operator.id}
      style={ITEM_STYLE}
    >
      {t("spreadsheet.filterEllipsisItem", { item: t(operator.labelKey) })}
    </button>
  );
  // 介于… is one dialog item with both bounds seeded, in Excel's number AND
  // date submenus.
  const betweenItem = (
    <button
      type="button"
      role="menuitem"
      onClick={() => onCustom("between")}
      data-testid={`spreadsheet-filter-typed-item-${col}`}
      data-operator="between"
      style={ITEM_STYLE}
    >
      {t("spreadsheet.filterEllipsisItem", {
        item: t("spreadsheet.filterCondBetween"),
      })}
    </button>
  );
  const immediate = (
    id: string,
    label: string,
    condition: ConditionFilter,
  ): ReactElement => (
    <button
      key={id}
      type="button"
      role="menuitem"
      onClick={() => onCondition(condition)}
      data-testid={`spreadsheet-filter-typed-item-${col}`}
      data-operator={id}
      style={ITEM_STYLE}
    >
      {label}
    </button>
  );
  return (
    <details data-testid={`spreadsheet-filter-typed-${col}`} data-kind={kind}>
      <summary role="menuitem" style={SUBMENU_SUMMARY_STYLE}>
        <SpreadsheetDataIcon name="filter" size={16} />
        <span style={{ flex: 1 }}>{t(FILTERS_LABEL_KEYS[kind])}</span>
        <OfficeSemanticIcon semanticId="menu.chevron.down" size={11} />
      </summary>
      <div
        role="menu"
        aria-label={t(FILTERS_LABEL_KEYS[kind])}
        style={SUBMENU_BODY_STYLE}
      >
        {kind === "date" ? (
          <>
            {/* Excel's date submenu leads with the relative periods it can
                answer without a value, then the comparisons. */}
            {relativeDatesAvailable
              ? DATA_TABLE_RELATIVE_DATE_PERIODS.map((period) => (
                  <button
                    key={period}
                    type="button"
                    role="menuitem"
                    onClick={() => onRelativeDate(period)}
                    data-testid={`spreadsheet-filter-typed-item-${col}`}
                    data-operator={`period:${period}`}
                    style={ITEM_STYLE}
                  >
                    {t(`spreadsheet.conditionalPeriod_${period}`)}
                  </button>
                ))
              : null}
            {NUMBER_CUSTOM_OPERATORS.filter((operator) =>
              ["equals", "not-equals", "less-than", "greater-than"].includes(
                operator.id,
              ),
            ).map(seeded)}
            {betweenItem}
          </>
        ) : kind === "number" ? (
          <>
            {NUMBER_CUSTOM_OPERATORS.map(seeded)}
            {betweenItem}
            {/* Excel's 前 10 项… is a DIALOG (Top/Bottom × N × Items/Percent),
                not a fixed top-ten command. */}
            <button
              type="button"
              role="menuitem"
              onClick={() => onCustom("top10")}
              data-testid={`spreadsheet-filter-typed-item-${col}`}
              data-operator="top10"
              style={ITEM_STYLE}
            >
              {t("spreadsheet.filterEllipsisItem", {
                item: t("spreadsheet.filterTop10"),
              })}
            </button>
            {immediate(
              "above-average",
              t("spreadsheet.filterCondAboveAverage"),
              { type: "number", operator: "above-average", operands: [] },
            )}
            {immediate(
              "below-average",
              t("spreadsheet.filterCondBelowAverage"),
              { type: "number", operator: "below-average", operands: [] },
            )}
          </>
        ) : (
          TEXT_CUSTOM_OPERATORS.map(seeded)
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => onCustom("custom")}
          data-testid={`spreadsheet-filter-custom-open-${col}`}
          style={ITEM_STYLE}
        >
          {t("spreadsheet.filterEllipsisItem", {
            item: t("spreadsheet.filterCustomFilter"),
          })}
        </button>
      </div>
    </details>
  );
}

/**
 * Excel's command list above an AutoFilter dropdown's search box. The colour
 * sort, colour filter and icon filter sections are supplied by the host as
 * children of their submenus, because they are drawn from the exact colour and
 * icon authority the dropdown already resolved for the column.
 */
export function SpreadsheetFilterCommands({
  col,
  columnKind,
  columnHeader,
  hasFilter,
  allowSort = true,
  sortBlockedReason = null,
  onSortAscending,
  onSortDescending,
  sortColorSection,
  colorFilterSection,
  onClearColumnFilter,
  onCondition,
  onCustom,
  onRelativeDate,
  relativeDatesAvailable = false,
  t,
}: {
  col: number;
  columnKind: SpreadsheetFilterColumnKind;
  /** The column's header text, named by Excel's "Clear Filter From ..." item. */
  columnHeader: string;
  hasFilter: boolean;
  allowSort?: boolean;
  sortBlockedReason?: string | null;
  onSortAscending: () => void;
  onSortDescending: () => void;
  /** The 按颜色排序 ▸ body, or null when the column has no colours or icons. */
  sortColorSection?: ReactNode;
  /** The 按颜色筛选 ▸ body, or null when the column has no colours or icons. */
  colorFilterSection?: ReactNode;
  onClearColumnFilter: () => void;
  onCondition: (condition: ConditionFilter) => void;
  onCustom: (operatorId: string) => void;
  onRelativeDate: (period: DataTableRelativeDatePeriod) => void;
  relativeDatesAvailable?: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const sortLabels = SORT_LABEL_KEYS[columnKind];
  return (
    <div
      role="group"
      aria-label={t("spreadsheet.sortFilterRibbon")}
      data-testid={`spreadsheet-filter-commands-${col}`}
      style={{
        display: "grid",
        gap: 2,
        // The menu's scroll column must grow with an opened 数字筛选 ▸ list: a
        // shrunk box left its last rows (前 10 项…, 自定义筛选…) painted past
        
        flexShrink: 0,
        paddingBottom: 6,
        borderBottom: "1px solid var(--border, #e5e7eb)",
      }}
    >
      {allowSort ? (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={onSortAscending}
            disabled={Boolean(sortBlockedReason)}
            aria-label={
              sortBlockedReason
                ? `${t(sortLabels.asc)}: ${sortBlockedReason}`
                : t(sortLabels.asc)
            }
            title={sortBlockedReason ?? undefined}
            data-control-id="XLSCTL.SHEET.AUTOFILTER.SORT_ASC"
            data-testid={`spreadsheet-filter-sort-asc-${col}`}
            style={ITEM_STYLE}
          >
            <SpreadsheetDataIcon name="sortAscending" size={16} />
            {t(sortLabels.asc)}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onSortDescending}
            disabled={Boolean(sortBlockedReason)}
            aria-label={
              sortBlockedReason
                ? `${t(sortLabels.desc)}: ${sortBlockedReason}`
                : t(sortLabels.desc)
            }
            title={sortBlockedReason ?? undefined}
            data-control-id="XLSCTL.SHEET.AUTOFILTER.SORT_DESC"
            data-testid={`spreadsheet-filter-sort-desc-${col}`}
            style={ITEM_STYLE}
          >
            <SpreadsheetDataIcon name="sortDescending" size={16} />
            {t(sortLabels.desc)}
          </button>
          {/* Excel always lists Sort by Color and Filter by Color, dimmed
              while the column has no colours (XLS-A104). */}
          {sortColorSection ? (
            <details data-testid={`spreadsheet-filter-sort-color-${col}`}>
              <summary
                role="menuitem"
                data-control-id="XLSCTL.SHEET.AUTOFILTER.SORT_COLOR"
                style={SUBMENU_SUMMARY_STYLE}
              >
                <OfficeSemanticIcon semanticId="shape.fill" size={16} />
                <span style={{ flex: 1 }}>{t("spreadsheet.filterMenuSortByColor")}</span>
                <OfficeSemanticIcon semanticId="menu.chevron.down" size={11} />
              </summary>
              <div
                role="menu"
                aria-label={t("spreadsheet.filterMenuSortByColor")}
                style={SUBMENU_BODY_STYLE}
              >
                {sortColorSection}
              </div>
            </details>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled
              data-control-id="XLSCTL.SHEET.AUTOFILTER.SORT_COLOR"
              data-testid={`spreadsheet-filter-sort-color-none-${col}`}
              style={{ ...ITEM_STYLE, cursor: "not-allowed", opacity: 0.5 }}
            >
              <OfficeSemanticIcon semanticId="shape.fill" size={16} />
              {t("spreadsheet.filterMenuSortByColor")}
            </button>
          )}
        </>
      ) : null}
      {/* Excel dims this while the column carries no criteria of its own, and
          names the column in the item itself. */}
      <button
        type="button"
        role="menuitem"
        onClick={onClearColumnFilter}
        disabled={!hasFilter}
        aria-label={t("spreadsheet.filterClearFromColumn", {
          column: columnHeader,
        })}
        data-control-id="XLSCTL.SHEET.AUTOFILTER.CLEAR_COLUMN"
        data-testid={`spreadsheet-filter-clear-column-${col}`}
        style={{
          ...ITEM_STYLE,
          cursor: hasFilter ? "pointer" : "not-allowed",
          opacity: hasFilter ? 1 : 0.5,
        }}
      >
        <OfficeSemanticIcon semanticId="edit.close" size={15} />
        {t("spreadsheet.filterClearFromColumn", { column: columnHeader })}
      </button>
      {colorFilterSection ? (
        <details data-testid={`spreadsheet-filter-by-color-${col}`}>
          <summary role="menuitem" style={SUBMENU_SUMMARY_STYLE}>
            <OfficeSemanticIcon semanticId="shape.fill" size={16} />
            <span style={{ flex: 1 }}>{t("spreadsheet.filterByColor")}</span>
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={11} />
          </summary>
          <div
            role="menu"
            aria-label={t("spreadsheet.filterByColor")}
            style={SUBMENU_BODY_STYLE}
          >
            {colorFilterSection}
          </div>
        </details>
      ) : (
        <button
          type="button"
          role="menuitem"
          disabled
          data-testid={`spreadsheet-filter-by-color-none-${col}`}
          style={{ ...ITEM_STYLE, cursor: "not-allowed", opacity: 0.5 }}
        >
          <OfficeSemanticIcon semanticId="shape.fill" size={16} />
          {t("spreadsheet.filterByColor")}
        </button>
      )}
      <TypedFilterSubmenu
        col={col}
        kind={columnKind}
        t={t}
        onCondition={onCondition}
        onCustom={onCustom}
        onRelativeDate={onRelativeDate}
        relativeDatesAvailable={relativeDatesAvailable}
      />
    </div>
  );
}

/** The Top 10 and Custom AutoFilter pages open inside the filter dropdown
 * itself, so they take the Office dialog chrome's fields and buttons without
 * drawing a second card inside the dropdown's own. */
const EMBEDDED_DIALOG_CLASS = `${officeDialogClassName({ tone: "spreadsheet" })} office-dialog--embedded`;

/**
 * Excel's 自动筛选前 10 个 dialog, which the 前 10 项… item opens: a direction
 * (最大 / 最小), a count, and a unit (项 / 百分比). The four combinations are the
 * four ranked operators OOXML's `top10` element carries, so the criterion is
 * built through the same native reader as every other filter here — including
 * its own bounds (1..255 items, 0..100 percent), which keep 确定 disabled rather
 * than committing a rank Excel would not write.
 */
export function SpreadsheetTop10AutoFilterDialog({
  col,
  onApply,
  onCancel,
  t,
}: {
  col: number;
  onApply: (condition: ConditionFilter) => void;
  onCancel: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const [top, setTop] = useState(true);
  const [percent, setPercent] = useState(false);
  const [count, setCount] = useState("10");
  const condition = useMemo(() => {
    const value = count.trim() === "" ? Number.NaN : Number(count);
    return Number.isFinite(value)
      ? conditionFilterFromNativeAutoFilter({
          kind: "top10",
          top,
          percent,
          value,
        })
      : null;
  }, [count, percent, top]);
  const choice = (
    testId: string,
    value: string,
    onChange: (next: string) => void,
    options: ReadonlyArray<{ value: string; label: string }>,
  ) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      data-testid={testId}
      style={{ flex: 1 }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("spreadsheet.filterTop10DialogTitle")}
      data-testid={`spreadsheet-filter-top10-dialog-${col}`}
      className={EMBEDDED_DIALOG_CLASS}
    >
      <div className={dialogParts.sectionTitle}>
        {t("spreadsheet.filterTop10ShowRows")}
      </div>
      <div className={dialogParts.row} style={{ flexWrap: "nowrap", gap: 6 }}>
        {choice(
          `spreadsheet-filter-top10-direction-${col}`,
          top ? "top" : "bottom",
          (next) => setTop(next === "top"),
          [
            { value: "top", label: t("spreadsheet.filterTop10Top") },
            { value: "bottom", label: t("spreadsheet.filterTop10Bottom") },
          ],
        )}
        <input
          type="number"
          min={percent ? 0 : 1}
          max={percent ? 100 : 255}
          step={percent ? "any" : 1}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          aria-label={t("spreadsheet.filterTop10ShowRows")}
          data-testid={`spreadsheet-filter-top10-count-${col}`}
          style={{ flex: 1, minWidth: 0 }}
        />
        {choice(
          `spreadsheet-filter-top10-unit-${col}`,
          percent ? "percent" : "items",
          (next) => setPercent(next === "percent"),
          [
            { value: "items", label: t("spreadsheet.filterTop10Items") },
            { value: "percent", label: t("spreadsheet.filterTop10Percent") },
          ],
        )}
      </div>
      <div className={dialogParts.footer}>
        <button
          type="button"
          onClick={onCancel}
          data-testid={`spreadsheet-filter-top10-cancel-${col}`}
          className={dialogParts.button}
        >
          {t("spreadsheet.fmtCancel")}
        </button>
        <button
          type="button"
          onClick={() => condition && onApply(condition)}
          disabled={condition === null}
          data-testid={`spreadsheet-filter-top10-ok-${col}`}
          className={dialogParts.primaryButton}
        >
          {t("spreadsheet.fmtOk")}
        </button>
      </div>
    </div>
  );
}

/**
 * Excel's 自定义自动筛选方式 dialog: "Show rows where: <column>", two
 * operator/value lines joined by 与 or 或, over the wildcard hint. 确定 commits
 * the canonical condition the lines describe. Opened from "Custom Filter…" it
 * shows the column's saved criteria; opened from one operator's "…" item it
 * starts that operator (keeping the saved lines when they begin with it).
 */
export function SpreadsheetCustomAutoFilterDialog({
  col,
  columnKind,
  columnHeader,
  seedOperatorId,
  initialCondition = null,
  valueOptions = [],
  locale,
  date1904 = false,
  onApply,
  onCancel,
  t,
}: {
  col: number;
  columnKind: SpreadsheetFilterColumnKind;
  columnHeader: string;
  /** The submenu item that opened it; "between" seeds Excel's 介于 pair. */
  seedOperatorId: string;
  /** The column's current condition, which the lines start from. */
  initialCondition?: ConditionFilter | null;
  /** The column's values, offered beside each value box as Excel's list is. */
  valueOptions?: readonly string[];
  /** The UI locale typed numbers and dates are read in. */
  locale?: string;
  /** The workbook's dates count from 1904 (a typed date is that serial). */
  date1904?: ExcelDateSystemArg;
  onApply: (condition: ConditionFilter) => void;
  onCancel: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const operators = customAutoFilterOperators(columnKind);
  const [initial] = useState(() => {
    const saved = customAutoFilterFormFromCondition(initialCondition, columnKind, date1904);
    const blank = { operatorId: "equals", value: "" };
    if (seedOperatorId === "between") {
      return saved &&
        saved.and &&
        saved.first.operatorId === "greater-or-equal" &&
        saved.second?.operatorId === "less-or-equal"
        ? saved
        : {
            first: { operatorId: "greater-or-equal", value: "" },
            second: { operatorId: "less-or-equal", value: "" },
            and: true,
          };
    }
    const seeded = operators.some((operator) => operator.id === seedOperatorId);
    if (saved && (!seeded || saved.first.operatorId === seedOperatorId)) {
      return saved;
    }
    return {
      first: { operatorId: seeded ? seedOperatorId : operators[0].id, value: "" },
      second: blank,
      and: true,
    };
  });
  const [firstOperatorId, setFirstOperatorId] = useState(initial.first.operatorId);
  const [firstValue, setFirstValue] = useState(initial.first.value);
  const [secondOperatorId, setSecondOperatorId] = useState(
    initial.second?.operatorId ?? operators[0].id,
  );
  const [secondValue, setSecondValue] = useState(initial.second?.value ?? "");
  const [and, setAnd] = useState(initial.and);

  const operatorById = (id: string) =>
    operators.find((operator) => operator.id === id) ?? operators[0];
  const condition = useMemo(
    () =>
      customAutoFilterCondition(
        {
          first: { operator: operatorById(firstOperatorId), value: firstValue },
          second: {
            operator: operatorById(secondOperatorId),
            value: secondValue,
          },
          and,
        },
        { kind: columnKind, locale, date1904 },
      ),
    // operatorById is a pure lookup over the constant operator list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [and, columnKind, date1904, firstOperatorId, firstValue, locale, secondOperatorId, secondValue],
  );
  // Why 确定 is disabled when a value is there: a line no Excel operator
  // spells (an over-long value). An empty form simply has nothing to apply.
  const unsupportedReason =
    condition !== null ||
    (firstValue.trim() === "" && secondValue.trim() === "")
      ? null
      : t("spreadsheet.filterCustomLineInvalid");

  // Excel lists the column's own values under each value box.
  const listId = `spreadsheet-filter-custom-values-${col}`;
  const suggestions = useMemo(
    () =>
      Array.from(new Set(valueOptions.filter((value) => value !== "")))
        .slice(0, 500),
    [valueOptions],
  );

  const operatorSelect = (
    value: string,
    onChange: (next: string) => void,
    testId: string,
    label: string,
  ) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      data-testid={testId}
      style={{ flex: "1 1 50%", minWidth: 0 }}
    >
      {operators.map((operator) => (
        <option key={operator.id} value={operator.id}>
          {t(operator.labelKey)}
        </option>
      ))}
    </select>
  );
  const valueInput = (
    value: string,
    onChange: (next: string) => void,
    testId: string,
  ) => (
    <input
      type="text"
      value={value}
      maxLength={255}
      list={suggestions.length > 0 ? listId : undefined}
      onChange={(event) => onChange(event.target.value)}
      aria-label={t("spreadsheet.filterCondValuePlaceholder")}
      data-testid={testId}
      style={{ flex: "1 1 50%", minWidth: 0 }}
    />
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("spreadsheet.filterCustomDialogTitle")}
      data-testid={`spreadsheet-filter-custom-dialog-${col}`}
      className={EMBEDDED_DIALOG_CLASS}
    >
      <div className={dialogParts.sectionTitle}>
        {t("spreadsheet.filterCustomShowRowsWhere", { column: columnHeader })}
      </div>
      <div className={dialogParts.row} style={{ flexWrap: "nowrap", gap: 6 }}>
        {operatorSelect(
          firstOperatorId,
          setFirstOperatorId,
          `spreadsheet-filter-custom-op1-${col}`,
          t("spreadsheet.filterCustomFirstCriterion"),
        )}
        {valueInput(
          firstValue,
          setFirstValue,
          `spreadsheet-filter-custom-value1-${col}`,
        )}
      </div>
      <div
        className={dialogParts.row}
        role="radiogroup"
        aria-label={t("spreadsheet.filterCustomJoin")}
        style={{ gap: 12 }}
      >
        <label className={dialogParts.check}>
          <input
            type="radio"
            name={`spreadsheet-filter-custom-join-${col}`}
            checked={and}
            onChange={() => setAnd(true)}
            data-testid={`spreadsheet-filter-custom-and-${col}`}
          />
          {t("spreadsheet.filterCustomAnd")}
        </label>
        <label className={dialogParts.check}>
          <input
            type="radio"
            name={`spreadsheet-filter-custom-join-${col}`}
            checked={!and}
            onChange={() => setAnd(false)}
            data-testid={`spreadsheet-filter-custom-or-${col}`}
          />
          {t("spreadsheet.filterCustomOr")}
        </label>
      </div>
      <div className={dialogParts.row} style={{ flexWrap: "nowrap", gap: 6 }}>
        {operatorSelect(
          secondOperatorId,
          setSecondOperatorId,
          `spreadsheet-filter-custom-op2-${col}`,
          t("spreadsheet.filterCustomSecondCriterion"),
        )}
        {valueInput(
          secondValue,
          setSecondValue,
          `spreadsheet-filter-custom-value2-${col}`,
        )}
      </div>
      {suggestions.length > 0 ? (
        <datalist id={listId} data-testid={listId}>
          {suggestions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      ) : null}
      <div className={dialogParts.hint}>
        <div>{t("spreadsheet.filterCustomWildcardHintSingle")}</div>
        <div>{t("spreadsheet.filterCustomWildcardHintSeries")}</div>
      </div>
      {unsupportedReason ? (
        <div
          role="status"
          data-testid={`spreadsheet-filter-custom-unsupported-${col}`}
          className={dialogParts.error}
        >
          {unsupportedReason}
        </div>
      ) : null}
      <div className={dialogParts.footer}>
        <button
          type="button"
          onClick={onCancel}
          data-testid={`spreadsheet-filter-custom-cancel-${col}`}
          className={dialogParts.button}
        >
          {t("spreadsheet.fmtCancel")}
        </button>
        <button
          type="button"
          onClick={() => condition && onApply(condition)}
          disabled={condition === null}
          title={unsupportedReason ?? undefined}
          data-testid={`spreadsheet-filter-custom-ok-${col}`}
          className={dialogParts.primaryButton}
        >
          {t("spreadsheet.fmtOk")}
        </button>
      </div>
    </div>
  );
}
