/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's distributed alignment (`w:jc w:val="distribute"`, 分散对齐) on the
 * line that ends a paragraph or a manual line break: Word 16 for Mac spreads
 * such a Latin line letter by letter (wp-fix-a/dist2.docx: "last line" gets
 * 65.15px after every letter, a word gap two shares and 5.8px), while its
 * full lines take the extra at word gaps only (1.35px per gap, none between
 * letters). A Han line is spread between every character on every line, and
 * a Thai line puts all of it in its word gaps, last line too.
 *
 * CSS (`text-align-last: justify`) spreads every line at its justification
 * opportunities: right for full lines, for Han and for Thai, but a Latin
 * last line gets only wider spaces. This plugin measures such lines and
 * gives their characters the letter spacing that fills the line; the
 * justification then only absorbs the sub-pixel rest. Paint only: the
 * spacing is a decoration, the line already fits, nothing is saved.
 */
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { measurementRange } from "@mrnote/core/web/components/console/editor/native-document/paged/measurementRange.ts";
import { pageTextWidth } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { touchedTextblockRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";
import { afterFontsReady } from "@mrnote/core/web/lib/font-face-news.ts";

export const distributedLastLinesKey = new PluginKey<DecorationSet>("distributedLastLines");
const LINE_SPACING_ATTR = "data-docs-distributed-line";
/** Text Word spreads at its own opportunities (between Han characters, at
 * Thai/Lao/Khmer/Myanmar word gaps): those lines keep the CSS spreading. */
const NOT_LETTER_SPREAD =
  /[฀-໿က-႟ក-៿ᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-￯]/u;

export interface LineSpacing {
  from: number;
  to: number;
  letterSpacingPx: number;
}

const META = "distributedLastLines";

/** Whether `transaction` publishes the measured distributed last-line spacing (it carries
 * nothing else: the plugin dispatches it on its own). */
export function isDistributedLastLinesTransaction(transaction: { getMeta(key: string): unknown }): boolean {
  return transaction.getMeta(META) !== undefined;
}

const HOLDS_DISTRIBUTED = new SheetFact((node) => node.isTextblock && node.attrs.textAlign === "distribute");

function distributedBlocks(doc: ProseMirrorNode): Array<{ node: ProseMirrorNode; pos: number }> {
  const out: Array<{ node: ProseMirrorNode; pos: number }> = [];
  HOLDS_DISTRIBUTED.descendants(doc, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.attrs.textAlign === "distribute" && node.textContent.trim()) out.push({ node, pos });
    return false;
  });
  return out;
}

type Box = { left: number; right: number; top: number; bottom: number };

function charBox(view: EditorView, pos: number): Box | null {
  try {
    const start = view.domAtPos(pos, 1);
    const end = view.domAtPos(pos + 1, -1);
    // One reused Range (measurementRange): a fresh one per character stays
    // live until collected and slows every DOM removal on the page.
    const range = measurementRange(view.dom.ownerDocument, "distributedLastLines.charBox");
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
    const rect = rects.find((candidate) => candidate.width > 0) ?? rects[0];
    return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
  } catch {
    return null;
  }
}

const sameRow = (a: Box, b: Box) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.bottom - a.top, b.bottom - b.top) / 2;

/** The text positions (one per character) of the line that ends at
 * `lastChar`, walking back while the characters share its row. */
function lineEndingAt(view: EditorView, chars: readonly number[], lastIndex: number): number[] | null {
  const anchor = charBox(view, chars[lastIndex]);
  if (!anchor) return null;
  const line = [chars[lastIndex]];
  for (let index = lastIndex - 1; index >= 0; index -= 1) {
    const box = charBox(view, chars[index]);
    if (!box) return null;
    if (!sameRow(box, anchor) || box.left > anchor.left) break;
    line.unshift(chars[index]);
  }
  return line;
}

