"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type SeriesIn, type SeriesType, type SeriesDateUnit } from "../../../../lib/spreadsheet/fill-series";
import { type Dispatch, type SetStateAction } from "react";
import { FILL_SERIES_ICON, SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

/** What renderSpreadsheetFillSeriesDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetFillSeriesDialogInputs {
  applySeries: () => void;
  gridActiveCellFocusTarget: () => HTMLElement | null;
  seriesDateUnit: SeriesDateUnit;
  seriesIn: SeriesIn;
  seriesStatus: { kind: "success" | "error"; text: string; } | null;
  seriesStep: string;
  seriesStop: string;
  seriesTrend: boolean;
  seriesType: SeriesType;
  setSeriesDateUnit: Dispatch<SetStateAction<SeriesDateUnit>>;
  setSeriesDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSeriesIn: Dispatch<SetStateAction<SeriesIn>>;
  setSeriesStatus: Dispatch<SetStateAction<{ kind: "success" | "error"; text: string; } | null>>;
  setSeriesStep: Dispatch<SetStateAction<string>>;
  setSeriesStop: Dispatch<SetStateAction<string>>;
  setSeriesTrend: Dispatch<SetStateAction<boolean>>;
  setSeriesType: Dispatch<SetStateAction<SeriesType>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetFillSeriesDialog({
  applySeries,
  gridActiveCellFocusTarget,
  seriesDateUnit,
  seriesIn,
  seriesStatus,
  seriesStep,
  seriesStop,
  seriesTrend,
  seriesType,
  setSeriesDateUnit,
  setSeriesDialogOpen,
  setSeriesIn,
  setSeriesStatus,
  setSeriesStep,
  setSeriesStop,
  setSeriesTrend,
  setSeriesType,
  t,
}: RenderSpreadsheetFillSeriesDialogInputs) {
  return (
        <OfficeDialogShell
          open
          title={t("spreadsheet.fillSeriesTitle")}
          description={null}
          testIdPrefix="spreadsheet-fill-series"
          defaultActionTestId="spreadsheet-fill-series-run"
          defaultActionLabel={t("spreadsheet.fillSeriesRun")}
          cancelActionLabel={t("spreadsheet.goalSeekCancel")}
          onDefaultAction={applySeries}
          onCancel={() => {
            setSeriesDialogOpen(false);
            setSeriesStatus(null);
          }}
          returnFocusTarget={gridActiveCellFocusTarget}
          className="sm:max-w-[420px]"
        >
          {/* Excel's three option groups side by side: Series in, Type,
              and Date unit (live only for Date). */}
          <span
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, auto)",
              gap: 10,
              alignItems: "start",
            }}
          >
            {(
              [
                {
                  key: "in",
                  legend: t("spreadsheet.fillSeriesIn"),
                  value: seriesIn as string,
                  disabled: false,
                  options: [
                    ["rows", t("spreadsheet.fillSeriesInRows")],
                    ["columns", t("spreadsheet.fillSeriesInColumns")],
                  ],
                  pick: (value: string) => setSeriesIn(value as SeriesIn),
                },
                {
                  key: "type",
                  legend: t("spreadsheet.fillSeriesType"),
                  value: seriesType as string,
                  disabled: false,
                  options: [
                    ["linear", t("spreadsheet.fillSeriesLinear")],
                    ["growth", t("spreadsheet.fillSeriesGrowth")],
                    ["date", t("spreadsheet.fillSeriesDate")],
                    ["autoFill", t("spreadsheet.fillSeriesAutoFill")],
                  ],
                  pick: (value: string) => setSeriesType(value as SeriesType),
                },
                {
                  key: "date-unit",
                  legend: t("spreadsheet.fillSeriesDateUnit"),
                  value: seriesDateUnit as string,
                  disabled: seriesType !== "date",
                  options: [
                    ["day", t("spreadsheet.fillSeriesUnitDay")],
                    ["weekday", t("spreadsheet.fillSeriesUnitWeekday")],
                    ["month", t("spreadsheet.fillSeriesUnitMonth")],
                    ["year", t("spreadsheet.fillSeriesUnitYear")],
                  ],
                  pick: (value: string) =>
                    setSeriesDateUnit(value as SeriesDateUnit),
                },
              ] as {
                key: string;
                legend: string;
                value: string;
                disabled: boolean;
                options: [string, string][];
                pick: (value: string) => void;
              }[]
            ).map((group) => (
              <fieldset
                key={group.key}
                disabled={group.disabled}
                data-testid={`spreadsheet-fill-series-${group.key}`}
              >
                <legend>{group.legend}</legend>
                {group.options.map(([value, label]) => (
                  <label
                    key={value}
                    className={dialogParts.check}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    <input
                      type="radio"
                      name={`spreadsheet-fill-series-${group.key}`}
                      value={value}
                      checked={group.value === value}
                      onChange={() => {
                        group.pick(value);
                        if (seriesStatus) setSeriesStatus(null);
                      }}
                      data-testid={`spreadsheet-fill-series-${group.key}-${value}`}
                    />
                    {FILL_SERIES_ICON[value] ? <SpreadsheetDialogIcon name={FILL_SERIES_ICON[value]} /> : null}
                    {label}
                  </label>
                ))}
              </fieldset>
            ))}
          </span>
          <label className={dialogParts.check}>
            <input
              type="checkbox"
              checked={seriesTrend}
              disabled={seriesType !== "linear" && seriesType !== "growth"}
              onChange={(event) => {
                setSeriesTrend(event.target.checked);
                if (seriesStatus) setSeriesStatus(null);
              }}
              data-testid="spreadsheet-fill-series-trend"
            />
            {t("spreadsheet.fillSeriesTrend")}
          </label>
          <label className={dialogParts.field}>
            {t("spreadsheet.fillSeriesStep")}
            <input
              type="text"
              inputMode="decimal"
              value={seriesStep}
              disabled={seriesType === "autoFill"}
              onChange={(event) => {
                setSeriesStep(event.target.value);
                if (seriesStatus) setSeriesStatus(null);
              }}
              data-testid="spreadsheet-fill-series-step"
            />
          </label>
          <label className={dialogParts.field}>
            {t("spreadsheet.fillSeriesStop")}
            <input
              type="text"
              value={seriesStop}
              disabled={seriesType === "autoFill"}
              onChange={(event) => {
                setSeriesStop(event.target.value);
                if (seriesStatus) setSeriesStatus(null);
              }}
              placeholder={t("spreadsheet.fillSeriesStopPlaceholder")}
              data-testid="spreadsheet-fill-series-stop"
            />
          </label>
          {seriesStatus ? (
            <span
              data-testid="spreadsheet-fill-series-status"
              data-status={seriesStatus.kind}
              className={dialogParts.message}
              data-tone={seriesStatus.kind === "success" ? "success" : "error"}
            >
              {seriesStatus.text}
            </span>
          ) : null}
        </OfficeDialogShell>
  );
}
