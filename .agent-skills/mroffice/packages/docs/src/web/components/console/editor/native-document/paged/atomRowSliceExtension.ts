/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Schema bridge and integrity rules for row-sliced atoms (atomRowSlices).
 *
 * Register beside the page ledger. It does not paginate: it lets the two
 * range attributes exist on the generated lists, and it keeps the copies the
 * ledger makes of one list ONE object for everything that is not pagination:
 *
 *   - removing a copy removes the list (Delete on the selected table of
 *     contents, Remove Table of Contents, a cut, a drag, typing over it);
 *   - a change to one copy's own attributes is the list's (Update Table and
 *     the References dialogs act on the copy that is selected; an entry typed
 *     in a copy on page 2 is the table's entry). The storage merge keeps the
 *     first copy's attributes, so without this an edit made in a later copy
 *     would be dropped at the next save;
 *   - copies that no longer line up (a block pushed between two of them by a
 *     remote edit, a copy dropped somewhere else) fold back into one whole
 *     list, which the ledger then cuts again.
 *
 * `tableFragmentGroups.buildTableFragmentAttrsSync` is the same rule for the
 * page fragments of a table.
 */
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { imeReplayingAppendTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import {
  ROW_SLICED_ATOM_TYPES,
  ROW_SLICE_END_ATTR,
  ROW_SLICE_INTEGRITY_META,
  ROW_SLICE_START_ATTR,
  isRowSliced,
  isRowSlicedAtomType,
  rowSliceRange,
  withoutRowSlice,
} from "@mrnote/core/web/components/console/editor/native-document/paged/atomRowSlices.ts";

/** The paginator's own transactions (pageRebalanceExtension REBALANCE_META). */
const STRUCTURAL_REBALANCE_META = "structuralRebalance";

/** Class a copy carries while another copy of its list is the selected node:
 * the list is one object and shows one selection. */
export const ROW_SLICE_SELECTED_CLASS = "is-row-slice-selected";

/** Layout state: never read from pasted or stored HTML, never written to
 * it. A copied copy pastes as the whole list. */
const RANGE_ATTR = {
  default: null,
  rendered: false,
  parseHTML: () => null,
  keepOnSplit: false,
};

export interface RowSliceMember {
  pos: number;
  node: PmNode;
}

interface RowSliceScan {
  /** Every sliced copy at the top level of a sheet, in reading order. */
  members: RowSliceMember[];
  /** Complete lists: copies that line up from row 0 through the last row. */
  chains: RowSliceMember[][];
  /** Runs of copies that do not make a complete list. */
  broken: RowSliceMember[][];
}

const EMPTY_SCAN: RowSliceScan = { members: [], chains: [], broken: [] };
const scans = new WeakMap<PmNode, RowSliceScan>();

/**
 * The copies of every cut list in `doc`. Only the direct children of a sheet
 * are ever cut, so only those are read; a document without a generated list
 * costs one pass over its top-level blocks, once per document.
 */
const HOLDS_ROW_SLICE = new SheetFact((node) => isRowSlicedAtomType(node.type.name) && isRowSliced(node.attrs));

export function scanRowSlices(doc: PmNode): RowSliceScan {
  const known = scans.get(doc);
  if (known) return known;
  if (!HOLDS_ROW_SLICE.inDoc(doc)) {
    scans.set(doc, EMPTY_SCAN);
    return EMPTY_SCAN;
  }
  const members: RowSliceMember[] = [];
  const runs: RowSliceMember[][] = [];
  let run: RowSliceMember[] | null = null;
  const visit = (node: PmNode, pos: number) => {
    const sliced = isRowSlicedAtomType(node.type.name) && isRowSliced(node.attrs);
    if (!sliced) {
      run = null;
      return;
    }
    const member = { pos, node };
    members.push(member);
    const previous: RowSliceMember | undefined = run?.[run.length - 1];
    if (
      run &&
      previous &&
      previous.node.type === node.type &&
      rowSliceRange(previous.node.attrs).end === rowSliceRange(node.attrs).start
    ) {
      run.push(member);
    } else {
      run = [member];
      runs.push(run);
    }
  };
  doc.forEach((child, offset) => {
    if (child.type.name !== PAGE_BLOCK_NODE) {
      visit(child, offset);
      return;
    }
    // A page boundary does not end a run: a list's copies sit at the end of
    // one sheet and the start of the next.
    child.forEach((block, blockOffset) => visit(block, offset + 1 + blockOffset));
  });
  if (members.length === 0) {
    scans.set(doc, EMPTY_SCAN);
    return EMPTY_SCAN;
  }
  const chains: RowSliceMember[][] = [];
  const broken: RowSliceMember[][] = [];
  for (const candidate of runs) {
    const first = rowSliceRange(candidate[0].node.attrs);
    const last = rowSliceRange(candidate[candidate.length - 1].node.attrs);
    if (candidate.length > 1 && first.start === 0 && last.end === null) chains.push(candidate);
    else broken.push(candidate);
  }
  const scan = { members, chains, broken };
  scans.set(doc, scan);
  return scan;
}

/** The copies of the list `pos` is a copy of (itself alone when not cut). */
export function rowSliceChainAt(doc: PmNode, pos: number): RowSliceMember[] {
  for (const chain of scanRowSlices(doc).chains) {
    if (chain.some((member) => member.pos === pos)) return chain;
  }
  const node = doc.nodeAt(pos);
  return node ? [{ pos, node }] : [];
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Attributes of a copy that are NOT the list's: its row range, and the block
 * identity the block-id plugin makes unique per physical node (the first
 * copy keeps the list's own, which is the one a save stores).
 */
const COPY_LOCAL_ATTRS: ReadonlySet<string> = new Set([ROW_SLICE_START_ATTR, ROW_SLICE_END_ATTR, "block_id"]);

/** Equal in everything that is the list's. Copies share their attribute
 * values by reference, so the usual answer costs one comparison per key. */
function sameListAttrs(left: PmNode, right: PmNode): boolean {
  if (left === right) return true;
  for (const key of Object.keys(left.attrs)) {
    if (COPY_LOCAL_ATTRS.has(key)) continue;
    if (!sameValue(left.attrs[key], right.attrs[key])) return false;
  }
  return true;
}

function sameRange(left: PmNode, right: PmNode): boolean {
  const a = rowSliceRange(left.attrs);
  const b = rowSliceRange(right.attrs);
  return a.start === b.start && a.end === b.end;
}

function listAttrsFrom(target: PmNode, source: PmNode): Record<string, unknown> {
  const next: Record<string, unknown> = { ...source.attrs };
  for (const key of COPY_LOCAL_ATTRS) {
    if (key in target.attrs) next[key] = target.attrs[key];
  }
  return next;
}

/**
 * The transaction that keeps every cut list one object after `transactions`
 * took `oldState` to `newState`, or null. Pure: exported for tests.
 */
export function buildRowSliceIntegrity(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  if (!transactions.some((transaction) => transaction.docChanged)) return null;
  // The paginator makes, moves and joins copies itself, whole lists at a time:
  // only what came after its last cut is read. Other plugins append attribute
  // syncs (table fragments, block ids) after the ledger in the same round, so
  // one batch can hold its cut followed by edits; read through the cut, a
  // copy it re-made looks deleted and the whole list went with it (a 2000
  // entry table of contents vanished seconds after opening).
  let lastCut = -1;
  transactions.forEach((transaction, index) => {
    if (transaction.getMeta(STRUCTURAL_REBALANCE_META) === true) lastCut = index;
  });
  const edits = lastCut < 0 ? transactions : transactions.slice(lastCut + 1);
  if (!edits.some((transaction) => transaction.docChanged)) return null;
  const before = scanRowSlices(lastCut < 0 ? oldState.doc : edits[0].before);
  const after = scanRowSlices(newState.doc);
  if (before.members.length === 0 && after.members.length === 0) return null;

  // Where each copy of the old document stands now, if it still does: the
  // same kind of node drawing the same rows.
  const survivors = new Map<number, PmNode>(); // new position -> old node
  const mapPos = (pos: number): number => {
    let mapped = pos;
    for (const transaction of edits) mapped = transaction.mapping.map(mapped, 1);
    return mapped;
  };
  const survives = (member: RowSliceMember): number | null => {
    const pos = mapPos(member.pos);
    if (pos < 0 || pos >= newState.doc.content.size) return null;
    const node = newState.doc.nodeAt(pos);
    return node && node.type === member.node.type && sameRange(node, member.node) ? pos : null;
  };
  const doomed = new Set<number>();
  for (const chain of before.chains) {
    const positions = chain.map(survives);
    positions.forEach((pos, index) => {
      if (pos !== null) survivors.set(pos, chain[index].node);
    });
    // A copy is gone (deleted, replaced, moved away): so is the list.
    if (positions.some((pos) => pos === null)) {
      for (const pos of positions) if (pos !== null) doomed.add(pos);
    }
  }
  for (const run of before.broken) {
    for (const member of run) {
      const pos = survives(member);
      if (pos !== null) survivors.set(pos, member.node);
    }
  }

  interface Change {
    pos: number;
    node: PmNode;
    /** null: delete the copy. */
    attrs: Record<string, unknown> | null;
  }
  const changes: Change[] = [];
  for (const member of after.members) {
    if (doomed.has(member.pos)) changes.push({ pos: member.pos, node: member.node, attrs: null });
  }
  // Copies that do not line up fold into one whole list where the first of
  // them stands. A continuation that stood here before and lost its head to
  // something in between is that head's rows: the head, now whole, draws
  // them. One that arrived (a drop, a paste) is the list itself, moved.
  for (const run of after.broken) {
    const live = run.filter((member) => !doomed.has(member.pos));
    if (live.length === 0) continue;
    const [first, ...rest] = live;
    const orphanedContinuation =
      rowSliceRange(first.node.attrs).start > 0 && live.every((member) => survivors.has(member.pos));
    if (orphanedContinuation) {
      for (const member of live) changes.push({ pos: member.pos, node: member.node, attrs: null });
      continue;
    }
    changes.push({ pos: first.pos, node: first.node, attrs: withoutRowSlice(first.node.attrs) });
    for (const member of rest) changes.push({ pos: member.pos, node: member.node, attrs: null });
  }
  // One list, one set of attributes: the copy this edit changed speaks for
  // the list; when none did (an undo put an older copy back) the first does.
  for (const chain of after.chains) {
    if (chain.some((member) => doomed.has(member.pos))) continue;
    if (chain.every((member) => sameListAttrs(member.node, chain[0].node))) continue;
    const edited = chain.filter((member) => {
      const old = survivors.get(member.pos);
      return !old || !sameListAttrs(old, member.node);
    });
    const agree = edited.every((member) => sameListAttrs(member.node, edited[0].node));
    if (edited.length > 0 && !agree) continue;
    const source = edited[0] ?? chain[0];
    for (const member of chain) {
      if (sameListAttrs(member.node, source.node)) continue;
      changes.push({ pos: member.pos, node: member.node, attrs: listAttrsFrom(member.node, source.node) });
    }
  }
  if (changes.length === 0) return null;

  const tr = newState.tr;
  // From the end, so earlier positions stay valid.
  changes.sort((left, right) => right.pos - left.pos);
  for (const change of changes) {
    if (change.attrs) {
      tr.setNodeMarkup(change.pos, undefined, change.attrs, change.node.marks);
      continue;
    }
    const $pos = tr.doc.resolve(change.pos);
    const parent = $pos.parent;
    if (parent.type.name === PAGE_BLOCK_NODE && parent.childCount === 1 && tr.doc.childCount > 1) {
      // A sheet holds at least one block: its only block gone, so is it.
      const sheetPos = $pos.before($pos.depth);
      tr.delete(sheetPos, sheetPos + parent.nodeSize);
    } else if (parent.childCount === 1) {
      const paragraph = tr.doc.type.schema.nodes.paragraph;
      if (!paragraph) continue;
      tr.replaceWith(change.pos, change.pos + change.node.nodeSize, paragraph.create());
    } else {
      tr.delete(change.pos, change.pos + change.node.nodeSize);
    }
  }
  return tr.docChanged ? tr.setMeta(ROW_SLICE_INTEGRITY_META, true) : null;
}

export const rowSliceIntegrityKey = new PluginKey("mrnote-row-slice-integrity");

/** Corrections appended per root transaction. Two rules that undid each
 * other would otherwise append forever inside one dispatch. */
const MAX_CORRECTIONS_PER_DISPATCH = 4;
const correctionsPerRoot = new WeakMap<Transaction, number>();

export const AtomRowSlices = Extension.create({
  name: "atomRowSlices",

  addGlobalAttributes() {
    return [
      {
        types: [...ROW_SLICED_ATOM_TYPES],
        attributes: {
          [ROW_SLICE_START_ATTR]: RANGE_ATTR,
          [ROW_SLICE_END_ATTR]: RANGE_ATTR,
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: rowSliceIntegrityKey,
        appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) => {
          const first = transactions[0];
          const root = (first?.getMeta("appendedTransaction") as Transaction | undefined) ?? first;
          const corrections = root ? correctionsPerRoot.get(root) ?? 0 : 0;
          if (corrections >= MAX_CORRECTIONS_PER_DISPATCH) return null;
          const correction = buildRowSliceIntegrity(transactions, oldState, newState);
          if (correction && root) correctionsPerRoot.set(root, corrections + 1);
          return correction;
        }),
        props: {
          // The list is one object: with one of its copies selected, the
          // others show the same frame.
          decorations(state) {
            const { selection, doc } = state;
            if (!(selection instanceof NodeSelection)) return null;
            if (!isRowSlicedAtomType(selection.node.type.name) || !isRowSliced(selection.node.attrs)) return null;
            const chain = rowSliceChainAt(doc, selection.from);
            if (chain.length < 2) return null;
            return DecorationSet.create(
              doc,
              chain
                .filter((member) => member.pos !== selection.from)
                .map((member) =>
                  Decoration.node(member.pos, member.pos + member.node.nodeSize, {
                    class: ROW_SLICE_SELECTED_CLASS,
                  }),
                ),
            );
          },
        },
      }),
    ];
  },
});

export default AtomRowSlices;
