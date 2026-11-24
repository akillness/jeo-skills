"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Hyphenation Options on the page (Layout > Hyphenation; Microsoft
 * Support, "Hyphenate text in Word"), over the browser's own hyphenation
 * (`hyphens: auto`, documentAutoHyphenation):
 *
 * - Hyphenate words in CAPS off (`w:doNotHyphenateCaps`): a word in capitals
 *   is never broken.
 * - Hyphenation zone (`w:hyphenationZone`, 0.25" when the file states none):
 *   Word breaks the word that does not fit only when moving it whole to the
 *   next line would leave at least the zone empty at the end of the line.
 *   Measured in Word 16 (probe documents, a 2.5" column of Times 12 pt):
 *   a 1" zone leaves 2 of the default zone's 20 breaks.
 * - Limit consecutive hyphens to (`w:consecutiveHyphenLimit`): no more lines
 *   in a row end in a hyphen; Word sets the next one's word whole.
 *
 * The browser decides where a word may break; this only withholds a break
 * Word would not make, by setting that word `hyphens: manual`. A break the
 * browser does not offer cannot be added (Chromium never breaks a word in
 * capitals, which Word does by default). The zone and the limit depend on
 * where lines end, so they are read from the laid-out page: each pass takes
 * the earliest line of each paragraph that breaks a rule, withholds that
 * word, and the next frame reads the paragraph again until none does.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { createBackgroundLane, requestLaneFrame } from "@mrnote/core/web/lib/background-work.ts";

import {
  WORD_DEFAULT_HYPHENATION_ZONE_TWIPS,
  normalizeAutoHyphenation,
  normalizeHyphenationOptions,
  type HyphenationOptions,
} from "@mrnote/core/web/components/console/editor/native-document/documentHyphenation.ts";
import { sheetsWithinMeasureHorizon } from "@mrnote/core/web/components/console/editor/native-document/paged/measureHorizon.ts";
import { paginationLayoutScale } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationGeometry.ts";
import { touchedRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";

const WITHHELD_STYLE = "hyphens:manual;-webkit-hyphens:manual";
/** A word in capitals: two or more letters, all upper case. */
const CAPS_WORD_RE = /\p{Lu}[\p{Lu}\p{M}]+/gu;
const WORD_RE = /[\p{L}\p{M}\p{N}'’]+/gu;
/** A paragraph read more often than this in one opening is left as it is. */
const MAX_PASSES_PER_BLOCK = 64;

interface RulesState {
  /** Words withheld for the zone or the limit, read from the page. */
  readonly measured: DecorationSet;
  /** Words in capitals, when Word's option is off. */
  readonly caps: DecorationSet;
}

type RulesMeta = { readonly withhold: readonly { from: number; to: number }[] } | { readonly reset: true };

export const documentHyphenationRulesKey = new PluginKey<RulesState>("documentHyphenationRules");

function options(doc: ProseMirrorNode): HyphenationOptions | null {
  const attrs = doc.attrs as Record<string, unknown>;
  if (!normalizeAutoHyphenation(attrs.autoHyphenation)) return null;
  return normalizeHyphenationOptions(attrs.hyphenationOptions) ?? {};
}

function withheld(from: number, to: number): Decoration {
  return Decoration.inline(from, to, { style: WITHHELD_STYLE, "data-hyphen-withheld": "true" }, { hyphenWithheld: true });
}

function capsDecorations(doc: ProseMirrorNode, from = 0, to = doc.content.size): Decoration[] {
  const out: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if ((node.attrs as Record<string, unknown>).suppressAutoHyphens === true) return false;
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) return;
      for (const match of child.text.matchAll(CAPS_WORD_RE)) {
        const start = pos + 1 + offset + (match.index ?? 0);
        out.push(withheld(start, start + match[0].length));
      }
    });
    return false;
  });
  return out;
}

function allCaps(doc: ProseMirrorNode): DecorationSet {
  return options(doc)?.hyphenateCaps === false ? DecorationSet.create(doc, capsDecorations(doc)) : DecorationSet.empty;
}

/** The textblocks an edit touched, as [from, to) ranges of the new doc. */
function touchedBlocks(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  const size = tr.doc.content.size;
  // Every range a step reached, a format step (All Caps, a size, which moves
  // no position) included.
  for (const [rangeFrom, rangeTo] of touchedRanges(tr)) {
    const start = Math.max(0, Math.min(rangeFrom, size));
    const end = Math.max(start, Math.min(rangeTo, size));
    const $from = tr.doc.resolve(start);
    const $to = tr.doc.resolve(end);
    ranges.push([$from.depth > 0 ? $from.before($from.depth) : start, $to.depth > 0 ? $to.after($to.depth) : end]);
  }
  return ranges;
}

