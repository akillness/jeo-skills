/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The empty paragraph a text-anchored floating table hangs from.
 *
 * Word writes a floating table (`w:tblpPr` with `w:vertAnchor="text"`)
 * before the paragraph it is anchored to, lays that paragraph out where the
 * flow is, and places the table relative to that paragraph's top; what
 * follows comes after the table. An EMPTY anchor paragraph therefore takes no
 * room of its own below the table: Word 16.86 draws it at the table's top and
 * starts the next paragraph right under the table (corpus R48-D21: the next
 * paragraph at the table's bottom, one page, where the editor's in-flow table
 * put the empty anchor below it as well and spilled a second page).
 *
 * The empty paragraph right after such a table, off a page, is given no
 * height. On a page, tablePageFrame places it from the table's drop and its
 * line (`tableFrameAnchorPlace`). Paint and layout only; nothing is saved.
 */
import { HOLDS_TABLE } from "../../../../lib/editor/sheet-facts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { FLOAT_BOTH_SIDES_MIN_STRIP_PX } from "./floatBothSidesWrap";
import {
  normalizeTablePositioning,
  tablePositioningIgnoredByWord,
  tablePositioningInlineFloat,
} from "./tablePositioning";

export const FLOATING_TABLE_ANCHOR_ATTR = "data-docs-floating-table-anchor";

/**
 * The CSS that floats a table placed at a distance from the PAGE's left edge
 * (`w:horzAnchor="page"` with `w:tblpX`) beside the text it is anchored to,
 * as Word draws it: at that distance, `w:tblpY` below its anchor paragraph's
 * top, the text wrapping on the side with room. No in-flow box can state the
 * page edge, so such a table was drawn at the left margin with everything
 * after it below it (corpus R07-D02: a contact table at 376 pt beside the
 * report's first paragraph, one page in Word, two here). The table's width is
 * its grid's; `null` when the first row does not state it, or for any other
 * placement.
 */
export interface PageOffsetTableFloat {
  readonly float: "left" | "right";
  readonly width: string;
  readonly marginTop: string;
  readonly marginBottom: string;
  readonly marginLeft: string;
  readonly marginRight: string;
}

export function pageOffsetTableFloat(table: ProseMirrorNode, pageWidthPx: number | null): PageOffsetTableFloat | null {
  if (table.type.name !== "table") return null;
  const positioning = normalizeTablePositioning(table.attrs.tablePositioning);
  if (
    !positioning || positioning.horizontalAnchor !== "page" || positioning.verticalAnchor !== "text" ||
    positioning.horizontal.mode !== "offset" || positioning.vertical.mode !== "offset"
  ) {
    return null;
  }
  const widthTwips = tableGridWidthTwips(table);
  if (widthTwips === null || !pageWidthPx || !(pageWidthPx > 0)) return null;
  const widthPx = widthTwips / 15;
  const xPx = positioning.horizontal.twips / 15;
  const topPx = Math.max(0, positioning.vertical.twips / 15);
  const distance = positioning.distanceFromText;
  const margin = "var(--page-margin-left, var(--page-margin-x, 96px))";
  const common = { width: `${widthPx}px`, marginTop: `${topPx}px`, marginBottom: `${distance.bottom / 15}px` };
  // A table right of the page's middle has the room for the text on its left.
  return xPx + widthPx / 2 > pageWidthPx / 2
    ? { float: "right", ...common, marginLeft: `${distance.left / 15}px`,
        marginRight: `calc(100% - (${xPx}px - ${margin}) - ${widthPx}px)` }
    : { float: "left", ...common, marginRight: `${distance.right / 15}px`, marginLeft: `calc(${xPx}px - ${margin})` };
}

/** The table's width as its first row's cells state it (twips), or null. */
function tableGridWidthTwips(table: ProseMirrorNode): number | null {
  const firstRow = table.firstChild;
  if (!firstRow || firstRow.childCount === 0) return null;
  let widthTwips = 0;
  for (let index = 0; index < firstRow.childCount; index += 1) {
    const widths: unknown = firstRow.child(index).attrs.colwidthTwips;
    if (!Array.isArray(widths) || widths.length === 0) return null;
    for (const value of widths) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
      widthTwips += value;
    }
  }
  return widthTwips;
}

/**
 * Whether a floating table leaves the text room beside it in the first
 * section's text column (its `*FromText` distances included): a strip that
 * holds a short word. Unknown widths read as no room.
 */
