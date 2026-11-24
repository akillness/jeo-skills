/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * A caret right after a field, a cross-reference or another inline atom is
 * drawn, as Word draws it there.
 *
 * ProseMirror puts the DOM caret for a position after an atom at the end of
 * the element the atom sits in (the span of a mark the atom carries:
 * `(span, 1)` after `<span contenteditable=false>3</span>`). Chromium and
 * WebKit draw no caret there: the range has no box, so the insertion line
 * vanished after a header's page number while typing still landed there.
 * The same position seen from the right, the start of the text after the
 * atom or the line's end before its trailing break, is one they draw. The
 * DOM caret moves there; the document selection is the same position, so
 * ProseMirror reads it back unchanged.
 */
export function settleCaretAfterInlineAtom(view: EditorView): boolean {
  if (view.isDestroyed || view.composing || !view.hasFocus()) return false;
  const { selection } = view.state;
  if (!selection.empty) return false;
  const before = selection.$head.nodeBefore;
  if (!before || before.isText || !before.isInline) return false;
  const dom = (view.root as Document).getSelection?.();
  if (!dom || dom.rangeCount !== 1 || !dom.isCollapsed) return false;
  const node = dom.anchorNode;
  const offset = dom.anchorOffset;
  if (!node || node.nodeType !== 1) return false;
  const previous = node.childNodes[offset - 1];
  if (!(previous instanceof HTMLElement) || previous.isContentEditable) return false;
  let target: { node: Node; offset: number };
  try {
    target = view.domAtPos(selection.head, 1);
  } catch {
    return false;
  }
  if (target.node === node && target.offset === offset) return false;
  // Only a place a caret is drawn: not right after another non-editable
  // element (two atoms side by side).
  if (target.node.nodeType !== 3) {
    const after = target.node.childNodes[target.offset - 1];
    if (after instanceof HTMLElement && !after.isContentEditable) return false;
  }
  if (!view.dom.contains(target.node)) return false;
  dom.collapse(target.node, target.offset);
  return true;
}

const inlineAtomCaretKey = new PluginKey("inlineAtomCaret");

/** A line break: the node, or a soft break kept as "\n" text. */
function endsLine(node: ProseMirrorNode | null): boolean {
  if (!node) return false;
  if (node.type.name === "hardBreak") return true;
  return node.isText && (node.text ?? "").endsWith("\n");
}

/**
 * A caret place BEFORE an inline atom that a line break starts a line with.
 *
 * Between a `<br>` (or a soft break kept as "\n" text) and an element that
 * is not editable (an equation, a field, a footnote mark, a picture in line)
 * Chromium and WebKit have no caret place on the new line: they move a caret
 * put there to the end of the line above, so the letters typed before the
 * atom (Home on that line, Left out of the equation) went BEFORE the break,
 * onto the line above -- an input method's text as much as a key's. An
 * empty inline image after the break gives them one, as ProseMirror's own
 * `ProseMirror-separator` does after an atom that ends a paragraph: the caret
 * stands before it on the atom's line and what is typed there goes in before
 * the atom. A widget is no content: the DOM reader ignores it, so the text is
 * unchanged.
 */
export function inlineAtomLineStartPositions(doc: ProseMirrorNode, from = 0, to = doc.content.size): number[] {
  const positions: number[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    let previous: ProseMirrorNode | null = null;
    node.forEach((child, offset) => {
      if (
        endsLine(previous) &&
        child.isInline &&
        !child.isText &&
        child.isAtom &&
        child.type.name !== "hardBreak" &&
        !standsOnItsOwnLine(child)
      ) {
        positions.push(pos + 1 + offset);
      }
      previous = child;
    });
    return false;
  });
  return positions;
}

/**
 * A display equation among a paragraph's words (Word's m:oMathPara after a
 * w:br): a line of its own already, drawn as a block. A separator after the
 * break stood alone on a line before it, a blank line Word does not have (the
 * break ends the words' line and the equation takes the next): the book's
 * "其本征向量只需要结合式子给出：⏎[T]v = λv" a pitch taller, each one of
 * them. Its caret place is the end of the line above, as Word's.
 */
