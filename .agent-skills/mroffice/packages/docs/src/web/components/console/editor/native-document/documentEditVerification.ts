/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { EditablePagePatchback, PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";

export type DocumentEditVerificationOutcome =
  "applied_verified" | "applied_unverified";

export type DocumentEditReadBackStatus =
  "matched" | "content_mismatch" | "version_mismatch" | "unavailable";

export type DocumentEditSourcePackageStatus =
  "not_applicable" | "preserved" | "lossy" | "failed" | "skipped" | "unknown";

export interface DocumentEditVerification {
  schemaVersion: 1;
  outcome: DocumentEditVerificationOutcome;
  writeStatus: "saved";
  readBackStatus: DocumentEditReadBackStatus;
  structureStatus: "matched" | "mismatch" | "not_checked";
  /**
   * A JSON read-back is not a visual or pagination test. This remains
   * `not_run` until a DOCX/PDF renderer (and, where required, Word/WPS) has
   * actually inspected the output.
   */
  renderStatus: "not_run";
  sourceContentVersion: number | null;
  savedContentVersion: number | null;
  readBackContentVersion: number | null;
  sourcePackageStatus: DocumentEditSourcePackageStatus;
  sourcePackageLossEntryCount: number | null;
  verifiedAt: string;
  reason?: string;
}

interface VerifyDocumentEditPersistenceInput {
  pageId: string;
  expectedContent: Record<string, unknown>;
  sourceContentVersion: number | null;
  savedContentVersion: number | null;
  readBackPage: PageItem | null;
  readBackError?: unknown;
  verifiedAt?: string;
}

function validContentVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sourcePackageVerification(
  patchback: EditablePagePatchback | null | undefined,
): Pick<
  DocumentEditVerification,
  "sourcePackageStatus" | "sourcePackageLossEntryCount"
> {
  if (!patchback) {
    return {
      sourcePackageStatus: "not_applicable",
      sourcePackageLossEntryCount: null,
    };
  }
  const lossEntryCount =
    typeof patchback.loss_entry_count === "number" &&
    Number.isSafeInteger(patchback.loss_entry_count) &&
    patchback.loss_entry_count >= 0
      ? patchback.loss_entry_count
      : null;
  const status = String(patchback.status || "").toLowerCase();
  if (status === "succeeded") {
    return {
      sourcePackageStatus:
        lossEntryCount === null
          ? "unknown"
          : lossEntryCount === 0
            ? "preserved"
            : "lossy",
      sourcePackageLossEntryCount: lossEntryCount,
    };
  }
  if (status === "failed") {
    return {
      sourcePackageStatus: "failed",
      sourcePackageLossEntryCount: lossEntryCount,
    };
  }
  if (status === "skipped") {
    return {
      sourcePackageStatus: "skipped",
      sourcePackageLossEntryCount: lossEntryCount,
    };
  }
  return {
    sourcePackageStatus: "unknown",
    sourcePackageLossEntryCount: lossEntryCount,
  };
}

function unverified(
  input: VerifyDocumentEditPersistenceInput,
  readBackStatus: DocumentEditReadBackStatus,
  reason: string,
  structureStatus: DocumentEditVerification["structureStatus"] = "not_checked",
): DocumentEditVerification {
  return {
    schemaVersion: 1,
    outcome: "applied_unverified",
    writeStatus: "saved",
    readBackStatus,
    structureStatus,
    renderStatus: "not_run",
    sourceContentVersion: validContentVersion(input.sourceContentVersion)
      ? input.sourceContentVersion
      : null,
    savedContentVersion: validContentVersion(input.savedContentVersion)
      ? input.savedContentVersion
      : null,
    readBackContentVersion: validContentVersion(
      input.readBackPage?.content_version,
    )
      ? input.readBackPage.content_version
      : null,
    ...sourcePackageVerification(input.readBackPage?.editable_page_patchback),
    verifiedAt: input.verifiedAt || new Date().toISOString(),
    reason,
  };
}

/**
 * Verify one AI document edit after its CAS save.
 *
 * "Verified" is deliberately narrow: the server returned the exact saved
 * revision and the normalized document JSON is structurally identical
 * (object-key order ignored). It never implies DOCX/PDF rendering, pagination,
 * or Word/WPS fidelity.
 */
export function verifyDocumentEditPersistence(
  input: VerifyDocumentEditPersistenceInput,
): DocumentEditVerification {
  if (input.readBackError || !input.readBackPage) {
    return unverified(input, "unavailable", "read_back_unavailable");
  }
  if (input.readBackPage.id !== input.pageId) {
    return unverified(input, "unavailable", "read_back_page_mismatch");
  }
  if (
    !validContentVersion(input.sourceContentVersion) ||
    !validContentVersion(input.savedContentVersion) ||
    input.savedContentVersion <= input.sourceContentVersion
  ) {
    return unverified(input, "version_mismatch", "invalid_saved_revision");
  }
  if (
    !validContentVersion(input.readBackPage.content_version) ||
    input.readBackPage.content_version !== input.savedContentVersion
  ) {
    return unverified(input, "version_mismatch", "read_back_revision_raced");
  }
  const readBackContent = input.readBackPage.content_json;
  if (
    !readBackContent ||
    typeof readBackContent !== "object" ||
    canonicalJson(readBackContent) !== canonicalJson(input.expectedContent)
  ) {
    return unverified(
      input,
      "content_mismatch",
      "read_back_structure_mismatch",
      "mismatch",
    );
  }
  return {
    schemaVersion: 1,
    outcome: "applied_verified",
    writeStatus: "saved",
    readBackStatus: "matched",
    structureStatus: "matched",
    renderStatus: "not_run",
    sourceContentVersion: input.sourceContentVersion,
    savedContentVersion: input.savedContentVersion,
    readBackContentVersion: input.readBackPage.content_version,
    ...sourcePackageVerification(input.readBackPage.editable_page_patchback),
    verifiedAt: input.verifiedAt || new Date().toISOString(),
  };
}

export function unverifiedLocalDocumentEdit(
  verifiedAt?: string,
): DocumentEditVerification {
  return {
    schemaVersion: 1,
    outcome: "applied_unverified",
    writeStatus: "saved",
    readBackStatus: "unavailable",
    structureStatus: "not_checked",
    renderStatus: "not_run",
    sourceContentVersion: null,
    savedContentVersion: null,
    readBackContentVersion: null,
    sourcePackageStatus: "not_applicable",
    sourcePackageLossEntryCount: null,
    verifiedAt: verifiedAt || new Date().toISOString(),
    reason: "guest_local_only",
  };
}
