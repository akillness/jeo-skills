"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  ArrowDown,
  ArrowUp,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  MAX_MACRO_DESCRIPTION_LENGTH,
  PERSONAL_MACRO_WORKBOOK_NAME,
  describeMacroStep,
  isValidMacroName,
  macroShortcutInputText,
  macroShortcutLabel,
  parseMacroShortcutInput,
  type MacroCellPatch,
  type MacroShortcut,
  type MacroStep,
  type SpreadsheetMacro,
} from "../../../../lib/spreadsheet/macros";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

/** Where a macro is kept: on a worksheet of this workbook (Excel's "This
 *  Workbook") or in this browser's Personal Macro Workbook. */
export type MacroStore = "workbook" | "personal" | "newWorkbook";

export interface MacroDialogEntry {
  /** Stable id for lists (`sheet:<sheetId>:<name>` or `personal:<name>`). */
  readonly id: string;
  readonly macro: SpreadsheetMacro;
  readonly store: MacroStore;
  /** The worksheet that keeps a workbook macro. */
  readonly sheetId?: string;
  readonly sheetName?: string;
  /** What the list shows: the plain name on the active sheet, a qualified
   *  one elsewhere (Excel's `Sheet1.Macro1`, `PERSONAL.XLSB!Macro1`). */
  readonly label: string;
}

export type MacroDialogScope = "all" | "workbook" | "personal";

type Translate = ReturnType<typeof useTranslations<"console-notebooks">>;

/** One readable line for a step, for the Edit dialog and Step Into. */
export function formatMacroStep(
  t: Translate,
  step: MacroStep,
  origin: { row: number; col: number },
): string {
  const description = describeMacroStep(step, origin);
  const params: Record<string, string | number> = { ...description.params };
  if (description.id === "sort") {
    params.direction = t(
      params.direction === "desc"
        ? "spreadsheet.macroStep.descending"
        : "spreadsheet.macroStep.ascending",
    );
  }
  return t(`spreadsheet.macroStep.${description.id}`, params);
}

// ---------------------------------------------------------------------------
// Record Macro
// ---------------------------------------------------------------------------

export interface RecordMacroRequest {
  readonly name: string;
  readonly shortcut: MacroShortcut | undefined;
  readonly store: MacroStore;
  readonly description: string;
}

interface SpreadsheetRecordMacroDialogProps {
  readonly defaultName: string;
  /** Lowercase names already in the chosen store, for the replace notice. */
  readonly takenNames: ReadonlySet<string>;
  readonly personalAvailable: boolean;
  readonly onStart: (request: RecordMacroRequest) => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /** Where focus goes when the dialog closes, ahead of returnFocusRef. */
  readonly returnFocusTarget?: () => HTMLElement | null;
}

/**
 * Excel's Record Macro dialog: name, Ctrl+ shortcut letter, where to store
 * it and a description, filled in BEFORE recording starts. OK starts the
 * recording; Stop Recording saves it without asking again.
 */
