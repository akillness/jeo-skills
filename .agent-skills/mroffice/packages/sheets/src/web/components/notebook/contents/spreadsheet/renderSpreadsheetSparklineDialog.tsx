"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type SparklineType, SPARKLINE_TYPES } from "@mrnote/core/web/lib/spreadsheet/sparkline.ts";
import { chartRangeToA1 } from "@mrnote/core/web/lib/spreadsheet/chart-config.ts";
import { SPREADSHEET_WEB_SPARKLINE_AUTHORING_ENABLED } from "../../../../lib/spreadsheet/feature-capabilities";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";
import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import { type SpreadsheetRangePick } from "./useSpreadsheetRangePick";

/** What renderSpreadsheetSparklineDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetSparklineDialogInputs {
  clearSparklinesForSelection: () => void;
  closeSparklineDialog: () => void;
  gridActiveCellFocusTarget: () => HTMLElement | null;
  insertSparklineForSelection: () => boolean;
  rangePick: SpreadsheetRangePick;
  isSheetProtectionEffectiveRef: RefObject<(candidate: SheetModel | null | undefined) => boolean>;
  selectionHasSparkline: boolean;
  selRect: GridRect;
  setSparklineError: Dispatch<SetStateAction<string | null>>;
  setSparklineRange: Dispatch<SetStateAction<string>>;
  setSparklineType: Dispatch<SetStateAction<SparklineType>>;
  sheet: SheetModel;
  sparklineDialogOpen: boolean;
  sparklineError: string | null;
  sparklineRange: string;
  sparklineType: SparklineType;
  sparklineTypeRef: RefObject<HTMLSelectElement | null>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetSparklineDialog({
  clearSparklinesForSelection,
  closeSparklineDialog,
  gridActiveCellFocusTarget,
  insertSparklineForSelection,
  rangePick,
  isSheetProtectionEffectiveRef,
  selectionHasSparkline,
  selRect,
  setSparklineError,
  setSparklineRange,
  setSparklineType,
  sheet,
  sparklineDialogOpen,
  sparklineError,
  sparklineRange,
  sparklineType,
  sparklineTypeRef,
  t,
}: RenderSpreadsheetSparklineDialogInputs) {
  return (
       SPREADSHEET_WEB_SPARKLINE_AUTHORING_ENABLED && sparklineDialogOpen && !rangePick.picking("spreadsheet-sparkline") ? (
        <OfficeDialogShell
          open
          title={t("spreadsheet.sparklineMenu")}
          description={
            isSheetProtectionEffectiveRef.current(sheet)
              ? t("spreadsheet.protectionBlocked")
              : null
          }
          testIdPrefix="spreadsheet-sparkline"
          defaultActionTestId="spreadsheet-sparkline-apply"
          defaultActionLabel={t("spreadsheet.fmtOk")}
          cancelActionLabel={t("spreadsheet.goalSeekCancel")}
          onDefaultAction={() => {
            if (insertSparklineForSelection()) {
              setSparklineRange("");
              setSparklineType("line");
              closeSparklineDialog();
            }
          }}
          onCancel={closeSparklineDialog}
          defaultActionDisabled={Boolean(isSheetProtectionEffectiveRef.current(sheet))}
          initialFocusRef={sparklineTypeRef}
          returnFocusTarget={gridActiveCellFocusTarget}
          className="sm:max-w-[360px]"
          footerStart={
            <button
              type="button"
              onClick={clearSparklinesForSelection}
              disabled={
                !selectionHasSparkline ||
                isSheetProtectionEffectiveRef.current(sheet)
              }
              title={
                isSheetProtectionEffectiveRef.current(sheet)
                  ? t("spreadsheet.protectionBlocked")
                  : undefined
              }
              data-testid="spreadsheet-sparkline-clear"
              className={dialogParts.button}
            >
              {t("spreadsheet.sparklineClear")}
            </button>
          }
        >
          <label className={dialogParts.row}>
            {t("spreadsheet.sparklineType")}
            <select
              ref={sparklineTypeRef}
              value={sparklineType}
              onChange={(event) => {
                setSparklineType(event.target.value as SparklineType);
                if (sparklineError) setSparklineError(null);
              }}
              data-testid="spreadsheet-sparkline-type"
              style={{ flex: 1 }}
            >
              {SPARKLINE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`spreadsheet.sparklineType_${type}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={dialogParts.field}>
            {t("spreadsheet.chartDataRange")}
            <span style={{ display: "flex", gap: 4 }}>
              <input
                value={sparklineRange}
                onChange={(event) => {
                  setSparklineRange(event.target.value);
                  if (sparklineError) setSparklineError(null);
                }}
                placeholder={t("spreadsheet.sparklineRangePlaceholder")}
                data-testid="spreadsheet-sparkline-range"
                style={{ flex: 1, minWidth: 0 }}
              />
              <SpreadsheetCollapseDialogButton
                label={t("spreadsheet.cfDialog.collapse")}
                onClick={() =>
                  rangePick.start({
                    id: "spreadsheet-sparkline-data",
                    dialogLabel: t("spreadsheet.sparklineMenu"),
                    inputLabel: t("spreadsheet.chartDataRange"),
                    style: "relative",
                    value: sparklineRange,
                    onChange: (text) => {
                      setSparklineRange(text);
                      setSparklineError(null);
                    },
                  })
                }
                testId="spreadsheet-sparkline-range-pick"
              />
            </span>
          </label>
          <label className={dialogParts.field}>
            {t("spreadsheet.uiCopy.locationRange")}
            <span style={{ display: "flex", gap: 4 }}>
              <input
                value={chartRangeToA1(selRect)}
                readOnly
                aria-readonly="true"
                data-testid="spreadsheet-sparkline-location-range"
                style={{ flex: 1, minWidth: 0 }}
              />
              {/* The sparklines go in the selected cells: picking the
                  location selects them. */}
              <SpreadsheetCollapseDialogButton
                label={t("spreadsheet.cfDialog.collapse")}
                onClick={() =>
                  rangePick.start({
                    id: "spreadsheet-sparkline-location",
                    dialogLabel: t("spreadsheet.sparklineMenu"),
                    inputLabel: t("spreadsheet.uiCopy.locationRange"),
                    style: "absolute",
                    value: chartRangeToA1(selRect),
                    onChange: () => {},
                    keepsSelection: true,
                  })
                }
                testId="spreadsheet-sparkline-location-pick"
              />
            </span>
          </label>
          {sparklineError ? (
            <span
              data-testid="spreadsheet-sparkline-error"
              className={dialogParts.error}
            >
              {sparklineError}
            </span>
          ) : null}
        </OfficeDialogShell>
      ) : null
  );
}
