/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export type FeatureCommandResult = "executed" | "blocked";
export type FeatureCommandHandler = () =>
  boolean | void | Promise<boolean | void>;

export const FEATURE_COMMAND_BINDING_MANIFEST_SCHEMA_VERSION =
  "office-feature-command-bindings-v4" as const;
export const FEATURE_COMMAND_BINDING_CONTRACT_SCHEMA_VERSION =
  "office-feature-command-contract-v2" as const;

const MAX_REGISTRY_ID_CHARS = 512;
// One feature's contract names every value it accepts. The presentation
// animation effect names PowerPoint's whole effect set (well over a hundred
// kinds with their native variants), which is about 30,000 characters.
const MAX_SEMANTIC_CONTRACT_CHARS = 65_536;
const MAX_FEATURE_COMMAND_ENTRIES = 4_096;
const MAX_CATALOG_SNAPSHOT_NODES = 250_000;
const MAX_CATALOG_SNAPSHOT_DEPTH = 32;

export interface FeatureCommandSemanticContractEntry {
  readonly featureId: string;
  /** Adapter-owned, deterministic semantics for this feature. */
  readonly semanticContract: string;
  /** Catalog-owned command identity; null only for legacy, unauthenticated catalogs. */
  readonly action: string | null;
  /** Catalog-owned host handler key; paired with action. */
  readonly handlerRef: string | null;
}

/**
 * Adapter-owned expectation for one concrete host command binding.
 * String metadata describes the action; execute identity proves that the
 * registry captured the exact callable owned by that adapter instance.
 */
export interface FeatureCommandExpectedBindingEntry {
  readonly featureId: string;
  readonly action: string;
  readonly handlerRef: string;
  readonly execute: FeatureCommandHandler;
  readonly gate?: string;
  readonly isEnabled?: () => boolean;
  readonly unavailableReasonKey?: string | (() => string);
}

interface NormalizedFeatureCommandBindingIdentity<G extends string = string> {
  readonly featureId: string;
  readonly action: string | null;
  readonly handlerRef: string | null;
  readonly execute: FeatureCommandHandler;
  readonly gate: G | null;
  readonly isEnabled: (() => boolean) | null;
  readonly unavailableReasonKey: string | (() => string) | null;
}

type FeatureCommandCapabilityResolver = (...args: never[]) => unknown;

/**
 * Opaque, catalog-owned authority describing the exact bindings one adapter
 * is allowed to install. Create it independently from runtime registry wiring
 * and keep the instance private to the owning adapter.
 */
export interface FeatureCommandBindingContract {
  readonly schemaVersion: typeof FEATURE_COMMAND_BINDING_CONTRACT_SCHEMA_VERSION;
  readonly editor: string;
  readonly registryId: string;
  readonly contractEpoch: number;
  readonly catalogSemanticDigest: string;
  readonly boundSemanticDigest: string;
  readonly boundFeatureIds: readonly string[];
}

/**
 * Opaque authority for successive generations of one concrete registry.
 * Structural lookalikes are rejected because the live state is WeakMap-owned.
 */
export interface FeatureCommandRegistryLineage {
  readonly editor: string;
  readonly registryId: string;
}

interface FeatureCommandRegistryLineageState {
  readonly editor: string;
  readonly registryId: string;
  generation: number;
  currentRegistry: object | null;
  contractEpoch: number;
  latestBindingContract: FeatureCommandBindingContract | null;
}

const registryLineageStates = new WeakMap<
  FeatureCommandRegistryLineage,
  FeatureCommandRegistryLineageState
>();

/**
 * Runtime proof issued by {@link createFeatureCommandRegistry} after every
 * binding has been checked against that registry's catalog. The shape is
 * public for consumers, but acceptance is identity-based: a lookalike object
 * cannot be used to claim that handlers are live.
 */
export interface FeatureCommandBindingManifest {
  readonly schemaVersion: typeof FEATURE_COMMAND_BINDING_MANIFEST_SCHEMA_VERSION;
  readonly editor: string;
  readonly registryId: string;
  readonly generation: number;
  readonly bindingContractEpoch: number | null;
  readonly catalogSemanticDigest: string;
  readonly boundSemanticDigest: string;
  readonly boundFeatureIds: readonly string[];
}

export interface FeatureCommandBindingRegistry {
  readonly bindingManifest: FeatureCommandBindingManifest;
}

interface IssuedFeatureCommandRegistry {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly manifest: FeatureCommandBindingManifest;
  readonly bindings: readonly NormalizedFeatureCommandBindingIdentity[];
  readonly bindingContract: FeatureCommandBindingContract | null;
}

interface IssuedFeatureCommandBindingContract {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly contract: FeatureCommandBindingContract;
  readonly epoch: number;
  readonly catalogEntries: readonly FeatureCommandSemanticContractEntry[];
  readonly bindings: readonly NormalizedFeatureCommandBindingIdentity[];
  readonly resolveCapability: FeatureCommandCapabilityResolver;
  consumedRegistry: object | null;
}

const issuedBindingManifests = new WeakMap<
  object,
  IssuedFeatureCommandRegistry
>();
const issuedBindingRegistries = new WeakMap<
  object,
  IssuedFeatureCommandRegistry
>();
const issuedBindingContracts = new WeakMap<
  object,
  IssuedFeatureCommandBindingContract
>();

/**
 * Detect authority publication from any re-entrant config getter, including a
 * lineage getter that runs before its own lineage can be identified. JavaScript
 * execution is single-threaded here, so a monotonic module epoch is a strict,
 * fail-closed construction boundary without cross-lineage locking.
 */
let featureCommandAuthorityMutationEpoch = 0;

function advanceFeatureCommandAuthorityMutationEpoch(editor: string): void {
  if (featureCommandAuthorityMutationEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`${editor} feature command authority epoch exhausted`);
  }
  featureCommandAuthorityMutationEpoch += 1;
}

function isIssuedRegistryCurrentAuthority(
  registry: object,
  record: IssuedFeatureCommandRegistry,
  lineageState: FeatureCommandRegistryLineageState,
): boolean {
  const issuedContractEpoch = record.manifest.bindingContractEpoch ?? 0;
  return (
    registryLineageStates.get(record.lineage) === lineageState &&
    lineageState.currentRegistry === registry &&
    lineageState.generation === record.manifest.generation &&
    lineageState.latestBindingContract === record.bindingContract &&
    lineageState.contractEpoch === issuedContractEpoch
  );
}

