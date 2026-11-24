"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { sheetWithPostedComment, sheetWithCommentResolveToggled, applyCellCommentChange, commentMessageOwnedBy } from "../../../../lib/spreadsheet/review-buttons";
import { useCallback, type RefObject } from "react";
import { spreadsheetReviewCommentWriterReceiptMatches } from "../../../../lib/spreadsheet/visible-command-authority";
import { isNoteComment, isThreadComment, type CellComment, type CommentMessage, type ThreadComment, editCommentMessage, deleteCommentReply } from "@mrnote/core/web/lib/spreadsheet/comments.ts";
import { writeEmbedComment, type EmbedCommentRequest } from "@mrnote/core/web/lib/embed/comment-session.ts";
import { embedAllowsManagingComment } from "@mrnote/core/web/lib/embed/session-access.ts";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type ReviewCommentMutationReceipt, type PageSetupSelectionSnapshot, type ReviewCommentDialogAuthority, type LiveReviewCommentPageAuthority } from "./spreadsheetMutationReceipts";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type CommentMentionsController } from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetReviewCommentCommands reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetReviewCommentCommandsInputs {
  closeCellCommentSurface: () => void;
  commentEditDraft: string;
  commentMentions: CommentMentionsController | null;
  isSheetProtectionEffectiveRef: RefObject<(candidate: SheetModel | null | undefined) => boolean>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  readPageSetupSelectionSnapshot: () => PageSetupSelectionSnapshot | null;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  reviewCommentActorId: string;
  reviewCommentActorName: string;
  reviewCommentDialogAuthority: ReviewCommentDialogAuthority | null;
  reviewCommentMutationCommandRef: RefObject<ReviewCommentMutationReceipt | null>;
  reviewCommentPageAuthorityIsCurrent: (authority: ReviewCommentDialogAuthority | null | undefined) => boolean;
  reviewCommentPageAuthorityRef: RefObject<LiveReviewCommentPageAuthority | null>;
  setCommentDraft: Dispatch<SetStateAction<string>>;
  setCommentEditDraft: Dispatch<SetStateAction<string>>;
  setCommentEditingIndex: Dispatch<SetStateAction<number | null>>;
  /** An embed comment session (lib/embed/session-access embedCommentsMediated):
   * the page is read only, and each comment gesture goes to the session's
   * comment route instead of changing and saving the page. */
  reviewCommentsMediated: boolean;
  /** Puts the thread the comment route answered into the cell on screen,
   * without saving or dirtying the page (null: the thread was deleted). */
  applyMediatedReviewComment: (sheetId: string, cellKey: string, comment: ThreadComment | null) => boolean;
  /** What a refused comment write says when the server gave no words. */
  mediatedReviewCommentRefusedText: string;
}

/** One comment gesture on a workbook cell, as the editor's controls make it. */
export type EmbedReviewCommentGesture =
  | { readonly kind: "post"; readonly text: string }
  | { readonly kind: "resolveToggle" }
  | { readonly kind: "deleteThread" }
  | { readonly kind: "edit"; readonly messageIndex: number; readonly text: string }
  | { readonly kind: "deleteReply"; readonly messageIndex: number };

/**
 * The comment route's request for a gesture on the cell at `row`/`col` of the
 * sheet `sheetId`, whose comment is `comment` now; null when the gesture is
 * not one the route takes there. The route writes threads only (a note stays
 * as the file has it), refuses a reply to a resolved thread as the editor
 * does, and names a message by its id, or by its place in the thread when it
 * has none (a thread read from a file before messages had ids).
 */
