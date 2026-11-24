"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { documentWordRangeAt } from "../../../../lib/document-word-at";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, type EditorState } from "@tiptap/pm/state";
import {
  COMMENT_REACTION_PROVIDER,
  COMMENT_MARK_NAME,
  addReply,
  addThread,
  editCommentMessage,
  materializeCommentIdsForThread,
  isCommentMediaPreserveOnlyThread,
  normalizeCommentThreads,
  removeReplyAt,
  removeThread,
  resolveThread,
  sanitizeThreadId,
  threadIdFor,
  toggleCommentLike,
  type CommentThread,
} from "./comments";
import { commentsWritable } from "./commentOnlyLane";
import { SAVED_WITHOUT_HISTORY_META, trustReadOnlyDocumentMutation } from "./readOnlyTransactionAuthority";
import {
  enclosingAnchorMarks,
  pasteLeavingRange,
  withTextMarks,
  withinLeavingRange,
  withoutMarks,
  type PasteLeavingRange,
} from "./pasteAnchors";
import { DELETION_MARK_NAME } from "./trackChanges";
import { isTextRangeSelection } from "../extensions/equationBoundarySelection";

/**
 * Document COMMENT THREADS (Word/WPS "comments" parity) — TipTap wiring.
 *
 * ADDITIVE: registering this extension adds ONE inline mark ("comment") and ONE
 * optional top-level doc attribute ("commentThreads"). The mark round-trips
 * through the document schema's open `marks` passthrough, and the doc attribute
 * round-trips through the open `attrs` passthrough (see lib/native-page-schemas
 * → documentDocAttrsSchema), so EXISTING documents — which carry neither — still
 * validate and load byte-for-byte unchanged. There is no flag because the
 * feature is purely opt-in per user action (selecting text + adding a comment);
 * a document with no comments behaves exactly as before.
 *
 * SECURITY: the mark renders ONLY a sanitized `data-thread-id` attribute + a
 * fixed class (no raw HTML, no user text in the DOM attribute surface). The
 * thread store (author/text/timestamp) is held on the doc attribute and is
 * always rendered as TEXT by the sidebar component, never as HTML. All values
 * pass through the sanitizers in ./comments on every edge.
 */

/** The doc-level attribute key holding the thread store. */
export const COMMENT_THREADS_ATTR = "commentThreads";

/**
 * Window CustomEvent the toolbar's Add-comment button dispatches. NoteEditor
 * listens for it to open the comments panel + composer anchored to the current
 * selection. Decoupling the toolbar (which only initiates) from the sidebar
 * (which owns the text-entry / reply / resolve UI) keeps the rich UX in one
 * place while the toolbar stays a thin trigger.
 */
