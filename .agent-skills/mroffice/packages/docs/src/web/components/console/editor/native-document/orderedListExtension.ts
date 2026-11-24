/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Ordered-list extension carrying a Word/WPS multilevel numbering STYLE.
 *
 * It extends TipTap's stock `OrderedList` (StarterKit's is disabled in the
 * plugin registry) with one persisted attribute — `listStyleType` — that picks
 * how the item markers are computed from the nesting depth (see
 * {@link listNumbering}). The attribute round-trips as a `data-list-style`
 * HTML attribute on the `<ol>`; the CSS in styles/note-editor.css keys its
 * counter content off that attribute, so the on-screen rendering matches the
 * exporter's numbering.xml.
 *
 * ADDITIVE: an ordered list with no `data-list-style` (or the default
 * "decimal") behaves exactly as the plain decimal list always has.
 */

import { toggleListInSelectedCells } from "@mrnote/core/web/components/console/editor/native-document/cellSelectionLists.ts";
import type { CommandProps } from "@tiptap/core";
import { toggleListOffAtAnyLevel, togglePartOfOtherList } from "./partialListToggle";
import { OrderedList } from "@tiptap/extension-list";
import { Plugin } from "@tiptap/pm/state";
import { listStyleTypeFromHtml, splitOrderedListsAtItemValues } from "./orderedListHtml";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";

import {
  DEFAULT_LIST_START,
  DEFAULT_LIST_STYLE,
  MAX_LIST_START,
  type ListStyleType,
  lvlJcForLevel,
  lvlTextForLevel,
  normalizeListStart,
  normalizeListStyleType,
  numFmtForLevel,
} from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import {
  listDefinitionsEqual,
  listStyleTypeForDefinition,
  normalizeListDefinition,
  presetListDefinition,
  splitLevelText,
  withNumberFormat,
  type ListDefinition,
  type ListLevelFormat,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import {
  toggleListAroundHeadings,
  explicitOrderedListLevel,
  headingListAtSelection,
  normalizeListChain,
  probeListNumbering,
  selectedHeadings,
} from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import {
  listParagraphSpacingInputRules,
  withListParagraphSpacing,
} from "@mrnote/core/web/components/console/editor/native-document/listParagraphSpacing.ts";
import { gateInputRulesByAutoCorrect } from "./autoCorrectSettings";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    orderedListNumbering: {
      /** Set the numbering style of the ordered list at the selection. */
      setOrderedListStyle: (style: ListStyleType) => ReturnType;
      /**
       * Set the START ordinal of the ordered list at the selection (Word
       * "Restart numbering at N" / "Continue from N"). `null`, or a value that
       * normalizes to the default 1, RESTARTS the list at 1 (clears the
       * override). A value ≥ 2 makes the list count from there.
       */
      setOrderedListStart: (start: number | null) => ReturnType;
      /**
       * Give the list at the selection a nine-level Word definition (Define
       * New Number Format / Multilevel List / List Style). The definition
       * lives on the OUTERMOST ordered list; nested ordered lists are its
       * levels 2..9, as one Word numbering instance. `null` returns the list to
       * its gallery style.
       */
      setOrderedListDefinition: (
        definition: ListDefinition | null,
        options?: { styleId?: string | null },
      ) => ReturnType;
      /**
       * Word's Set Numbering Value at the selected item: "Start new list"
       * (value), "Continue from previous list", or "Advance value (skip
       * numbers)" (value). A start or advance at an item other than the first
       * splits the list there, as Word starts the new numbering at that item.
       */
      setListNumberingValue: (
        mode: "new" | "continue" | "advance",
        value: number | null,
      ) => ReturnType;
    };
  }
}

