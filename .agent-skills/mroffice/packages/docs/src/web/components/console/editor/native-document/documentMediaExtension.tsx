"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  DOCUMENT_MEDIA_DEFAULT_HEIGHT,
  DOCUMENT_MEDIA_DEFAULT_WIDTH,
  DOCUMENT_MEDIA_MAX_HEIGHT,
  DOCUMENT_MEDIA_MAX_WIDTH,
  DOCUMENT_MEDIA_MIN_HEIGHT,
  DOCUMENT_MEDIA_MIN_WIDTH,
  DOCUMENT_MEDIA_IFRAME_REFERRER_POLICY,
  DOCUMENT_MEDIA_IFRAME_SANDBOX,
  DOCUMENT_MEDIA_NODE_NAME,
  DOCUMENT_MEDIA_SCHEMA_VERSION,
  documentMediaDisplayLabel,
  normalizeDocumentMediaAlignment,
  normalizeDocumentMediaAttrs,
  normalizeDocumentMediaKind,
  normalizeDocumentMediaTitle,
  normalizeDocumentMediaUrl,
  parseDocumentMediaDimension,
  type DocumentMediaAttrs,
} from "@mrnote/core/web/lib/document-media.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentMedia: {
      insertDocumentMedia: (attrs: unknown) => ReturnType;
      updateDocumentMedia: (attrs: unknown) => ReturnType;
    };
  }
}

export interface DocumentMediaOptions {
  /** Authoring + third-party playback. Schema preservation remains active. */
  enabled: boolean;
}

const DOCUMENT_MEDIA_FORBIDDEN_ANCESTORS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
]);

