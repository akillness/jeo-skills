"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The fill fields of Format Background (PowerPoint's Format Background pane,
 * PPT-B024): Solid fill's Color and Transparency, Gradient fill's gradient
 * stops (Add / Remove gradient stop, each stop's Color and Position) and
 * Angle, and Pattern fill's patterns with Foreground and Background colours.
 * The pane around it (fill kind, picture fill, Hide background graphics,
 * Apply to All, Reset Background) lives in the window; this component only
 * edits the slide's fill fields through the callbacks, one commit per change.
 *
 * Angles are shown as PowerPoint shows them (0 deg = left to right,
 * clockwise); the page stores the CSS angle, which the writers turn into
 * `a:lin@ang` (CSS - 90).
 */

import { useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Minus, Plus } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import {
  OfficeColorPalettePopover,
  type OfficeColorPalettePopoverLabels,
} from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import {
  bgGradientCss,
  bgPatternCss,
  normalizeBgGradient,
  normalizeBgPatternFill,
  normalizeSolidBackgroundTransparency,
  SLIDE_BG_PATTERNS,
  type BgGradient,
  type SlideBgPattern,
} from "@mrnote/core/web/lib/presentation-slide-bg.ts";

import styles from "./PresentationBackgroundFillFields.module.css";

/** The most stops a gradient carries (the page schema and the writers' bound). */
const MAX_GRADIENT_STOPS = 8;

export interface PresentationBackgroundFillFieldsProps {
  readonly kind: "solid" | "gradient" | "pattern";
  readonly backgroundColor: unknown;
  readonly backgroundTransparency: unknown;
  readonly backgroundGradient: unknown;
  readonly backgroundPattern: unknown;
  readonly disabled: boolean;
  readonly recents: readonly string[];
  readonly paletteLabels: OfficeColorPalettePopoverLabels;
  readonly onSolidColor: (color: string) => void;
  readonly onTransparency: (percent: number) => void;
  readonly onGradient: (gradient: BgGradient) => void;
  readonly onPattern: (patch: {
    pattern?: SlideBgPattern;
    color?: string;
    background?: string;
  }) => void;
  readonly onRecentColor: (color: string) => void;
  readonly t: (key: string) => string;
}

type PaletteTarget = "solid" | "stop" | "foreground" | "background";

/** A gradient as stops, whatever form the page holds it in. */
export function gradientStops(gradient: BgGradient): { color: string; position: number }[] {
  return gradient.stops
    ? gradient.stops.map((stop) => ({ ...stop }))
    : [
        { color: gradient.from, position: 0 },
        { color: gradient.to, position: 1 },
      ];
}

/** The stored gradient for these stops: the stop form, with its two ends as from / to. */
export function gradientFromStops(
  stops: readonly { color: string; position: number }[],
  angle: number,
): BgGradient {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  return {
    from: sorted[0].color,
    to: sorted[sorted.length - 1].color,
    angle,
    stops: sorted,
  };
}

/**
 * PowerPoint's "Add gradient stop": a stop between the selected stop and the
 * next one (or the previous one at the end), in the colour of the selected
 * stop. Null at the eight-stop bound.
 */
export function gradientWithAddedStop(
  stops: readonly { color: string; position: number }[],
  selected: number,
): { stops: { color: string; position: number }[]; selected: number } | null {
  if (stops.length >= MAX_GRADIENT_STOPS) return null;
  const current = stops[selected] ?? stops[stops.length - 1];
  const neighbour = stops[selected + 1] ?? stops[selected - 1] ?? current;
  const position = Math.round(((current.position + neighbour.position) / 2) * 1000) / 1000;
  const next = [...stops, { color: current.color, position }].sort(
    (a, b) => a.position - b.position,
  );
  return { stops: next, selected: next.findIndex((stop) => stop.position === position && stop.color === current.color) };
}

function pptAngle(cssAngle: number): number {
  return (((cssAngle - 90) % 360) + 360) % 360;
}

function cssAngle(pptAngleValue: number): number {
  return (((pptAngleValue + 90) % 360) + 360) % 360;
}

export function PresentationBackgroundFillFields({
  kind,
  backgroundColor,
  backgroundTransparency,
  backgroundGradient,
  backgroundPattern,
  disabled,
  recents,
  paletteLabels,
  onSolidColor,
  onTransparency,
  onGradient,
  onPattern,
  onRecentColor,
  t,
}: PresentationBackgroundFillFieldsProps): ReactElement {
  const [paletteTarget, setPaletteTarget] = useState<PaletteTarget | null>(null);
  const [selectedStop, setSelectedStop] = useState(0);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const solid = typeof backgroundColor === "string" ? backgroundColor : "#ffffff";
  const transparency = normalizeSolidBackgroundTransparency(backgroundTransparency);
  const gradient = normalizeBgGradient(backgroundGradient);
  const pattern = normalizeBgPatternFill(backgroundPattern);
  const stops = gradient ? gradientStops(gradient) : [];
  const stopIndex = Math.min(selectedStop, Math.max(0, stops.length - 1));
  const stop = stops[stopIndex];

  const openPalette = (target: PaletteTarget, button: HTMLButtonElement) => {
    anchorRef.current = button;
    setPaletteTarget(target);
  };
  const paletteValue =
    paletteTarget === "solid"
      ? solid
      : paletteTarget === "stop"
        ? stop?.color
        : paletteTarget === "foreground"
          ? pattern?.color
          : paletteTarget === "background"
            ? pattern?.background
            : undefined;
  const pick = (color: string | null) => {
    const target = paletteTarget;
    setPaletteTarget(null);
    if (!color || !target) return;
    onRecentColor(color);
    if (target === "solid") onSolidColor(color);
    else if (target === "stop" && gradient && stop) {
      onGradient(
        gradientFromStops(
          stops.map((entry, index) => (index === stopIndex ? { ...entry, color } : entry)),
          gradient.angle,
        ),
      );
    } else if (target === "foreground") onPattern({ color });
    else if (target === "background") onPattern({ background: color });
  };

  const colorButton = (
    target: PaletteTarget,
    color: string,
    label: string,
    testId: string,
  ) => (
    <div className={presentationChrome.backgroundColorRow}>
      <span>{label}</span>
      <span className={presentationChrome.backgroundPaletteAnchor}>
        <button
          type="button"
          className={presentationChrome.backgroundColorButton}
          onClick={(event) => openPalette(target, event.currentTarget)}
          aria-label={label}
          aria-expanded={paletteTarget === target}
          disabled={disabled}
          data-testid={testId}
        >
          <span aria-hidden="true" style={{ backgroundColor: color }} />
          {color}
        </button>
      </span>
    </div>
  );

  return (
    <div className={styles.fields} data-testid={`presentation-background-${kind}-fields`}>
      {kind === "solid" ? (
        <>
          {colorButton("solid", solid, t("presentation.backgroundPane.color"), "presentation-background-solid-color")}
          <label className={styles.slider}>
            <span>{t("presentation.backgroundPane.transparency")}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={transparency}
              disabled={disabled}
              aria-label={t("presentation.backgroundPane.transparency")}
              data-testid="presentation-background-transparency-slider"
              onChange={(event) => onTransparency(Number(event.target.value))}
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={transparency}
              disabled={disabled}
              aria-label={`${t("presentation.backgroundPane.transparency")} (%)`}
              data-testid="presentation-background-transparency"
              onChange={(event) => {
                const value = Math.round(Number(event.target.value));
                if (Number.isFinite(value) && value >= 0 && value <= 100) onTransparency(value);
              }}
            />
            <span aria-hidden="true">%</span>
          </label>
        </>
      ) : null}

      {kind === "gradient" && gradient && stop ? (
        <>
          <span className={presentationChrome.taskPaneSectionLabel}>
            {t("presentation.backgroundPane.gradientStops")}
          </span>
          <div className={styles.stopRow}>
            <div
              className={styles.stopBar}
              style={{ background: bgGradientCss({ ...gradient, angle: 90 }) } as CSSProperties}
              role="listbox"
              aria-label={t("presentation.backgroundPane.gradientStops")}
              data-testid="presentation-background-gradient-bar"
            >
              {stops.map((entry, index) => (
                <button
                  key={`${index}:${entry.position}`}
                  type="button"
                  role="option"
                  aria-selected={index === stopIndex}
                  className={styles.stopMarker}
                  style={{ left: `${entry.position * 100}%`, backgroundColor: entry.color }}
                  title={`${Math.round(entry.position * 100)}% ${entry.color}`}
                  data-testid={`presentation-background-gradient-stop-${index}`}
                  disabled={disabled}
                  onClick={() => setSelectedStop(index)}
                />
              ))}
            </div>
            <button
              type="button"
              className={styles.iconButton}
              disabled={disabled || stops.length >= MAX_GRADIENT_STOPS}
              aria-label={t("presentation.backgroundPane.addGradientStop")}
              title={t("presentation.backgroundPane.addGradientStop")}
              data-testid="presentation-background-gradient-add-stop"
              onClick={() => {
                const added = gradientWithAddedStop(stops, stopIndex);
                if (!added) return;
                setSelectedStop(added.selected);
                onGradient(gradientFromStops(added.stops, gradient.angle));
              }}
            >
              <Plus size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={disabled || stops.length <= 2}
              aria-label={t("presentation.backgroundPane.removeGradientStop")}
              title={t("presentation.backgroundPane.removeGradientStop")}
              data-testid="presentation-background-gradient-remove-stop"
              onClick={() => {
                if (stops.length <= 2) return;
                const remaining = stops.filter((_, index) => index !== stopIndex);
                setSelectedStop(Math.max(0, stopIndex - 1));
                onGradient(gradientFromStops(remaining, gradient.angle));
              }}
            >
              <Minus size={14} aria-hidden="true" />
            </button>
          </div>
          {colorButton("stop", stop.color, t("presentation.backgroundPane.color"), "presentation-background-gradient-stop-color")}
          <label className={styles.slider}>
            <span>{t("presentation.backgroundPane.position")}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(stop.position * 100)}
              disabled={disabled}
              aria-label={`${t("presentation.backgroundPane.position")} (%)`}
              data-testid="presentation-background-gradient-stop-position"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || value < 0 || value > 100) return;
                const position = Math.round(value * 10) / 1000;
                const moved = stops.map((entry, index) =>
                  index === stopIndex ? { ...entry, position } : entry,
                );
                const next = gradientFromStops(moved, gradient.angle);
                setSelectedStop(next.stops!.findIndex((entry) => entry.position === position));
                onGradient(next);
              }}
            />
            <span aria-hidden="true">%</span>
          </label>
          <label className={styles.slider}>
            <span>{t("presentation.backgroundPane.angle")}</span>
            <input
              type="number"
              min={0}
              max={359.9}
              step={1}
              value={Math.round(pptAngle(gradient.angle) * 10) / 10}
              disabled={disabled}
              aria-label={`${t("presentation.backgroundPane.angle")} (°)`}
              data-testid="presentation-background-gradient-angle"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                onGradient(gradientFromStops(stops, cssAngle(value)));
              }}
            />
            <span aria-hidden="true">°</span>
          </label>
        </>
      ) : null}

      {kind === "pattern" && pattern ? (
        <>
          <div
            className={styles.patternGrid}
            role="radiogroup"
            aria-label={t("presentation.backgroundPane.fill.pattern")}
          >
            {SLIDE_BG_PATTERNS.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={pattern.pattern === name}
                className={styles.patternTile}
                style={{ background: bgPatternCss({ ...pattern, pattern: name }) }}
                title={t(`presentation.bgPattern.${name}`)}
                aria-label={t(`presentation.bgPattern.${name}`)}
                disabled={disabled}
                data-testid={`presentation-background-pattern-${name}`}
                onClick={() => onPattern({ pattern: name })}
              />
            ))}
          </div>
          {colorButton("foreground", pattern.color, t("presentation.backgroundPane.foreground"), "presentation-background-pattern-foreground")}
          {colorButton("background", pattern.background, t("presentation.backgroundPane.background"), "presentation-background-pattern-background")}
        </>
      ) : null}

      {paletteTarget ? (
        <OfficeColorPalettePopover
          anchorRef={anchorRef}
          value={paletteValue}
          recents={recents}
          labels={paletteLabels}
          onPick={pick}
          onDismiss={() => setPaletteTarget(null)}
          testIdPrefix={
            paletteTarget === "solid"
              ? "presentation-background-solid"
              : `presentation-background-${paletteTarget}`
          }
        />
      ) : null}
    </div>
  );
}
