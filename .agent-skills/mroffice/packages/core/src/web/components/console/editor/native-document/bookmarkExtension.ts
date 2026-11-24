"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, Node, mergeAttributes } from "@tiptap/core";
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, TextSelection, type EditorState, type Selection, type Transaction } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { Fragment, Slice } from "@tiptap/pm/model";
import {
  BOOKMARK_MARK_NAME,
  BOOKMARK_POINT_NODE_NAME,
  collectBookmarks,
  dedupeBookmarkName,
  isHiddenReferenceBookmarkName,
  sanitizeBookmarkName,
  type DocBookmark,
} from "./bookmarks";
import { DELETION_MARK_NAME, isPointInTrackedDeletion } from "./trackChanges";
import {
  enclosingAnchorMarks,
  pasteLeavingRange,
  withTextMarks,
  withinLeavingRange,
  type PasteLeavingRange,
} from "./pasteAnchors";

/**
 * Document BOOKMARKS (Word/WPS "Insert → Bookmark" + "Go To") — TipTap wiring.
 *
 * ADDITIVE: registering this extension adds ONE inline mark ("bookmark") carrying
 * a sanitized `name`. The mark round-trips through the document schema's open
 * `marks` passthrough (see lib/native-page-schemas → documentDocAttrsSchema), so
 * EXISTING documents — which carry none — still validate and load byte-for-byte
 * unchanged. There is no flag: the feature is purely opt-in per user action
 * (selecting text + inserting a bookmark); a document with no bookmarks behaves
 * exactly as before.
 *
 * Unlike comments, there is NO doc-level store: the name lives on the mark, so the
 * content is the single source of truth (deleting a marked range removes the
 * bookmark, never leaving a dangling record). The "Go To" panel re-resolves a
 * name's position against the CURRENT doc at click time, so a stale/deleted name
 * is a safe no-op.
 *
 * SECURITY: the mark renders ONLY a sanitized `data-bookmark-name` attribute + a
 * fixed class (no raw HTML). The name passes through sanitizeBookmarkName on every
 * edge (command, parse, render), restricting it to a Word-legal token alphabet so
 * a forged/imported value can never break out of the attribute or inject markup.
 */

/**
 * Window CustomEvent the toolbar's "Insert bookmark" button dispatches. NoteEditor
 * listens for it to prompt for a name and run `addBookmark`. Mirrors
 * ADD_COMMENT_EVENT / INSERT_CROSS_REFERENCE_EVENT.
 */
export const INSERT_BOOKMARK_EVENT = "mrnote:insert-bookmark";

/**
 * Window CustomEvent the toolbar's "Go to bookmark" button dispatches. NoteEditor
 * listens for it to open the bookmark list panel.
 */
export const GO_TO_BOOKMARK_EVENT = "mrnote:go-to-bookmark";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentBookmarks: {
      /**
       * Mark the current selection as a bookmark with the given (sanitized,
       * de-duplicated) name. No-op when the selection is empty or the name scrubs
       * to nothing. A name that collides with an existing bookmark is suffixed
       * (`_2`, `_3`, …) deterministically.
       */
      addBookmark: (name: string) => ReturnType;
      /**
       * Word's Bookmark dialog Add: name the selection (or, on a collapsed
       * caret, the insertion point). A name already in use MOVES to the new
       * location, as Word's Add does; nothing is renamed or suffixed.
       */
      setBookmark: (name: string) => ReturnType;
      /** Strip a bookmark's mark from the document (delete the bookmark). */
      removeBookmark: (name: string) => ReturnType;
      /**
       * Select the document range anchored by a bookmark (caret at its start +
       * scroll into view). No-op for a name that resolves to nothing in the
       * CURRENT doc (a deleted bookmark).
       */
      goToBookmark: (name: string) => ReturnType;
    };
  }
}

/** A [from, to) run anchored by a given bookmark name. */
export interface BookmarkRange {
  from: number;
  to: number;
}

/**
 * Collect every contiguous run of text carrying the bookmark mark for the given
 * (sanitized) name. Returns [] when the name is unusable or unanchored. Adjacent
 * runs that share the name are merged. Mirrors `commentRangesFor`.
 */