export const DocumentOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyleType: {
        default: DEFAULT_LIST_STYLE,
        parseHTML: (element) => {
          const own =
            element.getAttribute("data-list-style") ??
            element.getAttribute("data-list-base-style");
          // The editor's own markup, else standard HTML (`type="A"`).
          return own ? normalizeListStyleType(own) : listStyleTypeFromHtml(element);
        },
        renderHTML: (attributes) => {
          const style = normalizeListStyleType(attributes.listStyleType);
          // A defined list paints its own markers (listDefinitionMarkers); the
          // gallery counter CSS must not draw a second set, so its scheme is
          // kept only as the parse fallback.
          if (normalizeListDefinition(attributes.listDefinition)) {
            return style === DEFAULT_LIST_STYLE
              ? {}
              : { "data-list-base-style": style };
          }
          // Keep the plain decimal list byte-for-byte: no extra attribute (it
          // renders through the native `list-style`, which honors `start` on
          // its own).
          if (style === DEFAULT_LIST_STYLE) return {};
          // The CSS counter these schemes render with cannot read the `start`
          // attribute, so publish the seed (start - 1) as a custom property.
          const start = normalizeListStart(attributes.start);
          return {
            "data-list-style": style,
            ...(start !== null ? { style: `--ml-list-start:${start - 1}` } : {}),
          };
        },
      },
      /** Word's nine-level list definition (listLevelDefinition.ts). */
      listDefinition: {
        default: null,
        parseHTML: (element) =>
          normalizeListDefinition(element.getAttribute("data-list-definition")),
        renderHTML: (attributes) => {
          const definition = normalizeListDefinition(attributes.listDefinition);
          return definition
            ? { "data-list-definition": JSON.stringify(definition) }
            : {};
        },
      },
      /** The document list style (doc.attrs.listStyles id) this list uses. */
      listStyleId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-list-style-id"),
        renderHTML: (attributes) =>
          typeof attributes.listStyleId === "string" && attributes.listStyleId
            ? { "data-list-style-id": attributes.listStyleId }
            : {},
      },
      /** "Continue from previous list": join the previous numbering, live. */
      listContinue: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-list-continue") === "true",
        renderHTML: (attributes) =>
          attributes.listContinue === true
            ? { "data-list-continue": "true" }
            : {},
      },
      /**
       * The definition level (Word's `w:ilvl`, 0-8) this list's items are
       * drawn at, when its nesting does not say it: an imported list whose
       * first item is at level 2 after a paragraph, or a level skipped in
       * the source. Null: the level its nesting gives it.
       */
      listLevel: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-list-level");
          const value = raw === null ? Number.NaN : Number(raw);
          return Number.isInteger(value) && value >= 0 && value <= 8 ? value : null;
        },
        renderHTML: (attributes) => {
          const value = attributes.listLevel;
          return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8
            ? { "data-list-level": String(value) }
            : {};
        },
      },
      /** Word numbering instance shared with numbered headings (numId). */
      listChain: {
        default: null,
        parseHTML: (element) =>
          normalizeListChain(element.getAttribute("data-list-chain")),
        renderHTML: (attributes) => {
          const chain = normalizeListChain(attributes.listChain);
          return chain ? { "data-list-chain": chain } : {};
        },
      },
    };
  },

  addInputRules() {
    return gateInputRulesByAutoCorrect(listParagraphSpacingInputRules(this.parent?.() ?? []), "automaticNumberedLists");
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          // `<li value>` jumps become lists that start at the value.
          transformPastedHTML: (html: string) => splitOrderedListsAtItemValues(html),
        },
      }),
    ];
  },

  addCommands() {
    const parent = this.parent?.() as Record<
      string,
      (...args: unknown[]) => (props: CommandProps) => boolean
    >;
    const name = this.name;
    return {
      ...parent,
      // Word keeps a heading a heading when Numbering is applied to it, and
      // gives a paragraph List Paragraph's spacing.
      toggleOrderedList:
        () =>
        (props: CommandProps) => {
          const one = () =>
            props.commands.toggleHeadingList("ordered") ||
            toggleListAroundHeadings(props, "ordered", () =>
              withListParagraphSpacing(props, () => parent.toggleOrderedList()(props)),
            ) ||
            // Some items of a list of the other kind: only they change (Word).
            togglePartOfOtherList(props, "orderedList") ||
            // Items of a list of this kind leave it, at any level (WUA 036).
            withListParagraphSpacing(props, () => toggleListOffAtAnyLevel(props, "orderedList")) ||
            withListParagraphSpacing(props, () => parent.toggleOrderedList()(props));
          // Cells selected as cells each take the list (WUA 243).
          return toggleListInSelectedCells(props, "orderedList", one) ?? one();
        },
      setOrderedListStyle:
        (style: ListStyleType) =>
        ({ commands, state, tr, dispatch }: CommandProps) => {
          if (headingListAtSelection(state) && selectedHeadings(state))
            return commands.setHeadingListStyle("ordered", normalizeListStyleType(style));
          const normalized = normalizeListStyleType(style);
          // A Multilevel List gallery entry defines every level of the list
          // it is picked in, whichever level the caret is on: Word gives the
          // whole numbering instance the new definition, so a level-2 item
          // reads "a." at once instead of restarting the scheme at "1.".
          const root = MULTILEVEL_SCHEMES.has(normalized)
            ? numberingRootAtSelection(state)
            : null;
          if (root) {
            if (dispatch) applySchemeToNumbering(tr, root, normalized);
            return true;
          }
          // A Numbering Library format picked inside a multilevel numbering
          // changes the number style of the level the caret is at, as Word
          // does; the numbering keeps its other levels, so Enter + Tab under
          // "1." still reads "1.1." instead of falling back to 1. / a) / i.
          const levelChange = numberingLevelFormatChange(state, normalized);
          if (levelChange) {
            if (dispatch) {
              applyDefinitionToNumbering(tr, levelChange.root, levelChange.definition);
            }
            return true;
          }
          return commands.updateAttributes(name, {
            listStyleType: normalizeListStyleType(style),
            listDefinition: null,
            listStyleId: null,
          });
        },
      setOrderedListStart:
        (start: number | null) =>
        ({ commands }: CommandProps) =>
          commands.updateAttributes(name, {
            // normalizeListStart returns null for "1"/absent → store the default
            // (TipTap's OrderedList `start` default), which renders no `start`
            // attribute (byte-stable). A value ≥ 2 is stored verbatim.
            start: normalizeListStart(start) ?? DEFAULT_LIST_START,
          }),
      setOrderedListDefinition:
        (definition: ListDefinition | null, options?: { styleId?: string | null }) =>
        ({ state, tr, dispatch, commands }: CommandProps) => {
          const normalized = definition ? normalizeListDefinition(definition) : null;
          if (definition && !normalized) return false;
          if (selectedHeadings(state))
            return commands.setHeadingListDefinition(normalized);
          const root = outermostOrderedList(state);
          if (!root) return false;
          if (dispatch) {
            tr.setNodeMarkup(root.pos, undefined, {
              ...root.node.attrs,
              listDefinition: normalized,
              listStyleType: normalized
                ? listStyleTypeForDefinition(normalized)
                : root.node.attrs.listStyleType,
              listStyleId: normalized ? (options?.styleId ?? null) : null,
            });
            // One definition numbers the whole tree: nested levels drop theirs.
            root.node.descendants((child, offset) => {
              if (child.type.name !== "orderedList") return true;
              const pos = root.pos + 1 + offset;
              if (child.attrs.listDefinition != null || child.attrs.listStyleType !== DEFAULT_LIST_STYLE)
                tr.setNodeMarkup(pos, undefined, {
                  ...child.attrs,
                  listDefinition: null,
                  listStyleType: DEFAULT_LIST_STYLE,
                  listStyleId: null,
                });
              return true;
            });
          }
          return true;
        },
      setListNumberingValue:
        (mode: "new" | "continue" | "advance", value: number | null) =>
        ({ state, tr, dispatch }: CommandProps) =>
          applyListNumberingValue(state, tr, dispatch, mode, value),
    };
  },
});

