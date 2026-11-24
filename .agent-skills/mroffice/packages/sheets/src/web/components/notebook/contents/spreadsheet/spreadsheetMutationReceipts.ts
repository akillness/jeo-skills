/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type ConditionalFormatMutationAction } from "../../../../lib/spreadsheet/conditional-buttons";
import { type PresentationCustomShapeResult } from "@mrnote/core/web/lib/presentation-freeform.ts";
import { type SpreadsheetDataFromPictureCapability, type SpreadsheetDataFromPictureSource } from "../../../../lib/spreadsheet/data-from-picture";
import { type SpreadsheetRibbonTabId } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { type SpreadsheetPageSetupTab } from "./SpreadsheetPageSetupDialog";
import { type SpreadsheetPivotChartType } from "@mrnote/core/web/lib/spreadsheet/pivot-chart.ts";
import { type Slicer } from "../../../../lib/spreadsheet/slicer";
import { type DataTable, type TableStyleChoice } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type WorkbookStructureProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type CellComment } from "@mrnote/core/web/lib/spreadsheet/comments.ts";
import { type OfficeTextPaint } from "@mrnote/core/web/lib/office-text-paint.ts";
import { type TextRun } from "@mrnote/core/web/lib/presentation-runs.ts";
import { type ComboRenderAs } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { type SpreadsheetChart, type SpreadsheetChartType } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { type PivotAgg, type PivotConfig, type PivotFieldProfile, type PivotNativeScalarMatrix, type PivotRange, type PivotShowValuesAsConfig, type PivotValueField } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type MarginPreset } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { type SpreadsheetPresetShapeKind } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { type ConditionalFormatRule } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { type SheetModel, type SpreadsheetObject } from "./spreadsheetSheetModel";

export type PageSetupFocusTarget =
  | "margins"
  | "customMargins"
  | "orientation"
  | "size"
  | "printArea"
  | "scalingKind"
  | "scalingWidth"
  | "scalingHeight"
  | "repeatRows";

/** Which Page Setup tab a launcher lands on (Excel opens the matching tab). */
export function pageSetupTabForFocusTarget(
  target: PageSetupFocusTarget | null,
): SpreadsheetPageSetupTab {
  switch (target) {
    case "margins":
    case "customMargins":
      return "margins";
    case "printArea":
    case "repeatRows":
      return "sheet";
    default:
      return "page";
  }
}

/** The dialog field each launcher focuses, by its rendered test id. */
export const PAGE_SETUP_FOCUS_TEST_ID: Record<PageSetupFocusTarget, string> = {
  margins: "spreadsheet-ps-margin-top",
  customMargins: "spreadsheet-ps-margin-top",
  orientation: "spreadsheet-ps-orientation",
  size: "spreadsheet-ps-paper-size",
  printArea: "spreadsheet-ps-print-area",
  scalingKind: "spreadsheet-ps-scaling-percent-mode",
  scalingWidth: "spreadsheet-ps-scaling-width-pages",
  scalingHeight: "spreadsheet-ps-scaling-height-pages",
  repeatRows: "spreadsheet-ps-repeat-rows",
};

export interface PageSetupSourceAuthority {
  workbookIdentity: Readonly<Record<string, never>>;
  workbook: readonly SheetModel[];
  activeSheetIndex: number;
  sheet: SheetModel;
  sheetId: string;
  controlId?: string;
}

export interface PageSetupDialogAuthority extends PageSetupSourceAuthority {
  applyControlId: "XLSCTL.PAGE_LAYOUT.PAGE_SETUP.APPLY";
  clearControlId: "XLSCTL.PAGE_LAYOUT.PAGE_SETUP.CLEAR";
}

export interface PageSetupMutationReceipt extends PageSetupSourceAuthority {
  controlId: string;
  preset?: MarginPreset;
  range?: string;
  row?: number;
  col?: number;
  selectionEpoch?: number;
}

export interface PageSetupSelectionSnapshot {
  epoch: number;
  active: { row: number; col: number };
  anchor: { row: number; col: number } | null;
  range: { r1: number; r2: number; c1: number; c2: number };
}

export interface DataFromPictureDialogAuthority {
  source: SpreadsheetDataFromPictureSource;
  workbook: readonly SheetModel[];
  activeSheetIndex: number;
  sheet: SheetModel;
  sheetId: string;
  selection: PageSetupSelectionSnapshot;
  pageAuthorityGeneration: number;
  capability: SpreadsheetDataFromPictureCapability;
}

