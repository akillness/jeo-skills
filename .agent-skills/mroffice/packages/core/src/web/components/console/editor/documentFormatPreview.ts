/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The document editor's Live Preview adapter (shared mechanism:
 * components/office-ribbon/officeFormatPreview.tsx). Word previews a hovered
 * font, size, colour or toggle on what the command would format:
 *
 * - selected text (one range, or every cell range of a table selection):
 *   a ProseMirror inline decoration, set by a meta-only transaction, so the
 *   document, its history and its save never see it;
 * - the words selected in a shape's open text field: those characters;
 * - a selected shape / text box: the whole object.
 *
 * Nothing is previewed in a footnote being typed in when the command cannot
 * format a note (font, size, colour), nor for a caret with no characters.
 */

import type { Editor } from "@tiptap/core";

import {
  officeFormatPreviewClassStyle,
  officeFormatPreviewCss,
  officePreviewElements,
  officePreviewShapeTextField,
  type OfficeFormatPreviewAdapter,
} from "../../office-ribbon/officeFormatPreview";
import { isShapeTextFieldFormatting } from "../../../lib/document-shape-text-field-commands";

import { showDocumentFormatPreview } from "./extensions/InactiveSelectionHighlight";
import { liveDocumentShapeMemberId, liveShapeTextTarget } from "./native-document/shapeButtons";

export function documentFormatPreviewAdapter(context: {
  editor: () => Editor | null;
  /** A footnote / endnote body is being typed in (it keeps no font, size or colour). */
  noteBodyEditing: () => boolean;
}): OfficeFormatPreviewAdapter {
  return (patch) => {
    const editor = context.editor();
    if (!editor || editor.isDestroyed || !editor.isEditable) return null;
    if (context.noteBodyEditing()) return null;
    const css = officeFormatPreviewCss(patch);
    const view = editor.view;

    const shape = liveShapeTextTarget(editor);
    if (shape) {
      let dom: Node | null = null;
      try {
        dom = view.nodeDOM(shape.pos);
      } catch {
        dom = null;
      }
      if (!(dom instanceof HTMLElement)) return null;
      const box = dom.querySelector<HTMLElement>("[data-document-shape-text-editor]:not([hidden])");
      if (box) {
        const field = [box, ...box.querySelectorAll<HTMLElement>("*")].find(isShapeTextFieldFormatting) as
          | (HTMLElement & {
              selectionStart?: number;
              selectionEnd?: number;
              setSelectionRange?: (start: number, end: number) => void;
            })
          | undefined;
        return field ? officePreviewShapeTextField(field, css) : null;
      }
      // The shape selected inside a group or SmartArt graphic is what the
      // commit formats (`liveHomeObjectTextTarget`): the preview shows that
      // member's words alone, every member's only when the graphic is.
      const memberId = liveDocumentShapeMemberId(editor, shape);
      if (memberId) {
        const member = Array.from(
          dom.querySelectorAll<HTMLElement>("[data-document-shape-group-member]"),
        ).find((candidate) => candidate.dataset.documentShapeGroupMember === memberId);
        return member ? officePreviewElements([member], css) : null;
      }
      return officePreviewElements([dom], css);
    }

    const ranges = editor.state.selection.ranges
      .map((range) => ({ from: range.$from.pos, to: range.$to.pos }))
      .filter((range) => range.to > range.from);
    if (ranges.length === 0) return null;
    // A line every previewed character has is drawn by its mark's element
    // already: drawn again here, in the preview's own weight, it came out over
    // the other. What is added looks as the mark's element will (note-editor.css).
    const state = editor.state;
    const hasThroughout = (name: "underline" | "strike") => {
      const type = state.schema.marks[name];
      if (!type) return false;
      let every = true;
      for (const { from, to } of ranges) {
        state.doc.nodesBetween(from, to, (node) => {
          if (node.isText && !type.isInSet(node.marks)) every = false;
        });
      }
      return every;
    };
    const lines = {
      underline: patch.underline === true && hasThroughout("underline") ? undefined : patch.underline,
      strike: patch.strike === true && hasThroughout("strike") ? undefined : patch.strike,
    };
    const look = officeFormatPreviewClassStyle(officeFormatPreviewCss({ ...patch, ...lines }));
    return showDocumentFormatPreview(view, ranges, {
      ...look,
      className: lines.underline === true ? `${look.className} office-preview-underline-on` : look.className,
    }, [
      ...(patch.underline === false ? ["underline" as const] : []),
      ...(patch.strike === false ? ["strike" as const] : []),
    ]);
  };
}
