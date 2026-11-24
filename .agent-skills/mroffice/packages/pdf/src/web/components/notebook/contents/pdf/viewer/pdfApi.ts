/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { loadCompatiblePdfJs } from "@mrnote/core/web/lib/pdf/pdfjs-runtime.ts";

// Lazy import so the heavy PDF.js bundle only ships in routes that use it.
export type PdfApi = typeof import("pdfjs-dist");
export type PdfDocument = Awaited<ReturnType<PdfApi["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

export type LoadedPdfSourceIdentity = Readonly<{
  document: PdfDocument;
  dataItemId: string | null;
  url: string;
  byteGenerationKey: string;
  documentRevision: string | number;
}>;

export async function loadPdfApi(): Promise<PdfApi> {
  return loadCompatiblePdfJs();
}
