/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word-style structural pagination for lists, blockquotes and callouts.
 *
 * A list or quote is one semantic ProseMirror node, but Word may flow it over
 * any number of physical pages.  The editor therefore materialises temporary
 * sibling containers at page boundaries and joins them again before every
 * persistence/export boundary.  Splits prefer structural boundaries (list
 * item / container child); an individually oversized text child is cut at a
 * measured line boundary without rewriting its inline runs.
 *
 * This module is deliberately independent from pageRebalanceExtension.  The
 * rebalancer supplies geometry and invokes the exported planner/transaction
 * helpers; storage and DOCX export invoke mergeContainerContinuationsJson.
 */

import { SheetFact } from "../../../../../lib/editor/sheet-facts";
import { paragraphKeepFlag } from "../paragraphPagination";
import { joinInlineFragments } from "./joinInlineFragments";
import { Extension } from "@tiptap/core";
import {
  Fragment,
  Slice,
  type Node as PmNode,
  type NodeType,
} from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import {
  AttrStep,
  Mapping,
  ReplaceAroundStep,
  ReplaceStep,
  Transform,
} from "@tiptap/pm/transform";

import {
  NOTE_LIST_NODE,
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
  isSplitCapableType,
  minimumTextSplitLines,
  planTextCutByChars,
  insideInlineAtom,
} from "./blockSplitting";
import { PAGE_BLOCK_NODE, SPLIT_PIECE_OF_ATTR, splitPieceRoot } from "./paginationProjectionKeys";
import { noteStrippedAttrs } from "./projectionJsonMemo";
import { selectionNearInlineContent } from "../safeTextSelection";
import {
  imeReplayingAppendTransaction,
  imeSafeAppendTransaction,
  isAnyImeCompositionActive,
} from "../imeCompositionGuard";
import { paginationLayoutRect, paginationLayoutScale } from "./paginationGeometry";
import { trailingAutoLeadingCreditPx } from "./pageEdgeLeading";
import { collapseMargins, collapsedEdgeMarginPx, type AuthoredMarginPx } from "./marginCollapse";
import { contextualParagraphStyleIdentity } from "../contextualParagraphSpacingExtension";
import {
  mergeAdjacentTableFragmentsJson,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_ROW_CONTINUATION_ATTR,
  TABLE_SOURCE_ROW_ATTR,
  type TableJsonNode,
} from "./tablePagination";

export const LIST_ITEM_SPLIT_CONTINUES_ATTR = "pageSplitItemContinues";
export const LIST_ITEM_SPLIT_CONTINUATION_ATTR = "pageSplitItemContinuation";
export const LIST_ITEM_SPLIT_BRIDGE_ATTR = "pageSplitListItemBridge";
/** Runtime-only marker for a single oversized child that has no legal cut. */
export const CONTAINER_UNBREAKABLE_FALLBACK_ATTR =
  "pageUnbreakableContainerFallback";

const SPLITTABLE_CONTAINERS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "callout",
]);

const LIST_CONTAINER_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

const LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);

const TEXTBLOCK_TYPES = new Set(["paragraph", "heading"]);

/**
 * Runtime-only attrs required by the split helpers.  Register this extension
 * next to PageRebalance.  The attrs are never document semantics:
 * mergeContainerContinuationsJson strips them before save/export.
 */
export const ContainerPageSplitAttrs = Extension.create({
  name: "containerPageSplitAttrs",
  addGlobalAttributes() {
    const booleanAttr = (key: string, dashed: string) => ({
      default: false,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute(`data-${dashed}`) === "true",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs[key] === true ? { [`data-${dashed}`]: "true" } : {},
    });
    return [
      {
        types: [
          "bulletList",
          "orderedList",
          "taskList",
          "blockquote",
          "callout",
        ],
        attributes: {
          [SPLIT_CONTINUES_ATTR]: booleanAttr(
            SPLIT_CONTINUES_ATTR,
            "page-split-continues",
          ),
          [SPLIT_CONTINUATION_ATTR]: booleanAttr(
            SPLIT_CONTINUATION_ATTR,
            "page-split-continuation",
          ),
          [CONTAINER_UNBREAKABLE_FALLBACK_ATTR]: booleanAttr(
            CONTAINER_UNBREAKABLE_FALLBACK_ATTR,
            "page-unbreakable-container-fallback",
          ),
        },
      },
      {
        types: ["listItem", "taskItem"],
        attributes: {
          [LIST_ITEM_SPLIT_CONTINUES_ATTR]: booleanAttr(
            LIST_ITEM_SPLIT_CONTINUES_ATTR,
            "page-split-item-continues",
          ),
          [LIST_ITEM_SPLIT_CONTINUATION_ATTR]: booleanAttr(
            LIST_ITEM_SPLIT_CONTINUATION_ATTR,
            "page-split-item-continuation",
          ),
        },
      },
      {
        types: ["paragraph"],
        attributes: {
          [LIST_ITEM_SPLIT_BRIDGE_ATTR]: booleanAttr(
            LIST_ITEM_SPLIT_BRIDGE_ATTR,
            "page-split-list-item-bridge",
          ),
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [listItemBridgePlugin(), taskItemChainCheckedPlugin(), textSplitHeadIntegrityPlugin()];
  },
});










const HOLDS_TEXT_SPLIT_STAMP = new SheetFact((node) => node.attrs?.[SPLIT_CONTINUES_ATTR] === true || node.attrs?.[SPLIT_CONTINUATION_ATTR] === true);

function textSplitHeadIntegrityPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("textSplitHeadIntegrity"),
    appendTransaction: imeSafeAppendTransaction((transactions, _oldState, newState) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      let tr: Transaction | null = null;
      let previous: { node: PmNode; pos: number } | null = null;
      const settle = (next: PmNode | null) => {
        if (!previous) return;
        const { node, pos } = previous;
        if (
          node.attrs?.[SPLIT_CONTINUES_ATTR] !== true ||
          !isSplitCapableType(node.type.name)
        ) {
          return;
        }
        if (
          next &&
          next.type === node.type &&
          next.attrs?.[SPLIT_CONTINUATION_ATTR] === true
        ) {
          return;
        }
        tr ??= newState.tr;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, [SPLIT_CONTINUES_ATTR]: false });
      };
      newState.doc.forEach((page, pageOffset) => {
        if (page.type.name !== PAGE_BLOCK_NODE) return;
        // Nothing on this sheet is stamped, and what stands before it wants no
        // tail: only its last block, for the sheet after it.
        if (!HOLDS_TEXT_SPLIT_STAMP.sheet(page) && previous?.node.attrs?.[SPLIT_CONTINUES_ATTR] !== true) {
          let end = pageOffset + 1 + page.content.size;
          for (let index = page.childCount - 1; index >= 0; index -= 1) {
            const child = page.child(index);
            end -= child.nodeSize;
            if (child.type.name !== NOTE_LIST_NODE) {
              previous = { node: child, pos: end };
              break;
            }
          }
          return;
        }
        page.forEach((child, childOffset) => {
          // A footnote slice at the page foot is not the next block.
          if (child.type.name === NOTE_LIST_NODE) return;
          settle(child);
          const pos = pageOffset + 1 + childOffset;
          // The mirror: a tail stamped "continuation" must follow its head.
          // Enter in the part of a paragraph a later page continues copied
          // the stamp onto the new paragraph, which every save then merged
          // back into the one before it: the break was gone on reopening
          // (WUA 076).
          const head = previous?.node as PmNode | undefined;
          if (
            child.attrs?.[SPLIT_CONTINUATION_ATTR] === true &&
            isSplitCapableType(child.type.name) &&
            !(head && head.type === child.type && head.attrs?.[SPLIT_CONTINUES_ATTR] === true)
          ) {
            tr ??= newState.tr;
            const piece = child.attrs?.[SPLIT_PIECE_OF_ATTR];
            if (
              head &&
              previous &&
              head.type === child.type &&
              typeof piece === "string" &&
              piece === splitPieceRoot(head.attrs)
            ) {
              // Provably a piece of the block before it (it names that block's
              // identity): that fragment lost its "continues", not this one its
              // "continuation". Cleared, this piece was saved as a paragraph of
              
              tr.setNodeMarkup(previous.pos, undefined, { ...head.attrs, [SPLIT_CONTINUES_ATTR]: true });
            } else {
              tr.setNodeMarkup(pos, undefined, { ...child.attrs, [SPLIT_CONTINUATION_ATTR]: false });
            }
          }
          previous = { node: child, pos };
        });
      });
      settle(null);
      if (tr) (tr as Transaction).setMeta("addToHistory", false);
      return tr;
    }),
  });
}








function taskItemChainCheckedPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("containerTaskItemChainChecked"),
    appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) => {
      // A box is ticked by a node-markup change; typing (ReplaceStep only)
      // never needs the walk below.
      if (
        !transactions.some((tr) =>
          tr.steps.some((step) => step instanceof ReplaceAroundStep || step instanceof AttrStep),
        )
      ) {
        return null;
      }
      // Chains of task item fragments, in document order, by list depth.
      const chains: Array<Array<{ pos: number; checked: boolean }>> = [];
      const open = new Map<number, Array<{ pos: number; checked: boolean }>>();
      newState.doc.descendants((node, pos) => {
        if (node.type.name !== "taskItem") return true;
        const depth = newState.doc.resolve(pos).depth;
        const continues = node.attrs[LIST_ITEM_SPLIT_CONTINUES_ATTR] === true;
        const continuation = node.attrs[LIST_ITEM_SPLIT_CONTINUATION_ATTR] === true;
        const entry = { pos, checked: node.attrs.checked === true };
        if (continuation && open.has(depth)) {
          open.get(depth)!.push(entry);
        } else if (continues) {
          const chain = [entry];
          chains.push(chain);
          open.set(depth, chain);
        }
        if (!continues) open.delete(depth);
        return true;
      });
      const mapping = new Mapping();
      for (const transaction of transactions) {
        for (const map of transaction.mapping.maps) mapping.appendMap(map);
      }
      const back = mapping.invert();
      let tr: Transaction | null = null;
      for (const chain of chains) {
        if (chain.length < 2 || chain.every((entry) => entry.checked === chain[0]!.checked)) continue;
        const changed = chain.find((entry) => {
          const before = oldState.doc.nodeAt(back.map(entry.pos));
          return before?.type.name === "taskItem" && (before.attrs.checked === true) !== entry.checked;
        });
        const checked = (changed ?? chain[0]!).checked;
        for (const entry of chain) {
          if (entry.checked === checked) continue;
          tr ??= newState.tr;
          const node = tr.doc.nodeAt(entry.pos);
          if (node) tr.setNodeMarkup(entry.pos, undefined, { ...node.attrs, checked });
        }
      }
      if (tr) tr.setMeta("addToHistory", transactions.every((t) => t.getMeta("addToHistory") !== false));
      return tr;
    }),
  });
}

/**
 * The schema bridge that opens a continued list item paints no line (Word has
 * no paragraph there), so it must never hold the caret or text:
 *   - text that does arrive in one (typed, pasted, a remote edit) makes it an
 *     ordinary paragraph, which every merge then keeps;
 *   - a caret that lands in an empty one (arrow keys, a click on the seam)
 *     moves on in the direction it travelled — Up from the first sub-item on
 *     the page reaches the end of the previous page, as in Word.
 */
function listItemBridgePlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("containerListItemBridge"),
    appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) => {
      if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) {
        return null;
      }
      const mapping = new Mapping();
      for (const transaction of transactions) {
        for (const map of transaction.mapping.maps) mapping.appendMap(map);
      }
      let tr: Transaction | null = null;
      const filled = new Set<number>();
      mapping.maps.forEach((map, index) => {
        const rest = mapping.slice(index + 1);
        map.forEach((_oldStart, _oldEnd, start, end) => {
          const from = Math.max(0, rest.map(start, -1));
          const to = Math.min(newState.doc.content.size, rest.map(end, 1));
          if (to < from) return;
          newState.doc.nodesBetween(from, to, (node, pos) => {
            if (
              node.type.name === "paragraph" &&
              node.attrs[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true &&
              node.content.size > 0
            ) {
              filled.add(pos);
            }
            return !node.isTextblock;
          });
        });
      });
      for (const pos of filled) {
        const node = (tr ?? newState.tr).doc.nodeAt(pos);
        if (!node) continue;
        tr ??= newState.tr;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          [LIST_ITEM_SPLIT_BRIDGE_ATTR]: false,
        });
      }
      const selection = (tr ?? newState).selection;
      const parent = selection.$head.parent;
      if (
        !(selection instanceof TextSelection) ||
        !selection.empty ||
        parent.type.name !== "paragraph" ||
        parent.attrs[LIST_ITEM_SPLIT_BRIDGE_ATTR] !== true ||
        parent.content.size !== 0 ||
        isAnyImeCompositionActive()
      ) {
        return tr;
      }
      const doc = (tr ?? newState).doc;
      const backward =
        mapping.map(oldState.selection.head, 1) >= selection.$head.after();
      tr ??= newState.tr;
      tr.setSelection(
        selectionNearInlineContent(
          doc,
          backward ? selection.$head.before() : selection.$head.after(),
          backward ? -1 : 1,
        ),
      );
      return tr;
    }),
  });
}

export type ContainerSplitPlan =
  | {
      kind: "listItemBoundary";
      /** Number of complete leading items retained in the head. */
      headItemCount: number;
    }
  | {
      kind: "listItemBlockBoundary";
      itemIndex: number;
      /** Number of complete direct blocks retained in the split item head. */
      headBlockCount: number;
    }
  | {
      kind: "listItemText";
      itemIndex: number;
      childIndex: number;
      /** Offset in the textblock's ProseMirror CONTENT (UTF-16 units). */
      textOffset: number;
    }
  | {
      /** A cut inside a nested list of item `itemIndex`: the item's head keeps
       * its blocks before that list plus the list's head, and its tail opens
       * (after a schema bridge) with the list's tail. Word flows the nested
       * level's paragraphs like any others, so the item's own first line and
       * the sub-items that fit stay on the page. */
      kind: "listItemNested";
      itemIndex: number;
      /** Index of the nested list (or quote/callout) among the item's direct
       * blocks. */
      childIndex: number;
      plan: ContainerSplitPlan;
    }
  | {
      /** A table among item `itemIndex`'s blocks cut between or within its
       * rows, by the top-level tables' own row planner (`splitTable`): the
       * item's head keeps its blocks before the table plus the table's head
       * fragment; its tail opens (after a schema bridge) with the table's
       * tail fragment. Word flows a table's rows over pages wherever it
       * stands, a list item included. */
      kind: "listItemTable";
      itemIndex: number;
      childIndex: number;
      head: PmNode;
      tail: PmNode;
      /** The cut's identity, as the seam it leaves is keyed (tableSeamSignature). */
      signature: string;
    }
  | {
      kind: "blockquoteBlockBoundary";
      /** Number of complete leading quote blocks retained in the head. */
      headBlockCount: number;
    }
  | {
      kind: "blockquoteText";
      childIndex: number;
      /** Offset in the textblock's ProseMirror CONTENT (UTF-16 units). */
      textOffset: number;
    }
  | {
      kind: "calloutBlockBoundary";
      /** Number of complete leading callout blocks retained in the head. */
      headBlockCount: number;
    }
  | {
      kind: "calloutText";
      childIndex: number;
      /** Offset in the textblock's ProseMirror CONTENT (UTF-16 units). */
      textOffset: number;
    }
  | {
      /** A cut inside a list (or quote/callout) nested in the quote or
       * callout: the head keeps the blocks before it plus its head, the tail
       * opens with its tail. */
      kind: "blockquoteNested" | "calloutNested";
      childIndex: number;
      plan: ContainerSplitPlan;
    };

/** Containers a page or column break may stand in: the paginator cuts them
 * right after one (nestedBreakCutPlan). */
export const BREAK_HOLDING_CONTAINERS: ReadonlySet<string> = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
  "blockquote",
  "callout",
]);

/**
 * "pageBreak" / "columnBreak" when `node` is that break, or a list, quote or
 * callout whose last block -- down its last items -- is one: the page (or
 * column) closes after the container all the same. Word keeps a break typed
 * in a list item as a paragraph after it (WUA 004); the editor keeps it as
 * the item's last block.
 */
export function trailingBreakOf(node: PmNode): "pageBreak" | "columnBreak" | null {
  let current: PmNode | null = node;
  for (let depth = 0; current && depth < 32; depth += 1) {
    const name = current.type.name;
    if (name === "pageBreak" || name === "columnBreak") return name;
    if (!BREAK_HOLDING_CONTAINERS.has(name)) return null;
    current = current.lastChild;
  }
  return null;
}

export interface SplitContainerPair {
  head: PmNode;
  tail: PmNode;
}

function isList(node: PmNode): boolean {
  return LIST_CONTAINER_TYPES.has(node.type.name);
}

export function isSplittableContainer(node: PmNode): boolean {
  return (
    SPLITTABLE_CONTAINERS.has(node.type.name) &&
    !paragraphKeepFlag(node, "keepLines")
  );
}

export function isContainerContinuationTail(node: PmNode): boolean {
  return (
    isSplittableContainer(node) &&
    (node.attrs ?? {})[SPLIT_CONTINUATION_ATTR] === true
  );
}

function fragmentFromChildren(
  parent: PmNode,
  from: number,
  to: number,
): Fragment {
  const nodes: PmNode[] = [];
  for (let index = from; index < to; index += 1)
    nodes.push(parent.child(index));
  return Fragment.fromArray(nodes);
}

function withAttrs(
  node: PmNode,
  attrs: Record<string, unknown>,
  content: Fragment,
): PmNode {
  return node.type.create({ ...node.attrs, ...attrs }, content, node.marks);
}

function containerHeadAttrs(node: PmNode): Record<string, unknown> {
  return {
    ...node.attrs,
    [SPLIT_CONTINUES_ATTR]: true,
  };
}

function containerTailAttrs(node: PmNode): Record<string, unknown> {
  return {
    ...node.attrs,
    [SPLIT_CONTINUATION_ATTR]: true,
    // Re-splitting an earlier fragment must retain its existing successor.
    [SPLIT_CONTINUES_ATTR]: node.attrs?.[SPLIT_CONTINUES_ATTR] === true,
  };
}

function tailListAttrs(node: PmNode, logicalItemsBeforeTail: number) {
  const attrs = containerTailAttrs(node);
  if (node.type.name !== "orderedList") return attrs;
  const rawStart = Number(node.attrs?.start);
  const start = Number.isFinite(rawStart)
    ? Math.max(1, Math.floor(rawStart))
    : 1;
  return { ...attrs, start: start + Math.max(0, logicalItemsBeforeTail) };
}

function textblockPair(
  node: PmNode,
  textOffset: number,
): SplitContainerPair | null {
  if (!TEXTBLOCK_TYPES.has(node.type.name) || paragraphKeepFlag(node, "keepLines")) {
    return null;
  }
  if (
    !Number.isInteger(textOffset) ||
    textOffset <= 0 ||
    textOffset >= node.content.size
  ) {
    return null;
  }
  const headContent = node.content.cut(0, textOffset);
  const tailContent = node.content.cut(textOffset, node.content.size);
  if (headContent.size === 0 || tailContent.size === 0) return null;
  return {
    head: withAttrs(node, { [SPLIT_CONTINUES_ATTR]: true }, headContent),
    tail: withAttrs(
      node,
      {
        [SPLIT_CONTINUATION_ATTR]: true,
        [SPLIT_CONTINUES_ATTR]: node.attrs?.[SPLIT_CONTINUES_ATTR] === true,
        ...(SPLIT_PIECE_OF_ATTR in (node.type.spec.attrs ?? {}) ? { [SPLIT_PIECE_OF_ATTR]: splitPieceRoot(node.attrs) } : {}),
      },
      tailContent,
    ),
  };
}

function splitListNode(
  list: PmNode,
  plan: Extract<ContainerSplitPlan, { kind: `list${string}` }>,
): SplitContainerPair | null {
  if (!isList(list) || list.childCount === 0) return null;
  if (plan.kind === "listItemBoundary") {
    const k = plan.headItemCount;
    if (!Number.isInteger(k) || k <= 0 || k >= list.childCount) return null;
    return {
      head: list.type.create(
        containerHeadAttrs(list),
        fragmentFromChildren(list, 0, k),
        list.marks,
      ),
      tail: list.type.create(
        tailListAttrs(list, k),
        fragmentFromChildren(list, k, list.childCount),
        list.marks,
      ),
    };
  }

  const itemIndex = plan.itemIndex;
  if (
    !Number.isInteger(itemIndex) ||
    itemIndex < 0 ||
    itemIndex >= list.childCount
  ) {
    return null;
  }
  const item = list.child(itemIndex);
  if (!LIST_ITEM_TYPES.has(item.type.name) || item.childCount === 0)
    return null;

  let headItemContent: Fragment;
  let tailItemContent: Fragment;
  if (plan.kind === "listItemBlockBoundary") {
    const k = plan.headBlockCount;
    if (!Number.isInteger(k) || k <= 0 || k >= item.childCount) return null;
    headItemContent = fragmentFromChildren(item, 0, k);
    tailItemContent = fragmentFromChildren(item, k, item.childCount);
    // listItem is `paragraph block*`. A split before a nested table/code/list
    // therefore needs an editor-runtime empty paragraph in the tail. It is a
    // schema bridge only and is removed by both merge paths below.
    if (tailItemContent.firstChild?.type.name !== "paragraph") {
      const paragraph = item.type.schema.nodes.paragraph;
      if (!paragraph) return null;
      tailItemContent = Fragment.fromArray([
        paragraph.create({ [LIST_ITEM_SPLIT_BRIDGE_ATTR]: true }),
        ...Array.from({ length: tailItemContent.childCount }, (_, index) =>
          tailItemContent.child(index),
        ),
      ]);
    }
  } else if (plan.kind === "listItemTable") {
    const childIndex = plan.childIndex;
    const paragraph = item.type.schema.nodes.paragraph;
    if (
      !paragraph ||
      !Number.isInteger(childIndex) ||
      childIndex < 1 ||
      childIndex >= item.childCount ||
      item.child(childIndex).type.name !== "table"
    ) {
      return null;
    }
    headItemContent = Fragment.fromArray([
      ...Array.from({ length: childIndex }, (_, index) => item.child(index)),
      plan.head,
    ]);
    tailItemContent = Fragment.fromArray([
      paragraph.create({ [LIST_ITEM_SPLIT_BRIDGE_ATTR]: true }),
      plan.tail,
      ...Array.from({ length: item.childCount - childIndex - 1 }, (_, index) =>
        item.child(childIndex + index + 1),
      ),
    ]);
  } else if (plan.kind === "listItemNested") {
    const childIndex = plan.childIndex;
    const paragraph = item.type.schema.nodes.paragraph;
    if (
      !paragraph ||
      !Number.isInteger(childIndex) ||
      childIndex < 1 ||
      childIndex >= item.childCount
    ) {
      return null;
    }
    const nested = item.child(childIndex);
    if (!isSplittableContainer(nested)) return null;
    const pair = splitContainerNode(nested, plan.plan);
    if (!pair) return null;
    headItemContent = Fragment.fromArray([
      ...Array.from({ length: childIndex }, (_, index) => item.child(index)),
      pair.head,
    ]);
    tailItemContent = Fragment.fromArray([
      paragraph.create({ [LIST_ITEM_SPLIT_BRIDGE_ATTR]: true }),
      pair.tail,
      ...Array.from({ length: item.childCount - childIndex - 1 }, (_, index) =>
        item.child(childIndex + index + 1),
      ),
    ]);
  } else {
    const childIndex = plan.childIndex;
    if (
      !Number.isInteger(childIndex) ||
      childIndex < 0 ||
      childIndex >= item.childCount
    ) {
      return null;
    }
    const child = item.child(childIndex);
    const pair = textblockPair(child, plan.textOffset);
    if (!pair) return null;
    headItemContent = Fragment.fromArray([
      ...Array.from({ length: childIndex }, (_, index) => item.child(index)),
      pair.head,
    ]);
    tailItemContent = Fragment.fromArray([
      pair.tail,
      ...Array.from({ length: item.childCount - childIndex - 1 }, (_, index) =>
        item.child(childIndex + index + 1),
      ),
    ]);
  }

  const headItem = item.type.create(
    {
      ...item.attrs,
      [LIST_ITEM_SPLIT_CONTINUES_ATTR]: true,
    },
    headItemContent,
    item.marks,
  );
  const tailItem = item.type.create(
    {
      ...item.attrs,
      [LIST_ITEM_SPLIT_CONTINUATION_ATTR]: true,
      [LIST_ITEM_SPLIT_CONTINUES_ATTR]: item.attrs?.[LIST_ITEM_SPLIT_CONTINUES_ATTR] === true,
    },
    tailItemContent,
    item.marks,
  );
  const headItems: PmNode[] = [];
  for (let i = 0; i < itemIndex; i += 1) headItems.push(list.child(i));
  headItems.push(headItem);
  const tailItems: PmNode[] = [tailItem];
  for (let i = itemIndex + 1; i < list.childCount; i += 1) {
    tailItems.push(list.child(i));
  }
  return {
    head: list.type.create(
      containerHeadAttrs(list),
      Fragment.fromArray(headItems),
      list.marks,
    ),
    // The first tail item is the SAME logical ordinal, not the next one.
    tail: list.type.create(
      tailListAttrs(list, itemIndex),
      Fragment.fromArray(tailItems),
      list.marks,
    ),
  };
}

