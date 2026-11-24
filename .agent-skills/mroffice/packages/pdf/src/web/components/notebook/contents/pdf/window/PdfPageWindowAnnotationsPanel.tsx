"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The PDF window's one comments pane, the Docs comments pane in every part

// 淘汰 PDF 的过时排版设计」): the view switch 上下文 | 显示批注 with the
// all / open / resolved filter, New and Delete all; each card the commented
// words as its anchor, the @-mention hint, messages with the 👍 and "…"
// actions, the real time, and the reply box. It lists the page's notes
// (with their replies and the file's review states) and the viewer's
// annotation list (highlights, sticky notes, ink, shapes, bookmarks and the
// file's own annotations, de-duplicated against the notes). The excerpt
// page, the exports, the attachments and the AI summary are commands of the
// ribbon's Comment tab. The AI Copilot is not here any more: the top-rail


import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Wand2,
  X,
  CheckCircle2,
  Plus,
  RefreshCw,
  MessageSquarePlus,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { Loader2 } from "lucide-react";
import {
  MentionTextarea,
  type CommentMentionsController,
} from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import {
  OfficeCommentsPane,
  OfficeCommentThread,
  type OfficeCommentMessageAdapter,
  type OfficeCommentPaneAdapter,
  type OfficeCommentThreadAdapter,
  type OfficeCommentsClassNames,
} from "@mrnote/core/web/components/office-comments/OfficeCommentsPane.tsx";
import { OfficeCommentMessageActions } from "@mrnote/core/web/components/office-comments/OfficeCommentMessageActions.tsx";
import ConfirmDialog from "@mrnote/core/web/components/ui/ConfirmDialog.tsx";
import {
  writePdfOrdinaryNoteInput,
  type PdfOrdinaryNoteInputDraft,
  type PdfOrdinaryNoteInputBinding,
} from "../../../../../lib/pdf/ordinary-note-input-draft";
import { requestPdfPageOpenAt } from "../../../../../lib/pdf/pdf-page-open-requests";
import {
  sortAnnotationList,
  type AnnotationListItem,
  type AnnotationListKind,
  type AnnotationListMarkup,
  type AnnotationListReply,
} from "../../../../../lib/pdf/annotation-list";
import {
  isNativeMarkupAnnotation,
  nativeMarkupLabel,
  isManagedMarkupAnnotation,
  NATIVE_MARKUP_COLORS,
} from "./managedMarkup";
import { isNativePdfUnknownDate } from "@mrnote/core/web/lib/pdf/native-text-annotations.ts";
import type { PdfAnnotationReply } from "@mrnote/core/web/lib/pdf/annotation-replies.ts";
import { pdfSourceNoteProjectionKey } from "./sourceNotes";
import type { PdfAnnotation } from "../../../../../lib/pdf/page-content-model";
import type { PdfAnnotationListModel } from "../viewer/PDFViewerProps";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { pageInterfaceLocale } from "@mrnote/core/web/lib/i18n/content-locale.ts";

export interface PdfPageWindowAnnotationsPanelModel {
  pageId: string;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  commentMentions: CommentMentionsController | null;
  annotations: PdfAnnotation[];
  /** The viewer's annotation list and its commands (PdfAnnotationListHost);
   * null until the viewer has handed it over. */
  viewerList?: PdfAnnotationListModel | null;
  /** The page the reader is on (1-based): 上下文 lists its comments. */
  currentPage: number;
  

  selectedKey?: string | null;
  /** The page may be written: New, Delete all and the mention hint. */
  writable: boolean;
  nativeRichTextNoteKeysRef: RefObject<Set<string>>;
  rejectedAnnotationIds: ReadonlySet<string>;
  annotationDraft: string;
  annotationInputRef: RefObject<PdfOrdinaryNoteInputDraft | null>;
  annotationInputBindingRef: RefObject<PdfOrdinaryNoteInputBinding | null>;
  annotationInputRestored: boolean;
  annotationInputStorageFailed: boolean;
  setAnnotationInputStorageFailed: Dispatch<SetStateAction<boolean>>;
  annotationInputConflict: boolean;
  setAnnotationInputConflict: Dispatch<SetStateAction<boolean>>;
  setAnnotationDraft: (update: string | ((current: string) => string)) => void;
  setAnnotationsPanelOpen: Dispatch<SetStateAction<boolean>>;
  excerptStatus: { kind: "success" | "error"; text: string; } | null;
  aiSummary: { pageNumber: number; text: string; status: "error" | "streaming" | "done" | "empty"; } | null;
  setAiSummary: Dispatch<SetStateAction<{ pageNumber: number; text: string; status: "error" | "streaming" | "done" | "empty"; } | null>>;
  editingAnnotationId: string | null;
  annotationEditDraft: string;
  setAnnotationEditDraft: Dispatch<SetStateAction<string>>;
  annotationEditColorDraft: string;
  setAnnotationEditColorDraft: Dispatch<SetStateAction<string>>;
  annotationMutationBusy: boolean;
  saveVisibleAnnotationDraft: (nextAnnotations: PdfAnnotation[], onAccepted?: (() => void) | undefined) => Promise<boolean>;
  submitOrdinaryAnnotationInput: () => Promise<void>;
  nativeAnnotationProtection: (annotation: PdfAnnotation) => { readOnly: boolean; contentsLocked: boolean; deleteLocked: boolean; label: string };
  beginAnnotationEdit: (annotation: PdfAnnotation) => void;
  cancelAnnotationEdit: () => void;
  commitAnnotationEdit: () => Promise<void>;
  deleteAnnotation: (annotation: PdfAnnotation) => Promise<void>;
  replyDrafts: Record<string, string>;
  /** The reply being saved now (its thread and words): its own button
   * waits for it; other words in the box can be sent, after it. */
  replyInFlight: Readonly<{ annotationId: string; text: string }> | null;
  setReplyDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  submitReply: (annotationId: string) => Promise<void>;
  /** Resolve or reopen a note's discussion (a review state record). */
  toggleResolved?: (annotation: PdfAnnotation) => Promise<void>;
  /** Whether this person may edit a note's words, and resolve or delete it
   * (an embed comment session's own comments, or manageComments). */
  commentPermission?: (annotation: PdfAnnotation) => { edit: boolean; manage: boolean };
}

