/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What an in-line formula node is typeset as, from the node alone: the
 * LaTeX its view hands KaTeX (InlineMath's renderPreview), for a reader of
 * the document that has no view of it (the engine boxing a formula on a
 * page not laid out).
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { equationLatexForFormat, type EquationCharacterFormat } from "../../../../lib/office-equation-format";
import { normalizeEquationLayoutMode } from "./equationCatalog";
import { mathLatexForRender, normalizeInlineMathStyle } from "./lazyKatex";

/** The LaTeX KaTeX typesets for `node`, or null for one it does not (an
 * empty formula's placeholder, a linear-format formula drawn as text). */
export function inlineMathRenderLatex(node: PmNode): string | null {
  if (node.type.name !== "inlineMath") return null;
  const latex = String(node.attrs.latex ?? "");
  if (latex.trim() === "" || normalizeEquationLayoutMode(node.attrs.layoutMode) === "linear") return null;
  const names = new Set(node.marks.map((mark) => mark.type.name));
  const format: EquationCharacterFormat = {
    ...(names.has("bold") ? { bold: true } : {}),
    ...(names.has("underline") ? { underline: true } : {}),
    ...(names.has("strike") ? { strike: true } : {}),
  };
  return equationLatexForFormat(mathLatexForRender(latex, normalizeInlineMathStyle(node.attrs.mathStyle)), format);
}
