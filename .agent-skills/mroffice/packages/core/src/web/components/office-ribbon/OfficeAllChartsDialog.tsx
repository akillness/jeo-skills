"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useTranslations } from "../../../host/next-intl";

import { OfficeDialogShell } from "./OfficeDialogShell";
import { officeDialogParts as dialogParts } from "./officeDialogChrome";
import { OfficeChartSchematic } from "./OfficeChartSchematic";
import {
  CHART_SUBTYPES_BY_FAMILY,
  type ChartFamily,
  type ChartSubtype,
} from "../../lib/office-charts/catalog";
import type { OfficeChartTemplate } from "../../lib/office-charts/chart-templates";
import type { OfficeChartTemplateImportResult } from "../../lib/office-charts/chart-template-store";

/**
 * Office's Insert Chart / Change Chart Type dialog, All Charts tab: the
 * Templates folder first, then every chart family; a family's subtypes as a
 * row of pictures and, under it, the chosen subtype drawn large (Microsoft
 * Support, "Change the chart type of an existing chart": "select a chart
 * type in the first box and the subtype in the second"; "Save a custom chart
 * as a template": Templates applies a saved template like any other type).
 *
 * The dialog only picks. The host says which leaves its chart (or the chart
 * about to be inserted) can take, draws the preview (the chart's own data
 * as the new type, or the sample a new chart gets) and applies the choice:
 * the worksheet through its commands, Docs and Slides on the shared model.
 * Excel's Recommended Charts tab reads a cell range and stays the worksheet's
 * (`tabStrip`).
 *
 * Manage Templates (Excel opens the Templates folder to rename, delete or
 * copy `.crtx` files in) is the folder's own commands here: Rename, Download
 * (`.crtx`), Delete and Import Template…, the same in every editor
 * (`officeUserChartTemplateCommands`); the dialog says how each went.
 */

export type OfficeAllChartsChoice =
  | { readonly kind: "type"; readonly family: ChartFamily; readonly subtype: ChartSubtype }
  | { readonly kind: "template"; readonly template: OfficeChartTemplate };

export interface OfficeAllChartsLeafState {
  readonly enabled: boolean;
  /** Why the leaf cannot be chosen (shown on its picture). */
  readonly reason?: string;
}

export interface OfficeAllChartsTemplates {
  readonly items: readonly OfficeChartTemplate[];
  /** The folder is still being read, or could not be. */
  readonly status?: "loading" | "ready" | "failed";
  /** What an empty folder says (where templates come from). */
  readonly emptyLabel: string;
  readonly failedLabel?: string;
  readonly loadingLabel?: string;
  /** Whether a template can be applied to this chart (its type may refuse the data). */
  readonly state?: (template: OfficeChartTemplate) => OfficeAllChartsLeafState;
  /** The chart as the template would make it. */
  readonly preview?: (template: OfficeChartTemplate) => ReactNode;
  /** Manage Templates: each command answers whether it was done. */
  readonly onDelete?: (template: OfficeChartTemplate) => void | boolean | Promise<boolean>;
  readonly onRename?: (template: OfficeChartTemplate, name: string) => boolean | Promise<boolean>;
  readonly onDownload?: (template: OfficeChartTemplate) => boolean | Promise<boolean>;
  readonly onImport?: (file: File) => Promise<OfficeChartTemplateImportResult>;
  /** Whether Rename and Delete may change this template (a read-only workbook's own may not). */
  readonly canEdit?: (template: OfficeChartTemplate) => boolean;
  /** Whether this template downloads as a `.crtx` (the user's folder does). */
  readonly canDownload?: (template: OfficeChartTemplate) => boolean;
  /** Where a template lives, when the folder mixes places ("In this workbook"). */
  readonly badge?: (template: OfficeChartTemplate) => string | undefined;
}

