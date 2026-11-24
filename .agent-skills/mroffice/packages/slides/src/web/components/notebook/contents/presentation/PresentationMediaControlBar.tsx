"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";

import type { PresentationMediaBookmark } from "@mrnote/core/web/lib/presentation-embed.ts";

import styles from "./PresentationMediaControlBar.module.css";

/** PowerPoint's media step: Move Back / Move Forward 0.25 seconds. */
export const PRESENTATION_MEDIA_STEP_MS = 250;

/**
 * The bar's time readout, PowerPoint's `mm:ss.ff` (minutes, seconds and
 * hundredths): 00:01.25.
 */
export function formatPresentationMediaControlTime(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 10) : 0;
  const minutes = Math.floor(safe / 6_000);
  const seconds = Math.floor((safe % 6_000) / 100);
  const hundredths = safe % 100;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

export interface PresentationMediaControlBarLabels {
  readonly play: string;
  readonly pause: string;
  readonly position: string;
  readonly back: string;
  readonly forward: string;
  readonly mute: string;
  readonly unmute: string;
  readonly volume: string;
}

/**
 * The media control bar PowerPoint shows under a selected audio or video clip
 * in Normal view ("a toolbar appears below the video that has a play/pause
 * button, a progress bar, incremental forward/backward buttons, a timer, and
 * a volume control" -- Microsoft Support, "Insert and play a video file from
 * your computer"): Play/Pause, a timeline that can be dragged and names the
 * time under the pointer, Move Back / Move Forward 0.25 seconds, the elapsed
 * time as mm:ss.ff, and Mute with a volume slider. The clip's bookmarks sit
 * on the timeline as dots; clicking one moves the clip there and selects that
 * bookmark, which is what Playback > Remove Bookmark removes (PPT-A157).
 *
 * The bar drives the canvas player it is given (`getMedia`); the canvas shows
 * no native controls of its own. Mute and volume here are a preview of the
 * clip, never its saved Playback > Volume.
 */
