/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Layout tab (Page Setup group) button logic, shared by the document
 * toolbar and the editor-command catalog. Each function is what the ribbon
 * button does to the editor it is given; the toolbar passes whether the
 * Office-parity section model is on, a headless command run passes true (the
 * product mounts the editor with it on).
 *
 * With the section model, page setup targets the section containing the
 * selection; without it the legacy document-wide commands run unchanged.
 */

import type { Editor } from "@tiptap/core";
import { sectionContentWidthTwips } from "@mrnote/core/web/components/console/editor/UnequalColumnsDialog.tsx";
import { resolveColumns, type ColumnCount } from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import {
  normalizeCustomPageMargins,
  normalizeCustomPageSize,
  normalizeLineNumbers,
  pageGeometryTwips,
  resolvePageMargins,
  resolvePageOrientation,
  resolvePageSize,
  type LineNumberRestart,
  type LineNumbers,
  type MarginTwips,
  type PageMargins,
  type PageOrientation,
  type PageSize,
} from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import { applySectionLayoutPatchTo, type SectionApplyTo } from "@mrnote/core/web/components/console/editor/native-document/sectionApplyTo.ts";
import {
  resolveSectionAtSelection,
  shownSectionLayoutAtSelection,
  unequalTwoColumnPreset,
  type SectionLayout,
  type SectionLayoutPatch,
  type SectionVerticalAlignment,
} from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import { normalizeWordDocumentSettings, type WordMultiplePages } from "@mrnote/core/web/components/console/editor/native-document/wordDocumentSettings.ts";

/**
 * Apply one page-setup patch to the section containing the live selection.
 * The extension validates/materializes the exact layout; this adapter owns
 * only selection-to-index routing.
 */
export function applyCurrentSectionLayoutPatch(editor: Editor, patch: SectionLayoutPatch): boolean {
  const { sectionIndex } = resolveSectionAtSelection(editor.state);
  return editor.commands.updateSectionLayout(
    sectionIndex,
    patch,
  );
}

/**
 * The toolbar acts on the section at the selection; a command may name Word's
 * Apply to instead (Whole document, This section, This point forward).
 */
function applySection(editor: Editor, patch: SectionLayoutPatch, applyTo?: SectionApplyTo): boolean {
  if (!applyTo) return applyCurrentSectionLayoutPatch(editor, patch);
  return applySectionLayoutPatchTo(editor, patch, applyTo, "nextPage");
}

/**
 * The sections the selection touches, first to last. Word's Line Numbers
 * menu acts on each of them (select the whole document to number every
 * section; Microsoft Support, "Add or remove line numbers").
 */