function requireExactRegistryId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_REGISTRY_ID_CHARS ||
    value !== value.trim()
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireSemanticContract(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SEMANTIC_CONTRACT_CHARS ||
    value !== value.trim()
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function compareRegistryIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface CatalogSnapshotBudget {
  remainingNodes: number;
}

function snapshotCatalogValue(
  value: unknown,
  label: string,
  budget: CatalogSnapshotBudget,
  ancestors: WeakSet<object>,
  depth = 0,
): unknown {
  budget.remainingNodes -= 1;
  if (budget.remainingNodes < 0 || depth > MAX_CATALOG_SNAPSHOT_DEPTH) {
    throw new Error(`Oversized ${label}`);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value !== "object") {
    throw new Error(`Invalid ${label}`);
  }
  if (ancestors.has(value)) {
    throw new Error(`Cyclic ${label}`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const values = snapshotDenseArray(value, label);
      const copy: unknown[] = [];
      for (let index = 0; index < values.length; index += 1) {
        copy.push(
          snapshotCatalogValue(
            values[index],
            `${label}[${index}]`,
            budget,
            ancestors,
            depth + 1,
          ),
        );
      }
      return Object.freeze(copy);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`Invalid ${label} prototype`);
    }
    const copy = Object.create(prototype) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new Error(`Invalid ${label} symbol property`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(`Invalid ${label}.${key} property`);
      }
      Object.defineProperty(copy, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: snapshotCatalogValue(
          descriptor.value,
          `${label}.${key}`,
          budget,
          ancestors,
          depth + 1,
        ),
      });
    }
    return Object.freeze(copy);
  } finally {
    ancestors.delete(value);
  }
}

function snapshotDenseArray<T>(value: unknown, label: string): readonly T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_FEATURE_COMMAND_ENTRIES
  ) {
    throw new Error(`Invalid ${label}`);
  }
  const snapshot: T[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`Sparse ${label}[${index}]`);
    }
    snapshot.push(descriptor.value as T);
  }
  return Object.freeze(snapshot);
}

function normalizeSemanticContractEntries(
  entries: readonly FeatureCommandSemanticContractEntry[],
  label: string,
): readonly FeatureCommandSemanticContractEntry[] {
  const denseEntries = snapshotDenseArray<FeatureCommandSemanticContractEntry>(
    entries,
    label,
  );
  const normalized: FeatureCommandSemanticContractEntry[] = [];
  const featureIds = new Set<string>();
  for (let index = 0; index < denseEntries.length; index += 1) {
    const entry = denseEntries[index];
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Invalid ${label}[${index}]`);
    }
    const featureId = requireExactRegistryId(
      entry.featureId,
      `${label}[${index}].featureId`,
    );
    if (featureIds.has(featureId)) {
      throw new Error(`Duplicate ${label} feature ID: ${featureId}`);
    }
    featureIds.add(featureId);
    const actionValue = entry.action;
    const handlerRefValue = entry.handlerRef;
    if ((actionValue === null) !== (handlerRefValue === null)) {
      throw new Error(`Incomplete ${label}[${index}] binding identity`);
    }
    normalized.push(
      Object.freeze({
        featureId,
        semanticContract: requireSemanticContract(
          entry.semanticContract,
          `${label}[${index}].semanticContract`,
        ),
        action:
          actionValue === null
            ? null
            : requireExactRegistryId(actionValue, `${label}[${index}].action`),
        handlerRef:
          handlerRefValue === null
            ? null
            : requireExactRegistryId(
                handlerRefValue,
                `${label}[${index}].handlerRef`,
              ),
      }),
    );
  }
  return Object.freeze(
    normalized.sort((left, right) =>
      compareRegistryIds(left.featureId, right.featureId),
    ),
  );
}

/**
 * An exact canonical encoding, not a lossy short hash. Keeping the complete
 * canonical JSON string avoids collision-based proof substitution.
 */
function semanticDigest(
  entries: readonly FeatureCommandSemanticContractEntry[],
): string {
  return JSON.stringify(
    entries.map((entry) => [
      entry.featureId,
      entry.semanticContract,
      entry.action,
      entry.handlerRef,
    ]),
  );
}

function normalizeFeatureIds(
  featureIds: readonly string[],
  label: string,
): readonly string[] {
  const denseFeatureIds = snapshotDenseArray<string>(featureIds, label);
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < denseFeatureIds.length; index += 1) {
    const featureId = requireExactRegistryId(
      denseFeatureIds[index],
      `${label}[${index}]`,
    );
    if (seen.has(featureId)) {
      throw new Error(`Duplicate ${label}: ${featureId}`);
    }
    seen.add(featureId);
    normalized.push(featureId);
  }
  return Object.freeze(normalized.sort(compareRegistryIds));
}

function normalizeExpectedBindingEntries(
  entries: readonly FeatureCommandExpectedBindingEntry[],
  label: string,
): readonly NormalizedFeatureCommandBindingIdentity[] {
  const denseEntries = snapshotDenseArray<FeatureCommandExpectedBindingEntry>(
    entries,
    label,
  );
  const normalized: NormalizedFeatureCommandBindingIdentity[] = [];
  const featureIds = new Set<string>();
  for (let index = 0; index < denseEntries.length; index += 1) {
    const entry = denseEntries[index];
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Invalid ${label}[${index}]`);
    }
    const featureIdValue = entry.featureId;
    const actionValue = entry.action;
    const handlerRefValue = entry.handlerRef;
    const execute = entry.execute;
    const gateValue = entry.gate;
    const isEnabledValue = entry.isEnabled;
    const unavailableReasonKeyValue = entry.unavailableReasonKey;
    const featureId = requireExactRegistryId(
      featureIdValue,
      `${label}[${index}].featureId`,
    );
    if (featureIds.has(featureId)) {
      throw new Error(`Duplicate ${label} feature ID: ${featureId}`);
    }
    if (typeof execute !== "function") {
      throw new Error(`Invalid ${label}[${index}].execute`);
    }
    if (gateValue !== undefined && typeof gateValue !== "string") {
      throw new Error(`Invalid ${label}[${index}].gate`);
    }
    if (isEnabledValue !== undefined && typeof isEnabledValue !== "function") {
      throw new Error(`Invalid ${label}[${index}].isEnabled`);
    }
    if (
      unavailableReasonKeyValue !== undefined &&
      typeof unavailableReasonKeyValue !== "string" &&
      typeof unavailableReasonKeyValue !== "function"
    ) {
      throw new Error(`Invalid ${label}[${index}].unavailableReasonKey`);
    }
    featureIds.add(featureId);
    normalized.push(
      Object.freeze({
        featureId,
        action: requireExactRegistryId(
          actionValue,
          `${label}[${index}].action`,
        ),
        handlerRef: requireExactRegistryId(
          handlerRefValue,
          `${label}[${index}].handlerRef`,
        ),
        execute,
        gate:
          gateValue === undefined
            ? null
            : requireExactRegistryId(gateValue, `${label}[${index}].gate`),
        isEnabled: isEnabledValue ?? null,
        unavailableReasonKey:
          typeof unavailableReasonKeyValue === "string"
            ? requireExactRegistryId(
                unavailableReasonKeyValue,
                `${label}[${index}].unavailableReasonKey`,
              )
            : (unavailableReasonKeyValue ?? null),
      }),
    );
  }
  return Object.freeze(
    normalized.sort((left, right) =>
      compareRegistryIds(left.featureId, right.featureId),
    ),
  );
}