function splitFlowContainerNode(
  container: PmNode,
  plan: Extract<
    ContainerSplitPlan,
    { kind: `blockquote${string}` | `callout${string}` }
  >,
): SplitContainerPair | null {
  if (
    (container.type.name !== "blockquote" &&
      container.type.name !== "callout") ||
    container.childCount === 0
  ) {
    return null;
  }
  if (
    plan.kind === "blockquoteBlockBoundary" ||
    plan.kind === "calloutBlockBoundary"
  ) {
    const k = plan.headBlockCount;
    if (!Number.isInteger(k) || k <= 0 || k >= container.childCount)
      return null;
    return {
      head: container.type.create(
        containerHeadAttrs(container),
        fragmentFromChildren(container, 0, k),
        container.marks,
      ),
      tail: container.type.create(
        containerTailAttrs(container),
        fragmentFromChildren(container, k, container.childCount),
        container.marks,
      ),
    };
  }
  const childIndex = plan.childIndex;
  if (
    !Number.isInteger(childIndex) ||
    childIndex < 0 ||
    childIndex >= container.childCount
  ) {
    return null;
  }
  const child = container.child(childIndex);
  const pair =
    "plan" in plan
      ? isSplittableContainer(child)
        ? splitContainerNode(child, plan.plan)
        : null
      : textblockPair(child, plan.textOffset);
  if (!pair) return null;
  const headChildren: PmNode[] = [];
  for (let i = 0; i < childIndex; i += 1) headChildren.push(container.child(i));
  headChildren.push(pair.head);
  const tailChildren: PmNode[] = [pair.tail];
  for (let i = childIndex + 1; i < container.childCount; i += 1) {
    tailChildren.push(container.child(i));
  }
  return {
    head: container.type.create(
      containerHeadAttrs(container),
      Fragment.fromArray(headChildren),
      container.marks,
    ),
    tail: container.type.create(
      containerTailAttrs(container),
      Fragment.fromArray(tailChildren),
      container.marks,
    ),
  };
}

/**
 * Position-based key of a seam cut inside a nested list: the number of leaf
 * blocks (textblocks and other non-container blocks, a cut textblock counting
 * once, schema bridges not at all) that precede the tail, plus the content
 * already on the head side when the tail opens with the rest of a cut
 * textblock. The ledger compares a planned nested cut with an existing seam
 * by this key, so both must be derived from the fragments the same way.
 */
export function containerDeepCutKey(
  headParts: readonly PmNode[],
  tail: PmNode,
): string {
  let units = 0;
  let openSize = 0;
  const visit = (node: PmNode): void => {
    node.forEach((child) => {
      if (
        SPLITTABLE_CONTAINERS.has(child.type.name) ||
        LIST_ITEM_TYPES.has(child.type.name)
      ) {
        visit(child);
        return;
      }
      if (child.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true) return;
      if (
        child.isTextblock &&
        child.attrs?.[SPLIT_CONTINUATION_ATTR] === true &&
        units > 0
      ) {
        openSize += child.content.size;
        return;
      }
      units += 1;
      openSize = child.isTextblock ? child.content.size : 0;
    });
  };
  for (const part of headParts) visit(part);
  let first: PmNode | null = tail;
  while (first && !first.isTextblock && !first.isLeaf) {
    let next: PmNode | null = first.firstChild;
    if (next?.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true) {
      next = first.childCount > 1 ? first.child(1) : null;
    }
    if (
      next &&
      !SPLITTABLE_CONTAINERS.has(next.type.name) &&
      !LIST_ITEM_TYPES.has(next.type.name) &&
      !next.isTextblock
    ) {
      first = null;
      break;
    }
    first = next;
  }
  return first?.isTextblock && first.attrs?.[SPLIT_CONTINUATION_ATTR] === true
    ? `deep:${units}:text:${openSize}`
    : `deep:${units}`;
}

/** Pure semantic split. Returns null for an invalid/unsafe cut. */
export function splitContainerNode(
  node: PmNode,
  plan: ContainerSplitPlan,
): SplitContainerPair | null {
  if (!isSplittableContainer(node)) return null;
  const pair = isList(node)
    ? plan.kind.startsWith("list")
      ? splitListNode(
          node,
          plan as Extract<ContainerSplitPlan, { kind: `list${string}` }>,
        )
      : null
    : plan.kind.startsWith(node.type.name)
      ? splitFlowContainerNode(
          node,
          plan as Extract<
            ContainerSplitPlan,
            { kind: `blockquote${string}` | `callout${string}` }
          >,
        )
      : null;
  if (!pair) return null;

  // Schema bridges are projection scaffolding, not page progress (an empty
  // paragraph or list item is not: it is a line of the document).  A list tail that begins `[bridge, huge code/image/table]` used
  // to split again at the bridge, yielding a blank head and the unchanged
  // oversized tail forever. Every accepted cut must move real semantic
  // content to both physical pages.
  const hasSubstantiveContent = (candidate: PmNode): boolean => {
    if (candidate.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true) return false;
    // A whole list item is a numbered (or bulleted) paragraph even when it has
    // no text yet: Word paints its number on its own line, so it occupies the
    // page. Refusing it left the empty item a press of Enter makes at the foot
    // of a page painted over the footer until its first character arrived.
    if (
      LIST_ITEM_TYPES.has(candidate.type.name) &&
      candidate.attrs?.[LIST_ITEM_SPLIT_CONTINUATION_ATTR] !== true
    ) {
      return true;
    }
    // So is a whole paragraph of a quote or callout: the empty one Enter
    // makes at the foot of a page is a line of its own in Word. Only the tail
    // half of a cut paragraph (never empty) and a bridge are not whole.
    if (
      candidate.isTextblock &&
      candidate.attrs?.[SPLIT_CONTINUATION_ATTR] !== true
    ) {
      return true;
    }
    if (candidate.isText) return (candidate.text?.length ?? 0) > 0;
    if (candidate.isAtom || candidate.isLeaf) {
      return candidate.type.name !== "paragraph";
    }
    for (let index = 0; index < candidate.childCount; index += 1) {
      if (hasSubstantiveContent(candidate.child(index))) return true;
    }
    return false;
  };
  return hasSubstantiveContent(pair.head) && hasSubstantiveContent(pair.tail)
    ? pair
    : null;
}

/**
 * The structural cut right after the first page or column break inside
 * `container` that is not its very last block (one there ends the container,
 * and the page closes after it whole: trailingBreakOf). Word keeps such a
 * break as a paragraph of its own between list paragraphs (1. head / break /
 * 2. tail), so the cut lands between the item ending with the break and the
 * next one, or between the blocks around it. Pure; null when there is none.
 */
export function nestedBreakCutPlan(container: PmNode): ContainerSplitPlan | null {
  if (!isSplittableContainer(container)) return null;
  const isBreak = (node: PmNode) =>
    node.type.name === "pageBreak" || node.type.name === "columnBreak";
  if (isList(container)) {
    for (let itemIndex = 0; itemIndex < container.childCount; itemIndex += 1) {
      const item = container.child(itemIndex);
      if (!LIST_ITEM_TYPES.has(item.type.name)) return null;
      const lastItem = itemIndex === container.childCount - 1;
      for (let childIndex = 0; childIndex < item.childCount; childIndex += 1) {
        const child = item.child(childIndex);
        const inner = !isBreak(child) && isSplittableContainer(child) ? nestedBreakCutPlan(child) : null;
        if (inner && childIndex > 0) {
          return { kind: "listItemNested", itemIndex, childIndex, plan: inner };
        }
        if (!isBreak(child) && trailingBreakOf(child) === null) continue;
        if (childIndex < item.childCount - 1) {
          return { kind: "listItemBlockBoundary", itemIndex, headBlockCount: childIndex + 1 };
        }
        if (!lastItem) return { kind: "listItemBoundary", headItemCount: itemIndex + 1 };
        return null;
      }
    }
    return null;
  }
  const flow = container.type.name === "callout" ? "callout" : "blockquote";
  for (let childIndex = 0; childIndex < container.childCount; childIndex += 1) {
    const child = container.child(childIndex);
    const inner = !isBreak(child) && isSplittableContainer(child) ? nestedBreakCutPlan(child) : null;
    if (inner) return { kind: `${flow}Nested`, childIndex, plan: inner };
    if (!isBreak(child) && trailingBreakOf(child) === null) continue;
    return childIndex < container.childCount - 1
      ? { kind: `${flow}BlockBoundary`, headBlockCount: childIndex + 1 }
      : null;
  }
  return null;
}

/**
 * Cut, inside its own sheet, every container holding a page or column break
 * that is not its last block (nestedBreakCutPlan). The head then ends with
 * the break and is a block of its own to the page ledger, which closes the
 * page after it and moves the rest on. Returns whether `tr` changed.
 */
export function applyNestedBreakSplits(tr: Transaction): boolean {
  let changed = false;
  for (let guard = 0; guard < 64; guard += 1) {
    const pages = collectPages(tr.doc);
    if (!pages) return changed;
    let target: { sheet: number; child: number; plan: ContainerSplitPlan } | null = null;
    for (let sheet = 0; sheet < pages.length && !target; sheet += 1) {
      const page = pages[sheet].node;
      for (let child = 0; child < page.childCount; child += 1) {
        const node = page.child(child);
        if (!SPLITTABLE_CONTAINERS.has(node.type.name)) continue;
        const plan = nestedBreakCutPlan(node);
        if (plan && splitContainerNode(node, plan)) {
          target = { sheet, child, plan };
          break;
        }
      }
    }
    if (!target || !applyContainerColumnSplit(tr, target.sheet, target.child, target.plan)) return changed;
    changed = true;
  }
  return changed;
}

function textOffsetWithin(
  root: HTMLElement,
  target: Text,
  offset: number,
): number | null {
  const doc = root.ownerDocument;
  const filter = doc.defaultView?.NodeFilter;
  if (!filter) return null;
  const walker = doc.createTreeWalker(root, filter.SHOW_TEXT, {
    acceptNode: (node) =>
      insideInlineAtom(node, root)
        ? filter.FILTER_REJECT
        : filter.FILTER_ACCEPT,
  });
  let total = 0;
  let current = walker.nextNode() as Text | null;
  while (current) {
    if (current === target)
      return total + Math.max(0, Math.min(offset, current.length));
    total += current.length;
    current = walker.nextNode() as Text | null;
  }
  return null;
}