function selectedSectionIndices(editor: Editor): number[] {
  const { doc, selection } = editor.state;
  const at = (pos: number) =>
    resolveSectionAtSelection({ doc, selection: { head: pos } as typeof selection }).sectionIndex;
  const first = at(selection.from);
  const last = Math.max(first, at(selection.to));
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

/** One patch per selected section (null: leave it), in one transaction. */
function applySelectedSectionsPatch(
  editor: Editor,
  patchFor: (layout: SectionLayout | null) => SectionLayoutPatch | null,
): boolean {
  const indices = selectedSectionIndices(editor);
  if (indices.length <= 1) {
    const patch = patchFor(activeSectionLayout(editor));
    return patch ? applyCurrentSectionLayoutPatch(editor, patch) : false;
  }
  const layouts = resolveSectionAtSelection(editor.state).layouts;
  let applied = false;
  const ran = editor.chain().command(({ commands }) => {
    for (const index of indices) {
      const patch = patchFor(layouts?.[index] ?? null);
      if (!patch) continue;
      if (!commands.updateSectionLayout(index, patch)) return false;
      applied = true;
    }
    return true;
  }).run();
  return ran && applied;
}

export function activeSectionLayout(editor: Editor): SectionLayout | null {
  return resolveSectionAtSelection(editor.state).layout;
}

/** Layout ▸ Size: a preset paper size, keeping the section's orientation. */
export function runPageSizeButton(
  editor: Editor,
  size: PageSize,
  sectioned: boolean,
  fallbackOrientation: PageOrientation = "portrait",
  applyTo?: SectionApplyTo,
): boolean {
  const next = resolvePageSize(size);
  if (!sectioned) return editor.chain().setPageSize(next).run();
  const orientation = activeSectionLayout(editor)?.pageSize.orientation ?? fallbackOrientation;
  const geometry = pageGeometryTwips(next, "normal", null, null, orientation);
  return applySection(editor, {
    pageSize: { widthTwips: geometry.width, heightTwips: geometry.height, orientation },
  }, applyTo);
}

/** Layout ▸ Margins: a preset (normal / narrow / wide ...). */
export function runPageMarginsButton(editor: Editor, margins: PageMargins, sectioned: boolean, applyTo?: SectionApplyTo): boolean {
  const next = resolvePageMargins(margins);
  if (!sectioned) return editor.chain().setPageMargins(next).run();
  const geometry = pageGeometryTwips("letter", next, null, null, "portrait");
  return applySection(editor, {
    pageMargins: {
      topTwips: geometry.top,
      rightTwips: geometry.right,
      bottomTwips: geometry.bottom,
      leftTwips: geometry.left,
    },
  }, applyTo);
}

/** Layout ▸ Orientation. The section command swaps the concrete extents. */
export function runPageOrientationButton(
  editor: Editor,
  orientation: PageOrientation,
  sectioned: boolean,
  applyTo?: SectionApplyTo,
): boolean {
  const next = resolvePageOrientation(orientation);
  if (!sectioned) return editor.chain().setPageOrientation(next).run();
  return applySection(editor, { pageSize: { orientation: next } }, applyTo);
}

/**
 * Layout ▸ Size ▸ More Paper Sizes (width/height in inches). A null/invalid
 * value clears the legacy custom override; the section model has none.
 */
export function runCustomPageSizeButton(
  editor: Editor,
  value: unknown,
  sectioned: boolean,
  fallbackOrientation: PageOrientation = "portrait",
  applyTo?: SectionApplyTo,
): boolean {
  const custom = normalizeCustomPageSize(value);
  if (!sectioned) return editor.chain().setCustomPageSize(custom).run();
  if (!custom) return false;
  const orientation = activeSectionLayout(editor)?.pageSize.orientation ?? fallbackOrientation;
  const geometry = pageGeometryTwips("custom", "normal", custom, null, orientation);
  return applySection(editor, {
    pageSize: { widthTwips: geometry.width, heightTwips: geometry.height, orientation },
  }, applyTo);
}

/** Layout ▸ Margins ▸ Custom Margins (top/right/bottom/left in inches). */
export function runCustomPageMarginsButton(editor: Editor, value: unknown, sectioned: boolean, applyTo?: SectionApplyTo): boolean {
  const custom = normalizeCustomPageMargins(value);
  if (!sectioned) return editor.chain().setCustomPageMargins(custom).run();
  if (!custom) return false;
  const geometry = pageGeometryTwips("letter", "custom", null, custom, "portrait");
  return applySection(editor, {
    pageMargins: {
      topTwips: geometry.top,
      rightTwips: geometry.right,
      bottomTwips: geometry.bottom,
      leftTwips: geometry.left,
    },
  }, applyTo);
}

/**
 * A row of Word's Margins gallery: concrete twips, and whether it is the
 * Mirrored row (a document setting; every other row turns it off).
 */
export function runMarginGalleryButton(
  editor: Editor,
  twips: MarginTwips,
  mirrored: boolean,
  presetId: string | null,
  sectioned: boolean,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  if (sectioned) {
    const mirrorNow =
      normalizeWordDocumentSettings(editor.state.doc.attrs.wordSettings)?.multiplePages === "mirrorMargins";
    return applySectionLayoutPatchTo(
      editor,
      {
        pageMargins: {
          topTwips: twips.top,
          rightTwips: twips.right,
          bottomTwips: twips.bottom,
          leftTwips: twips.left,
        },
      },
      "thisSection",
      "nextPage",
      mirrored ? { multiplePages: "mirrorMargins" } : mirrorNow ? { multiplePages: null } : undefined,
    );
  }
  if (presetId === "normal" || presetId === "narrow" || presetId === "wide") {
    return runPageMarginsButton(editor, presetId, false);
  }
  return runCustomPageMarginsButton(
    editor,
    { top: twips.top / 1440, right: twips.right / 1440, bottom: twips.bottom / 1440, left: twips.left / 1440 },
    false,
  );
}

export interface PageSetupRequest {
  pageSize?: SectionLayoutPatch["pageSize"];
  pageMargins?: SectionLayoutPatch["pageMargins"];
  applyTo: SectionApplyTo;
  multiplePages?: WordMultiplePages | null;
  gutterAtTop?: boolean | null;
}

/** Page Setup dialog OK (section layouts): both tabs and Apply to at once. */
export function runPageSetupDialog(editor: Editor, value: PageSetupRequest): boolean {
  const settings: { multiplePages?: WordMultiplePages | null; gutterAtTop?: boolean | null } = {};
  if (value.multiplePages !== undefined) settings.multiplePages = value.multiplePages;
  if (value.gutterAtTop !== undefined) settings.gutterAtTop = value.gutterAtTop;
  const patch: SectionLayoutPatch = {};
  if (value.pageSize) patch.pageSize = value.pageSize;
  if (value.pageMargins) patch.pageMargins = value.pageMargins;
  return applySectionLayoutPatchTo(
    editor,
    patch,
    value.applyTo,
    "nextPage",
    Object.keys(settings).length ? settings : undefined,
  );
}

/** Layout ▸ Columns: One / Two / Three equal columns. */
export function runColumnsButton(editor: Editor, columns: ColumnCount, sectioned: boolean, applyTo?: SectionApplyTo): boolean {
  const next = resolveColumns(columns);
  if (!sectioned) return editor.chain().setColumns(next).run();
  return applySection(editor, {
    columns: { count: next, equalWidth: true, items: null },
  }, applyTo);
}

/**
 * Word's Columns ▸ Left / Right: two columns whose narrow one is the width an
 * equal three-column layout would give. The widths come from the section's
 * real text width, so they need a section layout.
 */
export function runColumnsPresetButton(editor: Editor, side: "left" | "right"): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  // A new page stores no section layout yet; its widths are the page's.
  const layout = shownSectionLayoutAtSelection(editor.state);
  if (!layout) return false;
  const items = unequalTwoColumnPreset(sectionContentWidthTwips(layout), layout.columns.spaceTwips, side);
  if (!items) return false;
  return applyCurrentSectionLayoutPatch(editor, { columns: { count: 2, equalWidth: false, items } });
}

