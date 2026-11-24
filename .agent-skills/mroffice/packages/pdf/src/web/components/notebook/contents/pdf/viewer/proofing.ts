/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  ManagedPdfProofingAnnotation,
} from "@mrnote/core/web/lib/pdf/native-text-markup-writeback.ts";

export interface PdfProofingDraft {
  readonly id: string;
  readonly page: number;
  readonly geometry: ManagedPdfProofingAnnotation;
  readonly replacementText: string;
}

export function createPdfProofingId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `proofing-${crypto.randomUUID()}`
    : `proofing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
