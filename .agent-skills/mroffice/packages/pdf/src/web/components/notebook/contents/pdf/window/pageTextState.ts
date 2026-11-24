/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfNativeTextRunTarget } from "../../PDFViewer";
import type {
  PdfNativeTextLayoutDraft,
} from "../PdfNativeListTextEditDialog";
import type { PdfTextBoxCommandTarget } from "../PdfTextEditor";
import type { PdfTextBoxEdit } from "../PdfTextBoxOverlay";

export const EMPTY_PDF_NATIVE_TEXT_RUN_TARGETS: readonly PdfNativeTextRunTarget[] =
  Object.freeze([]);

export type PdfPageTextState = {
  page: number;
  text: string;
  /**
   * Text the inline editor derived from its own boxes and edits. It feeds
   * search and AI context but must not flow back to the editor as a page
   * text hint: the hint drives page re-extraction, and re-extracting while a
   * box is being typed into remounts the overlay under the caret.
   */
  origin?: "editor";
};
export type PdfPageTextBoxTargetsState = {
  page: number;
  boxes: PdfTextBoxCommandTarget[];
};

const STRONG_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/gu;
const STRONG_LTR = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/gu;
const PRESENTATION_FORM = /[\uFB50-\uFDFF\uFE70-\uFEFF]/gu;

/** Whether a text's letters are mostly of a right-to-left script. */
export function rightToLeftText(text: string): boolean {
  const rtl = text.match(STRONG_RTL)?.length ?? 0;
  return rtl > 0 && rtl > (text.match(STRONG_LTR)?.length ?? 0);
}

/** Arabic presentation forms (a letter's initial, medial or final shape, a
 * ligature) as the letters they draw, which a browser joins again. */
export function spellPresentationForms(text: string): string {
  return text.replace(PRESENTATION_FORM, (form) => form.normalize("NFKC"));
}

export function pdfNativeTextLayoutDraftToEdit(input: {
  replacementText: string;
  layout: PdfNativeTextLayoutDraft;
  existing?: PdfTextBoxEdit | null;
  backgroundColor?: string;
  kind?: "text" | "formula";
}): PdfTextBoxEdit {
  const { layout } = input;
  if (typeof layout.color !== "string" || !/^#[0-9a-f]{6}$/i.test(layout.color)) {
    throw new Error("The text color must be a verified #RRGGBB value.");
  }
  // A glyph whose ToUnicode is U+0000 (a bullet set in a symbol face) draws
  // nothing in a text box -- no face has it -- and a managed box may not hold
  
  
  
  // (Not a space in its place: set in the next run's face it was wider than
  // the glyph, and the line's last character wrapped onto the line under it.)
  const visible = (text: string) => text.replaceAll("\u0000", "");
  const dropsGlyphs = input.replacementText.includes("\u0000") && visible(input.replacementText).trim().length > 0;
  // Right-to-left words come from the page in the forms its glyphs drew
  // (Arabic presentation forms: an initial, a medial, a final letter): set
  // as text in a box those letters no longer join, and انواع read انوا ع.
  // The box holds the letters themselves and is set from the right (WPS
  
  const rtl = rightToLeftText(input.replacementText);
  const letters = (text: string) => rtl ? spellPresentationForms(text) : text;
  const replacementText = letters(dropsGlyphs ? visible(input.replacementText) : input.replacementText);
  const layoutRuns = (dropsGlyphs || rtl) && layout.runs
    ? layout.runs.map((run) => ({ ...run, text: letters(dropsGlyphs ? visible(run.text) : run.text) }))
      .filter((run) => run.text.length > 0)
    : layout.runs;
  return {
    ...(input.existing ?? {}),
    id: layout.id,
    page: layout.page,
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    angle: layout.angle,
    text: replacementText,
    fontSize: layout.fontSize,
    color: layout.color,
    align: rtl && (layout.align === undefined || layout.align === "left") ? "right" : layout.align,
    ...(layout.fontFamily ? { fontFamily: layout.fontFamily } : {}),
    ...(layout.sourceFontName
      ? { sourceFontName: layout.sourceFontName }
      : {}),
    bold: layout.bold,
    italic: layout.italic,
    ...(layout.underline !== undefined ? { underline: layout.underline } : {}),
    ...(layout.strikethrough !== undefined ? { strikethrough: layout.strikethrough } : {}),
    ...(layout.justify !== undefined ? { justify: layout.justify } : {}),
    
    ...(layout.characterSpacing !== undefined ? { characterSpacing: layout.characterSpacing } : {}),
    ...(layout.wordSpacing !== undefined ? { wordSpacing: layout.wordSpacing } : {}),
    ...(layout.horizontalScale !== undefined ? { horizontalScale: layout.horizontalScale } : {}),
    
    ...("verticalAlign" in layout ? { verticalAlign: layout.verticalAlign } : {}),
    originX: layout.originX,
    originY: layout.originY,
    originWidth: layout.originWidth,
    originHeight: layout.originHeight,
    // A one-line source kept as one line states its row; any other draft
    // leaves the box to wrap (an old row plan would set it as one row).
    lineLayout: layout.lineLayout && replacementText === input.replacementText ? [...layout.lineLayout] : undefined,
    backgroundColor: input.backgroundColor,
    ...(input.kind ? { kind: input.kind } : {}),
    
    // else keeps the box's own, while they still spell its text.
    ...("runs" in layout
      ? { runs: layoutRuns ? [...layoutRuns] : undefined }
      : { runs: input.existing?.runs && input.existing.runs.map((run) => run.text).join("") ===
          replacementText ? input.existing.runs : undefined }),
    ...("officeFamily" in layout ? { officeFamily: layout.officeFamily } : {}),
    // Converted to an equation: the box is that formula (its words kept as
    // its text, its LaTeX what is drawn), set in no row or run of its own.
    ...(layout.formulaLatex
      ? { kind: "formula" as const, latex: layout.formulaLatex, lineLayout: undefined, runs: undefined,
          characterSpacing: undefined, wordSpacing: undefined, horizontalScale: undefined }
      : {}),
    // A source-glyph edit that grows, wraps, resizes, or rotates cannot remain
    // a JSON-only flatten overlay: page autosave intentionally rejects those
    // as `no_supported_pdf_changes`. Promote it to the existing managed
    
    // and the editor closes only after a real PDF ResourceVersion receipt.
    created: true,
    deleted: false,
  };
}
