/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** PDF-owned runtime adapter for the immutable capability catalog. */

import {
  pdfAcroFormMutationGuardV2Enabled,
  pdfFreeTextRectangleDifferencesV2Enabled,
  pdfOverlayCoordinatesV2Enabled,
  pdfPageWindowMutationGuardV2Enabled,
  pdfRedactionReachabilityV2Enabled,
  pdfRenderLifecycleV2Enabled,
  pdfSavePolicyV1Enabled,
  pdfTextEditStabilityV2Enabled,
} from "../../../../lib/pdf/pdf-flags";
import {
  type PdfCanonicalId,
  type PdfCapabilityHost,
  type PdfFeatureCapability,
  type PdfFeatureFlagId,
  type PdfOutputDisposition,
} from "../../../../lib/pdf/feature-capabilities";
import {
  readPdfSavePolicyDecision,
  verifyPdfSavePolicyDecision,
  type PdfSavePolicyDecision,
  type PdfSavePolicyRequest,
} from "../../../../lib/pdf/save-policy";

import {
  consumePdfCommandConsentReceipt,
  issuePdfCommandConsentReceipt,
  type PdfCommandConsentBinding,
  type PdfCommandConsentDocumentAuthority,
  type PdfCommandConsentReceipt,
} from "./commandConsent";

export interface PdfCapabilityContext {
  readonly host: PdfCapabilityHost;
  readonly documentReady: boolean;
  readonly editable: boolean;
}

export interface PdfRuntimeFeatureDecision {
  readonly enabled: boolean;
  readonly disposition: PdfOutputDisposition;
  readonly reasonKey?: string;
  readonly reasonLabel?: string;
  /** Required for a flattening branch; never inferred from `enabled`. */
  readonly consentGranted?: boolean;
  /**
   * Strong P0.03 policy proof. The opaque decision is accepted only for the
   * exact snapshotted request; callers cannot authorize output by constructing
   * a lookalike object or toggling `enabled`/`consentGranted`.
   */
  readonly savePolicy?: Readonly<{
    request: PdfSavePolicyRequest;
    decision: PdfSavePolicyDecision;
  }>;
}

export interface PdfFeatureRuntimeState {
  readonly featureFlags: Partial<Record<PdfFeatureFlagId, boolean>>;
  readonly decisions: Partial<
    Record<PdfCanonicalId, PdfRuntimeFeatureDecision>
  >;
}

export interface PdfFeatureCapabilityDecision {
  readonly enabled: boolean;
  readonly disposition: PdfOutputDisposition;
  readonly reasonKey: string | null;
  readonly reasonLabel: string | null;
}

function savePolicyConsentBinding(
  documentAuthority: PdfCommandConsentDocumentAuthority,
  decision: PdfSavePolicyDecision,
): PdfCommandConsentBinding | null {
  const view = readPdfSavePolicyDecision(decision);
  if (
    !view ||
    !view.enabled ||
    !view.requiresConsent ||
    view.lossReport.codes.length === 0
  ) {
    return null;
  }
  return {
    documentAuthority,
    host: view.host,
    featureId: view.featureId,
    action: view.action,
    lossCodes: view.lossReport.codes,
    documentRevision: view.documentRevision,
    sourceRevision: view.sourceRevision,
    editRevision: view.editRevision,
  };
}

/** Issue only after the exact visible loss report has been confirmed. */
export function issuePdfSavePolicyConsentReceipt(options: {
  readonly documentAuthority: PdfCommandConsentDocumentAuthority;
  readonly decision: PdfSavePolicyDecision;
  readonly request: PdfSavePolicyRequest;
}): PdfCommandConsentReceipt | null {
  if (!verifyPdfSavePolicyDecision(options.decision, options.request)) {
    return null;
  }
  const binding = savePolicyConsentBinding(
    options.documentAuthority,
    options.decision,
  );
  return binding ? issuePdfCommandConsentReceipt(binding) : null;
}

/**
 * Burn a receipt before re-reading the current request. A stale source/edit
 * snapshot can never retry the same user confirmation against later bytes.
 */
export function consumePdfSavePolicyConsentReceipt(options: {
  readonly receipt: unknown;
  readonly documentAuthority: PdfCommandConsentDocumentAuthority;
  readonly decision: PdfSavePolicyDecision;
  readonly currentRequest: PdfSavePolicyRequest;
}): boolean {
  const binding = savePolicyConsentBinding(
    options.documentAuthority,
    options.decision,
  );
  if (!binding) return false;
  const consumed = consumePdfCommandConsentReceipt(options.receipt, binding);
  return (
    consumed &&
    verifyPdfSavePolicyDecision(options.decision, options.currentRequest)
  );
}

/**
 * The exact, deterministic capability semantics signed into a v4 command
 * binding contract.  The shared registry owns authority identity; PDF keeps
 * native-save, flattening, feature-flag, and host availability semantics.
 */
export function pdfFeatureCommandSemanticContract(
  capability: PdfFeatureCapability,
): string {
  return JSON.stringify({
    schemaVersion: "mrai.pdf-feature-command.v1",
    id: capability.id,
    reasonKey: capability.reasonKey,
    baselineStatus: capability.baselineStatus,
    domain: capability.domain,
    entryPoints: capability.entryPoints,
    contexts: capability.contexts,
    availabilityPredicate: capability.availabilityPredicate,
    command: capability.command,
    nativeObjectKinds: capability.nativeObjectKinds,
    import: capability.import,
    nativeSave: capability.nativeSave,
    flatten: capability.flatten,
    featureFlags: capability.featureFlags,
    evidenceTests: capability.evidenceTests,
    acceptanceContractIds: capability.acceptanceContractIds,
  });
}

