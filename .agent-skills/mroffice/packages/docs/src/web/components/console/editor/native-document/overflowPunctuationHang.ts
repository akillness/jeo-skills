/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's "Allow punctuation to overflow the margin" (`w:overflowPunct`,
 * 允许标点溢出边界) in engines without CSS `hanging-punctuation`.
 *
 * A comma or full stop that would open a line may not open it (the line
 * break rules), so the engine carries the character before it down too and
 * leaves a gap at the end of the line above. Word, with the option on, keeps
 * that character on its line and lets the punctuation hang past the right
 * edge instead. Safari draws that from `hanging-punctuation: allow-end`;
 * Chromium ignores the property, and the paragraph broke exactly as with the
 * option off (live Word audit WUA 114).
 *
 * This plugin measures the lines of such paragraphs and gives exactly the
 * punctuation that was carried down a negative margin of its own width,
 * so it fits on the line above and hangs. A punctuation mark that no longer
 * ends its line loses the margin (it would overlap the next character).
 * Paint and line breaking only: nothing is saved.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { wordPunctuationMayHang } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import { wordEastAsianLineRulesApply, wordSetsIdeographsAsLetters } from "@mrnote/core/web/components/console/editor/native-document/wordFarEastDefaults.ts";
import { KINSOKU_EAST_ASIAN, OFFICE_KINSOKU } from "@mrnote/core/web/lib/text-engine/kinsoku.ts";
import { BULK_FILL_CHUNK_META } from "@mrnote/core/web/components/console/editor/native-document/bulkFillTransaction.ts";
import { INLINE_FORMULA_TYPESET_EVENT, PAGED_BULK_FILL_ATTR } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { releaseFreshRange } from "@mrnote/core/web/components/console/editor/native-document/paged/measurementRange.ts";
import { mergedRanges, touchedTextblockRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";
import { blockDomLocator, type BlockDomLocator } from "@mrnote/core/web/components/console/editor/native-document/blockDomLocator.ts";

const overflowPunctuationHangKey = new PluginKey<HangState>("overflowPunctuationHang");
const META = "overflowPunctuationHang";

/** Whether `transaction` publishes the measured hanging punctuation (it carries
 * nothing else: the plugin dispatches it on its own). */
export function isOverflowPunctuationHangTransaction(transaction: { getMeta(key: string): unknown }): boolean {
  return transaction.getMeta(META) !== undefined;
}
const HANG_ATTR = "data-docs-hanging-punctuation";

/** The marks Word lets hang at a line's end: stops and commas, full and half width. */
const HANGING = new Set(["，", "。", "、", "．", "﹐", "﹒", "，", "｡", "､", ",", "."]);
/** East Asian closing marks (kinsoku's "not at a line's start", outside
 * ASCII), which Word hangs too in Chinese, Japanese or Korean text, in mode 14
 * and in a justified mode-15 paragraph (docs-lines `eastAsianClosingMark`;
 * docx-look/probes/cjk3 h14l/h14j/h15j: ）。，、」”：；！？》 each one full
 * width past the margin). */
const EAST_ASIAN_HANGING = new Set([...OFFICE_KINSOKU["zh-CN"].noStart].filter((character) => /^[^\x00-\x7f]$/u.test(character) && /^\p{P}$/u.test(character)));
/** A full-width or ideographic mark; another ("”") hangs after East Asian text only. */
const FULL_WIDTH = /^[\u3000-\u303f\ufe10-\ufe6f\uff00-\uffef]$/u;
function eastAsianHangOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsEastAsianHangOff?: boolean }).__docsEastAsianHangOff === true;
}

/** Paragraphs per frame, so a long document does not stall on first measure. */
const BLOCKS_PER_SLICE = 60;

/** How many measured ranges wait for a publication to clear them. */
const MEASURED_RANGES_KEPT = 256;

type Box = { left: number; right: number; top: number; bottom: number };

interface Hang {
  pos: number;
  widthPx: number;
}

