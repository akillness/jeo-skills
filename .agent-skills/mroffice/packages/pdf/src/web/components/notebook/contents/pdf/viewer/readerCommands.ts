/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  PDF_CROSS_TAB_COMMANDS,
  type PdfCommandInvocation,
} from "../commandRegistry";
import type { HighlightMarkupStyle } from "@mrnote/core/web/lib/pdf/highlight-markup.ts";

/** Command invocations the reader issues through the PDF command contract. */

export const PDF_READER_DOWNLOAD_ORIGINAL_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-original",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DOWNLOAD_CURRENT_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-current",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DOWNLOAD_ANNOTATED_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-annotated",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DOWNLOAD_FILLABLE_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-fillable",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DOWNLOAD_EDITABLE_ANNOTATIONS_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-editable-annotations",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DOWNLOAD_ARCHIVAL_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-archival",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DOWNLOAD_PROPERTIES_COMMAND = {
  featureId: "PDF-FIL-DOC-03",
  action: "download-properties",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_PRINT_COMMAND = {
  featureId: "PDF-FIL-DOC-06",
  action: "print",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_APPLY_REDACTIONS_COMMAND = {
  featureId: "PDF-SEC-REDACT-02",
  action: "pdf.redaction.apply",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DANGEROUS_ACTION_SAFE_COPY_COMMAND = {
  featureId: "PDF-SEC-SAFE-01",
  action: "pdf.security.safe-copy",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_EXTRACT_COMMAND = {
  featureId: "PDF-PAG-STRUCT-03",
  action: "pdf.page.extract",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_SPLIT_COMMAND = {
  featureId: "PDF-TOO-FILE-01",
  action: "pdf.file.split",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_MERGE_COMMAND = {
  featureId: "PDF-TOO-FILE-02",
  action: "pdf.file.merge",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_INSERT_FILE_COMMAND = {
  featureId: "PDF-INS-PAGE-02",
  action: "pdf.page.insert-file",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_COMPRESS_LOSSLESS_COMMAND = {
  featureId: "PDF-TOO-FILE-03",
  action: "pdf.file.compress-lossless",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_COMPRESS_LOSSY_COMMAND = {
  featureId: "PDF-TOO-FILE-03",
  action: "pdf.file.compress-lossy",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DESKEW_COMMAND = {
  featureId: "PDF-TOO-FILE-04",
  action: "pdf.file.deskew-page",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_CREATE_FORM_FIELDS_COMMAND = {
  featureId: "PDF-FRM-AUTH-02",
  action: "pdf.form.create-detected-fields",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_EDIT_EXISTING_FORM_FIELD_COMMAND = {
  featureId: "PDF-FRM-AUTH-02",
  action: "pdf.form.edit-existing-field",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_DELETE_EXISTING_FORM_FIELD_COMMAND = {
  featureId: "PDF-FRM-AUTH-02",
  action: "pdf.form.delete-existing-field",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_RESET_FORM_VALUES_COMMAND = {
  featureId: "PDF-FRM-AUTH-03",
  action: "pdf.form.reset-values",
} as const satisfies PdfCommandInvocation;
export const PDF_READER_IMPORT_FORM_DATA_COMMAND = {
  featureId: "PDF-FRM-AUTH-03",
  action: "pdf.form.import-data",
} as const satisfies PdfCommandInvocation;

export const PDF_READER_NATIVE_ACTIVATION_COMMANDS = Object.freeze([
  PDF_CROSS_TAB_COMMANDS.imageInsertActivate,
  PDF_CROSS_TAB_COMMANDS.freeTextActivate,
  PDF_CROSS_TAB_COMMANDS.highlightActivate,
  PDF_CROSS_TAB_COMMANDS.areaHighlightActivate,
  PDF_CROSS_TAB_COMMANDS.underlineActivate,
  PDF_CROSS_TAB_COMMANDS.strikeoutActivate,
  PDF_CROSS_TAB_COMMANDS.squigglyActivate,
  PDF_CROSS_TAB_COMMANDS.replaceMarkActivate,
  PDF_CROSS_TAB_COMMANDS.insertCaretActivate,
  PDF_CROSS_TAB_COMMANDS.noteActivate,
  PDF_CROSS_TAB_COMMANDS.inkActivate,
  PDF_CROSS_TAB_COMMANDS.shapeActivate,
  PDF_CROSS_TAB_COMMANDS.stampActivate,
  PDF_CROSS_TAB_COMMANDS.fileAttachmentActivate,
  PDF_CROSS_TAB_COMMANDS.measureActivate,
  PDF_CROSS_TAB_COMMANDS.linkActivate,
  PDF_CROSS_TAB_COMMANDS.visualSignatureActivate,
]);

export interface PendingPdfReaderActivation {
  readonly invocation: (typeof PDF_READER_NATIVE_ACTIVATION_COMMANDS)[number];
  readonly execute: () => boolean;
}

export function textMarkupActivationInvocation(
  style: HighlightMarkupStyle,
): (typeof PDF_READER_NATIVE_ACTIVATION_COMMANDS)[number] {
  switch (style) {
    case "highlight":
      return PDF_CROSS_TAB_COMMANDS.highlightActivate;
    case "underline":
      return PDF_CROSS_TAB_COMMANDS.underlineActivate;
    case "strikethrough":
      return PDF_CROSS_TAB_COMMANDS.strikeoutActivate;
    case "squiggly":
      return PDF_CROSS_TAB_COMMANDS.squigglyActivate;
  }
}
