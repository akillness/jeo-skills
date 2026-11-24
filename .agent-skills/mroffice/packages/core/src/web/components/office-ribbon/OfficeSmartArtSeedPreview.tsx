"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The ONE SmartArt preview every MRAI editor draws: the scene the shared engine
 * would insert, rendered as pure SVG.
 *
 * Preview IS insertion. The card a host shows in its gallery is built from the
 * same catalog seed and the same engine call the insert runs -- on the server
 * (`lib/office-smartart/remote-previews`; a gallery asks for its cards in one
 * request) -- so nothing about the picture is a separate drawing that can
 * drift from what lands in the document / slide / sheet. Until the scene
 * arrives the card draws its empty frame.
 *
 * Pure SVG on purpose: a `foreignObject` scene is scaled by the viewBox in
 * Chromium but drawn at 1:1 CSS pixels (and clipped) by WebKit, which is
 * exactly the blank-icon / one-giant-shape gallery the menu showed in Safari.
 * Nested `<svg x y width height>` viewports and `<text>` scale everywhere.
 *
 * A host may pass `renderShape` when it owns a richer shape renderer (the
 * Presentation canvas resolves native theme paint, gradients and pictures).
 * Without it the preset is drawn from the shared DrawingML default geometry, so
 * Docs and Spreadsheet need no host import at all.
 */

import { memo, useId, type ReactNode } from "react";

import {
  OfficeSmartArtBevelFilter,
  officeSmartArtBevelFilterRef,
  officeSmartArtNeedsShapeFilter,
} from "./OfficeSmartArtBevelFilter";
import {
  canonicalSmartArtKind,
  officeSmartArtAliasCardId,
  officeSmartArtSeed,
} from "../../lib/office-smartart/catalog";
import {
  DEFAULT_SMARTART_STYLE,
  type OfficeSmartArtNode,
  type OfficeSmartArtShapeNode,
  type SmartArtStyle,
  smartArtPictureDisplaySrc,
} from "../../lib/office-smartart/model";
import {
  smartArtPreviewNodes,
  useSmartArtPreview,
  type SmartArtPreviewSpec,
} from "../../lib/office-smartart/remote-previews";
import { nativePathFillColor } from "../../lib/native-drawing-geometry";
import { presentationPresetGeometryForKind } from "../../lib/presentation-authored-preset-geometry";
import type { ShapeKind } from "../../lib/presentation-shapes";

/** EMU per CSS pixel (96 dpi), the unit every preview viewBox is drawn in. */
const EMU_PER_CSS_PIXEL = 9525;

/** A 16:9 slide, the widest frame any host seeds; hosts pass their own. */
/** A gallery card's thinnest line, as a share of what the card frames. */
const CARD_STROKE_FLOOR = 0.005;

export const OFFICE_SMARTART_PREVIEW_BOUNDS = Object.freeze({
  width: 12_192_000,
  height: 6_858_000,
});

export interface OfficeSmartArtSeedPreviewProps {
  /** Any accepted id: canonical layout id, engine kind, or catalog alias. */
  layoutId: string;
  /** An aligned Office alias of that layout, drawn as itself (`hProcess9`). */
  layoutUrn?: string;
  /** Explicit labels; omitted, the catalog's own seed size is used. */
  items?: readonly string[];
  /** Explicit outline levels; omitted, the catalog's seed levels are used. */
  levels?: readonly number[];
  /** Placeholder label for the catalog seed (1-based item ordinal). */
  itemLabel?: (index: number) => string;
  /** Placeholder label for a layout whose first seed item is the tree root. */
  rootLabel?: string;
  bounds?: { width: number; height: number };
  style?: SmartArtStyle;
  /** Draw one shape node the host's own way instead of the shared preset. */
  renderShape?: (node: OfficeSmartArtShapeNode) => ReactNode;
  /**
   * The scene, when the caller already holds it (with ids of its own): drawn
   * as given, nothing is asked. `null` draws the empty frame. Omitted, the
   * scene is asked from the server.
   */
  nodes?: readonly OfficeSmartArtNode[] | null;
  /**
   * `"content"` frames the drawn diagram, not the slide or page it would be
   * inserted on: a gallery card is wider than a slide, and the frame's empty
   * margin only shrank the diagram and letterboxed it between grey bars.
   */
  fit?: "frame" | "content";
  /**
   * `"lines"` draws each label as a short bar in its own colour, the way a
   * gallery thumbnail shows text: at card size the words were 3-4 px of noise.
   */
  labels?: "text" | "lines";
}

