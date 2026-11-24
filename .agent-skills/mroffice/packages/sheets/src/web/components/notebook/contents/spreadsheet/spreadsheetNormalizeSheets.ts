/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizeSpreadsheetPictureEffects } from "../../../../lib/spreadsheet/picture-effects";
import { rememberPlaceholderSheet } from "../../../../lib/spreadsheet/deferred-sheets";
import { readFilterResult, withFilterResultCriteriaAdopted, withoutFilterResult } from "@mrnote/core/web/lib/spreadsheet/filter-result.ts";
import { normalizeOfficePictureGeometry, normalizeOfficePictureGeometryAdjustments } from "@mrnote/core/web/lib/office-picture-geometry.ts";
import { type SpreadsheetAnchorPoint, type SpreadsheetObjectAnchor } from "../../../../lib/spreadsheet/drawing-buttons";
import { cellKind, hasCellMetadata, EXPLICIT_DEFAULT_BLANK_CELL, writeCellValueInto, type CellMap, type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { normalizeSizeMap } from "../../../../lib/spreadsheet/row-column-buttons";
import { withSheetChartModels } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { normalizeSpreadsheetSortState } from "../../../../lib/spreadsheet/sort-buttons";
import { normalizeNativeGrid, nativeRowCssClamp, nativeColumnCssClamp } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { isOfficePictureStyleId } from "@mrnote/core/web/lib/office-picture-styles/catalog.ts";
import { type PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import { spreadsheetPageContentSchema } from "@mrnote/core/web/lib/native-spreadsheet-schemas.ts";
import {
  anchorSetAsideValues,
  restoreSetAsideValues,
  withoutSchemaIssues,
  type SchemaRemovedValue,
  type SpreadsheetSetAsideValue,
} from "../../../../lib/spreadsheet/schema-set-aside";

// Moved to lib/spreadsheet/schema-set-aside (shared with the command layer).
export { restoreSetAsideValues, type SpreadsheetSetAsideValue };
import { normalizeSpreadsheetImportDimensions } from "../../../../lib/spreadsheet/import-normalization";
import { normalizeSpreadsheetObjectIdentities } from "../../../../lib/spreadsheet/object-identities";
import { normalizeSpreadsheetChartMapRegionCodes } from "@mrnote/core/web/lib/spreadsheet/chart-v2-binding.ts";
import { normalizeSpreadsheetChartBinding, normalizeSpreadsheetChartV2 } from "@mrnote/core/web/lib/spreadsheet/chart-v2-model.ts";
import { defaultSheetName } from "../../../../lib/spreadsheet/sheet-name-rules";
import { readSpreadsheetNativeSmartArt } from "../../../../lib/spreadsheet/native-smartart";
import { normalizeChartVisibility } from "@mrnote/core/web/lib/spreadsheet/chart-visibility.ts";
import { isIdentityCrop, normalizeSignedCropRect } from "@mrnote/core/web/lib/presentation-crop-group.ts";
import { readCellPicture } from "@mrnote/core/web/lib/spreadsheet/cell-picture.ts";
import { readFreezeConfig, readSplitConfig } from "@mrnote/core/web/lib/spreadsheet/freeze-panes.ts";
import { coveredCells, normalizeMerges } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { BLANK_CELL_FORMATS_HINT, hydrateBlankCellFormats } from "@mrnote/core/web/lib/spreadsheet/blank-cell-formats.ts";
import { createCellStyleInterner, expandCellStyleTable, type CellStyleInterner } from "@mrnote/core/web/lib/spreadsheet/cell-style-table.ts";
import { withColumnRunsExpanded } from "../../../../lib/spreadsheet/column-runs";
import { lineStyleAt, materializeWorkbookLineStyles, normalizeLineStyles, storedColumnStyles, type LineStyleMap } from "@mrnote/core/web/lib/spreadsheet/line-styles.ts";
import { normalizeNamedRanges } from "@mrnote/core/web/lib/spreadsheet/named-ranges.ts";
import { normalizeMacros } from "../../../../lib/spreadsheet/macros";
import { normalizeRules } from "@mrnote/core/web/lib/spreadsheet/data-validation.ts";
import { normalizeSparklines, SPARKLINE_NATIVE_GRAPH_BLOCKER } from "@mrnote/core/web/lib/spreadsheet/sparkline.ts";
import { normalizeSlicers } from "../../../../lib/spreadsheet/slicer";
import { normalizeTableColumnNames, normalizeDataTables, tableTotalCellValue, type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type SheetProtectionOptions } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { normalizeProtectedEditRanges } from "@mrnote/core/web/lib/spreadsheet/protected-ranges.ts";
import { migrateLegacyComment } from "@mrnote/core/web/lib/spreadsheet/comments.ts";
import { clampColumnWidth, clampRowHeight, NEW_SHEET_DEFAULT_COLUMN_WIDTH_PX } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { normalizeOutlineGroups } from "@mrnote/core/web/lib/spreadsheet/outline-groups.ts";
import { normalizeManualHidden, serializeManualHidden } from "@mrnote/core/web/lib/spreadsheet/manual-hidden.ts";
import { normalizeConditionFilter, type ConditionFilter } from "@mrnote/core/web/lib/spreadsheet/filter-conditions.ts";
import { normalizeChartNativeLook } from "@mrnote/core/web/lib/office-chart-native-look.ts";
import { normalizePresentationChartSeriesStyles, normalizePresentationChartSliceStyles } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { normalizeCharts, normalizeChartSeriesGradientStyles, normalizeChartValueAxisNumberFormat, normalizeSpreadsheetChartColorPalette, normalizeSpreadsheetChartStyle } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { rememberLoadedSpelling } from "../../../../lib/spreadsheet/loaded-spelling";
import { normalizePivotConfig, pivotWithSharedSnapshot, unifyPivotCacheSnapshots, normalizePivotRange, type PivotConfig } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { newSheetPrintSettings, normalizePrintSettings, parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { isSpreadsheetInkShapeStyle, normalizeShapeStyle, repairShapeObjectAnchor } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { normalizeShadow } from "@mrnote/core/web/lib/spreadsheet/shape-effects.ts";
import { normalizeRules as normalizeConditionalRules } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { normalizeTabColor } from "../../../../lib/spreadsheet/fill-series";
import { normalizeNamedSheetViewId, normalizeNamedSheetViews, pruneSheetViewTables } from "../../../../lib/spreadsheet/sheet-views";
import { type SheetModel, type SpreadsheetAdvancedFilterState, type SpreadsheetObject } from "./spreadsheetSheetModel";
import { DEFAULT_SHEET_COLUMNS, DEFAULT_SHEET_ROWS, MAX_SHEET_COLS, MAX_SHEET_ROWS, SPREADSHEET_CELL_HEIGHT_PX, SPREADSHEET_CELL_WIDTH_PX } from "./spreadsheetGridConstants";
import { spreadsheetRangeA1 } from "./spreadsheetRangeA1";

export function emptySheet(): SheetModel {
  return {
    id: "sheet-1",
    name: defaultSheetName(1),
    rowCount: DEFAULT_SHEET_ROWS,
    columnCount: DEFAULT_SHEET_COLUMNS,
    // Excel's 8.43-character default column (XLS-A095).
    defaultColumnWidth: NEW_SHEET_DEFAULT_COLUMN_WIDTH_PX,
    cells: {},
    printSettings: newSheetPrintSettings(),
  };
}

function normalizeCell(raw: unknown, intern?: CellStyleInterner): SpreadsheetCell | null {
  if (raw && typeof raw === "object" && "value" in raw) {
    const record = raw as SpreadsheetCell;
    // A formula cell's raw input is its value; `formula` only marks it. AI
    
    // value, which read as a blank cell that never calculated.
    const value = record.value === "" && typeof record.formula === "string" && record.formula.trim().startsWith("=")
      ? record.formula
      : String(record.value ?? "");
    // The empty string a workbook stored (an inline `<is><t></t></is>` with
    // no style, E06) is a value, not a blank: kept, it stops a neighbour's
    // text from running over it, as in Excel (X-031).
    if (!value && !hasCellMetadata(record) && record.stringValue !== true) return null;
    const next: SpreadsheetCell = {
      ...record,
      value,
      kind:
        record.kind === "number" || record.kind === "text"
          ? record.kind
          : cellKind(value),
    };
    if (typeof record.formula === "string" && record.formula) {
      next.formula = record.formula;
    }
    // A picture is the cell's value only beside its `#VALUE!` fallback; a
    // leftover beside any other value holds nothing and is dropped.
    if (record.picture !== undefined) {
      const picture = readCellPicture(next);
      if (picture) next.picture = picture;
      else delete next.picture;
    }
    if (typeof record.hyperlink === "string" && record.hyperlink) {
      next.hyperlink = record.hyperlink;
    }
    if (record.style && typeof record.style === "object") {
      // One shared, frozen object per distinct style on a page load
      // (createCellStyleInterner); a copy of its own otherwise.
      next.style = intern
        ? (intern(record.style as Record<string, unknown>) as SpreadsheetCell["style"])
        : { ...record.style };
    }
    if (record.comment && typeof record.comment === "object") {
      // Normalize the explicit native identity. Legacy plain text remains a
      // Note; a legacy thread array remains a threaded Comment.
      const migrated = migrateLegacyComment(record.comment);
      if (migrated) {
        next.comment = migrated;
      } else {
        delete next.comment;
      }
    }
    return next;
  }
  if (raw !== undefined && raw !== null && String(raw) !== "") {
    const value = String(raw);
    return { value, kind: cellKind(value) };
  }
  return null;
}


function isExplicitDefaultBlankRecord(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const style = record.style;
  return (
    (record.value === "" || record.value === undefined || record.value === null) &&
    Boolean(style) &&
    typeof style === "object" &&
    !Array.isArray(style) &&
    Object.keys(style as object).length === 0 &&
    Object.keys(record).every((key) => key === "value" || key === "kind" || key === "style")
  );
}

/** The sheet with its line-formatted positions' empty records restored. */
function withExplicitDefaultBlanks<S extends SheetModel>(
  sheet: S,
  rawCells: Record<string, unknown>,
): S {
  if (!sheet.rowStyles && !sheet.columnStyles) return sheet;
  let cells: CellMap | null = null;
  for (const [key, raw] of Object.entries(rawCells)) {
    if (sheet.cells[key] !== undefined || !isExplicitDefaultBlankRecord(raw)) continue;
    const separator = key.indexOf(":");
    const row = Number(key.slice(0, separator));
    const col = Number(key.slice(separator + 1));
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    if (!lineStyleAt(sheet.rowStyles, sheet.columnStyles, row, col)) continue;
    cells ??= { ...sheet.cells };
    cells[key] = { ...EXPLICIT_DEFAULT_BLANK_CELL, style: {} };
  }
  return cells ? { ...sheet, cells } : sheet;
}

function normalizeAnchorPoint(
  raw: unknown,
): SpreadsheetAnchorPoint | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const point = raw as Record<string, unknown>;
  const row = Number(point.row ?? 0);
  const column = Number(point.column ?? point.col ?? 0);
  if (!Number.isFinite(row) || !Number.isFinite(column)) return undefined;
  return {
    ...point,
    row: Math.max(0, Math.floor(row)),
    column: Math.max(0, Math.floor(column)),
  };
}

function normalizeAnchor(raw: unknown): SpreadsheetObjectAnchor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const anchor = raw as SpreadsheetObjectAnchor;
  const kind =
    anchor.kind === "oneCell" ||
    anchor.kind === "twoCell" ||
    anchor.kind === "absolute"
      ? anchor.kind
      : "oneCell";
  const normalized: SpreadsheetObjectAnchor = {
    ...anchor,
    kind,
    from: normalizeAnchorPoint(anchor.from),
    to: normalizeAnchorPoint(anchor.to),
  };
  if (anchor.flipH === true) normalized.flipH = true;
  else delete normalized.flipH;
  if (anchor.flipV === true) normalized.flipV = true;
  else delete normalized.flipV;
  return normalized;
}

export function normalizeObjects(raw: unknown): SpreadsheetObject[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap<SpreadsheetObject>((item, index) => {
    if (!item || typeof item !== "object") return [];
    const object = item as Record<string, unknown>;
    if (object.type === "image" && typeof object.src === "string") {
      const cropRect = normalizeSignedCropRect(object.cropRect);
      return [
        {
          ...object,
          id: String(object.id || `object-${index + 1}`),
          type: "image" as const,
          src: object.src,
          alt: typeof object.alt === "string" ? object.alt : "",
          caption: typeof object.caption === "string" ? object.caption : "",
          hidden: object.hidden === true ? true : undefined,
          nativeVisibilityBlocker:
            typeof object.nativeVisibilityBlocker === "string"
              ? object.nativeVisibilityBlocker
              : undefined,
          shadow: normalizeShadow(object.shadow),
          pictureEffects: normalizeSpreadsheetPictureEffects(object.pictureEffects, object),
          ...(cropRect && !isIdentityCrop(cropRect) ? { cropRect } : {}),
          nativeImageCropBlocker:
            typeof object.nativeImageCropBlocker === "string"
              ? object.nativeImageCropBlocker
              : undefined,
          pictureStyle: isOfficePictureStyleId(object.pictureStyle)
            ? object.pictureStyle
            : undefined,
          pictureGeometry: (() => {
            const raw = object.pictureGeometry as { preset?: unknown; adjustments?: unknown } | undefined;
            const preset = normalizeOfficePictureGeometry(raw?.preset);
            if (!preset || preset === "rect") return undefined;
            const adjustments = normalizeOfficePictureGeometryAdjustments(preset, raw?.adjustments);
            return { preset, ...(adjustments ? { adjustments } : {}) };
          })(),
          nativePictureStyleBlocker:
            typeof object.nativePictureStyleBlocker === "string"
              ? object.nativePictureStyleBlocker
              : undefined,
          nativeImageContentBlocker:
            object.nativeImageContentBlocker === "shared-media-part"
              ? object.nativeImageContentBlocker
              : undefined,
          anchor: normalizeAnchor(object.anchor),
        },
      ];
    }
    if (object.type === "shape") {
      const shape = normalizeShapeStyle(object.shape);
      const anchor = normalizeAnchor(object.anchor);
      // A forged/unbounded ink point string is not a visible shape. Drop that
      // object at the editor edge instead of preserving a fake selectable box.
      if (
        shape.kind === "ink" &&
        (!isSpreadsheetInkShapeStyle(shape) ||
          anchor?.kind !== "absolute" ||
          !Number.isFinite(anchor.xEmu) ||
          !Number.isFinite(anchor.yEmu) ||
          !Number.isFinite(anchor.widthEmu) ||
          !Number.isFinite(anchor.heightEmu))
      ) {
        return [];
      }
      return [
        {
          ...object,
          id: String(object.id || `object-${index + 1}`),
          type: "shape" as const,
          name: typeof object.name === "string" ? object.name : undefined,
          hidden: object.hidden === true ? true : undefined,
          nativeVisibilityBlocker:
            typeof object.nativeVisibilityBlocker === "string"
              ? object.nativeVisibilityBlocker
              : undefined,
          // Style sub-object validated + defaulted by the pure helper.
          shape,
          shadow: normalizeShadow(object.shadow),
          anchor,
        },
      ];
    }
    if (object.type === "smartart") {
      // Preserve-only native diagram. Everything about it is the source file's,
      // so nothing is defaulted here: an object the shared reader cannot prove
      // is dropped rather than drawn as an empty selectable box.
      if (!readSpreadsheetNativeSmartArt(object)) return [];
      return [
        {
          ...object,
          id: String(object.id || `object-${index + 1}`),
          type: "smartart" as const,
          name: typeof object.name === "string" ? object.name : undefined,
          hidden: object.hidden === true ? true : undefined,
          anchor: normalizeAnchor(object.anchor),
        },
      ];
    }
    if (object.type !== "chart") return [];
    const data = object.data as
      { headers?: unknown; rows?: unknown } | null | undefined;
    return [
      {
        ...object,
        id: String(object.id || `object-${index + 1}`),
        type: "chart" as const,
        name: typeof object.name === "string" ? object.name : undefined,
        hidden: object.hidden === true ? true : undefined,
        nativeVisibilityBlocker:
          typeof object.nativeVisibilityBlocker === "string"
            ? object.nativeVisibilityBlocker
            : undefined,
        title: typeof object.title === "string" ? object.title : "",
        chartType:
          typeof object.chartType === "string" ? object.chartType : "chart",
        // The shared model and its binding travel together (see normalizeChart).
        ...(() => {
          const chartV2 = normalizeSpreadsheetChartV2(object.chartV2);
          const binding = normalizeSpreadsheetChartBinding(object.binding);
          return chartV2 && binding ? { chartV2, binding } : { chartV2: undefined, binding: undefined };
        })(),
        // A chart the shared reader could not state at import: preserve-only (its reasons).
        ...(object.chartV2Preserve && typeof object.chartV2Preserve === "object" && !Array.isArray(object.chartV2Preserve)
          ? { chartV2Preserve: object.chartV2Preserve }
          : {}),
        ...(object.chartVisibility === undefined ? {} : { chartVisibility: normalizeChartVisibility(object.chartVisibility) }),
        chartStyle: normalizeSpreadsheetChartStyle(object.chartStyle),
        chartColorPalette: normalizeSpreadsheetChartColorPalette(
          object.chartColorPalette,
        ),
        seriesStyles: normalizePresentationChartSeriesStyles(
          object.seriesStyles,
        ),
        seriesGradientStyles: normalizeChartSeriesGradientStyles(
          object.seriesGradientStyles,
        ),
        sliceStyles: normalizePresentationChartSliceStyles(
          object.sliceStyles,
        ),
        nativeChartColorBlocker:
          typeof object.nativeChartColorBlocker === "string"
            ? object.nativeChartColorBlocker
            : undefined,
        nativeChartColorEditBlocker:
          typeof object.nativeChartColorEditBlocker === "string"
            ? object.nativeChartColorEditBlocker
            : undefined,
        nativeChartStyleBlocker:
          typeof object.nativeChartStyleBlocker === "string"
            ? object.nativeChartStyleBlocker
            : undefined,
        nativeLook: normalizeChartNativeLook(object.nativeLook),
        mapRegionCodes: normalizeSpreadsheetChartMapRegionCodes(object.mapRegionCodes),
        caption: typeof object.caption === "string" ? object.caption : "",
        ranges: Array.isArray(object.ranges)
          ? object.ranges
              .filter((range): range is string => typeof range === "string")
              .slice(0, 50)
          : [],
        // Chart editor (additive): carry the singular A1 range + toggles when
        // present so the editor and MiniChart can read them; defaults are filled
        // by normalizeChartConfig at the edit/render call sites.
        range: typeof object.range === "string" ? object.range : undefined,
        showLegend:
          typeof object.showLegend === "boolean"
            ? object.showLegend
            : undefined,
        legendPosition:
          object.legendPosition === "bottom" ||
          object.legendPosition === "top" ||
          object.legendPosition === "left" ||
          object.legendPosition === "right" ||
          object.legendPosition === "topRight"
            ? object.legendPosition
            : undefined,
        nativeChartLegendPositionBlocker:
          typeof object.nativeChartLegendPositionBlocker === "string"
            ? object.nativeChartLegendPositionBlocker
            : undefined,
        showAxisLabels:
          typeof object.showAxisLabels === "boolean"
            ? object.showAxisLabels
            : undefined,
        showDataLabels:
          typeof object.showDataLabels === "boolean"
            ? object.showDataLabels
            : undefined,
        axisTitleX:
          typeof object.axisTitleX === "string" ? object.axisTitleX : undefined,
        axisTitleY:
          typeof object.axisTitleY === "string" ? object.axisTitleY : undefined,
        valueAxisNumberFormat: normalizeChartValueAxisNumberFormat(
          object.valueAxisNumberFormat,
        ),
        showGridlines:
          typeof object.showGridlines === "boolean"
            ? object.showGridlines
            : undefined,
        showDataTable:
          typeof object.showDataTable === "boolean"
            ? object.showDataTable
            : undefined,
        shadow: normalizeShadow(object.shadow),
        data:
          data && typeof data === "object"
            ? {
                headers: Array.isArray(data.headers)
                  ? data.headers
                      .map((value) => String(value ?? ""))
                      .slice(0, 20)
                  : [],
                rows: Array.isArray(data.rows)
                  ? data.rows
                      .filter((row): row is unknown[] => Array.isArray(row))
                      .slice(0, 200)
                      .map((row) =>
                        row.map((value) => String(value ?? "")).slice(0, 20),
                      )
                  : [],
              }
            : undefined,
        anchor: normalizeAnchor(object.anchor),
      },
    ];
  });
}

export function hasPersistedContentVersion(
  page: PageItem | null | undefined,
): page is PageItem & { content_version: number } {
  return (
    Number.isSafeInteger(page?.content_version) &&
    (page?.content_version ?? 0) >= 1
  );
}

/**
 * Repair shape anchors written by an older build before validation.
 *
 * The shape factory used to emit `{ from: { row, col } }` with no `kind`, which
 * the page schema rejects — and a failed parse here yields ZERO sheets, so one
 * old shape blanked the whole workbook, cells and all. Repairing first turns
 * that back into a workbook; a content with no shapes is returned untouched.
 */
function repairLegacyShapeAnchors(
  content: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!content || typeof content !== "object") return content;
  const sheets = (content as { sheets?: unknown }).sheets;
  if (!Array.isArray(sheets)) return content;
  let touched = false;
  const nextSheets = sheets.map((sheet) => {
    if (!sheet || typeof sheet !== "object") return sheet;
    const objects = (sheet as { objects?: unknown }).objects;
    if (!Array.isArray(objects)) return sheet;
    let sheetTouched = false;
    const nextObjects = objects.map((object) => {
      const repaired = repairShapeObjectAnchor(object);
      if (repaired !== object) sheetTouched = true;
      return repaired;
    });
    if (!sheetTouched) return sheet;
    touched = true;
    return { ...(sheet as Record<string, unknown>), objects: nextObjects };
  });
  return touched ? { ...content, sheets: nextSheets } : content;
}

