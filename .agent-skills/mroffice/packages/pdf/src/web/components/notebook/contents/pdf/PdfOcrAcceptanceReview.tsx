"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useEffect, useMemo, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type {
  PdfOcrReviewAnnotation,
  PdfOcrReviewRun,
} from "../../../../lib/pdf/ocr-acceptance";

interface ReviewLine {
  readonly bbox: readonly [number, number, number, number];
  decision: "include" | "exclude" | null;
  text: string;
}

export interface PdfOcrAcceptanceReviewProps {
  readonly open: boolean;
  readonly annotation: PdfOcrReviewAnnotation;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onAccept: (runs: readonly PdfOcrReviewRun[]) => void;
  readonly onReject: () => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

function reviewLines(annotation: PdfOcrReviewAnnotation): ReviewLine[] {
  return annotation.runs.map((run) => ({
    bbox: run.bbox,
    decision: null,
    text: run.text,
  }));
}

export default function PdfOcrAcceptanceReview({
  open,
  annotation,
  busy,
  error,
  onAccept,
  onReject,
  onCancel,
  returnFocusRef,
}: PdfOcrAcceptanceReviewProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [lines, setLines] = useState<ReviewLine[]>(() =>
    reviewLines(annotation),
  );

  useEffect(() => {
    setLines(reviewLines(annotation));
  }, [annotation]);

  const acceptedRuns = useMemo<readonly PdfOcrReviewRun[]>(
    () =>
      lines
        .filter((line) => line.decision === "include" && line.text.trim())
        .map((line) => ({
          text: line.text.trim().slice(0, 1_000),
          bbox: line.bbox,
        })),
    [lines],
  );
  const hasUndecidedLine = lines.some((line) => line.decision === null);
  const hasInvalidIncludedLine = lines.some(
    (line) => line.decision === "include" && !line.text.trim(),
  );

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.ocrReview.title", { page: annotation.pageIndex + 1 })}
      description={t("pdf.ocrReview.noConfidenceHint")}
      defaultActionLabel={t("pdf.ocrReview.accept")}
      cancelActionLabel={t("pdf.ocrReview.cancel")}
      busyActionLabel={t("pdf.ocrReview.saving")}
      busy={busy}
      defaultActionDisabled={
        hasUndecidedLine || acceptedRuns.length === 0 || hasInvalidIncludedLine
      }
      onDefaultAction={() => onAccept(acceptedRuns)}
      onCancel={onCancel}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-ocr-review"
      className="sm:max-w-[680px]"
    >
      <div
        className="max-h-[50vh] space-y-2 overflow-y-auto rounded-md border p-3"
        data-testid="pdf-ocr-review-lines"
      >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("pdf.ocrReview.noLines")}
          </p>
        ) : (
          lines.map((line, index) => (
            <div
              key={`${annotation.id}:${index}`}
              className="grid grid-cols-[auto_1fr] items-center gap-3 text-sm"
            >
              <div
                role="radiogroup"
                className="flex flex-col gap-1"
                aria-label={t("pdf.ocrReview.lineDecision", {
                  line: index + 1,
                })}
              >
                <label className="flex min-h-11 items-center gap-1.5">
                  <span className="relative size-11 shrink-0">
                    <input
                      type="radio"
                      name={`ocr-review-${annotation.id}-${index}`}
                      checked={line.decision === "include"}
                      disabled={busy}
                      aria-label={t("pdf.ocrReview.includeLine", {
                        line: index + 1,
                      })}
                      className="peer absolute inset-0 size-11 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      onChange={() => {
                        setLines((current) =>
                          current.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, decision: "include" }
                              : candidate,
                          ),
                        );
                      }}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-3.5 top-3.5 inline-flex size-4 items-center justify-center rounded-full border border-input bg-background peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
                    >
                      {line.decision === "include" ? (
                        <span className="size-2 rounded-full bg-primary" />
                      ) : null}
                    </span>
                  </span>
                  {t("pdf.ocrReview.include")}
                </label>
                <label className="flex min-h-11 items-center gap-1.5">
                  <span className="relative size-11 shrink-0">
                    <input
                      type="radio"
                      name={`ocr-review-${annotation.id}-${index}`}
                      checked={line.decision === "exclude"}
                      disabled={busy}
                      aria-label={t("pdf.ocrReview.excludeLine", {
                        line: index + 1,
                      })}
                      className="peer absolute inset-0 size-11 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      onChange={() => {
                        setLines((current) =>
                          current.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, decision: "exclude" }
                              : candidate,
                          ),
                        );
                      }}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-3.5 top-3.5 inline-flex size-4 items-center justify-center rounded-full border border-input bg-background peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
                    >
                      {line.decision === "exclude" ? (
                        <span className="size-2 rounded-full bg-primary" />
                      ) : null}
                    </span>
                  </span>
                  {t("pdf.ocrReview.exclude")}
                </label>
              </div>
              <input
                type="text"
                value={line.text}
                maxLength={1_000}
                disabled={busy || line.decision !== "include"}
                aria-label={t("pdf.ocrReview.lineLabel", { line: index + 1 })}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setLines((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, text }
                        : candidate,
                    ),
                  );
                }}
              />
            </div>
          ))
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 text-sm text-destructive"
          data-testid="pdf-ocr-review-error"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("pdf.ocrReview.cancelHint")}
        </p>
        <button
          type="button"
          disabled={busy}
          className={`${parts.button} shrink-0`}
          data-testid="pdf-ocr-review-reject"
          onClick={onReject}
        >
          {t("pdf.ocrReview.reject")}
        </button>
      </div>
    </OfficeDialogShell>
  );
}