export interface InsertMutationReceipt {
  controlId: string;
  workbook: readonly SheetModel[];
  activeSheetIndex: number;
  sheet: SheetModel;
  sheetId: string;
  selection: PageSetupSelectionSnapshot;
  chartType?: SpreadsheetChartType;
  /** Shared-catalog subtype of the chart leaf a gallery card asked for. */
  chartSubtype?: string;
  /** Office's "line on secondary axis" combo; the writer resolves the index. */
  chartSecondaryAxisLastSeries?: true;
  /** Custom Combination: each series' chart type and the secondary series. */
  chartCombination?: { types: ComboRenderAs[]; secondary: number[] };
  /** XLS-A081: Insert Chart > Templates: the workbook template to apply. */
  chartTemplateId?: string;
  shapeKind?: SpreadsheetPresetShapeKind;
  /**
   * Where Insert > Shapes was drawn with the crosshair, in stage pixels (the
   * absolute anchor a Draw-tab stroke takes). Without it the shape sits at
   * the active cell, as the AI commands insert it.
   */
  shapeFrame?: { left: number; top: number; width: number; height: number; flipV?: boolean };
  /** A Curve / Freeform / Scribble outline the drawing surface finished. */
  customShape?: PresentationCustomShapeResult;
  smartArtLayoutId?: string;
  checkboxMode?: "insert" | "remove";
  /** The shared WordArt recipe an Insert > WordArt gallery pick asked for. */
  wordArtStyleId?: string;
}

export interface RecommendedInsertConfirmReceipt extends InsertMutationReceipt {
  controlId:
    | "XLSCTL.INSERT.CHART.RECOMMENDED_MENU.APPLY"
    | "XLSCTL.INSERT.RECOMMENDED_PIVOT.APPLY";
  kind: "chart" | "pivot";
  matrix: string[][];
  source?: string;
}

/**
 * The A1 range the Create PivotTable draft stands on. The Table/Range box may
 * hold a table's NAME, which is not a range; the draft's recipe then carries
 * the table's range (and `sourceTableId`), and the box text is only a label.
 */
export function pivotCreationSourceA1(draft: PivotCreationDraft): string {
  return draft.config.sourceTableId ? draft.config.source : draft.sourceDraft;
}

export interface PivotCreationDraft {
  readonly authority: InsertMutationReceipt;
  readonly sheetId: string;
  readonly sourceDraft: string;
  /** Why the source box's entry cannot be summarised (too large, a tiled
   * sheet not read whole, no range): the dialog shows it, and no preview or
   * OK over the rows of an earlier entry. Null or absent when it can. */
  readonly sourceIssue?: string | null;
  /** "Choose where you want the PivotTable to be placed": Excel's default is
   * New Worksheet. */
  readonly destinationKind: "new" | "existing";
  /** Why Existing Worksheet cannot be chosen (this sheet already carries a
   * PivotTable); null when it can. */
  readonly existingUnavailableReason: string | null;
  /** The default location beside the source is occupied: the user names
   * another free location instead. */
  readonly defaultOutputUnavailable?: boolean;
  readonly outputDraft: string;
  /** The location box was typed in (not the dialog's own proposal). */
  readonly outputEdited?: boolean;
  readonly matrix: string[][];
  readonly scalarMatrix: PivotNativeScalarMatrix;
  readonly fields: PivotFieldProfile[];
  readonly config: PivotConfig;
}

export interface PivotCreationMutationReceipt extends InsertMutationReceipt {
  readonly controlId: "XLSCTL.INSERT.PIVOT.APPLY";
  readonly destinationKind: "new" | "existing";
  readonly sourceCells: SheetModel["cells"];
  readonly source: string;
  readonly scalarMatrix: PivotNativeScalarMatrix;
  readonly fields: PivotFieldProfile[];
  readonly config: PivotConfig;
}

export type PivotCreationFieldArea =
  | "none"
  | "rows"
  | "columns"
  | "values"
  | "filters";

export interface TableStyleMutationReceipt {
  readonly controlId: "XLSCTL.CONTEXT.TABLE.STYLE_GALLERY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly tableCollection: readonly DataTable[];
  readonly table: DataTable;
  readonly tableId: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly styleId: TableStyleChoice;
}

