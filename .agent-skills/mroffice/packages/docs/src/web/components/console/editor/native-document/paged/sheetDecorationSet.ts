/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A decoration set made of one set per sheet, each kept with its sheet node: a
 * key rebuilds the one sheet it changed and hands ProseMirror the same set for
 * every other, whose view it then leaves alone.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { DecorationSet } from "@tiptap/pm/view";

/** The package types neither this constructor nor what it holds. */
const ConstructibleDecorationSet = DecorationSet as unknown as new (local: unknown[], children: unknown[]) => DecorationSet;

/**
 * ProseMirror asks for each sheet's set in document order on every update, and
 * its search starts from the first every time: a square of the sheets (2,747 of
 * them: 3.8 million steps a key). This one goes on from where the last answer was.
 */
class SheetChildrenDecorationSet extends ConstructibleDecorationSet {
  private cursor = 0;
  private readonly sheetChildren: readonly unknown[];

  constructor(children: unknown[]) {
    super([], children);
    this.sheetChildren = children;
  }

  forChild(offset: number, node: PmNode): DecorationSet {
    if (node.isLeaf) return DecorationSet.empty;
    const children = this.sheetChildren;
    let at = this.cursor;
    if (at >= children.length || (at >= 3 && (children[at - 3] as number) >= offset)) at = 0;
    while (at < children.length && (children[at] as number) < offset) at += 3;
    this.cursor = at;
    return at < children.length && children[at] === offset ? (children[at + 2] as DecorationSet) : DecorationSet.empty;
  }
}

/** The document's set, from each sheet's (`setOf`, positions relative to the sheet
 * as in `DecorationSet.create(sheet, ...)`), asked once per sheet node. */
export function decorationsBySheet(
  doc: PmNode,
  kept: WeakMap<PmNode, DecorationSet>,
  setOf: (sheet: PmNode) => DecorationSet,
): DecorationSet {
  const children: unknown[] = [];
  doc.forEach((sheet, offset) => {
    let set = kept.get(sheet);
    if (!set) {
      set = setOf(sheet);
      kept.set(sheet, set);
    }
    if (set !== DecorationSet.empty) children.push(offset, offset + sheet.nodeSize, set);
  });
  return children.length > 0 ? new SheetChildrenDecorationSet(children) : DecorationSet.empty;
}
