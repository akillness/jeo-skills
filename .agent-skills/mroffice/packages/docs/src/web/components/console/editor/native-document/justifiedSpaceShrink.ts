/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's justified lines narrow their spaces to keep the next word.
 *
 * Word 16.86, in a document of compatibility mode 15 (Word 2013 and later),
 * lays out a justified paragraph by first trying the line with the next word
 * on it: when the overflow is small enough the spaces are narrowed and the
 * word stays; only past that does the word open the next line. The overflow
 * is the line's natural width with the space and the kept word, less the
 * width it has. How much is small enough was measured in Word's own PDFs
 * (Calibri, Cambria and Times New Roman at 11 and 22 pt, 1 to 20 spaces,
 * kept words "a", "the", "survey", "lighthouse", 0.25 pt steps of the right
 * indent; R83-D15 H11 beside a floating table agrees) and is the smaller of
 * two limits: a quarter of a space width for each of the n spaces after the
 * line's last tab, counting the one before the kept word; and 0.345 of the
 * kept word's width plus 0.372 of the space before it (0.085 em in those faces). That one space may be all the line has
 * (corpus R282-D05: "Submission: 15/09/2026", 0.63 pt too wide for its cell,
 * stays on one line). Spaces before a tab never count: the tab still ends at
 * its stop (corpus R32-D04). A line that can end after a hyphen keeps what
 * follows it the same way, with no space before it to count and no 0.085 em
 * (probe t-hy-keep, Times New Roman 12 pt, 3, 8 and 16 spaces, 0.5 pt steps;
 * corpus R282-D05: "rice-wheat" and "long-term" stay, two lines fewer by page
 * 2). A word's trailing punctuation is paid apart (`wordKeepsJustifiedWord`).
 * Mode 14 and earlier, and left, centred and right paragraphs, never narrow a space
 * (corpus R48-D05: a numbered question whose last word Word keeps on its one
 * line where a browser wraps it).
 *
 * Browsers only ever widen the spaces of a justified line. This plugin finds
 * each line whose next word Word would keep, and gives that line's text a
 * negative `word-spacing` just large enough for the browser's line breaker to
 * keep the word too; justification then spreads what is left. A kept word
 * that no longer stays on the line loses the narrowing. Paint and line
 * breaking only: nothing is saved.
 */
import { firstLayoutHoldsFaces } from "@mrnote/core/web/components/console/editor/native-document/paged/coldFirstLayout.ts";
import { engineDeclinedBlock, textblockOfElement } from "./engineDeclinedBlocks";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { DOCUMENT_JUSTIFIED_SHRINK_PENDING, LAYOUT_METRICS_FLUSH_EVENT, writeDocumentLayoutStatus } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { projectionFontReach, sheetRangesOf, textblocksIn } from "@mrnote/core/web/components/console/editor/native-document/projectionFontNews.ts";
import { normalizeWordCompatibilityMode } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import { measurementRange } from "@mrnote/core/web/components/console/editor/native-document/paged/measurementRange.ts";
import { MEASURE_HORIZON_EVENT, sheetsWithinMeasureHorizon } from "@mrnote/core/web/components/console/editor/native-document/paged/measureHorizon.ts";
import { pageTextWidth } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { textEngineEnabled } from "@mrnote/core/web/lib/text-engine/flags.ts";
import { mergedRanges, touchedTextblockRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";
import { wordKeepsJustifiedWord, wordTrailingPunctuationLength } from "@mrnote/core/web/lib/text-engine/docs-word-rules.ts";
import { msSinceTyping, TYPING_IDLE_MS } from "@mrnote/core/web/lib/typing-session.ts";
import { INITIAL_PAGINATION_SETTLING_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import { DOCUMENT_AUTO_LINE_SPACING_PENDING, PAGE_LEDGER_BACKGROUND_ATTR } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { fastRangeMappingOn, mapDecorationsFast, mapRangesFast } from "@mrnote/core/web/components/console/editor/native-document/fastRangeMapping.ts";

export {
  WORD_JUSTIFY_SPACE_SHARE,
  WORD_JUSTIFY_SPACE_BEFORE_SHARE,
  WORD_JUSTIFY_WORD_SHARE,
  wordKeepsJustifiedWord,
  wordTrailingPunctuationLength,
} from "@mrnote/core/web/lib/text-engine/docs-word-rules.ts";

const justifiedSpaceShrinkKey = new PluginKey<ShrinkState>("justifiedSpaceShrink");
const META = "justifiedSpaceShrink";
const SHRINK_ATTR = "data-docs-justified-shrink";
const BLOCKS_PER_SLICE = 40;
/** The most of a frame a pass reads in. */
const SLICE_MS = 8;
/** How many rounds a metrics flush may take before the ledger measures anyway. */
const FLUSH_TURNS = 12;
/** Whole passes the layout's own settling asks for, per state of the document. */
const MAX_LOOKS_AFTER_LAYOUT = 4;
/** A look the layout's settling asks for while the hand types waits until the
 * hand has rested this long, then runs once. */
const LOOK_AFTER_TYPING_REST_MS = 10_000;

/** On unless `window.__docsShrinkLooksWhileTyping = true` (development A/B). */
function shrinkLookWaitsForRest(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsShrinkLooksWhileTyping?: boolean }).__docsShrinkLooksWhileTyping !== true;
}
/** Lines are read again once the typing pauses this long: a key's edit keeps the
 * pulls it had, and reading a long paragraph's every character at every key was a
 * large part of the key (corpus R323-D11: 60 ms in a paragraph of 3,000). */
