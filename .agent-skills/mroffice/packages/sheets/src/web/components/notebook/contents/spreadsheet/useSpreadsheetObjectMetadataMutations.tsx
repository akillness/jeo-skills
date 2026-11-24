"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  normalizedTableAltTextInput,
  MAX_PICTURE_NAME_LENGTH,
  spreadsheetObjectInsertedByPage,
} from "../../../../lib/spreadsheet/drawing-buttons";
import { useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type SpreadsheetNavigationElementSelection, type SpreadsheetNavigationElementActionId } from "@/components/notebook/contents/spreadsheet/SpreadsheetNavigationPane";
import { rebindPivotCharts } from "@mrnote/core/web/lib/spreadsheet/pivot-chart.ts";
import { normalizeSlicers } from "../../../../lib/spreadsheet/slicer";
import { type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type SpreadsheetChart } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { sheetPivots, sheetPivotAt, sheetWithPivotAt, type PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type SpreadsheetViewOptions } from "../../../../lib/spreadsheet/view-options";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { spreadsheetObjectHasPatchbackVisibilityIdentity, spreadsheetPictureDisplayName, spreadsheetPictureOrdinalMap } from "./spreadsheetObjectContext";
import { type PictureMetadataWriterControlId, type PictureMetadataMutationReceipt, type SlicerDesignWriterControlId, type PictureFormatWriterControlId, type SlicerDesignMutationReceipt } from "./spreadsheetMutationReceipts";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { normalizedPivotTableObjectName } from "./spreadsheetWindowHelpers";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetObjectMetadataMutations reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetObjectMetadataMutationsInputs {
  commitSheets: (nextSheets: SheetModel[], queryMutation?: boolean, activeSheetId?: string, nextViewOptions?: SpreadsheetViewOptions) => SheetModel[];
  executePictureFormatMutation: (controlId: PictureFormatWriterControlId, parameter: string | number, surface?: "visible" | "keyboard" | "navigation") => Promise<boolean | void>;
  executeVisibleCommandWithReceipt: (controlId: string, clearReceipt: () => void) => Promise<boolean>;
  homeZh: boolean;
  isSheetProtectionEffectiveRef: RefObject<(candidate: SheetModel | null | undefined) => boolean>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  navigationActionReturnFocusRef: RefObject<HTMLButtonElement | null>;
  navigationChartRenameDraft: { sheetId: string; chartId: string; kind: "drawing" | "native"; source: SpreadsheetObject | SpreadsheetChart; name: string; error?: string; } | null;
  navigationPictureRenameDraft: { sheetId: string; objectId: string; sourceObject: SpreadsheetObject; name: string; error?: string; } | null;
  navigationPivotRenameDraft: { sheetId: string; source: PivotConfig; name: string; error?: string; } | null;
  pictureMetadataMutationCommandRef: RefObject<PictureMetadataMutationReceipt | null>;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  rootRef: RefObject<HTMLDivElement | null>;
  scheduleRaf: (callback: () => void) => void;
  selectedChartSelectionRef: RefObject<Readonly<{ sheetId: string; chartId: string; }> | null>;
  selectedObjectIdRef: RefObject<string | null>;
  selectedSlicerId: string | null;
  selectNavigationElement: (selection: SpreadsheetNavigationElementSelection) => void;
  setNavigationChartRenameDraft: Dispatch<SetStateAction<{ sheetId: string; chartId: string; kind: "drawing" | "native"; source: SpreadsheetObject | SpreadsheetChart; name: string; error?: string; } | null>>;
  setNavigationPictureRenameDraft: Dispatch<SetStateAction<{ sheetId: string; objectId: string; sourceObject: SpreadsheetObject; name: string; error?: string; } | null>>;
  setNavigationPivotRenameDraft: Dispatch<SetStateAction<{ sheetId: string; source: PivotConfig; name: string; error?: string; } | null>>;
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  sheets: SheetModel[];
  slicerDesignMutationCommandRef: RefObject<SlicerDesignMutationReceipt | null>;
  spreadsheetNativeWriteRoute: "patchback" | "from-scratch";
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  writeActiveSheetIndex: Dispatch<SetStateAction<number>>;
  writeSelectedChartSelection: (next: Readonly<{ sheetId: string; chartId: string; }> | null) => void;
  writeSelectedInkIds: (ids: ReadonlySet<string>) => void;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetObjectMetadataMutations({
  commitSheets,
  executePictureFormatMutation,
  executeVisibleCommandWithReceipt,
  homeZh,
  isSheetProtectionEffectiveRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  navigationActionReturnFocusRef,
  navigationChartRenameDraft,
  navigationPictureRenameDraft,
  navigationPivotRenameDraft,
  pictureMetadataMutationCommandRef,
  replaceActiveSheet,
  rootRef,
  scheduleRaf,
  selectedChartSelectionRef,
  selectedObjectIdRef,
  selectedSlicerId,
  selectNavigationElement,
  setNavigationChartRenameDraft,
  setNavigationPictureRenameDraft,
  setNavigationPivotRenameDraft,
  setSelectedObjectId,
  sheetProtectionAllowsRef,
  sheets,
  slicerDesignMutationCommandRef,
  spreadsheetNativeWriteRoute,
  t,
  writeActiveSheetIndex,
  writeSelectedChartSelection,
  writeSelectedInkIds,
}: SpreadsheetObjectMetadataMutationsInputs) {
  const executePictureMetadataMutation = (
    controlId: PictureMetadataWriterControlId,
    patch: Pick<
      PictureMetadataMutationReceipt,
      "nextAlt" | "nextCaption" | "nextSrc"
    >,
  ) => {
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    const liveObjectCollection = liveSheet?.objects;
    const selection = selectedObjectIdRef.current;
    const liveObject = liveObjectCollection?.find(
      (object) => object.id === selection,
    );
    const source =
      liveObject?.source &&
      typeof liveObject.source === "object" &&
      !Array.isArray(liveObject.source)
        ? (liveObject.source as Record<string, unknown>)
        : null;
    const nativePart = [source?.part, source?.partName, source?.part_name].find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
    // A picture this page inserted (by the author or the AI) is written whole
    // on every save, its Alt Text and name with it; the pane offered the
    
    const routeWritable =
      spreadsheetNativeWriteRoute === "from-scratch" ||
      (spreadsheetNativeWriteRoute === "patchback" &&
        (Boolean(nativePart) ||
          (liveObject !== undefined && spreadsheetObjectInsertedByPage(liveObject))));
    if (
      !liveSheet ||
      !liveObjectCollection ||
      !liveObject ||
      liveObject.type !== "image" ||
      !selection ||
      !routeWritable ||
      !sheetProtectionAllowsRef.current(liveSheet, "editObjects")
    ) {
      return Promise.resolve(false);
    }
    pictureMetadataMutationCommandRef.current = {
      controlId,
      workbook: liveWorkbook,
      activeSheetIndex: liveIndex,
      sheet: liveSheet,
      sheetId: liveSheet.id,
      objectCollection: liveObjectCollection,
      object: liveObject,
      objectId: liveObject.id,
      selection,
      ...patch,
    };
    return executeVisibleCommandWithReceipt(controlId, () => {
      pictureMetadataMutationCommandRef.current = null;
    });
  };
  const handleNavigationElementAction = useCallback(
    (
      selection: SpreadsheetNavigationElementSelection,
      action: SpreadsheetNavigationElementActionId,
    ) => {
      const targetSheetIndex = sheets.findIndex(
        (candidate) => candidate.id === selection.sheetId && !candidate.hidden,
      );
      const targetSheet = sheets[targetSheetIndex];
      if (
        !targetSheet ||
        !["image", "chart", "pivot", "shape"].includes(selection.kind)
      )
        return;
      navigationActionReturnFocusRef.current =
        rootRef.current?.querySelector<HTMLButtonElement>(
          `[data-testid="spreadsheet-navigation-pane-more-${selection.kind}-${CSS.escape(selection.id)}"]`,
        ) ?? null;
      const changesVisibility = action === "hide" || action === "show";
      if (changesVisibility) {
        if (targetSheetIndex !== liveActiveSheetIndexRef.current) {
          writeActiveSheetIndex(targetSheetIndex);
        }
      } else {
        selectNavigationElement(selection);
      }
      if (selection.kind === "pivot") {
        // The sheet's first PivotTable is `pivot:<sheet>`, the others
        // `pivot:<sheet>:<n>`; each is renamed the same way.
        const moreIndex = selection.id.startsWith(`pivot:${targetSheet.id}:`)
          ? Number(selection.id.slice(`pivot:${targetSheet.id}:`.length)) - 1
          : -1;
        const pivot =
          moreIndex >= 0
            ? targetSheet.morePivots?.[moreIndex]
            : selection.id === `pivot:${targetSheet.id}`
              ? targetSheet.pivot
              : undefined;
        if (!pivot) return;
        if (action !== "rename") return;
        if (
          isSheetProtectionEffectiveRef.current(targetSheet) ||
          pivot.native?.disposition === "preserve-only" ||
          pivot.native?.blocker
        )
          return;
        setNavigationPivotRenameDraft({
          sheetId: targetSheet.id,
          source: pivot,
          name:
            pivot.name ||
            pivot.native?.pivotName ||
            (t("ai.copilot.spreadsheet.pivotTable")),
        });
        return;
      }
      if (action === "hide" || action === "show") {
        const drawingMatches = (targetSheet.objects ?? []).filter(
          (object) =>
            object.id === selection.id && object.type === selection.kind,
        );
        const nativeMatches =
          selection.kind === "chart"
            ? (targetSheet.charts ?? []).filter(
                (chart) => chart.id === selection.id,
              )
            : [];
        if (drawingMatches.length + nativeMatches.length !== 1) return;
        const drawing = drawingMatches[0];
        const native = nativeMatches[0];
        const source = drawing ?? native;
        const nextHidden = action === "hide";
        if (
          !source ||
          Boolean(source.hidden) === nextHidden ||
          isSheetProtectionEffectiveRef.current(targetSheet) ||
          (drawing && drawing.nativeVisibilityBlocker) ||
          (spreadsheetNativeWriteRoute === "patchback" &&
            (!drawing ||
              !spreadsheetObjectHasPatchbackVisibilityIdentity(drawing)))
        )
          return;
        scheduleRaf(() => {
          const liveWorkbook = liveSheetsRef.current;
          const liveIndex = liveActiveSheetIndexRef.current;
          const liveSheet = liveWorkbook[liveIndex];
          if (
            liveSheet?.id !== targetSheet.id ||
            isSheetProtectionEffectiveRef.current(liveSheet)
          )
            return;
          if (drawing) {
            const liveObjects = liveSheet.objects ?? [];
            const liveObject = liveObjects.find(
              (object) =>
                object.id === drawing.id && object.type === drawing.type,
            );
            if (
              liveObject !== drawing ||
              liveObject.nativeVisibilityBlocker ||
              (spreadsheetNativeWriteRoute === "patchback" &&
                !spreadsheetObjectHasPatchbackVisibilityIdentity(liveObject))
            )
              return;
            const updated: SpreadsheetObject = { ...liveObject };
            if (nextHidden) updated.hidden = true;
            else delete updated.hidden;
            if (nextHidden && selectedObjectIdRef.current === liveObject.id) {
              setSelectedObjectId(null);
              writeSelectedInkIds(new Set());
            }
            replaceActiveSheet({
              ...liveSheet,
              objects: liveObjects.map((object) =>
                object === liveObject ? updated : object,
              ),
            });
            return;
          }
          const liveCharts = liveSheet.charts ?? [];
          const liveChart = liveCharts.find(
            (chart) => chart.id === native?.id,
          );
          if (!native || liveChart !== native) return;
          const updated: SpreadsheetChart = { ...liveChart };
          if (nextHidden) updated.hidden = true;
          else delete updated.hidden;
          if (
            nextHidden &&
            selectedChartSelectionRef.current?.chartId === liveChart.id
          ) {
            writeSelectedChartSelection(null);
          }
          replaceActiveSheet({
            ...liveSheet,
            charts: liveCharts.map((chart) =>
              chart === liveChart ? updated : chart,
            ),
          });
        });
        return;
      }
      if (selection.kind === "chart") {
        const drawingMatches = (targetSheet.objects ?? []).filter(
          (object) => object.id === selection.id && object.type === "chart",
        );
        const nativeMatches = (targetSheet.charts ?? []).filter(
          (chart) => chart.id === selection.id,
        );
        if (drawingMatches.length + nativeMatches.length !== 1) return;
        const drawing = drawingMatches[0];
        const native = nativeMatches[0];
        if (action === "rename") {
          const source = drawing ?? native;
          setNavigationChartRenameDraft({
            sheetId: targetSheet.id,
            chartId: selection.id,
            kind: drawing ? "drawing" : "native",
            source,
            name:
              source.name ||
              source.title ||
              (drawing?.caption ?? "") ||
              (t("spreadsheet.review.chart")),
          });
          return;
        }
        scheduleRaf(() => {
          const liveWorkbook = liveSheetsRef.current;
          const liveIndex = liveActiveSheetIndexRef.current;
          const liveSheet = liveWorkbook[liveIndex];
          if (liveSheet?.id !== targetSheet.id) return;
          if (drawing) {
            const liveObjects = liveSheet.objects ?? [];
            const liveObject = liveObjects.find(
              (object) => object.id === drawing.id && object.type === "chart",
            );
            if (liveObject !== drawing) return;
            setSelectedObjectId(null);
            replaceActiveSheet({
              ...liveSheet,
              objects: liveObjects.filter((object) => object.id !== drawing.id),
            });
            return;
          }
          const liveCharts = liveSheet.charts ?? [];
          if (!native || !liveCharts.includes(native)) return;
          const nextCharts = liveCharts.filter((chart) => chart.id !== native.id);
          replaceActiveSheet({
            ...liveSheet,
            charts: nextCharts.length > 0 ? nextCharts : undefined,
          });
        });
        return;
      }
      if (selection.kind === "shape") return;
      const matches = (targetSheet.objects ?? []).filter(
        (object) => object.id === selection.id && object.type === "image",
      );
      const target = matches.length === 1 ? matches[0] : null;
      if (!target) return;
      if (action === "rename") {
        setNavigationPictureRenameDraft({
          sheetId: targetSheet.id,
          objectId: target.id,
          sourceObject: target,
          name:
            target.caption ||
            spreadsheetPictureDisplayName(
              spreadsheetPictureOrdinalMap(targetSheet.objects ?? []).get(
                target,
              ) ?? 0,
              t("presentation.bgFill.picture"),
            ),
        });
        return;
      }
      scheduleRaf(() => {
        void executePictureFormatMutation(
          "XLSCTL.CONTEXT.PICTURE.DELETE.MRAI.APPLY",
          "delete",
          "navigation",
        );
      });
    },
    [
      executePictureFormatMutation,
      homeZh,
      replaceActiveSheet,
      scheduleRaf,
      selectNavigationElement,
      sheets,
      spreadsheetNativeWriteRoute,
      writeSelectedChartSelection,
      writeSelectedInkIds,
      writeActiveSheetIndex,
      setSelectedObjectId, t],
  );
  const commitNavigationPictureRename = useCallback(() => {
    const draft = navigationPictureRenameDraft;
    if (!draft) return;
    const name = normalizedTableAltTextInput(
      draft.name,
      MAX_PICTURE_NAME_LENGTH,
    );
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    const liveObject = liveSheet?.objects?.find(
      (object) => object.id === draft.objectId,
    );
    if (
      !name ||
      liveSheet?.id !== draft.sheetId ||
      liveObject !== draft.sourceObject ||
      selectedObjectIdRef.current !== draft.objectId
    ) {
      setNavigationPictureRenameDraft({ ...draft, error: "stale" });
      return;
    }
    if (name === (liveObject.caption ?? "")) {
      setNavigationPictureRenameDraft(null);
      return;
    }
    void executePictureMetadataMutation(
      "XLSCTL.CONTEXT.PICTURE.ALT_TEXT.MRAI.APPLY",
      { nextCaption: name },
    ).then((applied) => {
      if (applied) setNavigationPictureRenameDraft(null);
      else
        setNavigationPictureRenameDraft((current) =>
          current ? { ...current, error: "blocked" } : current,
        );
    });
  }, [executePictureMetadataMutation, navigationPictureRenameDraft]);
  const commitNavigationChartRename = useCallback(() => {
    const draft = navigationChartRenameDraft;
    if (!draft) return;
    const name = normalizedTableAltTextInput(
      draft.name,
      MAX_PICTURE_NAME_LENGTH,
    );
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    if (!name || liveSheet?.id !== draft.sheetId) {
      setNavigationChartRenameDraft({ ...draft, error: "stale" });
      return;
    }
    if (draft.kind === "drawing") {
      const liveObjects = liveSheet.objects ?? [];
      const liveObject = liveObjects.find(
        (object) => object.id === draft.chartId && object.type === "chart",
      );
      if (liveObject !== draft.source) {
        setNavigationChartRenameDraft({ ...draft, error: "stale" });
        return;
      }
      if (name !== (liveObject.name ?? "")) {
        replaceActiveSheet({
          ...liveSheet,
          objects: liveObjects.map((object) =>
            object.id === liveObject.id ? { ...object, name } : object,
          ),
        });
      }
      setNavigationChartRenameDraft(null);
      return;
    }
    const liveCharts = liveSheet.charts ?? [];
    const liveChart = liveCharts.find((chart) => chart.id === draft.chartId);
    if (liveChart !== draft.source) {
      setNavigationChartRenameDraft({ ...draft, error: "stale" });
      return;
    }
    if (name !== (liveChart.name ?? "")) {
      replaceActiveSheet({
        ...liveSheet,
        charts: liveCharts.map((chart) =>
          chart.id === liveChart.id ? { ...chart, name } : chart,
        ),
      });
    }
    setNavigationChartRenameDraft(null);
  }, [navigationChartRenameDraft, replaceActiveSheet]);
  const commitNavigationPivotRename = useCallback(() => {
    const draft = navigationPivotRenameDraft;
    if (!draft) return;
    const name = normalizedPivotTableObjectName(draft.name);
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    // The PivotTable being renamed, wherever it sits on the sheet.
    const livePivotSlot = liveSheet
      ? sheetPivots(liveSheet).findIndex((pivot) => pivot === draft?.source)
      : -1;
    const livePivot = sheetPivotAt(liveSheet, livePivotSlot < 0 ? 0 : livePivotSlot);
    const duplicate = liveWorkbook.flatMap(sheetPivots).some((candidatePivot) => {
      if (candidatePivot === livePivot) return false;
      return (
        candidatePivot.name ?? candidatePivot.native?.pivotName ?? ""
      ).toLowerCase() === name.toLowerCase();
    });
    if (
      !name ||
      !liveSheet ||
      !livePivot ||
      liveSheet.id !== draft.sheetId ||
      livePivot !== draft.source ||
      isSheetProtectionEffectiveRef.current(liveSheet) ||
      livePivot.native?.disposition === "preserve-only" ||
      Boolean(livePivot.native?.blocker) ||
      duplicate
    ) {
      setNavigationPivotRenameDraft({
        ...draft,
        error: !name ? "invalid" : duplicate ? "duplicate" : "stale",
      });
      return;
    }
    if (name !== (livePivot.name ?? livePivot.native?.pivotName ?? "")) {
      const slot = Math.max(0, livePivotSlot);
      const renamed = sheetWithPivotAt(liveSheet, slot, { ...livePivot, name });
      // Its PivotCharts follow the new name (Excel's c:pivotSource names it).
      const rebound = rebindPivotCharts(
        liveWorkbook,
        liveWorkbook.map((candidate, index) => (index === liveIndex ? renamed : candidate)),
        (bound) =>
          bound.sheetId === liveSheet.id && bound.slot === slot
            ? { sheetId: liveSheet.id, pivotName: name }
            : undefined,
      );
      if (rebound.some((candidate, index) => index !== liveIndex && candidate !== liveWorkbook[index])) {
        commitSheets(rebound);
      } else {
        replaceActiveSheet(rebound[liveIndex] ?? renamed);
      }
    }
    setNavigationPivotRenameDraft(null);
  }, [commitSheets, navigationPivotRenameDraft, replaceActiveSheet]);
  const executeSlicerDesignMutation = (
    controlId: SlicerDesignWriterControlId,
    parameter: string | number | boolean,
  ) => {
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    const sourceSlicerCollection = liveSheet?.slicers;
    const selection = selectedSlicerId;
    const liveSlicer = normalizeSlicers(
      sourceSlicerCollection,
      liveSheet?.columnCount ?? 0,
    ).find((slicer) => slicer.id === selection);
    const routeWritable =
      spreadsheetNativeWriteRoute === "from-scratch" ||
      (controlId === "XLSCTL.CONTEXT.SLICER.CLEAR_FILTER.MRAI.APPLY" &&
        spreadsheetNativeWriteRoute === "patchback");
    if (
      !liveSheet ||
      !liveSlicer ||
      !selection ||
      !routeWritable ||
      // Formatting a slicer is Edit objects; filtering through one needs
      // the slicer's own Locked property, which is not modelled, so it stays
      // shut on a protected sheet.
      (controlId === "XLSCTL.CONTEXT.SLICER.CLEAR_FILTER.MRAI.APPLY"
        ? isSheetProtectionEffectiveRef.current(liveSheet)
        : !sheetProtectionAllowsRef.current(liveSheet, "editObjects"))
    ) {
      return Promise.resolve(false);
    }
    slicerDesignMutationCommandRef.current = {
      controlId,
      workbook: liveWorkbook,
      activeSheetIndex: liveIndex,
      sheet: liveSheet,
      sheetId: liveSheet.id,
      sourceSlicerCollection,
      slicer: liveSlicer,
      slicerId: liveSlicer.id,
      selection,
      parameter: String(parameter),
    };
    return executeVisibleCommandWithReceipt(controlId, () => {
      slicerDesignMutationCommandRef.current = null;
    });
  };
  return {
    commitNavigationChartRename,
    commitNavigationPictureRename,
    commitNavigationPivotRename,
    executePictureMetadataMutation,
    executeSlicerDesignMutation,
    handleNavigationElementAction,
  };
}
