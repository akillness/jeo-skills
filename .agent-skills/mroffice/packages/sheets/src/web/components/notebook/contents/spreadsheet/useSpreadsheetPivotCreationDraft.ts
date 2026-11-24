"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { NEW_PIVOT_LAYOUT_DEFAULTS } from "../../../../lib/spreadsheet/pivot-buttons";
import { useCallback } from "react";
import { type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { normalizePivotRange, type PivotConfig, buildDefaultPivotConfig, newPivotValueField, type PivotAgg, type PivotRange } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotCreationDraft, type PivotCreationFieldArea } from "./spreadsheetMutationReceipts";
import { type PivotSourceSnapshot } from "../../../../lib/spreadsheet/pivot-buttons";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetPivotCreationDraft reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetPivotCreationDraftInputs {
  dataTables: DataTable[];
  pivotConfigWithSafeOutput: (base: PivotConfig, matrix: string[][], requestedOutput?: string) => PivotConfig | null;
  pivotSelectionSnapshot: (range: PivotRange) => PivotSourceSnapshot | null;
  /** What the dialog says under a source entry it cannot summarise (null:
   * the entry is no range at all). */
  pivotSourceIssue: (range: PivotRange | null) => string;
  setPivotCreationDraft: Dispatch<SetStateAction<PivotCreationDraft | null>>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetPivotCreationDraft({
  dataTables,
  pivotConfigWithSafeOutput,
  pivotSelectionSnapshot,
  pivotSourceIssue,
  setPivotCreationDraft,
}: SpreadsheetPivotCreationDraftInputs) {
  const updatePivotCreationSource = useCallback(
    (rawSource: string) => {
      setPivotCreationDraft((current) => {
        if (!current) return current;
        // The box takes a range or the name of a table on this sheet (the
        // name is tried first: "Tab1" also parses as a far-away cell).
        const wantedTable = rawSource.trim().toLocaleLowerCase();
        const namedTables = dataTables.filter(
          (table) =>
            table.headerRow &&
            table.name.trim().toLocaleLowerCase() === wantedTable,
        );
        const sourceTable = namedTables.length === 1 ? namedTables[0] : null;
        const range = sourceTable
          ? sourceTable.range
          : normalizePivotRange(rawSource);
        const snapshot = range ? pivotSelectionSnapshot(range) : null;
        // An unusable entry stops naming a table, so the draft's recipe cannot
        // stand in for the text (pivotCreationSourceA1). The fields and rows
        // the draft holds are of the last range it could read, not of this
        // entry: the dialog says why the entry cannot be summarised and shows
        // no preview of them (a 60,001-row entry over a 6,000-row draft used
        // to preview, and offer OK on, the 6,000 rows).
        const unresolved = (): PivotCreationDraft => {
          const config: PivotConfig = { ...current.config };
          delete config.sourceTableId;
          return {
            ...current,
            sourceDraft: rawSource,
            sourceIssue: pivotSourceIssue(range),
            config,
          };
        };
        if (!snapshot || snapshot.dataRowCount === 0) {
          return unresolved();
        }
        const base: PivotConfig = {
          ...buildDefaultPivotConfig(snapshot.fields, snapshot.source),
          ...NEW_PIVOT_LAYOUT_DEFAULTS,
          ...(sourceTable ? { sourceTableId: sourceTable.id } : {}),
        };
        const next =
          pivotConfigWithSafeOutput(
            base,
            snapshot.matrix,
            current.outputDraft,
          ) ?? pivotConfigWithSafeOutput(base, snapshot.matrix);
        // A source read whole is the draft's from now on, whether or not its
        // layout has a free place on this sheet yet: the place is checked
        // where the dialog resolves its recipe (pivotCreationResolvedConfig),
        // which offers no preview or OK while there is none. Keeping the
        // earlier entry's rows instead previewed them under the new entry.
        return {
          ...current,
          sheetId: snapshot.sheetId,
          sourceDraft: sourceTable ? sourceTable.name : snapshot.sourceRef,
          sourceIssue: null,
          outputDraft: next?.output ?? current.outputDraft,
          matrix: snapshot.matrix.map((row) => [...row]),
          scalarMatrix: snapshot.scalarMatrix.map((row) =>
            row.map((value) => ({ ...value })),
          ),
          fields: snapshot.fields.map((field) => ({ ...field })),
          config: next ?? base,
        };
      });
    },
    [dataTables, pivotConfigWithSafeOutput, pivotSelectionSnapshot, pivotSourceIssue],
  );

  const setPivotCreationFieldArea = useCallback(
    (colIndex: number, area: PivotCreationFieldArea) => {
      setPivotCreationDraft((current) => {
        if (!current) return current;
        const field = current.fields.find(
          (candidate) => candidate.columnIndex === colIndex,
        );
        if (!field) return current;
        const config: PivotConfig = {
          ...current.config,
          rows: current.config.rows.filter((value) => value !== colIndex),
          columns: current.config.columns.filter(
            (value) => value !== colIndex,
          ),
          values: current.config.values.filter(
            (value) => value.colIndex !== colIndex,
          ),
          filters: current.config.filters.filter(
            (value) => value.colIndex !== colIndex,
          ),
        };
        if (area === "rows") config.rows = [...config.rows, colIndex];
        else if (area === "columns") {
          config.columns = [...config.columns, colIndex];
        } else if (area === "values") {
          config.values = [...config.values, newPivotValueField(colIndex, field)];
        } else if (area === "filters") {
          config.filters = [...config.filters, { colIndex, selected: [] }];
        }
        const safe =
          pivotConfigWithSafeOutput(
            config,
            current.matrix,
            current.outputDraft,
          ) ?? pivotConfigWithSafeOutput(config, current.matrix);
        return safe?.output
          ? { ...current, config: safe, outputDraft: safe.output }
          : { ...current, config };
      });
    },
    [pivotConfigWithSafeOutput],
  );

  const setPivotCreationValueAgg = useCallback(
    (colIndex: number, agg: PivotAgg) => {
      setPivotCreationDraft((current) =>
        current
          ? {
              ...current,
              config: {
                ...current.config,
                values: current.config.values.map((value) =>
                  value.colIndex === colIndex ? { ...value, agg } : value,
                ),
              },
            }
          : current,
      );
    },
    [],
  );

  const reorderPivotCreationArea = useCallback(
    (
      area: Exclude<PivotCreationFieldArea, "none">,
      index: number,
      direction: -1 | 1,
    ) => {
      setPivotCreationDraft((current) => {
        if (!current) return current;
        const values = [...current.config[area]];
        const target = index + direction;
        if (index < 0 || index >= values.length || target < 0 || target >= values.length) {
          return current;
        }
        [values[index], values[target]] = [values[target], values[index]];
        return {
          ...current,
          config: { ...current.config, [area]: values },
        };
      });
    },
    [],
  );
  return {
    reorderPivotCreationArea,
    setPivotCreationFieldArea,
    setPivotCreationValueAgg,
    updatePivotCreationSource,
  };
}
