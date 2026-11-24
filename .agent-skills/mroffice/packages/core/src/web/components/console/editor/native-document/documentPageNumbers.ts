/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { pageNumberLabel, resolveSectionSheetPageNumberLabels } from "./pageNumberFormat";
import { normalizeSectionLayouts } from "./sectionLayouts";

type SheetNumbering = { labels: readonly (string | null)[]; numbers: readonly (number | null)[] } | null;
const labelsByDoc = new WeakMap<ProseMirrorNode, SheetNumbering>();

/** Each sheet's printed number, as its header or footer prints it, or null
 * when the document numbers its pages the plain way (start and format only). */
function sheetLabels(doc: ProseMirrorNode): readonly (string | null)[] | null {
  return sheetNumbering(doc)?.labels ?? null;
}

/** Each sheet's printed label and the number it stands for (Start at 10
 * gives "10" and 10; a roman section "ix" and 9), or null for plain numbering. */
function sheetNumbering(doc: ProseMirrorNode): SheetNumbering {
  if (labelsByDoc.has(doc)) return labelsByDoc.get(doc)!;
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  const sheets: Array<{ physicalStart: number; span: number; sectionIndex: number; sectionContinues: boolean }> = [];
  let section = 0;
  let opensMidPage = false;
  doc.forEach((node) => {
    if (node.type.name !== "pageBlock") return;
    // Section breaks close their section: a sheet belongs to the section
    // counted before its content (the header bands count them the same way).
    // A section opened under the sheet before's last break with content
    // after it began there, mid-page (sheetOpensSectionMidPage).
    sheets.push({ physicalStart: sheets.length + 1, span: 1, sectionIndex: section, sectionContinues: opensMidPage });
    const tail = { broke: false, after: false };
    node.descendants((child) => {
      if (child.type.name === "sectionBreak") {
        section += 1;
        tail.broke = true;
        tail.after = false;
      } else if (tail.broke && child.isTextblock) tail.after = true;
      return !child.isTextblock;
    });
    opensMidPage = tail.after;
  });
  const schemes =
    normalizeSectionLayouts(attrs.sectionLayouts)?.map((layout) => layout.pageNumber ?? null) ?? [];
  const legacy = attrs.showPageNumbers === true;
  const labels =
    sheets.length && (legacy || schemes.some(Boolean))
      ? resolveSectionSheetPageNumberLabels(sheets, schemes, {
          legacy: legacy
            ? {
                format: attrs.pageNumberFormat as never,
                start: attrs.pageNumberStart as never,
                startSection: attrs.pageNumberStartSection as never,
              }
            : null,
        })
      : null;
  const numbering: SheetNumbering = labels
    ? {
        labels: labels.map((label) => label.first),
        numbers: labels.map((label) => (typeof label.firstNumber === "number" ? label.firstNumber : null)),
      }
    : null;
  labelsByDoc.set(doc, numbering);
  return numbering;
}








/**
 * The number physical page `page` stands for in its section's numbering
 * (Start at 10 makes the first page 10; a roman "ix" is 9): what a PAGE
 * field's own format switch formats. Null before numbering begins.
 */
export function documentPageNumberValue(doc: ProseMirrorNode, page: number): number | null {
  const numbering = sheetNumbering(doc);
  const index = Math.max(0, Math.floor(page) - 1);
  if (numbering) {
    if (numbering.labels[Math.min(index, numbering.labels.length - 1)] === null) return null;
    const value = numbering.numbers[Math.min(index, numbering.numbers.length - 1)];
    return typeof value === "number" ? value : null;
  }
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  const start = typeof attrs.pageNumberStart === "number" && Number.isFinite(attrs.pageNumberStart)
    ? Math.floor(attrs.pageNumberStart) : 1;
  return start + index;
}

/**
 * Whether two documents print the same label on each of `pages`. A document
 * numbered the plain way prints what its start and format say, so two such
 * documents are compared without reading their sheets.
 */
export function samePrintedPageLabels(a: ProseMirrorNode, b: ProseMirrorNode, pages: Iterable<number>): boolean {
  if (a === b) return true;
  const plain = (doc: ProseMirrorNode) => {
    const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
    return attrs.showPageNumbers !== true &&
      !(normalizeSectionLayouts(attrs.sectionLayouts)?.some((layout) => Boolean(layout.pageNumber ?? null)) ?? false);
  };
  if (plain(a) && plain(b)) {
    const left = (a.attrs ?? {}) as Record<string, unknown>, right = (b.attrs ?? {}) as Record<string, unknown>;
    return left.pageNumberStart === right.pageNumberStart && left.pageNumberFormat === right.pageNumberFormat;
  }
  for (const page of pages) if (documentPageNumberLabel(a, page) !== documentPageNumberLabel(b, page)) return false;
  return true;
}

export function documentPageNumberLabel(doc: ProseMirrorNode, page: number): string {
  const labels = sheetLabels(doc);
  const index = Math.max(0, Math.floor(page) - 1);
  const label = labels?.[Math.min(index, labels.length - 1)];
  if (typeof label === "string") return label;
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  return pageNumberLabel(index, attrs.pageNumberStart as never, attrs.pageNumberFormat as never);
}

/**
 * Generated-list rows (a table of contents) with the page each prints, as
 * Word's cached row holds its page's text: a row whose page prints otherwise
 * than its sheet's index ("iv" in a roman-numbered section, 1 where a section
 * restarts) keeps that label in `pageText`, which the Word and HTML exports
 * write; a row whose page prints its index keeps none.
 */
export function withPrintedPageLabels<T extends { pageNumber?: number; pageText?: string }>(
  doc: ProseMirrorNode,
  entries: readonly T[],
): T[] {
  return entries.map((entry) => {
    const page = entry.pageNumber ?? 1;
    const label = documentPageNumberLabel(doc, page);
    const next = { ...entry };
    if (label && label !== String(page) && label.length <= 32 && !/[\t\r\n]/.test(label)) next.pageText = label;
    else delete next.pageText;
    return next;
  });
}