function semanticDigestForBoundBindings(
  entries: readonly FeatureCommandSemanticContractEntry[],
  bindings: readonly Pick<
    NormalizedFeatureCommandBindingIdentity,
    | "featureId"
    | "action"
    | "handlerRef"
    | "gate"
    | "isEnabled"
    | "unavailableReasonKey"
  >[],
  label: string,
  requireCanonicalIdentity = false,
): string {
  const entryByFeature = new Map(
    entries.map((entry) => [entry.featureId, entry] as const),
  );
  const selected: Array<
    readonly [
      string,
      string,
      string | null,
      string | null,
      string | null,
      readonly ["none"] | readonly ["callback"],
      readonly ["none"] | readonly ["callback"] | readonly ["value", string],
    ]
  > = [];
  const seen = new Set<string>();
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    const featureId = requireExactRegistryId(
      binding.featureId,
      `${label}[${index}].featureId`,
    );
    if (seen.has(featureId)) {
      throw new Error(`Duplicate ${label}: ${featureId}`);
    }
    seen.add(featureId);
    const entry = entryByFeature.get(featureId);
    if (!entry) {
      throw new Error(`Unknown ${label}: ${featureId}`);
    }
    if (
      requireCanonicalIdentity &&
      (entry.action !== binding.action ||
        entry.handlerRef !== binding.handlerRef)
    ) {
      throw new Error(`Canonical ${label} identity mismatch: ${featureId}`);
    }
    selected.push([
      featureId,
      entry.semanticContract,
      binding.action,
      binding.handlerRef,
      binding.gate,
      binding.isEnabled === null
        ? (["none"] as const)
        : (["callback"] as const),
      typeof binding.unavailableReasonKey === "function"
        ? (["callback"] as const)
        : binding.unavailableReasonKey === null
          ? (["none"] as const)
          : (["value", binding.unavailableReasonKey] as const),
    ]);
  }
  return JSON.stringify(
    selected.sort((left, right) => compareRegistryIds(left[0], right[0])),
  );
}

function bindingIdentitiesEqual(
  left: readonly NormalizedFeatureCommandBindingIdentity[],
  right: readonly NormalizedFeatureCommandBindingIdentity[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftBinding = left[index];
    const rightBinding = right[index];
    if (
      leftBinding.featureId !== rightBinding.featureId ||
      leftBinding.action !== rightBinding.action ||
      leftBinding.handlerRef !== rightBinding.handlerRef ||
      leftBinding.execute !== rightBinding.execute ||
      leftBinding.gate !== rightBinding.gate ||
      leftBinding.isEnabled !== rightBinding.isEnabled ||
      leftBinding.unavailableReasonKey !== rightBinding.unavailableReasonKey
    ) {
      return false;
    }
  }
  return true;
}

export function createFeatureCommandRegistryLineage(
  editorValue: string,
  registryIdValue: string,
): FeatureCommandRegistryLineage {
  const editor = requireExactRegistryId(
    editorValue,
    "feature command lineage editor",
  );
  const registryId = requireExactRegistryId(
    registryIdValue,
    "feature command lineage registry ID",
  );
  const lineage = Object.freeze({ editor, registryId });
  registryLineageStates.set(lineage, {
    editor,
    registryId,
    generation: 0,
    currentRegistry: null,
    contractEpoch: 0,
    latestBindingContract: null,
  });
  return lineage;
}

/**
 * Issue the adapter's canonical binding contract before wiring a runtime
 * registry. The returned object is an opaque, monotonic, single-use authority:
 * readers accept only this exact instance, never a structural clone, replay,
 * or raw expectation list. Issuance immediately revokes the lineage's prior
 * registry so a failed replacement cannot leave older handlers authoritative.
 */
export function createFeatureCommandBindingContract<
  Resolver extends FeatureCommandCapabilityResolver,
>(config: {
  readonly lineage: FeatureCommandRegistryLineage;
  readonly catalogEntries: readonly FeatureCommandSemanticContractEntry[];
  readonly bindings: readonly FeatureCommandExpectedBindingEntry[];
  readonly resolveCapability: Resolver;
}): FeatureCommandBindingContract {
  const startingAuthorityMutationEpoch = featureCommandAuthorityMutationEpoch;
  const lineageValue = config.lineage;
  const lineageState = registryLineageStates.get(lineageValue);
  if (!lineageState) {
    throw new Error(`Invalid feature command binding contract lineage`);
  }
  const startingGeneration = lineageState.generation;
  const startingRegistry = lineageState.currentRegistry;
  const startingContractEpoch = lineageState.contractEpoch;
  const startingContract = lineageState.latestBindingContract;
  const catalogEntriesValue = config.catalogEntries;
  const bindingsValue = config.bindings;
  const resolveCapabilityValue = config.resolveCapability;
  if (typeof resolveCapabilityValue !== "function") {
    throw new Error(
      `Invalid ${lineageState.editor} feature command contract capability resolver`,
    );
  }
  const catalogEntries = normalizeSemanticContractEntries(
    catalogEntriesValue,
    `${lineageState.editor} feature command contract catalog entries`,
  );
  const bindings = normalizeExpectedBindingEntries(
    bindingsValue,
    `${lineageState.editor} feature command contract bindings`,
  );
  const catalogSemanticDigest = semanticDigest(catalogEntries);
  const boundSemanticDigest = semanticDigestForBoundBindings(
    catalogEntries,
    bindings,
    `${lineageState.editor} feature command contract bindings`,
    true,
  );
  const boundFeatureIds = Object.freeze(
    bindings.map((binding) => binding.featureId),
  );
  if (
    featureCommandAuthorityMutationEpoch !== startingAuthorityMutationEpoch ||
    lineageState.generation !== startingGeneration ||
    lineageState.currentRegistry !== startingRegistry ||
    lineageState.contractEpoch !== startingContractEpoch ||
    lineageState.latestBindingContract !== startingContract
  ) {
    throw new Error(
      `${lineageState.editor} feature command contract issuance superseded`,
    );
  }
  if (startingContractEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `${lineageState.editor} feature command contract exhausted`,
    );
  }
  const contractEpoch = startingContractEpoch + 1;
  const contract = Object.freeze({
    schemaVersion: FEATURE_COMMAND_BINDING_CONTRACT_SCHEMA_VERSION,
    editor: lineageState.editor,
    registryId: lineageState.registryId,
    contractEpoch,
    catalogSemanticDigest,
    boundSemanticDigest,
    boundFeatureIds,
  }) satisfies FeatureCommandBindingContract;
  advanceFeatureCommandAuthorityMutationEpoch(lineageState.editor);
  issuedBindingContracts.set(contract, {
    lineage: lineageValue,
    contract,
    epoch: contractEpoch,
    catalogEntries,
    bindings,
    resolveCapability: resolveCapabilityValue,
    consumedRegistry: null,
  });
  lineageState.contractEpoch = contractEpoch;
  lineageState.latestBindingContract = contract;
  return contract;
}

