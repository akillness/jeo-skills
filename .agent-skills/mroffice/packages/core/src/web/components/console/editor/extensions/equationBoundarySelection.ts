/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A selection with an end on the boundary beside a display equation.
 *
 * ## Microsoft behaviour this reproduces
 *
 * Word keeps every display equation in a paragraph of its own (`<m:oMathPara>`
 * inside a `<w:p>`), so each one ends in a paragraph mark. A selection dragged
 * over the second of three stacked equations ends at that mark: it holds the
 * first two and leaves the third out, and a drag back from below over the
 * second holds the last two only.
 *
 * ## Why MRAI needs its own selection for it
 *
 * A `mathBlock` is a block of its own with no paragraph around it. Between two
 * of them (or between one and a table, a picture, the end of a page) there is
 * no text position, and ProseMirror's TextSelection may only end in text: it
 * warns when made there and collapses the moment it is mapped. The nearest
 * text position lies past the next equation, so a text selection always took
 * one equation too many.
 *
 * This selection keeps such an end on the boundary itself, where Word's
 * paragraph mark would be. Everything that works from `from` / `to` / `ranges`
 * (copy, cut, delete, typing or pasting over it, formatting, comments) acts on
 * exactly that range. It is deliberately NOT a TextSelection: code that
 * rebuilds a TextSelection from `from` / `to` would build the invalid one this
 * avoids, and ProseMirror types over a non-text selection itself rather than
 * leaving it to the browser. The keyboard reads it back as an ordinary text
 * selection on the next arrow key.
 *
 * WebKit neither paints nor keeps a DOM selection that ends between two
 * non-editable blocks, so the browser's own highlight is hidden (`visible`
 * false) and equationSelection.ts paints the range itself.
 */

import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import {
  Selection,
  TextSelection,
  type SelectionBookmark,
} from "@tiptap/pm/state";
import type { Mappable } from "@tiptap/pm/transform";

/**
 * The block objects Word keeps on a line of their own, each ending in that
 * line's paragraph mark: a display equation, and a picture, chart or shape
 * (SmartArt included) alone on its line. A drag selection over stacked ones
 * ends exactly beside the last one it passes, never one further.
 */
const BLOCK_OBJECT_NODE_NAMES: ReadonlySet<string> = new Set([
  "mathBlock",
  "image",
  "chart",
  "documentShape",
]);

/** A block boundary with a block object (equation, picture, chart, shape) on either side. */
export function isBlockObjectBoundary($pos: ResolvedPos): boolean {
  if ($pos.parent.inlineContent) return false;
  const before = $pos.nodeBefore;
  const after = $pos.nodeAfter;
  return Boolean(
    (before && BLOCK_OBJECT_NODE_NAMES.has(before.type.name)) ||
      (after && BLOCK_OBJECT_NODE_NAMES.has(after.type.name)),
  );
}

 
export const isDisplayEquationBoundary = isBlockObjectBoundary;

function isSelectionEdge($pos: ResolvedPos): boolean {
  return $pos.parent.inlineContent || isBlockObjectBoundary($pos);
}

export class EquationBoundarySelection extends Selection {
  constructor($anchor: ResolvedPos, $head: ResolvedPos) {
    super($anchor, $head);
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    return selectionBetweenEdges(
      doc,
      mapping.map(this.anchor),
      mapping.map(this.head),
    );
  }

  eq(other: Selection): boolean {
    return (
      other instanceof EquationBoundarySelection &&
      other.anchor === this.anchor &&
      other.head === this.head
    );
  }

  getBookmark(): SelectionBookmark {
    return new EquationBoundaryBookmark(this.anchor, this.head);
  }

  toJSON(): { type: string; anchor: number; head: number } {
    return { type: "equationBoundary", anchor: this.anchor, head: this.head };
  }

  static fromJSON(
    doc: ProseMirrorNode,
    json: { anchor?: unknown; head?: unknown },
  ): Selection {
    if (typeof json.anchor !== "number" || typeof json.head !== "number") {
      throw new RangeError("Invalid input for EquationBoundarySelection.fromJSON");
    }
    return selectionBetweenEdges(doc, json.anchor, json.head);
  }
}

class EquationBoundaryBookmark implements SelectionBookmark {
  constructor(
    private readonly anchor: number,
    private readonly head: number,
  ) {}

  map(mapping: Mappable): SelectionBookmark {
    return new EquationBoundaryBookmark(
      mapping.map(this.anchor),
      mapping.map(this.head),
    );
  }

  resolve(doc: ProseMirrorNode): Selection {
    return selectionBetweenEdges(doc, this.anchor, this.head);
  }
}

(EquationBoundarySelection.prototype as { visible: boolean }).visible = false;

try {
  Selection.jsonID("equationBoundary", EquationBoundarySelection);
} catch {
  // Already registered: a hot reload evaluated this module again.
}

/**
 * Whether `from`..`to` holds anything a selection shows: text, an equation or
 * other atom, a whole paragraph. A range left holding only the seams between
 * blocks (what a delete of the whole selection maps it to) holds nothing.
 */
function rangeHoldsContent(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): boolean {
  let found = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (found) return false;
    const inside = pos >= from && pos + node.nodeSize <= to;
    if (node.isText) {
      found = pos < to && pos + node.nodeSize > from;
    } else if ((node.isAtom || node.isTextblock) && inside) {
      found = true;
    }
    return !found;
  });
  return found;
}

/**
 * The selection from `anchor` to `head`: a TextSelection when both ends are in
 * text, an EquationBoundarySelection when an end sits beside a display
 * equation, and otherwise the text selection nearest to them. A range with
 * nothing left in it collapses to an insertion point on its text end.
 */
export function selectionBetweenEdges(
  doc: ProseMirrorNode,
  anchor: number,
  head: number,
): Selection {
  const size = doc.content.size;
  const $anchor = doc.resolve(Math.max(0, Math.min(anchor, size)));
  const $head = doc.resolve(Math.max(0, Math.min(head, size)));
  if ($anchor.parent.inlineContent && $head.parent.inlineContent) {
    return new TextSelection($anchor, $head);
  }
  if (
    $anchor.pos !== $head.pos &&
    isSelectionEdge($anchor) &&
    isSelectionEdge($head)
  ) {
    const from = Math.min($anchor.pos, $head.pos);
    const to = Math.max($anchor.pos, $head.pos);
    if (rangeHoldsContent(doc, from, to)) {
      return new EquationBoundarySelection($anchor, $head);
    }
    const $text = $anchor.parent.inlineContent ? $anchor : $head;
    return TextSelection.between($text, $text);
  }
  return TextSelection.between($anchor, $head);
}

/**
 * A selection that stands for a range of the text flow — a text selection or
 * one ending beside a display equation — as opposed to a node, a cell or the
 * gap cursor.
 */
export function isTextRangeSelection(selection: Selection): boolean {
  return (
    selection instanceof TextSelection ||
    selection instanceof EquationBoundarySelection
  );
}
