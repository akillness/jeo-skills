"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Chapter numbers for page numbers (Page Number Format > Include chapter
 * number): which chapter number each structural sheet shows before its page
 * number.
 *
 * Word takes the chapter number from the numbering of the heading style the
 * section names (w:chapStyle, Heading 1-9); the heading must be numbered, by
 * the document's heading numbering or by a numbered list on the heading
 * (Microsoft Support "Format page numbers": apply a chapter-numbering
 * multilevel list to the chapter headings first). A page takes the first
 * chapter heading on it, or else the last one before it, the way Word's
 * header/footer fields find a heading; pages before the first numbered
 * chapter heading show the bare page number.
 *
 * The number itself reuses the editor's own numbering math: the document's
 * heading numbering (headingNumbering.ts) or the heading's list counter
 * (listDefinitionMarkers.ts) formatted in its level's number format.
 */

import { useEffect, useState } from "react";
import type { Node as PmNode } from "@tiptap/pm/model";

import { computeHeadingNumbers } from "@mrnote/core/web/components/console/editor/native-document/headingNumbering.ts";
import {
  headingListDefinition,
  normalizeHeadingListKind,
  normalizeListLevel,
  probeListNumbering,
} from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import { formatListOrdinal } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

/** Heading level (1-9) → the chapter number in effect on one sheet. */
export type SheetChapterNumbers = Readonly<Record<number, string>>;

interface ChapterHeading {
  readonly sheet: number;
  readonly pos: number;
  readonly node: PmNode;
  readonly level: number;
}

function headingLevel(node: PmNode): number {
  const level = node.attrs.level;
  return typeof level === "number" && Number.isInteger(level) ? level : 1;
}

/** Every heading in document order, with the number it shows ("" when it
 * is not numbered). */
function numberedHeadings(doc: PmNode): {
  readonly headings: ChapterHeading[];
  readonly numbers: string[];
} {
  const headings: ChapterHeading[] = [];
  doc.forEach((sheet, offset, index) => {
    const visit = (node: PmNode, pos: number): boolean => {
      if (node.type.name === "heading") {
        // A heading split across pages is counted once, on its first page.
        if (fragmentCarries("headingEntry", node.attrs)) {
          headings.push({ sheet: index, pos, node, level: headingLevel(node) });
        }
        return false;
      }
      return !node.isTextblock;
    };
    // A paged document's children are sheets; an unpaged one's are blocks.
    if (visit(sheet, offset)) {
      sheet.descendants((node, pos) => visit(node, offset + 1 + pos));
    }
  });

  const numbers: string[] = new Array<string>(headings.length).fill("");
  if (doc.attrs?.headingNumbering === true) {
    computeHeadingNumbers(headings.map(({ level }) => ({ level }))).forEach(
      (number, index) => {
        numbers[index] = number;
      },
    );
  } else if (
    headings.some(
      ({ node }) => normalizeHeadingListKind(node.attrs.listKind) === "ordered",
    )
  ) {
    const probe = probeListNumbering(doc);
    headings.forEach(({ node, pos }, index) => {
      if (normalizeHeadingListKind(node.attrs.listKind) !== "ordered") return;
      const value = probe.values.get(pos);
      const definition = headingListDefinition(node.attrs);
      const format =
        definition?.levels[normalizeListLevel(node.attrs.listLevel)]?.format;
      if (value === undefined || !format || format === "bullet" || format === "none") {
        return;
      }
      numbers[index] = formatListOrdinal(format, value);
    });
  }
  return { headings, numbers };
}

/** The heading levels whose headings carry a number: the chapter styles a
 * page number can take a chapter number from. */
export function numberedChapterHeadingLevels(doc: PmNode): Set<number> {
  const { headings, numbers } = numberedHeadings(doc);
  const levels = new Set<number>();
  headings.forEach(({ level }, index) => {
    if (numbers[index]) levels.add(level);
  });
  return levels;
}

/** The chapter numbers in effect on each top-level sheet of `doc`. */
export function sheetChapterNumbers(doc: PmNode): SheetChapterNumbers[] {
  const { headings, numbers } = numberedHeadings(doc);
  const result: SheetChapterNumbers[] = [];
  const last: Record<number, string> = {};
  let cursor = 0;
  for (let sheet = 0; sheet < doc.childCount; sheet += 1) {
    const entry: Record<number, string> = { ...last };
    const firstOnSheet = new Set<number>();
    while (cursor < headings.length && headings[cursor].sheet === sheet) {
      const { level } = headings[cursor];
      const number = numbers[cursor];
      cursor += 1;
      if (!number) continue;
      if (!firstOnSheet.has(level)) {
        entry[level] = number;
        firstOnSheet.add(level);
      }
      last[level] = number;
    }
    result.push(entry);
  }
  return result;
}

function sameChapters(
  a: readonly SheetChapterNumbers[] | null,
  b: readonly SheetChapterNumbers[],
): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    const keys = Object.keys(entry);
    return (
      keys.length === Object.keys(other).length &&
      keys.every((key) => entry[Number(key)] === other[Number(key)])
    );
  });
}

interface ChapterEditorLike {
  readonly isDestroyed?: boolean;
  readonly state: { readonly doc: PmNode };
  on(event: "update", callback: () => void): unknown;
  off(event: "update", callback: () => void): unknown;
}

/**
 * The per-sheet chapter numbers, recomputed after each document change while
 * `active` (a section includes chapter numbers); null otherwise, so a
 * document without chapter page numbers walks nothing.
 */
export function useSheetChapterNumbers(
  editor: ChapterEditorLike | null | undefined,
  active: boolean,
): SheetChapterNumbers[] | null {
  const [chapters, setChapters] = useState<SheetChapterNumbers[] | null>(null);
  useEffect(() => {
    if (!active || !editor || editor.isDestroyed) return;
    let frame = 0;
    const recompute = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const next = sheetChapterNumbers(editor.state.doc);
      setChapters((previous) => (sameChapters(previous, next) ? previous : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(recompute);
    };
    recompute();
    editor.on("update", schedule);
    return () => {
      editor.off("update", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [active, editor]);
  return active ? chapters : null;
}
