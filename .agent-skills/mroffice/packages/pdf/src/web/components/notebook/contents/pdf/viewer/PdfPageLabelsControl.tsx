"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import insertRibbonStyles from "../PdfInsertRibbonTab.module.css";
import type { RefObject, Dispatch, SetStateAction } from "react";
import { Hash, X, Trash2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import { PDF_POPOVER_CHROME } from "./popoverChrome";
import {
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  asPageLabelStyle,
  type PageLabelStyle,
  PAGE_LABEL_STYLES,
  computeNativePageLabels,
  computePageLabels,
  nativePageLabelReplacementReady,
  type PageLabelRange,
} from "@mrnote/core/web/lib/pdf/page-labels.ts";
import type { PageRecord } from "./pageRecord";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PdfRibbonToolButton } from "../PdfRibbonButton";

export interface PdfPageLabelsControlProps {
  annotatedDownloadEnabled: boolean;
  dataItemId: string | undefined;
  nativePageLabelRanges: readonly PageLabelRange[] | null | undefined;
  onNativePageLabelRangesApply: ((next: PageLabelRange[]) => void | Promise<void>) | undefined;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  pages: PageRecord[];
  loading: boolean;
  pageLabelsOpen: boolean;
  pageLabelsDialogReturnFocusRef: RefObject<HTMLButtonElement | null>;
  pageLabelRanges: PageLabelRange[];
  pageLabelReplacementStarted: boolean;
  setPageLabelReplacementStarted: Dispatch<SetStateAction<boolean>>;
  pageLabelsApplying: boolean;
  pageLabelsError: string | null;
  nativePageLabelsControlled: boolean;
  nativePageLabelsSourceOwned: boolean;
  updatePageLabelRanges: (update: (current: PageLabelRange[]) => PageLabelRange[]) => void;
  flattening: boolean;
  closePageLabelsDialog: () => void;
  togglePageLabelsDialog: (trigger?: HTMLButtonElement | null) => void;
  applyPageLabelRanges: () => Promise<void>;
}