export const ADD_COMMENT_EVENT = "mrnote:add-comment";
export const FOCUS_COMMENT_EVENT = "mrnote:focus-comment";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentComments: {
      /**
       * Mark the current selection as a comment anchor and open a new thread
       * with the given (sanitized) first comment. No-op when the selection is
       * empty or the text scrubs to nothing.
       */
      addComment: (
        text: string,
        author?: string | null,
        actorId?: string | null,
        actorProvider?: string | null,
        /** The text the comment was started on; the selection when absent. */
        range?: { from: number; to: number } | null,
      ) => ReturnType;
      /** Append a reply to an existing thread. No-op for empty text. */
      addCommentReply: (
        threadId: string,
        text: string,
        author?: string | null,
        actorId?: string | null,
        actorProvider?: string | null,
      ) => ReturnType;
      /** Edit an exact message only when authenticated creator provenance matches. */
      editCommentMessage: (
        threadId: string,
        commentId: string,
        text: string,
        actorId: string,
        actorProvider: string,
      ) => ReturnType;
      /** Delete one reply while retaining its root thread and anchor. */
      removeCommentReply: (threadId: string, replyIndex: number) => ReturnType;
      /** Toggle the current authenticated user's Like on a comment/reply. */
      toggleCommentLike: (
        threadId: string,
        commentId: string,
        actorId: string,
        actorName: string,
      ) => ReturnType;
      /** Persist legacy comment ids as non-body, non-Undo metadata. */
      materializeCommentIds: (threadId: string) => ReturnType;
      /**
       * Mark a thread resolved/reopened. Resolving removes its visual highlight
       * (the mark stays so the anchor survives; the renderer dims resolved
       * anchors), reopening restores it. The thread record is kept either way.
       */
      setCommentResolved: (threadId: string, resolved: boolean) => ReturnType;
      /**
       * Delete a thread AND strip its comment mark from the document, so the
       * anchored highlight disappears with the thread.
       */
      removeComment: (threadId: string) => ReturnType;
      /** Delete every thread + anchor in one independently undoable action. */
      removeAllComments: () => ReturnType;
      /** Select the document range anchored by a thread (scroll + highlight). */
      selectCommentRange: (threadId: string) => ReturnType;
      /**
       * Re-apply the thread store onto the top-level doc attrs from a value read
       * out of persisted content. TipTap's `setContent` replaces only the doc's
       * CHILDREN (tr.replaceWith over [0, size]) and DISCARDS the new doc node's
       * own attrs, so doc-level attributes like the thread store are NOT restored
       * by setContent alone. NoteEditor calls this right after hydration so a
       * reloaded document re-attaches its comment store (the anchoring marks ride
       * inside the content and survive on their own). Value is normalized/capped
       * at the edge. Always returns true (a no-op restore is fine).
       */
      restoreCommentThreads: (threads: unknown) => ReturnType;
    };
  }
}

/**
 * Read + normalize the thread store off a doc node's attrs. Always returns a
 * fresh, sanitized array (never throws), so callers can treat it as the source
 * of truth without re-validating.
 */
export function readCommentThreads(doc: ProseMirrorNode): CommentThread[] {
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  return normalizeCommentThreads(attrs[COMMENT_THREADS_ATTR]);
}

/** Convenience reader off an EditorState. */
export function getCommentThreads(state: EditorState): CommentThread[] {
  return readCommentThreads(state.doc);
}

/** A [from, to) run anchored by a given thread id. */
export interface CommentRange {
  from: number;
  to: number;
}

/**
 * Collect every contiguous run of text carrying the comment mark for the given
 * (sanitized) thread id. Returns [] when the id is unusable or unanchored.
 * Adjacent runs that share the id are merged.
 */
export function commentRangesFor(
  doc: ProseMirrorNode,
  threadId: unknown,
): CommentRange[] {
  const id = sanitizeThreadId(threadId);
  if (!id) return [];
  const ranges: CommentRange[] = [];
  let current: CommentRange | null = null;
  doc.descendants((node, pos) => {
    // Text, and an inline atom (a date field, a citation) that carries the
    // mark: the pane let the comment be posted on a selected field, so its
    // range reads back too, instead of the thread turning "unavailable" the
    
    const markable = node.isText || (node.isInline && node.isLeaf);
    if (!markable) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      return true;
    }
    const hasMark = node.marks.some(
      (mark) =>
        mark.type.name === COMMENT_MARK_NAME && mark.attrs.threadId === id,
    );
    const start = pos;
    const end = pos + node.nodeSize;
    if (hasMark) {
      if (current && current.to === start) {
        current.to = end;
      } else {
        if (current) ranges.push(current);
        current = { from: start, to: end };
      }
    } else if (current) {
      ranges.push(current);
      current = null;
    }
    return true;
  });
  if (current) ranges.push(current);
  return ranges;
}

/** A normalized comment thread paired with every anchored document run. */
export interface AnchoredCommentThread {
  thread: CommentThread;
  ranges: CommentRange[];
}

/** Previous/next direction shared by the comments panel and Review ribbon. */
export type CommentNavigationDirection = -1 | 1;

/**
 * Resolve the complete comment store into document order, omitting orphaned
 * threads whose store entry no longer has a matching inline anchor.
 */
