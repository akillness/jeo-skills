"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "../../../../../host/next-intl";
import { Download, ExternalLink, Lock } from "../../../office-ribbon/icons/houseIcons";

import { toast } from "../../../../hooks/use-toast";
import {
  canOpenOriginalInDesktopApp,
  downloadStoredOriginal,
  openStoredOriginalInDesktopApp,
} from "../../../../lib/document-import/storedOriginal";
import type { OversizedImportOriginal } from "../../../../lib/office/oversized-import";
import { pageIsProtected } from "../../../../lib/office/office-encryption";
import { downloadPageExport, type PageExportFormat } from "../../../../lib/page-export";

/**
 * Explains a read-only preview of a file too large to edit here, says how much
 * of it the page shows, and offers the untouched original.
 *
 * The page is already read-only through the server's write gate; this notice
 * only tells the reader why and what they can do instead. The page's own
 * package export is the original upload, so "Download original" reuses it.
 * One banner for all three editors: a workbook names its cut sheets, a deck
 * its slides, a document its beginning.
 */
export const OversizedImportNotice = memo(function OversizedImportNotice({
  pageId,
  format,
  testIdPrefix,
  title,
  body,
  details,
  original = null,
}: {
  pageId: string;
  /** The export that returns the original file (xlsx, pptx or docx). */
  format: PageExportFormat;
  testIdPrefix: string;
  /** The notice's heading; the read-only preview's own by default. */
  title?: ReactNode;
  body: ReactNode;
  /** Lines under the body saying exactly what is shown. */
  details?: ReactNode;
  /** The stored upload, downloaded as it is (newer previews name it). */
  original?: OversizedImportOriginal | null;
}) {
  const t = useTranslations("console-notebooks");
  const [downloading, setDownloading] = useState(false);
  const inFlight = useRef(false);
  const desktopOpen = original ? canOpenOriginalInDesktopApp() : false;

  const openInApp = useCallback(async () => {
    if (!original) return;
    try {
      if (await pageIsProtected(pageId)) {
        toast({ variant: "destructive", title: t("officeEncryption.exportRefused") });
        return;
      }
      await openStoredOriginalInDesktopApp(original);
    } catch {
      toast({ variant: "destructive", title: t("oversizedImport.openInAppFailed") });
    }
  }, [original, pageId, t]);

  const downloadOriginal = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDownloading(true);
    try {
      // The stored upload of a file opened with its password is plain: the
      // page's export writes it encrypted.
      if (original && !(await pageIsProtected(pageId))) await downloadStoredOriginal(original);
      // The download a reader asks for here is the file as it is: a Word file's
      // tracked changes stay in it, as Word's own save keeps them.
      else await downloadPageExport({ pageId, format, ...(format === "docx" ? { revisionPolicy: "preserve" as const } : {}) });
    } catch {
      toast({
        variant: "destructive",
        title: t("oversizedImport.downloadFailed"),
      });
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  }, [format, original, pageId, t]);

  return (
    <div
      role="status"
      data-testid={`${testIdPrefix}-oversized-import-notice`}
      className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <Lock aria-hidden size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title ?? t("oversizedImport.title")}</p>
        <p>{body}</p>
        {details}
      </div>
      <button
        type="button"
        onClick={() => void downloadOriginal()}
        disabled={downloading}
        data-testid={`${testIdPrefix}-oversized-import-download`}
        // Reading the original changes nothing: the read-only shield lets it through.
        data-collaboration-readonly-allowed="true"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
      >
        <Download aria-hidden size={14} />
        {downloading
          ? t("oversizedImport.downloading")
          : t("oversizedImport.download")}
      </button>
      {desktopOpen ? (
        <button
          type="button"
          onClick={() => void openInApp()}
          data-testid={`${testIdPrefix}-oversized-import-open-in-app`}
          data-collaboration-readonly-allowed="true"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-sm font-medium text-amber-950 hover:bg-amber-100"
        >
          <ExternalLink aria-hidden size={14} />
          {t("oversizedImport.openInApp")}
        </button>
      ) : null}
    </div>
  );
});
