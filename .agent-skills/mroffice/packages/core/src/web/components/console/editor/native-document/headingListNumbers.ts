/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The numbers a Word numbering gives the headings it numbers ("Heading 1"
 * bound to a multilevel list: 1 / 1.1 / 1.1.1, 第一章 …). An imported
 * numbered heading keeps its numbering on `attrs.source.listNumbering`
 * (`numId`, `level` and the numbering's own levels, `definition`); the editor
 * never holds such a heading in a list. Word counts every paragraph of one
 * numbering instance together, in document order, each level restarting
 * after the levels above it; the heading shows its level's text ("%1.%2")
 * and then its suffix (a tab, a space or nothing).
 *
 * One counter walk serves the heading's own drawn number
 * (headingNumberingExtension) and the table of contents' rows
 * (tableOfContents.ts), so both read the same number.
 */

import { HOLDS_HEADING, SheetFact } from "../../../../lib/editor/sheet-facts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { bulletGlyph, normalizeBulletStyle } from "./bulletListStyle";

import {
  ListCounterState,
  listMarkerText,
  normalizeListDefinition,
  type ListDefinition,
  type ListLevelSuffix,
} from "./listLevelDefinition";
import { fragmentCarries } from "./paged/fragmentRoles";

export interface HeadingListNumber {
  readonly label: string;
  readonly suffix: ListLevelSuffix;
}

const definitions = new WeakMap<object, ListDefinition | null>();

function definitionOf(raw: unknown): ListDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  if (definitions.has(raw)) return definitions.get(raw) ?? null;
  const definition = normalizeListDefinition(raw);
  definitions.set(raw, definition);
  return definition;
}

/** The source paragraph a piece of a paragraph split by its own page (or
 * column) break stands for, and the piece's place in it. */
