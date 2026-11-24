/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";






















const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
const ITEM_TYPES = new Set(["listItem", "taskItem"]);
/** Runtime pagination attributes: a list a page boundary split keeps its paste. */
const RUNTIME_SPLIT_ATTR = /^page(?:Split|TableBlock)/;

const pasteIntoListKey = new PluginKey("pasteIntoList");

function holdsDocumentStructure(slice: Slice): boolean {
  if (slice.content.childCount < 2) return false;
  let structural = false;
  let fits = true;
  slice.content.forEach((node) => {
    if (!node.isBlock || ITEM_TYPES.has(node.type.name)) fits = false;
    else if (node.type.name !== "paragraph" && !LIST_TYPES.has(node.type.name)) structural = true;
  });
  return fits && structural;
}

function carriesRuntimeSplit(node: ProseMirrorNode): boolean {
  return Object.entries(node.attrs).some(([key, value]) => RUNTIME_SPLIT_ATTR.test(key) && Boolean(value));
}

function isEmptyItem(item: ProseMirrorNode): boolean {
  return item.childCount === 1 && item.firstChild!.isTextblock && item.firstChild!.content.size === 0;
}

/** The paste transaction, or null when ProseMirror's own paste applies. */
export function pasteIntoListTransaction(tr: Transaction, slice: Slice): Transaction | null {
  if (!(tr.selection instanceof TextSelection) || !holdsDocumentStructure(slice)) return null;
  if (!tr.selection.empty) tr.deleteSelection();
  const pos = tr.selection.from;
  const $pos = tr.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  let listDepth = -1;
  for (let depth = 1; depth < $pos.depth; depth += 1) {
    if (LIST_TYPES.has($pos.node(depth).type.name)) {
      listDepth = depth;
      break;
    }
  }
  if (listDepth < 0) return null;
  for (let depth = listDepth; depth <= $pos.depth; depth += 1) {
    if (carriesRuntimeSplit($pos.node(depth))) return null;
  }
  const destinationEmpty = $pos.parent.content.size === 0;
  const splitDepth = $pos.depth - listDepth + 1;
  if (!canSplit(tr.doc, pos, splitDepth)) return null;
  try {
    tr.split(pos, splitDepth);
    // The boundary between the list's two halves.
    const $head = tr.doc.resolve(tr.mapping.map(pos, -1));
    let boundary = $head.after(listDepth);

    // Word: the destination paragraph's mark ends the last pasted paragraph,
    // so pasted into an empty bullet line that paragraph is the bullet line.
    const pasted: ProseMirrorNode[] = [];
    slice.content.forEach((node) => pasted.push(node));
    const last = pasted[pasted.length - 1];
    const lastIntoItem = destinationEmpty && last.type.name === "paragraph" ? pasted.pop()! : null;

    // The head half ends in the (empty) line the paste replaced: it goes.
    const headList = tr.doc.resolve(boundary).nodeBefore;
    if (destinationEmpty && headList && LIST_TYPES.has(headList.type.name)) {
      const lastItem = headList.lastChild;
      if (lastItem && isEmptyItem(lastItem)) {
        const listStart = boundary - headList.nodeSize;
        if (headList.childCount === 1) {
          tr.delete(listStart, boundary);
          boundary = listStart;
        } else {
          tr.delete(boundary - 1 - lastItem.nodeSize, boundary - 1);
          boundary -= lastItem.nodeSize;
        }
      }
    }

    const keptHead = tr.doc.resolve(boundary).nodeBefore;
    const headItems = keptHead && LIST_TYPES.has(keptHead.type.name) ? keptHead.childCount : 0;
    tr.insert(boundary, pasted);
    let caret = boundary + pasted.reduce((size, node) => size + node.nodeSize, 0);

    const tailList = tr.doc.resolve(caret).nodeAfter;
    if (tailList && LIST_TYPES.has(tailList.type.name)) {
      if (typeof tailList.attrs.start === "number" && headItems > 0) {
        // One list: its numbering runs on past the pasted blocks.
        tr.setNodeMarkup(caret, undefined, { ...tailList.attrs, start: tailList.attrs.start + headItems });
      }
      if (lastIntoItem) {
        const item = tailList.firstChild!;
        const line = item.firstChild!;
        const linePos = caret + 2;
        tr.replaceWith(linePos + 1, linePos + 1 + line.content.size, lastIntoItem.content);
        caret = linePos + 1 + lastIntoItem.content.size;
        tr.setSelection(TextSelection.create(tr.doc, caret));
        return tr.scrollIntoView();
      }
    } else if (lastIntoItem) {
      tr.insert(caret, lastIntoItem);
      caret += lastIntoItem.nodeSize;
    }
    tr.setSelection(Selection.near(tr.doc.resolve(caret), -1));
    return tr.scrollIntoView();
  } catch {
    return null;
  }
}

export const PasteIntoList = Extension.create({
  name: "pasteIntoList",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pasteIntoListKey,
        props: {
          handlePaste(view, _event, slice) {
            if (!view.editable) return false;
            const tr = pasteIntoListTransaction(view.state.tr, slice);
            if (!tr) return false;
            view.dispatch(tr.setMeta("uiEvent", "paste").setMeta("paste", true));
            return true;
          },
        },
      }),
    ];
  },
});
