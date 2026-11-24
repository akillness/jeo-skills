"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";

/**
 * How a media object looks when it is not a live player: PowerPoint draws an
 * audio clip as its speaker icon, and a video as its poster frame -- or, with
 * no poster to show, as a dark frame with a play mark. Both scale with the
 * object's frame (an SVG over the whole box), so a slide thumbnail keeps a
 * recognisable picture instead of a 20px glyph shrunk to a dot.
 */
export function PresentationAudioIcon({
  label,
  style,
  testId = "presentation-media-audio-icon",
}: {
  label: string;
  style?: CSSProperties;
  testId?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      data-testid={testId}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    >
      <svg
        viewBox="0 0 48 48"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <path
          d="M8 18h8l11-9v30l-11-9H8z"
          fill="#4b5563"
          stroke="#1f2937"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M32 17.5a9 9 0 0 1 0 13M36.5 13a15 15 0 0 1 0 22"
          fill="none"
          stroke="#4b5563"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** A video with no poster frame to draw: a dark frame and a play mark. */
export function PresentationVideoPlaceholder({
  label,
  style,
  testId = "presentation-media-video-placeholder",
}: {
  label: string;
  style?: CSSProperties;
  testId?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      data-testid={testId}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: "#111827",
        ...style,
      }}
    >
      <svg
        viewBox="0 0 160 90"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <circle cx="80" cy="45" r="17" fill="rgba(255,255,255,0.18)" stroke="#ffffff" strokeWidth="2.5" />
        <path d="M74 35.5v19l16-9.5z" fill="#ffffff" />
      </svg>
    </span>
  );
}
