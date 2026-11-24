"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import WindowNotice from "@mrnote/core/web/components/notebook/WindowNotice.tsx";
import type { Dispatch, SetStateAction } from "react";
import { ArchiveRestore } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  getPdfSourceReplacementLossLabel,
} from "../PdfReplaceSourceDialog";
import { Loader2 } from "lucide-react";
import type { PdfSourceReplacementAudit } from "../../../../../lib/pdf/source-replacement";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfSourceReplacementAuditNoticeProps {
  pageId: string;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  workspaceWritable: boolean;
  hasWorkspaceWriteAuthority: () => boolean;
  setRestoreSourceConfirmOpen: Dispatch<SetStateAction<boolean>>;
  sourceVersionRestoring: boolean;
  sourceReplacementAudit: PdfSourceReplacementAudit | null;
  sourceReplacementVersionLabel: string;
}

export function PdfSourceReplacementAuditNotice({
  pageId,
  t,
  workspaceWritable,
  hasWorkspaceWriteAuthority,
  setRestoreSourceConfirmOpen,
  sourceVersionRestoring,
  sourceReplacementAudit,
  sourceReplacementVersionLabel,
}: PdfSourceReplacementAuditNoticeProps) {
  return (
    sourceReplacementAudit ? (
      <WindowNotice
        title={t("pdf.pageWindow.sourceReplacement")}
        label={t("pdf.pageWindow.sourceReplacement")}
        scopeKey={`${pageId}:${sourceReplacementAudit.replacement.filename}`}
      >
        <div
          className="pdf-page-window__source-replacement-status"
          aria-live="polite"
          data-testid="pdf-source-replacement-status"
          title={
            t("pdf.pageWindow.priorPdfEditsRemainPage")
          }
        >
          <ArchiveRestore size={14} aria-hidden />
          <span>
            <strong>
              {sourceReplacementAudit.previous.filename} →{" "}
              {sourceReplacementAudit.replacement.filename}
            </strong>
            {" · "}
            {sourceReplacementAudit.totalLossEntries > 0
              ? t("pdf.pageWindow.priorVersionRetainedWithLoss", { version: sourceReplacementVersionLabel, count: sourceReplacementAudit.totalLossEntries })
              : t("pdf.pageWindow.priorVersionRetained", { version: sourceReplacementVersionLabel })}
          </span>
          {sourceReplacementAudit.losses.length > 0 ? (
            <details
              className="pdf-page-window__source-replacement-loss-details"
              data-testid="pdf-source-replacement-loss-details"
            >
              <summary>
                {t("pdf.pageWindow.lossDetails", { totalLossEntries: sourceReplacementAudit.totalLossEntries })}
              </summary>
              <div
                className="pdf-page-window__source-replacement-loss-panel"
                aria-label={t("pdf.pageWindow.pdfLossManifest")}
              >
                <strong>
                  {t("pdf.pageWindow.retainedPriorVersionNotTransferred")}
                </strong>
                <ul>
                  {sourceReplacementAudit.losses.map((entry) => (
                    <li key={entry.kind}>
                      <span>
                        {getPdfSourceReplacementLossLabel(entry.kind, t)}
                      </span>
                      <strong>{entry.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
          {sourceReplacementAudit.previous.pageVersionId &&
          sourceReplacementAudit.previous.pageVersionNo != null ? (
            <button
              type="button"
              disabled={!workspaceWritable || sourceVersionRestoring}
              onClick={() => {
                if (!hasWorkspaceWriteAuthority()) return;
                setRestoreSourceConfirmOpen(true);
              }}
              data-testid="pdf-source-replacement-restore"
              data-disabled-reason={
                workspaceWritable ? undefined : "pdf.capability.readOnly"
              }
            >
              {sourceVersionRestoring ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <ArchiveRestore size={12} aria-hidden />
              )}
              {t("pdf.pageWindow.restorePriorPdf")}
            </button>
          ) : null}
        </div>
      </WindowNotice>
    ) : null
  );
}
