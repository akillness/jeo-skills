/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  pdfNativeCheckpointChainSha256,
} from "../../../../../lib/pdf/engine/native/source-checkpoint-chain";
import {
  readPdfNativeVectorAwareReplayAuthority,
} from "../../../../../lib/pdf/native-vector-commands";
import {
  isPdfNativeSourceConsolidationRecord,
} from "../../../../../lib/pdf/engine/native/source-consolidation";
import {
  PdfNativeListTextLifecycleError,
  readPdfNativeListTextReplayAuthority,
  type PdfNativeListTextPatchbackAuthority,
  type PdfNativeListTextReplayAuthority,
} from "../../../../../lib/pdf/engine/native/list-text-command-lifecycle";
import type { ResourceRead, ResourceVersionRead } from "@mrnote/core/web/lib/resources-sdk.ts";

export function exactOriginalPdfResourceVersion(
  resource: ResourceRead,
  versions: readonly ResourceVersionRead[],
): ResourceVersionRead {
  const originals = versions.filter(
    (version) =>
      version.resource_id === resource.id &&
      version.version_kind === "original" &&
      version.version_number === 1,
  );
  if (originals.length !== 1) {
    throw new PdfNativeListTextLifecycleError(
      "source-not-ready",
      "The PDF original resource version is missing or ambiguous.",
    );
  }
  return originals[0];
}

export function exactPatchedPdfResourceVersion(
  resource: ResourceRead,
  versions: readonly ResourceVersionRead[],
  patchback: PdfNativeListTextPatchbackAuthority,
  pageId: string,
): ResourceVersionRead {
  const matches = versions.filter(
    (version) =>
      version.id === patchback.resourceVersionId &&
      version.resource_id === resource.id &&
      version.version_kind === "export" &&
      version.metadata_json?.output_sha256 === patchback.outputSha256 &&
      version.metadata_json?.editable_page_id === pageId,
  );
  const resourceMetadata = resource.metadata_json ?? {};
  if (
    resource.id !== patchback.resourceId ||
    matches.length !== 1 ||
    resourceMetadata.last_editable_page_export_version_id !==
      patchback.resourceVersionId ||
    resourceMetadata.last_editable_page_output_sha256 !==
      patchback.outputSha256 ||
    resourceMetadata.last_editable_page_id !== pageId
  ) {
    throw new PdfNativeListTextLifecycleError(
      "source-mismatch",
      "The current PDF patchback receipt is no longer authoritative.",
    );
  }
  return matches[0];
}

export interface PdfNativeJournalReceiptMetadata {
  readonly transactionCount: number;
  readonly terminalTransactionId: string;
  readonly sha256: string;
}

export type RecoveredPdfNativeListTextPatchbackAuthority =
  PdfNativeListTextPatchbackAuthority &
    Readonly<{
      inheritedNativeJournalCurrent?: true;
      inheritedNativeJournalSourceSha256?: string;
      checkpointNativeJournalFingerprint?: string;
    }>;

export function readPdfNativeJournalReceiptMetadata(
  value: unknown,
): PdfNativeJournalReceiptMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const transactionCount = record.transaction_count;
  const terminalTransactionId = record.terminal_transaction_id;
  const sha256 = record.sha256;
  if (
    !Number.isSafeInteger(transactionCount) ||
    Number(transactionCount) < 1 ||
    typeof terminalTransactionId !== "string" ||
    !terminalTransactionId ||
    typeof sha256 !== "string" ||
    !/^[a-f\d]{64}$/.test(sha256)
  ) {
    return null;
  }
  return Object.freeze({
    transactionCount: Number(transactionCount),
    terminalTransactionId,
    sha256,
  });
}

export function samePdfNativeJournalReceiptMetadata(
  left: PdfNativeJournalReceiptMetadata | null,
  right: PdfNativeJournalReceiptMetadata | null,
): boolean {
  return Boolean(
    left &&
      right &&
      left.transactionCount === right.transactionCount &&
      left.terminalTransactionId === right.terminalTransactionId &&
      left.sha256 === right.sha256,
  );
}

export function readPdfNativeMutationReplayAuthority(input: {
  readonly collection: unknown;
  readonly patchback: PdfNativeListTextPatchbackAuthority | null;
  readonly renderedSourceSha256: string | null;
}): PdfNativeListTextReplayAuthority {
  return readPdfNativeVectorAwareReplayAuthority({
    ...input,
    legacy: readPdfNativeListTextReplayAuthority(input),
  });
}

