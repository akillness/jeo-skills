/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The presentation feature-command registry — a THIN INSTANTIATION of the
 * generic office-ribbon factory. This file used to be a line-for-line rename
 * of the docs registry (the audit's "逐行改名 fork"); the shared semantics
 * now live once in office-ribbon/featureCommandRegistry.
 */

import {
  PRESENTATION_IMAGE_FILE_CAPABILITY_CATALOG,
  PRESENTATION_IMAGE_FILE_FEATURE_ID,
  PRESENTATION_PICTURE_ALT_TEXT_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_ALT_TEXT_FEATURE_ID,
  PRESENTATION_PICTURE_ARRANGE_STEP_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_BRING_FORWARD_FEATURE_ID,
  PRESENTATION_PICTURE_SEND_BACKWARD_FEATURE_ID,
  PRESENTATION_PICTURE_SIZE_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_SIZE_HEIGHT_FEATURE_ID,
  PRESENTATION_PICTURE_SIZE_WIDTH_FEATURE_ID,
  PRESENTATION_PICTURE_BORDER_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_BORDER_FEATURE_ID,
  PRESENTATION_PICTURE_COLOR_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_COLOR_FEATURE_ID,
  PRESENTATION_PICTURE_CORRECTIONS_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_CORRECTIONS_FEATURE_ID,
  PRESENTATION_PICTURE_TRANSPARENCY_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_TRANSPARENCY_FEATURE_ID,
  PRESENTATION_PICTURE_CROP_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_CROP_FEATURE_ID,
  PRESENTATION_PICTURE_CROP_FILL_FEATURE_ID,
  PRESENTATION_PICTURE_CROP_FIT_FEATURE_ID,
  PRESENTATION_PICTURE_REPLACE_FILE_CAPABILITY_CATALOG,
  PRESENTATION_PICTURE_REPLACE_FILE_FEATURE_ID,
  PRESENTATION_SLIDE_VISIBILITY_CAPABILITY_CATALOG,
  PRESENTATION_SLIDE_VISIBILITY_FEATURE_ID,
  PRESENTATION_SLIDE_TRANSITION_CAPABILITY_CATALOG,
  PRESENTATION_SLIDE_TRANSITION_FEATURE_ID,
  PRESENTATION_SLIDE_TRANSITION_ADVANCE_CAPABILITY_CATALOG,
  PRESENTATION_SLIDE_TRANSITION_ADVANCE_FEATURE_ID,
  PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_CAPABILITY_CATALOG,
  PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_FEATURE_ID,
  PRESENTATION_SLIDE_TRANSITION_DURATION_CAPABILITY_CATALOG,
  PRESENTATION_SLIDE_TRANSITION_DURATION_FEATURE_ID,
  PRESENTATION_ANIMATION_EFFECT_CAPABILITY_CATALOG,
  PRESENTATION_ANIMATION_EFFECT_FEATURE_ID,
  PRESENTATION_ANIMATION_EFFECT_OPTION_CAPABILITY_CATALOG,
  PRESENTATION_ANIMATION_EFFECT_OPTION_FEATURE_ID,
  PRESENTATION_ANIMATION_SEQUENCE_CAPABILITY_CATALOG,
  PRESENTATION_ANIMATION_SEQUENCE_FEATURE_ID,
  PRESENTATION_ANIMATION_TIMING_CAPABILITY_CATALOG,
  PRESENTATION_ANIMATION_TIMING_FEATURE_ID,
  PRESENTATION_ACCESSIBILITY_CHECK_ACTION,
  PRESENTATION_ACCESSIBILITY_CHECK_CAPABILITY_CATALOG,
  PRESENTATION_ACCESSIBILITY_CHECK_FEATURE_ID,
  PRESENTATION_ACCESSIBILITY_CHECK_HANDLER_REF,
  PRESENTATION_VIEW_AID_ACTION,
  PRESENTATION_VIEW_AID_CAPABILITY_CATALOG,
  PRESENTATION_VIEW_AID_FEATURE_ID,
  PRESENTATION_VIEW_AID_HANDLER_REF,
  isPresentationViewAidKind,
  type PresentationViewAidKind,
  PRESENTATION_VIEW_ZOOM_ACTION,
  PRESENTATION_VIEW_ZOOM_CAPABILITY_CATALOG,
  PRESENTATION_VIEW_ZOOM_FEATURE_ID,
  PRESENTATION_VIEW_ZOOM_HANDLER_REF,
  isPresentationViewportZoomRequest,
  type PresentationViewportZoomRequest,
  PRESENTATION_FEATURE_CAPABILITY_CATALOG,
  type PresentationCapabilityContext,
  type PresentationFeatureCapability,
  findPresentationFeatureCapability,
  presentationProductionCapabilityCatalogForFeatureIds,
  presentationProductionCommandEvidence,
  presentationRuntimeCapabilityFromContract,
  presentationFeatureCommandSemanticContract,
  verifyPresentationFeatureCapabilityCatalogBindings,
} from "../../../../lib/presentation-feature-capabilities";
import {
  createFeatureCommandBindingContract,
  createFeatureCommandRegistry,
  createFeatureCommandRegistryLineage,
  guardRenderedFeatureCommandAuthority,
  readFeatureCommandBindingManifest,
  type FeatureCommandBinding,
  type FeatureCommandRegistryLineage,
  type FeatureCommandResult,
  type ResolvedFeatureCommand,
} from "../../../office-ribbon/featureCommandRegistry";

import {
  type PresentationFeatureCommandGate,
  type PresentationFeatureRuntimeState,
  resolvePresentationFeatureCapability,
} from "./capabilityAdapter";
import {
  INSERT_IMAGE_FILE_ACTION as PRESENTATION_IMAGE_FILE_ACTION,
  INSERT_IMAGE_FILE_HANDLER_REF as PRESENTATION_IMAGE_FILE_HANDLER_REF,
  PICTURE_CROP_ACTION as PRESENTATION_PICTURE_CROP_ACTION,
  PICTURE_CROP_FILL_ACTION as PRESENTATION_PICTURE_CROP_FILL_ACTION,
  PICTURE_CROP_FILL_HANDLER_REF as PRESENTATION_PICTURE_CROP_FILL_HANDLER_REF,
  PICTURE_CROP_FIT_ACTION as PRESENTATION_PICTURE_CROP_FIT_ACTION,
  PICTURE_CROP_FIT_HANDLER_REF as PRESENTATION_PICTURE_CROP_FIT_HANDLER_REF,
  PICTURE_CROP_HANDLER_REF as PRESENTATION_PICTURE_CROP_HANDLER_REF,
  PICTURE_ALT_TEXT_ACTION as PRESENTATION_PICTURE_ALT_TEXT_ACTION,
  PICTURE_ALT_TEXT_HANDLER_REF as PRESENTATION_PICTURE_ALT_TEXT_HANDLER_REF,
  PICTURE_BRING_FORWARD_ACTION as PRESENTATION_PICTURE_BRING_FORWARD_ACTION,
  PICTURE_BRING_FORWARD_HANDLER_REF as PRESENTATION_PICTURE_BRING_FORWARD_HANDLER_REF,
  PICTURE_BORDER_ACTION as PRESENTATION_PICTURE_BORDER_ACTION,
  PICTURE_BORDER_HANDLER_REF as PRESENTATION_PICTURE_BORDER_HANDLER_REF,
  PICTURE_COLOR_ACTION as PRESENTATION_PICTURE_COLOR_ACTION,
  PICTURE_COLOR_HANDLER_REF as PRESENTATION_PICTURE_COLOR_HANDLER_REF,
  PICTURE_CORRECTIONS_ACTION as PRESENTATION_PICTURE_CORRECTIONS_ACTION,
  PICTURE_CORRECTIONS_HANDLER_REF as PRESENTATION_PICTURE_CORRECTIONS_HANDLER_REF,
  PICTURE_TRANSPARENCY_ACTION as PRESENTATION_PICTURE_TRANSPARENCY_ACTION,
  PICTURE_TRANSPARENCY_HANDLER_REF as PRESENTATION_PICTURE_TRANSPARENCY_HANDLER_REF,
  PICTURE_SEND_BACKWARD_ACTION as PRESENTATION_PICTURE_SEND_BACKWARD_ACTION,
  PICTURE_SEND_BACKWARD_HANDLER_REF as PRESENTATION_PICTURE_SEND_BACKWARD_HANDLER_REF,
  PICTURE_SIZE_HEIGHT_ACTION as PRESENTATION_PICTURE_SIZE_HEIGHT_ACTION,
  PICTURE_SIZE_HEIGHT_HANDLER_REF as PRESENTATION_PICTURE_SIZE_HEIGHT_HANDLER_REF,
  PICTURE_SIZE_WIDTH_ACTION as PRESENTATION_PICTURE_SIZE_WIDTH_ACTION,
  PICTURE_SIZE_WIDTH_HANDLER_REF as PRESENTATION_PICTURE_SIZE_WIDTH_HANDLER_REF,
  REPLACE_PICTURE_FILE_ACTION as PRESENTATION_PICTURE_REPLACE_FILE_ACTION,
  REPLACE_PICTURE_FILE_HANDLER_REF as PRESENTATION_PICTURE_REPLACE_FILE_HANDLER_REF,
  SLIDE_VISIBILITY_ACTION as PRESENTATION_SLIDE_VISIBILITY_ACTION,
  SLIDE_VISIBILITY_HANDLER_REF as PRESENTATION_SLIDE_VISIBILITY_HANDLER_REF,
  SLIDE_TRANSITION_ACTION as PRESENTATION_SLIDE_TRANSITION_ACTION,
  SLIDE_TRANSITION_HANDLER_REF as PRESENTATION_SLIDE_TRANSITION_HANDLER_REF,
  SLIDE_TRANSITION_ADVANCE_ACTION as PRESENTATION_SLIDE_TRANSITION_ADVANCE_ACTION,
  SLIDE_TRANSITION_ADVANCE_HANDLER_REF as PRESENTATION_SLIDE_TRANSITION_ADVANCE_HANDLER_REF,
  SLIDE_TRANSITION_APPLY_ALL_ACTION as PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_ACTION,
  SLIDE_TRANSITION_APPLY_ALL_HANDLER_REF as PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_HANDLER_REF,
  SLIDE_TRANSITION_DURATION_ACTION as PRESENTATION_SLIDE_TRANSITION_DURATION_ACTION,
  SLIDE_TRANSITION_DURATION_HANDLER_REF as PRESENTATION_SLIDE_TRANSITION_DURATION_HANDLER_REF,
  ADD_ANIMATION_EFFECT_ACTION as PRESENTATION_ANIMATION_EFFECT_ACTION,
  ADD_ANIMATION_EFFECT_HANDLER_REF as PRESENTATION_ANIMATION_EFFECT_HANDLER_REF,
  EDIT_ANIMATION_EFFECT_OPTION_ACTION as PRESENTATION_ANIMATION_EFFECT_OPTION_ACTION,
  EDIT_ANIMATION_EFFECT_OPTION_HANDLER_REF as PRESENTATION_ANIMATION_EFFECT_OPTION_HANDLER_REF,
  EDIT_ANIMATION_SEQUENCE_ACTION as PRESENTATION_ANIMATION_SEQUENCE_ACTION,
  EDIT_ANIMATION_SEQUENCE_HANDLER_REF as PRESENTATION_ANIMATION_SEQUENCE_HANDLER_REF,
  EDIT_ANIMATION_TIMING_ACTION as PRESENTATION_ANIMATION_TIMING_ACTION,
  EDIT_ANIMATION_TIMING_HANDLER_REF as PRESENTATION_ANIMATION_TIMING_HANDLER_REF,
} from "../../../../lib/presentation-command-adapters";

export type PresentationFeatureCommandResult = FeatureCommandResult;
export type PresentationFeatureCommandBinding =
  FeatureCommandBinding<PresentationFeatureCommandGate>;
export type ResolvedPresentationFeatureCommand =
  ResolvedFeatureCommand<PresentationFeatureCapability>;

export type PresentationFeatureCommandRegistry = ReturnType<
  typeof createPresentationFeatureCommandRegistry
>;

/**
 * What a registry takes from its bindings besides their functions. The
 * editor makes its bindings anew on every render (their handlers read that
 * render's state); building the registry anew with them issued a new
 * binding contract with digests over the whole capability catalog each
 * time, the larger part of a keystroke's own script in the slides editor.
 * The registry is built again only when this shape changes, over
 * {@link delegatedPresentationCommandBindings}.
 */
export function presentationCommandBindingShape(
  bindings: readonly PresentationFeatureCommandBinding[],
): string {
  return JSON.stringify(bindings.map((binding) => [
    binding.featureId,
    binding.action ?? null,
    binding.handlerRef ?? null,
    binding.gate ?? null,
    typeof binding.isEnabled === "function",
    typeof binding.unavailableReasonKey === "function" ? ["call"] : binding.unavailableReasonKey ?? null,
  ]));
}

/**
 * Bindings of the same shape as `source.current` whose functions call that
 * of the bindings `source` holds when they run: a registry built over them
 * acts on the latest render's bindings for as long as their shape holds.
 */
export function delegatedPresentationCommandBindings(source: {
  readonly current: readonly PresentationFeatureCommandBinding[];
}): PresentationFeatureCommandBinding[] {
  return source.current.map((binding, index) => {
    const live = (): PresentationFeatureCommandBinding => source.current[index] ?? binding;
    const reason = binding.unavailableReasonKey;
    return {
      featureId: binding.featureId,
      ...(binding.action !== undefined ? { action: binding.action } : {}),
      ...(binding.handlerRef !== undefined ? { handlerRef: binding.handlerRef } : {}),
      ...(binding.gate !== undefined ? { gate: binding.gate } : {}),
      execute: () => live().execute(),
      ...(typeof binding.isEnabled === "function"
        ? { isEnabled: () => live().isEnabled?.() ?? true }
        : {}),
      ...(reason === undefined
        ? {}
        : typeof reason === "function"
          ? {
              unavailableReasonKey: () => {
                const current = live().unavailableReasonKey;
                return typeof current === "function" ? current() : current ?? "";
              },
            }
          : { unavailableReasonKey: reason }),
    };
  });
}

export function createPresentationFeatureCommandRegistry(
  bindings: readonly PresentationFeatureCommandBinding[],
) {
  const featureIds = bindings.map((binding) => binding.featureId);
  const knownProductionIds = new Set(
    PRESENTATION_FEATURE_CAPABILITY_CATALOG.featureIds,
  );
  const unknownFeatureId = featureIds.find(
    (featureId) => !knownProductionIds.has(featureId),
  );
  if (unknownFeatureId) {
    throw new Error(
      `Unknown presentation feature command: ${unknownFeatureId}`,
    );
  }
  const v2Catalog = presentationProductionCapabilityCatalogForFeatureIds(
    featureIds,
  );
  const runtimeCapabilities = Object.freeze(
    PRESENTATION_FEATURE_CAPABILITY_CATALOG.features.map(
      presentationRuntimeCapabilityFromContract,
    ),
  );
  const runtimeById = new Map(
    runtimeCapabilities.map((capability) => [capability.id, capability] as const),
  );
  const v2ById = new Map(
    PRESENTATION_FEATURE_CAPABILITY_CATALOG.features.map((capability) => [
      capability.featureId,
      capability,
    ] as const),
  );
  const canonicalBindings = Object.freeze(
    bindings.map((binding) => {
      const evidence = presentationProductionCommandEvidence(
        binding.featureId,
      );
      if (!evidence) {
        throw new Error(
          `Missing production presentation command evidence: ${binding.featureId}`,
        );
      }
      return Object.freeze({
        ...binding,
        action: evidence.action,
        handlerRef: evidence.handlerRef,
      });
    }),
  );
  const lineage = createFeatureCommandRegistryLineage(
    "presentation",
    "presentation.production-web-v2",
  );
  const bindingContract = createFeatureCommandBindingContract({
    lineage,
    catalogEntries: Object.freeze(
      PRESENTATION_FEATURE_CAPABILITY_CATALOG.features.map((capability) => {
        const evidence = presentationProductionCommandEvidence(
          capability.featureId,
        );
        if (!evidence) {
          throw new Error(
            `Missing production presentation command evidence: ${capability.featureId}`,
          );
        }
        return Object.freeze({
          featureId: capability.featureId,
          semanticContract:
            presentationFeatureCommandSemanticContract(capability),
          action: evidence.action,
          handlerRef: evidence.handlerRef,
        });
      }),
    ),
    bindings: canonicalBindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog: runtimeCapabilities,
    lineage,
    bindingContract,
    describeBindingContract: (capability) => {
      const v2Capability = v2ById.get(capability.id);
      if (!v2Capability) {
        throw new Error(
          `Missing production v2 capability: ${capability.id}`,
        );
      }
      return presentationFeatureCommandSemanticContract(v2Capability);
    },
    find: (featureId) => runtimeById.get(featureId) ?? null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings: canonicalBindings,
  });
  const manifest = readFeatureCommandBindingManifest(
    registry.bindingManifest,
    {
      expectedLineage: lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    v2Catalog,
    manifest,
    {
      expectedLineage: lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return Object.freeze({ ...registry, capabilityCatalog });
}

export interface PresentationImageFileInsertCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationImageFileInsertCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.image-file.${instanceId}`,
  );
}

/**
 * Own the production binding proof for `drawing.image`. The public legacy
 * registry can still host all historical commands, but this feature's handler
 * first crosses a one-row v4 authority whose contract captures the exact
 * action, handler ref, availability callback, semantic v2 row, resolver, and
 * execute-function identity.
 */
export function createPresentationImageFileInsertCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationImageFileInsertCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_IMAGE_FILE_FEATURE_ID,
  );
  const v2Capability = PRESENTATION_IMAGE_FILE_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation image-file capability");
  }
  const lineage = config.lineage;
  const catalog = Object.freeze([capability]);
  const find = (featureId: string): PresentationFeatureCapability | null =>
    featureId === capability.id ? capability : null;
  const binding = Object.freeze({
    featureId: PRESENTATION_IMAGE_FILE_FEATURE_ID,
    action: PRESENTATION_IMAGE_FILE_ACTION,
    handlerRef: PRESENTATION_IMAGE_FILE_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.imageFileUnavailable",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_IMAGE_FILE_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_IMAGE_FILE_ACTION,
        handlerRef: PRESENTATION_IMAGE_FILE_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_IMAGE_FILE_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_IMAGE_FILE_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationPictureReplaceFileCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureReplaceFileCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-replace-file.${instanceId}`,
  );
}

/**
 * Exact one-leaf authority for Picture Format → Change Picture → From File.
 * The root Change Picture command and its other providers are intentionally not
 * catalog entries here, so a root-only or sibling-provider claim cannot satisfy
 * the binding manifest.
 */
export function createPresentationPictureReplaceFileCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationPictureReplaceFileCommandAuthority {
  const v2Capability =
    PRESENTATION_PICTURE_REPLACE_FILE_CAPABILITY_CATALOG.features[0];
  if (!v2Capability) {
    throw new Error("Missing presentation picture-replace-file capability");
  }
  const capability = Object.freeze<PresentationFeatureCapability>({
    id: PRESENTATION_PICTURE_REPLACE_FILE_FEATURE_ID,
    tabs: ["image-format"],
    entry: "both",
    authoring: "native",
    pptxImport: "native",
    fromScratchExport: "native",
    patchbackExport: "native",
    powerpoint: "editable",
    wps: "editable",
    commandKey: "presentation.command.changePictureFromFile",
    contextPredicate: "selection",
    reasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const lineage = config.lineage;
  const catalog = Object.freeze([capability]);
  const find = (featureId: string): PresentationFeatureCapability | null =>
    featureId === capability.id ? capability : null;
  const binding = Object.freeze({
    featureId: PRESENTATION_PICTURE_REPLACE_FILE_FEATURE_ID,
    action: PRESENTATION_PICTURE_REPLACE_FILE_ACTION,
    handlerRef: PRESENTATION_PICTURE_REPLACE_FILE_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_PICTURE_REPLACE_FILE_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_PICTURE_REPLACE_FILE_ACTION,
        handlerRef: PRESENTATION_PICTURE_REPLACE_FILE_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_REPLACE_FILE_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_PICTURE_REPLACE_FILE_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export type PresentationPictureCropFeatureId =
  | typeof PRESENTATION_PICTURE_CROP_FEATURE_ID
  | typeof PRESENTATION_PICTURE_CROP_FILL_FEATURE_ID
  | typeof PRESENTATION_PICTURE_CROP_FIT_FEATURE_ID;

export interface PresentationPictureCropCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: (featureId: PresentationPictureCropFeatureId) => boolean;
  readonly invoke: (
    featureId: PresentationPictureCropFeatureId,
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureCropCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-crop.${instanceId}`,
  );
}

/**
 * Exact three-command authority for the implemented Crop primary/menu alias,
 * Fill, and Fit. Excluded sibling providers never enter this catalog, so they
 * cannot be accidentally promoted by sharing the physical menu.
 */
export function createPresentationPictureCropCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly executeCrop: () => boolean;
  readonly executeFill: () => boolean;
  readonly executeFit: () => boolean;
  readonly isCropEnabled: () => boolean;
  readonly isFillEnabled: () => boolean;
  readonly isFitEnabled: () => boolean;
}): PresentationPictureCropCommandAuthority {
  const definitions = Object.freeze([
    Object.freeze({
      featureId: PRESENTATION_PICTURE_CROP_FEATURE_ID,
      action: PRESENTATION_PICTURE_CROP_ACTION,
      handlerRef: PRESENTATION_PICTURE_CROP_HANDLER_REF,
      execute: config.executeCrop,
      isEnabled: config.isCropEnabled,
      commandKey: "presentation.command.cropPicture",
    }),
    Object.freeze({
      featureId: PRESENTATION_PICTURE_CROP_FILL_FEATURE_ID,
      action: PRESENTATION_PICTURE_CROP_FILL_ACTION,
      handlerRef: PRESENTATION_PICTURE_CROP_FILL_HANDLER_REF,
      execute: config.executeFill,
      isEnabled: config.isFillEnabled,
      commandKey: "presentation.command.cropPictureFill",
    }),
    Object.freeze({
      featureId: PRESENTATION_PICTURE_CROP_FIT_FEATURE_ID,
      action: PRESENTATION_PICTURE_CROP_FIT_ACTION,
      handlerRef: PRESENTATION_PICTURE_CROP_FIT_HANDLER_REF,
      execute: config.executeFit,
      isEnabled: config.isFitEnabled,
      commandKey: "presentation.command.cropPictureFit",
    }),
  ]);
  const v2ById = new Map(
    PRESENTATION_PICTURE_CROP_CAPABILITY_CATALOG.features.map((feature) => [
      feature.featureId,
      feature,
    ]),
  );
  if (definitions.some((definition) => !v2ById.has(definition.featureId))) {
    throw new Error("Missing presentation picture-crop capability");
  }

  const catalog = Object.freeze(
    definitions.map((definition) =>
      Object.freeze<PresentationFeatureCapability>({
        id: definition.featureId,
        tabs: ["image-format"],
        entry: "both",
        authoring: "native",
        pptxImport: "native",
        fromScratchExport: "native",
        patchbackExport: "native",
        powerpoint: "editable",
        wps: "editable",
        commandKey: definition.commandKey,
        contextPredicate: "selection",
        reasonKey: "presentation.capability.pictureSelectionRequired",
      }),
    ),
  );
  const byId = new Map(
    catalog.map((capability) => [capability.id, capability]),
  );
  const find = (featureId: string): PresentationFeatureCapability | null =>
    byId.get(featureId) ?? null;
  const bindings = Object.freeze(
    definitions.map((definition) =>
      Object.freeze({
        featureId: definition.featureId,
        action: definition.action,
        handlerRef: definition.handlerRef,
        execute: definition.execute,
        isEnabled: definition.isEnabled,
        unavailableReasonKey:
          "presentation.capability.pictureSelectionRequired",
      }),
    ),
  );
  const lineage = config.lineage;
  const bindingContract = createFeatureCommandBindingContract({
    lineage,
    catalogEntries: Object.freeze(
      definitions.map((definition) => {
        const capability = v2ById.get(definition.featureId);
        if (!capability) {
          throw new Error("Missing presentation picture-crop semantic row");
        }
        return Object.freeze({
          featureId: definition.featureId,
          semanticContract:
            presentationFeatureCommandSemanticContract(capability),
          action: definition.action,
          handlerRef: definition.handlerRef,
        });
      }),
    ),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage,
    bindingContract,
    describeBindingContract: (capability) => {
      const v2 = v2ById.get(capability.id);
      if (!v2) {
        throw new Error("Missing presentation picture-crop semantic row");
      }
      return presentationFeatureCommandSemanticContract(v2);
    },
    find,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_CROP_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  const enabledById = new Map(
    definitions.map((definition) => [
      definition.featureId,
      definition.isEnabled,
    ]),
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: (featureId: PresentationPictureCropFeatureId) =>
      enabledById.get(featureId)?.() ?? false,
    invoke: async (
      featureId: PresentationPictureCropFeatureId,
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) => (await registry.execute(featureId, context, runtime)) === "executed",
  }));
}

export interface PresentationPictureAltTextCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureAltTextCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-alt-text.${instanceId}`,
  );
}

/** Exact one-control authority for Picture Format → Alt Text. */
export function createPresentationPictureAltTextCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationPictureAltTextCommandAuthority {
  const v2Capability =
    PRESENTATION_PICTURE_ALT_TEXT_CAPABILITY_CATALOG.features[0];
  if (!v2Capability) {
    throw new Error("Missing presentation picture-alt-text capability");
  }
  const capability = Object.freeze<PresentationFeatureCapability>({
    id: PRESENTATION_PICTURE_ALT_TEXT_FEATURE_ID,
    tabs: ["image-format"],
    entry: "ribbon",
    authoring: "native",
    pptxImport: "native",
    fromScratchExport: "native",
    patchbackExport: "native",
    powerpoint: "editable",
    wps: "editable",
    commandKey: "presentation.command.editPictureAltText",
    contextPredicate: "selection",
    reasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const lineage = config.lineage;
  const catalog = Object.freeze([capability]);
  const find = (featureId: string): PresentationFeatureCapability | null =>
    featureId === capability.id ? capability : null;
  const binding = Object.freeze({
    featureId: PRESENTATION_PICTURE_ALT_TEXT_FEATURE_ID,
    action: PRESENTATION_PICTURE_ALT_TEXT_ACTION,
    handlerRef: PRESENTATION_PICTURE_ALT_TEXT_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_PICTURE_ALT_TEXT_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_PICTURE_ALT_TEXT_ACTION,
        handlerRef: PRESENTATION_PICTURE_ALT_TEXT_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_ALT_TEXT_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_PICTURE_ALT_TEXT_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationSlideVisibilityCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationSlideVisibilityCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.slide-visibility.${instanceId}`,
  );
}

/** Exact one-control authority for Slide Show → Hide Slide. */
export function createPresentationSlideVisibilityCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationSlideVisibilityCommandAuthority {
  const v2Capability =
    PRESENTATION_SLIDE_VISIBILITY_CAPABILITY_CATALOG.features[0];
  if (!v2Capability) {
    throw new Error("Missing presentation slide-visibility capability");
  }
  const capability = Object.freeze<PresentationFeatureCapability>({
    id: PRESENTATION_SLIDE_VISIBILITY_FEATURE_ID,
    tabs: ["slideshow"],
    entry: "ribbon",
    authoring: "native",
    pptxImport: "native",
    fromScratchExport: "native",
    patchbackExport: "native",
    powerpoint: "editable",
    wps: "unsupported",
    commandKey: "presentation.command.toggleSlideVisibility",
    contextPredicate: "editable",
    reasonKey: "presentation.capability.selectionRequired",
  });
  const lineage = config.lineage;
  const catalog = Object.freeze([capability]);
  const binding = Object.freeze({
    featureId: PRESENTATION_SLIDE_VISIBILITY_FEATURE_ID,
    action: PRESENTATION_SLIDE_VISIBILITY_ACTION,
    handlerRef: PRESENTATION_SLIDE_VISIBILITY_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.selectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_SLIDE_VISIBILITY_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_SLIDE_VISIBILITY_ACTION,
        handlerRef: PRESENTATION_SLIDE_VISIBILITY_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_SLIDE_VISIBILITY_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_SLIDE_VISIBILITY_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_SLIDE_VISIBILITY_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationSlideTransitionCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationSlideTransitionCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.slide-transition.${instanceId}`,
  );
}

/** Exact one-feature authority used by every basic-transition gallery alias. */
export function createPresentationSlideTransitionCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationSlideTransitionCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_SLIDE_TRANSITION_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_SLIDE_TRANSITION_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation slide-transition capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_SLIDE_TRANSITION_FEATURE_ID,
    action: PRESENTATION_SLIDE_TRANSITION_ACTION,
    handlerRef: PRESENTATION_SLIDE_TRANSITION_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.selectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_SLIDE_TRANSITION_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_SLIDE_TRANSITION_ACTION,
        handlerRef: PRESENTATION_SLIDE_TRANSITION_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_SLIDE_TRANSITION_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_SLIDE_TRANSITION_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_SLIDE_TRANSITION_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationSlideTransitionDurationCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationSlideTransitionDurationCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.slide-transition-duration.${instanceId}`,
  );
}

/** Exact one-feature authority shared by the Duration field and stepper. */
export function createPresentationSlideTransitionDurationCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationSlideTransitionDurationCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_SLIDE_TRANSITION_DURATION_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_SLIDE_TRANSITION_DURATION_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error(
      "Missing presentation slide-transition Duration capability",
    );
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_SLIDE_TRANSITION_DURATION_FEATURE_ID,
    action: PRESENTATION_SLIDE_TRANSITION_DURATION_ACTION,
    handlerRef: PRESENTATION_SLIDE_TRANSITION_DURATION_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.selectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_SLIDE_TRANSITION_DURATION_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_SLIDE_TRANSITION_DURATION_ACTION,
        handlerRef: PRESENTATION_SLIDE_TRANSITION_DURATION_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_SLIDE_TRANSITION_DURATION_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_SLIDE_TRANSITION_DURATION_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_SLIDE_TRANSITION_DURATION_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationSlideTransitionAdvanceCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationSlideTransitionAdvanceCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.slide-transition-advance.${instanceId}`,
  );
}

/** Exact one-feature authority shared by the On Click and After controls. */
export function createPresentationSlideTransitionAdvanceCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationSlideTransitionAdvanceCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_SLIDE_TRANSITION_ADVANCE_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_SLIDE_TRANSITION_ADVANCE_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation slide-transition Advance capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_SLIDE_TRANSITION_ADVANCE_FEATURE_ID,
    action: PRESENTATION_SLIDE_TRANSITION_ADVANCE_ACTION,
    handlerRef: PRESENTATION_SLIDE_TRANSITION_ADVANCE_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.selectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_SLIDE_TRANSITION_ADVANCE_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_SLIDE_TRANSITION_ADVANCE_ACTION,
        handlerRef: PRESENTATION_SLIDE_TRANSITION_ADVANCE_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_SLIDE_TRANSITION_ADVANCE_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_SLIDE_TRANSITION_ADVANCE_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_SLIDE_TRANSITION_ADVANCE_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationSlideTransitionApplyAllCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationSlideTransitionApplyAllCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.slide-transition-apply-all.${instanceId}`,
  );
}

/** Exact one-feature authority shared by every Apply To All alias. */
export function createPresentationSlideTransitionApplyAllCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationSlideTransitionApplyAllCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation slide-transition Apply All capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_FEATURE_ID,
    action: PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_ACTION,
    handlerRef: PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.selectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_ACTION,
        handlerRef: PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_SLIDE_TRANSITION_APPLY_ALL_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationAnimationEffectCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationAnimationEffectCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.animation-effect.${instanceId}`,
  );
}

/** Exact one-feature authority shared by Appear, Fade and Fly In aliases. */
export function createPresentationAnimationEffectCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationAnimationEffectCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_ANIMATION_EFFECT_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_ANIMATION_EFFECT_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation animation-effect capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_ANIMATION_EFFECT_FEATURE_ID,
    action: PRESENTATION_ANIMATION_EFFECT_ACTION,
    handlerRef: PRESENTATION_ANIMATION_EFFECT_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.selectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_ANIMATION_EFFECT_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_ANIMATION_EFFECT_ACTION,
        handlerRef: PRESENTATION_ANIMATION_EFFECT_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_ANIMATION_EFFECT_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_ANIMATION_EFFECT_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_ANIMATION_EFFECT_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationAnimationEffectOptionCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationAnimationEffectOptionCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.animation-effect-option.${instanceId}`,
  );
}

/** Exact pane-occurrence authority; canvas selection is deliberately irrelevant. */
export function createPresentationAnimationEffectOptionCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationAnimationEffectOptionCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_ANIMATION_EFFECT_OPTION_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_ANIMATION_EFFECT_OPTION_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation animation effect-option capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_ANIMATION_EFFECT_OPTION_FEATURE_ID,
    action: PRESENTATION_ANIMATION_EFFECT_OPTION_ACTION,
    handlerRef: PRESENTATION_ANIMATION_EFFECT_OPTION_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.selectionRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_ANIMATION_EFFECT_OPTION_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_ANIMATION_EFFECT_OPTION_ACTION,
        handlerRef: PRESENTATION_ANIMATION_EFFECT_OPTION_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_ANIMATION_EFFECT_OPTION_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_ANIMATION_EFFECT_OPTION_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_ANIMATION_EFFECT_OPTION_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationAnimationSequenceCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationAnimationSequenceCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.animation-sequence.${instanceId}`,
  );
}

/** One authority shared by Move Earlier, Move Later and Remove. */
export function createPresentationAnimationSequenceCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationAnimationSequenceCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_ANIMATION_SEQUENCE_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_ANIMATION_SEQUENCE_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation animation-sequence capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_ANIMATION_SEQUENCE_FEATURE_ID,
    action: PRESENTATION_ANIMATION_SEQUENCE_ACTION,
    handlerRef: PRESENTATION_ANIMATION_SEQUENCE_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.editableRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_ANIMATION_SEQUENCE_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_ANIMATION_SEQUENCE_ACTION,
        handlerRef: PRESENTATION_ANIMATION_SEQUENCE_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_ANIMATION_SEQUENCE_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_ANIMATION_SEQUENCE_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_ANIMATION_SEQUENCE_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationAnimationTimingCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationAnimationTimingCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.animation-timing.${instanceId}`,
  );
}

/** One authority shared by the Ribbon and Animation Pane timing aliases. */
export function createPresentationAnimationTimingCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationAnimationTimingCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_ANIMATION_TIMING_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_ANIMATION_TIMING_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation animation-timing capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_ANIMATION_TIMING_FEATURE_ID,
    action: PRESENTATION_ANIMATION_TIMING_ACTION,
    handlerRef: PRESENTATION_ANIMATION_TIMING_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.editableRequired",
  });
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_ANIMATION_TIMING_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_ANIMATION_TIMING_ACTION,
        handlerRef: PRESENTATION_ANIMATION_TIMING_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const catalog = Object.freeze([capability]);
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_ANIMATION_TIMING_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_ANIMATION_TIMING_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_ANIMATION_TIMING_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export type PresentationPictureArrangeStepFeatureId =
  | typeof PRESENTATION_PICTURE_BRING_FORWARD_FEATURE_ID
  | typeof PRESENTATION_PICTURE_SEND_BACKWARD_FEATURE_ID;

export interface PresentationPictureArrangeStepCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: (
    featureId: PresentationPictureArrangeStepFeatureId,
  ) => boolean;
  readonly invoke: (
    featureId: PresentationPictureArrangeStepFeatureId,
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureArrangeStepCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-arrange-step.${instanceId}`,
  );
}

/** Exact two-command authority for the bounded one-layer picture primaries. */
export function createPresentationPictureArrangeStepCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly executeForward: () => boolean;
  readonly executeBackward: () => boolean;
  readonly isForwardEnabled: () => boolean;
  readonly isBackwardEnabled: () => boolean;
}): PresentationPictureArrangeStepCommandAuthority {
  const definitions = Object.freeze([
    Object.freeze({
      featureId: PRESENTATION_PICTURE_BRING_FORWARD_FEATURE_ID,
      action: PRESENTATION_PICTURE_BRING_FORWARD_ACTION,
      handlerRef: PRESENTATION_PICTURE_BRING_FORWARD_HANDLER_REF,
      execute: config.executeForward,
      isEnabled: config.isForwardEnabled,
      commandKey: "presentation.command.bringPictureForward",
    }),
    Object.freeze({
      featureId: PRESENTATION_PICTURE_SEND_BACKWARD_FEATURE_ID,
      action: PRESENTATION_PICTURE_SEND_BACKWARD_ACTION,
      handlerRef: PRESENTATION_PICTURE_SEND_BACKWARD_HANDLER_REF,
      execute: config.executeBackward,
      isEnabled: config.isBackwardEnabled,
      commandKey: "presentation.command.sendPictureBackward",
    }),
  ]);
  const v2ById = new Map(
    PRESENTATION_PICTURE_ARRANGE_STEP_CAPABILITY_CATALOG.features.map(
      (feature) => [feature.featureId, feature],
    ),
  );
  if (definitions.some((definition) => !v2ById.has(definition.featureId))) {
    throw new Error("Missing presentation picture-arrange-step capability");
  }

  const catalog = Object.freeze(
    definitions.map((definition) =>
      Object.freeze<PresentationFeatureCapability>({
        id: definition.featureId,
        tabs: ["image-format"],
        entry: "ribbon",
        authoring: "native",
        pptxImport: "native",
        fromScratchExport: "reject",
        patchbackExport: "native",
        powerpoint: "editable",
        wps: "unsupported",
        commandKey: definition.commandKey,
        contextPredicate: "selection",
        reasonKey: "presentation.capability.pictureSelectionRequired",
      }),
    ),
  );
  const byId = new Map(
    catalog.map((capability) => [capability.id, capability]),
  );
  const bindings = Object.freeze(
    definitions.map((definition) =>
      Object.freeze({
        featureId: definition.featureId,
        action: definition.action,
        handlerRef: definition.handlerRef,
        execute: definition.execute,
        isEnabled: definition.isEnabled,
        unavailableReasonKey:
          "presentation.capability.pictureSelectionRequired",
      }),
    ),
  );
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze(
      definitions.map((definition) => {
        const capability = v2ById.get(definition.featureId);
        if (!capability) {
          throw new Error(
            "Missing presentation picture-arrange-step semantic row",
          );
        }
        return Object.freeze({
          featureId: definition.featureId,
          semanticContract:
            presentationFeatureCommandSemanticContract(capability),
          action: definition.action,
          handlerRef: definition.handlerRef,
        });
      }),
    ),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: (capability) => {
      const v2 = v2ById.get(capability.id);
      if (!v2) {
        throw new Error(
          "Missing presentation picture-arrange-step semantic row",
        );
      }
      return presentationFeatureCommandSemanticContract(v2);
    },
    find: (featureId) => byId.get(featureId) ?? null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_ARRANGE_STEP_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  const enabledById = new Map(
    definitions.map((definition) => [
      definition.featureId,
      definition.isEnabled,
    ]),
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: (featureId: PresentationPictureArrangeStepFeatureId) =>
      enabledById.get(featureId)?.() ?? false,
    invoke: async (
      featureId: PresentationPictureArrangeStepFeatureId,
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) => (await registry.execute(featureId, context, runtime)) === "executed",
  }));
}

