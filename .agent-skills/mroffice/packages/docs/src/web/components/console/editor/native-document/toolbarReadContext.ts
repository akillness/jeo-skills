/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";

import { PAGE_BLOCK_NODE, PAGE_REGION_RECEIPT } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";

/**
 * What the ribbon's state is read from, by identity: the selection's place
 * (every node from below its sheet down to its parent, the index in each,
 * the offset in the parent, and the top-level block's neighbours on its
 * sheet), the stored marks, the document's own attributes and whether the
 * editor takes input. A page move that changes none of these leaves every
 * button, box and gallery the ribbon shows as it was: the page ledger's
 * moves keep the blocks they move (only their sheets change) and its own
 * attributes are left out.
 *
 * Null when the selection spans more than one parent: what lies between
 * its ends is read too (mixed formatting), so it is read again.
 */
export interface ToolbarReadContext {
  readonly parts: readonly unknown[];
}

/** The document attributes the page ledger writes as it lays the pages out. */
const PAGINATION_DOC_ATTRS = new Set(["pageBlockSizes", "pageBlockLayoutKey", PAGE_REGION_RECEIPT]);

function placeOf($pos: ResolvedPos, parts: unknown[]): void {
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    const index = $pos.index(depth);
    if (node.type.name === PAGE_BLOCK_NODE) {
      // A sheet is a new node whenever a block moves on or off it; what
      // stands beside the selection's block is what a reading can see.
      parts.push(PAGE_BLOCK_NODE, index, node.maybeChild(index - 1) ?? null, node.maybeChild(index + 1) ?? null);
      continue;
    }
    parts.push(node, index);
  }
  parts.push($pos.depth, $pos.parentOffset);
}

export function toolbarReadContext(state: EditorState, editable: boolean): ToolbarReadContext | null {
  const { selection, doc } = state;
  if (!selection.$from.sameParent(selection.$to)) return null;
  const parts: unknown[] = [selection.constructor, editable, state.storedMarks];
  if (selection instanceof NodeSelection) parts.push(selection.node);
  placeOf(selection.$anchor, parts);
  placeOf(selection.$head, parts);
  const attrs = doc.attrs as Record<string, unknown>;
  for (const key of Object.keys(attrs).sort()) {
    if (PAGINATION_DOC_ATTRS.has(key)) continue;
    parts.push(key, attrs[key]);
  }
  return { parts };
}

export function sameToolbarReadContext(
  left: ToolbarReadContext | null,
  right: ToolbarReadContext | null,
): boolean {
  if (!left || !right || left.parts.length !== right.parts.length) return false;
  return left.parts.every((part, index) => part === right.parts[index]);
}