function selectionAllowsDocumentMedia(
  state: NodeViewProps["editor"]["state"],
): boolean {
  for (const position of [state.selection.$from, state.selection.$to]) {
    for (let depth = position.depth; depth >= 0; depth -= 1) {
      if (
        DOCUMENT_MEDIA_FORBIDDEN_ANCESTORS.has(position.node(depth).type.name)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Block margins that place the video the way its paragraph alignment would in
 * Word: left and right hug that edge, unset or centre sit in the middle.
 */
function mediaAlignmentMargins(textAlign: unknown): {
  marginLeft: string;
  marginRight: string;
} {
  const align = normalizeDocumentMediaAlignment(textAlign);
  return {
    marginLeft: align === "left" ? "0" : "auto",
    marginRight: align === "right" ? "0" : "auto",
  };
}

function mediaWrapperStyle(
  attrs: DocumentMediaAttrs,
  selected: boolean,
): CSSProperties {
  return {
    position: "relative",
    display: "block",
    boxSizing: "border-box",
    width: `${attrs.width}px`,
    maxWidth: "100%",
    aspectRatio: `${attrs.width} / ${attrs.height}`,
    marginTop: 12,
    marginBottom: 12,
    ...mediaAlignmentMargins(attrs.textAlign),
    overflow: "hidden",
    borderRadius: 8,
    border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
    background: "var(--muted)",
    color: "var(--foreground)",
  };
}

const mediaFillStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  border: 0,
  background: "#000",
};

const mediaFallbackStyle: CSSProperties = {
  display: "flex",
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 16,
  textAlign: "center",
};

const mediaButtonStyle: CSSProperties = {
  minWidth: 160,
  minHeight: 44,
  padding: "8px 16px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--background)",
  color: "var(--foreground)",
  cursor: "pointer",
  font: "inherit",
};

const mediaOpenFallbackStyle: CSSProperties = {
  position: "absolute",
  right: 8,
  bottom: 8,
  zIndex: 2,
  borderRadius: 6,
  background: "rgba(15, 23, 42, 0.82)",
  color: "#fff",
  padding: "4px 8px",
  fontSize: 12,
};

function DocumentMediaView({ node, selected, extension }: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const onlineVideoLabel = t("toolbar.onlineVideo");
  const unavailableLabel = `${onlineVideoLabel} · ${t(
    "document.capability.unavailable",
  )}`;
  const openLabel = `${t("block.file.open")} · ${onlineVideoLabel}`;
  const playLabel = `${t(
    "presentation.media.playbackTab",
  )} · ${onlineVideoLabel}`;
  const enabled = Boolean(
    (extension.options as Partial<DocumentMediaOptions>).enabled,
  );
  const attrs = normalizeDocumentMediaAttrs(node.attrs);
  const playbackIdentity = attrs ? `${attrs.kind}\u0000${attrs.url}` : null;
  const [approvedPlaybackIdentity, setApprovedPlaybackIdentity] = useState<
    string | null
  >(null);
  const [failedPlaybackIdentity, setFailedPlaybackIdentity] = useState<
    string | null
  >(null);
  const interactive =
    playbackIdentity !== null && approvedPlaybackIdentity === playbackIdentity;
  const playbackFailed =
    playbackIdentity !== null && failedPlaybackIdentity === playbackIdentity;

  if (!attrs) {
    return (
      <NodeViewWrapper
        as="figure"
        contentEditable={false}
        data-document-media-status="invalid"
        style={mediaWrapperStyle(
          {
            schemaVersion: 1,
            kind: "iframe",
            url: "https://invalid.invalid/",
            title: "",
            poster: null,
            width: DOCUMENT_MEDIA_DEFAULT_WIDTH,
            height: DOCUMENT_MEDIA_DEFAULT_HEIGHT,
          },
          selected,
        )}
      >
        <div
          role="img"
          aria-label={unavailableLabel}
          style={mediaFallbackStyle}
        >
          {unavailableLabel}
        </div>
      </NodeViewWrapper>
    );
  }

  const label = documentMediaDisplayLabel(attrs);
  const wrapper = (content: ReactNode, status: string) => (
    <NodeViewWrapper
      as="figure"
      contentEditable={false}
      data-document-media-status={status}
      data-document-media-kind={attrs.kind}
      style={mediaWrapperStyle(attrs, selected)}
    >
      {content}
    </NodeViewWrapper>
  );

  if (!enabled) {
    return wrapper(
      <div style={mediaFallbackStyle}>
        <strong>{label}</strong>
        <a href={attrs.url} target="_blank" rel="noopener noreferrer">
          {openLabel}
        </a>
      </div>,
      "disabled",
    );
  }

  // Click-to-load: opening a document never contacts a third-party provider.
  // Approval is bound to the normalized kind + URL, not merely this NodeView
  // instance. Replacing the media therefore cannot reuse an earlier click to
  // mount a different provider, while title/size edits keep current playback.
  if (!interactive) {
    return wrapper(
      <div style={mediaFallbackStyle}>
        <strong>{label}</strong>
        <button
          type="button"
          style={mediaButtonStyle}
          aria-label={`${playLabel}: ${label}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setFailedPlaybackIdentity(null);
            setApprovedPlaybackIdentity(playbackIdentity);
          }}
        >
          {playLabel}
        </button>
      </div>,
      "ready",
    );
  }

  if (playbackFailed) {
    return wrapper(
      <div style={mediaFallbackStyle}>
        <strong>{label}</strong>
        <p role="alert">{t("document.media.playbackFailed")}</p>
        <button
          type="button"
          style={mediaButtonStyle}
          onClick={() => {
            setFailedPlaybackIdentity(null);
            setApprovedPlaybackIdentity(null);
          }}
        >
          {t("document.media.retry")}
        </button>
        <a href={attrs.url} target="_blank" rel="noopener noreferrer">
          {openLabel}
        </a>
      </div>,
      "failed",
    );
  }

  const openFallback = (
    <a
      href={attrs.url}
      target="_blank"
      rel="noopener noreferrer"
      style={mediaOpenFallbackStyle}
    >
      {openLabel}
    </a>
  );

  if (attrs.kind === "video") {
    return wrapper(
      <>
        <video
          src={attrs.url}
          poster={attrs.poster ?? undefined}
          controls
          controlsList="nodownload"
          playsInline
          preload="metadata"
          aria-label={label}
          style={mediaFillStyle}
          onError={() => setFailedPlaybackIdentity(playbackIdentity)}
        />
        {openFallback}
      </>,
      "playing",
    );
  }
  return wrapper(
    <>
      <iframe
        src={attrs.url}
        title={label}
        sandbox={DOCUMENT_MEDIA_IFRAME_SANDBOX}
        referrerPolicy={DOCUMENT_MEDIA_IFRAME_REFERRER_POLICY}
        loading="lazy"
        allow="fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        style={mediaFillStyle}
        onError={() => setFailedPlaybackIdentity(playbackIdentity)}
      />
      {openFallback}
    </>,
    "playing",
  );
}

export const DocumentMedia = Node.create<DocumentMediaOptions>({
  name: DOCUMENT_MEDIA_NODE_NAME,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { enabled: false };
  },

  addAttributes() {
    return {
      schemaVersion: {
        default: DOCUMENT_MEDIA_SCHEMA_VERSION,
        parseHTML: (element) =>
          Number(element.getAttribute("data-media-version")) ===
          DOCUMENT_MEDIA_SCHEMA_VERSION
            ? DOCUMENT_MEDIA_SCHEMA_VERSION
            : DOCUMENT_MEDIA_SCHEMA_VERSION,
        renderHTML: () => ({
          "data-media-version": String(DOCUMENT_MEDIA_SCHEMA_VERSION),
        }),
      },
      kind: {
        default: "iframe",
        parseHTML: (element) =>
          normalizeDocumentMediaKind(element.getAttribute("data-media-kind")) ??
          "iframe",
        renderHTML: (attrs) => ({
          "data-media-kind": normalizeDocumentMediaKind(attrs.kind) ?? "iframe",
        }),
      },
      url: {
        default: "",
        parseHTML: (element) => {
          const kind =
            normalizeDocumentMediaKind(
              element.getAttribute("data-media-kind"),
            ) ?? "iframe";
          return (
            normalizeDocumentMediaUrl(
              kind,
              element.getAttribute("data-media-url"),
            ) ?? ""
          );
        },
        renderHTML: (attrs) => {
          const kind = normalizeDocumentMediaKind(attrs.kind) ?? "iframe";
          const url = normalizeDocumentMediaUrl(kind, attrs.url);
          return url ? { "data-media-url": url } : {};
        },
      },
      title: {
        default: "",
        parseHTML: (element) =>
          normalizeDocumentMediaTitle(element.getAttribute("data-media-title")),
        renderHTML: (attrs) => {
          const title = normalizeDocumentMediaTitle(attrs.title);
          return title ? { "data-media-title": title } : {};
        },
      },
      poster: {
        default: null,
        parseHTML: (element) =>
          normalizeDocumentMediaUrl(
            "video",
            element.getAttribute("data-media-poster"),
          ),
        renderHTML: (attrs) => {
          const poster = normalizeDocumentMediaUrl("video", attrs.poster);
          return poster ? { "data-media-poster": poster } : {};
        },
      },
      width: {
        default: DOCUMENT_MEDIA_DEFAULT_WIDTH,
        parseHTML: (element) =>
          parseDocumentMediaDimension(
            element.getAttribute("data-media-width"),
            DOCUMENT_MEDIA_DEFAULT_WIDTH,
            DOCUMENT_MEDIA_MIN_WIDTH,
            DOCUMENT_MEDIA_MAX_WIDTH,
          ),
        renderHTML: (attrs) => ({ "data-media-width": String(attrs.width) }),
      },
      height: {
        default: DOCUMENT_MEDIA_DEFAULT_HEIGHT,
        parseHTML: (element) =>
          parseDocumentMediaDimension(
            element.getAttribute("data-media-height"),
            DOCUMENT_MEDIA_DEFAULT_HEIGHT,
            DOCUMENT_MEDIA_MIN_HEIGHT,
            DOCUMENT_MEDIA_MAX_HEIGHT,
          ),
        renderHTML: (attrs) => ({ "data-media-height": String(attrs.height) }),
      },
      textAlign: {
        default: null,
        parseHTML: (element) =>
          normalizeDocumentMediaAlignment(
            element.getAttribute("data-text-align"),
          ),
        renderHTML: (attrs) => {
          const align = normalizeDocumentMediaAlignment(attrs.textAlign);
          return align ? { "data-text-align": align } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="document-media"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = normalizeDocumentMediaAttrs(node.attrs);
    if (!attrs) {
      return [
        "figure",
        mergeAttributes(HTMLAttributes, {
          "data-type": "document-media",
          "data-document-media-status": "invalid",
        }),
        "Online video unavailable",
      ];
    }
    const label = documentMediaDisplayLabel(attrs);
    const margins = mediaAlignmentMargins(attrs.textAlign);
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-type": "document-media",
        style: `width: ${attrs.width}px; max-width: 100%; aspect-ratio: ${attrs.width} / ${attrs.height}; margin-left: ${margins.marginLeft}; margin-right: ${margins.marginRight};`,
      }),
      [
        "a",
        {
          href: attrs.url,
          target: "_blank",
          rel: "noopener noreferrer",
        },
        label,
      ],
    ];
  },

  addCommands() {
    return {
      insertDocumentMedia:
        (attrs: unknown) =>
        ({ commands, state }) => {
          if (!this.options.enabled || !selectionAllowsDocumentMedia(state)) {
            return false;
          }
          const normalized = normalizeDocumentMediaAttrs(attrs, {
            allowEmbedCode: true,
          });
          return normalized
            ? commands.insertContent({
                type: this.name,
                attrs: normalized,
              })
            : false;
        },
      updateDocumentMedia:
        (attrs: unknown) =>
        ({ state, tr, dispatch }) => {
          if (!this.options.enabled || !attrs || typeof attrs !== "object") {
            return false;
          }
          const selection = state.selection;
          if (
            !(selection instanceof NodeSelection) ||
            selection.node.type.name !== this.name
          ) {
            return false;
          }
          const normalized = normalizeDocumentMediaAttrs(
            { ...selection.node.attrs, ...(attrs as Record<string, unknown>) },
            { allowEmbedCode: true },
          );
          if (!normalized) return false;
          if (dispatch) {
            dispatch(
              tr
                .setNodeMarkup(selection.from, undefined, {
                  ...selection.node.attrs,
                  ...normalized,
                })
                .scrollIntoView(),
            );
          }
          return true;
        },
    };
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(DocumentMediaView);
  },
});
