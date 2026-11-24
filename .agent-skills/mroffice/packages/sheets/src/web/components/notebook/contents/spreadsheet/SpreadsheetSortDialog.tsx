"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { SortFormatPlacement, SortOn } from "../../../../lib/spreadsheet/multi-sort";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

export type SpreadsheetSortOrientation = "rows" | "columns";
export type SpreadsheetSortFormatKind = Exclude<SortOn, "values">;
/** What a key line mostly holds, which names its Order choices as Excel does. */
export type SpreadsheetSortValueKind = "text" | "number" | "date";
/**
 * Sort Options ▸ Method (XLS-A065): Excel's "Letter sort" (the locale's own
 * order, pinyin for Chinese) or "Stroke sort" (Han characters by stroke
 * count, ICU's `zh-u-co-stroke` collation).
 */
export type SpreadsheetSortMethod = "letter" | "stroke";

const VALUE_ORDER_LABEL_KEYS: Record<
  SpreadsheetSortValueKind,
  { readonly asc: string; readonly desc: string }
> = {
  text: { asc: "spreadsheet.sortDialogAsc", desc: "spreadsheet.sortDialogDesc" },
  number: {
    asc: "spreadsheet.sortDialogSmallestToLargest",
    desc: "spreadsheet.sortDialogLargestToSmallest",
  },
  date: {
    asc: "spreadsheet.sortDialogOldestToNewest",
    desc: "spreadsheet.sortDialogNewestToOldest",
  },
};

/** The Order box's entry that opens Custom Lists rather than choosing one. */
const PICK_CUSTOM_LIST = "pick-custom-list";

