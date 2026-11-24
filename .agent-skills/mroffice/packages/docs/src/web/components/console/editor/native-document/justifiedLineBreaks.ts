/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A justified line that ends in a manual line break (Shift+Enter, `w:br`)
 * is stretched to the margin in Word 16 for Mac, as every line but the
 * paragraph's last is (wp-fix-a/jbr.docx: "JBR1 short words before a
 * manual break here" spans 120-695px). CSS treats a line that a forced
 * break ends as a last line and leaves it unjustified.
 *
 * A zero-height, full-width filler drawn before the break moves the break
 * onto a line of its own: the text line is no longer a last line, so it is
 * justified, and the filler's line takes no height where the paragraph has
 * no strut of its own (Word's auto line boxes, `data-document-auto-
 * intermediates`; note-editor.css shows the filler only there). The break
 * itself (the `<br>`, or the line feed an imported `w:br` is) shares that
 * line and is marked so its own line height is dropped there too: left to
 * it, the line was a whole line tall and the tail stood a line too low
 * (jbr.docx: Word's tail 14.88pt under the stretched line, this 2 lines).
 * A break that follows another break starts an empty line Word draws at
 * the break's height; it stretches nothing and gets neither. The filler is
 * a widget after the caret position, so the caret, the selection, the
 * saved text and the paragraph's height are unchanged.
 *
 * Word's compatibility option "Don't expand character spaces on a line
 * ending with SHIFT-RETURN" (w:doNotExpandShiftReturn, carried in the doc's
 * `wordSettings`) turns this off: jbr-compat.docx keeps that line 120-405px.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { normalizeWordDocumentSettings } from "@mrnote/core/web/components/console/editor/native-document/wordDocumentSettings.ts";
import { touchedRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";
import { SPLIT_CONTINUES_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";

export const JUSTIFIED_BREAK_FILLER_CLASS = "mrnote-justified-break-filler";
/** The break the filler precedes: no line height on the filler's line. */
export const JUSTIFIED_BREAK_CLASS = "mrnote-justified-break";
export const justifiedLineBreaksKey = new PluginKey<DecorationSet>("justifiedLineBreaks");

function expandsShiftReturn(doc: ProseMirrorNode): boolean {
  return normalizeWordDocumentSettings((doc.attrs as Record<string, unknown>).wordSettings)?.doNotExpandShiftReturn !== true;
}

function justified(block: ProseMirrorNode, doc: ProseMirrorNode): boolean {
  const own = block.attrs.textAlign;
  if (own != null) return own === "justify";
  return (doc.attrs as Record<string, unknown>).defaultTextAlign === "justify";
}

function filler(): HTMLElement {
  const element = document.createElement("span");
  element.className = JUSTIFIED_BREAK_FILLER_CLASS;
  element.setAttribute("aria-hidden", "true");
  element.contentEditable = "false";
  return element;
}

function blockFillers(doc: ProseMirrorNode, node: ProseMirrorNode, pos: number, out: Decoration[]): void {
  if (!["paragraph", "heading"].includes(node.type.name) || !justified(node, doc)) return;
  const expands = expandsShiftReturn(doc);
  // The head of a paragraph the page cut ends on a line that is not the
  // paragraph's last: Word justifies it (corpus R283-D20: page 13's last
  // line, "...whether municipal institutions convert", stood ragged). A
  // head holding a line break keeps its break lines unstretched where the
  // document says so (doNotExpandShiftReturn).
  if (node.attrs[SPLIT_CONTINUES_ATTR] === true &&
      (expands || !node.textContent.includes("\n")) &&
      (expands || !node.content.content.some((child) => child.type.name === "hardBreak"))) {
    out.push(Decoration.node(pos, pos + node.nodeSize, { style: "text-align-last: justify" }, { justifiedSplitHead: true }));
  }
  if (!expands) return;
  const breaks: { at: number; node: boolean }[] = [];
  node.forEach((child, offset) => {
    if (child.type.name === "hardBreak") breaks.push({ at: offset, node: true });
    // An imported w:br is a line feed in the run's text.
    else if (child.isText) {
      const text = child.text ?? "";
      for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) {
        breaks.push({ at: offset + index, node: false });
      }
    }
  });
  breaks.forEach((entry, index) => {
    const { at } = entry;
    // A break that ends the paragraph is followed by the paragraph mark's own
    // line, so the line it ends is stretched too (Word 16 for Mac,
    // probe-jbr/jbr-end.docx: a justified paragraph ending in one w:br sets
    // its last text line 90-522pt, the same line with no break 90-467pt, and
    // an empty line under it; corpus R436-D09's "dirección a investigaciones
    // futuras."). One that starts a line (the paragraph's, or right after
    // another break) ends an empty line, which is not stretched and keeps the
    // break's own height.
    if (at === 0 || (index > 0 && breaks[index - 1]!.at === at - 1)) return;
    out.push(
      Decoration.widget(pos + 1 + at, filler, {
        side: 1,
        marks: [],
        ignoreSelection: true,
        key: "justified-break-filler",
        // Zero height on a line of its own: no line box grows
        // (documentAutoLineSafety).
        zeroLayoutFormattingMark: true,
      }),
    );
    out.push(
      entry.node
        ? Decoration.node(pos + 1 + at, pos + 2 + at, { class: JUSTIFIED_BREAK_CLASS })
        : Decoration.inline(pos + 1 + at, pos + 2 + at, { class: JUSTIFIED_BREAK_CLASS }),
    );
  });
}

export function justifiedLineBreakDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    blockFillers(doc, node, pos, decorations);
    return false;
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** The previous set mapped through `tr`, with the text blocks the
 * transaction touched decided again (typing stays O(changed blocks)). */
function updatedDecorations(
  previous: DecorationSet,
  tr: Transaction,
): DecorationSet {
  const doc = tr.doc;
  let set = previous.map(tr.mapping, doc);
  // Every range a step reached, an attribute step (an alignment set without
  // moving a position) included.
  const ranges = touchedRanges(tr);
  for (const [from, to] of ranges) {
    const start = Math.max(0, Math.min(from, doc.content.size));
    const end = Math.max(start, Math.min(to, doc.content.size));
    const added: Decoration[] = [];
    const removed: Decoration[] = [];
    doc.nodesBetween(start, end, (node, pos) => {
      if (!node.isTextblock) return true;
      removed.push(...set.find(pos, pos + node.nodeSize));
      blockFillers(doc, node, pos, added);
      return false;
    });
    if (removed.length) set = set.remove(removed);
    if (added.length) set = set.add(doc, added);
  }
  return set;
}

export const JustifiedLineBreaks = Extension.create({
  name: "justifiedLineBreaks",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: justifiedLineBreaksKey,
        state: {
          init: (_config, state) => justifiedLineBreakDecorations(state.doc),
          apply: (tr, previous, oldState, newState) => {
            if (oldState.doc.attrs.defaultTextAlign !== newState.doc.attrs.defaultTextAlign ||
                oldState.doc.attrs.wordSettings !== newState.doc.attrs.wordSettings) {
              return justifiedLineBreakDecorations(newState.doc);
            }
            return tr.docChanged ? updatedDecorations(previous, tr) : previous;
          },
        },
        props: {
          decorations: (state) => justifiedLineBreaksKey.getState(state),
        },
      }),
    ];
  },
});