export function PresentationMediaControlBar({
  mediaKey,
  getMedia,
  bookmarks,
  selectedBookmarkName,
  onSelectBookmark,
  labels,
}: {
  /** Which clip the bar drives; the player is looked up again when it changes. */
  mediaKey: string;
  getMedia: () => HTMLMediaElement | null;
  bookmarks: readonly PresentationMediaBookmark[];
  selectedBookmarkName: string | null;
  onSelectBookmark: (name: string | null) => void;
  labels: PresentationMediaControlBarLabels;
}): ReactElement {
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [hover, setHover] = useState<{ ms: number; fraction: number } | null>(null);

  // The player the bar follows. A clip just inserted is mounted (and its
  // element replaced once its file is stored) after the bar first looks, so
  // the bar looks again until it finds the element the canvas plays and
  // follows a replacement: bound once, a new clip's bar stayed at 0 while it
  
  const [media, setMedia] = useState<HTMLMediaElement | null>(() => getMedia());
  useEffect(() => {
    const look = () => {
      const current = getMedia();
      setMedia((previous) => (previous === current ? previous : current));
    };
    look();
    const timer = window.setInterval(look, 400);
    return () => window.clearInterval(timer);
    // `getMedia` is a fresh closure every render naming the clip's element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey]);

  useEffect(() => {
    if (!media) return undefined;
    const sync = () => {
      setPositionMs(Math.round((media.currentTime || 0) * 1_000));
      setDurationMs(
        Number.isFinite(media.duration) ? Math.round(media.duration * 1_000) : 0,
      );
      setPlaying(!media.paused);
      setMuted(media.muted === true);
      setVolume(Number.isFinite(media.volume) ? media.volume : 1);
    };
    sync();
    const events = [
      "timeupdate",
      "durationchange",
      "loadedmetadata",
      "play",
      "pause",
      "seeked",
      "volumechange",
    ];
    for (const name of events) media.addEventListener(name, sync);
    return () => {
      for (const name of events) media.removeEventListener(name, sync);
    };
  }, [media]);

  const span = Math.max(durationMs, ...bookmarks.map((bookmark) => bookmark.timeMs), 1);
  const seek = (ms: number) => {
    const media = getMedia();
    if (!media) return;
    const liveDuration = Number.isFinite(media.duration) ? Math.round(media.duration * 1_000) : durationMs;
    const next = Math.max(0, Math.min(liveDuration > 0 ? liveDuration : span, ms));
    media.currentTime = next / 1_000;
    setPositionMs(next);
  };
  /** Back / forward a step from where the clip is now, not the bar's last reading. */
  const step = (deltaMs: number) => {
    const media = getMedia();
    if (!media) return;
    seek(Math.round((media.currentTime || 0) * 1_000) + deltaMs);
  };
  const togglePlay = () => {
    const media = getMedia();
    if (!media) return;
    if (media.paused) {
      void Promise.resolve(media.play?.()).catch(() => {});
    } else {
      media.pause?.();
    }
  };
  const toggleMute = () => {
    const media = getMedia();
    if (!media) return;
    media.muted = !media.muted;
    setMuted(media.muted);
  };
  const changeVolume = (value: number) => {
    const media = getMedia();
    if (!media) return;
    media.volume = Math.max(0, Math.min(1, value));
    if (media.volume > 0 && media.muted) media.muted = false;
    setVolume(media.volume);
    setMuted(media.muted);
  };
  const trackHover = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    setHover({ fraction, ms: fraction * span });
  };
  // Keep the bar's pointer events off the block underneath: a press here is
  // never the start of a drag or a selection change.
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const silent = muted || volume === 0;

  return (
    <div
      className={`presentation-window__media-control-bar ${styles.bar}`}
      data-testid="presentation-media-control-bar"
      role="group"
      aria-label={labels.position}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={stop}
    >
      <button
        type="button"
        className={styles.button}
        aria-label={playing ? labels.pause : labels.play}
        title={playing ? labels.pause : labels.play}
        onClick={togglePlay}
        data-testid="presentation-media-control-play"
      >
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
      <div
        className={styles.timeline}
        onPointerMove={trackHover}
        onPointerLeave={() => setHover(null)}
        data-testid="presentation-media-control-timeline"
      >
        <input
          type="range"
          className={styles.range}
          min={0}
          max={span}
          step={10}
          value={Math.min(positionMs, span)}
          aria-label={labels.position}
          aria-valuetext={formatPresentationMediaControlTime(positionMs)}
          onChange={(event) => seek(Number(event.target.value))}
          data-testid="presentation-media-control-position"
          style={{ ["--media-progress" as string]: `${(Math.min(positionMs, span) / span) * 100}%` }}
        />
        {bookmarks.map((bookmark) => (
          <button
            key={bookmark.name}
            type="button"
            className={styles.bookmark}
            title={bookmark.name}
            aria-label={bookmark.name}
            aria-pressed={bookmark.name === selectedBookmarkName}
            data-selected={bookmark.name === selectedBookmarkName ? "true" : undefined}
            onClick={() => {
              seek(bookmark.timeMs);
              onSelectBookmark(bookmark.name);
            }}
            data-testid="presentation-media-bookmark"
            data-bookmark-name={bookmark.name}
            data-bookmark-time={bookmark.timeMs}
            style={{ left: `${(bookmark.timeMs / span) * 100}%` }}
          />
        ))}
        {hover ? (
          <span
            className={styles.hoverTime}
            aria-hidden="true"
            data-testid="presentation-media-control-hover-time"
            style={{ left: `${hover.fraction * 100}%` }}
          >
            {formatPresentationMediaControlTime(hover.ms)}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.button}
        aria-label={labels.back}
        title={labels.back}
        onClick={() => step(-PRESENTATION_MEDIA_STEP_MS)}
        data-testid="presentation-media-control-back"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M8 3v10L2 8zM14 3v10L8 8z" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label={labels.forward}
        title={labels.forward}
        onClick={() => step(PRESENTATION_MEDIA_STEP_MS)}
        data-testid="presentation-media-control-forward"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M2 3v10l6-5zM8 3v10l6-5z" fill="currentColor" />
        </svg>
      </button>
      <span
        className={styles.time}
        aria-live="off"
        data-testid="presentation-media-control-time"
      >
        {formatPresentationMediaControlTime(positionMs)}
      </span>
      <span className={styles.volume}>
        <button
          type="button"
          className={styles.button}
          aria-label={muted ? labels.unmute : labels.mute}
          title={muted ? labels.unmute : labels.mute}
          aria-pressed={muted}
          onClick={toggleMute}
          data-testid="presentation-media-control-mute"
        >
          {silent ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
        </button>
        <span className={styles.volumePopover}>
          <input
            type="range"
            className={styles.volumeRange}
            min={0}
            max={100}
            step={1}
            value={Math.round((muted ? 0 : volume) * 100)}
            aria-label={labels.volume}
            onChange={(event) => changeVolume(Number(event.target.value) / 100)}
            data-testid="presentation-media-control-volume"
          />
        </span>
      </span>
    </div>
  );
}
