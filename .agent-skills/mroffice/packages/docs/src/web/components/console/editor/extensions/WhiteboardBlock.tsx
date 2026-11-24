"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ySyncPluginKey, yUndoPluginKey } from "@tiptap/y-tiptap";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import dynamic from "@mrnote/core/host/next/dynamic.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContinuousZoomDial } from "@mrnote/core/web/components/ui/ContinuousZoomDial.tsx";
import {
  ContinuousZoomCrownGlyph,
  ContinuousZoomDialPopover,
} from "@mrnote/core/web/components/ui/ContinuousZoomDialPopover.tsx";
import { apiPost, isApiRequestError } from "@mrnote/core/web/lib/api.ts";
import { IS_DESKTOP_CLASSIC } from "@mrnote/core/web/lib/desktop-classic.ts";
import { prepareWhiteboardObjectEditing } from "@mrnote/core/web/lib/collab/ws-provider.ts";
import { onActivateKey } from "@mrnote/core/web/lib/a11y.ts";
import { useWorkspaceMe } from "@mrnote/core/web/lib/use-workspace-me.ts";
import { pageDocumentJsonEquals } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import {
  commitWhiteboardScene,
  mergeWhiteboardSceneDelta,
  readWhiteboardScene,
  WHITEBOARD_OBJECT_FIELDS,
  WHITEBOARD_OBJECT_NODE,
  type WhiteboardElement,
} from "@mrnote/core/web/components/console/editor/extensions/whiteboardScene.ts";

// ---------------------------------------------------------------------------
// Dynamic Excalidraw import (client-only)
// ---------------------------------------------------------------------------

// MRNote Classic is offline: Excalidraw's fonts (drawn text and exports) come
// from the app (scripts/sync-excalidraw-assets.mjs), not from esm.sh, its
// default. Set before Excalidraw first loads, which reads it per font.
if (IS_DESKTOP_CLASSIC && typeof window !== "undefined") {
  const host = window as Window & { EXCALIDRAW_ASSET_PATH?: string | string[] };
  host.EXCALIDRAW_ASSET_PATH ??= "/excalidraw/";
}

// Its stylesheet comes with it: imported at the top of this module it went
// wherever the editor went, onto pages that show no whiteboard (the home
// page's demo editors), and its arrival restyled the whole page there

const Excalidraw = dynamic(
  async () => (await import("./ExcalidrawWithStyles")).Excalidraw,
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExcalidrawElement {
  [key: string]: unknown;
}

interface ExcalidrawAppState {
  [key: string]: unknown;
}

const WHITEBOARD_ZOOM_MIN = 0.1;
const WHITEBOARD_ZOOM_MAX = 30;
const WHITEBOARD_ZOOM_DEFAULT = 1;

function normalizeWhiteboardZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return WHITEBOARD_ZOOM_DEFAULT;
  }
  return (
    Math.round(
      Math.min(WHITEBOARD_ZOOM_MAX, Math.max(WHITEBOARD_ZOOM_MIN, value)) *
        1_000_000,
    ) / 1_000_000
  );
}

function whiteboardZoomFromAppState(appState: unknown): number {
  if (!appState || typeof appState !== "object") {
    return WHITEBOARD_ZOOM_DEFAULT;
  }
  const zoom = (appState as { zoom?: unknown }).zoom;
  if (!zoom || typeof zoom !== "object") return WHITEBOARD_ZOOM_DEFAULT;
  return normalizeWhiteboardZoom((zoom as { value?: unknown }).value);
}

function whiteboardZoomValueToPosition(
  value: number,
  min: number,
  max: number,
): number {
  const safeMin = Math.max(Number.EPSILON, min);
  const safeMax = Math.max(safeMin, max);
  const safeValue = Math.min(safeMax, Math.max(safeMin, value));
  if (safeMax === safeMin) return 0;
  return Math.log(safeValue / safeMin) / Math.log(safeMax / safeMin);
}

