/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** PDF-owned exact-action adapters over the shared v4 command authority. */

import {
  createFeatureCommandBindingContract,
  createFeatureCommandRegistry,
  createFeatureCommandRegistryLineage,
  readFeatureCommandBindingManifest,
  type FeatureCommandBindingManifest,
  type FeatureCommandHandler,
  type FeatureCommandResult,
} from "@mrnote/core/web/components/office-ribbon/featureCommandRegistry.ts";
import {
  PDF_FEATURE_CAPABILITY_REGISTRY,
  findPdfFeatureCapability,
  type PdfCanonicalId,
  type PdfCapabilityHost,
  type PdfFeatureCapability,
  type PdfOutputDisposition,
} from "../../../../lib/pdf/feature-capabilities";

import {
  pdfFeatureCommandSemanticContract,
  type PdfCapabilityContext,
  type PdfFeatureCapabilityDecision,
  type PdfFeatureRuntimeState,
  resolvePdfFeatureCapability,
} from "./capabilityAdapter";

/**
 * Exact actions that already have mounted host ownership. Tool/dialog
 * activation is deliberately distinct from a mutation that may report success
 * only after the native save receipt has been accepted. Catalog rows without a
 * mounted binding remain outside this runtime vocabulary.
 */
export const PDF_CROSS_TAB_COMMANDS = Object.freeze({
  importPages: Object.freeze({
    featureId: "PDF-INS-PAGE-02",
    action: "pdf.page.import-native",
  }),
  replacePage: Object.freeze({
    featureId: "PDF-PAG-STRUCT-04",
    action: "pdf.page.replace-native",
  }),
  insertBlank: Object.freeze({
    featureId: "PDF-PAG-STRUCT-01",
    action: "pdf.page.insert-blank",
  }),
  deletePages: Object.freeze({
    featureId: "PDF-PAG-STRUCT-02",
    action: "pdf.page.delete",
  }),
  reorderPages: Object.freeze({
    featureId: "PDF-PAG-STRUCT-05",
    action: "pdf.page.reorder",
  }),
  organizePages: Object.freeze({
    featureId: "PDF-PAG-STRUCT-05",
    action: "pdf.page.organize",
  }),
  rotatePages: Object.freeze({
    featureId: "PDF-PAG-STRUCT-07",
    action: "pdf.page.rotate",
  }),
  cropPages: Object.freeze({
    featureId: "PDF-PAG-STRUCT-08",
    action: "pdf.page.crop",
  }),
  /** WPS 分割页面: pages cut into parts by one native page-tree revision. */
  splitPages: Object.freeze({
    featureId: "PDF-PAG-STRUCT-09",
    action: "pdf.page.split",
  }),
  /** WPS 背景: a background written beneath the pages as one native revision. */
  pageBackgroundCommit: Object.freeze({
    featureId: "PDF-INS-DECOR-04",
    action: "pdf.page.background.commit",
  }),
  pageSize: Object.freeze({
    featureId: "PDF-PAG-STRUCT-11",
    action: "pdf.page.resize-media-box",
  }),
  pageLabelsCommit: Object.freeze({
    featureId: "PDF-PAG-STRUCT-12",
    action: "pdf.page.labels.commit",
  }),
  watermarkCommit: Object.freeze({
    featureId: "PDF-INS-DECOR-01",
    action: "pdf.decoration.watermark.commit",
  }),
  pageNumberCommit: Object.freeze({
    featureId: "PDF-INS-DECOR-02",
    action: "pdf.decoration.page-number.commit",
  }),
  headerFooterCommit: Object.freeze({
    featureId: "PDF-INS-DECOR-03",
    action: "pdf.decoration.header-footer.commit",
  }),
  freeTextActivate: Object.freeze({
    featureId: "PDF-INS-CONTENT-01",
    action: "pdf.text.free-text.activate",
  }),
  freeTextCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-01",
    action: "pdf.text.free-text.commit",
  }),
  /**
   * Insert Text / Image / Shape written as new page content (one appended
   * content-stream block) instead of an annotation. The save policy judges
   * the page-local append, so the exact action stays distinct from the
   * annotation writers above and below.
   */
  contentAppendTextCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-01",
    action: "pdf.content.append.commit",
  }),
  imageInsertActivate: Object.freeze({
    featureId: "PDF-INS-CONTENT-02",
    action: "pdf.image.insert.activate",
  }),
  imageInsertCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-02",
    action: "pdf.image.insert.commit",
  }),
  contentAppendImageCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-02",
    action: "pdf.content.append-image.commit",
  }),
  contentAppendPathCommit: Object.freeze({
    featureId: "PDF-CMT-DRAW-02",
    action: "pdf.content.append-path.commit",
  }),
  imageOverlayCommit: Object.freeze({
    featureId: "PDF-EDT-IMAGE-01",
    action: "pdf.image.overlay.commit",
  }),
  // 表格 (managed-table.ts): a /FreeText the writer draws as the table.
  tableCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-01",
    action: "pdf.insert.table.commit",
  }),
  // 图表 (managed-chart.ts): a /FreeText drawn as the chart's picture.
  chartCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-01",
    action: "pdf.insert.chart.commit",
  }),
  embeddedImageRemoveCommit: Object.freeze({
    featureId: "PDF-EDT-IMAGE-02",
    action: "pdf.image.remove-source",
  }),
  embeddedImageReplaceCommit: Object.freeze({
    featureId: "PDF-EDT-IMAGE-02",
    action: "pdf.image.replace-source",
  }),
  embeddedImageTransformCommit: Object.freeze({
    featureId: "PDF-EDT-IMAGE-02",
    action: "pdf.image.transform-source",
  }),
  textDecorationCommit: Object.freeze({
    featureId: "PDF-EDT-TEXT-01",
    action: "pdf.text.decoration.commit",
  }),
  textObjectDeleteCommit: Object.freeze({
    featureId: "PDF-EDT-TEXT-01",
    action: "pdf.text.delete-object",
  }),
  embeddedImageReorderCommit: Object.freeze({
    featureId: "PDF-EDT-IMAGE-02",
    action: "pdf.image.arrange-source",
  }),
  outlineCommit: Object.freeze({
    featureId: "PDF-HOM-NAV-05",
    action: "pdf.outline.commit",
  }),
  linkActivate: Object.freeze({
    featureId: "PDF-INS-CONTENT-03",
    action: "pdf.link.activate",
  }),
  linkCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-03",
    action: "pdf.link.commit",
  }),
  linkEditCommit: Object.freeze({
    featureId: "PDF-EDT-OBJECT-02",
    action: "pdf.link.edit.commit",
  }),
  vectorGeometryCommit: Object.freeze({
    featureId: "PDF-EDT-OBJECT-01",
    action: "pdf.vector.geometry.commit",
  }),
  vectorStyleCommit: Object.freeze({
    featureId: "PDF-EDT-OBJECT-01",
    action: "pdf.vector.style.commit",
  }),
  vectorDuplicateCommit: Object.freeze({
    featureId: "PDF-EDT-OBJECT-01",
    action: "pdf.vector.duplicate.commit",
  }),
  vectorReorderCommit: Object.freeze({
    featureId: "PDF-EDT-OBJECT-01",
    action: "pdf.vector.reorder.commit",
  }),
  visualSignatureActivate: Object.freeze({
    featureId: "PDF-INS-CONTENT-04",
    action: "pdf.signature.visual.activate",
  }),
  visualSignatureCommit: Object.freeze({
    featureId: "PDF-INS-CONTENT-04",
    action: "pdf.signature.visual.commit",
  }),
  editContentActivate: Object.freeze({
    featureId: "PDF-EDT-TEXT-01",
    action: "pdf.text.edit-content.activate",
  }),
  editContentCommit: Object.freeze({
    featureId: "PDF-EDT-TEXT-01",
    action: "pdf.text.edit-content.commit",
  }),
  taggedTextCommit: Object.freeze({
    featureId: "PDF-STD-A11Y-02",
    action: "pdf.tagged-text.commit",
  }),
  formCreateCommit: Object.freeze({
    featureId: "PDF-FRM-AUTH-02",
    action: "pdf.form.create-detected-fields",
  }),
  formEditCommit: Object.freeze({
    featureId: "PDF-FRM-AUTH-02",
    action: "pdf.form.edit-existing-field",
  }),
  formDeleteCommit: Object.freeze({
    featureId: "PDF-FRM-AUTH-02",
    action: "pdf.form.delete-existing-field",
  }),
  undo: Object.freeze({
    featureId: "PDF-EDT-OBJECT-03",
    action: "pdf.edit.undo",
  }),
  redo: Object.freeze({
    featureId: "PDF-EDT-OBJECT-03",
    action: "pdf.edit.redo",
  }),
  highlightActivate: Object.freeze({
    featureId: "PDF-CMT-MARK-01",
    action: "pdf.comment.highlight.activate",
  }),
  highlightCommit: Object.freeze({
    featureId: "PDF-CMT-MARK-01",
    action: "pdf.comment.highlight.commit",
  }),
  areaHighlightActivate: Object.freeze({
    featureId: "PDF-CMT-MARK-02",
    action: "pdf.comment.area-highlight.activate",
  }),
  areaHighlightCommit: Object.freeze({
    featureId: "PDF-CMT-MARK-02",
    action: "pdf.comment.area-highlight.commit",
  }),
  underlineActivate: Object.freeze({
    featureId: "PDF-CMT-MARK-03",
    action: "pdf.comment.underline.activate",
  }),
  underlineCommit: Object.freeze({
    featureId: "PDF-CMT-MARK-03",
    action: "pdf.comment.underline.commit",
  }),
  strikeoutActivate: Object.freeze({
    featureId: "PDF-CMT-MARK-04",
    action: "pdf.comment.strikeout.activate",
  }),
  strikeoutCommit: Object.freeze({
    featureId: "PDF-CMT-MARK-04",
    action: "pdf.comment.strikeout.commit",
  }),
  squigglyActivate: Object.freeze({
    featureId: "PDF-CMT-MARK-05",
    action: "pdf.comment.squiggly.activate",
  }),
  squigglyCommit: Object.freeze({
    featureId: "PDF-CMT-MARK-05",
    action: "pdf.comment.squiggly.commit",
  }),
  replaceMarkActivate: Object.freeze({
    featureId: "PDF-CMT-MARK-06",
    action: "pdf.comment.replace-mark.activate",
  }),
  insertCaretActivate: Object.freeze({
    featureId: "PDF-CMT-MARK-06",
    action: "pdf.comment.insert-caret.activate",
  }),
  proofingCommit: Object.freeze({
    featureId: "PDF-CMT-MARK-06",
    action: "pdf.comment.proofing.commit",
  }),
  noteActivate: Object.freeze({
    featureId: "PDF-CMT-NOTE-01",
    action: "pdf.comment.note.activate",
  }),
  noteCommit: Object.freeze({
    featureId: "PDF-CMT-NOTE-01",
    action: "pdf.comment.note.commit",
  }),
  commentBatchDelete: Object.freeze({
    featureId: "PDF-CMT-NOTE-03",
    action: "pdf.comment.batch-delete",
  }),
  inkActivate: Object.freeze({
    featureId: "PDF-CMT-DRAW-01",
    action: "pdf.comment.ink.activate",
  }),
  inkCommit: Object.freeze({
    featureId: "PDF-CMT-DRAW-01",
    action: "pdf.comment.ink.commit",
  }),
  shapeActivate: Object.freeze({
    featureId: "PDF-CMT-DRAW-02",
    action: "pdf.comment.shape.activate",
  }),
  shapeCommit: Object.freeze({
    featureId: "PDF-CMT-DRAW-02",
    action: "pdf.comment.shape.commit",
  }),
  stampActivate: Object.freeze({
    featureId: "PDF-CMT-DRAW-04",
    action: "pdf.comment.stamp.activate",
  }),
  stampCommit: Object.freeze({
    featureId: "PDF-CMT-DRAW-04",
    action: "pdf.comment.stamp.commit",
  }),
  fileAttachmentActivate: Object.freeze({
    featureId: "PDF-CMT-DRAW-05",
    action: "pdf.comment.file-attachment.activate",
  }),
  fileAttachmentCommit: Object.freeze({
    featureId: "PDF-CMT-DRAW-05",
    action: "pdf.comment.file-attachment.commit",
  }),
  measureActivate: Object.freeze({
    featureId: "PDF-CMT-DRAW-06",
    action: "pdf.comment.measure.activate",
  }),
  measureCommit: Object.freeze({
    featureId: "PDF-CMT-DRAW-06",
    action: "pdf.comment.measure.commit",
  }),
} as const);

