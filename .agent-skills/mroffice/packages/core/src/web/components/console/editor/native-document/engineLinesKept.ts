/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** One correction, its positions from the textblock's. */
export interface KeptSpan {
  readonly from: number;
  readonly to: number;
  readonly extra: number;
  readonly base: number;
  readonly wordExtra: number;
  readonly wordBase: number;
  readonly tabBreak?: true;
  /** An optional hyphen where the engine ends a line inside a word. */
  readonly hyphen?: true;
  /** The engine hyphenates the paragraph (`from === to` at its content). */
  readonly manualHyphens?: true;
  /** The hyphen a page cut's head ends with (`from === to` at its end). */
  readonly headHyphen?: true;
  /** A word joiner between closing punctuation and an opening bracket
   * (`from === to`, before the bracket). */
  readonly joiner?: true;
}

/** A span's kind as a row keeps it (its seventh number). */
const KIND_TAB_BREAK = 1;
const KIND_HYPHEN = 2;
const KIND_MANUAL_HYPHENS = 3;
const KIND_HEAD_HYPHEN = 4;
const KIND_JOINER = 5;
const kindOf = (span: KeptSpan): number =>
  span.tabBreak ? KIND_TAB_BREAK : span.hyphen ? KIND_HYPHEN : span.manualHyphens ? KIND_MANUAL_HYPHENS : span.headHyphen ? KIND_HEAD_HYPHEN
    : span.joiner ? KIND_JOINER : 0;
const kindFields = (kind: number | undefined) =>
  kind === KIND_TAB_BREAK ? { tabBreak: true as const }
    : kind === KIND_HYPHEN ? { hyphen: true as const }
      : kind === KIND_MANUAL_HYPHENS ? { manualHyphens: true as const }
        : kind === KIND_HEAD_HYPHEN ? { headHyphen: true as const }
          : kind === KIND_JOINER ? { joiner: true as const } : {};

export interface KeptLines {
  readonly width: number;
  /** The engine left the paragraph to the browser (its tab breaks, if any,
   * are the spans). */
  readonly declined: boolean;
  readonly spans: readonly KeptSpan[];
}

const drawn = new WeakMap<ProseMirrorNode, KeptLines>();
const seeded = new WeakMap<ProseMirrorNode, KeptLines & { readonly generation: number }>();
/** Seeds from before the last edit are retired (`retireSeededLines`). */
let generation = 0;

/** Something was edited: nothing restored is taken back from now on. */
export function retireSeededLines(): void {
  generation += 1;
  if (typeof window !== "undefined") {
    const holder = window as Window & { __docsSeededLinesRetired?: number };
    holder.__docsSeededLinesRetired = (holder.__docsSeededLinesRetired ?? 0) + 1;
  }
}

/** Numbers per span in a row. */
const SPAN_NUMBERS = 7;
/** A textblock with nothing noted. */
const UNKNOWN = -1;
const SAME_WIDTH_PX = 0.01;

export function engineLinesKeptOn(win: Window | null | undefined = typeof window === "undefined" ? null : window): boolean {
  return (win as (Window & { __docsEngineLinesKept?: boolean }) | null | undefined)?.__docsEngineLinesKept !== false;
}

/** What the pass drew for `node` at `pos`, measured at `width`. */
export function noteDrawnLines(
  node: ProseMirrorNode, pos: number, width: number | null,
  spans: readonly KeptSpan[],
  declined = false,
): void {
  if (width === null || !Number.isFinite(width)) {
    drawn.delete(node);
    return;
  }
  const at = pos + 1;
  drawn.set(node, {
    width,
    declined,
    spans: spans.map((span) => ({
      from: span.from - at, to: span.to - at, extra: span.extra, base: span.base, wordExtra: span.wordExtra, wordBase: span.wordBase,
      ...kindFields(kindOf(span)),
    })),
  });
}

/** Nothing known of what `node` draws (a reading that gave no answer). */
export function forgetDrawnLines(node: ProseMirrorNode): void {
  drawn.delete(node);
}

/** The width a textblock was last measured at, when it was. */
export function drawnLinesWidth(node: ProseMirrorNode): number | null {
  return drawn.get(node)?.width ?? null;
}

/** What a restored row says `node` draws at `width`, if it says. */
export function seededLinesFor(node: ProseMirrorNode, width: number): KeptLines | null {
  const kept = seeded.get(node);
  if (!kept || kept.generation !== generation || Math.abs(kept.width - width) > SAME_WIDTH_PX) return null;
  return kept;
}

/** The spans of kept lines, at the textblock's position. */
export function spansAt<T extends KeptSpan>(kept: KeptLines, pos: number): T[] {
  const at = pos + 1;
  return kept.spans.map((span) => ({ ...span, from: span.from + at, to: span.to + at })) as T[];
}

