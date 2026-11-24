"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Link2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import {
  OfficeCommentPopover,
  OfficeCommentThread,
  OfficeCommentsPane,
  type OfficeCommentMessageAdapter,
  type OfficeCommentPaneAdapter,
  type OfficeCommentThreadAdapter,
} from "@mrnote/core/web/components/office-comments/OfficeCommentsPane.tsx";
import type { CommentMentionsController } from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import { RibbonDropdownMenuContent as DropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  hasNote,
  hasThread,
  isNoteComment,
  MAX_SPREADSHEET_COMMENT_TEXT_LENGTH,
  type CellComment,
  type CommentMessage,
  type ThreadComment,
} from "@mrnote/core/web/lib/spreadsheet/comments.ts";

import { usePopupPortalTarget } from "@mrnote/core/web/components/ui/portal-host.tsx";
import { isTouchLikePointer } from "@mrnote/core/web/lib/pointer-capability.ts";

import styles from "./SpreadsheetReviewComments.module.css";
import { fitTextareaToText } from "@mrnote/core/web/lib/fit-textarea.ts";

/** The thin leader Excel draws from a noted cell's corner to its note box. */
export interface SpreadsheetNoteConnectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SpreadsheetCommentPopoverPosition {
  anchorOffset: number;
  left: number;
  side: "left" | "right";
  top: number;
  connector?: SpreadsheetNoteConnectorLine;
}

/** Excel's default note box is about two standard columns wide. */
export const SPREADSHEET_NOTE_BOX_WIDTH = 176;
const SPREADSHEET_NOTE_BOX_MIN_HEIGHT = 84;

/**
 * Place a note the way Excel does: just right of the cell and a little above
 * its top edge, flipped to the left side when the right would overflow, with a
 * leader line from the cell's top corner to the box.
 */
export function placeSpreadsheetNote(
  anchor: { left: number; right: number; top: number },
  box: { height: number; width: number },
  viewport: { height: number; width: number },
): SpreadsheetCommentPopoverPosition {
  const padding = 12;
  const gap = 18;
  let side: SpreadsheetCommentPopoverPosition["side"] = "right";
  let left = anchor.right + gap;
  if (left + box.width > viewport.width - padding) {
    side = "left";
    left = anchor.left - box.width - gap;
  }
  left = Math.max(
    padding,
    Math.min(left, Math.max(padding, viewport.width - box.width - padding)),
  );
  const top = Math.max(
    padding,
    Math.min(
      anchor.top - 8,
      Math.max(padding, viewport.height - box.height - padding),
    ),
  );
  return {
    anchorOffset: 12,
    left,
    side,
    top,
    connector: {
      x1: side === "right" ? anchor.right : anchor.left,
      y1: anchor.top + 1,
      x2: side === "right" ? left : left + box.width,
      y2: top + 12,
    },
  };
}

function NoteConnector({ line }: { line: SpreadsheetNoteConnectorLine }) {
  const left = Math.min(line.x1, line.x2);
  const top = Math.min(line.y1, line.y2);
  const width = Math.max(1, Math.abs(line.x2 - line.x1));
  const height = Math.max(1, Math.abs(line.y2 - line.y1));
  return (
    <svg
      aria-hidden
      className={styles.noteConnector}
      data-testid="spreadsheet-note-connector"
      height={height}
      style={{ height, left, top, width }}
      width={width}
    >
      <line
        x1={line.x1 - left}
        x2={line.x2 - left}
        y1={line.y1 - top}
        y2={line.y2 - top}
      />
    </svg>
  );
}

/**
 * A note's text as Excel shows it: when the first line is its author's
 * signature ("Name:"), that line is bold.
 */
function NoteText({ author, text }: { author?: string; text: string }) {
  const newline = text.indexOf("\n");
  const first = newline < 0 ? text : text.slice(0, newline);
  if (!author || first.trim() !== `${author}:`) return <>{text}</>;
  return (
    <>
      <strong>{first}</strong>
      {newline < 0 ? null : text.slice(newline)}
    </>
  );
}

