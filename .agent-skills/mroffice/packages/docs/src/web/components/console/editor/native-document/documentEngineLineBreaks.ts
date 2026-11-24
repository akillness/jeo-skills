/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Docs lines break where the text engine breaks them (lib/text-engine,
 * PLAN-phase2.md; flag `docs`, `?textEngine=on`).
 *
 * The engine fills each paragraph's lines the way Word does, from the
 * served font files (docs-lines.ts). The browser still draws the text; where
 * its own line breaker would break elsewhere -- its glyph advances a hair
 * wider or narrower than the file's, a justified line Word keeps by
 * narrowing its spaces -- this plugin spreads the difference over that line's
 * letter spacing, so the drawn line is as wide as the computed one and the
 * browser's breaker lands on the engine's break. A line it still breaks
 * elsewhere is corrected again, whatever the widths said, a few rounds at
 * most. Paint and line breaking only: nothing is saved, and with the flag off
 * the plugin does nothing.
 *
 * Only the paragraphs a transaction touched are measured again (typing
 * re-reads one paragraph); a font landing re-reads them all.
 */
import { coldFirstLayout, firstLayoutHoldsFaces } from "@mrnote/core/web/components/console/editor/native-document/paged/coldFirstLayout.ts";
import { noteEngineDeclinedBlock, takeEngineDeclinedNews } from "./engineDeclinedBlocks";
import { drawnLinesWidth, engineLinesKeptOn, forgetDrawnLines, noteDrawnLines, retireSeededLines, seededLinesFor, spansAt } from "@mrnote/core/web/components/console/editor/native-document/engineLinesKept.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { bandTabLayoutKey } from "./paged/bandTabLayout";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import {
  auditDocsParagraph,
  DOCS_ENGINE_BASE_SPACING_ATTR,
  DOCS_ENGINE_BASE_WORD_SPACING_ATTR,
  DOCS_ENGINE_LINE_ATTR,
  DOCS_ENGINE_TAB_BREAK_CLASS,
  docsBrowserAgreesQuickly,
  docsBrowserLineStarts,
  docsParagraphBesideFloat,
  type DocsFloatCache,
  docsDrawnWidths,
  docsStretchDrawnWidth,
  docsEngineLineStarts,
  docsLastLineOverhangs,
  engineBreakStrutOff,
  docsLineOpensWithSpace,
  DOCS_ENGINE_HYPHEN_CLASS,
  DOCS_ENGINE_JOINER_CLASS,
  docsBracketJoins,
  DOCS_ENGINE_HEAD_HYPHEN_CLASS,
  docsHyphenationOff,
  hyphenPointKind,
  normalizeStarts,
  planDocsLineCorrections,
  readDocsParagraph,
  type DocsLayoutRules,
  type DocsParagraph,
} from "@mrnote/core/web/lib/text-engine/docs-lines.ts";
import type { KinsokuList } from "@mrnote/core/web/lib/text-engine/kinsoku.ts";
import { withDocsAutoHyphenation } from "@mrnote/core/web/lib/text-engine/docs-hyphenation.ts";
import { hyphenationPoints } from "@mrnote/core/web/lib/text-engine/hyphenation.ts";
import { normalizeAutoHyphenation, normalizeHyphenationOptions } from "@mrnote/core/web/components/console/editor/native-document/documentHyphenation.ts";
import { layoutDocsBlockLines } from "@mrnote/core/web/lib/text-engine/docs-block-layout.ts";
import { textEngineEnabled } from "@mrnote/core/web/lib/text-engine/flags.ts";
import { textEngineOn } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { docsBlockLineRule, noteEngineBlockLines, noteEngineHeadLines, noteEngineTailLines, setEngineJoinedRows, type EngineRowStart } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerEngineLines.ts";
import { normalizeWordCompatibilityMode } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import { wordSetsIdeographsAsLetters, wordEastAsianLineRulesApply } from "@mrnote/core/web/components/console/editor/native-document/wordFarEastDefaults.ts";
import { touchedTextblockRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";
import { isImeCompositionActive, onImeCompositionSettled } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { DOCUMENT_ENGINE_FACES_WAITING, DOCUMENT_ENGINE_LINES_PENDING, LAYOUT_METRICS_FLUSH_EVENT, writeDocumentLayoutStatus } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { projectionFontReach, sheetRangesOf } from "@mrnote/core/web/components/console/editor/native-document/projectionFontNews.ts";
import { recordProjectedHorizon, sheetsWithinMeasureHorizon } from "@mrnote/core/web/components/console/editor/native-document/paged/measureHorizon.ts";
import { createEngineLineCache, familyNews, type EngineLineCache, type EngineLineKey, type FamilyNews } from "./engineLineCache";
import { PAGE_BLOCK_NODE, SPLIT_CONTINUATION_ATTR, SPLIT_CONTINUES_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { fastRangeMappingOn, mapDecorationsFast, mapRangesFast, mergeRanges, removeDecorationsInside, removeDecorationsWithin } from "@mrnote/core/web/components/console/editor/native-document/fastRangeMapping.ts";
import { ENGINE_WORD_EXTRA_VAR } from "./balancedSpaces";
import { textEngineAnswerEpoch, textEngineEpoch } from "@mrnote/core/web/lib/text-engine/measure.ts";
import { msSinceTyping, TYPING_IDLE_MS } from "@mrnote/core/web/lib/typing-session.ts";

export const documentEngineLineBreaksKey = new PluginKey<EngineLinesState>("documentEngineLineBreaks");
const META = "documentEngineLineBreaks";
const BLOCKS_PER_SLICE = 30;
/** Rounds a paragraph is corrected again while the browser still disagrees. */
const MAX_ROUNDS = 4;
/** This projection's coverage record in measureHorizon. */
const ENGINE_LINES_HORIZON_KEY = "engine-lines";
/** How long the page ledger waits for face files the engine still loads. */
const FACE_HOLD_MS = 4000;
/** How long, and how often, paragraphs read while a face was still loading
 * are looked at for the engine's answer (the ledger is not held for this). */
const FACE_WATCH_MS = 60_000;
const FACE_WATCH_STEP_MS = 250;
/** The same under the cold first layout, which reads only the waiting
 * paragraphs again (a look is an epoch comparison). */
const FACE_WATCH_ONCE_STEP_MS = 100;
/** How long after a pass (or a flush) the paragraphs' widths are looked at
 * again, ms, and how many at most a look reads. */
const WIDTH_WATCH_MS = 300;
const WIDTH_WATCH_MAX_BLOCKS = 4000;












const TYPING_PAUSE_MS = 2 * TYPING_IDLE_MS;
const CJK = /[぀-ヿ㐀-鿿가-힯＀-￯]/;

/** Whether `transaction` publishes the engine's line corrections only. */
export function isDocumentEngineLineBreaksTransaction(transaction: { getMeta(key: string): unknown }): boolean {
  return transaction.getMeta(META) !== undefined;
}

export interface Span {
  from: number;
  to: number;
  /** Extra letter spacing, px. */
  extra: number;
  /** The run's own letter spacing, px. */
  base: number;
  /** A line break before a tab that opens a line (`DocsLineCorrection.tabBreak`):
   * `from === to`, at the tab, and no spacing. */
  tabBreak?: true;
  /** Extra word spacing (a kept word's narrowed spaces), px. */
  wordExtra: number;
  /** The run's own word spacing, px. */
  wordBase: number;
  /** A line the engine ends at an automatic hyphenation point
   * (docsEngineLineStarts' hyphenCut): `from === to`, after the point's
   * letter, an optional hyphen there for the browser to break at. */
  hyphen?: true;
  /** The paragraph whose content starts at `from` (`from === to`) is
   * hyphenated by the engine: the browser hyphenates none of its words by
   * itself (`hyphens: manual` over documentAutoHyphenation's `auto`). */
  manualHyphens?: true;
  /** The head of a paragraph the page cut inside a hyphenated word ends at
   * `from` (`from === to`): the hyphen Word draws there ("estab-"). */
  headHyphen?: true;
  /** A word joiner before an opening bracket the engine keeps with the
   * closing punctuation before it (docsBracketJoins): `from === to`. */
  joiner?: true;
}

/** Marks a paragraph the engine hyphenates (documentHyphenationRules leaves it). */
export const DOCS_ENGINE_HYPHENATION_ATTR = "data-docs-engine-hyphenation";

function hyphenElement(): HTMLElement {
  const span = document.createElement("span");
  span.className = DOCS_ENGINE_HYPHEN_CLASS;
  span.textContent = "\u00ad";
  return span;
}

/** A word joiner: no line break on either side of it (UAX #14 LB11). */
function joinerElement(): HTMLElement {
  const span = document.createElement("span");
  span.className = DOCS_ENGINE_JOINER_CLASS;
  span.setAttribute("aria-hidden", "true");
  span.textContent = "\u2060";
  return span;
}

/** The hyphen a page cut's head ends with: drawn, and read by the engine as
 * the last piece of its last line. */
function headHyphenElement(): HTMLElement {
  const span = document.createElement("span");
  span.className = DOCS_ENGINE_HEAD_HYPHEN_CLASS;
  span.setAttribute("aria-hidden", "true");
  span.contentEditable = "false";
  span.textContent = "-";
  return span;
}

interface EngineLinesState {
  set: DecorationSet;
  dirty: Array<[number, number]> | "all";
  /** Paragraphs the browser still broke elsewhere after their correction:
   * measured again, lines forced, a few rounds at most. */
  retry: Array<[number, number]>;
}

interface EngineLinesMeta {
  spans: Span[];
  /** Blocks measured: their old spans are replaced. */
  ranges: Array<[number, number]>;
  retry: Array<[number, number]>;
  /** Dirty ranges left for later: sheets past the page ledger's measure
   * horizon (a long document laid out progressively). */
  dirty: Array<[number, number]>;
}

function tabBreakElement(): HTMLElement {
  const br = document.createElement("br");
  br.className = DOCS_ENGINE_TAB_BREAK_CLASS;
  return br;
}

/**
 * The tabs of a paragraph the browser breaks that hang at a line's end while
 * what follows them opens the next line. Word takes such a tab to the next
 * line with what follows it (docs-lines: "a tab stays with what follows
 * it"); the browser lets it hang, and a reference list indented by typed
 * tabs set its continuation lines at the margin (corpus R283-D12, Times New
 * Roman installed on the Mac: the engine leaves those paragraphs to the
 * browser). A tab a break of ours already opens a line with keeps it.
 */
export function hangingTabBreaks(view: EditorView, element: HTMLElement): Span[] {
  const doc = element.ownerDocument;
  const texts: Text[] = [];
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('[contenteditable="false"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  const range = doc.createRange();
  const boxOf = (text: Text, index: number): DOMRect | null => {
    range.setStart(text, index);
    range.setEnd(text, index + 1);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
    return rects[0] ?? null;
  };
  const spans: Span[] = [];
  for (let t = 0; t < texts.length; t += 1) {
    const data = texts[t]!.data;
    for (let index = data.indexOf("\t"); index >= 0; index = data.indexOf("\t", index + 1)) {
      const tab = boxOf(texts[t]!, index);
      if (!tab) continue;
      // Already opened by our break: kept.
      const before = texts[t]!.previousSibling;
      const opened = index === 0 && before instanceof HTMLElement && before.classList.contains(DOCS_ENGINE_TAB_BREAK_CLASS);
      let hangs = opened;
      if (!opened) {
        // The first character after the tab that draws something.
        let found: DOMRect | null = null;
        for (let u = t, at = index + 1; u < texts.length && !found; u += 1, at = 0) {
          const text = texts[u]!.data;
          for (let i = at; i < text.length; i += 1) {
            if (/\s/.test(text[i]!)) continue;
            found = boxOf(texts[u]!, i);
            break;
          }
        }
        hangs = found !== null && found.top > tab.top + tab.height / 2;
      }
      if (!hangs) continue;
      try {
        const at = view.posAtDOM(texts[t]!, index);
        spans.push({ from: at, to: at, extra: 0, base: 0, wordExtra: 0, wordBase: 0, tabBreak: true });
      } catch { /* a node outside the editor's content */ }
    }
  }
  return spans;
}

function decorationsFor(doc: ProseMirrorNode, spans: readonly Span[]): Decoration[] {
  return spans.flatMap((span): Decoration[] => {
    if (span.manualHyphens) {
      const block = span.from > 0 ? doc.nodeAt(span.from - 1) : null;
      if (!block?.isTextblock) return [];
      return [Decoration.node(span.from - 1, span.from - 1 + block.nodeSize, {
        [DOCS_ENGINE_HYPHENATION_ATTR]: "true",
        style: "hyphens:manual !important;-webkit-hyphens:manual !important",
      }, { engineLine: true })];
    }
    if (span.hyphen) {
      return [Decoration.widget(span.from, hyphenElement, { side: -1, key: DOCS_ENGINE_HYPHEN_CLASS, engineLine: true, ignoreSelection: true })];
    }
    if (span.joiner) {
      return [Decoration.widget(span.from, joinerElement, { side: -1, key: DOCS_ENGINE_JOINER_CLASS, engineLine: true, ignoreSelection: true })];
    }
    if (span.headHyphen) {
      return [Decoration.widget(span.from, headHyphenElement, { side: -1, key: DOCS_ENGINE_HEAD_HYPHEN_CLASS, engineLine: true, ignoreSelection: true })];
    }
    // The break ends a line and owns no line box of its own: it stands in
    // the paragraph's wrappers, which take no line height where the
    // paragraph's leaves own it (documentAutoLineSafety). Taken for a
    
    // of its paragraph: an 8 pt cell under an 11 pt Normal drew 10.5 pt lines
    // for Word's 9.77 (tables/probes/narrow, corpus R417-D03's "ID" column).
    if (span.tabBreak) {
      return [Decoration.widget(span.from, tabBreakElement, {
        side: -1, key: DOCS_ENGINE_TAB_BREAK_CLASS, engineLine: true, ignoreSelection: true,
        ...(engineBreakStrutOff() ? {} : { zeroLayoutFormattingMark: true }),
      })];
    }
    const total = Number((span.base + span.extra).toFixed(4));
    // The extra alone too: a balanced space's own width on the same text adds it (balancedSpaces.ts).
    const words = span.wordExtra
      ? `;word-spacing:${Number((span.wordBase + span.wordExtra).toFixed(4))}px;${ENGINE_WORD_EXTRA_VAR}:${Number(span.wordExtra.toFixed(4))}px`
      : "";
    return [Decoration.inline(
      span.from,
      span.to,
      {
        [DOCS_ENGINE_LINE_ATTR]: String(Number(span.extra.toFixed(4))),
        [DOCS_ENGINE_BASE_SPACING_ATTR]: String(span.base),
        [DOCS_ENGINE_BASE_WORD_SPACING_ATTR]: String(span.wordBase),
        style: `letter-spacing:${total}px${words}`,
      },
      { engineLine: true, extra: span.extra, base: span.base },
    )];
  });
}

function rulesFor(view: EditorView, node: ProseMirrorNode): DocsLayoutRules {
  const attrs = view.state.doc.attrs;
  const eastAsian = CJK.test(node.textContent);
  // A paragraph whose East Asian text is in a Western language takes none of
  // Word's East Asian line rules (wordEastAsianLineRulesApply, R334-D24).
  const lineRules = eastAsian && wordEastAsianLineRulesApply(attrs, node);
  const kinsoku: KinsokuList | null = lineRules ? "zh-CN" : null;
  return { compatibilityMode: normalizeWordCompatibilityMode(attrs.wordCompatibilityMode), kinsoku, ideographsAsLetters: eastAsian && wordSetsIdeographsAsLetters(attrs), ...(eastAsian && !lineRules ? { eastAsianLineRules: false } : {}) };
}

/**
 * The engine's rows of a paragraph's two pieces laid out as one, for the page
 * ledger's reading of a page seam (ledgerEngineLines.EngineJoinedRows): the
 * rows Word breaks, which the browser's own breaker misses by a hair where a
 * drawn line is corrected to them. Read from the copy as from a paragraph on
 * the page; the corrections its two halves carry are not read (the engine
 * fills lines from the faces' own advances).
 */
function engineJoinedRows(
  view: EditorView,
  head: { readonly node: ProseMirrorNode; readonly dom: HTMLElement },
  tail: { readonly node: ProseMirrorNode; readonly dom: HTMLElement },
  copy: HTMLElement,
): readonly EngineRowStart[] | null | undefined {
  if (!textEngineOn("docs")) return null;
  // A float narrows lines the engine fills whole; hyphenation needs the block's own pass.
  const floats: DocsFloatCache = new Map();
  if (docsParagraphBesideFloat(head.dom, floats) || docsParagraphBesideFloat(tail.dom, floats)) return undefined;
  if (!docsHyphenationOff() && copy.getAttribute("data-auto-hyphenation") === "true" &&
      normalizeAutoHyphenation((view.state.doc.attrs as Record<string, unknown>).autoHyphenation)) return undefined;
  const paragraph = readDocsParagraph(copy);
  if (paragraph.pending) return undefined;
  if (paragraph.unsupported || !paragraph.pieces.length) return null;
  // (The East Asian rules go by the piece that holds East Asian text.)
  const rules = rulesFor(view, CJK.test(head.node.textContent) || !CJK.test(tail.node.textContent) ? head.node : tail.node);
  const starts = normalizeStarts(paragraph, docsEngineLineStarts(paragraph, rules));
  const rows: EngineRowStart[] = [];
  for (const start of starts) {
    const piece = paragraph.pieces[start];
    if (!piece?.node || piece.offset === undefined) return undefined;
    rows.push({ node: piece.node, offset: piece.offset });
  }
  return rows;
}
setEngineJoinedRows(engineJoinedRows);

/**
 * Whether an edit waiting for its lines is in a paragraph cut across pages
 * (or columns): those are measured at once, not after the typing pauses.
 *
 * The page ledger cuts such a paragraph by its rows. Read on a key with the
 * browser's own rows, and again a moment later with the engine's (which a
 * line drawn corrected keeps where Word breaks it), the cut moved and came
 * back: a row or a word sent across the seam and returned, every page after
 * it with it (corpus R380-D22: 6 of 204 keys, 0 with the lines read per
 * key). One paragraph's lines a key cost what typing in a short document
 * does already. `window.__docsEngineSeamHoldsTyping = true` holds them for
 * the pause, as before (A/B).
 */
function editAtPageSeam(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsEngineSeamHoldsTyping?: boolean }) | null;
  if (win?.__docsEngineSeamHoldsTyping === true) return false;
  const state = documentEngineLineBreaksKey.getState(view.state);
  if (!state || state.dirty === "all") return false;
  const ranges = [...state.dirty, ...state.retry];
  if (!ranges.length || ranges.length > 8) return false;
  // The pieces of paragraphs cut across a page or a column, by their place in
  // the document (a range's own position may name the sheet between them).
  for (const piece of Array.from(view.dom.querySelectorAll<HTMLElement>("[data-page-split-continues='true'], [data-page-split-continuation='true']"))) {
    let from: number;
    try {
      from = view.posAtDOM(piece, 0);
    } catch {
      continue;
    }
    const node = view.state.doc.nodeAt(Math.max(0, from - 1));
    const to = from + (node && node.isTextblock ? node.content.size : (piece.textContent ?? "").length);
    if (ranges.some(([a, b]) => b >= from - 1 && a <= to + 1)) {
      // (Counted for a harness that checks this reaches the seam it means.)
      const holder = win as (Window & { __docsEngineSeamReads?: number }) | null;
      if (holder) holder.__docsEngineSeamReads = (holder.__docsEngineSeamReads ?? 0) + 1;
      return true;
    }
  }
  return false;
}

/** `plan` given the pieces' natural drawn widths, and a reading of a stretch
 * of them as ranges (docsStretchDrawnWidth); a justified paragraph is read
 * left-aligned for the moment (its justification stretches CJK glyph boxes),
 * with the editor's DOM observer paused so the style flip is not taken for
 * an edit. */
function withNaturalWidths<T>(
  view: EditorView, element: HTMLElement, paragraph: DocsParagraph,
  plan: (drawn: number[], measure: ((from: number, to: number) => number | null) | undefined) => T,
): T {
  const read = () => plan(docsDrawnWidths(paragraph), rangeWidthsOff(view) ? undefined : (from, to) => docsStretchDrawnWidth(paragraph, from, to));
  const align = paragraph.align;
  if (align !== "justify" && align !== "distribute" && !align.startsWith("-")) return read();
  const observer = (view as EditorView & { domObserver?: { stop(): void; start(): void } }).domObserver;
  const before = element.style.getPropertyValue("text-align");
  const beforePriority = element.style.getPropertyPriority("text-align");
  const beforeLast = element.style.getPropertyValue("text-align-last");
  const beforeLastPriority = element.style.getPropertyPriority("text-align-last");
  observer?.stop();
  try {
    element.style.setProperty("text-align", "left", "important");
    element.style.setProperty("text-align-last", "auto", "important");
    return read();
  } finally {
    if (before) element.style.setProperty("text-align", before, beforePriority);
    else element.style.removeProperty("text-align");
    if (beforeLast) element.style.setProperty("text-align-last", beforeLast, beforeLastPriority);
    else element.style.removeProperty("text-align-last");
    observer?.start();
  }
}

/** `window.__docsPullUpRangeWidthsOff = true`: whether the browser pulls the
 * next word up is read from the letters' boxes summed, as before. */
function rangeWidthsOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsPullUpRangeWidthsOff?: boolean }) | null)?.__docsPullUpRangeWidthsOff === true;
}