export interface TableNameMutationReceipt {
  readonly controlId: "XLSCTL.CONTEXT.TABLE.NAME";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly tableCollection: readonly DataTable[];
  readonly table: DataTable;
  readonly tableId: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly previousName: string;
  readonly nextName: string;
}

export interface TableAltTextMutationReceipt {
  readonly controlId: "XLSCTL.CONTEXT.TABLE.ALT_TEXT.MRAI.APPLY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly tableCollection: readonly DataTable[];
  readonly table: DataTable;
  readonly tableId: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly previousAltText: string;
  readonly previousAltTextSummary: string;
  readonly nextAltText: string;
  readonly nextAltTextSummary: string;
}

export type TableStyleOption =
  | "bandedRows"
  | "bandedColumns"
  | "firstColumn"
  | "lastColumn";

export type TableStyleOptionControlId =
  | "XLSCTL.CONTEXT.TABLE.BANDED_ROWS"
  | "XLSCTL.CONTEXT.TABLE.BANDED_COLUMNS"
  | "XLSCTL.CONTEXT.TABLE.FIRST_COLUMN"
  | "XLSCTL.CONTEXT.TABLE.LAST_COLUMN";

export interface TableStyleOptionMutationReceipt {
  readonly controlId: TableStyleOptionControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly tableCollection: readonly DataTable[];
  readonly table: DataTable;
  readonly tableId: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly option: TableStyleOption;
  readonly nextValue: boolean;
}

export interface TableResizeMutationReceipt {
  readonly controlId: "XLSCTL.CONTEXT.TABLE.RESIZE.MRAI.APPLY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly tableCollection: readonly DataTable[];
  readonly table: DataTable;
  readonly tableId: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly tableRange: string;
  readonly targetRange: string;
}

export interface PivotSlicerInsertMutationReceipt {
  readonly controlId: "XLSCTL.CONTEXT.PIVOT.INSERT_SLICER.MRAI.APPLY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly pivot: PivotConfig;
  readonly selection: PageSetupSelectionSnapshot;
  /** Every named PivotCache field, in cache order (the dialog's rows). */
  readonly allFields: readonly string[];
  /** The fields no slicer on this sheet shows yet. */
  readonly availableFields: readonly string[];
  readonly selectedFields: readonly string[];
}

export interface TableSlicerInsertMutationReceipt {
  readonly controlId: "XLSCTL.CONTEXT.TABLE.INSERT_SLICER.MRAI.APPLY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly tableCollection: readonly DataTable[];
  readonly table: DataTable;
  readonly tableId: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly availableColumnIds: readonly number[];
  readonly selectedColumnIds: readonly number[];
}

export interface ConditionalFormatMutationReceipt {
  readonly controlId: "XLSCTL.HOME.STYLE.CONDITIONAL.MANAGE_RULES.APPLY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly ruleCollection: readonly ConditionalFormatRule[] | undefined;
  readonly selection: PageSetupSelectionSnapshot;
  readonly action: ConditionalFormatMutationAction;
  readonly parameter: string;
  readonly nextRules: readonly ConditionalFormatRule[];
}

type ChartDesignControlId =
  | "XLSCTL.CONTEXT.CHART.SWITCH_ROW_COLUMN"
  | "XLSCTL.CONTEXT.CHART.SELECT_DATA.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.QUICK_LAYOUT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.CHANGE_COLORS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.STYLE_GALLERY.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.CHANGE_TYPE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.TITLE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.DATA_LABELS"
  | "XLSCTL.CONTEXT.CHART.AXIS_TITLE_X.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.AXIS_TITLE_Y.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.AXIS_TITLE_DEPTH.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.VALUE_AXIS_NUMBER_FORMAT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.LINE_MARKER_SYMBOL.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.LINE_MARKER_SIZE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.LEGEND"
  | "XLSCTL.CONTEXT.CHART.LEGEND_POSITION.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.DATA_LABEL_POSITION.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.AXES"
  | "XLSCTL.CONTEXT.CHART.GRIDLINES"
  | "XLSCTL.CONTEXT.CHART.DATA_TABLE"
  | "XLSCTL.CONTEXT.CHART.TRENDLINE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.ERROR_BARS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.UP_DOWN_BARS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.LINES.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.SECONDARY_AXIS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.DATA_LABEL_OVERRIDE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.DISPLAY_BLANKS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.CHART.HISTOGRAM_BINS.MRAI.APPLY";

