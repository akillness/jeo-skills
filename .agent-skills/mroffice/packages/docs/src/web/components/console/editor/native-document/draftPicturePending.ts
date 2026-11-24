/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { prefersReducedMotion } from "@mrnote/core/web/__cut__/m39a24b3ce5.ts";














export const DRAFT_PICTURE_PENDING_TITLES: ReadonlySet<string> = new Set([
  "配图生成中…",
  "Drawing the picture…",
]);

/** How long the frame takes to give way to the arriving picture. */
export const DRAFT_PICTURE_ARRIVAL_MS = 320;

const OVERLAY_SELECTOR = ":scope > [data-picture-pending-overlay]";
const SVG_NS = "http://www.w3.org/2000/svg";

export function isDraftPicturePending(attrs: Record<string, unknown>): boolean {
  return typeof attrs.title === "string" && DRAFT_PICTURE_PENDING_TITLES.has(attrs.title);
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** The reserved box's ratio, "W / H", from the stand-in's own size. */
export function draftPicturePendingRatio(attrs: Record<string, unknown>): string | null {
  const width = positiveNumber(attrs.width) ?? positiveNumber(attrs.widthEmu);
  const height = positiveNumber(attrs.height) ?? positiveNumber(attrs.heightEmu);
  return width && height ? `${Math.round(width)} / ${Math.round(height)}` : null;
}

function brushGlyph(): SVGSVGElement {
  // A brush laying down a stroke: drawn here, never an icon font or asset.
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "note-editor-picture-pending__brush");
  const stroke = document.createElementNS(SVG_NS, "path");
  stroke.setAttribute("d", "M3 16.5c2.2.4 3.6-.3 4.4-1.8");
  stroke.setAttribute("fill", "none");
  stroke.setAttribute("stroke", "currentColor");
  stroke.setAttribute("stroke-width", "1.7");
  stroke.setAttribute("stroke-linecap", "round");
  const handle = document.createElementNS(SVG_NS, "path");
  handle.setAttribute("d", "M8.6 13.6 16.4 3.9a1.3 1.3 0 0 1 1.9 1.7l-8.2 9.3-1.5-1.3Z");
  handle.setAttribute("fill", "currentColor");
  svg.append(stroke, handle);
  return svg;
}

function buildOverlay(label: string): HTMLElement {
  const overlay = document.createElement("span");
  overlay.className = "note-editor-picture-pending";
  overlay.dataset.picturePendingOverlay = "true";
  // Typeset/measurement clones drop it with the rest of the picture chrome.
  overlay.dataset.documentSelectionChrome = "true";
  overlay.contentEditable = "false";
  overlay.setAttribute("role", "status");
  for (const tone of ["accent", "warm", "cool"]) {
    const blob = document.createElement("span");
    blob.className = "note-editor-picture-pending__blob";
    blob.dataset.tone = tone;
    blob.setAttribute("aria-hidden", "true");
    overlay.appendChild(blob);
  }
  const sheen = document.createElement("span");
  sheen.className = "note-editor-picture-pending__sheen";
  sheen.setAttribute("aria-hidden", "true");
  overlay.appendChild(sheen);
  const caption = document.createElement("span");
  caption.className = "note-editor-picture-pending__caption";
  caption.appendChild(brushGlyph());
  const text = document.createElement("span");
  text.className = "note-editor-picture-pending__label";
  text.textContent = label;
  caption.appendChild(text);
  overlay.appendChild(caption);
  return overlay;
}

/**
 * Show, keep or retire the pending frame on one picture wrapper. Called from
 * the NodeView's `apply` on every attribute change; idempotent.
 */
export function syncDraftPicturePending(
  wrapper: HTMLElement,
  img: HTMLImageElement,
  attrs: Record<string, unknown>,
  label: string,
): void {
  const existing = wrapper.querySelector<HTMLElement>(OVERLAY_SELECTOR);
  if (isDraftPicturePending(attrs)) {
    const ratio = draftPicturePendingRatio(attrs);
    // The stand-in's own box is the reservation; the ratio holds it before
    // the stand-in raster has decoded (a percent-width picture is height:auto).
    img.style.aspectRatio = ratio ?? "";
    wrapper.dataset.picturePending = "true";
    delete wrapper.dataset.pictureArrived;
    const overlay = existing && existing.dataset.leaving !== "true" ? existing : buildOverlay(label);
    if (overlay !== existing) {
      existing?.remove();
      wrapper.appendChild(overlay);
    }
    overlay.dataset.motion = prefersReducedMotion() ? "static" : "animated";
    overlay.setAttribute("aria-label", label);
    const text = overlay.querySelector(".note-editor-picture-pending__label");
    if (text && text.textContent !== label) text.textContent = label;
    return;
  }
  if (wrapper.dataset.picturePending !== "true") return;
  // The picture arrived in this very NodeView: the frame gives way while the
  // picture fades in under it, in the same box.
  delete wrapper.dataset.picturePending;
  img.style.aspectRatio = "";
  if (!existing) return;
  if (prefersReducedMotion() || existing.dataset.motion === "static") {
    existing.remove();
    return;
  }
  wrapper.dataset.pictureArrived = "true";
  existing.dataset.leaving = "true";
  window.setTimeout(() => {
    existing.remove();
    if (wrapper.dataset.picturePending !== "true") delete wrapper.dataset.pictureArrived;
  }, DRAFT_PICTURE_ARRIVAL_MS + 40);
}
