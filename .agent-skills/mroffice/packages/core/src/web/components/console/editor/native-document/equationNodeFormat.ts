/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { MarkType, Node as PmNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import {
  equationLatexWithLetterFormat,
  equationLettersFormatState,
} from "../../../../lib/office-equation-letter-format";

import { isTextBearingInlineAtom } from "./inlineAtomText";

/** An equation (inline or display). */
const EQUATION_NODE_NAMES: ReadonlySet<string> = new Set(["inlineMath", "mathBlock"]);

export type DocumentEquationFormat = "bold" | "underline";

export function isDocumentEquationNode(node: PmNode): boolean {
  return EQUATION_NODE_NAMES.has(node.type.name) && typeof node.attrs.latex === "string";
}

/** Whether a mark of `kind` states it on (an explicit off, `none`, does not). */
function markOn(node: PmNode, kind: DocumentEquationFormat): boolean {
  const mark = node.marks.find((candidate) => candidate.type.name === kind);
  if (!mark) return false;
  if (kind === "bold") return mark.attrs.value !== false;
  return (mark.attrs.underlineStyle ?? "single") !== "none";
}

/** An equation's `kind`: its letters' (every one has it), or its own mark. */
export function documentEquationFormatOn(node: PmNode, kind: DocumentEquationFormat): boolean {
  return markOn(node, kind) || equationLettersFormatState(node.attrs.latex as string, kind) === true;
}

/** Whether the (ranged) selection holds an equation. */
export function selectionHoldsEquation(state: EditorState): boolean {
  if (state.selection.empty) return false;
  let found = false;
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (found) return false;
      if (isDocumentEquationNode(node)) {
        found = true;
        return false;
      }
      return undefined;
    });
  }
  return found;
}

/** Underline over a ranged selection: every character and equation has it. */
export function isUnderlineSelectionWithEquations(state: EditorState): boolean {
  let seen = false;
  let all = true;
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (isDocumentEquationNode(node)) {
        seen = true;
        all &&= documentEquationFormatOn(node, "underline");
        return false;
      }
      if (!node.isText && !isTextBearingInlineAtom(node)) return undefined;
      seen = true;
      all &&= markOn(node, "underline");
      return undefined;
    });
  }
  return seen && all;
}

/**
 * The selection's equations with `kind` set (`on`) or cleared in their
 * letters, and their own mark of it taken off: the format is the letters'.
 */
export function settleSelectedEquations(
  state: EditorState,
  tr: Transaction,
  kind: DocumentEquationFormat,
  on: boolean,
  markType: MarkType,
): void {
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, position) => {
      if (!isDocumentEquationNode(node)) return undefined;
      const latex = node.attrs.latex as string;
      const next = equationLatexWithLetterFormat(latex, kind, on);
      if (next !== latex) tr.setNodeAttribute(position, "latex", next);
      if (node.isInline) tr.removeMark(position, position + node.nodeSize, markType);
      return false;
    });
  }
}