function standsOnItsOwnLine(node: ProseMirrorNode): boolean {
  return node.type.name === "inlineMath" && node.attrs.mathDisplay === true;
}

function lineStartSeparator(): HTMLElement {
  const separator = document.createElement("img");
  separator.className = "ProseMirror-separator";
  separator.alt = "";
  separator.setAttribute("data-inline-atom-line-start", "");
  return separator;
}

function lineStartDecorations(doc: ProseMirrorNode, from?: number, to?: number): Decoration[] {
  return inlineAtomLineStartPositions(doc, from, to).map((pos) =>
    // Side 1: the caret at the position is drawn before it, and what is
    // typed there goes in before it (before the atom).
    Decoration.widget(pos, lineStartSeparator, { side: 1, key: "inline-atom-line-start" }),
  );
}

/** The textblocks a transaction changed, in the new document. */
function changedBlockRanges(tr: Transaction): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const { maps } = tr.mapping;
  maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const size = tr.doc.content.size;
      const a = Math.max(0, Math.min(size, rest.map(newStart, -1)));
      const b = Math.max(a, Math.min(size, rest.map(newEnd, 1)));
      const $a = tr.doc.resolve(a);
      const $b = tr.doc.resolve(b);
      ranges.push([
        $a.parent.isTextblock && $a.depth > 0 ? $a.before() : a,
        $b.parent.isTextblock && $b.depth > 0 ? $b.after() : b,
      ]);
    });
  });
  return ranges;
}

const inlineAtomLineStartKey = new PluginKey<DecorationSet>("inlineAtomLineStart");

export const inlineAtomLineStartPlugin = () =>
  new Plugin<DecorationSet>({
    key: inlineAtomLineStartKey,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, lineStartDecorations(state.doc)),
      apply(tr, set) {
        if (!tr.docChanged) return set;
        let next = set.map(tr.mapping, tr.doc);
        // While an input method composes, the separator keeps its place
        // (mapped after the composed text); the next edit redraws it.
        if (tr.getMeta("composition") !== undefined) return next;
        for (const [from, to] of changedBlockRanges(tr)) {
          next = next.remove(next.find(from, to)).add(tr.doc, lineStartDecorations(tr.doc, from, to));
        }
        return next;
      },
    },
    props: {
      decorations: (state) => inlineAtomLineStartKey.getState(state),
    },
  });

export const DocumentInlineAtomCaret = Extension.create({
  name: "documentInlineAtomCaret",
  addProseMirrorPlugins() {
    return [
      inlineAtomLineStartPlugin(),
      new Plugin({
        key: inlineAtomCaretKey,
        view(view) {
          let pressed = false;
          let queued = false;
          // Once per selection: should the view put the caret back (it
          // judged the place not the same), it is left there, no tug of war.
          let settled: unknown = null;
          const settle = () => {
            queued = false;
            if (pressed || settled === view.state.selection) return;
            if (settleCaretAfterInlineAtom(view)) settled = view.state.selection;
          };
          const schedule = () => {
            if (queued) return;
            queued = true;
            queueMicrotask(settle);
          };
          // A press places the caret where the reader clicked, often in the
          // same element (no transaction when it is the same position).
          const onDown = () => { pressed = true; };
          const onUp = () => { pressed = false; schedule(); };
          const onSelection = () => {
            if (document.activeElement && view.dom.contains(document.activeElement)) schedule();
          };
          view.dom.addEventListener("pointerdown", onDown);
          view.dom.ownerDocument.addEventListener("pointerup", onUp, true);
          view.dom.ownerDocument.addEventListener("selectionchange", onSelection);
          return {
            update: schedule,
            destroy() {
              view.dom.removeEventListener("pointerdown", onDown);
              view.dom.ownerDocument.removeEventListener("pointerup", onUp, true);
              view.dom.ownerDocument.removeEventListener("selectionchange", onSelection);
            },
          };
        },
      }),
    ];
  },
});
