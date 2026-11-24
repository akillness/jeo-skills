/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The page numbers of a table of contents or a table of figures a command
 * has just generated are read again once the table has been laid out.
 *
 * Insert, Update Table and the dialog's OK read the entries from the pages
 * as they stand before the table takes its room; a table that adds pages
 * moves every heading after it. Word shows the right numbers at once (see
 * generatedListEntries for the measurement), so when the page ledger reports
 * the document laid out, the tables those commands touched get one "Update
 * page numbers only": the entries' text and membership stay, the numbers
 * are the pages the headings now stand on. It is an edit like the command
 * itself: only an authored change reaches the shared document and the save
 * (a change kept out of history stays in this view alone until the next
 * gesture), and following the command at once it joins its Undo step.
 *
 * Only entries a command marked are settled; an opened document, a pasted
 * table, an undone edit or a collaborator's change never is.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  normalizeCaptionListLabel,
  normalizeGeneratedCaptionListEntries,
  updateGeneratedCaptionListEntries,
} from "@mrnote/core/web/components/console/editor/native-document/captions.ts";
import { withPrintedPageLabels } from "@mrnote/core/web/components/console/editor/native-document/documentPageNumbers.ts";
import { consumeGeneratedListEntries, isFreshGeneratedListEntries } from "@mrnote/core/web/components/console/editor/native-document/generatedListEntries.ts";
import { rowSliceChainAt } from "./paged/atomRowSliceExtension";
import { PAGE_BLOCK_NODE, PAGE_LEDGER_CONVERGED_EVENT } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { captionListEntries } from "@mrnote/core/web/components/console/editor/native-document/referencesButtons.ts";
import { normalizeGeneratedListSettings, normalizeTocSettings, tocSourceLevelResolver } from "@mrnote/core/web/components/console/editor/native-document/referenceSettings.ts";
import { collectHeadingsFromDoc, normalizeTocEntrySnapshot, updateTocEntrySnapshot } from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";

const GENERATED_LIST_TYPES: ReadonlySet<string> = new Set(["tableOfContents", "listOfFigures"]);
/** The paginator's own transactions (pageRebalanceExtension REBALANCE_META). */
const STRUCTURAL_REBALANCE_META = "structuralRebalance";

interface SettleState {
  /** Positions of tables whose page numbers wait for the layout. */
  pending: readonly number[];
}

export const generatedListPageNumbersKey = new PluginKey<SettleState>("mrnote-generated-list-page-numbers");

const NONE: SettleState = { pending: [] };

function isFreshList(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node) && GENERATED_LIST_TYPES.has(node!.type.name) && isFreshGeneratedListEntries(node!.attrs.cachedEntries);
}

function sliceHoldsFreshList(slice: Slice | undefined): boolean {
  if (!slice || slice.content.size === 0) return false;
  let found = false;
  slice.content.descendants((node) => {
    if (found) return false;
    if (isFreshList(node)) found = true;
    // Generated lists are blocks of a page (or of the flat document).
    return !found && node.type.name === PAGE_BLOCK_NODE;
  });
  return found;
}

/** The tables holding freshly generated entries that `transaction` put in
 * the document, by position in its final document. */
function freshListsOf(transaction: Transaction): number[] {
  const found: number[] = [];
  transaction.steps.forEach((step, index) => {
    if (!sliceHoldsFreshList((step as unknown as { slice?: Slice }).slice)) return;
    const rest = transaction.mapping.slice(index + 1);
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const from = rest.map(newStart, -1);
      const to = rest.map(newEnd, 1);
      transaction.doc.nodesBetween(from, to, (node, pos) => {
        if (isFreshList(node) && !found.includes(pos)) found.push(pos);
        return node.type.name === PAGE_BLOCK_NODE;
      });
    });
  });
  return found;
}

/** The entries with the pages their targets stand on now, or null when the
 * numbers already agree (or the table keeps no entries of its own). */
