"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Replace,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { officeDialogClassName } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { officeFindPaneClassNames } from "@mrnote/core/web/components/office-ribbon/OfficeFindPane.tsx";
import { isImeKeydown } from "@mrnote/core/web/lib/soft-keyboard.ts";

const FIND_TARGET_CLASS =
  "min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const FIND_INPUT_CLASS =
  `pdf-viewer__find-input note-editor-find-replace__input ${FIND_TARGET_CLASS}`;

export interface PdfFindBarProps {
  /** Current search term in the input. */
  term: string;
  /** One-based position of the active match (0 when none active). */
  position: number;
  /** Total number of matches for the current term. */
  total: number;
  /** True when more matches exist than `total` counts (the scan stopped at
   * its window), so the count reads "total+". */
  truncated?: boolean;
  /** Matches left out because they stand in a layer that is switched off. */
  hiddenLayerMatches?: number;
  /** Whether the case-sensitivity toggle is on. */
  caseSensitive: boolean;
  /** Whether the whole-word toggle is on. */
  wholeWord?: boolean;
  /** Whether 区分重音 (Match diacritics) is on: Å finds Å, never A. */
  matchDiacritics?: boolean;
  /** Disables the input (e.g. while the document is still loading). */
  disabled?: boolean;
  onTermChange: (term: string) => void;
  onToggleCaseSensitive: () => void;
  /** Toggle whole-word matching (omit to hide the toggle button). */
  onToggleWholeWord?: () => void;
  /** Toggle 区分重音 (omit to hide the toggle button; user audit PDF 0038). */
  onToggleMatchDiacritics?: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  /** Re-run the search (used by Enter when there are no matches yet). */
  onSubmit: () => void;
  /** Whether the document-wide results panel is currently open. */
  resultsOpen?: boolean;
  /** Toggle the document-wide results panel (omit to hide the toggle button). */
  onToggleResults?: () => void;
  // ---- Replace (editable text only) -------------------------------------
  /**
   * Current replacement string. Supplying `onReplaceChange` enables the
   * replace affordance (a toggle button); the replace row itself is shown when
   * {@link replaceVisible} is true. Omit all replace props to keep the bar
   * find-only (the read-only viewer does this).
   */
  replaceValue?: string;
  onReplaceChange?: (value: string) => void;
  /** Whether the replace input row is expanded. */
  replaceVisible?: boolean;
  /** Toggle the replace input row open/closed. */
  onToggleReplace?: () => void;
  /** Replace the currently-active match, then advance. */
  onReplaceOne?: () => void;
  /** Replace every match across the document's editable text. */
  onReplaceAll?: () => void;
  /**
   * True while a whole-document replace is walking pages. Both replace buttons
   * are held down for the duration so a second sweep cannot start on top of the
   * first, and the status line below reports progress.
   */
  replaceBusy?: boolean;
  /** Progress / result line under the replace row (scanning page N, N replaced). */
  replaceStatus?: string | null;
}

/**
 * Presentational find bar for the PDF viewer's in-document text search.
 *
 * All match bookkeeping lives in the parent (which owns the pdf.js text content
 * and the pure `lib/pdf/text-search` helpers); this component is intentionally
 * stateless so it can be unit-tested without the pdf.js stack. The forwarded
 * ref lets the parent focus the input when Ctrl/Cmd+F opens the bar.
 */
