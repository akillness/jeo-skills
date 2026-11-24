/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The deck's Live Preview adapter (the shared mechanism is
 * components/office-ribbon/officeFormatPreview.tsx). PowerPoint previews a
 * hovered font, size, colour or toggle on what the command would format:
 *
 * - the characters selected in a table cell (its rich editor);
 * - the characters selected in a text box shown by the rich preview
 *   (imported / positioned text, mapped through the paragraph rows);
 * - the characters selected in a text area (a text box, a SmartArt label,
 *   a shape's words while typing), through a mirror over the field -- also
 *   while a ribbon menu holds the focus;
 * - the selected objects as a whole (a shape, a text box, a SmartArt
 *   graphic, a multi-selection) when no characters are selected: exactly
 *   the objects the click formats (`objectTargetIds`).
 *
 * Characters selected anywhere are never previewed on the whole object,
 * which is not what the click would do (a few words selected in one
 * SmartArt label previewed on every label of the graphic).
 */

import { CSS_PX_PER_POINT } from "@mrnote/core/web/lib/presentation/text-units.ts";
import {
  officeFormatPreviewCss,
  officeIsPreviewField,
  officePreviewElements,
  officePreviewEquationElements,
  officePreviewFieldRange,
  officePreviewTextRange,
  officeTextOffsetsRange,
  type OfficeFormatPreviewAdapter,
} from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";
import { presentationPreviewDomPoint } from "@mrnote/core/web/lib/presentation/text-selection.ts";

/** Slide text sizes are drawn in design px, CSS_PX_PER_POINT per point. */
const SLIDE_PX_PER_PT = CSS_PX_PER_POINT;

// A hover previews the highlighted characters only: a caret with nothing
// highlighted previews nothing, even inside a word its click would format


export function presentationFormatPreviewAdapter(context: {
  root: () => HTMLElement | null;
  /** The table cell editor with the focus authority, if a cell is being edited. */
  tableCellEditor: () => (HTMLElement & { selectionStart: number; selectionEnd: number }) | null;
  selectedBlockIds: () => readonly string[];
  /**
   * The blocks the command formats as whole objects (every label of a
   * SmartArt graphic, a multi-selection), or null when it formats the text
   * of one text block instead.
   */
  objectTargetIds?: () => readonly string[] | null;
  textSelection: () => { blockId: string; start: number; end: number } | null;
  editingShapeTextId: () => string | null;
}): OfficeFormatPreviewAdapter {
  return (patch) => {
    const root = context.root();
    if (!root) return null;
    const css = officeFormatPreviewCss(patch, { pxPerPt: SLIDE_PX_PER_PT });

    const cell = context.tableCellEditor();
    if (cell?.isConnected) {
      const start = cell.selectionStart;
      const end = cell.selectionEnd;
      if (!(end > start)) return null;
      const range = officeTextOffsetsRange(cell, start, end);
      return range ? officePreviewTextRange(range, css) : null;
    }

    // An equation box open in place: Home's size and colour apply to the
    // box's equation, so the draft wears the preview -- on its container, the
    // equation editor sizing its own parts from it.
    const equationDraft = root.querySelector<HTMLElement>("[data-presentation-equation-box-editor]");
    if (equationDraft) return officePreviewEquationElements([equationDraft], css);

    // The words of a shape being typed in a plain text area: the selected
    // characters get a mirror wearing the preview. A shape typed in its own
    // drawn words (the rich editor) reports its selection like a text box,
    // below.
    if (context.editingShapeTextId()) {
      const field = root.querySelector<HTMLTextAreaElement>(
        '[data-testid="presentation-shape-text-input"]',
      );
      if (field && officeIsPreviewField(field)) {
        const { selectionStart: from, selectionEnd: to } = field;
        return to > from ? officePreviewFieldRange(field, from, to, css) : null;
      }
    }
    // A chart title being typed: the title input is what Home formats
    // (`officeChartTitleEditElement`), so the preview wears on it alone --
    // not on the chart's words or the buttons beside the chart.
    const titleInput = root.querySelector<HTMLInputElement>('input[data-office-chart-title="title"]');
    if (titleInput) {
      const start = titleInput.selectionStart ?? 0;
      const end = titleInput.selectionEnd ?? 0;
      // Characters selected in the title: the preview wears on them alone.
      if (end > start && officeIsPreviewField(titleInput)) return officePreviewFieldRange(titleInput, start, end, css);
      return officePreviewElements([titleInput], css);
    }
    const objectIds = () => context.objectTargetIds?.() ?? null;
    const body = root.ownerDocument.activeElement;
    if (
      officeIsPreviewField(body) &&
      root.contains(body) &&
      body.getAttribute("data-testid") === "presentation-textbox-body"
    ) {
      const start = body.selectionStart ?? 0;
      const end = body.selectionEnd ?? 0;
      // Highlighted characters preview; a caret alone previews nothing, and
      // whole objects (a SmartArt label inside its selected graphic) preview
      // below, as the click formats them.
      if (end > start) return officePreviewFieldRange(body, start, end, css);
      if (objectIds() === null) return null;
    }

    const selection = context.textSelection();
    const words = selection && selection.end > selection.start ? selection : null;
    if (words && words.end > words.start) {
      const host = root.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(words.blockId)}"]`,
      );
      const preview = host?.querySelector<HTMLElement>(
        '[data-selection-owner="rich-preview"]',
      );
      // A shape typed in its drawn words: the words are the editor's text.
      const shapeEditor = preview ? null : host?.querySelector<HTMLElement>("[data-shape-rich-editor]");
      if (shapeEditor) {
        const range = officeTextOffsetsRange(shapeEditor, words.start, words.end);
        return range ? officePreviewTextRange(range, css) : null;
      }
      if (!preview) {
        // A plain text area: its own mirror shows the selected characters.
        const field = host?.querySelector("textarea");
        return field && officeIsPreviewField(field)
          ? officePreviewFieldRange(field, words.start, words.end, css)
          : null;
      }
      try {
        const from = presentationPreviewDomPoint(preview, words.start);
        const to = presentationPreviewDomPoint(preview, words.end);
        const range = preview.ownerDocument.createRange();
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        return officePreviewTextRange(range, css);
      } catch {
        return null;
      }
    }

    // A caret in a text box or shape being typed in, with nothing
    
    // previewed the whole box, then the word around the caret). Where the
    // command does format whole objects (a SmartArt label inside its
    // selected graphic) they still preview.
    if (
      objectIds() === null &&
      (context.editingShapeTextId() !== null ||
        root.querySelector('[data-block-id][data-text-editing="true"]') !== null)
    ) {
      return null;
    }

    const ids = objectIds() ?? context.selectedBlockIds();
    if (ids.length === 0) return null;
    // A chart block previews on its drawing: the block also hosts the
    // Chart Elements / Styles / Filters buttons beside the chart, whose
    // words are not the command's (a hovered size grew "Edit Data").
    const blocks = ids.flatMap((id) =>
      [...root.querySelectorAll<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)].map(
        (block) => block.querySelector<HTMLElement>(".presentation-window__chart-block") ?? block,
      ),
    );
    return officePreviewElements(blocks, css);
  };
}
