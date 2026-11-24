"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { reloadPage } from "../../../../lib/reload-reason";
import { memo } from "react";
import { useTranslations } from "../../../../../host/next-intl";

import type { DocumentPartsState } from "../../../../lib/document-page-parts";

/**
 * A Word document held as parts (lib/document-page-parts). Read-only (the
 * server does not edit it part by part yet, or the reader may not write): the
 * read-only notice, saying the whole document is shown. Editable: nothing,
 * unless a part could not be saved (retrying) or an edit cannot be split
 * back into its parts (read-only until reloaded). A view that stopped reading
 * as the document (count-jump) says its last changes are not saved, is still
 * there to copy from, and offers the reopening that repairs it.
 */
export const DocumentPartsNotice = memo(function DocumentPartsNotice({
  state,
  writable,
  onDismissRefused,
}: {
  state: DocumentPartsState;
  writable: boolean;
  onDismissRefused?: () => void;
}) {
  const t = useTranslations("console-notebooks");
  // Not writable here is the page's access (a reader's role, or access not
  // known yet while it loads), never the document's size: the page chrome
  // says so. "Too large to edit" was shown in that wait and read as a
  
  if (!writable && !state.importing && !state.refusedText) return null;
  const message = state.blocked === "conflict"
    ? t("oversizedImport.partsConflict")
    : state.blocked === "count-jump"
      ? t("oversizedImport.partsNeedReopen")
    : state.blocked
      ? t("oversizedImport.partsBlocked")
      : state.retrying
        ? t("oversizedImport.partsRetrying")
        : state.importing === "failed"
          ? t("oversizedImport.partsImportFailed")
          : state.importing === "pending"
            ? t("oversizedImport.partsImporting")
            : null;
  const refused = state.refusedText ? (
    <div className="note-editor-parts-notice" data-testid="note-editor-parts-refused" role="status">
      {t("oversizedImport.partsRefusedText")}
      <textarea
        className="note-editor-parts-notice__text"
        readOnly
        rows={3}
        value={state.refusedText}
        data-testid="note-editor-parts-refused-text"
      />
      <button
        type="button"
        className="note-editor-parts-notice__action"
        onClick={() => void navigator.clipboard?.writeText(state.refusedText ?? "").catch(() => undefined)}
      >
        {t("oversizedImport.partsRefusedCopy")}
      </button>
      <button
        type="button"
        className="note-editor-parts-notice__action"
        data-testid="note-editor-parts-refused-dismiss"
        onClick={onDismissRefused}
      >
        {t("oversizedImport.partsRefusedDismiss")}
      </button>
    </div>
  ) : null;
  if (!message) return refused;
  return (
    <>
    {refused}
    <div
      className="note-editor-parts-notice"
      data-testid="note-editor-parts-notice"
      data-parts-blocked={state.blocked ?? undefined}
      role={state.blocked ? "alert" : "status"}
    >
      {message}
      {state.blocked === "count-jump" ? (
        <button
          type="button"
          className="note-editor-parts-notice__action"
          data-testid="note-editor-parts-reopen"
          onClick={() => reloadPage("document_parts_notice")}
        >
          {t("oversizedImport.partsReopen")}
        </button>
      ) : null}
    </div>
    </>
  );
});