/** Columns ▸ Line Between. */
export function runColumnSeparatorButton(editor: Editor, enabled: boolean, sectioned: boolean, applyTo?: SectionApplyTo): boolean {
  if (!sectioned) return editor.chain().setColumnSeparator(enabled).run();
  return applySection(editor, { columns: { separator: enabled } }, applyTo);
}

/** Columns dialog (More Columns): a full columns patch with Apply to. */
export function runColumnsDialog(
  editor: Editor,
  patch: SectionLayoutPatch,
  applyTo: SectionApplyTo,
  startNewColumn: boolean,
): boolean {
  // Word's Apply to: This point forward inserts a Continuous break, or a
  // New Column one for "Start new column".
  return applySectionLayoutPatchTo(editor, patch, applyTo, startNewColumn ? "nextColumn" : "continuous");
}

/** Text Direction (vertical text 竖排), document-wide. */
export function runVerticalTextButton(editor: Editor, vertical: boolean): boolean {
  return editor.chain().setWritingMode(vertical ? "vertical-rl" : "horizontal-tb").run();
}

/** Manuscript grid (稿纸), document-wide. */
export function runManuscriptGridButton(editor: Editor, mode: "off" | "grid" | "lines"): boolean {
  return editor.chain().setManuscriptGrid(mode).run();
}

