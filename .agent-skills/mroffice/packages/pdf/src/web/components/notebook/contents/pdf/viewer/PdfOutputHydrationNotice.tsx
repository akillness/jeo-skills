"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  AlertCircle,
  RefreshCw,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { Loader2 } from "lucide-react";
import type {
  RedactionHydrationStatus,
  VisualMaskHydrationStatus,
} from "./outputAuthority";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfOutputHydrationNoticeProps {
  dataItemId: string | undefined;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  redactionHydrationStatusForCurrentDocument: RedactionHydrationStatus;
  redactionProductCopy: { pending: string; reviewSummary: string; reviewMark: string; reviewPage: (page: number) => string; reviewMapped: (outputCount: number) => string; reviewCopyOnly: (outputCount: number) => string; reviewUnmapped: string; reviewRemove: string; removed: string; undoRemove: string; reviewBlocked: string; apply: string; applying: string; applyTitle: string; applyDescription: string; applyConfirm: string; blockedOutput: string; hydrationPending: string; hydrationFailed: string; success: string; failure: string; };
  retryRedactionHydration: () => void;
  shapesHydrationStatusForCurrentDocument: VisualMaskHydrationStatus;
  visualMaskHydrationPendingCopy: string;
  visualMaskHydrationFailedCopy: string;
  outputHydrationCompactLabel: string;
  retryVisualMaskHydration: () => void;
}

export function PdfOutputHydrationNotice({
  dataItemId,
  t,
  redactionHydrationStatusForCurrentDocument,
  redactionProductCopy,
  retryRedactionHydration,
  shapesHydrationStatusForCurrentDocument,
  visualMaskHydrationPendingCopy,
  visualMaskHydrationFailedCopy,
  outputHydrationCompactLabel,
  retryVisualMaskHydration,
}: PdfOutputHydrationNoticeProps) {
  // The re-read of the annotation lists after a write is bookkeeping the
  // reader has nothing to do about: only a read that failed is shown (with
  // its retry). Shown while pending too, the pill flashed on every shape
  
  const failed =
    shapesHydrationStatusForCurrentDocument === "failed" ||
    redactionHydrationStatusForCurrentDocument === "failed";
  return (
    dataItemId &&
    (shapesHydrationStatusForCurrentDocument !== "ready" ||
      redactionHydrationStatusForCurrentDocument !== "ready") ? (
      <div className="absolute right-3 top-[131px] z-40">
        {shapesHydrationStatusForCurrentDocument !== "ready" ? (
          <span
            className="sr-only"
            role={
              shapesHydrationStatusForCurrentDocument === "failed"
                ? "alert"
                : "status"
            }
            data-state={shapesHydrationStatusForCurrentDocument}
            data-testid="pdf-visual-mask-hydration-status"
          >
            {shapesHydrationStatusForCurrentDocument === "failed"
              ? visualMaskHydrationFailedCopy
              : visualMaskHydrationPendingCopy}
          </span>
        ) : null}
        {redactionHydrationStatusForCurrentDocument !== "ready" ? (
          <span
            className="sr-only"
            role={
              redactionHydrationStatusForCurrentDocument === "failed"
                ? "alert"
                : "status"
            }
            data-state={redactionHydrationStatusForCurrentDocument}
            data-testid="pdf-redaction-hydration-status"
          >
            {redactionHydrationStatusForCurrentDocument === "failed"
              ? redactionProductCopy.hydrationFailed
              : redactionProductCopy.hydrationPending}
          </span>
        ) : null}
        {failed ? (
        <details
          data-testid="pdf-output-hydration-details"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !event.currentTarget.open) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget
              .querySelector<HTMLElement>("summary")
              ?.focus({ preventScroll: true });
          }}
        >
          <summary
            className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-amber-300/80 bg-amber-50/95 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm backdrop-blur-sm transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-700 dark:bg-amber-950/90 dark:text-amber-100 dark:hover:bg-amber-900 [&::-webkit-details-marker]:hidden"
            data-testid="pdf-output-hydration-summary"
            aria-label={outputHydrationCompactLabel}
          >
            {shapesHydrationStatusForCurrentDocument === "failed" ||
            redactionHydrationStatusForCurrentDocument === "failed" ? (
              <AlertCircle size={16} aria-hidden="true" />
            ) : (
              <Loader2
                size={16}
                className="animate-spin"
                aria-hidden="true"
              />
            )}
            <span>{outputHydrationCompactLabel}</span>
          </summary>
          <div
            className="absolute right-0 mt-1 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-lg border border-amber-200 bg-background p-3 text-xs leading-relaxed text-foreground shadow-lg dark:border-amber-800"
            data-testid="pdf-output-hydration-status-details"
          >
            {shapesHydrationStatusForCurrentDocument !== "ready" ? (
              <div
                className={`pdf-viewer__visual-mask-hydration-status${
                  shapesHydrationStatusForCurrentDocument === "failed"
                    ? " is-failed"
                    : ""
                }`}
              >
                {shapesHydrationStatusForCurrentDocument === "failed" ? (
                  <AlertCircle size={13} aria-hidden="true" />
                ) : (
                  <Loader2
                    size={13}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                <span>
                  {shapesHydrationStatusForCurrentDocument === "failed"
                    ? visualMaskHydrationFailedCopy
                    : visualMaskHydrationPendingCopy}
                </span>
                {shapesHydrationStatusForCurrentDocument === "failed" ? (
                  <button
                    type="button"
                    className="pdf-viewer__visual-mask-hydration-retry"
                    onClick={retryVisualMaskHydration}
                    data-testid="pdf-visual-mask-hydration-retry"
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    {t("pdfViewer.retry")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {redactionHydrationStatusForCurrentDocument !== "ready" ? (
              <div
                className={`pdf-viewer__visual-mask-hydration-status${
                  redactionHydrationStatusForCurrentDocument === "failed"
                    ? " is-failed"
                    : ""
                }`}
              >
                {redactionHydrationStatusForCurrentDocument === "failed" ? (
                  <AlertCircle size={13} aria-hidden="true" />
                ) : (
                  <Loader2
                    size={13}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                <span>
                  {redactionHydrationStatusForCurrentDocument === "failed"
                    ? redactionProductCopy.hydrationFailed
                    : redactionProductCopy.hydrationPending}
                </span>
                {redactionHydrationStatusForCurrentDocument === "failed" ? (
                  <button
                    type="button"
                    className="pdf-viewer__visual-mask-hydration-retry"
                    onClick={retryRedactionHydration}
                    data-testid="pdf-redaction-hydration-retry"
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    {t("pdfViewer.retry")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
        ) : null}
      </div>
    ) : null
  );
}