export function pdfNativeInheritedVersionChainReaches(input: {
  pageId: string; resource: ResourceRead; versions: readonly ResourceVersionRead[];
  start: ResourceVersionRead; target: ResourceVersionRead; receipt: PdfNativeJournalReceiptMetadata;
}): boolean {
  const object = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  let version = input.start;
  const visited = new Set<string>();
  // Every text-box save after a native edit is one more link back to it.
  // Capped at 32 links, the 33rd such save left the page's history
  // unverifiable for good: every line refused to open ("verifying, reload")
  // and the server refused the next save. Each link is a distinct version
  // (`visited`), so the walk ends within the versions there are.
  for (let depth = 0; depth <= input.versions.length; depth += 1) {
    if (visited.has(version.id)) return false;
    visited.add(version.id);
    const metadata = version.metadata_json;
    const identity = object(metadata.source_identity);
    const binding = object(identity?.binding);
    const custody = object(identity?.custody);
    if (!samePdfNativeJournalReceiptMetadata(input.receipt, readPdfNativeJournalReceiptMetadata(identity?.native_journal_receipt)) ||
      binding?.page_id !== input.pageId || binding.data_item_id !== input.resource.source_data_item_id ||
      !Number.isSafeInteger(binding.page_content_version) || Number(binding.page_content_version) < 1 ||
      metadata.page_content_version !== binding.page_content_version || custody?.resource_id !== input.resource.id) return false;
    const origins = input.versions.filter(origin => origin.id === custody.resource_version_id && origin.resource_id === input.resource.id);
    if (origins.length !== 1) return false;
    const origin = origins[0];
    const sha = origin.metadata_json.output_sha256;
    if (origin.version_kind !== "export" || origin.metadata_json.editable_page_id !== input.pageId ||
      typeof sha !== "string" || !/^[a-f\d]{64}$/.test(sha) || identity?.actual_sha256 !== sha || identity.expected_sha256 !== sha ||
      !Number.isSafeInteger(origin.version_number) || !Number.isSafeInteger(version.version_number) || version.version_number <= origin.version_number) return false;
    if (origin.id === input.target.id) return true;
    if (origin.metadata_json.pdf_native_journal !== undefined || origin.metadata_json.pdf_native_transaction_id !== undefined) return false;
    version = origin;
  }
  return false;
}

