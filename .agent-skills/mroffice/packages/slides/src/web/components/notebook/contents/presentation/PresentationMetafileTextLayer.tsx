/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";


















/** A font's ascent as a part of its em (Arial's), where a baseline is set. */
const ASCENT = 0.905;

export type MetafileTextRun = readonly [string, number, number, number, number, number | null];

export function metafileTextRuns(source: unknown): MetafileTextRun[] {
  const layer =
    source && typeof source === "object" ? (source as { pictureMetafileText?: unknown }).pictureMetafileText : undefined;
  const runs = layer && typeof layer === "object" ? (layer as { runs?: unknown }).runs : undefined;
  if (!Array.isArray(runs)) return [];
  return runs.filter(
    (run): run is MetafileTextRun =>
      Array.isArray(run) &&
      typeof run[0] === "string" &&
      [run[1], run[2], run[3], run[4]].every((value) => typeof value === "number" && Number.isFinite(value)) &&
      (run[5] === null || (typeof run[5] === "number" && Number.isFinite(run[5]))),
  );
}

/**
 * The layer, laid over the picture's whole (uncropped) drawing: `box` is the
 * style that places the picture's `<img>` (its crop's `cropToCss`), or none
 * for a picture drawn whole over its frame.
 */
export function PresentationMetafileTextLayer({
  runs,
  box,
  orientation,
}: {
  runs: readonly MetafileTextRun[];
  box?: CSSProperties;
  orientation?: CSSProperties;
}) {
  if (!runs.length) return null;
  return (
    <span
      data-testid="presentation-metafile-text-layer"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        ...box,
        ...orientation,
        // Font sizes are parts of the frame's height (`cqh`).
        containerType: "size",
        pointerEvents: "none",
        overflow: "visible",
        color: "transparent",
        // Transparent, never a fill or a shadow a theme could give text.
        background: "none",
        textShadow: "none",
        whiteSpace: "pre",
      }}
    >
      {runs.map(([text, x, y, size, angle], index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: `${size * 100}cqh`,
            lineHeight: 1,
            // The baseline's start at (x, y), turned about it.
            transform: `translateY(-${ASCENT}em) rotate(${-angle}deg)`,
            transformOrigin: `0 ${ASCENT}em`,
            color: "transparent",
          }}
        >
          {text}
        </span>
      ))}
    </span>
  );
}