function whiteboardZoomPositionToValue(
  position: number,
  min: number,
  max: number,
): number {
  const safeMin = Math.max(Number.EPSILON, min);
  const safeMax = Math.max(safeMin, max);
  const safePosition = Math.min(1, Math.max(0, position));
  return normalizeWhiteboardZoom(
    safeMin * Math.pow(safeMax / safeMin, safePosition),
  );
}

function formatWhiteboardZoom(value: number): string {
  const percent = Math.round(normalizeWhiteboardZoom(value) * 1_000) / 10;
  return `${percent}%`;
}

/**
 * Extension options. ``getPageId`` is injected by the plugin registry
 * (``WhiteboardBlock.configure({ getPageId: () => pageId })``) so the node
 * view can POST ``{ page_id, elements }`` to the whiteboard-summarize route.
 * Defaults to ``() => null`` when unconfigured (e.g. in isolated tests) — the
 * summarize button stays hidden without a page id.
 */
export interface WhiteboardBlockOptions {
  getPageId: () => string | null;
  /**
   * Guest mode (public marketing demo). When `true` the summarize-to-memory
   * affordance is never rendered, so its `useWorkspaceMe()` / whiteboard-summarize
   * authed calls never fire for an unauthenticated visitor. Defaults to `false`
   * → the authenticated console renders the button exactly as before.
   */
  guestMode: boolean;
}

type SummarizeState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; status: string; summary: string; memoryCount: number }
  | { kind: "error" };

interface WhiteboardSummarizeResponse {
  summary: string;
  memory_count: number;
  status: string;
}

type WhiteboardNodeViewProps = NodeViewProps & {
  node: NodeViewProps["node"] & {
    attrs: {
      elements?: ExcalidrawElement[];
      appState?: ExcalidrawAppState;
      width?: number;
      height?: number;
    };
  };
};

// ---------------------------------------------------------------------------
// Vision render (P3 Stage 4) — export the board to a downscaled PNG for the
// server-side vision-summary heuristic. Best-effort: any failure returns null
// and the POST proceeds text-only (the server silently falls back to text).
// ---------------------------------------------------------------------------

