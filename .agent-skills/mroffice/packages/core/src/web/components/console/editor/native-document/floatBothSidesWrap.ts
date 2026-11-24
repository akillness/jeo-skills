"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Text on BOTH sides of a floating object (Word's Square / Tight / Through
 * wrap with `wrapText="bothSides"`).
 *
 * A CSS float only ever has text on one side. Word sets each line that
 * crosses the object twice: the words that fit in the strip before the
 * object, then the rest of the line after it (Word 16: a 0.3" strip beside a
 * picture 0.5" in from the margin holds "C", "sed", nothing, "elit", one word
 * a line). The object is therefore placed out of the flow (the layout pass
 * marks it `data-float-both`), and every text line that crosses it gets one
 * zero-height spacer where Word's line jumps the object: the words before
 * the spacer stay in the strip and the spacer carries the rest past the
 * object's far edge.
 *
 * The spacers are widget decorations: nothing is stored, the caret never
 * stops in one, and copying a line copies its words. A spacer changes how the
 * following text wraps, so the lines are settled top down, one new spacer a
 * frame, each later frame checking the ones already placed.
 */

import { querySheetsAll } from "./paged/sheetMeasureMemo";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { normalizeFloatAnchor, floatWrapDistancesPx } from "../../../../lib/office-float-anchor";

export const FLOAT_BOTH_SIDES_ATTR = "data-float-both";
/** A strip narrower than this holds no text in Word either (it needs room
 * for at least a short word); such an object keeps the plain CSS float. */
export const FLOAT_BOTH_SIDES_MIN_STRIP_PX = 24;

interface Spacer {
  readonly pos: number;
  readonly widthPx: number;
}

const floatBothSidesWrapKey = new PluginKey<DecorationSet>("floatBothSidesWrap");
const SET_SPACERS = "floatBothSidesWrap$set";
const MAX_LINES_PER_OBJECT = 120;
const MAX_PASSES_PER_WINDOW = 80;
const PASS_WINDOW_MS = 4_000;

function spacerElement(widthPx: number): HTMLElement {
  const element = document.createElement("span");
  element.setAttribute("data-float-wrap-spacer", "true");
  element.setAttribute("aria-hidden", "true");
  element.contentEditable = "false";
  element.style.cssText =
    `display:inline-block;width:${widthPx.toFixed(2)}px;height:0;line-height:0;` +
    "vertical-align:baseline;pointer-events:none;user-select:none;";
  return element;
}

function decorationsFor(state: EditorState, spacers: readonly Spacer[]): DecorationSet {
  if (spacers.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    state.doc,
    spacers
      .filter((spacer) => spacer.pos > 0 && spacer.pos <= state.doc.content.size)
      .map((spacer) =>
        Decoration.widget(spacer.pos, () => spacerElement(spacer.widthPx), {
          key: `float-wrap-${spacer.pos}-${spacer.widthPx.toFixed(1)}`,
          // After the space that ends the strip's last word, before the
          // word that starts beyond the object.
          side: -1,
          ignoreSelection: true,
          // Zero height: the auto line boxes keep their paragraph.
          zeroLayoutFormattingMark: true,
          floatWrapSpacer: true,
        }),
      ),
  );
}

function readSpacers(view: EditorView): Spacer[] {
  const set = floatBothSidesWrapKey.getState(view.state);
  if (!set) return [];
  return set
    .find(undefined, undefined, (spec) => spec.floatWrapSpacer === true)
    .map((decoration) => {
      const match = /^float-wrap-(\d+)-([\d.]+)$/.exec(String(decoration.spec.key ?? ""));
      return { pos: decoration.from, widthPx: match ? Number(match[2]) : 0 };
    })
    .sort((left, right) => left.pos - right.pos);
}

interface Obstacle {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly sheet: HTMLElement;
  /**
   * A floating table: the text blocks it only partly overlaps wrap too (a
   * table at the margin has text on one side only), and a jump never
   * reaches past the block's own right edge.
   */
  readonly partial: boolean;
}

