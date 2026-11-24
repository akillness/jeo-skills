/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which pages are drawn hollow (L3 stage 2, `docs-hollow`): a node
 * decoration on each such page, read by its view (pageSheetView). The ledger
 * hollows a page it trusts and the reader is far from, and fills it again
 * when the reader nears it or a pass has to cut inside it; the decorations
 * move with the document like any other, and one on a page the document no
 * longer holds goes with it.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { HOLLOW_SHEET_SPEC } from "./pageSheetView";
import { sheetedDocHasFootnoteRefs } from "./footnoteRefs";
import { textEngineEnabled } from "../../../../../lib/text-engine/flags";

interface HollowMeta {
  /** Start positions of pages to draw hollow / to fill again. */
  readonly hollow?: readonly number[];
  readonly fill?: readonly number[] | "all";
}

export const pageHollowSheetsKey = new PluginKey<DecorationSet>("pageHollowSheets");

/** Views whose pages are all held whole (holdWholePages), by hold count. */
const holds = new WeakMap<EditorView, number>();

/** Hollow pages are drawn only with the engine laying the document out. */
export function hollowSheetsEnabled(): boolean {
  return textEngineEnabled("docs-hollow") && textEngineEnabled("docs-layout");
}

/** A print or a picture of the pages draws every page whole. */
function printing(view: EditorView): boolean {
  return typeof (view.dom.ownerDocument.defaultView as (Window & { __MRAI_PAGE_PREVIEW_SHOW?: unknown }) | null)?.__MRAI_PAGE_PREVIEW_SHOW === "function";
}

/** Fewer sheets than this are drawn whole: a short document has little to
 * gain from a page's content coming and going. */
export const HOLLOW_MIN_SHEETS = 30;
/** On an editor that never draws a page hollow (an AI draft's proof copy). */
export const NO_HOLLOW_ATTR = "data-docs-no-hollow";

/** Whether this document may have pages drawn hollow: long, and with no
 * footnotes (a page's notes are laid out from its drawn references). */
export function documentMayDrawHollow(doc: PmNode): boolean {
  return doc.childCount >= HOLLOW_MIN_SHEETS && !sheetedDocHasFootnoteRefs(doc);
}

/** Whether a page of this view may be drawn hollow now. Everything else
 * stays whole: every path here falls back to the whole page. */
export function viewMayDrawHollow(view: EditorView, doc: PmNode = view.state.doc): boolean {
  return hollowSheetsEnabled() && !holds.has(view) && !printing(view) && !view.dom.hasAttribute(NO_HOLLOW_ATTR) && documentMayDrawHollow(doc);
}

function pageAt(doc: PmNode, pos: number): PmNode | null {
  const node = doc.nodeAt(pos);
  return node && node.type.name === "pageBlock" ? node : null;
}

export function pageHollowSheetsPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: pageHollowSheetsKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr: Transaction, set: DecorationSet): DecorationSet {
        let next = set.map(tr.mapping, tr.doc);
        const meta = tr.getMeta(pageHollowSheetsKey) as HollowMeta | undefined;
        if (!meta) return next;
        if (meta.fill === "all") next = DecorationSet.empty;
        else if (meta.fill?.length) {
          const filled = new Set(meta.fill);
          next = next.remove(next.find().filter((decoration) => filled.has(decoration.from)));
        }
        if (meta.hollow?.length) {
          const have = new Set(next.find().map((decoration) => decoration.from));
          const added: Decoration[] = [];
          for (const pos of meta.hollow) {
            if (have.has(pos)) continue;
            const page = pageAt(tr.doc, pos);
            if (!page) continue;
            added.push(Decoration.node(pos, pos + page.nodeSize, {}, { [HOLLOW_SHEET_SPEC]: true }));
          }
          if (added.length) next = next.add(tr.doc, added);
        }
        return next;
      },
    },
    props: {
      decorations: (state: EditorState) => pageHollowSheetsKey.getState(state) ?? DecorationSet.empty,
    },
    // A selection coming into a hollow page draws that page whole in the
    // same dispatch: the view then scrolls to it with its content drawn
    // (a heading the navigation pane, a find or Go To leads to). The pages
    // between its two ends stay as they are until the reader nears them: the
    // selection is the state's, what a copy or a delete reads, and the page
    // draws it when it is drawn (Select All on a 300-page book built every
    // page's DOM).
    appendTransaction: (trs, _old, state) => {
      if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
      const set = pageHollowSheetsKey.getState(state);
      if (!set || set === DecorationSet.empty) return null;
      const { from, to } = state.selection;
      const holding = [...new Set([...set.find(from, from), ...set.find(to, to)].map((decoration) => decoration.from))];
      if (!holding.length) return null;
      return state.tr.setMeta(pageHollowSheetsKey, { fill: holding }).setMeta("addToHistory", false);
    },
    view: (editorView) => {
      let queued = false;
      // Every page, when the pages are printed, is drawn whole: after this
      // update, never inside it.
      const check = (view: EditorView) => {
        const set = pageHollowSheetsKey.getState(view.state);
        if (!set || set === DecorationSet.empty || queued) return;
        // Also a document that may no longer stand hollow (a footnote came
        // in, it is short now), and a view that never may.
        if (!printing(view) && (view.dom.hasAttribute(NO_HOLLOW_ATTR) || documentMayDrawHollow(view.state.doc))) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          if (view.isDestroyed) return;
          setHollowPages(view, { fill: "all" });
        });
      };
      check(editorView);
      return { update: (view) => check(view) };
    },
  });
}

