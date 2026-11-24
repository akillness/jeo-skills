"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { commentsWritable } from "./native-document/commentOnlyLane";
import type { ResolvedPos } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { documentWordRangeAt } from "../../../lib/document-word-at";
import {
  commentDraftAnchorAt,
  commentDraftAnchorIntact,
  mapCommentDraftAnchor,
  type CommentDraftAnchor,
} from "./native-document/commentDraftAnchor";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "../../../../host/next-intl";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  MessageSquarePlus,
  Trash2,
} from "../../office-ribbon/icons/houseIcons";

import { OfficeCommentMessageActions } from "../../office-comments/OfficeCommentMessageActions";
import {
  OfficeCommentThread,
  OfficeCommentsPane,
  type OfficeCommentMessageAdapter,
  type OfficeCommentPaneAdapter,
  type OfficeCommentsClassNames,
  type OfficeCommentThreadAdapter,
} from "../../office-comments/OfficeCommentsPane";
import {
  MentionTextarea,
  useCommentMentions,
} from "../../office-comments/CommentMentions";
import { useSelfCollabIdentity } from "../../../lib/collab/self-identity";

import {
  ADD_COMMENT_EVENT,
  adjacentAnchoredCommentThread,
  commentRangesFor,
  commentThreadAtPosition,
  getCommentThreads,
  orderedAnchoredCommentThreads,
} from "./native-document/commentExtension";
import {
  COMMENT_REACTION_PROVIDER,
  buildCommentDeepLink,
  findCommentById,
  isCommentMediaPreserveOnlyThread,
  materializeCommentIds,
  normalizeCommentReactions,
  parseCommentDeepLink,
  sanitizeCommentActorId,
  type CommentRecord,
  type CommentThread,
} from "./native-document/comments";
import { isImeCompositionActive } from "./native-document/imeCompositionGuard";
import { useCurrentPageId } from "./PageIdContext";
import { pageInterfaceLocale } from "../../../lib/i18n/content-locale";
import { embedAllowsManagingComment, embedShowsComment } from "../../../lib/embed/session-access";

interface CommentsPanelProps {
  editor: Editor;
  /** Display name stamped on comments this user writes (sanitized downstream). */
  author?: string | null;
  /** Deterministic test/demo override; production resolves the signed-in user. */
  reactionActor?: { id: string; name: string } | null;
  /** Monotonic request from a toolbar Add Comment action. */
  newCommentRequestId?: number;
  /** Monotonic Office Alt/Option+F12 request for an anchored thread. */
  focusCommentRequest?: { threadId: string; requestId: number } | null;
  onClose: () => void;
}

type RuntimeEditor = Editor & {
  isEditable?: boolean;
  on?: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
  state?: { selection?: { empty?: boolean; from?: number } };
};

type CommentDraftKeyAction = "submit" | "discard" | null;
type CommentViewMode = "contextual" | "list";
type CommentFilter = "all" | "active" | "resolved";

interface CommentThreadsSnapshot {
  doc: ProseMirrorNode;
  threads: CommentThread[];
  signature: string;
}

interface CommentPaneItem {
  anchored: boolean;
  locationLabel: string;
  thread: CommentThread;
}

interface EditingTarget {
  commentId: string;
  index: number;
  threadId: string;
}

const commentsClassNames: OfficeCommentsClassNames = {
  cellLabel: "comments-panel-message-location",
  messageText: "comments-panel-comment-text",
  replyComposer: "comments-panel-office-reply-composer",
};

function commentThreadSignature(thread: CommentThread): string {
  return JSON.stringify([
    thread.id,
    thread.resolved,
    thread.sourceMediaDisposition,
    thread.sourceMediaFingerprint,
    thread.sourceMediaKinds,
    thread.sourceMediaCount,
    thread.comments.map((comment) => [
      comment.id,
      comment.author,
      comment.actorId,
      comment.actorProvider,
      comment.text,
      comment.timestamp,
      comment.nativeDateUtc,
      comment.initials,
      comment.nativeDate,
      comment.nativeBody,
      comment.nativePerson?.providerId,
      comment.nativePerson?.userId,
      normalizeCommentReactions(comment.reactions).map((reaction) => [
        reaction.type,
        reaction.actorId,
        reaction.actorName,
        reaction.actorProvider,
        reaction.dateUtc,
      ]),
    ]),
  ]);
}

function commentThreadsSignature(threads: CommentThread[]): string {
  return JSON.stringify(threads.map(commentThreadSignature));
}

function commentThreadsSnapshot(editor: Editor): CommentThreadsSnapshot {
  const state = editor.state;
  const threads = materializeCommentIds(getCommentThreads(state));
  return {
    doc: state.doc,
    threads,
    signature: commentThreadsSignature(threads),
  };
}

function commentDraftKeyAction(
  editor: Editor,
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
): CommentDraftKeyAction {
  if (
    event.defaultPrevented ||
    isImeCompositionActive(editor.view, event.nativeEvent)
  ) {
    return null;
  }
  if (event.key === "Escape") return "discard";
  if (
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  ) {
    return "submit";
  }
  return null;
}