export type PdfCrossTabCommandKey = keyof typeof PDF_CROSS_TAB_COMMANDS;
export type PdfCrossTabCommandInvocation =
  (typeof PDF_CROSS_TAB_COMMANDS)[PdfCrossTabCommandKey];
export type PdfCommandMutationClass = "activation" | "receipt-bearing-mutation";

export type PdfCommandInvocation =
  | PdfCrossTabCommandInvocation
  | { readonly featureId: "PDF-FIL-DOC-02"; readonly action: "save-current" }
  | {
      readonly featureId: "PDF-FIL-DOC-03";
      readonly action:
        | "download-original"
        | "download-current"
        | "download-annotated"
        | "download-fillable"
        | "download-editable-annotations"
        | "download-archival"
        | "download-properties"
        | "download-native";
    }
  | { readonly featureId: "PDF-FIL-DOC-06"; readonly action: "print" }
  | { readonly featureId: "PDF-FIL-DOC-10"; readonly action: "replace-source" }
  | {
      readonly featureId: "PDF-INS-PAGE-02";
      readonly action: "pdf.page.insert-file";
    }
  | {
      readonly featureId: "PDF-INS-DECOR-04";
      readonly action:
        "pdf.page.apply-background" | "pdf.page.remove-background";
    }
  | {
      readonly featureId: "PDF-EDT-IMAGE-02";
      readonly action:
        | "pdf.image.apply-overlay-edits"
        | "pdf.image.remove-source"
        | "pdf.image.replace-source"
        | "pdf.image.transform-source"
        | "pdf.image.arrange-source";
    }
  | {
      readonly featureId: "PDF-PAG-STRUCT-03";
      readonly action: "pdf.page.extract";
    }
  | {
      readonly featureId: "PDF-TOO-FILE-01";
      readonly action: "pdf.file.split";
    }
  | {
      readonly featureId: "PDF-TOO-FILE-02";
      readonly action: "pdf.file.merge";
    }
  | {
      readonly featureId: "PDF-TOO-FILE-03";
      readonly action: "pdf.file.compress-lossless" | "pdf.file.compress-lossy";
    }
  | {
      readonly featureId: "PDF-TOO-FILE-04";
      readonly action: "pdf.file.deskew-page";
    }
  | {
      readonly featureId: "PDF-FRM-AUTH-02";
      readonly action:
        | "pdf.form.create-detected-fields"
        | "pdf.form.edit-existing-field"
        | "pdf.form.delete-existing-field";
    }
  | {
      readonly featureId: "PDF-FRM-AUTH-03";
      readonly action: "pdf.form.reset-values" | "pdf.form.import-data";
    }
  | {
      readonly featureId: "PDF-SEC-REDACT-02";
      readonly action: "pdf.redaction.apply";
    }
  | {
      readonly featureId: "PDF-SEC-SAFE-01";
      readonly action: "pdf.security.safe-copy";
    };

