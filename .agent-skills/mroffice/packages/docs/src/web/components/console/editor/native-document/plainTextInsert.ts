/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/** One paragraph per line, as a slice open on both sides. */
export function plainTextParagraphsSlice(view: EditorView, text: string): Slice {
  const { schema, selection, storedMarks } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const marks = storedMarks ?? selection.$from.marks();
  const paragraphs: ProseMirrorNode[] = text.split("\n").map((line) =>
    paragraphType.create(null, line ? schema.text(line, marks) : null),
  );
  return new Slice(Fragment.from(paragraphs), 1, 1);
}

/** Replace the selection with the text's paragraphs (one transaction). */
export function insertPlainTextParagraphs(view: EditorView, text: string): boolean {
  if (!text) return false;
  if (!text.includes("\n") || !view.state.schema.nodes.paragraph) {
    view.dispatch(view.state.tr.insertText(text).scrollIntoView());
    return true;
  }
  view.dispatch(
    view.state.tr.replaceSelection(plainTextParagraphsSlice(view, text)).scrollIntoView(),
  );
  return true;
}
