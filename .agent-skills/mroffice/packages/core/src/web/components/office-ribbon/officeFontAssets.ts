"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { apiFetchRaw } from "../../lib/api";
import { subscribeAuthState } from "../../lib/auth-state";
import {
  captureSavedPageHotCacheScope,
  isSavedPageHotCacheScopeCurrent,
} from "../../lib/saved-page-hot-cache";
import {
  normalizeOfficeFontAsset,
  parseOfficeFontFace,
  officeFontFaceRule,
  officeFontFaceFamily,
  type OfficeFontAsset,
  type OfficeFontAssetFile,
  type OfficeFontFace,
  type OfficeFontRole,
} from "./officeFontFace";
import { setOfficeFontAssetRuleBuilder } from "./officeFontFace";
import type {
  OfficeFontVariant,
  OfficeLocalFontRecord,
} from "./officeTypographyCatalog";
import { resolveOfficeLocalFontVariant } from "./officeFontMetadata";

type FontDownload = {
  promise: Promise<ArrayBuffer>;
  controller: AbortController;
  users: number;
};
const buffers = new Map<string, FontDownload>();
const resolvedBuffers = new Map<string, ArrayBuffer>();
const registrations = new Map<
  string,
  {
    doc: WeakRef<Document>;
    fonts: FontFace[];
    controller: AbortController;
    status: "loading" | "available" | "missing";
    promise: Promise<void>;
    asset: OfficeFontAsset;
  }
>();
const documentIds = new WeakMap<Document, number>();
const leases = new Map<string, number>();
let nextDocumentId = 0;
let catalog: OfficeFontVariant[] = [];
export const OFFICE_FONT_ASSETS_EVENT = "mrnote:font-assets-changed";
let activeAuthScope = captureSavedPageHotCacheScope();

subscribeAuthState(() => {
  if (isSavedPageHotCacheScopeCurrent(activeAuthScope)) return;
  activeAuthScope = captureSavedPageHotCacheScope();
  const docs = new Set<Document>();
  for (const pending of buffers.values()) pending.controller.abort();
  for (const entry of registrations.values()) {
    entry.controller.abort();
    const doc = entry.doc.deref();
    if (doc) docs.add(doc);
    for (const font of entry.fonts) doc?.fonts.delete(font);
  }
  registrations.clear();
  leases.clear();
  buffers.clear();
  resolvedBuffers.clear();
  catalog = [];
  for (const doc of docs) publishFontAssetStatus(doc);
});

function publishFontAssetStatus(doc: Document): void {
  const entries = [...registrations.values()].filter(
    (entry) => entry.doc.deref() === doc,
  );
  doc.documentElement.toggleAttribute(
    "data-font-assets-loading",
    entries.some((entry) => entry.status === "loading"),
  );
  if (entries.some((entry) => entry.status === "missing"))
    doc.documentElement.setAttribute("data-font-assets-error", "unavailable");
  else doc.documentElement.removeAttribute("data-font-assets-error");
  doc.dispatchEvent(new Event(OFFICE_FONT_ASSETS_EVENT));
}

// A real network recovery is a new opportunity; a render is not a retry loop.
if (typeof window !== "undefined")
  window.addEventListener("online", () => {
    for (const [key, entry] of registrations) {
      const doc = entry.doc.deref();
      if (entry.status !== "missing" || !doc) continue;
      registrations.delete(key);
      void registerFontAsset(entry.asset, doc);
    }
  });

export function setOfficeFontAssetCatalog(
  fonts: Iterable<OfficeFontVariant>,
): void {
  catalog = [...fonts];
}