const TYPING_PAUSE_MS = 2 * TYPING_IDLE_MS;
/** A pass an edit restarts keeps what it read while a hand is at the keys. Any other
 * restart (a face that landed, a page laid out again) reads the lines as they now are. */
const RESTART_KEEPS_READINGS_MS = 60_000;
/** What a hyphen must stand before for a line to end after it. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

type Box = { left: number; right: number; top: number; bottom: number };

/** A line kept with its next word: the spaces of `from`..`to` narrow by `px`,
 * or (a line with no space to narrow) `from`..`to` is the punctuation that
 * hangs past the edge by `hang`. */
interface Pull {
  from: number;
  to: number;
  px: number;
  hang?: number;
}

/** Whether a paragraph stands in a table cell. */
export function wordInTableCell(element: Element): boolean {
  return element.closest("td, th") !== null;
}

function rangeBox(view: EditorView, from: number, to: number): Box | null {
  try {
    const start = view.domAtPos(from, 1);
    const end = view.domAtPos(to, -1);
    // One reused Range (measurementRange): a fresh one per character stays
    // live until collected and slows every DOM removal on the page.
    const range = measurementRange(view.dom.ownerDocument, "justifiedSpaceShrink.rangeBox");
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
    if (!rects.length) return null;
    return {
      left: Math.min(...rects.map((rect) => rect.left)),
      right: Math.max(...rects.map((rect) => rect.right)),
      top: Math.min(...rects.map((rect) => rect.top)),
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
    };
  } catch {
    return null;
  }
}

const sameRow = (a: Box, b: Box) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.bottom - a.top, b.bottom - b.top) / 2;

const spaceWidths = new Map<string, number>();
let measureContext: CanvasRenderingContext2D | null | undefined;

/** The natural width of a space in the element's font and spacing. */
function naturalSpaceWidth(element: Element): number | null {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return null;
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  let width = spaceWidths.get(font);
  if (width === undefined) {
    if (measureContext === undefined) {
      measureContext = element.ownerDocument.createElement("canvas").getContext("2d");
    }
    // The served face's own space (lib/text-engine) where the engine knows it.
    const engine = pageTextWidth("docs", " ", font);
    if (engine !== undefined) width = engine;
    else {
      if (!measureContext) return null;
      measureContext.font = font;
      width = measureContext.measureText(" ").width;
    }
    spaceWidths.set(font, width);
  }
  const extra = (value: string) => (value === "normal" ? 0 : Number.parseFloat(value) || 0);
  return width + extra(style.wordSpacing) + extra(style.letterSpacing);
}

/** The paragraph's characters, and an entry with no position for each inline object
 * that takes room on its line. One that takes none (the page-break mark Word leaves
 * in the first paragraph of each page, a bookmark point) is not there at all: it
 * opened the paragraph, and no line of a paragraph opened so was ever looked at. */
function textCharacters(view: EditorView, node: ProseMirrorNode, pos: number): Array<{ at: number; ch: string }> {
  const out: Array<{ at: number; ch: string }> = [];
  node.forEach((child, offset) => {
    if (child.isText) {
      const text = child.text ?? "";
      for (let index = 0; index < text.length; index += 1) out.push({ at: pos + 1 + offset + index, ch: text[index] });
      return;
    }
    const drawn = view.nodeDOM(pos + 1 + offset);
    if (drawn instanceof Element && drawn.getBoundingClientRect().width === 0) return;
    out.push({ at: -1, ch: "" });
  });
  return out;
}

/**
 * What keeps a word on its line in this paragraph (Word 16.86 ladders, Times New
 * Roman, 0.1 pt steps of the right indent):
 * - `narrow`: justified, mode 15: the spaces narrow (wordKeepsJustifiedWord).
 * - `hang`: mode 14 and earlier, justified or left, out of a table: nothing narrows,
 *   the word's trailing punctuation hangs all of its width, and a comma or stop a
 *   quarter of its width besides (corpus R279-D30: 80 paragraphs a line too long).
 * - `stops`: mode 15 not justified, and any mode 14 cell: a comma or stop hangs a
 *   quarter of its width.
 * Centred and right-aligned lines are left alone.
 */
type KeepRule = "narrow" | "hang" | "stops";

function keepRule(view: EditorView, element: HTMLElement): KeepRule | null {
  // The text engine keeps Word's kept words itself (documentEngineLineBreaks),
  // in the paragraphs it lays out: one it leaves to the browser (a face it
  // cannot read a width from) is kept here, as with the engine off (corpus
  // R283-D20: "β₁" in Times New Roman, the paragraph the browser's, and
  // "clusters", 1.15 px over, wrapped where Word narrows the spaces).
  if (textEngineEnabled("docs")) {
    const node = textblockOfElement(view, element);
    if (!node || !engineDeclinedBlock(node)) return null;
  }
  const mode = normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode);
  if (mode === null) return null;
  const align =
    element.getAttribute("data-text-align") ??
    element.ownerDocument.defaultView?.getComputedStyle(element).textAlign ??
    null;
  const justified = align === "justify";
  if (mode >= 15 && justified) return "narrow";
  if (align !== null && !justified && align !== "left" && align !== "start") return null;
  if (element.getAttribute("data-document-effective-overflow-punctuation") === "false") return null;
  return mode >= 15 || wordInTableCell(element) ? "stops" : "hang";
}

