/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's "Automatic" font colour on shading.
 *
 * Text whose colour is Automatic (`w:color w:val="auto"` or no colour at all)
 * is painted white when the shading behind it is dark and black otherwise
 * (Font > Font color > Automatic). Word decides by the shading's luma: in a
 * Word 16 for Mac PDF probe 3A3A3A, C00000, 0000FF, 000080, 600000 and 500050
 * turned the text white; 3C3C3C, D00000, 404040, 008000, 2F5496 and 7030A0
 * kept it black, which is Rec. 601 luma below 59 (between 58 and 60).
 *
 * The nearest SHADING decides: run shading (`w:rPr/w:shd`), then paragraph
 * shading, then cell shading. A highlight (`w:highlight`) never does: dark
 * blue highlight keeps black text, and a yellow highlight inside a dark
 * paragraph shading shows white text. An explicit colour never flips.
 *
 * Elements carry `data-word-auto-text="light" | "dark"`; note-editor.css
 * paints Automatic text from it at zero specificity so any explicit colour
 * (a run's textColor, a style's colour, a table style's colour) still wins.
 */

export type WordAutoTextTone = "light" | "dark";

export const WORD_AUTO_TEXT_ATTRIBUTE = "data-word-auto-text";

/** Word's Rec. 601 luma threshold below which Automatic text turns white. */
const WORD_AUTO_TEXT_DARK_LUMA = 59;

export function wordAutoTextTone(fill: unknown): WordAutoTextTone | null {
  if (typeof fill !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(fill.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
  return luma < WORD_AUTO_TEXT_DARK_LUMA ? "light" : "dark";
}

type ColorNormalizer = (value: string) => string | null;

function colorNormalizer(doc: Document): ColorNormalizer | null {
  const canvas = doc.createElement("canvas");
  let context: CanvasRenderingContext2D | null = null;
  try { context = canvas.getContext("2d"); } catch { context = null; }
  if (!context) return null;
  const ctx = context;
  return (value) => {
    const text = value.trim();
    if (!text) return null;
    // An invalid colour leaves fillStyle unchanged: compare against a sentinel.
    ctx.fillStyle = "#010203";
    ctx.fillStyle = text;
    const out = String(ctx.fillStyle).toLowerCase();
    return out === "#010203" && text.toLowerCase() !== "#010203" ? null : out;
  };
}

/**
 * Whether Font Color > Automatic must write Word's direct `w:color auto`.
 *
 * Automatic is a colour of its own in Word: choosing it writes `w:color
 * w:val="auto"` on the runs, which overrides a colour the paragraph style or
 * the table style gives them, and then follows the shading (white on a dark
 * cell). Removing the run's colour instead hands the text back to that style
 * colour: Automatic text on a black cell of a styled table stayed black
 * (live Word audit WUA 117). Removing is still right where the text would
 * inherit the Automatic colour anyway, so this asks the laid-out paragraphs:
 * a selected paragraph whose inherited colour differs from the Automatic
 * colour at its place needs the direct value.
 */
export function selectionInheritsNonAutomaticColor(view: {
  state: { selection: { ranges: readonly { $from: { pos: number }; $to: { pos: number } }[] }; doc: { nodesBetween: (from: number, to: number, f: (node: { isTextblock: boolean }, pos: number) => boolean | void) => void } };
  nodeDOM: (pos: number) => Node | null;
  dom: HTMLElement;
}): boolean {
  const doc = view.dom.ownerDocument;
  const win = doc?.defaultView;
  if (!doc || !win) return false;
  const normalize = colorNormalizer(doc);
  if (!normalize) return false;
  let differs = false;
  let checked = 0;
  for (const range of view.state.selection.ranges) {
    const from = range.$from.pos;
    const to = Math.max(range.$to.pos, from + 1);
    view.state.doc.nodesBetween(from, to, (node, pos) => {
      if (differs || checked >= 400) return false;
      if (!node.isTextblock) return true;
      checked += 1;
      const element = view.nodeDOM(pos);
      if (!(element instanceof win.HTMLElement)) return false;
      const style = win.getComputedStyle(element);
      const inherited = normalize(style.color);
      const automatic = normalize(style.getPropertyValue("--docs-auto-text-color"));
      if (inherited && automatic && inherited !== automatic) differs = true;
      return false;
    });
    if (differs) break;
  }
  return differs;
}

/** renderHTML fragment carrying the Automatic-colour tone of a shading fill. */
export function wordAutoTextAttributes(
  fill: unknown,
): Record<typeof WORD_AUTO_TEXT_ATTRIBUTE, WordAutoTextTone> | Record<string, never> {
  const tone = wordAutoTextTone(fill);
  return tone ? { [WORD_AUTO_TEXT_ATTRIBUTE]: tone } : {};
}
