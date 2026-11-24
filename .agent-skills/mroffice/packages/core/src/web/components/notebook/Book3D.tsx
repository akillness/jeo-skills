"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";

import { MrMarkLogo } from "../brand/MrMarkLogo";
import {
  coverArt,
  coverArtImage,
  coverArtLightImage,
  type CoverArt,
  type CoverArtLayer,
  type CoverArtParticles,
  type CoverArtPlaces,
} from "../../lib/cover-art";
import {
  getSafeCoverImageUrl,
  isDynamicCoverTemplate,
  readableCoverInk,
  type CoverTemplate,
} from "../../lib/notebook-cover";
import "../../styles/cover-art.css";
import styles from "./Book3D.module.css";

export interface Book3DProps {
  title: string;
  typeLabel: string;
  template: CoverTemplate;
  coverColor: string;
  spineColor: string;
  textTheme: "light" | "dark";
  imageUrl?: string;
  dateLabel?: string;
  isOpening?: boolean;
  onBookClick?: () => void;
  /** A moving cover: "play" moves while on screen; "hover" only while the
   *  picker tile it sits in is pointed at, focused or chosen (a picker full
   *  of moving tiles is noise). */
  motion?: "play" | "hover";
}

export const Book3D = memo(function Book3D({
  title,
  typeLabel,
  template,
  coverColor,
  spineColor,
  textTheme,
  imageUrl,
  dateLabel,
  isOpening,
  onBookClick,
  motion = "play",
}: Book3DProps) {
  const style = {
    "--book-cover": coverColor,
    "--book-spine": spineColor,
  } as CSSProperties;
  const dynamic = isDynamicCoverTemplate(template);
  // a painted cover (lib/cover-art.ts); an id the catalogue does not know
  // renders as the plain cover
  const art = coverArt(template);
  const painted = dynamic || art !== null;
  // a plain cover's title is drawn in an ink that can be read on its colour
  const ink = painted ? textTheme : readableCoverInk(coverColor, textTheme);
  const bookRef = useRef<HTMLDivElement>(null);
  // A moving cover rests while it is off screen (a long shelf scrolled away
  // keeps no animation running).
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const node = bookRef.current;
    if (!dynamic || !node || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(Boolean(entry?.isIntersecting)),
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [dynamic]);

  return (
    <div
      ref={bookRef}
      className={`book3d book3d--${template}${art ? " book3d--art" : ""} book3d--text-${ink} ${styles.book}`}
      data-dynamic={dynamic || undefined}
      data-art-ink={art?.ink}
      data-neutral={painted && isNeutralColor(coverColor) ? "true" : undefined}
      data-motion={dynamic ? motion : undefined}
      data-offscreen={dynamic && !onScreen ? "true" : undefined}
      data-opening={isOpening || undefined}
      data-clickable={onBookClick ? "true" : undefined}
      style={style}
      onClick={
        onBookClick
          ? () => {
              onBookClick();
            }
          : undefined
      }
    >
      <div className={`book3d__stage ${styles.stage}`}>
        <span className={styles.backCover} aria-hidden="true" />
        <span className={styles.pageBlock} aria-hidden="true" />
        <div className="book3d__inner-pages" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {template === "journal" ? (
          // the journal's satin bookmark hangs out of the pages, below the
          // cover's foot, so it lives on the stage behind the cover
          <span className="book3d__ribbon" aria-hidden="true" />
        ) : null}
        <div className={`book3d__cover ${styles.cover}`}>
          <span className={styles.spine} aria-hidden="true" />
          <span className={styles.texture} aria-hidden="true" />
          {art ? (
            <ArtCover art={art} typeLabel={typeLabel} title={title} />
          ) : (
            renderCoverContent(template, typeLabel, title, imageUrl)
          )}
          {dateLabel ? (
            <span
              className={styles.coverDate}
              data-testid="notebook-cover-date"
            >
              {dateLabel}
            </span>
          ) : null}
          {

}
          <span className={styles.brandDeboss} aria-hidden="true">
            <MrMarkLogo size={32} />
          </span>
          <span className="book3d__cover-sheen" aria-hidden="true" />
        </div>
        {template === "spiral" ? (
          // the wire-o binding wraps over the cover's edge, so it lives on
          // the stage, in front of the cover, not clipped by it
          <span className="book3d__coil" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
});










function ArtCover({
  art,
  typeLabel,
  title,
}: {
  art: CoverArt;
  typeLabel: string;
  title: string;
}) {
  // The book's serif (Noto Serif SC, a served face): declared once per
  // document so a title reads the same on a Windows PC as on a Mac; a guest
  // page, which is not served it, keeps the stack's local faces.
  // The font tables load only for this: a shelf should not parse them to draw.
  useEffect(() => {
    void import("../../lib/office-fonts/substitutes").then((fonts) =>
      fonts.ensureOfficeFontFaces("Noto Serif SC"),
    );
  }, []);
  const layers = art.layers ?? [];
  const turning = layers.includes("turn");
  const style = {
    "--art": `url("${coverArtImage(art)}")`,
    ...(layers.includes("twinkle")
      ? { "--art-lights": `url("${coverArtLightImage(art, "lights")}")` }
      : {}),
    ...(layers.includes("shimmer")
      ? { "--art-glints": `url("${coverArtLightImage(art, "glints")}")` }
      : {}),
    ...(art.light ? { "--lx": `${art.light[0]}%`, "--ly": `${art.light[1]}%` } : {}),
    ...placeProperties(art.places),
  } as CSSProperties;
  return (
    <>
      <span className="book3d__scene book3d__art" style={style} aria-hidden="true">
        {turning ? (
          <span className="book3d__m book3d__art-turn">
            <i />
            {layers.includes("twinkle") ? <ArtLayer layer="twinkle" /> : null}
          </span>
        ) : (
          <span className="book3d__art-world">
            <i className="book3d__plate" />
            {[...layers]
              .sort((a, b) => LAYER_ORDER.indexOf(a) - LAYER_ORDER.indexOf(b))
              .map((layer) => (
                <ArtLayer key={layer} layer={layer} />
              ))}
          </span>
        )}
        <i className="book3d__tint" />
        {art.particles ? (
          art.places?.weather !== undefined ? (
            // weather that stops at a sill or a shore
            <span className="book3d__art-weather">
              <ArtParticles art={art} kind={art.particles} />
            </span>
          ) : (
            <ArtParticles art={art} kind={art.particles} />
          )
        ) : null}
        <i className="book3d__finish" />
      </span>
      <div
        className={
          art.ink === "dark" ? "book3d__paper-title" : "book3d__sky-title"
        }
      >
        <span className="book3d__type">{typeLabel}</span>
        <span className="book3d__title">{title}</span>
      </div>
    </>
  );
}

/** A painting's places as the custom properties its recipes read
 *  (styles/cover-art.css): heights in %, a light's reach and a tone as
 *  plain numbers, a lean or a turn of colour in degrees, a waterfall as
 *  its box. */
function placeProperties(places: CoverArtPlaces | undefined): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const [place, value] of Object.entries(places ?? {})) {
    if (Array.isArray(value)) {
      ["left", "top", "right", "bottom"].forEach((side, index) => {
        properties[`--${place}-${side}`] = `${value[index]}%`;
      });
      continue;
    }
    // a tone is baked into the cover's light images, not read by CSS
    if (place === "spark") continue;
    const name = `--${place.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    properties[name] =
      place === "glow"
        ? String(value)
        : place === "tilt" || place === "hue"
          ? `${value}deg`
          : `${value}%`;
  }
  return properties;
}

/** The order the parts are laid on the painting: the displaced copies
 *  first (each is opaque over its band), then the light, so a copy never
 *  covers a glow, a sheen or a twinkle laid on the same place. */
const LAYER_ORDER: readonly CoverArtLayer[] = [
  "sky",
  "aurora",
  "water",
  "wash",
  "heat",
  "sway",
  "mist",
  "gust",
  "sheen",
  "rays",
  "fall",
  "shimmer",
  "glow",
  "flicker",
  "flash",
  "burst",
  "twinkle",
  "turn",
];

/** How many copies of the painting a moving layer is cut from (the second
 *  is its --b, out of step with the first); a layer of travelling light
 *  is drawn by its windows instead. Each copy is a composited layer, so a
 *  shelf of moving covers keeps to a few per part. */
const LAYER_COPIES: Partial<Record<CoverArtLayer, number>> = {
  water: 2,
  heat: 2,
  glow: 2,
  flicker: 2,
  flash: 2,
  twinkle: 2,
  shimmer: 0,
  mist: 0,
  gust: 0,
  sheen: 0,
  rays: 0,
  fall: 0,
};

/** The layers whose light travels: each a window moving over a copy of
 *  the painting held still (.book3d__art-sweep). */
const LAYER_SWEEPS: Partial<Record<CoverArtLayer, readonly string[]>> = {
  shimmer: ["shimmer"],
  mist: ["mist", "mist book3d__art-mist--b"],
  gust: ["gust"],
  sheen: ["sheen"],
  rays: ["rays"],
};

function ArtLayer({ layer }: { layer: CoverArtLayer }) {
  if (layer === "fall") {
    // a still window over the fall, a falling one inside it
    return (
      <span className="book3d__art-fall">
        <b className="book3d__m">
          <i className="book3d__m" />
        </b>
      </span>
    );
  }
  const copies = LAYER_COPIES[layer] ?? 1;
  return (
    <>
      {Array.from({ length: copies }, (_, index) => (
        <i
          key={index}
          className={`book3d__m book3d__layer book3d__art-${layer}${
            index > 0 ? ` book3d__art-${layer}--b` : ""
          }`}
        />
      ))}
      {(LAYER_SWEEPS[layer] ?? []).map((sweep) => (
        <span key={sweep} className={`book3d__m book3d__art-sweep book3d__art-${sweep}`}>
          <i className="book3d__m" />
        </span>
      ))}
    </>
  );
}

/** How many of each particle a cover carries, and where they start. */
const PARTICLES: Record<
  Exclude<CoverArtParticles, "rain" | "snow">,
  { count: number; x: [number, number]; y: [number, number]; s: [number, number]; t: [number, number] }
> = {
  fireflies: { count: 10, x: [6, 92], y: [46, 92], s: [4.6, 10], t: [13, 21] },
  motes: { count: 12, x: [6, 92], y: [24, 92], s: [1.6, 3.4], t: [9, 16] },
  embers: { count: 9, x: [-12, 12], y: [-4, 4], s: [1.6, 3.2], t: [3.2, 5.6] },
  bubbles: { count: 8, x: [8, 90], y: [78, 100], s: [2.4, 5.4], t: [7, 12] },
  lanterns: { count: 7, x: [8, 88], y: [56, 96], s: [3, 6.4], t: [16, 26] },
  petals: { count: 9, x: [36, 100], y: [4, 46], s: [3, 4.8], t: [12, 18] },
  leaves: { count: 8, x: [36, 100], y: [4, 46], s: [3.4, 5.4], t: [12, 18] },
  meteors: { count: 3, x: [6, 52], y: [6, 34], s: [1, 1], t: [3.6, 6] },
};

function ArtParticles({ art, kind }: { art: CoverArt; kind: CoverArtParticles }) {
  if (kind === "rain") {
    return (
      <>
        <i className="book3d__m book3d__art-rain" />
        <i className="book3d__m book3d__art-rain book3d__art-rain--near" />
      </>
    );
  }
  if (kind === "snow") {
    return (
      <>
        <i className="book3d__m book3d__art-snow" />
        <i className="book3d__m book3d__art-snow book3d__art-snow--near" />
      </>
    );
  }
  const spec = PARTICLES[kind];
  // the same cover always scatters its particles the same way (and the
  // server's render matches the client's)
  const random = seededRandom(art.id);
  const between = ([low, high]: [number, number]) => low + random() * (high - low);
  // embers rise from the cover's own light
  const origin = kind === "embers" && art.light ? art.light : null;
  return (
    <>
      {Array.from({ length: spec.count }, (_, index) => {
        const t = between(spec.t);
        const style = {
          "--x": `${(origin ? origin[0] : 0) + between(spec.x)}%`,
          "--y": `${(origin ? origin[1] : 0) + between(spec.y)}%`,
          "--s": between(spec.s).toFixed(2),
          "--t": `${t.toFixed(2)}s`,
          "--d": `${(-random() * t).toFixed(2)}s`,
        } as CSSProperties;
        return (
          <i
            key={index}
            className={`book3d__m book3d__art-p book3d__art-p--${kind}`}
            style={style}
          />
        );
      })}
    </>
  );
}

/** A small deterministic generator seeded by a string (mulberry32). */
function seededRandom(seed: string): () => number {
  let state = 0;
  for (let index = 0; index < seed.length; index += 1) {
    state = (Math.imul(state, 31) + seed.charCodeAt(index)) | 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Black, white and the greys: a painted cover keeps its own colours
 * instead of being washed toward them. */
function isNeutralColor(color: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return false;
  const value = Number.parseInt(match[1], 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255];
  return Math.max(...channels) - Math.min(...channels) < 28;
}

function CoverImage({ imageUrl }: { imageUrl?: string }) {
  const safeImageUrl = getSafeCoverImageUrl(imageUrl);

  return (
    <div className="book3d__cover-image" aria-hidden="true">
      {safeImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- cover previews can be local data URLs.
        <img
          src={safeImageUrl}
          alt=""
          className="book3d__cover-img"
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      ) : (
        // no picture yet: a quiet plate that says where it will go
        <span className="book3d__cover-placeholder" />
      )}
    </div>
  );
}

function renderCoverContent(
  template: CoverTemplate,
  typeLabel: string,
  title: string,
  imageUrl?: string,
) {
  switch (template) {
    case "halfImage":
      return (
        <>
          <CoverImage imageUrl={imageUrl} />
          <div className="book3d__cover-band">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "fullImage":
      return (
        <>
          <CoverImage imageUrl={imageUrl} />
          <div className="book3d__cover-veil" aria-hidden="true" />
          <div className="book3d__cover-band">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "framed":
      return (
        <>
          <span className="book3d__frame" aria-hidden="true" />
          <span className="book3d__type">{typeLabel}</span>
          <span className="book3d__title">{title}</span>
          <span className="book3d__crest" aria-hidden="true" />
        </>
      );
    case "ruled":
      return (
        <>
          <div className="book3d__rule-bg" aria-hidden="true" />
          <div className="book3d__nameplate">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "cloth":
      // half-bound: bookcloth boards, leather spine and corners, gilt title
      return (
        <>
          <span className="book3d__weave" aria-hidden="true" />
          <span className="book3d__binding" aria-hidden="true" />
          <span
            className="book3d__corner book3d__corner--top"
            aria-hidden="true"
          />
          <span
            className="book3d__corner book3d__corner--bottom"
            aria-hidden="true"
          />
          <div className="book3d__foil">
            <span className="book3d__foil-rule" aria-hidden="true" />
            <span className="book3d__title">{title}</span>
            <span className="book3d__foil-rule" aria-hidden="true" />
            <span className="book3d__type">{typeLabel}</span>
          </div>
        </>
      );
    case "journal":
      // a dotted journal: soft cover, debossed dot grid, elastic closure
      return (
        <>
          <span className="book3d__dotgrid" aria-hidden="true" />
          <div className="book3d__journal-head">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
          <span className="book3d__elastic" aria-hidden="true" />
        </>
      );
    case "spiral":
      // a wire-o binder: frosted plastic boards punched along the spine
      return (
        <>
          <span className="book3d__frost" aria-hidden="true" />
          <div className="book3d__spiral-head">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "kraft":
      // kraft paper, a twine tie, and a rubber-stamped label
      return (
        <>
          <span className="book3d__fibre" aria-hidden="true" />
          <div className="book3d__stamp">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
          <span className="book3d__twine" aria-hidden="true" />
        </>
      );
    case "marble":
      // the composition book: marbled boards and the classic name box
      return (
        <>
          <span className="book3d__marble" aria-hidden="true" />
          <div className="book3d__namebox">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "magazine":
      // the type is the cover: the title set as the masthead over its
      // double rule, the dateline under it (the type label and the issue),
      // the issue number large, cover lines
      return (
        <>
          <div className="book3d__masthead">
            <span className="book3d__title">{title}</span>
            <span className="book3d__dateline">
              <span className="book3d__type">{typeLabel}</span>
              <span className="book3d__issue-no" aria-hidden="true">
                No.01
              </span>
            </span>
          </div>
          <span className="book3d__issue" aria-hidden="true">
            01
          </span>
          <span className="book3d__headlines" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </>
      );
    case "aurora":
      // light through colour: a soft mesh that drifts, a slow sheen, grain,
      // and a pane of glass
      return (
        <>
          <span className="book3d__aurora" aria-hidden="true">
            <i className="book3d__m book3d__aurora-blob" />
            <i className="book3d__m book3d__aurora-blob" />
            <i className="book3d__m book3d__aurora-blob" />
            <i className="book3d__m book3d__aurora-blob" />
            {/* inside the mesh's rounded clip: the sheen is wider than the
                cover */}
            <span className="book3d__m book3d__aurora-sheen" />
          </span>
          <span className="book3d__grain" aria-hidden="true" />
          <div className="book3d__glass">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "borealis":
      // the polar night: the painting's own aurora sways and brightens, its
      // lake ripples, its stars twinkle (every moving part is cut from the plate)
      return (
        <>
          <span className="book3d__scene book3d__borealis" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--stars" />
            <i className="book3d__m book3d__layer book3d__layer--aurora" />
            <i className="book3d__m book3d__layer book3d__layer--aurora-glow" />
            <i className="book3d__m book3d__layer book3d__layer--lake" />
            <i className="book3d__tint" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__sky-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "nebula":
      
      
      // wheel past, a meteor now and then
      return (
        <>
          <span className="book3d__scene book3d__nebula" aria-hidden="true">
            <span className="book3d__m book3d__galaxy">
              <i className="book3d__galaxy-sky" />
              <i className="book3d__m book3d__galaxy-stars" />
              <i className="book3d__m book3d__galaxy-heart" />
            </span>
            <i className="book3d__tint" />
            <i className="book3d__m book3d__meteor" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__sky-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "tide":
      // the shore at dusk: the painted clouds drift, the sea heaves, the foam
      // runs up the sand and back, the sun's path shimmers, the sun breathes
      return (
        <>
          <span className="book3d__scene book3d__tide" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--sky" />
            <i className="book3d__m book3d__layer book3d__layer--sea" />
            <i className="book3d__m book3d__layer book3d__layer--wash" />
            <i className="book3d__m book3d__layer book3d__layer--path" />
            <i className="book3d__m book3d__layer book3d__layer--sun" />
            <i className="book3d__tint" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__sky-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "holo":
      // holographic foil: the spectrum shifts and a sheen sweeps across
      return (
        <>
          <span className="book3d__holo" aria-hidden="true">
            <i className="book3d__m book3d__holo-shift" />
            <i className="book3d__holo-sparkle" />
            <i className="book3d__m book3d__holo-sheen" />
          </span>
          <div className="book3d__holo-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "rain":
      // a city at night through wet glass: the painted lights twinkle, rain
      // falls beyond the pane, drops run down it
      return (
        <>
          <span className="book3d__scene book3d__rain" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--lights" />
            <i className="book3d__tint" />
            <i className="book3d__m book3d__rainfall" />
            <i className="book3d__m book3d__rainfall book3d__rainfall--near" />
            <i className="book3d__m book3d__runnel book3d__runnel--a" />
            <i className="book3d__m book3d__runnel book3d__runnel--b" />
            <i className="book3d__m book3d__runnel book3d__runnel--c" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__sky-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "fireflies":
      // a summer night meadow: the painted mist drifts, fireflies wander and
      // glow
      return (
        <>
          <span className="book3d__scene book3d__fireflies" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--mist" />
            <i className="book3d__tint" />
            <i className="book3d__m book3d__firefly book3d__firefly--a" />
            <i className="book3d__m book3d__firefly book3d__firefly--b" />
            <i className="book3d__m book3d__firefly book3d__firefly--c" />
            <i className="book3d__m book3d__firefly book3d__firefly--d" />
            <i className="book3d__m book3d__firefly book3d__firefly--e" />
            <i className="book3d__m book3d__firefly book3d__firefly--f" />
            <i className="book3d__m book3d__firefly book3d__firefly--g" />
            <i className="book3d__m book3d__firefly book3d__firefly--h" />
            <i className="book3d__m book3d__firefly book3d__firefly--i" />
            <i className="book3d__m book3d__firefly book3d__firefly--j" />
            <i className="book3d__m book3d__firefly book3d__firefly--k" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__sky-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "snowfall":
      // a winter night in the pines: the cabin's own window flickers, the
      // painted clouds drift, snow falls at three depths
      return (
        <>
          <span className="book3d__scene book3d__snowfall" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--sky" />
            <i className="book3d__m book3d__layer book3d__layer--window" />
            <i className="book3d__tint" />
            <i className="book3d__m book3d__snow book3d__snow--far" />
            <i className="book3d__m book3d__snow" />
            <i className="book3d__m book3d__snow book3d__snow--near" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__sky-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "blossom":
      // a flowering branch at dawn: the painted branch sways in the air,
      // petals tumble down
      return (
        <>
          <span className="book3d__scene book3d__blossom" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--branch" />
            <i className="book3d__tint" />
            <i className="book3d__m book3d__petal book3d__petal--a" />
            <i className="book3d__m book3d__petal book3d__petal--b" />
            <i className="book3d__m book3d__petal book3d__petal--c" />
            <i className="book3d__m book3d__petal book3d__petal--d" />
            <i className="book3d__m book3d__petal book3d__petal--e" />
            <i className="book3d__m book3d__petal book3d__petal--f" />
            <i className="book3d__m book3d__petal book3d__petal--g" />
            <i className="book3d__m book3d__petal book3d__petal--h" />
            <i className="book3d__m book3d__petal book3d__petal--i" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__paper-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "inkwash":
      // a shan shui: the painting's own mist drifts through the ranges, its
      // water stirs and the boat rocks, two birds cross, a seal
      return (
        <>
          <span className="book3d__scene book3d__inkwash" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--lake" />
            <i className="book3d__m book3d__layer book3d__layer--mist-a" />
            <i className="book3d__m book3d__layer book3d__layer--mist-b" />
            <i className="book3d__tint" />
            <i className="book3d__m book3d__birds" />
            <i className="book3d__seal" />
            <i className="book3d__finish" />
          </span>
          <div className="book3d__paper-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "koi":
      // a koi pond at dusk: the light on the painted water shimmers, two
      // painted koi circle in the open water
      return (
        <>
          <span className="book3d__scene book3d__koi" aria-hidden="true">
            <i className="book3d__plate" />
            <i className="book3d__m book3d__layer book3d__layer--water" />
            <i className="book3d__tint" />
            <i className="book3d__m book3d__orbit book3d__orbit--a">
              <b className="book3d__m book3d__koi-fish book3d__koi-fish--a" />
            </i>
            <i className="book3d__m book3d__orbit book3d__orbit--b">
              <b className="book3d__m book3d__koi-fish book3d__koi-fish--b" />
            </i>
            <i className="book3d__finish" />
          </span>
          <div className="book3d__sky-title">
            <span className="book3d__type">{typeLabel}</span>
            <span className="book3d__title">{title}</span>
          </div>
        </>
      );
    case "solid":
    default:
      return (
        <>
          <span className="book3d__type">{typeLabel}</span>
          <span className="book3d__title">{title}</span>
        </>
      );
  }
}
