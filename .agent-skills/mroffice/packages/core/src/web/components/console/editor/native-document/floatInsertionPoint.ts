/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where an insertion goes while a floating object (a picture, shape, chart,
 * text box or ink stroke on the page) is selected, or while the caret stands
 * in the gap between two of them.
 *
 * A float is drawn from a paragraph: in Word it is anchored in one, and in
 * MRAI it stands as a block right before the block it anchors to (ink lands
 * so, `documentFloatAnchorTarget`). Word never replaces the selected float
 * with what is inserted. What it allows goes in at the start of the anchor
 * paragraph's text and the float stays where it is, still drawn from that
 * paragraph (Word 16.86, a floating picture selected: Paste puts the text at
 * the start of the anchor paragraph, Insert Footnote puts the reference
 * there). What would split the paragraph or start a page there -- Page
 * Break, Blank Page, Section and Column Break, Table, Table of Contents,
 * Equation, Date and Time, Field, Symbol -- Word greys while the float is
 * selected (`FLOAT_SELECTION_INSERT_GATED`).
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Selection, type Transaction } from "@tiptap/pm/state";

import { inLineBlockObjectKind } from "../extensions/objectPlacement";

const FLOATING_BLOCK_TYPES = new Set(["image", "chart", "documentShape", "textBox"]);

/** A block that is a floating object on the page (not one in line with text). */
export function isFloatingBlockObject(node: ProseMirrorNode | null | undefined): boolean {
  if (!node || !node.isBlock || !FLOATING_BLOCK_TYPES.has(node.type.name)) return false;
  if (node.type.name === "textBox") return node.attrs?.wrapMode !== "inline";
  return inLineBlockObjectKind(node) === null;
}

/** Whether `selection` selects a floating object or stands between floats. */
export function isFloatOrGapSelection(selection: Selection): boolean {
  if (selection instanceof NodeSelection) return isFloatingBlockObject(selection.node);
  if (selection instanceof TextSelection) return false;
  if (!selection.empty) return false;
  const { $from } = selection;
  return isFloatingBlockObject($from.nodeBefore) || isFloatingBlockObject($from.nodeAfter);
}

/**
 * The document position an insertion takes for a float (or gap) selection:
 * inside the anchor paragraph, at the start of its text. The anchor is the
 * first block after the run of floats that is not itself a float, on this
 * page or a later one. Floats with nothing after them are drawn from the
 * paragraph before them: the end of that one. Null when the selection is
 * not such a selection or no paragraph holds it.
 */
export function floatSelectionInsertionPos(state: Pick<EditorState, "selection" | "doc">): number | null {
  const { selection, doc } = state;
  if (!isFloatOrGapSelection(selection)) return null;
  const after = selection instanceof NodeSelection ? selection.to : selection.from;
  let found: number | null = null;
  doc.nodesBetween(after, doc.content.size, (node, pos) => {
    if (found !== null) return false;
    if (pos < after) return true;
    if (isFloatingBlockObject(node)) return false;
    if (node.isTextblock) {
      found = pos + 1;
      return false;
    }
    // A container (a page sheet, a list, a quote) is searched inside; any
    // other block (a table, a break) is where the floats' paragraph is not.
    return node.type.name === "pageBlock" || (!node.isAtom && !node.isLeaf && node.type.name !== "table");
  });
  if (found !== null) return found;
  const before = selection.from;
  let previous: number | null = null;
  doc.nodesBetween(0, before, (node, pos) => {
    if (node.isTextblock && pos + node.nodeSize <= before) previous = pos + node.nodeSize - 1;
    return true;
  });
  return previous;
}

/** The caret an insertion uses for a float (or gap) selection, or null. */
export function floatSelectionInsertionSelection(state: Pick<EditorState, "selection" | "doc">): TextSelection | null {
  const pos = floatSelectionInsertionPos(state);
  return pos === null ? null : TextSelection.create(state.doc, pos);
}

/**
 * Insert-tab commands Word greys while a floating object is selected (Word
 * 16.86 ribbon and menus, a floating picture and a shape selected). Test ids;
 * an entry ending in "-" covers a menu's every item.
 */
export const FLOAT_SELECTION_INSERT_GATED: readonly string[] = [
  "document-toolbar-ribbon-page-break",
  "document-toolbar-page-break",
  "document-toolbar-ribbon-blank-page",
  "document-toolbar-divider",
  "document-toolbar-ribbon-break-page",
  "document-toolbar-ribbon-break-column",
  "document-toolbar-ribbon-break-section-",
  "document-toolbar-section-break",
  "document-toolbar-section-break-",
  "document-toolbar-insert-table",
  "document-toolbar-insert-table-size",
  "document-toolbar-insert-table-grid-menu",
  "document-toolbar-ribbon-references-toc",
  "document-toolbar-insert-equation",
  "document-toolbar-insert-equation-menu",
  "document-toolbar-insert-math-block",
  "document-toolbar-insert-inline-math",
  "document-toolbar-date-time",
  "document-toolbar-insert-field",
  "document-toolbar-insert-symbol",
  "document-toolbar-insert-number",
];

/**
 * Paste with a floating object selected, or between floats: Word puts what
 * is pasted at the start of the anchor paragraph and keeps the float (Word
 * 16.86, a floating picture selected, Cmd+V of "zzz": "zzzbbb", the picture
 * still anchored there). ProseMirror replaced the selected node.
 */
export const FloatSelectionPaste = Extension.create({
  name: "floatSelectionPaste",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("floatSelectionPaste"),
        props: {
          handlePaste(view) {
            const caret = floatSelectionInsertionSelection(view.state);
            if (caret) view.dispatch(view.state.tr.setSelection(caret));
            return false;
          },
        },
      }),
    ];
  },
});

/**
 * A page, column or section break asked for (a shortcut, a menu) while a
 * floating object is selected: Word greys the command and the key does
 * nothing, so false. In the gap between floats the break goes into the
 * anchor paragraph, which `tr`'s selection is moved to.
 */
export function prepareBreakAtFloatSelection(tr: Transaction): boolean {
  if (tr.selection instanceof NodeSelection && isFloatingBlockObject(tr.selection.node)) return false;
  const caret = floatSelectionInsertionSelection(tr);
  if (caret) tr.setSelection(caret);
  return true;
}
