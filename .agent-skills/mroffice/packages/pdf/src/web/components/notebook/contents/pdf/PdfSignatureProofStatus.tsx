"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Loader2 } from "lucide-react";
import {
  AlertCircle,
  Download,
  Info,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import type { PdfSignatureProofPresentation } from "../../../../lib/pdf/signature-proof";

interface PdfSignatureProofStatusProps {
  loading: boolean;
  presentation: PdfSignatureProofPresentation;
  downloadOriginalEnabled: boolean;
  downloadOriginalReason?: string;
  downloadOriginalReasonKey?: string;
  downloadOriginalDisposition?: string;
  downloadOriginalCapabilityId: string;
  onDownloadOriginal: () => void;
  /** A second mounted copy (the reader indicator's panel) needs its own ids. */
  testIdPrefix?: string;
  /** Office's Signatures pane lists each signature without another click. */
  detailsDefaultOpen?: boolean;
}

export default function PdfSignatureProofStatus({
  loading,
  presentation,
  downloadOriginalEnabled,
  downloadOriginalReason,
  downloadOriginalReasonKey,
  downloadOriginalDisposition,
  downloadOriginalCapabilityId,
  onDownloadOriginal,
  testIdPrefix = "pdf-signature-proof",
  detailsDefaultOpen = false,
}: PdfSignatureProofStatusProps) {
  const integrity = loading ? "unknown" : presentation.integrity;
  const headline = loading
    ? presentation.loadingHeadline
    : presentation.headline;
  const detail = loading ? presentation.loadingDetail : presentation.detail;
  const downloadTitle = downloadOriginalEnabled
    ? presentation.downloadOriginalLabel
    : (downloadOriginalReason ??
      presentation.downloadOriginalUnavailableLabel);

  return (
    <aside
      className={`pdf-viewer__signature-proof pdf-viewer__signature-proof--${integrity}`}
      aria-label={headline}
      data-testid={`${testIdPrefix}-status`}
      data-signature-integrity={integrity}
    >
      <div
        className="pdf-viewer__signature-proof-summary"
        role="status"
        aria-live="polite"
      >
        {loading ? (
          <Loader2
            size={15}
            className="pdf-viewer__signature-proof-icon animate-spin"
            aria-hidden="true"
          />
        ) : integrity === "mismatch" ? (
          <AlertCircle
            size={15}
            className="pdf-viewer__signature-proof-icon"
            aria-hidden="true"
          />
        ) : (
          <Info
            size={15}
            className="pdf-viewer__signature-proof-icon"
            aria-hidden="true"
          />
        )}
        <span className="pdf-viewer__signature-proof-copy">
          <strong>{headline}</strong>
          <span>{detail}</span>
          <span>{presentation.unknownAxes}</span>
        </span>
      </div>

      <details
        className="pdf-viewer__signature-proof-details"
        data-testid={`${testIdPrefix}-details`}
        open={detailsDefaultOpen || undefined}
      >
        <summary
          className="inline-flex min-h-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          data-testid={`${testIdPrefix}-details-toggle`}
        >
          {presentation.detailsLabel}
        </summary>
        <div className="pdf-viewer__signature-proof-details-panel">
          {presentation.verificationTime ? (
            <dl className="pdf-viewer__signature-proof-fact">
              <dt>{presentation.verificationTimeLabel}</dt>
              <dd>
                <time dateTime={presentation.verificationTime}>
                  {presentation.verificationTime}
                </time>
              </dd>
            </dl>
          ) : null}

          {presentation.signatures.length > 0 ? (
            <ol className="pdf-viewer__signature-proof-signatures">
              {presentation.signatures.map((signature) => (
                <li key={signature.label} data-integrity={signature.integrity}>
                  <strong>{signature.label}</strong>
                  <span>{signature.integrityLabel}</span>
                  <span>{signature.coverageLabel}</span>
                </li>
              ))}
            </ol>
          ) : null}

          <p className="pdf-viewer__signature-proof-reason">
            {presentation.reasonLabel}
          </p>

          <dl className="pdf-viewer__signature-proof-axes">
            {presentation.axes.map((axis) => (
              <div key={axis.key}>
                <dt>{axis.label}</dt>
                <dd data-axis-state={axis.value}>{axis.valueLabel}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            className="pdf-viewer__signature-proof-download min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            data-testid={`${testIdPrefix}-download-original`}
            data-capability-id={downloadOriginalCapabilityId}
            data-output-disposition={downloadOriginalDisposition}
            data-disabled-reason={downloadOriginalReasonKey}
            disabled={!downloadOriginalEnabled}
            title={downloadTitle}
            onClick={onDownloadOriginal}
          >
            <Download size={13} aria-hidden="true" />
            <span>{presentation.downloadOriginalLabel}</span>
          </button>
        </div>
      </details>
    </aside>
  );
}
