/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * WPS 擦除: what an erase rectangle holds, read from the page as the reader
 * shows it. Text items and pictures it holds whole are taken off the page by
 * the host's native writers; anything else inside -- vector art, a picture or
 * an item the rectangle only cuts -- is covered, and the reader says so.
 */
import type { PdfEraseRect, PdfEraseTargets, PdfEraseTextTarget } from "../../../../../lib/pdf/page-erase";

import type { PdfNativeImageTarget } from "./nativeImageTarget";
import type { PdfPage } from "./pdfApi";

/** How far past the rectangle an object may stand and still count as
 * inside it (page percent): a hand-drawn rectangle rarely clears a glyph's
 * edge exactly. */
const INSIDE_TOLERANCE_PERCENT = 0.6;
/** A pixel this far from white in any channel is ink. */
const INK_THRESHOLD = 24;
/** Pixels read for the ink check: plenty to find a stroke or a fill. */
const MAX_INK_SAMPLES = 160_000;

type PercentBox = Readonly<{ x1: number; y1: number; x2: number; y2: number }>;

function boxOf(points: readonly (readonly [number, number])[]): PercentBox {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

function holds(rect: PdfEraseRect, box: PercentBox): boolean {
  return (
    box.x1 >= rect.x1 - INSIDE_TOLERANCE_PERCENT &&
    box.y1 >= rect.y1 - INSIDE_TOLERANCE_PERCENT &&
    box.x2 <= rect.x2 + INSIDE_TOLERANCE_PERCENT &&
    box.y2 <= rect.y2 + INSIDE_TOLERANCE_PERCENT
  );
}

function meets(rect: PdfEraseRect, box: PercentBox): boolean {
  return box.x1 < rect.x2 && box.x2 > rect.x1 && box.y1 < rect.y2 && box.y2 > rect.y1;
}

/**
 * The reader's text items on a page with the box each one's glyphs fill
 * (page percent, as displayed): `core` from just below the baseline to the
 * cap height decides whether the rectangle holds the item; `ink` reaches the
 * descenders and accents, and is what the ink check leaves out once the item
 * is taken away.
 */
async function readTextBoxes(
  page: PdfPage,
  rotation: number,
): Promise<readonly Readonly<{ target: PdfEraseTextTarget; core: PercentBox; ink: PercentBox }>[]> {
  const viewport = page.getViewport({ scale: 1, rotation });
  const content = await page.getTextContent();
  const boxes: { target: PdfEraseTextTarget; core: PercentBox; ink: PercentBox }[] = [];
  for (const entry of content.items) {
    if (!("str" in entry) || !entry.str.trim()) continue;
    const [a, b, c, d, e, f] = entry.transform.map(Number);
    const along = Math.hypot(a, b);
    const up = Math.hypot(c, d);
    const width = Number(entry.width);
    const height = Number(entry.height) > 0 ? Number(entry.height) : up;
    if (!(along > 0) || !(up > 0) || !Number.isFinite(width) || !(height > 0)) continue;
    const ux = a / along;
    const uy = b / along;
    const vx = c / up;
    const vy = d / up;
    const corners = (low: number, high: number) =>
      [
        [e + vx * low * height, f + vy * low * height],
        [e + ux * width + vx * low * height, f + uy * width + vy * low * height],
        [e + ux * width + vx * high * height, f + uy * width + vy * high * height],
        [e + vx * high * height, f + vy * high * height],
      ].map(([x, y]) => {
        const [px, py] = viewport.convertToViewportPoint(x, y);
        return [(px / viewport.width) * 100, (py / viewport.height) * 100] as const;
      });
    boxes.push({
      target: { str: entry.str, x: e, y: f },
      core: boxOf(corners(-0.05, 0.72)),
      ink: boxOf(corners(-0.32, 1.05)),
    });
  }
  return boxes;
}

/** Whether the page shows ink inside `rect` outside every `cleared` box: a
 * stroke, a fill or a picture the erase does not take away. */
function inkOutside(
  canvas: HTMLCanvasElement | null,
  rect: PdfEraseRect,
  cleared: readonly PercentBox[],
): boolean | null {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
  const left = Math.max(0, Math.floor((rect.x1 / 100) * canvas.width));
  const top = Math.max(0, Math.floor((rect.y1 / 100) * canvas.height));
  const right = Math.min(canvas.width, Math.max(left + 1, Math.ceil((rect.x2 / 100) * canvas.width)));
  const bottom = Math.min(canvas.height, Math.max(top + 1, Math.ceil((rect.y2 / 100) * canvas.height)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  let pixels: Uint8ClampedArray;
  try {
    const context = canvas.getContext("2d");
    if (!context) return null;
    pixels = context.getImageData(left, top, width, height).data;
  } catch {
    return null;
  }
  const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_INK_SAMPLES)));
  for (let y = 0; y < height; y += stride) {
    const py = ((top + y + 0.5) / canvas.height) * 100;
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] < 128) continue;
      if (
        255 - pixels[offset] <= INK_THRESHOLD &&
        255 - pixels[offset + 1] <= INK_THRESHOLD &&
        255 - pixels[offset + 2] <= INK_THRESHOLD
      ) {
        continue;
      }
      const px = ((left + x + 0.5) / canvas.width) * 100;
      if (cleared.some((box) => px >= box.x1 && px <= box.x2 && py >= box.y1 && py <= box.y2)) continue;
      return true;
    }
  }
  return false;
}

/**
 * What one erase rectangle takes off the page and whether it also has to
 * cover something. A page whose pixels cannot be read is covered whole (the
 * cover is the safe answer).
 */
export async function readPdfEraseTargets(input: {
  readonly page: PdfPage;
  /** The rotation the page is shown at. */
  readonly rotation: number;
  readonly rect: PdfEraseRect;
  readonly canvas: HTMLCanvasElement | null;
  /** The page's painted pictures, when the reader has read them. */
  readonly images: readonly PdfNativeImageTarget[] | undefined;
}): Promise<PdfEraseTargets> {
  const { rect } = input;
  const textItems: PdfEraseTextTarget[] = [];
  const cleared: PercentBox[] = [];
  let cover = false;
  for (const box of await readTextBoxes(input.page, input.rotation)) {
    if (!meets(rect, box.ink)) continue;
    if (holds(rect, box.core)) {
      textItems.push(box.target);
      cleared.push(box.ink);
    } else if (meets(rect, box.core)) {
      cover = true;
    }
  }
  const imageOrders: number[] = [];
  const imageMatrices: Record<number, readonly number[]> = {};
  for (const image of input.images ?? []) {
    const box: PercentBox = {
      x1: image.bounds.x * 100,
      y1: image.bounds.y * 100,
      x2: (image.bounds.x + image.bounds.width) * 100,
      y2: (image.bounds.y + image.bounds.height) * 100,
    };
    if (!meets(rect, box)) continue;
    if (holds(rect, box)) {
      imageOrders.push(image.order);
      if (image.matrix) imageMatrices[image.order] = Object.freeze([...image.matrix]);
      cleared.push(box);
    } else {
      cover = true;
    }
  }
  if (!cover) {
    const ink = inkOutside(input.canvas, rect, cleared);
    cover = ink !== false;
  }
  return Object.freeze({
    textItems: Object.freeze(textItems),
    imageOrders: Object.freeze([...new Set(imageOrders)].sort((left, right) => left - right)),
    imageMatrices: Object.freeze(imageMatrices),
    cover,
  });
}
