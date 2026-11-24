"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The body text wraps around a header or footer object that Word wraps
 * (Square, Tight, Through, Top and Bottom), on every page the band is on.
 *
 * Word lays the body out around such an object as around one of its own:
 * corpus R22-D30's sidebar picture, anchored in the header and reaching down
 * the page's left edge, keeps every body line clear of it. The bands draw
 * outside the editor's flow (`bandRichDom` marks the objects that wrap), so
 * each page gets, at the start of its own content, one float per object that
 * reaches into its body area: as wide as the object (with its wrap distance)
 * reaches into the text column, as tall as it reaches down the body, and cut
 * from the top (`shape-outside: inset`) where the object starts below the
 * body's top. The floats depend on the bands alone, never on the body, so
 * placing them cannot feed back into themselves.
 *
 * Not modelled: text on both sides of an object in the middle of the column
 * (the larger side keeps the text, as Word's Largest Only does).
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

export interface BandExclusion {
  readonly side: "left" | "right" | "full";
  readonly widthPx: number;
  readonly topPx: number;
  readonly heightPx: number;
}

const bandFloatExclusionKey = new PluginKey<{ specs: string; set: DecorationSet }>("bandFloatExclusion");
const SET = "bandFloatExclusion$set";
const MIN_STRIP_PX = 24;

/**
 * This editor's own band overlay: a sibling of its editor content, which the
 * editor renders only when the document has bands. Searching every ancestor's
 * whole subtree instead reached across the desk into ANOTHER window's overlay
 * when this document had none, and every page of a document without a header
 * got the other document's header/footer exclusions (a 396 px float down the
 * left of each page, which pushed this document's own floating charts aside).
 */
export function ownBandOverlay(editorDom: HTMLElement): HTMLElement | null {
  for (let element = editorDom.parentElement; element; element = element.parentElement) {
    // Its children, not `:scope >`: a selector walks everything under it, and
    // this runs after every view update on the ancestors of a whole document.
    for (const child of element.children) {
      if (child.classList.contains("sheet-band-overlay")) return child as HTMLElement;
    }
    if (element.classList.contains("wm-window")) break;
  }
  return null;
}

function bandOverlay(view: EditorView): HTMLElement | null {
  return ownBandOverlay(view.dom);
}

function pageExclusions(sheet: HTMLElement, box: HTMLElement | null): BandExclusion[] {
  if (!box) return [];
  const objects = Array.from(box.querySelectorAll<HTMLElement>("[data-band-wrap]"));
  if (!objects.length) return [];
  const sheetRect = sheet.getBoundingClientRect();
  const scale = sheet.offsetWidth > 0 ? sheetRect.width / sheet.offsetWidth : 1;
  const style = getComputedStyle(sheet);
  const bodyLeft = Number.parseFloat(style.paddingLeft) || 0;
  const bodyRight = sheet.offsetWidth - (Number.parseFloat(style.paddingRight) || 0);
  const bodyTop = Number.parseFloat(style.paddingTop) || 0;
  const bodyBottom = sheet.offsetHeight - (Number.parseFloat(style.paddingBottom) || 0);
  const out: BandExclusion[] = [];
  for (const object of objects) {
    const rect = object.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const [distTop, distRight, distBottom, distLeft] = (object.dataset.bandWrapDist ?? "0,0,0,0")
      .split(",")
      .map((value) => Number.parseFloat(value) || 0);
    const left = (rect.left - sheetRect.left) / scale - distLeft!;
    const right = (rect.right - sheetRect.left) / scale + distRight!;
    const top = Math.max(bodyTop, (rect.top - sheetRect.top) / scale - distTop!);
    const bottom = Math.min(bodyBottom, (rect.bottom - sheetRect.top) / scale + distBottom!);
    if (bottom <= top || right <= bodyLeft || left >= bodyRight) continue;
    const topPx = Math.round((top - bodyTop) * 100) / 100;
    const heightPx = Math.round((bottom - bodyTop) * 100) / 100;
    if (object.dataset.bandWrap === "topAndBottom") {
      out.push({ side: "full", widthPx: Math.round(bodyRight - bodyLeft), topPx, heightPx });
      continue;
    }
    const roomLeft = left - bodyLeft;
    const roomRight = bodyRight - right;
    const text = object.dataset.bandWrapText;
    // Where the words go: the side Word's wrap text names, else the larger.
    const textOnRight =
      text === "right" ? true : text === "left" ? false : roomRight >= roomLeft;
    if ((textOnRight ? roomRight : roomLeft) < MIN_STRIP_PX) {
      out.push({ side: "full", widthPx: Math.round(bodyRight - bodyLeft), topPx, heightPx });
      continue;
    }
    out.push(
      textOnRight
        ? { side: "left", widthPx: Math.round((right - bodyLeft) * 100) / 100, topPx, heightPx }
        : { side: "right", widthPx: Math.round((bodyRight - left) * 100) / 100, topPx, heightPx },
    );
  }
  return out;
}

/** `window.__dqc2BandFloorOff = true` (A/B): a band object that leaves no
 * strip beside it at the foot of the body takes no room from the page plan. */
function bandFloorOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __dqc2BandFloorOff?: boolean }) | null)?.__dqc2BandFloorOff === true;
}