export function embedReviewCommentRequest(
  sheetId: string,
  row: number,
  col: number,
  comment: CellComment | undefined,
  gesture: EmbedReviewCommentGesture,
): EmbedCommentRequest | null {
  if (!sheetId || comment?.nativeBlocker || isNoteComment(comment)) return null;
  const anchor = { sheet: sheetId, cell: `${row}:${col}` };
  // A thread holding only a draft has no message yet: its first post adds it.
  const thread = isThreadComment(comment) && comment.thread.length > 0 ? comment : null;
  switch (gesture.kind) {
    case "post": {
      const text = gesture.text.trim();
      if (!text || thread?.done) return null;
      return thread ? { op: "reply", anchor, text } : { op: "add", anchor, text };
    }
    case "resolveToggle":
      return thread ? { op: thread.done ? "reopen" : "resolve", anchor } : null;
    case "deleteThread":
      return thread ? { op: "delete", anchor } : null;
    case "edit": {
      const message = thread?.thread[gesture.messageIndex];
      const text = gesture.text.trim();
      if (!thread || !message || thread.done || !text) return null;
      return { op: "edit", anchor, message: message.id ?? gesture.messageIndex, text };
    }
    case "deleteReply": {
      // The root message goes only with its thread (Delete thread).
      const message = gesture.messageIndex > 0 ? thread?.thread[gesture.messageIndex] : undefined;
      if (!message) return null;
      return { op: "delete", anchor, message: message.id ?? gesture.messageIndex };
    }
  }
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetReviewCommentCommands({
  closeCellCommentSurface,
  commentEditDraft,
  commentMentions,
  isSheetProtectionEffectiveRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  readPageSetupSelectionSnapshot,
  replaceActiveSheet,
  reviewCommentActorId,
  reviewCommentActorName,
  reviewCommentDialogAuthority,
  reviewCommentMutationCommandRef,
  reviewCommentPageAuthorityIsCurrent,
  reviewCommentPageAuthorityRef,
  setCommentDraft,
  setCommentEditDraft,
  setCommentEditingIndex,
  reviewCommentsMediated,
  applyMediatedReviewComment,
  mediatedReviewCommentRefusedText,
}: SpreadsheetReviewCommentCommandsInputs) {
  // An embed comment session's gesture: the server decides its author and
  // writes it to the page; the cell then shows the thread as the page holds
  // it. Ids, authors and times built here are not used. The answer comes
  // after the gesture returns, so `onDone` runs what the gesture's surface
  // does once the comment is written (clear the composer, close the editor).
  const writeMediatedReviewComment = useCallback(
    (request: EmbedCommentRequest, onDone?: () => void): void => {
      void writeEmbedComment<ThreadComment>(request).then((answer) => {
        if (!answer.ok) {
          toast({
            variant: "destructive",
            description: answer.message || mediatedReviewCommentRefusedText,
          });
          return;
        }
        const anchor = request.anchor as { sheet: string; cell: string };
        const sheet = answer.result.sheet ?? anchor.sheet;
        const cell = answer.result.cell ?? anchor.cell;
        applyMediatedReviewComment(sheet, cell, answer.result.comment);
        // The people the words mention hear of it (the host's
        // onRequestSendNotify), as from a saved comment.
        if (request.text && (request.op === "add" || request.op === "reply" || request.op === "edit")) {
          commentMentions?.notifyPosted({
            threadRef: `${sheet}:${cell}`,
            ...(answer.result.message ? { messageRef: answer.result.message } : {}),
            text: request.text,
          });
        }
        onDone?.();
      });
    },
    [applyMediatedReviewComment, commentMentions, mediatedReviewCommentRefusedText],
  );

  const executeReviewCommentReceiptWriter = useCallback(
    (
      expectedControlId: ReviewCommentMutationReceipt["controlId"],
    ): boolean => {
      const receipt = reviewCommentMutationCommandRef.current;
      try {
        if (!receipt) return false;
        const liveSelection = readPageSetupSelectionSnapshot();
        const liveWorkbook = liveSheetsRef.current;
        const liveIndex = liveActiveSheetIndexRef.current;
        const liveSheet = liveWorkbook[liveIndex];
        const livePageAuthority = reviewCommentPageAuthorityRef.current;
        if (!liveSelection || !liveSheet || !livePageAuthority?.allowed) {
          return false;
        }
        const liveComment =
          liveSheet.cells[
            `${liveSelection.active.row}:${liveSelection.active.col}`
          ]?.comment;
        const liveParameter =
          expectedControlId === "XLSCTL.REVIEW.COMMENT.RESOLVE_TOGGLE" &&
          isThreadComment(liveComment)
            ? String(!liveComment.done)
            : receipt.parameter;
        if (
          !spreadsheetReviewCommentWriterReceiptMatches({
            expectedControlId,
            receiptControlId: receipt.controlId,
            sourceWorkbook: receipt.workbook,
            sourceActiveSheetIndex: receipt.activeSheetIndex,
            sourceSheet: receipt.sheet,
            sourceSheetId: receipt.sheetId,
            sourceSelectionEpoch: receipt.selection.epoch,
            sourceRow: receipt.selection.active.row,
            sourceCol: receipt.selection.active.col,
            sourceComment: receipt.comment,
            sourceParameter: receipt.parameter,
            sourcePageId: receipt.pageId,
            sourcePageAuthorityGeneration: receipt.pageAuthorityGeneration,
            sourceActorId: receipt.actorId,
            sourceActorName: receipt.actorName,
            liveWorkbook,
            liveActiveSheetIndex: liveIndex,
            liveSheet,
            liveSheetId: liveSheet.id,
            liveSelectionEpoch: liveSelection.epoch,
            liveRow: liveSelection.active.row,
            liveCol: liveSelection.active.col,
            liveComment,
            liveParameter,
            livePageId: livePageAuthority.pageId,
            livePageAuthorityGeneration: livePageAuthority.generation,
            liveActorId: livePageAuthority.actorId,
            liveActorName: livePageAuthority.actorName,
          }) ||
          isSheetProtectionEffectiveRef.current(liveSheet) ||
          liveComment?.nativeBlocker
        ) {
          return false;
        }
        const row = liveSelection.active.row;
        const col = liveSelection.active.col;
        if (reviewCommentsMediated) {
          const root = isThreadComment(liveComment) ? liveComment.thread[0] : undefined;
          // Resolving or deleting another person's thread needs the
          // session's manageComments (the server refuses it too).
          if (
            expectedControlId !== "XLSCTL.REVIEW.COMMENT.POST" &&
            root &&
            !commentMessageOwnedBy(root, receipt.actorId, receipt.actorName) &&
            !embedAllowsManagingComment(root.author, receipt.actorName)
          ) {
            return false;
          }
          const request = embedReviewCommentRequest(
            liveSheet.id,
            row,
            col,
            liveComment,
            expectedControlId === "XLSCTL.REVIEW.COMMENT.POST"
              ? { kind: "post", text: receipt.parameter }
              : expectedControlId === "XLSCTL.REVIEW.COMMENT.RESOLVE_TOGGLE"
                ? { kind: "resolveToggle" }
                : { kind: "deleteThread" },
          );
          if (!request) return false;
          writeMediatedReviewComment(
            request,
            expectedControlId === "XLSCTL.REVIEW.COMMENT.POST"
              ? () => setCommentDraft("")
              : expectedControlId === "XLSCTL.REVIEW.COMMENT.DELETE"
                ? closeCellCommentSurface
                : undefined,
          );
          return true;
        }
        if (expectedControlId === "XLSCTL.REVIEW.COMMENT.POST") {
          const posted = sheetWithPostedComment(
            liveSheet,
            row,
            col,
            receipt.parameter,
            receipt.actorName,
            Date.now(),
            receipt.actorId,
            globalThis.crypto?.randomUUID?.(),
          );
          if (!posted) return false;
          replaceActiveSheet(posted);
          setCommentDraft("");
          return true;
        }
        if (
          expectedControlId === "XLSCTL.REVIEW.COMMENT.RESOLVE_TOGGLE"
        ) {
          const toggled = sheetWithCommentResolveToggled(liveSheet, row, col);
          if (!toggled) return false;
          replaceActiveSheet(toggled);
          return true;
        }
        if (!isThreadComment(liveComment)) return false;
        replaceActiveSheet(
          applyCellCommentChange(liveSheet, row, col, () => undefined),
        );
        closeCellCommentSurface();
        return true;
      } finally {
        reviewCommentMutationCommandRef.current = null;
      }
    },
    [closeCellCommentSurface, readPageSetupSelectionSnapshot, replaceActiveSheet, reviewCommentsMediated, writeMediatedReviewComment],
  );

  const reviewCommentMessageOwnedByActor = useCallback(
    (message: CommentMessage): boolean => {
      if (!reviewCommentPageAuthorityRef.current?.allowed) return false;
      return commentMessageOwnedBy(
        message,
        reviewCommentActorId,
        reviewCommentActorName,
      );
    },
    [reviewCommentActorId, reviewCommentActorName],
  );

  const resolveLiveReviewCommentMutation = useCallback((): {
    comment: ThreadComment;
    col: number;
    liveSheet: SheetModel;
    row: number;
  } | null => {
    const authority = reviewCommentDialogAuthority;
    const pageAuthority = reviewCommentPageAuthorityRef.current;
    const liveSelection = readPageSetupSelectionSnapshot();
    const liveWorkbook = liveSheetsRef.current;
    const liveIndex = liveActiveSheetIndexRef.current;
    const liveSheet = liveWorkbook[liveIndex];
    if (
      !authority ||
      !pageAuthority?.allowed ||
      !reviewCommentPageAuthorityIsCurrent(authority) ||
      !liveSelection ||
      !liveSheet ||
      authority.workbook !== liveWorkbook ||
      authority.activeSheetIndex !== liveIndex ||
      authority.sheet !== liveSheet ||
      authority.sheetId !== liveSheet.id ||
      authority.selection.epoch !== liveSelection.epoch ||
      authority.selection.active.row !== liveSelection.active.row ||
      authority.selection.active.col !== liveSelection.active.col ||
      authority.actorId !== pageAuthority.actorId ||
      authority.actorName !== pageAuthority.actorName ||
      isSheetProtectionEffectiveRef.current(liveSheet)
    ) {
      return null;
    }
    const row = liveSelection.active.row;
    const col = liveSelection.active.col;
    const liveComment = liveSheet.cells[`${row}:${col}`]?.comment;
    if (
      liveComment !== authority.comment ||
      !isThreadComment(liveComment) ||
      liveComment.nativeBlocker
    ) {
      return null;
    }
    return { comment: liveComment, col, liveSheet, row };
  }, [
    readPageSetupSelectionSnapshot,
    reviewCommentDialogAuthority,
    reviewCommentPageAuthorityIsCurrent,
  ]);

  const startEditingReviewCommentMessage = useCallback(
    (messageIndex: number) => {
      const live = resolveLiveReviewCommentMutation();
      const message = live?.comment.thread[messageIndex];
      if (
        !live ||
        !message ||
        live.comment.done ||
        !reviewCommentMessageOwnedByActor(message)
      ) {
        return;
      }
      setCommentEditingIndex(messageIndex);
      setCommentEditDraft(message.text);
    }, [resolveLiveReviewCommentMutation, reviewCommentMessageOwnedByActor],
  );

  const saveEditedReviewCommentMessage = useCallback(
    (messageIndex: number) => {
      const live = resolveLiveReviewCommentMutation();
      const message = live?.comment.thread[messageIndex];
      if (
        !live ||
        !message ||
        live.comment.done ||
        !reviewCommentMessageOwnedByActor(message)
      ) {
        return;
      }
      const nextComment = editCommentMessage(
        live.comment,
        messageIndex,
        commentEditDraft,
      );
      if (!nextComment || nextComment === live.comment) {
        setCommentEditingIndex(null);
        setCommentEditDraft("");
        return;
      }
      if (reviewCommentsMediated) {
        const request = embedReviewCommentRequest(
          live.liveSheet.id,
          live.row,
          live.col,
          live.comment,
          { kind: "edit", messageIndex, text: commentEditDraft },
        );
        if (!request) return;
        // The editor stays open until the server takes the edit, so a
        // refused one keeps the words typed.
        writeMediatedReviewComment(request, () => {
          setCommentEditingIndex(null);
          setCommentEditDraft("");
        });
        return;
      }
      replaceActiveSheet(
        applyCellCommentChange(live.liveSheet, live.row, live.col, () =>
          nextComment,
        ),
      );
      commentMentions?.notifyPosted({
        threadRef: `${live.liveSheet.id}:${live.row}:${live.col}`,
        messageRef: message.id,
        text: commentEditDraft,
        previousText: message.text,
      });
      setCommentEditingIndex(null);
      setCommentEditDraft("");
    }, [
      commentEditDraft,
      commentMentions,
      replaceActiveSheet,
      resolveLiveReviewCommentMutation,
      reviewCommentMessageOwnedByActor,
      reviewCommentsMediated,
      writeMediatedReviewComment,
    ],
  );

  const deleteReviewCommentReply = useCallback(
    (messageIndex: number) => {
      const live = resolveLiveReviewCommentMutation();
      const message = live?.comment.thread[messageIndex];
      if (
        !live ||
        !message ||
        messageIndex <= 0 ||
        !reviewCommentMessageOwnedByActor(message)
      ) {
        return;
      }
      const nextComment = deleteCommentReply(live.comment, messageIndex);
      if (!nextComment || nextComment === live.comment) return;
      if (reviewCommentsMediated) {
        const request = embedReviewCommentRequest(
          live.liveSheet.id,
          live.row,
          live.col,
          live.comment,
          { kind: "deleteReply", messageIndex },
        );
        if (!request) return;
        writeMediatedReviewComment(request, () => {
          setCommentEditingIndex(null);
          setCommentEditDraft("");
        });
        return;
      }
      replaceActiveSheet(
        applyCellCommentChange(live.liveSheet, live.row, live.col, () =>
          nextComment,
        ),
      );
      setCommentEditingIndex(null);
      setCommentEditDraft("");
    }, [
      replaceActiveSheet,
      resolveLiveReviewCommentMutation,
      reviewCommentMessageOwnedByActor,
      reviewCommentsMediated,
      writeMediatedReviewComment,
    ],
  );
  return {
    deleteReviewCommentReply,
    executeReviewCommentReceiptWriter,
    reviewCommentMessageOwnedByActor,
    saveEditedReviewCommentMessage,
    startEditingReviewCommentMessage,
  };
}
