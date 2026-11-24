"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  officeDialogParts as dialogParts,
  spreadsheetDialogClassName,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { isSpreadsheetImeKeydown } from "../../../../lib/spreadsheet/ime-composition";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  sortFindAllRows,
  type FindAllRow,
  type FindAllSortColumn,
  type FindCellFormat,
  type FindLookIn,
  type FindSearchOrder,
} from "../../../../lib/spreadsheet/find-replace";

import styles from "./SpreadsheetFindReplaceDialog.module.css";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

export type SpreadsheetFindTab = "find" | "replace";
export type SpreadsheetFindWithin = "selection" | "sheet" | "workbook";

/** A command's live authority, as the window resolves it for this render. */
export interface SpreadsheetFindCommandView {
  readonly enabled: boolean;
  readonly reason: string | undefined;
}

const CONTROL = {
  findAll: "XLSCTL.HOME.FIND_REPLACE.FIND_ALL",
  findNext: "XLSCTL.HOME.FIND_REPLACE.FIND_NEXT",
  findPrevious: "XLSCTL.HOME.FIND_REPLACE.FIND_PREVIOUS",
  replace: "XLSCTL.HOME.FIND_REPLACE.REPLACE",
  replaceAll: "XLSCTL.HOME.FIND_REPLACE.REPLACE_ALL",
  dismiss: "XLSCTL.HOME.FIND_REPLACE.MRAI.DISMISS",
} as const;

const RESULT_COLUMNS: readonly FindAllSortColumn[] = [
  "book",
  "sheet",
  "name",
  "cell",
  "value",
  "formula",
];

export interface SpreadsheetFindReplaceDialogProps {
  readonly tab: SpreadsheetFindTab;
  readonly onTabChange: (tab: SpreadsheetFindTab) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly replacement: string;
  readonly onReplacementChange: (replacement: string) => void;
  readonly optionsOpen: boolean;
  readonly onOptionsOpenChange: (open: boolean) => void;
  readonly within: SpreadsheetFindWithin;
  /** The captured multi-cell selection ("B2:D9"), or null when there is none. */
  readonly selectionLabel: string | null;
  readonly onWithinChange: (within: SpreadsheetFindWithin) => void;
  readonly searchOrder: FindSearchOrder;
  readonly onSearchOrderChange: (order: FindSearchOrder) => void;
  /** Look in as chosen on the Find tab; the Replace tab always shows Formulas. */
  readonly lookIn: FindLookIn;
  readonly onLookInChange: (lookIn: FindLookIn) => void;
  readonly caseSensitive: boolean;
  readonly onCaseSensitiveChange: (value: boolean) => void;
  readonly wholeCell: boolean;
  readonly onWholeCellChange: (value: boolean) => void;
  readonly matchByte: boolean;
  readonly onMatchByteChange: (value: boolean) => void;
  readonly matchTotal: number;
  /** Replacements the last Replace All made for this query, or null. */
  readonly replacedCount: number | null;
  /** The last Find All list, or null before one runs. */
  readonly results: readonly FindAllRow[] | null;
  readonly bookName: string;
  readonly activeResultId: string | null;
  readonly onResultSelect: (row: FindAllRow) => void;
  readonly command: (controlId: string) => SpreadsheetFindCommandView;
  readonly execute: (controlId: string) => void;
  readonly findInputRef: RefObject<HTMLInputElement | null>;
  readonly replaceInputRef: RefObject<HTMLInputElement | null>;
  /**
   * Excel's "Format…" beside Find what and Replace with (XLS-A103): the
   * format a hit must have / a replaced cell takes, or null for none. Absent
   * handlers: no Format controls.
   */
  readonly findFormat?: FindCellFormat | null;
  readonly replaceFormat?: FindCellFormat | null;
  /** Choose Format From Cell…: the next clicked cell's format becomes the target's. */
  readonly onChooseFormatFromCell?: (target: "find" | "replace") => void;
  /** Format…: the Find Format / Replace Format dialog (XLS-A103). */
  readonly onOpenFormatDialog?: (target: "find" | "replace") => void;
  /** Clear Find Format / Clear Replace Format. */
  readonly onClearFormat?: (target: "find" | "replace") => void;
}