export function PdfPageLabelsControl({
  annotatedDownloadEnabled,
  dataItemId,
  nativePageLabelRanges,
  onNativePageLabelRangesApply,
  t,
  pages,
  loading,
  pageLabelsOpen,
  pageLabelsDialogReturnFocusRef,
  pageLabelRanges,
  pageLabelReplacementStarted,
  setPageLabelReplacementStarted,
  pageLabelsApplying,
  pageLabelsError,
  nativePageLabelsControlled,
  nativePageLabelsSourceOwned,
  updatePageLabelRanges,
  flattening,
  closePageLabelsDialog,
  togglePageLabelsDialog,
  applyPageLabelRanges,
}: PdfPageLabelsControlProps) {
  return (
    dataItemId && !loading ? (
      <div className="pdf-viewer__page-labels">
        <PdfRibbonToolButton
          active={pageLabelsOpen}
          icon={<Hash size={14} />}
          onClick={(event) =>
            togglePageLabelsDialog(event.currentTarget)
          }
          disabled={flattening}
          aria-expanded={pageLabelsOpen}
          aria-label={t("pdfViewer.pageLabels")}
          title={t("pdfViewer.pageLabels")}
          data-testid="pdf-page-labels-toggle"
        >
          {t("pdfViewer.pageLabels")}
        </PdfRibbonToolButton>
        {pageLabelsOpen ? (
          <Dialog
            open={pageLabelsOpen}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) closePageLabelsDialog();
            }}
          >
            <DialogContent
              skin="none"
              className={`${PDF_POPOVER_CHROME} ${insertRibbonStyles.decorationDialog}`}
              showCloseButton={false}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const trigger = pageLabelsDialogReturnFocusRef.current;
                pageLabelsDialogReturnFocusRef.current = null;
                trigger?.focus();
              }}
              >
              <div className={officeDialogParts.header}>
                <DialogTitle className={officeDialogParts.title}>{t("pdfViewer.pageLabels")}</DialogTitle>
                <DialogClose
                  className={officeDialogParts.close}
                  aria-label={t("common.close")}
                >
                  <X size={14} aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogDescription
                skin="none"
                className={`${officeDialogParts.description} pdf-viewer__page-labels-hint`}
              >
                {nativePageLabelsSourceOwned
                  ? t("pdf.viewer.sourcePdfSExistingPage")
                  : t("pdfViewer.pageLabelsHint")}
              </DialogDescription>
              <div
                className={`pdf-viewer__page-labels-dialog ${insertRibbonStyles.decorationForm}`}
                role="group"
                aria-label={t("pdfViewer.pageLabels")}
                data-testid="pdf-page-labels-dialog"
                style={{
                  position: "static",
                  inset: "auto",
                  width: "auto",
                  maxHeight: "none",
                  border: 0,
                  boxShadow: "none",
                }}
              >
            {pageLabelRanges.length === 0 ? (
              <p
                className={`${officeDialogParts.hint} pdf-viewer__page-labels-empty`}
                data-testid="pdf-page-labels-empty"
              >
                {t("pdfViewer.pageLabelsEmpty")}
              </p>
            ) : null}
            {pageLabelRanges.map((range, idx) => (
              <div
                key={idx}
                className="pdf-viewer__page-labels-row"
                data-testid="pdf-page-labels-row"
              >
                <label>
                  <span>{t("pdfViewer.pageLabelsStartPage")}</span>
                  <input
                    type="number"
                    min={1}
                    max={pages.length || 1}
                    value={range.start + 1}
                    data-testid="pdf-page-labels-start"
                    onChange={(e) => {
                      const oneBased = Number(e.target.value);
                      const start =
                        Number.isInteger(oneBased) && oneBased >= 1
                          ? oneBased - 1
                          : 0;
                      updatePageLabelRanges((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, start } : r,
                        ),
                      );
                    }}
                  />
                </label>
                <label>
                  <span>{t("pdfViewer.pageLabelsStyle")}</span>
                  <select
                    value={range.style}
                    data-testid="pdf-page-labels-style"
                    onChange={(e) =>
                      updatePageLabelRanges((prev) =>
                        prev.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                style: asPageLabelStyle(
                                  e.target.value,
                                ) as PageLabelStyle,
                              }
                            : r,
                        ),
                      )
                    }
                  >
                    {PAGE_LABEL_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {t(`pdfViewer.pageLabelsStyle_${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("pdfViewer.pageLabelsPrefix")}</span>
                  <input
                    type="text"
                    maxLength={64}
                    value={range.prefix ?? ""}
                    data-testid="pdf-page-labels-prefix"
                    onChange={(e) =>
                      updatePageLabelRanges((prev) =>
                        prev.map((r, i) =>
                          i === idx
                            ? { ...r, prefix: e.target.value }
                            : r,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>{t("pdfViewer.pageLabelsStart")}</span>
                  <input
                    type="number"
                    min={1}
                    value={range.firstValue ?? 1}
                    data-testid="pdf-page-labels-first"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      updatePageLabelRanges((prev) =>
                        prev.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                firstValue:
                                  Number.isInteger(v) && v >= 1 ? v : 1,
                              }
                            : r,
                        ),
                      );
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={`${officeDialogParts.iconButton} pdf-viewer__page-labels-remove`}
                  data-testid="pdf-page-labels-remove"
                  aria-label={t("pdfViewer.pageLabelsRemove")}
                  title={t("pdfViewer.pageLabelsRemove")}
                  onClick={() =>
                    updatePageLabelRanges((prev) =>
                      prev.filter((_, i) => i !== idx),
                    )
                  }
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </div>
            ))}
            {/* Live preview of the first few resulting labels. */}
            {pageLabelRanges.length > 0 && pages.length > 0 ? (
              <p
                className={`${officeDialogParts.hint} pdf-viewer__page-labels-preview`}
                data-testid="pdf-page-labels-preview"
              >
                {t("pdfViewer.pageLabelsPreview")}{" "}
                {(nativePageLabelsControlled
                  ? (computeNativePageLabels(
                      pageLabelRanges,
                      pages.length,
                    ) ?? [])
                  : computePageLabels(pageLabelRanges, pages.length))
                  .slice(0, 8)
                  .join(", ")}
                {pages.length > 8 ? " …" : ""}
              </p>
            ) : null}
            {pageLabelsError ? (
              <p
                className={`${officeDialogParts.error} pdf-viewer__flatten-error`}
                role="alert"
                data-testid="pdf-page-labels-error"
              >
                {pageLabelsError}
              </p>
            ) : null}
            <div className="pdf-viewer__page-labels-actions">
              {nativePageLabelsSourceOwned &&
              !pageLabelReplacementStarted ? (
                <button
                  type="button"
                  className={`${officeDialogParts.compactButton} pdf-viewer__page-labels-add`}
                  data-testid="pdf-page-labels-replace-all"
                  onClick={() => setPageLabelReplacementStarted(true)}
                >
                  {t("pdf.viewer.replaceAll")}
                </button>
              ) : null}
              <button
                type="button"
                className={`${officeDialogParts.compactButton} pdf-viewer__page-labels-add`}
                data-testid="pdf-page-labels-add"
                onClick={() =>
                  updatePageLabelRanges((prev) => [
                    ...prev,
                    {
                      start:
                        prev.length === 0
                          ? 0
                          : Math.min(
                              prev.length,
                              Math.max(0, pages.length - 1),
                            ),
                      style: "decimal",
                      firstValue: 1,
                    },
                  ])
                }
              >
                {t("pdfViewer.pageLabelsAdd")}
              </button>
              <div className="pdf-viewer__page-labels-commit-actions">
                <button
                  type="button"
                  className={`${officeDialogParts.button} pdf-viewer__page-labels-cancel`}
                  data-testid="pdf-page-labels-cancel"
                  onClick={closePageLabelsDialog}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className={`${officeDialogParts.primaryButton} pdf-viewer__page-labels-apply`}
                  data-testid="pdf-page-labels-apply"
                  disabled={
                    flattening ||
                    pageLabelsApplying ||
                    (nativePageLabelsControlled
                      ? !onNativePageLabelRangesApply ||
                        !nativePageLabelReplacementReady(
                          nativePageLabelRanges ?? null,
                          pageLabelReplacementStarted,
                        )
                      : !annotatedDownloadEnabled ||
                        pageLabelRanges.length === 0)
                  }
                  onClick={() => void applyPageLabelRanges()}
                >
                  {nativePageLabelsControlled
                    ? t("pages.saveNow")
                    : t("pdfViewer.pageLabelsApply")}
                </button>
              </div>
            </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    ) : null
  );
}