export function bookmarkRangesFor(
  doc: ProseMirrorNode,
  name: unknown,
): BookmarkRange[] {
  const target = sanitizeBookmarkName(name);
  if (!target) return [];
  return (bookmarkRangesByName(doc).get(target) ?? []).map(({ from, to }) => ({ from, to }));
}

/**
 * Every bookmark's runs, read in one walk per document version: each REF and
 * PAGEREF field asks after its bookmark on each update of the document (a report of
 * 400 cross-references walked itself 400 times).
 */
const bookmarkRangesByDoc = new WeakMap<ProseMirrorNode, ReadonlyMap<string, readonly BookmarkRange[]>>();

function bookmarkRangesByName(doc: ProseMirrorNode): ReadonlyMap<string, readonly BookmarkRange[]> {
  const known = bookmarkRangesByDoc.get(doc);
  if (known) return known;
  type Run = BookmarkRange & { deleted: boolean };
  const finished = new Map<string, Run[]>();
  const open = new Map<string, Run>();
  const finish = (name: string, run: Run) => {
    const runs = finished.get(name);
    if (runs) runs.push(run);
    else finished.set(name, [run]);
  };
  const close = (name: string) => {
    const run = open.get(name);
    if (!run) return;
    finish(name, run);
    open.delete(name);
  };
  const closeAll = () => {
    for (const [name, run] of open) finish(name, run);
    open.clear();
  };
  doc.descendants((node, pos, parent, index) => {
    // Inline fields (a date field, an inline atom) take the mark like text:
    
    const isPoint = node.type.name === BOOKMARK_POINT_NODE_NAME;
    if (!isPoint && !node.isText && !(node.isInline && node.isLeaf)) {
      closeAll();
      return true;
    }
    const pointName = isPoint ? sanitizeBookmarkName(node.attrs.name) : null;
    let held: Set<string> | null = null;
    for (const mark of node.marks) {
      if (mark.type.name !== BOOKMARK_MARK_NAME) continue;
      const name = sanitizeBookmarkName(mark.attrs.name);
      if (name && name !== pointName) (held ??= new Set()).add(name);
    }
    for (const name of [...open.keys()]) if (!held?.has(name)) close(name);
    if (pointName) {
      finish(pointName, { from: pos, to: pos, deleted: isPointInTrackedDeletion(parent, index) });
    }
    if (held) {
      const deleted = node.marks.some((mark) => mark.type.name === DELETION_MARK_NAME);
      const end = pos + node.nodeSize;
      for (const name of held) {
        const run = open.get(name);
        if (run && run.to === pos && run.deleted === deleted) {
          run.to = end;
        } else {
          if (run) finish(name, run);
          open.set(name, { from: pos, to: end, deleted });
        }
      }
    }
    return !isPoint;
  });
  closeAll();
  // A tracked cut leaves the bookmark in the text it deletes while the paste
  // carries it to its new place (WUA 035): the bookmark is where it lives.
  const ranges = new Map<string, readonly BookmarkRange[]>();
  for (const [name, runs] of finished) {
    const live = runs.filter((run) => !run.deleted);
    ranges.set(name, live.length ? live : runs);
  }
  bookmarkRangesByDoc.set(doc, ranges);
  return ranges;
}

/** Snapshot the document's bookmarks (for the Go-To panel). */
export function getBookmarks(state: EditorState): DocBookmark[] {
  // Word's Bookmark dialog does not list the hidden bookmarks its
  // cross-references made.
  return collectBookmarks(state.doc.toJSON()).filter(
    (bookmark) => !isHiddenReferenceBookmarkName(bookmark.name),
  );
}

/**
 * The hidden cross-reference bookmarks (Word's `_Ref…`), which the Bookmark
 * dialog lists only with "Hidden bookmarks" ticked, as Word does.
 */
export function getHiddenReferenceBookmarks(state: EditorState): DocBookmark[] {
  return collectBookmarks(state.doc.toJSON()).filter((bookmark) =>
    isHiddenReferenceBookmarkName(bookmark.name),
  );
}

