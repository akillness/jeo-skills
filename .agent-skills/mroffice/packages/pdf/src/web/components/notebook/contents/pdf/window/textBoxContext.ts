/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  isPdfFormulaTextBoxContextCandidate,
} from "../../../../../lib/pdf/text-box-context";
import type { PdfTextBoxCommandTarget } from "../PdfTextEditor";

export const PDF_COMMAND_TEXT_BOX_CONTEXT_LIMIT = 12;

export const PDF_COMMAND_TEXT_BOX_LANDMARK_LIMIT = 3;
export const PDF_DEGRADED_TEXT_PREVIEW_LIMIT = 800;
// Mirrors the selection-action transport ceiling. Preserve both ends so a long
// PDF page cannot silently lose conclusions, totals, or footnotes.
export const PDF_AI_SUMMARY_SOURCE_MAX_CHARS = 20_000;

export function compactPdfAiSummarySource(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= PDF_AI_SUMMARY_SOURCE_MAX_CHARS) {
    return { text, truncated: false };
  }
  const marker = "\n…[PDF page middle omitted from summary input]…\n";
  const bodyChars = PDF_AI_SUMMARY_SOURCE_MAX_CHARS - marker.length;
  const headChars = Math.ceil(bodyChars * 0.65);
  return {
    text: `${text.slice(0, headChars)}${marker}${text.slice(
      -(bodyChars - headChars),
    )}`,
    truncated: true,
  };
}

export function pdfTextBoxContextPriority(box: PdfTextBoxCommandTarget): number {
  let score = 0;
  if (box.edited) score += 1000;
  if (box.created) score += 900;
  if (isPdfFormulaTextBoxContextCandidate(box)) score += 800;
  if (/[=<>∑∫√πλμσ∞±×÷^_{}]/.test(box.text)) score += 80;
  return score;
}

export function informativePdfTextLength(text: string): number {
  return Array.from(
    text.replace(/[\s#>*_`~|:：,，.。;；!！?？()[\]{}"'“”‘’、/\\-]/g, ""),
  ).length;
}

export function medianPdfTextBoxFontSize(boxes: PdfTextBoxCommandTarget[]): number {
  const sizes = boxes
    .map((box) => box.fontSize)
    .filter(
      (fontSize): fontSize is number =>
        typeof fontSize === "number" &&
        Number.isFinite(fontSize) &&
        fontSize > 0,
    )
    .sort((a, b) => a - b);
  if (sizes.length === 0) return 0;
  return sizes[Math.floor(sizes.length / 2)];
}

export function isPdfTextBoxReadingLandmark(
  box: PdfTextBoxCommandTarget,
  index: number,
  medianFontSize: number,
): boolean {
  if (isPdfFormulaTextBoxContextCandidate(box)) return false;
  if (informativePdfTextLength(box.text) < 4) return false;
  if (index < PDF_COMMAND_TEXT_BOX_LANDMARK_LIMIT) return true;
  if (box.y <= 0.22 && informativePdfTextLength(box.text) >= 8) return true;
  return (
    medianFontSize > 0 &&
    typeof box.fontSize === "number" &&
    box.fontSize >= medianFontSize * 1.25
  );
}

/** The most of a box's text its context entry carries (the model reads the
 * circled words whole from the selection; an entry names its box). */
export const PDF_COMMAND_TEXT_BOX_TEXT_LIMIT = 240;

/** One text box as the Copilot command context describes it. */
export function pdfCommandTextBoxContextEntry(box: PdfTextBoxCommandTarget) {
  const formulaCandidate = isPdfFormulaTextBoxContextCandidate(box);
  return {
    id: box.id,
    page: box.page,
    text: box.text.trim().slice(0, PDF_COMMAND_TEXT_BOX_TEXT_LIMIT),
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fontSize: box.fontSize,
    fontFamily: box.fontFamily,
    sourceFontName: box.sourceFontName,
    bold: box.bold,
    italic: box.italic,
    kind: formulaCandidate
      ? "formula"
      : box.kind === "formula" || box.kind === "text"
        ? "text"
        : undefined,
    latex: formulaCandidate ? box.latex?.trim().slice(0, 2000) : undefined,
    edited: box.edited,
    created: box.created,
    // What a change of font has to know of a box someone made
    // (lib/pdf/copilot-text-font).
    ...(box.officeFamily ? { officeFamily: box.officeFamily } : {}),
    ...(box.annotation ? { annotation: true } : {}),
  };
}

/** Every text box of the page, for a circle to pick from (browser-only:
 * only the circled ones are sent). */
export const PDF_CIRCLE_TEXT_BOX_POOL_LIMIT = 400;







export function pdfCommandTextBoxWholeTexts(
  boxes: readonly PdfTextBoxCommandTarget[],
): Record<string, string> | null {
  const whole: Record<string, string> = {};
  for (const box of boxes.slice(0, PDF_CIRCLE_TEXT_BOX_POOL_LIMIT)) {
    const text = box.text.trim();
    if (text.length > PDF_COMMAND_TEXT_BOX_TEXT_LIMIT) whole[box.id] = text;
  }
  return Object.keys(whole).length ? whole : null;
}

export function selectPdfCommandTextBoxesForContext(
  boxes: PdfTextBoxCommandTarget[],
): PdfTextBoxCommandTarget[] {
  const indexed = boxes.map((box, index) => ({
    box,
    index,
    priority: pdfTextBoxContextPriority(box),
  }));
  const selected = new Map<string, (typeof indexed)[number]>();
  const add = (item: (typeof indexed)[number]): void => {
    if (selected.size >= PDF_COMMAND_TEXT_BOX_CONTEXT_LIMIT) return;
    if (!selected.has(item.box.id)) selected.set(item.box.id, item);
  };

  indexed
    .filter(({ box }) => isPdfFormulaTextBoxContextCandidate(box))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .forEach(add);

  const medianFontSize = medianPdfTextBoxFontSize(boxes);
  indexed
    .filter(({ box, index }) =>
      isPdfTextBoxReadingLandmark(box, index, medianFontSize),
    )
    .slice(0, PDF_COMMAND_TEXT_BOX_LANDMARK_LIMIT)
    .forEach(add);

  indexed
    .filter(
      ({ box }) =>
        (box.edited || box.created) &&
        !isPdfFormulaTextBoxContextCandidate(box),
    )
    .forEach(add);

  indexed
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .forEach(add);

  return Array.from(selected.values())
    .sort((a, b) => a.index - b.index)
    .map((item) => item.box);
}

export type PdfTextContextSource =
  | "text_layer"
  | "annotation_draft"
  | "annotation"
  | "page_plain_text"
  | "filename"
  | "empty";

export interface PdfTextContext {
  source: PdfTextContextSource;
  text: string;
}
