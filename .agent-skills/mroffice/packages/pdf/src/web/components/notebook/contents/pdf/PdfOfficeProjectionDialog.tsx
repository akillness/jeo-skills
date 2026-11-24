"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { Check } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { PdfEditableProjectionTarget } from "@mrnote/core/web/lib/page-export.ts";

/** The steps of a conversion as the dialog lists them, in order. */
export type PdfOfficeProjectionStep = "analyze" | "page" | "file" | "download";

/**
 * What the dialog shows: the confirmation (optionally held, saying why), a
 * running conversion, or a conversion that failed.
 */
export type PdfOfficeProjectionView =
  | {
      readonly kind: "confirm";
      /** Why the conversion cannot start now (another one is running). */
      readonly heldReason?: string | null;
    }
  | {
      readonly kind: "progress";
      readonly step: PdfOfficeProjectionStep;
      /** The server has not started the job yet. */
      readonly queued: boolean;
      readonly pagesDone: number;
      readonly pagesTotal: number | null;
      /** "Continue in background" is offered (after the first moments). */
      readonly backgroundReady: boolean;
      readonly cancelling: boolean;
    }
  | {
      readonly kind: "failed";
      readonly message: string;
      /** Why Retry cannot start a conversion now. */
      readonly retryHeldReason?: string | null;
    };

export interface PdfOfficeProjectionDialogProps {
  readonly open: boolean;
  readonly target: PdfEditableProjectionTarget;
  readonly busy: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onStart: () => void;
  /** Closes the dialog; while a conversion runs it continues in the background. */
  readonly onCancel: () => void;
  readonly view?: PdfOfficeProjectionView;
  readonly onCancelConversion?: () => void;
  readonly onContinueInBackground?: () => void;
  readonly onRetry?: () => void;
}

const TARGET_FACTS = {
  document: {
    extension: "DOCX",
    descriptionKey: "pdf.officeProjection.documentIncluded",
    lossKey: "pdf.officeProjection.documentLoss",
  },
  spreadsheet: {
    extension: "XLSX",
    descriptionKey: "pdf.officeProjection.spreadsheetIncluded",
    lossKey: "pdf.officeProjection.spreadsheetLoss",
  },
  presentation: {
    extension: "PPTX",
    descriptionKey: "pdf.officeProjection.presentationIncluded",
    lossKey: "pdf.officeProjection.presentationLoss",
  },
} as const;

export function pdfOfficeProjectionExtension(
  target: PdfEditableProjectionTarget,
): string {
  return TARGET_FACTS[target].extension;
}

const STEPS: readonly PdfOfficeProjectionStep[] = [
  "analyze",
  "page",
  "file",
  "download",
];

const CONFIRM_VIEW: PdfOfficeProjectionView = { kind: "confirm" };

