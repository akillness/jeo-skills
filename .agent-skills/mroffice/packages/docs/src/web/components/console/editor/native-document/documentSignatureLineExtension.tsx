"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";

/**
 * Office signature line (Word 插入 → 签名行) as a real editor atom.
 *
 * The server DOCX import already projects `documentSignatureLine` nodes into
 * page JSON (projection_to_page.py) and the server exporter re-emits the
 * native signature-line part. Until this extension existed the editor schema
 * did not know the node, so TipTap silently DROPPED imported signature lines
 * on load and the next save destroyed them. This registration is therefore a
 * persistence-safety contract first: every server-emitted attr is preserved
 * verbatim through load → edit → save.
 *
 * Authoring creates only the UNSIGNED placeholder described by Office. Digital
 * certificates, provider payloads, and signed-state claims remain outside the
 * browser editor. This node renders Word's placeholder shape (X-line,
 * suggested signer / title) and keeps the semantics intact.
 */

export const DOCUMENT_SIGNATURE_LINE_NODE_NAME = "documentSignatureLine";

export const DOCUMENT_SIGNATURE_LINE_SCHEMA_VERSION = 1;
export const DOCUMENT_SIGNATURE_LINE_DEFAULT_WIDTH = 480;
export const DOCUMENT_SIGNATURE_LINE_DEFAULT_HEIGHT = 180;
export const DOCUMENT_SIGNATURE_LINE_MIN_WIDTH = 240;
export const DOCUMENT_SIGNATURE_LINE_MAX_WIDTH = 1_200;
export const DOCUMENT_SIGNATURE_LINE_MIN_HEIGHT = 96;
export const DOCUMENT_SIGNATURE_LINE_MAX_HEIGHT = 600;
export const DOCUMENT_SIGNATURE_LINE_MAX_NAME_CHARS = 240;
export const DOCUMENT_SIGNATURE_LINE_MAX_TITLE_CHARS = 240;
export const DOCUMENT_SIGNATURE_LINE_MAX_EMAIL_CHARS = 320;
export const DOCUMENT_SIGNATURE_LINE_MAX_INSTRUCTIONS_CHARS = 2_000;

export interface DocumentSignatureLineDraft {
  readonly suggestedSigner: string;
  readonly suggestedSignerTitle: string;
  readonly suggestedSignerEmail: string;
  readonly signingInstructions: string;
  readonly allowComments: boolean;
  readonly showSignDate: boolean;
}

export interface DocumentSignatureLineAttrs extends DocumentSignatureLineDraft {
  readonly schemaVersion: 1;
  readonly signatureId: string;
  readonly width: number;
  readonly height: number;
}

const CANONICAL_SIGNATURE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SIGNATURE_LINE_ATTRS = new Set([
  "schemaVersion",
  "signatureId",
  "suggestedSigner",
  "suggestedSignerTitle",
  "suggestedSignerEmail",
  "signingInstructions",
  "allowComments",
  "showSignDate",
  "width",
  "height",
  "block_id",
  "source",
]);

function hasUnsupportedControlCharacters(
  value: string,
  allowMultiline: boolean,
): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x7f && code <= 0x9f) return true;
    if (code >= 0x20) return false;
    return !(allowMultiline && (character === "\n" || character === "\t"));
  });
}