function hardBreakPiece(source: object): { base: string; index: number; count: number } | null {
  const segment = (source as { hardBreakSegment?: unknown }).hardBreakSegment as
    | { index?: unknown; count?: unknown }
    | undefined;
  if (!segment || typeof segment !== "object") return null;
  const { index, count } = segment;
  if (typeof index !== "number" || typeof count !== "number" || !Number.isInteger(index) || !Number.isInteger(count)) return null;
  if (count < 2 || index < 0 || index >= count) return null;
  const anchor = (source as { sourceAnchor?: unknown }).sourceAnchor;
  const match = typeof anchor === "string" ? /^(word\/document\.xml#p\[\d+\])(?:\/seg\[\d+\])?$/.exec(anchor) : null;
  return match ? { base: match[1]!, index, count } : null;
}

/**
 * A numberer for headings visited in document order: each call counts one
 * heading of a Word numbering and returns its number, or null for a heading
 * no numbering numbers. `empty`: the heading holds nothing (the line of a
 * page break that opens its paragraph).
 *
 * The pieces of one paragraph a page break inside it split are one item of
 * the numbering: Word counts and draws its number once, on the paragraph's
 * first line with text. A paragraph opening with a page break draws it on
 * the next page, beside its words, and nothing at the foot of the page
 * before (Word for Mac, corpus R279-D12: "1.3 Glossary and abbreviations" on
 * page 4; the page drew "1.3" alone at the foot of page 3 and "1.4" over
 * the words, and every later number of the chapter one too high).
 */
export function createHeadingListNumberer(): (
  attrs: Record<string, unknown> | null | undefined,
  empty?: boolean,
) => HeadingListNumber | null {
  // One count per `chain`: Word counts the numbering instances of one
  // abstract definition as one list, and an instance's `w:startOverride`
  // starts that count again at its first item at the level (corpus R09-D04:
  // "1" for a restarting instance's Heading 1, then "2" for the next one of
  // another instance). A heading without a chain counts by its own instance.
  const counts = new Map<string, ListCounterState>();
  const restarted = new Set<string>();
  const numberedPieces = new Set<string>();
  return (attrs, empty = false) => {
    const source = attrs?.source;
    if (!source || typeof source !== "object") return null;
    const numbering = (source as { listNumbering?: unknown }).listNumbering;
    if (!numbering || typeof numbering !== "object") return null;
    const { type, numId, level, definition: rawDefinition, chain, restartLevels, itemsBefore } = numbering as Record<string, unknown>;
    if (type !== "ordered" || typeof numId !== "number" || !Number.isInteger(numId)) return null;
    const safeLevel = typeof level === "number" && Number.isInteger(level) ? Math.min(Math.max(level, 0), 8) : 0;
    const definition = definitionOf(rawDefinition);
    if (!definition) return null;
    const piece = hardBreakPiece(source);
    if (piece) {
      if (numberedPieces.has(piece.base)) return null;
      if (empty && piece.index < piece.count - 1) return null;
      numberedPieces.add(piece.base);
    }
    const key = typeof chain === "string" && /^[an][0-9]{1,10}$/.test(chain) ? chain : `n${numId}`;
    let state = counts.get(key);
    if (!state) {
      state = new ListCounterState();
      counts.set(key, state);
    }
    // The body paragraphs of this count Word numbered since its previous
    // heading (a TOC Heading based on a numbered Heading 1, a "1.1" clause
    // in Normal): Word counts every paragraph of a numbering instance in one
    // sequence, so the heading after them counts on (R457-D02: "1 Contents",
    // then "2 Executive summary").
    if (Array.isArray(itemsBefore)) {
      for (const item of itemsBefore.slice(0, 1000)) {
        const itemLevel = Array.isArray(item) ? item[0] : item;
        if (typeof itemLevel !== "number" || !Number.isInteger(itemLevel) || itemLevel < 0 || itemLevel > 8) continue;
        if (Array.isArray(item)) {
          // The first item of an instance that restarts the count at its
          // w:startOverride.
          const [, itemNumId, value] = item as unknown[];
          if (typeof itemNumId !== "number" || typeof value !== "number" || !Number.isInteger(value)) continue;
          restarted.add(`${itemNumId}:${itemLevel}`);
          state.seedLevel(itemLevel, value);
        }
        state.advance(definition, itemLevel);
      }
    }
    const restartKey = `${numId}:${safeLevel}`;
    if (
      Array.isArray(restartLevels) &&
      restartLevels.includes(safeLevel) &&
      !restarted.has(restartKey)
    ) {
      restarted.add(restartKey);
      state.seedLevel(safeLevel, definition.levels[safeLevel].start);
    }
    const values = state.advance(definition, safeLevel);
    const label = listMarkerText(definition, safeLevel, values);
    if (!label) return null;
    return { label, suffix: definition.levels[safeLevel]?.suffix ?? "tab" };
  };
}

const byDoc = new WeakMap<ProseMirrorNode, ReadonlyMap<number, HeadingListNumber>>();

/** Word's gallery name of a manual table of contents' content control. */
export const MANUAL_TOC_GALLERY = "Table of Contents";

/** Whether a manual table of contents' control opens with its title: a first
 *  paragraph that is no entry line and names no style of its own, which the
 *  DOCX writers style "TOC Heading". */
export function isManualTocTitle(
  type: string | undefined,
  attrs: Record<string, unknown> | null | undefined,
): boolean {
  return type === "paragraph" && !attrs?.tocEntryLeader && !attrs?.docxStyleId;
}

/**
 * The numbering Word gives a manual table of contents' title. The DOCX
 * writers put the title in the document's "TOC Heading" style (Word's own,
 * based on "Heading 1", when the document has none), and a style numbers its
 * paragraphs by the numbering it or a style it is based on names: with
 * Heading 1 bound to a multilevel list, Word draws "1 Contents" and counts
 * it, so the next Heading 1 reads 2 (Windows Word, R457-D02 in a cell and in
 * the body). The numbering's levels are those its imported headings carry.
 * Null when the title is not numbered or no heading carries its numbering.
 */
export function manualTocTitleListNumbering(
  docAttrs: Record<string, unknown> | null | undefined,
  headingNumberings: Iterable<unknown>,
): Record<string, unknown> | null {
  const definitions = docAttrs?.styleDefinitions as { styles?: unknown } | undefined;
  const styles = Array.isArray(definitions?.styles) ? (definitions.styles as Record<string, unknown>[]) : [];
  const byId = new Map<string, Record<string, unknown>>();
  let tocHeading: Record<string, unknown> | null = null;
  for (const style of styles) {
    if (!style || typeof style !== "object" || style.type !== "paragraph" || typeof style.styleId !== "string") continue;
    if (!byId.has(style.styleId)) byId.set(style.styleId, style);
    if (!tocHeading && typeof style.name === "string" && style.name.trim().toLowerCase() === "toc heading") tocHeading = style;
  }
  // Word's own TOC Heading (toc_word_catalog.json) is based on "Heading1".
  let style: Record<string, unknown> | undefined = tocHeading ?? byId.get("Heading1");
  let numPr: { numId: number; ilvl: number } | null = null;
  const seen = new Set<Record<string, unknown>>();
  while (style && !seen.has(style)) {
    seen.add(style);
    const own = style.numPr as { numId?: unknown; ilvl?: unknown } | undefined;
    if (own && typeof own === "object" && typeof own.numId === "number") {
      if (own.numId <= 0) return null;
      const ilvl = typeof own.ilvl === "number" && Number.isInteger(own.ilvl) ? own.ilvl : 0;
      numPr = { numId: own.numId, ilvl: Math.min(Math.max(ilvl, 0), 8) };
      break;
    }
    style = typeof style.basedOn === "string" ? byId.get(style.basedOn) : undefined;
  }
  if (!numPr) return null;
  for (const numbering of headingNumberings) {
    if (!numbering || typeof numbering !== "object") continue;
    const { type, numId, definition, chain } = numbering as Record<string, unknown>;
    if (numId !== numPr.numId) continue;
    if (type !== "ordered" || !definitionOf(definition)) return null;
    return { type, numId, level: numPr.ilvl, definition, ...(chain !== undefined ? { chain } : {}) };
  }
  return null;
}

/** Sheets that hold a heading or a manual table of contents. */
const HOLDS_LIST_NUMBERED = new SheetFact(
  (node) =>
    node.type.name === "heading" ||
    (node.type.name === "blockContentControl" && node.attrs.docPartGallery === MANUAL_TOC_GALLERY),
);

/** Every Word-numbered heading's number in `doc`, by the heading's position,
 *  and a manual table of contents' title's (manualTocTitleListNumbering). */
export function headingListNumbers(doc: ProseMirrorNode): ReadonlyMap<number, HeadingListNumber> {
  const known = byDoc.get(doc);
  if (known) return known;
  const numbers = new Map<number, HeadingListNumber>();
  const numberer = createHeadingListNumberer();
  let titleNumbering: Record<string, unknown> | null | undefined;
  const titleSource = () => {
    if (titleNumbering === undefined) {
      const numberings: unknown[] = [];
      HOLDS_HEADING.descendants(doc, (node) => {
        if (node.type.name !== "heading") return true;
        const source = node.attrs?.source;
        if (source && typeof source === "object") numberings.push((source as { listNumbering?: unknown }).listNumbering);
        return false;
      });
      titleNumbering = manualTocTitleListNumbering(doc.attrs as Record<string, unknown>, numberings);
    }
    return titleNumbering ? { source: { listNumbering: titleNumbering } } : null;
  };
  HOLDS_LIST_NUMBERED.descendants(doc, (node, pos) => {
    if (node.type.name === "blockContentControl" && node.attrs.docPartGallery === MANUAL_TOC_GALLERY) {
      const title = node.firstChild;
      const attrs = title && isManualTocTitle(title.type.name, title.attrs) ? titleSource() : null;
      const number = attrs ? numberer(attrs) : null;
      if (number) numbers.set(pos + 1, number);
      return true;
    }
    if (node.type.name !== "heading") return true;
    // The rest of a heading a page boundary cut is the same heading.
    if (!fragmentCarries("listLabel", node.attrs)) return false;
    const number = numberer(node.attrs, node.content.size === 0);
    if (number) numbers.set(pos, number);
    return false;
  });
  byDoc.set(doc, numbers);
  return numbers;
}


export interface HeadingListBullet extends HeadingListNumber {
  /** The bullet's own font (a symbol font's glyph), or null for the heading's. */
  readonly font: string | null;
}

const bulletsByDoc = new WeakMap<ProseMirrorNode, ReadonlyMap<number, HeadingListBullet>>();

/**
 * Every bulleted heading's bullet in `doc`, by the heading's position: an
 * imported heading a Word bullet numbering formats (`source.listNumbering`
 * of type "bullet", with the level's glyph and font or its gallery style).
 * Word draws the bullet in the heading's hanging indent and tabs to its text
 * (corpus R92-D13's Heading 3 / Heading 4 bullets); a table of contents
 * lists no bullet, so they are kept apart from the numbers.
 */
export function headingListBullets(doc: ProseMirrorNode): ReadonlyMap<number, HeadingListBullet> {
  const known = bulletsByDoc.get(doc);
  if (known) return known;
  const bullets = new Map<number, HeadingListBullet>();
  HOLDS_HEADING.descendants(doc, (node, pos) => {
    if (node.type.name !== "heading") return true;
    if (!fragmentCarries("listLabel", node.attrs)) return false;
    const source = node.attrs?.source;
    const numbering = source && typeof source === "object"
      ? (source as { listNumbering?: unknown }).listNumbering
      : null;
    if (!numbering || typeof numbering !== "object") return false;
    const { type, glyph, font, bulletStyle } = numbering as Record<string, unknown>;
    if (type !== "bullet") return false;
    const ownGlyph = typeof glyph === "string" && glyph.length >= 1 && glyph.length <= 4 && !/[\u0000-\u001f]/u.test(glyph)
      ? glyph
      : null;
    if (!ownGlyph && typeof bulletStyle !== "string") return false;
    const label = ownGlyph ?? bulletGlyph(normalizeBulletStyle(bulletStyle));
    const face = ownGlyph && typeof font === "string" && /^[^"\\;{}<>]{1,64}$/.test(font.trim()) ? font.trim() : null;
    bullets.set(pos, { label, suffix: "tab", font: face });
    return false;
  });
  bulletsByDoc.set(doc, bullets);
  return bullets;
}