export function tableLeavesTextRoomBeside(table: ProseMirrorNode, doc: ProseMirrorNode): boolean {
  const positioning = normalizeTablePositioning(table.attrs.tablePositioning);
  const widthTwips = tableGridWidthTwips(table);
  const layouts: unknown = doc.attrs.sectionLayouts;
  const first = Array.isArray(layouts)
    ? (layouts[0] as { pageSize?: { widthTwips?: unknown }; pageMargins?: { leftTwips?: unknown; rightTwips?: unknown } } | undefined)
    : undefined;
  const page = Number(first?.pageSize?.widthTwips);
  const left = Number(first?.pageMargins?.leftTwips);
  const right = Number(first?.pageMargins?.rightTwips);
  if (!positioning || widthTwips === null || !(page > 0) || !Number.isFinite(left) || !Number.isFinite(right)) return false;
  const room = page - left - right - widthTwips - positioning.distanceFromText.left - positioning.distanceFromText.right;
  return room / 15 >= FLOAT_BOTH_SIDES_MIN_STRIP_PX;
}

/** The first section's paper width (px), before the pages are laid out. */
export function firstSectionPageWidthPx(doc: ProseMirrorNode): number | null {
  const layouts: unknown = doc.attrs.sectionLayouts;
  const first = Array.isArray(layouts) ? (layouts[0] as { pageSize?: { widthTwips?: unknown } } | undefined) : undefined;
  const twips = first?.pageSize?.widthTwips;
  return typeof twips === "number" && Number.isFinite(twips) && twips > 0 ? twips / 15 : null;
}

/** Whether `table` is a floating table anchored to the text after it. */
export function tableFloatsFromNextParagraph(table: ProseMirrorNode): boolean {
  if (table.type.name !== "table") return false;
  const positioning = normalizeTablePositioning(table.attrs.tablePositioning);
  return Boolean(positioning && positioning.verticalAnchor === "text" && !tablePositioningInlineFloat(positioning));
}

/**
 * Whether the paginator's pass draws `table` on its page where Word puts it
 * (`tablePageFrame`): a floating table Word does not ignore, not split
 * across pages. Its anchor paragraph then keeps its line beside it.
 */
export function tablePlacedOnItsPage(table: ProseMirrorNode): boolean {
  if (table.type.name !== "table") return false;
  if (table.attrs.pageTableContinues === true || table.attrs.pageTableContinuation === true) return false;
  const positioning = normalizeTablePositioning(table.attrs.tablePositioning);
  return Boolean(positioning && !tablePositioningIgnoredByWord(positioning));
}

function anchorDecorations(doc: ProseMirrorNode): DecorationSet {
  // Only a table floats its anchor.
  if (!HOLDS_TABLE.inDoc(doc)) return DecorationSet.empty;
  // The top-level blocks in order, across page sheets.
  const blocks: Array<{ node: ProseMirrorNode; pos: number; pageWidth: number | null; paged: boolean }> = [];
  doc.forEach((child, offset) => {
    if (child.type.name === "pageBlock") {
      const width = Number(child.attrs.pageWidth);
      const pageWidth = Number.isFinite(width) && width > 0 ? width : firstSectionPageWidthPx(doc);
      child.forEach((block, inner) => blocks.push({ node: block, pos: offset + 1 + inner, pageWidth, paged: true }));
    } else blocks.push({ node: child, pos: offset, pageWidth: firstSectionPageWidthPx(doc), paged: false });
  });
  const decorations: Decoration[] = [];
  for (let index = 0; index + 1 < blocks.length; index += 1) {
    const { node, pageWidth, paged } = blocks[index];
    // A table drawn on its page: tablePageFrame places its anchor paragraph
    // (`tableFrameAnchorPlace`), knowing the table's drop and the anchor's
    // line.
    if (paged && tablePlacedOnItsPage(node)) continue;
    if (!node.attrs.pageTableBlockContinues && pageOffsetTableFloat(node, pageWidth)) continue;
    if (!tableFloatsFromNextParagraph(node) || node.attrs.pageTableBlockContinues) continue;
    const next = blocks[index + 1];
    if (next.node.type.name !== "paragraph" || next.node.content.size > 0) continue;
    // Only an anchor that ends its section hangs from the table's top (R48-D21:
    // the anchor paragraph carries the section's mark). One the document goes
    // on after takes its line below a table the text cannot pass, as Word 16
    // draws it (corpus R100-D01, and a fixture: a full-width floating table,
    // its empty anchor, then "After": After stands a line below the table;
    // with "After" as the anchor itself it stands right under it).
    const after = blocks[index + 2]?.node;
    if (after && after.type.name !== "sectionBreak") continue;
    decorations.push(
      Decoration.node(next.pos, next.pos + next.node.nodeSize, {
        [FLOATING_TABLE_ANCHOR_ATTR]: "true",
        style: "height:0;min-height:0;margin-top:0;margin-bottom:0;padding-top:0;padding-bottom:0;overflow:visible",
      }),
    );
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const floatingTableAnchorKey = new PluginKey<DecorationSet>("floatingTableAnchor");

export const FloatingTableAnchor = Extension.create({
  name: "floatingTableAnchor",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: floatingTableAnchorKey,
        state: {
          init: (_config, state) => anchorDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? anchorDecorations(tr.doc) : previous),
        },
        props: {
          decorations: (state) => floatingTableAnchorKey.getState(state),
        },
      }),
    ];
  },
});
