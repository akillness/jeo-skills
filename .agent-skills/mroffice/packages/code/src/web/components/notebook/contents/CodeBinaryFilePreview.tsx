"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A binary file of the Code workspace (lib/code-runner/workspace-binary-file)
 * in its Code window: read-only, never in the editor. The bytes of its
 * attachment are fetched once and checked against the size and SHA-256 the
 * upload recorded; an image is drawn as it is, a PDF with the compiled-PDF
 * preview's pdf.js pages, anything else by its name, type and size. Download
 * saves the bytes as they were uploaded.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  AlertCircle,
  Download,
  FileUp,
  RefreshCw,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import type { LanguageExecutionArtifact } from "../../../lib/code-runner/execution-artifact";
import {
  MAX_WORKSPACE_BINARY_PREVIEW_BYTES,
  formatWorkspaceBinarySize,
  readWorkspaceBinaryAsset,
  workspaceBinaryAssetDownloadUrl,
  workspaceBinaryPreviewKind,
  type WorkspaceBinaryAsset,
} from "../../../lib/code-runner/workspace-binary-file";
import { downloadBlobFile } from "@mrnote/core/web/lib/download-file.ts";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { CodeCompiledPdfPreview } from "./code-output/CodeCompiledPdfPreview";
import chrome from "./CodeEditorChrome.module.css";

type BinaryBytesState =
  | { readonly key: string; readonly phase: "loading" }
  | {
      readonly key: string;
      readonly phase: "ready";
      readonly bytes: Uint8Array<ArrayBuffer>;
      /** An object URL of the bytes, for an image only. */
      readonly imageUrl: string | null;
    }
  | { readonly key: string; readonly phase: "error" };

