/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isApiRequestError } from "@mrnote/core/web/lib/api.ts";

/** A server export failure whose message was written for the reader. */
export class ServerExportReason extends Error {}

/**
 * Why a server export failed, in the reader's words, or undefined when only
 * the generic "could not be made, try again" fits. A server's or network's
 * own sentence is never shown; the failure the reader can act on is named
 * (no connection, a busy server, no access, edits not yet in the saved PDF).
 */
export function pdfServerExportFailureReason(
  error: unknown,
  t: (key: string) => string,
): string | undefined {
  if (error instanceof ServerExportReason) return error.message;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return t("engineHost.needsConnection");
  if (error instanceof TypeError) return t("engineHost.needsConnection");
  if (!isApiRequestError(error)) return undefined;
  if (error.code === "editable_page_export_not_synced") return t("pdf.downloadEditedUnavailable");
  if (error.code === "page_version_conflict") return t("pdf.downloadWaitForSave");
  if (error.status === 401 || error.status === 403) return t("pdf.pageWindow.exportNotAllowed");
  if (error.status === 0) return t("engineHost.needsConnection");
  if (error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504) {
    return t("engineHost.busy");
  }
  return undefined;
}

/** Save-policy refusals worth telling the reader in their own words (the
 * same list the PDF reader's report explains). */
export const PDF_EXPLAINED_POLICY_REASONS = [
  "pagePackageStructureUnsupported",
  "riskySourceReadOnly",
  "riskyAdditionalSourceReadOnly",
  "riskyReplacementReadOnly",
  "readOnly",
  "documentLoading",
  "editsRequireRewrite",
] as const;