/** Excel's format preview box: the format's look on a sample, or "No Format Set". */
function FindFormatPreview({
  format,
  emptyLabel,
  previewLabel,
  testId,
}: {
  format: FindCellFormat | null | undefined;
  emptyLabel: string;
  previewLabel: string;
  testId: string;
}) {
  const style = (format ?? {}) as Record<string, unknown>;
  const text = (key: string) =>
    typeof style[key] === "string" ? (style[key] as string) : undefined;
  return (
    <span
      data-testid={testId}
      data-format-set={format ? "true" : "false"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 96,
        height: 24,
        padding: "0 8px",
        border: "1px solid var(--office-dialog-control-border)",
        borderRadius: 4,
        fontSize: 12,
        whiteSpace: "nowrap",
        ...(format
          ? {
              background: text("backgroundColor"),
              color: text("color"),
              fontWeight: style.bold === true ? 700 : undefined,
              fontStyle: style.italic === true ? "italic" : undefined,
              textDecoration:
                [
                  style.underline === true ? "underline" : "",
                  style.strike === true || style.strikethrough === true
                    ? "line-through"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined,
              fontFamily: text("fontFamily"),
            }
          : { color: "var(--office-dialog-muted)" }),
      }}
    >
      {format ? previewLabel : emptyLabel}
    </span>
  );
}

/**
 * Excel's Find and Replace dialog (Microsoft Support, "Find or replace text and
 * numbers on a worksheet"): a Find tab and a Replace tab sharing "Find what",
 * an "Options >>" panel (Within, Search, Look in, Match case, Match entire cell
 * contents, and the East Asian Match byte), the desktop button row, and the
 * Find All list under it. Excel desktop has no Find Previous button: Shift+Enter
 * or Shift+click on Find Next searches backwards. Every action runs through the
 * window's visible-command authority, so protection and read-only gates apply
 * exactly as they do to the ribbon.
 */
