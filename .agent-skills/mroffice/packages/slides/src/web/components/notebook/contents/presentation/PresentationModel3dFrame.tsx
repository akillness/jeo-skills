"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A 3-D model on the slide (Insert > 3D Models; `source.nativeModel3d`),
 * drawn from its own glTF part through its camera, transform and lights as
 * PowerPoint draws it (`lib/office-model3d`).
 *
 * Shows the picture PowerPoint kept of the model (its Fallback / am3d:raster),
 * pixel for pixel and stretched with its frame, as long as it IS the model
 * as the page holds it (`model3dRasterCurrent`: camera, transform, lights
 * unchanged -- a move or a resize changes none of them) and sharp where it
 * is shown. The model is drawn from its glTF part instead when the picture
 * is stale (its scene changed, here or by a collaborator), missing or
 * unreadable, or when the frame covers more than 1.5 device pixels per
 * picture pixel (back to the picture below 1.25: `model3dSharpnessMode`).
 * A picture that is stale and cannot be replaced by a drawing (no WebGL, a
 * part that cannot be read) stays, with a notice where the caller asks for
 * one (the edit canvas, the model selected). Any other picture passes
 * through untouched.
 *
 * The renderer (three and its glTF loader) is loaded with `import()` only
 * when a model is drawn; a thumbnail (`live` false) and a model shown as its
 * picture never load it.
 */

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  model3dRasterCurrent,
  model3dSharpnessMode,
  presentationModel3dOf,
  type PresentationModel3d,
} from "@mrnote/core/web/lib/office-model3d/block.ts";
import { loadModel3dRenderer, loadPageModel3d, type Model3dRendererModule } from "@mrnote/core/web/lib/office-model3d/load.ts";
import type { LoadedModel3d } from "@mrnote/core/web/lib/office-model3d/renderer.ts";
import { PresentationPageIdContext } from "./PresentationMediaContent";
import { PresentationPreservedObjectNotice } from "./PresentationPreservedObjectNotice";

type RendererModule = Model3dRendererModule;
const loadRenderer = loadModel3dRenderer;
const loadModel = loadPageModel3d;

