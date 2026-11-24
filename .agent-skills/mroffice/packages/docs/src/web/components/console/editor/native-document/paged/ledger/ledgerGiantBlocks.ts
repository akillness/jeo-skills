/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { isTextSplitCapableTypeName, isTextSplittableBlock } from "@mrnote/core/web/components/console/editor/native-document/paged/blockSplitting.ts";
import {
  PAGE_BLOCK_NODE,
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
  SPLIT_PIECE_OF_ATTR,
  splitPieceRoot,
} from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";

/** A block of more content than this is opened in pieces. */
export const GIANT_TEXT_BLOCK_SIZE = 200_000;


const GIANT_KEPT_BLOCK_SIZE = 100_000;
/** What a piece holds: the provisional sheet's 34 lines of 38 CJK characters
 * (provisionalPages), other characters counting half. */
const PIECE_UNITS = 34 * 38;
/** How far back a cut looks for the space that ends a word. */
const WORD_LOOKBACK = 64;

/** A character that belongs with the one before it. */
function continuesCharacter(code: number): boolean {
  return (code >= 0xdc00 && code <= 0xdfff) || // the second half of a surrogate pair
    (code >= 0x0300 && code <= 0x036f) || (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) || (code >= 0x3099 && code <= 0x309a) || (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0xfe20 && code <= 0xfe2f) || code === 0x200d;
}

/** Offsets inside `block`'s content where it may be cut into pieces of about a
 * page: between two characters of a text, never inside a character or (with a
 * space within reach) a word. Ascending. */
export function giantBlockCutOffsets(block: PmNode): number[] {
  const cuts: number[] = [];
  let units = 0;
  let lastCut = 0;
  block.forEach((child, childOffset) => {
    const text = child.text;
    if (typeof text !== "string") {
      units += child.nodeSize;
      return;
    }
    let lastSpace = -1;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      units += code > 0x2e7f ? 1 : 0.5;
      if (code === 0x20) lastSpace = index;
      if (units < PIECE_UNITS || index + 1 >= text.length) continue;
      let at = index + 1;
      if (lastSpace >= 0 && at - (lastSpace + 1) <= WORD_LOOKBACK && lastSpace + 1 > 0) at = lastSpace + 1;
      else while (at < text.length && continuesCharacter(text.charCodeAt(at))) at += 1;
      if (at >= text.length) continue;
      const offset = childOffset + at;
      if (offset <= lastCut) continue;
      cuts.push(offset);
      lastCut = offset;
      units = 0;
      lastSpace = -1;
    }
  });
  return cuts;
}











const PIECE_RECUT_SIZE = 20_000;
/** The paragraphs cut into pieces in this page's life (their block ids). */
const giantRoots = new Set<string>();

function isGiantTextBlock(block: PmNode): boolean {
  if (!block.isTextblock || !isTextSplitCapableTypeName(block.type.name)) return false;
  const size = block.content.size;
  if (size > PIECE_RECUT_SIZE && giantRoots.size > 0) {
    const root = splitPieceRoot(block.attrs);
    if (root !== null && giantRoots.has(root)) return true;
  }
  if (size <= GIANT_TEXT_BLOCK_SIZE) return false;
  return isTextSplittableBlock(block) || size > GIANT_KEPT_BLOCK_SIZE;
}

/** Per sheet node (a page move keeps every other sheet's). */
const sheetsWithGiant = new WeakMap<PmNode, boolean>();

function sheetHoldsGiant(sheet: PmNode): boolean {
  // Too small to hold one at all: a sheet of about a page, nearly always.
  if (sheet.content.size <= (giantRoots.size > 0 ? PIECE_RECUT_SIZE : GIANT_TEXT_BLOCK_SIZE)) return false;
  const known = sheetsWithGiant.get(sheet);
  if (known !== undefined) return known;
  let found = false;
  sheet.forEach((block) => { if (isGiantTextBlock(block)) found = true; });
  sheetsWithGiant.set(sheet, found);
  return found;
}

/** Whether a top-level block of a sheet has yet to be cut into pieces. */
export function docHoldsGiantTextBlock(doc: PmNode): boolean {
  for (let index = 0; index < doc.childCount; index += 1) {
    const sheet = doc.child(index);
    if (sheet.type.name === PAGE_BLOCK_NODE && sheetHoldsGiant(sheet)) return true;
  }
  return false;
}

/**
 * Cut every such block on `tr` into pieces, each opening a sheet of its own
 * (what stood after the block stays with its last piece). The caret and the
 * selection map through the cuts. True when anything was cut.
 */
export function splitGiantTextBlocks(tr: Transaction): boolean {
  const doc = tr.doc;
  const giants: Array<{ pos: number; block: PmNode; sheet: PmNode }> = [];
  doc.forEach((sheet, sheetPos) => {
    if (sheet.type.name !== PAGE_BLOCK_NODE || !sheetHoldsGiant(sheet)) return;
    sheet.forEach((block, offset) => {
      if (isGiantTextBlock(block)) giants.push({ pos: sheetPos + 1 + offset, block, sheet });
    });
  });
  let cutAny = false;
  // From the document's end, each block from its end: positions before a cut
  // stay what they were.
  for (let index = giants.length - 1; index >= 0; index -= 1) {
    const { pos, block, sheet } = giants[index];
    const cuts = giantBlockCutOffsets(block);
    if (cuts.length === 0) continue;
    const root = splitPieceRoot(block.attrs);
    if (root !== null) giantRoots.add(root);
    const tailAttrs = (continues: boolean) => ({
      ...block.attrs,
      ...(block.type.name === "heading" ? { anchor_id: null, toc_anchor_id: null } : {}),
      [SPLIT_CONTINUATION_ATTR]: true,
      [SPLIT_CONTINUES_ATTR]: continues,
      [SPLIT_PIECE_OF_ATTR]: root,
    });
    for (let cut = cuts.length - 1; cut >= 0; cut -= 1) {
      const continues = cut < cuts.length - 1 || block.attrs[SPLIT_CONTINUES_ATTR] === true;
      tr.split(pos + 1 + cuts[cut], 2, [
        { type: sheet.type, attrs: sheet.attrs },
        { type: block.type, attrs: tailAttrs(continues) },
      ]);
    }
    tr.setNodeMarkup(pos, undefined, { ...block.attrs, [SPLIT_CONTINUES_ATTR]: true });
    cutAny = true;
  }
  return cutAny;
}
