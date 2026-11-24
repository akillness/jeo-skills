"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  Maximize2,
  Move,
  Ruler,
  ShieldCheck,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useOpenedOnce } from "@mrnote/core/web/lib/use-opened-once.ts";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { OFFICE_PAGE_ORIENTATION_ICON_IDS } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";
import {
  PDF_PAGE_SIZE_MAX_POINTS,
  PDF_PAGE_SIZE_MIN_POINTS,
  PDF_PAGE_SIZE_PRESETS,
  isPdfPageSizeDimension,
  pageSizePresetForDimensions,
  pdfPageSizeOrientationOf,
  pdfPointsToMillimetres,
  resolvePdfPageSizeTarget,
  type PdfPageContentPlacement,
  type PdfPageSizeDimensions,
  type PdfPageSizeOrientation,
  type PdfPageSizePreset,
  type PdfPageSizeScope,
  type PdfPageSizeSelection,
} from "../../../../lib/pdf/page-size";
import { validateRangeSpec } from "../../../../lib/pdf/range-spec";

function millimetreInput(points: number): string {
  return (Math.round(pdfPointsToMillimetres(points) * 10) / 10).toString();
}

function dimensionLabel(
  size: PdfPageSizeDimensions | null,
  unavailable: string,
): string {
  if (!size) return unavailable;
  const width = Math.round(pdfPointsToMillimetres(size.width) * 10) / 10;
  const height = Math.round(pdfPointsToMillimetres(size.height) * 10) / 10;
  return `${width} × ${height} mm`;
}

function PreviewPage({
  label,
  size,
  emptyLabel,
  testId,
}: {
  label: string;
  size: PdfPageSizeDimensions | null;
  emptyLabel: string;
  testId: string;
}) {
  const landscape = Boolean(size && size.width > size.height);
  return (
    <div className="grid min-w-0 gap-2 text-center" data-testid={testId}>
      <span className={parts.label}>{label}</span>
      <div className="office-dialog__well flex h-32 items-center justify-center p-3">
        {size ? (
          <div
            className="max-h-full max-w-full rounded-[3px] border border-slate-300 shadow-sm"
            // A sheet of paper keeps its printed look in either theme.
            data-chrome-preview=""
            style={{
              // A sheet of paper: white in either theme.
              background: "#ffffff",
              aspectRatio: `${size.width} / ${size.height}`,
              height: landscape ? "auto" : "100%",
              width: landscape ? "100%" : "auto",
            }}
            aria-hidden="true"
          />
        ) : (
          <span className={parts.hint}>{emptyLabel}</span>
        )}
      </div>
      <span className={`${parts.hint} truncate`}>
        {dimensionLabel(size, emptyLabel)}
      </span>
    </div>
  );
}

export interface PdfPageSizeDialogProps {
  open: boolean;
  currentPage: number;
  pageCount: number;
  sourceSize: PdfPageSizeDimensions | null;
  originalSize?: PdfPageSizeDimensions | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: (selection: PdfPageSizeSelection) => boolean | Promise<boolean>;
  onCancel: () => void;
}

export default function PdfPageSizeDialog(props: PdfPageSizeDialogProps) {
  if (!useOpenedOnce(props.open)) return null;
  return <PdfPageSizeDialogBody {...props} />;
}

