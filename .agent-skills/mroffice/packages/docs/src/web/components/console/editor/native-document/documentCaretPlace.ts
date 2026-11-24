/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where the caret is in a document, said so that another view of the same
 * document finds it again: a long document read again as parts opens on its
 * first part, laid out anew (NoteEditor's handover), so a position means
 * nothing there. The place is the block the caret's words belong to (its
 * identity: a block cut across sheets is one block in pieces) and the
 * caret's offset in that block's words, with the top-level block holding it
 * (a part is made of top-level blocks: the parts through it are loaded).
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import { splitPieceRoot } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";

export interface DocumentCaretPlace {
  /** The outermost block with an identity around the caret. */
  readonly topBlockId: string;
  /** The block whose words hold the caret (its first piece's identity), or
   * the top-level block when the words' own block has none. */
  readonly blockId: string;
  /** In `blockId`'s words when `inWords`, else from the top-level block's start. */
  readonly offset: number;
  readonly inWords: boolean;
}

function idOf(node: ProseMirrorNode): string | null {
  const id = node.attrs?.block_id;
  return typeof id === "string" && id ? id : null;
}

/** Every piece of the textblock `root` in document order, until its last one. */
function textPieces(doc: ProseMirrorNode, root: string): Array<{ pos: number; node: ProseMirrorNode }> {
  const pieces: Array<{ pos: number; node: ProseMirrorNode }> = [];
  let done = false;
  doc.descendants((node, pos) => {
    if (done) return false;
    if (!node.isTextblock) return true;
    if (splitPieceRoot(node.attrs) === root) {
      pieces.push({ pos, node });
      if (!node.attrs?.pageSplitContinues) done = true;
    }
    return false;
  });
  return pieces;
}

/** The identity of the block whose piece is `node` at `pos`: its own, a later
 * piece's `pageSplitPieceOf`, or for a list cut across sheets (its later piece
 * a block of its own saying it goes on from the one before) the first piece's. */
function headPieceId(doc: ProseMirrorNode, pos: number, node: ProseMirrorNode): string {
  const own = splitPieceRoot(node.attrs) ?? idOf(node)!;
  if (node.attrs?.pageSplitContinuation !== true || node.attrs?.pageSplitPieceOf) return own;
  const blocks: Array<{ pos: number; node: ProseMirrorNode }> = [];
  doc.forEach((child, offset) => {
    if (child.type.name === "pageBlock") child.forEach((block, inner) => blocks.push({ pos: offset + 1 + inner, node: block }));
    else blocks.push({ pos: offset, node: child });
  });
  let index = blocks.findIndex((block) => block.pos === pos);
  while (index > 0 && blocks[index].node.attrs?.pageSplitContinuation === true &&
    blocks[index - 1].node.type === blocks[index].node.type) index -= 1;
  return index >= 0 ? splitPieceRoot(blocks[index].node.attrs) ?? own : own;
}

/** The top-level block the caret is in (its first piece's identity), or null:
 * cheap, for asking again and again whether the caret is still there. */
export function documentCaretTopBlock(state: EditorState): string | null {
  try {
    const head = state.selection.$head;
    for (let depth = 1; depth <= head.depth; depth += 1) {
      if (idOf(head.node(depth))) return headPieceId(state.doc, head.before(depth), head.node(depth));
    }
  } catch { /* a selection being mapped: no place */ }
  return null;
}

/** The caret's place in `state`, or null when nothing around it has an identity. */
export function documentCaretPlace(state: EditorState): DocumentCaretPlace | null {
  try {
    const head = state.selection.$head;
    let topDepth = -1;
    for (let depth = 1; depth <= head.depth; depth += 1) {
      if (idOf(head.node(depth))) { topDepth = depth; break; }
    }
    if (topDepth < 0) return null;
    const topBlockId = headPieceId(state.doc, head.before(topDepth), head.node(topDepth));
    const parent = head.parent;
    const root = parent.isTextblock ? splitPieceRoot(parent.attrs) : null;
    if (!root) return { topBlockId, blockId: topBlockId, offset: head.pos - head.start(topDepth), inWords: false };
    let before = 0;
    const own = head.before();
    for (const piece of textPieces(state.doc, root)) {
      if (piece.pos >= own) break;
      before += piece.node.content.size;
    }
    return { topBlockId, blockId: root, offset: before + head.parentOffset, inWords: true };
  } catch {
    return null;
  }
}








export function documentHandoverPlace(state: EditorState | null, holdsPage: boolean): DocumentCaretPlace | null {
  return state && holdsPage ? documentCaretPlace(state) : null;
}

/** Where `place` is in `doc` (however it is laid out there), or null when its
 * block is not in it. */
export function documentCaretPosition(doc: ProseMirrorNode, place: DocumentCaretPlace): number | null {
  if (place.inWords) {
    const pieces = textPieces(doc, place.blockId);
    let left = place.offset;
    for (const [index, piece] of pieces.entries()) {
      const size = piece.node.content.size;
      if (left <= size || index === pieces.length - 1) return piece.pos + 1 + Math.min(left, size);
      left -= size;
    }
  }
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (idOf(node) === place.topBlockId) {
      found = Math.min(pos + 1 + (place.inWords ? 0 : place.offset), pos + node.nodeSize - 1);
      return false;
    }
    return true;
  });
  return found;
}

/** `value` as a place (one kept in storage and read back), or null. */
export function documentCaretPlaceFrom(value: unknown): DocumentCaretPlace | null {
  if (!value || typeof value !== "object") return null;
  const { topBlockId, blockId, offset, inWords } = value as Record<string, unknown>;
  if (typeof topBlockId !== "string" || !topBlockId || typeof blockId !== "string" || !blockId ||
      typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0 || typeof inWords !== "boolean") return null;
  return { topBlockId, blockId, offset, inWords };
}
