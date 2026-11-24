/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ChainedCommands } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { liftTarget } from "@tiptap/pm/transform";
import type { BulletStyleType } from "@mrnote/core/web/components/console/editor/native-document/bulletListStyle.ts";
import type { DocumentListDialogResult } from "./DocumentListDefinitionDialogs";
import { headingListAtSelection, selectedHeadings } from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import {
  normalizeDocumentListStyles,
  presetListDefinition,
  withNumberFormat,
  type ListDefinition,
  type ListLevelFormat,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import type { ListStyleType } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import {
  stripTypedListMarkers,
  type TypedListMarkerKind,
  type TypedListMarkerPlan,
} from "./typedListMarkers";

/**
 * The blocks a list cannot hold: a floating shape, a media frame and a
 * signature line stand beside the paragraphs, anchored to one (Word applies
 * Bullets to the paragraphs, never to the drawing), and the page's save
 * refuses each inside a list ("documentShape nodes are not allowed inside
 * lists") -- for the whole page. A selection dragged across one and given
 * Bullets or Numbering wrapped it with the paragraphs.
 */
const UNLISTABLE_BLOCKS = new Set(["documentShape", "documentMedia", "documentSignatureLine"]);

/** Lift every unlistable block a list command wrapped back out of its list. */
export function liftUnlistableBlocks(tr: Transaction): void {
  for (let guard = 0; guard < 256; guard += 1) {
    let lifted = false;
    tr.doc.descendants((node, pos) => {
      if (lifted) return false;
      if (!UNLISTABLE_BLOCKS.has(node.type.name)) return true;
      const $from = tr.doc.resolve(pos);
      let item = -1;
      for (let depth = $from.depth; depth > 0 && item < 0; depth -= 1) {
        const name = $from.node(depth).type.name;
        if (name === "listItem" || name === "taskItem") item = depth;
      }
      if (item < 0) return false;
      // The block and everything after it in its list item leave together: a
      // list item starts with a paragraph, so the blocks after the shape
      // cannot stay behind as an item of their own.
      const range = $from.blockRange(tr.doc.resolve($from.end(item)));
      const target = range ? liftTarget(range) : null;
      if (range && typeof target === "number") {
        tr.lift(range, target);
        lifted = true;
      }
      return false;
    });
    if (!lifted) return;
  }
}

/** Run a list command's chain, with any unlistable block it took lifted out. */
function runListChain(chain: ChainedCommands): boolean {
  return chain
    .command(({ tr }) => {
      liftUnlistableBlocks(tr);
      return true;
    })
    .run();
}

/** The list-definition number format of each typed marker kind. */
const TYPED_MARKER_LEVEL_FORMAT = {
  decimal: "decimal",
  "lower-alpha": "lowerLetter",
  "upper-alpha": "upperLetter",
  "lower-roman": "lowerRoman",
  "upper-roman": "upperRoman",
} as const satisfies Record<Exclude<TypedListMarkerKind, "bullet">, ListLevelFormat>;

/**
 * Home > Bullets on the chain's selection. Word's Numbering and Bullets on
 * paragraphs that begin with a typed marker ("1.测试", "a.", "一、", "• "):
 * the typed marker goes, in the same Undo step as the list. Pressed again
 * (the selection already in a bullet list) it takes the list off.
 */
export function runBulletsButton(chain: ChainedCommands, inBulletList: boolean): boolean {
  if (inBulletList) return runListChain(chain.toggleBulletList());
  let beside: AdjacentLists | null = null;
  chain.command(({ tr }) => {
    stripTypedListMarkers(tr);
    beside = adjacentLists(tr, "bulletList");
    return true;
  });
  chain.toggleBulletList().command(({ tr }) => {
    if (beside) keepAdjacentListsApart(tr, beside);
    return true;
  });
  return runListChain(chain);
}

/** The bullet lists right before and after the selected paragraphs, as they were. */
interface AdjacentLists {
  depth: number;
  items: number;
  before: PmNode | null;
  after: PmNode | null;
}

function adjacentLists(tr: Transaction, listName: string): AdjacentLists | null {
  const { $from, $to } = tr.selection;
  const range = $from.blockRange($to);
  if (!range) return null;
  const nodeBefore = tr.doc.resolve(range.start).nodeBefore;
  const nodeAfter = tr.doc.resolve(range.end).nodeAfter;
  const before = nodeBefore?.type.name === listName ? nodeBefore : null;
  const after = nodeAfter?.type.name === listName ? nodeAfter : null;
  if (!before && !after) return null;
  return { depth: range.depth, items: range.endIndex - range.startIndex, before, after };
}

/** Whether two lists draw alike: the same attributes but their identity. */
function sameLook(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("block_id");
  return [...keys].every((key) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null));
}

