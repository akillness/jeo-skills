"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Office's Format <chart element> ▸ Fill & Line page, ONE builder for the
 * three editors' chart Format pane (Docs, the deck and the worksheet all draw
 * it through `DocumentChartFormatPane`).
 *
 * Excel, Word and PowerPoint draw the same page (Microsoft Support, "Format
 * elements of a chart"; the Format Shape pane's Fill and Line groups): Fill
 * with No fill, Solid fill, Gradient fill, Picture or texture fill, Pattern
 * fill and Automatic; Border (an element with an area) or Line (a line
 * element) with No line, Solid line, Gradient line and Automatic, then the
 * line's Width, Compound type, Dash type, Cap type, Join type and, on an open
 * line, its Begin / End Arrow type and size. A solid colour takes a
 * Transparency; a gradient its Preset gradients, Type, Direction, Angle and
 * Gradient stops (each stop's Color, Position, Transparency and Brightness);
 * a pattern its Pattern, Foreground and Background colours.
 *
 * Everything is written as the element's one style record
 * (`PresentationChartAreaStyle`: `fill`, `outline`, `shapePaint`), which the
 * three hosts' writers, the server's chart part writers and readers, and the
 * renderer all hold (`lib/office-chart-shape-paint`). The page only states
 * what it changes; a host that cannot take a change refuses it whole.
 */

import { OfficeTextureGallery } from "./OfficeTextureGallery";
import type { ReactNode } from "react";
import { Minus, Plus } from "./icons/houseIcons";
import {
  officeShapeFormatPaneStyles as paneStyles,
  type OfficeShapeFormatPaneField,
  type OfficeShapeFormatPaneSection,
} from "./OfficeShapeFormatPane";
import {
  MAX_CHART_OUTLINE_WIDTH_PT,
  OFFICE_CHART_FILL_PATTERNS,
  OFFICE_CHART_LINE_END_SIZES,
  OFFICE_CHART_LINE_END_TYPES,
  officeChartColorWithOpacity,
  officeChartDefaultLineCap,
  officeFillPatternCss,
  type OfficeChartFillPattern,
  type OfficeChartLineDash,
  type OfficeChartLineEnds,
  type OfficeChartShapePaint,
} from "../../lib/office-chart-shape-paint";
import {
  officeColorChannelsFromHex,
  officeColorHexFromChannels,
  hlsToRgb,
  rgbToHls,
} from "../../lib/office-color-transform";
import { officeGradientAngle, officeGradientCss, type OfficeShapeGradient, type OfficeShapeGradientStop } from "../../lib/office-shape-paint";
import {
  OFFICE_STROKE_COMPOUNDS,
  OFFICE_STROKE_JOINS,
  type OfficeStrokeCap,
  type OfficeStrokeCompound,
  type OfficeStrokeJoin,
} from "../../lib/office-stroke-detail";
import {
  OFFICE_PICTURE_PANE_OFFSET_PERCENT,
  OFFICE_PICTURE_PANE_OFFSET_PT,
  OFFICE_PICTURE_PANE_SCALE,
  OFFICE_PICTURE_TILE_ALIGNMENTS,
  OFFICE_PICTURE_TILE_FLIPS,
  normalizeOfficePictureFillOptions,
  officePictureFillPaneUnits,
  type OfficePictureFillOptions,
  type OfficePictureFillTile,
  type OfficePictureTileAlignment,
  type OfficePictureTileFlip,
} from "../../lib/office-picture-fill-options";
import {
  CHART_MARKER_SYMBOLS,
  MAX_CHART_MARKER_SIZE,
  MIN_CHART_MARKER_SIZE,
  type ChartMarkerSymbol,
  type PresentationChartAreaPaint,
} from "../../lib/presentation-chart-area-style";

export type OfficeChartFillKind = "none" | "solid" | "gradient" | "picture" | "pattern" | "automatic";
export type OfficeChartLineKind = "none" | "solid" | "gradient" | "automatic";

/** The paint of one chart element as the page reads and writes it: its own
 * style record, with whatever else the record holds (a series' marker and
 * smoothing, a point's explosion) passed through untouched. */
export type OfficeChartPaintStyle = Readonly<{
  fill?: PresentationChartAreaPaint;
  outline?: PresentationChartAreaPaint;
  shapePaint?: OfficeChartShapePaint;
  effect?: string;
  smooth?: boolean;
  [key: string]: unknown;
}>;

export type OfficePaneWord = (key: string, zh: string, en: string, values?: Record<string, string | number>) => string;

/** The most stops the page adds (PowerPoint's own editor caps a fill at ten). */
export const OFFICE_CHART_MAX_GRADIENT_STOPS = 10;

/** Office's eight dash types on the Format pane (ST_PresetLineDashVal),
 * in its order; the other presets a file may state are listed when current. */
export const OFFICE_CHART_PANE_DASHES: readonly (OfficeChartLineDash | "solid")[] = [
  "solid", "sysDot", "sysDash", "dash", "dashDot", "lgDash", "lgDashDot", "lgDashDotDot",
];

export const OFFICE_CHART_GRADIENT_PRESETS = [
  "lightGradient",
  "topSpotlight",
  "mediumGradient",
  "bottomSpotlight",
  "radialGradient",
] as const;
export type OfficeChartGradientPreset = (typeof OFFICE_CHART_GRADIENT_PRESETS)[number];

export const OFFICE_CHART_GRADIENT_TYPES = ["linear", "radial", "rectangular", "path"] as const;
export type OfficeChartGradientType = (typeof OFFICE_CHART_GRADIENT_TYPES)[number];

/** A linear gradient's eight directions as Office lists them, by its angle
 * (Office's degrees: 0 runs left to right, clockwise). */
export const OFFICE_CHART_LINEAR_DIRECTIONS = [
  { id: "diagonalTopLeft", angle: 45 },
  { id: "down", angle: 90 },
  { id: "diagonalTopRight", angle: 135 },
  { id: "right", angle: 0 },
  { id: "left", angle: 180 },
  { id: "diagonalBottomLeft", angle: 315 },
  { id: "up", angle: 270 },
  { id: "diagonalBottomRight", angle: 225 },
] as const;

/** A radial or rectangular gradient's five focus points (`a:fillToRect`). */
export const OFFICE_CHART_FOCUS_DIRECTIONS = [
  { id: "fromBottomRight", rect: { l: 100000, t: 100000, r: 0, b: 0 } },
  { id: "fromBottomLeft", rect: { l: 0, t: 100000, r: 100000, b: 0 } },
  { id: "fromCenter", rect: { l: 50000, t: 50000, r: 50000, b: 50000 } },
  { id: "fromTopRight", rect: { l: 100000, t: 0, r: 0, b: 100000 } },
  { id: "fromTopLeft", rect: { l: 0, t: 0, r: 100000, b: 100000 } },
] as const;

const hexOf = (value: unknown): string | undefined =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;

export function officeChartFillKind(style: OfficeChartPaintStyle | undefined): OfficeChartFillKind {
  if (style?.shapePaint?.fillGradient) return "gradient";
  if (style?.shapePaint?.fillPattern) return "pattern";
  if (style?.fill === "none") return "none";
  return hexOf(style?.fill) ? "solid" : "automatic";
}

export function officeChartLineKind(style: OfficeChartPaintStyle | undefined): OfficeChartLineKind {
  if (style?.shapePaint?.lineGradient) return "gradient";
  if (style?.outline === "none") return "none";
  return hexOf(style?.outline) ? "solid" : "automatic";
}

/** The record with `paint` merged into its shape paint; a key set to
 * undefined is removed, and a paint left empty is no paint. */
function withShapePaint(
  style: OfficeChartPaintStyle,
  paint: Partial<Record<keyof OfficeChartShapePaint, unknown>>,
): OfficeChartPaintStyle {
  const merged: Record<string, unknown> = { ...(style.shapePaint ?? {}), ...paint };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  const next: Record<string, unknown> = { ...style };
  if (Object.keys(merged).length) next.shapePaint = merged;
  else delete next.shapePaint;
  return next as OfficeChartPaintStyle;
}

function withField(style: OfficeChartPaintStyle, field: "fill" | "outline", value: PresentationChartAreaPaint | undefined) {
  const next: Record<string, unknown> = { ...style };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next as OfficeChartPaintStyle;
}

/** `#rrggbb` mixed toward white (`amount` > 0) or black (`amount` < 0). */
export function officeChartMixColor(color: string, amount: number): string {
  const channels = officeColorChannelsFromHex(color) ?? [0.27, 0.45, 0.77];
  const target = amount >= 0 ? 1 : 0;
  const share = Math.abs(amount);
  return officeColorHexFromChannels(channels.map((channel) => channel + (target - channel) * share));
}

/**
 * A stop's Brightness as the pane shows it, -100 .. 100 %: the colour's HSL
 * lightness against the pure hue (0 % is lightness 50 %, 100 % white, -100 %
 * black), the scale Office's slider moves a colour along.
 */
export function officeChartColorBrightness(color: string): number {
  const channels = officeColorChannelsFromHex(color);
  if (!channels) return 0;
  const [, lightness] = rgbToHls(channels[0], channels[1], channels[2]);
  return Math.round((lightness - 0.5) * 200);
}

export function officeChartColorAtBrightness(color: string, brightness: number): string {
  const channels = officeColorChannelsFromHex(color);
  if (!channels) return color;
  const [hue, , saturation] = rgbToHls(channels[0], channels[1], channels[2]);
  const lightness = Math.min(1, Math.max(0, 0.5 + brightness / 200));
  return officeColorHexFromChannels(hlsToRgb(hue, lightness, saturation));
}

/** One of Office's preset gradients, in the element's own colour. */
export function officeChartGradientPreset(preset: OfficeChartGradientPreset, base: string): OfficeShapeGradient {
  const tint = (amount: number) => officeChartMixColor(base, amount);
  switch (preset) {
    case "lightGradient":
      return { angle: 180, stops: [
        { position: 0, color: tint(0.85) }, { position: 0.74, color: tint(0.55) },
        { position: 0.83, color: tint(0.45) }, { position: 1, color: tint(0.3) },
      ] };
    case "mediumGradient":
      return { angle: 180, stops: [
        { position: 0, color: tint(0.25) }, { position: 0.5, color: base },
        { position: 1, color: officeChartMixColor(base, -0.25) },
      ] };
    case "topSpotlight":
      return { path: { kind: "rect", fillToRect: { l: 50000, t: 0, r: 50000, b: 100000 } }, stops: [
        { position: 0, color: tint(0.5) }, { position: 1, color: base },
      ] };
    case "bottomSpotlight":
      return { path: { kind: "rect", fillToRect: { l: 50000, t: 100000, r: 50000, b: 0 } }, stops: [
        { position: 0, color: tint(0.5) }, { position: 1, color: base },
      ] };
    case "radialGradient":
      return { path: { kind: "circle", fillToRect: { l: 50000, t: 50000, r: 50000, b: 50000 } }, stops: [
        { position: 0, color: tint(0.6) }, { position: 1, color: base },
      ] };
  }
}

/** The style with Fill set to `kind`, seeded from the colour it draws now. */
export function officeChartStyleWithFillKind(
  style: OfficeChartPaintStyle | undefined,
  kind: Exclude<OfficeChartFillKind, "picture">,
  seed: string,
): OfficeChartPaintStyle {
  const current = style ?? {};
  const base =
    hexOf(current.fill) ??
    current.shapePaint?.fillGradient?.stops[0]?.color ??
    current.shapePaint?.fillPattern?.foreground ??
    seed;
  const cleared = withShapePaint(current, { fillGradient: undefined, fillPattern: undefined, fillAlpha: undefined });
  if (kind === "automatic") return withField(cleared, "fill", undefined);
  if (kind === "none") return withField(cleared, "fill", "none");
  if (kind === "solid") return withField(cleared, "fill", base as PresentationChartAreaPaint);
  if (kind === "gradient") {
    const gradient = officeChartGradientPreset("mediumGradient", base);
    return withField(withShapePaint(cleared, { fillGradient: gradient }), "fill", gradient.stops[0].color as PresentationChartAreaPaint);
  }
  const pattern: OfficeChartFillPattern = { preset: "pct5", foreground: base, background: "#ffffff" };
  return withField(withShapePaint(cleared, { fillPattern: pattern }), "fill", base as PresentationChartAreaPaint);
}

/** The style with Line (or Border) set to `kind`. */
export function officeChartStyleWithLineKind(
  style: OfficeChartPaintStyle | undefined,
  kind: OfficeChartLineKind,
  seed: string,
): OfficeChartPaintStyle {
  const current = style ?? {};
  const base = hexOf(current.outline) ?? current.shapePaint?.lineGradient?.stops[0]?.color ?? seed;
  const cleared = withShapePaint(current, { lineGradient: undefined, lineAlpha: undefined });
  if (kind === "automatic") return withField(cleared, "outline", undefined);
  if (kind === "none") return withField(cleared, "outline", "none");
  if (kind === "solid") return withField(cleared, "outline", base as PresentationChartAreaPaint);
  const gradient = officeChartGradientPreset("mediumGradient", base);
  return withField(withShapePaint(cleared, { lineGradient: gradient }), "outline", gradient.stops[0].color as PresentationChartAreaPaint);
}

/** The style with its fill or line gradient replaced; the colour field
 * follows the first stop, as the model holds it. */
export function officeChartStyleWithGradient(
  style: OfficeChartPaintStyle,
  target: "fill" | "line",
  gradient: OfficeShapeGradient,
): OfficeChartPaintStyle {
  const stops = [...gradient.stops].sort((left, right) => left.position - right.position);
  const next = { ...gradient, stops };
  return withField(
    withShapePaint(style, target === "fill" ? { fillGradient: next } : { lineGradient: next }),
    target === "fill" ? "fill" : "outline",
    stops[0].color as PresentationChartAreaPaint,
  );
}

/** Office's gradient Type of a gradient. */
export function officeChartGradientType(gradient: OfficeShapeGradient): OfficeChartGradientType {
  const kind = gradient.path?.kind;
  return kind === "circle" ? "radial" : kind === "rect" ? "rectangular" : kind === "shape" ? "path" : "linear";
}

export function officeChartGradientWithType(gradient: OfficeShapeGradient, type: OfficeChartGradientType): OfficeShapeGradient {
  // A path gradient has no angle (`OfficeShapeGradient.angle`); a linear one
  // made from it runs where a linear renderer drew it.
  if (type === "linear") return { angle: officeGradientAngle(gradient), stops: gradient.stops };
  const center = { l: 50000, t: 50000, r: 50000, b: 50000 };
  const kind = type === "radial" ? "circle" : type === "rectangular" ? "rect" : "shape";
  return { stops: gradient.stops, path: { kind, fillToRect: gradient.path?.fillToRect ?? center } };
}

/** Office's angle (0 = left to right) of a gradient whose model angle is CSS's. */
const officeAngle = (css: number) => (((css - 90) % 360) + 360) % 360;
const cssAngle = (office: number) => (((office + 90) % 360) + 360) % 360;

const gradientBar = (gradient: OfficeShapeGradient) =>
  officeGradientCss({ ...gradient, path: undefined, angle: 90 });

const percent = (value: number) => Math.round(value * 1000) / 10;

interface GradientEditorArgs {
  readonly target: "fill" | "line";
  readonly gradient: OfficeShapeGradient;
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  readonly write: (gradient: OfficeShapeGradient) => void;
  readonly base: string;
  readonly disabled: boolean;
  readonly reason?: string;
  readonly word: OfficePaneWord;
}

function gradientFields(args: GradientEditorArgs): OfficeShapeFormatPaneField[] {
  const { gradient, target, word, disabled, reason } = args;
  const base = { disabled, disabledReason: reason };
  const prefix = `${target}-gradient`;
  const stops = gradient.stops;
  const selected = Math.min(Math.max(args.selected, 0), stops.length - 1);
  const stop = stops[selected];
  const type = officeChartGradientType(gradient);
  const writeStop = (patch: Partial<OfficeShapeGradientStop>) => {
    // An edited stop is this product's: its theme identity goes with it.
    const nextStop: OfficeShapeGradientStop = { position: stop.position, color: stop.color, ...(stop.alpha === undefined ? {} : { alpha: stop.alpha }), ...patch };
    if (nextStop.alpha === undefined || nextStop.alpha >= 1) delete nextStop.alpha;
    const next = stops.map((entry, index) => (index === selected ? nextStop : entry));
    const sorted = [...next].sort((left, right) => left.position - right.position);
    args.onSelect(sorted.indexOf(nextStop));
    args.write({ ...gradient, stops: sorted });
  };
  const fields: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: `${prefix}-preset`,
      label: word("spreadsheet.chartFormatCopy.fillLine.presetGradients", "预设渐变", "Preset gradients"),
      value: "",
      ...base,
      options: [
        { value: "", label: word("spreadsheet.chartFormatCopy.fillLine.choosePreset", "选择预设…", "Choose a preset…") },
        ...OFFICE_CHART_GRADIENT_PRESETS.map((preset) => ({
          value: preset,
          label: word(`spreadsheet.chartFormatCopy.fillLine.gradientPreset.${preset}`, preset, preset),
        })),
      ],
      onChange: (value) => {
        if ((OFFICE_CHART_GRADIENT_PRESETS as readonly string[]).includes(value)) {
          args.onSelect(0);
          args.write(officeChartGradientPreset(value as OfficeChartGradientPreset, args.base));
        }
      },
    },
    {
      kind: "select",
      id: `${prefix}-type`,
      label: word("spreadsheet.chartFormatCopy.fillLine.type", "类型", "Type"),
      value: type,
      ...base,
      options: OFFICE_CHART_GRADIENT_TYPES.map((value) => ({
        value,
        label: word(`spreadsheet.chartFormatCopy.fillLine.gradientType.${value}`, value, value),
      })),
      onChange: (value) => args.write(officeChartGradientWithType(gradient, value as OfficeChartGradientType)),
    },
  ];
  if (type === "linear") {
    const angle = officeAngle(officeGradientAngle(gradient));
    fields.push(
      {
        kind: "select",
        id: `${prefix}-direction`,
        label: word("spreadsheet.chartFormatCopy.fillLine.directionLabel", "方向", "Direction"),
        value: OFFICE_CHART_LINEAR_DIRECTIONS.find((entry) => entry.angle === Math.round(angle))?.id ?? "",
        ...base,
        options: [
          ...(OFFICE_CHART_LINEAR_DIRECTIONS.some((entry) => entry.angle === Math.round(angle))
            ? []
            : [{ value: "", label: `${Math.round(angle * 10) / 10}°` }]),
          ...OFFICE_CHART_LINEAR_DIRECTIONS.map((entry) => ({
            value: entry.id,
            label: word(`spreadsheet.chartFormatCopy.fillLine.direction.${entry.id}`, entry.id, entry.id),
          })),
        ],
        onChange: (value) => {
          const entry = OFFICE_CHART_LINEAR_DIRECTIONS.find((candidate) => candidate.id === value);
          if (entry) args.write({ ...gradient, angle: cssAngle(entry.angle) });
        },
      },
      {
        kind: "number",
        id: `${prefix}-angle`,
        label: word("spreadsheet.chartFormatCopy.fillLine.angle", "角度", "Angle"),
        value: String(Math.round(angle * 10) / 10),
        min: 0,
        max: 359.9,
        step: 1,
        unit: "°",
        ...base,
        onCommit: (raw) => {
          const value = Number(raw);
          if (raw.trim() === "" || !Number.isFinite(value) || value < 0 || value >= 360) return false;
          args.write({ ...gradient, angle: cssAngle(value) });
          return true;
        },
      },
    );
  } else if (type !== "path") {
    const rect = gradient.path?.fillToRect;
    fields.push({
      kind: "select",
      id: `${prefix}-direction`,
      label: word("spreadsheet.chartFormatCopy.fillLine.directionLabel", "方向", "Direction"),
      value:
        OFFICE_CHART_FOCUS_DIRECTIONS.find(
          (entry) => rect && entry.rect.l === rect.l && entry.rect.t === rect.t && entry.rect.r === rect.r && entry.rect.b === rect.b,
        )?.id ?? "",
      ...base,
      options: OFFICE_CHART_FOCUS_DIRECTIONS.map((entry) => ({
        value: entry.id,
        label: word(`spreadsheet.chartFormatCopy.fillLine.direction.${entry.id}`, entry.id, entry.id),
      })),
      onChange: (value) => {
        const entry = OFFICE_CHART_FOCUS_DIRECTIONS.find((candidate) => candidate.id === value);
        if (entry && gradient.path) args.write({ ...gradient, path: { ...gradient.path, fillToRect: { ...entry.rect } } });
      },
    });
  }
  const stopLabel = (index: number) =>
    word("spreadsheet.chartFormatCopy.fillLine.stopLabel", `第 ${index + 1} 个光圈，共 ${stops.length} 个`, `Stop ${index + 1} of ${stops.length}`, {
      index: index + 1,
      count: stops.length,
    });
  const bar: ReactNode = (
    <div className={paneStyles.field}>
      <span>{word("spreadsheet.chartFormatCopy.fillLine.gradientStops", "渐变光圈", "Gradient stops")}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          role="group"
          aria-label={word("spreadsheet.chartFormatCopy.fillLine.gradientStops", "渐变光圈", "Gradient stops")}
          style={{
            position: "relative",
            flex: 1,
            height: 18,
            borderRadius: 3,
            border: "1px solid #a3a3a3",
            backgroundImage: `${gradientBar(gradient)}, repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%)`,
            backgroundSize: "auto, 8px 8px",
          }}
        >
          {stops.map((entry, index) => (
            <button
              key={`${index}-${entry.position}`}
              type="button"
              aria-label={stopLabel(index)}
              aria-pressed={index === selected}
              title={stopLabel(index)}
              data-testid={`document-chart-format-pane-${prefix}-stop-${index}`}
              onClick={() => args.onSelect(index)}
              style={{
                position: "absolute",
                left: `calc(${percent(entry.position)}% - 6px)`,
                top: 10,
                width: 12,
                height: 14,
                padding: 0,
                border: index === selected ? "2px solid #0f6cbd" : "1px solid #525252",
                borderRadius: 2,
                background: entry.color,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={disabled || stops.length >= OFFICE_CHART_MAX_GRADIENT_STOPS}
          title={word("spreadsheet.chartFormatCopy.fillLine.addStop", "添加渐变光圈", "Add gradient stop")}
          aria-label={word("spreadsheet.chartFormatCopy.fillLine.addStop", "添加渐变光圈", "Add gradient stop")}
          data-testid={`document-chart-format-pane-${prefix}-add-stop`}
          onClick={() => {
            // Office's Add gradient stop: halfway to the next stop (or the
            // previous one at the end), in the selected stop's colour.
            const neighbour = stops[selected + 1] ?? stops[selected - 1] ?? stop;
            const position = Math.round(((stop.position + neighbour.position) / 2) * 1000) / 1000;
            const added: OfficeShapeGradientStop = { position, color: stop.color, ...(stop.alpha === undefined ? {} : { alpha: stop.alpha }) };
            const next = [...stops, added].sort((left, right) => left.position - right.position);
            args.onSelect(next.indexOf(added));
            args.write({ ...gradient, stops: next });
          }}
        >
          <Plus size={14} aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || stops.length <= 2}
          title={word("spreadsheet.chartFormatCopy.fillLine.removeStop", "删除渐变光圈", "Remove gradient stop")}
          aria-label={word("spreadsheet.chartFormatCopy.fillLine.removeStop", "删除渐变光圈", "Remove gradient stop")}
          data-testid={`document-chart-format-pane-${prefix}-remove-stop`}
          onClick={() => {
            const next = stops.filter((_entry, index) => index !== selected);
            args.onSelect(Math.max(0, selected - 1));
            args.write({ ...gradient, stops: next });
          }}
        >
          <Minus size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
  fields.push(
    { kind: "custom", id: `${prefix}-stops`, render: bar },
    {
      kind: "color",
      id: `${prefix}-stop-color`,
      label: word("spreadsheet.chartFormatCopy.pane.color", "颜色", "Color"),
      value: stop.color,
      ...base,
      onChange: (value) => {
        if (hexOf(value)) writeStop({ color: value.toLowerCase() });
      },
    },
    {
      kind: "number",
      id: `${prefix}-stop-position`,
      label: word("spreadsheet.chartFormatCopy.fillLine.position", "位置", "Position"),
      value: String(percent(stop.position)),
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const value = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) return false;
        writeStop({ position: Math.round(value * 10) / 1000 });
        return true;
      },
    },
    {
      kind: "number",
      id: `${prefix}-stop-transparency`,
      label: word("spreadsheet.chartFormatCopy.fillLine.transparency", "透明度", "Transparency"),
      value: String(Math.round((1 - (stop.alpha ?? 1)) * 100)),
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const value = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) return false;
        writeStop({ alpha: value === 0 ? undefined : Math.round(100 - value) / 100 });
        return true;
      },
    },
    {
      kind: "number",
      id: `${prefix}-stop-brightness`,
      label: word("spreadsheet.chartFormatCopy.fillLine.brightness", "亮度", "Brightness"),
      value: String(officeChartColorBrightness(stop.color)),
      min: -100,
      max: 100,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const value = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(value) || value < -100 || value > 100) return false;
        writeStop({ color: officeChartColorAtBrightness(stop.color, value) });
        return true;
      },
    },
  );
  return fields;
}

