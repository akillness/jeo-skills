/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The document-edit event bus: the events, their details, proposal shape
// checks and the dispatchers. Apart from the direct-apply validator (which
// stays in documentEditEvents, re-exporting all of this) it needs nothing of
// the command applier, so the AI run card and the conversation read it
// without loading the editor's command machinery.
import {
  isNativeDocumentCommand,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommandShape.ts";
import type { NativeDocumentCommand } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { DocumentEditVerification } from "./documentEditVerification";

export const DOCUMENT_EDIT_PROPOSAL_TYPE = "mrnote.document-edit-proposal.v1";
export const APPLY_DOCUMENT_EDIT_COMMAND_EVENT =
  "mrnote:apply-document-edit-command";
export const DOCUMENT_EDIT_APPLIED_EVENT = "mrnote:document-edit-applied";
export const DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT =
  "mrnote:document-edit-context-request";
export const DOCUMENT_EDIT_UNDO_REQUEST_EVENT =
  "mrnote:document-edit-undo-request";
export const DOCUMENT_EDIT_UNDO_RESULT_EVENT =
  "mrnote:document-edit-undo-result";
// Fired when an AI-edit undo snapshot is evicted by the cap (its receipt can no
// longer be undone). The AI panel listens and drops the now-dead undo affordance
// proactively, instead of leaving a button that only fails when finally clicked.
export const DOCUMENT_EDIT_UNDO_EXPIRED_EVENT =
  "mrnote:document-edit-undo-expired";
// Asks the editor in one window to bring a passage into view and flash it,
// without touching the document or its selection: "show me where this change
// goes" from the AI panel docked beside it.
export const DOCUMENT_LOCATE_REQUEST_EVENT = "mrnote:document-locate-request";

/**
 * Upper bound on retained AI-edit undo snapshots per editor window. Each open
 * editor keeps a `Map<receiptId, fullContentSnapshot>` that gains one entry per
 * applied AI edit and frees an entry only when that edit is undone. Undo is only
 * ever invoked for a RECENT receipt (via the AI panel), so without a cap a long
 * session that applies many edits without undoing accumulates one full-content
 * snapshot per edit for the window's whole lifetime (heap grows linearly,
 * heaviest for spreadsheet/presentation full-page snapshots). 20 keeps recent
 * undo working while bounding retained memory to a constant.
 */
export const MAX_AI_EDIT_UNDO_SNAPSHOTS = 20;

/**
 * Store an AI-edit undo snapshot, evicting the oldest entries once the map
 * exceeds `max`. `Map` preserves insertion order, so the first key is the
 * oldest. Use this instead of a bare `map.set` at every undo-snapshot write
 * site so retained memory stays bounded regardless of session length.
 */
export function rememberCappedSnapshot<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  max: number = MAX_AI_EDIT_UNDO_SNAPSHOTS,
): void {
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value as K | undefined;
    if (oldest === undefined) {
      break;
    }
    map.delete(oldest);
    // The evicted key is a receipt id whose undo snapshot is gone; tell the AI
    // panel so it retires that receipt's undo button now (every caller of this
    // helper keys the map by receipt id). Never the just-inserted `key`, which
    // is the newest and is never the one evicted.
    notifyDocumentEditUndoExpired(String(oldest));
  }
}

export interface DocumentEditProposal {
  type: typeof DOCUMENT_EDIT_PROPOSAL_TYPE;
  /** Server-minted identity for this proposal, independent of its turn log. */
  proposal_id?: string;
  /** "superseded": a newer proposal for the same page replaced this one. */
  status: "pending" | "applied" | "failed" | "superseded";
  /** Durable receipt for this exact proposal, restored with conversation history. */
  receipt?: DocumentEditReceipt | null;
  /** Bounded failure detail associated with this exact proposal. */
  status_detail?: string | null;
  summary: string;
  /**
   * "default" when the backend used its template summary instead of a
   * model-provided one — the panel localizes the title in that case rather
   * than showing the English template.
   */
  summary_source?: "model" | "default" | string;
  target_page_id: string;
  target_window_id?: string | null;
  target_label?: string | null;
  page_type?: "document" | "spreadsheet" | "presentation" | "pdf" | string;
  /** NotebookPage.content_version the operations were derived against. */
  base_content_version?: number;
  command: NativeDocumentCommand;
}

export interface DocumentEditContext {
  page_type: "document" | "spreadsheet" | "presentation" | "pdf" | string;
  target_page_id: string;
  target_window_id?: string | null;
  selected_text?: string;
  /**
   * Set when `selected_text` was clipped to the request size cap, so the
   * truncation is explicit rather than silent (mirrors `context_truncated` on
   * `command_context`). The UI also warns the user before the clip.
   */
  selected_text_truncated?: boolean;
  /**
   * Live plain text from the active document surface. This is intentionally
   * separate from `selected_text`: an empty selection still needs fresh page
   * context, but it must not pretend the whole document is a user selection.
   */
  document_text?: string;
  document_text_truncated?: boolean;
  /**
   * The document as the editor holds it (TipTap JSON), so a proposal that ships
   * a document can be flattened the same way as the page and compared block by
   * block; `document_text` is the AI's serialization and does not line up.
   */
  document_json?: unknown;
  /** Structural editor truth; false also covers textless images/tables. */
  document_is_empty?: boolean;
  target_label?: string;
  command_context?: Record<string, unknown>;
}

