"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { localizePdfOutputLossText } from "../../../../lib/pdf/output-loss-text";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { PdfOutputLossReport } from "../../../../lib/pdf/save-policy";

export interface PdfOutputLossDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly lossReport: PdfOutputLossReport;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly busy?: boolean;
  readonly busyLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly container?: HTMLElement | null;
}

/**
 * PDF-local loss review over the shared Office modal interaction primitive.
 *
 * The dialog displays the exact immutable loss snapshot that the caller binds
 * into a one-shot command-consent receipt. It intentionally does not accept a
 * boolean acknowledgement or issue authority on its own.
 */
export function PdfOutputLossDialog({
  open,
  title,
  description,
  lossReport,
  confirmLabel,
  cancelLabel,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  returnFocusRef,
  container,
}: PdfOutputLossDialogProps): React.JSX.Element {
  const hasExactLosses = lossReport.entries.length > 0;
  const t = useTranslations("console-notebooks");

  return (
    <OfficeDialogShell
      open={open}
      title={title}
      description={description}
      defaultActionLabel={confirmLabel}
      cancelActionLabel={cancelLabel}
      onDefaultAction={onConfirm}
      onCancel={onCancel}
      defaultActionDisabled={!hasExactLosses}
      busy={busy}
      busyActionLabel={busyLabel}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      container={container}
      testIdPrefix="pdf-output-loss"
      className="sm:max-w-[560px]"
    >
      <div
        role="status"
        aria-live="polite"
        className={parts.message} data-tone="warning"
      >
        <p className="font-medium">
          {t("pdf.outputLoss.count", { count: lossReport.entries.length })}
        </p>
        <ul
          className="mt-2 list-disc space-y-2 pl-5"
          data-testid="pdf-output-loss-list"
        >
          {lossReport.entries.map((entry) => (
            <li key={entry.code} data-loss-code={entry.code}>
              <span className="font-medium">
                {localizePdfOutputLossText(entry.label, t)}
              </span>
              {entry.detail ? (
                <span className="mt-0.5 block text-xs opacity-80">
                  {localizePdfOutputLossText(entry.detail, t)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </OfficeDialogShell>
  );
}