/** Same lines? Starts compared on the drawn sequence. */
function sameStarts(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The spans one paragraph needs now. `round` > 0: the browser disagreed
 * after the last correction; the lines from the first disagreement are
 * corrected whatever their widths say.
 */
/** Where a line's first piece stands in its block's content. */
function lineContentOffset(view: EditorView, paragraph: DocsParagraph, start: number, pos: number): number | null {
  const piece = paragraph.pieces[start];
  if (!piece?.node || piece.offset === undefined) return null;
  try {
    return view.posAtDOM(piece.node, piece.offset) - (pos + 1);
  } catch {
    return null;
  }
}

/**
 * The text blocks of `doc` among `waiting` (paragraphs a pass found waiting
 * for a face file), with their positions, wherever they stand: read again once
 * the faces move, whatever sheets the page ledger's horizon holds then.
 */
export function blocksWaitingForFaces(doc: ProseMirrorNode, waiting: ReadonlySet<ProseMirrorNode>): Array<{ node: ProseMirrorNode; pos: number }> {
  const found: Array<{ node: ProseMirrorNode; pos: number }> = [];
  if (!waiting.size) return found;
  let left = waiting.size;
  doc.descendants((node, pos) => {
    if (!left) return false;
    if (!node.isTextblock) return true;
    if (waiting.has(node)) {
      found.push({ node, pos });
      left -= 1;
    }
    return false;
  });
  return found;
}

/** Counts for probes (`window.__docsEngineLineCache`). */
interface EngineLineCacheStats { measured: number; reused: number; kept: number; missed?: Record<string, number>; seeded?: number; tails?: number; heads?: number; retried?: number; keptRetried?: number; disagreed?: number }

function keepRetriedOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsEngineKeepRetriedOff?: boolean }) | null)?.__docsEngineKeepRetriedOff === true;
}

function engineTailLinesOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsEngineTailLinesOff?: boolean }) | null)?.__docsEngineTailLinesOff === true;
}

function engineHeadLinesOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsEngineHeadLinesOff?: boolean }) | null)?.__docsEngineHeadLinesOff === true;
}

function cssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** What a block's lines depend on besides itself (engineLineCache). */
function lineKeyOf(view: EditorView, element: HTMLElement, pos: number): EngineLineKey {
  const parent = view.state.doc.resolve(pos).parent;
  return {
    width: element.getBoundingClientRect().width,
    // Lines are kept only from answers the engine gave (a paragraph still
    // waiting for a face is not kept), and a given answer moves only with
    // the faces declared (textEngineAnswerEpoch); the faces a block's
    // families gained since are its entry's own check (familyNews). Keyed on
    // every face file loading, R286-D01's cold opening read 12,565 blocks
    // again for that alone, of 34,449; with this, 25,620 readings in all
    
    // every face file again.
    epoch: (view.dom.ownerDocument.defaultView as (Window & { __docsEngineLinesAnswerEpoch?: boolean }) | null)?.__docsEngineLinesAnswerEpoch === false
      ? textEngineEpoch() : textEngineAnswerEpoch(),
    docAttrs: view.state.doc.attrs,
    parent: parent.type.name === PAGE_BLOCK_NODE ? PAGE_BLOCK_NODE : parent.attrs,
  };
}

type EngineLinesCache = { lines: EngineLineCache; news: FamilyNews; stats: EngineLineCacheStats | null };

/** What a reading drew, for the layout a row keeps (engineLinesKept). */
interface DrawnReading { read: boolean; width: number | null; declined: boolean }

/** A paragraph's spans now (readBlockLines), what it drew noted for a kept
 * layout, or taken back from the one restored. */
function measureBlock(
  view: EditorView, node: ProseMirrorNode, pos: number, round: number, floats: DocsFloatCache,
  cache?: EngineLinesCache,
): { spans: Span[]; agrees: boolean } | null | undefined {
  if (!engineLinesKeptOn(view.dom.ownerDocument.defaultView)) return readBlockLines(view, node, pos, round, floats, cache, null);
  const drew: DrawnReading = { read: false, width: null, declined: false };
  const result = readBlockLines(view, node, pos, round, floats, cache, drew);
  if (result === undefined || !drew.read) forgetDrawnLines(node);
  else noteDrawnLines(node, pos, drew.width ?? drawnLinesWidth(node), result?.spans ?? [], drew.declined);
  return result;
}