function formatTimestamp(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  try {
    return new Intl.DateTimeFormat(pageInterfaceLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  } catch {
    return null;
  }
}

function commentInitials(author: string | null, fallback: string): string {
  const value = (author || fallback).trim();
  if (!value) return "?";
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return Array.from(value).slice(0, 2).join("").toUpperCase();
}

function clampLocationLabel(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 52 ? `${normalized.slice(0, 51)}…` : normalized;
}

interface CommentMessageActionsProps {
  actorId: string | null;
  canCopyLink: boolean;
  canEdit: boolean;
  canMutate: boolean;
  canReact: boolean;
  comment: CommentRecord;
  commentId: string;
  index: number;
  labels: {
    deleteMessage: string;
    deleteThread: string;
    edit: string;
    editUnavailable: string;
    editUnavailableResolved: string;
    like: string;
    link: string;
    more: string;
    readOnly: string;
    reactionUnavailable: string;
    reopen: string;
    resolve: string;
    unlike: string;
  };
  onCopyLink: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleLike: () => void;
  onToggleResolved: () => void;
  registerFocusTarget: (element: HTMLButtonElement | null) => void;
  resolved: boolean;
}

function CommentMessageActions({
  actorId,
  canCopyLink,
  canEdit,
  canMutate,
  canReact,
  comment,
  commentId,
  index,
  labels,
  onCopyLink,
  onDelete,
  onEdit,
  onToggleLike,
  onToggleResolved,
  registerFocusTarget,
  resolved,
}: CommentMessageActionsProps) {
  const likes = normalizeCommentReactions(comment.reactions).filter(
    (reaction) => reaction.type === "like",
  );
  const liked = Boolean(
    actorId &&
    likes.some(
      (reaction) =>
        reaction.actorId === actorId &&
        reaction.actorProvider === COMMENT_REACTION_PROVIDER,
    ),
  );
  const likeLabel = actorId
    ? canReact
      ? liked
        ? labels.unlike
        : labels.like
      : labels.readOnly
    : labels.reactionUnavailable;

  return (
    <OfficeCommentMessageActions
      commentId={commentId}
      index={index}
      resolved={resolved}
      like={{
        count: likes.length,
        liked,
        label: likeLabel,
        title:
          likes.map((reaction) => reaction.actorName).join(", ") || likeLabel,
        disabled: !actorId || !canReact,
        onToggle: onToggleLike,
      }}
      link={{ disabled: !canCopyLink, onSelect: onCopyLink }}
      edit={{
        disabled: !canEdit || resolved,
        // A resolved thread is read-only whoever wrote it: Reopen edits it.
        disabledReason:
          resolved && canEdit ? labels.editUnavailableResolved : labels.editUnavailable,
        onSelect: onEdit,
      }}
      resolve={{
        disabled: !canMutate,
        disabledReason: labels.readOnly,
        onSelect: onToggleResolved,
      }}
      remove={{
        disabled: !canMutate,
        disabledReason: labels.readOnly,
        onSelect: onDelete,
      }}
      labels={labels}
      registerFocusTarget={registerFocusTarget}
    />
  );
}

/** Word Web-style comments pane backed by the native document comment graph. */
function commentTargetMissing(state: unknown): boolean {
  const selection = (
    state as { selection?: { empty?: boolean; $from?: ResolvedPos } } | undefined
  )?.selection;
  if (!selection) return true;
  if (!selection.empty) return false;
  return !selection.$from || documentWordRangeAt(selection.$from) === null;
}

// Text typed into the new-comment box or a reply box and not yet sent: it
// stays for this editor when the panel is closed and opened again (WUA 163:
// Close Comments emptied a two-line reply with no warning, while blurring,
// switching views or filtering kept it). Discard Draft still clears it.
const UNSENT_COMMENT_DRAFTS = new WeakMap<object, { draft: string; replyDrafts: Record<string, string> }>();

export default function CommentsPanel({
  editor,
  author,
  reactionActor,
  focusCommentRequest = null,
  newCommentRequestId = 0,
  onClose,
}: CommentsPanelProps) {
  const t = useTranslations("console-notebooks");
  const documentId = useCurrentPageId();
  const selfIdentity = useSelfCollabIdentity();
  const effectiveReactionActor =
    reactionActor === undefined
      ? selfIdentity.id
        ? {
            id: selfIdentity.id,
            name: selfIdentity.name || author || t("comments.anonymous"),
          }
        : null
      : reactionActor;
  const reactionActorId = sanitizeCommentActorId(effectiveReactionActor?.id);
  const mentions = useCommentMentions({
    pageId: documentId,
    self: effectiveReactionActor,
  });
  const writable = commentsWritable(editor as RuntimeEditor);

  const [snapshot, setSnapshot] = useState<CommentThreadsSnapshot>(() =>
    commentThreadsSnapshot(editor),
  );
  // Nothing to anchor a new comment to: no selection and no word at the
  // caret (Word comments the word at the insertion point).
  const [selectionEmpty, setSelectionEmpty] = useState(() =>
    commentTargetMissing((editor as RuntimeEditor).state),
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CommentViewMode>("list");
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [showNewComposer, setShowNewComposer] = useState(
    () => snapshot.threads.length === 0 || newCommentRequestId > 0,
  );
  const [draft, setDraft] = useState(() => UNSENT_COMMENT_DRAFTS.get(editor)?.draft ?? "");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>(
    () => UNSENT_COMMENT_DRAFTS.get(editor)?.replyDrafts ?? {},
  );
  useEffect(() => {
    UNSENT_COMMENT_DRAFTS.set(editor, { draft, replyDrafts });
  }, [draft, editor, replyDrafts]);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(
    null,
  );
  const [editDraft, setEditDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const hasPreserveOnlyThread = snapshot.threads.some(
    isCommentMediaPreserveOnlyThread,
  );
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const commentFocusRefs = useRef(new Map<string, HTMLButtonElement>());

  const publishCurrentSnapshot = useCallback(() => {
    const next = commentThreadsSnapshot(editor);
    setSnapshot((previous) => {
      if (previous.doc === next.doc) return previous;
      return {
        ...next,
        threads:
          previous.signature === next.signature
            ? previous.threads
            : next.threads,
      };
    });
  }, [editor]);

  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refresh = () => {
      const next = commentThreadsSnapshot(editor);
      setSnapshot((previous) =>
        previous.doc === next.doc
          ? previous
          : {
              ...next,
              threads:
                previous.signature === next.signature
                  ? previous.threads
                  : next.threads,
            },
      );
      setSelectionEmpty(commentTargetMissing(runtime.state));
      const selected = commentThreadAtPosition(
        orderedAnchoredCommentThreads(next.doc, next.threads),
        runtime.state?.selection?.from ?? 0,
      );
      if (selected) setActiveThreadId(selected.thread.id);
    };
    refresh();
    if (typeof runtime.on !== "function" || typeof runtime.off !== "function") {
      return;
    }
    runtime.on("update", refresh);
    runtime.on("selectionUpdate", refresh);
    return () => {
      runtime.off?.("update", refresh);
      runtime.off?.("selectionUpdate", refresh);
    };
  }, [editor]);

  // The text a new comment is about is fixed when the comment is started,
  // as Word anchors its balloon on New Comment: browsing the body while the
  // draft is open used to move the comment onto whatever was selected at
  
  // A caret inside a word anchors on that word, then and there, as Word's
  // New Comment does; the anchor follows edits while the draft is open.
  const newComposerAnchorRef = useRef<CommentDraftAnchor | null>(null);
  const newComposerAnchorLostRef = useRef(false);
  const [anchorChanged, setAnchorChanged] = useState(false);
  const openNewComposer = useCallback(() => {
    newComposerAnchorRef.current = commentDraftAnchorAt(editor.state);
    newComposerAnchorLostRef.current = false;
    setAnchorChanged(false);
    setShowNewComposer(true);
    setEditingTarget(null);
    setEditDraft("");
    setReplyDrafts({});
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }, [editor]);

  useEffect(() => {
    if (!showNewComposer) return;
    const follow = ({ transaction }: { transaction: Transaction }) => {
      const anchor = newComposerAnchorRef.current;
      if (!anchor || !transaction.docChanged) return;
      const change = transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined;
      const mapped = mapCommentDraftAnchor(anchor, transaction, Boolean(change?.isChangeOrigin));
      if (mapped) {
        newComposerAnchorRef.current = mapped;
      } else {
        newComposerAnchorLostRef.current = true;
      }
    };
    editor.on("transaction", follow);
    return () => {
      editor.off("transaction", follow);
    };
  }, [editor, showNewComposer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener(ADD_COMMENT_EVENT, openNewComposer);
    return () => window.removeEventListener(ADD_COMMENT_EVENT, openNewComposer);
  }, [openNewComposer]);

  useEffect(() => {
    if (newCommentRequestId <= 0 || typeof window === "undefined") return;
    const request = window.setTimeout(openNewComposer, 0);
    return () => window.clearTimeout(request);
  }, [newCommentRequestId, openNewComposer]);

  const authenticateRenderedSnapshot = useCallback(():
    | CommentThread[]
    | null => {
    const state = editor.state;
    if (state.doc !== snapshot.doc) return null;
    const liveThreads = materializeCommentIds(getCommentThreads(state));
    return commentThreadsSignature(liveThreads) === snapshot.signature
      ? liveThreads
      : null;
  }, [editor, snapshot.doc, snapshot.signature]);

  const authenticateRenderedThread = useCallback(
    (rendered: CommentThread): CommentThread | null => {
      const liveThreads = authenticateRenderedSnapshot();
      const liveThread = liveThreads?.find(
        (candidate) => candidate.id === rendered.id,
      );
      return liveThread &&
        commentThreadSignature(liveThread) === commentThreadSignature(rendered)
        ? liveThread
        : null;
    },
    [authenticateRenderedSnapshot],
  );

  const addComment = useCallback(() => {
    if (!draft.trim()) return;
    const anchor = newComposerAnchorRef.current;
    if (
      newComposerAnchorLostRef.current ||
      (anchor && !commentDraftAnchorIntact(editor.state.doc, anchor))
    ) {
      // The started-on text was deleted: say so instead of commenting
      // whatever is selected now; the draft stays.
      setAnchorChanged(true);
      return;
    }
    const ok = editor.commands.addComment(
      draft,
      author ?? effectiveReactionActor?.name ?? null,
      reactionActorId,
      reactionActorId ? COMMENT_REACTION_PROVIDER : null,
      anchor ? { from: anchor.from, to: anchor.to } : null,
    );
    if (!ok) return;
    newComposerAnchorRef.current = null;
    newComposerAnchorLostRef.current = false;
    setAnchorChanged(false);
    const nextThreads = materializeCommentIds(getCommentThreads(editor.state));
    const posted = nextThreads.at(-1);
    if (posted) {
      mentions?.notifyPosted({
        threadRef: posted.id,
        messageRef: posted.comments[0]?.id,
        text: draft,
      });
    }
    setActiveThreadId(posted?.id ?? null);
    setDraft("");
    setShowNewComposer(false);
    publishCurrentSnapshot();
  }, [
    author,
    draft,
    editor,
    effectiveReactionActor?.name,
    mentions,
    publishCurrentSnapshot,
    reactionActorId,
  ]);

  const submitReply = useCallback(
    (rendered: CommentThread) => {
      const liveThread = authenticateRenderedThread(rendered);
      const text = liveThread ? (replyDrafts[liveThread.id] ?? "") : "";
      if (!liveThread || liveThread.resolved || !text.trim()) return;
      const ok = editor.commands.addCommentReply(
        liveThread.id,
        text,
        author ?? effectiveReactionActor?.name ?? null,
        reactionActorId,
        reactionActorId ? COMMENT_REACTION_PROVIDER : null,
      );
      if (!ok) return;
      mentions?.notifyPosted({ threadRef: liveThread.id, text });
      setReplyDrafts((previous) => ({ ...previous, [liveThread.id]: "" }));
      publishCurrentSnapshot();
    },
    [
      authenticateRenderedThread,
      mentions,
      replyDrafts,
      editor,
      author,
      effectiveReactionActor?.name,
      reactionActorId,
      publishCurrentSnapshot,
    ],
  );

  const toggleResolved = useCallback(
    (rendered: CommentThread) => {
      const liveThread = authenticateRenderedThread(rendered);
      if (!liveThread) return;
      // An embedded session without manageComments resolves its own only.
      if (!embedAllowsManagingComment(liveThread.comments[0]?.author, author, "edit")) return;
      if (
        editor.commands.setCommentResolved(liveThread.id, !liveThread.resolved)
      ) {
        setEditingTarget(null);
        setEditDraft("");
        publishCurrentSnapshot();
      }
    },
    [author, authenticateRenderedThread, editor, publishCurrentSnapshot],
  );

  const removeThreadHandler = useCallback(
    (rendered: CommentThread) => {
      const liveThread = authenticateRenderedThread(rendered);
      if (!liveThread) return;
      if (!liveThread.comments.every((comment) => embedAllowsManagingComment(comment.author, author))) return;
      if (editor.commands.removeComment(liveThread.id)) {
        setActiveThreadId(null);
        setEditingTarget(null);
        publishCurrentSnapshot();
      }
    },
    [author, authenticateRenderedThread, editor, publishCurrentSnapshot],
  );

  const removeReplyHandler = useCallback(
    (rendered: CommentThread, replyIndex: number) => {
      const liveThread = authenticateRenderedThread(rendered);
      const renderedReply = rendered.comments[replyIndex];
      const liveReply = liveThread?.comments[replyIndex];
      if (
        !liveThread ||
        !renderedReply ||
        !liveReply ||
        replyIndex < 1 ||
        liveReply.id !== renderedReply.id ||
        liveReply.text !== renderedReply.text
      ) {
        return;
      }
      if (!embedAllowsManagingComment(liveReply.author, author)) return;
      if (editor.commands.removeCommentReply(liveThread.id, replyIndex)) {
        const rootId = liveThread.comments[0]?.id;
        if (rootId) commentFocusRefs.current.get(rootId)?.focus();
        publishCurrentSnapshot();
      }
    },
    [author, authenticateRenderedThread, editor, publishCurrentSnapshot],
  );

  const removeAllThreads = useCallback(() => {
    if (!authenticateRenderedSnapshot()) return;
    if (!embedAllowsManagingComment(null, author)) return;
    if (editor.commands.removeAllComments()) {
      setActiveThreadId(null);
      setEditingTarget(null);
      publishCurrentSnapshot();
    }
  }, [author, authenticateRenderedSnapshot, editor, publishCurrentSnapshot]);

  const focusRange = useCallback(
    (rendered: CommentThread) => {
      const liveThread = authenticateRenderedThread(rendered);
      if (!liveThread) return;
      setActiveThreadId(liveThread.id);
      setShowNewComposer(false);
      if (commentRangesFor(editor.state.doc, liveThread.id).length === 0)
        return;
      if (!editor.commands.selectCommentRange(liveThread.id)) return;
      (
        editor as RuntimeEditor & { commands: { focus: () => boolean } }
      ).commands.focus();
    },
    [authenticateRenderedThread, editor],
  );

  const toggleLike = useCallback(
    (rendered: CommentThread, commentIndex: number) => {
      const liveThread = authenticateRenderedThread(rendered);
      const commentId = rendered.comments[commentIndex]?.id;
      const actorName = effectiveReactionActor?.name ?? "";
      if (
        !liveThread ||
        !commentId ||
        !reactionActorId ||
        !actorName ||
        !writable
      ) {
        return;
      }
      if (
        editor.commands.toggleCommentLike(
          liveThread.id,
          commentId,
          reactionActorId,
          actorName,
        )
      ) {
        publishCurrentSnapshot();
      }
    },
    [
      authenticateRenderedThread,
      editor,
      effectiveReactionActor?.name,
      publishCurrentSnapshot,
      reactionActorId,
      writable,
    ],
  );

  const copyCommentLink = useCallback(
    async (rendered: CommentThread, commentIndex: number) => {
      const liveThread = authenticateRenderedThread(rendered);
      const commentId = rendered.comments[commentIndex]?.id;
      if (
        !liveThread ||
        !commentId ||
        !documentId ||
        typeof window === "undefined"
      ) {
        return;
      }
      const link = buildCommentDeepLink(window.location.href, {
        documentId,
        threadId: liveThread.id,
        commentId,
      });
      if (writable) {
        editor.commands.materializeCommentIds(liveThread.id);
        publishCurrentSnapshot();
      }
      const clipboard = globalThis.navigator?.clipboard;
      if (!link || typeof clipboard?.writeText !== "function") {
        setCopyStatus(t("comments.linkCopyFailed"));
        return;
      }
      try {
        await clipboard.writeText(link);
        setCopyStatus(t("comments.linkCopied"));
      } catch {
        setCopyStatus(t("comments.linkCopyFailed"));
      }
    },
    [
      authenticateRenderedThread,
      documentId,
      editor,
      publishCurrentSnapshot,
      t,
      writable,
    ],
  );

  const canEditMessage = useCallback(
    (comment: CommentRecord) =>
      writable &&
      Boolean(reactionActorId) &&
      comment.actorId === reactionActorId &&
      comment.actorProvider === COMMENT_REACTION_PROVIDER,
    [reactionActorId, writable],
  );

  const startEdit = useCallback(
    (rendered: CommentThread, index: number) => {
      const liveThread = authenticateRenderedThread(rendered);
      const comment = liveThread?.comments[index];
      const commentId = rendered.comments[index]?.id;
      if (
        !liveThread ||
        liveThread.resolved ||
        !comment ||
        !commentId ||
        !canEditMessage(comment)
      ) {
        return;
      }
      setShowNewComposer(false);
      setReplyDrafts({});
      setEditingTarget({ threadId: liveThread.id, commentId, index });
      setEditDraft(comment.text);
    },
    [authenticateRenderedThread, canEditMessage],
  );

  const saveEdit = useCallback(
    (rendered: CommentThread, index: number) => {
      const liveThread = authenticateRenderedThread(rendered);
      const target = editingTarget;
      if (
        !liveThread ||
        !target ||
        target.threadId !== liveThread.id ||
        target.index !== index ||
        !reactionActorId
      ) {
        return;
      }
      if (
        editor.commands.editCommentMessage(
          liveThread.id,
          target.commentId,
          editDraft,
          reactionActorId,
          COMMENT_REACTION_PROVIDER,
        )
      ) {
        mentions?.notifyPosted({
          threadRef: liveThread.id,
          messageRef: target.commentId,
          text: editDraft,
          previousText: liveThread.comments[index]?.text ?? "",
        });
        setEditingTarget(null);
        setEditDraft("");
        publishCurrentSnapshot();
      }
    },
    [
      authenticateRenderedThread,
      editDraft,
      editingTarget,
      editor,
      mentions,
      publishCurrentSnapshot,
      reactionActorId,
    ],
  );

  const anchoredThreads = useMemo(
    () => orderedAnchoredCommentThreads(snapshot.doc, snapshot.threads),
    [snapshot.doc, snapshot.threads],
  );

  const paneItems = useMemo<CommentPaneItem[]>(() => {
    // An embedded ONLYOFFICE config's commentGroups.view: the threads of
    // other groups' people are not listed.
    return snapshot.threads.filter((thread) => embedShowsComment(thread.comments[0]?.author, author)).map((thread) => {
      const ranges = commentRangesFor(snapshot.doc, thread.id);
      const firstRange = ranges[0];
      const excerpt = firstRange
        ? snapshot.doc.textBetween(firstRange.from, firstRange.to, " ")
        : "";
      return {
        anchored: ranges.length > 0,
        locationLabel: clampLocationLabel(
          excerpt,
          t("comments.anchorUnavailable"),
        ),
        thread,
      };
    });
  }, [author, snapshot.doc, snapshot.threads, t]);

  const visibleItems = useMemo(() => {
    if (viewMode === "contextual") {
      return paneItems.filter((item) => !item.thread.resolved);
    }
    if (filter === "active") {
      return paneItems.filter((item) => !item.thread.resolved);
    }
    if (filter === "resolved") {
      return paneItems.filter((item) => item.thread.resolved);
    }
    return paneItems;
  }, [filter, paneItems, viewMode]);

  const effectiveActiveThreadId = useMemo(() => {
    if (showNewComposer) return null;
    if (visibleItems.some((item) => item.thread.id === activeThreadId)) {
      return activeThreadId;
    }
    return visibleItems[0]?.thread.id ?? null;
  }, [activeThreadId, showNewComposer, visibleItems]);

  useEffect(() => {
    if (!effectiveActiveThreadId) return;
    window.setTimeout(() => {
      paneRef.current
        ?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView?.({ block: "nearest" });
    }, 0);
  }, [effectiveActiveThreadId]);

  useEffect(() => {
    if (!focusCommentRequest || typeof window === "undefined") return;
    const liveThread = snapshot.threads.find(
      (thread) => thread.id === focusCommentRequest.threadId,
    );
    const rootCommentId = liveThread?.comments[0]?.id;
    if (
      !liveThread ||
      !rootCommentId ||
      commentRangesFor(snapshot.doc, liveThread.id).length === 0
    ) {
      return;
    }
    let focusRequest: number | null = null;
    const stateRequest = window.setTimeout(() => {
      setViewMode("list");
      setFilter("all");
      setShowNewComposer(false);
      setActiveThreadId(liveThread.id);
      editor.commands.selectCommentRange(liveThread.id);
      focusRequest = window.setTimeout(() => {
        const target = commentFocusRefs.current.get(rootCommentId);
        target?.scrollIntoView?.({ block: "nearest" });
        target?.focus();
      }, 0);
    }, 0);
    return () => {
      window.clearTimeout(stateRequest);
      if (focusRequest !== null) window.clearTimeout(focusRequest);
    };
  }, [editor, focusCommentRequest, snapshot.doc, snapshot.threads]);

  const visibleAnchoredThreads = useMemo(() => {
    const visible = new Set(visibleItems.map((item) => item.thread.id));
    return anchoredThreads.filter(({ thread }) => visible.has(thread.id));
  }, [anchoredThreads, visibleItems]);

  const navigateThread = useCallback(
    (direction: -1 | 1) => {
      if (
        !authenticateRenderedSnapshot() ||
        visibleAnchoredThreads.length === 0
      ) {
        return;
      }
      // Two threads on the same words share a selection position, so the
      // caret alone named the first of them every time and Next never left
      
      const activeIndex = visibleAnchoredThreads.findIndex(
        ({ thread }) => thread.id === activeThreadId,
      );
      const target =
        activeIndex >= 0
          ? visibleAnchoredThreads[
              (activeIndex + direction + visibleAnchoredThreads.length) %
                visibleAnchoredThreads.length
            ]
          : adjacentAnchoredCommentThread(
              visibleAnchoredThreads,
              editor.state.selection.from,
              direction,
            );
      if (target) focusRange(target.thread);
    },
    [
      activeThreadId,
      authenticateRenderedSnapshot,
      editor,
      focusRange,
      visibleAnchoredThreads,
    ],
  );

  const focusDeepLinkedComment = useCallback((): boolean => {
    if (!documentId || typeof window === "undefined") return false;
    const target = parseCommentDeepLink(window.location.href);
    if (!target || target.documentId !== documentId) return false;
    const liveThread = materializeCommentIds(
      getCommentThreads(editor.state),
    ).find((thread) => thread.id === target.threadId);
    if (!liveThread || !findCommentById(liveThread, target.commentId)) {
      return false;
    }
    setViewMode("list");
    setFilter("all");
    setShowNewComposer(false);
    setActiveThreadId(liveThread.id);
    editor.commands.selectCommentRange(liveThread.id);
    window.setTimeout(() => {
      const focusTarget = commentFocusRefs.current.get(target.commentId);
      focusTarget?.scrollIntoView?.({ block: "nearest" });
      focusTarget?.focus();
    }, 0);
    return true;
  }, [documentId, editor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const initialFocus = window.setTimeout(() => {
      if (
        focusDeepLinkedComment() ||
        focusCommentRequest ||
        newCommentRequestId > 0
      ) {
        return;
      }
      paneRef.current
        ?.querySelector<HTMLElement>(
          '[data-testid="comments-panel-pane-close"]',
        )
        ?.focus();
    }, 0);
    const handleHashChange = () => {
      focusDeepLinkedComment();
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.clearTimeout(initialFocus);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [focusCommentRequest, focusDeepLinkedComment, newCommentRequestId]);

  const messageAdapter: OfficeCommentMessageAdapter<CommentRecord> = {
    getAuthor: (comment) => comment.author || t("comments.anonymous"),
    getInitials: (comment) =>
      commentInitials(comment.author, t("comments.anonymous")),
    getAuthorId: (comment) => comment.actorId ?? null,
    getKey: (comment, index) => comment.id ?? index,
    getText: (comment) => comment.text,
    getTimeLabel: (comment) => formatTimestamp(comment.timestamp),
  };
  const threadAdapter: OfficeCommentThreadAdapter<
    CommentThread,
    CommentRecord
  > = {
    getMessages: (thread) => thread.comments,
    isResolved: (thread) => thread.resolved,
  };
  const paneAdapter: OfficeCommentPaneAdapter<CommentPaneItem, CommentThread> =
    {
      getKey: (item) => item.thread.id,
      getLocationLabel: (item) => item.locationLabel,
      getReplyCountLabel: (_item, replyCount) =>
        t("comments.replyCount", { count: replyCount }),
      getThread: (item) => item.thread,
      onSelect: (item) => focusRange(item.thread),
    };

  const renderMessageActions = (
    thread: CommentThread,
    comment: CommentRecord,
    index: number,
    resolved: boolean,
  ) => {
    const commentId = comment.id;
    if (!commentId) return null;
    const preserveOnly = isCommentMediaPreserveOnlyThread(thread);
    return (
      <CommentMessageActions
        actorId={reactionActorId}
        canCopyLink={Boolean(documentId)}
        canEdit={!preserveOnly && canEditMessage(comment)}
        canMutate={writable && !preserveOnly}
        canReact={writable && !preserveOnly}
        comment={comment}
        commentId={commentId}
        index={index}
        labels={{
          deleteMessage: t("comments.deleteMessage"),
          deleteThread: t("comments.deleteThread"),
          edit: t("comments.edit"),
          editUnavailable: t("comments.editUnavailableOwnership"),
          editUnavailableResolved: t("comments.editUnavailableResolved"),
          like: t("comments.like"),
          link: t("comments.linkToComment"),
          more: t("comments.moreActions"),
          readOnly: preserveOnly
            ? t("comments.sourceMediaReadOnly")
            : t("comments.reactionReadOnly"),
          reactionUnavailable: t("comments.reactionUnavailable"),
          reopen: t("comments.reopen"),
          resolve: t("comments.resolve"),
          unlike: t("comments.unlike"),
        }}
        onCopyLink={() => void copyCommentLink(thread, index)}
        onDelete={() =>
          index === 0
            ? removeThreadHandler(thread)
            : removeReplyHandler(thread, index)
        }
        onEdit={() => startEdit(thread, index)}
        onToggleLike={() => toggleLike(thread, index)}
        onToggleResolved={() => toggleResolved(thread)}
        registerFocusTarget={(element) => {
          if (element) commentFocusRefs.current.set(commentId, element);
          else commentFocusRefs.current.delete(commentId);
        }}
        resolved={resolved}
      />
    );
  };

  // The pane's own header (title, count, previous/next, close) comes first;
  // the view controls and the composer stand under it, inside the same card,
  // instead of above a second card nested in this one.
  const paneLead = (
    <>
      <div className="comments-panel-view-controls">
        <div
          className="comments-panel-view-switch"
          role="group"
          aria-label={t("comments.view")}
        >
          <button
            type="button"
            aria-pressed={viewMode === "contextual"}
            onClick={() => {
              setViewMode("contextual");
              setShowNewComposer(false);
            }}
          >
            {t("comments.contextualView")}
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => {
              setViewMode("list");
              setShowNewComposer(false);
            }}
          >
            {t("comments.listView")}
          </button>
        </div>
        {viewMode === "list" ? (
          <select
            aria-label={t("comments.filter")}
            value={filter}
            onChange={(event) => setFilter(event.target.value as CommentFilter)}
          >
            <option value="all">{t("comments.allComments")}</option>
            <option value="active">{t("comments.activeComments")}</option>
            <option value="resolved">{t("comments.resolvedComments")}</option>
          </select>
        ) : null}
        <button
          type="button"
          className="comments-panel-new"
          data-testid="comments-panel-new"
          aria-keyshortcuts="Control+Alt+M Meta+Alt+A Meta+Alt+M Meta+Shift+M"
          disabled={selectionEmpty || !writable}
          title={selectionEmpty ? t("comments.selectToComment") : undefined}
          onClick={openNewComposer}
        >
          <MessageSquarePlus size={16} aria-hidden />
          {t("comments.newComment")}
        </button>
        <button
          type="button"
          className="comments-panel-icon-button"
          data-testid="comments-panel-delete-all"
          disabled={
            snapshot.threads.length === 0 || !writable || hasPreserveOnlyThread
          }
          onClick={removeAllThreads}
          aria-label={t("comments.deleteAll")}
          title={t("comments.deleteAll")}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      <div
        className="comments-panel-composer"
        hidden={!showNewComposer}
        data-testid="comments-panel-new-composer"
      >
        <MentionTextarea
          mentions={mentions}
          ref={composerRef}
          className="comments-panel-textarea"
          data-testid="comments-panel-composer"
          rows={3}
          value={draft}
          placeholder={
            selectionEmpty
              ? t("comments.selectToComment")
              : t("comments.composerPlaceholder")
          }
          disabled={selectionEmpty || !writable}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            const action = commentDraftKeyAction(editor, event);
            if (action === null) return;
            event.preventDefault();
            event.stopPropagation();
            if (action === "discard") {
              setDraft("");
              if (snapshot.threads.length > 0) setShowNewComposer(false);
              return;
            }
            addComment();
          }}
          aria-keyshortcuts="Meta+Enter Control+Enter Escape"
        />
        {anchorChanged ? (
          <p
            className="comments-panel-composer-error"
            role="alert"
            data-testid="comments-panel-anchor-changed"
          >
            {t("comments.anchorChanged")}
          </p>
        ) : null}
        <div className="comments-panel-composer-actions">
          <button
            type="button"
            onClick={() => {
              setDraft("");
              newComposerAnchorRef.current = null;
              setAnchorChanged(false);
              if (snapshot.threads.length > 0) setShowNewComposer(false);
            }}
          >
            {t("comments.cancel")}
          </button>
          <button
            type="button"
            className="comments-panel-add"
            data-testid="comments-panel-add"
            disabled={selectionEmpty || !writable || !draft.trim()}
            onClick={addComment}
          >
            {t("comments.post")}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <section
      className="ai-panel comments-panel"
      aria-label={t("comments.title")}
      data-testid="comments-panel"
      data-view-mode={viewMode}
      data-new-composer={showNewComposer ? "true" : undefined}
    >
      <div
        className="comments-panel-pane-stack"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            event.target instanceof HTMLSelectElement ||
            (event.target instanceof Element &&
              event.target.closest('[role="menu"]'))
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        <OfficeCommentsPane
          mentions={mentions}
          activeItemKey={effectiveActiveThreadId}
          beforeList={paneLead}
          classNames={commentsClassNames}
          emptyHint={
            filter === "resolved"
              ? t("comments.noResolvedComments")
              : t("comments.empty")
          }
          items={visibleItems}
          labels={{
            allComments: t("comments.allComments"),
            anonymous: t("comments.anonymous"),
            browse: t("comments.browse"),
            close: t("comments.close"),
            comments: t("comments.title"),
            next: t("comments.next"),
            previous: t("comments.previous"),
          }}
          messageAdapter={messageAdapter}
          onClose={onClose}
          onNext={() => navigateThread(1)}
          onPrevious={() => navigateThread(-1)}
          paneAdapter={paneAdapter}
          paneRef={paneRef}
          renderActiveThread={(item) => {
            const thread = item.thread;
            const editingIndex =
              editingTarget?.threadId === thread.id
                ? editingTarget.index
                : null;
            return (
              <div
                className="comments-panel-active-thread"
                data-editing={editingIndex !== null ? "true" : undefined}
                data-resolved={thread.resolved ? "true" : "false"}
                data-testid="comments-panel-thread"
                aria-keyshortcuts="Alt+F12"
                onKeyDownCapture={(event) => {
                  if (
                    event.target instanceof HTMLTextAreaElement &&
                    isImeCompositionActive(editor.view, event.nativeEvent)
                  ) {
                    event.stopPropagation();
                    return;
                  }
                  if (
                    event.altKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    event.key === "F12"
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    focusRange(thread);
                  }
                }}
              >
                <button
                  type="button"
                  className="comments-panel-thread-anchor"
                  data-testid="comments-panel-thread-anchor"
                  aria-keyshortcuts="Alt+F12"
                  disabled={!item.anchored}
                  aria-disabled={!item.anchored}
                  onClick={() => focusRange(thread)}
                >
                  {item.locationLabel}
                </button>
                {mentions && writable && !thread.resolved ? (
                  <p
                    className="comments-panel-copy-status"
                    data-testid="comments-panel-mention-hint"
                    role="note"
                  >
                    {t("comments.mentionHint")}
                  </p>
                ) : null}
                {isCommentMediaPreserveOnlyThread(thread) ? (
                  <p
                    className="comments-panel-copy-status"
                    data-testid="comments-panel-source-media-readonly"
                    role="note"
                  >
                    {t("comments.sourceMediaReadOnly")}
                  </p>
                ) : null}
                <OfficeCommentThread
                  canMutateThread={
                    writable && !isCommentMediaPreserveOnlyThread(thread)
                  }
                  canPost={
                    writable &&
                    !thread.resolved &&
                    !isCommentMediaPreserveOnlyThread(thread)
                  }
                  cellLabel={item.locationLabel}
                  classNames={commentsClassNames}
                  disabledReason={
                    isCommentMediaPreserveOnlyThread(thread)
                      ? t("comments.sourceMediaReadOnly")
                      : t("comments.reactionReadOnly")
                  }
                  editDraft={editDraft}
                  editingIndex={editingIndex}
                  mentions={mentions}
                  mentionThreadRef={thread.id}
                  labels={{
                    cancel: t("comments.cancel"),
                    close: t("comments.discardDraft"),
                    edit: t("comments.edit"),
                    newComment: t("comments.newComment"),
                    post: t("comments.reply"),
                    reopen: t("comments.reopen"),
                    replyPlaceholder: t("comments.replyPlaceholder"),
                    save: t("comments.save"),
                  }}
                  messageAdapter={messageAdapter}
                  mode="compact"
                  onCancelEdit={() => {
                    setEditingTarget(null);
                    setEditDraft("");
                  }}
                  onClose={() =>
                    setReplyDrafts((previous) => ({
                      ...previous,
                      [thread.id]: "",
                    }))
                  }
                  onEditDraftChange={setEditDraft}
                  onReplyDraftChange={(value) =>
                    setReplyDrafts((previous) => ({
                      ...previous,
                      [thread.id]: value,
                    }))
                  }
                  onSaveEdit={(index) => saveEdit(thread, index)}
                  onSubmitReply={() => submitReply(thread)}
                  onToggleResolved={() => toggleResolved(thread)}
                  renderMessageActions={(comment, index, resolved) =>
                    renderMessageActions(thread, comment, index, resolved)
                  }
                  replyDraft={replyDrafts[thread.id] ?? ""}
                  testIdPrefix="comments-panel"
                  thread={thread}
                  threadAdapter={threadAdapter}
                />
              </div>
            );
          }}
          testIdPrefix="comments-panel"
          threadAdapter={threadAdapter}
        />
      </div>

      <div
        className="comments-panel-copy-status"
        role="status"
        aria-live="polite"
      >
        {copyStatus}
      </div>
    </section>
  );
}