export function SpreadsheetRecordMacroDialog({
  defaultName,
  takenNames,
  personalAvailable,
  onStart,
  onCancel,
  returnFocusRef,
  returnFocusTarget,
}: SpreadsheetRecordMacroDialogProps) {
  const t = useTranslations("console-notebooks");
  const [name, setName] = useState(defaultName);
  const [shortcutText, setShortcutText] = useState("");
  const [store, setStore] = useState<MacroStore>("workbook");
  const [description, setDescription] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const valid = isValidMacroName(trimmed);
  const exists = valid && takenNames.has(trimmed.toLowerCase());
  const shortcut = parseMacroShortcutInput(shortcutText) ?? undefined;

  return (
    <OfficeDialogShell
      open
      title={t("spreadsheet.macroRecordDialog.title")}
      description=""
      defaultActionLabel={t("spreadsheet.macroDialog.ok")}
      cancelActionLabel={t("common.cancel")}
      defaultActionDisabled={!valid}
      onDefaultAction={() => {
        if (!valid) return;
        onStart({ name: trimmed, shortcut, store, description: description.trim() });
      }}
      onCancel={onCancel}
      initialFocusRef={nameRef}
      returnFocusRef={returnFocusRef}
      returnFocusTarget={returnFocusTarget}
      className="sm:max-w-[440px]"
      testIdPrefix="spreadsheet-macro-record"
    >
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroRecordDialog.name")}</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="spreadsheet-macro-record-name"
        />
      </label>
      {trimmed !== "" && !valid ? (
        <div className={parts.message} data-tone="warning" data-testid="spreadsheet-macro-record-name-invalid">
          {t("spreadsheet.macroNameInvalid")}
        </div>
      ) : null}
      {exists ? (
        <div className={parts.message} data-tone="warning" data-testid="spreadsheet-macro-record-name-exists">
          {t("spreadsheet.macroRecordDialog.replaceExisting", { name: trimmed })}
        </div>
      ) : null}
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroRecordDialog.shortcut")}</span>
        <span className={parts.inputGroup}>
          <span className={parts.hint}>{t("spreadsheet.macroRecordDialog.shortcutPrefix")}</span>
          <input
            value={shortcutText}
            maxLength={1}
            onChange={(event) => setShortcutText(event.target.value.replace(/[^A-Za-z]/g, "").slice(-1))}
            aria-label={t("spreadsheet.macroRecordDialog.shortcut")}
            className="w-12 text-center"
            data-testid="spreadsheet-macro-record-shortcut"
          />
          {shortcut ? <span className={parts.hint}>{macroShortcutLabel(shortcut)}</span> : null}
        </span>
      </label>
      <p className={parts.hint}>{t("spreadsheet.macroRecordDialog.shortcutHint")}</p>
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroRecordDialog.storeIn")}</span>
        <select
          value={store}
          onChange={(event) => {
            const value = event.target.value;
            setStore(value === "personal" || value === "newWorkbook" ? value : "workbook");
          }}
          data-testid="spreadsheet-macro-record-store"
        >
          {/* Excel's order: Personal Macro Workbook, New Workbook, This Workbook. */}
          <option value="personal" disabled={!personalAvailable}>
            {t("spreadsheet.macroStore.personal")}
          </option>
          <option value="newWorkbook">{t("spreadsheet.macroStore.newWorkbook")}</option>
          <option value="workbook">{t("spreadsheet.macroStore.workbook")}</option>
        </select>
      </label>
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroRecordDialog.description")}</span>
        <textarea
          value={description}
          maxLength={MAX_MACRO_DESCRIPTION_LENGTH}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-16 resize-y"
          data-testid="spreadsheet-macro-record-description"
        />
      </label>
    </OfficeDialogShell>
  );
}

// ---------------------------------------------------------------------------
// The Macro dialog (Alt+F8)
// ---------------------------------------------------------------------------

interface SpreadsheetMacroDialogProps {
  readonly entries: readonly MacroDialogEntry[];
  readonly scope: MacroDialogScope;
  readonly onScopeChange: (scope: MacroDialogScope) => void;
  readonly onRun: (entry: MacroDialogEntry) => void;
  readonly onStepInto: (entry: MacroDialogEntry) => void;
  readonly onEdit: (entry: MacroDialogEntry) => void;
  readonly onCreate: (name: string) => void;
  readonly onDelete: (entry: MacroDialogEntry) => void;
  readonly onOptions: (entry: MacroDialogEntry) => void;
  /** Opens the local automation catalog (scripts), which Excel keeps on
   *  the Automate tab; here it is a step away from the Macro dialog. */
  readonly onScripts?: () => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Excel's Macro dialog (View > Macros > View Macros, Alt+F8): the name box,
 * the list, Run / Step Into / Edit / Create / Delete / Options, the
 * "Macros in" filter and the selected macro's description. Typing a name no
 * macro has turns the default action into Create, as Excel does.
 */
export function SpreadsheetMacroDialog({
  entries,
  scope,
  onScopeChange,
  onRun,
  onStepInto,
  onEdit,
  onCreate,
  onDelete,
  onOptions,
  onScripts,
  onCancel,
  returnFocusRef,
}: SpreadsheetMacroDialogProps) {
  const t = useTranslations("console-notebooks");
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [nameText, setNameText] = useState(entries[0]?.macro.name ?? "");
  const nameRef = useRef<HTMLInputElement>(null);
  // A selection the "Macros in" filter hides, or a deleted one, is gone
  // until the user picks again (the buttons wait).
  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );
  const typedName = nameText.trim();
  const typedMatches =
    selected !== null && typedName.toLowerCase() === selected.macro.name.toLowerCase();
  const createMode = !typedMatches && typedName !== "";
  const createValid = createMode && isValidMacroName(typedName) &&
    !entries.some((entry) => entry.macro.name.toLowerCase() === typedName.toLowerCase());
  const pick = (entry: MacroDialogEntry) => {
    setSelectedId(entry.id);
    setNameText(entry.macro.name);
  };
  const buttonClass = `${parts.compactButton} w-full justify-start`;

