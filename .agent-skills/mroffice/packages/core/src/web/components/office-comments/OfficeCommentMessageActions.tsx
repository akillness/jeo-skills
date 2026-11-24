"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The 👍 and "…" actions of one comment message, as the Docs comments pane
// draws them (Like; Link, Edit, Resolve/Reopen, Delete in the menu). The
// editors say which of them a message allows; the pane looks the same in

// comments pane aligned with Docs').

import {
  Check,
  Link2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ThumbsUp,
  Trash2,
} from "../office-ribbon/icons/houseIcons";
import { RibbonDropdownMenuContent as DropdownMenuContent } from "../office-ribbon/CupertinoRibbonMenu";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface OfficeCommentMessageAction {
  readonly disabled: boolean;
  /** Why it is unavailable (shown as the item's title while disabled). */
  readonly disabledReason?: string;
  readonly onSelect: () => void;
}

export interface OfficeCommentMessageActionsProps {
  readonly commentId: string;
  /** 0 for the thread's first message: its menu resolves and deletes the
   * thread; a reply's deletes the reply. */
  readonly index: number;
  readonly resolved: boolean;
  readonly like: {
    readonly count: number;
    readonly liked: boolean;
    readonly label: string;
    readonly title: string;
    readonly disabled: boolean;
    readonly onToggle: () => void;
  };
  readonly link: OfficeCommentMessageAction;
  readonly edit: OfficeCommentMessageAction;
  readonly resolve: OfficeCommentMessageAction;
  readonly remove: OfficeCommentMessageAction;
  readonly labels: {
    readonly deleteMessage: string;
    readonly deleteThread: string;
    readonly edit: string;
    readonly link: string;
    readonly more: string;
    readonly reopen: string;
    readonly resolve: string;
  };
  readonly registerFocusTarget?: (element: HTMLButtonElement | null) => void;
  /** Test ids; the Docs pane's own by default. */
  readonly testIds?: Partial<{
    like: string;
    menu: string;
    link: string;
    edit: string;
    resolve: string;
    remove: string;
  }>;
}

export function OfficeCommentMessageActions({
  commentId,
  index,
  resolved,
  like,
  link,
  edit,
  resolve,
  remove,
  labels,
  registerFocusTarget,
  testIds,
}: OfficeCommentMessageActionsProps) {
  return (
    <span
      className="comments-panel-message-actions"
      data-comment-id={commentId}
    >
      <button
        type="button"
        className="comments-panel-message-action comments-panel-like"
        data-testid={testIds?.like ?? "comments-panel-like"}
        aria-label={like.label}
        aria-pressed={like.liked}
        title={like.title}
        disabled={like.disabled}
        onClick={like.onToggle}
      >
        <ThumbsUp size={15} aria-hidden />
        {like.count > 0 ? <span>{like.count}</span> : null}
      </button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            ref={registerFocusTarget}
            type="button"
            className="comments-panel-message-action"
            data-testid={testIds?.menu ?? `comments-panel-message-menu-${index}`}
            aria-label={labels.more}
            title={labels.more}
          >
            <MoreHorizontal size={18} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="comments-panel-message-menu"
          sideOffset={4}
        >
          <DropdownMenuItem
            disabled={link.disabled}
            title={link.disabled ? link.disabledReason : undefined}
            onSelect={link.onSelect}
            data-testid={testIds?.link ?? "comments-panel-link"}
          >
            <Link2 size={16} aria-hidden />
            {labels.link}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={edit.disabled}
            title={edit.disabled ? edit.disabledReason : undefined}
            onSelect={edit.onSelect}
            data-testid={testIds?.edit ?? `comments-panel-edit-${index}`}
          >
            <Pencil size={16} aria-hidden />
            {labels.edit}
          </DropdownMenuItem>
          {index === 0 ? (
            <>
              <DropdownMenuItem
                disabled={resolve.disabled}
                title={resolve.disabled ? resolve.disabledReason : undefined}
                onSelect={resolve.onSelect}
                data-testid={testIds?.resolve ?? "comments-panel-resolve"}
              >
                {resolved ? (
                  <RotateCcw size={16} aria-hidden />
                ) : (
                  <Check size={16} aria-hidden />
                )}
                {resolved ? labels.reopen : labels.resolve}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            disabled={remove.disabled}
            title={remove.disabled ? remove.disabledReason : undefined}
            className="comments-panel-destructive-menu-item"
            onSelect={remove.onSelect}
            data-testid={
              testIds?.remove ??
              (index === 0 ? "comments-panel-delete" : "comments-panel-reply-delete")
            }
          >
            <Trash2 size={16} aria-hidden />
            {index === 0 ? labels.deleteThread : labels.deleteMessage}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
