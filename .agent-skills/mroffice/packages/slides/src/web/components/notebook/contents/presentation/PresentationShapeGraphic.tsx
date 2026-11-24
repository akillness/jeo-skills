"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Draws a presentation shape's geometry: fill (solid, gradient, pattern,
 * picture, tiled picture), outline, effects and the preset/custom path, for the
 * editor canvas, thumbnails and the slideshow alike.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { normalizeOfficeShapeGradient, officeGradientAngleForBox, officeGradientDrawnStops, type OfficeShapeGradient } from "@mrnote/core/web/lib/office-shape-paint.ts";
import { officeCirclePathGradient, officeCirclePathGradientSvg, officeRectPathGradient } from "@mrnote/core/web/lib/office-path-gradient.ts";
import {
  isShortSideArrowKind,
  presentationShortSideGeometry,
} from "../../../../lib/presentation-short-side-geometry";
import { presentationDefaultPresetGeometry } from "../../../../lib/presentation-default-preset-geometry";
import { presentationActionButtonGeometry } from "../../../../lib/presentation-action-button-geometry";
import { presentationLineCalloutDrawing } from "../../../../lib/presentation-line-callout";
import { PresentationNativeShapeGraphic } from "./PresentationNativeShapeGraphic";
import { readPreservedSlotPicture } from "@mrnote/core/web/lib/office-smartart/preserved-slot-pictures.ts";
import { SMARTART_PICTURE_PLACEHOLDER_STROKE, smartArtShape3dUnderEffects } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { usePreservedSmartArtSlotFill } from "./usePreservedSmartArtSlotFill";
import { PresentationLineCalloutGraphic } from "./PresentationLineCalloutGraphic";
import { nativeLineEndMarker, readNativeDrawingGeometry, readNativeLineEnd } from "@mrnote/core/web/lib/native-drawing-geometry.ts";
import { loadOfficeImageNaturalSize, type OfficePixelSize } from "@mrnote/core/web/lib/office-picture-fit.ts";
import {
  normalizeOfficeShapeEffectPreset,
  officeShapeEffectFilterCss,
  officeShapeEffectReflectionCss,
} from "@mrnote/core/web/lib/office-shape-effects.ts";
import { normalizeDocumentShapeAdjustments, normalizeInkCutEnds } from "@mrnote/core/web/lib/document-shapes.ts";
import {
  documentInkEffectPaint,
  documentInkPencilFilter,
  documentInkPencilSeed,
  inkStrokeEndPaint,
  inkStrokeTipsPathData,
} from "@mrnote/core/web/lib/document-ink.ts";
import { normalizeDocumentInkEffect, normalizeDocumentInkTool } from "@mrnote/core/web/lib/document-shapes.ts";
import { DocumentInkPencilFilter } from "@mrnote/docs/web/components/console/editor/native-document/DocumentInkPencilFilter.tsx";
import { InkEffectSvgGradient, InkEffectSvgPaths } from "@mrnote/core/web/components/office-ribbon/InkEffectStroke.tsx";
import { inkEffectSvgPlan } from "@mrnote/core/web/lib/office-ink-effects.ts";
import {
  inkCornerDegreesForTool,
  inkPressuresVary,
  inkStrokePathData,
  inkStrokePathDataOfList,
  inkVariableWidthOutlinePathData,
} from "@mrnote/core/web/lib/office-ink-smooth.ts";

import { memo, useEffect, useId, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import {
  presentationAuthoredPresetGeometry,
  presentationConnectorRouteGeometry,
  presentationPresetGeometryForKind,
} from "@mrnote/core/web/lib/presentation-authored-preset-geometry.ts";
import { normalizeHexColor as normalizeOfficeHexColor } from "@mrnote/core/web/lib/office-color-palette.ts";
import {
  loadOfficePictureNaturalSize,
  officePictureFillPattern,
  officePictureNaturalSize,
} from "@mrnote/core/web/lib/office-picture-fill-options.ts";
import {
  HOLLOW_PATH_KINDS,
  boxShapeCss,
  shapeFillImageNeedsPattern,
  gradientVector,
  shapeFillGradientAngle,
  shapeStrokeGradientAngle,
  shapeStrokeGradientStops,
  officeShadowOffset,
  normalizePresentationConnectorSpec,
  normalizePresentationOpenShapeLineEnds,
  presentationOpenShapeEndFields,
  presentationOpenShapeNativeLineEnds,
  presentationShapeTakesLineEnds,
  normalizeShapeKind,
  resolveShapeStyle,
  strokeDashArray,
  strokeDashLinecap,
  type ResolvedShapeStyle,
} from "@mrnote/core/web/lib/presentation-shapes.ts";
import { normalizePresentationCustomPath } from "@mrnote/core/web/lib/presentation-freeform.ts";
import { parsePolygonString } from "@mrnote/core/web/lib/presentation-polygon-points.ts";
import { officeFillPatternTile, type OfficeChartFillPattern } from "@mrnote/core/web/lib/office-chart-shape-paint.ts";
import { readSmartArtBlockMarker } from "@mrnote/core/web/lib/presentation-smartart.ts";
import { smartArtGradientCanvasCompanions } from "@mrnote/core/web/lib/office-smartart/styles-model.ts";
import {
  OfficeSmartArtBevelFilter,
  officeSmartArtBevelFilterRef,
  officeSmartArtGeometrySilhouette,
  officeSmartArtNeedsShapeFilter,
} from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtBevelFilter.tsx";
import { OFFICE_HIT_BOX_ATTRIBUTE, officeHitBandProps, officePaintIsNone } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { LIGHTING_FILTER_LAYER, OfficeShapeEffectsFrame } from "@mrnote/core/web/components/office-ribbon/OfficeShapeEffectsFrame.tsx";
import { normalizeOfficeLineSketch, officeEffectsUnderGroupCamera, officeShapeEffectsPaint, officeShapeSilhouetteAlpha, officeSketchSeed } from "@mrnote/core/web/lib/office-shape-effects-paint.ts";
import { presentationShapeEffects } from "../../../../lib/presentation-shape-effects";
import { smartArtBevelOutline, smartArtContourStroke, smartArtShape3dFilter } from "@mrnote/core/web/lib/office-smartart/canvas-3d.ts";
import { legacyLineSlopeFlipsHorizontally } from "@mrnote/core/web/lib/presentation-connectors.ts";
import {
  blockClaimsNativeGroup,
  geometryNumber,
  hasLayoutGeometry,
} from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import {
  readPresentationNativeThemePaint,
  readPresentationNativeThemeShadow,
} from "@mrnote/core/web/lib/presentation-native-theme-paint.ts";
import type {
  PresentationShapeBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { asRecord } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { officeStrokeDetail } from "@mrnote/core/web/lib/office-stroke-detail.ts";
import { AUTOFIT_EMU_PER_PX } from "../../../../lib/presentation/text-layout-css";

import { documentInkPressures } from "@mrnote/core/web/lib/document-ink.ts";
import { POWERPOINT_SHADOW_BLUR_DEVIATION } from "@mrnote/core/web/lib/office-shadow-effects.ts";

/** Whether the shape's outline is the package's (`nativeStrokeDisposition`
 * preserve-only): one the page cannot read, kept as the file has it. */
function presentationNativeOutlineKeptByPackage(block: { source?: unknown }): boolean {
  return asRecord(block.source)?.nativeStrokeDisposition === "preserve-only";
}
/** A shape's pattern fill as an SVG `<pattern>` tile (Office's preset, the shared classification). */
function PresentationShapePatternTile({ id, pattern }: { id: string; pattern: OfficeChartFillPattern }) {
  const { size, angle, marks, paperInMarks } = officeFillPatternTile(pattern);
  return (
    <pattern
      id={id}
      // Laid on the slide's grid, one bit a CSS pixel at any zoom, by the
      // slide's pattern anchor (lib/office-pattern-anchor), as PowerPoint draws it.
      data-office-pattern=""
      patternUnits="userSpaceOnUse"
      width={size}
      height={size}
      patternTransform={angle ? `rotate(${angle})` : undefined}
    >
      {paperInMarks ? null : <rect x="0" y="0" width={size} height={size} fill={pattern.background} />}
      {marks.map(({ tag, ...attrs }, index) => {
        if (tag === "circle") return <circle key={index} {...attrs} fill={pattern.foreground} />;
        const { opacity, ...rest } = attrs as typeof attrs & { opacity?: number };
        return <rect key={index} {...rest} fill={("fill" in rest && rest.fill) || pattern.foreground} fillOpacity={opacity} />;
      })}
    </pattern>
  );
}

type PresentationShapeGraphicProps = {
  block: PresentationShapeBlock;
  fillOverride?: string;
  strokeOverride?: string;
  suppressFill?: boolean;
  suppressOutline?: boolean;
  /**
   * The shape's reflection is drawn around it by its host, with its words
   * (`presentationShapeReflectionCss`): the graphic does not reflect itself.
   */
  reflectionOutside?: boolean;
  /** A SmartArt member's place in its diagram, for metal's diagram-wide light. */
  smartArtFaceSpan?: { readonly top: number; readonly bottom: number; readonly left?: number; readonly right?: number } | null;
  /**
   * The host hit-tests the shape by its geometry (`.geometryHit`, the edit
   * canvas): a No Fill outline is drawn with its hit band
   * (`officeHitBandProps`). The show, thumbnails and print draw none.
   */
  outlineHitBand?: boolean;
};







export function presentationShapeReflectionCss(block: PresentationShapeBlock): string | null {
  const sketch =
    asRecord(block.source)?.nativeSketchGeometry === "baked"
      ? undefined
      : normalizeOfficeLineSketch(block.outlineSketch);
  const effects = block.shapeEffects ?? (sketch ? presentationShapeEffects(block) : undefined);
  if (effects || sketch) {
    if (!effects?.reflection || effects.reflection === "none") return null;
    const width = (typeof block.width === "number" && Number.isFinite(block.width) ? block.width : 952500) / 9525;
    const height = (typeof block.height === "number" && Number.isFinite(block.height) ? block.height : 952500) / 9525;
    return officeShapeEffectsPaint(effects, { width, height }, { sketch, seed: officeSketchSeed(block.id), shadowBlurDeviation: POWERPOINT_SHADOW_BLUR_DEVIATION })?.reflect || null;
  }
  const preset = normalizeOfficeShapeEffectPreset(block.effect);
  return preset ? officeShapeEffectReflectionCss(preset) || null : null;
}

const SILHOUETTE_LAYER: CSSProperties = { display: "block", position: "absolute", inset: 0 };

/**
 * Shape Format > Shape Effects: the block's preset (`effect`, beside its own
 * `shadow` flag) drawn by the shared screen table (`lib/office-shape-effects`)
 * on a wrapper, so every drawing path below wears it the same way. A shape
 * with no preset renders exactly as before.
 */
/*
 * Memoised: a slide re-renders on every ink stroke, and redrawing each of its
 * shapes (every earlier stroke among them) re-smoothed every path each time.
 * A shape whose block is the same object draws the same.
 */
export const PresentationShapeGraphic = memo(function PresentationShapeGraphic(props: PresentationShapeGraphicProps) {
  const reactId = useId();
  // Shape Outline > Sketched. A shape PowerPoint already sketched carries the
  // drawn path as its own geometry and is not sketched again.
  const sketch =
    asRecord(props.block.source)?.nativeSketchGeometry === "baked"
      ? undefined
      : normalizeOfficeLineSketch(props.block.outlineSketch);
  const stated = props.block.shapeEffects ?? (sketch ? presentationShapeEffects(props.block) : undefined);
  // One 3-D per shape. A SmartArt member's bevel and solid are drawn by the
  // SmartArt renderer from `shape3d` (its rim fitted to PowerPoint's own
  // renders), and the same `sp3d` also reaches the shape's effects: drawn
  // twice, the effects' Format Shape bevel laid a dark band along every
  
  // PowerPoint draws 202). Its shadow, glow, soft edges and reflection stay.
  const effects = officeEffectsUnderGroupCamera(
    stated && props.block.shape3d && typeof stated === "object" && !deckShapeEffectsDraw3d(props.block)
      ? { ...(stated as Record<string, unknown>), bevel: "none", format3d: "none" }
      : stated,
    props.block.scene3d,
  );
  if (effects || sketch) {
    const width = (typeof props.block.width === "number" && Number.isFinite(props.block.width) ? props.block.width : 952500) / 9525;
    const height = (typeof props.block.height === "number" && Number.isFinite(props.block.height) ? props.block.height : 952500) / 9525;
    // The block's own turn and flips: an oblique camera slants the depth on
    // the slide, whichever way the shape is turned.
    const turned = props.block as { rotation?: unknown; flipH?: unknown; flipV?: unknown };
    const drawn = officeShapeEffectsPaint(effects, { width, height }, {
      sketch,
      seed: officeSketchSeed(props.block.id),
      // Blurred as PowerPoint blurs a shape's shadow.
      shadowBlurDeviation: POWERPOINT_SHADOW_BLUR_DEVIATION,
      // An evenly scaled shadow too is the shape grown or shrunk about its
      // alignment point, as PowerPoint draws it (probe lf13-shscale).
      scaledShadowSilhouette: { blurDeviation: POWERPOINT_SHADOW_BLUR_DEVIATION },
      frame: {
        rotation: typeof turned.rotation === "number" ? turned.rotation : 0,
        flipH: turned.flipH === true,
        flipV: turned.flipV === true,
      },
      gradientFill: Boolean(props.block.fillGradient) || typeof props.block.fillTo === "string",
    });
    const paint =
      drawn && props.reflectionOutside && drawn.reflect
        ? drawn.primitives.length || drawn.cssFilters.length || drawn.silhouette || drawn.transform
          ? { ...drawn, reflect: "" }
          : null
        : drawn;
    // Office's own effects are the whole truth: the legacy shadow flag and
    // preset name are not drawn beside them. No Bevel on a SmartArt shape
    // (`bevel: "none"`) takes the style's top bevel off its solid
    // (`smartArtShape3dUnderEffects`), as the point's own `a:sp3d` does.
    const block = {
      ...props.block,
      shadow: undefined,
      shapeShadow: undefined,
      effect: undefined,
      shape3d: withStatedContourColor(smartArtShape3dUnderEffects(props.block.shape3d, stated), stated),
    };
    if (paint) {
      return (
        <OfficeShapeEffectsFrame
          paint={paint}
          filterId={`presentation-shape-effects-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`}
          silhouette={
            paint.silhouette ? (
              // The override takes a hex: the colour with its alpha was refused
              // and the silhouette kept the shape's own paint, so a Perspective
              
              // A shape with no line gets no line in its shadow.
              <span style={{ ...SILHOUETTE_LAYER, opacity: officeShapeSilhouetteAlpha(paint) }}>
                <PresentationShapeGraphicBody
                  {...props}
                  block={block}
                  fillOverride={paint.silhouette.hex}
                  strokeOverride={block.stroke === "none" ? undefined : paint.silhouette.hex}
                />
              </span>
            ) : undefined
          }
        >
          <PresentationShapeGraphicBody {...props} block={block} />
        </OfficeShapeEffectsFrame>
      );
    }
    return <PresentationShapeGraphicBody {...props} block={block} />;
  }
  const preset = normalizeOfficeShapeEffectPreset(props.block.effect);
  if (!preset) return <PresentationShapeGraphicBody {...props} />;
  const reflect = props.reflectionOutside ? "" : officeShapeEffectReflectionCss(preset);
  return (
    <span
      data-shape-effect={preset}
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        filter: officeShapeEffectFilterCss(preset) || undefined,
        ...(reflect ? { WebkitBoxReflect: reflect } : {}),
      } as CSSProperties}
    >
      <PresentationShapeGraphicBody {...props} />
    </span>
  );
});