/** Closed browser-side mirror of the canonical server signature-line shape. */
export function createDocumentSignatureLineAttrs(
  draft: DocumentSignatureLineDraft,
  signatureId: string,
): DocumentSignatureLineAttrs | null {
  if (!CANONICAL_SIGNATURE_ID.test(signatureId)) return null;
  const boundedFields = [
    [draft.suggestedSigner, DOCUMENT_SIGNATURE_LINE_MAX_NAME_CHARS, false],
    [
      draft.suggestedSignerTitle,
      DOCUMENT_SIGNATURE_LINE_MAX_TITLE_CHARS,
      false,
    ],
    [
      draft.suggestedSignerEmail,
      DOCUMENT_SIGNATURE_LINE_MAX_EMAIL_CHARS,
      false,
    ],
    [
      draft.signingInstructions,
      DOCUMENT_SIGNATURE_LINE_MAX_INSTRUCTIONS_CHARS,
      true,
    ],
  ] as const;
  if (
    boundedFields.some(
      ([value, maximum, allowMultiline]) =>
        value.length > maximum ||
        hasUnsupportedControlCharacters(value, allowMultiline),
    )
  ) {
    return null;
  }
  return {
    schemaVersion: DOCUMENT_SIGNATURE_LINE_SCHEMA_VERSION,
    signatureId,
    suggestedSigner: draft.suggestedSigner,
    suggestedSignerTitle: draft.suggestedSignerTitle,
    suggestedSignerEmail: draft.suggestedSignerEmail,
    signingInstructions: draft.signingInstructions,
    allowComments: draft.allowComments,
    showSignDate: draft.showSignDate,
    width: DOCUMENT_SIGNATURE_LINE_DEFAULT_WIDTH,
    height: DOCUMENT_SIGNATURE_LINE_DEFAULT_HEIGHT,
  };
}

/** Strict browser mirror of the canonical unsigned signature-line contract. */
export function normalizeDocumentSignatureLineAttrs(
  value: unknown,
): DocumentSignatureLineAttrs | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const attrs = value as Record<string, unknown>;
  if (Object.keys(attrs).some((key) => !SIGNATURE_LINE_ATTRS.has(key))) {
    return null;
  }
  if (
    attrs.schemaVersion !== DOCUMENT_SIGNATURE_LINE_SCHEMA_VERSION ||
    typeof attrs.signatureId !== "string" ||
    !CANONICAL_SIGNATURE_ID.test(attrs.signatureId) ||
    typeof attrs.suggestedSigner !== "string" ||
    typeof attrs.suggestedSignerTitle !== "string" ||
    typeof attrs.suggestedSignerEmail !== "string" ||
    typeof attrs.signingInstructions !== "string" ||
    typeof attrs.allowComments !== "boolean" ||
    typeof attrs.showSignDate !== "boolean" ||
    !Number.isInteger(attrs.width) ||
    Number(attrs.width) < DOCUMENT_SIGNATURE_LINE_MIN_WIDTH ||
    Number(attrs.width) > DOCUMENT_SIGNATURE_LINE_MAX_WIDTH ||
    !Number.isInteger(attrs.height) ||
    Number(attrs.height) < DOCUMENT_SIGNATURE_LINE_MIN_HEIGHT ||
    Number(attrs.height) > DOCUMENT_SIGNATURE_LINE_MAX_HEIGHT
  ) {
    return null;
  }
  const boundedFields = [
    [attrs.suggestedSigner, DOCUMENT_SIGNATURE_LINE_MAX_NAME_CHARS, false],
    [attrs.suggestedSignerTitle, DOCUMENT_SIGNATURE_LINE_MAX_TITLE_CHARS, false],
    [attrs.suggestedSignerEmail, DOCUMENT_SIGNATURE_LINE_MAX_EMAIL_CHARS, false],
    [
      attrs.signingInstructions,
      DOCUMENT_SIGNATURE_LINE_MAX_INSTRUCTIONS_CHARS,
      true,
    ],
  ] as const;
  if (
    boundedFields.some(
      ([field, maximum, allowMultiline]) =>
        field.length > maximum ||
        hasUnsupportedControlCharacters(field, allowMultiline),
    )
  ) {
    return null;
  }
  const source = attrs.source;
  if (
    source !== null &&
    source !== undefined &&
    (typeof source !== "object" ||
      Array.isArray(source) ||
      ("hasOpaqueSignatureProviderData" in source &&
        typeof (source as Record<string, unknown>)
          .hasOpaqueSignatureProviderData !== "boolean"))
  ) {
    return null;
  }
  const blockId = attrs.block_id;
  if (
    blockId !== null &&
    blockId !== undefined &&
    (typeof blockId !== "string" ||
      blockId.length < 1 ||
      blockId.length > 128 ||
      hasUnsupportedControlCharacters(blockId, false))
  ) {
    return null;
  }
  return {
    schemaVersion: DOCUMENT_SIGNATURE_LINE_SCHEMA_VERSION,
    signatureId: attrs.signatureId,
    suggestedSigner: attrs.suggestedSigner,
    suggestedSignerTitle: attrs.suggestedSignerTitle,
    suggestedSignerEmail: attrs.suggestedSignerEmail,
    signingInstructions: attrs.signingInstructions,
    allowComments: attrs.allowComments,
    showSignDate: attrs.showSignDate,
    width: Number(attrs.width),
    height: Number(attrs.height),
  };
}