export interface ReadFeatureCommandBindingManifestOptions {
  readonly expectedLineage: FeatureCommandRegistryLineage;
  readonly expectedRegistry: FeatureCommandBindingRegistry;
  readonly expectedBindingContract: FeatureCommandBindingContract;
}

/**
 * Read an identity-authenticated binding manifest for one editor adapter.
 * Manifests are intentionally process-local and non-serializable so parsed
 * JSON or a catalog's complete `featureIds` list cannot impersonate bindings.
 * The reader accepts only the exact catalog-owned binding contract that was
 * attached during registry construction. Raw expectation lists are never a
 * read-time authority.
 */
export function readFeatureCommandBindingManifest(
  manifest: unknown,
  options: ReadFeatureCommandBindingManifestOptions,
): FeatureCommandBindingManifest {
  const expectedLineage = options.expectedLineage;
  const expectedRegistry = options.expectedRegistry;
  const expectedBindingContract = options.expectedBindingContract;
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    expectedRegistry === null ||
    typeof expectedRegistry !== "object" ||
    expectedBindingContract === null ||
    typeof expectedBindingContract !== "object"
  ) {
    throw new Error(`Untrusted feature command binding manifest`);
  }
  const manifestRecord = issuedBindingManifests.get(manifest);
  const registryRecord = issuedBindingRegistries.get(expectedRegistry);
  const contractRecord = issuedBindingContracts.get(expectedBindingContract);
  const lineageState = registryLineageStates.get(expectedLineage);
  if (
    !manifestRecord ||
    !registryRecord ||
    !contractRecord ||
    manifestRecord !== registryRecord ||
    manifestRecord.lineage !== expectedLineage ||
    contractRecord.lineage !== expectedLineage ||
    contractRecord.epoch !== expectedBindingContract.contractEpoch ||
    contractRecord.consumedRegistry !== expectedRegistry ||
    registryRecord.bindingContract !== expectedBindingContract ||
    !lineageState ||
    !isIssuedRegistryCurrentAuthority(
      expectedRegistry,
      registryRecord,
      lineageState,
    )
  ) {
    throw new Error(`Untrusted or stale feature command binding manifest`);
  }
  const trusted = manifest as FeatureCommandBindingManifest;
  const trustedContract = expectedBindingContract;
  if (trusted.editor !== trustedContract.editor) {
    throw new Error(
      `Feature command binding manifest editor mismatch: ${trusted.editor}`,
    );
  }
  if (
    trusted.registryId !== trustedContract.registryId ||
    trusted.bindingContractEpoch !== trustedContract.contractEpoch ||
    lineageState.editor !== trustedContract.editor ||
    lineageState.registryId !== trustedContract.registryId
  ) {
    throw new Error(
      `Feature command binding manifest registry mismatch: ${trusted.registryId}`,
    );
  }
  const trustedBoundFeatureIds = normalizeFeatureIds(
    trusted.boundFeatureIds,
    "feature command issued bound feature IDs",
  );
  const contractBoundFeatureIds = normalizeFeatureIds(
    trustedContract.boundFeatureIds,
    "feature command contract bound feature IDs",
  );
  if (
    trustedBoundFeatureIds.length !== contractBoundFeatureIds.length ||
    !bindingIdentitiesEqual(registryRecord.bindings, contractRecord.bindings)
  ) {
    throw new Error(`Feature command binding identity mismatch`);
  }
  for (let index = 0; index < trustedBoundFeatureIds.length; index += 1) {
    if (trustedBoundFeatureIds[index] !== contractBoundFeatureIds[index]) {
      throw new Error(`Feature command binding identity mismatch`);
    }
  }
  if (
    trusted.catalogSemanticDigest !== trustedContract.catalogSemanticDigest ||
    trusted.boundSemanticDigest !== trustedContract.boundSemanticDigest
  ) {
    throw new Error(`Feature command binding semantic digest mismatch`);
  }
  const finalManifestRecord = issuedBindingManifests.get(manifest);
  const finalRegistryRecord = issuedBindingRegistries.get(expectedRegistry);
  const finalContractRecord = issuedBindingContracts.get(
    expectedBindingContract,
  );
  const finalLineageState = registryLineageStates.get(expectedLineage);
  if (
    finalManifestRecord !== manifestRecord ||
    finalRegistryRecord !== registryRecord ||
    finalContractRecord !== contractRecord ||
    finalContractRecord.consumedRegistry !== expectedRegistry ||
    !finalLineageState ||
    !isIssuedRegistryCurrentAuthority(
      expectedRegistry,
      registryRecord,
      finalLineageState,
    )
  ) {
    throw new Error(`Untrusted or stale feature command binding manifest`);
  }
  return trusted;
}

export function isFeatureCommandBindingRegistryCurrent(
  registry: unknown,
  lineage: FeatureCommandRegistryLineage,
): registry is FeatureCommandBindingRegistry {
  if (registry === null || typeof registry !== "object") return false;
  const record = issuedBindingRegistries.get(registry);
  const lineageState = registryLineageStates.get(lineage);
  return Boolean(
    record &&
    lineageState &&
    record.lineage === lineage &&
    isIssuedRegistryCurrentAuthority(registry, record, lineageState),
  );
}

