"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's list paragraph spacing: "Don't add space between paragraphs of the
 * same style" (`w:contextualSpacing`, ECMA-376 Part 1 §17.3.1.9).
 *
 * Word applies the List Paragraph style when Bullets or Numbering is used, and
 * that style (like List Bullet / List Number) turns contextual spacing on, so
 * the items of one list sit tight while the list keeps its space before and
 * after. An omitted element inherits the style hierarchy; `w:val="0"` on the
 * paragraph turns an inherited "on" off.
 *
 * The editor stores the paragraph's own value like keepNext: null inherits,
 * true and false are explicit. An inheriting paragraph is on when it is an
 * authored list paragraph with no paragraph style of its own (the DOCX export
 * gives it List Bullet, List Number or List Paragraph, which all turn it on)
 * and off anywhere else (Normal and the heading styles leave it off).
 */

import { toggleListInSelectedCells } from "./cellSelectionLists";
import { InputRule, type CommandProps } from "@tiptap/core";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration } from "@tiptap/pm/view";
import {
  CONTEXTUAL_SPACING_AFTER_ATTR,
  CONTEXTUAL_SPACING_BEFORE_ATTR,
  contextualParagraphStyleIdentity,
} from "./contextualParagraphSpacingExtension";
import { LIST_ITEM_SPLIT_BRIDGE_ATTR } from "./paged/containerSplitting";

/** The nodes whose paragraphs are Word list paragraphs. */
export const LIST_PARAGRAPH_ITEM_TYPES: ReadonlySet<string> = new Set([
  "listItem",
  "taskItem",
]);
const LIST_TYPES: ReadonlySet<string> = new Set([
  "bulletList",
  "orderedList",
  "taskList",
]);
/** An authored list whose paragraphs, not its HTML wrappers, own the gaps. */
export const LIST_PARAGRAPH_SPACING_CLASS = "docs-list-paragraph-spacing";

type SpacingNode = {
  type: string | { name: string };
  attrs?: Record<string, unknown> | null;
};

function isDocxSource(attrs: Record<string, unknown>): boolean {
  const source = attrs.source;
  return (
    Boolean(source) &&
    typeof source === "object" &&
    !Array.isArray(source) &&
    (source as Record<string, unknown>).adapter === "docx"
  );
}

function hasOwnParagraphStyle(attrs: Record<string, unknown>): boolean {
  return ["docxStyleId", "customStyleId", "customStyleName"].some((key) => {
    const value = attrs[key];
    return typeof value === "string" && value.trim() !== "";
  });
}

/**
 * The paragraph's effective contextual spacing. `listParagraph` says whether
 * it sits directly in a list item.
 */
export function paragraphContextualSpacing(
  node: SpacingNode | null | undefined,
  listParagraph: boolean,
): boolean {
  if (!node) return false;
  const attrs = node.attrs ?? {};
  const value = attrs.contextualSpacing;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  const type = typeof node.type === "string" ? node.type : node.type.name;
  // A DOCX import states the effective value: it writes true, and earlier
  // imports left an effective false unstated (see paragraphKeepFlag). A
  // paragraph style of the item's own replaces List Paragraph; the editor
  // does not model style-level contextual spacing, so it reads as off.
  return (
    listParagraph &&
    type === "paragraph" &&
    !isDocxSource(attrs) &&
    !hasOwnParagraphStyle(attrs)
  );
}

/** True when the paragraph's parent is a list item. */
export function isListParagraphParent(
  parent: { type: { name: string } } | null | undefined,
): boolean {
  return Boolean(parent && LIST_PARAGRAPH_ITEM_TYPES.has(parent.type.name));
}

/**
 * The style a list paragraph has in Word, as the DOCX export names it:
 * List Bullet / List Number (2 and 3 for deeper levels) and List Paragraph
 * for checklists, or the paragraph's own style. Word only suppresses the
 * space between paragraphs of the SAME style, so a nested level, a numbered
 * list after a bulleted one, and the text around a list keep their spacing.
 */
export function listParagraphStyleIdentity(
  paragraph: PmNode,
  listType: string,
  depth: number,
): string {
  if (hasOwnParagraphStyle(paragraph.attrs)) {
    return contextualParagraphStyleIdentity(paragraph) ?? "paragraph:default";
  }
  if (listType === "taskList") return "docx:ListParagraph";
  const base = listType === "orderedList" ? "ListNumber" : "ListBullet";
  return `docx:${base}${depth > 0 ? Math.min(depth + 1, 3) : ""}`;
}

interface ListParagraphEntry {
  node: PmNode;
  pos: number;
  identity: string;
  contextual: boolean;
  before: boolean;
  after: boolean;
}

