/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's line grid belongs to a section.
 *
 * Each section's `w:sectPr` carries its own `w:docGrid`; only a typed one
 * (`lines`, `linesAndChars`, `snapToChars`) snaps that section's lines to the
 * pitch, while `<w:docGrid w:linePitch="360"/>` without a type is no grid at
 * all. The editor keeps one document-wide pitch (`docGridLinePitch`, read from
 * the last section), so a document whose earlier sections have no grid drew
 * every line of them on the later section's grid (corpus R49-D14: Calibri
 * 11 pt single lines 18 pt apart where Word 16.86 sets them 13.4 pt apart,
 * 13 pages for Word's 11). The paragraphs of a grid-free section are marked
 * `data-snap-to-grid="false"`, the per-paragraph opt-out the grid styles and
 * the paginator already honour. Paint and layout only; nothing is saved.
 */
import { pxToPt } from "../../../../lib/office-units";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { normalizeSectionLayouts } from "./sectionLayouts";
import { isEastAsianFontCodePoint } from "../../../office-ribbon/officeFontScriptSlots";

const GRID_TYPES = new Set(["lines", "linesAndChars", "snapToChars"]);

/**
 * The line pitch (twips) of the sections that carry a grid when the document
 * reads as grid-free only because its last section has none.
 *
 * The document-wide grid attrs are read from the last section (the body
 * `w:sectPr`). A document whose earlier section is typed `lines` and whose
 * last one has no grid (corpus R36-D29: a three-column section on a 16.3 pt
 * grid before an empty landscape section) was drawn without any grid: single
 * lines where Word sets them 16.3 pt apart, two pages for Word's three. Only
 * that blind spot is covered: an explicit document grid, a legacy pitch, a
 * gridded last section, or sections on different pitches return null. The
 * DOCX save writes the sections' own grids back unchanged in this state, so
 * the screen draws what Word will open.
 */
export function sectionOnlyLineGridPitch(attrs: Record<string, unknown> | null | undefined): number | null {
  if (!attrs || (attrs.manuscriptGrid != null && attrs.manuscriptGrid !== "off")) return null;
  if (attrs.docGridLinePitch != null && attrs.manuscriptGrid == null) return null;
  const layouts = normalizeSectionLayouts(attrs.sectionLayouts);
  if (!layouts || layouts.length < 2 || GRID_TYPES.has(String(layouts[layouts.length - 1].docGrid?.type))) return null;
  let pitch: number | null = null;
  for (const layout of layouts) {
    if (!GRID_TYPES.has(String(layout.docGrid?.type))) continue;
    const own = layout.docGrid?.linePitch;
    if (typeof own !== "number" || !Number.isInteger(own) || own < 20 || own > 2880) return null;
    if (pitch !== null && own !== pitch) return null;
    pitch = own;
  }
  return pitch;
}

/**
 * The line grid (twips) a generated table of contents is laid out on when the
 * body is not: the sections state a typed line grid, but the import left the
 * body off it because most body paragraphs opt out (`w:snapToGrid w:val="0"`,
 * so Word sets them off the grid too) while the table's rows, which Word
 * generates from the TOC N styles, do not. Word 16.86, the 296-page mp book
 * (grid 326 twips): its 10 pt TOC rows stand 16.35 pt apart, one grid line
 * each; set on the font's own line they packed a page more per sheet.
 */
export function generatedListLineGridPitch(attrs: Record<string, unknown> | null | undefined): number | null {
  if (!attrs || attrs.manuscriptGrid !== "lines" || attrs.docGridLinePitch != null) return null;
  const layouts = normalizeSectionLayouts(attrs.sectionLayouts);
  if (!layouts || layouts.length === 0) return null;
  let pitch: number | null = null;
  for (const layout of layouts) {
    if (!GRID_TYPES.has(String(layout.docGrid?.type))) continue;
    const own = layout.docGrid?.linePitch;
    if (typeof own !== "number" || !Number.isInteger(own) || own < 20 || own > 2880) return null;
    if (pitch !== null && own !== pitch) return null;
    pitch = own;
  }
  return pitch;
}

/** The document's line grid pitch (twips) as the body is laid out on it:
 * the declared `lines` grid, or the sections' own (`sectionOnlyLineGridPitch`). */
export function documentLineGridPitch(attrs: Record<string, unknown>): number | null {
  const pitch = Number(attrs.docGridLinePitch);
  if (attrs.manuscriptGrid === "lines") return Number.isFinite(pitch) && pitch > 0 ? pitch : null;
  return sectionOnlyLineGridPitch(attrs);
}

/** The document ranges `[from, to)` of the sections laid out without the line
 * grid while the document's grid is on; empty when every section has it. */
