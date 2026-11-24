/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Blank Page, as the pieces Insert > Blank Page (insertButtons) and
 * the Draw tab's writing page (documentInk) both build: a page break of its
 * own and a paragraph copying a neighbour's formatting, never its identity.
 */
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

/** What says WHICH paragraph a paragraph is: it stays with the original, never with a copy. */
const BLANK_PAGE_IDENTITY_ATTRS = [
  "block_id",
  "id",
  "source",
  "anchor_id",
  "toc_anchor_id",
  "commentThreadIds",
  "trackParagraphMark",
  "trackParagraphFormatting",
  // The copy is not where a page begins: the breaks around it are.
  "pageBreakBefore",
] as const;

/** A paragraph of `node`'s kind and formatting (its style), none of its identity. */
export function blankPageCopyAttrs(node: ProseMirrorNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = { ...node.attrs };
  for (const name of BLANK_PAGE_IDENTITY_ATTRS) {
    if (!(name in attrs)) continue;
    attrs[name] = node.type.spec.attrs?.[name]?.default ?? null;
  }
  return attrs;
}

export interface BlankPageBlock {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/** The body's blocks in order, across the pages. */
export function blankPageBodyBlocks(doc: ProseMirrorNode): BlankPageBlock[] {
  const blocks: BlankPageBlock[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name === "pageBlock") return true;
    if (parent && (parent.type.name === "doc" || parent.type.name === "pageBlock")) blocks.push({ pos, node });
    return false;
  });
  return blocks;
}

/**
 * Blank Page at the end of the document, as Word builds it there: a break
 * and an empty paragraph after the last block, the paragraph formatted like
 * the last body paragraph. The selection is left where it is. False when
 * the document's end takes no break (an empty schema, a closed container).
 */
export function appendBlankPageAtDocumentEnd(tr: Transaction): boolean {
  const schema = tr.doc.type.schema;
  const pageBreakType = schema.nodes.pageBreak;
  const paragraphType = schema.nodes.paragraph;
  if (!pageBreakType || !paragraphType) return false;
  const blocks = blankPageBodyBlocks(tr.doc);
  const last = blocks[blocks.length - 1];
  if (!last) return false;
  let source: ProseMirrorNode | null = null;
  for (let index = blocks.length - 1; index >= 0 && !source; index -= 1) {
    if (blocks[index]!.node.type === paragraphType) source = blocks[index]!.node;
  }
  const pieces = Fragment.from([
    pageBreakType.create(),
    paragraphType.create(source ? blankPageCopyAttrs(source) : null),
  ]);
  const at = last.pos + last.node.nodeSize;
  const $at = tr.doc.resolve(at);
  if (!$at.parent.canReplace($at.index(), $at.index(), pieces)) return false;
  tr.insert(at, pieces);
  return true;
}