export interface DocumentEditContextRequest {
  targetPageId: string;
  targetWindowId?: string | null;
}

export interface ApplyDocumentEditCommandDetail {
  proposalId: string;
  targetPageId: string;
  targetWindowId?: string | null;
  /** Server revision the proposal was derived from, when available. */
  baseContentVersion?: number | null;
  command: NativeDocumentCommand;
}

export interface DocumentEditReceipt {
  schemaVersion: 1 | 2;
  id: string;
  proposalId: string;
  targetPageId: string;
  targetWindowId?: string | null;
  pageType?: string | null;
  actionType?: string | null;
  operationCount: number;
  appliedAt: string;
  undoable: boolean;
  verification?: DocumentEditVerification | null;
}

export interface DocumentEditAppliedDetail {
  proposalId: string;
  targetPageId: string;
  targetWindowId?: string | null;
  ok: boolean;
  message?: string;
  receipt?: DocumentEditReceipt | null;
}

export interface DocumentEditUndoRequestDetail {
  receiptId: string;
  proposalId?: string | null;
  targetPageId: string;
  targetWindowId?: string | null;
}

export interface DocumentEditUndoResultDetail {
  receiptId: string;
  proposalId?: string | null;
  targetPageId: string;
  targetWindowId?: string | null;
  ok: boolean;
  message?: string;
}

export interface DocumentEditUndoExpiredDetail {
  receiptId: string;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isDocumentEditProposal(
  value: unknown,
): value is DocumentEditProposal {
  if (!value || typeof value !== "object") return false;
  const proposal = value as Partial<DocumentEditProposal>;
  return (
    proposal.type === DOCUMENT_EDIT_PROPOSAL_TYPE &&
    (proposal.proposal_id === undefined || nonEmptyString(proposal.proposal_id)) &&
    nonEmptyString(proposal.summary) &&
    nonEmptyString(proposal.target_page_id) &&
    isNativeDocumentCommand(proposal.command)
  );
}

export function documentEditCommandMatchesTarget(
  detail: Pick<
    ApplyDocumentEditCommandDetail,
    "targetPageId" | "targetWindowId"
  >,
  target: { pageId: string; windowId?: string | null },
): boolean {
  if (detail.targetPageId !== target.pageId) return false;
  if (detail.targetWindowId) {
    return (
      Boolean(target.windowId) && detail.targetWindowId === target.windowId
    );
  }
  return true;
}

export function documentEditProposalId(proposal: DocumentEditProposal): string {
  return (
    proposal.proposal_id ||
    proposal.command.action_log_id ||
    proposal.command.action_type ||
    `${proposal.target_page_id}:${proposal.summary}`
  );
}

export function dispatchDocumentEditCommand(
  proposal: DocumentEditProposal,
): string {
  const proposalId = documentEditProposalId(proposal);
  let targetWindowId = proposal.target_window_id || null;
  // Probe for a LIVE editor listener before dispatching — whether or not the
  // proposal baked in a target_window_id. A baked id can be ORPHANED: the user
  // closes (or closes + reopens) the edited page while the floating AI panel
  // stays open, and a reopened page mints a NEW window id. With no live editor
  // to answer APPLY_DOCUMENT_EDIT_COMMAND_EVENT, the "Apply" affordance would
  // hang on "applying" forever. A synchronous context probe (windowId-filtered
  // when present) lets us fail fast with a terminal ok:false the panel surfaces
  // as "failed" — symmetric with the no-window-id branch, which already probed.
  const context = requestDocumentEditContext({
    targetPageId: proposal.target_page_id,
    targetWindowId: targetWindowId || undefined,
  });
  if (!context) {
    notifyDocumentEditApplied({
      proposalId,
      targetPageId: proposal.target_page_id,
      targetWindowId,
      ok: false,
      message: targetWindowId
        ? "The editor for this page is no longer open — reopen it and try again."
        : "No unique open target window was found.",
    });
    return proposalId;
  }
  targetWindowId = context.target_window_id || targetWindowId;
  window.dispatchEvent(
    new CustomEvent<ApplyDocumentEditCommandDetail>(
      APPLY_DOCUMENT_EDIT_COMMAND_EVENT,
      {
        detail: {
          proposalId,
          targetPageId: proposal.target_page_id,
          targetWindowId,
          baseContentVersion: proposal.base_content_version ?? null,
          command: proposal.command,
        },
      },
    ),
  );
  return proposalId;
}

export function notifyDocumentEditApplied(
  detail: DocumentEditAppliedDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<DocumentEditAppliedDetail>(DOCUMENT_EDIT_APPLIED_EVENT, {
      detail,
    }),
  );
}