interface ChartDesignReceiptBase {
  readonly controlId: ChartDesignControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly parameter: string;
}

interface NativeChartDesignMutationReceipt extends ChartDesignReceiptBase {
  readonly kind: "native";
  readonly selection: Readonly<{ sheetId: string; chartId: string }>;
  readonly chartCollection: readonly SpreadsheetChart[];
  readonly chart: SpreadsheetChart;
  readonly chartId: string;
}

interface DrawingChartDesignMutationReceipt extends ChartDesignReceiptBase {
  readonly kind: "drawing";
  readonly selection: string;
  readonly chartCollection: readonly SpreadsheetObject[];
  readonly chart: SpreadsheetObject;
  readonly chartId: string;
}

export type ChartDesignMutationReceipt =
  | NativeChartDesignMutationReceipt
  | DrawingChartDesignMutationReceipt;

export type ShapeFormatWriterControlId =
  | "XLSCTL.CONTEXT.SHAPE.STYLE_GALLERY.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.CHANGE_SHAPE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.OUTLINE_WEIGHT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.LINE_ENDS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.OUTLINE_DASH.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.OUTLINE_SKETCH.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.TEXT_TRANSFORM.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.LINE_DETAIL.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.FILL_LINE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.EFFECTS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.FILL_COLOR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.OUTLINE_COLOR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.SHADOW_PRESET.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.SHADOW_COLOR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.TEXT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.TEXT_SIZE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.TEXT_COLOR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.ALT_TEXT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.WIDTH.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.HEIGHT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.DELETE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.BRING_TO_FRONT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.BRING_FORWARD.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.SEND_BACKWARD.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.SEND_TO_BACK.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.ROTATE_LEFT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.ROTATE_RIGHT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.FLIP_VERTICAL.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.FLIP_HORIZONTAL.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.ROTATION.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.LOCK_ASPECT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.PLACEMENT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.PRINT_OBJECT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.TEXT_PAINT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.ADJUST.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.EDIT_POINTS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SHAPE.EFFECT_PRESET.MRAI.APPLY";

export interface ShapeFormatMutationReceipt {
  readonly controlId: ShapeFormatWriterControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly objectCollection: readonly SpreadsheetObject[];
  readonly object: SpreadsheetObject;
  readonly objectId: string;
  readonly selection: string;
  readonly parameter: string;
  /** Words typed in the shape, written as the person leaves them: to this
   * shape, whatever the click that ended the edit selected. */
  readonly heldText?: true;
  /** The typed words' own runs (`textRuns`), with Set Text: null when every
   * character wears the shape's format. Absent: not stated, and the runs the
   * shape has follow the new words where they still can. */
  readonly textRuns?: readonly TextRun[] | null;
  /** WordArt on the selected shape as an edit of each paint the words wear
   * (the label's, and a run's own): Text Fill keeps a run's outline. */
  readonly textPaintEdit?: (paint: OfficeTextPaint) => OfficeTextPaint;
}

export type ShapeRotationDialogAuthority = Omit<
  ShapeFormatMutationReceipt,
  "controlId" | "parameter"
>;

export type PictureFormatWriterControlId =
  | "XLSCTL.CONTEXT.PICTURE.CROP.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.STYLE_GALLERY.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.ROTATE_LEFT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.ROTATE_RIGHT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.FLIP_VERTICAL.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.FLIP_HORIZONTAL.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.WIDTH.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.HEIGHT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.LOCK_ASPECT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.PLACEMENT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.PRINT_OBJECT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.DELETE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.BRING_TO_FRONT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.BRING_FORWARD.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.SEND_BACKWARD.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.SEND_TO_BACK.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.SHADOW_PRESET.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.SHADOW_COLOR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.EFFECTS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.ARTISTIC_EFFECTS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.CORRECTIONS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.COLOR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.TRANSPARENCY.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.ROTATION.MRAI.APPLY";

export interface PictureFormatMutationReceipt {
  readonly controlId: PictureFormatWriterControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly objectCollection: readonly SpreadsheetObject[];
  readonly object: SpreadsheetObject;
  readonly objectId: string;
  readonly selection: string;
  readonly parameter: string;
}