/** Tiled picture fills' own pixel sizes, by url (the most recent few). */
const TILED_PICTURE_SIZES = new Map<string, OfficePixelSize>();







function useTiledPictureSize(url: string | undefined): OfficePixelSize | null {
  const [read, setRead] = useState<{ url: string; size: OfficePixelSize } | null>(null);
  useEffect(() => {
    if (!url || TILED_PICTURE_SIZES.has(url)) return;
    let live = true;
    void loadOfficePictureNaturalSize(url)
      .then((size) => size ?? loadOfficeImageNaturalSize(url, 5000))
      .then((size) => {
        if (!size) return;
        TILED_PICTURE_SIZES.set(url, size);
        if (TILED_PICTURE_SIZES.size > 32) {
          const oldest = TILED_PICTURE_SIZES.keys().next().value;
          if (oldest !== undefined) TILED_PICTURE_SIZES.delete(oldest);
        }
        if (live) setRead({ url, size });
      });
    return () => {
      live = false;
    };
  }, [url]);
  if (!url) return null;
  return TILED_PICTURE_SIZES.get(url) ?? (read?.url === url ? read.size : null);
}







function withStatedContourColor<T extends { contourColor?: string; contourWidthEmu?: number }>(
  shape3d: T | undefined,
  stated: unknown,
): T | undefined {
  if (!shape3d || shape3d.contourColor || !(shape3d.contourWidthEmu! > 0)) return shape3d;
  const format3d = stated && typeof stated === "object" ? (stated as { format3d?: unknown }).format3d : undefined;
  const contour = format3d && typeof format3d === "object" ? (format3d as { contour?: unknown }).contour : undefined;
  const color = contour && typeof contour === "object" ? (contour as { color?: unknown }).color : undefined;
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? { ...shape3d, contourColor: color.toLowerCase() } : shape3d;
}











function deckShapeEffectsDraw3d(block: { shapeEffects?: unknown; scene3d?: unknown; shape3d?: unknown }): boolean {
  if (!block.shape3d || block.scene3d) return false;
  const effects = block.shapeEffects;
  if (!effects || typeof effects !== "object") return false;
  const rotation = (effects as { rotation3d?: unknown }).rotation3d;
  if (!rotation || typeof rotation !== "object") return false;
  const turn = rotation as { camera?: unknown; lat?: unknown; lon?: unknown; rev?: unknown };
  // A camera that turns the shape: a preset off the front, or the front
  // camera turned by its own X / Y / Z.
  return (
    typeof turn.camera === "string" &&
    (turn.camera !== "orthographicFront" || !!turn.lat || !!turn.lon || !!turn.rev)
  );
}