function repairFreezeSplitConflict(
  content: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!content || !Array.isArray(content.sheets)) return content;
  const positiveInteger = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value > 0;
  let changed = false;
  const sheets = content.sheets.map((rawSheet) => {
    if (!rawSheet || typeof rawSheet !== "object" || Array.isArray(rawSheet)) {
      return rawSheet;
    }
    const candidate = rawSheet as Record<string, unknown>;
    const frozen =
      positiveInteger(candidate.freezeRows) ||
      positiveInteger(candidate.freezeCols);
    const split =
      positiveInteger(candidate.splitRow) || positiveInteger(candidate.splitCol);
    if (!frozen || !split) return rawSheet;
    changed = true;
    const repaired = { ...candidate };
    delete repaired.splitRow;
    delete repaired.splitCol;
    delete repaired.splitPaneState;
    return repaired;
  });
  return changed ? { ...content, sheets } : content;
}

/** What a load learned about the stored content, beyond the sheets it gave. */
export interface NormalizeSheetsOutcome {
  /**
   * The stored workbook has sheets but did not pass the content schema. What
   * is shown is then either the workbook with the unreadable values left out
   * or, when that cannot be done, nothing; in both cases the editor must not
   * save, because a save would write that reduced workbook over the stored
   * one. Before this was reported, such a page opened as an ordinary EMPTY,
   * editable sheet, and the first edit autosaved the blank over the data.
   */
  schemaRejected: boolean;
  /**
   * The values the load left out so the rest of the workbook reads, each
   * where it was: a sheet's by that sheet's id. Set only when every value
   * left out could be placed back, which is what lets the workbook stay
   * editable: every save puts these back where the save does not hold
   * something there (``restoreSetAsideValues``), so nothing stored is lost.
   */
  setAside?: SpreadsheetSetAsideValue[];
}

