/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  DOCUMENT_FIELD_NODE_NAME,
  resolveDocumentFieldDisplay,
} from "./documentFieldValues";

/**
 * The text a reader sees for an inline atom that has no text node of its own:
 * a field (an automatic date, a page number) shows its result. `null` when the
 * atom shows no text. `textContent` skips such atoms, so every reader of
 * "the words on the page" — Word Count, the table of contents — reads them
 * through this.
 */
export function inlineAtomDisplayText(node: ProseMirrorNode): string | null {
  if (node.type.name === DOCUMENT_FIELD_NODE_NAME) {
    return resolveDocumentFieldDisplay(node.attrs);
  }
  return null;
}

/**
 * Inline atoms that show text of their own and so take character formatting
 * the way a run does: a field's result, a cross-reference, a phonetic
 * guide's base. A command that formats the selected TEXT (bold, a font size
 * step) formats these with it; pictures and other objects without text are
 * not characters and stay out.
 */
export const TEXT_BEARING_INLINE_ATOM_NAMES = [
  DOCUMENT_FIELD_NODE_NAME,
  "crossRef",
  "ruby",
] as const;

const TEXT_BEARING_INLINE_ATOMS: ReadonlySet<string> = new Set(
  TEXT_BEARING_INLINE_ATOM_NAMES,
);

/**
 * Inline atoms whose own character formatting is kept as `runStyle`
 * (inlineAtomRunStyle.ts): the text-bearing ones, and an inline equation,
 * whose math runs Word formats with the same `w:rPr` (bold, underline,
 * strikethrough, colour, size) as the words around it, and a mail-merge
 * field, whose «placeholder» run Word formats the same way (WUA 153: its
 * bold was a mark the shared document never carries, so it was gone on
 * reopen).
 */
export const RUN_STYLE_INLINE_ATOM_NAMES = [
  ...TEXT_BEARING_INLINE_ATOM_NAMES,
  "inlineMath",
  "mergeField",
] as const;

const RUN_STYLE_INLINE_ATOMS: ReadonlySet<string> = new Set(RUN_STYLE_INLINE_ATOM_NAMES);

/** Whether `node` keeps its own character formatting as `runStyle`. */
export function carriesInlineAtomRunStyle(node: ProseMirrorNode): boolean {
  return node.isInline && node.isLeaf && !node.isText && RUN_STYLE_INLINE_ATOMS.has(node.type.name);
}

export function isTextBearingInlineAtom(node: ProseMirrorNode): boolean {
  return (
    node.isInline &&
    node.isLeaf &&
    !node.isText &&
    TEXT_BEARING_INLINE_ATOMS.has(node.type.name)
  );
}

/** A text block's text as shown: its text plus the results of its fields.
 * `skipMark` leaves out the text that wears that mark (a table of contents
 * leaves hidden text out of its rows). */
export function textblockDisplayText(
  block: ProseMirrorNode,
  options: { readonly skipMark?: string; readonly lineBreak?: string } = {},
): string {
  let out = "";
  block.descendants((child) => {
    if (options.lineBreak !== undefined && child.type.name === "hardBreak") {
      out += options.lineBreak;
      return false;
    }
    if (child.isText) {
      if (options.skipMark && child.marks.some((mark) => mark.type.name === options.skipMark)) {
        return false;
      }
      out += child.text ?? "";
      return false;
    }
    if (child.isLeaf) {
      out += inlineAtomDisplayText(child) ?? "";
      return false;
    }
    return true;
  });
  return out;
}
