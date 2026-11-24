"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Comments pane (threads, the composer and replies), rendered while it is
 * open.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { OfficeTaskPaneResizeHandle } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneLayout.tsx";
import {
  OfficeCommentsPane,
  OfficeCommentThread,
  type OfficeCommentMessageAdapter,
  type OfficeCommentPaneAdapter,
  type OfficeCommentThreadAdapter,
} from "@mrnote/core/web/components/office-comments/OfficeCommentsPane.tsx";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { CommentMentionsController } from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import type { SlideComment } from "@mrnote/core/web/lib/presentation-comments.ts";
import type { PresentationCommentMessage, PresentationCommentThread } from "../../../../lib/presentation/comment-threads";
import type { JSX } from "react/jsx-runtime";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationCommentsPaneCtl {
  pageId: string;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  activeIndex: number;
  commentComposerOpen: boolean;
  setCommentComposerOpen: Dispatch<SetStateAction<boolean>>;
  commentDraft: string;
  setCommentDraft: Dispatch<SetStateAction<string>>;
  commentsPaneRef: RefObject<HTMLElement | null>;
  commentMentions: CommentMentionsController | null;
  canAuthorReviewComment: boolean;
  /** Why comments cannot be written now (presentationCommentAuthoringBlock). */
  commentAuthoringBlockedReason: string;
  selectedCommentBlockId: string | undefined;
  submitComment: () => void;
  reviewCommentEntries: { commentId: string; comment: SlideComment; slideId: string; slideIndex: number; }[];
  selectedReviewCommentId: string | null;
  openReviewCommentComposer: () => void;
  closeReviewCommentsPane: () => void;
  navigateReviewComment: (direction: -1 | 1) => void;
  commentAnonymousLabel: string;
  presentationCommentMessageAdapter: OfficeCommentMessageAdapter<PresentationCommentMessage>;
  presentationCommentThreadAdapter: OfficeCommentThreadAdapter<PresentationCommentThread, PresentationCommentMessage>;
  presentationCommentPaneAdapter: OfficeCommentPaneAdapter<{ commentId: string; comment: SlideComment; slideId: string; slideIndex: number; }, PresentationCommentThread>;
  renderPresentationCommentThread: (entry: { commentId: string; comment: SlideComment; slideId: string; slideIndex: number; }) => JSX.Element;
  /** The docked pane's left border, which drags its width. */
  resize?: {
    readonly width: number;
    readonly minWidth: number;
    readonly maxWidth: number;
    readonly onWidth: (width: number, commit: boolean) => void;
  };
}