function charBox(view: EditorView, pos: number, locate?: BlockDomLocator): Box | null {
  try {
    // `locate`: the block's own positions (blockDomLocator), the answers of
    // view.domAtPos without walking every run before them.
    const start = locate ? locate(pos, 1) : view.domAtPos(pos, 1);
    const end = locate ? locate(pos + 1, -1) : view.domAtPos(pos + 1, -1);
    // A fresh Range per character. Reused across the plugin's measures
    // (measurementRange), the book's forced whole pass ended on 365 or 366
    // pages from run to run, against
    // 365 every time with a fresh one (16 runs). The plugin's hang
    // decisions keep what already hangs, so the order of its measures
    // decides the layout.
    const range = view.dom.ownerDocument.createRange();
    let rects: DOMRect[];
    try {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
    } finally {
      // Read: out of the page's range registry (every later node removal
      // visited each of these until it was collected).
      releaseFreshRange(range);
    }
    const rect = rects.find((candidate) => candidate.width > 0) ?? rects[0];
    return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
  } catch {
    return null;
  }
}

const sameRow = (a: Box, b: Box) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.bottom - a.top, b.bottom - b.top) / 2;

function overflowAllowed(element: HTMLElement): boolean {
  const explicit = element.getAttribute("data-overflow-punctuation");
  if (explicit !== null) return explicit === "true";
  return element.getAttribute("data-document-effective-overflow-punctuation") === "true";
}

/** Whether a block holds such a character, by block: every block of the
 * document was read again letter by letter after each change of its pages
 * (R315-D10: 75 s of a minute's freeze). A block changed is another node. */
const blocksHolding = new WeakMap<ProseMirrorNode, boolean>();

function hasHangingCandidate(node: ProseMirrorNode): boolean {
  const known = blocksHolding.get(node);
  if (known !== undefined) return known;
  let holds = false;
  for (const character of node.textContent) {
    if (HANGING.has(character) || EAST_ASIAN_HANGING.has(character)) {
      holds = true;
      break;
    }
  }
  blocksHolding.set(node, holds);
  return holds;
}

/** Character positions of a text block, one per character, -1 for an atom
 * (its own position in `atoms`, at the same index). `texts`, when given,
 * takes each position's character (the empty string for an atom): read off
 * the block's own text nodes, not the document (a `textBetween` per letter
 * walked the document's blocks from its start, for every letter of every
 * block measured: most of a long book's opening measure). */
function characterPositions(node: ProseMirrorNode, pos: number, atoms?: number[], texts?: string[]): number[] {
  const out: number[] = [];
  node.forEach((child, offset) => {
    if (child.isText) {
      const text = child.text ?? "";
      for (let index = 0; index < child.nodeSize; index += 1) {
        out.push(pos + 1 + offset + index);
        texts?.push(text.charAt(index));
      }
    } else {
      if (atoms) atoms[out.length] = pos + 1 + offset;
      out.push(-1);
      texts?.push("");
    }
  });
  return out;
}

/** The drawn pieces of an in-line formula (one per line it stands on). */
function formulaPieces(view: EditorView, pos: number): Box[] | null {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement) || !dom.querySelector(".katex")) return null;
  const pieces = Array.from(dom.getClientRects())
    .filter((rect) => rect.width > 0)
    .map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
  return pieces.length ? pieces : null;
}

/**
 * A mark carried down with the formula before it, when the formula would fit
 * on the line above with the mark hanging: Word keeps the formula there (the
 * book's "…时，G = Z(G)。": the whole formula on its line, the stop 2.2 px past
 * the edge). Carried down whole, the formula is what the line above lacks room
 * for; broken (a formula breaks after a relation, as Word's does), its last
 * piece is. The engine may also leave the formula on its line and carry the
 * mark down alone (a line opening with a stop, which Word never draws). Measured in Word for Mac 16.9: when the last piece does not fit
 * either, Word breaks the formula there too, and nothing hangs.
 */