export async function installDocumentFontRules(
  source: ParentNode,
  target: Document,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<void> {
  const faces: OfficeFontFace[] = [];
  const elements: Element[] = Array.from(
    source.querySelectorAll(
      "[data-office-font-face],[data-office-cjk-font-face]",
    ),
  );
  if ((source as Node).nodeType === 1) elements.unshift(source as Element);
  const perElement =
    (globalThis as { __docsPrintFontRulesOnceOff?: boolean })
      .__docsPrintFontRulesOnceOff === true;
  // A family's rule is written from the last identity naming it, in the
  // place of the first, as when every element wrote one into the map.
  const byFamily = new Map<string, OfficeFontFace>();
  const parsed = new Map<string, OfficeFontFace>();
  for (const element of elements)
    for (const attribute of [
      "data-office-font-face",
      "data-office-cjk-font-face",
    ]) {
      const raw = element.getAttribute(attribute);
      if (raw === null) continue;
      const face = (perElement ? undefined : parsed.get(raw)) ?? parseOfficeFontFace(raw);
      if (!face) throw new Error("document_font_invalid_identity");
      if (perElement) {
        faces.push(face);
        continue;
      }
      parsed.set(raw, face);
      byFamily.set(officeFontFaceFamily(face), face);
    }
  if (!perElement) faces.push(...byFamily.values());
  if (!faces.length) return;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, Math.max(1, options.timeoutMs));
  options.signal?.addEventListener("abort", abort, { once: true });
  target.defaultView?.addEventListener("pagehide", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    const files = faces.flatMap((face) => face.asset?.files ?? []);
    const unique = new Map(
      files.map((file) => [file.attachmentId ?? file.sha256, file]),
    );
    if (
      unique.size > 128 ||
      [...unique.values()].reduce((sum, file) => sum + file.sizeBytes, 0) >
        128 * 1024 * 1024
    )
      throw new Error("document_font_budget_exceeded");
    await Promise.all(
      files.map((file) => verifiedFontAssetBytes(file, controller.signal)),
    );
    controller.signal.throwIfAborted();
    if (target.defaultView?.closed)
      throw new DOMException("Closed", "AbortError");
    const rules = new Map(
      faces.map((face) => [
        officeFontFaceFamily(face),
        officeFontFaceRule(face),
      ]),
    );
    const style =
      target.querySelector<HTMLStyleElement>(
        "style[data-office-document-fonts]",
      ) ?? target.createElement("style");
    style.setAttribute("data-office-document-fonts", "true");
    style.textContent = [...rules.values()].join("");
    target.head.append(style);
    // WebKit can return the previously resolved fonts.ready immediately after
    // inserting a stylesheet. Explicitly resolve/load these exact faces; a
    // print dialog must not race the newly installed declarations.
    const fonts = target.fonts;
    if (fonts && typeof fonts.load === "function") {
      void target.documentElement.getBoundingClientRect();
      const requests = new Map<string, string>();
      for (const face of faces) {
        const family = officeFontFaceFamily(face);
        for (const role of face.asset?.files.map((file) => file.role) ?? [
          "regular",
        ]) {
          const weight = role === "bold" || role === "boldItalic" ? 700 : 400;
          const fontStyle =
            role === "italic" || role === "boldItalic" ? "italic" : "normal";
          requests.set(
            `${family}:${role}`,
            `${fontStyle} ${weight} 16px "${family}"`,
          );
        }
      }
      await new Promise<void>((resolve, reject) => {
        const stopped = () => reject(new DOMException("Aborted", "AbortError"));
        controller.signal.addEventListener("abort", stopped, { once: true });
        Promise.all(
          [...requests.values()].map(async (request) => {
            const loaded = await fonts.load(request);
            if (
              !loaded.length ||
              loaded.some((font) => font.status !== "loaded")
            )
              throw new Error("document_font_asset_unavailable");
          }),
        )
          .then(() => resolve(), reject)
          .finally(() =>
            controller.signal.removeEventListener("abort", stopped),
          );
        if (controller.signal.aborted) stopped();
      });
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    target.defaultView?.removeEventListener("pagehide", abort);
  }
}

function registrationKey(asset: OfficeFontAsset, doc: Document): string {
  let id = documentIds.get(doc);
  if (id === undefined) {
    id = ++nextDocumentId;
    documentIds.set(doc, id);
  }
  const scope = captureSavedPageHotCacheScope();
  const source = asset.files
    .map(
      (file) =>
        `${file.role}:${file.attachmentId ?? file.embeddedPart}:${file.sha256}`,
    )
    .join("|");
  return `${scope.principal}:${scope.sessionEpoch}:${id}:${source}`;
}

/** Editable-embedding rights grant temporary use in an open document. Keep
 * shared views alive, but unload bytes/faces after their final editor closes. */
export function retainOfficeFontAssets(
  assets: readonly OfficeFontAsset[],
  doc: Document,
): () => void {
  const groups = new Map(
    assets.map((asset) => [registrationKey(asset, doc), asset]),
  );
  if (!groups.size) return () => {};
  for (const [key, asset] of groups) {
    leases.set(key, (leases.get(key) ?? 0) + 1);
    void registerFontAsset(asset, doc);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const removed = new Set<string>();
    for (const [key, asset] of groups) {
      const remaining = (leases.get(key) ?? 1) - 1;
      if (remaining > 0) {
        leases.set(key, remaining);
        continue;
      }
      leases.delete(key);
      const entry = registrations.get(key);
      entry?.controller.abort();
      for (const font of entry?.fonts ?? []) doc.fonts.delete(font);
      registrations.delete(key);
      for (const file of asset.files) removed.add(file.sha256);
    }
    const active = new Set(
      [...registrations.values()].flatMap((entry) =>
        entry.asset.files.map((file) => file.sha256),
      ),
    );
    for (const key of resolvedBuffers.keys()) {
      const sha = key.slice(key.lastIndexOf(":") + 1);
      if (removed.has(sha) && !active.has(sha)) resolvedBuffers.delete(key);
    }
    publishFontAssetStatus(doc);
  };
}

export async function registerLeasedFontAsset(
  asset: OfficeFontAsset,
  doc: Document,
): Promise<void> {
  if (leases.has(registrationKey(asset, doc)))
    await registerFontAsset(asset, doc);
}

export function fontAssetStatus(
  asset: OfficeFontAsset | undefined,
): "unverified" | "loading" | "available" | "missing" {
  if (!asset || typeof document === "undefined") return "unverified";
  return (
    registrations.get(registrationKey(asset, document))?.status ?? "unverified"
  );
}

export function subscribeFontAssetStatus(listener: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener(OFFICE_FONT_ASSETS_EVENT, listener);
  return () => document.removeEventListener(OFFICE_FONT_ASSETS_EVENT, listener);
}

/**
 * Hands the bytes of page-owned font files to this document ahead of any
 * download: the server's PDF renderer reads them under the exporter's own
 * authority and the headless page may reach nothing but the Web app. Each
 * file is kept only when its size and SHA-256 are the ones its identity
 * names, so a later `verifiedFontAssetBytes` serves exactly that face.
 */
export async function seedVerifiedFontAssetBytes(
  files: readonly { attachmentId: string; sha256: string; sizeBytes: number; bytes: Uint8Array }[],
): Promise<number> {
  const scope = captureSavedPageHotCacheScope();
  let kept = 0;
  for (const file of files) {
    if (file.bytes.byteLength !== file.sizeBytes) continue;
    const own = new Uint8Array(file.bytes.byteLength);
    own.set(file.bytes);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", own));
    const sha = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
    if (sha !== file.sha256.toLowerCase()) continue;
    const key = `${scope.principal}:${scope.sessionEpoch}:${file.attachmentId}:${file.sha256}`;
    resolvedBuffers.set(key, own.buffer);
    kept += 1;
  }
  return kept;
}

export async function verifiedFontAssetBytes(
  file: OfficeFontAssetFile,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  signal?.throwIfAborted();
  const scope = captureSavedPageHotCacheScope();
  const key = `${scope.principal}:${scope.sessionEpoch}:${file.attachmentId ?? "embedded"}:${file.sha256}`;
  if (!file.attachmentId) {
    const embedded = resolvedBuffers.get(key);
    if (!embedded) throw new Error("document_font_embedded_source_missing");
    if (embedded.byteLength !== file.sizeBytes)
      throw new Error("document_font_asset_changed");
    return embedded;
  }
  const attachmentId = file.attachmentId;
  const cached = resolvedBuffers.get(key);
  if (cached) {
    if (cached.byteLength !== file.sizeBytes)
      throw new Error("document_font_asset_changed");
    return cached;
  }
  let pending = buffers.get(key);
  if (!pending) {
    const controller = new AbortController();
    const download: FontDownload = {
      controller,
      users: 0,
      promise: Promise.resolve(new ArrayBuffer(0)),
    };
    download.promise = (async () => {
      const response = await apiFetchRaw(
        `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("document_font_asset_unavailable");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("document_font_asset_unavailable");
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > file.sizeBytes)
            throw new Error("document_font_asset_changed");
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (total !== file.sizeBytes || !isSavedPageHotCacheScopeCurrent(scope))
        throw new Error("document_font_asset_changed");
      const bytes = new Uint8Array(total);
      let cursor = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, cursor);
        cursor += chunk.byteLength;
      }
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes),
      );
      const sha = [...digest]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (sha !== file.sha256 || !isSavedPageHotCacheScopeCurrent(scope))
        throw new Error("document_font_asset_changed");
      resolvedBuffers.set(key, bytes.buffer);
      return bytes.buffer;
    })();
    pending = download;
    buffers.set(key, download);
    void download.promise
      .finally(() => {
        if (buffers.get(key) === download) buffers.delete(key);
      })
      .catch(() => undefined);
  }
  const active = pending;
  active.users++;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, bytes?: ArrayBuffer) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (--active.users === 0 && buffers.get(key) === active) {
        buffers.delete(key);
        active.controller.abort();
      }
      if (error) reject(error);
      else if (bytes?.byteLength !== file.sizeBytes)
        reject(new Error("document_font_asset_changed"));
      else resolve(bytes);
    };
    const abort = () => finish(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    active.promise.then(
      (bytes) => finish(undefined, bytes),
      (error) => finish(error),
    );
    if (signal?.aborted) abort();
  });
}

function assetGroups(value: unknown): OfficeFontAsset[] {
  const groups: OfficeFontAsset[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (
      record.type === "fontFamily" ||
      record.type === "fontCjkFamily" ||
      record.type === "fontComplexFamily"
    ) {
      const attrs = record.attrs as { face?: { asset?: unknown } } | undefined;
      const asset = normalizeOfficeFontAsset(attrs?.face?.asset);
      if (asset) groups.push(asset);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return groups;
}

export async function ensureDocumentFontAssets(
  content: unknown,
  signal?: AbortSignal,
): Promise<void> {
  for (const group of assetGroups(content))
    await Promise.all(
      group.files.map((file) => verifiedFontAssetBytes(file, signal)),
    );
}

/** The faces of a document's content that are embedded in its package. */
export function embeddedDocumentFontGroups(content: unknown): OfficeFontAsset[] {
  return assetGroups(content).filter((group) =>
    group.files.some((file) => !file.attachmentId),
  );
}

/**
 * Publish a document's embedded faces from the bytes the server read out of
 * its package (`document_font_assets.preview_embedded_fonts`: the font table,
 * relationships, de-obfuscation and licence check are the server's; the
 * browser never opens the package). Every face the content names must be
 * among `payloads` (by SHA-256) with its exact size and digest; nothing is
 * published unless all are, and a cancellation leaves nothing behind.
 */
export async function installEmbeddedDocumentFonts(
  content: unknown,
  payloads: ReadonlyMap<string, Uint8Array>,
  options: { signal?: AbortSignal; isCurrent?: () => boolean } = {},
): Promise<OfficeFontAsset[]> {
  const scope = captureSavedPageHotCacheScope();
  const assertCurrent = () => {
    if (options.signal?.aborted || options.isCurrent?.() === false || !isSavedPageHotCacheScopeCurrent(scope)) {
      throw new DOMException("Document font loading was cancelled", "AbortError");
    }
  };
  assertCurrent();
  const groups = assetGroups(content);
  if (!groups.length) return groups;
  const preparedBuffers = new Map<string, ArrayBuffer>();
  const seen = new Set<string>();
  let total = 0;
  for (const group of groups)
    for (const file of group.files) {
      if (file.attachmentId) throw new Error("document_font_foreign_reference");
      if (!file.embeddedPart || !file.fontKey || seen.has(file.sha256))
        continue;
      seen.add(file.sha256);
      total += file.sizeBytes;
      if (seen.size > 128 || total > 128 * 1024 * 1024)
        throw new Error("document_font_budget_exceeded");
      const served = payloads.get(file.sha256);
      if (!served) throw new Error("document_font_embedded_source_missing");
      const bytes = served.slice();
      if (bytes.length !== file.sizeBytes || bytes.length < 32)
        throw new Error("document_font_asset_changed");
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
      );
      assertCurrent();
      if (
        [...digest]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("") !== file.sha256 ||
        !isSavedPageHotCacheScopeCurrent(scope)
      )
        throw new Error("document_font_asset_changed");
      preparedBuffers.set(
        `${scope.principal}:${scope.sessionEpoch}:embedded:${file.sha256}`,
        bytes.slice().buffer,
      );
    }
  // A corrupt later face or a cancelled candidate must leave no partially
  // installed bytes. No async work occurs between this fence and publication.
  assertCurrent();
  for (const [key, bytes] of preparedBuffers) resolvedBuffers.set(key, bytes);
  return groups;
}

function assetRules(asset: OfficeFontAsset): string {
  const scope = captureSavedPageHotCacheScope();
  const family = officeFontFaceFamily({ asset } as OfficeFontFace);
  return asset.files
    .map((file) => {
      const bytes = resolvedBuffers.get(
        `${scope.principal}:${scope.sessionEpoch}:${file.attachmentId ?? "embedded"}:${file.sha256}`,
      );
      if (!bytes) throw new Error("document_font_assets_not_ready");
      let binary = "";
      const values = new Uint8Array(bytes);
      for (let index = 0; index < values.length; index += 8192)
        binary += String.fromCharCode(...values.subarray(index, index + 8192));
      const weight =
        file.role === "bold" || file.role === "boldItalic" ? 700 : 400;
      const style =
        file.role === "italic" || file.role === "boldItalic"
          ? "italic"
          : "normal";
      return `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${btoa(binary)});font-weight:${weight};font-style:${style}}`;
    })
    .join("");
}
queueMicrotask(() => setOfficeFontAssetRuleBuilder(assetRules));

export async function registerFontAsset(
  asset: OfficeFontAsset,
  doc: Document,
): Promise<void> {
  const scope = captureSavedPageHotCacheScope();
  const family = officeFontFaceFamily({ asset } as OfficeFontFace);
  const key = registrationKey(asset, doc);
  const existing = registrations.get(key);
  if (existing) return existing.promise;
  const controller = new AbortController();
  const entry = {
    doc: new WeakRef(doc),
    fonts: [] as FontFace[],
    controller,
    status: "loading" as "loading" | "available" | "missing",
    promise: Promise.resolve(),
    asset,
  };
  registrations.set(key, entry);
  publishFontAssetStatus(doc);
  entry.promise = (async () => {
    try {
      const Constructor = (doc.defaultView as Window & typeof globalThis)
        .FontFace;
      const decoded = await Promise.all(
        asset.files.map(async (file) => ({
          file,
          bytes: await verifiedFontAssetBytes(file, controller.signal),
        })),
      );
      if (!isSavedPageHotCacheScopeCurrent(scope) || controller.signal.aborted)
        return;
      for (const { file, bytes } of decoded) {
        const font = new Constructor(family, bytes, {
          weight:
            file.role === "bold" || file.role === "boldItalic" ? "700" : "400",
          style:
            file.role === "italic" || file.role === "boldItalic"
              ? "italic"
              : "normal",
        });
        entry.fonts.push(font);
        doc.fonts.add(font);
      }
      await Promise.all(entry.fonts.map((font) => font.load()));
      if (!isSavedPageHotCacheScopeCurrent(scope) || controller.signal.aborted)
        return;
      entry.status = "available";
    } catch {
      entry.status = "missing";
      for (const font of entry.fonts) doc.fonts.delete(font);
      entry.fonts = [];
    } finally {
      if (registrations.get(key) === entry) publishFontAssetStatus(doc);
    }
  })();
  return entry.promise;
}

function roleOf(variant: OfficeFontVariant): OfficeFontRole {
  return variant.bold
    ? variant.italic
      ? "boldItalic"
      : "bold"
    : variant.italic
      ? "italic"
      : "regular";
}

function withFontBlob(
  record: OfficeLocalFontRecord,
  blob: Blob,
): OfficeLocalFontRecord {
  // FontData exposes native getters, not enumerable own fields.
  return {
    family: record.family,
    style: record.style,
    fullName: record.fullName,
    postscriptName: record.postscriptName,
    blob: async () => blob,
  };
}

export type PreparedOfficeFontVariant = OfficeFontVariant & {
  discardUnusedFontAssets?: () => Promise<void>;
};

/** Prepare all necessary members of a used four-style family, not the user's
 * font library. The editor commits only after this operation has completed. */
export async function attachOfficeFontFamily(
  pageId: string,
  variant: OfficeFontVariant,
  signal: AbortSignal,
  sourceRecords?: readonly OfficeLocalFontRecord[],
): Promise<PreparedOfficeFontVariant> {
  if (!variant.fontFace || variant.fontFace.asset) return variant;
  const query = (
    window as Window & {
      queryLocalFonts?: (options?: {
        postscriptNames: string[];
      }) => Promise<OfficeLocalFontRecord[]>;
    }
  ).queryLocalFonts;
  if (sourceRecords && (sourceRecords.length < 1 || sourceRecords.length > 4 ||
    new Set(sourceRecords.map(record=>record.postscriptName)).size !== sourceRecords.length)) throw new Error("document_font_invalid_source_records");
  if (!query && !sourceRecords) throw new Error("document_font_local_access_unavailable");
  const selected = (
    sourceRecords ?? await query!({ postscriptNames: [variant.postscriptName!] })
  ).find((record) => record.postscriptName === variant.postscriptName);
  if (!selected?.blob) throw new Error("document_font_source_missing");
  const selectedBlob = await selected.blob();
  const inspected = await resolveOfficeLocalFontVariant(
    withFontBlob(selected, selectedBlob),
    { inspectSource: true },
  );
  if (!inspected?.fontFace) throw new Error("document_font_identity_mismatch");
  const selectedFace = inspected.fontFace;
  variant = inspected;
  const sourceVariants = sourceRecords ? await Promise.all(sourceRecords.map(record=>resolveOfficeLocalFontVariant(record,{inspectSource:true}))) : null;
  if (sourceVariants?.some(peer=>!peer?.fontFace || peer.family !== variant.family)) throw new Error("document_font_identity_mismatch");
  let peers = (sourceVariants ? sourceVariants.filter((peer): peer is OfficeFontVariant => Boolean(peer)) : catalog).filter(
    (candidate) =>
      candidate.family === variant.family &&
      candidate.fontFace &&
      Object.keys(candidate.fontFace.axes).length === 0,
  );
  let standalone =
    Object.keys(selectedFace.axes).length > 0 ||
    peers.length > 4 ||
    new Set(peers.map(roleOf)).size !== peers.length ||
    !peers.some((peer) => roleOf(peer) === "regular");
  if (sourceRecords && standalone && sourceRecords.length > 1) throw new Error("document_font_ambiguous_source_family");
  if (!peers.length || standalone) {
    peers = [variant];
    standalone = true;
  }
  const records = standalone
    ? [selected]
    : sourceRecords ?? await query!({
        postscriptNames: peers.map((peer) => peer.postscriptName!),
      });
  const files: OfficeFontAssetFile[] = [];
  const created: string[] = [];
  const discardUnusedFontAssets = async () => {
    await Promise.all(
      created
        .splice(0)
        .map((id) =>
          apiFetchRaw(
            `/api/v1/pages/${encodeURIComponent(pageId)}/attachments/${encodeURIComponent(id)}`,
            { method: "DELETE" },
          ).catch(() => undefined),
        ),
    );
  };
  let family: string | null = null;
  let selectedRole: OfficeFontRole = "regular";
  try {
    for (const peer of peers) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const record = records.find(
        (candidate) => candidate.postscriptName === peer.postscriptName,
      );
      if (!record?.blob) throw new Error("document_font_source_missing");
      const blob =
        record.postscriptName === selected.postscriptName
          ? selectedBlob
          : await record.blob();
      const authenticated =
        record.postscriptName === selected.postscriptName
          ? variant
          : await resolveOfficeLocalFontVariant(withFontBlob(record, blob), {
              inspectSource: true,
            });
      if (!authenticated?.fontFace)
        throw new Error("document_font_identity_mismatch");
      const form = new FormData();
      form.set("file", blob, "font.ttf");
      form.set(
        "font_face",
        JSON.stringify({ face: authenticated.fontFace, standalone }),
      );
      const response = await apiFetchRaw(
        `/api/v1/pages/${encodeURIComponent(pageId)}/attachments/upload`,
        { method: "POST", body: form, signal },
      );
      const result = (await response.json()) as {
        attachment_id?: string;
        reused?: boolean;
        font?: { family?: string; file?: OfficeFontAssetFile };
      };
      if (
        !result.font?.file ||
        !result.font.family ||
        result.attachment_id !== result.font.file.attachmentId
      )
        throw new Error("document_font_invalid_receipt");
      if (family !== null && family !== result.font.family)
        throw new Error("document_font_family_mismatch");
      family = result.font.family;
      files.push(result.font.file);
      if (result.reused === false && result.font.file.attachmentId)
        created.push(result.font.file.attachmentId);
      if (peer.id === variant.id) selectedRole = result.font.file.role;
    }
    const asset = normalizeOfficeFontAsset({ family, files });
    if (!asset) throw new Error("document_font_invalid_receipt");
    await Promise.all(
      asset.files.map((file) => verifiedFontAssetBytes(file, signal)),
    );
    return {
      ...variant,
      bold: selectedRole === "bold" || selectedRole === "boldItalic",
      italic: selectedRole === "italic" || selectedRole === "boldItalic",
      fontFace: { ...selectedFace, asset },
      discardUnusedFontAssets,
    };
  } catch (error) {
    // Only newly created, still-unreferenced attachments are eligible. The
    // existing DELETE boundary refuses any row already used by the document.
    await discardUnusedFontAssets();
    throw error;
  }
}
