"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { XfaVerdict } from "../../../../lib/pdf/xfa-handling";

interface PdfXfaGuardDialogProps {
  readonly open: boolean;
  readonly verdict: XfaVerdict;
  readonly onDismiss: () => void;
}

/**
 * Visible fail-closed boundary for source PDFs that contain an unclassified
 * XFA package. The viewer may continue rendering the source pages, but no form
 * mutation or derived PDF rewrite is represented as safe.
 */
export default function PdfXfaGuardDialog({
  open,
  verdict,
  onDismiss,
}: PdfXfaGuardDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const unsupported = verdict.capability === "unsupported";

  return (
    <OfficeDialogShell
      open={open}
      title={
        unsupported
          ? t("pdf.xfaGuard.titleUnsupported")
          : t("pdf.xfaGuard.titleReadOnly")
      }
      description={
        unsupported
          ? t("pdf.xfaGuard.descriptionUnsupported")
          : t("pdf.xfaGuard.descriptionReadOnly")
      }
      defaultActionLabel={
        unsupported
          ? t("pdf.xfaGuard.viewPages")
          : t("pdf.xfaGuard.continueReadOnly")
      }
      cancelActionLabel={t("pdf.xfaGuard.dismiss")}
      onDefaultAction={onDismiss}
      onCancel={onDismiss}
      initialFocus="default"
      testIdPrefix="pdf-xfa-guard"
      className="sm:max-w-[560px]"
    >
      <div
        role="status"
        data-xfa-capability={verdict.capability}
        className={parts.message} data-tone="warning"
      >
        <p className="font-medium">{t(verdict.reasonKey)}</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>{t("pdf.xfaGuard.allowedHint")}</li>
          <li>{t("pdf.xfaGuard.blockedHint")}</li>
        </ul>
      </div>
    </OfficeDialogShell>
  );
}