function directElementChildren(dom: HTMLElement): HTMLElement[] {
  return Array.from(dom.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}

/**
 * Tiptap renders a task item as `li > label + div(contentDOM)`, while an
 * ordinary list item renders its semantic blocks directly below `li`. Return
 * one DOM element per ProseMirror child for both shapes.
 */
function listItemBlockDoms(itemDom: HTMLElement, item: PmNode): HTMLElement[] {
  if (item.type.name !== "taskItem") return directElementChildren(itemDom);
  const contentHost = Array.from(itemDom.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.tagName === "DIV",
  );
  return contentHost ? directElementChildren(contentHost) : [];
}

export interface ContainerHeadPlanOptions {
  /** PM position immediately before the container node. */
  containerPos?: number;
  /** Usually `(node, offset) => view.posAtDOM(node, offset)`. */
  posAtDOM?: (node: Text, offset: number) => number | null;
  /** The head opens an empty page: a first block that cannot be cut and is
   * taller than the page stands on it alone, the blocks after it go on. */
  freshPage?: boolean;
  /** The top-level tables' row planner, for a table inside a list item: the
   * head and tail fragments of `table` cut to fit `availablePx` from its top,
   * or null where no legal cut fits. */
  splitTable?: (dom: HTMLElement, table: PmNode, availablePx: number) => { head: PmNode; tail: PmNode } | null;
}

/** The identity of a cut through a table, from the fragments it leaves: the
 * source row the tail opens with, and for a cut inside that row the size of
 * the head (two cuts in one row differ in what the head keeps). */
export function tableSeamSignature(head: PmNode, tail: PmNode): string {
  for (let index = 0; index < tail.childCount; index += 1) {
    const row = tail.child(index);
    if (row.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) continue;
    const source = row.attrs?.[TABLE_SOURCE_ROW_ATTR];
    const sourceRow = Number.isInteger(source) ? (source as number) : index;
    return row.attrs?.[TABLE_ROW_CONTINUATION_ATTR] === true ? `${sourceRow}w${head.content.size}` : `${sourceRow}`;
  }
  return "end";
}

/** Two fragments of one table cut inside a list item, joined again. */
function mergeTableFragments(head: PmNode, tail: PmNode): PmNode | null {
  if (head.type.name !== "table" || tail.type.name !== "table") return null;
  const id = head.attrs?.[TABLE_FRAGMENT_ID_ATTR];
  if (typeof id !== "string" || !id || tail.attrs?.[TABLE_FRAGMENT_ID_ATTR] !== id) return null;
  const merged = mergeAdjacentTableFragmentsJson(head.toJSON() as TableJsonNode, tail.toJSON() as TableJsonNode);
  if (!merged) return null;
  try {
    const node = head.type.schema.nodeFromJSON(merged);
    node.check();
    return node;
  } catch {
    return null;
  }
}

function directChildPos(
  parent: PmNode,
  parentPos: number,
  childIndex: number,
): number {
  let pos = parentPos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    pos += parent.child(index).nodeSize;
  }
  return pos;
}

function canUseTextOnlyOffset(node: PmNode): boolean {
  let safe = true;
  node.descendants((child) => {
    if (child.isInline && !child.isText) {
      safe = false;
      return false;
    }
    return safe;
  });
  return safe;
}

function textCutOffset(
  dom: HTMLElement,
  pageBottom: number,
  semanticNode: PmNode,
  semanticNodePos: number | null,
  options: ContainerHeadPlanOptions,
): number | null {
  // The caller supplies the physical content boundary after container chrome
  // and joining margins. Reserving another whole text line here double-counts
  // that space and can reject a legal widow-controlled list continuation.
  const available = pageBottom - paginationLayoutRect(dom).top;
  if (!(available > 0)) return null;
  const cut = planTextCutByChars(
    dom,
    available,
    minimumTextSplitLines(semanticNode.attrs.widowControl),
    true,
  );
  if (!cut) return null;
  if (semanticNodePos !== null && typeof options.posAtDOM === "function") {
    let absolute: number | null = null;
    try {
      absolute = options.posAtDOM(cut.node, cut.offset);
    } catch {
      return null;
    }
    if (absolute === null) return null;
    const relative = absolute - (semanticNodePos + 1);
    return relative > 0 && relative < semanticNode.content.size
      ? relative
      : null;
  }
  // A non-text inline atom consumes a ProseMirror content unit without a DOM
  // character. Refuse the text-only fallback instead of cutting beside it.
  if (!canUseTextOnlyOffset(semanticNode)) return null;
  return textOffsetWithin(dom, cut.node, cut.offset);
}

function planInsideListItem(
  itemDom: HTMLElement,
  item: PmNode,
  itemIndex: number,
  pageBottom: number,
  itemPos: number | null,
  options: ContainerHeadPlanOptions,
): ContainerSplitPlan | null {
  const blockDoms = listItemBlockDoms(itemDom, item);
  if (blockDoms.length !== item.childCount) return null;
  // A cut between the item's blocks needs a real block before it: a head of
  // only the continued item's schema bridge is no page progress, and planning
  // it made the ledger re-join and re-cut the same seam on every pass.
  let realBlockBefore = false;
  for (let childIndex = 0; childIndex < item.childCount; childIndex += 1) {
    const child = item.child(childIndex);
    const childDom = blockDoms[childIndex];
    // The schema bridge of a continued item paints no line (it has no height).
    if (child.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true) continue;
    const rect = paginationLayoutRect(childDom);
    // A block that paints no line (an empty paragraph the item opens with,
    // collapsed in the list) takes no room and offers no cut: the blocks
    // after it are planned as before. Giving up here left an item holding a
    // whole pasted document (380 blocks after an empty line) on ONE page,
    
    if (!(rect.height > 0)) continue;
    // Word keeps a block whose last text box fits while only its extra Auto
    // leading crosses the edge (pageEdgeLeading); a later block then never fits.
    if (rect.bottom - trailingAutoLeadingCreditPx(childDom) <= pageBottom) {
      realBlockBefore = true;
      continue;
    }
    if (
      TEXTBLOCK_TYPES.has(child.type.name) &&
      !paragraphKeepFlag(child, "keepLines")
    ) {
      const childPos =
        itemPos === null ? null : directChildPos(item, itemPos, childIndex);
      const offset = textCutOffset(
        childDom,
        pageBottom,
        child,
        childPos,
        options,
      );
      if (offset !== null && offset > 0 && offset < child.content.size) {
        return {
          kind: "listItemText",
          itemIndex,
          childIndex,
          textOffset: offset,
        };
      }
    }
    if (child.type.name === "table" && childIndex > 0 && options.splitTable) {
      const pair = options.splitTable(childDom, child, pageBottom - rect.top);
      if (pair) {
        return {
          kind: "listItemTable",
          itemIndex,
          childIndex,
          head: pair.head,
          tail: pair.tail,
          signature: tableSeamSignature(pair.head, pair.tail),
        };
      }
    }
    if (isSplittableContainer(child) && childIndex > 0) {
      const nested = planContainerHead(childDom, child, pageBottom - rect.top, {
        ...options,
        // A nested list starts below the item's earlier blocks, not at a page top.
        freshPage: false,
        containerPos:
          itemPos === null ? undefined : directChildPos(item, itemPos, childIndex),
      });
      if (nested) {
        return { kind: "listItemNested", itemIndex, childIndex, plan: nested };
      }
    }
    if (realBlockBefore) return { kind: "listItemBlockBoundary", itemIndex, headBlockCount: childIndex };
    // An empty page opened by a block that cannot be cut and is taller than
    // the page (a 1231 px table in the item of page 373b71a8): it stands
    // there alone, cut off by the paper, and the blocks after it go on to the
    // next page. Kept with it, they ran 757 px past the page's foot.
    if (options.freshPage && childIndex + 1 < item.childCount) {
      return { kind: "listItemBlockBoundary", itemIndex, headBlockCount: childIndex + 1 };
    }
    return null;
  }
  return null;
}

/**
 * Plan a legal Word-like cut from LIVE DOM geometry. `availablePx` is the
 * space available to the whole container from its border-box top.  The plan is
 * semantic (child indexes + UTF-16 content offset), so DOM pixels never enter
 * the transaction or stored document.
 */
export function planContainerHead(
  dom: HTMLElement,
  node: PmNode,
  availablePx: number,
  options: ContainerHeadPlanOptions = {},
): ContainerSplitPlan | null {
  if (!isSplittableContainer(node) || !(availablePx > 0)) return null;
  const scale = paginationLayoutScale(dom);
  const rootRect = paginationLayoutRect(dom, scale);
  if (!(rootRect.height > 0)) return null;
  const childDoms = directElementChildren(dom);
  if (childDoms.length !== node.childCount || childDoms.length === 0)
    return null;
  const lastRect = paginationLayoutRect(childDoms[childDoms.length - 1], scale);
  // A projected callout head opens its physical page seam: its bottom padding
  // and margin disappear in CSS. Do not reserve that padding while choosing
  // the cut, otherwise every page is needlessly under-filled by 16px and the
  // browser can produce an extra page compared with Word's one flowing cell.
  const bottomChrome =
    node.type.name === "callout"
      ? 0
      : Math.max(0, rootRect.bottom - lastRect.bottom);
  const pageBottom = rootRect.top + availablePx - bottomChrome;

  for (let index = 0; index < node.childCount; index += 1) {
    const childRect = paginationLayoutRect(childDoms[index], scale);
    if (!(childRect.height > 0)) return null;
    // Word keeps a child whose last text box fits while only its extra Auto
    // leading crosses the edge (pageEdgeLeading); the next child never fits.
    if (childRect.bottom - trailingAutoLeadingCreditPx(childDoms[index]) <= pageBottom) continue;
    if (isList(node)) {
      const item = node.child(index);
      const itemPos =
        typeof options.containerPos === "number"
          ? directChildPos(node, options.containerPos, index)
          : null;
      const inside = planInsideListItem(
        childDoms[index],
        item,
        index,
        pageBottom,
        itemPos,
        // Only the first item opens the page; a later one starts below others.
        index === 0 ? options : { ...options, freshPage: false },
      );
      if (inside) return inside;
      return index > 0
        ? { kind: "listItemBoundary", headItemCount: index }
        : null;
    }
    const child = node.child(index);
    if (isSplittableContainer(child)) {
      // A list (or quote) inside the quote/callout flows like the paragraphs
      // around it: cut between its own items rather than moving it whole.
      const nested = planContainerHead(
        childDoms[index],
        child,
        pageBottom - childRect.top,
        {
          ...options,
          freshPage: options.freshPage === true && index === 0,
          containerPos:
            typeof options.containerPos === "number"
              ? directChildPos(node, options.containerPos, index)
              : undefined,
        },
      );
      if (nested) {
        return {
          kind: node.type.name === "callout" ? "calloutNested" : "blockquoteNested",
          childIndex: index,
          plan: nested,
        };
      }
    }
    if (
      TEXTBLOCK_TYPES.has(child.type.name) &&
      !paragraphKeepFlag(child, "keepLines")
    ) {
      const childPos =
        typeof options.containerPos === "number"
          ? directChildPos(node, options.containerPos, index)
          : null;
      const offset = textCutOffset(
        childDoms[index],
        pageBottom,
        child,
        childPos,
        options,
      );
      if (offset !== null && offset > 0 && offset < child.content.size) {
        return {
          kind: node.type.name === "callout" ? "calloutText" : "blockquoteText",
          childIndex: index,
          textOffset: offset,
        };
      }
    }
    return index > 0
      ? {
          kind:
            node.type.name === "callout"
              ? "calloutBlockBoundary"
              : "blockquoteBlockBoundary",
          headBlockCount: index,
        }
      : null;
  }
  // Every child fits under the callout's open seam, but the box with its
  // bottom padding does not: the last line still goes to the next page.
  // Without a cut the ledger moved the whole callout and left the room of
  // the lines that fit empty (Enter at the foot of a page did exactly that).
  if (
    node.type.name === "callout" &&
    rootRect.bottom > rootRect.top + availablePx &&
    node.childCount > 0
  ) {
    const index = node.childCount - 1;
    const last = node.child(index);
    if (
      TEXTBLOCK_TYPES.has(last.type.name) &&
      !paragraphKeepFlag(last, "keepLines")
    ) {
      const lastRect = paginationLayoutRect(childDoms[index], scale);
      const offset = textCutOffset(
        childDoms[index],
        lastRect.bottom - 1,
        last,
        typeof options.containerPos === "number"
          ? directChildPos(node, options.containerPos, index)
          : null,
        options,
      );
      if (offset !== null && offset > 0 && offset < last.content.size) {
        return { kind: "calloutText", childIndex: index, textOffset: offset };
      }
    }
    if (index > 0) return { kind: "calloutBlockBoundary", headBlockCount: index };
  }
  return null;
}

