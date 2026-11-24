"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SMARTART_PICTURE_PLACEHOLDER_STROKE } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import { spreadsheetEquationBoxLatex } from "../../../../lib/spreadsheet/equation-box";

import { officeChartColorWithOpacity } from "@mrnote/core/web/lib/office-chart-shape-paint.ts";
import { spreadsheetFontStack } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { officeShapeTextFontCss } from "@mrnote/core/web/lib/office-shape-text-font.ts";
import { createElement, useId, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { spreadsheetShapeDrawingPreset, spreadsheetShapePreviewKind } from "../../../../lib/spreadsheet/shape-preset";
import { spreadsheetShapeEditPath, spreadsheetShapeGeometryInset } from "../../../../lib/spreadsheet/shape-edit-points";
import { InkEffectSvgGradient, InkEffectSvgPaths } from "@mrnote/core/web/components/office-ribbon/InkEffectStroke.tsx";
import { inkEffectSvgPlan } from "@mrnote/core/web/lib/office-ink-effects.ts";
import { documentInkEffectPaint, documentInkPencilFilter, documentInkPencilSeed, inkStrokeEndPaint, inkStrokeTipsAlongPathData, inkStrokeTipsPathData, type DocumentInkFilter } from "@mrnote/core/web/lib/document-ink.ts";
import { PresentationNativeShapeGraphic } from "@mrnote/slides/web/components/notebook/contents/presentation/PresentationNativeShapeGraphic.tsx";
import { MAX_NATIVE_SMARTART_TEXT_LENGTH, spreadsheetNativeSmartArtMemberGeometry, spreadsheetNativeSmartArtShapeKey, type NativeSmartArtMember, type SpreadsheetNativeSmartArtShapeTransform } from "../../../../lib/spreadsheet/native-smartart";
import { smartArtBevelOutline, smartArtContourStroke, smartArtShape3dFilter } from "@mrnote/core/web/lib/office-smartart/canvas-3d.ts";
import { OfficeSmartArtBevelFilter, officeSmartArtBevelFilterRef, officeSmartArtNeedsShapeFilter } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtBevelFilter.tsx";
import { handleOfficeShapeTextKey, OfficeShapeTextField, type OfficeShapeTextFieldElement } from "@mrnote/core/web/components/office-ribbon/OfficeShapeTextField.tsx";
import { smartArtGradientCanvasCompanions } from "@mrnote/core/web/lib/office-smartart/styles-model.ts";
import type { SmartArtTextBox } from "@mrnote/core/web/lib/office-smartart/text-box.ts";
import { SMARTART_LABEL_WRAP_SLACK, spreadsheetShapeTextInset } from "../../../../lib/spreadsheet/shape-text-inset";
import { officeShadowCss } from "@mrnote/core/web/lib/office-shape-paint.ts";
import { POWERPOINT_SHADOW_BLUR_DEVIATION } from "@mrnote/core/web/lib/office-shadow-effects.ts";
import { isSpreadsheetCustomShapeStyle, spreadsheetShapeHasPictureFill, parseSpreadsheetInkPoints, parseSpreadsheetInkPressure, MIN_SHAPE_TEXT_SIZE, MAX_SHAPE_TEXT_SIZE, type SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { fitOfficeInlineTextEditor, officeInlineTextCaretFromPoint, officeInlineTextEditorCenteredStyle, officeInlineTextEditorStyle } from "@mrnote/core/web/lib/office-inline-text-editor.ts";
import { officeShapePreviewBleedFrame } from "@mrnote/core/web/lib/office-shape-catalog.ts";
import { SpreadsheetShapeTextBody, spreadsheetShapeTextPaintCss, spreadsheetShapeTextPlacement } from "./SpreadsheetShapeTextBody";
import { SpreadsheetEquationDrawing } from "./SpreadsheetEquationDrawing";
import {
  inkCornerDegreesForTool,
  inkPressuresVary,
  inkStrokePathData,
  inkStrokePathDataOfList,
  inkVariableWidthOutlinePathData,
} from "@mrnote/core/web/lib/office-ink-smooth.ts";
import { DEFAULT_SHAPE_OPACITY } from "@mrnote/core/web/lib/presentation-shapes.ts";
import { OfficeShapeEffectsFrame } from "@mrnote/core/web/components/office-ribbon/OfficeShapeEffectsFrame.tsx";
import { officeEffectsUnderGroupCamera, officeShapeEffectsPaint, officeShapeSilhouetteAlpha, officeShapeTextTurn, officeSketchSeed } from "@mrnote/core/web/lib/office-shape-effects-paint.ts";
import { officeOutlineDashPaint } from "@mrnote/core/web/lib/office-stroke-dash.ts";
import { OfficePictureStyleGraphic } from "@mrnote/core/web/components/office-ribbon/OfficePictureStyleGraphic.tsx";
import { smartArtSlotPictureBox, type SmartArtSlotPictureFormat } from "@mrnote/core/web/lib/office-smartart/slot-picture-format.ts";
import { PresentationShapePreview } from "./SpreadsheetLazyGraphics";


/**
 * Render a drawing-shape object's body as a box-filling SVG. preserveAspectRatio
 * "none" lets the figure stretch to the object's anchor size; non-scaling-stroke
 * keeps the outline a uniform px width regardless of that stretch. An optional
 * text label is an HTML overlay (centered) rather than SVG text, so it stays
 * upright + un-stretched.
 */
/** The character formatting a preserved diagram label's first run carries. */
function spreadsheetNativeSmartArtFirstRunStyle(
  textStyle: unknown,
): { color?: string; bold?: boolean } | null {
  if (!textStyle || typeof textStyle !== "object") return null;
  const paragraphs = (textStyle as { paragraphs?: unknown }).paragraphs;
  if (!Array.isArray(paragraphs)) return null;
  for (const paragraph of paragraphs) {
    const runs = (paragraph as { runs?: unknown } | null)?.runs;
    if (!Array.isArray(runs)) continue;
    for (const run of runs) {
      const style = (run as { style?: unknown } | null)?.style;
      if (!style || typeof style !== "object") continue;
      const { color, bold } = style as { color?: unknown; bold?: unknown };
      return {
        ...(typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? { color } : {}),
        ...(bold === true ? { bold: true } : {}),
      };
    }
  }
  return null;
}

/** Is this object's picture the SHAPE'S OWN FILL (`@/lib/spreadsheet/shapes`)? */
export { spreadsheetShapeHasPictureFill };

/**
 * Where a sheet shape's drawn geometry sits inside its element, and the
 * outline Edit Points edits: one answer for the view, the window's Edit
 * Points and the AI's spreadsheet.object.shape_edit_points.
 */
export { spreadsheetShapeEditPath, spreadsheetShapeGeometryInset };

/**
 * Where a sheet shape's LABEL sits inside its element (`lib/spreadsheet/shape-text-inset`,
 * which Convert to Shapes also reads to keep the words where they were drawn).
 */
export { SMARTART_LABEL_WRAP_SLACK, spreadsheetShapeTextInset };

/** The DrawingML preset whose handles this shape wears, or null (a line, a text box, a custom outline). */
export { spreadsheetShapeDrawingPreset };


/**
 * One Draw-tab stroke, painted as Office paints its ink: a round-capped line
 * in the pen's colour, a highlighter translucent, a pencil in Word's pencil
 * texture (the shared filter, which needs uniform CSS pixels, so the stroke
 * is drawn in its box's own pixels), an effect pen in its gradient.
 */
/** The shared pencil texture as a React `<filter>` (camel-cased attributes). */
function SpreadsheetInkPencilFilter({ id, filter }: { id: string; filter: DocumentInkFilter }) {
  const reactAttrs = (attrs: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(attrs).map(([key, value]) => [
        key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        value,
      ]),
    );
  return createElement(
    "filter",
    { id, ...reactAttrs(filter.attrs) },
    filter.primitives.map((primitive, index) =>
      createElement(primitive.tag, { key: index, ...reactAttrs(primitive.attrs) }),
    ),
  );
}

function SpreadsheetInkStroke({
  shape,
  paintId,
  boxWidthPx,
  boxHeightPx,
}: {
  shape: SpreadsheetShapeStyle;
  paintId: string;
  boxWidthPx?: number;
  boxHeightPx?: number;
}) {
  const stroke = shape.stroke === "none" ? "#000000" : shape.stroke;
  const strokeWidth = shape.strokeWidth || 2;
  const opacity = shape.inkOpacity ?? 1;
  const width = boxWidthPx && boxWidthPx > 0 ? boxWidthPx : null;
  const height = boxHeightPx && boxHeightPx > 0 ? boxHeightPx : null;
  const safeId = paintId.replace(/[^a-zA-Z0-9_-]/g, "");
  const effect =
    shape.inkTool === "pen" && shape.inkEffect ? documentInkEffectPaint(shape.inkEffect) : null;
  if (!width || !height) {
    // No box size to draw in: the stroke's own 0..100 box, stretched, its
    // width held on screen. A piece a point eraser left still ends flat at
    // its cuts, line and tips in one group at the ink's opacity; its tips run
    // along the line (`inkStrokeTipsAlongPathData`), as a zero-length cap
    // here is an ellipse in WebKit.
    const cutEnds = shape.inkCutEnds;
    const cutPoints = cutEnds ? parseSpreadsheetInkPoints(shape.inkPoints ?? "") : [];
    const ends = cutEnds ? inkStrokeEndPaint(cutPoints, cutEnds) : null;
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ display: "block" }}>
        {ends ? (
          <g opacity={opacity} data-ink-cut-ends={cutEnds}>
            <path
              d={inkStrokePathDataOfList(shape.inkPoints, null, inkCornerDegreesForTool(shape.inkTool))}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap={ends.linecap}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {ends.tips.length > 0 ? (
              <path
                d={inkStrokeTipsAlongPathData(cutPoints, cutEnds)}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </g>
        ) : (
          <path
            d={inkStrokePathDataOfList(shape.inkPoints, null, inkCornerDegreesForTool(shape.inkTool))}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
          />
        )}
      </svg>
    );
  }
  const stored = parseSpreadsheetInkPoints(shape.inkPoints ?? "");
  // A pressure pen's stroke paints as a filled outline whose width follows
  // the pressure (lib/office-ink-smooth).
  const pressures =
    shape.inkTool !== "highlighter" ? parseSpreadsheetInkPressure(shape.inkPressure, stored.length) : null;
  const pressured = pressures !== null && inkPressuresVary(pressures);
  const points = stored.map((point, index) => ({
    x: (point.x / 100) * width,
    y: (point.y / 100) * height,
    ...(pressured && pressures ? { p: pressures[index] } : {}),
  }));
  const ends = inkStrokeEndPaint(points, shape.inkCutEnds);
  if (effect) {
    // A pen effect: its layers (halo, gradient, sheen, glints) from the one
    // plan every editor paints (lib/office-ink-effects).
    const plan = inkEffectSvgPlan(
      effect,
      {
        points,
        widthPx: strokeWidth,
        pressured,
        corner: inkCornerDegreesForTool(shape.inkTool),
        flatStart: shape.inkCutEnds === "start" || shape.inkCutEnds === "both",
        flatEnd: shape.inkCutEnds === "end" || shape.inkCutEnds === "both",
        ...(shape.inkCutEnds && !pressured
          ? { linecap: ends.linecap, tipsD: ends.tips.length > 0 ? inkStrokeTipsPathData(ends.tips) : undefined }
          : {}),
        opacity,
      },
      `${safeId}-ink-effect`,
    );
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
        data-ink-tool={shape.inkTool}
        data-ink-effect={effect.id}
      >
        <defs>
          <InkEffectSvgGradient plan={plan} />
        </defs>
        <InkEffectSvgPaths plan={plan} baseProps={pressured ? { "data-ink-pressure": "true" } : undefined} />
      </svg>
    );
  }
  const pencil =
    shape.inkTool === "pencil"
      ? documentInkPencilFilter(
          strokeWidth,
          { x: -strokeWidth, y: -strokeWidth, width: width + 2 * strokeWidth, height: height + 2 * strokeWidth },
          documentInkPencilSeed(shape.inkPoints ?? ""),
        )
      : null;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", overflow: "visible" }}
      data-ink-tool={shape.inkTool}
    >
      {pencil ? (
        <defs>
          <SpreadsheetInkPencilFilter id={`${safeId}-ink-pencil`} filter={pencil} />
        </defs>
      ) : null}
      {/* A piece a point eraser left ends flat where it was cut, its line
          and the pen's round tips in one group at the ink's opacity
          (the shared `inkStrokeEndPaint`). */}
      <g filter={pencil ? `url(#${safeId}-ink-pencil)` : undefined} opacity={opacity}>
        {/* The stroke as the pen drew it: one curve through its samples
            (lib/office-ink-smooth), not the polyline between them; a
            pressure pen's stroke as a filled outline of varying width. */}
        {pressured ? (
          <path
            data-ink-pressure="true"
            d={inkVariableWidthOutlinePathData(points, strokeWidth, {
              corner: inkCornerDegreesForTool(shape.inkTool),
              flatStart: shape.inkCutEnds === "start" || shape.inkCutEnds === "both",
              flatEnd: shape.inkCutEnds === "end" || shape.inkCutEnds === "both",
            })}
            fill={stroke}
            stroke="none"
          />
        ) : (
          <>
            <path
              d={inkStrokePathData(points, { corner: inkCornerDegreesForTool(shape.inkTool) })}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap={ends.linecap}
              strokeLinejoin="round"
            />
            {ends.tips.length > 0 ? (
              <path
                d={inkStrokeTipsPathData(ends.tips)}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            ) : null}
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * The CSS clip of a SmartArt picture slot's picture: the slot's geometry.
 * Office's layouts put pictures in four presets only (`blipPhldr` on rect,
 * ellipse, roundRect and hexagon across every definition); a rectangle needs
 * no clip.
 */
function smartArtSlotPictureClip(
  kind: string | undefined,
  adjustments: Readonly<Record<string, number>> | undefined,
  width: number | undefined,
  height: number | undefined,
): string | undefined {
  if (kind === "ellipse") return "ellipse(50% 50% at 50% 50%)";
  if (!(width && width > 0 && height && height > 0)) return undefined;
  const short = Math.min(width, height);
  if (kind === "rounded-rectangle") {
    const adj = Math.min(50_000, Math.max(0, adjustments?.adj ?? 16_667));
    return `inset(0 round ${Math.round((short * adj) / 100_000 * 100) / 100}px)`;
  }
  if (kind === "hexagon") {
    // ECMA-376 `hexagon`: x1 = ss * a / 100000, a pinned to w/ss / 2.
    const most = (50_000 * width) / short;
    const x1 = (short * Math.min(most, Math.max(0, adjustments?.adj ?? 25_000))) / 100_000;
    const r = Math.round((width - x1) * 100) / 100;
    const l = Math.round(x1 * 100) / 100;
    return `polygon(${l}px 0, ${r}px 0, ${width}px 50%, ${r}px 100%, ${l}px 100%, 0 50%)`;
  }
  return undefined;
}

export function SpreadsheetShapeView({
  shape,
  flipH = false,
  flipV = false,
  pictureFill = false,
  slotPictureStretched = false,
  slotPictureFormat,
  rotation,
  boxWidthPx,
  boxHeightPx,
  editingText = false,
  editingEquation = false,
  smartArtTextBox = null,
  geometryHit = false,
  effects,
  keepTextFlat = false,
  sketchedNative = false,
  emptyTextPrompt = null,
  smartArtFaceSpan = null,
}: {
  shape: SpreadsheetShapeStyle;
  /**
   * A SmartArt member's place down its diagram (0 top .. 1 bottom): Metallic
   * lights a face by its height in the whole graphic, as the slide does.
   */
  smartArtFaceSpan?: { readonly top: number; readonly bottom: number; readonly left?: number; readonly right?: number } | null;
  /**
   * The object's Office effects (`object.shapeEffects`), drawn on the
   * shape's own outline by the painter the slide and Docs use.
   */
  effects?: unknown;
  /** Format Shape > 3-D Rotation > Keep text flat (`object.keepTextFlat`):
   * the words stay flat instead of turning with the shape's 3-D rotation. */
  keepTextFlat?: boolean;
  /** The object's geometry is a sketch the file already drew
   * (`source.nativeSketchGeometry` "baked"): it is not sketched again. */
  sketchedNative?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  /** The label is being typed in place: the editor draws the words, not the body. */
  editingText?: boolean;
  /** The equation is open in place: the draft draws it, not the preview. */
  editingEquation?: boolean;
  /** `shape.src` is this shape's own `a:blipFill`, not a SmartArt slot's picture. */
  pictureFill?: boolean;
  /**
   * A slot picture read from an Office file: its point's `a:stretch` (no
   * `a:srcRect`) stretches it over the slot, as Excel draws and prints it
   * (O17 Sheet6). A picture put in a slot on the page keeps covering it.
   */
  slotPictureStretched?: boolean;
  /**
   * Picture Format on the slot's picture (Crop's source rectangle, a Picture
   * Style), from the object's `smartArtPicture…` fields
   * (`lib/office-smartart/slot-picture-format`).
   */
  slotPictureFormat?: SmartArtSlotPictureFormat | null;
  /** The object's clockwise rotation in degrees: a picture fill that does
   * not Rotate with shape is drawn upright against it. */
  rotation?: number;
  /**
   * The drawing's anchored box. Excel re-evaluates a preset at the box it is
   * drawn in, so the shape stretches with the anchor instead of staying square;
   * passing the box is what lets the shared preset preview do the same
   * (SHAPE-IMPORT-AUDIT.md §2.9). Absent, it keeps the square sample.
   */
  boxWidthPx?: number;
  boxHeightPx?: number;
  /**
   * The SmartArt member's own text box (`object.smartArtTextBox`, read with
   * `readSmartArtTextBox`): where its words sit, when not the box's middle.
   */
  smartArtTextBox?: SmartArtTextBox | null;
  /**
   * The host hit-tests this shape by its geometry
   * (`officeDrawingSelectionStyles.geometryHit`, a SmartArt shape): its words
   * are marked to take presses as words.
   */
  geometryHit?: boolean;
  /**
   * The prompt an EMPTY SmartArt shape shows (Office's `[Text]`), drawn by the
   * sheet only: the point stays empty in the workbook and in the file.
   */
  emptyTextPrompt?: string | null;
}) {
  const textBox = shape.kind === "text-box";
  // Do not rotate text: the words are laid out level, in the box the shape
  // covers once turned (its sides exchanged past a quarter turn).
  const upright = (() => {
    // Text direction Rotate all text 90 / 270 (`a:bodyPr@vert`): the words
    // are laid out level in the box turned a quarter and turned with it,
    // reading down (90) or up (270) the shape (S10_tdf141644, X-134).
    const vertical = shape.textLayout?.bodyPr?.vert;
    if ((vertical === "vert" || vertical === "vert270") && boxWidthPx && boxHeightPx) {
      return { degrees: vertical === "vert" ? -90 : 90, width: boxHeightPx, height: boxWidthPx };
    }
    const degrees = typeof rotation === "number" && Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0;
    if ((shape.textLayout?.bodyPr?.upright !== true && shape.textUpright !== true) || degrees === 0 || !boxWidthPx || !boxHeightPx) return null;
    const turned = (degrees >= 45 && degrees < 135) || (degrees >= 225 && degrees < 315);
    return turned
      ? { degrees, width: boxHeightPx, height: boxWidthPx }
      : { degrees, width: boxWidthPx, height: boxHeightPx };
  })();
  // An equation box (one display equation run, or a page's older
  // `shape.equation`): drawn as its equation.
  const equationBoxLatex = spreadsheetEquationBoxLatex(shape);
  const transform =
    [flipH ? "scaleX(-1)" : "", flipV ? "scaleY(-1)" : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  // SmartArt quick-style paint the sheet shape layer has no other home for. A
  // 3-D CONTOUR is the outline of the solid, so it becomes a real stroke — but
  // only when the style itself draws no line, so an authored outline is never
  // overwritten. Bevel and extrusion are a `filter` chain: a `drop-shadow`
  // follows the shape's real alpha, so the rim and the extruded face track the
  // silhouette rather than a bounding box. Approximate, by §5.
  // A quick style's `fillGradient.angle` is in DRAWINGML degrees (90 = the
  // top→bottom ramp §2 gives every gradient style), while the sheet's own
  // Format-Shape gradients — and the preview's `gradientVector` — speak CSS
  // degrees. The style marker is what says which vocabulary this gradient is
  // in, and the shared helper does the conversion, so the slide and the sheet
  // aim one diagram's ramp the same way.
  const fillGradient =
    shape.fillGradient && shape.smartArtStyle
      ? {
          ...shape.fillGradient,
          angle: smartArtGradientCanvasCompanions(shape.fillGradient)
            .gradientAngle,
        }
      : shape.fillGradient;
  // A diagram member's 3-D is its quick style's paint and the page OWNS it; an
  // ordinary shape's is the source package's and the page only DISPLAYS it
  // (`nativeShape3d`, §44.4). One renderer draws both, so an Excel bevel and a
  // SmartArt bevel are the same picture rather than two approximations.
  // A shape whose own effects state its 3-D (a bevel, the 3-D Format or a
  // 3-D Rotation the server now reads into `shapeEffects`) is drawn by the
  // effects painter: the display-only reading would draw it twice.
  // A member of a group with a camera (`nativeGroupScene3d`) is the other
  // way round, as on a slide: its solid is swept under the GROUP's camera by
  // the diagram renderer, and the effects keep only what is not 3-D.
  const groupCamera = shape.nativeGroupScene3d;
  const native3d =
    !groupCamera &&
    (["bevel", "format3d", "rotation3d"] as const).some((kind) => {
      const value = (effects as Record<string, unknown> | null | undefined)?.[kind];
      return value !== undefined && value !== "none";
    })
      ? undefined
      : shape.nativeShape3d;
  const paintedEffects = officeEffectsUnderGroupCamera(
    groupCamera && native3d && effects && typeof effects === "object"
      ? { ...(effects as Record<string, unknown>), bevel: "none", format3d: "none" }
      : effects,
    groupCamera,
  );
  const drawn3d = shape.shape3d ?? native3d?.shape3d;
  // A member of a group with a camera is seen through the GROUP's camera
  // (Office states it on the group and on no member).
  const drawnScene3d = shape.shape3d ? shape.scene3d : (shape.nativeGroupScene3d ?? native3d?.scene3d);
  const contour = drawn3d ? smartArtContourStroke(drawn3d) : null;
  const smartArtOutline =
    contour && (!shape.stroke || shape.stroke === "none") ? contour : null;
  // The bevel is an INNER rim, which only an SVG filter can draw (a drop shadow
  // lands outside the silhouette): the one component the slide canvas uses. A
  // solid with a bevel and a front camera has no swept body at all, so without
  // this it drew flat -- six of six in corpus S054, seen in a real browser.
  const rimId = useId();
  const bevelRimId =
    drawn3d && officeSmartArtNeedsShapeFilter(drawn3d, drawnScene3d)
      ? `spreadsheet-shape-rim-${rimId.replace(/[^A-Za-z0-9_-]/g, "")}`
      : null;
  const smartArtFilter =
    [
      // The rim first, on the face itself; the shadows then sweep the result.
      bevelRimId ? officeSmartArtBevelFilterRef(bevelRimId) : "",
      shape.shapeShadow ? `drop-shadow(${officeShadowCss(shape.shapeShadow)})` : "",
      drawn3d
        ? smartArtShape3dFilter(drawn3d, shape.fill, drawnScene3d) ?? ""
        : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  // Office's effects on the shape's own outline (shadow, glow, soft edges,
  // bevel, reflection, 3-D rotation), the slide's painter and frame. A
  // Perspective shadow's silhouette is the drawing itself, darkened.
  const outlineDash = smartArtOutline
    ? null
    : officeOutlineDashPaint(shape.outlineDash, shape.outlineCap, Math.max(1, shape.strokeWidth));
  const effectsPaint = officeShapeEffectsPaint(
    paintedEffects,
    { width: boxWidthPx ?? 100, height: boxHeightPx ?? 100 },
    // Shape Outline > Sketched; a shape Excel already sketched carries the
    // drawn path as its own geometry.
    {
      sketch: sketchedNative ? undefined : shape.outlineSketch,
      seed: officeSketchSeed(rimId),
      // The drawing's flips wrap the effects frame (`transform` above): its
      // 3-D turn is taken through them, as PowerPoint and Excel flip a shape
      // in its plane before they turn it (`flippedCameraTurn`). The words are
      // drawn outside the flips and take the turn as it is.
      frame: { rotation: typeof rotation === "number" ? rotation : 0, flipH, flipV },
      // A scaled shadow (Offset: Center's 102 %, a Perspective one) is the
      // shape's silhouette scaled about its alignment point, blurred as
      // Excel's PDF draws it (probe xlsx-shscale: 0.347 of `blurRad`, the
      // deviation PowerPoint's was measured at). An unscaled one keeps its
      // drop shadow (its blur against Excel's truth: TRIAGE 100b).
      scaledShadowSilhouette: { blurDeviation: POWERPOINT_SHADOW_BLUR_DEVIATION },
    },
  );
  const effectsId = `spreadsheet-shape-effects-${rimId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  // Format Shape > 3-D Rotation: the words lie on the shape's front and turn
  // with it unless Keep text flat is checked (typed into, the editor lays
  // them flat), on a layer of the shape's box turned about its centre as the
  // effects frame is.
  const textTurn = officeShapeTextTurn(
    officeEffectsUnderGroupCamera(effects, groupCamera),
    { width: boxWidthPx ?? 100, height: boxHeightPx ?? 100 },
    { keepTextFlat, editing: editingText },
  );
  const turnWords = (words: ReactNode) =>
    textTurn ? (
      <div
        data-spreadsheet-shape-text-turn=""
        style={{ position: "absolute", inset: 0, pointerEvents: "none", ...textTurn }}
      >
        {words}
      </div>
    ) : (
      words
    );
  const withShapeEffects = (drawn: ReactNode) =>
    effectsPaint ? (
      <OfficeShapeEffectsFrame
        paint={effectsPaint}
        filterId={effectsId}
        silhouette={
          <span
            style={{
              display: "block",
              position: "absolute",
              inset: 0,
              filter: "brightness(0)",
              opacity: officeShapeSilhouetteAlpha(effectsPaint),
            }}
          >
            {drawn}
          </span>
        }
      >
        {drawn}
      </OfficeShapeEffectsFrame>
    ) : (
      drawn
    );
  return (
    <div
      // The object's own caption rule (`.spreadsheet-window__image-object span`)
      // is a one-line ellipsised 12px/700 caption and it reached EVERY span
      // inside the object, this shape's words included. This class is what the
      // stylesheet excludes (§44.2).
      className="spreadsheet-window__shape-view"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        // The shared shape model's transparency percentage, on the whole
        // figure exactly as a slide applies it (`resolveShapeStyle`).
        ...(typeof shape.opacity === "number" &&
        shape.opacity < DEFAULT_SHAPE_OPACITY
          ? { opacity: shape.opacity / 100 }
          : {}),
      }}
    >
      {bevelRimId && drawn3d ? (
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <defs>
            <OfficeSmartArtBevelFilter
              id={bevelRimId}
              shape3d={drawn3d}
              scene3d={drawnScene3d}
              faceSpan={smartArtFaceSpan}
              outline={smartArtBevelOutline(shape.kind, { rotation, flipH, flipV })}
            />
          </defs>
        </svg>
      ) : null}
      <span
        aria-hidden="true"
        style={{
          display: "block",
          position: "absolute",
          inset: 0,
          transform,
          transformOrigin: "center",
          filter: smartArtFilter,
        }}
      >
        {withShapeEffects(shape.kind === "ink" ? (
          <SpreadsheetInkStroke
            shape={shape}
            paintId={rimId}
            boxWidthPx={boxWidthPx}
            boxHeightPx={boxHeightPx}
          />
        ) : (
          // The preview's view box bleeds past the geometry; the `<svg>` is
          // sized out by that bleed so the shape itself fills the anchored
          // box, the way Excel draws it (a custom outline has no bleed).
          <span
            aria-hidden="true"
            data-spreadsheet-shape-geometry=""
            style={
              shape.customPath || isSpreadsheetCustomShapeStyle(shape)
                ? { display: "block", position: "absolute", inset: 0 }
                : (() => {
                    const frame = officeShapePreviewBleedFrame(spreadsheetShapePreviewKind(shape.kind));
                    return {
                      display: "block",
                      position: "absolute",
                      left: `${frame.left * 100}%`,
                      top: `${frame.top * 100}%`,
                      width: `${frame.width * 100}%`,
                      height: `${frame.height * 100}%`,
                    };
                  })()
            }
          >
          <PresentationShapePreview
            kind={spreadsheetShapePreviewKind(shape.kind)}
            boxWidthPx={boxWidthPx}
            boxHeightPx={boxHeightPx}
            points={
              isSpreadsheetCustomShapeStyle(shape)
                ? shape.customPoints
                : undefined
            }
            customPath={shape.customPath}
            adjustments={shape.adjustments}
            // The shape's own `a:ln` decorations, so an imported `stealth`
            // arrowhead draws as one instead of as a triangle (§7.4).
            headEnd={shape.headEnd}
            tailEnd={shape.tailEnd}
            lineEndsAtLineWeight
            headEndWidth={shape.headEndWidth}
            headEndLength={shape.headEndLength}
            tailEndWidth={shape.tailEndWidth}
            tailEndLength={shape.tailEndLength}
            // A solid fill's and line's Transparency draw as their colours'
            // alpha; a pattern and a gradient line through their own paint.
            fill={
              shape.fillTransparency && shape.fill !== "none" && !fillGradient && !shape.fillPattern
                ? officeChartColorWithOpacity(shape.fill, (100 - shape.fillTransparency) / 100)
                : shape.fill
            }
            fillGradient={fillGradient}
            fillPattern={pictureFill ? undefined : shape.fillPattern}
            fillImage={pictureFill ? shape.src : undefined}
            fillImageOptions={pictureFill ? shape.fillPictureOptions : undefined}
            fillImageRotation={rotation}
            stroke={
              smartArtOutline?.stroke ??
              (shape.outlineTransparency && shape.stroke !== "none" && !shape.outlineGradient
                ? officeChartColorWithOpacity(shape.stroke, (100 - shape.outlineTransparency) / 100)
                : shape.stroke)
            }
            strokeGradient={smartArtOutline || shape.stroke === "none" ? undefined : shape.outlineGradient}
            strokeWidth={smartArtOutline?.strokeWidth ?? shape.strokeWidth}
            // Shape Outline > Dashes: the line's exact dash and cap.
            dashArray={outlineDash?.dashArray}
            dashCap={outlineDash?.linecap}
            // Format Shape > Line: compound type and join.
            compound={smartArtOutline ? undefined : shape.outlineCompound}
            join={
              shape.outlineJoin
                ? {
                    join: shape.outlineJoin,
                    miterLimit: shape.outlineJoin === "miter" ? (shape.outlineMiterLimit ?? 800_000) / 100_000 : undefined,
                  }
                : undefined
            }
            // `a:ln@algn`. A quick-style outline replaces the shape's own
            // paint, so it replaces the alignment with it: the style states a
            // centred pen and nothing inherits the package's inset one.
            strokeAlign={smartArtOutline ? undefined : shape.strokeAlign}
            className="h-full w-full"
          />
          </span>
        ))}
      </span>
      {shape.src && !pictureFill && slotPictureFormat?.style && boxWidthPx && boxHeightPx ? (
        // A slot picture with a Picture Style: the shared style graphic draws
        // the picture (cropped) in the style's frame, shadow and 3-D, as the
        // sheet draws a styled picture object.
        <span
          aria-hidden="true"
          data-spreadsheet-shape-picture="styled"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <OfficePictureStyleGraphic
            styleId={slotPictureFormat.style}
            src={shape.src}
            widthPx={boxWidthPx}
            heightPx={boxHeightPx}
            cropRect={slotPictureFormat.crop ?? null}
          />
        </span>
      ) : shape.src && !pictureFill && slotPictureFormat?.crop ? (
        // A cropped slot picture: the kept part of the source stretched over
        // the slot (`a:srcRect` with `a:stretch`), inside the slot's outline.
        <span
          aria-hidden="true"
          data-spreadsheet-shape-picture="cropped"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            clipPath: smartArtSlotPictureClip(shape.kind, shape.adjustments, boxWidthPx, boxHeightPx),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shape.src}
            alt=""
            draggable={false}
            style={(() => {
              const box = smartArtSlotPictureBox(slotPictureFormat.crop)!;
              return {
                position: "absolute",
                left: `${box.left}%`,
                top: `${box.top}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
                maxWidth: "none",
                objectFit: "fill",
              };
            })()}
          />
        </span>
      ) : shape.src && !pictureFill ? (
        // A SmartArt PICTURE SLOT holding its picture. The member stays the
        // shape the layout laid out — the preset above still draws the slot's
        // own outline — and the picture covers it exactly as Office draws a
        // picture point's `a:blipFill`: cropped to the slot rather than
        // letterboxed inside it. Inside `SpreadsheetShapeView` on purpose, so
        // the grid's object layer and Page Layout draw it from one place
        // instead of one of them drawing a filled slot and the other an empty
        // box.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shape.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-spreadsheet-shape-picture="filled"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: slotPictureStretched ? "fill" : "cover",
            pointerEvents: "none",
            // …and only inside the slot's own outline: a circle's picture is
            // round (Continuous Picture List), as Office's blipFill paints
            // the geometry, not the box.
            clipPath: smartArtSlotPictureClip(shape.kind, shape.adjustments, boxWidthPx, boxHeightPx),
          }}
        />
      ) : null}
      {shape.src && !pictureFill && shape.stroke && shape.stroke !== "none" && (shape.strokeWidth ?? 0) > 0 &&
      // (Not the empty slot's neutral line a picture put in on the page still wears.)
      shape.stroke !== SMARTART_PICTURE_PLACEHOLDER_STROKE &&
      (shape.kind === "ellipse" || shape.kind === "rectangle" || shape.kind === "rounded-rectangle") ? (
        // The slot's line is drawn OVER its picture, as Office draws a
        // picture point's outline (the white ring round O17's pictures).
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            boxSizing: "border-box",
            border: `${shape.strokeWidth}px solid ${shape.stroke}`,
            borderRadius:
              shape.kind === "ellipse"
                ? "50%"
                : shape.kind === "rounded-rectangle" && boxWidthPx && boxHeightPx
                  ? `${(Math.min(boxWidthPx, boxHeightPx) * Math.min(50_000, Math.max(0, shape.adjustments?.adj ?? 16_667))) / 100_000}px`
                  : 0,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {/* The label and the LAYOUT the package states for it — numbering,
          `a:pPr` margins and the `a:bodyPr` frame — drawn by the shared text
          body (SHAPE-IMPORT-AUDIT.md §44). The inset table is asked here and
          by the preview itself, so the two cannot drift apart. */}
      {editingText ? (
        // The words are typed in the editor laid over the shape; Office draws
        // no box of their own (the selection outline turns dashed instead).
        null
      ) : equationBoxLatex !== null && editingEquation ? null : equationBoxLatex !== null ? (
        // XLS-A016: an equation box draws its equation with the renderer
        // Docs and the deck draw theirs with, at the box's text size.
        equationBoxLatex.trim() ? (
          <SpreadsheetEquationDrawing latex={equationBoxLatex} shape={shape} />
        ) : (
          <span
            data-spreadsheet-shape-equation=""
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              color: "#6b7280",
              fontStyle: "italic",
            }}
          >
            {"…"}
          </span>
        )
      ) : (
        emptyTextPrompt && !shape.text ? (
          // An empty SmartArt shape's `[Text]` prompt: the editor's, never the
          // workbook's (not printed, not exported), as in Excel.
          <span data-spreadsheet-shape-text-prompt="" style={{ opacity: 0.6 }}>
            <SpreadsheetShapeTextBody
              shape={{ ...shape, text: emptyTextPrompt, textRuns: undefined }}
              textBox={textBox}
              inset={spreadsheetShapeTextInset(shape, boxWidthPx, boxHeightPx, smartArtTextBox)}
              hitText={geometryHit}
              framed={!!smartArtTextBox}
            />
          </span>
        ) : upright ? (
          // Do not rotate text (`a:bodyPr@upright`): the words stay level in
          // the box the turned shape covers (S26_tdf137000_export_upright).
          turnWords(<div
            data-spreadsheet-shape-text-upright=""
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: upright.width,
              height: upright.height,
              transform: `translate(-50%, -50%) rotate(${-upright.degrees}deg)`,
              pointerEvents: "none",
            }}
          >
            <SpreadsheetShapeTextBody
              shape={shape}
              textBox={textBox}
              inset={spreadsheetShapeTextInset(shape, upright.width, upright.height, smartArtTextBox)}
              hitText={geometryHit}
              framed={!!smartArtTextBox}
            />
          </div>)
        ) : (
          turnWords(
            <SpreadsheetShapeTextBody
              shape={shape}
              textBox={textBox}
              inset={spreadsheetShapeTextInset(shape, boxWidthPx, boxHeightPx, smartArtTextBox)}
              hitText={geometryHit}
              framed={!!smartArtTextBox}
            />,
          )
        )
      )}
    </div>
  );
}