function readBlockLines(
  view: EditorView, node: ProseMirrorNode, pos: number, round: number, floats: DocsFloatCache,
  cache: EngineLinesCache | undefined, drew: DrawnReading | null,
): { spans: Span[]; agrees: boolean } | null | undefined {
  const element = view.nodeDOM(pos);
  if (!(element instanceof HTMLElement) || !element.isConnected) return null;
  // A cell of an auto-layout table sizes its column from its content's
  // widths, which a correction would change: the browser keeps it.
  const table = element.closest("table");
  if (table && element.ownerDocument.defaultView?.getComputedStyle(table).tableLayout !== "fixed") {
    noteEngineDeclinedBlock(node);
    return null;
  }
  // A block measured as it is now (moved to another sheet by the page
  // ledger, unchanged) takes its corrections back without a reading.
  const key = cache && round === 0 ? lineKeyOf(view, element, pos) : null;
  // A paragraph read again after its corrections (round > 0) that now agrees
  // is kept too, with the corrections it agrees with: kept only from a first
  // reading, a paragraph the browser broke otherwise until corrected (a code
  // listing of 530 lines, R461-D71) was read whole again wherever it moved and
  // after every page cut through it, its tails never cut from its lines.
  // `window.__docsEngineKeepRetriedOff`: kept from a first reading only.
  const keepKey = key ?? (cache && round > 0 && !keepRetriedOff(view) ? lineKeyOf(view, element, pos) : null);
  if (cache?.stats && round > 0) cache.stats.retried = (cache.stats.retried ?? 0) + 1;
  if (drew) {
    drew.read = true;
    drew.width = key?.width ?? null;
    // Restored pages draw what they drew when they were kept.
    // A paragraph with corrections beside a float is read again: a float a
    // layout drew late (a text box placed after its first pass) was not there
    // when its corrections were kept, and the browser wraps beside one.
    const seededKept = key ? seededLinesFor(node, key.width) : null;
    const kept = seededKept && (!seededKept.spans.length || !docsParagraphBesideFloat(element, floats)) ? seededKept : null;
    if (kept) {
      if (cache?.stats) cache.stats.seeded = (cache.stats.seeded ?? 0) + 1;
      drew.declined = kept.declined;
      if (kept.declined) noteEngineDeclinedBlock(node);
      return kept.declined && !kept.spans.length ? null : { spans: spansAt<Span>(kept, pos), agrees: true };
    }
  }
  if (cache && key) {
    const kept = cache.lines.lookup<Span>(node, key, pos, cache.news);
    if (kept) {
      if (cache.stats) cache.stats.reused += 1;
      return { spans: kept, agrees: true };
    }
  }
  // A page cut's tail, cut where a line of the block it came from starts:
  // that block's lines from there on, with no reading of the tail. Read
  // anew, each of a long paragraph's tails was read whole again after every
  // cut (R461-D71, six code listings of ~3,500 runs over ten pages each:
  // ~70 s of a print's layout). `window.__docsEngineTailLinesOff`: read.
  if (cache && key && !engineTailLinesOff(view) && !element.closest("li")) {
    const fragment = cache.lines.fragmentOf<Span>(node, key, pos, cache.news);
    const style = fragment ? element.ownerDocument.defaultView?.getComputedStyle(element) : null;
    if (fragment && style) {
      const chrome = {
        top: cssPx(style.paddingTop) + cssPx(style.borderTopWidth),
        bottom: cssPx(style.paddingBottom) + cssPx(style.borderBottomWidth),
      };
      if (noteEngineTailLines(node, fragment.whole, fragment.offset, docsBlockLineRule(node, element), chrome)) {
        cache.lines.store(node, key, pos, fragment.spans, fragment.families, cache.news, fragment.starts);
        if (cache.stats) cache.stats.tails = (cache.stats.tails ?? 0) + 1;
        return { spans: fragment.spans, agrees: true };
      }
    }
  }
  // A page cut's head, likewise: the lines of the block it was cut from up to
  // the cut. Each cut through a long paragraph made a new head that was read
  // whole again (R461-D71's listings: a page of ~350 runs each time the
  // ledger moved a cut), where its lines are those the whole already had.
  // `window.__docsEngineHeadLinesOff`: read.
  if (cache && key && !engineHeadLinesOff(view) && !element.closest("li")) {
    const fragment = cache.lines.headOf<Span>(node, key, pos, cache.news);
    const style = fragment ? element.ownerDocument.defaultView?.getComputedStyle(element) : null;
    if (fragment && style) {
      const chrome = {
        top: cssPx(style.paddingTop) + cssPx(style.borderTopWidth),
        bottom: cssPx(style.paddingBottom) + cssPx(style.borderBottomWidth),
      };
      if (noteEngineHeadLines(node, fragment.whole, node.content.size, docsBlockLineRule(node, element), chrome)) {
        cache.lines.store(node, key, pos, fragment.spans, fragment.families, cache.news, fragment.starts);
        if (cache.stats) cache.stats.heads = (cache.stats.heads ?? 0) + 1;
        return { spans: fragment.spans, agrees: true };
      }
    }
  }
  if (cache?.stats) {
    cache.stats.measured += 1;
    const reason = !key ? "retry" : cache.lines.missReason(node, key, cache.news);
    const missed = (cache.stats.missed ??= {});
    missed[reason] = (missed[reason] ?? 0) + 1;
  }
  // Where the block's lines after its first start (its tails' lines: fragmentOf).
  let starts: number[] | undefined;
  const keep = (spans: Span[]) => {
    if (!cache || !keepKey) return;
    if (!key && cache.stats) cache.stats.keptRetried = (cache.stats.keptRetried ?? 0) + 1;
    const families = new Set<string>();
    for (const piece of paragraph.pieces) {
      const stack = (piece as { font?: { stack?: string } }).font?.stack;
      if (stack) for (const family of stack.split(",")) families.add(family);
    }
    cache.lines.store(node, keepKey, pos, spans, [...families], cache.news, starts);
    if (cache.stats) cache.stats.kept += 1;
  };
  const paragraph = engineHyphenation(view, element, readDocsParagraph(element));
  // undefined: a face is still loading (the ledger may wait for it).
  if (paragraph.pending) return undefined;
  if (paragraph.unsupported || !paragraph.pieces.length) {
    // Left to the browser: its lines take the Word rules the browser's
    // projections keep (justifiedSpaceShrink), and a tab hanging at a line's
    // end goes to the next line with what follows it (hangingTabBreaks).
    if (paragraph.unsupported) {
      noteEngineDeclinedBlock(node);
      if (drew) drew.declined = true;
      if (element.textContent?.includes("\t")) {
        const spans = hangingTabBreaks(view, element);
        if (spans.length) return { spans, agrees: true };
      }
    }
    return null;
  }
  const rules = rulesFor(view, node);
  const raw = docsEngineLineStarts(paragraph, rules);
  const engine = normalizeStarts(paragraph, raw);
  // The page ledger reads these lines (a list's first line rises to its
  // marker, which the model does not state: the page keeps those).
  if (!element.closest("li")) {
    const rule = docsBlockLineRule(node, element);
    const layout = layoutDocsBlockLines(paragraph, engine, rule, null);
    const offsets = layout.status === "ok" && layout.lines.length > 1 ? layout.lines.map((line) => lineContentOffset(view, paragraph, line.start, pos)) : [];
    noteEngineBlockLines(node, layout, rule, offsets, paragraph.chrome);
    // Lines beside a drop cap are narrower than the rest: a tail is not cut
    // from them.
    if (!paragraph.leadingLines) starts = offsets.filter((offset): offset is number => offset !== null && offset > 0);
  }
  // Most paragraphs already break where the engine does: shown cheaply.
  const current = paragraph.pieces.some((piece) => piece.correction);
  // A line the engine opens with a tab is drawn so by a break before it
  // (planDocsLineCorrections' tabBreak), which no spacing shows: the browser
  // reads that tab's box at the next line's start whether the break is there
  // or the tab hangs at the end of the line before (R283-D12 on: the links
  // stayed at the margin, the lines read as agreeing). Such a paragraph is
  // always planned, so its break is drawn and kept.
  // So is a line the engine opens with a space (mode 14, a cell narrower
  // than a letter): the browser reads no space's box at all.
  // And a paragraph whose last line is one letter wider than the measure:
  // that letter is narrowed so the closing widgets stay on its line.
  // And a paragraph measured narrower than the box the browser lays it out
  // in (a Word cell's text box from the model) that has a break of ours: its
  // lines end there only by that break.
  const tabOpened = engine.some((start, line) => line > 0 && paragraph.pieces[start]?.kind === "tab") ||
    raw.some((_start, line) => docsLineOpensWithSpace(paragraph, raw, line)) || docsLastLineOverhangs(paragraph, raw) ||
    ((paragraph.browserWiderBy ?? 0) > 0 && element.querySelector(`.${DOCS_ENGINE_TAB_BREAK_CLASS}`) !== null);
  // A paragraph the engine hyphenates: the browser's own hyphens are off and
  // an optional hyphen stands where each automatic one ends a line. The
  // first reading saw the browser's hyphens: read again once these stand.
  // And the word joiners that keep the browser from breaking where Word
  // keeps closing punctuation and an opening bracket together: drawn
  // whatever the browser does now, so a reading with them and one without
  // keep the same spans.
  const hyphenSpans = [...(paragraph.hyphenation ? engineHyphenSpans(view, paragraph, raw, pos) : []), ...engineJoinerSpans(view, paragraph, raw)];
  const hyphenFresh = paragraph.hyphenation !== undefined && element.getAttribute(DOCS_ENGINE_HYPHENATION_ATTR) !== "true";
  if (!hyphenFresh && !current && !tabOpened && docsBrowserAgreesQuickly(element, paragraph, engine)) {
    keep(hyphenSpans);
    return { spans: hyphenSpans, agrees: true };
  }
  const browser = docsBrowserLineStarts(paragraph);
  const agrees = sameStarts(engine, browser);
  // Lines a float narrows are the browser's to wrap (the engine fills whole
  // lines); corrections already there stay out of it too.
  if (!agrees && docsParagraphBesideFloat(element, floats)) return { spans: [], agrees: true };
  const force = new Set<number>();
  if (!agrees && round > 0) {
    let first = 0;
    while (first < engine.length && engine[first] === browser[first]) first += 1;
    // The line before the first disagreement decides where it starts.
    for (let line = Math.max(0, first - 1); line <= Math.min(raw.length - 1, first + 1); line += 1) force.add(line);
  }
  if (agrees && !hyphenFresh && !current && !tabOpened) {
    keep(hyphenSpans);
    return { spans: hyphenSpans, agrees };
  }
  // `window.__docsCorrectionRoundingOff = true`: a correction leaves 0.02 px
  // whatever the line's items (before R342-D30).
  const roundingOff = (view.dom.ownerDocument.defaultView as (Window & { __docsCorrectionRoundingOff?: boolean }) | null)?.__docsCorrectionRoundingOff === true;
  const plan = withNaturalWidths(view, element, paragraph, (drawn, measure) =>
    planDocsLineCorrections(paragraph, raw, drawn, force, { roundingSlack: !roundingOff, ...(measure ? { measure } : {}) }));
  const spans: Span[] = [];
  for (const line of plan) {
    // One span per text node stretch of the line.
    let at = line.from;
    while (at < line.to) {
      const piece = paragraph.pieces[at];
      if ((piece.kind !== "text" && piece.kind !== "space") || !piece.node || piece.offset === undefined) { at += 1; continue; }
      const textNode = piece.node;
      const startOffset = piece.offset;
      let endOffset = startOffset + piece.text.length;
      let next = at + 1;
      // A stretch also ends where the narrowed spaces (after the line's
      // last tab) begin.
      const spaced = at >= line.spacesFrom;
      while (next < line.to) {
        const later = paragraph.pieces[next];
        if (later.node !== textNode || (later.kind !== "text" && later.kind !== "space") || later.offset !== endOffset) break;
        if ((next >= line.spacesFrom) !== spaced) break;
        endOffset += later.text.length;
        next += 1;
      }
      try {
        const from = view.posAtDOM(textNode, startOffset);
        // Biased forward: the number of a note reference (its view's own
        // text, footnoteExtension) ends after its node, so the line's spacing
        // reaches it as the engine counts it; in a text node the bias is moot.
        const to = view.posAtDOM(textNode, endOffset, 1);
        if (to > from) {
          spans.push({
            from, to, extra: line.letterSpacing, base: piece.letterSpacing ?? 0,
            wordExtra: spaced ? line.wordSpacing : 0, wordBase: piece.wordSpacing ?? 0,
          });
        }
      } catch { /* a node outside the editor's content */ }
      at = next;
    }
    const tab = line.tabBreak === null ? undefined : paragraph.pieces[line.tabBreak];
    if (tab?.node && tab.offset !== undefined) {
      try {
        const at = view.posAtDOM(tab.node, tab.offset);
        spans.push({ from: at, to: at, extra: 0, base: 0, wordExtra: 0, wordBase: 0, tabBreak: true });
      } catch { /* a node outside the editor's content */ }
    }
  }
  spans.push(...hyphenSpans);
  if (agrees && !hyphenFresh) keep(spans);
  else if (cache?.stats) cache.stats.disagreed = (cache.stats.disagreed ?? 0) + 1;
  return { spans, agrees: agrees && !hyphenFresh };
}

