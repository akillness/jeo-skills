/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The presentation mirror of the document editor's ribbon capability adapter
 * (`components/console/editor/ribbon/capabilityAdapter.ts`) — same contract,
 * same reason-key discipline: combine the persisted capability catalog with
 * ephemeral editor state, and be the ONLY place a runtime gate may turn a
 * command on, so callers cannot bypass the capability table by checking a
 * loose boolean of their own.
 */

import {
  type PresentationCapabilityContext,
  type PresentationFeatureCapability,
  isPresentationFeatureAvailable,
} from "../../../../lib/presentation-feature-capabilities";

/** No rollout gates exist for the deck editor today; the slot is the point. */
export type PresentationFeatureCommandGate = "always";

export interface PresentationFeatureRuntimeState {
  /** Reserved for rollout flags; deliberately empty until one exists. */
  _reserved?: never;
}

export interface PresentationFeatureCapabilityDecision {
  enabled: boolean;
  reasonKey: string | null;
}

const DEFAULT_UNAVAILABLE_REASON = "presentation.capability.unavailable";

export function resolvePresentationFeatureCapability(
  capability: PresentationFeatureCapability,
  context: PresentationCapabilityContext,
  _runtime: PresentationFeatureRuntimeState,
  _gate: PresentationFeatureCommandGate = "always",
): PresentationFeatureCapabilityDecision {
  if (capability.authoring === "unsupported") {
    return {
      enabled: false,
      reasonKey:
        capability.reasonKey ?? "presentation.capability.notImplemented",
    };
  }
  if (!isPresentationFeatureAvailable(capability, context)) {
    return {
      enabled: false,
      reasonKey: capability.reasonKey ?? DEFAULT_UNAVAILABLE_REASON,
    };
  }
  return { enabled: true, reasonKey: null };
}
