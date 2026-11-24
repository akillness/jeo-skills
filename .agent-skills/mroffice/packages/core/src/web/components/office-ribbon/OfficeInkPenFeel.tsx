"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The pen menu's note-taking part, the way a note-taking app's pen popover
 * reads (Goodnotes): the pen type, three levels (Tip Sharpness, Pressure
 * Sensitivity, Stroke Stabilization), then Settings -- Draw and hold for
 * shapes, and Pen Gestures on a page of their own. Every editor's pen menu
 * shows it (OfficeInkPenMenuContent).
 */

import { useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "../../../host/next-intl";
import { ArrowLeft, ChevronRight } from "lucide-react";

import type { DocumentInkPreset } from "../../lib/document-ink";
import { INK_PEN_TYPES, inkPenFeelOf, type InkPenPatch, type InkPenType } from "../../lib/office-ink-pen-dynamics";
import {
  INK_PEN_GESTURE_DEFAULTS,
  inkPenGestures,
  setInkPenGesture,
  subscribeInkPenGestures,
  type InkPenGestures,
} from "../../lib/office-ink-pen-gestures";

import styles from "./OfficeInkPenFeel.module.css";

const serverGestures = () => INK_PEN_GESTURE_DEFAULTS;

function useInkPenGestures(): InkPenGestures {
  return useSyncExternalStore(subscribeInkPenGestures, inkPenGestures, serverGestures);
}

/** Each pen type's nib, drawn in the menu's line style. */
function PenTypeGlyph({ type }: { type: InkPenType }) {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true" focusable="false" className={styles.typeGlyph}>
      {type === "fountain" ? (
        <>
          <path d="M6 22 L9 13 L17 5 L23 11 L15 19 Z" />
          <path d="M9 13 L15 19" />
          <circle cx="13.5" cy="14.5" r="1.6" />
          <path d="M5 25 H23" />
        </>
      ) : type === "ballpoint" ? (
        <>
          <path d="M7 21 L10 15 L19 6 L22 9 L13 18 Z" />
          <path d="M7 21 L5.5 22.5" />
          <path d="M10 15 L13 18" />
        </>
      ) : (
        <>
          <path d="M8 20 C10 16 12 15 14 14 L20 8 L22 10 L16 16 C15 18 14 20 10 22 Z" />
          <path d="M8 20 C7 22 6 23 5 23" />
        </>
      )}
    </svg>
  );
}

/** A level 0..100, in steps of 25 marked on the track (the popover's five ticks). */
function FeelSlider({
  label,
  value,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.slider}>
      <span className={styles.sliderHead}>
        <span>{label}</span>
        <span className={styles.sliderValue}>{value}%</span>
      </span>
      <span className={styles.sliderTrackHost} style={{ ["--feel-fill" as string]: `${value}%` }}>
        <span className={styles.sliderTicks} aria-hidden="true">
          {[0, 25, 50, 75, 100].map((tick) => (
            <span key={tick} data-on={tick <= value || undefined} style={{ left: `${tick}%` }} />
          ))}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          aria-label={label}
          data-testid={testId}
          className={styles.sliderInput}
          // The menu keeps its keyboard for the slider while it is focused.
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
      </span>
    </label>
  );
}

function FeelSwitch({
  label,
  hint,
  on,
  testId,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  on: boolean;
  testId: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className={styles.switchRow}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={styles.switchButton}
        data-testid={testId}
        onClick={() => onChange(!on)}
      >
        <span className={styles.switchLabel}>{label}</span>
        <span className={styles.switchTrack} data-on={on || undefined}>
          <span className={styles.switchKnob} />
        </span>
      </button>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

interface FeelPartProps {
  pen: DocumentInkPreset;
  testIdPrefix: string;
  onUpdate?: (id: string, patch: InkPenPatch) => void;
}

/** A pen's type (Fountain, Ballpoint, Brush); a plain pen picks none. */
export function OfficeInkPenTypeRow({ pen, testIdPrefix, onUpdate }: FeelPartProps) {
  const t = useTranslations("console-notebooks");
  if (pen.tool !== "pen") return null;
  return (
    <div className={styles.types} role="radiogroup" aria-label={t("toolbar.drawPenType")}>
      {INK_PEN_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={pen.penType === type}
          className={styles.type}
          data-selected={pen.penType === type || undefined}
          data-testid={`${testIdPrefix}-type-${type}`}
          // The picked type tapped again is a plain pen again.
          onClick={() => onUpdate?.(pen.id, { feel: { penType: pen.penType === type ? null : type } })}
        >
          <PenTypeGlyph type={type} />
          <span>{t(`toolbar.drawPenType_${type}`)}</span>
        </button>
      ))}
    </div>
  );
}

