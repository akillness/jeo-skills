"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Trash2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";

import {
  moveBox,
  resizeBox,
  RESIZE_HANDLES,
  type BoxRect,
  type ResizeHandle,
} from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";

import { useObjectDragTouchGuards } from "@mrnote/core/web/lib/object-drag-gesture.ts";

import { usePdfBoxDrag, type PdfBoxDragMode } from "./usePdfBoxDrag";

export interface PdfImageOverlayItem {
  id: string;
  page: number;
  dataItemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfImageOverlayProps {
  overlays: PdfImageOverlayItem[];
  pageWidth: number;
  pageHeight: number;
  /** Resolve a data item id to a displayable image URL. */
  resolveImageUrl: (dataItemId: string) => string;
  /** Emit an updated overlay (geometry change). */
  onChange: (overlay: PdfImageOverlayItem) => void;
  /** Remove an overlay by id. */
  onDelete: (id: string) => void;
}

const HANDLE_PX = 10;
/** The shared grip paints its 8px square centred in the overlay's own 10px
 * target. `zIndex: auto` keeps the grips in the page's paint order, so they
 * never start covering text boxes that sit above the image. */
const GRIP_HIT_STYLE = {
  "--office-drawing-grip-size": `${HANDLE_PX}px`,
  "--office-drawing-grip-edge": `${-HANDLE_PX / 2}px`,
  zIndex: "auto",
} as CSSProperties;

/** WPS/Acrobat-style draggable, resizable image overlays on a PDF page. */
export default function PdfImageOverlay({
  overlays,
  pageWidth,
  pageHeight,
  resolveImageUrl,
  onChange,
  onDelete,
}: PdfImageOverlayProps) {
  const t = useTranslations("console-notebooks");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const map: Record<string, PdfImageOverlayItem> = {};
    for (const o of overlays) map[o.id] = o;
    return map;
  }, [overlays]);

  const apply = useCallback(
    (startRect: BoxRect, mode: PdfBoxDragMode, dx: number, dy: number) =>
      mode === "move"
        ? moveBox(startRect, dx, dy)
        : resizeBox(startRect, mode, dx, dy),
    [],
  );
  const commit = useCallback(
    (key: string, rect: BoxRect) => {
      const o = byId[key];
      if (o) onChange({ ...o, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    },
    [byId, onChange],
  );
  const getRenderedPageSize = useCallback(() => {
    const root = overlayRootRef.current;
    if (!root) return null;
    const { width, height } = root.getBoundingClientRect();
    return { width, height };
  }, []);
  const { dragKey, previewRect, beginDrag: beginBoxDrag } = usePdfBoxDrag<BoxRect>({
    pageWidth,
    pageHeight,
    unitsPerPage: 1,
    getRenderedPageSize,
    apply,
    onCommit: commit,
  });

  const beginDrag = useCallback(
    (
      o: PdfImageOverlayItem,
      mode: "move" | ResizeHandle,
      event: React.PointerEvent,
      selected = true,
    ) => {
      setSelectedId(o.id);
      // A finger moves a selected picture at once; one not yet selected is
      // held still first, so a swipe across it scrolls the page.
      beginBoxDrag(
        o.id,
        { x: o.x, y: o.y, width: o.width, height: o.height },
        mode,
        event,
        { immediate: mode !== "move" || selected },
      );
    },
    [beginBoxDrag],
  );

  const liveSelectedId = selectedId !== null && byId[selectedId] ? selectedId : null;
  // A finger held on a picture lifts it (then drags it, not the page).
  useObjectDragTouchGuards(
    overlayRootRef,
    '[data-testid="pdf-image-overlay-item"]',
    overlays,
  );

  return (
    <div
      ref={overlayRootRef}
      data-testid="pdf-image-overlay"
      style={{
        position: "absolute",
        inset: 0,
        width: pageWidth,
        height: pageHeight,
        pointerEvents: "none",
      }}
    >
      {overlays.map((o, index) => {
        const isSelected = liveSelectedId === o.id;
        const rect = dragKey === o.id && previewRect ? previewRect : o;
        const left = rect.x * pageWidth;
        const top = rect.y * pageHeight;
        const width = Math.max(8, rect.width * pageWidth);
        const height = Math.max(8, rect.height * pageHeight);
        return (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            aria-label={t("pdfViewer.imageEditBoxLabel", { index: index + 1 })}
            aria-pressed={isSelected}
            aria-keyshortcuts="Delete Backspace Escape"
            data-testid="pdf-image-overlay-item"
            data-overlay-id={o.id}
            // Selected, the picture wears the shared Office drawing outline.
            className={officeDrawingSelectionStyles.selectedHost}
            data-selected={isSelected ? "true" : undefined}
            onPointerDown={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              beginDrag(o, "move", event, isSelected);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedId(o.id);
                return;
              }
              if (event.key === "Escape" && isSelected) {
                event.preventDefault();
                setSelectedId(null);
                return;
              }
              if (
                (event.key === "Delete" || event.key === "Backspace") &&
                isSelected
              ) {
                event.preventDefault();
                onDelete(o.id);
                setSelectedId(null);
              }
            }}
            style={{
              position: "absolute",
              left,
              top,
              width,
              height,
              cursor: "move",
              outline: isSelected ? undefined : "none",
              pointerEvents: "auto",
              // selected, a finger on it moves it at once
              touchAction: isSelected ? "none" : undefined,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="pdf-image-overlay-img"
              data-overlay-id={o.id}
              src={resolveImageUrl(o.dataItemId)}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "fill",
                cursor: "inherit",
                border: "1px solid transparent",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
            {isSelected ? (
              <>
                <button
                  type="button"
                  data-testid="pdf-image-overlay-delete"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    onDelete(o.id);
                    setSelectedId(null);
                  }}
                  title={t("pdf.image.delete")}
                  aria-label={t("pdf.image.delete")}
                  style={{
                    position: "absolute",
                    top: -16,
                    right: -16,
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "#dc2626",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "auto",
                  }}
                >
                  <Trash2 aria-hidden size={16} />
                </button>
                {RESIZE_HANDLES.map(({ handle }) => (
                  <div
                    key={handle}
                    className={officeDrawingSelectionStyles.resize}
                    data-testid="pdf-image-overlay-handle"
                    data-handle={handle}
                    data-office-drawing-handle={handle}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      beginDrag(o, handle, event);
                    }}
                    style={GRIP_HIT_STYLE}
                  />
                ))}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
