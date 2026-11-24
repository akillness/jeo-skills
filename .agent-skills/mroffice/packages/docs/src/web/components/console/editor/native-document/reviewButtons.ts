/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Review tab (Comments group) button logic shared by the document toolbar and
 * the editor-command catalog. The ribbon acts on the comment at the caret; a
 * command acts on every comment anchored in its target.
 */

import type { Editor } from "@tiptap/core";
import {
  commentThreadAtPosition,
  getCommentThreads,
  orderedAnchoredCommentThreads,
  type AnchoredCommentThread,
} from "@mrnote/core/web/components/console/editor/native-document/commentExtension.ts";

export interface LiveCommentReviewState {
  threadCount: number;
  anchoredThreads: AnchoredCommentThread[];
  currentThread: AnchoredCommentThread | null;
  selectionFrom: number;
}

/** Resolve every parameterless Review-comment action from live editor state. */
export function liveCommentReviewState(editor: Editor): LiveCommentReviewState {
  const state = editor.state;
  const threads = getCommentThreads(state);
  const anchoredThreads = orderedAnchoredCommentThreads(state.doc, threads);
  return {
    threadCount: threads.length,
    anchoredThreads,
    currentThread: commentThreadAtPosition(anchoredThreads, state.selection.from),
    selectionFrom: state.selection.from,
  };
}

/** The comment threads anchored anywhere in from..to, in document order. */
export function commentThreadsInRange(editor: Editor, from: number, to: number): AnchoredCommentThread[] {
  return liveCommentReviewState(editor).anchoredThreads.filter(({ ranges }) =>
    ranges.some((range) => range.from < Math.max(to, from + 1) && range.to > from),
  );
}

/** Review ▸ Delete: the comment at the caret. */
export function removeCurrentComment(editor: Editor): boolean {
  try {
    const target = liveCommentReviewState(editor).currentThread;
    if (!target) return false;
    const removed = editor.commands.removeComment(target.thread.id);
    if (removed) editor.commands.focus();
    return removed;
  } catch {
    return false;
  }
}

/** Review ▸ Resolve: toggles the comment at the caret. */
export function toggleCurrentCommentResolved(editor: Editor): boolean {
  try {
    const target = liveCommentReviewState(editor).currentThread;
    if (!target) return false;
    const updated = editor.commands.setCommentResolved(target.thread.id, !target.thread.resolved);
    if (updated) editor.commands.focus();
    return updated;
  } catch {
    return false;
  }
}