export function settledGeneratedListEntries(doc: ProseMirrorNode, node: ProseMirrorNode): unknown[] | null {
  if (node.type.name === "tableOfContents") {
    const cached = normalizeTocEntrySnapshot(node.attrs.cachedEntries);
    if (!cached) return null;
    // "Update page numbers only" reads every heading the table could list.
    const live = collectHeadingsFromDoc(doc, tocSourceLevelResolver(normalizeTocSettings(node.attrs)));
    const next = withPrintedPageLabels(doc, updateTocEntrySnapshot(cached, live, "pageNumbers"));
    return next.some(
      (entry, index) =>
        (entry.pageNumber ?? 1) !== (cached[index]?.pageNumber ?? 1) ||
        entry.pageText !== cached[index]?.pageText,
    )
      ? next
      : null;
  }
  if (node.type.name === "listOfFigures") {
    const cached = normalizeGeneratedCaptionListEntries(node.attrs.cachedEntries);
    if (!cached) return null;
    const kind = normalizeCaptionListLabel(node.attrs.kind);
    const live = captionListEntries(doc, kind, normalizeGeneratedListSettings(node.attrs).includeLabel);
    const next = updateGeneratedCaptionListEntries(cached, live, "pageNumbers");
    return next.some((entry, index) => entry.pageNumber !== cached[index]?.pageNumber) ? next : null;
  }
  return null;
}

/**
 * The transaction that settles the page numbers of every waiting table of
 * `view`'s document (and clears the wait), or null when none waits.
 */
export function buildGeneratedListPageNumberSettle(view: EditorView): Transaction | null {
  const state = generatedListPageNumbersKey.getState(view.state);
  if (!state || state.pending.length === 0) return null;
  const doc = view.state.doc;
  const tr = view.state.tr;
  const seen = new Set<number>();
  for (const pos of state.pending) {
    // A table the pages cut is several copies of one node: all of them carry
    // its entries.
    const copies = rowSliceChainAt(doc, pos).filter((copy) => GENERATED_LIST_TYPES.has(copy.node.type.name));
    if (copies.length === 0 || copies.some((copy) => seen.has(copy.pos))) continue;
    const settled = settledGeneratedListEntries(doc, copies[0].node);
    for (const copy of copies) {
      seen.add(copy.pos);
      consumeGeneratedListEntries(copy.node.attrs.cachedEntries);
      if (settled) tr.setNodeMarkup(copy.pos, undefined, { ...copy.node.attrs, cachedEntries: settled }, copy.node.marks);
    }
  }
  return tr.setMeta(generatedListPageNumbersKey, "settled");
}

export const GeneratedListPageNumbers = Extension.create({
  name: "generatedListPageNumbers",

  addProseMirrorPlugins() {
    return [
      new Plugin<SettleState>({
        key: generatedListPageNumbersKey,
        state: {
          init: () => NONE,
          apply(transaction, value, _oldState, newState) {
            if (transaction.getMeta(generatedListPageNumbersKey) === "settled") return NONE;
            let pending = value.pending;
            if (!transaction.docChanged) return value;
            if (pending.length > 0) {
              // The pages may cut the table while it waits: its copies come
              // and go, its first copy stays. Wait on that one.
              pending = pending
                .map((pos) => transaction.mapping.map(pos, 1))
                .filter((pos) => GENERATED_LIST_TYPES.has(newState.doc.nodeAt(pos)?.type.name ?? ""))
                .map((pos) => rowSliceChainAt(newState.doc, pos)[0]?.pos ?? pos)
                .filter((pos, index, all) => all.indexOf(pos) === index);
            }
            // The paginator copies a table's node from page to page; that
            // is no command.
            if (transaction.getMeta(STRUCTURAL_REBALANCE_META) !== true) {
              const fresh = freshListsOf(transaction)
                .map((pos) => rowSliceChainAt(newState.doc, pos)[0]?.pos ?? pos)
                .filter((pos, index, all) => all.indexOf(pos) === index && !pending.includes(pos));
              if (fresh.length > 0) pending = [...pending, ...fresh];
            }
            const same = pending.length === value.pending.length && pending.every((pos, index) => pos === value.pending[index]);
            return same ? value : { pending };
          },
        },
        view(view) {
          let queued = false;
          const onConverged = () => {
            if (queued || (generatedListPageNumbersKey.getState(view.state)?.pending.length ?? 0) === 0) return;
            queued = true;
            // Outside the ledger's own pass.
            queueMicrotask(() => {
              queued = false;
              if (view.isDestroyed) return;
              const settle = buildGeneratedListPageNumberSettle(view);
              if (settle) view.dispatch(settle);
            });
          };
          view.dom.addEventListener(PAGE_LEDGER_CONVERGED_EVENT, onConverged);
          return {
            destroy() {
              view.dom.removeEventListener(PAGE_LEDGER_CONVERGED_EVENT, onConverged);
            },
          };
        },
      }),
    ];
  },
});

export default GeneratedListPageNumbers;
