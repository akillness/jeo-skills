"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, type CSSProperties, type ReactNode } from "react";

import styles from "./FluentLibraryIcon.module.css";

export interface FluentLibraryIconPalette {
  primaryTop: string;
  primaryBottom: string;
  secondaryTop: string;
  secondaryBottom: string;
  badgeTop: string;
  badgeBottom: string;
  accent: string;
  shadow: string;
}

export interface FluentLibraryIconIds {
  primary: string;
  secondary: string;
  badge: string;
  shine: string;
  aura: string;
  shadow: string;
}

interface FluentLibraryIconProps {
  className?: string;
  family: "notebook" | "page" | "folder";
  kind: string;
  palette: FluentLibraryIconPalette;
  /** Extra state the artwork's own CSS reads, e.g. a folder being open. */
  state?: Readonly<Record<`data-${string}`, string>>;
  /** Just the resource, cropped to it: no tile, ground or constellation.
   *  For chip-sized uses (a tag's book beside its name) where the canvas
   *  would only add noise. */
  bare?: boolean;
  children: (ids: FluentLibraryIconIds) => ReactNode;
}

/**
 * Shared 64 px optical canvas for MRNote library resources.
 *
 * The canvas supplies only depth, light and a tiny memory constellation. The
 * child artwork carries the meaning, so a notebook still reads as a notebook
 * and a page type stays identifiable when rendered at the 36 px list density.
 */
export function FluentLibraryIcon({
  className,
  family,
  kind,
  palette,
  state,
  bare = false,
  children,
}: FluentLibraryIconProps) {
  const instanceId = useId().replace(/:/g, "");
  const ids: FluentLibraryIconIds = {
    primary: `${instanceId}-${family}-${kind}-primary`,
    secondary: `${instanceId}-${family}-${kind}-secondary`,
    badge: `${instanceId}-${family}-${kind}-badge`,
    shine: `${instanceId}-${family}-${kind}-shine`,
    aura: `${instanceId}-${family}-${kind}-aura`,
    shadow: `${instanceId}-${family}-${kind}-shadow`,
  };
  const dataAttributes =
    family === "notebook"
      ? { "data-notebook-type-icon": kind }
      : family === "folder"
        ? { "data-folder-artwork": kind }
        : { "data-page-type-artwork": kind };

  return (
    <svg
      viewBox={bare ? "9.5 8 46 46" : "0 0 64 64"}
      className={`${styles.icon}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      focusable="false"
      data-library-icon-family={family}
      data-library-icon-kind={kind}
      data-library-icon-bare={bare || undefined}
      style={
        {
          "--library-icon-accent": palette.accent,
          "--library-icon-shadow": palette.shadow,
        } as CSSProperties
      }
      {...dataAttributes}
      {...state}
    >
      <defs>
        <linearGradient id={ids.primary} x1="15" y1="10" x2="51" y2="54">
          <stop offset="0" stopColor={palette.primaryTop} />
          <stop offset="1" stopColor={palette.primaryBottom} />
        </linearGradient>
        <linearGradient id={ids.secondary} x1="22" y1="8" x2="55" y2="52">
          <stop offset="0" stopColor={palette.secondaryTop} />
          <stop offset="1" stopColor={palette.secondaryBottom} />
        </linearGradient>
        <linearGradient id={ids.badge} x1="15" y1="10" x2="43" y2="50">
          <stop offset="0" stopColor={palette.badgeTop} />
          <stop offset="1" stopColor={palette.badgeBottom} />
        </linearGradient>
        <linearGradient id={ids.shine} x1="7" y1="4" x2="55" y2="60">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".96" />
          <stop offset=".46" stopColor="#ffffff" stopOpacity=".24" />
          <stop offset="1" stopColor="#dce6e3" stopOpacity=".12" />
        </linearGradient>
        <radialGradient id={ids.aura} cx="0" cy="0" r="1">
          <stop offset="0" stopColor={palette.primaryTop} stopOpacity=".24" />
          <stop
            offset=".56"
            stopColor={palette.secondaryTop}
            stopOpacity=".1"
          />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter
          id={ids.shadow}
          x="-30%"
          y="-28%"
          width="170%"
          height="176%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0.2"
            dy="2.35"
            stdDeviation="2.35"
            floodColor={palette.shadow}
            floodOpacity=".25"
          />
        </filter>
      </defs>

      <g data-icon-part="canvas" display={bare ? "none" : undefined}>
        <rect
          x="3"
          y="2.75"
          width="58"
          height="58"
          rx="17"
          fill="#ffffff"
          fillOpacity=".82"
          stroke="#dce5e2"
          strokeWidth=".8"
        />
        <rect
          x="4.1"
          y="3.85"
          width="55.8"
          height="55.8"
          rx="15.9"
          fill={`url(#${ids.aura})`}
        />
        <path
          d="M7.2 20.3C8.8 11 15.4 5.8 26 5.8h20.1c5.3 0 9.1 2 11.5 6.1"
          fill="none"
          stroke={`url(#${ids.shine})`}
          strokeLinecap="round"
          strokeWidth="1.2"
        />
      </g>

      <ellipse
        data-icon-part="ground"
        display={bare ? "none" : undefined}
        cx="34"
        cy="53.25"
        rx="19.5"
        ry="4.2"
        fill={palette.accent}
        opacity=".13"
      />

      <g
        data-icon-part="constellation"
        opacity=".82"
        display={bare ? "none" : undefined}
      >
        <path
          d="M43.7 11.5c4.6 1 7.9 3 10.1 6.2"
          fill="none"
          stroke={palette.primaryTop}
          strokeLinecap="round"
          strokeOpacity=".34"
          strokeWidth=".8"
        />
        <circle
          data-icon-part="memory-node-major"
          cx="44.1"
          cy="11.55"
          r="1.55"
          fill={palette.primaryBottom}
        />
        <circle cx="50.6" cy="14.4" r="1" fill={palette.secondaryBottom} />
        <circle cx="54" cy="18" r=".72" fill={palette.accent} />
      </g>

      <g data-icon-part="resource" filter={`url(#${ids.shadow})`}>
        {children(ids)}
      </g>
    </svg>
  );
}
