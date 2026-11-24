/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Keep Source Formatting carries a whole paragraph's formatting when the
 * copy took its paragraph mark, as Word's paragraph mark holds the
 * paragraph's formatting: a centred paragraph copied with its end and pasted
 * into an empty line pasted left-aligned, its bold words kept and its
 * centring lost (WUA 128). The paste merged the copied paragraph into the
 * line it landed in, which kept that line's own properties.
 *
 * A copy holds a paragraph's mark when its first block is a text block cut
 * open at the start and another block follows it. The text block the paste
 * starts in then takes that paragraph's properties; its identity (block id,
 * the source it was read from) stays its own.
 */
const IDENTITY_ATTRS = new Set([
  "block_id",
  "source",
  "anchor_id",
  "toc_anchor_id",
  "pageSplitContinues",
  "pageSplitContinuation",
  "pageSplitListItemBridge",
  "pageTableBlockContinues",
  "pageTableBlockContinuation",
]);

const pasteParagraphFormatKey = new PluginKey("pasteParagraphFormat");

/** The copied paragraph whose mark the clipboard holds, or null. */
export function copiedParagraphWithMark(slice: Slice): ProseMirrorNode | null {
  if (slice.openStart < 1 || slice.content.childCount < 2) return null;
  const first = slice.content.firstChild;
  return first?.isTextblock ? first : null;
}

export const PasteParagraphFormat = Extension.create({
  name: "pasteParagraphFormat",
  addProseMirrorPlugins() {
    let pending: ProseMirrorNode | null = null;
    return [
      new Plugin({
        key: pasteParagraphFormatKey,
        props: {
          transformPasted(slice) {
            pending = copiedParagraphWithMark(slice);
            return slice;
          },
        },
        appendTransaction(transactions, oldState, newState) {
          const paste = transactions.find((tr) => tr.getMeta("uiEvent") === "paste" && tr.docChanged);
          const source = pending;
          pending = null;
          if (!paste || !source) return null;
          let at = oldState.selection.from;
          // Where the paste began, before what it put there.
          for (const tr of transactions) at = tr.mapping.map(at, -1);
          const $at = newState.doc.resolve(Math.min(at, newState.doc.content.size));
          let depth = $at.depth;
          while (depth > 0 && !$at.node(depth).isTextblock) depth -= 1;
          if (depth < 1) return null;
          const target = $at.node(depth);
          if (target.type !== source.type && !(target.type.name === "paragraph" && source.type.name === "paragraph")) return null;
          const attrs: Record<string, unknown> = { ...target.attrs };
          let changed = false;
          for (const [key, value] of Object.entries(source.attrs)) {
            if (IDENTITY_ATTRS.has(key) || !(key in attrs)) continue;
            if (JSON.stringify(attrs[key]) === JSON.stringify(value)) continue;
            attrs[key] = value;
            changed = true;
          }
          if (!changed) return null;
          return newState.tr.setNodeMarkup($at.before(depth), undefined, attrs, target.marks);
        },
      }),
    ];
  },
});
