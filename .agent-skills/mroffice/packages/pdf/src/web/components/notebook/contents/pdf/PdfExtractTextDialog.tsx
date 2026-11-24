"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  Check,
  FileText,
  ScanText,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useMemo, useRef, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  DEFAULT_PDF_TEXT_OUTPUT_OPTIONS,
  formatPdfExtractedText,
  type PdfTextOutputOptions,
  type PdfTextPageSeparator,
} from "../../../../lib/pdf/extract-text-output";
import { validateRangeSpec } from "../../../../lib/pdf/range-spec";

export interface PdfExtractedTextPage {
  readonly ordinal: number;
  readonly sourcePage: number | null;
  readonly text: string;
}

type PdfExtractTextScope = "current" | "all" | "range";

export interface PdfExtractTextSelection extends PdfTextOutputOptions {
  readonly ordinals: readonly number[];
}

const TEXT_PREVIEW_LIMIT = 6_000;

export default function PdfExtractTextDialog({
  open,
  pages,
  currentOrdinal,
  errorMessage,
  returnFocusRef,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly pages: readonly PdfExtractedTextPage[];
  readonly currentOrdinal: number;
  readonly locale: string;
  readonly errorMessage?: string | null;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onConfirm: (selection: PdfExtractTextSelection) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [scope, setScope] = useState<PdfExtractTextScope>("all");
  const [rangeSpec, setRangeSpec] = useState("");
  const [pageSeparator, setPageSeparator] = useState<PdfTextPageSeparator>(
    DEFAULT_PDF_TEXT_OUTPUT_OPTIONS.pageSeparator,
  );
  const [includePageLabels, setIncludePageLabels] = useState(
    DEFAULT_PDF_TEXT_OUTPUT_OPTIONS.includePageLabels,
  );
  const [utf8Bom, setUtf8Bom] = useState(
    DEFAULT_PDF_TEXT_OUTPUT_OPTIONS.utf8Bom,
  );
  const allScopeRef = useRef<HTMLInputElement | null>(null);
  const rangeInputRef = useRef<HTMLInputElement | null>(null);
  const seed = open ? pages : null;
  const [lastSeed, setLastSeed] = useState(seed);
  if (seed !== lastSeed) {
    setLastSeed(seed);
    if (seed !== null) {
      setScope("all");
      setRangeSpec("");
      setPageSeparator(DEFAULT_PDF_TEXT_OUTPUT_OPTIONS.pageSeparator);
      setIncludePageLabels(DEFAULT_PDF_TEXT_OUTPUT_OPTIONS.includePageLabels);
      setUtf8Bom(DEFAULT_PDF_TEXT_OUTPUT_OPTIONS.utf8Bom);
    }
  }

  const selectedOrdinals = useMemo(() => {
    if (pages.length === 0) return [];
    if (scope === "current") {
      return pages.some((page) => page.ordinal === currentOrdinal)
        ? [currentOrdinal]
        : [];
    }
    if (scope === "all") return pages.map((page) => page.ordinal);
    return validateRangeSpec(rangeSpec, pages.length).pages;
  }, [currentOrdinal, pages, rangeSpec, scope]);
  const selectedPages = useMemo(() => {
    const selected = new Set(selectedOrdinals);
    return pages.filter((page) => selected.has(page.ordinal));
  }, [pages, selectedOrdinals]);
  const selectedText = selectedPages.map((page) => page.text).join("\n\n");
  const outputOptions: PdfTextOutputOptions = {
    pageSeparator,
    includePageLabels,
    utf8Bom,
  };
  const formattedText = formatPdfExtractedText(
    selectedPages,
    outputOptions,
    (page) => t("pdf.extractText.pageLabel", { page }),
  );
  const fullPreview = formattedText
    .replace(/^\uFEFF/, "")
    .replace(/\n$/, "")
    .replaceAll("\f", "␌");
  const characterCount = fullPreview.length;
  const preview = fullPreview.slice(0, TEXT_PREVIEW_LIMIT);
  const previewTruncated = fullPreview.length > TEXT_PREVIEW_LIMIT;
  const rangeInvalid = scope === "range" && selectedOrdinals.length === 0;
  const canConfirm = selectedPages.length > 0 && selectedText.trim().length > 0;

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.extractText.title")}
      description={t("pdf.extractText.description")}
      defaultActionLabel={t("pdf.extractText.download")}
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={() =>
        onConfirm({
          ordinals: selectedOrdinals,
          ...outputOptions,
        })
      }
      onCancel={onCancel}
      defaultActionDisabled={!canConfirm}
      initialFocusRef={allScopeRef}
      returnFocusRef={returnFocusRef}
      className="max-h-[calc(100vh-48px)] overflow-y-auto sm:max-w-[680px]"
      testIdPrefix="pdf-extract-text"
    >
      <div
        className={`${parts.group} flex items-start gap-2 leading-relaxed`}
        role="note"
        data-testid="pdf-extract-text-source"
      >
        <ScanText className="mt-0.5 shrink-0" size={17} aria-hidden />
        <span>
          {t("pdf.extractText.source")}
        </span>
      </div>

      {errorMessage ? (
        <p
          className={`${parts.message} m-0`}
          role="alert"
          data-testid="pdf-extract-text-error"
        >
          {errorMessage}
        </p>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className={parts.sectionTitle}>
          {t("pdf.extractText.pageRange")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["current", t("pdf.extractText.scope.current")],
              ["all", t("pdf.extractText.scope.all")],
              ["range", t("pdf.extractText.scope.range")],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`${parts.check} inline-flex cursor-pointer min-h-11`}
            >
              <span className="relative size-4 shrink-0">
                <input
                    ref={value === "all" ? allScopeRef : undefined}
                    type="radio"
                    name="pdf-extract-text-scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    data-testid={`pdf-extract-text-scope-${value}`}
                  className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
                />
                <span
                  aria-hidden
                  className={`${parts.mark} pointer-events-none absolute inset-0 inline-flex size-4 items-center justify-center`}
                  data-shape="radio"
                />
              </span>
              <span>{label}</span>
            </label>
          ))}
        </div>
        {scope === "range" ? (
          <label className={parts.field}>
            <span className={parts.label}>{t("pdf.extractText.range")}</span>
            <input
              ref={rangeInputRef}
              type="text"
              inputMode="numeric"
              value={rangeSpec}
              onChange={(event) => setRangeSpec(event.target.value)}
              placeholder="1-3, 5"
              aria-invalid={rangeInvalid || undefined}
              data-testid="pdf-extract-text-range"
            />
            {rangeInvalid ? (
              <span className={parts.error} role="alert">
                {t("pdf.extractText.rangeInvalid")}
              </span>
            ) : null}
          </label>
        ) : null}
      </fieldset>

      <fieldset className={`${parts.group} grid gap-2`}>
        <legend className={parts.sectionTitle}>
          {t("pdf.extractText.output")}
        </legend>
        <label className={parts.field}>
          <span className={parts.label}>{t("pdf.extractText.separatorLabel")}</span>
          <select
            value={pageSeparator}
            onChange={(event) =>
              setPageSeparator(event.target.value as PdfTextPageSeparator)
            }
            data-testid="pdf-extract-text-page-separator"
          >
            <option value="blank-line">{t("pdf.extractText.separator.blankLine")}</option>
            <option value="form-feed">
              {t("pdf.extractText.separator.formFeed")}
            </option>
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${parts.check} inline-flex min-h-11`}>
            <span className="relative size-4 shrink-0">
              <input
                  type="checkbox"
                  checked={includePageLabels}
                  onChange={(event) => setIncludePageLabels(event.target.checked)}
                  data-testid="pdf-extract-text-page-labels"
                className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
              />
              <span
                aria-hidden
                className={`${parts.mark} pointer-events-none absolute inset-0 size-4`}
              />
              <Check
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2"
              />
            </span>
            {t("pdf.extractText.pageLabels")}
          </label>
          <label className={`${parts.check} inline-flex min-h-11`}>
            <span className="relative size-4 shrink-0">
              <input
                  type="checkbox"
                  checked={utf8Bom}
                  onChange={(event) => setUtf8Bom(event.target.checked)}
                  data-testid="pdf-extract-text-utf8-bom"
                className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
              />
              <span
                aria-hidden
                className={`${parts.mark} pointer-events-none absolute inset-0 size-4`}
              />
              <Check
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2"
              />
            </span>
            {t("pdf.extractText.utf8Bom")}
          </label>
        </div>
        {pageSeparator === "form-feed" ? (
          <p className={`${parts.hint} m-0`} role="note">
            {t("pdf.extractText.formFeedHint")}
          </p>
        ) : null}
      </fieldset>

      <div className={`${parts.hint} flex items-center justify-between gap-3`}>
        <span>
          {t("pdf.extractText.pageCount", { count: selectedPages.length })}
        </span>
        <span data-testid="pdf-extract-text-character-count">
          {t("pdf.extractText.characterCount", { count: characterCount })}
        </span>
      </div>

      <div className={parts.well}>
        <div className={`${parts.sectionTitle} flex min-h-10 items-center gap-2 px-3`}>
          <FileText size={15} aria-hidden />
          {t("pdf.extractText.preview")}
        </div>
        <pre
          className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words p-3 font-sans text-xs leading-relaxed"
          data-testid="pdf-extract-text-preview"
        >
          {preview || t("pdf.extractText.empty")}
        </pre>
        {previewTruncated ? (
          <p
            className={`${parts.hint} m-0 px-3 py-2`}
            data-testid="pdf-extract-text-preview-truncated"
          >
            {t("pdf.extractText.truncated")}
          </p>
        ) : null}
      </div>
    </OfficeDialogShell>
  );
}