interface PageInfo {
  pos: number;
  node: PmNode;
}

function collectPages(doc: PmNode): PageInfo[] | null {
  const pages: PageInfo[] = [];
  let pos = 0;
  doc.forEach((node) => {
    if (node.type.name === PAGE_BLOCK_NODE) pages.push({ pos, node });
    pos += node.nodeSize;
  });
  return pages.length > 0 ? pages : null;
}

/**
 * Undo history across a page boundary.
 *
 * The paginator's cuts and joins run in transactions that are not history
 * (addToHistory false), and prosemirror-history maps every undo item through
 * them. A container rewritten with replaceWith / delete + insert maps every
 * position inside it to "deleted", so the history drops each item there: after
 * Select All + Bullets (a list the pages then cut and re-join), Undo found
 * nothing to undo and the Undo button greyed out, and every later edit in a
 * list or quote that crosses a page lost its undo the next time the paginator
 * moved the boundary. Whole-block moves and text-block cuts were already made
 * of sheet splits and joins for this reason (applyBoundaryMoveBySheetCuts,
 * applyContinuationMerge); container cuts and joins are built the same way
 * here.
 *
 * `rewrite` is the plain replace-based edit and stays the reference: the
 * structural steps are kept only when they produce exactly its document, and
 * the rewrite is applied otherwise, so the page layout never depends on which
 * path ran.
 */
function applyMappable(
  tr: Transform,
  rewrite: (probe: Transform) => boolean,
  structural: (probe: Transform) => boolean,
): boolean {
  const expected = new Transform(tr.doc);
  if (!rewrite(expected)) return false;
  const probe = new Transform(tr.doc);
  let same = false;
  try {
    same = structural(probe) && probe.doc.eq(expected.doc);
  } catch {
    same = false;
  }
  for (const step of (same ? probe : expected).steps) tr.step(step);
  return true;
}

/** Deepest seam rebuilt with split/join steps: list > item > list > item >
 * text and one more level; a deeper one is rewritten as a replace. */
const MAX_IN_PLACE_CUT_DEPTH = 6;

/** The node chain from `node` down its first (or last) children, `depth` long. */
function edgePath(node: PmNode, depth: number, edge: "first" | "last"): PmNode[] {
  const path: PmNode[] = [];
  let current: PmNode | null = node;
  while (current && path.length < depth) {
    path.push(current);
    current = edge === "first" ? current.firstChild : current.lastChild;
  }
  return path;
}

/**
 * Split the container at `blockPos` into `pair` in place, with one split step
 * (every position inside stays mappable) plus the attrs of both halves. Tries
 * each cut depth (between items / inside an item / inside its text) and keeps
 * the one that reproduces the pair exactly.
 */
function splitContainerInPlace(
  tr: Transform,
  blockPos: number,
  pair: SplitContainerPair,
): boolean {
  const tailPos = blockPos + pair.head.nodeSize;
  // list > item > text is 3; a cut inside a nested list goes deeper.
  for (let depth = 1; depth <= MAX_IN_PLACE_CUT_DEPTH; depth += 1) {
    const cut = blockPos + pair.head.nodeSize - depth;
    const probe = new Transform(tr.doc);
    try {
      const $cut = probe.doc.resolve(cut);
      const top = $cut.depth - depth + 1;
      if (top < 1 || $cut.before(top) !== blockPos) continue;
      const tails = edgePath(pair.tail, depth, "first");
      const heads = edgePath(pair.head, depth, "last");
      if (tails.length !== depth || heads.length !== depth) continue;
      let before = Fragment.empty;
      let after = Fragment.empty;
      for (let level = $cut.depth; level >= top; level -= 1) {
        const tail = tails[level - top];
        before = Fragment.from($cut.node(level).copy(before));
        // A list item's tail that would open with a nested block starts
        // with the paginator's empty schema-bridge paragraph.
        const opensWith =
          level === $cut.depth ? $cut.nodeAfter : after.firstChild;
        const bridge =
          tail.firstChild?.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true &&
          opensWith?.type.name !== "paragraph"
            ? tail.firstChild
            : null;
        after = Fragment.from(
          tail.type.create(
            tail.attrs,
            bridge ? Fragment.from(bridge).append(after) : after,
            tail.marks,
          ),
        );
      }
      probe.step(
        new ReplaceStep(
          cut,
          cut,
          new Slice(before.append(after), depth, depth),
          true,
        ),
      );
      let headPos = blockPos;
      heads.forEach((head, index) => {
        probe.setNodeMarkup(headPos, undefined, head.attrs, head.marks);
        const next = heads[index + 1];
        if (next) headPos += head.nodeSize - 1 - next.nodeSize;
      });
      if (
        !probe.doc.nodeAt(blockPos)?.eq(pair.head) ||
        !probe.doc.nodeAt(tailPos)?.eq(pair.tail)
      ) {
        continue;
      }
    } catch {
      continue;
    }
    for (const step of probe.steps) tr.step(step);
    return true;
  }
  return false;
}

/**
 * Join the continuation tail that directly follows the container at
 * `headPos` into it, giving `merged`, with join steps: the containers, then
 * the split item, then its split text, dropping the schema bridge the cut
 * added.
 */
function joinContainerInPlace(
  tr: Transform,
  headPos: number,
  merged: PmNode,
): boolean {
  const head = tr.doc.nodeAt(headPos);
  if (!head) return false;
  const boundary = headPos + head.nodeSize;
  const headPath = edgePath(head, MAX_IN_PLACE_CUT_DEPTH, "last");
  for (let depth = headPath.length; depth >= 1; depth -= 1) {
    if (headPath.length < depth) continue;
    for (const dropBridge of [false, true]) {
      if (dropBridge && depth < 2) continue;
      const probe = new Transform(tr.doc);
      try {
        if (dropBridge) {
          const tailItem = probe.doc.nodeAt(boundary + 1);
          const bridge = tailItem?.firstChild;
          if (
            !tailItem ||
            !LIST_ITEM_TYPES.has(tailItem.type.name) ||
            !bridge ||
            bridge.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] !== true ||
            bridge.content.size !== 0
          ) {
            continue;
          }
          probe.delete(boundary + 2, boundary + 2 + bridge.nodeSize);
        }
        probe.join(boundary, depth);
        // Each joined level takes the merged node's attrs; the joined child
        // sits where the head's last child was.
        let pos = headPos;
        let expected = merged;
        for (let level = 0; level < depth; level += 1) {
          probe.setNodeMarkup(pos, undefined, expected.attrs, expected.marks);
          if (level + 1 === depth) break;
          const index = headPath[level].childCount - 1;
          const actual = probe.doc.nodeAt(pos);
          if (!actual || index < 0 || index >= expected.childCount) break;
          let childPos = pos + 1;
          for (let child = 0; child < index; child += 1) {
            childPos += actual.child(child).nodeSize;
          }
          pos = childPos;
          expected = expected.child(index);
        }
        if (!probe.doc.nodeAt(headPos)?.eq(merged)) continue;
      } catch {
        continue;
      }
      for (const step of probe.steps) tr.step(step);
      return true;
    }
  }
  return false;
}

/**
 * Move everything after the first `headSize` of sheet `sheetIndex` to the
 * front of the next sheet (or a new one) by cutting and joining sheets.
 */
function moveTailAfterHeadBySheetCuts(
  tr: Transform,
  sheetIndex: number,
  headSize: number,
): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet) return false;
  const cut = sheet.pos + 1 + headSize;
  if (sheet.pos + 1 + sheet.node.content.size <= cut) return true;
  const next = pages[sheetIndex + 1];
  if (next && next.pos !== sheet.pos + sheet.node.nodeSize) return false;
  tr.split(cut, 1);
  if (next) {
    const moved = tr.doc.nodeAt(cut + 1);
    if (!moved) return false;
    tr.join(cut + 1 + moved.nodeSize);
  }
  return true;
}

function moveTailAfterHead(
  tr: Transform,
  pageType: NodeType,
  sheetIndex: number,
  headSize: number,
): void {
  let pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet) return;
  const from = sheet.pos + 1 + headSize;
  const to = sheet.pos + 1 + sheet.node.content.size;
  if (to <= from) return;
  const moved = tr.doc.slice(from, to).content;
  tr.delete(from, to);
  pages = collectPages(tr.doc);
  const next = pages?.[sheetIndex + 1];
  if (next) {
    tr.insert(next.pos + 1, moved);
    return;
  }
  const source = pages?.[sheetIndex];
  if (!source) return;
  tr.insert(
    source.pos + source.node.nodeSize,
    pageType.create(null, Fragment.from(moved)),
  );
}

function textOffsetWithinContainer(
  node: PmNode,
  nodePos: number,
  selectionPos: number,
): number | null {
  if (selectionPos <= nodePos || selectionPos >= nodePos + node.nodeSize) {
    return null;
  }
  let offset = 0;
  let found: number | null = null;
  node.descendants((child, relativePos) => {
    if (found !== null) return false;
    if (!child.isText) return true;
    const start = nodePos + 1 + relativePos;
    const length = child.text?.length ?? 0;
    if (selectionPos <= start + length) {
      found = offset + Math.max(0, Math.min(length, selectionPos - start));
      return false;
    }
    offset += length;
    return false;
  });
  return found;
}

/** A caret as the paragraph it is in (the ordinal of that textblock in the
 * container's reading order, a cut textblock counting once) and its content
 * offset there. Unlike a plain-text offset it tells the end of one item from
 * the start of the next and finds an empty item, which a cut or join must
 * keep the caret in. */
interface LogicalCaret {
  block: number;
  offset: number;
}

interface ContainerTextSelection {
  anchorOffset: number;
  headOffset: number;
  anchorCaret?: LogicalCaret | null;
  headCaret?: LogicalCaret | null;
}

type ContainerFragment = { node: PmNode; pos: number };

/** Walk the textblocks of consecutive container fragments in reading order
 * with their logical ordinal and the content already seen of that ordinal
 * (the earlier parts of a textblock cut at a seam). Schema bridges are not
 * paragraphs. `visit` returns true to stop. */
function walkLogicalTextblocks(
  fragments: ReadonlyArray<ContainerFragment>,
  visit: (textblock: PmNode, contentStart: number, ordinal: number, base: number) => boolean,
): void {
  let ordinal = -1;
  let base = 0;
  let stopped = false;
  for (const fragment of fragments) {
    fragment.node.descendants((child, relativePos) => {
      if (stopped) return false;
      if (!child.isTextblock) return true;
      if (child.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true) return false;
      if (!(child.attrs?.[SPLIT_CONTINUATION_ATTR] === true && ordinal >= 0)) {
        ordinal += 1;
        base = 0;
      }
      stopped = visit(child, fragment.pos + 1 + relativePos + 1, ordinal, base);
      base += child.content.size;
      return false;
    });
    if (stopped) return;
  }
}

function logicalCaretAt(
  fragments: ReadonlyArray<ContainerFragment>,
  position: number,
): LogicalCaret | null {
  let caret: LogicalCaret | null = null;
  walkLogicalTextblocks(fragments, (textblock, start, ordinal, base) => {
    if (position < start || position > start + textblock.content.size) {
      return false;
    }
    caret = { block: ordinal, offset: base + position - start };
    return true;
  });
  return caret;
}

function positionOfLogicalCaret(
  fragments: ReadonlyArray<ContainerFragment>,
  caret: LogicalCaret,
): number | null {
  let target: number | null = null;
  let endOfBlock: number | null = null;
  walkLogicalTextblocks(fragments, (textblock, start, ordinal, base) => {
    if (ordinal > caret.block) return true;
    if (ordinal < caret.block) return false;
    const local = caret.offset - base;
    if (local <= textblock.content.size) {
      target = start + Math.max(0, local);
      return true;
    }
    endOfBlock = start + textblock.content.size;
    return false;
  });
  return target ?? endOfBlock;
}

