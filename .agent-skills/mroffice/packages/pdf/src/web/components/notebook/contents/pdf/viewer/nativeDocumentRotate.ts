/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfRotation } from "@mrnote/core/web/lib/pdf/page-ops.ts";
import type { PdfDocument } from "./pdfApi";

export type NativeDocumentRotatePage = Readonly<{
  page: number;
  width: number;
  height: number;
  rotation: PdfRotation;
}>;

export type NativeDocumentRotateAuthority = Readonly<{
  generation: number;
  document: PdfDocument | null;
  dataItemId: string | null;
  url: string;
  byteGenerationKey: string;
  documentRevision: string | number;
  incomingStructureIdentity: string;
  inventoryIdentity: string;
  inventory: readonly NativeDocumentRotatePage[] | null;
  rotationsReady: boolean;
  nativeHost: boolean;
}>;

export type PendingNativeDocumentRotateAuthority = Readonly<{
  receiptId: number;
  generation: number;
  document: PdfDocument;
  documentRevision: string | number;
  inventoryIdentity: string;
  base: readonly NativeDocumentRotatePage[];
  submitted: readonly (readonly NativeDocumentRotatePage[])[];
  callbackAccepted: boolean;
  acknowledgementTimeoutId: number;
}>;

export const MAX_PENDING_NATIVE_DOCUMENT_ROTATIONS = 3;
export const NATIVE_DOCUMENT_ROTATE_ACK_TIMEOUT_MS = 1_500;

export type NativeDocumentRotateReceiptScope = Pick<
  PendingNativeDocumentRotateAuthority,
  | "receiptId"
  | "generation"
  | "document"
  | "documentRevision"
  | "inventoryIdentity"
>;

export function matchesNativeDocumentRotateReceipt(
  pending: PendingNativeDocumentRotateAuthority,
  expected: NativeDocumentRotateReceiptScope,
): boolean {
  return (
    pending.receiptId === expected.receiptId &&
    pending.generation === expected.generation &&
    pending.document === expected.document &&
    pending.documentRevision === expected.documentRevision &&
    pending.inventoryIdentity === expected.inventoryIdentity
  );
}

export function clearPendingNativeDocumentRotate(
  pendingRef: {
    current: PendingNativeDocumentRotateAuthority | null;
  },
  expected?: NativeDocumentRotateReceiptScope,
): boolean {
  const pending = pendingRef.current;
  if (
    pending === null ||
    (expected !== undefined &&
      !matchesNativeDocumentRotateReceipt(pending, expected))
  ) {
    return false;
  }
  pendingRef.current = null;
  globalThis.clearTimeout(pending.acknowledgementTimeoutId);
  return true;
}

export function acceptPendingNativeDocumentRotate(
  pendingRef: {
    current: PendingNativeDocumentRotateAuthority | null;
  },
  expected: NativeDocumentRotateReceiptScope,
): boolean {
  const pending = pendingRef.current;
  if (
    pending === null ||
    !matchesNativeDocumentRotateReceipt(pending, expected)
  ) {
    return false;
  }
  if (!pending.callbackAccepted) {
    pendingRef.current = { ...pending, callbackAccepted: true };
  }
  return true;
}

export function sameNativeDocumentRotateState(
  left: readonly NativeDocumentRotatePage[],
  right: readonly NativeDocumentRotatePage[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (page, index) =>
        page.page === right[index]?.page &&
        page.rotation === right[index]?.rotation,
    )
  );
}