export function orderedAnchoredCommentThreads(
  doc: ProseMirrorNode,
  threads: readonly CommentThread[],
): AnchoredCommentThread[] {
  // No thread, nothing anchored: a document without comments is not walked
  // (the toolbar asks on every keystroke; a 296-page book's walk is ~7 ms).
  if (threads.length === 0) return [];
  const byId = new Map<
    string,
    AnchoredCommentThread & { storeIndex: number }
  >();
  threads.forEach((thread, storeIndex) => {
    byId.set(thread.id, { thread, ranges: [], storeIndex });
  });

  // The toolbar reads this helper on every editor transaction. Collect every
  // known thread in one document walk instead of running commentRangesFor once
  // per thread (O(document size), not O(threads × document size)).
  doc.descendants((node, pos) => {
    // Text and a marked inline atom (a field a Word comment ranges over,
    // corpus R08-D31), as commentRangesFor reads them.
    if (!node.isText && !(node.isInline && node.isLeaf)) return true;
    const end = pos + node.nodeSize;
    for (const mark of node.marks) {
      if (mark.type.name !== COMMENT_MARK_NAME) continue;
      const rawId = mark.attrs.threadId;
      if (typeof rawId !== "string" || rawId !== sanitizeThreadId(rawId)) {
        continue;
      }
      const anchored = byId.get(rawId);
      if (!anchored) continue;
      const last = anchored.ranges[anchored.ranges.length - 1];
      if (last?.to === pos) {
        last.to = end;
      } else {
        anchored.ranges.push({ from: pos, to: end });
      }
    }
    return true;
  });

  return [...byId.values()]
    .filter(({ ranges }) => ranges.length > 0)
    .sort(
      (left, right) =>
        left.ranges[0].from - right.ranges[0].from ||
        left.storeIndex - right.storeIndex,
    )
    .map(({ thread, ranges }) => ({ thread, ranges }));
}

/** Return the anchored thread containing a live selection position. */
export function commentThreadAtPosition(
  anchoredThreads: readonly AnchoredCommentThread[],
  position: number,
): AnchoredCommentThread | null {
  return (
    anchoredThreads.find(({ ranges }) =>
      ranges.some(({ from, to }) => position >= from && position < to),
    ) ?? null
  );
}

/**
 * Resolve the adjacent anchored thread in document order. From an anchor the
 * command wraps; from ordinary text it selects the nearest thread in the
 * requested direction, also wrapping at document bounds.
 */
export function adjacentAnchoredCommentThread(
  anchoredThreads: readonly AnchoredCommentThread[],
  position: number,
  direction: CommentNavigationDirection,
): AnchoredCommentThread | null {
  if (anchoredThreads.length === 0) return null;

  const current = commentThreadAtPosition(anchoredThreads, position);
  if (current) {
    const currentIndex = anchoredThreads.indexOf(current);
    return anchoredThreads[
      (currentIndex + direction + anchoredThreads.length) %
        anchoredThreads.length
    ];
  }

  if (direction > 0) {
    return (
      anchoredThreads.find(({ ranges }) => ranges[0].from > position) ??
      anchoredThreads[0]
    );
  }

  for (let index = anchoredThreads.length - 1; index >= 0; index -= 1) {
    if (anchoredThreads[index].ranges[0].from < position) {
      return anchoredThreads[index];
    }
  }
  return anchoredThreads[anchoredThreads.length - 1];
}

/** Does the doc carry any comment thread? (gates the sidebar toggle.) */
export function hasComments(state: EditorState): boolean {
  return readCommentThreads(state.doc).length > 0;
}

/**
 * Whether thread `id` is anchored in `doc` outside tracked-deleted text and
 * outside `leaving` (the text a paste replaces or a moving drag takes away).
 */
function commentAnchoredOutside(
  doc: ProseMirrorNode,
  id: string,
  leaving: PasteLeavingRange | null,
): boolean {
  let anchored = false;
  doc.descendants((node, pos) => {
    if (anchored) return false;
    if (withinLeavingRange(leaving, pos, pos + node.nodeSize)) return false;
    if (
      node.marks.some(
        (mark) =>
          mark.type.name === COMMENT_MARK_NAME &&
          sanitizeThreadId(mark.attrs.threadId) === id,
      ) &&
      !node.marks.some((mark) => mark.type.name === DELETION_MARK_NAME)
    ) {
      anchored = true;
    }
    return !anchored;
  });
  return anchored;
}