export interface SpreadsheetCommentTarget {
  cellLabel: string;
  col: number;
  comment: ThreadComment;
  key: string;
  row: number;
  sheetId: string;
  sheetIndex: number;
  sheetName: string;
}

export interface SpreadsheetCommentThreadController {
  canCopyLink: boolean;
  canEditMessage: (message: CommentMessage, index: number) => boolean;
  canMutateThread: boolean;
  canPost: boolean;
  copyLinkReason?: string;
  disabledReason?: string;
  editDraft: string;
  editingIndex: number | null;
  /** The viewer's locale: comment times are written in it. */
  locale: string;
  /** @mentions for this workbook page (null: guests, previews). */
  mentions?: CommentMentionsController | null;
  /** The thread's reference as the window passes it to `notifyPosted`. */
  mentionThreadRef?: string | null;
  translate: (key: string, values?: Record<string, string | number>) => string;
  onCancelEdit: () => void;
  onClose?: () => void;
  onCopyLink: (messageIndex: number) => void;
  onDeleteReply: (messageIndex: number) => void;
  onDeleteThread: () => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: (messageIndex: number) => void;
  onStartEdit: (messageIndex: number) => void;
  onSubmitReply: () => void;
  onToggleResolved: () => void;
  onReplyDraftChange: (value: string) => void;
  replyDraft: string;
  thread: ThreadComment;
}

interface ThreadConversationProps extends SpreadsheetCommentThreadController {
  cellLabel: string;
  compact?: boolean;
}

function messageInitials(author: string | undefined, anonymous: string): string {
  const value = (author || anonymous).trim();
  if (!value) return "?";
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return Array.from(value).slice(0, 2).join("").toUpperCase();
}

