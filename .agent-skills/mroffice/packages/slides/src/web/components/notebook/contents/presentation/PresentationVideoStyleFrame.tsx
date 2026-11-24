"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, type ReactNode } from "react";

import { PresentationPictureEffectsFrame } from "./PresentationPictureEffectsFrame";
import { normalizeOfficePictureEffects, type OfficePictureEffects } from "@mrnote/core/web/lib/office-picture-effects.ts";
import { pictureStylePath } from "@mrnote/core/web/lib/office-picture-styles/native.ts";
import { videoStyleOutline } from "../../../../lib/presentation-video-format";
import {
  officeVideoStyle,
  videoStyleAsPictureStyle,
  videoStyleEffects,
} from "@mrnote/core/web/lib/office-video-styles/catalog.ts";

const EMU_PER_PX = 9525;
const angle = (value: unknown) => {
  const degrees = (Number(value) || 0) / 60000;
  return degrees > 180 ? degrees - 360 : degrees;
};

/**
 * Video Format > Video Styles on the slide (PPT-A155): the playing movie (or
 * its poster) drawn inside the style's geometry, with the style's outline,
 * contour and extrusion over and under it, its shadow / glow / soft edges /
 * reflection / bevel through the Picture Effects frame a video's own effects
 * use, and its camera as a CSS transform. The video's own Video Effects
 * replace the style's (an effect named `"none"` takes the style's away), as
 * PowerPoint layers them. The canvas, the slide show and playback share it.
 */
export function PresentationVideoStyleFrame({
  block,
  fillParent,
  children,
}: {
  block: {
    readonly videoStyle?: unknown;
    readonly pictureEffects?: unknown;
    readonly borderColor?: unknown;
    readonly borderWidth?: unknown;
    readonly borderStyle?: unknown;
    readonly width?: number;
    readonly height?: number;
  };
  fillParent?: boolean;
  children: ReactNode;
}) {
  const reactId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const style = officeVideoStyle(block.videoStyle);
  if (!style) return <>{children}</>;
  const w = Math.max(1, (Number(block.width) || 0) / EMU_PER_PX || 480);
  const h = Math.max(1, (Number(block.height) || 0) / EMU_PER_PX || 270);
  const pictureStyle = videoStyleAsPictureStyle(style);
  const d = pictureStylePath(pictureStyle, w, h);
  const own = normalizeOfficePictureEffects(block.pictureEffects) ?? {};
  const merged: Record<string, unknown> = { ...videoStyleEffects(style) };
  for (const [kind, value] of Object.entries(own)) {
    if (value === "none") delete merged[kind];
    else merged[kind] = value;
  }
  const effects = (normalizeOfficePictureEffects(merged) ?? undefined) as OfficePictureEffects | undefined;
  const camera = own.rotation3d ? undefined : style.camera;
  const fov = Math.max(1, Math.min(179, (Number(camera?.fov) || 1_800_000) / 60000));
  const distance = Math.max(w, h) / (2 * Math.tan((fov * Math.PI) / 360));
  const transform =
    camera && (camera.prst !== "orthographicFront" || camera.rev || camera.lat || camera.lon)
      ? `${String(camera.prst).startsWith("perspective") ? `perspective(${Math.round(distance)}px) ` : ""}rotateZ(${-angle(camera.rev)}deg) rotateY(${-angle(camera.lon)}deg) rotateX(${-angle(camera.lat)}deg)`
      : undefined;
  // A Video Border set over the style replaces its line's paint, weight and
  
  const outline = videoStyleOutline(block);
  const line =
    outline === "none"
      ? undefined
      : outline
        ? { ...style.line, color: outline.color, opacity: 1, width: outline.widthPx * EMU_PER_PX, gradient: undefined }
        : style.line;
  const lineWidth = (Number(line?.width) || 0) / EMU_PER_PX;
  const lineDash =
    outline && outline !== "none" && outline.dash !== "solid"
      ? outline.dash === "dashed"
        ? `${lineWidth * 3} ${lineWidth * 2}`
        : `${lineWidth} ${lineWidth}`
      : undefined;
  const contour = style.threeD?.contour;
  const contourWidth = (Number(style.threeD?.contourW) || 0) / EMU_PER_PX;
  const extrusion = (Number(style.threeD?.extrusionH) || 0) / EMU_PER_PX;
  const clipId = `presentation-video-style-${reactId}`;
  const gradientId = `${clipId}-line`;
  const overlay = (content: ReactNode, behind = false) => (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      overflow="visible"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: behind ? -1 : undefined }}
    >
      {content}
    </svg>
  );
  return (
    <span
      data-testid="presentation-video-style"
      data-video-style={style.id}
      style={{
        position: "relative",
        display: fillParent ? "block" : "inline-block",
        ...(fillParent ? { width: "100%", height: "100%" } : {}),
        transform,
        transformOrigin: "center",
        isolation: "isolate",
      }}
    >
      <PresentationPictureEffectsFrame block={{ pictureEffects: effects, width: block.width, height: block.height }} fillParent={fillParent}>
        {extrusion > 0
          ? overlay(<path d={d} fill={style.threeD?.extrusion?.color ?? "#666666"} transform={`translate(0 ${extrusion})`} />, true)
          : null}
        <span
          style={{
            position: "relative",
            display: "block",
            width: "100%",
            height: "100%",
            clipPath: `url(#${clipId})`,
          }}
        >
          <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                <path d={d} transform={`scale(${1 / w} ${1 / h})`} />
              </clipPath>
            </defs>
          </svg>
          {children}
        </span>
        {line && lineWidth > 0
          ? overlay(
              <>
                {line.gradient ? (
                  <defs>
                    <linearGradient id={gradientId} gradientTransform={`rotate(${(Number(line.gradient.angle) || 0) / 60000} 0.5 0.5)`}>
                      {line.gradient.stops.map((stop) => (
                        <stop key={stop.pos} offset={stop.pos / 100000} stopColor={stop.color} stopOpacity={stop.opacity} />
                      ))}
                    </linearGradient>
                  </defs>
                ) : null}
                <path
                  d={d}
                  fill="none"
                  stroke={line.gradient ? `url(#${gradientId})` : line.color}
                  strokeOpacity={line.opacity}
                  strokeWidth={lineWidth}
                  strokeDasharray={lineDash}
                  strokeLinejoin={line.cap === "rnd" ? "round" : "miter"}
                  data-video-style-outline={outline ? "border" : undefined}
                  data-testid="presentation-video-style-line"
                />
                {line.cmpd ? (
                  // A compound (thick-thin) line: a thin gap a quarter in from the outside.
                  <path d={d} fill="none" stroke="#ffffff" strokeWidth={lineWidth / 5} opacity={0.9} />
                ) : null}
              </>,
            )
          : null}
        {contour && contourWidth > 0
          ? overlay(<path d={d} fill="none" stroke={contour.color} strokeOpacity={contour.opacity} strokeWidth={contourWidth} />)
          : null}
      </PresentationPictureEffectsFrame>
    </span>
  );
}
