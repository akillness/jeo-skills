/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * In-line formulas boxed by the engine, for reading a paragraph with no
 * layout (docs-layout; L3-DESIGN step 4).
 *
 * A formula waits for its box until the off-screen clone has typeset it
 * (ledgerTypesetMath), and the clone typesets only the sheets a pass
 * measures. A paragraph holding one past them could not be read with no
 * layout, so every plan stopped at the first such paragraph: a book of
 * 5,200 formulas was laid out four pages a pass (425 provisional sheets to
 * 271 in minutes). The reader (readDocsParagraph's `formulaBox`) asks here
 * for each formula's box: the typeset box a clone kept for it, else the box
 * KaTeX's own build gives it (lib/text-engine/katex-box: the glyphs'
 * advances, Word's box for its height and depth where the preview has one).
 * A paragraph read with an engine box is held against the page like any
 * other (ledgerAtoms' calibration, its own key), so its far pages are
 * trusted once this document's typeset formulas agree with the engine.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { formulaBoxOf } from "../../../extensions/lazyKatex";
import { inlineMathRenderLatex } from "../../../extensions/inlineMathRender";
import { katexBox } from "../../../../../../lib/text-engine/katex-box";
import type { DocsFormulaBox } from "../../../../../../lib/text-engine/docs-lines";

function emOf(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.endsWith("em")) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * The box of in-line formula `formula`, drawn by `preview`, in CSS px of the
 * preview's font size (a formula's KaTeX font is 1em of its run's,
 * note-editor.css). Null where neither a clone nor KaTeX can say.
 */
export function engineFormulaBox(formula: PmNode, preview: HTMLElement, engineOnly = false): DocsFormulaBox | null {
  const kept = engineOnly ? undefined : formulaBoxOf(formula);
  if (kept && kept.kind === "inline" && !kept.wraps) {
    return { width: kept.width, height: kept.height, depth: kept.baselineDepth, exact: true };
  }
  const latex = inlineMathRenderLatex(formula);
  if (!latex) return null;
  const box = katexBox(latex, false);
  if (!box) return null;
  const view = preview.ownerDocument.defaultView;
  if (!view) return null;
  const fontPx = Number.parseFloat(view.getComputedStyle(preview).fontSize);
  if (!(fontPx > 0)) return null;
  const width = box.widthEm * fontPx + box.widthPx;
  let height = (box.heightEm + box.depthEm) * fontPx;
  let depth = box.depthEm * fontPx;
  // A formula Word boxes in its line stands on Word's box (wordMathMetrics).
  if (preview.hasAttribute("data-word-math-box")) {
    const ascent = emOf(preview.style.getPropertyValue("--word-math-ascent"));
    const descent = emOf(preview.style.getPropertyValue("--word-math-descent"));
    if (ascent !== null && descent !== null) {
      height = (ascent + descent) * fontPx;
      depth = descent * fontPx;
    }
  }
  if (!(width >= 0) || !(height >= 0) || !(depth >= 0)) return null;
  return { width, height, depth: Math.min(height, depth), exact: false };
}

/** The reader's `formulaBox` for a block: its in-line formulas in document
 * order (the order their previews stand in), or undefined when it has none.
 * `engineOnly`: the engine's boxes even where a clone kept a typeset one
 * (holding the engine to the page). */
export function blockFormulaBoxes(node: PmNode, engineOnly = false): ((ordinal: number, preview: HTMLElement) => DocsFormulaBox | null) | undefined {
  const formulas: PmNode[] = [];
  node.descendants((child) => {
    if (child.type.name === "inlineMath") {
      formulas.push(child);
      return false;
    }
    return true;
  });
  if (formulas.length === 0) return undefined;
  return (ordinal, preview) => {
    const formula = formulas[ordinal];
    return formula ? engineFormulaBox(formula, preview, engineOnly) : null;
  };
}
