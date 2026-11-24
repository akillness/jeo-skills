"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useSpreadsheetBackgroundCalculation } from "./useSpreadsheetBackgroundCalculation";
import { buildSpillOverlay } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { useMemo, useCallback, useState } from "react";
import { type SpillOverlay, FormulaResultUnavailableError, type CellValue, type SheetEvaluator } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { coveredCells, mergeAnchorCells, type MergeSpan } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { literalEditSources, type SpillOverlayByCells } from "./spreadsheetWindowConstants";
import { type SpreadsheetCellIndex } from "../../../../lib/spreadsheet/cell-indexes";

/** What useSpreadsheetSpillOverlay reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSpillOverlayInputs {
  backgroundCalculation: ReturnType<typeof useSpreadsheetBackgroundCalculation>;
  cellIndex: SpreadsheetCellIndex;
  formulaEvaluator: SheetEvaluator;
  mergeSpans: MergeSpan[];
  sheet: SheetModel;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSpillOverlay({
  backgroundCalculation,
  cellIndex,
  formulaEvaluator,
  mergeSpans,
  sheet,
}: SpreadsheetSpillOverlayInputs) {
  // Dynamic-array SPILL (Excel 365 / Google Sheets parity). ------------------
  // A formula whose result is a multi-cell array (FILTER/UNIQUE/SORT/SEQUENCE/
  // TRANSPOSE) "spills" its block into the cells below/right of the anchor. This
  // overlay is PURELY DERIVED from the current cells + evaluator; it is NEVER
  // written into sheet.cells, so the persisted content_json (and its round-trip)
  // is byte-for-byte identical whether or not a sheet uses array formulas. The
  // anchor cell keeps its formula and renders the block's top-left element; the
  // non-anchor target cells display their spilled value read-only. If any target
  // in the block's footprint is already occupied (a non-empty cell, a merge-
  // covered cell, another anchor, or another formula's spill), the spill is
  // blocked and the anchor shows #SPILL! (Excel parity) — no cells are written.
  // This window's own cache: its entries hold the window's evaluator.
  const [spillOverlayByCells] = useState<SpillOverlayByCells>(() => new WeakMap());
  const spillOverlay = useMemo(() => {
    const projection = backgroundCalculation.projection;
    // The same cells read through the same evaluator spill the same: a
    // calculation ending changes neither. A new overlay is a repaint of every
    // row and a rebuild of each reader on it.
    const known = spillOverlayByCells.get(sheet.cells);
    if (known && known.evaluator === formulaEvaluator && known.formulaKeys === cellIndex.formulaKeys &&
        known.mergeSpans === mergeSpans && known.dataTables === sheet.dataTables) {
      if (known.projection !== projection) spillOverlayByCells.set(sheet.cells, { ...known, projection });
      return known.overlay;
    }
    // While the worker is still calculating, every formula reads its carried
    // result or is deferred, so a literal-only edit cannot turn a formula into
    // an array; with no array footprint on the sheet, the edited cells cannot
    // block one either. The overlay of the previous map, computed over the
    // same results, is then still exact.
    const from = backgroundCalculation.pending && projection ? literalEditSources.get(sheet.cells)?.from.deref() : undefined;
    const previous = from ? spillOverlayByCells.get(from) : undefined;
    let overlay: SpillOverlay;
    if (previous && previous.projection === projection && previous.formulaKeys === cellIndex.formulaKeys &&
        previous.mergeSpans === mergeSpans && previous.overlay.spilled.size === 0 && previous.overlay.blocked.size === 0) {
      overlay = previous.overlay;
    } else {
      try {
        overlay = buildSpillOverlay(
          sheet.cells,
          coveredCells(mergeSpans),
          formulaEvaluator,
          cellIndex.formulaKeys,
          mergeAnchorCells(mergeSpans),
          sheet.dataTables,
        );
      } catch (error) {
        if (!(error instanceof FormulaResultUnavailableError)) throw error;
        overlay = {
          spilled: new Map<string, CellValue>(),
          blocked: new Set<string>(),
        };
      }
    }
    spillOverlayByCells.set(sheet.cells, { formulaKeys: cellIndex.formulaKeys, mergeSpans, projection, overlay, evaluator: formulaEvaluator, dataTables: sheet.dataTables });
    return overlay;
  }, [sheet.cells, sheet.dataTables, cellIndex.formulaKeys, mergeSpans, formulaEvaluator, backgroundCalculation.pending, backgroundCalculation.projection, spillOverlayByCells]);
  /**
   * The array anchor that owns a cell, and the footprint it claims.
   * computeSpillOverlay tracks this internally (`claimedBy`) but does not
   * return it, and the engine's contract is not this component's to widen. An
   * array only ever spills DOWN and RIGHT, so only a formula above and left of
   * the cell can own it. For a BLOCKED anchor the same footprint is the one
   * its array would have taken, which is where the obstructing cells sit.
   */
  const spillFootprintFor = useCallback(
    (
      anchorRow: number,
      anchorCol: number,
    ): { row: number; col: number; height: number; width: number } | null => {
      let block: unknown;
      try {
        block = formulaEvaluator.getArray(anchorRow, anchorCol);
      } catch {
        return null;
      }
      if (!Array.isArray(block) || block.length === 0) return null;
      const width = Array.isArray(block[0]) ? block[0].length : 0;
      if (width === 0) return null;
      return { row: anchorRow, col: anchorCol, height: block.length, width };
    },
    [formulaEvaluator],
  );
  const spillAnchorAt = useCallback(
    (
      row: number,
      col: number,
    ): { row: number; col: number; height: number; width: number } | null => {
      if (!spillOverlay.spilled.has(`${row}:${col}`)) return null;
      for (const key of cellIndex.formulaKeys) {
        const [rawRow, rawCol] = key.split(":");
        const anchorRow = Number(rawRow);
        const anchorCol = Number(rawCol);
        if (
          !Number.isInteger(anchorRow) ||
          !Number.isInteger(anchorCol) ||
          anchorRow > row ||
          anchorCol > col
        ) {
          continue;
        }
        const footprint = spillFootprintFor(anchorRow, anchorCol);
        if (
          footprint &&
          row < anchorRow + footprint.height &&
          col < anchorCol + footprint.width
        ) {
          return footprint;
        }
      }
      return null;
    },
    [cellIndex.formulaKeys, spillFootprintFor, spillOverlay],
  );
  return {
    spillAnchorAt,
    spillFootprintFor,
    spillOverlay,
  };
}