/**
 * The paragraph with Word's automatic hyphenation points (docs-hyphenation),
 * when the document hyphenates automatically and the paragraph does
 * (documentAutoHyphenation's mark); else as read.
 */
function engineHyphenation(view: EditorView, element: HTMLElement, paragraph: DocsParagraph): DocsParagraph {
  if (docsHyphenationOff() || element.getAttribute("data-auto-hyphenation") !== "true") return paragraph;
  const attrs = view.state.doc.attrs as Record<string, unknown>;
  if (!normalizeAutoHyphenation(attrs.autoHyphenation)) return paragraph;
  const options = normalizeHyphenationOptions(attrs.hyphenationOptions) ?? {};
  return withDocsAutoHyphenation(paragraph, element, options);
}

/** The engine's hyphenation drawn: the paragraph's own hyphens off, and an
 * optional hyphen after each automatic point a line of `starts` ends at. */
function engineHyphenSpans(view: EditorView, paragraph: DocsParagraph, starts: readonly number[], pos: number): Span[] {
  const blank = { extra: 0, base: 0, wordExtra: 0, wordBase: 0 };
  const spans: Span[] = [{ from: pos + 1, to: pos + 1, ...blank, manualHyphens: true }];
  for (let line = 1; line < starts.length; line += 1) {
    const at = starts[line]! - 1;
    if (at < 0 || hyphenPointKind(paragraph, at) !== "auto") continue;
    const piece = paragraph.pieces[at]!;
    if (!piece.node || piece.offset === undefined) continue;
    try {
      const after = view.posAtDOM(piece.node, piece.offset + piece.text.length);
      spans.push({ from: after, to: after, ...blank, hyphen: true });
    } catch { /* a node outside the editor's content */ }
  }
  const node = view.state.doc.nodeAt(pos);
  if (node && cutInsideHyphenatedWord(view.state.doc, node, pos)) {
    const end = pos + 1 + node.content.size;
    spans.push({ from: end, to: end, ...blank, headHyphen: true });
  }
  return spans;
}

/** Word joiners before the opening brackets docsBracketJoins names. */
function engineJoinerSpans(view: EditorView, paragraph: DocsParagraph, starts: readonly number[]): Span[] {
  const spans: Span[] = [];
  for (const at of docsBracketJoins(paragraph, starts)) {
    const piece = paragraph.pieces[at]!;
    if (!piece.node || piece.offset === undefined) continue;
    try {
      const before = view.posAtDOM(piece.node, piece.offset);
      spans.push({ from: before, to: before, extra: 0, base: 0, wordExtra: 0, wordBase: 0, joiner: true });
    } catch { /* a node outside the editor's content */ }
  }
  return spans;
}

/** Off with `window.__docsEngineTabNewsOff = true`: a paragraph whose tabs the
 * tab layout sized anew is not read again, as before. */
function engineTabNewsOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsEngineTabNewsOff?: boolean }).__docsEngineTabNewsOff === true;
}

/** The text blocks (their ranges) whose tab decorations differ between two
 * states of the same document (bandTabLayout's set). */
export function tabbedBlocksChanged(state: EditorState, previous: EditorState): Array<[number, number]> {
  const now = bandTabLayoutKey.getState(state)?.set;
  const before = bandTabLayoutKey.getState(previous)?.set;
  if (!now || now === before || state.doc !== previous.doc) return [];
  const byBlock = (set: DecorationSet | undefined) => {
    const out = new Map<number, string>();
    for (const decoration of set?.find() ?? []) {
      let $at;
      try {
        $at = state.doc.resolve(decoration.from);
      } catch {
        continue;
      }
      const start = $at.depth > 0 ? $at.start($at.depth) - 1 : decoration.from;
      const spec = (decoration as unknown as { type?: { attrs?: Record<string, unknown> } }).type?.attrs ?? {};
      out.set(start, `${out.get(start) ?? ""}|${decoration.from}:${decoration.to}:${JSON.stringify(spec)}`);
    }
    return out;
  };
  const a = byBlock(now);
  const b = byBlock(before);
  const ranges: Array<[number, number]> = [];
  for (const start of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(start) === b.get(start)) continue;
    const node = state.doc.nodeAt(start);
    if (node?.isTextblock) ranges.push([start, start + node.nodeSize]);
  }
  return ranges;
}

const TRAILING_LETTERS = /\p{L}+$/u;
const LEADING_LETTERS = /^\p{L}+/u;

/**
 * Whether `node` (at `pos`) is the head of a paragraph the page cut on a line
 * that ends inside a hyphenated word: Word draws that line's hyphen at the
 * foot of the page ("estab-"), the word going on on the next ("lishment").
 * The engine cuts only at its own line starts, so a word running on into the
 * tail was broken at one of its points (an optional hyphen ending the head,
 * or an automatic point of the whole word). Not for a word broken at a
 * letter because it is longer than the line (no point there).
 * `window.__docsHeadHyphenOff = true`: no hyphen there, as before.
 */
export function cutInsideHyphenatedWord(doc: ProseMirrorNode, node: ProseMirrorNode, pos: number): boolean {
  if (node.attrs?.[SPLIT_CONTINUES_ATTR] !== true || headHyphenOff()) return false;
  const head = node.textContent;
  const end = pos + node.nodeSize;
  let tail: ProseMirrorNode | null = null;
  doc.nodesBetween(end, doc.content.size, (child, at) => {
    if (tail) return false;
    if (at < end) return true;
    if (child.isTextblock) { tail = child; return false; }
    return true;
  });
  const next = tail as ProseMirrorNode | null;
  if (!next || next.attrs?.[SPLIT_CONTINUATION_ATTR] !== true) return false;
  const opens = LEADING_LETTERS.exec(next.textContent)?.[0];
  if (!opens) return false;
  if (head.endsWith("\u00ad")) return true;
  const closes = TRAILING_LETTERS.exec(head)?.[0];
  if (!closes) return false;
  return hyphenationPoints(closes + opens, "en-us").includes(closes.length);
}

function headHyphenOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsHeadHyphenOff?: boolean }).__docsHeadHyphenOff === true;
}

/**
 * `set` without the spans of the blocks a pass measured (`ranges`: each
 * block's [pos, pos + nodeSize]), which their new spans replace. Only what
 * lies within a block is its own: a set's find also returns what touches a
 * range, and the node decoration of the block before or after one (a
 * hyphenated paragraph's `hyphens: manual`, its manualHyphens span) ends or
 * starts at its edge. Measuring a block alone (a page cut's head or tail,
 * read after each cut) took that mark off the paragraphs beside it, which
 * nothing read again: the browser hyphenated them itself ("re-|sources" in
 * R404-D02's paragraph above a cut, where Word fits the whole word), and the
 * page ledger's cut, made on the engine's lines, fell a line off.
 * `window.__docsEngineRangeTouchOff = true`: what touches goes too, as before.
 */