export type PdfBoundCommandId = PdfCommandInvocation["featureId"];

export type PdfCommandDispatcher = (
  invocation: PdfCommandInvocation,
) => ReturnType<FeatureCommandHandler>;

export interface PdfCommandTelemetryEvent {
  readonly featureId: PdfBoundCommandId;
  readonly action: PdfCommandInvocation["action"];
  readonly outcome: FeatureCommandResult;
  readonly disposition: PdfOutputDisposition;
  readonly reasonKey: string | null;
}

export interface ResolvedPdfFeatureCommand {
  readonly capability: PdfFeatureCapability;
  readonly bound: boolean;
  readonly enabled: boolean;
  readonly disposition: PdfOutputDisposition;
  readonly reasonKey: string | null;
  readonly reasonLabel: string | null;
}

export interface PdfFeatureCommandRegistry {
  readonly featureIds: readonly string[];
  resolve(
    invocation: PdfCommandInvocation,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
    dispatcherAvailable?: boolean,
  ): ResolvedPdfFeatureCommand;
  execute(
    invocation: PdfCommandInvocation,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
    dispatch?: PdfCommandDispatcher,
  ): Promise<FeatureCommandResult>;
}

// Transitional legacy hosts retain their pre-v4 shared-registry behavior.
// This sentinel is not an authority proof and is never used by the v4 owner.
const acceptValidatedBinding: FeatureCommandHandler = () => true;

export interface PdfCrossTabCommandManifestEntry {
  readonly key: PdfCrossTabCommandKey;
  readonly invocation: PdfCrossTabCommandInvocation;
  readonly host: PdfCapabilityHost;
  readonly mutationClass: PdfCommandMutationClass;
  readonly availability: "document-writable";
  readonly handlerRef: string;
}

function crossTabCommand<K extends PdfCrossTabCommandKey>(
  key: K,
  host: PdfCapabilityHost,
  mutationClass: PdfCommandMutationClass,
  handlerRef: string,
): PdfCrossTabCommandManifestEntry {
  return Object.freeze({
    key,
    invocation: PDF_CROSS_TAB_COMMANDS[key],
    host,
    mutationClass,
    availability: "document-writable" as const,
    handlerRef,
  });
}

/**
 * Closed runtime vocabulary for actions already mounted by the two PDF hosts.
 * A reader activation may only enter a tool/dialog. Every
 * document-changing action is owned by the native editor and must keep its
 * promise pending until its exact save receipt has been accepted.
 */
