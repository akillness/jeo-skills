"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Insert > Screenshot > Screen Clipping, the region half, for every Office host.
 *
 * Office frosts the whole screen, the pointer becomes a cross, and the area
 * the user drags shows clear; releasing inserts that area as a picture and
 * Esc cancels. A browser cannot read the screen without asking, so the host
 * first takes one frame of the screen, window or tab the user picks
 * (`captureDisplayMediaScreenshot`) and this layer shows that frame frosted
 * over the page for the drag. The host inserts the clip
 * (`clipScreenshotFile`).
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import {
  screenClippingRect,
  type ScreenClippingRect,
} from "../../lib/display-media-screenshot";
import { containDialogTab } from "../../lib/dialog-tab-containment";

export interface OfficeScreenClippingOverlayProps {
  /** The captured frame. */
  file: File;
  /** Spoken name of the layer and the visible hint. */
  labels: { overlay: string; hint: string };
  onClip: (rect: ScreenClippingRect) => void;
  onCancel: () => void;
  testId?: string;
}

type Point = { x: number; y: number };

export function OfficeScreenClippingOverlay(props: OfficeScreenClippingOverlayProps) {
  const { file, labels, onClip, onCancel, testId } = props;
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  type Bounds = { left: number; top: number; width: number; height: number };
  const [drag, setDrag] = useState<{ start: Point; end: Point; bounds: Bounds } | null>(null);

  useEffect(() => {
    layerRef.current?.focus({ preventScroll: true });
  }, []);

  const frameBounds = () => {
    const box = imageRef.current?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const bounds = frameBounds();
    if (!bounds) return;
    const point = { x: event.clientX, y: event.clientY };
    setDrag({ start: point, end: point, bounds });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag({ ...drag, end: { x: event.clientX, y: event.clientY } });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const rect = screenClippingRect(drag.start, { x: event.clientX, y: event.clientY }, drag.bounds);
    setDrag(null);
    if (rect) onClip(rect);
  };

  // The clear window over the frosted frame, in viewport pixels.
  const bounds = drag?.bounds ?? null;
  const clear = drag ? screenClippingRect(drag.start, drag.end, drag.bounds) : null;

  const layer = (
    <div
      ref={layerRef}
      role="dialog"
      aria-modal="true"
      aria-label={labels.overlay}
      tabIndex={-1}
      data-testid={testId}
      onKeyDown={(event) => {
        // aria-modal: Tab stays on the layer instead of reaching the page.
        if (containDialogTab(event, event.currentTarget)) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "#000",
        cursor: "crosshair",
        overflow: "hidden",
        outline: "none",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the captured frame */}
      <img
        ref={imageRef}
        src={url}
        alt=""
        draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
      />
      {clear && bounds ? (
        <div
          aria-hidden="true"
          data-testid={testId ? `${testId}-selection` : undefined}
          style={{
            position: "absolute",
            left: bounds.left + clear.x * bounds.width,
            top: bounds.top + clear.y * bounds.height,
            width: clear.width * bounds.width,
            height: clear.height * bounds.height,
            boxShadow: "0 0 0 100vmax rgba(255, 255, 255, 0.55)",
            outline: "1px solid rgba(0, 0, 0, 0.6)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, background: "rgba(255, 255, 255, 0.55)", pointerEvents: "none" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "6px 12px",
          borderRadius: 6,
          background: "rgba(0, 0, 0, 0.72)",
          color: "#fff",
          font: "13px/1.4 system-ui, sans-serif",
          pointerEvents: "none",
        }}
      >
        {labels.hint}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(layer, document.body);
}
