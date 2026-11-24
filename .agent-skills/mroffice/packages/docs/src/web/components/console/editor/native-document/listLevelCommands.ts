/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's list level change (Tab / Shift+Tab, Home > Increase / Decrease List
 * Level, Multilevel List > Change List Level) in the editor's tree-shaped lists.
 *
 * Word's rule (Microsoft Support "Change bullet indents in Word": Multilevel
 * List > Change List Level, each level with its own marker; Tab / Shift+Tab at
 * the start of an item increase / decrease its list level, and the first item
 * of a list has no level above it to join; Open XML `w:ilvl`, ECMA-376
 * §17.3.1.19 numPr / §17.9.3 ilvl): a Word list is FLAT paragraphs. A
 * level change rewrites only `w:ilvl` of the SAME paragraph, which keeps its
 * `w:numId`. The paragraph stays one paragraph on its own line, shows the next
 * level's number of the SAME numbering ("1." -> "a." in a 1. / a. / i. list),
 * the caret stays in it, the level-1 items around it keep counting, and
 * Shift+Tab gives the old level back. There is no wrapper item.
 *
 * Here a deeper level is a list nested in the previous item (ProseMirror's
 * sinkListItem). That nested list must be the same numbering instance one
 * level down, which every reader keys off the list's numbering identity: the
 * exporter (same numbering style -> same numId, ilvl + 1), the counter CSS
 * (`ol[data-list-style]` resets and draws each level) and the definition walk
 * (a nested list without its own definition is the next level). ProseMirror
 * creates the nested list with default attributes, i.e. a separate plain
 * decimal list: under a 1. / a. / i. list it kept its native "1." beside the
 * scheme's "a.", the inline "a." pushed the item's paragraph one line down,
 * and export gave the item a numbering of its own. A nested list created by a
 * demotion therefore takes its parent list's numbering scheme.
 *
 * Only a NEW level is stamped. An item joining a deeper list that already
 * exists keeps that list's numbering, and Shift+Tab (liftListItem) copies the
 * lists it splits, so nothing else needs an override. Bullet levels keep
 * their per-level glyphs (the default bullet cycles disc / circle / square by
 * depth, as Word's does) and task lists have no numbering.
 *
 * The keys (Word with "Set left- and first-indent with tabs and backspaces",
 * its default): Tab / Shift+Tab change the level only with the insertion
 * point at the start of the item, or with a selection across items. Inside
 * the text Tab types a tab character, as anywhere else in Word, and Shift+Tab
 * does nothing there. The first item of a numbered list moves the whole
 * list (Word moves the list when its first item has no level to join); the
 * first item of a sublist, a bullet list or a checklist stays where it is.
 * The key never leaves the document: the browser's own Tab would move the
 * focus out of the editor.
 */

import { Extension, getNodeType, type CommandProps, type Editor } from "@tiptap/core";
import type { Node as PmNode, NodeType, ResolvedPos } from "@tiptap/pm/model";
import { Fragment, NodeRange, Slice } from "@tiptap/pm/model";
import { liftListItem as liftListItemCommand, sinkListItem as sinkListItemCommand } from "@tiptap/pm/schema-list";
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state";
import { canJoin, liftTarget, ReplaceAroundStep } from "@tiptap/pm/transform";

import { readDocumentNumberingMarkerFact } from "@mrnote/core/web/components/console/editor/native-document/documentNumberingLayout.ts";
import { explicitOrderedListLevel } from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import { normalizeListDefinition, type ListDefinition } from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import { indentWholeList } from "./listWholeIndent";
import { DEFAULT_LIST_STYLE, normalizeListStyleType } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";

/**
 * The numbering attributes a new deeper level of `list` carries so it stays
 * the same numbering instance, or null when the plain nested list already is
 * (a defined list numbers its nested lists as its own levels; a decimal list's
 * next level is decimal). PURE.
 */
export function nextLevelListAttrs(
  list: PmNode,
): Record<string, unknown> | null {
  if (list.type.name !== "orderedList") return null;
  if (normalizeListDefinition(list.attrs.listDefinition)) return null;
  const style = normalizeListStyleType(list.attrs.listStyleType);
  return style === DEFAULT_LIST_STYLE ? null : { listStyleType: style };
}

/**
 * The Word numbering definition the list at `depth` of `$pos` draws from and
 * the level it draws at, as the marker walk (listDefinitionMarkers) numbers
 * it: a list with a definition of its own is a numbering's root (at its
 * stated level, or one below the list it sits in); an ordered or bullet list
 * nested item by item under it is that numbering one level further down.
 * Null outside a defined numbering. PURE.
 */
export function definedListLevelAt(
  $pos: ResolvedPos,
  depth: number,
): { definition: ListDefinition; level: number } | null {
  let definition: ListDefinition | null = null;
  let level = -1;
  for (let d = 1; d <= depth; d += 1) {
    const node = $pos.node(d);
    const name = node.type.name;
    if (name === "listItem") continue;
    if (name !== "orderedList" && name !== "bulletList") {
      definition = null;
      level = -1;
      continue;
    }
    if (level >= 0 && $pos.node(d - 1).type.name !== "listItem") {
      definition = null;
      level = -1;
    }
    const own =
      name === "orderedList" ? normalizeListDefinition(node.attrs.listDefinition) : null;
    if (own) definition = own;
    level =
      (name === "orderedList" ? explicitOrderedListLevel(node) : null) ??
      (level >= 0 ? level + 1 : 0);
  }
  return definition ? { definition, level: Math.min(level, 8) } : null;
}

/**
 * Where ProseMirror's sinkListItem will CREATE a nested list for the selected
 * items, with the type and attributes it needs; null when it will not create
 * one (not sinkable, or the items join the previous item's existing deeper
 * list) or the created list needs nothing.
 *
 * In a defined numbering the new level is the definition's next `w:lvl`,
 * whose format says what kind of list it is (Word keeps the `w:numId` and
 * shows that level's marker; the import reads a bullet level as a bullet
 * list nested in the numbered one, corpus R157-D16): a bullet level of a
 * numbered list (1. / • / •) is a bullet list, a number level under a bullet
 * level an ordered one. ProseMirror nests the parent's kind, so an ordered
 * list at a bullet level drew "•" while every save read it as a numbering of
 * its own: the patch wrote it a new definition ("a." in Word, R466-D95 E13)
 * and the full export Word's bullet level, which reimported as a bullet list.
 */
function newLevelTarget(
  selection: Selection,
  itemType: NodeType,
): { pos: number; from: NodeType; type: NodeType; attrs: Record<string, unknown> } | null {
  const { $from, $to } = selection;
  const range = $from.blockRange(
    $to,
    (node) => node.childCount > 0 && node.firstChild?.type === itemType,
  );
  if (!range || range.startIndex === 0) return null;
  const list = range.parent;
  const before = list.child(range.startIndex - 1);
  if (before.type !== itemType) return null;
  if (before.lastChild?.type === list.type) return null;
  // The new list opens where the previous item's content ended.
  const pos = range.start - 1;
  const defined = definedListLevelAt($from, range.depth);
  if (defined) {
    const next = defined.definition.levels[Math.min(defined.level + 1, 8)];
    const schema = list.type.schema.nodes;
    const kind =
      next?.format === "bullet" ? schema.bulletList : next ? schema.orderedList : undefined;
    if (!kind || kind === list.type) return null;
    return { pos, from: list.type, type: kind, attrs: {} };
  }
  const attrs = nextLevelListAttrs(list);
  if (!attrs) return null;
  return { pos, from: list.type, type: list.type, attrs };
}

/** A paragraph's indents as the page states them (an imported list
 * paragraph carries the ones its numbering level resolved to). */
type ItemIndents = { left: unknown; firstLine: unknown };

function itemIndents(item: PmNode): ItemIndents | null {
  const paragraph = item.firstChild;
  if (!paragraph || !paragraph.isTextblock) return null;
  const left = paragraph.attrs.indentLeftPt ?? null;
  const firstLine = paragraph.attrs.firstLineIndentPt ?? null;
  return left === null && firstLine === null ? null : { left, firstLine };
}

function sameIndents(a: ItemIndents | null, b: ItemIndents | null): boolean {
  return !!a && !!b && a.left === b.left && a.firstLine === b.firstLine;
}

/** The one pair of indents every item of `items` states, or null. */
function sharedIndents(items: readonly PmNode[]): ItemIndents | null {
  let shared: ItemIndents | null = null;
  for (const item of items) {
    const own = itemIndents(item);
    if (!own || (shared && !sameIndents(shared, own))) return null;
    shared = own;
  }
  return shared;
}

/**
 * The indents a demotion moves the items between: the level they leave (what
 * every other item of their list states) and the level they join (what every
 * item of the previous item's deeper list states). An imported Word list
 * paragraph states the indents its `w:lvl` resolved to, so an item that
 * still states its old level's takes the new level's, as Word draws a
 * paragraph whose `w:ilvl` changed (its own direct indent, one the level does
 * not give, stays). Null when either is not known. PURE.
 */
function levelIndentsOfSink(
  selection: Selection,
  itemType: NodeType,
): { from: ItemIndents; to: ItemIndents } | null {
  const range = selection.$from.blockRange(
    selection.$to,
    (node) => node.childCount > 0 && node.firstChild?.type === itemType,
  );
  if (!range || range.startIndex === 0) return null;
  const list = range.parent;
  const others: PmNode[] = [];
  list.forEach((item, _offset, index) => {
    if (index < range.startIndex || index >= range.endIndex) others.push(item);
  });
  const from = sharedIndents(others);
  const deeper = list.child(range.startIndex - 1).lastChild;
  if (!from || !deeper || !LIST_NODE_NAMES.has(deeper.type.name)) return null;
  const items: PmNode[] = [];
  deeper.forEach((item) => items.push(item));
  const to = sharedIndents(items);
  return to && !sameIndents(from, to) ? { from, to } : null;
}

/**
 * The indents a demotion moves an item between when the previous item has no
 * deeper level to say what the new one looks like: the item's own sub-items
 * do -- they are at the level it joins, in Word's flat list its siblings
 * after the demotion (`keepWordLevels`; corpus R486-D80 E51). Null when
 * either is not known. PURE.
 */
function levelIndentsOfOwnSubItems(
  selection: Selection,
  itemType: NodeType,
): { from: ItemIndents; to: ItemIndents } | null {
  const range = selection.$from.blockRange(
    selection.$to,
    (node) => node.childCount > 0 && node.firstChild?.type === itemType,
  );
  if (!range || range.startIndex === 0 || range.endIndex - range.startIndex !== 1) return null;
  const list = range.parent;
  const others: PmNode[] = [];
  list.forEach((item, _offset, index) => {
    if (index < range.startIndex || index >= range.endIndex) others.push(item);
  });
  const from = sharedIndents(others);
  const inner = list.child(range.startIndex).lastChild;
  if (!from || !inner || inner.type !== list.type) return null;
  const items: PmNode[] = [];
  inner.forEach((item) => items.push(item));
  const to = sharedIndents(items);
  return to && !sameIndents(from, to) ? { from, to } : null;
}

/**
 * After ProseMirror's sinkListItem, what Word's flat list keeps: only the
 * demoted paragraphs change level. ProseMirror moves each item with the
 * deeper list it holds, so its sub-items went one level down with it; in
 * Word they keep their `w:ilvl` and are now the demoted item's siblings
 * (corpus R485-D87 E13: "NSIC 222" went from ilvl 1 to 2 under the demoted
 * "RICE-PRE"). Sub-items of a list that is not the one the item joined (an
 * other numbering at that level) keep their depth as well when the last
 * demoted item holds them: they go on after the list it joined (corpus
 * R492-D19 E13); under an earlier one they stay where they are. The demoted items take
 * the new level's indents (`levelIndentsOfSink`).
 */
function keepWordLevels(
  tr: Transaction,
  itemType: NodeType,
  indents: { from: ItemIndents; to: ItemIndents } | null,
): void {
  const range = tr.selection.$from.blockRange(
    tr.selection.$to,
    (node) => node.childCount > 0 && node.firstChild?.type === itemType,
  );
  if (!range) return;
  const list = range.parent;
  const items: { pos: number; node: PmNode }[] = [];
  let pos = range.start;
  for (let index = range.startIndex; index < range.endIndex; index += 1) {
    const node = list.child(index);
    items.push({ pos, node });
    pos += node.nodeSize;
  }
  // A list the demotion CREATED (it holds the demoted items and nothing
  // else) inside a defined numbering is that numbering's next level -- the
  // level a demoted item's own sub-items already are at, with no definition of
  // their own (corpus R486-D80 E51: "...changes sharply in at least one of the
  // following ways:" demoted, its three sub-items went to ilvl 2 with it).
  // It takes those sub-items' list attributes, so they join it as the item's
  // siblings, as Word keeps them at their w:ilvl.
  let listAttrs = list;
  const created = range.startIndex === 0 && range.endIndex === list.childCount;
  const first = items[0]?.node.lastChild;
  if (
    created &&
    first &&
    first.type === list.type &&
    !sameListAttrs(first, list) &&
    !(first.type.name === "orderedList" && normalizeListDefinition(first.attrs.listDefinition)) &&
    definedListLevelAt(tr.selection.$from, range.depth)
  ) {
    const listPos = range.$from.before(range.depth);
    tr.setNodeMarkup(listPos, undefined, { ...first.attrs, block_id: list.attrs.block_id });
    listAttrs = first;
  }
  const listEnd = range.$from.end(range.depth);
  for (const { pos: itemPos, node } of items.reverse()) {
    const inner = node.lastChild;
    if (node.childCount > 1 && inner && LIST_NODE_NAMES.has(inner.type.name) && sameListAttrs(inner, listAttrs)) {
      const innerPos = itemPos + node.nodeSize - 1 - inner.nodeSize;
      const $start = tr.doc.resolve(innerPos + 1);
      const $end = tr.doc.resolve(innerPos + inner.nodeSize - 1);
      const children = new NodeRange($start, $end, $start.depth);
      const target = liftTarget(children);
      if (target != null) tr.lift(children, target);
    } else if (
      node.childCount > 1 &&
      inner &&
      LIST_NODE_NAMES.has(inner.type.name) &&
      itemPos + node.nodeSize === listEnd
    ) {
      // A list of another numbering the LAST demoted item held (corpus
      // R492-D19 E13: a heading numbering's "Batasan Masalah" read under the
      // item before it) keeps its level too: it goes on after the list the
      // item joined, in the same parent item, where it is as deep as it was.
      // In Word its paragraphs' w:ilvl did not change.
      const innerPos = itemPos + node.nodeSize - 1 - inner.nodeSize;
      const $after = tr.doc.resolve(listEnd + 1);
      if ($after.parent.canReplaceWith($after.index(), $after.index(), inner.type)) {
        tr.insert(listEnd + 1, inner);
        tr.delete(innerPos, innerPos + inner.nodeSize);
      }
    }
    const paragraph = node.firstChild;
    if (indents && paragraph?.isTextblock && sameIndents(itemIndents(node), indents.from)) {
      tr.setNodeMarkup(itemPos + 1, undefined, {
        ...paragraph.attrs,
        indentLeftPt: indents.to.left,
        firstLineIndentPt: indents.to.firstLine,
      });
    }
  }
}

/** Word's list levels: nine (`w:ilvl` 0-8; [MS-OI29500] 17.9.6, Word will
 * not open a deeper one). Increase List Level and Tab stop at the ninth, as
 * in Word; the page's depth bound (40 nodes, which every exporter shares)
 * is then out of reach of a list. */
export const MAX_DOCUMENT_LIST_LEVELS = 9;

const LIST_NODE_NAMES = new Set(["bulletList", "orderedList", "taskList"]);

/** How many lists hold the selection's start (1 = a top-level list). */
export function listLevelAt(selection: Selection): number {
  const { $from } = selection;
  let levels = 0;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (LIST_NODE_NAMES.has($from.node(depth).type.name)) levels += 1;
  }
  return levels;
}