/**
 * The in-shape editor's own metrics: the label's size, weight, colour and
 * WordArt paint, in the shape's text inset -- the same values the text body
 * draws with, so typing does not move the words.
 */
export function spreadsheetShapeInlineEditorStyle(
  shape: SpreadsheetShapeStyle,
  size?: { readonly width: number; readonly height: number },
  /** A SmartArt member's own text box: the words are typed where they sit. */
  smartArtTextBox?: SmartArtTextBox | null,
): CSSProperties {
  const inset = spreadsheetShapeTextInset(shape, size?.width, size?.height, smartArtTextBox);
  // An Excel text box draws top-left; every other shape centres its label
  // (the same rule `SpreadsheetShapeTextBody` draws with).
  const textBox = shape.kind === "text-box";
  const placement = spreadsheetShapeTextPlacement(shape, textBox);
  return officeInlineTextEditorStyle({
    left: `${inset.left * 100}%`,
    top: `${inset.top * 100}%`,
    right: `${inset.right * 100}%`,
    bottom: `${inset.bottom * 100}%`,
    width: "auto",
    height: "auto",
    inset: undefined,
    fontSize: Math.min(MAX_SHAPE_TEXT_SIZE, Math.max(MIN_SHAPE_TEXT_SIZE, shape.textSize ?? 12)),
    // The label's own face, weight, slant and decoration, exactly as the text
    // body draws them, so the words do not change font when editing starts.
    ...officeShapeTextFontCss(shape, {
      familyStack: (family) => spreadsheetFontStack(family),
      boldByDefault: Boolean(shape.textArt),
    }),
    color: shape.textColor ?? "#000000",
    // Where the label sits at rest (its Home alignment, the file's paragraph
    // alignment and vertical anchor), so starting to edit does not move it.
    textAlign: placement.align,
    // The frame's insets, wrap, line box and WordArt look, as the body draws
    // them: a file's own insets were typed at the default's 9.6px, the lines
    // closed up from 1.5 to 1.25, and outlined / gradient WordArt was typed
    // as plain filled letters.
    ...spreadsheetShapeTextPaintCss(shape, !!smartArtTextBox),
    // The caret keeps the label's colour even where WordArt paint clears the fill.
    caretColor: shape.textColor ?? "#000000",
    ...(placement.anchor === "middle"
      ? officeInlineTextEditorCenteredStyle(inset.top, inset.bottom)
      : placement.anchor === "bottom"
        ? { top: "auto", height: "auto", maxHeight: `${(1 - inset.top - inset.bottom) * 100}%` }
        : {}),
    // The editor takes the pointer whatever its host does: a SmartArt shape's
    // host is hit by its geometry and passes `pointer-events: none` down
    // (`officeDrawingSelectionStyles.geometryHit`), which would leave the
    // open editor unclickable.
    pointerEvents: "auto",
  });
}