/** Device pixels the frame covers (its layout size times the canvas zoom and the screen's density). */
function devicePixels(element: HTMLElement): { width: number; height: number } | null {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) return null;
  const rect = element.getBoundingClientRect();
  // The zoom the slide is drawn at; a turned frame's box is larger, which
  // only draws it a little sharper.
  const zoom = Math.max(rect.width / width, rect.height / height, 0.05);
  const ratio = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
  const scale = Math.min(zoom * ratio, 2048 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type DrawState = "raster" | "pending" | "drawn" | "failed";

function Model3dDrawing({
  blockId,
  model,
  rasterCurrent,
  rasterMissing,
  failureNotice,
  children,
}: {
  blockId: string;
  model: PresentationModel3d;
  /** The picture PowerPoint kept still shows the model as the page holds it. */
  rasterCurrent: boolean;
  /** The block has no picture at all. */
  rasterMissing: boolean;
  failureNotice?: string | null;
  children: ReactNode;
}) {
  const pageId = useContext(PresentationPageIdContext);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sharpnessRef = useRef<"raster" | "webgl">("raster");
  const [sharpness, setSharpness] = useState<"raster" | "webgl">("raster");
  const [rasterBroken, setRasterBroken] = useState(false);
  const [drawState, setState] = useState<DrawState>("pending");
  // The picture PowerPoint kept, pixel for pixel, while it is the model as
  // the page holds it and sharp enough where it is shown; else the drawing.
  const pictureStale = !rasterCurrent || rasterMissing || rasterBroken;
  const wantDrawing = pictureStale || sharpness === "webgl";
  // A model outside a page (no page to serve its part) keeps its picture.
  const state: DrawState = !wantDrawing ? "raster" : pageId ? drawState : "failed";

  // How many device pixels each of the picture's own pixels covers, and
  // whether the picture is readable at all.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame: number | null = null;
    let watched: HTMLImageElement | null = null;
    const broken = () => setRasterBroken(true);
    const measure = () => {
      frame = null;
      const picture = host.querySelector("img");
      if (picture !== watched) {
        watched?.removeEventListener("load", schedule);
        watched?.removeEventListener("error", broken);
        watched = picture;
        picture?.addEventListener("load", schedule);
        picture?.addEventListener("error", broken);
      }
      if (!picture) return;
      if (picture.complete && picture.naturalWidth === 0 && picture.getAttribute("src")) {
        setRasterBroken(true);
        return;
      }
      if (!picture.naturalWidth || !picture.naturalHeight) return;
      const size = devicePixels(host);
      if (!size) return;
      const scale = Math.max(size.width / picture.naturalWidth, size.height / picture.naturalHeight);
      const next = model3dSharpnessMode(sharpnessRef.current, scale);
      if (next !== sharpnessRef.current) {
        sharpnessRef.current = next;
        setSharpness(next);
      }
    };
    function schedule() {
      if (frame === null) frame = requestAnimationFrame(measure);
    }
    schedule();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      watched?.removeEventListener("load", schedule);
      watched?.removeEventListener("error", broken);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !pageId || !wantDrawing) return;
    let cancelled = false;
    let frame: number | null = null;
    let drawnSize = "";
    let loaded: { renderer: RendererModule; model: LoadedModel3d } | null = null;
    const draw = () => {
      frame = null;
      if (cancelled || !loaded) return;
      const size = devicePixels(host);
      if (!size) return;
      const key = `${size.width}x${size.height}`;
      if (key === drawnSize) return;
      if (loaded.renderer.renderModel3d(loaded.model, model.scene, canvas, size.width, size.height)) {
        drawnSize = key;
        setState("drawn");
      } else {
        setState("failed");
      }
    };
    const schedule = () => {
      if (frame === null && !cancelled) frame = requestAnimationFrame(draw);
    };
    Promise.all([loadRenderer(), loadModel(pageId, blockId, model)])
      .then(([renderer, loadedModel]) => {
        if (cancelled) return;
        if (!renderer.model3dRenderingAvailable()) {
          setState("failed");
          return;
        }
        loaded = { renderer, model: loadedModel };
        schedule();
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(host);
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [blockId, model, pageId, wantDrawing]);

  return (
    <div
      ref={hostRef}
      data-testid="presentation-model3d"
      data-model3d-state={state}
      // What this window holds of the model (its turn), for co-editing checks.
      data-model3d-rotation={model.scene.transform.rotation.join(",")}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <div style={{ width: "100%", height: "100%", visibility: state === "drawn" ? "hidden" : undefined }}>
        {children}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          visibility: state === "drawn" ? "visible" : "hidden",
        }}
      />
      {/* Said only when what shows is not the model as the page holds it. */}
      {state === "failed" && pictureStale && failureNotice ? (
        <PresentationPreservedObjectNotice notice={{ kind: "picture", code: "model3d-not-drawn" }} label={failureNotice} />
      ) : null}
    </div>
  );
}

export function PresentationModel3dFrame({
  block,
  live,
  failureNotice,
  children,
}: {
  block: { id: string; source?: unknown; src?: unknown };
  /** Draw the model (the canvas, the show); false: the picture (thumbnails). */
  live: boolean;
  /** Said over the picture when the model cannot be drawn. */
  failureNotice?: string | null;
  children: ReactNode;
}) {
  const parsed = presentationModel3dOf(block);
  // Keyed by what the model is, not by the block object: an edit elsewhere
  // on the slide gives the block a new object and must not draw it again.
  const key = parsed ? `${parsed.fingerprint}:${JSON.stringify(parsed.scene)}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => parsed, [key]);
  if (!live || !model) return <>{children}</>;
  const src = (block as { src?: unknown }).src;
  return (
    <Model3dDrawing
      blockId={block.id}
      model={model}
      rasterCurrent={model3dRasterCurrent(block)}
      rasterMissing={typeof src !== "string" || !src}
      failureNotice={failureNotice}
    >
      {children}
    </Model3dDrawing>
  );
}
