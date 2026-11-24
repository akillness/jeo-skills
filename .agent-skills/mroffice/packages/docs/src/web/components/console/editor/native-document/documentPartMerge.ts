/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A later part of a long document, merged with the server's after a save
 * conflict (lib/document-page-parts `mergePartIntoView`): the editor's
 * blocks of the part (`current`) are made the merged ones, each found by its
 * block id among the sheets' blocks. Blocks gone are deleted, changed ones
 * replaced, new ones placed after the block before them (the first one before
 * the next block that is there). The same transaction draws what another
 * member wrote into a part's live room (lib/document-page-parts): both sides
 * are then the room's words, before and after.
 */
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

import { SPLIT_CONTINUATION_ATTR, splitPieceRoot } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { matchKeyed } from "@mrnote/core/web/lib/collab/block-text-merge.ts";

function blockIdOf(block: unknown): string | null {
  const id = (block as { attrs?: { block_id?: unknown } } | null)?.attrs?.block_id;
  return typeof id === "string" && id ? id : null;
}

/** The attributes that say a fragment goes on in a later one. */
const CONTINUES_ATTRS = ["pageSplitContinues", "pageSplitItemContinues", "pageTableContinues", "pageTableBlockContinues"] as const;

function continues(node: ProseMirrorNode): boolean {
  return CONTINUES_ATTRS.some((name) => Boolean(node.attrs?.[name]));
}














function blocksWithId(doc: ProseMirrorNode, id: string): Array<{ pos: number; node: ProseMirrorNode }> {
  const found: Array<{ pos: number; node: ProseMirrorNode }> = [];
  let tableFragment: unknown = null;
  // Whether the block just walked was a piece of it (the next may go on with it).
  let afterPiece = false;
  const note = (node: ProseMirrorNode, pos: number) => {
    const fragment = node.attrs?.pageTableFragmentId;
    const previous = found[found.length - 1];
    if (splitPieceRoot(node.attrs) === id || node.attrs?.block_id === id) {
      if (fragment) tableFragment = fragment;
      found.push({ pos, node });
    } else if (tableFragment && fragment === tableFragment) {
      found.push({ pos, node });
    } else if (afterPiece && previous && continues(previous.node) && node.type === previous.node.type &&
      node.attrs?.[SPLIT_CONTINUATION_ATTR] === true) {
      found.push({ pos, node });
    } else {
      afterPiece = false;
      return;
    }
    afterPiece = true;
  };
  doc.forEach((child, offset) => {
    if (child.type.name === "pageBlock") child.forEach((block, inner) => note(block, offset + 1 + inner));
    else note(child, offset);
  });
  return found;
}

/** Every piece of the block is here: the last one does not say it goes on. */
function piecesAreWhole(pieces: ReadonlyArray<{ node: ProseMirrorNode }>): boolean {
  return pieces.length === 0 || !continues(pieces[pieces.length - 1].node);
}

/** The block at `pos` taken out; a sheet it was the only block of goes with it
 * (a sheet holds a block), unless it is the document's only sheet. */
function removeBlock(tr: Transaction, at: { pos: number; node: ProseMirrorNode }): void {
  const $pos = tr.doc.resolve(at.pos);
  const parent = $pos.parent;
  if (parent.type.name === "pageBlock" && parent.childCount === 1 && tr.doc.childCount > 1) {
    tr.delete($pos.before(), $pos.after());
    return;
  }
  tr.delete(at.pos, at.pos + at.node.nodeSize);
}

/** The block at `at` made `next`, touching only what differs, so a caret in
 * the block stays where it is and the words around it keep their place. */
function replaceBlock(tr: Transaction, at: { pos: number; node: ProseMirrorNode }, next: ProseMirrorNode): void {
  const { pos, node } = at;
  if (node.eq(next)) return;
  if (node.type !== next.type || !node.isBlock || node.isLeaf || node.isAtom) {
    tr.replaceWith(pos, pos + node.nodeSize, next);
    return;
  }
  if (!node.hasMarkup(next.type, next.attrs, next.marks)) tr.setNodeMarkup(pos, next.type, next.attrs, next.marks);
  const start = node.content.findDiffStart(next.content);
  if (start === null) return;
  const end = node.content.findDiffEnd(next.content);
  if (!end) return;
  let { a: endOld, b: endNew } = end;
  const overlap = start - Math.min(endOld, endNew);
  if (overlap > 0) {
    endOld += overlap;
    endNew += overlap;
  }
  tr.replace(pos + 1 + start, pos + 1 + endOld, next.slice(start, endNew));
  // A cut that does not fit (the slice's open sides) must not leave anything
  // but `next`: the block is then replaced whole.
  const written = tr.doc.nodeAt(pos);
  if (!written?.eq(next)) tr.replaceWith(pos, pos + (written?.nodeSize ?? node.nodeSize), next);
}