export default function PdfOfficeProjectionDialog({
  open,
  target,
  busy,
  returnFocusRef,
  onStart,
  onCancel,
  view = CONFIRM_VIEW,
  onCancelConversion,
  onContinueInBackground,
  onRetry,
}: PdfOfficeProjectionDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const facts = TARGET_FACTS[target];
  const extension = facts.extension;
  const regionRef = useRef<HTMLDivElement | null>(null);

  // The button pressed to start is disabled or gone once the dialog shows
  // the conversion (and the progress region is replaced when it fails), so
  // focus moves to what the dialog now says instead of leaving the dialog.
  useEffect(() => {
    if (view.kind === "confirm") return;
    const region = regionRef.current;
    if (!region) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      active.isConnected &&
      !(active instanceof HTMLButtonElement && active.disabled) &&
      region.closest('[role="dialog"]')?.contains(active)
    ) {
      return;
    }
    region.focus({ preventScroll: true });
  }, [view.kind]);

  if (view.kind === "progress") {
    const continueInBackground = onContinueInBackground ?? onCancel;
    const activeIndex = STEPS.indexOf(view.step);
    const pagesKnown = view.pagesTotal !== null && view.pagesTotal > 0;
    const pagesDone = pagesKnown
      ? Math.min(view.pagesDone, view.pagesTotal as number)
      : view.pagesDone;
    const stepLabel = (step: PdfOfficeProjectionStep): string =>
      step === "analyze"
        ? t("pdf.officeProjection.stepAnalyze")
        : step === "page"
          ? t("pdf.officeProjection.stepCreatePage")
          : step === "file"
            ? t("pdf.officeProjection.stepCreateFile", { extension })
            : t("pdf.officeProjection.stepDownload");
    return (
      <OfficeDialogShell
        open={open}
        title={t("pdf.officeProjection.title", { extension })}
        description={t("pdf.officeProjection.progressDescription")}
        defaultActionLabel={
          view.backgroundReady
            ? t("pdf.officeProjection.continueInBackground")
            : t("pdf.officeProjection.converting")
        }
        defaultActionDisabled={!view.backgroundReady}
        defaultActionData={{
          "data-office-projection-action": view.backgroundReady
            ? "background"
            : "converting",
        }}
        cancelActionLabel={t("pdf.officeProjection.cancel")}
        showCancelAction={false}
        footerStart={
          onCancelConversion ? (
            <button
              type="button"
              className={parts.button}
              data-testid="pdf-office-projection-cancel-conversion"
              disabled={view.cancelling || view.step === "download"}
              onClick={onCancelConversion}
            >
              {view.cancelling
                ? t("pdf.officeProjection.cancellingConversion")
                : t("pdf.officeProjection.cancelConversion")}
            </button>
          ) : undefined
        }
        busy={false}
        // Escape (or a press outside) never stops the conversion: the
        // dialog steps aside and the job's result arrives as a notice.
        onDefaultAction={continueInBackground}
        onCancel={continueInBackground}
        returnFocusRef={returnFocusRef}
        testIdPrefix="pdf-office-projection"
      >
        <div
          ref={regionRef}
          tabIndex={-1}
          className={`${parts.group} outline-none`}
          role="status"
          aria-live="polite"
          aria-label={t("pdf.officeProjection.progressLabel")}
          data-testid="pdf-office-projection-progress"
          data-step={view.step}
        >
          <ol className="m-0 grid list-none gap-2 p-0">
            {STEPS.map((step, index) => {
              const state =
                index < activeIndex
                  ? "done"
                  : index === activeIndex
                    ? "active"
                    : "pending";
              const detail =
                step !== "analyze" || state !== "active"
                  ? null
                  : view.queued
                    ? t("pdf.officeProjection.queued")
                    : pagesKnown
                      ? t("pdf.officeProjection.stepAnalyzePages", {
                          done: pagesDone,
                          total: view.pagesTotal as number,
                        })
                      : null;
              return (
                <li
                  key={step}
                  className={`flex items-center justify-between gap-3${state === "pending" ? " opacity-60" : ""}`}
                  data-testid={`pdf-office-projection-step-${step}`}
                  data-step-state={state}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full${state === "active" ? " animate-pulse" : ""}`}
                      style={{
                        border:
                          "1.5px solid var(--office-dialog-accent, currentColor)",
                        background:
                          state === "active"
                            ? "var(--office-dialog-accent, currentColor)"
                            : "transparent",
                        color: "var(--office-dialog-accent, currentColor)",
                      }}
                    >
                      {state === "done" ? (
                        <Check size={10} strokeWidth={2.6} />
                      ) : null}
                    </span>
                    <span>{stepLabel(step)}</span>
                    <span className="sr-only">
                      {state === "done"
                        ? t("pdf.officeProjection.stepStateDone")
                        : state === "active"
                          ? t("pdf.officeProjection.stepStateActive")
                          : t("pdf.officeProjection.stepStatePending")}
                    </span>
                  </span>
                  {detail ? (
                    <span className="shrink-0 tabular-nums">{detail}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {view.step === "analyze" && pagesKnown && !view.queued ? (
            <progress
              className="mt-1 h-2 w-full"
              max={view.pagesTotal as number}
              value={pagesDone}
              aria-label={t("pdf.officeProjection.progressLabel")}
            />
          ) : (
            <progress
              className="mt-1 h-2 w-full"
              aria-label={t("pdf.officeProjection.progressLabel")}
            />
          )}
        </div>
      </OfficeDialogShell>
    );
  }

  if (view.kind === "failed") {
    return (
      <OfficeDialogShell
        open={open}
        title={t("pdf.officeProjection.title", { extension })}
        description={t("pdf.officeProjection.failedTitle", { extension })}
        defaultActionLabel={t("pdf.officeProjection.retry")}
        defaultActionDisabled={Boolean(view.retryHeldReason) || !onRetry}
        cancelActionLabel={t("pdf.officeProjection.close")}
        busy={busy}
        busyActionLabel={t("pdf.officeProjection.creating")}
        onDefaultAction={() => onRetry?.()}
        onCancel={onCancel}
        initialFocus="default"
        returnFocusRef={returnFocusRef}
        testIdPrefix="pdf-office-projection"
      >
        <div
          ref={regionRef}
          tabIndex={-1}
          className={`${parts.message} outline-none`}
          data-tone="error"
          role="alert"
          data-testid="pdf-office-projection-failure"
        >
          {view.message}
        </div>
        {view.retryHeldReason ? (
          <p className={`${parts.hint} m-0`} role="status">
            {view.retryHeldReason}
          </p>
        ) : null}
      </OfficeDialogShell>
    );
  }

  const heldReason = view.heldReason ?? null;
  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.officeProjection.title", { extension })}
      description={t("pdf.officeProjection.description")}
      defaultActionLabel={t("pdf.officeProjection.apply", { extension })}
      defaultActionDisabled={heldReason !== null}
      cancelActionLabel={t("pdf.officeProjection.cancel")}
      busyActionLabel={t("pdf.officeProjection.creating")}
      busy={busy}
      onDefaultAction={onStart}
      onCancel={onCancel}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-office-projection"
    >
      {heldReason ? (
        <p
          className={parts.message}
          role="status"
          data-testid="pdf-office-projection-held"
        >
          {heldReason}
        </p>
      ) : null}
      <div
        className={parts.group}
        data-testid="pdf-office-projection-included"
      >
        {t(facts.descriptionKey)}
      </div>
      <div
        className={parts.message} data-tone="warning"
        data-testid="pdf-office-projection-loss"
      >
        <strong>{t("pdf.officeProjection.lossHeading")}</strong>
        <p className="mb-0 mt-1">{t(facts.lossKey)}</p>
      </div>
      <p className={`${parts.hint} m-0`}>
        {t("pdf.officeProjection.staleHint")}
      </p>
    </OfficeDialogShell>
  );
}
