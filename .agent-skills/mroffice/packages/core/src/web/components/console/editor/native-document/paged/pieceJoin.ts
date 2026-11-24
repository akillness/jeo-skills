/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";

/** `tr.join(pos)`, keeping the words of two pieces of the same textblock type as they are. */
export function joinPieces(tr: Transaction, pos: number): Transaction {
  const $pos = tr.doc.resolve(pos);
  const before = $pos.nodeBefore;
  const after = $pos.nodeAfter;
  if (before && after && before.isTextblock && before.type === after.type &&
      before.canReplace(before.childCount, before.childCount, after.content)) {
    return tr.step(new ReplaceStep(pos - 1, pos + 1, Slice.empty, true));
  }
  return tr.join(pos);
}