/** Room around a content-fitted diagram, as a share of its longer side. */
const CONTENT_FIT_PAD = 0.06;

/** A label's drawn width, estimated: a CJK character is about 1 em wide. */
function labelWidth(line: string, fontPx: number): number {
  let ems = 0;
  for (const char of line) ems += /[⺀-鿿가-힯＀-￯]/.test(char) ? 1 : 0.56;
  return ems * fontPx;
}

/**
 * Where a shape's drawing reaches inside its box, in CSS px from its corner:
 * its preset paths' points, or the whole box when the preset cannot be
 * read; `undefined` for a shape that draws nothing.
 */
/** Points along an SVG elliptical arc (SVG 1.1 F.6.5, end point to centre). */
function arcSamples(
  from: readonly [number, number],
  rxIn: number,
  ryIn: number,
  rotationDegrees: number,
  large: boolean,
  sweep: boolean,
  to: readonly [number, number],
): [number, number][] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry) return [[to[0], to[1]]];
  const phi = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / (denominator || 1)));
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const value = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return value;
  };
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const points: [number, number][] = [];
  for (let step = 0; step <= 16; step += 1) {
    const t = theta + (delta * step) / 16;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    points.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return points;
}

function previewShapeExtent(node: OfficeSmartArtShapeNode): { x: number; y: number; w: number; h: number } | null | undefined {
  const w = Math.max(Number(node.width) / EMU_PER_CSS_PIXEL, 0.01);
  const h = Math.max(Number(node.height) / EMU_PER_CSS_PIXEL, 0.01);
  const fills = node.fill && node.fill !== "none";
  const strokes = node.stroke && node.stroke !== "none" && (node.strokeWidth ?? 0) > 0;
  if (!fills && !strokes) return undefined;
  if (node.customPath) return null;
  const geometry = presentationPresetGeometryForKind(node.shape as ShapeKind, w, h, node.adjustments ?? null);
  if (!geometry) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const path of geometry.paths) {
    if (!fills && !path.stroke) continue;
    // Each command's points, and an arc (`A rx ry rot large sweep x y`) along
    // its sweep: measured by its end points alone, the top of Reverse List's
    // arrows and Circle Arrow Process's last ring fell outside the card.
    let current: [number, number] = [0, 0];
    let start: [number, number] = [0, 0];
    for (const [, op, body] of path.d.matchAll(/([MLQCAZ])([^MLQCAZ]*)/gi)) {
      const numbers = (body.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
      const command = op.toUpperCase();
      if (command === "Z") {
        current = start;
        continue;
      }
      if (command === "A") {
        for (let at = 0; at + 6 < numbers.length; at += 7) {
          const end: [number, number] = [numbers[at + 5], numbers[at + 6]];
          for (const [x, y] of arcSamples(current, numbers[at], numbers[at + 1], numbers[at + 2], numbers[at + 3] !== 0, numbers[at + 4] !== 0, end)) take(x, y);
          current = end;
        }
        continue;
      }
      for (let at = 0; at + 1 < numbers.length; at += 2) take(numbers[at], numbers[at + 1]);
      if (numbers.length >= 2) current = [numbers[numbers.length - 2], numbers[numbers.length - 1]];
      if (command === "M") start = current;
    }
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Whether a label colour reads as dark (words on the page, not on a shape). */
function smartArtPreviewIsDark(colour: string | undefined): boolean {
  const hex = /^#?([0-9a-f]{6})$/i.exec(colour ?? "")?.[1];
  if (!hex) return true;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/**
 * The shared preset drawing: DrawingML's own default geometry for the preset,
 * evaluated at the node's exact rect so a wide box stays a wide box (a preview
 * component with a fixed square viewBox would letterbox every node).
 */
export function OfficeSmartArtPresetGraphic({
  node,
  width,
  height,
  strokeFloor,
}: {
  node: OfficeSmartArtShapeNode;
  width: number;
  height: number;
  /**
   * Draw lines to the diagram's scale, no thinner than this (in the
   * diagram's units): a gallery card shrinks a slide-sized diagram some ten
   * times, and its lines held at screen width came out heavier than the
   * shapes they outline (Hierarchy List's boxes, Nondirectional Cycle's
   * arcs), where PowerPoint's icons draw them hairline.
   */
  strokeFloor?: number;
}) {
  // The quick style's bevel, as the inner rim PowerPoint draws. It lives here,
  // on the ONE shared preset drawing, so every static SVG surface that uses it
  // — the seed previews, the style tiles, the export preview, any host with no
  // renderer of its own — gets the same rim as the slide canvas.
  const rimId = officeSmartArtNeedsShapeFilter(node.shape3d, node.scene3d)
    ? `smartart-rim-${node.id}`
    : null;
  const fill = node.fill ?? "none";
  const stroke = node.stroke ?? "none";
  const ownStroke = node.strokeWidth ?? 0;
  const strokeWidth = strokeFloor === undefined || ownStroke <= 0 ? ownStroke : Math.max(ownStroke, strokeFloor);
  const opacity =
    typeof node.opacity === "number"
      ? Math.max(0, Math.min(1, node.opacity / 100))
      : undefined;
  const common = {
    stroke: stroke === "none" ? "none" : stroke,
    strokeWidth,
    strokeLinejoin: "round" as const,
    ...(strokeFloor === undefined ? { vectorEffect: "non-scaling-stroke" as const } : {}),
    ...(opacity === undefined ? {} : { fillOpacity: opacity }),
  };
  /** Wrap the drawn geometry so the rim clips to its real silhouette. */
  const rimmed = (drawn: ReactNode): ReactNode =>
    rimId && node.shape3d ? (
      <>
        <defs>
          <OfficeSmartArtBevelFilter
            id={rimId}
            shape3d={node.shape3d}
            scene3d={node.scene3d}
          />
        </defs>
        <g filter={officeSmartArtBevelFilterRef(rimId)}>{drawn}</g>
      </>
    ) : (
      drawn
    );
  const custom = node.customPath;
  if (custom) {
    const point = (x: number, y: number) =>
      `${(x / 100_000) * width} ${(y / 100_000) * height}`;
    const d = custom.commands
      .map(
        (command, index) =>
          `${index === 0 || command.type === "moveTo" ? "M" : "L"}${point(command.x, command.y)}`,
      )
      .join(" ");
    return rimmed(
      <path d={`${d}${custom.closed ? " Z" : ""}`} fill={fill} {...common} />,
    );
  }
  // At the adjust values the layout states (Circle Arrow Process's rings,
  // a Process arrow's shaft): the defaults drew thin, broken rings.
  const geometry = presentationPresetGeometryForKind(
    node.shape as ShapeKind,
    Math.max(width, 0.01),
    Math.max(height, 0.01),
    node.adjustments ?? null,
  );
  if (!geometry) {
    return rimmed(
      <rect x={0} y={0} width={width} height={height} fill={fill} {...common} />,
    );
  }
  return rimmed(
    <>
      {geometry.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={nativePathFillColor(fill, path.fill)}
          {...common}
          stroke={path.stroke ? common.stroke : "none"}
        />
      ))}
    </>,
  );
}

/**
 * The served preview a seed card asks the engine for -- the catalog's seed
 * (or the given items) laid out in `bounds`. One builder, so a gallery that
 * asks ahead (`prefetchOfficeSmartArtSeedPreviews`) asks for exactly what its
 * cards will, and they are drawn the moment they mount.
 */
export function officeSmartArtSeedPreviewSpec({
  layoutId,
  layoutUrn,
  items,
  levels,
  itemLabel,
  rootLabel,
  bounds = OFFICE_SMARTART_PREVIEW_BOUNDS,
  style = DEFAULT_SMARTART_STYLE,
}: Pick<
  OfficeSmartArtSeedPreviewProps,
  "layoutId" | "layoutUrn" | "items" | "levels" | "itemLabel" | "rootLabel" | "bounds" | "style"
>): SmartArtPreviewSpec | null {
  const kind = canonicalSmartArtKind(layoutId);
  if (!kind) return null;
  const seed =
    items === undefined
      ? officeSmartArtSeed(
          // An alias drawn as itself seeds its own sample, as its insert does.
          officeSmartArtAliasCardId(layoutId, layoutUrn) ?? layoutId,
          itemLabel ?? ((index) => `${index}`),
          rootLabel ?? itemLabel?.(1) ?? "1",
        )
      : null;
  const labels = items ? [...items] : (seed?.items ?? []);
  const outlineLevels = levels ?? seed?.levels;
  return {
    kind,
    items: labels,
    ...(outlineLevels ? { levels: [...outlineLevels] } : {}),
    // The organization charts' sample assistant, drawn as Office's gallery does.
    ...(seed?.assistants ? { assistants: [...seed.assistants] } : {}),
    bounds: { width: bounds.width, height: bounds.height },
    style,
    ...(layoutUrn ? { layoutUrn } : {}),
  };
}

/** Ask the engine for seed previews ahead of the gallery that draws them. */
export function prefetchOfficeSmartArtSeedPreviews(
  cards: readonly Parameters<typeof officeSmartArtSeedPreviewSpec>[0][],
): void {
  for (const card of cards) smartArtPreviewNodes(officeSmartArtSeedPreviewSpec(card));
}

function OfficeSmartArtSeedPreviewScene({
  layoutId,
  layoutUrn,
  items,
  levels,
  itemLabel,
  rootLabel,
  bounds = OFFICE_SMARTART_PREVIEW_BOUNDS,
  style = DEFAULT_SMARTART_STYLE,
  renderShape,
  nodes: storedNodes,
  fit = "frame",
  labels = "text",
}: OfficeSmartArtSeedPreviewProps) {
  const prefix = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const kind = canonicalSmartArtKind(layoutId);
  // A caller that holds its scene (a legacy Docs block's stored drawing)
  // draws it as given and asks nothing.
  const served = useSmartArtPreview(
    storedNodes === undefined
      ? officeSmartArtSeedPreviewSpec({ layoutId, layoutUrn, items, levels, itemLabel, rootLabel, bounds, style })
      : null,
    prefix,
  );
  const drawn = storedNodes === undefined ? served : storedNodes;
  const blocks: readonly OfficeSmartArtNode[] = drawn ?? [];
  const width = bounds.width / EMU_PER_CSS_PIXEL;
  const height = bounds.height / EMU_PER_CSS_PIXEL;
  let viewBox = `0 0 ${width} ${height}`;
  // The card's own scale: what a text line is drawn at on every card alike.
  let viewSide = Math.min(width, height);
  const fitted = fit === "content" && blocks.length > 0;
  if (fitted) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const block of blocks) {
      const x = Number(block.left) / EMU_PER_CSS_PIXEL;
      const y = Number(block.top) / EMU_PER_CSS_PIXEL;
      // What is drawn, not the box: an arc of a large circle (Vertical
      // Curved List's spine) stands in a box many times its stroke, and the
      // card framed that box, the diagram small and off to one side. An
      // undrawn shape (no fill, no line) frames nothing.
      const drawn = block.type === "shape" ? previewShapeExtent(block) : null;
      if (block.type === "shape" && drawn === undefined) continue;
      const box = drawn ?? { x: 0, y: 0, w: Number(block.width) / EMU_PER_CSS_PIXEL, h: Number(block.height) / EMU_PER_CSS_PIXEL };
      if (block.rotation) {
        // Turned about its centre: the box its turned outline covers
        // (Vertical Block List's tabs, a 0.2-wide box stood on end).
        const bw = Number(block.width) / EMU_PER_CSS_PIXEL;
        const bh = Number(block.height) / EMU_PER_CSS_PIXEL;
        const turn = (Number(block.rotation) * Math.PI) / 180;
        const cos = Math.abs(Math.cos(turn));
        const sin = Math.abs(Math.sin(turn));
        const cx = x + bw / 2;
        const cy = y + bh / 2;
        const halfW = (box.w * cos + box.h * sin) / 2;
        const halfH = (box.w * sin + box.h * cos) / 2;
        const ox = (box.x + box.w / 2 - bw / 2) * Math.cos(turn) - (box.y + box.h / 2 - bh / 2) * Math.sin(turn);
        const oy = (box.x + box.w / 2 - bw / 2) * Math.sin(turn) + (box.y + box.h / 2 - bh / 2) * Math.cos(turn);
        minX = Math.min(minX, cx + ox - halfW);
        minY = Math.min(minY, cy + oy - halfH);
        maxX = Math.max(maxX, cx + ox + halfW);
        maxY = Math.max(maxY, cy + oy + halfH);
        continue;
      }
      minX = Math.min(minX, x + box.x);
      minY = Math.min(minY, y + box.y);
      maxX = Math.max(maxX, x + box.x + box.w);
      maxY = Math.max(maxY, y + box.y + box.h);
    }
    if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
      const pad = Math.max(maxX - minX, maxY - minY) * CONTENT_FIT_PAD;
      viewBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
      viewSide = Math.max(maxX - minX, maxY - minY) + pad * 2;
    }
  }
  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      aria-hidden="true"
      data-smartart-seed={kind ?? undefined}
      data-smartart-preview-fit={fit === "content" ? "content" : undefined}
      data-smartart-preview-pending={kind && !drawn ? "true" : undefined}
    >
      {/* A content-fitted card sits on its own surface; a frame is the page. */}
      {fitted ? null : <rect width={width} height={height} fill="white" />}
      {kind && !drawn ? (
        // Still on its way from the engine: a quiet outline of a diagram,
        // not a blank card (a gallery under load showed eight white tiles).
        <g fill="#e6e8eb">
          {[0.08, 0.38, 0.68].map((at) => (
            <rect key={at} x={width * at} y={height * 0.3} width={width * 0.24} height={height * 0.4} rx={Math.min(width, height) * 0.05} />
          ))}
        </g>
      ) : null}
      {[...blocks]
        .sort((a, b) => Number(a.zIndex ?? 0) - Number(b.zIndex ?? 0))
        .map((block) => {
          const x = Number(block.left) / EMU_PER_CSS_PIXEL;
          const y = Number(block.top) / EMU_PER_CSS_PIXEL;
          const w = Math.max(Number(block.width) / EMU_PER_CSS_PIXEL, 0.01);
          const h = Math.max(Number(block.height) / EMU_PER_CSS_PIXEL, 0.01);
          const transform = block.rotation
            ? `rotate(${block.rotation} ${x + w / 2} ${y + h / 2})`
            : undefined;
          if (block.type === "shape") {
            // Turned by a group around it: WebKit ignores `transform` on a
            // nested `<svg>`, so Safari drew every turned shape upright (Step
            // Up's corners, Vertical Chevron List's tabs).
            return (
              <g key={block.id} data-smartart-preview-role={block.smartArtRole} transform={transform}>
                <svg
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  viewBox={`0 0 ${w} ${h}`}
                  overflow="visible"
                >
                  {renderShape?.(block) ?? (
                    <OfficeSmartArtPresetGraphic
                      node={block}
                      width={w}
                      height={h}
                      {...(fitted ? { strokeFloor: viewSide * CARD_STROKE_FLOOR } : {})}
                    />
                  )}
                </svg>
              </g>
            );
          }
          if (block.type === "image") {
            // The picture slot as the slide draws it: in the layout's own
            // slot colour with its icon, and round where the layout clips
            // the picture to a circle (Circular Picture Callout), not the
            // stand-in landscape in a square.
            const slot = block as typeof block & { clipShape?: string; smartArtSlotFill?: string };
            const clipId = slot.clipShape === "ellipse" ? `${prefix}-clip-${block.id}` : undefined;
            return (
              <g key={block.id} data-smartart-preview-role={block.smartArtRole} transform={transform}>
                {clipId ? (
                  <defs>
                    <clipPath id={clipId}>
                      <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
                    </clipPath>
                  </defs>
                ) : null}
                <image
                  href={smartArtPictureDisplaySrc(block.src, slot.smartArtSlotFill)}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={clipId ? `url(#${clipId})` : undefined}
                />
              </g>
            );
          }
          const fontPx =
            ((block.style?.fontSize ?? style.fontSize) * 96) / 72;
          const lines = String(block.text ?? "").split("\n");
          const lineHeight = fontPx * 1.6;
          const firstBaseline =
            y + h / 2 - ((lines.length - 1) * lineHeight) / 2 + fontPx * 0.35;
          if (labels === "lines") {
            // A gallery card shows words as thin lines, the way Office's own
            // thumbnails do: one weight on every card (a layout's 65 pt drew
            // fat pills, its 14 pt captions hairlines), light on a filled
            // shape and a soft grey where the words stand on the page (dark
            // captions were heavy black dashes), each line a little shorter
            // than the one before, and a sub-item a dot and a line.
            const stroke = Math.max(viewSide * 0.022, Math.min(fontPx * 0.24, viewSide * 0.034));
            const pitch = Math.max(stroke * 2.4, Math.min(lineHeight, stroke * 3.4));
            const colour = block.style?.color ?? style.textColor;
            const dark = smartArtPreviewIsDark(colour);
            const paint = dark ? "#868f9b" : colour;
            const rows = lines.map((line) => line.replace(/^\s+/, "")).filter((line) => line.trim().length > 0);
            if (!rows.length) return null;
            const bulleted = (block as { paragraphs?: Array<{ level?: number }> }).paragraphs?.some((p) => (p.level ?? 0) > 0) ?? false;
            const top = y + h / 2 - ((rows.length - 1) * pitch) / 2;
            const align = (block.style as { align?: string } | undefined)?.align;
            return (
              <g
                key={block.id}
                data-smartart-preview-role={block.smartArtRole}
                fill={paint}
                fillOpacity={dark ? 1 : 0.92}
                transform={transform}
              >
                {rows.map((line, index) => {
                  const natural = labelWidth(line.trim(), fontPx);
                  const room = w * (bulleted ? 0.62 : 0.7);
                  const barWidth = Math.max(Math.min(natural, room) * (1 - index * 0.12), Math.min(room, stroke * 4));
                  const centre = top + index * pitch;
                  const left =
                    bulleted || align === "left"
                      ? x + w * 0.12 + (bulleted ? stroke * 1.6 : 0)
                      : align === "right"
                        ? x + w * 0.88 - barWidth
                        : x + w / 2 - barWidth / 2;
                  return (
                    <g key={index}>
                      {bulleted ? <circle cx={left - stroke * 1.1} cy={centre} r={stroke * 0.42} /> : null}
                      <rect x={left} y={centre - stroke / 2} width={barWidth} height={stroke} rx={stroke / 2} />
                    </g>
                  );
                })}
              </g>
            );
          }
          return (
            <text
              key={block.id}
              data-smartart-preview-role={block.smartArtRole}
              x={x + w / 2}
              y={firstBaseline}
              textAnchor="middle"
              fontSize={fontPx}
              fontWeight={block.style?.bold ? 700 : 400}
              fill={block.style?.color ?? style.textColor}
              transform={transform}
            >
              {lines.map((line, index) => (
                <tspan key={index} x={x + w / 2} dy={index === 0 ? 0 : lineHeight}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
    </svg>
  );
}


function sameList<T>(a: readonly T[] | undefined | null, b: readonly T[] | undefined | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}






function sameSeedPreview(a: OfficeSmartArtSeedPreviewProps, b: OfficeSmartArtSeedPreviewProps): boolean {
  return (
    a.layoutId === b.layoutId &&
    a.layoutUrn === b.layoutUrn &&
    sameList(a.items, b.items) &&
    sameList(a.levels, b.levels) &&
    a.itemLabel === b.itemLabel &&
    a.rootLabel === b.rootLabel &&
    (a.bounds === b.bounds || (a.bounds?.width === b.bounds?.width && a.bounds?.height === b.bounds?.height)) &&
    a.style === b.style &&
    a.renderShape === b.renderShape &&
    a.nodes === b.nodes &&
    a.fit === b.fit &&
    a.labels === b.labels
  );
}

export const OfficeSmartArtSeedPreview = memo(OfficeSmartArtSeedPreviewScene, sameSeedPreview);
