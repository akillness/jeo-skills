"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useCallback, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { Download, Lock } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { formatFileSize } from "@mrnote/core/web/lib/errors/upload-failure.ts";
import { PDF_RANGE_LOAD_MIN_BYTES } from "../../../../../lib/pdf/range-source";

/**
 * Says a PDF is read in ranges and open read-only (it is past what is
 * downloaded whole, lib/pdf/range-source), and offers the stored file.
 */
export const LargePdfNotice = memo(function LargePdfNotice({
  sizeBytes,
  onDownload,
}: {
  sizeBytes: number;
  onDownload: () => Promise<void>;
}) {
  const t = useTranslations("console-notebooks");
  const [downloading, setDownloading] = useState(false);
  const inFlight = useRef(false);
  const download = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDownloading(true);
    try {
      await onDownload();
    } catch {
      toast({ variant: "destructive", title: t("oversizedImport.downloadFailed") });
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  }, [onDownload, t]);
  return (
    <div
      role="status"
      data-testid="pdf-large-file-notice"
      className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <Lock aria-hidden size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{t("pdf.largeFile.title")}</p>
        <p>
          {t("pdf.largeFile.body", {
            size: formatFileSize(sizeBytes),
            limit: formatFileSize(PDF_RANGE_LOAD_MIN_BYTES),
          })}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void download()}
        disabled={downloading}
        data-testid="pdf-large-file-download"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
      >
        <Download aria-hidden size={14} />
        {downloading ? t("oversizedImport.downloading") : t("oversizedImport.download")}
      </button>
    </div>
  );
});
