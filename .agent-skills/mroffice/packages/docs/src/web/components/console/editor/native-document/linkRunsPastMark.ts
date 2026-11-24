/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/*!
 * Copyright (c) 2026 MR. Lattivity. All rights reserved.
 */
import type { Mark, Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";

















export function linkMarkInclusive(): boolean {
  return typeof window !== "undefined" && (window as { __docsLinkInclusiveOld?: unknown }).__docsLinkInclusiveOld === true;
}

const linkRunsPastMarkKey = new PluginKey("linkRunsPastMark");

function runsPastMarkLink(node: ProseMirrorNode | null | undefined, linkName: string): Mark | null {
  if (!node?.isText) return null;
  return node.marks.find((mark) => mark.type.name === linkName && mark.attrs.runsPastMark === true) ?? null;
}

export function linkRunsPastMarkPlugin(linkName: string): Plugin {
  return new Plugin({
    key: linkRunsPastMarkKey,
    appendTransaction(transactions, _oldState, newState) {
      if (linkMarkInclusive()) return null;
      // Another client's change (the room) and Undo/Redo already hold their
      // marks as written.
      if (
        !transactions.some((tr) => tr.docChanged) ||
        transactions.some(
          (tr) =>
            tr.getMeta("y-sync$") !== undefined ||
            tr.getMeta("history$") !== undefined ||
            tr.getMeta(linkRunsPastMarkKey) !== undefined,
        )
      ) {
        return null;
      }
      const maps = transactions.flatMap((tr) => tr.mapping.maps);
      const typed: Array<{ from: number; to: number }> = [];
      let index = 0;
      for (const tr of transactions) {
        tr.steps.forEach((step, own) => {
          if (!(step instanceof ReplaceStep)) return;
          const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
          if (from !== to || slice.openStart !== 0 || slice.openEnd !== 0 || slice.content.childCount === 0) return;
          let text = true;
          slice.content.forEach((node) => {
            if (!node.isText) text = false;
          });
          if (!text) return;
          let start = from;
          let end = from + slice.size;
          for (const map of maps.slice(index + own + 1)) {
            start = map.map(start, 1);
            end = map.map(end, -1);
          }
          if (end > start) typed.push({ from: start, to: end });
        });
        index += tr.steps.length;
      }
      if (!typed.length) return null;
      const tr: Transaction = newState.tr;
      for (const { from, to } of typed) {
        if (to > tr.doc.content.size) continue;
        const $to = tr.doc.resolve(to);
        // Typed at the paragraph's end, right after the link's words.
        if (!$to.parent.isTextblock || $to.parentOffset !== $to.parent.content.size) continue;
        const $from = tr.doc.resolve(from);
        if ($from.parent !== $to.parent) continue;
        const link = runsPastMarkLink($from.nodeBefore, linkName);
        if (!link) continue;
        let linked = true;
        tr.doc.nodesBetween(from, to, (node) => {
          if (node.isText && !node.marks.some((mark) => mark.type.name === linkName)) linked = false;
          return true;
        });
        if (linked) continue;
        tr.addMark(from, to, link);
      }
      if (!tr.docChanged) return null;
      tr.setMeta(linkRunsPastMarkKey, true);
      return tr;
    },
  });
}
