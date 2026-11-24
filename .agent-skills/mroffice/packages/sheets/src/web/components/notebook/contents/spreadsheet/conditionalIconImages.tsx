"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { ConditionalIconGlyph } from "./ConditionalIconGlyph";

/**
 * Conditional-format icons as images the grid's canvas draws: each glyph
 * (set, slot, count) rendered once from ConditionalIconGlyph, the same SVG
 * a cell's icon layer shows, outside any render, and kept.
 */
const images = new Map<string, HTMLImageElement | null>();
const waiting = new Set<() => void>();
let building = false;

function keyOf(iconSet: string, index: number, count: number) {
  return `${iconSet}|${index}|${count}`;
}

function buildPending(pending: Array<{ key: string; iconSet: string; index: number; count: number }>) {
  const host = document.createElement("div");
  const root = createRoot(host);
  for (const { key, iconSet, index, count } of pending) {
    flushSync(() => root.render(<ConditionalIconGlyph iconSet={iconSet} index={index} count={count} />));
    const svg = host.querySelector("svg");
    if (!svg) { images.delete(key); continue; }
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const image = new Image();
    image.onload = () => {
      images.set(key, image);
      for (const repaint of waiting) repaint();
      waiting.clear();
    };
    image.onerror = () => images.delete(key);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
  }
  root.unmount();
}

const queued: Array<{ key: string; iconSet: string; index: number; count: number }> = [];

/**
 * The icon's image once it is ready; undefined while it is being made, and
 * `repaint` is called when it is.
 */
export function conditionalIconImage(iconSet: string, index: number, count: number, repaint: () => void): HTMLImageElement | undefined {
  const key = keyOf(iconSet, index, count);
  const known = images.get(key);
  if (known) return known;
  waiting.add(repaint);
  if (known === null || typeof document === "undefined") return undefined;
  images.set(key, null);
  queued.push({ key, iconSet, index, count });
  if (!building) {
    building = true;
    // Out of the paint (a layout effect): React renders the glyphs on a task of its own.
    setTimeout(() => {
      building = false;
      buildPending(queued.splice(0));
    }, 0);
  }
  return undefined;
}