/** The selection's ends as offsets into the block's words, when it lies inside
 * the block's text pieces. */
function caretWithinPieces(
  tr: Transaction,
  pieces: ReadonlyArray<{ pos: number; node: ProseMirrorNode }>,
): { anchor: number; head: number } | null {
  if (!pieces.every((piece) => piece.node.isTextblock)) return null;
  const offsetOf = (position: number): number | null => {
    let before = 0;
    for (const piece of pieces) {
      const start = piece.pos + 1, end = start + piece.node.content.size;
      if (position >= start && position <= end) return before + position - start;
      before += piece.node.content.size;
    }
    return null;
  };
  const anchor = offsetOf(tr.selection.anchor), head = offsetOf(tr.selection.head);
  return anchor === null || head === null ? null : { anchor, head };
}

/** A block written whole over its pieces: the selection goes to the same words,
 * moved by what changed before it (otherwise it ended up at the block's end, and
 * the member's next word with it). */
function restoreCaretWithinBlock(
  tr: Transaction,
  pos: number,
  caret: { anchor: number; head: number },
  pieces: ReadonlyArray<{ node: ProseMirrorNode }>,
  next: ProseMirrorNode,
): void {
  const was = pieces.map((piece) => piece.node.textContent).join("");
  const now = next.textContent;
  let prefix = 0;
  while (prefix < was.length && prefix < now.length && was[prefix] === now[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < was.length - prefix && suffix < now.length - prefix &&
    was[was.length - 1 - suffix] === now[now.length - 1 - suffix]
  ) suffix += 1;
  const moved = (offset: number): number => {
    const mapped = offset <= prefix ? offset
      : offset >= was.length - suffix ? offset + now.length - was.length
        : prefix;
    return Math.max(0, Math.min(mapped, next.content.size));
  };
  const start = pos + 1;
  tr.setSelection(TextSelection.create(tr.doc, start + moved(caret.anchor), start + moved(caret.head)));
}

/**
 * The transaction that makes `current` read `merged` in `state`, or null when
 * it cannot be made exactly (a block without an id, one `nodeOf` cannot build):
 * nothing is changed then. A block the layout holds in several pieces is made
 * one block in its first piece's place and the paginator splits it again.
 * Only what differs is walked: this runs for each change a member's part room
 * delivers, in a document of tens of thousands of blocks.
 */
 
export let lastMergeRefusal = "";
function refused(reason: string): null {
  lastMergeRefusal = reason;
  return null;
}

export function mergedPartTransaction(
  state: EditorState,
  current: readonly unknown[],
  merged: readonly unknown[],
  nodeOf: (block: unknown) => ProseMirrorNode | null,
  /** Where the caret goes (its block and offset), when the room followed it. */
  caretHint?: { readonly block: string; readonly offset: number },
): Transaction | null {
  const tr = state.tr;
  const currentEach = current.map((block) => JSON.stringify(block));
  const mergedEach = merged.map((block) => JSON.stringify(block));
  let first = 0;
  while (first < currentEach.length && first < mergedEach.length && currentEach[first] === mergedEach[first]) first += 1;
  let last = 0;
  while (
    last < currentEach.length - first && last < mergedEach.length - first &&
    currentEach[currentEach.length - 1 - last] === mergedEach[mergedEach.length - 1 - last]
  ) last += 1;
  if (first === currentEach.length && first === mergedEach.length) return tr;
  const currentById = new Map<string | null, string>();
  for (let index = first; index < currentEach.length - last; index += 1) {
    currentById.set(blockIdOf(current[index]), currentEach[index]);
  }
  const changedMerged = merged.slice(first, merged.length - last);
  const mergedIds = new Set(changedMerged.map(blockIdOf));
  for (let index = first; index < current.length - last; index += 1) {
    const id = blockIdOf(current[index]);
    if (!id) return refused("removed-no-id");
    if (mergedIds.has(id)) continue;
    const at = blocksWithId(tr.doc, id);
    if (at.length === 0 || !piecesAreWhole(at)) return refused("removed-not-whole");
    for (const piece of at.reverse()) removeBlock(tr, piece);
  }
  const written: Array<[string, string]> = [];
  let previous: string | null = first > 0 ? blockIdOf(merged[first - 1]) : null;
  if (first > 0 && previous === null) return refused("no-previous-id");
  /** Where the next block goes: after the block before it (its last piece). */
  const placeAfterPrevious = (): number | null => {
    if (previous === null) return null;
    const before = blocksWithId(tr.doc, previous);
    if (before.length === 0) return null;
    const tail = before[before.length - 1];
    return tail.pos + tail.node.nodeSize;
  };
  for (let index = 0; index < changedMerged.length; index += 1) {
    const block = changedMerged[index];
    const id = blockIdOf(block);
    if (!id) return refused("merged-no-id");
    let at = blocksWithId(tr.doc, id);
    // Only a block known whole is changed: a piece not found would stay beside it.
    if (!piecesAreWhole(at)) return refused("merged-not-whole");
    const after = placeAfterPrevious();
    if (at.length > 0 && after !== null && at[0].pos < after) {
      // It stands before the block that now precedes it: moved.
      for (const piece of [...at].reverse()) removeBlock(tr, piece);
      at = [];
    }
    if (at.length > 0) {
      if (currentById.get(id) !== JSON.stringify(block)) {
        const node = nodeOf(block);
        if (!node) return refused("no-node-replace");
        const carets = at.length > 1 ? caretWithinPieces(tr, at) : null;
        for (const piece of at.slice(1).reverse()) removeBlock(tr, piece);
        replaceBlock(tr, at[0], node);
        if (carets) restoreCaretWithinBlock(tr, at[0].pos, carets, at, node);
        written.push([id, node.textContent]);
      }
    } else {
      const node = nodeOf(block);
      if (!node) return refused("no-node-insert");
      let position = placeAfterPrevious();
      if (position === null) {
        const next = [...changedMerged.slice(index + 1), ...merged.slice(merged.length - last)].map(blockIdOf)
          .find((nextId) => nextId !== null && blocksWithId(tr.doc, nextId).length > 0);
        if (next) position = blocksWithId(tr.doc, next)[0].pos;
      }
      if (position === null) return refused("no-position");
      tr.insert(position, node);
      written.push([id, node.textContent]);
    }
    previous = id;
  }
  // What was written is what the document now says of those blocks, every piece
  // read: anything else must not reach a save, or the rooms.
  for (const [id, text] of written) {
    if (blocksWithId(tr.doc, id).map((piece) => piece.node.textContent).join("") !== text) return refused("written-differs");
  }
  // The caret of a block another member changed stays right after the letter
  // it stood after, wherever that letter is now (the nearest one before it
  // that is still there): this member's own letters keep their caret, and
  // another member's words put in right at it go after it. Mapped by the
  // replaced range (as a selection maps), the caret was carried past words put
  // in at it -- the next key landed after them, two members typing at one spot
  // cut each other's words into interleaved pieces -- or, in a paragraph whose
  // other words were deleted around this member's, to the range's start
  
  const caret = state.selection;
  // The room's word on where the caret goes stands over any other reading of it.
  const hinted = Boolean(caretHint) && tr.docChanged && caret.empty && caret instanceof TextSelection;
  if ((hinted || !tr.selectionSet) && tr.docChanged && caret.empty && caret instanceof TextSelection && caret.$head.parent.isTextblock) {
    // A piece of a block cut across sheets names the block it is a piece of.
    const id = splitPieceRoot(caret.$head.parent.attrs);
    const was = caret.$head.parent;
    const now = id ? blocksWithId(tr.doc, id) : [];
    if (now.length === 1 && now[0].node.isTextblock && caretHint && caretHint.block === id &&
        caretHint.offset <= now[0].node.content.size) {
      // Followed through the room itself (the letter it stood after).
      tr.setSelection(TextSelection.create(tr.doc, now[0].pos + 1 + caretHint.offset));
    } else if (!tr.selectionSet && now.length === 1 && now[0].node.isTextblock && !now[0].node.eq(was)) {
      const tokens = (node: ProseMirrorNode) => {
        const out: Array<{ key: string }> = [];
        node.forEach((child) => {
          if (child.isText) for (const ch of child.text ?? "") out.push({ key: `t${ch}` });
          else for (let at = 0; at < child.nodeSize; at += 1) out.push({ key: `n${child.type.name}` });
        });
        return out;
      };
      const before = tokens(was), after = tokens(now[0].node);
      const match = matchKeyed(before, after);
      if (match) {
        let offset = 0;
        for (let at = caret.$head.parentOffset - 1; at >= 0; at -= 1) {
          if (match[at] >= 0) { offset = match[at] + 1; break; }
        }
        const head = now[0].pos + 1 + Math.min(offset, now[0].node.content.size);
        if (tr.doc.resolve(head).parent.inlineContent) tr.setSelection(TextSelection.create(tr.doc, head));
      }
    }
  }
  return tr;
}

/** The sheets two versions of a paged document differ in, widened to whole
 * blocks: `[from, to)` of `next`'s sheets stand where `[oldFrom, oldTo)` of
 * `previous`'s stood; every sheet before and after is the very same node in
 * both. A boundary between two sheets that falls inside a block (the sheet
 * before ends on a piece that goes on) is never a range's edge. Null when the
 * documents are not paged, or the range is wider than `maxSheets`. */
export function changedSheetRange(
  previous: ProseMirrorNode,
  next: ProseMirrorNode,
  maxSheets: number,
): { from: number; to: number; oldFrom: number; oldTo: number } | null {
  const paged = (doc: ProseMirrorNode) => doc.childCount > 0 && doc.firstChild?.type.name === "pageBlock" &&
    doc.lastChild?.type.name === "pageBlock";
  if (!paged(previous) || !paged(next)) return null;
  const limit = Math.min(previous.childCount, next.childCount);
  let head = 0;
  while (head < limit && previous.child(head) === next.child(head)) head += 1;
  let tail = 0;
  while (tail < limit - head && previous.child(previous.childCount - 1 - tail) === next.child(next.childCount - 1 - tail)) tail += 1;
  let from = head, oldFrom = head, to = next.childCount - tail, oldTo = previous.childCount - tail;
  const goesOn = (doc: ProseMirrorNode, sheet: number) => {
    const last = doc.child(sheet).lastChild;
    return Boolean(last && continues(last));
  };
  for (;;) {
    if (from > 0 && (goesOn(next, from - 1) || goesOn(previous, oldFrom - 1))) { from -= 1; oldFrom -= 1; continue; }
    if (to < next.childCount && oldTo < previous.childCount && ((to > 0 && goesOn(next, to - 1)) || (oldTo > 0 && goesOn(previous, oldTo - 1)))) {
      to += 1; oldTo += 1; continue;
    }
    break;
  }
  if (to - from > maxSheets || oldTo - oldFrom > maxSheets) return null;
  // A range ending on a piece that goes on with no sheet after it to take.
  if ((to > from && goesOn(next, to - 1)) || (oldTo > oldFrom && goesOn(previous, oldTo - 1))) return null;
  return { from, to, oldFrom, oldTo };
}

/** The pieces (each block whole: all its pieces) of the blocks two versions of
 * a paged document differ in -- blocks that are not the very same nodes in
 * both, or that are gone -- in document order on each side; the blocks the
 * pages only moved between sheets are the same nodes and are left out. Null
 * when the documents are not paged, the changed range is wider than
 * `maxSheets`, or a changed block names no identity. */
export function changedBlockPieces(
  previous: ProseMirrorNode,
  next: ProseMirrorNode,
  maxSheets: number,
): { before: ProseMirrorNode[]; after: ProseMirrorNode[] } | null {
  const range = changedSheetRange(previous, next, maxSheets);
  if (!range) return null;
  const blocksOf = (doc: ProseMirrorNode, from: number, to: number) => {
    const out: ProseMirrorNode[] = [];
    for (let index = from; index < to; index += 1) {
      const sheet = doc.child(index);
      if (sheet.type.name === "pageBlock") sheet.forEach((block) => out.push(block));
      else out.push(sheet);
    }
    return out;
  };
  const was = blocksOf(previous, range.oldFrom, range.oldTo);
  const now = blocksOf(next, range.from, range.to);
  const kept = new Set(was), stays = new Set(now);
  const roots = new Set<string>();
  for (const [blocks, other] of [[now, kept], [was, stays]] as const) {
    for (const block of blocks) {
      if (other.has(block)) continue;
      const root = splitPieceRoot(block.attrs);
      if (!root) return null;
      roots.add(root);
    }
  }
  const pick = (blocks: readonly ProseMirrorNode[]) => blocks.filter((block) => roots.has(splitPieceRoot(block.attrs) ?? ""));
  return { before: pick(was), after: pick(now) };
}
















export function partSheetsOfView(
  doc: ProseMirrorNode,
  owner: ReadonlyMap<string, number>,
  loaded: number,
  index: number,
): ProseMirrorNode[] | null {
  if (index < 0 || index > loaded) return null;
  return allPartSheetsOfView(doc, owner, loaded)?.[index] ?? null;
}

/** The ids of the blocks a view holds (a block cut across sheets by its
 * first piece's, `splitPieceRoot`), read off its sheets without serializing
 * them: what a part coming in is checked against (document-page-parts
 * loadNext). */
export function viewBlockIdsOf(doc: ProseMirrorNode): Set<string> {
  const ids = new Set<string>();
  const note = (block: ProseMirrorNode) => {
    const root = splitPieceRoot(block.attrs);
    if (root !== null) ids.add(root);
  };
  doc.forEach((sheet) => {
    if (sheet.type.name === "pageBlock") sheet.forEach(note);
    else note(sheet);
  });
  return ids;
}

/** Every part's sheets at once (`partSheetsOfView` for each part 0..loaded), in one walk of the view. */
export function allPartSheetsOfView(
  doc: ProseMirrorNode,
  owner: ReadonlyMap<string, number>,
  loaded: number,
): ProseMirrorNode[][] | null {
  if (loaded < 0) return null;
  const counts = new Array<number>(loaded + 1).fill(0);
  const out: ProseMirrorNode[][] = Array.from({ length: loaded + 1 }, () => []);
  const partOf = new Map<string, number>();
  let current = 0;
  const partOfPiece = (piece: ProseMirrorNode): number => {
    const root = splitPieceRoot(piece.attrs);
    if (root !== null && partOf.has(root)) return partOf.get(root)!;
    if (root !== null) {
      const known = owner.get(root);
      if (known !== undefined && known > current && known <= loaded) current = known;
      partOf.set(root, current);
    }
    counts[current] += 1;
    return current;
  };
  doc.forEach((sheet) => {
    if (sheet.type.name !== "pageBlock") {
      out[partOfPiece(sheet)].push(sheet);
      return;
    }
    const byPart = new Map<number, ProseMirrorNode[]>();
    sheet.forEach((piece) => {
      const part = partOfPiece(piece);
      const list = byPart.get(part);
      if (list) list.push(piece);
      else byPart.set(part, [piece]);
    });
    for (const [part, pieces] of byPart) {
      out[part].push(pieces.length === sheet.childCount ? sheet : sheet.copy(Fragment.fromArray(pieces)));
    }
  });
  if (counts.some((count) => count === 0)) return null;
  return out;
}

/** What `serializeViewParts` keeps of each part between calls: its pieces (the
 * very nodes) and what they serialized to. */
export type PartSerializations = Array<{ readonly pieces: readonly ProseMirrorNode[]; readonly blocks: readonly unknown[] } | undefined>;













export function serializeViewParts(
  doc: ProseMirrorNode,
  owner: ReadonlyMap<string, number>,
  loaded: number,
  serializePart: (sheets: readonly ProseMirrorNode[]) => unknown[] | null,
  kept: PartSerializations,
): unknown[][] | null {
  const all = allPartSheetsOfView(doc, owner, loaded);
  if (!all) return null;
  const out: unknown[][] = [];
  for (let index = 0; index < all.length; index += 1) {
    const sheets = all[index];
    const pieces: ProseMirrorNode[] = [];
    for (const sheet of sheets) {
      if (sheet.type.name === "pageBlock") sheet.forEach((piece) => { pieces.push(piece); });
      else pieces.push(sheet);
    }
    const before = kept[index];
    if (before && before.pieces.length === pieces.length && before.pieces.every((piece, at) => piece === pieces[at])) {
      out.push([...before.blocks]);
      continue;
    }
    const blocks = serializePart(sheets);
    if (!blocks) return null;
    kept[index] = { pieces, blocks };
    out.push([...blocks]);
  }
  kept.length = all.length;
  return out;
}
