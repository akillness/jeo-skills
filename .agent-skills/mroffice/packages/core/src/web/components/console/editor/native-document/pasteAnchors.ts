/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Anchors (a bookmark's range, a comment's range) in pasted and dropped text.
 *
 * Word anchors a bookmark or a comment to ONE range of the document. Text
 * copied out of it and pasted elsewhere is a copy of the words, not a second
 * range of the same anchor; text cut (or dragged) out of it moves the anchor
 * with it; text pasted strictly inside it joins it. ProseMirror carries a
 * copied mark into the paste as it is, so each anchor type strips the marks
 * whose anchor still stands in the document and adds the ones the paste lands
 * inside. These helpers are what the two share.
 */

import type { Mark as ProseMirrorMark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export interface PasteLeavingRange {
  from: number;
  to: number;
}

/**
 * The part of the document a paste or a drop being transformed takes away,
 * so an anchor that stands only there is not "already in the document" for
 * the text arriving: a paste replaces the selection, a drag that moves
 * deletes the dragged selection, and a drag that copies takes nothing.
 * ProseMirror transforms a dropped slice before it deletes the source, so a
 * moved bookmark or comment read as a duplicate and was stripped.
 */
export function pasteLeavingRange(view: EditorView): PasteLeavingRange | null {
  const { selection } = view.state;
  if (selection.empty) return null;
  if (view.dragging && !view.dragging.move) return null;
  return { from: selection.from, to: selection.to };
}

/** Whether `[from, to)` lies inside `leaving`. */
export function withinLeavingRange(
  leaving: PasteLeavingRange | null | undefined,
  from: number,
  to: number,
): boolean {
  return Boolean(leaving && from >= leaving.from && to <= leaving.to);
}

/**
 * The marks of `markName` the text on both sides of the selection carries
 * with the same `key` attribute: the anchors a paste there lands strictly
 * inside.
 */
export function enclosingAnchorMarks(
  selection: Selection,
  markName: string,
  key: string,
): ProseMirrorMark[] {
  const before = selection.$from.nodeBefore;
  const after = selection.$to.nodeAfter;
  if (!before?.isText || !after?.isText) return [];
  return before.marks.filter(
    (mark) =>
      mark.type.name === markName &&
      after.marks.some((other) => other.type === mark.type && other.attrs[key] === mark.attrs[key]),
  );
}

/** `slice` with every text carrying `marks`. */
export function withTextMarks(slice: Slice, marks: readonly ProseMirrorMark[]): Slice {
  if (marks.length === 0) return slice;
  const mark = (fragment: Fragment): Fragment => {
    const nodes: ProseMirrorNode[] = [];
    fragment.forEach((node) => {
      if (node.isText) {
        nodes.push(node.mark(marks.reduce((set, item) => item.addToSet(set), node.marks)));
        return;
      }
      nodes.push(node.content.size ? node.copy(mark(node.content)) : node);
    });
    return Fragment.fromArray(nodes);
  };
  return new Slice(mark(slice.content), slice.openStart, slice.openEnd);
}

/**
 * `slice` without the marks `drop` picks, on text and on inline atoms alike.
 * The same slice when nothing is dropped.
 */
export function withoutMarks(slice: Slice, drop: (mark: ProseMirrorMark) => boolean): Slice {
  let changed = false;
  const strip = (fragment: Fragment): Fragment => {
    const nodes: ProseMirrorNode[] = [];
    fragment.forEach((node) => {
      const marks = node.marks.filter((mark) => !drop(mark));
      const remarked = marks.length !== node.marks.length;
      if (remarked) changed = true;
      if (node.isText) {
        nodes.push(remarked ? node.mark(marks) : node);
        return;
      }
      const content = node.content.size ? strip(node.content) : node.content;
      nodes.push(
        content === node.content && !remarked ? node : node.type.create(node.attrs, content, marks),
      );
    });
    return Fragment.fromArray(nodes);
  };
  const content = strip(slice.content);
  return changed ? new Slice(content, slice.openStart, slice.openEnd) : slice;
}
