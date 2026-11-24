"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ConditionalIconGlyph } from "./ConditionalIconGlyph";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { SpreadsheetDataIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDataRibbonIcons.tsx";
import { SpreadsheetCustomAutoFilterDialog, SpreadsheetFilterCommands, SpreadsheetTop10AutoFilterDialog } from "./SpreadsheetFilterCommands";
import { type DataTableColumnFilter, type DataTableIconFilter, type DataTableRelativeDateFilter, type DataTableRelativeDatePeriod } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type ConditionFilter } from "@mrnote/core/web/lib/spreadsheet/filter-conditions.ts";
import { buildDateFilterTree, isDateColumn, nodeTriState, toggleNode, type FilterDateAuthority } from "@mrnote/core/web/lib/spreadsheet/date-filter-tree.ts";
import { usePopupPortalTarget } from "@mrnote/core/web/components/ui/portal-host.tsx";
import { iconSetCount } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { iconSetDisplayName } from "./iconSetLabel";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/**
 * A tri-state checkbox for the AutoFilter date tree: "checked"/"unchecked" map
 * to the native boolean, "indeterminate" sets the DOM `indeterminate` flag (only
 * settable imperatively) so a partially-selected Year/Month shows the dash. The
 * onChange callback fires on any user toggle; the parent decides fill-vs-clear.
 */
function TriStateCheckbox({
  state,
  onChange,
  testId,
  dataValue,
  controlId,
  label,
}: {
  state: "checked" | "unchecked" | "indeterminate";
  onChange: () => void;
  testId: string;
  dataValue: string;
  controlId?: string;
  /** Its name, when no <label> wraps it (a date tree's year and month). */
  label?: string;
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "checked"}
      onChange={onChange}
      data-testid={testId}
      data-value={dataValue}
      data-tristate={state}
      data-control-id={controlId}
      aria-label={label}
      style={{ flex: "0 0 auto" }}
    />
  );
}

/**
 * AutoFilter dropdown for one column header (Excel/WPS parity). Shows every
 * distinct display value with a checkbox, a "select all" toggle, and a live
 * search box. The dropdown keeps its own draft selection so the user can tick
 * several values before applying; "Apply" commits the chosen value set (or null
 * to mean "all visible / no filter"). Initial check state reflects the column's
 * persisted filter — when no filter is set every value starts checked.
 */
interface FilterMenuCommitOptions {
  readonly keepOpen?: boolean;
}

