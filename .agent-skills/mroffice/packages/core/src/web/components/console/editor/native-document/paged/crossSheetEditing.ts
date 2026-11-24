/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A selection that crosses a page edits TEXT, never pages.
 *
 * Word's rule (Microsoft Support "Select text": drag, Shift+click and Ctrl+A
 * select the document's text; "Create a bulleted or numbered list": select
 * the text, then Home > Bullets / Numbering; Microsoft Learn Range.Paragraphs
 * "all the paragraphs in the specified range" and ListFormat.ApplyBulletDefault
 * "Adds bullets and formatting to the paragraphs in the range ... If the
 * paragraphs are already formatted with bullets, this method removes" them;
 * ECMA-376 §17.2.2 `w:body` is one flow of paragraphs and tables, the only
 * page trace inside it being the `w:lastRenderedPageBreak` hint of
 * §17.3.3.13): pages are layout, not document objects. A selection from page
 * 1 into page 2 is the characters between its two ends, nothing "between the
 * pages" is selected, and every paragraph command (bullets, numbering,
 * multilevel list, styles and headings, quote, alignment, indent, spacing,
 * Clear Formatting) applies to every paragraph the selection touches, the
 * on/off decision of a toggle being taken over all of them. A paragraph the
 * page boundary cuts is still ONE paragraph, and list items that meet across
 * a page boundary are one list.
 *
 * Here pages are real `pageBlock` wrappers, so a cross-sheet selection
 * resolves its block range at the doc (between sheets), where no list or
 * quote can wrap anything, and the commands fail. The one mechanism below
 * makes the sheets transparent to a range command without teaching any
 * command about pages:
 *
 *   1. JOIN   the sheets the selection spans into one sheet, in the command's
 *             own transaction, re-merging every runtime continuation the page
 *             boundary cut (a split paragraph / list / list item / quote /
 *             callout becomes the one node it is);
 *   2. RUN    the command unchanged: its block range now resolves over the
 *             paragraphs, and chained commands see the same joined text;
 *   3. REWRAP when the transaction is applied, split the joined sheet again
 *             at the old page boundaries (an appended transaction, so undo is
 *             ONE step), stamping the same continuation attrs the paginator's
 *             own cuts carry; the ledger then only settles what the edit
 *             really moved. A boundary that no longer has a legal split point
 *             stays joined and the ledger re-cuts it.
 *
 * Commands are wrapped in the editor's final command table, so another
 * extension's override of the same command (list levels, heading lists) is
 * wrapped too instead of shadowed. A failed or dry-run (`can()`) command
 * leaves the transaction exactly as it found it.
 *
 * Copy, cut and drag carry the semantic blocks: page wrappers and runtime
 * continuation fragments never reach the clipboard, and a pasted slice that
 * still carries them (an older clipboard) is flattened the same way.
 */

import {
  Extension,
  getSchemaTypeNameByName,
  objectIncludes,
  type CommandProps,
} from "@tiptap/core";
import {
  Fragment,
  Slice,
  type Node as PmNode,
  type Schema,
} from "@tiptap/pm/model";
import {
  AllSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { redo as redoHistory, undo as undoHistory } from "@tiptap/pm/history";
// editor.commands.undo / redo, which onTextFlow re-runs, are declared by the
// UndoRedo extension's Commands augmentation (the prosemirror-history this
// module reads). Load that declaration here rather than borrow it from
// whichever editor module happens to pull in StarterKit; types only.
import type {} from "@tiptap/extensions";

import { isTextRangeSelection } from "../../extensions/equationBoundarySelection";

import {
  LIST_ITEM_SPLIT_BRIDGE_ATTR,
  LIST_ITEM_SPLIT_CONTINUATION_ATTR,
  LIST_ITEM_SPLIT_CONTINUES_ATTR,
} from "./containerSplitting";
import { flattenPageBlocks } from "./pageBlockExtension";
import {
  PAGE_BLOCK_NODE,
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
} from "./paginationProjectionKeys";
import { mergePagedRuntimeContinuationsJson } from "./serialization";
import { imeReplayingAppendTransaction } from "../imeCompositionGuard";
import { detachTableFragmentsInSliceJson } from "./tablePagination";

const TEXT_TYPES = new Set(["paragraph", "heading"]);
const CONTAINER_TYPES = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "callout",
]);
const ITEM_TYPES = new Set(["listItem", "taskItem"]);

