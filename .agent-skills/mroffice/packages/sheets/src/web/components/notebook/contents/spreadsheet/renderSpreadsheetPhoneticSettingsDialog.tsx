"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { SPREADSHEET_PHONETIC_TYPES, type SpreadsheetPhoneticType, SPREADSHEET_PHONETIC_ALIGNMENTS, type SpreadsheetPhoneticAlignment, DEFAULT_PHONETIC_FONT_PT, type SpreadsheetPhoneticSettings } from "@mrnote/core/web/lib/spreadsheet/cell-phonetic.ts";
import { type Dispatch, type SetStateAction } from "react";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";

/** What renderSpreadsheetPhoneticSettingsDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetPhoneticSettingsDialogInputs {
  activePhoneticCell: SpreadsheetCell;
  executeVisibleCommand: (controlId: string) => Promise<boolean>;
  gridActiveCellFocusTarget: () => HTMLElement | null;
  phoneticSettingsDraft: SpreadsheetPhoneticSettings;
  phoneticSettingsTab: "font" | "settings";
  setPhoneticSettingsDraft: Dispatch<SetStateAction<SpreadsheetPhoneticSettings>>;
  setPhoneticSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setPhoneticSettingsTab: Dispatch<SetStateAction<"font" | "settings">>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  visibleCommandState: (controlId: string) => ResolvedSpreadsheetVisibleControl;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetPhoneticSettingsDialog({
  activePhoneticCell,
  executeVisibleCommand,
  gridActiveCellFocusTarget,
  phoneticSettingsDraft,
  phoneticSettingsTab,
  setPhoneticSettingsDraft,
  setPhoneticSettingsOpen,
  setPhoneticSettingsTab,
  t,
  visibleCommandState,
}: RenderSpreadsheetPhoneticSettingsDialogInputs) {
  return (
        <OfficeDialogShell
          open
          title={t("spreadsheet.phonetic.settingsTitle")}
          description={null}
          testIdPrefix="spreadsheet-phonetic-settings"
          defaultActionTestId="spreadsheet-phonetic-settings-ok"
          defaultActionLabel={t("toolbar.phoneticGuide.ok")}
          cancelActionLabel={t("toolbar.phoneticGuide.cancel")}
          onDefaultAction={() =>
            void executeVisibleCommand("XLSCTL.HOME.FONT.PHONETIC_SETTINGS.OK")
          }
          onCancel={() => setPhoneticSettingsOpen(false)}
          defaultActionDisabled={
            !visibleCommandState("XLSCTL.HOME.FONT.PHONETIC_SETTINGS.OK").enabled
          }
          defaultActionData={{
            "data-control-id": "XLSCTL.HOME.FONT.PHONETIC_SETTINGS.OK",
            "data-control-surface": "phonetic-settings-dialog",
            "data-control-occurrence-id": "ok",
          }}
          returnFocusTarget={gridActiveCellFocusTarget}
          className="sm:max-w-[420px]"
          tabStrip={
            <span
              role="tablist"
              aria-label={t("spreadsheet.phonetic.settingsTitle")}
              className={dialogParts.tabs}
            >
              {(
                [
                  ["settings", t("spreadsheet.phonetic.tabSettings")],
                  ["font", t("toolbar.phoneticGuide.font")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={phoneticSettingsTab === id}
                  data-testid={`spreadsheet-phonetic-settings-tab-${id}`}
                  className={dialogParts.tab}
                  onClick={() => setPhoneticSettingsTab(id)}
                >
                  {label}
                </button>
              ))}
            </span>
          }
        >
          {phoneticSettingsTab === "settings" ? (
            <div className="grid gap-3" role="tabpanel" data-testid="spreadsheet-phonetic-settings-panel">
              <fieldset className="grid gap-1.5">
                <legend className={dialogParts.sectionTitle}>{t("spreadsheet.phonetic.typeLabel")}</legend>
                {SPREADSHEET_PHONETIC_TYPES.map((type) => (
                  <label key={type} className={dialogParts.check}>
                    <input
                      type="radio"
                      name="spreadsheet-phonetic-type"
                      data-testid={`spreadsheet-phonetic-type-${type}`}
                      checked={phoneticSettingsDraft.type === type}
                      onChange={() =>
                        setPhoneticSettingsDraft((draft) => ({ ...draft, type: type as SpreadsheetPhoneticType }))
                      }
                    />
                    <span>{t(`spreadsheet.phonetic.types.${type}`)}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="grid gap-1.5">
                <legend className={dialogParts.sectionTitle}>{t("toolbar.phoneticGuide.alignment")}</legend>
                {SPREADSHEET_PHONETIC_ALIGNMENTS.map((alignment) => (
                  <label key={alignment} className={dialogParts.check}>
                    <input
                      type="radio"
                      name="spreadsheet-phonetic-alignment"
                      data-testid={`spreadsheet-phonetic-alignment-${alignment}`}
                      checked={phoneticSettingsDraft.alignment === alignment}
                      onChange={() =>
                        setPhoneticSettingsDraft((draft) => ({
                          ...draft,
                          alignment: alignment as SpreadsheetPhoneticAlignment,
                        }))
                      }
                    />
                    <span>{t(`spreadsheet.phonetic.alignments.${alignment}`)}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          ) : (
            <div className="grid gap-3" role="tabpanel" data-testid="spreadsheet-phonetic-font-panel">
              <label className={dialogParts.check}>
                <input
                  type="checkbox"
                  data-testid="spreadsheet-phonetic-font-default"
                  checked={phoneticSettingsDraft.font === null}
                  onChange={(event) =>
                    setPhoneticSettingsDraft((draft) => ({
                      ...draft,
                      font: event.target.checked
                        ? null
                        : {
                            family: activePhoneticCell?.style?.fontFamily ?? "",
                            size: DEFAULT_PHONETIC_FONT_PT,
                          },
                    }))
                  }
                />
                <span>{t("spreadsheet.phonetic.defaultFont")}</span>
              </label>
              {phoneticSettingsDraft.font ? (
                <>
                  <label className={dialogParts.field}>
                    <span className={dialogParts.label}>{t("toolbar.phoneticGuide.font")}</span>
                    <input
                      data-testid="spreadsheet-phonetic-font-family"
                      value={phoneticSettingsDraft.font.family}
                      onChange={(event) => {
                        const family = event.target.value;
                        setPhoneticSettingsDraft((draft) =>
                          draft.font ? { ...draft, font: { ...draft.font, family } } : draft,
                        );
                      }}
                    />
                  </label>
                  <label className={dialogParts.field}>
                    <span className={dialogParts.label}>
                      {`${t("toolbar.phoneticGuide.size")} (${t("toolbar.phoneticGuide.points")})`}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={409}
                      step={0.5}
                      data-testid="spreadsheet-phonetic-font-size"
                      value={phoneticSettingsDraft.font.size}
                      onChange={(event) => {
                        const size = Number(event.target.value);
                        if (!Number.isFinite(size) || size < 1 || size > 409) return;
                        setPhoneticSettingsDraft((draft) =>
                          draft.font ? { ...draft, font: { ...draft.font, size } } : draft,
                        );
                      }}
                    />
                  </label>
                  <label className={dialogParts.check}>
                    <input
                      type="checkbox"
                      data-testid="spreadsheet-phonetic-font-bold"
                      checked={phoneticSettingsDraft.font.bold === true}
                      onChange={(event) => {
                        const bold = event.target.checked;
                        setPhoneticSettingsDraft((draft) => {
                          if (!draft.font) return draft;
                          const font = { ...draft.font };
                          if (bold) font.bold = true;
                          else delete font.bold;
                          return { ...draft, font };
                        });
                      }}
                    />
                    <span>{t("spreadsheet.phonetic.bold")}</span>
                  </label>
                  <label className={dialogParts.check}>
                    <input
                      type="checkbox"
                      data-testid="spreadsheet-phonetic-font-italic"
                      checked={phoneticSettingsDraft.font.italic === true}
                      onChange={(event) => {
                        const italic = event.target.checked;
                        setPhoneticSettingsDraft((draft) => {
                          if (!draft.font) return draft;
                          const font = { ...draft.font };
                          if (italic) font.italic = true;
                          else delete font.italic;
                          return { ...draft, font };
                        });
                      }}
                    />
                    <span>{t("spreadsheet.phonetic.italic")}</span>
                  </label>
                  <label className={dialogParts.field}>
                    <span className={dialogParts.label}>{t("spreadsheet.phonetic.color")}</span>
                    <input
                      type="color"
                      data-testid="spreadsheet-phonetic-font-color"
                      value={phoneticSettingsDraft.font.color ?? "#000000"}
                      onChange={(event) => {
                        const color = event.target.value.toLowerCase();
                        setPhoneticSettingsDraft((draft) =>
                          draft.font ? { ...draft, font: { ...draft.font, color } } : draft,
                        );
                      }}
                    />
                  </label>
                </>
              ) : null}
            </div>
          )}
        </OfficeDialogShell>
  );
}