/** The wrappers the float layout pass last found wrapping on both sides, per view. */
const publishedBothSides = new WeakMap<EditorView, readonly HTMLElement[]>();

/**
 * An obstacle that carries its own wrap distances (px, `{top, right, bottom,
 * left}` JSON) instead of a drawing anchor: a floating TABLE placed on its
 * page (`tablePageFrame`), whose `w:tblpPr` `*FromText` distances keep the
 * text away from it exactly as a drawing's `dist*` do.
 */
export const FLOAT_WRAP_DISTANCES_ATTR = "data-float-wrap-distances";

/** The floating tables the page projection last set to wrap on both sides, per view. */
const publishedTableBothSides = new WeakMap<EditorView, readonly HTMLElement[]>();

/** Each view's wrap pass scheduler, for a hand-over from outside a view update. */
const wrapSchedulers = new WeakMap<EditorView, () => void>();

/**
 * Hand over the floating tables the page projection placed out of the flow.
 * The projection runs in the paginator's pass, which may end without another
 * view update: the wrap pass is scheduled here so the tables it places are
 * wrapped all the same.
 */
export function publishTableBothSides(view: EditorView, elements: readonly HTMLElement[]): void {
  const had = publishedTableBothSides.has(view);
  if (elements.length > 0) publishedTableBothSides.set(view, elements);
  else publishedTableBothSides.delete(view);
  if (had || elements.length > 0) wrapSchedulers.get(view)?.();
}

/**
 * The float layout pass walks the document for every floating object anyway;
 * it hands over the ones it set to wrap on both sides, so this pass (two
 * frames after it) need not walk the document again, every stroke of ink's
 * drawing included, on every change.
 */
export function publishFloatBothSides(view: EditorView, elements: readonly HTMLElement[] | null): void {
  if (elements) publishedBothSides.set(view, elements);
  else publishedBothSides.delete(view);
}

function bothSidesElements(view: EditorView): readonly HTMLElement[] {
  const published = publishedBothSides.get(view);
  const drawings = !published
    ? Array.from(view.dom.querySelectorAll<HTMLElement>(`[${FLOAT_BOTH_SIDES_ATTR}="true"]`))
    : published.filter((element) => element.isConnected && element.getAttribute(FLOAT_BOTH_SIDES_ATTR) === "true");
  const tables = publishedTableBothSides.get(view);
  if (!tables) return drawings;
  const placed = tables.filter((element) => element.isConnected && element.getAttribute(FLOAT_BOTH_SIDES_ATTR) === "true");
  return placed.length > 0 ? [...drawings.filter((element) => !placed.includes(element)), ...placed] : drawings;
}

function directWrapDistances(element: HTMLElement): { topPx: number; rightPx: number; bottomPx: number; leftPx: number } | null {
  const raw = element.getAttribute(FLOAT_WRAP_DISTANCES_ATTR);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const read = (key: string) => {
      const number = Number(value[key]);
      return Number.isFinite(number) && number >= 0 ? number : 0;
    };
    return { topPx: read("top"), rightPx: read("right"), bottomPx: read("bottom"), leftPx: read("left") };
  } catch {
    return null;
  }
}

function obstacles(view: EditorView): Obstacle[] {
  const found: Obstacle[] = [];
  bothSidesElements(view).forEach((element) => {
    const sheet = element.closest<HTMLElement>("article[data-page-sheet]");
    if (!sheet) return;
    let distances = directWrapDistances(element);
    if (!distances) {
      let raw: unknown = null;
      try {
        raw = JSON.parse(element.getAttribute("data-float-anchor") ?? "null");
      } catch {
        raw = null;
      }
      const anchor = normalizeFloatAnchor(raw);
      if (!anchor) return;
      distances = floatWrapDistancesPx(anchor);
    }
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    const scale = rect.width / (element.offsetWidth || rect.width);
    found.push({
      left: rect.left - distances.leftPx * scale,
      right: rect.right + distances.rightPx * scale,
      top: rect.top - distances.topPx * scale,
      bottom: rect.bottom + distances.bottomPx * scale,
      sheet,
      partial: element.hasAttribute(FLOAT_WRAP_DISTANCES_ATTR),
    });
  });
  return found.sort((left, right) => left.top - right.top);
}