/**
 * The box a no-wrap, Resize-shape-to-fit-text shape needs for the words open
 * in `field` (its in-shape editor, laid out with
 * `spreadsheetShapeInlineEditorStyle`), in layout px: the field's own size
 * when nothing bounds it -- its longest line by its lines, its body insets
 * (the field's padding) included -- over the share of the box the shape's
 * text rectangle takes. Null when nothing is laid out.
 */
export function spreadsheetShapeTextFitSize(
  field: HTMLElement,
  shape: SpreadsheetShapeStyle,
  box: { readonly width: number; readonly height: number },
): { width: number; height: number } | null {
  const style = field.style;
  const saved = {
    width: style.width,
    height: style.height,
    right: style.right,
    bottom: style.bottom,
    maxWidth: style.maxWidth,
    maxHeight: style.maxHeight,
  };
  // Unbounded for one read: no right / bottom edge, as wide as its longest
  // line (the body does not wrap), as tall as its lines.
  Object.assign(style, { width: "max-content", height: "auto", right: "auto", bottom: "auto", maxWidth: "none", maxHeight: "none" });
  const natural = { width: field.offsetWidth, height: field.offsetHeight };
  Object.assign(style, saved);
  if (!(natural.width > 0) || !(natural.height > 0)) return null;
  const inset = spreadsheetShapeTextInset(shape, box.width, box.height);
  const spanX = Math.max(0.05, 1 - inset.left - inset.right);
  const spanY = Math.max(0.05, 1 - inset.top - inset.bottom);
  return { width: Math.ceil(natural.width / spanX), height: Math.ceil(natural.height / spanY) };
}