export function notifyDocumentEditUndoResult(
  detail: DocumentEditUndoResultDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<DocumentEditUndoResultDetail>(
      DOCUMENT_EDIT_UNDO_RESULT_EVENT,
      {
        detail,
      },
    ),
  );
}

export function notifyDocumentEditUndoExpired(receiptId: string): void {
  // Called from rememberCappedSnapshot, which is also exercised in pure unit
  // tests; guard so a non-DOM environment can't crash on a snapshot eviction.
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DocumentEditUndoExpiredDetail>(
      DOCUMENT_EDIT_UNDO_EXPIRED_EVENT,
      { detail: { receiptId } },
    ),
  );
}

export function dispatchDocumentEditUndoRequest(
  detail: DocumentEditUndoRequestDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<DocumentEditUndoRequestDetail>(
      DOCUMENT_EDIT_UNDO_REQUEST_EVENT,
      {
        detail,
      },
    ),
  );
}

export function createDocumentEditReceipt(
  detail: ApplyDocumentEditCommandDetail,
  options: {
    pageType?: string | null;
    undoable?: boolean;
    verification?: DocumentEditVerification | null;
  } = {},
): DocumentEditReceipt {
  return {
    schemaVersion: options.verification ? 2 : 1,
    id: `${detail.proposalId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    proposalId: detail.proposalId,
    targetPageId: detail.targetPageId,
    targetWindowId: detail.targetWindowId || null,
    pageType: options.pageType || null,
    actionType: detail.command.action_type || null,
    operationCount: detail.command.operations.length,
    appliedAt: new Date().toISOString(),
    undoable: options.undoable ?? true,
    verification: options.verification ?? null,
  };
}

/** Serialize the bounded receipt shape accepted by the status endpoint. */
export function documentEditReceiptStatusPayload(
  receipt: DocumentEditReceipt,
): Record<string, unknown> {
  const verification = receipt.verification;
  return {
    schema_version: receipt.schemaVersion,
    id: receipt.id,
    proposal_id: receipt.proposalId,
    target_page_id: receipt.targetPageId,
    target_window_id: receipt.targetWindowId || null,
    page_type: receipt.pageType || null,
    action_type: receipt.actionType || null,
    operation_count: receipt.operationCount,
    applied_at: receipt.appliedAt,
    undoable: receipt.undoable,
    ...(verification
      ? {
          verification: {
            schema_version: verification.schemaVersion,
            outcome: verification.outcome,
            write_status: verification.writeStatus,
            read_back_status: verification.readBackStatus,
            structure_status: verification.structureStatus,
            render_status: verification.renderStatus,
            source_content_version: verification.sourceContentVersion,
            saved_content_version: verification.savedContentVersion,
            read_back_content_version: verification.readBackContentVersion,
            source_package_status: verification.sourcePackageStatus,
            source_package_loss_entry_count:
              verification.sourcePackageLossEntryCount,
            verified_at: verification.verifiedAt,
            ...(verification.reason ? { reason: verification.reason } : {}),
          },
        }
      : {}),
  };
}

export function requestDocumentEditContext({
  targetPageId,
  targetWindowId,
}: DocumentEditContextRequest): DocumentEditContext | null {
  if (typeof window === "undefined") return null;
  const responses: DocumentEditContext[] = [];
  window.dispatchEvent(
    new CustomEvent(DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT, {
      detail: {
        targetPageId,
        targetWindowId: targetWindowId || null,
        respond(context: DocumentEditContext) {
          if (context.target_page_id !== targetPageId) return;
          if (targetWindowId && context.target_window_id !== targetWindowId)
            return;
          responses.push(context);
        },
      },
    }),
  );
  if (targetWindowId) {
    return responses[0] || null;
  }
  return responses.length === 1 ? responses[0] : null;
}

export interface DocumentLocateRequestDetail {
  targetWindowId: string;
  /** Passages to look for, most specific first; the first one found wins. */
  needles: string[];
  respond(found: boolean): void;
}

/**
 * Ask the editor in ``targetWindowId`` to scroll to the first of ``needles``
 * it contains and flash that block. True when an editor answered with a hit.
 * Editors answer synchronously, like the edit-context probe above.
 */
export function requestDocumentLocate(
  targetWindowId: string,
  needles: readonly string[],
): boolean {
  if (typeof window === "undefined") return false;
  const cleaned = needles
    .map((needle) => needle.replace(/\s+/g, " ").trim())
    .filter((needle) => needle.length > 0);
  if (!targetWindowId || cleaned.length === 0) return false;
  let found = false;
  window.dispatchEvent(
    new CustomEvent<DocumentLocateRequestDetail>(DOCUMENT_LOCATE_REQUEST_EVENT, {
      detail: {
        targetWindowId,
        needles: cleaned,
        respond(hit: boolean) {
          if (hit) found = true;
        },
      },
    }),
  );
  return found;
}