export interface OfficeAllChartsDialogProps {
  readonly mode: "insert" | "change";
  readonly initialFamily: ChartFamily;
  readonly initialSubtype?: ChartSubtype;
  /** Open on the Templates folder. */
  readonly initialTemplates?: boolean;
  /** The families listed, in the host's order (Office's catalog). */
  readonly families: readonly ChartFamily[];
  readonly leafState?: (family: ChartFamily, subtype: ChartSubtype) => OfficeAllChartsLeafState;
  /** The chosen subtype drawn large; absent, the row of pictures is all. */
  readonly preview?: (family: ChartFamily, subtype: ChartSubtype) => ReactNode;
  readonly templates?: OfficeAllChartsTemplates;
  readonly onConfirm: (choice: OfficeAllChartsChoice) => void;
  readonly onCancel: () => void;
  /** Excel's Recommended Charts / All Charts tabs (Insert only). */
  readonly tabStrip?: ReactNode;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly testIdPrefix: string;
}

const ENABLED: OfficeAllChartsLeafState = { enabled: true };

interface ManageStatus {
  readonly tone: "ok" | "error";
  readonly text: string;
}

interface Draft {
  family: ChartFamily;
  subtype: ChartSubtype;
  templates: boolean;
  templateId?: string;
}

function firstSubtype(family: ChartFamily): ChartSubtype {
  return CHART_SUBTYPES_BY_FAMILY[family][0] as ChartSubtype;
}

