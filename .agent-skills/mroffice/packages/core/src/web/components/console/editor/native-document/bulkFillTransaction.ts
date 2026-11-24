/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { DecorationSet } from "@tiptap/pm/view";

/**
 * The chunks of a long document's first fill (lib/collab/paged-document-bridge
 * `fillInChunks`) carry this meta on every dispatch but the last.
 *
 * The view is neither editable nor shown while they arrive (its pages stay
 * hidden under the initial settle), so a plugin that rebuilds a whole-document
 * decoration set on every change may map its previous set through such a
 * chunk instead and rebuild once, on the last chunk, which carries no meta.
 * Rebuilding on each of them made the fill of a 7,390-block book cost a whole
 * document of decorations per chunk.
 */
export const BULK_FILL_CHUNK_META = "pagedBulkFillChunk";

/** Decoration sets mapped through a fill chunk without being rebuilt. */
const mappedThroughFill = new WeakSet<object>();

/** An empty set of its own (the constructor is not in the package's types). */
const EmptyDecorationSet = DecorationSet as unknown as new (local: unknown[], children: unknown[]) => DecorationSet;

/**
 * The set a plugin maps through a fill chunk (`BULK_FILL_CHUNK_META`): the
 * blocks the chunk brought have no decorations in it yet. The first change
 * after the chunks (the last chunk, which carries no meta) must rebuild the
 * whole document's set: `rebuildsAfterFill` says so. Updating only the blocks
 * that change touched left every block of the earlier chunks undecorated (no
 * effective overflow punctuation, no kerning), and the 296-page book filled
 * in chunks laid out over 366 pages against 365 filled at once.
 */
export function mappedThroughBulkFill<T extends object>(set: T): T {
  // An empty set maps to the one shared `DecorationSet.empty`. Marked itself,
  // every set that stays empty read as "just filled" for good, on every editor
  // of the page: a document with nothing to draw rebuilt its whole set on each
  // page move (the 2,747-page sample: 8 % of the thread).
  const own = (set as unknown) === DecorationSet.empty ? (new EmptyDecorationSet([], []) as unknown as T) : set;
  mappedThroughFill.add(own);
  return own;
}

export function rebuildsAfterFill(set: object): boolean {
  return mappedThroughFill.has(set);
}