export const DocumentListLevels = Extension.create({
  name: "documentListLevels",

  addCommands() {
    return {
      // Replaces the core command of the same name (registered after it), so
      // the Tab keymap, the ribbon's Increase List Level and editor.can() all
      // demote the Word way.
      sinkListItem:
        (typeOrName: string | NodeType) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const itemType = getNodeType(typeOrName, state.schema);
          if (listLevelAt(state.selection) >= MAX_DOCUMENT_LIST_LEVELS) return false;
          const target = newLevelTarget(state.selection, itemType);
          const indents =
            levelIndentsOfSink(state.selection, itemType) ?? levelIndentsOfOwnSubItems(state.selection, itemType);
          if (!sinkListItemCommand(itemType)(state, dispatch)) return false;
          if (!dispatch) return true;
          const created = target ? tr.doc.nodeAt(target.pos) : null;
          if (target && created?.type === target.from && created.firstChild?.type === itemType) {
            if (target.type === target.from) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...created.attrs,
                ...target.attrs,
              });
            } else {
              tr.setNodeMarkup(target.pos, target.type, target.attrs);
              // The previous item already ends in a list of that kind (the
              // level's earlier items): the new items join it, as Word's
              // paragraphs of one level are one run of that level.
              if (tr.doc.resolve(target.pos).nodeBefore?.type === target.type && canJoin(tr.doc, target.pos))
                tr.join(target.pos);
            }
          }
          keepWordLevels(tr, itemType, indents);
          return true;
        },
    };
  },
});