/** A comma's or stop's share past its own width (see {@link KeepRule}). */
const WORD_STOP_HANGS_SHARE = 0.25;

function contentRight(element: HTMLElement, style: CSSStyleDeclaration): number {
  return element.getBoundingClientRect().right -
    (Number.parseFloat(style.paddingRight) || 0) - (Number.parseFloat(style.borderRightWidth) || 0);
}

/** The pulls one paragraph needs, given the layout drawn now. */
function measureBlock(view: EditorView, node: ProseMirrorNode, pos: number, current: readonly Pull[]): Pull[] {
  const element = view.nodeDOM(pos);
  if (!(element instanceof HTMLElement) || !element.isConnected) return [];
  const rule = keepRule(view, element);
  if (!rule) return [];
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style || (style.writingMode && style.writingMode !== "horizontal-tb") || style.direction === "rtl") return [];
  const chars = textCharacters(view, node, pos);
  const out: Pull[] = [];
  // Pulls that still hold: the kept word is on its line's row.
  const kept: Pull[] = [];
  for (const pull of current) {
    const head = rangeBox(view, pull.from, pull.from + 1);
    const tail = rangeBox(view, pull.to - 1, pull.to);
    if (head && tail && sameRow(head, tail)) kept.push(pull);
  }
  out.push(...kept);
  const spaces: number[] = [];
  // Every place a line can end: a space, and a hyphen inside a word.
  const breaks: number[] = [];
  chars.forEach((item, index) => {
    if (item.ch === " ") {
      spaces.push(index);
      breaks.push(index);
    } else if (item.ch === "-" && WORD_CHARACTER.test(chars[index + 1]?.ch ?? "")) breaks.push(index);
  });
  if (!breaks.length) return out;
  const boxes = new Map<number, Box | null>();
  const box = (index: number) => {
    if (!boxes.has(index)) {
      const at = chars[index]?.at ?? -1;
      boxes.set(index, at < 0 ? null : rangeBox(view, at, at + 1));
    }
    return boxes.get(index) ?? null;
  };
  let lineStart = 0;
  for (let k = 0; k < breaks.length; k += 1) {
    const brk = breaks[k];
    const afterHyphen = chars[brk].ch === "-";
    const after = brk + 1 < chars.length ? box(brk + 1) : null;
    const spaceBox = box(brk);
    if (!after || !spaceBox) continue;
    // An object that opens the line has no character's box to read: its row is
    // the row of the first character after it.
    let startIndex = lineStart;
    while (startIndex < brk && chars[startIndex].at < 0) startIndex += 1;
    const startBox = box(startIndex);
    // Not a break: the next character is on the same row as this space.
    if (!startBox || sameRow(after, startBox)) continue;
    const lineFrom = lineStart;
    lineStart = brk + 1;
    const fromAt = chars[startIndex].at;
    if (fromAt < 0) continue;
    const breakAt = chars[brk].at;
    if (kept.some((pull) => pull.to > fromAt && pull.from <= breakAt)) continue;
    // The kept word: from after the break to the next place a line can end.
    let wordEnd = brk + 1;
    while (wordEnd < chars.length && chars[wordEnd].ch !== " ") {
      if (chars[wordEnd].at < 0) break;
      wordEnd += 1;
      if (chars[wordEnd - 1].ch === "-" && WORD_CHARACTER.test(chars[wordEnd]?.ch ?? "")) break;
    }
    if (wordEnd < chars.length && chars[wordEnd].at < 0) continue;
    // Word justifies -- and narrows -- only the spaces after a line's last
    // tab: a tab's advance is never stretched or compressed, nor the spaces
    // before it (corpus R32-D04: a hanging-indent "Label:<tab>text" line).
    let lastTab = -1;
    // An object in the line is no tab: the spaces before a field narrow as well
    // (Word 16.86 ladder: 12 spaces with a PAGE field between the sixth and the
    // seventh, kept to 9.14 pt over, 9 pt the limit of 12).
    for (let index = lineFrom; index < brk; index += 1) {
      if (chars[index].ch === "\t") lastTab = index;
    }
    // Nor do the spaces a line opens with (fixtures-1110/lead-spaces: the limit is
    // that of the spaces between the words, with 0, 1 or 2 spaces before them).
    let textFrom = lineFrom;
    while (textFrom < brk && chars[textFrom].ch === " ") textFrom += 1;
    const interior = spaces.filter((index) => index >= Math.max(textFrom, lastTab + 1) && index < brk);
    // After a hyphen no space stands before the kept word, and a line of one
    // word has no space to narrow: only trailing punctuation can stay, hanging.
    // In a table cell it does not hang: Word's limit there is the spaces alone,
    // with or without the punctuation (Word 16.86 ladder m10; corpus R280-D01,
    // "data;" kept on a cell's line, and the cell a line short).
    let trailingFrom = wordEnd;
    if (rule !== "narrow" || !wordInTableCell(element)) {
      while (trailingFrom > brk + 1 && wordTrailingPunctuationLength(chars[trailingFrom - 1].ch) === 1) trailingFrom -= 1;
    }
    if (afterHyphen && !interior.length && trailingFrom === wordEnd) continue;
    if (rule !== "narrow" && (afterHyphen || trailingFrom === wordEnd)) continue;
    const word = rangeBox(view, chars[brk + 1].at, chars[wordEnd - 1].at + 1);
    if (!word || !sameRow(word, after)) continue;
    const spaceNode = view.domAtPos(chars[interior[0] ?? brk].at, 1).node;
    const spaceElement = spaceNode instanceof Element ? spaceNode : spaceNode.parentElement;
    if (!spaceElement) continue;
    const natural = naturalSpaceWidth(spaceElement);
    const fontPx = Number.parseFloat(element.ownerDocument.defaultView!.getComputedStyle(spaceElement).fontSize);
    if (natural === null || !(fontPx > 0)) continue;
    // What justification added is read off every space of the line (a
    // browser may also widen the ones before a tab); what may narrow is only
    // the spaces after the last tab.
    let slack = 0;
    let readable = true;
    for (const index of spaces.filter((at) => at > lineFrom && at < brk)) {
      const b = box(index);
      if (!b) {
        readable = false;
        break;
      }
      slack += b.right - b.left - natural;
    }
    if (!readable || slack < -0.5) continue;
    if (rule !== "narrow") {
      const trailing = rangeBox(view, chars[trailingFrom].at, chars[wordEnd - 1].at + 1);
      if (!trailing) continue;
      const last = rangeBox(view, chars[wordEnd - 1].at, chars[wordEnd - 1].at + 1);
      const lastCharacter = chars[wordEnd - 1].ch;
      const stopPx = last && (lastCharacter === "," || lastCharacter === ".") ? last.right - last.left : 0;
      // A justified line was widened by its spaces: that is its room. A line left
      // as it is has what is left at its edge.
      const justifiedLine = element.getAttribute("data-text-align") === "justify" && interior.length > 0;
      const room = justifiedLine ? slack : contentRight(element, style) - spaceBox.left;
      const over = natural + (word.right - word.left) - room;
      const limit = (rule === "hang" ? trailing.right - trailing.left : 0) + stopPx * WORD_STOP_HANGS_SHARE;
      if (over > 0 && over <= limit) {
        out.push({ from: chars[trailingFrom].at, to: chars[wordEnd - 1].at + 1, px: 0, hang: over + 0.05 });
      }
      continue;
    }
    // A line with no space to stretch stands short of its edge: the room it
    // has is what is left there, not what justification added.
    const room = interior.length ? slack : contentRight(element, style) - (afterHyphen ? spaceBox.right : spaceBox.left);
    const overflow = (afterHyphen ? 0 : natural) + (word.right - word.left) - room;
    const count = interior.length + (afterHyphen ? 0 : 1);
    const trailing = trailingFrom < wordEnd ? rangeBox(view, chars[trailingFrom].at, chars[wordEnd - 1].at + 1) : null;
    const trailingPx = trailing ? trailing.right - trailing.left : 0;
    if (!wordKeepsJustifiedWord(overflow, count, afterHyphen ? 0 : fontPx, natural, word.right - word.left, trailingPx)) continue;
    if (!count) {
      out.push({ from: chars[trailingFrom].at, to: chars[wordEnd - 1].at + 1, px: 0, hang: overflow + 0.05 });
      continue;
    }
    const narrowFrom = lastTab >= lineFrom ? chars[lastTab + 1]?.at ?? -1 : fromAt;
    if (narrowFrom < 0) continue;
    out.push({ from: narrowFrom, to: chars[wordEnd - 1].at + 1, px: overflow / count + 0.05 });
  }
  return out;
}