interface Glyph {
  readonly pos: number;
  readonly character: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const TEXT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6";

/** Every character of a block with its laid-out box, in document order.
 * Range geometry, so it reads the same on a sheet that is scrolled away. */
function blockGlyphs(view: EditorView, block: HTMLElement): Glyph[] {
  const glyphs: Glyph[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (text.parentElement?.closest('[contenteditable="false"]') !== block.closest('[contenteditable="false"]')) {
      continue;
    }
    let base: number;
    try {
      base = view.posAtDOM(text, 0);
    } catch {
      continue;
    }
    for (let offset = 0; offset < text.data.length; offset += 1) {
      range.setStart(text, offset);
      range.setEnd(text, offset + 1);
      const rect = range.getBoundingClientRect();
      if (rect.height <= 0) continue;
      glyphs.push({
        pos: base + offset,
        character: text.data[offset]!,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      });
    }
  }
  return glyphs;
}

function linesOf(glyphs: readonly Glyph[]): Glyph[][] {
  const lines: Glyph[][] = [];
  let bottom = Number.NEGATIVE_INFINITY;
  for (const glyph of glyphs) {
    const line = lines[lines.length - 1];
    if (!line || glyph.top >= bottom - 1) {
      lines.push([glyph]);
      bottom = glyph.bottom;
    } else {
      line.push(glyph);
      bottom = Math.max(bottom, glyph.bottom);
    }
  }
  return lines;
}

/** The text blocks of the object's sheet that reach across it. A table cell
 * wraps its own lines and is left alone. */
function crossedBlocks(obstacle: Obstacle): HTMLElement[] {
  return Array.from(obstacle.sheet.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR)).filter((block) => {
    if (block.closest("td, th, [data-text-box], figure")) return false;
    const rect = block.getBoundingClientRect();
    if (!(rect.bottom > obstacle.top && rect.top < obstacle.bottom)) return false;
    return obstacle.partial
      ? rect.left < obstacle.right && rect.right > obstacle.left
      : rect.left < obstacle.left && rect.right > obstacle.right;
  });
}

/** One settling step: the spacers as they should be, given the lines as
 * they are laid out now. Returns the same array when nothing changes. */