export function OfficeAllChartsDialog(props: OfficeAllChartsDialogProps) {
  const t = useTranslations("console-notebooks");
  const prefix = props.testIdPrefix;
  const leafState = props.leafState ?? (() => ENABLED);
  const templates = props.templates;
  const templateItems = templates?.items ?? [];
  const [draft, setDraft] = useState<Draft>(() => {
    const family = props.initialFamily;
    const subtype =
      props.initialSubtype && (CHART_SUBTYPES_BY_FAMILY[family] as readonly string[]).includes(props.initialSubtype)
        ? props.initialSubtype
        : firstSubtype(family);
    return { family, subtype, templates: Boolean(props.initialTemplates && templates) };
  });
  const [manage, setManage] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageStatus, setManageStatus] = useState<ManageStatus | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const canManage = Boolean(
    templates && (templates.onDelete || templates.onRename || templates.onDownload || templates.onImport),
  );
  // One folder command at a time; its outcome is said in the dialog.
  const runManage = async (work: () => unknown, okText: string | null, errorText: string) => {
    if (manageBusy) return;
    setManageBusy(true);
    setManageStatus(null);
    let done = false;
    try {
      done = (await work()) !== false;
    } catch {
      done = false;
    }
    setManageBusy(false);
    if (!done) setManageStatus({ tone: "error", text: errorText });
    else if (okText) setManageStatus({ tone: "ok", text: okText });
  };
  const importFile = async (file: File) => {
    if (!templates?.onImport || manageBusy) return;
    setManageBusy(true);
    setManageStatus(null);
    let result: OfficeChartTemplateImportResult = "failed";
    try {
      result = await templates.onImport(file);
    } catch {
      result = "failed";
    }
    setManageBusy(false);
    setManageStatus(
      result === "ok"
        ? { tone: "ok", text: t("office.allCharts.imported") }
        : {
            tone: "error",
            text:
              result === "limit"
                ? t("office.allCharts.folderFull")
                : result === "tooLarge"
                  ? t("office.allCharts.importTooLarge")
                  : result === "unreadable" || result === "invalid"
                    ? t("office.allCharts.importUnreadable")
                    : t("office.allCharts.importFailed"),
          },
    );
  };
  const commitRename = () => {
    const draftName = renaming;
    const entry = draftName ? templateItems.find((item) => item.id === draftName.id) : undefined;
    if (!draftName || !entry || !templates?.onRename) return;
    const name = draftName.name.trim();
    if (!name || name === entry.name) {
      setRenaming(null);
      return;
    }
    setRenaming(null);
    void runManage(() => templates.onRename?.(entry, name), null, t("office.allCharts.renameFailed"));
  };
  const familyLabel = (family: ChartFamily) =>
    t(`toolbar.chartV2.family.${family}` as "toolbar.chartV2.family.column");
  const subtypeLabel = (family: ChartFamily, subtype: ChartSubtype) =>
    t(`toolbar.chartV2.subtype.${family}.${subtype}` as "toolbar.chartV2.subtype.column.clustered");
  // The template picked: the one named, else the folder's first.
  const template = draft.templates
    ? (templateItems.find((entry) => entry.id === draft.templateId) ?? templateItems[0] ?? null)
    : null;
  const templateState = (entry: OfficeChartTemplate) => templates?.state?.(entry) ?? ENABLED;
  const chosenState = draft.templates
    ? template
      ? templateState(template)
      : { enabled: false }
    : leafState(draft.family, draft.subtype);
  const confirm = () => {
    if (!chosenState.enabled) return;
    if (draft.templates) {
      if (template) props.onConfirm({ kind: "template", template });
      return;
    }
    props.onConfirm({ kind: "type", family: draft.family, subtype: draft.subtype });
  };
  const onListKey = (event: KeyboardEvent<HTMLDivElement>, pick: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick();
    }
  };
  const tile = (
    key: string,
    family: ChartFamily,
    subtype: ChartSubtype,
    label: string,
    checked: boolean,
    state: OfficeAllChartsLeafState,
    testId: string,
    onPick: () => void,
    onConfirmPick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={state.enabled ? undefined : true}
      aria-label={state.enabled || !state.reason ? label : `${label}: ${state.reason}`}
      title={state.enabled || !state.reason ? label : `${label}: ${state.reason}`}
      className={dialogParts.choice}
      data-testid={testId}
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 4,
        padding: 6,
        outline: checked ? "2px solid var(--office-dialog-accent, #0f6cbd)" : undefined,
      }}
      // A disabled leaf is still pickable so its preview and reason show;
      // OK stays greyed for it.
      onClick={onPick}
      onDoubleClick={() => {
        if (state.enabled) onConfirmPick();
      }}
    >
      <OfficeChartSchematic family={family} subtype={subtype} />
      <span style={{ fontSize: 11, maxWidth: 96, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </button>
  );
  const previewWell = (heading: string, picture: ReactNode, reason: string | undefined) => (
    <div
      data-testid={`${prefix}-preview`}
      aria-live="polite"
      className={dialogParts.well}
      style={{ display: "grid", gap: 6, padding: 10, minWidth: 0 }}
    >
      <strong style={{ fontSize: 13 }}>{heading}</strong>
      {picture ? (
        <div aria-hidden="true" style={{ width: "100%", height: 220, minWidth: 0, overflow: "hidden" }}>
          {picture}
        </div>
      ) : null}
      {reason ? (
        <span className={dialogParts.hint} data-testid={`${prefix}-preview-reason`}>
          {reason}
        </span>
      ) : null}
    </div>
  );
  const subtypes = CHART_SUBTYPES_BY_FAMILY[draft.family] as readonly ChartSubtype[];
  return (
    <OfficeDialogShell
      open
      title={props.mode === "change" ? t("spreadsheet.uiCopy.changeChartType") : t("spreadsheet.insertRibbon.insertChart")}
      description={null}
      defaultActionLabel={t("spreadsheet.fmtOk")}
      cancelActionLabel={t("spreadsheet.fmtCancel")}
      onDefaultAction={confirm}
      onCancel={props.onCancel}
      defaultActionDisabled={!chosenState.enabled}
      returnFocusRef={props.returnFocusRef}
      className="sm:max-w-[780px]"
      testIdPrefix={prefix}
      tabStrip={props.tabStrip}
      footerStart={
        draft.templates && canManage ? (
          <button
            type="button"
            className={dialogParts.button}
            aria-pressed={manage}
            data-testid={`${prefix}-manage-templates`}
            onClick={() => {
              setManage((current) => !current);
              setRenaming(null);
              setManageStatus(null);
            }}
          >
            {manage ? t("office.allCharts.manageDone") : t("office.allCharts.manage")}
          </button>
        ) : undefined
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.55fr) minmax(320px, 1.45fr)", gap: 12 }}>
        <div role="listbox" aria-label={t("spreadsheet.insertRibbon.allCharts")} className={`${dialogParts.list} max-h-[460px]`}>
          {templates ? (
            // Office lists the Templates folder first.
            <div
              role="option"
              tabIndex={0}
              aria-selected={draft.templates}
              className={dialogParts.listItem}
              data-testid={`${prefix}-family-templates`}
              onClick={() => setDraft((current) => ({ ...current, templates: true }))}
              onKeyDown={(event) => onListKey(event, () => setDraft((current) => ({ ...current, templates: true })))}
            >
              {t("spreadsheet.chartTemplate.templates")}
            </div>
          ) : null}
          {props.families.map((family) => {
            const pick = () => setDraft({ family, subtype: firstSubtype(family), templates: false });
            return (
              <div
                key={family}
                role="option"
                tabIndex={0}
                aria-selected={!draft.templates && draft.family === family}
                className={dialogParts.listItem}
                data-testid={`${prefix}-family-${family}`}
                onClick={pick}
                onKeyDown={(event) => onListKey(event, pick)}
              >
                {familyLabel(family)}
              </div>
            );
          })}
        </div>
        {draft.templates && templates ? (
          <div data-testid={`${prefix}-templates`} style={{ display: "grid", gap: 10, alignContent: "start", minWidth: 0 }}>
            {templateItems.length ? (
              <div role="radiogroup" aria-label={t("spreadsheet.chartTemplate.templates")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {templateItems.map((entry) => (
                  <span key={entry.id} style={{ display: "grid", justifyItems: "center", gap: 2 }}>
                    {tile(
                      entry.id,
                      entry.chartType,
                      entry.chartSubtype,
                      entry.name,
                      template?.id === entry.id,
                      templateState(entry),
                      `${prefix}-template-${entry.id}`,
                      () => setDraft((current) => ({ ...current, templates: true, templateId: entry.id })),
                      () => props.onConfirm({ kind: "template", template: entry }),
                    )}
                    {templates.badge?.(entry) ? (
                      <span className={dialogParts.hint} style={{ fontSize: 10 }} data-testid={`${prefix}-template-badge-${entry.id}`}>
                        {templates.badge(entry)}
                      </span>
                    ) : null}
                    {manage ? (
                      renaming?.id === entry.id ? (
                        <span style={{ display: "grid", gap: 4, justifyItems: "center" }}>
                          <input
                            value={renaming.name}
                            maxLength={255}
                            autoFocus
                            aria-label={t("office.allCharts.renameLabel")}
                            style={{ width: 120 }}
                            data-testid={`${prefix}-template-rename-input-${entry.id}`}
                            onChange={(event) => setRenaming({ id: entry.id, name: event.target.value })}
                            onKeyDown={(event) => {
                              // The dialog's own Enter (OK) and Escape (Cancel) stay out of the box.
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.stopPropagation();
                                commitRename();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                event.stopPropagation();
                                setRenaming(null);
                              }
                            }}
                          />
                          <span style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              className={dialogParts.compactButton}
                              disabled={!renaming.name.trim()}
                              data-testid={`${prefix}-template-rename-save-${entry.id}`}
                              onClick={commitRename}
                            >
                              {t("spreadsheet.chartTemplate.save")}
                            </button>
                            <button type="button" className={dialogParts.compactButton} onClick={() => setRenaming(null)}>
                              {t("spreadsheet.fmtCancel")}
                            </button>
                          </span>
                        </span>
                      ) : (
                        <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4, maxWidth: 140 }}>
                          {templates.onRename ? (
                            <button
                              type="button"
                              className={dialogParts.compactButton}
                              disabled={manageBusy || templates.canEdit?.(entry) === false}
                              data-testid={`${prefix}-template-rename-${entry.id}`}
                              onClick={() => setRenaming({ id: entry.id, name: entry.name })}
                            >
                              {t("office.allCharts.rename")}
                            </button>
                          ) : null}
                          {templates.onDownload && templates.canDownload?.(entry) !== false ? (
                            <button
                              type="button"
                              className={dialogParts.compactButton}
                              disabled={manageBusy}
                              data-testid={`${prefix}-template-download-${entry.id}`}
                              onClick={() =>
                                void runManage(
                                  () => templates.onDownload?.(entry),
                                  null,
                                  t("office.allCharts.downloadFailed"),
                                )
                              }
                            >
                              {t("office.allCharts.download")}
                            </button>
                          ) : null}
                          {templates.onDelete ? (
                            <button
                              type="button"
                              className={dialogParts.compactButton}
                              disabled={manageBusy || templates.canEdit?.(entry) === false}
                              data-testid={`${prefix}-template-delete-${entry.id}`}
                              onClick={() =>
                                void runManage(
                                  () => templates.onDelete?.(entry),
                                  null,
                                  t("office.allCharts.deleteFailed"),
                                )
                              }
                            >
                              {t("spreadsheet.chartTemplate.deleteTemplate")}
                            </button>
                          ) : null}
                        </span>
                      )
                    ) : null}
                  </span>
                ))}
              </div>
            ) : (
              <p className={dialogParts.hint} data-testid={`${prefix}-templates-empty`}>
                {templates.status === "loading"
                  ? (templates.loadingLabel ?? templates.emptyLabel)
                  : templates.status === "failed"
                    ? (templates.failedLabel ?? templates.emptyLabel)
                    : templates.emptyLabel}
              </p>
            )}
            {manage && templates.onImport ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className={dialogParts.compactButton}
                  disabled={manageBusy}
                  data-testid={`${prefix}-template-import`}
                  onClick={() => importRef.current?.click()}
                >
                  {t("office.allCharts.import")}
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".crtx,application/vnd.ms-excel.chart-template"
                  hidden
                  data-testid={`${prefix}-template-import-file`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void importFile(file);
                  }}
                />
              </div>
            ) : null}
            {manageStatus ? (
              <p
                role="status"
                className={manageStatus.tone === "error" ? dialogParts.error : dialogParts.hint}
                data-testid={`${prefix}-template-status`}
              >
                {manageStatus.text}
              </p>
            ) : null}
            {template
              ? previewWell(
                  template.name,
                  templates.preview?.(template) ?? null,
                  templateState(template).enabled ? undefined : templateState(template).reason,
                )
              : null}
          </div>
        ) : (
          <div data-testid={`${prefix}-subtypes`} style={{ display: "grid", gap: 10, alignContent: "start", minWidth: 0 }}>
            <div role="radiogroup" aria-label={familyLabel(draft.family)} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {subtypes.map((subtype) =>
                tile(
                  subtype,
                  draft.family,
                  subtype,
                  subtypeLabel(draft.family, subtype),
                  draft.subtype === subtype,
                  leafState(draft.family, subtype),
                  `${prefix}-subtype-${subtype}`,
                  () => setDraft((current) => ({ ...current, subtype })),
                  () => props.onConfirm({ kind: "type", family: draft.family, subtype }),
                ),
              )}
            </div>
            {props.preview
              ? previewWell(
                  subtypeLabel(draft.family, draft.subtype),
                  props.preview(draft.family, draft.subtype),
                  chosenState.enabled ? undefined : chosenState.reason,
                )
              : !chosenState.enabled && chosenState.reason
                ? <p className={dialogParts.hint} data-testid={`${prefix}-preview-reason`}>{chosenState.reason}</p>
                : null}
          </div>
        )}
      </div>
    </OfficeDialogShell>
  );
}