/** The set of bookmark names already in the document (for de-duplication). */
function usedBookmarkNames(doc: ProseMirrorNode): Set<string> {
  return new Set(collectBookmarks(doc.toJSON()).map((b) => b.name));
}

/**
 * Remove every mark range and point node carrying `name` (right to left so
 * positions stay valid). Mutates `tr`.
 */
function stripBookmark(
  doc: ProseMirrorNode,
  tr: Transaction,
  name: unknown,
): void {
  const markType = doc.type.schema.marks[BOOKMARK_MARK_NAME];
  const ranges = bookmarkRangesFor(doc, name);
  for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
    const mapped = { from: tr.mapping.map(range.from), to: tr.mapping.map(range.to) };
    if (range.from === range.to) {
      const node = tr.doc.nodeAt(mapped.from);
      if (node?.type.name === BOOKMARK_POINT_NODE_NAME) {
        tr.delete(mapped.from, mapped.from + node.nodeSize);
      }
      continue;
    }
    if (!markType) continue;
    // Only the mark with THIS name comes off; another bookmark sharing the
    // range stays.
    tr.doc.nodesBetween(mapped.from, mapped.to, (node, pos) => {
      if (!node.isText && !(node.isInline && node.isLeaf)) return true;
      for (const mark of node.marks) {
        if (
          mark.type === markType &&
          sanitizeBookmarkName(mark.attrs.name) === sanitizeBookmarkName(name)
        ) {
          tr.removeMark(
            Math.max(pos, mapped.from),
            Math.min(pos + node.nodeSize, mapped.to),
            mark,
          );
        }
      }
      return false;
    });
  }
}

/** The position before the table cell holding `pos`, or null outside one. */
function enclosingTableCellPos(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === "cell" || $pos.node(depth).type.spec.tableRole === "header_cell") {
      return $pos.before(depth);
    }
  }
  return null;
}

/**
 * What Go To and a link to a bookmark select, as Word does: the bookmark's
 * text (a point bookmark, the insertion point there); a bookmark over cells
 * of one table, those cells -- a text selection across cells would be cut
 * back to the first cell. Null when the document has no such bookmark.
 */
export function bookmarkSelection(doc: ProseMirrorNode, name: unknown): Selection | null {
  const ranges = bookmarkRangesFor(doc, name);
  if (ranges.length === 0) return null;
  const from = ranges[0].from;
  const to = ranges[ranges.length - 1].to;
  const firstCell = enclosingTableCellPos(doc, from);
  const lastCell = enclosingTableCellPos(doc, Math.max(from, to - 1));
  if (
    firstCell !== null &&
    lastCell !== null &&
    firstCell !== lastCell &&
    doc.resolve(firstCell).node(-1) === doc.resolve(lastCell).node(-1)
  ) {
    return CellSelection.create(doc, firstCell, lastCell);
  }
  return TextSelection.between(doc.resolve(from), doc.resolve(to));
}

/**
 * Name the range [from, to) — or, when it is empty, the insertion point — as
 * a bookmark. A range gets the mark; a caret gets a point atom. Returns false
 * when neither can be placed.
 */
function markBookmark(
  state: EditorState,
  tr: Transaction,
  name: string,
  from = state.selection.from,
  to = state.selection.to,
): boolean {
  // A table cell selection names every selected cell, not the one range
  
  const selection = tr.selection;
  if (selection instanceof CellSelection) {
    const markType = state.schema.marks[BOOKMARK_MARK_NAME];
    if (!markType) return false;
    let marked = false;
    let firstCell = -1;
    selection.forEachCell((cell, pos) => {
      if (firstCell < 0) firstCell = pos;
      if (cell.textContent.length === 0) return;
      tr.addMark(pos + 1, pos + cell.nodeSize - 1, markType.create({ name }));
      marked = true;
    });
    if (marked) return true;
    // Every selected cell is empty: a point at the start of the first.
    if (firstCell < 0) return false;
    from = firstCell + 2;
    to = from;
  }
  if (to > from) {
    const markType = state.schema.marks[BOOKMARK_MARK_NAME];
    if (!markType) return false;
    tr.addMark(from, to, markType.create({ name }));
    return true;
  }
  const pointType = state.schema.nodes[BOOKMARK_POINT_NODE_NAME];
  if (!pointType) return false;
  const $pos = tr.doc.resolve(from);
  if (!$pos.parent.inlineContent) return false;
  tr.insert(from, pointType.create({ name }));
  return true;
}

