"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

export const PDF_IMAGE_ONLY_DPI_OPTIONS = [96, 150, 300] as const;
export type PdfImageOnlyDpi = (typeof PDF_IMAGE_ONLY_DPI_OPTIONS)[number];
export type PdfImageOnlyEncoding = "png" | "jpeg";
export type PdfImageOnlyJpegQuality = 0.7 | 0.85 | 0.92;

export interface PdfImageOnlyExportOptions {
  readonly dpi: PdfImageOnlyDpi;
  readonly encoding: PdfImageOnlyEncoding;
  readonly jpegQuality: PdfImageOnlyJpegQuality;
}

export const DEFAULT_PDF_IMAGE_ONLY_EXPORT_OPTIONS = Object.freeze({
  dpi: 150,
  encoding: "png",
  jpegQuality: 0.85,
} satisfies PdfImageOnlyExportOptions);

export interface PdfImageOnlyExportDialogProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onStart: (options: PdfImageOnlyExportOptions) => void;
  readonly onCancel: () => void;
}

const JPEG_QUALITY_OPTIONS = [
  { value: 0.7, labelKey: "pdf.imageOnlyExport.qualitySmaller" },
  { value: 0.85, labelKey: "pdf.imageOnlyExport.qualityBalanced" },
  { value: 0.92, labelKey: "pdf.imageOnlyExport.qualityHigher" },
] as const;

export default function PdfImageOnlyExportDialog({
  open,
  busy,
  returnFocusRef,
  onStart,
  onCancel,
}: PdfImageOnlyExportDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [dpi, setDpi] = useState<PdfImageOnlyDpi>(
    DEFAULT_PDF_IMAGE_ONLY_EXPORT_OPTIONS.dpi,
  );
  const [encoding, setEncoding] = useState<PdfImageOnlyEncoding>(
    DEFAULT_PDF_IMAGE_ONLY_EXPORT_OPTIONS.encoding,
  );
  const [jpegQuality, setJpegQuality] = useState<PdfImageOnlyJpegQuality>(
    DEFAULT_PDF_IMAGE_ONLY_EXPORT_OPTIONS.jpegQuality,
  );

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.imageOnlyExport.title")}
      description={t("pdf.imageOnlyExport.description")}
      defaultActionLabel={t("pdf.imageOnlyExport.apply")}
      cancelActionLabel={t("pdf.imageOnlyExport.cancel")}
      busyActionLabel={t("pdf.imageOnlyExport.preparing")}
      busy={busy}
      onDefaultAction={() => onStart({ dpi, encoding, jpegQuality })}
      onCancel={onCancel}
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-image-only"
    >
      <fieldset className="grid gap-2" disabled={busy}>
        <legend className={parts.sectionTitle}>
          {t("pdf.imageOnlyExport.resolution")}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {PDF_IMAGE_ONLY_DPI_OPTIONS.map((value) => (
            <label
              key={value}
              className={`${parts.check} cursor-pointer min-h-11`}
            >
              <span className="relative size-4 shrink-0">
                <input
                    type="radio"
                    name="pdf-image-only-dpi"
                    value={value}
                    checked={dpi === value}
                    onChange={() => setDpi(value)}
                    data-testid={`pdf-image-only-dpi-${value}`}
                  className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
                />
                <span
                  aria-hidden
                  className={`${parts.mark} pointer-events-none absolute inset-0 inline-flex size-4 items-center justify-center`}
                  data-shape="radio"
                />
              </span>
              {value} DPI
            </label>
          ))}
        </div>
        <p className={`${parts.hint} m-0`}>
          {dpi === 96
            ? t("pdf.imageOnlyExport.dpiScreenHint")
            : dpi === 300
              ? t("pdf.imageOnlyExport.dpiPrintHint")
              : t("pdf.imageOnlyExport.dpiBalancedHint")}
        </p>
      </fieldset>

      <fieldset className="grid gap-2" disabled={busy}>
        <legend className={parts.sectionTitle}>
          {t("pdf.imageOnlyExport.encoding")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(["png", "jpeg"] as const).map((value) => (
            <label
              key={value}
              className={`${parts.check} cursor-pointer min-h-11`}
            >
              <span className="relative size-4 shrink-0">
                <input
                    type="radio"
                    name="pdf-image-only-encoding"
                    value={value}
                    checked={encoding === value}
                    onChange={() => setEncoding(value)}
                    data-testid={`pdf-image-only-encoding-${value}`}
                  className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
                />
                <span
                  aria-hidden
                  className={`${parts.mark} pointer-events-none absolute inset-0 inline-flex size-4 items-center justify-center`}
                  data-shape="radio"
                />
              </span>
              {value === "png"
                ? t("pdf.imageOnlyExport.encodingPng")
                : t("pdf.imageOnlyExport.encodingJpeg")}
            </label>
          ))}
        </div>
      </fieldset>

      {encoding === "jpeg" ? (
        <label className={parts.field}>
          <span>{t("pdf.imageOnlyExport.jpegQuality")}</span>
          <select
            value={jpegQuality}
            onChange={(event) =>
              setJpegQuality(
                Number(event.target.value) as PdfImageOnlyJpegQuality,
              )
            }
            disabled={busy}
            data-testid="pdf-image-only-jpeg-quality"
          >
            {JPEG_QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)} · {Math.round(option.value * 100)}%
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div
        className={parts.message} data-tone="warning"
        data-testid="pdf-image-only-loss-summary"
      >
        <strong>{t("pdf.imageOnlyExport.lossHeading")}</strong>
        <ul className="mb-0 mt-2 list-disc space-y-1 pl-5">
          <li>{t("pdf.imageOnlyExport.lossText")}</li>
          <li>{t("pdf.imageOnlyExport.lossInteractivity")}</li>
          <li>{t("pdf.imageOnlyExport.lossStructure")}</li>
        </ul>
      </div>
    </OfficeDialogShell>
  );
}