const LIST_ITEM_NAMES = new Set(["listItem", "taskItem"]);

/**
 * The list item the selection starts in, when Tab belongs to the list: not
 * when a table between the item and the caret owns the key, nor for a list
 * inside a table cell, whose Tab keeps its table behaviour.
 */
export function listItemForTab(state: EditorState): string | null {
  const { $from } = state.selection;
  let item: string | null = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") return null;
    if (!item && LIST_ITEM_NAMES.has(name)) item = name;
  }
  return item;
}

/** Whether Tab / Shift+Tab act on the item's level (Word: at its start). */
export function tabChangesListLevel(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  return $from.parentOffset === 0 || !$from.sameParent($to);
}

function listTab(editor: Editor, shift: boolean): boolean {
  if (!editor.isEditable) return false;
  const item = listItemForTab(editor.state);
  if (!item) return false;
  if (!tabChangesListLevel(editor.state)) {
    if (shift) return true;
    return editor.commands.command(({ tr }) => {
      tr.insertText("\t").scrollIntoView();
      return true;
    });
  }
  // The first item of a numbered list has no item to go under: the whole
  // list moves, as Increase / Decrease Indent does there (listWholeIndent).
  if (editor.commands.command(({ state, tr }) => indentWholeList(state, tr, shift ? -1 : 1)))
    return true;
  if (shift) editor.commands.command(({ state, dispatch }) => liftListItemKeepingLists(getNodeType(item, state.schema))(state, dispatch));
  else editor.commands.sinkListItem(item);
  return true;
}

