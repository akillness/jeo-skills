"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { type TimelineGranularity, TIMELINE_GRANULARITIES } from "../../../../lib/spreadsheet/timeline-slicer";
import { type Dispatch, type SetStateAction } from "react";
import { type TimelinePeriod } from "../../../../lib/spreadsheet/timeline-slicer";

/** What renderSpreadsheetTimelineDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetTimelineDialogInputs {
  applyTimelineRange: (col: number, ordinalA: number, ordinalB: number) => void;
  gridActiveCellFocusTarget: () => HTMLElement | null;
  setColumnFilter: (col: number, allowed: string[] | null) => void;
  setTimelineColumn: Dispatch<SetStateAction<number | null>>;
  setTimelineGranularity: Dispatch<SetStateAction<TimelineGranularity>>;
  setTimelinePanelOpen: Dispatch<SetStateAction<boolean>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  timelineColumn: number | null;
  timelineDateColumns: { col: number; label: string; }[];
  timelineGranularity: TimelineGranularity;
  timelinePanelOpen: boolean;
  timelinePeriods: TimelinePeriod[];
  timelineSpan: { fromOrdinal: number; toOrdinal: number; } | null;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetTimelineDialog({
  applyTimelineRange,
  gridActiveCellFocusTarget,
  setColumnFilter,
  setTimelineColumn,
  setTimelineGranularity,
  setTimelinePanelOpen,
  t,
  timelineColumn,
  timelineDateColumns,
  timelineGranularity,
  timelinePanelOpen,
  timelinePeriods,
  timelineSpan,
}: RenderSpreadsheetTimelineDialogInputs) {
  return (
      <OfficeDialogShell
        open={timelinePanelOpen}
        title={t("spreadsheet.timelineMenu")}
        description={t("spreadsheet.timelineColumn")}
        testIdPrefix="spreadsheet-timeline"
        defaultActionLabel={t("common.close")}
        cancelActionLabel={t("common.close")}
        showCancelAction={false}
        onDefaultAction={() => setTimelinePanelOpen(false)}
        onCancel={() => setTimelinePanelOpen(false)}
        returnFocusTarget={gridActiveCellFocusTarget}
        footerStart={
          timelineColumn !== null && timelineSpan && timelinePeriods.length > 0 ? (
            <button
              type="button"
              className={dialogParts.button}
              onClick={() => setColumnFilter(timelineColumn, null)}
              data-testid="spreadsheet-timeline-clear"
            >
              {t("spreadsheet.timelineClear")}
            </button>
          ) : null
        }
        className="sm:max-w-[420px]"
      >
        <div className="grid gap-3" data-testid="spreadsheet-timeline-panel">
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>
              {t("spreadsheet.timelineColumn")}
            </span>
            <select
              value={timelineColumn === null ? "" : String(timelineColumn)}
              onChange={(event) =>
                setTimelineColumn(
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
              data-testid="spreadsheet-timeline-column"
            >
              <option value="">{t("spreadsheet.timelineColumnNone")}</option>
              {timelineDateColumns.map((c) => (
                <option key={c.col} value={String(c.col)}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {timelineDateColumns.length === 0 ? (
            <p
              className={dialogParts.hint}
              data-testid="spreadsheet-timeline-no-columns"
            >
              {t("spreadsheet.timelineNoDateColumns")}
            </p>
          ) : null}
          {timelineColumn !== null && timelinePeriods.length === 0 ? (
            <p className={dialogParts.hint} data-testid="spreadsheet-timeline-empty">
              {t("spreadsheet.timelineNoDates")}
            </p>
          ) : null}
          {timelineColumn !== null && timelineSpan && timelinePeriods.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <label className={dialogParts.field}>
                  <span className={dialogParts.label}>
                    {t("spreadsheet.timelineGranularity")}
                  </span>
                  <select
                    value={timelineGranularity}
                    onChange={(event) =>
                      setTimelineGranularity(
                        event.target.value as TimelineGranularity,
                      )
                    }
                    data-testid="spreadsheet-timeline-granularity"
                  >
                    {TIMELINE_GRANULARITIES.map((g) => (
                      <option key={g} value={g}>
                        {t(`spreadsheet.timelineGran.${g}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={dialogParts.field}>
                  <span className={dialogParts.label}>
                    {t("spreadsheet.timelineFrom")}
                  </span>
                  <select
                    value={String(timelineSpan.fromOrdinal)}
                    onChange={(event) =>
                      applyTimelineRange(
                        timelineColumn,
                        Number(event.target.value),
                        timelineSpan.toOrdinal,
                      )
                    }
                    data-testid="spreadsheet-timeline-from"
                  >
                    {timelinePeriods.map((p) => (
                      <option key={p.key} value={String(p.ordinal)}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={dialogParts.field}>
                  <span className={dialogParts.label}>
                    {t("spreadsheet.timelineTo")}
                  </span>
                  <select
                    value={String(timelineSpan.toOrdinal)}
                    onChange={(event) =>
                      applyTimelineRange(
                        timelineColumn,
                        timelineSpan.fromOrdinal,
                        Number(event.target.value),
                      )
                    }
                    data-testid="spreadsheet-timeline-to"
                  >
                    {timelinePeriods.map((p) => (
                      <option key={p.key} value={String(p.ordinal)}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex max-h-[92px] flex-wrap gap-1 overflow-y-auto">
                {timelinePeriods.map((p) => {
                  const selected =
                    p.ordinal >=
                      Math.min(timelineSpan.fromOrdinal, timelineSpan.toOrdinal) &&
                    p.ordinal <=
                      Math.max(timelineSpan.fromOrdinal, timelineSpan.toOrdinal);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        applyTimelineRange(timelineColumn, p.ordinal, p.ordinal)
                      }
                      data-testid={`spreadsheet-timeline-period-${p.key}`}
                      title={p.label}
                      className={dialogParts.choice}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </OfficeDialogShell>
  );
}
