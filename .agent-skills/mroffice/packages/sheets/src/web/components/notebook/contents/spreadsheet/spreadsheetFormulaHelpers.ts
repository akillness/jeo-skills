/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type WorksheetFormulaCoordinate } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import { isFormulaError, formatCellValue, type CellValue, type WorkbookSheetInput, type WarmStartFormula } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { columnLabel } from "./spreadsheetRangeA1";

/**
 * Build the {@link WorkbookSheetInput} for ONE sheet of the cross-sheet
 * workbook: its raw-cell reader (merge-covered cells read blank, exactly like
 * the single-sheet evaluator) plus the per-TARGET-sheet evaluator options that
 * are PURE functions of the persisted model — named ranges and group-hidden
 * rows. This is what lets `Sheet2!A1` honor Sheet2's OWN named ranges and
 * outline collapse, not the active sheet's.
 *
 * Deliberately NOT wired here: a non-active sheet's AutoFilter-hidden rows
 * (`isRowHiddenByFilter`). Computing those needs a bootstrap evaluator pass per
 * sheet, and they only affect SUBTOTAL's visibility — a cross-sheet SUBTOTAL
 * reading another sheet's AutoFilter is a rare corner. The ACTIVE sheet still
 * gets its filter-hidden rows wired (overlaidActiveOptions), so the on-screen
 * sheet is unaffected; this only bounds the SUBTOTAL-visibility fidelity of a
 * formula that reaches INTO a different, filtered sheet.
 */
/**
 * Every formula the engine will see, read through the SAME getRawCell the
 * workbook is built on (so merge-covered cells read as empty exactly as they
 * evaluate). Only cells present in a sheet's map can hold a formula — the
 * readers never synthesize "=..." text for absent keys. Null past the cap.
 */
const WARM_RECALC_MAX_CELLS = 100_000;
function enumerateWorkbookFormulas(
  candidates: ReadonlyArray<SheetModel>,
  inputs: ReadonlyArray<WorkbookSheetInput>,
): WarmStartFormula[] | null {
  const formulas: WarmStartFormula[] = [];
  let visited = 0;
  for (let i = 0; i < inputs.length; i += 1) {
    const candidate = candidates[i];
    const input = inputs[i];
    if (!candidate || !input) return null;
    for (const key of Object.keys(candidate.cells)) {
      visited += 1;
      if (visited > WARM_RECALC_MAX_CELLS) return null;
      const colon = key.indexOf(":");
      const row = Number(key.slice(0, colon));
      const col = Number(key.slice(colon + 1));
      if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
      const raw = input.getRawCell(row, col);
      if (raw && raw.trim().startsWith("=")) {
        formulas.push({ sheet: input.name, row, col, formula: raw });
      }
    }
  }
  return formulas;
}

export function worksheetCalculationDescriptors(
  candidates: ReadonlyArray<SheetModel>,
) {
  return candidates.map((candidate) => ({
    id: candidate.id,
    name:
      typeof candidate.name === "string" && candidate.name.trim() !== ""
        ? candidate.name
        : candidate.id,
    rowCount: candidate.rowCount,
    columnCount: candidate.columnCount,
  }));
}

/** Two worksheet records holding the same values field by field (a history
 * step may copy a sheet it restores; a field set to undefined is absent). */
