"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Dispatch, SetStateAction, RefObject } from "react";
import {
  PDF_COMPRESS_LOSSLESS_PRESET,
  type PdfCompressLosslessPreset,
  type PdfCompressServerPreset,
  type PdfCompressionEvidenceSource,
} from "../../../../../lib/pdf/compress";
import {
  PDF_READER_COMPRESS_LOSSLESS_COMMAND,
  PDF_READER_COMPRESS_LOSSY_COMMAND,
} from "./readerCommands";
import { Loader2 } from "lucide-react";
import {
  FileDown,
  FileText,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { PdfFormDataFormat } from "@/lib/pdf/form-export";
import type { PdfSourceRiskSnapshot } from "../../../../../lib/pdf/save-policy";
import type { PdfCompressPreset } from "../PdfCompressSettingsDialog";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PdfRibbonToolButton } from "../PdfRibbonButton";
import anatomyStyles from "../PdfInsertRibbonTab.module.css";

export interface PdfLegacyDocumentToolsProps {
  lossyCompressionSource: PdfCompressionEvidenceSource | null | undefined;
  lossyCompressionWritable: boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  savePolicyV1: boolean;
  matchedSourceRiskSnapshot: PdfSourceRiskSnapshot | null;
  loading: boolean;
  flattening: boolean;
  formDataExportFormat: PdfFormDataFormat;
  setFormDataExportFormat: Dispatch<SetStateAction<PdfFormDataFormat>>;
  compressPreset: "lossless-structural-v1" | PdfCompressServerPreset;
  setCompressPreset: Dispatch<SetStateAction<"lossless-structural-v1" | PdfCompressServerPreset>>;
  formImportInputRef: RefObject<HTMLInputElement | null>;
  formImportReturnFocusRef: RefObject<HTMLButtonElement | null>;
  formFieldsUnavailable: boolean;
  formFieldsUnavailableReason: string;
  nativeFormMode: boolean;
  nativeFormDataMutationBlocked: boolean;
  nativeFormDataMutationBlockedReason: string;
  handleCompressPdf: (requestedPreset?: PdfCompressPreset) => Promise<void>;
  handleExportFormData: (requestedFormat?: PdfFormDataFormat) => Promise<void>;
  handleResetForm: () => Promise<void>;
}

