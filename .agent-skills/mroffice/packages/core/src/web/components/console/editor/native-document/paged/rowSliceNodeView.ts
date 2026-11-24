/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The React node view of a row-sliced atom (atomRowSlices) draws its new
 * rows before the page ledger reads them.
 *
 * The ledger cuts a list by changing the row range of the node that is
 * already there and reads the result in the same frame (its next pass runs
 * before anything paints). A React node view re-renders after the task that
 * changed its props: the pass would have read the copy still drawing every
 * row, taken it for a block running over its page, and planned from that.
 * A new copy is rendered synchronously by the renderer itself; a changed
 * range is flushed here the same way.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { flushSync } from "react-dom";

import { rowSliceRange } from "./atomRowSlices";

interface RowSlicedNodeViewUpdate {
  oldNode: PmNode;
  newNode: PmNode;
  updateProps: () => void;
}

/** The `update` option of a row-sliced atom's React node view. */
export function updateRowSlicedNodeView({ oldNode, newNode, updateProps }: RowSlicedNodeViewUpdate): boolean {
  // Decorations alone (the selection frame) are applied to the wrapper by
  // ProseMirror; the component draws nothing from them.
  if (oldNode === newNode) return true;
  const before = rowSliceRange(oldNode.attrs);
  const after = rowSliceRange(newNode.attrs);
  if (before.start === after.start && before.end === after.end) {
    updateProps();
    return true;
  }
  try {
    flushSync(updateProps);
  } catch {
    // Inside a React commit nothing can be flushed: the range is drawn with
    // that commit's own follow-up render.
    updateProps();
  }
  return true;
}
