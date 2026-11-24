/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  EmbeddedImageOverlayMutationPlan,
  EmbeddedImageTargetIdentity,
} from "@/lib/pdf/embedded-image-apply";
import type { EmbeddedImageEdit } from "@/lib/pdf/embedded-image-edits";
import type {
  PageBackgroundConfig,
  PageBackgroundMutationPlan,
} from "@/lib/pdf/page-background";
import type {
  ManagedPdfTextMarkup,
} from "@mrnote/core/web/lib/pdf/native-text-markup-writeback.ts";
import {
  PDF_CROSS_TAB_COMMANDS,
  type PdfCommandInvocation,
  type PdfCrossTabCommandInvocation,
} from "../commandRegistry";
import {
  issuePdfSavePolicyConsentReceipt,
} from "../capabilityAdapter";
import {
  createPdfCommandConsentDocumentAuthority,
} from "../commandConsent";
import type {
  PdfOutputLossEntry,
  PdfEmbeddedImageOverlayPolicyContext,
  PdfPageBackgroundPolicyContext,
  PdfSavePolicyDecision,
  PdfSavePolicyRequest,
} from "../../../../../lib/pdf/save-policy";

/** Command invocations the page window issues through the PDF command contract. */

export type PdfNativeTextCommitDecision = Readonly<{
  enabled: boolean;
  reasonKey: string | null;
  reasonLabel: string | null;
}>;
export const PDF_EDITOR_SAVE_COMMAND = {
  featureId: "PDF-FIL-DOC-02",
  action: "save-current",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_DOWNLOAD_ORIGINAL_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-original",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_DOWNLOAD_CURRENT_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-current",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_DOWNLOAD_NATIVE_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-native",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_REPLACE_SOURCE_COMMAND = {
  featureId: "PDF-FIL-DOC-10",
  action: "replace-source",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_APPLY_BACKGROUND_COMMAND = {
  featureId: "PDF-INS-DECOR-04",
  action: "pdf.page.apply-background",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_REMOVE_BACKGROUND_COMMAND = {
  featureId: "PDF-INS-DECOR-04",
  action: "pdf.page.remove-background",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_APPLY_EMBEDDED_IMAGE_OVERLAY_COMMAND = {
  featureId: "PDF-EDT-IMAGE-02",
  action: "pdf.image.apply-overlay-edits",
} as const satisfies PdfCommandInvocation;
export const PDF_EDITOR_NATIVE_CROSS_TAB_COMMANDS = Object.freeze([
  PDF_CROSS_TAB_COMMANDS.taggedTextCommit,
  PDF_CROSS_TAB_COMMANDS.importPages,
  PDF_CROSS_TAB_COMMANDS.replacePage,
  PDF_CROSS_TAB_COMMANDS.insertBlank,
  PDF_CROSS_TAB_COMMANDS.deletePages,
  PDF_CROSS_TAB_COMMANDS.reorderPages,
  PDF_CROSS_TAB_COMMANDS.organizePages,
  PDF_CROSS_TAB_COMMANDS.rotatePages,
  PDF_CROSS_TAB_COMMANDS.cropPages,
  PDF_CROSS_TAB_COMMANDS.splitPages,
  PDF_CROSS_TAB_COMMANDS.pageBackgroundCommit,
  PDF_CROSS_TAB_COMMANDS.pageSize,
  PDF_CROSS_TAB_COMMANDS.pageLabelsCommit,
  PDF_CROSS_TAB_COMMANDS.freeTextCommit,
  PDF_CROSS_TAB_COMMANDS.contentAppendTextCommit,
  PDF_CROSS_TAB_COMMANDS.contentAppendImageCommit,
  PDF_CROSS_TAB_COMMANDS.contentAppendPathCommit,
  PDF_CROSS_TAB_COMMANDS.editContentCommit,
  PDF_CROSS_TAB_COMMANDS.formCreateCommit,
  PDF_CROSS_TAB_COMMANDS.formEditCommit,
  PDF_CROSS_TAB_COMMANDS.formDeleteCommit,
  PDF_CROSS_TAB_COMMANDS.undo,
  PDF_CROSS_TAB_COMMANDS.redo,
  PDF_CROSS_TAB_COMMANDS.highlightCommit,
  PDF_CROSS_TAB_COMMANDS.areaHighlightCommit,
  PDF_CROSS_TAB_COMMANDS.underlineCommit,
  PDF_CROSS_TAB_COMMANDS.strikeoutCommit,
  PDF_CROSS_TAB_COMMANDS.squigglyCommit,
  PDF_CROSS_TAB_COMMANDS.proofingCommit,
  PDF_CROSS_TAB_COMMANDS.noteCommit,
  PDF_CROSS_TAB_COMMANDS.commentBatchDelete,
  PDF_CROSS_TAB_COMMANDS.inkCommit,
  PDF_CROSS_TAB_COMMANDS.shapeCommit,
  PDF_CROSS_TAB_COMMANDS.tableCommit,
  PDF_CROSS_TAB_COMMANDS.chartCommit,
  PDF_CROSS_TAB_COMMANDS.stampCommit,
  PDF_CROSS_TAB_COMMANDS.fileAttachmentCommit,
  PDF_CROSS_TAB_COMMANDS.measureCommit,
  PDF_CROSS_TAB_COMMANDS.imageInsertCommit,
  PDF_CROSS_TAB_COMMANDS.imageOverlayCommit,
  PDF_CROSS_TAB_COMMANDS.embeddedImageRemoveCommit,
  PDF_CROSS_TAB_COMMANDS.embeddedImageReplaceCommit,
  PDF_CROSS_TAB_COMMANDS.embeddedImageTransformCommit,
  PDF_CROSS_TAB_COMMANDS.embeddedImageReorderCommit,
  PDF_CROSS_TAB_COMMANDS.textObjectDeleteCommit,
  PDF_CROSS_TAB_COMMANDS.textDecorationCommit,
  PDF_CROSS_TAB_COMMANDS.outlineCommit,
  PDF_CROSS_TAB_COMMANDS.linkCommit,
  PDF_CROSS_TAB_COMMANDS.linkEditCommit,
  PDF_CROSS_TAB_COMMANDS.vectorGeometryCommit,
  PDF_CROSS_TAB_COMMANDS.vectorDuplicateCommit,
  PDF_CROSS_TAB_COMMANDS.vectorReorderCommit,
  PDF_CROSS_TAB_COMMANDS.vectorStyleCommit,
  PDF_CROSS_TAB_COMMANDS.visualSignatureCommit,
  PDF_CROSS_TAB_COMMANDS.watermarkCommit,
  PDF_CROSS_TAB_COMMANDS.pageNumberCommit,
  PDF_CROSS_TAB_COMMANDS.headerFooterCommit,
]);

export interface PendingPdfCrossTabMutation {
  readonly invocation: PdfCrossTabCommandInvocation;
  readonly execute: () => Promise<boolean>;
}

export function managedTextMarkupCommitInvocation(
  subtype: ManagedPdfTextMarkup["subtype"],
): (typeof PDF_EDITOR_NATIVE_CROSS_TAB_COMMANDS)[number] {
  switch (subtype) {
    case "Highlight":
      return PDF_CROSS_TAB_COMMANDS.highlightCommit;
    case "Underline":
      return PDF_CROSS_TAB_COMMANDS.underlineCommit;
    case "StrikeOut":
      return PDF_CROSS_TAB_COMMANDS.strikeoutCommit;
    case "Squiggly":
      return PDF_CROSS_TAB_COMMANDS.squigglyCommit;
  }
}

export interface PendingPageBackgroundOutput {
  readonly invocation:
    | typeof PDF_EDITOR_APPLY_BACKGROUND_COMMAND
    | typeof PDF_EDITOR_REMOVE_BACKGROUND_COMMAND;
  readonly config?: PageBackgroundConfig;
  readonly plan: PageBackgroundMutationPlan;
  readonly policyContext: PdfPageBackgroundPolicyContext;
  readonly lossEntries: readonly PdfOutputLossEntry[];
  readonly request: PdfSavePolicyRequest;
  readonly decision: PdfSavePolicyDecision;
  readonly receipt: ReturnType<typeof issuePdfSavePolicyConsentReceipt>;
  readonly documentAuthority: ReturnType<
    typeof createPdfCommandConsentDocumentAuthority
  >;
}

export interface PendingEmbeddedImageOverlayOutput {
  readonly invocation: typeof PDF_EDITOR_APPLY_EMBEDDED_IMAGE_OVERLAY_COMMAND;
  readonly editGeneration: number;
  readonly plan: EmbeddedImageOverlayMutationPlan;
  readonly policyContext: PdfEmbeddedImageOverlayPolicyContext;
  readonly edits: readonly EmbeddedImageEdit[];
  readonly targets: readonly EmbeddedImageTargetIdentity[];
  readonly lossEntries: readonly PdfOutputLossEntry[];
  readonly request: PdfSavePolicyRequest;
  readonly decision: PdfSavePolicyDecision;
  readonly receipt: ReturnType<typeof issuePdfSavePolicyConsentReceipt>;
  readonly documentAuthority: ReturnType<
    typeof createPdfCommandConsentDocumentAuthority
  >;
}