export function PdfLegacyDocumentTools({
  lossyCompressionSource,
  lossyCompressionWritable,
  t,
  savePolicyV1,
  matchedSourceRiskSnapshot,
  loading,
  flattening,
  formDataExportFormat,
  setFormDataExportFormat,
  compressPreset,
  setCompressPreset,
  formImportInputRef,
  formImportReturnFocusRef,
  formFieldsUnavailable,
  formFieldsUnavailableReason,
  nativeFormMode,
  nativeFormDataMutationBlocked,
  nativeFormDataMutationBlockedReason,
  handleCompressPdf,
  handleExportFormData,
  handleResetForm,
}: PdfLegacyDocumentToolsProps) {
  return (
    !loading ? (
      <>
        <PdfRibbonToolButton
          icon={flattening ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileDown size={14} />
          )}
          data-testid="pdf-tools-compress"
          onClick={() => void handleCompressPdf()}
          disabled={
            loading ||
            flattening ||
            (savePolicyV1 && matchedSourceRiskSnapshot === null) ||
            (savePolicyV1 &&
              compressPreset !== PDF_COMPRESS_LOSSLESS_PRESET &&
              (!lossyCompressionSource || !lossyCompressionWritable))
          }
          title={t("pdfViewer.compress")}
          aria-label={t("pdfViewer.compress")}
          data-capability-id={
            PDF_READER_COMPRESS_LOSSLESS_COMMAND.featureId
          }
          data-command-action={
            compressPreset === PDF_COMPRESS_LOSSLESS_PRESET
              ? PDF_READER_COMPRESS_LOSSLESS_COMMAND.action
              : PDF_READER_COMPRESS_LOSSY_COMMAND.action
          }
          data-output-disposition="flatten-with-consent"
          // The screen tip shows this reason: the Featured 压缩's own copy.
          data-disabled-reason={
            savePolicyV1 && matchedSourceRiskSnapshot === null
              ? t("pdf.viewer.currentPdfSourceNotBeen")
              : savePolicyV1 &&
                  compressPreset !== PDF_COMPRESS_LOSSLESS_PRESET &&
                  (!lossyCompressionSource || !lossyCompressionWritable)
                ? t("pdfViewer.compressLossyUnavailable")
              : undefined
          }
        >
          {t("pdfViewer.compress")}
        </PdfRibbonToolButton>
        {/* Quality tier for the compress action: lossless keeps the
            local structural pass; the server presets downsample images
            (screen 72 / ebook 150 / print 300 DPI). */}
        <select
          className={`${anatomyStyles.styleSelect} ${anatomyStyles.wideSelect}`}
          data-testid="pdf-compress-preset"
          value={compressPreset}
          onChange={(event) =>
            setCompressPreset(
              event.target.value as
                | PdfCompressLosslessPreset
                | PdfCompressServerPreset,
            )
          }
          disabled={loading || flattening}
          aria-label={t("pdfViewer.compressPreset")}
          title={t("pdfViewer.compressPreset")}
        >
          <option value={PDF_COMPRESS_LOSSLESS_PRESET}>
            {t("pdfViewer.compressPresetLossless")}
          </option>
          <option value="screen">
            {t("pdfViewer.compressPresetScreen")}
          </option>
          <option value="ebook">
            {t("pdfViewer.compressPresetEbook")}
          </option>
          <option value="print">
            {t("pdfViewer.compressPresetPrint")}
          </option>
        </select>
        <select
          className={anatomyStyles.styleSelect}
          data-testid="pdf-export-form-data-format"
          value={formDataExportFormat}
          onChange={(event) =>
            setFormDataExportFormat(
              event.target.value as PdfFormDataFormat,
            )
          }
          disabled={loading || flattening}
          aria-label={t("pdfViewer.exportFormDataFormat")}
          title={t("pdfViewer.exportFormDataFormat")}
        >
          <option value="csv">CSV</option>
          <option value="xfdf">XFDF</option>
        </select>
        <PdfRibbonToolButton
          icon={<FileText size={14} />}
          data-testid="pdf-export-form-data"
          onClick={() => void handleExportFormData()}
          disabled={
            loading || flattening || formFieldsUnavailable
          }
          title={
            formFieldsUnavailable
              ? formFieldsUnavailableReason
              : t("pdfViewer.exportFormData")
          }
          aria-label={t("pdfViewer.exportFormData")}
        >
          {t("pdfViewer.exportFormData")}
        </PdfRibbonToolButton>
        <PdfRibbonToolButton
          icon={<FileText size={14} />}
          data-testid="pdf-import-form-data"
          onClick={() => {
            formImportReturnFocusRef.current = null;
            formImportInputRef.current?.click();
          }}
          disabled={
            loading ||
            flattening ||
            nativeFormDataMutationBlocked ||
            formFieldsUnavailable
          }
          title={
            nativeFormDataMutationBlocked
              ? nativeFormDataMutationBlockedReason
              : formFieldsUnavailable
                ? formFieldsUnavailableReason
              : t("pdfViewer.importFormData")
          }
          aria-label={t("pdfViewer.importFormData")}
          data-capability-id="PDF-FRM-AUTH-03"
          data-command-action="pdf.form.import-data"
          data-output-disposition={
            nativeFormMode ? "native" : "blocked"
          }
          data-disabled-reason={
            nativeFormDataMutationBlocked
              ? nativeFormDataMutationBlockedReason
              : formFieldsUnavailable
                ? formFieldsUnavailableReason
              : undefined
          }
        >
          {t("pdfViewer.importFormData")}
        </PdfRibbonToolButton>
        <PdfRibbonToolButton
          icon={<FileText size={14} />}
          data-testid="pdf-reset-form"
          onClick={() => void handleResetForm()}
          disabled={
            loading ||
            flattening ||
            nativeFormDataMutationBlocked ||
            formFieldsUnavailable
          }
          title={
            nativeFormDataMutationBlocked
              ? nativeFormDataMutationBlockedReason
              : formFieldsUnavailable
                ? formFieldsUnavailableReason
              : t("pdfViewer.resetForm")
          }
          aria-label={t("pdfViewer.resetForm")}
          data-capability-id="PDF-FRM-AUTH-03"
          data-command-action="pdf.form.reset-values"
          data-output-disposition={
            nativeFormMode ? "native" : "blocked"
          }
          data-disabled-reason={
            nativeFormDataMutationBlocked
              ? nativeFormDataMutationBlockedReason
              : formFieldsUnavailable
                ? formFieldsUnavailableReason
              : undefined
          }
        >
          {t("pdfViewer.resetForm")}
        </PdfRibbonToolButton>
      </>
    ) : null
  );
}
