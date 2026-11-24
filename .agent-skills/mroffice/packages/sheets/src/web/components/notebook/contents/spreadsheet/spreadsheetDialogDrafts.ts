/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetSortDialogLevel } from "./SpreadsheetSortDialog";
import { parseCellRef } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type ChartRecommendation } from "../../../../lib/spreadsheet/chart-recommendations";
import { type ValidationOperator } from "@mrnote/core/web/lib/spreadsheet/data-validation.ts";
import { type ShiftDirection } from "../../../../lib/spreadsheet/cell-shift";
import { type TableStyleChoice } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { isNoteComment, type CellComment } from "@mrnote/core/web/lib/spreadsheet/comments.ts";

/** One option of Excel's Insert / Delete dialog. */
export type CellShiftChoice = ShiftDirection | "row" | "col";

/**
 * Excel's Insert and Delete dialogs, in Excel's order: the two shifts, then
 * Entire row and Entire column. Each option runs the Home ▸ Insert / Delete
 * command of the same name, so the dialog adds no second writer.
 */
export const CELL_SHIFT_DIALOG_OPTIONS: Record<
  "insert" | "delete",
  ReadonlyArray<readonly [CellShiftChoice, string, string]>
> = {
  insert: [
    ["right", "spreadsheet.shiftCellsRight", "XLSCTL.HOME.CELLS.INSERT.SHIFT_RIGHT"],
    ["down", "spreadsheet.shiftCellsDown", "XLSCTL.HOME.CELLS.INSERT.SHIFT_DOWN"],
    ["row", "spreadsheet.cellShiftEntireRow", "XLSCTL.HOME.CELLS.INSERT.ROW"],
    ["col", "spreadsheet.cellShiftEntireColumn", "XLSCTL.HOME.CELLS.INSERT.COLUMN"],
  ],
  delete: [
    ["left", "spreadsheet.shiftCellsLeft", "XLSCTL.HOME.CELLS.DELETE.SHIFT_LEFT"],
    ["up", "spreadsheet.shiftCellsUp", "XLSCTL.HOME.CELLS.DELETE.SHIFT_UP"],
    ["row", "spreadsheet.cellShiftEntireRow", "XLSCTL.HOME.CELLS.DELETE.ROW"],
    ["col", "spreadsheet.cellShiftEntireColumn", "XLSCTL.HOME.CELLS.DELETE.COLUMN"],
  ],
};

/**
 * The option the Insert / Delete dialog opens on. Excel picks the shift from
 * the shape of the range (Range.Insert / Range.Delete without Shift): a range
 * taller than it is wide moves sideways, anything else, a single cell
 * included, moves vertically.
 */
export function defaultCellShiftChoice(
  kind: "insert" | "delete",
  range: { r1: number; c1: number; r2: number; c2: number },
): CellShiftChoice {
  const tall = range.r2 - range.r1 > range.c2 - range.c1;
  if (kind === "insert") return tall ? "right" : "down";
  return tall ? "left" : "up";
}

export const MAX_SORT_FORMAT_OPTIONS_PER_KIND = 128;

export function parseSortDialogLine(
  encoded: unknown,
  allowedLines: readonly number[],
): number | null {
  if (typeof encoded !== "string" || encoded.length > 16) return null;
  if (!/^(0|[1-9]\d*)$/.test(encoded)) return null;
  const line = Number(encoded);
  return Number.isSafeInteger(line) && allowedLines.includes(line)
    ? line
    : null;
}

export function parseSortDialogOrder(
  encoded: unknown,
  customLists: readonly (readonly string[])[],
): Pick<SpreadsheetSortDialogLevel, "direction" | "customListIndex"> | null {
  if (typeof encoded !== "string" || encoded.length > 32) return null;
  if (encoded === "asc" || encoded === "desc") {
    return { direction: encoded };
  }
  // "custom:<i>" is a custom list in its own order; "custom:<i>:desc" is the
  // reversed list Excel offers beside it once the list is chosen.
  const match = /^custom:(0|[1-9]\d*)(:desc)?$/.exec(encoded);
  if (!match) return null;
  const index = Number(match[1]);
  const list = customLists[index];
  if (
    !Number.isSafeInteger(index) ||
    !Array.isArray(list) ||
    list.length === 0
  ) {
    return null;
  }
  return { direction: match[2] ? "desc" : "asc", customListIndex: index };
}