export async function recoverCheckpointNativeJournal(input: {
  pageId: string; collection: unknown; resource: ResourceRead;
  versions: readonly ResourceVersionRead[]; patchback: PdfNativeListTextPatchbackAuthority;
}): Promise<RecoveredPdfNativeListTextPatchbackAuthority | null> {
  const record = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const collection = input.collection;
  if (!Array.isArray(collection) || collection.length < 1 || collection.length > 31) return null;
  const latest = input.versions.find(version => version.id === input.patchback.resourceVersionId);
  if (latest?.metadata_json?.pdf_native_checkpoint_chain_sha256 !== await pdfNativeCheckpointChainSha256(collection)) return null;
  const base = record(latest?.metadata_json?.pdf_native_source_base);
  const receipt = readPdfNativeJournalReceiptMetadata(latest?.metadata_json?.pdf_native_journal);
  const count = base?.native_count_at_base;
  const depth = base?.xref_sections;
  const terminal = record(collection.at(-1));
  if (!base || base.schema_version !== "mrai.pdf-native-source-base.v1" ||
    !Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > collection.length ||
    !Number.isSafeInteger(depth) || Number(depth) < 1 || Number(depth) > 31 ||
    !receipt || receipt.transactionCount !== collection.length || receipt.terminalTransactionId !== terminal?.id) return null;
  // A base that counts every record is a consolidated chain no native write
  // has followed: the base is this version, its terminal record the
  // server's consolidation (source-consolidation.ts).
  const consolidatedBase = Number(count) === collection.length;
  if (consolidatedBase) {
    if (!isPdfNativeSourceConsolidationRecord(terminal) || base.version_id !== latest?.id ||
      record(terminal?.derivedCandidate)?.sha256 !== base.sha256 || Number(depth) !== 1) return null;
  } else {
    const anchor = record(collection[Number(count)]);
    const source = record(anchor?.source);
    const checkpoint = record(anchor?.sourceCheckpoint);
    if (source?.resourceId !== input.resource.id || source?.resourceVersionId !== base.version_id ||
      source?.sha256 !== base.sha256 || checkpoint?.schemaVersion !== "mrai.pdf-native-source-checkpoint.v1" ||
      checkpoint.xrefSections !== depth) return null;
  }
  const baseline = input.versions.find(version => version.id === base.version_id && version.resource_id === input.resource.id);
  if (!baseline) return null;
  if (baseline.version_kind === "original") {
    if (count !== 0 || base.sha256 !== input.resource.sha256) return null;
  } else {
    const metadata = baseline.metadata_json;
    if (baseline.version_kind !== "export" || metadata?.editable_page_id !== input.pageId ||
      metadata.export_adapter !== "pdf_original_package_patchback" ||
      metadata.editing_path !== "editable_page_original_package_patchback" ||
      metadata.output_sha256 !== base.sha256 || typeof metadata.output_storage_key !== "string" || !metadata.output_storage_key ||
      metadata.loss_entry_count !== 0) return null;
    // A consolidated baseline's own predecessor is the consolidation record
    // in this journal, not a receipt an earlier version inherited.
    if (Number(count) > 0 && !isPdfNativeSourceConsolidationRecord(record(collection[Number(count) - 1]))) {
      const identity = record(baseline.metadata_json?.source_identity);
      const inherited = readPdfNativeJournalReceiptMetadata(identity?.native_journal_receipt);
      const predecessor = record(collection[Number(count) - 1]);
      const origins = input.versions.filter(version => version.resource_id === input.resource.id &&
        samePdfNativeJournalReceiptMetadata(inherited, readPdfNativeJournalReceiptMetadata(version.metadata_json?.pdf_native_journal)));
      if (!inherited || inherited.transactionCount !== count || inherited.terminalTransactionId !== predecessor?.id ||
        origins.length !== 1 || !pdfNativeInheritedVersionChainReaches({...input,start:baseline,target:origins[0],receipt:inherited})) return null;
    }
  }
  // The server-owned epoch identifies which suffix has a continuous native SHA
  // chain. The full journal stays intact; browser claims cannot create an epoch.
  if (consolidatedBase) {
    if (input.patchback.outputSha256 !== base.sha256) return null;
    return Object.freeze({...input.patchback, checkpointNativeJournalFingerprint: JSON.stringify(collection)});
  }
  const suffix = readPdfNativeMutationReplayAuthority({
    collection: collection.slice(Number(count)), patchback: input.patchback,
    renderedSourceSha256: input.patchback.outputSha256,
  });
  if (suffix.state !== "current" && suffix.state !== "exhausted") return null;
  return Object.freeze({...input.patchback, checkpointNativeJournalFingerprint: JSON.stringify(collection)});
}

