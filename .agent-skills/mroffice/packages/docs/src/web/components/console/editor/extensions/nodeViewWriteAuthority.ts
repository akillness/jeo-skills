/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface CurrentNodeViewMutationTarget {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

export function currentNodeViewMutationTarget(
  editor: Pick<Editor, "isDestroyed" | "isEditable" | "state">,
  getPos: () => number | undefined,
  expectedNode: ProseMirrorNode,
  expectedType: string,
): CurrentNodeViewMutationTarget | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  try {
    const pos = getPos();
    if (typeof pos !== "number") return null;
    const node = editor.state.doc.nodeAt(pos);
    return node === expectedNode && node.type.name === expectedType
      ? { node, pos }
      : null;
  } catch {
    return null;
  }
}

export function updateCurrentNodeViewAttributes(
  editor: Pick<Editor, "isDestroyed" | "isEditable" | "state" | "view">,
  getPos: () => number | undefined,
  expectedNode: ProseMirrorNode,
  expectedType: string,
  patch: Readonly<Record<string, unknown>>,
): ProseMirrorNode | null {
  const target = currentNodeViewMutationTarget(
    editor,
    getPos,
    expectedNode,
    expectedType,
  );
  if (!target) return null;
  const transaction = editor.state.tr.setNodeMarkup(
    target.pos,
    undefined,
    { ...target.node.attrs, ...patch },
    target.node.marks,
  );
  if (!transaction.docChanged) return target.node;
  editor.view.dispatch(transaction);
  return editor.state.doc.nodeAt(target.pos);
}