/**
 * `slice` without the comment marks of threads still anchored in `doc`
 * (outside `leaving`, and not in `keep`): pasted, such a mark would make the
 * thread a second range. A thread whose only anchor is gone (cut, or only in
 * tracked-deleted text) moves with the paste.
 */
export function withoutAnchoredComments(
  slice: Slice,
  doc: ProseMirrorNode,
  leaving: PasteLeavingRange | null = null,
  keep: ReadonlySet<unknown> = new Set(),
): Slice {
  const anchored = new Map<string, boolean>();
  return withoutMarks(slice, (mark) => {
    if (mark.type.name !== COMMENT_MARK_NAME) return false;
    const id = sanitizeThreadId(mark.attrs.threadId);
    if (!id || keep.has(id)) return false;
    let known = anchored.get(id);
    if (known === undefined) {
      known = commentAnchoredOutside(doc, id, leaving);
      anchored.set(id, known);
    }
    return known;
  });
}

/**
 * The comment inline mark. Carries ONLY a sanitized `threadId`. parse/render
 * funnel the id through sanitizeThreadId so a forged/imported value can never
 * break out of the `data-thread-id` attribute or inject markup. A mark whose id
 * does not survive sanitization parses to null (the mark is dropped on load).
 */
const CommentMark = Mark.create({
  name: COMMENT_MARK_NAME,
  // Inclusive so typing at the edge of a commented range stays inside it.
  inclusive: true,
  // Word lets comment ranges overlap: two threads can anchor on the same
  // words (Comment059.docx). A mark excludes its own type by default, which
  // dropped the second thread's mark on load and left the saved page and its
  // editor disagreeing, so the page never became editable. The server keys
  // overlapping marks the way y-tiptap does
  // (document_page_causal_crdt.OVERLAPPING_MARK_ATTRS).
  excludes: "",
  // A comment anchor can coexist with track-changes marks / formatting; do not
  // exclude anything.
  addAttributes() {
    return {
      threadId: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeThreadId(element.getAttribute("data-thread-id")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const id = sanitizeThreadId(attrs.threadId);
          return id ? { "data-thread-id": id } : {};
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-thread-id]" }];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted: (slice, view) => {
            // A comment anchors ONE range. Copied text pasted elsewhere is a
            // copy of the words: kept on the copy, the thread's mark made the
            // thread two ranges, and selecting it ran from the copy to the
            // original over everything between (live Word audit WUA 039).
            // Word's own range copy (FormattedText) leaves the comment on
            // the original only. Cut or dragged text still moves the
            // comment, and text pasted strictly inside a comment joins it.
            const enclosing = enclosingAnchorMarks(
              view.state.selection,
              COMMENT_MARK_NAME,
              "threadId",
            );
            return withTextMarks(
              withoutAnchoredComments(
                slice,
                view.state.doc,
                pasteLeavingRange(view),
                new Set(enclosing.map((mark) => mark.attrs.threadId)),
              ),
              enclosing,
            );
          },
        },
      }),
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const id = sanitizeThreadId(
      (HTMLAttributes as { "data-thread-id"?: unknown })["data-thread-id"],
    );
    // Render a fixed class + sanitized id only. No user text in the DOM.
    return [
      "span",
      mergeAttributes(
        // Drop any non-whitelisted attribute that may have leaked in; we only
        // ever emit our own two.
        {},
        id ? { "data-thread-id": id } : {},
        { class: "mrnote-comment" },
      ),
      0,
    ];
  },
});

