/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Page fragments of LOGICAL tables in a live (paginated) ProseMirror document.
 *
 * Pagination cuts one table into several physical `table` nodes, one per page,
 * sharing `pageTableFragmentId` (see tablePagination.ts). Everything that
 * belongs to the table as a whole — its formulas' grid, its alignment, indent,
 * wrapping, title and description, borders and style — must be read and
 * written on the logical table, never on the one fragment the caret is in.
 */

import { HOLDS_TABLE } from "../../../../../lib/editor/sheet-facts";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  AddMarkStep,
  RemoveMarkStep,
  ReplaceStep,
} from "@tiptap/pm/transform";

import { imeReplayingAppendTransaction } from "../imeCompositionGuard";
import {
  TABLE_CONTINUATION_ATTR,
  TABLE_CONTINUES_ATTR,
  TABLE_FRAGMENT_END_ROW_ATTR,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_FRAGMENT_START_ROW_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_ROW_CONTINUES_ATTR,
  TABLE_SOURCE_CELL_COL_ATTR,
  TABLE_SOURCE_ROW_ATTR,
  TABLE_UNBREAKABLE_FALLBACK_ATTR,
} from "./tablePagination";

export interface TableFragment {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

function stampedIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * The identity of the LOGICAL table a physical table node belongs to. Page
 * fragments of one table share `pageTableFragmentId`; a nested table is scoped
 * to the logical cell that contains it (its fragments may sit in the two
 * halves of a split outer cell). A nested table inside a repeated-header clone
 * is its own copy and never joins the original.
 */
export function logicalTableKey(
  doc: ProseMirrorNode,
  table: ProseMirrorNode,
  pos: number,
): string {
  const own = (node: ProseMirrorNode, nodePos: number) => {
    const id = node.attrs[TABLE_FRAGMENT_ID_ATTR];
    return typeof id === "string" && id ? `f:${id}` : `p:${nodePos}`;
  };
  const $pos = doc.resolve(pos);
  const segments: string[] = [];
  for (let depth = 1; depth + 2 <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "table") continue;
    const row = $pos.node(depth + 1);
    const cell = $pos.node(depth + 2);
    if (row.attrs[TABLE_REPEATED_HEADER_ATTR] === true) {
      segments.push(`clone@${$pos.before(depth + 1)}`);
      continue;
    }
    const rowKey = stampedIndex(row.attrs[TABLE_SOURCE_ROW_ATTR]) ?? $pos.index(depth);
    const colKey =
      stampedIndex(cell.attrs[TABLE_SOURCE_CELL_COL_ATTR]) ?? $pos.index(depth + 1);
    segments.push(`${own(node, $pos.before(depth))}:${rowKey}:${colKey}`);
  }
  segments.push(own(table, pos));
  return segments.join("/");
}

/** Every table of the document, grouped by logical table, in reading order. */
export function collectLogicalTableFragments(
  doc: ProseMirrorNode,
): Map<string, TableFragment[]> {
  const groups = new Map<string, TableFragment[]>();
  HOLDS_TABLE.descendants(doc, (node, pos) => {
    // A text block holds no table: its inline content is not walked.
    if (node.isTextblock) return false;
    if (node.type.name !== "table") return true;
    const key = logicalTableKey(doc, node, pos);
    const group = groups.get(key);
    if (group) group.push({ node, pos });
    else groups.set(key, [{ node, pos }]);
    // Keep walking: cells may hold nested tables.
    return true;
  });
  return groups;
}

/**
 * The logical row of every physical row of `fragments`, the way the storage
 * merge (mergeTableContinuationsJson) joins them: repeated header copies are
 * skipped (null), and the second half of a row the page cut joins the first.
 */