export const PDF_CROSS_TAB_COMMAND_MANIFEST = Object.freeze([
  crossTabCommand(
    "importPages",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#importNativePdfPages",
  ),
  crossTabCommand(
    "replacePage",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#replaceNativePdfPage",
  ),
  crossTabCommand(
    "insertBlank",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#insertBlankPage",
  ),
  crossTabCommand(
    "deletePages",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#deletePages",
  ),
  crossTabCommand(
    "reorderPages",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#movePageBy",
  ),
  crossTabCommand(
    "organizePages",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#runPdfPageOrganizerOperations",
  ),
  crossTabCommand(
    "rotatePages",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#rotatePages",
  ),
  crossTabCommand(
    "cropPages",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#applyCropMargins",
  ),
  crossTabCommand(
    "splitPages",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#splitNativePages",
  ),
  crossTabCommand(
    "pageBackgroundCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#applyNativePageBackground",
  ),
  crossTabCommand(
    "pageSize",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#applyPageSize",
  ),
  crossTabCommand(
    "pageLabelsCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#handlePdfPageLabelRangesApply",
  ),
  crossTabCommand(
    "watermarkCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#commitManagedNativeDecorations",
  ),
  crossTabCommand(
    "pageNumberCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#commitManagedNativeDecorations",
  ),
  crossTabCommand(
    "headerFooterCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#commitManagedNativeDecorations",
  ),
  crossTabCommand(
    "freeTextActivate",
    "reader",
    "activation",
    "PDFViewer#activateFreeText",
  ),
  crossTabCommand(
    "freeTextCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#saveTextBoxEdits",
  ),
  crossTabCommand(
    "contentAppendTextCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#handleCreatedTextBoxCommit",
  ),
  crossTabCommand(
    "imageInsertActivate",
    "reader",
    "activation",
    "PDFViewer#executeImageActivation",
  ),
  crossTabCommand(
    "imageInsertCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeImageStampCommit",
  ),
  crossTabCommand(
    "contentAppendImageCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#insertNativeImageContent",
  ),
  crossTabCommand(
    "contentAppendPathCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#insertNativeShapeContent",
  ),
  crossTabCommand(
    "imageOverlayCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeImageStampCommit",
  ),
  crossTabCommand(
    "tableCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeTableCommit",
  ),
  crossTabCommand(
    "chartCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeChartCommit",
  ),
  crossTabCommand(
    "embeddedImageRemoveCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeEmbeddedImageRemoval",
  ),
  crossTabCommand(
    "embeddedImageReplaceCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeEmbeddedImageReplacement",
  ),
  crossTabCommand(
    "embeddedImageTransformCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeEmbeddedImageTransform",
  ),
  crossTabCommand(
    "textDecorationCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#commitNativeTextDecoration",
  ),
  crossTabCommand(
    "textObjectDeleteCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#commitNativeTextObjectDelete",
  ),
  crossTabCommand(
    "embeddedImageReorderCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#commitNativeEmbeddedImageArrange",
  ),
  crossTabCommand(
    "outlineCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeManagedOutlineMutation",
  ),
  crossTabCommand(
    "linkActivate",
    "reader",
    "activation",
    "PDFViewer#activateLink",
  ),
  crossTabCommand(
    "linkCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeLinkCommit",
  ),
  crossTabCommand(
    "linkEditCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeLinkCommit",
  ),
  crossTabCommand(
    "vectorGeometryCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeVectorGeometryCommit",
  ),
  crossTabCommand(
    "vectorStyleCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeVectorStyleCommit",
  ),
  crossTabCommand(
    "vectorDuplicateCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeVectorDuplicateCommit",
  ),
  crossTabCommand(
    "vectorReorderCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeVectorReorderCommit",
  ),
  crossTabCommand(
    "visualSignatureActivate",
    "reader",
    "activation",
    "PDFViewer#activateVisualSignature",
  ),
  crossTabCommand(
    "visualSignatureCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeVisualSignatureCommit",
  ),
  crossTabCommand(
    "editContentActivate",
    "reader",
    "activation",
    "PDFViewer#activateEditContent",
  ),
  crossTabCommand(
    "editContentCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#applyNativeListTextEdit",
  ),
  crossTabCommand(
    "taggedTextCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#handleTaggedTextApply",
  ),
  crossTabCommand(
    "formCreateCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#handleNativeFormAuthoringChange",
  ),
  crossTabCommand(
    "formEditCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#handleNativeFormAuthoringChange",
  ),
  crossTabCommand(
    "formDeleteCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#handleNativeFormAuthoringChange",
  ),
  crossTabCommand(
    "undo",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#undoPdfEdit",
  ),
  crossTabCommand(
    "redo",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#redoPdfEdit",
  ),
  crossTabCommand(
    "highlightActivate",
    "reader",
    "activation",
    "PDFViewer#activateHighlight",
  ),
  crossTabCommand(
    "highlightCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#upsertManagedTextMarkup",
  ),
  crossTabCommand(
    "areaHighlightActivate",
    "reader",
    "activation",
    "PDFViewer#activateAreaHighlight",
  ),
  crossTabCommand(
    "areaHighlightCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeAreaHighlightCommit",
  ),
  crossTabCommand(
    "underlineActivate",
    "reader",
    "activation",
    "PDFViewer#activateUnderline",
  ),
  crossTabCommand(
    "underlineCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#upsertManagedTextMarkup",
  ),
  crossTabCommand(
    "strikeoutActivate",
    "reader",
    "activation",
    "PDFViewer#activateStrikeout",
  ),
  crossTabCommand(
    "strikeoutCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#upsertManagedTextMarkup",
  ),
  crossTabCommand(
    "squigglyActivate",
    "reader",
    "activation",
    "PDFViewer#activateSquiggly",
  ),
  crossTabCommand(
    "squigglyCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#upsertManagedTextMarkup",
  ),
  crossTabCommand(
    "replaceMarkActivate",
    "reader",
    "activation",
    "PDFViewer#activateReplaceMark",
  ),
  crossTabCommand(
    "insertCaretActivate",
    "reader",
    "activation",
    "PDFViewer#activateInsertCaret",
  ),
  crossTabCommand(
    "proofingCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#upsertManagedProofing",
  ),
  crossTabCommand(
    "noteActivate",
    "reader",
    "activation",
    "PDFViewer#activateNote",
  ),
  crossTabCommand(
    "noteCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#saveAnnotations",
  ),
  crossTabCommand(
    "commentBatchDelete",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#deleteManagedCommentBatch",
  ),
  crossTabCommand(
    "inkActivate",
    "reader",
    "activation",
    "PDFViewer#activateInk",
  ),
  crossTabCommand(
    "inkCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#saveInkStrokes",
  ),
  crossTabCommand(
    "shapeActivate",
    "reader",
    "activation",
    "PDFViewer#activateShape",
  ),
  crossTabCommand(
    "shapeCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#saveNativeShapes",
  ),
  crossTabCommand(
    "stampActivate",
    "reader",
    "activation",
    "PDFViewer#activateStamp",
  ),
  crossTabCommand(
    "stampCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#executeNativeStampCommit",
  ),
  crossTabCommand(
    "fileAttachmentActivate",
    "reader",
    "activation",
    "PDFViewer#activateFileAttachment",
  ),
  crossTabCommand(
    "fileAttachmentCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#persistNativeFileAttachmentMutation",
  ),
  crossTabCommand(
    "measureActivate",
    "reader",
    "activation",
    "PDFViewer#activateMeasure",
  ),
  crossTabCommand(
    "measureCommit",
    "native-editor",
    "receipt-bearing-mutation",
    "PdfPageWindow#saveNativeMeasurements",
  ),
] satisfies readonly PdfCrossTabCommandManifestEntry[]);

export function findPdfCrossTabCommandManifestEntry(
  invocation: PdfCommandInvocation,
  host?: PdfCapabilityHost,
): PdfCrossTabCommandManifestEntry | null {
  const inspected = Object.freeze({
    featureId: invocation.featureId,
    action: invocation.action,
  });
  return (
    PDF_CROSS_TAB_COMMAND_MANIFEST.find(
      (entry) =>
        entry.invocation.featureId === inspected.featureId &&
        entry.invocation.action === inspected.action &&
        (host === undefined || entry.host === host),
    ) ?? null
  );
}

interface PdfCommandBindingDescriptor {
  readonly host: PdfCapabilityHost;
  readonly featureId: PdfBoundCommandId;
  readonly action: PdfCommandInvocation["action"];
  readonly handlerRef: string;
  readonly mutationClass?: PdfCommandMutationClass;
  readonly availability?: "document-writable";
}

