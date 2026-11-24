"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { officeCompoundStrokeLayers } from "../../../../lib/office-stroke-detail";
import { useId } from "react";
import { OfficeShapePreview, type OfficeShapePreviewProps } from "../../../office-ribbon/OfficeShapeCatalogPanel";
import { officeFillPatternTile } from "../../../../lib/office-chart-shape-paint";
import { officeGradientAngle, officeGradientDrawnStops } from "../../../../lib/office-shape-paint";
import { officePictureFillPattern, officePictureNaturalSize } from "../../../../lib/office-picture-fill-options";
import { presentationConnectorRouteGeometry, presentationPresetGeometryForKind } from "../../../../lib/presentation-authored-preset-geometry";
import { nativePathFillColor, type NativePathFill } from "../../../../lib/native-drawing-geometry";
import { OfficeLineEndCarriers, OfficeLineEndMarkers, officeLineEnd } from "../../../office-ribbon/OfficeLineEndMarkers";
import { gradientVector, normalizePresentationConnectorSpec } from "../../../../lib/presentation-shapes";
import { OFFICE_SHAPE_PREVIEW_VIEW_BOX } from "../../../../lib/office-shape-catalog";
import { isOfficeInsetStroke, officeStrokeAlignClipId, officeStrokeAlignPaintWidth } from "../../../../lib/office-shape-line-align";

function previewPathFill(paint: string, mode: NativePathFill): string {
  if (mode === "none" || mode === "norm" || paint === "none" || paint.startsWith("url(") || /^#[0-9a-f]{6}$/i.test(paint)) {
    return nativePathFillColor(paint, mode);
  }
  const amount = mode.endsWith("Less") ? 20 : 40;
  return `color-mix(in srgb, ${paint} ${100 - amount}%, ${mode.startsWith("lighten") ? "white" : "black"})`;
}

/**
 * The drawing box a host canvas asked for, normalised so its long side is 100.
 * The preset program is scale-invariant, so only the RATIO matters; keeping the
 * magnitude where it has always been leaves every coordinate, the leader bleed
 * below and the evaluator's own bounds exactly as they were for a square box.
 */