/**
 * Commands whose target is a block RANGE of the selection. Attribute setters
 * (alignment, indent, spacing, Clear Formatting's paragraph reset) already
 * visit every textblock between the selection ends, on any sheet.
 */
export const SHEET_TRANSPARENT_COMMANDS = [
  "toggleList",
  "wrapInList",
  "liftListItem",
  "sinkListItem",
  "toggleWrap",
  "wrapIn",
  "lift",
  "clearNodes",
  "setNode",
  "toggleNode",
] as const;

const crossSheetKey = new PluginKey("crossSheetEditing");

interface SeamRecord {
  /** Where the old page boundary is, in the doc after step `step`. */
  pos: number;
  step: number;
}

export interface CrossSheetPlan {
  /** tr.steps.length before the join (the rollback point). */
  mark: number;
  selection: unknown;
  seams: SeamRecord[];
}

function isSheeted(doc: PmNode): boolean {
  return doc.childCount > 0 && doc.firstChild?.type.name === PAGE_BLOCK_NODE;
}

/** Indexes of the first and last sheet the range touches. */
function sheetSpan(
  doc: PmNode,
  from: number,
  to: number,
): { first: number; last: number } | null {
  if (!isSheeted(doc)) return null;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  const first = Math.min($from.index(0), doc.childCount - 1);
  // A doc-level end sits AFTER the last sheet it covers.
  const last = Math.min(
    $to.depth === 0 ? $to.index(0) - 1 : $to.index(0),
    doc.childCount - 1,
  );
  return last > first ? { first, last } : null;
}

/**
 * The sheets a paragraph command's selection reaches: its range's, and the rest
 * of a paragraph the page boundary cut when an end of the range stands in it. A
 * caret in the first fragment of a cut paragraph is in that one paragraph: the
 * command is for all of it. On that fragment alone a Heading left the rest a
 * paragraph of its own (out of its list, too) with the same source receipt, and
 * no save could write the page again.
 */
function selectionSheetSpan(
  doc: PmNode,
  from: number,
  to: number,
): { first: number; last: number } | null {
  const span = sheetSpan(doc, from, to);
  if (!isSheeted(doc)) return span;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  if ($from.depth === 0 || $to.depth === 0) return span;
  let first = span?.first ?? $from.index(0);
  let last = span?.last ?? $to.index(0);
  const edge = (index: number, side: "firstChild" | "lastChild"): PmNode | null => {
    let node: PmNode | null = doc.child(index);
    while (node && !node.isTextblock) node = node[side];
    return node;
  };
  if ($from.parent.isTextblock && $from.parent.attrs[SPLIT_CONTINUATION_ATTR] === true) {
    while (first > 0 && edge(first, "firstChild")?.attrs[SPLIT_CONTINUATION_ATTR] === true) first -= 1;
  }
  if ($to.parent.isTextblock && $to.parent.attrs[SPLIT_CONTINUES_ATTR] === true) {
    while (last < doc.childCount - 1 && edge(last, "lastChild")?.attrs[SPLIT_CONTINUES_ATTR] === true) last += 1;
  }
  return last > first ? { first, last } : null;
}

/** Runtime continuation pair the page boundary cut out of one node. */
function continuationKind(
  left: PmNode,
  right: PmNode,
): "text" | "container" | "item" | null {
  if (left.type !== right.type) return null;
  const name = right.type.name;
  if (TEXT_TYPES.has(name)) {
    return right.attrs[SPLIT_CONTINUATION_ATTR] === true ? "text" : null;
  }
  if (CONTAINER_TYPES.has(name)) {
    return right.attrs[SPLIT_CONTINUATION_ATTR] === true ? "container" : null;
  }
  if (ITEM_TYPES.has(name)) {
    return right.attrs[LIST_ITEM_SPLIT_CONTINUATION_ATTR] === true
      ? "item"
      : null;
  }
  return null;
}