/**
 * Word's Tab / Shift+Tab in a list item, ahead of the list items' own keymap
 * (which demotes wherever the caret is and lets an unmovable first item's Tab
 * reach the browser).
 */
export const DocumentListLevelKeys = Extension.create({
  name: "documentListLevelKeys",
  // Above ListItem / TaskItem (100), below the table grid fillers (150).
  priority: 110,

  addKeyboardShortcuts() {
    return {
      Tab: () => listTab(this.editor, false),
      "Shift-Tab": () => listTab(this.editor, true),
    };
  },
});

export default DocumentListLevels;


/** Two lists the same apart from their identity: one list continuing. */
function sameListAttrs(a: PmNode, b: PmNode): boolean {
  if (a.type !== b.type) return false;
  const keys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  keys.delete("block_id");
  return [...keys].every((key) => JSON.stringify(a.attrs[key] ?? null) === JSON.stringify(b.attrs[key] ?? null));
}

/**
 * Decrease Indent / Shift+Tab on list items, as Word does it: only the items
 * move up a level. ProseMirror's `liftListItem` makes the items after them
 * children of the last lifted item (their level does not change), and then
 * JOINS that copy of their list into the list the lifted item already ends
 * with -- a deeper level of its own (corpus R474-D95 E14: an item lifted out
 * of a Wingdings ilvl 2 list, the items after it went into its ilvl 3 child
 * list, lost their list and were written a new numbering). Two lists that
 * differ in anything but their identity stay two, as their paragraphs' levels
 * do in Word; the rest is ProseMirror's own command.
 */
