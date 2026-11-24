/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The underline line styles (Word's Font dialog list) and how each is drawn:
 * kept apart from the editor's underline mark (underlineExtension), so a
 * spreadsheet's Format Cells font page reads them without loading the
 * rich-text editor. underlineExtension re-exports them.
 */

/**
 * Underline LINE styles supported end-to-end (editor + DOCX round-trip): Word's
 * Font dialog "Underline style" list (ECMA-376 ST_Underline), keyed by the
 * `<w:u w:val>` token except `wavy`, which the editor has always stored for
 * Word's `wave`. "words" underlines words only (Word skips the spaces); the
 * browser has no such decoration, so it renders as a single line.
 */
export const UNDERLINE_STYLE_VALUES = [
  // Word's "(none)" (ST_Underline none): a direct "no underline" that cancels
  
  "none",
  "single",
  "words",
  "double",
  "thick",
  "dotted",
  "dottedHeavy",
  "dash",
  "dashedHeavy",
  "dashLong",
  "dashLongHeavy",
  "dotDash",
  "dashDotHeavy",
  "dotDotDash",
  "dashDotDotHeavy",
  "wavy",
  "wavyHeavy",
  "wavyDouble",
] as const;
export type UnderlineStyle = (typeof UNDERLINE_STYLE_VALUES)[number];

/**
 * Concrete `text-decoration-style` CSS value for a style (single source of truth
 * for the in-editor render). A fixed developer-authored token — never
 * interpolated with user input — so no CSS injection is possible.
 */
export function underlineStyleToCssDecoration(style: UnderlineStyle): string {
  switch (style) {
    case "double":
    case "wavyDouble":
      return "double";
    case "dotted":
    case "dottedHeavy":
      return "dotted";
    case "dash":
    case "dashedHeavy":
    case "dashLong":
    case "dashLongHeavy":
    case "dotDash":
    case "dashDotHeavy":
    case "dotDotDash":
    case "dashDotDotHeavy":
      // CSS has one dashed decoration; the dot-dash rhythms and long dashes
      // render as dashed and keep their exact token for the DOCX round trip.
      return "dashed";
    case "wavy":
    case "wavyHeavy":
      return "wavy";
    case "single":
    case "words":
    case "thick":
    default:
      return "solid";
  }
}

/** Word's heavy/thick underlines are drawn twice as thick as the single line. */
export function underlineStyleIsHeavy(style: UnderlineStyle): boolean {
  return (
    style === "thick" ||
    style === "dottedHeavy" ||
    style === "dashedHeavy" ||
    style === "dashLongHeavy" ||
    style === "dashDotHeavy" ||
    style === "dashDotDotHeavy" ||
    style === "wavyHeavy"
  );
}
