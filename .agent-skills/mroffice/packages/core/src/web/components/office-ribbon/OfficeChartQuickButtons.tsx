"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The buttons beside a selected chart, once for Docs, the deck and the
 * worksheet.
 *
 * Word, Excel and PowerPoint show Chart Elements, Chart Styles and Chart
 * Filters "next to the upper-right corner of the chart" when it is selected
 * (Microsoft Support, "Change the layout or style of a chart"):
 * - Chart Elements lists the elements to show or hide, each with its options
 *   (the same list as Chart Design > Add Chart Element);
 * - Chart Styles has a Style tab (the Chart Styles gallery) and a Color tab
 *   (Change Colors), both with Live Preview;
 * - Chart Filters' Values tab lists the series and the categories, each with
 *   a check box, and links to Select Data;
 * - Edit Data (this product's own fourth button, where the host gives one)
 *   edits the chart's numbers in place, without opening its data sheet.
 *
 * The buttons own their look, words, order and test ids; a host adapter gives
 * the content it already builds for its Chart Design tab.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Database,
  Filter,
  Info,
  Paintbrush,
  Plus,
  Table2,
} from "./icons/houseIcons";
import { useTranslations } from "../../../host/next-intl";

import { RibbonDropdownMenuContent } from "./CupertinoRibbonMenu";
import styles from "./OfficeChartQuickButtons.module.css";
import { OfficeChartQuickDataPanel } from "./OfficeChartQuickDataPanel";
import { OfficeChartElementQuickContext } from "./officeChartElementQuickContext";
import { OfficeQuickCheck } from "./OfficeQuickCheck";
import type { ChartQuickData, ChartQuickDataEdit } from "../../lib/office-charts/quick-data";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export type OfficeChartStylesTab = "style" | "color";

/** What the Chart Styles gallery takes to open from the quick button. */
export interface OfficeChartStylesSlot {
  /** The gallery's menu trigger (the Chart Styles button). */
  menuTrigger: ReactElement;
  /** Office's Style / Color tabs, at the top of the gallery's menu. */
  menuHeader: ReactNode;
  /** The Color tab's palettes, in place of the style grid. */
  menuBody: ReactNode | undefined;
  testIdPrefix: string;
}

export interface OfficeChartQuickButtonsProps {
  locale: string;
  /** Every control's test id starts here. */
  testIdPrefix: string;
  /** Why the chart cannot be changed here; every button stays listed. */
  disabledReason?: string | null;
  /** Chart Elements: the rows of Add Chart Element (`OfficeChartElementMenuItems`
   * draws them as the flyout's check boxes here). */
  elements: ReactNode;
  /** Chart Styles: the host's gallery, opened by the Chart Styles button. */
  renderStyles: (slot: OfficeChartStylesSlot) => ReactNode;
  /** The Color tab's palettes; null with a reason where a chart takes none. */
  colors: ReactNode | null;
  colorsUnavailableReason?: string;
  /** Called as a flyout closes (a host clears its Live Preview). */
  onClose?: () => void;
  filters: {
    series: readonly string[];
    categories: readonly string[];
    /** Why the check boxes that cannot hide anything are greyed. */
    unavailableReason: string;
    /** The same reason as a catalogue key (`officeChartFilterControls`). */
    unavailableReasonKey?: string;
    onSelectData?: () => void;
    /** Positions of the series the chart keeps unplotted (Chart Filters). */
    hiddenSeries?: readonly number[];
    /** A host whose writers state a hidden series shows or hides one. */
    onToggleSeries?: (index: number, shown: boolean) => void;
    /** Positions of the categories the chart keeps unplotted. */
    hiddenCategories?: readonly number[];
    /** A host whose writers state a hidden category shows or hides one. */
    onToggleCategory?: (index: number, shown: boolean) => void;
  };
  /**
   * Edit Data in place: the chart's categories, series names and values in a
   * small grid beside the chart, one cell committed at a time. Absent where
   * the host's data already sits in cells (the worksheet).
   */
  quickData?: {
    data: ChartQuickData | null;
    /** Why this chart's data is edited in the sheet only. */
    unavailableReason?: string;
    onEdit?: (edit: ChartQuickDataEdit) => boolean;
    onOpenSheet?: () => void;
  };
  className?: string;
  style?: CSSProperties;
}