export function FilterMenu({
  col,
  columnHeader,
  columnValueKind,
  options,
  selected,
  colorOptions,
  colorSelected,
  fontColorOptions = [],
  colorCriterion = null,
  iconOptions = [],
  iconCriterion = null,
  iconLabel,
  relativeDateCriterion = null,
  dateAuthority,
  conditionSelected,
  sortBlockedReason = null,
  onSortAscending,
  onSortDescending,
  onSortColor,
  onSortFontColor,
  onSortIcon,
  sortColorOptions = [],
  sortFontColorOptions = [],
  sortIconOptions = [],
  sortIconLabel,
  onApply,
  onApplyColor,
  onApplyIcon,
  onApplyRelativeDate,
  onApplyCondition,
  onClear,
  onClose,
  allowSort = true,
  allowColor = true,
  singleColorCriterion = false,
  requireValueSelection = false,
  anchorId,
  menuTestId,
  locale,
  optionLabels,
  date1904 = false,
  t,
}: {
  col: number;
  /**
   * The column's header text. Excel names the column inside the dropdown's
   * "Clear Filter From ..." item, so the menu has to be told what it is.
   */
  columnHeader: string;
  /**
   * What the column's DATA CELLS mostly are, counted by the host over the
   * sort keys and number formats. Excel picks the typed filter menu and the
   * sort wording from that, and a column's display text alone would read
   * a currency or a percentage as words.
   */
  columnValueKind: "text" | "number" | "date";
  options: string[];
  /** Currently allowed values, or null when the column has no filter (all on). */
  selected: Set<string> | null;
  /** Distinct NORMALIZED fill colors in the column ("" = no-fill bucket). */
  colorOptions: string[];
  /** Currently allowed colors, or null when the column has no color filter. */
  colorSelected: Set<string> | null;
  /** Distinct strict font colours, used by native table colorFilter only. */
  fontColorOptions?: string[];
  /** Existing exact native table colour criterion. */
  colorCriterion?: NonNullable<DataTableColumnFilter["color"]> | null;
  /** Standard base-OOXML icons actually present in this table column. */
  iconOptions?: DataTableIconFilter[];
  /** Existing exact native table icon criterion. */
  iconCriterion?: DataTableIconFilter | null;
  /** Localized heading supplied by the Spreadsheet table adapter. */
  iconLabel?: string;
  /** Existing base-OOXML relative-date criterion for this table column. */
  relativeDateCriterion?: DataTableRelativeDateFilter | null;
  /** Localized display strings bound to their exact numeric date serials. */
  dateAuthority?: FilterDateAuthority;
  /** Current condition filter, or null if none. */
  conditionSelected: ConditionFilter | null;
  /**
   * Why this sheet refuses to sort right now, or null when it does not. Excel
   * gates sorting on a protected sheet behind the Allow Sort permission, and
   * the sort writers already stop there; the aliases below say so instead of
   * accepting a click they can only answer with the protection notice.
   */
  sortBlockedReason?: string | null;
  /** Header-menu sort aliases operate on this menu's exact clicked column. */
  onSortAscending: () => void;
  onSortDescending: () => void;
  onSortColor?: (color: string) => void;
  onSortFontColor?: (color: string) => void;
  onSortIcon?: (icon: DataTableIconFilter) => void;
  sortColorOptions?: string[];
  sortFontColorOptions?: string[];
  sortIconOptions?: DataTableIconFilter[];
  sortIconLabel?: string;
  /**
   * Commit BOTH the new allowed value set and the new allowed COLOR set in one
   * call (each is null to clear that dimension). Combined so a single sheet
   * update carries both — applying them separately would clobber one another.
   */
  onApply: (
    allowed: string[] | null,
    colorAllowed: string[] | null,
    commitOptions?: FilterMenuCommitOptions,
  ) => void;
  onApplyColor?: (
    criterion: NonNullable<DataTableColumnFilter["color"]> | null,
    options?: FilterMenuCommitOptions,
  ) => void;
  onApplyIcon?: (
    criterion: DataTableIconFilter | null,
    options?: FilterMenuCommitOptions,
  ) => void;
  onApplyRelativeDate?: (
    criterion: DataTableRelativeDateFilter | null,
    options?: FilterMenuCommitOptions,
  ) => void;
  /** Commit a condition filter (null to clear). */
  onApplyCondition: (
    cond: ConditionFilter | null,
    options?: FilterMenuCommitOptions,
  ) => void;
  onClear: () => void;
  onClose: () => void;
  allowSort?: boolean;
  allowColor?: boolean;
  /** OOXML table colorFilter owns exactly one fill or font colour. */
  singleColorCriterion?: boolean;
  requireValueSelection?: boolean;
  /** DOM id of the exact filter button that owns this portaled menu. */
  anchorId: string;
  menuTestId?: string;
  /** The UI locale a Custom AutoFilter value is read in ("1,000", a date). */
  locale?: string;
  /**
   * How an option is SHOWN when the viewer's separators draw it otherwise
   * (5.000,00 € for the option 5,000.00 €): the option itself stays the
   * filter's key, as the file and every other viewer read it.
   */
  optionLabels?: ReadonlyMap<string, string>;
  /** The workbook counts its dates from 1904: a typed date is that serial. */
  date1904?: ExcelDateSystemArg;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const [query, setQuery] = useState("");
  const popupPortalTarget = usePopupPortalTarget();
  /**
   * Excel applies a checkbox list on OK, never while the boxes are being
   * ticked, so the dropdown holds a draft and commits it once. The two "…"
   * dialogs the typed submenu opens take over the dropdown's body while they
   * are up, exactly as Excel's own modals cover it.
   */
  const [customFilterSeed, setCustomFilterSeed] = useState<string | null>(null);
  const [top10Open, setTop10Open] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(() =>
    selected ? new Set(selected) : new Set(options),
  );
  // What the list and colour drafts opened with: OK over an untouched list
  // confirms the column's existing criterion (a number condition), it does
  // not replace it with an all-values list (live audit B150).
  const initialDraftRef = useRef<{ values: Set<string>; colors: Set<string> } | null>(null);
  // Draft for the "by color" section: when no color filter is set, every color
  // starts checked (Excel: an unfiltered column shows all colors).
  const [colorDraft, setColorDraft] = useState<Set<string>>(() =>
    colorSelected ? new Set(colorSelected) : new Set(colorOptions),
  );
  if (initialDraftRef.current === null) {
    initialDraftRef.current = { values: new Set(draft), colors: new Set(colorDraft) };
  }
  const [singleColorDraft, setSingleColorDraft] = useState<
    NonNullable<DataTableColumnFilter["color"]> | null
  >(colorCriterion);
  const [iconDraft, setIconDraft] = useState<DataTableIconFilter | null>(
    iconCriterion,
  );
  const [relativeDateDraft, setRelativeDateDraft] = useState<
    DataTableRelativeDatePeriod | ""
  >(relativeDateCriterion?.period ?? "");

  // An icon reads as its set's localized name and place ("三向箭头(彩色)，
  // 第 2/3 个图标"), as the Sort dialog lists it (live audit S-108).
  const iconPositionLabel = (icon: DataTableIconFilter) =>
    t("spreadsheet.dynamicCopy.iconPosition", {
      family: iconSetDisplayName(icon.iconSet, t),
      index: icon.iconId + 1,
      count: iconSetCount(icon.iconSet),
    });

  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  // Esc / Enter reach the live OK and Cancel through these, so the keyboard
  // listener does not have to be torn down and rebuilt on every draft change.
  const confirmRef = useRef<() => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});
  const menuNaturalHeightRef = useRef<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 8,
    left: 8,
    width: 320,
    maxHeight: 520,
    placement: "below" as "above" | "below",
  });

  useLayoutEffect(() => {
    const anchor = document.getElementById(anchorId);
    anchorRef.current = anchor;
    if (!anchor) return;

    const updatePosition = () => {
      // An arrow inside the grid unmounts when its row scrolls out of the
      // rendered window; the open menu then stays where it was instead of
      // jumping to the detached node's empty rectangle.
      if (!anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const gap = 4;
      const viewportWidth = Math.max(320, window.innerWidth);
      const viewportHeight = Math.max(240, window.innerHeight);
      const width = Math.min(336, viewportWidth - margin * 2);
      const measuredContentHeight = menuRef.current
        ? Array.from(menuRef.current.children).reduce((height, child) => {
            const element = child as HTMLElement;
            return (
              height +
              Math.max(
                element.scrollHeight,
                element.clientHeight,
                element.offsetHeight,
              )
            );
          }, 0)
        : 0;
      const measuredNaturalHeight = Math.min(
        620,
        Math.max(280, measuredContentHeight || 520),
      );
      const naturalHeight = Math.max(
        menuNaturalHeightRef.current ?? 0,
        measuredNaturalHeight,
      );
      menuNaturalHeightRef.current = naturalHeight;
      const below = Math.max(0, viewportHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const placement =
        below >= Math.min(naturalHeight, 360) || below >= above
          ? "below"
          : "above";
      const available = placement === "below" ? below : above;
      const maxHeight = Math.max(160, Math.min(naturalHeight, available));
      const preferredLeft = rect.left;
      const overflowAdjustedLeft =
        preferredLeft + width > viewportWidth - margin
          ? rect.right - width
          : preferredLeft;
      const left = Math.max(
        margin,
        Math.min(overflowAdjustedLeft, viewportWidth - width - margin),
      );
      const top =
        placement === "below"
          ? rect.bottom + gap
          : Math.max(margin, rect.top - gap - maxHeight);
      setMenuPosition((current) =>
        current.top === top &&
        current.left === left &&
        current.width === width &&
        current.maxHeight === maxHeight &&
        current.placement === placement
          ? current
          : { top, left, width, maxHeight, placement },
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    observer?.observe(anchor);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorId]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>("[role='menuitem']:not([disabled])")
      ?.focus();
  }, []);

  // Close the dropdown on an outside click or Escape, like the other menus.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !anchorRef.current?.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Excel's AutoFilter dropdown is a two-button dialog: Esc is Cancel and
      // leaves the data as it was, Enter is OK and commits the ticked list.
      if (event.key === "Escape") {
        cancelRef.current();
        return;
      }
      if (event.key !== "Enter" || event.defaultPrevented) return;
      const target = event.target as Node | null;
      if (!target || !menuRef.current?.contains(target)) return;
      if (target === searchInputRef.current) return;
      // A focused button (Cancel, a submenu command) keeps its own Enter:
      // the browser clicks it, so Cancel cancels (live audit B151).
      if (target instanceof Element && target.closest("button, [role=\"menuitem\"], a[href]")) return;
      event.preventDefault();
      confirmRef.current();
    };
    // Any pointer's press outside closes it: a finger on a window's title
    // bar sends no mousedown (the drag handle cancels the touch's start).
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const optionLabel = (value: string) => optionLabels?.get(value) ?? value;
  // The search reads what the list shows (the viewer's 5.000,00) and the
  // option's own text alike.
  const filteredOptions = query.trim()
    ? options.filter((value) =>
        [value || t("spreadsheet.filterBlanks"), optionLabel(value)].some((shown) =>
          shown.toLowerCase().includes(query.trim().toLowerCase()),
        ),
      )
    : options;
  const focusFirstSearchResult = () => {
    const firstResult = menuRef.current?.querySelector<HTMLInputElement>(
      `[data-testid="spreadsheet-filter-value-${col}"]`,
    );
    (firstResult ?? searchInputRef.current)?.focus();
  };
  const scopedOptions = query.trim() ? filteredOptions : options;
  const scopedSelectedCount = scopedOptions.filter((value) =>
    draft.has(value),
  ).length;
  const selectAllState: "checked" | "unchecked" | "indeterminate" =
    scopedOptions.length > 0 && scopedSelectedCount === scopedOptions.length
      ? "checked"
      : scopedSelectedCount === 0
        ? "unchecked"
        : "indeterminate";

  // AutoFilter DATE hierarchy (Excel/WPS parity): when the column's distinct
  // values look like dates, the flat checkbox list is replaced by an expandable
  // Year > Month > Day/time tri-state tree. The pure date-filter-tree helper parses
  // the DISPLAY strings, groups them, and supplies the per-node value lists +
  // tri-state math; toggling a node adds/removes every display string it controls
  // in `draft`, so `apply()` (which keys on draft vs options) is unchanged.
  const isDateCol = useMemo(
    () =>
      dateAuthority ? dateAuthority.byDisplay.size > 0 : isDateColumn(options),
    [dateAuthority, options],
  );
  const dateTree = useMemo(
    () =>
      isDateCol ? buildDateFilterTree(options, dateAuthority?.byDisplay) : null,
    [dateAuthority, isDateCol, options],
  );
  // Render the tree only when it exists AND the search box is empty — typing a
  // query reverts to the flat filtered list (matching Excel's search behaviour).
  const showDateTree = dateTree !== null && query.trim() === "";
  // Expanded year/month nodes (collapsed by default, like Excel). Keys are the
  // year number or `${year}-${month}` for a month row.
  const [expandedDateNodes, setExpandedDateNodes] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleDateExpand = (key: string) => {
    setExpandedDateNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  function commitValueDraft(
    nextDraft: Set<string> = draft,
    nextColorDraft: Set<string> = colorDraft,
    nextSingleColorDraft: NonNullable<DataTableColumnFilter["color"]> | null =
      singleColorDraft,
    nextIconDraft: DataTableIconFilter | null = iconDraft,
    nextRelativeDateDraft: DataTableRelativeDatePeriod | "" = relativeDateDraft,
    commitOptions?: FilterMenuCommitOptions,
  ) {
    if (
      requireValueSelection &&
      nextDraft.size === 0 &&
      !nextRelativeDateDraft &&
      !nextIconDraft &&
      !nextSingleColorDraft
    ) {
      return;
    }
    if (nextRelativeDateDraft && onApplyRelativeDate) {
      onApplyRelativeDate(
        relativeDateCriterion?.period === nextRelativeDateDraft
          ? relativeDateCriterion
          : { period: nextRelativeDateDraft },
        commitOptions,
      );
      return;
    }
    if (nextIconDraft) {
      onApplyIcon?.(nextIconDraft, commitOptions);
      return;
    }
    if (singleColorCriterion && nextSingleColorDraft) {
      onApplyColor?.(nextSingleColorDraft, commitOptions);
      return;
    }
    const initial = initialDraftRef.current;
    const sameSet = (a: Set<string>, b: Set<string>) =>
      a.size === b.size && [...a].every((entry) => b.has(entry));
    if (
      conditionSelected &&
      initial &&
      sameSet(nextDraft, initial.values) &&
      sameSet(nextColorDraft, initial.colors)
    ) {
      // Confirmed as it was: the number condition stands.
      if (!commitOptions?.keepOpen) onClose();
      return;
    }
    const valueAllowed =
      options.length > 0 &&
      options.every((value) => nextDraft.has(value))
        ? null
        : Array.from(nextDraft);
    const colorAllowed =
      !allowColor ||
      colorOptions.length === 0 ||
      colorOptions.every((color) => nextColorDraft.has(color))
        ? null
        : Array.from(nextColorDraft);
    onApply(valueAllowed, colorAllowed, commitOptions);
  }
  // Toggle a tree node: flip the whole set of display strings it controls (Excel
  // checkbox semantics live in toggleNode), routed back into `draft`.
  const toggleDateNode = (values: readonly string[]) => {
    const next = toggleNode(values, draft);
    if (singleColorCriterion) setSingleColorDraft(null);
    setIconDraft(null);
    setRelativeDateDraft("");
    setDraft(next);
  };

  const toggle = (value: string) => {
    const next = new Set(draft);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (singleColorCriterion) setSingleColorDraft(null);
    setIconDraft(null);
    setRelativeDateDraft("");
    setDraft(next);
  };

  const toggleColor = (color: string, kind: "cell" | "font" = "cell") => {
    setIconDraft(null);
    setRelativeDateDraft("");
    if (singleColorCriterion) {
      const nextSingleColorDraft =
        singleColorDraft?.kind === kind && singleColorDraft.value === color
          ? null
          : { kind, value: color };
      const nextDraft = new Set(options);
      setSingleColorDraft(nextSingleColorDraft);
      setDraft(nextDraft);
      return;
    }
    const nextColorDraft = new Set(colorDraft);
    if (nextColorDraft.has(color)) nextColorDraft.delete(color);
    else nextColorDraft.add(color);
    setColorDraft(nextColorDraft);
  };

  const apply = () => commitValueDraft();

  /**
   * The column carries criteria of its own. Excel dims "Clear Filter From ..."
   * exactly while this is false, whichever dimension the criterion lives in.
   */
  const hasColumnFilter = Boolean(
    selected ||
      colorSelected ||
      colorCriterion ||
      iconCriterion ||
      relativeDateCriterion ||
      conditionSelected,
  );
  // Excel's OK is always live: it commits what the list now reads, and closing
  // with it is how an unchanged list is confirmed. A native table column that
  // must keep at least one criterion is the one case that refuses.
  const applyDisabled =
    requireValueSelection &&
    draft.size === 0 &&
    !relativeDateDraft &&
    !iconDraft &&
    !singleColorDraft;
  const cancel = () => {
    onClose();
    requestAnimationFrame(() => anchorRef.current?.focus());
  };
  // A command or dialog in the typed submenu IS the whole criterion, so it
  // commits on its own click the way Excel's does, and closes the dropdown.
  const commitCondition = (condition: ConditionFilter) => {
    setCustomFilterSeed(null);
    setTop10Open(false);
    onApplyCondition(condition);
  };
  useEffect(() => {
    confirmRef.current = () => {
      if (customFilterSeed !== null || top10Open || applyDisabled) return;
      apply();
    };
    cancelRef.current = () => {
      if (customFilterSeed !== null) {
        setCustomFilterSeed(null);
        return;
      }
      if (top10Open) {
        setTop10Open(false);
        return;
      }
      cancel();
    };
  });

  // Excel draws the colour and icon lists INSIDE the dropdown's 按颜色排序 ▸
  // and 按颜色筛选 ▸ submenus. This is the exact markup the column's own colour
  // and icon authority produced; only where it hangs changes.
  const sortColorSection =
    (onSortColor && sortColorOptions.length > 0) ||
    (onSortFontColor && sortFontColorOptions.length > 0) ||
    (onSortIcon && sortIconOptions.length > 0) ? (
      <>
              {onSortColor && sortColorOptions.length > 0 ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 650 }}>
                    {t("spreadsheet.fillColor")}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {sortColorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="menuitem"
                        onClick={() => onSortColor(color)}
                        disabled={Boolean(sortBlockedReason)}
                        aria-label={`${t("spreadsheet.sortByColor")}: ${color}`}
                        title={color}
                        data-color={color}
                        data-color-kind="cell"
                        data-testid={`spreadsheet-filter-sort-color-option-${col}`}
                        style={{
                          width: 24,
                          height: 24,
                          padding: 3,
                          border: "1px solid var(--border, #d1d5db)",
                          borderRadius: 4,
                          background: "var(--surface, #ffffff)",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            borderRadius: 2,
                            background: color,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {onSortFontColor && sortFontColorOptions.length > 0 ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 650 }}>
                    {t("spreadsheet.fmtFontColor")}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {sortFontColorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="menuitem"
                        onClick={() => onSortFontColor(color)}
                        disabled={Boolean(sortBlockedReason)}
                        aria-label={`${t("spreadsheet.fmtFontColor")}: ${color}`}
                        title={color}
                        data-color={color}
                        data-color-kind="font"
                        data-testid={`spreadsheet-filter-sort-font-color-option-${col}`}
                        style={{
                          width: 24,
                          height: 24,
                          padding: 3,
                          border: "1px solid var(--border, #d1d5db)",
                          borderRadius: 4,
                          background: "var(--surface, #ffffff)",
                          color,
                          cursor: "pointer",
                          fontSize: 15,
                          fontWeight: 750,
                          lineHeight: 1,
                        }}
                      >
                        A
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {onSortIcon && sortIconOptions.length > 0 ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 650 }}>
                    {sortIconLabel ?? t("spreadsheet.dynamicCopy.sortByIcon")}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {sortIconOptions.map((icon) => (
                      <button
                        key={`${icon.iconSet}:${icon.iconId}`}
                        type="button"
                        role="menuitem"
                        onClick={() => onSortIcon(icon)}
                        disabled={Boolean(sortBlockedReason)}
                        aria-label={t("spreadsheet.dynamicCopy.iconAction", { action: sortIconLabel ?? t("spreadsheet.dynamicCopy.sortByIcon"), iconSet: iconSetDisplayName(icon.iconSet, t), index: icon.iconId + 1 })}
                        title={iconPositionLabel(icon)}
                        data-icon-set={icon.iconSet}
                        data-icon-id={icon.iconId}
                        data-testid={`spreadsheet-filter-sort-icon-option-${col}`}
                        style={{
                          display: "inline-flex",
                          width: 28,
                          height: 28,
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 3,
                          border: "1px solid var(--border, #d1d5db)",
                          borderRadius: 4,
                          background: "var(--surface, #ffffff)",
                          cursor: "pointer",
                        }}
                      >
                        <ConditionalIconGlyph
                          iconSet={icon.iconSet}
                          index={icon.iconId}
                          count={iconSetCount(icon.iconSet)}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
      </>
    ) : null;
  const colorFilterSection =
    (allowColor &&
      (singleColorCriterion
        ? colorOptions.length > 0 || fontColorOptions.length > 0
        : colorOptions.length > 1)) ||
    iconOptions.length > 0 ? (
      <>
          {/* Worksheet colour filters retain their multi-fill set. Native table
          colorFilter is stricter: exactly one fill OR font colour, represented
          by radio controls so the UI cannot author a lossy multi-colour dxf. */}
          {allowColor &&
          (singleColorCriterion
            ? colorOptions.length > 0 || fontColorOptions.length > 0
            : colorOptions.length > 1) ? (
            <>
              {singleColorCriterion && colorOptions.length > 0 ? (
                <div style={{ fontSize: 11, fontWeight: 600 }}>
                  {t("spreadsheet.fillColor")}
                </div>
              ) : null}
              <div
                data-testid={`spreadsheet-filter-color-list-${col}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {colorOptions.map((color) => (
                  <label
                    key={color || "__nofill__"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type={singleColorCriterion ? "radio" : "checkbox"}
                      name={
                        singleColorCriterion
                          ? `spreadsheet-table-filter-color-${col}`
                          : undefined
                      }
                      checked={
                        singleColorCriterion
                          ? singleColorDraft?.kind === "cell" &&
                            singleColorDraft.value === color
                          : colorDraft.has(color)
                      }
                      onChange={() => toggleColor(color, "cell")}
                      data-testid={`spreadsheet-filter-color-${col}`}
                      data-color-kind="cell"
                      data-color={color}
                    />
                    <span
                      aria-hidden
                      style={{
                        width: 14,
                        height: 14,
                        flex: "0 0 auto",
                        borderRadius: 3,
                        border: "1px solid var(--border, #d1d5db)",
                        background: color === "" ? "transparent" : color,
                        backgroundImage:
                          color === ""
                            ? "linear-gradient(45deg, transparent 45%, var(--border, #d1d5db) 45%, var(--border, #d1d5db) 55%, transparent 55%)"
                            : undefined,
                      }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontStyle: color === "" ? "italic" : undefined,
                        opacity: color === "" ? 0.7 : undefined,
                      }}
                    >
                      {color === "" ? t("spreadsheet.colorNoFill") : color}
                    </span>
                  </label>
                ))}
              </div>
              {singleColorCriterion && fontColorOptions.length > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>
                    {t("spreadsheet.fmtFontColor")}
                  </div>
                  <div
                    data-testid={`spreadsheet-filter-font-color-list-${col}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {fontColorOptions.map((color) => (
                      <label
                        key={color}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name={`spreadsheet-table-filter-color-${col}`}
                          checked={
                            singleColorDraft?.kind === "font" &&
                            singleColorDraft.value === color
                          }
                          onChange={() => toggleColor(color, "font")}
                          data-testid={`spreadsheet-filter-font-color-${col}`}
                          data-color-kind="font"
                          data-color={color}
                        />
                        <span
                          aria-hidden
                          style={{
                            width: 14,
                            height: 14,
                            flex: "0 0 auto",
                            borderRadius: 3,
                            border: "1px solid var(--border, #d1d5db)",
                            background: color,
                          }}
                        />
                        <span>{color}</span>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
          {iconOptions.length > 0 ? (
            <>
              <div
                style={{
                  borderTop: "1px solid var(--border, #e5e7eb)",
                  paddingTop: 6,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {iconLabel ?? t("spreadsheet.dynamicCopy.filterByIcon")}
              </div>
              <div
                data-testid={`spreadsheet-filter-icon-list-${col}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {iconOptions.map((icon) => {
                  const key = `${icon.iconSet}:${icon.iconId}`;
                  return (
                    <label
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minHeight: 24,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={`spreadsheet-table-filter-icon-${col}`}
                        checked={
                          iconDraft?.iconSet === icon.iconSet &&
                          iconDraft.iconId === icon.iconId
                        }
                        onChange={() => {
                          const nextDraft = new Set(options);
                          setIconDraft(icon);
                          setRelativeDateDraft("");
                          setSingleColorDraft(null);
                          setDraft(nextDraft);
                        }}
                        data-testid={`spreadsheet-filter-icon-${col}`}
                        data-icon-set={icon.iconSet}
                        data-icon-id={icon.iconId}
                        aria-label={t("spreadsheet.dynamicCopy.iconAction", { action: iconLabel ?? t("spreadsheet.dynamicCopy.filterByIcon"), iconSet: iconSetDisplayName(icon.iconSet, t), index: icon.iconId + 1 })}
                      />
                      <ConditionalIconGlyph
                        iconSet={icon.iconSet}
                        index={icon.iconId}
                        count={iconSetCount(icon.iconSet)}
                      />
                      <span>{iconPositionLabel(icon)}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}
      </>
    ) : null;
  /** Excel picks ONE typed filter menu, by what the column mostly holds. */
  const columnKind: "text" | "number" | "date" =
    isDateCol ? "date" : columnValueKind;

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      className="spreadsheet-filter-menu"
      data-testid={menuTestId ?? `spreadsheet-filter-menu-${col}`}
      data-placement={menuPosition.placement}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        top: menuPosition.top,
        left: menuPosition.left,
        zIndex: 1_000,
        display: "flex",
        flexDirection: "column",
        width: menuPosition.width,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: menuPosition.maxHeight,
        overflow: "hidden",
        background: "var(--surface, #ffffff)",
        color: "var(--console-text-primary, #172b2a)",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 6,
        boxShadow: "0 12px 36px rgba(15, 23, 42, 0.22)",
        fontWeight: 400,
        textAlign: "left",
      }}
    >
      <div
        data-testid={`spreadsheet-filter-header-${col}`}
        style={{
          display: "flex",
          flex: "0 0 auto",
          minHeight: 40,
          alignItems: "center",
          gap: 8,
          padding: "6px 8px 6px 12px",
          borderBottom: "1px solid var(--border, #e5e7eb)",
          background: "var(--surface, #ffffff)",
        }}
      >
        {/* Excel's dropdown carries no title bar; the zero-write Close stays. */}
        <SpreadsheetDataIcon name="filter" size={16} />
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("spreadsheet.filterClose")}
          title={t("spreadsheet.filterClose")}
          data-control-id="XLSCTL.SHEET.AUTOFILTER.CLOSE"
          data-testid={`spreadsheet-filter-close-${col}`}
          style={{
            display: "inline-flex",
            width: 28,
            height: 28,
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            border: 0,
            borderRadius: 4,
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          <OfficeSemanticIcon semanticId="edit.close" size={15} />
        </button>
      </div>
      {customFilterSeed !== null ? (
        <SpreadsheetCustomAutoFilterDialog
          col={col}
          columnKind={columnKind}
          columnHeader={columnHeader}
          seedOperatorId={customFilterSeed}
          initialCondition={conditionSelected}
          valueOptions={options}
          locale={locale}
          date1904={date1904}
          onApply={commitCondition}
          onCancel={() => setCustomFilterSeed(null)}
          t={t}
        />
      ) : top10Open ? (
        <SpreadsheetTop10AutoFilterDialog
          col={col}
          onApply={commitCondition}
          onCancel={() => setTop10Open(false)}
          t={t}
        />
      ) : (
        <>
      <div
        data-testid={`spreadsheet-filter-scroll-${col}`}
        style={{
          display: "flex",
          minHeight: 0,
          flex: "1 1 auto",
          flexDirection: "column",
          gap: 8,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: 12,
        }}
      >
      <SpreadsheetFilterCommands
        col={col}
        columnKind={columnKind}
        columnHeader={columnHeader}
        hasFilter={hasColumnFilter}
        allowSort={allowSort}
        sortBlockedReason={sortBlockedReason}
        onSortAscending={onSortAscending}
        onSortDescending={onSortDescending}
        sortColorSection={sortColorSection}
        colorFilterSection={colorFilterSection}
        onClearColumnFilter={onClear}
        onCondition={commitCondition}
        onCustom={(operatorId) => {
          if (operatorId === "top10") setTop10Open(true);
          else setCustomFilterSeed(operatorId);
        }}
        onRelativeDate={(period) => onApplyRelativeDate?.({ period })}
        relativeDatesAvailable={isDateCol && Boolean(onApplyRelativeDate)}
        t={t}
      />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 30px",
              minHeight: 32,
              border: "1px solid var(--border, #d1d5db)",
              borderRadius: 4,
              background: "var(--surface, #ffffff)",
              overflow: "hidden",
            }}
          >
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                focusFirstSearchResult();
              }}
              placeholder={t("spreadsheet.filterSearch")}
              aria-label={t("spreadsheet.filterSearch")}
              data-control-id="XLSCTL.SHEET.AUTOFILTER.SEARCH_FIELD"
              data-testid={`spreadsheet-filter-search-${col}`}
              style={{
                minWidth: 0,
                padding: "5px 8px",
                border: 0,
                outline: 0,
                background: "transparent",
                color: "inherit",
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={focusFirstSearchResult}
              aria-label={t("spreadsheet.filterSearch")}
              title={t("spreadsheet.filterSearch")}
              data-control-id="XLSCTL.SHEET.AUTOFILTER.SEARCH_BUTTON"
              data-testid={`spreadsheet-filter-search-button-${col}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: 0,
                borderLeft: "1px solid var(--border, #e5e7eb)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <OfficeSemanticIcon semanticId="help.search" size={15} />
            </button>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <TriStateCheckbox
              state={selectAllState}
              testId={`spreadsheet-filter-all-${col}`}
              dataValue="select-all"
              controlId="XLSCTL.SHEET.AUTOFILTER.SELECT_ALL"
              onChange={() => {
                const nextDraft = new Set(draft);
                if (selectAllState === "checked") {
                  for (const value of scopedOptions) nextDraft.delete(value);
                } else {
                  for (const value of scopedOptions) nextDraft.add(value);
                }
                if (singleColorCriterion) setSingleColorDraft(null);
                setIconDraft(null);
                setRelativeDateDraft("");
                setDraft(nextDraft);
              }}
            />
            {t("spreadsheet.filterSelectAll")}
          </label>
          <div
            data-testid={`spreadsheet-filter-value-list-${col}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {showDateTree && dateTree ? (
              /* ── Date hierarchy (Year > Month > exact displayed day/time) ── */
              <div data-testid={`spreadsheet-filter-date-tree-${col}`}>
                {dateTree.years.map((yearNode) => {
                  const yearKey = String(yearNode.year);
                  const yearExpanded = expandedDateNodes.has(yearKey);
                  return (
                    <div key={yearKey}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDateExpand(yearKey)}
                          aria-expanded={yearExpanded}
                          aria-label={
                            yearExpanded
                              ? t("spreadsheet.filterDateCollapse")
                              : t("spreadsheet.filterDateExpand")
                          }
                          data-testid={`spreadsheet-filter-date-year-toggle-${col}-${yearNode.year}`}
                          style={{
                            width: 14,
                            flex: "0 0 auto",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 10,
                            padding: 0,
                            color: "var(--muted, #6b7280)",
                          }}
                        >
                          {yearExpanded ? "▾" : "▸"}
                        </button>
                        <TriStateCheckbox
                          state={nodeTriState(yearNode.values, draft)}
                          onChange={() => toggleDateNode(yearNode.values)}
                          testId={`spreadsheet-filter-date-year-${col}`}
                          dataValue={yearKey}
                          label={String(yearNode.year)}
                        />
                        <span
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleDateNode(yearNode.values)}
                        >
                          {yearNode.year}
                        </span>
                      </div>
                      {yearExpanded
                        ? yearNode.months.map((monthNode) => {
                            const monthKey = `${yearNode.year}-${monthNode.month}`;
                            const monthExpanded =
                              expandedDateNodes.has(monthKey);
                            return (
                              <div key={monthKey} style={{ paddingLeft: 16 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 12,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleDateExpand(monthKey)}
                                    aria-expanded={monthExpanded}
                                    aria-label={
                                      monthExpanded
                                        ? t("spreadsheet.filterDateCollapse")
                                        : t("spreadsheet.filterDateExpand")
                                    }
                                    data-testid={`spreadsheet-filter-date-month-toggle-${col}-${yearNode.year}-${monthNode.month}`}
                                    style={{
                                      width: 14,
                                      flex: "0 0 auto",
                                      border: "none",
                                      background: "transparent",
                                      cursor: "pointer",
                                      fontSize: 10,
                                      padding: 0,
                                      color: "var(--muted, #6b7280)",
                                    }}
                                  >
                                    {monthExpanded ? "▾" : "▸"}
                                  </button>
                                  <TriStateCheckbox
                                    state={nodeTriState(
                                      monthNode.values,
                                      draft,
                                    )}
                                    onChange={() =>
                                      toggleDateNode(monthNode.values)
                                    }
                                    testId={`spreadsheet-filter-date-month-${col}`}
                                    dataValue={monthKey}
                                    label={`${t(`spreadsheet.month_${monthNode.month}`)} ${yearNode.year}`}
                                  />
                                  <span
                                    style={{ cursor: "pointer" }}
                                    onClick={() =>
                                      toggleDateNode(monthNode.values)
                                    }
                                  >
                                    {t(`spreadsheet.month_${monthNode.month}`)}
                                  </span>
                                </div>
                                {monthExpanded
                                  ? monthNode.days.map((dayNode, dayIdx) => (
                                      <label
                                        key={`${monthKey}-${dayNode.day}-${dayIdx}`}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                          fontSize: 12,
                                          cursor: "pointer",
                                          paddingLeft: 32,
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={draft.has(dayNode.value)}
                                          onChange={() => toggle(dayNode.value)}
                                          data-testid={`spreadsheet-filter-date-day-${col}`}
                                          data-value={dayNode.value}
                                        />
                                        <span>
                                          {dayNode.hour === undefined
                                            ? dayNode.day
                                            : `${dayNode.day} ${String(dayNode.hour).padStart(2, "0")}:${String(dayNode.minute ?? 0).padStart(2, "0")}${
                                                dayNode.second === undefined
                                                  ? ""
                                                  : `:${String(dayNode.second).padStart(2, "0")}`
                                              }`}
                                        </span>
                                      </label>
                                    ))
                                  : null}
                              </div>
                            );
                          })
                        : null}
                    </div>
                  );
                })}
                {dateTree.nonDates.map((value) => (
                  <label
                    key={value || "__blank__"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={draft.has(value)}
                      onChange={() => toggle(value)}
                      data-testid={`spreadsheet-filter-value-${col}`}
                      data-value={value}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontStyle: value === "" ? "italic" : undefined,
                        opacity: value === "" ? 0.7 : undefined,
                      }}
                    >
                      {value === "" ? t("spreadsheet.filterBlanks") : optionLabel(value)}
                    </span>
                  </label>
                ))}
              </div>
            ) : filteredOptions.length === 0 ? (
              <span style={{ fontSize: 12, opacity: 0.6, padding: "2px 0" }}>
                {t("spreadsheet.filterNoValues")}
              </span>
            ) : (
              filteredOptions.map((value) => (
                <label
                  key={value || "__blank__"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={draft.has(value)}
                    onChange={() => toggle(value)}
                    data-testid={`spreadsheet-filter-value-${col}`}
                    data-value={value}
                  />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontStyle: value === "" ? "italic" : undefined,
                      opacity: value === "" ? 0.7 : undefined,
                    }}
                  >
                    {value === "" ? t("spreadsheet.filterBlanks") : optionLabel(value)}
                  </span>
                </label>
              ))
            )}
          </div>
      </div>
      <div
        data-testid={`spreadsheet-filter-footer-${col}`}
        style={{
          display: "flex",
          flex: "0 0 auto",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "10px 12px",
          borderTop: "1px solid var(--border, #e5e7eb)",
          background: "var(--surface, #ffffff)",
          boxShadow: "0 -4px 12px rgba(15, 23, 42, 0.04)",
        }}
      >
        {/* Excel's dropdown ends in OK and Cancel. Clearing this column is a
            command in the list above, not a footer button. */}
        <button
          type="button"
          onClick={cancel}
          data-control-id="XLSCTL.SHEET.AUTOFILTER.CANCEL"
          data-testid={`spreadsheet-filter-cancel-${col}`}
          style={{
            minHeight: 34,
            padding: "6px 14px",
            border: "1px solid var(--border, #d1d5db)",
            borderRadius: 4,
            background: "var(--surface, #ffffff)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {t("spreadsheet.fmtCancel")}
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={applyDisabled}
          data-control-id="XLSCTL.SHEET.AUTOFILTER.APPLY"
          data-testid={`spreadsheet-filter-apply-${col}`}
          style={{
            minWidth: 96,
            minHeight: 34,
            padding: "6px 18px",
            border: 0,
            borderRadius: 4,
            background: "var(--console-accent-strong, #107c41)",
            color: "var(--primary-foreground, #ffffff)",
            cursor: applyDisabled ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 650,
          }}
        >
          {t("spreadsheet.fmtOk")}
        </button>
      </div>
        </>
      )}
    </div>
  );
  return typeof document === "undefined"
    ? menu
    : createPortal(menu, popupPortalTarget ?? document.body);
}