function decorationsFor(doc: ProseMirrorNode, pulls: readonly Pull[]): DecorationSet {
  if (!pulls.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    pulls.map((pull) =>
      Decoration.inline(
        pull.from,
        pull.to,
        pull.hang
          ? { [SHRINK_ATTR]: "0", style: `margin-right:${-Number(pull.hang.toFixed(3))}px` }
          : { [SHRINK_ATTR]: String(Number(pull.px.toFixed(3))), style: `word-spacing:${-Number(pull.px.toFixed(3))}px` },
        { justifiedSpaceShrink: true, px: pull.px, hang: pull.hang },
      ),
    ),
  );
}

/**
 * The pulls a paragraph was measured to need, by its node and relative to its
 * start. A page's own move changes no paragraph: the same node goes on to its
 * new sheet and its lines are what they were. Read as changed, every paragraph
 * the ledger moved lost its pulls, stood a line taller until they were measured
 * again, and the next pass planned from that line: pages went back and forth a
 * line at a time, the same paragraph 358 px and 386 px on alternate passes
 * (corpus R282-D07: 15 passes, 30 s, then a cycle held).
 */
const measuredPulls = new WeakMap<ProseMirrorNode, ReadonlyArray<Pull>>();

function rememberPulls(node: ProseMirrorNode, pos: number, pulls: readonly Pull[]): void {
  measuredPulls.set(node, pulls.map((pull) => ({ ...pull, from: pull.from - pos, to: pull.to - pos })));
}