function settle(view: EditorView, current: readonly Spacer[]): readonly Spacer[] {
  const all = obstacles(view);
  if (all.length === 0) return current.length === 0 ? current : [];
  const spacerElements = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-float-wrap-spacer="true"]'));
  const placed = spacerElements.map((element) => element.getBoundingClientRect());
  // Where each spacer already stands, by its position in the document.
  const placedAt = new Map<number, DOMRect>();
  spacerElements.forEach((element, index) => {
    try {
      placedAt.set(view.posAtDOM(element, 0), placed[index]!);
    } catch {
      // A spacer the view cannot place is simply not reused.
    }
  });
  const next: Spacer[] = [];
  let changed = false;
  outer: for (const obstacle of all) {
    let lineCount = 0;
    for (const block of crossedBlocks(obstacle)) {
      const lines = linesOf(blockGlyphs(view, block));
      const blockRight = obstacle.partial
        ? block.getBoundingClientRect().right - (Number.parseFloat(getComputedStyle(block).paddingRight) || 0)
        : Number.POSITIVE_INFINITY;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex]!;
        const top = Math.min(...line.map((glyph) => glyph.top));
        const following = lines[lineIndex + 1];
        // A line is its whole pitch, down to where the next one starts: Word
        // wraps a line whose leading alone reaches into the object's band.
        const bottom = following
          ? Math.max(...line.map((glyph) => glyph.bottom), Math.min(...following.map((glyph) => glyph.top)))
          : Math.max(...line.map((glyph) => glyph.bottom));
        if (bottom <= obstacle.top + 0.5 || top >= obstacle.bottom) continue;
        lineCount += 1;
        if (lineCount > MAX_LINES_PER_OBJECT) break outer;
        // Where each character would stand without this line's own spacer.
        const shift = (glyph: Glyph) =>
          placed
            .filter((rect) => rect.top < bottom && rect.bottom + 1 > top && rect.left <= glyph.left + 0.5)
            .reduce((sum, rect) => sum + rect.width, 0);
        let keep = 0;
        for (let index = 0; index < line.length; index += 1) {
          const glyph = line[index]!;
          if (glyph.right - shift(glyph) > obstacle.left + 0.5) break;
          const following = line[index + 1];
          // A word is kept whole: the strip's text ends after a space (or
          // with the line).
          if (/\s/u.test(glyph.character) || !following) keep = index + 1;
        }
        // A spacer already on this line that carries the rest past the
        // object, with every word before it inside the strip, stays as it
        // is. Recomputed from the glyphs instead, a justified line moved its
        // words with every new spacer width and the widths cycled forever
        // (corpus R29-D25: 430 / 469 / 459 px, the following lines never
        // wrapped).
        // A table reaching the block's right edge: the jump ends there and
        // the rest of the line goes to the next one.
        const reach = Math.min(obstacle.right, blockRight);
        const standing = current.find((spacer) => {
          const rect = placedAt.get(spacer.pos);
          if (!rect || rect.top >= bottom || rect.bottom + 1 <= top) return false;
          // A jump to the block's edge ends its line: the word it stands
          // before starts the next one.
          if (!line.some((glyph) => glyph.pos === spacer.pos) && !(obstacle.partial && rect.right >= reach - 0.5)) {
            return false;
          }
          // Past the far edge is the justified line's own stretch (Word
          // justifies the words after the object too): it stands.
          return (
            rect.right >= reach - 0.5 &&
            line.every((glyph) => glyph.pos >= spacer.pos || glyph.right <= obstacle.left + 0.5)
          );
        });
        if (standing) {
          next.push(standing);
          continue;
        }
        if (keep === line.length) continue; // The whole line fits before the object.
        const first = line[keep]!;
        const existing = current.find((spacer) => spacer.pos === first.pos);
        const existingRect = existing ? placedAt.get(existing.pos) : undefined;
        // A spacer already standing at this place on this line is corrected by
        // where it actually ends: a justified line stretches the spaces before
        // it, so the place the glyphs give for it moves with its own width and
        // the two readings alternated (corpus R29-D25: 431 / 451 px) until the
        // repeat guard stopped the pass and no later line wrapped.
        const onThisLine =
          existingRect !== undefined && existingRect.top < bottom && existingRect.bottom + 1 > top;
        const from = keep === 0 ? first.left - shift(first) : line[keep - 1]!.right - shift(line[keep - 1]!);
        // Only ever grown by what it falls short: a justified line moves the
        // spacer with every width it is given, and a width corrected both
        // ways alternated (R29-D25: 431 / 451 px) until the pass gave up.
        const widthPx =
          existing && onThisLine
            ? Math.round((existing.widthPx + Math.max(0, reach - existingRect.right)) * 4) / 4
            : reach < obstacle.right
              ? // Short of the edge, never past it: a jump a hair too wide
                // would itself drop to the next line.
                Math.floor((reach - from) * 4) / 4 - 0.25
              : Math.round((reach - from) * 4) / 4;
        if (!(widthPx > 0.5)) continue;
        if (existing && Math.abs(existing.widthPx - widthPx) < 0.75) {
          next.push(existing);
          continue;
        }
        // A new or moved spacer re-wraps everything after it: place it and
        // look at the following lines once they are laid out again.
        next.push({ pos: first.pos, widthPx });
        changed = true;
        break outer;
      }
    }
  }
  if (!changed && next.length === current.length) return current;
  return next;
}

export function createFloatBothSidesWrapPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: floatBothSidesWrapKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, value, _old, state) {
        const spacers = tr.getMeta(SET_SPACERS) as readonly Spacer[] | undefined;
        if (spacers) return decorationsFor(state, spacers);
        return tr.docChanged ? value.map(tr.mapping, tr.doc) : value;
      },
    },
    props: {
      decorations: (state) => floatBothSidesWrapKey.getState(state),
    },
    view(view) {
      let frame = 0;
      let passes = 0;
      let windowStart = 0;
      const seen = new Map<string, number>();
      let seenText = "";
      const run = () => {
        frame = 0;
        if (!view.dom.isConnected || view.composing) return;
        // Bounded: pagination re-lays the page after every spacer, and a
        // spacer set that keeps coming back must stop rather than spin.
        const now = performance.now();
        if (now - windowStart > PASS_WINDOW_MS) {
          windowStart = now;
          passes = 0;
        }
        if (passes >= MAX_PASSES_PER_WINDOW) return;
        const current = readSpacers(view);
        // Nothing wraps on both sides and nothing was wrapped: nothing to do
        // (without reading the whole document's text to find out).
        if (current.length === 0 && bothSidesElements(view).length === 0) return;
        const text = view.state.doc.textContent;
        if (text !== seenText) {
          seenText = text;
          seen.clear();
        }
        let next: readonly Spacer[];
        try {
          next = settle(view, current);
        } catch {
          return;
        }
        if (next === current) return;
        const signature = next.map((spacer) => `${spacer.pos}:${spacer.widthPx}`).join(",");
        const times = (seen.get(signature) ?? 0) + 1;
        seen.set(signature, times);
        if (times > 3) return;
        passes += 1;
        view.dispatch(view.state.tr.setMeta(SET_SPACERS, next).setMeta("addToHistory", false));
      };
      const schedule = () => {
        if (frame) return;
        // After the float layout pass of the same frame has placed the objects.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(run);
        });
      };
      wrapSchedulers.set(view, schedule);
      schedule();
      return {
        update: schedule,
        destroy: () => {
          if (frame) cancelAnimationFrame(frame);
          if (wrapSchedulers.get(view) === schedule) wrapSchedulers.delete(view);
        },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// A Top and Bottom picture at its paragraph's very top.
// ---------------------------------------------------------------------------

/**
 * Word places a Top and Bottom object from its paragraph's top, and a line
 * whose box touches the object's band goes under it. At offset 0 (or less)
 * the band starts exactly where the line ABOVE the anchor paragraph ends, and
 * Word 16 sends that line under the object as well (oracle `mrtb/tb-a…e`: a
 * one-line heading above the anchor paragraph ends up below the picture; at
 * +0.2" it stays above). In the flow the picture stands between the two
 * paragraphs: the line above is painted under the picture, and the picture
 * reserves that line's height below itself (`data-band-swap-room`, applied
 * by the float layout pass) so the anchor paragraph starts under the line.
 * Only a ONE-line block above is moved: Word moves one line, never a whole
 * multi-line paragraph, and a paragraph cannot be split in paint.
 */
const bandLineSwapKey = new PluginKey<DecorationSet>("floatBandLineSwap");
const SET_SWAPS = "floatBandLineSwap$set";
export const BAND_LINE_SWAP_PROPERTY = "--docs-band-swap";

interface Swap {
  readonly pos: number;
  readonly size: number;
  readonly shiftPx: number;
}

function lineCount(block: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(block);
  const tops: number[] = [];
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (!tops.some((top) => Math.abs(top - rect.top) < rect.height / 2)) tops.push(rect.top);
  }
  return tops.length;
}

