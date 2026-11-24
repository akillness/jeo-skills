"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useCallback, useRef, useState } from "react";
import { useTranslations } from "../../../../../host/next-intl";
import { Download, ExternalLink, FileText } from "../../../office-ribbon/icons/houseIcons";

import { toast } from "../../../../hooks/use-toast";
import {
  canOpenOriginalInDesktopApp,
  downloadStoredOriginal,
  openStoredOriginalInDesktopApp,
} from "../../../../lib/document-import/storedOriginal";
import { formatFileSize } from "../../../../lib/errors/upload-failure";
import { pageIsProtected } from "../../../../lib/office/office-encryption";
import type { OversizedImportPreview } from "../../../../lib/office/oversized-import";

/**
 * A page that holds an imported file and none of its content: the file was
 * too large to open here, of a kind no page is made from, or unreadable. It
 * names the file, says why, and offers the original, as a file shared in a
 * cloud drive offers it when no preview exists.
 */
export const OriginalFileCard = memo(function OriginalFileCard({
  pageId,
  preview,
}: {
  pageId?: string;
  preview: OversizedImportPreview;
}) {
  const t = useTranslations("console-notebooks");
  const original = preview.original;
  const [downloading, setDownloading] = useState(false);
  const inFlight = useRef(false);
  const desktopOpen = original ? canOpenOriginalInDesktopApp() : false;

  const download = useCallback(async () => {
    if (!original || inFlight.current) return;
    inFlight.current = true;
    setDownloading(true);
    try {
      // The stored upload of a file opened with its password is plain, and
      // this page has no export to write it encrypted.
      if (pageId && (await pageIsProtected(pageId))) {
        toast({ variant: "destructive", title: t("officeEncryption.exportRefused") });
        return;
      }
      await downloadStoredOriginal(original);
    } catch {
      toast({ variant: "destructive", title: t("oversizedImport.downloadFailed") });
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  }, [original, pageId, t]);

  const openInApp = useCallback(async () => {
    if (!original) return;
    try {
      if (pageId && (await pageIsProtected(pageId))) {
        toast({ variant: "destructive", title: t("officeEncryption.exportRefused") });
        return;
      }
      await openStoredOriginalInDesktopApp(original);
    } catch {
      toast({ variant: "destructive", title: t("oversizedImport.openInAppFailed") });
    }
  }, [original, pageId, t]);

  const encryptionReason = preview.reason?.startsWith("encrypted:") ? preview.reason.slice("encrypted:".length) : null;
  const reasonKey =
    preview.reason === "not_convertible"
      ? "originalFile.reasonNotConvertible"
      : encryptionReason !== null
        ? "originalFile.reasonEncrypted"
      : preview.reason === "unreadable"
        ? "originalFile.reasonUnreadable"
        : preview.reason === "workspace_full"
          ? "originalFile.reasonWorkspaceFull"
          : "originalFile.reasonTooLarge";

  return (
    <section
      data-testid="original-file-card"
      aria-label={t("originalFile.label")}
      className="mx-auto my-8 flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border border-[color:var(--console-border,#e5e7eb)] bg-[color:var(--console-surface,#fff)] px-6 py-8 text-center"
    >
      <FileText aria-hidden size={40} className="text-[color:var(--console-text-muted,#6b7280)]" />
      <div className="min-w-0 space-y-1">
        <p className="break-all text-base font-semibold text-[color:var(--console-text-primary,#111827)]">
          {original?.filename ?? t("originalFile.unnamed")}
        </p>
        {original ? (
          <p className="text-sm tabular-nums text-[color:var(--console-text-muted,#6b7280)]">
            {formatFileSize(original.sizeBytes)}
          </p>
        ) : null}
      </div>
      <p className="max-w-md text-sm text-[color:var(--console-text-secondary,#4b5563)]">{t(reasonKey, { reason: encryptionReason ?? "" })}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void download()}
          disabled={!original || downloading}
          data-testid="original-file-download"
          // Reading the original changes nothing: the read-only shield lets it through.
          data-collaboration-readonly-allowed="true"
          className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--console-accent,#2563eb)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          <Download aria-hidden size={14} />
          {downloading ? t("oversizedImport.downloading") : t("oversizedImport.download")}
        </button>
        {desktopOpen ? (
          <button
            type="button"
            onClick={() => void openInApp()}
            data-testid="original-file-open-in-app"
            data-collaboration-readonly-allowed="true"
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--console-border,#d1d5db)] px-3 py-1.5 text-sm font-medium text-[color:var(--console-text-primary,#111827)] hover:bg-[color:var(--console-accent-tint-soft,#f3f4f6)]"
          >
            <ExternalLink aria-hidden size={14} />
            {t("oversizedImport.openInApp")}
          </button>
        ) : null}
      </div>
    </section>
  );
});
