"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useMemo, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { MAX_SPLIT_PAGES, pagesToLabel } from "../../../../lib/pdf/range-spec";


// service in mainland China, with what it states; no links to its pages.
export const OCR_EGRESS_PROVIDER_ID = "third-party-model-service";
export const OCR_EGRESS_REGION_ID = "cn";
export const OCR_EGRESS_REGION_NAME = "Mainland China";
const OCR_EGRESS_EXPECTED_PURPOSE =
  "Extract positioned text for selection and search.";
const OCR_EGRESS_EXPECTED_STORAGE_DESCRIPTION =
  "Recognized text and page positions are stored in this workspace.";
const OCR_EGRESS_EXPECTED_RETENTION_DESCRIPTION =
  "The model service states that conversation data is retained only for the shortest time necessary to provide the service; it publishes no fixed period.";
const OCR_EGRESS_EXPECTED_TRAINING_DESCRIPTION =
  "The model service states that customer data is not used for model training without authorization.";

type JsonRecord = Record<string, unknown>;

export interface PdfOcrEgressPreflight {
  readonly schema: 1;
  readonly ready: boolean;
  readonly policyVersion: string | null;
  readonly dataItemId: string;
  readonly pageIndex: number;
  readonly provider: Readonly<{ id: string; name: string }>;
  readonly endpoint: Readonly<{
    host: string | null;
    regionId: string | null;
    regionName: string | null;
    sourceCheckedAt: string;
  }>;
  readonly modelId: string | null;
  readonly request: Readonly<{
    scope: "current_pdf_page";
    imageMimeType: "image/jpeg";
    maxImageBytes: number | null;
  }>;
  readonly purpose: string;
  readonly storage: Readonly<{
    stored: true;
    annotationType: "pdf_ocr_text";
    description: string;
  }>;
  readonly retention: Readonly<{
    fixedPeriod: null;
    description: string;
    sourceEffectiveDate: string;
  }>;
  readonly training: Readonly<{
    usedForModelTraining: false;
    description: string;
    sourceCheckedAt: string;
  }>;
}

function recordWithExactKeys(
  value: unknown,
  keys: readonly string[],
): JsonRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    return null;
  }
  return record;
}

function nonEmptyString(value: unknown, max = 1_000): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value.trim() === value
  );
}

/**
 * Strictly adapt the server-owned policy. Unknown keys, partial facts, unsafe
 * evidence links, or a response for another item/page are never authorizable.
 */
