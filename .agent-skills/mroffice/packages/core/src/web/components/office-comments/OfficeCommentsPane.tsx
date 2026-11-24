"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  CSSProperties,
  Key,
  ReactNode,
  RefObject,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  MessageSquarePlus,
  RotateCcw,
  Send,
  X,
} from "../office-ribbon/icons/houseIcons";

import {
  officeDialogClassName,
  officeDialogParts,
} from "../office-ribbon/officeDialogChrome";
import { useOfficeTaskPaneChrome } from "../office-ribbon/OfficeTaskPane";
import { OfficeTaskPaneOptions } from "../office-ribbon/officeTaskPaneLayout";

import {
  CommentMentionNotice,
  MentionText,
  MentionTextarea,
  type CommentMentionsController,
} from "./CommentMentions";
import defaultStyles from "./OfficeCommentsPane.module.css";
import UserAvatar from "../console/UserAvatar";

/** The Comments pane's place in an editor's pane layout. */
export const OFFICE_COMMENTS_PANE_LAYOUT_ID = "comments";

export type OfficeCommentsSurfaceMode = "popover" | "compact" | "list";

export interface OfficeCommentMessageAdapter<TMessage> {
  getAuthor: (message: TMessage, index: number) => string;
  getInitials: (message: TMessage, index: number) => string;
  /** The author's MRAI account, when the comment was written here: their
   *  own avatar is drawn instead of initials once the roster knows them. */
  getAuthorId?: (message: TMessage, index: number) => string | null;
  getKey: (message: TMessage, index: number) => Key;
  getText: (message: TMessage, index: number) => string;
  getTimeLabel: (message: TMessage, index: number) => string | null;
}

export interface OfficeCommentThreadAdapter<TThread, TMessage> {
  getMessages: (thread: TThread) => readonly TMessage[];
  isResolved: (thread: TThread) => boolean;
}

export interface OfficeCommentPaneAdapter<TItem, TThread> {
  getKey: (item: TItem) => Key;
  getLocationLabel: (item: TItem) => string;
  getReplyCountLabel: (item: TItem, replyCount: number) => string | null;
  getThread: (item: TItem) => TThread;
  onSelect: (item: TItem) => void;
}

export interface OfficeCommentThreadLabels {
  cancel: string;
  close: string;
  edit: string;
  newComment: string;
  post: string;
  reopen: string;
  replyPlaceholder: string;
  /**
   * Shown at the top of a resolved thread's card ("Resolved"). Optional: an
   * editor that does not pass it keeps its card exactly as it was.
   */
  resolved?: string;
  save: string;
  /**
   * The composer's prompt while the thread has no message yet ("Start a
   * conversation"). Optional: without it the reply prompt is used throughout.
   */
  startPlaceholder?: string;
}

export interface OfficeCommentsPaneLabels {
  allComments: string;
  anonymous: string;
  browse: string;
  close: string;
  comments: string;
  next: string;
  previous: string;
}

type OfficeCommentsClassName =
  | "avatar"
  | "cellLabel"
  | "closeComposerButton"
  | "editActions"
  | "editComposer"
  | "emptyThreadHeader"
  | "message"
  | "messageBody"
  | "messageHeader"
  | "messageText"
  | "messageTime"
  | "messages"
  | "pane"
  | "paneBody"
  | "paneCard"
  | "paneEmpty"
  | "paneHeader"
  | "paneNewButton"
  | "paneSummary"
  | "paneToolbar"
  | "popover"
  | "popoverClose"
  | "reopenButton"
  | "replyActions"
  | "replyComposer"
  | "resolvedHeader"
  | "sendButton"
  | "thread"
  | "threadCompact";

export type OfficeCommentsClassNames = Partial<
  Record<OfficeCommentsClassName, string>
>;

type OfficeCommentsResolvedClassNames = Record<OfficeCommentsClassName, string>;

/** A comment's author in person when known, otherwise their initials. */
function CommentAuthorAvatar({
  className,
  initials,
  authorId,
  mentions,
}: {
  className: string;
  initials: string;
  authorId: string | null | undefined;
  mentions: CommentMentionsController | null;
}) {
  const person = authorId ? (mentions?.personFor?.(authorId) ?? null) : null;
  if (!person) {
    return (
      <span className={className} aria-hidden="true">
        {initials}
      </span>
    );
  }
  return (
    <span
      className={className}
      aria-hidden="true"
      data-comment-author-person=""
      style={{ background: "transparent" }}
    >
      <UserAvatar
        size={32}
        name={person.displayName}
        email={person.email}
        accentColor={person.accentColor}
        avatar={person.avatar}
      />
    </span>
  );
}