/**
 * Decrease Indent on items of a nested list that states a Word level of its
 * own deeper than the next one below its parent (an imported ilvl 3 item
 * under an ilvl 0 one: the list's `listLevel` 3, its parent's level 0). Word
 * changes those paragraphs' w:ilvl to one level up -- 2, still below the
 * parent item -- and nothing moves (corpus R486-D59 E14: the item was lifted
 * out to the top level, written ilvl 2 with a new numbering by the patch and
 * ilvl 0 by the full export). The selected items take the list's level less
 * one, split off into a list of their own when they are not all of it.
 * False (nothing done) for any other list. PURE but for `tr`.
 */
function decreaseSkippedLevel(tr: Transaction, range: NodeRange): boolean {
  const list = range.parent;
  if (range.depth < 3 || !LIST_NODE_NAMES.has(list.type.name) || list.type.name === "taskList") return false;
  const level = wordLevelOfList(list);
  if (level == null) return false;
  const defined = list.type.name === "orderedList" ? definedListLevelAt(range.$from, range.depth - 2) : null;
  const parentLevel = defined?.level ?? wordLevelOfItem(range.$from.node(range.depth - 1), list);
  if (parentLevel == null || level - 1 <= parentLevel) return false;
  const listPos = range.$from.before(range.depth);
  // An imported item states the indents its w:lvl resolved to; one still
  // stating its old level's takes the new level's, as Word draws a paragraph
  // whose w:ilvl changed (its own direct indent stays). Attributes only, so
  // the positions the splits below use do not move. (A bullet list carries no
  // definition to say them: its items keep what they state.)
  const levelIndents = (at: number): ItemIndents | null => {
    const definition = defined?.definition.levels[at];
    return definition ? { left: definition.indentPt, firstLine: definition.alignAtPt - definition.indentPt } : null;
  };
  const from = levelIndents(level);
  const to = levelIndents(level - 1);
  if (from && to && !sameIndents(from, to)) {
    let itemPos = range.start;
    for (let index = range.startIndex; index < range.endIndex; index += 1) {
      const node = list.child(index);
      const paragraph = node.firstChild;
      if (paragraph?.isTextblock && sameIndents(itemIndents(node), from)) {
        tr.setNodeMarkup(itemPos + 1, undefined, {
          ...paragraph.attrs,
          indentLeftPt: to.left,
          firstLineIndentPt: to.firstLine,
        });
      }
      itemPos += node.nodeSize;
    }
  }
  // Split the selected items off the list (after them first, so the
  // positions before them stay put); a list split off is a new block. Every
  // part states its Word level, which a bullet list read from its items'
  // numbering did not.
  if (range.endIndex < list.childCount) {
    tr.split(range.end, 1, [{ type: list.type, attrs: { ...list.attrs, block_id: null, listLevel: level } }]);
    // The items after them keep their w:ilvl, now one deeper than the last
    // decreased item's: in Word they are its sub-items, as the file reads
    // back (corpus R493-D56 E14: "Tip merkezleri" and "Muayenehaneler" at
    // ilvl 2 after "Hastaneler", 2 -> 1). The list goes into that item, after
    // anything it held.
    const after = tr.doc.nodeAt(range.end + 1);
    const $last = tr.doc.resolve(range.end - 1);
    if (after && $last.parent.type === list.child(range.endIndex - 1).type &&
        $last.parent.canReplaceWith($last.index(), $last.index(), after.type)) {
      tr.delete(range.end + 1, range.end + 1 + after.nodeSize);
      tr.insert(range.end - 1, after);
    }
  }
  if (range.startIndex > 0) {
    tr.setNodeMarkup(listPos, undefined, { ...list.attrs, listLevel: level });
    tr.split(range.start, 1, [{ type: list.type, attrs: { ...list.attrs, block_id: null, listLevel: level - 1 } }]);
    return true;
  }
  tr.setNodeMarkup(listPos, undefined, { ...list.attrs, listLevel: level - 1 });
  return true;
}

