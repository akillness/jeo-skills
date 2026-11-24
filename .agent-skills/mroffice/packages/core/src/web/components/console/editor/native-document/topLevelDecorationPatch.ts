/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Mapping, StepMap } from "@tiptap/pm/transform";
import { type Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * A decoration set derived from a document, brought to the next document by
 * rebuilding only the top-level children that are not the very same nodes.
 *
 * For decorations that are a function of each top-level child alone (with
 * `reachesNeighbour` naming a child whose decorations also land in the child
 * beside it): the leading and trailing children both documents share are
 * kept as they were (shifted by the change between them), and `build` makes
 * the decorations of the range in between, plus one child each side
 * (`readsDocAttrs`: decorations that read the document's attributes are
 * built whole when those changed). On a long document a keystroke changes
 * one child of hundreds: a set rebuilt
 * from the whole document on every change cost a walk of every node and a
 * new tree of every decoration.
 */
export function patchTopLevelDecorations(
  previousDoc: ProseMirrorNode,
  previous: DecorationSet,
  doc: ProseMirrorNode,
  build: (from: number, to: number) => readonly Decoration[],
  options: {
    reachesNeighbour?: (child: ProseMirrorNode) => boolean;
    readsDocAttrs?: boolean;
  } = {},
): DecorationSet {
  if (previousDoc === doc) return previous;
  const reachesNeighbour = options.reachesNeighbour ?? (() => false);
  if (options.readsDocAttrs && previousDoc.attrs !== doc.attrs) {
    const all = [...build(0, doc.content.size)];
    return all.length ? DecorationSet.create(doc, all) : DecorationSet.empty;
  }
  const oldCount = previousDoc.childCount, newCount = doc.childCount;
  let head = 0;
  while (head < oldCount && head < newCount && previousDoc.child(head) === doc.child(head)) head++;
  let tail = 0;
  while (
    tail < oldCount - head && tail < newCount - head &&
    previousDoc.child(oldCount - 1 - tail) === doc.child(newCount - 1 - tail)
  ) tail++;
  if (head === oldCount && head === newCount) return previous;
  // One shared child each side is built again too (a decoration of the
  // changed range may land in it), and past any that reaches its neighbour.
  if (head > 0) head--;
  while (head > 0 && reachesNeighbour(doc.child(head))) head--;
  if (tail > 0) tail--;
  while (tail > 0 && reachesNeighbour(doc.child(newCount - 1 - tail))) tail--;
  let from = 0;
  for (let index = 0; index < head; index++) from += doc.child(index).nodeSize;
  let oldTo = previousDoc.content.size, newTo = doc.content.size;
  for (let index = 0; index < tail; index++) {
    oldTo -= previousDoc.child(oldCount - 1 - index).nodeSize;
    newTo -= doc.child(newCount - 1 - index).nodeSize;
  }
  const mapped = previous.map(new Mapping([new StepMap([from, oldTo - from, newTo - from])]), doc);
  // Whatever the mapping left inside the rebuilt range goes too; a point
  // decoration where the range ends opens the kept child after it.
  const stale = mapped.find(from, newTo).filter((item) =>
    item.from >= from && item.to <= newTo && !(tail > 0 && item.from === newTo && item.to === newTo));
  // remove() and add() clear the entries they take from the array given.
  const added = [...build(from, newTo)];
  return (stale.length ? mapped.remove(stale) : mapped).add(doc, added);
}