/**
 * Word's point bookmark: an invisible inline atom naming one insertion point.
 * Exported as an adjacent `w:bookmarkStart` / `w:bookmarkEnd` pair.
 */
export const BookmarkPoint = Node.create({
  name: BOOKMARK_POINT_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      name: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeBookmarkName(element.getAttribute("data-bookmark-point")) ||
          null,
        renderHTML: (attrs: Record<string, unknown>) => {
          const name = sanitizeBookmarkName(attrs.name);
          return name ? { "data-bookmark-point": name } : {};
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-bookmark-point]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "mrnote-bookmark-point" }),
    ];
  },
});

/**
 * The bookmark inline mark. Carries ONLY a sanitized `name`. parse/render funnel
 * the name through sanitizeBookmarkName so a forged/imported value can never break
 * out of the `data-bookmark-name` attribute or inject markup. A mark whose name
 * does not survive sanitization parses to null (the mark is dropped on load).
 */
const BookmarkMark = Mark.create({
  name: BOOKMARK_MARK_NAME,
  // Non-inclusive: typing at the very end of a bookmarked range should NOT extend
  // the bookmark (Word treats a bookmark as a fixed span). The user re-bookmarks
  // explicitly to grow it.
  inclusive: false,
  // A bookmark can coexist with comments / formatting / track-changes; do not
  // exclude anything. Overlapping/nested bookmarks therefore stack as separate
  // marks (each keeps its own balanced start/end on export). ProseMirror's
  // default is that a mark excludes its own type, which let a second
  // bookmark on the same text silently remove the first; an empty
  // `excludes` is what makes them stack (Word keeps both).
  excludes: "",
  addAttributes() {
    return {
      name: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeBookmarkName(element.getAttribute("data-bookmark-name")) ||
          null,
        renderHTML: (attrs: Record<string, unknown>) => {
          const name = sanitizeBookmarkName(attrs.name);
          return name ? { "data-bookmark-name": name } : {};
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-bookmark-name]" }];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted: (slice, view) => {
            // Pasted inside a bookmark (its range runs on either side of the
            // selection), the text is part of that bookmark, as typing is:
            // stripping it as a duplicate split "Beta" into "B" + "a" around
            // the paste and the cross-reference read "B a" (live Word
            // audit WUA 023).
            // A bookmark standing only in the text the paste replaces (or a
            // moving drag deletes) moves with the paste (WUA 039).
            const enclosing = enclosingBookmarkMarks(view.state.selection);
            return withEnclosingBookmarks(
              withoutExistingBookmarks(
                slice,
                view.state.doc,
                new Set(enclosing.map((mark) => mark.attrs.name)),
                pasteLeavingRange(view),
              ),
              enclosing,
            );
          },
        },
      }),
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const name = sanitizeBookmarkName(
      (HTMLAttributes as { "data-bookmark-name"?: unknown })[
        "data-bookmark-name"
      ],
    );
    // Render a fixed class + sanitized name only. No raw user HTML.
    return [
      "span",
      mergeAttributes(
        {},
        name ? { "data-bookmark-name": name } : {},
        { class: "mrnote-bookmark" },
      ),
      0,
    ];
  },

  addCommands() {
    return {
      addBookmark:
        (name: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          // Only the dialog's setBookmark places a point bookmark on a
          // collapsed caret; this quick path needs a selection to name.
          if (state.selection.empty) return false;
          const base = sanitizeBookmarkName(name);
          if (!base) return false;
          const unique = dedupeBookmarkName(base, usedBookmarkNames(state.doc));
          if (!markBookmark(state, tr, unique)) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      setBookmark:
        (name: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const target = sanitizeBookmarkName(name);
          if (!target || target !== name) return false;
          // Word's Add relocates a name already in use.
          stripBookmark(state.doc, tr, target);
          const selection = tr.selection;
          if (!markBookmark(state, tr, target, selection.from, selection.to)) {
            return false;
          }
          if (dispatch) dispatch(tr);
          return true;
        },

      removeBookmark:
        (name: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!state.schema.marks[BOOKMARK_MARK_NAME]) return false;
          if (bookmarkRangesFor(state.doc, name).length === 0) return false;
          stripBookmark(state.doc, tr, name);
          if (dispatch) dispatch(tr);
          return true;
        },

      goToBookmark:
        (name: string) =>
        ({ state, tr, dispatch }) => {
          // Re-resolve against the CURRENT doc so a deleted bookmark is a safe
          // no-op (no stale position is reused).
          const selection = bookmarkSelection(state.doc, name);
          if (!selection) return false;
          if (dispatch) tr.setSelection(selection);
          return true;
        },
    };
  },
});