function captureFragmentsTextSelection(
  tr: Transaction,
  fragments: ReadonlyArray<ContainerFragment>,
  textOffsets: ContainerTextSelection | null,
): ContainerTextSelection | null {
  if (!textOffsets) return null;
  return {
    ...textOffsets,
    anchorCaret: logicalCaretAt(fragments, tr.selection.anchor),
    headCaret: logicalCaretAt(fragments, tr.selection.head),
  };
}

function captureContainerTextSelection(
  tr: Transaction,
  node: PmNode,
  nodePos: number,
): ContainerTextSelection | null {
  if (!(tr.selection instanceof TextSelection)) return null;
  const anchorOffset = textOffsetWithinContainer(
    node,
    nodePos,
    tr.selection.anchor,
  );
  const headOffset = textOffsetWithinContainer(
    node,
    nodePos,
    tr.selection.head,
  );
  return captureFragmentsTextSelection(
    tr,
    [{ node, pos: nodePos }],
    anchorOffset === null || headOffset === null
      ? null
      : { anchorOffset, headOffset },
  );
}

function restoreContainerTextSelection(
  tr: Transaction,
  fragments: ReadonlyArray<{ node: PmNode; pos: number }>,
  selection: ContainerTextSelection | null,
): void {
  const current = tr.selection;
  if (!selection) {
    if (
      current instanceof TextSelection &&
      (!current.$anchor.parent.inlineContent ||
        !current.$head.parent.inlineContent)
    ) {
      tr.setSelection(
        selectionNearInlineContent(
          tr.doc,
          current.head,
          current.head >= current.anchor ? 1 : -1,
        ),
      );
    }
    return;
  }
  const anchorAt = selection.anchorCaret
    ? positionOfLogicalCaret(fragments, selection.anchorCaret)
    : null;
  const headAt = selection.headCaret
    ? positionOfLogicalCaret(fragments, selection.headCaret)
    : null;
  if (
    anchorAt !== null &&
    headAt !== null &&
    tr.doc.resolve(anchorAt).parent.inlineContent &&
    tr.doc.resolve(headAt).parent.inlineContent
  ) {
    tr.setSelection(TextSelection.create(tr.doc, anchorAt, headAt));
    return;
  }
  const resolveOffset = (textOffset: number): number | null => {
    let remaining = textOffset;
    let target: number | null = null;
    for (const fragment of fragments) {
      fragment.node.descendants((child, relativePos) => {
        if (target !== null) return false;
        if (!child.isText) return true;
        const length = child.text?.length ?? 0;
        if (remaining <= length) {
          target = fragment.pos + 1 + relativePos + remaining;
          return false;
        }
        remaining -= length;
        return false;
      });
      if (target !== null) break;
    }
    return target;
  };
  const requestedAnchor = resolveOffset(selection.anchorOffset);
  const requestedHead = resolveOffset(selection.headOffset);
  if (requestedAnchor === null || requestedHead === null) {
    tr.setSelection(
      selectionNearInlineContent(
        tr.doc,
        requestedHead ?? requestedAnchor ?? current.head,
        selection.headOffset >= selection.anchorOffset ? 1 : -1,
      ),
    );
    return;
  }
  const anchorInline = tr.doc.resolve(requestedAnchor).parent.inlineContent;
  const headInline = tr.doc.resolve(requestedHead).parent.inlineContent;
  if (anchorInline && headInline) {
    tr.setSelection(TextSelection.create(tr.doc, requestedAnchor, requestedHead));
    return;
  }
  const forward = requestedHead >= requestedAnchor;
  const safeAnchor = selectionNearInlineContent(
    tr.doc,
    requestedAnchor,
    forward ? 1 : -1,
  );
  const safeHead = selectionNearInlineContent(
    tr.doc,
    requestedHead,
    requestedAnchor === requestedHead ? 1 : forward ? -1 : 1,
  );
  if (
    safeAnchor instanceof TextSelection &&
    safeHead instanceof TextSelection
  ) {
    tr.setSelection(
      TextSelection.create(tr.doc, safeAnchor.head, safeHead.head),
    );
  } else {
    tr.setSelection(safeHead);
  }
}

function containerAtPageEdge(
  pages: PageInfo[] | null,
  pageIndex: number,
  edge: "first" | "last",
): { node: PmNode; pos: number } | null {
  const page = pages?.[pageIndex];
  if (!page || page.node.childCount === 0) return null;
  if (edge === "first") return { node: page.node.child(0), pos: page.pos + 1 };
  const node = page.node.child(page.node.childCount - 1);
  return {
    node,
    pos: page.pos + 1 + page.node.content.size - node.nodeSize,
  };
}

/** Split the next sheet's opener and pull its head into `boundary`. */
export function applyContainerBoundarySplit(
  tr: Transaction,
  boundary: number,
  plan: ContainerSplitPlan,
): boolean {
  const pages = collectPages(tr.doc);
  const target = pages?.[boundary];
  const source = pages?.[boundary + 1];
  if (!pages || !target || !source || source.node.childCount === 0)
    return false;
  const block = source.node.child(0);
  const pair = splitContainerNode(block, plan);
  if (!pair) return false;
  const blockPos = source.pos + 1;
  const selection = captureContainerTextSelection(tr, block, blockPos);
  applyMappable(
    tr,
    (probe) => {
      probe.replaceWith(blockPos, blockPos + block.nodeSize, pair.tail);
      // Target precedes source, so its original position/content size remain valid.
      probe.insert(target.pos + 1 + target.node.content.size, pair.head);
      return true;
    },
    (probe) => {
      if (source.pos !== target.pos + target.node.nodeSize) return false;
      if (!splitContainerInPlace(probe, blockPos, pair)) return false;
      // [head, tail, ...] -> [head][tail, ...]; the head's sheet joins the target.
      probe.split(blockPos + pair.head.nodeSize, 1);
      probe.join(source.pos);
      return true;
    },
  );
  const updatedPages = collectPages(tr.doc);
  const head = containerAtPageEdge(updatedPages, boundary, "last");
  const tail = containerAtPageEdge(updatedPages, boundary + 1, "first");
  if (head && tail) {
    restoreContainerTextSelection(tr, [head, tail], selection);
  }
  return tr.docChanged;
}

/** Materialize one container continuation between unequal tracks in one page. */
export function applyContainerColumnSplit(
  tr: Transaction,
  sheetIndex: number,
  childIndex: number,
  plan: ContainerSplitPlan,
): boolean {
  const sheet = collectPages(tr.doc)?.[sheetIndex];
  if (!sheet || childIndex < 0 || childIndex >= sheet.node.childCount) {
    return false;
  }
  let blockPos = sheet.pos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    blockPos += sheet.node.child(index).nodeSize;
  }
  const block = sheet.node.child(childIndex);
  const pair = splitContainerNode(block, plan);
  if (!pair) return false;
  const selection = captureContainerTextSelection(tr, block, blockPos);
  applyMappable(
    tr,
    (probe) => {
      probe.replaceWith(
        blockPos,
        blockPos + block.nodeSize,
        Fragment.fromArray([pair.head, pair.tail]),
      );
      return true;
    },
    (probe) => splitContainerInPlace(probe, blockPos, pair),
  );
  const head = tr.doc.nodeAt(blockPos);
  const tailPos = blockPos + pair.head.nodeSize;
  const tail = tr.doc.nodeAt(tailPos);
  if (head && tail) {
    restoreContainerTextSelection(
      tr,
      [
        { node: head, pos: blockPos },
        { node: tail, pos: tailPos },
      ],
      selection,
    );
  }
  return tr.docChanged;
}

/** Split an oversized sheet opener; tail + followers move to the next sheet. */
export function applyContainerOverflowSplit(
  tr: Transaction,
  sheetIndex: number,
  plan: ContainerSplitPlan,
): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet || sheet.node.childCount === 0) return false;
  const block = sheet.node.child(0);
  const pair = splitContainerNode(block, plan);
  if (!pair) return false;
  const blockPos = sheet.pos + 1;
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  if (!pageType) return false;
  const selection = captureContainerTextSelection(tr, block, blockPos);
  applyMappable(
    tr,
    (probe) => {
      probe.replaceWith(
        blockPos,
        blockPos + block.nodeSize,
        Fragment.fromArray([pair.head, pair.tail]),
      );
      moveTailAfterHead(probe, pageType, sheetIndex, pair.head.nodeSize);
      return true;
    },
    (probe) =>
      splitContainerInPlace(probe, blockPos, pair) &&
      moveTailAfterHeadBySheetCuts(probe, sheetIndex, pair.head.nodeSize),
  );
  const updatedPages = collectPages(tr.doc);
  const head = containerAtPageEdge(updatedPages, sheetIndex, "first");
  const tail = containerAtPageEdge(updatedPages, sheetIndex + 1, "first");
  if (head && tail) {
    restoreContainerTextSelection(tr, [head, tail], selection);
  }
  return tr.docChanged;
}

function stripRuntimePmAttrs(node: PmNode): Record<string, unknown> {
  const attrs = { ...node.attrs };
  delete attrs[SPLIT_CONTINUES_ATTR];
  delete attrs[SPLIT_CONTINUATION_ATTR];
  delete attrs[LIST_ITEM_SPLIT_CONTINUES_ATTR];
  delete attrs[LIST_ITEM_SPLIT_CONTINUATION_ATTR];
  delete attrs[LIST_ITEM_SPLIT_BRIDGE_ATTR];
  delete attrs[CONTAINER_UNBREAKABLE_FALLBACK_ATTR];
  return attrs;
}

function mergeTextblocks(head: PmNode, tail: PmNode): PmNode | null {
  if (
    head.type !== tail.type ||
    tail.attrs?.[SPLIT_CONTINUATION_ATTR] !== true
  ) {
    return null;
  }
  return head.type.create(
    {
      ...stripRuntimePmAttrs(head),
      [SPLIT_CONTINUES_ATTR]: tail.attrs?.[SPLIT_CONTINUES_ATTR] === true,
    },
    head.content.append(tail.content),
    head.marks,
  );
}

/** The two halves a cut left at a seam inside a container: a split textblock
 * or, for a cut inside a nested list (or quote), that nested container. */
function mergeSeamChildren(head: PmNode, tail: PmNode): PmNode | null {
  // A table cut inside the item (listItemTable) left its two fragments here.
  if (tail.type.name === "table") return mergeTableFragments(head, tail);
  return SPLITTABLE_CONTAINERS.has(tail.type.name)
    ? mergeContainerNodes(head, tail)
    : mergeTextblocks(head, tail);
}

function mergeListItems(head: PmNode, tail: PmNode): PmNode | null {
  if (
    head.type !== tail.type ||
    !LIST_ITEM_TYPES.has(head.type.name) ||
    tail.attrs?.[LIST_ITEM_SPLIT_CONTINUATION_ATTR] !== true
  ) {
    return null;
  }
  const headChildren: PmNode[] = [];
  for (let i = 0; i < head.childCount; i += 1) headChildren.push(head.child(i));
  const tailChildren: PmNode[] = [];
  for (let i = 0; i < tail.childCount; i += 1) tailChildren.push(tail.child(i));
  // Only an empty bridge is scaffolding; text typed into one is a paragraph.
  if (
    tailChildren[0]?.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true &&
    tailChildren[0].content.size === 0
  ) {
    tailChildren.shift();
  }
  const last = headChildren[headChildren.length - 1];
  const first = tailChildren[0];
  // A cut inside a nested list left its two halves at this seam.
  const joined =
    last && first
      ? mergeSeamChildren(last, first)
      : null;
  if (joined) {
    headChildren[headChildren.length - 1] = joined;
    tailChildren.shift();
  }
  return head.type.create(
    {
      ...stripRuntimePmAttrs(head),
      [LIST_ITEM_SPLIT_CONTINUES_ATTR]:
        tail.attrs?.[LIST_ITEM_SPLIT_CONTINUES_ATTR] === true,
    },
    Fragment.fromArray([...headChildren, ...tailChildren]),
    head.marks,
  );
}

