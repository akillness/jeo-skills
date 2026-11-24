/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  DOCUMENT_FEATURE_CAPABILITY_REGISTRY,
  type DocumentCapabilityContext,
  type DocumentFeatureCapability,
  findDocumentFeatureCapability,
} from "../../../../lib/document-feature-capabilities";
import {
  createFeatureCommandRegistry,
  type FeatureCommandBinding,
  type FeatureCommandHandler,
  type FeatureCommandResult,
  type ResolvedFeatureCommand,
} from "../../../office-ribbon/featureCommandRegistry";

import {
  type DocumentFeatureCommandGate,
  type DocumentFeatureRuntimeState,
  resolveDocumentFeatureCapability,
} from "./capabilityAdapter";

export type DocumentFeatureCommandResult = FeatureCommandResult;
export type DocumentFeatureCommandHandler = FeatureCommandHandler;
export type DocumentFeatureCommandBinding =
  FeatureCommandBinding<DocumentFeatureCommandGate>;
export type ResolvedDocumentFeatureCommand =
  ResolvedFeatureCommand<DocumentFeatureCapability> & { visible: boolean };
export type DocumentFeatureCommandRegistry = ReturnType<
  typeof createDocumentFeatureCommandRegistry
>;

/**
 * Build the executable half of the feature contract.  Every catalog leaf is
 * present in the returned registry; unimplemented or not-yet-wired leaves are
 * deliberately resolved as disabled instead of falling through to a plausible
 * but unrelated editor command.
 */
export function createDocumentFeatureCommandRegistry(
  bindings: readonly DocumentFeatureCommandBinding[],
) {
  const bindingGates = new Map(
    bindings.map((binding) => [binding.featureId, binding.gate ?? "always"]),
  );
  const registry = createFeatureCommandRegistry<
    DocumentFeatureCapability,
    DocumentCapabilityContext,
    DocumentFeatureRuntimeState,
    DocumentFeatureCommandGate
  >({
    editor: "document",
    catalog: DOCUMENT_FEATURE_CAPABILITY_REGISTRY,
    find: findDocumentFeatureCapability,
    resolveCapability: (capability, context, runtime, gate) =>
      resolveDocumentFeatureCapability(capability, context, runtime, gate),
    bindings,
  });
  return {
    ...registry,
    resolve(
      featureId: string,
      context: DocumentCapabilityContext,
      runtime: DocumentFeatureRuntimeState,
    ): ResolvedDocumentFeatureCommand {
      const resolved = registry.resolve(featureId, context, runtime);
      const capability = findDocumentFeatureCapability(featureId);
      const visibility = capability
        ? resolveDocumentFeatureCapability(
            capability,
            context,
            runtime,
            bindingGates.get(featureId) ?? "always",
          ).visible
        : false;
      return { ...resolved, visible: visibility };
    },
  };
}
