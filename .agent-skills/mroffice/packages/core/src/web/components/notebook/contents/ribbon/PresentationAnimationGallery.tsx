"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId } from "react";
import {
  OfficeGalleryMenuContent,
  officeGalleryMenuGridStyle,
  officeGalleryMenuStyles,
} from "../../../office-ribbon/OfficeGalleryMenu";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "../../../ui/dropdown-menu";
import {
  PRESENTATION_ANIMATION_EFFECT_CATEGORIES,
  PRESENTATION_ANIMATION_EFFECT_GROUPS,
  PRESENTATION_WEB_ANIMATION_EFFECTS,
  presentationAnimationEffectsByCategory,
  type TimelineAnimation,
} from "../../../../lib/presentation-anim-timeline";
import { effectRecipeMotionPoints } from "../../../../lib/presentation-effect-recipes";

/** The size the ribbon strip shows its icons at (the window's animation
 * gallery rule makes them 34 px); the More menus draw theirs as large, so a
 * picture reads the same in both. */
export const PRESENTATION_ANIMATION_ICON_SIZE = 34;

const STAR =
  "M16 4.5 19.4 11.3 27 12.4 21.5 17.8 22.8 25.4 16 21.8 9.2 25.4 10.5 17.8 5 12.4 12.6 11.3Z";

/**
 * What each PowerPoint effect drawn from a recipe does, as a glyph over the
 * star: `cut` shapes are drawn in white inside the star (what the reveal
 * leaves out), `line` paths are drawn in the category colour around it (how
 * the object moves). Keyed by the effect's name without its `-in` / `-out`.
 */
const RECIPE_GLYPHS: Readonly<
  Record<
    string,
    {
      cut?: string;
      line?: string;
      dots?: boolean;
      exitLine?: string;
      /** The colour the effect turns the object, drawn on the star's right half. */
      tint?: string;
      /** A letter for an effect on the text's style. */
      letter?: { text: string; weight?: number; italic?: boolean; underline?: boolean };
    }
  >
