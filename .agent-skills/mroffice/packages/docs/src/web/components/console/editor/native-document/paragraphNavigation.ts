/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's paragraph keys: Cmd+Up / Cmd+Down on the Mac (Ctrl+Up / Ctrl+Down
 * elsewhere) move by one paragraph, and with Shift they select to the start
 * or end of the paragraph.
 *
 * Microsoft Support, "Keyboard shortcuts in Word":
 * - Cmd+Up: "Move the cursor up by one paragraph" (to the start of the
 *   paragraph the cursor is in, from its start to the previous one's);
 * - Cmd+Down: "Move the cursor down by one paragraph" (the next one's start);
 * - Cmd+Shift+Up: "Select from the current position to the beginning of the
 *   current paragraph", and again to the previous paragraph's beginning;
 * - Cmd+Shift+Down: "... to the end of the current paragraph", and again to
 *   the next paragraph's end.
 * Document start/end stay Cmd+Home / Cmd+End (Cmd+Fn+Left/Right).
 *
 * Unbound, Cmd+Up/Down were the browser's text-field keys and jumped to the
 * top or bottom of the whole document.
 *
 * A paragraph is a textblock of the body in document order: in list items,
 * table cells (row by row, as Word walks a table) and content controls alike.
 * The part of a paragraph a page edge carried onto the next sheet
 * (`pageSplitContinuation`) is the same paragraph, never a stop of its own. A
 * display equation is a paragraph in Word, so moving stops on it (selected,
 * as a click makes it active); selecting runs through it. Objects' own text
 * (text boxes) is another story and is never entered.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";

import { isAnyImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

export type ParagraphDirection = "up" | "down";

interface ParagraphStop {
  /** First text position of the paragraph, or the position before an equation. */
  start: number;
  /** Last text position of the paragraph (its last fragment's end). */
  end: number;
  node: boolean;
}

const EQUATION_BLOCK = "mathBlock";

function paragraphStops(doc: ProseMirrorNode): ParagraphStop[] {
  const stops: ParagraphStop[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      const last = stops[stops.length - 1];
      if (!fragmentCarries("paragraphStart", node.attrs) && last && !last.node) {
        last.end = pos + node.nodeSize - 1;
      } else {
        stops.push({ start: pos + 1, end: pos + node.nodeSize - 1, node: false });
      }
      return false;
    }
    if (node.isAtom) {
      if (node.isBlock && node.type.name === EQUATION_BLOCK && NodeSelection.isSelectable(node)) {
        stops.push({ start: pos, end: pos, node: true });
      }
      return false;
    }
    return true;
  });
  return stops;
}

/** The selection Cmd(+Shift)+Up/Down leaves, or null when there is no body
 * text to move in. */
export function paragraphNavigationSelection(
  state: EditorState,
  direction: ParagraphDirection,
  extend: boolean,
): Selection | null {
  const { doc, selection } = state;
  const all = paragraphStops(doc);
  const stops = extend ? all.filter((stop) => !stop.node) : all;
  if (stops.length === 0) return null;
  const activeEquation = selection instanceof NodeSelection && !extend;
  if (direction === "down") {
    const from = activeEquation ? selection.from : selection.head;
    const target = extend
      ? stops.find((stop) => stop.end > from)
      : stops.find((stop) => stop.start > from);
    // Past the last paragraph: its end, where Word stops too.
    const last = target ?? stops[stops.length - 1];
    if (last.node) return NodeSelection.create(doc, last.start);
    const head = target ? (extend ? target.end : target.start) : last.end;
    return extend
      ? TextSelection.between(doc.resolve(selection.anchor), doc.resolve(head))
      : TextSelection.create(doc, head);
  }
  const from = activeEquation ? selection.from : selection.head;
  let target: ParagraphStop | undefined;
  for (const stop of stops) {
    if (stop.start < from) target = stop;
    else break;
  }
  target ??= stops[0];
  if (target.node) return NodeSelection.create(doc, target.start);
  return extend
    ? TextSelection.between(doc.resolve(selection.anchor), doc.resolve(target.start))
    : TextSelection.create(doc, target.start);
}

export const DocumentParagraphNavigation = Extension.create({
  name: "documentParagraphNavigation",

  addKeyboardShortcuts() {
    const run = (direction: ParagraphDirection, extend: boolean) => () => {
      const { view } = this.editor;
      // The candidate window owns the arrows while a composition is open.
      if (view.composing || isAnyImeCompositionActive()) return false;
      let next: Selection | null;
      try {
        next = paragraphNavigationSelection(view.state, direction, extend);
      } catch {
        return false;
      }
      if (!next) return false;
      // Handled even when the caret is already there: the browser's own
      // Cmd+Up/Down would jump to the document's first or last line.
      if (!next.eq(view.state.selection)) {
        view.dispatch(view.state.tr.setSelection(next).scrollIntoView());
      }
      return true;
    };
    return {
      "Mod-ArrowUp": run("up", false),
      "Mod-ArrowDown": run("down", false),
      "Mod-Shift-ArrowUp": run("up", true),
      "Mod-Shift-ArrowDown": run("down", true),
    };
  },
});
