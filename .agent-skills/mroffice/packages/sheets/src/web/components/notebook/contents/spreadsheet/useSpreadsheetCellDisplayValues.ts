"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { localizedErrorDisplay } from "../../../../lib/spreadsheet/error-display";
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { spreadsheetCellIsFormula, resolveCellDisplay } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { useCallback, useMemo, type RefObject } from "react";
import { type SpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { isWebImageValue, isImageCellValue, type ImageCellValue, FormulaResultUnavailableError, ERRORS, type CellValue, type SheetEvaluator, type SpillOverlay } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { spreadsheetWebImagePicture, spreadsheetWebImageStatus } from "../../../../lib/spreadsheet/web-image-store";
import { type SpreadsheetShownCellPicture, readCellPicture } from "@mrnote/core/web/lib/spreadsheet/cell-picture.ts";
import { regionalSystemDateDisplayCode } from "@mrnote/core/web/lib/spreadsheet/number-format-gallery.ts";
import { viewerNumberSeparators } from "@mrnote/core/web/lib/spreadsheet/locale-number-separators.ts";
import { spreadsheetEntryEditText } from "@mrnote/core/web/lib/spreadsheet/entry-parse.ts";
import { type CellBorderEdges } from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";
import { resolveCellConditionalDisplay, ruleAreas as conditionalRuleAreas, ruleOverlaps as conditionalRuleOverlaps, type ConditionalFormatRule, type RangeExtent, type RangeStats } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { isCheckboxChecked, isCheckboxCheckedValue } from "../../../../lib/spreadsheet/checkbox";
import { type SheetModel } from "./spreadsheetSheetModel";
import { excelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

const GENERAL_NUMERAL = /^-?\d*\.?\d+(?:E[+-]\d+)?$/;

/** What useSpreadsheetCellDisplayValues reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetCellDisplayValuesInputs {
  condExtentCache: Map<ConditionalFormatRule, RangeExtent | null>;
  condStatsCache: Map<ConditionalFormatRule, RangeStats | null>;
  displayConditionalFormats: ConditionalFormatRule[];
  evalConditionalFormula: (formula: string, row: number, col: number, anchorRow: number, anchorCol: number) => CellValue;
  formulaEvaluator: SheetEvaluator;
  isCellContentHiddenRef: RefObject<(candidate: SheetModel, cell: SpreadsheetCell | undefined) => boolean>;
  locale: string;
  sheet: SheetModel;
  sheets: SheetModel[];
  spillOverlay: SpillOverlay;
  webImageRevision: number;
  workbookDateSystemRef: RefObject<SpreadsheetDateSystem | undefined>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetCellDisplayValues({
  condExtentCache,
  condStatsCache,
  displayConditionalFormats,
  evalConditionalFormula,
  formulaEvaluator,
  isCellContentHiddenRef,
  locale,
  sheet,
  sheets,
  spillOverlay,
  webImageRevision,
  workbookDateSystemRef,
}: SpreadsheetCellDisplayValuesInputs) {
  // Display value for a cell: the raw text while editing, otherwise
  // the computed formula result and/or the applied number format. Memoized so
  // it keeps a STABLE identity across renders (it only depends on the evaluator
  // + spill overlay), which in turn keeps every useCallback that lists it as a
  // dependency from re-creating on every render.
  // Rules that carry a number format (Excel's "Number" tab of a rule's
  // format) change what a matching cell DISPLAYS, everywhere the grid shows
  // the value. Nothing is scanned unless such a rule exists. The format is
  // resolved over the ordered rule list up to the last rule that sets one,
  // never a subset: a higher matching rule with Stop If True ends evaluation
  // for the number format as it does for the fill.
  const conditionalNumberFormatRules = useMemo(() => {
    let last = -1;
    displayConditionalFormats.forEach((rule, index) => {
      if ("numberFormat" in rule && rule.numberFormat) last = index;
    });
    return displayConditionalFormats.slice(0, last + 1);
  }, [displayConditionalFormats]);
  // The areas of rules that draw a left or top edge. The grid's collapsed
  // borders hand a tied shared edge to the cell further left / up, so the
  // neighbour there carries a matching cell's conditional left / top edge
  // (the grid's border-collapse note). Nothing is scanned unless such a rule
  // exists.
  const conditionalLeadingEdgeAreas = useMemo(
    () =>
      displayConditionalFormats.flatMap((rule) => {
        const edges = (rule as { borderEdges?: CellBorderEdges }).borderEdges;
        return edges && (edges.left || edges.top)
          ? [{ areas: conditionalRuleAreas(rule), left: Boolean(edges.left), top: Boolean(edges.top) }]
          : [];
      }),
    [displayConditionalFormats],
  );
  // A checkbox over a formula shows the formula's RESULT (=H15 follows H15;
  // live audit B168), a literal cell its stored text.
  const checkboxCheckedAt = useCallback(
    (cell: SpreadsheetCell | undefined, row: number, col: number): boolean => {
      if (!cell?.formula && !(cell?.value ?? "").startsWith("=")) {
        return isCheckboxChecked(cell?.value);
      }
      try {
        return isCheckboxCheckedValue(formulaEvaluator.getComputed(row, col));
      } catch {
        return false;
      }
    },
    [formulaEvaluator],
  );
  // The picture a cell draws (Place in Cell): its own, or the one its formula
  // or a dynamic array returns -- a reference to a picture cell is that
  // picture (=A1, XLOOKUP over a picture column), read from the cell the
  // value names.
  const cellPictureShownAt = useCallback(
    (
      cell: SpreadsheetCell | undefined,
      row: number,
      col: number,
    ): SpreadsheetShownCellPicture | null => {
      const own = readCellPicture(cell);
      if (own) return own;
      let value: unknown = null;
      try {
        if (spreadsheetCellIsFormula(cell)) {
          value = formulaEvaluator.getComputed(row, col);
        } else if (!cell?.value) {
          value = spillOverlay.spilled.get(`${row}:${col}`) ?? null;
        }
      } catch {
        return null;
      }
      // IMAGE's picture, once this tab has it, at its sizing.
      if (isWebImageValue(value)) {
        const fetched = spreadsheetWebImagePicture(value.source);
        if (!fetched) {
          spreadsheetWebImageStatus(value.source);
          return null;
        }
        return {
          src: fetched.src,
          ...(value.alt ? { alt: value.alt } : {}),
          sizing: value.sizing,
          ...(value.height !== undefined ? { height: value.height } : {}),
          ...(value.width !== undefined ? { width: value.width } : {}),
          naturalWidth: fetched.width,
          naturalHeight: fetched.height,
        };
      }
      if (!isImageCellValue(value)) return null;
      const image: ImageCellValue = value;
      const target =
        image.sheet === (sheet.name || sheet.id)
          ? sheet
          : (sheets.find((candidate) => (candidate.name || candidate.id) === image.sheet) ??
            sheets.find(
              (candidate) =>
                (candidate.name || candidate.id).toLowerCase() === image.sheet.toLowerCase(),
            ));
      return target ? readCellPicture(target.cells[`${image.row}:${image.col}`]) : null;
    },
    [formulaEvaluator, sheet, sheets, spillOverlay, webImageRevision],
  );
  const drawing = useMemo(() => {
    const separators = viewerNumberSeparators(locale);
    return separators ? { separators } : undefined;
  }, [locale]);
  const cellDisplayValue = useCallback(
    (
      cell: SpreadsheetCell | undefined,
      row: number,
      col: number,
      editing: boolean,
      numberFormatOverride?: string,
      /** For the viewer's own drawing: numbers take the region's decimal and
       * thousands separators. Every other reader (filters, sorting, copying
       * into a model, exports) keeps the code's "." and ",". */
      drawn?: boolean,
    ): string => {
      // Editing starts from Excel's edit text: 50%, 2026/9/21, 10:30:00. A
      // Hidden cell of a protected sheet withholds it (Format Cells >
      // Protection > Hidden): an unlocked one may be retyped, never read.
      if (editing) {
        return isCellContentHiddenRef.current(sheet, cell)
          ? ""
          : spreadsheetEntryEditText(cell, locale, {
              date1904: formulaEvaluator.date1904,
              // The editor's numbers in the interface language's decimal
              // (1234,5 in German); the entry reads them back the same way.
              typedNumerals: true,
            });
      }
      let override = numberFormatOverride;
      if (
        override === undefined &&
        conditionalNumberFormatRules.some(
          (rule) =>
            "numberFormat" in rule &&
            Boolean(rule.numberFormat) &&
            conditionalRuleOverlaps(rule, { r1: row, c1: col, r2: row, c2: col }),
        )
      ) {
        try {
          override = resolveCellConditionalDisplay(
            conditionalNumberFormatRules,
            formulaEvaluator.getComputed(row, col),
            row,
            col,
            {
              cellValueAt: (r, c) => formulaEvaluator.getComputed(r, c),
              evalFormula: evalConditionalFormula,
              extentCache: condExtentCache,
              statsCache: condStatsCache, date1904: excelDateSystemArg(workbookDateSystemRef.current),
            },
          ).style.numberFormat;
        } catch (error) {
          if (!(error instanceof FormulaResultUnavailableError)) throw error;
        }
      }
      // The system short date (built-ins 14 and 22, stored as m/d/yyyy) is
      // drawn in the viewer's regional short date; the stored code is kept.
      const drawnCode =
        override ??
        (typeof cell?.style?.numberFormat === "string"
          ? cell.style.numberFormat.trim()
          : "");
      const regionalCode = regionalSystemDateDisplayCode(drawnCode, locale);
      if (regionalCode !== drawnCode) override = regionalCode;
      // An IMAGE result reads #BUSY! while its picture loads and the error
      // Excel shows when it cannot be fetched; a shown picture has no text.
      try {
        const computed = spreadsheetCellIsFormula(cell)
          ? formulaEvaluator.getComputed(row, col)
          : !cell?.value
            ? (spillOverlay.spilled.get(`${row}:${col}`) ?? null)
            : null;
        if (isWebImageValue(computed)) {
          const status = spreadsheetWebImageStatus(computed.source);
          return status === "ready" ? "" : status === "loading" ? "#BUSY!" : status;
        }
        // "Show a zero in cells that have zero value" off on this sheet
        // (sheetView@showZeros="0", X-201): a cell whose value is the
        // number 0 shows nothing, whatever its format; text "0" still shows.
        if (sheet.hideZeros === true) {
          const value = computed !== null ? computed : cell?.value ? formulaEvaluator.getComputed(row, col) : null;
          if (value === 0) return "";
        }
      } catch (error) {
        if (!(error instanceof FormulaResultUnavailableError)) throw error;
      }
      try {
        // What the grid shows; the value, the display cache and every export
        // keep the error's own code (XLS-A089).
        return localizedErrorDisplay(
          resolveCellDisplay(
            cell,
            row,
            col,
            formulaEvaluator,
            spillOverlay,
            override,
            // The viewer's decimal and thousands separators (Excel's system
            // separators); the stored code and every cached text keep the
            // code's own "." and ",".
            drawn ? drawing : undefined,
          ),
          locale,
        );
      } catch (error) {
        if (!(error instanceof FormulaResultUnavailableError)) throw error;
        return cell?.display ?? ERRORS.NA.code;
      }
    },
    [
      condExtentCache,
      condStatsCache,
      conditionalNumberFormatRules,
      drawing,
      evalConditionalFormula,
      formulaEvaluator,
      locale,
      sheet.hideZeros,
      spillOverlay,
      webImageRevision,
    ],
  );
  /**
   * The text a number cell is drawn with once it has been fitted to its
   * column (fittedCellNumberText reads the code's own text): unchanged, it is
   * the cell drawn with the viewer's separators; refitted General (1235,
   * 1.2E+05) takes the viewer's decimal point; a #### stays as it is.
   */
  const cellDrawnNumberText = useCallback(
    (
      fitted: string,
      shown: string,
      cell: SpreadsheetCell | undefined,
      row: number,
      col: number,
      numberFormatOverride?: string,
    ): string => {
      if (!drawing) return fitted;
      if (fitted === shown) return cellDisplayValue(cell, row, col, false, numberFormatOverride, true);
      return GENERAL_NUMERAL.test(fitted) ? fitted.replace(".", drawing.separators.decimal) : fitted;
    },
    [cellDisplayValue, drawing],
  );
  return {
    cellDisplayValue,
    cellDrawnNumberText,
    numberDrawing: drawing,
    cellPictureShownAt,
    checkboxCheckedAt,
    conditionalLeadingEdgeAreas,
  };
}