/**
 * Join the two nodes meeting at `pos` (two sheets when `sheets`, otherwise
 * only a continuation pair) and, level by level, the continuation fragments
 * that meet inside them. Returns where the old boundary is in the joined
 * text, or null when nothing was joined.
 */
function joinAt(tr: Transaction, pos: number, sheets: boolean): number | null {
  const $pos = tr.doc.resolve(pos);
  const left = $pos.nodeBefore;
  const right = $pos.nodeAfter;
  if (!left || !right) return null;
  let head: PmNode | null = left;
  let tail: PmNode | null = right;
  if (sheets) {
    if (
      left.type.name !== PAGE_BLOCK_NODE ||
      right.type.name !== PAGE_BLOCK_NODE
    ) {
      return null;
    }
    head = left.lastChild;
    tail = right.firstChild;
  }
  const levels: Array<{ kind: "text" | "container" | "item"; tail: PmNode }> =
    [];
  while (head && tail) {
    const kind = continuationKind(head, tail);
    if (!kind) break;
    levels.push({ kind, tail });
    if (kind === "text") break;
    head = head.lastChild;
    tail = tail.firstChild;
  }
  let depth = (sheets ? 1 : 0) + levels.length;
  if (depth === 0) return null;
  let result = tr.maybeStep(
    new ReplaceStep(pos - depth, pos + depth, Slice.empty, true),
  );
  if (result.failed && sheets && depth > 1) {
    levels.length = 0;
    depth = 1;
    result = tr.maybeStep(new ReplaceStep(pos - 1, pos + 1, Slice.empty, true));
  }
  if (result.failed) return null;
  const joinPos = pos - depth;
  const $join = tr.doc.resolve(joinPos);
  const firstLevelDepth = $join.depth - levels.length + 1;
  // The joined node kept the head's attrs; its onward link is the tail's.
  levels.forEach((level, index) => {
    const nodePos = $join.before(firstLevelDepth + index);
    const node = tr.doc.nodeAt(nodePos);
    if (!node) return;
    const key =
      level.kind === "item"
        ? LIST_ITEM_SPLIT_CONTINUES_ATTR
        : SPLIT_CONTINUES_ATTR;
    tr.setNodeMarkup(nodePos, undefined, {
      ...node.attrs,
      [key]: level.tail.attrs[key] === true,
    });
  });
  // A list item cut before a nested block opens its tail with an empty
  // schema-bridge paragraph. The joined item does not need it, and the
  // nested fragments it separated meet again.
  if (levels[levels.length - 1]?.kind === "item") {
    const bridge = tr.doc.resolve(joinPos).nodeAfter;
    if (
      bridge?.type.name === "paragraph" &&
      bridge.attrs[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true &&
      bridge.content.size === 0
    ) {
      tr.delete(joinPos, joinPos + bridge.nodeSize);
      return joinAt(tr, joinPos, false) ?? joinPos;
    }
  }
  return joinPos;
}

function joinSeam(tr: Transaction, seamPos: number): SeamRecord | null {
  const pos = joinAt(tr, seamPos, true);
  return pos === null ? null : { pos, step: tr.steps.length };
}

function revert(tr: Transaction, plan: CrossSheetPlan): void {
  const steps = tr.steps.slice(plan.mark);
  const docs = tr.docs.slice(plan.mark);
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    tr.step(steps[index].invert(docs[index]));
  }
  try {
    tr.setSelection(Selection.fromJSON(tr.doc, plan.selection as never));
  } catch {
    // The doc is the original again; a selection that no longer resolves
    // leaves ProseMirror's mapped one.
  }
}

/**
 * Join every sheet the transaction's selection spans into one. Null (and an
 * untouched transaction) when the selection lies on one sheet or is not a
 * text/all selection.
 */