export async function recoverPdfNativeListTextPatchbackAuthority(input: {
  readonly pageId: string;
  readonly collection: unknown;
  readonly resource: ResourceRead;
  readonly versions: readonly ResourceVersionRead[];
  /** The page holds imported or duplicated pages and no native text
   * journal: its PDF is the last version it published, which carries those
   * pages. After a failed save the receipt names no version, and falling
   * back to the original upload made the next save start from a PDF
   * without them (the copy was refused, or published without the earlier
   * copies). */
  readonly pageImportHistory?: boolean;
}): Promise<RecoveredPdfNativeListTextPatchbackAuthority | null> {
  const metadata = input.resource.metadata_json ?? {};
  const resourceVersionId =
    typeof metadata.last_editable_page_export_version_id === "string"
      ? metadata.last_editable_page_export_version_id
      : "";
  const outputSha256 =
    typeof metadata.last_editable_page_output_sha256 === "string"
      ? metadata.last_editable_page_output_sha256.toLowerCase()
      : "";
  if (
    !resourceVersionId ||
    !/^[a-f\d]{64}$/.test(outputSha256) ||
    metadata.last_editable_page_id !== input.pageId
  ) {
    return null;
  }
  const patchback = Object.freeze({
    resourceId: input.resource.id,
    resourceVersionId,
    outputSha256,
  });
  try {
    exactPatchedPdfResourceVersion(
      input.resource,
      input.versions,
      patchback,
      input.pageId,
    );
  } catch {
    return null;
  }
  if (
    input.pageImportHistory &&
    (input.collection === undefined ||
      (Array.isArray(input.collection) && input.collection.length === 0))
  ) {
    return patchback;
  }
  const replay = readPdfNativeMutationReplayAuthority({
    collection: input.collection,
    patchback,
    renderedSourceSha256: outputSha256,
  });
  if (replay.state === "current" || replay.state === "exhausted") {
    return patchback;
  }

  const checkpointAuthority = await recoverCheckpointNativeJournal({...input, patchback});
  if (checkpointAuthority) return checkpointAuthority;

  const latestVersion = input.versions.find(
    (version) => version.id === patchback.resourceVersionId,
  );
  const latestMetadata = latestVersion?.metadata_json;
  const sourceIdentity =
    latestMetadata?.source_identity &&
    typeof latestMetadata.source_identity === "object" &&
    !Array.isArray(latestMetadata.source_identity)
      ? (latestMetadata.source_identity as Record<string, unknown>)
      : null;
  const sourceBinding =
    sourceIdentity?.binding &&
    typeof sourceIdentity.binding === "object" &&
    !Array.isArray(sourceIdentity.binding)
      ? (sourceIdentity.binding as Record<string, unknown>)
      : null;
  const sourceCustody =
    sourceIdentity?.custody &&
    typeof sourceIdentity.custody === "object" &&
    !Array.isArray(sourceIdentity.custody)
      ? (sourceIdentity.custody as Record<string, unknown>)
      : null;
  const inheritedJournal = readPdfNativeJournalReceiptMetadata(
    sourceIdentity?.native_journal_receipt,
  );
  if (
    !latestVersion ||
    sourceBinding?.page_id !== input.pageId ||
    sourceBinding.data_item_id !== input.resource.source_data_item_id ||
    !Number.isSafeInteger(sourceBinding.page_content_version) ||
    Number(sourceBinding.page_content_version) < 1 ||
    latestMetadata?.page_content_version !==
      sourceBinding.page_content_version ||
    metadata.last_editable_page_content_version !==
      sourceBinding.page_content_version ||
    sourceCustody?.resource_id !== input.resource.id ||
    typeof sourceCustody.resource_version_id !== "string" ||
    !inheritedJournal
  ) {
    return null;
  }

  const journalSourceMatches = await Promise.all(input.versions.map(async (version) => {
    const versionMetadata = version.metadata_json;
    const versionOutputSha256 = versionMetadata?.output_sha256;
    if (
      version.resource_id !== input.resource.id ||
      version.version_kind !== "export" ||
      versionMetadata?.editable_page_id !== input.pageId ||
      typeof versionOutputSha256 !== "string" ||
      !/^[a-f\d]{64}$/.test(versionOutputSha256) ||
      !samePdfNativeJournalReceiptMetadata(
        readPdfNativeJournalReceiptMetadata(
          versionMetadata?.pdf_native_journal,
        ),
        inheritedJournal,
      )
    ) {
      return false;
    }
    const candidateReplay = readPdfNativeMutationReplayAuthority({
      collection: input.collection,
      patchback: {
        resourceId: input.resource.id,
        resourceVersionId: version.id,
        outputSha256: versionOutputSha256,
      },
      renderedSourceSha256: versionOutputSha256,
    });
    return (
      candidateReplay.state === "current" ||
      candidateReplay.state === "exhausted" ||
      Boolean(await recoverCheckpointNativeJournal({...input, patchback:{resourceId:input.resource.id,resourceVersionId:version.id,outputSha256:versionOutputSha256}}))
    );
  }));
  const journalSources = input.versions.filter((_version, index) => journalSourceMatches[index]);
  if (journalSources.length !== 1) return null;
  const journalSource = journalSources[0];
  const journalSourceSha256 = journalSource.metadata_json?.output_sha256;
  if (typeof journalSourceSha256 !== "string" || !/^[a-f\d]{64}$/.test(journalSourceSha256) ||
    !pdfNativeInheritedVersionChainReaches({...input,start:latestVersion,target:journalSource,receipt:inheritedJournal})) return null;
  return Object.freeze({
    ...patchback,
    inheritedNativeJournalCurrent: true as const,
    inheritedNativeJournalSourceSha256: journalSourceSha256,
  });
}

