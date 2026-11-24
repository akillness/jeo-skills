"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback } from "react";
import { GripVertical, ChevronUp, ChevronDown, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import { newPivotValueField, type PivotConfig, type PivotValueField, valueFieldLabel, type PivotFieldProfile } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotFieldAreaName } from "./spreadsheetMutationReceipts";

/** What useSpreadsheetPivotFieldAreas reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetPivotFieldAreasInputs {
  commitPivot: (rawConfig: PivotConfig | null) => void;
  locale: string;
  pivotBase: () => PivotConfig;
  pivotFieldLabel: (colIndex: number) => string;
  pivotFieldProfileByIndex: Map<number, PivotFieldProfile>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetPivotFieldAreas({
  commitPivot,
  locale,
  pivotBase,
  pivotFieldLabel,
  pivotFieldProfileByIndex,
  t,
}: SpreadsheetPivotFieldAreasInputs) {
  const addPivotFieldToArea = useCallback(
    (colIndex: number, targetArea: PivotFieldAreaName) => {
      const base = pivotBase();
      if (targetArea === "values") {
        if (base.values.some((value) => value.colIndex === colIndex)) return;
        commitPivot({
          ...base,
          values: [
            ...base.values,
            newPivotValueField(colIndex, pivotFieldProfileByIndex.get(colIndex)),
          ],
        });
        return;
      }
      const rows = base.rows.filter((value) => value !== colIndex);
      const columns = base.columns.filter((value) => value !== colIndex);
      const filters = base.filters.filter(
        (value) => value.colIndex !== colIndex,
      );
      if (targetArea === "rows") rows.push(colIndex);
      else if (targetArea === "columns") columns.push(colIndex);
      else filters.push({ colIndex, selected: [] });
      commitPivot({
        ...base,
        rows,
        columns,
        filters,
        grouping: base.grouping.filter(
          (group) =>
            rows.includes(group.colIndex) || columns.includes(group.colIndex),
        ),
      });
    },
    [commitPivot, pivotBase, pivotFieldProfileByIndex],
  );

  const movePivotFieldArea = useCallback(
    (
      sourceArea: PivotFieldAreaName,
      sourceIndex: number,
      targetArea: PivotFieldAreaName,
      targetIndex?: number,
    ) => {
      const base = pivotBase();
      if (sourceArea === targetArea) {
        const length = base[sourceArea].length;
        const destination = Math.min(
          Math.max(targetIndex ?? length - 1, 0),
          Math.max(length - 1, 0),
        );
        if (
          sourceIndex < 0 ||
          sourceIndex >= length ||
          sourceIndex === destination
        ) {
          return;
        }
        const reordered = [...base[sourceArea]];
        const [item] = reordered.splice(sourceIndex, 1);
        reordered.splice(destination, 0, item);
        if (sourceArea === "rows") {
          commitPivot({ ...base, rows: reordered as number[] });
        } else if (sourceArea === "columns") {
          commitPivot({ ...base, columns: reordered as number[] });
        } else if (sourceArea === "values") {
          commitPivot({
            ...base,
            values: reordered as PivotConfig["values"],
          });
        } else {
          commitPivot({
            ...base,
            filters: reordered as PivotConfig["filters"],
          });
        }
        return;
      }
      const rows = [...base.rows];
      const columns = [...base.columns];
      const values = base.values.map((value) => ({ ...value }));
      const filters = base.filters.map((filter) => ({
        ...filter,
        selected: [...filter.selected],
      }));
      let colIndex: number | null = null;
      let movedValue: PivotValueField | null = null;
      let movedFilter: PivotConfig["filters"][number] | null = null;
      if (sourceArea === "rows") {
        colIndex = rows.splice(sourceIndex, 1)[0] ?? null;
      } else if (sourceArea === "columns") {
        colIndex = columns.splice(sourceIndex, 1)[0] ?? null;
      } else if (sourceArea === "values") {
        movedValue = values.splice(sourceIndex, 1)[0] ?? null;
        colIndex = movedValue?.colIndex ?? null;
      } else {
        movedFilter = filters.splice(sourceIndex, 1)[0] ?? null;
        colIndex = movedFilter?.colIndex ?? null;
      }
      if (colIndex === null) return;

      const insertAt = <T,>(items: T[], item: T) => {
        const index = Math.min(Math.max(targetIndex ?? items.length, 0), items.length);
        items.splice(index, 0, item);
      };
      if (targetArea === "rows") {
        const withoutDuplicate = rows.filter((value) => value !== colIndex);
        columns.splice(0, columns.length, ...columns.filter((value) => value !== colIndex));
        filters.splice(0, filters.length, ...filters.filter((value) => value.colIndex !== colIndex));
        rows.splice(0, rows.length, ...withoutDuplicate);
        insertAt(rows, colIndex);
      } else if (targetArea === "columns") {
        const withoutDuplicate = columns.filter((value) => value !== colIndex);
        rows.splice(0, rows.length, ...rows.filter((value) => value !== colIndex));
        filters.splice(0, filters.length, ...filters.filter((value) => value.colIndex !== colIndex));
        columns.splice(0, columns.length, ...withoutDuplicate);
        insertAt(columns, colIndex);
      } else if (targetArea === "filters") {
        const withoutDuplicate = filters.filter(
          (value) => value.colIndex !== colIndex,
        );
        rows.splice(0, rows.length, ...rows.filter((value) => value !== colIndex));
        columns.splice(0, columns.length, ...columns.filter((value) => value !== colIndex));
        filters.splice(0, filters.length, ...withoutDuplicate);
        insertAt(filters, movedFilter ?? { colIndex, selected: [] });
      } else {
        insertAt(
          values,
          movedValue ??
            newPivotValueField(colIndex, pivotFieldProfileByIndex.get(colIndex)),
        );
      }
      const axisColumns = new Set([...rows, ...columns]);
      commitPivot({
        ...base,
        rows,
        columns,
        values,
        filters,
        grouping: base.grouping.filter((group) =>
          axisColumns.has(group.colIndex),
        ),
      });
    },
    [commitPivot, pivotBase, pivotFieldProfileByIndex],
  );

  const removePivotFieldFromArea = useCallback(
    (area: PivotFieldAreaName, index: number) => {
      const base = pivotBase();
      if (area === "rows") {
        const colIndex = base.rows[index];
        if (colIndex === undefined) return;
        commitPivot({
          ...base,
          rows: base.rows.filter((_, itemIndex) => itemIndex !== index),
          grouping: base.grouping.filter(
            (group) => group.colIndex !== colIndex,
          ),
        });
      } else if (area === "columns") {
        const colIndex = base.columns[index];
        if (colIndex === undefined) return;
        commitPivot({
          ...base,
          columns: base.columns.filter((_, itemIndex) => itemIndex !== index),
          grouping: base.grouping.filter(
            (group) => group.colIndex !== colIndex,
          ),
        });
      } else if (area === "values") {
        if (!base.values[index]) return;
        commitPivot({
          ...base,
          values: base.values.filter((_, itemIndex) => itemIndex !== index),
        });
      } else {
        if (!base.filters[index]) return;
        commitPivot({
          ...base,
          filters: base.filters.filter((_, itemIndex) => itemIndex !== index),
        });
      }
    },
    [commitPivot, pivotBase],
  );

  const duplicatePivotValueField = useCallback(
    (colIndex: number) => {
      const base = pivotBase();
      const existing = base.values.find((value) => value.colIndex === colIndex);
      if (!existing || base.values.length >= 8) return;
      const { caption: _caption, ...duplicate } = existing;
      void _caption;
      const generatedCaption = valueFieldLabel(
        duplicate,
        pivotFieldLabel(duplicate.colIndex),
      );
      const usedCaptions = new Set(
        base.values.map((value) =>
          valueFieldLabel(value, pivotFieldLabel(value.colIndex)).toLocaleLowerCase(
            locale,
          ),
        ),
      );
      let duplicateCaption = generatedCaption;
      for (let ordinal = 2; usedCaptions.has(
        duplicateCaption.toLocaleLowerCase(locale),
      ); ordinal += 1) {
        duplicateCaption = `${generatedCaption} ${ordinal}`;
      }
      commitPivot({
        ...base,
        values: [
          ...base.values,
          {
            ...duplicate,
            ...(duplicateCaption === generatedCaption
              ? {}
              : { caption: duplicateCaption }),
            ...(existing.showAs
              ? {
                  showAs: {
                    ...existing.showAs,
                    ...(existing.showAs.base
                      ? { base: { ...existing.showAs.base } }
                      : {}),
                  },
                }
              : {}),
          },
        ],
      });
    },
    [commitPivot, locale, pivotBase, pivotFieldLabel],
  );

  const reorderPivotFieldArea = useCallback(
    (
      area: "rows" | "columns" | "values" | "filters",
      fromIndex: number,
      toIndex: number,
    ) => {
      const base = pivotBase();
      const length = base[area].length;
      if (
        fromIndex < 0 ||
        fromIndex >= length ||
        toIndex < 0 ||
        toIndex >= length ||
        fromIndex === toIndex
      ) {
        return;
      }
      function moved<T>(items: readonly T[]): T[] {
        const next = [...items];
        const [item] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, item);
        return next;
      }
      if (area === "rows") commitPivot({ ...base, rows: moved(base.rows) });
      else if (area === "columns") {
        commitPivot({ ...base, columns: moved(base.columns) });
      } else if (area === "values") {
        commitPivot({ ...base, values: moved(base.values) });
      } else {
        commitPivot({ ...base, filters: moved(base.filters) });
      }
    },
    [commitPivot, pivotBase],
  );

  const pivotFieldOrderList = useCallback(
    (
      area: PivotFieldAreaName,
      items: readonly { key: string; label: string; colIndex: number }[],
    ) => {
      if (items.length === 0) return null;
      const dragType = "application/x-mrai-pivot-field-order";
      const areaLabel = (candidate: PivotFieldAreaName) =>
        candidate === "rows"
          ? t("spreadsheet.pivotRows")
          : candidate === "columns"
            ? t("spreadsheet.pivotColumns")
            : candidate === "values"
              ? t("spreadsheet.pivotValues")
              : t("spreadsheet.pivotFilters");
      return (
        <ol
          aria-label={t("spreadsheet.uiCopy.fieldOrder")}
          className={spreadsheetHomeStyles.pivotFieldAreaList}
        >
          {items.map((item, index) => (
            <li
              key={item.key}
              className={spreadsheetHomeStyles.pivotFieldAreaItem}
              data-field-index={item.colIndex}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(dragType, `${area}:${index}`);
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(dragType)) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                const [sourceArea, sourceIndex] = event.dataTransfer
                  .getData(dragType)
                  .split(":");
                if (sourceArea === "catalog") {
                  event.preventDefault();
                  addPivotFieldToArea(Number(sourceIndex), area);
                  return;
                }
                if (
                  !(["rows", "columns", "values", "filters"] as const).includes(
                    sourceArea as PivotFieldAreaName,
                  )
                ) {
                  return;
                }
                event.preventDefault();
                movePivotFieldArea(
                  sourceArea as PivotFieldAreaName,
                  Number(sourceIndex),
                  area,
                  index,
                );
              }}
            >
              <GripVertical aria-hidden="true" size={14} />
              <span className={spreadsheetHomeStyles.pivotFieldAreaItemLabel}>
                {item.label}
              </span>
              <select
                aria-label={
                  t("spreadsheet.dynamicCopy.movePivotField", { field: item.label })
                }
                className={spreadsheetHomeStyles.pivotFieldAreaMove}
                data-testid={`spreadsheet-pivot-field-area-${area}-${index}`}
                value={area}
                onChange={(event) =>
                  movePivotFieldArea(
                    area,
                    index,
                    event.currentTarget.value as PivotFieldAreaName,
                  )
                }
              >
                {(["filters", "columns", "rows", "values"] as const).map(
                  (candidate) => (
                    <option key={candidate} value={candidate}>
                      {areaLabel(candidate)}
                    </option>
                  ),
                )}
              </select>
              <span className={spreadsheetHomeStyles.pivotFieldAreaActions}>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => reorderPivotFieldArea(area, index, index - 1)}
                  aria-label={t("spreadsheet.uiCopy.moveFieldUp")}
                >
                  <ChevronUp aria-hidden="true" size={14} />
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => reorderPivotFieldArea(area, index, index + 1)}
                  aria-label={t("spreadsheet.uiCopy.moveFieldDown")}
                >
                  <ChevronDown aria-hidden="true" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => removePivotFieldFromArea(area, index)}
                  aria-label={t("spreadsheet.uiCopy.removeField")}
                >
                  <X aria-hidden="true" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      );
    },
    [addPivotFieldToArea, movePivotFieldArea, removePivotFieldFromArea, reorderPivotFieldArea, t],
  );
  // Σ Values (two or more value fields): Excel shows it in the Columns area
  // by default and lets it move to the Rows area, after the row fields
  // (Microsoft Support, "Use the Field List to arrange fields in a
  // PivotTable"; X-294c).
  const setPivotValuesOnRows = useCallback(
    (onRows: boolean) => {
      const base = pivotBase();
      if ((base.valuesOnRows === true) === onRows) return;
      const next: PivotConfig = { ...base };
      if (onRows) next.valuesOnRows = true;
      else delete next.valuesOnRows;
      commitPivot(next);
    },
    [commitPivot, pivotBase],
  );
  const pivotValuesFieldItem = useCallback(
    (area: "rows" | "columns", valueCount: number, onRows: boolean) => {
      if (valueCount < 2 || onRows !== (area === "rows")) return null;
      const dragType = "application/x-mrai-pivot-field-order";
      const label = `Σ ${t("spreadsheet.pivotOutput.values")}`;
      return (
        <ol aria-label={t("spreadsheet.uiCopy.fieldOrder")} className={spreadsheetHomeStyles.pivotFieldAreaList}>
          <li
            className={spreadsheetHomeStyles.pivotFieldAreaItem}
            data-testid={`spreadsheet-pivot-values-field-${area}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(dragType, "valuesField:0");
            }}
          >
            <GripVertical aria-hidden="true" size={14} />
            <span className={spreadsheetHomeStyles.pivotFieldAreaItemLabel}>{label}</span>
            <select
              aria-label={t("spreadsheet.dynamicCopy.movePivotField", { field: label })}
              className={spreadsheetHomeStyles.pivotFieldAreaMove}
              data-testid={`spreadsheet-pivot-values-field-area-${area}`}
              value={area}
              onChange={(event) => setPivotValuesOnRows(event.currentTarget.value === "rows")}
            >
              <option value="columns">{t("spreadsheet.pivotColumns")}</option>
              <option value="rows">{t("spreadsheet.pivotRows")}</option>
            </select>
          </li>
        </ol>
      );
    },
    [setPivotValuesOnRows, t],
  );
  return {
    addPivotFieldToArea,
    duplicatePivotValueField,
    movePivotFieldArea,
    pivotFieldOrderList,
    pivotValuesFieldItem,
    setPivotValuesOnRows,
  };
}