function resolveClassNames(
  overrides?: OfficeCommentsClassNames,
): OfficeCommentsResolvedClassNames {
  return { ...defaultStyles, ...overrides } as OfficeCommentsResolvedClassNames;
}

function stopOfficeCommentsSurfaceEvent(event: {
  stopPropagation: () => void;
}) {
  event.stopPropagation();
}

function officeCommentsStyle(
  accent: string | undefined,
  style?: CSSProperties,
): CSSProperties {
  return {
    ...style,
    // Comments wear the user's theme colour in every editor; a host passes
    // `accent` only to pin something else.
    ...(accent ? { "--office-comments-accent": accent } : {}),
  } as CSSProperties;
}

export interface OfficeCommentThreadProps<TThread, TMessage> {
  canMutateThread: boolean;
  canPost: boolean;
  cellLabel: string;
  classNames?: OfficeCommentsClassNames;
  disabledReason?: string;
  editDraft: string;
  editingIndex: number | null;
  labels: OfficeCommentThreadLabels;
  /**
   * The longest message the reply and edit boxes accept. Each editor's page
   * bounds its own comment text; 2,000 unless the host says otherwise (the
   * workbook holds Excel's 32,767).
   */
  maxTextLength?: number;
  /**
   * The page's @mention controller (`useCommentMentions`). With it the reply
   * and edit boxes offer people on "@" and posted text draws mentions as
   * chips; without it (guests, previews) the thread is unchanged. The host
   * still calls `notifyPosted` after it saved a message.
   */
  mentions?: CommentMentionsController | null;
  /** This thread's id as the host passes it to `notifyPosted`. */
  mentionThreadRef?: string | null;
  messageAdapter: OfficeCommentMessageAdapter<TMessage>;
  mode: Exclude<OfficeCommentsSurfaceMode, "list">;
  onCancelEdit: () => void;
  onClose?: () => void;
  onEditDraftChange: (value: string) => void;
  onReplyDraftChange: (value: string) => void;
  onSaveEdit: (messageIndex: number) => void;
  onSubmitReply: () => void;
  onToggleResolved: () => void;
  postControl?: {
    controlId?: string;
    occurrenceId?: string;
    surface?: string;
  };
  renderMessageActions?: (
    message: TMessage,
    index: number,
    resolved: boolean,
  ) => ReactNode;
  replyDraft: string;
  testIdPrefix: string;
  thread: TThread;
  threadAdapter: OfficeCommentThreadAdapter<TThread, TMessage>;
}

