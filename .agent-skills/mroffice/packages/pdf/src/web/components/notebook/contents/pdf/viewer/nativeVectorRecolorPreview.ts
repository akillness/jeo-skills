/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
type Rgb01 = Readonly<{ r: number; g: number; b: number }>;
type Fractions = Readonly<{ x: number; y: number; width: number; height: number }>;

/** How far (sum of channel differences, 0-765) a pixel may stand from the
 * old colour and still be it: the page's antialiasing and colour management
 * shift a flat fill by a few levels. */
const SAME_COLOUR_DISTANCE = 36;

/** The canvas the page shows now: the topmost visible one that covers it. */
function shownPageCanvas(page: HTMLElement): HTMLCanvasElement | null {
  const canvases = Array.from(page.querySelectorAll<HTMLCanvasElement>("canvas"))
    .filter((canvas) => canvas.width > 0 && canvas.height > 0 &&
      !canvas.hasAttribute("data-pdf-native-vector-recolor-preview") &&
      // A photo shown in its colours over the dark mode is a piece, not the page.
      !canvas.hasAttribute("data-pdf-read-mode-photo") &&
      getComputedStyle(canvas).visibility !== "hidden" && canvas.getBoundingClientRect().width > 0);
  const pageWidth = page.getBoundingClientRect().width;
  return canvases.filter((canvas) => canvas.getBoundingClientRect().width >= pageWidth * 0.95).at(-1) ?? null;
}

/**
 * Lays the recoloured pixels of `bounds` (page fractions) over the page.
 * Returns how to take them off; null when nothing could be shown (no page
 * canvas, a canvas the page cannot read, no pixel of the old colour).
 */
export function showNativeVectorRecolorPreview(
  page: HTMLElement,
  bounds: Fractions,
  from: Rgb01,
  to: Rgb01,
): (() => void) | null {
  const source = shownPageCanvas(page);
  const host = source?.parentElement;
  if (!source || !host) return null;
  const pad = 3;
  const left = Math.max(0, Math.floor(bounds.x * source.width) - pad);
  const top = Math.max(0, Math.floor(bounds.y * source.height) - pad);
  const right = Math.min(source.width, Math.ceil((bounds.x + bounds.width) * source.width) + pad);
  const bottom = Math.min(source.height, Math.ceil((bounds.y + bounds.height) * source.height) + pad);
  if (!(right > left && bottom > top)) return null;
  const overlay = source.ownerDocument.createElement("canvas");
  overlay.width = right - left;
  overlay.height = bottom - top;
  const context = overlay.getContext("2d");
  if (!context) return null;
  let image: ImageData;
  try {
    context.drawImage(source, left, top, overlay.width, overlay.height, 0, 0, overlay.width, overlay.height);
    image = context.getImageData(0, 0, overlay.width, overlay.height);
  } catch {
    return null;
  }
  const old = [from.r, from.g, from.b].map((value) => Math.round(value * 255));
  const next = [to.r, to.g, to.b].map((value) => Math.round(value * 255));
  const data = image.data;
  let changed = 0;
  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.abs(data[index] - old[0]) + Math.abs(data[index + 1] - old[1]) +
      Math.abs(data[index + 2] - old[2]);
    if (distance > SAME_COLOUR_DISTANCE) {
      data[index + 3] = 0;
      continue;
    }
    data[index] = next[0];
    data[index + 1] = next[1];
    data[index + 2] = next[2];
    data[index + 3] = 255;
    changed += 1;
  }
  if (changed === 0) return null;
  context.putImageData(image, 0, 0);
  overlay.setAttribute("data-pdf-native-vector-recolor-preview", "true");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "absolute",
    left: `${(left / source.width) * 100}%`,
    top: `${(top / source.height) * 100}%`,
    width: `${(overlay.width / source.width) * 100}%`,
    height: `${(overlay.height / source.height) * 100}%`,
    pointerEvents: "none",
    zIndex: source.style.zIndex || "auto",
  });
  source.after(overlay);
  return () => {
    overlay.remove();
    overlay.width = 0;
    overlay.height = 0;
  };
}