const PdfFindBar = forwardRef<HTMLInputElement, PdfFindBarProps>(
  function PdfFindBar(
    {
      term,
      position,
      total,
      truncated = false,
      hiddenLayerMatches = 0,
      caseSensitive,
      wholeWord,
      matchDiacritics = false,
      disabled,
      onTermChange,
      onToggleCaseSensitive,
      onToggleWholeWord,
      onToggleMatchDiacritics,
      onNext,
      onPrev,
      onClose,
      onSubmit,
      resultsOpen,
      onToggleResults,
      replaceValue,
      onReplaceChange,
      replaceVisible,
      onToggleReplace,
      onReplaceOne,
      onReplaceAll,
      replaceBusy,
      replaceStatus,
    },
    ref,
  ) {
    const t = useTranslations("console-notebooks");
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const hasMatches = total > 0;
    const trimmed = term.trim();
    // The replace affordance exists only when the host wires a change handler
    // (i.e. the surface has an editable text-box model). The read-only viewer
    // omits it, so the bar renders exactly as before.
    const replaceEnabled = typeof onReplaceChange === "function";

    useLayoutEffect(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) returnFocusRef.current = active;
    }, []);

    const requestClose = useCallback(() => {
      const returnTarget = returnFocusRef.current;
      onClose();
      if (returnTarget?.isConnected) returnTarget.focus();
    }, [onClose]);

    // The Docs find bar (DocumentFindReplace): its card in the PDF tone of
    // the dialog chrome, a search row (framed field, count, previous / next,
    // close), an options row, and the replace panel under a chevron toggle
    // that turns as the panel opens. The bar keeps its own place over the
    // pages (.pdf-viewer__find-bar).
    const iconButton = (active?: boolean) =>
      `note-editor-find-replace__button ${FIND_TARGET_CLASS}${
        active ? " is-active" : ""
      }`;
    return (
      <div
        className={`pdf-viewer__find-bar note-editor-find-replace ${officeDialogClassName(
          { tone: "pdf" },
        )} office-pop-in${
          replaceEnabled ? " pdf-viewer__find-bar--with-replace" : ""
        }`}
        role="search"
        aria-label={t("pdfViewer.findBarLabel")}
        data-testid="pdf-find-bar"
        // A press in the find bar is not a press away from the selected
        // text box (user audit PDF 0067).
        data-pdf-object-selection-retain="true"
      >
        <div className="pdf-viewer__find-row note-editor-find-replace__search-row">
          <div className="note-editor-find-replace__field">
            <Search size={15} aria-hidden />
            <input
              ref={ref}
              type="text"
              // a touch keyboard: a Search key, no auto-capitals or
              
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={FIND_INPUT_CLASS}
              value={term}
              onChange={(e) => onTermChange(e.target.value)}
              onKeyDown={(e) => {
                // Ignore the Enter that confirms a CJK IME candidate so a search
                // isn't run on a half-composed term.
                if (e.key === "Enter" && !isImeKeydown(e)) {
                  e.preventDefault();
                  if (!hasMatches) {
                    onSubmit();
                  } else if (e.shiftKey) {
                    onPrev();
                  } else {
                    onNext();
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  requestClose();
                }
              }}
              placeholder={t("pdfViewer.findPlaceholder")}
              aria-label={t("pdfViewer.findPlaceholder")}
              disabled={disabled}
              data-testid="pdf-find-input"
            />
          </div>
          <span
            className={
              "pdf-viewer__find-count note-editor-find-replace__count " +
              "inline-flex min-h-11 items-center justify-center"
            }
            aria-live="polite"
            data-testid="pdf-find-count"
          >
            {trimmed === ""
              ? ""
              : !hasMatches
                ? t("pdfViewer.findNoMatches")
                : t("pdfViewer.findMatchOf", {
                    current: position,
                    total: truncated ? `${total}+` : total,
                  })}
          </span>
          <button
            type="button"
            className={iconButton()}
            onClick={onPrev}
            disabled={!hasMatches}
            title={t("pdfViewer.findPrev")}
            aria-label={t("pdfViewer.findPrev")}
            data-testid="pdf-find-prev"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className={iconButton()}
            onClick={onNext}
            disabled={!hasMatches}
            title={t("pdfViewer.findNext")}
            aria-label={t("pdfViewer.findNext")}
            data-testid="pdf-find-next"
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            className={iconButton()}
            onClick={requestClose}
            title={t("pdfViewer.findClose")}
            aria-label={t("pdfViewer.findClose")}
            data-testid="pdf-find-close"
          >
            <X size={16} />
          </button>
        </div>
        {/* Its own line under the search row: beside the count it took the
            row's width and squeezed the field to nothing, so the query could
            be neither read nor clicked (user audit PDF 0037). */}
        {trimmed !== "" && hiddenLayerMatches > 0 ? (
          <p
            className="pdf-viewer__find-hidden-note"
            role="status"
            data-testid="pdf-find-hidden-layer-matches"
          >
            {t("pdfViewer.findHiddenLayerMatches", {
              count: hiddenLayerMatches,
            })}
          </p>
        ) : null}
        <div
          className="note-editor-find-replace__options"
          role="group"
          aria-label={t("pdfViewer.findBarLabel")}
        >
          <button
            type="button"
            className={iconButton(caseSensitive)}
            onClick={onToggleCaseSensitive}
            aria-pressed={caseSensitive}
            title={t("pdfViewer.findCaseSensitive")}
            aria-label={t("pdfViewer.findCaseSensitive")}
            data-testid="pdf-find-case"
          >
            <CaseSensitive size={16} />
          </button>
          {onToggleWholeWord ? (
            <button
              type="button"
              className={iconButton(wholeWord)}
              onClick={onToggleWholeWord}
              aria-pressed={Boolean(wholeWord)}
              title={t("pdfViewer.findWholeWord")}
              aria-label={t("pdfViewer.findWholeWord")}
              data-testid="pdf-find-whole-word"
            >
              <WholeWord size={16} />
            </button>
          ) : null}
          {onToggleMatchDiacritics ? (
            <button
              type="button"
              className={iconButton(matchDiacritics)}
              onClick={onToggleMatchDiacritics}
              aria-pressed={matchDiacritics}
              title={t("pdfViewer.findMatchDiacritics")}
              aria-label={t("pdfViewer.findMatchDiacritics")}
              data-testid="pdf-find-diacritics"
            >
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1, fontWeight: 600 }}>
                Á
              </span>
            </button>
          ) : null}
          {onToggleResults ? (
            <button
              type="button"
              className={iconButton(resultsOpen)}
              onClick={onToggleResults}
              aria-pressed={resultsOpen}
              title={t("pdfViewer.findResultsToggle")}
              aria-label={t("pdfViewer.findResultsToggle")}
              data-testid="pdf-find-results-toggle"
            >
              <ListOrdered size={16} />
            </button>
          ) : null}
          {replaceEnabled ? (
            <button
              type="button"
              className={
                "note-editor-find-replace__action pdf-viewer__find-replace-toggle " +
                `${FIND_TARGET_CLASS}${replaceVisible ? " is-active" : ""}`
              }
              onClick={onToggleReplace}
              aria-pressed={Boolean(replaceVisible)}
              aria-expanded={Boolean(replaceVisible)}
              title={t("pdfViewer.replaceToggle")}
              aria-label={t("pdfViewer.replaceToggle")}
              data-testid="pdf-find-replace-toggle"
            >
              <Replace size={16} aria-hidden />
              <ChevronDown
                size={14}
                aria-hidden
                className="pdf-viewer__find-replace-chevron"
              />
            </button>
          ) : null}
        </div>
        {replaceEnabled && replaceVisible ? (
          <div className="pdf-viewer__find-replace-row note-editor-find-replace__replace-panel">
            <div className="note-editor-find-replace__replace-actions">
              <div className="note-editor-find-replace__field">
                <Replace size={15} aria-hidden />
                <input
                  type="text"
                  className={FIND_INPUT_CLASS}
                  value={replaceValue ?? ""}
                  onChange={(e) => onReplaceChange?.(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isImeKeydown(e)) {
                      e.preventDefault();
                      // Enter in the replace field replaces the active match
                      // (or all, with Shift) over the editable text. Skipped
                      // while an IME candidate is being confirmed.
                      if (e.shiftKey) {
                        onReplaceAll?.();
                      } else {
                        onReplaceOne?.();
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      requestClose();
                    }
                  }}
                  placeholder={t("pdfViewer.replacePlaceholder")}
                  aria-label={t("pdfViewer.replacePlaceholder")}
                  disabled={disabled}
                  data-testid="pdf-find-replace-input"
                />
              </div>
              {/* Labelled actions, as the Docs find pane's 替换 / 全部替换
                  are, not two icon-only buttons (audit F5). */}
              <button
                type="button"
                className={`${officeFindPaneClassNames.action} ${FIND_TARGET_CLASS}`}
                onClick={onReplaceOne}
                disabled={!hasMatches || replaceBusy}
                title={t("pdfViewer.replaceOne")}
                data-testid="pdf-find-replace-one"
              >
                <Replace size={16} aria-hidden />
                <span>{t("pdfViewer.replaceOne")}</span>
              </button>
              <button
                type="button"
                className={`${officeFindPaneClassNames.action} ${FIND_TARGET_CLASS}`}
                onClick={onReplaceAll}
                // Replace-all reaches every page, so it stays available even
                // when THIS page has no match: the bar's count is page-local.
                disabled={replaceBusy || trimmed.length === 0}
                title={`${t("pdfViewer.replaceAll")} — ${t("pdfViewer.replaceAllHint")}`}
                data-testid="pdf-find-replace-all"
              >
                <ReplaceAll size={16} aria-hidden />
                <span>{t("pdfViewer.replaceAll")}</span>
              </button>
            </div>
            {replaceStatus ? (
              <div
                className={
                  "pdf-viewer__find-replace-status note-editor-find-replace__count " +
                  "inline-flex min-h-11 items-center"
                }
                role="status"
                aria-live="polite"
                data-testid="pdf-find-replace-status"
              >
                {replaceStatus}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);

export default PdfFindBar;