/**
 * Bullets on paragraphs beside a bullet list of another look: Word gives the
 * paragraphs a list of their own (its current bullet, a `w:numId` of their
 * own) and the list beside them keeps its bullets, numbering and identity.
 * ProseMirror's toggle joins any adjacent list of the same kind, and the
 * joined list takes the first one's attributes: the paragraphs after it in a
 * Wingdings list were drawn and saved with the new list's bullet and numbering
 * (corpus R485-D93 E51: two untouched items went from numId 4 to 6). The
 * joined list is split back where the lists met; lists that look alike stay
 * joined, one list continuing.
 */
function keepAdjacentListsApart(tr: Transaction, beside: AdjacentLists): void {
  const { $from } = tr.selection;
  const depth = beside.depth + 1;
  if ($from.depth < depth) return;
  const list = $from.node(depth);
  const before = beside.before;
  const after = beside.after;
  const listType = before?.type ?? after?.type;
  if (!listType || list.type !== listType) return;
  const fresh = listType.create().attrs as Record<string, unknown>;
  const extra = list.childCount - beside.items;
  const tookBefore =
    !!before &&
    (extra === before.childCount + (after?.childCount ?? 0) ||
      (extra === before.childCount && (!after || sameLook(list.attrs, before.attrs))));
  const tookAfter = !!after && extra === (tookBefore ? before!.childCount : 0) + after.childCount;
  if (!tookBefore && !tookAfter) return;
  const listPos = $from.before(depth);
  const offsetOf = (index: number) => {
    let offset = listPos + 1;
    for (let i = 0; i < index; i += 1) offset += list.child(i).nodeSize;
    return offset;
  };
  // The paragraphs' own list draws as a new one would; the joined node wears
  // the first list's attributes.
  const ownLook = tookBefore ? fresh : (list.attrs as Record<string, unknown>);
  const firstNew = tookBefore ? before!.childCount : 0;
  if (tookAfter && !sameLook(after!.attrs, ownLook)) {
    tr.split(offsetOf(firstNew + beside.items), 1, [{ type: listType, attrs: after!.attrs }]);
  }
  if (tookBefore && !sameLook(before!.attrs, ownLook)) {
    tr.split(offsetOf(firstNew), 1, [{ type: listType, attrs: { ...fresh, block_id: null } }]);
  }
}

/** Home > Checklist on the chain's selection (on, or off again). */
export function runChecklistButton(chain: ChainedCommands): boolean {
  return runListChain(chain.toggleTaskList());
}

/**
 * Home > Numbering on the chain's selection: typed markers go and the list
 * numbers the paragraphs in the markers' own format ("a." stays lower-alpha,
 * "1、" keeps its punctuation after the number).
 */