> = {
  circle: { cut: "M16 10.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" },
  diamond: { cut: "M16 9.5 22.5 16 16 22.5 9.5 16Z" },
  plus: { cut: "M14 9h4v5h5v4h-5v5h-4v-5H9v-4h5Z" },
  wedge: { cut: "M16 16 10 4h12Z" },
  wheel: { cut: "M16 16V3a13 13 0 0 1 11.3 6.5Z", line: "M24 26a13 13 0 0 1-17-1m0 4v-4h4" },
  dissolve: { dots: true },
  "flash-once": { line: "M16 1v3M4 5l2.5 2.5M28 5l-2.5 2.5M2 16h3m22 0h3" },
  crawl: { line: "M16 31v-2m0-3v-2m-4 1 4-4 4 4", exitLine: "M16 23v2m0 3v2m-4-3 4 4 4-4" },
  "float-up": { line: "M4 29h24M16 27v-7m-3 3 3-3 3 3" },
  "float-down": { line: "M4 3h24M16 5v7m-3-3 3 3 3-3" },
  swivel: { line: "M16 1v30M5 9c-5 4-5 10 0 14m22-14c5 4 5 10 0 14" },
  "basic-swivel": { line: "M16 1v30M6 12c-3 3-3 5 0 8m20-8c3 3 3 5 0 8" },
  "center-revolve": { line: "M5 22a12.5 12.5 0 0 1 22-11m0-5v5h-5" },
  spinner: { line: "M27 21a12.5 12.5 0 1 1 0-10m0-5v5h-5" },
  pinwheel: { line: "M16 16c0-8 6-10 10-7M16 16c8 0 10 6 7 10M16 16c0 8-6 10-10 7M16 16c-8 0-10-6-7-10" },
  boomerang: { line: "M28 6c-9-3-17 0-20 9m0 0-1-5m1 5 5-1M6 27c5 2 10 1 13-2" },
  spiral: { line: "M16 16c3 0 3-4 0-4-5 0-6 8 0 9 9 1 12-12 2-15C7 4 1 13 5 22" },
  compress: { line: "M1 16h6m-3-3 3 3-3 3m27-3h-6m3-3-3 3 3 3" },
  stretchy: { line: "M7 16H1m3-3-3 3 3 3m21-3h6m-3-3 3 3-3 3" },
  zip: { line: "M21 21l8 8M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0m9-4v8m-4-4h8" },
  "curve-up": { line: "M3 29c2-12 9-20 24-23m-5-2 5 2-3 5" },
  "curve-down": { line: "M3 3c2 12 9 20 24 23m-5 2 5-2-3-5" },
  credits: { line: "M10 27h12M12 30h8M16 24v-9m-3 3 3-3 3 3" },
  ease: { line: "M1 16h9m-3-3 3 3-3 3M1 10h4M1 22h4" },
  float: { line: "M30 2 20 12m0-6v6h6M2 30l6-6" },
  "light-speed": { line: "M1 9h9M1 16h12M1 23h9m18-9 3 2-3 2" },
  sling: { line: "M1 22h17c8 0 8-10 2-10m3-3-3 3 3 3" },
  thread: { cut: "M3 15h26v2H3Z" },
  glide: { line: "M1 16h8m-3-3 3 3-3 3M12 6v20" },
  fold: { line: "M5 5h14l8 8v14H5ZM19 5v8h8" },
  bounce: { line: "M2 26c2-10 6-10 8 0 2-7 5-7 7 0 1-4 4-4 5 0 1-2 3-2 4 0" },
  "shrink-and-turn": { line: "M5 15C-2 9 1 3 8 3m-3-3 3 3-3 3" },
  "sink-down": { line: "M16 19v10m-4-4 4 4 4-4" },
  contract: { line: "M6 17H1m3-3 3 3-3 3m21-3h6m-3-3-3 3 3 3" },
  teeter: { line: "M3 24 29 14M16 19v10m-5 0h10" },
  "flash-bulb": { line: "M16 0v3M4 4l2 2m22-2-2 2M0 16h3m26 0h3M4 28l2-2m22 2-2-2M16 29v3" },
  "object-color": { tint: "#ed7d31" },
  "complementary-color": { tint: "#8a4fd0" },
  "complementary-color-2": { tint: "#1f9e8f" },
  "contrasting-color": { tint: "#3559d6" },
  darken: { tint: "#7a4a00" },
  lighten: { tint: "#fff1d6" },
  desaturate: { tint: "#b8b0a2" },
  flicker: { tint: "#ffffff", line: "M27 2v5m-2.5-2.5h5M4 24v4m-2-2h4" },
  blast: { line: "M16 0v4M3 5l3 3m23-3-3 3M0 17h4m24 0h4M4 29l3-3m21 3-3-3" },
  "vertical-highlight": { tint: "#ed7d31", line: "M16 0v4m-3-1 3-3 3 3M16 32v-4m-3 1 3 3 3-3" },
  "bold-flash": { letter: { text: "B", weight: 800 } },
  "style-emphasis": { letter: { text: "A", weight: 700, italic: true, underline: true } },
  // Letter by letter: a row of letters, the effect on the last of them.
  "color-typewriter": { letter: { text: "abc" }, tint: "#ed7d31" },
  drop: { letter: { text: "abc" }, line: "M27 0v6m-2.5-2.5 2.5 2.5 2.5-2.5" },
  unfold: { letter: { text: "abc" }, line: "M1 28h9m-3-3 3 3-3 3" },
  whip: { letter: { text: "abc" }, line: "M1 6c6-5 12-5 16 0m-4 0h4v-4" },
  flip: { letter: { text: "abc" }, line: "M21 3a6 6 0 1 1-6 6m0-4v4h4" },
  "brush-color": { letter: { text: "abc" }, tint: "#ed7d31", line: "M2 29l6-6" },
  underline: { letter: { text: "U", underline: true } },
  "color-wave": { letter: { text: "abc" }, tint: "#8a4fd0", line: "M2 29c3-4 5 4 8 0s5 4 8 0" },
  "grow-with-color": { letter: { text: "aA" }, tint: "#ed7d31" },
  wave: { letter: { text: "abc" }, line: "M2 29c3-4 5 4 8 0s5 4 8 0 5 4 8 0" },
  shimmer: { letter: { text: "abc" }, line: "M26 1v4m-2-2h4M5 25v4m-2-2h4" },
};

