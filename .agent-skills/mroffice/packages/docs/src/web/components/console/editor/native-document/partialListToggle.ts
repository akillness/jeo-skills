/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Home > Numbering / Bullets on SOME items of a list of the other kind.
 *
 * Word changes only the selected paragraphs: Numbering on one item of a
 * bulleted list numbers that paragraph and leaves the bullets above and below
 * it (Word 16 for Mac, in the body and in the header pane), and Bullets on one
 * item of a numbered list leaves the numbers around it counting on ("1. 2. •
 * 3.": the other paragraphs keep their numbering instance). TipTap's
 * toggleList re-types the whole parent list instead.
 *
 * The list is split at the selected items' edges (structural splits, so the
 * selection maps through) and only the middle part changes type. A selection
 * that covers the whole list is left to the ordinary toggle.
 */

import type { CommandProps } from "@tiptap/core";
import type { Node as PmNode, NodeType } from "@tiptap/pm/model";

import { probeListNumbering } from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";

const LIST_TYPES = ["bulletList", "orderedList"] as const;

function ordinalStart(list: PmNode): number {
  const start = Number(list.attrs.start);
  return Number.isInteger(start) ? start : 1;
}









function shownOrdinal(doc: PmNode, listPos: number, list: PmNode, index: number): number | null {
  let pos = listPos + 1;
  for (let child = 0; child < index; child += 1) pos += list.child(child).nodeSize;
  const item = list.child(index);
  let paragraphPos: number | null = null;
  item.forEach((node, offset) => {
    if (paragraphPos === null && node.isTextblock) paragraphPos = pos + 1 + offset;
  });
  if (paragraphPos === null) return null;
  const value = probeListNumbering(doc).values.get(paragraphPos);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function togglePartOfOtherList(
  props: CommandProps,
  target: "bulletList" | "orderedList",
): boolean {
  const { state, tr, dispatch } = props;
  const targetType: NodeType | undefined = state.schema.nodes[target];
  const otherName = LIST_TYPES.find((name) => name !== target)!;
  const otherType: NodeType | undefined = state.schema.nodes[otherName];
  if (!targetType || !otherType) return false;
  const { $from, $to } = tr.selection;
  // Only when the selection's own (innermost) list is of the other kind: in
  // a list of the target kind the button takes the list off.
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "bulletList" || name === "orderedList" || name === "taskList") {
      if ($from.node(depth).type !== otherType) return false;
      break;
    }
  }
  const range = $from.blockRange($to, (node) => node.type === otherType);
  if (!range) return false;
  const list = range.parent;
  if (range.startIndex === 0 && range.endIndex === list.childCount) return false;
  for (let index = range.startIndex; index < range.endIndex; index += 1) {
    if (list.child(index).type.name !== "listItem") return false;
  }
  if (!dispatch) return true;
  const listPos = range.$from.before(range.depth);
  const boundary = (index: number) => {
    let pos = listPos + 1;
    for (let child = 0; child < index; child += 1) pos += list.child(child).nodeSize;
    return pos;
  };
  const anchor = $from.pos;
  // The number the first SELECTED item shows before the split: a bullet
  // takes no number, so the item after the selection shows it next.
  const afterStart =
    otherName === "orderedList" && range.endIndex < list.childCount
      ? shownOrdinal(state.doc, listPos, list, range.startIndex)
      : null;
  // The later split first: the earlier boundary does not move.
  if (range.endIndex < list.childCount) tr.split(boundary(range.endIndex), 1);
  if (range.startIndex > 0) tr.split(boundary(range.startIndex), 1);
  const $inside = tr.doc.resolve(tr.mapping.map(anchor));
  let depth = $inside.depth;
  while (depth > 0 && $inside.node(depth).type !== otherType) depth -= 1;
  if (depth === 0) return false;
  const middlePos = $inside.before(depth);
  const middle = tr.doc.nodeAt(middlePos);
  if (!middle) return false;
  tr.setNodeMarkup(middlePos, targetType, {});
  // A numbered list split around a paragraph made a bullet counts on after
  // it: the items before keep their numbers, the bullet takes none.
  if (otherName === "orderedList" && range.endIndex < list.childCount) {
    const after = middlePos + tr.doc.nodeAt(middlePos)!.nodeSize;
    const afterList = tr.doc.nodeAt(after);
    if (afterList?.type === otherType) {
      tr.setNodeMarkup(after, otherType, {
        ...afterList.attrs,
        start: afterStart ?? ordinalStart(list) + range.startIndex,
      });
    }
  }
  return true;
}