export function normalizeSheets(
  stored: Record<string, unknown> | undefined,
  outcome?: NormalizeSheetsOutcome,
  /** The page is opening on its stored active sheet: a large workbook's other
   * sheets write their line-format blanks when they are shown. */
  options?: { deferOtherSheetsLineBlanks?: boolean },
): SheetModel[] {
  // A body with each distinct cell style stored once reads as the inline
  // form the editor keeps (lib/spreadsheet/cell-style-table.ts). Its objects'
  // provenance and ids as every writer now keeps them: a provenance record an
  // older AI writer left in `source` is no import identity, and no two
  // objects of the workbook share an id (lib/spreadsheet/object-identities).
  const content = normalizeSpreadsheetObjectIdentities(expandCellStyleTable(stored));
  const parse = (candidate: Record<string, unknown> | undefined) =>
    spreadsheetPageContentSchema.safeParse(
      repairLegacyShapeAnchors(
        repairFreezeSplitConflict(normalizeSpreadsheetImportDimensions(candidate)),
      ),
    );
  let parsed = parse(content);
  if (
    !parsed.success &&
    content &&
    Array.isArray(content.sheets) &&
    content.sheets.length > 0
  ) {
    if (outcome) outcome.schemaRejected = true;
    if (process.env.NODE_ENV !== "production") {
      // Name what was refused: the read-only banner alone cannot say which
      // field a writer produced that the page schema does not accept.
      console.warn(
        "[spreadsheet] page content failed the schema; read-only",
        JSON.stringify(
          parsed.error.issues.slice(0, 12).map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        ),
      );
    }
    // Show the user their workbook rather than a blank: leave out what cannot
    // be read and try again. Removing a value can surface an issue it was
    // hiding, so allow a few rounds, then give up and show nothing.
    let candidate: Record<string, unknown> | null = content;
    const removed: Array<SchemaRemovedValue> = [];
    for (let round = 0; round < 3 && candidate && !parsed.success; round += 1) {
      candidate = withoutSchemaIssues(candidate, parsed.error.issues, removed);
      if (candidate) parsed = parse(candidate);
    }
    // A workbook whose every unreadable value can be placed back on save is
    // not read-only: one value the editor cannot read no longer shuts the
    // whole workbook. It stays editable, and each save carries those values
    // back where they were (restoreSetAsideValues).
    const setAside = parsed.success ? anchorSetAsideValues(content, removed) : null;
    if (outcome && setAside) {
      outcome.schemaRejected = false;
      outcome.setAside = setAside;
    }
  }
  const sheets = parsed.success ? parsed.data.sheets : [];
  const legacyHideGridlines = content?.hideGridlines === true;
  const legacyHideHeadings = content?.hideHeadings === true;
  const legacyShowFormulas = content?.showFormulas === true;
  const sheetViewMode = (mode: unknown): SheetModel["viewMode"] =>
    mode === "pageLayout" || mode === "pageBreakPreview" ? mode : undefined;
  const legacyViewMode = sheetViewMode(content?.viewMode);
  const internStyle = createCellStyleInterner();
  const prepared = sheets.map((rawSheet, index) => {
    // Column maps the page keeps as runs (`columnWidthRuns`, ...) are held
    // per column; the save stores them as runs again (lib/spreadsheet/column-runs).
    // The column formats are normalized from what the page stores, runs and
    // all, below: expanded here first, a format over every column was 16,384
    // keys a sheet that the normalization then walked, sorted and wrote again
    // (R116-X02's 72 sheets: 0.4 s of its open).
    const {
      columnStyles: storedColumnFormats,
      columnStyleRuns: storedColumnFormatRuns,
      ...withoutColumnFormats
    } = rawSheet as unknown as Record<string, unknown>;
    const sheet = withColumnRunsExpanded(withoutColumnFormats);
    let cells: CellMap = {};
    const rawCells =
      sheet.cells && typeof sheet.cells === "object"
        ? (sheet.cells as Record<string, unknown>)
        : {};
    for (const [key, raw] of Object.entries(rawCells)) {
      const cell = normalizeCell(raw, internStyle);
      if (cell) cells[key] = cell;
    }
    let rowCount = Math.max(1, Number(sheet.rowCount || 20));
    const columnCount = Math.max(1, Number(sheet.columnCount || 10));
    // Formatted blank cells the page stores as ranges (blankCellFormats) become
    // ordinary cells here, so every editing path — render, type, paste, fill,
    // Clear Formats, sort, undo — sees exactly what it always saw for a blank
    // an older page stored one entry at a time. A position the page holds an
    // entry for keeps that entry, even one normalizeCell just dropped. The
    // ranges ride along under a symbol key as the save hint (buildContent).
    const blankCellFormats = hydrateBlankCellFormats(
      cells as Record<string, unknown>,
      rawCells,
      sheet.blankCellFormats,
      rowCount,
      columnCount,
    );
    // Clamp persisted freeze counts to the (normalized) sheet dimensions so a
    // stale freeze never swallows the whole grid or exceeds its bounds.
    const { freezeRows, freezeCols } = readFreezeConfig({
      freezeRows: sheet.freezeRows,
      freezeCols: sheet.freezeCols,
      rowCount,
      columnCount,
    });
    // Clamp persisted split lines to the (normalized) sheet dimensions so a stale
    // split divider never lands past the grid edge. Freeze and split are mutually
    // exclusive (see freeze-panes.ts); a hand-edited file that set BOTH has the
    // split dropped here so freeze wins deterministically (a single divider axis).
    const splitConfig = readSplitConfig({
      splitRow: sheet.splitRow,
      splitCol: sheet.splitCol,
      rowCount,
      columnCount,
    });
    const splitRow =
      freezeRows > 0 || freezeCols > 0 ? 0 : splitConfig.splitRow;
    const splitCol =
      freezeRows > 0 || freezeCols > 0 ? 0 : splitConfig.splitCol;
    // Column-width / row-height overrides (Excel parity): keep only entries that
    // address a line inside the (normalized) bounds, clamping each value to the
    // draggable range so a stale/out-of-range size never escapes. Dropped when
    // empty so the no-resize render path is byte-identical to before.
    // A width equal to the default is dropped as no width of its own; the
    // default is the sheet's (a new sheet's is 64px, XLS-A095), not the
    // built-in 80px, or a column set to 80px came back at 64px on
    // reopening (sheet model fuzz).
    const columnWidths = normalizeSizeMap(
      sheet.columnWidths,
      columnCount,
      sheet.nativeGrid ? nativeColumnCssClamp : clampColumnWidth,
      typeof sheet.defaultColumnWidth === "number" && Number.isFinite(sheet.defaultColumnWidth)
        ? clampColumnWidth(sheet.defaultColumnWidth, SPREADSHEET_CELL_WIDTH_PX)
        : SPREADSHEET_CELL_WIDTH_PX,
      Boolean(sheet.nativeGrid),
    );
    const rowHeights = normalizeSizeMap(
      sheet.rowHeights,
      rowCount,
      normalizeNativeGrid(sheet.nativeGrid)?.rowMetrics ? nativeRowCssClamp : clampRowHeight,
      SPREADSHEET_CELL_HEIGHT_PX,
      true,
    );
    // The file's sort state is kept as the file states it: Excel records the
    // whole block it sorted (A4:V732 over a page 17 columns wide, R452-X04),
    // and spelled again or dropped for reaching past the page's grid, a save
    
    // Reapply still reads it against the grid (`reapplySortPlan`).
    const sortState = rememberLoadedSpelling(
      normalizeSpreadsheetSortState(
        sheet.sortState,
        MAX_SHEET_ROWS,
        MAX_SHEET_COLS,
      ),
      sheet.sortState,
    );
    const advancedFilterState = normalizeSpreadsheetAdvancedFilterState(
      sheet.advancedFilterState,
      rowCount,
      columnCount,
    );
    const conditionFilters: Record<string, ConditionFilter> = {};
    if (
      sheet.conditionFilters &&
      typeof sheet.conditionFilters === "object" &&
      !Array.isArray(sheet.conditionFilters)
    ) {
      for (const [key, rawCondition] of Object.entries(
        sheet.conditionFilters,
      )) {
        const column = Number(key);
        const condition = normalizeConditionFilter(rawCondition);
        if (
          Number.isInteger(column) &&
          column >= 0 &&
          column < columnCount &&
          condition
        ) {
          conditionFilters[String(column)] = condition;
        }
      }
    }
    const valueFilters: Record<string, string[]> = {
      ...((sheet.filters as Record<string, string[]> | undefined) ?? {}),
    };
    const autoFilterId = normalizeNamedSheetViewId(sheet.autoFilterId) ?? undefined;
    const rawAutoFilterRef =
      typeof sheet.autoFilterRef === "string" &&
      sheet.autoFilterRef === sheet.autoFilterRef.trim()
        ? sheet.autoFilterRef.toUpperCase()
        : undefined;
    const autoFilterBounds = rawAutoFilterRef
      ? parseA1Range(rawAutoFilterRef.replace(/\$/g, ""))
      : null;
    const autoFilterRef =
      autoFilterBounds &&
      autoFilterBounds.r2 < rowCount &&
      autoFilterBounds.c2 < columnCount
        ? rawAutoFilterRef
        : undefined;
    const namedSheetViews = normalizeNamedSheetViews(
      sheet.namedSheetViews,
      rowCount,
      columnCount,
      autoFilterRef,
    ).map((view) =>
      view.filterId &&
      (!autoFilterId ||
        view.filterId !== autoFilterId ||
        (view.ref !== undefined &&
          view.ref.replace(/\$/g, "") !== autoFilterRef?.replace(/\$/g, "")))
        ? { ...view, nativeBlocker: "named_sheet_view_filter_identity_mismatch" }
        : view,
    );
    const namedSheetViewsOwnsAutoFilter =
      sheet.namedSheetViewsOwnsAutoFilter === true &&
      Boolean(
        autoFilterId &&
          autoFilterRef &&
          namedSheetViews.some((view) => view.filterId === autoFilterId),
      );
    // One column has one native criteria family. Typed conditions take
    // precedence over a malformed/legacy mixed payload and remove the stale
    // value list before the first autosave or patchback comparison.
    for (const column of Object.keys(conditionFilters)) {
      delete valueFilters[column];
    }
    // Merged cells (Excel parity): normalize the persisted span list and drop any
    // span whose anchor sits outside the (normalized) bounds. The span itself is
    // clamped so it never extends past the grid edge. Dropped when empty so the
    // no-merge render path is byte-identical to before.
    const merges = normalizeMerges(sheet.merges)
      .filter((span) => span.row < rowCount && span.col < columnCount)
      .map((span) => ({
        ...span,
        rowSpan: Math.max(1, Math.min(span.rowSpan, rowCount - span.row)),
        colSpan: Math.max(1, Math.min(span.colSpan, columnCount - span.col)),
      }))
      .filter((span) => span.rowSpan > 1 || span.colSpan > 1);
    // Keep cells + merges consistent on load: only a merge's top-left anchor
    // carries a value, so clear any value a hand-edited/imported file left on a
    // covered (merged-away) cell. Without this, both the cell map and the merge
    // span would claim a value for the same coordinate.
    //
    // Clear the VALUE only. In SpreadsheetML a merged block's side rules live
    // on the covered cells (the projection materialises them there on purpose);
    // deleting the whole record silently dropped the block's perimeter borders
    // from every later export. A covered cell that carries a style keeps it.
    for (const key of coveredCells(merges)) {
      const covered = cells[key];
      // An already empty covered cell still owns its native metadata.
      if (covered?.value === "" && !covered.formula && !covered.runs?.length) continue;
      if (covered?.style && Object.keys(covered.style).length > 0) {
        cells[key] = { value: "", style: covered.style };
      } else {
        delete cells[key];
      }
    }
    // Outline groups (Excel parity): normalize the persisted row/column groups,
    // clamping ranges into bounds and rebuilding the legal (non-crossing,
    // depth-capped) subset. Dropped when empty so the no-outline render path is
    // byte-identical to before.
    const outlineGroups = normalizeOutlineGroups(sheet.outlineGroups, {
      rowCount,
      columnCount,
    });
    // Manually hidden rows/columns (Excel "Hide", distinct from outline groups):
    // normalize the persisted absolute-index arrays into in-bounds sorted lists.
    // Dropped when empty so the no-hidden render/save path stays byte-identical.
    const manuallyHiddenRows = serializeManualHidden(
      normalizeManualHidden(sheet.manuallyHiddenRows, rowCount),
    );
    const manuallyHiddenCols = serializeManualHidden(
      normalizeManualHidden(sheet.manuallyHiddenCols, columnCount),
    );
    // Reading 998: the hidden rows the file writes 0 points high, kept only
    // while they are hidden (a subset of manuallyHiddenRows).
    const zeroHeightRows =
      manuallyHiddenRows && Array.isArray(sheet.zeroHeightRows) && sheet.zeroHeightRows.length > 0
        ? (() => {
            const listed = new Set(manuallyHiddenRows);
            return serializeManualHidden(
              new Set([...normalizeManualHidden(sheet.zeroHeightRows, rowCount)].filter((row) => listed.has(row))),
            );
          })()
        : undefined;
    // Row / column formats: validated through the cell style normalizer, then
    // materialized onto the grid's blank positions below (as the blank-cell
    // ranges are), so the grid renders them without a per-cell entry in the
    // page. Dropped when empty so the no-format save path stays byte-identical.
    // One normalization per stored format object: a run of columns expanded
    // a key per column, and the rows a style table shared, all name the same
    // object (the 60-chart workbook normalized one format thousands of times).
    const lineStylesSeen = new Map<object, LineStyleMap[string] | null>();
    const lineStyleOf = (style: unknown) => {
      if (!style || typeof style !== "object" || Array.isArray(style)) return null;
      if (lineStylesSeen.has(style)) return lineStylesSeen.get(style) ?? null;
      const normalizedLine = lineStyleOfStored(style);
      lineStylesSeen.set(style, normalizedLine);
      return normalizedLine;
    };
    const lineStyleOfStored = (style: object) => {
      // The line's default protection rides with its format (B501): an XLSX
      // column unlocked for a template's input keeps its blank cells writable.
      const { locked, ...visual } = style as Record<string, unknown>;
      const normalized =
        (normalizeCell({ value: "", style: visual })?.style as LineStyleMap[string] | undefined) ?? {};
      return locked === false ? { ...normalized, locked: false } : Object.keys(normalized).length ? normalized : null;
    };
    const rowStyles = normalizeLineStyles(sheet.rowStyles, MAX_SHEET_ROWS, lineStyleOf, true);
    // Column formats stored as runs (`columnStyleRuns`) are held per column.
    const columnStyles = normalizeLineStyles(
      storedColumnStyles({ columnStyles: storedColumnFormats, columnStyleRuns: storedColumnFormatRuns }),
      MAX_SHEET_COLS,
      lineStyleOf,
    );
    // Named ranges (Excel parity): normalize/validate the persisted name list.
    // Dropped when empty so the no-name path stays byte-identical.
    const namedRanges = normalizeNamedRanges(sheet.namedRanges);
    // Recorded macros (Excel parity): normalize the persisted macro list. Dropped
    // when empty so the no-macro path stays byte-identical.
    const macros = normalizeMacros(sheet.macros);
    // Data validation (Excel parity): normalize/validate the persisted rule
    // list. Dropped when empty so the no-validation path stays byte-identical.
    const validations = normalizeRules(sheet.validations);
    // Sparklines (Excel parity): normalize/validate the persisted per-cell mini
    // charts (drops malformed entries + bad colors). Dropped when empty so the
    // no-sparkline render path stays byte-identical.
    const sparklines = normalizeSparklines(sheet.sparklines);
    const sparklineCount = Object.keys(sparklines).length;
    // Slicers (Excel parity): normalize/validate the persisted slicer panels —
    // drops a slicer on an out-of-range column (e.g. a stale slicer on a column
    // deleted since save) so it never references past the grid, and one slicer
    // per column. Dropped when empty so the no-slicer render/save path stays
    // byte-identical.
    const slicers = normalizeSlicers(sheet.slicers, columnCount);
    // Floating charts (Excel parity): normalize/validate the persisted chart
    // list — drops a malformed entry / duplicate id and clamps each chart's range
    // into the grid. Dropped when empty so the no-chart render/save path stays
    // byte-identical.
    const charts = normalizeCharts(sheet.charts);
    // Structured data tables (Excel parity): normalize/validate the persisted
    // table list — clamps a stale range into THIS sheet's grid and drops a
    // duplicate id / malformed entry. Dropped when empty so the no-table render/
    // save path stays byte-identical.
    const normalizedDataTables = normalizeDataTables(sheet.dataTables, {
      rowCount,
      columnCount,
    });
    // A workbook import's cells are the file's: its totals row shows what
    // the file stores, an empty row included (X-193, S12_totalsRowShown:
    // Excel shows no "Total" where the file states no totalsRowLabel). Only
    // a page of MRAI's own predating physical totals cells is upgraded.
    const materializedTables = sheet.nativeGrid
      ? { cells, rowCount, dataTables: normalizedDataTables }
      : materializePersistedTableTotals(cells, normalizedDataTables, rowCount);
    cells = materializedTables.cells;
    rowCount = materializedTables.rowCount;
    const dataTables = materializedTables.dataTables;
    // Conditional formatting (Excel parity): normalize/validate the persisted
    // rule list (drops bad ranges/operators/values and any rule with no valid
    // hex color). Each rule's range is clamped to THIS sheet's last row/column
    // (rowCount-1 / columnCount-1) so a rule persisted against a larger sheet can
    // never address a cell outside the current grid. Dropped when empty so the
    // no-CF path stays byte-identical.
    const conditionalFormats = rememberLoadedSpelling(
      normalizeConditionalRules(
        sheet.conditionalFormats,
        { maxRow: rowCount - 1, maxCol: columnCount - 1 },
      ),
      sheet.conditionalFormats,
    );
    // Sheet tab color (Excel parity): normalize the persisted accent to the
    // canonical #rrggbb form (or drop it when absent/invalid) so the no-color
    // render path stays byte-identical to before.
    const tabColor = normalizeTabColor(sheet.tabColor);
    const tabColorNativeBlocker =
      typeof sheet.tabColorNativeBlocker === "string" &&
      sheet.tabColorNativeBlocker
        ? sheet.tabColorNativeBlocker.slice(0, 255)
        : undefined;
    // Preserve the OOXML-only veryHidden nuance while still mapping either
    // non-visible state to the editor's boolean hidden model. Invalid/stale
    // values are dropped. An explicit Unhide removes both fields below.
    const sheetState: SheetModel["sheetState"] =
      sheet.sheetState === "hidden" || sheet.sheetState === "veryHidden"
        ? sheet.sheetState
        : undefined;
    const isHidden = sheet.hidden === true || sheetState !== undefined;
    // Sheet protection (Excel parity): only a truthy flag is meaningful; a stale
    // `false`/absent is dropped so the unprotected render+save path stays
    // byte-identical to before. See lib/spreadsheet/protection (workflow guard).
    const isProtected = sheet.protected === true;
    const rawProtectionOptions = sheet.protectionOptions;
    const protectionOptionsRecord =
      isProtected &&
      typeof rawProtectionOptions === "object" &&
      rawProtectionOptions !== null &&
      !Array.isArray(rawProtectionOptions)
        ? (rawProtectionOptions as Record<string, unknown>)
        : null;
    const normalizedProtectionOptions: SheetProtectionOptions = {
      ...(protectionOptionsRecord?.allowSort === true ? { allowSort: true } : {}),
      ...(protectionOptionsRecord?.allowFormatCells === true
        ? { allowFormatCells: true }
        : {}),
    };
    const protectionOptions: SheetProtectionOptions | undefined =
      Object.keys(normalizedProtectionOptions).length > 0
        ? normalizedProtectionOptions
        : undefined;
    // Pivot table (Excel parity): normalize the persisted recipe. Field indices
    // are clamped to the SOURCE range width (so a stale config from a wider
    // range can't address past the data) and to the grid. Dropped entirely when
    // there is no usable recipe so the no-pivot render path stays byte-identical.
    // A PivotTable on a shared cache stands on the workbook's snapshot.
    const normalizeSheetPivot = (rawPivot: unknown): PivotConfig | undefined => {
      if (!rawPivot) return undefined;
      const hydrated = pivotWithSharedSnapshot(
        rawPivot,
        (content as { pivotCaches?: unknown } | undefined)?.pivotCaches,
      );
      const range = normalizePivotRange((hydrated as { source?: unknown }).source);
      const config = normalizePivotConfig(
        hydrated,
        range ? range.c2 - range.c1 : columnCount - 1,
      );
      // Mirror commitPivot's hasRecipe EXACTLY (incl. source-only) so a recipe
      // the save path persists is not silently dropped on reload — a source
      // range with no fields yet is a valid in-progress pivot the user should keep.
      return config.rows.length > 0 ||
        config.columns.length > 0 ||
        config.values.length > 0 ||
        config.source !== ""
        ? rememberLoadedSpelling(config, rawPivot)
        : undefined;
    };
    const pivot = normalizeSheetPivot(sheet.pivot);
    const hasPivot = pivot !== undefined;
    const morePivots = (Array.isArray(sheet.morePivots) ? sheet.morePivots : [])
      .map(normalizeSheetPivot)
      .filter((item): item is PivotConfig => item !== undefined);
    const normalizedSheet: SheetModel = {
      ...sheet,
      rowStyles,
      columnStyles,
      ...(sheet.nativeGrid !== undefined ? { nativeGrid: normalizeNativeGrid(sheet.nativeGrid) } : {}),
      id: String(sheet.id || `sheet-${index + 1}`),
      // A stored sheet without a name reads the same for every viewer.
      name: String(sheet.name || defaultSheetName(index + 1, "en")),
      rowCount,
      columnCount,
      cells,
      objects: sheet.objects === undefined ? undefined : normalizeObjects(sheet.objects),
      freezeRows: sheet.freezeRows === undefined && freezeRows === 0 ? undefined : freezeRows,
      freezeCols: sheet.freezeCols === undefined && freezeCols === 0 ? undefined : freezeCols,
      // Split divider lines: persist only when set (and only one of freeze/split
      // can be non-zero — enforced above). Override the `...sheet` passthrough so
      // a stale/out-of-range raw splitRow/splitCol can never leak unclamped, and
      // drop the keys entirely when there is no split so the no-split save path
      // stays byte-identical to before.
      splitRow: splitRow > 0 ? splitRow : undefined,
      splitCol: splitCol > 0 ? splitCol : undefined,
      ...(columnWidths ? { columnWidths } : {}),
      ...(rowHeights ? { rowHeights } : {}),
      filters:
        Object.keys(valueFilters).length > 0 ? valueFilters : undefined,
      autoFilterId,
      autoFilterRef,
      namedSheetViewsOwnsAutoFilter: namedSheetViewsOwnsAutoFilter
        ? (true as const)
        : undefined,
      namedSheetViews:
        namedSheetViews.length > 0
          ? pruneSheetViewTables(namedSheetViews, dataTables)
          : undefined,
      namedSheetViewsNativeBlocker:
        typeof sheet.namedSheetViewsNativeBlocker === "string" &&
        sheet.namedSheetViewsNativeBlocker
          ? sheet.namedSheetViewsNativeBlocker.slice(0, 255)
          : undefined,
      conditionFilters:
        Object.keys(conditionFilters).length > 0
          ? conditionFilters
          : undefined,
      sortState,
      advancedFilterState,
      ...(merges.length > 0 ? { merges } : {}),
      ...(outlineGroups.length > 0 ? { outlineGroups } : {}),
      // Outline Settings: only a cleared setting is stored (the passthrough
      // `true` or a malformed value reads as Excel's default below / right).
      outlineSummaryBelow:
        sheet.outlineSummaryBelow === false ? false : undefined,
      outlineSummaryRight:
        sheet.outlineSummaryRight === false ? false : undefined,
      outlineGroupsNativeBlocker:
        typeof sheet.outlineGroupsNativeBlocker === "string" &&
        sheet.outlineGroupsNativeBlocker
          ? sheet.outlineGroupsNativeBlocker.slice(0, 220)
          : undefined,
      ...(manuallyHiddenRows ? { manuallyHiddenRows } : {}),
      ...(zeroHeightRows ? { zeroHeightRows } : {}),
      ...(manuallyHiddenCols ? { manuallyHiddenCols } : {}),
      ...(sheet.rowsHiddenByDefault === true
        ? { rowsHiddenByDefault: true as const }
        : {}),
      ...(sheet.rowsHiddenByDefault === true && sheet.rowsHiddenByFileRun === true
        ? { rowsHiddenByFileRun: true as const }
        : {}),
      ...(sheet.rowsHiddenByDefault === true && Array.isArray(sheet.rowsShownPastEnd)
        ? {
            rowsShownPastEnd: sheet.rowsShownPastEnd
              .filter((row: unknown): row is number => Number.isInteger(row) && (row as number) >= 0 && (row as number) < MAX_SHEET_ROWS),
          }
        : {}),
      ...(namedRanges.length > 0 ? { namedRanges } : {}),
      ...(macros.length > 0 ? { macros } : {}),
      ...(validations.length > 0 ? { validations } : {}),
      ...(sparklineCount > 0 ? { sparklines } : {}),
      ...(sheet.nativeSparklinesBlocker === SPARKLINE_NATIVE_GRAPH_BLOCKER
        ? { nativeSparklinesBlocker: SPARKLINE_NATIVE_GRAPH_BLOCKER }
        : {}),
      ...(slicers.length > 0 ? { slicers } : {}),
      ...(charts.length > 0 ? { charts } : {}),
      ...(dataTables.length > 0 ? { dataTables } : {}),
      ...(conditionalFormats.length > 0 ? { conditionalFormats } : {}),
      ...(tabColor ? { tabColor } : {}),
      ...(tabColorNativeBlocker ? { tabColorNativeBlocker } : {}),
      // A sheet the import left a placeholder (lib/spreadsheet/deferred-sheets).
      ...(sheet.sheetPending === true ? { sheetPending: true as const } : {}),
      sheetState,
      hidden: isHidden ? true : undefined,
      // View > Gridlines / Headings, per sheet. A page saved when the editor
      // held one switch for the whole workbook (content-level `hideGridlines`
      // / `hideHeadings`) showed every sheet by it, and still does: the
      // switch is read onto each sheet here, in memory, and the next save
      // writes it per sheet.
      hideGridlines:
        sheet.hideGridlines === true || legacyHideGridlines ? (true as const) : undefined,
      hideHeadings:
        sheet.hideHeadings === true || legacyHideHeadings ? (true as const) : undefined,
      hideZeros: sheet.hideZeros === true ? (true as const) : undefined,
      // Show Formulas and the sheet's view, per sheet as well (sheetView
      // @showFormulas / @view), read the same way from a page that kept one
      // for the whole workbook.
      showFormulas:
        sheet.showFormulas === true || legacyShowFormulas ? (true as const) : undefined,
      viewMode:
        sheet.viewMode === "normal" ? undefined : sheetViewMode(sheet.viewMode) ?? legacyViewMode,
      // Keep only a true flag; a passthrough `protected: false`/non-boolean is
      // dropped so the unprotected save path stays byte-for-byte (no own key).
      ...(isProtected ? { protected: true } : {}),
      ...(protectionOptions ? { protectionOptions } : {}),
      // Review ▸ Allow Edit Ranges (XLS-A028), fail-closed.
      protectedRanges: (() => {
        const ranges = normalizeProtectedEditRanges(sheet.protectedRanges);
        return ranges.length > 0 ? ranges : undefined;
      })(),
      // Override the raw passthrough `pivot` with the normalized recipe (or drop
      // it when there is no usable recipe) so a stale/empty pivot never leaks.
      pivot: hasPivot && pivot ? pivot : morePivots[0],
      morePivots:
        morePivots.length > (hasPivot ? 0 : 1)
          ? morePivots.slice(hasPivot ? 0 : 1)
          : undefined,
      // Print / Page Setup: normalize the persisted print settings (validate all
      // sub-fields, drop unknowns). Absent when there are no settings so the
      // default-export path stays byte-for-byte unchanged.
      printSettings: normalizePrintSettings(sheet.printSettings) ?? undefined,
      // The ranges are now ordinary cells; only the save hint survives, and a
      // symbol key never reaches the persisted JSON.
      blankCellFormats: undefined,
      ...(blankCellFormats
        ? { [BLANK_CELL_FORMATS_HINT]: blankCellFormats }
        : {}),
    };
    // The runs are in `columnStyles` now, one entry per column; the save
    // stores them as runs again.
    delete (normalizedSheet as { columnStyleRuns?: unknown }).columnStyleRuns;
    // A filter result the page keeps: one that does not read goes (the
    // filters are applied again), an imported one takes the sheet's criteria.
    const keptFilterResult = readFilterResult(normalizedSheet);
    const filtered = keptFilterResult
      ? withFilterResultCriteriaAdopted({ ...normalizedSheet, filterResult: keptFilterResult })
      : withoutFilterResult(normalizedSheet);
    return withExplicitDefaultBlanks(filtered, rawCells);
  });
  
  const openingOn = options?.deferOtherSheetsLineBlanks && typeof content?.activeSheetId === "string"
    ? content.activeSheetId
    : undefined;
  const normalized = materializeWorkbookLineStyles(prepared, undefined, openingOn);
  // The one chart model, in memory: a page saved before it reads its charts
  // from the stored cells; the next save writes what it read.
  const modelled = normalized.map((sheet) => withSheetChartModels(sheet, normalized));
  const models = modelled.length > 0
    ? unifyPivotCacheSnapshots(modelled)
    : [emptySheet()];
  // Each placeholder model stands for the placeholder as stored: the save
  // writes it back as it was, until the sheet is filled in and changed.
  const storedSheets = Array.isArray(stored?.sheets) ? (stored.sheets as Array<Record<string, unknown>>) : [];
  const storedPlaceholders = new Map(
    storedSheets.filter((raw) => raw?.sheetPending === true && typeof raw.id === "string").map((raw) => [raw.id as string, raw]),
  );
  if (storedPlaceholders.size) {
    for (const model of models) {
      const raw = model.sheetPending ? storedPlaceholders.get(model.id) : undefined;
      if (raw) rememberPlaceholderSheet(model, raw);
    }
  }
  return models;
}

