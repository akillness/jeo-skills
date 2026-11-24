/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  validateNativeDocumentCommandForApply,
  type NativeDocumentCommandRejectionReason,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommandsCore.ts";
import {
  isDocumentEditProposal,
  type DocumentEditContext,
  type DocumentEditProposal,
} from "./documentEditEventBus";

// Everything but the direct-apply validator lives in documentEditEventBus.
export * from "./documentEditEventBus";

export type DirectDocumentEditApplyRejectionReason =
  NativeDocumentCommandRejectionReason | "unreadable_pdf_context";

export type DirectDocumentEditApplyValidation =
  | { ok: true; requiresConfirmation: boolean }
  | { ok: false; reason: DirectDocumentEditApplyRejectionReason };

function truthyContextFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function mergedCommandContext(
  proposal: DocumentEditProposal,
  liveContext?: DocumentEditContext | null,
): Record<string, unknown> {
  const commandContext =
    proposal.command.command_context &&
    typeof proposal.command.command_context === "object"
      ? proposal.command.command_context
      : {};
  const liveCommandContext =
    liveContext?.command_context &&
    typeof liveContext.command_context === "object"
      ? liveContext.command_context
      : {};
  return {
    ...commandContext,
    ...liveCommandContext,
  };
}

export function validateDocumentEditProposalForDirectApply(
  proposal: DocumentEditProposal,
  liveContext?: DocumentEditContext | null,
): DirectDocumentEditApplyValidation {
  if (!isDocumentEditProposal(proposal)) {
    return { ok: false, reason: "invalid_command" };
  }
  const commandValidation = validateNativeDocumentCommandForApply(
    proposal.command,
  );
  if (!commandValidation.ok) {
    return commandValidation;
  }
  const commandContext = mergedCommandContext(proposal, liveContext);
  const pageType = String(
    liveContext?.page_type || proposal.page_type || "",
  ).toLowerCase();
  if (
    pageType === "pdf" &&
    truthyContextFlag(commandContext.pdf_text_degraded) &&
    !truthyContextFlag(commandContext.pdf_text_editable)
  ) {
    return { ok: false, reason: "unreadable_pdf_context" };
  }
  return {
    ok: true,
    requiresConfirmation: proposal.command.source !== "user",
  };
}