/** One card of the pane: a note of the page (replies, review states,
 * editable here), or an item of the viewer's list (a highlight, a sticky
 * note, ink, a shape, a bookmark, or an annotation the file carries). */
type PdfPaneItem =
  | { readonly kind: "note"; readonly key: string; readonly annotation: PdfAnnotation; readonly page: number | null; readonly resolved: boolean }
  | { readonly kind: "reader"; readonly key: string; readonly item: AnnotationListItem; readonly page: number | null; readonly resolved: boolean };

/** One line of a thread. */
type PdfCommentMessage =
  | { kind: "root"; annotation: PdfAnnotation }
  | { kind: "review"; state: PdfAnnotationReply }
  | { kind: "reply"; reply: PdfAnnotationReply }
  | { kind: "reader-root"; item: AnnotationListItem }
  | { kind: "reader-reply"; reply: AnnotationListReply };

type CommentViewMode = "contextual" | "list";
type CommentFilter = "all" | "active" | "resolved";

const REVIEW_STATE_NAMES = ["Accepted", "Rejected", "Cancelled", "Completed", "None", "Marked", "Unmarked"];
/** The review states that close a discussion (Acrobat's 已接受 / 已完成). */
const RESOLVING_REVIEW_STATES = new Set(["Accepted", "Completed"]);

/** The Docs comments pane's own parts, so the two panes read the same. */
const commentsClassNames: OfficeCommentsClassNames = {
  cellLabel: "comments-panel-message-location",
  messageText: "comments-panel-comment-text",
  replyComposer: "comments-panel-office-reply-composer",
};

/** Two letters for a comment avatar, as Docs' comments pane draws them. */
function commentInitials(author: string | null | undefined, fallback: string): string {
  const value = (author || fallback).trim();
  if (!value) return "?";
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return Array.from(value).slice(0, 2).join("").toUpperCase();
}

