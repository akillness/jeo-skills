/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Hand-drawn ribbon icons for the presentation editor's PowerPoint-parity
 * controls — the commands PPT gives a distinctive glyph that lucide has no
 * equivalent for. Their default remains the legacy 24×24/currentColor/2px
 * contract used by non-Home tabs. Home call sites opt into a refined 1/1.4px
 * two-tone semantic treatment without changing those other physical surfaces.
 *
 * Every icon takes the same `{ size }` prop the lucide components take, so a
 * call site can swap one for the other without touching layout.
 */

import { useId, type ReactNode } from "react";

import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import type { LayoutDefinition } from "@mrnote/core/web/lib/presentation-layouts.ts";
import type {
  SlideTransitionClockOption,
  SlideTransitionCornerOption,
  SlideTransitionOrientationOption,
  SlideTransitionP14TypedOption,
  SlideTransitionP14TypedOptionsKind,
  SlideTransitionShapeOption,
  SlideTransitionSideDirection,
  SlideTransitionSplitOption,
  SlideTransitionZoomOption,
} from "@mrnote/core/web/lib/presentation-transitions.ts";

interface RibbonIconProps {
  home?: boolean;
  size?: number;
}

interface InkRibbonIconProps extends RibbonIconProps {
  color?: string;
}

/** A table grid, with distinct pen and eraser affordances for native drawing. */
export function IconTableDraw({ size = 32, erase = false }: RibbonIconProps & { erase?: boolean }) {
  return (
    <svg {...frame(size, true)} data-presentation-ribbon-icon={erase ? "table-erase" : "table-draw"}>
      <path d="M2.5 8h17v13h-17zM2.5 14.5h17M8.2 8v13M13.8 14.5V21" strokeWidth="1" />
      {erase ? (
        <g stroke="#ab36b8" strokeWidth="1.2" fill="#fff">
          <path d="m13 14-4-4L17 2l5 5-8 8z" />
          <path d="m12 7 5 5" />
        </g>
      ) : (
        <g stroke="#269cc7" strokeWidth="1.2" fill="#fff">
          <path d="m8 15 1-4L19 1.5c.5-.5 1.3-.5 1.8 0l1.2 1.2c.5.5.5 1.3 0 1.8L12 14z" />
          <path d="m17 3.5 3 3M9 11l3 3M8 15l2-.5" />
        </g>
      )}
    </svg>
  );
}

/** Review's document actions share a quiet frame with a distinct action badge. */
export function IconReviewComment({ action, size = 24 }: RibbonIconProps & {
  action: "new" | "delete" | "previous" | "next" | "show";
}) {
  return (
    <svg {...frame(size, true)} data-presentation-ribbon-icon={`review-comment-${action}`}>
      {action === "show" ? <path className={homeRole(true, "detail")} d="M7 3h12a3 3 0 0 1 3 3v10" /> : null}
      <path d="M16 6H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h2v3l5-3h5a3 3 0 0 0 3-3v-5" />
      {action === "show" ? <path d="M16 6h1a3 3 0 0 1 3 3v3" /> : (
        <>
          <circle cx="18" cy="6" r="5" className={homeRole(true, "accentSurface")} />
          <path className={homeRole(true, "accent")} d={
            action === "new" ? "M18 3.5v5M15.5 6h5" :
            action === "delete" ? "m16.2 4.2 3.6 3.6m0-3.6-3.6 3.6" :
            action === "previous" ? "M20.5 6h-5m2-2-2 2 2 2" :
            "M15.5 6h5m-2-2 2 2-2 2"
          } />
        </>
      )}
    </svg>
  );
}

export function IconReviewActivity({ kind, size = 24 }: RibbonIconProps & {
  kind: "read" | "edits";
}) {
  return (
    <svg {...frame(size, true)} data-presentation-ribbon-icon={`review-${kind}`}>
      <rect x="2" y="4" width="19" height="16" rx="3" />
      <path className={homeRole(true, "detail")} d="M6 8h11M6 12h7" />
      {kind === "read" ? (
        <path className={homeRole(true, "accent")} d="m7 16 2 2 4-4" />
      ) : (
        <>
          <path className={homeRole(true, "accentSurface")} d="M12 17s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" />
          <circle className={homeRole(true, "accent")} cx="17" cy="17" r="1.5" />
        </>
      )}
    </svg>
  );
}

/** Timing uses the same fine two-tone ink as the other PowerPoint commands. */
export function IconTimingStart({ size = 20 }: RibbonIconProps) {
  return (
    <svg {...frame(size, true)} data-presentation-ribbon-icon="timing-start">
      <circle cx="11" cy="12" r="8" />
      <path className={homeRole(true, "accentSurface")} d="m9 8 6 4-6 4z" stroke="none" />
      <path className={homeRole(true, "accent")} d="m9 8 6 4-6 4z" />
      <path className={homeRole(true, "detail")} d="M20 5h2M21 9h1" />
    </svg>
  );
}

export function IconTimingDuration({ size = 20 }: RibbonIconProps) {
  return (
    <svg {...frame(size, true)} data-presentation-ribbon-icon="timing-duration">
      <path d="M10 2h4M12 2v3M18 5l1.5-1.5" />
      <circle cx="12" cy="13" r="8" />
      <path className={homeRole(true, "accentSurface")} d="M12 7a6 6 0 0 1 6 6h-6z" stroke="none" />
      <path className={homeRole(true, "accent")} d="M12 8v5l3 2" />
      <path className={homeRole(true, "detail")} d="M6 13h1M12 18v1" />
    </svg>
  );
}

/** Transitions > Sound: a speaker sending sound waves, beside Duration's watch. */
export function IconTimingSound({ size = 20 }: RibbonIconProps) {
  return (
    <svg {...frame(size, true)} data-presentation-ribbon-icon="timing-sound">
      <path className={homeRole(true, "accentSurface")} d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" stroke="none" />
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path className={homeRole(true, "accent")} d="M15.2 9.3a4 4 0 0 1 0 5.4M17.8 6.8a7.5 7.5 0 0 1 0 10.4" />
    </svg>
  );
}

export function IconTimingDelay({ size = 20 }: RibbonIconProps) {
  return (
    <svg {...frame(size, true)} data-presentation-ribbon-icon="timing-delay">
      <path d="M6 3h12M6 21h12M7 3v3c0 3 3 4 5 6-2 2-5 3-5 6v3M17 3v3c0 3-3 4-5 6 2 2 5 3 5 6v3" />
      <path className={homeRole(true, "accentSurface")} d="m8 7 4 4 4-4zm0 12 4-4 4 4z" stroke="none" />
      <path className={homeRole(true, "accent")} d="M9 7h6M9 18l3-3 3 3M12 12v1" />
    </svg>
  );
}

type PresentationHomeIconRole =
  "accent" | "accentFill" | "accentSurface" | "detail";

function homeRole(home: boolean | undefined, role: PresentationHomeIconRole) {
  return home ? `presentation-home-icon__${role}` : undefined;
}

function frame(size: number | undefined, home = false) {
  const px = size ?? 24;
  return {
    width: px,
    height: px,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: home ? 1.4 : 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    shapeRendering: home ? ("geometricPrecision" as const) : undefined,
    "aria-hidden": true as const,
    "data-presentation-home-tone": home ? ("true" as const) : undefined,
  };
}

/** Paste: an Office clipboard carrying a compact slide/text payload. */
export function IconPaste({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="paste">
      <path d="M8 5H6a2 2 0 0 0 -2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2" />
      <rect x="8" y="2" width="8" height="5" rx="2" />
      <path d="M8 11h8" />
      <path d="M8 15h8" />
      <path d="M8 19h5" />
    </svg>
  );
}

/** Cut: compact Office-style scissors with distinct finger loops and blades. */
export function IconCut({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="cut">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.2 7.3L20 14" />
      <path d="M8.2 16.7L20 10" />
    </svg>
  );
}

/** Copy: an offset pair of Office pages with a compact content cue. */
export function IconCopy({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="copy">
      <path d="M8 7V5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-1" />
      <rect x="4" y="7" width="13" height="14" rx="2" />
      <path d="M8 12h5" />
      <path d="M8 16h5" />
    </svg>
  );
}

/** Home Delete: PowerPoint's quiet outline bin, distinct from table deletion. */
export function IconHomeDelete({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="home-delete">
      <path d="M4 6h16" />
      <path className={homeRole(home, "accent")} d="M9 3h6l1 3H8z" />
      <path d="M6.5 6l.8 15h9.4l.8-15" />
      <path
        className={homeRole(home, "detail")}
        d="M10 10v7M14 10v7"
        opacity="0.72"
      />
    </svg>
  );
}

/** Format Painter: an Office paint head connected to its compact brush. */
export function IconFormatPainter({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="format-painter">
      <rect x="3" y="3" width="18" height="6" rx="2" />
      <path d="M12 9v4" />
      <path d="M9 13h6l1 8H8z" />
      <path d="M10 17h4" />
    </svg>
  );
}

/** Draw Mode: Office-style pen nib entering a freehand stroke. */
export function IconDrawMode({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="draw-mode">
      <path d="M14.5 3.5l6 6L10 20l-6.5.5L4 14z" />
      <path
        className={homeRole(home, "detail")}
        d="M12.5 5.5l6 6M4 14l6 6M9 15l-2 2"
      />
      <path
        className={homeRole(home, "accent")}
        d="M3 22c4-1 6-1 9 0"
      />
    </svg>
  );
}

/** Ink Eraser: a tilted eraser crossing an ink stroke. */
export function IconInkEraser({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="ink-eraser">
      <path d="M15.5 3.5l5 5L10 19H6l-3-3z" />
      <path className={homeRole(home, "detail")} d="M12 7l5 5M6 19h14" />
      <path
        className={homeRole(home, "accent")}
        d="M3 22c5-1 10-1 18 0"
      />
    </svg>
  );
}

/** Lasso Select: dashed freehand loop with a compact selection pointer. */
export function IconInkLasso({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="ink-lasso">
      <path
        className={homeRole(home, "detail")}
        d="M18.5 15.5c2-1.4 2.8-3.4 1.9-5.4C19.2 7.3 15.4 5.5 11 5.5S2.8 7.6 3.2 11c.4 3.2 4.8 5 9.4 4.5"
        strokeDasharray="2.2 2.2"
      />
      <path
        className={homeRole(home, "accentFill")}
        d="M13 12.5l7 4-3.1 1.1-1.2 3.1z"
      />
    </svg>
  );
}

/** Draw with Touch: a fingertip entering an ink stroke on the slide. */
export function IconDrawWithTouch({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="draw-with-touch">
      <path d="M8.5 12V6.2a1.6 1.6 0 0 1 3.2 0V11" />
      <path d="M11.7 9.2a1.55 1.55 0 0 1 3.1 0V12" />
      <path d="M14.8 10.3a1.5 1.5 0 0 1 3 0v3.2" />
      <path d="M17.8 12.2a1.45 1.45 0 0 1 2.9 0v2.7c0 4-2.7 6.1-6.4 6.1h-1.1c-2.1 0-3.8-.9-5.2-2.6l-3.8-4.6a1.6 1.6 0 0 1 2.4-2.1l1.9 1.9" />
      <path
        className={homeRole(home, "accent")}
        d="M3 5.2c1.2-.9 2.5-1.4 4-1.7M2.8 8.5c1.3-.7 2.5-1 3.8-1.1"
      />
    </svg>
  );
}

/** One real pen preset: a fountain nib above its authored colour stroke. */
export function IconInkPen({ color, home, size }: InkRibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="ink-pen-preset"
      style={color ? { color } : undefined}
    >
      <path d="M8 3.5h8l2 6-6 9-6-9z" />
      <path d="M12 3.5v8M9.6 14.8h4.8" />
      <circle cx="12" cy="11.8" r="1.2" fill="currentColor" stroke="none" />
      <path d="M4 21c4-1.4 11-1.4 16 0" strokeWidth={home ? 2.2 : 2.6} />
    </svg>
  );
}

/** One real highlighter preset with the wide translucent marker stroke. */
export function IconInkHighlighter({ color, home, size }: InkRibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="ink-highlighter-preset"
      style={color ? { color } : undefined}
    >
      <path d="M9 3h6l3 10-4 4h-4l-4-4z" />
      <path d="M8 9h8M10 17h4" />
      <path
        d="M3.5 21h17"
        opacity="0.55"
        strokeWidth={home ? 4.6 : 5}
      />
    </svg>
  );
}

/** Draw-tab stencil: the movable straightedge with ruled tick marks. */
export function IconInkRuler({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="ink-ruler">
      <g transform="rotate(-28 12 12)">
        <rect x="2.5" y="7" width="19" height="10" rx="2" />
        <path
          className={homeRole(home, "detail")}
          d="M6 7v4M9 7v2.5M12 7v4M15 7v2.5M18 7v4"
        />
        <path className={homeRole(home, "accent")} d="M3 14h18" />
      </g>
    </svg>
  );
}