/** A motion path fitted into the icon box: its line, and where it starts and ends. */
function motionPathGlyph(effect: string): {
  d: string;
  start: [number, number];
  end: [number, number];
  closed: boolean;
} | null {
  const points = effectRecipeMotionPoints(effect);
  if (!points || points.length === 0) return null;
  // The object's own place is the origin the path leaves from.
  const all: Array<[number, number]> =
    points[0][0] === 0 && points[0][1] === 0 ? points : [[0, 0], ...points];
  // A slide is wider than tall, and the path is in fractions of each: draw it
  // in the slide's proportions.
  const scaled = all.map(([x, y]): [number, number] => [x * 16, y * 9]);
  const xs = scaled.map((point) => point[0]);
  const ys = scaled.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1e-6);
  const scale = 24 / span;
  const offsetX = 4 + (24 - (Math.max(...xs) - minX) * scale) / 2;
  const offsetY = 4 + (24 - (Math.max(...ys) - minY) * scale) / 2;
  const fitted = scaled.map(([x, y]): [number, number] => [
    Math.round((offsetX + (x - minX) * scale) * 10) / 10,
    Math.round((offsetY + (y - minY) * scale) * 10) / 10,
  ]);
  const start = fitted[0];
  const end = fitted[fitted.length - 1];
  return {
    d: fitted.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(""),
    start,
    end,
    closed: Math.hypot(end[0] - start[0], end[1] - start[1]) < 1,
  };
}

function recipeGlyph(effect: string) {
  const base = effect.replace(/-(in|out)$/, "");
  return RECIPE_GLYPHS[effect] ?? RECIPE_GLYPHS[base] ?? null;
}

/** PPT-owned effect glyphs: category color plus the actual operation, not one
 * category icon repeated for every effect. Shared by the strip and popup. */