/**
 * The Word level (`w:ilvl`) a list's items are on: the level it states, else
 * the one every item's imported paragraph was numbered at (one `w:numId`, one
 * level; a bullet list states none, corpus R493-D56). Null when not known.
 * PURE.
 */
function wordLevelOfList(list: PmNode): number | null {
  const stated = explicitOrderedListLevel(list);
  if (stated != null) return stated;
  let found: { numId: number; level: number } | null = null;
  let agreed = list.childCount > 0;
  list.forEach((item) => {
    const paragraph = item.firstChild;
    const fact = paragraph?.isTextblock ? readDocumentNumberingMarkerFact(paragraph.attrs) : null;
    if (!fact || (found && (found.numId !== fact.numId || found.level !== fact.level))) agreed = false;
    else found = { numId: fact.numId, level: fact.level };
  });
  return agreed && found ? (found as { level: number }).level : null;
}

/** The Word level of the item holding `list`, when its paragraph was
 * numbered by the same `w:numId` as the list's items. PURE. */
function wordLevelOfItem(item: PmNode, list: PmNode): number | null {
  const own = item.firstChild?.isTextblock ? readDocumentNumberingMarkerFact(item.firstChild.attrs) : null;
  const first = list.firstChild?.firstChild;
  const theirs = first?.isTextblock ? readDocumentNumberingMarkerFact(first.attrs) : null;
  return own && theirs && own.numId === theirs.numId ? own.level : null;
}