/** Each sheet's band box in this editor's band overlay, by its
 * `data-band-sheet-index` (the first in document order, as one lookup took). */
export type BandBoxesBySheet = ReadonlyMap<string, HTMLElement>;

/**
 * The band boxes of this editor's overlay, read once for all the sheets of a
 * plan: searched sheet by sheet, the boxes were walked once per sheet -- the
 * pages squared (R492-D04's 1 886 pages: 22 s of a print's 850 s in the
 * ledger's capacities). Null when there is no overlay.
 */
export function bandBoxesBySheet(view: EditorView): BandBoxesBySheet | null {
  const overlay = bandOverlay(view);
  if (!overlay) return null;
  const boxes = new Map<string, HTMLElement>();
  for (const box of overlay.querySelectorAll<HTMLElement>(".sheet-band-box[data-band-sheet-index]")) {
    const index = box.dataset.bandSheetIndex;
    if (index !== undefined && !boxes.has(index)) boxes.set(index, box);
  }
  return boxes;
}

/** Sheet `sheetIndex`'s band box, searched for it alone. */
function bandBoxOf(view: EditorView, sheetIndex: number): HTMLElement | null {
  const overlay = bandOverlay(view);
  if (!overlay) return null;
  for (const candidate of overlay.querySelectorAll<HTMLElement>(".sheet-band-box[data-band-sheet-index]")) {
    if (candidate.dataset.bandSheetIndex === String(sheetIndex)) return candidate;
  }
  return null;
}

/**
 * Where the body of sheet `sheetIndex` ends for the text, from the body's
 * top (px), when a header or footer object wraps with no strip beside it
 * (top and bottom, or a strip narrower than a word) from that point to the
 * foot of the body; null when none does. Word sets no line of the body below
 * the top of such an object (its wrap distance included). Drawn, every block
 * after the exclusion float goes below it, past the foot; planned against the
 * whole body, the plan put a block there that fits by its height, the page
 * drew it lower and spilled, the plan put it back -- a cycle on every key
 * (R484-D04 p9/p10: a tab-only paragraph, 27.6 px planned, 32.6 px and past
 * the foot when drawn after the footer's exclusion). `boxes`: the overlay's
 * boxes read once for every sheet of a plan (`bandBoxesBySheet`).
 */
export function bandBodyFloorPx(
  view: EditorView,
  sheetIndex: number,
  sheet: HTMLElement,
  boxes?: BandBoxesBySheet | null,
): number | null {
  if (bandFloorOff(view)) return null;
  const box = boxes === undefined ? bandBoxOf(view, sheetIndex) : (boxes?.get(String(sheetIndex)) ?? null);
  if (!box || !box.querySelector("[data-band-wrap]")) return null;
  const style = getComputedStyle(sheet);
  const bodyHeight = sheet.offsetHeight - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0);
  let floor: number | null = null;
  for (const exclusion of pageExclusions(sheet, box)) {
    // A float with a strip beside it narrows lines; one reaching the foot
    // with none beside it ends the body at its top.
    if (exclusion.side !== "full" || exclusion.heightPx < bodyHeight - 1 || !(exclusion.topPx > 0)) continue;
    floor = floor === null ? exclusion.topPx : Math.min(floor, exclusion.topPx);
  }
  return floor;
}

