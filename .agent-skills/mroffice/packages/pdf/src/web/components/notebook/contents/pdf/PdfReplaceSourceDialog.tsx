"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Loader2 } from "lucide-react";
import {
  ArchiveRestore,
  FileInput,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useEffect, useRef } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import type {
  PdfSourceReplacementLossEntry,
  PdfSourceReplacementLossKind,
} from "../../../../lib/pdf/source-replacement";

export interface PdfReplaceSourceDialogProps {
  open: boolean;
  previousFilename: string;
  replacementFilename: string;
  losses: PdfSourceReplacementLossEntry[];
  totalLossEntries: number;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const LOSS_LABEL_KEYS: Record<PdfSourceReplacementLossKind, string> = {
  annotations: "pdf.replaceSource.lossAnnotations",
  "form-fields": "pdf.replaceSource.lossFormFields",
  "form-values": "pdf.replaceSource.lossFormValues",
  "page-transforms": "pdf.replaceSource.lossPageTransforms",
  "deleted-pages": "pdf.replaceSource.lossDeletedPages",
  "inserted-pages": "pdf.replaceSource.lossInsertedPages",
  "page-moves": "pdf.replaceSource.lossPageMoves",
  "text-edits": "pdf.replaceSource.lossTextEdits",
  "image-overlays": "pdf.replaceSource.lossImageOverlays",
  "ink-strokes": "pdf.replaceSource.lossInkStrokes",
  "crop-boxes": "pdf.replaceSource.lossCropBoxes",
  "sticky-notes": "pdf.replaceSource.lossStickyNotes",
  "ink-annotations": "pdf.replaceSource.lossInkAnnotations",
  signatures: "pdf.replaceSource.lossSignatures",
  redactions: "pdf.replaceSource.lossRedactions",
  "reader-annotations": "pdf.replaceSource.lossReaderAnnotations",
};

export function getPdfSourceReplacementLossLabel(
  kind: PdfSourceReplacementLossKind,
  t: (key: string) => string,
): string {
  return t(LOSS_LABEL_KEYS[kind]);
}

export default function PdfReplaceSourceDialog({
  open,
  previousFilename,
  replacementFilename,
  losses,
  totalLossEntries,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: PdfReplaceSourceDialogProps) {
  const t = useTranslations("console-notebooks");
  const confirmInFlightRef = useRef(false);
  const previousBusyRef = useRef(busy);
  const previousErrorRef = useRef(error);

  useEffect(() => {
    const failedWhileOpen =
      open &&
      Boolean(error) &&
      ((previousBusyRef.current && !busy) ||
        previousErrorRef.current !== error);
    if (!open || failedWhileOpen) confirmInFlightRef.current = false;
    previousBusyRef.current = busy;
    previousErrorRef.current = error;
  }, [busy, error, open]);

  const title = t("pdf.replaceSource.title");
  const confirm = () => {
    if (busy || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    onConfirm();
  };

  return (
    <OfficeDialogShell
      open={open}
      title={title}
      description={t("pdf.replaceSource.description")}
      defaultActionLabel={
        <span className="inline-flex items-center gap-2">
          <FileInput size={14} aria-hidden />
          {t("pdf.replaceSource.apply")}
        </span>
      }
      busyActionLabel={
        <span className="inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {t("pdf.replaceSource.replacing")}
        </span>
      }
      cancelActionLabel={t("pdf.replaceSource.cancel")}
      onDefaultAction={confirm}
      onCancel={onCancel}
      busy={busy}
      initialFocus="cancel"
      testIdPrefix="pdf-replace-source"
      defaultActionTestId="pdf-replace-source-confirm"
    >
      <style>{`
        .pdf-replace-source-dialog__files {
          align-items: center;
          background: var(--office-dialog-surface-muted, #f8fafc);
          border: 1px solid var(--office-dialog-divider, #e2e8f0);
          border-radius: 10px;
          display: grid;
          gap: 8px;
          grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr);
          padding: 11px 12px;
        }
        .pdf-replace-source-dialog__file {
          min-width: 0;
        }
        .pdf-replace-source-dialog__file strong {
          display: block;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pdf-replace-source-dialog__file span {
          color: var(--office-dialog-muted, #94a3b8);
          display: block;
          font-size: 10px;
          margin-bottom: 2px;
        }
        .pdf-replace-source-dialog__arrow {
          color: var(--office-dialog-muted, #94a3b8);
          text-align: center;
        }
        .pdf-replace-source-dialog__retained {
          align-items: flex-start;
          background: var(--console-success-soft, #ecfdf5);
          border: 1px solid var(--console-success-soft, #a7f3d0);
          border-radius: 10px;
          color: var(--console-success, #047857);
          display: flex;
          font-size: 12px;
          gap: 8px;
          line-height: 1.5;
          padding: 10px 11px;
        }
        .pdf-replace-source-dialog__losses {
          background: var(--office-dialog-warning-soft, #fff7ed);
          border: 1px solid var(--office-dialog-warning-line, #fed7aa);
          border-radius: 10px;
          padding: 11px 12px;
        }
        .pdf-replace-source-dialog__losses > strong {
          color: var(--office-dialog-warning, #9a3412);
          display: block;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .pdf-replace-source-dialog__losses ul {
          display: grid;
          gap: 5px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .pdf-replace-source-dialog__losses li {
          align-items: center;
          color: var(--office-dialog-danger, #7c2d12);
          display: flex;
          font-size: 12px;
          justify-content: space-between;
        }
        .pdf-replace-source-dialog__no-loss {
          background: var(--console-success-soft, #f0fdf4);
          border: 1px solid var(--office-dialog-accent-soft, #bbf7d0);
          border-radius: 10px;
          color: var(--console-success, #166534);
          font-size: 12px;
          padding: 10px 11px;
        }
        .pdf-replace-source-dialog__error {
          background: var(--office-dialog-danger-soft, #fef2f2);
          border: 1px solid var(--office-dialog-danger-line, #fecaca);
          border-radius: 9px;
          color: var(--office-dialog-danger, #b91c1c);
          font-size: 12px;
          line-height: 1.45;
          padding: 9px 10px;
        }
      `}</style>
      <div className="pdf-replace-source-dialog__files">
        <div className="pdf-replace-source-dialog__file">
          <span>{t("pdf.replaceSource.currentSource")}</span>
          <strong title={previousFilename}>{previousFilename}</strong>
        </div>
        <div className="pdf-replace-source-dialog__arrow">→</div>
        <div className="pdf-replace-source-dialog__file">
          <span>{t("pdf.replaceSource.replaceWith")}</span>
          <strong title={replacementFilename}>{replacementFilename}</strong>
        </div>
      </div>

      <div className="pdf-replace-source-dialog__retained">
        <ArchiveRestore size={16} aria-hidden />
        <span>{t("pdf.replaceSource.versionHint")}</span>
      </div>

      {losses.length > 0 ? (
        <div
          className="pdf-replace-source-dialog__losses"
          data-testid="pdf-replace-source-loss-list"
        >
          <strong>
            {t("pdf.replaceSource.lossHeading", { count: totalLossEntries })}
          </strong>
          <ul>
            {losses.map((entry) => (
              <li key={entry.kind}>
                <span>{getPdfSourceReplacementLossLabel(entry.kind, t)}</span>
                <strong>{entry.count}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          className="pdf-replace-source-dialog__no-loss"
          data-testid="pdf-replace-source-no-loss"
        >
          {t("pdf.replaceSource.noEdits")}
        </div>
      )}

      {error ? (
        <div
          className="pdf-replace-source-dialog__error"
          role="alert"
          data-testid="pdf-replace-source-error"
        >
          {error}
        </div>
      ) : null}
    </OfficeDialogShell>
  );
}
