"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Slide and master/layout thumbnails: the rail miniature with its eager
 * render radius and accessible name, and the master / layout preview slides
 * drawn in Slide Master view.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { PresentationTextEngineSurfaceContext } from "./PresentationEngineTextBody";
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { presentationRailVirtualEnabled } from "../../../../lib/presentation-flags";
import { queueProgressiveBuild } from "@mrnote/core/web/lib/progressive-build.ts";
import { LAYOUT_DEFINITIONS } from "@mrnote/core/web/lib/presentation-layouts.ts";
import { slideBounds, slideDimension } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { normalizeThemeColor, type DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { OfficeMasterViewEntry } from "../../../../lib/presentation-office-master";
import {
  catalogPreviewBackground,
  masterGraphicsInheritedByLayout,
  mergeMasterTheme,
  type SlideMaster,
  type SlideMasterLayout,
} from "@mrnote/core/web/lib/presentation-master.ts";
import { normalizePresentationBlock, type SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { AUTOFIT_EMU_PER_PX } from "../../../../lib/presentation/text-layout-css";
import {
  observeElementIntersection,
  observeElementResize,
} from "@mrnote/core/web/lib/shared-element-observers.ts";
import { PresentationSlideView } from "./PresentationSlideView";
import { PowerPointLineFitAfterPaintContext } from "./usePowerPointLineFit";

/**
 * The accessible name of a list thumbnail. PowerPoint draws no text under a
 * thumbnail -- only the number beside it (the rail's `::before`) -- and
 * announces it as "Slide N" in the interface language. The slide's title
 * joins the name when it is a real one: the importer's own fallback
 * ("Slide N", always English) is not, so it never reaches a localized name.
 * The 1-based number is the absolute deck position.
 */
export function presentationSlideThumbnailName(
  index: number,
  title: string | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const number = index + 1;
  const text = (title ?? "").trim();
  const meaningful = text && !/^slide\s+\d+$/i.test(text);
  return meaningful
    ? t("presentation.slideThumbnailNameWithTitle", { index: number, title: text })
    : t("presentation.slideThumbnailName", { index: number });
}

/**
 * Runs `then` once the frame now being built has painted (a frame, then a
 * task): the deck's slide is on screen before a miniature is drawn. Where
 * nothing paints frames or nothing is observed (jsdom), at once, as the
 * virtual gate opens at once there.
 */
function afterDeckPaint(host: Element, then: () => void): () => void {
  const view = host.ownerDocument.defaultView;
  if (!view || typeof view.requestAnimationFrame !== "function" || typeof view.IntersectionObserver !== "function") {
    then();
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const frame = view.requestAnimationFrame(() => {
    timer = setTimeout(() => {
      timer = null;
      then();
    }, 0);
  });
  return () => {
    view.cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
  };
}

/**
 * How many rail tiles either side of the active slide render their miniature
 * with the deck instead of waiting for the virtualization gate. A tall rail
 * shows about nine tiles, so this covers the screenful the deck opens on
 * while a 60-slide deck still pays for a constant number of miniatures.
 */
export const RAIL_EAGER_MINIATURE_RADIUS = 6;

function sameMiniThumbnailProps(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): boolean {
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(previous).length) return false;
  return keys.every((key) => {
    const a = previous[key];
    const b = next[key];
    if (Object.is(a, b)) return true;
    if (key !== "slide" || !a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const slideA = a as Record<string, unknown>;
    const slideB = b as Record<string, unknown>;
    const fields = Object.keys(slideB);
    return fields.length === Object.keys(slideA).length &&
      fields.every((field) => Object.is(slideA[field], slideB[field]));
  });
}

/**
 * A REAL miniature of a slide for the list, replacing the coloured
 * geometry bars that used to stand in for one ("侧边小视图显示不良" — reported
 * from real use, twice). The present-mode renderer paints the slide at a fixed
 * natural width inside a clipped box, scaled down by a measured factor, so the
 * thumbnail shows what the slide actually looks like: text, fills, images,
 * charts — the same pixels present mode would paint.
 *
 * Measured with a ResizeObserver rather than CSS math because a scale factor
 * (`hostWidth / naturalWidth`) cannot be expressed in stylesheet units across
 * the browsers we support. The measurement runs in a LAYOUT effect so the
 * miniature is part of the paint the tile first appears in: measuring after
 * the paint left every tile empty-white until a second render landed, which
 * on a heavy deck (60 imported slides, a chart on each) is a rail of blank
 * tiles that fills in by itself seconds later.
 *
 * Embeds render as a static badge (`staticMedia`): a rail full of live iframes
 * / `<video preload>` would fetch on every deck open, once per thumbnail.
 *
 * Memoized: a tile whose slide, theme and masters are unchanged is not
 * drawn again when its host re-renders (a ribbon tab, a selection, a
 * keystroke on another slide). A slide is compared field by field: an edit
 * re-creates every slide object of the deck with the same contents.
 */
/** A slide holding this many table cells is heavy (see useQuietHeavySlide). */
const HEAVY_SLIDE_TABLE_CELLS = 1_000;
/** How long a heavy slide's tile waits for the typing to pause. */
const HEAVY_SLIDE_QUIET_MS = 600;
const heavySlides = new WeakMap<object, boolean>();
function isHeavySlide(slide: SlideModel): boolean {
  const known = heavySlides.get(slide);
  if (known !== undefined) return known;
  let cells = 0;
  for (const block of (slide as { blocks?: ReadonlyArray<{ type?: string; rows?: ReadonlyArray<ReadonlyArray<unknown>> }> }).blocks ?? []) {
    if (block.type === "table" && Array.isArray(block.rows)) for (const row of block.rows) cells += row.length;
  }
  const heavy = cells >= HEAVY_SLIDE_TABLE_CELLS;
  heavySlides.set(slide, heavy);
  return heavy;
}

/** `slide`, or (a heavy slide changing) the one shown until the changes have
 * paused for HEAVY_SLIDE_QUIET_MS. */
function useQuietHeavySlide(slide: SlideModel): SlideModel {
  const [quiet, setQuiet] = useState(slide);
  const heavy = isHeavySlide(slide);
  useEffect(() => {
    if (!heavy) return;
    const timer = setTimeout(() => setQuiet(slide), HEAVY_SLIDE_QUIET_MS);
    return () => clearTimeout(timer);
  }, [heavy, slide]);
  return heavy && quiet.id === slide.id ? quiet : slide;
}

export const SlideMiniThumbnail = memo(function SlideMiniThumbnail({
  slide,
  theme,
  masters,
  className,
  eager = false,
  unscaledFallback = false,
  frameless = false,
  overlay,
  slideNumber,
}: {
  /** Drawn over the slide at its natural size (the deck's footer, as
   * PowerPoint's thumbnails show it). */
  overlay?: ReactNode;
  /** The number a slide-number field on the slide reads. */
  slideNumber?: number;
  slide: SlideModel;
  theme?: DeckTheme;
  masters?: readonly SlideMaster[];
  /** Extra class for host-owned chrome (the rail's active-slide border). */
  className?: string;
  /**
   * This tile belongs to the screenful the deck opens on: render it with the
   * deck instead of waiting for an IntersectionObserver answer, which can
   * only arrive after the first paint. The rest of the rail stays virtual.
   */
  eager?: boolean;
  /**
   * A host that measures no width (a layout engine without layout, jsdom)
   * still paints the slide at its natural size inside the clipped box, so
   * what the card holds can be read; a browser always measures first.
   */
  unscaledFallback?: boolean;
  /**
   * The host draws the slide's edge itself (the AI draft review's slide
   * card): no thumbnail border or rounding of its own inside it.
   */
  frameless?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const measureRef = useRef<(() => void) | null>(null);
  // VIRTUALIZED MINIATURE (flag): the real scaled block render mounts only
  // once this host has been within 600px of the viewport, and stays mounted
  // afterwards — the lazy-KaTeX recipe (mount-once, keep) so scrolling never
  // re-mounts a thumbnail it already paid for. Without IntersectionObserver
  // (jsdom, ancient engines) the gate opens immediately: correctness first.
  const [seenNearViewport, setSeenNearViewport] = useState(
    () => !presentationRailVirtualEnabled(),
  );
  const nearViewport = seenNearViewport;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setHostSize((current) => {
      const next = { width: host.clientWidth, height: host.clientHeight };
      // A tile that measures nothing after it had a size is hidden (the rail
      // under Slide Sorter, a closed pane), not resized: it keeps the
      // miniature it drew at the size it last had. Dropping it there redrew
      // every miniature the rail had shown in one task on the way back to
      // Normal view (287 slides: 616 ms).
      if (next.width === 0 && next.height === 0 && current.width > 0) return current;
      return current.width === next.width && current.height === next.height ? current : next;
    });
    measureRef.current = measure;
    // one ResizeObserver shared by every tile of the rail and the sorter; its
    // first answer, after the layout the browser does anyway, is the size of a
    // tile whose miniature waits for its turn. Read here, in the deck's commit,
    // every tile of the rail forced a layout of the whole window before the
    
    const stop = observeElementResize(host, measure);
    // A tile drawn in this commit is measured now, so its miniature is in the
    // paint the tile first appears in.
    if (!stop || nearViewport) measure();
    return () => {
      stop?.();
      measureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measured once, at mount
  }, []);
  // The miniature's turn came before the observer answered (or nothing
  // observes): measured now, as at mount, so it paints with the tile.
  useLayoutEffect(() => {
    if (nearViewport && hostSize.width === 0) measureRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on the gate opening only
  }, [nearViewport]);
  useEffect(() => {
    if (nearViewport) return;
    const host = hostRef.current;
    if (eager && host) {
      // A tile of the screenful the deck opens on is drawn once the slide
      // the reader opened has painted, nearest the view first: drawn in the
      // deck's own first render, the thirteen miniatures around the active
      // slide held that slide's first paint for as long as they all took
      // (ONLYOFFICE draws the slide, then its thumbnails). It keeps its
      // miniature after it leaves the opening screenful: scrolling back
      // never draws it again.
      let withdraw: (() => void) | null = null;
      const cancelPaint = afterDeckPaint(host, () => {
        withdraw = queueProgressiveBuild(host, () => setSeenNearViewport(true));
      });
      return () => {
        cancelPaint();
        withdraw?.();
      };
    }
    // one IntersectionObserver shared by every still-virtual tile
    let stop: (() => void) | null = null;
    // A tile that came near waits for its turn: one miniature per frame,
    // nearest the view first (lib/progressive-build), so a fast scroll that
    // brings a dozen tiles in at once is not held while all of them render.
    let withdraw: (() => void) | null = null;
    stop = host
      ? observeElementIntersection(
          host,
          (entry) => {
            if (!entry.isIntersecting) return;
            stop?.();
            withdraw = queueProgressiveBuild(host, () => setSeenNearViewport(true));
          },
          { rootMargin: "600px" },
        )
      : null;
    if (!stop) {
      setSeenNearViewport(true);
      return;
    }
    return () => {
      stop?.();
      withdraw?.();
    };
  }, [eager, nearViewport]);
  // The slide as this tile draws it. A keystroke on the slide reaches its
  // tile in a deferred render that the next keystroke interrupts: typing
  // never waits for the miniature, which catches up when the typing pauses.
  //
  
  // drawn again only once the typing pauses: its deferred render, though it
  // never holds a key up, redrew the whole table a second time on every
  // keystroke and committed it, the main thread's work doubled while typing.
  const quietSlide = useQuietHeavySlide(slide);
  const drawnSlide = useDeferredValue(quietSlide);
  // A theme or a master changed (Design > Themes) reaches the miniatures the
  // same way: the slide takes the new theme in the render the pick makes, the
  // rail in the deferred one after it has painted (a theme pick redrew every
  
  const drawnTheme = useDeferredValue(theme);
  const drawnMasters = useDeferredValue(masters);
  const miniature = useMemo(
    () => (
      <PresentationSlideView
        slide={drawnSlide}
        theme={drawnTheme}
        masters={drawnMasters}
        staticMedia
        naturalSize
        showAnimations={false}
        {...(overlay !== undefined ? { overlay } : {})}
        {...(slideNumber !== undefined ? { slideNumber } : {})}
      />
    ),
    [drawnSlide, drawnTheme, drawnMasters, overlay, slideNumber],
  );
  const bounds = slideBounds(drawnSlide);
  const naturalWidth = Math.max(1, bounds.width / AUTOFIT_EMU_PER_PX);
  const naturalHeight = Math.max(1, bounds.height / AUTOFIT_EMU_PER_PX);
  const measured = hostSize.width > 0
    ? Math.min(hostSize.width / naturalWidth, hostSize.height > 0 ? hostSize.height / naturalHeight : Infinity)
    : 0;
  const scale = measured > 0 ? measured : unscaledFallback ? 1 : 0;
  return (
    <span
      ref={hostRef}
      aria-hidden="true"
      inert
      className={["presentation-window__thumb-mini", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: `${bounds.width} / ${bounds.height}`,
        overflow: "hidden",
        borderRadius: frameless ? undefined : 4,
        border: frameless ? undefined : "1px solid rgba(15,23,42,0.10)",
        background: "#ffffff",
        pointerEvents: "none",
        // View ▸ Color/Grayscale previews the thumbnails too (PPT-A109).
        filter: "var(--presentation-view-filter, none)",
      }}
    >
      {scale > 0 && nearViewport ? (
        <span
          style={{
            position: "absolute",
            top: Math.max(0, (hostSize.height - naturalHeight * scale) / 2),
            left: Math.max(0, (hostSize.width - naturalWidth * scale) / 2),
            width: naturalWidth,
            height: naturalHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* A miniature's words are laid out by the text engine, as the
              printed slide's are (`PresentationEngineTextBody`). */}
          {/* Its lines are fitted once the frame has painted: the slide the
              reader looks at is not held while the rail reads its layout. */}
          <PresentationTextEngineSurfaceContext.Provider value>
            <PowerPointLineFitAfterPaintContext.Provider value>{miniature}</PowerPointLineFitAfterPaintContext.Provider>
          </PresentationTextEngineSurfaceContext.Provider>
        </span>
      ) : null}
    </span>
  );
}, sameMiniThumbnailProps);

/**
 * A master layout as a slide the thumbnail renderer can draw.
 *
 * The deck's own slide size, so a 4:3 package's layout is not squeezed into
 * a 16:9 frame, and a deterministic id for a block that has none: the
 * normalizer would otherwise mint a fresh UUID on every recompute, churning
 * React keys and remounting every preview.
 */
export function masterLayoutPreviewSlide(
  master: SlideMaster,
  layout: SlideMasterLayout,
  deckSlide: SlideModel | undefined,
): SlideModel {
  const widthEmu = slideDimension(deckSlide, "widthEmu");
  const heightEmu = slideDimension(deckSlide, "heightEmu");
  // PowerPoint composes a layout's thumbnail from the master's graphics (not
  // its placeholders, and not at all under `showMasterSp="0"`) behind the
  // layout's own shapes; the master's graphics are projected once, on the
  // master's card, and laid under every layout here (§73).
  const blocks = [
    ...masterGraphicsInheritedByLayout(master, layout),
    ...(layout.blocks ?? []),
  ];
  return {
    id: `master-${master.id}-${layout.id}`,
    title: "",
    ...(widthEmu && heightEmu ? { widthEmu, heightEmu } : {}),
    // The layout's own background, else the master's, else the theme's --
    // the order PowerPoint resolves a layout's background in.
    ...catalogPreviewBackground(master, layout),
    blocks: blocks.map((block, index) =>
      normalizePresentationBlock(
        { ...block, id: block.id ?? `${layout.id}-block-${index}` },
        index,
      ),
    ),
  } as SlideModel;
}

/**
 * The master's OWN card: PowerPoint's Slide Master view shows the master as
 * the large thumbnail above its layouts, graphics and placeholders alike.
 * An imported master carries the projection of its shape tree (§73); a master
 * the editor created carries its master text, or nothing.
 */
export function masterPreviewSlide(
  master: SlideMaster,
  deckSlide: SlideModel | undefined,
): SlideModel {
  const widthEmu = slideDimension(deckSlide, "widthEmu");
  const heightEmu = slideDimension(deckSlide, "heightEmu");
  return {
    id: `master-${master.id}`,
    title: "",
    ...(widthEmu && heightEmu ? { widthEmu, heightEmu } : {}),
    ...catalogPreviewBackground(master),
    blocks: (master.blocks ?? []).map((block, index) =>
      normalizePresentationBlock(
        { ...block, id: block.id ?? `${master.id}-block-${index}` },
        index,
      ),
    ),
  } as SlideModel;
}

/**
 * One master layout's thumbnail, for the master view's cards and the Design
 * panel's layout gallery alike.
 *
 * The layout's real blocks (an imported layout's shape tree, projected by the
 * same walk its slides go through) are drawn by the slide renderer itself, as a
 * static thumbnail: one projection scale over the slide's own design space, so
 * a 72px gallery tile wraps text exactly where the canvas does. Only a layout
 * with no blocks — one the editor created, or an imported one whose preview
 * the page could not carry (recorded as `pptx_layout_preview_not_projected`) —
 * falls back to the editor's silhouette for its `builtInLayoutId`.
 */
/**
 * One card of an Office theme deck's Slide Master view (PPT-B030), drawn by
 * the slide renderer: the layout's placeholders with PowerPoint's master
 * prompts, so the master's text styles and list ladder show as the slides
 * inherit them. Static and inert, like the master view's other thumbnails.
 */
export function PresentationOfficeMasterPreview({
  slide,
  theme,
}: {
  slide: OfficeMasterViewEntry["slide"];
  theme?: DeckTheme;
}) {
  const model = {
    ...slide,
    blocks: slide.blocks.map((block, index) => normalizePresentationBlock(block, index)),
  } as unknown as SlideModel;
  // The rail's miniature: a slide-shaped box the measured scale fits the
  // slide into. The bare slide view has no size of its own here, so the
  // thumbnail pane showed 2 px of border and no card (acceptance finding 9).
  return (
    <span
      aria-hidden="true"
      inert
      data-master-layout-preview="office"
      style={{ display: "block", width: "100%", pointerEvents: "none" }}
    >
      <SlideMiniThumbnail slide={model} theme={theme} eager unscaledFallback />
    </span>
  );
}

export function MasterLayoutThumbnail({
  layout,
  slide,
  theme,
  master,
  masters,
}: {
  layout: SlideMasterLayout;
  slide: SlideModel;
  theme?: DeckTheme;
  master: SlideMaster;
  masters?: readonly SlideMaster[];
}) {
  if (slide.blocks.length > 0) {
    return (
      <span
        aria-hidden="true"
        inert
        data-master-layout-preview="blocks"
        data-master-layout-preview-blocks={slide.blocks.length}
        style={{ display: "block", width: "100%", pointerEvents: "none" }}
      >
        <SlideMiniThumbnail slide={slide} theme={theme} masters={masters} eager unscaledFallback />
      </span>
    );
  }
  const bounds = slideBounds(slide);
  const silhouette = LAYOUT_DEFINITIONS.find(
    (definition) => definition.id === layout.builtInLayoutId,
  );
  return (
    <span
      aria-hidden="true"
      data-master-layout-preview="silhouette"
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: `${bounds.width} / ${bounds.height}`,
        overflow: "hidden",
        borderRadius: 4,
        border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
        background:
          normalizeThemeColor(mergeMasterTheme(theme, master)?.background) ??
          "#ffffff",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.12)",
      }}
    >
      {silhouette?.placeholders.map((placeholder, index) => (
        <span
          key={`${layout.id}-ph-${index}`}
          style={{
            position: "absolute",
            left: `${placeholder.left * 100}%`,
            top: `${placeholder.top * 100}%`,
            width: `${placeholder.width * 100}%`,
            height: `${placeholder.height * 100}%`,
            border: "1px solid rgba(13, 148, 136, 0.58)",
            background:
              placeholder.role === "title"
                ? "rgba(13, 148, 136, 0.18)"
                : "rgba(148, 163, 184, 0.2)",
            borderRadius: 1,
          }}
        />
      ))}
    </span>
  );
}
