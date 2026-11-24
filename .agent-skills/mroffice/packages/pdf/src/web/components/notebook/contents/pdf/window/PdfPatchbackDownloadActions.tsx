"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Loader2 } from "lucide-react";
import PdfRibbonButton from "../PdfRibbonButton";
import { Download } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type {
  PdfCommandInvocation,
  ResolvedPdfFeatureCommand,
} from "../commandRegistry";
import type {
  PdfRuntimeFeatureDecision,
} from "../capabilityAdapter";
import type {
  FeatureCommandResult,
} from "@mrnote/core/web/components/office-ribbon/featureCommandRegistry.ts";
import type { PdfFeatureCapability } from "../../../../../lib/pdf/feature-capabilities";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfPatchbackDownloadActionsProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  serverExporting: boolean;
  hasNativePdfDownloadEdits: boolean;
  canDownloadNativePdfPatchback: boolean;
  canDownloadConsentBoundCurrentPdf: boolean;
  executeEditorCommand: (invocation: PdfCommandInvocation, decision: PdfRuntimeFeatureDecision) => Promise<FeatureCommandResult>;
  workspaceDownloadInvocation: { readonly featureId: "PDF-FIL-DOC-03"; readonly action: "download-current"; } | { readonly featureId: "PDF-FIL-DOC-03"; readonly action: "download-native"; } | { readonly featureId: "PDF-FIL-DOC-03"; readonly action: "download-original"; };
  workspaceDownloadRuntimeDecision: PdfRuntimeFeatureDecision;
  workspaceDownloadCommand: ResolvedPdfFeatureCommand | { capability: PdfFeatureCapability | null; bound: boolean; enabled: boolean; disposition: "blocked"; reasonKey: string; reasonLabel: null; };
  workspaceDownloadReasonLabel: string | null;
  /** AutoSave on, while a save or a revision read in leaves the window's
   * state settling: 下载 stays the native download, enabled, and its press
   * waits for the state to settle (busy) before it downloads. */
  waitOnClick?: (() => void) | null;
}

export function PdfPatchbackDownloadActions({
  t,
  serverExporting,
  hasNativePdfDownloadEdits,
  canDownloadNativePdfPatchback,
  canDownloadConsentBoundCurrentPdf,
  executeEditorCommand,
  workspaceDownloadInvocation,
  workspaceDownloadRuntimeDecision,
  workspaceDownloadCommand,
  workspaceDownloadReasonLabel,
  waitOnClick,
}: PdfPatchbackDownloadActionsProps) {
  // The visible title carries the human reason; data-disabled-reason keeps
  // the reason key the hosts and tests read.
  const titled = (label: string) =>
    workspaceDownloadCommand.enabled || waitOnClick || !workspaceDownloadReasonLabel
      ? label
      : `${label} — ${workspaceDownloadReasonLabel}`;
  const reasonKey = waitOnClick ? undefined : workspaceDownloadCommand.reasonKey ?? undefined;
  const run = waitOnClick ?? (() =>
    void executeEditorCommand(
      workspaceDownloadInvocation,
      workspaceDownloadRuntimeDecision,
    ));
  const shared = {
    "data-pdf-file-action-order": "03",
    "data-capability-id": workspaceDownloadInvocation.featureId,
    "data-output-disposition": workspaceDownloadCommand.disposition,
  } as const;
  return (
    canDownloadNativePdfPatchback || waitOnClick ? (
      <PdfRibbonButton
        {...shared}
        data-disabled-reason={reasonKey}
        disabled={waitOnClick ? serverExporting : !workspaceDownloadCommand.enabled}
        displayLabel={
          serverExporting
            ? t("pdfViewer.downloadAnnotatedInflight")
            : t("references.download")
        }
        label={titled(t("references.download"))}
        onClick={run}
        testId="pdf-page-download-native"
      >
        {serverExporting ? (
          <Loader2 size={24} className="animate-spin" aria-hidden />
        ) : (
          <Download size={24} aria-hidden />
        )}
      </PdfRibbonButton>
    ) : canDownloadConsentBoundCurrentPdf ? (
      <PdfRibbonButton
        {...shared}
        data-disabled-reason={reasonKey}
        disabled={!workspaceDownloadCommand.enabled}
        displayLabel={t("references.download")}
        label={titled(t("pdfViewer.downloadAnnotated"))}
        onClick={run}
        testId="pdf-page-download-current"
      >
        <Download size={24} aria-hidden />
      </PdfRibbonButton>
    ) : hasNativePdfDownloadEdits ? (
      <PdfRibbonButton
        {...shared}
        data-disabled-reason={reasonKey}
        disabled
        displayLabel={t("references.download")}
        label={t("pdf.downloadEditedUnavailable")}
        onClick={() => undefined}
        testId="pdf-page-download-unavailable"
      >
        <Download size={24} aria-hidden />
      </PdfRibbonButton>
    ) : (
      <PdfRibbonButton
        {...shared}
        data-disabled-reason={reasonKey}
        disabled={!workspaceDownloadCommand.enabled}
        label={titled(t("references.download"))}
        onClick={run}
        testId="pdf-page-export-pdf"
      >
        <Download size={24} aria-hidden />
      </PdfRibbonButton>
    )
  );
}