export function CodeBinaryFilePreview({
  asset,
  path,
}: {
  asset: WorkspaceBinaryAsset;
  /** The file's workspace path ("paper/figures/plot.png"). */
  path: string;
}) {
  const t = useTranslations("console-notebooks");
  const { attachmentId, mediaType, sizeBytes, sha256 } = asset;
  // A file past the preview budget is not fetched into the page: its details
  // show, and Download takes it from storage (a binary file has no size of
  // its own; the workspace's storage quota bounds it).
  const fetchedWhole = sizeBytes <= MAX_WORKSPACE_BINARY_PREVIEW_BYTES;
  const kind = fetchedWhole ? workspaceBinaryPreviewKind(asset) : "other";
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const key = `${attachmentId}\u0000${sha256}\u0000${reloadNonce}`;
  const [state, setState] = useState<BinaryBytesState>({
    key,
    phase: "loading",
  });
  // A new file or a retry is loading until its own bytes arrive.
  const current: BinaryBytesState =
    state.key === key ? state : { key, phase: "loading" };

  useEffect(() => {
    if (!fetchedWhole) return;
    const controller = new AbortController();
    let imageUrl: string | null = null;
    void readWorkspaceBinaryAsset(
      { attachmentId, mediaType, sizeBytes, sha256 },
      controller.signal,
    ).then(
      (bytes) => {
        if (controller.signal.aborted) return;
        try {
          imageUrl =
            kind === "image"
              ? URL.createObjectURL(new Blob([bytes], { type: mediaType }))
              : null;
        } catch {
          setState({ key, phase: "error" });
          return;
        }
        setState({ key, phase: "ready", bytes, imageUrl });
      },
      () => {
        if (!controller.signal.aborted) setState({ key, phase: "error" });
      },
    );
    return () => {
      controller.abort();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [attachmentId, fetchedWhole, key, kind, mediaType, sha256, sizeBytes]);

  const readyBytes = current.phase === "ready" ? current.bytes : null;
  const pdfArtifact = useMemo<LanguageExecutionArtifact | null>(
    () =>
      readyBytes && kind === "pdf"
        ? { name: filename, mediaType, sizeBytes, sha256, bytes: readyBytes }
        : null,
    [filename, kind, mediaType, readyBytes, sha256, sizeBytes],
  );
  const download = useCallback(() => {
    if (!fetchedWhole) {
      void workspaceBinaryAssetDownloadUrl({ attachmentId }).then(
        (url) => {
          if (!url) return;
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename;
          anchor.rel = "noopener";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        },
        () => undefined,
      );
      return;
    }
    if (!readyBytes) return;
    downloadBlobFile(filename, new Blob([readyBytes], { type: mediaType }));
  }, [attachmentId, fetchedWhole, filename, mediaType, readyBytes]);
  const failPreview = useCallback(() => {
    setState((previous) =>
      previous.key === key ? { key, phase: "error" } : previous,
    );
  }, [key]);

  const size = formatWorkspaceBinarySize(
    sizeBytes,
    typeof document === "undefined"
      ? undefined
      : document.documentElement.lang || undefined,
  );

  const downloadable = Boolean(readyBytes) || !fetchedWhole;
  const imageUrl = current.phase === "ready" ? current.imageUrl : null;
  let body: ReactNode;
  if (fetchedWhole && current.phase === "loading") {
    body = (
      <EditorLoadingState
        kind={kind === "pdf" ? "pdf" : "media"}
        label={t("common.loading")}
        compact
        testId="code-binary-file-loading"
      />
    );
  } else if (fetchedWhole && current.phase === "error") {
    body = (
      <div
        role="alert"
        data-testid="code-binary-file-error"
        className={`${chrome.centred} ${officeDialogParts.message}`}
      >
        <AlertCircle size={24} aria-hidden="true" />
        <strong>{t("references.previewLoadFailed")}</strong>
        <button
          type="button"
          onClick={() => setReloadNonce((nonce) => nonce + 1)}
          data-testid="code-binary-file-retry"
          className={officeDialogParts.compactButton}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {t("references.retry")}
        </button>
      </div>
    );
  } else if (pdfArtifact) {
    body = (
      <CodeCompiledPdfPreview
        artifact={pdfArtifact}
        root={bodyRef}
        onDownload={download}
        label={filename}
      />
    );
  } else if (imageUrl) {
    body = (
      <div className={chrome.centred}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of verified bytes */}
        <img
          src={imageUrl}
          alt={filename}
          data-testid="code-binary-file-image"
          onError={failPreview}
          className={chrome.picture}
        />
      </div>
    );
  } else {
    body = (
      <div data-testid="code-binary-file-details" className={chrome.centred}>
        <FileUp
          size={40}
          strokeWidth={1.5}
          aria-hidden="true"
          className={chrome.glyph}
        />
        <strong className={officeDialogParts.title}>{filename}</strong>
        <span className={officeDialogParts.hint}>
          {mediaType} · {size}
        </span>
      </div>
    );
  }

  // A file the editor cannot edit is shown in the dialogs' chrome (code tone)
  // laid flat over the editor: its title row (path, type and size, Download),
  // a note that it is read-only, then the preview.
  return (
    <div
      data-testid="code-binary-file"
      data-preview-kind={kind}
      data-phase={fetchedWhole ? current.phase : "details"}
      className={`${officeDialogClassName({ tone: "code" })} office-dialog--embedded ${chrome.surface}`}
    >
      <header className={`${officeDialogParts.header} ${chrome.surfaceHeader}`}>
        <div className={chrome.surfaceTitleText}>
          <strong title={path} className={officeDialogParts.title}>
            {path}
          </strong>
          <span
            data-testid="code-binary-file-meta"
            className={officeDialogParts.hint}
          >
            {mediaType} · {size}
          </span>
        </div>
        {kind !== "pdf" ? (
          <button
            type="button"
            onClick={download}
            disabled={!downloadable}
            data-testid="code-binary-file-download"
            className={officeDialogParts.compactButton}
          >
            <Download size={13} aria-hidden="true" />
            {t("fileWindow.download")}
          </button>
        ) : null}
      </header>
      <p role="note" className={`${officeDialogParts.hint} ${chrome.surfaceNote}`}>
        {t("code.binaryFile.readOnly")}
      </p>
      <div ref={bodyRef} className={chrome.surfaceBody}>
        {body}
      </div>
    </div>
  );
}
