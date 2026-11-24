/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfEngineSourceIdentity } from "../../../../../lib/pdf/engine/contracts";
import type {
  PdfPatchbackIncompleteMarker,
  PageItem,
} from "@mrnote/core/web/lib/notebook-sdk.ts";
import type {
  PdfInsertPageSelection,
} from "../PdfInsertPageDialog";
import { MAX_INSERTED_PAGES } from "@mrnote/core/web/lib/pdf/page-ops.ts";

export type PdfInsertPageAuthorityKind = "clean_loaded" | "dirty_saved";

export interface PdfDurableContentCommit {
  readonly pageId: string;
  readonly contentVersion: number;
  readonly dataItemId: string;
  readonly sourceSignature: string;
  readonly contentSignature: string;
  readonly inventorySignature: string;
  readonly insertedPageCount: number;
}

export interface PdfInsertPageContentAuthority extends PdfDurableContentCommit {
  readonly kind: PdfInsertPageAuthorityKind;
  readonly token: string;
  readonly sourceResourceId: string;
  readonly sourceRevision: string;
}

export interface PdfSourceBoundNativeMutationSaveAuthority {
  readonly authority: PdfInsertPageContentAuthority;
  readonly source: PdfEngineSourceIdentity;
}

export type PdfSourceBoundNativeMutationCommitResult =
  | Readonly<{
      kind: "saved";
      savedPage: PageItem;
      source: PdfEngineSourceIdentity;
    }>
  | Readonly<{ kind: "rejected"; savedPage: PageItem | null }>
  /** AutoSave off: the edit stays on screen as an unsaved change of the
   * page; the window's Save writes it (with everything else held). */
  | Readonly<{ kind: "held"; savedPage: null }>;

export interface PdfPendingPatchbackRepair extends PdfDurableContentCommit {
  readonly content: Record<string, unknown>;
  readonly previousContent: Record<string, unknown>;
  readonly incompleteMarker: PdfPatchbackIncompleteMarker | null;
}

export type PdfFormulaSourceSaveResult =
  | {
      readonly kind: "saved";
      readonly authority: PdfInsertPageContentAuthority;
    }
  | {
      readonly kind: "patchback_incomplete";
      readonly repair: PdfPendingPatchbackRepair;
    }
  /** AutoSave on: staged on the working copy, saved by its queue in order. */
  | { readonly kind: "staged" }
  /** Nothing to write: the saved page holds this list already, in the very
   * file the write would start from (pdfPageSaveWouldChangeNothing). */
  | { readonly kind: "unchanged" }
  | null;

export type PdfInsertPageFormulaFlushResult =
  | { readonly kind: "clean_loaded" }
  | {
      readonly kind: "dirty_saved";
      readonly authority: PdfInsertPageContentAuthority;
    };

export const PDF_INSERT_PAGE_GUARD_CONTEXT_KEY = "pdf_insert_page_guard";
export const PDF_INSERT_PAGE_TERMINAL_TIMEOUT_MS = 120_000;

export interface PdfInsertPageOperationGuard {
  version: 1;
  authorityKind: PdfInsertPageAuthorityKind;
  authorityToken: string;
  pageId: string;
  dataItemId: string;
  sourceSignature: string;
  sourceResourceId: string;
  sourceRevision: string;
  contentVersion: number;
  sourcePageCount: number;
  effectivePageCount: number;
  currentPage: number;
  visiblePageNumber: number;
  previousVisibleOriginalPage: number;
  inventorySignature: string;
  originalOrderSignature: string;
  insertedPageCount: number;
  afterPage: number;
  placement: PdfInsertPageSelection["placement"];
  width: number;
  height: number;
  explicitTarget?: boolean;
}

export interface PdfInsertPageAuthorityState {
  authorityKind: PdfInsertPageAuthorityKind;
  authorityToken: string;
  pageId: string;
  dataItemId: string;
  previewUrl: string;
  sourceSignature: string;
  sourceResourceId: string;
  sourceRevision: string;
  contentVersion: number;
  sourcePageCount: number;
  effectivePageCount: number;
  currentPage: number;
  visiblePageNumber: number;
  previousVisibleOriginalPage: number;
  inventorySignature: string;
  originalOrderSignature: string;
  insertedPageCount: number;
  originalPageOrder: number[];
}