const PDF_COMMAND_BINDING_DESCRIPTOR_VALUES = [
  {
    host: "native-editor",
    featureId: "PDF-FIL-DOC-02",
    action: "save-current",
    handlerRef: "PdfPageWindow#handleSaveCurrentPdf",
  },
  {
    host: "native-editor",
    featureId: "PDF-FIL-DOC-03",
    action: "download-original",
    handlerRef: "PdfPageWindow#runServerExport(pdf)",
  },
  {
    host: "native-editor",
    featureId: "PDF-FIL-DOC-03",
    action: "download-current",
    handlerRef: "PdfPageWindow#handleDownloadCurrentPdf",
  },
  {
    host: "native-editor",
    featureId: "PDF-FIL-DOC-03",
    action: "download-native",
    handlerRef: "PdfPageWindow#runNativePdfExport",
  },
  {
    host: "native-editor",
    featureId: "PDF-FIL-DOC-10",
    action: "replace-source",
    handlerRef: "PdfPageWindow#handleOpenPdfSourcePicker",
  },
  {
    host: "native-editor",
    featureId: "PDF-INS-DECOR-04",
    action: "pdf.page.apply-background",
    handlerRef: "PdfPageWindow#executeBackgroundOutput",
  },
  {
    host: "native-editor",
    featureId: "PDF-EDT-IMAGE-02",
    action: "pdf.image.apply-overlay-edits",
    handlerRef: "PdfPageWindow#executeEmbeddedImageOverlayOutput",
  },
  {
    host: "native-editor",
    featureId: "PDF-EDT-IMAGE-02",
    action: "pdf.image.remove-source",
    handlerRef: "PdfPageWindow#executeNativeEmbeddedImageRemoval",
  },
  {
    host: "native-editor",
    featureId: "PDF-EDT-IMAGE-02",
    action: "pdf.image.replace-source",
    handlerRef: "PdfPageWindow#executeNativeEmbeddedImageReplacement",
  },
  {
    host: "native-editor",
    featureId: "PDF-INS-DECOR-04",
    action: "pdf.page.remove-background",
    handlerRef: "PdfPageWindow#executeBackgroundOutput",
  },
  {
    host: "reader",
    featureId: "PDF-FRM-AUTH-02",
    action: "pdf.form.create-detected-fields",
    handlerRef: "PDFViewer#executeCreateDetectedFieldsOutput",
  },
  {
    host: "reader",
    featureId: "PDF-FRM-AUTH-02",
    action: "pdf.form.edit-existing-field",
    handlerRef: "PDFViewer#executeExistingFormFieldEditOutput",
  },
  {
    host: "reader",
    featureId: "PDF-FRM-AUTH-02",
    action: "pdf.form.delete-existing-field",
    handlerRef: "PDFViewer#executeExistingFormFieldDeleteOutput",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-03",
    action: "download-original",
    handlerRef: "PDFViewer#handleDirectPdfDownload",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-03",
    action: "download-current",
    handlerRef: "PDFViewer#handleDownloadCurrent",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-03",
    action: "download-annotated",
    handlerRef: "PDFViewer#handleDownloadWithAnnotations",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-03",
    action: "download-fillable",
    handlerRef: "PDFViewer#handleDownloadFillable",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-03",
    action: "download-editable-annotations",
    handlerRef: "PDFViewer#handleDownloadEditableAnnotations",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-03",
    action: "download-archival",
    handlerRef: "PDFViewer#handleDownloadArchival",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-03",
    action: "download-properties",
    handlerRef: "PDFViewer#handleSaveProperties",
  },
  {
    host: "reader",
    featureId: "PDF-FIL-DOC-06",
    action: "print",
    handlerRef: "PDFViewer#handlePrint",
  },
  {
    host: "reader",
    featureId: "PDF-INS-PAGE-02",
    action: "pdf.page.insert-file",
    handlerRef: "PDFViewer#executePagePackageOutputs",
  },
  {
    host: "reader",
    featureId: "PDF-PAG-STRUCT-03",
    action: "pdf.page.extract",
    handlerRef: "PDFViewer#executePagePackageOutputs",
  },
  {
    host: "reader",
    featureId: "PDF-TOO-FILE-01",
    action: "pdf.file.split",
    handlerRef: "PDFViewer#executePagePackageOutputs",
  },
  {
    host: "reader",
    featureId: "PDF-TOO-FILE-02",
    action: "pdf.file.merge",
    handlerRef: "PDFViewer#executePagePackageOutputs",
  },
  {
    host: "reader",
    featureId: "PDF-TOO-FILE-03",
    action: "pdf.file.compress-lossless",
    handlerRef: "PDFViewer#executeLosslessCompressionOutput",
  },
  {
    host: "reader",
    featureId: "PDF-TOO-FILE-03",
    action: "pdf.file.compress-lossy",
    handlerRef: "PDFViewer#executeLossyCompressionOutput",
  },
  {
    host: "reader",
    featureId: "PDF-TOO-FILE-04",
    action: "pdf.file.deskew-page",
    handlerRef: "PDFViewer#executeDeskewRasterOutput",
  },
  {
    host: "reader",
    featureId: "PDF-FRM-AUTH-03",
    action: "pdf.form.reset-values",
    handlerRef: "PDFViewer#executeFormValueOutput",
  },
  {
    host: "reader",
    featureId: "PDF-FRM-AUTH-03",
    action: "pdf.form.import-data",
    handlerRef: "PDFViewer#executeFormValueOutput",
  },
  {
    host: "reader",
    featureId: "PDF-SEC-REDACT-02",
    action: "pdf.redaction.apply",
    handlerRef: "PDFViewer#handleApplyRedactions",
  },
  {
    host: "reader",
    featureId: "PDF-SEC-SAFE-01",
    action: "pdf.security.safe-copy",
    handlerRef: "PDFViewer#openDangerousActionSafeCopyReview",
    mutationClass: "activation",
  },
  ...PDF_CROSS_TAB_COMMAND_MANIFEST.map((entry) => ({
    host: entry.host,
    featureId: entry.invocation.featureId,
    action: entry.invocation.action,
    handlerRef: entry.handlerRef,
    mutationClass: entry.mutationClass,
    availability: entry.availability,
  })),
] as const satisfies readonly PdfCommandBindingDescriptor[];

const PDF_COMMAND_BINDING_DESCRIPTORS: readonly PdfCommandBindingDescriptor[] =
  Object.freeze(
    PDF_COMMAND_BINDING_DESCRIPTOR_VALUES.map((descriptor) =>
      Object.freeze(descriptor),
    ),
  );

interface PdfAuthorityResolverFrame {
  decision: PdfFeatureCapabilityDecision | null;
}

function createPdfAuthorityResolverSession(
  requiredAction?: string,
  requireWritable = false,
  requireSavePolicy = true,
) {
  const frames: PdfAuthorityResolverFrame[] = [];
  const resolveCapability = (
    capability: PdfFeatureCapability,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
    requiredHost?: PdfCapabilityHost,
  ): PdfFeatureCapabilityDecision => {
    const decision = resolvePdfFeatureCapability(
      capability,
      context,
      runtime,
      requiredHost,
      requiredAction,
      requireWritable,
      requireSavePolicy,
    );
    const frame = frames[frames.length - 1];
    if (frame) frame.decision = decision;
    return decision;
  };
  const capture = <T>(operation: () => T) => {
    const frame: PdfAuthorityResolverFrame = { decision: null };
    frames.push(frame);
    try {
      return { value: operation(), frame };
    } finally {
      if (frames.pop() !== frame) {
        throw new Error("PDF capability resolver frame corruption");
      }
    }
  };
  return Object.freeze({ resolveCapability, capture });
}

function readExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`Invalid ${label}`);
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    throw new Error(`Invalid ${label} fields`);
  }
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`Invalid ${label}.${key}`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function inspectPdfCommandInvocation(
  value: unknown,
): Readonly<{ featureId: string; action: string }> | null {
  try {
    const invocation = readExactDataObject(
      value,
      ["featureId", "action"],
      "PDF command invocation",
    );
    if (
      typeof invocation.featureId !== "string" ||
      typeof invocation.action !== "string"
    ) {
      return null;
    }
    return Object.freeze({
      featureId: invocation.featureId,
      action: invocation.action,
    });
  } catch {
    return null;
  }
}

function matchesPdfCommandInvocation(
  value: unknown,
  expected: PdfCommandInvocation,
): boolean {
  const invocation = inspectPdfCommandInvocation(value);
  return Boolean(
    invocation &&
    invocation.featureId === expected.featureId &&
    invocation.action === expected.action,
  );
}

function blockedPdfAuthorityDecision(
  capability: PdfFeatureCapability,
  reasonKey: string,
): ResolvedPdfFeatureCommand {
  return {
    capability,
    bound: false,
    enabled: false,
    disposition: "blocked",
    reasonKey,
    reasonLabel: null,
  };
}

export interface PdfCommandAuthorityOwnerConfig<
  Invocation extends PdfCommandInvocation = PdfCommandInvocation,
> {
  readonly host: PdfCapabilityHost;
  /** Per-mounted-host identity. Never reuse it for another editor instance. */
  readonly instanceId: string;
  readonly invocation: Invocation;
}

export interface PdfCommandAuthority<
  Invocation extends PdfCommandInvocation = PdfCommandInvocation,
> {
  readonly host: PdfCapabilityHost;
  readonly registryId: string;
  readonly invocation: Invocation;
  readonly handlerRef: string;
  /** Throws when this exact generation/contract is not current. */
  readBindingManifest(): FeatureCommandBindingManifest;
  resolve(
    invocation: PdfCommandInvocation,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
  ): ResolvedPdfFeatureCommand;
  execute(
    invocation: PdfCommandInvocation,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
  ): Promise<FeatureCommandResult>;
}