function PdfPageSizeDialogBody({
  open,
  currentPage,
  pageCount,
  sourceSize,
  originalSize,
  returnFocusRef,
  onConfirm,
  onCancel,
}: PdfPageSizeDialogProps) {
  const commonT = useTranslations("common");
  const t = useTranslations("console-notebooks");
  const presetRef = useRef<HTMLSelectElement>(null);
  const fallbackReturnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const [preset, setPreset] = useState<PdfPageSizePreset>("original");
  const [orientation, setOrientation] =
    useState<PdfPageSizeOrientation>("portrait");
  const [contentPlacement, setContentPlacement] =
    useState<PdfPageContentPlacement>("unchanged");
  const [scope, setScope] = useState<PdfPageSizeScope>("page");
  const [rangeSpec, setRangeSpec] = useState(String(currentPage));
  const [customWidthMm, setCustomWidthMm] = useState("210");
  const [customHeightMm, setCustomHeightMm] = useState("297");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const sourceWidth = sourceSize?.width ?? null;
  const sourceHeight = sourceSize?.height ?? null;
  const effectiveOriginalSize = originalSize ?? sourceSize;

  if (open && returnFocusRef === undefined && typeof document !== "undefined") {
    const activeElement = document.activeElement;
    fallbackReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : document.querySelector<HTMLElement>(
            '[data-control-id="PDFCTL.RIBBON.PAGE.PAGE_SIZE"]',
          );
  }

  useEffect(() => {
    if (!open) return;
    submittingRef.current = false;
    setPreset("original");
    setOrientation(
      sourceWidth !== null &&
        sourceHeight !== null &&
        sourceWidth > sourceHeight
        ? "landscape"
        : "portrait",
    );
    setContentPlacement("unchanged");
    setScope("page");
    setRangeSpec(String(Math.max(1, currentPage)));
    if (sourceWidth !== null && sourceHeight !== null) {
      setCustomWidthMm(millimetreInput(sourceWidth));
      setCustomHeightMm(millimetreInput(sourceHeight));
    }
    setSubmitting(false);
    setSubmitError(null);
  }, [currentPage, open, sourceHeight, sourceWidth]);

  const targetSize = useMemo(
    () =>
      resolvePdfPageSizeTarget({
        preset,
        orientation,
        customWidthMm,
        customHeightMm,
        sourceSize: effectiveOriginalSize,
      }),
    [customHeightMm, customWidthMm, effectiveOriginalSize, orientation, preset],
  );
  const rangePages = useMemo(
    () =>
      scope === "range"
        ? validateRangeSpec(rangeSpec, Math.max(1, pageCount)).pages
        : [],
    [pageCount, rangeSpec, scope],
  );
  const rangeValid = scope !== "range" || rangePages.length > 0;
  const geometryValid =
    preset === "original"
      ? effectiveOriginalSize !== null
      : Boolean(
          targetSize &&
          isPdfPageSizeDimension(targetSize.width) &&
          isPdfPageSizeDimension(targetSize.height),
        );
  const valid = geometryValid && rangeValid && pageCount > 0;
  // The size "Original" restores, which is not the page's current size once
  // it has been resized: naming the current size here labelled the option
  
  const sourcePreset = pageSizePresetForDimensions(effectiveOriginalSize);
  const sourceLabel = sourcePreset
    ? PDF_PAGE_SIZE_PRESETS[sourcePreset].label
    : t("pdf.pageSize.customSize");
  const targetLabel =
    preset === "original"
      ? t("pdf.pageSize.restoreOriginal")
      : preset === "custom"
        ? t("pdf.pageSize.customSize")
        : PDF_PAGE_SIZE_PRESETS[preset].label;

  // Custom width and height are literal (Word's Page Setup semantics):
  // typing a wider-than-tall size selects landscape, and switching the
  // orientation swaps the two fields, so the labels never contradict the
  // target preview.
  const syncCustomOrientation = useCallback(
    (widthMm: string, heightMm: string) => {
      const width = Number.parseFloat(widthMm);
      const height = Number.parseFloat(heightMm);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      if (width === height) return;
      setOrientation(width > height ? "landscape" : "portrait");
    },
    [],
  );
  const chooseOrientation = useCallback(
    (value: PdfPageSizeOrientation) => {
      setOrientation(value);
      if (preset !== "custom") return;
      const width = Number.parseFloat(customWidthMm);
      const height = Number.parseFloat(customHeightMm);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      const landscape = width > height;
      if (width !== height && landscape !== (value === "landscape")) {
        setCustomWidthMm(customHeightMm);
        setCustomHeightMm(customWidthMm);
      }
    },
    [customHeightMm, customWidthMm, preset],
  );

  const close = useCallback(() => {
    if (submittingRef.current) return;
    setSubmitError(null);
    onCancel();
  }, [onCancel]);

  const submit = useCallback(async () => {
    if (submittingRef.current || !valid || !targetSize) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const succeeded = await onConfirm({
        scope,
        rangeSpec: scope === "range" ? rangeSpec : "",
        width: preset === "original" ? null : targetSize.width,
        height: preset === "original" ? null : targetSize.height,
        contentPlacement:
          preset === "original" ? "unchanged" : contentPlacement,
      });
      if (succeeded) {
        onCancel();
      } else {
        setSubmitError(t("pdf.pageSize.applyFailed"));
      }
    } catch {
      setSubmitError(t("pdf.pageSize.applyFailed"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    contentPlacement,
    onCancel,
    onConfirm,
    preset,
    rangeSpec,
    scope,
    t,
    targetSize,
    valid,
  ]);

  const selectionSummary =
    scope === "all"
      ? t("pdf.pageSize.summaryAll", { count: pageCount })
      : scope === "range"
        ? t("pdf.pageSize.summaryRange", {
            count: rangePages.length,
            range: rangeSpec,
          })
        : t("pdf.pageSize.summaryCurrent", { page: currentPage });

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.pageSize.title")}
      description={t("pdf.pageSize.description")}
      defaultActionLabel={t("pdf.pageSize.apply")}
      busyActionLabel={t("pdf.pageSize.applying")}
      cancelActionLabel={commonT("button.cancel")}
      onDefaultAction={() => void submit()}
      onCancel={close}
      defaultActionDisabled={!valid}
      busy={submitting}
      initialFocusRef={presetRef}
      returnFocusRef={returnFocusRef ?? fallbackReturnFocusRef}
      className="max-w-[680px]"
      testIdPrefix="pdf-page-size"
      defaultActionTestId="pdf-page-size-apply"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_228px]">
        <div className="grid gap-4">
          <label className={parts.field}>
            <span className={parts.label}>{t("pdf.pageSize.paperSize")}</span>
            <select
              ref={presetRef}
              data-testid="pdf-page-size-preset"
              value={preset}
              disabled={submitting}
              onChange={(event) => {
                const next = event.target.value as PdfPageSizePreset;
                // Custom starts from the size already shown as the target,
                // and its orientation is the one those fields describe.
                if (next === "custom" && preset !== "custom" && targetSize) {
                  setCustomWidthMm(millimetreInput(targetSize.width));
                  setCustomHeightMm(millimetreInput(targetSize.height));
                  setOrientation(pdfPageSizeOrientationOf(targetSize));
                }
                setPreset(next);
                setSubmitError(null);
              }}
            >
              <option value="original">
                {t("pdf.pageSize.originalOption", { sourceLabel })}
              </option>
              {Object.entries(PDF_PAGE_SIZE_PRESETS).map(([value, size]) => (
                <option key={value} value={value}>
                  {size.label} · {dimensionLabel(size, "")}
                </option>
              ))}
              <option value="custom">{t("pdf.pageSize.custom")}</option>
            </select>
          </label>

          {preset === "custom" ? (
            <fieldset className="grid grid-cols-2 gap-2.5">
              <legend className="sr-only">
                {t("pdf.pageSize.customDimensions")}
              </legend>
              <label className={parts.field}>
                <span className={parts.label}>{t("pdf.pageSize.widthMm")}</span>
                <input
                  type="number"
                  min={PDF_PAGE_SIZE_MIN_POINTS / (72 / 25.4)}
                  max={PDF_PAGE_SIZE_MAX_POINTS / (72 / 25.4)}
                  step={0.1}
                  data-testid="pdf-page-size-width"
                  value={customWidthMm}
                  disabled={submitting}
                  onChange={(event) => {
                    setCustomWidthMm(event.target.value);
                    syncCustomOrientation(event.target.value, customHeightMm);
                    setSubmitError(null);
                  }}
                  aria-invalid={!geometryValid}
                />
              </label>
              <label className={parts.field}>
                <span className={parts.label}>
                  {t("pdf.pageSize.heightMm")}
                </span>
                <input
                  type="number"
                  min={PDF_PAGE_SIZE_MIN_POINTS / (72 / 25.4)}
                  max={PDF_PAGE_SIZE_MAX_POINTS / (72 / 25.4)}
                  step={0.1}
                  data-testid="pdf-page-size-height"
                  value={customHeightMm}
                  disabled={submitting}
                  onChange={(event) => {
                    setCustomHeightMm(event.target.value);
                    syncCustomOrientation(customWidthMm, event.target.value);
                    setSubmitError(null);
                  }}
                  aria-invalid={!geometryValid}
                />
              </label>
            </fieldset>
          ) : null}

          {preset !== "original" ? (
            <div className="grid grid-cols-2 gap-2.5">
              <fieldset className="grid gap-1.5">
                <legend className={parts.sectionTitle}>
                  {t("pdf.pageSize.orientation")}
                </legend>
                <div className="office-dialog__tabs w-full">
                  {(["portrait", "landscape"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="office-dialog__tab flex-1"
                      aria-pressed={orientation === value}
                      disabled={submitting}
                      onClick={() => chooseOrientation(value)}
                      data-testid={`pdf-page-size-orientation-${value}`}
                    >
                      <OfficeSemanticIcon
                        semanticId={OFFICE_PAGE_ORIENTATION_ICON_IDS[value]}
                        size={16}
                      />
                      {value === "portrait"
                        ? t("pdf.pageSize.portrait")
                        : t("pdf.pageSize.landscape")}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-1.5">
                <legend className={parts.sectionTitle}>
                  {t("pdf.pageSize.existingContent")}
                </legend>
                <div className="office-dialog__tabs w-full">
                  {(["unchanged", "fit-center"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="office-dialog__tab flex-1"
                      aria-pressed={contentPlacement === value}
                      disabled={submitting}
                      onClick={() => setContentPlacement(value)}
                      data-testid={`pdf-page-size-content-${value}`}
                    >
                      {value === "unchanged" ? (
                        <Move size={13} aria-hidden />
                      ) : (
                        <Maximize2 size={13} aria-hidden />
                      )}
                      {value === "unchanged"
                        ? t("pdf.pageSize.contentKeep")
                        : t("pdf.pageSize.contentFit")}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          <fieldset className="grid gap-2">
            <legend className={parts.sectionTitle}>
              {t("pdf.pageSize.applyTo")}
            </legend>
            <div className="office-dialog__tabs w-full" role="group">
              {(["page", "all", "range"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="office-dialog__tab flex-1"
                  aria-pressed={scope === value}
                  disabled={submitting}
                  onClick={() => {
                    setScope(value);
                    setSubmitError(null);
                  }}
                  data-testid={`pdf-page-size-scope-${value}`}
                >
                  {value === "page"
                    ? t("pdf.pageSize.scopeCurrent")
                    : value === "all"
                      ? t("pdf.pageSize.scopeAll")
                      : t("pdf.pageSize.scopeRange")}
                </button>
              ))}
            </div>
            {scope === "range" ? (
              <label className={parts.field}>
                <span className={parts.hint}>
                  {t("pdf.pageSize.rangeExample")}
                </span>
                <input
                  type="text"
                  data-testid="pdf-page-size-range"
                  value={rangeSpec}
                  disabled={submitting}
                  onChange={(event) => {
                    setRangeSpec(event.target.value);
                    setSubmitError(null);
                  }}
                  aria-invalid={!rangeValid}
                />
              </label>
            ) : null}
          </fieldset>
        </div>

        <aside className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-2">
            <PreviewPage
              label={t("pdf.pageSize.previewCurrent")}
              size={sourceSize}
              emptyLabel={t("pdf.pageSize.previewUnknown")}
              testId="pdf-page-size-source-preview"
            />
            <PreviewPage
              label={t("pdf.pageSize.previewTarget")}
              size={targetSize}
              emptyLabel={t("pdf.pageSize.previewInvalid")}
              testId="pdf-page-size-target-preview"
            />
          </div>
          <div
            className={`${parts.message} grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 gap-y-0.5`}
          >
            <Ruler className="row-span-2 mt-0.5" size={15} aria-hidden />
            <strong className="text-[11.5px]">{targetLabel}</strong>
            <span className="text-[10.5px]">
              {selectionSummary}
            </span>
          </div>
          <div className={`${parts.hint} inline-flex items-start gap-1.5`}>
            <ShieldCheck
              className="mt-0.5 shrink-0"
              style={{ color: "var(--office-dialog-accent)" }}
              size={14}
              aria-hidden
            />
            <span>
              {contentPlacement === "fit-center" && preset !== "original"
                ? t("pdf.pageSize.contentFitHint")
                : t("pdf.pageSize.contentKeepHint")}
            </span>
          </div>
        </aside>
      </div>

      {!geometryValid ? (
        <p
          className={parts.message}
          role="alert"
        >
          {t("pdf.pageSize.dimensionsInvalid")}
        </p>
      ) : !rangeValid ? (
        <p
          className={parts.message}
          role="alert"
        >
          {t("pdf.pageSize.rangeInvalid")}
        </p>
      ) : submitError ? (
        <p
          className={parts.message}
          role="alert"
          data-testid="pdf-page-size-error"
        >
          {submitError}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