export function SpreadsheetFindReplaceDialog(
  props: SpreadsheetFindReplaceDialogProps,
) {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const {
    tab,
    optionsOpen,
    command,
    execute,
    results,
    findInputRef,
    replaceInputRef,
  } = props;
  const fieldId = useId();
  // A heading's sort belongs to the list it was chosen on: a new Find All is
  // listed in search order again.
  const [sortState, setSort] = useState<{
    results: readonly FindAllRow[] | null;
    column: FindAllSortColumn;
    descending: boolean;
  } | null>(null);
  const sort = sortState?.results === results ? sortState : null;
  const lookInRef = useRef<HTMLSelectElement>(null);
  const searchOrderRef = useRef<HTMLSelectElement>(null);
  const withinRef = useRef<HTMLSelectElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const sortedResults = useMemo(() => {
    if (!results) return null;
    if (!sort) return results;
    return sortFindAllRows(
      results,
      sort.column,
      sort.descending,
      new Intl.Collator(locale, { numeric: true, sensitivity: "base" }),
    );
  }, [locale, results, sort]);

  // Escape closes the dialog from wherever the focus has ended up. The dialog
  // handles its own keys, but a focus that has fallen to the body (a pressed
  // button that became disabled, a click on the dimmed backdrop) reaches no
  // handler at all, and the dialog could then only be closed with the mouse.
  // A composing Escape cancels the IME candidate and is left to it.
  const executeRef = useRef(execute);
  useEffect(() => {
    executeRef.current = execute;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        isSpreadsheetImeKeydown(event) ||
        (document.activeElement !== null &&
          document.activeElement !== document.body)
      ) {
        return;
      }
      event.preventDefault();
      executeRef.current(CONTROL.dismiss);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const replaceTab = tab === "replace";
  const effectiveLookIn: FindLookIn = replaceTab ? "formulas" : props.lookIn;
  // Excel shows its Format… controls with the options (XLS-A103): a preview
  // box and a Format ▾ menu beside Find what (and Replace with).
  const formatControls = optionsOpen && props.onChooseFormatFromCell !== undefined;
  const formatControl = (target: "find" | "replace") => {
    const format = target === "find" ? props.findFormat : props.replaceFormat;
    return (
      <>
        <FindFormatPreview
          format={format}
          emptyLabel={t("spreadsheet.findDialog.noFormatSet")}
          previewLabel={t("spreadsheet.findDialog.formatPreview")}
          testId={`spreadsheet-${target}-format-preview`}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={dialogParts.button}
              data-testid={`spreadsheet-${target}-format-menu`}
            >
              {t("spreadsheet.findDialog.format")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="docs-cupertino-menu w-max"
            style={{ zIndex: 10001 }}
          >
            {props.onOpenFormatDialog ? (
              <DropdownMenuItem
                data-testid={`spreadsheet-${target}-format-dialog`}
                onSelect={() => props.onOpenFormatDialog?.(target)}
              >
                {t("spreadsheet.findDialog.formatDialog")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              data-testid={`spreadsheet-${target}-format-from-cell`}
              onSelect={() => props.onChooseFormatFromCell?.(target)}
            >
              {t("spreadsheet.findDialog.chooseFormatFromCell")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`spreadsheet-${target}-format-clear`}
              disabled={!format}
              onSelect={() => props.onClearFormat?.(target)}
            >
              {target === "find"
                ? t("spreadsheet.findDialog.clearFindFormat")
                : t("spreadsheet.findDialog.clearReplaceFormat")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  };

  const statusText = props.query
    ? props.matchTotal === 0 && props.replacedCount !== null
      ? t("spreadsheet.findReplacedCount", { count: props.replacedCount })
      : t("spreadsheet.findMatchCount", { count: props.matchTotal })
    : t("spreadsheet.findEnterQuery");

  const focusRow = (id: string) =>
    rowRefs.current.get(id)?.focus({ preventScroll: false });

  // Excel's access keys (the underlined letters; zh-CN writes them as "(D)").
  // Physical key codes, so a macOS Option layer or an IME cannot remap them.
  const accessKey = (code: string): boolean => {
    switch (code) {
      case "KeyD":
        props.onTabChange("find");
        return true;
      case "KeyP":
        props.onTabChange("replace");
        return true;
      case "KeyN":
        findInputRef.current?.focus();
        findInputRef.current?.select();
        return true;
      case "KeyE":
        if (!replaceTab) return false;
        replaceInputRef.current?.focus();
        replaceInputRef.current?.select();
        return true;
      case "KeyT":
        props.onOptionsOpenChange(!optionsOpen);
        return true;
      case "KeyH":
        withinRef.current?.focus();
        return optionsOpen;
      case "KeyS":
        searchOrderRef.current?.focus();
        return optionsOpen;
      case "KeyL":
        lookInRef.current?.focus();
        return optionsOpen;
      case "KeyC":
        if (!optionsOpen) return false;
        props.onCaseSensitiveChange(!props.caseSensitive);
        return true;
      case "KeyO":
        if (!optionsOpen) return false;
        props.onWholeCellChange(!props.wholeCell);
        return true;
      case "KeyB":
        if (!optionsOpen) return false;
        props.onMatchByteChange(!props.matchByte);
        return true;
      case "KeyA":
        if (!replaceTab) return false;
        execute(CONTROL.replaceAll);
        return true;
      case "KeyR":
        if (!replaceTab) return false;
        execute(CONTROL.replace);
        return true;
      case "KeyI":
        execute(CONTROL.findAll);
        return true;
      case "KeyF":
        execute(CONTROL.findNext);
        return true;
      default:
        return false;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || isSpreadsheetImeKeydown(event.nativeEvent)) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      execute(CONTROL.dismiss);
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (accessKey(event.code)) event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      const target = event.target as HTMLElement;
      // A button, list, tab or result row keeps Enter's own meaning; from the
      // text boxes and check boxes Enter is Find Next, Shift+Enter backwards.
      if (target.closest("button, select, [role='tab'], tr") !== null) {
        return;
      }
      event.preventDefault();
      execute(event.shiftKey ? CONTROL.findPrevious : CONTROL.findNext);
      return;
    }
    if (event.key === "Tab") {
      const focusable = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((candidate) => candidate.isConnected);
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const backward = event.shiftKey && index <= 0;
      const forward =
        !event.shiftKey && (index < 0 || index === focusable.length - 1);
      if (!backward && !forward) return;
      event.preventDefault();
      focusable[backward ? focusable.length - 1 : 0]?.focus({
        preventScroll: true,
      });
    }
  };

  const actionButton = (
    controlId: string,
    testId: string,
    label: string,
    accessKeyLetter: string,
    onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void,
    title?: string,
  ) => {
    const state = command(controlId);
    return (
      <button
        type="button"
        onClick={onClick ?? (() => execute(controlId))}
        disabled={!state.enabled}
        title={state.reason ?? title}
        aria-keyshortcuts={`Alt+${accessKeyLetter}`}
        data-control-id={controlId}
        data-testid={testId}
        // Find Next is the dialog's default button, as in Excel.
        className={
          controlId === CONTROL.findNext
            ? dialogParts.primaryButton
            : dialogParts.button
        }
      >
        {label}
      </button>
    );
  };

  const onResultKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    index: number,
  ) => {
    if (!sortedResults) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onResultSelect(sortedResults[index]);
      return;
    }
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = sortedResults[index + step];
    if (next) focusRow(next.id);
  };

  // One row is in the Tab order: the chosen one, else the first.
  const rovingResultId =
    sortedResults?.find((row) => row.id === props.activeResultId)?.id ??
    sortedResults?.[0]?.id ??
    null;

  const columnLabel = (column: FindAllSortColumn) =>
    t(`spreadsheet.findDialog.results.${column}`);

  return (
    <div
      className={`${spreadsheetDialogClassName()} ${styles.dialog}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("spreadsheet.findReplace")}
      data-control-id="XLSCTL.HOME.FIND_REPLACE.DIALOG"
      data-testid="spreadsheet-find-replace"
      data-find-tab={tab}
      onKeyDown={onKeyDown}
    >
      <div className={dialogParts.header}>
        <strong className={dialogParts.title}>{t("spreadsheet.findReplace")}</strong>
        <button
          type="button"
          className={dialogParts.close}
          onClick={() => execute(CONTROL.dismiss)}
          aria-label={t("common.close")}
          data-control-id={CONTROL.dismiss}
          data-testid="spreadsheet-find-replace-close"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div
        className={dialogParts.tabs}
        role="tablist"
        aria-label={t("spreadsheet.findReplace")}
      >
        {(["find", "replace"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={dialogParts.tab}
            aria-selected={tab === id}
            aria-keyshortcuts={id === "find" ? "Alt+D" : "Alt+P"}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => props.onTabChange(id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              props.onTabChange(id === "find" ? "replace" : "find");
            }}
            data-testid={`spreadsheet-find-tab-${id}`}
          >
            {t(
              id === "find"
                ? "spreadsheet.findDialog.tabFind"
                : "spreadsheet.findDialog.tabReplace",
            )}
          </button>
        ))}
      </div>
      <div
        className={styles.fields}
        role="tabpanel"
        style={
          formatControls
            ? {
                gridTemplateColumns:
                  "max-content minmax(0, 1fr) max-content max-content",
              }
            : undefined
        }
      >
        <label htmlFor={`${fieldId}-find`}>
          {t("spreadsheet.findDialog.findWhat")}
        </label>
        <input
          id={`${fieldId}-find`}
          ref={findInputRef}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          aria-label={t("spreadsheet.findPlaceholder")}
          aria-keyshortcuts="Alt+N"
          data-testid="spreadsheet-find-input"
        />
        {formatControls ? formatControl("find") : null}
        {replaceTab ? (
          <>
            <label htmlFor={`${fieldId}-replace`}>
              {t("spreadsheet.findDialog.replaceWith")}
            </label>
            <input
              id={`${fieldId}-replace`}
              ref={replaceInputRef}
              value={props.replacement}
              onChange={(event) => props.onReplacementChange(event.target.value)}
              aria-label={t("spreadsheet.replacePlaceholder")}
              aria-keyshortcuts="Alt+E"
              data-testid="spreadsheet-replace-input"
            />
            {formatControls ? formatControl("replace") : null}
          </>
        ) : null}
      </div>
      {optionsOpen ? (
        <div className={styles.options} data-testid="spreadsheet-find-options">
          <label htmlFor={`${fieldId}-within`}>
            {t("spreadsheet.findDialog.within")}
          </label>
          <select
            id={`${fieldId}-within`}
            ref={withinRef}
            value={props.within}
            onChange={(event) =>
              props.onWithinChange(
                event.target.value === "workbook"
                  ? "workbook"
                  : event.target.value === "selection"
                    ? "selection"
                    : "sheet",
              )
            }
            aria-keyshortcuts="Alt+H"
            data-testid="spreadsheet-find-scope"
          >
            {props.selectionLabel !== null ? (
              <option value="selection">
                {t("spreadsheet.findDialog.withinSelection", {
                  range: props.selectionLabel,
                })}
              </option>
            ) : null}
            <option value="sheet">{t("spreadsheet.findScopeSheet")}</option>
            <option value="workbook">
              {t("spreadsheet.findScopeWorkbook")}
            </option>
          </select>
          <div className={styles.checks}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={props.caseSensitive}
                onChange={(event) =>
                  props.onCaseSensitiveChange(event.target.checked)
                }
                aria-keyshortcuts="Alt+C"
                data-testid="spreadsheet-find-case-sensitive"
              />
              {t("spreadsheet.findDialog.matchCase")}
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={props.wholeCell}
                onChange={(event) =>
                  props.onWholeCellChange(event.target.checked)
                }
                aria-keyshortcuts="Alt+O"
                data-testid="spreadsheet-find-whole-cell"
              />
              {t("spreadsheet.findDialog.matchEntireCell")}
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={props.matchByte}
                onChange={(event) =>
                  props.onMatchByteChange(event.target.checked)
                }
                aria-keyshortcuts="Alt+B"
                data-testid="spreadsheet-find-match-byte"
              />
              {t("spreadsheet.findDialog.matchByte")}
            </label>
          </div>
          <label htmlFor={`${fieldId}-search`}>
            {t("spreadsheet.findDialog.search")}
          </label>
          <select
            id={`${fieldId}-search`}
            ref={searchOrderRef}
            value={props.searchOrder}
            onChange={(event) =>
              props.onSearchOrderChange(
                event.target.value === "columns" ? "columns" : "rows",
              )
            }
            aria-keyshortcuts="Alt+S"
            data-testid="spreadsheet-find-search-order"
          >
            <option value="rows">{t("spreadsheet.findDialog.byRows")}</option>
            <option value="columns">
              {t("spreadsheet.findDialog.byColumns")}
            </option>
          </select>
          <label htmlFor={`${fieldId}-look-in`}>
            {t("spreadsheet.findDialog.lookIn")}
          </label>
          <select
            id={`${fieldId}-look-in`}
            ref={lookInRef}
            value={effectiveLookIn}
            onChange={(event) => {
              const value = event.target.value;
              props.onLookInChange(
                value === "values" ||
                  value === "notes" ||
                  value === "comments"
                  ? value
                  : "formulas",
              );
            }}
            aria-keyshortcuts="Alt+L"
            data-testid="spreadsheet-find-look-in"
          >
            <option value="formulas">
              {t("spreadsheet.findDialog.lookInFormulas")}
            </option>
            {replaceTab ? null : (
              <>
                <option value="values">
                  {t("spreadsheet.findDialog.lookInValues")}
                </option>
                <option value="notes">
                  {t("spreadsheet.findDialog.lookInNotes")}
                </option>
                <option value="comments">
                  {t("spreadsheet.findDialog.lookInComments")}
                </option>
              </>
            )}
          </select>
        </div>
      ) : null}
      <div className={styles.optionsToggleRow}>
        <button
          type="button"
          aria-expanded={optionsOpen}
          aria-keyshortcuts="Alt+T"
          onClick={() => props.onOptionsOpenChange(!optionsOpen)}
          data-testid="spreadsheet-find-options-toggle"
          className={dialogParts.button}
        >
          <SpreadsheetDialogIcon name="findOptions" />
          {t(
            optionsOpen
              ? "spreadsheet.findDialog.optionsLess"
              : "spreadsheet.findDialog.optionsMore",
          )}
        </button>
      </div>
      <div
        className={styles.status}
        role="status"
        aria-live="polite"
        data-testid="spreadsheet-find-count"
        data-match-count={props.matchTotal}
        data-replaced-count={props.replacedCount ?? undefined}
      >
        {statusText}
      </div>
      <div className={dialogParts.footer}>
        {replaceTab ? (
          <>
            {actionButton(
              CONTROL.replaceAll,
              "spreadsheet-replace-all",
              t("spreadsheet.findDialog.replaceAll"),
              "A",
            )}
            {actionButton(
              CONTROL.replace,
              "spreadsheet-replace",
              t("spreadsheet.findDialog.replace"),
              "R",
            )}
          </>
        ) : null}
        {actionButton(
          CONTROL.findAll,
          "spreadsheet-find-all",
          t("spreadsheet.findDialog.findAll"),
          "I",
        )}
        {actionButton(
          CONTROL.findNext,
          "spreadsheet-find-next",
          t("spreadsheet.findDialog.findNext"),
          "F",
          (event) =>
            execute(event.shiftKey ? CONTROL.findPrevious : CONTROL.findNext),
          t("spreadsheet.findDialog.findNextHint"),
        )}
        <button
          type="button"
          onClick={() => execute(CONTROL.dismiss)}
          data-control-id={CONTROL.dismiss}
          data-testid="spreadsheet-find-replace-dismiss"
          className={dialogParts.button}
        >
          {t("spreadsheet.findDialog.close")}
        </button>
      </div>
      {sortedResults ? (
        <>
          <div className={styles.results}>
            <table
              role="grid"
              aria-readonly="true"
              aria-label={t("spreadsheet.findDialog.results.label")}
              data-testid="spreadsheet-find-all-results"
            >
              <thead>
                <tr>
                  {RESULT_COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      aria-sort={
                        sort?.column === column
                          ? sort.descending
                            ? "descending"
                            : "ascending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() =>
                          setSort({
                            results,
                            column,
                            descending:
                              sort?.column === column ? !sort.descending : false,
                          })
                        }
                        data-testid={`spreadsheet-find-all-sort-${column}`}
                      >
                        {columnLabel(column)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row, index) => {
                  const selected = row.id === props.activeResultId;
                  return (
                    <tr
                      key={row.id}
                      ref={(node) => {
                        if (node) rowRefs.current.set(row.id, node);
                        else rowRefs.current.delete(row.id);
                      }}
                      className={styles.resultRow}
                      aria-selected={selected}
                      tabIndex={row.id === rovingResultId ? 0 : -1}
                      onClick={() => props.onResultSelect(row)}
                      onKeyDown={(event) => onResultKeyDown(event, index)}
                      data-testid={`spreadsheet-find-all-row-${index}`}
                      data-find-result={row.id}
                    >
                      <td title={props.bookName}>{props.bookName}</td>
                      <td title={row.sheetName}>{row.sheetName}</td>
                      <td title={row.name}>{row.name}</td>
                      <td>{row.cell}</td>
                      <td title={row.value}>{row.value}</td>
                      <td title={row.formula}>{row.formula}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className={styles.resultsCount}
            data-testid="spreadsheet-find-all-count"
            data-result-count={sortedResults.length}
          >
            {t("spreadsheet.findDialog.results.count", {
              count: sortedResults.length,
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
