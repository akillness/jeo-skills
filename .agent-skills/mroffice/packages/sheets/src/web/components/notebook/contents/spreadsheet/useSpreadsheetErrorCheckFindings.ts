"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { useRef, useMemo, useCallback } from "react";
import { checkForErrors, errorCheckCellFrom, errorCheckFormulaDisplay, calculatedColumnFormulaAt, ignoredErrorRulesInRanges } from "../../../../lib/spreadsheet/error-checking";
import { disabledErrorCheckRules, readErrorCheckingOptions } from "../../../../lib/spreadsheet/error-checking-options";
import { type SheetEvaluator } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { entryKeepsText } from "@mrnote/core/web/lib/spreadsheet/entry-parse.ts";
import { pickListValues } from "../../../../lib/spreadsheet/pick-list";
import { type SheetModel } from "./spreadsheetSheetModel";

/** What useSpreadsheetErrorCheckFindings reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetErrorCheckFindingsInputs {
  cellDisplayValue: (cell: SpreadsheetCell | undefined, row: number, col: number, editing: boolean, numberFormatOverride?: string) => string;
  errorCheckOpen: boolean;
  formulaEvaluator: SheetEvaluator;
  invalidTableDataAt: (row: number, col: number) => boolean;
  locale: string;
  sheet: SheetModel;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetErrorCheckFindings({
  cellDisplayValue,
  errorCheckOpen,
  formulaEvaluator,
  invalidTableDataAt,
  locale,
  sheet,
}: SpreadsheetErrorCheckFindingsInputs) {
  // Run Excel's worksheet rules against the exact live result authority used
  // by the grid. `cell.display` is only an export cache and may be absent or
  // stale after an ordinary edit; formula errors must therefore resolve via
  // cellDisplayValue. Non-formula literals retain the scanner's existing
  // semantics (a typed "#DIV/0!" is not a failed formula).
  const errorCheckFindingsRef = useRef<{
    sheetId: string;
    findings: ReturnType<typeof checkForErrors>;
  } | null>(null);
  
  const ignoredErrorRanges = (sheet as { ignoredErrorRanges?: unknown }).ignoredErrorRanges;
  const errorCheckFindings = useMemo(() => {
    if (!errorCheckOpen) return [];
    const scanned = Object.entries(sheet.cells).map(([key, cell]) => {
      const [row, col] = key.split(":").map(Number);
      const raw =
        typeof cell?.value === "string"
          ? cell.value
          : String(cell?.value ?? "");
      // Only a real formula owns a computed display. A literal's persisted
      // export cache must never promote it into an error-value finding.
      return errorCheckCellFrom(
        row,
        col,
        cell,
        raw.startsWith("=")
          ? errorCheckFormulaDisplay(
              formulaEvaluator.getComputed(row, col),
              cellDisplayValue({ ...cell, formula: raw }, row, col, false),
            )
          : undefined,
        calculatedColumnFormulaAt(sheet.dataTables, row, col),
        invalidTableDataAt(row, col),
        ignoredErrorRulesInRanges(ignoredErrorRanges, row, col),
      );
    });
    // The same rules the grid's triangles use: the user's Error Checking
    // Options (Excel's defaults until changed), and each cell's Ignore Error
    // choices.
    const findings = checkForErrors(scanned, {
      disabled: disabledErrorCheckRules(readErrorCheckingOptions()),
    });
    const previous = errorCheckFindingsRef.current;
    const unchanged =
      previous?.sheetId === sheet.id &&
      findings.length === previous.findings.length &&
      findings.every((finding, index) => {
        const prior = previous.findings[index];
        return (
          prior?.row === finding.row &&
          prior.col === finding.col &&
          prior.rule === finding.rule &&
          prior.detail === finding.detail
        );
      });
    // ErrorCheckPanel treats a changed finding object as a pointer move and
    // navigates in an effect. Preserve semantic identity across view-only
    // renders on the SAME stable worksheet only. A sheet switch must reset the
    // walk even when both sheets happen to contain identical findings.
    if (unchanged && previous) return previous.findings;
    errorCheckFindingsRef.current = { sheetId: sheet.id, findings };
    return findings;
  }, [cellDisplayValue, errorCheckOpen, formulaEvaluator, invalidTableDataAt, ignoredErrorRanges, sheet.cells, sheet.dataTables, sheet.id]);

  // The distinct existing values for the "Pick From Drop-down List" popover at
  // (row, col): the values already entered in the contiguous block of the same
  // column (resolved display values, so a formula contributes its result). Built
  // from a thin map of only the column's populated cells (sheet.cells is sparse)
  // so it stays cheap even on a tall sheet. Pure scan/dedupe lives in pick-list.
  const pickListOptionsFor = useCallback(
    (row: number, col: number): string[] => {
      const columnCells: Record<string, { value?: string }> = {};
      const suffix = `:${col}`;
      for (const key of Object.keys(sheet.cells)) {
        if (!key.endsWith(suffix)) continue;
        const r = Number(key.slice(0, key.length - suffix.length));
        if (!Number.isInteger(r) || r < 0) continue;
        columnCells[key] = {
          value: cellDisplayValue(sheet.cells[key], r, col, false),
        };
      }
      return pickListValues(columnCells, row, col, sheet.rowCount);
    },
    // cellDisplayValue derives from sheet.cells via formulaEvaluator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet.cells, sheet.rowCount, formulaEvaluator],
  );
  // What picking `option` from that list enters: the value as typed, except
  // that text keeps being text. The list shows text as it reads, so the text
  // "=1+1" or "001" is entered with the quote prefix that keeps it text,
  // never re-read as a formula or number (live audit B251).
  const pickListEntryFor = useCallback(
    (row: number, col: number, option: string): string => {
      const suffix = `:${col}`;
      let text = false;
      for (const key of Object.keys(sheet.cells)) {
        if (!key.endsWith(suffix)) continue;
        const r = Number(key.slice(0, key.length - suffix.length));
        if (!Number.isInteger(r) || r < 0 || r === row) continue;
        if (cellDisplayValue(sheet.cells[key], r, col, false).trim() !== option) continue;
        let computed: unknown;
        try {
          computed = formulaEvaluator.getComputed(r, col);
        } catch {
          computed = null;
        }
        if (typeof computed === "string") {
          text = true;
          break;
        }
      }
      if (!text) return option;
      return entryKeepsText(option, { locale }) ? option : `'${option}`;
    },
    // cellDisplayValue derives from sheet.cells via formulaEvaluator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet.cells, formulaEvaluator, locale],
  );
  return {
    errorCheckFindings,
    pickListEntryFor,
    pickListOptionsFor,
  };
}
