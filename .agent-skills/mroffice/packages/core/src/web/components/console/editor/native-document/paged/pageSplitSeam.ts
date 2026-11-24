/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { SPLIT_CONTINUATION_ATTR, SPLIT_CONTINUES_ATTR } from "./paginationProjectionKeys";

/**
 * The text a page-split seam stands for, or null when `endPos` .. `startPos`
 * is not one.
 *
 * Pagination cuts a paragraph that runs over the page edge into a head
 * (`pageSplitContinues`) and a tail (`pageSplitContinuation`) on the next
 * page -- one block in Word and in every saved form
 * (`mergeSplitContinuationsJson`). A reader of the live document that walks
 * text between the two sees a block boundary that is not in the text: the
 * seam is nothing for a paragraph (its text was only partitioned) and the
 * newline the cut consumed for a code block. `endPos` is where a text run
 * ends at the end of the head, `startPos` where the next one starts at the
 * start of the tail; nothing but the page boundary may lie between them.
 */
export function pageSplitSeamText(
  doc: PmNode,
  endPos: number,
  startPos: number,
): string | null {
  if (startPos <= endPos || startPos > doc.content.size) return null;
  const $end = doc.resolve(endPos);
  const $start = doc.resolve(startPos);
  const head = $end.parent;
  const tail = $start.parent;
  if (!head.isTextblock || !tail.isTextblock || head.type !== tail.type) return null;
  if (endPos !== $end.end() || startPos !== $start.start()) return null;
  if (head.attrs?.[SPLIT_CONTINUES_ATTR] !== true) return null;
  if (tail.attrs?.[SPLIT_CONTINUATION_ATTR] !== true) return null;
  const after = $end.after();
  const before = $start.before();
  if (before < after) return null;
  let content = false;
  doc.nodesBetween(after, before, (node, pos) => {
    if (content) return false;
    if (pos >= after && pos + node.nodeSize <= before && (node.isTextblock || node.isLeaf)) {
      content = true;
    }
    return !content;
  });
  if (content) return null;
  return head.type.name === "codeBlock" ? "\n" : "";
}
