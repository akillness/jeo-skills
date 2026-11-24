"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { officeWordArtGalleryRecipesForAccents } from "@mrnote/core/web/lib/office-wordart-gallery.ts";
import type { OfficeChartHit } from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import {
  chartFormatWithDataLabelContents,
  chartWithElementIntent,
} from "@mrnote/core/web/lib/office-charts/chart-elements.ts";
import { withOfficeChartAxisOptions } from "@mrnote/core/web/lib/office-charts/axis-options.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeChartColorPaletteMenuItems } from "@mrnote/core/web/components/office-ribbon/OfficeChartColorPaletteMenu.tsx";
import {
  chartColorPaletteId,
  chartTakesColorPalette,
  chartThemeAccents,
  chartWithColorPalette,
} from "@mrnote/core/web/lib/office-charts/chart-color-palettes.ts";
import { OfficeChartTypeMenuItems } from "@mrnote/core/web/components/office-ribbon/OfficeChartTypeMenu.tsx";
import { presentationChartTypeGroups } from "../../../../lib/presentation-chart-menu";
import { presentationChartOwnThemeAccents } from "../../../../lib/presentation-chart-theme-accents";
import {
  DocumentChartFormatRibbon,
  type DocumentChartAreaStyleKey,
} from "@mrnote/core/web/components/console/editor/native-document/DocumentChartFormatRibbon.tsx";
import { DocumentChartStyleGallery, DocumentChartStylePreview } from "@mrnote/docs/web/components/console/editor/native-document/DocumentChartStyleGallery.tsx";
import { DropdownMenuItem, DropdownMenuSeparator } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  OfficeAllChartsDialog,
  OfficeChartTemplateSaveDialog,
} from "@mrnote/core/web/components/office-ribbon/OfficeAllChartsDialog.tsx";
import {
  CHART_INSERT_ENHANCEMENT_FAMILIES,
  CHART_INSERT_OFFICE_FAMILIES,
} from "@mrnote/core/web/components/office-ribbon/OfficeChartInsertGallery.tsx";
import { applyChartTemplate, MAX_CHART_TEMPLATE_NAME_LENGTH } from "@mrnote/core/web/lib/office-charts/chart-templates.ts";
import {
  officeUserChartTemplateCommands,
  saveOfficeChartTemplate,
  useOfficeChartTemplates,
} from "@mrnote/core/web/lib/office-charts/chart-template-store.ts";
import type { ChartNativeLook } from "@mrnote/core/web/lib/office-chart-native-look.ts";
import { DocumentChartSelectDataDialog } from "@mrnote/docs/web/components/console/editor/native-document/DocumentChartSelectDataDialog.tsx";
import {
  DOCUMENT_CHART_STYLES,
  documentChartStyleAttrs,
  excelChartStyleNumber,
} from "@mrnote/core/web/components/console/editor/native-document/documentChartStyles.ts";
import {
  type ChartBlockAttrsV2,
  type ChartFamily,
  type ChartSubtype,
  type ChartBlockFormat,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import type { DocumentChartWorkbook } from "@mrnote/core/web/components/console/editor/extensions/documentChartWorkbook.ts";
import { calculateDocumentChartWorkbookSettled } from "@mrnote/core/web/components/console/editor/extensions/documentChartWorkbookCalculation.ts";
import {
  presentationChartAreaStyle,
  setPresentationChartAreaStyle,
  presentationChartQuickLayout,
  presentationChartRowsColumnsSwitched,
  changePresentationChartType,
  presentationChartPaintStyle,
  presentationChartEffectStyle,
  presentationChartTitleTextStyle,
} from "@mrnote/core/web/lib/presentation-chart-desktop.ts";
import { officeShapeStyleRecipes } from "@mrnote/core/web/lib/office-shape-style-catalog.ts";
import type { PresentationChartAreaStyle } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import styles from "./PresentationChartContextRibbon.module.css";
import {
  OfficeChartDesignRibbon,
  OfficeChartElementMenuItems,
} from "@mrnote/core/web/components/office-ribbon/OfficeChartDesignRibbon.tsx";
import {
  OfficeChartQuickButtons,
  officeChartFilterNames,
  type OfficeChartStylesSlot,
} from "@mrnote/core/web/components/office-ribbon/OfficeChartQuickButtons.tsx";
import { PRESENTATION_GEOMETRY_MAX_EMU } from "@mrnote/core/web/lib/presentation-geometry-limit.ts";
import { OfficeChartQuickLayoutGallery } from "@mrnote/core/web/components/office-ribbon/OfficeChartQuickLayoutPreview.tsx";
import { OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  officeChartActiveQuickLayout,
  officeChartQuickLayoutCalibrated,
} from "@mrnote/core/web/lib/office-charts/quick-layout.ts";
import {
  officeChartCombinationRows,
  officeChartTypeRefusal,
  officeChartWithCombination,
} from "@mrnote/core/web/lib/office-charts/chart-type.ts";
import { OfficeChartComboDialog } from "@mrnote/core/web/components/office-ribbon/OfficeChartComboDialog.tsx";
import { officeChartFilterControls } from "@mrnote/core/web/lib/office-charts/chart-filters.ts";
import {
  presentationChartTypeDataKindRefusal,
  presentationChartTypeTargetLock,
  readPresentationChartV2,
} from "@mrnote/core/web/lib/presentation-chart-v2.ts";
import type { PresentationChartBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { chartQuickData, chartWithQuickDataEdit } from "@mrnote/core/web/lib/office-charts/quick-data.ts";
import type { OfficeTaskPaneDockRegistry } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";

export interface PresentationChartContextRibbonProps {
  /** The look an imported chart carries, so its style tiles draw what the slide draws. */
  nativeLook?: ChartNativeLook;
  /** "chart-quick": only the Chart Elements / Styles / Filters buttons
   * beside the selected chart (OfficeChartQuickButtons). */
  tab: "chart-design" | "chart-format" | "chart-quick";
  attrs: ChartBlockAttrsV2;
  workbook?: DocumentChartWorkbook;
  /** What the Format ribbon remembers Current Selection by: an object held while the chart stays selected (a string remembers nothing). */
  identity: string | object;
  authority: object;
  disabledReason: string | null;
  /**
   * Why the chart's data (Select Data, Edit Data, the quick data grid,
   * Switch Row/Column, Refresh Data) and its type cannot be edited while the
   * rest can: an imported chart whose data is linked from outside the file.
   */
  dataDisabledReason?: string | null;
  /** Why the chart's data may change values only, no row or series (an
   * imported chart holding its data as cached values in its own part). */
  dataShapeDisabledReason?: string | null;
  /** Why the chart's type cannot be changed while the rest can (a rewrite
   * rebuilds the part around a workbook the file does not embed). */
  changeTypeDisabledReason?: string | null;
  /**
   * Why the chart title's text cannot be typed while the rest can: a linked
   * chart's title that is a cell of its workbook. Chart Elements > Chart
   * Title is greyed with it, and no pick that changes the title commits.
   */
  titleDisabledReason?: string | null;
  /**
   * Said once on the Chart Design tab while every chart command is greyed:
   * a preserve-only chart's notice (the frame's own commands still work).
   */
  notice?: string | null;
  /** Why the frame's size cannot be set; unstated, the chart's own reason.
   * A chart the file keeps as it has it still takes a size. */
  sizeDisabledReason?: string | null;
  locale: string;
  accentColors: readonly string[];
  size: { widthEmu: number; heightEmu: number };
  onSize: (axis: "widthEmu" | "heightEmu", emu: number) => boolean;
  onCommit: (
    attrs: ChartBlockAttrsV2,
    workbook?: DocumentChartWorkbook,
  ) => boolean;
  onPreview: (attrs: ChartBlockAttrsV2 | null) => void;
  onEditData: () => void;
  arrange: ReactNode;
  insertShapes: ReactNode;
  paneContainer: HTMLElement | null;
  /** A task pane dock the Format pane joins instead (a PDF reader's). */
  paneDock?: OfficeTaskPaneDockRegistry | null;
  /** The Format pane's placement in the deck (the stage's task pane dock). */
  paneClassName?: string;
  /** The element the Format pane is asked to select (a "More … Options"). */
  formatFocus?: { area: DocumentChartAreaStyleKey; token: number };
  /** A click on the drawn chart (`chart-hit`), for Current Selection. */
  elementHit?: { hit: OfficeChartHit; open: boolean; token: number } | null;
  /** Current Selection as it stands (`DocumentChartFormatRibbon.onAreaChange`). */
  onAreaChange?: (area: DocumentChartAreaStyleKey) => void;
  /** The chart's Current Selection as its clicks left it (`chart-selection-store`). */
  selectedArea?: string | null;
  /** Office's "More <element> Options…": the Chart Format tab on that element. */
  onOpenFormat?: (area: DocumentChartAreaStyleKey) => void;
  /** The right-click menu's Change Chart Type… / Save as Template…: the
   * dialog this ribbon opens, asked for once (then `onDialogRequestHandled`). */
  dialogRequest?: { kind: "allCharts" | "saveTemplate"; token: number } | null;
  onDialogRequestHandled?: () => void;
  /** Format > Accessibility > Alt Text: the deck's Alt Text pane on the chart. */
  onAltText?: () => void;
  altTextPaneOpen?: boolean;
}

export function PresentationChartContextRibbon(
  props: PresentationChartContextRibbonProps,
) {
  const { attrs, disabledReason, onCommit, locale, workbook } = props;
  const t = useTranslations("console-notebooks");
  // Style thumbnails use a static exemplar; the actual chart retains its 3D
  // subtype and is rendered by the shared GL canvas, never flattened on save.
  const stylePreviewAttrs = attrs.chartSubtype.endsWith("3d")
    ? {
        ...attrs,
        chartSubtype:
          (
            {
              clustered3d: "clustered",
              stacked3d: "stacked",
              percentStacked3d: "percentStacked",
              column3d: "clustered",
              line3d: "standard",
              standard3d: "standard",
              pie3d: "pie2d",
              bubble3d: "bubble",
            } as Record<string, ChartSubtype>
          )[attrs.chartSubtype] ?? attrs.chartSubtype,
      }
    : attrs;
  const disabled = disabledReason !== null,
    dataDisabledReason = disabledReason ?? props.dataDisabledReason ?? null,
    dataDisabled = dataDisabledReason !== null,
    dataShapeDisabledReason = dataDisabledReason ?? props.dataShapeDisabledReason ?? null,
    changeTypeDisabledReason = disabledReason ?? props.changeTypeDisabledReason ?? null;
  const quickLayoutWords = {
    chartTitle: t("presentation.ui.chart.defaultChartTitle"),
    axisTitle: t("presentation.ui.chart.defaultAxisTitle"),
  };
  const selectRef = useRef<HTMLButtonElement | null>(null);
  const elementsRef = useRef<HTMLButtonElement | null>(null);
  const [dataTarget, setDataTarget] = useState<ChartBlockAttrsV2 | null>(null);
  const [comboTarget, setComboTarget] = useState<ChartBlockAttrsV2 | null>(null);
  const [message, setMessage] = useState("");
  // PowerPoint's Change Chart Type dialog (All Charts, the user's Templates
  // folder first) and Save as Template's name box.
  const [allChartsOpen, setAllChartsOpen] = useState(false);
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const templateFolder = useOfficeChartTemplates(allChartsOpen);
  const dialogRequestToken = props.dialogRequest?.token;
  useEffect(() => {
    const request = props.dialogRequest;
    if (!request) return;
    if (request.kind === "allCharts") setAllChartsOpen(true);
    else setTemplateSaveOpen(true);
    props.onDialogRequestHandled?.();
    // One request, one dialog: the token is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogRequestToken]);
  const titleDisabledReason = disabled ? null : (props.titleDisabledReason ?? null);
  const commit = (
    next: ChartBlockAttrsV2 | null,
    book?: DocumentChartWorkbook,
  ) => {
    if (disabled || !next) return false;
    // A pick that would retype, add or remove a title the save declines.
    if (titleDisabledReason !== null && (next.title ?? "") !== (attrs.title ?? "")) {
      setMessage(titleDisabledReason);
      return false;
    }
    return onCommit(next, book);
  };
  const format = (patch: Partial<ChartBlockFormat>) =>
    commit({ ...attrs, format: { ...attrs.format, ...patch } });
  const changeArea = (
    area: DocumentChartAreaStyleKey,
    style: PresentationChartAreaStyle | null,
  ) => commit(setPresentationChartAreaStyle(attrs, area, style));
  const transpose = () => {
    if (disabled || attrs.data.kind !== "category") return;
    // The one Switch Row/Column rule, filters moved with the data.
    const next = presentationChartRowsColumnsSwitched(attrs, workbook);
    if (!next) {
      if (workbook) setMessage(t("presentation.ui.chart.cannotSwitchData"));
      return;
    }
    commit(next.attrs, next.workbook);
  };
  const refresh = async () => {
    if (disabled || !workbook) return;
    try {
      // The workbook's formulas are calculated on the server.
      const next = await calculateDocumentChartWorkbookSettled(attrs, workbook);
      if (next.pending) throw Error("chart_workbook_results_unavailable");
      if (commit({ ...attrs, data: next.data }, next.workbook))
        setMessage(t("presentation.ui.chart.dataRefreshed"));
    } catch {
      setMessage(t("presentation.ui.chart.checkDataRange"));
    }
  };

  // Add Chart Element's rows, Change Colors' palettes and the Chart Styles
  // gallery: the Chart Design tab draws them, and so do the buttons beside
  // the selected chart.
  const elementItems = (
    <OfficeChartElementMenuItems
      locale={locale}
      attrs={attrs}
      writable={!disabled}
      onPick={(next) => commit(next)}
      entryState={
        titleDisabledReason === null
          ? undefined
          : (key) =>
              key === "chartTitle" || key === "chartTitleOption"
                ? { disabled: true, reason: titleDisabledReason }
                : undefined
      }
      moreOptions={
        props.onOpenFormat
          ? {
              axes: () => props.onOpenFormat?.("axis:category"),
              chartTitle: () => props.onOpenFormat?.("chartTitleStyle"),
              // Label Options on the Format pane, as Office opens it.
              dataLabels: () => props.onOpenFormat?.("dataLabelStyle"),
              dataTable: () => props.onOpenFormat?.("dataTableStyle"),
              errorBars: () => props.onOpenFormat?.("errorBarStyle"),
              gridlines: () => props.onOpenFormat?.("gridlines"),
              legend: () => props.onOpenFormat?.("legendStyle"),
              trendline: () => props.onOpenFormat?.("trendlineStyle"),
              upDownBars: () => props.onOpenFormat?.("upBarStyle"),
            }
          : undefined
      }
      trendlineOptions
    />
  );
  // A chart varying its colours by point takes the pick on each point, in
  // the colours the slide draws it with: its part's own theme's, else the
  // deck's (`buildPresentationChartDisplayPlan`).
  const paletteAccents = chartThemeAccents(
    presentationChartOwnThemeAccents(props.authority as PresentationChartBlock) ?? props.accentColors,
  );
  const colorItems = (
    <OfficeChartColorPaletteMenuItems
      active={chartColorPaletteId(attrs)}
      accents={props.nativeLook?.themeAccents ?? props.accentColors}
      onPreview={(id) =>
        props.onPreview(id ? chartWithColorPalette(attrs, id, paletteAccents) : null)
      }
      onSelect={(id) => commit(chartWithColorPalette(attrs, id, paletteAccents))}
      testIdPrefix="presentation-chart-color-palette"
    />
  );
  // A style paints the chart's own colours: the pick's, in the deck theme's
  // accents, or an imported look's (the tiles and the commit agree).
  const stylePaint = {
    accents: chartThemeAccents(props.accentColors),
    ...(props.nativeLook ? { look: props.nativeLook } : {}),
  };
  const renderStyleGallery = (slot?: OfficeChartStylesSlot) => (
    <DocumentChartStyleGallery
      application="presentation"
      testIdPrefix={slot?.testIdPrefix ?? "presentation-chart-style"}
      attrs={attrs}
      previewAttrs={stylePreviewAttrs}
      nativeLook={props.nativeLook}
      // The tiles draw the chart as the slide does: a Change Colors pick in
      // the deck theme's accents (`PresentationChartThemeAccentsContext`).
      themeAccents={chartThemeAccents(props.accentColors)}
      // Each tile is this chart at its size on the slide, shown smaller.
      chartSize={{ width: props.size.widthEmu / 9525, height: props.size.heightEmu / 9525 }}
      disabledReason={disabledReason}
      // PowerPoint names its Chart Styles tiles by number ("Style 1" ...,
      // PPT-A151), never by a look of their own.
      labelFor={(id) => {
        const number = excelChartStyleNumber(id);
        return t("presentation.ui.chart.styleItem", {
          index: number ?? DOCUMENT_CHART_STYLES.findIndex((style) => style.id === id) + 1,
        });
      }}
      onPreview={(id) =>
        props.onPreview(id ? documentChartStyleAttrs(attrs, id, stylePaint) : null)
      }
      onCommit={(id) => {
        props.onPreview(null);
        commit(documentChartStyleAttrs(attrs, id, stylePaint));
      }}
      {...(slot
        ? {
            menuTrigger: slot.menuTrigger,
            menuHeader: slot.menuHeader,
            menuBody: slot.menuBody,
          }
        : {})}
    />
  );
  const comboRows = comboTarget ? officeChartCombinationRows(comboTarget) : null;
  // Why the chart may change type but not to this family: an imported
  // classic part stays classic, and one read around a look the model has no
  // words for keeps its family (`presentationChartTypeTargetLock`).
  const typeTargetReason = (family: ChartFamily): string | null => {
    const lock = presentationChartTypeTargetLock(props.authority as PresentationChartBlock, family);
    return lock === "chartExTarget"
      ? t("presentation.chartLock.typeChartExTarget")
      : lock === "nativeLook"
        ? t("presentation.chartLock.typeNativeLook")
        : null;
  };
  // The one Change Chart Type rule of the menu, for the dialog's pictures.
  const typeLeafState = (family: ChartFamily, subtype: ChartSubtype) => {
    if (changeTypeDisabledReason !== null) return { enabled: false, reason: changeTypeDisabledReason };
    const same = attrs.chartType === family && attrs.chartSubtype === subtype;
    const targetReason = same ? null : typeTargetReason(family);
    if (targetReason !== null) return { enabled: false, reason: targetReason };
    if (family === "combo" && subtype === "custom")
      return officeChartCombinationRows(attrs) !== null
        ? { enabled: true }
        : { enabled: false, reason: t("presentation.ui.chart.typeConversionLossy") };
    if (same) return { enabled: true };
    const enabled =
      officeChartTypeRefusal(attrs, family, subtype, null) === null &&
      changePresentationChartType(attrs, family, subtype) !== null;
    return enabled
      ? { enabled }
      : {
          enabled,
          reason: presentationChartTypeDataKindRefusal(attrs, family, subtype)
            ? t("presentation.chartLock.typeDataKind")
            : t("presentation.ui.chart.typeConversionLossy"),
        };
  };
  const chartPreviewSize = {
    width: props.size.widthEmu / 9525,
    height: props.size.heightEmu / 9525,
  };
  const chartPreview = (next: ChartBlockAttrsV2 | null) =>
    next ? (
      <DocumentChartStylePreview
        attrs={next}
        nativeLook={props.nativeLook}
        themeAccents={chartThemeAccents(props.accentColors)}
        chartSize={chartPreviewSize}
      />
    ) : null;
  const saveTemplate = async (name: string) => {
    setTemplateSaving(true);
    const result = await saveOfficeChartTemplate(name, attrs);
    setTemplateSaving(false);
    if (result === "ok") {
      setTemplateSaveOpen(false);
      setMessage(t("office.allCharts.saved"));
      return;
    }
    setMessage(
      result === "limit"
        ? t("office.allCharts.folderFull")
        : result === "tooLarge"
          ? t("office.allCharts.tooLarge")
          : t("office.allCharts.saveFailed"),
    );
  };
  const dialogs = (
    <>
      {allChartsOpen ? (
        <OfficeAllChartsDialog
          mode="change"
          initialFamily={attrs.chartType}
          initialSubtype={attrs.chartSubtype}
          families={[...CHART_INSERT_OFFICE_FAMILIES, ...CHART_INSERT_ENHANCEMENT_FAMILIES]}
          leafState={typeLeafState}
          preview={(family, subtype) =>
            chartPreview(
              attrs.chartType === family && attrs.chartSubtype === subtype
                ? attrs
                : family === "combo" && subtype === "custom"
                  ? null
                  : changePresentationChartType(attrs, family, subtype),
            )
          }
          templates={{
            items: templateFolder.templates,
            status: templateFolder.status === "idle" ? "loading" : templateFolder.status,
            emptyLabel: t("office.allCharts.templatesEmpty"),
            loadingLabel: t("office.allCharts.templatesLoading"),
            failedLabel: t("office.allCharts.templatesFailed"),
            state: (template) => {
              if (changeTypeDisabledReason !== null)
                return { enabled: false, reason: changeTypeDisabledReason };
              const applied = readPresentationChartV2(applyChartTemplate(attrs, template));
              if (!applied) return { enabled: false, reason: t("spreadsheet.chartTemplate.notApplicable") };
              const targetReason =
                applied.chartType === attrs.chartType ? null : typeTargetReason(applied.chartType);
              return targetReason === null ? { enabled: true } : { enabled: false, reason: targetReason };
            },
            preview: (template) => chartPreview(readPresentationChartV2(applyChartTemplate(attrs, template))),
            // Manage Templates: the user's folder, as in every editor.
            ...officeUserChartTemplateCommands,
          }}
          onConfirm={(choice) => {
            setAllChartsOpen(false);
            if (choice.kind === "template") {
              // A template's type, style and formatting over this chart's
              // data and titles (Microsoft Support, "Save a custom chart as
              // a template").
              const next = readPresentationChartV2(applyChartTemplate(attrs, choice.template));
              if (next) commit(next);
              else setMessage(t("spreadsheet.chartTemplate.notApplicable"));
              return;
            }
            if (choice.family === "combo" && choice.subtype === "custom") {
              setComboTarget(attrs);
              return;
            }
            if (attrs.chartType === choice.family && attrs.chartSubtype === choice.subtype) return;
            commit(changePresentationChartType(attrs, choice.family, choice.subtype));
          }}
          onCancel={() => setAllChartsOpen(false)}
          testIdPrefix="presentation-all-charts"
        />
      ) : null}
      {templateSaveOpen ? (
        <OfficeChartTemplateSaveDialog
          initialName={t("spreadsheet.uiCopy.chart1")}
          description={t("office.allCharts.saveHint")}
          maxLength={MAX_CHART_TEMPLATE_NAME_LENGTH}
          busy={templateSaving}
          onSave={(name) => void saveTemplate(name)}
          onCancel={() => setTemplateSaveOpen(false)}
          testIdPrefix="presentation-chart-template-save"
        />
      ) : null}
      {comboTarget && comboRows ? (
        <OfficeChartComboDialog
          open
          locale={locale}
          rows={comboRows}
          disabledReason={
            disabledReason ??
            (comboTarget === attrs
              ? null
              : t("presentation.ui.chart.chartChanged"))
          }
          onSubmit={(rows) => {
            setComboTarget(null);
            if (comboTarget === attrs)
              commit(
                readPresentationChartV2(officeChartWithCombination(attrs, rows)),
              );
          }}
          onClose={() => setComboTarget(null)}
          testIdPrefix="presentation-chart-combo"
        />
      ) : null}
      {dataTarget ? (
        <DocumentChartSelectDataDialog
          open
          canEdit={!disabled && dataTarget === attrs}
          locale={locale}
          initialAttrs={dataTarget}
          returnFocusRef={selectRef}
          onClose={() => setDataTarget(null)}
          onSubmit={(data, format) =>
            dataTarget === attrs &&
            commit({ ...attrs, data, ...(format ? { format } : {}) })
          }
          // PowerPoint's Select Data Source: Switch Row/Column and Hidden
          // and Empty Cells... live in the dialog (PPT-B019, PPT-A150).
          officeSource={{
            switchRowColumn: (current) =>
              presentationChartRowsColumnsSwitched(current, undefined)?.attrs ?? null,
          }}
        />
      ) : null}
    </>
  );

  if (props.tab === "chart-quick")
    return (
      <>
        <OfficeChartQuickButtons
          locale={locale}
          testIdPrefix="presentation-chart-quick"
          disabledReason={disabledReason}
          elements={elementItems}
          renderStyles={renderStyleGallery}
          colors={chartTakesColorPalette(attrs.chartType) ? colorItems : null}
          colorsUnavailableReason={t("presentation.ui.chart.surfaceColors")}
          onClose={() => props.onPreview(null)}
          filters={{
            ...officeChartFilterNames(attrs.data),
            // Hiding a series (`c15:filtered…Series`) and a category
            // (narrowed references with `c15:fullRef`) are both written.
            ...officeChartFilterControls(
              attrs,
              disabled ? null : (next) => commit(next),
            ),
            onSelectData: dataDisabled
              ? undefined
              : () => (workbook ? props.onEditData() : setDataTarget(attrs)),
          }}
          // Edit Data in place: the same edit the data sheet makes, written
          // into the chart's workbook and recalculated.
          quickData={{
            data: dataDisabled ? null : chartQuickData(attrs, workbook),
            unavailableReason:
              dataDisabledReason ?? t("presentation.ui.chart.editDataInSheet"),
            onEdit: dataDisabled
              ? undefined
              : (edit) => {
                  const next = chartWithQuickDataEdit(attrs, workbook, edit);
                  return next ? commit(next.attrs, next.workbook) : false;
                },
            onOpenSheet: dataDisabled || !workbook ? undefined : props.onEditData,
          }}
          style={{ position: "absolute", top: 0, left: "calc(100% + 6px)", zIndex: 6 }}
        />
        {dialogs}
      </>
    );

  if (props.tab === "chart-format")
    return (
      <div
        className={`${styles.format} note-editor-ribbon-track`}
        data-testid="presentation-chart-desktop-format"
      >
        <DocumentChartFormatRibbon
          application="presentation"
          officeProfile
          accentColors={paletteAccents}
          sharedShapeStyleRecipes={officeShapeStyleRecipes(props.accentColors)}
          wordArtRecipes={officeWordArtGalleryRecipesForAccents(props.accentColors)}
          testIdPrefix="presentation-chart-format"
          attrs={attrs}
          selectionIdentity={props.identity}
          authority={props.authority}
          disabledReason={disabledReason}
          showWordArt
          maxSizeEmu={PRESENTATION_GEOMETRY_MAX_EMU}
          locale={locale}
          // The pane's copy from the catalogue, in the deck's language (the
          // keys the worksheet's and the document's chart panes read).
          translate={t}
          slots={{ arrange: props.arrange, insertShapes: props.insertShapes }}
          onAltText={props.onAltText}
          altTextPaneOpen={props.altTextPaneOpen}
          // PowerPoint's Current Selection: the Chart Elements box (PPT-A152).
          selectionFieldLabel={t("office.chartQuick.elements")}
          onRememberSelection={() => {}}
          onRememberSize={() => {}}
          onPaint={(area, field, paint) =>
            changeArea(
              area,
              presentationChartPaintStyle(
                presentationChartAreaStyle(attrs, area),
                field,
                paint,
              ),
            )
          }
          onStyle={changeArea}
          onTextStyle={(area, style) =>
            area === "chartTitleStyle" &&
            changeArea(
              area,
              presentationChartTitleTextStyle(
                presentationChartAreaStyle(attrs, area),
                style,
              ),
            )
          }
          elementPane={{
            onIntent: (intent) => {
              const next = chartWithElementIntent(attrs, intent);
              if (next) commit(next);
            },
            trendlineOptions: true,
            seriesOptions: true,
            barSpacingOptions: true,
            customErrorAmounts: true,
            dataLabelContents: {
              format: attrs.format,
              chartType: attrs.chartType,
              chartSubtype: attrs.chartSubtype,
              onChange: (contents) =>
                commit({
                  ...attrs,
                  format: chartFormatWithDataLabelContents(attrs.format, contents),
                }),
            },
          }}
          onAxisOptions={(axis, options) =>
            commit(withOfficeChartAxisOptions(attrs, axis, options))
          }
          onChartModel={(command) => commit(command(attrs))}
          onEffect={(area, effect) =>
            changeArea(
              area,
              presentationChartEffectStyle(
                presentationChartAreaStyle(attrs, area),
                effect,
              ),
            )
          }
          onReset={(area) => changeArea(area, null)}
          size={props.size}
          onSize={props.onSize}
          sizeDisabledReason={props.sizeDisabledReason}
          paneContainer={props.paneContainer}
          paneDock={props.paneDock}
          paneClassName={props.paneClassName}
          focusArea={props.formatFocus}
          elementHit={props.elementHit}
          onAreaChange={props.onAreaChange}
          selectedArea={props.selectedArea}
        />
      </div>
    );

  return (
    <OfficeChartDesignRibbon
      locale={locale}
      testId="presentation-chart-desktop-design"
      classes={{ root: styles.design, commands: styles.commands }}
      elements={{
        disabled,
        disabledReason: disabledReason ?? undefined,
        triggerRef: elementsRef,
        items: elementItems,
      }}
      quickLayout={{
        // The one Quick Layout gallery (Excel's eleven on a column or bar
        // chart), with Office's Live Preview: the layout under the pointer or
        // focus is shown on the slide and written nowhere.
        control: (
          <OfficeChartQuickLayoutGallery
            application="presentation"
            calibrated={officeChartQuickLayoutCalibrated(attrs)}
            available={(id) => {
              const next = presentationChartQuickLayout(attrs, id, quickLayoutWords);
              if (!next) return t("presentation.ui.chart.layoutUnavailable");
              // A layout that adds or removes a title the save declines.
              return titleDisabledReason !== null &&
                (next.title ?? "") !== (attrs.title ?? "")
                ? titleDisabledReason
                : null;
            }}
            disabledReason={disabledReason}
            value={officeChartActiveQuickLayout(attrs)}
            labels={{
              ariaLabel: t("presentation.ui.chart.quickLayoutGallery"),
              more: t("presentation.ui.chart.moreLayouts"),
              item: (index) => t("presentation.ui.chart.layoutItem", { index }),
            }}
            trigger={
              <OfficeHomeMenuTrigger
                hasMenuIndicator
                variant="large"
                icon={<OfficeSemanticIcon semanticId="chart.dataTable" size={24} />}
                label={t("presentation.ui.chart.quickLayout")}
                disabled={disabled}
                disabledReason={disabledReason ?? undefined}
                testId="presentation-chart-layout"
              />
            }
            testIdPrefix="presentation-chart-quick-layout"
            onPreview={(id) =>
              props.onPreview(
                id ? presentationChartQuickLayout(attrs, id, quickLayoutWords) : null,
              )
            }
            onCommit={(id) => {
              props.onPreview(null);
              commit(presentationChartQuickLayout(attrs, id, quickLayoutWords));
            }}
          />
        ),
      }}
      colors={{
        // Office's Colorful and Monochromatic palettes on every chart but a
        // surface (painted by its height bands). The deck's writers rebuild
        // an owned or unsaved chart from its attrs, so the pick is
        // `format.colorPalette` for classic and Office 2016 charts alike.
        disabled: disabled || !chartTakesColorPalette(attrs.chartType),
        disabledReason:
          disabledReason ??
          (chartTakesColorPalette(attrs.chartType)
            ? undefined
            : t("presentation.ui.chart.surfaceColors")),
        onOpenChange: (open) => {
          if (!open) props.onPreview(null);
        },
        items: colorItems,
      }}
      styleGallery={renderStyleGallery()}
      // No Hidden and Empty Cells on the ribbon: PowerPoint keeps it in
      // Select Data Source (PPT-A150), the deck's Select Data dialog, and on
      // the chart's workbook window beside its data range.
      switchRowColumn={{
        disabled:
          dataShapeDisabledReason !== null ||
          attrs.data.kind !== "category" ||
          attrs.chartType === "pie",
        disabledReason: dataShapeDisabledReason ?? undefined,
        onClick: transpose,
      }}
      selectData={{
        disabled: dataShapeDisabledReason !== null,
        disabledReason: dataShapeDisabledReason ?? undefined,
        buttonRef: selectRef,
        onClick: () => (workbook ? props.onEditData() : setDataTarget(attrs)),
      }}
      editData={{
        disabled: dataDisabled,
        disabledReason: dataDisabledReason ?? undefined,
        onClick: props.onEditData,
      }}
      refreshData={{
        disabled: dataDisabled || !workbook,
        disabledReason: dataDisabledReason ?? undefined,
        onClick: refresh,
      }}
      changeType={{
        disabled: changeTypeDisabledReason !== null,
        disabledReason: changeTypeDisabledReason ?? undefined,
        family: attrs.chartType,
        // The one Change Chart Type list (Office's order, every type with its
        // subtypes), classic and Office 2016 types alike.
        items: (
          <>
          <OfficeChartTypeMenuItems
            // PowerPoint for Mac's nine entries (PPT-A062).
            groups={presentationChartTypeGroups(t)}
            choice={(family, subtype) => {
              const checked =
                attrs.chartType === family && attrs.chartSubtype === subtype;
              // An owned chart already in the file is rewritten as the other
              // kind of part when its type crosses the classic / Office 2016
              // boundary (`pptx/chart_kind_conversion.py`), so only the data
              // can refuse a type.
              const refusal = checked
                ? null
                : officeChartTypeRefusal(attrs, family, subtype, null);
              const targetReason =
                checked || family === attrs.chartType ? null : typeTargetReason(family);
              if (targetReason !== null) return { enabled: false, checked, reason: targetReason };
              // Custom Combination opens its pane, also on a chart that
              // already is one (to change its series).
              const enabled =
                family === "combo" && subtype === "custom"
                  ? !disabled && officeChartCombinationRows(attrs) !== null
                  : !checked &&
                    refusal === null &&
                    changePresentationChartType(attrs, family, subtype) !== null;
              return {
                enabled,
                checked,
                reason:
                  enabled || checked
                    ? undefined
                    : presentationChartTypeDataKindRefusal(attrs, family, subtype)
                      ? t("presentation.chartLock.typeDataKind")
                      : t("presentation.ui.chart.typeConversionLossy"),
              };
            }}
            subtypeLabel={(family, subtype) =>
              t(
                `toolbar.chartV2.subtype.${family}.${subtype}` as "toolbar.chartV2.subtype.column.clustered",
              )
            }
            onChoose={(family, subtype) =>
              family === "combo" && subtype === "custom"
                ? setComboTarget(attrs)
                : commit(changePresentationChartType(attrs, family, subtype))
            }
            groupTestId={(group) => `presentation-chart-type-${group.id}`}
            itemTestId={(family, subtype) =>
              `presentation-chart-type-${family}-${subtype}`
            }
            groupUnavailableReason={t(
              "presentation.ui.chart.typeConversionLossy",
            )}
          />
          {/* PowerPoint's Change Chart Type dialog, at the list's foot. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="presentation-chart-type-all-charts"
            onSelect={() => setAllChartsOpen(true)}
          >
            {t("office.allCharts.changeOpen")}
          </DropdownMenuItem>
          </>
        ),
      }}
    >
      {props.notice ? (
        <span
          role="note"
          className={styles.status}
          data-testid="presentation-chart-preserved-notice"
        >
          {props.notice}
        </span>
      ) : null}
      {message ? (
        <span role="status" className={styles.status}>
          {message}
        </span>
      ) : null}
      {dialogs}
    </OfficeChartDesignRibbon>
  );
}
