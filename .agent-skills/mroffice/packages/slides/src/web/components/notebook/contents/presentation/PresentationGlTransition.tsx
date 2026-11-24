"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A 3-D slide transition drawn with WebGL (`presentation-gl-transitions`)
 * over the slide while it plays, from pictures of the slide left and the
 * slide entered. Its clock is an animation the show plays and a recording
 * sets (then asks for the frame with `MORPH_FRAME_EVENT`, as the Morph
 * outline does). When WebGL is not there the show's own CSS transition plays
 * (`onUnavailable`).
 */

import { useEffect, useRef } from "react";

import {
  createGlTransitionRenderer,
  type GlTransitionKind,
} from "../../../../lib/presentation-gl-transitions";
import { MORPH_FRAME_EVENT } from "./PresentationMorphOutline";

export function PresentationGlTransition({
  kind,
  direction,
  durationMs,
  from,
  to,
  width,
  height,
  onDone,
  onUnavailable,
  captured = false,
}: {
  kind: GlTransitionKind;
  direction: string | null;
  durationMs: number;
  from: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
  to: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
  /** The canvas's pixel size (the slide's picture size). */
  width: number;
  height: number;
  onDone: () => void;
  onUnavailable: () => void;
  /** Recorded frame by frame: the recorder ends it, not a timer. */
  captured?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clockRef = useRef<HTMLDivElement | null>(null);
  const done = useRef({ onDone, onUnavailable });
  done.current = { onDone, onUnavailable };

  useEffect(() => {
    const canvas = canvasRef.current;
    const clock = clockRef.current;
    if (!canvas || !clock) return;
    const renderer = createGlTransitionRenderer(canvas, from, to);
    if (!renderer) {
      done.current.onUnavailable();
      return;
    }
    const animation = clock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(1, durationMs), fill: "forwards" });
    const progress = () => Math.min(1, Number(animation.currentTime ?? 0) / Math.max(1, durationMs));
    renderer.draw(kind, direction, 0);
    let raf = 0;
    const tick = () => {
      renderer.draw(kind, direction, progress());
      if (animation.playState === "running") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onFrame = () => renderer.draw(kind, direction, progress());
    window.addEventListener(MORPH_FRAME_EVENT, onFrame);
    if (!captured) {
      animation.finished.then(() => done.current.onDone()).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(MORPH_FRAME_EVENT, onFrame);
      animation.cancel();
      renderer.dispose();
    };
  }, [kind, direction, durationMs, from, to, captured]);

  return (
    <div
      aria-hidden="true"
      data-testid="presentation-gl-transition"
      style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none" }}
    >
      <div ref={clockRef} style={{ position: "absolute", width: 0, height: 0, opacity: 0 }} />
      <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
