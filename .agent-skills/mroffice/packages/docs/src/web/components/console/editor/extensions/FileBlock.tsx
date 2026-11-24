"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Loader2 } from "lucide-react";
import {
  FileUp,
  Download,
  Edit3,
  ExternalLink,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { apiGet } from "@mrnote/core/web/lib/api.ts";
import { uploadPageAttachment } from "@mrnote/core/web/lib/page-attachment-upload.ts";
import { fileAccessErrorMessage } from "@mrnote/core/web/lib/file-access-repair.ts";
import {
  canCompileFileAsEditableDocument,
  isComplexImportTooLarge,
} from "@mrnote/core/web/lib/document-import/editableDocumentFile.ts";
import { getSafeClickableHref } from "@mrnote/core/web/lib/security.ts";
import {
  dispatchNotebookPagesChanged,
  dispatchNotebookStorageChanged,
} from "@mrnote/core/web/lib/notebook-events.ts";
import { notebookSDK, type PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import { useCurrentPageId } from "@mrnote/core/web/components/console/editor/PageIdContext.tsx";
import { useWindowManagerActions } from "@mrnote/core/web/components/notebook/WindowManager.tsx";
import {
  currentNodeViewMutationTarget,
  updateCurrentNodeViewAttributes,
} from "./nodeViewWriteAuthority";

// The file importers load with the first conversion, not with every
// document that holds a file block.
const loadPageFileImport = () => import("@mrnote/core/web/lib/page-file-import.ts");

interface FileBlockAttrs {
  attachment_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  editable_imported?: boolean;
  editable_page_id?: string;
  editable_page_type?: string;
}

interface FileBlockOptions {
  /**
   * Guest mode (public marketing demo). When `true` every authed file path is
   * short-circuited: the attachment-url fetch, the upload, the convert-to-editable
   * flow, and the page-meta fetch are all skipped, so an unauthenticated visitor
   * never fires a 401 request. Defaults to `false` → the authenticated console
   * uploads / fetches / converts exactly as before.
   */
  guestMode: boolean;
}

interface AttachmentUrlPayload {
  url: string;
  expires_in_seconds?: number;
  filename?: string;
  mime_type?: string;
  declared_mime_type?: string;
  size_bytes?: number;
}

interface AttachmentUrlState {
  attachmentId: string;
  info: AttachmentUrlPayload | null;
  url: string | null;
  phase: "failed" | "loading" | "ready";
}

const INLINE_EDITABLE_RASTER_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

function isInlineEditableRaster(
  descriptor: { name: string; type: string },
): boolean {
  const mime = descriptor.type.trim().toLowerCase();
  if (INLINE_EDITABLE_RASTER_MIME_TYPES.has(mime)) return true;
  return (
    (!mime || mime === "application/octet-stream") &&
    /\.(?:png|jpe?g|gif|webp|bmp)$/i.test(descriptor.name)
  );
}

function attachmentDescriptor(
  attrs: FileBlockAttrs,
  info: AttachmentUrlPayload | null,
): { name: string; type: string; size: number } {
  return {
    name: info?.filename || attrs.filename || "attachment",
    type:
      info?.declared_mime_type ||
      info?.mime_type ||
      attrs.mime_type ||
      "application/octet-stream",
    size: Math.max(0, Number(info?.size_bytes ?? attrs.size_bytes ?? 0) || 0),
  };
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function trustedFileBlockError(
  error: unknown,
  fallback: string,
  allowed: readonly string[] = [],
): string {
  // The file host refused this browser's file session and it could not be
  // reconnected (lib/file-access-repair): its own translated message.
  const fileAccess = fileAccessErrorMessage(error);
  if (fileAccess) return fileAccess;
  const message = error instanceof Error ? error.message : "";
  return message && (message === fallback || allowed.includes(message))
    ? message
    : fallback;
}

async function notebookIdForPage(pageId: string | null): Promise<string> {
  if (!pageId) {
    throw new Error("Page is not ready for attachments yet.");
  }
  const page = await notebookSDK.getPage(pageId);
  if (!page.notebook_id) {
    throw new Error("Notebook is not ready for editable import yet.");
  }
  return page.notebook_id;
}

function openEditablePageWindow(
  openWindow: ReturnType<typeof useWindowManagerActions>["openWindow"],
  notebookId: string,
  page: PageItem,
) {
  openWindow({
    type: "note",
    title: page.title || "Editable import",
    meta: {
      notebookId,
      pageId: page.id,
      pageType: page.page_type || "document",
    },
  });
}

function pageTypeForDescriptor(
  descriptor: { name: string; type: string },
): PageItem["page_type"] {
  // capability:label-only — this maps a descriptor to a display PAGE-TYPE
  // label for editor import routing; it is NOT an edit/patch/export/projection
  // affordance gate (those go through useFileCapability), and runs in a pure
  // function with no React render context, so the resolver hook cannot apply.
  const name = descriptor.name.toLowerCase();
  if (
    name.endsWith(".xlsx") || // capability:label-only
    descriptor.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "spreadsheet";
  }
  if (
    name.endsWith(".pptx") || // capability:label-only
    descriptor.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "presentation";
  }
  return "document";
}

function isEmptyParagraphNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const maybeNode = node as { type?: unknown; content?: unknown };
  if (maybeNode.type !== "paragraph") return false;
  if (!Array.isArray(maybeNode.content) || maybeNode.content.length === 0) {
    return true;
  }
  return maybeNode.content.every((child) => {
    if (!child || typeof child !== "object") return false;
    const maybeText = child as { type?: unknown; text?: unknown };
    return (
      maybeText.type === "text" &&
      typeof maybeText.text === "string" &&
      maybeText.text.trim() === ""
    );
  });
}

function isStandaloneEditableImportDocument(
  editor: NodeViewProps["editor"],
  attachmentId: string,
): boolean {
  const content = ((editor.getJSON?.() as { content?: unknown[] } | undefined)
    ?.content || []) as unknown[];
  const meaningfulNodes = content.filter((child) => !isEmptyParagraphNode(child));
  if (meaningfulNodes.length !== 1) return false;
  const onlyNode = meaningfulNodes[0] as {
    type?: unknown;
    attrs?: Record<string, unknown>;
  };
  return (
    onlyNode.type === "file" &&
    onlyNode.attrs?.attachment_id === attachmentId
  );
}

function FileBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, getPos, node } = props;
  const attrs = node.attrs as FileBlockAttrs;
  const hasAttachment = Boolean(attrs.attachment_id);
  // Guest demo: every authed file path (attachment-url fetch, upload, convert,
  // page-meta fetch) is short-circuited so an unauthenticated visitor never
  // fires a 401. The local block UI stays inert (no upload/convert surfaces).
  const guestMode = Boolean(
    (props.extension.options as FileBlockOptions).guestMode,
  );

  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  const [error, setError] = useState<string | null>(null);
  const [attachmentUrlState, setAttachmentUrlState] =
    useState<AttachmentUrlState | null>(null);
  const [urlRetryGeneration, setUrlRetryGeneration] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const onlineRef = useRef(online);
  const conversionControllerRef = useRef<AbortController | null>(null);
  const openExistingGenerationRef = useRef(0);
  const nodeViewMountedRef = useRef(true);
  const autoOpenAttemptedRef = useRef(false);
  const pageId = useCurrentPageId();
  const livePageIdRef = useRef(pageId);
  const { openWindow } = useWindowManagerActions();
  const offlineReason = t("document.capability.onlineRequired");
  const ownedAttachmentUrlState =
    attachmentUrlState?.attachmentId === attrs.attachment_id
      ? attachmentUrlState
      : null;
  const attachmentInfo = ownedAttachmentUrlState?.info ?? null;
  const safeUrl = ownedAttachmentUrlState?.url
    ? getSafeClickableHref(ownedAttachmentUrlState.url)
    : null;
  const attachmentUrlLoading =
    hasAttachment &&
    !guestMode &&
    (ownedAttachmentUrlState === null ||
      ownedAttachmentUrlState.phase === "loading");
  const attachmentUrlFailed = ownedAttachmentUrlState?.phase === "failed";
  const descriptor = attachmentDescriptor(attrs, attachmentInfo);
  const existingEditablePageId = (attrs.editable_page_id || "").trim();
  const canConvertToEditable =
    !guestMode &&
    editable &&
    hasAttachment &&
    !existingEditablePageId &&
    canCompileFileAsEditableDocument(descriptor);
  const canEditAsInlineImage =
    !guestMode &&
    editable &&
    hasAttachment &&
    Boolean(attrs.attachment_id) &&
    isInlineEditableRaster(descriptor);

  useEffect(() => {
    nodeViewMountedRef.current = true;
    return () => {
      nodeViewMountedRef.current = false;
      openExistingGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const syncOnline = () => {
      const next =
        typeof navigator === "undefined" || navigator.onLine !== false;
      onlineRef.current = next;
      setOnline(next);
      if (!next) {
        uploadControllerRef.current?.abort();
        uploadControllerRef.current = null;
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
      setError((current) =>
        current === offlineReason || current === null
          ? !next && !hasAttachment
            ? offlineReason
            : null
          : current,
      );
    };
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, [hasAttachment, offlineReason]);

  useLayoutEffect(() => {
    livePageIdRef.current = pageId;
    openExistingGenerationRef.current += 1;
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    conversionControllerRef.current?.abort();
    conversionControllerRef.current = null;
    setUploading(false);
    setConverting(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [pageId]);

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable;
      setEditable(next);
      if (!next) {
        uploadControllerRef.current?.abort();
        uploadControllerRef.current = null;
        conversionControllerRef.current?.abort();
        conversionControllerRef.current = null;
        setUploading(false);
        setConverting(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    };
    editor.on("update", syncEditable);
    editor.on("transaction", syncEditable);
    return () => {
      editor.off("update", syncEditable);
      editor.off("transaction", syncEditable);
      uploadControllerRef.current?.abort();
      uploadControllerRef.current = null;
      conversionControllerRef.current?.abort();
      conversionControllerRef.current = null;
    };
  }, [editor]);

  const handleEditAsInlineImage = useCallback(() => {
    if (
      guestMode ||
      !editor.isEditable ||
      !attrs.attachment_id ||
      !isInlineEditableRaster(descriptor)
    ) {
      return;
    }
    try {
      const target = currentNodeViewMutationTarget(
        editor,
        getPos,
        node,
        "file",
      );
      if (!target) throw new Error(t("editor.importFailed"));
      const { state, view } = editor;
      const current = target.node;
      const rawPos = target.pos;
      const imageType = state.schema.nodes.image;
      if (
        current.attrs.attachment_id !== attrs.attachment_id ||
        !imageType
      ) {
        throw new Error(t("editor.importFailed"));
      }
      const attachmentId = attrs.attachment_id.trim();
      const src = new URL(
        `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`,
        window.location.origin,
      ).toString();
      const image = imageType.create({
        src,
        attachment_id: attachmentId,
        filename: descriptor.name,
        mime_type: descriptor.type,
        size_bytes: descriptor.size,
        alt: descriptor.name,
      });
      const transaction = state.tr.replaceWith(
        rawPos,
        rawPos + current.nodeSize,
        image,
      );
      transaction.setSelection(NodeSelection.create(transaction.doc, rawPos));
      view.dispatch(transaction.scrollIntoView());
      setError(null);
      window.requestAnimationFrame(() => {
        if (!editor.isDestroyed) editor.view.focus();
      });
    } catch (err) {
      setError(trustedFileBlockError(err, t("editor.importFailed")));
    }
  }, [
    attrs.attachment_id,
    descriptor,
    editor,
    getPos,
    guestMode,
    node,
    t,
  ]);

  const openExistingEditablePage = useCallback(async () => {
    if (guestMode || !existingEditablePageId) return;
    const generation = openExistingGenerationRef.current + 1;
    openExistingGenerationRef.current = generation;
    const requestedPageId = pageId;
    const expectedNode = node;
    const operationIsCurrent = () =>
      nodeViewMountedRef.current &&
      openExistingGenerationRef.current === generation &&
      livePageIdRef.current === requestedPageId &&
      currentNodeViewMutationTarget(
        editor,
        getPos,
        expectedNode,
        "file",
      ) !== null;
    try {
      const notebookId = await notebookIdForPage(pageId);
      if (!operationIsCurrent()) return;
      openEditablePageWindow(openWindow, notebookId, {
        id: existingEditablePageId,
        title: descriptor.name,
        page_type:
          (attrs.editable_page_type as PageItem["page_type"] | undefined) ||
          pageTypeForDescriptor(descriptor),
      } as PageItem);
    } catch (err) {
      if (operationIsCurrent()) {
        setError(trustedFileBlockError(err, t("block.file.convertFailed")));
      }
    }
  }, [
    attrs.editable_page_type,
    descriptor,
    existingEditablePageId,
    editor,
    getPos,
    guestMode,
    node,
    openWindow,
    pageId,
    t,
  ]);

  useEffect(() => {
    // Guest demo: never fetch the signed attachment URL (it would 401).
    if (guestMode || !attrs.attachment_id) return;
    const attachmentId = attrs.attachment_id;
    const controller = new AbortController();
    setAttachmentUrlState({
      attachmentId,
      info: null,
      url: null,
      phase: "loading",
    });
    void apiGet<AttachmentUrlPayload>(
      `/api/v1/attachments/${attachmentId}/url`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          setAttachmentUrlState({
            attachmentId,
            info: r,
            url: r.url,
            phase: "ready",
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAttachmentUrlState({
            attachmentId,
            info: null,
            url: null,
            phase: "failed",
          });
        }
      });
    return () => {
      controller.abort();
    };
  }, [attrs.attachment_id, guestMode, urlRetryGeneration]);

  const handlePick = useCallback(() => {
    if (!onlineRef.current) {
      setError(offlineReason);
      return;
    }
    if (editable && editor.isEditable) inputRef.current?.click();
  }, [editable, editor, offlineReason]);

  const handleConvertToEditable = useCallback(async () => {
    if (guestMode || !attrs.attachment_id || converting) return;
    if (existingEditablePageId) {
      await openExistingEditablePage();
      return;
    }
    if (!editable || !editor.isEditable) return;
    const expectedNode = node;
    if (
      !currentNodeViewMutationTarget(
        editor,
        getPos,
        expectedNode,
        "file",
      )
    ) {
      return;
    }
    conversionControllerRef.current?.abort();
    const controller = new AbortController();
    conversionControllerRef.current = controller;
    const operationIsCurrent = () =>
      conversionControllerRef.current === controller &&
      !controller.signal.aborted &&
      !editor.isDestroyed &&
      editor.isEditable &&
      livePageIdRef.current === pageId &&
      currentNodeViewMutationTarget(
        editor,
        getPos,
        expectedNode,
        "file",
      ) !== null;
    setConverting(true);
    setError(null);
    try {
      const freshInfo = await apiGet<AttachmentUrlPayload>(
        `/api/v1/attachments/${attrs.attachment_id}/url`,
        { signal: controller.signal },
      );
      if (!operationIsCurrent()) return;
      setAttachmentUrlState({
        attachmentId: attrs.attachment_id,
        info: freshInfo,
        url: freshInfo.url,
        phase: "ready",
      });
      const freshDescriptor = attachmentDescriptor(attrs, freshInfo);
      if (isComplexImportTooLarge(freshDescriptor)) {
        throw new Error(t("block.file.convertTooLarge"));
      }
      const notebookId = await notebookIdForPage(pageId);
      if (!operationIsCurrent()) return;
      const page = await (await loadPageFileImport()).createPageFromAttachment(
        notebookId,
        attrs.attachment_id,
        freshDescriptor,
        { signal: controller.signal },
      );
      if (!operationIsCurrent()) return;
      const committed = updateCurrentNodeViewAttributes(
        editor,
        getPos,
        expectedNode,
        "file",
        {
          editable_imported: true,
          editable_page_id: page.id,
          editable_page_type: page.page_type || "document",
        },
      );
      if (!committed) throw new Error(t("block.file.convertFailed"));
      dispatchNotebookStorageChanged();
      dispatchNotebookPagesChanged(notebookId);
      openEditablePageWindow(openWindow, notebookId, page);
    } catch (err) {
      if (operationIsCurrent()) {
        setError(
          trustedFileBlockError(err, t("block.file.convertFailed"), [
            t("block.file.convertTooLarge"),
          ]),
        );
      }
    } finally {
      if (conversionControllerRef.current === controller) {
        conversionControllerRef.current = null;
        setConverting(false);
      }
    }
  }, [
    attrs,
    converting,
    editable,
    existingEditablePageId,
    editor,
    getPos,
    guestMode,
    node,
    openWindow,
    openExistingEditablePage,
    pageId,
    t,
  ]);

  useEffect(() => {
    if (!hasAttachment || autoOpenAttemptedRef.current) return;
    if (
      !isStandaloneEditableImportDocument(editor, attrs.attachment_id) ||
      (!existingEditablePageId && !canConvertToEditable)
    ) {
      return;
    }
    autoOpenAttemptedRef.current = true;
    if (existingEditablePageId) {
      void openExistingEditablePage();
      return;
    }
    void handleConvertToEditable();
  }, [
    attrs.attachment_id,
    canConvertToEditable,
    editor,
    existingEditablePageId,
    handleConvertToEditable,
    hasAttachment,
    openExistingEditablePage,
  ]);

  const handleOpenInWindow = useCallback(() => {
    if (!safeUrl) return;
    if (existingEditablePageId) {
      void openExistingEditablePage();
      return;
    }
    if (canConvertToEditable) {
      void handleConvertToEditable();
      return;
    }
    const isImage = descriptor.type.startsWith("image/");
    openWindow({
      type: "file",
      title: descriptor.name || t("block.file.defaultWindowTitle"),
      meta: {
        previewUrl: isImage ? safeUrl : "",
        downloadUrl: safeUrl,
        mimeType: descriptor.type,
        filename: descriptor.name,
        attachmentId: attrs.attachment_id,
        sizeBytes: String(descriptor.size),
      },
    });
  }, [
    attrs.attachment_id,
    canConvertToEditable,
    descriptor.name,
    descriptor.size,
    descriptor.type,
    existingEditablePageId,
    handleConvertToEditable,
    openWindow,
    openExistingEditablePage,
    safeUrl,
    t,
  ]);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      if (!editable || !editor.isEditable) return;
      if (!onlineRef.current) {
        setError(offlineReason);
        return;
      }
      // Guest demo: never upload / convert (both hit authed routes that 401).
      // Surface the register prompt instead of silently failing mid-upload.
      if (guestMode) {
        setError(t("guestGate.upload.title"));
        return;
      }
      const expectedNode = node;
      if (
        !currentNodeViewMutationTarget(
          editor,
          getPos,
          expectedNode,
          "file",
        )
      ) {
        setError(t("block.file.uploadFailed"));
        return;
      }
      uploadControllerRef.current?.abort();
      const controller = new AbortController();
      uploadControllerRef.current = controller;
      const operationIsCurrent = () =>
        uploadControllerRef.current === controller &&
        !controller.signal.aborted &&
        onlineRef.current &&
        !editor.isDestroyed &&
        editor.isEditable &&
        livePageIdRef.current === pageId &&
        currentNodeViewMutationTarget(
          editor,
          getPos,
          expectedNode,
          "file",
        ) !== null;
      setUploading(true);
      setError(null);
      try {
        if (canCompileFileAsEditableDocument(file)) {
          // Any size: a file past what one import request converts is
          // uploaded in parts and becomes a page (or a read-only preview).
          const notebookId = await notebookIdForPage(pageId);
          if (!operationIsCurrent()) return;
          const page = await (await loadPageFileImport()).createPageFromFile(notebookId, file, {
            signal: controller.signal,
          });
          if (!operationIsCurrent()) return;
          const target = currentNodeViewMutationTarget(
            editor,
            getPos,
            expectedNode,
            "file",
          );
          if (target) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: target.pos,
                to: target.pos + target.node.nodeSize,
              })
              .run();
          } else {
            throw new Error(t("block.file.uploadFailed"));
          }
          dispatchNotebookStorageChanged();
          dispatchNotebookPagesChanged(notebookId);
          openEditablePageWindow(openWindow, notebookId, page);
          return;
        }
        if (!pageId) {
          throw new Error(t("block.file.pageNotReady"));
        }
        const resp = await uploadPageAttachment(pageId, file, {
          signal: controller.signal,
        });
        if (!operationIsCurrent()) return;
        const committed = updateCurrentNodeViewAttributes(
          editor,
          getPos,
          expectedNode,
          "file",
          {
            attachment_id: resp.attachment_id,
            filename: resp.filename,
            mime_type: resp.mime_type,
            size_bytes: resp.size_bytes,
          },
        );
        if (!committed) throw new Error(t("block.file.uploadFailed"));
      } catch (err) {
        if (operationIsCurrent()) {
          setError(
            trustedFileBlockError(err, t("block.file.uploadFailed"), [
              t("block.file.convertTooLarge"),
              t("block.file.pageNotReady"),
            ]),
          );
        }
      } finally {
        if (uploadControllerRef.current === controller) {
          uploadControllerRef.current = null;
          setUploading(false);
        }
      }
    },
    [
      editable,
      editor,
      getPos,
      guestMode,
      node,
      offlineReason,
      openWindow,
      pageId,
      t,
    ],
  );

  return (
    <NodeViewWrapper className="file-block" data-testid="file-block">
      {!hasAttachment && (
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading || !editable || !online}
          title={!online ? offlineReason : undefined}
          data-testid="file-block-upload"
          className="file-block__picker"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
          {uploading ? t("block.file.uploading") : t("block.file.uploadButton")}
        </button>
      )}
      {!hasAttachment && !online ? (
        <p
          className="file-block__status"
          role="status"
          data-testid="file-block-offline"
        >
          {offlineReason}
        </p>
      ) : null}
      {hasAttachment && (
        <div className="file-block__meta">
          <FileUp size={16} />
          <span className="file-block__name">{descriptor.name}</span>
          <span className="file-block__size">{humanSize(descriptor.size)}</span>
          {canEditAsInlineImage && (
            <button
              type="button"
              onClick={handleEditAsInlineImage}
              className="file-block__open"
              title={t("toolbar.ribbonImageTools")}
              aria-label={t("toolbar.ribbonImageTools")}
              data-testid="file-block-edit-image"
            >
              <Edit3 size={14} />
              {t("toolbar.ribbonImageTools")}
            </button>
          )}
          {safeUrl && descriptor.type.startsWith("image/") && (
            <button
              type="button"
              onClick={handleOpenInWindow}
              className="file-block__image-button"
              title={t("block.file.openInWindow")}
              data-testid="file-block-open-image"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={safeUrl} alt={descriptor.name} className="file-block__preview" />
            </button>
          )}
          {safeUrl &&
            !descriptor.type.startsWith("image/") &&
            !canConvertToEditable &&
            !existingEditablePageId && (
            <button
              type="button"
              onClick={handleOpenInWindow}
              className="file-block__open"
              data-testid="file-block-open"
            >
              <ExternalLink size={14} /> {t("block.file.open")}
            </button>
          )}
          {(canConvertToEditable || existingEditablePageId) && (
            <button
              type="button"
              onClick={
                existingEditablePageId
                  ? () => void openExistingEditablePage()
                  : handleConvertToEditable
              }
              className="file-block__open"
              disabled={
                converting || (!existingEditablePageId && !editable)
              }
              data-testid="file-block-convert-editable"
            >
              {converting ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
              {converting
                ? t("block.file.converting")
                : existingEditablePageId
                  ? t("references.openEditable")
                  : t("block.file.convertEditable")}
            </button>
          )}
          {safeUrl && (
            <a
              href={safeUrl}
              download={descriptor.name}
              className="file-block__download"
              title={t("block.file.download")}
            >
              <Download size={14} />
            </a>
          )}
        </div>
      )}
      {attachmentUrlLoading ? (
        <p className="file-block__status" role="status">
          {t("block.file.loading")}
        </p>
      ) : null}
      {attachmentUrlFailed ? (
        <p className="file-block__error" role="alert">
          <span>{t("block.file.loadFailed")}</span>
          <button
            type="button"
            data-testid="file-block-retry-url"
            onClick={() => setUrlRetryGeneration((current) => current + 1)}
          >
            {t("block.file.retry")}
          </button>
        </p>
      ) : null}
      {error && <p className="file-block__error">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        data-testid="file-block-input"
        style={{ display: "none" }}
        disabled={uploading || !editable || !online}
        onChange={handleFile}
      />
    </NodeViewWrapper>
  );
}

const FileBlock = Node.create<FileBlockOptions>({
  name: "file",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      guestMode: false,
    };
  },

  addAttributes() {
    return {
      attachment_id: { default: "" },
      filename: { default: "" },
      mime_type: { default: "" },
      size_bytes: { default: 0 },
      editable_imported: { default: false },
      editable_page_id: { default: "" },
      editable_page_type: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "file" })];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(FileBlockView);
  },
});

export default FileBlock;