/**
 * DEVELOPMENT-ONLY guard for the "enabled but silent" command.
 *
 * Issuing an authority on a lineage revokes the lineage's previous registry.
 * A host that issues authorities from its render body (`useMemo`, a
 * `useState` initializer, anything keyed on changing deps) hands its UI a
 * registry that a later render can revoke before that UI is rendered again:
 *
 * - a render that has started but not committed (measured on the Alt Text
 *   repro, b24a8ad5c2: the selection's commit rendered the button from
 *   generation 9, the next render issued generation 10 and had not committed
 *   when the click arrived, so the click reached generation 9);
 * - Strict Mode, where React 19 runs every `useMemo` factory twice and keeps
 *   the FIRST result, so the kept authority is revoked before it is ever
 *   rendered.
 *
 * `execute` then answers "blocked" for good, while the authority's
 * `isEnabled` — the host's raw availability callback, which knows nothing of
 * generations — keeps the button enabled. The click does nothing and nothing
 * says why (b24a8ad5c2: picture Alt Text; 8dd743ce40: Insert Pictures).
 *
 * Wrap the object an authority hands to its UI with this. It observes the two
 * places the UI touches it:
 * - `isEnabled(...)` answering `true` while `registry` is revoked (the button
 *   is being RENDERED enabled from a dead registry — the Strict Mode shape);
 * - `invoke(...)` on a revoked `registry` while `isEnabled(...)` answers
 *   `true` (the enabled button was CLICKED and will be silently refused — the
 *   uncommitted-render shape, which no render ever re-reads).
 * Either reports the lineage editor, registry id, command id and both
 * generations: `console.error` in development, and a synchronous THROW under
 * test (`NODE_ENV === "test"`), so a component suite that renders or clicks
 * such a button fails with that message. The wrapped functions return exactly
 * what the originals return; in production the authority is returned as is,
 * so the guard costs nothing there.
 *
 * Why this point and no other, and why it has no false positives:
 * - It reads only what the UI reads. A revoked registry whose button is
 *   disabled, or that no UI touches any more, is not reported, and `invoke`
 *   calls `isEnabled` only once the registry is already revoked, so a current
 *   authority's callbacks run exactly as often as before.
 * - A correct host never exposes a revoked authority to its UI: an authority
 *   built once (ref) is never replaced, and one built at an effect boundary is
 *   replaced and republished in the same synchronous effect. Contract
 *   issuance and registry construction never call back into `isEnabled`.
 *   A report therefore always names a host that issued a generation from a
 *   render — the bug itself.
 * - It stays out of `registry.execute`/`resolve`: the registry's own
 *   fail-closed tests execute revoked registries whose bindings say enabled
 *   (hostile re-entry, predecessor generations) on purpose; a test that does
 *   that through an authority says so with
 *   {@link expectRevokedFeatureCommandInvocation}.
 * - "A lineage replaced twice within one commit" was considered and rejected:
 *   the non-Strict-Mode failure replaces the lineage once per render (the
 *   pending render issues N+1 while the committed UI still holds N), so it
 *   misses the bug that shipped; and a commit followed by a synchronous
 *   re-render that commits again replaces a lineage twice in one task with no
 *   stale button anywhere.
 */
export function guardRenderedFeatureCommandAuthority<
  Authority extends {
    readonly isEnabled: (...args: never[]) => boolean;
    readonly invoke: (...args: never[]) => unknown;
  },
>(registry: FeatureCommandBindingRegistry, authority: Authority): Authority {
  if (process.env.NODE_ENV === "production") return authority;
  const isEnabled = authority.isEnabled as (
    ...args: readonly unknown[]
  ) => boolean;
  const invoke = authority.invoke as (...args: readonly unknown[]) => unknown;
  return Object.freeze({
    ...authority,
    isEnabled: (...args: readonly unknown[]): boolean => {
      const enabled = isEnabled(...args);
      if (enabled === true && !isIssuedRegistryCurrent(registry)) {
        reportRevokedEnabledFeatureCommand(registry, args, "rendered");
      }
      return enabled;
    },
    invoke: (...args: readonly unknown[]): unknown => {
      if (
        revokedFeatureCommandInvocationsExpected === 0 &&
        !isIssuedRegistryCurrent(registry) &&
        isEnabled(...args) === true
      ) {
        reportRevokedEnabledFeatureCommand(registry, args, "invoked");
      }
      return invoke(...args);
    },
  });
}

let revokedFeatureCommandInvocationsExpected = 0;

/**
 * The same development-only check for an authority of another shape (the
 * workbook's `resolveForRender` / `execute` pair): call it where the host has
 * just answered "enabled" for `featureId`, with `how` saying whether that
 * answer is being drawn ("rendered") or acted on ("invoked"). It reports, and
 * under test throws, exactly as {@link guardRenderedFeatureCommandAuthority}
 * does when `registry` is no longer its lineage's current generation; it is a
 * no-op in production and for a current registry.
 */
export function checkEnabledFeatureCommandRegistry(
  registry: FeatureCommandBindingRegistry,
  featureId: string,
  how: "rendered" | "invoked",
): void {
  if (process.env.NODE_ENV === "production") return;
  // Inside an announced revoked invocation the host re-resolves the command
  // as part of that invocation; neither answer is a stale control.
  if (revokedFeatureCommandInvocationsExpected !== 0) return;
  if (isIssuedRegistryCurrent(registry)) return;
  reportRevokedEnabledFeatureCommand(registry, [featureId], how);
}


/**
 * Test hook: run `run` while invoking a revoked authority is EXPECTED, so
 * {@link guardRenderedFeatureCommandAuthority} does not report it. For tests
 * that exercise the fail-closed path on purpose; the check is synchronous, so
 * wrap the `invoke(...)` call itself (its promise may settle later).
 */
export function expectRevokedFeatureCommandInvocation<T>(run: () => T): T {
  revokedFeatureCommandInvocationsExpected += 1;
  try {
    return run();
  } finally {
    revokedFeatureCommandInvocationsExpected -= 1;
  }
}

function isIssuedRegistryCurrent(registry: object): boolean {
  const record = issuedBindingRegistries.get(registry);
  if (!record) return true;
  const lineageState = registryLineageStates.get(record.lineage);
  return Boolean(
    lineageState &&
    isIssuedRegistryCurrentAuthority(registry, record, lineageState),
  );
}

const reportedRevokedEnabledFeatureCommands = new WeakMap<
  object,
  Set<string>
>();