export function logicalTableRowIndexes(
  fragments: readonly TableFragment[],
): { rows: Array<Array<number | null>>; count: number } {
  const logical: Array<{ sourceRow: number | null; continues: boolean }> = [];
  const rows = fragments.map(({ node }) => {
    const indexes: Array<number | null> = [];
    node.forEach((row) => {
      // Same normalization as the merge (a null stamp reads as 0 there).
      const stamp = Number(row.attrs[TABLE_SOURCE_ROW_ATTR]);
      const sourceRow = Number.isInteger(stamp) && stamp >= 0 ? stamp : null;
      if (row.attrs[TABLE_REPEATED_HEADER_ATTR] === true) {
        indexes.push(null);
        return;
      }
      const previous = logical[logical.length - 1];
      const continues = row.attrs[TABLE_ROW_CONTINUES_ATTR] === true;
      if (
        sourceRow !== null &&
        previous?.sourceRow === sourceRow &&
        previous.continues &&
        row.attrs[TABLE_ROW_CONTINUATION_ATTR] === true
      ) {
        previous.continues = continues;
        indexes.push(logical.length - 1);
      } else {
        logical.push({ sourceRow, continues });
        indexes.push(logical.length - 1);
      }
    });
    return indexes;
  });
  return { rows, count: logical.length };
}

/** The page fragments of the logical table that `tablePos` belongs to. */
export function logicalTableFragmentsAt(
  doc: ProseMirrorNode,
  tablePos: number,
): TableFragment[] {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return [];
  const id = table.attrs[TABLE_FRAGMENT_ID_ATTR];
  if (typeof id !== "string" || !id) return [{ node: table, pos: tablePos }];
  const key = logicalTableKey(doc, table, tablePos);
  return collectLogicalTableFragments(doc).get(key) ?? [{ node: table, pos: tablePos }];
}

/**
 * Attributes of a table fragment that are NOT the logical table's: the
 * pagination bookkeeping, and the block identity the block-id plugin makes
 * unique per physical node.
 */
const FRAGMENT_LOCAL_TABLE_ATTRS: ReadonlySet<string> = new Set([
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_CONTINUES_ATTR,
  TABLE_CONTINUATION_ATTR,
  TABLE_FRAGMENT_START_ROW_ATTR,
  TABLE_FRAGMENT_END_ROW_ATTR,
  TABLE_UNBREAKABLE_FALLBACK_ATTR,
  "block_id",
]);

function logicalAttrsKey(node: ProseMirrorNode): string {
  const entries = Object.entries(node.attrs)
    .filter(([key]) => !FRAGMENT_LOCAL_TABLE_ATTRS.has(key))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return JSON.stringify(entries);
}

/** `target`'s attrs with every logical-table attribute taken from `source`. */
export function withLogicalTableAttrs(
  target: ProseMirrorNode,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...target.attrs };
  for (const [key, value] of Object.entries(source)) {
    if (!FRAGMENT_LOCAL_TABLE_ATTRS.has(key)) next[key] = value;
  }
  return next;
}

/**
 * Whether a transaction can have changed a table node's attributes. Typing and
 * mark changes cannot, so the common keystroke skips the document walk.
 */
function mayChangeTableAttrs(transactions: readonly Transaction[]): boolean {
  return transactions.some(
    (transaction) =>
      transaction.docChanged &&
      transaction.steps.some((step) => {
        if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
          return false;
        }
        if (!(step instanceof ReplaceStep)) return true;
        // A whole row replaced (Undo and remote edits through the canonical
        // document) can carry a row height its page pieces must share.
        let hasTable = false;
        step.slice.content.descendants((node) => {
          if (node.type.name === "table" || node.type.name === "tableRow") hasTable = true;
          return !hasTable && !node.isTextblock;
        });
        return hasTable;
      }),
  );
}

export const tableFragmentAttrsSyncKey = new PluginKey(
  "mrnote-table-fragment-attrs-sync",
);

/**
 * Build the transaction that makes every page fragment of a logical table
 * carry the table-level attributes a transaction just changed on one of them,
 * or null. A command that edits "the table" through the fragment the caret is
 * in (Table Properties, alignment, styles, borders, alt text, ...) therefore
 * edits the whole table, and the storage merge — which keeps one set of table
 * attributes — never has to choose between disagreeing fragments.
 */
