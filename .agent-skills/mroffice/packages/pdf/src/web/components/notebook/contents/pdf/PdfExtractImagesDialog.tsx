"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  AlertTriangle,
  FileArchive,
  Images,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { PdfImageExtractionPlan } from "../../../../lib/pdf/extract-image-resources";

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pagesLabel(pages: readonly number[]): string {
  if (pages.length <= 4) return pages.join(", ");
  return `${pages.slice(0, 3).join(", ")} +${pages.length - 3}`;
}

export default function PdfExtractImagesDialog({
  open,
  plan,
  busy,
  errorMessage,
  returnFocusRef,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly plan: PdfImageExtractionPlan | null;
  readonly locale: string;
  readonly busy?: boolean;
  readonly errorMessage?: string | null;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const imageBytes =
    plan?.images.reduce((total, image) => total + image.encodedByteLength, 0) ??
    0;
  const softMaskCount =
    plan?.images.filter((image) => image.hasSoftMask).length ?? 0;

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.extractImages.title")}
      description={t("pdf.extractImages.description")}
      defaultActionLabel={t("pdf.extractImages.download")}
      cancelActionLabel={t("common.cancel")}
      busy={busy}
      busyActionLabel={t("pdf.extractImages.busy")}
      defaultActionDisabled={!plan || plan.images.length === 0}
      returnFocusRef={returnFocusRef}
      onDefaultAction={onConfirm}
      onCancel={onCancel}
      className="max-h-[calc(100vh-48px)] overflow-y-auto sm:max-w-[760px]"
      testIdPrefix="pdf-extract-images"
    >
      {plan ? (
        <>
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            data-testid="pdf-extract-images-summary"
          >
            {[
              [t("pdf.extractImages.summary.downloadable"), String(plan.images.length)],
              [t("pdf.extractImages.summary.notExported"), String(plan.skipped.length)],
              [t("pdf.extractImages.summary.originalSize"), bytesLabel(imageBytes)],
              [t("pdf.extractImages.summary.pdfPages"), String(plan.pageCount)],
            ].map(([label, value]) => (
              <div
                key={label}
                className={parts.group}
              >
                <div className={parts.hint}>{label}</div>
                <div className="mt-0.5 text-sm font-semibold">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className={`${parts.group} flex items-start gap-2 leading-relaxed`}>
            <FileArchive className="mt-0.5 shrink-0" size={17} aria-hidden />
            <span data-testid="pdf-extract-images-source">
              {t("pdf.extractImages.source", { hash: plan.sourceSha256.slice(0, 12) })}
            </span>
          </div>

          {plan.images.length > 0 ? (
            <div className={`${parts.well} overflow-x-auto p-0`}>
              <table className={`${parts.table} w-full min-w-[560px]`}>
                <thead>
                  <tr>
                    <th>
                      {t("pdf.extractImages.column.file")}
                    </th>
                    <th>
                      {t("pdf.extractImages.column.dimensions")}
                    </th>
                    <th>
                      {t("pdf.extractImages.column.pages")}
                    </th>
                    <th>
                      {t("pdf.extractImages.column.size")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.images.map((image) => (
                    <tr key={image.id} data-testid="pdf-extract-images-row">
                      <td className="max-w-64">
                        <span className="block truncate" title={image.filename}>
                          {image.filename.replace(/^images\//, "")}
                        </span>
                        <span className={parts.hint}>
                          {image.format === "jpeg2000" ? "JPX" : image.format === "png" ? "PNG" : "JPEG"}
                        </span>
                      </td>
                      <td className={parts.hint}>
                        {image.width} × {image.height}
                      </td>
                      <td className={parts.hint}>
                        {pagesLabel(image.pageNumbers)}
                      </td>
                      <td className={parts.hint}>
                        {bytesLabel(image.encodedByteLength)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className={`${parts.well} ${parts.hint} flex min-h-24 items-center justify-center gap-2`}
              data-testid="pdf-extract-images-empty"
            >
              <Images size={18} aria-hidden />
              {t("pdf.extractImages.empty")}
            </div>
          )}

          <div
            className={`${parts.message} flex items-start gap-2 leading-relaxed`} data-tone="warning"
            role="note"
            data-testid="pdf-extract-images-caveat"
          >
            <AlertTriangle
              className="mt-0.5 shrink-0"
              size={17}
              aria-hidden
            />
            <span>
              {[
                plan.skipped.length > 0
                  ? t("pdf.extractImages.caveat.skipped", { count: plan.skipped.length })
                  : null,
                softMaskCount > 0
                  ? t("pdf.extractImages.caveat.softMask", { count: softMaskCount })
                  : null,
                t("pdf.extractImages.caveat.inline"),
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
          </div>

          {errorMessage ? (
            <p
              className={`${parts.message} m-0`}
              role="alert"
              data-testid="pdf-extract-images-error"
            >
              {errorMessage}
            </p>
          ) : null}
        </>
      ) : null}
    </OfficeDialogShell>
  );
}