export interface PdfCommandAuthorityOwner<
  Invocation extends PdfCommandInvocation = PdfCommandInvocation,
> {
  readonly host: PdfCapabilityHost;
  readonly registryId: string;
  readonly invocation: Invocation;
  readonly handlerRef: string;
  /** Publishing a new handler makes every prior authority generation stale. */
  bind(
    execute: FeatureCommandHandler,
    onTelemetry?: (event: PdfCommandTelemetryEvent) => void,
  ): PdfCommandAuthority<Invocation>;
}

/**
 * Create one private lineage for one concrete host/action. A host with several
 * actions for the same canonical feature must create several owners; v4 never
 * hides those actions behind a feature-only dispatcher.
 */
export function createPdfCommandAuthorityOwner<
  Invocation extends PdfCommandInvocation,
>(
  configValue: PdfCommandAuthorityOwnerConfig<Invocation>,
): PdfCommandAuthorityOwner<Invocation> {
  const config = readExactDataObject(
    configValue,
    ["host", "instanceId", "invocation"],
    "PDF command authority config",
  );
  if (config.host !== "reader" && config.host !== "native-editor") {
    throw new Error("Invalid PDF command authority host");
  }
  if (
    typeof config.instanceId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(config.instanceId)
  ) {
    throw new Error("Invalid PDF command authority instance ID");
  }
  const inspectedInvocation = inspectPdfCommandInvocation(config.invocation);
  if (!inspectedInvocation) {
    throw new Error("Invalid PDF command authority invocation");
  }
  const descriptor = PDF_COMMAND_BINDING_DESCRIPTORS.find(
    (candidate) =>
      candidate.host === config.host &&
      candidate.featureId === inspectedInvocation.featureId &&
      candidate.action === inspectedInvocation.action,
  );
  if (!descriptor) {
    throw new Error("Unsupported PDF command authority binding");
  }
  const capability = findPdfFeatureCapability(descriptor.featureId);
  if (!capability || capability.command.disposition !== "runtime-bindable") {
    throw new Error("Inert PDF capability has authority binding");
  }
  const invocation = Object.freeze({
    featureId: descriptor.featureId,
    action: descriptor.action,
  }) as unknown as Invocation;
  const registryId = [
    "pdf",
    descriptor.host,
    descriptor.featureId,
    descriptor.action,
    config.instanceId,
  ].join(".");
  const lineage = createFeatureCommandRegistryLineage("pdf", registryId);
  const resolverSession = createPdfAuthorityResolverSession(
    descriptor.action,
    descriptor.availability === "document-writable",
    descriptor.mutationClass !== "activation",
  );
  const catalog = Object.freeze([capability]);
  const find = (id: string): PdfFeatureCapability | null =>
    id === capability.id ? capability : null;

  const bind: PdfCommandAuthorityOwner<Invocation>["bind"] = (
    execute,
    onTelemetry,
  ) => {
    if (typeof execute !== "function") {
      throw new Error("Invalid PDF command authority handler");
    }
    if (onTelemetry !== undefined && typeof onTelemetry !== "function") {
      throw new Error("Invalid PDF command authority telemetry");
    }
    const binding = Object.freeze({
      featureId: descriptor.featureId,
      action: descriptor.action,
      handlerRef: descriptor.handlerRef,
      execute,
      gate: descriptor.host,
    });
    const bindings = Object.freeze([binding]);
    const bindingContract = createFeatureCommandBindingContract({
      lineage,
      catalogEntries: Object.freeze([
        Object.freeze({
          featureId: capability.id,
          semanticContract: pdfFeatureCommandSemanticContract(capability),
          action: descriptor.action,
          handlerRef: descriptor.handlerRef,
        }),
      ]),
      bindings,
      resolveCapability: resolverSession.resolveCapability,
    });
    const registry = createFeatureCommandRegistry<
      PdfFeatureCapability,
      PdfCapabilityContext,
      PdfFeatureRuntimeState,
      PdfCapabilityHost
    >({
      editor: "pdf",
      catalog,
      lineage,
      bindingContract,
      describeBindingContract: pdfFeatureCommandSemanticContract,
      find,
      resolveCapability: resolverSession.resolveCapability,
      bindings,
    });
    const readBindingManifest = (): FeatureCommandBindingManifest => {
      const manifest = readFeatureCommandBindingManifest(
        registry.bindingManifest,
        {
          expectedLineage: lineage,
          expectedRegistry: registry,
          expectedBindingContract: bindingContract,
        },
      );
      if (
        manifest.editor !== "pdf" ||
        manifest.registryId !== registryId ||
        manifest.boundFeatureIds.length !== 1 ||
        manifest.boundFeatureIds[0] !== descriptor.featureId
      ) {
        throw new Error("PDF command binding manifest identity mismatch");
      }
      return manifest;
    };
    // Construction is not published to a caller without an authenticated v4
    // proof for the exact lineage, contract, registry, catalog row, and handler.
    readBindingManifest();

    const proofIsCurrent = (): boolean => {
      try {
        readBindingManifest();
        return true;
      } catch {
        return false;
      }
    };
    const stale = (): ResolvedPdfFeatureCommand =>
      blockedPdfAuthorityDecision(capability, "pdf.capability.registryStale");
    const emit = (
      outcome: FeatureCommandResult,
      disposition: PdfOutputDisposition,
      reasonKey: string | null,
    ): void => {
      onTelemetry?.({
        featureId: descriptor.featureId,
        action: descriptor.action,
        outcome,
        disposition,
        reasonKey,
      });
    };

    const resolve: PdfCommandAuthority<Invocation>["resolve"] = (
      candidate,
      context,
      runtime,
    ) => {
      if (!matchesPdfCommandInvocation(candidate, invocation)) {
        return blockedPdfAuthorityDecision(
          capability,
          "pdf.capability.bindingIdentityMismatch",
        );
      }
      if (!proofIsCurrent()) return stale();
      const captured = resolverSession.capture(() =>
        registry.resolve(descriptor.featureId, context, runtime),
      );
      if (!proofIsCurrent()) return stale();
      const capabilityDecision = captured.frame.decision;
      if (!capabilityDecision) {
        return blockedPdfAuthorityDecision(
          capability,
          "pdf.capability.bindingIdentityMismatch",
        );
      }
      return {
        ...captured.value,
        disposition: capabilityDecision.disposition,
        reasonKey: captured.value.reasonKey ?? capabilityDecision.reasonKey,
        reasonLabel: capabilityDecision.reasonLabel,
      };
    };

    const executeAuthority: PdfCommandAuthority<Invocation>["execute"] = async (
      candidate,
      context,
      runtime,
    ) => {
      if (!matchesPdfCommandInvocation(candidate, invocation)) {
        emit("blocked", "blocked", "pdf.capability.bindingIdentityMismatch");
        return "blocked";
      }
      if (!proofIsCurrent()) {
        emit("blocked", "blocked", "pdf.capability.registryStale");
        return "blocked";
      }
      let captured: {
        readonly value: Promise<FeatureCommandResult>;
        readonly frame: PdfAuthorityResolverFrame;
      };
      try {
        captured = resolverSession.capture(() =>
          registry.execute(descriptor.featureId, context, runtime),
        );
        const outcome = await captured.value;
        if (!proofIsCurrent()) {
          emit("blocked", "blocked", "pdf.capability.registryStale");
          return "blocked";
        }
        const capabilityDecision = captured.frame.decision;
        if (!capabilityDecision) {
          emit("blocked", "blocked", "pdf.capability.bindingIdentityMismatch");
          return "blocked";
        }
        const reasonKey =
          outcome === "executed"
            ? null
            : capabilityDecision.enabled
              ? "pdf.capability.handlerBlocked"
              : capabilityDecision.reasonKey;
        emit(outcome, capabilityDecision.disposition, reasonKey);
        return outcome;
      } catch (error) {
        emit(
          "blocked",
          "blocked",
          proofIsCurrent()
            ? "pdf.capability.handlerError"
            : "pdf.capability.registryStale",
        );
        throw error;
      }
    };

    return Object.freeze({
      host: descriptor.host,
      registryId,
      invocation,
      handlerRef: descriptor.handlerRef,
      readBindingManifest,
      resolve,
      execute: executeAuthority,
    });
  };

  return Object.freeze({
    host: descriptor.host,
    registryId,
    invocation,
    handlerRef: descriptor.handlerRef,
    bind,
  });
}

