"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import insertRibbonStyles from "../PdfInsertRibbonTab.module.css";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { Loader2 } from "lucide-react";
import { ImageDown, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
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
  isImageExportResolution,
  IMAGE_EXPORT_RESOLUTIONS,
  IMAGE_EXPORT_MAX_PAGES,
  asImageExportFormat,
  type ImageExportScope,
  type ImageExportFormat,
  type ImageExportRenderSize,
} from "../../../../../lib/pdf/canvas-export";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PdfRibbonToolButton } from "../PdfRibbonButton";

export interface PdfExportImageControlProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  loading: boolean;
  featuredLegacyToolsOpen: boolean;
  setExportImageOpen: Dispatch<SetStateAction<boolean>>;
  exportImageOpen: boolean;
  exportImageDialogReturnFocusRef: RefObject<HTMLButtonElement | null>;
  exportImageScope: ImageExportScope;
  setExportImageScope: Dispatch<SetStateAction<ImageExportScope>>;
  exportImageRange: string;
  setExportImageRange: Dispatch<SetStateAction<string>>;
  exportImageCombinePages: boolean;
  setExportImageCombinePages: Dispatch<SetStateAction<boolean>>;
  exportImageResolution: 72 | 96 | 150 | 300 | 600;
  setExportImageResolution: Dispatch<SetStateAction<72 | 96 | 150 | 300 | 600>>;
  exportImageBusy: boolean;
  rasterOutputAuthorityBlocked: boolean;
  handleExportPagesAsImages: (format: ImageExportFormat) => Promise<void>;
  exportImageOverLimit: { count: number; batches: string[]; } | null;
  exportImageCurrentPageSize: ImageExportRenderSize | null;
}

