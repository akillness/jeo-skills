/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { AttrStep, ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import {
  collectHeadings,
  HEADING_ANCHOR_ID_ATTR,
  HEADING_TOC_ANCHOR_ID_ATTR,
  resolveTocSourceLevel,
  tocStyleLevelsOf,
  sanitizeAnchorId,
  sanitizeTocAnchorId,
  uniqueAnchorId,
} from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";
import {
  imeSafeAppendTransaction,
  isAnyImeCompositionActive,
} from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { INITIAL_PAGINATION_SETTLING_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import { PAGE_LEDGER_DEFERRED_ATTR } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import {
  anchorIncumbents,
  releaseDuplicateAnchorIds,
  transactionsMayDuplicateAnchors,
  type AnchorHolders,
} from "./anchorIncumbency";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

/**
 * TipTap extension that maintains a stable, sanitized `anchor_id` attribute on
 * heading nodes so the Table of Contents can link to a heading and have the link
 * survive edits to the heading text. The attribute is ADDITIVE: documents
 * written before this feature carry no `anchor_id` and still validate; the
 * attribute is back-filled lazily here.
 *
 * Anchor ids are rendered as a `data-anchor-id` (data attribute, never a raw
 * `id`) so a forged value can never collide with a host-page DOM id or be used
 * for CSS/JS-selector injection, and both parse and render re-run the slug
 * sanitizer so an imported value is always scrubbed.
 */

const ANCHOR_DATA_ATTR = "data-anchor-id";

/** Meta of the idle no-op transaction that lets the back-fill append. */
export const HEADING_ANCHOR_IDLE_BACKFILL_META = new PluginKey("headingAnchorIdleBackfill");
const IDLE_BACKFILL_TIMEOUT_MS = 2_000;
const IDLE_BACKFILL_RETRY_MS = 500;
/** Dispatches that left anchors missing (a read-only room refuses them). */
const IDLE_BACKFILL_MAX_ATTEMPTS = 3;
/** Retries while the page is busy (settling, composing, read-only): ~1 min;
 * a later document change asks again. */
const IDLE_BACKFILL_MAX_BUSY_WAITS = 120;

/**
 * Whether some TOC-eligible heading could take a back-filled id: one with no
 * (valid) stored id, or one repeating an earlier stored id. When every
 * eligible heading holds a unique valid id, {@link assignMissingHeadingAnchorIds}
 * keeps them all, so this cheap walk answers "nothing to do" without it.
 */
export function headingAnchorsMayNeedBackfill(doc: ProseMirrorNode): boolean {
  const seen = new Set<string>();
  let needed = false;
  const styleLevelOf = tocStyleLevelsOf(doc.attrs);
  doc.descendants((node) => {
    if (needed) return false;
    if (!node.isTextblock) return true;
    if (
      (node.type.name === "heading" || node.type.name === "paragraph") &&
      fragmentCarries("headingEntry", node.attrs) &&
      resolveTocSourceLevel(node.type.name, node.attrs, undefined, styleLevelOf) !== null
    ) {
      const id = sanitizeAnchorId(node.attrs?.[HEADING_ANCHOR_ID_ATTR]);
      if (!id || seen.has(id)) needed = true;
      else seen.add(id);
    }
    return false;
  });
  return needed;
}

/**
 * The back-fill below runs on the next transaction of any kind. A page whose
 * content arrived after the editor was created (an imported page carries no
 * anchor ids) otherwise paid it on the user's first scroll, click or key:
 * every heading re-created and its sheets measured and projected again
 * (~300 ms on a 20-sheet import). This lets it land at the first idle moment
 * once the page has settled, through the very same appendTransaction path:
 * a no-op transaction, so the ids, the appended transaction and its metas
 * are exactly those of today's lazy back-fill, and nothing marks the page
 * edited. It waits out an IME composition, the initial settle and a
 * deferred ledger pass, and stops after a few refused dispatches.
 */
function scheduleIdleHeadingAnchorBackfill(view: EditorView) {
  const win = view.dom.ownerDocument.defaultView;
  let handle: { idle: boolean; id: number } | null = null;
  let attempts = 0;
  let busyWaits = 0;
  let destroyed = false;
  const busy = () =>
    !view.editable ||
    view.composing ||
    isAnyImeCompositionActive() ||
    view.dom.getAttribute(INITIAL_PAGINATION_SETTLING_ATTR) === "true" ||
    view.dom.hasAttribute(PAGE_LEDGER_DEFERRED_ATTR);
  const run = () => {
    handle = null;
    if (destroyed || view.isDestroyed || attempts >= IDLE_BACKFILL_MAX_ATTEMPTS) return;
    if (!headingAnchorsMayNeedBackfill(view.state.doc)) return;
    // A busy page waits before the ids are worked out: they serialize the
    // whole document, and a page settles for minutes after every change
    // (a long document's print: every half second while it lays out).
    // `window.__docsAnchorBackfillBusyFirstOff = true`: worked out first, as before.
    const busyFirst =
      (win as (Window & { __docsAnchorBackfillBusyFirstOff?: boolean }) | null)?.__docsAnchorBackfillBusyFirstOff !== true;
    if (!busyFirst && !assignMissingHeadingAnchorIds(view.state.tr, view.state.doc)) return;
    if (busy()) {
      busyWaits += 1;
      if (busyWaits < IDLE_BACKFILL_MAX_BUSY_WAITS) schedule(IDLE_BACKFILL_RETRY_MS);
      return;
    }
    if (busyFirst && !assignMissingHeadingAnchorIds(view.state.tr, view.state.doc)) return;
    view.dispatch(view.state.tr.setMeta(HEADING_ANCHOR_IDLE_BACKFILL_META, true));
    if (assignMissingHeadingAnchorIds(view.state.tr, view.state.doc)) {
      attempts += 1;
      schedule(IDLE_BACKFILL_RETRY_MS);
    }
  };
  const schedule = (delayMs = 0) => {
    if (!win || destroyed || handle !== null || attempts >= IDLE_BACKFILL_MAX_ATTEMPTS) return;
    const idle = () => {
      if (typeof win.requestIdleCallback === "function") {
        handle = { idle: true, id: win.requestIdleCallback(run, { timeout: IDLE_BACKFILL_TIMEOUT_MS }) };
      } else {
        handle = { idle: false, id: win.setTimeout(run, 200) };
      }
    };
    if (delayMs > 0) handle = { idle: false, id: win.setTimeout(() => { handle = null; idle(); }, delayMs) };
    else idle();
  };
  schedule();
  return {
    update: (_view: EditorView, previous: { doc: ProseMirrorNode }) => {
      if (previous.doc === view.state.doc) return;
      busyWaits = 0;
      schedule();
    },
    destroy: () => {
      destroyed = true;
      if (!handle || !win) return;
      if (handle.idle) win.cancelIdleCallback?.(handle.id);
      else win.clearTimeout(handle.id);
      handle = null;
    },
  };
}
const TOC_ANCHOR_DATA_ATTR = "data-toc-anchor-id";

/**
 * Walk the doc and back-fill a sanitized, document-unique `anchor_id` on every
 * level-1..3 heading that is missing one (or whose stored value sanitizes to
 * empty). Mutates the given transaction; returns whether anything changed.
 *
 * The ids are derived through {@link collectHeadings} — the SAME pure helper the
 * Table of Contents NodeView renders from — and assigned back to the headings by
 * document position. Deriving both sides from one function guarantees the
 * back-filled `anchor_id` always equals the id the TOC link points at, even when
 * de-duplication, length-clamping, or a mix of stored/derived ids is in play.
 */
export function assignMissingHeadingAnchorIds(
  tr: Transaction,
  doc: ProseMirrorNode,
): boolean {
  // Canonical id for every TOC-eligible heading, in document order. This honors
  // stored anchor ids, derives slugs, de-duplicates, and applies the positional
  // fallback exactly as the rendered TOC does.
  const ids = collectHeadings(doc.toJSON()).map((h) => h.id);

  let changed = false;
  let index = 0;
  const styleLevelOf = tocStyleLevelsOf(doc.attrs);
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading" && node.type.name !== "paragraph") {
      return true;
    }
    if (!fragmentCarries("headingEntry", node.attrs)) return true;
    if (resolveTocSourceLevel(node.type.name, node.attrs, undefined, styleLevelOf) === null) return true;
    // `index` advances for every TOC-eligible heading (matching the position in
    // `collectHeadings`, which only enumerates the same set).
    const positional = index;
    index += 1;
    const current = sanitizeAnchorId(node.attrs?.[HEADING_ANCHOR_ID_ATTR]);
    const next = ids[positional];
    if (!next) return true;
    // A stored id is kept as it is; one the TOC had to de-duplicate (Enter
    
    // takes the id the TOC and the link dialog already list it under.
    if (current && current === next) return true;
    if (current && !ids.includes(current)) return true;
    if (current === next) return true;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      [HEADING_ANCHOR_ID_ATTR]: next,
    });
    changed = true;
    return true;
  });

  if (changed) {
    tr.setMeta("addToHistory", false);
  }
  return changed;
}