/** Layout ▸ Page Setup ▸ Vertical alignment of the section's text. */
export function runVerticalAlignmentButton(editor: Editor, alignment: SectionVerticalAlignment): boolean {
  const section = resolveSectionAtSelection(editor.state);
  return editor.commands.updateSectionLayout(
    section.sectionIndex,
    { verticalAlignment: alignment },
  );
}

// ---- Line numbers (Word 行号 / <w:lnNumType>) ------------------------------

export const DEFAULT_LINE_NUMBERS: LineNumbers = { countBy: 1, restart: "continuous", distancePt: 0 };

export function toolbarLineNumbersFromSection(layout: SectionLayout | null): LineNumbers | null {
  const lineNumbers = layout?.lineNumbers;
  if (!lineNumbers) return null;
  return normalizeLineNumbers({
    countBy: lineNumbers.countBy ?? 1,
    // OOXML's omitted `w:restart` means restart on every page. Keep that
    // effective value in the inspector without materializing it back into the
    // source-bound section model during an unrelated field edit.
    restart: lineNumbers.restart ?? "newPage",
    distancePt: (lineNumbers.distanceTwips ?? 0) / 20,
  });
}







export function lineNumberStartAt(stored: number | undefined): number {
  return Math.max(0, stored ?? 0) + 1;
}

/** The stored skip count for an author's Start at number (1-based). */
export function lineNumberStoredStart(startAt: number): number {
  return Math.max(0, Math.round(startAt) - 1);
}

export function sectionLineNumbersPatch(
  lineNumbers: LineNumbers,
): NonNullable<SectionLayout["lineNumbers"]> {
  return {
    countBy: lineNumbers.countBy,
    restart: lineNumbers.restart,
    distanceTwips: Math.round(lineNumbers.distancePt * 20),
  };
}

export function sectionLineNumberFieldPatch(
  patch: Partial<LineNumbers>,
  normalized: LineNumbers,
): Partial<NonNullable<SectionLayout["lineNumbers"]>> {
  const sectionPatch: Partial<NonNullable<SectionLayout["lineNumbers"]>> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "countBy")) {
    sectionPatch.countBy = normalized.countBy;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "restart")) {
    sectionPatch.restart = normalized.restart;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "distancePt")) {
    sectionPatch.distanceTwips = Math.round(normalized.distancePt * 20);
  }
  return sectionPatch;
}

/** The line numbering in force where the selection is, or null when off. */
export function currentLineNumbers(editor: Editor, sectioned: boolean): LineNumbers | null {
  if (sectioned) {
    const layout = activeSectionLayout(editor);
    if (layout) return toolbarLineNumbersFromSection(layout);
  }
  return normalizeLineNumbers(editor.state.doc.attrs.lineNumbers);
}

/** Line Numbers ▸ None (false) or on with Word's defaults (true). */
export function runLineNumbersToggle(editor: Editor, enabled: boolean, sectioned: boolean, applyTo?: SectionApplyTo): boolean {
  if (sectioned) {
    const defaults = normalizeLineNumbers(DEFAULT_LINE_NUMBERS);
    const patch = { lineNumbers: enabled && defaults ? sectionLineNumbersPatch(defaults) : null };
    return applyTo ? applySection(editor, patch, applyTo) : applySelectedSectionsPatch(editor, () => patch);
  }
  return editor.chain().setLineNumbers(enabled ? { ...DEFAULT_LINE_NUMBERS } : null).run();
}

/**
 * Patch a single field of the current line numbering, preserving the rest
 * (changing the count-by step keeps the chosen restart mode, etc.).
 */
