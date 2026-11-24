"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

export type PdfaExportAvailability =
  | "checking"
  | "available"
  | "unavailable"
  | "error";

interface PdfVerifiedPdfaExportDialogProps {
  readonly open: boolean;
  readonly availability: PdfaExportAvailability;
  readonly busy: boolean;
  readonly converter: string | null;
  readonly verifier: string | null;
  readonly disabledReason: string | null;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function PdfVerifiedPdfaExportDialog({
  open,
  availability,
  busy,
  converter,
  verifier,
  disabledReason,
  error,
  onCancel,
  onConfirm,
  returnFocusRef,
}: PdfVerifiedPdfaExportDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const unavailable =
    availability === "unavailable" || availability === "error";
  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.pdfaExport.title")}
      description={t("pdf.pdfaExport.description")}
      defaultActionLabel={t("pdf.pdfaExport.apply")}
      cancelActionLabel={t("pdf.pdfaExport.cancel")}
      busyActionLabel={t("pdf.pdfaExport.converting")}
      defaultActionDisabled={availability !== "available" || busy}
      busy={busy}
      initialFocus="cancel"
      onDefaultAction={onConfirm}
      onCancel={onCancel}
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-verified-pdfa-export"
      className="sm:max-w-[620px]"
    >
      <div className="grid gap-3">
        <dl className={`${parts.well} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2`}>
          <dt className="font-medium">{t("pdf.pdfaExport.standard")}</dt>
          <dd>ISO 19005-2 / PDF/A-2b</dd>
          <dt className="font-medium">{t("pdf.pdfaExport.converter")}</dt>
          <dd data-testid="pdf-verified-pdfa-export-converter">
            {converter ?? (availability === "checking" ? "…" : "—")}
          </dd>
          <dt className="font-medium">{t("pdf.pdfaExport.verifier")}</dt>
          <dd data-testid="pdf-verified-pdfa-export-verifier">
            {verifier ?? (availability === "checking" ? "…" : "—")}
          </dd>
        </dl>
        <p className={parts.hint}>{t("pdf.pdfaExport.verifierHint")}</p>
        {availability === "checking" ? (
          <p role="status" data-testid="pdf-verified-pdfa-export-checking">
            {t("pdf.pdfaExport.checkingService")}
          </p>
        ) : null}
        {unavailable && disabledReason ? (
          <p
            className={parts.message} data-tone="warning"
            role="status"
            data-testid="pdf-verified-pdfa-export-disabled-reason"
          >
            {disabledReason}
          </p>
        ) : null}
        {error ? (
          <p
            className={parts.message}
            role="alert"
            data-testid="pdf-verified-pdfa-export-error"
          >
            {error}
          </p>
        ) : null}
      </div>
    </OfficeDialogShell>
  );
}