function decorateAuthoredListTree(
  roots: ReadonlyArray<{ node: PmNode; pos: number }>,
  out: Decoration[],
  fromWord = false,
): void {
  // Reading order, as Word sees the list: one paragraph per item, nested
  // levels in place. Anything else in an item breaks the adjacency.
  const entries: Array<ListParagraphEntry | null> = [];
  const wrappers: Array<{ from: number; to: number; item: boolean }> = [];
  const flatten = (list: PmNode, listPos: number, depth: number) => {
    wrappers.push({ from: listPos, to: listPos + list.nodeSize, item: false });
    list.forEach((item, offset) => {
      const itemPos = listPos + 1 + offset;
      wrappers.push({ from: itemPos, to: itemPos + item.nodeSize, item: true });
      item.forEach((child, childOffset, index) => {
        const childPos = itemPos + 1 + childOffset;
        if (LIST_TYPES.has(child.type.name)) {
          // An item led by a nested list exports an empty paragraph first.
          if (index === 0) entries.push(null);
          flatten(child, childPos, depth + 1);
          return;
        }
        if (
          index === 0 &&
          child.type.name === "paragraph" &&
          child.attrs[LIST_ITEM_SPLIT_BRIDGE_ATTR] !== true
        ) {
          entries.push({
            node: child,
            pos: childPos,
            identity: listParagraphStyleIdentity(child, list.type.name, depth),
            contextual: paragraphContextualSpacing(child, !fromWord),
            before: false,
            after: false,
          });
        } else {
          entries.push(null);
        }
      });
    });
  };
  // Lists that follow one another directly are one run of list paragraphs:
  // a numbering jump splits a list in two, and Word still sees neighbouring
  
  for (const root of roots) flatten(root.node, root.pos, 0);
  // A wholly imported bulleted or numbered list keeps its source-owned spacing
  // (DocumentFormatting's native list path). A list with an item typed here is
  // projected: its imported items read their stated values, as the export
  // writes them. An imported checklist has no native path (that path is the
  // marker geometry of bullets and numbers), so it is always projected here:
  // left to the editor's own `li p` margin, its List Paragraph items stood a
  // whole paragraph space apart where Word, by their contextual spacing, puts
  // them line on line.
  if (
    roots[0]?.node.type.name !== "taskList" &&
    !entries.some((entry) => entry && !isDocxSource(entry.node.attrs))
  )
    return;
  let suppressed = false;
  for (let index = 0; index + 1 < entries.length; index++) {
    const previous = entries[index];
    const next = entries[index + 1];
    if (!previous || !next || previous.identity !== next.identity) continue;
    if (previous.contextual) previous.after = suppressed = true;
    if (next.contextual) next.before = suppressed = true;
  }
  // A Word table's list owes its gaps to its paragraphs whatever they are.
  if (!suppressed && !fromWord) return;
  for (const wrapper of wrappers) {
    out.push(
      Decoration.node(wrapper.from, wrapper.to, {
        class: wrapper.item
          ? `${LIST_PARAGRAPH_SPACING_CLASS}__item`
          : LIST_PARAGRAPH_SPACING_CLASS,
      }),
    );
  }
  for (const entry of entries) {
    if (!entry || (!entry.before && !entry.after)) continue;
    // The mark alone (note-editor.css zeroes the edge): a decoration style
    // takes the paragraph's own inline spacing with it when it goes.
    const attrs: Record<string, string> = {};
    if (entry.before) attrs[CONTEXTUAL_SPACING_BEFORE_ATTR] = "true";
    if (entry.after) attrs[CONTEXTUAL_SPACING_AFTER_ATTR] = "true";
    out.push(Decoration.node(entry.pos, entry.pos + entry.node.nodeSize, attrs));
  }
}

/**
 * Word's list paragraph spacing for lists authored in the editor: the space
 * between two list paragraphs of the same list style is dropped where either
 * one has contextual spacing, and the list's HTML wrappers stop adding
 * margins of their own, so the remaining gaps are the paragraphs' own.
 */
/** A list in a cell of a table read from Word: its paragraphs state no source of
 * their own, but the import wrote what they have (a table with no cell flow of its
 * own, corpus R283-D10: 6 pt after every item taken away, a page more than Word). */
function inWordTable(doc: PmNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "table" && isDocxSource(node.attrs)) return true;
  }
  return false;
}

export function listParagraphSpacingDecorations(
  doc: PmNode,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  const out: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos, parent, index) => {
    if (LIST_TYPES.has(node.type.name)) {
      const before = parent && index > 0 ? parent.child(index - 1) : null;
      // A list right after one of its kind was taken with that one.
      if (before && before.type === node.type) return false;
      const roots = [{ node, pos }];
      let end = pos + node.nodeSize;
      for (let next = index + 1; parent && next < parent.childCount; next += 1) {
        const sibling = parent.child(next);
        if (sibling.type !== node.type) break;
        roots.push({ node: sibling, pos: end });
        end += sibling.nodeSize;
      }
      decorateAuthoredListTree(roots, out, inWordTable(doc, pos));
      return false;
    }
    return !node.isTextblock;
  });
  return out;
}

