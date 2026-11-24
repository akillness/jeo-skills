/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../../../lib/office-units";
/** The size Word gives a run that states none: the nearest paragraph style in
 * the chain that states one, else the document defaults, else 10pt. Null when
 * the chain cannot be read. Display resolution only: nothing is written back
 * to the source, which keeps stating no size.
 */
/** Whether a paragraph has no character of its own: nothing, or only markers
 * that take no room on the line (a rendered page break, a bookmark). Word sets
 * such a line in its paragraph mark (corpus R280-D09: a page's first paragraph,
 * 18.5 pt by its style, its one run a `w:lastRenderedPageBreak`). */
const TEXTLESS_LINE_MARKERS = new Set(["sourcePageBreak", "bookmarkPoint"]);
export function paragraphHoldsNoText(block: {
  childCount: number;
  child(index: number): { type: { name: string } };
}): boolean {
  for (let index = 0; index < block.childCount; index += 1) {
    if (!TEXTLESS_LINE_MARKERS.has(block.child(index).type.name)) return false;
  }
  return true;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const inheritedSizes = new WeakMap<object, Map<string, number | null>>();
export function documentStyleFontSizePx(docAttrs: Record<string, unknown>, block: { attrs: Record<string, unknown> }): number | null {
  const defs = record(docAttrs.styleDefinitions), id = block.attrs.docxStyleId;
  if (!defs || typeof id !== "string" || defs.version !== 1 || !Array.isArray(defs.styles) || defs.styles.length > 512)
    return null;
  let sizes = inheritedSizes.get(defs);
  if (!sizes) inheritedSizes.set(defs, (sizes = new Map()));
  if (sizes.has(id)) return sizes.get(id)!;
  const styles = new Map<string, Record<string, unknown>>();
  for (const raw of defs.styles) {
    const style = record(raw);
    if (style && typeof style.styleId === "string" && !styles.has(style.styleId)) styles.set(style.styleId, style);
  }
  const halfPoints = (rPr: unknown): number | null | undefined => {
    const value = record(rPr)?.fontSizeHalfPoints;
    if (value == null) return undefined;
    return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
  };
  let resolved: number | null | undefined;
  const seen = new Set<string>();
  for (let current: unknown = id; resolved === undefined && current != null;) {
    const style = typeof current === "string" && !seen.has(current) ? styles.get(current) : undefined;
    if (!style || style.type !== "paragraph") { resolved = null; break; }
    seen.add(current as string);
    resolved = halfPoints(style.rPr);
    current = style.basedOn;
  }
  if (resolved === undefined) resolved = halfPoints(record(defs.docDefaults)?.rPr);
  const px = resolved === undefined ? ptToPx(10) : resolved === null ? null : ptToPx(resolved / 2);
  sizes.set(id, px);
  return px;
}

const ownSizes = new WeakMap<object, Map<string, number | null>>();

/** The size a style of the paragraph's own chain states, short of the
 * document's default paragraph style, whose size the page already carries.
 * Null when none does. A blank paragraph has no run to carry a size mark, so
 * this is the height of its line (Word 16.86, corpus R280-D09: a Body Text
 * style's 18.5 pt draws the blank lines between the steps at 18.5 pt). A chain
 * that ends without reaching that default style is based on nothing: its size is
 * the document defaults' (corpus R280-D25: "No Spacing" with no `w:basedOn`
 * draws its blank lines at the defaults' 11 pt, not Normal's 9 pt, and every
 * one stood 2.4 pt short). */
export function documentOwnStyleFontSizePx(docAttrs: Record<string, unknown>, block: { attrs: Record<string, unknown> }): number | null {
  const defs = record(docAttrs.styleDefinitions), id = block.attrs.docxStyleId;
  if (!defs || typeof id !== "string" || defs.version !== 1 || !Array.isArray(defs.styles) || defs.styles.length > 512)
    return null;
  let sizes = ownSizes.get(defs);
  if (!sizes) ownSizes.set(defs, (sizes = new Map()));
  if (sizes.has(id)) return sizes.get(id)!;
  const styles = new Map<string, Record<string, unknown>>();
  for (const raw of defs.styles) {
    const style = record(raw);
    if (style && typeof style.styleId === "string" && !styles.has(style.styleId)) styles.set(style.styleId, style);
  }
  let px: number | null = null;
  const seen = new Set<string>();
  for (let current: unknown = id; typeof current === "string" && !seen.has(current);) {
    const style = styles.get(current);
    if (!style || style.type !== "paragraph" || style.default === true) break;
    seen.add(current);
    const value = record(style.rPr)?.fontSizeHalfPoints;
    if (value != null) {
      px = Number.isInteger(value) && (value as number) > 0 ? ptToPx((value as number) / 2) : null;
      break;
    }
    if (style.basedOn == null) {
      const defaults = record(record(defs.docDefaults)?.rPr)?.fontSizeHalfPoints;
      px = defaults == null ? ptToPx(10)
        : Number.isInteger(defaults) && (defaults as number) > 0 ? ptToPx((defaults as number) / 2) : null;
      break;
    }
    current = style.basedOn;
  }
  sizes.set(id, px);
  return px;
}