/**
 * Headings (and outline-level paragraphs) as holders of anchor ids. The rest
 * of a heading a page boundary cut repeats its head's id and is no holder.
 */
const HEADING_ANCHOR_HOLDERS: AnchorHolders = {
  idOf: (node) =>
    (node.type.name === "heading" || node.type.name === "paragraph") &&
    fragmentCarries("headingEntry", node.attrs)
      ? sanitizeAnchorId(node.attrs?.[HEADING_ANCHOR_ID_ATTR]) || null
      : null,
  attr: HEADING_ANCHOR_ID_ATTR,
};

/** Documents whose headings all carry the id the table of contents lists
 * them under: nothing to back-fill. */
const completeDocuments = new WeakSet<ProseMirrorNode>();

function holdsTextblock(node: ProseMirrorNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (found) return false;
    if (child.isTextblock) found = true;
    return !found;
  });
  return found;
}









function anchorCompleteWalkOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsAnchorCompleteWalkOff?: boolean }).__docsAnchorCompleteWalkOff === true;
}

/** pageRebalanceExtension's REBALANCE_META (a module this one does not load). */
const PAGE_LEDGER_REBALANCE_META = "structuralRebalance";

function mayTouchHeadings(transactions: readonly Transaction[]): boolean {
  for (const tr of transactions) {
    // The page ledger moves blocks between sheets (the same nodes) and cuts
    // a block into a head and continuation pieces, which are never anchors
    // (SPLIT_CONTINUATION_ATTR): the headings the ids are collected from are
    // the ones they were. Serializing the whole book to find that cost each
    // of its passes ~50 ms on the 298-page book.
    if (tr.getMeta(PAGE_LEDGER_REBALANCE_META) === true) continue;
    for (let index = 0; index < tr.steps.length; index += 1) {
      const step = tr.steps[index];
      const doc = tr.docs[index];
      if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
        const { from, to, slice } = step as unknown as { from: number; to: number; slice: { content: ProseMirrorNode["content"] } };
        let found = false;
        slice.content.forEach((child) => {
          if (!found && (child.isTextblock || holdsTextblock(child))) found = true;
        });
        if (found) return true;
        // Text typed or deleted within one text block that holds no anchor id
        // (an ordinary paragraph) adds, removes or renames no heading: every
        // keystroke of a long book serialized all of it to find that.
        const $from = doc.resolve(from), $to = doc.resolve(to);
        if ($from.parent === $to.parent && $from.parent.isTextblock) {
          const block = $from.parent;
          const holder = fragmentCarries("headingEntry", block.attrs) &&
            resolveTocSourceLevel(block.type.name, block.attrs, undefined, tocStyleLevelsOf(doc.attrs)) !== null;
          if (holder) return true;
          continue;
        }
        doc.nodesBetween(from, to, (node) => {
          if (found) return false;
          if (node.isTextblock) found = true;
          return !found;
        });
        if (found) return true;
        continue;
      }
      if (step instanceof AttrStep) {
        const node = doc.nodeAt(step.pos);
        if (!node || node.isTextblock) return true;
        continue;
      }
      return true;
    }
  }
  return false;
}