export function buildTableFragmentAttrsSync(
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  const before = new Map<string, Set<string>>();
  for (const [key, fragments] of collectLogicalTableFragments(oldState.doc)) {
    if (fragments.length < 2 && !fragments[0]?.node.attrs[TABLE_FRAGMENT_ID_ATTR]) continue;
    before.set(key, new Set(fragments.map(({ node }) => logicalAttrsKey(node))));
  }
  let tr: Transaction | null = null;
  for (const [key, fragments] of collectLogicalTableFragments(newState.doc)) {
    if (fragments.length < 2) continue;
    const keys = fragments.map(({ node }) => logicalAttrsKey(node));
    if (keys.every((value) => value === keys[0])) continue;
    const previous = before.get(key);
    if (!previous) continue;
    const changed = fragments.filter((_, index) => !previous.has(keys[index]));
    const changedKeys = new Set(changed.map(({ node }) => logicalAttrsKey(node)));
    // Exactly one new set of table attributes: that is the edit. Anything else
    // (no edit, or two fragments edited differently at once) is left alone.
    if (changedKeys.size !== 1) continue;
    const source = changed[0].node.attrs;
    const sourceKey = [...changedKeys][0];
    for (const fragment of fragments) {
      if (logicalAttrsKey(fragment.node) === sourceKey) continue;
      tr ??= newState.tr;
      tr.setNodeMarkup(
        fragment.pos,
        undefined,
        withLogicalTableAttrs(fragment.node, source),
        fragment.node.marks,
      );
    }
  }
  return tr;
}

/** The row attributes that make up a row's height (Word `w:trHeight`). */
const ROW_HEIGHT_ATTRS = ["rowHeight", "rowHeightRule", "rowHeightTwips"] as const;

function rowHeightKey(row: ProseMirrorNode): string {
  return JSON.stringify(ROW_HEIGHT_ATTRS.map((name) => row.attrs[name] ?? null));
}

interface StampedRow {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly clone: boolean;
}

/**
 * Rows of every paginated logical table, grouped by their source row. A row
 * that came back from the canonical document (Undo, a remote edit) carries no
 * source stamp yet; a fragment holds consecutive source rows from its start
 * row on, so its place gives the same number.
 */
function stampedRowGroups(doc: ProseMirrorNode): Map<string, StampedRow[]> {
  const groups = new Map<string, StampedRow[]>();
  for (const [key, fragments] of collectLogicalTableFragments(doc)) {
    if (!fragments.some(({ node }) => node.attrs[TABLE_FRAGMENT_ID_ATTR])) continue;
    for (const fragment of fragments) {
      let pos = fragment.pos + 1;
      let nextSource = stampedIndex(fragment.node.attrs[TABLE_FRAGMENT_START_ROW_ATTR]);
      fragment.node.forEach((row) => {
        const clone = row.attrs[TABLE_REPEATED_HEADER_ATTR] === true;
        const own = stampedIndex(row.attrs[TABLE_SOURCE_ROW_ATTR]);
        const stamp = clone ? own : own ?? nextSource;
        if (!clone && stamp !== null) nextSource = stamp + 1;
        if (stamp !== null) {
          const groupKey = `${key}#${stamp}`;
          const entry = { pos, node: row, clone };
          const group = groups.get(groupKey);
          if (group) group.push(entry);
          else groups.set(groupKey, [entry]);
        }
        pos += row.nodeSize;
      });
    }
  }
  return groups;
}

/**
 * The page pieces of one row (the halves of a row split across pages, and
 * the header copies repeated on continuation pages) show one row, so they
 * carry one height. An edit that reached only some of them — Undo and remote
 * edits arrive through the canonical, unpaginated document, which has no
 * copies — is copied to the rest: the height that is new since `oldState`
 * wins, otherwise the source row's.
 */
