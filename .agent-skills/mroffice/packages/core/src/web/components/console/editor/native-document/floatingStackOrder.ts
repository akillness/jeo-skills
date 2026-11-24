/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Bring Forward / Send Backward / Bring to Front / Send to Back on the
 * document's ONE floating stack, for every kind of member: a shape, a text box
 * frame, a picture, a floating chart (Word's `wp:anchor/@relativeHeight`
 * orders them against each other). Every ribbon, menu and pane that offers
 * the four commands plans them here, so a text box, a chart and a shape step
 * past their neighbours the same way:
 *
 * - one member per step, by Word's heights (`documentShapeZOrderPatches`),
 *   renumbering the stack when two neighbours leave no height between them
 *   (a move that only rewrote the selected member landed on the next
 *   neighbour's height and left the order to document order);
 * - only when the page shows the whole stack (`resolveDocumentShapeStack`):
 *   the save refuses to reorder a stack it cannot see whole
 *   (`z_order_stack_incomplete`), so the commands are greyed there instead.
 *
 * One transaction, one Undo step, the selection kept.
 */

import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";

import {
  documentShapeZOrderPatchesForSelection,
  documentStackPatchAttrs,
  resolveDocumentShapeStack,
  type DocumentShapeStackEntry,
  type DocumentShapeZOrderAction,
} from "../../../../lib/document-shapes";

type StackDocument = Parameters<typeof resolveDocumentShapeStack>[0];

/** The heights the command writes, or null when it has nothing to do. */
export function floatingStackZOrderPatches(
  doc: StackDocument,
  positions: readonly number[],
  action: DocumentShapeZOrderAction,
): readonly DocumentShapeStackEntry[] | null {
  return documentShapeZOrderPatchesForSelection(resolveDocumentShapeStack(doc), positions, action);
}

/** Whether the command is greyed: already at that edge, or not reorderable. */
export function floatingStackZOrderAtBoundary(
  doc: StackDocument,
  positions: readonly number[],
  action: DocumentShapeZOrderAction,
): boolean {
  return !floatingStackZOrderPatches(doc, positions, action)?.length;
}

/**
 * Run the command on the members at `positions`; `selectPos` is the member
 * selected afterwards (the one the user acted on).
 */
export function applyFloatingStackZOrder(
  editor: Editor,
  positions: readonly number[],
  action: DocumentShapeZOrderAction,
  selectPos: number | null = positions.length === 1 ? (positions[0] ?? null) : null,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const patches = floatingStackZOrderPatches(editor.state.doc, positions, action);
  if (!patches?.length) return false;
  let transaction = editor.state.tr;
  for (const patch of patches) {
    const node = transaction.doc.nodeAt(patch.pos);
    const attrs = node ? documentStackPatchAttrs(node, patch.relativeHeight) : null;
    if (!node || !attrs) return false;
    transaction = transaction.setNodeMarkup(patch.pos, undefined, attrs, node.marks);
  }
  transaction = closeHistory(transaction);
  if (selectPos !== null && transaction.doc.nodeAt(selectPos)) {
    transaction = transaction.setSelection(NodeSelection.create(transaction.doc, selectPos));
  }
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}
