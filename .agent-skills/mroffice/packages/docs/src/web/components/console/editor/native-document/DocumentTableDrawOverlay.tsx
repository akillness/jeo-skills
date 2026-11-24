"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  hitTestTableBorderEdge,
  hitTestTableCellInterior,
  resolveTableBorderPenSplit,
  type TableBorderCellBox,
  type TableBorderEdgeHit,
} from "@mrnote/slides/web/lib/presentation-table-border-pen.ts";

import {
  captureDocumentTableDrawTarget,
  commitDocumentTableDrawDiagonal,
  commitDocumentTableDrawEdge,
  commitDocumentTableDrawSplit,
  commitNestedDocumentTable,
  documentTableNestedDrawDisabledReason,
  commitOuterDocumentTable,
  type DocumentTableDrawMode,
  type DocumentTableDrawTarget,
} from "./documentTableDraw";
import type { DocumentTableBorderPen } from "@mrnote/core/web/components/console/editor/native-document/tableBorders.ts";

type Point = { x: number; y: number };

type PendingGesture = {
  readonly pointerId: number;
  readonly start: Point;
  readonly target: DocumentTableDrawTarget | null;
  readonly startCell: TableBorderCellBox | null;
  readonly boxes: readonly TableBorderCellBox[];
  readonly insertionPos: number | null;
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
};

type Preview = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "edge" | "split" | "diagonal" | "rectangle";
};

export interface DocumentTableDrawOverlayProps {
  readonly editor: Editor;
  readonly mode: DocumentTableDrawMode | null;
  readonly pen?: DocumentTableBorderPen;
  readonly onModeChange: (mode: DocumentTableDrawMode | null) => void;
  readonly isChineseLocale: boolean;
}