export type PresentationPictureSizeFeatureId =
  | typeof PRESENTATION_PICTURE_SIZE_WIDTH_FEATURE_ID
  | typeof PRESENTATION_PICTURE_SIZE_HEIGHT_FEATURE_ID;

export interface PresentationPictureSizeCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: (featureId: PresentationPictureSizeFeatureId) => boolean;
  readonly invoke: (
    featureId: PresentationPictureSizeFeatureId,
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureSizeCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-size.${instanceId}`,
  );
}

/** Exact two-command authority shared by each field and its native stepper. */
export function createPresentationPictureSizeCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly executeWidth: () => boolean;
  readonly executeHeight: () => boolean;
  readonly isWidthEnabled: () => boolean;
  readonly isHeightEnabled: () => boolean;
}): PresentationPictureSizeCommandAuthority {
  const definitions = Object.freeze([
    Object.freeze({
      featureId: PRESENTATION_PICTURE_SIZE_HEIGHT_FEATURE_ID,
      action: PRESENTATION_PICTURE_SIZE_HEIGHT_ACTION,
      handlerRef: PRESENTATION_PICTURE_SIZE_HEIGHT_HANDLER_REF,
      execute: config.executeHeight,
      isEnabled: config.isHeightEnabled,
      commandKey: "presentation.command.resizePictureHeight",
    }),
    Object.freeze({
      featureId: PRESENTATION_PICTURE_SIZE_WIDTH_FEATURE_ID,
      action: PRESENTATION_PICTURE_SIZE_WIDTH_ACTION,
      handlerRef: PRESENTATION_PICTURE_SIZE_WIDTH_HANDLER_REF,
      execute: config.executeWidth,
      isEnabled: config.isWidthEnabled,
      commandKey: "presentation.command.resizePictureWidth",
    }),
  ]);
  const v2ById = new Map(
    PRESENTATION_PICTURE_SIZE_CAPABILITY_CATALOG.features.map((feature) => [
      feature.featureId,
      feature,
    ]),
  );
  if (definitions.some((definition) => !v2ById.has(definition.featureId))) {
    throw new Error("Missing presentation picture-size capability");
  }
  const catalog = Object.freeze(
    definitions.map((definition) =>
      Object.freeze<PresentationFeatureCapability>({
        id: definition.featureId,
        tabs: ["image-format"],
        entry: "ribbon",
        authoring: "native",
        pptxImport: "native",
        fromScratchExport: "native",
        patchbackExport: "native",
        powerpoint: "editable",
        wps: "unsupported",
        commandKey: definition.commandKey,
        contextPredicate: "selection",
        reasonKey: "presentation.capability.pictureSelectionRequired",
      }),
    ),
  );
  const byId = new Map(
    catalog.map((capability) => [capability.id, capability]),
  );
  const bindings = Object.freeze(
    definitions.map((definition) =>
      Object.freeze({
        featureId: definition.featureId,
        action: definition.action,
        handlerRef: definition.handlerRef,
        execute: definition.execute,
        isEnabled: definition.isEnabled,
        unavailableReasonKey:
          "presentation.capability.pictureSelectionRequired",
      }),
    ),
  );
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze(
      definitions.map((definition) => {
        const capability = v2ById.get(definition.featureId);
        if (!capability) {
          throw new Error("Missing presentation picture-size semantic row");
        }
        return Object.freeze({
          featureId: definition.featureId,
          semanticContract:
            presentationFeatureCommandSemanticContract(capability),
          action: definition.action,
          handlerRef: definition.handlerRef,
        });
      }),
    ),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: (capability) => {
      const v2 = v2ById.get(capability.id);
      if (!v2)
        throw new Error("Missing presentation picture-size semantic row");
      return presentationFeatureCommandSemanticContract(v2);
    },
    find: (featureId) => byId.get(featureId) ?? null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_SIZE_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  const enabledById = new Map(
    definitions.map((definition) => [
      definition.featureId,
      definition.isEnabled,
    ]),
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: (featureId: PresentationPictureSizeFeatureId) =>
      enabledById.get(featureId)?.() ?? false,
    invoke: async (
      featureId: PresentationPictureSizeFeatureId,
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) => (await registry.execute(featureId, context, runtime)) === "executed",
  }));
}

export interface PresentationPictureBorderCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureBorderCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-border.${instanceId}`,
  );
}

