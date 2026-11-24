"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useKeepPopoverInsidePage } from "./useKeepPopoverInsidePage";

import {
  officeDialogClassName,
  officeDialogParts as parts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { apiGet, apiPost, isApiRequestError } from "@mrnote/core/web/lib/api.ts";
import { sanitizeOcrRuns, type PdfOcrRun } from "../../../../lib/pdf/ocr-text-layer";

// The same unnamed disclosure as the page's OCR (PdfOcrPrivacyPreflight).
import {
  OCR_EGRESS_PROVIDER_ID,
  OCR_EGRESS_REGION_ID,
  OCR_EGRESS_REGION_NAME,
} from "./PdfOcrPrivacyPreflight";

// The provider's own statements the server discloses; when the payload carries
// exactly these, the reader sees them in the UI language (the page OCR
// preflight's lines), otherwise the server's words verbatim.
const KNOWN_RETENTION_DESCRIPTION =
  "The model service states that conversation data is retained only for the shortest time necessary to provide the service; it publishes no fixed period.";
const KNOWN_TRAINING_DESCRIPTION =
  "The model service states that customer data is not used for model training without authorization.";

type JsonRecord = Record<string, unknown>;

type PdfOcrRegionPreflight = Readonly<{
  policyVersion: string;
  modelId: string;
  maxImageBytes: number;
  retentionDescription: string;
  trainingDescription: string;
}>;

type PdfOcrRegionResult = Readonly<{
  runs: readonly PdfOcrRun[];
  text: string;
}>;

export interface PdfSnapshotTextPopoverProps {
  readonly imageB64: string;
  readonly dataItemId: string;
  readonly sourceSha256: string;
  /** The editable page whose current version the server bound the source
   * to (an edited PDF); null for the upload itself. */
  readonly pageId?: string | null;
  readonly pageIndex: number;
  readonly region: readonly [number, number, number, number];
  readonly anchorBelow: boolean;
  readonly authorityIsCurrent: () => boolean;
  readonly onClose: () => void;
  /** The words read, sent on to translation (a 翻译 button once done). */
  readonly onTranslate?: (text: string) => void;
  /** WPS's 图片翻译: they go on by themselves once read. */
  readonly translateWhenDone?: boolean;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): JsonRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
    ? record
    : null;
}

function nonEmptyString(value: unknown, max = 1_000): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value.trim() === value
  );
}

export function parsePdfOcrRegionPreflight(
  raw: unknown,
  expected: Readonly<{
    dataItemId: string;
    sourceSha256: string;
    pageIndex: number;
  }>,
): PdfOcrRegionPreflight | null {
  const root = exactRecord(raw, [
    "schema",
    "ready",
    "policy_version",
    "data_item_id",
    "page_index",
    "source_sha256",
    "provider",
    "endpoint",
    "model_id",
    "request",
    "purpose",
    "storage",
    "retention",
    "training",
  ]);
  const provider = exactRecord(root?.provider, ["id", "name"]);
  const endpoint = exactRecord(root?.endpoint, [
    "host",
    "region_id",
    "region_name",
    "source_url",
    "source_checked_at",
  ]);
  const request = exactRecord(root?.request, [
    "scope",
    "image_mime_type",
    "max_image_bytes",
  ]);
  const storage = exactRecord(root?.storage, [
    "stored",
    "annotation_type",
    "description",
  ]);
  const retention = exactRecord(root?.retention, [
    "fixed_period",
    "description",
    "source_url",
    "source_effective_date",
  ]);
  const training = exactRecord(root?.training, [
    "used_for_model_training",
    "description",
    "source_url",
    "source_checked_at",
  ]);
  if (
    !root ||
    root.schema !== 1 ||
    root.ready !== true ||
    root.data_item_id !== expected.dataItemId ||
    root.page_index !== expected.pageIndex ||
    root.source_sha256 !== expected.sourceSha256 ||
    !nonEmptyString(root.policy_version, 200) ||
    !/^pdf-region-ocr-egress-v1:[0-9a-f]{64}$/.test(root.policy_version) ||
    !provider ||
    provider.id !== OCR_EGRESS_PROVIDER_ID ||
    typeof provider.name !== "string" ||
    !endpoint ||
    endpoint.host !== null ||
    endpoint.region_id !== OCR_EGRESS_REGION_ID ||
    endpoint.region_name !== OCR_EGRESS_REGION_NAME ||
    endpoint.source_url !== null ||
    endpoint.source_checked_at !== "2026-08-02" ||
    !nonEmptyString(root.model_id, 200) ||
    !request ||
    request.scope !== "selected_pdf_region" ||
    request.image_mime_type !== "image/jpeg" ||
    typeof request.max_image_bytes !== "number" ||
    !Number.isInteger(request.max_image_bytes) ||
    request.max_image_bytes <= 0 ||
    request.max_image_bytes > 32_000_000 ||
    !nonEmptyString(root.purpose) ||
    !storage ||
    storage.stored !== false ||
    storage.annotation_type !== null ||
    !nonEmptyString(storage.description) ||
    !retention ||
    retention.fixed_period !== null ||
    !nonEmptyString(retention.description) ||
    retention.source_url !== null ||
    retention.source_effective_date !== "2026-07-19" ||
    !training ||
    training.used_for_model_training !== false ||
    !nonEmptyString(training.description) ||
    training.source_url !== null ||
    training.source_checked_at !== "2026-08-02"
  ) {
    return null;
  }
  return Object.freeze({
    policyVersion: root.policy_version,
    modelId: root.model_id,
    maxImageBytes: request.max_image_bytes,
    retentionDescription: retention.description as string,
    trainingDescription: training.description as string,
  });
}