/**
 * Doc-level attribute carrier for the thread store. Registered as a GLOBAL
 * attribute on the `doc` node so it persists on doc.attrs through getJSON, and
 * is re-attached on load via the `restoreCommentThreads` command (mirrors how
 * DocumentPageSetup stores pageSize/columns).
 *
 * There is intentionally NO HTML (de)serialization here: getHTML() serializes
 * only the doc's CONTENT fragment, never the doc node's own attrs, so a
 * `data-comment-threads` parse/render round-trip would be unreachable dead
 * code. The store persists ONLY through getJSON() (doc.attrs.commentThreads);
 * HTML/DOCX export therefore deliberately omits the thread store. The per-mark
 * `data-thread-id` spans (the comment MARK above) ARE serialized and carry the
 * in-text anchors; normalization/sanitization happens at the command edge and
 * on load (restoreCommentThreads → normalizeCommentThreads).
 */
const CommentThreadStore = Extension.create({
  name: "documentCommentThreadStore",

  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          [COMMENT_THREADS_ATTR]: {
            // No parseHTML/renderHTML: doc-node global attrs are never
            // (de)serialized by getHTML/setContent — only getJSON carries this
            // store, and restoreCommentThreads re-applies it on load.
            default: [] as CommentThread[],
          },
        },
      },
    ];
  },
});

/**
 * The user-facing extension: registers the mark + the doc-attr store + the
 * commands. The commands keep the document mark and the thread store in sync.
 */
