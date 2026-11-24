"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import {
  AllSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { imeReplayingAppendTransaction, imeSafeAppendTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";

/**
 * Select All (Cmd+A) covers the whole document, and Word keeps the view where
 * it is while it does: formatting the selection from the ribbon or the
 * keyboard never scrolls. The editor's commands scroll their selection into
 * view (every ribbon command focuses the editor first, and TipTap's focus
 * scrolls), and ProseMirror scrolls to the selection's head, which for a
 * whole-document selection is the end of the last page: the window jumped to
 * the bottom after almost any button. A selection over the whole document has
 * no place to reveal, so it is never scrolled to.
 *
 * Deleting it (Delete, Backspace, Cut) leaves Word's caret at the start of the
 * now empty document, with the view at the top. ProseMirror kept the
 * whole-document selection over the empty page instead (its head at the
 * page's end, so the view went to the bottom of the page, and no caret
 * showed). The caret is put at the start and the document scrolled to its
 * top: ProseMirror's own scroll would stop the caret at the scrollport's top
 * edge, under the sticky ribbon.
 */
export function isWholeDocumentSelection(state: EditorState): boolean {
  const { selection, doc } = state;
  if (selection instanceof AllSelection) return true;
  if (selection.empty) return false;
  return (
    selection.from <= Selection.atStart(doc).from &&
    selection.to >= Selection.atEnd(doc).to
  );
}

/** No text and no object anywhere: only empty text blocks (in their pages). */
export function documentHasNoContent(doc: PmNode): boolean {
  let content = false;
  doc.descendants((node) => {
    if (content) return false;
    if (node.isLeaf) content = true;
    return !content;
  });
  return !content;
}

/** The nearest ancestor that scrolls the document vertically. */
function documentScroller(dom: HTMLElement): HTMLElement | null {
  for (let element = dom.parentElement; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    if (/(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight) {
      return element;
    }
  }
  return null;
}

const documentWholeSelectionKey = new PluginKey("documentWholeSelection");

/**
 * Where the browser's selection is drawn for an editor selection whose end
 * is not in text. ProseMirror draws a selection at its own two positions, and
 * those of an AllSelection (Cmd+A, and the selection Undo gives back after
 * everything was deleted) are the document's two ends, outside every page:
 * the browser selected the paper sheets as elements (the editor root's
 * children 0..1). Safari then drew a caret at the paper's top-left corner,
 * outside the margins, highlighted no text, and the formatting bubble opened
 * over the page. An end between blocks or pages draws the same way.
 *
 * Such an end is drawn at the nearest text position inside the selection, a
 * caret at the nearest text position. Only the drawing moves: the selection
 * Delete, Cut, Copy, Paste, typing and dragging act on is unchanged, so a
 * whole-document selection still holds a table of contents or a picture
 * before the first text, as Word's does (painted by
 * `wholeSelectionObjectDecorations`). Null: drawn where it is.
 */
export function drawnSelectionPositions(
  selection: Selection,
): { anchor: number; head: number } | null {
  if (!(selection instanceof TextSelection || selection instanceof AllSelection)) return null;
  const { $anchor, $head } = selection;
  if ($anchor.parent.inlineContent && $head.parent.inlineContent) return null;
  if (selection.empty) {
    const near =
      Selection.findFrom($head, 1, true) ?? Selection.findFrom($head, -1, true);
    return near ? { anchor: near.head, head: near.head } : null;
  }
  const { $from, $to } = selection;
  const from = $from.parent.inlineContent
    ? $from.pos
    : Selection.findFrom($from, 1, true)?.head;
  const to = $to.parent.inlineContent ? $to.pos : Selection.findFrom($to, -1, true)?.head;
  if (from === undefined || to === undefined || from > to) return null;
  return selection.anchor <= selection.head
    ? { anchor: from, head: to }
    : { anchor: to, head: from };
}

/**
 * The objects of a selection the browser's drawn selection leaves out (a
 * table of contents before the first text, a picture after the last): they
 * are marked selected like the objects inside it (`data-in-selection`).
 */
export function wholeSelectionObjectDecorations(state: EditorState): DecorationSet | null {
  const { selection, doc } = state;
  if (selection.empty) return null;
  const drawn = drawnSelectionPositions(selection);
  if (!drawn) return null;
  const drawnFrom = Math.min(drawn.anchor, drawn.head);
  const drawnTo = Math.max(drawn.anchor, drawn.head);
  const decorations: Decoration[] = [];
  const mark = (from: number, to: number) => {
    if (from >= to) return;
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isBlock) return false;
      if (!node.isLeaf) return true;
      if (pos >= from && pos + node.nodeSize <= to) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, { "data-in-selection": "true" }),
        );
      }
      return false;
    });
  };
  mark(selection.from, drawnFrom);
  mark(drawnTo, selection.to);
  return decorations.length ? DecorationSet.create(doc, decorations) : null;
}

