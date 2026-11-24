"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { buildSpillOverlay, resolveCellDisplay } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { type ConsolidateSourceParseResult, parseConsolidateSource } from "../../../../lib/spreadsheet/consolidate-buttons";
import { pivotNativeScalarFromLiveCell } from "../../../../lib/spreadsheet/pivot-buttons";
import { type RefObject } from "react";
import { type SheetEvaluator, type EngineValue, type WorkbookSheetInput } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { coveredCells, normalizeMerges } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { sheetPivotAt, type PivotNativeScalarMatrix, type PivotNativeScalar, pivotNativeScalarDisplay, profilePivotFieldsFromRange, pivotRangeToA1, type PivotConfig, refreshPivotNativeSnapshot, createPivotCacheSnapshot, type PivotRange, type PivotMatrix } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotChartReport } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { sheetRefPrefix } from "@mrnote/core/web/lib/spreadsheet/paste-special.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type PivotContextWriterControlId, type PivotSourceDialogAuthority, type PageSetupSelectionSnapshot } from "./spreadsheetMutationReceipts";
import { pivotSourceTableByName } from "./spreadsheetWindowHelpers";
import { type Workbook } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type PivotOutputPlan } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type Dispatch, type SetStateAction } from "react";

/** What spreadsheetApplyPivotSourceDialog reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetApplyPivotSourceDialogInputs {
  activePivotSlotRef: RefObject<number>;
  executePivotContextMutation: (controlId: PivotContextWriterControlId, nextPivot: PivotConfig | null, moveDestination?: "existing" | "new") => Promise<boolean>;
  formulaWorkbook: { evaluator: SheetEvaluator; evaluatorFor: (sheetName: string) => SheetEvaluator; workbook: Workbook; memoSnapshot: () => ReadonlyMap<string, EngineValue>; pivotPlans: Map<string, PivotOutputPlan>; pivotNativeFootprints: Map<string, PivotRange[]>; pivotChartReports: Map<string, PivotChartReport>; pivotChartMatrices: Map<string, PivotMatrix>; inputs: WorkbookSheetInput[]; pivotSheetIds: string[]; };
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  pivotConfigWithSafeOutput: (base: PivotConfig, matrix: string[][], requestedOutput?: string) => PivotConfig | null;
  pivotLiveSourceSheet: SheetModel | null;
  pivotOrChartContextActive: boolean;
  pivotPanelOpen: boolean;
  pivotSourceDialog: { authority: PivotSourceDialogAuthority; source: string; error: "invalid" | "incompatible" | "stale" | null; } | null;
  readPageSetupSelectionSnapshot: () => PageSetupSelectionSnapshot | null;
  setPivotSourceDialog: Dispatch<SetStateAction<{ authority: PivotSourceDialogAuthority; source: string; error: "invalid" | "incompatible" | "stale" | null; } | null>>;
  setPivotSourceDraft: Dispatch<SetStateAction<string>>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetApplyPivotSourceDialog({
  activePivotSlotRef,
  executePivotContextMutation,
  formulaWorkbook,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  pivotConfigWithSafeOutput,
  pivotLiveSourceSheet,
  pivotOrChartContextActive,
  pivotPanelOpen,
  pivotSourceDialog,
  readPageSetupSelectionSnapshot,
  setPivotSourceDialog,
  setPivotSourceDraft,
}: SpreadsheetApplyPivotSourceDialogInputs) {
  const applyPivotSourceDialog = (): Promise<boolean> => {
    const draft = pivotSourceDialog;
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    const liveSelection = readPageSetupSelectionSnapshot();
    const livePivot = sheetPivotAt(liveSheet, activePivotSlotRef.current);
    const authority = draft?.authority;
    const selectionMatches = Boolean(
      authority &&
        liveSelection &&
        liveSelection.epoch === authority.selection.epoch &&
        liveSelection.active.row === authority.selection.active.row &&
        liveSelection.active.col === authority.selection.active.col &&
        liveSelection.range.r1 === authority.selection.range.r1 &&
        liveSelection.range.r2 === authority.selection.range.r2 &&
        liveSelection.range.c1 === authority.selection.range.c1 &&
        liveSelection.range.c2 === authority.selection.range.c2,
    );
    if (
      !draft ||
      !authority ||
      !liveSheet ||
      !livePivot ||
      authority.workbook !== liveWorkbook ||
      authority.activeSheetIndex !== liveIndex ||
      authority.sheet !== liveSheet ||
      authority.sheetId !== liveSheet.id ||
      authority.pivot !== livePivot ||
      authority.sourceSheet !== pivotLiveSourceSheet ||
      authority.sourceSheetId !== pivotLiveSourceSheet?.id ||
      authority.sourceCells !== pivotLiveSourceSheet?.cells ||
      !selectionMatches ||
      (!pivotOrChartContextActive && !pivotPanelOpen)
    ) {
      setPivotSourceDialog((current) =>
        current ? { ...current, error: "stale" } : current,
      );
      return Promise.resolve(false);
    }
    // The box takes a table's name as well as a range (the name first:
    // "Tab1" also parses as a cell).
    const namedSource = pivotSourceTableByName(liveWorkbook, draft.source);
    const parsedSource: ConsolidateSourceParseResult = namedSource
      ? { kind: "ok", range: { ...namedSource.table.range } }
      : parseConsolidateSource(draft.source);
    const requestedSourceSheet = namedSource
      ? namedSource.sheet
      : parsedSource.kind === "ok" && parsedSource.sheetName
        ? (() => {
            const wanted = parsedSource.sheetName.trim().toLocaleLowerCase();
            const matches = liveWorkbook.filter(
              (candidate) =>
                (candidate.name || candidate.id).trim().toLocaleLowerCase() ===
                wanted,
            );
            return matches.length === 1 ? matches[0] : null;
          })()
        : parsedSource.kind === "ok"
          ? liveSheet
          : null;
    if (
      parsedSource.kind !== "ok" ||
      !requestedSourceSheet ||
      parsedSource.range.r1 < 0 ||
      parsedSource.range.c1 < 0 ||
      parsedSource.range.r2 >= requestedSourceSheet.rowCount ||
      parsedSource.range.c2 >= requestedSourceSheet.columnCount ||
      parsedSource.range.r2 <= parsedSource.range.r1
    ) {
      setPivotSourceDialog((current) =>
        current ? { ...current, error: "invalid" } : current,
      );
      return Promise.resolve(false);
    }
    const requestedEvaluator = formulaWorkbook.evaluatorFor(
      requestedSourceSheet.name || requestedSourceSheet.id,
    );
    const requestedCovered = coveredCells(
      normalizeMerges(requestedSourceSheet.merges),
    );
    const requestedSpill = buildSpillOverlay(
      requestedSourceSheet.cells,
      requestedCovered,
      requestedEvaluator,
    );
    const matrix: string[][] = [];
    const scalarMatrix: PivotNativeScalarMatrix = [];
    for (let row = parsedSource.range.r1; row <= parsedSource.range.r2; row += 1) {
      const values: string[] = [];
      const scalars: PivotNativeScalar[] = [];
      for (
        let column = parsedSource.range.c1;
        column <= parsedSource.range.c2;
        column += 1
      ) {
        const cell = requestedSourceSheet.cells[`${row}:${column}`];
        const scalar =
          row === parsedSource.range.r1
            ? {
                kind: "s" as const,
                raw: resolveCellDisplay(
                  cell,
                  row,
                  column,
                  requestedEvaluator,
                  requestedSpill,
                ),
              }
            : pivotNativeScalarFromLiveCell(
                cell,
                row,
                column,
                requestedEvaluator,
                requestedSpill,
              );
        scalars.push(scalar);
        values.push(pivotNativeScalarDisplay(scalar));
      }
      matrix.push(values);
      scalarMatrix.push(scalars);
    }
    const profile = profilePivotFieldsFromRange(matrix, scalarMatrix);
    if (profile.dataRowCount === 0) {
      setPivotSourceDialog((current) =>
        current ? { ...current, error: "invalid" } : current,
      );
      return Promise.resolve(false);
    }
    const snapshot = {
      source: pivotRangeToA1(parsedSource.range),
      matrix,
      scalarMatrix,
      fields: profile.fields,
    };
    const referencedFields = [
      ...livePivot.rows,
      ...livePivot.columns,
      ...livePivot.values.map((field) => field.colIndex),
      ...livePivot.filters.map((field) => field.colIndex),
      ...livePivot.grouping.map((field) => field.colIndex),
    ].filter((index) => Number.isInteger(index) && index >= 0);
    if (
      referencedFields.some((index) => index >= snapshot.fields.length)
    ) {
      setPivotSourceDialog((current) =>
        current ? { ...current, error: "incompatible" } : current,
      );
      return Promise.resolve(false);
    }

    let nextPivot: PivotConfig | null = null;
    if (livePivot.native) {
      const refreshed = refreshPivotNativeSnapshot(
        livePivot,
        snapshot.matrix,
        snapshot.scalarMatrix,
      );
      if (refreshed) {
        // An imported report names its source sheet by the file's name; a
        // source on another sheet (or a table) is named as the page names
        // any source, by id, and the save writes the cache's new
        // worksheetSource from it.
        const basePivot: PivotConfig = { ...refreshed };
        delete basePivot.sourceSheetId;
        delete basePivot.sourceTableId;
        nextPivot = {
          ...basePivot,
          source: snapshot.source,
          ...(requestedSourceSheet.name !== livePivot.native.sourceSheetName
            ? { sourceSheetId: requestedSourceSheet.id }
            : {}),
          ...(namedSource ? { sourceTableId: namedSource.table.id } : {}),
        };
      }
    } else {
      const cacheSnapshot = createPivotCacheSnapshot(
        snapshot.fields,
        snapshot.matrix,
        snapshot.scalarMatrix,
      );
      if (cacheSnapshot) {
        const basePivot: PivotConfig = { ...livePivot };
        delete basePivot.sourceSheetId;
        delete basePivot.sourceTableId;
        nextPivot = {
          ...basePivot,
          source: snapshot.source,
          ...(requestedSourceSheet !== liveSheet
            ? { sourceSheetId: requestedSourceSheet.id }
            : {}),
          ...(namedSource ? { sourceTableId: namedSource.table.id } : {}),
          cacheSnapshot,
        };
      }
    }
    const safePivot = nextPivot
      ? pivotConfigWithSafeOutput(
          nextPivot,
          snapshot.matrix,
          nextPivot.output,
        )
      : null;
    if (!safePivot) {
      setPivotSourceDialog((current) =>
        current ? { ...current, error: "incompatible" } : current,
      );
      return Promise.resolve(false);
    }
    return executePivotContextMutation(
      "XLSCTL.CONTEXT.PIVOT.CHANGE_SOURCE.MRAI.APPLY",
      safePivot,
    ).then((executed) => {
      if (executed) {
        setPivotSourceDraft(
          namedSource
            ? namedSource.table.name
            : requestedSourceSheet === liveSheet
              ? snapshot.source
              : `${sheetRefPrefix(
                  requestedSourceSheet.name || requestedSourceSheet.id,
                )}${snapshot.source}`,
        );
        setPivotSourceDialog(null);
      } else {
        setPivotSourceDialog((current) =>
          current ? { ...current, error: "stale" } : current,
        );
      }
      return executed;
    });
  };
  return {
    applyPivotSourceDialog,
  };
}