export function buildTableRowPieceHeightSync(
  oldState: EditorState,
  newState: EditorState,
  base?: Transaction | null,
): Transaction | null {
  let before: Map<string, Set<string>> | null = null;
  let tr = base ?? null;
  for (const [groupKey, rows] of stampedRowGroups(newState.doc)) {
    if (rows.length < 2) continue;
    const keys = rows.map(({ node }) => rowHeightKey(node));
    if (keys.every((value) => value === keys[0])) continue;
    before ??= new Map(
      [...stampedRowGroups(oldState.doc)].map(([key, oldRows]) => [
        key,
        new Set(oldRows.map(({ node }) => rowHeightKey(node))),
      ]),
    );
    const previous = before.get(groupKey);
    const fresh = [...new Set(keys.filter((value) => !previous?.has(value)))];
    const source = rows.find(({ clone }) => !clone) ?? rows[0]!;
    const winner = fresh.length === 1
      ? rows[keys.indexOf(fresh[0]!)]!
      : source;
    const winnerKey = rowHeightKey(winner.node);
    rows.forEach((row, index) => {
      if (keys[index] === winnerKey) return;
      tr ??= newState.tr;
      const next: Record<string, unknown> = { ...row.node.attrs };
      for (const name of ROW_HEIGHT_ATTRS) next[name] = winner.node.attrs[name] ?? null;
      tr.setNodeMarkup(row.pos, undefined, next, row.node.marks);
    });
  }
  return tr;
}

/** The source rows of a logical table's repeating header band: the leading
 * rows of its first page fragment marked Repeat Header Rows. */
function sourceHeaderRows(fragments: readonly TableFragment[]): ProseMirrorNode[] {
  const rows: ProseMirrorNode[] = [];
  const head = fragments[0]?.node;
  if (!head) return rows;
  for (let index = 0; index < head.childCount; index += 1) {
    const row = head.child(index);
    if (row.attrs[TABLE_REPEATED_HEADER_ATTR] === true || row.attrs.headerRow !== true) break;
    rows.push(row);
  }
  return rows;
}

function headerBandKey(fragments: readonly TableFragment[]): string {
  return JSON.stringify(
    sourceHeaderRows(fragments).map((row, index) => stampedIndex(row.attrs[TABLE_SOURCE_ROW_ATTR]) ?? index),
  );
}

/**
 * Repeat Header Rows turned on or off on a table already cut across pages:
 * the copies of the header band at the top of every later page follow at
 * once. The pagination cut the copies in when the table was laid out; with
 * nothing else changed it had no reason to lay the table out again, so the
 * later pages kept showing (or lacking) the copies until the page was opened
 * again (WUA 250). A header band whose cells span into the body, or a header
 * row itself cut across pages, is left to the pagination.
 */
export function buildRepeatedHeaderCopySync(
  oldState: EditorState,
  newState: EditorState,
  base?: Transaction | null,
): Transaction | null {
  const before = new Map<string, string>();
  for (const [key, fragments] of collectLogicalTableFragments(oldState.doc)) {
    if (fragments.length >= 2) before.set(key, headerBandKey(fragments));
  }
  let tr = base ?? null;
  for (const [key, fragments] of collectLogicalTableFragments(newState.doc)) {
    if (fragments.length < 2) continue;
    const previous = before.get(key);
    if (previous === undefined || previous === headerBandKey(fragments)) continue;
    const header = sourceHeaderRows(fragments);
    if (!plainHeaderBand(header)) continue;
    const copies = headerCopyRows(header);
    for (const fragment of fragments.slice(1)) {
      const { count: leadingCopies, size: copiesSize } = leadingHeaderCopies(fragment.node);
      if (leadingCopies === 0 && copies.length === 0) continue;
      // A fragment that is nothing but copies has no row of its own to keep.
      if (leadingCopies === fragment.node.childCount && copies.length === 0) continue;
      tr ??= newState.tr;
      const from = tr.mapping.map(fragment.pos + 1);
      const to = tr.mapping.map(fragment.pos + 1 + copiesSize);
      tr.replaceWith(from, to, copies);
    }
  }
  return tr;
}