export function OfficeCommentThread<TThread, TMessage>({
  canMutateThread,
  canPost,
  cellLabel,
  classNames,
  disabledReason,
  editDraft,
  editingIndex,
  labels,
  maxTextLength = 2_000,
  mentions = null,
  mentionThreadRef = null,
  messageAdapter,
  mode,
  onCancelEdit,
  onClose,
  onEditDraftChange,
  onReplyDraftChange,
  onSaveEdit,
  onSubmitReply,
  onToggleResolved,
  postControl,
  renderMessageActions,
  replyDraft,
  testIdPrefix,
  thread,
  threadAdapter,
}: OfficeCommentThreadProps<TThread, TMessage>) {
  const classes = resolveClassNames(classNames);
  const messages = threadAdapter.getMessages(thread);
  const resolved = threadAdapter.isResolved(thread);
  const composerPrompt =
    messages.length === 0
      ? (labels.startPlaceholder ?? labels.replyPlaceholder)
      : labels.replyPlaceholder;
  const handleComposerKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      // A composer with no close callback (an existing thread's reply box)
      // still answers the shortcut it declares: the keyboard leaves the
      // field, the draft stays (PPT-B440).
      if (onClose) onClose();
      else event.currentTarget.blur();
      return;
    }
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      onSubmitReply();
    }
  };

  return (
    <div
      className={mode === "compact" ? classes.threadCompact : classes.thread}
      data-empty={messages.length === 0 ? "true" : undefined}
      data-office-comments-mode={mode}
      data-resolved={resolved ? "true" : undefined}
    >
      {messages.length === 0 ? (
        <header className={classes.emptyThreadHeader}>
          <MessageSquare size={18} />
          <strong>{labels.newComment}</strong>
          <span>{cellLabel}</span>
        </header>
      ) : null}
      {resolved && labels.resolved ? (
        <header
          className={classes.resolvedHeader}
          data-testid={`${testIdPrefix}-resolved-label`}
        >
          <Check size={14} aria-hidden="true" />
          <strong>{labels.resolved}</strong>
        </header>
      ) : null}
      <ol
        className={classes.messages}
        data-testid={`${testIdPrefix}-messages`}
      >
        {messages.map((message, index) => {
          const editing = editingIndex === index;
          const time = messageAdapter.getTimeLabel(message, index);
          return (
            <li
              key={messageAdapter.getKey(message, index)}
              className={classes.message}
              data-testid={`${testIdPrefix}-message`}
            >
              <CommentAuthorAvatar
                className={classes.avatar}
                initials={messageAdapter.getInitials(message, index)}
                authorId={messageAdapter.getAuthorId?.(message, index)}
                mentions={mentions}
              />
              <div className={classes.messageBody}>
                <div className={classes.messageHeader}>
                  <strong>{messageAdapter.getAuthor(message, index)}</strong>
                  {index === 0 ? (
                    <span className={classes.cellLabel}>{cellLabel}</span>
                  ) : null}
                  {renderMessageActions?.(message, index, resolved)}
                </div>
                {editing ? (
                  <div className={classes.editComposer}>
                    <MentionTextarea
                      mentions={mentions}
                      autoFocus
                      maxLength={maxTextLength}
                      value={editDraft}
                      aria-label={labels.edit}
                      data-testid={`${testIdPrefix}-edit-textarea-${index}`}
                      onChange={(event) =>
                        onEditDraftChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          onCancelEdit();
                        } else if (
                          event.key === "Enter" &&
                          (event.ctrlKey || event.metaKey)
                        ) {
                          event.preventDefault();
                          onSaveEdit(index);
                        }
                      }}
                    />
                    <div className={classes.editActions}>
                      <button type="button" onClick={onCancelEdit}>
                        {labels.cancel}
                      </button>
                      <button
                        type="button"
                        disabled={!editDraft.trim()}
                        onClick={() => onSaveEdit(index)}
                        data-testid={`${testIdPrefix}-edit-save-${index}`}
                      >
                        {labels.save}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={classes.messageText}>
                    <MentionText
                      text={messageAdapter.getText(message, index)}
                      mentions={mentions}
                    />
                  </p>
                )}
                {time ? (
                  <time className={classes.messageTime}>{time}</time>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div
        className={classes.replyComposer}
        data-resolved={resolved ? "true" : undefined}
      >
        <CommentMentionNotice mentions={mentions} threadRef={mentionThreadRef} />
        {resolved ? (
          <button
            type="button"
            className={classes.reopenButton}
            disabled={!canMutateThread}
            title={!canMutateThread ? disabledReason : undefined}
            onClick={onToggleResolved}
          >
            <RotateCcw size={15} />
            {labels.reopen}
          </button>
        ) : (
          <>
            <MentionTextarea
              mentions={mentions}
              rows={1}
              maxLength={maxTextLength}
              value={replyDraft}
              disabled={!canPost}
              title={!canPost ? disabledReason : undefined}
              placeholder={composerPrompt}
              aria-label={composerPrompt}
              aria-keyshortcuts="Control+Enter Meta+Enter Escape"
              data-testid={`${testIdPrefix}-textarea`}
              onChange={(event) => onReplyDraftChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <div className={classes.replyActions}>
              <button
                type="button"
                className={classes.sendButton}
                disabled={!canPost || !replyDraft.trim()}
                // The words keep the focus while Post is pressed: in Safari a
                // pressed button takes none, the composer lost its focus and
                // its layout under the pointer, and the click never came.
                onMouseDown={(event) => event.preventDefault()}
                onClick={onSubmitReply}
                aria-label={labels.post}
                data-control-id={postControl?.controlId}
                data-control-occurrence-id={postControl?.occurrenceId}
                data-control-surface={postControl?.surface}
                data-testid={`${testIdPrefix}-reply-submit`}
              >
                <Send size={17} />
              </button>
              {onClose ? (
                <button
                  type="button"
                  className={classes.closeComposerButton}
                  onClick={onClose}
                  aria-label={labels.close}
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export interface OfficeCommentPopoverProps {
  accent?: string;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  classNames?: OfficeCommentsClassNames;
  closeLabel: string;
  /** The close button waits while the host's write is in flight. */
  closeDisabled?: boolean;
  kind: string;
  onClose: () => void;
  resolved?: boolean;
  showCloseButton?: boolean;
  side: "left" | "right";
  style?: CSSProperties;
  surfaceRef: RefObject<HTMLElement | null>;
  /** The card's own test id (``<testIdPrefix>-thread`` unless given). */
  testId?: string;
  testIdPrefix: string;
}

export function OfficeCommentPopover({
  accent,
  ariaLabel,
  children,
  className,
  classNames,
  closeLabel,
  closeDisabled = false,
  kind,
  onClose,
  resolved = false,
  showCloseButton = true,
  side,
  style,
  surfaceRef,
  testId,
  testIdPrefix,
}: OfficeCommentPopoverProps) {
  const classes = resolveClassNames(classNames);
  return (
    <section
      ref={surfaceRef}
      role="dialog"
      aria-label={ariaLabel}
      className={[classes.popover, className].filter(Boolean).join(" ")}
      data-kind={kind}
      data-office-comments-mode="popover"
      data-resolved={resolved ? "true" : undefined}
      data-side={side}
      data-testid={testId ?? `${testIdPrefix}-thread`}
      style={officeCommentsStyle(accent, style)}
      onPointerDown={stopOfficeCommentsSurfaceEvent}
      onMouseDown={stopOfficeCommentsSurfaceEvent}
      onClick={stopOfficeCommentsSurfaceEvent}
      onDoubleClick={stopOfficeCommentsSurfaceEvent}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {showCloseButton ? (
        <button
          type="button"
          className={classes.popoverClose}
          onClick={onClose}
          disabled={closeDisabled}
          aria-label={closeLabel}
          data-testid={`${testIdPrefix}-close`}
        >
          <X size={16} />
        </button>
      ) : null}
      {children}
    </section>
  );
}

export interface OfficeCommentsPaneProps<TItem, TThread, TMessage> {
  accent?: string;
  activeItemKey: Key | null;
  classNames?: OfficeCommentsClassNames;
  /**
   * A short hint shown in place of the list while there is nothing to list
   * (an editor whose pane may open empty). Omitted, an empty list is blank.
   */
  emptyHint?: string;
  items: readonly TItem[];
  labels: OfficeCommentsPaneLabels;
  messageAdapter: OfficeCommentMessageAdapter<TMessage>;
  /**
   * The pane's own "New" button, under the title. The host supplies the
   * command and its authority (disabled + reason); omitted, no button.
   */
  newAction?: {
    ariaLabel?: string;
    controlId?: string;
    disabled?: boolean;
    disabledReason?: string;
    label: string;
    onClick: () => void;
    /** The button's test id, for a host whose tests predate the shared
     * button (`<prefix>-pane-new` otherwise). */
    testId?: string;
  };
  /** The page's @mention controller: summaries draw mentions as chips. */
  mentions?: CommentMentionsController | null;
  /**
   * What the host shows between the toolbar and the list: a new comment's
   * draft card while it is being written, or a notice. It sits in the pane's
   * flow, so the list below starts after it rather than under it.
   */
  beforeList?: ReactNode;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  paneAdapter: OfficeCommentPaneAdapter<TItem, TThread>;
  paneRef: RefObject<HTMLElement | null>;
  renderActiveThread: (item: TItem) => ReactNode;
  testIdPrefix: string;
  threadAdapter: OfficeCommentThreadAdapter<TThread, TMessage>;
}

export function OfficeCommentsPane<TItem, TThread, TMessage>({
  accent,
  activeItemKey,
  beforeList,
  classNames,
  emptyHint,
  items,
  labels,
  mentions = null,
  messageAdapter,
  newAction,
  onClose,
  onNext,
  onPrevious,
  paneAdapter,
  paneRef,
  renderActiveThread,
  testIdPrefix,
  threadAdapter,
}: OfficeCommentsPaneProps<TItem, TThread, TMessage>) {
  const classes = resolveClassNames(classNames);
  // Under an editor that draws its task panes in the dialogs' chrome (the
  // workbook), the pane is that card: title row, round close, bare icon
  // commands and the chrome's button. Elsewhere it keeps its own look.
  const chromeTone = useOfficeTaskPaneChrome();
  const withChrome = (own: string, part: string) =>
    chromeTone ? `${own} ${part}` : own;
  return (
    <aside
      ref={paneRef}
      tabIndex={-1}
      role="complementary"
      aria-label={labels.comments}
      className={
        chromeTone
          ? `${classes.pane} ${officeDialogClassName({ tone: chromeTone, pane: true })}`
          : classes.pane
      }
      data-office-comments-mode="list"
      data-testid={`${testIdPrefix}-pane`}
      style={officeCommentsStyle(accent)}
      onPointerDown={stopOfficeCommentsSurfaceEvent}
      onMouseDown={stopOfficeCommentsSurfaceEvent}
      onClick={stopOfficeCommentsSurfaceEvent}
      onDoubleClick={stopOfficeCommentsSurfaceEvent}
    >
      <header className={withChrome(classes.paneHeader, officeDialogParts.header)}>
        <div>
          <MessageSquare size={18} />
          <strong className={chromeTone ? officeDialogParts.title : undefined}>
            {labels.comments}
          </strong>
          <span>{items.length}</span>
        </div>
        <nav aria-label={labels.browse}>
          <button
            type="button"
            className={chromeTone ? officeDialogParts.iconButton : undefined}
            disabled={items.length === 0}
            onClick={onPrevious}
            aria-label={labels.previous}
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className={chromeTone ? officeDialogParts.iconButton : undefined}
            disabled={items.length === 0}
            onClick={onNext}
            aria-label={labels.next}
          >
            <ChevronDown size={16} />
          </button>
          {/* Office's Task Pane Options (Move, Size, Close), where the
              editor lays its panes out. */}
          <OfficeTaskPaneOptions
            paneId={OFFICE_COMMENTS_PANE_LAYOUT_ID}
            onClose={onClose}
            className={chromeTone ? officeDialogParts.iconButton : undefined}
            testIdPrefix={testIdPrefix}
          />
          <button
            type="button"
            className={chromeTone ? officeDialogParts.close : undefined}
            onClick={onClose}
            aria-label={labels.close}
            data-testid={`${testIdPrefix}-pane-close`}
          >
            <X size={chromeTone ? 14 : 17} />
          </button>
        </nav>
      </header>
      {newAction ? (
        <div className={classes.paneToolbar}>
          <button
            type="button"
            className={withChrome(classes.paneNewButton, officeDialogParts.compactButton)}
            disabled={newAction.disabled}
            title={newAction.disabled ? newAction.disabledReason : undefined}
            // A disabled New says why in its accessible name too — a title is
            // not announced for a disabled button, and sighted users get it
            // only on hover.
            aria-label={
              newAction.disabled && newAction.disabledReason
                ? `${newAction.ariaLabel ?? newAction.label}: ${newAction.disabledReason}`
                : (newAction.ariaLabel ?? newAction.label)
            }
            data-disabled-reason={
              newAction.disabled ? newAction.disabledReason : undefined
            }
            data-control-id={newAction.controlId}
            data-testid={newAction.testId ?? `${testIdPrefix}-pane-new`}
            onClick={newAction.onClick}
          >
            <MessageSquarePlus size={16} aria-hidden="true" />
            {newAction.label}
          </button>
        </div>
      ) : null}
      {beforeList}
      <div
        className={withChrome(classes.paneBody, officeDialogParts.paneBody)}
        role="feed"
        aria-label={labels.allComments}
        data-testid={`${testIdPrefix}-pane-list`}
      >
        {items.length === 0 && emptyHint ? (
          <p
            className={classes.paneEmpty}
            data-testid={`${testIdPrefix}-pane-empty`}
          >
            {emptyHint}
          </p>
        ) : null}
        {items.map((item, index) => {
          const key = paneAdapter.getKey(item);
          const thread = paneAdapter.getThread(item);
          const messages = threadAdapter.getMessages(thread);
          const first = messages[0];
          const active = key === activeItemKey;
          const author = first
            ? messageAdapter.getAuthor(first, 0)
            : labels.anonymous;
          const text = first ? messageAdapter.getText(first, 0) : "";
          const initials = first
            ? messageAdapter.getInitials(first, 0)
            : labels.anonymous.slice(0, 2).toUpperCase();
          return (
            <article
              key={key}
              className={classes.paneCard}
              aria-current={active ? "true" : undefined}
              aria-posinset={index + 1}
              aria-setsize={items.length}
              data-active={active ? "true" : undefined}
              data-item-key={String(key)}
              data-resolved={
                threadAdapter.isResolved(thread) ? "true" : undefined
              }
              data-testid={`${testIdPrefix}-pane-thread`}
            >
              {active ? (
                renderActiveThread(item)
              ) : (
                <button
                  type="button"
                  className={classes.paneSummary}
                  onClick={() => paneAdapter.onSelect(item)}
                >
                  <CommentAuthorAvatar
                    className={classes.avatar}
                    initials={initials}
                    authorId={
                      first ? messageAdapter.getAuthorId?.(first, 0) : null
                    }
                    mentions={mentions}
                  />
                  <span>
                    <strong>{author}</strong>
                    <small>{paneAdapter.getLocationLabel(item)}</small>
                    <span>
                      <MentionText text={text} mentions={mentions} />
                    </span>
                    {messages.length > 1 ? (
                      <em>
                        {paneAdapter.getReplyCountLabel(
                          item,
                          messages.length - 1,
                        )}
                      </em>
                    ) : null}
                  </span>
                </button>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