/**
 * Upgrade legacy persisted tables whose totals recipe pre-dates physical totals
 * cells. The migration is deterministic and in-memory: it runs during ordinary
 * sheet normalization, writes only into a completely empty/unformatted target
 * row, and otherwise preserves the old payload untouched. The next normal
 * content transaction persists the upgraded cells through the existing save
 * authority; loading alone still produces no history/autosave entry.
 */
function materializePersistedTableTotals(
  sourceCells: CellMap,
  sourceTables: readonly DataTable[],
  sourceRowCount: number,
): { cells: CellMap; dataTables: DataTable[]; rowCount: number } {
  let cells = sourceCells;
  const tables = [...sourceTables];
  let rowCount = sourceRowCount;
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const original = tables[tableIndex];
    if (!original.totalsRow) continue;
    const totalsRow = original.range.r2 + 1;
    if (totalsRow < 0 || totalsRow >= MAX_SHEET_ROWS) continue;
    const rawHeaders: string[] = [];
    for (let col = original.range.c1; col <= original.range.c2; col += 1) {
      rawHeaders.push(
        String(sourceCells[`${original.range.r1}:${col}`]?.value ?? "").trim(),
      );
    }
    const headers = normalizeTableColumnNames(rawHeaders);
    // A legacy malformed header needs the explicit Create/Resize authority to
    // repair it; never manufacture formulas that point at a name not in cells.
    if (headers.some((header, index) => header !== rawHeaders[index])) continue;
    let targetIsPristine = true;
    for (let col = original.range.c1; col <= original.range.c2; col += 1) {
      const cell = sourceCells[`${totalsRow}:${col}`];
      if (cell && (String(cell.value ?? "") !== "" || hasCellMetadata(cell))) {
        targetIsPristine = false;
        break;
      }
    }
    if (!targetIsPristine) {
      rowCount = Math.max(rowCount, totalsRow + 1);
      continue;
    }
    let table = original;
    if (!table.totals && !table.totalLabels) {
      table = { ...table, totalLabels: { 0: "Total" } };
      tables[tableIndex] = table;
    }
    if (cells === sourceCells) cells = { ...sourceCells };
    for (let offset = 0; offset < headers.length; offset += 1) {
      const value = tableTotalCellValue(table, offset, headers[offset]);
      if (value) {
        writeCellValueInto(
          cells,
          totalsRow,
          table.range.c1 + offset,
          value,
        );
      }
    }
    rowCount = Math.max(rowCount, totalsRow + 1);
  }
  return { cells, dataTables: tables, rowCount };
}