// A custom list reads as its members in order, as in Excel's Order box; a
// long one is cut short.
function customListLabel(list: readonly string[]): string {
  const text = list.join(", ");
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

export interface SpreadsheetSortDialogLevel {
  readonly id: string;
  readonly column: number;
  readonly direction: "asc" | "desc";
  readonly sortOn?: SortOn;
  readonly customListIndex?: number;
  readonly formatKey?: string;
  readonly placement?: SortFormatPlacement;
}

export interface SpreadsheetSortDialogFormatOption {
  readonly kind: SpreadsheetSortFormatKind;
  readonly key: string;
  readonly label: string;
  readonly color?: string;
  readonly icon?: {
    readonly iconSet: string;
    readonly index: number;
    readonly count: 3 | 4 | 5;
  };
}

export interface SpreadsheetSortDialogLabels {
  readonly sortOn: string;
  readonly values: string;
  readonly cellColor: string;
  readonly fontColor: string;
  readonly icon: string;
  readonly formatTarget: string;
  readonly noFormat: string;
  readonly onTop: string;
  readonly onBottom: string;
  readonly onLeft: string;
  readonly onRight: string;
}

/** The Sort Options sub-dialog's three settings, applied together on its OK. */
export interface SpreadsheetSortOptions {
  readonly caseSensitive: boolean;
  readonly orientation: SpreadsheetSortOrientation;
  readonly method: SpreadsheetSortMethod;
}

interface SpreadsheetSortDialogProps {
  readonly open: boolean;
  readonly busy?: boolean;
  readonly levels: readonly SpreadsheetSortDialogLevel[];
  readonly hasHeader: boolean;
  readonly caseSensitive: boolean;
  readonly orientation: SpreadsheetSortOrientation;
  readonly method?: SpreadsheetSortMethod;
  readonly keyLines: readonly number[];
  readonly customLists: readonly (readonly string[])[];
  /** Per level: what its key line holds (text when absent). */
  readonly valueKinds?: readonly SpreadsheetSortValueKind[];
  readonly formatOptions: readonly (readonly SpreadsheetSortDialogFormatOption[])[];
  readonly labels: SpreadsheetSortDialogLabels;
  readonly status: {
    readonly kind: "success" | "error";
    readonly text: string;
  } | null;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly container?: HTMLElement | null;
  readonly lineLabel: (
    line: number,
    orientation: SpreadsheetSortOrientation,
  ) => string;
  readonly onSetHasHeader: (checked: boolean) => void;
  /** Sort Options' OK: only the settings that changed need to be applied. */
  readonly onApplyOptions: (options: SpreadsheetSortOptions) => void;
  readonly onSetLevelColumn: (index: number, encoded: string) => void;
  readonly onSetLevelSortOn: (index: number, encoded: string) => void;
  readonly onSetLevelOrder: (index: number, encoded: string) => void;
  readonly onSetLevelFormat: (index: number, encoded: string) => void;
  readonly onSetLevelPlacement: (index: number, encoded: string) => void;
  /** Add Level: a new level right below `afterIndex` (the selected one). */
  readonly onAddLevel: (afterIndex: number) => void;
  /** Copy Level: a copy of the level right below it. */
  readonly onCopyLevel: (index: number) => void;
  /** Move Up (-1) / Move Down (+1) the level at `index`. */
  readonly onMoveLevel: (index: number, delta: -1 | 1) => void;
  readonly onRemoveLevel: (index: number) => void;
  /**
   * The Custom Lists box's Add: a new list (two or more distinct members),
   * appended after the existing ones. False when it was refused.
   */
  readonly onAddCustomList?: (members: readonly string[]) => boolean;
  readonly onRun: () => void;
  readonly onCancel: () => void;
  readonly renderFormatIndicator?: (
    option: SpreadsheetSortDialogFormatOption,
  ) => ReactNode;
}

type SortDialogView =
  | { readonly kind: "levels" }
  | { readonly kind: "options"; readonly draft: SpreadsheetSortOptions }
  | {
      readonly kind: "customList";
      readonly levelIndex: number;
      readonly selected: number;
      readonly draft: string;
    };

/**
 * Data ▸ Sort, laid out as Excel's (XLS-A065): a level toolbar (Add Level,
 * Delete Level, Copy Level, Move Up, Move Down, Options…, My data has
 * headers), the Column / Sort On / Order header and one row per level. Case
 * sensitivity, orientation and the method live in the Sort Options box, and
 * Order ▸ Custom List… opens the Custom Lists box. Both boxes take the dialog
 * card while they are open and hand it back on OK or Cancel.
 */
export function SpreadsheetSortDialog({
  open,
  busy = false,
  levels,
  hasHeader,
  caseSensitive,
  orientation,
  method = "letter",
  keyLines,
  customLists,
  valueKinds = [],
  formatOptions,
  labels,
  status,
  returnFocusRef,
  container,
  lineLabel,
  onSetHasHeader,
  onApplyOptions,
  onSetLevelColumn,
  onSetLevelSortOn,
  onSetLevelOrder,
  onSetLevelFormat,
  onSetLevelPlacement,
  onAddLevel,
  onCopyLevel,
  onMoveLevel,
  onRemoveLevel,
  onAddCustomList,
  onRun,
  onCancel,
  renderFormatIndicator,
}: SpreadsheetSortDialogProps) {
  const t = useTranslations("console-notebooks");
  const firstLevelRef = useRef<HTMLSelectElement>(null);
  const [view, setView] = useState<SortDialogView>({ kind: "levels" });
  const [selectedLevel, setSelectedLevel] = useState(0);
  // Each opening starts on the levels with the first one selected, as Excel's.
  const [openedAs, setOpenedAs] = useState(open);
  if (openedAs !== open) {
    setOpenedAs(open);
    if (open) {
      setView({ kind: "levels" });
      setSelectedLevel(0);
    }
  }
  const selected = Math.min(Math.max(0, selectedLevel), Math.max(0, levels.length - 1));
  const hasValueLevel = levels.some(
    (level) => (level.sortOn ?? "values") === "values",
  );

  if (view.kind === "options") {
    const { draft } = view;
    const setDraft = (patch: Partial<SpreadsheetSortOptions>) =>
      setView({ kind: "options", draft: { ...draft, ...patch } });
    return (
      <OfficeDialogShell
        open={open}
        title={t("spreadsheet.sortDialogOptionsTitle")}
        description={null}
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("spreadsheet.goalSeekCancel")}
        defaultActionTestId="spreadsheet-sort-options-ok"
        cancelActionTestId="spreadsheet-sort-options-cancel"
        onDefaultAction={() => {
          onApplyOptions(draft);
          setView({ kind: "levels" });
          setSelectedLevel(0);
        }}
        onCancel={() => setView({ kind: "levels" })}
        returnFocusRef={returnFocusRef}
        container={container}
        className="sm:max-w-[360px]"
        testIdPrefix="spreadsheet-sort"
      >
        <label className={officeDialogParts.check}>
          <input
            type="checkbox"
            checked={draft.caseSensitive}
            disabled={!hasValueLevel}
            onChange={(event) =>
              setDraft({ caseSensitive: event.target.checked })
            }
            data-testid="spreadsheet-sort-case"
          />
          {t("spreadsheet.sortDialogCaseSensitive")}
        </label>
        <fieldset
          className={officeDialogParts.group}
          data-testid="spreadsheet-sort-orientation"
        >
          <legend className={officeDialogParts.sectionTitle}>
            {t("spreadsheet.sortDialogOrientation")}
          </legend>
          {(
            [
              ["rows", "spreadsheet.sortDialogTopToBottom"],
              ["columns", "spreadsheet.sortDialogLeftToRight"],
            ] as const
          ).map(([value, key]) => (
            <label key={value} className={officeDialogParts.check}>
              <input
                type="radio"
                name="spreadsheet-sort-orientation"
                checked={draft.orientation === value}
                onChange={() => setDraft({ orientation: value })}
                data-testid={`spreadsheet-sort-orientation-${value}`}
              />
              {t(key)}
            </label>
          ))}
        </fieldset>
        <fieldset
          className={officeDialogParts.group}
          data-testid="spreadsheet-sort-method"
        >
          <legend className={officeDialogParts.sectionTitle}>
            {t("spreadsheet.sortDialogMethod")}
          </legend>
          {(
            [
              ["letter", "spreadsheet.sortDialogLetterSort"],
              ["stroke", "spreadsheet.sortDialogStrokeSort"],
            ] as const
          ).map(([value, key]) => (
            <label key={value} className={officeDialogParts.check}>
              <input
                type="radio"
                name="spreadsheet-sort-method"
                checked={draft.method === value}
                onChange={() => setDraft({ method: value })}
                data-testid={`spreadsheet-sort-method-${value}`}
              />
              {t(key)}
            </label>
          ))}
        </fieldset>
      </OfficeDialogShell>
    );
  }

  if (view.kind === "customList") {
    const { levelIndex, selected: chosen, draft } = view;
    const draftMembers = draft
      .split(/[\n,]/)
      .map((member) => member.trim())
      .filter((member) => member !== "");
    const canAdd =
      onAddCustomList !== undefined &&
      new Set(draftMembers.map((member) => member.toLowerCase())).size >= 2;
    return (
      <OfficeDialogShell
        open={open}
        title={t("spreadsheet.customListsMenu")}
        description={null}
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("spreadsheet.goalSeekCancel")}
        defaultActionTestId="spreadsheet-sort-custom-list-ok"
        cancelActionTestId="spreadsheet-sort-custom-list-cancel"
        defaultActionDisabled={!customLists[chosen]}
        onDefaultAction={() => {
          onSetLevelOrder(levelIndex, `custom:${chosen}`);
          setView({ kind: "levels" });
        }}
        onCancel={() => setView({ kind: "levels" })}
        returnFocusRef={returnFocusRef}
        container={container}
        className="sm:max-w-[420px]"
        testIdPrefix="spreadsheet-sort"
      >
        <span className={officeDialogParts.label}>
          {t("spreadsheet.sortDialogCustomList")}
        </span>
        <div
          role="listbox"
          aria-label={t("spreadsheet.sortDialogCustomList")}
          className={`${officeDialogParts.list} max-h-56`}
          data-testid="spreadsheet-sort-custom-lists"
        >
          {customLists.map((list, listIndex) => (
            <button
              key={listIndex}
              type="button"
              role="option"
              aria-selected={listIndex === chosen}
              onClick={() =>
                setView({ ...view, selected: listIndex })
              }
              onDoubleClick={() => {
                onSetLevelOrder(levelIndex, `custom:${listIndex}`);
                setView({ kind: "levels" });
              }}
              data-testid={`spreadsheet-sort-custom-list-${listIndex}`}
              className={`${officeDialogParts.listItem} truncate`}
            >
              {customListLabel(list)}
            </button>
          ))}
        </div>
        {onAddCustomList ? (
          <>
            <textarea
              value={draft}
              onChange={(event) =>
                setView({ ...view, draft: event.target.value })
              }
              placeholder={t("spreadsheet.customListsPlaceholder")}
              aria-label={t("spreadsheet.customListsNewLabel")}
              data-testid="spreadsheet-sort-custom-list-draft"
              rows={3}
              style={{ resize: "vertical" }}
            />
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => {
                if (!canAdd || !onAddCustomList(draftMembers)) return;
                // The new list is appended after every existing one.
                setView({
                  kind: "customList",
                  levelIndex,
                  selected: customLists.length,
                  draft: "",
                });
              }}
              data-testid="spreadsheet-sort-custom-list-add"
              className={`${officeDialogParts.compactButton} self-start`}
            >
              <SpreadsheetDialogIcon name="add" />
              {t("spreadsheet.customListsAdd")}
            </button>
          </>
        ) : null}
      </OfficeDialogShell>
    );
  }

  const toolbarDisabled = busy || keyLines.length === 0;
  // Sorting left to right ("columns": the columns move) keys on rows: the
  // box and its heading say Row, as Excel's Sort dialog does (live audit S-157).
  const keyHeader = t(
    orientation === "columns" ? "spreadsheet.sortDialogRowHeader" : "spreadsheet.sortDialogColumnHeader",
  );
  return (
    <OfficeDialogShell
      open={open}
      title={t("spreadsheet.sortDialogMenu")}
      description={t("spreadsheet.sortDialogLevelsLabel")}
      defaultActionLabel={
        <span
          data-testid="spreadsheet-sort-run"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRun();
          }}
        >
          {t("spreadsheet.fmtOk")}
        </span>
      }
      cancelActionLabel={
        <span
          data-testid="spreadsheet-sort-cancel"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }}
        >
          {t("spreadsheet.goalSeekCancel")}
        </span>
      }
      onDefaultAction={onRun}
      onCancel={onCancel}
      defaultActionDisabled={
        levels.length === 0 ||
        keyLines.length === 0 ||
        levels.some((level, index) => {
          const sortOn = level.sortOn ?? "values";
          if (sortOn === "values") return false;
          return !formatOptions[index]?.some(
            (option) => option.kind === sortOn && option.key === level.formatKey,
          );
        })
      }
      busy={busy}
      busyActionLabel={t("common.loading")}
      initialFocusRef={firstLevelRef}
      returnFocusRef={returnFocusRef}
      container={container}
      className="sm:max-w-[900px]"
      testIdPrefix="spreadsheet-sort"
    >
      {/* Excel's level toolbar, then My data has headers at its far end. */}
      <div
        role="toolbar"
        aria-label={t("spreadsheet.sortDialogLevelsLabel")}
        className="flex flex-wrap items-center gap-1.5"
      >
        <button
          type="button"
          onClick={() => {
            onAddLevel(selected);
            setSelectedLevel(levels.length === 0 ? 0 : selected + 1);
          }}
          disabled={toolbarDisabled}
          data-testid="spreadsheet-sort-add-level"
          className={officeDialogParts.compactButton}
        >
          <SpreadsheetDialogIcon name="add" />
          {t("spreadsheet.sortDialogAddLevel")}
        </button>
        <button
          type="button"
          onClick={() => {
            onRemoveLevel(selected);
            setSelectedLevel(Math.max(0, Math.min(selected, levels.length - 2)));
          }}
          disabled={busy || levels.length <= 1}
          data-testid="spreadsheet-sort-delete-level"
          className={officeDialogParts.compactButton}
        >
          <SpreadsheetDialogIcon name="delete" />
          {t("spreadsheet.sortDialogRemoveLevel")}
        </button>
        <button
          type="button"
          onClick={() => {
            onCopyLevel(selected);
            setSelectedLevel(selected + 1);
          }}
          disabled={busy || levels.length === 0}
          data-testid="spreadsheet-sort-copy-level"
          className={officeDialogParts.compactButton}
        >
          <SpreadsheetDialogIcon name="copy" />
          {t("spreadsheet.sortDialogCopyLevel")}
        </button>
        <button
          type="button"
          onClick={() => {
            onMoveLevel(selected, -1);
            setSelectedLevel(selected - 1);
          }}
          disabled={busy || selected <= 0}
          title={t("spreadsheet.sortDialogMoveUp")}
          aria-label={t("spreadsheet.sortDialogMoveUp")}
          data-testid="spreadsheet-sort-move-up"
          className={officeDialogParts.compactButton}
        >
          <SpreadsheetDialogIcon name="moveUp" />
        </button>
        <button
          type="button"
          onClick={() => {
            onMoveLevel(selected, 1);
            setSelectedLevel(selected + 1);
          }}
          disabled={busy || selected >= levels.length - 1}
          title={t("spreadsheet.sortDialogMoveDown")}
          aria-label={t("spreadsheet.sortDialogMoveDown")}
          data-testid="spreadsheet-sort-move-down"
          className={officeDialogParts.compactButton}
        >
          <SpreadsheetDialogIcon name="moveDown" />
        </button>
        <button
          type="button"
          onClick={() =>
            setView({
              kind: "options",
              draft: { caseSensitive, orientation, method },
            })
          }
          disabled={busy}
          data-testid="spreadsheet-sort-options"
          className={officeDialogParts.compactButton}
        >
          <SpreadsheetDialogIcon name="options" />
          {t("spreadsheet.sortDialogOptions")}
        </button>
        <label className={`${officeDialogParts.check} ms-auto`}>
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(event) => onSetHasHeader(event.target.checked)}
            data-testid="spreadsheet-sort-header"
          />
          {t("spreadsheet.sortDialogHasHeader")}
        </label>
      </div>

      <div
        role="row"
        aria-hidden="true"
        className={`${officeDialogParts.label} grid grid-cols-[minmax(70px,auto)_minmax(108px,1fr)_minmax(108px,1fr)_minmax(210px,1.6fr)] gap-2 px-2`}
      >
        <span className="col-span-2">{keyHeader}</span>
        <span>{labels.sortOn}</span>
        <span>{t("spreadsheet.sortDialogOrder")}</span>
      </div>
      <div
        role="listbox"
        aria-label={t("spreadsheet.sortDialogLevelsLabel")}
        className={`${officeDialogParts.list} max-h-[300px]`}
      >
        {levels.map((level, index) => {
          const sortOn = level.sortOn ?? "values";
          const levelOptions = formatOptions[index] ?? [];
          const activeOptions =
            sortOn === "values"
              ? []
              : levelOptions.filter((option) => option.kind === sortOn);
          const selectedFormat = activeOptions.find(
            (option) => option.key === level.formatKey,
          );
          const firstPlacement =
            orientation === "columns" ? labels.onLeft : labels.onTop;
          const lastPlacement =
            orientation === "columns" ? labels.onRight : labels.onBottom;
          const customList =
            level.customListIndex !== undefined
              ? customLists[level.customListIndex]
              : undefined;
          return (
            <div
              key={level.id}
              role="option"
              aria-selected={index === selected}
              // A level is selected by pointing anywhere on its row, its
              // boxes included, so the toolbar acts on the row being edited.
              onPointerDownCapture={() => setSelectedLevel(index)}
              onFocusCapture={() => setSelectedLevel(index)}
              data-testid={`spreadsheet-sort-level-${index}`}
              data-selected={index === selected ? "true" : undefined}
              className={`${officeDialogParts.listItem} grid grid-cols-[minmax(70px,auto)_minmax(108px,1fr)_minmax(108px,1fr)_minmax(210px,1.6fr)] items-center gap-2`}
            >
              <span className={officeDialogParts.label}>
                {index === 0
                  ? t("spreadsheet.sortDialogSortBy")
                  : t("spreadsheet.sortDialogThenBy")}
              </span>
              <select
                ref={index === 0 ? firstLevelRef : undefined}
                value={level.column}
                onChange={(event) =>
                  onSetLevelColumn(index, event.target.value)
                }
                data-testid={`spreadsheet-sort-level-${index}-column`}
                title={keyHeader}
                aria-label={keyHeader}
                className="min-w-0"
              >
                {keyLines.map((line) => (
                  <option key={line} value={line}>
                    {lineLabel(line, orientation)}
                  </option>
                ))}
              </select>
              <select
                value={sortOn}
                onChange={(event) =>
                  onSetLevelSortOn(index, event.target.value)
                }
                data-testid={`spreadsheet-sort-level-${index}-sort-on`}
                title={labels.sortOn}
                aria-label={labels.sortOn}
                className="min-w-0"
              >
                <option value="values">{labels.values}</option>
                <option
                  value="cellColor"
                  disabled={!levelOptions.some((item) => item.kind === "cellColor")}
                >
                  {labels.cellColor}
                </option>
                <option
                  value="fontColor"
                  disabled={!levelOptions.some((item) => item.kind === "fontColor")}
                >
                  {labels.fontColor}
                </option>
                <option
                  value="icon"
                  disabled={!levelOptions.some((item) => item.kind === "icon")}
                >
                  {labels.icon}
                </option>
              </select>
              {sortOn === "values" ? (
                <select
                  value={
                    level.customListIndex !== undefined
                      ? `custom:${level.customListIndex}${
                          level.direction === "desc" ? ":desc" : ""
                        }`
                      : level.direction
                  }
                  onChange={(event) => {
                    if (event.target.value === PICK_CUSTOM_LIST) {
                      // Excel's Order ▸ Custom List… opens the Custom Lists
                      // box on the level's own list (or the first one).
                      setSelectedLevel(index);
                      setView({
                        kind: "customList",
                        levelIndex: index,
                        selected: customList ? level.customListIndex ?? 0 : 0,
                        draft: "",
                      });
                      return;
                    }
                    onSetLevelOrder(index, event.target.value);
                  }}
                  data-testid={`spreadsheet-sort-level-${index}-direction`}
                  title={t("spreadsheet.sortDialogOrder")}
                  aria-label={t("spreadsheet.sortDialogOrder")}
                  className="min-w-0"
                >
                  <option value="asc">
                    {t(VALUE_ORDER_LABEL_KEYS[valueKinds[index] ?? "text"].asc)}
                  </option>
                  <option value="desc">
                    {t(VALUE_ORDER_LABEL_KEYS[valueKinds[index] ?? "text"].desc)}
                  </option>
                  {customList ? (
                    // The chosen list and its reverse, as Excel's Order box
                    // offers them once a custom list is picked.
                    <>
                      <option value={`custom:${level.customListIndex}`}>
                        {customListLabel(customList)}
                      </option>
                      <option value={`custom:${level.customListIndex}:desc`}>
                        {customListLabel([...customList].reverse())}
                      </option>
                    </>
                  ) : null}
                  {customLists.length > 0 || onAddCustomList ? (
                    <option value={PICK_CUSTOM_LIST}>
                      {t("spreadsheet.sortDialogCustomListPick")}
                    </option>
                  ) : null}
                </select>
              ) : (
                <span className="grid min-w-0 grid-cols-[minmax(112px,1fr)_minmax(82px,auto)] items-center gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {selectedFormat?.color ||
                    (selectedFormat?.icon && renderFormatIndicator) ? (
                      <span
                        aria-hidden="true"
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-input"
                        style={
                          selectedFormat.color
                            ? { backgroundColor: selectedFormat.color }
                            : undefined
                        }
                      >
                        {selectedFormat.icon && renderFormatIndicator
                          ? renderFormatIndicator(selectedFormat)
                          : null}
                      </span>
                    ) : null}
                    <select
                      value={level.formatKey ?? ""}
                      onChange={(event) =>
                        onSetLevelFormat(index, event.target.value)
                      }
                      disabled={activeOptions.length === 0}
                      data-testid={`spreadsheet-sort-level-${index}-format`}
                      title={labels.formatTarget}
                      aria-label={labels.formatTarget}
                      className="min-w-0 flex-1"
                    >
                      {activeOptions.length === 0 ? (
                        <option value="">{labels.noFormat}</option>
                      ) : null}
                      {activeOptions.map((option) => (
                        <option key={`${option.kind}:${option.key}`} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </span>
                  <select
                    value={level.placement ?? "first"}
                    onChange={(event) =>
                      onSetLevelPlacement(index, event.target.value)
                    }
                    data-testid={`spreadsheet-sort-level-${index}-placement`}
                    title={t("spreadsheet.sortDialogOrder")}
                    aria-label={t("spreadsheet.sortDialogOrder")}
                    className="min-w-0"
                  >
                    <option value="first">{firstPlacement}</option>
                    <option value="last">{lastPlacement}</option>
                  </select>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {status ? (
        <div
          role={status.kind === "error" ? "alert" : "status"}
          data-testid="spreadsheet-sort-status"
          data-status={status.kind}
          className={officeDialogParts.message}
          data-tone={status.kind === "error" ? "error" : "success"}
        >
          {status.text}
        </div>
      ) : null}
    </OfficeDialogShell>
  );
}
