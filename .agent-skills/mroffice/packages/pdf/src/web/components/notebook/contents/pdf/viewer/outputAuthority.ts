/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createPdfCommandConsentDocumentAuthority } from "../commandConsent";
import type {
  PdfSemanticAppearanceInspectionSession,
} from "../../../../../lib/pdf/semantic-appearance-inspection";
import type { PdfPrintPageInventory } from "../../../../../lib/pdf/print-preflight";
import type { RedactionAnnotation } from "@mrnote/core/web/lib/pdf/redaction.ts";
import type { PdfDocument } from "./pdfApi";
import type { PdfCommandConsentReceipt } from "../commandConsent";
import type {
  PdfOutputLossReport,
  PdfSavePolicyDecision,
  PdfSavePolicyRequest,
} from "../../../../../lib/pdf/save-policy";

export interface VisualMaskShapeMutationReceipt {
  documentIdentity: string;
  epoch: number;
}

export type VisualMaskHydrationStatus = "pending" | "ready" | "failed";

export interface RedactionMutationReceipt {
  documentIdentity: string;
  epoch: number;
}

export interface RedactionDeleteUndoReceipt {
  dataItemId: string;
  sourceUrl: string;
  documentIdentity: string;
  hydrationGeneration: number;
  mutationEpoch: number;
  annotation: RedactionAnnotation;
}

export interface RedactionUndoRestoreExpectation {
  documentIdentity: string;
  hydrationGeneration: number;
  mutationEpoch: number;
  deletedAnnotationId: string;
  serverIdentitiesBeforePost: readonly string[];
  returnedAnnotationId: string | null;
  annotation: Omit<RedactionAnnotation, "id">;
}

export type RedactionHydrationStatus = "pending" | "ready" | "failed";

export interface VisualMaskOutputAuthoritySnapshot {
  hydrationDocumentIdentity: string;
  hydrationGeneration: number;
  hydrationStatus: VisualMaskHydrationStatus;
  mutationDocumentIdentity: string;
  mutationEpoch: number;
  visualMaskWritesInFlight: number;
  riskPresent: boolean;
  redactionHydrationDocumentIdentity: string;
  redactionHydrationGeneration: number;
  redactionHydrationStatus: RedactionHydrationStatus;
  redactionMutationDocumentIdentity: string;
  redactionMutationEpoch: number;
  redactionWritesInFlight: number;
  redactionRiskPresent: boolean;
}

export interface PendingPdfPrintPreflight {
  readonly document: PdfDocument;
  readonly dataItemId: string;
  readonly url: string;
  readonly byteGenerationKey: string;
  readonly documentRevision: string | number;
  readonly sourceSha256: string;
  readonly documentAuthority: ReturnType<
    typeof createPdfCommandConsentDocumentAuthority
  >;
  readonly editRevision: number;
  readonly hasEdits: boolean;
  readonly outputAuthority: VisualMaskOutputAuthoritySnapshot;
  readonly inventory: PdfPrintPageInventory;
}

export interface RetainedPdfPrintSourceBytes {
  readonly document: PdfDocument;
  readonly dataItemId: string;
  readonly url: string;
  readonly byteGenerationKey: string;
  readonly documentRevision: string | number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

export interface PdfSemanticAppearanceInspectionBinding {
  readonly session: PdfSemanticAppearanceInspectionSession;
  readonly generation: number;
  readonly document: PdfDocument;
  readonly dataItemId: string;
  readonly url: string;
  readonly byteGenerationKey: string;
  readonly documentRevision: string | number;
  readonly sourceSha256: string;
}

export interface PdfOutputAuthorityGuardOptions {
  /**
   * Canvas-backed outputs cannot bake DOM/SVG redaction or visual-mask
   * overlays. They may publish only from an exact, fully hydrated document
   * with no live mask/mark risk.
   */
  requireRiskFreeRasterSource?: boolean;
}

export function isRiskFreeRasterOutputAuthority(
  authority: VisualMaskOutputAuthoritySnapshot,
): boolean {
  return (
    authority.hydrationDocumentIdentity ===
      authority.mutationDocumentIdentity &&
    authority.hydrationStatus === "ready" &&
    authority.visualMaskWritesInFlight === 0 &&
    !authority.riskPresent &&
    authority.redactionHydrationDocumentIdentity ===
      authority.redactionMutationDocumentIdentity &&
    authority.redactionHydrationStatus === "ready" &&
    authority.redactionWritesInFlight === 0 &&
    !authority.redactionRiskPresent
  );
}

export function visualMaskOutputAuthorityMatches(
  expected: VisualMaskOutputAuthoritySnapshot,
  current: VisualMaskOutputAuthoritySnapshot,
): boolean {
  return (
    current.hydrationDocumentIdentity ===
      expected.hydrationDocumentIdentity &&
    current.hydrationGeneration === expected.hydrationGeneration &&
    current.hydrationStatus === expected.hydrationStatus &&
    current.mutationDocumentIdentity === expected.mutationDocumentIdentity &&
    current.mutationEpoch === expected.mutationEpoch &&
    current.visualMaskWritesInFlight === expected.visualMaskWritesInFlight &&
    current.riskPresent === expected.riskPresent &&
    current.redactionHydrationDocumentIdentity ===
      expected.redactionHydrationDocumentIdentity &&
    current.redactionHydrationGeneration ===
      expected.redactionHydrationGeneration &&
    current.redactionHydrationStatus === expected.redactionHydrationStatus &&
    current.redactionMutationDocumentIdentity ===
      expected.redactionMutationDocumentIdentity &&
    current.redactionMutationEpoch === expected.redactionMutationEpoch &&
    current.redactionWritesInFlight === expected.redactionWritesInFlight &&
    current.redactionRiskPresent === expected.redactionRiskPresent
  );
}

export interface PendingPdfOutputConsent {
  readonly request: PdfSavePolicyRequest;
  readonly decision: PdfSavePolicyDecision;
  readonly lossReport: PdfOutputLossReport;
  readonly resolve: (receipt: PdfCommandConsentReceipt | null) => void;
}
