/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfEngineResult } from "../../../../../lib/pdf/engine/contracts";
import {
  isMraiNativeListTextMissingGlyphRefusal,
} from "../../../../../lib/pdf/engine/native/list-text-model";
import type { PdfRibbonTranslator } from "../pdfRibbonTranslator";

export type PdfSourceTextPreparationStage = "lease" | "source-seal" | "appearance" | "binding-too-long" | "reconciliation" | "superseded" | "server" | "unexpected";
export interface PdfSourceTextPreparationDiagnostic {
  stage: PdfSourceTextPreparationStage;
  failure: PdfSourceTextPreparationStage | null;
  cause?: unknown;
  /** The server write was sent and no server answered it (a dropped
   * connection, a gateway's 5xx): the same write may be asked again. */
  unanswered?: boolean;
  /** The PDF's writer refused the box for good (a glyph, a face, a script
   * it cannot draw): asking again writes nothing more. */
  refusedForGood?: boolean;
}

/** Preserve the existing rejection result; expose only a bounded local stage. */
export async function runPdfSourceTextPreparationDiagnostic(
  execute: (diagnostic: PdfSourceTextPreparationDiagnostic) => Promise<boolean>,
  onRejected: (message: string) => void,
  t: PdfRibbonTranslator,
): Promise<boolean> {
  const diagnostic: PdfSourceTextPreparationDiagnostic = { stage: "lease", failure: null };
  try {
    if (await execute(diagnostic)) return true;
  } catch (error) {
    diagnostic.cause = error;
  }
  const stage = diagnostic.failure ?? diagnostic.stage;
  if (process.env.NODE_ENV === "development") {
    try {
      const cause = diagnostic.cause as { name?: unknown; message?: unknown; stack?: unknown } | null | undefined;
      // The stage names the last step entered, not the line that threw; the
      // top of the stack does (a later step can fail under an earlier label).
      const at = typeof cause?.stack === "string"
        ? cause.stack.split("\n").slice(1, 7).map((line) => line.trim().slice(0, 160)).join(" <- ")
        : null;
      console.warn("[pdf-latency] source-text-prep refused", {
        stage, cause: cause ? `${String(cause.name ?? "Error")}: ${String(cause.message ?? "").slice(0, 300)}` : null, at,
      });
    } catch { /* a diagnostic never throws */ }
  }
  const labels: Record<PdfSourceTextPreparationStage, string> = {
    lease: "pdf.pageWindow.sourceTextPrepLease",
    "source-seal": "pdf.pageWindow.sourceTextPrepSourceSeal",
    appearance: "pdf.pageWindow.sourceTextPrepAppearance",
    "binding-too-long": "pdf.pageWindow.sourceTextPrepBindingTooLong",
    reconciliation: "pdf.pageWindow.sourceTextPrepReconciliation",
    superseded: "pdf.pageWindow.sourceTextPrepSuperseded",
    server: "pdf.pageWindow.sourceTextPrepServer",
    unexpected: "pdf.pageWindow.sourceTextPrepUnexpected",
  };
  onRejected(
    `${t("pdf.pageWindow.sourceTextPrepRejected", { reason: t(labels[stage]) })} [PDF_SOURCE_TEXT_PREP:${stage}]`,
  );
  return false;
}

export function pdfNativeTextSaveCapabilityDocumentReady(input: {
  readonly dataItemId: string | null;
  readonly previewUrl: string;
  readonly nativeTextViewerPreviewUrl: string;
  readonly nativeTextSavePolicyActive: boolean;
}): boolean {
  // Resource recovery can temporarily clear the generic preview while the
  // mounted native-text session deliberately keeps its authenticated bytes,
  // caret, and draft alive. Bind Save to that same live source only while the
  // draft is both dirty and committable; every other command stays fail-closed
  // on the generic page preview.
  return Boolean(
    input.dataItemId &&
      (input.nativeTextSavePolicyActive
        ? input.nativeTextViewerPreviewUrl
        : input.previewUrl),
  );
}

export function pdfNativeFontExtensionFallbackRequired(
  result: PdfEngineResult,
  propertyChanged: boolean,
): boolean {
  return (
    !propertyChanged &&
    result.status === "refused" &&
    result.reason === "unsupported-document" &&
    isMraiNativeListTextMissingGlyphRefusal(result.detail)
  );
}