  return (
    <OfficeDialogShell
      open
      title={t("spreadsheet.macroDialog.title")}
      description=""
      defaultActionLabel={createMode ? t("spreadsheet.macroDialog.create") : t("spreadsheet.macroDialog.run")}
      cancelActionLabel={t("common.cancel")}
      defaultActionDisabled={createMode ? !createValid : selected === null}
      onDefaultAction={() => {
        if (createMode) {
          if (createValid) onCreate(typedName);
          return;
        }
        if (selected) onRun(selected);
      }}
      onCancel={onCancel}
      initialFocusRef={nameRef}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[560px]"
      testIdPrefix="spreadsheet-macro-dialog"
      footerStart={
        onScripts ? (
          <button
            type="button"
            className={parts.compactButton}
            onClick={onScripts}
            data-testid="spreadsheet-macro-dialog-scripts"
          >
            <SpreadsheetDialogIcon name="scripts" />
            {t("spreadsheet.macroDialog.scripts")}
          </button>
        ) : undefined
      }
    >
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroDialog.name")}</span>
        <input
          ref={nameRef}
          value={nameText}
          onChange={(event) => {
            setNameText(event.target.value);
            const match = entries.find(
              (entry) => entry.macro.name.toLowerCase() === event.target.value.trim().toLowerCase(),
            );
            if (match) setSelectedId(match.id);
          }}
          data-testid="spreadsheet-macro-dialog-name"
        />
      </label>
      {createMode && !createValid ? (
        <div className={parts.message} data-tone="warning">
          {isValidMacroName(typedName)
            ? t("spreadsheet.macroRecordDialog.replaceExisting", { name: typedName })
            : t("spreadsheet.macroNameInvalid")}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div
          className={`${parts.list} max-h-64 min-h-32 overflow-auto`}
          role="listbox"
          aria-label={t("spreadsheet.macroDialog.title")}
          data-testid="spreadsheet-macro-dialog-list"
        >
          {entries.length === 0 ? (
            <p className={parts.hint}>{t("spreadsheet.macrosEmpty")}</p>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={entry.id === selectedId}
                data-selected={entry.id === selectedId ? "true" : undefined}
                className={`${parts.listItem} flex w-full items-center text-left`}
                onClick={() => pick(entry)}
                onDoubleClick={() => onRun(entry)}
                title={entry.macro.description || undefined}
                data-testid={`spreadsheet-macro-dialog-item-${entry.macro.name}`}
              >
                <span className="truncate">{entry.label}</span>
                {entry.macro.shortcut ? (
                  <span className={`${parts.hint} ml-auto shrink-0 pl-3`}>
                    {macroShortcutLabel(entry.macro.shortcut)}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="flex flex-col gap-1.5 sm:w-36">
          <button
            type="button"
            className={buttonClass}
            disabled={!selected}
            onClick={() => selected && onStepInto(selected)}
            data-testid="spreadsheet-macro-dialog-step-into"
          >
            <SpreadsheetDialogIcon name="stepInto" />
            {t("spreadsheet.macroDialog.stepInto")}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!selected}
            onClick={() => selected && onEdit(selected)}
            data-testid="spreadsheet-macro-dialog-edit"
          >
            <SpreadsheetDialogIcon name="edit" />
            {t("spreadsheet.macroDialog.edit")}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!selected}
            onClick={() => selected && onDelete(selected)}
            data-testid="spreadsheet-macro-dialog-delete"
          >
            <SpreadsheetDialogIcon name="delete" />
            {t("spreadsheet.macroDialog.delete")}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!selected}
            onClick={() => selected && onOptions(selected)}
            data-testid="spreadsheet-macro-dialog-options"
          >
            <SpreadsheetDialogIcon name="options" />
            {t("spreadsheet.macroDialog.options")}
          </button>
        </div>
      </div>
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroDialog.macrosIn")}</span>
        <select
          value={scope}
          onChange={(event) => {
            const value = event.target.value;
            onScopeChange(value === "workbook" || value === "personal" ? value : "all");
          }}
          data-testid="spreadsheet-macro-dialog-scope"
        >
          <option value="all">{t("spreadsheet.macroDialog.allOpenWorkbooks")}</option>
          <option value="workbook">{t("spreadsheet.macroStore.workbook")}</option>
          <option value="personal">{PERSONAL_MACRO_WORKBOOK_NAME}</option>
        </select>
      </label>
      <div className={parts.well} data-testid="spreadsheet-macro-dialog-description">
        <span className={parts.label}>{t("spreadsheet.macroDialog.description")}</span>
        <p className={parts.hint}>
          {selected?.macro.description
            ? selected.macro.description
            : selected
              ? t("spreadsheet.macroDialog.noDescription")
              : ""}
        </p>
      </div>
    </OfficeDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Assign Macro (XLS-A081)
// ---------------------------------------------------------------------------

interface SpreadsheetAssignMacroDialogProps {
  readonly entries: readonly MacroDialogEntry[];
  readonly scope: MacroDialogScope;
  readonly onScopeChange: (scope: MacroDialogScope) => void;
  /** The name the box opens with: the assigned macro, or Excel's
   *  `<ObjectName>_Click` proposal. */
  readonly initialName: string;
  /** OK: the chosen entry, or null to take the assignment off (an empty
   *  box, as in Excel). */
  readonly onAssign: (entry: MacroDialogEntry | null) => void;
  /** Record…: record a new macro of the typed name and assign it. */
  readonly onRecord: (name: string) => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Excel's Assign Macro dialog (a shape's, picture's or chart's right-click
 * Assign Macro…): Macro name, the macro list, "Macros in", Record…, OK and
 * Cancel. OK assigns the named macro (clicking the object then runs it); an
 * empty name takes the assignment off. A name no macro has is refused: the
 * page cannot write a new macro the way Excel's New opens the VBA editor, so
 * Record… is the way to make one.
 */
export function SpreadsheetAssignMacroDialog({
  entries,
  scope,
  onScopeChange,
  initialName,
  onAssign,
  onRecord,
  onCancel,
  returnFocusRef,
}: SpreadsheetAssignMacroDialogProps) {
  const t = useTranslations("console-notebooks");
  const initial =
    entries.find((entry) => entry.label.toLowerCase() === initialName.toLowerCase()) ??
    entries.find((entry) => entry.macro.name.toLowerCase() === initialName.toLowerCase()) ??
    null;
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [nameText, setNameText] = useState(initial?.label ?? initialName);
  const nameRef = useRef<HTMLInputElement>(null);
  const typed = nameText.trim().toLowerCase();
  const match =
    entries.find((entry) => entry.id === selectedId && entry.label.toLowerCase() === typed) ??
    entries.find((entry) => entry.label.toLowerCase() === typed) ??
    entries.find((entry) => entry.macro.name.toLowerCase() === typed) ??
    null;
  const missing = typed !== "" && match === null;
  const recordable = typed !== "" && isValidMacroName(nameText.trim()) && match === null;
  return (
    <OfficeDialogShell
      open
      title={t("spreadsheet.assignMacro.title")}
      description=""
      defaultActionLabel={t("spreadsheet.macroDialog.ok")}
      cancelActionLabel={t("common.cancel")}
      defaultActionDisabled={missing}
      onDefaultAction={() => {
        if (missing) return;
        onAssign(match);
      }}
      onCancel={onCancel}
      initialFocusRef={nameRef}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[520px]"
      testIdPrefix="spreadsheet-assign-macro"
      footerStart={
        <button
          type="button"
          className={parts.compactButton}
          disabled={!recordable}
          onClick={() => recordable && onRecord(nameText.trim())}
          data-testid="spreadsheet-assign-macro-record"
        >
          <SpreadsheetDialogIcon name="record" />
          {t("spreadsheet.assignMacro.record")}
        </button>
      }
    >
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroDialog.name")}</span>
        <input
          ref={nameRef}
          value={nameText}
          onChange={(event) => {
            setNameText(event.target.value);
            const value = event.target.value.trim().toLowerCase();
            const hit = entries.find(
              (entry) => entry.label.toLowerCase() === value || entry.macro.name.toLowerCase() === value,
            );
            setSelectedId(hit?.id ?? null);
          }}
          data-testid="spreadsheet-assign-macro-name"
        />
      </label>
      {missing ? (
        <div className={parts.message} data-tone="warning" data-testid="spreadsheet-assign-macro-missing">
          {t("spreadsheet.assignMacro.notFound", { name: nameText.trim() })}
        </div>
      ) : null}
      <div
        className={`${parts.list} max-h-64 min-h-32 overflow-auto`}
        role="listbox"
        aria-label={t("spreadsheet.assignMacro.title")}
        data-testid="spreadsheet-assign-macro-list"
      >
        {entries.length === 0 ? (
          <p className={parts.hint}>{t("spreadsheet.macrosEmpty")}</p>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={entry.id === selectedId}
              data-selected={entry.id === selectedId ? "true" : undefined}
              className={`${parts.listItem} flex w-full items-center text-left`}
              onClick={() => {
                setSelectedId(entry.id);
                setNameText(entry.label);
              }}
              onDoubleClick={() => onAssign(entry)}
              title={entry.macro.description || undefined}
              data-testid={`spreadsheet-assign-macro-item-${entry.macro.name}`}
            >
              <span className="truncate">{entry.label}</span>
            </button>
          ))
        )}
      </div>
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroDialog.macrosIn")}</span>
        <select
          value={scope}
          onChange={(event) => {
            const value = event.target.value;
            onScopeChange(value === "workbook" || value === "personal" ? value : "all");
          }}
          data-testid="spreadsheet-assign-macro-scope"
        >
          <option value="all">{t("spreadsheet.macroDialog.allOpenWorkbooks")}</option>
          <option value="workbook">{t("spreadsheet.macroStore.workbook")}</option>
          <option value="personal">{PERSONAL_MACRO_WORKBOOK_NAME}</option>
        </select>
      </label>
      <div className={parts.well}>
        <span className={parts.label}>{t("spreadsheet.macroDialog.description")}</span>
        <p className={parts.hint}>{match?.macro.description ?? ""}</p>
      </div>
    </OfficeDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Macro Options
// ---------------------------------------------------------------------------

interface SpreadsheetMacroOptionsDialogProps {
  readonly macro: SpreadsheetMacro;
  readonly onSave: (next: { shortcut: MacroShortcut | undefined; description: string }) => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Excel's Macro Options: the shortcut key and the description. */
export function SpreadsheetMacroOptionsDialog({
  macro,
  onSave,
  onCancel,
  returnFocusRef,
}: SpreadsheetMacroOptionsDialogProps) {
  const t = useTranslations("console-notebooks");
  const [shortcutText, setShortcutText] = useState(macroShortcutInputText(macro.shortcut));
  const [description, setDescription] = useState(macro.description ?? "");
  const shortcutRef = useRef<HTMLInputElement>(null);
  const shortcut = parseMacroShortcutInput(shortcutText) ?? undefined;
  return (
    <OfficeDialogShell
      open
      title={t("spreadsheet.macroOptionsDialog.title")}
      description=""
      defaultActionLabel={t("spreadsheet.macroDialog.ok")}
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={() => onSave({ shortcut, description: description.trim() })}
      onCancel={onCancel}
      initialFocusRef={shortcutRef}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[420px]"
      testIdPrefix="spreadsheet-macro-options"
    >
      <div className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroRecordDialog.name")}</span>
        <span className={parts.mono}>{macro.name}</span>
      </div>
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroRecordDialog.shortcut")}</span>
        <span className={parts.inputGroup}>
          <span className={parts.hint}>{t("spreadsheet.macroRecordDialog.shortcutPrefix")}</span>
          <input
            ref={shortcutRef}
            value={shortcutText}
            maxLength={1}
            onChange={(event) => setShortcutText(event.target.value.replace(/[^A-Za-z]/g, "").slice(-1))}
            aria-label={t("spreadsheet.macroRecordDialog.shortcut")}
            className="w-12 text-center"
            data-testid="spreadsheet-macro-options-shortcut"
          />
          {shortcut ? <span className={parts.hint}>{macroShortcutLabel(shortcut)}</span> : null}
        </span>
      </label>
      <p className={parts.hint}>{t("spreadsheet.macroRecordDialog.shortcutHint")}</p>
      <label className={parts.field}>
        <span className={parts.label}>{t("spreadsheet.macroRecordDialog.description")}</span>
        <textarea
          value={description}
          maxLength={MAX_MACRO_DESCRIPTION_LENGTH}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-16 resize-y"
          data-testid="spreadsheet-macro-options-description"
        />
      </label>
    </OfficeDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Edit (the recorded steps)
// ---------------------------------------------------------------------------

interface SpreadsheetMacroEditDialogProps {
  readonly macro: SpreadsheetMacro;
  /** Where the steps' addresses are spelled from (the recording anchor). */
  readonly origin: { row: number; col: number };
  readonly onSave: (steps: MacroStep[]) => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * The macro's steps as a list, in place of Excel's VBA editor: each step
 * reads as one line, can be removed or moved, and a single typed value can
 * be changed in place.
 */
export function SpreadsheetMacroEditDialog({
  macro,
  origin,
  onSave,
  onCancel,
  returnFocusRef,
}: SpreadsheetMacroEditDialogProps) {
  const t = useTranslations("console-notebooks");
  const [steps, setSteps] = useState<MacroStep[]>(() => macro.steps.map((step) => ({ ...step })));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [step] = next.splice(index, 1);
    next.splice(target, 0, step);
    setSteps(next);
  };
  const editableValue = (step: MacroStep): { key: string; value: string } | null => {
    if (step.kind === undefined) return { key: "", value: step.value };
    if (step.kind !== "cells" || step.formatOnly) return null;
    const keys = Object.keys(step.cells);
    if (keys.length !== 1) return null;
    const patch = step.cells[keys[0]];
    if (!patch) return null;
    const value = patch.value;
    if (typeof value !== "string" && typeof value !== "number") return null;
    return { key: keys[0], value: String(value) };
  };
  const setValue = (index: number, text: string) => {
    setSteps((current) =>
      current.map((step, i) => {
        if (i !== index) return step;
        if (step.kind === undefined) return { ...step, value: text };
        if (step.kind !== "cells") return step;
        const key = Object.keys(step.cells)[0];
        const patch = step.cells[key];
        if (!patch) return step;
        const numeric = patch.kind === "number" && text.trim() !== "" && Number.isFinite(Number(text));
        const nextPatch: MacroCellPatch = { ...patch, value: numeric ? Number(text) : text };
        if (typeof nextPatch.value === "string" && nextPatch.value.trim().startsWith("=")) {
          nextPatch.formula = nextPatch.value.trim();
        } else {
          delete nextPatch.formula;
        }
        delete nextPatch.runs;
        return { kind: "cells", cells: { [key]: nextPatch } };
      }),
    );
  };
  return (
    <OfficeDialogShell
      open
      title={t("spreadsheet.macroEditDialog.title", { name: macro.name })}
      description={t("spreadsheet.macroEditDialog.description")}
      defaultActionLabel={t("common.save")}
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={() => onSave(steps)}
      onCancel={onCancel}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[620px]"
      testIdPrefix="spreadsheet-macro-edit"
    >
      {steps.length === 0 ? (
        <p className={parts.hint}>{t("spreadsheet.macroEditDialog.empty")}</p>
      ) : (
        <ol className={`${parts.list} max-h-80 overflow-auto`} data-testid="spreadsheet-macro-edit-steps">
          {steps.map((step, index) => {
            const editable = editableValue(step);
            return (
              <li
                key={index}
                className="flex min-w-0 items-center gap-2 py-1"
                data-testid={`spreadsheet-macro-edit-step-${index}`}
              >
                <span className={`${parts.mono} w-7 shrink-0 text-right`}>{index + 1}</span>
                <span className="min-w-0 flex-1 truncate" title={formatMacroStep(t, step, origin)}>
                  {formatMacroStep(t, step, origin)}
                </span>
                {editable ? (
                  <input
                    value={editable.value}
                    onChange={(event) => setValue(index, event.target.value)}
                    aria-label={t("spreadsheet.macroEditDialog.value")}
                    className="w-32"
                    data-testid={`spreadsheet-macro-edit-value-${index}`}
                  />
                ) : null}
                <button
                  type="button"
                  className={parts.iconButton}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t("spreadsheet.macroEditDialog.moveUp")}
                  title={t("spreadsheet.macroEditDialog.moveUp")}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={parts.iconButton}
                  onClick={() => move(index, 1)}
                  disabled={index === steps.length - 1}
                  aria-label={t("spreadsheet.macroEditDialog.moveDown")}
                  title={t("spreadsheet.macroEditDialog.moveDown")}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={parts.iconButton}
                  onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
                  aria-label={t("spreadsheet.macroEditDialog.removeStep")}
                  title={t("spreadsheet.macroEditDialog.removeStep")}
                  data-testid={`spreadsheet-macro-edit-remove-${index}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </OfficeDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Step Into
// ---------------------------------------------------------------------------

interface SpreadsheetMacroStepBarProps {
  readonly name: string;
  readonly index: number;
  readonly total: number;
  readonly nextStep: string | null;
  readonly busy: boolean;
  readonly onStep: () => void;
  readonly onContinue: () => void;
  readonly onStop: () => void;
}

/**
 * Excel's Step Into runs a macro one statement at a time in the VBA editor
 * (F8 steps, F5 continues). This strip sits above the status bar and names
 * the next step; each step is its own commit, so Undo takes it back alone.
 */
export function SpreadsheetMacroStepBar({
  name,
  index,
  total,
  nextStep,
  busy,
  onStep,
  onContinue,
  onStop,
}: SpreadsheetMacroStepBarProps) {
  const t = useTranslations("console-notebooks");
  return (
    <div
      role="status"
      className="flex items-center gap-3 border-t border-slate-200 bg-amber-50 px-3 py-1.5 text-xs text-slate-700"
      data-testid="spreadsheet-macro-step-bar"
      onKeyDown={(event) => {
        if (event.key === "F8") {
          event.preventDefault();
          onStep();
        } else if (event.key === "F5") {
          event.preventDefault();
          onContinue();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onStop();
        }
      }}
    >
      <strong className="shrink-0">{t("spreadsheet.macroStepBar.title", { name })}</strong>
      <span className="min-w-0 flex-1 truncate" data-testid="spreadsheet-macro-step-bar-next">
        {nextStep === null
          ? t("spreadsheet.macroStepBar.finished")
          : t("spreadsheet.macroStepBar.next", { index: index + 1, total, step: nextStep })}
      </span>
      <button
        type="button"
        className={parts.compactButton}
        disabled={busy || nextStep === null}
        onClick={onStep}
        data-testid="spreadsheet-macro-step-bar-step"
      >
        <SpreadsheetDialogIcon name="step" />
        {t("spreadsheet.macroStepBar.step")}
      </button>
      <button
        type="button"
        className={parts.compactButton}
        disabled={busy || nextStep === null}
        onClick={onContinue}
        data-testid="spreadsheet-macro-step-bar-continue"
      >
        <SpreadsheetDialogIcon name="continue" />
        {t("spreadsheet.macroStepBar.continue")}
      </button>
      <button
        type="button"
        className={parts.compactButton}
        onClick={onStop}
        data-testid="spreadsheet-macro-step-bar-stop"
      >
        <SpreadsheetDialogIcon name="stop" />
        {t("spreadsheet.macroStepBar.stop")}
      </button>
    </div>
  );
}