/** A message's time as the Docs pane writes it (2026年10月14日 20:00). */
function timeLabel(value: string | undefined): string | null {
  if (!value || isNativePdfUnknownDate(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(pageInterfaceLocale(), { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return null;
  }
}

/** The anchor's words, one line, as the Docs pane clamps them. */
function clampLocationLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 52 ? `${normalized.slice(0, 51)}…` : normalized;
}

/** A note is resolved when its latest review state closes it. */
function noteResolved(annotation: PdfAnnotation): boolean {
  const states: PdfAnnotationReply[] = [
    ...((annotation as { reviewStates?: PdfAnnotationReply[] }).reviewStates ?? []),
    ...(annotation.replies ?? []).filter((reply) => Boolean(reply.reviewState)),
  ];
  let latest: PdfAnnotationReply | null = null;
  for (const state of states) {
    if (!latest || String(state.createdAt ?? "") >= String(latest.createdAt ?? "")) latest = state;
  }
  return Boolean(latest?.reviewState && RESOLVING_REVIEW_STATES.has(latest.reviewState.state));
}

/** A highlight row's quoted words (its preview) and what is said about
 * them (the rest of its body, after the quote). */
function readerQuoteAndNote(item: AnnotationListItem): { quote: string; note: string } {
  const preview = item.preview.trim();
  const body = item.text ?? "";
  if (item.kind !== "highlight" || !preview) return { quote: "", note: body || preview };
  const stem = preview.replace(/…$/, "");
  const [first = "", ...rest] = body.split("\n");
  if (first.startsWith(stem)) return { quote: first || preview, note: rest.join("\n") };
  return { quote: preview, note: "" };
}

export function PdfPageWindowAnnotationsPanel({ panel }: { panel: PdfPageWindowAnnotationsPanelModel }) {
  const {
    pageId,
    t,
    commentMentions,
    annotations,
    viewerList = null,
    currentPage,
    selectedKey = null,
    writable,
    nativeRichTextNoteKeysRef,
    rejectedAnnotationIds,
    annotationDraft,
    annotationInputRef,
    annotationInputBindingRef,
    annotationInputRestored,
    annotationInputStorageFailed,
    setAnnotationInputStorageFailed,
    annotationInputConflict,
    setAnnotationInputConflict,
    setAnnotationDraft,
    setAnnotationsPanelOpen,
    excerptStatus,
    aiSummary,
    setAiSummary,
    editingAnnotationId,
    annotationEditDraft,
    setAnnotationEditDraft,
    annotationEditColorDraft,
    setAnnotationEditColorDraft,
    annotationMutationBusy,
    saveVisibleAnnotationDraft,
    submitOrdinaryAnnotationInput,
    nativeAnnotationProtection,
    beginAnnotationEdit,
    cancelAnnotationEdit,
    commitAnnotationEdit,
    deleteAnnotation,
    replyDrafts,
    replyInFlight,
    setReplyDrafts,
    submitReply,
    toggleResolved,
    commentPermission,
  } = panel;
  const paneRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CommentViewMode>("list");
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [readerDeleting, setReaderDeleting] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  // The annotation selected on the page is the pane's active card, as the
  // card clicked in the pane is; the composer closes for it.
  useEffect(() => {
    if (!selectedKey) return;
    setComposerOpen(false);
    setActiveKey(selectedKey);
  }, [selectedKey]);

  const anonymous = t("comments.anonymous");

  // ---- the one list ---------------------------------------------------
  const noteItems = useMemo<PdfPaneItem[]>(
    () =>
      annotations.map((annotation) => ({
        kind: "note",
        key: `note:${annotation.id}`,
        annotation,
        page: typeof annotation.page === "number" ? annotation.page : null,
        resolved: noteResolved(annotation),
      })),
    [annotations],
  );
  const readerItems = useMemo<PdfPaneItem[]>(() => {
    if (!viewerList) return [];
    // The file's own annotations are the page's notes too (same ids), and so
    // is a sticky note the reader keeps (its pdf_note row): listed once, as
    // the note, which is editable and replied to here. A new sticky note was
    // listed twice and counted as two (user audit PDF 0075).
    const noteIds = new Set(annotations.map((annotation) => annotation.id));
    return sortAnnotationList(viewerList.items)
      .filter((item) => !((item.origin === "pdf" || item.kind === "note") && noteIds.has(item.id)))
      .map((item) => ({
        kind: "reader",
        key: `${item.kind}:${item.id}`,
        item,
        page: item.page,
        resolved: item.reviewState === "resolved",
      }));
  }, [annotations, viewerList]);
  const allItems = useMemo<PdfPaneItem[]>(() => {
    const merged = [...noteItems, ...readerItems];
    // Page order, the notes without a page first; stable within a page.
    return merged
      .map((item, index) => ({ item, index }))
      .sort((left, right) => (left.item.page ?? 0) - (right.item.page ?? 0) || left.index - right.index)
      .map(({ item }) => item);
  }, [noteItems, readerItems]);
  // 上下文 is the page being read (and the document's own notes), open
  // ones only, as Docs' contextual view; 显示批注 is every comment, through
  // the all / open / resolved filter.
  const items = useMemo(() => {
    if (viewMode === "contextual") {
      return allItems.filter((item) => !item.resolved && (item.page === null || item.page === currentPage));
    }
    if (filter === "active") return allItems.filter((item) => !item.resolved);
    if (filter === "resolved") return allItems.filter((item) => item.resolved);
    return allItems;
  }, [allItems, currentPage, filter, viewMode]);

  // The draft card opens by itself while there is nothing to list (as the
  // Docs pane opens empty), and on New.
  const [composerOpen, setComposerOpen] = useState(
    () => allItems.length === 0 || Boolean(annotationDraft.trim()),
  );
  const annotationDraftRef = useRef(annotationDraft);
  useEffect(() => {
    annotationDraftRef.current = annotationDraft;
  }, [annotationDraft]);
  useEffect(() => {
    if (allItems.length === 0) setComposerOpen(true);
    else if (!annotationDraftRef.current.trim()) setComposerOpen(false);
  }, [allItems.length]);
  const openComposer = useCallback(() => {
    setComposerOpen(true);
    setActiveKey(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const closePane = useCallback(() => setAnnotationsPanelOpen(false), [setAnnotationsPanelOpen]);

  // ---- words ----------------------------------------------------------
  const kindLabelOne = useCallback(
    (kind: AnnotationListKind, markup?: AnnotationListMarkup): string => {
      switch (kind) {
        case "highlight":
          return markup === "underline" ? t("pdfViewer.annotationsKindUnderlineOne")
            : markup === "strikeout" ? t("pdfViewer.annotationsKindStrikeoutOne")
            : markup === "squiggly" ? t("pdfViewer.annotationsKindSquigglyOne")
            : t("pdfViewer.annotationsKindHighlightOne");
        case "note": return t("pdfViewer.annotationsKindNoteOne");
        case "ink": return t("pdfViewer.annotationsKindInkOne");
        case "shape": return t("pdfViewer.annotationsKindShapeOne");
        case "bookmark": return t("pdfViewer.annotationsKindBookmarkOne");
        default: return kind;
      }
    },
    [t],
  );
  // The anchor: the words the comment is on (a highlight's or underline's
  // quote, a note's quote); without any, the page it is on.
  const anchorLabel = useCallback(
    (entry: PdfPaneItem): string => {
      const quote = entry.kind === "note"
        ? (entry.annotation.quote ?? "")
        : readerQuoteAndNote(entry.item).quote;
      if (quote.trim()) return clampLocationLabel(quote);
      if (entry.page) return t("pdf.excerptPage.pageHeading", { page: entry.page });
      return t("comments.anchorUnavailable");
    },
    [t],
  );
  const reviewStateLabel = useCallback(
    (state: PdfAnnotationReply["reviewState"]): string =>
      state
        ? t(`pdf.reviewState.${REVIEW_STATE_NAMES.includes(state.state) ? state.state : "Other"}` as Parameters<typeof t>[0], { state: state.state })
        : "",
    [t],
  );
  const rootText = useCallback(
    (annotation: PdfAnnotation): string =>
      annotation.text ||
      nativeMarkupLabel(annotation) ||
      (annotation.nativeSource?.kind === "pdf_text_annotation" ? t("pdf.emptyNote") : ""),
    [t],
  );
  const readerRootText = useCallback(
    (item: AnnotationListItem): string => {
      const { note } = readerQuoteAndNote(item);
      return note.trim() || kindLabelOne(item.kind, item.markup);
    },
    [kindLabelOne],
  );

  // ---- adapters -------------------------------------------------------
  const messagesByKey = useMemo(() => {
    const map = new Map<string, PdfCommentMessage[]>();
    for (const entry of allItems) {
      if (entry.kind === "note") {
        const { annotation } = entry;
        const reviewStates = (annotation as { reviewStates?: PdfAnnotationReply[] }).reviewStates ?? [];
        map.set(entry.key, [
          { kind: "root", annotation },
          ...reviewStates.map((state): PdfCommentMessage => ({ kind: "review", state })),
          ...(annotation.replies ?? []).map((reply): PdfCommentMessage => ({ kind: "reply", reply })),
        ]);
      } else {
        map.set(entry.key, [
          { kind: "reader-root", item: entry.item },
          ...(entry.item.replies ?? []).map((reply): PdfCommentMessage => ({ kind: "reader-reply", reply })),
        ]);
      }
    }
    return map;
  }, [allItems]);
  const messageAdapter: OfficeCommentMessageAdapter<PdfCommentMessage> = useMemo(
    () => ({
      getAuthor: (message) =>
        (message.kind === "root" ? message.annotation.author
          : message.kind === "reply" ? message.reply.author?.displayName
          : message.kind === "review" ? message.state.author?.displayName
          : message.kind === "reader-root" ? message.item.authorName
          : message.reply.authorName) || anonymous,
      getInitials: (message) =>
        commentInitials(
          message.kind === "root" ? message.annotation.author
            : message.kind === "reply" ? message.reply.author?.displayName
            : message.kind === "review" ? message.state.author?.displayName
            : message.kind === "reader-root" ? message.item.authorName
            : message.reply.authorName,
          anonymous,
        ),
      getKey: (message) =>
        message.kind === "root" ? message.annotation.id
          : message.kind === "reply" ? message.reply.id
          : message.kind === "review" ? `review:${message.state.id}`
          : message.kind === "reader-root" ? message.item.id
          : `reader-reply:${message.reply.id}`,
      getText: (message) =>
        message.kind === "root" ? rootText(message.annotation)
          : message.kind === "reply"
            ? [message.reply.reviewState ? reviewStateLabel(message.reply.reviewState) : "", message.reply.text].filter(Boolean).join("\n")
          : message.kind === "review" ? reviewStateLabel(message.state.reviewState)
          : message.kind === "reader-root" ? readerRootText(message.item)
          : message.reply.fullText || message.reply.text,
      getTimeLabel: (message) =>
        message.kind === "root" ? timeLabel(message.annotation.createdAt)
          : message.kind === "reply" ? timeLabel(message.reply.createdAt)
          : message.kind === "review" ? timeLabel(message.state.createdAt)
          : null,
    }),
    [anonymous, readerRootText, reviewStateLabel, rootText],
  );
  const threadAdapter: OfficeCommentThreadAdapter<PdfPaneItem, PdfCommentMessage> = useMemo(
    () => ({
      getMessages: (entry) => messagesByKey.get(entry.key) ?? [],
      isResolved: (entry) => entry.resolved,
    }),
    [messagesByKey],
  );
  const goToItem = useCallback(
    (entry: PdfPaneItem) => {
      if (entry.kind === "reader") viewerList?.onNavigate(entry.item);
      else if (entry.page) requestPdfPageOpenAt(pageId, entry.page);
    },
    [pageId, viewerList],
  );
  const selectItem = useCallback(
    (entry: PdfPaneItem) => {
      setComposerOpen(false);
      setActiveKey(entry.key);
      goToItem(entry);
    },
    [goToItem],
  );
  const paneAdapter: OfficeCommentPaneAdapter<PdfPaneItem, PdfPaneItem> = useMemo(
    () => ({
      getKey: (entry) => entry.key,
      getLocationLabel: anchorLabel,
      getReplyCountLabel: (_entry, replyCount) => t("comments.replyCount", { count: replyCount }),
      getThread: (entry) => entry,
      onSelect: selectItem,
    }),
    [anchorLabel, selectItem, t],
  );

  const effectiveActiveKey = useMemo(() => {
    if (composerOpen) return null;
    if (items.some((entry) => entry.key === activeKey)) return activeKey;
    return items[0]?.key ?? null;
  }, [activeKey, composerOpen, items]);
  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (items.length === 0) return;
      const index = items.findIndex((entry) => entry.key === effectiveActiveKey);
      const next = items[(Math.max(index, 0) + direction + items.length) % items.length];
      if (next) selectItem(next);
    },
    [effectiveActiveKey, items, selectItem],
  );

  const threadLabels = useMemo(
    () => ({
      cancel: t("comments.cancel"),
      close: t("comments.discardDraft"),
      edit: t("comments.edit"),
      newComment: t("comments.newComment"),
      post: t("comments.reply"),
      reopen: t("comments.reopen"),
      replyPlaceholder: t("pdf.replyPlaceholder"),
      save: t("comments.save"),
    }),
    [t],
  );
  const actionLabels = useMemo(
    () => ({
      deleteMessage: t("comments.deleteMessage"),
      deleteThread: t("comments.deleteThread"),
      edit: t("comments.edit"),
      link: t("comments.linkToComment"),
      more: t("comments.moreActions"),
      reopen: t("comments.reopen"),
      resolve: t("comments.resolve"),
    }),
    [t],
  );

  const readerDeletable = useCallback(
    (item: AnnotationListItem) =>
      Boolean(viewerList?.onDeleteSelected) && item.origin !== "pdf" && !item.readOnly,
    [viewerList],
  );
  const noteDeletable = useCallback(
    (annotation: PdfAnnotation) =>
      !isManagedMarkupAnnotation(annotation) && !nativeAnnotationProtection(annotation).deleteLocked,
    [nativeAnnotationProtection],
  );
  const deleteReaderItem = useCallback(
    async (item: AnnotationListItem) => {
      const remove = viewerList?.onDeleteSelected;
      if (!remove || !readerDeletable(item) || readerDeleting) return;
      setReaderDeleting(item.id);
      try {
        await remove([{ id: item.id, kind: item.kind }]);
      } finally {
        setReaderDeleting(null);
      }
    },
    [readerDeletable, readerDeleting, viewerList],
  );
  const deletableNotes = useMemo(() => annotations.filter(noteDeletable), [annotations, noteDeletable]);
  const deletableReaderItems = useMemo(
    () => readerItems.flatMap((entry) => (entry.kind === "reader" && readerDeletable(entry.item) ? [entry.item] : [])),
    [readerDeletable, readerItems],
  );
  const deleteAllDisabled =
    !writable ||
    deletingAll ||
    annotationMutationBusy ||
    Boolean(viewerList?.disabled) ||
    deletableNotes.length + deletableReaderItems.length === 0;
  // Every comment that may be deleted (a locked one stays): the list's in
  // one batch, the notes one after another, each written as its own delete.
  const deleteAll = useCallback(async () => {
    setDeleteAllOpen(false);
    setDeletingAll(true);
    try {
      if (deletableReaderItems.length > 0 && viewerList?.onDeleteSelected) {
        await viewerList.onDeleteSelected(deletableReaderItems.map((item) => ({ id: item.id, kind: item.kind })));
      }
      for (const annotation of deletableNotes) await deleteAnnotation(annotation);
      setActiveKey(null);
    } finally {
      setDeletingAll(false);
    }
  }, [deletableNotes, deletableReaderItems, deleteAnnotation, viewerList]);

  // Not a sign-in matter (the reader is signed in): a PDF comment keeps no
  // reactions in the file, as in WPS (user audit PDF 0077).
  const likeUnavailable = t("comments.reactionUnsupportedPdf");
  // Resolving writes a review state record into the note's thread: not on a
  // markup, a nested thread, a note cut short, or one whose file holds a
  // review history of its own (the writer writes the thread whole).
  const noteResolvable = (annotation: PdfAnnotation): boolean =>
    Boolean(toggleResolved) &&
    writable &&
    !annotationMutationBusy &&
    !isNativeMarkupAnnotation(annotation) &&
    !(annotation.nativeSource?.kind === "pdf_text_annotation" && annotation.nativeSource.nestedReplies) &&
    !annotation.nativeSource?.textTruncated &&
    ((annotation as { reviewStates?: PdfAnnotationReply[] }).reviewStates ?? []).length === 0 &&
    (commentPermission?.(annotation).manage ?? true);
  const renderMessageActions = (entry: PdfPaneItem, message: PdfCommentMessage, index: number, resolved: boolean) => {
    const id = entry.kind === "note" ? entry.annotation.id : entry.item.id;
    const messageId = messageAdapter.getKey(message, index);
    // PDF comments keep no reactions: 👍 is there, unavailable, as in Docs
    // for a reader who cannot react.
    const like = { count: 0, liked: false, label: likeUnavailable, title: likeUnavailable, disabled: true, onToggle: () => undefined };
    const unavailable = { disabled: true, onSelect: () => undefined };
    let edit: { disabled: boolean; disabledReason?: string; onSelect: () => void } = unavailable;
    let remove: { disabled: boolean; disabledReason?: string; onSelect: () => void } = unavailable;
    let resolve: { disabled: boolean; disabledReason?: string; onSelect: () => void } = unavailable;
    if (index === 0 && entry.kind === "note" && message.kind === "root") {
      const { annotation } = entry;
      if (!isManagedMarkupAnnotation(annotation)) {
        const protection = nativeAnnotationProtection(annotation);
        const allowed = commentPermission?.(annotation) ?? { edit: true, manage: true };
        edit = {
          disabled: annotationMutationBusy || protection.contentsLocked || resolved || !allowed.edit,
          disabledReason: protection.contentsLocked ? protection.label : undefined,
          onSelect: () => beginAnnotationEdit(annotation),
        };
        remove = {
          disabled: annotationMutationBusy || protection.deleteLocked || !allowed.manage,
          disabledReason: protection.deleteLocked ? protection.label : undefined,
          onSelect: () => void deleteAnnotation(annotation),
        };
        if (noteResolvable(annotation)) {
          resolve = { disabled: false, onSelect: () => void toggleResolved?.(annotation) };
        }
      }
    } else if (index === 0 && entry.kind === "reader") {
      const { item } = entry;
      if (readerDeletable(item)) {
        remove = {
          disabled: Boolean(viewerList?.disabled) || readerDeleting !== null,
          onSelect: () => void deleteReaderItem(item),
        };
      }
    }
    return (
      <OfficeCommentMessageActions
        commentId={String(messageId)}
        index={index}
        resolved={resolved}
        like={like}
        link={unavailable}
        edit={edit}
        resolve={resolve}
        remove={remove}
        labels={actionLabels}
        testIds={{
          like: `pdf-annotation-${id}-like-${index}`,
          menu: `pdf-annotation-${id}-message-menu-${index}`,
          link: `pdf-annotation-${id}-link-${index}`,
          edit: index === 0 ? `pdf-annotation-edit-${id}` : `pdf-annotation-${id}-edit-${index}`,
          resolve: `pdf-annotation-${id}-resolve`,
          remove: index === 0 ? `pdf-annotation-delete-${id}` : `pdf-annotation-${id}-delete-${index}`,
        }}
      />
    );
  };

  // What the file says about a note beside its words: not saved yet, or
  // locked by the file.
  const renderNoteStatus = (annotation: PdfAnnotation) => {
    const notes: { key: string; text: string; testId: string }[] = [];
    if (rejectedAnnotationIds.has(annotation.id)) {
      notes.push({ key: "unsaved", text: t("pdf.pageWindow.lastSaveFailedChangeNot"), testId: `pdf-annotation-unsaved-${annotation.id}` });
    }
    const flags = annotation.nativeSource?.flags;
    if (flags?.readOnly || flags?.lockedContents || flags?.locked) {
      notes.push({ key: "protected", text: nativeAnnotationProtection(annotation).label, testId: `pdf-native-annotation-protected-${annotation.id}` });
    }
    return notes.map((note) => (
      <p key={note.key} className="comments-panel-copy-status" role="note" data-testid={note.testId}>
        {note.text}
      </p>
    ));
  };

  const renderAnchor = (entry: PdfPaneItem) => (
    <button
      type="button"
      className="comments-panel-thread-anchor"
      data-testid="comments-panel-thread-anchor"
      disabled={entry.kind === "note" && !entry.page}
      aria-disabled={entry.kind === "note" && !entry.page}
      onClick={() => goToItem(entry)}
    >
      {anchorLabel(entry)}
    </button>
  );

  const renderActiveThread = (entry: PdfPaneItem) => {
    if (entry.kind === "reader") {
      const { item } = entry;
      return (
        <div className="comments-panel-active-thread" data-resolved={entry.resolved ? "true" : "false"} data-testid="comments-panel-thread">
          {renderAnchor(entry)}
          <OfficeCommentThread
            canMutateThread={false}
            canPost={false}
            cellLabel={anchorLabel(entry)}
            classNames={commentsClassNames}
            disabledReason={t("pdfViewer.annotationsGoTo", { page: item.page })}
            editDraft=""
            editingIndex={null}
            mentions={commentMentions}
            labels={threadLabels}
            messageAdapter={messageAdapter}
            mode="compact"
            onCancelEdit={() => undefined}
            onEditDraftChange={() => undefined}
            onReplyDraftChange={() => undefined}
            onSaveEdit={() => undefined}
            onSubmitReply={() => undefined}
            onToggleResolved={() => undefined}
            renderMessageActions={(message, index, resolved) => renderMessageActions(entry, message, index, resolved)}
            replyDraft=""
            testIdPrefix={`pdf-annotation-${item.id}`}
            thread={entry}
            threadAdapter={threadAdapter}
          />
        </div>
      );
    }
    const { annotation } = entry;
    const editing = editingAnnotationId === annotation.id;
    // A highlight's or underline's words and colour are edited together,
    // under the thread; a note's words in the thread's own edit box.
    const markup = isNativeMarkupAnnotation(annotation);
    const nested =
      !markup &&
      annotation.nativeSource?.kind === "pdf_text_annotation" &&
      Boolean(annotation.nativeSource.nestedReplies);
    const truncated = Boolean(annotation.nativeSource?.textTruncated);
    const canPost = !markup && !nested && !truncated && !entry.resolved;
    const canResolve = noteResolvable(annotation);
    const disabledReason = nested
      ? t("pdf.replyNestedUnsupported")
      : truncated
        ? t("pdf.pageWindow.annotationTextTooLongToEdit")
        : undefined;
    const replyDraft = replyDrafts[annotation.id] ?? "";
    return (
      <div
        className="comments-panel-active-thread"
        data-editing={editing ? "true" : undefined}
        data-resolved={entry.resolved ? "true" : "false"}
        data-testid="comments-panel-thread"
      >
        {renderAnchor(entry)}
        {commentMentions && writable && canPost ? (
          <p className="comments-panel-copy-status" data-testid="comments-panel-mention-hint" role="note">
            {t("comments.mentionHint")}
          </p>
        ) : null}
        {renderNoteStatus(annotation)}
        <OfficeCommentThread
          canMutateThread={canResolve}
          canPost={canPost}
          cellLabel={anchorLabel(entry)}
          classNames={commentsClassNames}
          disabledReason={disabledReason}
          editDraft={annotationEditDraft}
          editingIndex={editing && !markup ? 0 : null}
          mentions={commentMentions}
          mentionThreadRef={annotation.id}
          labels={threadLabels}
          messageAdapter={messageAdapter}
          mode="compact"
          onCancelEdit={cancelAnnotationEdit}
          onClose={() => setReplyDrafts((previous) => ({ ...previous, [annotation.id]: "" }))}
          onEditDraftChange={setAnnotationEditDraft}
          onReplyDraftChange={(value) => setReplyDrafts((previous) => ({ ...previous, [annotation.id]: value }))}
          onSaveEdit={() => void commitAnnotationEdit()}
          onSubmitReply={() => {
            if (!replyDraft.trim()) return;
            if (replyInFlight?.annotationId === annotation.id && replyInFlight.text === replyDraft.trim()) return;
            void submitReply(annotation.id);
          }}
          onToggleResolved={() => {
            if (canResolve) void toggleResolved?.(annotation);
          }}
          renderMessageActions={(message, index, resolved) => renderMessageActions(entry, message, index, resolved)}
          replyDraft={replyDraft}
          testIdPrefix={`pdf-annotation-${annotation.id}`}
          thread={entry}
          threadAdapter={threadAdapter}
        />
        {editing && annotation.nativeSource?.kind === "pdf_text_annotation" &&
        nativeRichTextNoteKeysRef.current.has(pdfSourceNoteProjectionKey(annotation.nativeSource)) ? (
          <p className="comments-panel-copy-status" role="note" data-testid={`pdf-annotation-rich-text-hint-${annotation.id}`}>
            {t("pdf.richNoteEditHint")}
          </p>
        ) : null}
        {editing && markup ? (
          <div className="comments-panel-composer">
            <MentionTextarea
              mentions={commentMentions}
              className="comments-panel-textarea"
              value={annotationEditDraft}
              autoFocus
              rows={2}
              aria-label={t("pdf.editText")}
              data-testid={`pdf-annotation-edit-input-${annotation.id}`}
              onChange={(event) => setAnnotationEditDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void commitAnnotationEdit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelAnnotationEdit();
                }
              }}
            />
            <div
              className="pdf-page-window__annotation-color-editor"
              role="group"
              aria-label={`${nativeMarkupLabel(annotation)} color`}
              data-testid={`pdf-annotation-color-editor-${annotation.id}`}
            >
              {NATIVE_MARKUP_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="pdf-page-window__annotation-color-swatch"
                  style={{ backgroundColor: color }}
                  aria-label={color}
                  aria-pressed={annotationEditColorDraft === color}
                  data-testid={`pdf-annotation-color-${annotation.id}-${color.slice(1)}`}
                  disabled={annotationMutationBusy}
                  onClick={() => setAnnotationEditColorDraft(color)}
                >
                  {annotationEditColorDraft === color ? <CheckCircle2 size={16} aria-hidden /> : null}
                </button>
              ))}
              <input
                type="color"
                className="pdf-page-window__annotation-color-custom"
                value={annotationEditColorDraft}
                aria-label={`${nativeMarkupLabel(annotation)} ${t("pdf.pageWindow.customColor")}`}
                data-testid={`pdf-annotation-color-custom-${annotation.id}`}
                disabled={annotationMutationBusy}
                onChange={(event) => setAnnotationEditColorDraft(event.target.value.toUpperCase())}
              />
              <span aria-live="polite">{annotationEditColorDraft}</span>
            </div>
            <div className="comments-panel-composer-actions">
              <button type="button" onClick={cancelAnnotationEdit} disabled={annotationMutationBusy}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="comments-panel-add"
                data-testid={`pdf-annotation-edit-save-${annotation.id}`}
                disabled={annotationMutationBusy}
                onClick={() => void commitAnnotationEdit()}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  // The Docs pane's view controls: the view switch, its filter, New and
  // Delete all.
  const paneLead = (
    <>
      <div className="comments-panel-view-controls" data-testid="pdf-annotations-tools">
        <div className="comments-panel-view-switch" role="group" aria-label={t("comments.view")}>
          <button
            type="button"
            aria-pressed={viewMode === "contextual"}
            data-testid="pdf-annotations-view-contextual"
            onClick={() => {
              setViewMode("contextual");
              setComposerOpen(false);
            }}
          >
            {t("comments.contextualView")}
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            data-testid="pdf-annotations-view-list"
            onClick={() => {
              setViewMode("list");
              setComposerOpen(false);
            }}
          >
            {t("comments.listView")}
          </button>
        </div>
        {viewMode === "list" ? (
          <select
            aria-label={t("comments.filter")}
            value={filter}
            data-testid="pdf-annotations-filter"
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
          data-testid="pdf-annotations-new"
          disabled={!writable}
          onClick={openComposer}
        >
          <MessageSquarePlus size={16} aria-hidden />
          {t("comments.newComment")}
        </button>
        <button
          type="button"
          className="comments-panel-icon-button"
          data-testid="pdf-annotations-delete-all"
          disabled={deleteAllDisabled}
          aria-busy={deletingAll || undefined}
          onClick={() => setDeleteAllOpen(true)}
          aria-label={t("comments.deleteAll")}
          title={t("comments.deleteAll")}
        >
          {deletingAll ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Trash2 size={16} aria-hidden />}
        </button>
      </div>
      {viewerList?.reading ? (
        <p className="comments-panel-copy-status" role="status" data-testid="pdf-annotations-reading">
          <Loader2 size={13} className="animate-spin" aria-hidden /> {t("pdfViewer.annotationsReading")}
        </p>
      ) : null}
      {viewerList && (viewerList.loadFailureCount ?? 0) > 0 && viewerList.onRetryLoad ? (
        <p className="pdf-page-window__excerpt-status is-error" role="alert" data-testid="pdf-annotations-load-recovery" data-load-failure-count={viewerList.loadFailureCount}>
          {t("pdfViewer.annotationsLoadFailed")}{" "}
          <button type="button" onClick={viewerList.onRetryLoad} disabled={viewerList.loadRetrying} data-testid="pdf-annotations-load-retry">
            <RefreshCw size={12} aria-hidden /> {t("pdfViewer.retry")}
          </button>
        </p>
      ) : null}
      {viewerList?.deleteSelectedError ? (
        <p className="pdf-page-window__excerpt-status is-error" role="alert" data-testid="pdf-annotations-delete-error">
          {t("pdfViewer.annotationsDeleteSelectedFailed")}
        </p>
      ) : null}
      <div className="comments-panel-composer" hidden={!composerOpen} data-testid="pdf-annotation-composer">
        <MentionTextarea
          mentions={commentMentions}
          ref={composerRef}
          className="comments-panel-textarea"
          rows={3}
          value={annotationDraft}
          placeholder={t("pdf.annotationPlaceholder")}
          onChange={(event) => setAnnotationDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (allItems.length > 0) setComposerOpen(false);
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submitOrdinaryAnnotationInput();
            }
          }}
          aria-keyshortcuts="Meta+Enter Control+Enter Escape"
        />
        {annotationInputRestored ? (
          <p className="comments-panel-copy-status" role="status" data-testid="pdf-ordinary-note-draft-restored">
            {t("pdf.pageWindow.yourNoteDraftRestoredNot")}
          </p>
        ) : null}
        {annotationInputStorageFailed ? (
          <p className="comments-panel-copy-status" role="status" data-testid="pdf-ordinary-note-draft-storage-failed">
            {t("pdf.pageWindow.browserCouldNotKeepDraft")}
          </p>
        ) : null}
        {annotationInputConflict ? (
          <button
            type="button"
            data-testid="pdf-note-draft-new-copy"
            onClick={() => {
              const text = annotationInputRef.current?.text ?? "";
              const next = text ? { id: crypto.randomUUID(), text } : null;
              annotationInputRef.current = next;
              setAnnotationInputStorageFailed(!writePdfOrdinaryNoteInput(annotationInputBindingRef.current, next));
              setAnnotationInputConflict(false);
            }}
          >
            {t("pdf.pageWindow.keepNewNoteDraft")}
          </button>
        ) : null}
        <div className="comments-panel-composer-actions">
          <button
            type="button"
            onClick={() => {
              setAnnotationDraft("");
              if (allItems.length > 0) setComposerOpen(false);
            }}
          >
            {t("comments.cancel")}
          </button>
          <button
            type="button"
            className="comments-panel-add"
            data-testid="pdf-annotation-add"
            disabled={!annotationDraft.trim()}
            onClick={() => void submitOrdinaryAnnotationInput()}
          >
            {t("comments.post")}
          </button>
        </div>
      </div>
      {excerptStatus ? (
        <div
          className={`pdf-page-window__excerpt-status${excerptStatus.kind === "error" ? " is-error" : ""}`}
          role="status"
          data-testid="pdf-annotations-excerpt-status"
        >
          {excerptStatus.text}
        </div>
      ) : null}
      {aiSummary ? (
        null
      ) : null}
    </>
  );

  return (
    <aside className="pdf-page-window__annotations pdf-page-window__annotations--comments" data-testid="pdf-annotations-panel">
      <section
        className="ai-panel comments-panel"
        aria-label={t("comments.title")}
        data-testid="pdf-comments-panel"
        data-view-mode={viewMode}
        data-new-composer={composerOpen ? "true" : undefined}
      >
        <div
          className="comments-panel-pane-stack"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (
              event.target instanceof HTMLInputElement ||
              event.target instanceof HTMLTextAreaElement ||
              event.target instanceof HTMLSelectElement ||
              (event.target instanceof Element && event.target.closest('[role="menu"]'))
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            closePane();
          }}
        >
          <OfficeCommentsPane
            mentions={commentMentions}
            activeItemKey={effectiveActiveKey}
            beforeList={paneLead}
            classNames={commentsClassNames}
            emptyHint={filter === "resolved" && viewMode === "list" ? t("comments.noResolvedComments") : t("comments.empty")}
            items={items}
            labels={{
              allComments: t("comments.allComments"),
              anonymous,
              browse: t("comments.browse"),
              close: t("comments.close"),
              comments: t("comments.title"),
              next: t("comments.next"),
              previous: t("comments.previous"),
            }}
            messageAdapter={messageAdapter}
            onClose={closePane}
            onNext={() => navigate(1)}
            onPrevious={() => navigate(-1)}
            paneAdapter={paneAdapter}
            paneRef={paneRef}
            renderActiveThread={renderActiveThread}
            testIdPrefix="pdf-annotations"
            threadAdapter={threadAdapter}
          />
        </div>
      </section>
      <ConfirmDialog
        open={deleteAllOpen}
        title={t("comments.deleteAll")}
        confirmLabel={t("pdfAnnotation.delete")}
        cancelLabel={t("comments.cancel")}
        confirmVariant="destructive"
        onConfirm={() => void deleteAll()}
        onCancel={() => setDeleteAllOpen(false)}
      />
    </aside>
  );
}
