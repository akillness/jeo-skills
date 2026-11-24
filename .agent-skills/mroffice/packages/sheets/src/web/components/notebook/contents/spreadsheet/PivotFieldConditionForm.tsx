/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useState, type ReactElement } from "react";

import {
  officeDialogClassName,
  officeDialogParts as dialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { excelSerialFromYmd, excelSerialToParts } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import {
  pivotFieldFilterKind,
  pivotFieldFilterOperands,
  type PivotFieldFilter,
  type PivotFieldFilterType,
} from "@mrnote/core/web/lib/spreadsheet/pivot-field-filters.ts";

type Translate = (key: string, values?: Record<string, string | number>) => string;
export type PivotFieldConditionFamily = "label" | "date" | "value";
export type PivotFieldConditionDraft = Omit<PivotFieldFilter, "colIndex" | "unit" | "group">;

const LABEL_OPERATORS: ReadonlyArray<[PivotFieldFilterType, string]> = [
  ["captionEqual", "spreadsheet.filterCondEquals"],
  ["captionNotEqual", "spreadsheet.filterCondNotEquals"],
  ["captionBeginsWith", "spreadsheet.filterCondBeginsWith"],
  ["captionNotBeginsWith", "spreadsheet.filterCondNotBeginsWith"],
  ["captionEndsWith", "spreadsheet.filterCondEndsWith"],
  ["captionNotEndsWith", "spreadsheet.filterCondNotEndsWith"],
  ["captionContains", "spreadsheet.filterCondContains"],
  ["captionNotContains", "spreadsheet.filterCondNotContains"],
  ["captionGreaterThan", "spreadsheet.filterCondGreaterThan"],
  ["captionGreaterThanOrEqual", "spreadsheet.filterCondGreaterOrEqual"],
  ["captionLessThan", "spreadsheet.filterCondLessThan"],
  ["captionLessThanOrEqual", "spreadsheet.filterCondLessOrEqual"],
  ["captionBetween", "spreadsheet.filterCondBetween"],
  ["captionNotBetween", "spreadsheet.pivotFilterNotBetween"],
];

const VALUE_OPERATORS: ReadonlyArray<[PivotFieldFilterType, string]> = [
  ["valueEqual", "spreadsheet.filterCondEquals"],
  ["valueNotEqual", "spreadsheet.filterCondNotEquals"],
  ["valueGreaterThan", "spreadsheet.filterCondGreaterThan"],
  ["valueGreaterThanOrEqual", "spreadsheet.filterCondGreaterOrEqual"],
  ["valueLessThan", "spreadsheet.filterCondLessThan"],
  ["valueLessThanOrEqual", "spreadsheet.filterCondLessOrEqual"],
  ["valueBetween", "spreadsheet.filterCondBetween"],
  ["valueNotBetween", "spreadsheet.pivotFilterNotBetween"],
  ["count", "spreadsheet.filterTop10"],
];

// Excel's Date Filters menu: the day comparisons, then the periods.
const DATE_OPERATORS: ReadonlyArray<[PivotFieldFilterType, string]> = [
  ["dateEqual", "spreadsheet.filterCondEquals"],
  ["dateNotEqual", "spreadsheet.filterCondNotEquals"],
  ["dateOlderThan", "spreadsheet.pivotFilterBefore"],
  ["dateOlderThanOrEqual", "spreadsheet.pivotFilterOnOrBefore"],
  ["dateNewerThan", "spreadsheet.pivotFilterAfter"],
  ["dateNewerThanOrEqual", "spreadsheet.pivotFilterOnOrAfter"],
  ["dateBetween", "spreadsheet.filterCondBetween"],
  ["dateNotBetween", "spreadsheet.pivotFilterNotBetween"],
  ["tomorrow", "spreadsheet.conditionalPeriod_tomorrow"],
  ["today", "spreadsheet.conditionalPeriod_today"],
  ["yesterday", "spreadsheet.conditionalPeriod_yesterday"],
  ["nextWeek", "spreadsheet.conditionalPeriod_nextWeek"],
  ["thisWeek", "spreadsheet.conditionalPeriod_thisWeek"],
  ["lastWeek", "spreadsheet.conditionalPeriod_lastWeek"],
  ["nextMonth", "spreadsheet.conditionalPeriod_nextMonth"],
  ["thisMonth", "spreadsheet.conditionalPeriod_thisMonth"],
  ["lastMonth", "spreadsheet.conditionalPeriod_lastMonth"],
];

function serialToDay(value: string | undefined): string {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) return "";
  const parts = excelSerialToParts(Math.floor(serial));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function dayToSerial(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? String(excelSerialFromYmd(+match[1], +match[2], +match[3])) : null;
}

/**
 * The Label / Date / Value filter page a PivotTable field's dropdown opens
 * (Excel's "Label Filters ▸ Begins With…", "Value Filters ▸ Top 10…" dialogs,
 * folded into one): the operator, the value field a Value filter judges by,
 * and the criteria. OK applies the filter, Clear removes the field's filter of
 * this family.
 */
export default function PivotFieldConditionForm({
  family,
  fieldCaption,
  current,
  valueFields,
  testId,
  t,
  onApply,
  onClear,
  onCancel,
}: {
  family: PivotFieldConditionFamily;
  fieldCaption: string;
  current: PivotFieldFilter | undefined;
  valueFields: readonly string[];
  testId: string;
  t: Translate;
  onApply: (filter: PivotFieldConditionDraft) => void;
  onClear: () => void;
  onCancel: () => void;
}): ReactElement {
  const operators = family === "label" ? LABEL_OPERATORS : family === "date" ? DATE_OPERATORS : VALUE_OPERATORS;
  const currentTop = current && pivotFieldFilterKind(current.type) === "top";
  const [type, setType] = useState<PivotFieldFilterType>(
    currentTop ? "count" : current && operators.some(([id]) => id === current.type) ? current.type : operators[0][0],
  );
  const [topBy, setTopBy] = useState<"count" | "percent" | "sum">(
    currentTop ? (current!.type as "count" | "percent" | "sum") : "count",
  );
  const [bottom, setBottom] = useState(current?.bottom === true);
  const [valueIndex, setValueIndex] = useState(current?.valueIndex ?? 0);
  const asInput = (value: string | undefined) => (family === "date" ? serialToDay(value) : value ?? "");
  const [first, setFirst] = useState(asInput(current?.value1) || (type === "count" ? "10" : ""));
  const [second, setSecond] = useState(asInput(current?.value2));
  const isTop = family === "value" && type === "count";
  const operands = isTop ? 1 : pivotFieldFilterOperands(type);

  const draft = useMemo<PivotFieldConditionDraft | null>(() => {
    const read = (text: string): string | null => {
      if (family === "date") return dayToSerial(text);
      if (family === "value") return text.trim() !== "" && Number.isFinite(Number(text)) ? String(Number(text)) : null;
      return text === "" ? null : text;
    };
    const values: string[] = [];
    for (const text of [first, second].slice(0, operands)) {
      const value = read(text);
      if (value === null) return null;
      values.push(value);
    }
    if (isTop && Number(values[0]) <= 0) return null;
    return {
      type: isTop ? topBy : type,
      ...(values[0] !== undefined ? { value1: values[0] } : {}),
      ...(values[1] !== undefined ? { value2: values[1] } : {}),
      ...(family === "value" ? { valueIndex } : {}),
      ...(isTop && bottom ? { bottom: true as const } : {}),
      ...(current?.id !== undefined ? { id: current.id } : {}),
    };
  }, [bottom, current?.id, family, first, isTop, operands, second, topBy, type, valueIndex]);

  const select = (
    id: string,
    value: string,
    onChange: (next: string) => void,
    options: ReadonlyArray<{ value: string; label: string }>,
    label?: string,
  ) => (
    <select
      value={value}
      aria-label={label}
      data-testid={`${testId}-${id}`}
      onChange={(event) => onChange(event.target.value)}
      style={{ flex: 1, minWidth: 0 }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  const input = (id: string, value: string, onChange: (next: string) => void, label: string) => (
    <input
      type={family === "date" ? "date" : "text"}
      inputMode={family === "value" ? "decimal" : undefined}
      value={value}
      aria-label={label}
      data-testid={`${testId}-${id}`}
      onChange={(event) => onChange(event.target.value)}
      style={{ flex: 1, minWidth: 0 }}
    />
  );
  const title =
    family === "label"
      ? t("spreadsheet.pivotLabelFilters")
      : family === "date"
        ? t("spreadsheet.filterDateFilters")
        : t("spreadsheet.pivotValueFilters");

  return (
    <div
      role="dialog"
      aria-label={`${title} (${fieldCaption})`}
      data-testid={testId}
      className={`${officeDialogClassName({ tone: "spreadsheet" })} office-dialog--embedded`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        } else if (event.key === "Enter" && draft) {
          event.preventDefault();
          onApply(draft);
        }
      }}
    >
      <div className={dialogParts.sectionTitle}>{`${title} (${fieldCaption})`}</div>
      {family === "value" ? (
        <div className={dialogParts.row} style={{ flexWrap: "nowrap", gap: 6 }}>
          {select(
            "value-field",
            String(valueIndex),
            (next) => setValueIndex(Number(next)),
            valueFields.map((caption, index) => ({ value: String(index), label: caption })),
            t("spreadsheet.pivotFilterValueField"),
          )}
        </div>
      ) : null}
      <div className={dialogParts.row} style={{ flexWrap: "nowrap", gap: 6 }}>
        {select(
          "operator",
          type,
          (next) => {
            setType(next as PivotFieldFilterType);
            if (next === "count" && first === "") setFirst("10");
          },
          operators.map(([id, key]) => ({ value: id, label: t(key) })),
        )}
      </div>
      {isTop ? (
        <div className={dialogParts.row} style={{ flexWrap: "nowrap", gap: 6 }}>
          {select("direction", bottom ? "bottom" : "top", (next) => setBottom(next === "bottom"), [
            { value: "top", label: t("spreadsheet.filterTop10Top") },
            { value: "bottom", label: t("spreadsheet.filterTop10Bottom") },
          ])}
          {input("first", first, setFirst, t("spreadsheet.filterTop10ShowRows"))}
          {select("unit", topBy, (next) => setTopBy(next as "count" | "percent" | "sum"), [
            { value: "count", label: t("spreadsheet.filterTop10Items") },
            { value: "percent", label: t("spreadsheet.filterTop10Percent") },
            { value: "sum", label: t("spreadsheet.pivotFilterSum") },
          ])}
        </div>
      ) : operands > 0 ? (
        <div className={dialogParts.row} style={{ flexWrap: "nowrap", gap: 6 }}>
          {input("first", first, setFirst, operands === 2 ? t("spreadsheet.filterCondBetweenLo") : t("spreadsheet.filterCondValuePlaceholder"))}
          {operands === 2 ? input("second", second, setSecond, t("spreadsheet.filterCondBetweenHi")) : null}
        </div>
      ) : null}
      {family === "label" ? <div className={dialogParts.hint}>{t("spreadsheet.filterCustomWildcardHint")}</div> : null}
      <div className={dialogParts.footer}>
        {current ? (
          <button type="button" className={dialogParts.button} data-testid={`${testId}-clear`} onClick={onClear}>
            {t("spreadsheet.pivotFilterRemove")}
          </button>
        ) : null}
        <button type="button" className={dialogParts.button} data-testid={`${testId}-cancel`} onClick={onCancel}>
          {t("spreadsheet.fmtCancel")}
        </button>
        <button
          type="button"
          className={dialogParts.primaryButton}
          data-testid={`${testId}-ok`}
          disabled={draft === null}
          onClick={() => draft && onApply(draft)}
        >
          {t("spreadsheet.fmtOk")}
        </button>
      </div>
    </div>
  );
}
