"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  AlertTriangle,
  FileText,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { ResolvedPageItem } from "@mrnote/core/web/lib/pdf/page-ops.ts";
import { pagesToLabel, validateRangeSpec } from "../../../../lib/pdf/range-spec";

export type PdfDeletePagesScope = "page" | "range";

export interface PdfDeletePagesSelection {
  /** Original PDF page ids persisted by the native patchback model. */
  pages: number[];
  /** Inserted pages (by id) among the pages named: they are removed. */
  insertedIds: string[];
  /** Current visible page ordinals shown to the user after prior deletions. */
  displayPages: number[];
  availablePageCount: number;
  remainingPageCount: number;
  error: "empty" | "out-of-range" | "last-page" | null;
  /** The typed token naming a page that does not exist (out-of-range). */
  invalidToken?: string;
}







type VisibleSlot =
  | { kind: "original"; page: number }
  | { kind: "inserted"; id: string };

function visibleSlots(
  totalPages: number,
  deletedPages: ReadonlyArray<number>,
  visibleItems: ReadonlyArray<ResolvedPageItem> | undefined,
): VisibleSlot[] {
  if (visibleItems) {
    return visibleItems.map((item) =>
      item.kind === "original"
        ? { kind: "original", page: item.page }
        : { kind: "inserted", id: item.page.id },
    );
  }
  return availableOriginalPages(totalPages, deletedPages).map((page) => ({
    kind: "original",
    page,
  }));
}

function availableOriginalPages(
  totalPages: number,
  deletedPages: ReadonlyArray<number>,
): number[] {
  const deleted = new Set(
    deletedPages.filter(
      (page) => Number.isInteger(page) && page >= 1 && page <= totalPages,
    ),
  );
  return Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) => !deleted.has(page),
  );
}

/** The slot of the page shown: the inserted page the reader stands on,
 * else the current original page. */
function currentSlotIndex(
  slots: ReadonlyArray<VisibleSlot>,
  currentPage: number,
  currentInsertedPageId: string | null | undefined,
): number {
  const inserted = currentInsertedPageId
    ? slots.findIndex(
        (slot) => slot.kind === "inserted" && slot.id === currentInsertedPageId,
      )
    : -1;
  return inserted >= 0
    ? inserted
    : slots.findIndex(
        (slot) => slot.kind === "original" && slot.page === currentPage,
      );
}

function visiblePageOrdinal(
  currentPage: number,
  totalPages: number,
  deletedPages: ReadonlyArray<number>,
  visibleItems?: ReadonlyArray<ResolvedPageItem>,
  currentInsertedPageId?: string | null,
): number {
  const slots = visibleSlots(totalPages, deletedPages, visibleItems);
  const index = currentSlotIndex(slots, currentPage, currentInsertedPageId);
  return index >= 0 ? index + 1 : 1;
}

