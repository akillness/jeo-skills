"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection, cellAround } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import { OfficeTableTouchGrips } from "@mrnote/core/web/components/office-ribbon/OfficeTableTouchGrips.tsx";
import { useTouchInputMode } from "@mrnote/core/web/lib/touch-gestures.ts";

/**
 * The Docs adapter of the shared table selection handles
 * (`OfficeTableTouchGrips`). Word for iPad: tap in a cell, then drag a
 * selection handle across the cell borders to select cells; a finger across
 * the table scrolls. A browser's own text selection cannot leave a cell here
 * (prosemirror-tables clamps a text selection that crosses cells to the first
 * one), so without these a finger had no way to a cell range at all.
 *
 * The handles stand on the caret's cell while the editor has focus, and on a
 * cell selection (`CellSelection`) however it was made; dragging one makes
 * the cell selection from the opposite corner to the cell under the finger,
 * as a mouse drag across the cells does.
 */

/** The position before the cell holding the caret, or null outside a table. */
function caretCellPos(state: EditorState): number | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $cell = cellAround(selection.$from);
  return $cell ? $cell.pos : null;
}

function cellPosFromDom(view: EditorView, cell: Element): number | null {
  try {
    const $cell = cellAround(view.state.doc.resolve(view.posAtDOM(cell, 0)));
    return $cell ? $cell.pos : null;
  } catch {
    return null;
  }
}

function selectedCellElements(view: EditorView): Element[] {
  const { selection } = view.state;
  const cells: Element[] = [];
  const push = (pos: number) => {
    const dom = view.nodeDOM(pos);
    if (dom instanceof Element) cells.push(dom);
  };
  if (selection instanceof CellSelection) {
    selection.forEachCell((_node, pos) => push(pos));
    return cells;
  }
  const pos = caretCellPos(view.state);
  if (pos !== null) push(pos);
  return cells;
}

function gripsWanted(editor: Editor): boolean {
  if (!editor.isEditable || editor.isDestroyed) return false;
  const { selection } = editor.state;
  if (selection instanceof CellSelection) return true;
  return caretCellPos(editor.state) !== null && editor.view.hasFocus();
}

export function DocumentTableTouchGrips({ editor }: { editor: Editor }) {
  // a mouse never pays for the subscription (one render per transaction)
  const touchMode = useTouchInputMode();
  const [wanted, setWanted] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!touchMode) return;
    const sync = () => {
      setWanted(gripsWanted(editor));
      setRevision((value) => value + 1);
    };
    sync();
    editor.on("transaction", sync);
    editor.on("focus", sync);
    editor.on("blur", sync);
    return () => {
      editor.off("transaction", sync);
      editor.off("focus", sync);
      editor.off("blur", sync);
    };
  }, [editor, touchMode]);

  return (
    <OfficeTableTouchGrips
      enabled={touchMode && wanted}
      cellSelector="td, th"
      testIdPrefix="document-table-touch-grip"
      layoutKey={revision}
      zIndex={20}
      selectedCells={() => (editor.isDestroyed ? [] : selectedCellElements(editor.view))}
      onRange={(fixed, moving) => {
        if (editor.isDestroyed) return;
        const { view } = editor;
        const anchor = cellPosFromDom(view, fixed);
        const head = cellPosFromDom(view, moving);
        if (anchor === null || head === null) return;
        const selection = CellSelection.create(view.state.doc, anchor, head);
        view.dispatch(view.state.tr.setSelection(selection));
      }}
    />
  );
}