export type PictureRotationDialogAuthority = Omit<
  PictureFormatMutationReceipt,
  "controlId" | "parameter"
>;

export type PictureMetadataWriterControlId =
  | "XLSCTL.CONTEXT.PICTURE.CHANGE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PICTURE.ALT_TEXT.MRAI.APPLY";

export interface PictureMetadataMutationReceipt {
  readonly controlId: PictureMetadataWriterControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly objectCollection: readonly SpreadsheetObject[];
  readonly object: SpreadsheetObject;
  readonly objectId: string;
  readonly selection: string;
  readonly nextSrc?: string;
  readonly nextAlt?: string;
  readonly nextCaption?: string;
}

export type SlicerDesignWriterControlId =
  | "XLSCTL.CONTEXT.SLICER.TITLE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.SHOW_HEADER.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.STYLE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.COLUMNS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.BUTTON_HEIGHT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.WIDTH.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.HEIGHT.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.CLEAR_FILTER.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SLICER.REMOVE.MRAI.APPLY";

export interface SlicerDesignMutationReceipt {
  readonly controlId: SlicerDesignWriterControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly sourceSlicerCollection: SheetModel["slicers"];
  readonly slicer: Slicer;
  readonly slicerId: string;
  readonly selection: string;
  readonly parameter: string;
}

export type SparklineDesignWriterControlId =
  | "XLSCTL.CONTEXT.SPARKLINE.TYPE.LINE"
  | "XLSCTL.CONTEXT.SPARKLINE.TYPE.COLUMN"
  | "XLSCTL.CONTEXT.SPARKLINE.TYPE.WIN_LOSS"
  | "XLSCTL.CONTEXT.SPARKLINE.COLOR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SPARKLINE.STYLE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.SPARKLINE.CLEAR"
  | "XLSCTL.CONTEXT.SPARKLINE.MARKERS"
  | "XLSCTL.CONTEXT.SPARKLINE.HIGH_POINT"
  | "XLSCTL.CONTEXT.SPARKLINE.LOW_POINT"
  | "XLSCTL.CONTEXT.SPARKLINE.FIRST_POINT"
  | "XLSCTL.CONTEXT.SPARKLINE.LAST_POINT"
  | "XLSCTL.CONTEXT.SPARKLINE.NEGATIVE_POINTS"
  | "XLSCTL.CONTEXT.SPARKLINE.SHOW_AXIS"
  | "XLSCTL.CONTEXT.SPARKLINE.MIN_AXIS_TYPE"
  | "XLSCTL.CONTEXT.SPARKLINE.MAX_AXIS_TYPE"
  | "XLSCTL.CONTEXT.SPARKLINE.MIN_AXIS_VALUE"
  | "XLSCTL.CONTEXT.SPARKLINE.MAX_AXIS_VALUE"
  | "XLSCTL.CONTEXT.SPARKLINE.DATA_RANGE"
  | "XLSCTL.CONTEXT.SPARKLINE.EMPTY_CELLS"
  | "XLSCTL.CONTEXT.SPARKLINE.DISPLAY_HIDDEN"
  | "XLSCTL.CONTEXT.SPARKLINE.GROUP"
  | "XLSCTL.CONTEXT.SPARKLINE.UNGROUP";

export interface SparklineDesignMutationReceipt {
  readonly controlId: SparklineDesignWriterControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly sparklineMap: SheetModel["sparklines"];
  readonly sparkline: unknown;
  readonly activeKey: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly parameter: string;
}

export type ChartDesignDialogAuthority =
  | Omit<NativeChartDesignMutationReceipt, "controlId" | "parameter">
  | Omit<DrawingChartDesignMutationReceipt, "controlId" | "parameter">;

export type PivotContextWriterControlId =
  | "XLSCTL.CONTEXT.PIVOT.REFRESH.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.CHANGE_SOURCE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.CLEAR_ALL.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.CLEAR_FILTERS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.FIELD_LIST.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.VALUE_FIELD_SETTINGS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.MOVE.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.CLEAR.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.SHOW_EXPAND_COLLAPSE_BUTTONS.MRAI.APPLY"
  | "XLSCTL.CONTEXT.PIVOT.DESIGN.MRAI.APPLY";

export type PivotFieldAreaName = "rows" | "columns" | "values" | "filters";

