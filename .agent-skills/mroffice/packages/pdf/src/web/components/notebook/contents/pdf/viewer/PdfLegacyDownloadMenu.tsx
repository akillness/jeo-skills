"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  PDF_READER_DOWNLOAD_CURRENT_COMMAND,
  PDF_READER_DOWNLOAD_ORIGINAL_COMMAND,
} from "./readerCommands";
import { Download } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type {
  RedactionHydrationStatus,
  VisualMaskHydrationStatus,
} from "./outputAuthority";
import type {
  PdfCommandInvocation,
  ResolvedPdfFeatureCommand,
} from "../commandRegistry";
import type { PdfRuntimeFeatureDecision } from "../capabilityAdapter";
import type {
  FeatureCommandResult,
} from "@mrnote/core/web/components/office-ribbon/featureCommandRegistry.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import homeStyles from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.module.css";
import { PDF_RIBBON_TOOL_CLASS, PdfRibbonToolButton } from "../PdfRibbonButton";

export interface PdfLegacyDownloadMenuProps {
  filename: string | undefined;
  downloadUrl: string | undefined;
  onDownload: (() => boolean | void | Promise<boolean | void>) | undefined;
  preferAnnotatedDownload: boolean | undefined;
  annotatedDownloadEnabled: boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  redactionHydrationStatusForCurrentDocument: RedactionHydrationStatus;
  shapesHydrationStatusForCurrentDocument: VisualMaskHydrationStatus;
  executeReaderCommand: (invocation: PdfCommandInvocation, decision: PdfRuntimeFeatureDecision) => Promise<FeatureCommandResult>;
  originalDownloadRuntimeDecision: PdfRuntimeFeatureDecision;
  currentDownloadRuntimeDecision: PdfRuntimeFeatureDecision;
  originalDownloadCommand: ResolvedPdfFeatureCommand;
  currentDownloadCommand: ResolvedPdfFeatureCommand;
}

export function PdfLegacyDownloadMenu({
  filename,
  downloadUrl,
  onDownload,
  preferAnnotatedDownload,
  annotatedDownloadEnabled,
  t,
  redactionHydrationStatusForCurrentDocument,
  shapesHydrationStatusForCurrentDocument,
  executeReaderCommand,
  originalDownloadRuntimeDecision,
  currentDownloadRuntimeDecision,
  originalDownloadCommand,
  currentDownloadCommand,
}: PdfLegacyDownloadMenuProps) {
  return (
    (downloadUrl || onDownload) &&
    preferAnnotatedDownload &&
    annotatedDownloadEnabled ? (
     <>
       <PdfRibbonToolButton
         icon={<Download size={14} />}
         title={
           currentDownloadCommand.enabled
             ? t("pdfViewer.downloadAnnotated")
             : (currentDownloadCommand.reasonLabel ??
               t("pdfViewer.downloadAnnotated"))
         }
         aria-label={t("pdfViewer.downloadAnnotated")}
         onClick={() =>
           void executeReaderCommand(
             PDF_READER_DOWNLOAD_CURRENT_COMMAND,
             currentDownloadRuntimeDecision,
           )
         }
         disabled={!currentDownloadCommand.enabled}
         data-testid="pdf-download-current"
         data-capability-id={
           PDF_READER_DOWNLOAD_CURRENT_COMMAND.featureId
         }
         data-output-disposition={currentDownloadCommand.disposition}
         data-disabled-reason={
           currentDownloadCommand.reasonKey ?? undefined
         }
       >
         {t("pdfViewer.downloadAnnotated")}
       </PdfRibbonToolButton>
       {shapesHydrationStatusForCurrentDocument !== "ready" ||
       redactionHydrationStatusForCurrentDocument !== "ready" ? (
         <PdfRibbonToolButton
           icon={<Download size={14} />}
           onClick={() =>
             void executeReaderCommand(
               PDF_READER_DOWNLOAD_ORIGINAL_COMMAND,
               originalDownloadRuntimeDecision,
             )
           }
           disabled={!originalDownloadCommand.enabled}
           title={
             originalDownloadCommand.enabled
               ? t("references.download")
               : (originalDownloadCommand.reasonLabel ??
                 t("references.download"))
           }
           aria-label={t("references.download")}
           data-testid="pdf-download-original"
           data-capability-id={
             PDF_READER_DOWNLOAD_ORIGINAL_COMMAND.featureId
           }
           data-output-disposition={
             originalDownloadCommand.disposition
           }
           data-disabled-reason={
             originalDownloadCommand.reasonKey ?? undefined
           }
         >
           {t("references.download")}
         </PdfRibbonToolButton>
       ) : null}
     </>
    ) : onDownload ? (
     <PdfRibbonToolButton
       data-testid="pdf-download-source"
       icon={<Download size={14} />}
       onClick={() =>
         void executeReaderCommand(
           PDF_READER_DOWNLOAD_ORIGINAL_COMMAND,
           originalDownloadRuntimeDecision,
         )
       }
       disabled={!originalDownloadCommand.enabled}
       title={
         originalDownloadCommand.enabled
           ? t("references.download")
           : (originalDownloadCommand.reasonLabel ??
             t("references.download"))
       }
       aria-label={t("references.download")}
       data-capability-id={
         PDF_READER_DOWNLOAD_ORIGINAL_COMMAND.featureId
       }
       data-output-disposition={originalDownloadCommand.disposition}
       data-disabled-reason={
         originalDownloadCommand.reasonKey ?? undefined
       }
     >
       {t("references.download")}
     </PdfRibbonToolButton>
    ) : downloadUrl ? (
     <a
       className={PDF_RIBBON_TOOL_CLASS}
       href={downloadUrl}
       download={filename}
       title={
         originalDownloadCommand.enabled
           ? t("references.download")
           : (originalDownloadCommand.reasonLabel ??
             t("references.download"))
       }
       aria-label={t("references.download")}
       aria-disabled={!originalDownloadCommand.enabled}
       onClick={(event) => {
         event.preventDefault();
         void executeReaderCommand(
           PDF_READER_DOWNLOAD_ORIGINAL_COMMAND,
           originalDownloadRuntimeDecision,
         );
       }}
       data-capability-id={
         PDF_READER_DOWNLOAD_ORIGINAL_COMMAND.featureId
       }
       data-output-disposition={originalDownloadCommand.disposition}
       data-disabled-reason={
         originalDownloadCommand.reasonKey ?? undefined
       }
     >
       <span className={homeStyles.commandGlyph} aria-hidden="true">
         <Download size={14} />
       </span>
       <span className={homeStyles.commandLabel}>{t("references.download")}</span>
     </a>
    ) : null
  );
}
