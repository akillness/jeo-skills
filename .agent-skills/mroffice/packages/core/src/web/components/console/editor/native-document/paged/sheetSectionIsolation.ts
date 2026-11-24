/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Per-PAGE header/footer independence for native documents.
 *
 * Word binds bands to SECTIONS; the product default is per-page: a band
 * lives on exactly the page it was edited on, and pages born from typing
 * overflow stay CLEAN (no inheritance - the repeatedly-reported bug).
 * Storage stays sectional (`sectionBands` + section breaks), with two
 * twists carried by the `pageScoped` entry flag:
 *
 * - rendering paints a page-scoped entry on the FIRST sheet of its
 *   section only, so a section that grows downward (typing on its last
 *   page) never leaks its band onto newborn sheets;
 * - therefore isolation only ever needs the START boundary of the target
 *   sheet - never a tail boundary, never a boundary for sheet 0, and a
 *   sectionless single-page document needs no break at all.
 *
 * Documents whose sections were built deliberately (imported docx bands,
 * user-inserted breaks) keep Word semantics: their entries never carry
 * `pageScoped`, and this helper only ADDS a boundary when the target
 * sheet does not already start a section.
 */

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { PAGE_BLOCK_NODE } from "./pageBlockExtension";

export const SECTION_BREAK_NODE = "sectionBreak";

export interface SheetSectionInfo {
  /** Section index of the sheet (breaks in earlier sheets). */
  sectionIndex: number;
  /** Whether the sheet is the FIRST sheet of its section. */
  isFirstSheetOfSection: boolean;
}

/** Pure read: the sheet's section index + first-of-section flag. */
export function sheetSectionInfo(
  editor: Editor,
  sheetIndex: number,
): SheetSectionInfo | null {
  const doc = editor.state?.doc;
  if (!doc) return null;
  const pages: ProseMirrorNode[] = [];
  doc.forEach((node: ProseMirrorNode) => {
    if (node.type.name === PAGE_BLOCK_NODE) pages.push(node);
  });
  if (pages.length === 0) return null;
  const clamped = Math.min(Math.max(sheetIndex, 0), pages.length - 1);
  // Section of sheet K = breaks contained in sheets 0..K-1 (breaks close
  // their section, so a sheet belongs to the section counted BEFORE it).
  let sectionIndex = 0;
  for (let index = 0; index < clamped; index += 1) {
    pages[index].descendants((node: ProseMirrorNode) => {
      if (node.type.name === SECTION_BREAK_NODE) sectionIndex += 1;
      return true;
    });
  }
  // First of section: sheet 0, or the PREVIOUS sheet carries >=1 break.
  let isFirst = clamped === 0;
  if (!isFirst) {
    let previousBreaks = 0;
    pages[clamped - 1].descendants((node: ProseMirrorNode) => {
      if (node.type.name === SECTION_BREAK_NODE) previousBreaks += 1;
      return true;
    });
    isFirst = previousBreaks > 0;
  }
  return { sectionIndex, isFirstSheetOfSection: isFirst };
}

/**
 * Ensure `sheetIndex` STARTS a section, inserting a next-page section
 * break at the tail of the previous sheet when needed (replacing a manual
 * pageBreak there - a next-page section break IS a page break, stacking
 * both would mint an empty sheet). Returns the sheet's section info after
 * the operation plus whether a boundary was actually inserted (the caller
 * must then split the matching sectionBands entry when one exists).
 */
export function ensureSheetStartsSection(
  editor: Editor,
  sheetIndex: number,
): (SheetSectionInfo & { insertedBoundary: boolean }) | null {
  const info = sheetSectionInfo(editor, sheetIndex);
  if (!info) return null;
  if (info.isFirstSheetOfSection) {
    return { ...info, insertedBoundary: false };
  }
  const doc = editor.state.doc;
  const pages: Array<{ pos: number; node: ProseMirrorNode }> = [];
  doc.forEach((node: ProseMirrorNode, offset: number) => {
    if (node.type.name === PAGE_BLOCK_NODE) pages.push({ pos: offset, node });
  });
  const clamped = Math.min(Math.max(sheetIndex, 0), pages.length - 1);
  if (clamped === 0) return { ...info, insertedBoundary: false };
  const previous = pages[clamped - 1];
  const endPos = previous.pos + previous.node.nodeSize - 1;
  const lastChild =
    previous.node.childCount > 0
      ? previous.node.child(previous.node.childCount - 1)
      : null;
  const range =
    lastChild && lastChild.type.name === "pageBreak"
      ? { from: endPos - lastChild.nodeSize, to: endPos }
      : { from: endPos, to: endPos };
  const inserted = editor
    .chain()
    .insertContentAt(
      range,
      { type: SECTION_BREAK_NODE, attrs: { breakType: "nextPage" } },
      { updateSelection: false },
    )
    .run();
  if (!inserted) return null;
  return {
    sectionIndex: info.sectionIndex + 1,
    isFirstSheetOfSection: true,
    insertedBoundary: true,
  };
}

/**
 * Whether the section open at the foot of `sheet` began on it below its top:
 * a section break on the sheet with content after it (a continuous section
 * starting mid-page). The next sheet then continues that section, and is not
 * its first page: Word gives a section's Different First Page header to the
 * page the section begins on, and the pages after it the default one (Word
 * 16.86, corpus R281-D18: a continuous section opening under page 1's first
 * line shows no first-page logo on page 2).
 */
export function sheetOpensSectionMidPage(sheet: Element | null | undefined): boolean {
  if (!sheet) return false;
  const breaks = sheet.querySelectorAll('[data-type="section-break"]');
  const last = breaks[breaks.length - 1];
  if (!last) return false;
  for (const block of sheet.querySelectorAll("p, h1, h2, h3, h4, h5, h6, table, figure, li, pre, blockquote")) {
    if (!(last.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (last.contains(block)) continue;
    const box = block.getBoundingClientRect();
    if (box.height > 0 || box.width > 0) return true;
  }
  return false;
}