export function documentSignatureLineHasOpaqueProviderData(
  value: unknown,
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const source = (value as Record<string, unknown>).source;
  return (
    typeof source === "object" &&
    source !== null &&
    !Array.isArray(source) &&
    (source as Record<string, unknown>).hasOpaqueSignatureProviderData === true
  );
}

const PRESERVED_ATTRS = [
  "schemaVersion",
  "signatureId",
  "suggestedSigner",
  "suggestedSignerTitle",
  "suggestedSignerEmail",
  "signingInstructions",
  "allowComments",
  "showSignDate",
  "width",
  "height",
  "source",
] as const;

function parseJsonAttr(element: HTMLElement): Record<string, unknown> {
  const raw = element.getAttribute("data-signature-line");
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// Selected, the line wears the selection outline pictures, shapes and charts
// wear (OfficeDrawingSelection); its own border never changes, so selecting it
// no longer moves it by a pixel.
const wrapperStyle: CSSProperties = {
  // An inline graphic on its own line: beside a floating picture when it
  // fits, below it otherwise, never drawn over it (Word's wrap).
  display: "flow-root",
  boxSizing: "border-box",
  maxWidth: 360,
  margin: "12px 0",
  padding: "8px 12px 4px",
  border: "1px solid transparent",
  borderRadius: 4,
  color: "var(--foreground)",
  userSelect: "none",
};

function SignatureLineView({ node, selected }: NodeViewProps) {
  const signer =
    typeof node.attrs.suggestedSigner === "string"
      ? node.attrs.suggestedSigner.trim()
      : "";
  const title =
    typeof node.attrs.suggestedSignerTitle === "string"
      ? node.attrs.suggestedSignerTitle.trim()
      : "";
  return (
    <NodeViewWrapper
      as="div"
      data-type="document-signature-line"
      className={officeDrawingSelectionStyles.selectedHost}
      data-selected={selected || undefined}
      contentEditable={false}
      style={wrapperStyle}
    >
      <div
        aria-hidden="true"
        style={{
          fontSize: 24,
          lineHeight: "28px",
          borderBottom: "1.5px solid var(--foreground)",
          paddingBottom: 2,
        }}
      >
        ✗
      </div>
      {signer ? (
        <div style={{ fontSize: 13, marginTop: 4 }}>{signer}</div>
      ) : null}
      {title ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>{title}</div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const DocumentSignatureLine = Node.create({
  name: DOCUMENT_SIGNATURE_LINE_NODE_NAME,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return Object.fromEntries(
      PRESERVED_ATTRS.map((key) => [
        key,
        {
          default: null,
          parseHTML: (element: HTMLElement) =>
            parseJsonAttr(element)[key] ?? null,
          // Attr round-trips through the single JSON blob rendered below.
          renderHTML: () => ({}),
        },
      ]),
    );
  },

  parseHTML() {
    return [{ tag: 'div[data-type="document-signature-line"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const preserved: Record<string, unknown> = {};
    for (const key of PRESERVED_ATTRS) {
      if (node.attrs[key] !== null && node.attrs[key] !== undefined) {
        preserved[key] = node.attrs[key];
      }
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "document-signature-line",
        "data-signature-line": JSON.stringify(preserved),
      }),
      "✗",
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(SignatureLineView);
  },
});