function reportRevokedEnabledFeatureCommand(
  registry: object,
  args: readonly unknown[],
  how: "rendered" | "invoked",
): void {
  const record = issuedBindingRegistries.get(registry);
  if (!record) return;
  const lineageState = registryLineageStates.get(record.lineage);
  const requested = args[0];
  const commandId =
    typeof requested === "string" &&
    record.manifest.boundFeatureIds.includes(requested)
      ? requested
      : record.manifest.boundFeatureIds.join(", ");
  const message =
    `${record.lineage.editor} command "${commandId}" was ${how} ENABLED ` +
    `from a revoked command registry: registry "${record.lineage.registryId}" ` +
    `generation ${record.manifest.generation} (contract epoch ` +
    `${record.manifest.bindingContractEpoch ?? "none"}), but the lineage is ` +
    `now at generation ${lineageState?.generation ?? "unknown"} (contract ` +
    `epoch ${lineageState?.contractEpoch ?? "unknown"}). Its execute() ` +
    `answers "blocked" for good, so the control is enabled but silent. The ` +
    `host issued a newer authority from a render (useMemo / useState ` +
    `initializer / render body) and its UI kept the older one; build the ` +
    `authority once into a ref and read the live adapter through refs ` +
    `(b24a8ad5c2).`;
  const key = `${how}:${commandId}`;
  const reported = reportedRevokedEnabledFeatureCommands.get(registry);
  if (!reported?.has(key)) {
    if (reported) reported.add(key);
    else reportedRevokedEnabledFeatureCommands.set(registry, new Set([key]));
    console.error(`[featureCommandRegistry] ${message}`);
  }
  if (process.env.NODE_ENV === "test") {
    throw new Error(message);
  }
}

export interface FeatureCapabilityLike {
  id: string;
  reasonKey?: string;
}

export interface FeatureCommandBinding<G extends string = string> {
  featureId: string;
  /** Stable adapter action ID used when authenticating a binding manifest. */
  action?: string;
  /** Stable host method/key used when authenticating a binding manifest. */
  handlerRef?: string;
  execute: FeatureCommandHandler;
  gate?: G;
  isEnabled?: () => boolean;
  unavailableReasonKey?: string | (() => string);
}

type NormalizedFeatureCommandBinding<G extends string = string> =
  NormalizedFeatureCommandBindingIdentity<G>;

export interface ResolvedFeatureCommand<C extends FeatureCapabilityLike> {
  capability: C;
  bound: boolean;
  enabled: boolean;
  reasonKey: string | null;
}

export interface FeatureCommandRegistry<
  C extends FeatureCapabilityLike,
  Ctx,
  R,
> extends FeatureCommandBindingRegistry {
  readonly featureIds: readonly string[];
  /** Exact catalog members that have a live handler in this registry. */
  readonly boundFeatureIds: readonly string[];
  /** Identity-authenticated proof for capability adapters. */
  readonly bindingManifest: FeatureCommandBindingManifest;
  resolve(
    featureId: string,
    context: Ctx,
    runtime: R,
  ): ResolvedFeatureCommand<C>;
  execute(
    featureId: string,
    context: Ctx,
    runtime: R,
  ): Promise<FeatureCommandResult>;
}

export function createFeatureCommandRegistry<
  C extends FeatureCapabilityLike,
  Ctx,
  R,
  G extends string = string,