function exclusionElement(exclusion: BandExclusion): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("data-band-exclusion", exclusion.side);
  element.setAttribute("aria-hidden", "true");
  element.contentEditable = "false";
  const float = exclusion.side === "right" ? "right" : "left";
  element.style.cssText =
    `float:${float};clear:none;width:${exclusion.widthPx}px;height:${exclusion.heightPx}px;margin:0;padding:0;` +
    `shape-outside:inset(${exclusion.topPx}px 0 0 0);pointer-events:none;user-select:none;`;
  return element;
}

/**
 * Where on its sheet an exclusion's float stands: before the first in-flow
 * block that reaches down past the object's top (at the sheet's end when
 * none does), its offsets restated from where it stands. A float standing at
 * the sheet's start reached from the body's top down to the object, and
 * everything that cannot share a line with a float -- a table (its own
 * formatting context), a Top and Bottom picture, chart or shape
 * (`clear: both`) -- was pushed below the WHOLE float box, `shape-outside` or
 * not: with D-word's footer square shape reaching 3.6 pt into the body, every
 * such object on every page went to the foot of its page and on to the next
 * (wps-position-parity D05, D15, T01: pages drifting from Word's from the
 * fifth on). Placed before a block that ends above the object, the float
 * still pushed that block when it clears floats: D05's Top and Bottom chart,
 * once the first block of its page, kept clearing the float there and never
 * came back. The blocks are read with the floats taken out (`blocks` is
 * that reading), so where a float stands never decides where it stands.
 */
export function placeBandExclusion(
  exclusion: BandExclusion,
  blocks: ReadonlyArray<{ readonly topPx: number; readonly bottomPx: number }>,
): { readonly index: number; readonly exclusion: BandExclusion } {
  let index = blocks.findIndex((block) => block.bottomPx > exclusion.topPx + 0.5);
  if (index < 0) index = blocks.length;
  const standsAt = index < blocks.length ? blocks[index]!.topPx : (blocks.at(-1)?.bottomPx ?? 0);
  const startPx = Math.max(0, Math.min(exclusion.topPx, standsAt));
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    index,
    exclusion: {
      ...exclusion,
      topPx: round(exclusion.topPx - startPx),
      heightPx: round(Math.max(0, exclusion.heightPx - startPx)),
    },
  };
}

/** The sheet's in-flow blocks: their positions and their boxes from the
 * body's top, in sheet px. */
function sheetFlowBlocks(
  view: EditorView,
  page: PmNode,
  pageOffset: number,
  sheet: HTMLElement,
): { positions: number[]; boxes: Array<{ topPx: number; bottomPx: number }> } {
  const sheetRect = sheet.getBoundingClientRect();
  const scale = sheet.offsetWidth > 0 ? sheetRect.width / sheet.offsetWidth : 1;
  const bodyTop = Number.parseFloat(getComputedStyle(sheet).paddingTop) || 0;
  const positions: number[] = [];
  const boxes: Array<{ topPx: number; bottomPx: number }> = [];
  page.forEach((_child, childOffset) => {
    const position = pageOffset + 1 + childOffset;
    const dom = view.nodeDOM(position);
    if (!(dom instanceof HTMLElement) || dom.parentElement !== sheet) return;
    const style = getComputedStyle(dom);
    if (style.position === "absolute" || style.position === "fixed" || style.display === "none") return;
    const floated = style.float || style.cssFloat || "none";
    if (floated !== "none" && floated !== "") return;
    const rect = dom.getBoundingClientRect();
    positions.push(position);
    boxes.push({
      topPx: (rect.top - sheetRect.top) / (scale || 1) - bodyTop,
      bottomPx: (rect.bottom - sheetRect.top) / (scale || 1) - bodyTop,
    });
  });
  return { positions, boxes };
}

