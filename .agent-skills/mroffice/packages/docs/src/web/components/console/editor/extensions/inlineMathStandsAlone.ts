/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";



















const MARKERS = new Set(["bookmarkPoint", "sourcePageBreak"]);
/** Stated on a paragraph whose equation stands alone (the plugin's node decoration). */
export const INLINE_MATH_ALONE_ATTR = "data-math-alone";
const LIST_ITEMS = new Set(["listItem", "taskItem"]);

/** Whether the textblock `parent`, the node at depth `depth` of `$pos`, holds
 * one inline equation and nothing else that is content, outside a list. */
export function textblockHoldsLoneEquation(parent: ProseMirrorNode, $pos: ResolvedPos, depth: number): boolean {
  if (parent.type.name !== "paragraph" && parent.type.name !== "heading") return false;
  let equations = 0;
  for (let i = 0; i < parent.childCount; i += 1) {
    const child = parent.child(i);
    if (child.type.name === "inlineMath") equations += 1;
    else if (!MARKERS.has(child.type.name)) return false;
  }
  if (equations !== 1 || parent.attrs.listKind) return false;
  return !(depth > 0 && LIST_ITEMS.has($pos.node(depth - 1).type.name));
}

/** Whether the inline equation at `pos` is all its paragraph holds. */
export function inlineMathStandsAlone(doc: ProseMirrorNode, pos: number): boolean {
  try {
    const $pos = doc.resolve(pos);
    return textblockHoldsLoneEquation($pos.parent, $pos, $pos.depth);
  } catch {
    return false;
  }
}

/**
 * Whether a display equation among its paragraph's words (Word's `m:oMathPara`
 * in a `w:p` with text) has a line of its own: nothing else between it and the
 * paragraph's edge or a line break, on both sides. Only then does Word set it
 * as a display line; with a word or a tab on its line -- before it, after it,
 * with a break on the other side or not -- Word sets it among the words, in
 * inline style, and ignores its justification (truth machine, DQ-L 23rd:
 * mathjc-among A1-A8, mathjc-cells P1 / T2). The page drew every such equation
 * as a line of its own, the sentence it opens pushed under it.
 *
 * The other display equations beside it are the lines of its zone (the several
 * `m:oMath` of one `m:oMathPara`), white space between them and the page's
 * markers nothing. A line break is the page's `hardBreak`, or the newline a
 * body paragraph's text holds for it.
 */
export function displayEquationHasItsLine(parent: ProseMirrorNode, index: number): boolean {
  const equation = parent.child(index).type;
  const clear = (step: -1 | 1): boolean => {
    for (let i = index + step; i >= 0 && i < parent.childCount; i += step) {
      const child = parent.child(i);
      if (child.type.name === "hardBreak") return true;
      if (child.type === equation && child.attrs.mathDisplay === true) continue;
      if (MARKERS.has(child.type.name)) continue;
      if (!child.isText) return false;
      const text = child.text ?? "";
      if (step < 0 ? text.endsWith("\n") : text.startsWith("\n")) return true;
      if (text.trim()) return false;
    }
    return true;
  };
  return clear(-1) && clear(1);
}

const KEY = new PluginKey<DecorationSet>("inlineMathStandsAlone");

function decorationsIn(doc: ProseMirrorNode, from: number, to: number): Decoration[] {
  const out: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const first = node.firstChild;
    // A display equation among words that has its line (displayEquationHasItsLine):
    // the same trigger, for the words that come onto its line or leave it.
    if (node.childCount > 1) {
      let words: boolean | null = null;
      node.forEach((child, offset, index) => {
        if (child.type.name !== "inlineMath" || child.attrs.mathDisplay !== true) return;
        words ??= node.textContent.trim().length > 0;
        if (!words || !displayEquationHasItsLine(node, index)) return;
        const at = pos + 1 + offset;
        out.push(Decoration.node(at, at + child.nodeSize, {}, { inlineMathHasItsLine: true }));
      });
    }
    // Most paragraphs open with words: no resolving them.
    if (!first || (first.type.name !== "inlineMath" && !MARKERS.has(first.type.name))) return false;
    const $inside = doc.resolve(pos + 1);
    if (textblockHoldsLoneEquation(node, $inside, $inside.depth)) {
      // The paragraph's mark stands beside the equation, as Word's does: no
      // line of its own after it (CSS [data-math-alone]).
      out.push(Decoration.node(pos, pos + node.nodeSize, { [INLINE_MATH_ALONE_ATTR]: "true" }));
      node.forEach((child, offset) => {
        if (child.type.name === "inlineMath") {
          const at = pos + 1 + offset;
          out.push(Decoration.node(at, at + child.nodeSize, {}, { inlineMathStandsAlone: true }));
        }
      });
    }
    return false;
  });
  return out;
}

function changedRanges(tr: Transaction): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
    });
  });
  return ranges;
}

/** A node decoration on each inline equation that stands alone, and on each
 * display equation that has its line among its paragraph's words. It draws
 * nothing: a change of it is what has ProseMirror hand the equation's view an
 * update (the equation's node is unchanged when only the words beside it come
 * or go), so the view sets itself as a display or an inline equation again. */
export function inlineMathStandsAlonePlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: KEY,
    state: {
      init: (_config, state: EditorState) =>
        DecorationSet.create(state.doc, decorationsIn(state.doc, 0, state.doc.content.size)),
      apply(tr, old) {
        if (!tr.docChanged) return old;
        let set = old.map(tr.mapping, tr.doc);
        for (const [from, to] of changedRanges(tr)) {
          const $from = tr.doc.resolve(Math.max(0, Math.min(from, tr.doc.content.size)));
          const $to = tr.doc.resolve(Math.max(0, Math.min(to, tr.doc.content.size)));
          // The textblocks the change touched, whole.
          const start = $from.depth > 0 ? $from.before(Math.max(1, $from.depth)) : $from.pos;
          const end = $to.depth > 0 ? $to.after(Math.max(1, $to.depth)) : $to.pos;
          set = set.remove(set.find(start, end));
          set = set.add(tr.doc, decorationsIn(tr.doc, start, end));
        }
        return set;
      },
    },
    props: {
      decorations: (state) => KEY.getState(state),
    },
  });
}