export interface OfficeChartFillLineArgs {
  /** The element's style record as it stands (undefined: all automatic). */
  readonly style: OfficeChartPaintStyle | undefined;
  /** The Format pane's area key (`chartAreaStyle`, `series:0`, `gridlines` …). */
  readonly area: string;
  readonly chartType?: string;
  /** Whether the element has an area to fill (a line element has none). */
  readonly fillAvailable: boolean;
  /** Why nothing can be written now; null when it can. */
  readonly disabledReason: string | null;
  readonly word: OfficePaneWord;
  /** The host palette rows for the solid fill and line colours (theme
   * colours, recent colours, More Colors). */
  readonly fillColorRow: OfficeShapeFormatPaneField;
  readonly lineColorRow: OfficeShapeFormatPaneField;
  /** The colours the element draws while automatic, seeding a new paint. */
  readonly automaticFill?: string;
  readonly automaticLine?: string;
  /** The gradient stop each gradient editor has selected (pane state). */
  readonly selectedStop: { readonly fill: number; readonly line: number };
  readonly onSelectStop: (target: "fill" | "line", index: number) => void;
  /** Writes the element's whole style record. */
  readonly onStyle: (next: OfficeChartPaintStyle) => void;
  /** Whether the Fill section offers Picture or texture fill as a kind the
   * element cannot take yet (shown greyed with its reason, as Office's
   * pane is). */
  readonly pictureFillReason?: string;
  /** A line or scatter series: Line ▸ Smoothed line, checked as it draws. */
  readonly smooth?: { readonly checked: boolean };
  /** The chart area: Border ▸ Rounded corners, and its writer. */
  readonly roundedCorners?: { readonly checked: boolean; readonly onChange: (checked: boolean) => void };
  /**
   * A shape (Format Shape), not a chart element: Fill and Line list no
   * Automatic (a shape always states its paint), as Office's shape page.
   */
  readonly noAutomatic?: boolean;
  /**
   * A shape: whether its line is open (a line or an arc takes Begin / End
   * Arrow), in place of the chart element's area rule; its unstated Join
   * type; and the section's name, "Line" as Office's Format Shape names it.
   */
  readonly openLine?: boolean;
  readonly lineJoinDefault?: OfficeStrokeJoin;
  readonly lineSectionTitle?: "line";
  /**
   * Picture or texture fill on a host that keeps one: the kind is live, the
   * host writes it when picked, and its own fields follow while it is the
   * fill (absent: the kind is listed greyed with `pictureFillReason`).
   */
  readonly pictureFill?: {
    readonly active: boolean;
    readonly onSelect: () => void;
    readonly fields: readonly OfficeShapeFormatPaneField[];
    /**
     * Another fill kind picked while the picture IS the fill: the host gets
     * the new record here and writes its fill whole (the picture goes even
     * when the colour underneath is unchanged). Absent: `onStyle`.
     */
    readonly onLeave?: (next: OfficeChartPaintStyle) => void;
  };
  /** A series that draws markers: Marker ▸ Marker Options (built-in type
   * and size; absent is Automatic, the series' default marker). */
  readonly marker?: { readonly symbol?: ChartMarkerSymbol; readonly size?: number };
}