export function runNumberingButton(chain: ChainedCommands, inOrderedList: boolean): boolean {
  if (inOrderedList) return runListChain(chain.toggleOrderedList());
  let plan: TypedListMarkerPlan | null = null;
  chain
    .command(({ tr }) => {
      plan = stripTypedListMarkers(tr);
      return true;
    })
    .toggleOrderedList()
    .command(({ commands }) => {
      const typed = plan as TypedListMarkerPlan | null;
      if (!typed || typed.kind === "bullet") return true;
      const style = typed.kind;
      if (typed.suffix === "." || typed.suffix === null) {
        return style === "decimal" ? true : commands.setOrderedListStyle(style);
      }
      // "1、" and "1．": the typed punctuation stays after the number.
      const definition = withNumberFormat(presetListDefinition(style), 0, {
        format: TYPED_MARKER_LEVEL_FORMAT[style],
        prefix: "",
        suffix: typed.suffix,
        align: "left",
      });
      return definition ? commands.setOrderedListDefinition(definition) : true;
    });
  return runListChain(chain);
}

/**
 * A Bullet Library tile: the selection becomes a bullet list (typed markers
 * go, as with the Bullets button) and takes the tile's glyph.
 */
export function runBulletLibraryButton(
  chain: ChainedCommands,
  inBulletList: boolean,
  style: BulletStyleType,
): boolean {
  // A library entry replaces typed "1." / "•" markers (Word).
  if (!inBulletList) {
    chain.command(({ tr }) => {
      stripTypedListMarkers(tr);
      return true;
    });
    chain.toggleBulletList();
  }
  return runListChain(chain.setBulletListStyle(style));
}

/**
 * A Numbering Library or Multilevel List tile: the selection becomes a
 * numbered list in the tile's scheme, or takes a document list style
 * (Define New List Style) when `listStyle` is given.
 */
export function runNumberingLibraryButton(
  chain: ChainedCommands,
  inOrderedList: boolean,
  scheme:
    | { style: ListStyleType }
    | { listStyle: { id: string; definition: ListDefinition } },
): boolean {
  if (!inOrderedList) {
    chain.command(({ tr }) => {
      stripTypedListMarkers(tr);
      return true;
    });
    chain.toggleOrderedList();
  }
  if ("style" in scheme) return runListChain(chain.setOrderedListStyle(scheme.style));
  return runListChain(
    chain.setOrderedListDefinition(scheme.listStyle.definition, { styleId: scheme.listStyle.id }),
  );
}

/** The ordered lists standing right before and after the selection's blocks,
 * which the list toggle joins them to (see keepNewListApart). */
interface OrderedNeighbours {
  /** Items of the list before; null when no ordered list stands there. */
  before: number | null;
  /** The list after: its attributes and its items; null when none. */
  after: { attrs: Record<string, unknown>; items: number } | null;
  /** The selection's blocks, each of which becomes an item. */
  count: number;
}

function orderedNeighbours(state: EditorState): OrderedNeighbours | null {
  const range = state.selection.$from.blockRange(state.selection.$to);
  if (!range) return null;
  const prev = range.startIndex > 0 ? range.parent.child(range.startIndex - 1) : null;
  const next = range.endIndex < range.parent.childCount ? range.parent.child(range.endIndex) : null;
  const before = prev?.type.name === "orderedList" ? prev.childCount : null;
  const after = next?.type.name === "orderedList" ? { attrs: next.attrs, items: next.childCount } : null;
  if (before === null && after === null) return null;
  return { before, after, count: range.endIndex - range.startIndex };
}

/**
 * Paragraphs given a number format of their own are a new list: Word's
 * Define New Number Format (Multilevel List, List Style) on a paragraph
 * beside a numbered list numbers that paragraph alone and leaves the list
 * as it is. The list toggle joins the new list to the ordered lists it
 * touches, so the definition then went to the whole joined list (corpus
 * R473-D86: "notificación" joined the "¿Qué recurso…" list after it, which
 * took the new format and its 36 pt indent). The lists the toggle joined
 * are parted again: the one before keeps its attributes, the one after
 * gets its own back, and the new items stand in a list of their own.
 */