function presetPreviewBox(width: unknown, height: unknown): readonly [number, number] {
  if (typeof width !== "number" || typeof height !== "number" ||
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [100, 100];
  const scale = 100 / Math.max(width, height);
  return [width * scale, height * scale];
}

/** PPT's preview uses the same default paths as its canvas and PPTX preset. */
export function PresentationPresetShapePreview(props: OfficeShapePreviewProps) {
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const { kind, fill = "#f6ddd5", stroke = "#a33417", strokeWidth = 4, strokeStyle = "solid", shadow, fillGradient, className } = props;
  const [boxWidth, boxHeight] = presetPreviewBox(props.boxWidthPx, props.boxHeightPx);
  // A line drawn level or upright has no height or no width (a sheet's
  // dimension arrow: a:ext cy="0"); its host gives it a 1 px box. Its route
  // is evaluated flat, so it draws level along the box's edge, as Office
  // does, not as a 1 px diagonal (lookwin probe p13).
  const flat = (side: unknown) => typeof side === "number" && side > 0 && side < 1.5;
  const flatWidth = flat(props.boxWidthPx), flatHeight = flat(props.boxHeightPx);
  // …with the shape's OWN dragged handles, so a corner someone pulled in Excel
  // or Word is drawn where they pulled it instead of at the preset's default.
  const presetGeometry = presentationPresetGeometryForKind(kind, boxWidth, boxHeight, props.adjustments);
  // A connector's `@prst` IS its route, so it comes from the same evaluator:
  // that is the only way `bentConnector4`'s three bends and `curvedConnector5`'s
  // four cubics can be told apart from the three-segment default at all. Its
  // ends stay independent and are drawn as markers below.
  // The caller's OWN ends win over the ones `kind` implies: DrawingML keeps the
  // decoration on `a:ln`, so a `stealth` head on an arrowed elbow is the same
  // connector wearing a different arrowhead (SHAPE-IMPORT-AUDIT.md §7.4).
  const connectorInput = {
    shape: kind, headEnd: props.headEnd, tailEnd: props.tailEnd,
    headEndWidth: props.headEndWidth, headEndLength: props.headEndLength,
    tailEndWidth: props.tailEndWidth, tailEndLength: props.tailEndLength,
  };
  const statedConnector = presetGeometry || props.points || props.customPath ? null
    : normalizePresentationConnectorSpec(connectorInput);
  const connector = presetGeometry || props.points || props.customPath ? null
    : (statedConnector ?? normalizePresentationConnectorSpec({ shape: kind }));
  const routed = presetGeometry ??
    (connector ? presentationConnectorRouteGeometry(connector.connectorPreset, boxWidth, boxHeight) : null);
  // A straight line's points (moveTo / lineTo) put level or upright.
  const geometry = routed && connector && (flatWidth || flatHeight) ? {
    ...routed,
    paths: routed.paths.map((path) => ({ ...path, d: path.d.replace(/([ML])\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)/g,
      (_, command: string, x: string, y: string) => `${command}${flatWidth ? 0 : x} ${flatHeight ? 0 : y}`) })),
  } : routed;
  // An explicit outline says the caller's shape is not this preset at all, so
  // the preset geometry must not overwrite it.
  if (!geometry || props.points || props.customPath) return <OfficeShapePreview {...props} />;
  const markerId = `presentation-preset-arrow-${instanceId}`;
  // One marker per END, drawn by the SHARED native primitive so a gallery tile,
  // a sheet drawing and a slide put the same arrowhead on the same outline. A
  // connector's kind implies its ends when the caller states none; any OTHER
  // shape wears exactly the ends its file states, and where they land is the
  // measured Office rule below (SHAPE-IMPORT-AUDIT.md §7.10).
  // A slide block's kind names WHETHER each end is decorated, and the strict
  // spec refuses a block that contradicts it. A document or a sheet shape has
  // no such rule: its kind is only the ROUTE, and an elbow decorated at its
  // beginning alone is the undecorated elbow wearing a stated head
  // (SHAPE-IMPORT-AUDIT.md §7.11). Falling back to the kind's own ends there
  // drew that connector with no arrowhead at all, so when the strict spec
  // refuses, the route still comes from the kind and the ends from the caller.
  const callerStatesEnds = props.headEnd !== undefined || props.tailEnd !== undefined;
  const endFields = connector && (statedConnector || !callerStatesEnds)
    ? {
        headEnd: connector.headEnd, tailEnd: connector.tailEnd,
        headEndWidth: connector.headEndWidth, headEndLength: connector.headEndLength,
        tailEndWidth: connector.tailEndWidth, tailEndLength: connector.tailEndLength,
      }
    : {
        headEnd: props.headEnd, tailEnd: props.tailEnd,
        headEndWidth: props.headEndWidth, headEndLength: props.headEndLength,
        tailEndWidth: props.tailEndWidth, tailEndLength: props.tailEndLength,
      };
  const headEnd = officeLineEnd(endFields, "head");
  const tailEnd = officeLineEnd(endFields, "tail");
  // A picture fill paints the geometry through the same `url(#…)` slot a
  // gradient does, so it is CLIPPED TO THE OUTLINE instead of covering the
  // shape with a rectangle. `a:stretch`/`a:fillRect` stretches the picture to
  // the shape's box, which is what `preserveAspectRatio="none"` says.
  const pictureGeometry = props.fillImage
    ? officePictureFillPattern({
        width: Number(props.boxWidthPx) > 0 ? Number(props.boxWidthPx) : boxWidth,
        height: Number(props.boxHeightPx) > 0 ? Number(props.boxHeightPx) : boxHeight,
        natural: officePictureNaturalSize(props.fillImage),
        options: props.fillImageOptions ?? {},
        rotation: props.fillImageRotation,
      })
    : null;
  const paint = props.fillImage
    ? pictureGeometry ? `url(#${instanceId}-image)` : "none"
    : props.fillPattern
      ? `url(#${instanceId}-pattern)`
      : fillGradient
        ? `url(#${instanceId}-fill)`
        : fill;
  // A gradient line paints every stroke through its stops; arrowheads take
  // its first colour.
  const strokePaint = props.strokeGradient ? `url(#${instanceId}-stroke)` : stroke;
  const patternTile = props.fillPattern ? officeFillPatternTile(props.fillPattern) : null;
  // The view's units are the box's longer side over 100: Office paints a
  // pattern's bitmap one pixel a bit whatever the shape's size, so the tile
  // is scaled back to the box's own pixels.
  const longerSidePx = Math.max(Number(props.boxWidthPx) || 0, Number(props.boxHeightPx) || 0);
  const patternScale = longerSidePx > 0 ? Math.round((100 / longerSidePx) * 10_000) / 10_000 : 1;
  // The line's exact dash and cap when it states them (Shape Outline >
  // Dashes), else the family's sample pattern.
  const dashArray = props.dashArray ?? (strokeStyle === "dashed" ? "14 9" : strokeStyle === "dotted" ? "3 8" : undefined);
  const dashCap = props.dashArray ? props.dashCap : undefined;
  const lineJoin = props.join?.join ?? "round";
  const miterLimit = props.join?.join === "miter" ? props.join.miterLimit : undefined;
  const compoundLayers = props.compound && strokeWidth > 0 && !connector ? props.compound : null;
  // DrawingML default leaders intentionally extend beyond the text-body box.
  // The bleed is a FRACTION of the box, so a square box keeps exactly the
  // numbers this preview has always used and a wide one bleeds proportionally
  // instead of letterboxing the shape inside a square view.
  const bleed = (left: number, top: number, width: number, height: number) =>
    [left * boxWidth, top * boxHeight, width * boxWidth, height * boxHeight]
      .map((value) => Number(value.toFixed(4))).join(" ");
  // From the SHARED table, so a host that has to overlay something on the
  // shape (a sheet shape's text) can ask for the same inset without pulling
  // this component in (SHAPE-IMPORT-AUDIT.md §41).
  const box = kind.includes("callout")
    ? OFFICE_SHAPE_PREVIEW_VIEW_BOX.callout
    : OFFICE_SHAPE_PREVIEW_VIEW_BOX.default;
  const viewBox = bleed(box.left, box.top, box.width, box.height);
  // An outline is CENTRED on the geometry path (`a:ln@w` is the line width, half
  // of it on each side), so a preset that touches its own box paints half the
  // width OUTSIDE it. The outermost `<svg>` is `overflow: hidden` by UA default,
  // which cut a thick outline flat wherever the path met the view box; the bleed
  // below only covers a leader's overshoot, not the caller's line weight. Office
  // clips a shape's own outline nowhere, so neither do we -- the same thing the
  // Docs shape canvas and the slide's shape graphic already declare.
  return <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className={className} aria-hidden="true" overflow="visible"
    data-presentation-shape-preview={kind} data-presentation-preset-preview="true"
    data-presentation-connector-route={connector?.route}
    style={shadow ? { filter: "drop-shadow(4px 4px 3px rgba(15,23,42,.28))" } : undefined}>
    {fillGradient ? <defs><linearGradient id={`${instanceId}-fill`} {...gradientVector(officeGradientAngle(fillGradient))}>
      {officeGradientDrawnStops(fillGradient.stops).map(stop => <stop key={stop.position} offset={stop.position} stopColor={stop.color} />)}
    </linearGradient></defs> : null}
    {props.fillPattern && patternTile ? <defs>
      <pattern id={`${instanceId}-pattern`} patternUnits="userSpaceOnUse" width={patternTile.size} height={patternTile.size}
        patternTransform={[patternScale !== 1 ? `scale(${patternScale})` : "", patternTile.angle ? `rotate(${patternTile.angle})` : ""].filter(Boolean).join(" ") || undefined}>
        {patternTile.paperInMarks ? null : <rect x="0" y="0" width={patternTile.size} height={patternTile.size} fill={props.fillPattern.background} />}
        {patternTile.marks.map(({ tag, ...attrs }, index) => {
          if (tag === "circle") return <circle key={index} {...attrs} fill={props.fillPattern!.foreground} />;
          const { opacity, ...rest } = attrs as typeof attrs & { opacity?: number };
          return <rect key={index} {...rest} fill={("fill" in rest && rest.fill) || props.fillPattern!.foreground} fillOpacity={opacity} />;
        })}
      </pattern>
    </defs> : null}
    {props.strokeGradient ? <defs><linearGradient id={`${instanceId}-stroke`} {...gradientVector(officeGradientAngle(props.strokeGradient))}>
      {officeGradientDrawnStops(props.strokeGradient.stops).map(stop => <stop key={stop.position} offset={stop.position} stopColor={stop.color} />)}
    </linearGradient></defs> : null}
    {props.fillImage && pictureGeometry ? <defs>
      {/* The shared picture-fill pattern is in fractions of the box; the
          pattern transform scales it onto this view's box. */}
      <pattern id={`${instanceId}-image`} patternUnits="userSpaceOnUse"
        x={pictureGeometry.x} y={pictureGeometry.y} width={pictureGeometry.width} height={pictureGeometry.height}
        patternTransform={[`matrix(${boxWidth} 0 0 ${boxHeight} 0 0)`, pictureGeometry.transform].filter(Boolean).join(" ")}
        data-picture-fill={props.fillImageOptions?.tile ? "tile" : undefined}>
        {pictureGeometry.images.map((image, index) => (
          <image key={index} href={props.fillImage} x={image.x} y={image.y} width={image.width} height={image.height}
            transform={image.transform} opacity={pictureGeometry.opacity}
            preserveAspectRatio="none" data-office-shape-picture-fill="true" />
        ))}
      </pattern>
    </defs> : null}
    <OfficeLineEndMarkers id={markerId} head={headEnd} tail={tailEnd} stroke={stroke}
      lineWeight={props.lineEndsAtLineWeight && longerSidePx > 0 ? { px: strokeWidth, unitsPerPx: 100 / longerSidePx } : undefined} />
    {/* `a:ln@algn="in"`: the whole stroke belongs inside the geometry path
        (Office's `LineFormat.InsetPen`). SVG has no stroke-alignment, so the
        ink is doubled and clipped to the path -- the fill boundary does not
        move, which is why this is not "shrink the path". Only a subpath that
        encloses an area has an inside; an open route keeps centred ink. */}
    {isOfficeInsetStroke(props.strokeAlign) && strokeWidth > 0 && !connector ? <defs>
      {geometry.paths.map((path, index) => {
        const clipId = path.fill !== "none" && path.stroke
          ? officeStrokeAlignClipId(instanceId, props.strokeAlign, index) : null;
        return clipId ? <clipPath key={clipId} id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={path.d} />
        </clipPath> : null;
      })}
    </defs> : null}
    {/* DrawingML fills every path and THEN strokes every path, so a stroke-only
        path is an overlay however early it is declared. SVG paints in document
        order, which let chartPlus/chartStar/chartX cover their own marks with
        the frame declared after them. The partition is stable. */}
    {[...geometry.paths.filter(path => path.fill !== "none"),
      ...geometry.paths.filter(path => path.fill === "none")].map((path, index) => {
      // The drawn order is NOT `geometry.paths` order (fills are hoisted ahead
      // of stroke-only overlays), so the clip is keyed on the path's own index
      // in the geometry -- the same key `<defs>` above used.
      const clipId = !connector && path.fill !== "none" && path.stroke && strokeWidth > 0
        ? officeStrokeAlignClipId(instanceId, props.strokeAlign, geometry.paths.indexOf(path)) : null;
      // A compound line: the fill on its own, the stroke masked by layered
      // strokes of the same path (the table Word measured; the slide and
      // Word's canvas draw it the same way).
      if (compoundLayers && path.stroke && !clipId) {
        const pathIndex = geometry.paths.indexOf(path);
        const maskId = `${instanceId}-compound-${pathIndex}`;
        const insideId = `${maskId}-inside`;
        const layers = officeCompoundStrokeLayers(compoundLayers, path.fill !== "none");
        return <g key={index}>
          <defs>
            {layers.some(layer => layer.inside) ? <clipPath id={insideId} clipPathUnits="userSpaceOnUse"><path d={path.d} /></clipPath> : null}
            <mask id={maskId} maskUnits="userSpaceOnUse" x={-boxWidth} y={-boxHeight} width={boxWidth * 3} height={boxHeight * 3}>
              {layers.map((layer, layerIndex) => <path key={layerIndex} d={path.d} fill="none"
                stroke={layer.ink ? "white" : "black"} strokeWidth={Math.round(strokeWidth * layer.width * 1000) / 1000}
                strokeLinejoin={lineJoin} strokeMiterlimit={miterLimit}
                clipPath={layer.inside ? `url(#${insideId})` : undefined} vectorEffect="non-scaling-stroke" />)}
            </mask>
          </defs>
          <path d={path.d} fill={previewPathFill(paint, path.fill)} stroke="none" />
          <path d={path.d} fill="none" stroke={strokePaint} strokeWidth={strokeWidth} mask={`url(#${maskId})`}
            strokeDasharray={dashArray} strokeLinecap={dashCap} strokeLinejoin={lineJoin} strokeMiterlimit={miterLimit}
            vectorEffect="non-scaling-stroke" />
        </g>;
      }
      return <path key={index} d={path.d}
      fill={connector ? "none" : previewPathFill(paint, path.fill)}
      stroke={path.stroke || connector ? strokePaint : "none"}
      strokeWidth={clipId ? officeStrokeAlignPaintWidth(strokeWidth, props.strokeAlign) : strokeWidth}
      clipPath={clipId ? `url(#${clipId})` : undefined}
      strokeDasharray={dashArray}
      strokeLinejoin={lineJoin} strokeMiterlimit={miterLimit} strokeLinecap={connector ? "round" : dashCap}
      data-presentation-connector-route={connector?.route}
      data-presentation-connector-head={connector?.headEnd}
      data-presentation-connector-tail={connector?.tailEnd}
      vectorEffect="non-scaling-stroke" />;
    })}
    <OfficeLineEndCarriers id={markerId} paths={geometry.paths} head={headEnd} tail={tailEnd}
      strokeWidth={strokeWidth} />
  </svg>;
}
