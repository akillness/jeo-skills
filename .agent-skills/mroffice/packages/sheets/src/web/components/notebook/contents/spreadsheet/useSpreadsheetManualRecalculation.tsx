"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { runSpreadsheetCalculation } from "../../../../lib/spreadsheet/run-spreadsheet-calculation";
import { requestSpreadsheetExternalData, spreadsheetExternalDataFor } from "../../../../lib/spreadsheet/web-data-store";
import { yieldCalculationTask } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { useSpreadsheetBackgroundCalculation, type DeriveCalculationPivots } from "./useSpreadsheetBackgroundCalculation";
import { type BackgroundCalculationHostBinding } from "@mrnote/core/web/lib/spreadsheet/background-calculation-host.ts";
import { type CellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { useEffect, useMemo, useRef, useCallback, useInsertionEffect, type RefObject } from "react";
import { type SpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { type WorksheetFormulaCoordinate, worksheetCalculationSeedSnapshot, resetWorksheetCalculationAuthority, beginWorksheetCalculation, worksheetCalculationTokenIsCurrent, MAX_WORKSHEET_CALCULATION_RESULTS, worksheetFormulaResultKey, createWorksheetCalculationLedger, afterRecalculation, validateWorksheetCalculationRequest, validateAutomaticWorksheetCalculationRequest, publishWorksheetCalculationResults, withCalculationDirty, worksheetCalculationHasOutstanding, type WorksheetCalculationToken, type WorksheetCalculationAuthority, type WorksheetCalculationLedger } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import { type EngineValue, type SheetEvaluator } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { normalizeCharts } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { type PivotRange, type PivotMatrix } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotChartReport } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { cellMapChangesSince } from "@mrnote/core/web/lib/spreadsheet/cell-map-lineage.ts";
import { formulaCoordinatesAfterEdit, worksheetCalculationFormulaCoordinates, worksheetCalculationDescriptors } from "./spreadsheetFormulaHelpers";
import { type CalculationState } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import { type Workbook, type WorkbookSheetInput } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type PivotOutputPlan } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { type CalculationRuleRequest } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { ruleAnswersOf, type RuleAnswersReceipt } from "./spreadsheetHiddenRows";
import { type Dispatch, type SetStateAction } from "react";
import { excelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** What useSpreadsheetManualRecalculation reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetManualRecalculationInputs {
  automaticWorksheetResultsRef: RefObject<{ token: WorksheetCalculationToken; results: ReadonlyMap<string, EngineValue>; } | null>;
  backgroundCalculation: ReturnType<typeof useSpreadsheetBackgroundCalculation>;
  calcAuthorityRef: RefObject<WorksheetCalculationAuthority | null>;
  calcLedgerRef: RefObject<WorksheetCalculationLedger<EngineValue> | null>;
  calcState: CalculationState;
  /** The active sheet's rule formulas (conditional formats, validation,
   * link locations) the automatic calculation answers with its cells. */
  calculationRuleRequests: readonly CalculationRuleRequest[];
  deriveCalculationPivots: DeriveCalculationPivots | undefined;
  explicitCalculationControllerRef: RefObject<AbortController | null>;
  explicitVisualSeedRef: RefObject<ReadonlyMap<string, EngineValue> | undefined>;
  filterVisibility: { wait: () => Promise<boolean>; retry: () => void; pending: boolean; failed: boolean; rows: ReadonlySet<number>; };
  formulaDataSheets: SheetModel[];
  formulaSource: { inputs: WorkbookSheetInput[]; bindings: BackgroundCalculationHostBinding[]; activeName: string; activeCells: CellMap; readActiveRaw: (row: number, col: number) => string | null; };
  formulaWorkbook: { evaluator: SheetEvaluator; evaluatorFor: (sheetName: string) => SheetEvaluator; workbook: Workbook; memoSnapshot: () => ReadonlyMap<string, EngineValue>; pivotPlans: Map<string, PivotOutputPlan>; pivotNativeFootprints: Map<string, PivotRange[]>; pivotChartReports: Map<string, PivotChartReport>; pivotChartMatrices: Map<string, PivotMatrix>; inputs: WorkbookSheetInput[]; pivotSheetIds: string[]; };
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  manualEntryKeys: ReadonlySet<string>;
  manualEntryKeysRef: RefObject<ReadonlySet<string>>;
  pageId: string;
  setAutomaticWorksheetResultsRevision: Dispatch<SetStateAction<number>>;
  setCalcLedgerRevision: Dispatch<SetStateAction<number>>;
  setCalcState: Dispatch<SetStateAction<CalculationState>>;
  setExplicitCalculationBusy: Dispatch<SetStateAction<boolean>>;
  /** Publishes the rule answers an explicit calculation brought (B470). */
  setExplicitRuleAnswers: Dispatch<SetStateAction<RuleAnswersReceipt | null>>;
  setManualEntryKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  workbookDateSystemRef: RefObject<SpreadsheetDateSystem | undefined>;
  /** The workbook's file name and location folder, as the automatic
   * calculation reads them (CELL("filename"), X-194). */
  workbookName?: string;
  workbookFolder?: string;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetManualRecalculation({
  automaticWorksheetResultsRef,
  backgroundCalculation,
  calcAuthorityRef,
  calcLedgerRef,
  calcState,
  calculationRuleRequests,
  deriveCalculationPivots,
  explicitCalculationControllerRef,
  explicitVisualSeedRef,
  filterVisibility,
  formulaDataSheets,
  formulaSource,
  formulaWorkbook,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  manualEntryKeys,
  manualEntryKeysRef,
  pageId,
  setAutomaticWorksheetResultsRevision,
  setCalcLedgerRevision,
  setCalcState,
  setExplicitCalculationBusy,
  setExplicitRuleAnswers,
  setManualEntryKeys,
  sheet,
  sheets,
  workbookDateSystemRef,
  workbookName,
  workbookFolder,
}: SpreadsheetManualRecalculationInputs) {
  // An explicit calculation answers the rule formulas on screen in the same
  // pass as the cells and publishes them with its results (live audit
  // B470): without them a conditional format would stop showing once the
  // calculation it was answered with no longer counts. A session that does
  // not answer rules leaves the published answers as they were.
  const publishExplicitRuleAnswers = useCallback((
    token: WorksheetCalculationToken,
    rules: readonly CalculationRuleRequest[],
    ruleValues: ReadonlyMap<string, ReadonlyMap<string, EngineValue>> | undefined,
  ) => {
    const answers = rules.length ? ruleAnswersOf({ rules, ruleValues }) : null;
    if (answers) setExplicitRuleAnswers({ token, answers });
  }, [setExplicitRuleAnswers]);
  // Manual mode: the formulas just entered are calculated (by the session,
  // every other formula frozen at the ledger); their results join the ledger, so they stay as calculated
  // until the next F9 (Excel keeps an entered formula's result while its
  // precedents change in Manual mode). The server unable to answer leaves
  // them pending (blank): nothing is evaluated here instead.
  const manualEntryBindings = formulaSource.bindings;
  useEffect(() => {
    if (manualEntryKeys.size === 0) return;
    const ledger = calcLedgerRef.current;
    if (calcState.mode !== "manual" || !ledger) {
      manualEntryKeysRef.current = new Set();
      setManualEntryKeys(manualEntryKeysRef.current);
      return;
    }
    const entries: Array<WorksheetFormulaCoordinate & { key: string }> = [];
    for (const key of manualEntryKeys) {
      const separator = key.indexOf("\u0000");
      const [row, col] = key.slice(separator + 1).split(":").map(Number);
      const sheetLower = key.slice(0, separator);
      const target = formulaDataSheets.find(
        (candidate) => (candidate.name || candidate.id).toLowerCase() === sheetLower,
      );
      if (!target || !Number.isInteger(row) || !Number.isInteger(col)) continue;
      entries.push({ key, sheetId: target.id, sheetName: target.name || target.id, row, col });
    }
    const publish = (computed: ReadonlyMap<string, EngineValue>) => {
      const results = new Map(ledger.results);
      const addedBySheet = new Map<string, string[]>();
      for (const entry of entries) {
        const value = computed.get(entry.key);
        if (value === undefined) continue;
        results.set(entry.key, value);
        addedBySheet.set(entry.sheetId, [...(addedBySheet.get(entry.sheetId) ?? []), entry.key]);
      }
      calcLedgerRef.current = {
        ...ledger,
        results,
        sheets: ledger.sheets.map((recorded) => {
          const added = addedBySheet.get(recorded.id);
          return added
            ? { ...recorded, formulaKeys: [...new Set([...recorded.formulaKeys, ...added])] }
            : recorded;
        }),
      };
      // Keys entered since this effect read them stay pending.
      const remaining = new Set([...manualEntryKeysRef.current].filter((key) => !manualEntryKeys.has(key)));
      manualEntryKeysRef.current = remaining;
      setManualEntryKeys(remaining);
      setCalcLedgerRevision((revision) => revision + 1);
    };
    const authority = calcAuthorityRef.current;
    if (!authority || entries.length === 0) return;
    const seed = worksheetCalculationSeedSnapshot(authority, ledger);
    const controller = new AbortController();
    void runSpreadsheetCalculation({
      bindings: manualEntryBindings,
      externalData: spreadsheetExternalDataFor(pageId).data,
      token: { pageId: authority.pageId, loadEpoch: authority.loadEpoch, generation: authority.generation,
        workbookRevision: authority.workbookRevision, topologyRevision: authority.topologyRevision, targetSheetId: null },
      coordinates: entries.map(({ sheetId, sheetName, row, col }) => ({ sheetId, sheetName, row, col })),
      formulaResultSeed: { snapshot: new Map(seed), frozenSheets: formulaDataSheets.map((candidate) => candidate.name || candidate.id),
        onMissing: "error", evaluate: new Set(entries.map((entry) => entry.key)) },
      date1904: excelDateSystemArg(workbookDateSystemRef.current), workbookName, workbookFolder,
      // The reports as of the last calculation (Manual mode settles them at F9).
      pivots: deriveCalculationPivots?.(manualEntryBindings, seed) ?? null,
      getAuthorityToken: backgroundCalculation.getCurrentToken,
      signal: controller.signal,
    }).then((answer) => {
      if (answer.externalRequests?.length) requestSpreadsheetExternalData(pageId, answer.externalRequests);
      if (!controller.signal.aborted && calcLedgerRef.current === ledger) publish(answer.results);
    }, () => undefined);
    return () => controller.abort();
  }, [calcState.mode, formulaDataSheets, manualEntryBindings, manualEntryKeys, deriveCalculationPivots, backgroundCalculation.getCurrentToken, pageId, workbookName, workbookFolder]);
  const walkedCoordinatesRef = useRef<{ sheets: ReadonlyArray<SheetModel>; coordinates: ReturnType<typeof worksheetCalculationFormulaCoordinates> } | null>(null);
  const formulaCoordinates = useMemo(
    () => {
      if (backgroundCalculation.coordinatesReady && backgroundCalculation.coordinates) return backgroundCalculation.coordinates;
      if (backgroundCalculation.pending || filterVisibility.pending) return null;
      const walked = walkedCoordinatesRef.current;
      const kept = walked ? formulaCoordinatesAfterEdit(walked, formulaDataSheets, cellMapChangesSince) : undefined;
      // A null kept is an answer too (more cells than are walked): the walk that
      // found it went over 100,000 keys, and would again at each entry to say the same.
      const coordinates = kept !== undefined ? kept : worksheetCalculationFormulaCoordinates(formulaDataSheets, formulaWorkbook.inputs);
      walkedCoordinatesRef.current = { sheets: formulaDataSheets, coordinates };
      return coordinates;
    },
    [formulaDataSheets, formulaWorkbook.inputs, backgroundCalculation.coordinatesReady, backgroundCalculation.coordinates,
      backgroundCalculation.pending, filterVisibility.pending],
  );

  const explicitCalculationAfterVisibilityRef = useRef<{ workbook: (options?: { settlePivotPasses?: number }) => Promise<boolean>; sheet: () => Promise<void> } | null>(null);
  // F9 / Shift+F9 start the session from the reports on screen and settle
  // them from its answers like an automatic calculation (pivot option C).
  // `frozen`: Shift+F9's other sheets, whose values its answer leaves out.
  const explicitCalculationPivots = useCallback((frozen?: ReadonlyMap<string, EngineValue>) => deriveCalculationPivots ? {
    pivots: deriveCalculationPivots(formulaSource.bindings, formulaWorkbook.memoSnapshot()),
    derivePivots: (results: ReadonlyMap<string, EngineValue>) =>
      deriveCalculationPivots(formulaSource.bindings, frozen ? new Map([...frozen, ...results]) : results),
  } : {}, [deriveCalculationPivots, formulaSource.bindings, formulaWorkbook]);
  const captureWorkbookCalculation = useCallback(async (
    options?: { settlePivotPasses?: number },
  ): Promise<boolean> => {
    if (filterVisibility.pending) {
      if (!await filterVisibility.wait() || sheets !== liveSheetsRef.current) return false;
      return explicitCalculationAfterVisibilityRef.current?.workbook(options) ?? false;
    }
    if (!formulaCoordinates && backgroundCalculation.pending) {
      if (!await backgroundCalculation.wait() || sheets !== liveSheetsRef.current) return false;
      return explicitCalculationAfterVisibilityRef.current?.workbook(options) ?? false;
    }
    if (!formulaCoordinates) {
      return false;
    }
    const reset = resetWorksheetCalculationAuthority(
      pageId,
      worksheetCalculationDescriptors(sheets),
      calcAuthorityRef.current,
    );
    if (!reset) return false;
    const calculation = beginWorksheetCalculation(reset, null);
    calcAuthorityRef.current = calculation.authority;
    explicitCalculationControllerRef.current?.abort();
    const controller = new AbortController();
    explicitCalculationControllerRef.current = controller;
    explicitVisualSeedRef.current = formulaWorkbook.memoSnapshot();
    backgroundCalculation.cancel();
    setExplicitCalculationBusy(true);
    try {
      // Every F9 goes to the server's calculation (a small sheet too), its
      // PivotTables settled there from the reports on screen.
      await yieldCalculationTask();
      const rules = calculationRuleRequests;
      const answer = await runSpreadsheetCalculation({ bindings: formulaSource.bindings, token: calculation.token, coordinates: formulaCoordinates,
        rules, date1904: excelDateSystemArg(workbookDateSystemRef.current), workbookName, workbookFolder, ...explicitCalculationPivots(),
        externalData: spreadsheetExternalDataFor(pageId).data,
        getAuthorityToken: backgroundCalculation.getCurrentToken, signal: controller.signal });
      if (answer.externalRequests?.length) requestSpreadsheetExternalData(pageId, answer.externalRequests);
      const computed = answer.results;
      if (
        !worksheetCalculationTokenIsCurrent(
          calcAuthorityRef.current,
          calculation.token,
        )
      ) {
        return false;
      }
      const memo = computed;
      if (memo.size > MAX_WORKSHEET_CALCULATION_RESULTS) return false;
      const formulaResults = new Map<string, EngineValue>();
      for (const formula of formulaCoordinates) {
        const key = worksheetFormulaResultKey(
          formula.sheetName,
          formula.row,
          formula.col,
        );
        if (!memo.has(key)) return false;
        formulaResults.set(key, memo.get(key)!);
      }
      const ledger = createWorksheetCalculationLedger({
        authority: calculation.authority,
        formulas: formulaCoordinates,
        results: formulaResults,
      });
      if (!ledger) return false;
      // Reuse the exact values computed by this workbook-wide attempt on the
      // next automatic render. In particular, volatile formulas must not run a
      // second time merely because publishing the calculation receipt rerenders
      // the host.
      automaticWorksheetResultsRef.current = {
        token: calculation.token,
        results: formulaResults,
      };
      calcLedgerRef.current = ledger;
      publishExplicitRuleAnswers(calculation.token, rules, answer.ruleValues);
      setCalcLedgerRevision((revision) => revision + 1);
      setAutomaticWorksheetResultsRevision((revision) => revision + 1);
      return true;
    } catch {
      // Calculation authority is fail-closed. The previous ledger remains the
      // last authenticated result set and no partial memo is published.
      return false;
    } finally { if (explicitCalculationControllerRef.current === controller) { explicitCalculationControllerRef.current = null; setExplicitCalculationBusy(false); } }
  }, [
    calculationRuleRequests,
    publishExplicitRuleAnswers,
    formulaCoordinates,
    formulaSource.bindings,
    backgroundCalculation.cancel,
    backgroundCalculation.pending,
    backgroundCalculation.wait,
    backgroundCalculation.getCurrentToken,
    formulaWorkbook.inputs,
    formulaWorkbook.pivotPlans,
    formulaWorkbook.pivotSheetIds.length,
    explicitCalculationPivots,
    pageId,
    sheets,
    filterVisibility.pending,
    filterVisibility.wait,
    workbookName,
    workbookFolder,
  ]);

  const recalculateNow = useCallback(async () => {
    // The session settles the PivotTables' reports with this pass.
    if (!await captureWorkbookCalculation()) return;
    setCalcState((current) => afterRecalculation(current, "workbook"));
  }, [captureWorkbookCalculation]);

  const recalculateActiveSheetNow = useCallback(async () => {
    if (filterVisibility.pending) {
      if (!await filterVisibility.wait() || sheets !== liveSheetsRef.current) return;
      await explicitCalculationAfterVisibilityRef.current?.sheet();
      return;
    }
    if (!formulaCoordinates && backgroundCalculation.pending) {
      if (!await backgroundCalculation.wait() || sheets !== liveSheetsRef.current ||
          sheet.id !== liveSheetsRef.current[liveActiveSheetIndexRef.current]?.id) return;
      await explicitCalculationAfterVisibilityRef.current?.sheet();
      return;
    }
    const current = calcAuthorityRef.current;
    const ledger = calcLedgerRef.current;
    const manualMode = calcState.mode === "manual";
    if (!current || !formulaCoordinates || (manualMode && !ledger)) return;
    const calculation = beginWorksheetCalculation(current, sheet.id);
    calcAuthorityRef.current = calculation.authority;
    const check = manualMode
      ? validateWorksheetCalculationRequest({
          authority: calculation.authority,
          ledger: ledger!,
          token: calculation.token,
          targetSheetId: sheet.id,
          formulas: formulaCoordinates,
        })
      : validateAutomaticWorksheetCalculationRequest({
          authority: calculation.authority,
          token: calculation.token,
          targetSheetId: sheet.id,
          formulas: formulaCoordinates,
        });
    if (!check.ok) return;
    const target = calculation.authority.sheets.find(
      (candidate) => candidate.id === sheet.id,
    );
    if (!target) return;
    const frozenSheets = calculation.authority.sheets
      .filter((candidate) => candidate.id !== sheet.id)
      .map((candidate) => candidate.name);
    explicitCalculationControllerRef.current?.abort();
    const controller = new AbortController();
    explicitCalculationControllerRef.current = controller;
    explicitVisualSeedRef.current = formulaWorkbook.memoSnapshot();
    backgroundCalculation.cancel();
    setExplicitCalculationBusy(true);
    try {
      const frozenResultSnapshot = manualMode
        ? ledger!.results
        : formulaWorkbook.memoSnapshot();
      if (frozenResultSnapshot.size > MAX_WORKSHEET_CALCULATION_RESULTS) {
        return;
      }
      // The server's calculation answers the sheet (its PivotTables' reports included).
      const requested = formulaCoordinates.filter(formula => formula.sheetId === sheet.id);
      let chartCells = 0;
      for (const chart of normalizeCharts(sheet.charts)) {
        const height = chart.range.r2 - chart.range.r1 + 1;
        const width = chart.range.c2 - chart.range.c1 + 1;
        if (
          height < 1 ||
          width < 1 ||
          height * width >
            MAX_WORKSHEET_CALCULATION_RESULTS -
              chartCells -
              formulaCoordinates.length
        ) {
          return;
        }
        chartCells += height * width;
        for (let row = chart.range.r1; row <= chart.range.r2; row += 1) {
          for (let col = chart.range.c1; col <= chart.range.c2; col += 1) {
            requested.push({ sheetId: sheet.id, sheetName: target.name, row, col });
          }
        }
      }
      if (
        !worksheetCalculationTokenIsCurrent(
          calcAuthorityRef.current,
          calculation.token,
        )
      ) {
        return;
      }
      const uniqueRequested = [...new Map(requested.map(cell => [worksheetFormulaResultKey(cell.sheetName, cell.row, cell.col), cell])).values()];
      const rules = calculationRuleRequests;
      const answer = await runSpreadsheetCalculation({ bindings: formulaSource.bindings, token: calculation.token,
        coordinates: uniqueRequested, formulaResultSeed: { snapshot: new Map(frozenResultSnapshot), frozenSheets, onMissing: "throw" },
        rules, date1904: excelDateSystemArg(workbookDateSystemRef.current), workbookName, workbookFolder, ...explicitCalculationPivots(frozenResultSnapshot),
        externalData: spreadsheetExternalDataFor(pageId).data,
        getAuthorityToken: backgroundCalculation.getCurrentToken, signal: controller.signal });
      if (answer.externalRequests?.length) requestSpreadsheetExternalData(pageId, answer.externalRequests);
      const memo = answer.results;
      if (!calcAuthorityRef.current || !worksheetCalculationTokenIsCurrent(calcAuthorityRef.current, calculation.token)) return;
      if (memo.size > MAX_WORKSHEET_CALCULATION_RESULTS) return;
      const targetResults = new Map<string, EngineValue>();
      for (const formula of formulaCoordinates) {
        if (formula.sheetId !== sheet.id) continue;
        const key = worksheetFormulaResultKey(
          formula.sheetName,
          formula.row,
          formula.col,
        );
        if (!memo.has(key)) return;
        targetResults.set(key, memo.get(key)!);
      }
      if (!manualMode) {
        automaticWorksheetResultsRef.current = {
          token: calculation.token,
          results: targetResults,
        };
        publishExplicitRuleAnswers(calculation.token, rules, answer.ruleValues);
        setAutomaticWorksheetResultsRevision((revision) => revision + 1);
        return;
      }
      const published = publishWorksheetCalculationResults({
        authority: calculation.authority,
        ledger: ledger!,
        token: calculation.token,
        targetSheetId: sheet.id,
        formulas: formulaCoordinates,
        targetResults,
      });
      if (!published.ok) return;
      calcLedgerRef.current = published.ledger;
      publishExplicitRuleAnswers(calculation.token, rules, answer.ruleValues);
      setCalcLedgerRevision((revision) => revision + 1);
      setCalcState((state) =>
        withCalculationDirty(
          state,
          worksheetCalculationHasOutstanding(
            calculation.authority,
            published.ledger,
          ),
        ),
      );
    } catch {
      // Missing frozen seeds, evaluator failure, or a hostile oversized chart
      // leaves both the previous ledger and the document model unchanged.
    } finally { if (explicitCalculationControllerRef.current === controller) { explicitCalculationControllerRef.current = null; setExplicitCalculationBusy(false); } }
  }, [
    pageId,
    calcState.mode,
    calculationRuleRequests,
    publishExplicitRuleAnswers,
    formulaCoordinates,
    formulaSource.bindings,
    backgroundCalculation.cancel,
    backgroundCalculation.pending,
    backgroundCalculation.wait,
    backgroundCalculation.getCurrentToken,
    formulaWorkbook,
    explicitCalculationPivots,
    sheet.charts,
    sheet.id,
    filterVisibility.pending,
    filterVisibility.wait,
    workbookName,
    workbookFolder,
  ]);
  useInsertionEffect(() => {
    explicitCalculationAfterVisibilityRef.current = {workbook:captureWorkbookCalculation, sheet:recalculateActiveSheetNow};
  });
  return {
    captureWorkbookCalculation,
    formulaCoordinates,
    recalculateActiveSheetNow,
    recalculateNow,
  };
}