>(config: {
  /** e.g. "presentation" | "document" — names errors and reason keys. */
  editor: string;
  catalog: readonly C[];
  /** Optional shared authority for replacement generations of one registry. */
  lineage?: FeatureCommandRegistryLineage;
  /** Opaque canonical authority required for v4 manifest authentication. */
  bindingContract?: FeatureCommandBindingContract;
  /** Adapter-owned semantic contract; defaults to the feature ID. */
  describeBindingContract?: (capability: C) => string;
  find: (id: string) => C | null;
  resolveCapability: (
    capability: C,
    context: Ctx,
    runtime: R,
    gate?: G,
  ) => { enabled: boolean; reasonKey: string | null };
  bindings: readonly FeatureCommandBinding<G>[];
}): FeatureCommandRegistry<C, Ctx, R> {
  const startingAuthorityMutationEpoch = featureCommandAuthorityMutationEpoch;
  const editorValue = config.editor;
  const catalogValue = config.catalog;
  const lineageValue = config.lineage;
  const bindingContractValue = config.bindingContract;
  const describeBindingContractValue = config.describeBindingContract;
  const findValue = config.find;
  const resolveCapabilityValue = config.resolveCapability;
  const bindingsValue = config.bindings;
  const editor = requireExactRegistryId(editorValue, "feature command editor");
  if (featureCommandAuthorityMutationEpoch !== startingAuthorityMutationEpoch) {
    throw new Error(
      `${editor} feature command registry construction superseded`,
    );
  }
  if (typeof findValue !== "function") {
    throw new Error(`Invalid ${editor} feature command catalog lookup`);
  }
  if (typeof resolveCapabilityValue !== "function") {
    throw new Error(`Invalid ${editor} feature command capability resolver`);
  }
  if (
    describeBindingContractValue !== undefined &&
    typeof describeBindingContractValue !== "function"
  ) {
    throw new Error(`Invalid ${editor} feature command semantic descriptor`);
  }
  const lineage =
    lineageValue ??
    createFeatureCommandRegistryLineage(editor, `${editor}.isolated`);
  const lineageState = registryLineageStates.get(lineage);
  if (
    !lineageState ||
    lineageState.editor !== editor ||
    lineage.editor !== editor
  ) {
    throw new Error(`Invalid ${editor} feature command registry lineage`);
  }
  const bindingContractRecord =
    bindingContractValue === undefined
      ? null
      : issuedBindingContracts.get(bindingContractValue);
  if (
    bindingContractValue !== undefined &&
    (!bindingContractRecord || bindingContractRecord.lineage !== lineage)
  ) {
    throw new Error(`Untrusted ${editor} feature command binding contract`);
  }
  if (
    bindingContractValue === undefined &&
    lineageState.latestBindingContract !== null
  ) {
    throw new Error(`${editor} feature command binding contract required`);
  }
  if (bindingContractRecord) {
    if (
      lineageState.latestBindingContract !== bindingContractValue ||
      lineageState.contractEpoch !== bindingContractRecord.epoch
    ) {
      throw new Error(`Stale ${editor} feature command binding contract`);
    }
    if (bindingContractRecord.consumedRegistry !== null) {
      throw new Error(`Consumed ${editor} feature command binding contract`);
    }
  }
  const startingGeneration = lineageState.generation;
  const startingRegistry = lineageState.currentRegistry;
  const startingContractEpoch = lineageState.contractEpoch;
  const startingContract = lineageState.latestBindingContract;
  const catalog = snapshotDenseArray<C>(
    catalogValue,
    `${editor} feature command catalog`,
  );
  const bindings = snapshotDenseArray<FeatureCommandBinding<G>>(
    bindingsValue,
    `${editor} feature command bindings`,
  );
  const contractCatalogByFeature = new Map(
    bindingContractRecord?.catalogEntries.map(
      (entry) => [entry.featureId, entry] as const,
    ) ?? [],
  );
  const find = findValue;
  const resolveCapability = resolveCapabilityValue;
  const catalogByFeature = new Map<string, C>();
  const semanticEntries: FeatureCommandSemanticContractEntry[] = [];
  const snapshotBudget: CatalogSnapshotBudget = {
    remainingNodes: MAX_CATALOG_SNAPSHOT_NODES,
  };
  const featureIds = Object.freeze(
    catalog.map((item, index) => {
      if (item === null || typeof item !== "object") {
        throw new Error(`Invalid ${editor} feature command catalog[${index}]`);
      }
      const snapshot = snapshotCatalogValue(
        item,
        `${editor} feature command catalog[${index}]`,
        snapshotBudget,
        new WeakSet<object>(),
      ) as C;
      const featureId = requireExactRegistryId(
        snapshot.id,
        `feature command catalog[${index}].id`,
      );
      if (catalogByFeature.has(featureId)) {
        throw new Error(`Duplicate ${editor} feature command catalog ID`);
      }
      if (find(featureId) !== item) {
        throw new Error(
          `${editor} feature command catalog lookup identity mismatch: ${featureId}`,
        );
      }
      catalogByFeature.set(featureId, snapshot);
      const contractEntry = contractCatalogByFeature.get(featureId);
      semanticEntries.push({
        featureId,
        semanticContract: requireSemanticContract(
          describeBindingContractValue?.(snapshot) ?? featureId,
          `${editor} feature command catalog[${index}] semantic contract`,
        ),
        action: contractEntry?.action ?? null,
        handlerRef: contractEntry?.handlerRef ?? null,
      });
      return featureId;
    }),
  );
  if (new Set(featureIds).size !== featureIds.length) {
    throw new Error(`Duplicate ${editor} feature command catalog ID`);
  }
  const bindingByFeature = new Map<
    string,
    NormalizedFeatureCommandBinding<G>
  >();
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    if (binding === null || typeof binding !== "object") {
      throw new Error(`Invalid ${editor} feature command binding[${index}]`);
    }
    const featureIdValue = binding.featureId;
    const actionValue = binding.action;
    const handlerRefValue = binding.handlerRef;
    const execute = binding.execute;
    const gate = binding.gate;
    const isEnabled = binding.isEnabled;
    const unavailableReasonKeyValue = binding.unavailableReasonKey;
    const featureId = requireExactRegistryId(
      featureIdValue,
      `${editor} feature command binding[${index}].featureId`,
    );
    if (!catalogByFeature.has(featureId)) {
      throw new Error(`Unknown ${editor} feature command: ${featureId}`);
    }
    if (bindingByFeature.has(featureId)) {
      throw new Error(`Duplicate ${editor} feature command: ${featureId}`);
    }
    if (typeof execute !== "function") {
      throw new Error(
        `Invalid ${editor} feature command binding[${index}].execute`,
      );
    }
    if ((actionValue === undefined) !== (handlerRefValue === undefined)) {
      throw new Error(
        `Incomplete ${editor} feature command binding[${index}] identity`,
      );
    }
    const action =
      actionValue === undefined
        ? null
        : requireExactRegistryId(
            actionValue,
            `${editor} feature command binding[${index}].action`,
          );
    const handlerRef =
      handlerRefValue === undefined
        ? null
        : requireExactRegistryId(
            handlerRefValue,
            `${editor} feature command binding[${index}].handlerRef`,
          );
    if (gate !== undefined && typeof gate !== "string") {
      throw new Error(
        `Invalid ${editor} feature command binding[${index}].gate`,
      );
    }
    if (isEnabled !== undefined && typeof isEnabled !== "function") {
      throw new Error(
        `Invalid ${editor} feature command binding[${index}].isEnabled`,
      );
    }
    if (
      unavailableReasonKeyValue !== undefined &&
      typeof unavailableReasonKeyValue !== "function" &&
      typeof unavailableReasonKeyValue !== "string"
    ) {
      throw new Error(
        `Invalid ${editor} feature command binding[${index}].unavailableReasonKey`,
      );
    }
    const unavailableReasonKey =
      typeof unavailableReasonKeyValue === "string"
        ? requireExactRegistryId(
            unavailableReasonKeyValue,
            `${editor} feature command binding[${index}].unavailableReasonKey`,
          )
        : unavailableReasonKeyValue;
    bindingByFeature.set(
      featureId,
      Object.freeze({
        featureId,
        action,
        handlerRef,
        execute,
        gate:
          gate === undefined
            ? null
            : (requireExactRegistryId(
                gate,
                `${editor} feature command binding[${index}].gate`,
              ) as G),
        isEnabled: isEnabled ?? null,
        unavailableReasonKey: unavailableReasonKey ?? null,
      }),
    );
  }

  const boundFeatureIds = Object.freeze([...bindingByFeature.keys()]);
  const bindingIdentities = Object.freeze(
    [...bindingByFeature.values()]
      .map(
        ({
          featureId,
          action,
          handlerRef,
          execute,
          gate,
          isEnabled,
          unavailableReasonKey,
        }) =>
          Object.freeze({
            featureId,
            action,
            handlerRef,
            execute,
            gate,
            isEnabled,
            unavailableReasonKey,
          }),
      )
      .sort((left, right) =>
        compareRegistryIds(left.featureId, right.featureId),
      ),
  );
  const normalizedSemanticEntries = normalizeSemanticContractEntries(
    semanticEntries,
    `${editor} feature command semantic entries`,
  );
  const catalogSemanticDigest = semanticDigest(normalizedSemanticEntries);
  const boundSemanticDigest = semanticDigestForBoundBindings(
    normalizedSemanticEntries,
    bindingIdentities,
    `${editor} feature command bindings`,
    bindingContractRecord !== null,
  );
  let bindingContract: FeatureCommandBindingContract | null = null;
  if (bindingContractValue !== undefined) {
    if (
      !bindingContractRecord ||
      bindingContractRecord.contract !== bindingContractValue
    ) {
      throw new Error(`Untrusted ${editor} feature command binding contract`);
    }
    if (
      bindingContractValue.editor !== editor ||
      bindingContractValue.registryId !== lineageState.registryId ||
      bindingContractValue.catalogSemanticDigest !== catalogSemanticDigest ||
      bindingContractValue.boundSemanticDigest !== boundSemanticDigest ||
      bindingContractRecord.resolveCapability !== resolveCapability ||
      !bindingIdentitiesEqual(bindingIdentities, bindingContractRecord.bindings)
    ) {
      throw new Error(`${editor} feature command binding contract mismatch`);
    }
    bindingContract = bindingContractValue;
  }
  if (
    featureCommandAuthorityMutationEpoch !== startingAuthorityMutationEpoch ||
    lineageState.generation !== startingGeneration ||
    lineageState.currentRegistry !== startingRegistry ||
    lineageState.contractEpoch !== startingContractEpoch ||
    lineageState.latestBindingContract !== startingContract
  ) {
    throw new Error(
      `${editor} feature command registry construction superseded`,
    );
  }
  if (
    bindingContractRecord &&
    (bindingContractRecord.consumedRegistry !== null ||
      bindingContractRecord.epoch !== startingContractEpoch ||
      bindingContractValue !== startingContract)
  ) {
    throw new Error(`Stale ${editor} feature command binding contract`);
  }
  if (startingGeneration >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`${editor} feature command registry generation exhausted`);
  }
  const generation = startingGeneration + 1;
  const bindingManifest = Object.freeze({
    schemaVersion: FEATURE_COMMAND_BINDING_MANIFEST_SCHEMA_VERSION,
    editor,
    registryId: lineageState.registryId,
    generation,
    bindingContractEpoch: bindingContractRecord?.epoch ?? null,
    catalogSemanticDigest,
    boundSemanticDigest,
    boundFeatureIds,
  }) satisfies FeatureCommandBindingManifest;
  const staleRegistryReasonKey = `${editor}.capability.registryStale`;
  const isCurrentGeneration = (): boolean => {
    const issued = issuedBindingRegistries.get(registry);
    return Boolean(
      issued &&
      issued.lineage === lineage &&
      issued.manifest === bindingManifest &&
      isIssuedRegistryCurrentAuthority(registry, issued, lineageState),
    );
  };
  const staleDecision = (capability: C): ResolvedFeatureCommand<C> => ({
    capability,
    bound: false,
    enabled: false,
    reasonKey: staleRegistryReasonKey,
  });

  const resolve = (
    featureId: string,
    context: Ctx,
    runtime: R,
  ): ResolvedFeatureCommand<C> => {
    const capability = catalogByFeature.get(featureId);
    if (!capability) {
      throw new Error(`Unknown ${editor} feature command: ${featureId}`);
    }
    const binding = bindingByFeature.get(featureId);
    if (!isCurrentGeneration()) {
      return staleDecision(capability);
    }
    const decision = resolveCapability(
      capability,
      context,
      runtime,
      binding?.gate ?? undefined,
    );
    if (!isCurrentGeneration()) {
      return staleDecision(capability);
    }
    const enabled = decision?.enabled;
    if (!isCurrentGeneration()) {
      return staleDecision(capability);
    }
    const reasonKeyValue = decision?.reasonKey;
    if (!isCurrentGeneration()) {
      return staleDecision(capability);
    }
    if (
      decision === null ||
      typeof decision !== "object" ||
      typeof enabled !== "boolean" ||
      (reasonKeyValue !== null && typeof reasonKeyValue !== "string")
    ) {
      throw new Error(`Invalid ${editor} feature command capability decision`);
    }
    const reasonKey =
      reasonKeyValue === null
        ? null
        : requireExactRegistryId(
            reasonKeyValue,
            `${editor} feature command capability reason`,
          );
    if (!enabled) {
      return {
        capability,
        bound: Boolean(binding),
        enabled: false,
        reasonKey,
      };
    }
    if (!binding) {
      return {
        capability,
        bound: false,
        enabled: false,
        reasonKey:
          capability.reasonKey ?? `${editor}.capability.commandNotBound`,
      };
    }
    if (binding.isEnabled !== null) {
      const bindingEnabled = binding.isEnabled();
      if (!isCurrentGeneration()) {
        return staleDecision(capability);
      }
      if (typeof bindingEnabled !== "boolean") {
        throw new Error(`Invalid ${editor} feature command enabled decision`);
      }
      if (bindingEnabled) {
        return { capability, bound: true, enabled: true, reasonKey: null };
      }
      const boundReasonValue =
        typeof binding.unavailableReasonKey === "function"
          ? binding.unavailableReasonKey()
          : binding.unavailableReasonKey;
      if (!isCurrentGeneration()) {
        return staleDecision(capability);
      }
      const boundReason =
        typeof binding.unavailableReasonKey === "function"
          ? requireExactRegistryId(
              boundReasonValue,
              `${editor} feature command unavailable reason`,
            )
          : boundReasonValue;
      return {
        capability,
        bound: true,
        enabled: false,
        reasonKey:
          boundReason ??
          capability.reasonKey ??
          `${editor}.capability.unavailable`,
      };
    }
    return { capability, bound: true, enabled: true, reasonKey: null };
  };

  const registry = Object.freeze({
    featureIds,
    boundFeatureIds,
    bindingManifest,
    resolve,
    async execute(
      featureId: string,
      context: Ctx,
      runtime: R,
    ): Promise<FeatureCommandResult> {
      if (!isCurrentGeneration()) return "blocked";
      const decision = resolve(featureId, context, runtime);
      if (!decision.enabled) return "blocked";
      if (!isCurrentGeneration()) return "blocked";
      const binding = bindingByFeature.get(featureId);
      if (!binding) return "blocked";
      if (!isCurrentGeneration()) return "blocked";
      const result = await binding.execute();
      if (result !== undefined && typeof result !== "boolean") {
        throw new Error(`Invalid ${editor} feature command handler result`);
      }
      return result === false ? "blocked" : "executed";
    },
  });
  const issuedRecord = Object.freeze({
    lineage,
    manifest: bindingManifest,
    bindings: bindingIdentities,
    bindingContract,
  });
  advanceFeatureCommandAuthorityMutationEpoch(editor);
  issuedBindingManifests.set(bindingManifest, issuedRecord);
  issuedBindingRegistries.set(registry, issuedRecord);
  if (bindingContractRecord) {
    bindingContractRecord.consumedRegistry = registry;
  }
  lineageState.generation = generation;
  lineageState.currentRegistry = registry;
  return registry;
}