export function sectionsOffLineGrid(doc: ProseMirrorNode): Array<[number, number]> {
  const attrs = doc.attrs as Record<string, unknown>;
  if (documentLineGridPitch(attrs) === null) return [];
  const layouts = normalizeSectionLayouts(attrs.sectionLayouts);
  if (!layouts || layouts.length < 2 || !layouts.some((layout) => !GRID_TYPES.has(String(layout.docGrid?.type)))) {
    return [];
  }
  const breaks: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "sectionBreak") {
      breaks.push(pos);
      return false;
    }
    return !node.isTextblock;
  });
  // Without one break between each pair of sections the mapping is unknown.
  if (breaks.length !== layouts.length - 1) return [];
  const ranges: Array<[number, number]> = [];
  let from = 0;
  layouts.forEach((layout, index) => {
    const to = index < breaks.length ? breaks[index] : doc.content.size;
    if (!GRID_TYPES.has(String(layout.docGrid?.type)) && to > from) ranges.push([from, to]);
    from = to;
  });
  return ranges;
}

/** Whether `pos` lies in one of `ranges` (from `sectionsOffLineGrid`). */
export function offLineGridAt(ranges: ReadonlyArray<[number, number]>, pos: number): boolean {
  return ranges.some(([from, to]) => pos >= from && pos < to);
}

/**
 * Word's character grid ("Specify line and character grid", w:docGrid
 * w:type="linesAndChars"): every character of the section, Latin and East
 * Asian at any size, advances w:charSpace/4096 pt further; the grid's pitch is
 * the default font size plus that, so N characters of it fill a line (Word
 * 16.86, measured: charSpace 11605 on a 415 pt line sets 30 eleven-point
 * characters, 9 pt and 21 pt ones the same 2.833 pt apart more). The ranges
 * of the sections that have one, and the extra advance in points.
 */
export function sectionCharacterGrids(
  doc: ProseMirrorNode,
  type: "linesAndChars" | "snapToChars" = "linesAndChars",
): Array<[number, number, number]> {
  const layouts = normalizeSectionLayouts((doc.attrs as Record<string, unknown>).sectionLayouts);
  if (!layouts?.length) return [];
  const extra = (layout: (typeof layouts)[number]) =>
    layout.docGrid?.type === type && typeof layout.docGrid.charSpace === "number" && layout.docGrid.charSpace !== 0
      ? layout.docGrid.charSpace / 4096
      : 0;
  if (!layouts.some((layout) => extra(layout) !== 0)) return [];
  if (layouts.length === 1) return [[0, doc.content.size, extra(layouts[0]!)]];
  const breaks: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "sectionBreak") {
      breaks.push(pos);
      return false;
    }
    return !node.isTextblock;
  });
  if (breaks.length !== layouts.length - 1) return [];
  const ranges: Array<[number, number, number]> = [];
  let from = 0;
  layouts.forEach((layout, index) => {
    const to = index < breaks.length ? breaks[index]! : doc.content.size;
    const points = extra(layout);
    if (points !== 0 && to > from) ranges.push([from, to, points]);
    from = to;
  });
  return ranges;
}

function offGridDecorations(doc: ProseMirrorNode): DecorationSet {
  const ranges = sectionsOffLineGrid(doc);
  const decorations: Decoration[] = [];
  for (const [from, to, points] of sectionCharacterGrids(doc)) {
    const style = `--doc-grid-char-space:${Math.round(points * 1000) / 1000}pt`;
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (pos >= from) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "doc-char-grid", style }));
      }
      return false;
    });
  }
  // "Text snaps to character grid" (snapToChars): each East Asian character
  // takes whole cells of the pitch (the default font size plus charSpace),
  // one cell, or two for one larger than a cell; Latin keeps its width (Word
  // 16.86, measured: thirty 9-12 pt characters to a 30-character line, a 14
  // or 21 pt one two cells). A cell the manuscript paper draws (charSpace 0)
  // is the manuscript grid's own.
  const defaultPt = pxToPt(Number.parseFloat(String(doc.attrs?.defaultFontSize ?? "")) || 14);
  for (const [from, to, points] of sectionCharacterGrids(doc, "snapToChars")) {
    const pitch = Math.round((defaultPt + points) * 1000) / 1000;
    if (!(pitch > 0)) continue;
    const style = `--doc-grid-pitch:${pitch}pt`;
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !node.text || pos < from) return true;
      let start = -1;
      const text = node.text;
      for (let index = 0; index <= text.length; index += 1) {
        const cp = index < text.length ? text.codePointAt(index)! : -1;
        const eastAsian = cp >= 0 && isEastAsianFontCodePoint(cp);
        if (eastAsian && start < 0) start = index;
        if (!eastAsian && start >= 0) {
          decorations.push(Decoration.inline(pos + start, pos + index, { class: "doc-char-snap", style }));
          start = -1;
        }
        if (cp > 0xffff) index += 1;
      }
      return false;
    });
  }
  if (!ranges.length) {
    return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
  }
  for (const [from, to] of ranges) {
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (pos >= from) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-snap-to-grid": "false" }));
      }
      return false;
    });
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const sectionLineGridKey = new PluginKey<DecorationSet>("sectionLineGrid");

export const SectionLineGrid = Extension.create({
  name: "sectionLineGrid",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: sectionLineGridKey,
        state: {
          init: (_config, state) => offGridDecorations(state.doc),
          apply: (tr, previous, oldState, newState) =>
            tr.docChanged || oldState.doc.attrs !== newState.doc.attrs ? offGridDecorations(tr.doc) : previous,
        },
        props: {
          decorations: (state) => sectionLineGridKey.getState(state),
        },
      }),
    ];
  },
});
