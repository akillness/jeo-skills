/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";

/**
 * Whether the transactions only replace inline content inside single text
 * blocks (typing, deleting, pasting plain text within a paragraph), none of
 * them a block `isHolder` says may hold what the caller back-fills: no
 * block is added, removed, split, joined or given new attributes.
 *
 * A document-wide back-fill (block ids, anchor ids) found nothing to do in
 * the document before such an edit finds nothing in the one after it: a
 * keystroke on a long book need not walk all of it again.
 */
export function editsStayInsideTextblocks(
  transactions: readonly Transaction[],
  isHolder: (block: ProseMirrorNode, $at: ResolvedPos) => boolean = () => false,
): boolean {
  for (const tr of transactions) {
    for (let index = 0; index < tr.steps.length; index += 1) {
      const step = tr.steps[index];
      if (!(step instanceof ReplaceStep)) return false;
      const { from, to, slice } = step as unknown as {
        from: number;
        to: number;
        slice: { openStart: number; openEnd: number; content: ProseMirrorNode["content"] };
      };
      if (slice.openStart !== 0 || slice.openEnd !== 0) return false;
      let inline = true;
      slice.content.forEach((child) => {
        if (!child.isInline) inline = false;
      });
      if (!inline) return false;
      const doc = tr.docs[index];
      const $from = doc.resolve(from), $to = doc.resolve(to);
      if ($from.parent !== $to.parent || !$from.parent.isTextblock || isHolder($from.parent, $from)) return false;
      // An inline node may hold blocks of its own (a footnote, a text box):
      // none may be removed, nor brought in.
      let blocks = false;
      const block = (node: ProseMirrorNode) => {
        if (node.isBlock) blocks = true;
        return !blocks;
      };
      $from.parent.nodesBetween($from.parentOffset, $to.parentOffset, block);
      if (!blocks) slice.content.descendants(block);
      if (blocks) return false;
    }
  }
  return true;
}

/** Every step of `tr` replaces text with text inside one text block that
 * holds text before and after it (no inline node in or out). */
export function plainTextEdits(tr: Transaction): boolean {
  if (!editsStayInsideTextblocks([tr])) return false;
  for (let index = 0; index < tr.steps.length; index += 1) {
    const step = tr.steps[index] as unknown as { from: number; to: number; slice: { content: ProseMirrorNode["content"] } };
    let text = true;
    step.slice.content.forEach((child) => { if (!child.isText) text = false; });
    const doc = tr.docs[index];
    doc.nodesBetween(step.from, step.to, (node) => {
      if (node.isInline && !node.isText) text = false;
      return text;
    });
    if (!text) return false;
    const $from = doc.resolve(step.from);
    const after = tr.docs[index + 1] ?? tr.doc;
    const parentAfter = after.resolve(Math.min(tr.steps[index].getMap().map(step.from), after.content.size)).parent;
    if ($from.parent.content.size === 0 || parentAfter.content.size === 0) return false;
  }
  return true;
}
