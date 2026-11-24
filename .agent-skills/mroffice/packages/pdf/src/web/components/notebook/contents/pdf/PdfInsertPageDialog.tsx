"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Loader2 } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CircleAlert,
  FileText,
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

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { OFFICE_PAGE_ORIENTATION_ICON_IDS } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";
import {
  PDF_INSERT_PAGE_SIZES as PAGE_SIZES,
  resolvePdfInsertPageSelection,
  type PdfInsertPageOrientation,
  type PdfInsertPagePlacement,
  type PdfInsertPagePreset,
  type PdfInsertPageSelection,
} from "../../../../lib/pdf/page-insert";

import { PdfPageInsertBlankIcon } from "./PdfPageRibbonIcons";

export {
  resolvePdfInsertPageSelection,
  type PdfInsertPageOrientation,
  type PdfInsertPagePlacement,
  type PdfInsertPagePreset,
  type PdfInsertPageSelection,
};

export interface PdfInsertPageDialogProps {
  open: boolean;
  busy?: boolean;
  currentPage: number;
  errorMessage?: string | null;
  previousPage?: number | null;
  visiblePageNumber: number;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onBusyChange?: (busy: boolean) => void;
  onConfirm: (selection: PdfInsertPageSelection) => void | Promise<void>;
  onCancel: () => void;
}

