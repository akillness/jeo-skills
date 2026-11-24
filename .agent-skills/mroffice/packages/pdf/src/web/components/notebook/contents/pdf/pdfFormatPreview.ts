/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The PDF editor's Live Preview adapter (shared mechanism:
 * components/office-ribbon/officeFormatPreview.tsx), for the text boxes the
 * overlay edits. The overlay formats the characters remembered as selected
 * in a box (`emitStyle`'s scoped range) or the whole box; the preview shows
 * the hovered font, size, colour or toggle on exactly that.
 *
 * Underline and Strikethrough are box-level in this model (a run keeps no
 * line of its own), so their preview is the whole box, as their command is.
 */

import {
  officeFormatPreviewCss,
  officePreviewElements,
  officePreviewTextRange,
  officeTextOffsetsRange,
  type OfficeFormatPreviewAdapter,
} from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";

type SelectionReader = () => { start: number; end: number } | null;

const selectionReaders = new WeakMap<Element, SelectionReader>();

/** The overlay says where a box's remembered character selection is. */
export function registerPdfTextBoxSelectionReader(node: Element, reader: SelectionReader): void {
  selectionReaders.set(node, reader);
}

export function pdfFormatPreviewAdapter(context: {
  /** The selected box's font size in points, to scale a previewed size. */
  currentFontSizePt: () => number | null | undefined;
}): OfficeFormatPreviewAdapter {
  return (patch) => {
    if (typeof document === "undefined") return null;
    const box = document.querySelector<HTMLElement>('[role="textbox"][data-selected="true"]');
    if (!box || !selectionReaders.has(box)) return null;
    let pxPerPt: number | undefined;
    if (patch.fontSizePt !== undefined) {
      const shownPx = Number.parseFloat(getComputedStyle(box).fontSize);
      const currentPt = context.currentFontSizePt();
      if (!(shownPx > 0) || !currentPt || !(currentPt > 0)) return null;
      pxPerPt = shownPx / currentPt;
    }
    const css = officeFormatPreviewCss(patch, pxPerPt ? { pxPerPt } : {});
    const selection = selectionReaders.get(box)?.() ?? null;
    const lineLevel = patch.underline !== undefined || patch.strike !== undefined;
    if (selection && selection.end > selection.start && !lineLevel) {
      const range = officeTextOffsetsRange(box, selection.start, selection.end);
      return range ? officePreviewTextRange(range, css) : null;
    }
    
    
    // previews whole.
    if (document.activeElement === box && (!selection || selection.end <= selection.start)) return null;
    if (lineLevel) {
      // A rule previewed on the box adds or takes off that rule on each run
      // and keeps the run's other one: one forced value on every element
      
      const restores: (() => void)[] = [];
      for (const element of [box, ...box.querySelectorAll<HTMLElement>("*")]) {
        const lines = new Set(getComputedStyle(element).textDecorationLine.split(/\s+/u)
          .filter((line) => line && line !== "none"));
        if (patch.underline !== undefined) lines[patch.underline ? "add" : "delete"]("underline");
        if (patch.strike !== undefined) lines[patch.strike ? "add" : "delete"]("line-through");
        const restore = officePreviewElements([element], { ...css, "text-decoration-line": lines.size ? [...lines].join(" ") : "none" },
          { descendants: false });
        if (restore) restores.push(restore);
      }
      return restores.length ? () => { for (const restore of restores) restore(); } : null;
    }
    return officePreviewElements([box], css);
  };
}