export function measureDistributedLines(view: EditorView): LineSpacing[] {
  const out: LineSpacing[] = [];
  const { doc } = view.state;
  for (const { node, pos } of distributedBlocks(doc)) {
    const element = view.nodeDOM(pos);
    if (!(element instanceof HTMLElement) || !element.isConnected) continue;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!style || style.textAlignLast !== "justify") continue;
    const scale = element.getBoundingClientRect().width / (element.offsetWidth || 1) || 1;
    const px = (value: string) => Number.parseFloat(value) || 0;
    const box = element.getBoundingClientRect();
    const contentLeft = box.left + (px(style.paddingLeft) + px(style.borderLeftWidth)) * scale;
    const contentRight = box.right - (px(style.paddingRight) + px(style.borderRightWidth)) * scale;
    // Character positions in order, split at manual line breaks.
    const segments: number[][] = [[]];
    node.forEach((child, offset) => {
      if (child.isText) {
        const text = child.text ?? "";
        for (let index = 0; index < child.nodeSize; index += 1) {
          // An imported w:br is a line feed in the run's text.
          if (text[index] === "\n") segments.push([]);
          else segments[segments.length - 1].push(pos + 1 + offset + index);
        }
      } else if (child.type.name === "hardBreak") segments.push([]);
      else segments[segments.length - 1].push(-1);
    });
    for (const segment of segments) {
      // The segment's own last character (trailing spaces hang).
      let last = segment.length - 1;
      while (last >= 0 && (segment[last] < 0 || doc.textBetween(segment[last], segment[last] + 1) === " ")) last -= 1;
      if (last < 1 || segment.slice(0, last + 1).some((at) => at < 0)) continue;
      const line = lineEndingAt(view, segment, last);
      if (!line || line.length < 2) continue;
      const text = doc.textBetween(line[0], line[line.length - 1] + 1);
      if (NOT_LETTER_SPREAD.test(text)) continue;
      const first = charBox(view, line[0]);
      const end = charBox(view, line[line.length - 1]);
      if (!first || !end) continue;
      // The line as drawn now holds this plugin's own spacing (after every
      // character but the last) and the justification's (at spaces); the
      // natural width is the drawn one less both.
      const previous = decoratedSpacing(view, line[0]);
      const spaces = Array.from(text).filter((character) => character === " ").length;
      const drawn = (end.right - first.left) / scale;
      const justifyRest = spaces > 0 ? justificationAtSpaces(view, line, scale) : 0;
      const natural = drawn - previous * (line.length - 1) - justifyRest;
      const room = (contentRight - contentLeft) / scale - (first.left - contentLeft) / scale;
      const spare = room - natural;
      if (!(spare > 0.5)) continue;
      // Whole 1/64 px, rounded down: the line must still fit.
      const letterSpacingPx = Math.floor(((spare - 0.25) / (line.length - 1)) * 64) / 64;
      if (!(letterSpacingPx > 0)) continue;
      out.push({ from: line[0], to: line[line.length - 1], letterSpacingPx });
    }
  }
  return out;
}

/** The letter spacing this plugin gives the character at `at` now. */
function decoratedSpacing(view: EditorView, at: number): number {
  try {
    const { node } = view.domAtPos(at, 1);
    const holder = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
    const span = holder?.closest<HTMLElement>(`[${LINE_SPACING_ATTR}]`);
    return span ? Number.parseFloat(span.style.letterSpacing) || 0 : 0;
  } catch {
    return 0;
  }
}

/** How much wider the line's spaces are drawn than the face's own space:
 * the justification's share. */
function justificationAtSpaces(view: EditorView, line: readonly number[], scale: number): number {
  let extra = 0;
  const canvas = view.dom.ownerDocument.createElement("canvas").getContext("2d");
  for (const at of line) {
    if (view.state.doc.textBetween(at, at + 1) !== " ") continue;
    const box = charBox(view, at);
    if (!box || !canvas) continue;
    const { node } = view.domAtPos(at, 1);
    const holder = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
    if (!holder) continue;
    const style = view.dom.ownerDocument.defaultView!.getComputedStyle(holder);
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const own = (pageTextWidth("docs", " ", canvas.font) ?? canvas.measureText(" ").width) + (Number.parseFloat(style.letterSpacing) || 0);
    extra += Math.max(0, (box.right - box.left) / scale - own);
  }
  return extra;
}

function decorationsFor(doc: ProseMirrorNode, spacings: readonly LineSpacing[]): DecorationSet {
  if (!spacings.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    spacings.map((spacing) =>
      Decoration.inline(
        spacing.from,
        spacing.to,
        {
          [LINE_SPACING_ATTR]: String(spacing.from),
          style: `letter-spacing:${spacing.letterSpacingPx}px`,
        },
        { distributedLine: true },
      ),
    ),
  );
}