function sameWorksheetFields(left: SheetModel, right: SheetModel): boolean {
  if (left === right) return true;
  const a = left as unknown as Record<string, unknown>;
  const b = right as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * The one worksheet an Undo or Redo changes, when that is all it changes: the
 * same worksheets in the same order under the same names, exactly one of them
 * holding different values. For the calculation that is a content edit of that
 * sheet, like the edit it reverses (null otherwise: a structural change).
 */
export function worksheetHistoryContentSheetId(
  live: ReadonlyArray<SheetModel>,
  restored: ReadonlyArray<SheetModel>,
): string | null {
  if (live.length !== restored.length) return null;
  const liveDescriptors = worksheetCalculationDescriptors(live);
  const restoredDescriptors = worksheetCalculationDescriptors(restored);
  let changed: string | null = null;
  for (let index = 0; index < live.length; index += 1) {
    const before = liveDescriptors[index];
    const after = restoredDescriptors[index];
    if (before.id !== after.id || before.name !== after.name) return null;
    if (sameWorksheetFields(live[index], restored[index])) continue;
    if (changed !== null) return null;
    changed = after.id;
  }
  return changed;
}

/**
 * The coordinates worked out for `before`, when no cell of `after` came to hold a
 * formula or stopped holding one: a new value, a format, a formula rewritten. A
 * walk over every cell of the workbook per commit would find what it found last
 * time. Undefined when that cannot be told.
 */
export function formulaCoordinatesAfterEdit(
  before: { readonly sheets: ReadonlyArray<SheetModel>; readonly coordinates: WorksheetFormulaCoordinate[] | null },
  after: ReadonlyArray<SheetModel>,
  changedKeys: (after: SheetModel["cells"], before: SheetModel["cells"]) => readonly string[] | null,
): WorksheetFormulaCoordinate[] | null | undefined {
  if (before.sheets.length !== after.length) return undefined;
  for (let index = 0; index < after.length; index += 1) {
    const was = before.sheets[index] as unknown as Record<string, unknown>;
    const now = after[index] as unknown as Record<string, unknown>;
    if (was === now) continue;
    if (now.cells !== was.cells) {
      const cellsBefore = before.sheets[index].cells;
      const cellsAfter = after[index].cells;
      const keys = changedKeys(cellsAfter, cellsBefore);
      if (!keys) return undefined;
      for (const key of keys) if (holdsFormula(cellsBefore[key]) !== holdsFormula(cellsAfter[key])) return undefined;
    }
    const keys = Object.keys(now);
    if (keys.length !== Object.keys(was).length) return undefined;
    for (const key of keys) if (key !== "cells" && !Object.is(now[key], was[key])) return undefined;
  }
  return before.coordinates;
}

function holdsFormula(cell: SheetModel["cells"][string] | undefined): boolean {
  return Boolean(cell?.formula) || (typeof cell?.value === "string" && cell.value.trim().startsWith("="));
}

export function worksheetCalculationFormulaCoordinates(
  candidates: ReadonlyArray<SheetModel>,
  inputs: ReadonlyArray<WorkbookSheetInput>,
): WorksheetFormulaCoordinate[] | null {
  const formulas = enumerateWorkbookFormulas(candidates, inputs);
  if (!formulas) return null;
  const sheetByName = new Map(
    candidates.map((candidate) => [
      (candidate.name || candidate.id).toLowerCase(),
      candidate,
    ]),
  );
  const coordinates: WorksheetFormulaCoordinate[] = [];
  for (const formula of formulas) {
    const candidate = sheetByName.get(formula.sheet.toLowerCase());
    if (!candidate) return null;
    coordinates.push({
      sheetId: candidate.id,
      sheetName: formula.sheet,
      row: formula.row,
      col: formula.col,
    });
  }
  return coordinates;
}

/**
 * The readout Excel draws to the right of an argument box in Function
 * Arguments: `= 89`, `= "Li Na"`, `= {"Wang Wei",1234.56;…}` (Microsoft
 * Support, "Function Arguments": each argument is listed "along with a box to
 * enter your value or range and the data type expected"). Text is quoted so a
 * number and the text of a number are told apart, and an array is drawn in
 * Excel's own row/column braces, truncated so one wide range cannot push the
 * dialog out of shape.
 */
const FUNCTION_ARGUMENT_GRID_PREVIEW = 3;

export function functionArgumentValueText(value: CellValue): string {
  if (isFormulaError(value)) return value.code;
  if (value === null) return "";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return formatCellValue(value);
}

export function functionArgumentGridText(grid: readonly (readonly CellValue[])[]): string {
  const clipped =
    grid.length > FUNCTION_ARGUMENT_GRID_PREVIEW ||
    grid.some((row) => row.length > FUNCTION_ARGUMENT_GRID_PREVIEW);
  const rows = grid
    .slice(0, FUNCTION_ARGUMENT_GRID_PREVIEW)
    .map((row) =>
      row
        .slice(0, FUNCTION_ARGUMENT_GRID_PREVIEW)
        .map(functionArgumentValueText)
        .join(","),
    );
  return `{${rows.join(";")}${clipped ? ";…" : ""}}`;
}

/** A bare multi-cell A1 range, the argument Excel draws as an array. */
export const FUNCTION_ARGUMENT_RANGE_RE =
  /^\$?([A-Za-z]{1,3})\$?(\d{1,7}):\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

/** "A1" or "A1:C4": the relative reference Excel writes into an argument box. */
export function spreadsheetRelativeRangeRef(rect: {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}): string {
  const from = `${columnLabel(rect.c1)}${rect.r1 + 1}`;
  if (rect.r1 === rect.r2 && rect.c1 === rect.c2) return from;
  return `${from}:${columnLabel(rect.c2)}${rect.r2 + 1}`;
}

/** The Function Arguments values with slot `index` set to `value`; an index
 * outside the current slots leaves the list (and its identity) unchanged. */
export function withFunctionArgumentValue(
  values: string[],
  index: number,
  value: string,
): string[] {
  if (index < 0 || index >= values.length) return values;
  const next = [...values];
  next[index] = value;
  return next;
}
