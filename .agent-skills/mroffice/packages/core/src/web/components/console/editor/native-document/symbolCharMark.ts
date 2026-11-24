/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The `symbolChar` mark — a Word *symbol character*'s identity.
 *
 * ECMA-376 §17.3.3.30: a symbol character "does not use any of the run fonts
 * specified in the rFonts element … this character shall be determined by
 * pulling the character with the hexadecimal value specified in the char
 * attribute from the font specified in the font attribute", and is serialized as
 * `<w:sym w:font="…" w:char="…"/>` in place of `<w:t>`.
 *
 * MRAI models that as a MARK on a one-character text node rather than as an atom
 * node, for three reasons:
 *   - The document text keeps the character, so search, word count, read-aloud,
 *     pagination, and plain-text extraction all see it with no new special case.
 *   - Character formatting (size, colour, bold, highlight) composes with it the
 *     way Word composes rPr with w:sym.
 *   - Two adjacent symbols with DIFFERENT (font, char) cannot merge, because
 *     ProseMirror only merges text nodes whose mark sets are equal — so the run
 *     splits exactly where Word splits it.
 *
 * The mark is NOT in `CLEARABLE_TEXT_STYLE_MARKS`: Clear All Formatting resets a
 * symbol's font in Word but never un-makes the symbol character, because
 * `w:sym` is content, not run properties.
 */

import { Mark } from "@tiptap/core";

import {
  SYMBOL_CHAR_MARK,
  normalizeSymbolCharAttrs,
} from "../../../../lib/office-symbols";

export { SYMBOL_CHAR_MARK, normalizeSymbolCharAttrs };
export type { SymbolCharMarkAttrs } from "../../../../lib/office-symbols";

/**
 * The mark. `renderHTML` writes the identity to data attributes AND applies the
 * font, so the glyph renders from the right face in the editor, in the HTML
 * export, and in the paged projection — and so a copy/paste of the symbol back
 * into the editor reconstructs the mark from the same attributes.
 */
/**
 * The faces a symbol character is drawn in: its font, then, for Symbol, the
 * web face of Symbol's own encoding (`MRAI Symbol PUA`, note-editor.css).
 * Word stores a Symbol character shifted into U+F020-U+F0FF and draws it
 * from Symbol's table; the Mac's Symbol has no glyph there, and as a local
 * face it shadows the web Symbol office-fonts.css declares, so the browser
 * painted a notdef box (corpus R283-D02: "16 µm" drawn "16 □m").
 */
function symbolFontStack(font: string): string {
  const family = `"${font.replaceAll('"', "")}"`;
  return font.trim().toLowerCase() === "symbol" ? `${family}, "MRAI Symbol PUA"` : family;
}

export const SymbolCharMark = Mark.create({
  name: SYMBOL_CHAR_MARK,

  // A symbol character's identity travels with the character; it must not be
  // inclusive at the ends, or typing next to an inserted Wingdings glyph would
  // silently turn the newly typed letters into Wingdings symbol characters too.
  inclusive: false,

  addAttributes() {
    return {
      font: { default: null, rendered: false },
      charCode: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-symbol-font]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const normalized = normalizeSymbolCharAttrs({
            font: element.getAttribute("data-symbol-font"),
            charCode: element.getAttribute("data-symbol-char"),
          });
          return normalized ?? false;
        },
      },
    ];
  },

  renderHTML({ mark }) {
    const normalized = normalizeSymbolCharAttrs(mark.attrs);
    // An unusable mark renders as a bare span rather than throwing: the
    // CHARACTER must still reach the reader even when its identity is junk.
    if (!normalized) return ["span", {}, 0];
    return [
      "span",
      {
        "data-symbol-font": normalized.font,
        "data-symbol-char": normalized.charCode,
        // Quote the family: a symbol font name may contain a space
        // ("Wingdings 2"). The value is gated by normalizeSymbolFont, which
        // rejects control characters, and a quote inside the name would only
        // invalidate this one declaration — it cannot escape into another.
        style: `font-family: ${symbolFontStack(normalized.font)}`,
      },
      0,
    ];
  },
});
