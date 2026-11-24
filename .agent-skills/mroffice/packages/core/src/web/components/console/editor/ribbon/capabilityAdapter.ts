/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  type DocumentCapabilityContext,
  type DocumentFeatureCapability,
  isDocumentFeatureAvailable,
} from "../../../../lib/document-feature-capabilities";

export type DocumentFeatureCommandGate = "always" | "docs_office_parity_v2";

export interface DocumentFeatureRuntimeState {
  docsOfficeParityV2: boolean;
  desktopInteroperabilityTools?: boolean;
}

export interface DocumentFeatureCapabilityDecision {
  visible: boolean;
  enabled: boolean;
  reasonKey: string | null;
}

const DEFAULT_UNAVAILABLE_REASON = "document.capability.unavailable";

/**
 * Combine the persisted capability contract with ephemeral editor/session
 * state.  This is the only place where the workspace rollout flag is allowed
 * to turn a V2 command on: callers cannot accidentally bypass the capability
 * table by checking `editor.isEditable` alone.
 */
export function resolveDocumentFeatureCapability(
  capability: DocumentFeatureCapability,
  context: DocumentCapabilityContext,
  runtime: DocumentFeatureRuntimeState,
  gate: DocumentFeatureCommandGate = "always",
): DocumentFeatureCapabilityDecision {
  // The runtime surface is authoritative. A binding that forgot to declare
  // the rollout gate must not become a bypass for a desktop-only command.
  if (runtime.docsOfficeParityV2) {
    const webVisible =
      capability.wordWeb === "confirmed" ||
      capability.maturePreserve === "visible" ||
      (runtime.desktopInteroperabilityTools === true &&
        capability.maturePreserve === "hidden") ||
      (capability.wordWeb === "providerBound" &&
        capability.authoring !== "unsupported");
    if (!webVisible) {
      return {
        visible: false,
        enabled: false,
        reasonKey: "document.capability.notInWordWeb",
      };
    }
  }
  if (capability.authoring === "unsupported") {
    return {
      visible: gate !== "docs_office_parity_v2",
      enabled: false,
      reasonKey: capability.reasonKey ?? "document.capability.notImplemented",
    };
  }
  if (gate === "docs_office_parity_v2" && !runtime.docsOfficeParityV2) {
    return {
      visible: true,
      enabled: false,
      reasonKey: "document.capability.officeParityV2Disabled",
    };
  }
  if (context.sourcePackageBound && capability.sourcePatchback === "reject") {
    // An imported Word original has no writer for this object: offered, it
    // stayed on the page and was declined from the file after the save.
    return {
      visible: true,
      enabled: false,
      reasonKey: "document.capability.sourcePackageUnwritable",
    };
  }
  if (!isDocumentFeatureAvailable(capability, context)) {
    return {
      visible: true,
      enabled: false,
      reasonKey: capability.reasonKey ?? DEFAULT_UNAVAILABLE_REASON,
    };
  }
  return { visible: true, enabled: true, reasonKey: null };
}