/** The Multilevel List gallery schemes: each numbers every level differently. */
const MULTILEVEL_SCHEMES: ReadonlySet<ListStyleType> = new Set<ListStyleType>([
  "decimal-outline",
  "multi-level",
]);

/**
 * The first list of the numbering the selection's innermost ordered list
 * belongs to: its levels are ordered lists nested item by item, up to a list
 * that carries its own definition (a numbering of its own). Null outside an
 * ordered list; tables and other list kinds bound the climb.
 */
function numberingRootAtSelection(
  state: EditorState,
): { pos: number; node: PmNode } | null {
  const $from = state.selection.$from;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== "orderedList") {
    const name = $from.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") return null;
    depth -= 1;
  }
  if (depth <= 0) return null;
  while (
    depth > 2 &&
    !normalizeListDefinition($from.node(depth).attrs.listDefinition) &&
    $from.node(depth - 1).type.name === "listItem" &&
    $from.node(depth - 2).type.name === "orderedList"
  ) {
    depth -= 2;
  }
  return { pos: $from.before(depth), node: $from.node(depth) };
}

/** The numbering the selection is in, with the 0-based level of its list. */
function numberingLevelAtSelection(
  state: EditorState,
): { root: { pos: number; node: PmNode }; level: number } | null {
  const root = numberingRootAtSelection(state);
  if (!root) return null;
  const $from = state.selection.$from;
  // A defined numbering knows the level it draws the item at (Word's
  // `w:ilvl`, which an imported list need not start at 0).
  const drawn = probeListNumbering(state.doc).levels.get($from.before($from.depth));
  if (drawn !== undefined && normalizeListDefinition(root.node.attrs.listDefinition))
    return { root, level: drawn };
  let level = explicitOrderedListLevel(root.node) ?? 0;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.before(depth) === root.pos) return { root, level };
    if ($from.node(depth).type.name === "orderedList") {
      // Count the lists below the root; the innermost is the caret's own.
      level += 1;
    }
  }
  return null;
}

