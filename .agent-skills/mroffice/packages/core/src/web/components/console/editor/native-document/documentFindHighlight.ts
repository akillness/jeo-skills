/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { MRNOTE_BLOCK_IDENTITY_META } from "./blockIds";
import { REBALANCE_META } from "./paged/pageRebalanceExtension";

/**
 * Whether these transactions changed only how the document falls on its
 * pages: the page ledger's moves (its meta, kept out of Undo) and the stamp
 * of a block's identity. The text and its order are the same after them, so
 * every match is still there, at a position the mapping gives or, where a
 * block was taken out and put in again, found again in the same order.
 * A long document lays itself out with these for seconds after it opens.
 */
export function paginationOnlyChange(transactions: readonly Transaction[]): boolean {
  let changed = false;
  for (const tr of transactions) {
    if (!tr.docChanged) continue;
    changed = true;
    const pagination = tr.getMeta(REBALANCE_META) === true && tr.getMeta("addToHistory") === false;
    if (!pagination && tr.getMeta(MRNOTE_BLOCK_IDENTITY_META) !== true) return false;
  }
  return changed;
}

/**
 * Word's Find highlighting in the document: while the Navigation / Find and
 * Replace pane holds a query, every match is painted (Word's Reading
 * Highlight > Highlight All, a yellow background) and the match the pane is
 * on is painted distinctly (orange here; Word shows it as the selection).
 *
 * The highlight is VIEW state only: inline decorations, never a mark, so it
 * never reaches the document, its history, collaboration or any export. The
 * plugin is registered on the searched editor while the pane is open and
 * unregistered when it closes, which clears the paint.
 *
 * The matches are recomputed from the new document on every document change,
 * so typing keeps the paint in sync without the pane dispatching anything.
 */

export interface DocumentFindHighlightRange {
  readonly from: number;
  readonly to: number;
}

export type DocumentFindHighlightCollect = (
  doc: ProseMirrorNode,
) => readonly DocumentFindHighlightRange[];

interface DocumentFindHighlightState {
  readonly collect: DocumentFindHighlightCollect | null;
  readonly current: DocumentFindHighlightRange | null;
  readonly count: number;
  readonly decorations: DecorationSet;
}

export interface DocumentFindHighlightMeta {
  /** A new matcher (a new query or option); null clears the paint. */
  readonly collect?: DocumentFindHighlightCollect | null;
  /** The match the pane is on; null for none. */
  readonly current?: DocumentFindHighlightRange | null;
}

export const DOCUMENT_FIND_MATCH_CLASS = "document-find-match";
export const DOCUMENT_FIND_CURRENT_CLASS = "document-find-match--current";

export const documentFindHighlightKey =
  new PluginKey<DocumentFindHighlightState>("documentFindHighlight");

const EMPTY: DocumentFindHighlightState = {
  collect: null,
  current: null,
  count: 0,
  decorations: DecorationSet.empty,
};

function paint(
  doc: ProseMirrorNode,
  collect: DocumentFindHighlightCollect | null,
  current: DocumentFindHighlightRange | null,
): DocumentFindHighlightState {
  if (!collect) return { ...EMPTY, current };
  const ranges = collect(doc);
  const size = doc.content.size;
  const decorations: Decoration[] = [];
  for (const range of ranges) {
    if (range.from < 0 || range.to > size || range.to <= range.from) continue;
    const isCurrent =
      current !== null &&
      current.from === range.from &&
      current.to === range.to;
    const attrs = {
      class: isCurrent
        ? `${DOCUMENT_FIND_MATCH_CLASS} ${DOCUMENT_FIND_CURRENT_CLASS}`
        : DOCUMENT_FIND_MATCH_CLASS,
      "data-document-find-match": isCurrent ? "current" : "match",
    };
    // A match in a block object (a display equation) paints the object: an
    // inline decoration has no text there to paint.
    const node = range.to === range.from + 1 ? doc.nodeAt(range.from) : null;
    decorations.push(
      node?.isBlock && node.isLeaf
        ? Decoration.node(range.from, range.to, attrs)
        : Decoration.inline(range.from, range.to, attrs),
    );
  }
  return {
    collect,
    current,
    count: decorations.length,
    decorations: DecorationSet.create(doc, decorations),
  };
}

function mapRange(tr: Transaction, range: DocumentFindHighlightRange): DocumentFindHighlightRange | null {
  const from = tr.mapping.map(range.from, 1);
  const to = tr.mapping.map(range.to, -1);
  return to > from ? { from, to } : null;
}

export function createDocumentFindHighlightPlugin(): Plugin<DocumentFindHighlightState> {
  return new Plugin<DocumentFindHighlightState>({
    key: documentFindHighlightKey,
    state: {
      init: () => EMPTY,
      apply(tr, value, _oldState, newState) {
        const meta = tr.getMeta(documentFindHighlightKey) as
          | DocumentFindHighlightMeta
          | undefined;
        if (!meta && !tr.docChanged) return value;
        // The pages moved, the text did not: the paint moves with it. Only
        // where a block was taken out and put in again (a move between pages)
        // is the document searched again, as before.
        if (!meta && value.collect && paginationOnlyChange([tr])) {
          const decorations = value.decorations.map(tr.mapping, tr.doc);
          if (decorations.find().length === value.count) {
            const current = value.current ? mapRange(tr, value.current) : null;
            return { ...value, current, decorations };
          }
        }
        const collect =
          meta && "collect" in meta ? (meta.collect ?? null) : value.collect;
        let current =
          meta && "current" in meta ? (meta.current ?? null) : value.current;
        if (!(meta && "current" in meta) && current && tr.docChanged) {
          current = mapRange(tr, current);
        }
        return paint(newState.doc, collect, current);
      },
    },
    props: {
      decorations(state) {
        return documentFindHighlightKey.getState(state)?.decorations;
      },
    },
  });
}

/** How many matches the live paint holds (tests and the gallery read it). */
export function documentFindHighlightCount(state: EditorState): number {
  return documentFindHighlightKey.getState(state)?.count ?? 0;
}
