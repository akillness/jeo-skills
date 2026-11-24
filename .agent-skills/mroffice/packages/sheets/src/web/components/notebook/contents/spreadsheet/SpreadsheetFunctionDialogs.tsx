"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type {
  ArgField,
} from "../../../../lib/spreadsheet/function-arguments";
import type {
  FunctionCategory,
} from "../../../../lib/spreadsheet/function-catalog";

import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import { SpreadsheetFormulaIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetFormulaRibbonIcons.tsx";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

export interface SpreadsheetFunctionDialogLabels {
  readonly insertFunction: string;
  readonly search: string;
  readonly category: string;
  readonly noMatch: string;
  readonly argumentsTitle: string;
  readonly noArguments: string;
  readonly optional: string;
  readonly optionalWord: string;
  readonly required: string;
  readonly addArgument: string;
  /** "Formula result =" — Excel's own label for the whole formula's value. */
  readonly result: string;
  /** "Help on this function": opens the function's full argument help. */
  readonly help: string;
  /** Shown under the list while nothing is selected. */
  readonly pickHint: string;
  /** The per-argument Collapse Dialog button (Excel's RefEdit up arrow). */
  readonly collapse: string;
  readonly confirm: string;
  readonly cancel: string;
}

/** One argument's live state beside its box, as Excel draws it. */
export interface ArgFieldState {
  /** The argument's own help text, or null when the catalog has none. */
  readonly help: string | null;
  /** The evaluated value shown to the right of the box ("= 89"), or null. */
  readonly evaluated: string | null;
}

export interface SpreadsheetFunctionDialogsProps {
  readonly pickerOpen: boolean;
  readonly argumentFunction: string | null;
  readonly search: string;
  readonly category: FunctionCategory;
  readonly categories: readonly FunctionCategory[];
  readonly functions: readonly string[];
  readonly selectedFunction: string | null;
  readonly selectedHint: string | null;
  /** The selected function's one-line description (Insert Function). */
  readonly selectedSummary: string | null;
  readonly argumentSignature: string | null;
  readonly argumentFields: readonly ArgField[];
  readonly argumentValues: readonly string[];
  /** Per-field help + evaluated value, same order and length as the fields. */
  readonly argumentStates: readonly ArgFieldState[];
  /** The chosen function's own description, above the arguments. */
  readonly argumentSummary: string | null;
  readonly preview: string | null;
  readonly argumentError?: string | null;
  readonly labels: SpreadsheetFunctionDialogLabels;
  readonly categoryLabel: (category: FunctionCategory) => string;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onSearchChange: (value: string) => void;
  readonly onCategoryChange: (category: FunctionCategory) => void;
  readonly onSelectFunction: (name: string) => void;
  readonly onOpenArguments: (name: string) => void;
  readonly onCancelPicker: () => void;
  readonly onArgumentChange: (index: number, value: string) => void;
  /** An argument box was left: Excel quotes plain words there. */
  readonly onArgumentBlur?: (index: number) => void;
  readonly onAddArgument: () => void;
  readonly onConfirmArguments: () => void;
  readonly onCancelArguments: () => void;
  /** Collapse the dialog and pick this argument's range on the sheet. */
  readonly onCollapseArgument?: (index: number) => void;
}

function DialogTitle({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <SpreadsheetFormulaIcon name="insertFunction" size={24} />
      <span>{children}</span>
    </span>
  );
}

/**
 * "Help on this function" — Excel opens the function's reference topic in the
 * Help window. MRAI has no separate help window, so the link discloses the same
 * material in place: the description plus what every argument is for. A
 * function the catalog has no help for does not offer the link at all.
 */
function FunctionHelpDisclosure({
  label,
  summary,
  rows,
  testIdPrefix,
}: {
  readonly label: string;
  readonly summary: string | null;
  readonly rows: ReadonlyArray<{ label: string; text: string }>;
  readonly testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  if (!summary && rows.length === 0) return null;
  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        data-testid={`${testIdPrefix}-help`}
        className={dialogParts.link}
      >
        {label}
      </button>
      {open ? (
        <dl
          data-testid={`${testIdPrefix}-help-body`}
          className={`${dialogParts.well} m-0 grid gap-1 px-2 py-1.5`}
        >
          {summary ? <p className="m-0">{summary}</p> : null}
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
              <dt className="m-0 truncate font-medium">
                {row.label}
              </dt>
              <dd className="m-0">{row.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}















export function SpreadsheetFunctionDialogs({
  pickerOpen,
  argumentFunction,
  search,
  category,
  categories,
  functions,
  selectedFunction,
  selectedHint,
  selectedSummary,
  argumentSignature,
  argumentFields,
  argumentValues,
  argumentStates,
  argumentSummary,
  preview,
  argumentError = null,
  labels,
  categoryLabel,
  returnFocusRef,
  onSearchChange,
  onCategoryChange,
  onSelectFunction,
  onOpenArguments,
  onCancelPicker,
  onArgumentChange,
  onArgumentBlur,
  onAddArgument,
  onConfirmArguments,
  onCancelArguments,
  onCollapseArgument,
}: SpreadsheetFunctionDialogsProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstArgumentRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Which argument's description is shown: Excel describes the argument whose
  // box has the caret. Before anything is clicked that is the first one, the
  // box the dialog opens with focus in.
  // Derived, not synchronised: a different function starts at its first box
  // again without an effect having to reset anything.
  const [focus, setFocus] = useState<{
    fn: string | null;
    index: number;
  }>({ fn: argumentFunction, index: 0 });
  const focusedArgument = focus.fn === argumentFunction ? focus.index : 0;
  const setFocusedArgument = (index: number) =>
    setFocus({ fn: argumentFunction, index });

  // Excel keeps the selected function in view as the list is walked.
  useEffect(() => {
    if (!pickerOpen || !selectedFunction) return;
    // Function names are letters, digits, "." and "_", so the attribute value
    // needs no escaping; scrollIntoView is absent in some test environments.
    const option = listRef.current?.querySelector(
      `[data-function="${selectedFunction}"]`,
    );
    if (option instanceof HTMLElement) {
      option.scrollIntoView?.({ block: "nearest" });
    }
  }, [pickerOpen, selectedFunction]);

  const helpRows = argumentFields
    .map((field, index) => ({
      label: field.label,
      text: argumentStates[index]?.help ?? "",
    }))
    .filter((row, index, rows) =>
      row.text !== "" && rows.findIndex((r) => r.label === row.label) === index,
    );

  const focusedField = argumentFields[focusedArgument];
  const focusedHelp = argumentStates[focusedArgument]?.help ?? null;
  const selectedListed =
    selectedFunction !== null && functions.includes(selectedFunction);

  return (
    <>
      <OfficeDialogShell
        open={pickerOpen}
        title={<DialogTitle>{labels.insertFunction}</DialogTitle>}
        description={labels.search}
        defaultActionLabel={labels.confirm}
        cancelActionLabel={labels.cancel}
        onDefaultAction={() => {
          if (selectedFunction) onOpenArguments(selectedFunction);
        }}
        onCancel={onCancelPicker}
        defaultActionDisabled={!selectedFunction}
        initialFocusRef={searchInputRef}
        returnFocusRef={returnFocusRef}
        className="sm:max-w-[620px]"
        testIdPrefix="spreadsheet-insert-function"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-3">
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{labels.search}</span>
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                // Excel walks into the result list from the search box.
                if (event.key !== "ArrowDown" || functions.length === 0) return;
                event.preventDefault();
                const at = selectedFunction
                  ? functions.indexOf(selectedFunction)
                  : -1;
                const next = functions[Math.min(at + 1, functions.length - 1)];
                if (next) onSelectFunction(next);
              }}
              placeholder={labels.search}
              aria-label={labels.search}
              autoComplete="off"
              data-testid="spreadsheet-insert-function-search"
            />
          </label>
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{labels.category}</span>
            <select
              value={category}
              onChange={(event) =>
                onCategoryChange(event.target.value as FunctionCategory)
              }
              aria-label={labels.category}
              data-testid="spreadsheet-insert-function-category"
            >
              {categories.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label={labels.insertFunction}
          data-testid="spreadsheet-insert-function-list"
          className={`${dialogParts.list} max-h-64`}
          onKeyDown={(event) => {
            // A list box walks with the arrow keys (WAI-ARIA APG Listbox:
            // Down / Up to the next / previous option, Home / End to the
            // ends), selection following focus as Excel's list does; the
            // syntax below the list follows.
            const step =
              event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowUp"
                  ? -1
                  : event.key === "Home"
                    ? -Infinity
                    : event.key === "End"
                      ? Infinity
                      : 0;
            if (step === 0 || functions.length === 0) return;
            event.preventDefault();
            const focused =
              event.target instanceof HTMLElement
                ? event.target.closest<HTMLElement>("[data-function]")?.dataset.function
                : undefined;
            let from = functions.indexOf(focused ?? selectedFunction ?? "");
            // Nothing selected yet: Down starts at the top, Up at the bottom.
            if (from < 0) from = step > 0 ? -1 : functions.length;
            const at = Math.max(0, Math.min(functions.length - 1, from + step));
            const next = functions[at];
            onSelectFunction(next);
            const option = listRef.current?.querySelector(`[data-function="${next}"]`);
            if (option instanceof HTMLElement) {
              option.focus();
              option.scrollIntoView?.({ block: "nearest" });
            }
          }}
        >
          {functions.length === 0 ? (
            <p
              role="status"
              aria-live="polite"
              data-testid="spreadsheet-insert-function-empty"
              className={`${dialogParts.hint} m-0 px-2 py-8 text-center`}
            >
              {labels.noMatch}
            </p>
          ) : (
            functions.map((name, index) => {
              const selected = selectedFunction === name;
              // One tab stop for the list (roving tabindex): the selected
              // function, or the first while none of these is selected.
              const tabStop = selected || (index === 0 && !selectedListed);
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={tabStop ? 0 : -1}
                  data-function={name}
                  onClick={() => onSelectFunction(name)}
                  onDoubleClick={() => onOpenArguments(name)}
                  data-testid={`spreadsheet-insert-function-item-${name}`}
                  className={`${dialogParts.listItem} flex w-full items-center`}
                >
                  {name}
                </button>
              );
            })
          )}
        </div>

        {/* Excel draws the syntax and a one-line description of the selected
            function immediately below the list. */}
        <div
          data-testid="spreadsheet-insert-function-hint"
          aria-live="polite"
          className={`${dialogParts.well} grid min-h-12 gap-1 px-2 py-1.5`}
        >
          <span className="font-mono">
            {selectedHint ?? "—"}
          </span>
          <span
            data-testid="spreadsheet-insert-function-description"
            className={dialogParts.hint}
          >
            {selectedFunction ? (selectedSummary ?? "") : labels.pickHint}
          </span>
        </div>

        <FunctionHelpDisclosure
          label={labels.help}
          summary={selectedSummary}
          rows={[]}
          testIdPrefix="spreadsheet-insert-function"
        />
      </OfficeDialogShell>

      <OfficeDialogShell
        open={argumentFunction !== null}
        title={<DialogTitle>{labels.argumentsTitle}</DialogTitle>}
        description={argumentSignature ?? argumentFunction ?? labels.argumentsTitle}
        defaultActionLabel={labels.confirm}
        cancelActionLabel={labels.cancel}
        onDefaultAction={onConfirmArguments}
        onCancel={onCancelArguments}
        defaultActionDisabled={argumentError !== null}
        initialFocusRef={
          argumentFields.length > 0 ? firstArgumentRef : undefined
        }
        returnFocusRef={returnFocusRef}
        className="sm:max-w-[620px]"
        testIdPrefix="spreadsheet-function-args"
      >
        <div
          data-testid="spreadsheet-function-args-signature"
          className={`${dialogParts.well} px-2 py-1.5 font-mono`}
        >
          {argumentSignature ?? argumentFunction}
        </div>

        {argumentFields.length === 0 ? (
          <p
            data-testid="spreadsheet-function-args-noargs"
            className={`${dialogParts.hint} m-0 px-3 py-8 text-center`}
          >
            {labels.noArguments}
          </p>
        ) : (
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
            {argumentFields.map((field, index) => (
              <label
                key={`${field.label}-${index}`}
                className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3"
              >
                <span className="min-w-0 truncate font-medium">
                  {field.label}
                  {field.optional ? (
                    <span className={`${dialogParts.hint} ml-1`}>
                      {labels.optional}
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    ref={index === 0 ? firstArgumentRef : undefined}
                    value={argumentValues[index] ?? ""}
                    onChange={(event) =>
                      onArgumentChange(index, event.target.value)
                    }
                    onFocus={() => setFocusedArgument(index)}
                    onBlur={() => onArgumentBlur?.(index)}
                    placeholder={field.placeholder}
                    aria-label={field.label}
                    data-testid={`spreadsheet-function-args-input-${index}`}
                    className={`${dialogParts.mono} min-w-0 flex-1`}
                  />
                  {onCollapseArgument ? (
                    <SpreadsheetCollapseDialogButton
                      label={labels.collapse}
                      onClick={() => {
                        setFocusedArgument(index);
                        onCollapseArgument(index);
                      }}
                      testId={`spreadsheet-function-args-pick-${index}`}
                    />
                  ) : null}
                  {/* Excel shows what the argument evaluates to beside its
                      box: = 89, = "Li Na", = {"Wang Wei",1234.56;…}. */}
                  <span
                    data-testid={`spreadsheet-function-args-value-${index}`}
                    className={`${dialogParts.hint} min-w-16 max-w-40 shrink-0 truncate font-mono`}
                  >
                    {argumentStates[index]?.evaluated ?? ""}
                  </span>
                </span>
              </label>
            ))}
            {argumentFields.some((field) => field.repeating) ? (
              <button
                type="button"
                onClick={onAddArgument}
                data-testid="spreadsheet-function-args-add"
                className={`${dialogParts.compactButton} justify-self-start`}
              >
                <SpreadsheetDialogIcon name="add" />
                {labels.addArgument}
              </button>
            ) : null}
          </div>
        )}

        {/* The function's own description sits under the boxes, and the
            focused argument's under that. */}
        {argumentSummary ? (
          <p
            data-testid="spreadsheet-function-args-summary"
            className={dialogParts.hint}
          >
            {argumentSummary}
          </p>
        ) : null}
        {focusedField ? (
          <p
            data-testid="spreadsheet-function-args-arg-help"
            aria-live="polite"
            className={`${dialogParts.hint} min-h-8`}
          >
            <strong className="font-medium">
              {focusedField.label}
            </strong>
            {"  "}
            {focusedHelp ??
              (focusedField.optional ? labels.optionalWord : labels.required)}
          </p>
        ) : null}

        <div
          role={argumentError ? "alert" : "status"}
          aria-live={argumentError ? "assertive" : "polite"}
          aria-atomic="true"
          aria-invalid={argumentError ? "true" : undefined}
          data-state={argumentError ? "error" : "ready"}
          data-testid="spreadsheet-function-args-preview"
          className={`${dialogParts.well} px-3 py-2`}
        >
          <span>{labels.result} </span>
          <strong
            data-testid={
              argumentError ? "spreadsheet-function-args-error" : undefined
            }
            className={
              argumentError ? `${dialogParts.error} font-mono` : "font-mono"
            }
          >
            {/* The preview carries the error text once there is something to
                judge; while every field is still empty it stays null, so the
                row shows the placeholder instead of the error a function with
                required arguments necessarily has before it has them. OK stays
                disabled either way — that is `argumentError`'s job. */}
            {preview ?? "—"}
          </strong>
        </div>

        <FunctionHelpDisclosure
          label={labels.help}
          summary={argumentSummary}
          rows={helpRows}
          testIdPrefix="spreadsheet-function-args"
        />
      </OfficeDialogShell>
    </>
  );
}
