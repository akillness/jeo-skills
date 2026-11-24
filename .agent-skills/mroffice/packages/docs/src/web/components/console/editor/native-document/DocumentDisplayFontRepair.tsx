"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback } from "react";
import { RotateCw } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { SpreadsheetFontRepair } from "@mrnote/sheets/web/components/notebook/contents/spreadsheet/SpreadsheetFontRepair.tsx";
import type { OfficeFontFace } from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import { notifyDocumentDisplayFontBindings, type DocumentDisplayFontNeed } from "@mrnote/core/web/components/console/editor/native-document/documentDisplayFonts.ts";

export function DocumentDisplayFontRepair({pageId, version, needs, enabled, ready = true, onRetry, failure}: {
  pageId: string; version: number; needs: readonly DocumentDisplayFontNeed[]; enabled: boolean; ready?: boolean; onRetry?: () => void; failure?: string;
}) {
  const t = useTranslations("console-notebooks");
  const scopeKey = `${pageId}:${version}`;
  const apply = useCallback((face: OfficeFontFace, sourceScope: string) => {
    if (!enabled || !ready || sourceScope !== scopeKey || !face.asset) return false;
    notifyDocumentDisplayFontBindings(pageId);
    return true;
  }, [enabled, ready, pageId, scopeKey]);
  if (!needs.length) return null;
  if (!ready && onRetry) {
    const label = t("document.displayFont.retry");
    return <button type="button" className="office-ribbon-control" data-testid="document-display-font-retry"
      data-font-failure={failure} disabled={!enabled} onClick={() => {if (enabled) onRetry();}}
      aria-label={label} title={t("document.displayFont.retryHint")}
      style={{width:28,minWidth:28,padding:4}}><RotateCw size={16} aria-hidden="true"/></button>;
  }
  return <SpreadsheetFontRepair pageId={pageId} scopeKey={scopeKey} needs={needs} partialStyles disabled={!enabled || !ready}
    disabledReason={t("document.displayFont.disabledReason")}
    onApply={apply} testId="document-display-font-repair" copy={{
      action: t("document.displayFont.action"),
      title: t("document.displayFont.title"),
      description: t("document.displayFont.description"),
      apply: t("document.displayFont.apply"),
      failure: t("document.displayFont.failure"),
    }}/>;
}