export function joinSelectionSheets(tr: Transaction): CrossSheetPlan | null {
  const { selection } = tr;
  if (
    !isTextRangeSelection(selection) &&
    !(selection instanceof AllSelection)
  ) {
    return null;
  }
  const span = selectionSheetSpan(tr.doc, selection.from, selection.to);
  if (!span) return null;
  const plan: CrossSheetPlan = {
    mark: tr.steps.length,
    selection: selection.toJSON(),
    seams: [],
  };
  // A doc-level end (Ctrl+A) is re-seated on the first / last text of the
  // span: a block range resolved at the doc root can wrap no paragraph.
  if (selection.$from.depth === 0 || selection.$to.depth === 0) {
    tr.setSelection(
      TextSelection.between(
        tr.doc.resolve(Selection.atStart(tr.doc).from),
        tr.doc.resolve(Selection.atEnd(tr.doc).to),
      ),
    );
  }
  const seamPositions: number[] = [];
  let pos = 0;
  for (let index = 0; index < span.last; index += 1) {
    pos += tr.doc.child(index).nodeSize;
    if (index >= span.first) seamPositions.push(pos);
  }
  // Last boundary first: a join never moves the positions before it.
  for (let index = seamPositions.length - 1; index >= 0; index -= 1) {
    const seam = joinSeam(tr, seamPositions[index]);
    if (seam) plan.seams.push(seam);
  }
  if (plan.seams.length === 0) {
    if (tr.steps.length > plan.mark || !tr.selection.eq(selection)) {
      revert(tr, plan);
    }
    return null;
  }
  return plan;
}

/**
 * Hand the joined boundaries to the rewrap pass that runs when `tr` is
 * applied. `positions` overrides the tracked boundaries with exact positions
 * in the transaction's current doc (a caller that rebuilt the content).
 */
export function commitCrossSheetEdit(
  tr: Transaction,
  plan: CrossSheetPlan,
  positions?: readonly number[],
): void {
  const records: SeamRecord[] = positions
    ? positions.map((pos) => ({ pos, step: tr.steps.length }))
    : plan.seams;
  const previous = (tr.getMeta(crossSheetKey) as SeamRecord[] | undefined) ?? [];
  tr.setMeta(crossSheetKey, [...previous, ...records]);
}

type RawCommand = (...args: unknown[]) => (props: CommandProps) => boolean;

/** Tiptap's chainable state snapshots doc and selection and re-reads them
 * from the transaction only when its `tr` is read. */
function resyncChainableState(props: CommandProps): void {
  void props.state.tr;
}

/**
 * Run `command` as if its transaction started at the joined doc. Commands
 * read positions from the (joined) state and map them through `tr.mapping`
 * on the assumption that the mapping starts there (ProseMirror's
 * liftOutOfList refuses otherwise, Tiptap's clearNodes resolves the wrong
 * nodes); the join's own steps must not be mapped through twice.
 */
function fromJoinedDoc<T>(tr: Transaction, command: () => T): T {
  const mapping = tr.mapping as unknown as { from: number };
  const from = mapping.from;
  mapping.from = tr.steps.length;
  try {
    return command();
  } finally {
    mapping.from = from;
  }
}

/**
 * Ctrl+A on a one-page document: the selection's ends sit at the doc root,
 * where a block range can wrap no paragraph. Bullets from the gallery then
 * did nothing, yet Tiptap's toggleList had already run clearNodes into the
 * transaction, so the chain dispatched an invisible undo step (the first
 * Cmd+Z "did nothing"). The command gets the same text selection a
 * multi-page Ctrl+A gets; a refusal or a dry run leaves the transaction as
 * it found it.
 */
