/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where the ruler is, and what its markers stand for, read off the page.
 *
 * Word's ruler lies over the page it measures: it scales with the zoom, its
 * zero is the page's left margin, and its markers sit where the paragraph's
 * text actually is (Microsoft Support, "Using the ruler in Word"; "Adjust the
 * indent in a bulleted or numbered list on the ruler"):
 * - the left-indent square is the left side of the paragraph and moves the
 *   first-line / hanging indent with it;
 * - the first-line triangle is where the first line starts (left of the
 *   square for a hanging indent);
 * - in a bulleted or numbered list the first-line marker is the number and
 *   the left indent is the text;
 * - the right-indent triangle is the right side of the paragraph.
 *
 * The editor draws a paragraph from several sources: the pt indents, the
 * coarse Tab `indent` level and the legacy em `textIndent`, a list's own
 * indentation (a typed list's padding, or a Word list's item indents), a
 * table cell. So the markers are measured from the rendered paragraph, and a
 * drop is written back as the change it makes to the paragraph's own indents:
 * the Tab level and the em first line fold into the pt indents, so what is
 * dropped is where the text lands.
 */

import { PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import type { EditorView } from "@tiptap/pm/view";

const CSS_PX_PER_POINT = PX_PER_PT;

export type RulerListKind = "none" | "plain" | "native";

export interface RulerParagraphMeasure {
  /** Left side of the paragraph's body (wrapped lines), pt from the left margin. */
  leftPt: number;
  /** First line (or a list item's number) relative to the left side, pt. */
  firstLinePt: number;
  /** Right side of the paragraph, pt from the right margin. */
  rightPt: number;
  /** The paragraph's own left margin as drawn (pt indent or Tab level), pt. */
  ownLeftPt: number;
  list: RulerListKind;
  /** A right-to-left paragraph: its stored left indent (Word's start) is
   * drawn on the right, its right indent (the end) on the left. */
  rtl?: boolean;
}

export interface RulerMeasurement {
  /** Left edge of the page relative to the ruler strip's content box, screen px. */
  offsetPx: number;
  /** Screen px per page px (the page zoom). */
  scale: number;
  /** Page geometry in page px. */
  pageWidthPx: number;
  marginLeftPx: number;
  marginRightPx: number;
  paragraph: RulerParagraphMeasure | null;
}

function px(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPt(pagePx: number): number {
  return Math.round((pagePx / CSS_PX_PER_POINT) * 100) / 100;
}

function paragraphElement(view: EditorView): HTMLElement | null {
  const { $head } = view.state.selection;
  if (!$head.parent.isTextblock || $head.depth < 1) return null;
  const node = view.nodeDOM($head.before());
  return node instanceof HTMLElement ? node : null;
}

/** Read the ruler's placement and the current paragraph's indents off the page. */
export function measureDocumentRuler(
  view: EditorView,
  strip: HTMLElement,
): RulerMeasurement | null {
  const paragraph = paragraphElement(view);
  const sheet =
    paragraph?.closest<HTMLElement>("article[data-page-sheet]") ??
    view.dom.querySelector<HTMLElement>("article[data-page-sheet]");
  if (!sheet || sheet.offsetWidth <= 0) return null;
  const sheetRect = sheet.getBoundingClientRect();
  const scale = sheetRect.width / sheet.offsetWidth;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const sheetStyle = getComputedStyle(sheet);
  const marginLeftPx = px(sheetStyle.paddingLeft);
  const marginRightPx = px(sheetStyle.paddingRight);
  const stripRect = strip.getBoundingClientRect();
  const stripStyle = getComputedStyle(strip);
  const offsetPx =
    sheetRect.left -
    (stripRect.left + px(stripStyle.borderLeftWidth) + px(stripStyle.paddingLeft));
  const contentLeft = sheetRect.left + marginLeftPx * scale;
  const contentRight = sheetRect.right - marginRightPx * scale;
  let measured: RulerParagraphMeasure | null = null;
  if (paragraph && sheet.contains(paragraph)) {
    const rect = paragraph.getBoundingClientRect();
    const style = getComputedStyle(paragraph);
    const bodyLeft =
      (rect.left - contentLeft) / scale +
      px(style.borderLeftWidth) +
      px(style.paddingLeft);
    const right =
      (contentRight - rect.right) / scale +
      px(style.borderRightWidth) +
      px(style.paddingRight);
    let firstLine = px(style.textIndent);
    let list: RulerListKind = "none";
    const item = paragraph.parentElement;
    if (item?.tagName === "LI" && item.firstElementChild === paragraph) {
      if (item.classList.contains("docs-native-list-indent__item")) {
        list = "native";
        firstLine = -px(item.style.getPropertyValue("--docs-native-list-hanging")) * CSS_PX_PER_POINT;
      } else {
        // A typed list draws its number in the list's own left padding.
        list = "plain";
        const container = item.parentElement;
        firstLine = container ? -px(getComputedStyle(container).paddingLeft) : 0;
      }
    }
    measured = {
      leftPt: toPt(bodyLeft),
      firstLinePt: toPt(firstLine),
      rightPt: toPt(right),
      ownLeftPt: toPt(px(style.marginLeft)),
      list,
      ...(style.direction === "rtl" ? { rtl: true } : {}),
    };
  }
  return {
    offsetPx,
    scale,
    pageWidthPx: sheet.offsetWidth,
    marginLeftPx,
    marginRightPx,
    paragraph: measured,
  };
}

export interface RulerIndentPatch {
  indentLeftPt?: number;
  indentRightPt?: number;
  firstLineIndentPt?: number;
  /** The Tab level folded into `indentLeftPt`. */
  indent?: number;
  /** The legacy em first line folded into `firstLineIndentPt`. */
  textIndent?: null;
}

function half(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * The paragraph attributes that put its text where the ruler's markers were
 * dropped. `current` is what the paragraph stores; `from` is the measured
 * display, `to` the display after the drop (same units: pt, first line
 * relative to the left side).
 */
export function rulerIndentPatch(
  current: { indentLeftPt: number; indentRightPt: number; firstLineIndentPt: number },
  paragraph: RulerParagraphMeasure,
  to: { leftPt: number; firstLinePt: number; rightPt: number },
): RulerIndentPatch {
  const patch: RulerIndentPatch = {};
  if (paragraph.rtl && paragraph.list === "none") {
    // Right to left, Word's indents are the start (drawn right) and the end
    // (drawn left): each marker moves its own side, and the first line moves
    // alone. Read as left-to-right, a first-line step rewrote the start from
    // the drawn LEFT margin, so the whole paragraph's right side jumped
    // (WUA 133: 36pt became 18pt).
    if (to.rightPt !== paragraph.rightPt) {
      patch.indentLeftPt = half(Math.max(0, current.indentLeftPt + to.rightPt - paragraph.rightPt));
    }
    if (to.leftPt !== paragraph.leftPt) {
      patch.indentRightPt = half(Math.max(0, current.indentRightPt + to.leftPt - paragraph.leftPt));
    }
    if (to.firstLinePt !== paragraph.firstLinePt) patch.firstLineIndentPt = half(to.firstLinePt);
    return patch;
  }
  if (to.rightPt !== paragraph.rightPt) {
    patch.indentRightPt = half(Math.max(0, current.indentRightPt + to.rightPt - paragraph.rightPt));
  }
  const leftMoved = to.leftPt !== paragraph.leftPt;
  const firstMoved = to.firstLinePt !== paragraph.firstLinePt;
  if (!leftMoved && !firstMoved) return patch;
  if (paragraph.list === "native") {
    // A Word list item's indents are Word's own: left is the text, the
    // (negative) first line is the number.
    patch.indentLeftPt = half(Math.max(0, current.indentLeftPt + to.leftPt - paragraph.leftPt));
    patch.firstLineIndentPt = half(to.firstLinePt);
    return patch;
  }
  if (paragraph.list === "plain") {
    // The number belongs to the list, not the paragraph: the text moves.
    patch.indentLeftPt = half(Math.max(0, paragraph.ownLeftPt + to.leftPt - paragraph.leftPt));
    patch.indent = 0;
    return patch;
  }
  // The paragraph's margin (the pt indent or, without one, the Tab level) is
  // its body, Word's `w:ind left`, and the first line is drawn from it by
  
  // moves the body and the first line with it, and the first-line triangle
  // moves only the first line: taking the margin from where the first line
  // started moved the body too whenever the first line went left of it
  // (WUA 029, a 15pt left indent became 12pt at a -3pt first line).
  patch.indentLeftPt = half(Math.max(0, paragraph.ownLeftPt + to.leftPt - paragraph.leftPt));
  patch.firstLineIndentPt = half(to.firstLinePt);
  patch.indent = 0;
  patch.textIndent = null;
  return patch;
}
