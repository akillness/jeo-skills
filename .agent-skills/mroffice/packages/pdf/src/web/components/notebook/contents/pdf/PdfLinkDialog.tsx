"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  ExternalLink,
  FileText,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { buildLinkOverlayPayload } from "@mrnote/core/web/lib/pdf/links.ts";

export interface PdfLinkDraft {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  editingId: string | null;
  /** Exact third-party `/Link` object edited without creating a reader row. */
  editingSourceId?: string | null;
  url: string;
  goToPage: string;
}

export interface PdfLinkDialogLabels {
  title: string;
  urlLabel: string;
  urlPlaceholder: string;
  pageLabel: string;
  pagePlaceholder: string;
  save: string;
  cancel: string;
  remove: string;
}

interface PdfLinkDialogProps {
  draft: PdfLinkDraft;
  pageCount: number;
  busy?: boolean;
  error?: string | null;
  labels: PdfLinkDialogLabels;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onChange: (next: PdfLinkDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onSave: (destination: {
    url: string | null;
    goToPage: number | null;
  }) => void;
}

type DestinationKind = "url" | "page";

export default function PdfLinkDialog({
  draft,
  pageCount,
  busy = false,
  error = null,
  labels,
  returnFocusRef,
  onChange,
  onCancel,
  onDelete,
  onSave,
}: PdfLinkDialogProps) {
  const [destinationKind, setDestinationKind] = useState<DestinationKind>(() =>
    draft.goToPage.trim() ? "page" : "url",
  );
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const pageInputRef = useRef<HTMLInputElement | null>(null);
  const initialFocusRef =
    destinationKind === "url" ? urlInputRef : pageInputRef;

  useEffect(() => {
    const input = initialFocusRef.current;
    input?.focus();
    input?.select();
  }, [destinationKind, initialFocusRef]);

  const destination = useMemo(() => {
    const rawPage = Number.parseInt(draft.goToPage, 10);
    const goToPage =
      destinationKind === "page" &&
      Number.isInteger(rawPage) &&
      rawPage >= 1 &&
      rawPage <= pageCount
        ? rawPage
        : null;
    const candidate = buildLinkOverlayPayload({
      page: draft.page,
      x: draft.x,
      y: draft.y,
      width: draft.width,
      height: draft.height,
      url: destinationKind === "url" ? draft.url.trim() : null,
      goToPage,
    });
    return candidate
      ? { url: candidate.url, goToPage: candidate.goToPage }
      : null;
  }, [destinationKind, draft, pageCount]);

  const switchKind = (next: DestinationKind) => {
    if (busy) return;
    setDestinationKind(next);
    onChange({
      ...draft,
      url: next === "url" ? draft.url : "",
      goToPage: next === "page" ? draft.goToPage : "",
    });
  };

  return (
    <OfficeDialogShell
      open
      title={labels.title}
      description={`PDF · #${draft.page}`}
      defaultActionLabel={
        <span data-testid="pdf-link-save">{labels.save}</span>
      }
      cancelActionLabel={labels.cancel}
      onDefaultAction={() => {
        if (destination) onSave(destination);
      }}
      onCancel={onCancel}
      defaultActionDisabled={destination == null}
      busy={busy}
      busyActionLabel={<span data-testid="pdf-link-save">{labels.save}</span>}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[430px]"
      testIdPrefix="pdf-link"
    >
      <div className="grid gap-4" data-testid="pdf-link-editor">
        <div
          className={`${parts.tabs} grid grid-cols-2 gap-1`}
          role="tablist"
          aria-label={labels.title}
        >
          <button
            type="button"
            role="tab"
            aria-selected={destinationKind === "url"}
            className={`${parts.tab} inline-flex items-center justify-center gap-2`}
            disabled={busy}
            onClick={() => switchKind("url")}
          >
            <ExternalLink size={15} aria-hidden />
            <span>{labels.urlLabel}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={destinationKind === "page"}
            className={`${parts.tab} inline-flex items-center justify-center gap-2`}
            disabled={busy}
            onClick={() => switchKind("page")}
          >
            <FileText size={15} aria-hidden />
            <span>{labels.pageLabel}</span>
          </button>
        </div>

        {destinationKind === "url" ? (
          <label className={parts.field}>
            <span className={parts.label}>{labels.urlLabel}</span>
            <span className={parts.inputGroup}>
              <ExternalLink size={16} aria-hidden />
              <input
                ref={urlInputRef}
                type="url"
                inputMode="url"
                autoComplete="url"
                className="min-w-0 flex-1"
                data-testid="pdf-link-url-input"
                value={draft.url}
                placeholder={labels.urlPlaceholder}
                disabled={busy}
                onChange={(event) =>
                  onChange({ ...draft, url: event.target.value })
                }
              />
            </span>
          </label>
        ) : (
          <label className={parts.field}>
            <span className={parts.label}>{labels.pageLabel}</span>
            <span className={parts.inputGroup}>
              <FileText size={16} aria-hidden />
              <input
                ref={pageInputRef}
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, pageCount)}
                className="min-w-0 flex-1"
                data-testid="pdf-link-page-input"
                value={draft.goToPage}
                placeholder={labels.pagePlaceholder}
                disabled={busy}
                onChange={(event) =>
                  onChange({ ...draft, goToPage: event.target.value })
                }
              />
              <span className={`${parts.hint} shrink-0`}>
                / {Math.max(1, pageCount)}
              </span>
            </span>
          </label>
        )}

        {error ? (
          <p
            className={`${parts.message} m-0`}
            data-testid="pdf-link-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {(draft.editingId || draft.editingSourceId) && onDelete ? (
          <button
            type="button"
            className={`${parts.compactButton} inline-flex w-fit items-center justify-center gap-2`} data-tone="danger"
            data-testid="pdf-link-delete"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 size={15} aria-hidden />
            <span>{labels.remove}</span>
          </button>
        ) : null}
      </div>
    </OfficeDialogShell>
  );
}
