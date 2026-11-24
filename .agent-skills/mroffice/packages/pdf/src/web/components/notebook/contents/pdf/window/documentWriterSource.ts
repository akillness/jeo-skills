/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  pdfNativeWorkingHead,
  registerPdfNativeWorkingHead,
} from "../../../../../lib/pdf/remote/pdf-native-sources";
import type { PdfNativeEngineSourceRef } from "../../../../../lib/pdf/pdf-native-remote";
import { sha256PdfBytes } from "../../../../../lib/pdf/engine/native/transaction-error";









export async function nameDocumentWriterSource(
  bytes: Uint8Array,
  ref: PdfNativeEngineSourceRef | null,
): Promise<void> {
  if (!ref) return;
  const sha256 = await sha256PdfBytes(bytes);
  if (!pdfNativeWorkingHead(sha256, ref.pageId)) registerPdfNativeWorkingHead(sha256, ref);
}
