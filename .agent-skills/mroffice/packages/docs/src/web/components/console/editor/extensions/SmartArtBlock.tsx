"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { subscribeEditorSurfaceEditable } from "@mrnote/core/web/components/console/editor/useEditorSurfaceEditable.ts";
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { updateCurrentNodeViewAttributes } from "./nodeViewWriteAuthority";

import { OfficeSmartArtSeedPreview } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtSeedPreview.tsx";
import {
  canonicalSmartArtKind,
  canonicalSmartArtLayoutId,
  officeSmartArtLayout,
} from "@mrnote/core/web/lib/office-smartart/catalog.ts";
import {
  legacySmartArtSceneKey,
  legacySmartArtSceneRequest,
  storedLegacySmartArtScene,
} from "@mrnote/core/web/lib/office-smartart/legacy-scene.ts";
import {
  smartArtNodesWithOwnIds,
  useSmartArtPreviewResult,
} from "@mrnote/core/web/lib/office-smartart/remote-previews.ts";
import { MAX_SMARTART_OUTLINE_LEVEL } from "@mrnote/core/web/lib/office-smartart/model.ts";
import {
  DOCUMENT_SMARTART_FRAME_EMU,
  DOCUMENT_SMARTART_STYLE,
} from "@mrnote/core/web/lib/office-smartart/document-shapes-model.ts";

// ---------------------------------------------------------------------------
// Shared types + bounds (mirror the server's fail-closed write validation)
// ---------------------------------------------------------------------------

/** Layout ids live in the shared catalog (lib/office-smartart/catalog.ts). */
export type SmartArtLayout = string;

/** One outline item: its text, and the depth its "> " prefixes encoded. */
export interface SmartArtItem {
  text: string;
  depth: number;
}

export const MAX_SMART_ART_ITEMS = 100;
export const MAX_SMART_ART_TEXT_CHARS = 200;
export const MAX_SMART_ART_ALT_TEXT_CHARS = 200;
export const DOCUMENT_SMARTART_EDIT_ITEMS_EVENT =
  "mrnote:document-smartart-edit-items";

export interface DocumentSmartArtEditItemsEventDetail {
  readonly position: number;
  readonly node: NodeViewProps["node"];
  readonly returnFocus?: HTMLElement | null;
}

export function isSmartArtLayout(value: unknown): value is SmartArtLayout {
  return officeSmartArtLayout(value) !== null;
}

export function sanitizeSmartArtItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_SMART_ART_ITEMS)
    .map((item) =>
      typeof item === "string" ? item.slice(0, MAX_SMART_ART_TEXT_CHARS) : "",
    );
}

export function sanitizeSmartArtAltText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SMART_ART_ALT_TEXT_CHARS);
}

/**
 * Items encode hierarchy depth with leading "> " prefixes (one per level):
 * `["总纲", "> 分支", "> > 细项"]` is a root with a child and a grandchild.
 * Non-hierarchical layouts ignore the depth and render the stripped text.
 */
export function parseSmartArtItems(items: string[]): SmartArtItem[] {
  return items.map((item) => {
    let text = item.trim();
    let depth = 0;
    while (text.startsWith("> ")) {
      depth += 1;
      text = text.slice(2).trim();
    }
    return { text, depth };
  });
}

// ---------------------------------------------------------------------------
// Renderer — the shared engine scene, exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Outline levels the engine accepts: the first item is always the root, and an
 * item may only go one level deeper than the one before it. Persisted items and
 * a native Word import both encode depth with "> " prefixes that were never
 * validated against that rule, so clamp rather than refuse — a diagram whose
 * prefixes drift must still open.
 */
export function smartArtOutlineLevels(items: readonly SmartArtItem[]): number[] {
  const levels: number[] = [];
  for (const item of items) {
    const previous = levels.length === 0 ? -1 : levels[levels.length - 1];
    levels.push(
      Math.max(
        0,
        Math.min(item.depth, MAX_SMARTART_OUTLINE_LEVEL, previous + 1),
      ),
    );
  }
  return levels;
}