export function parsePdfOcrEgressPreflight(
  raw: unknown,
  expected: Readonly<{ dataItemId: string; pageIndex: number }>,
): PdfOcrEgressPreflight | null {
  const root = recordWithExactKeys(raw, [
    "schema",
    "ready",
    "policy_version",
    "data_item_id",
    "page_index",
    "provider",
    "endpoint",
    "model_id",
    "request",
    "purpose",
    "storage",
    "retention",
    "training",
  ]);
  if (
    !root ||
    root.schema !== 1 ||
    typeof root.ready !== "boolean" ||
    root.data_item_id !== expected.dataItemId ||
    root.page_index !== expected.pageIndex
  ) {
    return null;
  }
  const provider = recordWithExactKeys(root.provider, ["id", "name"]);
  const endpoint = recordWithExactKeys(root.endpoint, [
    "host",
    "region_id",
    "region_name",
    "source_url",
    "source_checked_at",
  ]);
  const request = recordWithExactKeys(root.request, [
    "scope",
    "image_mime_type",
    "max_image_bytes",
  ]);
  const storage = recordWithExactKeys(root.storage, [
    "stored",
    "annotation_type",
    "description",
  ]);
  const retention = recordWithExactKeys(root.retention, [
    "fixed_period",
    "description",
    "source_url",
    "source_effective_date",
  ]);
  const training = recordWithExactKeys(root.training, [
    "used_for_model_training",
    "description",
    "source_url",
    "source_checked_at",
  ]);
  if (
    !provider ||
    provider.id !== OCR_EGRESS_PROVIDER_ID ||
    typeof provider.name !== "string" ||
    !endpoint ||
    endpoint.source_url !== null ||
    endpoint.source_checked_at !== "2026-08-02" ||
    !request ||
    request.scope !== "current_pdf_page" ||
    request.image_mime_type !== "image/jpeg" ||
    !storage ||
    storage.stored !== true ||
    storage.annotation_type !== "pdf_ocr_text" ||
    storage.description !== OCR_EGRESS_EXPECTED_STORAGE_DESCRIPTION ||
    !retention ||
    retention.fixed_period !== null ||
    retention.description !== OCR_EGRESS_EXPECTED_RETENTION_DESCRIPTION ||
    retention.source_url !== null ||
    retention.source_effective_date !== "2026-07-19" ||
    !training ||
    training.used_for_model_training !== false ||
    training.description !== OCR_EGRESS_EXPECTED_TRAINING_DESCRIPTION ||
    training.source_url !== null ||
    training.source_checked_at !== "2026-08-02" ||
    root.purpose !== OCR_EGRESS_EXPECTED_PURPOSE
  ) {
    return null;
  }

  const policyVersion = root.policy_version;
  const modelId = root.model_id;
  const maxImageBytes = request.max_image_bytes;
  if (root.ready) {
    if (
      typeof policyVersion !== "string" ||
      !/^pdf-ocr-egress-v1:[0-9a-f]{64}$/.test(policyVersion) ||
      endpoint.host !== null ||
      endpoint.region_id !== OCR_EGRESS_REGION_ID ||
      endpoint.region_name !== OCR_EGRESS_REGION_NAME ||
      !nonEmptyString(modelId, 200) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(modelId) ||
      typeof maxImageBytes !== "number" ||
      !Number.isInteger(maxImageBytes) ||
      maxImageBytes <= 0 ||
      maxImageBytes > 32_000_000
    ) {
      return null;
    }
  } else if (
    policyVersion !== null ||
    (modelId !== null && !nonEmptyString(modelId, 200)) ||
    (maxImageBytes !== null &&
      (typeof maxImageBytes !== "number" ||
        !Number.isInteger(maxImageBytes) ||
        maxImageBytes <= 0 ||
        maxImageBytes > 32_000_000)) ||
    endpoint.host !== null ||
    (endpoint.region_id !== null && endpoint.region_id !== OCR_EGRESS_REGION_ID) ||
    (endpoint.region_name !== null &&
      endpoint.region_name !== OCR_EGRESS_REGION_NAME)
  ) {
    return null;
  }

  return Object.freeze({
    schema: 1,
    ready: root.ready as boolean,
    policyVersion: policyVersion as string | null,
    dataItemId: expected.dataItemId,
    pageIndex: expected.pageIndex,
    provider: Object.freeze({
      id: provider.id as string,
      name: provider.name as string,
    }),
    endpoint: Object.freeze({
      host: endpoint.host as string | null,
      regionId: endpoint.region_id as string | null,
      regionName: endpoint.region_name as string | null,
      sourceCheckedAt: endpoint.source_checked_at as string,
    }),
    modelId: modelId as string | null,
    request: Object.freeze({
      scope: "current_pdf_page",
      imageMimeType: "image/jpeg",
      maxImageBytes: maxImageBytes as number | null,
    }),
    purpose: root.purpose as string,
    storage: Object.freeze({
      stored: true,
      annotationType: "pdf_ocr_text",
      description: storage.description as string,
    }),
    retention: Object.freeze({
      fixedPeriod: null,
      description: retention.description as string,
      sourceEffectiveDate: retention.source_effective_date as string,
    }),
    training: Object.freeze({
      usedForModelTraining: false,
      description: training.description as string,
      sourceCheckedAt: training.source_checked_at as string,
    }),
  });
}

export interface PdfOcrPrivacyPreflightProps {
  readonly open: boolean;
  readonly preflight: PdfOcrEgressPreflight;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly busy: boolean;
  readonly existingResultPageNumbers: readonly number[];
  readonly progress: PdfOcrQueueProgress | null;
  readonly onStart: (pageNumbers: readonly number[]) => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

export interface PdfOcrQueueProgress {
  readonly status: "running" | "stopping" | "failed";
  readonly pageNumbers: readonly number[];
  readonly completedCount: number;
  readonly activePageNumber: number;
}

function exactPageNumber(raw: string, pageCount: number): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= pageCount ? value : null;
}

