/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * An imported Word formula drawn at Word's width. KaTeX's Computer Modern
 * letters are not Cambria Math's: a capital is up to a fifth wider (G 0.786em
 * here, 0.630em in Word), a small letter often narrower (g 0.477em, 0.612em).
 * With Word's spacing (officeMathSpacing) the book's formulas still ran 4.7%
 * wider than Word's, and lines Word fills broke here (page 62's "...时，G =
 * Z(G)。", 1 px over its column).
 *
 * The width Word gives a formula is KaTeX's layout with each symbol at
 * Cambria Math's advance (officeMathGlyphs; a symbol not measured keeps its
 * own). When that is narrower, the formula is drawn narrower by that ratio:
 * each of its pieces (`.base`, where an in-line formula may break) is given
 * its share of the width and its drawing is scaled into it. Never by more than
 * a tenth: a formula Word sets narrower still (a lone capital: 0.83) keeps
 * KaTeX's width, and the line may break where Word's does not. Never wider.
 *
 * Read from KaTeX's own tree, with no layout: the same on every opening.
 */

import katex from "katex";

import { katexNodeWidth, katexSymbolAdvance, type KatexTreeNode } from "../../../../lib/katex-tree-width";
import { CAMBRIA_MATH_ADVANCE_EM } from "./officeMathGlyphs";

/** The narrowest a formula is drawn, against KaTeX's width. */
export const OFFICE_MATH_MIN_SCALE = 0.9;
/** An italic letter's correction under data-math-style="office" (note-editor.css). */
const OFFICE_ITALIC_EM = 0.025;
const FAMILIES = ["mathnormal", "mathbb", "amsrm", "mathcal", "mathscr", "mathfrak", "mathsf", "mathbf", "boldsymbol", "mathrm"];

export interface OfficeMathFit {
  /** Word's width over KaTeX's. */
  readonly scale: number;
  /** Each `.base`'s width as drawn (em of the formula's font), in order. */
  readonly basesEm: readonly number[];
}

const has = (node: KatexTreeNode | null, name: string) => Boolean(node?.classes?.includes(name));

/** The stylesheet's italic correction for an office formula's letter. */
function officeItalic(node: KatexTreeNode, next: KatexTreeNode | null): number {
  if (!has(node, "mathnormal")) return Math.max(0, node.italic ?? 0);
  if (has(next, "msupsub")) return Math.max(0, node.italic ?? 0);
  return has(next, "mathnormal") ? 0 : OFFICE_ITALIC_EM;
}

function wordAdvance(node: KatexTreeNode): number {
  const own = katexSymbolAdvance(node);
  const characters = [...(node.text ?? "")];
  if (characters.length !== 1) return own;
  const family = node.classes?.find((name) => FAMILIES.includes(name)) ?? "main";
  return CAMBRIA_MATH_ADVANCE_EM[family]?.[characters[0]] ?? own;
}

/** A symbol as an office formula draws it here: KaTeX's advance and the stylesheet's italic correction. */
export const drawnHere = (node: KatexTreeNode, next: KatexTreeNode | null) => katexSymbolAdvance(node) + officeItalic(node, next);
const drawnInWord = (node: KatexTreeNode, next: KatexTreeNode | null) => wordAdvance(node) + officeItalic(node, next);

const fits = new Map<string, OfficeMathFit | null>();
const FITS_KEPT = 4096;

/**
 * How `source` (what KaTeX draws an in-line office formula from, rendered with
 * `options`) is fitted to Word's width, or null when it is drawn as KaTeX
 * draws it (as wide as Word's or wider than a tenth past it, or unreadable).
 */
export function officeMathFit(source: string, options: katex.KatexOptions): OfficeMathFit | null {
  const known = fits.get(source);
  if (known !== undefined) return known;
  let fit: OfficeMathFit | null = null;
  try {
    const render = (katex as unknown as {
      __renderToHTMLTree?: (expression: string, options: katex.KatexOptions) => KatexTreeNode;
    }).__renderToHTMLTree;
    const html = render?.(source, options)?.children?.find((child) => has(child, "katex-html"));
    const bases = (html?.children ?? []).filter((child) => has(child, "base"));
    const here = bases.map((base, index) => katexNodeWidth(base, 1, drawnHere, bases[index + 1] ?? null));
    const word = bases.reduce((sum, base, index) => sum + katexNodeWidth(base, 1, drawnInWord, bases[index + 1] ?? null), 0);
    const total = here.reduce((sum, width) => sum + width, 0);
    const scale = total > 0 ? word / total : 1;
    if (bases.length && scale >= OFFICE_MATH_MIN_SCALE && scale < 0.995) fit = { scale, basesEm: here };
    else noteRefusal(scale);
  } catch {
    fit = null;
  }
  if (fits.size >= FITS_KEPT) fits.clear();
  fits.set(source, fit);
  return fit;
}

/** Harness count (`window.__docsOfficeMathFit = {}`): formulas Word sets more
 * than a tenth narrower, drawn at KaTeX's width. */
function noteRefusal(scale: number): void {
  if (!(scale < OFFICE_MATH_MIN_SCALE) || typeof window === "undefined") return;
  const tally = (window as Window & { __docsOfficeMathFit?: { refused?: number } }).__docsOfficeMathFit;
  if (tally) tally.refused = (tally.refused ?? 0) + 1;
}

/** Draw the typeset formula in `el` at its fit (each piece its width, its drawing scaled into it). */
export function applyOfficeMathFit(el: HTMLElement, fit: OfficeMathFit | null): void {
  const bases = el.querySelectorAll<HTMLElement>(":scope > .katex > .katex-html > .base");
  if (!fit || bases.length !== fit.basesEm.length) return;
  bases.forEach((base, index) => {
    base.style.width = `${Number((fit.basesEm[index] * fit.scale).toFixed(4))}em`;
    base.style.transform = `scaleX(${Number(fit.scale.toFixed(4))})`;
    base.style.transformOrigin = "0 0";
  });
}