function textblocksOf(block: ProseMirrorNode): ProseMirrorNode[] {
  if (block.isTextblock) return [block];
  const out: ProseMirrorNode[] = [];
  block.descendants((node) => {
    if (node.isTextblock) {
      out.push(node);
      return false;
    }
    return true;
  });
  return out;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** A top-level block's textblocks as a row keeps them; null when none of
 * them is noted. */
export function encodedBlockLines(block: ProseMirrorNode): number[] | null {
  const out: number[] = [];
  let any = false;
  for (const node of textblocksOf(block)) {
    const kept = drawn.get(node);
    if (!kept) {
      out.push(UNKNOWN);
      continue;
    }
    any = true;
    out.push(round4(kept.width), kept.declined ? 1 : 0, kept.spans.length);
    for (const span of kept.spans) {
      out.push(span.from, span.to, round4(span.extra), round4(span.base), round4(span.wordExtra), round4(span.wordBase), kindOf(span));
    }
  }
  return any ? out : null;
}

/** A row's lines for this block's textblocks. Whether they fitted. */
export function seedBlockLines(block: ProseMirrorNode, encoded: readonly number[] | null | undefined): boolean {
  if (!encoded) return true;
  const nodes = textblocksOf(block);
  const parsed: Array<[ProseMirrorNode, KeptLines & { generation: number }]> = [];
  let at = 0;
  for (const node of nodes) {
    if (at >= encoded.length) return false;
    const width = encoded[at]!;
    if (width === UNKNOWN) {
      at += 1;
      continue;
    }
    const declined = encoded[at + 1] === 1;
    const count = encoded[at + 2]!;
    at += 3;
    if (!Number.isInteger(count) || count < 0 || at + count * SPAN_NUMBERS > encoded.length) return false;
    const spans: KeptSpan[] = [];
    for (let index = 0; index < count; index += 1, at += SPAN_NUMBERS) {
      const from = encoded[at]!, to = encoded[at + 1]!;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > node.content.size) return false;
      spans.push({
        from, to, extra: encoded[at + 2]!, base: encoded[at + 3]!, wordExtra: encoded[at + 4]!, wordBase: encoded[at + 5]!,
        ...kindFields(encoded[at + 6]),
      });
    }
    parsed.push([node, { width, declined, spans, generation }]);
  }
  if (at !== encoded.length) return false;
  for (const [node, kept] of parsed) seeded.set(node, kept);
  return true;
}

/** The kept layout is not this reader's: its lines go with it. */
export function forgetSeededBlockLines(block: ProseMirrorNode): void {
  for (const node of textblocksOf(block)) {
    seeded.delete(node);
    autoSeeded.delete(node);
  }
}

/* ---- Auto line spacing's line boxes --------------------------------------- */

/** One of a textblock's line-box decorations, its positions from the
 * block's (documentAutoLineSpacing's BlockDecoration). */
export interface KeptAutoLineItem {
  inline: boolean;
  from: number;
  to: number;
  attrs: Record<string, string>;
  spec: Record<string, unknown>;
  strut?: number;
  strutTop?: boolean;
  strutBare?: boolean;
}

export function autoLinesKeptOn(win: Window | null | undefined = typeof window === "undefined" ? null : window): boolean {
  return (win as (Window & { __docsAutoLinesKept?: boolean }) | null | undefined)?.__docsAutoLinesKept !== false;
}

const autoDrawn = new WeakMap<ProseMirrorNode, { model: string; items: readonly KeptAutoLineItem[]; current: () => boolean }>();
const autoSeeded = new WeakMap<ProseMirrorNode, { model: string; items: readonly KeptAutoLineItem[]; generation: number }>();