/**
 * Draw a persisted diagram with the SHARED SmartArt engine, the same scene
 * Presentation and the worksheet render and the same one Docs materialises as
 * native shapes when a NEW diagram is inserted. This block stays only as the
 * container for diagrams that already exist: legacy `smartArt` nodes and the
 * text-editable projection of a native Word diagram.
 */
/** What a legacy block draws from: its kind, item texts, levels and scene key. */
export function legacySmartArtSceneSource(layout: unknown, items: unknown) {
  const layoutId = canonicalSmartArtLayoutId(
    isSmartArtLayout(layout) ? layout : "basic-list",
  ) ?? "basic-list";
  const parsed = parseSmartArtItems(sanitizeSmartArtItems(items)).filter(
    (item) => item.text.length > 0,
  );
  const safeItems: SmartArtItem[] =
    parsed.length > 0 ? parsed : [{ text: " ", depth: 0 }];
  const texts = safeItems.map((item) => item.text);
  const levels = smartArtOutlineLevels(safeItems);
  const kind = canonicalSmartArtKind(layoutId);
  return {
    layoutId,
    kind,
    texts,
    levels,
    key: kind ? legacySmartArtSceneKey(kind, texts, levels) : null,
  };
}

export function SmartArtSvg({
  layout,
  items,
  fitContainer = false,
  altText = "",
  scene,
  unavailableLabel,
}: {
  layout: SmartArtLayout;
  items: string[];
  fitContainer?: boolean;
  altText?: string;
  /**
   * The block's stored drawing (`attrs.scene`, lib/office-smartart/legacy-scene.ts).
   * When it is current it is drawn as is and nothing is asked; otherwise the
   * server is asked, and nothing in the document changes.
   */
  scene?: unknown;
  /** Shown over the empty frame when the drawing could not be asked. */
  unavailableLabel?: string;
}) {
  const prefix = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const source = legacySmartArtSceneSource(layout, items);
  const { layoutId, kind, texts, levels, key } = source;
  const stored = useMemo(() => {
    const nodes = key ? storedLegacySmartArtScene(scene, key) : null;
    return nodes ? smartArtNodesWithOwnIds(nodes, prefix) : null;
  }, [key, prefix, scene]);
  const served = useSmartArtPreviewResult(
    kind && !stored ? legacySmartArtSceneRequest(kind, texts, levels) : null,
    prefix,
  );
  const unavailable = !stored && !served.nodes && served.failed;
  const accessibleText = sanitizeSmartArtAltText(altText);
  return (
    <div
      role="img"
      aria-label={accessibleText || undefined}
      data-testid="smart-art-svg"
      data-layout={layout}
      data-canonical-layout={layoutId}
      data-fit-container={fitContainer}
      data-smartart-scene={stored ? "stored" : served.nodes ? "served" : unavailable ? "unavailable" : "pending"}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${DOCUMENT_SMARTART_FRAME_EMU.width} / ${DOCUMENT_SMARTART_FRAME_EMU.height}`,
        display: "block",
        ...(fitContainer ? { height: "100%" } : {}),
      }}
    >
      <OfficeSmartArtSeedPreview
        layoutId={layoutId}
        items={texts}
        levels={levels}
        bounds={DOCUMENT_SMARTART_FRAME_EMU}
        style={DOCUMENT_SMARTART_STYLE}
        nodes={stored ?? served.nodes}
      />
      {unavailable && unavailableLabel ? (
        <p
          data-testid="smart-art-unavailable"
          style={{
            position: "absolute",
            inset: 0,
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: "#64748b",
          }}
        >
          {unavailableLabel}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node view
// ---------------------------------------------------------------------------

function SmartArtBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const itemsHintId = useId();
  const { editor, getPos, node, selected } = props;
  const attrs = node.attrs as {
    layout?: unknown;
    items?: unknown;
    altText?: unknown;
    scene?: unknown;
  };
  const layout: SmartArtLayout = isSmartArtLayout(attrs.layout)
    ? attrs.layout
    : "basic-list";
  const items = sanitizeSmartArtItems(attrs.items);
  const altText = sanitizeSmartArtAltText(attrs.altText);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );

  const openEditor = useCallback(
    (returnFocus?: HTMLElement | null) => {
      if (!editable || !editor.isEditable) return;
      returnFocusRef.current = returnFocus ?? null;
      setDraft(items.join("\n"));
      setEditing(true);
    },
    [editable, editor, items],
  );

  const cancelEditor = useCallback(() => {
    setDraft("");
    setEditing(false);
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    requestAnimationFrame(() => {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else if (!editor.isDestroyed) editor.view.focus();
    });
  }, [editor]);

  useEffect(() => {
    const onEditItems = (event: Event) => {
      const detail = (
        event as CustomEvent<DocumentSmartArtEditItemsEventDetail>
      ).detail;
      if (!detail || detail.node !== node) return;
      const position = getPos();
      if (
        typeof position !== "number" ||
        detail.position !== position ||
        editor.state.doc.nodeAt(position) !== node
      ) {
        return;
      }
      openEditor(detail.returnFocus);
    };
    window.addEventListener(DOCUMENT_SMARTART_EDIT_ITEMS_EVENT, onEditItems);
    return () =>
      window.removeEventListener(
        DOCUMENT_SMARTART_EDIT_ITEMS_EVENT,
        onEditItems,
      );
  }, [editor, getPos, node, openEditor]);

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable;
      setEditable(next);
      if (!next) cancelEditor();
    };
    const unsubscribe = subscribeEditorSurfaceEditable(editor, syncEditable);
    return () => {
      unsubscribe();
    };
  }, [cancelEditor, editor]);

  const applyEditor = useCallback(() => {
    const nextItems = sanitizeSmartArtItems(
      draft.split("\n").filter((line) => line.trim().length > 0),
    );
    const changed = updateCurrentNodeViewAttributes(
      editor,
      getPos,
      node,
      "smartArt",
      { items: nextItems },
    );
    if (changed) {
      setEditing(false);
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected)
          returnFocus.focus({ preventScroll: true });
        else if (!editor.isDestroyed) editor.view.focus();
      });
    }
  }, [draft, editor, getPos, node]);

  return (
    <NodeViewWrapper
      className="smart-art-block-wrapper"
      data-testid="smart-art-block"
      data-selected={selected || undefined}
      style={{
        // Beside a floating picture when it fits, below it otherwise; never
        // drawn over it (Word wraps an inline graphic the same way).
        display: "flow-root",
        border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 12,
        margin: "8px 0",
        background: "#ffffff",
      }}
    >
      <SmartArtSvg
        layout={layout}
        items={items}
        altText={altText}
        scene={attrs.scene}
        unavailableLabel={t(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "engineHost.needsConnection"
            : "engineHost.failed",
        )}
      />
      {editing ? (
        <div
          className="smart-art-block__editor"
          data-testid="smart-art-editor"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            cancelEditor();
          }}
        >
          <textarea
            rows={Math.min(10, Math.max(4, items.length + 1))}
            value={draft}
            style={{ width: "100%" }}
            data-testid="smart-art-editor-textarea"
            aria-label={t("block.smartart.itemsLabel")}
            aria-describedby={itemsHintId}
            disabled={!editable}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
          />
          <p id={itemsHintId} style={{ fontSize: 12, color: "#64748b", margin: "4px 0" }}>
            {t("block.smartart.itemsHint")}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              data-testid="smart-art-editor-cancel"
              onClick={cancelEditor}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              data-testid="smart-art-editor-apply"
              disabled={!editable}
              onClick={applyEditor}
            >
              {t("block.smartart.done")}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "right" }}>
          <button
            type="button"
            className="smart-art-block__edit"
            data-testid="smart-art-edit-items"
            disabled={!editable}
            onClick={(event) => openEditor(event.currentTarget)}
          >
            {t("block.smartart.editItems")}
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

const SmartArtBlock = Node.create({
  name: "smartArt",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      layout: { default: "basic-list" },
      items: { default: ["项目 1", "项目 2", "项目 3"] },
      altText: { default: "" },
      // The drawing the server laid out for this block, stored once by the
      // editor (`smartArtLegacyScene.ts`) so later openings draw with no
      // request. Derived data: not rendered to HTML, not part of Markdown.
      scene: { default: null, rendered: false, parseHTML: () => null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="smartArt"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "smartArt" }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(SmartArtBlockView);
  },
});

export default SmartArtBlock;
