/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The decoration of an Office theme behind a slide's content: the theme's
 * facets, bands and frames as MRAI drew them (lib/presentation-office-theme-
 * artwork), coloured by the deck's own colour slots so a variant or a colour
 * edit recolours them. Purely presentational: it never takes pointer events
 * and is not part of the slide's blocks.
 */

import { useId, type CSSProperties } from "react";

import {
  PRESENTATION_OFFICE_ARTWORK_UNIT,
  PRESENTATION_OFFICE_ARTWORK_VIEW_BOX,
  officeArtworkPatternDots,
  presentationOfficeArtworkPath,
  presentationOfficeThemeArtwork,
  resolveOfficeArtworkColor,
  type PresentationOfficeArtworkFill,
} from "../../../../lib/presentation-office-theme-artwork";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";

/** The Office theme and variant a deck theme carries, if it is one. */
export function deckOfficeThemeSelection(
  theme: DeckTheme | null | undefined,
): { themeId: string; variantId: string } | undefined {
  const identity = theme?.identity;
  return identity?.selectionKind === "office"
    ? { themeId: identity.themeId, variantId: identity.variantId }
    : undefined;
}











export function deckDrawsOfficeThemeArtwork(
  theme: DeckTheme | null | undefined,
): boolean {
  // A deck whose own theme the import recognised as an Office theme draws its
  // master's own graphics (its inherited blocks), not the gallery's.
  return !!deckOfficeThemeSelection(theme) && theme?.identity?.origin !== "package";
}

function gradientVector(angle: number): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

export function PresentationOfficeThemeArtwork({
  theme,
  themeId,
  variantId,
  layoutId,
  includeGround = true,
  includeGraphics = true,
  nested,
  className,
  style,
}: {
  /** The deck theme: its colour slots colour the drawing. */
  theme: DeckTheme | null | undefined;
  /** Office theme and variant; default: the ones `theme` carries. */
  themeId?: string;
  variantId?: string;
  /** MRAI layout id of the slide (`title`, `title-content`, ...). */
  layoutId?: string | null;
  /** False when the slide has a background of its own. */
  includeGround?: boolean;
  /** False when the slide hides background graphics. */
  includeGraphics?: boolean;
  /** Inside another SVG: the box, in that SVG's units, the slide fills. */
  nested?: { width: number; height: number };
  className?: string;
  style?: CSSProperties;
}) {
  const gradientPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const selection = deckOfficeThemeSelection(theme);
  const shapes = presentationOfficeThemeArtwork(
    themeId ?? selection?.themeId,
    variantId ?? selection?.variantId,
    layoutId,
  ).filter((shape) => (shape.bg ? includeGround : includeGraphics));
  if (!shapes.length) return null;
  const slots = theme?.colorSlots;
  const [width, height] = PRESENTATION_OFFICE_ARTWORK_VIEW_BOX;
  const gradients: Array<{ id: string; fill: PresentationOfficeArtworkFill }> = [];
  const paint = (fill: PresentationOfficeArtworkFill | undefined, index: number) => {
    if (!fill) return { fill: "none" };
    if (fill.c) {
      const solid = resolveOfficeArtworkColor(fill.c, slots);
      return { fill: solid.color, fillOpacity: solid.opacity };
    }
    if (fill.g?.length || (fill.pat && fill.fg)) {
      const id = `${gradientPrefix}-g${index}`;
      gradients.push({ id, fill });
      return { fill: `url(#${id})` };
    }
    return { fill: "none" };
  };
  const drawn = shapes.map((shape, index) => {
    const stroke = shape.s ? resolveOfficeArtworkColor(shape.s, slots) : null;
    return (
      <path
        key={index}
        d={presentationOfficeArtworkPath(shape)}
        {...paint(shape.f, index)}
        {...(stroke
          ? {
              stroke: stroke.color,
              strokeOpacity: stroke.opacity,
              strokeWidth: shape.w ?? PRESENTATION_OFFICE_ARTWORK_UNIT,
            }
          : {})}
      />
    );
  });
  return (
    <svg
      aria-hidden
      className={className}
      data-office-theme-artwork={themeId ?? selection?.themeId}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      {...(nested
        ? { x: 0, y: 0, width: nested.width, height: nested.height }
        : {
            style: {
              display: "block",
              height: "100%",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
              position: "absolute",
              width: "100%",
              ...style,
            } as CSSProperties,
          })}
    >
      {gradients.length ? (
        <defs>
          {gradients.map(({ id, fill }) => {
            if (fill.pat && fill.fg) {
              const fg = resolveOfficeArtworkColor(fill.fg, slots);
              const bg = fill.bg ? resolveOfficeArtworkColor(fill.bg, slots) : null;
              return (
                <pattern
                  key={id}
                  id={id}
                  patternUnits="userSpaceOnUse"
                  patternTransform={`scale(${PRESENTATION_OFFICE_ARTWORK_UNIT})`}
                  width={8}
                  height={8}
                >
                  {bg ? (
                    <rect width={8} height={8} fill={bg.color} fillOpacity={bg.opacity} />
                  ) : null}
                  {officeArtworkPatternDots(fill.pat).map(([x, y, r], dot) => (
                    <circle
                      key={dot}
                      cx={x}
                      cy={y}
                      r={r}
                      fill={fg.color}
                      fillOpacity={fg.opacity}
                    />
                  ))}
                </pattern>
              );
            }
            const stops = (fill.g ?? []).map(([position, color], stopIndex) => {
              const resolved = resolveOfficeArtworkColor(color, slots);
              return (
                <stop
                  key={stopIndex}
                  offset={`${position}%`}
                  stopColor={resolved.color}
                  stopOpacity={resolved.opacity}
                />
              );
            });
            return fill.radial ? (
              <radialGradient
                key={id}
                id={id}
                cx={`${fill.radial[0]}%`}
                cy={`${fill.radial[1]}%`}
                r="75%"
              >
                {stops}
              </radialGradient>
            ) : (
              <linearGradient key={id} id={id} {...gradientVector(fill.ang ?? 0)}>
                {stops}
              </linearGradient>
            );
          })}
        </defs>
      ) : null}
      {drawn}
    </svg>
  );
}