const WORDS = {
  label: "office.chartQuick.label",
  elements: "office.chartQuick.elements",
  styles: "office.chartQuick.styles",
  filters: "office.chartQuick.filters",
  style: "office.chartQuick.style",
  color: "office.chartQuick.color",
  values: "office.chartQuick.values",
  series: "office.chartQuick.series",
  categories: "office.chartQuick.categories",
  selectData: "office.chartQuick.selectData",
  data: "office.chartQuick.data",
  keepSeries: "office.chartQuick.keepSeries",
  keepCategories: "office.chartQuick.keepCategories",
  selectAll: "toolbar.selectAll",
} as const;

const BUTTON_STYLE: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  padding: 0,
  border: "1px solid var(--office-chart-quick-edge, #c8c6c4)",
  borderRadius: 3,
  background: "var(--office-chart-quick-face, #ffffff)",
  color: "var(--office-chart-quick-ink, #323130)",
  cursor: "pointer",
  boxShadow: "var(--office-chart-quick-shadow, 0 1px 2px rgb(0 0 0 / 12%))",
};

const LABELLED_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  width: "auto",
  padding: "0 7px 0 6px",
  whiteSpace: "nowrap",
};

export function OfficeChartQuickButtons(props: OfficeChartQuickButtonsProps) {
  const t = useTranslations("console-notebooks");
  const word = (key: keyof typeof WORDS) => t(WORDS[key]);
  const filterReason = props.filters.unavailableReasonKey
    ? t(props.filters.unavailableReasonKey)
    : props.filters.unavailableReason;
  const [stylesTab, setStylesTab] = useState<OfficeChartStylesTab>("style");
  const disabled = Boolean(props.disabledReason);
  const id = (suffix: string) => `${props.testIdPrefix}-${suffix}`;
  const [dataOpen, setDataOpen] = useState(false);
  const dataRef = useRef<HTMLDivElement | null>(null);
  const dataPanelRef = useRef<HTMLDivElement | null>(null);
  const [dataTrigger, setDataTrigger] = useState<HTMLElement | null>(null);
  // The flyout closes on a press anywhere else, as the other three do. It is
  // its own layer on <body>, so a press in it is tested separately.
  useEffect(() => {
    if (!dataOpen) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !dataRef.current?.contains(target) &&
        !dataPanelRef.current?.contains(target)
      ) {
        setDataOpen(false);
      }
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [dataOpen]);
  const button = (
    key: "elements" | "styles" | "filters" | "data",
    icon: ReactNode,
    extra: Record<string, unknown> = {},
  ) => (
    <button
      type="button"
      aria-label={
        disabled ? `${word(key)}: ${props.disabledReason}` : word(key)
      }
      title={disabled ? `${word(key)}: ${props.disabledReason}` : word(key)}
      disabled={disabled}
      data-testid={id(key)}
      className={styles.quickButton}
      style={{
        ...BUTTON_STYLE,
        // Edit Data carries its name: an unlabelled grid glyph at the end of
        // the rail was not found as the way to change the chart's numbers.
        ...(key === "data" ? LABELLED_BUTTON_STYLE : {}),
        ...(disabled ? { opacity: 0.5, cursor: "default" } : {}),
      }}
      {...extra}
    >
      {icon}
      {key === "data" ? <span style={{ fontSize: 12, lineHeight: 1 }}>{word("data")}</span> : null}
    </button>
  );
  const stylesHeader = (
    <div
      role="tablist"
      aria-label={word("styles")}
      style={{ display: "flex", gap: 4, padding: "4px 6px 6px" }}
      onPointerDown={(event) => event.preventDefault()}
    >
      {(["style", "color"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={stylesTab === tab}
          data-testid={id(`styles-tab-${tab}`)}
          disabled={tab === "color" && props.colors === null}
          title={
            tab === "color" && props.colors === null
              ? props.colorsUnavailableReason
              : undefined
          }
          style={{
            border: 0,
            borderBottom: `2px solid ${stylesTab === tab ? "currentColor" : "transparent"}`,
            background: "transparent",
            padding: "2px 8px",
            font: "inherit",
            fontWeight: stylesTab === tab ? 600 : 400,
            cursor: "pointer",
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setStylesTab(tab);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {word(tab)}
        </button>
      ))}
    </div>
  );
  return (
    <div
      role="toolbar"
      aria-label={word("label")}
      aria-orientation="vertical"
      className={props.className}
      contentEditable={false}
      // The chart around the rail names itself in a tooltip (its object
      // name); between and beside the buttons that tooltip came up and
      // stood over the flyout just opened. An empty title stops it here,
      // and each button keeps its own.
      title=""
      data-testid={props.testIdPrefix}
      style={{ display: "grid", gap: 4, ...props.style }}
      // The flyouts are the buttons' own: a key or press in them never
      // reaches the chart underneath (Escape would deselect it, Delete
      // remove it).
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) props.onClose?.();
        }}
      >
        <DropdownMenuTrigger asChild disabled={disabled}>
          {button("elements", <Plus size={16} aria-hidden="true" />)}
        </DropdownMenuTrigger>
        {disabled ? null : (
          <RibbonDropdownMenuContent
            side="right"
            align="start"
            sideOffset={8}
            className={`${styles.flyout} ${styles.elementsFlyout}`}
            aria-label={word("elements")}
            data-testid={id("elements-menu")}
          >
            <div className={styles.flyoutHeader} aria-hidden="true">
              <Plus size={14} aria-hidden="true" />
              <span>{word("elements")}</span>
            </div>
            {/* Office's flyout: the elements the chart takes, each a check
                box, its options on the arrow beside it. */}
            <OfficeChartElementQuickContext.Provider value={true}>
              {props.elements}
            </OfficeChartElementQuickContext.Provider>
          </RibbonDropdownMenuContent>
        )}
      </DropdownMenu>
      {props.renderStyles({
        menuTrigger: button("styles", <Paintbrush size={15} aria-hidden="true" />),
        menuHeader: stylesHeader,
        menuBody: stylesTab === "color" && props.colors !== null ? props.colors : undefined,
        testIdPrefix: id("styles"),
      })}
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) props.onClose?.();
        }}
      >
        <DropdownMenuTrigger asChild disabled={disabled}>
          {button("filters", <Filter size={15} aria-hidden="true" />)}
        </DropdownMenuTrigger>
        {disabled ? null : (
          <RibbonDropdownMenuContent
            side="right"
            align="start"
            sideOffset={8}
            className={`${styles.flyout} ${styles.filtersFlyout}`}
            aria-label={word("filters")}
            data-testid={id("filters-menu")}
          >
            <div className={styles.flyoutHeader} aria-hidden="true">
              <Filter size={14} aria-hidden="true" />
              <span>{word("filters")}</span>
              <span className={styles.flyoutTab}>{word("values")}</span>
            </div>
            {(
              [
                ["series", props.filters.series],
                ["categories", props.filters.categories],
              ] as const
            ).map(([group, names]) => {
              if (!names.length) return null;
              // A check box works where the host writes that filter;
              // otherwise it stays greyed with the reason.
              const toggle =
                group === "series"
                  ? props.filters.onToggleSeries
                  : props.filters.onToggleCategory;
              const hidden =
                (group === "series"
                  ? props.filters.hiddenSeries
                  : props.filters.hiddenCategories) ?? [];
              const hiddenHere = hidden.filter((index) => index >= 0 && index < names.length);
              const allShown = hiddenHere.length === 0;
              const keepWord = word(group === "series" ? "keepSeries" : "keepCategories");
              return (
                <div key={group} role="group" aria-label={word(group)} className={styles.filterGroup}>
                  <div className={styles.filterGroupHead}>
                    <span className={styles.filterGroupName}>{word(group)}</span>
                    <span className={styles.filterGroupCount}>
                      {names.length - hiddenHere.length}/{names.length}
                    </span>
                  </div>
                  {names.length > 1 ? (
                    // Office's (Select All): on when every one is plotted,
                    // mixed when some are; a press plots them all again.
                    // Clearing them all is not offered: a chart keeps one.
                    <DropdownMenuItem
                      role="menuitemcheckbox"
                      aria-checked={allShown ? true : "mixed"}
                      disabled={!toggle || allShown}
                      title={!toggle ? filterReason : allShown ? keepWord : undefined}
                      className={styles.filterRow}
                      data-filter-select-all=""
                      data-all-shown={toggle && allShown ? "" : undefined}
                      data-testid={id(`filters-${group}-all`)}
                      onSelect={(event) => {
                        event.preventDefault();
                        if (!toggle) return;
                        for (const index of hiddenHere) toggle(index, true);
                      }}
                    >
                      <OfficeQuickCheck checked={allShown} mixed={!allShown} />
                      <span className={styles.filterName}>{word("selectAll")}</span>
                    </DropdownMenuItem>
                  ) : null}
                  {names.map((name, index) => {
                    const shown = !hiddenHere.includes(index);
                    // The last one plotted cannot be cleared: it is greyed with
                    // the reason, never a box that springs back (PPT-B141).
                    const last = shown && names.length - hiddenHere.length <= 1;
                    return (
                      <DropdownMenuItem
                        key={`${group}-${index}`}
                        role="menuitemcheckbox"
                        aria-checked={shown}
                        disabled={!toggle || last}
                        title={!toggle ? filterReason : last ? keepWord : name}
                        className={styles.filterRow}
                        data-state={shown ? "checked" : "unchecked"}
                        data-testid={id(`filters-${group}-${index}`)}
                        onSelect={(event) => {
                          event.preventDefault();
                          toggle?.(index, !shown);
                        }}
                      >
                        <OfficeQuickCheck checked={shown} />
                        <span className={styles.filterName}>{name || "\u00a0"}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              );
            })}
            {props.filters.onToggleSeries && props.filters.onToggleCategory ? null : (
              <p role="note" className={styles.filterNote}>
                <Info size={14} aria-hidden="true" />
                <span>{filterReason}</span>
              </p>
            )}
            {props.filters.onSelectData ? (
              <div className={styles.flyoutFooter}>
                <DropdownMenuItem
                  className={styles.footerAction}
                  data-testid={id("filters-select-data")}
                  onSelect={props.filters.onSelectData}
                >
                  <Database size={15} aria-hidden="true" />
                  <span>{word("selectData")}</span>
                </DropdownMenuItem>
              </div>
            ) : null}
          </RibbonDropdownMenuContent>
        )}
      </DropdownMenu>
      {props.quickData ? (
        <div ref={dataRef} style={{ position: "relative" }}>
          {button("data", <Table2 size={15} aria-hidden="true" />, {
            "aria-expanded": dataOpen,
            "aria-haspopup": "dialog",
            onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
              setDataTrigger(event.currentTarget);
              setDataOpen((open) => !open);
              // Opened from the keyboard: the flyout is not next in the tab
              // order any more, so the keyboard goes into its first cell.
              if (event.detail === 0) {
                requestAnimationFrame(() =>
                  dataPanelRef.current
                    ?.querySelector<HTMLInputElement>("input")
                    ?.focus({ preventScroll: true }),
                );
              }
            },
          })}
          {dataOpen && !disabled && dataTrigger ? (
            <OfficeChartQuickDataPanel
              trigger={dataTrigger}
              panelRef={dataPanelRef}
              locale={props.locale}
              data={props.quickData.data}
              unavailableReason={props.quickData.unavailableReason}
              testIdPrefix={id("data")}
              onEdit={props.quickData.onEdit}
              onOpenSheet={props.quickData.onOpenSheet}
              onClose={() => {
                setDataOpen(false);
                dataRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The series and category names a chart's filter lists. */
export function officeChartFilterNames(data: {
  kind: string;
  categories?: readonly unknown[];
  series?: readonly { name?: unknown }[];
}): { series: string[]; categories: string[] } {
  const series = (data.series ?? []).map((item, index) =>
    typeof item.name === "string" && item.name ? item.name : `Series ${index + 1}`,
  );
  const categories =
    data.kind === "category" || data.kind === "stock"
      ? (data.categories ?? []).map((item) => String(item ?? ""))
      : [];
  return { series, categories };
}