function planSwaps(view: EditorView): Swap[] {
  const swaps: Swap[] = [];
  const bands = querySheetsAll(
    view.dom as HTMLElement,
    '.note-editor-image-resizable[data-float-mode="band"], [data-chart-float][data-float-mode="band"]',
  );
  const wanted = new Set<HTMLElement>();
  for (const band of bands) {
    let anchor: ReturnType<typeof normalizeFloatAnchor> = null;
    try {
      anchor = normalizeFloatAnchor(JSON.parse(band.getAttribute("data-float-anchor") ?? "null"));
    } catch {
      anchor = null;
    }
    const vertical = anchor?.vertical as { offsetEmu?: number; relativeFrom?: string } | undefined;
    const above = band.previousElementSibling;
    const below = band.nextElementSibling;
    if (
      !anchor ||
      (vertical?.relativeFrom !== "paragraph" && vertical?.relativeFrom !== "line") ||
      (vertical.offsetEmu ?? 0) > 0 ||
      !(above instanceof HTMLElement) ||
      !(below instanceof HTMLElement) ||
      !above.matches(TEXT_BLOCK_SELECTOR) ||
      !below.matches(TEXT_BLOCK_SELECTOR) ||
      lineCount(above) !== 1
    ) {
      continue;
    }
    const scale = band.getBoundingClientRect().height / (band.offsetHeight || 1) || 1;
    const bandTop = band.getBoundingClientRect().top;
    const aboveShift = Number.parseFloat(above.style.getPropertyValue(BAND_LINE_SWAP_PROPERTY)) || 0;
    const aboveRect = above.getBoundingClientRect();
    const aboveTop = aboveRect.top - aboveShift * scale;
    const bandHeight = band.getBoundingClientRect().height;
    // The picture stays where its paragraph starts (Word leaves the line's
    // old place above it empty); the line goes right under the picture, and
    // the anchor paragraph starts one line lower to make room for it.
    const room = (bandTop - aboveTop) / scale;
    const down = (bandTop + bandHeight - aboveTop) / scale;
    if (!(down > 0.5) || !(room > 0.5)) continue;
    band.dataset.bandSwapRoom = room.toFixed(2);
    wanted.add(band);
    let pos: number;
    try {
      pos = view.posAtDOM(above, 0) - 1;
    } catch {
      continue;
    }
    const node = view.state.doc.nodeAt(pos);
    if (!node || !node.isTextblock) continue;
    swaps.push({ pos, size: node.nodeSize, shiftPx: Math.round(down * 100) / 100 });
  }
  for (const band of bands) {
    if (!wanted.has(band)) delete band.dataset.bandSwapRoom;
  }
  return swaps;
}

export function createFloatBandLineSwapPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: bandLineSwapKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, value, _old, state) {
        const swaps = tr.getMeta(SET_SWAPS) as readonly Swap[] | undefined;
        if (swaps) {
          return swaps.length === 0
            ? DecorationSet.empty
            : DecorationSet.create(
                state.doc,
                swaps
                  .filter((swap) => swap.pos >= 0 && swap.pos + swap.size <= state.doc.content.size)
                  .map((swap) =>
                    Decoration.node(
                      swap.pos,
                      swap.pos + swap.size,
                      { "data-band-swap": "true", style: `${BAND_LINE_SWAP_PROPERTY}: ${swap.shiftPx}px` },
                      { bandSwap: `${swap.pos}:${swap.shiftPx}` },
                    ),
                  ),
              );
        }
        return tr.docChanged ? value.map(tr.mapping, tr.doc) : value;
      },
    },
    props: {
      decorations: (state) => bandLineSwapKey.getState(state),
    },
    view(view) {
      let frame = 0;
      let last = "";
      let passes = 0;
      let windowStart = 0;
      const run = () => {
        frame = 0;
        if (!view.dom.isConnected || view.composing) return;
        const now = performance.now();
        if (now - windowStart > PASS_WINDOW_MS) {
          windowStart = now;
          passes = 0;
        }
        if (passes >= MAX_PASSES_PER_WINDOW) return;
        let swaps: Swap[];
        try {
          swaps = planSwaps(view);
        } catch {
          return;
        }
        const signature = swaps.map((swap) => `${swap.pos}:${swap.shiftPx}`).join(",");
        if (signature === last) return;
        last = signature;
        passes += 1;
        view.dispatch(view.state.tr.setMeta(SET_SWAPS, swaps).setMeta("addToHistory", false));
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
  });
}