export const HeadingAnchorIdExtension = Extension.create({
  name: "headingAnchorIds",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          [HEADING_ANCHOR_ID_ATTR]: {
            default: null,
            parseHTML: (element) =>
              sanitizeAnchorId(element.getAttribute(ANCHOR_DATA_ATTR)) || null,
            renderHTML: (attributes) => {
              const anchorId = sanitizeAnchorId(
                attributes[HEADING_ANCHOR_ID_ATTR],
              );
              return anchorId ? { [ANCHOR_DATA_ATTR]: anchorId } : {};
            },
          },
          // Imported Word headings may additionally carry an opaque `_Toc…`
          // alias.  Render it as a data attribute (never a host-page `id`) so
          // cached TOC hyperlinks can resolve exactly without replacing the
          // heading's normal editable anchor_id.
          [HEADING_TOC_ANCHOR_ID_ATTR]: {
            default: null,
            parseHTML: (element) =>
              sanitizeTocAnchorId(element.getAttribute(TOC_ANCHOR_DATA_ATTR)) ||
              null,
            renderHTML: (attributes) => {
              const tocAnchorId = sanitizeTocAnchorId(
                attributes[HEADING_TOC_ANCHOR_ID_ATTR],
              );
              return tocAnchorId ? { [TOC_ANCHOR_DATA_ATTR]: tocAnchorId } : {};
            },
          },
        },
      },
    ];
  },

  onCreate({ editor }) {
    const tr = editor.state.tr;
    if (assignMissingHeadingAnchorIds(tr, editor.state.doc)) {
      if (editor.state.storedMarks) tr.setStoredMarks(editor.state.storedMarks);
      editor.view.dispatch(tr);
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => scheduleIdleHeadingAnchorBackfill(view),
        appendTransaction: imeSafeAppendTransaction(
          (transactions, oldState, newState) => {
            // The ids are a function of the document alone, and a document
            // found complete stays complete. A transaction that leaves it as
            // it was (a caret move, a layout stamp, a decoration) meets the
            // same document again: serializing all of it to find nothing to
            // back-fill cost every one of them (five dispatches a keystroke
            // on a long document).
            if (completeDocuments.has(newState.doc)) return null;
            if (completeDocuments.has(oldState.doc) && !mayTouchHeadings(transactions)) {
              completeDocuments.add(newState.doc);
              return null;
            }
            const tr = newState.tr;
            // A heading copied and pasted brings the original's id along: the
            // heading that already held it keeps it, so the references made to
            // it go on naming it, and the copy takes an id of its own (WUA 055;
            // Word keeps the bookmark on the original).
            const released =
              transactionsMayDuplicateAnchors(HEADING_ANCHOR_HOLDERS, transactions) &&
              releaseDuplicateAnchorIds(
                tr,
                HEADING_ANCHOR_HOLDERS,
                anchorIncumbents(HEADING_ANCHOR_HOLDERS, oldState.doc, transactions),
                // The copy is listed under the id's next suffix, as the table
                
                uniqueAnchorId,
              );
            // Every outline heading holding an id of its own: the ids stand
            // as they are, found by a walk of the blocks, not by serializing
            // the whole document. A page laid out for print sets attributes
            // on its paragraphs many times a second, and each such
            // transaction serialized all of it (R492-D04's 1 886 pages: 50 s
            // of an 850 s print). `window.__docsAnchorCompleteWalkOff = true`:
            // serialized every time, as before.
            if (!released && !anchorCompleteWalkOff() && !headingAnchorsMayNeedBackfill(tr.doc)) {
              completeDocuments.add(newState.doc);
              return null;
            }
            if (!assignMissingHeadingAnchorIds(tr, tr.doc) && !released) {
              completeDocuments.add(newState.doc);
              return null;
            }
            tr.setMeta("addToHistory", false);
            // Back-filling identity is not a formatting change. Retain the
            // chosen typing style, including on a newly styled empty heading.
            if (newState.storedMarks) tr.setStoredMarks(newState.storedMarks);
            return tr;
          },
        ),
      }),
    ];
  },
});