function exactRegion(
  raw: unknown,
  expected: readonly [number, number, number, number],
): boolean {
  return (
    Array.isArray(raw) &&
    raw.length === 4 &&
    raw.every(
      (value, index) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value === expected[index],
    )
  );
}

export function parsePdfOcrRegionResult(
  raw: unknown,
  expected: Readonly<{
    sourceSha256: string;
    pageIndex: number;
    region: readonly [number, number, number, number];
    policyVersion: string;
  }>,
): PdfOcrRegionResult | null {
  const root = exactRecord(raw, [
    "schema",
    "source_sha256",
    "page_index",
    "region",
    "runs",
    "text",
    "egress_policy_version",
  ]);
  if (
    !root ||
    root.schema !== 1 ||
    root.source_sha256 !== expected.sourceSha256 ||
    root.page_index !== expected.pageIndex ||
    root.egress_policy_version !== expected.policyVersion ||
    !exactRegion(root.region, expected.region) ||
    !Array.isArray(root.runs) ||
    typeof root.text !== "string"
  ) {
    return null;
  }
  for (const rawRun of root.runs) {
    const run = exactRecord(rawRun, ["text", "bbox"]);
    if (
      !run ||
      typeof run.text !== "string" ||
      !Array.isArray(run.bbox) ||
      run.bbox.length !== 4 ||
      !run.bbox.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      return null;
    }
  }
  const runs = sanitizeOcrRuns(root.runs);
  if (runs.length !== root.runs.length) return null;
  const expectedText = runs
    .map((run) => run.text)
    .join("\n")
    .trim();
  if (root.text !== expectedText) return null;
  return Object.freeze({ runs: Object.freeze(runs), text: root.text });
}

/** The server refused the capture's source: the page was saved again (or
 * the capture is of bytes it does not bind), so the capture is stale. */
function pdfOcrRegionSourceRefused(error: unknown): boolean {
  return (
    isApiRequestError(error) &&
    (error.code === "pdf_ocr_source_changed" ||
      error.code === "pdf_ocr_source_unavailable")
  );
}

type ViewState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; preflight: PdfOcrRegionPreflight }>
  | Readonly<{ status: "running"; preflight: PdfOcrRegionPreflight }>
  | Readonly<{
      status: "done";
      preflight: PdfOcrRegionPreflight;
      result: PdfOcrRegionResult;
    }>
  | Readonly<{ status: "error"; message: string }>;