function applyRules(tr: Transaction, value: RulesState, oldState: EditorState, state: EditorState): RulesState {
  const meta = tr.getMeta(documentHyphenationRulesKey) as RulesMeta | undefined;
  if (meta && "reset" in meta) return { measured: DecorationSet.empty, caps: allCaps(state.doc) };
  let { measured, caps } = value;
  if (tr.docChanged) {
    if (oldState.doc.attrs !== state.doc.attrs) return { measured: DecorationSet.empty, caps: allCaps(state.doc) };
    measured = measured.map(tr.mapping, tr.doc);
    caps = caps.map(tr.mapping, tr.doc);
    const capsOn = options(state.doc)?.hyphenateCaps === false;
    for (const [from, to] of touchedBlocks(tr)) {
      // A paragraph that changed is read again from the browser's breaks.
      measured = measured.remove(measured.find(from, to));
      if (capsOn) {
        caps = caps.remove(caps.find(from, to));
        caps = caps.add(tr.doc, capsDecorations(tr.doc, from, to));
      }
    }
  }
  if (meta && "withhold" in meta && meta.withhold.length > 0) {
    measured = measured.add(tr.doc, meta.withhold.map(({ from, to }) => withheld(from, to)));
  }
  return { measured, caps };
}

interface MeasuredWord {
  readonly from: number;
  readonly to: number;
  /** Line boxes of the word (two or more when the browser broke it). */
  readonly rects: readonly DOMRect[];
}

/** The words of one paragraph with their line boxes, in order. */
function paragraphWords(view: EditorView, node: ProseMirrorNode, pos: number): MeasuredWord[] {
  const words: MeasuredWord[] = [];
  const range = view.dom.ownerDocument.createRange();
  node.forEach((child, offset) => {
    if (!child.isText || !child.text) return;
    for (const match of child.text.matchAll(WORD_RE)) {
      const from = pos + 1 + offset + (match.index ?? 0);
      const to = from + match[0].length;
      let start: { node: Node; offset: number };
      let end: { node: Node; offset: number };
      try {
        start = view.domAtPos(from, 1);
        end = view.domAtPos(to, -1);
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
      } catch {
        continue;
      }
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      if (rects.length > 0) words.push({ from, to, rects });
    }
  });
  return words;
}

/** One line's top in client px, for grouping boxes into lines. */
const sameLine = (a: DOMRect, b: DOMRect) => Math.abs(a.top - b.top) < Math.max(2, Math.min(a.height, b.height) / 2);

/** The earliest word of the paragraph a rule withholds, or null. */
function firstViolation(
  view: EditorView,
  element: HTMLElement,
  node: ProseMirrorNode,
  pos: number,
  rules: HyphenationOptions,
): { from: number; to: number } | null {
  const words = paragraphWords(view, node, pos);
  if (!words.some((word) => word.rects.length > 1)) return null;
  const style = getComputedStyle(element);
  const scale = paginationLayoutScale(element).x || 1;
  const box = element.getBoundingClientRect();
  const right = (box.right - (Number.parseFloat(style.paddingRight) || 0) * scale - (Number.parseFloat(style.borderRightWidth) || 0) * scale);
  const zonePx = ((rules.zoneTwips ?? WORD_DEFAULT_HYPHENATION_ZONE_TWIPS) / 1440) * 96 * scale;
  const limit = rules.consecutiveLimit ?? 0;
  const canvas = view.dom.ownerDocument.createElement("canvas").getContext("2d");
  const justified = style.textAlign === "justify";
  const zoneApplies = justified || style.textAlign === "left" || style.textAlign === "start" ||
    (style.textAlign === "end" && style.direction === "rtl");
  let run = 0;
  let previousLineTop: number | null = null;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    if (word.rects.length < 2) continue;
    const first = word.rects[0]!;
    // Consecutive hyphenated lines: this line follows the last one that ended
    // in a hyphen when nothing else ended a line between them.
    const linesSince = previousLineTop === null ? null : countLineStarts(words, previousLineTop, first.top);
    run = linesSince === 1 ? run + 1 : 1;
    previousLineTop = first.top;
    if (limit > 0 && run > limit) return { from: word.from, to: word.to };
    // The zone: what the line would leave empty with the word moved whole to
    // the next one. The line's text ends at the character before the space
    // that precedes the word (punctuation included); a justified line's
    // stretched spaces are not room. Lines set centred or to the right have
    // no such room; Word's zone is a left-aligned and justified rule.
    if (!zoneApplies) continue;
    const before = words.slice(0, index).filter((other) => sameLine(other.rects[other.rects.length - 1]!, first));
    if (before.length === 0) continue;
    const endX = characterRight(view, word.from - 1);
    if (endX === null) continue;
    let naturalEnd = endX;
    if (justified && canvas && before.length > 1) {
      // A space between two words of the line (the one at its end hangs).
      const space = characterBox(view, before[0]!.to + 1);
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const normal = canvas.measureText(" ").width * scale;
      if (space) naturalEnd -= Math.max(0, space.width - normal) * (before.length - 1);
    }
    const room = right - naturalEnd;
    if (room < zonePx) return { from: word.from, to: word.to };
  }
  return null;
}

