/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What makes one formula's typeset box what it is, so the same formula is
 * typeset and read once (lib/docs-math-geometry-cache keeps the boxes).
 *
 * A formula's box is a function of its source, how it is drawn (its preview's
 * own attributes and the box variables wordMathMetrics gives it), the font it
 * stands in, the document's line grid, and what typesets it. The typesetter is
 * asked, not named: a few formulas are measured as the ledger measures any, and
 * the numbers go into the key with KaTeX's version, FORMULA_BOX_VERSION, the
 * browser and the screen's scale. A change of katex.css, of the math rules of
 * the editor's stylesheet, of a KaTeX face that has not arrived, or of the
 * browser's text layout then finds nothing kept, while an ordinary release of
 * the site (several a day) keeps every box.
 *
 * Two things depend on the formula's place:
 * - A formula KaTeX can break (`breaks`, a relation or operator at its top level)
 *   breaks or not by where its line gets to: its box is kept, but its block is
 *   always measured, with it typeset (and the other formulas standing as boxes).
 * - A display formula takes its column's width: its box goes by that width, and
 *   only stands for one directly in a top-level block, whose width that is.
 */
import type { EditorView } from "@tiptap/pm/view";
import katex from "katex";

import { applyWordDisplayMathBox, applyWordInlineMathBox } from "@mrnote/core/web/components/console/editor/extensions/wordMathMetrics.ts";
import { INLINE_DISPLAY_MATH_ATTR } from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import type { FormulaBox } from "@mrnote/core/web/lib/docs-math-geometry-cache.ts";
import { mathGeometryHashNumber } from "@mrnote/core/web/lib/docs-math-geometry-cache.ts";
import { measureTypesetCloneBlockHeights } from "../../typesetCloneMeasurement";
import { measureTypesetMathPlaceholderGeometriesForBlocks, mathPreviews } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";

/**
 * Raised when a change of the code lays formulas out differently and the
 * probes below would not see it (one that moves only what they do not draw).
 */
export const FORMULA_BOX_VERSION = 3;

/** The font properties of a formula's place: what isolateInlineFormula copies,
 * and what else draws text differently. */
const FONT_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch",
  "font-variant", "font-kerning", "font-feature-settings", "font-variation-settings",
  "font-size-adjust", "line-height", "letter-spacing", "word-spacing",
  "text-transform", "text-rendering", "--doc-grid-pitch",
] as const;

/** A preview's attributes that say nothing of its box. */
const SILENT_ATTRIBUTES = new Set([
  "data-math-pending", "data-math-layout-ready", "data-math-render-latex", "data-math-known",
  "style", "role", "tabindex", "title", "aria-label", "aria-disabled", "aria-hidden",
]);

const INLINE_ELEMENTS = new Set(["SPAN", "MARK", "STRONG", "B", "EM", "I", "U", "S", "DEL", "INS", "A", "SUB", "SUP", "CODE", "FONT", "SMALL"]);

/** Reads a formula's place, one element's font at most once a look. */
export class FormulaKeys {
  private readonly fonts = new Map<Element, string>();

  private fontOf(parent: Element): string {
    const known = this.fonts.get(parent);
    if (known !== undefined) return known;
    const win = parent.ownerDocument.defaultView;
    const css = win ? win.getComputedStyle(parent) : null;
    const font = css ? FONT_PROPERTIES.map((name) => css.getPropertyValue(name).trim()).join(";") : "";
    this.fonts.set(parent, font);
    return font;
  }

