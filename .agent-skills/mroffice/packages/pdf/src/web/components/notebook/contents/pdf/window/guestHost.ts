"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The PDF editor's host for a visitor (the guest notebook's sample PDF):
 * the real editor (PdfPageWindow) runs on a page that lives in this browser.
 * What it reads from the server -- the page, its file record, the caller's
 * role and write verdict, the file's resource -- is answered here from the
 * sample file; its writes stay in the editor as AutoSave-off edits do
 * (held, shown, Unsaved), and Save, the downloads and the server's own
 * features ask for an account instead (GuestRegisterGate).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  AutosavedPageLoadSource,
  PageDocumentDraft,
  useAutosavedPageDocument,
} from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import { ApiRequestError, registerLocalApiAnswerer, type LocalApiAnswerer } from "@mrnote/core/web/lib/api.ts";
import type { PageWritable } from "@mrnote/core/web/lib/collab/page-writable.ts";
import { holdDownloadsBehind } from "@mrnote/core/web/lib/download-file.ts";
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import type { ResourceRead, ResourceVersionRead } from "@mrnote/core/web/lib/resources-sdk.ts";
import type { UseWorkspaceMeResult, WorkspaceMe } from "@mrnote/core/web/lib/use-workspace-me.ts";
import type { PdfWorkingRecovery } from "../../../../../lib/pdf/native-working-session";
import { rememberPdfSourceBytes } from "../../../../../lib/pdf/source-bytes-memo";
import type { createPdfWorkingRecoveryStore } from "../../../../../lib/pdf/working-recovery-store";

import type { DataItem } from "./sourceReplacement";

/** The sample a visitor's PDF window opens, and where its gates go. */
export interface PdfGuestSource {
  /** The sample file, same-origin (a static asset). */
  readonly url: string;
  readonly filename: string;
  readonly documentTitle?: string;
  /** Save (the ribbon's Save, Ctrl+S, a close that would save). */
  readonly onSaveRequest?: () => void;
  /** A download or an export of the document. */
  readonly onExportRequest?: () => void;
  /** The AI commands (Copilot, the selection's AI actions). */
  readonly onAiRequest?: () => void;
  /** A command that needs the server or an account (OCR, translation,
   * version history, an upload, sharing). */
  readonly onFeatureRequest?: () => void;
}

/** The notebook a visitor's windows belong to (no server notebook). */
export const GUEST_PDF_NOTEBOOK_ID = "guest";

export function guestPdfDataItemId(pageId: string): string {
  // The visitor's page ids are fixed ("guest-pdf"): this is its file's.
  return `${pageId}-source`;
}

/** A visitor edits their own sample: the owner of a workspace of one. */
const GUEST_WORKSPACE_ME: WorkspaceMe = Object.freeze({
  workspace_id: "guest",
  enable_universal_editor: false,
  role: "owner",
  feature_flags: Object.freeze({
    enable_whiteboard_memory_v1: false,
    enable_whiteboard_vision_summary_v1: false,
    enable_notebook_ai_inline_v2: false,
    enable_notebook_ai_versions_v1: false,
    enable_notebook_ai_editable_projection_v1: false,
    enable_notebook_ai_modes_v1: false,
    enable_notebook_ai_suggestions_v1: false,
    enable_notebook_ai_context_preview_v1: false,
    enable_notebook_ai_dashboard_v1: false,
    enable_notebook_ai_tray_v1: false,
    enable_extension_catalog_ui_v1: false,
  }),
}) as WorkspaceMe;

export const GUEST_PDF_WORKSPACE_ME: UseWorkspaceMeResult = Object.freeze({
  data: GUEST_WORKSPACE_ME,
  loading: false,
  error: null,
  refresh: () => {},
});

export const GUEST_PDF_PAGE_WRITABLE: PageWritable = Object.freeze({
  writable: true,
  reason: null,
  lockedByName: null,
  known: true,
});

export function guestPdfPage(pageId: string, source: PdfGuestSource): PageItem {
  return {
    id: pageId,
    notebook_id: GUEST_PDF_NOTEBOOK_ID,
    title: source.documentTitle || source.filename,
    page_type: "pdf",
    content_version: 1,
    content_json: { data_item_id: guestPdfDataItemId(pageId) },
  } as PageItem;
}

type GuestFile = Readonly<{ bytes: Uint8Array; sha256: string; url: string }>;
const guestFiles = new Map<string, Promise<GuestFile>>();

function absoluteUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The sample's bytes and digest, read once per file (a static asset). */
function readGuestFile(source: PdfGuestSource): Promise<GuestFile> {
  const url = absoluteUrl(source.url);
  let file = guestFiles.get(url);
  if (!file) {
    file = (async () => {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error(`sample PDF ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return Object.freeze({ bytes, sha256: await sha256Hex(bytes), url });
    })();
    file.catch(() => guestFiles.delete(url));
    guestFiles.set(url, file);
  }
  return file;
}

/** The sample's file record, as `/data-items/{id}` answers for an upload. */
export async function loadGuestPdfItem(dataItemId: string, source: PdfGuestSource): Promise<DataItem> {
  const file = await readGuestFile(source);
  // The editor's native paths read the shown bytes from this memo first.
  rememberPdfSourceBytes(file.sha256, file.bytes);
  return {
    id: dataItemId,
    filename: source.filename,
    media_type: "application/pdf",
    size_bytes: file.bytes.length,
    sha256: file.sha256,
    download_url: file.url,
  };
}

function guestPdfResourceId(dataItemId: string): string {
  return `${dataItemId}-resource`;
}

/** The sample resource's one version: the upload. */
function guestPdfOriginalVersion(resourceId: string): ResourceVersionRead {
  return {
    id: `${resourceId}-v1`,
    resource_id: resourceId,
    version_number: 1,
    version_kind: "original",
    document_id: null,
    created_by: null,
    created_by_agent_run_id: null,
    metadata_json: {},
    has_file_payload: true,
    downloadable: true,
    download_source_version_id: null,
    download_source_version_kind: null,
    created_at: new Date(0).toISOString(),
  };
}

/** The sample's resource, as the notebook's resource list answers. */
export async function loadGuestPdfResource(dataItemId: string, source: PdfGuestSource): Promise<ResourceRead> {
  const file = await readGuestFile(source);
  const now = new Date(0).toISOString();
  return {
    id: guestPdfResourceId(dataItemId),
    workspace_id: "guest",
    notebook_id: GUEST_PDF_NOTEBOOK_ID,
    page_id: null,
    created_by: null,
    source_data_item_id: dataItemId,
    kind: "pdf",
    mime_type: "application/pdf",
    filename: source.filename,
    size_bytes: file.bytes.length,
    sha256: file.sha256,
    ingestion_status: "ready",
    preview_status: "ready",
    editable_status: "ready",
    pdf_projection_status: "ready",
    support_level: 3,
    last_ai_inspected_at: null,
    metadata_json: {},
    created_at: now,
    updated_at: now,
  } as unknown as ResourceRead;
}

/** The download URL of the sample (what a download ticket names). */
export function guestPdfDownloadUrl(source: PdfGuestSource): string {
  return absoluteUrl(source.url);
}

/** What a visitor's request for the server is refused with: the sample is
 * not on the server, and a signed-out visitor may not write there. */
export const GUEST_PDF_REFUSAL_CODE = "guest_sign_up_required";

function guestRefusal(): ApiRequestError {
  return new ApiRequestError("Sign up to use this with your own files.", {
    status: 403,
    code: GUEST_PDF_REFUSAL_CODE,
  });
}

type GuestAnnotationRow = {
  id: string;
  type: string;
  payload_json: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The server a visitor's PDF window talks to, in this browser
 * (lib/api registerLocalApiAnswerer): its file record and download, and its
 * annotation rows (highlights, notes, shapes, stamps, ink: the reader keeps
 * them as rows of the file) held in memory for the window's life. Any other
 * request about the sample -- its page, its resource, an engine or OCR call
 * -- is refused here, never sent.
 */
export function createGuestPdfLocalApi(input: {
  readonly pageId: string;
  readonly dataItemId: string;
  readonly source: PdfGuestSource;
  /** While the visitor's window is open, the PDF engine's and the shared
   * source-risk store's requests (which name the sample by its digest, not
   * by an id) are its too: a visitor has no session for them. */
  readonly isOpen: () => boolean;
}): LocalApiAnswerer {
  const { pageId, dataItemId, source, isOpen } = input;
  const item = escapeRegExp(dataItemId);
  const itemPath = new RegExp(`^/api/v1/data-items/${item}(?:\\?.*)?$`);
  const downloadPath = new RegExp(`^/api/v1/data-items/${item}/download(?:\\?.*)?$`);
  const previewPath = new RegExp(`^/api/v1/data-items/${item}/preview(?:\\?.*)?$`);
  const annotationsPath = new RegExp(`^/api/v1/data-items/${item}/annotations(?:\\?(.*))?$`);
  const annotationPath = /^\/api\/v1\/annotations\/([^/?]+)(?:\?.*)?$/;
  const resourceId = guestPdfResourceId(dataItemId);
  const resource = escapeRegExp(resourceId);
  const resourceListPath = new RegExp(`^/api/v1/resources\\?(?:.*&)?source_data_item_id=${item}(?:&|$)`);
  const resourcePath = new RegExp(`^/api/v1/resources/${resource}(?:\\?.*)?$`);
  const versionsPath = new RegExp(`^/api/v1/resources/${resource}/versions(?:\\?(.*))?$`);
  const versionDownloadPath = new RegExp(`^/api/v1/resources/${resource}/versions/[^/?]+/download(?:\\?.*)?$`);
  const ours = new RegExp(
    `(?:${item}|/pages/${escapeRegExp(pageId)}(?:[/?]|$)|[?&]page_id=${escapeRegExp(pageId)}(?:&|$)|` +
      `/notebooks/${GUEST_PDF_NOTEBOOK_ID}(?:[/?]|$)|[?&]notebook_id=${GUEST_PDF_NOTEBOOK_ID}(?:&|$))`,
  );
  // A request whose JSON names the sample (a page id, the file, its
  // resource) is the sample's too, whatever its path.
  const sampleIds = new RegExp(`"(?:${escapeRegExp(pageId)}|${item}|${resource})"`);
  const mentionsSample = (body: unknown): boolean => {
    if (typeof body === "string") return sampleIds.test(body);
    if (!body || typeof body !== "object" || ArrayBuffer.isView(body) || body instanceof ArrayBuffer ||
      (typeof Blob !== "undefined" && body instanceof Blob) ||
      (typeof FormData !== "undefined" && body instanceof FormData)) return false;
    try {
      return sampleIds.test(JSON.stringify(body));
    } catch {
      return false;
    }
  };
  const rows = new Map<string, GuestAnnotationRow>();
  let sequence = 0;
  const rowOut = (row: GuestAnnotationRow) => ({
    ...row,
    payload_json: structuredClone(row.payload_json),
    payload_sha256: `${row.id}:${JSON.stringify(row.payload_json).length}`,
  });
  return ({ method, path, body }) => {
    const local = path.startsWith("/api/") ? path : path.replace(/^https?:\/\/[^/]+/, "");
    if (method === "GET" && itemPath.test(local)) {
      return loadGuestPdfItem(dataItemId, source);
    }
    if (method === "GET" && downloadPath.test(local)) {
      return Promise.resolve({ download_url: guestPdfDownloadUrl(source) });
    }
    if (method === "GET" && previewPath.test(local)) {
      return readGuestFile(source).then((file) =>
        new Response(file.bytes.slice(), { headers: { "Content-Type": "application/pdf" } }));
    }
    // The sample's resource, with its one version (the upload): the native
    // editor names the source it edits by them.
    if (method === "GET" && resourceListPath.test(local)) {
      return loadGuestPdfResource(dataItemId, source).then((row) => ({ items: [row], next_cursor: null }));
    }
    if (method === "GET" && resourcePath.test(local)) {
      return loadGuestPdfResource(dataItemId, source);
    }
    const versions = method === "GET" ? versionsPath.exec(local) : null;
    if (versions) {
      const offset = Number(new URLSearchParams(versions[1] ?? "").get("offset") ?? 0);
      return Promise.resolve({ items: offset > 0 ? [] : [guestPdfOriginalVersion(resourceId)] });
    }
    if (method === "GET" && versionDownloadPath.test(local)) {
      return Promise.resolve({
        resource_id: resourceId,
        version_id: guestPdfOriginalVersion(resourceId).id,
        download_url: guestPdfDownloadUrl(source),
      });
    }
    const listed = annotationsPath.exec(local);
    if (listed && method === "GET") {
      const type = new URLSearchParams(listed[1] ?? "").get("type");
      return Promise.resolve({
        items: [...rows.values()].filter((row) => !type || row.type === type).map(rowOut),
      });
    }
    if (listed && method === "POST") {
      const request = (body ?? {}) as { type?: unknown; payload_json?: unknown };
      if (typeof request.type !== "string" || !request.payload_json || typeof request.payload_json !== "object") {
        return Promise.reject(guestRefusal());
      }
      sequence += 1;
      const row: GuestAnnotationRow = {
        id: `${dataItemId}-annotation-${sequence}`,
        type: request.type,
        payload_json: structuredClone(request.payload_json as Record<string, unknown>),
        created_at: new Date().toISOString(),
        created_by: null,
      };
      rows.set(row.id, row);
      return Promise.resolve({ annotation: rowOut(row) });
    }
    const one = annotationPath.exec(local);
    const row = one ? rows.get(decodeURIComponent(one[1])) : undefined;
    if (row && method === "PATCH") {
      const request = (body ?? {}) as { payload_json?: unknown };
      if (request.payload_json && typeof request.payload_json === "object") {
        row.payload_json = structuredClone(request.payload_json as Record<string, unknown>);
      }
      return Promise.resolve({ annotation: rowOut(row) });
    }
    if (row && method === "DELETE") {
      rows.delete(row.id);
      return Promise.resolve({ ok: true });
    }
    const engine = isOpen() && /^\/api\/v1\/(?:engine\/pdf|pdf\/)/.test(local);
    // The shared inspection cache: a profile it does not hold is read in
    // this browser, and none is written back.
    if (engine && method !== "GET" && local.startsWith("/api/v1/pdf/source-risk/")) {
      return Promise.resolve({});
    }
    if (row || engine || ours.test(local) || mentionsSample(body)) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[pdf-guest] not sent", method, local.slice(0, 160));
      }
      // A command the visitor asked for (an AI action, a translation, OCR,
      // an export job) asks for an account; the window's own background
      // reads and the engine's warm-ups are only refused. The engine's
      // document writers (compress, page background, picture overlay) run
      // only on the server, and only when asked for.
      if (method !== "GET" && (!/^\/api\/v1\/(?:engine|annotations|pdf)\//.test(local) ||
        local.startsWith("/api/v1/engine/pdf-document/"))) {
        (local.startsWith("/api/v1/ai/") ? source.onAiRequest : source.onFeatureRequest)?.();
      }
      return Promise.reject(guestRefusal());
    }
    return undefined;
  };
}

type GuestUpload = Readonly<{ item: DataItem; file: File; url: string }>;
const guestUploads = new Map<string, GuestUpload>();
let guestUploadSequence = 0;
const GUEST_UPLOAD_PATH = /^\/api\/v1\/data-items\/(guest-upload-\d+)(\/download|\/preview)?(?:\?.*)?$/;

/**
 * A file a visitor's editor "uploads" (a watermark picture, an attachment,
 * pages to insert): held in this browser under an id of its own, which the
 * local API answers for as it does for the sample. Nothing is sent.
 */
export async function holdGuestPdfUpload(file: File): Promise<string> {
  if (guestUploads.size === 0) {
    registerLocalApiAnswerer(({ method, path }) => {
      const match = method === "GET" ? GUEST_UPLOAD_PATH.exec(path.replace(/^https?:\/\/[^/]+/, "")) : null;
      const upload = match ? guestUploads.get(match[1]) : undefined;
      if (!match) return undefined;
      if (!upload) return Promise.reject(guestRefusal());
      if (match[2] === "/download") return Promise.resolve({ download_url: upload.url });
      if (match[2] === "/preview") {
        return Promise.resolve(new Response(upload.file, {
          headers: { "Content-Type": upload.file.type || "application/octet-stream" },
        }));
      }
      return Promise.resolve({ ...upload.item });
    });
  }
  guestUploadSequence += 1;
  const id = `guest-upload-${guestUploadSequence}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const item: DataItem = {
    id,
    filename: file.name,
    media_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256: await sha256Hex(bytes),
    download_url: null,
  };
  const url = URL.createObjectURL(file);
  guestUploads.set(id, Object.freeze({ item: { ...item, download_url: url }, file, url }));
  return id;
}

/** Where a held upload is shown (its object URL), or null for any other id. */
export function guestPdfUploadUrl(id: string): string | null {
  return guestUploads.get(id)?.url ?? null;
}

/** Per visitor page: its sample, and how many of its windows are open now. */
const guestLocalApis = new Map<string, { open: number; source: PdfGuestSource }>();

/**
 * Claim the visitor's sample requests for this browser before anything of
 * the window asks (called as it renders; once per page id). The sample's own
 * records stay for the page's life, as a server would keep them: a window
 * minimized and opened again finds its highlights and notes where they were.
 */
export function ensureGuestPdfLocalApi(pageId: string, source: PdfGuestSource): void {
  if (guestLocalApis.has(pageId)) return;
  const state = { open: 0, source };
  guestLocalApis.set(pageId, state);
  registerLocalApiAnswerer(createGuestPdfLocalApi({
    pageId,
    dataItemId: guestPdfDataItemId(pageId),
    source,
    isOpen: () => state.open > 0,
  }));
}

/** A visitor's window opened (from its mount effect); returns its close.
 * While it is open, a file the editor would hand the browser to save (a
 * compressed copy, an image export, an annotation export) asks for an
 * account instead (lib/download-file). */
export function openGuestPdfWindow(pageId: string): () => void {
  const state = guestLocalApis.get(pageId);
  if (!state) return () => {};
  state.open += 1;
  const releaseDownloads = state.source.onExportRequest ? holdDownloadsBehind(() => state.source.onExportRequest?.()) : () => {};
  return () => {
    state.open = Math.max(0, state.open - 1);
    releaseDownloads();
  };
}

type PdfWorkingRecoveryStore = ReturnType<typeof createPdfWorkingRecoveryStore>;
const guestRecoveryStores = new Map<string, PdfWorkingRecoveryStore>();

/**
 * The working copy's queue of unsaved edits, for a visitor's page: kept in
 * memory (the tab's store is keyed by a signed-in principal, which a visitor
 * has not got). Null for any page that is not a visitor's.
 */
export function guestPdfRecoveryStore(pageId: string, dataItemId: string): PdfWorkingRecoveryStore | null {
  if (!guestLocalApis.has(pageId)) return null;
  const key = `${pageId}:${dataItemId}`;
  let store = guestRecoveryStores.get(key);
  if (!store) {
    let held: PdfWorkingRecovery | null = null;
    store = {
      read: () => held,
      write: (recovery: PdfWorkingRecovery) => {
        held = recovery;
      },
      discardUnsaved: () => {
        held = null;
      },
      clearConfirmed: () => {
        if (held?.operations.length) throw new Error("Unconfirmed PDF operations cannot be cleared.");
        held = null;
      },
    };
    guestRecoveryStores.set(key, store);
  }
  return store;
}

type PageAutosave = ReturnType<typeof useAutosavedPageDocument>;

function mergeDraft(previous: PageDocumentDraft | null, next: PageDocumentDraft): PageDocumentDraft {
  if (!previous) return next;
  return {
    ...previous,
    ...next,
    content_json: { ...(previous.content_json ?? {}), ...(next.content_json ?? {}) },
  };
}

/**
 * The page autosave a visitor's PDF window holds: the shared hook stays
 * disabled (it reads and writes the server), and this answers in its place
 * as the hook does with AutoSave off -- the page is the sample, an edit is
 * held (Unsaved) and shown, nothing is sent. An explicit save sends nothing
 * either: the window's Save asks for an account before it gets here.
 * `guestPage` null: the shared hook, unchanged.
 */
export function useGuestPdfAutosave(
  shared: PageAutosave,
  guestPage: PageItem | null,
  onLoaded: (page: PageItem, source?: AutosavedPageLoadSource) => void,
): PageAutosave {
  const [pending, setPending] = useState<PageDocumentDraft | null>(null);
  const pendingRef = useRef<PageDocumentDraft | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const onLoadedRef = useRef(onLoaded);
  useLayoutEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);
  useEffect(() => {
    if (!guestPage) return;
    let cancelled = false;
    onLoadedRef.current(guestPage);
    // Loaded once the slices hydrated above are in state.
    queueMicrotask(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [guestPage]);
  const queueSave = useCallback((draft: PageDocumentDraft) => {
    pendingRef.current = mergeDraft(pendingRef.current, draft);
    setPending(pendingRef.current);
  }, []);
  const replacePendingDraft = useCallback((draft: PageDocumentDraft | null) => {
    pendingRef.current = draft;
    setPending(draft);
  }, []);
  const saveNow = useCallback(async (draft?: PageDocumentDraft): Promise<PageItem | null> => {
    if (draft) queueSave(draft);
    return null;
  }, [queueSave]);
  const reload = useCallback(async (): Promise<PageItem | null> => guestPage, [guestPage]);
  const discardLocalAndReload = useCallback(async () => {
    pendingRef.current = null;
    setPending(null);
    if (guestPage) onLoadedRef.current(guestPage);
    setReloadNonce((nonce) => nonce + 1);
    return guestPage;
  }, [guestPage]);
  return useMemo(() => {
    if (!guestPage) return shared;
    return {
      ...shared,
      page: guestPage,
      loading: !seeded,
      error: null,
      saveStatus: pending ? "unsaved" : "saved",
      isDirty: pending !== null,
      isSaving: false,
      hasConflict: false,
      conflictDetails: null,
      readOnly: false,
      readOnlyReason: null,
      lockedByName: null,
      isCachedPreview: false,
      isLocalAuthorityPending: false,
      authorOperationHeld: false,
      pageDraftDirty: pending !== null,
      reloadNonce,
      queueSave,
      replacePendingDraft,
      saveNow,
      reload,
      discardLocalAndReload,
    } as PageAutosave;
  }, [discardLocalAndReload, guestPage, pending, queueSave, reload, reloadNonce, replacePendingDraft, saveNow, seeded, shared]);
}