export function runLineNumberFieldUpdate(
  editor: Editor,
  patch: Partial<LineNumbers>,
  sectioned: boolean,
  legacyCurrent: LineNumbers | null = normalizeLineNumbers(editor.state.doc.attrs.lineNumbers),
  applyTo?: SectionApplyTo,
): boolean {
  const layout = sectioned ? activeSectionLayout(editor) : null;
  const current = (layout ? toolbarLineNumbersFromSection(layout) : legacyCurrent) ?? DEFAULT_LINE_NUMBERS;
  const next = normalizeLineNumbers({ ...current, ...patch });
  if (!next) return false;
  if (sectioned) {
    // Patch only the field the user changed. In particular this retains
    // imported `w:start` and preserves an omitted `w:restart` instead of
    // serializing its effective UI default (`newPage`).
    const fieldPatch = { lineNumbers: sectionLineNumberFieldPatch(patch, next) };
    return applyTo
      ? applySection(editor, fieldPatch, applyTo)
      // Every selected section that numbers its lines takes the field.
      : applySelectedSectionsPatch(editor, (section) =>
        section?.lineNumbers || (section === null && layout === null) ? fieldPatch : null);
  }
  return editor.chain().setLineNumbers(next).run();
}

/**
 * Word's Line Numbers menu applies a numbering mode in ONE step regardless of
 * the current state: picking a restart mode while numbering is off both turns
 * it on and stores that mode. Once numbering is on it is a plain restart patch.
 */
export function runLineNumberMode(
  editor: Editor,
  restart: LineNumberRestart,
  sectioned: boolean,
  current: LineNumbers | null,
  legacyCurrent?: LineNumbers | null,
): boolean {
  const defaults = normalizeLineNumbers({ countBy: 1, restart, distancePt: 0 });
  if (!defaults) return false;
  if (sectioned) {
    // Each selected section: one already numbered changes only its restart
    // (its count-by, start and distance stay); one that is not is turned on
    // with Word's defaults and that restart.
    return applySelectedSectionsPatch(editor, (section) =>
      section?.lineNumbers || (section === null && current !== null)
        ? { lineNumbers: sectionLineNumberFieldPatch({ restart }, defaults) }
        : { lineNumbers: sectionLineNumbersPatch(defaults) },
    );
  }
  if (current !== null) {
    return runLineNumberFieldUpdate(editor, { restart }, sectioned, legacyCurrent ?? current);
  }
  return editor.chain().setLineNumbers(defaults).run();
}

export interface LineNumbersDialogRequest {
  enabled: boolean;
  /** Word's 1-based Start at. */
  start: number;
  countBy: number;
  distancePt: number;
  restart: LineNumberRestart;
}

/** Line Numbering Options dialog OK. */
export function runLineNumbersDialog(editor: Editor, value: LineNumbersDialogRequest, sectioned: boolean, applyTo?: SectionApplyTo): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  if (!value.enabled) {
    runLineNumbersToggle(editor, false, sectioned, applyTo);
    return true;
  }
  const next = normalizeLineNumbers({
    countBy: value.countBy,
    restart: value.restart,
    distancePt: value.distancePt,
  });
  if (!next) return false;
  if (sectioned) {
    const stored = activeSectionLayout(editor)?.lineNumbers?.start;
    const start = lineNumberStoredStart(value.start);
    return applySection(editor, {
      lineNumbers: {
        ...sectionLineNumbersPatch(next),
        // An unchanged Start at 1 keeps an omitted w:start omitted.
        ...(stored !== undefined || start !== 0 ? { start } : {}),
      },
    }, applyTo);
  }
  return editor.chain().setLineNumbers(next).run();
}

/** The Line Numbers menu's Start at field (section model only). */
export function runLineNumberStart(editor: Editor, raw: string): boolean {
  if (editor.isDestroyed || !editor.isEditable || !activeSectionLayout(editor)?.lineNumbers) {
    return false;
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return false;
  // The field shows Word's 1-based Start at; the section stores the skip.
  const start = lineNumberStoredStart(Math.min(Math.max(numeric, 1), 1_000_000));
  return applyCurrentSectionLayoutPatch(editor, { lineNumbers: { start } });
}