export interface PdfCommandAuthoritySetBinding {
  readonly invocation: PdfCrossTabCommandInvocation;
  readonly execute: FeatureCommandHandler;
  readonly onTelemetry?: (event: PdfCommandTelemetryEvent) => void;
}

export interface PdfCommandAuthoritySet {
  readonly host: PdfCapabilityHost;
  readonly invocations: readonly PdfCrossTabCommandInvocation[];
  readBindingManifests(): readonly FeatureCommandBindingManifest[];
  resolve(
    invocation: PdfCrossTabCommandInvocation,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
  ): ResolvedPdfFeatureCommand;
  execute(
    invocation: PdfCrossTabCommandInvocation,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
  ): Promise<FeatureCommandResult>;
}

export interface PdfCommandAuthoritySetOwner {
  readonly host: PdfCapabilityHost;
  readonly invocations: readonly PdfCrossTabCommandInvocation[];
  /** Rebinding publishes one new generation and invalidates every older set. */
  bind(
    bindings: readonly PdfCommandAuthoritySetBinding[],
  ): PdfCommandAuthoritySet;
}

export interface PdfCommandAuthoritySetOwnerConfig {
  readonly host: PdfCapabilityHost;
  readonly instanceId: string;
  readonly invocations: readonly PdfCrossTabCommandInvocation[];
}

function pdfInvocationKey(invocation: {
  readonly featureId: string;
  readonly action: string;
}): string {
  return `${invocation.featureId}\u0000${invocation.action}`;
}

function boundSetDecision(
  capability: PdfFeatureCapability,
  reasonKey: string,
): ResolvedPdfFeatureCommand {
  return {
    capability,
    bound: true,
    enabled: false,
    disposition: "blocked",
    reasonKey,
    reasonLabel: null,
  };
}

/**
 * Batch owner used by the two mounted PDF hosts. It avoids one React owner per
 * button while retaining the shared registry's per-action lineage proof. The
 * set is an authority aggregator, not a feature-level dispatcher: every
 * invocation and handler must be declared exactly once.
 */
export function createPdfCommandAuthoritySetOwner(
  configValue: PdfCommandAuthoritySetOwnerConfig,
): PdfCommandAuthoritySetOwner {
  const config = readExactDataObject(
    configValue,
    ["host", "instanceId", "invocations"],
    "PDF command authority set config",
  );
  if (config.host !== "reader" && config.host !== "native-editor") {
    throw new Error("Invalid PDF command authority set host");
  }
  const host: PdfCapabilityHost = config.host;
  if (
    typeof config.instanceId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(config.instanceId)
  ) {
    throw new Error("Invalid PDF command authority set instance ID");
  }
  const instanceId = config.instanceId;
  if (!Array.isArray(config.invocations) || config.invocations.length === 0) {
    throw new Error("PDF command authority set requires invocations");
  }

  const seen = new Set<string>();
  const entries: PdfCrossTabCommandManifestEntry[] = [];
  const owners: PdfCommandAuthorityOwner<PdfCrossTabCommandInvocation>[] = [];
  for (const value of config.invocations) {
    const inspected = inspectPdfCommandInvocation(value);
    if (!inspected) throw new Error("Invalid PDF command set invocation");
    const entry = findPdfCrossTabCommandManifestEntry(
      inspected as PdfCommandInvocation,
      host,
    );
    if (!entry) throw new Error("PDF command set host binding mismatch");
    const key = pdfInvocationKey(entry.invocation);
    if (seen.has(key)) throw new Error("Duplicate PDF command set invocation");
    seen.add(key);
    entries.push(entry);
    owners.push(
      createPdfCommandAuthorityOwner({
        host,
        instanceId,
        invocation: entry.invocation,
      }),
    );
  }

  const frozenEntries = Object.freeze([...entries]);
  const invocations = Object.freeze(
    frozenEntries.map((entry) => entry.invocation),
  );
  let generation = 0;

  const bind = (
    bindingValues: readonly PdfCommandAuthoritySetBinding[],
  ): PdfCommandAuthoritySet => {
    if (!Array.isArray(bindingValues)) {
      throw new Error("Invalid PDF command authority set bindings");
    }
    const bindingsByKey = new Map<string, PdfCommandAuthoritySetBinding>();
    for (const value of bindingValues) {
      const binding = readExactDataObject(
        value,
        value.onTelemetry === undefined
          ? ["invocation", "execute"]
          : ["invocation", "execute", "onTelemetry"],
        "PDF command authority set binding",
      );
      const inspected = inspectPdfCommandInvocation(binding.invocation);
      if (!inspected || typeof binding.execute !== "function") {
        throw new Error("Invalid PDF command authority set binding");
      }
      if (
        binding.onTelemetry !== undefined &&
        typeof binding.onTelemetry !== "function"
      ) {
        throw new Error("Invalid PDF command authority set telemetry");
      }
      const key = pdfInvocationKey(inspected);
      if (bindingsByKey.has(key)) {
        throw new Error("Duplicate PDF command authority set binding");
      }
      bindingsByKey.set(key, value as PdfCommandAuthoritySetBinding);
    }
    if (
      bindingsByKey.size !== frozenEntries.length ||
      frozenEntries.some(
        (entry) => !bindingsByKey.has(pdfInvocationKey(entry.invocation)),
      )
    ) {
      throw new Error("Incomplete PDF command authority set bindings");
    }

    generation += 1;
    const boundGeneration = generation;
    const authorities = Object.freeze(
      owners.map((owner, index) => {
        const entry = frozenEntries[index]!;
        const binding = bindingsByKey.get(pdfInvocationKey(entry.invocation))!;
        return owner.bind(binding.execute, binding.onTelemetry);
      }),
    );
    let receiptMutationInFlight = false;
    const current = (): boolean => boundGeneration === generation;
    const readBindingManifests = () => {
      if (!current()) throw new Error("PDF command authority set is stale");
      return Object.freeze(
        authorities.map((authority) => authority.readBindingManifest()),
      );
    };
    // Publish only after all exact per-action manifests have authenticated.
    readBindingManifests();

    const locate = (invocation: PdfCrossTabCommandInvocation) => {
      const inspected = inspectPdfCommandInvocation(invocation);
      if (!inspected) return null;
      const key = pdfInvocationKey(inspected);
      const index = frozenEntries.findIndex(
        (entry) => pdfInvocationKey(entry.invocation) === key,
      );
      if (index < 0) return null;
      return Object.freeze({
        entry: frozenEntries[index]!,
        authority: authorities[index]!,
      });
    };

    const resolve: PdfCommandAuthoritySet["resolve"] = (
      invocation,
      context,
      runtime,
    ) => {
      const located = locate(invocation);
      const capability = findPdfFeatureCapability(invocation.featureId);
      if (!located || !capability) {
        const fallback = frozenEntries[0]!;
        return blockedPdfAuthorityDecision(
          findPdfFeatureCapability(fallback.invocation.featureId)!,
          "pdf.capability.bindingIdentityMismatch",
        );
      }
      if (!current()) {
        return blockedPdfAuthorityDecision(
          capability,
          "pdf.capability.registryStale",
        );
      }
      if (
        located.entry.mutationClass === "receipt-bearing-mutation" &&
        receiptMutationInFlight
      ) {
        return boundSetDecision(capability, "pdf.capability.mutationInFlight");
      }
      return located.authority.resolve(invocation, context, runtime);
    };

    const execute: PdfCommandAuthoritySet["execute"] = async (
      invocation,
      context,
      runtime,
    ) => {
      const located = locate(invocation);
      if (!located || !current()) return "blocked";
      const receiptBearing =
        located.entry.mutationClass === "receipt-bearing-mutation";
      if (receiptBearing && receiptMutationInFlight) return "blocked";
      if (receiptBearing) receiptMutationInFlight = true;
      try {
        const outcome = await located.authority.execute(
          invocation,
          context,
          runtime,
        );
        return current() ? outcome : "blocked";
      } finally {
        if (receiptBearing) receiptMutationInFlight = false;
      }
    };

    return Object.freeze({
      host,
      invocations,
      readBindingManifests,
      resolve,
      execute,
    });
  };

  return Object.freeze({ host, invocations, bind });
}

