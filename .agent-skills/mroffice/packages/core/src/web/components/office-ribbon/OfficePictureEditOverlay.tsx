"use client";




















/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import {
  computeBackgroundRemovalMask,
  strokeToSegments,
  type BackgroundRemovalSegment,
  type BackgroundRemovalSpec,
  type RgbaPixels,
} from "../../lib/office-picture-background-removal";
import { loadPictureImage, picturePixels } from "../../lib/office-picture-edit-render";

/** The preview's working size (the estimate re-runs on every change). */
const PREVIEW_SIZE = 320;
const REMOVED_TINT: [number, number, number, number] = [200, 0, 160, 150];

export type OfficePictureEditPen = "keep" | "remove" | null;

export interface OfficePictureEditOverlayProps {
  /**
   * Resolves the picture's drawn box (viewport pixels) each frame; a turned
   * or mirrored picture passes its own frame.
   */
  anchor: () => DOMRect | OfficePictureEditAnchorFrame | null;
  /** The picture the session edits (the original when one is kept). */
  src: string;
  mode: "removal" | "erase";
  spec: BackgroundRemovalSpec;
  pen: OfficePictureEditPen;
  onSpecChange: (spec: BackgroundRemovalSpec) => void;
  /** Erase strokes drawn so far (0..1 picture fractions). */
  eraseSegments: readonly BackgroundRemovalSegment[];
  onEraseSegmentsChange: (segments: BackgroundRemovalSegment[]) => void;
  /** Erase brush, as a fraction of the picture's shorter side. */
  eraseRadius: number;
  labels: { marquee: string; overlay: string };
  testId?: string;
}

/**
 * The picture's own frame as drawn: its axis-aligned box on screen plus the
 * unturned size (viewport pixels) and the turn / mirror it is drawn with.
 */
export interface OfficePictureEditAnchorFrame {
  rect: DOMRect;
  width: number;
  height: number;
  /** Clockwise degrees. */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

interface PictureFrame {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

function isAnchorFrame(value: DOMRect | OfficePictureEditAnchorFrame): value is OfficePictureEditAnchorFrame {
  return "rect" in value;
}

/** The anchor as one frame: a bare rect is an unturned picture. */
export function officePictureEditFrame(
  anchor: DOMRect | OfficePictureEditAnchorFrame | null,
): PictureFrame | null {
  if (!anchor) return null;
  const rect = isAnchorFrame(anchor) ? anchor.rect : anchor;
  const turned = isAnchorFrame(anchor) && anchor.width > 0 && anchor.height > 0;
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width: turned ? anchor.width : rect.width,
    height: turned ? anchor.height : rect.height,
    rotation: turned && Number.isFinite(anchor.rotation) ? anchor.rotation : 0,
    flipH: turned && anchor.flipH === true,
    flipV: turned && anchor.flipV === true,
  };
}

/** A viewport point as a 0..1 fraction of the unturned, unmirrored picture. */
export function officePictureEditFraction(
  frame: PictureFrame,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const radians = (-frame.rotation * Math.PI) / 180;
  const dx = clientX - frame.cx;
  const dy = clientY - frame.cy;
  let lx = dx * Math.cos(radians) - dy * Math.sin(radians);
  let ly = dx * Math.sin(radians) + dy * Math.cos(radians);
  if (frame.flipH) lx = -lx;
  if (frame.flipV) ly = -ly;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp(lx / Math.max(1, frame.width) + 0.5),
    y: clamp(ly / Math.max(1, frame.height) + 0.5),
  };
}

type Handle = "t" | "b" | "l" | "r" | "tl" | "tr" | "bl" | "br";