/** Content starts of the paragraphs about to become list paragraphs. */
function listEntryCandidates(doc: PmNode, from: number, to: number): number[] {
  const starts: number[] = [];
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isTextblock) return true;
    if (
      node.type.name === "paragraph" &&
      node.attrs.contextualSpacing === false &&
      !isListParagraphParent(parent)
    ) {
      starts.push(pos + 1);
    }
    return false;
  });
  return starts;
}

/**
 * A paragraph that has just become a list item inherits List Paragraph's
 * spacing, as Word's Bullets and Numbering apply that style. Only an explicit
 * false is cleared: outside a list it read the same as inheriting (Normal
 * leaves the option off), and documents saved before the option inherited
 * carry that false on every paragraph.
 */
function inheritListParagraphSpacing(
  tr: Transaction,
  starts: readonly number[],
  fromStep: number,
): void {
  if (!starts.length || tr.steps.length === fromStep) return;
  const mapping = tr.mapping.slice(fromStep);
  for (const start of starts) {
    const mapped = mapping.mapResult(start);
    if (mapped.deleted) continue;
    const $pos = tr.doc.resolve(mapped.pos);
    const paragraph = $pos.parent;
    if (
      $pos.depth < 1 ||
      paragraph.type.name !== "paragraph" ||
      paragraph.attrs.contextualSpacing !== false ||
      !isListParagraphParent($pos.node($pos.depth - 1))
    ) {
      continue;
    }
    tr.setNodeAttribute($pos.before(), "contextualSpacing", null);
  }
}

/** The selected textblocks, each with its content start and own node. */
function selectedTextblocks(
  doc: PmNode,
  from: number,
  to: number,
): Array<{ start: number; node: PmNode }> {
  const blocks: Array<{ start: number; node: PmNode }> = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push({ start: pos + 1, node });
    return false;
  });
  return blocks;
}












function restoreClearedParagraphAttrs(
  tr: Transaction,
  blocks: ReadonlyArray<{ start: number; node: PmNode }>,
  fromStep: number,
): void {
  if (!blocks.length || tr.steps.length === fromStep) return;
  const mapping = tr.mapping.slice(fromStep);
  for (const { start, node: before } of blocks) {
    if (before.hasMarkup(before.type, null, before.marks)) continue;
    const mapped = mapping.mapResult(start);
    if (mapped.deleted) continue;
    const $pos = tr.doc.resolve(mapped.pos);
    const after = $pos.parent;
    if (
      $pos.depth < 1 ||
      after.type !== before.type ||
      !after.hasMarkup(after.type, null, after.marks)
    ) {
      continue;
    }
    tr.setNodeMarkup($pos.before(), undefined, before.attrs, after.marks);
  }
}

/**
 * Run a list toggle so the paragraphs it wraps keep their own paragraph
 * formatting and take List Paragraph spacing.
 */
export function withListParagraphSpacing(
  props: CommandProps,
  run: () => boolean,
): boolean {
  const { tr, dispatch } = props;
  if (!dispatch) return run();
  const { from, to } = tr.selection;
  const starts = listEntryCandidates(tr.doc, from, to);
  const blocks = selectedTextblocks(tr.doc, from, to);
  const fromStep = tr.steps.length;
  const applied = run();
  if (applied) {
    restoreClearedParagraphAttrs(tr, blocks, fromStep);
    inheritListParagraphSpacing(tr, starts, fromStep);
  }
  return applied;
}

/**
 * The list input rules ("- ", "1. ", "[ ] ") with the same list entry.
 *
 * They fire on the space typed after the marker only. TipTap also
 * runs input rules on Enter with the text "\n", which their trailing `\s`
 * matched, so "1." + Enter turned the bare marker into a list. Word's
 * AutoFormat As You Type starts a list when the marker is followed by a
 * space or tab; "1." (or "*", "-") followed by Enter stays text and Enter is
 * an ordinary new paragraph (Word for Mac 16, measured). Enter after "1."
 * and text is `documentListAutoFormat.ts`.
 */
export function listParagraphSpacingInputRules(
  rules: readonly InputRule[],
): InputRule[] {
  return rules.map(
    (rule) =>
      new InputRule({
        find: rule.find,
        undoable: rule.undoable,
        handler: (props) => {
          if (props.match[0]?.endsWith("\n")) return null;
          const { tr } = props.state;
          const $from = tr.doc.resolve(props.range.from);
          const starts = listEntryCandidates(tr.doc, $from.start(), $from.start());
          const fromStep = tr.steps.length;
          const result = rule.handler(props);
          if (result !== null) inheritListParagraphSpacing(tr, starts, fromStep);
          return result;
        },
      }),
  );
}