// ---------------------------------------------------------------------------
// A side float that reaches the lines ABOVE its own paragraph.
// ---------------------------------------------------------------------------

/**
 * Word places a Square / Tight / Through object from its anchor paragraph's
 * top as that paragraph stands BEFORE the object wraps anything, and then
 * wraps every line the object's band reaches — the lines of the paragraphs
 * above included. A paragraph's last line reaches down through the
 * paragraph's space after, so an object at offset 0 (its band starting where
 * the paragraph above ends) already takes that paragraph's last line (Word
 * 16, `mrfloat/tall-square.docx`: a 3" picture at the top of paragraph 10
 * sends the last line of paragraph 9 around itself and the document grows a
 * page; at +1pt the line above stays whole; at -20pt the picture stands 20pt
 * higher and takes the same line). The object itself does not move when the
 * paragraph above grows a line: its place was fixed by the unwrapped flow.
 *
 * A CSS float only wraps the lines that FOLLOW it (and its top margin, which
 * is how a picture is dropped below its paragraph's top, shortens the lines
 * above the picture too, which Word leaves whole), so the picture leaves the
 * flow (an overlay at Word's place) and the topmost paragraph whose lines the
 * band reaches — the anchor paragraph itself for a dropped picture — gets a
 * SHADOW of the band: a zero-content float widget at its
 * start, reaching from the paragraph's top down to the band's bottom, whose
 * `shape-outside` is the band alone (an `inset()` cutting the part above the
 * band away, so the lines above it stay whole — a float's whole margin box
 * shortens lines, its shape does not). The shadow wraps that paragraph's
 * crossed lines and, hanging below the paragraph, every following line the
 * same way the picture's own float did. The float layout pass computes the
 * shadow (hiding the one in place to read the unwrapped flow) and publishes it
 * on the picture's wrapper; this plugin draws it. Nothing is stored.
 */
export const FLOAT_SHADOW_SPEC_ATTR = "data-float-shadow";
export const FLOAT_SHADOW_ELEMENT_ATTR = "data-float-wrap-shadow";
const SET_SHADOWS = "floatShadowWrap$set";
const MAX_SHADOW_DISPATCHES_PER_WINDOW = 40;

export interface FloatShadowSpec {
  /** The picture's own id (`data-float-shadow-id` on its wrapper). */
  readonly id: string;
  /** Document position at the start of the paragraph the shadow lives in. */
  readonly pos: number;
  readonly side: "left" | "right";
  /** The float's box: from the paragraph's content top to the band's bottom. */
  readonly widthPx: number;
  readonly heightPx: number;
  /** Margin on the shadow's own side (right for a right float). */
  readonly marginSidePx: number;
  /** The wrap shape inside the box: the band (`inset`) or the wrap polygon. */
  readonly shapeOutside: string;
  readonly shapeMarginPx: number;
}

const floatShadowWrapKey = new PluginKey<DecorationSet>("floatShadowWrap");

function shadowSignature(spec: FloatShadowSpec): string {
  return [
    spec.id, spec.pos, spec.side, spec.widthPx, spec.heightPx,
    spec.marginSidePx, spec.shapeOutside, spec.shapeMarginPx,
  ].join("|");
}