/** Merge two adjacent runtime container projections into one semantic node. */
export function mergeContainerNodes(head: PmNode, tail: PmNode): PmNode | null {
  if (head.type !== tail.type || !isContainerContinuationTail(tail)) {
    return null;
  }
  const headChildren: PmNode[] = [];
  for (let i = 0; i < head.childCount; i += 1) headChildren.push(head.child(i));
  const tailChildren: PmNode[] = [];
  for (let i = 0; i < tail.childCount; i += 1) tailChildren.push(tail.child(i));

  if (
    isList(head) &&
    tailChildren[0]?.attrs?.[LIST_ITEM_SPLIT_CONTINUATION_ATTR] === true
  ) {
    const last = headChildren[headChildren.length - 1];
    const mergedItem = last ? mergeListItems(last, tailChildren[0]) : null;
    if (!mergedItem) return null;
    headChildren[headChildren.length - 1] = mergedItem;
    tailChildren.shift();
  } else if (!isList(head)) {
    const last = headChildren[headChildren.length - 1];
    const first = tailChildren[0];
    const joined =
      last && first
        ? mergeSeamChildren(last, first)
        : null;
    if (joined) {
      headChildren[headChildren.length - 1] = joined;
      tailChildren.shift();
    }
  }
  return head.type.create(
    {
      ...stripRuntimePmAttrs(head),
      [SPLIT_CONTINUATION_ATTR]: head.attrs?.[SPLIT_CONTINUATION_ATTR] === true,
      [SPLIT_CONTINUES_ATTR]: tail.attrs?.[SPLIT_CONTINUES_ATTR] === true,
    },
    Fragment.fromArray([...headChildren, ...tailChildren]),
    head.marks,
  );
}

function captureContainerPairTextSelection(
  tr: Transaction,
  head: PmNode,
  headPos: number,
  tail: PmNode,
  tailPos: number,
): ContainerTextSelection | null {
  if (!(tr.selection instanceof TextSelection)) return null;
  const offsetForPosition = (position: number): number | null => {
    const headOffset = textOffsetWithinContainer(head, headPos, position);
    if (headOffset !== null) return headOffset;
    const tailOffset = textOffsetWithinContainer(tail, tailPos, position);
    return tailOffset === null ? null : head.textContent.length + tailOffset;
  };
  const anchorOffset = offsetForPosition(tr.selection.anchor);
  const headOffset = offsetForPosition(tr.selection.head);
  return captureFragmentsTextSelection(
    tr,
    [
      { node: head, pos: headPos },
      { node: tail, pos: tailPos },
    ],
    anchorOffset === null || headOffset === null
      ? null
      : { anchorOffset, headOffset },
  );
}

/** Margin which becomes internal when two continuation fragments join. */
export function containerContinuationJoinMargin(
  headDom: HTMLElement,
  head: PmNode,
  tailDom: HTMLElement,
  tail: PmNode,
  authored?: AuthoredMarginPx,
): number {
  let leftNode: PmNode | null = null;
  let rightNode: PmNode | null = null;
  let leftDom: Element | null = null;
  let rightDom: Element | null = null;
  let headContainer = head;
  let tailContainer = tail;
  let headContainerDom: HTMLElement = headDom;
  let tailContainerDom: HTMLElement = tailDom;
  // A cut inside a nested list (or quote) leaves that container's head last
  // in the head fragment and its tail first in the tail fragment: the gap the
  // join paints is the one between the blocks either side of the deepest cut.
  // Read at the nested containers themselves (both continuation halves of one
  // list), it was taken for a cut paragraph's own seam and charged nothing,
  // so the plan pulled a whole item up into room short of its spacing, the
  // next plan measured the head taller and gave it back, and the two
  // alternated for good (corpus R280-D14: 1.2.7 between pages 3 and 4, its
  // 16 px after 1.2.6; pages 5 and 7 left 1.4k and 2.5k px over their foot).
  for (let depth = 0; depth < 32; depth += 1) {
    leftNode = headContainer.lastChild;
    rightNode = tailContainer.firstChild;
    leftDom = headContainerDom.lastElementChild;
    rightDom = tailContainerDom.firstElementChild;
    if (
      isList(headContainer) &&
      rightNode?.attrs[LIST_ITEM_SPLIT_CONTINUATION_ATTR] === true
    ) {
      if (
        !leftNode ||
        !rightNode ||
        !(leftDom instanceof HTMLElement) ||
        !(rightDom instanceof HTMLElement)
      )
        return Infinity;
      const leftBlocks = listItemBlockDoms(leftDom, leftNode);
      const rightBlocks = listItemBlockDoms(rightDom, rightNode);
      const firstIndex =
        rightNode.firstChild?.attrs[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true ? 1 : 0;
      leftNode = leftNode.lastChild;
      rightNode =
        firstIndex < rightNode.childCount ? rightNode.child(firstIndex) : null;
      leftDom = leftBlocks.at(-1) ?? null;
      rightDom = rightBlocks[firstIndex] ?? null;
    }
    if (
      !leftNode ||
      !rightNode ||
      !(leftDom instanceof HTMLElement) ||
      !(rightDom instanceof HTMLElement)
    )
      return Infinity;
    if (
      leftNode.type !== rightNode.type ||
      rightNode.attrs[SPLIT_CONTINUATION_ATTR] !== true
    )
      break;
    // Two halves of one cut paragraph rejoin with no gap between them.
    if (!SPLITTABLE_CONTAINERS.has(leftNode.type.name)) return 0;
    // Two halves of one nested container: the gap is inside them.
    headContainer = leftNode;
    tailContainer = rightNode;
    headContainerDom = leftDom;
    tailContainerDom = rightDom;
  }
  if (!leftNode || !rightNode || !(leftDom instanceof HTMLElement) || !(rightDom instanceof HTMLElement))
    return Infinity;
  // Two paragraphs of one style the seam parts are next to each other in
  // the text, and Word's "Don't add space between paragraphs of the same
  // style" holds across it: the page edge draws neither of their margins,
  // the join draws none either (contextualParagraphSpacingExtension marks
  // the pair suppressed once they share a page). Charged the 8 px of the
  // pair's 6 pt before and after, the head of a List Paragraph list could
  // never take back the next item, 2 px short where Word keeps it, its glyphs
  // 0.1 pt above the foot (corpus R491-D05 page 11, "Questionnaires/surveys").
  // (A cut between two whole items stops at the items: their paragraphs
  // are the item's last and the next item's first.)
  const leftText = contextualJoinOff() ? null : edgeTextblock(leftNode, "last");
  const rightText = leftText ? edgeTextblock(rightNode, "first") : null;
  const identity = leftText ? contextualParagraphStyleIdentity(leftText) : null;
  const sameStyle = identity !== null && rightText !== null && contextualParagraphStyleIdentity(rightText) === identity;
  const leftAfter = sameStyle && leftText!.attrs.contextualSpacing === true ? 0 : collapsedEdgeMarginPx(leftDom, "bottom", authored);
  const rightBefore = sameStyle && rightText!.attrs.contextualSpacing === true ? 0 : collapsedEdgeMarginPx(rightDom, "top", authored);
  // The gap the join paints is the collapsed margin between the two blocks,
  // including what their descendants push through: a Word list item keeps
  // its spacing on its own paragraph (the wrapper item has none), and that
  // paragraph's after-spacing collapses through the item into the gap.
  return Math.max(0, collapseMargins(leftAfter, rightBefore));
}

/** The paragraph a block ends (or opens) with, read through list items and
 * lists; null for anything else (a table, a picture). */
export function edgeTextblock(node: PmNode, edge: "first" | "last"): PmNode | null {
  let current: PmNode | null = node;
  for (let depth = 0; current && depth < 32; depth += 1) {
    if (current.isTextblock) return current;
    if (!SPLITTABLE_CONTAINERS.has(current.type.name) && current.type.name !== "listItem" && current.type.name !== "taskItem") return null;
    current = edge === "last" ? current.lastChild : current.firstChild;
  }
  return null;
}

/** `window.__docsContainerJoinContextualOff = true` (A/B): a container seam
 * between two same-style contextual paragraphs is charged their margins, the
 * older reading. */
function contextualJoinOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsContainerJoinContextualOff?: boolean }).__docsContainerJoinContextualOff === true;
}

/** Transfer only a measured tail prefix, without painting the whole merged list. */
export function applyContainerContinuationPull(
  tr: Transaction,
  boundary: number,
  plan: ContainerSplitPlan,
): boolean {
  const pages = collectPages(tr.doc);
  const head = containerAtPageEdge(pages, boundary, "last");
  const tail = containerAtPageEdge(pages, boundary + 1, "first");
  if (!head || !tail || head.node.attrs[SPLIT_CONTINUES_ATTR] !== true || !isContainerContinuationTail(tail.node)) return false;
  const split = splitContainerNode(tail.node, plan);
  if (!split || !mergeContainerNodes(head.node, split.head)) return false;
  const selection = captureContainerPairTextSelection(
    tr,
    head.node,
    head.pos,
    tail.node,
    tail.pos,
  );
  if (!applyContainerBoundarySplit(tr, boundary, plan)) return false;
  const moved = containerAtPageEdge(collectPages(tr.doc), boundary, "last");
  if (!moved || !applyContainerContinuationMerge(tr, head.pos, moved.pos))
    return false;
  const updated = collectPages(tr.doc);
  const newHead = containerAtPageEdge(updated, boundary, "last");
  const newTail = containerAtPageEdge(updated, boundary + 1, "first");
  if (newHead && newTail)
    restoreContainerTextSelection(tr, [newHead, newTail], selection);
  return tr.docChanged;
}

/** Rejoin one live continuation pair. Empty tail pages are removed. */
export function applyContainerContinuationMerge(
  tr: Transaction,
  headPos: number,
  tailPos: number,
): boolean {
  const head = tr.doc.nodeAt(headPos);
  const tail = tr.doc.nodeAt(tailPos);
  if (!head || !tail || tailPos <= headPos) return false;
  const merged = mergeContainerNodes(head, tail);
  if (!merged) return false;
  const selection = captureContainerPairTextSelection(
    tr,
    head,
    headPos,
    tail,
    tailPos,
  );
  applyMappable(
    tr,
    (probe) => {
      const $tail = probe.doc.resolve(tailPos);
      if (
        $tail.parent.type.name === PAGE_BLOCK_NODE &&
        $tail.parent.childCount === 1
      ) {
        const pagePos = $tail.before($tail.depth);
        probe.delete(pagePos, pagePos + $tail.parent.nodeSize);
      } else {
        probe.delete(tailPos, tailPos + tail.nodeSize);
      }
      probe.replaceWith(headPos, headPos + head.nodeSize, merged);
      return true;
    },
    (probe) => {
      const $head = probe.doc.resolve(headPos);
      const $tail = probe.doc.resolve(tailPos);
      if ($head.parent !== $tail.parent || headPos + head.nodeSize !== tailPos) {
        // Head last on its sheet, tail first on the next: bring the tail
        // over by joining the sheets (cutting its sheet after it first).
        const acrossSheets =
          $head.depth === 1 &&
          $tail.depth === 1 &&
          $head.parent.type.name === PAGE_BLOCK_NODE &&
          $tail.parent.type.name === PAGE_BLOCK_NODE &&
          $head.index(0) + 1 === $tail.index(0) &&
          $head.index(1) === $head.parent.childCount - 1 &&
          $tail.index(1) === 0;
        if (!acrossSheets) return false;
        if ($tail.parent.childCount > 1) probe.split(tailPos + tail.nodeSize, 1);
        probe.join(tailPos - 1);
      }
      return joinContainerInPlace(probe, headPos, merged);
    },
  );
  const mergedNode = tr.doc.nodeAt(headPos);
  if (mergedNode) {
    restoreContainerTextSelection(
      tr,
      [{ node: mergedNode, pos: headPos }],
      selection,
    );
  }
  return tr.docChanged;
}

export interface ContainerContinuationPair {
  headPos: number;
  tailPos: number;
  headSheet: number;
  straddlesBoundary: boolean;
}

export interface ContainerContinuationScan {
  pairs: ContainerContinuationPair[];
  orphanHeadPositions: number[];
  orphanTailPositions: number[];
}