/** Tip Sharpness, Pressure Sensitivity and Stroke Stabilization (not a highlighter's). */
export function OfficeInkPenLevels({
  pen,
  testIdPrefix,
  onUpdate,
  pressure = true,
}: FeelPartProps & { pressure?: boolean }) {
  const t = useTranslations("console-notebooks");
  if (pen.tool === "highlighter") return null;
  const feel = inkPenFeelOf(pen);
  const set = (feelPatch: NonNullable<InkPenPatch["feel"]>) => onUpdate?.(pen.id, { feel: feelPatch });
  return (
    <div className={styles.sliders} data-testid={`${testIdPrefix}-levels`}>
      <FeelSlider
        label={t("toolbar.drawPenTip")}
        value={feel.tipSharpness}
        testId={`${testIdPrefix}-tip`}
        onChange={(tipSharpness) => set({ tipSharpness })}
      />
      {pressure ? (
        <FeelSlider
          label={t("toolbar.drawPenPressureSensitivity")}
          value={feel.pressureSensitivity}
          testId={`${testIdPrefix}-pressure-sensitivity`}
          onChange={(pressureSensitivity) => set({ pressureSensitivity })}
        />
      ) : null}
      <FeelSlider
        label={t("toolbar.drawPenStabilization")}
        value={feel.stabilization}
        testId={`${testIdPrefix}-stabilization`}
        onChange={(stabilization) => set({ stabilization })}
      />
    </div>
  );
}

/** Settings: Draw and hold for shapes, and the way to Pen Gestures. */
export function OfficeInkPenSettings({
  testIdPrefix,
  onOpenGestures,
}: {
  testIdPrefix: string;
  onOpenGestures: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const gestures = useInkPenGestures();
  return (
    <div className={styles.settings} data-testid={`${testIdPrefix}-settings`}>
      <div className={styles.settingsTitle}>{t("toolbar.drawPenSettings")}</div>
      <FeelSwitch
        label={t("toolbar.drawHoldShape")}
        on={gestures.holdShape}
        testId={`${testIdPrefix}-hold-shape`}
        onChange={(on) => setInkPenGesture("holdShape", on)}
      />
      <button
        type="button"
        className={styles.pageLink}
        data-testid={`${testIdPrefix}-gestures`}
        onClick={onOpenGestures}
      >
        <span>{t("toolbar.drawPenGestures")}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Pen Gestures, a page of the pen menu with a way back. */
export function OfficeInkPenGesturesPage({
  testIdPrefix,
  onBack,
}: {
  testIdPrefix: string;
  onBack: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const gestures = useInkPenGestures();
  return (
    <div className={styles.gestures} data-testid={`${testIdPrefix}-gestures-page`}>
      <div className={styles.pageHead}>
        <button
          type="button"
          className={styles.back}
          aria-label={t("toolbar.drawBack")}
          data-testid={`${testIdPrefix}-gestures-back`}
          onClick={onBack}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <span className={styles.pageTitle}>{t("toolbar.drawPenGestures")}</span>
      </div>
      <FeelSwitch
        label={t("toolbar.drawScribbleErase")}
        on={gestures.scribbleErase}
        testId={`${testIdPrefix}-scribble-erase`}
        onChange={(on) => setInkPenGesture("scribbleErase", on)}
      />
      <FeelSwitch
        label={t("toolbar.drawScribbleErasesShapes")}
        hint={t("toolbar.drawScribbleEraseHint")}
        on={gestures.scribbleErasesShapes}
        testId={`${testIdPrefix}-scribble-erases-shapes`}
        onChange={(on) => setInkPenGesture("scribbleErasesShapes", on)}
      />
      <FeelSwitch
        label={t("toolbar.drawCircleLasso")}
        hint={t("toolbar.drawCircleLassoHint")}
        on={gestures.circleLasso}
        testId={`${testIdPrefix}-circle-lasso`}
        onChange={(on) => setInkPenGesture("circleLasso", on)}
      />
    </div>
  );
}