/** Whether any page stands hollow. */
export function anyPageHollow(state: EditorState): boolean {
  const set = pageHollowSheetsKey.getState(state);
  return Boolean(set && set !== DecorationSet.empty);
}

/** The start positions of the pages drawn hollow. */
export function hollowPagePositions(state: EditorState): number[] {
  return (pageHollowSheetsKey.getState(state)?.find() ?? []).map((decoration) => decoration.from);
}

/** Whether the position stands on a page drawn hollow: nothing of it is drawn. */
export function positionOnHollowPage(state: EditorState, pos: number): boolean {
  const set = pageHollowSheetsKey.getState(state);
  return Boolean(set && set !== DecorationSet.empty && set.find(pos, pos).length);
}

/** Draw these pages hollow and / or fill those again, in one transaction that
 * changes no content and records no Undo step. */
export function setHollowPages(view: EditorView, change: HollowMeta): void {
  // Every page stays whole while something holds them so (a print's clone),
  // and on a document or a view that may not stand hollow.
  if (change.hollow?.length && !viewMayDrawHollow(view)) change = { ...(change.fill ? { fill: change.fill } : {}) };
  if (!change.hollow?.length && !(change.fill === "all" || change.fill?.length)) return;
  view.dispatch(view.state.tr.setMeta(pageHollowSheetsKey, change).setMeta("addToHistory", false));
}

/**
 * Draw whole again, now, the hollow pages that hold the positions from..to:
 * for a reader of the page's own elements at a place it knows by position (a
 * passage the AI panel locates, a circled region). Whether any was filled.
 */
export function fillHollowPagesAt(view: EditorView, from: number, to: number = from): boolean {
  const set = pageHollowSheetsKey.getState(view.state);
  if (!set || set === DecorationSet.empty) return false;
  const fill = set.find(from, to).map((decoration) => decoration.from);
  if (!fill.length) return false;
  setHollowPages(view, { fill });
  return true;
}

/**
 * Draw whole again, now, every hollow page holding a node `test` accepts:
 * for a feature that finds its target in the drawn page (a table of
 * contents row's heading, a link's bookmark) before it looks. The view
 * builds the pages inside the dispatch; the ledger hollows them again once
 * the reader is far and it trusts them. Whether any was filled.
 */
export function fillHollowPagesWhere(view: EditorView, test: (node: PmNode) => boolean): boolean {
  const hollow = new Set(hollowPagePositions(view.state));
  if (!hollow.size) return false;
  const fill: number[] = [];
  view.state.doc.forEach((page, offset) => {
    if (!hollow.has(offset)) return;
    let found = false;
    page.descendants((node) => {
      if (found) return false;
      if (test(node)) found = true;
      return !found;
    });
    if (found) fill.push(offset);
  });
  if (!fill.length) return false;
  setHollowPages(view, { fill });
  return true;
}


/**
 * Draw every page whole and keep it so until released: for a reader of the
 * drawn pages as a whole (Print clones the editor's DOM). Release once read;
 * the ledger hollows the far pages again afterwards.
 */
export function holdWholePages(view: EditorView): () => void {
  holds.set(view, (holds.get(view) ?? 0) + 1);
  if (hollowPagePositions(view.state).length) setHollowPages(view, { fill: "all" });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (holds.get(view) ?? 1) - 1;
    if (left > 0) holds.set(view, left);
    else holds.delete(view);
  };
}