function formulaCarriedDown(
  view: EditorView,
  mark: Box,
  formula: number,
  before: number | null,
  contentRight: number,
  locate?: BlockDomLocator,
): boolean {
  const pieces = formulaPieces(view, formula);
  const last = pieces?.[pieces.length - 1];
  if (!pieces || !last) return false;
  // The mark alone opens the next line (a formula is a place to break, the
  // stop after it no longer kept with it): it hangs at the formula's line.
  if (!sameRow(last, mark)) return last.bottom <= mark.top + 1 && last.right <= contentRight + 0.5;
  let lineAboveEnds: number;
  if (pieces.length > 1) {
    const previous = pieces[pieces.length - 2];
    if (sameRow(previous, last) || previous.bottom > last.top + 1) return false;
    lineAboveEnds = previous.right;
  } else {
    const above = before === null ? null : before >= 0 ? charBox(view, before, locate) : null;
    if (!above || sameRow(above, last) || above.bottom > last.top + 1) return false;
    lineAboveEnds = above.right;
  }
  return contentRight - lineAboveEnds + 0.5 >= last.right - last.left;
}

/** The hangs one paragraph needs, given the layout drawn now. */
function measureBlock(
  view: EditorView,
  node: ProseMirrorNode,
  pos: number,
  current: ReadonlySet<number>,
): Hang[] {
  const element = view.nodeDOM(pos);
  if (!(element instanceof HTMLElement) || !element.isConnected || !overflowAllowed(element)) return [];
  // From Word 2013's compatibility mode a mark hangs only in a justified or
  // distributed paragraph (wordPunctuationMayHang). An alignment the block
  // names itself excludes it before its style is resolved (every check below
  // only ever excludes, so the order changes no block's answer).
  const compatibilityMode = view.state.doc.attrs.wordCompatibilityMode;
  const namedAlign = element.getAttribute("data-text-align");
  if (namedAlign !== null && !wordPunctuationMayHang(compatibilityMode, namedAlign)) return [];
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style || (style.writingMode && style.writingMode !== "horizontal-tb") || style.direction === "rtl") return [];
  const align = namedAlign ?? style.textAlign;
  if (!wordPunctuationMayHang(compatibilityMode, align)) return [];
  const box = element.getBoundingClientRect();
  const px = (value: string) => Number.parseFloat(value) || 0;
  const contentRight = box.right - px(style.paddingRight) - px(style.borderRightWidth);
  const atoms: number[] = [];
  const texts: string[] = [];
  const chars = characterPositions(node, pos, atoms, texts);
  const locate = blockDomLocator(view, element, pos, node.content.size);
  const out: Hang[] = [];
  const eastAsianMarks = !eastAsianHangOff() && wordEastAsianLineRulesApply(view.state.doc.attrs, node) &&
    !wordSetsIdeographsAsLetters(view.state.doc.attrs);
  for (let index = 1; index < chars.length; index += 1) {
    const at = chars[index];
    if (at < 0 || !(HANGING.has(texts[index]!) || (eastAsianMarks && EAST_ASIAN_HANGING.has(texts[index]!) &&
      (FULL_WIDTH.test(texts[index]!) || KINSOKU_EAST_ASIAN.test(texts[index - 1] ?? ""))))) continue;
    const mark = charBox(view, at, locate);
    if (!mark) continue;
    const width = mark.right - mark.left;
    if (!(width > 0)) continue;
    const next = index + 1 < chars.length && chars[index + 1] >= 0 ? charBox(view, chars[index + 1], locate) : null;
    const endsRow = !next || !sameRow(next, mark);
    if (current.has(at)) {
      // Already hanging: kept while it still ends its line past the edge.
      if (endsRow && mark.right > contentRight - 0.5) out.push({ pos: at, widthPx: width });
      continue;
    }
    // Carried down: the character before it opens its line, and the line
    // above had room for that character alone.
    const before = chars[index - 1];
    const above = index >= 2 ? chars[index - 2] : -1;
    if (before < 0) {
      const formula = atoms[index - 1];
      if (formula !== undefined && formulaCarriedDown(view, mark, formula, index >= 2 ? above : null, contentRight, locate)) {
        out.push({ pos: at, widthPx: width });
      }
      continue;
    }
    if (above < 0) continue;
    const beforeBox = charBox(view, before, locate);
    const aboveBox = charBox(view, above, locate);
    if (!beforeBox || !aboveBox || !sameRow(beforeBox, mark) || sameRow(aboveBox, beforeBox)) continue;
    if (aboveBox.bottom > beforeBox.top + 1) continue;
    const room = contentRight - aboveBox.right;
    if (room + 0.5 >= beforeBox.right - beforeBox.left) out.push({ pos: at, widthPx: width });
  }
  return out;
}

