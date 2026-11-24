/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {Node as PmNode} from '@tiptap/pm/model';
import {findContainerContinuationPairs} from './paged/containerSplitting';

const byDocument = new WeakMap<PmNode, ReadonlyMap<PmNode, PmNode["attrs"]>>();

const runtimeAttrs = new Set([
  'block_id', 'source', 'pageSplitContinues', 'pageSplitContinuation',
  'pageSplitItemContinues', 'pageSplitItemContinuation',
]);

function comparableAttrs(node: PmNode, list = false): string {
  return JSON.stringify(Object.fromEntries(Object.entries(node.attrs)
    .filter(([key]) => !runtimeAttrs.has(key) && !(list && key === 'start'))
    .sort(([a], [b]) => a.localeCompare(b))));
}

function compatibleContainerSource(head: PmNode, tail: PmNode): boolean {
  const first = head.attrs.source, last = tail.attrs.source;
  if ((first != null && first.adapter !== 'docx') || (last != null && last.adapter !== 'docx')) return false;
  return last == null || JSON.stringify(first) === JSON.stringify(last);
}

/** Display-only authority for the source-less tail of an actual split list
 * paragraph. Source identity remains unique: no node or transaction is written.
 * Rebuild for the immutable document so edits or broken seams revoke authority. */
export function listContinuationTypography(doc: PmNode): ReadonlyMap<PmNode, PmNode['attrs']> {
  const cached = byDocument.get(doc);
  if (cached) return cached;
  const inherited = new Map<PmNode, PmNode['attrs']>();
  for (const pair of findContainerContinuationPairs(doc).pairs) {
    const head = doc.nodeAt(pair.headPos), tail = doc.nodeAt(pair.tailPos);
    if (!head || !tail || !['orderedList', 'bulletList'].includes(head.type.name) ||
        head.type !== tail.type || !compatibleContainerSource(head, tail) ||
        comparableAttrs(head, true) !== comparableAttrs(tail, true)) continue;
    const headItem = head.lastChild, tailItem = tail.firstChild;
    if (!headItem || !tailItem || headItem.type.name !== 'listItem' ||
        tailItem.type !== headItem.type || headItem.childCount !== 1 || tailItem.childCount !== 1 ||
        headItem.attrs.pageSplitItemContinues !== true || tailItem.attrs.pageSplitItemContinuation !== true ||
        !compatibleContainerSource(headItem, tailItem) ||
        comparableAttrs(headItem) !== comparableAttrs(tailItem)) continue;
    if (head.type.name === 'orderedList') {
      const start = Number(head.attrs.start), next = Number(tail.attrs.start);
      if (!Number.isInteger(start) || start < -2147483648 || start > 2147483647 ||
          !Number.isInteger(next) || next < -2147483648 || next > 2147483647 ||
          next !== start + head.childCount - 1) continue;
    }
    const first = headItem.firstChild!, last = tailItem.firstChild!;
    if (first.type.name !== 'paragraph' || last.type !== first.type ||
        !first.content.size || !last.content.size || last.attrs.source != null ||
        first.attrs.pageSplitContinues !== true || last.attrs.pageSplitContinuation !== true ||
        first.attrs.pageSplitListItemBridge || last.attrs.pageSplitListItemBridge ||
        comparableAttrs(first) !== comparableAttrs(last)) continue;
    const authority = inherited.get(first) ?? first.attrs;
    const source = authority.source;
    if (source?.adapter !== 'docx' || typeof source.sourceAnchor !== 'string' ||
        !/^word\/document\.xml#p\[\d+\](?:\/seg\[\d+\])?$/.test(source.sourceAnchor)) continue;
    inherited.set(last, {...last.attrs, source});
  }
  byDocument.set(doc, inherited);
  return inherited;
}