/** A header band the copies can be rebuilt from as it stands: no row of it
 * cut across pages, no cell of it spanning into the body. */
function plainHeaderBand(header: readonly ProseMirrorNode[]): boolean {
  return header.every(
    (row) =>
      row.attrs[TABLE_ROW_CONTINUES_ATTR] !== true &&
      row.attrs[TABLE_ROW_CONTINUATION_ATTR] !== true &&
      (() => {
        let spansOut = false;
        row.forEach((cell) => {
          if (Number(cell.attrs.rowspan ?? 1) > 1) spansOut = true;
        });
        return !spansOut;
      })(),
  );
}

function headerCopyRows(header: readonly ProseMirrorNode[]): ProseMirrorNode[] {
  return header.map((row, index) => {
    const cells: ProseMirrorNode[] = [];
    let col = 0;
    row.forEach((cell) => {
      const stamped = stampedIndex(cell.attrs[TABLE_SOURCE_CELL_COL_ATTR]);
      cells.push(
        cell.type.create(
          { ...cell.attrs, [TABLE_SOURCE_CELL_COL_ATTR]: stamped ?? col },
          cell.content,
          cell.marks,
        ),
      );
      col += Math.max(1, Number(cell.attrs.colspan ?? 1) || 1);
    });
    return row.type.create(
      {
        ...row.attrs,
        [TABLE_SOURCE_ROW_ATTR]: stampedIndex(row.attrs[TABLE_SOURCE_ROW_ATTR]) ?? index,
        [TABLE_REPEATED_HEADER_ATTR]: true,
      },
      cells,
      row.marks,
    );
  });
}

function leadingHeaderCopies(table: ProseMirrorNode): { count: number; size: number } {
  let count = 0;
  let size = 0;
  while (count < table.childCount && table.child(count).attrs[TABLE_REPEATED_HEADER_ATTR] === true) {
    size += table.child(count).nodeSize;
    count += 1;
  }
  return { count, size };
}

/** Where in `doc` the steps of `transactions` changed it. */
function editedPositions(transactions: readonly Transaction[], doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  transactions.forEach((transaction, index) => {
    if (!transaction.docChanged) return;
    const later = transactions.slice(index + 1);
    const toEnd = (pos: number, assoc: number) =>
      later.reduce((mapped, next) => next.mapping.map(mapped, assoc), pos);
    transaction.steps.forEach((step, stepIndex) => {
      const range = step as unknown as { from?: unknown; to?: unknown; pos?: unknown };
      const from = typeof range.from === "number" ? range.from : typeof range.pos === "number" ? range.pos : null;
      if (from === null) return;
      const to = typeof range.to === "number" ? range.to : from;
      const rest = transaction.mapping.slice(stepIndex);
      positions.push(
        Math.min(doc.content.size, toEnd(rest.map(from, -1), -1)),
        Math.min(doc.content.size, toEnd(rest.map(to, 1), 1)),
      );
    });
  });
  return positions;
}

/** `source` as the copy `copy` stands for it: each node keeps the copy's own
 * block identity where the two still have the same shape. */
function withCopyIdentity(source: Fragment, copy: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  source.forEach((node, _offset, index) => {
    const own = index < copy.childCount ? copy.child(index) : null;
    if (node.isText || !own || own.type !== node.type) {
      nodes.push(node);
      return;
    }
    const attrs = "block_id" in node.attrs ? { ...node.attrs, block_id: own.attrs.block_id } : node.attrs;
    nodes.push(node.type.create(attrs, withCopyIdentity(node.content, own.content), node.marks));
  });
  return Fragment.fromArray(nodes);
}

const sameAttrValue = (left: unknown, right: unknown): boolean =>
  left === right || JSON.stringify(left) === JSON.stringify(right);

/**
 * Typing in a header row the later pages repeat: the copies there follow in
 * the same transaction. The copies are view-only stand-ins for the source
 * row, so one that kept the text from before the edit no longer matched the
 * row it stands for, and the collaborative bridge, which maps the copies onto
 * their source, refused the document at the first keystroke and left it
 * read-only (corpus R297-D17, typing at the end of "Stage"). Only the cells
 * that differ are rewritten; a band whose shape changed is rebuilt whole.
 */