/**
 * A caret between blocks or pages (`setTextSelection(0)` in a document that
 * opens with a table of contents or a picture, a number that lands between
 * pages) has no text to type into: it is drawn at the nearest text position
 * (above), and Enter, Backspace and the ribbon would act at the position
 * between the blocks. The caret is put at that text position.
 */
function caretInText(state: EditorState): Selection | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (selection.$head.parent.inlineContent) return null;
  return (
    Selection.findFrom(selection.$head, 1, true) ??
    Selection.findFrom(selection.$head, -1, true)
  );
}

interface SelectionDrawing {
  setSelection(anchor: number, head: number, view: EditorView, force?: boolean): void;
  wholeSelectionDrawsInText?: true;
}

/**
 * ProseMirror draws the browser's selection through its document view's
 * `setSelection`, which a node view's `setSelection` can only steer inside
 * that node; the document itself has none. The view's document view (and
 * each one ProseMirror builds in its place) draws at
 * `drawnSelectionPositions` instead. ProseMirror records what it drew, so
 * the drawn selection is never read back over the editor's own.
 */
function drawSelectionsInText(view: EditorView): () => void {
  const host = view as unknown as { docView: SelectionDrawing | null };
  const steer = (desc: SelectionDrawing | null) => {
    if (!desc || desc.wholeSelectionDrawsInText) return desc;
    const draw = desc.setSelection;
    desc.setSelection = function (anchor, head, drawingView, force) {
      const { selection } = drawingView.state;
      const drawn =
        selection.anchor === anchor && selection.head === head
          ? drawnSelectionPositions(selection)
          : null;
      draw.call(this, drawn?.anchor ?? anchor, drawn?.head ?? head, drawingView, force);
    };
    desc.wholeSelectionDrawsInText = true;
    return desc;
  };
  let current = steer(host.docView);
  Object.defineProperty(host, "docView", {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (desc: SelectionDrawing | null) => {
      current = steer(desc);
    },
  });
  return () => {
    Object.defineProperty(host, "docView", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: current,
    });
  };
}

/** The caret at the start of a document with nothing in it. */
function isCaretInEmptyDocument(state: EditorState): boolean {
  const { selection, doc } = state;
  return (
    selection.empty &&
    selection.from === Selection.atStart(doc).from &&
    documentHasNoContent(doc)
  );
}

export const DocumentWholeSelection = Extension.create({
  name: "documentWholeSelection",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: documentWholeSelectionKey,
        appendTransaction: imeReplayingAppendTransaction((transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const { selection, doc } = newState;
          if (selection instanceof TextSelection && selection.empty) return null;
          if (!isWholeDocumentSelection(newState)) return null;
          if (!documentHasNoContent(doc)) return null;
          const start = Selection.atStart(doc);
          if (!(start instanceof TextSelection)) return null;
          return newState.tr.setSelection(start).scrollIntoView();
        }),
        props: {
          // Pasting over the whole document replaces it: the clipboard's
          // blocks land as they are, as they do when the document was
          // deleted first. Replacing the whole-document TextSelection
          // directly fitted the slice's open first block into the first
          
          handlePaste: (view, _event, slice) => {
            if (!view.editable || !isWholeDocumentSelection(view.state)) return false;
            const tr = view.state.tr.deleteSelection();
            tr.setSelection(Selection.atStart(tr.doc));
            tr.replaceSelection(slice).scrollIntoView();
            view.dispatch(tr);
            return true;
          },
          handleScrollToSelection: (view) => {
            if (isWholeDocumentSelection(view.state)) return true;
            if (!isCaretInEmptyDocument(view.state)) return false;
            const dom = view.dom as HTMLElement;
            const scroller = documentScroller(dom);
            if (!scroller) return false;
            // Only an editor that starts on the scrollport's first screen
            // (the document body, not a header or footer further down) is
            // revealed by showing the scrollport's top.
            const top =
              dom.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop;
            if (top > scroller.clientHeight) return false;
            scroller.scrollTop = 0;
            return true;
          },
        },
      }),
      // The browser's selection stays in the text (drawSelectionsInText).
      new Plugin({
        appendTransaction: imeSafeAppendTransaction((transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          const caret = caretInText(newState);
          return caret ? newState.tr.setSelection(caret) : null;
        }),
        view: (view) => ({ destroy: drawSelectionsInText(view) }),
        props: {
          decorations: (state) => wholeSelectionObjectDecorations(state),
        },
      }),
    ];
  },
});

export default DocumentWholeSelection;