/**
 * Before a lift: the lists the lifted items hold (at any depth) whose Word
 * level is known and not stated, with that level. ProseMirror moves them up a
 * level with their item; in Word their paragraphs keep their w:ilvl (corpus
 * R497-D45 E14: "Reference_Points" and "Feature_Name", ilvl 2 under the
 * decreased ilvl 1 item, were written ilvl 1 with a new indent). Stating it
 * keeps them where they were. PURE.
 */
function heldListLevels(range: NodeRange): { pos: number; level: number }[] {
  const held: { pos: number; level: number }[] = [];
  const $base = range.$from;
  const contentStart = $base.start(range.depth);
  range.parent.nodesBetween(range.start - contentStart, range.end - contentStart, (node, offset) => {
    if (!LIST_NODE_NAMES.has(node.type.name) || node.type.name === "taskList") return true;
    if (explicitOrderedListLevel(node) != null) return true;
    const pos = contentStart + offset;
    let level = wordLevelOfList(node);
    if (level == null && node.type.name === "orderedList") {
      level = definedListLevelAt($base.doc.resolve(pos + 1), $base.doc.resolve(pos + 1).depth)?.level ?? null;
    }
    if (level != null) held.push({ pos, level });
    return true;
  });
  return held;
}

export function liftListItemKeepingLists(itemType: NodeType) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to, (node) => node.childCount > 0 && node.firstChild!.type === itemType);
    if (!range || !dispatch || $from.node(range.depth - 1).type !== itemType) {
      return liftListItemCommand(itemType)(state, dispatch);
    }
    const tr = state.tr;
    if (decreaseSkippedLevel(tr, range)) {
      dispatch(tr.scrollIntoView());
      return true;
    }
    const held = heldListLevels(range);
    const end = range.end;
    const endOfList = range.$to.end(range.depth);
    let lifted = range;
    if (end < endOfList) {
      tr.step(new ReplaceAroundStep(end - 1, endOfList, end, endOfList,
        new Slice(Fragment.from(itemType.create(null, range.parent.copy())), 1, 0), 1, true));
      lifted = new NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth);
    }
    const target = liftTarget(lifted);
    if (target == null) return false;
    tr.lift(lifted, target);
    const $after = tr.doc.resolve(tr.mapping.map(end, -1) - 1);
    if (canJoin(tr.doc, $after.pos) && $after.nodeBefore && $after.nodeAfter &&
        sameListAttrs($after.nodeBefore, $after.nodeAfter)) {
      tr.join($after.pos);
    }
    for (const { pos, level } of held) {
      const at = tr.mapping.mapResult(pos, 1);
      const node = at.deleted ? null : tr.doc.nodeAt(at.pos);
      if (node && LIST_NODE_NAMES.has(node.type.name)) tr.setNodeMarkup(at.pos, undefined, { ...node.attrs, listLevel: level });
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}