export const DocumentComments = Extension.create({
  name: "documentComments",

  addExtensions() {
    return [CommentMark, CommentThreadStore];
  },

  addKeyboardShortcuts() {
    const openComposer = (): boolean => {
      const editor = this.editor;
      // A collapsed caret comments the word at the insertion point, as the
      // ribbon's New Comment and Word do (`addComment` finds the word).
      if (
        typeof window === "undefined" ||
        editor.isDestroyed ||
        !commentsWritable(editor) ||
        !isTextRangeSelection(editor.state.selection)
      ) {
        return false;
      }
      window.dispatchEvent(new CustomEvent(ADD_COMMENT_EVENT));
      return true;
    };
    const focusComment = (): boolean => {
      const editor = this.editor;
      if (typeof window === "undefined" || editor.isDestroyed) return false;
      const anchored = orderedAnchoredCommentThreads(
        editor.state.doc,
        getCommentThreads(editor.state),
      );
      const current = commentThreadAtPosition(
        anchored,
        editor.state.selection.from,
      );
      if (!current) return false;
      window.dispatchEvent(
        new CustomEvent(FOCUS_COMMENT_EVENT, {
          detail: { threadId: current.thread.id },
        }),
      );
      return true;
    };

    // Word's New Comment: Ctrl+Alt+M on Windows, ⌘⌥A in Word for Mac; ⌘⌥M
    // and the shared Presentation surface's ⌘⇧M open it on a Mac as well
    // (the workspace's window chord on the same keys yields to an editor
    // that handled them). The event only opens one draft; posting remains
    // the existing explicit action and therefore keeps this shortcut at
    // zero document writes.
    return {
      "Ctrl-Alt-m": openComposer,
      "Meta-Alt-m": openComposer,
      "Meta-Alt-a": openComposer,
      "Meta-Shift-m": openComposer,
      "Alt-F12": focusComment,
    };
  },

  addCommands() {
    const runtimeEditor = this.editor;
    return {
      addComment:
        (
          text: string,
          author?: string | null,
          actorId?: string | null,
          actorProvider?: string | null,
          range?: { from: number; to: number } | null,
        ) =>
        ({ state, tr, dispatch }) => {
          // A read-only editor refuses the write; the command says so instead
          // of reporting a change the transaction filter dropped (OFL-015).
          if (!commentsWritable(runtimeEditor)) return false;
          // No selection: Word comments the word at the insertion point.
          const word = !range && state.selection.empty
            ? documentWordRangeAt(state.selection.$from)
            : null;
          const from = range?.from ?? word?.from ?? state.selection.from;
          const to = range?.to ?? word?.to ?? state.selection.to;
          if (to <= from || from < 0 || to > state.doc.content.size) return false;
          const markType = state.schema.marks[COMMENT_MARK_NAME];
          if (!markType) return false;

          const existing = readCommentThreads(state.doc);
          const id = threadIdFor();
          const nextThreads = addThread(existing, id, {
            actorId,
            actorProvider,
            author: author ?? null,
            text,
            timestamp: Date.now(),
          });
          // addThread is a no-op (same ref) when the text scrubs to nothing.
          if (nextThreads === existing) return false;

          if (dispatch) {
            tr.addMark(from, to, markType.create({ threadId: id }));
            tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            dispatch(tr);
          }
          return true;
        },

      addCommentReply:
        (
          threadId: string,
          text: string,
          author?: string | null,
          actorId?: string | null,
          actorProvider?: string | null,
        ) =>
        ({ state, tr, dispatch }) => {
          if (!commentsWritable(runtimeEditor)) return false;
          const existing = readCommentThreads(state.doc);
          const nextThreads = addReply(existing, threadId, {
            actorId,
            actorProvider,
            author: author ?? null,
            text,
            timestamp: Date.now(),
          });
          if (nextThreads === existing) return false;
          if (dispatch) {
            tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            dispatch(tr);
          }
          return true;
        },

      editCommentMessage:
        (
          threadId: string,
          commentId: string,
          text: string,
          actorId: string,
          actorProvider: string,
        ) =>
        ({ state, tr, dispatch }) => {
          const existing = readCommentThreads(state.doc);
          const nextThreads = editCommentMessage(
            existing,
            threadId,
            commentId,
            text,
            { id: actorId, provider: actorProvider },
            commentsWritable(runtimeEditor),
          );
          if (nextThreads === existing) {
            tr.setMeta("preventDispatch", true);
            return false;
          }
          if (dispatch) {
            tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            dispatch(closeHistory(tr));
          }
          return true;
        },

      removeCommentReply:
        (threadId: string, replyIndex: number) =>
        ({ state, tr, dispatch }) => {
          if (!commentsWritable(runtimeEditor)) return false;
          const rawThreads = readCommentThreads(state.doc);
          // Removing a reply shifts every later legacy index. Materialize the
          // affected thread first even when the delete comes from a different
          // writer than the read-only client that copied a deterministic link.
          // The helper reserves ids across the whole graph but only persists
          // this thread, so unrelated comments are not polluted.
          const existing = materializeCommentIdsForThread(rawThreads, threadId);
          const nextThreads = removeReplyAt(existing, threadId, replyIndex);
          if (nextThreads === existing) {
            tr.setMeta("preventDispatch", true);
            return false;
          }
          if (dispatch) {
            tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            dispatch(closeHistory(tr));
          }
          return true;
        },

      toggleCommentLike:
        (
          threadId: string,
          commentId: string,
          actorId: string,
          actorName: string,
        ) =>
        ({ state, tr, dispatch }) => {
          // TipTap's editable:false blocks DOM typing, not programmatic
          // transactions. Re-check the live editor at the command boundary.
          const writable = commentsWritable(runtimeEditor);
          if (!writable) return false;
          const existing = materializeCommentIdsForThread(
            readCommentThreads(state.doc),
            threadId,
          );
          const nextThreads = toggleCommentLike(
            existing,
            threadId,
            commentId,
            {
              id: actorId,
              name: actorName,
              provider: COMMENT_REACTION_PROVIDER,
            },
            writable,
          );
          if (nextThreads === existing) return false;
          if (dispatch) {
            tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            // Reactions are collaborative comment metadata, not authored body
            // text. Keep the writer's document Undo stack unchanged, but save
            // it (WUA 229).
            tr.setMeta("addToHistory", false);
            tr.setMeta(SAVED_WITHOUT_HISTORY_META, true);
            dispatch(tr);
          }
          return true;
        },

      materializeCommentIds:
        (threadId: string) =>
        ({ state, tr, dispatch }) => {
          // Link copying remains available in read-only mode using the
          // deterministic legacy id; only an editable document may persist the
          // normalized id bag back into doc attrs.
          if (!commentsWritable(runtimeEditor)) return false;
          const existing = readCommentThreads(state.doc);
          if (
            isCommentMediaPreserveOnlyThread(
              existing.find((thread) => thread.id === threadId),
            )
          )
            return false;
          const nextThreads = materializeCommentIdsForThread(
            existing,
            threadId,
          );
          if (nextThreads === existing) return true;
          if (dispatch) {
            tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            tr.setMeta("addToHistory", false);
            tr.setMeta(SAVED_WITHOUT_HISTORY_META, true);
            dispatch(tr);
          }
          return true;
        },

      setCommentResolved:
        (threadId: string, resolved: boolean) =>
        ({ state, tr, dispatch }) => {
          if (!commentsWritable(runtimeEditor)) return false;
          const existing = readCommentThreads(state.doc);
          const nextThreads = resolveThread(existing, threadId, resolved);
          if (nextThreads === existing) return false;
          if (dispatch) {
            tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            dispatch(tr);
          }
          return true;
        },

      removeComment:
        (threadId: string) =>
        ({ state, tr, dispatch }) => {
          if (!commentsWritable(runtimeEditor)) return false;
          const id = sanitizeThreadId(threadId);
          if (!id) return false;
          const existing = readCommentThreads(state.doc);
          if (
            isCommentMediaPreserveOnlyThread(
              existing.find((thread) => thread.id === id),
            )
          )
            return false;
          const nextThreads = removeThread(existing, id);
          const markType = state.schema.marks[COMMENT_MARK_NAME];
          const ranges = markType ? commentRangesFor(state.doc, id) : [];
          // Nothing to do when neither the store nor the doc has this thread.
          if (nextThreads === existing && ranges.length === 0) return false;
          if (dispatch) {
            // Strip the mark right-to-left so positions stay valid. Only
            // THIS thread's mark instances come off: comment marks of
            // different threads overlap (excludes: ""), and removing the
            
            if (markType) {
              for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
                const own: Array<{ from: number; to: number; mark: ProseMirrorMark }> = [];
                tr.doc.nodesBetween(range.from, range.to, (node, pos) => {
                  if (!node.isInline) return true;
                  for (const mark of node.marks) {
                    if (
                      mark.type === markType &&
                      sanitizeThreadId(mark.attrs.threadId) === id
                    ) {
                      own.push({
                        from: Math.max(pos, range.from),
                        to: Math.min(pos + node.nodeSize, range.to),
                        mark,
                      });
                    }
                  }
                  return false;
                });
                for (const span of own.reverse()) {
                  tr.removeMark(span.from, span.to, span.mark);
                }
              }
            }
            if (nextThreads !== existing) {
              tr.setDocAttribute(COMMENT_THREADS_ATTR, nextThreads);
            }
            dispatch(tr);
          }
          return true;
        },

      removeAllComments:
        () =>
        ({ state, tr, dispatch }) => {
          if (!commentsWritable(runtimeEditor)) return false;
          const existing = readCommentThreads(state.doc);
          if (existing.some(isCommentMediaPreserveOnlyThread)) return false;
          const markType = state.schema.marks[COMMENT_MARK_NAME];
          const hasAnchors = Boolean(
            markType &&
            state.doc.rangeHasMark(0, state.doc.content.size, markType),
          );
          if (existing.length === 0 && !hasAnchors) return false;

          if (dispatch) {
            if (markType && hasAnchors) {
              tr.removeMark(0, state.doc.content.size, markType);
            }
            if (existing.length > 0) {
              tr.setDocAttribute(COMMENT_THREADS_ATTR, []);
            }
            // Word exposes Delete All as one command. Keep it in one history
            // event even when the user just created or replied to a comment.
            dispatch(closeHistory(tr));
          }
          return true;
        },

      selectCommentRange:
        (threadId: string) =>
        ({ state, commands }) => {
          const ranges = commentRangesFor(state.doc, threadId);
          if (ranges.length === 0) return false;
          const from = ranges[0].from;
          const to = ranges[ranges.length - 1].to;
          return commands.setTextSelection({ from, to });
        },

      restoreCommentThreads:
        (threads: unknown) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            // addToHistory:false so a hydration restore is not an undoable edit.
            tr.setDocAttribute(
              COMMENT_THREADS_ATTR,
              normalizeCommentThreads(threads),
            );
            trustReadOnlyDocumentMutation(tr, "hydration-restore");
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export default DocumentComments;
