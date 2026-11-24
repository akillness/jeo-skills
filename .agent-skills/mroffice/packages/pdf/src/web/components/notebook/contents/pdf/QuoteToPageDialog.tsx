"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Plus,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { apiGet, apiPost } from "@mrnote/core/web/lib/api.ts";
import { dispatchNotebookPagesChanged } from "@mrnote/core/web/lib/notebook-events.ts";

interface QuoteToPageDialogProps {
  open: boolean;
  notebookId: string;
  text: string;
  pageNumber: number | null;
  documentTitle?: string;
  onClose: () => void;
  onQuoted?: (pageId: string) => void;
}

interface NotebookPageItem {
  id: string;
  title: string;
  page_type?: string;
}

export default function QuoteToPageDialog({
  open,
  notebookId,
  text,
  pageNumber,
  documentTitle,
  onClose,
  onQuoted,
}: QuoteToPageDialogProps) {
  const t = useTranslations("console-notebooks");
  const [pages, setPages] = useState<NotebookPageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: NotebookPageItem[] }>(
        `/api/v1/notebooks/${notebookId}/pages?limit=100`,
      );
      setPages(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("references.loadFailed"));
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [notebookId, t]);

  useEffect(() => {
    if (!open) return;
    setSuccess(null);
    setSubmitting(null);
    void loadPages();
  }, [loadPages, open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 600);
  }, [onClose]);

  const buildQuoteBlock = useCallback(() => {
    const attribution = documentTitle
      ? pageNumber
        ? `${documentTitle} · p.${pageNumber}`
        : documentTitle
      : "";
    const blockquoteContent = [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ];
    if (attribution) {
      blockquoteContent.push({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `— ${attribution}`,
          },
        ],
      });
    }
    return {
      type: "blockquote",
      content: blockquoteContent,
    };
  }, [documentTitle, pageNumber, text]);

  const handlePick = useCallback(
    async (pageId: string) => {
      if (submitting) return;
      setSubmitting(pageId);
      setError(null);
      try {
        await apiPost(`/api/v1/pages/${pageId}/blocks`, {
          block_type: "quote",
          content_json: buildQuoteBlock(),
        });
        setSuccess(pageId);
        onQuoted?.(pageId);
        // Keep the success state visible briefly while every mutation path
        // remains locked against duplicate dispatch.
        scheduleClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("references.saveFailed"),
        );
      } finally {
        setSubmitting(null);
      }
    },
    [buildQuoteBlock, onQuoted, scheduleClose, submitting, t],
  );

  const handleCreateAndQuote = useCallback(async () => {
    if (submitting) return;
    setSubmitting("__new");
    setError(null);
    try {
      const newPage = await apiPost<{ id: string; title: string }>(
        `/api/v1/notebooks/${notebookId}/pages`,
        {
          title: documentTitle
            ? `${documentTitle}${pageNumber ? ` · p.${pageNumber}` : ""}`
            : t("pdfSelection.newPageTitle"),
          page_type: "document",
        },
      );
      await apiPost(`/api/v1/pages/${newPage.id}/blocks`, {
        block_type: "quote",
        content_json: buildQuoteBlock(),
      });
      setSuccess(newPage.id);
      // Notify the sidebar/page list so the newly created page appears without
      // a manual refresh (mirrors CreatePageMenu / FileWindow).
      dispatchNotebookPagesChanged(notebookId);
      onQuoted?.(newPage.id);
      scheduleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("references.saveFailed"));
    } finally {
      setSubmitting(null);
    }
  }, [
    buildQuoteBlock,
    documentTitle,
    notebookId,
    onQuoted,
    pageNumber,
    scheduleClose,
    submitting,
    t,
  ]);

  if (!open) return null;

  const interactionLocked = submitting !== null || success !== null;

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdfSelection.quoteDialogTitle")}
      description={t("pdfSelection.quoteDialogHint")}
      defaultActionLabel={
        <span className="inline-flex items-center gap-2">
          <Plus size={14} aria-hidden />
          {t("pdfSelection.createNewPageAndQuote")}
        </span>
      }
      busyActionLabel={
        <span className="inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {t("common.saving")}
        </span>
      }
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={() => void handleCreateAndQuote()}
      onCancel={onClose}
      busy={interactionLocked}
      className="max-h-[calc(100vh-40px)] overflow-y-auto sm:max-w-[520px]"
      testIdPrefix="quote-to-page"
    >
      {error ? (
        <div className="quote-to-page-dialog__error">
          <AlertCircle size={14} />
          {error}
        </div>
      ) : null}

      <div className="quote-to-page-dialog__list">
        {loading ? (
          <div className="quote-to-page-dialog__empty">
            <EditorLoadingState
              kind="list"
              minimal
              label={t("common.loading")}
            />
          </div>
        ) : pages.length === 0 ? (
          <div className="quote-to-page-dialog__empty">
            <FileText size={20} strokeWidth={1.4} />
            <span>{t("pdfSelection.noPagesYet")}</span>
          </div>
        ) : (
          <ul>
            {pages.map((page) => {
              const pending = submitting === page.id;
              const ok = success === page.id;
              return (
                <li key={page.id}>
                  <button
                    type="button"
                    className="quote-to-page-dialog__item"
                    onClick={() => void handlePick(page.id)}
                    disabled={interactionLocked}
                    data-testid="quote-to-page-item"
                  >
                    <FileText size={14} />
                    <span>{page.title || t("common.untitled")}</span>
                    {pending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : ok ? (
                      <CheckCircle2 size={14} />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OfficeDialogShell>
  );
}
