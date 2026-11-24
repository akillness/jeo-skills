/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfFormField } from "../../../../../lib/pdf/page-content-model";

export interface PendingPdfFormGestureCommit {
  readonly generation: string;
  readonly gestureId: string;
  readonly fields: PdfFormField[];
  /** The gesture's fields as shown before it (NativePdfFormPendingGesture). */
  readonly previous?: PdfFormField[];
}

export type PdfNativeFormWriteOwnerEntry = {
  ownerId: string | null;
  readonly listeners: Set<() => void>;
};

/**
 * One client-runtime owner for a receipt-bearing form mutation on one PDF.
 *
 * Page checkout is user-scoped, so two views owned by the same user are both
 * legitimately writable at the collaboration layer. Native PDF patchback is
 * stricter: both views start from the same source bytes and must not race two
 * independent receipts. This PDF-local registry publishes that narrower
 * ownership before another mounted viewer can accept a form gesture.
 */
export const pdfNativeFormWriteOwners = new Map<
  string,
  PdfNativeFormWriteOwnerEntry
>();

export function pdfNativeFormWriteOwnerScope(
  pageId: string,
  dataItemId: string | null,
): string | null {
  const normalizedPageId = pageId.trim();
  const normalizedDataItemId = dataItemId?.trim() ?? "";
  return normalizedPageId && normalizedDataItemId
    ? JSON.stringify([normalizedPageId, normalizedDataItemId])
    : null;
}

export function readPdfNativeFormWriteOwner(scope: string | null): string | null {
  return scope ? (pdfNativeFormWriteOwners.get(scope)?.ownerId ?? null) : null;
}

export function subscribePdfNativeFormWriteOwner(
  scope: string | null,
  listener: () => void,
): () => void {
  if (!scope) return () => {};
  let entry = pdfNativeFormWriteOwners.get(scope);
  if (!entry) {
    entry = { ownerId: null, listeners: new Set() };
    pdfNativeFormWriteOwners.set(scope, entry);
  }
  entry.listeners.add(listener);
  return () => {
    const live = pdfNativeFormWriteOwners.get(scope);
    if (!live) return;
    live.listeners.delete(listener);
    if (live.ownerId === null && live.listeners.size === 0) {
      pdfNativeFormWriteOwners.delete(scope);
    }
  };
}

export function claimPdfNativeFormWriteOwner(
  scope: string | null,
  ownerId: string,
): boolean {
  if (!scope) return false;
  let entry = pdfNativeFormWriteOwners.get(scope);
  if (!entry) {
    entry = { ownerId: null, listeners: new Set() };
    pdfNativeFormWriteOwners.set(scope, entry);
  }
  if (entry.ownerId !== null && entry.ownerId !== ownerId) return false;
  if (entry.ownerId === ownerId) return true;
  entry.ownerId = ownerId;
  for (const listener of entry.listeners) listener();
  return true;
}

export function releasePdfNativeFormWriteOwner(
  scope: string | null,
  ownerId: string,
): boolean {
  if (!scope) return false;
  const entry = pdfNativeFormWriteOwners.get(scope);
  if (!entry || entry.ownerId !== ownerId) return false;
  entry.ownerId = null;
  for (const listener of entry.listeners) listener();
  if (entry.listeners.size === 0) pdfNativeFormWriteOwners.delete(scope);
  return true;
}