  /**
   * The key of a formula still waiting to be typeset, by a 53-bit hash; null when
   * it has none (typeset already, or a display formula deep in its block).
   * Its font is read from its wrapper: a pending preview draws its TeX in another
   * font (note-editor.css). An in-line wrapper with no style of its own has its
   * parent's, which several formulas of a run share.
   */
  keyOf(preview: HTMLElement, block: HTMLElement, blockWidth: number): number | null {
    if (!preview.hasAttribute("data-math-pending")) return null;
    const wrapper = preview.parentElement;
    if (!wrapper) return null;
    const blockKind = preview.classList.contains("math-block-preview");
    const place = !blockKind && !wrapper.hasAttribute("style") ? wrapper.parentElement ?? wrapper : wrapper;
    const inlineDisplay = !blockKind && preview.hasAttribute(INLINE_DISPLAY_MATH_ATTR);
    let context = "";
    // A display formula that breaks as Word's does keeps its box only as one line
    // (formulaBoxOfMeasured): one measured on two lines is measured again each
    // time. Its one line or two is decided by the column against its width,
    // which the key holds; the editor gives such a formula 8 % past its column
    // before breaking it (note-editor.css), as Word lets it run.
    if (blockKind || inlineDisplay) {
      // Its width is the block's only directly in the block.
      for (let up: HTMLElement | null = preview.parentElement; up && up !== block; up = up.parentElement) {
        if (!(INLINE_ELEMENTS.has(up.tagName) || up.classList.contains("inline-math-wrapper") || up.classList.contains("math-block-wrapper"))) return null;
      }
      context = `${Math.round(blockWidth * 100) / 100}|${block.getAttribute("style") ?? ""}`;
    }
    const attributes: string[] = [];
    for (const attribute of Array.from(preview.attributes)) {
      if (!SILENT_ATTRIBUTES.has(attribute.name)) attributes.push(`${attribute.name}=${attribute.value}`);
    }
    attributes.sort();
    const variables: string[] = [];
    for (let at = 0; at < preview.style.length; at += 1) {
      const name = preview.style.item(at);
      if (!name.startsWith("--math-placeholder-")) variables.push(`${name}:${preview.style.getPropertyValue(name)}`);
    }
    variables.sort();
    return mathGeometryHashNumber([
      preview.getAttribute("data-math-render-latex") ?? "",
      preview.textContent ?? "",
      attributes.join("&"),
      variables.join(";"),
      this.fontOf(place),
      context,
    ].join("\u0000"));
  }
}

/** Whether KaTeX left places in a typeset formula for its line to break it (a
 * display formula stands on a line of its own: its box goes by its width). */
export function typesetFormulaBreaks(preview: HTMLElement): boolean {
  if (preview.classList.contains("math-block-preview") || preview.hasAttribute(INLINE_DISPLAY_MATH_ATTR)) return false;
  return preview.querySelectorAll(".katex-html > .base").length > 1;
}

/** The keys of `block`'s formulas, in its previews' order. */
export function formulaKeysOf(block: HTMLElement, width: number, keys: FormulaKeys): (number | null)[] {
  return mathPreviews(block).map((preview) => keyOfSafely(keys, preview, block, width));
}

function keyOfSafely(keys: FormulaKeys, preview: HTMLElement, block: HTMLElement, width: number): number | null {
  try {
    return keys.keyOf(preview, block, width);
  } catch {
    return null;
  }
}

/** What a measured formula is kept as: a broken one has no one box to keep. */
export function formulaBoxOfMeasured(
  geometry: { width: number; height: number; baselineDepth: number; kind: "inline" | "block"; wraps?: boolean },
  breaks: boolean,
  /** formulaLeavesItsLine of its preview, as measured. */
  leavesLine = false,
): FormulaBox | null {
  if (geometry.wraps) return null;
  // An in-line formula on Word's box within one slot of the line grid adds
  // nothing to its line (formulaLeavesItsLine): its height of 0 is what it
  // measures wherever it is drawn. Refused as "drew nothing" below, the book's
  // 3,717 such formulas (1,070 different ones) were each typeset in a clone
  // again, in every opening, and their blocks with them.
  if (leavesLine && geometry.kind === "inline" && !breaks && geometry.width > 0 && geometry.height === 0 && geometry.baselineDepth === 0) {
    return { width: geometry.width, height: 0, baselineDepth: 0, kind: "inline", breaks: false, leavesLine: true };
  }
  // A formula read where it drew nothing (its clone not laid out, a face not
  // drawn yet) has no box: kept, it stood as a box of no height in every
  // later opening (WebKit, the book's part 4: a paragraph of four lines laid
  // out as two). It is measured again where it stands.
  if (!(geometry.width > 0 && geometry.height > 0)) return null;
  return { width: geometry.width, height: geometry.height, baselineDepth: geometry.baselineDepth, kind: geometry.kind, breaks };
}

/**
 * Whether a typeset in-line formula leaves its line to the words: one on
 * Word's box (data-word-math-box) that fits one slot of the line grid takes a
 * negative block margin of a thousand pitches (note-editor.css), so the line
 * box does not see it. Read from its computed style, which no drawing changes
 * (a WebKit clone that drew nothing still reads its stylesheet's margin).
 * `window.__docsMathKeepLineless = false` keeps none of them (A/B).
 */