export function PresentationCommentsPane({ ctl }: { ctl: PresentationCommentsPaneCtl }) {
  const {
    pageId,
    t,
    activeIndex,
    commentComposerOpen,
    setCommentComposerOpen,
    commentDraft,
    setCommentDraft,
    commentsPaneRef,
    commentMentions,
    canAuthorReviewComment,
    commentAuthoringBlockedReason,
    selectedCommentBlockId,
    submitComment,
    reviewCommentEntries,
    selectedReviewCommentId,
    openReviewCommentComposer,
    closeReviewCommentsPane,
    navigateReviewComment,
    commentAnonymousLabel,
    presentationCommentMessageAdapter,
    presentationCommentThreadAdapter,
    presentationCommentPaneAdapter,
    renderPresentationCommentThread,
    resize,
  } = ctl;
  return (
          <aside
            id={`presentation-comments-${pageId}`}
            className={presentationChrome.commentsDock}
            data-composer={commentComposerOpen ? "open" : "closed"}
            data-dock="right"
            data-testid="presentation-comments-panel"
            aria-label={t("presentation.comments.title")}
          >
            {resize ? (
              <OfficeTaskPaneResizeHandle
                width={resize.width}
                minWidth={resize.minWidth}
                maxWidth={resize.maxWidth}
                label={t("presentation.comments.title")}
                className={presentationChrome.commentsResize}
                testId="presentation-comments-resize"
                tabbable={false}
                onWidth={resize.onWidth}
              />
            ) : null}
            {/* The shared Comments pane of all three editors. PowerPoint's
                Comments pane carries its "New" command under the title
                (Microsoft Support, "Modern comments in PowerPoint": select
                New in the Comments pane), which is the shared pane's own
                New button; the draft card follows it in the pane's flow. */}
            <OfficeCommentsPane
              mentions={commentMentions}
              activeItemKey={selectedReviewCommentId}
              beforeList={
                commentComposerOpen ? (
                  <section
                    className={presentationChrome.commentsNewComposerCard}
                    aria-label={t("presentation.comments.add")}
                    data-testid="presentation-comment-new-composer"
                  >
                    <OfficeCommentThread
                      canMutateThread={false}
                      canPost={canAuthorReviewComment}
                      cellLabel={
                        selectedCommentBlockId
                          ? t("presentation.comments.onObject")
                          : t("presentation.zoom.slideLabel", {
                              index: activeIndex + 1,
                            })
                      }
                      disabledReason={commentAuthoringBlockedReason}
                      editDraft=""
                      editingIndex={null}
                      mentions={commentMentions}
                      labels={{
                        cancel: t("presentation.comments.cancelEdit"),
                        close: t("presentation.comments.cancelEdit"),
                        edit: t("presentation.comments.editComment"),
                        newComment: t("presentation.comments.add"),
                        post: t("presentation.comments.add"),
                        reopen: t("presentation.comments.reopen"),
                        replyPlaceholder: selectedCommentBlockId
                          ? t("presentation.comments.placeholderOnObject")
                          : t("presentation.comments.placeholder"),
                        save: t("presentation.comments.saveEdit"),
                      }}
                      messageAdapter={presentationCommentMessageAdapter}
                      mode="compact"
                      onCancelEdit={() => undefined}
                      onClose={() => {
                        setCommentComposerOpen(false);
                        requestAnimationFrame(() =>
                          commentsPaneRef.current
                            ?.querySelector<HTMLButtonElement>(
                              '[data-testid="presentation-comments-new"]',
                            )
                            ?.focus({ preventScroll: true }),
                        );
                      }}
                      onEditDraftChange={() => undefined}
                      onReplyDraftChange={setCommentDraft}
                      onSaveEdit={() => undefined}
                      onSubmitReply={submitComment}
                      onToggleResolved={() => undefined}
                      postControl={{
                        controlId: "PPTCTL.REVIEW.COMMENT.ADD",
                        occurrenceId: "new",
                        surface: "presentation-comments-pane",
                      }}
                      replyDraft={commentDraft}
                      testIdPrefix="presentation-comment-new"
                      thread={{ comment: null }}
                      threadAdapter={presentationCommentThreadAdapter}
                    />
                    {!canAuthorReviewComment ? (
                      <span
                        className={presentationChrome.commentsIdentityStatus}
                        role="status"
                        data-testid="presentation-comment-identity-status"
                      >
                        {commentAuthoringBlockedReason}
                      </span>
                    ) : null}
                  </section>
                ) : reviewCommentEntries.length === 0 ? (
                  <p
                    className={presentationChrome.commentsEmpty}
                    data-testid="presentation-comments-empty"
                  >
                    {t("presentation.comments.empty")}
                  </p>
                ) : null
              }
              items={reviewCommentEntries}
              labels={{
                allComments: t("presentation.comments.title"),
                anonymous: commentAnonymousLabel,
                browse: t("presentation.comments.title"),
                close: t("presentation.comments.hideLabel"),
                comments: t("presentation.comments.title"),
                next: t("presentation.review.nextComment"),
                previous: t("presentation.review.previousComment"),
              }}
              messageAdapter={presentationCommentMessageAdapter}
              newAction={{
                disabled: !canAuthorReviewComment,
                disabledReason: commentAuthoringBlockedReason,
                label: t("presentation.comments.add"),
                onClick: openReviewCommentComposer,
                testId: "presentation-comments-new",
              }}
              onClose={closeReviewCommentsPane}
              onNext={() => navigateReviewComment(1)}
              onPrevious={() => navigateReviewComment(-1)}
              paneAdapter={presentationCommentPaneAdapter}
              paneRef={commentsPaneRef}
              renderActiveThread={renderPresentationCommentThread}
              testIdPrefix="presentation-comments"
              threadAdapter={presentationCommentThreadAdapter}
            />
          </aside>
  );
}