function onSheetText(props: CommandProps, run: () => boolean): boolean {
  const { tr } = props;
  const selection = tr.selection;
  if (
    !isSheeted(tr.doc) ||
    !(isTextRangeSelection(selection) || selection instanceof AllSelection) ||
    (selection.$from.depth !== 0 && selection.$to.depth !== 0)
  ) {
    return run();
  }
  const plan: CrossSheetPlan = {
    mark: tr.steps.length,
    selection: selection.toJSON(),
    seams: [],
  };
  tr.setSelection(
    TextSelection.between(
      tr.doc.resolve(Selection.atStart(tr.doc).from),
      tr.doc.resolve(Selection.atEnd(tr.doc).to),
    ),
  );
  resyncChainableState(props);
  let applied = false;
  try {
    applied = run();
  } finally {
    if (!applied || !props.dispatch) {
      revert(tr, plan);
      resyncChainableState(props);
    }
  }
  return applied;
}

interface HistoryItemLike {
  map: { map(pos: number, assoc?: number): number };
  step?: { from?: unknown; to?: unknown; pos?: unknown } | null;
  selection?: unknown;
}

interface HistoryBranchLike {
  eventCount?: number;
  items?: { forEach(callback: (item: HistoryItemLike) => unknown): void };
}

/**
 * The span of the current document the next Undo (or Redo) rewrites and the
 * number of steps it undoes: prosemirror-history's last event, its steps
 * mapped through everything applied since. Null without a local history (the
 * collaborative history undoes the stored document, which has no pages) or
 * an event to undo.
 */