function formatCommentTime(
  message: CommentMessage,
  locale: string,
): string | null {
  const value =
    typeof message.ts === "number"
      ? new Date(message.ts)
      : message.dateTime
        ? new Date(message.dateTime)
        : null;
  if (!value || Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function MessageActions({
  canCopyLink,
  canEdit,
  canMutateThread,
  copyLinkReason,
  disabledReason,
  index,
  isResolved,
  translate,
  onCopyLink,
  onDeleteReply,
  onDeleteThread,
  onStartEdit,
  onToggleResolved,
}: {
  canCopyLink: boolean;
  canEdit: boolean;
  canMutateThread: boolean;
  copyLinkReason?: string;
  disabledReason?: string;
  index: number;
  isResolved: boolean;
  translate: (key: string) => string;
  onCopyLink: () => void;
  onDeleteReply: () => void;
  onDeleteThread: () => void;
  onStartEdit: () => void;
  onToggleResolved: () => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={styles.messageMenuTrigger}
          aria-label={translate("spreadsheet.helperCopy.reviewComments.moreCommentActions")}
          data-testid={`spreadsheet-comment-message-menu-${index}`}
        >
          <MoreHorizontal size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={styles.messageMenu}
        sideOffset={4}
      >
        <DropdownMenuItem
          disabled={!canCopyLink}
          title={copyLinkReason}
          onSelect={onCopyLink}
          data-testid={`spreadsheet-comment-copy-link-${index}`}
        >
          <Link2 size={16} />
          {translate("spreadsheet.helperCopy.reviewComments.linkToComment")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canEdit || isResolved}
          title={!canEdit || isResolved ? disabledReason : undefined}
          onSelect={onStartEdit}
          data-testid={`spreadsheet-comment-edit-${index}`}
        >
          <Pencil size={16} />
          {translate("spreadsheet.helperCopy.reviewComments.editComment")}
        </DropdownMenuItem>
        {index === 0 ? (
          <>
            <DropdownMenuItem
              disabled={!canMutateThread}
              title={!canMutateThread ? disabledReason : undefined}
              onSelect={onToggleResolved}
              data-control-id="XLSCTL.REVIEW.COMMENT.RESOLVE_TOGGLE"
              data-control-occurrence-id="resolve-toggle"
              data-control-surface="review-comment-composer"
              data-testid="spreadsheet-comment-resolve"
            >
              {isResolved ? <RotateCcw size={16} /> : <Check size={16} />}
              {isResolved
                ? translate("spreadsheet.helperCopy.reviewComments.reopenThread")
                : translate("spreadsheet.helperCopy.reviewComments.resolveThread")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canMutateThread}
              title={!canMutateThread ? disabledReason : undefined}
              className={styles.destructiveMenuItem}
              onSelect={onDeleteThread}
              data-control-id="XLSCTL.REVIEW.COMMENT.DELETE"
              data-control-surface="review-comment-composer"
              data-testid="spreadsheet-comment-delete-thread"
            >
              <Trash2 size={16} />
              {translate("spreadsheet.helperCopy.reviewComments.deleteThread")}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            disabled={!canEdit}
            title={!canEdit ? disabledReason : undefined}
            className={styles.destructiveMenuItem}
            onSelect={onDeleteReply}
            data-testid={`spreadsheet-comment-delete-reply-${index}`}
          >
            <Trash2 size={16} />
            {translate("spreadsheet.helperCopy.reviewComments.deleteComment")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThreadConversation({
  canCopyLink,
  canEditMessage,
  canMutateThread,
  canPost,
  cellLabel,
  compact = false,
  copyLinkReason,
  disabledReason,
  editDraft,
  editingIndex,
  locale,
  mentions,
  mentionThreadRef,
  translate,
  onCancelEdit,
  onClose,
  onCopyLink,
  onDeleteReply,
  onDeleteThread,
  onEditDraftChange,
  onReplyDraftChange,
  onSaveEdit,
  onStartEdit,
  onSubmitReply,
  onToggleResolved,
  replyDraft,
  thread,
}: ThreadConversationProps) {
  const anonymous = translate("spreadsheet.helperCopy.reviewComments.anonymous");
  const messageAdapter: OfficeCommentMessageAdapter<CommentMessage> = {
    getAuthor: (message) => message.author || anonymous,
    getInitials: (message) => messageInitials(message.author, anonymous),
    getAuthorId: (message) => message.actorId ?? null,
    getKey: (message, index) =>
      message.nativeId ?? `${index}:${message.ts ?? message.dateTime ?? ""}`,
    getText: (message) => message.text,
    getTimeLabel: (message) => formatCommentTime(message, locale),
  };
  const threadAdapter: OfficeCommentThreadAdapter<
    ThreadComment,
    CommentMessage
  > = {
    getMessages: (value) => value.thread,
    isResolved: (value) => value.done === true,
  };

  return (
    <OfficeCommentThread
      canMutateThread={canMutateThread}
      canPost={canPost}
      cellLabel={cellLabel}
      classNames={styles}
      disabledReason={disabledReason}
      editDraft={editDraft}
      editingIndex={editingIndex}
      labels={{
        cancel: translate("spreadsheet.helperCopy.reviewComments.cancel"),
        close: translate("spreadsheet.helperCopy.reviewComments.closeComment"),
        edit: translate("spreadsheet.helperCopy.reviewComments.editCommentLabel"),
        newComment: translate("spreadsheet.helperCopy.reviewComments.newComment"),
        post: translate("spreadsheet.helperCopy.reviewComments.postComment"),
        reopen: translate("spreadsheet.helperCopy.reviewComments.reopenThread"),
        replyPlaceholder: translate("spreadsheet.helperCopy.reviewComments.mentionOrReply"),
        resolved: translate("spreadsheet.helperCopy.reviewComments.resolved"),
        save: translate("spreadsheet.helperCopy.reviewComments.save"),
        startPlaceholder: translate("spreadsheet.helperCopy.reviewComments.startConversation"),
      }}
      maxTextLength={MAX_SPREADSHEET_COMMENT_TEXT_LENGTH}
      mentions={mentions}
      mentionThreadRef={mentionThreadRef}
      messageAdapter={messageAdapter}
      mode={compact ? "compact" : "popover"}
      onCancelEdit={onCancelEdit}
      onClose={onClose}
      onEditDraftChange={onEditDraftChange}
      onReplyDraftChange={onReplyDraftChange}
      onSaveEdit={onSaveEdit}
      onSubmitReply={onSubmitReply}
      onToggleResolved={onToggleResolved}
      postControl={{
        controlId: "XLSCTL.REVIEW.COMMENT.POST",
        occurrenceId: "post",
        surface: "review-comment-composer",
      }}
      renderMessageActions={(message, index, resolved) => (
        <MessageActions
          canCopyLink={canCopyLink}
          canEdit={canEditMessage(message, index)}
          canMutateThread={canMutateThread}
          copyLinkReason={copyLinkReason}
          disabledReason={disabledReason}
          index={index}
          isResolved={resolved}
          translate={translate}
          onCopyLink={() => onCopyLink(index)}
          onDeleteReply={() => onDeleteReply(index)}
          onDeleteThread={onDeleteThread}
          onStartEdit={() => onStartEdit(index)}
          onToggleResolved={onToggleResolved}
        />
      )}
      replyDraft={replyDraft}
      testIdPrefix="spreadsheet-comment"
      thread={thread}
      threadAdapter={threadAdapter}
    />
  );
}

export function SpreadsheetCommentPopover({
  cellLabel,
  controller,
  position,
  popoverRef,
}: {
  cellLabel: string;
  controller: SpreadsheetCommentThreadController;
  position: SpreadsheetCommentPopoverPosition | null;
  popoverRef: RefObject<HTMLElement | null>;
}) {
  const style = {
    "--spreadsheet-comment-anchor-offset": `${position?.anchorOffset ?? 28}px`,
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    visibility: position ? "visible" : "hidden",
  } as CSSProperties;
  return (
    <OfficeCommentPopover
      ariaLabel={controller.translate("spreadsheet.helperCopy.reviewComments.comment", { cellLabel })}
      classNames={styles}
      closeLabel={controller.translate("spreadsheet.helperCopy.reviewComments.closeComment")}
      kind="thread"
      onClose={() => controller.onClose?.()}
      resolved={controller.thread.done === true}
      side={position?.side ?? "right"}
      style={style}
      surfaceRef={popoverRef}
      testIdPrefix="spreadsheet-comment"
    >
      <ThreadConversation {...controller} cellLabel={cellLabel} />
    </OfficeCommentPopover>
  );
}

export function SpreadsheetCommentsPane({
  activeTargetKey,
  controller,
  draftTarget,
  locale,
  newComment,
  onCancelDraft,
  translate,
  onClose,
  onNext,
  onPrevious,
  onSelectTarget,
  paneRef,
  targets,
}: {
  activeTargetKey: string | null;
  controller: SpreadsheetCommentThreadController | null;
  /**
   * A comment being started from the pane on a cell that has none yet: Excel
   * shows it as a card of its own, in the cell's place among the threads,
   * until it is posted (it becomes the thread) or cancelled (it goes away).
   */
  draftTarget?: SpreadsheetCommentTarget | null;
  locale: string;
  /** Cancels `draftTarget`: the draft card's close button and Escape. */
  onCancelDraft?: () => void;
  /** Review > New Comment as the pane's "New": same command, same gate. */
  newComment?: {
    controlId?: string;
    disabled?: boolean;
    disabledReason?: string;
    onClick: () => void;
  };
  translate: (key: string, values?: Record<string, string | number>) => string;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelectTarget: (target: SpreadsheetCommentTarget) => void;
  paneRef: RefObject<HTMLElement | null>;
  targets: SpreadsheetCommentTarget[];
}) {
  const anonymous = translate("spreadsheet.helperCopy.reviewComments.anonymous");
  const messageAdapter: OfficeCommentMessageAdapter<CommentMessage> = {
    getAuthor: (message) => message.author || anonymous,
    getInitials: (message) => messageInitials(message.author, anonymous),
    getAuthorId: (message) => message.actorId ?? null,
    getKey: (message, index) =>
      message.nativeId ?? `${index}:${message.ts ?? message.dateTime ?? ""}`,
    getText: (message) => message.text,
    getTimeLabel: (message) => formatCommentTime(message, locale),
  };
  const threadAdapter: OfficeCommentThreadAdapter<
    ThreadComment,
    CommentMessage
  > = {
    getMessages: (thread) => thread.thread,
    isResolved: (thread) => thread.done === true,
  };
  const paneAdapter: OfficeCommentPaneAdapter<
    SpreadsheetCommentTarget,
    ThreadComment
  > = {
    getKey: (target) => target.key,
    getLocationLabel: (target) =>
      `${target.sheetName}!${target.cellLabel}`,
    getReplyCountLabel: (_target, replyCount) =>
      translate("spreadsheet.helperCopy.reviewComments.replies", { replyCount }),
    getThread: (target) => target.comment,
    onSelect: onSelectTarget,
  };
  // The draft takes the cell's place among its sheet's threads: before the
  // first thread of that sheet that lies after the cell, row by row.
  const items = (() => {
    if (!draftTarget || targets.some((target) => target.key === draftTarget.key)) {
      return targets;
    }
    const after = targets.findIndex(
      (target) =>
        target.sheetIndex > draftTarget.sheetIndex ||
        (target.sheetIndex === draftTarget.sheetIndex &&
          (target.row > draftTarget.row ||
            (target.row === draftTarget.row && target.col > draftTarget.col))),
    );
    return after < 0
      ? [...targets, draftTarget]
      : [...targets.slice(0, after), draftTarget, ...targets.slice(after)];
  })();
  return (
    <OfficeCommentsPane
      activeItemKey={controller ? activeTargetKey : null}
      mentions={controller?.mentions}
      classNames={styles}
      emptyHint={translate("spreadsheet.helperCopy.reviewComments.emptyPaneHint")}
      items={items}
      labels={{
        allComments: translate("spreadsheet.helperCopy.reviewComments.allComments"),
        anonymous,
        browse: translate("spreadsheet.helperCopy.reviewComments.browseComments"),
        close: translate("spreadsheet.helperCopy.reviewComments.closeCommentsPane"),
        comments: translate("spreadsheet.helperCopy.reviewComments.comments"),
        next: translate("spreadsheet.helperCopy.reviewComments.nextComment"),
        previous: translate("spreadsheet.helperCopy.reviewComments.previousComment"),
      }}
      messageAdapter={messageAdapter}
      newAction={
        newComment
          ? {
              ...newComment,
              ariaLabel: translate("spreadsheet.helperCopy.reviewComments.newComment"),
              label: translate("spreadsheet.helperCopy.reviewComments.newInPane"),
            }
          : undefined
      }
      onClose={onClose}
      onNext={onNext}
      onPrevious={onPrevious}
      paneAdapter={paneAdapter}
      paneRef={paneRef}
      renderActiveThread={(target) =>
        controller ? (
          <ThreadConversation
            {...controller}
            cellLabel={`${target.sheetName}!${target.cellLabel}`}
            compact
            onClose={
              draftTarget && target.key === draftTarget.key
                ? onCancelDraft
                : undefined
            }
          />
        ) : null
      }
      testIdPrefix="spreadsheet-comments"
      threadAdapter={threadAdapter}
    />
  );
}

export function SpreadsheetNotePopover({
  canEdit,
  cellLabel,
  disabledReason,
  draft,
  translate,
  onCommit,
  onDraftChange,
  onTextFocus,
  popoverRef,
  position,
}: {
  canEdit: boolean;
  cellLabel: string;
  disabledReason?: string;
  draft: string;
  translate: (key: string, values?: Record<string, string | number>) => string;
  /** Esc or a click elsewhere: keep what was typed and close, as Excel does. */
  onCommit: () => void;
  onDraftChange: (value: string) => void;
  onTextFocus?: () => void;
  popoverRef: RefObject<HTMLElement | null>;
  position: SpreadsheetCommentPopoverPosition | null;
}) {
  const style = {
    "--spreadsheet-comment-anchor-offset": `${position?.anchorOffset ?? 12}px`,
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    visibility: position ? "visible" : "hidden",
  } as CSSProperties;
  // The note mounts hidden until its position is measured, and a hidden
  // element cannot take focus, so `autoFocus` alone never landed: New Note
  // opened a box the user had to click before typing. Excel puts the caret in
  // the note. Focus once, when the note first becomes visible.
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const placed = position !== null;
  // As tall as its words, as the shown note is (the box clamps it between the
  // shown note's minimum and maximum); a box the person resized keeps its own.
  useLayoutEffect(() => {
    const text = textRef.current;
    const box = popoverRef.current;
    if (!text || (box && box.style.height)) return;
    fitTextareaToText(text);
  }, [draft, placed, popoverRef]);
  useEffect(() => {
    if (!placed || !canEdit) return;
    const text = textRef.current;
    if (!text || document.activeElement === text) return;
    text.focus({ preventScroll: true });
    text.setSelectionRange(text.value.length, text.value.length);
  }, [canEdit, placed]);
  // Excel's note editor is the note itself: a yellow box you type straight
  // into, with no Save or Cancel. Esc or a click anywhere else keeps the text
  // and closes it; Delete Note lives on the cell's shortcut menu. The box is
  // resizable from its corner like Excel's sizing handles.
  return (
    <>
      {position?.connector ? <NoteConnector line={position.connector} /> : null}
      <OfficeCommentPopover
        accent="#c5a123"
        ariaLabel={translate("spreadsheet.helperCopy.reviewComments.note", { cellLabel })}
        className={styles.notePopover}
        classNames={styles}
        closeLabel={translate("spreadsheet.helperCopy.reviewComments.closeNote")}
        kind="note"
        onClose={onCommit}
        showCloseButton={false}
        side={position?.side ?? "right"}
        style={style}
        surfaceRef={popoverRef}
        testIdPrefix="spreadsheet-comment"
      >
        <textarea
          ref={textRef}
          autoFocus
          maxLength={MAX_SPREADSHEET_COMMENT_TEXT_LENGTH}
          value={draft}
          disabled={!canEdit}
          spellCheck={false}
          title={!canEdit ? disabledReason : undefined}
          placeholder={translate("spreadsheet.helperCopy.reviewComments.addANote")}
          aria-label={translate("spreadsheet.helperCopy.reviewComments.noteText")}
          data-testid="spreadsheet-comment-textarea"
          onChange={(event) => onDraftChange(event.target.value)}
          onFocus={onTextFocus}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCommit();
            }
          }}
        />
      </OfficeCommentPopover>
    </>
  );
}

interface RemarkAnchor {
  key: string;
  left: number;
  right: number;
  top: number;
}

const COMMENT_INDICATOR_SELECTOR = '[data-testid="spreadsheet-comment-indicator"]';
const REMARK_HOVER_DELAY_MS = 200;

function remarkAnchorOf(cell: HTMLTableCellElement): RemarkAnchor | null {
  // A ghost cell (painted by the canvas text layer) has no editor; its own address stands in.
  const key = cell.querySelector<HTMLInputElement>('[data-testid="spreadsheet-cell"][data-cell]')?.dataset
    .cell ?? (cell.hasAttribute("data-ghost-cell") ? cell.getAttribute("data-range-cell") ?? undefined : undefined);
  if (!key) return null;
  const rect = cell.getBoundingClientRect();
  return { key, left: rect.left, right: rect.right, top: rect.top };
}

function viewportSize() {
  return { height: window.innerHeight, width: window.innerWidth };
}

function NotePreview({
  anchor,
  cellLabel,
  comment,
  pinned,
  translate,
}: {
  anchor: RemarkAnchor;
  cellLabel: string;
  comment: CellComment;
  pinned: boolean;
  translate: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (!isNoteComment(comment)) return null;
  const position = placeSpreadsheetNote(
    anchor,
    { height: SPREADSHEET_NOTE_BOX_MIN_HEIGHT, width: SPREADSHEET_NOTE_BOX_WIDTH },
    viewportSize(),
  );
  return (
    <>
      {position.connector ? <NoteConnector line={position.connector} /> : null}
      <div
        role="note"
        aria-label={translate("spreadsheet.helperCopy.reviewComments.note", { cellLabel })}
        className={styles.notePreview}
        data-cell={anchor.key}
        data-pinned={pinned ? "true" : undefined}
        data-testid="spreadsheet-note-preview"
        style={{ left: position.left, top: position.top }}
      >
        <NoteText author={comment.author} text={comment.text} />
      </div>
    </>
  );
}

function ThreadPreview({
  anchor,
  cellLabel,
  comment,
  translate,
}: {
  anchor: RemarkAnchor;
  cellLabel: string;
  comment: ThreadComment;
  translate: (key: string, values?: Record<string, string | number>) => string;
}) {
  const anonymous = translate("spreadsheet.helperCopy.reviewComments.anonymous");
  const position = placeSpreadsheetNote(
    anchor,
    { height: 120, width: 280 },
    viewportSize(),
  );
  return (
    <div
      role="tooltip"
      aria-label={translate("spreadsheet.helperCopy.reviewComments.comment", { cellLabel })}
      className={styles.threadPreview}
      data-cell={anchor.key}
      data-resolved={comment.done ? "true" : undefined}
      data-testid="spreadsheet-comment-preview"
      style={{ left: position.left, top: position.top }}
    >
      {comment.thread.slice(0, 4).map((message, index) => (
        <p key={message.nativeId ?? `${index}:${message.ts ?? ""}`}>
          <strong>{message.author || anonymous}</strong>
          <span>{message.text}</span>
        </p>
      ))}
      {comment.thread.length > 4 ? (
        <small>
          {translate("spreadsheet.helperCopy.reviewComments.replies", {
            replyCount: comment.thread.length - 1,
          })}
        </small>
      ) : null}
    </div>
  );
}

/**
 * Read-only note and comment boxes over the grid, as Excel shows them: resting
 * the pointer on a cell that carries a note shows the note beside the cell
 * (a threaded comment shows its card) until the pointer leaves; a note shown
 * with Review > Notes > Show/Hide Note stays open on the sheet, and Show All
 * Notes keeps every note open. Only cells the grid has mounted can be
 * anchored, so the pinned set follows scrolling. A finger cannot rest on a
 * cell: on touch, tapping a cell that carries a note shows it (as Excel on a
 * tablet does) until a tap elsewhere or a scroll.
 */
export function SpreadsheetRemarkPreviewLayer({
  cellLabel,
  editingKey,
  getComment,
  notesPinned,
  rootRef,
  shownNotesPresent = false,
  translate,
  version,
}: {
  cellLabel: (key: string) => string;
  /** The cell whose own note editor or comment card is open. */
  editingKey: string | null;
  getComment: (key: string) => CellComment | undefined;
  /** Show All Notes: every note stays open, whatever its own state. */
  notesPinned: boolean;
  rootRef: RefObject<HTMLElement | null>;
  /** Some note on the sheet is shown on its own (`visible`). */
  shownNotesPresent?: boolean;
  translate: (key: string, values?: Record<string, string | number>) => string;
  /** Changes whenever the sheet does, so pinned notes are re-measured. */
  version: unknown;
}) {
  const popupPortalTarget = usePopupPortalTarget();
  const [hover, setHover] = useState<RemarkAnchor | null>(null);
  const [pinned, setPinned] = useState<RemarkAnchor[]>([]);
  const pinning = notesPinned || shownNotesPresent;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let current: HTMLTableCellElement | null = null;
    let timer: number | undefined;
    const clear = () => {
      window.clearTimeout(timer);
      timer = undefined;
      current = null;
      setHover(null);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest("td") ?? null;
      if (cell === current) return;
      clear();
      if (
        !cell ||
        !root.contains(cell) ||
        event.buttons ||
        !cell.querySelector(COMMENT_INDICATOR_SELECTOR)
      ) {
        return;
      }
      current = cell;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (current !== cell || !cell.isConnected) return;
        setHover(remarkAnchorOf(cell));
      }, REMARK_HOVER_DELAY_MS);
    };
    const out = (event: PointerEvent) => {
      // a lifted finger leaves its cell: the tapped note stays (see `tap`)
      if (event.pointerType === "touch") return;
      if (!current) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && current.contains(next)) return;
      clear();
    };
    // touch: a tap (a press that did not travel) on a noted cell shows its
    // note; a tap anywhere else in the grid takes it away
    let touchStart: {
      x: number;
      y: number;
      cell: HTMLTableCellElement | null;
    } | null = null;
    const down = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      touchStart = isTouchLikePointer(event)
        ? { x: event.clientX, y: event.clientY, cell: target?.closest("td") ?? null }
        : null;
    };
    const tap = (event: PointerEvent) => {
      const start = touchStart;
      touchStart = null;
      if (!start || !isTouchLikePointer(event)) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
        return;
      }
      const cell = start.cell;
      clear();
      if (
        !cell ||
        !root.contains(cell) ||
        !cell.querySelector(COMMENT_INDICATOR_SELECTOR)
      ) {
        return;
      }
      current = cell;
      setHover(remarkAnchorOf(cell));
    };
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerout", out);
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointerup", tap);
    root.addEventListener("scroll", clear, true);
    return () => {
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerout", out);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointerup", tap);
      root.removeEventListener("scroll", clear, true);
      window.clearTimeout(timer);
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    if (!pinning) return;
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const seen = new Set<string>();
      const next: RemarkAnchor[] = [];
      for (const indicator of Array.from(
        root.querySelectorAll<HTMLElement>(
          `${COMMENT_INDICATOR_SELECTOR}[data-kind="note"]`,
        ),
      )) {
        const cell = indicator.closest("td");
        const anchor = cell ? remarkAnchorOf(cell) : null;
        if (!cell || !anchor || seen.has(anchor.key)) continue;
        if (!notesPinned) {
          const comment = getComment(anchor.key);
          if (!isNoteComment(comment) || comment.visible !== true) continue;
        }
        const viewport = cell
          .closest('[data-testid="spreadsheet-grid-viewport"]')
          ?.getBoundingClientRect();
        const rect = cell.getBoundingClientRect();
        if (
          viewport &&
          viewport.width > 0 &&
          viewport.height > 0 &&
          (rect.bottom <= viewport.top ||
            rect.top >= viewport.bottom ||
            rect.right <= viewport.left ||
            rect.left >= viewport.right)
        ) {
          continue;
        }
        seen.add(anchor.key);
        next.push(anchor);
      }
      setPinned(next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      root.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [getComment, notesPinned, pinning, rootRef, version]);

  if (typeof document === "undefined") return null;
  const hoverComment = hover ? getComment(hover.key) : undefined;
  // A note stays open while Show All Notes is on or it is shown on its own;
  // the measured anchors can trail a hide by a frame, so read the note again.
  const shownPinned = (pinning ? pinned : []).flatMap((anchor) => {
    const comment = getComment(anchor.key);
    return isNoteComment(comment) &&
      hasNote(comment) &&
      (notesPinned || comment.visible === true)
      ? [{ anchor, comment }]
      : [];
  });
  const pinnedKeys = new Set(shownPinned.map(({ anchor }) => anchor.key));
  const showHover =
    hover &&
    hover.key !== editingKey &&
    (hasThread(hoverComment) ||
      (hasNote(hoverComment) && !pinnedKeys.has(hover.key)));
  return createPortal(
    <>
      {shownPinned.map(({ anchor, comment }) =>
        anchor.key === editingKey ? null : (
          <NotePreview
            key={anchor.key}
            anchor={anchor}
            cellLabel={cellLabel(anchor.key)}
            comment={comment}
            pinned
            translate={translate}
          />
        ),
      )}
      {showHover && hover && hoverComment ? (
        hasThread(hoverComment) && !isNoteComment(hoverComment) ? (
          <ThreadPreview
            anchor={hover}
            cellLabel={cellLabel(hover.key)}
            comment={hoverComment}
            translate={translate}
          />
        ) : (
          <NotePreview
            anchor={hover}
            cellLabel={cellLabel(hover.key)}
            comment={hoverComment}
            pinned={false}
            translate={translate}
          />
        )
      ) : null}
    </>,
    popupPortalTarget ?? document.body,
  );
}