/** Where a double-click on a sheet shape landed in its drawn words. */
export function spreadsheetShapeCaretFromPoint(event: {
  currentTarget: EventTarget;
  clientX: number;
  clientY: number;
}): number | null {
  const host = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  return officeInlineTextCaretFromPoint(
    host?.querySelector<HTMLElement>("[data-spreadsheet-shape-text-body]") ?? null,
    event.clientX,
    event.clientY,
  );
}

/** The centred editor is as tall as its words, on mount and on every key. */
export function fitSpreadsheetInlineEditor(element: HTMLTextAreaElement | null): void {
  if (element) fitOfficeInlineTextEditor(element);
}

/**
 * Esc in a shape's words: the keyboard goes back to the shape itself, still
 * selected, so its arrows, Delete and Ctrl+Z act on it (Excel); the move of
 * focus blurs the editor, which commits what was typed.
 */
export function focusSpreadsheetShapeAfterTextEdit(editorElement: HTMLElement): void {
  const host = editorElement.closest<HTMLElement>("[data-spreadsheet-object-id]");
  if (host) host.focus({ preventScroll: true });
  else editorElement.blur();
}
/**
 * Draw ONE preserved native SmartArt diagram: the members exactly as the
 * original DiagramML drawing places them, read-only.
 *
 * The frame is the diagram's own EMU box, so every member is positioned in
 * PERCENT of that box and the whole diagram scales with its anchor without any
 * geometry being recomputed — which is the point of "preserve-only": MRAI never
 * becomes a second author of this drawing.
 *
 * Member TEXT is the one editable thing (the xlsx patchback writes it back
 * through the diagram's receipt). A double-click on a text member bound to
 * exactly one data point opens an inline editor for that point.
 */