/**
 * Compatibility seam for the two not-yet-leased hosts. It deliberately does
 * not expose a binding manifest and therefore cannot be treated as v4 handler
 * authority. Host wiring must migrate each action to an owner above.
 */
export function createPdfFeatureCommandRegistry(
  boundFeatureIds: readonly PdfBoundCommandId[],
  onTelemetry?: (event: PdfCommandTelemetryEvent) => void,
): PdfFeatureCommandRegistry {
  const boundFeatureSet = new Set<PdfBoundCommandId>();
  for (const featureId of boundFeatureIds) {
    const capability = findPdfFeatureCapability(featureId);
    if (!capability) {
      throw new Error(`Unknown pdf feature command: ${featureId}`);
    }
    if (capability.command.disposition !== "runtime-bindable") {
      throw new Error(`Inert PDF capability has handler binding: ${featureId}`);
    }
    if (boundFeatureSet.has(featureId)) {
      throw new Error(`Duplicate pdf feature command: ${featureId}`);
    }
    boundFeatureSet.add(featureId);
  }

  const base = createFeatureCommandRegistry<
    PdfFeatureCapability,
    PdfCapabilityContext,
    PdfFeatureRuntimeState,
    PdfCapabilityHost
  >({
    editor: "pdf",
    catalog: PDF_FEATURE_CAPABILITY_REGISTRY,
    find: findPdfFeatureCapability,
    resolveCapability: resolvePdfFeatureCapability,
    bindings: boundFeatureIds.map((featureId) => ({
      featureId,
      // Payload dispatch remains in this PDF adapter and is supplied only at
      // event time. The shared registry receives a static sentinel so React
      // render cannot expose a ref-capturing host handler to registry setup.
      execute: acceptValidatedBinding,
    })),
  });

  const resolve = (
    invocation: PdfCommandInvocation,
    context: PdfCapabilityContext,
    runtime: PdfFeatureRuntimeState,
    dispatcherAvailable = false,
  ): ResolvedPdfFeatureCommand => {
    const baseDecision = base.resolve(invocation.featureId, context, runtime);
    const capabilityDecision = resolvePdfFeatureCapability(
      baseDecision.capability,
      context,
      runtime,
    );
    const unboundReason =
      !baseDecision.bound && capabilityDecision.enabled
        ? "pdf.capability.commandNotBound"
        : null;
    const dispatcherMissing = baseDecision.enabled && !dispatcherAvailable;
    return {
      ...baseDecision,
      enabled: baseDecision.enabled && !dispatcherMissing,
      disposition: capabilityDecision.disposition,
      reasonKey: dispatcherMissing
        ? "pdf.capability.handlerNotProvided"
        : (unboundReason ??
          baseDecision.reasonKey ??
          capabilityDecision.reasonKey),
      reasonLabel: capabilityDecision.reasonLabel,
    };
  };

  const execute: PdfFeatureCommandRegistry["execute"] = async (
    invocation,
    context,
    runtime,
    dispatch,
  ) => {
    const decision = resolve(invocation, context, runtime, Boolean(dispatch));
    if (!decision.enabled) {
      onTelemetry?.({
        featureId: invocation.featureId,
        action: invocation.action,
        outcome: "blocked",
        disposition: decision.disposition,
        reasonKey: decision.reasonKey,
      });
      return "blocked";
    }
    if (!boundFeatureSet.has(invocation.featureId) || !dispatch) {
      onTelemetry?.({
        featureId: invocation.featureId,
        action: invocation.action,
        outcome: "blocked",
        disposition: decision.disposition,
        reasonKey: "pdf.capability.handlerNotProvided",
      });
      return "blocked";
    }
    const result = await dispatch(invocation);
    const outcome = result === false ? "blocked" : "executed";
    onTelemetry?.({
      featureId: invocation.featureId,
      action: invocation.action,
      outcome,
      disposition: decision.disposition,
      reasonKey: outcome === "blocked" ? "pdf.capability.handlerBlocked" : null,
    });
    return outcome;
  };

  return Object.freeze({
    featureIds: base.featureIds,
    resolve,
    execute,
  });
}

export interface PdfCommandShortcutEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey?: boolean;
  readonly defaultPrevented?: boolean;
}

/** Save/Print are routed to the same canonical commands as their buttons. */
export function resolvePdfCommandShortcut(
  event: PdfCommandShortcutEvent,
): PdfCommandInvocation | null {
  if (
    event.defaultPrevented ||
    event.altKey ||
    !(event.metaKey || event.ctrlKey)
  ) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "s") {
    if (event.shiftKey === true) {
      return { featureId: "PDF-FIL-DOC-03", action: "download-current" };
    }
    return { featureId: "PDF-FIL-DOC-02", action: "save-current" };
  }
  if (key === "p") {
    if (event.shiftKey === true) return null;
    return { featureId: "PDF-FIL-DOC-06", action: "print" };
  }
  return null;
}

export function isPdfBoundCommandId(
  id: PdfCanonicalId,
): id is PdfBoundCommandId {
  return PDF_COMMAND_BINDING_DESCRIPTORS.some(
    (descriptor) => descriptor.featureId === id,
  );
}