export function readPdfFeatureFlagState(): Readonly<
  Record<PdfFeatureFlagId, boolean>
> {
  return Object.freeze({
    NEXT_PUBLIC_PDF_RENDER_LIFECYCLE_V2: pdfRenderLifecycleV2Enabled(),
    NEXT_PUBLIC_PDF_OVERLAY_COORDINATES_V2: pdfOverlayCoordinatesV2Enabled(),
    NEXT_PUBLIC_PDF_PAGE_WINDOW_MUTATION_GUARD_V2:
      pdfPageWindowMutationGuardV2Enabled(),
    NEXT_PUBLIC_PDF_REDACTION_REACHABILITY_V2:
      pdfRedactionReachabilityV2Enabled(),
    NEXT_PUBLIC_PDF_ACROFORM_MUTATION_GUARD_V2:
      pdfAcroFormMutationGuardV2Enabled(),
    NEXT_PUBLIC_PDF_TEXT_EDIT_STABILITY_V2: pdfTextEditStabilityV2Enabled(),
    NEXT_PUBLIC_PDF_FREETEXT_RD_V2: pdfFreeTextRectangleDifferencesV2Enabled(),
    NEXT_PUBLIC_PDF_SAVE_POLICY_V1: pdfSavePolicyV1Enabled(),
  });
}

function blocked(
  reasonKey: string,
  reasonLabel?: string,
): PdfFeatureCapabilityDecision {
  return {
    enabled: false,
    disposition: "blocked",
    reasonKey,
    reasonLabel: reasonLabel ?? null,
  };
}

export function resolvePdfFeatureCapability(
  capability: PdfFeatureCapability,
  context: PdfCapabilityContext,
  runtime: PdfFeatureRuntimeState,
  requiredHost?: PdfCapabilityHost,
  requiredAction?: string,
  requireWritable = false,
  requireSavePolicy = true,
): PdfFeatureCapabilityDecision {
  if (
    requiredHost !== undefined &&
    requiredHost !== "reader" &&
    requiredHost !== "native-editor"
  ) {
    return blocked("pdf.capability.bindingIdentityMismatch");
  }
  if (requiredHost !== undefined && context.host !== requiredHost) {
    return blocked("pdf.capability.hostBindingMismatch");
  }
  if (!capability.contexts.includes(context.host)) {
    return blocked("pdf.capability.hostUnavailable");
  }
  // A dark-launched path is never reported available merely because its
  // surrounding legacy feature exists.  Check flags before catalog command
  // readiness so observability can distinguish flag-disabled from unbound.
  const disabledFlag = capability.featureFlags.find(
    (flag) => runtime.featureFlags[flag] !== true,
  );
  if (disabledFlag) {
    return blocked(`pdf.capability.flagDisabled.${disabledFlag}`);
  }
  if (capability.command.disposition !== "runtime-bindable") {
    return blocked(capability.reasonKey);
  }
  if (
    capability.availabilityPredicate === "document-ready" &&
    !context.documentReady
  ) {
    return blocked("pdf.capability.documentLoading");
  }
  if (
    (requireWritable ||
      capability.availabilityPredicate === "document-writable") &&
    (!context.documentReady || !context.editable)
  ) {
    return blocked(
      context.documentReady
        ? "pdf.capability.readOnly"
        : "pdf.capability.documentLoading",
    );
  }
  const decision = runtime.decisions[capability.id];
  if (!decision) {
    return blocked("pdf.capability.runtimeDecisionRequired");
  }
  if (
    !capability.nativeSave.allowedDispositions.includes(decision.disposition)
  ) {
    return blocked("pdf.capability.dispositionNotAllowed");
  }
  if (pdfSavePolicyV1Enabled() && requireSavePolicy) {
    if (!requiredAction) {
      return blocked("pdf.savePolicy.exactActionRequired");
    }
    const policy = decision.savePolicy;
    if (
      !policy ||
      !verifyPdfSavePolicyDecision(policy.decision, policy.request)
    ) {
      return blocked("pdf.savePolicy.decisionRequired");
    }
    const policyView = readPdfSavePolicyDecision(policy.decision);
    if (
      !policyView ||
      policyView.host !== context.host ||
      policyView.featureId !== capability.id ||
      policyView.action !== requiredAction
    ) {
      return blocked("pdf.savePolicy.bindingIdentityMismatch");
    }
    if (!policyView.enabled || policyView.disposition === "blocked") {
      return blocked(
        policyView.reasonKey ?? "pdf.savePolicy.outputBlocked",
        decision.reasonLabel,
      );
    }
    if (policyView.disposition !== decision.disposition) {
      return blocked("pdf.savePolicy.dispositionMismatch");
    }
  }
  if (!decision.enabled || decision.disposition === "blocked") {
    return blocked(
      decision.reasonKey ?? "pdf.capability.unavailable",
      decision.reasonLabel,
    );
  }
  if (
    !pdfSavePolicyV1Enabled() &&
    decision.disposition === "flatten-with-consent" &&
    decision.consentGranted !== true
  ) {
    return blocked(
      "pdf.capability.flattenConsentRequired",
      decision.reasonLabel,
    );
  }
  return {
    enabled: true,
    disposition: decision.disposition,
    reasonKey: null,
    reasonLabel: null,
  };
}