/**
 * The definition a Numbering Library pick gives a MULTILEVEL numbering (a
 * 1. / 1.1. / 1.1.1. or 1. / a. / i. gallery scheme, or a defined list):
 * Word changes only the level the selection is at ("Define new bullets,
 * numbers and multilevel lists": a number format applies to the chosen
 * level; ECMA-376 §17.9.6 / §17.9.11 w:numFmt and w:lvlText of that one
 * w:lvl) and every other level keeps its w:lvlText, so "%1.%2." survives a
 * "1." picked on level 1. Null for a plain single-scheme list, which the
 * gallery restyles as before, and when nothing would change.
 */
function numberingLevelFormatChange(
  state: EditorState,
  style: ListStyleType,
): { root: { pos: number; node: PmNode }; definition: ListDefinition | null } | null {
  const at = numberingLevelAtSelection(state);
  if (!at) return null;
  const own = normalizeListDefinition(at.root.node.attrs.listDefinition);
  const scheme = normalizeListStyleType(at.root.node.attrs.listStyleType);
  if (!own && !MULTILEVEL_SCHEMES.has(scheme)) return null;
  const current = own ?? normalizeListDefinition(presetListDefinition(scheme));
  if (!current) return null;
  const literal = splitLevelText(lvlTextForLevel(style, 0), 0);
  if (!literal) return null;
  const next = withNumberFormat(current, at.level, {
    format: numFmtForLevel(style, 0) as ListLevelFormat,
    prefix: literal.prefix,
    suffix: literal.suffix,
    align: lvlJcForLevel(style, 0),
  });
  if (!next) return null;
  // Picking the format the level already has leaves the numbering as it is.
  if (listDefinitionsEqual(next, current)) return { root: at.root, definition: null };
  return { root: at.root, definition: next };
}