/** The range bookmarks a selection lies strictly inside of. */
export function enclosingBookmarkMarks(selection: Selection): ProseMirrorMark[] {
  return enclosingAnchorMarks(selection, BOOKMARK_MARK_NAME, "name");
}

/** `slice` with every text carrying `marks` (the bookmarks it is pasted into). */
export function withEnclosingBookmarks(slice: Slice, marks: readonly ProseMirrorMark[]): Slice {
  return withTextMarks(slice, marks);
}

/**
 * Whether `name` names a bookmark outside tracked-deleted text and outside
 * `leaving` (the text a paste replaces).
 */
function bookmarkLiveIn(
  doc: ProseMirrorNode,
  name: unknown,
  leaving: PasteLeavingRange | null = null,
): boolean {
  const target = sanitizeBookmarkName(name);
  if (!target) return false;
  let live = false;
  doc.descendants((node, pos, parent, index) => {
    if (live) return false;
    if (withinLeavingRange(leaving, pos, pos + node.nodeSize)) return false;
    if (node.type.name === BOOKMARK_POINT_NODE_NAME) {
      if (sanitizeBookmarkName(node.attrs.name) === target && !isPointInTrackedDeletion(parent, index)) {
        live = true;
      }
      return false;
    }
    if (
      node.marks.some(
        (mark) => mark.type.name === BOOKMARK_MARK_NAME && sanitizeBookmarkName(mark.attrs.name) === target,
      ) &&
      !node.marks.some((mark) => mark.type.name === DELETION_MARK_NAME)
    ) {
      live = true;
    }
    return !live;
  });
  return live;
}

export function withoutExistingBookmarks(
  slice: Slice,
  doc: ProseMirrorNode,
  keep: ReadonlySet<unknown> = new Set(),
  leaving: PasteLeavingRange | null = null,
): Slice {
  // Only a bookmark still standing in the text counts: one that remains only
  // in text a tracked cut deleted moves with the paste, as an untracked cut's
  // does, and goes with the deleted text when it is accepted (WUA 035); so
  // does one only in the text the paste itself replaces.
  const exists = (name: unknown) => !keep.has(name) && bookmarkLiveIn(doc, name, leaving);
  let changed = false;
  const strip = (fragment: Fragment): Fragment => {
    const nodes: ProseMirrorNode[] = [];
    fragment.forEach((node) => {
      if (node.type.name === BOOKMARK_POINT_NODE_NAME && exists(node.attrs.name)) {
        changed = true;
        return;
      }
      const marks = node.marks.filter(
        (mark) => !(mark.type.name === BOOKMARK_MARK_NAME && exists(mark.attrs.name)),
      );
      const remarked = marks.length !== node.marks.length;
      if (remarked) changed = true;
      if (node.isText) {
        nodes.push(remarked ? node.mark(marks) : node);
        return;
      }
      const content = node.content.size ? strip(node.content) : node.content;
      nodes.push(
        content === node.content && !remarked ? node : node.type.create(node.attrs, content, marks),
      );
    });
    return Fragment.fromArray(nodes);
  };
  const content = strip(slice.content);
  return changed ? new Slice(content, slice.openStart, slice.openEnd) : slice;
}

export const DocumentBookmarks = BookmarkMark;
export const DocumentBookmarkPoints = BookmarkPoint;

export default DocumentBookmarks;
