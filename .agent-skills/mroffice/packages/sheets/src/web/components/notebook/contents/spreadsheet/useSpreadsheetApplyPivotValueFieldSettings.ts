"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { sheetPivotAt, MAX_PIVOT_VALUE_CAPTION, valueFieldLabel, MAX_PIVOT_VALUE_NUMBER_FORMAT, type PivotValueField, type PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type PivotContextWriterControlId, type PivotValueFieldSettingsDraft } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetApplyPivotValueFieldSettings reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetApplyPivotValueFieldSettingsInputs {
  activePivotSlotRef: RefObject<number>;
  homeZh: boolean;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  locale: string;
  pivotConfig: PivotConfig | null;
  pivotContextMutationExecutorRef: RefObject<(controlId: PivotContextWriterControlId, nextPivot: PivotConfig | null, moveDestination?: "existing" | "new") => Promise<boolean>>;
  pivotFieldLabel: (colIndex: number) => string;
  pivotValueSettingsDraft: PivotValueFieldSettingsDraft | null;
  setPivotValueNumberFormatOpen: Dispatch<SetStateAction<boolean>>;
  setPivotValueSettingsDraft: Dispatch<SetStateAction<PivotValueFieldSettingsDraft | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetApplyPivotValueFieldSettings({
  activePivotSlotRef,
  homeZh,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  locale,
  pivotConfig,
  pivotContextMutationExecutorRef,
  pivotFieldLabel,
  pivotValueSettingsDraft,
  setPivotValueNumberFormatOpen,
  setPivotValueSettingsDraft,
  t,
}: SpreadsheetApplyPivotValueFieldSettingsInputs) {
  const applyPivotValueFieldSettings = useCallback(() => {
    const draft = pivotValueSettingsDraft;
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    const livePivot = sheetPivotAt(liveSheet, activePivotSlotRef.current);
    const liveValue = pivotConfig?.values[draft?.valueIndex ?? -1];
    const fail = (message: string) => {
      setPivotValueSettingsDraft((current) =>
        current ? { ...current, error: message } : null,
      );
      return Promise.resolve(false);
    };
    if (
      !draft ||
      !liveSheet ||
      !livePivot ||
      liveWorkbook !== draft.workbook ||
      liveIndex !== draft.activeSheetIndex ||
      liveSheet !== draft.sheet ||
      livePivot !== draft.pivot ||
      !pivotConfig ||
      !liveValue ||
      JSON.stringify(liveValue) !== JSON.stringify(draft.originalValue)
    ) {
      return fail(
        t("spreadsheet.uiCopy.thePivotTableChangedCloseAndReopenValueFieldSettings"),
      );
    }
    const caption = draft.caption.trim();
    if (
      caption.length === 0 ||
      caption.length > MAX_PIVOT_VALUE_CAPTION ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(caption)
    ) {
      return fail(
        t("spreadsheet.uiCopy.customNameCannotBeBlankOrContainInvalidCharacters"),
      );
    }
    const duplicate = pivotConfig.values.some((value, index) => {
      if (index === draft.valueIndex) return false;
      return (
        valueFieldLabel(value, pivotFieldLabel(value.colIndex))
          .trim()
          .toLocaleLowerCase(locale) === caption.toLocaleLowerCase(locale)
      );
    });
    if (duplicate) {
      return fail(
        t("spreadsheet.uiCopy.anotherValueFieldAlreadyUsesThisCustomName"),
      );
    }
    const showAs = draft.showAs;
    const numberFormat = draft.numberFormat?.trim() ?? "";
    if (
      numberFormat.length > MAX_PIVOT_VALUE_NUMBER_FORMAT ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(numberFormat)
    ) {
      return fail(
        t("spreadsheet.uiCopy.theNumberFormatIsInvalidOrExceedsTheLength"),
      );
    }
    if (
      showAs &&
      (showAs.mode === "differenceFrom" ||
        showAs.mode === "percentDifferenceFrom") &&
      !showAs.base
    ) {
      return fail(
        t("spreadsheet.uiCopy.chooseABaseFieldAndItemForThisCalculation"),
      );
    }
    // The name Excel's English default gives the CHOSEN function stays
    // implicit; anything else, a localized default included, is stored.
    const impliedCaption = valueFieldLabel(
      { ...liveValue, agg: draft.agg, caption: undefined },
      draft.sourceName,
    );
    const nextValue: PivotValueField = {
      ...liveValue,
      agg: draft.agg,
      ...(caption === impliedCaption ? {} : { caption }),
    };
    if (caption === impliedCaption) delete nextValue.caption;
    if (numberFormat && numberFormat !== "General") {
      nextValue.numberFormat = numberFormat;
    } else {
      delete nextValue.numberFormat;
    }
    if (showAs && showAs.mode !== "normal") {
      nextValue.showAs = {
        ...showAs,
        ...(showAs.base ? { base: { ...showAs.base } } : {}),
      };
    } else {
      delete nextValue.showAs;
    }
    const nextPivot: PivotConfig = {
      ...pivotConfig,
      values: pivotConfig.values.map((value, index) =>
        index === draft.valueIndex ? nextValue : value,
      ),
    };
    return pivotContextMutationExecutorRef.current(
      "XLSCTL.CONTEXT.PIVOT.VALUE_FIELD_SETTINGS.MRAI.APPLY",
      nextPivot,
    ).then((executed) => {
      if (executed) {
        setPivotValueNumberFormatOpen(false);
        setPivotValueSettingsDraft(null);
      }
      return executed;
    });
  }, [
    homeZh,
    locale,
    pivotConfig,
    pivotFieldLabel,
    pivotValueSettingsDraft, t]);
  return {
    applyPivotValueFieldSettings,
  };
}