/**
 * Format Shape > Fill > Picture or texture fill on a host whose shape holds a
 * fill picture (Docs, the worksheet, the deck): the kind is live while the
 * picture IS the fill, Picture opens the host's file picker, and the
 * picture's own row offers another one (Office's "Picture source: Insert",
 * and Clipboard where the host reads one). A kind picked away from it reaches
 * `onLeave`, which writes that fill whole.
 *
 * With `options` the page goes on as Office's does (the model and its
 * DrawingML: `lib/office-picture-fill-options`): Transparency, "Tile picture
 * as texture", then Offset X / Y (pt), Scale X / Y (%), Alignment and Mirror
 * type for a tile, or Offset left / right / top / bottom (%) for a stretch,
 * and "Rotate with shape". The host writes the whole option record handed to
 * it.
 */
export function officePictureFillPaneArgs(args: {
  readonly active: boolean;
  readonly label: string;
  readonly buttonLabel: string;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly onPick: () => void;
  readonly onLeave?: (next: OfficeChartPaintStyle) => void;
  readonly onClipboard?: () => void;
  /** Texture: the gallery's texture (by id) tiled as the shape's fill. */
  readonly onTexture?: (id: string) => void;
  /** Host rows drawn after the source row (the deck's picture URL). */
  readonly sourceExtra?: readonly OfficeShapeFormatPaneField[];
  readonly options?: OfficePictureFillPaneOptions;
}): NonNullable<OfficeChartFillLineArgs["pictureFill"]> {
  const base = { disabled: args.disabled, disabledReason: args.disabledReason };
  const fields: OfficeShapeFormatPaneField[] = [
    {
      kind: "buttons",
      id: "picture-source",
      label: args.label,
      ...base,
      buttons: [
        { id: "insert", label: args.buttonLabel, disabled: args.disabled, onSelect: args.onPick },
        ...(args.onClipboard && args.options
          ? [
              {
                id: "clipboard",
                label: args.options.word("office.pictureFill.clipboard", "剪贴板", "Clipboard"),
                disabled: args.disabled,
                onSelect: args.onClipboard,
              },
            ]
          : []),
      ],
    },
    ...(args.onTexture
      ? [
          {
            kind: "custom" as const,
            id: "picture-texture",
            render: (
              <OfficeTextureGallery disabled={args.disabled} onPick={args.onTexture} />
            ),
          },
        ]
      : []),
    ...(args.sourceExtra ?? []),
  ];
  if (args.options) fields.push(...officePictureFillOptionFields(args.options, base));
  return {
    active: args.active,
    onSelect: args.onPick,
    ...(args.onLeave ? { onLeave: args.onLeave } : {}),
    fields,
  };
}

