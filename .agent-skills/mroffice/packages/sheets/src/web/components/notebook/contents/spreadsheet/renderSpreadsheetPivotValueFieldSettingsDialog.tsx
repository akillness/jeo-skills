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
import { MAX_PIVOT_VALUE_CAPTION, PIVOT_AGGS, aggLabel, type PivotShowValuesAs, PIVOT_SHOW_VALUES_AS, showValuesAsNeedsBaseField, showValuesAsNeedsBaseItem, type PivotAgg } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type PivotValueFieldSettingsDraft } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";
import { PIVOT_AGG_ICON, SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

/** What renderSpreadsheetPivotValueFieldSettingsDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetPivotValueFieldSettingsDialogInputs {
  applyPivotValueFieldSettings: () => Promise<boolean>;
  executeVisibleCommand: (controlId: string) => Promise<boolean>;
  localizedPivotValueCaption: (agg: PivotAgg, fieldName: string) => string;
  pivotValueNumberFormatOpen: boolean;
  pivotValueNumberFormatTriggerRef: RefObject<HTMLButtonElement | null>;
  pivotValueSettingsApplyDisabled: boolean;
  pivotValueSettingsBaseItemWanted: boolean;
  pivotValueSettingsBaseOptions: { value: string; label: string; }[];
  pivotValueSettingsDraft: PivotValueFieldSettingsDraft | null;
  pivotValueSettingsInitialFocusRef: RefObject<HTMLInputElement | null>;
  pivotValueSettingsNeedsBase: boolean;
  pivotValueSettingsResumeFromNumberFormatRef: RefObject<boolean>;
  pivotValueSettingsReturnFocusRef: RefObject<HTMLButtonElement | null>;
  setPivotValueNumberFormatOpen: Dispatch<SetStateAction<boolean>>;
  setPivotValueSettingsDraft: Dispatch<SetStateAction<PivotValueFieldSettingsDraft | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  visibleCommandDomStateProps: (controlId: string) => { "data-control-id": string; disabled: boolean; hidden: boolean; title: string | undefined; };
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetPivotValueFieldSettingsDialog({
  applyPivotValueFieldSettings,
  executeVisibleCommand,
  localizedPivotValueCaption,
  pivotValueNumberFormatOpen,
  pivotValueNumberFormatTriggerRef,
  pivotValueSettingsApplyDisabled,
  pivotValueSettingsBaseItemWanted,
  pivotValueSettingsBaseOptions,
  pivotValueSettingsDraft,
  pivotValueSettingsInitialFocusRef,
  pivotValueSettingsNeedsBase,
  pivotValueSettingsResumeFromNumberFormatRef,
  pivotValueSettingsReturnFocusRef,
  setPivotValueNumberFormatOpen,
  setPivotValueSettingsDraft,
  t,
  visibleCommandDomStateProps,
}: RenderSpreadsheetPivotValueFieldSettingsDialogInputs) {
  return (
      <OfficeDialogShell
        open={pivotValueSettingsDraft !== null && !pivotValueNumberFormatOpen}
        title={t("spreadsheet.pivotFieldList.valueSettings")}
        description={
          t("spreadsheet.uiCopy.changeThisValueFieldSDisplayNameSummaryFunction")
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={pivotValueSettingsApplyDisabled}
        defaultActionTestId="spreadsheet-pivot-value-settings-apply"
        onDefaultAction={() => void applyPivotValueFieldSettings()}
        onCancel={() => {
          setPivotValueNumberFormatOpen(false);
          setPivotValueSettingsDraft(null);
        }}
        initialFocusRef={
          pivotValueSettingsResumeFromNumberFormatRef.current
            ? pivotValueNumberFormatTriggerRef
            : pivotValueSettingsInitialFocusRef
        }
        returnFocusRef={pivotValueSettingsReturnFocusRef}
        testIdPrefix="spreadsheet-pivot-value-settings"
        className="sm:max-w-[680px]"
      >
        {pivotValueSettingsDraft ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className={dialogParts.field}>
              <span className={dialogParts.label}>{t("spreadsheet.uiCopy.sourceName")}</span>
              <input
                readOnly
                value={pivotValueSettingsDraft?.sourceName ?? ""}
                data-testid="spreadsheet-pivot-value-settings-source-name"
              />
            </label>
            <label className={dialogParts.field}>
              <span className={dialogParts.label}>{t("spreadsheet.uiCopy.customName")}</span>
              <input
                ref={pivotValueSettingsInitialFocusRef}
                value={pivotValueSettingsDraft?.caption ?? ""}
                maxLength={MAX_PIVOT_VALUE_CAPTION}
                aria-invalid={Boolean(pivotValueSettingsDraft?.error)}
                aria-describedby={
                  pivotValueSettingsDraft?.error
                    ? "spreadsheet-pivot-value-settings-error"
                    : undefined
                }
                data-testid="spreadsheet-pivot-value-settings-caption"
                onChange={(event) =>
                  setPivotValueSettingsDraft((current) =>
                    current
                      ? { ...current, caption: event.target.value, error: null }
                      : current,
                  )
                }
              />
            </label>
          </div>

          <div
            role="tablist"
            aria-label={t("spreadsheet.uiCopy.valueFieldSettingsPages")}
            className={dialogParts.tabs}
          >
            {(["summarize", "showAs"] as const).map((tab) => {
              const selected = pivotValueSettingsDraft?.tab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`spreadsheet-pivot-value-settings-tab-${tab}`}
                  aria-controls={`spreadsheet-pivot-value-settings-panel-${tab}`}
                  aria-selected={selected}
                  className={dialogParts.tab}
                  data-testid={`spreadsheet-pivot-value-settings-tab-${tab}`}
                  onClick={() =>
                    setPivotValueSettingsDraft((current) =>
                      current ? { ...current, tab } : current,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "Home",
                        "End",
                      ].includes(event.key)
                    ) {
                      return;
                    }
                    event.preventDefault();
                    const tabs = Array.from(
                      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                        '[role="tab"]',
                      ) ?? [],
                    );
                    const currentIndex = tabs.indexOf(event.currentTarget);
                    const nextIndex =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : (currentIndex +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              tabs.length) %
                            tabs.length;
                    const nextTab = nextIndex === 0 ? "summarize" : "showAs";
                    tabs[nextIndex]?.focus();
                    setPivotValueSettingsDraft((current) =>
                      current
                        ? { ...current, tab: nextTab, error: null }
                        : current,
                    );
                  }}
                >
                  {tab === "summarize"
                    ? t("spreadsheet.uiCopy.summarizeValuesBy")
                    : t("spreadsheet.uiCopy.showValuesAs")}
                </button>
              );
            })}
          </div>

          {pivotValueSettingsDraft?.tab === "summarize" ? (
            <fieldset
              role="tabpanel"
              id="spreadsheet-pivot-value-settings-panel-summarize"
              aria-labelledby="spreadsheet-pivot-value-settings-tab-summarize"
              className="grid gap-2"
              data-testid="spreadsheet-pivot-value-settings-aggregations"
            >
              <legend>
                {t("spreadsheet.uiCopy.summaryFunction")}
              </legend>
              {/* Excel's eleven functions as one list in its own order,
                  scrolling like its list box (XLS-A071). */}
              <div
                className="grid gap-1"
                style={{ maxHeight: 216, overflowY: "auto" }}
                data-testid="spreadsheet-pivot-value-settings-aggregation-list"
              >
              {PIVOT_AGGS.map((agg) => (
                <label
                  key={agg}
                  className={dialogParts.check}
                >
                  <input
                    type="radio"
                    name="pivot-value-aggregation"
                    value={agg}
                    checked={pivotValueSettingsDraft.agg === agg}
                    disabled={Boolean(
                      pivotValueSettingsDraft.originalValue.calcRef,
                    )}
                    title={
                      pivotValueSettingsDraft.originalValue.calcRef
                        ? t("spreadsheet.uiCopy.aCalculatedFieldSSummaryIsDeterminedByIts")
                        : undefined
                    }
                    data-testid={`spreadsheet-pivot-value-settings-agg-${agg}`}
                    onChange={() =>
                      setPivotValueSettingsDraft((current) => {
                        if (!current) return current;
                        // Excel renames the field with the function while
                        // Custom Name still holds a default name.
                        const unedited = [
                          aggLabel(current.agg, current.sourceName),
                          localizedPivotValueCaption(
                            current.agg,
                            current.sourceName,
                          ),
                        ].includes(current.caption.trim());
                        return {
                          ...current,
                          agg,
                          ...(unedited
                            ? {
                                caption: localizedPivotValueCaption(
                                  agg,
                                  current.sourceName,
                                ),
                              }
                            : {}),
                          error: null,
                        };
                      })
                    }
                  />
                  <SpreadsheetDialogIcon name={PIVOT_AGG_ICON[agg]} />
                  {t(
                    `spreadsheet.pivotAgg_${agg}` as "spreadsheet.pivotAgg_sum",
                  )}
                </label>
              ))}
              </div>
            </fieldset>
          ) : (
            <div
              role="tabpanel"
              id="spreadsheet-pivot-value-settings-panel-showAs"
              aria-labelledby="spreadsheet-pivot-value-settings-tab-showAs"
              className="grid gap-3"
            >
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>{t("spreadsheet.pivotShowValuesAs")}</span>
                <select
                  value={pivotValueSettingsDraft?.showAs?.mode ?? "normal"}
                  data-testid="spreadsheet-pivot-value-settings-show-as"
                  onChange={(event) => {
                    const mode = event.target.value as PivotShowValuesAs;
                    if (!PIVOT_SHOW_VALUES_AS.includes(mode)) return;
                    setPivotValueSettingsDraft((current) => {
                      if (!current) return current;
                      if (mode === "normal") {
                        return { ...current, showAs: null, error: null };
                      }
                      const kept = current.showAs?.base;
                      const keepBase =
                        kept && showValuesAsNeedsBaseField(mode)
                          ? {
                              base: showValuesAsNeedsBaseItem(mode)
                                ? { ...kept, item: kept.item ?? "" }
                                : { axis: kept.axis, pos: kept.pos },
                            }
                          : {};
                      return {
                        ...current,
                        showAs: { mode, ...keepBase },
                        error: null,
                      };
                    });
                  }}
                >
                  {PIVOT_SHOW_VALUES_AS.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(
                        `spreadsheet.pivotShowAs_${mode}` as "spreadsheet.pivotShowAs_normal",
                      )}
                    </option>
                  ))}
                </select>
              </label>
              {pivotValueSettingsNeedsBase ? (
                <label className={dialogParts.field}>
                  <span className={dialogParts.label}>
                    {pivotValueSettingsBaseItemWanted
                      ? t("spreadsheet.uiCopy.baseFieldAndItem")
                      : t("spreadsheet.uiCopy.baseField")}
                  </span>
                  <select
                    value={
                      pivotValueSettingsDraft.showAs?.base
                        ? `${pivotValueSettingsDraft.showAs.base.axis}:${pivotValueSettingsDraft.showAs.base.pos}\0${pivotValueSettingsDraft.showAs.base.item}`
                        : ""
                    }
                    data-testid="spreadsheet-pivot-value-settings-base"
                    onChange={(event) => {
                      const encoded = event.target.value;
                      setPivotValueSettingsDraft((current) => {
                        if (!current?.showAs) return current;
                        if (!encoded) {
                          const { base: _base, ...showAs } = current.showAs;
                          void _base;
                          return { ...current, showAs, error: null };
                        }
                        const separator = encoded.indexOf("\0");
                        const head = encoded.slice(0, separator);
                        const item = encoded.slice(separator + 1);
                        const [axisRaw, positionRaw] = head.split(":");
                        const position = Number(positionRaw);
                        if (
                          (axisRaw !== "row" && axisRaw !== "col") ||
                          !Number.isInteger(position) ||
                          position < 0
                        ) {
                          return current;
                        }
                        return {
                          ...current,
                          showAs: {
                            ...current.showAs,
                            base: showValuesAsNeedsBaseItem(current.showAs.mode)
                              ? { axis: axisRaw, pos: position, item }
                              : { axis: axisRaw, pos: position },
                          },
                          error: null,
                        };
                      });
                    }}
                  >
                    <option value="">
                      {t("spreadsheet.uiCopy.chooseABase")}
                    </option>
                    {pivotValueSettingsBaseOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className={dialogParts.hint}>
              {t("spreadsheet.dynamicCopy.pivotValueNumberFormat", { format: pivotValueSettingsDraft.numberFormat ?? t("spreadsheet.fmtCatGeneral") })}
            </span>
            <button
              ref={pivotValueNumberFormatTriggerRef}
              type="button"
              {...visibleCommandDomStateProps(
                "XLSCTL.CONTEXT.PIVOT.VALUE_FIELD_SETTINGS.NUMBER_FORMAT",
              )}
              onClick={() =>
                void executeVisibleCommand(
                  "XLSCTL.CONTEXT.PIVOT.VALUE_FIELD_SETTINGS.NUMBER_FORMAT",
                )
              }
              className={dialogParts.compactButton}
              data-testid="spreadsheet-pivot-value-settings-number-format"
            >
              <SpreadsheetDialogIcon name="numberFormat" />
              {t("spreadsheet.uiCopy.numberFormat")}
            </button>
          </div>

          {pivotValueSettingsDraft?.error ? (
            <p
              id="spreadsheet-pivot-value-settings-error"
              role="alert"
              className={dialogParts.error}
              data-testid="spreadsheet-pivot-value-settings-error"
            >
              {pivotValueSettingsDraft.error}
            </p>
          ) : null}
        </div>
        ) : null}
      </OfficeDialogShell>
  );
}
