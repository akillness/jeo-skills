/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Picture Format tab's drawing of a PDF picture (lib/pdf/picture-format):
 * the picture's pixels through Office's adjustments, then the picture style,
 * border and shape drawn by the one renderer every editor's canvas uses
 * (OfficePictureStyleGraphic), rasterised as an SVG document -- the same
 * drawing Docs shows, made pixels the PDF can hold and export. A style's
 * shadow, reflection or a border reaches past the picture: the result says by
 * how much, and the caller grows the picture's frame by it in the same step.
 */

import { createElement } from "react";

import { OfficePictureStyleGraphic } from "@mrnote/core/web/components/office-ribbon/OfficePictureStyleGraphic.tsx";
import { officePictureGeometryPath } from "@mrnote/core/web/lib/office-picture-geometry.ts";
import {
  nativePictureStyle,
  officePictureStyleEffectKinds,
  type NativePictureStyle,
  type OfficePictureStyleOutline,
} from "@mrnote/core/web/lib/office-picture-styles/native.ts";
import {
  pdfPictureAdjustSvg,
  pdfPictureFormatAdjusts,
  pdfPictureFormatFrames,
  type PdfPictureFormat,
} from "../../../../../lib/pdf/picture-format";

/** CSS pixels per point: the effects measure as they do on screen at 100%. */
const PX_PER_PT = 96 / 72;
/** The most pixels a formatted picture is drawn at (memory and write size). */
const MAX_OUTPUT_PIXELS = 12_000_000;
/** EMU per point, the outline's unit. */
const EMU_PER_PT = 12_700;

export type PdfPictureFormatExtent = Readonly<{
  /** How far the drawing reaches past the picture, in points. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export const PDF_PICTURE_NO_EXTENT: PdfPictureFormatExtent = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 });

export type PdfPictureFormatRender = Readonly<{
  canvas: HTMLCanvasElement;
  /** The drawing past the picture's own rectangle (zero without a frame). */
  extent: PdfPictureFormatExtent;
}>;

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** An SVG document drawn into a canvas of its own pixel size. */
async function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = canvasOf(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A frame the shared renderer draws when the picture has no style: the
 * rectangle, no line, no effects (a border or a shape is drawn over it). */
const PLAIN_STYLE = Object.freeze({
  id: "plain",
  geometry: "rect",
  adjustments: {},
  outlineIdentity: null,
}) as unknown as NativePictureStyle;

/** The tightest box of the canvas' visible pixels, or null if none. */
function inkBounds(canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] > 2) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Draw `source` (the picture as it was before any format) with `format`, the
 * picture `widthPt` x `heightPt` on the page. Null when the drawing failed
 * (the browser would not draw the SVG): the caller writes nothing.
 */
export async function renderPdfPictureFormat(input: Readonly<{
  source: HTMLCanvasElement;
  widthPt: number;
  heightPt: number;
  format: PdfPictureFormat;
}>): Promise<PdfPictureFormatRender | null> {
  const { source, format } = input;
  const viewWidth = Math.max(1, Math.abs(input.widthPt) * PX_PER_PT);
  const viewHeight = Math.max(1, Math.abs(input.heightPt) * PX_PER_PT);
  try {
    let picture = source;
    if (pdfPictureFormatAdjusts(format)) {
      const svg = pdfPictureAdjustSvg({
        href: source.toDataURL("image/png"),
        width: source.width,
        height: source.height,
        viewWidth,
        viewHeight,
        format,
      });
      if (svg) picture = await rasterizeSvg(svg, source.width, source.height);
    }
    if (!pdfPictureFormatFrames(format)) {
      return Object.freeze({ canvas: picture, extent: PDF_PICTURE_NO_EXTENT });
    }

    const style = format.style ? nativePictureStyle(format.style) : null;
    const outline: OfficePictureStyleOutline | null =
      format.border === "none"
        ? "none"
        : format.border
          ? { widthEmu: Math.round(format.border.widthPt * EMU_PER_PT), color: format.border.color, dash: format.border.dash }
          : null;
    const geometryPath = format.shape
      ? officePictureGeometryPath(format.shape, null, viewWidth, viewHeight)
      : null;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const markup = renderToStaticMarkup(
      createElement(OfficePictureStyleGraphic, {
        styleId: style ? style.id : null,
        styleData: style ? null : PLAIN_STYLE,
        src: picture.toDataURL("image/png"),
        widthPx: viewWidth,
        heightPx: viewHeight,
        outline,
        geometryPath,
        decorative: true,
      }),
    );
    const svgStart = markup.indexOf("<svg");
    const svgEnd = markup.lastIndexOf("</svg>");
    if (svgStart < 0 || svgEnd < 0) return null;
    // Room for what the style draws past the picture: its shadow and outline
    // on every side, its reflection below.
    const kinds = style ? officePictureStyleEffectKinds(style.id) : new Set<string>();
    const margin = Math.max(viewWidth, viewHeight) * 0.35 + (format.border && format.border !== "none" ? format.border.widthPt * PX_PER_PT : 0);
    const below = kinds.has("reflection") ? viewHeight + margin : margin;
    const box = { x: -margin, y: -margin, width: viewWidth + margin * 2, height: viewHeight + margin + below };
    // Pixels per view unit: the picture's own resolution, within the cap.
    let scale = Math.max(source.width / viewWidth, source.height / viewHeight, 1);
    if (box.width * box.height * scale * scale > MAX_OUTPUT_PIXELS) {
      scale = Math.sqrt(MAX_OUTPUT_PIXELS / (box.width * box.height));
    }
    const pixelWidth = Math.ceil(box.width * scale);
    const pixelHeight = Math.ceil(box.height * scale);
    const inner = markup
      .slice(svgStart, svgEnd + "</svg>".length)
      // The renderer's own root attributes give way to a standalone document's.
      .replace(/^<svg[^>]*>/, (open) => {
        const kept = open
          .replace(/\s(viewBox|width|height|style|overflow|role|aria-label|data-testid)="[^"]*"/g, "")
          .replace(/^<svg/, "");
        return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pixelWidth}" height="${pixelHeight}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" overflow="visible"${kept}`;
      });
    const drawn = await rasterizeSvg(inner, pixelWidth, pixelHeight);
    const ink = inkBounds(drawn);
    if (!ink) return null;
    // The picture's own rectangle, in the drawing's pixels.
    const pictureLeft = (0 - box.x) * scale;
    const pictureTop = (0 - box.y) * scale;
    const pictureRight = pictureLeft + viewWidth * scale;
    const pictureBottom = pictureTop + viewHeight * scale;
    // The kept box: the ink, and never less than the picture (a shape that
    // leaves a corner empty keeps the frame where it was).
    const left = Math.min(ink.x, pictureLeft);
    const top = Math.min(ink.y, pictureTop);
    const right = Math.max(ink.x + ink.width, pictureRight);
    const bottom = Math.max(ink.y + ink.height, pictureBottom);
    const kept = canvasOf(right - left, bottom - top);
    kept.getContext("2d")?.drawImage(drawn, -Math.round(left), -Math.round(top));
    const toPoints = (pixels: number) => Math.max(0, pixels / scale / PX_PER_PT);
    return Object.freeze({
      canvas: kept,
      extent: Object.freeze({
        left: toPoints(pictureLeft - Math.round(left)),
        top: toPoints(pictureTop - Math.round(top)),
        right: toPoints(Math.round(right) - pictureRight),
        bottom: toPoints(Math.round(bottom) - pictureBottom),
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[pdf-picture] format drawing failed", error);
    }
    return null;
  }
}
