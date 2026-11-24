/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Command } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, type Selection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import {
  nextDocumentFloatingHeight,
  normalizeDocumentShapeAttrs,
  type DocumentShapeAttrs,
} from "../../../../lib/document-shapes";
import {
  documentShapeFreePlace,
  documentShapeOutOfLineAnchor,
  documentShapesFloatingBeside,
} from "../../../../lib/document-shape-anchor";
import { normalizeFloatAnchor } from "../../../../lib/office-float-anchor";
import { resolveSectionAtSelection } from "./sectionLayouts";
import { documentTableAutoFitWidthPx } from "./tableAutoFitWidth";

const EMU_PER_PX = 9_525;

/** The width of the column a shape inserted at the selection stands in. */
function columnWidthEmu(state: EditorState): number {
  try {
    const px = documentTableAutoFitWidthPx(
      resolveSectionAtSelection(state).layout,
      state.doc.attrs as Record<string, unknown>,
    );
    return px && px > 0 ? Math.round(px * EMU_PER_PX) : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const LIST_CONTAINERS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
]);

/** Shapes cannot be saved beneath any list ancestor. Keep the complete list
 * intact and insert after its outermost container, within the same page/cell. */
export function documentShapePositionOutsideList(
  position: ResolvedPos,
): number | null {
  for (let depth = 1; depth <= position.depth; depth += 1) {
    if (LIST_CONTAINERS.has(position.node(depth).type.name)) {
      return position.after(depth);
    }
  }
  return null;
}

/** The same side of the outermost list around `position` (a shape moved onto
 * a list line lands beside the whole list), or null outside any list. */
export function documentShapeBoundaryOutsideList(
  position: ResolvedPos,
  side: "before" | "after",
): number | null {
  for (let depth = 1; depth <= position.depth; depth += 1) {
    if (LIST_CONTAINERS.has(position.node(depth).type.name)) {
      return side === "before" ? position.before(depth) : position.after(depth);
    }
  }
  return null;
}

/**
 * Where a new floating shape goes when no list is in the way. Word anchors
 * an inserted shape to the paragraph the caret is in and changes none of the
 * text (Microsoft Support "Add shapes": the shape is drawn on the page, the
 * words stay where they were), so a caret INSIDE a paragraph must not split
 * it, a selected range must not be deleted and a selected object must not be
 * replaced: the shape lands beside the caret's paragraph -- before it when
 * the caret is at its start, after it otherwise -- or after the selected
 * object. Null leaves the editor's own insertion (an empty paragraph, which
 * the shape takes the place of, or a selection with no paragraph).
 */
export function documentShapePositionBesideSelection(
  selection: Selection,
): number | null {
  if (selection instanceof NodeSelection && !selection.node.isInline) {
    return selection.to;
  }
  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.depth === 0) return null;
  if ($from.parent.content.size === 0) return null;
  return selection.empty && $from.parentOffset === 0
    ? $from.before()
    : $from.after();
}

export function insertDocumentShapeContent(
  attrs: DocumentShapeAttrs,
  options: {
    /** Insert > WordArt over a selection: the words BECOME the WordArt. */
    readonly replaceSelection?: boolean;
    /** Its offsets from the column and its paragraph (EMU); without them a
     *  floating shape takes the first free place (`documentShapeFreePlace`). */
    readonly place?: { readonly xEmu: number; readonly yEmu: number };
  } = {},
): Command {
  return ({ tr, commands, dispatch, editor }) => {
    if (editor.isDestroyed || !editor.isEditable) return false;
    const shapeType = tr.doc.type.schema.nodes.documentShape;
    if (!shapeType) return false;
    const position =
      documentShapePositionOutsideList(tr.selection.$from) ??
      (options.replaceSelection && !tr.selection.empty
        ? null
        : documentShapePositionBesideSelection(tr.selection));
    const previousShapes = new Set<object>();
    tr.doc.descendants((node) => {
      if (node.type === shapeType) previousShapes.add(node);
    });
    closeHistory(tr);
    const content = { type: "documentShape", attrs };
    const inserted =
      position === null
        ? commands.insertContent(content)
        : commands.insertContentAt(position, content);
    if (!inserted || !dispatch) return inserted;
    let insertedPosition: number | null = null;
    tr.doc.descendants((node, pos) => {
      if (node.type === shapeType && !previousShapes.has(node))
        insertedPosition = pos;
    });
    if (insertedPosition === null) return false;
    const placed = tr.doc.nodeAt(insertedPosition);
    if (placed && placed.attrs.wrapMode !== "inline" && !placed.attrs.inkTool && !normalizeFloatAnchor(placed.attrs.floatAnchor)) {
      // Out of the line, as Word holds a shape it inserts: floating from the
      // paragraph it is anchored to on Word's own anchor (horizontal from
      // the column, vertical from that paragraph), at its place or the first
      // free one beside the shapes already floating there. Left in the flow
      // with no anchor, the page stood such shapes one under another while
      // the file put every one on its paragraph's origin, over each other
      
      const shape = normalizeDocumentShapeAttrs(placed.attrs);
      const $at = tr.doc.resolve(insertedPosition);
      const place = options.place
        ? { x: Math.round(options.place.xEmu), y: Math.round(options.place.yEmu) }
        : documentShapeFreePlace(
            documentShapesFloatingBeside($at.parent, $at.index()),
            shape.widthEmu,
            shape.heightEmu,
            columnWidthEmu(editor.state),
          );
      // Above every other floating drawing, as Word stacks a new one.
      const relativeHeight = nextDocumentFloatingHeight(tr.doc);
      const floating = { ...shape, xEmu: place.x, yEmu: place.y };
      tr.setNodeMarkup(insertedPosition, undefined, {
        ...placed.attrs,
        xEmu: place.x,
        yEmu: place.y,
        relativeHeight,
        floatAnchor: documentShapeOutOfLineAnchor(
          floating,
          shape.wrapMode as Exclude<DocumentShapeAttrs["wrapMode"], "inline">,
          relativeHeight,
        ),
      });
    }
    // Word keeps a paragraph after every object: a graphic is a character of
    // its paragraph, and the document ends with a paragraph mark. A shape
    // put into an empty last paragraph took its place, so nothing followed
    // it: a click after it found no line to stand in, and the browser drew
    // its own caret down the page over the graphic. The paragraph after it
    // is kept, as Word's paragraph mark is.
    const shapeNode = tr.doc.nodeAt(insertedPosition);
    const paragraph = tr.doc.type.schema.nodes.paragraph;
    if (shapeNode && paragraph) {
      const after = insertedPosition + shapeNode.nodeSize;
      let followed = false;
      tr.doc.nodesBetween(after, tr.doc.content.size, (node) => {
        if (followed) return false;
        if (node.isTextblock) followed = true;
        return !followed;
      });
      const $after = tr.doc.resolve(after);
      if (!followed && $after.parent.canReplaceWith($after.index(), $after.index(), paragraph)) {
        tr.insert(after, paragraph.create());
      }
    }
    tr.setSelection(NodeSelection.create(tr.doc, insertedPosition));
    return true;
  };
}
