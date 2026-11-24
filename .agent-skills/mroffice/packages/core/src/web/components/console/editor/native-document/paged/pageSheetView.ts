/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A page's sheet, drawn whole or hollow (L3 stage 2, `docs-hollow` with
 * docs-layout).
 *
 * Word and ONLYOFFICE build a view only for the pages in front of the
 * reader; every other page is its layout alone. Here a page the ledger
 * trusts and the reader is far from is drawn as its paper: the sheet as the
 * schema draws it (its size, its section's attributes), no content -- the
 * view builds no DOM for its blocks and no plugin decorates them. The page's
 * layout is the ledger's (its measurements, kept by node). A decoration on
 * the page (`hollowSheet` in its spec, pageHollowSheets) says which way it is
 * drawn; when that changes the view asks to be built again (`update` false),
 * so a page coming near is drawn whole, with its content, before it shows.
 */
import { DOMSerializer, type Node as PmNode } from "@tiptap/pm/model";
import type { Decoration, NodeView } from "@tiptap/pm/view";

/** On a sheet drawn hollow: its paper alone. */
export const HOLLOW_SHEET_ATTR = "data-page-hollow";
/** The spec key of the decoration that draws a page hollow. */
export const HOLLOW_SHEET_SPEC = "hollowSheet";

export function hollowByDecorations(decorations: readonly Decoration[]): boolean {
  return decorations.some((decoration) => (decoration.spec as Record<string, unknown> | undefined)?.[HOLLOW_SHEET_SPEC] === true);
}

function sameAttrs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key] || JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/** The page node view: the schema's own sheet, with its content or hollow. */
export function createPageSheetView(node: PmNode, decorations: readonly Decoration[], doc: Document = document): NodeView {
  const toDOM = node.type.spec.toDOM;
  if (!toDOM) throw new Error("pageBlock has no toDOM");
  const { dom, contentDOM } = DOMSerializer.renderSpec(doc, toDOM(node));
  const hollow = hollowByDecorations(decorations);
  if (hollow && dom instanceof HTMLElement) dom.setAttribute(HOLLOW_SHEET_ATTR, "");
  let current = node;
  return {
    dom,
    ...(hollow || !contentDOM ? {} : { contentDOM }),
    update(next, nextDecorations) {
      if (next.type !== current.type) return false;
      // Drawn the other way now, or with other attributes: built again.
      if (hollowByDecorations(nextDecorations) !== hollow) return false;
      if (!sameAttrs(next.attrs, current.attrs)) return false;
      current = next;
      return true;
    },
    // A hollow sheet holds nothing the editor reads back.
    ...(hollow ? { ignoreMutation: () => true } : {}),
  };
}