/** Find clean live pairs plus orphan tails that need their runtime attr cleared. */
const HOLDS_CONTAINER_SEAM = new SheetFact((node) =>
  isContainerContinuationTail(node) || (isSplittableContainer(node) && node.attrs?.[SPLIT_CONTINUES_ATTR] === true),
);

export function findContainerContinuationPairs(
  doc: PmNode,
): ContainerContinuationScan {
  // No container on any sheet carries a seam: nothing to pair, nothing orphaned.
  if (!HOLDS_CONTAINER_SEAM.inDoc(doc)) {
    return { pairs: [], orphanHeadPositions: [], orphanTailPositions: [] };
  }
  const pages = collectPages(doc);
  if (!pages) {
    return { pairs: [], orphanHeadPositions: [], orphanTailPositions: [] };
  }
  const walk: Array<{
    pos: number;
    node: PmNode;
    sheet: number;
    first: boolean;
    last: boolean;
  }> = [];
  pages.forEach((page, sheet) => {
    let pos = page.pos + 1;
    page.node.forEach((node, _offset, index) => {
      walk.push({
        pos,
        node,
        sheet,
        first: index === 0,
        last: index === page.node.childCount - 1,
      });
      pos += node.nodeSize;
    });
  });
  const pairs: ContainerContinuationPair[] = [];
  const pairedHead = new Set<number>();
  const pairedTail = new Set<number>();
  for (let index = 1; index < walk.length; index += 1) {
    const head = walk[index - 1];
    const tail = walk[index];
    if (
      !isContainerContinuationTail(tail.node) ||
      head.node.type !== tail.node.type ||
      head.node.attrs?.[SPLIT_CONTINUES_ATTR] !== true
    ) {
      continue;
    }
    pairedHead.add(head.pos);
    pairedTail.add(tail.pos);
    pairs.push({
      headPos: head.pos,
      tailPos: tail.pos,
      headSheet: head.sheet,
      straddlesBoundary:
        head.last && tail.first && tail.sheet === head.sheet + 1,
    });
  }
  return {
    pairs,
    orphanHeadPositions: walk
      .filter(
        (entry) =>
          isSplittableContainer(entry.node) &&
          entry.node.attrs?.[SPLIT_CONTINUES_ATTR] === true &&
          !pairedHead.has(entry.pos),
      )
      .map((entry) => entry.pos),
    orphanTailPositions: walk
      .filter(
        (entry) =>
          isContainerContinuationTail(entry.node) && !pairedTail.has(entry.pos),
      )
      .map((entry) => entry.pos),
  };
}

type JsonNode = Record<string, unknown> & {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
};

function jsonHasContainerRuntimeAttrs(node: JsonNode): boolean {
  const attrs = node.attrs ?? {};
  const type = String(node.type ?? "");
  const has = (key: string) => Object.prototype.hasOwnProperty.call(attrs, key);
  if (
    (SPLITTABLE_CONTAINERS.has(type) &&
      (has(SPLIT_CONTINUES_ATTR) ||
        has(SPLIT_CONTINUATION_ATTR) ||
        has(CONTAINER_UNBREAKABLE_FALLBACK_ATTR))) ||
    has(LIST_ITEM_SPLIT_CONTINUES_ATTR) ||
    has(LIST_ITEM_SPLIT_CONTINUATION_ATTR) ||
    has(LIST_ITEM_SPLIT_BRIDGE_ATTR) ||
    has(CONTAINER_UNBREAKABLE_FALLBACK_ATTR)
  ) {
    return true;
  }
  return (
    Array.isArray(node.content) &&
    node.content.some(jsonHasContainerRuntimeAttrs)
  );
}

const CONTAINER_RUNTIME_ATTRS = [
  LIST_ITEM_SPLIT_CONTINUES_ATTR,
  LIST_ITEM_SPLIT_CONTINUATION_ATTR,
  LIST_ITEM_SPLIT_BRIDGE_ATTR,
  CONTAINER_UNBREAKABLE_FALLBACK_ATTR,
];
const CONTAINER_RUNTIME_ATTRS_WITH_PAIR = [
  SPLIT_CONTINUES_ATTR,
  SPLIT_CONTINUATION_ATTR,
  SPLIT_PIECE_OF_ATTR,
  ...CONTAINER_RUNTIME_ATTRS,
];

/** A node with nothing to strip anywhere in it is handed back as it is (the
 * same object, the same JSON): copying every node of an inked page on every
 * save made each block a new object, so nothing downstream (the save's
 * comparisons, its stored copy) could tell an untouched block by identity. */
function stripJsonRuntimeAttrs(
  node: JsonNode,
  stripContainerSplitPairAttrs = true,
): JsonNode {
  const keys = stripContainerSplitPairAttrs ? CONTAINER_RUNTIME_ATTRS_WITH_PAIR : CONTAINER_RUNTIME_ATTRS;
  const own = node.attrs;
  const stripsHere = Boolean(own) && keys.some((key) => Object.prototype.hasOwnProperty.call(own, key));
  let children: JsonNode[] | null = null;
  if (Array.isArray(node.content)) {
    const stripped = node.content.map((child) => stripJsonRuntimeAttrs(child, stripContainerSplitPairAttrs));
    if (stripped.some((child, index) => child !== node.content![index])) children = stripped;
  }
  if (!stripsHere && children === null) return node;
  const attrs = node.attrs ? { ...node.attrs } : undefined;
  if (attrs) {
    for (const key of keys) delete attrs[key];
    noteStrippedAttrs(attrs, node.attrs, keys);
  }
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(Array.isArray(node.content)
      ? { content: children ?? [...node.content] }
      : {}),
  };
}

function mergeJsonTextblocks(head: JsonNode, tail: JsonNode): JsonNode | null {
  if (
    head.type !== tail.type ||
    tail.attrs?.[SPLIT_CONTINUATION_ATTR] !== true
  ) {
    return null;
  }
  return {
    ...head,
    attrs: {
      ...(head.attrs ?? {}),
      [SPLIT_CONTINUES_ATTR]: tail.attrs?.[SPLIT_CONTINUES_ATTR] === true,
    },
    content: joinInlineFragments(head.content ?? [], tail.content ?? []),
  };
}

/** The two halves a cut left at a seam inside a container: a split textblock
 * or, for a cut inside a nested list (or quote), that nested container. */
function mergeJsonChildren(head: JsonNode, tail: JsonNode): JsonNode | null {
  if (head.type === "table" && tail.type === "table") {
    return mergeAdjacentTableFragmentsJson(head as unknown as TableJsonNode, tail as unknown as TableJsonNode) as unknown as JsonNode | null;
  }
  if (SPLITTABLE_CONTAINERS.has(String(tail.type))) {
    return mergeJsonContainers(head, tail);
  }
  return mergeJsonTextblocks(head, tail);
}

function mergeJsonListItems(head: JsonNode, tail: JsonNode): JsonNode | null {
  if (
    head.type !== tail.type ||
    !LIST_ITEM_TYPES.has(String(head.type)) ||
    tail.attrs?.[LIST_ITEM_SPLIT_CONTINUATION_ATTR] !== true
  ) {
    return null;
  }
  const headChildren = [...(head.content ?? [])];
  const tailChildren = [...(tail.content ?? [])];
  if (
    tailChildren[0]?.attrs?.[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true &&
    !(tailChildren[0].content?.length)
  ) {
    tailChildren.shift();
  }
  const last = headChildren[headChildren.length - 1];
  const first = tailChildren[0];
  const joined = last && first ? mergeJsonChildren(last, first) : null;
  if (joined) {
    headChildren[headChildren.length - 1] = joined;
    tailChildren.shift();
  }
  return {
    ...head,
    attrs: {
      ...(head.attrs ?? {}),
      [LIST_ITEM_SPLIT_CONTINUES_ATTR]:
        tail.attrs?.[LIST_ITEM_SPLIT_CONTINUES_ATTR] === true,
    },
    content: [...headChildren, ...tailChildren],
  };
}

function mergeJsonContainers(head: JsonNode, tail: JsonNode): JsonNode | null {
  if (
    head.type !== tail.type ||
    !SPLITTABLE_CONTAINERS.has(String(head.type)) ||
    tail.attrs?.[SPLIT_CONTINUATION_ATTR] !== true
  ) {
    return null;
  }
  const headChildren = [...(head.content ?? [])];
  const tailChildren = [...(tail.content ?? [])];
  if (
    LIST_CONTAINER_TYPES.has(String(head.type)) &&
    tailChildren[0]?.attrs?.[LIST_ITEM_SPLIT_CONTINUATION_ATTR] === true
  ) {
    const last = headChildren[headChildren.length - 1];
    const mergedItem = last ? mergeJsonListItems(last, tailChildren[0]) : null;
    if (!mergedItem) return null;
    headChildren[headChildren.length - 1] = mergedItem;
    tailChildren.shift();
  } else if (!LIST_CONTAINER_TYPES.has(String(head.type))) {
    const last = headChildren[headChildren.length - 1];
    const first = tailChildren[0];
    const joined = last && first ? mergeJsonChildren(last, first) : null;
    if (joined) {
      headChildren[headChildren.length - 1] = joined;
      tailChildren.shift();
    }
  }
  return {
    ...head,
    attrs: {
      ...(head.attrs ?? {}),
      [SPLIT_CONTINUATION_ATTR]: head.attrs?.[SPLIT_CONTINUATION_ATTR] === true,
      [SPLIT_CONTINUES_ATTR]: tail.attrs?.[SPLIT_CONTINUES_ATTR] === true,
    },
    content: [...headChildren, ...tailChildren],
  };
}

/**
 * Serialization boundary: collapse cross-page container projections to one
 * native list/blockquote/callout and strip every runtime attr recursively. Returns
 * the original object by identity when no container split exists.
 */
export function mergeContainerContinuationsJson<T>(doc: T): T {
  const root = doc as JsonNode | null;
  if (!root || !Array.isArray(root.content)) return doc;
  if (!root.content.some(jsonHasContainerRuntimeAttrs)) return doc;

  const isSheeted = root.content.some((node) => node.type === PAGE_BLOCK_NODE);
  const pages = new Map<number, JsonNode>();
  const walk: Array<{ page: number; node: JsonNode }> = [];
  if (isSheeted) {
    root.content.forEach((page, pageIndex) => {
      pages.set(pageIndex, page);
      if (page.type === PAGE_BLOCK_NODE && Array.isArray(page.content)) {
        for (const node of page.content) walk.push({ page: pageIndex, node });
      } else {
        walk.push({ page: pageIndex, node: page });
      }
    });
  } else {
    for (const node of root.content) walk.push({ page: 0, node });
  }

  const merged: Array<{ page: number; node: JsonNode }> = [];
  for (const entry of walk) {
    const previous = merged[merged.length - 1];
    const joined =
      previous && entry.node.attrs?.[SPLIT_CONTINUATION_ATTR] === true
        ? mergeJsonContainers(previous.node, entry.node)
        : null;
    if (joined) {
      previous.node = joined;
    } else {
      merged.push(entry);
    }
  }
  const clean = merged.map((entry) => ({
    ...entry,
    // Ordinary top-level paragraph/code splits belong to blockSplitting and
    // must retain their stamps until that serializer merges them.  Only a
    // container projection owns (and recursively cleans) these attrs here.
    node: stripJsonRuntimeAttrs(
      entry.node,
      SPLITTABLE_CONTAINERS.has(String(entry.node.type)),
    ),
  }));
  if (!isSheeted)
    return { ...root, content: clean.map((entry) => entry.node) } as T;

  const rebuilt: JsonNode[] = [];
  const byPage = new Map<number, JsonNode>();
  for (const entry of clean) {
    let page = byPage.get(entry.page);
    if (!page) {
      const source = pages.get(entry.page);
      page = {
        ...(source ?? { type: PAGE_BLOCK_NODE }),
        type: PAGE_BLOCK_NODE,
        content: [],
      };
      byPage.set(entry.page, page);
      rebuilt.push(page);
    }
    (page.content as JsonNode[]).push(entry.node);
  }
  return { ...root, content: rebuilt } as T;
}