/** One definition numbers a numbering's lists: nested levels drop theirs. */
function applyDefinitionToNumbering(
  tr: Transaction,
  root: { pos: number; node: PmNode },
  definition: ListDefinition | null,
): void {
  if (!definition) return;
  tr.setNodeMarkup(root.pos, undefined, {
    ...root.node.attrs,
    listDefinition: definition,
    listStyleType: listStyleTypeForDefinition(definition),
    listStyleId: null,
  });
  const visitLevels = (list: PmNode, listPos: number) => {
    list.forEach((item, itemOffset) => {
      if (item.type.name !== "listItem") return;
      const itemPos = listPos + 1 + itemOffset;
      item.forEach((child, childOffset) => {
        if (child.type.name !== "orderedList") return;
        // A nested list with a definition of its own is another numbering.
        if (normalizeListDefinition(child.attrs.listDefinition)) return;
        const childPos = itemPos + 1 + childOffset;
        if (child.attrs.listStyleType !== DEFAULT_LIST_STYLE) {
          tr.setNodeMarkup(childPos, undefined, {
            ...child.attrs,
            listStyleType: DEFAULT_LIST_STYLE,
            listStyleId: null,
          });
        }
        visitLevels(child, childPos);
      });
    });
  };
  visitLevels(root.node, root.pos);
}

/** Give a numbering's lists one gallery scheme (their levels follow it). */
function applySchemeToNumbering(
  tr: Transaction,
  root: { pos: number; node: PmNode },
  style: ListStyleType,
): void {
  const restyle = (pos: number, node: PmNode) =>
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listStyleType: style,
      listDefinition: null,
      listStyleId: null,
    });
  restyle(root.pos, root.node);
  const visitLevels = (list: PmNode, listPos: number) => {
    list.forEach((item, itemOffset) => {
      if (item.type.name !== "listItem") return;
      const itemPos = listPos + 1 + itemOffset;
      item.forEach((child, childOffset) => {
        if (child.type.name !== "orderedList") return;
        // A nested list with a definition of its own is another numbering.
        if (normalizeListDefinition(child.attrs.listDefinition)) return;
        const childPos = itemPos + 1 + childOffset;
        restyle(childPos, child);
        visitLevels(child, childPos);
      });
    });
  };
  visitLevels(root.node, root.pos);
}

/** The outermost ordered list around the selection (tables bound the search). */
export function outermostOrderedList(
  state: EditorState,
): { pos: number; node: PmNode } | null {
  const $from = state.selection.$from;
  let found: { pos: number; node: PmNode } | null = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") break;
    if (node.type.name === "orderedList") found = { pos: $from.before(depth), node };
  }
  return found;
}

/**
 * The item of the innermost ordered list at the selection: the list, its
 * position, the item's index, and whether the list is a numbering root (not
 * nested in another list's item).
 */
export function orderedListItemAtSelection(state: EditorState): {
  list: PmNode;
  listPos: number;
  index: number;
  root: boolean;
} | null {
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") return null;
    if (node.type.name !== "orderedList") continue;
    let root = true;
    for (let above = depth - 1; above > 0; above -= 1) {
      const name = $from.node(above).type.name;
      if (name === "listItem" || name === "taskItem") root = false;
      if (name === "tableCell" || name === "tableHeader") break;
    }
    return {
      list: node,
      listPos: $from.before(depth),
      index: $from.index(depth),
      root,
    };
  }
  return null;
}

