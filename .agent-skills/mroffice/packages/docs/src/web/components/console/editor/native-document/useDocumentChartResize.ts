"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { NodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ResizeHandle } from "@mrnote/core/web/lib/presentation-drag.ts";
import { CHART_HOST_EMU_PER_PX, MAX_DOCUMENT_CHART_EMU, documentChartSize, normalizeDocumentChartHost } from "@mrnote/core/web/components/console/editor/extensions/documentChartHost.ts";
import { documentViewScale, resizeDocumentObject } from "@mrnote/core/web/components/console/editor/native-document/documentObjectResize.ts";
import { tryCapturePointer } from "@mrnote/core/web/components/console/editor/native-document/pointerCapture.ts";

/** A Docs chart keeps Word's anchored flow; only its existing native extent is written. */
export function useDocumentChartResize(
  { editor, node, getPos, selected }: Pick<NodeViewProps, "editor" | "node" | "getPos" | "selected">,
  element: RefObject<HTMLDivElement | null>,
  editable: boolean,
) {
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), [editor, node, selected, editable]);

  return (handle: ResizeHandle, event: ReactPointerEvent<HTMLElement>) => {
    const root = element.current, position = getPos();
    if (!root || !editable || !editor.isEditable || editor.isDestroyed || event.button !== 0 || typeof position !== "number") return;
    const original = editor.state.doc.nodeAt(position);
    if (original?.type !== node.type || original !== node) return;
    cancelRef.current?.();
    let host, size;
    try { host = normalizeDocumentChartHost(original.attrs.documentChart);size = documentChartSize(original.attrs); }
    catch { return; }
    const scale = documentViewScale(editor.view.dom);
    const bounds = root.getBoundingClientRect();
    size ??= { widthEmu: Math.round(bounds.width / scale.scaleX * CHART_HOST_EMU_PER_PX), heightEmu: Math.round(bounds.height / scale.scaleY * CHART_HOST_EMU_PER_PX) };
    if (size.widthEmu <= 0 || size.heightEmu <= 0) return;
    const base = { left: 0, top: 0, width: size.widthEmu, height: size.heightEmu };
    let next = base, active = true;
    const startX = event.clientX, startY = event.clientY, pointer = event.pointerId, target = event.currentTarget;
    const canvas = root.querySelector<HTMLElement>("[data-chart-canvas-host]");
    const shell = root.querySelector<HTMLElement>(".chart-block-v2__canvas-shell");
    const originalStyles = { width: root.style.width, height: root.style.height, canvas: canvas?.style.height, shell: shell?.style.minHeight };
    const restore = () => {
      root.style.width = originalStyles.width;root.style.height = originalStyles.height;
      if (canvas) canvas.style.height = originalStyles.canvas ?? "";
      if (shell) shell.style.minHeight = originalStyles.shell ?? "";
    };
    const current = () => !editor.isDestroyed && editor.isEditable && getPos() === position && editor.state.doc.nodeAt(position) === original;
    const cleanup = () => {
      if (!active) return;active = false;
      window.removeEventListener("pointermove", move);window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);window.removeEventListener("keydown", key, true);
      if (target.hasPointerCapture?.(pointer)) target.releasePointerCapture(pointer);
      cancelRef.current = null;
    };
    const cancel = () => { cleanup();restore(); };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      if (!current()) { cancel();return; }
      next = resizeDocumentObject(base, handle, e.clientX - startX, e.clientY - startY,
        { ...scale, emuPerPx: CHART_HOST_EMU_PER_PX, min: 32 * CHART_HOST_EMU_PER_PX, max: MAX_DOCUMENT_CHART_EMU, lockAspect: e.shiftKey });
      root.style.width = `${next.width / CHART_HOST_EMU_PER_PX}px`;root.style.height = `${next.height / CHART_HOST_EMU_PER_PX}px`;
      if (canvas) canvas.style.height = root.style.height;
      if (shell) shell.style.minHeight = root.style.height;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      cleanup();restore();
      if (!current() || (next.width === base.width && next.height === base.height)) return;
      const documentChart = normalizeDocumentChartHost({ ...host, version: 1, size: { widthEmu: next.width, heightEmu: next.height } });
      const tr = closeHistory(editor.state.tr).setNodeMarkup(position, undefined, { ...original.attrs, documentChart });
      tr.setSelection(NodeSelection.create(tr.doc, position));
      yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing();
      editor.view.dispatch(tr);editor.view.focus();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault();e.stopPropagation();cancel(); } };
    event.preventDefault();event.stopPropagation();
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
    tryCapturePointer(target, pointer);
    window.addEventListener("pointermove", move);window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);window.addEventListener("keydown", key, true);
    cancelRef.current = cancel;
  };
}