export function resolvePdfDeletePagesSelection(options: {
  scope: PdfDeletePagesScope;
  currentPage: number;
  totalPages: number;
  rangeSpec?: string;
  deletedPages?: ReadonlyArray<number>;
  visibleItems?: ReadonlyArray<ResolvedPageItem>;
  /** The inserted page the reader stands on, when it is one. */
  currentInsertedPageId?: string | null;
}): PdfDeletePagesSelection {
  const totalPages =
    Number.isInteger(options.totalPages) && options.totalPages > 0
      ? options.totalPages
      : 0;
  const slots = visibleSlots(
    totalPages,
    options.deletedPages ?? [],
    options.visibleItems,
  );
  const availablePageCount = slots.length;
  const currentIndex = currentSlotIndex(
    slots,
    options.currentPage,
    options.currentInsertedPageId,
  );
  // A destructive command deletes exactly the pages the user named: page 0
  // or a page past the end is refused, never clamped onto page 1 / the
  
  const rangeReading =
    options.scope === "range"
      ? validateRangeSpec(options.rangeSpec ?? "", availablePageCount)
      : null;
  if (rangeReading?.issue?.kind === "out-of-range") {
    return {
      pages: [],
      insertedIds: [],
      displayPages: [],
      availablePageCount,
      remainingPageCount: availablePageCount,
      error: "out-of-range",
      invalidToken: rangeReading.issue.token,
    };
  }
  const displayPages = rangeReading
    ? rangeReading.pages
    : currentIndex >= 0
      ? [currentIndex + 1]
      : [];
  const selectedSlots = displayPages
    .map((page) => slots[page - 1])
    .filter((slot): slot is VisibleSlot => slot != null);
  // An inserted blank named here is removed; its neighbour is never
  // deleted in its place (user audit PDF 0008).
  const pages = selectedSlots.flatMap((slot) =>
    slot.kind === "original" ? [slot.page] : [],
  );
  const insertedIds = selectedSlots.flatMap((slot) =>
    slot.kind === "inserted" ? [slot.id] : [],
  );
  const remainingPageCount =
    availablePageCount - pages.length - insertedIds.length;
  const remainingOriginalCount =
    slots.filter((slot) => slot.kind === "original").length - pages.length;

  if (pages.length === 0 && insertedIds.length === 0) {
    return {
      pages: [],
      insertedIds: [],
      displayPages: [],
      availablePageCount,
      remainingPageCount: availablePageCount,
      error: "empty",
    };
  }
  // The PDF keeps at least one of its own pages.
  if (remainingPageCount < 1 || (pages.length > 0 && remainingOriginalCount < 1)) {
    return {
      pages,
      insertedIds,
      displayPages,
      availablePageCount,
      remainingPageCount,
      error: "last-page",
    };
  }
  return {
    pages,
    insertedIds,
    displayPages,
    availablePageCount,
    remainingPageCount,
    error: null,
  };
}

