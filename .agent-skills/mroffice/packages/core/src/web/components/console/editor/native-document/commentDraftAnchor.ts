/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import { documentWordRangeAt } from "../../../../lib/document-word-at";










export type CommentDraftAnchor = Readonly<{ from: number; to: number; text: string }>;

/** One character per inline leaf, so offsets in the text are positions. */
const LEAF_TEXT = "￼";

function anchorText(doc: ProseMirrorNode, from: number, to: number): string {
  return doc.textBetween(from, to, "\n", LEAF_TEXT);
}

/** The anchor a comment started now would have, or null when there is no text. */
export function commentDraftAnchorAt(state: EditorState): CommentDraftAnchor | null {
  const { selection, doc } = state;
  const range =
    selection.to > selection.from
      ? { from: selection.from, to: selection.to }
      : documentWordRangeAt(selection.$from);
  if (!range || range.to <= range.from) return null;
  return { from: range.from, to: range.to, text: anchorText(doc, range.from, range.to) };
}

/** The textblock occurrence of `text` nearest to `near`, or null. */
function relocate(doc: ProseMirrorNode, text: string, near: number): CommentDraftAnchor | null {
  if (!text || text.includes("\n")) return null;
  let best: CommentDraftAnchor | null = null;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const content = node.textBetween(0, node.content.size, undefined, LEAF_TEXT);
    for (let index = content.indexOf(text); index >= 0; index = content.indexOf(text, index + 1)) {
      const from = pos + 1 + index;
      if (!best || Math.abs(from - near) < Math.abs(best.from - near)) {
        best = { from, to: from + text.length, text };
      }
    }
    return false;
  });
  return best;
}

/**
 * The anchor after `transaction`, or null when its text is gone.
 *
 * A local edit maps the range through the steps (typing inside it keeps the
 * comment on the edited text, as Word's anchor grows with it). A
 * collaborator's update arrives as one replacement of the whole document,
 * which no mapping survives: the anchored text is found again near where it
 * was instead.
 */
export function mapCommentDraftAnchor(
  anchor: CommentDraftAnchor,
  transaction: Transaction,
  remote: boolean,
): CommentDraftAnchor | null {
  if (!transaction.docChanged) return anchor;
  const doc = transaction.doc;
  const from = transaction.mapping.map(anchor.from, 1);
  const to = transaction.mapping.map(anchor.to, -1);
  if (remote) {
    if (to > from && to <= doc.content.size && anchorText(doc, from, to) === anchor.text) {
      return { from, to, text: anchor.text };
    }
    return relocate(doc, anchor.text, from);
  }
  if (to <= from) return null;
  return { from, to, text: anchorText(doc, from, to) };
}

/** Whether `anchor` still names the text it holds in `doc`. */
export function commentDraftAnchorIntact(doc: ProseMirrorNode, anchor: CommentDraftAnchor): boolean {
  return (
    anchor.from < anchor.to &&
    anchor.to <= doc.content.size &&
    anchorText(doc, anchor.from, anchor.to) === anchor.text
  );
}