function shadowElement(spec: FloatShadowSpec): HTMLElement {
  const element = document.createElement("span");
  element.setAttribute(FLOAT_SHADOW_ELEMENT_ATTR, spec.id);
  element.setAttribute("aria-hidden", "true");
  element.contentEditable = "false";
  const px = (value: number) => `${value.toFixed(2)}px`;
  element.style.cssText =
    `display:block;float:${spec.side};width:${px(spec.widthPx)};height:${px(spec.heightPx)};` +
    `margin:0 ${spec.side === "right" ? px(spec.marginSidePx) : "0"} 0 ${spec.side === "left" ? px(spec.marginSidePx) : "0"};` +
    `shape-outside:${spec.shapeOutside};shape-margin:${px(spec.shapeMarginPx)};` +
    "pointer-events:none;user-select:none;";
  return element;
}

/**
 * The shadow specs the picture wrappers of the view publish, by id.
 * `published`: the wrappers carrying a spec, when the caller has just walked
 * the document for them (the float layout pass does).
 */
export function readFloatShadowSpecs(view: EditorView, published?: readonly HTMLElement[]): FloatShadowSpec[] {
  const specs: FloatShadowSpec[] = [];
  (published ?? view.dom.querySelectorAll<HTMLElement>(`[${FLOAT_SHADOW_SPEC_ATTR}]`)).forEach((element) => {
    try {
      const parsed = JSON.parse(element.getAttribute(FLOAT_SHADOW_SPEC_ATTR) ?? "null") as FloatShadowSpec | null;
      if (parsed && typeof parsed.id === "string" && Number.isFinite(parsed.pos)) specs.push(parsed);
    } catch {
      // A wrapper mid-update carries no readable spec; it is read next pass.
    }
  });
  return specs.sort((left, right) => left.pos - right.pos || left.id.localeCompare(right.id));
}

function shadowDecorations(state: EditorState, specs: readonly FloatShadowSpec[]): DecorationSet {
  if (specs.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    state.doc,
    specs
      .filter((spec) => spec.pos > 0 && spec.pos <= state.doc.content.size)
      .map((spec) =>
        Decoration.widget(spec.pos, () => shadowElement(spec), {
          side: -1,
          key: `float-shadow-${shadowSignature(spec)}`,
          floatShadow: true,
          ignoreSelection: true,
        }),
      ),
  );
}

function currentShadowSignature(view: EditorView): string {
  const set = floatShadowWrapKey.getState(view.state);
  if (!set) return "";
  return set
    .find(undefined, undefined, (spec) => spec.floatShadow === true)
    .map((decoration) => String(decoration.spec.key ?? ""))
    .sort()
    .join(",");
}

/**
 * Draw the shadows the wrappers ask for. Called by the float layout pass once
 * it has placed the pictures; a dispatch here re-lays the page, and the next
 * pass finds the same specs and stops.
 */
export function syncFloatShadows(
  view: EditorView,
  budget: { count: number; windowStart: number },
  published?: readonly HTMLElement[],
): void {
  if (!floatShadowWrapKey.getState(view.state) || view.isDestroyed || view.composing) return;
  const specs = readFloatShadowSpecs(view, published);
  const wanted = specs.map((spec) => `float-shadow-${shadowSignature(spec)}`).sort().join(",");
  if (wanted === currentShadowSignature(view)) return;
  const now = performance.now();
  if (now - budget.windowStart > PASS_WINDOW_MS) {
    budget.windowStart = now;
    budget.count = 0;
  }
  if (budget.count >= MAX_SHADOW_DISPATCHES_PER_WINDOW) return;
  budget.count += 1;
  view.dispatch(view.state.tr.setMeta(SET_SHADOWS, specs).setMeta("addToHistory", false));
}

export function createFloatShadowWrapPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: floatShadowWrapKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, value, _old, state) {
        const specs = tr.getMeta(SET_SHADOWS) as readonly FloatShadowSpec[] | undefined;
        if (specs) return shadowDecorations(state, specs);
        return tr.docChanged ? value.map(tr.mapping, tr.doc) : value;
      },
    },
    props: {
      decorations: (state) => floatShadowWrapKey.getState(state),
    },
  });
}