function keepNewListApart(tr: Transaction, neighbours: OrderedNeighbours): void {
  const $pos = tr.selection.$from;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const list = $pos.node(depth);
    if (list.type.name !== "orderedList") continue;
    const lead = neighbours.before ?? 0;
    const tail = neighbours.after?.items ?? 0;
    // Only the shape the toggle's joins leave: anything else is not theirs.
    if (list.childCount !== lead + neighbours.count + tail) return;
    const listPos = $pos.before(depth);
    let fresh: Record<string, unknown>;
    try {
      fresh = list.type.create(null).attrs;
    } catch {
      return;
    }
    const sizeOf = (items: number) => {
      let size = 0;
      for (let index = 0; index < items; index += 1) size += list.child(index).nodeSize;
      return size;
    };
    // The later cut first, so the earlier positions stand.
    if (neighbours.after) {
      const cut = listPos + 1 + sizeOf(lead + neighbours.count);
      tr.split(cut, 1);
      tr.setNodeMarkup(cut + 1, undefined, neighbours.after.attrs);
    }
    let own = listPos;
    if (lead > 0) {
      const cut = listPos + 1 + sizeOf(lead);
      tr.split(cut, 1);
      own = cut + 1;
    }
    tr.setNodeMarkup(own, undefined, fresh);
    return;
  }
}

/**
 * OK of the list dialogs (Define New Bullet / Number Format / Multilevel List
 * / List Style, Set Numbering Value) in one Undo step. Word's list commands
 * turn the selection into a list first; on headings they keep the heading
 * and number it.
 */
export function runListDialogResult(
  chain: ChainedCommands,
  state: EditorState,
  result: DocumentListDialogResult,
  inList: { bulletList: boolean; orderedList: boolean },
  newListStyleId: () => string = () => `ls${Date.now().toString(36)}`,
): boolean {
  const headings = selectedHeadings(state);
  const listedHeading = headingListAtSelection(state);
  const inBullet = !headings && inList.bulletList;
  const inOrdered = headings
    ? listedHeading?.node.attrs.listKind === "ordered"
    : inList.orderedList;
  if (result.kind === "defineBullet") {
    if (headings ? listedHeading?.node.attrs.listKind !== "bullet" : !inBullet) chain.toggleBulletList();
    return result.galleryStyle && result.align === "left"
      ? runListChain(chain.setBulletListStyle(result.galleryStyle))
      : runListChain(chain.setBulletListGlyph(result.glyph, result.font, result.align));
  }
  // (Read before the toggle: what it will join the new list to.)
  const neighbours = !headings && !inOrdered ? orderedNeighbours(state) : null;
  const toggleNewList = () => {
    chain.toggleOrderedList();
    if (neighbours) {
      chain.command(({ tr }) => {
        keepNewListApart(tr, neighbours);
        return true;
      });
    }
  };
  if (result.kind === "defineNumber") {
    if (!inOrdered) toggleNewList();
    chain.setOrderedListDefinition(result.definition);
    // The dialog's Start at is written for headings too, as Set
    
    if (headings) chain.setListNumberingValue("new", result.start);
    else chain.setOrderedListStart(result.start);
    return runListChain(chain);
  }
  if (result.kind === "defineMultilevel") {
    if (!inOrdered) toggleNewList();
    return runListChain(chain.setOrderedListDefinition(result.definition));
  }
  if (result.kind === "defineListStyle") {
    const existing = normalizeDocumentListStyles(state.doc.attrs.listStyles);
    const id = newListStyleId();
    chain.setDocumentListStyles([
      ...existing.filter((style) => style.name !== result.name),
      { id, name: result.name, definition: result.definition },
    ]);
    if (!inOrdered) toggleNewList();
    return runListChain(chain.setOrderedListDefinition(result.definition, { styleId: id }));
  }
  return runListChain(chain.setListNumberingValue(result.mode, result.value));
}
