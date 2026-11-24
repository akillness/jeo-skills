/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfRibbonTranslator } from "../pdfRibbonTranslator";
import { PDF_SELECTION_TRANSLATION_MAX_CHARS } from "./outputLimits";

export function resolvePdfSelectionTranslationDisabledReason({
  t,
  loading,
  loadingReason,
  rasterOutputAuthorityBlocked,
  sourceRiskReady,
  ocrSourceReady,
  ocrHydrationReady,
  pageReady,
  selectedText,
  translationWorking,
}: {
  t: PdfRibbonTranslator;
  loading: boolean;
  loadingReason: string;
  rasterOutputAuthorityBlocked: boolean;
  sourceRiskReady: boolean;
  ocrSourceReady: boolean;
  ocrHydrationReady: boolean;
  pageReady: boolean;
  selectedText: string | null | undefined;
  translationWorking: boolean;
}): string | undefined {
  if (loading) return loadingReason;
  if (rasterOutputAuthorityBlocked) {
    return t("pdf.viewer.translationOutputNotReady");
  }
  if (!sourceRiskReady) {
    return t("pdf.viewer.translationSourceNotReady");
  }
  if (!ocrSourceReady) {
    return t("pdf.viewer.translationOcrNotReady");
  }
  if (!ocrHydrationReady) {
    return t("pdf.viewer.translationOcrLoading");
  }
  if (!pageReady) {
    return t("pdf.viewer.translationPageNotReady");
  }
  const normalizedSelection = selectedText?.trim() ?? "";
  if (!normalizedSelection) {
    return t("pdf.viewer.translationSelectFirst");
  }
  if (normalizedSelection.length > PDF_SELECTION_TRANSLATION_MAX_CHARS) {
    return t("pdf.viewer.translationSelectionTooLong", {
      max: PDF_SELECTION_TRANSLATION_MAX_CHARS,
    });
  }
  if (translationWorking) {
    return t("pdf.viewer.translationInProgress");
  }
  return undefined;
}

export function resolvePdfCommandDisabledReason(
  disabled: boolean,
  ...reasons: Array<string | null | undefined>
): string | undefined {
  if (!disabled) return undefined;
  for (const reason of reasons) {
    const normalized = reason?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}
