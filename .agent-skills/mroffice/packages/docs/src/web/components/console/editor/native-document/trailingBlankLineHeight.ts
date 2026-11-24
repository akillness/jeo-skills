"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word does not let the blanks that end a paragraph raise its last line: a
 * tab, a space, an en space, an em space or a four-per-em space set in a
 * larger size after the paragraph's words leaves the line at the words'
 * height, while a no-break space, the quads, a three- or six-per-em, figure,
 * punctuation, thin or hair space and the narrow no-break space in that size
 * raise it (Word's own rendering of corpus R55-D06, LibreOffice's tdf153136:
 * one shaded paragraph per character, each ending in that character at
 * 48 pt). The browser sizes the line by every glyph on it, so those trailing
 * blanks are drawn with no line height of their own.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { decorationsBySheet } from "./paged/sheetDecorationSet";

export const TRAILING_BLANK_ATTR = "data-word-trailing-blank";

const IGNORED_TRAILING = new Set(["\t", " ", " ", " ", " "]);

const trailingBlankKey = new PluginKey<DecorationSet>("documentTrailingBlankLineHeight");

function trailingRange(block: ProseMirrorNode, start: number): [number, number] | null {
  // The blanks closing the block's own text, in its last text nodes.
  const end = start + block.content.size;
  let from = end;
  for (let index = block.childCount - 1; index >= 0; index -= 1) {
    const child = block.child(index);
    if (!child.isText || !child.text) return null;
    const text = child.text;
    let cut = text.length;
    while (cut > 0 && IGNORED_TRAILING.has(text[cut - 1])) cut -= 1;
    from -= text.length - cut;
    if (cut > 0) {
      // Words before the blanks: the line has a height of its own.
      return from < end ? [from, end] : null;
    }
  }
  return null;
}

function trailingBlankDecorationsIn(node: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  node.descendants((block, pos) => {
    if (!block.isTextblock) return true;
    if (block.childCount > 0) {
      const range = trailingRange(block, pos + 1);
      if (range) decorations.push(Decoration.inline(range[0], range[1], { [TRAILING_BLANK_ATTR]: "true" }));
    }
    return false;
  });
  return decorations.length ? DecorationSet.create(node, decorations) : DecorationSet.empty;
}

/** Per sheet node: a key leaves every other sheet's as it was. */
const sheetSets = new WeakMap<ProseMirrorNode, DecorationSet>();

export function buildTrailingBlankDecorations(doc: ProseMirrorNode): DecorationSet {
  let sheeted = doc.childCount > 0;
  doc.forEach((child) => { if (child.type.name !== PAGE_BLOCK_NODE) sheeted = false; });
  return sheeted ? decorationsBySheet(doc, sheetSets, trailingBlankDecorationsIn) : trailingBlankDecorationsIn(doc);
}

const DocumentTrailingBlankLineHeight = Extension.create({
  name: "documentTrailingBlankLineHeight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: trailingBlankKey,
        state: {
          init: (_config, state) => buildTrailingBlankDecorations(state.doc),
          apply: (tr, value, _old, state) =>
            tr.docChanged ? buildTrailingBlankDecorations(state.doc) : value.map(tr.mapping, tr.doc),
        },
        props: {
          decorations: (state) => trailingBlankKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

export default DocumentTrailingBlankLineHeight;