function pendingHistoryEvent(
  state: EditorState,
  redo: boolean,
): { from: number; to: number; steps: number } | null {
  const plugin = state.plugins.find(
    (candidate) => (candidate as unknown as { key?: string }).key === "history$",
  );
  const history = plugin?.getState(state) as
    | { done?: HistoryBranchLike; undone?: HistoryBranchLike }
    | undefined;
  const branch = redo ? history?.undone : history?.done;
  if (!branch?.items || !((branch.eventCount ?? 0) > 0)) return null;
  const items: HistoryItemLike[] = [];
  branch.items.forEach((item) => {
    items.push(item);
  });
  // An event starts at the item that carries its selection.
  let start = items.length - 1;
  while (start >= 0 && !items[start].selection) start -= 1;
  if (start < 0) return null;
  let from = Infinity;
  let to = -Infinity;
  let steps = 0;
  for (let index = start; index < items.length; index += 1) {
    const step = items[index].step;
    if (!step) continue;
    steps += 1;
    const at =
      typeof step.from === "number"
        ? step.from
        : typeof step.pos === "number"
          ? step.pos
          : null;
    if (at === null) continue;
    let a = at;
    let b = typeof step.to === "number" ? step.to : at;
    for (let later = index + 1; later < items.length; later += 1) {
      a = items[later].map.map(a, -1);
      b = items[later].map.map(b, 1);
    }
    from = Math.min(from, a);
    to = Math.max(to, b);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const size = state.doc.content.size;
  return {
    from: Math.max(0, Math.min(from, size)),
    to: Math.max(0, Math.min(to, size)),
    steps,
  };
}

/**
 * Join the page boundaries (and the continuation pairs they cut) inside the
 * span the next Undo / Redo rewrites, as a layout transaction outside the
 * history. Null when that span lies on one page.
 */
function pendingHistorySeamJoin(
  state: EditorState,
  redo: boolean,
): Transaction | null {
  if (!isSheeted(state.doc)) return null;
  const event = pendingHistoryEvent(state, redo);
  if (!event) return null;
  const span = sheetSpan(state.doc, event.from, event.to);
  if (!span) return null;
  // An event whose every step still fits the pages is undone as it is.
  let dryRun: Transaction | null = null;
  (redo ? redoHistory : undoHistory)(state, (tr) => {
    dryRun = tr;
  });
  if (!dryRun || (dryRun as Transaction).steps.length >= event.steps) return null;
  const tr = state.tr;
  const seamPositions: number[] = [];
  let pos = 0;
  for (let index = 0; index < span.last; index += 1) {
    pos += tr.doc.child(index).nodeSize;
    if (index >= span.first) seamPositions.push(pos);
  }
  for (let index = seamPositions.length - 1; index >= 0; index -= 1) {
    joinSeam(tr, seamPositions[index]);
  }
  return tr.steps.length > 0 ? tr.setMeta("addToHistory", false) : null;
}

/**
 * Undo and Redo act on the text flow, not on pages.
 *
 * A history event records steps against the pages of its time: Bullets over
 * text that crosses a page wraps one list around paragraphs of joined
 * sheets, then cuts it again at the old boundaries. When the paginator later
 * moves a boundary inside that range (list items are not as tall as the
 * paragraphs and headings they replaced), the recorded inverse no longer
 * fits: unwrapping a list that now straddles two sheets is "not a flat
 * range", so Undo dropped the event's steps and the page stayed bulleted.
 * When the recorded steps no longer all apply, the boundaries inside the
 * span the event rewrites are joined first (a layout transaction the history
 * maps through, as it does the paginator's own), the event is undone on that
 * flow, and the paginator cuts the pages again. An event that still fits its
 * pages is undone exactly as before.
 */
function onTextFlow(command: RawCommand, redo: boolean): RawCommand {
  let joining = false;
  return (...args) =>
    (props) => {
      const { dispatch, editor, tr, view } = props;
      if (joining || !dispatch || !view || tr.steps.length > 0) {
        return command(...args)(props);
      }
      const seams = pendingHistorySeamJoin(view.state, redo);
      if (!seams) return command(...args)(props);
      tr.setMeta("preventDispatch", true);
      view.dispatch(seams);
      joining = true;
      try {
        return redo ? editor.commands.redo() : editor.commands.undo();
      } finally {
        joining = false;
      }
    };
}

function acrossSheets(command: RawCommand): RawCommand {
  return (...args) =>
    (props) => {
      const plan = joinSelectionSheets(props.tr);
      if (!plan) return onSheetText(props, () => command(...args)(props));
      resyncChainableState(props);
      let applied = false;
      try {
        applied = fromJoinedDoc(props.tr, () => command(...args)(props));
      } catch (error) {
        revert(props.tr, plan);
        resyncChainableState(props);
        throw error;
      }
      // A dry run (`can()`) and a refusal leave the transaction untouched.
      if (!applied || !props.dispatch) {
        revert(props.tr, plan);
        resyncChainableState(props);
        return applied;
      }
      commitCrossSheetEdit(props.tr, plan);
      return applied;
    };
}

function orderedListStart(node: PmNode): number {
  const raw = Number(node.attrs.start);
  return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
}

/**
 * Re-create a page boundary between `a` (end of what preceded it) and `b`
 * (start of what followed it), splitting every node that now contains it
 * the way the paginator's own cuts do.
 */
function splitAtBoundary(tr: Transaction, a: number, b: number): boolean {
  const { doc } = tr;
  if (a > b || a < 0 || b > doc.content.size) return false;
  const $a = doc.resolve(a);
  let point = a;
  if (b !== a) {
    const $b = doc.resolve(b);
    const shared = $a.sharedDepth(b);
    // Only closing and opening tokens may lie between the two ends.
    if (b - a !== $a.depth - shared + ($b.depth - shared)) return false;
    point = a + ($a.depth - shared);
  }
  let $point = doc.resolve(point);
  // A cut at the very start or end of a node is the boundary around it.
  while ($point.depth > 1) {
    if ($point.pos === $point.start()) point = $point.before();
    else if ($point.pos === $point.end()) point = $point.after();
    else break;
    $point = doc.resolve(point);
  }
  const depth = $point.depth;
  if (depth < 1 || $point.node(1).type.name !== PAGE_BLOCK_NODE) return false;
  const tails: Array<{ node: PmNode; attrs: Record<string, unknown> }> = [];
  const heads: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  for (let level = 2; level <= depth; level += 1) {
    const node = $point.node(level);
    const name = node.type.name;
    if (TEXT_TYPES.has(name) || CONTAINER_TYPES.has(name)) {
      heads.push({
        pos: $point.before(level),
        attrs: { ...node.attrs, [SPLIT_CONTINUES_ATTR]: true },
      });
      const attrs: Record<string, unknown> = {
        ...node.attrs,
        [SPLIT_CONTINUATION_ATTR]: true,
        [SPLIT_CONTINUES_ATTR]: node.attrs[SPLIT_CONTINUES_ATTR] === true,
      };
      // The tail's first item keeps its logical ordinal.
      if (name === "orderedList") {
        attrs.start = orderedListStart(node) + $point.index(level);
      }
      tails.push({ node, attrs });
    } else if (ITEM_TYPES.has(name)) {
      heads.push({
        pos: $point.before(level),
        attrs: { ...node.attrs, [LIST_ITEM_SPLIT_CONTINUES_ATTR]: true },
      });
      tails.push({
        node,
        attrs: {
          ...node.attrs,
          [LIST_ITEM_SPLIT_CONTINUATION_ATTR]: true,
          [LIST_ITEM_SPLIT_CONTINUES_ATTR]:
            node.attrs[LIST_ITEM_SPLIT_CONTINUES_ATTR] === true,
        },
      });
    } else {
      return false;
    }
  }
  // ProseMirror's split, plus the paginator's schema bridge: a list item's
  // tail that would open with a nested block starts with an empty bridge
  // paragraph (listItem is `paragraph block*`).
  const bridge = doc.type.schema.nodes.paragraph?.create({
    [LIST_ITEM_SPLIT_BRIDGE_ATTR]: true,
  });
  let before = Fragment.empty;
  let after = Fragment.empty;
  for (let level = depth; level >= 1; level -= 1) {
    const node = $point.node(level);
    before = Fragment.from(node.copy(before));
    if (level === 1) {
      after = Fragment.from(node.copy(after));
      continue;
    }
    const tail = tails[level - 2];
    let content = after;
    if (
      ITEM_TYPES.has(node.type.name) &&
      content.firstChild?.type.name !== "paragraph"
    ) {
      if (!bridge) return false;
      content = Fragment.from(bridge).append(content);
    }
    after = Fragment.from(node.type.create(tail.attrs, content, node.marks));
  }
  const result = tr.maybeStep(
    new ReplaceStep(
      point,
      point,
      new Slice(before.append(after), depth, depth),
      true,
    ),
  );
  if (result.failed) return false;
  for (const head of heads) tr.setNodeMarkup(head.pos, undefined, head.attrs);
  return true;
}

function rewrapTransactions(
  transactions: readonly Transaction[],
  state: EditorState,
): Transaction | null {
  const boundaries: Array<{ a: number; b: number }> = [];
  transactions.forEach((transaction, index) => {
    const seams = transaction.getMeta(crossSheetKey) as SeamRecord[] | undefined;
    if (!seams?.length) return;
    for (const seam of seams) {
      const rest = transaction.mapping.slice(seam.step);
      const before = rest.mapResult(seam.pos, -1);
      const after = rest.mapResult(seam.pos, 1);
      if (before.deleted && after.deleted) continue;
      let a = before.pos;
      let b = after.pos;
      for (const later of transactions.slice(index + 1)) {
        a = later.mapping.map(a, -1);
        b = later.mapping.map(b, 1);
      }
      boundaries.push({ a, b });
    }
  });
  if (boundaries.length === 0) return null;
  const tr = state.tr;
  // Last boundary first: a split never moves the positions before it.
  boundaries.sort((left, right) => right.a - left.a);
  let changed = false;
  for (const boundary of boundaries) {
    if (splitAtBoundary(tr, boundary.a, boundary.b)) changed = true;
  }
  return changed ? tr : null;
}

/**
 * Semantic blocks of a slice copied from or pasted into the sheets: no page
 * wrapper, and one node for every runtime continuation pair.
 */
export function flattenSheetSlice(slice: Slice, schema: Schema): Slice {
  let hasSheet = false;
  slice.content.forEach((node) => {
    if (node.type.name === PAGE_BLOCK_NODE) hasSheet = true;
  });
  if (!hasSheet) return detachTableFragmentsInSlice(slice, schema);
  const json = { type: "doc", content: slice.content.toJSON() ?? [] };
  const semantic = flattenPageBlocks(mergePagedRuntimeContinuationsJson(json));
  let content: Fragment;
  try {
    content = Fragment.fromJSON(schema, semantic.content);
  } catch {
    return slice;
  }
  const openStart =
    slice.content.firstChild?.type.name === PAGE_BLOCK_NODE
      ? Math.max(0, slice.openStart - 1)
      : slice.openStart;
  const openEnd =
    slice.content.lastChild?.type.name === PAGE_BLOCK_NODE
      ? Math.max(0, slice.openEnd - 1)
      : slice.openEnd;
  return new Slice(content, openStart, openEnd);
}

/**
 * A slice copied from inside one page (no page wrapper) can still hold a page
 * fragment of a table, or its rows and cells. Pasted as it is, the copy kept
 * the fragment's pagination identity and the save merged it back into the
 * original table. It is a new table: its pagination state is dropped.
 */
function detachTableFragmentsInSlice(slice: Slice, schema: Schema): Slice {
  const detached = detachTableFragmentsInSliceJson(
    slice.content.toJSON() ?? [],
    slice.openStart,
    slice.openEnd,
  );
  if (!detached) return slice;
  try {
    return new Slice(
      Fragment.fromJSON(schema, detached),
      slice.openStart,
      slice.openEnd,
    );
  } catch {
    return slice;
  }
}

/**
 * Tiptap's node `isActive` compares the covered length with `to - from`,
 * which counts the page wrappers' own tokens as uncovered: any selection
 * crossing a page read as "not a list / not a heading". The same test with
 * the wrappers' tokens discounted. Null when no wrapper token is selected
 * (the caller keeps the stock answer) or `name` is not a node.
 */
export function isActiveAcrossSheets(
  state: EditorState,
  name: string,
  attributes: Record<string, unknown> = {},
): boolean | null {
  const { doc, schema, selection } = state;
  if (!selection || selection.empty || !doc?.type || !schema) return null;
  if (!isSheeted(doc)) return null;
  if (getSchemaTypeNameByName(name, schema) !== "node") return null;
  const { from, to } = selection;
  let wrapperTokens = 0;
  let covered = 0;
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) return false;
    if (node.type.name === PAGE_BLOCK_NODE) {
      if (pos >= from) wrapperTokens += 1;
      if (pos + node.nodeSize <= to) wrapperTokens += 1;
    }
    if (
      node.type.name === name &&
      objectIncludes(node.attrs, attributes, { strict: false })
    ) {
      covered += Math.min(to, pos + node.nodeSize) - Math.max(from, pos);
    }
    return true;
  });
  if (wrapperTokens === 0) return null;
  return covered > 0 && covered >= to - from - wrapperTokens;
}

export const CrossSheetEditing = Extension.create({
  name: "crossSheetEditing",

  onBeforeCreate() {
    // The command table the editor dispatches from is final here (every
    // extension's addCommands merged), so an override of one of these
    // commands by another extension is wrapped, not shadowed.
    const table = (
      this.editor as unknown as {
        commandManager?: { rawCommands?: Record<string, unknown> };
      }
    ).commandManager?.rawCommands;
    if (!table) return;
    for (const name of SHEET_TRANSPARENT_COMMANDS) {
      const command = table[name];
      if (typeof command === "function") {
        table[name] = acrossSheets(command as RawCommand);
      }
    }
    for (const name of ["undo", "redo"] as const) {
      const command = table[name];
      if (typeof command === "function") {
        table[name] = onTextFlow(command as RawCommand, name === "redo");
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: crossSheetKey,
        appendTransaction: imeReplayingAppendTransaction((transactions, _oldState, newState) =>
          rewrapTransactions(transactions, newState),
        ),
        props: {
          transformCopied: (slice, view) =>
            flattenSheetSlice(slice, view.state.schema),
          transformPasted: (slice, view) =>
            flattenSheetSlice(slice, view.state.schema),
        },
      }),
    ];
  },
});

export default CrossSheetEditing;