/** Hide the ribbon for the pen palette: the ribbon bar folding up, the palette left floating below. */
export function IconInkHideRibbon({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="ink-hide-ribbon">
      <rect x="3" y="3" width="18" height="5" rx="1.5" />
      <path className={homeRole(home, "accent")} d="M8.5 13.5 12 10l3.5 3.5" />
      <rect className={homeRole(home, "detail")} x="9" y="15.5" width="6" height="5.5" rx="1.6" />
    </svg>
  );
}

/** The pen's paper: a sheet with its corner turned up, ruled, squared or dotted. */
function PaperSheet({ home, size, kind, children }: RibbonIconProps & { kind: string; children: ReactNode }) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon={`ink-paper-${kind}`}>
      <path d="M5 3h14v12l-6 6H5z" />
      <path className={homeRole(home, "detail")} d="M19 15h-6v6" />
      {children}
    </svg>
  );
}
export function IconInkPaperRule({ home, size }: RibbonIconProps) {
  return (
    <PaperSheet home={home} size={size} kind="rule">
      <path className={homeRole(home, "accent")} d="M8 7.5h8M8 11h8M8 14.5h3" />
    </PaperSheet>
  );
}
export function IconInkPaperGrid({ home, size }: RibbonIconProps) {
  return (
    <PaperSheet home={home} size={size} kind="grid">
      <path className={homeRole(home, "accent")} d="M9.5 3v15M14 3v10M5 7.5h14M5 12h14" />
    </PaperSheet>
  );
}
export function IconInkPaperDot({ home, size }: RibbonIconProps) {
  return (
    <PaperSheet home={home} size={size} kind="dot">
      {[8, 12, 16].flatMap((x) => [7, 11].map((y) => (
        <circle key={`${x}-${y}`} className={homeRole(home, "accent")} cx={x} cy={y} r="0.9" fill="currentColor" stroke="none" />
      )))}
      <circle className={homeRole(home, "accent")} cx="8" cy="15" r="0.9" fill="currentColor" stroke="none" />
    </PaperSheet>
  );
}

/** New Slide: a native slide frame with a compact add badge. */
export function IconNewSlide({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="new-slide">
      <rect x="3" y="5" width="15" height="12" rx="2" />
      <path className={homeRole(home, "detail")} d="M6 9h9M6 13h6" />
      <path className={homeRole(home, "accent")} d="M19 15v6M16 18h6" />
    </svg>
  );
}

/** Insert Table: a native slide-table grid with a small creation badge. */
export function IconInsertTable({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="insert-table">
      <rect
        className={homeRole(home, "accentSurface")}
        x="3"
        y="4"
        width="16"
        height="16"
        rx="2"
      />
      <path
        className={homeRole(home, "detail")}
        d="M3 9h16M3 14h16M8.3 4v16M13.7 4v16"
      />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="19"
        cy="18.5"
        r="3.5"
      />
      <path
        className={homeRole(home, "accent")}
        d="M19 16.8v3.4M17.3 18.5h3.4"
      />
    </svg>
  );
}

/** Insert Cameo: a live-camera portrait framed as a slide object. */
export function IconInsertCameo({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="insert-cameo">
      <rect
        className={homeRole(home, "detail")}
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
      />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="12"
        cy="9"
        r="3"
      />
      <path
        className={homeRole(home, "accent")}
        d="M6.5 18c.8 -3 2.7 -4.7 5.5 -4.7s4.7 1.7 5.5 4.7"
      />
      <circle
        className={homeRole(home, "accentFill")}
        cx="18.1"
        cy="6.9"
        r="1.25"
      />
    </svg>
  );
}

/** Compact media-source metaphors, using the same two-tone ribbon roles. */
export function IconInsertMediaSource({
  kind,
  home = true,
  size = 22,
}: RibbonIconProps & {
  kind: "video-file" | "video-online" | "audio-file" | "audio-record";
}) {
  return (
    <svg
      {...frame(size, home)}
      focusable="false"
      data-presentation-ribbon-icon={kind}
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      {kind === "video-file" || kind === "audio-file" ? (
        <>
          <path
            className={homeRole(home, "detail")}
            d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z"
          />
          <path
            className={homeRole(home, "detail")}
            d="M13 3v5a2 2 0 0 0 2 2h5"
          />
          {kind === "video-file" ? (
            <path
              className={homeRole(home, "accentSurface")}
              d="m9 11 6 4-6 4Z"
            />
          ) : (
            <>
              <path className={homeRole(home, "accent")} d="M13 11v6m0-6 3 1" />
              <ellipse
                className={homeRole(home, "accentSurface")}
                cx="10.5"
                cy="17.5"
                rx="2.5"
                ry="1.8"
              />
            </>
          )}
        </>
      ) : kind === "video-online" ? (
        <>
          <rect
            className={homeRole(home, "detail")}
            x="2"
            y="4"
            width="20"
            height="16"
            rx="2.5"
          />
          <path
            className={homeRole(home, "detail")}
            d="M2 9h20M5 6.5h.1M8 6.5h.1"
          />
          <path
            className={homeRole(home, "accentSurface")}
            d="m10 11 6 3.5-6 3.5Z"
          />
        </>
      ) : (
        <>
          <rect
            className={homeRole(home, "accentSurface")}
            x="8.5"
            y="2.5"
            width="7"
            height="12"
            rx="3.5"
          />
          <path
            className={homeRole(home, "detail")}
            d="M5.5 10v1.5a6.5 6.5 0 0 0 13 0V10M12 18v3M8.5 21h7"
          />
          <path className={homeRole(home, "detail")} d="M11 6h2M11 9h2" />
        </>
      )}
    </svg>
  );
}

/** Insert Video: a film frame with a centered playback mark. */
export function IconInsertVideo({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="insert-video">
      <rect
        className={homeRole(home, "detail")}
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
      />
      <path
        className={homeRole(home, "detail")}
        d="M6 4v16M18 4v16M3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3"
      />
      <path
        className={homeRole(home, "accent")}
        d="M10 8.3l5.2 3.7l-5.2 3.7z"
      />
    </svg>
  );
}

/** Insert Audio: a speaker tile with two restrained sound waves. */
export function IconInsertAudio({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="insert-audio">
      <path
        className={homeRole(home, "detail")}
        d="M4 9h4l5 -4v14l-5 -4H4z"
      />
      <path
        className={homeRole(home, "accent")}
        d="M16 8.3c1 .9 1.5 2.1 1.5 3.7S17 14.8 16 15.7M18.8 5.8c1.7 1.7 2.6 3.7 2.6 6.2s-.9 4.5 -2.6 6.2"
      />
    </svg>
  );
}

