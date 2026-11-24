"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Draw ▸ Ink Replay on a slide (PPT-A066): the slide's ink, taken off and
 * redrawn stroke by stroke over the canvas, with the playback bar Excel's
 * Draw tab shows -- Rewind and Forward step a stroke, Play/Pause, a scrubber
 * to start from any point, Close (Esc). A view only: nothing is saved.
 */
import { InkEffectStroke } from "@mrnote/core/web/components/office-ribbon/InkEffectStroke.tsx";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { inkStrokePathData } from "@mrnote/core/web/lib/office-ink-smooth.ts";
import {
  inkReplayFrame,
  inkReplayStep,
  inkReplayTimeline,
  type InkReplayTimeline,
} from "@mrnote/core/web/lib/office-ink-replay.ts";
import {
  presentationInkReplayTimelineInput,
  type PresentationInkReplayStroke,
} from "../../../../lib/presentation-ink-replay";

export interface PresentationInkReplayState {
  readonly position: number;
  readonly playing: boolean;
}

/** The replay's clock: `null` state means no replay. */
export function usePresentationInkReplay(
  strokes: readonly PresentationInkReplayStroke[] | null,
  state: PresentationInkReplayState | null,
  setState: (
    next:
      | PresentationInkReplayState
      | null
      | ((current: PresentationInkReplayState | null) => PresentationInkReplayState | null),
  ) => void,
) {
  // The timeline is the strokes'; the clock moving does not rebuild it.
  const replaying = state !== null;
  const timeline = useMemo<InkReplayTimeline | null>(
    () => (strokes && replaying ? inkReplayTimeline(presentationInkReplayTimelineInput(strokes)) : null),
    [strokes, replaying],
  );
  const playing = state?.playing === true;
  const duration = timeline?.duration ?? 0;
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      setState((current) => {
        if (!current || !current.playing) return current;
        const position = Math.min(duration, current.position + elapsed);
        return { position, playing: position < duration };
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, playing, setState]);
  const frame = useMemo(
    () => (timeline && state ? inkReplayFrame(timeline, state.position) : null),
    [state, timeline],
  );
  return { timeline, frame };
}

export function PresentationInkReplayStrokes({
  strokes,
  frame,
  width,
  height,
}: {
  readonly strokes: readonly PresentationInkReplayStroke[];
  readonly frame: ReadonlyMap<string, number>;
  /** The slide's size in EMU (the strokes' space). */
  readonly width: number;
  readonly height: number;
}) {
  return (
    <svg
      aria-hidden="true"
      data-testid="presentation-ink-replay-strokes"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ inset: 0, position: "absolute", width: "100%", height: "100%", pointerEvents: "none", zIndex: 8_900 }}
    >
      {strokes.map((stroke) => {
        const count = frame.get(stroke.id) ?? 0;
        if (count < 2) return null;
        if (stroke.effect) {
          return (
            <InkEffectStroke
              key={stroke.id}
              effect={stroke.effect}
              gradientId={`presentation-ink-replay-${stroke.id.replace(/[^a-zA-Z0-9_-]/g, "")}`}
              geometry={{ points: stroke.points.slice(0, count), widthPx: stroke.widthEmu, pressured: false, opacity: stroke.opacity }}
            />
          );
        }
        return (
          <path
            key={stroke.id}
            fill="none"
            // as the stroke itself is drawn (lib/office-ink-smooth)
            d={inkStrokePathData(stroke.points.slice(0, count))}
            stroke={stroke.color}
            strokeOpacity={stroke.opacity}
            strokeWidth={stroke.widthEmu}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

export function PresentationInkReplayBar({
  host,
  timeline,
  state,
  setState,
  labels,
}: {
  readonly host: HTMLElement | null;
  readonly timeline: InkReplayTimeline;
  readonly state: PresentationInkReplayState;
  readonly setState: (next: PresentationInkReplayState | null) => void;
  readonly labels: {
    readonly bar: string;
    readonly play: string;
    readonly pause: string;
    readonly rewind: string;
    readonly forward: string;
    readonly position: string;
    readonly close: string;
  };
}) {
  if (!host) return null;
  const buttons = [
    ["rewind", labels.rewind, "media.next", () =>
      setState({ position: inkReplayStep(timeline, state.position, -1), playing: false })],
    [state.playing ? "pause" : "play", state.playing ? labels.pause : labels.play,
      state.playing ? "media.pause" : "media.play", () =>
        setState(
          state.playing
            ? { ...state, playing: false }
            : { position: state.position >= timeline.duration ? 0 : state.position, playing: true },
        )],
    ["forward", labels.forward, "media.next", () =>
      setState({ position: inkReplayStep(timeline, state.position, 1), playing: false })],
  ] as const;
  return createPortal(
    <div
      role="toolbar"
      aria-label={labels.bar}
      data-testid="presentation-ink-replay-bar"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setState(null);
        }
      }}
      style={{
        position: "absolute",
        bottom: 48,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        background: "var(--surface, #ffffff)",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      {buttons.map(([id, label, icon, run]) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          title={label}
          data-testid={`presentation-ink-replay-${id}`}
          onClick={run}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5"
          style={id === "rewind" ? { transform: "scaleX(-1)" } : undefined}
        >
          <OfficeSemanticIcon semanticId={icon} size={16} />
        </button>
      ))}
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(timeline.duration))}
        value={Math.round(state.position)}
        aria-label={labels.position}
        data-testid="presentation-ink-replay-position"
        onChange={(event) =>
          setState({ position: Number(event.target.value), playing: false })
        }
        style={{ width: 160 }}
      />
      <button
        type="button"
        aria-label={labels.close}
        title={labels.close}
        data-testid="presentation-ink-replay-close"
        onClick={() => setState(null)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5"
      >
        <OfficeSemanticIcon semanticId="window.close" size={16} />
      </button>
    </div>,
    host,
  );
}