/** A page move (the ledger's or a band's): nothing it moved changes shape. */
const STRUCTURAL_MOVE_META = "structuralRebalance";

function changedTextblocks(tr: Transaction): Array<[number, number]> {
  // Every text block a step reached, a format or attribute step (which moves
  // no position) included: a size or font changed where a line breaks.
  return touchedTextblockRanges(tr);
}

interface ShrinkState {
  set: DecorationSet;
  dirty: Array<[number, number]> | "all";
}

interface ShrinkMeta {
  pulls: Pull[];
  ranges: Array<[number, number]> | "all";
}

function pullsIn(set: DecorationSet, from: number, to: number): Pull[] {
  return set
    .find(from, to)
    .map((decoration) => {
      const spec = decoration.spec as { px?: number; hang?: number };
      return { from: decoration.from, to: decoration.to, px: Number(spec.px) || 0, hang: spec.hang };
    });
}

export const JustifiedSpaceShrink = Extension.create({
  name: "justifiedSpaceShrink",
  addProseMirrorPlugins() {
    return [
      new Plugin<ShrinkState>({
        key: justifiedSpaceShrinkKey,
        state: {
          init: () => ({ set: DecorationSet.empty, dirty: "all" }),
          apply: (tr, previous): ShrinkState => {
            const meta = tr.getMeta(META) as ShrinkMeta | undefined;
            if (meta) {
              if (meta.ranges === "all") return { set: decorationsFor(tr.doc, meta.pulls), dirty: [] };
              let set = previous.set;
              for (const [from, to] of meta.ranges) set = set.remove(set.find(from, to));
              const added = decorationsFor(tr.doc, meta.pulls);
              return { set: added === DecorationSet.empty ? set : set.add(tr.doc, added.find()), dirty: [] };
            }
            if (!tr.docChanged && !tr.getMeta("justifiedSpaceShrinkRemeasure")) return previous;
            let changed = tr.docChanged ? changedTextblocks(tr) : [];
            // Mapped at the cost of what the transaction touches (fastRangeMapping):
            // a part appended past every pull keeps the set, and the list of
            // paragraphs to measure maps only its ranges at or past the change.
            const fast = fastRangeMappingOn();
            let set = fast ? mapDecorationsFast(previous.set, tr) : previous.set.map(tr.mapping, tr.doc);
            if (tr.docChanged && tr.getMeta(STRUCTURAL_MOVE_META) === true) {
              // Moved whole: its pulls again, nothing to measure. A paragraph
              // the move cut or joined is a new node: the pulls that followed
              // its text stand until it is measured.
              const fresh: Array<[number, number]> = [];
              const restored: Pull[] = [];
              for (const [from, to] of changed) {
                const node = tr.doc.nodeAt(from);
                const pulls = node ? measuredPulls.get(node) : undefined;
                if (!pulls) {
                  fresh.push([from, to]);
                  continue;
                }
                set = set.remove(set.find(from, to));
                for (const pull of pulls) restored.push({ ...pull, from: pull.from + from, to: pull.to + from });
              }
              if (restored.length) set = set.add(tr.doc, decorationsFor(tr.doc, restored).find());
              changed = fresh;
            }
            const dirty =
              previous.dirty === "all" || !tr.docChanged
                ? "all"
                : fast ? mapRangesFast(previous.dirty, tr, changed) : [
                    ...previous.dirty.map(([from, to]): [number, number] => [tr.mapping.map(from, -1), tr.mapping.map(to, 1)]),
                    ...changed,
                  ];
            return { set, dirty };
          },
        },
        props: {
          decorations: (state) => justifiedSpaceShrinkKey.getState(state)?.set,
        },
        view(view) {
          const win = view.dom.ownerDocument.defaultView;
          if (!win) return {};
          let frame: number | null = null;
          let waitTimer: number | null = null;
          let full = true;
          /** What the whole pass under way has read: it stands through a restart. */
          let readThisPass = new WeakSet<ProseMirrorNode>();
          let again: Array<[number, number]> = [];
          // Paragraphs skipped outside the measure horizon, measured once a
          // sheet comes within it (MEASURE_HORIZON_EVENT).
          let deferred = new Set<ProseMirrorNode>();
          const onHorizon = () => {
            if (deferred.size === 0) return;
            const waiting = deferred;
            deferred = new Set();
            view.state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              if (waiting.has(node)) again.push([pos, pos + node.nodeSize]);
              return false;
            });
            if (again.length) schedule();
          };
          view.dom.addEventListener(MEASURE_HORIZON_EVENT, onHorizon);
          let rounds = 0;
          let flushing = false;
          /** Each paragraph's pulls as read since its faces last changed. */
          let pullReadings = new WeakMap<ProseMirrorNode, Map<string, number>>();
          let wanted = false;
          /** Paragraphs wait to be measured, in a document these rules apply to. */
          const hasWork = (): boolean => {
            const mode = normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode);
            if (mode === null || mode < 15) return false;
            const state = justifiedSpaceShrinkKey.getState(view.state);
            return full || again.length > 0 || state?.dirty === "all" || Boolean(state?.dirty.length);
          };
          const markPending = (pending: boolean) => {
            if (view.dom.hasAttribute(DOCUMENT_JUSTIFIED_SHRINK_PENDING) === pending) return;
            writeDocumentLayoutStatus(view.dom, DOCUMENT_JUSTIFIED_SHRINK_PENDING, pending ? "true" : null, view);
          };
          // Each round settles at least the first line whose pull changed;
          // the lines after it lay out anew and are measured next round. A
          // long justified paragraph needs a round per such line (R83-D15
          // H11 beside a floating table missed its last kept words at 8).
          const MAX_ROUNDS = 64;
          const run = () => {
            frame = null;
            if (!flushing && firstLayoutHoldsFaces(view.dom, schedule, "justified-shrink")) return;
            if (!flushing) markPending(false);
            if (!view.dom.isConnected) {
              // A view made before its editor is in the page (the window
              // mounts it later): look again shortly; nothing else would.
              if (waitTimer === null) waitTimer = win.setTimeout(() => { waitTimer = null; schedule(); }, 250);
              return;
            }
            const state = justifiedSpaceShrinkKey.getState(view.state);
            if (!state) return;
            const mode = normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode);
            if (mode === null) {
              full = false;
              again = [];
              if (state.set !== DecorationSet.empty && state.set.find().length) {
                view.dispatch(view.state.tr.setMeta(META, { pulls: [], ranges: "all" } satisfies ShrinkMeta).setMeta("addToHistory", false));
              }
              return;
            }
            const paused = msSinceTyping();
            if (paused < TYPING_PAUSE_MS && (full || state.dirty === "all" || state.dirty.length > 0 || again.length > 0)) {
              if (waitTimer === null) {
                waitTimer = win.setTimeout(() => {
                  waitTimer = null;
                  schedule();
                }, TYPING_PAUSE_MS - paused);
              }
              return;
            }
            const ranges: Array<[number, number]> | "all" =
              full || state.dirty === "all" ? "all" : [...state.dirty, ...again];
            again = [];
            if (ranges !== "all" && ranges.length === 0) return;
            // What was edited is read as it stands without its pulls: one kept
            // before the edit may no longer be Word's.
            if (ranges !== "all" && state.dirty !== "all" && state.dirty.length > 0) {
              const pulled = mergedRanges(state.dirty).filter(([from, to]) => state.set.find(from, to).length > 0);
              if (pulled.length) {
                view.dispatch(view.state.tr.setMeta(META, { pulls: [], ranges: pulled } satisfies ShrinkMeta).setMeta("addToHistory", false));
              }
            }
            if (state.dirty === "all" || state.dirty.length > 0 || full) rounds = 0;
            const startDoc = view.state.doc;
            const blocks: Array<{ node: ProseMirrorNode; pos: number }> = [];
            const seen = new Set<number>();
            // A paragraph on a sheet outside the ledger's measure horizon (not
            // laid out yet, or left unread as it stands) keeps its pulls and is
            // measured once its sheet comes within it: reading it laid that
            // far page out.
            const horizon = sheetsWithinMeasureHorizon(view.dom);
            const kept: Pull[] = [];
            const keptCurrent = horizon ? state.set : null;
            const collect = (from: number, to: number) =>
              startDoc.nodesBetween(Math.max(0, from), Math.min(startDoc.content.size, to), (node, pos) => {
                if (!node.isTextblock) return true;
                if (!seen.has(pos) && node.textContent.includes(" ")) {
                  seen.add(pos);
                  const element = horizon ? view.nodeDOM(pos) : null;
                  const sheet = element instanceof win.HTMLElement ? element.closest("article[data-page-sheet]") : null;
                  if (horizon && sheet && !horizon.has(sheet)) {
                    kept.push(...pullsIn(keptCurrent!, pos, pos + node.nodeSize));
                    deferred.add(node);
                  } else {
                    blocks.push({ node, pos });
                  }
                }
                return false;
              });
            if (ranges === "all") collect(0, startDoc.content.size);
            else for (const [from, to] of mergedRanges(ranges)) collect(from, to);
            full = false;
            // A whole pass replaces every pull: the kept ones stand again.
            const pulls: Pull[] = ranges === "all" ? [...kept] : [];
            const before = new Map<number, string>();
            let index = 0;
            const step = () => {
              frame = null;
              if (!view.dom.isConnected) return;
              if (view.state.doc !== startDoc) {
                if (ranges === "all") full = true;
                schedule();
                return;
              }
              // A whole pass reads every character of the pages it reaches (300,000
              // rectangles on a 25-page paper): it gives way to the hand, in a
              // slice of a frame at most, and what it read stands if an edit
              // starts it over.
              if (!flushing) {
                const sinceTyping = msSinceTyping();
                if (sinceTyping < TYPING_PAUSE_MS) {
                  if (waitTimer === null) {
                    waitTimer = win.setTimeout(() => {
                      waitTimer = null;
                      if (frame === null) frame = win.requestAnimationFrame(step);
                    }, TYPING_PAUSE_MS - sinceTyping);
                  }
                  return;
                }
              }
              const end = Math.min(blocks.length, index + BLOCKS_PER_SLICE);
              const current = justifiedSpaceShrinkKey.getState(view.state)?.set ?? DecorationSet.empty;
              const sliceStarted = performance.now();
              for (; index < end; index += 1) {
                const { node, pos } = blocks[index];
                const existing = pullsIn(current, pos, pos + node.nodeSize);
                before.set(pos, JSON.stringify(existing.map((pull) => [pull.from, pull.to])));
                const known = ranges === "all" && readThisPass.has(node) && msSinceTyping() < RESTART_KEEPS_READINGS_MS ? measuredPulls.get(node) : undefined;
                if (known) {
                  for (const pull of known) pulls.push({ ...pull, from: pull.from + pos, to: pull.to + pos });
                  continue;
                }
                let measuredNow = measureBlock(view, node, pos, existing);
                // A pull that does not hold is read again under its own narrowed
                // spaces, which ask for another, which does not hold either: the
                // two came back in turn for ever (corpus R283-D05: 0.445 and 0.062
                // px on one line). A paragraph that gives a reading for the third time
                // is going round, and that ends on whichever of the two pulls more. This
                // is an ordering rule and not Word's: Word does not read its lines twice.
                // It only has to give one answer whatever order the readings came in.
                // Ending at the first repeat, on the one that happened to stand, stopped
                // paragraphs still settling and left lines without the pull they needed
                // (corpus R280-D14: 14 breaks unlike Word's to 137; R280-D01: 17 pages
                // for Word's 16).
                const readingOf = (read: readonly Pull[]) =>
                  JSON.stringify(read.map((pull) => [pull.from - pos, pull.to - pos, pull.px.toFixed(3), pull.hang?.toFixed(3)]));
                const reading = readingOf(measuredNow);
                let readings = pullReadings.get(node);
                if (!readings) pullReadings.set(node, (readings = new Map()));
                const seen = readings.get(reading) ?? 0;
                readings.set(reading, seen + 1);
                if (seen >= 2 && reading !== readingOf(existing)) {
                  const pulled = (read: readonly Pull[]) => read.reduce((sum, pull) => sum + pull.px + (pull.hang ?? 0), 0);
                  if (pulled(existing) >= pulled(measuredNow)) measuredNow = existing;
                }
                rememberPulls(node, pos, measuredNow);
                pulls.push(...measuredNow);
                if (ranges === "all") readThisPass.add(node);
                if (!flushing && performance.now() - sliceStarted > SLICE_MS) {
                  index += 1;
                  break;
                }
              }
              if (index < blocks.length) {
                if (flushing) step();
                else frame = win.requestAnimationFrame(step);
                return;
              }
              if (ranges === "all") readThisPass = new WeakSet();
              const measured: Array<[number, number]> | "all" =
                ranges === "all" ? "all" : blocks.map(({ node, pos }): [number, number] => [pos, pos + node.nodeSize]);
              const changedBlocks = blocks.filter(({ node, pos }) => {
                const now = pulls.filter((pull) => pull.from >= pos && pull.to <= pos + node.nodeSize);
                return JSON.stringify(now.map((pull) => [pull.from, pull.to])) !== before.get(pos);
              });
              // Nothing moved and nothing waits to be marked as read: the layout
              // has no reason to hear of it.
              const nowState = justifiedSpaceShrinkKey.getState(view.state);
              if (!changedBlocks.length && nowState?.dirty !== "all" && nowState?.dirty.length === 0) return;
              view.dispatch(view.state.tr.setMeta(META, { pulls, ranges: measured } satisfies ShrinkMeta).setMeta("addToHistory", false));
              // A paragraph whose pulls changed lays out again: measured once more.
              if (changedBlocks.length && rounds < MAX_ROUNDS) {
                rounds += 1;
                for (const { node, pos } of changedBlocks) again.push([pos, pos + node.nodeSize]);
                schedule();
              }
            };
            step();
          };
          const schedule = () => {
            if (flushing) {
              wanted = true;
              return;
            }
            // The first layout waits for the document's faces: measured once
            // they are in, at the ledger's flush (coldFirstLayout).
            if (frame === null && firstLayoutHoldsFaces(view.dom, schedule, "justified-shrink")) return;
            if (hasWork()) markPending(true);
            if (frame !== null) return;
            frame = win.requestAnimationFrame(run);
          };
          // The ledger asks for the line metrics before it measures a page: a
          // page read before its paragraphs' pulls reads a line too many, and
          // the next pass moves the page's cut back.
          const onMetricsFlush = () => {
            if (!view.dom.hasAttribute(DOCUMENT_JUSTIFIED_SHRINK_PENDING)) return;
            if (frame !== null) {
              win.cancelAnimationFrame(frame);
              frame = null;
            }
            flushing = true;
            try {
              for (let turn = 0; turn < FLUSH_TURNS; turn += 1) {
                wanted = false;
                run();
                if (!wanted && again.length === 0) break;
              }
            } finally {
              flushing = false;
            }
            markPending(false);
          };
          view.dom.addEventListener(LAYOUT_METRICS_FLUSH_EVENT, onMetricsFlush);
          let lastWidth = view.dom.getBoundingClientRect().width;
          const observer =
            "ResizeObserver" in win
              ? new win.ResizeObserver(() => {
                  const width = view.dom.getBoundingClientRect().width;
                  if (Math.abs(width - lastWidth) < 0.5) return;
                  lastWidth = width;
                  pullReadings = new WeakMap();
                  full = true;
                  schedule();
                })
              : null;
          observer?.observe(view.dom);
          // What the first pass read may not be what the page ends up drawing: the
          // document's faces land later, and the page lays out on. Nothing else tells
          // this plugin (corpus R280-D20: 17 kept words of 83 missed, a page short).
          const lookAgain = () => {
            readThisPass = new WeakSet();
            full = true;
            schedule();
          };
          const onFontsLoaded = (event?: Event) => {
            // (projectionFontNews) With the trial, only the paragraphs of the
            // sheets drawing the arrived face's characters are read again.
            const reach = projectionFontReach(view, "justified-shrink", event);
            if (reach === "none") return;
            if (reach === "all") {
              pullReadings = new WeakMap();
              lookAgain();
              return;
            }
            const ranges = sheetRangesOf(view, reach.sheets);
            textblocksIn(view, ranges, (node) => pullReadings.delete(node));
            again.push(...ranges);
            schedule();
          };
          view.dom.ownerDocument.fonts?.addEventListener?.("loadingdone", onFontsLoaded);
          // A whole pass whose pulls draw the lines anew sends the Auto line
          // spacing round again, whose end asks for a whole pass: on a paragraph
          // whose pulls alternate that never stopped, the document never counted
          // as laid out and its print ran out its time (corpus R283-D05: 70 rounds
          // a second, the PDF drawn the old way after minutes). A few looks per
          // document state are all this has to say.
          let looksSinceChange = 0;
          // While the pages are still being laid out the look waits for their end:
          // a line box changes no break, and a whole pass after each of a long
          // document's passes was up to 1.5 s of each (R286-D01).
          let lookWaits = false;
          // The flags an edit's own passes raise (the Auto line spacing over the
          // typed paragraph, the ledger's background after a key) came down after
          // every key, and each sent a whole pass: every character of every page
          // read again, and in WebKit every dormant sheet of a long document woken
          // and laid out with each key after it (R286-D01 in Safari: 64 of 64
          // sleeping sheets awake, seconds a key). The edit's own paragraphs are
          // its dirty ranges; what such a look is for (a line box or face that
          // landed late) is looked at once the hand has rested.
          let restTimer: number | null = null;
          const lookAfterRest = () => {
            if (restTimer !== null) return;
            const wait = () => {
              const rested = msSinceTyping();
              if (rested < LOOK_AFTER_TYPING_REST_MS) {
                restTimer = win.setTimeout(wait, LOOK_AFTER_TYPING_REST_MS - rested);
                return;
              }
              restTimer = null;
              lookAgainAfterLayout();
            };
            restTimer = win.setTimeout(wait, Math.max(0, LOOK_AFTER_TYPING_REST_MS - msSinceTyping()));
          };
          const lookAgainAfterLayout = () => {
            if (view.dom.hasAttribute(INITIAL_PAGINATION_SETTLING_ATTR) || view.dom.hasAttribute(PAGE_LEDGER_BACKGROUND_ATTR)) {
              lookWaits = true;
              return;
            }
            lookWaits = false;
            if (shrinkLookWaitsForRest() && msSinceTyping() < LOOK_AFTER_TYPING_REST_MS) {
              lookAfterRest();
              return;
            }
            if (looksSinceChange >= MAX_LOOKS_AFTER_LAYOUT) return;
            looksSinceChange += 1;
            lookAgain();
          };
          // The faces and line boxes the runs are drawn in come after the first
          // pass, the settle ends after those.
          const layoutStates = [
            INITIAL_PAGINATION_SETTLING_ATTR,
            PAGE_LEDGER_BACKGROUND_ATTR,
            DOCUMENT_AUTO_LINE_SPACING_PENDING,
            "data-docs-display-fonts-pending",
          ];
          const settled =
            "MutationObserver" in win
              ? new win.MutationObserver((records) => {
                  if (records.some((record) => record.oldValue !== null && !view.dom.hasAttribute(record.attributeName ?? "") &&
                    (record.attributeName !== PAGE_LEDGER_BACKGROUND_ATTR || lookWaits))) {
                    lookAgainAfterLayout();
                  }
                })
              : null;
          settled?.observe(view.dom, { attributes: true, attributeOldValue: true, attributeFilter: layoutStates });
          schedule();
          return {
            update(updated, previousState) {
              // A new document, or a state that starts the plugin over (the
              // editor's state replaced with the same document: nothing
              // measured, every block dirty) is measured again.
              const now = justifiedSpaceShrinkKey.getState(updated.state);
              const restarted =
                now !== justifiedSpaceShrinkKey.getState(previousState) &&
                now !== undefined &&
                (now.dirty === "all" || now.dirty.length > 0);
              if (updated.state.doc !== previousState.doc) looksSinceChange = 0;
              if (updated.state.doc !== previousState.doc || restarted) {
                if (restarted && now.dirty === "all") full = true;
                schedule();
              }
            },
            destroy() {
              if (restTimer !== null) win.clearTimeout(restTimer);
              observer?.disconnect();
              settled?.disconnect();
              view.dom.ownerDocument.fonts?.removeEventListener?.("loadingdone", onFontsLoaded);
              view.dom.removeEventListener(MEASURE_HORIZON_EVENT, onHorizon);
              view.dom.removeEventListener(LAYOUT_METRICS_FLUSH_EVENT, onMetricsFlush);
              if (frame !== null) win.cancelAnimationFrame(frame);
              if (waitTimer !== null) win.clearTimeout(waitTimer);
            },
          };
        },
      }),
    ];
  },
});
