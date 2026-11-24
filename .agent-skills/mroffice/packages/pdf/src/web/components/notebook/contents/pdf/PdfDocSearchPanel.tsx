"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, type KeyboardEvent, type Ref } from "react";
import { Loader2 } from "lucide-react";
import { SquareDashed } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { PdfDocSearchResult } from "@mrnote/core/web/lib/pdf/doc-search.ts";

import { PDF_TASK_PANE_BODY_CLASS, pdfTaskPaneClassName } from "./pdfTaskPaneDock";

const DOC_SEARCH_TARGET_CLASS =
  "min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const DOC_SEARCH_LABEL_TARGET_CLASS =
  "min-h-11 min-w-11 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1";

export interface PdfDocSearchPanelProps {
  /**
   * All matches across the whole document (from `collectMatches`), in document
   * order. Indexes line up 1:1 with the parent's flat match list, so clicking
   * row `i` activates match `i`.
   */
  results: PdfDocSearchResult[];
  /** Total hit count (may exceed `results.length` if the panel cap clipped it). */
  total: number;
  /** True when the scan stopped at its window and more matches exist past
   * `total`; the count then says so instead of presenting `total` as all. */
  truncated?: boolean;
  /** Index of the currently-active match (highlighted row), or -1. */
  activeIndex: number;
  /**
   * Maps a result's zero-based `pageIndex` (into the visible-page array) to the
   * 1-based page NUMBER shown in the row label. The parent owns the visible-page
   * order, so it supplies the mapping.
   */
  pageNumberForIndex: (pageIndex: number) => number | null;
  /** True once a search has run for the current term (controls empty state). */
  ready?: boolean;
  /** Invoked with the result's flat index when a row is clicked. */
  onSelect: (index: number) => void;
  /** Closes only the results panel; the compact find bar may remain open. */
  onClose?: () => void;
  /** Disables interaction (e.g. while the document is still loading). */
  disabled?: boolean;

  // ---- Search-and-redact review mode (all optional / additive) ------------
  /**
   * Shows the "redact all matches" affordance. Only supplied when the host can
   * persist `pdf_redactions` (a data-item-backed document).
   */
  redactAvailable?: boolean;
  /** True while the panel shows the redact REVIEW list instead of result rows. */
  redactMode?: boolean;
  /** Enter (true) / leave (false) redact-review mode. */
  onToggleRedactMode?: (open: boolean) => void;
  /**
   * Per-row measurability: true when the match's page has a rendered text
   * layer so its glyph rects can be measured. Unmeasurable rows are grayed and
   * excluded from the confirm count — the honest "visit the page first" state.
   */
  measurableForIndex?: (index: number) => boolean;
  /** Checked rows (flat match indices) in redact-review mode. */
  checkedIndices?: ReadonlySet<number>;
  /** Toggle one row's checkbox. */
  onToggleChecked?: (index: number) => void;
  /** Bulk-create redactions for the checked, measurable rows. */
  onConfirmRedact?: () => void;
  /** True while the bulk create is in flight (disables the review controls). */
  redactBusy?: boolean;
  

