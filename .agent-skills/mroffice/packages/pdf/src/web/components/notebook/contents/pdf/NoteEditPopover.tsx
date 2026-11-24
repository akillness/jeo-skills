"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Trash2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useDraftCommitOnLeave } from "@mrnote/core/web/lib/draft-commit-on-leave.ts";

import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  CommentMentionNotice,
  MentionTextarea,
  type CommentMentionsController,
} from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import {
  OfficeCommentPopover,
  OfficeCommentThread,
  type OfficeCommentMessageAdapter,
  type OfficeCommentThreadAdapter,
} from "@mrnote/core/web/components/office-comments/OfficeCommentsPane.tsx";

import {
  MAX_REPLY_TEXT,
  type PdfAnnotationReply,
} from "@mrnote/core/web/lib/pdf/annotation-replies.ts";
import {
  DEFAULT_NOTE_COLOR,
  PDF_NOTE_COLORS,
  PDF_NOTE_MAX_TEXT,
  normalizeNoteText,
} from "@mrnote/core/web/lib/pdf/sticky-notes.ts";
import {
  planNotePopoverPlacement,
  type NotePopoverPlacement,
} from "../../../../lib/pdf/note-popover-placement";
import { pageInterfaceLocale } from "@mrnote/core/web/lib/i18n/content-locale.ts";

// Static anchor clamps (page-relative percent): the first frame's position,
// before the popover has measured itself against the page (see
// planNotePopoverPlacement, which then keeps it wholly on the paper).
const NOTE_POPOVER_MAX_LEFT = 88;

/** The note and its replies as the shared comment thread's messages (the
 * Docs comments pane's rows: avatar, author, text, time), the same thread
 * the page window's annotations panel draws (audit F1). */
type NoteThreadMessage =
  | Readonly<{ kind: "root" }>
  | Readonly<{ kind: "reply"; reply: PdfAnnotationReply }>;
type NoteThread = Readonly<{
  text: string;
  replies: readonly PdfAnnotationReply[];
  resolved: boolean;
}>;

function commentInitials(author: string | null | undefined, fallback: string): string {
  const value = (author || fallback).trim();
  if (!value) return "?";
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return Array.from(value).slice(0, 2).join("").toUpperCase();
}