export function readPdfInsertPageOperationGuard(
  value: unknown,
): PdfInsertPageOperationGuard | null {
  if (!value || typeof value !== "object") return null;
  const guard = value as Partial<PdfInsertPageOperationGuard>;
  if (
    guard.version !== 1 ||
    (guard.authorityKind !== "clean_loaded" &&
      guard.authorityKind !== "dirty_saved") ||
    typeof guard.authorityToken !== "string" ||
    typeof guard.pageId !== "string" ||
    typeof guard.dataItemId !== "string" ||
    typeof guard.sourceSignature !== "string" ||
    typeof guard.sourceResourceId !== "string" ||
    typeof guard.sourceRevision !== "string" ||
    !Number.isSafeInteger(guard.contentVersion) ||
    !Number.isSafeInteger(guard.sourcePageCount) ||
    !Number.isSafeInteger(guard.effectivePageCount) ||
    !Number.isSafeInteger(guard.currentPage) ||
    !Number.isSafeInteger(guard.visiblePageNumber) ||
    !Number.isSafeInteger(guard.previousVisibleOriginalPage) ||
    typeof guard.inventorySignature !== "string" ||
    typeof guard.originalOrderSignature !== "string" ||
    !Number.isSafeInteger(guard.insertedPageCount) ||
    !Number.isSafeInteger(guard.afterPage) ||
    (guard.placement !== "before" && guard.placement !== "after") ||
    typeof guard.width !== "number" ||
    !Number.isFinite(guard.width) ||
    guard.width <= 0 ||
    typeof guard.height !== "number" ||
    !Number.isFinite(guard.height) ||
    guard.height <= 0 ||
    (guard.explicitTarget !== undefined && guard.explicitTarget !== true)
  ) {
    return null;
  }
  return guard as PdfInsertPageOperationGuard;
}

export function pdfInsertPageGuardMatchesAuthority(
  guard: PdfInsertPageOperationGuard,
  current: PdfInsertPageAuthorityState,
): boolean {
  const expectedAfterPage =
    guard.placement === "before"
      ? current.previousVisibleOriginalPage
      : current.currentPage;
  return (
    current.dataItemId.length > 0 &&
    current.contentVersion > 0 &&
    current.sourcePageCount > 0 &&
    current.effectivePageCount === current.sourcePageCount &&
    current.currentPage > 0 &&
    current.currentPage <= current.effectivePageCount &&
    current.insertedPageCount < MAX_INSERTED_PAGES &&
    guard.insertedPageCount < MAX_INSERTED_PAGES &&
    guard.authorityKind === current.authorityKind &&
    guard.authorityToken === current.authorityToken &&
    guard.pageId === current.pageId &&
    guard.dataItemId === current.dataItemId &&
    guard.sourceSignature === current.sourceSignature &&
    guard.sourceResourceId === current.sourceResourceId &&
    guard.sourceRevision === current.sourceRevision &&
    guard.contentVersion === current.contentVersion &&
    guard.sourcePageCount === current.sourcePageCount &&
    guard.effectivePageCount === current.effectivePageCount &&
    guard.currentPage === current.currentPage &&
    guard.visiblePageNumber === current.visiblePageNumber &&
    guard.previousVisibleOriginalPage === current.previousVisibleOriginalPage &&
    guard.inventorySignature === current.inventorySignature &&
    guard.originalOrderSignature === current.originalOrderSignature &&
    guard.insertedPageCount === current.insertedPageCount &&
    // The dialog inserts beside the page it was opened on; a command that
    // names its page (the page grid) beside any page still in the file.
    (guard.explicitTarget === true || guard.afterPage === expectedAfterPage) &&
    guard.afterPage >= 0 &&
    (guard.afterPage === 0 ||
      current.originalPageOrder.includes(guard.afterPage)) &&
    current.originalPageOrder.includes(current.currentPage)
  );
}