/** One authority shared by the Picture Border primary and every menu leaf. */
export function createPresentationPictureBorderCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationPictureBorderCommandAuthority {
  const v2Capability =
    PRESENTATION_PICTURE_BORDER_CAPABILITY_CATALOG.features[0];
  if (!v2Capability)
    throw new Error("Missing presentation picture-border capability");
  const capability = Object.freeze<PresentationFeatureCapability>({
    id: PRESENTATION_PICTURE_BORDER_FEATURE_ID,
    tabs: ["image-format"],
    entry: "both",
    authoring: "native",
    pptxImport: "native",
    fromScratchExport: "native",
    patchbackExport: "native",
    powerpoint: "editable",
    wps: "editable",
    commandKey: "presentation.command.editPictureBorder",
    contextPredicate: "selection",
    reasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const binding = Object.freeze({
    featureId: PRESENTATION_PICTURE_BORDER_FEATURE_ID,
    action: PRESENTATION_PICTURE_BORDER_ACTION,
    handlerRef: PRESENTATION_PICTURE_BORDER_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const catalog = Object.freeze([capability]);
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_PICTURE_BORDER_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_PICTURE_BORDER_ACTION,
        handlerRef: PRESENTATION_PICTURE_BORDER_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) => (featureId === capability.id ? capability : null),
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_BORDER_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_PICTURE_BORDER_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationPictureTransparencyCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureTransparencyCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-transparency.${instanceId}`,
  );
}

/** One authority shared by all transparency presets and detailed options. */
export function createPresentationPictureTransparencyCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationPictureTransparencyCommandAuthority {
  const v2Capability =
    PRESENTATION_PICTURE_TRANSPARENCY_CAPABILITY_CATALOG.features[0];
  if (!v2Capability) {
    throw new Error("Missing presentation picture-transparency capability");
  }
  const capability = Object.freeze<PresentationFeatureCapability>({
    id: PRESENTATION_PICTURE_TRANSPARENCY_FEATURE_ID,
    tabs: ["image-format"],
    entry: "both",
    authoring: "native",
    pptxImport: "native",
    fromScratchExport: "native",
    patchbackExport: "native",
    powerpoint: "editable",
    wps: "editable",
    commandKey: "presentation.command.editPictureTransparency",
    contextPredicate: "selection",
    reasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const binding = Object.freeze({
    featureId: PRESENTATION_PICTURE_TRANSPARENCY_FEATURE_ID,
    action: PRESENTATION_PICTURE_TRANSPARENCY_ACTION,
    handlerRef: PRESENTATION_PICTURE_TRANSPARENCY_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const catalog = Object.freeze([capability]);
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_PICTURE_TRANSPARENCY_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_PICTURE_TRANSPARENCY_ACTION,
        handlerRef: PRESENTATION_PICTURE_TRANSPARENCY_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) => (featureId === capability.id ? capability : null),
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_TRANSPARENCY_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_PICTURE_TRANSPARENCY_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationPictureCorrectionsCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureCorrectionsCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-corrections.${instanceId}`,
  );
}

/** One authority shared by the 25 presets and the detailed Options entry. */
export function createPresentationPictureCorrectionsCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationPictureCorrectionsCommandAuthority {
  const v2Capability =
    PRESENTATION_PICTURE_CORRECTIONS_CAPABILITY_CATALOG.features[0];
  if (!v2Capability) {
    throw new Error("Missing presentation picture-corrections capability");
  }
  const capability = Object.freeze<PresentationFeatureCapability>({
    id: PRESENTATION_PICTURE_CORRECTIONS_FEATURE_ID,
    tabs: ["image-format"],
    entry: "both",
    authoring: "native",
    pptxImport: "native",
    fromScratchExport: "native",
    patchbackExport: "native",
    powerpoint: "editable",
    wps: "editable",
    commandKey: "presentation.command.editPictureCorrections",
    contextPredicate: "selection",
    reasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const binding = Object.freeze({
    featureId: PRESENTATION_PICTURE_CORRECTIONS_FEATURE_ID,
    action: PRESENTATION_PICTURE_CORRECTIONS_ACTION,
    handlerRef: PRESENTATION_PICTURE_CORRECTIONS_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const catalog = Object.freeze([capability]);
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_PICTURE_CORRECTIONS_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_PICTURE_CORRECTIONS_ACTION,
        handlerRef: PRESENTATION_PICTURE_CORRECTIONS_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) => (featureId === capability.id ? capability : null),
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_CORRECTIONS_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_PICTURE_CORRECTIONS_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationPictureColorCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationPictureColorCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.picture-color.${instanceId}`,
  );
}

/** One authority shared by the two supported Recolor leaves. */
export function createPresentationPictureColorCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationPictureColorCommandAuthority {
  const v2Capability =
    PRESENTATION_PICTURE_COLOR_CAPABILITY_CATALOG.features[0];
  if (!v2Capability) {
    throw new Error("Missing presentation picture-color capability");
  }
  const capability = Object.freeze<PresentationFeatureCapability>({
    id: PRESENTATION_PICTURE_COLOR_FEATURE_ID,
    tabs: ["image-format"],
    entry: "menu",
    authoring: "native",
    pptxImport: "native",
    fromScratchExport: "native",
    patchbackExport: "native",
    powerpoint: "editable",
    wps: "editable",
    commandKey: "presentation.command.editPictureColor",
    contextPredicate: "selection",
    reasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const binding = Object.freeze({
    featureId: PRESENTATION_PICTURE_COLOR_FEATURE_ID,
    action: PRESENTATION_PICTURE_COLOR_ACTION,
    handlerRef: PRESENTATION_PICTURE_COLOR_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
    unavailableReasonKey: "presentation.capability.pictureSelectionRequired",
  });
  const catalog = Object.freeze([capability]);
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_PICTURE_COLOR_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_PICTURE_COLOR_ACTION,
        handlerRef: PRESENTATION_PICTURE_COLOR_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) => (featureId === capability.id ? capability : null),
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_PICTURE_COLOR_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_PICTURE_COLOR_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationAccessibilityCheckCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationAccessibilityCheckCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.accessibility-check.${instanceId}`,
  );
}

/** Exact one-control, view-only authority for Review → Check Accessibility. */
export function createPresentationAccessibilityCheckCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: () => boolean;
  readonly isEnabled: () => boolean;
}): PresentationAccessibilityCheckCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_ACCESSIBILITY_CHECK_FEATURE_ID,
  );
  const v2Capability =
    PRESENTATION_ACCESSIBILITY_CHECK_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation accessibility-check capability");
  }
  const binding = Object.freeze({
    featureId: PRESENTATION_ACCESSIBILITY_CHECK_FEATURE_ID,
    action: PRESENTATION_ACCESSIBILITY_CHECK_ACTION,
    handlerRef: PRESENTATION_ACCESSIBILITY_CHECK_HANDLER_REF,
    execute: config.execute,
    isEnabled: config.isEnabled,
  });
  const catalog = Object.freeze([capability]);
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_ACCESSIBILITY_CHECK_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_ACCESSIBILITY_CHECK_ACTION,
        handlerRef: PRESENTATION_ACCESSIBILITY_CHECK_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_ACCESSIBILITY_CHECK_FEATURE_ID
        ? capability
        : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_ACCESSIBILITY_CHECK_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );
  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) =>
      (await registry.execute(
        PRESENTATION_ACCESSIBILITY_CHECK_FEATURE_ID,
        context,
        runtime,
      )) === "executed",
  }));
}

