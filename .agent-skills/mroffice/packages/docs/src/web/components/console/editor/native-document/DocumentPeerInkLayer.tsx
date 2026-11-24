"use client";















/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "@tiptap/pm/view";
import type { Awareness } from "y-protocols/awareness";

import {
  createPeerInkTracker,
  inkPresencePaint,
  type InkPresencePaint,
  type InkPresenceStroke,
} from "@mrnote/core/web/lib/collab/ink-presence.ts";
import { surfaceLayout } from "./DocumentInkSurface";

/** The live ink surface key of a document's pages. */
export const DOCUMENT_INK_PRESENCE_SURFACE = "pages";

const MAX_CANVAS_PX = 4096;
/** The canvas's box grows in steps of this (surface px), so a stroke being
 * written reallocates it now and then, not on every update. */
const BOX_STEP_PX = 64;

/** Drawn as the writer's own wet ink draws it (lib/collab/ink-presence). */
type StrokePaths = WeakMap<InkPresenceStroke, { path: Path2D; paint: InkPresencePaint } | null>;

function drawStroke(context: CanvasRenderingContext2D, stroke: InkPresenceStroke, paths: StrokePaths) {
  let built = paths.get(stroke);
  if (built === undefined) {
    const paint = inkPresencePaint(stroke);
    built = paint.d ? { path: new Path2D(paint.d), paint } : null;
    paths.set(stroke, built);
  }
  if (!built) return;
  const { path, paint } = built;
  context.globalAlpha = stroke.alpha;
  if (paint.filled) {
    context.fillStyle = stroke.color;
    context.fill(path);
    return;
  }
  context.strokeStyle = stroke.color;
  context.lineWidth = paint.width;
  context.stroke(path);
}

export function DocumentPeerInkLayer({
  view,
  awareness,
}: {
  view: EditorView | null;
  awareness: Awareness | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!view || !awareness) return;
    // Strokes a member no longer carries (they landed) are kept a moment, so
    // the document's copy arrives before this one goes.
    const tracker = createPeerInkTracker(DOCUMENT_INK_PRESENCE_SURFACE);
    let frame = 0;
    let lingerTimer: ReturnType<typeof setTimeout> | null = null;
    // A finished stroke is decoded once (the tracker keeps its object), so its
    // path is built once.
    const paths: StrokePaths = new WeakMap();
    let box: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

    const paint = () => {
      frame = 0;
      const strokes = tracker.strokes();
      const expiry = tracker.nextExpiry();
      if (expiry !== null && lingerTimer === null) {
        lingerTimer = setTimeout(() => {
          lingerTimer = null;
          schedule();
        }, Math.max(16, expiry - Date.now()));
      }
      if (strokes.length === 0 || view.isDestroyed) {
        box = null;
        setShown(false);
        return;
      }
      const layout = surfaceLayout(view);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const stroke of strokes) {
        const pad = stroke.width;
        for (const point of stroke.points) {
          minX = Math.min(minX, point.x - pad);
          minY = Math.min(minY, point.y - pad);
          maxX = Math.max(maxX, point.x + pad);
          maxY = Math.max(maxY, point.y + pad);
        }
      }
      // The box only grows while the strokes stay inside it.
      if (!box || minX < box.minX || minY < box.minY || maxX > box.maxX || maxY > box.maxY) {
        box = {
          minX: Math.floor(minX / BOX_STEP_PX) * BOX_STEP_PX,
          minY: Math.floor(minY / BOX_STEP_PX) * BOX_STEP_PX,
          maxX: Math.ceil(maxX / BOX_STEP_PX) * BOX_STEP_PX,
          maxY: Math.ceil(maxY / BOX_STEP_PX) * BOX_STEP_PX,
        };
      }
      const width = Math.max(1, box.maxX - box.minX);
      const height = Math.max(1, box.maxY - box.minY);
      setHost(layout.host);
      setShown(true);
      const canvas = canvasRef.current;
      if (!canvas || canvas.parentElement !== layout.host) {
        schedule();
        return;
      }
      const density = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PX / width, MAX_CANVAS_PX / height);
      const pixelWidth = Math.max(1, Math.round(width * density));
      const pixelHeight = Math.max(1, Math.round(height * density));
      // Box and pixels together, before this frame paints.
      Object.assign(canvas.style, {
        left: `${layout.bounds.left + box.minX}px`,
        top: `${layout.bounds.top + box.minY}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      const context = canvas.getContext("2d");
      if (!context) return;
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      } else {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, pixelWidth, pixelHeight);
      }
      context.setTransform(density, 0, 0, density, -box.minX * density, -box.minY * density);
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const stroke of strokes) drawStroke(context, stroke, paths);
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(paint);
    };
    const onChange = () => {
      if (tracker.read(awareness.getStates(), awareness.clientID)) schedule();
    };
    awareness.on("change", onChange);
    onChange();
    return () => {
      awareness.off("change", onChange);
      if (frame !== 0) cancelAnimationFrame(frame);
      if (lingerTimer !== null) clearTimeout(lingerTimer);
    };
  }, [view, awareness]);

  if (!host || !shown) return null;
  // Its box is set where it is drawn (above), never by a render.
  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="document-peer-ink"
      style={{ position: "absolute", pointerEvents: "none", zIndex: 6 }}
    />,
    host,
  );
}