export function withoutMeasuredSpans(set: DecorationSet, ranges: ReadonlyArray<readonly [number, number]>): DecorationSet {
  const touchOff = typeof window !== "undefined" && (window as Window & { __docsEngineRangeTouchOff?: boolean }).__docsEngineRangeTouchOff === true;
  let out = set;
  for (const [from, to] of ranges) out = touchOff ? removeDecorationsWithin(out, from, to) : removeDecorationsInside(out, from, to);
  return out;
}

export const DocumentEngineLineBreaks = Extension.create({
  name: "documentEngineLineBreaks",
  addProseMirrorPlugins() {
    // Off (the default): no state, no transaction cost.
    if (!textEngineEnabled("docs")) return [];
    const mapRanges = (ranges: Array<[number, number]>, tr: Transaction) =>
      ranges.map(([from, to]): [number, number] => [tr.mapping.map(from, -1), tr.mapping.map(to, 1)]);
    return [
      new Plugin<EngineLinesState>({
        key: documentEngineLineBreaksKey,
        state: {
          init: () => ({ set: DecorationSet.empty, dirty: "all", retry: [] }),
          apply: (tr: Transaction, previous): EngineLinesState => {
            const meta = tr.getMeta(META) as EngineLinesMeta | undefined;
            if (meta) {
              let set = previous.set;
              set = withoutMeasuredSpans(set, meta.ranges);
              const added = decorationsFor(tr.doc, meta.spans);
              return { set: added.length ? set.add(tr.doc, added) : set, dirty: meta.dirty, retry: meta.retry };
            }
            if (!tr.docChanged) return previous;
            if (tr.getMeta("addToHistory") !== false) retireSeededLines();
            // An edited paragraph keeps its mapped corrections until it is
            // measured again: no frame of browser lines in between.
            const changed = touchedTextblockRanges(tr);
            // At the cost of what the transaction touches (fastRangeMapping).
            if (fastRangeMappingOn()) {
              return {
                set: mapDecorationsFast(previous.set, tr),
                dirty: previous.dirty === "all" ? "all" : mapRangesFast(previous.dirty, tr, changed),
                retry: previous.retry.length ? mapRangesFast(previous.retry, tr, [], false) : previous.retry,
              };
            }
            const set = previous.set.map(tr.mapping, tr.doc);
            const dirty = previous.dirty === "all" ? "all" : [...mapRanges(previous.dirty, tr), ...changed];
            return { set, dirty, retry: mapRanges(previous.retry, tr) };
          },
        },
        props: {
          decorations: (state) => documentEngineLineBreaksKey.getState(state)?.set,
        },
        view(view) {
          const win = view.dom.ownerDocument.defaultView;
          if (!win || !textEngineOn("docs")) return {};
          // Probes compare a paragraph's engine lines with the drawn ones.
          (win as unknown as Record<string, unknown>).__mraiDocsLineAudit = (element: HTMLElement) => {
            const pos = view.posAtDOM(element, 0) - 1;
            const node = view.state.doc.nodeAt(pos);
            return node ? auditDocsParagraph(element, rulesFor(view, node), true, (paragraph) => engineHyphenation(view, element, paragraph)) : null;
          };
          let frame: number | null = null;
          let idle: number | null = null;
          let waitTimer: number | null = null;
          let full = true;
          /** Sheets a face arrived for (projectionFontNews): read with the dirty ones. */
          const fontSheets = new Set<Element>();
          // The width each paragraph was read at: its corrections are for
          // that measure. A layout that narrows a paragraph without an edit
          // (a sheet's column projection set after the first pass) left the
          // full-width corrections in place and the browser's lines between
          // them (R425-D02: the right column's "Thal Limited" paragraph kept
          // spans of a page-wide reading, its kept "the" went down). Widths
          // are looked at a moment after each pass and flush, while no hand
          // is typing; a paragraph drawn at another width is read again.
          // `window.__docsEngineWidthWatchOff = true`: as before.
          const readWidth = new WeakMap<ProseMirrorNode, number>();
          const widthMoved: Array<[number, number]> = [];
          let widthTimer: number | null = null;
          const widthWatchOff = () =>
            (win as Window & { __docsEngineWidthWatchOff?: boolean }).__docsEngineWidthWatchOff === true;
          const flushWidthsOff = () =>
            (win as Window & { __docsEngineFlushWidthsOff?: boolean }).__docsEngineFlushWidthsOff === true;
          const flushWidthsWiden = () =>
            (win as Window & { __docsEngineFlushWidthsWiden?: boolean }).__docsEngineFlushWidthsWiden === true;
          /** What a pass read a frame at a time took to read (every paragraph,
           * the sheets of an arrived face): given back if it is cut short. */
          let inFlight: (() => void) | null = null;
          const rounds = new Map<number, number>();
          const lineCache = createEngineLineCache();
          const cacheStats = (): EngineLineCacheStats | null => {
            const holder = win as Window & { __docsEngineLineCache?: EngineLineCacheStats };
            return holder.__docsEngineLineCache ??= { measured: 0, reused: 0, kept: 0 };
          };
          /** Since when paragraphs wait for a face file (the page ledger
           * waits with them, at most FACE_HOLD_MS). */
          let facesPendingSince: number | null = null;
          // Paragraphs a pass found waiting for a face file, by node. They are
          // read again once the engine's faces move, wherever they are: the
          // pass that answers runs long after the page ledger laid them out,
          // its horizon on other sheets, and a face file read by the engine
          // alone (its metrics, the browser's face long loaded) brings the
          // ledger no font news to widen it. R284-D30's Malgun Gothic Latin
          // 8 s late: page 7's cell paragraph kept the browser's lines for
          // good ("동/일한" where the engine squeezes "동일한").
          // `window.__docsEnginePendingAnywhereOff = true`: horizon only, as before.
          const waitingForFaces = new Set<ProseMirrorNode>();
          let facesLanded = false;
          const pendingAnywhereOff = () =>
            (win as Window & { __docsEnginePendingAnywhereOff?: boolean }).__docsEnginePendingAnywhereOff === true;
          // The page ledger lays pages out from the drawn lines: while lines
          // are about to be corrected it waits (and asks for them at once,
          // LAYOUT_METRICS_FLUSH_EVENT), so its cuts are made on the engine's
          // lines and never undone by a correction after them.
          const markPending = (pending: boolean) => writeDocumentLayoutStatus(view.dom, DOCUMENT_ENGINE_LINES_PENDING, pending ? "true" : null, view);
          const cancelScheduled = () => {
            if (frame !== null) { win.cancelAnimationFrame(frame); frame = null; }
            // A pass under way, cut short by the ledger's flush: what it took
            // to read is read by the flush instead. Taken and dropped, the
            // paragraphs waiting for a face that had just answered stayed the
            // browser's lines through the pages' release and were corrected
            
            if (inFlight) { inFlight(); inFlight = null; }
            if (idle !== null) {
              const cancel = (win as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback;
              if (cancel) cancel.call(win, idle);
              else win.clearTimeout(idle);
              idle = null;
            }
          };
          // The page ledger's flush usually measures first (in the frame it
          // lays pages out in, so its pass needs no second one); a pass of
          // our own runs only when no flush came for two frames (nothing to
          // lay out: a face landing on a settled document, a non-paged view).
          let flushes = 0;
          // An editor not in the page has no lines to read and none to wait
          // for: it says nothing is pending (a document printed from an
          // editor that was never attached waited on this flag for ever) and
          // is looked at again until it is attached, without touching the
          // flag meanwhile (print waits for the page to hold still).
          const waitUntilAttached = () => {
            if (waitTimer !== null) return;
            waitTimer = win.setTimeout(() => {
              waitTimer = null;
              if (view.dom.isConnected) schedule();
              else waitUntilAttached();
            }, 250);
          };
          const schedule = () => {
            if (!view.dom.isConnected) {
              markPending(false);
              waitUntilAttached();
              return;
            }
            // (Under the cold first layout these lines are read while the first
            // layout waits for the faces, unlike the projections after them:
            // reading them asks for the face files they need, and a first
            // layout let go before those files were in waited for them.)
            if (firstLayoutHoldsFaces(view.dom, schedule, "engine-lines")) return;
            markPending(true);
            if (frame !== null) return;
            const seen = flushes;
            frame = win.requestAnimationFrame(() => {
              frame = win.requestAnimationFrame(() => {
                frame = null;
                if (firstLayoutHoldsFaces(view.dom, schedule, "engine-lines")) return;
                if (flushes === seen) pass(false);
                else settle(false);
              });
            });
          };
          // After an edit the paragraph is measured once the keystroke has
          // been painted: typing never waits for it (iPad, Safari), unless
          // the page ledger asks for the lines first.
          let typingTimer: number | null = null;
          const typingHolds = () =>
            (win as Window & { __docsEngineLinesPerKey?: boolean }).__docsEngineLinesPerKey !== true && msSinceTyping() < TYPING_PAUSE_MS &&
            !editAtPageSeam(view);
          /** Measure the edits once the typing has paused: nothing pending meanwhile. */
          const afterTyping = () => {
            if (typingTimer !== null) return;
            typingTimer = win.setTimeout(() => {
              typingTimer = null;
              if (typingHolds()) afterTyping();
              else scheduleAfterPaint();
            }, Math.max(16, TYPING_PAUSE_MS - msSinceTyping()));
          };
          const scheduleAfterPaint = () => {
            markPending(true);
            if (idle !== null || frame !== null) return;
            const go = () => { idle = null; schedule(); };
            const request = (win as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
            idle = request ? request.call(win, go, { timeout: 150 }) : win.setTimeout(go, 32);
          };
          /** Blocks to measure now: the dirty ones (or all) on the sheets
           * within the page ledger's measure horizon, then the retries; the
           * dirty ranges on sheets past it are left for later. */
          const collectBlocks = () => {
            const state = documentEngineLineBreaksKey.getState(view.state);
            if (!state) return null;
            const doc = view.state.doc;
            const all = full || state.dirty === "all";
            full = false;
            const horizon = sheetsWithinMeasureHorizon(view.dom);
            recordProjectedHorizon(view.dom, ENGINE_LINES_HORIZON_KEY);
            const blocks: Array<{ node: ProseMirrorNode; pos: number; retry: boolean }> = [];
            const later: Array<[number, number]> = [];
            const seen = new Set<number>();
            const retryAt = new Set(state.retry.map(([from]) => from));
            const collect = (from: number, to: number) =>
              doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node, pos) => {
                if (!node.isTextblock) return true;
                if (!seen.has(pos) && node.content.size) {
                  seen.add(pos);
                  blocks.push({ node, pos, retry: retryAt.has(pos) });
                }
                return false;
              });
            const takenSheets = [...fontSheets];
            const takenMoved = widthMoved.splice(0);
            const fromFonts = takenSheets.length ? sheetRangesOf(view, takenSheets) : [];
            fontSheets.clear();
            const wanted: Array<[number, number]> = all ? [[0, doc.content.size]] : [...(state.dirty === "all" ? [] : state.dirty), ...fromFonts, ...takenMoved];
            if (all) rounds.clear();
            // A long list read sheet by sheet from its merged, ordered form:
            // every range against every sheet was sheets x ranges a round (a
            // document held as parts lists a part's paragraphs with each part).
            const ordered = fastRangeMappingOn() && wanted.length > 64 ? mergeRanges(wanted) : null;
            let cursor = 0;
            const clip = (ranges: readonly [number, number][], sheetFrom: number, sheetTo: number) => ranges
              .map(([from, to]): [number, number] => [Math.max(from, sheetFrom), Math.min(to, sheetTo)])
              .filter(([from, to]) => to > from || (to === from && from > sheetFrom && from < sheetTo));
            doc.forEach((sheet, offset) => {
              const sheetFrom = offset, sheetTo = offset + sheet.nodeSize;
              let parts: Array<[number, number]>;
              if (ordered) {
                while (cursor < ordered.length && ordered[cursor]![1] < sheetFrom) cursor += 1;
                let end = cursor;
                while (end < ordered.length && ordered[end]![0] <= sheetTo) end += 1;
                parts = clip(ordered.slice(cursor, end), sheetFrom, sheetTo);
              } else parts = clip(wanted, sheetFrom, sheetTo);
              if (!parts.length) return;
              const dom = horizon ? view.nodeDOM(offset) : null;
              if (horizon && dom && !horizon.has(dom as Element)) {
                later.push(...parts);
                return;
              }
              for (const [from, to] of parts) collect(from, to);
            });
            for (const [from, to] of state.retry) collect(from, to);
            const takenWaiting: ProseMirrorNode[] = [];
            if (facesLanded && waitingForFaces.size && !pendingAnywhereOff()) {
              facesLanded = false;
              for (const { node, pos } of blocksWaitingForFaces(doc, waitingForFaces)) {
                if (seen.has(pos)) continue;
                seen.add(pos);
                blocks.push({ node, pos, retry: false });
              }
              takenWaiting.push(...waitingForFaces);
              waitingForFaces.clear();
            }
            return { doc, blocks, all, later, takenSheets, takenMoved, takenWaiting, dirty: state.dirty === "all" || state.dirty.length > 0 || state.retry.length > 0 || fromFonts.length > 0 || takenMoved.length > 0 };
          };
          /** Measure; `sync`: every block now, the retry rounds too (the
           * ledger is waiting). Otherwise a slice per frame. */
          const pass = (sync: boolean) => {
            if (!view.dom.isConnected) {
              markPending(false);
              waitUntilAttached();
              return;
            }
            // An IME owns the DOM: nothing is read (a justified paragraph is
            // read left-aligned for a moment) and nothing dispatched, which the
            // composition guard would drop anyway; the lines stay pending and
            // are measured on the settled wake-up.
            if (isImeCompositionActive(view)) {
              markPending(true);
              return;
            }
            let anyFacesPending = false;
            let readAll = false;
            for (let round = 0; round <= MAX_ROUNDS; round += 1) {
              const collected = collectBlocks();
              if (!collected) return;
              readAll ||= collected.all;
              const { doc, blocks, all, dirty, later, takenSheets, takenMoved, takenWaiting } = collected;
              if (!blocks.length) {
                // Nothing within the horizon: dispatch only if that changes
                // the state (a flush that finds the same ranges left does
                // nothing, so the ledger's flush rounds stay cheap).
                const state = documentEngineLineBreaksKey.getState(view.state);
                const unchanged = state && state.retry.length === 0 && state.dirty !== "all" &&
                  state.dirty.length === later.length && state.dirty.every(([from, to], at) => later[at][0] === from && later[at][1] === to);
                if (dirty && !unchanged) view.dispatch(view.state.tr.setMeta(META, { spans: [], ranges: [], retry: [], dirty: later } satisfies EngineLinesMeta).setMeta("addToHistory", false));
                settle(anyFacesPending, readAll);
                return;
              }
              let index = 0;
              let facesPending = false;
              const floats: DocsFloatCache = new Map();
              const cache = { lines: lineCache, news: familyNews(view.dom.ownerDocument), stats: cacheStats() };
              const spans: Span[] = [];
              const measured: Array<[number, number]> = [];
              const retry: Array<[number, number]> = [];
              const finish = () => {
                const tr = view.state.tr.setMeta(META, { spans, ranges: measured, retry, dirty: later } satisfies EngineLinesMeta).setMeta("addToHistory", false);
                // Paragraphs newly left to the browser are read again by the
                // projections that keep Word's rules for the browser's lines.
                if (takeEngineDeclinedNews()) tr.setMeta("justifiedSpaceShrinkRemeasure", true);
                view.dispatch(tr);
                return retry.length > 0;
              };
              const slice = (count: number) => {
                const end = Math.min(blocks.length, index + count);
                for (; index < end; index += 1) {
                  const { node, pos, retry: again } = blocks[index];
                  const done = again ? (rounds.get(pos) ?? 0) : 0;
                  const result = measureBlock(view, node, pos, done, floats, cache);
                  if (result !== undefined) {
                    const element = view.nodeDOM(pos);
                    if (element instanceof HTMLElement && element.isConnected) readWidth.set(node, element.getBoundingClientRect().width);
                  }
                  measured.push([pos, pos + node.nodeSize]);
                  if (!result) {
                    if (result === undefined) {
                      facesPending = true;
                      waitingForFaces.add(node);
                    }
                    continue;
                  }
                  spans.push(...result.spans);
                  if (!result.agrees && done < MAX_ROUNDS && result.spans.length) {
                    rounds.set(pos, done + 1);
                    retry.push([pos, pos + node.nodeSize]);
                  } else if (result.agrees) rounds.delete(pos);
                }
              };
              if (sync) {
                slice(blocks.length);
                const more = finish();
                anyFacesPending ||= facesPending;
                if (!more) {
                  settle(anyFacesPending, readAll);
                  return;
                }
                continue;
              }
              const giveBack = () => {
                if (all) full = true;
                for (const sheet of takenSheets) fontSheets.add(sheet);
                widthMoved.push(...takenMoved);
                // The paragraphs it took from those waiting for faces are
                // read by whatever reads next (the flush that cut it short).
                if (takenWaiting.length) {
                  for (const node of takenWaiting) waitingForFaces.add(node);
                  facesLanded = true;
                }
              };
              const step = () => {
                frame = null;
                inFlight = null;
                if (!view.dom.isConnected) { giveBack(); return; }
                if (view.state.doc !== doc) {
                  // Edited meanwhile: what is left is measured next time.
                  giveBack();
                  if (typingHolds()) afterTyping();
                  else schedule();
                  return;
                }
                slice(BLOCKS_PER_SLICE);
                if (index < blocks.length) {
                  frame = win.requestAnimationFrame(step);
                  inFlight = giveBack;
                  return;
                }
                const more = finish();
                settle(facesPending, all);
                if (more) schedule();
              };
              step();
              return;
            }
            settle(anyFacesPending, readAll);
          };
          /** A pass ended: the ledger may lay pages out unless faces are
           * still coming (held a few seconds at most). */
          // Paragraphs read while a face was loading have no lines yet, and
          // nothing said when they could be read: the last pass of an opening
          // document ran 150 ms before its faces answered, no font event
          // followed, and its three justified paragraphs stayed the browser's
          
          // all pending, 0 corrections until an edit). The engine's epoch moves
          // when a pending answer may have come: it is looked at for a minute.
          let facesWatch: number | null = null;
          let facesEpoch = "";
          let facesAnswerEpoch = "";
          let facesWatchUntil = 0;
          // The cold first layout (coldFirstLayout): face files that land
          // change only the answers that were pending (textEngineAnswerEpoch),
          // so only the paragraphs waiting for them are read again (a Chinese
          // face's slices landing one by one read every paragraph of the
          // document again each time, the first page held all the while).
          const facesOnce = () => coldFirstLayout(win)?.fontsOnce === true && !pendingAnywhereOff();
          const watchFaces = () => {
            facesEpoch = textEngineEpoch();
            facesAnswerEpoch = textEngineAnswerEpoch();
            if (facesWatch !== null) return;
            facesWatchUntil = performance.now() + FACE_WATCH_MS;
            const once = facesOnce();
            const step = once ? FACE_WATCH_ONCE_STEP_MS : FACE_WATCH_STEP_MS;
            const look = () => {
              facesWatch = null;
              if (textEngineEpoch() !== facesEpoch) {
                if (once && textEngineAnswerEpoch() === facesAnswerEpoch) {
                  facesLanded = true;
                  schedule();
                  return;
                }
                // Read again, every paragraph; still pending, the pass watches on.
                full = true;
                facesLanded = true;
                schedule();
                return;
              }
              if (performance.now() < facesWatchUntil) facesWatch = win.setTimeout(look, step);
            };
            facesWatch = win.setTimeout(look, step);
          };
          





          const settle = (facesPending: boolean, readAll = false) => {
            const state = documentEngineLineBreaksKey.getState(view.state);
            // Dirty ranges past the measure horizon hold nothing: the ledger
            // asks for them (its flush) when its horizon reaches them.
            const work = frame !== null || idle !== null || Boolean(state && (state.dirty === "all" || state.retry.length));
            // A wait past its hold holds nothing and is ended by any pass (a
            // later wait starts its own hold).
            if (facesPending) facesPendingSince ??= performance.now();
            else if (readAll || (facesPendingSince !== null && performance.now() - facesPendingSince >= FACE_HOLD_MS)) facesPendingSince = null;
            // (Reading the waiting paragraphs alone ends the wait once none is
            // waiting any more: they were the ones it was for.)
            else if (facesPendingSince !== null && waitingForFaces.size === 0 && facesOnce()) facesPendingSince = null;
            if (facesPending) watchFaces();
            const holding = facesPendingSince !== null && performance.now() - facesPendingSince < FACE_HOLD_MS;
            markPending(work || holding);
            // Past the hold the pages go out on the browser's lines for these
            // paragraphs; a print waits on (useDocumentSurfaceReadiness).
            writeDocumentLayoutStatus(view.dom, DOCUMENT_ENGINE_FACES_WAITING, waitingForFaces.size ? "true" : null, view);
            if (holding && !work) win.setTimeout(() => { if (facesPendingSince !== null) settle(true); }, FACE_HOLD_MS);
            watchWidths();
          };
          /** The paragraphs (within the measure horizon) drawn at a width other
           * than the one they were read at. */
          const movedWidths = (narrowedOnly = false): Array<[number, number]> => {
            const doc = view.state.doc;
            const horizon = sheetsWithinMeasureHorizon(view.dom);
            const moved: Array<[number, number]> = [];
            let budget = WIDTH_WATCH_MAX_BLOCKS;
            doc.forEach((sheet, offset) => {
              if (budget <= 0) return;
              if (horizon) {
                const dom = view.nodeDOM(offset);
                if (dom && !horizon.has(dom as Element)) return;
              }
              doc.nodesBetween(offset, offset + sheet.nodeSize, (node, pos) => {
                if (budget <= 0) return false;
                if (!node.isTextblock) return true;
                const width = readWidth.get(node);
                if (width === undefined) return false;
                budget -= 1;
                const element = view.nodeDOM(pos);
                if (!(element instanceof HTMLElement) || !element.isConnected) return false;
                const drawnWidth = element.getBoundingClientRect().width;
                if (narrowedOnly ? width - drawnWidth > 0.5 : Math.abs(drawnWidth - width) > 0.5) {
                  readWidth.delete(node);
                  moved.push([pos, pos + node.nodeSize]);
                }
                return false;
              });
            });
            return moved;
          };
          const watchWidths = (): void => {
            if (widthTimer !== null || widthWatchOff()) return;
            widthTimer = win.setTimeout(() => {
              widthTimer = null;
              if (!view.dom.isConnected || widthWatchOff() || isImeCompositionActive(view)) return;
              if (typingHolds() || frame !== null || idle !== null) {
                watchWidths();
                return;
              }
              const moved = movedWidths();
              if (!moved.length) return;
              widthMoved.push(...moved);
              schedule();
            }, WIDTH_WATCH_MS);
          };
          const onFlush = () => {
            const state = documentEngineLineBreaksKey.getState(view.state);
            const dirty = Boolean(state && (state.dirty === "all" || state.dirty.length || state.retry.length));
            // The ledger is about to measure: a paragraph drawn now at another
            // width than it was read at carries the lines of that width, and is
            // read again first. Left to the width watch (300 ms after a pass,
            // and only once no pass is under way), its wrong lines were what
            // the ledger measured for every pass of an opening in between
            // (R372-D01: a two-column section's paragraphs read at the page's
            // width on a sheet not yet in columns, one line taller once in
            // their 325 px column; four passes planned on that, and the pages
            // went back when they were read again: 3 openings of 8).
            // Only one drawn narrower than it was read: its lines overflow the
            // measure and add rows. One drawn wider is most often a block the
            // ledger has just placed whose column is not laid out yet (R372-D01:
            // a joined paragraph drawn page-wide for a moment); read there, its
            // corrections set it a line taller in its column and the cut that
            // followed was joined and made again every pass (24 passes, one
            // opening of 6). The watch reads those once the passes rest.
            // `window.__docsEngineFlushWidthsOff = true`: the watch alone;
            // `window.__docsEngineFlushWidthsWiden = true`: wider ones too.
            if (!flushWidthsOff() && !widthWatchOff() && !isImeCompositionActive(view) && !typingHolds()) {
              const moved = movedWidths(!flushWidthsWiden());
              if (moved.length) widthMoved.push(...moved);
            }
            if (!view.dom.hasAttribute(DOCUMENT_ENGINE_LINES_PENDING) && !dirty && !widthMoved.length) {
              watchWidths();
              return;
            }
            // Ranges a hand is still typing in wait for the pause (afterTyping).
            if (!view.dom.hasAttribute(DOCUMENT_ENGINE_LINES_PENDING) && typingHolds()) return;
            flushes += 1;
            cancelScheduled();
            pass(true);
          };
          view.dom.addEventListener(LAYOUT_METRICS_FLUSH_EVENT, onFlush);
          // Faces landing (the engine's answers move from pending) and a
          // width change re-read every paragraph.
          const onFonts = (event?: Event) => {
            // (projectionFontNews) With the trial, only the paragraphs of the
            // sheets drawing the arrived face's characters are read again.
            const reach = projectionFontReach(view, "engine-lines", event);
            if (reach === "none") return;
            facesLanded = true;
            if (reach === "all") full = true;
            else for (const sheet of reach.sheets) fontSheets.add(sheet);
            schedule();
          };
          view.dom.ownerDocument.fonts?.addEventListener?.("loadingdone", onFonts);
          let lastWidth = view.dom.getBoundingClientRect().width;
          const observer = "ResizeObserver" in win
            ? new win.ResizeObserver(() => {
              const width = view.dom.getBoundingClientRect().width;
              if (Math.abs(width - lastWidth) < 0.5) return;
              lastWidth = width;
              full = true;
              schedule();
            })
            : null;
          observer?.observe(view.dom);
          const stopImeSettled = onImeCompositionSettled(view, () => {
            if (view.dom.hasAttribute(DOCUMENT_ENGINE_LINES_PENDING)) schedule();
          });
          schedule();
          return {
            update(updated, previousState) {
              // Only an edit: the plugin's own transactions (corrections,
              // ranges left past the horizon) schedule nothing, or the ledger
              // would see lines pending after every flush and never lay
              // pages out.
              if (updated.state.doc !== previousState.doc) {
                if (typingHolds()) afterTyping();
                else scheduleAfterPaint();
              }
              // ...and the tabs the tab layout sized anew (bandTabLayout): the
              // lines are cut from the tab widths drawn, so a paragraph whose
              // tabs changed is read again. Not read again, the lines of a
              // tabbed paragraph were those of the widths in place when it
              // was last read, which the tab layout may have changed after
              // (R282-D25: two lines or three by which came last).
              else if (!engineTabNewsOff()) {
                const moved = tabbedBlocksChanged(updated.state, previousState);
                if (moved.length) {
                  widthMoved.push(...moved);
                  schedule();
                }
              }
            },
            destroy() {
              stopImeSettled();
              observer?.disconnect();
              view.dom.removeEventListener(LAYOUT_METRICS_FLUSH_EVENT, onFlush);
              view.dom.ownerDocument.fonts?.removeEventListener?.("loadingdone", onFonts);
              cancelScheduled();
              if (waitTimer !== null) win.clearTimeout(waitTimer);
              if (facesWatch !== null) win.clearTimeout(facesWatch);
              if (typingTimer !== null) win.clearTimeout(typingTimer);
              if (widthTimer !== null) win.clearTimeout(widthTimer);
              markPending(false);
            },
          };
        },
      }),
    ];
  },
});
