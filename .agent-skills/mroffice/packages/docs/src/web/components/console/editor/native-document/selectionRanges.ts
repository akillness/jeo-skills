/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";







export function nodesBetweenSelectionRanges(
  doc: ProseMirrorNode,
  selection: Selection,
  visit: (node: ProseMirrorNode, pos: number, parent: ProseMirrorNode | null) => boolean | void,
): void {
  for (const range of selection.ranges) {
    doc.nodesBetween(range.$from.pos, range.$to.pos, visit);
  }
}