export function normalizeSpreadsheetAdvancedFilterState(
  raw: unknown,
  rowCount: number,
  columnCount: number,
): SpreadsheetAdvancedFilterState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const candidate = raw as { ref?: unknown; hiddenRows?: unknown };
  if (typeof candidate.ref !== "string" || !Array.isArray(candidate.hiddenRows)) {
    return undefined;
  }
  const range = parseA1Range(candidate.ref.replace(/\$/g, ""));
  if (
    !range ||
    range.r1 < 0 ||
    range.c1 < 0 ||
    range.r2 <= range.r1 ||
    range.r2 >= rowCount ||
    range.c2 >= columnCount ||
    candidate.hiddenRows.length > rowCount
  ) {
    return undefined;
  }
  const hiddenRows: number[] = [];
  for (const rawRow of candidate.hiddenRows) {
    if (
      !Number.isInteger(rawRow) ||
      (rawRow as number) <= range.r1 ||
      (rawRow as number) > range.r2 ||
      (hiddenRows.length > 0 && rawRow <= hiddenRows[hiddenRows.length - 1]!)
    ) {
      return undefined;
    }
    hiddenRows.push(rawRow as number);
  }
  const rawCriteria = (raw as { criteria?: unknown }).criteria;
  const criteria =
    typeof rawCriteria === "string"
      ? parseA1Range(rawCriteria.replace(/\$/g, ""))
      : null;
  return {
    ref: spreadsheetRangeA1(range),
    hiddenRows,
    ...(criteria &&
    criteria.r2 > criteria.r1 &&
    criteria.r2 < rowCount &&
    criteria.c2 < columnCount
      ? { criteria: spreadsheetRangeA1(criteria) }
      : {}),
  };
}