async function renderWhiteboardPngBase64(
  elements: ExcalidrawElement[],
): Promise<{ image_b64: string; image_mime_type: string } | null> {
  try {
    const { exportToBlob } = await import("@excalidraw/excalidraw");
    const blob = await exportToBlob({
      elements: elements as Parameters<typeof exportToBlob>[0]["elements"],
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
      files: null,
      mimeType: "image/png",
      maxWidthOrHeight: 1568, // cap the longest edge so the upload stays small
    });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    return { image_b64: dataUrl.slice(comma + 1), image_mime_type: "image/png" };
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------------------
// Summarize-to-memory button (P3 Stage 1) — self-gating, isolated for testing
// ---------------------------------------------------------------------------

/**
 * Explicit "summarize this whiteboard to memory" affordance. Renders NOTHING
 * unless the global ``enable_whiteboard_memory_v1`` dark-launch flag is ON
 * (surfaced read-only via /workspaces/me) AND a ``pageId`` is available — so a
 * flag-OFF deployment shows no surface at all. On click it POSTs
 * ``{ page_id, elements }`` to the whiteboard-summarize route and renders a
 * 3-state result: ``ok`` (summary + saved-memory count), ``low_content`` (a
 * "too little content" hint), or an error. No auto-extraction — user-triggered.
 */
export function WhiteboardSummarizeButton({
  pageId,
  elements,
}: {
  pageId: string | null;
  elements: ExcalidrawElement[];
}) {
  const t = useTranslations("console-notebooks");
  const { data: workspaceMe } = useWorkspaceMe();
  const enabled = Boolean(
    workspaceMe?.feature_flags?.enable_whiteboard_memory_v1,
  );
  // P3 S4: when the vision flag is ON we render the board to a PNG and attach it
  // so the server's vision heuristic can describe a low-text / label-less board.
  const visionEnabled = Boolean(
    workspaceMe?.feature_flags?.enable_whiteboard_vision_summary_v1,
  );

  const [summarizeState, setSummarizeState] = useState<SummarizeState>({
    kind: "idle",
  });
  const summarizeGenerationRef = useRef(0);
  const activeSummarizeControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const livePageIdRef = useRef(pageId);
  const liveElementsRef = useRef(elements);
  livePageIdRef.current = pageId;
  liveElementsRef.current = elements;

  const retireSummarize = useCallback(() => {
    summarizeGenerationRef.current += 1;
    activeSummarizeControllerRef.current?.abort();
    activeSummarizeControllerRef.current = null;
    setSummarizeState({ kind: "idle" });
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      summarizeGenerationRef.current += 1;
      activeSummarizeControllerRef.current?.abort();
      activeSummarizeControllerRef.current = null;
    };
  }, []);
  useEffect(() => retireSummarize(), [elements, pageId, retireSummarize]);

  const handleSummarize = useCallback(async () => {
    if (!pageId) return;
    activeSummarizeControllerRef.current?.abort();
    const controller = new AbortController();
    const generation = summarizeGenerationRef.current + 1;
    summarizeGenerationRef.current = generation;
    activeSummarizeControllerRef.current = controller;
    const requestedPageId = pageId;
    const requestedElements = elements;
    const operationIsCurrent = () =>
      mountedRef.current &&
      summarizeGenerationRef.current === generation &&
      activeSummarizeControllerRef.current === controller &&
      !controller.signal.aborted &&
      livePageIdRef.current === requestedPageId &&
      liveElementsRef.current === requestedElements;
    setSummarizeState({ kind: "loading" });
    try {
      const body: Record<string, unknown> = { page_id: pageId, elements };
      if (visionEnabled) {
        const png = await renderWhiteboardPngBase64(elements);
        if (!operationIsCurrent()) return;
        if (png) {
          body.image_b64 = png.image_b64;
          body.image_mime_type = png.image_mime_type;
        }
      }
      const res = await apiPost<WhiteboardSummarizeResponse>(
        "/api/v1/ai/notebook/whiteboard-summarize",
        body,
        { signal: controller.signal },
      );
      if (!operationIsCurrent()) return;
      setSummarizeState({
        kind: "result",
        status: res.status || "ok",
        summary: res.summary || "",
        memoryCount: res.memory_count || 0,
      });
    } catch {
      if (operationIsCurrent()) setSummarizeState({ kind: "error" });
    } finally {
      if (activeSummarizeControllerRef.current === controller) {
        activeSummarizeControllerRef.current = null;
      }
    }
  }, [pageId, elements, visionEnabled]);

  const dismissSummary = useCallback(
    () => setSummarizeState({ kind: "idle" }),
    [],
  );

  // OFF (flag) or no page id -> render nothing (the affordance is fully hidden).
  if (!enabled || !pageId) return null;

  const isEmpty = elements.length === 0;

  return (
    <div className="whiteboard-summarize">
      {null}
      {summarizeState.kind === "result" && (
        <div className="whiteboard-summarize-result" role="status">
          {summarizeState.status === "low_content" ? (
            null
          ) : (
            <div className="whiteboard-summarize-ok">
              {null}
              {summarizeState.summary && (
                <p className="whiteboard-summarize-text">
                  {summarizeState.summary}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            className="whiteboard-summarize-dismiss"
            onClick={dismissSummary}
          >
            {t("block.whiteboard.summaryDismiss")}
          </button>
        </div>
      )}
      {summarizeState.kind === "error" && (
        null
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Node View Component
// ---------------------------------------------------------------------------

function WhiteboardBlockView(props: WhiteboardNodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, getPos, node, selected, extension } = props;

  // Injected by the plugin registry via `.configure({ getPageId })`; null in
  // isolated/unconfigured contexts (the summarize button stays hidden without a
  // page id). The flag gate + summarize API call live in the dedicated
  // WhiteboardSummarizeButton below so they can be unit-tested in isolation.
  const getPageId = (extension.options as WhiteboardBlockOptions).getPageId;
  const pageId = typeof getPageId === "function" ? getPageId() : null;
  // Guest demo: never render the summarize-to-memory button so its
  // useWorkspaceMe() (GET /api/v1/workspaces/me) + whiteboard-summarize POST
  // never fire for an unauthenticated visitor. The local Excalidraw canvas
  // stays fully interactive.
  const guestMode = Boolean(
    (extension.options as WhiteboardBlockOptions).guestMode,
  );

  const rawElements = readWhiteboardScene(node);
  const rawAppState = node.attrs.appState;
  const sceneKind = ["canvas", "shapes", "flowchart", "mindmap"].includes(
    String(node.attrs.sceneKind),
  )
    ? String(node.attrs.sceneKind)
    : "canvas";
  const width: number = node.attrs.width || 600;
  const height: number = node.attrs.height || 400;

  // Stabilize elements reference to avoid re-render loops from TipTap attr updates
  const elementsKey = JSON.stringify(rawElements || []);
  const elements: ExcalidrawElement[] = useMemo(
    () => rawElements || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elementsKey],
  );
  const appState: ExcalidrawAppState = rawAppState || {};
  const persistedZoomValue = whiteboardZoomFromAppState(appState);

  const [editing, setEditing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);
  const prepareGeneration = useRef(0);
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const [zoomValue, setZoomValue] = useState(() => persistedZoomValue);
  const [zoomPopoverOpen, setZoomPopoverOpen] = useState(false);
  const [svgPreviewUrl, setSvgPreviewUrl] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewGenerationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<(() => void) | null>(null);
  const editingGestureRef = useRef(false);
  const sceneBaselineRef = useRef<WhiteboardElement[]>(rawElements);
  const pendingSceneRef = useRef<{
    before: WhiteboardElement[]; after: WhiteboardElement[];
  } | null>(null);
  const remoteSceneRef = useRef<WhiteboardElement[] | null>(null);
  const [sceneAuthor] = useState(() => crypto.randomUUID());

  useEffect(() => () => { prepareGeneration.current += 1; }, [editor, pageId]);

  const beginEditing = useCallback(async () => {
    if (preparing || !editable || editor.isDestroyed || !editor.isEditable) return;
    // The explicit public demo has no persistent page or shared-room boundary.
    if (guestMode) { setEditing(true); return; }
    const generation = ++prepareGeneration.current;
    setPreparing(true);
    setCompatibilityError(null);
    try {
      if (!pageId) throw new Error("whiteboard_connection_required");
      const doc = ySyncPluginKey.getState(editor.state)?.doc;
      if (!doc) throw new Error("whiteboard_connection_required");
      await prepareWhiteboardObjectEditing(doc);
      if (generation === prepareGeneration.current && !editor.isDestroyed && editor.isEditable) {
        setEditing(true);
      }
    } catch (error) {
      if (generation === prepareGeneration.current && !editor.isDestroyed) {
        const code = isApiRequestError(error) ? error.code : error instanceof Error ? error.message : null;
        setCompatibilityError(t(code === "page_whiteboard_model_members_pending"
          ? "block.whiteboard.compatibilityPeers"
          : code === "page_whiteboard_model_deployment_pending" || code === "whiteboard_model_upgrade_required"
            ? "block.whiteboard.compatibilityService" : "block.whiteboard.compatibilityConnection"));
      }
    } finally {
      if (generation === prepareGeneration.current) setPreparing(false);
    }
  }, [editor, editable, guestMode, pageId, preparing, t]);

  const flushPendingChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    const commit = pendingCommitRef.current;
    pendingCommitRef.current = null;
    commit?.();
  }, []);

  const finishGesture = useCallback(() => {
    flushPendingChange();
    if (!editor.isDestroyed) yUndoPluginKey.getState(editor.state)?.undoManager?.stopCapturing();
  }, [editor, flushPendingChange]);

  const handlePointerUp = useCallback(() => {
    // Let Excalidraw finish the same pointer event before reading its latest
    // onChange payload. A later payload still owns the normal trailing flush.
    queueMicrotask(finishGesture);
  }, [finishGesture]);

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") finishGesture(); };
    // Capture runs before the page autosave/provider's normal hide handlers,
    // so the final canvas frame reaches their existing final-flush boundary.
    document.addEventListener("visibilitychange", onHidden, true);
    window.addEventListener("pagehide", finishGesture, true);
    return () => {
      document.removeEventListener("visibilitychange", onHidden, true);
      window.removeEventListener("pagehide", finishGesture, true);
    };
  }, [finishGesture]);

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable;
      setEditable(next);
      if (!next) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = null;
        pendingCommitRef.current = null;
        pendingSceneRef.current = null;
        editingGestureRef.current = false;
        setEditing(false);
      }
    };
    editor.on("update", syncEditable);
    editor.on("transaction", syncEditable);
    // NoteEditor changes authority with setEditable(value, false) so a lock
    // transition cannot enqueue a document save. Observe that DOM attribute
    // as well, otherwise this node can stay disabled after authority returns.
    const observer = new MutationObserver(syncEditable);
    if (!editor.isDestroyed) {
      observer.observe(editor.view.dom, { attributes: true, attributeFilter: ["contenteditable"] });
      syncEditable();
    }
    return () => {
      observer.disconnect();
      editor.off("update", syncEditable);
      editor.off("transaction", syncEditable);
    };
  }, [editor]);

  useEffect(() => {
    if (!editing) {
      excalidrawApiRef.current = null;
      setZoomPopoverOpen(false);
    }
  }, [editing]);

  useEffect(() => {
    const pending = pendingSceneRef.current;
    const next = pending
      ? mergeWhiteboardSceneDelta(rawElements, pending.before, pending.after)
      : rawElements;
    const api = excalidrawApiRef.current;
    if (!editing || !api) {
      if (!pending) sceneBaselineRef.current = next;
      return;
    }
    if (pageDocumentJsonEquals(sceneBaselineRef.current, next)) return;
    remoteSceneRef.current = next;
    sceneBaselineRef.current = next;
    // Excalidraw already rebases its personal history against remote changes.
    // A received scene is never captured as the local member's Undo action.
    api.updateScene({ elements: structuredClone(next) as unknown as Parameters<typeof api.updateScene>[0]["elements"], captureUpdate: "NEVER" });
  // elementsKey is the stable content identity; rawElements is decoded above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementsKey, editing]);

  const replacePreviewUrl = useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) {
      window.URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
    setSvgPreviewUrl(nextUrl);
  }, []);

  // ---- Generate SVG preview ------------------------------------------------

  const generatePreview = useCallback(
    async (els: ExcalidrawElement[]) => {
      const generation = previewGenerationRef.current + 1;
      previewGenerationRef.current = generation;
      if (typeof window === "undefined" || els.length === 0) {
        if (previewGenerationRef.current === generation) {
          replacePreviewUrl(null);
        }
        return;
      }
      try {
        const { exportToSvg } = await import("@excalidraw/excalidraw");
        const svg = await exportToSvg({
          elements: els as Parameters<typeof exportToSvg>[0]["elements"],
          appState: {
            exportBackground: true,
            viewBackgroundColor: "#ffffff",
          },
          files: null,
        });
        if (previewGenerationRef.current !== generation) return;
        const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
        replacePreviewUrl(window.URL.createObjectURL(blob));
      } catch {
        if (previewGenerationRef.current === generation) {
          replacePreviewUrl(null);
        }
      }
    },
    [replacePreviewUrl],
  );

  // Re-generate preview when elements change externally (e.g. load from DB)
  useEffect(() => {
    if (!editing) {
      void generatePreview(elements);
    }
    return () => {
      previewGenerationRef.current += 1;
    };
  }, [elements, editing, generatePreview]);

  // ---- Click-outside to exit edit mode -------------------------------------

  useEffect(() => {
    if (!editing) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target;
      const insideZoomPopover =
        target instanceof Element &&
        Boolean(target.closest(".whiteboard-zoom-popover"));
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target as globalThis.Node) &&
        !insideZoomPopover
      ) {
        finishGesture();
        setEditing(false);
      }
    };

    // Use a timeout so the click that enters edit mode doesn't immediately exit
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editing, finishGesture]);

  // ---- Debounced onChange handler -------------------------------------------

  const handleChange = useCallback(
    // Excalidraw's onChange sends (OrderedExcalidrawElement[], AppState, BinaryFiles).
    // We don't depend on its concrete types — accept broadly and narrow inside.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newElements: readonly any[], newAppState: any) => {
      if (!editor.isEditable) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = null;
        pendingCommitRef.current = null;
        pendingSceneRef.current = null;
        editingGestureRef.current = false;
        return;
      }
      setZoomValue(whiteboardZoomFromAppState(newAppState));
      if (remoteSceneRef.current && pageDocumentJsonEquals(remoteSceneRef.current, newElements)) {
        remoteSceneRef.current = null;
        sceneBaselineRef.current = structuredClone(newElements) as WhiteboardElement[];
        return;
      }
      const wasEditingGesture = editingGestureRef.current;
      editingGestureRef.current = Boolean(newAppState.newElement || newAppState.resizingElement ||
        newAppState.isResizing || newAppState.isRotating || newAppState.editingTextElement);
      const savedBackground = (node.attrs.appState as Record<string, unknown> | undefined)?.viewBackgroundColor ?? "#ffffff";
      const viewBackgroundColor = newAppState.viewBackgroundColor ?? "#ffffff";
      // Excalidraw also emits unchanged scenes when React props or local UI
      // state change. Such callbacks must never create a pending local edit:
      // a later peer update would otherwise turn that old baseline into an
      // apparent local drag and republish an intermediate remote position.
      if (pageDocumentJsonEquals(sceneBaselineRef.current, newElements) &&
          viewBackgroundColor === savedBackground) {
        if (wasEditingGesture && !editingGestureRef.current) finishGesture();
        return;
      }
      const canvasBefore = sceneBaselineRef.current;
      const canvasAfter = structuredClone(newElements) as WhiteboardElement[];
      const pending = pendingSceneRef.current;
      if (pending) {
        const known = new Set([...pending.before, ...pending.after].map(element => element.id));
        // A peer may have introduced an object since this local batch began.
        // Add it to both baselines so editing it now is a delta, not a dropped
        // change or an apparent local object creation.
        const peerObjects = canvasBefore.filter(element => !known.has(element.id));
        pendingSceneRef.current = {
          before: [...pending.before, ...peerObjects],
          after: mergeWhiteboardSceneDelta([...pending.after, ...peerObjects], canvasBefore, canvasAfter),
        };
      } else pendingSceneRef.current = { before: canvasBefore, after: canvasAfter };
      // Track what the canvas actually displayed, independently from the
      // accumulated authored delta. Remote overlays may add peer properties
      // to this baseline without making those properties part of our edit.
      sceneBaselineRef.current = canvasAfter;
      pendingCommitRef.current = () => {
        const pending = pendingSceneRef.current;
        pendingSceneRef.current = null;
        if (!pending) return;
        const state = newAppState as Record<string, unknown>;
        const viewBackgroundColor = state.viewBackgroundColor ?? "#ffffff";
        const savedBackground = (node.attrs.appState as Record<string, unknown> | undefined)?.viewBackgroundColor ?? "#ffffff";
        // Pointer/camera/tool-preference updates are local UI state. Compare
        // document fields only, at the flush boundary rather than every frame.
        const merged = commitWhiteboardScene(editor, getPos, node, pending.before, pending.after,
          { before: savedBackground, after: viewBackgroundColor }, sceneAuthor);
        if (merged) {
          const displayed = sceneBaselineRef.current;
          sceneBaselineRef.current = merged;
          if (!pageDocumentJsonEquals(merged, displayed)) {
            remoteSceneRef.current = merged;
            const api = excalidrawApiRef.current;
            api?.updateScene({ elements: structuredClone(merged) as unknown as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["elements"], captureUpdate: "NEVER" });
          }
        }
      };
      if (wasEditingGesture && !editingGestureRef.current) finishGesture();
      else if (debounceRef.current === null) debounceRef.current = setTimeout(flushPendingChange, 32);
    },
    [editor, finishGesture, flushPendingChange, getPos, node, sceneAuthor],
  );

  const applyZoom = useCallback((requestedZoom: number) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const current = api.getAppState();
    const currentZoom = normalizeWhiteboardZoom(current.zoom.value);
    const nextZoom = normalizeWhiteboardZoom(requestedZoom);
    setZoomValue(nextZoom);
    if (Math.abs(currentZoom - nextZoom) <= Number.EPSILON) return;

    const viewportX = current.width / 2 + current.offsetLeft;
    const viewportY = current.height / 2 + current.offsetTop;
    const appLayerX = viewportX - current.offsetLeft;
    const appLayerY = viewportY - current.offsetTop;
    const baseScrollX = current.scrollX + (appLayerX - appLayerX / currentZoom);
    const baseScrollY = current.scrollY + (appLayerY - appLayerY / currentZoom);
    const scrollX = baseScrollX - (appLayerX - appLayerX / nextZoom);
    const scrollY = baseScrollY - (appLayerY - appLayerY / nextZoom);

    api.updateScene({
      appState: {
        scrollX,
        scrollY,
        zoom: { value: nextZoom as typeof current.zoom.value },
        userToFollow: null,
      },
    });
  }, []);

  const bindExcalidrawApi = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawApiRef.current = api;
    setZoomValue(whiteboardZoomFromAppState(api.getAppState()));
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      previewGenerationRef.current += 1;
      // The same live-node/writable guard applies during teardown. A deleted
      // node, destroyed editor or revoked member cannot publish a late edit.
      flushPendingChange();
      if (previewUrlRef.current)
        window.URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [flushPendingChange]);

  // ---- Render --------------------------------------------------------------

  const isEmpty = elements.length === 0;

  return (
    <NodeViewWrapper
      className="whiteboard-wrapper"
      data-selected={selected || undefined}
      data-scene-kind={sceneKind}
    >
      <span className="whiteboard-label">{t("editor.whiteboard_label")}</span>
      <div ref={wrapperRef}>
        {editing ? (
          <div
            className="whiteboard-editor"
            onDragStartCapture={event => {
              // A canvas gesture inside the editable document must not start
              // the browser's HTML drag, which cancels its pointer stream.
              if (event.target instanceof HTMLCanvasElement) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            style={{ width, height: Math.max(height, 400) }}
          >
            {typeof window !== "undefined" && (
              <Excalidraw
                initialData={{
                  elements:
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    structuredClone(elements) as any,
                  appState: {
                    viewBackgroundColor: "#ffffff",
                    ...appState,
                    zoom: { value: zoomValue as AppState["zoom"]["value"] },
                  },
                }}
                excalidrawAPI={bindExcalidrawApi}
                onChange={handleChange}
                onPointerUp={handlePointerUp}
              />
            )}
            <div
              className="whiteboard-zoom-control"
              data-testid="whiteboard-zoom-control"
            >
              <ContinuousZoomDialPopover
                open={zoomPopoverOpen}
                onOpenChange={setZoomPopoverOpen}
                anchorRef={zoomTriggerRef}
                trigger={
                  <button
                    ref={zoomTriggerRef}
                    type="button"
                    className="whiteboard-zoom-trigger"
                    data-testid="whiteboard-zoom-trigger"
                    aria-label={`${t("editor.zoomLabel")}: ${formatWhiteboardZoom(zoomValue)}`}
                    title={t("editor.zoomLabel")}
                  >
                    <ContinuousZoomCrownGlyph
                      position={whiteboardZoomValueToPosition(
                        zoomValue,
                        WHITEBOARD_ZOOM_MIN,
                        WHITEBOARD_ZOOM_MAX,
                      )}
                      valueLabel={formatWhiteboardZoom(zoomValue)}
                      open={zoomPopoverOpen}
                      testId="whiteboard-zoom-crown"
                    />
                  </button>
                }
                label={t("editor.zoomLabel")}
                testIdPrefix="whiteboard"
                side="top"
                align="center"
                className="whiteboard-zoom-popover"
              >
                <ContinuousZoomDial
                  value={zoomValue}
                  min={WHITEBOARD_ZOOM_MIN}
                  max={WHITEBOARD_ZOOM_MAX}
                  defaultValue={WHITEBOARD_ZOOM_DEFAULT}
                  valueToPosition={whiteboardZoomValueToPosition}
                  positionToValue={whiteboardZoomPositionToValue}
                  formatter={formatWhiteboardZoom}
                  ariaValueText={formatWhiteboardZoom}
                  label={t("editor.zoomLabel")}
                  resetLabel={t("editor.zoomReset")}
                  testIdPrefix="whiteboard"
                  onPreview={applyZoom}
                  onChange={applyZoom}
                  onCommit={applyZoom}
                />
              </ContinuousZoomDialPopover>
            </div>
          </div>
        ) : (
          <div
            className="whiteboard-preview"
            data-testid="whiteboard-preview"
            style={{ width, minHeight: 200 }}
            onClick={() => { void beginEditing(); }}
            onKeyDown={event => { onActivateKey(() => { void beginEditing(); })(event); }}
            aria-disabled={!editable || preparing}
            aria-busy={preparing}
            role="button"
            tabIndex={editable ? 0 : -1}
            title={t("block.whiteboard.clickEdit")}
          >
            {compatibilityError && <span role="status">{compatibilityError}</span>}
            {isEmpty ? (
              <span className="whiteboard-preview-empty">{t("block.whiteboard.emptyHint")}</span>
            ) : svgPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="whiteboard-preview-svg"
                src={svgPreviewUrl}
                alt={t("block.whiteboard.previewAlt")}
              />
            ) : (
              <span className="whiteboard-preview-empty">{t("block.whiteboard.loadingPreview")}</span>
            )}
          </div>
        )}
      </div>
      {!editing && !guestMode && (
        <WhiteboardSummarizeButton pageId={pageId} elements={elements} />
      )}
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

function readWhiteboardHtmlScene(element: HTMLElement): {
  elements: WhiteboardElement[]; appState: Record<string, unknown>;
} | null {
  const encoded = element.getAttribute("data-whiteboard-scene");
  try {
    const legacy = element.getAttribute("elements");
    const value = encoded !== null ? JSON.parse(encoded)
      : { elements: legacy ? JSON.parse(legacy) : [], appState: {} };
    const elements = readWhiteboardScene({ attrs: { elements: value.elements } });
    return { elements, appState: value.appState && typeof value.appState === "object" && !Array.isArray(value.appState)
      ? value.appState : {} };
  } catch {
    return null;
  }
}

const WhiteboardBlock = Node.create<WhiteboardBlockOptions>({
  name: "whiteboard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  content: `${WHITEBOARD_OBJECT_NODE}*`,

  addExtensions() {
    return [Node.create({
      name: WHITEBOARD_OBJECT_NODE,
      atom: true,
      selectable: false,
      addAttributes() {
        return Object.fromEntries(["id", ...WHITEBOARD_OBJECT_FIELDS, "extraFields"]
          .map(key => [key, { default: key === "id" ? "" : null, rendered: false }]));
      },
      parseHTML: () => [],
      renderHTML: () => ["span", { "data-whiteboard-object": "" }],
    })];
  },

  addOptions() {
    return {
      getPageId: () => null,
      guestMode: false,
    };
  },

  addAttributes() {
    return {
      block_id: { default: null },
      elements: { default: [], rendered: false,
        parseHTML: element => readWhiteboardHtmlScene(element)?.elements ?? [] },
      appState: { default: {}, rendered: false,
        parseHTML: element => readWhiteboardHtmlScene(element)?.appState ?? {} },
      // The editing engine is shared, but Shapes / Flowchart / Mind-map are
      // distinct document intents and must survive persistence as such.
      sceneKind: { default: "canvas", parseHTML: element => element.getAttribute("data-scene-kind") ?? "canvas" },
      width: { default: 600, parseHTML: element => Number(element.getAttribute("width")) || 600 },
      height: { default: 400, parseHTML: element => Number(element.getAttribute("height")) || 400 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="whiteboard"]', getAttrs: element =>
      readWhiteboardHtmlScene(element as HTMLElement) ? {} : false }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "whiteboard",
        "data-scene-kind": HTMLAttributes.sceneKind || "canvas",
        "data-whiteboard-scene": JSON.stringify({ elements: readWhiteboardScene(node), appState: node.attrs.appState }),
      }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(WhiteboardBlockView);
  },
});

export default WhiteboardBlock;
