/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Increase / Decrease Indent at the FIRST item of a numbered list.
 *
 * Measured on Word 16.86 (Home > Increase Indent / Decrease Indent pressed on
 * a nine-level list, the saved numbering.xml read back):
 *   - an item that is not the first of its numbering changes level ("2." to
 *     "a."), the item alone;
 *   - with the insertion point in the first item, or a selection that starts
 *     there (the whole list selected), Word cannot demote it -- there is no
 *     item above to join -- and moves the WHOLE list instead: every level of
 *     the numbering's definition gains 0.25 in (`w:ind w:left` +360 twips;
 *     number position and text position together), no level changes, every
 *     paragraph of the numbering follows, its continuations included;
 *   - Decrease Indent there moves the list back by the same step and never
 *     past the margin: at number position 0 it does nothing.
 * Tab and Shift+Tab at the start of the first item do the same (Word's
 * "Set left- and first-indent with tabs and backspaces", on by default).
 *
 * The list's levels are its definition (listLevelDefinition.ts), so the move
 * is a definition edit: a gallery list takes the definition its scheme
 * already exports with, moved. Bullet lists and checklists carry no
 * definition here, so their first item has no move to make.
 */

import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import { normalizeListChain } from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import {
  MAX_LIST_POSITION_PT,
  normalizeListDefinition,
  presetListDefinition,
  listStyleTypeForDefinition,
  type ListDefinition,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import { DEFAULT_LIST_STYLE, normalizeListStyleType } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

/** Word's step for moving a whole list: 0.25 in (360 twips). */
export const WHOLE_LIST_INDENT_STEP_PT = 18;

const ITEM_NAMES = new Set(["listItem", "taskItem"]);

/**
 * The ordered list whose numbering the selection starts in the FIRST item
 * of: the list starts a numbering of its own (top level, or a nested list
 * with a definition of its own) and neither continues an earlier list nor is
 * a page-split fragment of one. Null anywhere else, including the first item
 * of a sublist, which Word demotes.
 */
export function wholeListAtSelection(
  state: EditorState,
): { pos: number; node: PmNode } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 1; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") return null;
    if (!ITEM_NAMES.has(node.type.name)) continue;
    const list = $from.node(depth - 1);
    if (list.type.name !== "orderedList" || $from.index(depth - 1) !== 0) return null;
    const holder = $from.node(depth - 2);
    if (
      ITEM_NAMES.has(holder.type.name) &&
      !normalizeListDefinition(list.attrs.listDefinition)
    )
      return null;
    if (list.attrs.listContinue === true || !fragmentCarries("listLabel", list.attrs))
      return null;
    return { pos: $from.before(depth - 1), node: list };
  }
  return null;
}

function definitionOf(list: PmNode): ListDefinition | null {
  return (
    normalizeListDefinition(list.attrs.listDefinition) ??
    normalizeListDefinition(
      presetListDefinition(normalizeListStyleType(list.attrs.listStyleType)),
    )
  );
}

/**
 * How far the list can move toward `direction`, at most one step: the
 * definition's positions stay within the margin and Word's 22-inch limit.
 * Zero when it cannot move.
 */
function allowedShiftPt(definition: ListDefinition, direction: 1 | -1): number {
  const positions = definition.levels.flatMap((level) => [level.alignAtPt, level.indentPt]);
  if (direction < 0) return -Math.min(WHOLE_LIST_INDENT_STEP_PT, Math.max(0, Math.min(...positions)));
  return Math.min(WHOLE_LIST_INDENT_STEP_PT, Math.max(0, MAX_LIST_POSITION_PT - Math.max(...positions)));
}

function shifted(definition: ListDefinition, deltaPt: number): ListDefinition | null {
  const clamp = (value: number) =>
    Math.min(MAX_LIST_POSITION_PT, Math.max(0, Math.round((value + deltaPt) * 100) / 100));
  return normalizeListDefinition({
    levels: definition.levels.map((level) => ({
      ...level,
      alignAtPt: clamp(level.alignAtPt),
      indentPt: clamp(level.indentPt),
    })),
  });
}

/**
 * Every top-level ordered list of the numbering `root` starts, in document
 * order: the root, the page-split fragments that carry it on and the lists
 * that continue it ("Continue from previous list", or the same Word numbering
 * instance). The same walk the markers count with (listDefinitionMarkers.ts
 * visitOrderedRoot); a root not met at the top level is alone.
 */
function numberingLists(doc: PmNode, rootPos: number): number[] {
  let next = 0;
  let lastRoot: number | null = null;
  const byChain = new Map<string, number>();
  const instanceAt = new Map<number, number>();
  doc.descendants((node, pos) => {
    if (node.type.name === "bulletList" || node.type.name === "taskList") return false;
    if (node.type.name !== "orderedList") return true;
    const chain = normalizeListChain(node.attrs.listChain);
    const joined =
      !fragmentCarries("listLabel", node.attrs)
        ? lastRoot
        : node.attrs.listContinue === true
          ? ((chain ? byChain.get(chain) : undefined) ?? lastRoot)
          : null;
    const instance = joined ?? next++;
    instanceAt.set(pos, instance);
    lastRoot = instance;
    if (chain) byChain.set(chain, instance);
    return false;
  });
  const instance = instanceAt.get(rootPos);
  if (instance === undefined) return [rootPos];
  return [...instanceAt].filter(([, value]) => value === instance).map(([pos]) => pos);
}

/** Whether Increase (1) / Decrease (-1) Indent moves the whole list here. */
export function canIndentWholeList(state: EditorState, direction: 1 | -1): boolean {
  const root = wholeListAtSelection(state);
  if (!root) return false;
  const definition = definitionOf(root.node);
  return definition !== null && allowedShiftPt(definition, direction) !== 0;
}

/**
 * Move the whole numbering the selection's first item starts, one step in
 * `direction`. False (nothing changed) when the selection is not at a
 * numbering's first item or the list cannot move further that way.
 */
export function indentWholeList(
  state: EditorState,
  tr: Transaction,
  direction: 1 | -1,
): boolean {
  const root = wholeListAtSelection(state);
  if (!root) return false;
  const rootDefinition = definitionOf(root.node);
  if (!rootDefinition) return false;
  const deltaPt = allowedShiftPt(rootDefinition, direction);
  if (deltaPt === 0) return false;
  for (const pos of numberingLists(state.doc, root.pos)) {
    const list = tr.doc.nodeAt(pos);
    if (!list || list.type.name !== "orderedList") continue;
    const base = definitionOf(list);
    const definition = base ? shifted(base, deltaPt) : null;
    if (!definition) continue;
    // The list now differs from any list style it came from: it keeps its
    // own definition, as every other definition edit here leaves it.
    tr.setNodeMarkup(pos, undefined, {
      ...list.attrs,
      listDefinition: definition,
      listStyleType: listStyleTypeForDefinition(definition),
      listStyleId: null,
    });
    // One definition numbers the list's levels: a nested gallery level drops
    // the scheme it drew itself with, as Define New Multilevel List does.
    list.descendants((child, offset) => {
      if (child.type.name !== "orderedList") return true;
      if (normalizeListDefinition(child.attrs.listDefinition)) return false;
      if (child.attrs.listStyleType !== DEFAULT_LIST_STYLE) {
        tr.setNodeMarkup(pos + 1 + offset, undefined, {
          ...child.attrs,
          listStyleType: DEFAULT_LIST_STYLE,
          listStyleId: null,
        });
      }
      return true;
    });
  }
  return true;
}