function measuredCells(table: HTMLTableElement): TableBorderCellBox[] {
  const result: TableBorderCellBox[] = [];
  Array.from(table.rows).forEach((row, rowIndex) => {
    Array.from(row.cells).forEach((cell, colIndex) => {
      const rect = cell.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      result.push({
        row: rowIndex,
        col: colIndex,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    });
  });
  return result;
}

function rectangle(from: Point, to: Point): Preview {
  return {
    left: Math.min(from.x, to.x),
    top: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
    kind: "rectangle",
  };
}

function edgePreview(hit: TableBorderEdgeHit): Preview {
  return {
    left: hit.left,
    top: hit.top,
    width: hit.width,
    height: hit.height,
    kind: "edge",
  };
}

function cornerDistance(point: Point, x: number, y: number): number {
  return Math.hypot(point.x - x, point.y - y);
}

function diagonalForGesture(
  box: TableBorderCellBox,
  from: Point,
  to: Point,
): "diagonalDown" | "diagonalUp" | null {
  const tolerance = Math.min(
    16,
    Math.max(8, Math.min(box.width, box.height) / 4),
  );
  const left = box.left;
  const right = box.left + box.width;
  const top = box.top;
  const bottom = box.top + box.height;
  const down =
    (cornerDistance(from, left, top) <= tolerance &&
      cornerDistance(to, right, bottom) <= tolerance) ||
    (cornerDistance(to, left, top) <= tolerance &&
      cornerDistance(from, right, bottom) <= tolerance);
  if (down) return "diagonalDown";
  const up =
    (cornerDistance(from, right, top) <= tolerance &&
      cornerDistance(to, left, bottom) <= tolerance) ||
    (cornerDistance(to, right, top) <= tolerance &&
      cornerDistance(from, left, bottom) <= tolerance);
  return up ? "diagonalUp" : null;
}

function previewForGesture(
  gesture: PendingGesture,
  point: Point,
  mode: DocumentTableDrawMode,
): Preview | null {
  if (!gesture.target || !gesture.startCell) {
    if (mode !== "draw") return null;
    const box = rectangle(gesture.start, point);
    return box.width >= 4 && box.height >= 4 ? box : null;
  }
  const edge = hitTestTableBorderEdge(gesture.boxes, point);
  if (edge) return edgePreview(edge);
  if (mode !== "draw") return null;
  const endCell = hitTestTableCellInterior(gesture.boxes, point);
  if (
    !endCell ||
    endCell.row !== gesture.startCell.row ||
    endCell.col !== gesture.startCell.col
  ) {
    return null;
  }
  const diagonal = diagonalForGesture(gesture.startCell, gesture.start, point);
  if (diagonal) {
    return {
      ...rectangle(gesture.start, point),
      kind: "diagonal",
    };
  }
  const split = resolveTableBorderPenSplit(
    gesture.startCell,
    gesture.start,
    point,
  );
  if (
    split &&
    (Math.abs(point.x - gesture.start.x) < 16 ||
      Math.abs(point.y - gesture.start.y) < 16)
  ) {
    return { ...split, kind: "split" };
  }
  const box = rectangle(gesture.start, point);
  return box.width >= 16 && box.height >= 16 ? box : null;
}

export function DocumentTableDrawOverlay({
  editor,
  mode,
  pen,
  onModeChange,
}: DocumentTableDrawOverlayProps) {
  const t = useTranslations("console-notebooks");
  const pendingRef = useRef<PendingGesture | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!mode || editor.isDestroyed) {
      pendingRef.current = null;
      const reset = window.setTimeout(() => setPreview(null), 0);
      return () => window.clearTimeout(reset);
    }
    const root = editor.view.dom;
    const label =
      mode === "draw"
        ? t("toolbar.tableDrawOverlay.drawTable")
        : mode === "paint"
          ? t("toolbar.tableDrawOverlay.borderPainterSelectTableEdge")
          : t("toolbar.tableDrawOverlay.eraseTableBoundary");
    const cancel = () => {
      pendingRef.current = null;
      setPreview(null);
    };
    // Say what the pointer does now, before the first click (Word changes
    // the pointer to the pen; Border Painter is often turned on by picking
    // a line style or colour, with nothing else on screen changing).
    const announce = window.setTimeout(
      () => setStatus(t("toolbar.tableDrawOverlay.escToStop", { label })),
      0,
    );
    root.setAttribute("data-table-draw-mode", mode);
    const retireIfReadOnly = () => {
      if (editor.isEditable) return;
      cancel();
      onModeChange(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false || !editor.isEditable)
        return;
      const origin = event.target instanceof Element ? event.target : null;
      const cell = origin?.closest("td,th") as HTMLElement | null;
      const table = cell?.closest("table") as HTMLTableElement | null;
      const target = cell ? captureDocumentTableDrawTarget(editor, cell) : null;
      const boxes = table && target ? measuredCells(table) : [];
      const start = { x: event.clientX, y: event.clientY };
      const startCell = target ? hitTestTableCellInterior(boxes, start) : null;
      let insertionPos: number | null = null;
      if (!target) {
        const found = editor.view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        insertionPos = found?.pos ?? null;
      }
      if (!target && mode !== "draw") {
        // Border Painter and the eraser work on a table; a click anywhere
        // else puts them away and goes through as an ordinary click.
        cancel();
        onModeChange(null);
        return;
      }
      if (!target && insertionPos === null) return;
      pendingRef.current = {
        pointerId: event.pointerId,
        start,
        target,
        startCell,
        boxes,
        insertionPos,
        doc: editor.state.doc,
        selection: editor.state.selection,
      };
      setStatus(label);
      setPreview(previewForGesture(pendingRef.current, start, mode));
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerMove = (event: PointerEvent) => {
      const gesture = pendingRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (
        !editor.isEditable ||
        editor.state.doc !== gesture.doc ||
        editor.state.selection !== gesture.selection
      ) {
        cancel();
        if (!editor.isEditable) onModeChange(null);
        return;
      }
      const nextPreview = previewForGesture(
        gesture,
        { x: event.clientX, y: event.clientY },
        mode,
      );
      if (
        nextPreview?.kind === "rectangle" &&
        gesture.target &&
        documentTableNestedDrawDisabledReason(gesture.target)
      ) {
        setPreview(null);
        setStatus(t("toolbar.tableDrawOverlay.nestedDrawUnavailable"));
      } else {
        setPreview(nextPreview);
      }
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      const gesture = pendingRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const point = { x: event.clientX, y: event.clientY };
      pendingRef.current = null;
      setPreview(null);
      if (
        !editor.isEditable ||
        editor.state.doc !== gesture.doc ||
        editor.state.selection !== gesture.selection
      ) {
        if (!editor.isEditable) onModeChange(null);
        event.preventDefault();
        return;
      }
      let result: "applied" | "invalid" | "stale" = "invalid";
      if (!gesture.target || !gesture.startCell) {
        const box = rectangle(gesture.start, point);
        if (
          mode === "draw" &&
          box.width >= 20 &&
          box.height >= 20 &&
          gesture.insertionPos !== null
        ) {
          result = commitOuterDocumentTable(
            editor,
            {
              doc: gesture.doc,
              selection: gesture.selection,
              position: gesture.insertionPos,
            },
            pen,
          );
        }
      } else {
        const edge = hitTestTableBorderEdge(gesture.boxes, point);
        if (edge) {
          result = commitDocumentTableDrawEdge(
            editor,
            gesture.target,
            edge,
            mode,
            pen,
          );
        } else if (mode === "draw") {
          const endCell = hitTestTableCellInterior(gesture.boxes, point);
          if (
            endCell &&
            endCell.row === gesture.startCell.row &&
            endCell.col === gesture.startCell.col
          ) {
            const diagonal = diagonalForGesture(
              gesture.startCell,
              gesture.start,
              point,
            );
            const split = resolveTableBorderPenSplit(
              gesture.startCell,
              gesture.start,
              point,
            );
            const box = rectangle(gesture.start, point);
            if (diagonal) {
              result = commitDocumentTableDrawDiagonal(
                editor,
                gesture.target,
                diagonal,
                pen,
              );
            } else if (split && (box.width < 16 || box.height < 16)) {
              result = commitDocumentTableDrawSplit(
                editor,
                gesture.target,
                split.axis,
                pen,
              );
            } else if (box.width >= 16 && box.height >= 16) {
              if (documentTableNestedDrawDisabledReason(gesture.target)) {
                setStatus(
                  t("toolbar.tableDrawOverlay.nestedDrawUnavailableOtherTools"),
                );
                event.preventDefault();
                return;
              }
              result = commitNestedDocumentTable(editor, gesture.target, pen);
            }
          }
        }
      }
      setStatus(
        result === "applied"
          ? t("toolbar.tableDrawOverlay.tableUpdated")
          : t("toolbar.tableDrawOverlay.gestureCannotSafelyModifyTable"),
      );
      event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancel();
      onModeChange(null);
      event.preventDefault();
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    editor.on("update", retireIfReadOnly);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(announce);
      root.removeAttribute("data-table-draw-mode");
      root.removeEventListener("pointerdown", onPointerDown, true);
      editor.off("update", retireIfReadOnly);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [editor, mode, onModeChange, pen, t]);

  if (!mode || typeof document === "undefined") return null;
  const coarsePointer = Boolean(
    window.matchMedia?.("(any-pointer: coarse)").matches,
  );
  return createPortal(
    <>
      {preview ? (
        <div
          aria-hidden="true"
          data-testid="document-table-draw-preview"
          data-preview-kind={preview.kind}
          style={{
            position: "fixed",
            zIndex: 1600,
            pointerEvents: "none",
            left: preview.left,
            top: preview.top,
            width: Math.max(preview.width, 3),
            height: Math.max(preview.height, 3),
            border:
              preview.kind === "rectangle" ? "2px dashed #0f766e" : "none",
            background:
              preview.kind === "rectangle"
                ? "rgba(15, 118, 110, 0.08)"
                : "#0f766e",
            transform:
              preview.kind === "diagonal"
                ? `rotate(${Math.atan2(preview.height, preview.width) * (180 / Math.PI)}deg)`
                : undefined,
            transformOrigin: "left top",
          }}
        />
      ) : null}
      <div
        style={{
          position: "fixed",
          zIndex: 1601,
          pointerEvents: "none",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          maxWidth: "min(560px, calc(100vw - 32px))",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          role="status"
          aria-live="polite"
          data-testid="document-table-draw-status"
          style={{
            border: "1px solid rgba(15, 118, 110, 0.3)",
            borderRadius: 999,
            background: "rgba(240, 253, 250, 0.98)",
            color: "#134e4a",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.14)",
            padding: status ? "8px 14px" : 0,
            fontSize: 13,
            lineHeight: 1.4,
            opacity: status ? 1 : 0,
          }}
        >
          {status}
        </span>
        {/* A finger has no Esc, and the menu item only turns the mode on:
            on a touch screen the mode is put away here. */}
        {coarsePointer ? (
          <button
            type="button"
            data-testid="document-table-draw-done"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              pendingRef.current = null;
              setPreview(null);
              onModeChange(null);
            }}
            style={{
              pointerEvents: "auto",
              flex: "0 0 auto",
              minHeight: 44,
              padding: "0 18px",
              border: "none",
              borderRadius: 999,
              background: "#0f766e",
              color: "#ffffff",
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t("toolbar.touchMultiSelectDone")}
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
