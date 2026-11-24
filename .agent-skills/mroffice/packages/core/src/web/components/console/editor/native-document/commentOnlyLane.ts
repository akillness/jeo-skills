/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { AddMarkStep, RemoveMarkStep, type Step } from "@tiptap/pm/transform";

import { embedAllowsComments } from "../../../../lib/embed/session-access";

import { COMMENT_MARK_NAME } from "./comments";

const COMMENT_THREADS_ATTR = "commentThreads";

const lanes = new WeakMap<object, boolean>();

 
export function setCommentOnlyLane(editor: object | null | undefined, active: boolean): void {
  if (!editor) return;
  if (active) lanes.set(editor, true);
  else lanes.delete(editor);
}

 
export function commentOnlyLaneActive(editor: object | null | undefined): boolean {
  return Boolean(editor && lanes.get(editor) === true);
}




export function commentsWritable(editor: { isEditable?: boolean } | null | undefined): boolean {
  return Boolean(editor && (editor.isEditable === true || commentOnlyLaneActive(editor)) && embedAllowsComments());
}

function isCommentStep(step: Step): boolean {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    return step.mark.type.name === COMMENT_MARK_NAME;
  }
  const json = step.toJSON() as { stepType?: unknown; attr?: unknown };
  return json.stepType === "docAttr" && json.attr === COMMENT_THREADS_ATTR;
}

/** Whether every step of `transaction` is a comment's own (and there is one). */
export function isCommentOnlyTransaction(transaction: { steps: readonly Step[] }): boolean {
  return transaction.steps.length > 0 && transaction.steps.every(isCommentStep);
}
