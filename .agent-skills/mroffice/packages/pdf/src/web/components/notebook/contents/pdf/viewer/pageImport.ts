/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfRibbonTranslator } from "../pdfRibbonTranslator";
import { isImportableImageFile } from "../../../../../lib/pdf/images-to-pdf";
import { isPdfDeskewRasterCanvasWithinBudget } from "../../../../../lib/pdf/save-policy";

export type PdfPageImportSourceKind =
  "file" | "pdf" | "docx" | "xlsx" | "pptx" | "image" | "txt";
export type ResolvedPdfPageImportSourceKind = Exclude<PdfPageImportSourceKind, "file">;

export const PDF_PAGE_IMPORT_ACCEPT: Readonly<
  Record<PdfPageImportSourceKind, string>
> = {
  file: ".pdf,.docx,.docm,.xlsx,.pptx,.txt,image/*",
  pdf: ".pdf,application/pdf",
  docx: ".docx,.docm,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-word.document.macroenabled.12",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  image: "image/*",
  txt: ".txt,text/plain",
};

export function pdfPageImportKindForFile(
  file: Pick<File, "name" | "type">,
): ResolvedPdfPageImportSourceKind | null {
  // capability:label-only — picks the reader for a File the user just chose
  // from their disk to import INTO this PDF. It is not a workspace file and
  // has no id, so useFileCapability cannot answer for it; the caller
  // (resolvePdfPageImportSourceKind) additionally refuses a file whose
  // detected kind disagrees with the entry point the user used.
  const name = file.name.toLowerCase();
  const mediaType = file.type.split(";", 1)[0].toLowerCase();
  // capability:label-only
  if (mediaType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    name.endsWith(".docx") || // capability:label-only
    name.endsWith(".docm") ||
    mediaType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mediaType === "application/vnd.ms-word.document.macroenabled.12"
  ) {
    return "docx";
  }
  if (
    name.endsWith(".xlsx") || // capability:label-only
    mediaType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx";
  }
  if (
    name.endsWith(".pptx") || // capability:label-only
    mediaType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "pptx";
  }
  if (isImportableImageFile(file)) return "image";
  // capability:label-only
  if (name.endsWith(".txt") || mediaType === "text/plain") return "txt";
  return null;
}

export function resolvePdfPageImportSourceKind(
  requestedKind: PdfPageImportSourceKind,
  files: readonly File[],
): ResolvedPdfPageImportSourceKind | null {
  if (files.length === 0) return null;
  const detected = pdfPageImportKindForFile(files[0]);
  const resolved = requestedKind === "file" ? detected : requestedKind;
  if (!resolved || detected !== resolved) return null;
  if (resolved === "image") {
    return files.every((file) => isImportableImageFile(file)) ? "image" : null;
  }
  return files.length === 1 ? resolved : null;
}

export function pdfPageImportOutputName(file: File, kind: string): string {
  const stem = file.name.replace(/\.[^.]+$/, "").trim() || "document";
  return `${stem}${kind === "image" ? "-images" : ""}.pdf`;
}

export function pdfPageImportSourceLabel(
  kind: PdfPageImportSourceKind,
  t: PdfRibbonTranslator,
): string {
  const labels: Readonly<Record<PdfPageImportSourceKind, string>> = {
    file: "pdf.viewer.importFromFile",
    pdf: "pdf.viewer.importPdfFile",
    docx: "pdf.viewer.importWordFile",
    xlsx: "pdf.viewer.importExcelFile",
    pptx: "pdf.viewer.importPowerPointFile",
    image: "pdf.viewer.importImages",
    txt: "pdf.viewer.importTxtFile",
  };
  return t(labels[kind]);
}

export function readPngRasterDimensions(
  bytes: Uint8Array,
): Readonly<{ width: number; height: number }> | null {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return isPdfDeskewRasterCanvasWithinBudget(width, height)
    ? Object.freeze({ width, height })
    : null;
}