function decorationsFor(doc: ProseMirrorNode, hangs: readonly Hang[]): DecorationSet {
  if (!hangs.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    hangs.map((hang) =>
      Decoration.inline(
        hang.pos,
        hang.pos + 1,
        {
          [HANG_ATTR]: "true",
          // The line breaker takes the margin before the mark (an end margin
          // came after it, too late to keep the line), and the relative
          // offset paints the mark back past the edge where it hangs.
          style: `margin-inline-start:${-Number(hang.widthPx.toFixed(3))}px;position:relative;left:${Number(hang.widthPx.toFixed(3))}px`,
        },
        { hangingPunctuation: true },
      ),
    ),
  );
}

/** The text blocks (in `tr.doc`) the transaction changed: every one the
 * changed ranges reach, the ones they insert included. Only the text blocks
 * at the ends of an inserted range were taken: of several pasted paragraphs
 * only the first and the last were measured. */
function changedTextblocks(tr: Transaction): Array<[number, number]> {
  // Every text block a step reached, a format or attribute step (which moves
  // no position) included: a size or font changed where a line breaks.
  return touchedTextblockRanges(tr);
}

interface HangState {
  set: DecorationSet;
  /** Text block ranges changed since the last measure, or every block. */
  dirty: Array<[number, number]> | "all";
}

interface HangMeta {
  hangs: Hang[];
  /** The ranges the measure covered; their old hangs are replaced. */
  ranges: Array<[number, number]> | "all";
}