/** The client box of the one character at document position `pos`. */
function characterBox(view: EditorView, pos: number): DOMRect | null {
  try {
    const start = view.domAtPos(pos - 1, 1);
    const end = view.domAtPos(pos, -1);
    const range = view.dom.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    return rects[rects.length - 1] ?? null;
  } catch {
    return null;
  }
}

/** Where the text before position `pos` ends on its line (the character
 * before the space at `pos`), in client px. */
function characterRight(view: EditorView, pos: number): number | null {
  return characterBox(view, pos)?.right ?? null;
}

/** How many lines start between two line tops (exclusive of the first). */
function countLineStarts(words: readonly MeasuredWord[], fromTop: number, toTop: number): number {
  const tops = new Set<number>();
  for (const word of words) {
    for (const rect of word.rects) {
      if (rect.top > fromTop + 1 && rect.top <= toTop + 1) tops.add(Math.round(rect.top));
    }
  }
  return tops.size;
}

export const DocumentHyphenationRules = Extension.create({
  name: "documentHyphenationRules",

  addProseMirrorPlugins() {
    return [
      new Plugin<RulesState>({
        key: documentHyphenationRulesKey,
        state: {
          init: (_config, state) => ({ measured: DecorationSet.empty, caps: allCaps(state.doc) }),
          apply: applyRules,
        },
        props: {
          decorations(state) {
            const value = documentHyphenationRulesKey.getState(state);
            if (!value) return DecorationSet.empty;
            if (value.caps === DecorationSet.empty) return value.measured;
            if (value.measured === DecorationSet.empty) return value.caps;
            return value.measured.add(state.doc, value.caps.find());
          },
        },
        view(view) {
          const win = view.dom.ownerDocument.defaultView;
          const lane = createBackgroundLane({
            label: "docs-hyphenation-rules",
            owner: () => view.dom.closest(".wm-window") ?? view.dom,
          });
          const passes = new WeakMap<ProseMirrorNode, number>();
          let cancel: (() => void) | null = null;
          let destroyed = false;
          const measure = () => {
            cancel = null;
            if (destroyed || view.isDestroyed || !view.dom.isConnected) return;
            const rules = options(view.state.doc);
            if (!rules) return;
            const horizon = sheetsWithinMeasureHorizon(view.dom);
            const withhold: { from: number; to: number }[] = [];
            view.state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              if ((node.attrs as Record<string, unknown>).suppressAutoHyphens === true) return false;
              const element = view.nodeDOM(pos);
              if (!(element instanceof HTMLElement) || element.getAttribute("data-auto-hyphenation") !== "true") return false;
              // A paragraph the line engine hyphenates by Word's rules itself
              // (documentEngineLineBreaks' DOCS_ENGINE_HYPHENATION_ATTR).
              if (element.getAttribute("data-docs-engine-hyphenation") === "true") return false;
              if (horizon && !horizon.has(element.closest("article[data-page-sheet]") ?? element)) return false;
              const count = passes.get(node) ?? 0;
              if (count >= MAX_PASSES_PER_BLOCK) return false;
              const violation = firstViolation(view, element, node, pos, rules);
              if (violation) {
                passes.set(node, count + 1);
                withhold.push(violation);
              }
              return false;
            });
            if (withhold.length === 0) return;
            view.dispatch(view.state.tr.setMeta(documentHyphenationRulesKey, { withhold }).setMeta("addToHistory", false));
            view.dom.dispatchEvent(new CustomEvent("mrn-page-rebalance", { bubbles: true, detail: { reason: "hyphenation-rules" } }));
            schedule();
          };
          const schedule = () => {
            if (cancel || destroyed || !win || !options(view.state.doc)) return;
            cancel = requestLaneFrame(lane, measure, win);
          };
          // A face arriving voids the breaks withheld under the old widths.
          // With none withheld there is nothing to reset: the transaction
          // ran every plugin and subscriber over the whole document for each
          // subset a Chinese book fetched (0.56 s of a 271-page reopening).
          const onFonts = () => {
            if (documentHyphenationRulesKey.getState(view.state)?.measured !== DecorationSet.empty) {
              view.dispatch(view.state.tr.setMeta(documentHyphenationRulesKey, { reset: true }).setMeta("addToHistory", false));
            }
            schedule();
          };
          view.dom.ownerDocument.fonts?.addEventListener?.("loadingdone", onFonts);
          schedule();
          return {
            update(current, previous) {
              if (current.state.doc !== previous.doc) schedule();
            },
            destroy() {
              destroyed = true;
              cancel?.();
              lane.dispose();
              view.dom.ownerDocument.fonts?.removeEventListener?.("loadingdone", onFonts);
            },
          };
        },
      }),
    ];
  },
});
