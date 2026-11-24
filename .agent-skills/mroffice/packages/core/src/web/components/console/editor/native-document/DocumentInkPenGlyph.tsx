/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Draw tab's pen glyph, drawn as Office draws its pens: a colour block on
 * top (an effect pen wears its gradient), a dark wedge below, and a small tip
 * in the pen's own colour - a nib for a pen, a graphite point over a zigzag
 * sharpening for a pencil, a slanted felt chisel for a highlighter. Pure SVG;
 * the glyph is decoration, the button carries the name. `size` scales the
 * 28x48 drawing (the gallery's 1, the Add Pen menu's 0.8).
 */

import { useId } from "react";

import { documentInkEffectPaint, type DocumentInkPreset } from "../../../../lib/document-ink";

/** The dark lower body every tool shares in Office's Draw-tab pen icons. */
const DARK = "#111827";

export default function DocumentInkPenGlyph({
  preset,
  size = 1,
}: {
  preset: DocumentInkPreset;
  size?: number;
}) {
  const effect = preset.tool === "pen" && preset.effect ? documentInkEffectPaint(preset.effect) : null;
  // One gradient id per rendered glyph, stable across renders (useId), so two
  // effect pens on one page never share a definition.
  const gradientId = `docs-ink-glyph-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const body = effect ? `url(#${gradientId})` : preset.color;
  const pale = preset.color.toLowerCase() === "#ffffff";
  const edge = pale ? "#9ca3af" : "rgba(15, 23, 42, 0.38)";
  const width = Math.round(28 * size);
  const height = Math.round(48 * size);
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox="0 0 28 48"
      data-ink-glyph={preset.tool}
      style={{ display: "block" }}
    >
      {effect ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            {effect.stops.map((stop, index) => (
              <stop
                key={`${stop}-${index}`}
                offset={`${(index / Math.max(1, effect.stops.length - 1)) * 100}%`}
                stopColor={stop}
              />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      {preset.tool === "highlighter" ? (
        // Office's Draw-tab silhouette: a wide colour block, a dark wedge, and
        // the felt chisel cut at a slant (not a flat bar) in the pen's colour.
        <>
          <rect x="4.5" y="3" width="19" height="17" fill={body} stroke={edge} strokeWidth="0.8" />
          <polygon points="4.5,20 23.5,20 23.5,25 18,36 10,36 4.5,25" fill={DARK} />
          <polygon points="10,36 18,36 19.5,45 8.5,42" fill={body} stroke={edge} strokeWidth="0.7" />
        </>
      ) : preset.tool === "pencil" ? (
        // The pencil: a colour block over a sharpened, zigzag edge, the dark
        // cone and the graphite point.
        <>
          <rect x="7" y="3" width="14" height="17" fill={body} stroke={edge} strokeWidth="0.8" />
          <polygon
            points="7,20.5 9.3,17.5 11.7,20.5 14,17.5 16.3,20.5 18.7,17.5 21,20.5 21,26 14,41 7,26"
            fill={DARK}
          />
          <polygon points="12.2,37 15.8,37 14,45" fill={body} stroke={edge} strokeWidth="0.6" />
        </>
      ) : (
        // The pen: a colour block (an effect pen wears its gradient), the dark
        // cone, and a small nib in the ink's own colour.
        <>
          <rect x="7" y="3" width="14" height="17" fill={body} stroke={edge} strokeWidth="0.8" />
          <polygon points="7,20 21,20 21,26 14,40 7,26" fill={DARK} />
          <rect x="12" y="36.5" width="4" height="8.5" rx="2" fill={body} stroke={edge} strokeWidth="0.6" />
        </>
      )}
    </svg>
  );
}