export default function PdfSnapshotTextPopover({
  imageB64,
  dataItemId,
  sourceSha256,
  pageId = null,
  pageIndex,
  region,
  anchorBelow,
  authorityIsCurrent,
  onClose,
  onTranslate,
  translateWhenDone = false,
}: PdfSnapshotTextPopoverProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [state, setState] = useState<ViewState>({ status: "loading" });
  // 图片翻译: the words read are sent on once, as they arrive.
  const translatedRef = useRef(false);
  useEffect(() => {
    if (!translateWhenDone || translatedRef.current || !onTranslate) return;
    if (state.status !== "done" || !state.result.text) return;
    translatedRef.current = true;
    onTranslate(state.result.text);
  }, [onTranslate, state, translateWhenDone]);
  const popoverRef = useRef<HTMLElement | null>(null);
  // Kept on the page: shifted left from a right edge, flipped above from
  
  const placement = useKeepPopoverInsidePage(popoverRef, anchorBelow, state.status);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const resultRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    if (!authorityIsCurrent()) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: t("pdf.snapshotText.changed"),
        });
      });
      return () => controller.abort();
    }
    void apiGet<unknown>(
      `/api/v1/data-items/${encodeURIComponent(dataItemId)}/pdf-ocr-region-egress-preflight?page_index=${pageIndex}${pageId ? `&page_id=${encodeURIComponent(pageId)}` : ""}`,
      { signal: controller.signal },
    )
      .then((raw) => {
        if (controller.signal.aborted) return;
        if (!authorityIsCurrent()) {
          setState({
            status: "error",
            message: t("pdf.snapshotText.changed"),
          });
          return;
        }
        const preflight = parsePdfOcrRegionPreflight(raw, {
          dataItemId,
          sourceSha256,
          pageIndex,
        });
        setState(
          preflight
            ? { status: "ready", preflight }
            : {
                status: "error",
                message: t("pdf.snapshotText.unverified"),
              },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: pdfOcrRegionSourceRefused(error)
            ? t("pdf.snapshotText.changed")
            : t("pdf.snapshotText.detailsFailed"),
        });
      });
    return () => {
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [authorityIsCurrent, dataItemId, pageId, pageIndex, sourceSha256, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (state.status === "ready") startButtonRef.current?.focus();
    if (state.status === "done") resultRef.current?.focus();
  }, [state.status]);

  const start = useCallback(() => {
    if (state.status !== "ready" || !authorityIsCurrent()) {
      setState({
        status: "error",
        message: t("pdf.snapshotText.changed"),
      });
      return;
    }
    const preflight = state.preflight;
    const padding = imageB64.endsWith("==")
      ? 2
      : imageB64.endsWith("=")
        ? 1
        : 0;
    const imageBytes = Math.max(
      0,
      Math.floor((imageB64.length * 3) / 4) - padding,
    );
    if (imageBytes < 1 || imageBytes > preflight.maxImageBytes) {
      setState({
        status: "error",
        message: t("pdf.snapshotText.tooLarge"),
      });
      return;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setState({ status: "running", preflight });
    void apiPost<unknown>(
      `/api/v1/data-items/${encodeURIComponent(dataItemId)}/pdf-ocr-region`,
      {
        page_index: pageIndex,
        source_sha256: sourceSha256,
        ...(pageId ? { page_id: pageId } : {}),
        region: [...region],
        image_b64: imageB64,
        image_mime_type: "image/jpeg",
        egress_policy_version: preflight.policyVersion,
      },
      { signal: controller.signal },
    )
      .then((raw) => {
        if (controller.signal.aborted) return;
        if (!authorityIsCurrent()) {
          setState({
            status: "error",
            message: t("pdf.snapshotText.changed"),
          });
          return;
        }
        const result = parsePdfOcrRegionResult(raw, {
          sourceSha256,
          pageIndex,
          region,
          policyVersion: preflight.policyVersion,
        });
        setState(
          result
            ? { status: "done", preflight, result }
            : {
                status: "error",
                message: t("pdf.snapshotText.receiptMismatch"),
              },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: pdfOcrRegionSourceRefused(error)
            ? t("pdf.snapshotText.changed")
            : t("pdf.snapshotText.failed"),
        });
      });
  }, [
    authorityIsCurrent,
    dataItemId,
    imageB64,
    pageId,
    pageIndex,
    region,
    sourceSha256,
    state,
    t,
  ]);

  const copy = useCallback(async () => {
    if (state.status !== "done") return;
    try {
      await navigator.clipboard.writeText(state.result.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [state]);

  const preflight =
    state.status === "ready" ||
    state.status === "running" ||
    state.status === "done"
      ? state.preflight
      : null;
  const selectedArea = `${(region[2] * 100).toFixed(1)}% × ${(region[3] * 100).toFixed(1)}%`;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={t("pdf.snapshotText.title")}
      data-testid="pdf-snapshot-text-popover"
      className={`${officeDialogClassName({ tone: "pdf" })} office-pop-in`}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      ref={popoverRef}
      style={{
        position: "absolute",
        left: placement.shiftX,
        ...(placement.below
          ? { top: "100%", marginTop: 4 }
          : { bottom: "100%", marginBottom: 4 }),
        zIndex: 8,
        width: 336,
        maxWidth: "92vw",
        pointerEvents: "auto",
        cursor: "default",
      }}
    >
      <header className={parts.header}>
        <strong className={parts.title}>
          {t("pdf.snapshotText.title")}
        </strong>
        <button
          type="button"
          data-testid="pdf-snapshot-text-close"
          aria-label={t("pdf.snapshotText.close")}
          onClick={onClose}
          className={parts.close}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {state.status === "loading" ? (
        <p
          role="status"
          data-testid="pdf-snapshot-text-loading"
          style={{ margin: 0 }}
        >
          {t("pdf.snapshotText.checking")}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p
          role="alert"
          data-testid="pdf-snapshot-text-error"
          className={`${parts.error} m-0`}
        >
          {state.message}
        </p>
      ) : null}

      {preflight && state.status !== "done" ? (
        <div className={`${parts.hint} grid gap-1.5`}>
          <div data-testid="pdf-snapshot-text-provider">
            {t("pdf.ocrPreflight.factProviderUnnamed")} · {t("pdf.ocrPreflight.factRegionMainland")}
          </div>
          <div data-testid="pdf-snapshot-text-model">
            {t("pdf.snapshotText.model", { model: preflight.modelId })}
          </div>
          <div data-testid="pdf-snapshot-text-scope">
            {t("pdf.snapshotText.scope", { page: pageIndex + 1, area: selectedArea })}
          </div>
          <div data-testid="pdf-snapshot-text-storage">
            {t("pdf.snapshotText.storage")}
          </div>
          <div data-testid="pdf-snapshot-text-retention">
            {preflight.retentionDescription === KNOWN_RETENTION_DESCRIPTION
              ? t("pdf.ocrPreflight.retentionSummary")
              : preflight.retentionDescription}
          </div>
          <div data-testid="pdf-snapshot-text-training">
            {preflight.trainingDescription === KNOWN_TRAINING_DESCRIPTION
              ? t("pdf.ocrPreflight.trainingSummary")
              : preflight.trainingDescription}
          </div>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <button
          ref={startButtonRef}
          type="button"
          data-testid="pdf-snapshot-text-start"
          onClick={start}
          className={parts.primaryButton}
        >
          {t("pdf.snapshotText.start")}
        </button>
      ) : null}

      {state.status === "running" ? (
        <p
          role="status"
          data-testid="pdf-snapshot-text-running"
          style={{ margin: 0 }}
        >
          {t("pdf.snapshotText.running")}
        </p>
      ) : null}

      {state.status === "done" ? (
        <>
          <textarea
            ref={resultRef}
            readOnly
            aria-label={t("pdf.snapshotText.result")}
            data-testid="pdf-snapshot-text-result"
            value={state.result.text}
            placeholder={t("pdf.snapshotText.noText")}
            rows={6}
            style={{
              width: "100%",
              minHeight: 112,
              resize: "vertical",
              boxSizing: "border-box",
              lineHeight: 1.5,
            }}
          />
          <button
            type="button"
            data-testid="pdf-snapshot-text-copy"
            disabled={!state.result.text}
            onClick={copy}
            className={parts.button}
          >
            {copied
              ? t("pdf.snapshotText.copied")
              : t("pdf.snapshotText.copy")}
          </button>
          {onTranslate ? (
            null
          ) : null}
        </>
      ) : null}
    </section>
  );
}