function replyTimeLabel(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(pageInterfaceLocale(), { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return null;
  }
}
const NOTE_POPOVER_MAX_TOP = 92;

export interface NoteEditPopoverProps {
  /** Page-relative anchor in percent [0..100] (positions the popover). */
  x: number;
  y: number;
  /** Current note text (already normalized). Empty for a freshly-placed note. */
  text: string;
  /** Current marker color (one of PDF_NOTE_COLORS). */
  color: string;
  /**
   * A brand-new note that hasn't been saved yet. When true the popover opens in
   * edit mode and "cancel" discards the placeholder (calls onDelete-less close).
   */
  isNew?: boolean;
  saving?: boolean;
  deleting?: boolean;
  /** Persist the edited note. Text is normalized by the caller helper too. */
  onSave: (next: { text: string; color: string }) => void;
  /** Delete the note (only shown for already-saved notes). */
  onDelete: () => void;
  /** Dismiss without persisting. For a new note this discards the placeholder. */
  onClose: () => void;
  /** Current review status (Acrobat/WPS resolved-comment workflow). */
  resolved?: boolean;
  /** Toggle the note's resolved status (only shown for already-saved notes). */
  onToggleResolved?: () => void;
  /** Creator display name (the thread's first message is theirs). */
  authorName?: string;
  /** Comment-thread replies (Acrobat / WPS "Reply"); rendered as plain text. */
  replies?: PdfAnnotationReply[];
  /** Post a reply to this note's thread (hides the composer when absent). */
  onAddReply?: (text: string) => void;
  /** Disables the reply composer while a reply PATCH is in flight. */
  replySaving?: boolean;
  /** @mentions for this page (null: guests, read-only previews). */
  mentions?: CommentMentionsController | null;
}

/**
 * The popover of one PDF sticky note: the comment popover every editor
 * draws over its canvas (Sheets' cell comment, Slides' comment; the Docs
 * comments pane's card), with the note's colour as its accent. The note and
 * its replies are the shared thread's rows; the note's own row carries edit,
 * delete and resolve, as a comment's row does. Editing the note (its words
 * and colour) takes the thread's place until saved or cancelled. The note
 * body is ALWAYS rendered as a plain text node (never dangerouslySetInnerHTML),
 * so user text can't inject markup.
 */
export default function NoteEditPopover({
  x,
  y,
  text,
  color,
  isNew = false,
  saving = false,
  deleting = false,
  onSave,
  onDelete,
  onClose,
  resolved = false,
  onToggleResolved,
  authorName,
  replies,
  onAddReply,
  replySaving = false,
  mentions = null,
}: NoteEditPopoverProps) {
  const t = useTranslations("console-notebooks");
  // A new note has no text yet, so jump straight into editing. State is seeded
  // once from props; the parent remounts this component (via a per-note `key`)
  // when it points the popover at a different note, so no prop->state sync
  // effect is needed.
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState(text);
  const [draftColor, setDraftColor] = useState(
    PDF_NOTE_COLORS.includes(color) ? color : DEFAULT_NOTE_COLOR,
  );
  const [replyDraft, setReplyDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<NotePopoverPlacement | null>(
    null,
  );
  const mutationPending = saving || deleting || replySaving;
  // The page clips its children, so a popover near its right or bottom edge
  
  // keep it wholly on the paper, again whenever it or the page resizes.
  useLayoutEffect(() => {
    const element = popoverRef.current;
    const page = element?.offsetParent;
    if (!element || !(page instanceof HTMLElement)) return undefined;
    const measure = () => {
      const next = planNotePopoverPlacement({
        x,
        y,
        width: element.offsetWidth,
        height: element.scrollHeight,
        pageWidth: page.clientWidth,
        pageHeight: page.clientHeight,
      });
      setPlacement((current) =>
        current &&
        next &&
        current.left === next.left &&
        current.top === next.top &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(page);
    return () => observer.disconnect();
  }, [x, y]);
  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);
  const handleSave = () => {
    if (mutationPending) return;
    onSave({ text: normalizeNoteText(draft), color: draftColor });
  };
  // A note being typed is written by its Save alone: the window closed, the
  // app quit or the page reloaded with the words still in the box, and they
  
  // is typed). The words in the box are saved as the page goes, once -- the
  // same moments ask more than once -- and only where there are words and
  // they are not the note's already. (A reply being typed is not posted for
  // its writer: others would read it.)
  const leaveKey = useId();
  const savedOnLeaveRef = useRef<string | null>(null);
  useDraftCommitOnLeave(`pdf-note:${leaveKey}`, () => {
    if (mutationPending) return;
    const typed = normalizeNoteText(draft);
    if (!typed.trim() || (typed === normalizeNoteText(text) && draftColor === color)) return;
    const written = `${draftColor}\u0000${typed}`;
    if (savedOnLeaveRef.current === written) return;
    savedOnLeaveRef.current = written;
    onSave({ text: typed, color: draftColor });
  }, editing);
  const handleCancelEdit = () => {
    if (mutationPending) return;
    if (isNew) {
      onClose();
      return;
    }
    setDraft(text);
    setDraftColor(PDF_NOTE_COLORS.includes(color) ? color : DEFAULT_NOTE_COLOR);
    setEditing(false);
  };
  const handlePostReply = () => {
    const text = replyDraft.trim();
    if (!text || mutationPending || !onAddReply) return;
    setReplyDraft("");
    onAddReply(text);
  };
  const anonymous = t("comments.anonymous");
  const emptyLabel = t("pdfNote.empty");
  const messageAdapter = useMemo<OfficeCommentMessageAdapter<NoteThreadMessage>>(
    () => ({
      getAuthor: (message) =>
        (message.kind === "root" ? authorName : message.reply.author?.displayName) || anonymous,
      getInitials: (message) =>
        commentInitials(
          message.kind === "root" ? authorName : message.reply.author?.displayName,
          anonymous,
        ),
      getKey: (message) => (message.kind === "root" ? "root" : message.reply.id),
      // Plain text nodes, never HTML: the thread draws them as text.
      getText: (message) =>
        message.kind === "root" ? text || emptyLabel : message.reply.text,
      getTimeLabel: (message) =>
        message.kind === "root" ? null : replyTimeLabel(message.reply.createdAt),
    }),
    [anonymous, authorName, emptyLabel, text],
  );
  const threadAdapter = useMemo<OfficeCommentThreadAdapter<NoteThread, NoteThreadMessage>>(
    () => ({
      getMessages: (thread) => [
        { kind: "root" } as const,
        ...thread.replies.map((reply) => ({ kind: "reply", reply }) as const),
      ],
      isResolved: (thread) => thread.resolved,
    }),
    [],
  );
  const thread = useMemo<NoteThread>(
    () => ({ text, replies: replies ?? [], resolved }),
    [replies, resolved, text],
  );
  const threadLabels = useMemo(
    () => ({
      cancel: t("pdfNote.close"),
      close: t("pdfNote.close"),
      edit: t("pdfNote.edit"),
      newComment: t("pdfNote.title"),
      post: t("pdfNote.reply"),
      reopen: t("pdfNote.reopen"),
      replyPlaceholder: t("pdfNote.replyPlaceholder"),
      save: t("pdfNote.save"),
    }),
    [t],
  );
  const left = placement
    ? `${placement.left}px`
    : `${Math.min(Math.max(x, 0), NOTE_POPOVER_MAX_LEFT)}%`;
  const top = placement
    ? `${placement.top}px`
    : `${Math.min(Math.max(y, 0), NOTE_POPOVER_MAX_TOP)}%`;
  // The note's own row carries what a comment's row does: edit, delete and
  // resolve, as icons so the author's name keeps its room (a resolved thread
  // offers Reopen in its composer's place).
  const renderMessageActions = (message: NoteThreadMessage, index: number, isResolved: boolean) => {
    if (index !== 0 || message.kind !== "root" || isNew) return null;
    return (
      <span className="pdf-note-popover__actions" role="group" aria-label={t("pdfNote.title")}>
        <button
          type="button"
          className="pdf-note-popover__action"
          onClick={() => setEditing(true)}
          disabled={mutationPending}
          aria-label={t("pdfNote.edit")}
          title={t("pdfNote.edit")}
          data-testid="pdf-note-edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="pdf-note-popover__action"
          onClick={onDelete}
          disabled={mutationPending}
          data-tone="danger"
          aria-label={t("pdfNote.delete")}
          title={t("pdfNote.delete")}
          data-testid="pdf-note-delete"
        >
          <Trash2 size={14} />
        </button>
        {onToggleResolved && !isResolved ? (
          <button
            type="button"
            className="pdf-note-popover__action"
            onClick={onToggleResolved}
            disabled={mutationPending}
            aria-pressed={false}
            aria-label={t("pdfNote.resolve")}
            title={t("pdfNote.resolve")}
            data-testid="pdf-note-resolve"
          >
            <Check size={14} />
          </button>
        ) : null}
      </span>
    );
  };

  return (
    <OfficeCommentPopover
      accent={draftColor}
      ariaLabel={t("pdfNote.popoverLabel")}
      className="pdf-note-popover office-pop-in"
      closeDisabled={mutationPending}
      closeLabel={t("pdfNote.close")}
      kind="pdf-note"
      onClose={() => {
        if (!mutationPending) onClose();
      }}
      resolved={resolved}
      side="right"
      style={{
        left,
        top,
        ...(placement?.maxHeight != null
          ? { maxHeight: `${placement.maxHeight}px`, overflowY: "auto" }
          : null),
      }}
      surfaceRef={popoverRef}
      testId="pdf-note-popover"
      testIdPrefix="pdf-note"
    >
      {editing ? (
        <div className="pdf-note-popover__editor" data-testid="pdf-note-editor">
          <label className="pdf-note-popover__field">
            <span className="pdf-note-popover__sr">{t("pdfNote.textLabel")}</span>
            <MentionTextarea
              mentions={mentions}
              ref={textareaRef}
              value={draft}
              disabled={mutationPending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  handleCancelEdit();
                } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  handleSave();
                }
              }}
              maxLength={PDF_NOTE_MAX_TEXT}
              rows={4}
              placeholder={t("pdfNote.placeholder")}
              aria-label={t("pdfNote.textLabel")}
              data-testid="pdf-note-textarea"
            />
          </label>
          <CommentMentionNotice mentions={mentions} />
          <div className="pdf-note-popover__editor-row">
            <div
              className="pdf-note-popover__colors"
              role="group"
              aria-label={t("pdfNote.colorLabel")}
            >
              {PDF_NOTE_COLORS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDraftColor(opt)}
                  disabled={mutationPending}
                  aria-pressed={draftColor === opt}
                  aria-label={t("pdfNote.colorOption", { color: opt })}
                  title={opt}
                  className={`pdf-note-popover__swatch${
                    draftColor === opt ? " is-active" : ""
                  }`}
                  style={{ background: opt }}
                  data-testid="pdf-note-color"
                />
              ))}
            </div>
            <div className="pdf-note-popover__editor-actions">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={mutationPending}
                className={`${parts.button} pdf-note-popover__cancel`}
                data-testid="pdf-note-cancel"
              >
                {t("pdfNote.close")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={mutationPending}
                className={`${parts.primaryButton} pdf-note-popover__save`}
                data-testid="pdf-note-save"
              >
                <Check size={12} />
                {t("pdfNote.save")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="pdf-note-popover__thread" data-testid="pdf-note-replies">
          <OfficeCommentThread
            canMutateThread={Boolean(onToggleResolved) && !mutationPending}
            canPost={Boolean(onAddReply) && !resolved && !mutationPending}
            cellLabel=""
            editDraft=""
            editingIndex={null}
            labels={threadLabels}
            maxTextLength={MAX_REPLY_TEXT}
            mentions={mentions}
            messageAdapter={messageAdapter}
            mode="popover"
            onCancelEdit={() => undefined}
            onEditDraftChange={() => undefined}
            onReplyDraftChange={setReplyDraft}
            onSaveEdit={() => undefined}
            onSubmitReply={handlePostReply}
            onToggleResolved={() => onToggleResolved?.()}
            renderMessageActions={renderMessageActions}
            replyDraft={replyDraft}
            testIdPrefix="pdf-note-thread"
            thread={thread}
            threadAdapter={threadAdapter}
          />
        </div>
      )}
    </OfficeCommentPopover>
  );
}