/**
 * Home > Numbering / Bullets on items of a list of the SAME kind takes their
 * list off, at whatever level they are, as Word's button does: the paragraph
 * leaves the list, and an item of a numbered list after it counts on from the
 * number the paragraph had ("1. Parent / First / 2. Second"). TipTap's toggle
 * lifts one level only, so on a level-2 item the button promoted it to a
 * level-1 "2." and renumbered the items below (live Word audit WUA 036), and
 * a list split by the toggle restarted at 1. False when the selection's own
 * (innermost) list is not of `target`'s kind.
 */
export function toggleListOffAtAnyLevel(
  props: CommandProps,
  target: "bulletList" | "orderedList",
): boolean {
  const { state, tr, dispatch, commands } = props;
  const targetType: NodeType | undefined = state.schema.nodes[target];
  if (!targetType) return false;
  const { $from } = tr.selection;
  let listDepth = 0;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "bulletList" || name === "orderedList" || name === "taskList") {
      if ($from.node(depth).type !== targetType) return false;
      listDepth = depth;
      break;
    }
  }
  if (listDepth === 0) return false;
  // The outermost list the selection is in, and the number its first
  // selected item shows now (an ordered list counts on after the paragraph).
  let rootDepth = listDepth;
  for (let depth = listDepth - 1; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "bulletList" || name === "orderedList" || name === "taskList") rootDepth = depth;
  }
  const rootList = $from.node(rootDepth);
  const counts = rootList.type.name === "orderedList";
  let ordinal: number | null = null;
  if (counts) {
    // The number of the root item the selection is in: an item taken off
    // gives the list after it its own number, a sub-item the next one.
    const rootIndex = $from.index(rootDepth);
    const rootPos = $from.before(rootDepth);
    const shown = shownOrdinal(tr.doc, rootPos, rootList, rootIndex);
    const base = shown ?? ordinalStart(rootList) + rootIndex;
    ordinal = listDepth === rootDepth ? base : base + 1;
  }
  if (!dispatch) return true;
  const inAnyList = () => {
    const $at = tr.selection.$from;
    for (let depth = $at.depth; depth > 0; depth -= 1) {
      const name = $at.node(depth).type.name;
      if (name === "bulletList" || name === "orderedList" || name === "taskList") return true;
    }
    return false;
  };
  let lifted = 0;
  // Each lift reads the state the last one left: Tiptap's chainable state
  // re-reads the transaction when its `tr` is touched.
  const resync = () => void props.state.tr;
  while (inAnyList() && lifted < 10) {
    resync();
    if (!commands.liftListItem("listItem")) break;
    lifted += 1;
  }
  resync();
  if (lifted === 0) return false;
  leaveListParagraphStyle(tr);
  // The paragraph split the outer list: its remainder counts on.
  if (counts && ordinal !== null) {
    const $end = tr.selection.$to;
    let blockDepth = $end.depth;
    while (blockDepth > 0 && !$end.node(blockDepth).isTextblock) blockDepth -= 1;
    if (blockDepth > 0) {
      const before = tr.doc.resolve($end.before(blockDepth)).nodeBefore;
      const afterPos = $end.after(blockDepth);
      const afterList = tr.doc.nodeAt(afterPos);
      if (before?.type.name === "orderedList" && afterList?.type.name === "orderedList") {
        tr.setNodeMarkup(afterPos, afterList.type, { ...afterList.attrs, start: ordinal });
      }
    }
  }
  return true;
}

/** Whether a paragraph is in Word's List Paragraph style, by id or name. */
function isListParagraphStyled(attrs: Record<string, unknown>): boolean {
  if (attrs.docxStyleId === "ListParagraph") return true;
  const source = attrs.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const name = (source as Record<string, unknown>).styleName;
  return typeof name === "string" && name.trim().toLowerCase() === "list paragraph";
}









function leaveListParagraphStyle(tr: CommandProps["tr"]): void {
  const { from, to } = tr.selection;
  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isTextblock) return true;
    if (parent && (parent.type.name === "listItem" || parent.type.name === "taskItem")) return false;
    if (!isListParagraphStyled(node.attrs)) return false;
    const attrs: Record<string, unknown> = { ...node.attrs };
    // No paragraph style of its own is the default one; the save reads the
    // List Paragraph it came with as left (_docx_style_id).
    for (const key of ["docxStyleId", "indentLeftPt", "firstLineIndentPt", "contextualSpacing"]) {
      if (key in attrs) attrs[key] = null;
    }
    tr.setNodeMarkup(pos, undefined, attrs);
    return false;
  });
}
