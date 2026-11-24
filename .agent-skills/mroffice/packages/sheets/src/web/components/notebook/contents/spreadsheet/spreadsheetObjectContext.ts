/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { SmartArtThemeEffectShadows } from "@mrnote/core/web/lib/office-smartart/theme-effects.ts";
import { inkHoldShapeFit } from "@mrnote/core/web/lib/office-ink-hold-shape.ts";
import { anchorPointColumn, anchorPointRow, EMU_PER_CSS_PIXEL, spreadsheetObjectInsertedByPage, spreadsheetObjectRotation, type SpreadsheetObjectAnchor } from "../../../../lib/spreadsheet/drawing-buttons";
import { officeTurnAround } from "@mrnote/core/web/lib/office-object-frame.ts";
import { inkLineWidthScaled } from "@mrnote/core/web/lib/office-ink-line-scale.ts";
import { spreadsheetDrawnShapeOutlinePoints, spreadsheetInkStrokePoints, spreadsheetInkStrokeWidthPx } from "../../../../lib/spreadsheet/ink-erase";
import { isSpreadsheetNativeSmartArtObject, readSpreadsheetNativeSmartArt, spreadsheetPreservedSmartArtMedia } from "../../../../lib/spreadsheet/native-smartart";
import { nativeLayoutConvertsOnOpen, nativeLayoutToCatalogId } from "@mrnote/core/web/lib/office-smartart/native-layouts.ts";
import { smartArtEngine } from "@mrnote/core/web/lib/office-smartart/remote.ts";
import { SMARTART_OFFICE_DEFINITION_KIND } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { spreadsheetSmartArtOwnDefinitionRef } from "../../../../lib/spreadsheet/smartart-own-definition";
import { createSpreadsheetShapeFromInkFit, isSpreadsheetInkShapeStyle, normalizeShapeStyle, SPREADSHEET_CUSTOM_SHAPE_KIND, type SpreadsheetInkPoint, type SpreadsheetInkTool, type SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { spreadsheetShapePreviewKind } from "../../../../lib/spreadsheet/shape-preset";
import { type SpreadsheetChart } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { type useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { fitInkStrokeToShape } from "@mrnote/core/web/lib/office-ink-shape-fit.ts";
import { spreadsheetInkWidthPx } from "../../../../lib/spreadsheet/ink-pens";
import { SPREADSHEET_MAX_OBJECTS } from "@mrnote/core/web/lib/spreadsheet/object-budget.ts";
import { type PersistedInkPath } from "@mrnote/core/web/lib/presentation-annotation.ts";
import { type SpreadsheetObject } from "./spreadsheetSheetModel";

// A bound on the object layer's work, not the limit that binds: a sheet's
// objects are budgeted by the bytes they put on the page
// (lib/spreadsheet/object-budget.ts). It was 200 — below the import cap, so a
// sheet that arrived with 230 shapes could never take one more.
/** z-index of selection chrome inside the drawing layer: above any drawing. */
export const DRAWING_LAYER_CHROME_Z = 100000;
export const MAX_SHEET_OBJECTS = SPREADSHEET_MAX_OBJECTS;

/**
 * The sheet's objects with every preserved Office diagram whose layout is one
 * of the 39 replaced by MRAI's own SmartArt — or `null` when nothing converts.
 *
 * A real .xlsx import is projected on the SERVER, which preserves EVERY
 * diagram, so the conversion the workbook importer does offline has to happen
 * again when such a workbook is opened (SMARTART-IMPORT.md §3). It goes
 * through `convertSpreadsheetNativeSmartArt`, the one conversion 转换为可编辑
 * already uses, so an opened diagram and a hand-converted one are the same
 * objects Insert ▸ SmartArt writes — the layout is merely the diagram's OWN
 * instead of one the author picked.
 *
 * Fail-closed per diagram: a layout MRAI does not own, a data model the shared
 * outline reader cannot prove, or a conversion that would overrun the sheet's
 * object budget leaves that diagram exactly as Office wrote it, preserved with
 * its 转换为可编辑.
 */
export async function sheetObjectsWithOpenedSmartArt(
  objects: readonly SpreadsheetObject[],
  // Diagrams this session already failed to convert, keyed by object id, so a
  // refused diagram is never retried while every other one still gets its
  // turn. Keying the attempt per DIAGRAM (not per sheet) is what makes the
  // conversion survive the load order: an early render can hand this function
  // a sheet whose objects have not arrived yet, and the pass that finally sees
  // the diagram must still convert it.
  skipped?: Set<string>,
  /** The workbook theme's body face (`+mn-lt`), which sets how tall the labels' lines stand. */
  bodyFace?: string | null,
  /** The workbook theme's accents: the diagram is painted on them as Excel
   * paints it (X-043: a 2007-theme workbook's boxes are 4F81BD). */
  themeAccents?: readonly string[] | null,
  /** The page, whose source package holds a diagram's slot pictures. */
  pageId?: string,
  /** The face the workbook theme gives Chinese words (`SmartArtColorTheme.eastAsianFace`). */
  eastAsianFace?: string | null,
  /** The workbook theme's effect styles' shadows (`SmartArtColorTheme.effectShadows`). */
  effectShadows?: SmartArtThemeEffectShadows | null,
): Promise<SpreadsheetObject[] | null> {
  let next: SpreadsheetObject[] = [...objects];
  let converted = 0;
  for (const object of objects) {
    if (!isSpreadsheetNativeSmartArtObject(object)) continue;
    if (skipped?.has(object.id)) continue;
    const diagram = readSpreadsheetNativeSmartArt(object);
    // An alias stays as Excel drew it (`nativeLayoutConvertsOnOpen`).
    const catalogLayoutId = diagram && nativeLayoutConvertsOnOpen(diagram.layoutIdentity)
      ? nativeLayoutToCatalogId(diagram.layoutIdentity)
      : null;
    // …or, a layout MRAI stocks no definition of, laid out from the one the
    // workbook's own package holds (SMARTART-GAP.md §8.6): the engine client
    // borrows that part by its digest.
    const ownDefinition = !catalogLayoutId ? spreadsheetSmartArtOwnDefinitionRef(object) : null;
    const layoutId = catalogLayoutId ?? (ownDefinition ? SMARTART_OFFICE_DEFINITION_KIND : null);
    if (!layoutId) {
      // A layout MRAI does not own stays preserved for good; the SmartArt tab
      // converts it on the author's word.
      skipped?.add(object.id);
      continue;
    }
    // Deterministic from the diagram's own object id: opening the same
    // workbook twice can never mint two different identities for it. The
    // conversion is the server's; no answer (offline) leaves the diagram for
    // the next pass rather than marking it refused.
    const groupId = `smartart-open-${object.id}`;
    // A diagram the file holds no drawing for shows nothing until it is laid
    // out, so its slot pictures come along (a picture layout converts only
    // with them); one that has them stays as Excel drew it otherwise.
    const drawingless = (object as { members?: Array<{ drawingFrame?: boolean }> }).members?.every(
      (member) => member.drawingFrame === true,
    ) === true;
    let images: Readonly<Record<string, string>> | undefined;
    if (drawingless && pageId && !ownDefinition) {
      const media = await spreadsheetPreservedSmartArtMedia(
        object as unknown as Record<string, unknown>,
        layoutId,
        pageId,
      );
      if (media.ok) images = media.images;
    }
    const members = (
      await smartArtEngine("sheet.convert", {
        object: object as unknown as Record<string, unknown>,
        layoutId,
        groupId,
        ...(images ? { images: { ...images } } : {}),
        ...(ownDefinition ? { layoutDefinitionRef: ownDefinition } : {}),
        // Opening the file writes no words the file does not hold.
        keepEmptyText: true,
        ...(bodyFace ? { bodyFace } : {}),
        ...(themeAccents?.length || typeof eastAsianFace === "string" || effectShadows
          ? {
              colorTheme: {
                ...(themeAccents?.length ? { accents: [...themeAccents] } : {}),
                ...(typeof eastAsianFace === "string" ? { eastAsianFace } : {}),
                ...(effectShadows ? { effectShadows } : {}),
              },
            }
          : {}),
      })
    ).members;
    if (!members || members.length === 0) {
      skipped?.add(object.id);
      continue;
    }
    if (next.length - 1 + members.length > MAX_SHEET_OBJECTS) {
      skipped?.add(object.id);
      continue;
    }
    next = next.flatMap((entry) =>
      entry.id === object.id
        ? (members as unknown as SpreadsheetObject[])
        : [entry],
    );
    converted += 1;
  }
  return converted > 0 ? next : null;
}

function spreadsheetChartDataForEdit(object: SpreadsheetObject): {
  headers: string[];
  rows: string[][];
} {
  const sourceHeaders = object.data?.headers || [];
  const sourceRows = object.data?.rows || [];
  const columnCount = Math.max(
    2,
    sourceHeaders.length,
    ...sourceRows.map((row) => row.length),
  );
  const headers = Array.from(
    { length: columnCount },
    (_, index) =>
      sourceHeaders[index] || (index === 0 ? "Category" : `Series ${index}`),
  );
  const rows = sourceRows.length
    ? sourceRows.map((row) =>
        Array.from({ length: columnCount }, (_, index) => row[index] || ""),
      )
    : [Array.from({ length: columnCount }, () => "")];
  return { headers, rows };
}

function shortContextString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function spreadsheetImageSourceContext(src: unknown): Record<string, unknown> {
  const value = shortContextString(src, 520) || "";
  if (value.startsWith("data:image/")) {
    const headerEnd = value.indexOf(",");
    return {
      image_src_kind: "embedded",
      image_src_prefix:
        headerEnd > 0 ? value.slice(0, headerEnd + 1) : "data:image/",
    };
  }
  if (value.startsWith("https://") || value.startsWith("http://")) {
    return {
      image_src_kind: "remote",
      image_src: value,
    };
  }
  // A picture an imported workbook stores beside its page
  // (lib/page-picture-objects): embedded in the workbook, as the file holds it.
  if (/^mrai-picture:[0-9a-f]{64}$/.test(value)) {
    return { image_src_kind: "embedded", image_src_prefix: "mrai-picture:" };
  }
  return { image_src_kind: value ? "other" : "none" };
}

function spreadsheetImageSourceText(src: unknown): string {
  const context = spreadsheetImageSourceContext(src);
  if (context.image_src_kind === "embedded") {
    return `Embedded image ${context.image_src_prefix || ""}`.trim();
  }
  if (
    context.image_src_kind === "remote" &&
    typeof context.image_src === "string"
  ) {
    return `Remote image ${context.image_src}`;
  }
  return context.image_src_kind === "other" ? "Image source attached" : "";
}

export function spreadsheetObjectContext(
  object: SpreadsheetObject,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    object_id: object.id,
    object_type: object.type,
  };
  const source = (object as Record<string, unknown>).source;
  if (source && typeof source === "object") {
    context.source = source;
  }
  if (object.anchor?.from) {
    context.object_anchor_row = anchorPointRow(object.anchor.from);
    context.object_anchor_col = anchorPointColumn(object.anchor.from);
  }
  if (object.anchor?.to) {
    context.object_anchor_to_row = anchorPointRow(object.anchor.to);
    context.object_anchor_to_col = anchorPointColumn(object.anchor.to);
  }
  if (typeof object.anchor?.xEmu === "number")
    context.object_x_emu = object.anchor.xEmu;
  if (typeof object.anchor?.yEmu === "number")
    context.object_y_emu = object.anchor.yEmu;
  if (typeof object.anchor?.widthEmu === "number") {
    context.object_width_emu = object.anchor.widthEmu;
  }
  if (typeof object.anchor?.heightEmu === "number") {
    context.object_height_emu = object.anchor.heightEmu;
  }
  if (object.type === "image") {
    const alt = shortContextString(object.alt, 500);
    const caption = shortContextString(object.caption, 500);
    if (alt) context.image_alt = alt;
    if (caption) context.image_caption = caption;
    Object.assign(context, spreadsheetImageSourceContext(object.src));
  } else {
    const title = shortContextString(object.title, 500);
    const caption = shortContextString(object.caption, 500);
    const chartType = shortContextString(object.chartType, 80);
    if (title) context.chart_title = title;
    if (caption) context.chart_caption = caption;
    if (chartType) context.chart_type = chartType;
    if (Array.isArray(object.ranges) && object.ranges.length > 0) {
      context.chart_ranges = object.ranges.slice(0, 10);
      context.chart_range_count = object.ranges.length;
      context.chart_ranges_truncated = object.ranges.length > 10;
    }
    context.chart_row_count = object.data?.rows?.length || 0;
    context.chart_column_count = object.data?.headers?.length || 0;
  }
  return context;
}

export function spreadsheetObjectPlainText(object: SpreadsheetObject): string {
  if (object.type === "chart") {
    const data = spreadsheetChartDataForEdit(object);
    const sampledRows = data.rows.slice(0, 20);
    const tableLines = [
      data.headers.join("\t"),
      ...sampledRows.map((row) => row.join("\t")),
      data.rows.length > sampledRows.length
        ? `[… ${data.rows.length - sampledRows.length} chart data rows omitted …]`
        : "",
    ].filter((line) => line.trim());
    return [
      object.title || object.caption || object.chartType || "Chart",
      object.caption,
      object.chartType,
      ...(object.ranges || []),
      ...tableLines,
    ]
      .filter((line): line is string => Boolean(line && line.trim()))
      .join("\n");
  }
  return [
    object.caption || object.alt || "Image",
    object.alt,
    spreadsheetImageSourceText(object.src),
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join("\n");
}

/** Excel's Name Box reports a selected drawing object instead of a cell ref. */
export function spreadsheetPictureDisplayName(
  ordinal: number,
  pictureLabel: string,
): string {
  // This slice deliberately exposes no imported drawing metadata as a name:
  // Alt/caption are accessibility description custody and UUIDs are private.
  // A later native-name package can add a separately authenticated model field.
  return `${pictureLabel} ${ordinal + 1}`;
}

/**
 * Excel's default names for the drawings that have no name of their own: the
 * kind's word and its number among the drawings of that kind ("矩形 1",
 * "矩形 2", "椭圆 1", "图表 1"), never an internal id (user audit S-010: the
 * Selection Pane, the hover title and the accessible name read
 * "shape-2-mv4dal9g"). Numbered in the drawings' private identity order
 * (natural order, so shape-2 comes before shape-10), which Arrange does not
 * change; the identity itself is never shown.
 */
export function spreadsheetDrawingDefaultNames<T>(
  drawings: readonly T[],
  identity: (drawing: T) => string,
  kindLabel: (drawing: T) => string,
): ReadonlyMap<T, string> {
  const names = new Map<T, string>();
  const counts = new Map<string, number>();
  const ordered = drawings
    .map((drawing) => ({ drawing, id: identity(drawing) }))
    .sort((left, right) => left.id.localeCompare(right.id, "en", { numeric: true }));
  for (const { drawing } of ordered) {
    const label = kindLabel(drawing);
    const count = (counts.get(label) ?? 0) + 1;
    counts.set(label, count);
    names.set(drawing, `${label} ${count}`);
  }
  return names;
}

type ConsoleTranslate = ReturnType<typeof useTranslations<"console-notebooks">>;

/** A sheet drawing: an object of `sheet.objects` or a native chart. */
export type SpreadsheetDrawing = SpreadsheetObject | SpreadsheetChart;

function isSheetObject(drawing: SpreadsheetDrawing): drawing is SpreadsheetObject {
  return drawing.type === "image" || drawing.type === "shape" || drawing.type === "chart" || drawing.type === "smartart";
}

/**
 * The word a drawing's default name starts with, as Excel names a new one:
 * the shape's own kind as the Insert > Shapes gallery says it ("矩形",
 * "椭圆"), a text box, a freeform, an ink stroke, a picture, a chart.
 */
export function spreadsheetDrawingKindLabel(drawing: SpreadsheetDrawing, t: ConsoleTranslate): string {
  if (!isSheetObject(drawing) || drawing.type === "chart") return t("toolbar.chart");
  if (drawing.type === "image") return t("contentControl.type.picture");
  if (drawing.type !== "shape") return t("document.shape.label");
  if (isSpreadsheetInkObject(drawing)) return t("spreadsheet.uiCopy.inkStroke");
  const shape = normalizeShapeStyle(drawing.shape);
  if (shape.kind === "text-box") return t("spreadsheet.shapeKind_text-box");
  if (shape.kind === SPREADSHEET_CUSTOM_SHAPE_KIND || shape.customPath) return t("presentation.shape.freeform");
  // Every preset kind has its gallery word (the Insert > Shapes catalog
  // reads the same keys).
  return t(`presentation.shape.${spreadsheetShapePreviewKind(shape.kind)}` as "presentation.shape.rectangle");
}

/**
 * The default name of each of a sheet's drawings, for every place that names
 * one (Selection Pane, Navigation pane, hover title, accessible name): a
 * picture its "图片 N", every other drawing its kind and number among that
 * kind (spreadsheetDrawingDefaultNames).
 */
export function spreadsheetSheetDrawingNamer(
  objects: readonly SpreadsheetObject[],
  charts: readonly SpreadsheetChart[],
  t: ConsoleTranslate,
): (drawing: SpreadsheetDrawing) => string {
  const pictures = spreadsheetPictureOrdinalMap(objects);
  const names = spreadsheetDrawingDefaultNames<SpreadsheetDrawing>(
    [...objects.filter((object) => object.type !== "image"), ...charts],
    (drawing) => drawing.id,
    (drawing) => spreadsheetDrawingKindLabel(drawing, t),
  );
  // A chart is asked for as drawn (its frame read off its cell anchor), a
  // copy of the stored record: its name goes by its id.
  const byId = new Map([...names].map(([drawing, name]) => [drawing.id, name] as const));
  return (drawing) =>
    isSheetObject(drawing) && drawing.type === "image"
      ? spreadsheetPictureDisplayName(pictures.get(drawing) ?? 0, t("contentControl.type.picture"))
      : (names.get(drawing) ?? byId.get(drawing.id) ?? spreadsheetDrawingKindLabel(drawing, t));
}

/**
 * The name a drawing goes by wherever the sheet names it to the user -- the
 * Selection Pane's row and the Name Box (Excel's Name Box shows the selected
 * object's name and renames it): a picture its own name (`caption`), a chart
 * its name or title, any other drawing its name, its words or its alt text,
 * and, without any of these, Excel's default name (`defaultName`).
 */
export function spreadsheetDrawingDisplayName(
  drawing: SpreadsheetDrawing,
  defaultName: (drawing: SpreadsheetDrawing) => string,
): string {
  if (!isSheetObject(drawing)) return drawing.name || drawing.title || defaultName(drawing);
  if (drawing.type === "image") return drawing.caption || defaultName(drawing);
  return (
    drawing.name ||
    (drawing.type === "shape" ? drawing.shape?.text : undefined) ||
    drawing.caption ||
    drawing.alt ||
    drawing.title ||
    defaultName(drawing)
  );
}

export function spreadsheetPictureOrdinalMap(
  objects: readonly SpreadsheetObject[],
): ReadonlyMap<SpreadsheetObject, number> {
  const ordinals = new Map<SpreadsheetObject, number>();
  const pictures = objects
    .filter((object) => object.type === "image")
    // Arrange changes paint order. Sort only by the private immutable identity
    // when assigning Picture N so the displayed fallback never changes with z.
    // The sort key is never interpolated into a user-facing label.
    .sort((left, right) =>
      left.id === right.id ? 0 : left.id < right.id ? -1 : 1,
    );
  pictures.forEach((object, ordinal) => ordinals.set(object, ordinal));
  return ordinals;
}

export function isSpreadsheetInkObject(
  object: SpreadsheetObject,
): object is SpreadsheetObject & {
  type: "shape";
  shape: SpreadsheetShapeStyle & {
    kind: "ink";
    inkPoints: string;
    inkTool: SpreadsheetInkTool;
    inkOpacity: number;
  };
  anchor: SpreadsheetObjectAnchor & { kind: "absolute" };
} {
  return (
    object.type === "shape" &&
    isSpreadsheetInkShapeStyle(object.shape) &&
    object.anchor?.kind === "absolute" &&
    Number.isFinite(object.anchor.xEmu) &&
    Number.isFinite(object.anchor.yEmu) &&
    Number.isFinite(object.anchor.widthEmu) &&
    Number.isFinite(object.anchor.heightEmu)
  );
}





export function isSpreadsheetDrawnShapeObject(
  object: SpreadsheetObject,
): object is SpreadsheetObject & { type: "shape"; anchor: SpreadsheetObjectAnchor & { kind: "absolute" } } {
  return object.type === "shape" && object.anchor?.kind === "absolute" && spreadsheetDrawnShapeOutlinePoints(object) !== null;
}

/** What the Draw tab's erasers and lasso take: ink strokes and drawn shapes. */
export function isSpreadsheetLassoObject(
  object: SpreadsheetObject,
): object is SpreadsheetObject & { type: "shape"; anchor: SpreadsheetObjectAnchor & { kind: "absolute" } } {
  return isSpreadsheetInkObject(object) || isSpreadsheetDrawnShapeObject(object);
}








export function spreadsheetLassoObjectScaled(
  object: SpreadsheetObject,
  next: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  min: { readonly left: number; readonly top: number },
): SpreadsheetObject {
  if (!isSpreadsheetLassoObject(object)) return object;
  const anchor = {
    ...object.anchor,
    xEmu: Math.max(0, Math.round(Math.max(min.left, next.left) * EMU_PER_CSS_PIXEL)),
    yEmu: Math.max(0, Math.round(Math.max(min.top, next.top) * EMU_PER_CSS_PIXEL)),
    widthEmu: Math.max(1, Math.round(next.width * EMU_PER_CSS_PIXEL)),
    heightEmu: Math.max(1, Math.round(next.height * EMU_PER_CSS_PIXEL)),
  };
  if (
    anchor.xEmu === object.anchor.xEmu &&
    anchor.yEmu === object.anchor.yEmu &&
    anchor.widthEmu === object.anchor.widthEmu &&
    anchor.heightEmu === object.anchor.heightEmu
  ) {
    return object;
  }
  // A stroke scales as a picture does: its line with its box (kept, strokes
  // made smaller ran into a blot).
  return spreadsheetLineFollowsBox({ ...object, anchor } as SpreadsheetObject, object.anchor);
}

/**
 * A stroke the lasso's rotation grip turns `degrees` about `center` (sheet
 * pixels): its centre goes round the frame's and it turns by as much about
 * its own. The turn's preview draws this very object and its commit writes
 * it (a CSS turn of the frame took a stroke already turned about another
 * point than its own centre).
 */
export function spreadsheetLassoObjectTurned(
  object: SpreadsheetObject,
  center: { readonly x: number; readonly y: number },
  degrees: number,
): SpreadsheetObject {
  if (!isSpreadsheetLassoObject(object)) return object;
  const left = Number(object.anchor.xEmu) / EMU_PER_CSS_PIXEL;
  const top = Number(object.anchor.yEmu) / EMU_PER_CSS_PIXEL;
  const width = Math.max(1, Number(object.anchor.widthEmu) / EMU_PER_CSS_PIXEL);
  const height = Math.max(1, Number(object.anchor.heightEmu) / EMU_PER_CSS_PIXEL);
  const { x: cx, y: cy } = officeTurnAround({ x: left + width / 2, y: top + height / 2 }, center, degrees);
  const turn = Math.round(((((spreadsheetObjectRotation(object.anchor) || 0) + degrees) % 360) + 360) % 360 * 10) / 10;
  return {
    ...object,
    anchor: {
      ...object.anchor,
      xEmu: Math.max(0, Math.round((cx - width / 2) * EMU_PER_CSS_PIXEL)),
      yEmu: Math.max(0, Math.round((cy - height / 2) * EMU_PER_CSS_PIXEL)),
      rotation: turn,
    },
  } as SpreadsheetObject;
}

/**
 * A drawing whose box was `from` (EMU) and is now its anchor's: its line
 * scaled with it, as a stroke of ink scales (lib/office-ink-line-scale). The
 * preview of a scale draws this and its commit writes it.
 */
export function spreadsheetLineFollowsBox<O extends SpreadsheetObject>(
  object: O,
  from: { readonly widthEmu?: unknown; readonly heightEmu?: unknown } | undefined,
): O {
  const strokeWidth = Number((object.shape as { strokeWidth?: unknown } | undefined)?.strokeWidth);
  if (!object.shape || !(strokeWidth > 0) || !from || !object.anchor) return object;
  const scaled = inkLineWidthScaled(
    strokeWidth,
    { width: Math.max(1, Number(from.widthEmu)), height: Math.max(1, Number(from.heightEmu)) },
    { width: Math.max(1, Number(object.anchor.widthEmu)), height: Math.max(1, Number(object.anchor.heightEmu)) },
  );
  return scaled === strokeWidth ? object : { ...object, shape: { ...object.shape, strokeWidth: scaled } };
}

function spreadsheetInkPathForObject(
  object: SpreadsheetObject,
): PersistedInkPath | null {
  if (!isSpreadsheetInkObject(object)) {
    // A drawn shape: its outline at its painted width.
    const outline = object.anchor?.kind === "absolute" ? spreadsheetDrawnShapeOutlinePoints(object) : null;
    return outline
      ? { id: object.id, points: outline, width: spreadsheetInkStrokeWidthPx(object.shape as Parameters<typeof spreadsheetInkStrokeWidthPx>[0]) }
      : null;
  }
  // The same sheet-space samples the eraser reads: the box's size, rotation
  // and flips included, so the lasso finds a stroke where it shows. The
  // painted width too: the Stroke Eraser takes a 17pt highlighter where its
  // visible edge is, not only along its centre line.
  const points = spreadsheetInkStrokePoints(object);
  const cutEnds = object.shape.inkCutEnds;
  return points && points.length >= 2
    ? {
        id: object.id,
        points,
        width: spreadsheetInkStrokeWidthPx(object.shape),
        // A cut end is flat: the Stroke Eraser misses ink past it.
        ...(cutEnds ? { cutEnds } : {}),
      }
    : null;
}

export function spreadsheetInkPaths(
  objects: readonly SpreadsheetObject[],
): PersistedInkPath[] {
  return objects.flatMap((object) => {
    const path = spreadsheetInkPathForObject(object);
    return path ? [path] : [];
  });
}

/**
 * XLS-A032: Ink to Shape — the shape a stroke (sheet-space points) plainly is,
 * outlined in its pen's colour and width, or null when it stays ink.
 */
export function spreadsheetInkToShapeObject(
  points: readonly SpreadsheetInkPoint[],
  pen: { readonly tool: SpreadsheetInkTool; readonly color: string; readonly widthPt: number },
  /** `held`: drawn and held, a shape asked for -- where the recognizer is unsure, the held stroke's own shape. */
  options: { readonly held?: boolean } = {},
): SpreadsheetObject | null {
  const fit = fitInkStrokeToShape(points) ?? (options.held ? inkHoldShapeFit(points) : null);
  if (!fit) return null;
  return createSpreadsheetShapeFromInkFit(fit, {
    color: pen.color,
    width: spreadsheetInkWidthPx(pen.widthPt),
    tool: pen.tool,
  }) as unknown as SpreadsheetObject | null;
}

/** XLS-A032: a stroke as Ink Replay shows it, its first `count` points drawn. */
export function spreadsheetInkReplayShape(
  shape: SpreadsheetShapeStyle,
  count: number,
): SpreadsheetShapeStyle {
  const tokens = (shape.inkPoints ?? "").trim().split(/\s+/);
  if (count >= tokens.length) return shape;
  return { ...shape, inkPoints: count > 0 ? tokens.slice(0, count).join(" ") : "" };
}

export function spreadsheetInkObjectSignature(object: SpreadsheetObject): string {
  return JSON.stringify({ anchor: object.anchor, shape: object.shape });
}

export function spreadsheetObjectHasPatchbackVisibilityIdentity(
  object: SpreadsheetObject,
): boolean {
  // A picture or shape the page inserted is written whole on every save.
  if (spreadsheetObjectInsertedByPage(object)) return true;
  const source = object.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const record = source as Record<string, unknown>;
  const drawingPart =
    typeof record.drawingPart === "string" && record.drawingPart.trim();
  if (!drawingPart) return false;
  const relationshipIdentity = [record.part, record.relationshipId].every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  const nonVisualIdentity =
    (typeof record.nonVisualId === "string" &&
      /^\d+$/.test(record.nonVisualId.trim())) ||
    (typeof record.nonVisualId === "number" &&
      Number.isSafeInteger(record.nonVisualId) &&
      record.nonVisualId >= 0);
  return relationshipIdentity || nonVisualIdentity;
}