export function formulaLeavesItsLine(preview: HTMLElement): boolean {
  if (!preview.hasAttribute("data-word-math-box") || preview.classList.contains("math-block-preview") || preview.hasAttribute(INLINE_DISPLAY_MATH_ATTR)) return false;
  const win = preview.ownerDocument.defaultView as (Window & { __docsMathKeepLineless?: boolean }) | null;
  if (!win || win.__docsMathKeepLineless === false) return false;
  return Number.parseFloat(win.getComputedStyle(preview).marginTop) < 0;
}

/** Formulas of the kinds whose boxes the editor's math rules decide. */
const TYPESETTER_PROBES: readonly { latex: string; display: "inline" | "block" }[] = [
  { latex: "x", display: "inline" },
  { latex: "\\frac{a+b}{c^2}", display: "inline" },
  { latex: "\\sum_{i=1}^{n} x_i = \\sqrt{y}", display: "inline" },
  { latex: "\\mathbb{R}\\mathcal{L}\\mathfrak{g}\\mathsf{s}\\mathtt{t}\\mathscr{K}", display: "inline" },
  { latex: "\\left(\\begin{matrix} a & b \\\\ c & d \\end{matrix}\\right)", display: "inline" },
  // Word's own spacing of an imported formula (brackets as one atom, a colon as
  // punctuation, italic correction between letters, a closing operator's space):
  // a change to any of these moves this box, and nothing kept is used after it.
  { latex: "f\\left(x\\right):ab+xy^{2}-", display: "inline" },
  { latex: "\\frac{a+b}{c^2}", display: "block" },
  { latex: "\\int_0^1 f(x)\\,dx = \\prod_{k} \\hat{N}_k", display: "block" },
];

function probeBlock(doc: Document, probe: (typeof TYPESETTER_PROBES)[number]): HTMLElement {
  const block = doc.createElement(probe.display === "block" ? "div" : "p");
  // The document's own settings must not divide the kept boxes: its font and
  // grid are in each formula's key.
  block.style.cssText = "margin:0;padding:0;font:400 16px/19px Georgia,serif;letter-spacing:normal;word-spacing:normal;--doc-grid-pitch:initial;";
  const wrapper = doc.createElement(probe.display === "block" ? "div" : "span");
  wrapper.className = probe.display === "block" ? "math-block-wrapper" : "inline-math-wrapper";
  const preview = doc.createElement(probe.display === "block" ? "div" : "span");
  preview.className = probe.display === "block" ? "math-block-preview" : "inline-math-preview";
  preview.setAttribute("data-math-style", "office");
  preview.setAttribute("data-math-pending", "true");
  preview.textContent = probe.latex;
  if (probe.display === "block") applyWordDisplayMathBox(preview, probe.latex);
  else applyWordInlineMathBox(preview, probe.latex);
  wrapper.append(preview);
  block.append(wrapper);
  return block;
}

/**
 * What typesets formulas here and now, by what it does (see the top of this
 * file). Null when it could not be told: nothing is read or kept then.
 */
export async function typesetterOf(view: EditorView, cancelled: () => boolean): Promise<string | null> {
  const doc = view.dom.ownerDocument;
  const blocks = TYPESETTER_PROBES.map((probe) => probeBlock(doc, probe));
  let read: string | null = null;
  const done = await measureTypesetCloneBlockHeights(
    view.dom,
    cancelled,
    blocks.map((_block, index) => index),
    undefined,
    "body",
    {
      parent: view.dom.parentElement ?? doc.body,
      sourceBlocks: blocks,
      sourceBlockWidths: blocks.map(() => 600),
      geometryOnly: true,
      onTypesetBatch: (clones) => {
        read = measureTypesetMathPlaceholderGeometriesForBlocks(clones)
          .flat()
          .map((box) => `${Math.round(box.width * 1000)},${Math.round(box.height * 1000)},${Math.round(box.baselineDepth * 1000)}`)
          .join(";");
      },
    },
  ).catch(() => null);
  if (!done || !read) return null;
  const scale = doc.defaultView?.devicePixelRatio ?? 1;
  return mathGeometryHashNumber(
    [FORMULA_BOX_VERSION, katex.version, doc.defaultView?.navigator.userAgent ?? "", scale, read].join("|"),
  ).toString(36);
}