function applyListNumberingValue(
  state: EditorState,
  tr: Transaction,
  dispatch: ((tr: Transaction) => void) | undefined,
  mode: "new" | "continue" | "advance",
  value: number | null,
): boolean {
  const start =
    value === null
      ? null
      : Number.isInteger(value) && value >= 0 && value <= MAX_LIST_START
        ? value
        : undefined;
  if (start === undefined || (mode !== "continue" && start === null)) return false;
  const heading = headingListAtSelection(state);
  if (heading) {
    if (heading.node.attrs.listKind !== "ordered") return false;
    if (dispatch)
      tr.setNodeMarkup(heading.pos, undefined, {
        ...heading.node.attrs,
        listContinue: mode === "continue",
        listStart: mode === "continue" ? null : start,
      });
    return true;
  }
  const at = orderedListItemAtSelection(state);
  if (!at) return false;
  if (mode === "continue") {
    // Only a list's first item can join the previous list; a later item
    // already continues its own list.
    if (at.index > 0) return true;
    if (!at.root) return false;
    if (dispatch)
      tr.setNodeMarkup(at.listPos, undefined, {
        ...at.list.attrs,
        listContinue: true,
        start: DEFAULT_LIST_START,
      });
    return true;
  }
  if (!dispatch) return true;
  let listPos = at.listPos;
  const original = at.list;
  // The pages may have cut this list into fragments. A new numbering that
  // starts here ends that one list: the fragment it starts is a list of its
  
  // second page's first item kept counting from the first page).
  const pageContinued = !fragmentCarries("listLabel", original.attrs);
  const continuesOn = original.attrs[SPLIT_CONTINUES_ATTR] === true;
  if (at.index > 0) {
    // The new numbering begins at this item: split the list in front of it.
    let itemPos = at.listPos + 1;
    for (let index = 0; index < at.index; index += 1)
      itemPos += at.list.child(index).nodeSize;
    tr.split(itemPos, 1);
    listPos = tr.mapping.map(itemPos) - 1;
    // The half before the split no longer runs on to another page.
    const before = tr.doc.nodeAt(at.listPos);
    if (before && continuesOn) {
      tr.setNodeMarkup(at.listPos, undefined, { ...before.attrs, [SPLIT_CONTINUES_ATTR]: false });
    }
  } else if (pageContinued && !itemContinuesFromPageBefore(original)) {
    const previous = blockOnPageBefore(tr.doc, at.listPos);
    if (previous?.node.type === original.type && previous.node.attrs[SPLIT_CONTINUES_ATTR] === true) {
      tr.setNodeMarkup(previous.pos, undefined, { ...previous.node.attrs, [SPLIT_CONTINUES_ATTR]: false });
    }
  }
  const list = tr.doc.nodeAt(listPos);
  if (!list || list.type.name !== "orderedList") return false;
  const startsNewList = at.index > 0 || !itemContinuesFromPageBefore(original);
  tr.setNodeMarkup(listPos, undefined, {
    ...list.attrs,
    listContinue: false,
    start: start === null ? DEFAULT_LIST_START : start,
    ...(startsNewList
      ? { [SPLIT_CONTINUATION_ATTR]: false, [SPLIT_CONTINUES_ATTR]: continuesOn }
      : {}),
  });
  return true;
}

/** The list's first item is the rest of an item the page before began. */
function itemContinuesFromPageBefore(list: PmNode): boolean {
  return list.firstChild?.attrs?.pageSplitItemContinuation === true;
}

/** The last block of the sheet before, when the list at `pos` opens its sheet. */
function blockOnPageBefore(doc: PmNode, pos: number): { node: PmNode; pos: number } | null {
  const $pos = doc.resolve(pos);
  if ($pos.index() !== 0 || $pos.parent.type.name !== "pageBlock" || $pos.depth < 1) return null;
  const sheetPos = $pos.before();
  const $sheet = doc.resolve(sheetPos);
  if ($sheet.index() === 0) return null;
  const node = $sheet.parent.child($sheet.index() - 1).lastChild;
  return node ? { node, pos: sheetPos - 1 - node.nodeSize } : null;
}

export default DocumentOrderedList;