export default function PdfOcrPrivacyPreflight({
  open,
  preflight,
  pageNumber,
  pageCount,
  busy,
  existingResultPageNumbers,
  progress,
  onStart,
  onRetry,
  onCancel,
  returnFocusRef,
}: PdfOcrPrivacyPreflightProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const maxImageBytes = preflight.request.maxImageBytes;
  const [scope, setScope] = useState<"current" | "range">("current");
  const [rangeStart, setRangeStart] = useState(String(pageNumber));
  const [rangeEnd, setRangeEnd] = useState(String(pageCount));
  const resetSeed = open
    ? `${pageNumber}:${pageCount}:${preflight.policyVersion ?? "unavailable"}`
    : null;
  const [lastResetSeed, setLastResetSeed] = useState(resetSeed);
  if (resetSeed !== lastResetSeed) {
    setLastResetSeed(resetSeed);
    if (resetSeed !== null) {
      setScope("current");
      setRangeStart(String(pageNumber));
      setRangeEnd(String(pageCount));
    }
  }

  const requestedPages = useMemo<readonly number[]>(() => {
    if (scope === "current") return Object.freeze([pageNumber]);
    const start = exactPageNumber(rangeStart, pageCount);
    const end = exactPageNumber(rangeEnd, pageCount);
    if (
      start === null ||
      end === null ||
      start > end ||
      end - start + 1 > MAX_SPLIT_PAGES
    ) {
      return Object.freeze([]);
    }
    return Object.freeze(
      Array.from({ length: end - start + 1 }, (_, index) => start + index),
    );
  }, [pageCount, pageNumber, rangeEnd, rangeStart, scope]);
  const existingResultPages = useMemo(
    () =>
      new Set(
        existingResultPageNumbers.filter(
          (candidate) =>
            Number.isSafeInteger(candidate) &&
            candidate >= 1 &&
            candidate <= pageCount,
        ),
      ),
    [existingResultPageNumbers, pageCount],
  );
  const selectedPages = useMemo(
    () =>
      Object.freeze(
        requestedPages.filter(
          (candidate) => !existingResultPages.has(candidate),
        ),
      ),
    [existingResultPages, requestedPages],
  );
  const skippedPageCount = requestedPages.length - selectedPages.length;
  const disclosedPages = progress?.pageNumbers ?? selectedPages;
  const firstDisclosedPage = disclosedPages[0] ?? null;
  const operationRunning =
    busy || progress?.status === "running" || progress?.status === "stopping";
  const retryable = progress?.status === "failed" && !busy;
  const selectionLocked = progress !== null || busy;
  const invalidRange = scope === "range" && requestedPages.length === 0;
  const noPagesToRecognize =
    requestedPages.length > 0 && selectedPages.length === 0;
  const idleNoPagesToRecognize = progress === null && noPagesToRecognize;
  const defaultActionLabel = retryable
    ? t("pdf.ocrPreflight.retry")
    : operationRunning
      ? progress?.status === "stopping"
        ? t("pdf.ocrPreflight.stopping")
        : t("pdf.ocrPreflight.recognizingPage", {
            page: progress?.activePageNumber ?? pageNumber,
          })
      : selectedPages.length > 1
        ? t("pdf.ocrPreflight.startPages", { count: selectedPages.length })
        : t("pdf.ocrPreflight.start");
  const dialogDescription = idleNoPagesToRecognize
    ? t("pdf.ocrPreflight.alreadyRecognized")
    : !preflight.ready
      ? t("pdf.ocrPreflight.policyUnavailable")
      : disclosedPages.length > 1
        ? t("pdf.ocrPreflight.sendsPages", { count: disclosedPages.length })
        : t("pdf.ocrPreflight.sendsOnePage");
  const pageDisclosure =
    disclosedPages.length === 0
      ? t("pdf.ocrPreflight.noPagesSelected")
      : disclosedPages.length === 1
        ? t("pdf.ocrPreflight.pageCurrentOf", {
            page: firstDisclosedPage ?? pageNumber,
            total: pageCount,
          })
        : t("pdf.ocrPreflight.pageRangeOf", {
            pages: pagesToLabel([...disclosedPages]),
            total: pageCount,
            count: disclosedPages.length,
          });
  const dataDisclosure =
    disclosedPages.length === 0
      ? t("pdf.ocrPreflight.dataNone")
      : disclosedPages.length === 1
        ? maxImageBytes
          ? t("pdf.ocrPreflight.dataOneLimited", { bytes: maxImageBytes })
          : t("pdf.ocrPreflight.dataOne")
        : maxImageBytes
          ? t("pdf.ocrPreflight.dataManyLimited", {
              count: disclosedPages.length,
              bytes: maxImageBytes,
            })
          : t("pdf.ocrPreflight.dataMany", { count: disclosedPages.length });
  // A ready preflight's English copy is checked word for word against these
  // summaries (parsePdfOcrEgressPreflight), so the catalogue can carry them.
  const purposeSummary = t("pdf.ocrPreflight.purposeSummary");
  const storageSummary = t("pdf.ocrPreflight.storageSummary");
  const retentionSummary = t("pdf.ocrPreflight.retentionSummary");
  const trainingSummary = t("pdf.ocrPreflight.trainingSummary");

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.ocrPreflight.title")}
      description={dialogDescription}
      defaultActionLabel={defaultActionLabel}
      cancelActionLabel={
        operationRunning
          ? t("pdf.ocrPreflight.stopAfterCurrent")
          : t("pdf.ocrPreflight.cancel")
      }
      busy={false}
      defaultActionDisabled={
        operationRunning ||
        (!retryable &&
          (!preflight.ready ||
            !preflight.policyVersion ||
            invalidRange ||
            idleNoPagesToRecognize))
      }
      onDefaultAction={() => {
        if (retryable) onRetry();
        else onStart(selectedPages);
      }}
      onCancel={onCancel}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-ocr-privacy"
      className="sm:max-w-[600px]"
    >
      <fieldset
        className={parts.group}
        disabled={selectionLocked}
        data-testid="pdf-ocr-privacy-scope"
      >
        <legend className={parts.sectionTitle}>
          {t("pdf.ocrPreflight.pagesToRecognize")}
        </legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
            <span className="relative size-11 shrink-0">
              <input
                type="radio"
                name="pdf-ocr-scope"
                value="current"
                checked={scope === "current"}
                className={`${parts.markInput} absolute inset-0 size-11 cursor-pointer`}
                data-testid="pdf-ocr-scope-current"
                onChange={() => setScope("current")}
              />
              <span
                aria-hidden
                data-testid="pdf-ocr-scope-current-visual"
                className={`${parts.mark} pointer-events-none absolute left-1/2 top-1/2 inline-flex size-[13px] -translate-x-1/2 -translate-y-1/2 items-center justify-center`} data-shape="radio"
              />
            </span>
            {t("pdf.ocrPreflight.scopeCurrent")}
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
            <span className="relative size-11 shrink-0">
              <input
                type="radio"
                name="pdf-ocr-scope"
                value="range"
                checked={scope === "range"}
                className={`${parts.markInput} absolute inset-0 size-11 cursor-pointer`}
                data-testid="pdf-ocr-scope-range"
                onChange={() => setScope("range")}
              />
              <span
                aria-hidden
                data-testid="pdf-ocr-scope-range-visual"
                className={`${parts.mark} pointer-events-none absolute left-1/2 top-1/2 inline-flex size-[13px] -translate-x-1/2 -translate-y-1/2 items-center justify-center`} data-shape="radio"
              />
            </span>
            {t("pdf.ocrPreflight.scopeRange")}
          </label>
        </div>
        {scope === "range" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="inline-flex items-center gap-2">
              {t("pdf.ocrPreflight.rangeFrom")}
              <input
                type="number"
                min={1}
                max={pageCount}
                step={1}
                inputMode="numeric"
                value={rangeStart}
                aria-label={t("pdf.ocrPreflight.rangeStartLabel")}
                className="w-24"
                onChange={(event) => setRangeStart(event.currentTarget.value)}
              />
            </label>
            <label className="inline-flex items-center gap-2">
              {t("pdf.ocrPreflight.rangeTo")}
              <input
                type="number"
                min={1}
                max={pageCount}
                step={1}
                inputMode="numeric"
                value={rangeEnd}
                aria-label={t("pdf.ocrPreflight.rangeEndLabel")}
                className="w-24"
                onChange={(event) => setRangeEnd(event.currentTarget.value)}
              />
            </label>
            <span className={parts.hint}>
              {t("pdf.ocrPreflight.rangeOf", { total: pageCount })}
            </span>
          </div>
        ) : null}
        {invalidRange ? (
          <p className={`${parts.error} mt-2`} role="alert">
            {t("pdf.ocrPreflight.rangeInvalid", {
              total: pageCount,
              max: MAX_SPLIT_PAGES,
            })}
          </p>
        ) : null}
        {idleNoPagesToRecognize ? (
          <p className={`${parts.hint} mt-2`} role="status">
            {t("pdf.ocrPreflight.allAlreadyRecognized")}
          </p>
        ) : skippedPageCount > 0 && progress === null ? (
          <p className={`${parts.hint} mt-2`}>
            {t("pdf.ocrPreflight.someAlreadyRecognized", {
              count: skippedPageCount,
            })}
          </p>
        ) : null}
      </fieldset>

      {progress ? (
        <div
          className={parts.group}
          role="status"
          aria-live="polite"
          data-testid="pdf-ocr-queue-progress"
        >
          <div className="flex items-center justify-between gap-3">
            <span>
              {progress.status === "failed"
                ? t("pdf.ocrPreflight.stoppedOnPage", {
                    page: progress.activePageNumber,
                  })
                : progress.status === "stopping"
                  ? t("pdf.ocrPreflight.stoppingAfterPage", {
                      page: progress.activePageNumber,
                    })
                  : t("pdf.ocrPreflight.recognizingPage", {
                      page: progress.activePageNumber,
                    })}
            </span>
            <span className="shrink-0 tabular-nums">
              {t("pdf.ocrPreflight.progressSummary", {
                completed: progress.completedCount,
                total: progress.pageNumbers.length,
              })}
            </span>
          </div>
          <progress
            className="mt-2 h-2 w-full"
            max={progress.pageNumbers.length}
            value={progress.completedCount}
            aria-label={t("pdf.ocrPreflight.progressLabel")}
          />
          {progress.status === "failed" ? (
            <p className={`${parts.hint} mt-2`}>
              {t("pdf.ocrPreflight.retryHint")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={parts.message} data-tone="warning">
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-2">
          <dt className="font-medium">{t("pdf.ocrPreflight.factProvider")}</dt>
          <dd data-testid="pdf-ocr-privacy-provider">
            {t("pdf.ocrPreflight.factProviderUnnamed")}
          </dd>

          <dt className="font-medium">{t("pdf.ocrPreflight.factRegion")}</dt>
          <dd data-testid="pdf-ocr-privacy-region">
            {preflight.endpoint.regionId
              ? t("pdf.ocrPreflight.factRegionMainland")
              : t("pdf.ocrPreflight.factUnavailable")}
          </dd>

          <dt className="font-medium">{t("pdf.ocrPreflight.factModel")}</dt>
          <dd data-testid="pdf-ocr-privacy-model">
            {preflight.modelId ?? t("pdf.ocrPreflight.factUnavailable")}
          </dd>

          <dt className="font-medium">{t("pdf.ocrPreflight.factPage")}</dt>
          <dd data-testid="pdf-ocr-privacy-page">{pageDisclosure}</dd>

          <dt className="font-medium">{t("pdf.ocrPreflight.factDataSent")}</dt>
          <dd data-testid="pdf-ocr-privacy-request">{dataDisclosure}</dd>

          <dt className="font-medium">{t("pdf.ocrPreflight.factPurpose")}</dt>
          <dd data-testid="pdf-ocr-privacy-purpose">{purposeSummary}</dd>

          <dt className="font-medium">
            {t("pdf.ocrPreflight.factStoredResult")}
          </dt>
          <dd data-testid="pdf-ocr-privacy-storage">{storageSummary}</dd>

          <dt className="font-medium">{t("pdf.ocrPreflight.factRetention")}</dt>
          <dd data-testid="pdf-ocr-privacy-retention">
            {retentionSummary}
          </dd>

          <dt className="font-medium">{t("pdf.ocrPreflight.factTraining")}</dt>
          <dd data-testid="pdf-ocr-privacy-training">
            {trainingSummary}
          </dd>
        </dl>
      </div>
    </OfficeDialogShell>
  );
}
