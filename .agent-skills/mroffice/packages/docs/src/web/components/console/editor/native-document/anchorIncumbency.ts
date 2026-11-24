/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";

export interface AnchorHolders {
  /** The anchor id `node` holds as one of these holders, or null. */
  idOf: (node: ProseMirrorNode) => string | null;
  /** The attribute that stores the id. */
  attr: string;
}

/**
 * Whether `transactions` can have given an id a second holder: they put in
 * content that holds one (a paste, a split, a redo) or set the attribute.
 * Typing, deleting and moving the caret never do, so they cost no walk of the
 * document.
 */
export function transactionsMayDuplicateAnchors(
  holders: AnchorHolders,
  transactions: readonly Transaction[],
): boolean {
  for (const transaction of transactions) {
    for (const step of transaction.steps) {
      const json = step.toJSON() as { stepType?: string; attr?: string };
      if (json.stepType === "attr" && json.attr === holders.attr) return true;
      const slice = (step as { slice?: { content?: { descendants?: unknown } } }).slice;
      const content = slice?.content as ProseMirrorNode["content"] | undefined;
      if (!content || typeof content.descendants !== "function") continue;
      let found = false;
      content.descendants((node) => {
        if (found) return false;
        if (holders.idOf(node)) found = true;
        return !found;
      });
      if (found) return true;
    }
  }
  return false;
}

/**
 * Per id, where the holder that had it before `transactions` stands now (null
 * when that holder was deleted, or no holder had the id): its position in
 * `oldDoc` mapped through the changes. The old document is read on the first
 * question only.
 */
export function anchorIncumbents(
  holders: AnchorHolders,
  oldDoc: ProseMirrorNode,
  transactions: readonly Transaction[],
): (id: string) => number | null {
  let read: { mapping: Mapping; before: Map<string, number> } | null = null;
  const readOldDocument = () => {
    const mapping = new Mapping();
    for (const transaction of transactions) mapping.appendMapping(transaction.mapping);
    const before = new Map<string, number>();
    oldDoc.descendants((node, pos) => {
      const held = holders.idOf(node);
      if (held && !before.has(held)) before.set(held, pos);
      return true;
    });
    return { mapping, before };
  };
  return (id) => {
    const { mapping, before } = (read ??= readOldDocument());
    const pos = before.get(id);
    if (pos === undefined) return null;
    // Content pasted right before the holder lands before it: the holder is
    // after the insertion.
    const mapped = mapping.mapResult(pos, 1);
    return mapped.deleted ? null : mapped.pos;
  };
}

/**
 * Release every second holder of an id: the incumbent (see
 * {@link anchorIncumbents}) keeps it, every other holder loses it -- to
 * `rename`'s id when one is given (it is told every id the document holds),
 * else to nothing, to be back-filled with an id of its own. With no
 * incumbent the first holder in document order keeps it.
 */
export function releaseDuplicateAnchorIds(
  tr: Transaction,
  holders: AnchorHolders,
  incumbent: (id: string) => number | null = () => null,
  rename?: (id: string, taken: Set<string>) => string,
): boolean {
  const positions = new Map<string, number[]>();
  tr.doc.descendants((node, pos) => {
    const id = holders.idOf(node);
    if (id) positions.set(id, [...(positions.get(id) ?? []), pos]);
    return true;
  });
  const taken = new Set(positions.keys());
  let changed = false;
  for (const [id, at] of positions) {
    if (at.length < 2) continue;
    const kept = incumbent(id);
    const keep = kept !== null && at.includes(kept) ? kept : at[0];
    for (const pos of at) {
      if (pos === keep) continue;
      const node = tr.doc.nodeAt(pos);
      if (!node) continue;
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        [holders.attr]: rename ? rename(id, taken) : null,
      });
      changed = true;
    }
  }
  return changed;
}