export function buildRepeatedHeaderContentSync(
  transactions: readonly Transaction[],
  newState: EditorState,
  base?: Transaction | null,
): Transaction | null {
  const tables = new Set<number>();
  for (const pos of editedPositions(transactions, newState.doc)) {
    const $pos = newState.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 1; depth -= 1) {
      const row = $pos.node(depth);
      if (row.type.name !== "tableRow") continue;
      const table = $pos.node(depth - 1);
      if (
        row.attrs.headerRow === true &&
        row.attrs[TABLE_REPEATED_HEADER_ATTR] !== true &&
        table.attrs[TABLE_CONTINUES_ATTR] === true &&
        table.attrs[TABLE_CONTINUATION_ATTR] !== true
      ) tables.add($pos.before(depth - 1));
      break;
    }
  }
  if (tables.size === 0) return base ?? null;
  let tr = base ?? null;
  const doc = tr?.doc ?? newState.doc;
  for (const tablePos of tables) {
    const fragments = logicalTableFragmentsAt(doc, tr ? tr.mapping.map(tablePos) : tablePos);
    if (fragments.length < 2) continue;
    const header = sourceHeaderRows(fragments);
    if (header.length === 0 || !plainHeaderBand(header)) continue;
    for (const fragment of fragments.slice(1)) {
      const { count, size } = leadingHeaderCopies(fragment.node);
      if (count === 0) continue;
      const sameShape = count === header.length &&
        header.every((row, index) => fragment.node.child(index).childCount === row.childCount);
      if (!sameShape) {
        tr ??= newState.tr;
        tr.replaceWith(tr.mapping.map(fragment.pos + 1), tr.mapping.map(fragment.pos + 1 + size), headerCopyRows(header));
        continue;
      }
      let rowPos = fragment.pos + 1;
      header.forEach((row, rowIndex) => {
        const copy = fragment.node.child(rowIndex);
        let cellPos = rowPos + 1;
        row.forEach((cell, _offset, cellIndex) => {
          const copied = copy.child(cellIndex);
          // The copy keeps its own identity and page bookkeeping.
          const attrs: Record<string, unknown> = { ...cell.attrs };
          for (const name of Object.keys(attrs)) {
            if (name === "block_id" || name.startsWith("pageTable")) attrs[name] = copied.attrs[name];
          }
          const sameAttrs = Object.keys(attrs).every((name) => sameAttrValue(attrs[name], copied.attrs[name]));
          if (!sameAttrs) {
            tr ??= newState.tr;
            tr.setNodeMarkup(tr.mapping.map(cellPos), undefined, attrs, copied.marks);
          }
          const content = withCopyIdentity(cell.content, copied.content);
          if (!copied.content.eq(content)) {
            tr ??= newState.tr;
            tr.replaceWith(tr.mapping.map(cellPos + 1), tr.mapping.map(cellPos + copied.nodeSize - 1), content);
          }
          cellPos += copied.nodeSize;
        });
        rowPos += copy.nodeSize;
      });
    }
  }
  return tr;
}

export function createTableFragmentAttrsSyncPlugin(): Plugin {
  return new Plugin({
    key: tableFragmentAttrsSyncKey,
    appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) => {
      if (transactions.some((transaction) => transaction.getMeta(tableFragmentAttrsSyncKey))) {
        return null;
      }
      const attrsSync = mayChangeTableAttrs(transactions) ? buildRepeatedHeaderCopySync(
        oldState,
        newState,
        buildTableRowPieceHeightSync(
          oldState,
          newState,
          buildTableFragmentAttrsSync(oldState, newState),
        ),
      ) : null;
      const tr = buildRepeatedHeaderContentSync(transactions, newState, attrsSync);
      if (!tr) return null;
      tr.setMeta(tableFragmentAttrsSyncKey, true);
      return tr;
    }),
  });
}
