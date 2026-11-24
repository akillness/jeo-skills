"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Office's ONE Chart Design tab, and its Add Chart Element menu, for every
 * editor that holds a chart: Docs, the deck (its owned V2 chart and the legacy
 * block a PowerPoint file brings) and the worksheet.
 *
 * Microsoft documents one Chart Design tab in Word, Excel and PowerPoint
 * ("Change the layout or style of a chart"; "Display or hide chart
 * gridlines": Chart Design ▸ Chart Layouts ▸ Add Chart Element): Chart Layouts
 * (Add Chart Element, Quick Layout) | Chart Styles (Change Colors, the styles
 * gallery) | Data (Switch Row/Column, Select Data, Edit Data, Refresh Data) |
 * Type (Change Chart Type) | and, in Excel only, Location (Move Chart). Word
 * and PowerPoint charts have Edit Data and Refresh Data because their data
 * lives in an embedded workbook; Excel's chart reads the sheet and has neither
 * ("Change the data in an existing chart"), and only Excel can move a chart to
 * another sheet ("Move a chart to another sheet"). Those are the only host
 * differences, so a host passes `editData` / `refreshData` / `location` or
 * leaves them out; everything else is here once.
 *
 * This shell owns the groups, their order, every command's glyph and default
 * label, and the Add Chart Element menu. An adapter supplies only what its
 * writer can do (enabled state and reason, the commit behind each pick), its
 * command authority (the worksheet's `data-control-id` / occurrence / surface
 * attributes ride on every command), its own words where it translates them
 * (`labels`), and its own test ids (`testIdPrefix` swaps the deck's
 * `presentation-chart` prefix, `testIds` renames single ids) so each editor's
 * suites keep addressing the names they always used.
 */

import {
  Fragment,
  useContext,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslations } from "../../../host/next-intl";

import {
  OfficeHomeCommand,
  OfficeHomeMenuTrigger,
  OfficeHomeRibbonGroup,
} from "./OfficeHomeRibbon";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import { RibbonDropdownMenuContent } from "./CupertinoRibbonMenu";
import {
  OFFICE_CHART_DATA_LABEL_ICON_IDS,
  OFFICE_CHART_TRENDLINE_MENU_ICON_IDS,
  OfficeChartElementIcon,
  type OfficeChartElementIconId,
} from "./OfficeChartElementIcon";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../ui/dropdown-menu";
import {
  chartDataLabelPositions,
  chartFamilyIcon,
  chartHasAxis,
  chartSupportsAxisTitle,
  chartSupportsMinorGridlines,
  chartSupportsDataLabelLeaderLines,
  chartTakesParentLabelLayout,
  chartTakesView3D,
  effectiveChartView3D,
  normalizeChartErrorBars,
  normalizeChartTrendline,
  type ChartBarShape,
  type ChartBlockAttrsV2,
  type ChartBoxWhisker,
  type ChartErrorBars,
  type ChartDataLabelPosition,
  type ChartDataLabelSeparator,
  type ChartDisplayBlanksAs,
  type ChartFamily,
  type ChartTrendline,
} from "../console/editor/extensions/chartBlockShared";
import { MAX_CHART_TEXT_CHARS } from "../../lib/office-charts/chart-limits.generated";
import type {
  OfficeShapeFormatPaneField,
  OfficeShapeFormatPaneSection,
} from "./OfficeShapeFormatPane";
import {
  CHART_ELEMENT_ERROR_BAR_RECIPES,
  CHART_ELEMENT_TRENDLINE_MENU,
  CHART_ELEMENT_TRENDLINES,
  CHART_TRENDLINE_MENU_NAMES,
  CHART_TRENDLINE_NAMES,
  chartUnfittableTrendlines,
  CHART_TRENDLINE_OPTION_NAMES,
  chartTrendlineMenuRow,
  chartDataLabelOverrideOf,
  chartDataLabelPlacement,
  chartDisplayBlanksOptions,
  chartDisplayBlanksShown,
  chartDataLabelPlacementName,
  chartDataLabelPlacements,
  chartDataLabelsShown,
  chartDataLabelStatementOf,
  chartElementAvailability,
  chartLegendShown,
  chartSeriesOptions,
  chart3DSeriesOptions,
  chartSeriesTrendline,
  chartSpacingInOwnKeys,
  chartTrendlineTakesOptions,
  chartWithElementIntent,
  type ChartDataLabelOverridePatch,
  type ChartDataLabelPlacement,
  type ChartDataLabelTarget,
  type ChartElementIntent,
  type ChartElementErrorBars,
  type ChartElementLine,
  type ChartFormatOption,
  type ChartTrendlineOptionChange,
  type ChartTrendlineOptionKey,
} from "../../lib/office-charts/chart-elements";
import { officeChartTakesCalibratedLayouts } from "../../lib/office-charts/chart-layout";
import { chartSeriesPlottedOn } from "../../lib/office-charts/chart-type";
import { officeChartAxisRole, officeChartPointArea } from "../../lib/office-charts/chart-hit";
import { OfficeChartElementQuickContext } from "./officeChartElementQuickContext";
import { OfficeQuickCheck } from "./OfficeQuickCheck";
import styles from "./OfficeChartDesignRibbon.module.css";

/** A ribbon command's state as the adapter's writer and authority see it. */
export interface OfficeChartDesignCommandState {
  disabled: boolean;
  /** Appended to the accessible name while the command is disabled. */
  disabledReason?: string;
  /** The host's command authority id (the worksheet's `XLSCTL.*` ids). */
  controlId?: string;
  /** Which rendering of that command this is (`data-control-occurrence-id`). */
  occurrenceId?: string;
  /** The host's authority hides the command altogether. */
  hidden?: boolean;
}

export interface OfficeChartDesignAction
  extends OfficeChartDesignCommandState {
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** "click" for a command that opens a modal (the press must not land on
   * the dialog's backdrop); the ribbon's default runs on pointer-down. */
  activation?: "pointerDown" | "click";
}

export interface OfficeChartDesignMenu
  extends OfficeChartDesignCommandState {
  /** The menu's entries. A function is called only while the menu is open
   * (the worksheet's type list asks its writer once per subtype). */
  items: ReactNode | (() => ReactNode);
  /** Told when the menu opens and closes (a host clears its live preview). */
  onOpenChange?: (open: boolean) => void;
  triggerRef?: Ref<HTMLButtonElement>;
  contentClassName?: string;
  onCloseAutoFocus?: (event: Event) => void;
  /** The trigger shows the command as applied (Change Colors with a palette). */
  active?: boolean;
}

/**
 * A command the host draws with its own shared control: Quick Layout's tile
 * gallery (`OfficeStyleGallery` with the shared preview tiles), or the
 * worksheet's Change Chart Type, whose catalogue-translated trigger opens the
 * same `OfficeChartTypeMenuItems` list.
 */
export interface OfficeChartDesignHostControl {
  control: ReactNode;
}

/** A host's test ids: a table from the deck's id to its own, or a function. */
export type OfficeChartTestIds =
  | Readonly<Record<string, string>>
  | ((deckId: string) => string | undefined);

/** The words the tab draws; a host that translates them passes its own. */
export type OfficeChartDesignWord =
  | "layoutGroup"
  | "stylesGroup"
  | "dataGroup"
  | "typeGroup"
  | "locationGroup"
  | "addChartElement"
  | "quickLayout"
  | "changeColors"
  | "switchRowColumn"
  | "selectData"
  | "editData"
  | "refreshData"
  | "hiddenEmptyCells"
  | "blanksGap"
  | "blanksZero"
  | "blanksSpan"
  | "blanksForcedZero"
  | "changeChartType"
  | "moveChart";

const DESIGN_WORDS: Record<OfficeChartDesignWord, string> = {
  layoutGroup: "office.chartDesign.layoutGroup",
  stylesGroup: "office.chartDesign.stylesGroup",
  dataGroup: "office.chartDesign.dataGroup",
  typeGroup: "office.chartDesign.typeGroup",
  locationGroup: "office.chartDesign.locationGroup",
  addChartElement: "office.chartDesign.addChartElement",
  quickLayout: "office.chartDesign.quickLayout",
  changeColors: "office.chartDesign.changeColors",
  switchRowColumn: "office.chartDesign.switchRowColumn",
  selectData: "office.chartDesign.selectData",
  editData: "office.chartDesign.editData",
  refreshData: "office.chartDesign.refreshData",
  hiddenEmptyCells: "office.chartDesign.hiddenEmptyCells",
  blanksGap: "office.chartDesign.blanksGap",
  blanksZero: "office.chartDesign.blanksZero",
  blanksSpan: "office.chartDesign.blanksSpan",
  blanksForcedZero: "office.chartDesign.blanksForcedZero",
  changeChartType: "office.chartDesign.changeChartType",
  moveChart: "office.chartDesign.moveChart",
};

export interface OfficeChartDesignRibbonProps {
  locale: string;
  /** The adapter's container id (only drawn when `frame` is "track"). */
  testId: string;
  /** Every command's test id starts here (the deck's `presentation-chart`). */
  testIdPrefix?: string;
  /** Single ids a host keeps under its own older names. */
  testIds?: OfficeChartTestIds;
  /**
   * "track": the tab draws its own band (the deck's context ribbon).
   * "groups": the groups go straight into the host's ribbon strip, which
   * lays them out (Docs' strip, the worksheet's band).
   */
  frame?: "track" | "groups";
  /** The host strip's ribbon key each group carries (Docs: "chartDesign"). */
  ribbon?: string;
  /** Written as `data-control-surface` beside every command's control id. */
  controlSurface?: string;
  /** The host band's own classes for the tab, each group and command row. */
  classes?: {
    root?: string;
    commands?: string;
    group?: string;
    stylesGroup?: string;
  };
  /** Called as a command is pressed, before its menu opens (Docs keeps the
   * editor selection it acts on). */
  onTriggerPointerDown?: () => void;
  labels?: Partial<Record<OfficeChartDesignWord, string>>;
  elements: OfficeChartDesignMenu;
  quickLayout: OfficeChartDesignMenu | OfficeChartDesignHostControl;
  colors: OfficeChartDesignMenu;
  /** The Chart Styles gallery beside Change Colors. */
  styleGallery: ReactNode;
  switchRowColumn: OfficeChartDesignAction;
  selectData: OfficeChartDesignAction;
  /** Word and PowerPoint only: Excel's chart reads the sheet. */
  editData?: OfficeChartDesignAction;
  refreshData?: OfficeChartDesignAction;
  /** Select Data Source ▸ Hidden and Empty Cells ▸ Show empty cells as
   * (`officeChartHiddenEmptyCellsMenu`). */
  hiddenEmptyCells?: OfficeChartDesignMenu;
  changeType:
    | (OfficeChartDesignMenu & { family: ChartFamily })
    | OfficeChartDesignHostControl;
  /** Excel only: Location ▸ Move Chart. */
  location?: OfficeChartDesignAction;
  /** Status line and the dialogs the commands open. */
  children?: ReactNode;
}

const DEFAULT_TEST_ID_PREFIX = "presentation-chart";

/**
 * A command's test id in the host's own vocabulary. The source spells every id
 * out in full as the deck's (so the dialog inventories find each one written
 * down); another host swaps the `presentation-chart` prefix for its own, and
 * renames single ids through its table.
 */
function hostTestId(
  deckId: string,
  prefix = DEFAULT_TEST_ID_PREFIX,
  overrides?: OfficeChartTestIds,
): string {
  const renamed =
    typeof overrides === "function" ? overrides(deckId) : overrides?.[deckId];
  if (renamed) return renamed;
  return prefix === DEFAULT_TEST_ID_PREFIX
    ? deckId
    : `${prefix}${deckId.slice(DEFAULT_TEST_ID_PREFIX.length)}`;
}

/** The authority attributes a host's command carries into the DOM. */
function authorityAttributes(
  command: OfficeChartDesignCommandState,
  surface: string | undefined,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (command.occurrenceId) {
    attributes["data-control-occurrence-id"] = command.occurrenceId;
  }
  if (surface && (command.controlId || command.occurrenceId)) {
    attributes["data-control-surface"] = surface;
  }
  return attributes;
}

function Menu({
  command,
  icon,
  label,
  testId,
  surface,
  onPointerDown,
}: {
  command: OfficeChartDesignMenu;
  icon: ReactNode;
  label: string;
  testId: string;
  surface?: string;
  onPointerDown?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (command.hidden) return null;
  // A refused command has no reachable entries: its rows are not mounted, so
  // none of them can write even where the menu shell renders them inline.
  const items = command.disabled
    ? null
    : typeof command.items === "function"
      ? open
        ? command.items()
        : null
      : command.items;
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(next) => {
        setOpen(next);
        command.onOpenChange?.(next);
      }}
    >
      <DropdownMenuTrigger asChild disabled={command.disabled}>
        <OfficeHomeMenuTrigger
          ref={command.triggerRef}
          variant="large"
          hasMenuIndicator
          active={command.active}
          icon={icon}
          label={label}
          controlId={command.controlId}
          disabled={command.disabled}
          disabledReason={command.disabled ? command.disabledReason : undefined}
          onPointerDown={onPointerDown}
          testId={testId}
          {...authorityAttributes(command, surface)}
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        className={command.contentClassName}
        onCloseAutoFocus={command.onCloseAutoFocus}
      >
        {items}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

function Action({
  action,
  icon,
  label,
  testId,
  surface,
}: {
  action: OfficeChartDesignAction;
  icon: ReactNode;
  label: string;
  testId: string;
  surface?: string;
}) {
  if (action.hidden) return null;
  const attributes = authorityAttributes(action, surface);
  const forwarded = action.buttonRef;
  // The command button owns its click pipeline and takes no stray props, so
  // the authority attributes are written on the node it renders.
  const buttonRef = (node: HTMLButtonElement | null) => {
    if (node) {
      for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, value);
      }
    }
    if (typeof forwarded === "function") forwarded(node);
    else if (forwarded) {
      (forwarded as { current: HTMLButtonElement | null }).current = node;
    }
  };
  return (
    <OfficeHomeCommand
      variant="large"
      activation={action.activation}
      buttonRef={buttonRef}
      controlId={action.controlId}
      icon={icon}
      label={label}
      disabled={action.disabled}
      disabledReason={action.disabled ? action.disabledReason : undefined}
      onClick={() => {
        if (!action.disabled) action.onClick();
      }}
      testId={testId}
    />
  );
}

export function OfficeChartDesignRibbon(
  props: OfficeChartDesignRibbonProps,
) {
  const t = useTranslations("console-notebooks");
  const word = (key: OfficeChartDesignWord) =>
    props.labels?.[key] ?? t(DESIGN_WORDS[key]);
  const id = (deckId: string) =>
    hostTestId(deckId, props.testIdPrefix, props.testIds);
  const commands = props.classes?.commands ?? styles.commands;
  const surface = props.controlSurface;
  const group = (
    label: string,
    deckId: string,
    children: ReactNode,
    className?: string,
  ) => (
    <OfficeHomeRibbonGroup
      ribbon={props.ribbon}
      label={label}
      className={[props.classes?.group, className].filter(Boolean).join(" ") || undefined}
      testId={id(deckId)}
    >
      <div className={commands}>{children}</div>
    </OfficeHomeRibbonGroup>
  );
  const quickLayout = props.quickLayout;
  const changeType = props.changeType;
  const groups = (
    <>
      {group(
        word("layoutGroup"),
        "presentation-chart-design-layout-group",
        <>
          <Menu
            command={props.elements}
            icon={<OfficeSemanticIcon semanticId="chart.insert" size={24} />}
            label={word("addChartElement")}
            testId={id("presentation-chart-elements")}
            surface={surface}
            onPointerDown={props.onTriggerPointerDown}
          />
          {"control" in quickLayout ? (
            quickLayout.control
          ) : (
            <Menu
              command={quickLayout}
              icon={<OfficeSemanticIcon semanticId="chart.dataTable" size={24} />}
              label={word("quickLayout")}
              testId={id("presentation-chart-layout")}
              surface={surface}
              onPointerDown={props.onTriggerPointerDown}
            />
          )}
        </>,
      )}
      {group(
        word("stylesGroup"),
        "presentation-chart-design-styles-group",
        <>
          <Menu
            command={props.colors}
            icon={<OfficeSemanticIcon semanticId="image.color" size={24} />}
            label={word("changeColors")}
            testId={id("presentation-chart-colors")}
            surface={surface}
            onPointerDown={props.onTriggerPointerDown}
          />
          {props.styleGallery}
        </>,
        props.classes?.stylesGroup,
      )}
      {group(
        word("dataGroup"),
        "presentation-chart-design-data-group",
        <>
          <Action
            action={props.switchRowColumn}
            icon={
              <OfficeSemanticIcon semanticId="chart.switchRowColumn" size={24} />
            }
            label={word("switchRowColumn")}
            testId={id("presentation-chart-switch-data")}
            surface={surface}
          />
          <Action
            action={props.selectData}
            icon={<OfficeSemanticIcon semanticId="chart.selectData" size={24} />}
            label={word("selectData")}
            testId={id("presentation-chart-select-data")}
            surface={surface}
          />
          {props.editData ? (
            <Action
              action={props.editData}
              icon={<OfficeSemanticIcon semanticId="chart.dataTable" size={24} />}
              label={word("editData")}
              testId={id("presentation-chart-open-workbook")}
              surface={surface}
            />
          ) : null}
          {props.hiddenEmptyCells ? (
            <Menu
              command={props.hiddenEmptyCells}
              icon={<OfficeSemanticIcon semanticId="chart.dataTable" size={24} />}
              label={word("hiddenEmptyCells")}
              testId={id("presentation-chart-hidden-empty-cells")}
              surface={surface}
              onPointerDown={props.onTriggerPointerDown}
            />
          ) : null}
          {props.refreshData ? (
            <Action
              action={props.refreshData}
              icon={<OfficeSemanticIcon semanticId="data.refreshAll" size={24} />}
              label={word("refreshData")}
              testId={id("presentation-chart-refresh")}
              surface={surface}
            />
          ) : null}
        </>,
      )}
      {group(
        word("typeGroup"),
        "presentation-chart-design-type-group",
        "control" in changeType ? (
          changeType.control
        ) : (
          // The trigger wears the current family's glyph, as Office's does.
          <Menu
            command={changeType}
            icon={
              <OfficeSemanticIcon
                semanticId={chartFamilyIcon(changeType.family)}
                size={24}
              />
            }
            label={word("changeChartType")}
            testId={id("presentation-chart-change-type")}
            surface={surface}
            onPointerDown={props.onTriggerPointerDown}
          />
        ),
      )}
      {props.location
        ? group(
            word("locationGroup"),
            "presentation-chart-design-location-group",
            <Action
              action={props.location}
              icon={<OfficeSemanticIcon semanticId="chart.dataTable" size={24} />}
              label={word("moveChart")}
              testId={id("presentation-chart-move")}
              surface={surface}
            />,
          )
        : null}
      {props.children}
    </>
  );
  if (props.frame === "groups") return groups;
  return (
    <div
      className={`${props.classes?.root ?? ""} note-editor-ribbon-track`}
      data-testid={props.testId}
    >
      {groups}
    </div>
  );
}

/** One title entry of Add Chart Element. The V2 model turns a title on and
 * off; a legacy block's title is text its native writer rewrites, so the
 * legacy adapter opens a dialog for it instead. */
export type OfficeChartTitleEntry = {
  disabled: boolean;
} & (
  | { kind: "toggle"; checked: boolean; onToggle: (on: boolean) => void }
  | { kind: "dialog"; onOpen: () => void }
);

export type OfficeChartLegendPosition =
  | "none"
  | "right"
  | "top"
  | "left"
  | "bottom"
  // Format Legend ▸ Top Right: shown, and none of the menu's placements (the
  // Legend menu does not offer it, as in Office).
  | "topRight";

/**
 * Add Chart Element's entries, in the order Word, Excel and PowerPoint list
 * them (Microsoft Support, "Add or remove titles in a chart" / "Change the
 * layout or style of a chart": Chart Design ▸ Add Chart Element): Axes, Axis
 * Titles, Chart Title, Data Labels, Data Table, Error Bars, Gridlines, Legend,
 * Lines, Trendline, Up/Down Bars. The three editors used to list them in three
 * different orders.
 */
export const OFFICE_CHART_ELEMENT_ORDER = [
  "axes",
  "axisTitles",
  "chartTitle",
  "dataLabels",
  "dataTable",
  "errorBars",
  "gridlines",
  "legend",
  "lines",
  "trendline",
  "upDownBars",
] as const;

export type OfficeChartElementId = (typeof OFFICE_CHART_ELEMENT_ORDER)[number];

/**
 * What the menu shows checked and which entries the chart takes. A V2 host
 * gets it from its block ({@link officeChartElementView}); the worksheet
 * builds it from its own chart, whose display fields are the authority there.
 */
export interface OfficeChartElementView {
  available: {
    axisX: boolean;
    axisY: boolean;
    axisSecondaryY: boolean;
    /** Axes > Depth Axis: a 3-D chart with a depth (series) axis. */
    axisDepth?: boolean;
    axisTitleX: boolean;
    axisTitleY: boolean;
    /** Axis Titles > Depth: a 3-D chart with a depth (series) axis. */
    axisTitleDepth?: boolean;
    gridlines: boolean;
    /** Minor gridlines: listed always, live where the writer carries them. */
    minorGridlines: boolean;
    dataLabels: boolean;
    /** Data Labels > Data Callout (a 2-D classic chart). */
    dataLabelCallout?: boolean;
    dataTable: boolean;
    errorBars: boolean;
    dropLines: boolean;
    highLowLines: boolean;
    seriesLines: boolean;
    trendline: boolean;
    upDownBars: boolean;
  };
  title: boolean;
  axisTitleX: boolean;
  axisTitleY: boolean;
  /** The depth axis title is shown (`format.seriesAxisTitle`). */
  axisTitleDepth?: boolean;
  axisX: boolean;
  axisY: boolean;
  axisSecondaryY: boolean;
  /** The depth axis is shown (`axisOptions.series.hidden` not set). */
  axisDepth?: boolean;
  gridlinesX: boolean;
  gridlinesY: boolean;
  minorGridlinesX: boolean;
  minorGridlinesY: boolean;
  dataLabels: boolean;
  dataLabelPlacement: ChartDataLabelPlacement | null;
  dataLabelPlacements: readonly ChartDataLabelPlacement[];
  /** A filled map's labels are a tri-state with no automatic member. */
  dataLabelAutomatic: boolean;
  /** The labels are drawn as Data Callouts. */
  dataLabelCallout?: boolean;
  dataTable: boolean;
  dataTableLegendKeys: boolean;
  /** Format Data Table ▸ Table Borders, each shown unless stated off. */
  dataTableBorders?: { horizontal: boolean; vertical: boolean; outline: boolean };
  /** The error amount shown, as the shared recipes name it. */
  errorBars: string | null;
  /** The error bars as the chart states them (Format Error Bars' page). */
  errorBarsState?: ChartErrorBars | null;
  legend: OfficeChartLegendPosition;
  /** The legend is drawn over the plot (its overlap switch cleared). */
  legendOverlay?: boolean;
  dropLines: boolean;
  highLowLines: boolean;
  seriesLines: boolean;
  trendline: ChartTrendline | null;
  /** The series a picked trendline is drawn for (the V2 writers put it on the
   * first series), named beside Linear as Docs always showed it. */
  trendlineSeriesName?: string;
  /** Kinds the data cannot take (a zero or negative value under a log). */
  trendlineUnfittable?: readonly ChartTrendline["type"][];
  




  trendlineOnCategoryAxis?: boolean;
  upDownBars: boolean;
}

export function officeChartElementView(
  attrs: ChartBlockAttrsV2,
): OfficeChartElementView {
  const available = chartElementAvailability(attrs);
  const format = attrs.format ?? {};
  return {
    available: {
      axisX: available.axisX,
      axisY: available.axisY,
      axisSecondaryY: available.axisSecondaryY,
      axisDepth: available.axisDepth,
      axisTitleX: chartSupportsAxisTitle(attrs.chartType, "x"),
      axisTitleY: chartSupportsAxisTitle(attrs.chartType, "y"),
      axisTitleDepth: available.axisDepth,
      gridlines: available.gridlines,
      // A calibrated column / bar chart states them in its layout, every
      // other classic chart with gridlines as `format.minorGridlines*`.
      minorGridlines:
        available.gridlines &&
        (officeChartTakesCalibratedLayouts(attrs.chartType, attrs.chartSubtype) ||
          chartSupportsMinorGridlines(attrs.chartType, attrs.chartSubtype)),
      dataLabels: available.dataLabels,
      dataLabelCallout: available.dataLabelCallout,
      dataTable: available.dataTable,
      errorBars: available.errorBars,
      dropLines: available.dropLines,
      highLowLines: available.highLowLines,
      seriesLines: available.seriesLines,
      trendline: available.trendline,
      upDownBars: available.upDownBars,
    },
    // Office's automatic title is a title shown.
    title: Boolean(attrs.title) || format.automaticTitle === true,
    axisTitleX: Boolean(attrs.axisTitleX),
    axisTitleY: Boolean(attrs.axisTitleY),
    axisTitleDepth: Boolean(format.seriesAxisTitle),
    axisX: chartHasAxis(attrs.chartType, "x") && format.axisX !== false,
    axisY: chartHasAxis(attrs.chartType, "y") && format.axisY !== false,
    axisSecondaryY: available.axisSecondaryY && format.secondaryValueAxis !== false,
    axisDepth: available.axisDepth && format.axisOptions?.series?.hidden !== true,
    gridlinesX: format.gridlinesX === true,
    gridlinesY: format.gridlinesY === true,
    minorGridlinesX:
      format.layout?.minorGridlinesX === true || format.minorGridlinesX === true,
    minorGridlinesY:
      format.layout?.minorGridlinesY === true || format.minorGridlinesY === true,
    dataLabels: chartDataLabelsShown(attrs),
    dataLabelPlacement: chartDataLabelPlacement(attrs),
    dataLabelPlacements: chartDataLabelPlacements(attrs),
    dataLabelAutomatic: available.dataLabelRegionLayouts.length === 0,
    dataLabelCallout: chartDataLabelsShown(attrs) && format.dataLabelCallout === true,
    dataTable: format.dataTable === true,
    dataTableLegendKeys: format.dataTableLegendKeys !== false,
    dataTableBorders: {
      horizontal: format.dataTableHorizontalBorder !== false,
      vertical: format.dataTableVerticalBorder !== false,
      outline: format.dataTableOutline !== false,
    },
    errorBars: format.errorBars?.type ?? null,
    errorBarsState: normalizeChartErrorBars(format.errorBars) ?? null,
    legend: chartLegendShown(attrs),
    legendOverlay: format.legendOverlay === true,
    dropLines: format.dropLines === true,
    highLowLines: format.highLowLines === true,
    seriesLines: format.seriesLines === true,
    trendline: normalizeChartTrendline(format.trendline) ?? null,
    trendlineSeriesName:
      attrs.data.kind === "category" || attrs.data.kind === "xy"
        ? attrs.data.series[0]?.name
        : undefined,
    trendlineUnfittable: chartUnfittableTrendlines(attrs),
    trendlineOnCategoryAxis: attrs.data.kind !== "xy",
    upDownBars: format.upDownBars === true,
  };
}

/**
 * The places a host's own authority can speak for (the worksheet's command
 * ids): each element's submenu, and the rows under it.
 */
export type OfficeChartElementEntryKey =
  | OfficeChartElementId
  | "axisX"
  | "axisY"
  | "axisSecondaryY"
  | "axisDepth"
  | "axisTitleX"
  | "axisTitleY"
  | "axisTitleDepth"
  | "chartTitleOption"
  | "dataLabelsNone"
  | "dataLabelPosition"
  | "dataLabelCallout"
  | "dataTableOption"
  | "errorBarsOption"
  | "gridlinesOption"
  | "legendNone"
  | "legendPosition"
  | "lineOption"
  | "trendlineOption"
  | "upDownBarsOption";

export interface OfficeChartElementEntryState {
  disabled?: boolean;
  reason?: string;
  /** Attributes the host's authority writes on the row (`data-control-id`). */
  dom?: Record<string, unknown>;
}

export interface OfficeChartElementMenuProps {
  locale: string;
  /** The chart as the canvas draws it; null when it cannot be read. */
  attrs: ChartBlockAttrsV2 | null;
  /** What the menu shows; defaults to {@link officeChartElementView}(attrs). */
  view?: OfficeChartElementView | null;
  /** Whether the adapter's writer can carry the element picks below. */
  writable: boolean;
  /** A V2 host's commit: the block with the pick applied. */
  onPick?: (next: ChartBlockAttrsV2 | null) => void;
  /** A host that is not a V2 block (the worksheet) takes each pick as is. */
  onIntent?: (intent: ChartElementIntent) => void;
  /** A host whose title is not a switch (the deck's legacy block: a dialog). */
  chartTitle?: OfficeChartTitleEntry;
  axisTitles?: { x: OfficeChartTitleEntry; y: OfficeChartTitleEntry };
  legend?: {
    disabled: boolean;
    value: OfficeChartLegendPosition;
    onSelect: (position: OfficeChartLegendPosition) => void;
  };
  /** Data Labels ▸ More Data Label Options…, where the model has the dialog. */
  onMoreDataLabelOptions?: () => void;
  /** Every other "More <element> Options…" (Office opens the Format pane on
   * that element); an element without one leaves the row out. */
  moreOptions?: Partial<Record<OfficeChartElementId, () => void>>;
  /** Why Data Labels ▸ Data Callout is not offered (the host's own words). */
  dataCalloutReason?: string;
  /** The model's writer carries a trendline forecast (Trendline ▸ Linear
   * Forecast); without it that row is greyed with the reason. */
  trendlineOptions?: boolean;
  /**
   * Whether the host's writer carries a pick (true for a pick that changes
   * nothing). A host whose writer states fewer elements than the chart can
   * show (the deck's legacy chart) greys the rows it cannot write instead of
   * leaving them live and dead.
   */
  canPick?: (intent: ChartElementIntent) => boolean;
  /** The host's authority for each entry, intersected with the chart's own. */
  entryState?: (
    key: OfficeChartElementEntryKey,
    /** The row within the element, where one row differs (an error amount). */
    row?: string,
  ) => OfficeChartElementEntryState | undefined;
  /** Rows a host adds at the end of one element's submenu. */
  submenuExtras?: Partial<Record<OfficeChartElementId, ReactNode>>;
  /** Host-only commands Office lists after the elements. */
  extras?: ReactNode;
  /** Every entry's test id starts here (the deck's `presentation-chart`). */
  testIdPrefix?: string;
  testIds?: OfficeChartTestIds;
  /** A host that translates the menu's words (the worksheet's catalogue). */
  label?: (key: string) => string | undefined;
  subContentClassName?: string;
}

const LEGEND_POSITIONS: ReadonlyArray<Exclude<OfficeChartLegendPosition, "topRight">> = [
  "none",
  "right",
  "top",
  "left",
  "bottom",
];

/** Every word the menu draws, as its catalogue key, by key. */
const ELEMENT_WORDS: Record<string, string> = {
  axes: "office.chartElements.axes",
  axisTitles: "office.chartElements.axisTitles",
  chartTitle: "office.chartElements.chartTitle",
  dataLabels: "office.chartElements.dataLabels",
  dataTable: "office.chartElements.dataTable",
  errorBars: "office.chartElements.errorBars",
  gridlines: "office.chartElements.gridlines",
  legend: "office.chartElements.legend",
  lines: "office.chartElements.lines",
  trendline: "office.chartElements.trendline",
  upDownBars: "office.chartElements.upDownBars",
  none: "office.chartElements.none",
  automatic: "office.chartElements.automatic",
  primaryHorizontal: "office.chartElements.primaryHorizontal",
  primaryVertical: "office.chartElements.primaryVertical",
  secondaryVertical: "office.chartElements.secondaryVertical",
  depthAxis: "office.chartElements.depthAxis",
  aboveChart: "office.chartElements.aboveChart",
  centeredOverlay: "office.chartElements.centeredOverlay",
  centeredOverlayReason: "office.chartElements.centeredOverlayReason",
  horizontalAxisTitle: "office.chartElements.horizontalAxisTitle",
  verticalAxisTitle: "office.chartElements.verticalAxisTitle",
  depthAxisTitle: "office.chartElements.depthAxisTitle",
  gridlinesMajorHorizontal: "office.chartElements.gridlinesMajorHorizontal",
  gridlinesMajorVertical: "office.chartElements.gridlinesMajorVertical",
  gridlinesMinorHorizontal: "office.chartElements.gridlinesMinorHorizontal",
  gridlinesMinorVertical: "office.chartElements.gridlinesMinorVertical",
  minorGridlinesReason: "office.chartElements.minorGridlinesReason",
  dataCallout: "office.chartElements.dataCallout",
  dataCalloutReason: "office.chartElements.dataCalloutReason",
  withLegendKeys: "office.chartElements.withLegendKeys",
  noLegendKeys: "office.chartElements.noLegendKeys",
  standardError: "office.chartElements.standardError",
  percentage: "office.chartElements.percentage",
  standardDeviation: "office.chartElements.standardDeviation",
  legendRight: "office.chartElements.legendRight",
  legendTopRight: "office.chartElements.legendTopRight",
  legendTop: "office.chartElements.legendTop",
  legendLeft: "office.chartElements.legendLeft",
  legendBottom: "office.chartElements.legendBottom",
  dropLines: "office.chartElements.dropLines",
  highLowLines: "office.chartElements.highLowLines",
  seriesLines: "office.chartElements.seriesLines",
  noForecast: "office.chartElements.noForecast",
  moreAxes: "office.chartElements.moreAxes",
  moreAxisTitles: "office.chartElements.moreAxisTitles",
  moreChartTitle: "office.chartElements.moreChartTitle",
  moreDataLabels: "office.chartElements.moreDataLabels",
  moreDataTable: "office.chartElements.moreDataTable",
  moreErrorBars: "office.chartElements.moreErrorBars",
  moreGridlines: "office.chartElements.moreGridlines",
  moreLegend: "office.chartElements.moreLegend",
  moreTrendline: "office.chartElements.moreTrendline",
  moreUpDownBars: "office.chartElements.moreUpDownBars",
  legendOptions: "office.chartElements.legendOptions",
  legendNoOverlap: "office.chartElements.legendNoOverlap",
  tableBorders: "office.chartElements.tableBorders",
  tableBorderHorizontal: "office.chartElements.tableBorderHorizontal",
  tableBorderVertical: "office.chartElements.tableBorderVertical",
  tableBorderOutline: "office.chartElements.tableBorderOutline",
  rotation3d: "office.chartElements.rotation3d",
  xRotation: "office.chartElements.xRotation",
  yRotation: "office.chartElements.yRotation",
  perspective: "office.chartElements.perspective",
  rightAngleAxes: "office.chartElements.rightAngleAxes",
  autoscale: "office.chartElements.autoscale",
  depthPercent: "office.chartElements.depthPercent",
  heightPercent: "office.chartElements.heightPercent",
  resetRotation: "office.chartElements.resetRotation",
  legendPosition: "office.chartElements.legendPosition",
  labelOptions: "office.chartElements.labelOptions",
  seriesOptions: "office.chartElements.seriesOptions",
  seriesOverlap: "office.chartElements.seriesOverlap",
  gapDepth: "office.chartElements.gapDepth",
  columnShape: "office.chartElements.columnShape",
  columnShapeBox: "office.chartElements.columnShapeBox",
  columnShapePyramid: "office.chartElements.columnShapePyramid",
  columnShapePyramidToMax: "office.chartElements.columnShapePyramidToMax",
  columnShapeCylinder: "office.chartElements.columnShapeCylinder",
  columnShapeCone: "office.chartElements.columnShapeCone",
  columnShapeConeToMax: "office.chartElements.columnShapeConeToMax",
  plotSeriesOn: "office.chartElements.plotSeriesOn",
  primaryAxis: "office.chartElements.primaryAxis",
  secondaryAxis: "office.chartElements.secondaryAxis",
  labelAlignment: "office.chartElements.labelAlignment",
  customAngle: "office.chartElements.customAngle",
  wrapTextInShape: "office.chartElements.wrapTextInShape",
  bubbleScale: "office.chartElements.bubbleScale",
  secondPlotValues: "office.chartElements.secondPlotValues",
  quartileCalculation: "office.chartElements.quartileCalculation",
  quartileInclusive: "office.chartElements.quartileInclusive",
  quartileExclusive: "office.chartElements.quartileExclusive",
  parentLabelOverlapping: "office.chartElements.parentLabelOverlapping",
  parentLabelBanner: "office.chartElements.parentLabelBanner",
  showMeanMarkers: "office.chartElements.showMeanMarkers",
  showInnerPoints: "office.chartElements.showInnerPoints",
  showOutlierPoints: "office.chartElements.showOutlierPoints",
  firstSliceAngle: "office.chartElements.firstSliceAngle",
  pieExplosion: "office.chartElements.pieExplosion",
  doughnutExplosion: "office.chartElements.doughnutExplosion",
  pointExplosion: "office.chartElements.pointExplosion",
  doughnutHoleSize: "office.chartElements.doughnutHoleSize",
  gapWidth: "office.chartElements.gapWidth",
  labelContains: "office.chartElements.labelContains",
  labelPosition: "office.chartElements.labelPosition",
  labelValue: "office.chartElements.labelValue",
  labelSeriesName: "office.chartElements.labelSeriesName",
  labelCategoryName: "office.chartElements.labelCategoryName",
  labelBubbleSize: "office.chartElements.labelBubbleSize",
  labelLegendKey: "office.chartElements.labelLegendKey",
  labelLeaderLines: "office.chartElements.labelLeaderLines",
  labelLastText: "office.chartElements.labelLastText",
  labelShown: "office.chartElements.labelShown",
  labelChartsOwn: "office.chartElements.labelChartsOwn",
  labelMatchChart: "office.chartElements.labelMatchChart",
  labelText: "office.chartElements.labelText",
  separator: "office.chartElements.separator",
  separatorComma: "office.chartElements.separatorComma",
  separatorSemicolon: "office.chartElements.separatorSemicolon",
  separatorSpace: "office.chartElements.separatorSpace",
  separatorNewLine: "office.chartElements.separatorNewLine",
  separatorPeriod: "office.chartElements.separatorPeriod",
  dataTableOptions: "office.chartElements.dataTableOptions",
  showLegendKeys: "office.chartElements.showLegendKeys",
  errorBarOptions: "office.chartElements.errorBarOptions",
  errorAmount: "office.chartElements.errorAmount",
  trendlineOptions: "office.chartElements.trendlineOptions",
  forecast: "office.chartElements.forecast",
  forecastForward: "office.chartElements.forecastForward",
  forecastBackward: "office.chartElements.forecastBackward",
  trendlineOrder: "office.chartElements.trendlineOrder",
  trendlineName: "office.chartElements.trendlineName",
  trendlineNameCustom: "office.chartElements.trendlineNameCustom",
  setIntercept: "office.chartElements.setIntercept",
  errorAmountCustom: "office.chartElements.errorAmountCustom",
  positiveErrorValue: "office.chartElements.positiveErrorValue",
  negativeErrorValue: "office.chartElements.negativeErrorValue",
  forecastUnwritable: "office.chartElements.forecastUnwritable",
  trendlineUnfittable: "office.chartElements.trendlineUnfittable",
  writerCannotCarry: "office.chartElements.writerCannotCarry",
  unavailable: "office.chartElements.unavailable",
};

/** Each element's glyph on its Add Chart Element entry; the rows of its
 * submenu draw their own (OfficeChartElementIcon, one set for the three
 * editors). */
const ELEMENT_ICONS: Record<OfficeChartElementId, OfficeChartElementIconId> = {
  axes: "axes",
  axisTitles: "axisTitles",
  chartTitle: "chartTitle",
  dataLabels: "dataLabels",
  dataTable: "dataTable",
  errorBars: "errorBars",
  gridlines: "gridlines",
  legend: "legend",
  lines: "lines",
  trendline: "trendline",
  upDownBars: "upDownBars",
};

const ERROR_BAR_ICONS: Record<
  (typeof CHART_ELEMENT_ERROR_BAR_RECIPES)[number]["type"],
  OfficeChartElementIconId
> = {
  standardError: "errorBars.standardError",
  percentage: "errorBars.percentage",
  standardDeviation: "errorBars.standardDeviation",
};

/** A submenu row's glyph, before its label as Office draws it. */
function rowIcon(icon: OfficeChartElementIconId | undefined) {
  return icon ? (
    <OfficeChartElementIcon id={icon} className="-my-0.5 mr-2" />
  ) : null;
}

const MORE_WORDS: Record<OfficeChartElementId, string> = {
  axes: "moreAxes",
  axisTitles: "moreAxisTitles",
  chartTitle: "moreChartTitle",
  dataLabels: "moreDataLabels",
  dataTable: "moreDataTable",
  errorBars: "moreErrorBars",
  gridlines: "moreGridlines",
  legend: "moreLegend",
  lines: "moreGridlines",
  trendline: "moreTrendline",
  upDownBars: "moreUpDownBars",
};

/** Deck ids of the "More … Options" rows, one per element. */
const MORE_TEST_IDS: Record<OfficeChartElementId, string> = {
  axes: "presentation-chart-axes-more-options",
  axisTitles: "presentation-chart-axis-titles-more-options",
  chartTitle: "presentation-chart-title-more-options",
  dataLabels: "presentation-chart-data-label-options-open",
  dataTable: "presentation-chart-data-table-more-options",
  errorBars: "presentation-chart-error-bars-more-options",
  gridlines: "presentation-chart-gridlines-more-options",
  legend: "presentation-chart-legend-more-options",
  lines: "presentation-chart-lines-more-options",
  trendline: "presentation-chart-trendline-more-options",
  upDownBars: "presentation-chart-up-down-bars-more-options",
};

/** Whether an element is shown, so its "More … Options" row can scope to it. */
function elementShown(
  view: OfficeChartElementView,
  element: OfficeChartElementId,
): boolean {
  switch (element) {
    case "axes":
      return view.axisX || view.axisY;
    case "axisTitles":
      return view.axisTitleX || view.axisTitleY;
    case "chartTitle":
      return view.title;
    case "dataLabels":
      return view.dataLabels;
    case "dataTable":
      return view.dataTable;
    case "errorBars":
      return view.errorBars !== null;
    case "gridlines":
      return view.gridlinesX || view.gridlinesY;
    case "legend":
      return view.legend !== "none";
    case "lines":
      return view.dropLines || view.highLowLines || view.seriesLines;
    case "trendline":
      return view.trendline !== null;
    case "upDownBars":
      return view.upDownBars;
  }
}

/**
 * Render a host's Add Chart Element entries in Office's order. A host whose
 * writer cannot carry an element leaves it out (or passes it disabled with its
 * reason); `extras` are host-only commands Office lists after the elements.
 */
export function OfficeChartElementMenuEntries({
  entries,
  extras,
  takes,
}: {
  entries: Partial<Record<OfficeChartElementId, ReactNode>>;
  extras?: ReactNode;
  /** The Chart Elements flyout lists only what the chart takes. */
  takes?: (element: OfficeChartElementId) => boolean;
}) {
  return (
    <>
      {OFFICE_CHART_ELEMENT_ORDER.map((element) =>
        entries[element] && (!takes || takes(element)) ? (
          <Fragment key={element}>{entries[element]}</Fragment>
        ) : null,
      )}
      {extras}
    </>
  );
}


/**
 * Add Chart Element, the one menu of the three editors, in
 * {@link OFFICE_CHART_ELEMENT_ORDER}, each element a submenu of Office's own
 * rows (Microsoft Support: Chart Title ▸ None / Above Chart / Centered Overlay
 * / More Title Options; Gridlines ▸ Primary Major Horizontal / Vertical,
 * Primary Minor Horizontal / Vertical / More Gridline Options; Legend ▸ None /
 * Right / Top / Left / Bottom; Lines ▸ None / Drop Lines / High-Low Lines; Up/
 * Down Bars ▸ None / Up/Down Bars; …). A pick is a {@link ChartElementIntent}:
 * a V2 host applies it with the shared element rules, the worksheet maps it
 * onto its own command ids. A row the chart or the host's writer cannot carry
 * stays listed, greyed, with the reason.
 */
export function OfficeChartElementMenuItems(
  props: OfficeChartElementMenuProps,
) {
  const { attrs, writable } = props;
  const t = useTranslations("console-notebooks");
  const quick = useContext(OfficeChartElementQuickContext);
  const word = (key: string) =>
    props.label?.(key) ?? (ELEMENT_WORDS[key] ? t(ELEMENT_WORDS[key]) : key);
  const id = (deckId: string) =>
    hostTestId(deckId, props.testIdPrefix, props.testIds);
  const view =
    props.view !== undefined
      ? props.view
      : attrs
        ? officeChartElementView(attrs)
        : null;
  const emit = (intent: ChartElementIntent) => {
    if (!writable || !view) return;
    if (props.onIntent) {
      props.onIntent(intent);
      return;
    }
    const next = attrs ? chartWithElementIntent(attrs, intent) : null;
    if (next) props.onPick?.(next);
  };
  /** A row's state: the chart takes it, the writer is live, the host's
   * authority agrees and, where the host says which picks its writer can
   * carry (`canPick`), this row's pick is one of them; the reason is the
   * host's first, else the writer's, else the chart's. */
  const entry = (
    key: OfficeChartElementEntryKey,
    available: boolean,
    rowId?: string,
    intent?: ChartElementIntent,
  ) => {
    const host = props.entryState?.(key, rowId);
    const chartTakes = writable && view !== null && available;
    const carried = !chartTakes || !intent || !props.canPick || props.canPick(intent);
    const disabled = !chartTakes || host?.disabled === true || !carried;
    return {
      ...(host?.dom ?? {}),
      disabled,
      title: disabled
        ? (host?.reason ?? word(carried ? "unavailable" : "writerCannotCarry"))
        : host?.reason,
    };
  };
  const subContent = props.subContentClassName;
  const trigger = (
    element: OfficeChartElementId,
    available: boolean,
    testId: string,
  ) => {
    if (quick) return quickTrigger(element, available, testId);
    return (
      <DropdownMenuSubTrigger {...entry(element, available)} data-testid={id(testId)}>
        <OfficeChartElementIcon id={ELEMENT_ICONS[element]} className="-my-0.5" />
        {word(element)}
      </DropdownMenuSubTrigger>
    );
  };
  /**
   * What "More … Options" does first on an element the chart does not show:
   * Office adds the element as its submenu's usual row would (Legend at the
   * right, labels where Office puts them, a linear trendline, Standard Error
   * bars, a data table with legend keys, the chart title above the chart,
   * the primary horizontal axis, title and gridlines) and then opens the
   * Format pane on it. Null when the chart or the host's authority cannot
   * take that row, which keeps the command greyed.
   */
  const showElement = (element: OfficeChartElementId): (() => void) | null => {
    if (!view || !writable) return null;
    const offer = (
      intent: ChartElementIntent,
      key: OfficeChartElementEntryKey,
      available: boolean,
      rowId?: string,
    ) => (entry(key, available, rowId, intent).disabled ? null : () => emit(intent));
    const hostToggle = (hostEntry: OfficeChartTitleEntry | undefined) =>
      hostEntry?.kind === "toggle" && !hostEntry.disabled
        ? () => hostEntry.onToggle(true)
        : null;
    const a = view.available;
    switch (element) {
      case "chartTitle":
        if (props.chartTitle) return hostToggle(props.chartTitle);
        return offer({ element: "chartTitle", on: true, text: word("chartTitle") }, "chartTitleOption", true);
      case "axes":
        return offer({ element: "axis", axis: "x", on: true }, "axisX", a.axisX);
      case "axisTitles":
        if (props.axisTitles) return hostToggle(props.axisTitles.x);
        return offer(
          { element: "axisTitle", axis: "x", on: true, text: word("horizontalAxisTitle") },
          "axisTitleX",
          a.axisTitleX,
        );
      case "dataLabels":
        return offer({ element: "dataLabels", on: true, placement: null }, "dataLabelPosition", a.dataLabels);
      case "dataTable":
        return offer({ element: "dataTable", on: true, legendKeys: true }, "dataTableOption", a.dataTable, "with-keys");
      case "errorBars":
        return offer(
          { element: "errorBars", recipe: CHART_ELEMENT_ERROR_BAR_RECIPES[0] },
          "errorBarsOption",
          a.errorBars,
          CHART_ELEMENT_ERROR_BAR_RECIPES[0].type,
        );
      case "gridlines":
        return offer({ element: "gridlines", axis: "y", on: true }, "gridlinesOption", a.gridlines);
      case "legend":
        if (props.legend)
          return props.legend.disabled ? null : () => props.legend!.onSelect("right");
        return offer({ element: "legend", position: "right" }, "legendPosition", true);
      case "trendline":
        return offer(
          { element: "trendline", trendline: { type: "linear" }, forward: 0 },
          "trendlineOption",
          a.trendline,
          "linear",
        );
      case "upDownBars":
        return offer({ element: "upDownBars", on: true }, "upDownBarsOption", a.upDownBars);
      case "lines":
        return null;
    }
  };
  /**
   * The Chart Elements flyout's check box (Office's + button beside a chart):
   * checked while the chart shows any of the element; a click removes all of
   * it, or adds it as the box adds it -- both primary axes, both axis titles,
   * the title above the chart, labels where Office puts them, a data table
   * with legend keys, Standard Error bars, the value axis's major gridlines,
   * the legend at the right, a linear trendline, drop lines, up/down bars.
   * The rows the host's writer cannot carry are left out of the pick.
   */
  const quickIntents = (element: OfficeChartElementId, on: boolean): ChartElementIntent[] => {
    if (!view) return [];
    const a = view.available;
    const axes = (["x", "y"] as const).filter((axis) => a[axis === "x" ? "axisX" : "axisY"]);
    switch (element) {
      case "axes":
        return [
          ...axes
            .filter((axis) => view[axis === "x" ? "axisX" : "axisY"] !== on)
            .map((axis) => ({ element: "axis" as const, axis, on })),
          // Office's Axes box takes the secondary vertical axis with them.
          ...(a.axisSecondaryY && view.axisSecondaryY !== on ? [{ element: "axis" as const, axis: "y2" as const, on }] : []),
          // And a 3-D chart's depth axis.
          ...(a.axisDepth && Boolean(view.axisDepth) !== on ? [{ element: "axis" as const, axis: "z" as const, on }] : []),
        ];
      case "axisTitles":
        // Office's Axis Titles box takes a 3-D chart's depth axis title too.
        return (["x", "y", "z"] as const)
          .filter((axis) => a[axis === "x" ? "axisTitleX" : axis === "y" ? "axisTitleY" : "axisTitleDepth"])
          .filter((axis) => Boolean(view[axis === "x" ? "axisTitleX" : axis === "y" ? "axisTitleY" : "axisTitleDepth"]) !== on)
          .map((axis) => ({
            element: "axisTitle",
            axis,
            on,
            text: word(axis === "x" ? "horizontalAxisTitle" : axis === "y" ? "verticalAxisTitle" : "depthAxisTitle"),
          }));
      case "chartTitle":
        return [{ element: "chartTitle", on, text: word("chartTitle") }];
      case "dataLabels":
        return [{ element: "dataLabels", on, placement: null }];
      case "dataTable":
        return [{ element: "dataTable", on, legendKeys: true }];
      case "errorBars":
        return [{ element: "errorBars", recipe: on ? CHART_ELEMENT_ERROR_BAR_RECIPES[0] : null }];
      case "gridlines": {
        if (on) {
          // The value axis's: horizontal lines on a column chart, vertical
          // ones on a bar chart.
          const valueAxis = attrs && officeChartAxisRole(attrs, "X") === "value" ? "x" : "y";
          return [{ element: "gridlines", axis: valueAxis, on: true }];
        }
        return (
          [
            ["x", false, view.gridlinesX],
            ["y", false, view.gridlinesY],
            ["x", true, view.minorGridlinesX],
            ["y", true, view.minorGridlinesY],
          ] as const
        )
          .filter(([, , shown]) => shown)
          .map(([axis, minor]) => ({ element: "gridlines", axis, on: false, ...(minor ? { minor } : {}) }));
      }
      case "legend":
        return [{ element: "legend", position: on ? "right" : "none" }];
      case "lines": {
        if (!on) return [{ element: "linesNone" }];
        const line = a.dropLines ? "drop" : a.highLowLines ? "highLow" : a.seriesLines ? "series" : null;
        return line ? [{ element: "line", line, on: true }] : [];
      }
      case "trendline":
        return [on ? { element: "trendline", trendline: { type: "linear" }, forward: 0 } : { element: "trendline", trendline: null }];
      case "upDownBars":
        return [{ element: "upDownBars", on }];
    }
  };
  /** The ribbon row each pick is (the host's authority speaks per row). */
  const quickEntry = (intent: ChartElementIntent): [OfficeChartElementEntryKey, string?] => {
    switch (intent.element) {
      case "axis":
        return [intent.axis === "x" ? "axisX" : "axisY"];
      case "axisTitle":
        return [intent.axis === "x" ? "axisTitleX" : intent.axis === "y" ? "axisTitleY" : "axisTitleDepth"];
      case "chartTitle":
        return ["chartTitleOption"];
      case "dataLabels":
        return [intent.on ? "dataLabelPosition" : "dataLabelsNone"];
      case "dataTable":
        return ["dataTableOption", intent.on ? "with-keys" : undefined];
      case "errorBars":
        return ["errorBarsOption", intent.recipe?.type];
      case "gridlines":
        return ["gridlinesOption"];
      case "legend":
        return [intent.position === "none" ? "legendNone" : "legendPosition"];
      case "line":
      case "linesNone":
        return ["lineOption"];
      case "trendline":
        return ["trendlineOption", intent.trendline ? "linear" : undefined];
      case "upDownBars":
        return ["upDownBarsOption"];
      default:
        return ["chartTitleOption"];
    }
  };
  const quickTakes = (element: OfficeChartElementId): boolean => {
    const a = view?.available;
    if (!a) return false;
    switch (element) {
      case "axes":
        return a.axisX || a.axisY;
      case "axisTitles":
        return a.axisTitleX || a.axisTitleY;
      case "chartTitle":
      case "legend":
        return true;
      case "dataLabels":
        return a.dataLabels;
      case "lines":
        return a.dropLines || a.highLowLines || a.seriesLines;
      default:
        return a[element];
    }
  };
  const quickToggle = (element: OfficeChartElementId): { checked: boolean; toggle: (() => void) | null } => {
    const checked = view ? elementShown(view, element) : false;
    const hostTitle =
      element === "chartTitle"
        ? props.chartTitle
        : element === "axisTitles"
          ? props.axisTitles?.x
          : undefined;
    if (hostTitle) {
      return {
        checked: hostTitle.kind === "toggle" ? hostTitle.checked : checked,
        toggle:
          hostTitle.kind === "toggle" && !hostTitle.disabled && writable
            ? () => hostTitle.onToggle(!hostTitle.checked)
            : null,
      };
    }
    if (element === "legend" && props.legend) {
      const legend = props.legend;
      return {
        checked: legend.value !== "none",
        toggle: legend.disabled || !writable ? null : () => legend.onSelect(legend.value !== "none" ? "none" : "right"),
      };
    }
    const intents = quickIntents(element, !checked).filter((intent) => {
      const [key, rowId] = quickEntry(intent);
      return !entry(key, quickTakes(element), rowId, intent).disabled;
    });
    if (!intents.length || !writable || !view) return { checked, toggle: null };
    return {
      checked,
      toggle: () => {
        // A host that maps picks onto its own commands takes one at a time
        // (its command slot holds one receipt): the box then stays as the
        // chart shows it, and the next click carries the rest.
        if (props.onIntent) {
          props.onIntent(intents[0]);
          return;
        }
        if (!attrs) return;
        let next: ChartBlockAttrsV2 = attrs;
        for (const intent of intents) next = chartWithElementIntent(next, intent) ?? next;
        if (next !== attrs) props.onPick?.(next);
      },
    };
  };
  /** One flyout row: the check box adds or removes the element; the arrow
   * (or a hover, or Right Arrow) opens the element's own options. */
  const quickTrigger = (element: OfficeChartElementId, available: boolean, testId: string) => {
    const { checked, toggle } = quickToggle(element);
    const state = entry(element, available);
    return (
      <DropdownMenuSubTrigger
        {...state}
        role="menuitemcheckbox"
        aria-checked={checked}
        data-quick-element={element}
        data-testid={id(testId)}
        onClick={(event) => {
          // The arrow at the row's end opens the options, as Office's does.
          const box = event.currentTarget.getBoundingClientRect();
          if (!toggle || (box.width > 0 && event.clientX > box.right - 28)) return;
          event.preventDefault();
          toggle();
        }}
        onKeyDown={(event) => {
          if (!toggle || (event.key !== " " && event.key !== "Enter")) return;
          event.preventDefault();
          toggle();
        }}
      >
        <OfficeQuickCheck checked={checked} />
        <OfficeChartElementIcon id={ELEMENT_ICONS[element]} size={18} disabled={!available} />
        <span data-quick-element-label="">{word(element)}</span>
      </DropdownMenuSubTrigger>
    );
  };
  const more = (element: OfficeChartElementId) => {
    const open =
      element === "dataLabels"
        ? (props.moreOptions?.dataLabels ?? props.onMoreDataLabelOptions)
        : props.moreOptions?.[element];
    if (!open) return null;
    const shown = view ? elementShown(view, element) : false;
    const show = shown ? null : showElement(element);
    const disabled = !writable || (!shown && !show);
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={disabled}
          title={disabled ? word("unavailable") : undefined}
          data-testid={id(MORE_TEST_IDS[element])}
          onSelect={() => {
            show?.();
            open();
          }}
        >
          {word(MORE_WORDS[element])}
        </DropdownMenuItem>
      </>
    );
  };
  const extra = (element: OfficeChartElementId) =>
    props.submenuExtras?.[element] ?? null;
  /** A radio row: checked when it is the current pick. */
  const row = (
    key: OfficeChartElementEntryKey,
    available: boolean,
    checked: boolean,
    testId: string,
    label: string,
    intent: ChartElementIntent,
    keepOpen = false,
    rowId?: string,
    icon?: OfficeChartElementIconId,
  ) => (
    <DropdownMenuCheckboxItem
      key={testId}
      {...entry(key, available, rowId, intent)}
      checked={checked}
      onSelect={keepOpen ? (event) => event.preventDefault() : undefined}
      onCheckedChange={() => emit(intent)}
      data-testid={id(testId)}
    >
      {rowIcon(icon)}
      {label}
    </DropdownMenuCheckboxItem>
  );
  /** A title the host owns: a switch, or its dialog. `inSubmenu` lines a
   * dialog row up with the check column of the rows around it. */
  const titleRow = (
    entryValue: OfficeChartTitleEntry,
    label: string,
    testId: string,
    icon: OfficeChartElementIconId,
    inSubmenu: boolean,
  ) =>
    entryValue.kind === "toggle" ? (
      <DropdownMenuCheckboxItem
        checked={entryValue.checked}
        disabled={entryValue.disabled}
        onCheckedChange={(on) => entryValue.onToggle(on === true)}
        data-testid={id(testId)}
      >
        {rowIcon(icon)}
        {label}
      </DropdownMenuCheckboxItem>
    ) : (
      <DropdownMenuItem
        disabled={entryValue.disabled}
        onSelect={entryValue.onOpen}
        data-testid={id(testId)}
        inset={inSubmenu}
      >
        <OfficeChartElementIcon id={icon} className="-my-0.5" />
        {`${label}…`}
      </DropdownMenuItem>
    );
  const available = view?.available;
  const labelsTake = Boolean(available?.dataLabels);
  const linesTake = Boolean(
    available?.dropLines || available?.highLowLines || available?.seriesLines,
  );

  const chartTitleEntry = props.chartTitle;
  const chartTitle =
    chartTitleEntry?.kind === "dialog" ? (
      titleRow(
        chartTitleEntry,
        word("chartTitle"),
        "presentation-chart-element-title",
        ELEMENT_ICONS.chartTitle,
        false,
      )
    ) : (
      <DropdownMenuSub>
        {quick ? (
          quickTrigger("chartTitle", !chartTitleEntry?.disabled, "presentation-chart-element-title")
        ) : (
          <DropdownMenuSubTrigger
            {...entry("chartTitle", !chartTitleEntry?.disabled)}
            data-testid={id("presentation-chart-element-title")}
          >
            <OfficeChartElementIcon id={ELEMENT_ICONS.chartTitle} className="-my-0.5" />
            {word("chartTitle")}
          </DropdownMenuSubTrigger>
        )}
        <DropdownMenuSubContent className={subContent}>
          {(
            [
              ["none", false, "presentation-chart-element-title-none", "chartTitle.none"],
              [
                "aboveChart",
                true,
                "presentation-chart-element-title-above",
                "chartTitle.aboveChart",
              ],
            ] as const
          ).map(([key, on, testId, icon]) => {
            const checked = chartTitleEntry
              ? (chartTitleEntry as { checked: boolean }).checked === on
              : view?.title === on;
            return (
              <DropdownMenuCheckboxItem
                key={key}
                {...entry(
                  "chartTitleOption",
                  !chartTitleEntry?.disabled,
                  undefined,
                  chartTitleEntry ? undefined : { element: "chartTitle", on, text: word("chartTitle") },
                )}
                checked={checked}
                onCheckedChange={() => {
                  if (chartTitleEntry?.kind === "toggle") {
                    chartTitleEntry.onToggle(on);
                  } else {
                    emit({ element: "chartTitle", on, text: word("chartTitle") });
                  }
                }}
                data-testid={id(testId)}
              >
                {rowIcon(icon)}
                {word(key)}
              </DropdownMenuCheckboxItem>
            );
          })}
          <DropdownMenuItem
            disabled
            inset
            title={word("centeredOverlayReason")}
            data-testid={id("presentation-chart-element-title-overlay")}
          >
            <OfficeChartElementIcon id="chartTitle.centeredOverlay" className="-my-0.5" />
            {word("centeredOverlay")}
          </DropdownMenuItem>
          {more("chartTitle")}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );

  const axisTitleRow = (axis: "x" | "y" | "z") => {
    const key = axis === "x" ? "axisTitleX" : axis === "y" ? "axisTitleY" : "axisTitleDepth";
    const testId = `presentation-chart-element-${key}`;
    const label = word(axis === "x" ? "primaryHorizontal" : axis === "y" ? "primaryVertical" : "depthAxis");
    const icon: OfficeChartElementIconId =
      axis === "x" ? "axisTitles.primaryHorizontal" : "axisTitles.primaryVertical";
    const hostEntry = axis === "z" ? undefined : props.axisTitles?.[axis];
    if (hostEntry) return titleRow(hostEntry, label, testId, icon, true);
    return (
      <DropdownMenuCheckboxItem
        {...entry(key, Boolean(available?.[key]), undefined, {
          element: "axisTitle",
          axis,
          on: !view?.[key],
          text: word(axis === "x" ? "horizontalAxisTitle" : axis === "y" ? "verticalAxisTitle" : "depthAxisTitle"),
        })}
        checked={Boolean(view?.[key])}
        onCheckedChange={(on) =>
          emit({
            element: "axisTitle",
            axis,
            on: on === true,
            text: word(axis === "x" ? "horizontalAxisTitle" : axis === "y" ? "verticalAxisTitle" : "depthAxisTitle"),
          })
        }
        data-testid={id(testId)}
      >
        {rowIcon(icon)}
        {label}
      </DropdownMenuCheckboxItem>
    );
  };

  const legendEntry = props.legend;
  const legendValue = legendEntry ? legendEntry.value : (view?.legend ?? "none");
  const legendWord = (position: OfficeChartLegendPosition) =>
    position === "none"
      ? word("none")
      : word(`legend${position[0].toUpperCase()}${position.slice(1)}`);

  return (
    <OfficeChartElementMenuEntries
      entries={{
        axes: (
          <DropdownMenuSub>
            {trigger(
              "axes",
              Boolean(available?.axisX || available?.axisY),
              "presentation-chart-element-axes",
            )}
            <DropdownMenuSubContent className={subContent}>
              {(["x", "y", "y2", "z"] as const).map((axis) => {
                const key = axis === "x" ? "axisX" : axis === "y" ? "axisY" : axis === "y2" ? "axisSecondaryY" : "axisDepth";
                // Secondary Vertical is listed only where the chart draws
                // one, Depth Axis only on a 3-D chart that has one.
                if (axis === "y2" && !available?.axisSecondaryY) return null;
                if (axis === "z" && !available?.axisDepth) return null;
                return (
                  <DropdownMenuCheckboxItem
                    key={axis}
                    {...entry(key, Boolean(available?.[key]), undefined, {
                      element: "axis",
                      axis,
                      on: !view?.[key],
                    })}
                    checked={Boolean(view?.[key])}
                    onCheckedChange={(on) =>
                      emit({ element: "axis", axis, on: on === true })
                    }
                    data-testid={id(`presentation-chart-axis-${axis}`)}
                  >
                    {rowIcon(
                      axis === "x"
                        ? "axes.primaryHorizontal"
                        : "axes.primaryVertical",
                    )}
                    {word(axis === "x" ? "primaryHorizontal" : axis === "y" ? "primaryVertical" : axis === "y2" ? "secondaryVertical" : "depthAxis")}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {extra("axes")}
              {more("axes")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        axisTitles: (
          <DropdownMenuSub>
            {trigger(
              "axisTitles",
              props.axisTitles
                ? !(props.axisTitles.x.disabled && props.axisTitles.y.disabled)
                : Boolean(available?.axisTitleX || available?.axisTitleY),
              "presentation-chart-element-axis-titles",
            )}
            <DropdownMenuSubContent className={subContent}>
              {axisTitleRow("x")}
              {axisTitleRow("y")}
              {available?.axisTitleDepth ? axisTitleRow("z") : null}
              {extra("axisTitles")}
              {more("axisTitles")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        chartTitle,
        dataLabels: (
          <DropdownMenuSub>
            {trigger("dataLabels", labelsTake, "presentation-chart-element-data-labels")}
            <DropdownMenuSubContent className={subContent}>
              {row(
                "dataLabelsNone",
                labelsTake,
                !view?.dataLabels,
                "presentation-chart-data-label-position-none",
                word("none"),
                { element: "dataLabels", on: false, placement: null },
                false,
                undefined,
                "dataLabels.none",
              )}
              {/* A filled map's labels are Office's Map labels tri-state
                  (None / Best fit only / Show all) and have no automatic
                  member; every other family keeps "where Office puts it". */}
              {view?.dataLabelAutomatic !== false
                ? row(
                    "dataLabelPosition",
                    labelsTake,
                    Boolean(
                      view?.dataLabels &&
                        view.dataLabelPlacement === null &&
                        !view.dataLabelCallout,
                    ),
                    "presentation-chart-data-label-position-automatic",
                    word("automatic"),
                    { element: "dataLabels", on: true, placement: null },
                    false,
                    undefined,
                    "dataLabels.automatic",
                  )
                : null}
              {(view?.dataLabelPlacements ?? []).map((placement) =>
                row(
                  "dataLabelPosition",
                  labelsTake,
                  Boolean(view?.dataLabels && view.dataLabelPlacement === placement),
                  `presentation-chart-data-label-position-${placement}`,
                  props.label?.(`placement.${placement}`) ??
                    t(chartDataLabelPlacementName(placement)),
                  { element: "dataLabels", on: true, placement },
                  false,
                  undefined,
                  OFFICE_CHART_DATA_LABEL_ICON_IDS[placement],
                ),
              )}
              {/* Office: "If you want to show your data label inside a text
                  bubble shape, select Data Callout". Written as the labels'
                  callout geometry (`c15:spPr`) on a 2-D classic chart. */}
              {labelsTake && available?.dataLabelCallout ? (
                row(
                  "dataLabelCallout",
                  true,
                  Boolean(view?.dataLabels && view.dataLabelCallout),
                  "presentation-chart-data-label-callout",
                  word("dataCallout"),
                  { element: "dataLabels", on: true, placement: null, callout: true },
                  false,
                  undefined,
                  "dataLabels.callout",
                )
              ) : (
                <DropdownMenuItem
                  disabled
                  inset
                  aria-label={`${word("dataCallout")}: ${props.dataCalloutReason ?? word("dataCalloutReason")}`}
                  data-testid={id("presentation-chart-data-label-callout")}
                >
                  <OfficeChartElementIcon
                    id="dataLabels.callout"
                    className="-my-0.5 self-start"
                  />
                  <span className="note-editor-toolbar-menu__unavailable">
                    <span>{word("dataCallout")}</span>
                    <span
                      className="note-editor-toolbar-menu__unavailable-reason"
                      data-testid={id("presentation-chart-data-label-callout-reason")}
                    >
                      {props.dataCalloutReason ?? word("dataCalloutReason")}
                    </span>
                  </span>
                </DropdownMenuItem>
              )}
              {extra("dataLabels")}
              {more("dataLabels")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        dataTable: (
          <DropdownMenuSub>
            {trigger(
              "dataTable",
              Boolean(available?.dataTable),
              "presentation-chart-element-data-table",
            )}
            <DropdownMenuSubContent className={subContent}>
              {(
                [
                  ["none", "none", false, true, "dataTable.none"],
                  [
                    "with-keys",
                    "withLegendKeys",
                    true,
                    true,
                    "dataTable.withLegendKeys",
                  ],
                  ["no-keys", "noLegendKeys", true, false, "dataTable.noLegendKeys"],
                ] as const
              ).map(([table, key, on, legendKeys, icon]) =>
                row(
                  "dataTableOption",
                  Boolean(available?.dataTable),
                  on
                    ? Boolean(view?.dataTable) &&
                        view?.dataTableLegendKeys === legendKeys
                    : !view?.dataTable,
                  `presentation-chart-data-table-${table}`,
                  word(key),
                  { element: "dataTable", on, legendKeys },
                  false,
                  undefined,
                  icon,
                ),
              )}
              {extra("dataTable")}
              {more("dataTable")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        errorBars: (
          <DropdownMenuSub>
            {trigger(
              "errorBars",
              Boolean(available?.errorBars),
              "presentation-chart-element-error-bars",
            )}
            <DropdownMenuSubContent className={subContent}>
              {row(
                "errorBarsOption",
                Boolean(available?.errorBars),
                view?.errorBars === null || view?.errorBars === undefined,
                "presentation-chart-error-bars-none",
                word("none"),
                { element: "errorBars", recipe: null },
                false,
                undefined,
                "errorBars.none",
              )}
              {CHART_ELEMENT_ERROR_BAR_RECIPES.map((recipe) =>
                row(
                  "errorBarsOption",
                  Boolean(available?.errorBars),
                  view?.errorBars === recipe.type,
                  `presentation-chart-error-bars-${recipe.type}`,
                  word(recipe.type),
                  { element: "errorBars", recipe },
                  false,
                  recipe.type,
                  ERROR_BAR_ICONS[recipe.type],
                ),
              )}
              {extra("errorBars")}
              {more("errorBars")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        gridlines: (
          <DropdownMenuSub>
            {trigger(
              "gridlines",
              Boolean(available?.gridlines),
              "presentation-chart-element-gridlines",
            )}
            <DropdownMenuSubContent className={subContent}>
              {(["y", "x"] as const).map((axis) => (
                <DropdownMenuCheckboxItem
                  key={axis}
                  {...entry("gridlinesOption", Boolean(available?.gridlines), undefined, {
                    element: "gridlines",
                    axis,
                    on: !view?.[axis === "x" ? "gridlinesX" : "gridlinesY"],
                  })}
                  checked={Boolean(view?.[axis === "x" ? "gridlinesX" : "gridlinesY"])}
                  onCheckedChange={(on) =>
                    emit({ element: "gridlines", axis, on: on === true })
                  }
                  data-testid={id(`presentation-chart-gridlines-${axis}`)}
                >
                  {rowIcon(
                    axis === "y"
                      ? "gridlines.primaryMajorHorizontal"
                      : "gridlines.primaryMajorVertical",
                  )}
                  {word(
                    axis === "y"
                      ? "gridlinesMajorHorizontal"
                      : "gridlinesMajorVertical",
                  )}
                </DropdownMenuCheckboxItem>
              ))}
              {(["y", "x"] as const).map((axis) => {
                const minorTakes = Boolean(
                  available?.gridlines && available.minorGridlines,
                );
                const state = entry("gridlinesOption", minorTakes, undefined, {
                  element: "gridlines",
                  axis,
                  on: !view?.[axis === "x" ? "minorGridlinesX" : "minorGridlinesY"],
                  minor: true,
                });
                return (
                  <DropdownMenuCheckboxItem
                    key={`minor-${axis}`}
                    {...state}
                    title={
                      minorTakes ? state.title : word("minorGridlinesReason")
                    }
                    checked={Boolean(
                      view?.[axis === "x" ? "minorGridlinesX" : "minorGridlinesY"],
                    )}
                    onCheckedChange={(on) =>
                      emit({
                        element: "gridlines",
                        axis,
                        on: on === true,
                        minor: true,
                      })
                    }
                    data-testid={id(`presentation-chart-gridlines-minor-${axis}`)}
                  >
                    {rowIcon(
                      axis === "y"
                        ? "gridlines.primaryMinorHorizontal"
                        : "gridlines.primaryMinorVertical",
                    )}
                    {word(
                      axis === "y"
                        ? "gridlinesMinorHorizontal"
                        : "gridlinesMinorVertical",
                    )}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {extra("gridlines")}
              {more("gridlines")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        legend: (
          <DropdownMenuSub>
            {trigger(
              "legend",
              legendEntry ? !legendEntry.disabled : true,
              "presentation-chart-element-legend",
            )}
            <DropdownMenuSubContent className={subContent}>
              {LEGEND_POSITIONS.map((position) => {
                const key = position === "none" ? "legendNone" : "legendPosition";
                const state = entry(
                  key,
                  legendEntry ? !legendEntry.disabled : true,
                  undefined,
                  legendEntry ? undefined : { element: "legend", position },
                );
                return (
                  <DropdownMenuCheckboxItem
                    key={position}
                    {...state}
                    checked={legendValue === position}
                    onCheckedChange={() => {
                      if (legendEntry) {
                        if (!legendEntry.disabled) legendEntry.onSelect(position);
                      } else emit({ element: "legend", position });
                    }}
                    data-testid={id(`presentation-chart-legend-${position}`)}
                  >
                    {rowIcon(`legend.${position}`)}
                    {legendWord(position)}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {extra("legend")}
              {more("legend")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        lines: (
          <DropdownMenuSub>
            {trigger("lines", linesTake, "presentation-chart-element-lines")}
            <DropdownMenuSubContent className={subContent}>
              {row(
                "lineOption",
                linesTake,
                !view?.dropLines && !view?.highLowLines && !view?.seriesLines,
                "presentation-chart-lines-none",
                word("none"),
                { element: "linesNone" },
                false,
                undefined,
                "lines.none",
              )}
              {(
                [
                  ["drop", "dropLines", "lines.drop"],
                  ["highLow", "highLowLines", "lines.highLow"],
                  ["series", "seriesLines", "lines.series"],
                ] as const satisfies ReadonlyArray<
                  readonly [
                    ChartElementLine,
                    keyof OfficeChartElementView["available"],
                    OfficeChartElementIconId,
                  ]
                >
              ).map(([line, key, icon]) => (
                <DropdownMenuCheckboxItem
                  key={line}
                  {...entry("lineOption", Boolean(available?.[key]), undefined, {
                    element: "line",
                    line,
                    on: !view?.[key],
                  })}
                  checked={Boolean(view?.[key])}
                  onCheckedChange={(on) =>
                    emit({ element: "line", line, on: on === true })
                  }
                  data-testid={id(`presentation-chart-lines-${line}`)}
                >
                  {rowIcon(icon)}
                  {word(key)}
                </DropdownMenuCheckboxItem>
              ))}
              {extra("lines")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        trendline: (
          <DropdownMenuSub>
            {trigger(
              "trendline",
              Boolean(available?.trendline),
              "presentation-chart-element-trendline",
            )}
            <DropdownMenuSubContent className={subContent}>
              {row(
                "trendlineOption",
                Boolean(available?.trendline),
                !view?.trendline,
                "presentation-chart-trendline-none",
                word("none"),
                { element: "trendline", trendline: null },
                false,
                undefined,
                "trendline.none",
              )}
              {/* Office's rows (Word, Excel, PowerPoint): Linear,
                  Exponential, Linear Forecast, Two Period Moving Average.
                  The other kinds, the equation, R-squared and any forecast
                  are More Trendline Options' Format Trendline pane. */}
              {CHART_ELEMENT_TRENDLINE_MENU.map((menuRow) => {
                // A forecast needs a writer that states one (`c:forward`).
                const forecastUnwritable =
                  menuRow.forward > 0 && props.trendlineOptions !== true;
                // A kind the data cannot take is greyed with the reason, as
                // Office greys it, never a row that checks and draws nothing.
                const unfittable =
                  view?.trendlineUnfittable?.includes(menuRow.trendline.type) === true;
                const state = entry(
                  "trendlineOption",
                  Boolean(available?.trendline) && !forecastUnwritable && !unfittable,
                  menuRow.id,
                  { element: "trendline", trendline: menuRow.trendline, forward: menuRow.forward },
                );
                return (
                  <DropdownMenuCheckboxItem
                    key={menuRow.id}
                    {...state}
                    title={
                      forecastUnwritable && available?.trendline
                        ? word("forecastUnwritable")
                        : unfittable && available?.trendline
                          ? word("trendlineUnfittable")
                          : state.title
                    }
                    checked={chartTrendlineMenuRow(view?.trendline) === menuRow.id}
                    onCheckedChange={() =>
                      emit({
                        element: "trendline",
                        trendline: menuRow.trendline,
                        forward: menuRow.forward,
                      })
                    }
                    data-testid={id(`presentation-chart-trendline-${menuRow.id}`)}
                  >
                    {rowIcon(OFFICE_CHART_TRENDLINE_MENU_ICON_IDS[menuRow.id])}
                    {menuRow.id === "linear" && view?.trendlineSeriesName
                      ? t("office.chartElements.trendlineWithSeries", {
                          label:
                            props.label?.(`trendline.${menuRow.id}`) ??
                            t(CHART_TRENDLINE_MENU_NAMES[menuRow.id]),
                          series: view.trendlineSeriesName,
                        })
                      : (props.label?.(`trendline.${menuRow.id}`) ??
                        t(CHART_TRENDLINE_MENU_NAMES[menuRow.id]))}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {extra("trendline")}
              {more("trendline")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
        upDownBars: (
          <DropdownMenuSub>
            {trigger(
              "upDownBars",
              Boolean(available?.upDownBars),
              "presentation-chart-element-up-down-bars",
            )}
            <DropdownMenuSubContent className={subContent}>
              {row(
                "upDownBarsOption",
                Boolean(available?.upDownBars),
                !view?.upDownBars,
                "presentation-chart-up-down-bars-none",
                word("none"),
                { element: "upDownBars", on: false },
                false,
                undefined,
                "upDownBars.none",
              )}
              {row(
                "upDownBarsOption",
                Boolean(available?.upDownBars),
                Boolean(view?.upDownBars),
                "presentation-chart-up-down-bars-shown",
                word("upDownBars"),
                { element: "upDownBars", on: true },
                false,
                undefined,
                "upDownBars.shown",
              )}
              {extra("upDownBars")}
              {more("upDownBars")}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ),
      }}
      extras={props.extras}
      takes={quick ? quickTakes : undefined}
    />
  );
}

/** What a data label shows (Office's Label Contains, Separator and Show
 * Leader Lines on the Format Data Labels pane). */
export interface OfficeChartDataLabelContentsDraft {
  readonly dataLabelValue: boolean;
  readonly dataLabelLegendKey: boolean;
  readonly dataLabelCategoryName: boolean;
  readonly dataLabelSeriesName: boolean;
  readonly dataLabelPercentage: boolean;
  readonly dataLabelBubbleSize: boolean;
  readonly dataLabelSeparator: ChartDataLabelSeparator;
  readonly dataLabelLeaderLines: boolean;
}

/** The data label contents a host can write: Office keeps them on the
 * Format Data Labels pane, and each change applies at once. */
export interface OfficeChartDataLabelContents {
  readonly format: ChartBlockAttrsV2["format"];
  readonly chartType: ChartBlockAttrsV2["chartType"];
  readonly chartSubtype: ChartBlockAttrsV2["chartSubtype"];
  readonly onChange: (contents: OfficeChartDataLabelContentsDraft) => boolean;
}

export interface OfficeChartElementPaneContext {
  readonly locale: string;
  /** The host's `console-notebooks` translator: the page's words are catalogue keys. */
  readonly translate: (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  readonly view: OfficeChartElementView;
  readonly writable: boolean;
  readonly disabledReason?: string;
  /** The same intent the Add Chart Element menu emits for the same pick. */
  readonly onIntent: (intent: ChartElementIntent) => void;
  readonly label?: (key: string) => string | undefined;
  readonly trendlineOptions?: boolean;
  readonly dataLabelContents?: OfficeChartDataLabelContents;
  /** The chart itself, for the pages that address one of its series or
   * points (Format Data Labels on a series or one label). */
  readonly attrs?: ChartBlockAttrsV2;
  /** The host's writer carries Series Options (Series Overlap, Gap Width:
   * the `seriesOptions` pick); without it a series page has only its labels. */
  readonly seriesOptions?: boolean;
  /** With `seriesOptions`, the host's reader and writer also carry a 100%
   * stacked column / bar chart's own Series Overlap and Gap Width
   * (`format.barOverlap` / `format.barGapWidth`); without it that chart's
   * series page has only its labels. */
  readonly barSpacingOptions?: boolean;
  /** The host's writer carries a pie's Series Options (Angle of first
   * slice, Explosion, Doughnut Hole Size) and a slice's Point Explosion. */
  readonly pieOptions?: boolean;
  /** The host's writer carries Custom ▸ Specify Value error amounts
   * (`c:plus` / `c:minus` literals); without it Custom stays greyed. */
  readonly customErrorAmounts?: boolean;
}

const BLANKS_WORDS: Record<ChartDisplayBlanksAs, OfficeChartDesignWord> = {
  gap: "blanksGap",
  zero: "blanksZero",
  span: "blanksSpan",
};

/**
 * Select Data Source ▸ Hidden and Empty Cells ▸ Show empty cells as, as a
 * Data group menu: Gaps, Zero, Connect data points with line, the chart's
 * current method checked, only the methods its family takes listed, and the
 * menu greyed with the reason for a family that draws every blank as zero.
 * One `displayBlanksAs` intent, applied by the host as its other element
 * intents are.
 */
export function officeChartHiddenEmptyCellsMenu(
  attrs: ChartBlockAttrsV2,
  ctx: {
    translate: (key: string) => string;
    labels?: Partial<Record<OfficeChartDesignWord, string>>;
    onIntent: (intent: ChartElementIntent) => void;
    disabled?: boolean;
    disabledReason?: string;
    controlId?: string;
    occurrenceId?: string;
  },
): OfficeChartDesignMenu {
  const word = (key: OfficeChartDesignWord) => ctx.labels?.[key] ?? ctx.translate(DESIGN_WORDS[key]);
  const options = chartDisplayBlanksOptions(attrs);
  const shown = chartDisplayBlanksShown(attrs);
  const forced = options.length === 0;
  return {
    disabled: Boolean(ctx.disabled) || forced,
    disabledReason: ctx.disabled ? ctx.disabledReason : forced ? word("blanksForcedZero") : undefined,
    controlId: ctx.controlId,
    occurrenceId: ctx.occurrenceId,
    items: options.map((method) => (
      <DropdownMenuCheckboxItem
        key={method}
        checked={shown === method}
        data-testid={`office-chart-hidden-empty-cells-${method}`}
        onSelect={() => ctx.onIntent({ element: "displayBlanksAs", value: method })}
      >
        {word(BLANKS_WORDS[method])}
      </DropdownMenuCheckboxItem>
    )),
  };
}

/**
 * The series or point a Current Selection entry names, when its labels can
 * be stated on their own: `series:N` is series N's labels; a pie's
 * `slice:N` is the first series' point N (its one series' slices); another
 * chart's `point:N:P` is series N's point P (a second click on it).
 * Null for a filled map, whose region labels are the chart's alone.
 */
export function officeChartLabelTarget(
  area: string,
  attrs: ChartBlockAttrsV2 | undefined,
): ChartDataLabelTarget | null {
  if (!attrs) return null;
  const available = chartElementAvailability(attrs);
  if (!available.dataLabels || available.dataLabelRegionLayouts.length) return null;
  const series = /^series:(\d+)$/.exec(area);
  if (series) return { seriesIndex: Number(series[1]) };
  const slice = /^slice:(\d+)$/.exec(area);
  if (slice && attrs.chartType === "pie") return { seriesIndex: 0, pointIndex: Number(slice[1]) };
  // One point's label, selected by a second click on it (`chart-hit`): on
  // a pie, a point of a series past the first (a doughnut's outer ring).
  const point = officeChartPointArea(area);
  if (point && (attrs.chartType !== "pie" || point.seriesIndex > 0)) return point;
  return null;
}

const LABEL_TEXT_KEYS = [
  "dataLabelValue",
  "dataLabelSeriesName",
  "dataLabelCategoryName",
  "dataLabelPercentage",
  "dataLabelBubbleSize",
] as const;

/**
 * Format Data Labels on one series or on one label (Office: select the
 * series or click a label twice, then Format Data Labels): the same Label
 * Options page as the chart's, stating that target's own labels over the
 * chart's -- shown or not, what they contain, where they sit, a label's
 * typed words -- and a row that hands them back to the chart's.
 */
function officeChartTargetLabelPage(
  attrs: ChartBlockAttrsV2,
  target: ChartDataLabelTarget,
  ctx: OfficeChartElementPaneContext,
  word: (key: string) => string,
): { title: string; sections: OfficeShapeFormatPaneSection[] } {
  const t = ctx.translate;
  const disabled = !ctx.writable;
  const reason = disabled ? ctx.disabledReason : undefined;
  const base = { disabled, disabledReason: reason };
  const statement = chartDataLabelStatementOf(attrs, target);
  const own = chartDataLabelOverrideOf(attrs, target);
  const send = (patch: ChartDataLabelOverridePatch | null) =>
    ctx.onIntent({ element: "dataLabelOverride", target, patch });
  const data = attrs.data as {
    series?: readonly { name?: string }[];
    categories?: readonly string[];
  };
  const seriesName = data.series?.[target.seriesIndex]?.name ?? "";
  const pointName =
    target.pointIndex !== undefined ? (data.categories?.[target.pointIndex] ?? "") : "";
  const sections: OfficeShapeFormatPaneSection[] = [
    {
      id: "label-shown",
      fields: [
        {
          kind: "checkbox",
          id: "element-target-label-shown",
          label: word("labelShown"),
          checked: statement.dataLabels,
          ...base,
          onChange: (checked) => send({ dataLabels: checked }),
        },
      ],
    },
  ];
  if (statement.dataLabels) {
    const bubble =
      attrs.chartType === "xy" &&
      (attrs.chartSubtype === "bubble" || attrs.chartSubtype === "bubble3d");
    const takes: Record<string, boolean> = {
      dataLabelValue: true,
      dataLabelSeriesName: true,
      dataLabelCategoryName: attrs.chartType !== "xy",
      dataLabelPercentage: attrs.chartType === "pie",
      dataLabelBubbleSize: bubble,
      dataLabelLegendKey: true,
    };
    const shownText = LABEL_TEXT_KEYS.filter((key) => statement[key]).length;
    const box = (
      key: (typeof LABEL_TEXT_KEYS)[number] | "dataLabelLegendKey",
      labelKey: string,
    ): OfficeShapeFormatPaneField | null => {
      if (!takes[key]) return null;
      const lastText =
        (LABEL_TEXT_KEYS as readonly string[]).includes(key) && statement[key] && shownText === 1;
      return {
        kind: "checkbox",
        id: `element-target-label-${labelKey}`,
        label: word(labelKey),
        checked: statement[key],
        disabled: disabled || lastText,
        disabledReason: lastText ? word("labelLastText") : reason,
        onChange: (checked) => send({ [key]: checked }),
      };
    };
    sections.push({
      id: "label-contains",
      title: word("labelContains"),
      fields: [
        box("dataLabelValue", "labelValue"),
        box("dataLabelSeriesName", "labelSeriesName"),
        box("dataLabelCategoryName", "labelCategoryName"),
        box("dataLabelPercentage", "percentage"),
        box("dataLabelBubbleSize", "labelBubbleSize"),
        box("dataLabelLegendKey", "labelLegendKey"),
        {
          kind: "select" as const,
          id: "element-target-label-separator",
          label: word("separator"),
          value: statement.dataLabelSeparator ?? ", ",
          options: DATA_LABEL_SEPARATOR_WORDS.map(([value, key]) => ({
            value,
            label: word(key),
          })),
          ...base,
          ...(shownText < 2 ? { disabled: true } : {}),
          onChange: (value: string) =>
            send({ dataLabelSeparator: value as ChartDataLabelSeparator }),
        },
      ].filter((field): field is OfficeShapeFormatPaneField => field !== null),
    });
    const positions = chartDataLabelPositions(attrs.chartType, attrs.chartSubtype);
    if (positions.length) {
      sections.push({
        id: "label-position",
        title: word("labelPosition"),
        fields: [
          {
            kind: "select",
            id: "element-target-label-position",
            label: word("labelPosition"),
            value: own?.dataLabelPosition ?? "",
            options: [
              { value: "", label: word("labelChartsOwn") },
              ...positions.map((placement) => ({
                value: placement,
                label:
                  ctx.label?.(`placement.${placement}`) ??
                  t(chartDataLabelPlacementName(placement)),
              })),
            ],
            ...base,
            onChange: (value) =>
              send({ dataLabelPosition: (value || undefined) as ChartDataLabelPosition | undefined }),
          },
        ],
      });
    }
    if (target.pointIndex !== undefined) {
      sections.push({
        id: "label-text",
        title: word("labelText"),
        fields: [
          {
            kind: "text",
            id: "element-target-label-text",
            label: word("labelText"),
            value: statement.text ?? "",
            placeholder: pointName,
            maxLength: MAX_CHART_TEXT_CHARS,
            ...base,
            onCommit: (raw) => {
              const text = raw.trim();
              if ((text || undefined) !== own?.text) send({ text: text || undefined });
              return true;
            },
          },
        ],
      });
    }
  }
  if (own) {
    sections.push({
      id: "label-match",
      fields: [
        {
          kind: "buttons",
          id: "element-target-label-match",
          label: word("labelMatchChart"),
          buttons: [
            {
              id: "match",
              label: word("labelMatchChart"),
              onSelect: () => send(null),
              disabled,
            },
          ],
        },
      ],
    });
  }
  const name = pointName ? `${seriesName} · ${pointName}` : seriesName;
  return { title: name ? `${word("labelOptions")} · ${name}` : word("labelOptions"), sections };
}

const DATA_LABEL_SEPARATOR_WORDS: ReadonlyArray<readonly [ChartDataLabelSeparator, string]> = [
  [", ", "separatorComma"],
  ["; ", "separatorSemicolon"],
  [" ", "separatorSpace"],
  ["\n", "separatorNewLine"],
  [". ", "separatorPeriod"],
];

/**
 * Office's options page of a chart element on the Format pane (Format Legend
 * > Legend Options, Format Data Labels > Label Options, Format Data Table >
 * Data Table Options, Format Error Bars > Error Bar Options, Format Trendline
 * > Trendline Options): the SAME picks the Add Chart Element submenu offers,
 * through the same intents, so a "More <element> Options…" row lands on a
 * page that agrees with the menu in all three editors. Null for an element
 * whose page has only Fill & Line, Effects and Size (a title, gridlines,
 * up/down bars, the chart and plot areas) and for the axes, whose page is
 * the shared Axis Options.
 */
/**
 * Format Data Series ▸ Series Options that the model states as one field
 * each (`ChartFormatOption`): a bubble chart's Scale bubble size to, a box
 * plot's Quartile Calculation, means and points and Gap Width, a treemap's
 * Label Options (None, Overlapping, Banner), and a histogram's, pareto's or
 * waterfall's Gap Width (Microsoft Support, "Create a box and whisker chart",
 * "Create a treemap chart in Office", "Create a histogram", "Create a
 * waterfall chart").
 */
function officeChartSeriesFormatFields(
  attrs: ChartBlockAttrsV2,
  word: (key: string) => string,
  base: { disabled: boolean; disabledReason: string | undefined },
  formatOption: (option: ChartFormatOption) => void,
): OfficeShapeFormatPaneField[] {
  const format = attrs.format ?? {};
  const percent = (
    id: string,
    label: string,
    value: number,
    low: number,
    high: number,
    write: (value: number) => void,
  ): OfficeShapeFormatPaneField => ({
    kind: "number",
    id,
    label,
    value,
    min: low,
    max: high,
    step: 1,
    unit: "%",
    ...base,
    onCommit: (raw) => {
      const amount = Number(String(raw).replace(/%$/, "").trim());
      if (!Number.isInteger(amount) || amount < low || amount > high) return false;
      write(amount);
      return true;
    },
  });
  if (attrs.chartType === "xy" && (attrs.chartSubtype === "bubble" || attrs.chartSubtype === "bubble3d")) {
    return [
      percent("element-series-bubble-scale", word("bubbleScale"), format.bubbleScale ?? 100, 0, 300, (value) =>
        formatOption({ key: "bubbleScale", value: value === 100 ? null : value }),
      ),
    ];
  }
  if (attrs.chartType === "statistical" && attrs.chartSubtype === "boxWhisker") {
    const box = format.boxWhisker ?? {};
    const write = (patch: Partial<ChartBoxWhisker>) => {
      const next: Record<string, unknown> = { ...box, ...patch };
      for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
      formatOption({ key: "boxWhisker", value: Object.keys(next).length ? (next as ChartBoxWhisker) : null });
    };
    // What the box states, else what it draws (inclusive, outliers shown).
    const flag = (key: "meanMarkers" | "innerPoints" | "outlierPoints", label: string): OfficeShapeFormatPaneField => ({
      kind: "checkbox",
      id: `element-series-box-${key}`,
      label,
      checked: box[key] ?? key === "outlierPoints",
      ...base,
      onChange: (checked) => write({ [key]: checked }),
    });
    return [
      percent("element-series-box-gap-width", word("gapWidth"), box.gapWidth ?? 100, 0, 500, (value) =>
        write({ gapWidth: value === 100 ? undefined : value }),
      ),
      flag("meanMarkers", word("showMeanMarkers")),
      flag("innerPoints", word("showInnerPoints")),
      flag("outlierPoints", word("showOutlierPoints")),
      {
        kind: "select",
        id: "element-series-box-quartile",
        label: word("quartileCalculation"),
        value: box.quartileMethod ?? "inclusive",
        options: [
          { value: "inclusive", label: word("quartileInclusive") },
          { value: "exclusive", label: word("quartileExclusive") },
        ],
        ...base,
        onChange: (value) => write({ quartileMethod: value === "exclusive" ? "exclusive" : "inclusive" }),
      },
    ];
  }
  if (chartTakesParentLabelLayout(attrs.chartType, attrs.chartSubtype)) {
    // Label Options: where a top-level branch's name goes. Overlapping is
    // Excel's insert default and the key left off.
    return [
      {
        kind: "select",
        id: "element-series-treemap-parent-labels",
        label: word("labelOptions"),
        value: format.parentLabelLayout ?? "overlapping",
        options: [
          { value: "none", label: word("none") },
          { value: "overlapping", label: word("parentLabelOverlapping") },
          { value: "banner", label: word("parentLabelBanner") },
        ],
        ...base,
        onChange: (value) =>
          formatOption({
            key: "parentLabelLayout",
            value: value === "banner" || value === "none" ? value : null,
          }),
      },
    ];
  }
  const chartExGap =
    attrs.chartType === "waterfall"
      ? 50
      : attrs.chartType === "statistical" && (attrs.chartSubtype === "histogram" || attrs.chartSubtype === "pareto")
        ? 0
        : null;
  if (chartExGap !== null) {
    return [
      percent("element-series-chartex-gap-width", word("gapWidth"), format.gapWidth ?? chartExGap, 0, 500, (value) =>
        formatOption({ key: "gapWidth", value: value === chartExGap ? null : value }),
      ),
    ];
  }
  return [];
}

/**
 * Format Trendline's fields for the chart's trendline or, on Format Data
 * Series, for that series' own (Office bases a trendline on the series
 * picked; a series page also offers None). Every editor's pane builds them
 * here; the host writes the intents its Add Chart Element menu emits.
 */
function officeChartTrendlineFields(
  trendline: ChartTrendline | null | undefined,
  ctx: OfficeChartElementPaneContext,
  word: (key: string) => string,
  seriesIndex?: number,
): OfficeShapeFormatPaneField[] {
  const t = ctx.translate;
  const { view } = ctx;
  const disabled = !ctx.writable;
  const reason = disabled ? ctx.disabledReason : undefined;
  const base = { disabled, disabledReason: reason };
  const series = seriesIndex === undefined ? {} : { seriesIndex };
  const fields: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: "element-trendline-type",
      label: word("trendlineOptions"),
      value: trendline?.type ?? (seriesIndex === undefined ? "linear" : "none"),
      options: [
        ...(seriesIndex === undefined ? [] : [{ value: "none", label: word("none") }]),
        ...CHART_ELEMENT_TRENDLINES.map((entry) => ({
        value: entry.type,
        label:
          ctx.label?.(`trendline.${entry.type}`) ??
          t(CHART_TRENDLINE_NAMES[entry.type]),
        ...(view.trendlineUnfittable?.includes(entry.type)
          ? { disabled: true, title: word("trendlineUnfittable") }
          : {}),
        })),
      ],
      ...base,
      onChange: (value) => {
        if (value === "none") {
          ctx.onIntent({ element: "trendline", trendline: null, ...series });
          return;
        }
        const next = CHART_ELEMENT_TRENDLINES.find((entry) => entry.type === value);
        if (next) ctx.onIntent({ element: "trendline", trendline: next, ...series });
      },
    },
  ];
  if (ctx.trendlineOptions) {
    const takesOptions = chartTrendlineTakesOptions(trendline);
    const optionState = {
      disabled: disabled || !takesOptions,
      disabledReason: reason,
    };
    const option = (change: ChartTrendlineOptionChange) =>
      ctx.onIntent({ element: "trendlineOption", change, ...series });
    const whole = (key: "order" | "period", min: number, max: number): OfficeShapeFormatPaneField => ({
      kind: "number",
      id: `element-trendline-${key}`,
      label: key === "order" ? word("trendlineOrder") : t("spreadsheet.chartTrendlinePeriod"),
      value: String((trendline as Record<string, unknown> | null)?.[key] ?? min),
      min,
      max,
      step: 1,
      ...base,
      onCommit: (raw) => {
        const value = Number(String(raw).trim());
        if (!Number.isInteger(value) || value < min || value > max) return false;
        option(key === "order" ? { key, order: value } : { key, period: value });
        return true;
      },
    });
    // Polynomial ▸ Order (2..6); Moving Average ▸ Period (2..255).
    if (trendline?.type === "polynomial") fields.push(whole("order", 2, 6));
    if (trendline?.type === "movingAverage") fields.push(whole("period", 2, 255));
    // Trendline Name: Automatic, or Custom with its own words.
    fields.push(
      {
        kind: "select",
        id: "element-trendline-name-kind",
        label: word("trendlineName"),
        value: trendline?.name ? "custom" : "automatic",
        ...base,
        disabled: disabled || !trendline,
        options: [
          { value: "automatic", label: word("automatic") },
          { value: "custom", label: word("trendlineNameCustom") },
        ],
        onChange: (value) =>
          option({ key: "name", name: value === "custom" ? (trendline?.name ?? word("trendline")) : null }),
      },
      ...(trendline?.name
        ? [
            {
              kind: "text" as const,
              id: "element-trendline-name",
              label: word("trendlineNameCustom"),
              value: trendline.name,
              maxLength: 255,
              ...base,
              onCommit: (raw: string) => {
                if (!raw.trim()) return false;
                if (raw !== trendline.name) option({ key: "name", name: raw });
                return true;
              },
            },
          ]
        : []),
    );
    const halfPeriodBackward = view.trendlineOnCategoryAxis === true;
    const forecast = (key: "forward" | "backward"): OfficeShapeFormatPaneField => ({
      kind: "number",
      id: `element-trendline-${key}`,
      label: `${word("forecast")} · ${word(key === "forward" ? "forecastForward" : "forecastBackward")}`,
      value: String(trendline?.[key] ?? 0),
      min: 0,
      // Off a scatter chart Backward stops at the plot's edge, half a
      // period before the first category; a larger entry takes that.
      ...(halfPeriodBackward && key === "backward" ? { max: 0.5, step: 0.1 } : { step: 1 }),
      ...optionState,
      onCommit: (raw) => {
        const value = Number(String(raw).trim());
        if (String(raw).trim() === "" || !Number.isFinite(value) || value < 0) return false;
        option({ key, periods: halfPeriodBackward && key === "backward" ? Math.min(value, 0.5) : value });
        return true;
      },
    });
    fields.push(forecast("forward"), forecast("backward"));
    // Set Intercept: a linear, polynomial or exponential trendline.
    const interceptable = ["linear", "polynomial", "exponential"].includes(trendline?.type ?? "");
    fields.push({
      kind: "checkbox",
      id: "element-trendline-set-intercept",
      label: word("setIntercept"),
      checked: trendline?.intercept !== undefined,
      disabled: disabled || !interceptable,
      disabledReason: reason,
      onChange: (checked) =>
        option({ key: "intercept", value: checked ? (trendline?.type === "exponential" ? 1 : 0) : null }),
    });
    if (trendline?.intercept !== undefined) {
      fields.push({
        kind: "number",
        id: "element-trendline-intercept",
        label: word("setIntercept"),
        value: String(trendline.intercept),
        step: 0.1,
        ...base,
        onCommit: (raw) => {
          const value = Number(String(raw).trim());
          if (String(raw).trim() === "" || !Number.isFinite(value)) return false;
          option({ key: "intercept", value });
          return true;
        },
      });
    }
    for (const key of Object.keys(CHART_TRENDLINE_OPTION_NAMES) as ChartTrendlineOptionKey[]) {
      fields.push({
        kind: "checkbox",
        id: `element-trendline-${key}`,
        label: t(CHART_TRENDLINE_OPTION_NAMES[key]),
        checked: trendline?.[key] === true,
        ...optionState,
        onChange: (checked) =>
          ctx.onIntent({ element: "trendlineOption", change: { key, on: checked }, ...series }),
      });
    }
  }
  return fields;
}

export function officeChartElementOptionPage(
  area: string,
  ctx: OfficeChartElementPaneContext,
): { title: string; sections: OfficeShapeFormatPaneSection[] } | null {
  const t = ctx.translate;
  const word = (key: string) =>
    ctx.label?.(key) ?? (ELEMENT_WORDS[key] ? t(ELEMENT_WORDS[key]) : key);
  const { view } = ctx;
  const disabled = !ctx.writable;
  const reason = disabled ? ctx.disabledReason : undefined;
  const base = { disabled, disabledReason: reason };
  const formatOption = (option: ChartFormatOption) => ctx.onIntent({ element: "formatOption", option });
  const labelTarget = officeChartLabelTarget(area, ctx.attrs);
  if (labelTarget && ctx.attrs) {
    const labels = officeChartTargetLabelPage(ctx.attrs, labelTarget, ctx, word);
    if (ctx.attrs.chartType === "pie" && (ctx.seriesOptions || ctx.pieOptions)) {
      // Format Data Series / Data Point of a pie or doughnut: Angle of first
      // slice, the series' explosion or the point's, Doughnut Hole Size.
      const pie = ctx.attrs;
      const doughnut = pie.chartSubtype === "doughnut";
      const point = labelTarget.pointIndex;
      const pointExplosion =
        point === undefined
          ? 0
          : (pie.format?.sliceStyles?.find(
              (style) => style.pointIndex === point && (style.seriesIndex ?? 0) === labelTarget.seriesIndex,
            )?.explosion ?? 0);
      const whole = (
        id: string,
        label: string,
        value: number,
        min: number,
        max: number,
        unit: string,
        write: (value: number) => ChartElementIntent,
      ): OfficeShapeFormatPaneField => ({
        kind: "number",
        id,
        label,
        value: String(value),
        min,
        max,
        step: 1,
        unit,
        ...base,
        onCommit: (raw) => {
          const next = Number(String(raw).replace(/[%°]$/, "").trim());
          if (!Number.isInteger(next) || next < min || next > max) return false;
          ctx.onIntent(write(next));
          return true;
        },
      });
      const fields: OfficeShapeFormatPaneField[] = [];
      if (pie.chartSubtype === "pie2d" || doughnut) {
        fields.push(
          whole("element-pie-first-slice-angle", word("firstSliceAngle"), pie.format?.firstSliceAngle ?? 0, 0, 360, "°", (value) => ({
            element: "pieOptions",
            firstSliceAngle: value,
          })),
        );
      }
      fields.push(
        point === undefined
          ? whole(
              "element-pie-explosion",
              word(doughnut ? "doughnutExplosion" : "pieExplosion"),
              pie.format?.pieExplosion ?? 0,
              0,
              400,
              "%",
              (value) => ({ element: "pieOptions", pieExplosion: value }),
            )
          : whole("element-point-explosion", word("pointExplosion"), pointExplosion, 0, 400, "%", (value) => ({
              element: "pointExplosion",
              seriesIndex: labelTarget.seriesIndex,
              pointIndex: point,
              explosion: value,
            })),
      );
      if (doughnut) {
        fields.push(
          whole("element-doughnut-hole-size", word("doughnutHoleSize"), pie.format?.doughnutHoleSize ?? 50, 10, 90, "%", (value) => ({
            element: "pieOptions",
            doughnutHoleSize: value,
          })),
        );
      }
      // A pie of pie's or bar of pie's Split Series By ▸ Position: Values in
      // second plot (blank: Office's automatic split).
      if (point === undefined && (pie.chartSubtype === "pieOfPie" || pie.chartSubtype === "barOfPie")) {
        fields.push({
          kind: "number",
          id: "element-of-pie-split",
          label: word("secondPlotValues"),
          value: pie.format?.ofPieSplitPosition ?? "",
          placeholder: word("automatic"),
          min: 1,
          max: 255,
          step: 1,
          ...base,
          onCommit: (raw) => {
            const text = String(raw).trim();
            const count = text === "" ? null : Number(text);
            if (count !== null && (!Number.isInteger(count) || count < 1 || count > 255)) return false;
            formatOption({ key: "ofPieSplitPosition", value: count });
            return true;
          },
        });
      }
      return {
        title: word("seriesOptions"),
        sections: [{ id: "pie-series-options", title: word("seriesOptions"), fields }, ...labels.sections],
      };
    }
    // A column or bar series: Format Data Series' Series Options (Series
    // Overlap, Gap Width) above its labels' options.
    const options =
      labelTarget.pointIndex === undefined &&
      ctx.seriesOptions &&
      (ctx.barSpacingOptions || !chartSpacingInOwnKeys(ctx.attrs))
        ? chartSeriesOptions(ctx.attrs)
        : null;
    // The series' own trendline, below its other options.
    const trendline: OfficeShapeFormatPaneSection[] =
      labelTarget.pointIndex === undefined &&
      ctx.trendlineOptions &&
      chartElementAvailability(ctx.attrs).trendline
        ? [
            {
              id: "series-trendline",
              title: word("trendline"),
              fields: officeChartTrendlineFields(
                chartSeriesTrendline(ctx.attrs, labelTarget.seriesIndex),
                ctx,
                word,
                labelTarget.seriesIndex,
              ),
            },
          ]
        : [];
    // Series Options ▸ Plot Series On: Primary Axis or Secondary Axis.
    const plottedOn =
      labelTarget.pointIndex === undefined && ctx.seriesOptions
        ? chartSeriesPlottedOn(ctx.attrs, labelTarget.seriesIndex)
        : null;
    const plotOn: OfficeShapeFormatPaneField[] = plottedOn
      ? [
          {
            kind: "select",
            id: "element-series-axis",
            label: word("plotSeriesOn"),
            value: plottedOn,
            options: [
              { value: "primary", label: word("primaryAxis") },
              { value: "secondary", label: word("secondaryAxis") },
            ],
            ...base,
            onChange: (value) =>
              ctx.onIntent({
                element: "seriesAxis",
                seriesIndex: labelTarget.seriesIndex,
                axis: value === "secondary" ? "secondary" : "primary",
              }),
          },
        ]
      : [];
    const ownFields =
      labelTarget.pointIndex === undefined && ctx.seriesOptions
        ? officeChartSeriesFormatFields(ctx.attrs, word, base, formatOption)
        : [];
    // A 3-D chart's Series Options, as Excel's pane lists them: Column shape
    // (of this series), Gap Depth and Gap Width (of the chart); no Series
    // Overlap, which a 3-D group has none of.
    const options3D =
      labelTarget.pointIndex === undefined && ctx.seriesOptions
        ? chart3DSeriesOptions(ctx.attrs, labelTarget.seriesIndex)
        : null;
    if (options3D) {
      const commit3D = (change: { gapDepth?: number; gapWidth?: number }) => (raw: string) => {
        const value = Number(String(raw).replace(/%$/, "").trim());
        if (!Number.isFinite(value)) return false;
        const key = Object.keys(change)[0] as "gapDepth" | "gapWidth";
        ctx.onIntent({ element: "seriesOptions", [key]: value });
        return true;
      };
      const shapeWords: Record<ChartBarShape, string> = {
        box: "columnShapeBox",
        pyramid: "columnShapePyramid",
        pyramidToMax: "columnShapePyramidToMax",
        cylinder: "columnShapeCylinder",
        cone: "columnShapeCone",
        coneToMax: "columnShapeConeToMax",
      };
      const fields3D: OfficeShapeFormatPaneField[] = [
        ...plotOn,
        ...(options3D.barShape !== undefined
          ? [
              {
                kind: "select" as const,
                id: "element-series-column-shape",
                label: word("columnShape"),
                value: options3D.barShape,
                // Excel's order: Box, Full and Partial Pyramid, Cylinder,
                // Full and Partial Cone.
                options: (["box", "pyramid", "pyramidToMax", "cylinder", "cone", "coneToMax"] as const).map((shape) => ({
                  value: shape,
                  label: word(shapeWords[shape]),
                })),
                ...base,
                onChange: (value: string) =>
                  ctx.onIntent({
                    element: "seriesOptions",
                    barShape: value as ChartBarShape,
                    seriesIndex: labelTarget.seriesIndex,
                  }),
              },
            ]
          : []),
        {
          kind: "number",
          id: "element-series-gap-depth",
          label: word("gapDepth"),
          value: String(options3D.gapDepth),
          min: 0,
          max: 500,
          step: 1,
          unit: "%",
          ...base,
          onCommit: commit3D({ gapDepth: 0 }),
        },
        ...(options3D.gapWidth !== undefined
          ? [
              {
                kind: "number" as const,
                id: "element-series-gap-width",
                label: word("gapWidth"),
                value: String(options3D.gapWidth),
                min: 0,
                max: 500,
                step: 1,
                unit: "%",
                ...base,
                onCommit: commit3D({ gapWidth: 0 }),
              },
            ]
          : []),
        ...ownFields,
      ];
      const seriesName3D =
        (ctx.attrs.data as { series?: readonly { name?: string }[] }).series?.[labelTarget.seriesIndex]?.name ?? "";
      return {
        title: seriesName3D ? `${word("seriesOptions")} · ${seriesName3D}` : word("seriesOptions"),
        sections: [
          { id: "series-options", title: word("seriesOptions"), fields: fields3D },
          ...labels.sections,
          ...trendline,
        ],
      };
    }
    if (!options) {
      const seriesFields = [...plotOn, ...ownFields];
      return {
        ...labels,
        sections: [
          ...(seriesFields.length ? [{ id: "series-options", title: word("seriesOptions"), fields: seriesFields }] : []),
          ...labels.sections,
          ...trendline,
        ],
      };
    }
    const seriesName =
      (ctx.attrs.data as { series?: readonly { name?: string }[] }).series?.[labelTarget.seriesIndex]?.name ?? "";
    const percent = (
      key: "overlap" | "gapWidth",
      id: string,
      labelKey: string,
      min: number,
      max: number,
    ): OfficeShapeFormatPaneField => ({
      kind: "number",
      id,
      label: word(labelKey),
      value: String(options[key]),
      min,
      max,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const value = Number(String(raw).replace(/%$/, "").trim());
        if (!Number.isFinite(value)) return false;
        ctx.onIntent({ element: "seriesOptions", [key]: value });
        return true;
      },
    });
    return {
      title: seriesName ? `${word("seriesOptions")} · ${seriesName}` : word("seriesOptions"),
      sections: [
        {
          id: "series-options",
          title: word("seriesOptions"),
          fields: [
            ...plotOn,
            percent("overlap", "element-series-overlap", "seriesOverlap", -100, 100),
            percent("gapWidth", "element-series-gap-width", "gapWidth", 0, 500),
          ],
        },
        ...labels.sections,
        ...trendline,
      ],
    };
  }
  // Format Error Bars on another series than the first (`errorBarStyle:N`,
  // Excel's "Series N Y Error Bars" in Current Selection): that series' own.
  const errorBarSeries = /^errorBarStyle:([1-9])$/.exec(area);
  const errorBarSeriesIndex = errorBarSeries ? Number(errorBarSeries[1]) : 0;
  switch (errorBarSeries ? "errorBarStyle" : area) {
    case "legendStyle":
      return {
        title: word("legendOptions"),
        sections: [
          {
            id: "legend-options",
            title: word("legendPosition"),
            fields: [
              {
                kind: "select",
                id: "element-legend-position",
                label: word("legendPosition"),
                value: view.legend === "none" ? "right" : view.legend,
                // Format Legend ▸ Legend Position also offers Top Right.
                options: [...LEGEND_POSITIONS.filter((position) => position !== "none"), "topRight" as const].map(
                  (position) => ({
                    value: position,
                    label: word(`legend${position[0].toUpperCase()}${position.slice(1)}`),
                  }),
                ),
                ...base,
                onChange: (value) =>
                  ctx.onIntent({
                    element: "legend",
                    position: value as OfficeChartLegendPosition,
                  }),
              },
              {
                // Checked by default: the plot leaves the legend its room.
                kind: "checkbox",
                id: "element-legend-no-overlap",
                label: word("legendNoOverlap"),
                checked: view.legendOverlay !== true,
                ...base,
                disabled: disabled || view.legend === "none",
                onChange: (checked) => ctx.onIntent({ element: "legendOverlay", overlay: !checked }),
              },
            ],
          },
        ],
      };
    case "dataLabelStyle": {
      const sections: OfficeShapeFormatPaneSection[] = [];
      const contents = ctx.dataLabelContents;
      if (contents) {
        const format = contents.format ?? {};
        const current = {
          dataLabelValue: format.dataLabelValue !== false,
          dataLabelLegendKey: format.dataLabelLegendKey === true,
          dataLabelCategoryName: format.dataLabelCategoryName === true,
          dataLabelSeriesName: format.dataLabelSeriesName === true,
          dataLabelPercentage: format.dataLabelPercentage === true,
          dataLabelBubbleSize: format.dataLabelBubbleSize === true,
          dataLabelSeparator: format.dataLabelSeparator ?? ", ",
          dataLabelLeaderLines: format.dataLabelLeaderLines === true,
        };
        const textKeys = [
          "dataLabelValue",
          "dataLabelSeriesName",
          "dataLabelCategoryName",
          "dataLabelPercentage",
          "dataLabelBubbleSize",
        ] as const;
        const shownText = textKeys.filter((key) => current[key]).length;
        const bubble =
          contents.chartType === "xy" &&
          (contents.chartSubtype === "bubble" || contents.chartSubtype === "bubble3d");
        const takes: Record<string, boolean> = {
          dataLabelValue: true,
          dataLabelSeriesName: true,
          dataLabelCategoryName: contents.chartType !== "xy",
          dataLabelPercentage: contents.chartType === "pie",
          dataLabelBubbleSize: bubble,
          dataLabelLegendKey: true,
          dataLabelLeaderLines:
            format.dataLabelPosition === "outsideEnd" &&
            chartSupportsDataLabelLeaderLines(contents.chartType, contents.chartSubtype),
        };
        const box = (
          key: keyof typeof current & string,
          labelKey: string,
        ): OfficeShapeFormatPaneField | null => {
          if (!takes[key]) return null;
          const lastText =
            (textKeys as readonly string[]).includes(key) &&
            current[key as (typeof textKeys)[number]] === true &&
            shownText === 1;
          return {
            kind: "checkbox",
            id: `element-label-${labelKey}`,
            label: word(labelKey),
            checked: current[key] === true,
            disabled: disabled || lastText,
            disabledReason: lastText ? word("labelLastText") : reason,
            onChange: (checked) => {
              contents.onChange({ ...current, [key]: checked });
            },
          };
        };
        sections.push({
          id: "label-contains",
          title: word("labelContains"),
          fields: [
            box("dataLabelValue", "labelValue"),
            box("dataLabelSeriesName", "labelSeriesName"),
            box("dataLabelCategoryName", "labelCategoryName"),
            box("dataLabelPercentage", "percentage"),
            box("dataLabelBubbleSize", "labelBubbleSize"),
            box("dataLabelLegendKey", "labelLegendKey"),
            box("dataLabelLeaderLines", "labelLeaderLines"),
            {
              kind: "select" as const,
              id: "element-label-separator",
              label: word("separator"),
              value: current.dataLabelSeparator,
              options: DATA_LABEL_SEPARATOR_WORDS.map(([value, key]) => ({
                value,
                label: word(key),
              })),
              ...base,
              // A separator stands between two texts; with one there is
              // nothing to separate (PPT-B098).
              ...(shownText < 2 ? { disabled: true } : {}),
              onChange: (value: string) =>
                contents.onChange({
                  ...current,
                  dataLabelSeparator: value as ChartDataLabelSeparator,
                }),
            },
          ].filter((field): field is OfficeShapeFormatPaneField => field !== null),
        });
      }
      const placements = view.dataLabelPlacements ?? [];
      if (placements.length || view.dataLabelAutomatic !== false) {
        sections.push({
          id: "label-position",
          title: word("labelPosition"),
          fields: [
            {
              kind: "select",
              id: "element-label-position",
              label: word("labelPosition"),
              value: view.dataLabelPlacement ?? "",
              options: [
                ...(view.dataLabelAutomatic !== false
                  ? [{ value: "", label: word("automatic") }]
                  : []),
                ...placements.map((placement) => ({
                  value: placement,
                  label:
                    ctx.label?.(`placement.${placement}`) ??
                    t(chartDataLabelPlacementName(placement)),
                })),
              ],
              ...base,
              onChange: (value) =>
                ctx.onIntent({
                  element: "dataLabels",
                  on: true,
                  placement: (value || null) as ChartDataLabelPlacement | null,
                }),
            },
          ],
        });
      }
      // Size & Properties ▸ Alignment: Custom angle and Wrap text in shape.
      if (ctx.attrs && chartElementAvailability(ctx.attrs).dataLabels) {
        const format = ctx.attrs.format ?? {};
        sections.push({
          id: "label-alignment",
          title: word("labelAlignment"),
          fields: [
            {
              kind: "number",
              id: "element-label-rotation",
              label: word("customAngle"),
              value: format.dataLabelRotation ?? 0,
              min: -90,
              max: 90,
              step: 1,
              unit: "°",
              ...base,
              onCommit: (raw) => {
                const angle = Number(String(raw).replace(/°$/, "").trim());
                if (!Number.isInteger(angle) || Math.abs(angle) > 90) return false;
                formatOption({ key: "dataLabelRotation", value: angle === 0 ? null : angle });
                return true;
              },
            },
            {
              kind: "checkbox",
              id: "element-label-wrap",
              label: word("wrapTextInShape"),
              checked: format.dataLabelWrap !== false,
              ...base,
              onChange: (checked) => formatOption({ key: "dataLabelWrap", value: checked }),
            },
          ],
        });
      }
      return sections.length ? { title: word("labelOptions"), sections } : null;
    }
    case "chartAreaStyle": {
      // Format Chart Area ▸ Effects ▸ 3-D Rotation of a 3-D chart, as Excel's
      // pane lays it out: X Rotation (the turn, the file's `rotY`, 0..359°),
      // Y Rotation (the tilt, `rotX`: -90..90°, a pie 0..90°), Perspective
      // (shown in degrees, kept in half degrees: Office's 30 is its 15°; none
      // under Right Angle Axes), Right Angle Axes, Autoscale, Depth and
      // Height (% of base; Height only without Autoscale), Default Rotation.
      if (!ctx.attrs || !chartTakesView3D(ctx.attrs.chartType, ctx.attrs.chartSubtype)) return null;
      const view3D = effectiveChartView3D(ctx.attrs);
      const pie = ctx.attrs.chartType === "pie";
      const tiltLow = pie ? 0 : -90;
      const degrees = (value: string, low: number, high: number): number | null => {
        const number = Number(value.trim().replace(/[°%]$/, ""));
        return Number.isFinite(number) && number >= low && number <= high ? Math.round(number) : null;
      };
      return {
        title: word("rotation3d"),
        sections: [
          {
            id: "chart-3d-rotation",
            title: word("rotation3d"),
            fields: [
              {
                kind: "number",
                id: "element-3d-rotation-x",
                label: word("xRotation"),
                value: view3D.rotY % 360,
                min: 0,
                max: 359,
                step: 10,
                unit: "°",
                ...base,
                onCommit: (value) => {
                  const rotY = degrees(value, 0, 359);
                  if (rotY === null) return false;
                  ctx.onIntent({ element: "view3D", view: { rotY } });
                  return true;
                },
              },
              {
                kind: "number",
                id: "element-3d-rotation-y",
                label: word("yRotation"),
                value: view3D.rotX,
                min: tiltLow,
                max: 90,
                step: 10,
                unit: "°",
                ...base,
                onCommit: (value) => {
                  const rotX = degrees(value, tiltLow, 90);
                  if (rotX === null) return false;
                  ctx.onIntent({ element: "view3D", view: { rotX } });
                  return true;
                },
              },
              {
                kind: "number",
                id: "element-3d-rotation-perspective",
                label: word("perspective"),
                value: view3D.perspective / 2,
                min: 0,
                max: 120,
                step: 5,
                unit: "°",
                ...base,
                ...(view3D.rightAngleAxes ? { disabled: true } : {}),
                onCommit: (value) => {
                  const half = degrees(value, 0, 120);
                  if (half === null) return false;
                  ctx.onIntent({ element: "view3D", view: { perspective: half * 2 } });
                  return true;
                },
              },
              {
                kind: "checkbox",
                id: "element-3d-rotation-right-angle-axes",
                label: word("rightAngleAxes"),
                checked: view3D.rightAngleAxes,
                ...base,
                onChange: (checked) =>
                  ctx.onIntent({ element: "view3D", view: { rightAngleAxes: checked } }),
              },
              {
                kind: "checkbox",
                id: "element-3d-rotation-autoscale",
                label: word("autoscale"),
                checked: view3D.heightPercent === undefined,
                ...base,
                onChange: (checked) =>
                  ctx.onIntent({ element: "view3D", view: { heightPercent: checked ? undefined : 100 } }),
              },
              {
                kind: "number",
                id: "element-3d-rotation-depth",
                label: word("depthPercent"),
                value: view3D.depthPercent ?? 100,
                min: 20,
                max: 2000,
                step: 10,
                unit: "%",
                ...base,
                onCommit: (value) => {
                  const depthPercent = degrees(value, 20, 2000);
                  if (depthPercent === null) return false;
                  ctx.onIntent({ element: "view3D", view: { depthPercent } });
                  return true;
                },
              },
              {
                kind: "number",
                id: "element-3d-rotation-height",
                label: word("heightPercent"),
                value: view3D.heightPercent ?? 100,
                min: 5,
                max: 500,
                step: 10,
                unit: "%",
                ...base,
                ...(view3D.heightPercent === undefined ? { disabled: true } : {}),
                onCommit: (value) => {
                  const heightPercent = degrees(value, 5, 500);
                  if (heightPercent === null) return false;
                  ctx.onIntent({ element: "view3D", view: { heightPercent } });
                  return true;
                },
              },
              {
                kind: "buttons",
                id: "element-3d-rotation-reset",
                label: word("resetRotation"),
                buttons: [
                  {
                    id: "reset",
                    label: word("resetRotation"),
                    disabled: base.disabled,
                    onSelect: () => ctx.onIntent({ element: "view3D", view: null }),
                  },
                ],
              },
            ],
          },
        ],
      };
    }
    case "dataTableStyle":
      return {
        title: word("dataTableOptions"),
        sections: [
          {
            id: "data-table-options",
            title: word("dataTableOptions"),
            fields: [
              {
                kind: "checkbox",
                id: "element-data-table-legend-keys",
                label: word("showLegendKeys"),
                checked: view.dataTableLegendKeys,
                ...base,
                onChange: (checked) =>
                  ctx.onIntent({ element: "dataTable", on: true, legendKeys: checked }),
              },
            ],
          },
          ...(view.dataTableBorders
            ? [
                {
                  // Format Data Table ▸ Table Borders (Excel's order).
                  id: "data-table-borders",
                  title: word("tableBorders"),
                  fields: (["horizontal", "vertical", "outline"] as const).map(
                    (side): OfficeShapeFormatPaneField => ({
                      kind: "checkbox",
                      id: `element-data-table-border-${side}`,
                      label: word(`tableBorder${side[0].toUpperCase()}${side.slice(1)}`),
                      checked: view.dataTableBorders![side],
                      ...base,
                      onChange: (checked) => ctx.onIntent({ element: "dataTableBorders", [side]: checked }),
                    }),
                  ),
                },
              ]
            : []),
        ],
      };
    case "errorBarStyle": {
      // Format Error Bars ▸ Vertical Error Bar: Direction, End Style and
      // Error Amount (Fixed value, Percentage, Standard deviation(s),
      // Standard error, Custom ▸ Specify Value: each point's Positive and
      // Negative Error Value, one value standing for every point as Excel's
      // default ={1} does).
      const bars =
        errorBarSeriesIndex > 0
          ? (normalizeChartErrorBars(
              ctx.attrs?.format?.seriesErrorBars?.find((entry) => entry.seriesIndex === errorBarSeriesIndex)?.errorBars,
            ) ?? null)
          : (view.errorBarsState ?? null);
      const write = (patch: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...(bars ?? { type: "standardError" }), ...patch };
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
        if (next.type === "standardError" || next.type === "custom") delete next.value;
        if (next.type !== "custom") {
          delete next.plus;
          delete next.minus;
        }
        ctx.onIntent({
          element: "errorBars",
          recipe: next as unknown as ChartElementErrorBars,
          ...(errorBarSeriesIndex > 0 ? { seriesIndex: errorBarSeriesIndex } : {}),
        });
      };
      const amountDefaults: Record<string, number> = { fixed: 1, percentage: 5, standardDeviation: 1 };
      const amountFields: OfficeShapeFormatPaneField[] = [
        {
          kind: "select",
          id: "element-error-direction",
          label: t("spreadsheet.chartErrorBarsDirection"),
          value: bars?.include ?? "both",
          ...base,
          disabled: disabled || !bars,
          options: [
            { value: "both", label: t("spreadsheet.chartErrorBarsBoth") },
            { value: "minus", label: t("spreadsheet.chartErrorBarsMinus") },
            { value: "plus", label: t("spreadsheet.chartErrorBarsPlus") },
          ],
          onChange: (value) => write({ include: value === "both" ? undefined : value }),
        },
        {
          kind: "select",
          id: "element-error-end-style",
          label: t("spreadsheet.chartErrorBarsEndStyle"),
          value: bars?.noEndCap ? "noCap" : "cap",
          ...base,
          disabled: disabled || !bars,
          options: [
            { value: "noCap", label: t("spreadsheet.chartErrorBarsNoCap") },
            { value: "cap", label: t("spreadsheet.chartErrorBarsCap") },
          ],
          onChange: (value) => write({ noEndCap: value === "noCap" ? true : undefined }),
        },
        {
          kind: "select",
          id: "element-error-amount",
          label: word("errorAmount"),
          value: bars?.type ?? (errorBarSeriesIndex > 0 ? "" : (view.errorBars ?? "")),
          ...base,
          options: [
            ...(bars ? [] : [{ value: "", label: word("none") }]),
            { value: "fixed", label: t("spreadsheet.chartErrorBarsFixed") },
            { value: "percentage", label: word("percentage") },
            { value: "standardDeviation", label: word("standardDeviation") },
            { value: "standardError", label: word("standardError") },
            {
              value: "custom",
              label: word("errorAmountCustom"),
              ...(ctx.customErrorAmounts || bars?.type === "custom" ? {} : { disabled: true }),
            },
          ],
          onChange: (value) => {
            if (!value) return;
            if (value === "custom") {
              if (bars?.type !== "custom") write({ type: "custom", plus: [1], minus: [1] });
              return;
            }
            write({ type: value, value: value === "standardError" ? undefined : (bars && "value" in bars ? bars.value : amountDefaults[value]) });
          },
        },
      ];
      if (bars?.type === "custom") {
        // The values as Excel's Custom Error Bars box lists them: comma
        // separated, one per point (or one for every point).
        const list = (key: "plus" | "minus", label: string): OfficeShapeFormatPaneField => ({
          kind: "text",
          id: `element-error-custom-${key}`,
          label,
          value: bars[key].join(", "),
          maxLength: 4000,
          ...base,
          onCommit: (raw) => {
            const text = raw.trim();
            const values = text === "" ? [] : text.split(/[,;\s]+/).filter(Boolean).map(Number);
            if (values.some((value) => !Number.isFinite(value) || value < 0)) return false;
            if (!values.length && !bars[key === "plus" ? "minus" : "plus"].length) return false;
            write({ [key]: values });
            return true;
          },
        });
        amountFields.push(list("plus", word("positiveErrorValue")), list("minus", word("negativeErrorValue")));
      } else if (bars && bars.type !== "standardError") {
        amountFields.push({
          kind: "number",
          id: "element-error-value",
          label: t("spreadsheet.chartErrorBarsValue"),
          value: String(bars.value),
          min: 0,
          step: bars.type === "percentage" ? 1 : 0.1,
          unit: bars.type === "percentage" ? "%" : undefined,
          ...base,
          onCommit: (raw) => {
            const value = Number(String(raw).trim());
            if (String(raw).trim() === "" || !Number.isFinite(value) || value < 0 || (value === 0 && bars.type !== "fixed")) return false;
            write({ value });
            return true;
          },
        });
      }
      return {
        title: word("errorBarOptions"),
        sections: [
          {
            id: "error-bar-options",
            title: word("errorAmount"),
            fields: amountFields,
          },
        ],
      };
    }
    case "trendlineStyle": {
      const trendline = view.trendline;
      const fields = officeChartTrendlineFields(view.trendline, ctx, word);
      return {
        title: word("trendlineOptions"),
        sections: [{ id: "trendline-options", title: word("trendlineOptions"), fields }],
      };
    }
    default:
      return null;
  }
}