export interface OfficePictureFillPaneOptions {
  readonly value: OfficePictureFillOptions;
  readonly onChange: (next: OfficePictureFillOptions) => void;
  readonly word: OfficePaneWord;
}

const PICTURE_TILE_ALIGNMENT_NAMES: Record<OfficePictureTileAlignment, readonly [string, string]> = {
  tl: ["左上", "Top left"],
  t: ["上", "Top"],
  tr: ["右上", "Top right"],
  l: ["左", "Left"],
  ctr: ["居中", "Center"],
  r: ["右", "Right"],
  bl: ["左下", "Bottom left"],
  b: ["下", "Bottom"],
  br: ["右下", "Bottom right"],
};
const PICTURE_TILE_FLIP_NAMES: Record<OfficePictureTileFlip, readonly [string, string]> = {
  none: ["无", "None"],
  x: ["水平", "Horizontal"],
  y: ["垂直", "Vertical"],
  xy: ["两者", "Both"],
};

/** The option rows of a picture fill, in Office's order. */
export function officePictureFillOptionFields(
  options: OfficePictureFillPaneOptions,
  base: { readonly disabled: boolean; readonly disabledReason?: string },
): OfficeShapeFormatPaneField[] {
  const { word } = options;
  const value = normalizeOfficePictureFillOptions(options.value) ?? {};
  const write = (next: OfficePictureFillOptions): boolean => {
    const normalized = normalizeOfficePictureFillOptions(next);
    if (!normalized || base.disabled) return false;
    options.onChange(normalized);
    return true;
  };
  const numberIn = (raw: string, min: number, max: number): number | null => {
    const number = Number(raw);
    return raw.trim() === "" || !Number.isFinite(number) || number < min || number > max ? null : number;
  };
  const units = officePictureFillPaneUnits;
  const fields: OfficeShapeFormatPaneField[] = [
    {
      kind: "number",
      id: "picture-transparency",
      label: word("spreadsheet.chartFormatCopy.fillLine.transparency", "透明度", "Transparency"),
      value: String(value.transparency ?? 0),
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const number = numberIn(raw, 0, 100);
        return number !== null && write({ ...value, transparency: Math.round(number) || undefined });
      },
    },
    {
      kind: "checkbox",
      id: "picture-tile",
      label: word("office.pictureFill.tile", "将图片平铺为纹理", "Tile picture as texture"),
      checked: Boolean(value.tile),
      ...base,
      onChange: (checked) => {
        const rest: OfficePictureFillOptions = { transparency: value.transparency, rotWithShape: value.rotWithShape };
        // Office's own tile when the box is ticked: 100 % from the top left.
        write(checked ? { ...rest, tile: { tx: 0, ty: 0, sx: 100_000, sy: 100_000, algn: "tl", flip: "none" } } : rest);
      },
    },
  ];
  if (value.tile) {
    const tile = value.tile;
    const writeTile = (patch: Partial<OfficePictureFillTile>) => write({ ...value, tile: { ...tile, ...patch } });
    const offset = (axis: "tx" | "ty", id: string, zh: string, en: string): OfficeShapeFormatPaneField => ({
      kind: "number",
      id,
      label: word(`office.pictureFill.${id}`, zh, en),
      value: String(units.ptFromEmu(tile[axis])),
      min: -OFFICE_PICTURE_PANE_OFFSET_PT,
      max: OFFICE_PICTURE_PANE_OFFSET_PT,
      step: 0.1,
      unit: "pt",
      ...base,
      onCommit: (raw) => {
        const number = numberIn(raw, -OFFICE_PICTURE_PANE_OFFSET_PT, OFFICE_PICTURE_PANE_OFFSET_PT);
        return number !== null && writeTile({ [axis]: units.emuFromPt(number) });
      },
    });
    const scale = (axis: "sx" | "sy", id: string, zh: string, en: string): OfficeShapeFormatPaneField => ({
      kind: "number",
      id,
      label: word(`office.pictureFill.${id}`, zh, en),
      value: String(units.percentFromThousandths(tile[axis], 100_000)),
      min: OFFICE_PICTURE_PANE_SCALE.min,
      max: OFFICE_PICTURE_PANE_SCALE.max,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const number = numberIn(raw, OFFICE_PICTURE_PANE_SCALE.min, OFFICE_PICTURE_PANE_SCALE.max);
        return number !== null && writeTile({ [axis]: units.thousandthsFromPercent(number) });
      },
    });
    fields.push(
      offset("tx", "picture-offset-x", "偏移量 X", "Offset X"),
      offset("ty", "picture-offset-y", "偏移量 Y", "Offset Y"),
      scale("sx", "picture-scale-x", "刻度 X", "Scale X"),
      scale("sy", "picture-scale-y", "刻度 Y", "Scale Y"),
      {
        kind: "select",
        id: "picture-alignment",
        label: word("office.pictureFill.alignmentLabel", "对齐方式", "Alignment"),
        value: tile.algn ?? "tl",
        ...base,
        options: OFFICE_PICTURE_TILE_ALIGNMENTS.map((algn) => ({
          value: algn,
          label: word(`office.pictureFill.alignment.${algn}`, ...PICTURE_TILE_ALIGNMENT_NAMES[algn]),
        })),
        onChange: (next) => void writeTile({ algn: next as OfficePictureTileAlignment }),
      },
      {
        kind: "select",
        id: "picture-mirror",
        label: word("office.pictureFill.mirrorLabel", "镜像类型", "Mirror type"),
        value: tile.flip ?? "none",
        ...base,
        options: OFFICE_PICTURE_TILE_FLIPS.map((flip) => ({
          value: flip,
          label: word(`office.pictureFill.mirror.${flip}`, ...PICTURE_TILE_FLIP_NAMES[flip]),
        })),
        onChange: (next) => void writeTile({ flip: next as OfficePictureTileFlip }),
      },
    );
  } else {
    const rect = value.fillRect ?? {};
    const inset = (side: "l" | "r" | "t" | "b", id: string, zh: string, en: string): OfficeShapeFormatPaneField => ({
      kind: "number",
      id,
      label: word(`office.pictureFill.${id}`, zh, en),
      value: String(units.percentFromThousandths(rect[side])),
      min: -OFFICE_PICTURE_PANE_OFFSET_PERCENT,
      max: OFFICE_PICTURE_PANE_OFFSET_PERCENT,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const number = numberIn(raw, -OFFICE_PICTURE_PANE_OFFSET_PERCENT, OFFICE_PICTURE_PANE_OFFSET_PERCENT);
        return number !== null && write({ ...value, fillRect: { ...rect, [side]: units.thousandthsFromPercent(number) } });
      },
    });
    fields.push(
      inset("l", "picture-offset-left", "向左偏移", "Offset left"),
      inset("r", "picture-offset-right", "向右偏移", "Offset right"),
      inset("t", "picture-offset-top", "向上偏移", "Offset top"),
      inset("b", "picture-offset-bottom", "向下偏移", "Offset bottom"),
    );
  }
  fields.push({
    kind: "checkbox",
    id: "picture-rotate-with-shape",
    label: word("office.pictureFill.rotateWithShape", "与形状一起旋转", "Rotate with shape"),
    checked: value.rotWithShape !== false,
    ...base,
    onChange: (checked) => void write({ ...value, rotWithShape: checked }),
  });
  return fields;
}