/** Media preview: a compact transport tile instead of a generic play glyph. */
export function IconMediaPreview({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="media-preview"><rect className={homeRole(home, "detail")} x="3" y="5" width="18" height="14" rx="2.2" /><path className={homeRole(home, "accentSurface")} d="M9.2 8.4 15.8 12l-6.6 3.6z" /><path className={homeRole(home, "accent")} d="M5.5 17h13" /></svg>;
}

/** Trim video: a film frame bounded by two precise edit handles. */
export function IconMediaTrim({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="media-trim"><rect className={homeRole(home, "detail")} x="4.5" y="5" width="15" height="14" rx="1.8" /><path className={homeRole(home, "detail")} d="M7 5v14M17 5v14M4.5 8h2.5M4.5 12h2.5M4.5 16h2.5M17 8h2.5M17 12h2.5M17 16h2.5" /><path className={homeRole(home, "accent")} d="M2.5 3v6M2.5 3h3M21.5 15v6M18.5 21h3" /></svg>;
}

/** Video outline: the media frame and its editable border read separately. */
export function IconVideoOutline({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="video-outline"><rect className={homeRole(home, "detail")} x="3" y="4" width="18" height="14" rx="2" /><path className={homeRole(home, "accentSurface")} d="M10 8.2 15.2 11 10 13.8z" /><path className={homeRole(home, "accent")} d="M4 21h16M7 18l-2 3" /></svg>;
}

/** Captions: a CC card paired with a small edit nib. */
export function IconMediaCaptions({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="media-captions"><rect className={homeRole(home, "detail")} x="3" y="4" width="18" height="14" rx="2.2" /><path className={homeRole(home, "detail")} d="M10 9.2a2.2 2.2 0 1 0 0 3.6M17 9.2a2.2 2.2 0 1 0 0 3.6" /><path className={homeRole(home, "accent")} d="m14.5 20 4.7-4.7 1.5 1.5-4.7 4.7-2 .5z" /></svg>;
}

/** Audio volume: an Office speaker tile with restrained level bars. */
export function IconMediaVolume({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="media-volume"><path className={homeRole(home, "detail")} d="M3.5 9h4l4.5-3.5v13L7.5 15h-4z" /><path className={homeRole(home, "accent")} d="M15 9v6M18 7v10M21 5v14" /></svg>;
}

/** Audio start: a playback mark paired with a timing spark. */
export function IconMediaStart({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="media-start"><circle className={homeRole(home, "detail")} cx="12" cy="12" r="8" /><path className={homeRole(home, "accentSurface")} d="m10 8 6 4-6 4z" /><path className={homeRole(home, "accent")} d="m4.8 3.5-1.4 3h2.8L4.8 9.2" /></svg>;
}

/** Audio style reset: a speaker returning to its neutral appearance. */
export function IconAudioNoStyle({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="audio-no-style"><path className={homeRole(home, "detail")} d="M3.5 9h4l4.5-3.5v13L7.5 15h-4zM15 9.2c1 .8 1.5 1.7 1.5 2.8s-.5 2-1.5 2.8" /><path className={homeRole(home, "accent")} d="M19.5 7v4h-4M19.5 11a5 5 0 1 0 .2 4.2" /></svg>;
}

/** Play in background: one audio source continuing through slide changes. */
export function IconAudioBackground({ home = true, size }: RibbonIconProps) {
  return <svg {...frame(size, home)} data-presentation-ribbon-icon="audio-background"><path className={homeRole(home, "detail")} d="M3.5 9h4l4.5-3.5v13L7.5 15h-4zM15 9.2c1 .8 1.5 1.7 1.5 2.8s-.5 2-1.5 2.8" /><path className={homeRole(home, "accent")} d="M17 5h4v4M21 5l-5 5M21 19h-4v-4M17 19l4-4" /></svg>;
}

/** AI Picture: layered image cards with the sparkle of a drawn-on-request picture. */
export function IconInsertAiImage({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="insert-ai-image"
    >
      <rect
        className={homeRole(home, "detail")}
        x="5"
        y="3"
        width="16"
        height="14"
        rx="2"
      />
      <path className={homeRole(home, "detail")} d="M3 7v12a2 2 0 0 0 2 2h13" />
      <circle className={homeRole(home, "accentSurface")} cx="16.5" cy="7.5" r="1.5" />
      <path
        className={homeRole(home, "accent")}
        d="M7 15l3.7 -4l2.5 2.5l2 -2l4.2 3.5M5.2 3.2l.5 1.3l1.3.5l-1.3.5l-.5 1.3l-.5 -1.3l-1.3 -.5l1.3 -.5z"
      />
    </svg>
  );
}

/** Footer: a slide frame whose bottom information rail is highlighted. */
export function IconInsertFooter({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="insert-footer">
      <rect
        className={homeRole(home, "detail")}
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
      />
      <path className={homeRole(home, "detail")} d="M6 8h7M6 11h10" />
      <path
        className={homeRole(home, "accent")}
        d="M5.5 16.5h13M7 18.5h7"
      />
    </svg>
  );
}

/** Layout: a slide split into its title and two content placeholders. */
export function IconSlideLayout({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="slide-layout">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path className={homeRole(home, "detail")} d="M6 8h12" />
      <rect
        className={homeRole(home, "accentSurface")}
        x="6"
        y="12"
        width="5"
        height="5"
        rx="1"
      />
      <rect
        className={homeRole(home, "accentSurface")}
        x="13"
        y="12"
        width="5"
        height="5"
        rx="1"
      />
    </svg>
  );
}

/** Reset Slide: a slide frame paired with an unambiguous reset arrow. */
export function IconResetSlide({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="reset-slide">
      <rect x="3" y="7" width="15" height="13" rx="2" />
      <path d="M6 11h9" />
      <path d="M20 4v6h-6" />
      <path d="M20 10a8 8 0 0 0 -12 -5" />
    </svg>
  );
}

/** Reset Picture: a picture frame paired with a reversible reset arrow. */
export function IconResetPicture({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="reset-picture">
      <rect x="3" y="7" width="15" height="13" rx="2" />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="7.5"
        cy="11"
        r="1.25"
      />
      <path
        className={homeRole(home, "detail")}
        d="M5.5 18l4-4 3 3 2-2 3.5 3.5"
      />
      <path className={homeRole(home, "accent")} d="M20 4v6h-6" />
      <path d="M20 10a8 8 0 0 0-11-5" />
    </svg>
  );
}

/** Duplicate Slide: two offset presentation frames, distinct from Copy. */
export function IconDuplicateSlide({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="duplicate-slide">
      <rect x="7" y="7" width="13" height="12" rx="2" />
      <path
        className={homeRole(home, "detail")}
        d="M16 7V5a2 2 0 0 0 -2 -2H5a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h2"
      />
      <path className={homeRole(home, "accent")} d="M10 11h7M10 15h5" />
    </svg>
  );
}

/** Paste keeping text only: a clipboard whose sheet carries a bare letter A. */
export function IconPasteTextOnly({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a3 3 0 0 1 6 0" />
      {/* The A: two legs and a crossbar. */}
      <path d="M9.5 17l2.5 -6l2.5 6" />
      <path d="M10.6 14.6h3" />
    </svg>
  );
}

/** New slide from a layout: a slide with title + body regions and a plus. */
export function IconSlideFromLayout({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3" y="5" width="14" height="11" rx="2" />
      <path d="M6 8.5h8" />
      <path d="M6 12h5" />
      <path d="M19 14v6" />
      <path d="M16 17h6" />
    </svg>
  );
}

/** Section menu: a collapsible section header above its grouped slides. */
export function IconSectionMenu({ size }: RibbonIconProps) {
  // A section, as PowerPoint draws one: its header bar over its slides.
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="section-menu">
      <rect x="3" y="3.5" width="18" height="3.5" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="5" y="9.5" width="14" height="11" rx="1.6" />
      <path d="M8.5 13.5h7M8.5 16.75h4.5" />
    </svg>
  );
}

/** Rehearse timings: the running slide show paired with its session clock. */
export function IconRehearseTimings({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <circle cx="12" cy="10" r="4" />
      <path d="M12 7.5v2.7l1.8 1.2" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}

/** Transition None: a slide frame crossed by the Office-style no-effect slash. */
export function IconTransitionNone({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-none">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M5 19L19 5" />
    </svg>
  );
}

/** Morph: two object states connected across adjacent slide frames. */
export function IconTransitionMorph({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-morph">
      <rect x="2.5" y="5" width="8" height="12" rx="1.5" opacity="0.7" />
      <rect x="13.5" y="7" width="8" height="12" rx="1.5" />
      <circle cx="6.5" cy="10" r="1.5" />
      <circle cx="17.5" cy="14" r="1.5" />
      <path d="M8 10.5c3 0 3 3 6 3" />
      <path d="M12.2 11.5L14 13.5l-2.5 1" />
    </svg>
  );
}

/** Fade: a slide whose object steps through three opacity states. */
export function IconTransitionFade({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-fade">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="12" r="2.2" opacity="0.25" />
      <circle cx="12" cy="12" r="2.2" opacity="0.55" />
      <circle cx="16" cy="12" r="2.2" />
    </svg>
  );
}

/** Push: the incoming slide pushes the prior slide upward. */
export function IconTransitionPush({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-push">
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M12 16V3" />
      <path d="M8.5 6.5L12 3l3.5 3.5" />
    </svg>
  );
}

/** Wipe: a diagonal reveal edge moving across one slide frame. */
export function IconTransitionWipe({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-wipe">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 19l8-14" />
      <path d="M11 16h6v-6" />
    </svg>
  );
}

/** Split: the incoming slide opens from its center seam. */
export function IconTransitionSplit({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-split">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 12h18" opacity="0.55" />
      <path d="M12 12H6m0 0 2.5-2.5M6 12l2.5 2.5M12 12h6m0 0-2.5-2.5M18 12l-2.5 2.5" />
    </svg>
  );
}

/** Cut: two slide states meet at a hard, instantaneous replacement seam. */
export function IconTransitionCut({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-cut">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14" />
      <path d="M6.5 9h3.5M8.5 7.5 10 9l-1.5 1.5" opacity="0.65" />
      <path d="M17.5 15H14m1.5-1.5L14 15l1.5 1.5" />
    </svg>
  );
}

/** Shape: the three native reveal geometries inside one slide frame. */
export function IconTransitionShape({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-shape">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="7.5" cy="12" r="2" opacity="0.6" />
      <path d="m12 9 3 3-3 3-3-3z" />
      <path d="M17 9v6M14 12h6" opacity="0.75" />
    </svg>
  );
}

/** Zoom: one centered slide state expands or contracts into another. */
export function IconTransitionZoom({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-zoom">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1.2" opacity="0.58" />
      <path d="M6.5 10V7.5H9M17.5 14v2.5H15" />
      <path d="m6.5 7.5 3 3M17.5 16.5l-3-3" opacity="0.75" />
    </svg>
  );
}

/** Dissolve: a slide breaks into a field of progressively fading tiles. */
export function IconTransitionDissolve({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-dissolve">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="6" y="8" width="2" height="2" rx="0.35" opacity="0.35" />
      <rect x="10" y="8" width="2" height="2" rx="0.35" opacity="0.55" />
      <rect x="14" y="8" width="2" height="2" rx="0.35" opacity="0.75" />
      <rect x="8" y="12" width="2" height="2" rx="0.35" opacity="0.5" />
      <rect x="12" y="12" width="2" height="2" rx="0.35" opacity="0.7" />
      <rect x="16" y="12" width="2" height="2" rx="0.35" />
      <path d="M6 16h8" opacity="0.45" />
    </svg>
  );
}

/** Random Bars: uneven native bars reveal along one orientation axis. */
export function IconTransitionRandomBars({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-random-bars">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M5.5 8h8M5.5 10.7h12.5M5.5 13.3h6M5.5 16h10.5" />
      <path d="M18 8h.5M12 13.3h6.5" opacity="0.45" />
    </svg>
  );
}

/** Checkerboard: alternating native reveal cells inside the slide frame. */
export function IconTransitionCheckerboard({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-checkerboard">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M6 8h3v3H6zM12 8h3v3h-3zM9 11h3v3H9zM15 11h3v3h-3zM6 14h3v3H6zM12 14h3v3h-3z" />
    </svg>
  );
}

/** Blinds: repeated, evenly weighted native reveal slats. */
export function IconTransitionBlinds({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-blinds">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M5.5 8h13M5.5 11h13M5.5 14h13M5.5 17h13" />
      <path d="M8 6.5v12M16 6.5v12" opacity="0.35" />
    </svg>
  );
}

/** Comb: alternating native reveal teeth travel from opposite slide edges. */
export function IconTransitionComb({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-comb">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M5.5 8h9M18.5 11h-9M5.5 14h9M18.5 17h-9" />
      <path d="m12.5 6.5 2 1.5-2 1.5M11.5 9.5 9.5 11l2 1.5M12.5 12.5l2 1.5-2 1.5M11.5 15.5 9.5 17l2 1.5" opacity="0.55" />
    </svg>
  );
}

/** Uncover: the current slide travels away to reveal the destination beneath. */
export function IconTransitionUncover({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-uncover">
      <rect x="4" y="6" width="15" height="12" rx="1.5" opacity="0.4" />
      <path d="M7 4h13v11H7zM10 8h7M10 11h5" />
      <path d="M6 20h11M14.5 17.5 17 20l-2.5 2" opacity="0.7" />
    </svg>
  );
}

/** Cover: the destination slide moves in front of the previous slide. */
export function IconTransitionCover({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-cover">
      <rect x="5" y="5" width="14" height="11" rx="1.5" opacity="0.4" />
      <path d="M8 8h13v11H8zM11 12h7M11 15h5" />
      <path d="M3 4h11M5.5 1.5 3 4l2.5 2.5" opacity="0.7" />
    </svg>
  );
}

/** Fall Over: the incoming slide tips forward around its lower edge. */
export function IconTransitionFallOver({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-fall-over">
      <path d="M5 6h14v10H5z" opacity="0.45" />
      <path d="m6 8 12 3-3 8-10-4z" />
      <path d="m16 5 3 3-4 .6" />
    </svg>
  );
}

/** Drape: a soft sheet descends from a fixed top rail. */
export function IconTransitionDrape({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-drape">
      <path d="M4 5h16" />
      <path d="M5 7c2 2 2 8 4 10 2-2 2-8 4-10 2 2 2 8 4 10 1-2 1-7 2-10v12H5z" />
      <path d="M12 3v4m-2-2 2 2 2-2" opacity="0.6" />
    </svg>
  );
}

/** Curtains: mirrored panels part from the center seam. */
export function IconTransitionCurtains({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-curtains">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5c-2 4-2 10 0 14M12 5c2 4 2 10 0 14" />
      <path d="M8 9 5 12l3 3M16 9l3 3-3 3" opacity="0.65" />
    </svg>
  );
}

/** Wind: staggered ribbons sweep across a framed slide. */
export function IconTransitionWind({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-wind">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M5 9h9c3 0 3-3 1-3M5 12h13c3 0 3 3 1.2 3M5 15h7" />
    </svg>
  );
}

/** Prestige: a centered reveal fans outward in three refined facets. */
export function IconTransitionPrestige({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-prestige">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m12 7-4 9h8zM12 7v9M8 16l-3-5M16 16l3-5" />
      <circle cx="12" cy="7" r="1.2" />
    </svg>
  );
}

/** Fracture: the slide separates along a crisp broken seam. */
export function IconTransitionFracture({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-fracture">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m13 5-3 5 3 2-4 7M10 10 6 8m7 4 5 3" />
    </svg>
  );
}

/** Crush: four corners compress into the center. */
export function IconTransitionCrush({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-crush">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M5 7l5 4M19 7l-5 4M5 17l5-4M19 17l-5-4" />
      <path d="m8 8 2 3-3 .5M16 8l-2 3 3 .5M8 16l2-3-3-.5M16 16l-2-3 3-.5" opacity="0.6" />
    </svg>
  );
}

/** Peel Off: one slide corner curls away from the canvas. */
export function IconTransitionPeelOff({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-peel-off">
      <path d="M3 5h18v14H3z" />
      <path d="M13 5c0 6 2 9 8 9" />
      <path d="m13 5 8 9v5h-5" opacity="0.6" />
    </svg>
  );
}

/** Page Curl: the lower corner rolls back over the page. */
export function IconTransitionPageCurl({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-page-curl">
      <path d="M3 5h18v14H3z" />
      <path d="M12 19c4-1 6-4 6-8 2 2 3 4 3 8z" />
      <path d="M18 11c-3 2-5 4-6 8" opacity="0.55" />
    </svg>
  );
}

/** Airplane: a folded plane travels into the destination slide. */
export function IconTransitionAirplane({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-airplane">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.45" />
      <path d="m5 15 14-7-5 9-3-4zM11 13l8-5" />
      <path d="M5 9h3M4 12h3" opacity="0.6" />
    </svg>
  );
}

/** Origami: folded triangular facets assemble the incoming slide. */
export function IconTransitionOrigami({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-origami">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 5 9 7 9-7M3 19l9-7 9 7M3 5l6 7-6 7M21 5l-6 7 6 7" />
      <path d="M9 12h6" opacity="0.55" />
    </svg>
  );
}

/** Switch: two framed slides exchange depth along a horizontal arc. */
export function IconTransitionSwitch({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-switch">
      <rect x="4" y="7" width="11" height="9" rx="1.4" opacity="0.55" />
      <rect x="9" y="5" width="11" height="9" rx="1.4" />
      <path d="M5 19c3 2 11 2 14-1M16.5 16.5 19 18l-2 2" />
      <path d="M19 3.5c-3-1.8-10-1.8-13 0M8.5 5 6 3.5 8 1.8" opacity="0.6" />
    </svg>
  );
}

/** Flip: a slide turns around its vertical center axis. */
export function IconTransitionFlip({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-flip">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.45" />
      <path d="M12 5v14M12 6l6 3v6l-6 3z" />
      <path d="M8 8 5.5 12 8 16M16 8l2.5 4-2.5 4" opacity="0.65" />
    </svg>
  );
}

/** Gallery: the destination advances from a perspective slide stack. */
export function IconTransitionGallery({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-gallery">
      <path d="m4 8 12-3 3 10-12 3z" opacity="0.45" />
      <rect x="4" y="6" width="14" height="11" rx="1.5" />
      <path d="M7 10h8M7 13h5" />
      <path d="m18 18 3-3-3-3" opacity="0.7" />
    </svg>
  );
}

/** Ferris Wheel: slide cards orbit around a shared lower hub. */
export function IconTransitionFerrisWheel({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-ferris-wheel">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.4" />
      <path d="M12 5v5M18 9l-4.7 2M16 17l-3-3.8M8 17l3-3.8M6 9l4.7 2" opacity="0.6" />
      <rect x="9" y="2.5" width="6" height="4" rx="0.8" />
      <path d="M9 19h6" />
    </svg>
  );
}

/** Conveyor: framed slides travel along a directional belt. */
export function IconTransitionConveyor({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-conveyor">
      <rect x="3" y="6" width="10" height="8" rx="1.3" opacity="0.55" />
      <rect x="11" y="8" width="10" height="8" rx="1.3" />
      <path d="M4 19h14M15.5 17l2.5 2-2.5 2" />
      <circle cx="7" cy="19" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

/** Doors: two panels open from the center along the selected axis. */
export function IconTransitionDoors({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-doors">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.35" />
      <path d="M12 5v14M4.5 6.5 11 9v8l-6.5 1.5zM19.5 6.5 13 9v8l6.5 1.5z" />
      <circle cx="9.5" cy="13" r="0.7" />
      <circle cx="14.5" cy="13" r="0.7" />
    </svg>
  );
}

/** Window: a four-pane frame reveals the destination from its center. */
export function IconTransitionWindow({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-window">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 5v14M4 12h16" />
      <path d="m9 9 3 3 3-3M9 15l3-3 3 3" opacity="0.55" />
    </svg>
  );
}

/** Vortex: the destination spirals inward around a stable slide center. */
export function IconTransitionVortex({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-vortex">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.35" />
      <path d="M18.5 8.5c-1.8-2.4-6-3.1-8.8-1.5-2.5 1.4-3.5 4.6-2.1 7 1.2 2.1 4 3 6.1 1.8 1.8-1 2.5-3.2 1.5-4.9-.8-1.4-2.7-2-4.1-1.1-1.1.6-1.5 2-.9 3" />
      <path d="m16.2 6.2 2.3 2.3-3.1.8" opacity="0.7" />
    </svg>
  );
}

/** Pan: the framed destination enters from one of four native side directions. */
export function IconTransitionPan({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-pan">
      <rect x="7" y="6" width="13" height="12" rx="1.8" />
      <path d="M3 12h11M6 9l-3 3 3 3" />
      <path d="M10 9h7M10 12h5M10 15h6" opacity="0.55" />
    </svg>
  );
}

/** Flash: a brief bright pulse across the destination slide. */
export function IconTransitionFlash({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-flash">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.32" />
      <path d="m13.2 6-4.1 6h3.1l-1.4 6 4.2-7h-3.1l1.3-5Z" />
      <path d="M5.5 8.5 4 7M18.5 8.5 20 7M5.5 15.5 4 17M18.5 15.5 20 17" opacity="0.55" />
    </svg>
  );
}

/** Honeycomb: optionless p14 leaf represented by a uniform hexagonal field. */
export function IconTransitionHoneycomb({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-honeycomb">
      <path d="m7 5 3 1.8v3.4L7 12l-3-1.8V6.8L7 5Zm10 0 3 1.8v3.4L17 12l-3-1.8V6.8L17 5ZM12 12l3 1.8v3.4L12 19l-3-1.8v-3.4l3-1.8Z" />
      <path d="m7 12 3 1.8M17 12l-3 1.8" opacity="0.5" />
    </svg>
  );
}

/** Reveal: the destination appears from a side with an optional black passage. */
export function IconTransitionReveal({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-reveal">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.35" />
      <path d="M12 5v14M5.5 12h11M13.5 9l3 3-3 3" />
      <path d="M5.5 7.5h4v9h-4z" opacity="0.62" />
    </svg>
  );
}

/** Ripple: concentric wave fronts expand from the selected origin. */
export function IconTransitionRipple({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-ripple">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.32" />
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 12a3.5 3.5 0 0 1 7 0M6 12a6 6 0 0 1 12 0M4.2 15.5a9 9 0 0 0 15.6 0" />
    </svg>
  );
}

/** Clock: a radial wheel whose spokes sweep clockwise from twelve o'clock. */
export function IconTransitionClock({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-clock">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.28" />
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 12V6M12 12l4.5 3" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Random: crossing paths convey the native runtime-selected transition. */
export function IconTransitionRandom({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-random">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.28" />
      <path d="M5 8h2.5c3.5 0 4.5 8 8 8H19M16 13l3 3-3 3" />
      <path d="M5 16h2.5c1.7 0 2.8-1.9 3.8-3.9C12.4 10 13.5 8 15.5 8H19M16 5l3 3-3 3" />
    </svg>
  );
}

/** Glitter: a patterned field of faceted particles sweeps across the slide. */
export function IconTransitionGlitter({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-glitter">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.3" />
      <path d="m8 8 1.5 1.5L8 11 6.5 9.5zM15.5 7l2 2-2 2-2-2zM12 12l2.5 2.5L12 17l-2.5-2.5zM18 14l1.5 1.5L18 17l-1.5-1.5z" />
      <path d="M5 13h2M17 12h2" opacity="0.55" />
    </svg>
  );
}

/** Shred: strips and rectangular fragments assemble into the destination. */
export function IconTransitionShred({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-shred">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.3" />
      <path d="M5 7h5v4H5zM13 6h6v3h-6zM6 14h4v3H6zM12 11h7v6h-7z" />
      <path d="m9 12 3-2M10 17l2-2" opacity="0.55" />
    </svg>
  );
}

/** Fly Through: the destination travels through a centered depth frame. */
export function IconTransitionFlyThrough({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="transition-fly-through">
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.32" />
      <rect x="8" y="8" width="8" height="8" rx="1.2" />
      <path
        d="M5 12h5M7.5 9.5 10 12l-2.5 2.5M19 12h-5M16.5 9.5 14 12l2.5 2.5"
        opacity="0.68"
      />
    </svg>
  );
}

/** Unavailable gallery effect: a catalogued effect behind a closed writer gate. */
export function IconTransitionUnavailable({ size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size)}
      data-presentation-ribbon-icon="transition-unavailable"
    >
      <rect x="3" y="5" width="14" height="11" rx="1.5" />
      <path d="M7 19h10a4 4 0 0 0 4-4v-3" opacity="0.55" />
      <circle cx="17.5" cy="8.5" r="3.5" />
      <path d="M15 11l5-5" />
    </svg>
  );
}

/** Original MRAI SVG: slide preview command derived from public command semantics. */
export function IconRibbonPreview({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="preview">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path className={homeRole(home, "detail")} d="M8 21h8M12 18v3" />
      <path
        className={homeRole(home, "accentFill")}
        d="M10 8.2l5 2.8-5 2.8z"
      />
    </svg>
  );
}

/** Original MRAI SVG: directional transition variants on one slide. */
export function IconTransitionEffectOptions({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="transition-effect-options"
    >
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path className={homeRole(home, "detail")} d="M8 12h8" />
      <path className={homeRole(home, "accent")} d="M12 8v8" />
      <path d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
    </svg>
  );
}

/** Native Push/Wipe direction: one bounded slide plus its exact travel axis. */
export function IconTransitionDirection({
  direction,
  size,
}: RibbonIconProps & {
  direction: SlideTransitionSideDirection | SlideTransitionCornerOption;
}) {
  const rotation = {
    right: 0,
    "right-down": 45,
    down: 90,
    "left-down": 135,
    left: 180,
    "left-up": 225,
    up: 270,
    "right-up": 315,
  }[direction];
  return (
    <svg
      {...frame(size, true)}
      data-presentation-ribbon-icon="transition-direction"
      data-direction={direction}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.55" />
      <g transform={`rotate(${rotation} 12 12)`}>
        <path d="M7 12h10" />
        <path className={homeRole(true, "accent")} d="M13 8l4 4-4 4" />
      </g>
    </svg>
  );
}

/** Native Shape Effect Option: exact Circle, Diamond, or Plus reveal. */
export function IconTransitionShapeOption({
  option,
  size,
}: RibbonIconProps & { option: SlideTransitionShapeOption }) {
  return (
    <svg
      {...frame(size, true)}
      data-presentation-ribbon-icon="transition-shape-option"
      data-option={option}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.55" />
      {option === "circle" ? (
        <circle className={homeRole(true, "accent")} cx="12" cy="12" r="4" />
      ) : option === "diamond" ? (
        <path className={homeRole(true, "accent")} d="m12 7 5 5-5 5-5-5z" />
      ) : (
        <path className={homeRole(true, "accent")} d="M12 7v10M7 12h10" />
      )}
    </svg>
  );
}

/** Native Zoom Effect Option: exact centered Zoom In or Zoom Out direction. */
export function IconTransitionZoomOption({
  option,
  size,
}: RibbonIconProps & { option: SlideTransitionZoomOption }) {
  return (
    <svg
      {...frame(size, true)}
      data-presentation-ribbon-icon="transition-zoom-option"
      data-option={option}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.55" />
      <rect x="9" y="9" width="6" height="6" rx="1" opacity="0.7" />
      {option === "in" ? (
        <path
          className={homeRole(true, "accent")}
          d="m6.5 7 3 3M9.5 7.5V10H7M17.5 17l-3-3M14.5 16.5V14H17"
        />
      ) : (
        <path
          className={homeRole(true, "accent")}
          d="m9.5 10-3-3M6.5 9.5V7H9M14.5 14l3 3M17.5 14.5V17H15"
        />
      )}
    </svg>
  );
}

/** Exact Split orientation and inward/outward Effect Option. */
export function IconTransitionSplitOption({
  option,
  size,
}: RibbonIconProps & { option: SlideTransitionSplitOption }) {
  const horizontal = option.startsWith("horizontal");
  const inward = option.endsWith("-in");
  return (
    <svg
      {...frame(size, true)}
      data-presentation-ribbon-icon="transition-split-option"
      data-option={option}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.55" />
      <path d={horizontal ? "M3 12h18" : "M12 5v14"} opacity="0.45" />
      <path
        className={homeRole(true, "accent")}
        d={
          horizontal
            ? inward
              ? "M12 8v8M7 7l5 5 5-5M7 17l5-5 5 5"
              : "M12 8v8M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3"
            : inward
              ? "M8 12h8M7 7l5 5-5 5M17 7l-5 5 5 5"
              : "M8 12h8M12 7v10M12 7l-3 3M12 7l3 3M12 17l-3-3M12 17l3-3"
        }
      />
    </svg>
  );
}

/** Native horizontal/vertical Effect Option for orientation transition types. */
export function IconTransitionOrientationOption({
  option,
  size,
}: RibbonIconProps & { option: SlideTransitionOrientationOption }) {
  return (
    <svg
      {...frame(size, true)}
      data-presentation-ribbon-icon="transition-orientation-option"
      data-option={option}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.55" />
      {option === "horizontal" ? (
        <path
          className={homeRole(true, "accent")}
          d="M6 8h12M6 12h12M6 16h12"
        />
      ) : (
        <path
          className={homeRole(true, "accent")}
          d="M7 7v10M12 7v10M17 7v10"
        />
      )}
    </svg>
  );
}

/** Exact `p:wheel/@spokes` Effect Option glyph. */
export function IconTransitionClockOption({
  option,
  size,
}: RibbonIconProps & { option: SlideTransitionClockOption }) {
  const spokes = {
    "one-spoke": 1,
    "two-spokes": 2,
    "three-spokes": 3,
    "four-spokes": 4,
    "eight-spokes": 8,
  }[option];
  return (
    <svg
      {...frame(size, true)}
      data-presentation-ribbon-icon="transition-clock-option"
      data-option={option}
    >
      <circle cx="12" cy="12" r="8" opacity="0.48" />
      {Array.from({ length: spokes }, (_, index) => {
        const angle = (index * 360) / spokes - 90;
        const radians = (angle * Math.PI) / 180;
        const x = 12 + Math.cos(radians) * 6;
        const y = 12 + Math.sin(radians) * 6;
        return (
          <path
            key={index}
            className={homeRole(true, "accent")}
            d={`M12 12L${x.toFixed(2)} ${y.toFixed(2)}`}
          />
        );
      })}
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Exact typed Effect Option glyphs for p14 composite transition tuples. */
export function IconTransitionP14TypedOption({
  kind,
  option,
  size,
}: RibbonIconProps & {
  kind: SlideTransitionP14TypedOptionsKind;
  option: SlideTransitionP14TypedOption;
}) {
  const rippleCorners: Partial<
    Record<SlideTransitionP14TypedOption, readonly [number, number]>
  > = {
    center: [12, 12],
    "left-up": [7, 8],
    "right-up": [17, 8],
    "left-down": [7, 16],
    "right-down": [17, 16],
  };
  const corner = rippleCorners[option];
  const sideRotation = option.startsWith("left")
    ? 180
    : option.startsWith("right")
      ? 0
      : option.startsWith("up")
        ? -90
        : option.startsWith("down")
          ? 90
          : 0;
  const outward =
    option === "out" || option.startsWith("out-") || option.endsWith("-out");
  return (
    <svg
      {...frame(size, true)}
      data-presentation-ribbon-icon="transition-p14-typed-option"
      data-kind={kind}
      data-option={option}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.42" />
      {kind === "reveal" ? (
        <>
          {option.endsWith("through-black") ? (
            <rect
              x="5"
              y="7"
              width="5"
              height="10"
              rx="0.7"
              fill="currentColor"
              opacity="0.7"
            />
          ) : null}
          <g transform={`rotate(${sideRotation} 12 12)`}>
            <path
              className={homeRole(true, "accent")}
              d="M7 12h10m-3-3 3 3-3 3"
            />
          </g>
        </>
      ) : kind === "ripple" && corner ? (
        <>
          <circle
            className={homeRole(true, "accent")}
            cx={corner[0]}
            cy={corner[1]}
            r="1.5"
          />
          <circle cx={corner[0]} cy={corner[1]} r="4" opacity="0.65" />
          <circle cx={corner[0]} cy={corner[1]} r="7" opacity="0.35" />
        </>
      ) : kind === "glitter" ? (
        <>
          <g transform={`rotate(${sideRotation} 12 12)`}>
            <path
              className={homeRole(true, "accent")}
              d="M6 12h12m-3-3 3 3-3 3"
            />
          </g>
          {option.endsWith("hexagon") ? (
            <path d="m12 7 2 1.2v2.4L12 12l-2-1.4V8.2z" />
          ) : (
            <path d="m12 7 2.5 2.5L12 12l-2.5-2.5z" />
          )}
        </>
      ) : kind === "shred" ? (
        <>
          {option.startsWith("strips") ? (
            <path d="M6 8h12M6 11h12M6 14h12M6 17h12" />
          ) : (
            <path d="M6 8h5v4H6zM13 8h5v4h-5zM6 14h5v3H6zM13 14h5v3h-5z" />
          )}
          <path
            className={homeRole(true, "accent")}
            d={
              outward
                ? "M12 12H6m2-2-2 2 2 2m4-2h6m-2-2 2 2-2 2"
                : "M6 12h6m-2-2 2 2-2 2m8-2h-6m2-2-2 2 2 2"
            }
          />
        </>
      ) : (
        <>
          <rect
            x={outward ? 7 : 10}
            y={outward ? 8 : 10}
            width={outward ? 10 : 4}
            height={outward ? 8 : 4}
            rx="1"
          />
          <path
            className={homeRole(true, "accent")}
            d={
              outward
                ? "M12 12H5m2-2-2 2 2 2m5-2h7m-2-2 2 2-2 2"
                : "M5 12h14m-3-3 3 3-3 3"
            }
          />
          {option.endsWith("bounce") ? (
            <path d="M7 18c2 2 4 2 6 0s4-2 6 0" opacity="0.65" />
          ) : null}
        </>
      )}
    </svg>
  );
}

/** Original MRAI SVG: applies the selected transition across slide frames. */
export function IconTransitionApplyAll({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="transition-apply-all"
    >
      <rect x="3" y="4" width="13" height="10" rx="1.5" />
      <path className={homeRole(home, "detail")} d="M7 17h10a3 3 0 0 0 3-3" />
      <path className={homeRole(home, "accent")} d="M17 11l3 3-3 3" />
      <path d="M7 8h5M9.5 5.5V10.5" />
    </svg>
  );
}

/** Original MRAI SVG: presentation size command with two measured axes. */
export function IconDesignSlideSize({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="slide-size">
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path className={homeRole(home, "detail")} d="M7 20h10" />
      <path
        className={homeRole(home, "accent")}
        d="M7 18.5L5.5 20 7 21.5M17 18.5l1.5 1.5-1.5 1.5"
      />
      <path d="M2 8v6M.5 9.5L2 8l1.5 1.5M.5 12.5L2 14l1.5-1.5" />
    </svg>
  );
}

/** Original MRAI SVG: edit the shared master behind slide layouts. */
export function IconDesignSlideMaster({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="slide-master">
      <path className={homeRole(home, "detail")} d="M7 3h14v12" />
      <rect x="3" y="6" width="16" height="14" rx="2" />
      <path d="M7 10h7M7 14h4" />
      <rect
        className={homeRole(home, "accentSurface")}
        x="13"
        y="12"
        width="4"
        height="5"
        rx="0.8"
      />
    </svg>
  );
}

/** Original MRAI SVG: slide background fill with a theme-colour droplet. */
export function IconDesignBackground({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="background">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path className={homeRole(home, "detail")} d="M6 8h8M6 11h6" />
      <path
        className={homeRole(home, "accentSurface")}
        d="M17 11.5c1.7 2.1 2.5 3.2 2.5 4.3a2.5 2.5 0 0 1-5 0c0-1.1.8-2.2 2.5-4.3z"
      />
    </svg>
  );
}

/** Original MRAI SVG: Appear entrance effect on a selected slide object. */
export function IconAnimationAppear({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="animation-appear">
      <rect
        className={homeRole(home, "accentSurface")}
        x="8"
        y="8"
        width="8"
        height="8"
        rx="1.5"
      />
      <path
        className={homeRole(home, "detail")}
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
      />
    </svg>
  );
}

/** Original MRAI SVG: Fade entrance effect represented by progressive opacity. */
export function IconAnimationFade({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="animation-fade">
      <circle cx="7" cy="12" r="3" opacity="0.25" />
      <circle
        className={homeRole(home, "detail")}
        cx="12"
        cy="12"
        r="3.5"
        opacity="0.58"
      />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="17"
        cy="12"
        r="4"
      />
    </svg>
  );
}

/** Original MRAI SVG: Fly In entrance with a motion trail and target object. */
export function IconAnimationFlyIn({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="animation-fly-in">
      <path className={homeRole(home, "detail")} d="M3 8h7M5 12h6M7 16h4" />
      <path className={homeRole(home, "accent")} d="M10 12h7M14 9l3 3-3 3" />
      <rect x="17" y="7" width="4" height="10" rx="1" />
    </svg>
  );
}

/** Original MRAI SVG: add another behavior to the selected slide object. */
export function IconAnimationAdd({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="animation-add">
      <rect x="4" y="7" width="10" height="10" rx="1.8" />
      <path
        className={homeRole(home, "detail")}
        d="M9 3v2M9 19v2M2 12h2M16 12h2"
      />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="18"
        cy="17"
        r="4"
      />
      <path className={homeRole(home, "accent")} d="M18 15v4M16 17h4" />
    </svg>
  );
}

/** Original MRAI SVG: an object leaving the slide along an exit trajectory. */
export function IconAnimationExit({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="animation-exit">
      <rect x="3" y="6" width="9" height="12" rx="1.6" />
      <path className={homeRole(home, "detail")} d="M13 9h3M13 15h3" />
      <path className={homeRole(home, "accent")} d="M12 12h8M17 9l3 3-3 3" />
    </svg>
  );
}

/** Original MRAI SVG: a bounded motion path ending at its arrow target. */
export function IconAnimationMotionPath({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="animation-motion-path"
    >
      <circle cx="4" cy="17" r="1.7" />
      <path
        className={homeRole(home, "detail")}
        d="M5.5 16.2c3.2-6.8 7.2 3 12-5.8"
        strokeDasharray="2.2 2.2"
      />
      <path className={homeRole(home, "accent")} d="M16 7l4 2-1 4" />
    </svg>
  );
}

/** Original MRAI SVG: direction/sequence options for one selected effect. */
export function IconAnimationEffectOptions({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="animation-effect-options"
    >
      <rect x="4" y="5" width="8" height="8" rx="1.5" />
      <path className={homeRole(home, "detail")} d="M4 18h8M8 15v6" />
      <path className={homeRole(home, "accent")} d="M15 8h6M18 5l3 3-3 3" />
      <path d="M15 17h6M18 14l-3 3 3 3" />
    </svg>
  );
}

/** Original MRAI SVG: ordered animation pane with timing badges. */
export function IconAnimationPane({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="animation-pane">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path className={homeRole(home, "detail")} d="M9 4v16M12 8h6M12 12h6M12 16h4" />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="6"
        cy="8"
        r="1.5"
      />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="6"
        cy="13"
        r="1.5"
      />
    </svg>
  );
}

/** Original MRAI SVG: copies an authored animation using an Office brush. */
export function IconAnimationPainter({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="animation-painter"
    >
      <path d="M4 4h12v5H4zM10 9v3M7 12h6l1 8H6z" />
      <path
        className={homeRole(home, "accent")}
        d="M18 4l.8 2.2L21 7l-2.2.8L18 10l-.8-2.2L15 7l2.2-.8z"
      />
    </svg>
  );
}

/** Original MRAI SVG: an animation fired by clicking another slide object. */
export function IconAnimationTrigger({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="animation-trigger">
      <rect x="3" y="4" width="10" height="9" rx="1.7" />
      <path
        className={homeRole(home, "detail")}
        d="M6 16h4M8 13v3M16 4v2M20 7l-1.4 1.4"
      />
      <path
        className={homeRole(home, "accentSurface")}
        d="M13.5 8.5l7 5-3.1 1.1 1.8 4-2.2 1-1.8-4-2.7 1.8z"
      />
    </svg>
  );
}

/** Original MRAI SVG: browser slide show beginning at slide one. */
export function IconSlideShowFromBeginning({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="slideshow-start">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path className={homeRole(home, "detail")} d="M8 21h8M12 18v3" />
      <path className={homeRole(home, "accentFill")} d="M11 8l5 3-5 3z" />
      <path d="M7.5 8v6" />
    </svg>
  );
}

/** Original MRAI SVG: browser slide show beginning at the selected slide. */
export function IconSlideShowFromCurrent({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="slideshow-current"
    >
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path className={homeRole(home, "detail")} d="M8 21h8M12 18v3" />
      <path className={homeRole(home, "accentFill")} d="M10 8l5 3-5 3z" />
      <circle cx="18" cy="16" r="2" />
    </svg>
  );
}

/** Original MRAI SVG: audience screen paired with private presenter notes. */
export function IconSlideShowPresenterView({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="slideshow-presenter-view"
    >
      <rect x="2.5" y="4" width="13" height="10" rx="1.8" />
      <path className={homeRole(home, "detail")} d="M5 18h8M9 14v4" />
      <rect
        className={homeRole(home, "accentSurface")}
        x="12.5"
        y="8"
        width="9"
        height="11"
        rx="1.8"
      />
      <path className={homeRole(home, "accent")} d="M15 12h4M15 15h4" />
    </svg>
  );
}

/** Original MRAI SVG: hand a browser slide show to a connected meeting. */
export function IconSlideShowTeams({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="slideshow-teams">
      <rect x="2.5" y="4" width="14" height="11" rx="1.8" />
      <path className={homeRole(home, "accentFill")} d="M8 7l4 2.5L8 12z" />
      <path className={homeRole(home, "detail")} d="M6 19h7M9.5 15v4" />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="19.5"
        cy="7.5"
        r="2"
      />
      <path
        className={homeRole(home, "accent")}
        d="M16.3 16.5c.4-2.3 1.5-3.5 3.2-3.5s2.8 1.2 3.2 3.5"
      />
    </svg>
  );
}

/** Original MRAI SVG: slide-show settings without implying an open dialog. */
export function IconSlideShowSetUp({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="slideshow-setup">
      <rect x="2.5" y="4" width="19" height="15" rx="2" />
      <path className={homeRole(home, "detail")} d="M6 8h12M6 12h12M6 16h12" />
      <circle className={homeRole(home, "accentSurface")} cx="9" cy="8" r="1.5" />
      <circle className={homeRole(home, "accentSurface")} cx="15" cy="12" r="1.5" />
      <circle className={homeRole(home, "accentSurface")} cx="11" cy="16" r="1.5" />
    </svg>
  );
}

/** Original MRAI SVG: a slide intentionally excluded from normal playback. */
export function IconSlideShowHideSlide({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="slideshow-hide-slide"
    >
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path className={homeRole(home, "detail")} d="M8 21h8M12 18v3" />
      <path className={homeRole(home, "accent")} d="M5 3l14 18" />
      <path d="M9 8l5 3-2.2 1.3" />
    </svg>
  );
}

/** Original MRAI SVG: record a slide show into presentation media. */
export function IconSlideShowRecord({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="slideshow-record">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path className={homeRole(home, "detail")} d="M8 21h8M12 18v3" />
      <circle className={homeRole(home, "accentFill")} cx="12" cy="11" r="3.5" />
    </svg>
  );
}

/** Original MRAI SVG: live subtitle lines projected beneath a slide. */
export function IconSlideShowCaptions({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="slideshow-captions"
    >
      <rect x="2.5" y="4" width="19" height="15" rx="2" />
      <path className={homeRole(home, "accentSurface")} d="M5.5 11h13v5h-13z" />
      <path className={homeRole(home, "detail")} d="M8 13.5h3M13 13.5h3" />
    </svg>
  );
}

/** Bullet style gallery: three list rows, each with a different marker. */
export function IconBulletStyle({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="paragraph-bullets"
    >
      <circle
        className={homeRole(home, "accentFill")}
        cx="5"
        cy="6"
        r="1"
        fill="currentColor"
        stroke="none"
      />
      <path d="M10 6h9" />
      <path className={homeRole(home, "accent")} d="M4 12h2" />
      <path d="M10 12h9" />
      <rect
        className={homeRole(home, "accentFill")}
        x="4"
        y="17"
        width="2"
        height="2"
        fill="currentColor"
        stroke="none"
      />
      <path d="M10 18h9" />
    </svg>
  );
}

/** Numbering style gallery: a stroked 1 / 2 with their list rows. */
export function IconNumberStyle({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="paragraph-numbering"
    >
      {/* lowered 1.25 so the drawing's middle is the canvas's */}
      <g transform="translate(0 1.25)">
        <path className={homeRole(home, "accent")} d="M4.5 5l1.5 -1v5" />
        <path d="M10 7h9" />
        <path
          className={homeRole(home, "accent")}
          d="M4.5 14.5c0 -1 .8 -1.8 1.8 -1.5c1 .3 1 1.6 .2 2.4l-2 2.1h3"
        />
        <path d="M10 16h9" />
      </g>
    </svg>
  );
}

/** Increase/decrease paragraph indent: text rules with the Office direction arrow. */
export function IconParagraphIndent({
  home,
  size,
  direction,
}: RibbonIconProps & { direction: "increase" | "decrease" }) {
  const decrease = direction === "decrease";
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon={`paragraph-indent-${direction}`}
    >
      {/* the rules centred on the canvas, around the arrow's middle */}
      <path d="M10 4.5h10M10 9.5h10M10 14.5h10M10 19.5h7" />
      <path
        className={homeRole(home, "accent")}
        d={decrease ? "M7 9L3 12l4 3" : "M3 9l4 3l-4 3"}
      />
    </svg>
  );
}

/** PowerPoint paragraph alignment rules, parameterized without borrowing Docs glyphs. */
export function IconParagraphAlign({
  home,
  size,
  alignment,
}: RibbonIconProps & {
  alignment: "left" | "center" | "right" | "justify";
}) {
  const rows =
    alignment === "left"
      ? [
          [4, 20],
          [4, 16],
          [4, 20],
          [4, 14],
        ]
      : alignment === "right"
        ? [
            [4, 20],
            [8, 20],
            [4, 20],
            [10, 20],
          ]
        : alignment === "center"
          ? [
              [4, 20],
              [6, 18],
              [4, 20],
              [8, 16],
            ]
          : [
              [4, 20],
              [4, 20],
              [4, 20],
              [4, 20],
            ];
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon={`paragraph-align-${alignment}`}
    >
      {rows.map(([x1, x2], index) => (
        <path
          key={index}
          className={home && index === 1 ? homeRole(home, "accent") : undefined}
          d={`M${x1} ${6 + index * 4}h${x2 - x1}`}
        />
      ))}
    </svg>
  );
}

/** Shape gallery: square, circle and triangle sharing one canvas. */
export function IconShapeGallery({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="drawing-shapes">
      <rect
        className={homeRole(home, "accentSurface")}
        x="3"
        y="4"
        width="8"
        height="8"
        rx="1.5"
      />
      <circle className={homeRole(home, "detail")} cx="16.5" cy="8" r="4" />
      <path className={homeRole(home, "accent")} d="M4 20l5 -7l5 7z" />
      <path className={homeRole(home, "detail")} d="M14 15h7M17.5 12v6" />
    </svg>
  );
}

/** Change Shape: the selected rectangle resolves into a new geometry. */
export function IconChangeShape({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-change-shape"
    >
      <rect
        className={homeRole(home, "detail")}
        x="3.5"
        y="5"
        width="8.5"
        height="8.5"
        rx="1.6"
      />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="17.2"
        cy="15.6"
        r="4.1"
      />
      <path
        className={homeRole(home, "accent")}
        d="M12.4 6.2c3.1-.9 6 .4 7.4 2.8M18.1 6.6 20 9l-2.9.5"
      />
    </svg>
  );
}

/** Insert Picture: an Office slide image with a compact add badge. */
export function IconInsertPicture({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="image.insert" size={size} />;
}

/** Picture Crop: the authored picture frame plus Crop/Fill/Fit geometry. */
export function IconPictureCrop({
  home,
  mode = "crop",
  size,
}: RibbonIconProps & { mode?: "crop" | "fill" | "fit" }) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon={`picture-crop-${mode}`}
    >
      <rect
        className={homeRole(home, "detail")}
        x="4"
        y="5"
        width="16"
        height="14"
        rx="1.5"
        opacity="0.72"
      />
      {mode === "crop" ? (
        <>
          <circle
            className={homeRole(home, "accentSurface")}
            cx="9"
            cy="10"
            r="1.4"
          />
          <path
            className={homeRole(home, "detail")}
            d="M6 17l4 -4l2.5 2.5l2 -2l3.5 3.5"
          />
          <path
            className={homeRole(home, "accent")}
            d="M3 2v15a4 4 0 0 0 4 4h15M2 6h15a4 4 0 0 1 4 4v12"
          />
        </>
      ) : mode === "fill" ? (
        <path
          className={homeRole(home, "accent")}
          d="M12 12H6m0 0l2 -2M6 12l2 2M12 12h6m0 0l-2 -2m2 2l-2 2"
        />
      ) : (
        <path
          className={homeRole(home, "accent")}
          d="M4 12h6m0 0l-2 -2m2 2l-2 2M20 12h-6m0 0l2 -2m-2 2l2 2"
        />
      )}
    </svg>
  );
}

/** Insert Text Box: the Office T inside a selectable text frame. */
export function IconInsertTextBox({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="textBox.insert" size={size} />;
}

/** Horizontal text box: a landscape frame with authored reading lines. */
export function IconInsertHorizontalTextBox({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="insert-text-box-horizontal"
    >
      <rect
        className={homeRole(home, "detail")}
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2"
      />
      <path className={homeRole(home, "accent")} d="M6 9h12" />
      <path className={homeRole(home, "detail")} d="M6 12h9M6 15h11" />
      <circle
        className={homeRole(home, "accentSurface")}
        cx="19"
        cy="17"
        r="1.1"
      />
    </svg>
  );
}

/** Vertical text box: a portrait frame with stacked character cells. */
export function IconInsertVerticalTextBox({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="insert-text-box-vertical"
    >
      <rect
        className={homeRole(home, "detail")}
        x="5"
        y="2.5"
        width="14"
        height="19"
        rx="2"
      />
      <rect
        className={homeRole(home, "accentSurface")}
        x="9"
        y="5.5"
        width="6"
        height="3.2"
        rx="0.8"
      />
      <rect
        className={homeRole(home, "detail")}
        x="9"
        y="10.3"
        width="6"
        height="3.2"
        rx="0.8"
      />
      <rect
        className={homeRole(home, "accent")}
        x="9"
        y="15.1"
        width="6"
        height="3.2"
        rx="0.8"
      />
    </svg>
  );
}

/** Bring forward: the front card rises one layer. */
export function IconBringForward({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="object.bringForward" size={size} />;
}

/** Bring to Front: the selected card clears the whole layer stack. */
export function IconBringToFront({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="object.bringToFront" size={size} />;
}

/** Send backward: the front card drops one layer. */
export function IconSendBackward({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="object.sendBackward" size={size} />;
}

/** Send to Back: the selected card drops beneath the whole layer stack. */
export function IconSendToBack({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="object.sendToBack" size={size} />;
}

/** Group: two blocks captured by one dashed selection frame. */
export function IconGroupObjects({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="drawing-group">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
      <rect
        className={homeRole(home, "detail")}
        x="7"
        y="7"
        width="5"
        height="5"
      />
      <rect
        className={homeRole(home, "accentSurface")}
        x="12"
        y="12"
        width="5"
        height="5"
      />
    </svg>
  );
}

/** Ungroup: the same two blocks, frames split apart. */
export function IconUngroupObjects({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="drawing-ungroup">
      <rect x="3" y="3" width="9" height="9" rx="1" strokeDasharray="3 3" />
      <rect x="12" y="12" width="9" height="9" rx="1" strokeDasharray="3 3" />
      <rect
        className={homeRole(home, "detail")}
        x="5.5"
        y="5.5"
        width="4"
        height="4"
      />
      <rect
        className={homeRole(home, "accentSurface")}
        x="14.5"
        y="14.5"
        width="4"
        height="4"
      />
    </svg>
  );
}

/** Selection-pane hide: a block with a struck-through eye. */
export function IconHideBlock({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3" y="4" width="18" height="10" rx="2" />
      <path d="M8 19c1.2 -1.4 2.6 -2 4 -2s2.8 .6 4 2" />
      <path d="M5 21L19 7" />
    </svg>
  );
}

/** Selection-pane show-all: the block back under an open eye. */
export function IconShowAllBlocks({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3" y="4" width="18" height="10" rx="2" />
      <path d="M7 19c1.6 -1.8 3.2 -2.6 5 -2.6s3.4 .8 5 2.6" />
      <circle cx="12" cy="18.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Text direction menu: an A beside the vertical reading arrow. */
export function IconTextVertical({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="paragraph-text-direction"
    >
      {/* The A. */}
      <path className={homeRole(home, "detail")} d="M4 15l3.5 -9l3.5 9" />
      <path className={homeRole(home, "detail")} d="M5.4 11.8h4.2" />
      {/* Top-to-bottom reading direction. */}
      <path className={homeRole(home, "accent")} d="M17 4v14" />
      <path className={homeRole(home, "accent")} d="M14 15.5L17 19l3 -3.5" />
    </svg>
  );
}

/** Character spacing (PPT AV): the pair with a spread arrow beneath. */
export function IconLetterSpacing({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="letter-spacing">
      <path d="M2.5 13l3 -8l3 8" />
      <path d="M3.6 10.5h3.8" />
      <path d="M14.5 5l3 8l3 -8" />
      <path d="M5 19h14" />
      <path d="M7.5 16.5L5 19l2.5 2.5" />
      <path d="M16.5 16.5L19 19l-2.5 2.5" />
    </svg>
  );
}

/** Change Case: mixed uppercase/lowercase glyphs with the menu cue omitted. */
export function IconChangeCase({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="change-case">
      <path d="M3 18L8 5l5 13" />
      <path d="M5 13h6" />
      <path
        className={homeRole(home, "accent")}
        d="M15 11.5c1.1 -.7 4 -.8 4 1.5v5"
      />
      <path
        className={homeRole(home, "accent")}
        d="M19 14.5c-4 -1 -5.2 1 -3.7 2.7c1.2 1.3 3 .4 3.7 -.7"
      />
    </svg>
  );
}

/** Body columns: two newspaper columns of ruled text. */
export function IconTextColumns({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="paragraph-columns"
    >
      <path d="M4 6h6M4 10h6M4 14h6M4 18h4" />
      <path
        className={homeRole(home, "accent")}
        d="M14 6h6M14 10h6M14 14h6M14 18h4"
      />
    </svg>
  );
}

/**
 * AutoFit smart tag: a text frame whose lower lines contract toward the centre.
 * The geometry stays legible at the 20px contextual-control size while using
 * the same refined 1.4px Office-style stroke as the Home icon family.
 */
export function IconTextAutofit({ home = true, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="text-autofit">
      <rect
        className={homeRole(home, "detail")}
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="2"
      />
      <path className={homeRole(home, "detail")} d="M7 8h10M8 11.5h8" />
      <path className={homeRole(home, "accent")} d="M9.5 15h5" />
      <path
        className={homeRole(home, "accent")}
        d="M6 13.5v4M6 17.5l-1.5-1.5M6 17.5L7.5 16"
      />
      <path
        className={homeRole(home, "accent")}
        d="M18 13.5v4M18 17.5l-1.5-1.5M18 17.5l1.5-1.5"
      />
    </svg>
  );
}

/** Line spacing menu: ruled lines with the up-down adjuster. */
export function IconLineSpacing({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="paragraph-line-spacing"
    >
      <path className={homeRole(home, "detail")} d="M11 6h9M11 12h9M11 18h9" />
      <path className={homeRole(home, "accent")} d="M5 5v14" />
      <path
        className={homeRole(home, "accent")}
        d="M2.5 7.5L5 5l2.5 2.5M2.5 16.5L5 19l2.5 -2.5"
      />
    </svg>
  );
}

/** Convert text to SmartArt: list lines flowing into a node diagram. */
export function IconSmartArtConvert({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="paragraph-smartart">
      <path d="M3 6h6M3 11h6M3 16h4" />
      <path d="M11 11h3" />
      <circle cx="18.5" cy="6" r="2.2" />
      <circle cx="18.5" cy="16" r="2.2" />
      <path d="M14 11c2.5 0 2.5 -5 4.5 -5M14 11c2.5 0 2.5 5 4.5 5" />
    </svg>
  );
}

/** Shape quick styles: a swatch stack with a brush stroke across it. */
export function IconQuickStyles({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-quick-styles"
    >
      <rect
        className={homeRole(home, "detail")}
        x="3"
        y="5"
        width="10"
        height="10"
        rx="2"
      />
      <rect
        className={homeRole(home, "accentSurface")}
        x="7"
        y="9"
        width="10"
        height="10"
        rx="2"
      />
      <path
        className={homeRole(home, "accent")}
        d="M15 5.5c2 -2 4.5 -1.5 5.5 0c-1.5 .5 -2 2.5 -3.5 3z"
      />
    </svg>
  );
}

/** Arrange menu: three stacked layers. */
export function IconArrangeMenu({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="drawing-arrange">
      <path
        className={homeRole(home, "accentSurface")}
        d="M12 3l9 4.5l-9 4.5l-9 -4.5z"
      />
      <path className={homeRole(home, "detail")} d="M3 12l9 4.5l9 -4.5" />
      <path className={homeRole(home, "detail")} d="M3 16.5l9 4.5l9 -4.5" />
    </svg>
  );
}

/** Align objects: two shapes meeting a shared vertical guide. */
export function IconAlignObjects({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="object.align" size={size} />;
}

/** Distribute objects: three shapes held at equal intervals. */
export function IconDistributeObjects({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="drawing-distribute">
      <path d="M3 4v16M21 4v16" opacity="0.55" />
      <rect x="5" y="8" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="8" rx="1" />
      <rect x="15" y="8" width="4" height="8" rx="1" />
    </svg>
  );
}

/** Rotate objects: a quarter-turn arrow wrapped around a selected square. */
export function IconRotateObjects({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="object.rotate" size={size} />;
}

/** Horizontal mirror: matching wedges across a vertical reflection axis. */
export function IconFlipHorizontal({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-flip-horizontal"
    >
      <path d="M12 3v18" strokeDasharray="2 2" opacity="0.55" />
      <path
        className={homeRole(home, "accentSurface")}
        d="M10 6 4 12l6 6zM14 6l6 6-6 6z"
      />
    </svg>
  );
}

/** Vertical mirror: matching wedges across a horizontal reflection axis. */
export function IconFlipVertical({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-flip-vertical"
    >
      <path d="M3 12h18" strokeDasharray="2 2" opacity="0.55" />
      <path
        className={homeRole(home, "accentSurface")}
        d="M6 10l6-6 6 6zM6 14l6 6 6-6z"
      />
    </svg>
  );
}

/** Selection Pane: ordered object cards beside visibility controls. */
export function IconSelectionPane({ size }: RibbonIconProps) {
  return <OfficeSemanticIcon semanticId="object.selectionPane" size={size} />;
}

/** Width field: a selected object measured across its horizontal axis. */
export function IconObjectWidth({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-object-width"
    >
      <rect
        className={homeRole(home, "detail")}
        x="5"
        y="7"
        width="14"
        height="10"
        rx="1.5"
      />
      <path
        className={homeRole(home, "accent")}
        d="M4 21h16M4 19v4M20 19v4M7 21l2-1.5M7 21l2 1.5M17 21l-2-1.5M17 21l-2 1.5"
      />
    </svg>
  );
}

/** Height field: a selected object measured across its vertical axis. */
export function IconObjectHeight({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-object-height"
    >
      <rect
        className={homeRole(home, "detail")}
        x="8"
        y="5"
        width="10"
        height="14"
        rx="1.5"
      />
      <path
        className={homeRole(home, "accent")}
        d="M3 4v16M1 4h4M1 20h4M3 7l-1.5 2M3 7l1.5 2M3 17l-1.5-2M3 17l1.5-2"
      />
    </svg>
  );
}

/** Lock aspect ratio: the measured object is held by one linked ratio. */
export function IconLockAspect({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-lock-aspect"
    >
      <rect
        className={homeRole(home, "detail")}
        x="3.5"
        y="5"
        width="12"
        height="14"
        rx="1.8"
      />
      <path
        className={homeRole(home, "accent")}
        d="M12.5 10.5l2-2a2.5 2.5 0 0 1 3.5 3.5l-2 2M14.5 13.5l-2 2A2.5 2.5 0 0 1 9 12l2-2M11.5 12.5l3-3"
      />
    </svg>
  );
}

/** Format pane: an object frame paired with two precise property sliders. */
export function IconObjectFormatPane({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-format-pane"
    >
      <rect
        className={homeRole(home, "detail")}
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
      />
      <path d="M14 4v16" />
      <path
        className={homeRole(home, "accent")}
        d="M16.5 8h2.5M17.5 8v3M16.5 14h2.5M18 14v3"
      />
      <path className={homeRole(home, "detail")} d="M6 9h5M6 13h5M6 17h3" />
    </svg>
  );
}

/** Home Editing Find/Replace: a search lens paired with a replacement arrow. */
export function IconFindReplace({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="editing-find-replace">
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="M12 12l3 3" />
      <path d="M14 19h6M18 16l3 3l-3 3" />
      <path d="M4 4h2M4 7h1" opacity="0.7" />
    </svg>
  );
}

/** Home Editing Find: the single search action shown above Replace. */
export function IconFind({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="editing-find">
      <circle cx="10" cy="10" r="6" />
      <path d="M14.5 14.5L21 21" />
    </svg>
  );
}

/** Home Editing Replace: Office's letter-substitution cue with swap arrows. */
export function IconReplace({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="editing-replace">
      <path d="M4 7h9M10 4l3 3l-3 3" />
      <path d="M20 17h-9M14 14l-3 3l3 3" />
      <path d="M5 12.5c0-1.1.9-2 2-2s2 .9 2 2v3.5H5z" />
      <path d="M16 8V4h2a2 2 0 0 1 0 4z" />
    </svg>
  );
}

/** Home Editing Select menu: the Office pointer inside a selection frame. */
export function IconSelectMenu({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="editing-select-menu"
    >
      <rect
        className={homeRole(home, "detail")}
        x="3"
        y="3"
        width="17"
        height="17"
        rx="2"
        strokeDasharray="3 2"
      />
      <path
        className={homeRole(home, "accentFill")}
        d="M8 7l8 7l-4 .5l-2 3.5z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Select All: four exact corner handles around the whole selection bounds. */
export function IconSelectAll({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="editing-select-all">
      <rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="3 2" />
      <path d="M3 3h4M3 3v4M21 3h-4M21 3v4M3 21h4M3 21v-4M21 21h-4M21 21v-4" />
    </svg>
  );
}

/** Select Objects: pointer over one concrete object, distinct from Select All. */
export function IconSelectObjects({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="editing-select-objects"
    >
      <rect
        className={homeRole(home, "detail")}
        x="10"
        y="4"
        width="10"
        height="8"
        rx="1.5"
        strokeDasharray="3 2"
      />
      <path
        className={homeRole(home, "accentFill")}
        d="M4 6l8 8l-4 .6L6 19z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Shape fill: a tipping paint bucket with a falling drop. */
export function IconShapeFill({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-shape-fill"
    >
      <path d="M8 3l9 9a2 2 0 0 1 0 2.8l-4.2 4.2a2 2 0 0 1 -2.8 0L4 13a2 2 0 0 1 0 -2.8z" />
      <path className={homeRole(home, "detail")} d="M5 11h11" />
      <path
        className={homeRole(home, "accentFill")}
        d="M20 16c1 1.4 1.5 2.4 1.5 3.2a1.5 1.5 0 0 1 -3 0c0 -.8 .5 -1.8 1.5 -3.2z"
      />
    </svg>
  );
}

/** Shape outline: an outlined frame traced by a pen nib. */
export function IconShapeOutline({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-shape-outline"
    >
      <rect
        className={homeRole(home, "detail")}
        x="4"
        y="4"
        width="12"
        height="12"
        rx="2"
        strokeDasharray="4 3"
      />
      <path
        className={homeRole(home, "accent")}
        d="M20 14l-6 6l-2.5 .5l.5 -2.5l6 -6z"
      />
    </svg>
  );
}

/** Sensitivity label (placeholder surface): a shield carrying a tag. */
export function IconSensitivity({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M12 3l7 3v5c0 4.5 -3 8 -7 10c-4 -2 -7 -5.5 -7 -10V6z" />
      <path d="M9 11.5h6" />
      <path d="M12 8.5v6" />
    </svg>
  );
}

/** Home Add-ins: the Office puzzle-piece metaphor on the shared 24px grid. */
export function IconAddins({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="add-ins">
      <path d="M10 4a2 2 0 0 1 4 0v1h3a2 2 0 0 1 2 2v3h-1a2 2 0 0 0 0 4h1v3a2 2 0 0 1 -2 2h-3v-1a2 2 0 0 0 -4 0v1H7a2 2 0 0 1 -2 -2v-3H4a2 2 0 0 1 0 -4h1V7a2 2 0 0 1 2 -2h3z" />
    </svg>
  );
}

/** Home Copilot/Designer: a slide frame energized by the Office lightning cue. */
export function IconDesignerCopilot({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="designer-copilot"
    >
      <rect x="5" y="6" width="16" height="12" rx="2" />
      <path
        className={homeRole(home, "detail")}
        d="M8 9h10M9 13h7M9 21h8"
        opacity="0.68"
      />
      <path
        className={homeRole(home, "accentFill")}
        d="M5 2L1.8 8h3L3.7 13L9 6.5H6.2L8 2z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Align-text menu (vertical anchor): a box with its text band centred. */
export function IconAlignTextMenu({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="paragraph-align-text"
    >
      <rect
        className={homeRole(home, "detail")}
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
      />
      <path className={homeRole(home, "accent")} d="M8 10h8M8 14h5" />
    </svg>
  );
}

/** Table cell margins: a content box inset from the four editable cell edges. */
export function IconTableCellMargins({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="table-cell-margins"
    >
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <rect
        className={homeRole(home, "detail")}
        x="7.5"
        y="8"
        width="9"
        height="8"
        rx="1"
        strokeDasharray="1.5 1.5"
      />
      <path
        className={homeRole(home, "accent")}
        d="M5 12h2.5M16.5 12H19M12 6v2M12 16v2"
      />
      <path
        className={homeRole(home, "accent")}
        d="M6.4 10.8L7.6 12l-1.2 1.2M17.6 10.8L16.4 12l1.2 1.2M10.8 7.2L12 8.4l1.2-1.2M10.8 16.8l1.2-1.2l1.2 1.2"
      />
    </svg>
  );
}

/** Table borders: a quiet Office grid with the editable perimeter accented. */
export function IconTableBorders({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="table-borders">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path
        className={homeRole(home, "detail")}
        d="M9 4v16M15 4v16M3 9.33h18M3 14.67h18"
      />
      <path className={homeRole(home, "accent")} d="M3 4h18v16H3z" />
    </svg>
  );
}

/** Delete table content: an exact grid identity paired with a compact bin. */
export function IconTableDelete({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="table-delete">
      <rect x="2.5" y="4" width="13" height="12" rx="1.5" />
      <path
        className={homeRole(home, "detail")}
        d="M2.5 8h13M7 4v12M11.2 4v12"
      />
      <path
        className={homeRole(home, "accent")}
        d="M16.5 9h5M18 9V7.5h2V9M17.2 9l.5 11h2.6l.5-11"
      />
    </svg>
  );
}

function TableInsertGlyph({
  home,
  size,
  direction,
}: RibbonIconProps & { direction: "above" | "below" | "left" | "right" }) {
  const plusX = direction === "left" ? 4 : direction === "right" ? 20 : 12;
  const plusY = direction === "above" ? 4 : direction === "below" ? 20 : 12;
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon={`table-insert-${direction}`}
    >
      <rect x="6" y="6" width="12" height="12" rx="1.25" />
      <path
        className={homeRole(home, "detail")}
        d="M6 10h12M6 14h12M10 6v12M14 6v12"
      />
      <circle
        className={homeRole(home, "accentSurface")}
        cx={plusX}
        cy={plusY}
        r="3"
        fill="var(--office-ribbon-surface, #fff)"
      />
      <path
        className={homeRole(home, "accent")}
        d={`M${plusX - 1.6} ${plusY}h3.2M${plusX} ${plusY - 1.6}v3.2`}
      />
    </svg>
  );
}

export function IconTableInsertAbove(props: RibbonIconProps) {
  return <TableInsertGlyph {...props} direction="above" />;
}

export function IconTableInsertBelow(props: RibbonIconProps) {
  return <TableInsertGlyph {...props} direction="below" />;
}

export function IconTableInsertLeft(props: RibbonIconProps) {
  return <TableInsertGlyph {...props} direction="left" />;
}

export function IconTableInsertRight(props: RibbonIconProps) {
  return <TableInsertGlyph {...props} direction="right" />;
}

/** Merge selected cells: two cell fields converge on one shared carrier. */
export function IconTableMergeCells({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="table-merge-cells"
    >
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path className={homeRole(home, "detail")} d="M12 5v14" />
      <path
        className={homeRole(home, "accent")}
        d="M6.5 12h4M9 9.5l2.5 2.5L9 14.5M17.5 12h-4M15 9.5L12.5 12l2.5 2.5"
      />
    </svg>
  );
}

/** Split cell: one authenticated cell divides into two stable destinations. */
export function IconTableSplitCells({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="table-split-cells"
    >
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path
        className={homeRole(home, "accent")}
        d="M12 5v14M10 12H6.5M8.5 9.7L6.2 12l2.3 2.3M14 12h3.5M15.5 9.7l2.3 2.3l-2.3 2.3"
      />
    </svg>
  );
}

/** AutoFit: a table column stretches between explicit horizontal bounds. */
export function IconTableAutoFit({ home, size }: RibbonIconProps) {
  return (
    <svg {...frame(size, home)} data-presentation-ribbon-icon="table-auto-fit">
      <rect x="5" y="4" width="14" height="16" rx="1.5" />
      <path
        className={homeRole(home, "detail")}
        d="M9.7 4v16M14.3 4v16M5 9.3h14M5 14.7h14"
      />
      <path
        className={homeRole(home, "accent")}
        d="M2 12h5M2 12l2-2M2 12l2 2M22 12h-5M22 12l-2-2M22 12l-2 2"
      />
    </svg>
  );
}

/** Distribute rows: equal vertical bands between fixed table edges. */
export function IconTableDistributeRows({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="table-distribute-rows"
    >
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path
        className={homeRole(home, "detail")}
        d="M4 9h16M4 15h16M10 3v18M14 3v18"
      />
      <path
        className={homeRole(home, "accent")}
        d="M2 7v10M2 7l-1.2 1.5M2 7l1.2 1.5M2 17l-1.2-1.5M2 17l1.2-1.5"
      />
    </svg>
  );
}

/** Distribute columns: equal horizontal bands between fixed table edges. */
export function IconTableDistributeColumns({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="table-distribute-columns"
    >
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path
        className={homeRole(home, "detail")}
        d="M9 4v16M15 4v16M3 10h18M3 14h18"
      />
      <path
        className={homeRole(home, "accent")}
        d="M7 22h10M7 22l1.5-1.2M7 22l1.5 1.2M17 22l-1.5-1.2M17 22l-1.5 1.2"
      />
    </svg>
  );
}

/** Distributed paragraph alignment: full-width rules between fixed margins. */
export function IconDistributeText({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="paragraph-distribute"
    >
      <path className={homeRole(home, "detail")} d="M4 4v16M20 4v16" />
      <path className={homeRole(home, "accent")} d="M7 8h10M7 12h10M7 16h10" />
    </svg>
  );
}

/**
 * A live THUMBNAIL of one slide layout, generated from the layout's own
 * placeholder geometry, as PPT's New Slide gallery draws it: generated, it
 * can never drift from what the layout creates, and a layout added to the
 * catalogue is correct by construction.
 *
 * A white slide with a soft shadow; each placeholder a dashed box tinted the
 * theme's blue; a title's bold rule and a subtitle's lighter one; bulleted
 * lines for a body; PowerPoint's six content glyphs in their own colours for
 * content (table, chart, SmartArt, picture, video, icon); a sky, hills and
 * sun for a picture; vertical rules for vertical text.
 */
const LAYOUT_THUMB = {
  edge: "#c5d1de",
  box: "#9db3cb",
  tint: "#f3f8fd",
  title: "#33475f",
  subtitle: "#8193a8",
  line: "#b9c5d2",
  bullet: "#4472c4",
  table: "#4472c4",
  chartA: "#ed7d31",
  chartB: "#5b9bd5",
  smartArt: "#70ad47",
  picture: "#5b9bd5",
  video: "#e2683c",
  icon: "#8064a2",
  sky: "#e3effb",
  hillBack: "#9cc3e8",
  hillFront: "#5b9bd5",
  sun: "#ffc000",
} as const;

export function LayoutThumbnail({
  layout,
  width = 150,
}: {
  layout: LayoutDefinition;
  width?: number;
}) {
  const W = 160;
  const H = 90;
  const px = Math.round((width * H) / W);
  const shadow = useId().replaceAll(":", "");
  const c = LAYOUT_THUMB;
  return (
    <svg
      viewBox={`-3 -2 ${W + 6} ${H + 6}`}
      aria-hidden
      data-presentation-layout-thumbnail={layout.id}
      /* Inline style, deliberately: the menu-item wrapper carries a
         [&_svg]:size-4 utility that crushes any svg ATTRIBUTE sizing to a
         16px icon — inline style is the only thing that outranks it. */
      style={{ width, height: px, display: "block", flexShrink: 0 }}
    >
      <defs>
        <filter id={shadow} x="-5%" y="-5%" width="110%" height="115%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#1e3a5f" floodOpacity="0.16" />
        </filter>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width={W - 1}
        height={H - 1}
        rx="3"
        fill="var(--ppt-thumb-bg, #fff)"
        stroke={c.edge}
        filter={`url(#${shadow})`}
      />
      {layout.placeholders.map((placeholder, index) => {
        const x = placeholder.left * W;
        const y = placeholder.top * H;
        const w = placeholder.width * W;
        const h = placeholder.height * H;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const role = placeholder.role;
        return (
          <g key={index}>
            <rect
              x={x + 1}
              y={y + 1}
              width={Math.max(2, w - 2)}
              height={Math.max(2, h - 2)}
              rx="1.5"
              fill={role === "picture" ? c.sky : c.tint}
              stroke={c.box}
              strokeWidth="0.9"
              strokeDasharray="3 2"
            />
            {(role === "title" || role === "subtitle") && !placeholder.vertical ? (
              <line
                x1={x + w * (role === "title" ? 0.16 : 0.26)}
                y1={cy}
                x2={x + w * (role === "title" ? 0.84 : 0.74)}
                y2={cy}
                stroke={role === "title" ? c.title : c.subtitle}
                strokeWidth={role === "title" ? Math.min(3.2, Math.max(2, h * 0.16)) : 1.6}
                strokeLinecap="round"
              />
            ) : null}
            {role === "body" && !placeholder.vertical && h < 13 ? (
              // A one-line body (a section header's text, a comparison's
              // heading): a single rule, no bullet to crowd it.
              <line x1={x + w * 0.12} y1={cy} x2={x + w * 0.7} y2={cy} stroke={c.subtitle} strokeWidth="1.3" strokeLinecap="round" />
            ) : null}
            {role === "body" && !placeholder.vertical && h >= 13 ? (
              <g strokeLinecap="round">
                {[0.3, 0.55, 0.8].map((fy, row) => (
                  <g key={fy}>
                    <circle cx={x + 6} cy={y + h * fy} r="1.3" fill={c.bullet} />
                    <line
                      x1={x + 10}
                      y1={y + h * fy}
                      x2={x + (row === 2 ? w * 0.62 : w - 5)}
                      y2={y + h * fy}
                      stroke={c.line}
                      strokeWidth="1.3"
                    />
                  </g>
                ))}
              </g>
            ) : null}
            {role === "content" && !placeholder.vertical ? (
              <g
                strokeLinejoin="round"
                strokeLinecap="round"
                // The glyphs grow with the placeholder (a full-width content
                // box has room for them at half again their size).
                transform={`translate(${cx} ${cy}) scale(${Math.max(0.8, Math.min(1.7, w / 48, h / 28))}) translate(${-cx} ${-cy})`}
              >
                {/* Table */}
                <rect x={cx - 18} y={cy - 10} width={10} height={8} rx="1" fill="white" stroke={c.table} strokeWidth="1.1" />
                <path d={`M${cx - 18} ${cy - 7}h10M${cx - 13} ${cy - 10}v8`} stroke={c.table} strokeWidth="0.8" />
                {/* Chart */}
                <rect x={cx - 3} y={cy - 6} width={2.4} height={4} fill={c.chartB} />
                <rect x={cx + 0.2} y={cy - 9} width={2.4} height={7} fill={c.chartA} />
                <rect x={cx + 3.4} y={cy - 7.5} width={2.4} height={5.5} fill={c.chartB} />
                {/* SmartArt */}
                <rect x={cx + 9} y={cy - 10} width={4.4} height={3.4} rx="0.8" fill={c.smartArt} />
                <rect x={cx + 14.6} y={cy - 5.6} width={4.4} height={3.4} rx="0.8" fill={c.smartArt} opacity="0.75" />
                <path d={`M${cx + 11.2} ${cy - 6.6}v2.7h3.4`} stroke={c.smartArt} strokeWidth="0.8" fill="none" />
                {/* Picture */}
                <rect x={cx - 18} y={cy + 2} width={10} height={8} rx="1" fill="white" stroke={c.picture} strokeWidth="1.1" />
                <path d={`M${cx - 16.6} ${cy + 8.6}l2.6-3.4 2 2 1.6-1.6 2.6 3Z`} fill={c.picture} />
                {/* Video */}
                <rect x={cx - 4} y={cy + 2} width={10} height={8} rx="1.6" fill={c.video} />
                <path d={`M${cx - 0.2} ${cy + 4}l3.4 2-3.4 2Z`} fill="white" />
                {/* Icon */}
                <circle cx={cx + 14} cy={cy + 4.2} r="2" fill={c.icon} />
                <path d={`M${cx + 10.6} ${cy + 10}c0-2.6 1.5-3.6 3.4-3.6s3.4 1 3.4 3.6Z`} fill={c.icon} />
              </g>
            ) : null}
            {role === "picture" ? (
              <g>
                <circle cx={x + w * 0.3} cy={y + h * 0.3} r={Math.min(w, h) * 0.08} fill={c.sun} />
                <path
                  d={`M${x + w * 0.12} ${y + h * 0.8}L${x + w * 0.4} ${y + h * 0.42}L${x + w * 0.62} ${y + h * 0.8}Z`}
                  fill={c.hillBack}
                />
                <path
                  d={`M${x + w * 0.36} ${y + h * 0.8}L${x + w * 0.62} ${y + h * 0.5}L${x + w * 0.88} ${y + h * 0.8}Z`}
                  fill={c.hillFront}
                />
              </g>
            ) : null}
            {placeholder.vertical ? (
              <g strokeLinecap="round">
                {[0.28, 0.5, 0.72].map((fx, column) => (
                  <line
                    key={fx}
                    x1={x + w * fx}
                    y1={y + h * 0.16}
                    x2={x + w * fx}
                    y2={y + h * (column === 0 ? 0.84 : 0.7)}
                    stroke={role === "title" ? c.title : c.line}
                    strokeWidth={role === "title" ? 2 : 1.3}
                  />
                ))}
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Outline import (placeholder): a document whose lines become slides. */
export function IconOutlineImport({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

/** Reuse slides (placeholder): a slide pulled out of a stack. */
export function IconReuseSlides({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3" y="7" width="13" height="10" rx="1.5" />
      <path d="M8 4h13v10" opacity="0.5" />
      <path d="M19 17v4M17 19h4" />
    </svg>
  );
}

/** PPT's Home-tab TEXT SHADOW toggle: the S casting its own shadow. */
export function IconTextShadow({ size }: RibbonIconProps) {
  return (
    <svg {...frame(size)} data-presentation-ribbon-icon="text-shadow">
      <path
        d="M16.5 8.5c0 -2 -1.8 -3.2 -4 -3.2c-2.4 0 -4 1.3 -4 3c0 4 8 2.4 8 6.4c0 1.9 -1.8 3.3 -4.2 3.3c-2.3 0 -4.1 -1.3 -4.1 -3.2"
        transform="translate(2.2 2.2)"
        opacity="0.3"
      />
      <path d="M16.5 8.5c0 -2 -1.8 -3.2 -4 -3.2c-2.4 0 -4 1.3 -4 3c0 4 8 2.4 8 6.4c0 1.9 -1.8 3.3 -4.2 3.3c-2.3 0 -4.1 -1.3 -4.1 -3.2" />
    </svg>
  );
}

/** Shape Effects menu: a square projecting a soft shadow. */
export function IconShapeEffects({ home, size }: RibbonIconProps) {
  return (
    <svg
      {...frame(size, home)}
      data-presentation-ribbon-icon="drawing-shape-effects"
    >
      <rect
        className={homeRole(home, "detail")}
        x="4"
        y="4"
        width="12"
        height="12"
        rx="2"
      />
      <path
        className={homeRole(home, "accent")}
        d="M9 20h9a2 2 0 0 0 2-2V9"
        opacity="0.58"
      />
    </svg>
  );
}