export interface PivotContextMutationReceipt {
  readonly controlId: PivotContextWriterControlId;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly pivot: PivotConfig;
  readonly sourceSheet: SheetModel;
  readonly sourceSheetId: string;
  readonly sourceCells: SheetModel["cells"];
  readonly selection: PageSetupSelectionSnapshot;
  readonly nextPivot: PivotConfig | null;
  readonly moveDestination?: "existing" | "new";
  readonly parameter: string;
}

export type PivotSourceDialogAuthority = Omit<
  PivotContextMutationReceipt,
  "controlId" | "nextPivot" | "parameter"
>;

export interface PivotMoveDialogDraft {
  readonly authority: PivotSourceDialogAuthority;
  destinationKind: "existing" | "new";
  destination: string;
  error: "invalid" | "collision" | "stale" | null;
}

export interface PivotValueFieldSettingsDraft {
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly pivot: PivotConfig;
  readonly valueIndex: number;
  readonly sourceName: string;
  readonly defaultCaption: string;
  readonly originalValue: PivotValueField;
  caption: string;
  numberFormat: string | null;
  agg: PivotAgg;
  showAs: PivotShowValuesAsConfig | null;
  tab: "summarize" | "showAs";
  error: string | null;
}

export interface PivotChartCreateReceipt {
  readonly controlId: "XLSCTL.CONTEXT.PIVOT.CHART.MRAI.APPLY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly pivot: PivotConfig;
  readonly chartCollection: readonly SpreadsheetChart[] | undefined;
  readonly selection: PageSetupSelectionSnapshot;
  readonly output: PivotRange;
  readonly outputRange: string;
  readonly chartType: SpreadsheetPivotChartType;
}

export interface ReviewCommentDialogAuthority {
  readonly pageId: string;
  readonly pageAuthorityGeneration: number;
  readonly actorId: string;
  readonly actorName: string;
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly selection: PageSetupSelectionSnapshot;
  readonly comment: CellComment | undefined;
}

export interface WorkbookProtectionDialogAuthority {
  readonly workbook: readonly SheetModel[];
  readonly sourceProtection: WorkbookStructureProtection | undefined;
}

export interface WorkbookProtectionMutationReceipt
  extends WorkbookProtectionDialogAuthority {
  readonly controlId: "XLSCTL.REVIEW.PROTECT.WORKBOOK.MRAI.APPLY";
  readonly nextProtection: WorkbookStructureProtection | undefined;
}

export interface ReviewCommentMutationReceipt extends ReviewCommentDialogAuthority {
  readonly controlId:
    | "XLSCTL.REVIEW.COMMENT.POST"
    | "XLSCTL.REVIEW.COMMENT.RESOLVE_TOGGLE"
    | "XLSCTL.REVIEW.COMMENT.DELETE";
  readonly parameter: string;
}

export interface LiveReviewCommentPageAuthority {
  readonly pageId: string;
  readonly loadedPageId: string;
  readonly readOnly: boolean;
  readonly readOnlyReason: string | null;
  readonly lockedByName: string | null;
  readonly generation: number;
  readonly actorId: string;
  readonly actorName: string;
  readonly allowed: boolean;
}

export interface DataValidationDialogAuthority {
  readonly controlId: "XLSCTL.DATA.VALIDATION.MRAI.APPLY";
  readonly workbook: readonly SheetModel[];
  readonly activeSheetIndex: number;
  readonly sheet: SheetModel;
  readonly sheetId: string;
  readonly selection: PageSetupSelectionSnapshot;
}

export interface PageSetupReturnFocus {
  tab: SpreadsheetRibbonTabId;
  triggerTestId: PageSetupReturnFocusTestId;
}

export type PageSetupReturnFocusTestId =
  | "spreadsheet-page-setup-toggle"
  | "spreadsheet-ribbon-page-setup"
  | "spreadsheet-ribbon-page-layout-margins"
  | "spreadsheet-ribbon-page-layout-orientation"
  | "spreadsheet-ribbon-page-layout-size"
  | "spreadsheet-ribbon-page-layout-print-area"
  | "spreadsheet-ribbon-page-layout-print-titles"
  | "spreadsheet-ribbon-page-layout-scale-width"
  | "spreadsheet-ribbon-page-layout-scale-height"
  | "spreadsheet-ribbon-page-layout-scale-to-fit-settings";
