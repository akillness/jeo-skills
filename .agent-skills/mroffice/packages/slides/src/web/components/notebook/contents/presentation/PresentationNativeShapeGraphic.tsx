/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode } from "react";
import { officeHitBandProps, officePaintIsNone } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { readNativeDrawingGeometry, nativePathFillColor, readNativeLineEnd, nativeLineEndMarker, nativeLineEndPlacements, readNativeLineJoin } from "@mrnote/core/web/lib/native-drawing-geometry.ts";
import { isOfficeInsetStroke, officeStrokeAlignClipId, officeStrokeAlignPaintWidth } from "@mrnote/core/web/lib/office-shape-line-align.ts";
import { officeCompoundStrokeLayers, type OfficeStrokeCompound } from "@mrnote/core/web/lib/office-stroke-detail.ts";

/** The least weight a line end is measured in: 0.7 mm (about 2 pt), as Office draws a hairline's arrowhead. */
const LINE_END_MIN_BASE_PX = (0.7 / 25.4) * 96;

/** A colour that carries its own alpha (`#rgba`, `#rrggbbaa`, `rgba()` / `hsla()` below 1). */
function paintCarriesAlpha(paint: string): boolean {
  if (/^#(?:[\da-f]{4}|[\da-f]{8})$/i.test(paint)) return true;
  const functional = /^(?:rgba|hsla)\((.*)\)$/i.exec(paint.trim());
  if (!functional) return false;
  const alpha = functional[1].split(/[\s,/]+/).filter(Boolean)[3];
  if (alpha === undefined) return false;
  const value = alpha.endsWith("%") ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
  return Number.isFinite(value) && value < 1;
}








export function nativePaintOpacity(
  paintOpacity: Record<string, unknown> | null | undefined,
  key: "fill" | "stroke",
  paint: string,
): number {
  const value = paintOpacity?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  if (paintCarriesAlpha(paint)) return 1;
  return Math.max(0, Math.min(1, value));
}

export function PresentationNativeShapeGraphic({ drawing, id, fill, stroke, strokeWidth, strokeAlign, dashArray, dashCap, shadowFilter, style, children, compound, join, overlay, outlineHitBand = false }: {
  /** Draw a No Fill outline's hit band (`officeHitBandProps`): the host hit-tests by geometry. */
  outlineHitBand?: boolean;
  /** Effects > Fill Overlay: a paint blended over every filled path. */
  overlay?: { fill: string; blend: CSSProperties["mixBlendMode"] };
  /** `a:ln@cmpd`: the outline drawn as the two or three parallel lines it is. */
  compound?: OfficeStrokeCompound;
  /** The line's own join (`a:round|a:bevel|a:miter`), over the drawing's. */
  join?: { join: "round" | "bevel" | "miter"; miterLimit?: number };
  drawing: Record<string, unknown>;
  id: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /**
   * `a:ln@algn` as the page holds it. `"inset"` is the `in` pen: the whole
   * stroke belongs inside the geometry path (Office's `LineFormat.InsetPen`),
   * so the ink is doubled and clipped to the path instead of straddling it.
   * Anything else -- including a shape whose line states no alignment -- keeps
   * the centred reading section 59 established.
   */
  strokeAlign?: unknown;
  dashArray?: string;
  /** The cap `dashArray`'s dashes are drawn with (`strokeDashLinecap`). */
  dashCap?: "round" | "butt" | "square";
  shadowFilter?: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const geometry = readNativeDrawingGeometry(drawing.geometry);
  if (!geometry) return null;
  const lineJoin = join ?? (drawing.schemaVersion === "pptx-shape-drawing-v1" ? readNativeLineJoin(drawing.lineJoin) : null);
  const rawLineWidth = strokeWidth !== drawing.projectedStrokeWidth ? undefined : drawing.strokeWidthEmu;
  const lineWidth = typeof rawLineWidth === "number" && Number.isFinite(rawLineWidth)
    ? Math.max(0, Math.min(1000, rawLineWidth / 9525)) : strokeWidth;
  const ends = drawing.lineEnds && typeof drawing.lineEnds === "object" ? drawing.lineEnds as Record<string, unknown> : null;
  const head = readNativeLineEnd(ends?.headEnd), tail = readNativeLineEnd(ends?.tailEnd);
  const marker = (end: ReturnType<typeof readNativeLineEnd>, side: string, shaftCut = false, paint = stroke) => end && lineWidth > 0 ? (
    // A multiple of the line weight, never under 0.7 mm, as a drawn
    // connector's end is (`PresentationShapeGraphic`): the same default
    
    <marker id={`native-${side}-${id}`} viewBox={nativeLineEndMarker(end, Math.max(lineWidth, LINE_END_MIN_BASE_PX), lineWidth).viewBox}
      refX={nativeLineEndMarker(end, Math.max(lineWidth, LINE_END_MIN_BASE_PX), lineWidth).refX} refY={nativeLineEndMarker(end, Math.max(lineWidth, LINE_END_MIN_BASE_PX), lineWidth).refY}
      markerWidth={nativeLineEndMarker(end, Math.max(lineWidth, LINE_END_MIN_BASE_PX), lineWidth).markerWidth} markerHeight={nativeLineEndMarker(end, Math.max(lineWidth, LINE_END_MIN_BASE_PX), lineWidth).markerHeight}
      markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible">
      {shaftCut ? <rect x="3" y="0" width="4" height="6" fill="black" /> :
        <path d={nativeLineEndMarker(end, Math.max(lineWidth, LINE_END_MIN_BASE_PX), lineWidth).d} fill={end.type === "arrow" ? "none" : paint}
          stroke={end.type === "arrow" ? paint : "none"} strokeWidth={nativeLineEndMarker(end, Math.max(lineWidth, LINE_END_MIN_BASE_PX), lineWidth).strokeWidth} />}
    </marker>
  ) : null;
  // A filled triangle ends at the native endpoint. The full-width shaft must
  // not remain visible through its narrowing tip. Let SVG position a matching
  // cutout on the original route, so curves and elbows need no path rewriting.
  // Keep this limited to imported ordinary connectors; SmartArt uses this
  // renderer too and retains its existing rendering contract.
  // URL paints may use objectBoundingBox coordinates: moving their paint from
  // the native path to the coverage rectangle would change that coordinate box.
  const solidStroke = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(stroke) || /^rgba?\([\d\s.,%+-]+\)$/i.test(stroke);
  const maskShaft = solidStroke && drawing.schemaVersion === "pptx-shape-drawing-v1" &&
    drawing.connectorIdentity && typeof drawing.connectorIdentity === "object" &&
    (geometry.paths[0].fill === "none" || fill === "none" || fill === "transparent") &&
    geometry.paths.length === 1 && geometry.paths[0].stroke && lineWidth > 0 && (head?.type === "triangle" || tail?.type === "triangle");
  const maskId = `native-shaft-mask-${id}`;
  const coverageId = `native-connector-coverage-${id}`;
  const padding = lineWidth * 10;
  const bounds = { x: -padding, y: -padding, width: (geometry.viewBox?.[0] ?? 100) + padding * 2, height: (geometry.viewBox?.[1] ?? 100) + padding * 2 };
  const paintOpacity = drawing.paintOpacity && typeof drawing.paintOpacity === "object"
    ? drawing.paintOpacity as Record<string, unknown> : null;
  const opacity = (key: "fill" | "stroke") => nativePaintOpacity(paintOpacity, key, key === "fill" ? fill : stroke);
  // The filled paths the fill overlay is blended onto, in a group of their own (below); null without one.
  const overlayGroup = overlay && !maskShaft ? geometry.paths.filter((path) => path.fill !== "none") : null;
  const insetStrokeClips = isOfficeInsetStroke(strokeAlign) && lineWidth > 0 ? (
    <defs>
      {geometry.paths.map((path, index) => {
        const clipId = path.fill !== "none" && path.stroke
          ? officeStrokeAlignClipId(id, strokeAlign, index) : null;
        return clipId ? (
          <clipPath key={clipId} id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={path.d} />
          </clipPath>
        ) : null;
      })}
    </defs>
  ) : null;
  return (
    <svg viewBox={`0 0 ${geometry.viewBox?.[0] ?? 100} ${geometry.viewBox?.[1] ?? 100}`} preserveAspectRatio="none" width="100%" height="100%"
      style={{ ...style, minWidth: 1, minHeight: 1 }} data-testid="presentation-native-drawing-geometry" aria-hidden="true">
      {children}
      {head || tail ? <defs>
        {marker(head, "head", false, maskShaft ? "white" : stroke)}{marker(tail, "tail", false, maskShaft ? "white" : stroke)}
        {maskShaft ? <>
          {head?.type === "triangle" ? marker(head, "shaft-head", true) : null}
          {tail?.type === "triangle" ? marker(tail, "shaft-tail", true) : null}
          <mask id={maskId} maskUnits="userSpaceOnUse" {...bounds} style={{ maskType: "luminance" }}>
            <rect {...bounds} fill="white" />
            <path d={geometry.paths[0].d} fill="none" stroke="none" strokeWidth={lineWidth} vectorEffect="non-scaling-stroke"
              markerStart={head?.type === "triangle" ? `url(#native-shaft-head-${id})` : undefined}
              markerEnd={tail?.type === "triangle" ? `url(#native-shaft-tail-${id})` : undefined} />
          </mask>
          <mask id={coverageId} maskUnits="userSpaceOnUse" {...bounds} style={{ maskType: "luminance" }}>
            <path d={geometry.paths[0].d} fill="none" stroke="white" strokeWidth={lineWidth} strokeDasharray={dashArray}
              strokeLinecap={dashArray ? dashCap : undefined}
              mask={`url(#${maskId})`} vectorEffect="non-scaling-stroke" />
            <path d={geometry.paths[0].d} fill="none" stroke="none" strokeWidth={lineWidth}
              markerStart={head ? `url(#native-head-${id})` : undefined}
              markerEnd={tail ? `url(#native-tail-${id})` : undefined} vectorEffect="non-scaling-stroke" />
          </mask>
        </> : null}
      </defs> : null}
      {overlayGroup ? (
        // Effects > Fill Overlay: the overlay blended onto the shape's FILL
        // alone, in a group of its own, as PowerPoint composes it -- the fill
        // the backdrop (at its own alpha), the overlay over it at the
        // overlay's own alpha (W3C compositing: (1 - ab) Cs + ab B(Cb, Cs)).
        // Drawn at the fill's alpha over the slide, the Flow theme's
        // translucent tile tinted by its theme gradient came out a pale wash
        
        // against PowerPoint's 53,142,167), and the overlay tinted the line.
        <g style={{ isolation: "isolate" }} filter={shadowFilter} data-fill-overlay-group="true">
          {overlayGroup.map((path, index) => (
            <path key={`fill-${index}`} d={path.d} fill={nativePathFillColor(fill, path.fill)} stroke="none"
              fillOpacity={opacity("fill")} />
          ))}
          {overlayGroup.map((path, index) => (
            <path key={`overlay-${index}`} d={path.d} fill={overlay!.fill} stroke="none"
              style={{ mixBlendMode: overlay!.blend }} pointerEvents="none" data-fill-overlay="true" />
          ))}
        </g>
      ) : null}
      {maskShaft ? (
        // Build one coverage surface before coloring it. The shaft may overlap
        // the wide part of the triangle without an antialias seam or alpha buildup.
        // The surface is the drawing's whole box and more (`bounds` pads it
        // for the ends), and a mask only hides paint: it took every press
        
        // below is what a press picks.
        <g filter={shadowFilter}>
          <rect {...bounds} fill={stroke} opacity={opacity("stroke")} mask={`url(#${coverageId})`} pointerEvents="none" />
        </g>
      ) : (
        // DrawingML fills every path of a drawing and THEN strokes every path,
        // so a stroke-only path is an overlay however early it is declared.
        // SVG paints in document order, which let chartPlus/chartStar/chartX
        // cover their own marks with the frame declared after them. The
        // partition is stable; a 147-package corpus (6078 shapes, 1293 of
        // them custGeom) has no other drawing with a stroke-only path ahead
        // of a filled one, so every imported drawing keeps its order.
        [...geometry.paths.filter(path => path.fill !== "none"), ...geometry.paths.filter(path => path.fill === "none")]
      ).map((path, index) => {
        // An INSET pen only has an inside on a subpath that encloses one. The
        // geometry's own `fill` says which those are (`none` is a stroke-only
        // overlay, an open route), and Office's `InsetPen` moves nothing on a
        // bare line either, so an open subpath keeps the centred ink.
        // The drawn order is NOT `geometry.paths` order (fills are hoisted
        // ahead of stroke-only overlays above), so the clip is keyed on the
        // path's own index in the geometry, which is what `<defs>` used.
        const clipId = path.fill !== "none" && path.stroke && lineWidth > 0
          ? officeStrokeAlignClipId(id, strokeAlign, geometry.paths.indexOf(path)) : null;
        // A compound line (Double, Thick Thin, Thin Thick, Triple): the fill
        // keeps its own element and the stroke is masked by layered strokes
        // of the same path, the gaps showing what lies behind (the page
        // outside the outline, the fill inside it), as Office draws them.
        if (compound && path.stroke && lineWidth > 0 && !clipId) {
          const pathIndex = geometry.paths.indexOf(path);
          const maskId = `native-compound-${id}-${pathIndex}`;
          const insideId = `${maskId}-inside`;
          const layers = officeCompoundStrokeLayers(compound, path.fill !== "none");
          return (
            <g key={index}>
              <defs>
                {layers.some((layer) => layer.inside) ? (
                  <clipPath id={insideId} clipPathUnits="userSpaceOnUse">
                    <path d={path.d} />
                  </clipPath>
                ) : null}
                <mask id={maskId} maskUnits="userSpaceOnUse" {...bounds}>
                  {layers.map((layer, layerIndex) => (
                    <path key={layerIndex} d={path.d} fill="none" stroke={layer.ink ? "white" : "black"}
                      strokeWidth={Math.round(lineWidth * layer.width * 1000) / 1000}
                      strokeLinejoin={lineJoin?.join} strokeMiterlimit={lineJoin?.miterLimit}
                      clipPath={layer.inside ? `url(#${insideId})` : undefined}
                      vectorEffect="non-scaling-stroke" />
                  ))}
                </mask>
              </defs>
              {overlayGroup ? null : (
                <path d={path.d} fill={nativePathFillColor(fill, path.fill)} stroke="none"
                  fillOpacity={opacity("fill")} filter={shadowFilter} />
              )}
              <path d={path.d} fill="none" stroke={stroke} strokeWidth={lineWidth} mask={`url(#${maskId})`}
                strokeDasharray={dashArray} strokeLinecap={dashArray ? dashCap : undefined}
                strokeLinejoin={lineJoin?.join} strokeMiterlimit={lineJoin?.miterLimit}
                strokeOpacity={opacity("stroke")} vectorEffect="non-scaling-stroke" filter={shadowFilter} />
            </g>
          );
        }
        return (
        <path key={index} d={path.d} fill={overlayGroup ? "none" : nativePathFillColor(fill, path.fill)}
          stroke={path.stroke && lineWidth > 0 ? stroke : "none"}
          strokeWidth={clipId ? officeStrokeAlignPaintWidth(lineWidth, strokeAlign) : lineWidth}
          clipPath={clipId ? `url(#${clipId})` : undefined}
          strokeDasharray={dashArray} strokeLinecap={dashArray ? dashCap : undefined}
          strokeLinejoin={lineJoin?.join} strokeMiterlimit={lineJoin?.miterLimit}
          fillOpacity={opacity("fill")} strokeOpacity={opacity("stroke")}
          vectorEffect="non-scaling-stroke" filter={shadowFilter} />
        );
      })}
      {

}
      {drawing.connectorIdentity && typeof drawing.connectorIdentity === "object"
        ? geometry.paths.map((path, index) => (
            <path key={`hit-${index}`} d={path.d} fill="none" stroke="transparent"
              strokeWidth={Math.max(8, lineWidth)} vectorEffect="non-scaling-stroke"
              pointerEvents="stroke" data-presentation-connector-hit="true" />
          ))
        : null}
      {/* A No Fill outline is hit across a band, not only on its hairline,
          where the host hit-tests by geometry (`.geometryHit`): Office
          selects a no-fill shape by its outline and passes a press on its
          interior through. Inert anywhere else. */}
      {outlineHitBand && !drawing.connectorIdentity && officePaintIsNone(fill) && lineWidth > 0 && !officePaintIsNone(stroke)
        ? geometry.paths.map((path, index) =>
            path.stroke ? (
              <path key={`hit-band-${index}`} d={path.d} {...officeHitBandProps(lineWidth)} />
            ) : null,
          )
        : null}
      {/* One `clipPath` per enclosing subpath, so the doubled ink above keeps
          only the half that falls inside the path. The fill boundary is
          untouched: this moves ink, never geometry. */}
      {insetStrokeClips}
      {/* The ends ride on their own marker carriers, one per sub-path Office
          decorates, because SVG puts `marker-start`/`marker-end` on the FIRST
          and LAST vertex of a whole path — on a rectangle that is one corner,
          which is an arrowhead Office draws nowhere, and on a `bracketPair` it
          is two tips of four. `nativeLineEndPlacements` is the measured rule
          (SHAPE-IMPORT-AUDIT.md §7.10); the carriers paint nothing themselves. */}
      {!maskShaft && (head || tail)
        ? nativeLineEndPlacements(geometry.paths).map((placement, index) => (
            <path key={`end-${index}`} d={placement.d} fill="none" stroke="none" strokeWidth={lineWidth}
              data-office-line-end-carrier="true"
              markerStart={head && placement.head ? `url(#native-head-${id})` : undefined}
              markerEnd={tail && placement.tail ? `url(#native-tail-${id})` : undefined}
              vectorEffect="non-scaling-stroke" filter={shadowFilter} />
          ))
        : null}
    </svg>
  );
}