export function readCurrentPdfNativeListTextReplayAuthority(input: {
  readonly collection: unknown;
  readonly patchback: PdfNativeListTextPatchbackAuthority | null;
  readonly renderedSourceSha256: string | null;
}): PdfNativeListTextReplayAuthority {
  const replay = readPdfNativeMutationReplayAuthority(input);
  const recoveredPatchback =
    input.patchback as RecoveredPdfNativeListTextPatchbackAuthority | null;
  if (recoveredPatchback?.checkpointNativeJournalFingerprint &&
    recoveredPatchback.checkpointNativeJournalFingerprint === JSON.stringify(input.collection) &&
    input.renderedSourceSha256 === recoveredPatchback.outputSha256 && Array.isArray(input.collection)) {
    return input.collection.length === 31
      ? Object.freeze({state:"exhausted" as const,transactionCount:31 as const,patchback:recoveredPatchback,latestDerivedSha256:recoveredPatchback.outputSha256})
      : Object.freeze({state:"current" as const,transactionCount:input.collection.length,patchback:recoveredPatchback,latestDerivedSha256:recoveredPatchback.outputSha256});
  }
  const inheritedSourceSha256 =
    recoveredPatchback?.inheritedNativeJournalSourceSha256;
  const inheritedCurrent = Boolean(
    recoveredPatchback?.inheritedNativeJournalCurrent === true &&
      typeof inheritedSourceSha256 === "string" &&
      /^[a-f\d]{64}$/.test(inheritedSourceSha256) &&
      input.renderedSourceSha256 === recoveredPatchback?.outputSha256 &&
      replay.state === "pending" &&
      replay.transactionCount !== null &&
      replay.transactionCount > 0,
  );
  return inheritedCurrent
    ? Object.freeze({
        state: "current" as const,
        transactionCount: replay.transactionCount as number,
        patchback: input.patchback!,
        latestDerivedSha256: inheritedSourceSha256!,
      })
    : replay;
}

/** UI admission only. Never grants the adapter's historical-source authority. */
export function readPdfNativeSourceTextEntryReason(input: {
  collection: unknown;
  patchback: PdfNativeListTextPatchbackAuthority | null;
  sourceSha256: string | null;
  managedSourceText: boolean;
  sourceBytes?: Uint8Array | null;
}): "history-unavailable" | "source-unverified" | "pending" | null {
  if (!input.sourceSha256 || (input.patchback && input.patchback.outputSha256 !== input.sourceSha256)) return "source-unverified";
  // This target uses the already-supported source-bound FreeText writer.
  // Its independent binding/appearance/proof checks still run in preparation.
  if (input.managedSourceText) return null;
  const replay = readCurrentPdfNativeListTextReplayAuthority({
    collection: input.collection, patchback: input.patchback,
    renderedSourceSha256: input.sourceSha256,
  });
  if (replay.transactionCount === null ||
    (replay.transactionCount > 0 && replay.state !== "current")) return "history-unavailable";
  if (!input.sourceBytes) return "pending";
  // The revision depth is the planner's own admission, on the server: a
  // source past it is refused by `pdf-native/prepare` with its reason.
  return null;
}

export interface NativePdfVersionPreview {
  key: string;
  url: string | null;
  error: string | null;
}

/** The ticket this window authenticated itself for the version `key` names
 * (its own accepted save, else a peer's version it verified), if it has one
 * with a URL. */
export function authenticatedNativePdfVersionPreview(input: {
  readonly key: string;
  readonly accepted: NativePdfVersionPreview | null;
  readonly peer: NativePdfVersionPreview | null;
}): NativePdfVersionPreview | null {
  if (!input.key) return null;
  const own = input.accepted?.key === input.key ? input.accepted : input.peer;
  return own?.key === input.key && own.url ? own : null;
}















export function shownNativePdfVersionPreview(input: {
  readonly key: string;
  readonly published: NativePdfVersionPreview | null;
  readonly authenticated: NativePdfVersionPreview | null;
  readonly ahead: NativePdfVersionPreview | null;
}): NativePdfVersionPreview | null {
  if (input.published?.key === input.key) return input.published;
  return (input.authenticated?.key === input.key && input.authenticated.url ? input.authenticated : null) ?? input.ahead;
}