export interface OfficeChartTemplateSaveDialogProps {
  readonly initialName: string;
  /** What saving does here (the workbook's folder and a `.crtx`, or the user's folder). */
  readonly description: ReactNode;
  readonly maxLength: number;
  readonly busy?: boolean;
  /** The file extension written after the name box (Excel's `.crtx`). */
  readonly extension?: string;
  readonly onSave: (name: string) => void;
  readonly onCancel: () => void;
  readonly testIdPrefix: string;
}

/** Save Chart Template: the name box of a chart's Save as Template…. */
export function OfficeChartTemplateSaveDialog(props: OfficeChartTemplateSaveDialogProps) {
  const t = useTranslations("console-notebooks");
  const [name, setName] = useState(props.initialName);
  return (
    <OfficeDialogShell
      open
      title={t("spreadsheet.chartTemplate.saveTitle")}
      description={props.description}
      defaultActionLabel={t("spreadsheet.chartTemplate.save")}
      cancelActionLabel={t("spreadsheet.fmtCancel")}
      defaultActionDisabled={!name.trim() || props.busy}
      busy={props.busy}
      onDefaultAction={() => {
        if (name.trim()) props.onSave(name);
      }}
      onCancel={props.onCancel}
      className="sm:max-w-[440px]"
      testIdPrefix={props.testIdPrefix}
    >
      <label className={dialogParts.field}>
        <span className={dialogParts.label}>{t("spreadsheet.chartTemplate.fileName")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            value={name}
            maxLength={props.maxLength}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            data-testid={`${props.testIdPrefix}-name`}
          />
          {props.extension ? <span className={dialogParts.hint}>{props.extension}</span> : null}
        </span>
      </label>
    </OfficeDialogShell>
  );
}