export function SpreadsheetNativeSmartArtView({
  objectId,
  members,
  widthEmu,
  heightEmu,
  editable,
  editingPointId,
  editingSeed,
  activePointId,
  onSelectPoint,
  selectable = false,
  onTransformShape,
  onBeginEdit,
  onCommitEdit,
  label,
  blockedReason,
}: {
  objectId: string;
  members: readonly NativeSmartArtMember[];
  widthEmu: number;
  heightEmu: number;
  editable: boolean;
  editingPointId: string | null;
  /** The key that opened the box, so it starts with that key, caret after it. */
  editingSeed?: string | null;
  /**
   * The SHAPE the keyboard addresses inside the graphic, drawn selected: the
   * key of its `dsp:sp` (`spreadsheetNativeSmartArtShapeKey`), every member of
   * which moves as one.
   */
  activePointId?: string | null;
  onSelectPoint?: (shapeKey: string) => void;
  /** Shapes may be selected and moved (the sheet is writable). */
  selectable?: boolean;
  /** Commit a pointer move of the active shape, in EMU. */
  onTransformShape?: (
    shapeKey: string,
    transform: SpreadsheetNativeSmartArtShapeTransform,
  ) => void;
  onBeginEdit: (pointId: string) => void;
  onCommitEdit: (pointId: string, text: string) => void;
  label: string;
  /** Why this diagram takes no typing, when it does not. */
  blockedReason: string | null;
}) {
  const percent = (value: number, total: number) =>
    `${Math.max(-1000, Math.min(1000, (value / total) * 100))}%`;
  // A drag of the active shape, previewed in place and committed once on
  // release (Excel: drag a shape inside the graphic to move it on its own).
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const beginShapeDrag = (
    event: ReactPointerEvent<HTMLElement>,
    shapeKey: string,
  ) => {
    if (!selectable || event.button !== 0 || activePointId !== shapeKey) return;
    const frame = event.currentTarget.closest<HTMLElement>(
      `[data-testid="spreadsheet-smartart-object-${objectId}"]`,
    );
    const rect = frame?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const emuPerPxX = widthEmu / rect.width;
    const emuPerPxY = heightEmu / rect.height;
    let moved = { dx: 0, dy: 0 };
    const move = (next: PointerEvent) => {
      moved = {
        dx: (next.clientX - startX) * emuPerPxX,
        dy: (next.clientY - startY) * emuPerPxY,
      };
      setDrag(moved);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (Math.abs(moved.dx) >= 1 || Math.abs(moved.dy) >= 1) {
        onTransformShape?.(shapeKey, { kind: "move", ...moved });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      aria-label={blockedReason ? `${label}: ${blockedReason}` : label}
      data-smartart-text-blocked={blockedReason ? "true" : undefined}
      data-testid={`spreadsheet-smartart-object-${objectId}`}
      role="img"
      title={blockedReason ?? undefined}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {members.map((member, index) => {
        const shapeKey = spreadsheetNativeSmartArtShapeKey(member);
        const active = activePointId === shapeKey;
        const offset = active && drag ? drag : { dx: 0, dy: 0 };
        const box = {
          position: "absolute" as const,
          left: percent(member.left + offset.dx, widthEmu),
          top: percent(member.top + offset.dy, heightEmu),
          width: percent(Math.max(1, member.width), widthEmu),
          height: percent(Math.max(1, member.height), heightEmu),
          transform: member.rotation
            ? `rotate(${member.rotation}deg)`
            : undefined,
        };
        if (member.role === "shape") {
          const fill = member.fill ?? "none";
          const stroke = member.stroke ?? "none";
          const strokeWidth = member.strokeWidth ?? 0;
          const geometry = spreadsheetNativeSmartArtMemberGeometry(member);
          return (
            <div
              key={member.memberId || index}
              style={{
                ...box,
                outline: active
                  ? "2px solid var(--spreadsheet-ribbon-accent, #15803d)"
                  : undefined,
                outlineOffset: active ? 1 : undefined,
                cursor: selectable ? (active ? "move" : "pointer") : undefined,
                // The active member is moved with a pointer drag (beginShapeDrag):
                // a finger or an iPad trackpad press must not become a scroll.
                touchAction: active && selectable ? "none" : undefined,
              }}
              data-testid={`spreadsheet-smartart-shape-${objectId}-${member.memberId || index}`}
              data-smartart-active-point={active ? "true" : undefined}
              onClick={selectable && onSelectPoint ? () => onSelectPoint(shapeKey) : undefined}
              onPointerDown={(event) => beginShapeDrag(event, shapeKey)}
            >
              {member.customPath ? (
                <PresentationNativeShapeGraphic
                  drawing={{
                    geometry: geometry ?? member.customPath,
                    ...(member.lineEnds ? { lineEnds: member.lineEnds } : {}),
                    ...(member.paintOpacity
                      ? { paintOpacity: member.paintOpacity }
                      : {}),
                    ...(member.strokeWidthEmu !== undefined
                      ? {
                          strokeWidthEmu: member.strokeWidthEmu,
                          projectedStrokeWidth: strokeWidth,
                        }
                      : {}),
                  }}
                  id={`${objectId}-${member.memberId || index}`}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  // Office draws an outline's points where they lie, past
                  // the member's box too (a connector, R439-X11).
                  style={{ display: "block", overflow: "visible" }}
                >
                  {null}
                </PresentationNativeShapeGraphic>
              ) : (
                <PresentationShapePreview
                  kind={spreadsheetShapePreviewKind(
                    (member.preset ??
                      "rectangle") as SpreadsheetShapeStyle["kind"],
                  )}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  className="h-full w-full"
                />
              )}
            </div>
          );
        }
        const pointId =
          member.dataPointIds.length === 1 ? member.dataPointIds[0] : null;
        const style = member.textStyle as
          | { fontSize?: number; color?: string; bold?: boolean }
          | undefined;
        // The projection's wire shape keeps character formatting on the label's
        // RUNS (`textStyle.paragraphs[].runs[].style`), not at the top level,
        // so the colour Office gave the label was never read: a white label on
        // a dark node drew in the sheet's own dark ink — seen in the real sheet
        // on the owner's corpus. The first run speaks for the label.
        const firstRunStyle = spreadsheetNativeSmartArtFirstRunStyle(member.textStyle);
        const editing = editable && pointId !== null && editingPointId === pointId;
        return (
          <div
            key={member.memberId || index}
            style={{
              ...box,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              padding: 2,
              textAlign: "center",
              whiteSpace: "pre-wrap",
              fontSize: style?.fontSize ? ptToPx(style.fontSize) : undefined,
              fontWeight: style?.bold ?? firstRunStyle?.bold ? 700 : undefined,
              color: style?.color ?? firstRunStyle?.color,
              cursor: editable && pointId ? "text" : selectable ? "pointer" : undefined,
              outline: active
                ? "2px solid var(--spreadsheet-ribbon-accent, #15803d)"
                : undefined,
              outlineOffset: active ? 1 : undefined,
              touchAction: active && selectable ? "none" : undefined,
            }}
            data-testid={`spreadsheet-smartart-member-${objectId}-${member.memberId || index}`}
            data-smartart-active-point={active ? "true" : undefined}
            onClick={
              (selectable || (editable && pointId)) && onSelectPoint
                ? () => onSelectPoint(shapeKey)
                : undefined
            }
            onPointerDown={(event) => beginShapeDrag(event, shapeKey)}
            onDoubleClick={
              editable && pointId
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onBeginEdit(pointId);
                  }
                : undefined
            }
          >
            {editing ? (
              // Typed IN the shape, as Excel types a diagram's words: the
              // shared shape text box every editor types a SmartArt shape's
              // words in (no box, the label's own size, weight and colour,
              // centred where the label is drawn; one caret and keyboard). A
              // white boxed one-line input stood here: a white label on a
              // dark shape was typed in dark ink on white, and a label's line
              // break was dropped (written back on Enter although nothing
              // was typed).
              <OfficeShapeTextField
                autoFocus
                fit
                ariaLabel={label}
                testId={`spreadsheet-smartart-text-input-${objectId}-${pointId}`}
                maxLength={MAX_NATIVE_SMARTART_TEXT_LENGTH}
                initial={{
                  text: editingSeed ?? member.text ?? "",
                  runs: undefined,
                  inherited: {},
                  style: officeInlineTextEditorStyle({
                    // The label's own 2px inset, and its middle.
                    padding: "0 2px",
                    ...officeInlineTextEditorCenteredStyle(0, 0),
                    pointerEvents: "auto",
                    caretColor: "currentColor",
                  }),
                }}
                onBlur={(event) =>
                  onCommitEdit(pointId!, (event.currentTarget as unknown as OfficeShapeTextFieldElement).value)
                }
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  const field = event.currentTarget;
                  // Enter ends the words; Esc leaves them as typed (Office
                  // keeps a shape's typed text on Esc); either way the
                  // blur writes them and the graphic keeps the keyboard.
                  if (
                    handleOfficeShapeTextKey(event, field as unknown as OfficeShapeTextFieldElement, {
                      commit: () => field.blur(),
                      leave: () => field.blur(),
                    })
                  ) {
                    event.stopPropagation();
                  }
                }}
              />
            ) : (
              (member.text ?? "")
            )}
          </div>
        );
      })}
    </div>
  );
}
