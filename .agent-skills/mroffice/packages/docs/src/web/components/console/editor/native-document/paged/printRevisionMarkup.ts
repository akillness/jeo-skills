/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What a print does with tracked changes and comments: Word's Print Markup.
 *
 * Word (File > Print > Settings > Document Info, Print Markup; Microsoft
 * Support, "Print a document in Word" and "Track changes in Word"):
 * - a document holding tracked changes prints its markup by default (Print
 *   Markup is checked whenever there are tracked changes, whether Track
 *   Changes is on or not);
 * - the printed markup is the markup Display for Review shows: All Markup
 *   prints the inline insertions and deletions with their change bars,
 *   Simple Markup the final text with the red change bars, No Markup the
 *   final text alone, and Show Markup's per-type choices (Insertions and
 *   Deletions, Formatting) leave out what they hide;
 * - Print Markup cleared prints the document as No Markup shows it: the
 *   final copy, no change bar, no comment.
 * Save as PDF's "Document showing markup" / "Document" are the same two.
 *
 * A print copies the laid-out sheets (structuralPrint): printed with its
 * markup, a sheet keeps the review display's attribute (the stylesheet then
 * draws the copy as the screen draws the sheet) and the change bars painted
 * beside it, each moved onto its sheet. The final copy is the sheets as the
 * final view lays them out; the copy then drops what that view hides.
 */
import { applyRevisionPolicyToDom } from "../../../../../lib/document-export/revision-policy";
import {
  CHANGE_BAR_OVERLAY_CLASS,
  SIMPLE_MARKUP_CHANGE_BAR_CLASS,
  normalizeTrackedChangeMarkupFilter,
  paintedChangeBars,
  type TrackedChangeMarkupFilter,
} from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";

/** The review display a print shows (Print Markup on), or null: the final
 * copy (Print Markup off). */
export type PrintRevisionMarkup = TrackedChangeMarkupFilter | null;

/** The attribute the review display sets on the editor root (the stylesheet
 * draws the markup from it). */
export const MARKUP_FILTER_ROOT_ATTR = "data-track-changes-markup-filter";

/** A printed copy's review display, as the server's PDF asks for it: one of
 * Word's displays, anything else none (the final copy). */
export function printRevisionMarkupFrom(value: unknown): PrintRevisionMarkup {
  if (typeof value !== "string" || !value) return null;
  const filter = normalizeTrackedChangeMarkupFilter(value);
  return filter === value ? filter : null;
}

/** Whether the display lays out deleted text (or a deleted object) inline:
 * its sheets are not the final copy's, and a final copy is laid out again
 * under No Markup first. */
export function markupFilterLaysOutDeletions(filter: TrackedChangeMarkupFilter): boolean {
  return filter === "all" || filter === "deletions";
}

/** The comment anchor's highlight (comments.ts): Word prints comments only
 * with the markup. */
const COMMENT_HIGHLIGHT_CLASS = "mrnote-comment";

export interface SheetChangeBar {
  top: number;
  left: number;
  height: number;
}

/**
 * The change bars painted beside the live sheets, each in the coordinates of
 * the sheet it stands beside (the sheet's own CSS pixels, its zoom undone).
 * Empty when the display paints none.
 */
export function changeBarsBySheet(
  root: HTMLElement,
  sheets: readonly HTMLElement[],
): Map<number, SheetChangeBar[]> {
  const out = new Map<number, SheetChangeBar[]>();
  const bars = paintedChangeBars(root);
  if (!bars || sheets.length === 0) return out;
  const boxes = sheets.map((sheet) => {
    const rect = sheet.getBoundingClientRect();
    const scaleX = sheet.offsetWidth > 0 ? rect.width / sheet.offsetWidth : 1;
    const scaleY = sheet.offsetHeight > 0 ? rect.height / sheet.offsetHeight : 1;
    return { rect, scaleX: scaleX || 1, scaleY: scaleY || 1 };
  });
  const unit = (value: number) => Math.round(value * 64) / 64;
  for (const bar of bars) {
    const rect = bar.getBoundingClientRect();
    if (!(rect.height > 0)) continue;
    const middle = rect.top + rect.height / 2;
    const index = boxes.findIndex((box) => middle >= box.rect.top && middle < box.rect.bottom);
    if (index < 0) continue;
    const box = boxes[index];
    const list = out.get(index) ?? [];
    list.push({
      top: unit((rect.top - box.rect.top) / box.scaleY),
      left: unit((rect.left - box.rect.left) / box.scaleX),
      height: unit(rect.height / box.scaleY),
    });
    out.set(index, list);
  }
  return out;
}

/** The print copy's own rules for printed markup: the change bars, the
 * revision colours and a formatting change's tint print as the screen shows
 * them, whatever the dialog's background-graphics setting. */
export function printMarkupCss(markup: PrintRevisionMarkup): string {
  if (markup === null) return "";
  return (
    `.${CHANGE_BAR_OVERLAY_CLASS},.${CHANGE_BAR_OVERLAY_CLASS} .${SIMPLE_MARKUP_CHANGE_BAR_CLASS},` +
    ".note-editor-content .mrnote-tc-insertion,.note-editor-content .mrnote-tc-deletion," +
    ".note-editor-content .mrnote-tc-formatting,.note-editor-content [data-track-paragraph-formatting]," +
    ".note-editor-content tr[data-track-row-insertion]>td,.note-editor-content tr[data-track-row-insertion]>th," +
    ".note-editor-content .mrnote-comment" +
    "{-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    `.${CHANGE_BAR_OVERLAY_CLASS} .${SIMPLE_MARKUP_CHANGE_BAR_CLASS}{cursor:default;pointer-events:none}`
  );
}

/** The copy's content wrapper takes the display the copy prints. */
export function applyPrintMarkupToContent(content: HTMLElement, markup: PrintRevisionMarkup): void {
  if (markup === null) content.removeAttribute(MARKUP_FILTER_ROOT_ATTR);
  else content.setAttribute(MARKUP_FILTER_ROOT_ATTR, markup);
}

/**
 * One cloned sheet as it prints: with its markup, the change bars painted
 * beside it on the screen; as the final copy, its revisions settled (what the
 * final view hides taken out, an insertion an ordinary run) and no comment
 * highlight.
 */
export function applyPrintMarkupToSheet(
  clone: HTMLElement,
  markup: PrintRevisionMarkup,
  bars: readonly SheetChangeBar[] | undefined,
  doc: Document,
): void {
  if (markup === null) {
    applyRevisionPolicyToDom(clone, "accept");
    for (const element of Array.from(clone.querySelectorAll<HTMLElement>(`.${COMMENT_HIGHLIGHT_CLASS}`))) {
      element.classList.remove(COMMENT_HIGHLIGHT_CLASS);
      if (!element.className) element.removeAttribute("class");
    }
    return;
  }
  if (!bars || bars.length === 0) return;
  const overlay = doc.createElement("div");
  overlay.className = CHANGE_BAR_OVERLAY_CLASS;
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("data-markup-filter", markup);
  overlay.setAttribute("data-print-change-bars", "");
  for (const bar of bars) {
    const element = doc.createElement("div");
    element.className = SIMPLE_MARKUP_CHANGE_BAR_CLASS;
    element.style.top = `${bar.top}px`;
    element.style.left = `${bar.left}px`;
    element.style.height = `${bar.height}px`;
    overlay.appendChild(element);
  }
  clone.appendChild(overlay);
}