export function PdfExportImageControl({
  t,
  loading,
  featuredLegacyToolsOpen,
  setExportImageOpen,
  exportImageOpen,
  exportImageDialogReturnFocusRef,
  exportImageScope,
  setExportImageScope,
  exportImageRange,
  setExportImageRange,
  exportImageCombinePages,
  setExportImageCombinePages,
  exportImageResolution,
  setExportImageResolution,
  exportImageBusy,
  rasterOutputAuthorityBlocked,
  handleExportPagesAsImages,
  exportImageOverLimit,
  exportImageCurrentPageSize,
}: PdfExportImageControlProps) {
  return (
    !loading ? (
      <div className="pdf-viewer__split pdf-viewer__export-image">
        <PdfRibbonToolButton
          icon={exportImageBusy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ImageDown size={14} />
          )}
          ref={
            featuredLegacyToolsOpen
              ? exportImageDialogReturnFocusRef
              : undefined
          }
          data-testid="pdf-export-image-toggle"
          onClick={() => setExportImageOpen((open) => !open)}
          disabled={exportImageBusy || rasterOutputAuthorityBlocked}
          aria-expanded={exportImageOpen}
          aria-haspopup="dialog"
          title={t("pdfViewer.exportImage")}
          aria-label={t("pdfViewer.exportImage")}
        >
          {t("pdfViewer.exportImage")}
        </PdfRibbonToolButton>
        {exportImageOpen ? (
          <Dialog
            open={exportImageOpen}
            onOpenChange={setExportImageOpen}
          >
            <DialogContent
              skin="none"
              className={`${PDF_POPOVER_CHROME} ${insertRibbonStyles.decorationDialog}`}
              showCloseButton={false}
              data-testid="pdf-export-image-popover"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                exportImageDialogReturnFocusRef.current?.focus();
              }}
              >
              <div className={officeDialogParts.header}>
                <DialogTitle className={officeDialogParts.title}>{t("pdfViewer.exportImage")}</DialogTitle>
                <DialogClose
                  className={officeDialogParts.close}
                  aria-label={t("common.close")}
                >
                  <X size={14} aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogDescription className="sr-only">
                {t("pdfViewer.exportImageScope")}
              </DialogDescription>
              <div className={insertRibbonStyles.decorationForm}>
            <div
              className="pdf-viewer__split-modes"
              role="radiogroup"
              aria-label={t("pdfViewer.exportImageScope")}
            >
              {(["current", "all", "range"] as const).map((scope) => (
                <label key={scope} className={`${officeDialogParts.check} pdf-viewer__split-mode`}>
                  <input
                    type="radio"
                    name="pdf-export-image-scope"
                    checked={exportImageScope === scope}
                    onChange={() => setExportImageScope(scope)}
                    data-testid={`pdf-export-image-scope-${scope}`}
                  />
                  <span>
                    {scope === "current"
                      ? t("pdfViewer.exportImageScopeCurrent")
                      : scope === "all"
                        ? t("pdfViewer.exportImageScopeAll")
                        : t("pdfViewer.exportImageScopeRange")}
                  </span>
                </label>
              ))}
            </div>
            {exportImageScope === "range" ? (
              <input
                type="text"
                className="pdf-viewer__split-input"
                data-testid="pdf-export-image-range-input"
                value={exportImageRange}
                onChange={(event) =>
                  setExportImageRange(event.target.value)
                }
                placeholder={t("pdfViewer.splitRangePlaceholder")}
                aria-label={t("pdfViewer.exportImageRangeLabel")}
              />
            ) : null}
            {exportImageScope !== "current" ? (
              <label className={`${officeDialogParts.check} pdf-viewer__split-mode`}>
                <input
                  type="checkbox"
                  checked={exportImageCombinePages}
                  onChange={(event) =>
                    setExportImageCombinePages(event.target.checked)
                  }
                  data-testid="pdf-export-image-combine-pages"
                />
                <span>
                  {t("pdf.viewer.combinePagesIntoOneLong")}
                </span>
              </label>
            ) : null}
            <label className="pdf-viewer__split-mode pdf-viewer__export-resolution">
              <span>{t("pdfViewer.exportImageResolution")}</span>
              <select
                value={exportImageResolution}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (isImageExportResolution(next)) {
                    setExportImageResolution(next);
                  }
                }}
                data-testid="pdf-export-image-resolution"
              >
                {IMAGE_EXPORT_RESOLUTIONS.map((ppi) => (
                  <option key={ppi} value={ppi}>
                    {t("pdfViewer.exportImageResolutionOption", { ppi })}
                  </option>
                ))}
              </select>
            </label>
            {exportImageCurrentPageSize ? (
              <p
                className="pdf-viewer__export-resolution-size"
                data-testid="pdf-export-image-size"
              >
                {t(
                  exportImageCurrentPageSize.capped
                    ? "pdfViewer.exportImageSizeCapped"
                    : "pdfViewer.exportImageSize",
                  {
                    width: exportImageCurrentPageSize.width,
                    height: exportImageCurrentPageSize.height,
                  },
                )}
              </p>
            ) : null}
            {exportImageOverLimit ? (
              <div
                role="alert"
                className={officeDialogParts.message}
                data-testid="pdf-export-image-too-many"
              >
                <p>
                  {t("pdfViewer.exportImageTooManyPages", {
                    count: exportImageOverLimit.count,
                    max: IMAGE_EXPORT_MAX_PAGES,
                    batches: exportImageOverLimit.batches.join("; "),
                  })}
                </p>
                <button
                  type="button"
                  className={officeDialogParts.button}
                  data-testid="pdf-export-image-first-batch"
                  onClick={() => {
                    setExportImageScope("range");
                    setExportImageRange(exportImageOverLimit.batches[0]);
                  }}
                >
                  {t("pdfViewer.exportImageUseFirstBatch")}
                </button>
              </div>
            ) : null}
            {(["png", "jpg"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                className={`${officeDialogParts.primaryButton} pdf-viewer__split-go`}
                data-testid={`pdf-export-image-${fmt}`}
                disabled={
                  exportImageBusy ||
                  rasterOutputAuthorityBlocked ||
                  Boolean(exportImageOverLimit)
                }
                onClick={() => {
                  // Every scope, the current page included, renders at
                  
                  void handleExportPagesAsImages(asImageExportFormat(fmt));
                }}
              >
                {fmt === "png"
                  ? t("pdfViewer.exportImagePng")
                  : t("pdfViewer.exportImageJpg")}
              </button>
            ))}
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    ) : null
  );
}