export function OfficePictureEditOverlay(props: OfficePictureEditOverlayProps) {
  const { anchor, src, mode, spec, pen, onSpecChange, eraseSegments, onEraseSegmentsChange } = props;
  const [box, setBox] = useState<PictureFrame | null>(() => officePictureEditFrame(anchor()));
  const [preview, setPreview] = useState<RgbaPixels | null>(null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const [liveStroke, setLiveStroke] = useState<Array<{ x: number; y: number }> | null>(null);
  const dragRef = useRef<{ handle: Handle; rect: BackgroundRemovalSpec["rect"] } | null>(null);

  // Follow the picture: a cheap rect read per frame while the session lasts.
  useEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const drawn = officePictureEditFrame(anchor());
      const key = drawn
        ? `${drawn.cx},${drawn.cy},${drawn.width},${drawn.height},${drawn.rotation},${drawn.flipH},${drawn.flipV}`
        : "";
      if (key !== last) {
        last = key;
        setBox(drawn);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadPictureImage(src)
      .then((image) => {
        if (!cancelled) setPreview(picturePixels(image, PREVIEW_SIZE));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const mask = useMemo(
    () => (preview && mode === "removal" ? computeBackgroundRemovalMask(preview, spec) : null),
    [mode, preview, spec],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !preview) return;
    canvas.width = preview.width;
    canvas.height = preview.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(preview.width, preview.height);
    image.data.set(preview.data);
    if (mask) {
      for (let i = 0; i < mask.length; i += 1) {
        if (mask[i] >= 128) continue;
        const at = i * 4;
        const alpha = REMOVED_TINT[3] / 255;
        image.data[at] = Math.round(image.data[at] * (1 - alpha) + REMOVED_TINT[0] * alpha);
        image.data[at + 1] = Math.round(image.data[at + 1] * (1 - alpha) + REMOVED_TINT[1] * alpha);
        image.data[at + 2] = Math.round(image.data[at + 2] * (1 - alpha) + REMOVED_TINT[2] * alpha);
        image.data[at + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [mask, preview]);

  if (!box || typeof document === "undefined") return null;

  const fraction = (event: ReactPointerEvent) =>
    officePictureEditFraction(box, event.clientX, event.clientY);
  const turn = [
    box.rotation !== 0 ? `rotate(${box.rotation}deg)` : "",
    box.flipH ? "scaleX(-1)" : "",
    box.flipV ? "scaleY(-1)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const drawing = mode === "erase" || pen !== null;
  const beginStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !drawing) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* best effort */
    }
    strokeRef.current = [fraction(event)];
    setLiveStroke(strokeRef.current);
  };
  const extendStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const point = fraction(event);
      const next = { ...drag.rect };
      if (drag.handle.includes("t")) next.t = Math.min(point.y, next.b - 0.02);
      if (drag.handle.includes("b")) next.b = Math.max(point.y, next.t + 0.02);
      if (drag.handle.includes("l")) next.l = Math.min(point.x, next.r - 0.02);
      if (drag.handle.includes("r")) next.r = Math.max(point.x, next.l + 0.02);
      dragRef.current = { ...drag, rect: next };
      onSpecChange({ ...spec, rect: next });
      return;
    }
    if (!strokeRef.current) return;
    strokeRef.current = [...strokeRef.current, fraction(event)];
    setLiveStroke(strokeRef.current);
  };
  const endStroke = () => {
    dragRef.current = null;
    const points = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (!points) return;
    const segments = strokeToSegments(points);
    if (mode === "erase") {
      onEraseSegmentsChange([...eraseSegments, ...segments]);
    } else if (pen === "keep") {
      onSpecChange({ ...spec, keep: [...spec.keep, ...segments] });
    } else if (pen === "remove") {
      onSpecChange({ ...spec, remove: [...spec.remove, ...segments] });
    }
  };
  const beginHandle = (handle: Handle) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0 || drawing) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      (event.currentTarget.parentElement as HTMLElement | null)?.setPointerCapture(event.pointerId);
    } catch {
      /* best effort */
    }
    dragRef.current = { handle, rect: { ...spec.rect } };
  };

  const segmentPath = (segments: readonly BackgroundRemovalSegment[]) =>
    segments
      .map((s) => `M${s.x1 * 100} ${s.y1 * 100}L${s.x2 * 100} ${s.y2 * 100}`)
      .join("");
  const livePath = liveStroke
    ? liveStroke.map((p, i) => `${i ? "L" : "M"}${p.x * 100} ${p.y * 100}`).join("")
    : "";
  const rect = spec.rect;
  const handles: Array<[Handle, number, number]> = [
    ["tl", rect.l, rect.t],
    ["t", (rect.l + rect.r) / 2, rect.t],
    ["tr", rect.r, rect.t],
    ["r", rect.r, (rect.t + rect.b) / 2],
    ["br", rect.r, rect.b],
    ["b", (rect.l + rect.r) / 2, rect.b],
    ["bl", rect.l, rect.b],
    ["l", rect.l, (rect.t + rect.b) / 2],
  ];

  return createPortal(
    <div
      aria-label={props.labels.overlay}
      data-testid={props.testId ?? "office-picture-edit-overlay"}
      data-mode={mode}
      data-pen={pen ?? ""}
      data-failed={failed ? "true" : undefined}
      onPointerDown={beginStroke}
      onPointerMove={extendStroke}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      style={{
        position: "fixed",
        left: box.cx - box.width / 2,
        top: box.cy - box.height / 2,
        width: box.width,
        height: box.height,
        transform: turn || undefined,
        transformOrigin: "center center",
        zIndex: 60,
        cursor: drawing ? "crosshair" : "default",
        touchAction: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        {mode === "removal" ? (
          <>
            <rect
              x={rect.l * 100}
              y={rect.t * 100}
              width={(rect.r - rect.l) * 100}
              height={(rect.b - rect.t) * 100}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4 3"
            />
            <path d={segmentPath(spec.keep)} stroke="#16a34a" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" />
            <path d={segmentPath(spec.remove)} stroke="#dc2626" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" />
          </>
        ) : (
          <path
            d={segmentPath(eraseSegments)}
            stroke="rgba(220, 38, 38, 0.45)"
            strokeWidth={Math.max(2, props.eraseRadius * 2 * Math.min(box.width, box.height))}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        )}
        {livePath ? (
          <path
            d={livePath}
            stroke={mode === "erase" ? "rgba(220, 38, 38, 0.45)" : pen === "keep" ? "#16a34a" : "#dc2626"}
            strokeWidth={mode === "erase" ? Math.max(2, props.eraseRadius * 2 * Math.min(box.width, box.height)) : 3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        ) : null}
      </svg>
      {mode === "removal" && !drawing
        ? handles.map(([handle, x, y]) => (
            <span
              key={handle}
              aria-label={props.labels.marquee}
              data-handle={handle}
              onPointerDown={beginHandle(handle)}
              style={{
                position: "absolute",
                left: `calc(${x * 100}% - 5px)`,
                top: `calc(${y * 100}% - 5px)`,
                width: 10,
                height: 10,
                background: "#ffffff",
                border: "1px solid #4b5563",
                borderRadius: 2,
                cursor: handle === "t" || handle === "b" ? "ns-resize" : handle === "l" || handle === "r" ? "ew-resize" : handle === "tl" || handle === "br" ? "nwse-resize" : "nesw-resize",
              }}
            />
          ))
        : null}
    </div>,
    document.body,
  );
}
