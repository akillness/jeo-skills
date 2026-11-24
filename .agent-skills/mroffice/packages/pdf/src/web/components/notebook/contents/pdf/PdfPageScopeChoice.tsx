"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type { PdfPageRotationScope } from "../../../../lib/pdf/page-rotation";

/** The pages a page command applies to (旋转页面, 页面涂黑): this page, all of
 * them, the odd or even ones, or a range typed. */
export const PDF_PAGE_SCOPES: ReadonlyArray<PdfPageRotationScope> = [
  "page",
  "all",
  "odd",
  "even",
  "range",
];

/** "第 1、2、3 页" — the pages a choice names, the first six of them. */
export function formatPdfPageScopePages(
  pages: ReadonlyArray<number>,
  t: ReturnType<typeof useTranslations>,
): string {
  if (pages.length === 0) return t("pdf.rotatePages.noPages");
  const preview = pages.slice(0, 6).join(", ");
  if (pages.length <= 6) {
    return t("pdf.rotatePages.pagesPreview", { preview });
  }
  return t("pdf.rotatePages.pagesPreviewTruncated", { preview });
}

export function PdfPageScopeChoice({
  scope,
  onScopeChange,
  rangeSpec,
  onRangeSpecChange,
  rangeInvalid,
  currentPage,
  totalPages,
  testIdPrefix,
}: {
  scope: PdfPageRotationScope;
  onScopeChange: (scope: PdfPageRotationScope) => void;
  rangeSpec: string;
  onRangeSpecChange: (rangeSpec: string) => void;
  rangeInvalid: boolean;
  currentPage: number;
  totalPages: number;
  /** "pdf-rotate" gives pdf-rotate-scope-page, pdf-rotate-pages-range, … */
  testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  const scopeLabel = (value: PdfPageRotationScope) => {
    if (value === "page") {
      return t("pdf.rotatePages.scopeCurrent", { page: currentPage });
    }
    if (value === "all") {
      return t("pdf.rotatePages.scopeAll", { count: totalPages });
    }
    if (value === "odd") return t("pdf.rotatePages.scopeOdd");
    if (value === "even") return t("pdf.rotatePages.scopeEven");
    return t("pdf.rotatePages.scopeRange");
  };
  const hintId = `${testIdPrefix}-pages-range-hint`;
  return (
    <div className="pdf-page-scope">
      <style>{`
        .pdf-page-scope {
          display: grid;
          gap: 8px;
        }
        .pdf-page-scope__label {
          color: var(--office-dialog-ink, #334155);
          font-size: 11.5px;
          font-weight: 700;
        }
        .pdf-page-scope__scopes {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .pdf-page-scope__scope {
          align-items: center;
          display: flex;
          font-weight: 650;
          gap: 8px;
          text-align: left;
        }
        .pdf-page-scope__scope::before {
          border: 1px solid var(--office-dialog-control-border-hover, #94a3b8);
          border-radius: 50%;
          content: "";
          height: 12px;
          width: 12px;
        }
        .pdf-page-scope__scope[aria-pressed="true"] {
          background: var(--office-dialog-accent-soft, #f0fdfa);
          border-color: var(--office-dialog-accent, #14b8a6);
          color: var(--office-dialog-ink, #0f766e);
        }
        .pdf-page-scope__scope[aria-pressed="true"]::before {
          background: var(--office-dialog-accent, #0d9488);
          border: 3px solid var(--office-dialog-accent-soft, #ccfbf1);
          box-shadow: 0 0 0 1px var(--office-dialog-accent, #0d9488);
          height: 8px;
          width: 8px;
        }
        .pdf-page-scope__scope[data-scope="range"] {
          grid-column: 1 / -1;
        }
        .pdf-page-scope__scope:focus-visible {
          outline: 3px solid rgba(13, 148, 136, 0.24);
          outline-offset: 2px;
        }
        .pdf-page-scope__range {
          display: grid;
          gap: 5px;
        }
        .pdf-page-scope__range small {
          color: var(--office-dialog-muted, #64748b);
          font-size: 10.5px;
        }
        .pdf-page-scope__range-error {
          color: var(--office-dialog-danger, #b91c1c) !important;
          font-weight: 650;
        }
      `}</style>
      <span className="pdf-page-scope__label">{t("pdf.rotatePages.applyTo")}</span>
      <div
        className="pdf-page-scope__scopes"
        role="group"
        aria-label={t("pdf.rotatePages.applyTo")}
      >
        {PDF_PAGE_SCOPES.map((value) => (
          <button
            key={value}
            type="button"
            className="office-dialog__choice pdf-page-scope__scope"
            aria-pressed={scope === value}
            data-scope={value}
            onClick={() => onScopeChange(value)}
            data-testid={`${testIdPrefix}-scope-${value}`}
          >
            {scopeLabel(value)}
          </button>
        ))}
      </div>
      {scope === "range" ? (
        <label className="pdf-page-scope__range">
          <span className="pdf-page-scope__label">{t("pdf.rotatePages.pageRange")}</span>
          <input
            type="text"
            inputMode="numeric"
            value={rangeSpec}
            onChange={(event) => onRangeSpecChange(event.target.value)}
            aria-invalid={rangeInvalid}
            aria-describedby={hintId}
            data-testid={`${testIdPrefix}-pages-range`}
            placeholder={t("pdf.rotatePages.rangeExample")}
          />
          <small
            id={hintId}
            className={rangeInvalid ? "pdf-page-scope__range-error" : undefined}
            role={rangeInvalid ? "alert" : undefined}
            data-testid={rangeInvalid ? `${testIdPrefix}-pages-range-error` : undefined}
          >
            {rangeInvalid ? t("pdf.rotatePages.rangeInvalid") : t("pdf.rotatePages.rangeHint")}
          </small>
        </label>
      ) : null}
    </div>
  );
}