export interface PdfDeletePagesDialogProps {
  open: boolean;
  currentPage: number;
  totalPages: number;
  deletedPages?: ReadonlyArray<number>;
  /** The visible page sequence (originals in order plus inserted blanks). */
  visibleItems?: ReadonlyArray<ResolvedPageItem>;
  /** The inserted page the reader stands on, when it is one. */
  currentInsertedPageId?: string | null;
  onConfirm: (pages: number[], insertedIds: string[]) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function PdfDeletePagesDialog({
  open,
  currentPage,
  totalPages,
  deletedPages = [],
  visibleItems,
  currentInsertedPageId = null,
  onConfirm,
  onCancel,
  returnFocusRef,
}: PdfDeletePagesDialogProps) {
  const t = useTranslations("console-notebooks");
  const commonT = useTranslations("common");
  const [scope, setScope] = useState<PdfDeletePagesScope>("page");
  const [rangeSpec, setRangeSpec] = useState(() =>
    String(
      visiblePageOrdinal(
        currentPage,
        totalPages,
        deletedPages,
        visibleItems,
        currentInsertedPageId,
      ),
    ),
  );
  const confirmInFlightRef = useRef(false);
  useEffect(() => {
    if (open) confirmInFlightRef.current = false;
  }, [open]);

  const selection = useMemo(
    () =>
      resolvePdfDeletePagesSelection({
        scope,
        currentPage,
        totalPages,
        rangeSpec,
        deletedPages,
        visibleItems,
        currentInsertedPageId,
      }),
    [
      currentInsertedPageId,
      currentPage,
      deletedPages,
      rangeSpec,
      scope,
      totalPages,
      visibleItems,
    ],
  );
  const selectedLabel = pagesToLabel(selection.displayPages);
  const lastPageMessage = t("pdf.deletePages.lastPage");
  const outOfRangeMessage = t("pdf.deletePages.outOfRange", {
    token: selection.invalidToken ?? "",
    count: selection.availablePageCount,
  });
  const selectionSummary = t("pdf.deletePages.selectionSummary", {
    count: selection.pages.length + selection.insertedIds.length,
    remaining: Math.max(0, selection.remainingPageCount),
  });
  const confirm = () => {
    if (selection.error !== null || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    onConfirm(selection.pages, selection.insertedIds);
  };

  return (
    <OfficeDialogShell
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          <span className={`${parts.message} inline-flex w-8 items-center justify-center`} data-tone="error">
            <Trash2 size={17} aria-hidden />
          </span>
          {t("pdfPageOps.delete")}
        </span>
      }
      description={t("pdf.deletePageConfirm")}
      defaultActionLabel={
        <span className="inline-flex items-center gap-1.5">
          <Trash2 size={14} aria-hidden />
          {commonT("button.confirm")}
        </span>
      }
      cancelActionLabel={commonT("button.cancel")}
      onDefaultAction={confirm}
      onCancel={onCancel}
      defaultActionDisabled={selection.error !== null}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[440px]"
      testIdPrefix="pdf-delete-pages"
    >
      <style>{`
        .pdf-delete-pages-dialog__body {
          display: grid;
          gap: 15px;
        }
        .pdf-delete-pages-dialog__field {
          display: grid;
          gap: 6px;
        }
        .pdf-delete-pages-dialog__field label {
          color: var(--office-dialog-ink, #334155);
          font-size: 11.5px;
          font-weight: 650;
        }
        .pdf-delete-pages-dialog__selection {
          align-items: center;
          background: var(--office-dialog-surface-muted, #f8fafc);
          border: 1px solid var(--office-dialog-divider, #e2e8f0);
          border-radius: 9px;
          display: grid;
          gap: 3px 10px;
          grid-template-columns: 32px minmax(0, 1fr);
          padding: 11px 12px;
        }
        .pdf-delete-pages-dialog__selection svg {
          color: var(--office-dialog-accent, #0f766e);
          grid-row: 1 / span 2;
        }
        .pdf-delete-pages-dialog__selection strong {
          font-size: 12px;
          line-height: 1.35;
        }
        .pdf-delete-pages-dialog__selection span {
          color: var(--office-dialog-muted, #64748b);
          font-size: 11px;
        }
        .pdf-delete-pages-dialog__error {
          align-items: center;
          background: var(--office-dialog-warning-soft, #fff7ed);
          border: 1px solid var(--office-dialog-warning-line, #fed7aa);
          border-radius: 8px;
          color: var(--office-dialog-warning, #9a3412);
          display: flex;
          font-size: 11.5px;
          gap: 7px;
          line-height: 1.4;
          padding: 9px 10px;
        }
      `}</style>
      <div className="pdf-delete-pages-dialog__body">
        <div
          className="office-dialog__tabs pdf-delete-pages-dialog__scope"
          role="group"
          aria-label={t("pdf.crop.scopeLabel")}
        >
          <button
            type="button"
            className="office-dialog__tab"
            aria-pressed={scope === "page"}
            onClick={() => setScope("page")}
            data-testid="pdf-delete-scope-page"
          >
            {t("pdf.crop.scopePage")}
          </button>
          <button
            type="button"
            className="office-dialog__tab"
            aria-pressed={scope === "range"}
            onClick={() => setScope("range")}
            data-testid="pdf-delete-scope-range"
          >
            {t("pdf.crop.scopeRange")}
          </button>
        </div>

        {scope === "range" ? (
          <div className="pdf-delete-pages-dialog__field">
            <label htmlFor="pdf-delete-pages-range">
              {t("pdf.crop.scopeRange")}
            </label>
            <input
              id="pdf-delete-pages-range"
              type="text"
              inputMode="text"
              autoComplete="off"
              value={rangeSpec}
              onChange={(event) => setRangeSpec(event.target.value)}
              placeholder={t("pdf.crop.scopeRangePlaceholder")}
              aria-invalid={selection.error !== null}
              data-testid="pdf-delete-pages-range"
            />
          </div>
        ) : null}

        <div
          className="pdf-delete-pages-dialog__selection"
          data-testid="pdf-delete-pages-selection"
        >
          <FileText size={18} aria-hidden />
          <strong>
            {t("pdfPageOps.deletePage", {
              page: selectedLabel || (scope === "range" ? "—" : currentPage),
            })}
          </strong>
          <span>{selectionSummary}</span>
        </div>

        {selection.error ? (
          <div
            className="pdf-delete-pages-dialog__error"
            role="alert"
            data-testid="pdf-delete-pages-error"
          >
            <AlertTriangle size={15} aria-hidden />
            <span>
              {selection.error === "last-page"
                ? lastPageMessage
                : selection.error === "out-of-range"
                  ? outOfRangeMessage
                  : t("pdfViewer.exportImageRangeEmpty")}
            </span>
          </div>
        ) : null}
      </div>
    </OfficeDialogShell>
  );
}