export default function PdfInsertPageDialog({
  open,
  busy = false,
  currentPage,
  errorMessage = null,
  previousPage = null,
  visiblePageNumber,
  returnFocusRef,
  onBusyChange,
  onConfirm,
  onCancel,
}: PdfInsertPageDialogProps) {
  const commonT = useTranslations("common");
  const t = useTranslations("console-notebooks");
  const afterRef = useRef<HTMLButtonElement>(null);
  const fallbackReturnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const [placement, setPlacement] = useState<PdfInsertPagePlacement>("after");
  const [preset, setPreset] = useState<PdfInsertPagePreset>("a4");
  const [orientation, setOrientation] =
    useState<PdfInsertPageOrientation>("portrait");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const effectiveBusy = busy || submitting;
  const effectiveError = errorMessage || submitError;
  if (open && returnFocusRef === undefined && typeof document !== "undefined") {
    const activeElement = document.activeElement;
    fallbackReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : document.querySelector<HTMLElement>(
            '[data-control-id="PDFCTL.RIBBON.PAGE.INSERT_BLANK"]',
          );
  }

  useEffect(() => {
    if (!open) return;
    submittingRef.current = false;
    setPlacement("after");
    setPreset("a4");
    setOrientation("portrait");
    setSubmitting(false);
    setSubmitError(null);
  }, [open]);

  const selection = useMemo(
    () =>
      resolvePdfInsertPageSelection({
        placement,
        currentPage,
        previousPage,
        preset,
        orientation,
      }),
    [currentPage, orientation, placement, preset, previousPage],
  );
  const size = PAGE_SIZES[preset];
  const placementLabel =
    placement === "before"
      ? t("pdf.insertPage.beforePage", { page: visiblePageNumber })
      : t("pdf.insertPage.afterPage", { page: visiblePageNumber });
  const orientationLabel =
    orientation === "portrait"
      ? t("pdf.insertPage.portrait")
      : t("pdf.insertPage.landscape");

  const cancel = useCallback(() => {
    if (submittingRef.current || busy) return;
    setSubmitError(null);
    onCancel();
  }, [busy, onCancel]);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current || busy) return;
    submittingRef.current = true;
    setSubmitError(null);
    setSubmitting(true);
    onBusyChange?.(true);
    try {
      await onConfirm(selection);
    } catch (error) {
      // Say what refused the insert; a bare "try again" hid a refusal that
      
      const reason =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "";
      setSubmitError(
        reason
          ? t("pdf.insertPage.insertFailedReason", { reason })
          : t("pdf.insertPage.insertFailed"),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onBusyChange?.(false);
    }
  }, [busy, onBusyChange, onConfirm, selection, t]);

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.insertPage.title")}
      description={t("pdf.insertPage.description")}
      defaultActionLabel={
        <span className="inline-flex items-center gap-2">
          <PdfPageInsertBlankIcon size={16} />
          {t("pdf.insertPage.apply")}
        </span>
      }
      busyActionLabel={
        <span className="inline-flex items-center gap-2">
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          {t("pdf.insertPage.inserting")}
        </span>
      }
      cancelActionLabel={commonT("button.cancel")}
      onDefaultAction={handleSubmit}
      onCancel={cancel}
      defaultActionDisabled={effectiveBusy}
      busy={effectiveBusy}
      initialFocusRef={afterRef}
      returnFocusRef={returnFocusRef ?? fallbackReturnFocusRef}
      className="max-w-[468px]"
      testIdPrefix="pdf-insert-page"
      defaultActionTestId="pdf-insert-page-confirm"
    >
      <div className="grid gap-4" data-testid="pdf-insert-page-body">
        <section className="grid gap-2">
          <span className={parts.sectionTitle}>
            {t("pdf.insertPage.placement")}
          </span>
          <div
            className="grid grid-cols-2 gap-2"
            role="group"
            aria-label={t("pdf.insertPage.placement")}
          >
            <button
              type="button"
              className="office-dialog__choice grid min-h-16 grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 text-left"
              aria-pressed={placement === "before"}
              disabled={effectiveBusy}
              onClick={() => setPlacement("before")}
              data-testid="pdf-insert-placement-before"
            >
              <ArrowUpToLine className="row-span-2" size={18} aria-hidden />
              <strong className="text-xs">
                {t("pdf.insertPage.beforeCurrent")}
              </strong>
              <span className={`${parts.hint} leading-tight`}>
                {t("pdf.insertPage.beforeCurrentHint")}
              </span>
            </button>
            <button
              ref={afterRef}
              type="button"
              className="office-dialog__choice grid min-h-16 grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 text-left"
              aria-pressed={placement === "after"}
              disabled={effectiveBusy}
              onClick={() => setPlacement("after")}
              data-testid="pdf-insert-placement-after"
            >
              <ArrowDownToLine className="row-span-2" size={18} aria-hidden />
              <strong className="text-xs">
                {t("pdf.insertPage.afterCurrent")}
              </strong>
              <span className={`${parts.hint} leading-tight`}>
                {t("pdf.insertPage.afterCurrentHint")}
              </span>
            </button>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          <label className={parts.field}>
            <span className={parts.label}>{t("pdf.insertPage.paperSize")}</span>
            <select
              value={preset}
              disabled={effectiveBusy}
              onChange={(event) =>
                setPreset(event.target.value as PdfInsertPagePreset)
              }
              data-testid="pdf-insert-page-size"
            >
              {Object.entries(PAGE_SIZES).map(([value, pageSize]) => (
                <option key={value} value={value}>
                  {pageSize.label} · {pageSize.dimensions}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1.5">
            <span className={parts.sectionTitle}>
              {t("pdf.insertPage.orientation")}
            </span>
            <div
              className="office-dialog__tabs w-full"
              role="group"
              aria-label={t("pdf.insertPage.orientation")}
            >
              {(["portrait", "landscape"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="office-dialog__tab flex-1"
                  aria-pressed={orientation === value}
                  disabled={effectiveBusy}
                  onClick={() => setOrientation(value)}
                  data-testid={`pdf-insert-orientation-${value}`}
                >
                  <OfficeSemanticIcon
                    semanticId={OFFICE_PAGE_ORIENTATION_ICON_IDS[value]}
                    size={16}
                  />
                  {value === "portrait"
                    ? t("pdf.insertPage.portrait")
                    : t("pdf.insertPage.landscape")}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="office-dialog__well grid grid-cols-[34px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 px-3 py-2.5"
          data-testid="pdf-insert-page-summary"
        >
          <FileText
            className="row-span-2"
            size={19}
            aria-hidden
          />
          <strong className="text-xs">
            {placementLabel} · {size.label} · {orientationLabel}
          </strong>
          <span className={parts.hint}>
            {Math.round(selection.width)} × {Math.round(selection.height)}{" "}
            {t("pdf.insertPage.pdfPoints")}
          </span>
          <div className="col-start-2 mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-semibold">
            <ShieldCheck size={13} aria-hidden />
            {t("pdf.insertPage.nativeHint")}
          </div>
        </div>

        <div
          // `hidden` alone loses to the flex utility: toggle the display
          
          className={`${parts.message} flex items-start gap-2`}
          style={effectiveBusy ? undefined : { display: "none" }}
          role="status"
          aria-live="polite"
          hidden={!effectiveBusy}
          data-testid="pdf-insert-page-status"
        >
          <Loader2
            className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          <span>{t("pdf.insertPage.insertingStatus")}</span>
        </div>
        <div
          className={`${parts.group} flex items-start gap-2 leading-relaxed`}
          style={effectiveError ? undefined : { display: "none" }}
          role="alert"
          hidden={!effectiveError}
          data-testid="pdf-insert-page-error"
        >
          <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden />
          <span>{effectiveError}</span>
        </div>
      </div>
    </OfficeDialogShell>
  );
}