export type ValidationDialogKind =
  | "any"
  | "list"
  | "number"
  | "text"
  | "formula"
  | "date"
  | "time"
  | "dependent";

/**
 * The captions Excel puts on the bound boxes, which follow the Data operator:
 * Minimum/Maximum for between, Value (Length for text) for equal, Minimum for
 * greater than and Maximum for less than; dates and times say Start/End.
 */
export function validationBoundLabelKeys(
  kind: ValidationDialogKind,
  operator: ValidationOperator,
): [string, string] {
  const [low, high, one] =
    kind === "date"
      ? [
          "spreadsheet.validationDateMin",
          "spreadsheet.validationDateMax",
          "spreadsheet.validationDate",
        ]
      : kind === "time"
        ? [
            "spreadsheet.validationTimeMin",
            "spreadsheet.validationTimeMax",
            "spreadsheet.validationTime",
          ]
        : [
            "spreadsheet.validationMin",
            "spreadsheet.validationMax",
            kind === "text"
              ? "spreadsheet.validationLength"
              : "spreadsheet.validationValue",
          ];
  if (operator === "equal" || operator === "notEqual") return [one, high];
  if (operator === "lessThan" || operator === "lessThanOrEqual") {
    return [high, high];
  }
  return [low, high];
}

/**
 * What a note editor starts with. An existing note opens with its own text;
 * Excel starts a new note with the author's name and a colon on the first
 * line and the caret on the line below.
 */
export function initialNoteDraft(
  comment: CellComment | undefined,
  authorName: string,
): string {
  if (isNoteComment(comment)) return comment.text;
  return authorName ? `${authorName}:\n` : "";
}

export type CreateTableError =
  | "invalidRange"
  | "overlap"
  | "limit"
  | "protected"
  | "stale"
  | "rowLimit";

export interface CreateTableDraft {
  readonly sheetId: string;
  readonly styleId: TableStyleChoice;
  readonly range: string;
  readonly hasHeaders: boolean;
  readonly error: CreateTableError | null;
}

type RecommendedChartError = "stale" | "protected" | "limit";

export interface RecommendedChartDraft {
  readonly sheetId: string;
  readonly range: { r1: number; r2: number; c1: number; c2: number };
  readonly matrix: string[][];
  readonly recommendations: ChartRecommendation[];
  readonly selectedIndex: number;
  readonly error: RecommendedChartError | null;
}

export function parseSolverCells(raw: string): { row: number; col: number }[] | null {
  const parts = raw.split(",").map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length === 0) return null;
  const seen = new Set<string>();
  const cells: { row: number; col: number }[] = [];
  for (const part of parts) {
    const range = parseChangingRange(part);
    if (!range) return null;
    for (const cell of range) {
      const key = `${cell.row}:${cell.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
}

function parseChangingRange(
  raw: string,
): { row: number; col: number }[] | null {
  const text = raw.trim();
  if (text === "") return null;
  const parts = text.split(":");
  if (parts.length === 1) {
    const ref = parseCellRef(parts[0]);
    return ref ? [{ row: ref.row, col: ref.col }] : null;
  }
  if (parts.length !== 2) return null;
  const a = parseCellRef(parts[0]);
  const b = parseCellRef(parts[1]);
  if (!a || !b) return null;
  const r1 = Math.min(a.row, b.row);
  const r2 = Math.max(a.row, b.row);
  const c1 = Math.min(a.col, b.col);
  const c2 = Math.max(a.col, b.col);
  const cells: { row: number; col: number }[] = [];
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) cells.push({ row: r, col: c });
  }
  return cells;
}
