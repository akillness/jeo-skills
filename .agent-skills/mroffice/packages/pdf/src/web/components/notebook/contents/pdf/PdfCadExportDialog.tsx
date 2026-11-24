"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

export interface PdfCadExportDialogProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly pageCount: number;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onStart: () => void;
  readonly onCancel: () => void;
}

export default function PdfCadExportDialog({
  open,
  busy,
  pageCount,
  returnFocusRef,
  onStart,
  onCancel,
}: PdfCadExportDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.cadExport.title")}
      description={t("pdf.cadExport.description")}
      defaultActionLabel={t("pdf.cadExport.apply")}
      cancelActionLabel={t("pdf.cadExport.cancel")}
      busyActionLabel={t("pdf.cadExport.exporting")}
      busy={busy}
      defaultActionDisabled={!Number.isSafeInteger(pageCount) || pageCount < 1}
      onDefaultAction={onStart}
      onCancel={onCancel}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-cad-export"
    >
      <dl className={`${parts.well} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2`}>
        <dt className="font-medium">{t("pdf.cadExport.format")}</dt>
        <dd data-testid="pdf-cad-export-format">
          ASCII DXF · AutoCAD 2013 (AC1027)
        </dd>
        <dt className="font-medium">{t("pdf.cadExport.units")}</dt>
        <dd data-testid="pdf-cad-export-units">
          {t("pdf.cadExport.millimeters")}
        </dd>
        <dt className="font-medium">{t("pdf.cadExport.layers")}</dt>
        <dd data-testid="pdf-cad-export-layers">
          {t("pdf.cadExport.layersSummary", { count: pageCount })}
        </dd>
      </dl>

      <div className={`${parts.group} grid gap-2`}>
        <strong>{t("pdf.cadExport.included")}</strong>
        <p
          className={`${parts.hint} m-0`}
          data-testid="pdf-cad-export-included"
        >
          {t("pdf.cadExport.includedHint")}
        </p>
      </div>

      <div
        className={`${parts.message} grid gap-2`} data-tone="warning"
        data-testid="pdf-cad-export-excluded"
      >
        <strong>{t("pdf.cadExport.notConverted")}</strong>
        <p className="m-0">{t("pdf.cadExport.notConvertedHint")}</p>
      </div>
    </OfficeDialogShell>
  );
}