/** Elements Office draws as an open line, which take arrow ends. */
const OPEN_LINE_AREAS = new Set([
  "gridlines",
  "trendlineStyle",
  "errorBarStyle",
  "dropLineStyle",
  "highLowLineStyle",
  "seriesLineStyle",
  "dataLabelLeaderLineStyle",
]);

export function officeChartAreaIsOpenLine(area: string, chartType: string | undefined): boolean {
  return (
    OPEN_LINE_AREAS.has(area) ||
    area.startsWith("axis:") ||
    area.startsWith("errorBarStyle:") ||
    (area.startsWith("series:") && (chartType === "line" || chartType === "xy" || chartType === "radar"))
  );
}

/**
 * Format ▸ Fill & Line: the Fill section (an element with an area) and the
 * Border / Line section, as `OfficeShapeFormatPane` sections.
 */
export function officeChartFillLineSections(args: OfficeChartFillLineArgs): OfficeShapeFormatPaneSection[] {
  const { word, style } = args;
  const disabled = args.disabledReason !== null;
  const reason = args.disabledReason ?? undefined;
  const base = { disabled, disabledReason: reason };
  const paint = style?.shapePaint ?? {};
  const write = (next: OfficeChartPaintStyle) => {
    if (!disabled) args.onStyle(next);
  };
  const current: OfficeChartPaintStyle = style ?? {};
  const fillSeed = args.automaticFill ?? "#ffffff";
  const lineSeed = args.automaticLine ?? "#d9d9d9";
  const sections: OfficeShapeFormatPaneSection[] = [];
  const transparencyField = (target: "fill" | "line"): OfficeShapeFormatPaneField => {
    const alpha = target === "fill" ? paint.fillAlpha : paint.lineAlpha;
    return {
      kind: "number",
      id: `${target}-transparency`,
      label: word("spreadsheet.chartFormatCopy.fillLine.transparency", "透明度", "Transparency"),
      value: String(Math.round((1 - (alpha ?? 1)) * 100)),
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      ...base,
      onCommit: (raw) => {
        const value = Number(raw);
        // Fully transparent is the colour at 0 opacity; 0 % is opaque.
        if (raw.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) return false;
        write(withShapePaint(current, { [target === "fill" ? "fillAlpha" : "lineAlpha"]: value === 0 ? undefined : Math.round(100 - value) / 100 }));
        return true;
      },
    };
  };

  if (args.fillAvailable) {
    const kind = args.pictureFill?.active ? "picture" : officeChartFillKind(style);
    const fields: OfficeShapeFormatPaneField[] = [
      {
        kind: "select",
        id: "fill-type",
        label: word("spreadsheet.chartFormatCopy.fillLine.fillType", "填充类型", "Fill type"),
        value: kind,
        ...base,
        options: [
          { value: "none", label: word("spreadsheet.chartFormatCopy.pane.noFill", "无填充", "No Fill") },
          { value: "solid", label: word("spreadsheet.chartFormatCopy.fillLine.solidFill", "纯色填充", "Solid fill") },
          { value: "gradient", label: word("spreadsheet.chartFormatCopy.fillLine.gradientFill", "渐变填充", "Gradient fill") },
          {
            value: "picture",
            label: word("spreadsheet.chartFormatCopy.fillLine.pictureFill", "图片或纹理填充", "Picture or texture fill"),
            disabled: !args.pictureFill,
            title: args.pictureFill ? undefined : args.pictureFillReason,
          },
          { value: "pattern", label: word("spreadsheet.chartFormatCopy.fillLine.patternFill", "图案填充", "Pattern fill") },
          ...(args.noAutomatic
            ? []
            : [{ value: "automatic", label: word("spreadsheet.chartFormatCopy.pane.automatic", "自动", "Automatic") }]),
        ],
        onChange: (value) => {
          if (value === kind) return;
          if (value === "picture") {
            args.pictureFill?.onSelect();
            return;
          }
          args.onSelectStop("fill", 0);
          const next = officeChartStyleWithFillKind(current, value as Exclude<OfficeChartFillKind, "picture">, fillSeed);
          if (kind === "picture" && args.pictureFill?.onLeave) {
            if (!disabled) args.pictureFill.onLeave(next);
            return;
          }
          write(next);
        },
      },
    ];
    // Automatic shows the colour it would take: picking one makes the fill
    // solid in it, as Shape Fill does on the ribbon.
    if (kind === "solid" || kind === "automatic") fields.push(args.fillColorRow);
    if (kind === "picture" && args.pictureFill) fields.push(...args.pictureFill.fields);
    if (kind === "solid") fields.push(transparencyField("fill"));
    if (kind === "gradient" && paint.fillGradient) {
      fields.push(
        ...gradientFields({
          target: "fill",
          gradient: paint.fillGradient,
          selected: args.selectedStop.fill,
          onSelect: (index) => args.onSelectStop("fill", index),
          write: (gradient) => write(officeChartStyleWithGradient(current, "fill", gradient)),
          base: paint.fillGradient.stops[paint.fillGradient.stops.length - 1]?.color ?? fillSeed,
          disabled,
          reason,
          word,
        }),
      );
    }
    if (kind === "pattern" && paint.fillPattern) {
      const pattern = paint.fillPattern;
      const writePattern = (next: OfficeChartFillPattern) =>
        write(withField(withShapePaint(current, { fillPattern: next }), "fill", next.foreground as PresentationChartAreaPaint));
      fields.push(
        {
          kind: "custom",
          id: "fill-pattern-preview",
          render: (
            <span
              aria-hidden="true"
              style={{ display: "block", height: 22, border: "1px solid #a3a3a3", borderRadius: 3, background: officeFillPatternCss(pattern) }}
            />
          ),
        },
        {
          kind: "select",
          id: "fill-pattern",
          label: word("spreadsheet.chartFormatCopy.fillLine.pattern", "图案", "Pattern"),
          value: pattern.preset,
          ...base,
          options: OFFICE_CHART_FILL_PATTERNS.map((preset) => ({
            value: preset,
            label: word(`spreadsheet.chartFormatCopy.fillLine.patternName.${preset}`, preset, preset),
          })),
          onChange: (value) => writePattern({ ...pattern, preset: value as OfficeChartFillPattern["preset"] }),
        },
        {
          kind: "color",
          id: "fill-pattern-foreground",
          label: word("spreadsheet.chartFormatCopy.fillLine.foreground", "前景", "Foreground"),
          value: pattern.foreground,
          ...base,
          onChange: (value) => {
            if (hexOf(value)) writePattern({ ...pattern, foreground: value.toLowerCase() });
          },
        },
        {
          kind: "color",
          id: "fill-pattern-background",
          label: word("spreadsheet.chartFormatCopy.fillLine.background", "背景", "Background"),
          value: pattern.background,
          ...base,
          onChange: (value) => {
            if (hexOf(value)) writePattern({ ...pattern, background: value.toLowerCase() });
          },
        },
      );
    }
    sections.push({ id: "fill", title: word("spreadsheet.chartFormatCopy.pane.fill", "填充", "Fill"), fields });
  }

  const lineKind = officeChartLineKind(style);
  const openLine = args.openLine ?? officeChartAreaIsOpenLine(args.area, args.chartType);
  const joinDefault = args.lineJoinDefault ?? "round";
  const lineFields: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: "line-type",
      label: word("spreadsheet.chartFormatCopy.fillLine.lineType", "线条类型", "Line type"),
      value: lineKind,
      ...base,
      options: [
        { value: "none", label: word("spreadsheet.chartFormatCopy.pane.noLine", "无线条", "No Line") },
        { value: "solid", label: word("spreadsheet.chartFormatCopy.fillLine.solidLine", "实线", "Solid line") },
        { value: "gradient", label: word("spreadsheet.chartFormatCopy.fillLine.gradientLine", "渐变线", "Gradient line") },
        ...(args.noAutomatic
          ? []
          : [{ value: "automatic", label: word("spreadsheet.chartFormatCopy.pane.automatic", "自动", "Automatic") }]),
      ],
      onChange: (value) => {
        if (value === lineKind) return;
        args.onSelectStop("line", 0);
        write(officeChartStyleWithLineKind(current, value as OfficeChartLineKind, lineSeed));
      },
    },
  ];
  if (lineKind === "solid" || lineKind === "automatic") lineFields.push(args.lineColorRow);
  if (lineKind === "solid") lineFields.push(transparencyField("line"));
  if (lineKind === "gradient" && paint.lineGradient) {
    lineFields.push(
      ...gradientFields({
        target: "line",
        gradient: paint.lineGradient,
        selected: args.selectedStop.line,
        onSelect: (index) => args.onSelectStop("line", index),
        write: (gradient) => write(officeChartStyleWithGradient(current, "line", gradient)),
        base: paint.lineGradient.stops[paint.lineGradient.stops.length - 1]?.color ?? lineSeed,
        disabled,
        reason,
        word,
      }),
    );
  }
  if (lineKind !== "none") {
    const defaultCap = officeChartDefaultLineCap(args.area, args.chartType);
    const detail = (key: "lineCompound" | "lineCap" | "lineJoin", value: string, fallback: string) =>
      write(withShapePaint(current, { [key]: value === fallback ? undefined : value }));
    const ends: OfficeChartLineEnds = paint.lineEnds ?? {};
    const writeEnds = (patch: Partial<Record<keyof OfficeChartLineEnds, string | undefined>>) => {
      const next: Record<string, string | undefined> = { ...ends, ...patch };
      for (const side of ["head", "tail"] as const)
        if (!next[`${side}End`]) {
          delete next[`${side}End`];
          delete next[`${side}EndWidth`];
          delete next[`${side}EndLength`];
        }
      for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
      write(withShapePaint(current, { lineEnds: Object.keys(next).length ? next : undefined }));
    };
    const arrowReason = openLine
      ? reason
      : word("spreadsheet.chartFormatCopy.fillLine.arrowsOnOpenLines", "箭头只用于开放线条", "Arrows apply to open lines only");
    const arrowBase = { disabled: disabled || !openLine, disabledReason: arrowReason };
    const sizeChoices = OFFICE_CHART_LINE_END_SIZES.flatMap((w) => OFFICE_CHART_LINE_END_SIZES.map((len) => ({ w, len })));
    const sizeLabel = (w: string, len: string) =>
      word("officeArrows.sizeCell", `${w}, ${len}`, `${w}, ${len}`, {
        width: word(`officeArrows.width.${w}`, w, w),
        length: word(`officeArrows.length.${len}`, len, len),
      });
    const endFields = (side: "head" | "tail"): OfficeShapeFormatPaneField[] => {
      const type = ends[`${side}End`];
      const width = ends[`${side}EndWidth`] ?? "med";
      const length = ends[`${side}EndLength`] ?? "med";
      return [
        {
          kind: "select",
          id: `line-${side}-type`,
          label:
            side === "head"
              ? word("officeArrows.beginType", "开始箭头类型", "Begin Arrow type")
              : word("officeArrows.endType", "结尾箭头类型", "End Arrow type"),
          value: type ?? "none",
          ...arrowBase,
          options: ["none", ...OFFICE_CHART_LINE_END_TYPES].map((value) => ({
            value,
            label: word(`officeArrows.type.${value}`, value, value),
          })),
          onChange: (value) => writeEnds({ [`${side}End`]: value === "none" ? undefined : value }),
        },
        {
          kind: "select",
          id: `line-${side}-size`,
          label:
            side === "head"
              ? word("officeArrows.beginSize", "开始箭头粗细", "Begin Arrow size")
              : word("officeArrows.endSize", "结尾箭头粗细", "End Arrow size"),
          value: `${width}:${length}`,
          disabled: arrowBase.disabled || !type,
          disabledReason: arrowBase.disabledReason,
          options: sizeChoices.map(({ w, len }) => ({ value: `${w}:${len}`, label: sizeLabel(w, len) })),
          onChange: (value) => {
            const [w, len] = value.split(":");
            // The medium pair is Office's unstated size.
            writeEnds(
              w === "med" && len === "med"
                ? { [`${side}EndWidth`]: undefined, [`${side}EndLength`]: undefined }
                : { [`${side}EndWidth`]: w, [`${side}EndLength`]: len },
            );
          },
        },
      ];
    };
    const dash = paint.lineDash ?? "solid";
    lineFields.push(
      {
        kind: "number",
        id: "line-width",
        label: word("spreadsheet.chartFormatCopy.pane.width", "宽度", "Width"),
        value: paint.outlineWidthPt === undefined ? "" : String(paint.outlineWidthPt),
        placeholder: word("spreadsheet.chartFormatCopy.pane.automatic", "自动", "Automatic"),
        min: 0,
        max: MAX_CHART_OUTLINE_WIDTH_PT,
        step: 0.25,
        unit: word("spreadsheet.chartFormatCopy.fillLine.points", "磅", "pt"),
        ...base,
        onCommit: (raw) => {
          const text = raw.trim();
          const value = text === "" ? undefined : Number(text);
          if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > MAX_CHART_OUTLINE_WIDTH_PT)) return false;
          write(withShapePaint(current, { outlineWidthPt: value === undefined ? undefined : Math.round(value * 100) / 100 }));
          return true;
        },
      },
      {
        kind: "select",
        id: "line-compound",
        label: word("spreadsheet.chartFormatCopy.fillLine.compoundType", "复合类型", "Compound type"),
        value: paint.lineCompound ?? "single",
        ...base,
        options: ["single", ...OFFICE_STROKE_COMPOUNDS].map((value) => ({
          value,
          label: word(`spreadsheet.chartFormatCopy.fillLine.compound.${value}`, value, value),
        })),
        onChange: (value) => detail("lineCompound", value as OfficeStrokeCompound | "single", "single"),
      },
      {
        kind: "select",
        id: "line-dash",
        label: word("spreadsheet.chartFormatCopy.fillLine.dashType", "短划线类型", "Dash type"),
        value: dash,
        ...base,
        options: [
          ...OFFICE_CHART_PANE_DASHES,
          ...(OFFICE_CHART_PANE_DASHES.includes(dash) ? [] : [dash]),
        ].map((value) => ({
          value,
          label: (OFFICE_CHART_PANE_DASHES as readonly string[]).includes(value)
            ? word(`presentation.officeGraphic.dash.${value}`, value, value)
            : value,
        })),
        onChange: (value) => write(withShapePaint(current, { lineDash: value === "solid" ? undefined : value })),
      },
      {
        kind: "select",
        id: "line-cap",
        label: word("spreadsheet.chartFormatCopy.fillLine.capType", "线端类型", "Cap type"),
        value: paint.lineCap ?? defaultCap,
        ...base,
        // Office lists them Square, Round, Flat.
        options: (["square", "round", "flat"] as const satisfies readonly OfficeStrokeCap[]).map((value) => ({
          value,
          label: word(`spreadsheet.chartFormatCopy.fillLine.cap.${value}`, value, value),
        })),
        onChange: (value) => detail("lineCap", value, defaultCap),
      },
      {
        kind: "select",
        id: "line-join",
        label: word("spreadsheet.chartFormatCopy.fillLine.joinType", "连接类型", "Join type"),
        value: paint.lineJoin ?? joinDefault,
        ...base,
        options: OFFICE_STROKE_JOINS.map((value: OfficeStrokeJoin) => ({
          value,
          label: word(`spreadsheet.chartFormatCopy.fillLine.join.${value}`, value, value),
        })),
        onChange: (value) => detail("lineJoin", value, joinDefault),
      },
      ...endFields("head"),
      ...endFields("tail"),
    );
  }
  if (args.roundedCorners) {
    const rounded = args.roundedCorners;
    lineFields.push({
      kind: "checkbox",
      id: "line-rounded-corners",
      label: word("spreadsheet.chartFormatCopy.fillLine.roundedCorners", "圆角", "Rounded corners"),
      checked: rounded.checked,
      ...base,
      onChange: (checked) => {
        if (!disabled) rounded.onChange(checked);
      },
    });
  }
  if (args.smooth) {
    lineFields.push({
      kind: "checkbox",
      id: "line-smooth",
      label: word("spreadsheet.chartFormatCopy.fillLine.smoothedLine", "平滑线", "Smoothed line"),
      checked: args.smooth.checked,
      ...base,
      onChange: (checked) => write({ ...current, smooth: checked }),
    });
  }
  sections.push({
    id: "line",
    title:
      args.fillAvailable && args.lineSectionTitle !== "line"
        ? word("spreadsheet.chartFormatCopy.fillLine.border", "边框", "Border")
        : word("spreadsheet.chartFormatCopy.pane.line", "线条", "Line"),
    fields: lineFields,
  });
  if (args.marker) {
    const marker = args.marker;
    const writeMarker = (next: { symbol: ChartMarkerSymbol; size?: number } | undefined) => {
      const record: Record<string, unknown> = { ...current };
      if (next) record.marker = next;
      else delete record.marker;
      write(record as OfficeChartPaintStyle);
    };
    sections.push({
      id: "marker",
      title: word("spreadsheet.chartFormatCopy.fillLine.markerOptions", "标记选项", "Marker Options"),
      fields: [
        {
          kind: "select",
          id: "marker-type",
          label: word("spreadsheet.chartFormatCopy.fillLine.markerType", "类型", "Type"),
          value: marker.symbol ?? "automatic",
          ...base,
          options: ["automatic", ...CHART_MARKER_SYMBOLS].map((value) => ({
            value,
            label:
              value === "automatic"
                ? word("spreadsheet.chartFormatCopy.pane.automatic", "自动", "Automatic")
                : word(`spreadsheet.chartFormatCopy.fillLine.marker.${value}`, value, value),
          })),
          onChange: (value) =>
            writeMarker(
              value === "automatic"
                ? undefined
                : value === "none"
                  ? { symbol: "none" }
                  : { symbol: value as ChartMarkerSymbol, ...(marker.size === undefined ? {} : { size: marker.size }) },
            ),
        },
        {
          kind: "number",
          id: "marker-size",
          label: word("spreadsheet.chartFormatCopy.fillLine.markerSize", "大小", "Size"),
          value: marker.size === undefined ? "" : String(marker.size),
          placeholder: word("spreadsheet.chartFormatCopy.pane.automatic", "自动", "Automatic"),
          min: MIN_CHART_MARKER_SIZE,
          max: MAX_CHART_MARKER_SIZE,
          step: 1,
          disabled: disabled || !marker.symbol || marker.symbol === "none",
          disabledReason: reason,
          onCommit: (raw) => {
            const text = raw.trim();
            const value = text === "" ? undefined : Number(text);
            if (!marker.symbol || marker.symbol === "none") return false;
            if (value !== undefined && (!Number.isInteger(value) || value < MIN_CHART_MARKER_SIZE || value > MAX_CHART_MARKER_SIZE)) return false;
            writeMarker({ symbol: marker.symbol, ...(value === undefined ? {} : { size: value }) });
            return true;
          },
        },
      ],
    });
  }
  return sections;
}

/** The colour a solid paint draws at its transparency, for a swatch. */
export function officeChartSwatchColor(color: string | undefined, alpha: number | undefined): string {
  return color && color !== "none" ? officeChartColorWithOpacity(color, alpha) : "transparent";
}
