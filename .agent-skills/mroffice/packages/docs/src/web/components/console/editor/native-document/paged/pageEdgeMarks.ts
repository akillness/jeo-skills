/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { sourceHardBreakTailKey } from "@mrnote/core/web/components/console/editor/native-document/sourceHardBreakTail.ts";
import { PAGE_BLOCK_NODE, PAGE_EDGE_FIRST_ATTR, PAGE_EDGE_LAST_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { decorationsBySheet } from "./sheetDecorationSet";

export function buildPageEdgeDecorations(doc: PmNode, tails: ReadonlySet<number>): DecorationSet {
  // Nearly always none of Word's source-break tails: a sheet's marks are then
  // its own, kept with the sheet node. Built whole, a key on a book assigned
  // two marks per sheet through a walk of the sheets.
  if (tails.size === 0) return sheetedPageEdgeDecorations(doc);
  return buildPageEdgeDecorationsAt(doc, tails);
}

/** The marks of one sheet, its first block's position 1 inside it. */
const sheetEdgeSets = new WeakMap<PmNode, DecorationSet>();
const noTails: ReadonlySet<number> = new Set();
function sheetedPageEdgeDecorations(doc: PmNode): DecorationSet {
  return decorationsBySheet(doc, sheetEdgeSets, sheetEdgeSet);
}

/** The marks `buildPageEdgeDecorationsAt` puts on `page`, relative to it. */
function sheetEdgeSet(page: PmNode): DecorationSet {
  const decorations = pageEdgeDecorationsOf(page, 0, noTails);
  return decorations.length > 0 ? DecorationSet.create(page, decorations) : DecorationSet.empty;
}

function buildPageEdgeDecorationsAt(doc: PmNode, tails: ReadonlySet<number>): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((page, pageOffset) => {
    decorations.push(...pageEdgeDecorationsOf(page, pageOffset + 1, tails));
  });
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** `start`: the position of the page's first child. */
function pageEdgeDecorationsOf(page: PmNode, start: number, tails: ReadonlySet<number>): Decoration[] {
  const decorations: Decoration[] = [];
  if (page.type.name !== PAGE_BLOCK_NODE || page.childCount === 0) return decorations;
  const pageOffset = start - 1;
  {
    let first = -1;
    let firstPos = start;
    let pos = start;
    for (let index = 0; index < page.childCount; index += 1) {
      if (!tails.has(pos) && page.child(index).type.name !== "pageBreak") {
        first = index;
        firstPos = pos;
        break;
      }
      pos += page.child(index).nodeSize;
    }
    const last = page.childCount - 1;
    const lastNode = page.child(last);
    const lastPos = pageOffset + page.nodeSize - 1 - lastNode.nodeSize;
    if (first === last) {
      decorations.push(
        Decoration.node(lastPos, lastPos + lastNode.nodeSize, {
          [PAGE_EDGE_FIRST_ATTR]: "",
          [PAGE_EDGE_LAST_ATTR]: "",
        }),
      );
      return decorations;
    }
    if (first >= 0) {
      const firstNode = page.child(first);
      decorations.push(Decoration.node(firstPos, firstPos + firstNode.nodeSize, { [PAGE_EDGE_FIRST_ATTR]: "" }));
    }
    decorations.push(Decoration.node(lastPos, lastPos + lastNode.nodeSize, { [PAGE_EDGE_LAST_ATTR]: "" }));
  }
  return decorations;
}

const pageEdgeMarksKey = new PluginKey("pageEdgeMarks");

export const PageEdgeMarks = Extension.create({
  name: "pageEdgeMarks",

  addProseMirrorPlugins() {
    let memo: { doc: PmNode; tails: readonly number[] | undefined; set: DecorationSet } | null = null;
    const decorationsFor = (state: EditorState): DecorationSet => {
      const tails = sourceHardBreakTailKey.getState(state)?.positions;
      if (memo && memo.doc === state.doc && memo.tails === tails) return memo.set;
      const set = buildPageEdgeDecorations(state.doc, new Set(tails ?? []));
      memo = { doc: state.doc, tails, set };
      return set;
    };
    return [new Plugin({ key: pageEdgeMarksKey, props: { decorations: decorationsFor } })];
  },
});