/** The text blocks (in `tr.doc`) that a transaction's steps changed, a
 * format or attribute step (no position moved) included: a font size changed
 * on the last line changed its spacing. */
function changedTextblockRanges(tr: Transaction): Array<[number, number]> {
  return touchedTextblockRanges(tr);
}

const signature = (spacings: readonly LineSpacing[]) =>
  spacings.map((spacing) => `${spacing.from}-${spacing.to}:${spacing.letterSpacingPx}`).join("|");

export const DistributedLastLines = Extension.create({
  name: "distributedLastLines",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: distributedLastLinesKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, previous) => {
            const next = tr.getMeta(META) as LineSpacing[] | undefined;
            if (next) return decorationsFor(tr.doc, next);
            if (!tr.docChanged || previous === DecorationSet.empty) return previous;
            // Text changed: the spacing of every text block the change
            // touched goes, so the next frame measures that block's natural
            // line. Measured with its old spacing still drawn, typing on after
            // a spread "Hello" wrapped the words into four lines and the next
            // pass spread a letter of the wrapped tail by 69 px (live Word
            // audit WUA 121). Untouched blocks keep theirs where it maps.
            const mapped = previous.map(tr.mapping, tr.doc);
            const stale: Decoration[] = [];
            for (const [from, to] of changedTextblockRanges(tr)) {
              stale.push(...mapped.find(from, to));
            }
            return stale.length ? mapped.remove(stale) : mapped;
          },
        },
        props: {
          decorations: (state) => distributedLastLinesKey.getState(state),
        },
        view(view) {
          let frame: number | null = null;
          let waitTimer: number | null = null;
          let applied = "";
          // The document changed since the last measure: dispatch even an
          // unchanged or empty result, so spacing a paragraph no longer wants
          // (Distributed turned back to Left) does not linger.
          let stale = false;
          const win = view.dom.ownerDocument.defaultView;
          const run = () => {
            frame = null;
            const current = distributedLastLinesKey.getState(view.state);
            const drawn = Boolean(current && current !== DecorationSet.empty);
            if (!view.dom.isConnected && win && distributedBlocks(view.state.doc).length) {
              // A view made before its editor is in the page: look again
              // shortly rather than leave its lines unspread.
              if (waitTimer === null) waitTimer = win.setTimeout(() => { waitTimer = null; schedule(); }, 250);
              return;
            }
            if (!view.dom.isConnected || !distributedBlocks(view.state.doc).length) {
              stale = false;
              if (applied || drawn) {
                applied = "";
                view.dispatch(view.state.tr.setMeta(META, []).setMeta("addToHistory", false));
              }
              return;
            }
            const spacings = measureDistributedLines(view);
            const next = signature(spacings);
            const wasStale = stale;
            stale = false;
            if (!wasStale && next === applied && drawn) return;
            if (!next && !drawn) {
              applied = "";
              return;
            }
            applied = next;
            view.dispatch(view.state.tr.setMeta(META, spacings).setMeta("addToHistory", false));
          };
          const schedule = () => {
            if (frame !== null || !win) return;
            frame = win.requestAnimationFrame(run);
          };
          const observer = win && "ResizeObserver" in win ? new win.ResizeObserver(schedule) : null;
          observer?.observe(view.dom);
          // Read once for every caller of this task, a microtask later: a
          // read of `fonts.ready` lays the page out in Blink (font-face-news).
          const cancelFontsReady = afterFontsReady(view.dom.ownerDocument, schedule);
          schedule();
          return {
            update(updated, previousState) {
              if (updated.state.doc !== previousState.doc) {
                stale = true;
                schedule();
              } else if (
                distributedLastLinesKey.getState(updated.state) === DecorationSet.empty &&
                distributedLastLinesKey.getState(previousState) !== DecorationSet.empty
              ) {
                // The editor's state replaced with the same document starts
                // the plugin over: measure again rather than wait for a resize.
                applied = "";
                schedule();
              }
            },
            destroy() {
              cancelFontsReady();
              observer?.disconnect();
              if (waitTimer !== null) win?.clearTimeout(waitTimer);
              if (frame !== null) win?.cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});