function PresentationShapeGraphicBody({
  block,
  fillOverride,
  strokeOverride,
  suppressFill = false,
  suppressOutline = false,
  smartArtFaceSpan,
  outlineHitBand = false,
}: PresentationShapeGraphicProps) {
  const solidFillOverride = normalizeOfficeHexColor(fillOverride);
  const solidStrokeOverride = normalizeOfficeHexColor(strokeOverride);
  // A preserved diagram member's slot picture, from the deck's own package.
  const slotFill = usePreservedSmartArtSlotFill(block);
  // The slot's edge goes with the slot. The projection gives a slot member
  // that has NO line of its own the placeholder stroke, so the empty slot
  // reads as one (native_smartart._adapt_picture_slot_fill); once its picture
  // is drawn that stroke is nobody's line, and it framed every icon of an
  
  // member is kept by the projection and drawn.
  const slotPicturePainted = !suppressFill && !solidFillOverride &&
    Boolean((block as Record<string, unknown>).fillImage ?? slotFill) &&
    readPreservedSlotPicture(asRecord(asRecord(block.source)?.nativeSmartArtView)?.pictureSlot) !== null;
  const slotEdgeDropped = slotPicturePainted && !solidStrokeOverride &&
    normalizeOfficeHexColor(block.stroke) === SMARTART_PICTURE_PLACEHOLDER_STROKE;
  const nativePaint = readPresentationNativeThemePaint(block);
  const nativeShadow = readPresentationNativeThemeShadow(block);
  const nativeFill = block.fill === undefined && block.fillImage === undefined && block.fillPattern === undefined && block.fillGradient === undefined
    ? nativePaint : undefined;
  // SmartArt quick-style 3-D, approximated in 2-D (§5 of
  // docs/office-graphics/SMARTART-STYLES.md). A 3-D CONTOUR is the outline of
  // the solid, so it becomes a real stroke — but only when the style itself
  // draws no line, so an authored outline is never overwritten.
  // A SmartArt quick style persists ONLY the writer's member contract, so a
  // gradient arrives as `fillGradient` alone (its angle in DrawingML degrees).
  // The renderer switches a gradient on from `fill` + `fillTo` and aims it with
  // `gradientAngle` in CSS degrees, so derive those two here instead of storing
  // fields the authored-group writer would reject.
  const derivedGradient =
    block.fillGradient && block.fillTo === undefined
      ? smartArtGradientCanvasCompanions(block.fillGradient)
      : null;
  const effects3d = deckShapeEffectsDraw3d(block);
  const smartArtContour = block.shape3d && !effects3d ? smartArtContourStroke(block.shape3d) : null;
  const smartArtOutline =
    smartArtContour && (!block.stroke || block.stroke === "none")
      ? smartArtContour
      : null;
  const style = resolveShapeStyle({
    shape: block.shape,
    // A suppressed fill is no fill: `null` fell back to the default pale blue,
    // so the Line Color animation layer washed a red shape out (PPT-B143).
    fill: suppressFill ? "none" : (solidFillOverride ?? block.fill ?? nativeFill?.fill),
    fillTransparency: suppressFill || solidFillOverride ? undefined : block.fillTransparency,
    fillTo: suppressFill || solidFillOverride ? undefined : (block.fillTo ?? derivedGradient?.fillTo ?? nativeFill?.fillTo),
    fillGradient:suppressFill||solidFillOverride?undefined:(block.fillGradient ?? nativeFill?.fillGradient),
    shapeShadow:block.shapeShadow ?? nativeShadow?.shadow,
    gradientAngle: block.gradientAngle ?? derivedGradient?.gradientAngle ?? nativeFill?.gradientAngle,
    fillImage: suppressFill || solidFillOverride
      ? undefined
      : ((block as Record<string, unknown>).fillImage ?? slotFill ?? undefined),
    fillPattern: suppressFill || solidFillOverride
      ? undefined
      : (block as Record<string, unknown>).fillPattern,
    stroke: suppressOutline || slotEdgeDropped
      ? "none"
      : (solidStrokeOverride ?? smartArtOutline?.stroke ?? block.stroke ?? nativePaint?.stroke ??
        // An outline the package keeps (`nativeStrokeDisposition`
        // preserve-only) that states no colour the page can read is not the
        // editor's default blue: the load normalizer gives
        // such a shape no stroke on purpose, and the canvas drew a 2 pt blue
        // frame round three placeholders whose `<a:ln></a:ln>` PowerPoint
        
        (presentationNativeOutlineKeptByPackage(block) ? "none" : undefined)),
    outlineTransparency:
      suppressOutline || solidStrokeOverride || smartArtOutline?.stroke
        ? undefined
        : (block as Record<string, unknown>).outlineTransparency,
    strokeTo: suppressOutline
      ? undefined
      : (block as Record<string, unknown>).strokeTo,
    strokeGradient: suppressOutline
      ? undefined
      : (block as Record<string, unknown>).strokeGradient,
    strokeGradientAngle: (block as Record<string, unknown>)
      .strokeGradientAngle,
    strokeWidth: suppressOutline || slotEdgeDropped
      ? 0
      : solidStrokeOverride
        ? Math.max(1, block.strokeWidth ?? 1)
        : (smartArtOutline?.strokeWidth ?? block.strokeWidth ?? nativePaint?.strokeWidth),
    strokeStyle: block.strokeStyle,
    // `a:ln@algn`. Read from the package, drawn by the shared renderer, and
    // never invented here: a shape whose line states no alignment resolves to
    // null and keeps the centred ink section 59 established.
    strokeAlign: (block as Record<string, unknown>).strokeAlign,
    outlineDash: block.outlineDash,
    outlineCap: block.outlineCap,
    outlineJoin: block.outlineJoin,
    shadow: suppressOutline ? undefined : (block.shadow ?? (nativeShadow ? true : undefined)),
    opacity: block.opacity,
    blendMode: (block as Record<string, unknown>).blendMode,
    points: (block as Record<string, unknown>).points,
    customPath: (block as Record<string, unknown>).customPath,
    openPathFilled: (block as Record<string, unknown>).openPathFilled,
  });
  const drawingWidth = (typeof block.width === "number" && Number.isFinite(block.width) ? block.width : 952500) / 9525;
  const drawingHeight = (typeof block.height === "number" && Number.isFinite(block.height) ? block.height : 952500) / 9525;
  const pictureInstanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const tileSize = useTiledPictureSize(
    style.fillImage?.fit === "tile" ? style.fillImage.url : undefined,
  );
  // Format Shape's picture options (a tile's offsets / scale / alignment /
  // mirror, the stretch's offsets, Transparency, Rotate with shape): the
  // shared pattern every editor paints.
  const officePicture = shapeFillImageNeedsPattern(style.fillImage) && style.fillImage
    ? officePictureFillPattern({
        width: drawingWidth,
        height: drawingHeight,
        natural: officePictureNaturalSize(style.fillImage.url) ?? tileSize,
        options: style.fillImage,
        rotation: Number((block as Record<string, unknown>).rotation) || 0,
      })
    : null;
  // Ids for SVG <defs> referenced by url(#…): the block's, made unique per
  // drawing. A url(#id) resolves document-wide to the FIRST element of that
  // id, so two drawings of one id -- another deck's window in the notebook,
  // whose slide 5 has its own block "slide-5-shape-6" -- painted each other's
  
  const gradientId = `presentation-grad-${block.id}-${pictureInstanceId}`;
  const strokeGradientId = `presentation-stroke-grad-${block.id}-${pictureInstanceId}`;
  const shadowId = `presentation-shadow-${block.id}-${pictureInstanceId}`;
  const picturePatternId = `presentation-fillimg-${block.id}-${pictureInstanceId}`;
  // The native drawing's markers, masks and clips: two open decks imported
  // from one file hold the same block ids, and the first window's defs drew
  
  const nativeDefsId = `${block.id}-${pictureInstanceId}`;
  const shapePatternId = `presentation-pattern-${block.id}-${pictureInstanceId}`;
  // The SmartArt bevel is an SVG filter, not a drop shadow: PowerPoint's rim is
  // INSIDE the silhouette and a drop shadow can only ever land outside it.
  const smartArtRimId =
    !suppressFill &&
    !effects3d &&
    officeSmartArtNeedsShapeFilter(block.shape3d, block.scene3d)
      ? `presentation-smartart-rim-${block.id}-${pictureInstanceId}`
      : null;
  // A picture face is bevelled on the member's geometry, not on the picture's
  // own outline (an icon in its slot stays flat, as PowerPoint draws it).
  const smartArtRimGeometry = smartArtRimId && style.fillImage
    ? (readNativeDrawingGeometry(asRecord(asRecord(block.source)?.nativeSmartArtView)?.geometry) ??
      presentationPresetGeometryForKind(normalizeShapeKind(block.shape), drawingWidth, drawingHeight))
    : null;
  const smartArtRimSilhouette = smartArtRimGeometry
    ? officeSmartArtGeometrySilhouette(smartArtRimGeometry.paths, smartArtRimGeometry.viewBox, drawingWidth, drawingHeight)
    : null;
  const hasGradient = style.fillTo !== null && style.fill !== null;
  const hasStrokeGradient =
    style.strokeTo !== null && style.stroke !== "none";
  // A PICTURE fill (when set) wins over the solid / gradient fill, painted via an
  // SVG <pattern> for the polygonal kinds (the box path uses boxShapeCss).
  const svgFill = style.fillImage
    ? `url(#${picturePatternId})`
    : style.fillPattern
      ? `url(#${shapePatternId})`
      : hasGradient
      ? `url(#${gradientId})`
      : (style.fill ?? "transparent");
  const dashArray = strokeDashArray(style);
  // The dashes' own ends: Round Dot's round dots, a dash's flat ends
  
  const dashCap = strokeDashLinecap(style);
  const svgStroke = hasStrokeGradient
    ? `url(#${strokeGradientId})`
    : style.stroke;
  const shadowFilter = style.shadow ? `url(#${shadowId})` : undefined;
  // A No Fill shape with a drawn outline is hit by that outline, across a
  // band (`officeHitBandProps`), where the host hit-tests by geometry.
  const noFillOutlineBand =
    outlineHitBand && officePaintIsNone(svgFill) && style.strokeWidth > 0 && !officePaintIsNone(svgStroke);
  // Shared defs: a linear gradient (for gradient fills) + a soft drop shadow +
  // an image <pattern> for a picture fill on a polygonal shape.
  const grad = hasGradient
    ? gradientVector(
        shapeFillGradientAngle(style, { width: drawingWidth, height: drawingHeight }),
        drawingWidth,
        drawingHeight,
      )
    : null;
  const strokeGrad = hasStrokeGradient
    ? gradientVector(
        shapeStrokeGradientAngle(style, {
          width: drawingWidth,
          height: drawingHeight,
        }),
        drawingWidth,
        drawingHeight,
      )
    : null;
  // SVG image fit: `cover` slices, `contain` meets; `tile` repeats the picture
  // at its own size once that is known (as the box path's CSS background
  // does), and meets until then.
  const imagePreserve =
    style.fillImage?.fit === "contain" || style.fillImage?.fit === "tile"
      ? "xMidYMid meet"
      : "xMidYMid slice";
  // Effects > Fill Overlay (`fillOverlay`): a second fill blended over the
  
  // tile multiplied by a theme gradient), composed with the fill in a group
  // of its own (`PresentationNativeShapeGraphic`). A path gradient radiates
  // as the shape's own path fill does (`pathGradientCircle`, a rect path the
  // rect pattern): a radial of 0.71 of the box about the focus rectangle's
  
  // from the bottom edge up.
  const fillOverlay = suppressFill ? null : shapeFillOverlayPaint(block);
  const fillOverlayId = `presentation-overlay-${block.id}-${pictureInstanceId}`;
  const fillOverlayDefs = fillOverlay?.gradient ? (
    <defs>
      {fillOverlay.gradient.path?.kind === "rect" ? (
        <RectPathGradientPattern id={fillOverlayId} gradient={fillOverlay.gradient} />
      ) : fillOverlay.gradient.path ? (
        (() => {
          const circle = pathGradientCircle(fillOverlay.gradient, drawingWidth, drawingHeight);
          return (
            <radialGradient id={fillOverlayId} {...circle.attributes}>
              {circle.stops.map((stop, index) => (
                <stop key={`${index}-${stop.position}`} offset={stop.position} stopColor={stop.color} stopOpacity={(stop as { alpha?: number }).alpha} />
              ))}
            </radialGradient>
          );
        })()
      ) : (
        <linearGradient
          id={fillOverlayId}
          {...gradientVector(officeGradientAngleForBox(fillOverlay.gradient, drawingWidth, drawingHeight), drawingWidth, drawingHeight)}
        >
          {officeGradientDrawnStops(fillOverlay.gradient.stops).map((stop, index) => (
            <stop key={index} offset={stop.position} stopColor={stop.color} stopOpacity={stop.alpha} />
          ))}
        </linearGradient>
      )}
    </defs>
  ) : null;
  const fillOverlayPaint = fillOverlay
    ? {
        fill: fillOverlay.gradient ? `url(#${fillOverlayId})` : (fillOverlay.color as string),
        blend: fillOverlay.blend,
      }
    : undefined;
  const svgDefs =
    hasGradient ||
    hasStrokeGradient ||
    style.shadow ||
    style.fillImage ||
    smartArtRimId ||
    style.fillPattern ? (
      <defs>
        {smartArtRimId && block.shape3d ? (
          <OfficeSmartArtBevelFilter
            id={smartArtRimId}
            shape3d={block.shape3d}
            scene3d={block.scene3d}
            faceSpan={smartArtFaceSpan}
            silhouette={smartArtRimSilhouette}
            outline={smartArtBevelOutline(normalizeShapeKind(block.shape), block as { rotation?: unknown; flipH?: unknown; flipV?: unknown })}
          />
        ) : null}
        {grad && style.fillGradient?.path?.kind === "rect" ? (
          <RectPathGradientPattern id={gradientId} gradient={style.fillGradient} />
        ) : grad && style.fillGradient?.path ? (
          // A path gradient (`a:path`: circle, rect, shape) radiates from its
          // focus rectangle, as the box path's CSS draws it
          // (`officeGradientCss`); drawn as the linear stand-in on a shape's
          
          
          (() => {
            const circle = pathGradientCircle(style.fillGradient, drawingWidth, drawingHeight);
            return (
              <radialGradient id={gradientId} {...circle.attributes}>
                {circle.stops.map((s,i)=><stop key={`${i}-${s.position}`} offset={s.position} stopColor={s.color} stopOpacity={(s as {alpha?:number}).alpha}/>)}
              </radialGradient>
            );
          })()
        ) : grad ? (
          <linearGradient
            id={gradientId}
            x1={grad.x1}
            y1={grad.y1}
            x2={grad.x2}
            y2={grad.y2}
          >
            {officeGradientDrawnStops(style.fillGradient?.stops??[{position:0,color:style.fill??"transparent"},{position:1,color:style.fillTo??"transparent"}]).map((s,i)=><stop key={`${i}-${s.position}`} offset={s.position} stopColor={s.color} stopOpacity={(s as {alpha?:number}).alpha}/>)}
          </linearGradient>
        ) : null}
        {strokeGrad ? (
          <linearGradient
            id={strokeGradientId}
            x1={strokeGrad.x1}
            y1={strokeGrad.y1}
            x2={strokeGrad.x2}
            y2={strokeGrad.y2}
          >
            {shapeStrokeGradientStops(style).map((s, i) => (
              <stop
                key={`${i}-${s.position}`}
                offset={s.position}
                stopColor={s.color}
                stopOpacity={s.alpha}
              />
            ))}
          </linearGradient>
        ) : null}
        {style.fillImage && officePicture?.upright ? (
          // A tile kept upright on a turned shape: turned in the box's own
          
          <pattern
            id={picturePatternId}
            patternUnits="objectBoundingBox"
            patternContentUnits="objectBoundingBox"
            x={0}
            y={0}
            width={1}
            height={1}
            data-picture-fill="tile"
          >
            <svg
              x={0}
              y={0}
              width={1}
              height={1}
              viewBox={`0 0 ${officePicture.upright.width} ${officePicture.upright.height}`}
              preserveAspectRatio="none"
            >
              <defs>
                <pattern
                  id={`${picturePatternId}-upright`}
                  patternUnits="userSpaceOnUse"
                  x={officePicture.upright.tile.x}
                  y={officePicture.upright.tile.y}
                  width={officePicture.upright.tile.width}
                  height={officePicture.upright.tile.height}
                  patternTransform={officePicture.upright.transform}
                >
                  {officePicture.upright.images.map((image, index) => (
                    <image
                      key={index}
                      href={style.fillImage!.url}
                      x={image.x}
                      y={image.y}
                      width={image.width}
                      height={image.height}
                      transform={image.transform}
                      opacity={officePicture.opacity}
                      preserveAspectRatio="none"
                    />
                  ))}
                </pattern>
              </defs>
              <rect
                x={0}
                y={0}
                width={officePicture.upright.width}
                height={officePicture.upright.height}
                fill={`url(#${picturePatternId}-upright)`}
              />
            </svg>
          </pattern>
        ) : style.fillImage && officePicture ? (
          <pattern
            id={picturePatternId}
            patternUnits="objectBoundingBox"
            patternContentUnits="objectBoundingBox"
            x={officePicture.x}
            y={officePicture.y}
            width={officePicture.width}
            height={officePicture.height}
            patternTransform={officePicture.transform}
            data-picture-fill={style.fillImage.fit === "tile" ? "tile" : "stretch"}
          >
            {officePicture.images.map((image, index) => (
              <image
                key={index}
                href={style.fillImage!.url}
                x={image.x}
                y={image.y}
                width={image.width}
                height={image.height}
                transform={image.transform}
                opacity={officePicture.opacity}
                preserveAspectRatio="none"
              />
            ))}
          </pattern>
        ) : style.fillImage && shapeFillImageNeedsPattern(style.fillImage) ? (
          // The tile's picture size is still being read: nothing yet.
          <pattern id={picturePatternId} width="0" height="0" />
        ) : style.fillImage && tileSize ? (
          // One tile the picture's size, centred like the box path's
          // `background-position: center`, repeated across the shape.
          <pattern
            id={picturePatternId}
            viewBox={`0 0 ${tileSize.width} ${tileSize.height}`}
            preserveAspectRatio="none"
            patternUnits="objectBoundingBox"
            x={0.5 - tileSize.width / drawingWidth / 2}
            y={0.5 - tileSize.height / drawingHeight / 2}
            width={tileSize.width / drawingWidth}
            height={tileSize.height / drawingHeight}
            data-picture-fill="tile"
          >
            <image
              href={style.fillImage.url}
              x="0"
              y="0"
              width={tileSize.width}
              height={tileSize.height}
              preserveAspectRatio="none"
            />
          </pattern>
        ) : style.fillImage ? (
          <pattern
            id={picturePatternId}
            viewBox={`0 0 ${drawingWidth} ${drawingHeight}`}
            preserveAspectRatio="none"
            patternUnits="objectBoundingBox"
            width="1"
            height="1"
          >
            <image
              href={style.fillImage.url}
              x="0"
              y="0"
              width={drawingWidth}
              height={drawingHeight}
              preserveAspectRatio={imagePreserve}
            />
          </pattern>
        ) : null}
        {style.fillPattern ? (
          <PresentationShapePatternTile id={shapePatternId} pattern={style.fillPattern} />
        ) : null}
        {style.shadow ? (
          <filter id={shadowId} {...(nativeShadow
            ? { filterUnits: "userSpaceOnUse" as const, ...nativeShadow.bounds }
            : { x: "-20%", y: "-20%", width: "140%", height: "140%" })}>
            <feDropShadow
              dx={
                nativeShadow?.dx ??
                (style.shapeShadow ? officeShadowOffset(style.shapeShadow).dx : 0)
              }
              dy={
                nativeShadow?.dy ??
                (style.shapeShadow
                  ? officeShadowOffset(style.shapeShadow).dy
                  : 3)
              }
              // The deviation PowerPoint blurs a shape's shadow with (its blur radius / 2 sqrt 2).
              stdDeviation={style.shapeShadow?style.shapeShadow.blur*POWERPOINT_SHADOW_BLUR_DEVIATION:3}
              floodColor={style.shapeShadow?.color??"#0f172a"}
              floodOpacity={style.shapeShadow?.opacity??0.28}
            />
          </filter>
        ) : null}
      </defs>
    ) : null;

  // The SVG (line / polygon) shape kinds don't go through `boxShapeCss`, so layer
  // the object transparency + blend mode onto the <svg> wrapper here. Both are
  // emitted ONLY for a non-default value so a plain shape's <svg> stays
  // byte-for-byte unchanged (no `opacity` / `mix-blend-mode` style).
  const svgWrapperStyle: CSSProperties = {
    display: "block",
    overflow: "visible",
  };
  if (style.opacity < 100) svgWrapperStyle.opacity = style.opacity / 100;
  // The blend mode is the block frame's (`presentationShapeBlendCss`): here,
  // inside the frame's own stacking context, it blended with nothing.
  // Bevel + extrusion as a `filter` chain: a `drop-shadow` follows the shape's
  // real alpha, so the extruded face and the bevel rim track the actual
  // silhouette rather than a bounding box. See `lib/office-smartart/canvas-3d`
  // for exactly what each layer approximates.
  if (block.shape3d && !suppressFill && !effects3d) {
    // The rim runs FIRST, on the face itself; the extrusion's shadows then
    // sweep the result, so the swept body is not carved by the rim's bands.
    const smartArt3d = [
      smartArtRimId ? officeSmartArtBevelFilterRef(smartArtRimId) : null,
      smartArtShape3dFilter(block.shape3d, style.fill ?? block.fill, block.scene3d),
    ]
      .filter(Boolean)
      .join(" ");
    if (smartArt3d) svgWrapperStyle.filter = smartArt3d;
    // The rim is lit (feDiffuseLighting): off Chromium's axis-aligned path,
    // where a member turned 180 degrees or flipped faced away from the light.
    if (smartArtRimId) Object.assign(svgWrapperStyle, LIGHTING_FILTER_LAYER);
  }

  const nativeView = asRecord(asRecord(block.source)?.nativeSmartArtView);
  if (nativeView && nativeView.role === "shape") {
    return <PresentationNativeShapeGraphic outlineHitBand={outlineHitBand} drawing={{ ...nativeView, projectedStrokeWidth: style.strokeWidth }}
      id={nativeDefsId} fill={svgFill} stroke={svgStroke} strokeWidth={style.strokeWidth}
      strokeAlign={style.strokeAlign}
      dashArray={dashArray} dashCap={dashCap} shadowFilter={shadowFilter} style={svgWrapperStyle}>
      {svgDefs}
    </PresentationNativeShapeGraphic>;
  }

  const nativeDrawing = asRecord(asRecord(block.source)?.nativeShapeDrawing);
  const nativeConnector = asRecord(nativeDrawing?.connectorIdentity);
  const defaultButtonGeometry = style.multiParts && (!nativeDrawing || nativeDrawing.presetDefaults === true)
    ? presentationActionButtonGeometry(style.kind, drawingWidth, drawingHeight) : null;
  // Single-arrow fallback polygons are generated from their kinds. Explicit
  // authored points still exclude reflow; the helper verifies the native path.
  // A hand-made group's member (`groupId` alone) is drawn as the single shape
  // it is: the exact preset outline, not a CSS box (PPT-B236).
  const shortSideGeometry = !blockClaimsNativeGroup(block) && !style.customPath &&
    (!style.polygonPoints || (isShortSideArrowKind(style.kind) && !Object.prototype.hasOwnProperty.call(block, "points")))
    ? presentationShortSideGeometry(style.kind, drawingWidth, drawingHeight, nativeDrawing ?? undefined) : null;
  // The source reference contains local EMU dimensions. Group projections,
  // authored points, custom paths, and SmartArt retain their existing renderer.
  const defaultPresetGeometry = !blockClaimsNativeGroup(block) && !style.customPath &&
    !Object.prototype.hasOwnProperty.call(block, "points") && !defaultButtonGeometry && !shortSideGeometry
    ? presentationDefaultPresetGeometry(style.kind, drawingWidth, drawingHeight, nativeDrawing ?? undefined) : null;
  const authoredPresetGeometry = presentationAuthoredPresetGeometry(
    block as unknown as Record<string, unknown>, drawingWidth, drawingHeight,
  );
  const smartArtPresetGeometry = readSmartArtBlockMarker(block) && !block.source && !block.points && !style.customPath
    ? presentationPresetGeometryForKind(normalizeShapeKind(block.shape), drawingWidth, drawingHeight) : null;
  // The shape's own dragged handles (`a:avLst`): the catalog program with
  // those values, at this size -- the same evaluation Docs and the worksheet
  // draw, and the one the file's reader will do.
  const blockAdjustments = normalizeDocumentShapeAdjustments(block.adjustments);
  const adjustedPresetGeometry = blockAdjustments && !blockClaimsNativeGroup(block) && !style.customPath &&
    !Object.prototype.hasOwnProperty.call(block, "points")
    ? presentationPresetGeometryForKind(style.kind, drawingWidth, drawingHeight, blockAdjustments) : null;
  // The line's own compound type and join (Format Shape > Line). A compound
  // line is drawn on the shape's geometry, so a shape drawn as a CSS box
  // takes its preset's path instead.
  const lineDetail = officeStrokeDetail(block as unknown as Record<string, unknown>);
  const compoundGeometry = lineDetail.outlineCompound && style.strokeWidth > 0 && !blockClaimsNativeGroup(block) && !style.customPath &&
    !Object.prototype.hasOwnProperty.call(block, "points")
    ? presentationPresetGeometryForKind(style.kind, drawingWidth, drawingHeight, blockAdjustments)
    : null;
  const projectedGeometry = adjustedPresetGeometry ?? defaultButtonGeometry ?? shortSideGeometry ?? defaultPresetGeometry ?? authoredPresetGeometry ?? smartArtPresetGeometry ?? compoundGeometry;
  const matchedNativeDrawing = nativeDrawing?.schemaVersion === "pptx-shape-drawing-v1" && nativeDrawing.shapeKind === style.kind &&
    (!style.customPath || JSON.stringify(style.customPath) === JSON.stringify(normalizePresentationCustomPath(nativeDrawing.customPathIdentity))) &&
    (!nativeConnector || Object.entries(nativeConnector).every(([key, value]) => ((block as unknown as Record<string, unknown>)[key] ?? null) === value)) ? nativeDrawing : null;
  const projectedDrawing = projectedGeometry ? { ...matchedNativeDrawing, geometry: projectedGeometry } : matchedNativeDrawing;
  // Shape Outline > Arrows on an open shape (an arc, a bracket or brace, an
  // open freeform): the block's own ends, on the drawing's end carriers.
  const openShapeEnds = projectedDrawing && presentationShapeTakesLineEnds(block)
    ? normalizePresentationOpenShapeLineEnds(presentationOpenShapeEndFields(block as unknown as Record<string, unknown>))
    : null;
  const shapeDrawing = openShapeEnds
    ? { ...projectedDrawing, lineEnds: presentationOpenShapeNativeLineEnds(openShapeEnds) }
    : projectedDrawing;
  if (shapeDrawing) {
    const ownsAuthoredOpacity = typeof block.opacity === "number" &&
      asRecord(asRecord(block.source)?.nativeAuthoredSmartArt)?.schemaVersion === "pptx-authored-smartart-v1";
    return <PresentationNativeShapeGraphic outlineHitBand={outlineHitBand} drawing={ownsAuthoredOpacity ? { ...shapeDrawing, paintOpacity: undefined } : shapeDrawing} id={nativeDefsId} fill={svgFill} stroke={svgStroke}
      strokeWidth={style.strokeWidth} strokeAlign={style.strokeAlign}
      overlay={fillOverlayPaint}
      compound={lineDetail.outlineCompound}
      join={lineDetail.outlineJoin ? { join: lineDetail.outlineJoin, miterLimit: lineDetail.outlineJoin === "miter" ? (lineDetail.outlineMiterLimit ?? 800_000) / 100_000 : undefined } : undefined}
      dashArray={dashArray} dashCap={dashCap} shadowFilter={shadowFilter} style={svgWrapperStyle}>
      {svgDefs}
      {fillOverlayDefs}
    </PresentationNativeShapeGraphic>;
  }

  const lineCallout = style.multiParts ? presentationLineCalloutDrawing(style.kind) : null;
  if (lineCallout) {
    return <PresentationLineCalloutGraphic drawing={lineCallout} fill={svgFill} stroke={svgStroke}
      strokeWidth={style.strokeWidth} dashArray={dashArray} dashCap={dashCap} shadowFilter={shadowFilter} style={svgWrapperStyle}>
      {svgDefs}
    </PresentationLineCalloutGraphic>;
  }

  if (style.isLinear && style.kind !== "ink" && !style.customPath) {
    const connector = normalizePresentationConnectorSpec({
      shape: style.kind,
      route: (block as Record<string, unknown>).route,
      connectorPreset: (block as Record<string, unknown>).connectorPreset,
      headEnd: (block as Record<string, unknown>).headEnd,
      tailEnd: (block as Record<string, unknown>).tailEnd,
      headEndWidth: (block as Record<string, unknown>).headEndWidth,
      headEndLength: (block as Record<string, unknown>).headEndLength,
      tailEndWidth: (block as Record<string, unknown>).tailEndWidth,
      tailEndLength: (block as Record<string, unknown>).tailEndLength,
    });
    // A stale or hand-edited contradictory tuple must not become a plausible
    // but false connector. Valid saves and native imports are schema-guarded.
    if (!connector) return null;
    // Draw the connector on an SVG that fills the block geometry box. Native
    // head/tail ends are independent and route geometry remains exact.
    const markerId = `presentation-arrow-${block.id}-${pictureInstanceId}`;
    // EVERY connector preset is drawn by its own DrawingML program in the
    // connector's box — `line` is `(l,t)→(r,b)`, `bentConnector3` the
    // three-segment Z, `curvedConnector5` four cubics. The direction comes from
    // the block's `flipH`/`flipV`, which `buildBlockTransform` has already
    // composed into the wrapper's CSS transform: that IS DrawingML's flip
    // semantics, and it is what the exporter writes, what the Docs and sheet
    // canvases draw, and what the imported-connector renderer
    // (`PresentationNativeShapeGraphic`) draws. Every route is linear in w/h, so
    // a 100x100 sample stretched by `preserveAspectRatio="none"` is exact.
    const presetRoute =
      presentationConnectorRouteGeometry(connector.connectorPreset, 100, 100)
        ?.paths.map((path) => path.d).join(" ") ?? "M0,0 L100,100";
    // LEGACY `lineSlope` (read-only; nothing writes it any more): a deck saved
    // before the flips named the diagonal instead. "trbl" is the horizontal
    // mirror of the preset route, so mirror the route about x=50 — inside the
    // box, so it COMPOSES with the block's own flipH exactly as the old canvas
    // composed its hand-written diagonal with it.
    const legacyMirrorH = legacyLineSlopeFlipsHorizontally(
      (block as Record<string, unknown>).lineSlope,
    );
    // Every `a:ST_LineEndType` decoration, drawn by the SAME shared primitive
    // the imported-connector renderer uses (`nativeLineEndPath` /
    // `readNativeLineEnd`) rather than a second hand-written arrowhead. The two
    // ends are independent, so each gets its own marker: `a:headEnd` and
    // `a:tailEnd` carry their own `@type`, `@w` and `@len`
    // (SHAPE-IMPORT-AUDIT.md §7.4).
    const connectorEnd = (side: "head" | "tail") =>
      style.strokeWidth > 0
        ? readNativeLineEnd({
            type: side === "head" ? connector.headEnd : connector.tailEnd,
            ...(side === "head"
              ? {
                  ...(connector.headEndWidth ? { w: connector.headEndWidth } : {}),
                  ...(connector.headEndLength
                    ? { len: connector.headEndLength }
                    : {}),
                }
              : {
                  ...(connector.tailEndWidth ? { w: connector.tailEndWidth } : {}),
                  ...(connector.tailEndLength
                    ? { len: connector.tailEndLength }
                    : {}),
                }),
          })
        : null;
    const headMarker = connectorEnd("head");
    const tailMarker = connectorEnd("tail");
    // The ends are drawn in the connector's own pixels, not the stretched
    // 0..100 sample: a DrawingML end is a multiple of the line weight
    // (`a:ST_LineEndWidth` / `a:ST_LineEndLength`), so it grows with the line,
    // as the imported-connector renderer draws it. A fixed box in the sample
    // kept a 6 pt arrow's head the size of a 1 pt one, drowned by the shaft,
    // and stretched it with the box (PPT-B146).
    const lineWidth = style.strokeWidth;
    // The weight an end is measured in: the line's, but never under 0.7 mm
    // (about 2 pt), so a hairline's arrowhead still reads as one, as Office
    // draws it (and LibreOffice's OOXML import reproduces it).
    const endBase = Math.max(lineWidth, (0.7 / 25.4) * 96);
    // The box's own pixels, never inflated by the line's weight: a nearly
    // level line's box is a pixel or two tall, and a 6 pt line read as 8 px
    // there squeezed its ends to a quarter of their height, a filled head
    
    const pixelSide = (key: "width" | "height") =>
      Math.max(
        1,
        hasLayoutGeometry(block) ? (geometryNumber(block, key) ?? 0) / AUTOFIT_EMU_PER_PX : 100,
      );
    const pxWidth = pixelSide("width");
    const pxHeight = pixelSide("height");
    const pxRoute =
      presentationConnectorRouteGeometry(connector.connectorPreset, pxWidth, pxHeight)
        ?.paths.map((path) => path.d).join(" ") ?? `M0,0 L${pxWidth},${pxHeight}`;
    const markerStart = headMarker ? `url(#${markerId}-head)` : undefined;
    const markerEnd = tailMarker ? `url(#${markerId}-tail)` : undefined;
    // A filled head narrows to its tip, where a wide shaft would show past it:
    // the shaft is cut from the middle of such a head to the tip.
    const cutsShaft = (end: typeof headMarker) =>
      end?.type === "triangle" || end?.type === "stealth";
    const shaftMaskId =
      cutsShaft(headMarker) || cutsShaft(tailMarker) ? `${markerId}-shaft` : null;
    const pixelLayer = (children: ReactNode) => (
      <svg
        x="0"
        y="0"
        width="100"
        height="100"
        viewBox={`0 0 ${pxWidth} ${pxHeight}`}
        preserveAspectRatio="none"
        overflow="visible"
      >
        {legacyMirrorH ? (
          <g transform={`translate(${pxWidth} 0) scale(-1 1)`}>{children}</g>
        ) : (
          children
        )}
      </svg>
    );
    // The mask's box, in the 0..100 sample, reaches well past the line.
    const maskPad = { x: (lineWidth * 10 * 100) / pxWidth, y: (lineWidth * 10 * 100) / pxHeight };
    const maskBox = {
      x: -maskPad.x,
      y: -maskPad.y,
      width: 100 + 2 * maskPad.x,
      height: 100 + 2 * maskPad.y,
    };
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        // A connector straight up or across has a box ~1 EMU on one side:
        // stretched onto it, the sample was scaled to nothing across and its
        // stroke with it, so the line vanished in the editor, the thumbnails
        
        // pixel, which keeps the pixel layer's stroke at its own weight.
        style={{ ...svgWrapperStyle, minWidth: 1, minHeight: 1 }}
        data-testid="presentation-shape-svg"
        data-presentation-connector-route={connector.route}
        data-presentation-connector-preset={connector.connectorPreset}
        data-presentation-connector-head={connector.headEnd}
        data-presentation-connector-tail={connector.tailEnd}
        aria-hidden="true"
      >
        <defs>
          {([
            ["head", headMarker, false],
            ["tail", tailMarker, false],
            ["cut-head", cutsShaft(headMarker) ? headMarker : null, true],
            ["cut-tail", cutsShaft(tailMarker) ? tailMarker : null, true],
          ] as const).map(([side, end, cut]) =>
            end ? (
              <marker
                key={side}
                id={`${markerId}-${side}`}
                viewBox={nativeLineEndMarker(end, endBase, lineWidth).viewBox}
                // Multiples of the line weight, as the file states them, in
                // the connector's pixels.
                markerWidth={nativeLineEndMarker(end, endBase, lineWidth).markerWidth}
                markerHeight={nativeLineEndMarker(end, endBase, lineWidth).markerHeight}
                refX={nativeLineEndMarker(end, endBase, lineWidth).refX}
                refY={nativeLineEndMarker(end, endBase, lineWidth).refY}
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
                overflow="visible"
              >
                {cut ? (
                  <rect x="3" y="-1" width="6" height="8" fill="black" />
                ) : (
                  <path
                    d={nativeLineEndMarker(end, endBase, lineWidth).d}
                    fill={end.type === "arrow" ? "none" : svgStroke}
                    stroke={end.type === "arrow" ? svgStroke : "none"}
                    strokeWidth={nativeLineEndMarker(end, endBase, lineWidth).strokeWidth}
                  />
                )}
              </marker>
            ) : null,
          )}
          {shaftMaskId ? (
            <mask
              id={shaftMaskId}
              maskUnits="userSpaceOnUse"
              {...maskBox}
              style={{ maskType: "luminance" }}
            >
              <rect {...maskBox} fill="white" />
              {pixelLayer(
                <path
                  d={pxRoute}
                  fill="none"
                  stroke="none"
                  strokeWidth={lineWidth}
                  markerStart={cutsShaft(headMarker) ? `url(#${markerId}-cut-head)` : undefined}
                  markerEnd={cutsShaft(tailMarker) ? `url(#${markerId}-cut-tail)` : undefined}
                />,
              )}
            </mask>
          ) : null}
          {strokeGrad ? (
            <linearGradient
              id={strokeGradientId}
              x1={strokeGrad.x1}
              y1={strokeGrad.y1}
              x2={strokeGrad.x2}
              y2={strokeGrad.y2}
            >
              {shapeStrokeGradientStops(style).map((s, i) => (
                <stop
                  key={`${i}-${s.position}`}
                  offset={s.position}
                  stopColor={s.color}
                  stopOpacity={s.alpha}
                />
              ))}
            </linearGradient>
          ) : null}
          {style.shadow ? (
            <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="3"
                floodColor="#0f172a"
                floodOpacity="0.28"
              />
            </filter>
          ) : null}
        </defs>
        {(() => {
          const route = (
            <path
              d={presetRoute}
              // A connector IS its stroke; weight 0 hides it (stroke none),
              // mirroring the box-shape outline. Never coerce 0 to a default.
              fill="none"
              stroke={style.strokeWidth > 0 ? svgStroke : "none"}
              strokeWidth={style.strokeWidth}
              strokeLinecap={dashCap ?? "round"}
              strokeLinejoin="round"
              strokeDasharray={dashArray}
              vectorEffect="non-scaling-stroke"
              filter={shadowFilter}
            />
          );
          // The mirror is an SVG transform in the 0..100 viewBox, not a CSS one:
          // no transform-origin to get wrong; the ends' pixel layer mirrors
          // the same way.
          const mirrored = legacyMirrorH ? (
            <g transform="translate(100 0) scale(-1 1)">{route}</g>
          ) : (
            route
          );
          // A press near the line takes it, as PowerPoint picks a line by
          // its stroke: a connector straight up or across has next to no box
          
          const hitRoute = (
            <path
              d={presetRoute}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(8, style.strokeWidth)}
              vectorEffect="non-scaling-stroke"
              pointerEvents="stroke"
              transform={legacyMirrorH ? "translate(100 0) scale(-1 1)" : undefined}
              data-presentation-connector-hit="true"
            />
          );
          return (
            <>
              {shaftMaskId ? <g mask={`url(#${shaftMaskId})`}>{mirrored}</g> : mirrored}
              {markerStart || markerEnd
                ? pixelLayer(
                    <path
                      d={pxRoute}
                      fill="none"
                      stroke="none"
                      strokeWidth={lineWidth}
                      data-office-line-end-carrier="true"
                      markerStart={markerStart}
                      markerEnd={markerEnd}
                    />,
                  )
                : null}
              {hitRoute}
            </>
          );
        })()}
      </svg>
    );
  }
  const inkCutEnds =
    style.kind === "ink" ? normalizeInkCutEnds((block as Record<string, unknown>).inkCutEnds) : undefined;
  // The tool that drew a Draw-tab stroke and a pen's effect: a pencil wears
  // the shared texture, an effect pen its gradient (the stroke's colour is
  // the effect's solid stand-in, which is what the file carries).
  const inkTool =
    style.kind === "ink" ? normalizeDocumentInkTool((block as Record<string, unknown>).inkTool) : undefined;
  const inkEffect =
    inkTool === "pen" ? normalizeDocumentInkEffect((block as Record<string, unknown>).inkEffect) : undefined;
  const inkEffectPaint = inkEffect ? documentInkEffectPaint(inkEffect) : null;
  const inkPaintId = `${gradientId}-ink`;
  // A pressure pen's stroke paints as a filled outline whose width follows
  // the pressure (lib/office-ink-smooth), in design pixels like the rest.
  const inkPressures =
    style.kind === "ink" && inkTool && inkTool !== "highlighter"
      ? documentInkPressures(
          (block as Record<string, unknown>).inkPressure,
          parsePolygonString(style.polygonPoints ?? "").length,
        )
      : null;
  const inkPressured = inkPressures !== null && inkPressuresVary(inkPressures);
  if (style.kind === "ink" && style.polygonPoints && inkEffectPaint && style.strokeWidth > 0) {
    // A pen effect: its layers (halo, gradient, sheen, glints) from the one
    // plan every editor paints (lib/office-ink-effects), in the block's own
    // design pixels as below.
    const points = parsePolygonString(style.polygonPoints).map((point, index) => ({
      x: (point.x / 100) * drawingWidth,
      y: (point.y / 100) * drawingHeight,
      ...(inkPressured && inkPressures ? { p: inkPressures[index] } : {}),
    }));
    const ends = inkStrokeEndPaint(points, inkCutEnds);
    const plan = inkEffectSvgPlan(
      inkEffectPaint,
      {
        points,
        widthPx: style.strokeWidth,
        pressured: inkPressured,
        corner: inkCornerDegreesForTool(inkTool),
        flatStart: inkCutEnds === "start" || inkCutEnds === "both",
        flatEnd: inkCutEnds === "end" || inkCutEnds === "both",
        ...(inkCutEnds && !inkPressured
          ? { linecap: ends.linecap, tipsD: ends.tips.length > 0 ? inkStrokeTipsPathData(ends.tips) : undefined }
          : {}),
      },
      `${inkPaintId}-effect`,
    );
    return (
      <svg
        viewBox={`0 0 ${drawingWidth} ${drawingHeight}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ ...svgWrapperStyle, width: drawingWidth, height: drawingHeight }}
        data-testid="presentation-shape-svg"
        data-shape-kind="ink"
        data-ink-cut-ends={inkCutEnds}
        data-ink-tool={inkTool}
        data-ink-effect={inkEffectPaint.id}
        aria-hidden="true"
      >
        {svgDefs}
        <defs>
          <InkEffectSvgGradient plan={plan} />
        </defs>
        <g filter={shadowFilter}>
          <InkEffectSvgPaths
            plan={plan}
            pathProps={dashArray ? { strokeDasharray: dashArray } : undefined}
            baseProps={inkPressured ? { "data-ink-pressure": "true" } : undefined}
          />
        </g>
      </svg>
    );
  }
  if (style.kind === "ink" && style.polygonPoints && (inkCutEnds || inkEffectPaint || inkTool === "pencil" || inkPressured)) {
    // A piece a Small / Medium Eraser left: flat where it was cut, the pen's
    // round tip where the pen ended it (the shared `inkStrokeEndPaint`).
    // Drawn in the block's own design pixels, not a stretched 0..100 box: a
    // round tip under non-scaling-stroke there is an ellipse in WebKit. The
    // wrapper's opacity holds line and tip as one, so they never double up.
    // A pencil's texture and an effect's gradient need the same uniform
    // pixels, so they are drawn here too.
    const points = parsePolygonString(style.polygonPoints).map((point, index) => ({
      x: (point.x / 100) * drawingWidth,
      y: (point.y / 100) * drawingHeight,
      ...(inkPressured && inkPressures ? { p: inkPressures[index] } : {}),
    }));
    const ends = inkStrokeEndPaint(points, inkCutEnds);
    const pencil =
      inkTool === "pencil"
        ? documentInkPencilFilter(
            style.strokeWidth,
            {
              x: -style.strokeWidth,
              y: -style.strokeWidth,
              width: drawingWidth + 2 * style.strokeWidth,
              height: drawingHeight + 2 * style.strokeWidth,
            },
            documentInkPencilSeed(style.polygonPoints),
          )
        : null;
    const inkStroke = style.strokeWidth <= 0 ? "none" : inkEffectPaint ? `url(#${inkPaintId}-effect)` : svgStroke;
    return (
      <svg
        viewBox={`0 0 ${drawingWidth} ${drawingHeight}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        // Exactly the block's design pixels: the editor's block keeps a 1 px
        // frame inside its box, and a viewBox stretched onto that smaller box
        // drew a thin stroke's width up to a fifth thinner (a 9.6 px tall
        
        // uncut stroke, whose width is not stretched.
        style={{ ...svgWrapperStyle, width: drawingWidth, height: drawingHeight }}
        data-testid="presentation-shape-svg"
        data-shape-kind="ink"
        data-ink-cut-ends={inkCutEnds}
        data-ink-tool={inkTool}
        data-ink-effect={inkEffectPaint?.id}
        aria-hidden="true"
      >
        {svgDefs}
        {inkEffectPaint || pencil ? (
          <defs>
            {inkEffectPaint ? (
              <linearGradient
                id={`${inkPaintId}-effect`}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={0}
                x2={drawingWidth}
                y2={drawingHeight}
              >
                {inkEffectPaint.stops.map((stop, index) => (
                  <stop
                    key={`${stop}-${index}`}
                    offset={`${(index / Math.max(1, inkEffectPaint.stops.length - 1)) * 100}%`}
                    stopColor={stop}
                  />
                ))}
              </linearGradient>
            ) : null}
            {pencil ? <DocumentInkPencilFilter id={`${inkPaintId}-pencil`} filter={pencil} /> : null}
          </defs>
        ) : null}
        <g filter={shadowFilter}>
        <g filter={pencil ? `url(#${inkPaintId}-pencil)` : undefined}>
          {inkPressured ? (
            <path
              data-ink-pressure="true"
              d={inkVariableWidthOutlinePathData(points, style.strokeWidth, {
                corner: inkCornerDegreesForTool(inkTool),
                flatStart: inkCutEnds === "start" || inkCutEnds === "both",
                flatEnd: inkCutEnds === "end" || inkCutEnds === "both",
              })}
              fill={inkStroke}
              stroke="none"
            />
          ) : (
            <>
              <path
                d={inkStrokePathData(points, { corner: inkCornerDegreesForTool(inkTool) })}
                fill="none"
                stroke={inkStroke}
                strokeWidth={style.strokeWidth}
                strokeLinecap={dashCap === "round" ? "round" : ends.linecap}
                strokeLinejoin="round"
                strokeDasharray={dashArray}
              />
              {ends.tips.length > 0 ? (
                <path
                  d={inkStrokeTipsPathData(ends.tips)}
                  fill="none"
                  stroke={inkStroke}
                  strokeWidth={style.strokeWidth}
                  strokeLinecap="round"
                />
              ) : null}
            </>
          )}
        </g>
        </g>
      </svg>
    );
  }
  if (style.kind === "ink" && style.polygonPoints) {
    // INK: an OPEN stroke — the stroke IS the shape, drawn as one curve
    // through its samples as a pen draws it (lib/office-ink-smooth; the
    // points list itself, and every file writer, is unchanged). Round
    // caps/joins give the pen look; non-scaling-stroke keeps the width honest
    // under resize.
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={svgWrapperStyle}
        data-testid="presentation-shape-svg"
        data-shape-kind="ink"
        aria-hidden="true"
      >
        {svgDefs}
        <path
          d={inkStrokePathDataOfList(style.polygonPoints, { width: drawingWidth, height: drawingHeight }, inkCornerDegreesForTool(inkTool))}
          fill="none"
          stroke={style.strokeWidth > 0 ? svgStroke : "none"}
          strokeWidth={style.strokeWidth}
          strokeLinecap={dashCap ?? "round"}
          strokeLinejoin="round"
          // Shape Outline > Dashes applies to ink like any other outline
          // (PPT-B158).
          strokeDasharray={dashArray}
          vectorEffect="non-scaling-stroke"
          filter={shadowFilter}
        />
      </svg>
    );
  }
  if (style.multiParts) {
    // Multi-part kinds: each part paints by ROLE — body = shape fill +
    // outline stroke (the silhouette); ink = filled with the OUTLINE color
    // (features read as drawn ink); stroke = open stroked path, never filled.
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={svgWrapperStyle}
        data-testid="presentation-shape-svg"
        aria-hidden="true"
      >
        {svgDefs}
        {style.multiParts.map((part, index) => (
          <path
            key={index}
            d={part.d}
            fill={
              part.role === "body"
                ? svgFill
                : part.role === "ink"
                  ? style.stroke
                  : "none"
            }
            stroke={
              part.role === "ink" || style.strokeWidth <= 0
                ? "none"
                : svgStroke
            }
            strokeWidth={part.role === "ink" ? 0 : style.strokeWidth}
            strokeLinecap={part.role === "body" ? (dashCap ?? "round") : "round"}
            strokeLinejoin="round"
            strokeDasharray={part.role === "body" ? dashArray : undefined}
            vectorEffect="non-scaling-stroke"
            filter={part.role === "body" ? shadowFilter : undefined}
          />
        ))}
        {noFillOutlineBand
          ? style.multiParts
              .filter((part) => part.role === "body")
              .map((part, index) => (
                <path key={`hit-band-${index}`} d={part.d} {...officeHitBandProps(style.strokeWidth)} />
              ))
          : null}
      </svg>
    );
  }
  if (style.pathD) {
    // Curved kinds: same wrapper and paint props as the polygon branch, the
    // outline just arrives as a path instead of a point list.
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={svgWrapperStyle}
        data-testid="presentation-shape-svg"
        aria-hidden="true"
      >
        {svgDefs}
        <path
          d={style.pathD}
          fillRule={
            HOLLOW_PATH_KINDS.has(style.kind) ? "evenodd" : "nonzero"
          }
          fill={svgFill}
          stroke={style.strokeWidth > 0 ? svgStroke : "none"}
          strokeWidth={style.strokeWidth}
          strokeLinecap={dashCap ?? (style.customPath ? "round" : undefined)}
          strokeLinejoin="round"
          strokeDasharray={dashArray}
          vectorEffect="non-scaling-stroke"
          filter={shadowFilter}
        />
        {noFillOutlineBand ? <path d={style.pathD} {...officeHitBandProps(style.strokeWidth)} /> : null}
      </svg>
    );
  }
  if (style.polygonPoints) {
    // Polygonal kinds share one SVG path: fill + stroke scale with the block
    // box (non-uniform), the stroke staying crisp via non-scaling-stroke.
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={svgWrapperStyle}
        data-testid="presentation-shape-svg"
        aria-hidden="true"
      >
        {svgDefs}
        <polygon
          points={style.polygonPoints}
          fill={svgFill}
          stroke={style.strokeWidth > 0 ? svgStroke : "none"}
          strokeWidth={style.strokeWidth}
          strokeLinecap={dashCap}
          strokeLinejoin="round"
          strokeDasharray={dashArray}
          vectorEffect="non-scaling-stroke"
          filter={shadowFilter}
        />
        {noFillOutlineBand ? (
          <polygon points={style.polygonPoints} {...officeHitBandProps(style.strokeWidth)} />
        ) : null}
      </svg>
    );
  }
  // A box-drawn shape's box is its geometry: where a host hit-tests shapes by
  // what is painted (`.geometryHit`), the box itself is hit -- unless it has
  // No Fill, whose interior Office passes through (the shared rule's
  // `transparent` case for SVG-drawn shapes). Its outline is then hit by an
  // SVG band laid on the border's middle line (`boxOutlineHitBand`): a CSS
  // border has no stroke of its own to hit.
  const hitBox = officePaintIsNone(svgFill) ? {} : { [OFFICE_HIT_BOX_ATTRIBUTE]: "" };
  if (shapeFillImageNeedsPattern(style.fillImage)) {
    // Office's picture options are drawn by the shared pattern, which CSS
    // backgrounds cannot (mirrored tiles, offsets, an upright picture on a
    // turned shape): the box keeps its outline and radius, the picture is an
    // SVG rect under it, clipped to the box's rounding.
    const boxCss = boxShapeCss(style, { width: drawingWidth, height: drawingHeight });
    return (
      <div
        style={{
          ...boxCss,
          background: "none",
          backgroundImage: "none",
          position: "relative",
          overflow: "hidden",
        }}
        aria-hidden="true"
        {...hitBox}
      >
        <svg
          width="100%"
          height="100%"
          style={{ display: "block", position: "absolute", inset: 0, pointerEvents: "none" }}
          data-testid="presentation-shape-picture-fill"
        >
          {svgDefs}
          <rect x="0" y="0" width="100%" height="100%" fill={svgFill} />
        </svg>
      </div>
    );
  }
  if (!hasStrokeGradient) {
    if (noFillOutlineBand) {
      return (
        <div
          style={{ ...boxShapeCss(style, { width: drawingWidth, height: drawingHeight }), position: "relative" }}
          aria-hidden="true"
        >
          {boxOutlineHitBand(style, true)}
        </div>
      );
    }
    return (
      <div
        style={boxShapeCss(style, { width: drawingWidth, height: drawingHeight })}
        aria-hidden="true"
        {...hitBox}
      />
    );
  }
  const boxCss = {
    ...boxShapeCss(style, { width: drawingWidth, height: drawingHeight }),
    border: "none",
  };
  return (
    <div style={{ ...boxCss, position: "relative" }} aria-hidden="true" {...hitBox}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{
          display: "block",
          overflow: "visible",
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
        }}
        data-testid="presentation-shape-gradient-outline"
      >
        {svgDefs}
        {style.kind === "ellipse" ? (
          <ellipse
            cx="50"
            cy="50"
            rx="50"
            ry="50"
            fill="none"
            stroke={svgStroke}
            strokeWidth={style.strokeWidth}
            strokeLinecap={dashCap}
            strokeDasharray={dashArray}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            rx={style.kind === "rounded-rectangle" ? 4 : 0}
            fill="none"
            stroke={svgStroke}
            strokeWidth={style.strokeWidth}
            strokeLinecap={dashCap}
            strokeDasharray={dashArray}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {noFillOutlineBand ? boxOutlineHitBand(style, false) : null}
    </div>
  );
}

/**
 * The hit band of a No Fill shape drawn as a CSS box (rectangle, rounded
 * rectangle, ellipse): an invisible SVG outline on the drawn line's middle
 * (`officeHitBandProps`). `insideBorder` is a CSS border, drawn inside the
 * box (`box-sizing: border-box`), whose middle is half its width in from the
 * box's edge; the gradient outline's SVG stroke is centred on the edge
 * itself. The SVG lies over the padding box, which a CSS border shrinks.
 */
function boxOutlineHitBand(style: ResolvedShapeStyle, insideBorder: boolean): ReactElement {
  const line = style.strokeWidth;
  const outset = insideBorder ? line / 2 : 0;
  const cornerRadius = style.kind === "rounded-rectangle" ? 16 : 4;
  return (
    <svg
      style={{
        position: "absolute",
        left: -outset,
        top: -outset,
        width: `calc(100% + ${2 * outset}px)`,
        height: `calc(100% + ${2 * outset}px)`,
        overflow: "visible",
        pointerEvents: "none",
      }}
      data-testid="presentation-shape-outline-hit-band"
      aria-hidden="true"
    >
      {style.kind === "ellipse" ? (
        <ellipse cx="50%" cy="50%" rx="50%" ry="50%" {...officeHitBandProps(line)} />
      ) : (
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          rx={insideBorder ? Math.max(0, cornerRadius - line / 2) : style.kind === "rounded-rectangle" ? "4%" : 0}
          {...officeHitBandProps(line)}
        />
      )}
    </svg>
  );
}

const FILL_OVERLAY_BLENDS = new Set(["multiply", "screen", "darken", "lighten", "normal"]);

/** A shape's Fill Overlay as the page states it, or null. */
function shapeFillOverlayPaint(
  block: unknown,
): { blend: CSSProperties["mixBlendMode"]; gradient?: OfficeShapeGradient; color?: string } | null {
  const raw = (block as { fillOverlay?: unknown }).fillOverlay;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const blend = typeof record.blend === "string" && FILL_OVERLAY_BLENDS.has(record.blend) ? record.blend : null;
  if (!blend) return null;
  if (record.gradient !== undefined) {
    try {
      return { blend: blend as CSSProperties["mixBlendMode"], gradient: normalizeOfficeShapeGradient(record.gradient) };
    } catch {
      return null;
    }
  }
  return typeof record.color === "string" && /^#[0-9a-f]{6}$/i.test(record.color)
    ? { blend: blend as CSSProperties["mixBlendMode"], color: record.color }
    : null;
}


/**
 * A rectangular path gradient (`a:path path="rect"`) over the shape's box, as
 * PowerPoint prints it: rectangular contours from the focus rectangle to the
 * box (`officeRectPathGradient`; look-fit truth-probes/lookfit-rect-shape-
 * probe.pptx: rectangles 4:3 and 2:1, an ellipse, a rounded rectangle and a
 * right triangle, each over its own box, within 0.006 along the stops on
 * average; the circle about the box's centre was 0.12 off). An SVG pattern in
 * the box's own units: the last stop's colour, the focus in the first, each
 * trapezoid a linear gradient across it, stroked with itself so that no seam
 * shows.
 */
function RectPathGradientPattern({ id, gradient }: { id: string; gradient: OfficeShapeGradient }) {
  const shape = officeRectPathGradient(gradient.path?.fillToRect, gradient.tileRect);
  const stops = officeGradientDrawnStops(gradient.stops);
  const stopTags = stops.map((stop, index) => (
    <stop key={`${index}-${stop.position}`} offset={stop.position} stopColor={stop.color} stopOpacity={(stop as { alpha?: number }).alpha} />
  ));
  const first = stops[0];
  const last = stops[stops.length - 1];
  const [fl, ft, fr, fb] = shape.focus;
  return (
    <pattern id={id} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" x={0} y={0} width={1} height={1} data-path-gradient="rect">
      {last ? <rect x={0} y={0} width={1} height={1} fill={last.color} fillOpacity={(last as { alpha?: number }).alpha} /> : null}
      {shape.regions.map((region, index) => (
        <g key={index}>
          <linearGradient id={`${id}-r${index}`} gradientUnits="userSpaceOnUse" x1={region.from[0]} y1={region.from[1]} x2={region.to[0]} y2={region.to[1]}>
            {stopTags}
          </linearGradient>
          <polygon
            points={region.points.map(([x, y]) => `${x},${y}`).join(" ")}
            fill={`url(#${id}-r${index})`}
            stroke={`url(#${id}-r${index})`}
            strokeWidth={0.002}
            strokeLinejoin="round"
          />
        </g>
      ))}
      {first && fr > fl && fb > ft ? (
        <rect x={fl} y={ft} width={fr - fl} height={fb - ft} fill={first.color} fillOpacity={(first as { alpha?: number }).alpha} />
      ) : null}
    </pattern>
  );
}














export function pathGradientCircle(
  gradient: OfficeShapeGradient,
  width = 1,
  height = 1,
): {
  attributes: { cx: number; cy: number; r: number; fx: number; fy: number; fr?: number; gradientTransform?: string };
  stops: ReturnType<typeof officeGradientDrawnStops>;
} {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const circle = officeCirclePathGradient(gradient.path?.fillToRect, gradient.tileRect, w, h);
  const drawn = officeCirclePathGradientSvg(circle, officeGradientDrawnStops(gradient.stops));
  // Gradient space measures both axes in widths; the transform stretches
  // its y back onto the box (objectBoundingBox units).
  const k = h / w;
  const { cx, cy, r, fx, fy, fr } = drawn.attributes;
  return {
    attributes: {
      cx: cx / w,
      cy: cy / w,
      r: r / w,
      fx: fx / w,
      fy: fy / w,
      ...(fr === undefined ? {} : { fr: fr / w }),
      ...(Math.abs(k - 1) > 1e-9 ? { gradientTransform: `scale(1 ${1 / k})` } : {}),
    },
    stops: drawn.stops,
  };
}