export interface PresentationViewAidCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    kind: PresentationViewAidKind,
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationViewAidCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.view-aids.${instanceId}`,
  );
}

/** One parameterized, view-only authority shared by all three Show controls. */
export function createPresentationViewAidCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: (kind: PresentationViewAidKind) => boolean;
  readonly isEnabled: () => boolean;
}): PresentationViewAidCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_VIEW_AID_FEATURE_ID,
  );
  const v2Capability = PRESENTATION_VIEW_AID_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation view-aid capability");
  }

  let pendingKind: PresentationViewAidKind | null = null;
  const executePendingKind = () => {
    const kind = pendingKind;
    return kind !== null && config.execute(kind);
  };
  const binding = Object.freeze({
    featureId: PRESENTATION_VIEW_AID_FEATURE_ID,
    action: PRESENTATION_VIEW_AID_ACTION,
    handlerRef: PRESENTATION_VIEW_AID_HANDLER_REF,
    execute: executePendingKind,
    isEnabled: config.isEnabled,
  });
  const catalog = Object.freeze([capability]);
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_VIEW_AID_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_VIEW_AID_ACTION,
        handlerRef: PRESENTATION_VIEW_AID_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_VIEW_AID_FEATURE_ID ? capability : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_VIEW_AID_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      kind: PresentationViewAidKind,
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) => {
      if (!isPresentationViewAidKind(kind) || pendingKind !== null) return false;
      pendingKind = kind;
      try {
        return (
          (await registry.execute(
            PRESENTATION_VIEW_AID_FEATURE_ID,
            context,
            runtime,
          )) === "executed"
        );
      } finally {
        pendingKind = null;
      }
    },
  }));
}

export interface PresentationViewportZoomCommandAuthority {
  readonly capabilityCatalog: ReturnType<
    typeof verifyPresentationFeatureCapabilityCatalogBindings
  >;
  readonly isEnabled: () => boolean;
  readonly invoke: (
    request: PresentationViewportZoomRequest,
    context: PresentationCapabilityContext,
    runtime: PresentationFeatureRuntimeState,
  ) => Promise<boolean>;
}

export function createPresentationViewportZoomCommandLineage(
  instanceId: string,
): FeatureCommandRegistryLineage {
  return createFeatureCommandRegistryLineage(
    "presentation",
    `presentation.viewport-zoom.${instanceId}`,
  );
}

/** One live view-only authority shared by Fit and every explicit-percent alias. */
export function createPresentationViewportZoomCommandAuthority(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly execute: (request: PresentationViewportZoomRequest) => boolean;
  readonly isEnabled: () => boolean;
}): PresentationViewportZoomCommandAuthority {
  const capability = findPresentationFeatureCapability(
    PRESENTATION_VIEW_ZOOM_FEATURE_ID,
  );
  const v2Capability = PRESENTATION_VIEW_ZOOM_CAPABILITY_CATALOG.features[0];
  if (!capability || !v2Capability) {
    throw new Error("Missing presentation viewport-zoom capability");
  }

  let pendingRequest: PresentationViewportZoomRequest | null = null;
  const executePendingRequest = () => {
    const request = pendingRequest;
    return request !== null && config.execute(request);
  };
  const binding = Object.freeze({
    featureId: PRESENTATION_VIEW_ZOOM_FEATURE_ID,
    action: PRESENTATION_VIEW_ZOOM_ACTION,
    handlerRef: PRESENTATION_VIEW_ZOOM_HANDLER_REF,
    execute: executePendingRequest,
    isEnabled: config.isEnabled,
  });
  const catalog = Object.freeze([capability]);
  const bindings = Object.freeze([binding]);
  const bindingContract = createFeatureCommandBindingContract({
    lineage: config.lineage,
    catalogEntries: Object.freeze([
      Object.freeze({
        featureId: PRESENTATION_VIEW_ZOOM_FEATURE_ID,
        semanticContract:
          presentationFeatureCommandSemanticContract(v2Capability),
        action: PRESENTATION_VIEW_ZOOM_ACTION,
        handlerRef: PRESENTATION_VIEW_ZOOM_HANDLER_REF,
      }),
    ]),
    bindings,
    resolveCapability: resolvePresentationFeatureCapability,
  });
  const registry = createFeatureCommandRegistry<
    PresentationFeatureCapability,
    PresentationCapabilityContext,
    PresentationFeatureRuntimeState,
    PresentationFeatureCommandGate
  >({
    editor: "presentation",
    catalog,
    lineage: config.lineage,
    bindingContract,
    describeBindingContract: () =>
      presentationFeatureCommandSemanticContract(v2Capability),
    find: (featureId) =>
      featureId === PRESENTATION_VIEW_ZOOM_FEATURE_ID ? capability : null,
    resolveCapability: resolvePresentationFeatureCapability,
    bindings,
  });
  const manifest = readFeatureCommandBindingManifest(registry.bindingManifest, {
    expectedLineage: config.lineage,
    expectedRegistry: registry,
    expectedBindingContract: bindingContract,
  });
  const capabilityCatalog = verifyPresentationFeatureCapabilityCatalogBindings(
    PRESENTATION_VIEW_ZOOM_CAPABILITY_CATALOG,
    manifest,
    {
      expectedLineage: config.lineage,
      expectedRegistry: registry,
      expectedBindingContract: bindingContract,
    },
  );

  return guardRenderedFeatureCommandAuthority(registry, Object.freeze({
    capabilityCatalog,
    isEnabled: config.isEnabled,
    invoke: async (
      request: PresentationViewportZoomRequest,
      context: PresentationCapabilityContext,
      runtime: PresentationFeatureRuntimeState,
    ) => {
      if (
        !isPresentationViewportZoomRequest(request) ||
        pendingRequest !== null
      ) {
        return false;
      }
      pendingRequest = request;
      try {
        return (
          (await registry.execute(
            PRESENTATION_VIEW_ZOOM_FEATURE_ID,
            context,
            runtime,
          )) === "executed"
        );
      } finally {
        pendingRequest = null;
      }
    },
  }));
}