/**
 * Checklist on the items of a NESTED bullet or numbered list: the sub-list
 * becomes a checklist where it stands, under its parent item, as Numbering
 * turns a sub-list into a numbered one. TipTap's toggle can retype a list
 * only when the new list takes the old items; a checklist takes task items,
 * so it cleared the list and wrapped its paragraphs at the top level, and
 * the children left their parent (WUA 067). False when the selection is not
 * in such a sub-list, for TipTap's own toggle.
 */
function convertNestedListToTaskList(props: CommandProps): boolean {
  const { state, tr, dispatch } = props;
  const { taskList, taskItem } = state.schema.nodes;
  if (!taskList || !taskItem) return false;
  const { $from, $to } = tr.selection;
  const range = $from.blockRange(
    $to,
    (node) => node.type.name === "bulletList" || node.type.name === "orderedList",
  );
  if (!range) return false;
  const list = range.parent;
  const listDepth = range.depth;
  if (listDepth < 1) return false;
  const holder = $from.node(listDepth - 1).type.name;
  if (holder !== "listItem" && holder !== "taskItem") return false;
  const items: PmNode[] = [];
  let convertible = true;
  list.forEach((item) => {
    if (item.type.name !== "listItem" || !taskItem.validContent(item.content)) {
      convertible = false;
      return;
    }
    items.push(taskItem.create(sharedAttrs(taskItem, item.attrs, { checked: false }), item.content, item.marks));
  });
  if (!convertible || items.length === 0) return false;
  if (!dispatch) return true;
  const listPos = $from.before(listDepth);
  const { anchor, head } = tr.selection;
  tr.replaceWith(
    listPos,
    listPos + list.nodeSize,
    taskList.create(sharedAttrs(taskList, list.attrs, {}), items, list.marks),
  );
  // A list item and a task item of the same content are the same size: the
  // selection keeps its places.
  tr.setSelection(TextSelection.create(tr.doc, anchor, head));
  return true;
}

/** The attributes of `from` that `type` also has, with `extra` on top. */
function sharedAttrs(
  type: PmNode["type"],
  from: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const name of Object.keys(type.spec.attrs ?? {})) {
    if (name in from) attrs[name] = from[name];
  }
  return { ...attrs, ...extra };
}

/** Word's checklist is a list paragraph too: Checklist and "[ ] " enter it. */
export const DocumentTaskList = TaskList.extend({
  addCommands() {
    const parent = this.parent?.() as Record<
      string,
      (...args: unknown[]) => (props: CommandProps) => boolean
    >;
    return {
      ...parent,
      toggleTaskList:
        () =>
        (props: CommandProps) => {
          const one = () =>
            withListParagraphSpacing(
              props,
              () => convertNestedListToTaskList(props) || parent.toggleTaskList()(props),
            );
          // Cells selected as cells each take the checklist (WUA 243).
          return toggleListInSelectedCells(props, "taskList", one) ?? one();
        },
    };
  },
});

export const DocumentTaskItem = TaskItem.extend({
  addInputRules() {
    return listParagraphSpacingInputRules(this.parent?.() ?? []);
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: taskItemCaretKey,
        props: {
          handleDOMEvents: {
            // A key on the item's focused box is the box's own (Space ticks
            // it): not the editor's typing, which replaced the text
            // selected across the items with the space (WUA 205).
            keydown: (_view, event) => isTaskCheckbox(event.target),
            keypress: (_view, event) => isTaskCheckbox(event.target),
            // Ticking an item's box puts the caret in that item, as a
            // checkbox content control does. The tick kept the caret where
            // it was, so an Undo restored it there and scrolled the page
            // back to it, a page away from the box.
            mousedown: (view, event) => {
              const target = event.target;
              if (!(target instanceof HTMLInputElement) || target.type !== "checkbox" || !view.editable) return false;
              const item = target.closest("li");
              if (!item || !view.dom.contains(item)) return false;
              const content = item.querySelector(":scope > div");
              let at: number;
              try {
                at = view.posAtDOM(content ?? item, 0);
              } catch {
                return false;
              }
              const $at = view.state.doc.resolve(Math.min(Math.max(at, 0), view.state.doc.content.size));
              let inTask = false;
              for (let depth = $at.depth; depth > 0; depth -= 1) {
                if ($at.node(depth).type.name === this.name) inTask = true;
              }
              if (!inTask) return false;
              const selection = TextSelection.near($at);
              if (!selection.eq(view.state.selection)) {
                view.dispatch(view.state.tr.setSelection(selection).setMeta("addToHistory", false));
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

const taskItemCaretKey = new PluginKey("documentTaskItemCaret");

function isTaskCheckbox(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && target.type === "checkbox" && Boolean(target.closest("li[data-type=\"taskItem\"], li[data-checked]"));
}
