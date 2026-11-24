"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { writeLineBlanksIn } from "@mrnote/core/web/lib/spreadsheet/line-styles.ts";
import { nativeOfficeOwnsFocus } from "@mrnote/core/web/lib/native-office-focus.ts";
import { cssPixelsToEmu } from "../../../../lib/spreadsheet/drawing-buttons";
import { type CellMap, hasCellMetadata, copyCellMap, type SpreadsheetCell, writeCellValueInto } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { crossSheetCutConditionalFormats, cutConditionalFormatFileCopy, sameSheetCutRulePlans, writePastedContentInto } from "../../../../lib/spreadsheet/paste-buttons";
import { flashFillPlan, flashFillRequestFromResolved } from "../../../../lib/spreadsheet/fill-buttons";
import { nativeColumnCssClamp, editNativeColumns } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { useCallback, useEffect, useRef, type ClipboardEvent as ReactClipboardEvent, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { type SpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { isEngineAbort, engineErrorMessageKey } from "@mrnote/core/web/lib/office-smartart/remote.ts";
import { useEngineCallSequence } from "@mrnote/core/web/lib/engine-host/use-engine-call.ts";
import { callEngine } from "@mrnote/core/web/lib/engine-host/client.ts";
import { type SpreadsheetRibbonTab } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { shiftFormula, adjustFormulaForCrossSheetMove, isFormulaError } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { styleWithOwnTextIdentity } from "@mrnote/core/web/lib/spreadsheet/entry-parse.ts";
import { type MergeSpan, spansOverlap } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { type ValidationRule, clearRulesInRange, normalizeRules as normalizeValidationRules, planRulesForTiledValidationPaste, planRulesForValidationPaste, planRulesForTransposedValidationPaste, validationPasteOverRuleLimit, type ValidationRange } from "@mrnote/core/web/lib/spreadsheet/data-validation.ts";
import { cutSourceClearKeys } from "../../../../lib/spreadsheet/block-clear";
import { type DataTable, tableCellRole } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type rangeHasLockedCell as rangeHasLockedCellWithProtection, type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { MIN_COLUMN_WIDTH_PX, MAX_COLUMN_WIDTH_PX, resolvedColumnWidth, setLineSizes, clampColumnWidth } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { parseCsv } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { PASTE_MAX_ROWS, PASTE_MAX_COLS, limitPastedGrid } from "@mrnote/core/web/lib/spreadsheet/paste-limits.ts";
import { buildImageObject } from "@mrnote/core/web/lib/spreadsheet/sheet-image.ts";
import { parseSpreadsheetClipboardHtml } from "../../../../lib/spreadsheet/clipboard-html-import";
import { richClipboardCellHasTransferableContent, standardPasteGrid, pasteLinkSnapshotDimensions, valuesWithSourceFormatting, type PasteOptionsChoice, valuesOnlyGrid, transposedPasteGrid, pasteLinkGrid, formatsGrid, type PastedContent, type PasteSpecialDraft, settlePasteSpecialDraft, commentsGrid, formulasGrid, numberFormatsGrid, type RichClipboard, transposeClipboard, arithmeticGrid, clipboardCellContent, transposedValuesGrid, applySkipBlanks, pasteOptionsSpecialDraft, layPasteTiles } from "@mrnote/core/web/lib/spreadsheet/paste-special.ts";
import { readSheetObjectClipboardToken, clipboardHtmlHoldsOnlyPictures } from "../../../../lib/spreadsheet/object-clipboard";
import { type SheetChartClipboardItem, type SheetChartClipboardFrame } from "../../../../lib/spreadsheet/chart-clipboard";
import { MAX_CONDITIONAL_FORMATS, normalizeRules as normalizeConditionalRules, planRulesForFormatPaste, planRulesForFormatPasteWithFile, planRulesForTiledFormatPaste, planRulesForTransposedFormatPaste, planRulesWithFile, type ConditionalFormatRule } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { withConditionalFormatFileCopyRecorded, type ConditionalFormatFileCopyLayout } from "@mrnote/core/web/lib/spreadsheet/structural.ts";
import { rewriteConditionalFormatReferences, rewriteValidationReferences } from "../../../../lib/spreadsheet/sheet-formula-references";
import { rangeLayoutToPngDataUrl, type RangeLayout } from "../../../../lib/spreadsheet/image-export";
import { type SheetModel, type SpreadsheetObject } from "./spreadsheetSheetModel";
import { MAX_SHEET_ROWS, MAX_SHEET_COLS, SPREADSHEET_CELL_WIDTH_PX } from "./spreadsheetGridConstants";
import { type SpreadsheetPasteOptionsOffer } from "./spreadsheetCellValuePlan";
import { MAX_SHEET_OBJECTS } from "./spreadsheetObjectContext";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { announceCommandResult } from "./spreadsheetWindowHelpers";
import { type RichPasteOptions } from "./spreadsheetWindowScopeConstants";
import { type SheetEvaluator } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type ResolvedNativeGrid } from "../../../../lib/spreadsheet/row-column-buttons";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";
import { excelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** What useSpreadsheetClipboardPaste reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetClipboardPasteInputs {
  activeCell: { row: number; col: number; };
  calculationPendingRef: RefObject<boolean>;
  cellDisplayValue: (cell: SpreadsheetCell | undefined, row: number, col: number, editing: boolean, numberFormatOverride?: string) => string;
  chartClipboardRef: RefObject<{ sourceSheetId: string; charts: SheetChartClipboardItem[]; moved: { object: SpreadsheetObject; frame: SheetChartClipboardFrame; }[]; picture: Promise<Blob | null> | null; } | null>;
  clipboardMergesRef: RefObject<MergeSpan[]>;
  columnWidthClipboardRef: RefObject<readonly number[] | null>;
  computedSelectionRef: RefObject<string>;
  conditionalFormatClipboardRef: RefObject<ConditionalFormatRule[] | null>;
  conditionalFormats: ConditionalFormatRule[];
  contextualTabActivationRef: RefObject<{ contextual: NonNullable<SpreadsheetRibbonTab["contextual"]>; id?: string; } | null>;
  copyMarqueeKeepRef: RefObject<WeakSet<SheetModel[]>>;
  copyOriginRef: RefObject<{ pageId: string; sheetId: string; kind: "copy" | "cut"; row: number; col: number; snapshotRows: number; snapshotCols: number; sourceRows?: readonly number[]; sourceCells: CellMap; sourceRowCount: number; sourceColumnCount: number; coordinateAuthorityToken: Readonly<Record<string, never>>; } | null>;
  copySelection: (event?: ReactKeyboardEvent<HTMLInputElement>) => void;
  cutRange: { r1: number; c1: number; r2: number; c2: number; copy?: true; sheetId?: string; } | null;
  cutRangeRef: RefObject<{ range: { r1: number; c1: number; r2: number; c2: number; }; text: string; sheetId: string; } | null>;
  cutSelection: (event?: ReactKeyboardEvent<HTMLInputElement>) => void;
  dataDialogWriteAllowedRef: RefObject<boolean>;
  dataTables: DataTable[];
  deferComputedActionRef: RefObject<(name: string, args?: unknown[]) => boolean>;
  formulaEvaluator: SheetEvaluator;
  gridClipboardSerialRef: RefObject<number>;
  hasMultiSelection: boolean;
  hasRichClipboard: boolean;
  isSheetProtectionEffectiveRef: RefObject<(candidate: SheetModel | null | undefined) => boolean>;
  lastCopiedHtmlMarkRef: RefObject<string | null>;
  lastCopiedTextRef: RefObject<string | null>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  locale: string;
  lockedCellEntryBlocked: (row: number, col: number) => boolean;
  mergeSpans: MergeSpan[];
  nativeGrid: ResolvedNativeGrid | undefined;
  pendingGridClipboardRef: RefObject<Promise<void> | null>;
  pageId: string;
  pasteGridIntoCells: (baseRow: number, baseCol: number, rows: string[][], clearSourceKeys?: readonly string[], clipboardCells?: RichClipboard, clipboardMerges?: readonly MergeSpan[], options?: RichPasteOptions) => boolean;
  pasteLinkCoordinateAuthoritiesRef: RefObject<Map<string, { token: Readonly<Record<string, never>>; cells: CellMap; rowCount: number; columnCount: number; }>>;
  pasteObjectClipboardRef: RefObject<((data: DataTransfer | null | undefined) => boolean) | null>;
  pastePictureClipboardRef: RefObject<{ pageId: string; sheetId: string; workbookIdentity: Readonly<Record<string, never>>; rows: number; cols: number; rich: RichClipboard; layout: RangeLayout; } | null>;
  pastePictureFileRef: RefObject<((file: File) => boolean) | null>;
  pasteSpecialAuthority: { readonly sheet: SheetModel; readonly selectionKey: string; readonly clipboard: RichClipboard; } | null;
  pasteSpecialDraft: PasteSpecialDraft;
  pasteSpecialOpen: boolean;
  rangeClipboardWorkbookIdentityRef: RefObject<Readonly<Record<string, never>>>;
  rangeHasLockedCellRef: RefObject<(candidate: SheetModel, range: Parameters<typeof rangeHasLockedCellWithProtection>[1]) => boolean>;
  refuseLockedCellEntryRef: RefObject<(row: number, col: number) => void>;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  richClipboardRef: RefObject<RichClipboard | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  writeOpenEntryTextRef: RefObject<((row: number, col: number, input: HTMLInputElement | null, text: string, caret?: number) => void) | null>;
  selectionMoveDrag: { src: { r1: number; r2: number; c1: number; c2: number; }; target: { row: number; col: number; }; copy: boolean; } | null;
  selectionMoveDragRef: RefObject<{ src: { r1: number; r2: number; c1: number; c2: number; }; grab: { row: number; col: number; }; pointerId: number; sourceSheet: SheetModel; sourceWorkbook: SheetModel[]; target: { row: number; col: number; }; copy: boolean; clientX: number; clientY: number; } | null>;
  selRect: GridRect;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setChartPasteSpecial: Dispatch<SetStateAction<{ as: "chart" | "picture"; } | null>>;
  setCutRange: Dispatch<SetStateAction<{ r1: number; c1: number; r2: number; c2: number; copy?: true; sheetId?: string; } | null>>;
  setOverwriteConfirm: Dispatch<SetStateAction<{ title: string; body?: string; confirmLabel?: string; cancelLabel?: string; confirmVariant?: "default" | "destructive"; onConfirm: () => void; } | null>>;
  setPasteOptionsOffer: Dispatch<SetStateAction<SpreadsheetPasteOptionsOffer | null>>;
  setPasteSpecialAuthority: Dispatch<SetStateAction<{ readonly sheet: SheetModel; readonly selectionKey: string; readonly clipboard: RichClipboard; } | null>>;
  setPasteSpecialOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  setSelectionMoveDrag: Dispatch<SetStateAction<{ src: { r1: number; r2: number; c1: number; c2: number; }; target: { row: number; col: number; }; copy: boolean; } | null>>;
  shapeClipboardRef: RefObject<SpreadsheetObject[] | null>;
  sheet: SheetModel;
  sheetObjects: SpreadsheetObject[];
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  sheets: SheetModel[];
  showProtectNotice: (message?: string) => void;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  validationClipboardRef: RefObject<ValidationRule[] | null>;
  validations: ValidationRule[];
  workbookDateSystemRef: RefObject<SpreadsheetDateSystem | undefined>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */







function conditionalFormatFileCopyOf(
  fileCopy: { page: boolean } | null | undefined,
  copied: SheetModel | undefined,
  pastedSheetId: string,
  sourceRange: { r1: number; c1: number; r2: number; c2: number },
  at: { row: number; col: number },
  layout: ConditionalFormatFileCopyLayout = {},
) {
  if (!fileCopy || !copied) return undefined;
  return {
    source: copied.id === pastedSheetId ? null : copied,
    rect: [sourceRange.r1, sourceRange.c1, sourceRange.r2, sourceRange.c2] as [number, number, number, number],
    at: [at.row, at.col] as [number, number],
    page: fileCopy.page,
    ...layout,
  };
}

/** How many rules the copied sheet lists (a page lists up to the bound). */
function listedRuleCount(copied: SheetModel | undefined): number {
  return Array.isArray(copied?.conditionalFormats) ? copied.conditionalFormats.length : 0;
}

function pasteLinkSourceBlockUnmoved(
  origin: { row: number; col: number; sourceRows?: readonly number[]; sourceCells: CellMap },
  liveCells: CellMap,
  dimensions: { rows: number; cols: number },
): boolean {
  for (let r = 0; r < dimensions.rows; r += 1) {
    for (let c = 0; c < dimensions.cols; c += 1) {
      const key = `${origin.sourceRows?.[r] ?? origin.row + r}:${origin.col + c}`;
      if (origin.sourceCells[key] !== liveCells[key]) return false;
    }
  }
  return true;
}

export function useSpreadsheetClipboardPaste({
  activeCell,
  calculationPendingRef,
  cellDisplayValue,
  chartClipboardRef,
  clipboardMergesRef,
  columnWidthClipboardRef,
  computedSelectionRef,
  conditionalFormatClipboardRef,
  conditionalFormats,
  contextualTabActivationRef,
  copyMarqueeKeepRef,
  copyOriginRef,
  copySelection,
  cutRange,
  cutRangeRef,
  cutSelection,
  dataDialogWriteAllowedRef,
  dataTables,
  deferComputedActionRef,
  formulaEvaluator,
  gridClipboardSerialRef,
  hasMultiSelection,
  hasRichClipboard,
  isSheetProtectionEffectiveRef,
  lastCopiedHtmlMarkRef,
  lastCopiedTextRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  locale,
  lockedCellEntryBlocked,
  mergeSpans,
  nativeGrid,
  pendingGridClipboardRef,
  pageId,
  pasteGridIntoCells,
  pasteLinkCoordinateAuthoritiesRef,
  pasteObjectClipboardRef,
  pastePictureClipboardRef,
  pastePictureFileRef,
  pasteSpecialAuthority,
  pasteSpecialDraft,
  pasteSpecialOpen,
  rangeClipboardWorkbookIdentityRef,
  rangeHasLockedCellRef,
  refuseLockedCellEntryRef,
  replaceActiveSheet,
  richClipboardRef,
  rootRef,
  writeOpenEntryTextRef,
  selectionMoveDrag,
  selectionMoveDragRef,
  selRect,
  setActiveCell,
  setChartPasteSpecial,
  setCutRange,
  setOverwriteConfirm,
  setPasteOptionsOffer,
  setPasteSpecialAuthority,
  setPasteSpecialOpen,
  setSelectedObjectId,
  setSelectionAnchor,
  setSelectionMoveDrag,
  shapeClipboardRef,
  sheet,
  sheetObjects,
  sheetProtectionAllowsRef,
  sheets,
  showProtectNotice,
  t,
  validationClipboardRef,
  validations,
  workbookDateSystemRef,
}: SpreadsheetClipboardPasteInputs) {
  // Flash Fill (Excel/WPS "Data > Flash Fill", Ctrl+E): learn a string transform from
  // the rows the user has ALREADY filled in the active column and apply it to the
  // empty rows below. The "examples" are the non-empty cells of the active column;
  // each example's inputs are the cells to its LEFT in the same row (columns
  // 0..activeCol-1). The bounded, deterministic synthesis runs on the server (engine
  // `tools`, `sheet.flashFill`); here we gather the examples and targets (the shared
  // plan, lib/spreadsheet/fill-buttons), ask, and write ONLY the resolved cells
  // through the shared paste path (undo + autosave + sheet-protection) -- and only
  // while the same sheet still plans the same examples and targets. On "no
  // pattern detected", no examples, or a failed ask it reports that and writes
  // nothing, leaving the sheet byte-stable.
  // Declared after pasteGridIntoCells because it writes through that shared path.
  const flashFillCalls = useEngineCallSequence();
  const runFlashFill = useCallback(() => {
    const messages = {
      "no-source": "spreadsheet.flashFillNoSource",
      "no-examples": "spreadsheet.flashFillNoExamples",
      "no-targets": "spreadsheet.flashFillNoTargets",
      "no-pattern": "spreadsheet.flashFillNoPattern",
    } as const;
    const active = { row: activeCell.row, col: activeCell.col };
    const planOn = (cells: CellMap, rowCount: number) =>
      flashFillPlan(
        cells,
        active,
        rowCount,
        (row, col) => cellDisplayValue(cells[`${row}:${col}`], row, col, false),
        dataTables,
      );
    const plan = planOn(sheet.cells, sheet.rowCount);
    if (!plan.ok) {
      announceCommandResult({ kind: "error", text: t(messages[plan.error]) });
      return;
    }
    const sheetIndex = liveActiveSheetIndexRef.current;
    const asked = JSON.stringify([plan.examples, plan.targetRows, plan.targetInputs]);
    void flashFillCalls
      .run((signal) =>
        callEngine(
          "tools",
          "sheet.flashFill",
          { examples: plan.examples, targets: plan.targetInputs },
          { signal, cache: true },
        ),
      )
      .then(
        (answer) => {
          if (answer === undefined) return;
          // The sheet moved on (another sheet, or the examples / targets
          // changed): the answer is for cells that are no longer there.
          const live = liveSheetsRef.current[sheetIndex];
          if (liveActiveSheetIndexRef.current !== sheetIndex || !live) return;
          const livePlan = live.cells === sheet.cells ? plan : planOn(live.cells, live.rowCount);
          if (
            !livePlan.ok ||
            JSON.stringify([livePlan.examples, livePlan.targetRows, livePlan.targetInputs]) !== asked
          ) {
            return;
          }
          const written = flashFillRequestFromResolved(live.cells, livePlan, answer.resolved);
          if (!written.ok) {
            announceCommandResult({ kind: "error", text: t(messages[written.error]) });
            return;
          }
          const { request } = written;
          const committed = pasteGridIntoCells(request.baseRow, request.baseCol, request.rows, undefined, undefined, undefined, request.options);
          if (!committed) return;
          announceCommandResult({
            kind: "success",
            text: t("spreadsheet.flashFillDone", { count: written.count }),
          });
        },
        (error: unknown) => {
          if (isEngineAbort(error)) return;
          announceCommandResult({ kind: "error", text: t(engineErrorMessageKey(error)) });
        },
      );
  }, [activeCell.row, activeCell.col, sheet, dataTables, pasteGridIntoCells, t, cellDisplayValue, flashFillCalls]);

  // Ctrl/Cmd+E triggers Flash Fill (Excel/WPS parity) when focus is inside this
  // window. Scoped to this window's root so it never hijacks the shortcut for other
  // editors on the canvas. Declared after runFlashFill so the effect references an
  // already-initialized callback (avoids use-before-declaration). preventDefault to
  // suppress any browser/OS default for Ctrl+E.
  useEffect(() => {
    const handleFlashFillShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "e") return;
      // Don't steal Ctrl+E from a chord that also holds Alt/Shift (reserved).
      if (event.altKey || event.shiftKey) return;
      const root = rootRef.current;
      const active = document.activeElement;
      if (!nativeOfficeOwnsFocus(root, active)) return;
      event.preventDefault();
      event.stopPropagation();
      runFlashFill();
    };
    window.addEventListener("keydown", handleFlashFillShortcut);
    return () => window.removeEventListener("keydown", handleFlashFillShortcut);
  }, [runFlashFill]);

  // When a cut is armed AND this paste is its payload, compute the source cells to
  // clear (excluding any that overlap the pasted destination) so the move lands as
  // one undo step. Returns the clear-key list (possibly empty) and disarms the cut
  // marker; returns null when no cut move applies (a plain copy→paste). Reads the
  // FILLED source cells off the rich snapshot so a sparse cut only clears moved
  // cells. baseRow/baseCol are the paste destination top-left.
  const consumeCutMove = useCallback(
    (baseRow: number, baseCol: number): string[] | null => {
      const cut = cutRangeRef.current;
      const rich = richClipboardRef.current;
      if (!cut || !rich) return null;
      // Cross-sheet paste: the cut's source cells live on ANOTHER sheet, so
      // there is nothing to clear here; the caller blanks them over there
      // through the move's follow-on write (movedFrom.fromSheet). Disarm.
      if (cut.sheetId !== sheet.id) {
        cutRangeRef.current = null;
        setCutRange((prev) => (prev ? null : prev));
        return [];
      }
      const { range } = cut;
      const r1 = Math.min(range.r1, range.r2);
      const c1 = Math.min(range.c1, range.c2);
      const keys = cutSourceClearKeys(range, baseRow, baseCol, (r, c) => {
        const cell = rich[r - r1]?.[c - c1];
        return richClipboardCellHasTransferableContent(cell);
      });
      // A cut is single-use: disarm so a SECOND paste is a plain copy (Excel
      // clears the marching ants after the move).
      cutRangeRef.current = null;
      setCutRange((prev) => (prev ? null : prev));
      return keys;
    },
    [sheet.id],
  );

  // Excel's ordinary Copy -> Paste transfers every copied cell attribute, not
  // just the cell-local payload. Keep the two physical internal-paste entries
  // (native own-payload Cmd/Ctrl+V and Ribbon/context Paste) on this one seam so
  // detached cells, merges, conditional formats and validation rules are
  // planned before the shared worksheet commit. Cut keeps its established move
  // path below; this stricter receipt authority belongs only to an immutable
  // Copy generation.
  const pasteOwnRichClipboard = useCallback(
    (
      row: number,
      col: number,
      // Paste Special > Skip blanks; a Copy only (the dialog never offers it
      // for a Cut under All, as Excel offers no Paste Special after a Cut).
      // Paste Options > Values & Source Formatting (`values`): each formula
      // lands as the result it had when copied, with the source formats.
      // Paste Special > All merging conditional formats (XLS-A063).
      pasteOptions: {
        skipBlanks?: boolean;
        values?: boolean;
        mergeConditionalFormats?: boolean;
      } = {},
    ) => {
      const rich = richClipboardRef.current;
      if (!rich || rich.length === 0) return;

      const cutArmed = cutRangeRef.current !== null;
      const origin = copyOriginRef.current;
      const sameSheetCut =
        cutArmed && cutRangeRef.current?.sheetId === sheet.id;
      // A cut armed on ANOTHER sheet of this workbook is still a move (Excel
      // cuts across sheets; it never silently pastes a copy): the source is
      // cleared over there and every reference to it, on any sheet, follows
      // to the destination, all in the same commit.
      const crossSheetSource =
        cutArmed && !sameSheetCut
          ? (sheets.find(
              (candidate) => candidate.id === cutRangeRef.current?.sheetId,
            ) ?? null)
          : null;

      // Preserve the existing Cut / post-Cut behavior exactly. In particular,
      // the move disarms once and the MOVED cells' own formula text stays
      // fixed: a cut is not a fill, so its relative refs do not shift. What
      // does change is every reference that names a cell the move took with
      // it, here and anywhere else in the workbook (movedFrom below).
      if (cutArmed || origin?.kind === "cut") {
        // consumeCutMove disarms the marker, so read the source rectangle
        // first; it is what the workbook's formulas are re-pointed by.
        const cutSource = cutArmed ? cutRangeRef.current : null;
        const movedRange = cutSource
          ? {
              r1: Math.min(cutSource.range.r1, cutSource.range.r2),
              c1: Math.min(cutSource.range.c1, cutSource.range.c2),
              r2: Math.max(cutSource.range.r1, cutSource.range.r2),
              c2: Math.max(cutSource.range.c1, cutSource.range.c2),
            }
          : null;
        // The source sheet's protection is authenticated like the
        // destination's: a locked source cell refuses the whole move, and the
        // cut stays armed.
        if (
          crossSheetSource &&
          movedRange &&
          rangeHasLockedCellRef.current(crossSheetSource, movedRange)
        ) {
          showProtectNotice();
          return;
        }
        const clearKeys = cutArmed ? (consumeCutMove(row, col) ?? []) : [];
        const crossSheetClearKeys: string[] = [];
        if (crossSheetSource && movedRange) {
          for (let r = movedRange.r1; r <= movedRange.r2; r += 1) {
            for (let c = movedRange.c1; c <= movedRange.c2; c += 1) {
              if (
                richClipboardCellHasTransferableContent(
                  rich[r - movedRange.r1]?.[c - movedRange.c1],
                )
              ) {
                crossSheetClearKeys.push(`${r}:${c}`);
              }
            }
          }
        }
        const isMove = sameSheetCut || crossSheetSource !== null;
        const pastePayload = standardPasteGrid(
          rich,
          origin ? row - origin.row : 0,
          origin ? col - origin.col : 0,
          !isMove,
        );
        // A move takes the cells' data validation with them (live audit
        // B261): the rules leave the source and cover the destination, their
        // references re-pointed as the moved formulas' are (a reference into
        // the moved cells follows them, any other stays). A rule the planner
        // cannot carry leaves the rules as they were.
        let moveValidationPlan: { rules: ValidationRule[]; changed: boolean } | undefined;
        let moveConditionalFormatPlan: { rules: ConditionalFormatRule[]; changed: boolean; demoted?: ConditionalFormatRule[] } | undefined;
        const movedValidations = validationClipboardRef.current;
        if (sameSheetCut && movedRange) {
          // The moved cells' conditional formats and validation, and every
          // reference to them (lib/spreadsheet/paste-buttons).
          const plans = sameSheetCutRulePlans({
            conditionalFormats,
            validations,
            movedValidations: movedValidations ?? null,
            movedRange,
            row,
            col,
            sheetName: sheet.name || sheet.id,
            bounds: { maxRow: MAX_SHEET_ROWS - 1, maxCol: MAX_SHEET_COLS - 1 },
          });
          moveConditionalFormatPlan = plans.conditionalFormatPlan;
          moveValidationPlan = plans.validationPlan;
        }

        // A move from another sheet carries them across: the source sheet
        // keeps its rules without the moved cells, what they say of the moved
        // cells following them there; this one gains the moved cells' rules
        // and keeps its own. Excel (Range.Cut to another sheet, xlsx-backlog
        
        // $A1="x" from A1 to C5 reads $A5="x", B1>B9 reads D5>D13, $A$1 stays
        // -- not as the moved cells' own formulas, which follow what they name.
        let sourceSheetRules:
          | { conditionalFormats: ConditionalFormatRule[]; validations: ValidationRule[] }
          | undefined;
        const movedConditionalFormats = conditionalFormatClipboardRef.current;
        if (crossSheetSource && movedRange && movedConditionalFormats && movedValidations) {
          const fromSheet = crossSheetSource.name || crossSheetSource.id;
          const toSheet = sheet.name || sheet.id;
          const rowDelta = row - movedRange.r1;
          const colDelta = col - movedRange.c1;
          const across = (movedFormula: boolean) => (formula: string) =>
            adjustFormulaForCrossSheetMove(formula, {
              from: movedRange,
              rowDelta,
              colDelta,
              fromSheet,
              toSheet,
              hostSheet: toSheet,
              movedFormula,
            });
          const bounds = { maxRow: MAX_SHEET_ROWS - 1, maxCol: MAX_SHEET_COLS - 1 };
          const destinationRange = {
            r1: row,
            c1: col,
            r2: row + movedRange.r2 - movedRange.r1,
            c2: col + movedRange.c2 - movedRange.c1,
          };
          const { carried, source: sourceConditional } = crossSheetCutConditionalFormats({
            movedRules: movedConditionalFormats,
            sourceRules: normalizeConditionalRules(crossSheetSource.conditionalFormats),
            movedRange,
            row,
            col,
            fromSheet,
            toSheet,
            bounds,
          });
          const sourceValidations = clearRulesInRange(
            normalizeValidationRules(crossSheetSource.validations),
            movedRange,
            shiftFormula,
          );
          const retainedValidations = clearRulesInRange(validations, destinationRange, shiftFormula);
          const validationPlan = retainedValidations
            ? planRulesForValidationPaste(
                retainedValidations.map((rule) => rewriteValidationReferences(rule, across(false))),
                movedValidations,
                movedRange,
                destinationRange,
                across(true),
                bounds,
              )
            : null;
          if (
            carried.every((rule): rule is ConditionalFormatRule => rule !== null) &&
            carried.length + conditionalFormats.length <= MAX_CONDITIONAL_FORMATS &&
            sourceValidations &&
            validationPlan
          ) {
            const conditionalRules = [
              ...carried,
              ...conditionalFormats.map((rule) => rewriteConditionalFormatReferences(rule, across(false))),
            ];
            moveConditionalFormatPlan = {
              rules: conditionalRules,
              changed: JSON.stringify(conditionalRules) !== JSON.stringify(conditionalFormats),
            };
            moveValidationPlan = {
              rules: validationPlan.rules,
              changed: JSON.stringify(validationPlan.rules) !== JSON.stringify(validations),
            };
            sourceSheetRules = { conditionalFormats: sourceConditional, validations: sourceValidations };
          }
        }
        const cutFileCopy = movedRange && moveConditionalFormatPlan
          ? cutConditionalFormatFileCopy({ source: crossSheetSource, sheet, movedRange, row, col, demoted: moveConditionalFormatPlan.demoted })
          : undefined;
        setActiveCell({ row, col });
        const moved = pasteGridIntoCells(
          row,
          col,
          pastePayload.map((pasteRow) => pasteRow.map((cell) => cell.raw)),
          clearKeys,
          pastePayload,
          clipboardMergesRef.current,
          {
            selectPasted: true,
            ...(moveValidationPlan ? { validationPlan: moveValidationPlan } : {}),
            ...(moveConditionalFormatPlan ? { conditionalFormatPlan: moveConditionalFormatPlan } : {}),
            ...(cutFileCopy ? { conditionalFormatFileCopy: cutFileCopy } : {}),
            ...(isMove && movedRange
              ? {
                  movedFrom: {
                    range: movedRange,
                    rowDelta: row - movedRange.r1,
                    colDelta: col - movedRange.c1,
                    sheetName: sheet.name || sheet.id,
                    ...(crossSheetSource
                      ? {
                          fromSheet: {
                            id: crossSheetSource.id,
                            name: crossSheetSource.name || crossSheetSource.id,
                            clearKeys: crossSheetClearKeys,
                            ...(sourceSheetRules ?? {}),
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          },
        );
        // A paste the destination refused moved nothing, so the Cut stays
        // armed with its moving border: the next paste elsewhere still MOVES
        // the cells, never leaves a copy behind with the source in place
        // (audit P-CUT-RETRY-STATE; Excel keeps Cut mode until a paste
        // lands, Esc or another edit).
        if (!moved && cutSource) {
          cutRangeRef.current = cutSource;
          setCutRange({ ...cutSource.range, sheetId: cutSource.sheetId });
        }
        return;
      }
      // A rich payload without its immutable Copy receipt is not allowed to
      // degrade to a cells-only paste. It may be a superseded or malformed
      // generation; fail closed before any worksheet/history write.
      if (!origin) return;

      const dimensions = pasteLinkSnapshotDimensions(rich);
      if (!dimensions) {
        // A snapshot the paste cannot consume (malformed, or past the paste
        // bounds) is refused with a reason, never silently (B047).
        toast({ title: t("toolbar.pasteFailed") });
        return;
      }
      const copiedMerges = clipboardMergesRef.current;
      const copiedConditionalFormats = conditionalFormatClipboardRef.current;
      const copiedValidations = validationClipboardRef.current;
      if (
        !dimensions ||
        !copiedConditionalFormats ||
        !copiedValidations ||
        origin.pageId !== pageId ||
        dimensions.rows !== origin.snapshotRows ||
        dimensions.cols !== origin.snapshotCols ||
        !Number.isSafeInteger(origin.row) ||
        !Number.isSafeInteger(origin.col) ||
        !Number.isSafeInteger(origin.sourceRowCount) ||
        !Number.isSafeInteger(origin.sourceColumnCount) ||
        origin.row < 0 ||
        origin.col < 0 ||
        origin.row + dimensions.rows > origin.sourceRowCount ||
        origin.col + dimensions.cols > origin.sourceColumnCount ||
        origin.row + dimensions.rows > MAX_SHEET_ROWS ||
        origin.col + dimensions.cols > MAX_SHEET_COLS ||
        !Number.isSafeInteger(row) ||
        !Number.isSafeInteger(col) ||
        row < 0 ||
        col < 0 ||
        row + dimensions.rows > MAX_SHEET_ROWS ||
        col + dimensions.cols > MAX_SHEET_COLS
      ) return;

      // Excel fills the SELECTION with the copy when the selection is a whole
      // number of copies in both directions: copy one formula, select a column
      // of cells, paste, and every cell gets it with its references shifted.
      // Pasting only at the active cell left the rest of the selection empty.
      // The copy is tiled from the selection's top-left, each tile shifted from
      // the copy's origin like any paste, its merged cells, conditional
      // formats and validation repeated with it (user audit F-002: a 2x3
      // merge pasted over 4x6 was laid once). A selection a merged cell
      // crosses refuses, as a single paste does.
      const tileRows = (selRect.r2 - selRect.r1 + 1) / dimensions.rows;
      const tileCols = (selRect.c2 - selRect.c1 + 1) / dimensions.cols;
      if (
        hasMultiSelection &&
        row >= selRect.r1 &&
        row <= selRect.r2 &&
        col >= selRect.c1 &&
        col <= selRect.c2 &&
        Number.isInteger(tileRows) &&
        Number.isInteger(tileCols) &&
        tileRows * tileCols > 1 &&
        (selRect.r2 - selRect.r1 + 1) * (selRect.c2 - selRect.c1 + 1) <= 50_000 &&
        selRect.r2 < MAX_SHEET_ROWS &&
        selRect.c2 < MAX_SHEET_COLS
      ) {
        const selectionSpan: MergeSpan = {
          row: selRect.r1,
          col: selRect.c1,
          rowSpan: selRect.r2 - selRect.r1 + 1,
          colSpan: selRect.c2 - selRect.c1 + 1,
        };
        const carriesMerges = copiedMerges.length > 0;
        const insideSelection = (existing: MergeSpan) =>
          existing.row >= selectionSpan.row &&
          existing.col >= selectionSpan.col &&
          existing.row + existing.rowSpan <= selectionSpan.row + selectionSpan.rowSpan &&
          existing.col + existing.colSpan <= selectionSpan.col + selectionSpan.colSpan;
        // A copy with merges lays its own over the selection, replacing the
        // merges inside it; one without keeps to a selection no merge touches.
        const tileable = !mergeSpans.some(
          (existing) =>
            spansOverlap(existing, selectionSpan) && (!carriesMerges || !insideSelection(existing)),
        );
        const validTileMerges =
          !carriesMerges ||
          (copiedMerges.every(
            (span) =>
              Number.isSafeInteger(span.row) &&
              Number.isSafeInteger(span.col) &&
              Number.isSafeInteger(span.rowSpan) &&
              Number.isSafeInteger(span.colSpan) &&
              span.row >= 0 &&
              span.col >= 0 &&
              span.rowSpan > 0 &&
              span.colSpan > 0 &&
              span.row + span.rowSpan <= dimensions.rows &&
              span.col + span.colSpan <= dimensions.cols,
          ) &&
            copiedMerges.every((span, index) =>
              copiedMerges.every((peer, at) => at <= index || !spansOverlap(span, peer)),
            ));
        if (tileable && validTileMerges) {
          if (rangeHasLockedCellRef.current(sheet, selRect)) {
            showProtectNotice();
            return;
          }
          const tiled: ReturnType<typeof standardPasteGrid> = [];
          // The source's validation rules are planned for every tile, one
          // after another, so a validated cell reaches the whole selection
          // (live audit B155); a tile the planner refuses refuses the paste.
          // Each copied rule is planned once for every copy at once, so a
          // validated or conditionally formatted cell pasted down a column is
          // one rule over it, not one per cell.
          const sourceRange = {
            r1: origin.row,
            c1: origin.col,
            r2: origin.row + dimensions.rows - 1,
            c2: origin.col + dimensions.cols - 1,
          };
          const plannerBounds = {
            maxRow: Math.max(sheet.rowCount, selRect.r2 + 1) - 1,
            maxCol: Math.max(sheet.columnCount, selRect.c2 + 1) - 1,
          };
          let tiledValidationPlan: { rules: ValidationRule[]; changed: boolean } | undefined;
          if (copiedValidations.length > 0) {
            const plan = planRulesForTiledValidationPaste(
              validations,
              copiedValidations,
              sourceRange,
              selRect,
              shiftFormula,
              plannerBounds,
            );
            if (!plan) {
              toast({ title: t("toolbar.pasteFailed") });
              return;
            }
            tiledValidationPlan = plan;
          }
          // Past the page's bound the file pastes, as on a single paste
          
          const copiedSheet = sheets.find((candidate) => candidate.id === origin.sheetId);
          const tiledFormatPaste = planRulesWithFile(
            planRulesForTiledFormatPaste,
            conditionalFormats,
            copiedConditionalFormats,
            sourceRange,
            selRect,
            listedRuleCount(copiedSheet),
            plannerBounds,
            { merge: pasteOptions.mergeConditionalFormats === true },
          );
          if (!tiledFormatPaste) {
            toast({ title: t("toolbar.pasteFailed") });
            return;
          }
          const tiledConditionalFormatPlan = tiledFormatPaste.plan;
          const tiledFileCopy = conditionalFormatFileCopyOf(
            tiledFormatPaste.fileCopy,
            copiedSheet,
            sheet.id,
            sourceRange,
            { row: selRect.r1, col: selRect.c1 },
            {
              tiles: [tileRows, tileCols],
              ...(origin.sourceRows ? { rows: origin.sourceRows } : {}),
              ...(pasteOptions.mergeConditionalFormats === true ? { merge: true as const } : {}),
            },
          );
          const tiledMerges: MergeSpan[] = [];
          for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
            for (let tileCol = 0; tileCol < tileCols; tileCol += 1) {
              for (const span of copiedMerges) {
                tiledMerges.push({
                  ...span,
                  row: span.row + tileRow * dimensions.rows,
                  col: span.col + tileCol * dimensions.cols,
                });
              }
            }
          }
          for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
            for (let tileCol = 0; tileCol < tileCols; tileCol += 1) {
              const top = selRect.r1 + tileRow * dimensions.rows;
              const left = selRect.c1 + tileCol * dimensions.cols;
              const shifted = standardPasteGrid(
                rich,
                top - origin.row,
                left - origin.col,
              );
              const tile = pasteOptions.values
                ? valuesWithSourceFormatting(shifted)
                : shifted;
              if (
                tile.length !== dimensions.rows ||
                tile.some((tileLine) => tileLine.length !== dimensions.cols)
              ) return;
              tile.forEach((tileLine, offset) => {
                const line = (tiled[top - selRect.r1 + offset] ??= []);
                tileLine.forEach((cell, cellOffset) => {
                  line[left - selRect.c1 + cellOffset] = cell;
                });
              });
            }
          }
          pasteGridIntoCells(
            selRect.r1,
            selRect.c1,
            tiled.map((line) => line.map((cell) => cell.raw)),
            undefined,
            tiled,
            tiledMerges,
            {
              selectPasted: true,
              skipIfUnchanged: true,
              ...(carriesMerges ? { authoritativeMerges: true } : {}),
              ...(tiledConditionalFormatPlan.changed || tiledFileCopy ? { conditionalFormatPlan: tiledConditionalFormatPlan } : {}),
              ...(tiledFileCopy ? { conditionalFormatFileCopy: tiledFileCopy } : {}),
              ...(tiledValidationPlan ? { validationPlan: tiledValidationPlan } : {}),
              skipBlankSources: pasteOptions.skipBlanks === true,
              expandTables: true,
            },
          );
          return;
        }
      }

      // A malformed companion snapshot must never be partially ignored while
      // its cells/rules still paste. Transposition and No Borders use the same
      // fail-closed topology boundary.
      const validMergeSnapshot = copiedMerges.every(
        (span) =>
          Number.isSafeInteger(span.row) &&
          Number.isSafeInteger(span.col) &&
          Number.isSafeInteger(span.rowSpan) &&
          Number.isSafeInteger(span.colSpan) &&
          span.row >= 0 &&
          span.col >= 0 &&
          span.rowSpan > 0 &&
          span.colSpan > 0 &&
          span.row + span.rowSpan <= dimensions.rows &&
          span.col + span.colSpan <= dimensions.cols,
      );
      if (!validMergeSnapshot) return;
      for (let index = 0; index < copiedMerges.length; index += 1) {
        for (let peer = index + 1; peer < copiedMerges.length; peer += 1) {
          if (spansOverlap(copiedMerges[index], copiedMerges[peer])) return;
        }
      }

      const destinationRange = {
        r1: row,
        c1: col,
        r2: row + dimensions.rows - 1,
        c2: col + dimensions.cols - 1,
      };
      const destinationSpan: MergeSpan = {
        row,
        col,
        rowSpan: dimensions.rows,
        colSpan: dimensions.cols,
      };
      const crossesExistingMerge = mergeSpans.some(
        (existing) =>
          spansOverlap(existing, destinationSpan) &&
          !(
            existing.row >= destinationSpan.row &&
            existing.col >= destinationSpan.col &&
            existing.row + existing.rowSpan <=
              destinationSpan.row + destinationSpan.rowSpan &&
            existing.col + existing.colSpan <=
              destinationSpan.col + destinationSpan.colSpan
          ),
      );
      if (crossesExistingMerge) {
        // The refusal names its reason: a paste that would cut a merged cell
        // is a merge-boundary problem, not a locked cell.
        showProtectNotice(t("spreadsheet.pasteBlockedByMerge"));
        return;
      }
      if (rangeHasLockedCellRef.current(sheet, destinationRange)) {
        showProtectNotice();
        return;
      }

      const sourceRange = {
        r1: origin.row,
        c1: origin.col,
        r2: origin.row + dimensions.rows - 1,
        c2: origin.col + dimensions.cols - 1,
      };
      const nextRowCount = Math.max(sheet.rowCount, destinationRange.r2 + 1);
      const nextColumnCount = Math.max(
        sheet.columnCount,
        destinationRange.c2 + 1,
      );
      const plannerBounds = {
        maxRow: nextRowCount - 1,
        maxCol: nextColumnCount - 1,
      };
      // The copied sheet: a page lists its first MAX_CONDITIONAL_FORMATS
      // rules and the file keeps the rest, which the write-back pastes, as
      
      const copiedSheet = sheets.find((candidate) => candidate.id === origin.sheetId);
      const formatPaste = planRulesForFormatPasteWithFile(
        conditionalFormats,
        copiedConditionalFormats,
        sourceRange,
        destinationRange,
        listedRuleCount(copiedSheet),
        plannerBounds,
        // Paste Special > All merging conditional formats keeps the
        // destination's rules beside the copied ones (XLS-A063).
        { merge: pasteOptions.mergeConditionalFormats === true },
      );
      const conditionalFormatPlan = formatPaste?.plan ?? null;
      const conditionalFormatFileCopy = conditionalFormatFileCopyOf(
        formatPaste?.fileCopy,
        copiedSheet,
        sheet.id,
        sourceRange,
        { row: destinationRange.r1, col: destinationRange.c1 },
        {
          ...(origin.sourceRows ? { rows: origin.sourceRows } : {}),
          
          ...(pasteOptions.mergeConditionalFormats === true ? { merge: true as const } : {}),
        },
      );
      const validationPlan = planRulesForValidationPaste(
        validations,
        copiedValidations,
        sourceRange,
        destinationRange,
        shiftFormula,
        plannerBounds,
      );
      if (!conditionalFormatPlan || !validationPlan) {
        // A rule the paste cannot place refuses it with a reason, never
        // silently (B047, S-045); past the sheet's rule bound, that reason
        
        toast({
          title: t(
            !validationPlan && validationPasteOverRuleLimit(validations, copiedValidations)
              ? "spreadsheet.validationRuleLimitPaste"
              : "toolbar.pasteFailed",
          ),
        });
        return;
      }

      const shiftedPayload = standardPasteGrid(
        rich,
        row - origin.row,
        col - origin.col,
      );
      const pastePayload = pasteOptions.values
        ? valuesWithSourceFormatting(shiftedPayload)
        : shiftedPayload;
      if (
        pastePayload.length !== dimensions.rows ||
        pastePayload.some((pasteRow) => pasteRow.length !== dimensions.cols)
      ) return;

      setActiveCell({ row, col });
      pasteGridIntoCells(
        row,
        col,
        pastePayload.map((pasteRow) => pasteRow.map((cell) => cell.raw)),
        undefined,
        pastePayload,
        copiedMerges,
        {
          selectPasted: true,
          skipIfUnchanged: true,
          authoritativeMerges: true,
          conditionalFormatPlan,
          validationPlan,
          ...(conditionalFormatFileCopy ? { conditionalFormatFileCopy } : {}),
          skipBlankSources: pasteOptions.skipBlanks === true,
          expandTables: true,
        },
      );
    },
    [
      conditionalFormats,
      consumeCutMove,
      mergeSpans,
      pageId,
      pasteGridIntoCells,
      sheet,
      sheets,
      showProtectNotice,
      validations,
      hasMultiSelection,
      selRect,
    ],
  );

  /**
   * Finish a selection-outline drag. Microsoft Support, "Move or copy cells
   * and cell contents": dragging the border moves the range and "this is the
   * same as cut and paste", Ctrl+drag copies it, and dropping on cells that
   * already hold something asks first. So the commit IS the cut/copy + paste
   * seam — one commit, one Undo step, and the whole reference-retargeting
   * rule (formulas that moved keep their references, references INTO the
   * moved range follow it) comes along unchanged.
   */
  const commitSelectionMoveDrag = useCallback(
    (
      src: { r1: number; r2: number; c1: number; c2: number },
      target: { row: number; col: number },
      copy: boolean,
    ) => {
      if (target.row === src.r1 && target.col === src.c1) return;
      const rowShift = target.row - src.r1;
      const colShift = target.col - src.c1;
      const destination = {
        r1: src.r1 + rowShift,
        r2: src.r2 + rowShift,
        c1: src.c1 + colShift,
        c2: src.c2 + colShift,
      };
      if (
        destination.r1 < 0 ||
        destination.c1 < 0 ||
        destination.r2 >= sheet.rowCount ||
        destination.c2 >= sheet.columnCount
      ) {
        return;
      }
      if (
        rangeHasLockedCellRef.current(sheet, src) ||
        rangeHasLockedCellRef.current(sheet, destination)
      ) {
        showProtectNotice();
        return;
      }
      const run = () => {
        // The selection is still the source, which is what cut/copy reads.
        if (copy) copySelection();
        else cutSelection();
        pasteOwnRichClipboard(destination.r1, destination.c1);
        setActiveCell({ row: destination.r1, col: destination.c1 });
        setSelectionAnchor({ row: destination.r2, col: destination.c2 });
      };
      // "There's already data here. Do you want to replace it?" — asked only
      // about cells the move does not vacate itself.
      let occupied = false;
      for (let row = destination.r1; row <= destination.r2 && !occupied; row += 1) {
        for (let col = destination.c1; col <= destination.c2; col += 1) {
          if (
            !copy &&
            row >= src.r1 &&
            row <= src.r2 &&
            col >= src.c1 &&
            col <= src.c2
          ) {
            continue;
          }
          const cell = sheet.cells[`${row}:${col}`];
          if (
            cell &&
            ((cell.value ?? "") !== "" ||
              (cell.formula ?? "") !== "" ||
              hasCellMetadata(cell))
          ) {
            occupied = true;
            break;
          }
        }
      }
      if (occupied) {
        setOverwriteConfirm({
          title: t("spreadsheet.dragDropOverwriteConfirm"),
          onConfirm: run,
        });
        return;
      }
      run();
    },
    [
      copySelection,
      cutSelection,
      pasteOwnRichClipboard,
      setActiveCell,
      setSelectionAnchor,
      sheet,
      showProtectNotice,
      t,
    ],
  );
  // cutSelection/copySelection/pasteOwnRichClipboard are re-made every render,
  // so the commit is read through a ref: the drag's window listeners are
  // attached once per drag instead of once per render.
  const commitSelectionMoveDragRef = useRef(commitSelectionMoveDrag);
  commitSelectionMoveDragRef.current = commitSelectionMoveDrag;
  // Track the drop target at the window level, the way the fill-handle drag
  // does, so the drag survives leaving the cell it started on.
  useEffect(() => {
    if (!selectionMoveDrag) return;
    const cancel = () => {
      selectionMoveDragRef.current = null;
      setSelectionMoveDrag(null);
    };
    const onMove = (event: PointerEvent) => {
      const drag = selectionMoveDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      if (
        drag.sourceWorkbook !== liveSheetsRef.current ||
        drag.sourceSheet !==
          liveSheetsRef.current[liveActiveSheetIndexRef.current] ||
        !dataDialogWriteAllowedRef.current
      ) {
        cancel();
        return;
      }
      // A gridline is the cell's own box (data-range-cell), as for the fill handle.
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-cell], [data-range-cell]");
      const attr = element?.getAttribute("data-cell") ?? element?.getAttribute("data-range-cell");
      if (!attr || !rootRef.current?.contains(element!)) return;
      const [rowPart, colPart] = attr.split(":");
      const under = { row: Number(rowPart), col: Number(colPart) };
      if (!Number.isFinite(under.row) || !Number.isFinite(under.col)) return;
      // The range keeps the grip it was taken by, and stays on the sheet.
      const height = drag.src.r2 - drag.src.r1;
      const width = drag.src.c2 - drag.src.c1;
      const target = {
        row: Math.max(
          0,
          Math.min(
            drag.sourceSheet.rowCount - 1 - height,
            under.row - drag.grab.row,
          ),
        ),
        col: Math.max(
          0,
          Math.min(
            drag.sourceSheet.columnCount - 1 - width,
            under.col - drag.grab.col,
          ),
        ),
      };
      const copy = event.ctrlKey || event.metaKey;
      if (
        drag.target.row === target.row &&
        drag.target.col === target.col &&
        drag.copy === copy
      ) {
        return;
      }
      drag.target = target;
      drag.copy = copy;
      setSelectionMoveDrag({ src: drag.src, target, copy });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== selectionMoveDragRef.current?.pointerId) return;
      onMove(event);
      const drag = selectionMoveDragRef.current;
      cancel();
      if (
        drag &&
        drag.sourceWorkbook === liveSheetsRef.current &&
        drag.sourceSheet ===
          liveSheetsRef.current[liveActiveSheetIndexRef.current] &&
        dataDialogWriteAllowedRef.current
      ) {
        // Excel decides copy-vs-move by the modifier held AT THE DROP.
        commitSelectionMoveDragRef.current(
          drag.src,
          drag.target,
          event.ctrlKey || event.metaKey,
        );
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === selectionMoveDragRef.current?.pointerId) cancel();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", cancel);
    };
  }, [selectionMoveDrag]);

  // After a paste: a paste of MRAI's own clipboard keeps Copy mode's moving
  // border, and a paste that committed gets its Paste Options button at the
  // pasted block's last cell (a Copy filling a larger selection covers all of
  // it; Transpose swaps the block). Reads the selection from refs so the
  // paste handlers keep their identity.
  const noteClipboardPaste = useCallback(
    (
      before: SheetModel[],
      row: number,
      col: number,
      own: boolean,
      source: SpreadsheetPasteOptionsOffer["source"] | null,
      choice: PasteOptionsChoice = "paste",
    ) => {
      const committed = liveSheetsRef.current;
      if (own) copyMarqueeKeepRef.current.add(committed);
      if (!source || committed === before) return;
      const dimensions =
        source.kind === "own"
          ? pasteLinkSnapshotDimensions(source.clipboard)
          : {
              rows: source.rows.length,
              cols: Math.max(1, ...source.rows.map((line) => line.length)),
            };
      if (!dimensions) return;
      let rows = choice === "transpose" ? dimensions.cols : dimensions.rows;
      let cols = choice === "transpose" ? dimensions.rows : dimensions.cols;
      let top = row;
      let left = col;
      const [, , r1, c1, r2, c2] = computedSelectionRef.current
        .split(":")
        .map(Number);
      const spanRows = r2 - r1 + 1;
      const spanCols = c2 - c1 + 1;
      if (
        choice === "paste" &&
        source.kind === "own" &&
        spanRows * spanCols > 1 &&
        spanRows % rows === 0 &&
        spanCols % cols === 0
      ) {
        top = r1;
        left = c1;
        rows = spanRows;
        cols = spanCols;
      }
      setPasteOptionsOffer({
        committed,
        // The paste leaves the pasted rectangle selected (Excel), and this
        // render has not run yet, so the key is the selection the paste is
        // about to produce — not the one the click started from.
        selectionKey: `${committed[liveActiveSheetIndexRef.current]?.id}:${top}:${left}:${top}:${left}:${top + rows - 1}:${left + cols - 1}`,
        row,
        col,
        bottom: top + rows - 1,
        right: left + cols - 1,
        choice,
        source,
      });
    },
    [],
  );

  // A formatted paste from another application (Excel, Sheets, a web page):
  // its cells, formats and merges land, a table directly above grows to take
  // them, and Paste Options offers Keep Source / Match Destination Formatting.
  // A paste cut to the bound is reported, never silently shortened.
  const announcePasteTruncated = useCallback(() => {
    toast({
      variant: "destructive",
      description: t("spreadsheet.pasteTruncated", {
        rows: PASTE_MAX_ROWS.toLocaleString(),
        cols: PASTE_MAX_COLS.toLocaleString(),
      }),
    });
  }, [t]);
  const pasteForeignHtml = useCallback(
    (
      row: number,
      col: number,
      parsed: NonNullable<ReturnType<typeof parseSpreadsheetClipboardHtml>>,
    ) => {
      const before = liveSheetsRef.current;
      pasteGridIntoCells(
        row,
        col,
        parsed.rows,
        undefined,
        parsed.cells,
        parsed.merges,
        { selectPasted: true, expandTables: true },
      );
      noteClipboardPaste(
        before,
        row,
        col,
        false,
        parsed.hasRichMetadata
          ? {
              kind: "html",
              rows: parsed.rows,
              cells: parsed.cells,
              merges: parsed.merges,
            }
          : { kind: "text", rows: parsed.rows },
        parsed.hasRichMetadata
          ? "keep-source-formatting"
          : "match-destination-formatting",
      );
    },
    [noteClipboardPaste, pasteGridIntoCells],
  );

  const handleCellPaste = useCallback(
    (
      event: ReactClipboardEvent<HTMLInputElement>,
      row: number,
      col: number,
    ) => {
      // A single value would fall through to the readOnly input of a locked
      // cell and be dropped silently; Excel refuses the paste with its
      // protected-sheet message whatever the clipboard holds.
      if (lockedCellEntryBlocked(row, col)) {
        event.preventDefault();
        refuseLockedCellEntryRef.current(row, col);
        return;
      }
      // getData() throws SecurityError when clipboard access is restricted
      // (cross-origin frame, permission denial); degrade to an empty paste
      // instead of crashing the handler (matches clipboardHasEditableText).
      let text = "";
      let html = "";
      try {
        text = event.clipboardData.getData("text/plain");
        html = event.clipboardData.getData("text/html");
      } catch {
        text = "";
        html = "";
      }
      // A Copy or Cut of this grid still waiting for the calculation has not
      // reached the system clipboard: the Paste waits for it and takes what
      // it put on the grid's clipboard, not the text from before (live audit
      // S-032). When it put nothing there, the Paste is the clipboard's.
      if (pendingGridClipboardRef.current) {
        const serial = gridClipboardSerialRef.current;
        const target = event.currentTarget;
        const getData = (type: string) => {
          if (gridClipboardSerialRef.current === serial) return type === "text/html" ? html : text;
          const mark = lastCopiedHtmlMarkRef.current;
          if (type === "text/html") return mark ? `<table data-mrai-copy="${mark}"></table>` : "";
          return lastCopiedTextRef.current ?? "";
        };
        const replay = { currentTarget: target, target, clipboardData: { getData }, preventDefault() {}, stopPropagation() {} } as unknown as ReactClipboardEvent<HTMLInputElement>;
        if (deferComputedActionRef.current("handleCellPaste", [replay, row, col])) { event.preventDefault(); return; }
      }
      // The sheet's own object copy (Cut / Copy of a picture or shape), or a
      // picture copied in another application -- which writes the picture
      // and an <img> naming it -- pastes as a drawing object at the active
      // cell, as Excel pastes a copied picture.
      if (
        (readSheetObjectClipboardToken(html) !== null ||
          (!text && clipboardHtmlHoldsOnlyPictures(html))) &&
        pasteObjectClipboardRef.current?.(event.clipboardData)
      ) {
        event.preventDefault();
        return;
      }
      if (calculationPendingRef.current && (text.includes("\t") || text.includes("\n") || html)) {
        const target = event.currentTarget;
        const replay = { currentTarget: target, target, clipboardData: { getData: (type: string) => type === "text/html" ? html : text }, preventDefault() {}, stopPropagation() {} } as unknown as ReactClipboardEvent<HTMLInputElement>;
        if (deferComputedActionRef.current("handleCellPaste", [replay, row, col])) { event.preventDefault(); return; }
      }
      // A clipboard that holds only a picture (Copy as Picture, a screenshot)
      // pastes as a floating picture at the active cell, as Excel does,
      // instead of an empty text paste that silently does nothing (live audit
      // B241). A picture next to text or HTML is left to the text paste.
      if (!text && !html) {
        let picture: File | null = null;
        try {
          picture =
            Array.from(event.clipboardData.files ?? []).find((file) =>
              file.type.toLowerCase().startsWith("image/"),
            ) ?? null;
        } catch {
          picture = null;
        }
        if (picture) {
          event.preventDefault();
          if (!pastePictureFileRef.current?.(picture)) {
            toast({
              variant: "destructive",
              description: t("spreadsheet.insertRibbon.pictureSourceChanged"),
            });
          }
          return;
        }
      }
      const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
      const rich = richClipboardRef.current;
      const lastCopied = lastCopiedTextRef.current;
      // The same text is not the same clipboard: the HTML must be the one
      // this grid wrote (its mark), or absent when it wrote none (live audit
      // B431: another app's "10" reused the old formula and moved an old cut).
      const ownMark = lastCopiedHtmlMarkRef.current;
      const htmlIsOurs = ownMark ? html.includes(`data-mrai-copy="${ownMark}"`) : html.trim() === "";
      const isOwnPayload =
        rich !== null &&
        lastCopied !== null &&
        htmlIsOurs &&
        normalized === lastCopied.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
      const cutArmed = cutRangeRef.current !== null;
      const foreignHtml = !isOwnPayload
        ? parseSpreadsheetClipboardHtml(html, { baseRow: row, baseCol: col })
        : null;
      // Only intercept genuine multi-cell pastes; single values fall through to
      // the native input so mid-cell editing still works — UNLESS a single-cell
      // CUT of our own payload is armed, in which case we must intercept to clear
      // the source (a move), even though the value has no tab/newline. A foreign
      // single-cell HTML payload is intercepted only when it carries formatting,
      // a hyperlink or an explicit Office formula attribute.
      // Our own copy of several cells is never a single value, even when
      // every cell shows nothing (a ;;; format): its text is only separators,
      // which the trailing-newline trim above empties (live audit S-107).
      const ownMultiCellPayload =
        isOwnPayload &&
        rich !== null &&
        (rich.length > 1 || (rich[0]?.length ?? 0) > 1);
      const singleValue =
        !ownMultiCellPayload &&
        !normalized.includes("\t") &&
        !normalized.includes("\n");
      // A cell being edited (typed into, or F2) takes a pasted single value
      // as text at the caret or over the selected text, wherever the caret
      // is: Excel pastes into the cell editor while an entry is open, and
      // Escape still discards it (live audit B249). Only a cell that is not
      // being edited takes a 1x1 own Copy as the grid command, through the
      // same all-attributes seam as every rectangular Copy; stale/missing
      // receipts are routed there too so they fail closed instead of leaking
      // the guarded system-clipboard text into the cell.
      const cellTextEditing =
        event.currentTarget.dataset.editing === "true";
      const ownSingleCellGridPaste =
        isOwnPayload &&
        rich?.length === 1 &&
        rich[0]?.length === 1 &&
        copyOriginRef.current?.kind !== "cut" &&
        !cellTextEditing;
      const htmlHasMultipleCells =
        Boolean(foreignHtml) &&
        (foreignHtml!.rows.length > 1 ||
          Math.max(0, ...foreignHtml!.rows.map((line) => line.length)) > 1);
      if (
        singleValue &&
        !(cutArmed && isOwnPayload) &&
        !ownSingleCellGridPaste &&
        !htmlHasMultipleCells &&
        !foreignHtml?.hasRichMetadata
      ) {
        return;
      }
      // Lines of text pasted into an open entry are the entry's text, line
      // breaks included, at the caret: Excel pastes into the cell editor while
      // an entry is open, and the cell below is never written (live audit
      // S-161: "aa⏎aa" pasted after X in F2 overwrote that cell and the next).
      if (
        cellTextEditing &&
        !normalized.includes("\t") &&
        !ownMultiCellPayload &&
        !htmlHasMultipleCells &&
        !(cutArmed && isOwnPayload)
      ) {
        const editor = event.currentTarget;
        // A multi-line editor takes the paste natively.
        if (editor instanceof HTMLTextAreaElement) return;
        const write = writeOpenEntryTextRef.current;
        if (write) {
          event.preventDefault();
          const value = editor.value ?? "";
          const start = editor.selectionStart ?? value.length;
          const end = editor.selectionEnd ?? start;
          const pasted = text.replace(/\r\n?/g, "\n");
          write(row, col, editor, value.slice(0, start) + pasted + value.slice(end), start + pasted.length);
          return;
        }
      }
      event.preventDefault();
      setActiveCell({ row, col });
      // If this is a paste of OUR OWN last copy, re-source the RAW values (with
      // formulas intact) from the rich snapshot: the system clipboard is
      // formula-injection guarded for foreign apps (=… becomes '=…), but an
      // in-app round-trip must keep the live formula, so bypass the guarded text.
      if (rich && isOwnPayload) {
        const before = liveSheetsRef.current;
        // Excel shows no Paste Options after a Cut is moved.
        const offered = copyOriginRef.current?.kind === "copy" && !cutArmed;
        pasteOwnRichClipboard(row, col);
        noteClipboardPaste(
          before,
          row,
          col,
          true,
          offered ? { kind: "own", clipboard: rich } : null,
        );
        return;
      }
      // A foreign paste lands fresh content; a previously-armed cut is abandoned
      // (Excel cancels the cut when you paste something else).
      if (cutArmed) {
        cutRangeRef.current = null;
        setCutRange((prev) => (prev ? null : prev));
      }
      if (foreignHtml) {
        if (foreignHtml.truncated) announcePasteTruncated();
        pasteForeignHtml(row, col, foreignHtml);
        return;
      }
      // Quote-aware parse (tab delimiter) so a clipboard cell holding a tab,
      // newline or quote — ours or Excel/Sheets' — lands in a single cell.
      const limited = limitPastedGrid(parseCsv(normalized, "\t"));
      const rows = limited.rows;
      if (limited.truncated) announcePasteTruncated();
      // Plain text is entered as if typed: "50%" is 0.5 shown as 50%.
      const before = liveSheetsRef.current;
      pasteGridIntoCells(row, col, rows, undefined, undefined, undefined, {
        selectPasted: true,
        parseEntries: { locale, date1904: excelDateSystemArg(workbookDateSystemRef.current) },
        expandTables: true,
      });
      noteClipboardPaste(
        before,
        row,
        col,
        false,
        { kind: "text", rows },
        "match-destination-formatting",
      );
    },
    [
      announcePasteTruncated,
      locale,
      lockedCellEntryBlocked,
      noteClipboardPaste,
      pasteForeignHtml,
      pasteGridIntoCells,
      pasteOwnRichClipboard,
      showProtectNotice,
    ],
  );

  // Programmatic paste from the INTERNAL (rich) clipboard at the active cell —
  // backs the context-menu "Paste" (which has no native paste event to ride). It
  // pastes the raw values of the last copy/cut and, when a cut is armed, clears
  // the (non-overlapping) source in the same commit (move). A no-op when nothing
  // has been copied/cut this session.
  const pasteFromInternalClipboard = useCallback(
    (row: number, col: number) => {
      const rich = richClipboardRef.current;
      const before = liveSheetsRef.current;
      const offered =
        copyOriginRef.current?.kind === "copy" && cutRangeRef.current === null;
      pasteOwnRichClipboard(row, col);
      noteClipboardPaste(
        before,
        row,
        col,
        true,
        offered && rich ? { kind: "own", clipboard: rich } : null,
      );
    },
    [noteClipboardPaste, pasteOwnRichClipboard],
  );

  // Excel Home > Paste > Picture: turn the exact detached Copy-time range
  // layout into one static image object. It deliberately does NOT re-read the
  // source sheet at activation time (that would be Linked Picture semantics),
  // but it does re-authenticate the same-page stable receipt + rich generation
  // before rasterising or entering the worksheet save/Undo boundary.
  const resolvePastePictureAuthority = useCallback(() => {
    const snapshot = pastePictureClipboardRef.current;
    const rich = richClipboardRef.current;
    const origin = copyOriginRef.current;
    const dimensions = pasteLinkSnapshotDimensions(rich);
    if (
      !snapshot ||
      !rich ||
      snapshot.rich !== rich ||
      !origin ||
      origin.kind !== "copy" ||
      origin.pageId !== pageId ||
      snapshot.pageId !== pageId ||
      snapshot.workbookIdentity !== rangeClipboardWorkbookIdentityRef.current ||
      origin.sheetId !== snapshot.sheetId ||
      !sheets.some((candidate) => candidate.id === snapshot.sheetId) ||
      cutRangeRef.current !== null ||
      !dimensions ||
      dimensions.rows !== origin.snapshotRows ||
      dimensions.cols !== origin.snapshotCols ||
      dimensions.rows !== snapshot.rows ||
      dimensions.cols !== snapshot.cols
    ) {
      return null;
    }
    return snapshot;
  }, [pageId, sheets]);

  const pastePictureAvailable = Boolean(
    !sheetProtectionAllowsRef.current(sheet, "editObjects") !== true &&
    hasRichClipboard &&
    sheetObjects.length < MAX_SHEET_OBJECTS &&
    resolvePastePictureAuthority(),
  );

  const pasteAsPicture = useCallback(() => {
    if (!sheetProtectionAllowsRef.current(sheet, "editObjects")) {
      showProtectNotice();
      return;
    }
    const snapshot = resolvePastePictureAuthority();
    if (
      !snapshot ||
      sheetObjects.length >= MAX_SHEET_OBJECTS ||
      !Number.isSafeInteger(activeCell.row) ||
      !Number.isSafeInteger(activeCell.col) ||
      activeCell.row < 0 ||
      activeCell.col < 0 ||
      activeCell.row >= MAX_SHEET_ROWS ||
      activeCell.col >= MAX_SHEET_COLS
    ) {
      return;
    }

    const dataUrl = rangeLayoutToPngDataUrl(snapshot.layout);
    if (!dataUrl) return;
    const picture = buildImageObject(dataUrl, activeCell);
    if (!picture) return;
    const widthEmu = cssPixelsToEmu(snapshot.layout.canvasWidth);
    const heightEmu = cssPixelsToEmu(snapshot.layout.canvasHeight);
    if (
      !Number.isSafeInteger(widthEmu) ||
      !Number.isSafeInteger(heightEmu) ||
      widthEmu <= 0 ||
      heightEmu <= 0
    ) {
      return;
    }

    const imageObject = {
      ...picture,
      anchor: {
        ...picture.anchor,
        kind: "oneCell" as const,
        // buildImageObject accepts the editor's legacy `{ row, col }` point,
        // while persisted SpreadsheetObject anchors are schema-canonical
        // `{ row, column }`. Replace the whole point so `col` cannot leak into
        // content_json and make a later workbook reload fail validation.
        from: { row: activeCell.row, column: activeCell.col },
        widthEmu,
        heightEmu,
      },
    } as unknown as SpreadsheetObject;
    replaceActiveSheet({
      ...sheet,
      objects: [...sheetObjects, imageObject],
    });
    contextualTabActivationRef.current = { contextual: "object" };
    setSelectedObjectId(imageObject.id);
  }, [
    activeCell,
    replaceActiveSheet,
    resolvePastePictureAuthority,
    sheet,
    sheetObjects,
    showProtectNotice,
  ]);

  // Where a Paste Special lays the copy: Excel fills the whole selection when
  // it is a whole number of copies in both directions, exactly as a plain
  // paste does (one formatted cell pasted as Formats/Values/Formulas over
  // three selected cells reaches all three). Otherwise the copy lands once at
  // the active cell. A selection a merged cell touches is pasted once, as the
  // single-copy paths already handle merges (live audit S-104).
  const pasteSpecialTiles = useCallback(
    (rows: number, cols: number) => {
      const single = {
        origins: [{ row: activeCell.row, col: activeCell.col }],
        range: {
          r1: activeCell.row,
          c1: activeCell.col,
          r2: activeCell.row + rows - 1,
          c2: activeCell.col + cols - 1,
        },
        tiled: false,
      };
      if (!hasMultiSelection || rows < 1 || cols < 1) return single;
      const height = selRect.r2 - selRect.r1 + 1;
      const width = selRect.c2 - selRect.c1 + 1;
      const tileRows = height / rows;
      const tileCols = width / cols;
      if (
        !Number.isInteger(tileRows) ||
        !Number.isInteger(tileCols) ||
        tileRows * tileCols <= 1 ||
        height * width > 50_000 ||
        selRect.r2 >= MAX_SHEET_ROWS ||
        selRect.c2 >= MAX_SHEET_COLS ||
        activeCell.row < selRect.r1 ||
        activeCell.row > selRect.r2 ||
        activeCell.col < selRect.c1 ||
        activeCell.col > selRect.c2
      ) {
        return single;
      }
      const selectionSpan: MergeSpan = {
        row: selRect.r1,
        col: selRect.c1,
        rowSpan: height,
        colSpan: width,
      };
      if (mergeSpans.some((existing) => spansOverlap(existing, selectionSpan))) {
        return single;
      }
      const origins: Array<{ row: number; col: number }> = [];
      for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
        for (let tileCol = 0; tileCol < tileCols; tileCol += 1) {
          origins.push({
            row: selRect.r1 + tileRow * rows,
            col: selRect.c1 + tileCol * cols,
          });
        }
      }
      return {
        origins,
        range: { r1: selRect.r1, c1: selRect.c1, r2: selRect.r2, c2: selRect.c2 },
        tiled: true,
      };
    },
    [activeCell, hasMultiSelection, mergeSpans, selRect],
  );

  // Paste-special actions (粘贴值 / 转置粘贴 / 粘贴格式) over the rich snapshot.
  const pasteValuesOnly = useCallback(() => {
    const clip = richClipboardRef.current;
    if (!clip) return;
    const grid = valuesOnlyGrid(clip);
    if (!grid.length) return;
    const width = Math.max(0, ...grid.map((row) => row.length));
    const tiles = pasteSpecialTiles(grid.length, width);
    const tiled = layPasteTiles(tiles.origins, tiles.range, () => grid);
    pasteGridIntoCells(
      tiles.range.r1,
      tiles.range.c1,
      tiled.map((row) => row.map((content) => content.raw)),
      undefined,
      undefined,
      undefined,
      { selectPasted: true, typedContent: tiled },
    );
  }, [pasteGridIntoCells, pasteSpecialTiles]);

  // The full transposed paste; Skip blanks rides along from Paste Special.
  const pasteTransposedWith = useCallback((skipBlanks: boolean) => {
    const clip = richClipboardRef.current;
    const origin = copyOriginRef.current;
    const dimensions = pasteLinkSnapshotDimensions(clip);
    const copiedMerges = clipboardMergesRef.current;
    const copiedConditionalFormats = conditionalFormatClipboardRef.current;
    const copiedValidations = validationClipboardRef.current;
    if (
      !clip ||
      !origin ||
      !copiedConditionalFormats ||
      !copiedValidations ||
      origin.kind !== "copy" ||
      origin.pageId !== pageId ||
      cutRangeRef.current !== null ||
      !dimensions ||
      dimensions.rows !== origin.snapshotRows ||
      dimensions.cols !== origin.snapshotCols ||
      !Number.isSafeInteger(origin.row) ||
      !Number.isSafeInteger(origin.col) ||
      !Number.isSafeInteger(origin.sourceRowCount) ||
      !Number.isSafeInteger(origin.sourceColumnCount) ||
      origin.row < 0 ||
      origin.col < 0 ||
      origin.row + dimensions.rows > origin.sourceRowCount ||
      origin.col + dimensions.cols > origin.sourceColumnCount ||
      origin.row + dimensions.rows > MAX_SHEET_ROWS ||
      origin.col + dimensions.cols > MAX_SHEET_COLS ||
      !Number.isSafeInteger(activeCell.row) ||
      !Number.isSafeInteger(activeCell.col) ||
      activeCell.row < 0 ||
      activeCell.col < 0 ||
      activeCell.row + dimensions.cols > MAX_SHEET_ROWS ||
      activeCell.col + dimensions.rows > MAX_SHEET_COLS
    ) {
      return;
    }

    const validMergeSnapshot = copiedMerges.every(
      (span) =>
        Number.isSafeInteger(span.row) &&
        Number.isSafeInteger(span.col) &&
        Number.isSafeInteger(span.rowSpan) &&
        Number.isSafeInteger(span.colSpan) &&
        span.row >= 0 &&
        span.col >= 0 &&
        span.rowSpan > 0 &&
        span.colSpan > 0 &&
        span.row + span.rowSpan <= dimensions.rows &&
        span.col + span.colSpan <= dimensions.cols,
    );
    if (!validMergeSnapshot) return;
    for (let index = 0; index < copiedMerges.length; index += 1) {
      for (let peer = index + 1; peer < copiedMerges.length; peer += 1) {
        if (spansOverlap(copiedMerges[index], copiedMerges[peer])) return;
      }
    }

    const destinationRange = {
      r1: activeCell.row,
      c1: activeCell.col,
      r2: activeCell.row + dimensions.cols - 1,
      c2: activeCell.col + dimensions.rows - 1,
    };
    const destinationSpan: MergeSpan = {
      row: destinationRange.r1,
      col: destinationRange.c1,
      rowSpan: dimensions.cols,
      colSpan: dimensions.rows,
    };
    const crossesExistingMerge = mergeSpans.some(
      (existing) =>
        spansOverlap(existing, destinationSpan) &&
        !(
          existing.row >= destinationSpan.row &&
          existing.col >= destinationSpan.col &&
          existing.row + existing.rowSpan <=
            destinationSpan.row + destinationSpan.rowSpan &&
          existing.col + existing.colSpan <=
            destinationSpan.col + destinationSpan.colSpan
        ),
    );
    if (crossesExistingMerge || rangeHasLockedCellRef.current(sheet, destinationRange)) {
      showProtectNotice();
      return;
    }

    const sourceRange = {
      r1: origin.row,
      c1: origin.col,
      r2: origin.row + dimensions.rows - 1,
      c2: origin.col + dimensions.cols - 1,
    };
    const nextRowCount = Math.max(sheet.rowCount, destinationRange.r2 + 1);
    const nextColumnCount = Math.max(
      sheet.columnCount,
      destinationRange.c2 + 1,
    );
    const plannerBounds = {
      maxRow: nextRowCount - 1,
      maxCol: nextColumnCount - 1,
    };
    const copiedSheet = sheets.find((candidate) => candidate.id === origin.sheetId);
    const formatPaste = planRulesWithFile(
      planRulesForTransposedFormatPaste,
      conditionalFormats,
      copiedConditionalFormats,
      sourceRange,
      destinationRange,
      listedRuleCount(copiedSheet),
      plannerBounds,
    );
    const conditionalFormatPlan = formatPaste?.plan ?? null;
    const conditionalFormatFileCopy = conditionalFormatFileCopyOf(
      formatPaste?.fileCopy,
      copiedSheet,
      sheet.id,
      sourceRange,
      { row: destinationRange.r1, col: destinationRange.c1 },
      { transpose: true, ...(origin.sourceRows ? { rows: origin.sourceRows } : {}) },
    );
    const validationPlan = planRulesForTransposedValidationPaste(
      validations,
      copiedValidations,
      sourceRange,
      destinationRange,
      shiftFormula,
      plannerBounds,
    );
    if (!conditionalFormatPlan || !validationPlan) {
      toast({ title: t("toolbar.pasteFailed") });
      return;
    }

    const grid = transposedPasteGrid(
      clip,
      origin.row,
      origin.col,
      activeCell.row,
      activeCell.col,
    );
    const merges = copiedMerges.map((span) => ({
      row: span.col,
      col: span.row,
      rowSpan: span.colSpan,
      colSpan: span.rowSpan,
    }));
    if (
      grid.length !== dimensions.cols ||
      grid.some((row) => row.length !== dimensions.rows)
    ) {
      return;
    }
    pasteGridIntoCells(
      activeCell.row,
      activeCell.col,
      grid.map((row) => row.map((cell) => cell.raw)),
      undefined,
      grid,
      merges,
      {
        selectPasted: true,
        skipIfUnchanged: true,
        authoritativeMerges: true,
        conditionalFormatPlan,
        validationPlan,
        ...(conditionalFormatFileCopy ? { conditionalFormatFileCopy } : {}),
        skipBlankSources: skipBlanks,
      },
    );
  }, [
    activeCell,
    conditionalFormats,
    mergeSpans,
    pageId,
    pasteGridIntoCells,
    sheet,
    sheets,
    showProtectNotice,
    validations,
  ]);
  const pasteTransposed = useCallback(
    () => pasteTransposedWith(false),
    [pasteTransposedWith],
  );

  // Excel Home > Paste > No Borders: standard rich Copy semantics with a
  // deliberately narrower style mask. Content and every non-border style field
  // come from the detached Copy snapshot; all legacy + rich border facets stay
  // owned by each destination cell. The receipt and full destination rectangle
  // are authenticated before the shared one-transaction paste seam is entered.
  const pasteNoBorders = useCallback(() => {
    const clip = richClipboardRef.current;
    const origin = copyOriginRef.current;
    const dimensions = pasteLinkSnapshotDimensions(clip);
    const copiedMerges = clipboardMergesRef.current;
    const copiedConditionalFormats = conditionalFormatClipboardRef.current;
    const copiedValidations = validationClipboardRef.current;
    if (
      !clip ||
      !origin ||
      !copiedConditionalFormats ||
      !copiedValidations ||
      origin.kind !== "copy" ||
      origin.pageId !== pageId ||
      cutRangeRef.current !== null ||
      !dimensions ||
      dimensions.rows !== origin.snapshotRows ||
      dimensions.cols !== origin.snapshotCols ||
      !Number.isSafeInteger(origin.row) ||
      !Number.isSafeInteger(origin.col) ||
      !Number.isSafeInteger(origin.sourceRowCount) ||
      !Number.isSafeInteger(origin.sourceColumnCount) ||
      origin.row < 0 ||
      origin.col < 0 ||
      origin.row + dimensions.rows > origin.sourceRowCount ||
      origin.col + dimensions.cols > origin.sourceColumnCount ||
      origin.row + dimensions.rows > MAX_SHEET_ROWS ||
      origin.col + dimensions.cols > MAX_SHEET_COLS ||
      !Number.isSafeInteger(activeCell.row) ||
      !Number.isSafeInteger(activeCell.col) ||
      activeCell.row < 0 ||
      activeCell.col < 0 ||
      activeCell.row + dimensions.rows > MAX_SHEET_ROWS ||
      activeCell.col + dimensions.cols > MAX_SHEET_COLS
    ) {
      return;
    }

    // A malformed merge companion cannot be truncated or selectively skipped:
    // its topology is part of the same Copy receipt as the rich cell rectangle.
    const validMergeSnapshot = copiedMerges.every(
      (span) =>
        Number.isSafeInteger(span.row) &&
        Number.isSafeInteger(span.col) &&
        Number.isSafeInteger(span.rowSpan) &&
        Number.isSafeInteger(span.colSpan) &&
        span.row >= 0 &&
        span.col >= 0 &&
        span.rowSpan > 0 &&
        span.colSpan > 0 &&
        span.row + span.rowSpan <= dimensions.rows &&
        span.col + span.colSpan <= dimensions.cols,
    );
    if (!validMergeSnapshot) return;
    for (let index = 0; index < copiedMerges.length; index += 1) {
      for (let peer = index + 1; peer < copiedMerges.length; peer += 1) {
        if (spansOverlap(copiedMerges[index], copiedMerges[peer])) return;
      }
    }

    // A copy without merges fills a selection that is a whole number of
    // copies (live audit S-104); one with merges lands once.
    const noBorderTiles =
      copiedMerges.length === 0
        ? pasteSpecialTiles(dimensions.rows, dimensions.cols)
        : null;
    const destinationSpan: MergeSpan = noBorderTiles?.tiled
      ? {
          row: noBorderTiles.range.r1,
          col: noBorderTiles.range.c1,
          rowSpan: noBorderTiles.range.r2 - noBorderTiles.range.r1 + 1,
          colSpan: noBorderTiles.range.c2 - noBorderTiles.range.c1 + 1,
        }
      : {
          row: activeCell.row,
          col: activeCell.col,
          rowSpan: dimensions.rows,
          colSpan: dimensions.cols,
        };
    const crossesExistingMerge = mergeSpans.some(
      (existing) =>
        spansOverlap(existing, destinationSpan) &&
        !(
          existing.row >= destinationSpan.row &&
          existing.col >= destinationSpan.col &&
          existing.row + existing.rowSpan <=
            destinationSpan.row + destinationSpan.rowSpan &&
          existing.col + existing.colSpan <=
            destinationSpan.col + destinationSpan.colSpan
        ),
    );
    const destinationRange = {
      r1: destinationSpan.row,
      c1: destinationSpan.col,
      r2: destinationSpan.row + destinationSpan.rowSpan - 1,
      c2: destinationSpan.col + destinationSpan.colSpan - 1,
    };
    if (crossesExistingMerge || rangeHasLockedCellRef.current(sheet, destinationRange)) {
      showProtectNotice();
      return;
    }
    const sourceRange = {
      r1: origin.row,
      c1: origin.col,
      r2: origin.row + dimensions.rows - 1,
      c2: origin.col + dimensions.cols - 1,
    };
    const nextRowCount = Math.max(sheet.rowCount, destinationRange.r2 + 1);
    const nextColumnCount = Math.max(
      sheet.columnCount,
      destinationRange.c2 + 1,
    );
    const plannerBounds = {
      maxRow: nextRowCount - 1,
      maxCol: nextColumnCount - 1,
    };
    const tiledNoBorders = noBorderTiles?.tiled === true;
    const copiedSheet = sheets.find((candidate) => candidate.id === origin.sheetId);
    const formatPaste = planRulesWithFile(
      tiledNoBorders ? planRulesForTiledFormatPaste : planRulesForFormatPaste,
      conditionalFormats,
      copiedConditionalFormats,
      sourceRange,
      destinationRange,
      listedRuleCount(copiedSheet),
      plannerBounds,
    );
    const conditionalFormatPlan = formatPaste?.plan ?? null;
    const conditionalFormatFileCopy = conditionalFormatFileCopyOf(
      formatPaste?.fileCopy,
      copiedSheet,
      sheet.id,
      sourceRange,
      { row: destinationRange.r1, col: destinationRange.c1 },
      {
        ...(tiledNoBorders
          ? {
              tiles: [
                (destinationRange.r2 - destinationRange.r1 + 1) / dimensions.rows,
                (destinationRange.c2 - destinationRange.c1 + 1) / dimensions.cols,
              ] as [number, number],
            }
          : {}),
        ...(origin.sourceRows ? { rows: origin.sourceRows } : {}),
      },
    );
    const validationPlan = (
      tiledNoBorders ? planRulesForTiledValidationPaste : planRulesForValidationPaste
    )(
      validations,
      copiedValidations,
      sourceRange,
      destinationRange,
      shiftFormula,
      plannerBounds,
    );
    if (!conditionalFormatPlan || !validationPlan) {
      toast({ title: t("toolbar.pasteFailed") });
      return;
    }

    const payloadOrigins = tiledNoBorders
      ? noBorderTiles!.origins
      : [{ row: activeCell.row, col: activeCell.col }];
    const tilePayloads = payloadOrigins.map((tileOrigin) =>
      standardPasteGrid(clip, tileOrigin.row - origin.row, tileOrigin.col - origin.col),
    );
    if (
      tilePayloads.some(
        (tile) =>
          tile.length !== dimensions.rows ||
          tile.some((row) => row.length !== dimensions.cols),
      )
    ) {
      return;
    }
    const payload = layPasteTiles(
      payloadOrigins,
      destinationRange,
      (tileOrigin) => tilePayloads[payloadOrigins.indexOf(tileOrigin)]!,
    );
    pasteGridIntoCells(
      destinationRange.r1,
      destinationRange.c1,
      payload.map((row) => row.map((cell) => cell.raw)),
      undefined,
      payload,
      copiedMerges,
      {
        preserveDestinationBorders: true,
        skipIfUnchanged: true,
        authoritativeMerges: true,
        conditionalFormatPlan,
        validationPlan,
        ...(conditionalFormatFileCopy ? { conditionalFormatFileCopy } : {}),
      },
    );
  }, [
    activeCell,
    conditionalFormats,
    mergeSpans,
    pageId,
    pasteGridIntoCells,
    pasteSpecialTiles,
    sheet,
    sheets,
    showProtectNotice,
    validations,
  ]);

  const resolvePasteLinkAuthority = useCallback(() => {
    const clip = richClipboardRef.current;
    const origin = copyOriginRef.current;
    if (
      !origin ||
      origin.kind !== "copy" ||
      origin.pageId !== pageId ||
      cutRangeRef.current !== null
    ) {
      return null;
    }
    const sourceSheet = sheets.find(
      (candidate) => candidate.id === origin.sheetId,
    );
    const dimensions = pasteLinkSnapshotDimensions(clip);
    const coordinateAuthority = sourceSheet
      ? pasteLinkCoordinateAuthoritiesRef.current.get(sourceSheet.id)
      : undefined;
    if (
      !sourceSheet ||
      !dimensions ||
      !coordinateAuthority ||
      coordinateAuthority.token !== origin.coordinateAuthorityToken ||
      // The copied block must still sit where it was copied: every cell of it
      // the same object at the same address (a paste or edit elsewhere on the
      // sheet keeps Paste Link, as Excel does; inserted rows, a sort or a cut
      // move the block and refuse it).
      !pasteLinkSourceBlockUnmoved(origin, sourceSheet.cells, dimensions) ||
      coordinateAuthority.rowCount !== origin.sourceRowCount ||
      coordinateAuthority.rowCount !== sourceSheet.rowCount ||
      coordinateAuthority.columnCount !== origin.sourceColumnCount ||
      coordinateAuthority.columnCount !== sourceSheet.columnCount ||
      dimensions.rows !== origin.snapshotRows ||
      dimensions.cols !== origin.snapshotCols ||
      origin.row + dimensions.rows > origin.sourceRowCount ||
      origin.col + dimensions.cols > origin.sourceColumnCount ||
      !Number.isSafeInteger(activeCell.row) ||
      !Number.isSafeInteger(activeCell.col) ||
      activeCell.row < 0 ||
      activeCell.col < 0 ||
      activeCell.row + dimensions.rows > MAX_SHEET_ROWS ||
      activeCell.col + dimensions.cols > MAX_SHEET_COLS
    ) {
      return null;
    }
    return { origin, sourceSheet, dimensions };
  }, [activeCell.col, activeCell.row, pageId, sheets]);
  const pasteLinkAvailable = Boolean(
    hasRichClipboard &&
      (cutRange === null || cutRange.copy === true) &&
      resolvePasteLinkAuthority(),
  );

  // Paste Link (Excel/WPS 粘贴链接): write =Sheet!A1 references back
  // to the copied source range instead of its values. Clipboard provenance is
  // page+sheet ID, never a stale sheet-name snapshot; the current name is looked
  // up only after all live authority checks pass. A Cut is never linkable.
  const pasteLink = useCallback(() => {
    const authority = resolvePasteLinkAuthority();
    if (!authority) return;
    const { origin, sourceSheet, dimensions } = authority;
    // Pasting a copied rectangle back onto its own top-left would replace the
    // source with circular self-references. Excel treats this exact placement
    // as a no-op; reject it before formula allocation or transaction creation.
    if (
      sheet.id === origin.sheetId &&
      activeCell.row === origin.row &&
      activeCell.col === origin.col
    ) {
      return;
    }
    const sourceSheetName =
      typeof sourceSheet.name === "string" && sourceSheet.name
        ? sourceSheet.name
        : sourceSheet.id;
    // A link pasted on its own sheet carries no sheet name (Excel).
    // A filtered table's Copy links each pasted row to the visible row it
    // came from, not to the rows that follow the first (live audit S-046).
    const grid = pasteLinkGrid(
      dimensions.rows,
      dimensions.cols,
      origin.row,
      origin.col,
      sheet.id === origin.sheetId ? "" : sourceSheetName,
      origin.sourceRows,
    );
    if (
      grid.length !== dimensions.rows ||
      grid.some((row) => row.length !== dimensions.cols)
    ) {
      return;
    }
    const wouldChange = grid.some((row, rowOffset) =>
      row.some((formula, colOffset) => {
        const target =
          sheet.cells[
            `${activeCell.row + rowOffset}:${activeCell.col + colOffset}`
          ];
        return target?.value !== formula || target.formula !== formula;
      }),
    );
    if (!wouldChange) return;
    pasteGridIntoCells(activeCell.row, activeCell.col, grid);
  }, [
    activeCell,
    pasteGridIntoCells,
    resolvePasteLinkAuthority,
    sheet.cells,
    sheet.id,
  ]);

  const pasteFormatsOnly = useCallback(() => {
    const clip = richClipboardRef.current;
    const origin = copyOriginRef.current;
    const copiedRules = conditionalFormatClipboardRef.current;
    const dimensions = pasteLinkSnapshotDimensions(clip);
    if (
      !clip ||
      !origin ||
      !copiedRules ||
      !dimensions ||
      origin.pageId !== pageId ||
      dimensions.rows !== origin.snapshotRows ||
      dimensions.cols !== origin.snapshotCols
    ) {
      return;
    }
    // A selection that is a whole number of copies takes the formats in
    // every copy, as the plain paste does (live audit S-104).
    const tiles = pasteSpecialTiles(dimensions.rows, dimensions.cols);
    // A copied table cell brings the format it showed to a cell outside every
    // table; a table's own cell keeps that table's style (live audit B157).
    const tileFormats = tiles.origins.map((tileOrigin) =>
      formatsGrid(clip, (r, c) =>
        dataTables.some(
          (table) => tableCellRole(table, tileOrigin.row + r, tileOrigin.col + c) !== null,
        ),
      ),
    );
    if (
      tileFormats.some(
        (formats) =>
          formats.length !== dimensions.rows ||
          formats.some((row) => row.length !== dimensions.cols),
      )
    ) {
      return;
    }
    const maxR = tiles.range.r2;
    const maxC = tiles.range.c2;
    if (
      !Number.isSafeInteger(activeCell.row) ||
      !Number.isSafeInteger(activeCell.col) ||
      activeCell.row < 0 ||
      activeCell.col < 0 ||
      maxR >= MAX_SHEET_ROWS ||
      maxC >= MAX_SHEET_COLS
    ) {
      return;
    }
    // Sheet protection (Excel/WPS): formats are cell content too — refuse a
    // formats-only paste that would overwrite a locked cell's style.
    const destinationRange = tiles.range;
    if (rangeHasLockedCellRef.current(sheet, destinationRange)) {
      showProtectNotice();
      return;
    }
    const nextRowCount = Math.max(sheet.rowCount, maxR + 1);
    const nextColumnCount = Math.max(sheet.columnCount, maxC + 1);
    const copiedRange = {
      r1: origin.row,
      c1: origin.col,
      r2: origin.row + dimensions.rows - 1,
      c2: origin.col + dimensions.cols - 1,
    };
    const ruleBounds = { maxRow: nextRowCount - 1, maxCol: nextColumnCount - 1 };
    const copiedSheet = sheets.find((candidate) => candidate.id === origin.sheetId);
    const formatPaste = planRulesWithFile(
      tiles.tiled ? planRulesForTiledFormatPaste : planRulesForFormatPaste,
      conditionalFormats,
      copiedRules,
      copiedRange,
      destinationRange,
      listedRuleCount(copiedSheet),
      ruleBounds,
    );
    if (!formatPaste) {
      toast({ title: t("toolbar.pasteFailed") });
      return;
    }
    const rulePlan = formatPaste.plan;
    const fileCopy = conditionalFormatFileCopyOf(
      formatPaste.fileCopy,
      copiedSheet,
      sheet.id,
      copiedRange,
      { row: destinationRange.r1, col: destinationRange.c1 },
      {
        ...(tiles.tiled
          ? {
              tiles: [
                (destinationRange.r2 - destinationRange.r1 + 1) / dimensions.rows,
                (destinationRange.c2 - destinationRange.c1 + 1) / dimensions.cols,
              ] as [number, number],
            }
          : {}),
        ...(origin.sourceRows ? { rows: origin.sourceRows } : {}),
      },
    );

    const nextCells = copyCellMap(sheet.cells);
    let cellsChanged = false;
    for (const [tileIndex, tileOrigin] of tiles.origins.entries()) {
    const formats = tileFormats[tileIndex]!;
    for (let r = 0; r < dimensions.rows; r += 1) {
      for (let c = 0; c < dimensions.cols; c += 1) {
        const key = `${tileOrigin.row + r}:${tileOrigin.col + c}`;
        const existing = nextCells[key];
        // The look travels; the quote prefix (the entry's text identity) does
        // not, and the target keeps its own (live audit B086).
        const style = styleWithOwnTextIdentity(formats[r][c], existing?.style);
        // Protection is one of the formats (Format Cells > Protection): a
        // copied unlocked cell makes its destination unlocked, a locked one
        // locked. A snapshot that does not say leaves the lock alone.
        const copiedLocked = clip[r]?.[c]?.locked;
        const unlocked =
          copiedLocked === undefined
            ? existing?.locked === false
            : copiedLocked === false;
        // Hidden travels the same way (an MRAI snapshot always says).
        const hidden =
          copiedLocked === undefined
            ? existing?.formulaHidden === true
            : clip[r]?.[c]?.formulaHidden === true;
        if (!existing && !style && !unlocked && !hidden) continue;
        if (
          JSON.stringify(existing?.style ?? null) ===
            JSON.stringify(style ?? null) &&
          (existing?.locked === false) === unlocked &&
          (existing?.formulaHidden === true) === hidden
        ) {
          continue;
        }
        cellsChanged = true;
        // Excel semantics: pasting formats REPLACES the target's style.
        const next: SpreadsheetCell = { ...(existing ?? { value: "" }) };
        if (style) next.style = style;
        else delete next.style;
        if (unlocked) next.locked = false;
        else delete next.locked;
        if (hidden) next.formulaHidden = true;
        else delete next.formulaHidden;
        if (next.value !== "" || hasCellMetadata(next)) nextCells[key] = next;
        else delete nextCells[key];
      }
    }
    }
    if (!cellsChanged && !rulePlan.changed && !fileCopy) return;
    const nextSheet: SheetModel = {
      ...sheet,
      cells: cellsChanged ? nextCells : sheet.cells,
      rowCount: nextRowCount,
      columnCount: nextColumnCount,
    };
    if (rulePlan.rules.length > 0) {
      nextSheet.conditionalFormats = rulePlan.rules;
    } else {
      delete nextSheet.conditionalFormats;
    }
    replaceActiveSheet(
      fileCopy ? withConditionalFormatFileCopyRecorded(nextSheet, fileCopy.source ?? nextSheet, fileCopy) : nextSheet,
    );
  }, [
    activeCell,
    conditionalFormats,
    dataTables,
    pageId,
    pasteSpecialTiles,
    replaceActiveSheet,
    sheet,
    sheets,
    showProtectNotice,
  ]);

  // Write a value grid that may carry `null` entries (Skip Blanks): a null cell
  // is LEFT untouched (the destination keeps its current value), a string cell is
  // written through the same blank-prune path as pasteGridIntoCells. Shares the
  // protection guard + dimension growth + single-undo commit. Backs the
  // arithmetic / formulas-only Paste Special (which can produce nulls); the plain
  // paths keep using pasteGridIntoCells (no nulls).
  // A PastedContent entry (Values, Formulas) keeps the type the clipboard
  // recorded; a string (an arithmetic result) is read from its characters.
  const pasteSpecialGridIntoCells = useCallback(
    (
      baseRow: number,
      baseCol: number,
      grid: Array<Array<PastedContent | string | null>>,
    ) => {
      const maxR = baseRow + Math.max(0, grid.length - 1);
      const maxC =
        baseCol + Math.max(0, ...grid.map((cols) => cols.length - 1), 0);
      writeLineBlanksIn(sheet as unknown as Parameters<typeof writeLineBlanksIn>[0], { r1: baseRow, r2: maxR, c1: baseCol, c2: maxC });
      if (
        rangeHasLockedCellRef.current(sheet, {
          r1: baseRow,
          r2: maxR,
          c1: baseCol,
          c2: maxC,
        })
      ) {
        showProtectNotice();
        return;
      }
      const nextCells = copyCellMap(sheet.cells);
      let maxRow = baseRow;
      let maxCol = baseCol;
      let wrote = false;
      grid.forEach((cols, r) => {
        cols.forEach((val, c) => {
          if (val === null) return; // Skip Blanks: leave the destination as-is
          const tr = baseRow + r;
          const tc = baseCol + c;
          if (typeof val === "string") writeCellValueInto(nextCells, tr, tc, val);
          else writePastedContentInto(nextCells, tr, tc, val);
          wrote = true;
          if (tr > maxRow) maxRow = tr;
          if (tc > maxCol) maxCol = tc;
        });
      });
      if (!wrote) return; // every cell skipped -> byte-stable, no undo entry
      replaceActiveSheet({
        ...sheet,
        cells: nextCells,
        rowCount: Math.max(sheet.rowCount, maxRow + 1),
        columnCount: Math.max(sheet.columnCount, maxCol + 1),
      });
    },
    [replaceActiveSheet, sheet, showProtectNotice],
  );

  // The dialog shell hands the keyboard back to the sheet when it closes (its
  // returnFocusTarget), as Excel does after Paste Special.
  const closePasteSpecialDialog = useCallback(() => {
    setPasteSpecialOpen(false);
    setPasteSpecialAuthority(null);
  }, []);

  useEffect(() => {
    if (pasteSpecialOpen || !pasteSpecialAuthority) return;
    setPasteSpecialAuthority(null);
  }, [pasteSpecialAuthority, pasteSpecialOpen]);

  const openPasteSpecialDialog = useCallback((): boolean => {
    // A copied chart is the clipboard (copying cells ends it): Excel's Paste
    // Special lists what a chart pastes as -- the chart, or its picture.
    const chartCopy = chartClipboardRef.current;
    if (
      chartCopy &&
      chartCopy.charts.length + chartCopy.moved.length === 1 &&
      (shapeClipboardRef.current?.length ?? 0) === 0
    ) {
      setChartPasteSpecial({ as: "chart" });
      return true;
    }
    const clipboard = richClipboardRef.current;
    if (!clipboard) return false;
    setPasteSpecialAuthority({
      sheet,
      selectionKey: `${selRect.r1}:${selRect.r2}:${selRect.c1}:${selRect.c2}`,
      clipboard,
    });
    setPasteSpecialOpen(true);
    return true;
  }, [selRect, sheet]);

  // Apply the Paste Special dialog (Excel "选择性粘贴"). The PASTE choice picks
  // the facet: the metadata-only choices own their sheet/cell facets
  // atomically; All, All except borders and Formats reuse the ribbon's own
  // paste commands; Formulas and Values write through the nullable grid writer
  // so Skip blanks can leave destination cells alone. An OPERATION combines the
  // copied values with the destination (values only: arithmeticGrid bakes them,
  // so All + operation carries no formats); Transpose swaps rows and columns
  // first. Closes the dialog when done.
  // `replay` is a Paste Options choice that is one of the dialog's (Formulas,
  // Values and their number-format pairs) redoing a paste: the dialog is not
  // open then, so its authority is not asked.
  const pasteSpecialApply = useCallback((replay?: PasteSpecialDraft) => {
    const clip = richClipboardRef.current;
    const selectionKey = `${selRect.r1}:${selRect.r2}:${selRect.c1}:${selRect.c2}`;
    if (
      !clip ||
      (!replay &&
        (!pasteSpecialAuthority ||
          pasteSpecialAuthority.clipboard !== clip ||
          pasteSpecialAuthority.sheet !== sheet ||
          pasteSpecialAuthority.selectionKey !== selectionKey))
    ) {
      toast({
        description: t("spreadsheet.pasteSpecialMessages.sourceChanged"),
      });
      closePasteSpecialDialog();
      return;
    }
    const {
      paste: chosenPaste,
      operation: op,
      skipBlanks,
      transpose,
    } = settlePasteSpecialDraft(replay ?? pasteSpecialDraft);
    // All using Source theme and All merging conditional formats are the
    // full paste; the second keeps the destination's conditional formats
    // beside the copied ones (XLS-A063).
    const mergeConditionalFormats =
      chosenPaste === "all-merge-conditional-formats";
    const paste =
      chosenPaste === "all-source-theme" || mergeConditionalFormats
        ? "all"
        : chosenPaste;
    if (paste === "column-widths") {
      const origin = copyOriginRef.current;
      const dimensions = pasteLinkSnapshotDimensions(clip);
      const copiedWidths = columnWidthClipboardRef.current;
      if (
        !origin ||
        origin.kind !== "copy" ||
        origin.pageId !== pageId ||
        !dimensions ||
        dimensions.rows !== origin.snapshotRows ||
        dimensions.cols !== origin.snapshotCols ||
        !copiedWidths ||
        copiedWidths.length !== dimensions.cols ||
        copiedWidths.some(
          (width) =>
            !Number.isFinite(width) || width < MIN_COLUMN_WIDTH_PX || width > MAX_COLUMN_WIDTH_PX,
        ) ||
        !Number.isSafeInteger(origin.row) ||
        !Number.isSafeInteger(origin.col) ||
        origin.row < 0 ||
        origin.col < 0 ||
        origin.row + dimensions.rows > MAX_SHEET_ROWS ||
        origin.col + dimensions.cols > MAX_SHEET_COLS ||
        !Number.isSafeInteger(activeCell.col) ||
        activeCell.col < 0 ||
        activeCell.col + dimensions.cols > MAX_SHEET_COLS
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      if (isSheetProtectionEffectiveRef.current(sheet)) {
        showProtectNotice();
        setPasteSpecialOpen(false);
        return;
      }
      const destinationDefaultWidth =
        typeof sheet.defaultColumnWidth === "number" &&
        Number.isFinite(sheet.defaultColumnWidth) &&
        sheet.defaultColumnWidth > 0
          ? sheet.defaultColumnWidth
          : SPREADSHEET_CELL_WIDTH_PX;
      let changed = false;
      let maxChangedColumn = sheet.columnCount - 1;
      const sizes = copiedWidths.map((size, offset) => {
        const index = activeCell.col + offset;
        if (
          (nativeGrid ? nativeColumnCssClamp(nativeGrid.widths[index],nativeGrid.defaultWidth ?? destinationDefaultWidth) : resolvedColumnWidth(
            index,
            sheet.columnWidths,
            destinationDefaultWidth,
          )) !== size
        ) {
          changed = true;
          maxChangedColumn = Math.max(maxChangedColumn, index);
        }
        return { index, size };
      });
      if (changed) {
        if (sheet.nativeGrid && !nativeGrid) return;
        const nextWidths = setLineSizes(
          sheet.columnWidths,
          sizes,
          destinationDefaultWidth,
          clampColumnWidth,
        );
        const nextSheet: SheetModel = {
          ...sheet,
          columnCount: Math.max(sheet.columnCount, maxChangedColumn + 1),
        };
        if (nextWidths) nextSheet.columnWidths = nextWidths;
        else delete nextSheet.columnWidths;
        // Pasted widths are set widths, not fitted ones.
        if (nextSheet.bestFitColumns) {
          const marks = { ...nextSheet.bestFitColumns };
          for (const { index } of sizes) delete marks[String(index)];
          if (Object.keys(marks).length > 0) nextSheet.bestFitColumns = marks;
          else delete nextSheet.bestFitColumns;
        }
        if (nativeGrid) {
          const edited = sizes.map(({index,size})=>({index,size:clampColumnWidth(size,destinationDefaultWidth)}));
          nextSheet.nativeGrid = editNativeColumns(nativeGrid.grid, edited, nativeGrid.digitWidth, nativeGrid.dpi);
          nextSheet.columnWidths = { ...sheet.columnWidths, ...Object.fromEntries(edited.map(({index})=>[index,nextSheet.nativeGrid!.columns[index].pixels])) };
        }
        replaceActiveSheet(nextSheet);
      }
      setPasteSpecialOpen(false);
      return;
    }
    if (paste === "comments") {
      const origin = copyOriginRef.current;
      const dimensions = pasteLinkSnapshotDimensions(clip);
      if (
        !origin ||
        origin.kind !== "copy" ||
        origin.pageId !== pageId ||
        !dimensions ||
        dimensions.rows !== origin.snapshotRows ||
        dimensions.cols !== origin.snapshotCols ||
        !Number.isSafeInteger(origin.row) ||
        !Number.isSafeInteger(origin.col) ||
        origin.row < 0 ||
        origin.col < 0 ||
        origin.row + dimensions.rows > MAX_SHEET_ROWS ||
        origin.col + dimensions.cols > MAX_SHEET_COLS ||
        !Number.isSafeInteger(activeCell.row) ||
        !Number.isSafeInteger(activeCell.col) ||
        activeCell.row < 0 ||
        activeCell.col < 0 ||
        activeCell.row + dimensions.rows > MAX_SHEET_ROWS ||
        activeCell.col + dimensions.cols > MAX_SHEET_COLS
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      const commentTiles = pasteSpecialTiles(dimensions.rows, dimensions.cols);
      const destinationRange = commentTiles.range;
      if (rangeHasLockedCellRef.current(sheet, destinationRange)) {
        showProtectNotice();
        setPasteSpecialOpen(false);
        return;
      }
      const copiedComments = commentsGrid(clip);
      if (
        copiedComments.length !== dimensions.rows ||
        copiedComments.some((row) => row.length !== dimensions.cols)
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      const nextCells = copyCellMap(sheet.cells);
      let changed = false;
      let maxCommentRow = sheet.rowCount - 1;
      let maxCommentCol = sheet.columnCount - 1;
      for (const tileOrigin of commentTiles.origins)
      for (let r = 0; r < dimensions.rows; r += 1) {
        for (let c = 0; c < dimensions.cols; c += 1) {
          const row = tileOrigin.row + r;
          const col = tileOrigin.col + c;
          const key = `${row}:${col}`;
          const previous = nextCells[key];
          const comment = copiedComments[r]?.[c];
          if (
            JSON.stringify(previous?.comment ?? null) ===
            JSON.stringify(comment ?? null)
          ) {
            continue;
          }
          changed = true;
          if (comment) {
            const nextCell: SpreadsheetCell = {
              ...(previous ?? { value: "", kind: "text" as const }),
              comment,
            };
            nextCells[key] = nextCell;
            maxCommentRow = Math.max(maxCommentRow, row);
            maxCommentCol = Math.max(maxCommentCol, col);
          } else if (previous) {
            const cleared = { ...previous };
            delete cleared.comment;
            if (cleared.value !== "" || hasCellMetadata(cleared)) {
              nextCells[key] = cleared;
            } else {
              delete nextCells[key];
            }
          }
        }
      }
      if (changed) {
        replaceActiveSheet({
          ...sheet,
          cells: nextCells,
          rowCount: Math.max(sheet.rowCount, maxCommentRow + 1),
          columnCount: Math.max(sheet.columnCount, maxCommentCol + 1),
        });
      }
      setPasteSpecialOpen(false);
      return;
    }
    if (paste === "validation") {
      const origin = copyOriginRef.current;
      const copiedRules = validationClipboardRef.current;
      const dimensions = pasteLinkSnapshotDimensions(clip);
      if (
        !origin ||
        origin.kind !== "copy" ||
        origin.pageId !== pageId ||
        !copiedRules ||
        !dimensions ||
        dimensions.rows !== origin.snapshotRows ||
        dimensions.cols !== origin.snapshotCols ||
        !Number.isSafeInteger(activeCell.row) ||
        !Number.isSafeInteger(activeCell.col) ||
        activeCell.row < 0 ||
        activeCell.col < 0 ||
        activeCell.row + dimensions.rows > MAX_SHEET_ROWS ||
        activeCell.col + dimensions.cols > MAX_SHEET_COLS
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      const validationTiles = pasteSpecialTiles(dimensions.rows, dimensions.cols);
      const destinationRange: ValidationRange = validationTiles.range;
      if (rangeHasLockedCellRef.current(sheet, destinationRange)) {
        showProtectNotice();
        setPasteSpecialOpen(false);
        return;
      }
      const nextRowCount = Math.max(sheet.rowCount, destinationRange.r2 + 1);
      const nextColumnCount = Math.max(
        sheet.columnCount,
        destinationRange.c2 + 1,
      );
      const plan = validationTiles.tiled
        ? planRulesForTiledValidationPaste
        : planRulesForValidationPaste;
      const rulePlan = plan(
        validations,
        copiedRules,
        {
          r1: origin.row,
          c1: origin.col,
          r2: origin.row + dimensions.rows - 1,
          c2: origin.col + dimensions.cols - 1,
        },
        destinationRange,
        shiftFormula,
        { maxRow: nextRowCount - 1, maxCol: nextColumnCount - 1 },
      );
      if (rulePlan?.changed) {
        const nextSheet: SheetModel = {
          ...sheet,
          rowCount: nextRowCount,
          columnCount: nextColumnCount,
        };
        if (rulePlan.rules.length > 0) {
          nextSheet.validations = rulePlan.rules;
        } else {
          delete nextSheet.validations;
        }
        replaceActiveSheet(nextSheet);
      }
      setPasteSpecialOpen(false);
      return;
    }
    if (
      paste === "formulas-number-formats" ||
      paste === "values-number-formats"
    ) {
      const origin = copyOriginRef.current;
      const dimensions = pasteLinkSnapshotDimensions(clip);
      if (
        !origin ||
        origin.kind !== "copy" ||
        origin.pageId !== pageId ||
        !dimensions ||
        dimensions.rows !== origin.snapshotRows ||
        dimensions.cols !== origin.snapshotCols ||
        !Number.isSafeInteger(origin.row) ||
        !Number.isSafeInteger(origin.col) ||
        origin.row < 0 ||
        origin.col < 0 ||
        origin.row + dimensions.rows > MAX_SHEET_ROWS ||
        origin.col + dimensions.cols > MAX_SHEET_COLS ||
        !Number.isSafeInteger(activeCell.row) ||
        !Number.isSafeInteger(activeCell.col) ||
        activeCell.row < 0 ||
        activeCell.col < 0 ||
        activeCell.row + dimensions.rows > MAX_SHEET_ROWS ||
        activeCell.col + dimensions.cols > MAX_SHEET_COLS
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      const pairTiles = pasteSpecialTiles(dimensions.rows, dimensions.cols);
      const destinationRange = pairTiles.range;
      if (rangeHasLockedCellRef.current(sheet, destinationRange)) {
        showProtectNotice();
        setPasteSpecialOpen(false);
        return;
      }
      const formatGrid = numberFormatsGrid(clip);
      const tileContents = pairTiles.origins.map((tileOrigin) =>
        paste === "formulas-number-formats"
          ? formulasGrid(
              clip,
              tileOrigin.row - origin.row,
              tileOrigin.col - origin.col,
            )
          : valuesOnlyGrid(clip),
      );
      if (
        tileContents.some(
          (contentGrid) =>
            contentGrid.length !== dimensions.rows ||
            contentGrid.some((row) => row.length !== dimensions.cols),
        ) ||
        formatGrid.length !== dimensions.rows ||
        formatGrid.some((row) => row.length !== dimensions.cols)
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      const nextCells = copyCellMap(sheet.cells);
      let changed = false;
      let maxChangedRow = sheet.rowCount - 1;
      let maxChangedCol = sheet.columnCount - 1;
      for (const [tileIndex, tileOrigin] of pairTiles.origins.entries())
      for (let r = 0; r < dimensions.rows; r += 1) {
        for (let c = 0; c < dimensions.cols; c += 1) {
          const contentGrid = tileContents[tileIndex]!;
          const row = tileOrigin.row + r;
          const col = tileOrigin.col + c;
          const key = `${row}:${col}`;
          const previous = nextCells[key];
          const previousJson = JSON.stringify(previous ?? null);
          writePastedContentInto(nextCells, row, col, contentGrid[r]![c]!);
          const written = nextCells[key] ?? {
            value: "",
            kind: "text" as const,
          };
          const nextCell: SpreadsheetCell = { ...written };
          const nextStyle = { ...(written.style ?? {}) };
          const numberFormat = formatGrid[r]![c];
          if (numberFormat === undefined) {
            delete nextStyle.numberFormat;
          } else {
            nextStyle.numberFormat = numberFormat;
          }
          if (Object.keys(nextStyle).length > 0) {
            nextCell.style = nextStyle;
          } else {
            delete nextCell.style;
          }
          if (nextCell.value !== "" || hasCellMetadata(nextCell)) {
            nextCells[key] = nextCell;
          } else {
            delete nextCells[key];
          }
          if (JSON.stringify(nextCells[key] ?? null) !== previousJson) {
            changed = true;
            maxChangedRow = Math.max(maxChangedRow, row);
            maxChangedCol = Math.max(maxChangedCol, col);
          }
        }
      }
      if (changed) {
        replaceActiveSheet({
          ...sheet,
          cells: nextCells,
          rowCount: Math.max(sheet.rowCount, maxChangedRow + 1),
          columnCount: Math.max(sheet.columnCount, maxChangedCol + 1),
        });
      }
      setPasteSpecialOpen(false);
      return;
    }
    if (paste === "formats") {
      pasteFormatsOnly();
      setPasteSpecialOpen(false);
      return;
    }
    if (paste === "all-except-borders") {
      pasteNoBorders();
      setPasteSpecialOpen(false);
      return;
    }
    if (paste === "all" && op === "none") {
      // The ribbon's own full paste (a move while a Cut is armed) or its
      // Transpose: content, formats, merges, conditional formats, validation.
      // Skip blanks leaves the cell under each blank copied cell alone; it
      // needs a Copy, since Excel offers no Paste Special after a Cut.
      if (
        skipBlanks &&
        (copyOriginRef.current?.kind !== "copy" || cutRangeRef.current !== null)
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      if (transpose) pasteTransposedWith(skipBlanks);
      else {
        pasteOwnRichClipboard(activeCell.row, activeCell.col, {
          skipBlanks,
          mergeConditionalFormats,
        });
      }
      setPasteSpecialOpen(false);
      return;
    }
    // The formula a destination cell holds, for an arithmetic paste.
    const destinationFormula = (row: number, col: number): string | null => {
      const target = sheet.cells[`${row}:${col}`];
      if (!target || target.style?.quotePrefix) return null;
      const text = typeof target.formula === "string" && target.formula !== "" ? target.formula : String(target.value ?? "");
      return text.trim().startsWith("=") ? text.trim() : null;
    };
    // Transposed values/formulas need a Copy origin, as the ribbon's Transpose
    // does: a Cut is never transposed.
    const origin = copyOriginRef.current;
    if (
      transpose &&
      (!origin || origin.kind !== "copy" || cutRangeRef.current !== null)
    ) {
      setPasteSpecialOpen(false);
      return;
    }
    // A selection that is a whole number of copies is filled copy by copy
    // (live audit S-104); a transposed paste lands once at the active cell.
    const specialDimensions = pasteLinkSnapshotDimensions(clip);
    const specialTiles =
      !transpose && specialDimensions
        ? pasteSpecialTiles(specialDimensions.rows, specialDimensions.cols)
        : null;
    if (specialTiles?.tiled) {
      const tileGrid = layPasteTiles<PastedContent | string | null>(
        specialTiles.origins,
        specialTiles.range,
        (tileOrigin) => {
          if (op !== "none") {
            return arithmeticGrid(
              clip,
              op,
              (r, c) => {
                const v = formulaEvaluator.getComputed(tileOrigin.row + r, tileOrigin.col + c);
                if (isFormulaError(v)) return v.code;
                return typeof v === "number" ? String(v) : v == null ? "" : String(v);
              },
              skipBlanks,
              (r, c) => destinationFormula(tileOrigin.row + r, tileOrigin.col + c),
            );
          }
          const base =
            paste === "formulas" && origin
              ? formulasGrid(
                  clip,
                  origin.kind === "copy" ? tileOrigin.row - origin.row : 0,
                  origin.kind === "copy" ? tileOrigin.col - origin.col : 0,
                )
              : valuesOnlyGrid(clip);
          return applySkipBlanks(base, skipBlanks, clip);
        },
      );
      if (
        paste === "formulas" &&
        (!origin ||
          origin.pageId !== pageId ||
          origin.snapshotRows !== specialDimensions!.rows ||
          origin.snapshotCols !== specialDimensions!.cols)
      ) {
        setPasteSpecialOpen(false);
        return;
      }
      pasteSpecialGridIntoCells(specialTiles.range.r1, specialTiles.range.c1, tileGrid);
      setPasteSpecialOpen(false);
      return;
    }
    let grid: Array<Array<PastedContent | string | null>>;
    if (op !== "none") {
      // Arithmetic: read each destination cell's UNDERLYING value off the
      // evaluator (getComputed, not the formatted display) so a number-formatted
      // destination still combines as its raw number — Excel operates on the
      // underlying value. A non-number (text/error) is passed through as its
      // string so arithmeticGrid surfaces #VALUE!; a blank cell -> "" (= 0).
      // The copied operand is the typed value snapshotted at Copy, never its
      // display. Transpose swaps the copied cells first; the operation then
      // runs over the swapped rectangle.
      const source: RichClipboard = transpose ? transposeClipboard(clip) : clip;
      grid = arithmeticGrid(
        source,
        op,
        (r, c) => {
          const v = formulaEvaluator.getComputed(
            activeCell.row + r,
            activeCell.col + c,
          );
          // An error keeps its code (#N/A stays #N/A through the add, B044);
          // String(v) of the error object would lose it.
          if (isFormulaError(v)) return v.code;
          return typeof v === "number" ? String(v) : v == null ? "" : String(v);
        },
        skipBlanks,
        // A formula destination keeps its formula, wrapped (Excel).
        (r, c) => destinationFormula(activeCell.row + r, activeCell.col + c),
      );
    } else {
      // No operation: a values-only or formulas-only paste, with optional Skip
      // Blanks layered on (nulls = leave the destination).
      let base: PastedContent[][];
      if (paste === "formulas") {
        // Formula-only paste needs the COPY origin at activation time: relative
        // references move by the source→destination delta, while Cut keeps zero
        // deltas. The rich snapshot and receipt are written together; reject a
        // missing/stale-page/ragged mismatch instead of silently pasting formulas
        // with the wrong reference authority.
        const dimensions = pasteLinkSnapshotDimensions(clip);
        if (
          !origin ||
          origin.pageId !== pageId ||
          !dimensions ||
          origin.snapshotRows !== dimensions.rows ||
          origin.snapshotCols !== dimensions.cols
        ) {
          setPasteSpecialOpen(false);
          return;
        }
        const translate = origin.kind === "copy";
        base = transpose
          ? // Each formula shifts from its own source coordinate to where the
            // swap puts it, exactly like the ribbon's Transpose.
            transposedPasteGrid(
              clip,
              origin.row,
              origin.col,
              activeCell.row,
              activeCell.col,
            ).map((row) => row.map((cell) => clipboardCellContent(cell)))
          : formulasGrid(
              clip,
              translate ? activeCell.row - origin.row : 0,
              translate ? activeCell.col - origin.col : 0,
            );
      } else {
        base = transpose ? transposedValuesGrid(clip) : valuesOnlyGrid(clip);
      }
      // A blank is an empty SOURCE cell: a formula whose value is "" still
      // pastes its empty string, whatever facet of the cells is pasted. The
      // source is the swapped clipboard when the paste transposes.
      grid = applySkipBlanks(base, skipBlanks, transpose ? transposeClipboard(clip) : clip);
    }
    if (grid.length) {
      pasteSpecialGridIntoCells(activeCell.row, activeCell.col, grid);
    }
    setPasteSpecialOpen(false);
  }, [
    activeCell,
    closePasteSpecialDialog,
    formulaEvaluator,
    t,
    pasteSpecialDraft,
    pasteSpecialGridIntoCells,
    pasteSpecialAuthority,
    pasteFormatsOnly,
    pasteNoBorders,
    pasteOwnRichClipboard,
    pasteSpecialTiles,
    pasteTransposedWith,
    nativeGrid,
    pageId,
    replaceActiveSheet,
    selRect,
    sheet,
    showProtectNotice,
    validations,
  ]);

  // Paste Options: paste the same clipboard again as `choice`, at the same
  // place and selection (the offer goes with any selection change).
  const runPasteOptionsChoice = useCallback(
    (offer: SpreadsheetPasteOptionsOffer, choice: PasteOptionsChoice) => {
      const { row, col, source } = offer;
      if (source.kind === "text") return;
      if (source.kind === "html") {
        const keep = choice === "keep-source-formatting";
        pasteGridIntoCells(
          row,
          col,
          source.rows,
          undefined,
          keep ? source.cells : undefined,
          keep ? source.merges : undefined,
          { selectPasted: true, expandTables: true },
        );
        return;
      }
      if (richClipboardRef.current !== source.clipboard) return;
      const draft = pasteOptionsSpecialDraft(choice);
      if (draft) pasteSpecialApply(draft);
      else if (choice === "paste") pasteOwnRichClipboard(row, col);
      else if (choice === "values-source-formatting") {
        pasteOwnRichClipboard(row, col, { values: true });
      } else if (choice === "no-borders") pasteNoBorders();
      else if (choice === "transpose") pasteTransposedWith(false);
      else if (choice === "formatting") pasteFormatsOnly();
      else if (choice === "paste-link") pasteLink();
      else if (choice === "picture") pasteAsPicture();
    },
    [
      pasteAsPicture,
      pasteFormatsOnly,
      pasteGridIntoCells,
      pasteLink,
      pasteNoBorders,
      pasteOwnRichClipboard,
      pasteSpecialApply,
      pasteTransposedWith,
    ],
  );
  return {
    closePasteSpecialDialog,
    handleCellPaste,
    noteClipboardPaste,
    openPasteSpecialDialog,
    pasteAsPicture,
    pasteFormatsOnly,
    pasteFromInternalClipboard,
    pasteLink,
    pasteLinkAvailable,
    pasteNoBorders,
    pasteOwnRichClipboard,
    pastePictureAvailable,
    pasteSpecialApply,
    pasteTransposed,
    pasteValuesOnly,
    runFlashFill,
    runPasteOptionsChoice,
  };
}