  term?: string;
  onTermChange?: (term: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}

/** One page-group of the redact review list (consecutive same-page rows). */
interface RedactReviewGroup {
  pageNumber: number | null;
  rows: Array<{ index: number; result: PdfDocSearchResult }>;
}

/**
 * Document-wide search RESULTS panel for the PDF viewer.
 *
 * The per-page find bar already steps through matches; this panel lists EVERY
 * match across the whole document (page number + a short, pre-sanitized context
 * snippet) so the reader can jump straight to any hit. Clicking a row asks the
 * parent to activate that match (reusing the find bar's focus/scroll path).
 *
 * It also hosts the SEARCH-AND-REDACT review flow: "redact all matches" flips
 * the same rows into a page-grouped checklist; confirming asks the parent to
 * measure every checked match's glyph rects (the find highlight-all geometry
 * path) and bulk-create `pdf_redactions`. Rows on pages whose text layer is
 * not rendered are grayed with an honest "visit this page first" note.
 *
 * Presentational only — all match collection / measurement / persistence lives
 * in the parent PDFViewer and the pure `lib/pdf/doc-search.ts` helpers,
 * mirroring PdfOutlinePanel. Snippets arrive pre-sanitized and are always
 * rendered as React text nodes (never HTML).
 */
export default function PdfDocSearchPanel({
  results,
  total,
  truncated = false,
  activeIndex,
  pageNumberForIndex,
  ready,
  onSelect,
  onClose,
  disabled,
  redactAvailable,
  redactMode,
  onToggleRedactMode,
  measurableForIndex,
  checkedIndices,
  onToggleChecked,
  onConfirmRedact,
  redactBusy,
  term,
  onTermChange,
  inputRef,
}: PdfDocSearchPanelProps) {
  const t = useTranslations("console-notebooks");
  const resultListRef = useRef<HTMLUListElement | null>(null);

  // The list is capped (see SNIPPET_MAX_RESULTS) but `total` is the true,
  // uncapped hit count. When the list was clipped, show the honest total plus a
  // "showing first N" note so the count never silently exceeds the listed rows.
  const shown = results.length;
  const isCapped = total > shown;

  const inRedactReview = redactMode === true;

  const handleResultKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      onClose();
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (index + 1) % results.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (index - 1 + results.length) % results.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = results.length - 1;
    }
    if (nextIndex == null || nextIndex < 0) return;
    event.preventDefault();
    onSelect(nextIndex);
    const buttons = resultListRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-pdf-search-result-index]",
    );
    buttons?.[nextIndex]?.focus();
  };

  // Group consecutive same-page rows (results arrive in document order, so
  // consecutive grouping IS page grouping) for the review list's page headers.
  const reviewGroups = useMemo((): RedactReviewGroup[] => {
    if (!inRedactReview) return [];
    const groups: RedactReviewGroup[] = [];
    results.forEach((result, index) => {
      const pageNumber = pageNumberForIndex(result.pageIndex);
      const last = groups[groups.length - 1];
      if (last && last.pageNumber === pageNumber) {
        last.rows.push({ index, result });
      } else {
        groups.push({ pageNumber, rows: [{ index, result }] });
      }
    });
    return groups;
  }, [inRedactReview, pageNumberForIndex, results]);

  // Only checked AND measurable rows actually redact on confirm.
  const confirmCount = useMemo(() => {
    if (!inRedactReview || !checkedIndices) return 0;
    let count = 0;
    for (const index of checkedIndices) {
      if (index < 0 || index >= results.length) continue;
      if (measurableForIndex && !measurableForIndex(index)) continue;
      count += 1;
    }
    return count;
  }, [checkedIndices, inRedactReview, measurableForIndex, results.length]);

  return (
    <OfficeTaskPane
      title={
        inRedactReview
          ? t("pdfRedact.searchReviewTitle")
          : t("pdfViewer.docSearchPanel")
      }
      closeLabel={t("common.close")}
      onClose={() => {
        if (!redactBusy) onClose?.();
      }}
      hideClose={!onClose}
      closeDisabled={redactBusy}
      closeClassName={DOC_SEARCH_TARGET_CLASS}
      closeTestId="pdf-docsearch-close"
      testIdPrefix="pdf-docsearch"
      testId="pdf-docsearch"
      dockRight={false}
      className={pdfTaskPaneClassName("pdf-viewer__docsearch")}
      onKeyDown={(event) => {
        // A redaction write in flight: Escape neither closes the pane nor
        // reaches the reader (which would leave the review mid-write).
        if (event.key !== "Escape" || !redactBusy) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      headerActions={
        <>
          <span
            className="pdf-viewer__docsearch-count"
            data-testid="pdf-docsearch-count"
          >
            {truncated
              ? t("pdfViewer.docSearchHitsMore", { shown })
              : isCapped
                ? t("pdfViewer.docSearchHitsCapped", { total, shown })
                : t("pdfViewer.docSearchHits", { total })}
          </span>
          {redactAvailable && !inRedactReview && results.length > 0 ? (
            <button
              type="button"
              className={`${parts.compactButton} pdf-viewer__docsearch-redact-all ${DOC_SEARCH_TARGET_CLASS}`}
              onClick={() => onToggleRedactMode?.(true)}
              disabled={disabled}
              title={t("pdfRedact.searchAll")}
              data-testid="pdf-docsearch-redact-all"
            >
              <SquareDashed size={13} />
              <span>{t("pdfRedact.searchAll")}</span>
            </button>
          ) : null}
        </>
      }
    >
      <div className={PDF_TASK_PANE_BODY_CLASS}>
        {onTermChange && !inRedactReview ? (
          <input
            ref={inputRef}
            type="search"
            className={`${parts.field} pdf-viewer__docsearch-input`}
            data-testid="pdf-docsearch-input"
            value={term ?? ""}
            placeholder={t("pdfViewer.findPlaceholder")}
            aria-label={t("pdfViewer.findPlaceholder")}
            disabled={disabled}
            onChange={(event) => onTermChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results.length > 0) {
                event.preventDefault();
                onSelect(Math.max(0, Math.min(results.length - 1, activeIndex + (event.shiftKey ? -1 : 1))));
              } else if (event.key === "Escape" && onClose) {
                event.preventDefault();
                onClose();
              }
            }}
          />
        ) : null}
        {results.length === 0 ? (
          <p
            className="pdf-viewer__docsearch-empty"
            data-testid="pdf-docsearch-empty"
          >
            {ready
              ? t("pdfViewer.docSearchEmpty")
              : t("pdfViewer.docSearchPrompt")}
          </p>
        ) : inRedactReview ? (
          <div
            className="pdf-viewer__docsearch-redact-review"
            data-testid="pdf-docsearch-redact-review"
          >
            <ul className="pdf-viewer__docsearch-list">
              {reviewGroups.map((group) => (
                <li
                  key={`page-${group.pageNumber ?? "x"}-${group.rows[0]?.index ?? 0}`}
                  className="pdf-viewer__docsearch-redact-group"
                >
                  <em
                    className="pdf-viewer__docsearch-page"
                    data-testid="pdf-docsearch-redact-group-page"
                  >
                    {group.pageNumber != null
                      ? t("pdfViewer.docSearchResultPage", {
                          page: group.pageNumber,
                        })
                      : ""}
                  </em>
                  <ul>
                    {group.rows.map(({ index, result }) => {
                      const measurable = measurableForIndex
                        ? measurableForIndex(index)
                        : true;
                      const checked = checkedIndices?.has(index) === true;
                      return (
                        <li
                          key={`${result.pageIndex}-${result.start}-${result.end}`}
                          className="pdf-viewer__docsearch-item"
                        >
                          <label
                            className={`pdf-viewer__docsearch-redact-row ${DOC_SEARCH_LABEL_TARGET_CLASS}${
                              measurable ? "" : " is-unmeasured"
                            }`}
                            data-testid="pdf-docsearch-redact-row"
                            data-measurable={measurable ? "true" : "false"}
                            title={
                              measurable
                                ? undefined
                                : t("pdfRedact.searchUnmeasured")
                            }
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled || redactBusy || !measurable}
                              onChange={() => onToggleChecked?.(index)}
                              data-testid="pdf-docsearch-redact-check"
                            />
                            {/* Snippet is pre-sanitized; rendered as a TEXT node. */}
                            <span className="pdf-viewer__docsearch-snippet">
                              {result.snippet}
                            </span>
                            {measurable ? null : (
                              <span className="pdf-viewer__docsearch-redact-hint">
                                {t("pdfRedact.searchUnmeasured")}
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="pdf-viewer__docsearch-redact-actions">
              <button
                type="button"
                className={`${parts.primaryButton} office-dialog__button--compact pdf-viewer__docsearch-redact-confirm ${DOC_SEARCH_TARGET_CLASS}`}
                onClick={() => onConfirmRedact?.()}
                disabled={disabled || redactBusy || confirmCount === 0}
                data-testid="pdf-docsearch-redact-confirm"
              >
                {redactBusy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <SquareDashed size={13} />
                )}
                <span>{t("pdfRedact.searchConfirm", { count: confirmCount })}</span>
              </button>
              <button
                type="button"
                className={`${parts.compactButton} pdf-viewer__docsearch-redact-cancel ${DOC_SEARCH_TARGET_CLASS}`}
                onClick={() => onToggleRedactMode?.(false)}
                disabled={redactBusy}
                data-testid="pdf-docsearch-redact-cancel"
              >
                {t("pdfRedact.searchCancel")}
              </button>
            </div>
          </div>
        ) : (
          <ul ref={resultListRef} className="pdf-viewer__docsearch-list">
            {results.map((result, index) => {
              const pageNumber = pageNumberForIndex(result.pageIndex);
              const isActive = index === activeIndex;
              return (
                <li
                  key={`${result.pageIndex}-${result.start}-${result.end}`}
                  className="pdf-viewer__docsearch-item"
                >
                  <button
                    type="button"
                    className={`pdf-viewer__docsearch-result ${DOC_SEARCH_TARGET_CLASS}${
                      isActive ? " is-active" : ""
                    }`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => onSelect(index)}
                    onKeyDown={(event) => handleResultKeyDown(event, index)}
                    disabled={disabled}
                    data-pdf-search-result-index={index}
                    data-testid="pdf-docsearch-result"
                  >
                    <em className="pdf-viewer__docsearch-page">
                      {pageNumber != null
                        ? t("pdfViewer.docSearchResultPage", { page: pageNumber })
                        : ""}
                    </em>
                    {/* Snippet is pre-sanitized; rendered as a TEXT node. */}
                    <span className="pdf-viewer__docsearch-snippet">
                      {result.snippet}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OfficeTaskPane>
  );
}