export function PresentationAnimationIcon({
  effect,
  size = PRESENTATION_ANIMATION_ICON_SIZE,
}: {
  effect: string;
  size?: number;
}) {
  const clip = useId().replaceAll(":", "");
  const entry = PRESENTATION_WEB_ANIMATION_EFFECTS.find(
    (item) => item.id === effect,
  );
  const category = entry?.category;
  // A motion path's glyph is the path itself: the line the object travels,
  // from the green start to the red end.
  const motion = entry?.motionPath ? motionPathGlyph(effect) : null;
  if (motion) {
    return (
      <svg
        width={size}
        height={size}
        style={{ width: size, height: size }}
        viewBox="0 0 32 32"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        data-presentation-animation-icon={effect}
      >
        <path d={motion.d} stroke="#5b6b7d" strokeWidth="1.5" />
        <circle cx={motion.start[0]} cy={motion.start[1]} r="2.2" fill="#2b9044" />
        {motion.closed ? null : (
          <circle cx={motion.end[0]} cy={motion.end[1]} r="2.2" fill="#df2921" />
        )}
      </svg>
    );
  }
  const stroke =
    effect === "none"
      ? "#777777"
      : effect === "existing"
        ? "#8db7df"
        : category === "exit"
          ? "#df2921"
          : category === "emphasis"
            ? "#d66b00"
            : "#2b9044";
  const fill =
    effect === "none"
      ? "#d0d0d0"
      : effect === "existing"
        ? "#d6e8f7"
        : category === "exit"
          ? "#ffb4af"
          : category === "emphasis"
            ? "#ffd18c"
            : "#91dc9f";
  const exit = category === "exit";
  const bars = /blinds|random-bars|strips/.test(effect);
  const zoom = /zoom|grow-shrink|expand|stretch/.test(effect);
  return (
    <svg
      width={size}
      height={size}
      // A menu row forces every icon inside it to 16 px (`[&_svg]:size-4`);
      // the icon keeps the size it was asked for.
      style={{ width: size, height: size }}
      viewBox="0 0 32 32"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-presentation-animation-icon={effect}
    >
      <defs>
        <clipPath id={clip}>
          <path d={STAR} />
        </clipPath>
      </defs>
      <path d={STAR} fill={fill} />
      {effect.includes("fade") || effect === "transparency" ? (
        <path
          d="M3 3H16V28H3Z"
          fill="white"
          opacity=".72"
          stroke="none"
          clipPath={`url(#${clip})`}
        />
      ) : null}
      {effect.includes("split") ? (
        <path
          d="M13 4 16 8 19 4 18 28 15 24 13 28Z"
          fill="white"
          opacity=".8"
          stroke="none"
          clipPath={`url(#${clip})`}
        />
      ) : null}
      {effect.includes("wipe") ? (
        <path
          d="M3 3H29V14H3Z"
          fill="white"
          opacity=".8"
          stroke="none"
          clipPath={`url(#${clip})`}
        />
      ) : null}
      {bars ? (
        <g
          clipPath={`url(#${clip})`}
          stroke="white"
          strokeWidth={effect.includes("random") ? 2 : 3}
          transform={
            effect.includes("strips") ? "rotate(-20 16 16)" : undefined
          }
        >
          <path d="M2 10H30M2 16H30M2 22H30" />
        </g>
      ) : null}
      {effect.includes("checkerboard") ? (
        <g fill="white" stroke="none" clipPath={`url(#${clip})`}>
          <path d="M8 8h8v8H8Zm8 8h8v8h-8Z" />
        </g>
      ) : null}
      {effect.includes("box") || effect.includes("basic-zoom") ? (
        <path
          d={STAR}
          transform="translate(5 5) scale(.68)"
          fill="white"
          stroke="white"
          opacity=".85"
        />
      ) : null}
      {effect.includes("fly") || effect === "rise-up" ? (
        <g stroke={stroke}>
          <path d="M11 27v4m5-4v4m5-4v4" />
          <path
            d={exit ? "M16 8v11m-4-4 4 4 4-4" : "M16 19V8m-4 4 4-4 4 4"}
            stroke="white"
            strokeWidth="2"
          />
        </g>
      ) : null}
      {effect === "appear" || effect === "disappear" ? (
        <path d="m2 3 3 3M16 0v2m11 4 3-3" />
      ) : null}
      {zoom ? (
        <path
          d={
            /expand|stretch/.test(effect)
              ? "M1 17h5m-3-3-3 3 3 3m23-3h5m-3-3 3 3-3 3"
              : "M23 3h6v6m0-6-6 6M9 29H3v-6m0 6 6-6"
          }
        />
      ) : null}
      {effect === "spin" || effect === "grow-and-turn" ? (
        <>
          <path d="M5 15C-2 9 1 3 8 3m-3-3 3 3-3 3" />
          <path d={STAR} transform="translate(-1 17) scale(.42)" fill={fill} />
        </>
      ) : null}
      {effect.startsWith("peek") ? (
        <path d="M1 10h4m-4 5h5m-5 5h4m-3 5h4" />
      ) : null}
      {effect === "line-color" || effect === "fill-color" ? (
        <path
          d="M16 4.5 19.4 11.3 27 12.4 21.5 17.8 22.8 25.4 16 21.8Z"
          fill={effect === "fill-color" ? "#5fb6ef" : fill}
          stroke="#0877be"
        />
      ) : null}
      {(() => {
        const glyph = recipeGlyph(effect);
        if (!glyph) return null;
        const line = (exit && glyph.exitLine) || glyph.line;
        return (
          <>
            {glyph.cut ? (
              <path
                d={glyph.cut}
                fill="white"
                opacity=".88"
                stroke="none"
                clipPath={`url(#${clip})`}
              />
            ) : null}
            {glyph.dots ? (
              <g fill="white" stroke="none" clipPath={`url(#${clip})`}>
                <path d="M9 9h3v3H9Zm6 2h3v3h-3Zm6-2h3v3h-3Zm-9 6h3v3h-3Zm7 1h3v3h-3Zm-11 4h3v3H8Zm6 2h3v3h-3Zm7-1h3v3h-3Z" />
              </g>
            ) : null}
            {glyph.tint ? (
              <path
                d="M16 3H29V29H16Z"
                fill={glyph.tint}
                opacity=".92"
                stroke="none"
                clipPath={`url(#${clip})`}
              />
            ) : null}
            {glyph.letter ? (
              <text
                x="16"
                y="20.5"
                textAnchor="middle"
                fill="#333"
                stroke="none"
                fontSize="13"
                fontWeight={glyph.letter.weight ?? 400}
                fontStyle={glyph.letter.italic ? "italic" : undefined}
                textDecoration={glyph.letter.underline ? "underline" : undefined}
                fontFamily="Arial, sans-serif"
              >
                {glyph.letter.text}
              </text>
            ) : null}
            {line ? <path d={line} /> : null}
          </>
        );
      })()}
      {effect === "font-color" ? (
        <>
          <text
            x="16"
            y="20"
            textAnchor="middle"
            fill="#333"
            stroke="none"
            fontSize="13"
            fontFamily="Arial, sans-serif"
          >
            A
          </text>
          <path d="M12 23h8" stroke="#d62e25" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}

export function PresentationAnimationGallery({
  selected,
  canSelect,
  onSelect,
  canRemove,
  onRemove,
  t,
}: {
  selected?: string;
  canSelect: (effect: TimelineAnimation) => boolean;
  onSelect: (effect: TimelineAnimation) => void;
  canRemove: boolean;
  onRemove: () => void;
  t: (key: string) => string;
}) {
  return (
    <OfficeGalleryMenuContent data-testid="presentation-animation-more-menu">
      <DropdownMenuLabel className={officeGalleryMenuStyles.section}>
        {t("presentation.animations.effectsGroup")}
      </DropdownMenuLabel>
      <div className={officeGalleryMenuStyles.grid} style={officeGalleryMenuGridStyle(7, 72)}>
        <button
          type="button"
          disabled
          className={officeGalleryMenuStyles.tile}
          aria-label={t("presentation.animations.existing")}
        >
          <PresentationAnimationIcon effect="existing" />
          <span className={officeGalleryMenuStyles.name}>
            {t("presentation.animations.existing")}
          </span>
        </button>
        <DropdownMenuItem asChild disabled={!canRemove} onSelect={onRemove}>
          <button
            type="button"
            disabled={!canRemove}
            className={officeGalleryMenuStyles.tile}
            data-selected={!selected ? "true" : "false"}
            data-testid="presentation-animation-more-none"
          >
            <PresentationAnimationIcon effect="none" />
            <span className={officeGalleryMenuStyles.name}>
              {t("presentation.animation.none")}
            </span>
          </button>
        </DropdownMenuItem>
      </div>
      {PRESENTATION_ANIMATION_EFFECT_CATEGORIES.filter(
        // The Media section only for a clip, as PowerPoint shows it.
        (category) =>
          category !== "media" ||
          presentationAnimationEffectsByCategory("media").some((entry) => canSelect(entry.id)),
      ).map((category) => (
        <section key={category}>
          <DropdownMenuLabel
            className={officeGalleryMenuStyles.section}
            data-control-id={`PPTCTL.RIBBON.ANIMATIONS.${category.toUpperCase()}.GALLERY`}
          >
            {t(`presentation.animations.${category}`)}
          </DropdownMenuLabel>
          {/* The shared selector, not a second filter: a catalogue row may be
              one this editor READS, plays and writes without ever offering it
              as a new choice (Stretch as an exit, which PowerPoint's own exit
              gallery does not list -- it offers Stretchy). `galleryHidden`
              says so, and only this selector honours it. The rows are grouped
              as PowerPoint groups them: Basic, Subtle, Moderate, Exciting. */}
          <div data-testid={`presentation-animation-gallery-${category}`}>
            {PRESENTATION_ANIMATION_EFFECT_GROUPS.map((group) => {
              const entries = presentationAnimationEffectsByCategory(
                category,
              ).filter((entry) => entry.group === group && !entry.motionPath);
              if (entries.length === 0) return null;
              return (
                <div
                  key={group}
                  role="group"
                  aria-label={t(`presentation.animations.group.${group}`)}
                  data-animation-group={group}
                >
                  <div className={officeGalleryMenuStyles.subsection}>
                    {t(`presentation.animations.group.${group}`)}
                  </div>
                  <div className={officeGalleryMenuStyles.grid} style={officeGalleryMenuGridStyle(7, 72)}>
                    {entries.map((entry) => {
                      const enabled = canSelect(entry.id);
                      return (
                        <DropdownMenuItem
                        asChild
                        key={entry.id}
                        disabled={!enabled}
                        onSelect={() => {
                          if (canSelect(entry.id)) onSelect(entry.id);
                        }}
                      >
                        <button
                          type="button"
                          disabled={!enabled}
                          className={officeGalleryMenuStyles.tile}
                          data-selected={selected === entry.id ? "true" : "false"}
                          aria-pressed={selected === entry.id}
                          data-control-id={entry.controlId}
                          data-testid={`presentation-animation-more-${entry.id}`}
                          title={
                            enabled
                              ? undefined
                              : t("presentation.animations.importedPatchbackLimited")
                          }
                        >
                          <PresentationAnimationIcon effect={entry.id} />
                          <span className={officeGalleryMenuStyles.name}>
                            {t(`presentation.animation.${entry.id}`)}
                          </span>
                        </button>
                      </DropdownMenuItem>
                    );
                  })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {/* PowerPoint's fourth effect class, in its own section: Basic shapes,
          Lines & Curves, Special. */}
      <section>
        <DropdownMenuLabel
          className={officeGalleryMenuStyles.section}
          data-control-id="PPTCTL.RIBBON.ANIMATIONS.MOTION_PATHS.GALLERY"
        >
          {t("presentation.animations.motionPaths")}
        </DropdownMenuLabel>
        <div data-testid="presentation-animation-gallery-motion-paths">
          {(["basic", "lines", "special"] as const).map((group) => {
            const entries = presentationAnimationEffectsByCategory(
              "emphasis",
            ).filter((entry) => entry.motionPath && entry.group === group);
            if (entries.length === 0) return null;
            return (
              <div
                key={group}
                role="group"
                aria-label={t(`presentation.animations.pathGroup.${group}`)}
                data-animation-group={group}
              >
                <div className={officeGalleryMenuStyles.subsection}>
                  {t(`presentation.animations.pathGroup.${group}`)}
                </div>
                <div className={officeGalleryMenuStyles.grid} style={officeGalleryMenuGridStyle(7, 72)}>
                  {entries.map((entry) => {
                    const enabled = canSelect(entry.id);
                    return (
                      <DropdownMenuItem
                      asChild
                      key={entry.id}
                      disabled={!enabled}
                      onSelect={() => {
                        if (canSelect(entry.id)) onSelect(entry.id);
                      }}
                    >
                      <button
                        type="button"
                        disabled={!enabled}
                        className={officeGalleryMenuStyles.tile}
                        data-selected={selected === entry.id ? "true" : "false"}
                        aria-pressed={selected === entry.id}
                        data-control-id={entry.controlId}
                        data-testid={`presentation-animation-more-${entry.id}`}
                        title={
                          enabled
                            ? undefined
                            : t("presentation.animations.importedPatchbackLimited")
                        }
                      >
                        <PresentationAnimationIcon effect={entry.id} />
                        <span className={officeGalleryMenuStyles.name}>
                          {t(`presentation.animation.${entry.id}`)}
                        </span>
                      </button>
                    </DropdownMenuItem>
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </OfficeGalleryMenuContent>
  );
}