export const OverflowPunctuationHang = Extension.create({
  name: "overflowPunctuationHang",
  addProseMirrorPlugins() {
    return [
      new Plugin<HangState>({
        key: overflowPunctuationHangKey,
        state: {
          init: () => ({ set: DecorationSet.empty, dirty: "all" }),
          apply: (tr, previous): HangState => {
            const meta = tr.getMeta(META) as HangMeta | undefined;
            if (meta) {
              if (meta.ranges === "all") return { set: decorationsFor(tr.doc, meta.hangs), dirty: [] };
              let set = previous.set;
              for (const [from, to] of meta.ranges) set = set.remove(set.find(from, to));
              const added = decorationsFor(tr.doc, meta.hangs);
              return { set: added === DecorationSet.empty ? set : set.add(tr.doc, added.find()), dirty: [] };
            }
            if (!tr.docChanged) return previous;
            // A long document's first fill arrives in chunks whose blocks the
            // other decorations are only built for once it is complete (the
            // effective overflow punctuation among them): it is measured
            // whole after the last chunk.
            if (tr.getMeta(BULK_FILL_CHUNK_META) === true) return { set: previous.set.map(tr.mapping, tr.doc), dirty: "all" };
            // A changed paragraph is measured again on its natural lines.
            const changed = changedTextblocks(tr);
            let set = previous.set.map(tr.mapping, tr.doc);
            for (const [from, to] of changed) set = set.remove(set.find(from, to));
            const dirty =
              previous.dirty === "all"
                ? "all"
                : [
                    ...previous.dirty.map(([from, to]): [number, number] => [tr.mapping.map(from, -1), tr.mapping.map(to, 1)]),
                    ...changed,
                  ];
            return { set, dirty };
          },
        },
        props: {
          decorations: (state) => overflowPunctuationHangKey.getState(state)?.set,
        },
        view(view) {
          const win = view.dom.ownerDocument.defaultView;
          if (!win) return {};
          let frame: number | null = null;
          let waitTimer: number | null = null;
          // A resize changes every line: the next measure covers every block.
          let full = true;
          // A mark that starts hanging moves the rest of its paragraph up a
          // line, which can carry the next one down: those paragraphs are
          // measured again, a bounded number of rounds.
          let again: Array<[number, number]> = [];
          let rounds = 0;
          const MAX_ROUNDS = 8;
          let measuredPrefix = 0;
          const run = () => {
            frame = null;
            if (!view.dom.isConnected) {
              // A view made before its editor is in the page (the window
              // mounts it later): look again shortly; nothing else would.
              if (waitTimer === null) waitTimer = win.setTimeout(() => { waitTimer = null; schedule(); }, 250);
              return;
            }
            const state = overflowPunctuationHangKey.getState(view.state);
            if (!state) return;
            // Still filling: the last chunk's update measures.
            if (view.dom.hasAttribute(PAGED_BULK_FILL_ATTR)) return;
            // The ranges at the head of `dirty` a measure that changed nothing
            // already covered (below); a publication clears them all.
            if (state.dirty === "all" || state.dirty.length < measuredPrefix) measuredPrefix = 0;
            const dirty = state.dirty === "all" ? "all" : state.dirty.slice(measuredPrefix);
            const ranges: Array<[number, number]> | "all" =
              full || dirty === "all" ? "all" : [...dirty, ...again];
            const dirtyCount = state.dirty === "all" ? 0 : state.dirty.length;
            again = [];
            if (ranges !== "all" && ranges.length === 0) return;
            if (dirty === "all" || dirty.length > 0 || full) rounds = 0;
            const startDoc = view.state.doc;
            const hanging = new Set(state.set.find().map((decoration) => decoration.from));
            const blocks: Array<{ node: ProseMirrorNode; pos: number }> = [];
            const seen = new Set<number>();
            const collect = (from: number, to: number) =>
              startDoc.nodesBetween(Math.max(0, from), Math.min(startDoc.content.size, to), (node, pos) => {
                if (!node.isTextblock) return true;
                if (!seen.has(pos) && hasHangingCandidate(node)) {
                  seen.add(pos);
                  blocks.push({ node, pos });
                }
                return false;
              });
            if (ranges === "all") collect(0, startDoc.content.size);
            else for (const [from, to] of mergedRanges(ranges)) collect(from, to);
            full = false;
            // Measured by paragraph node, not position: the pages move
            // paragraphs between them while a long document is measured, a
            // slice a frame (every move a new document). Restarted on each,
            // a 300-page book was never measured to its end and no stop
            // hung anywhere in it.
            const measured = new Map<ProseMirrorNode, Array<{ offset: number; widthPx: number }>>();
            let doc = startDoc;
            let posOf: Map<ProseMirrorNode, number> | null = null;
            const positionOf = (node: ProseMirrorNode, known: number): number | undefined => {
              if (doc === startDoc) return known;
              if (!posOf) {
                const map = new Map<ProseMirrorNode, number>();
                doc.descendants((child, pos) => {
                  if (!child.isTextblock) return true;
                  map.set(child, pos);
                  return false;
                });
                posOf = map;
              }
              return posOf.get(node);
            };
            let index = 0;
            const step = () => {
              frame = null;
              if (!view.dom.isConnected) return;
              if (view.state.doc !== doc) {
                doc = view.state.doc;
                posOf = null;
              }
              const current = new Set(
                (overflowPunctuationHangKey.getState(view.state)?.set ?? DecorationSet.empty).find().map((decoration) => decoration.from),
              );
              const end = Math.min(blocks.length, index + BLOCKS_PER_SLICE);
              for (; index < end; index += 1) {
                const { node } = blocks[index];
                const pos = positionOf(node, blocks[index].pos);
                if (pos === undefined) continue;
                measured.set(node, measureBlock(view, node, pos, doc === startDoc ? hanging : current)
                  .map((hang) => ({ offset: hang.pos - pos, widthPx: hang.widthPx })));
              }
              if (index < blocks.length) {
                frame = win.requestAnimationFrame(step);
                return;
              }
              if (view.state.doc !== doc) {
                doc = view.state.doc;
                posOf = null;
              }
              const hangs: Hang[] = [];
              const measuredRanges: Array<[number, number]> = [];
              const startPos = new Map(blocks.map((block) => [block.node, block.pos]));
              for (const [node, found] of measured) {
                const pos = positionOf(node, startPos.get(node) ?? -1);
                if (pos === undefined || pos < 0) continue;
                measuredRanges.push([pos, pos + node.nodeSize]);
                for (const hang of found) hangs.push({ pos: pos + hang.offset, widthPx: hang.widthPx });
              }
              const now = new Set(
                (overflowPunctuationHangKey.getState(view.state)?.set ?? DecorationSet.empty).find().map((decoration) => decoration.from),
              );
              const added = hangs.filter((hang) => !now.has(hang.pos));
              // Nothing hangs where nothing hung: a transaction would change no
              // decoration and still take the whole editor through an update,
              // after every page move and every key. Its only news is that
              // these ranges are measured. (Now and then it goes out anyway, so
              // that the list of measured ranges does not grow for good.)
              const holdsHangs = (from: number, to: number) => state.set.find(from, to).length > 0;
              const nothingChanged = hangs.length === 0 && ranges !== "all" && !ranges.some(([from, to]) => holdsHangs(from, to));
              if (nothingChanged && dirtyCount < MEASURED_RANGES_KEPT && doc === startDoc) {
                measuredPrefix = dirtyCount;
                // A formula typeset while this measure ran: its paragraph next.
                if (again.length) schedule();
                return;
              }
              measuredPrefix = 0;
              const published: Array<[number, number]> | "all" = ranges === "all" ? "all" : measuredRanges;
              view.dispatch(view.state.tr.setMeta(META, { hangs, ranges: published } satisfies HangMeta).setMeta("addToHistory", false));
              // Paragraphs made while this measure ran (edited, or split by a
              // page) are measured next.
              if (doc !== startDoc) {
                doc.descendants((child, pos) => {
                  if (!child.isTextblock) return true;
                  if (!measured.has(child) && hasHangingCandidate(child) && (ranges === "all" || ranges.some(([from, to]) => pos < to && pos + child.nodeSize > from))) {
                    again.push([pos, pos + child.nodeSize]);
                  }
                  return false;
                });
              }
              if (added.length && rounds < MAX_ROUNDS) {
                rounds += 1;
                for (const hang of added) {
                  const $at = doc.resolve(Math.min(doc.content.size, hang.pos));
                  if ($at.parent.isTextblock) again.push([$at.before(), $at.after()]);
                }
              }
              if (again.length) schedule();
            };
            step();
          };
          const schedule = () => {
            if (frame !== null) return;
            frame = win.requestAnimationFrame(run);
          };
          let lastWidth = view.dom.getBoundingClientRect().width;
          const observer =
            "ResizeObserver" in win
              ? new win.ResizeObserver(() => {
                  const width = view.dom.getBoundingClientRect().width;
                  if (Math.abs(width - lastWidth) < 0.5) return;
                  lastWidth = width;
                  full = true;
                  schedule();
                })
              : null;
          observer?.observe(view.dom);
          // A formula typeset where its placeholder stood breaks its lines
          // anew, with no change to the document: its paragraph is measured
          // again (a stop after it may now hang, or no longer).
          const onTypeset = (event: Event) => {
            const target = event.target;
            if (!(target instanceof win.Node)) return;
            try {
              const $at = view.state.doc.resolve(view.posAtDOM(target, 0));
              if (!$at.parent.isTextblock || $at.depth < 1) return;
              again.push([$at.before(), $at.after()]);
              schedule();
            } catch {
              // Not in this editor's document any more.
            }
          };
          view.dom.addEventListener(INLINE_FORMULA_TYPESET_EVENT, onTypeset);
          schedule();
          return {
            update(updated, previousState) {
              // A new document, or a state that starts the plugin over (the
              // editor's state replaced with the same document: nothing
              // measured, every block dirty) is measured again.
              const now = overflowPunctuationHangKey.getState(updated.state);
              const restarted =
                now !== overflowPunctuationHangKey.getState(previousState) &&
                now !== undefined &&
                (now.dirty === "all" || now.dirty.length > 0);
              if (updated.state.doc !== previousState.doc || restarted) {
                if (restarted && now.dirty === "all") full = true;
                schedule();
              }
            },
            destroy() {
              observer?.disconnect();
              view.dom.removeEventListener(INLINE_FORMULA_TYPESET_EVENT, onTypeset);
              if (frame !== null) win.cancelAnimationFrame(frame);
              if (waitTimer !== null) win.clearTimeout(waitTimer);
            },
          };
        },
      }),
    ];
  },
});