function measure(view: EditorView, overlay: HTMLElement): { specs: string; decorations: Decoration[] } {
  const decorations: Decoration[] = [];
  const parts: string[] = [];
  const boxes = new Map<string, HTMLElement>();
  for (const box of overlay.querySelectorAll<HTMLElement>(".sheet-band-box[data-band-sheet-index]")) {
    if (box.querySelector("[data-band-wrap]")) boxes.set(box.dataset.bandSheetIndex ?? "", box);
  }
  // The blocks are read as they stand with no exclusion float: the floats
  // of the last pass are taken out while the sheets are measured.
  const floats = Array.from(view.dom.querySelectorAll<HTMLElement>("[data-band-exclusion]"));
  for (const element of floats) element.style.display = "none";
  try {
    measureSheets(view, boxes, decorations, parts);
  } finally {
    for (const element of floats) element.style.display = "";
  }
  return { specs: parts.join("|"), decorations };
}

function measureSheets(
  view: EditorView,
  boxes: ReadonlyMap<string, HTMLElement>,
  decorations: Decoration[],
  parts: string[],
): void {
  let sheetIndex = 0;
  view.state.doc.forEach((node, offset) => {
    if (node.type.name !== "pageBlock") return;
    const index = sheetIndex++;
    const box = boxes.get(String(index));
    if (!box) return;
    const sheet = view.nodeDOM(offset);
    if (!(sheet instanceof HTMLElement)) return;
    const exclusions = pageExclusions(sheet, box);
    if (!exclusions.length) return;
    const blocks = sheetFlowBlocks(view, node, offset, sheet);
    for (const [order, raw] of exclusions.entries()) {
      const { index, exclusion } = placeBandExclusion(raw, blocks.boxes);
      // Past every block: at the end of the page's content.
      const position = blocks.positions[index] ?? offset + node.nodeSize - 1;
      parts.push(`${position}:${JSON.stringify(exclusion)}`);
      decorations.push(
        Decoration.widget(position, () => exclusionElement(exclusion), {
          side: -1 - order,
          ignoreSelection: true,
          key: `band-exclusion-${position}-${order}-${JSON.stringify(exclusion)}`,
        }),
      );
    }
  });
}

export const BandFloatExclusion = Extension.create({
  name: "bandFloatExclusion",

  addProseMirrorPlugins() {
    return [
      new Plugin<{ specs: string; set: DecorationSet }>({
        key: bandFloatExclusionKey,
        state: {
          init: () => ({ specs: "", set: DecorationSet.empty }),
          apply(tr, value) {
            const next = tr.getMeta(SET) as { specs: string; decorations: Decoration[] } | undefined;
            if (next) return { specs: next.specs, set: DecorationSet.create(tr.doc, next.decorations) };
            return tr.docChanged ? { specs: value.specs, set: value.set.map(tr.mapping, tr.doc) } : value;
          },
        },
        props: {
          decorations: (state) => bandFloatExclusionKey.getState(state)?.set,
        },
        view(view) {
          let frame = 0;
          let passes = 0;
          let windowStart = 0;
          const run = () => {
            frame = 0;
            if (!view.dom.isConnected || view.composing) return;
            const now = performance.now();
            if (now - windowStart > 4000) {
              windowStart = now;
              passes = 0;
            }
            // Bounded: the bands only move when the page set changes, so a
            // second pass in a row finds the same floats.
            if (passes >= 20) return;
            const current = bandFloatExclusionKey.getState(view.state);
            const overlay = bandOverlay(view);
            // No band object wraps (nearly every document): nothing to do.
            if (!overlay?.querySelector("[data-band-wrap]")) {
              if (current?.specs) view.dispatch(view.state.tr.setMeta(SET, { specs: "", decorations: [] }).setMeta("addToHistory", false));
              return;
            }
            const next = measure(view, overlay);
            if (!current || next.specs === current.specs) return;
            passes += 1;
            view.dispatch(view.state.tr.setMeta(SET, next).setMeta("addToHistory", false));
          };
          const schedule = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
              frame = requestAnimationFrame(run);
            });
          };
          schedule();
          return {
            update: schedule,
            destroy: () => {
              if (frame) cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});