/** A short digest (53 bits, base 36) of what a block's model said. */
export function autoLineModelDigest(model: string): string {
  let h1 = 0xdeadbeef ^ 0x2f, h2 = 0x41c6ce57 ^ 0x2f;
  for (let index = 0; index < model.length; index += 1) {
    const code = model.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const NUMBER = String.raw`-?\d{1,7}(?:\.\d{1,20})?(?:e-?\d{1,3})?`;
/** What a kept line box's style may say (the server's _LINES_STYLE). */
const KEPT_STYLE = new RegExp(
  String.raw`^(?:--(?:document-auto-line-(?:height|natural|fraction)|document-list-marker-strut-(?:height|shift)` +
  String.raw`|docs-list-marker-line-height|doc-word-line-shift|doc-list-item-shift|picture-line-extra)|font-size)` +
  `:${NUMBER}px$|^--document-auto-line-multiple:${NUMBER}$|^vertical-align:(?:top|bottom)$`,
);
const KEPT_CLASSES = new Set(["document-auto-linebox", "document-auto-line-fraction"]);
const KEPT_DATA = new Set(["data-document-auto-intermediates", "data-document-list-marker-strut", "data-document-auto-line-fraction"]);
const KEPT_SPEC_NUMBERS = new Set(["autoLinePixels", "autoLineFraction", "autoLineStrut", "autoLineItemShift", "autoLineMultiple", "autoLinePictureExtra", "autoLineWordShift", "side"]);
const KEPT_SPEC_FLAGS = new Set(["inclusiveEnd", "autoLineLeaf", "autoLineIntermediates", "autoLineStrutTop", "autoLineStrutBare", "autoLineEastAsian", "autoLinePictureOnly", "ignoreSelection"]);
const KEPT_SPEC_PAIRS = new Set(["autoLineMarkerStrut", "autoLineCustomMarker"]);
const KEPT_PAIR = new RegExp(`^${NUMBER}:${NUMBER}$`);
const KEPT_STRUT_KEY = new RegExp(`^document-auto-line-strut:${NUMBER}(?::top)?(?::bare)?$`);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000;

/** A decoration holding nothing but a line box, as the server keeps it. */
export function keepableAutoLineItem(item: KeptAutoLineItem): boolean {
  if (item.strut !== undefined) return finite(item.strut);
  for (const [key, value] of Object.entries(item.attrs)) {
    if (typeof value !== "string" || value.length > 512) return false;
    if (key === "class") {
      if (value.split(/\s+/).some((token) => token && !KEPT_CLASSES.has(token))) return false;
    } else if (key === "nodeName") {
      if (value !== "span") return false;
    } else if (key === "style") {
      if (value.split(";").map((part) => part.replace(/\s+/g, "")).some((part) => part && !KEPT_STYLE.test(part))) return false;
    } else if (!KEPT_DATA.has(key) || value !== "true") return false;
  }
  for (const [key, value] of Object.entries(item.spec)) {
    if (KEPT_SPEC_NUMBERS.has(key)) {
      if (!finite(value)) return false;
    } else if (KEPT_SPEC_FLAGS.has(key)) {
      if (typeof value !== "boolean") return false;
    } else if (KEPT_SPEC_PAIRS.has(key)) {
      if (typeof value !== "string" || !KEPT_PAIR.test(value)) return false;
    } else if (key === "key") {
      if (typeof value !== "string" || !KEPT_STRUT_KEY.test(value)) return false;
    } else return false;
  }
  return true;
}

/** What a textblock's line boxes were measured to, while `current` says the
 * measurement still stands (its cache's entry). */
export function noteDrawnAutoLines(node: ProseMirrorNode, model: string, items: readonly KeptAutoLineItem[], current: () => boolean): void {
  autoDrawn.set(node, { model, items, current });
}

/** A strut's spec is made again from its numbers. */
function itemOut(item: KeptAutoLineItem): KeptAutoLineItem {
  return item.strut !== undefined
    ? { inline: false, from: item.from, to: item.to, attrs: {}, spec: {}, strut: item.strut, ...(item.strutTop ? { strutTop: true } : {}), ...(item.strutBare ? { strutBare: true } : {}) }
    : { inline: item.inline, from: item.from, to: item.to, attrs: item.attrs, spec: item.spec };
}

/** A top-level block's textblocks' line boxes as a row keeps them: per
 * textblock null (measured where it opens) or [model digest, boxes]. */
export function encodedBlockAutoLines(block: ProseMirrorNode): Array<[string, KeptAutoLineItem[]] | null> | null {
  let any = false;
  const out = textblocksOf(block).map((node): [string, KeptAutoLineItem[]] | null => {
    const kept = autoDrawn.get(node);
    if (!kept || !kept.current()) return null;
    const items = kept.items.map(itemOut);
    if (!items.every(keepableAutoLineItem)) return null;
    any = true;
    return [autoLineModelDigest(kept.model), items];
  });
  return any ? out : null;
}

/** A row's line boxes for this block's textblocks. Whether they fitted. */
export function seedBlockAutoLines(block: ProseMirrorNode, encoded: unknown): boolean {
  if (encoded === null || encoded === undefined) return true;
  const nodes = textblocksOf(block);
  if (!Array.isArray(encoded) || encoded.length !== nodes.length) return false;
  const parsed: Array<[ProseMirrorNode, string, KeptAutoLineItem[]]> = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const entry = encoded[index] as unknown;
    if (entry === null) continue;
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !Array.isArray(entry[1])) return false;
    const node = nodes[index]!;
    const items = entry[1] as KeptAutoLineItem[];
    if (!items.every((item) => item && typeof item === "object" && typeof item.from === "number" && typeof item.to === "number" &&
      item.from >= 0 && item.from <= item.to && item.to <= node.nodeSize && typeof item.attrs === "object" && item.attrs !== null &&
      typeof item.spec === "object" && item.spec !== null && keepableAutoLineItem(item))) return false;
    parsed.push([node, entry[0], items]);
  }
  for (const [node, model, items] of parsed) autoSeeded.set(node, { model, items, generation });
  return true;
}

/** The line boxes a restored row drew for `node`, when its model reads as it
 * did (`model`: the pass's model key). */
export function seededAutoLinesFor(node: ProseMirrorNode, model: string): readonly KeptAutoLineItem[] | null {
  const kept = autoSeeded.get(node);
  if (!kept || kept.generation !== generation || kept.model !== autoLineModelDigest(model)) return null;
  return kept.items;
}
