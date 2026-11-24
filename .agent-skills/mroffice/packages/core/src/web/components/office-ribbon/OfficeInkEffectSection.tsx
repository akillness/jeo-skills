"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A pen menu's Effects (OfficeInkPenMenuContent, every editor that inks):
 * Office's eight as Word shows them, MRAI's own presets drawn as a short
 * stroke each (a glow, a sheen and glints read only on a stroke), the user's
 * recent custom effects and the Custom tile, which opens a compact editor
 * inside the menu: how the effect paints (gradient, metallic, shimmer, neon,
 * soft) and its one to four colours, each picked with the app's own colour
 * palette (OfficeColorPalettePopover, the one More Colors opens). Every
 * change is the pen's at once; the effect is remembered when the editor
 * closes.
 */

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "../../../host/next-intl";

import { Check, Minus, Plus } from "./icons/houseIcons";
import { OfficeColorPalettePopover } from "./OfficeColorPalettePopover";
import { InkEffectSwatch } from "./InkEffectStroke";
import { DropdownMenuLabel } from "../ui/dropdown-menu";
import type { DocumentInkPreset } from "../../lib/document-ink";
import {
  INK_EFFECT_CUSTOM_MAX_COLORS,
  INK_EFFECT_KINDS,
  MRAI_INK_EFFECT_PAINTS,
  OFFICE_INK_EFFECT_PAINTS,
  customInkEffectId,
  inkEffectCssGradient,
  isCustomInkEffect,
  parseCustomInkEffect,
  type InkEffectId,
  type InkEffectKind,
} from "../../lib/office-ink-effects";
import {
  inkEffectRecentColors,
  rememberInkEffect,
  useInkEffectRecents,
} from "../../lib/office-ink-effect-recents";

import styles from "./OfficeInkRibbon.module.css";

type Translate = ReturnType<typeof useTranslations<"console-notebooks">>;

/** An effect's name: a preset's own, a custom one as "Custom · Neon". */
export function officeInkEffectLabel(t: Translate, effect: InkEffectId): string {
  const custom = parseCustomInkEffect(effect);
  if (custom) {
    return `${t("toolbar.drawEffectCustom")} · ${t(`toolbar.drawEffectKind_${custom.kind}` as "toolbar.drawEffectKind_gradient")}`;
  }
  return t(`toolbar.drawEffect_${effect}` as "toolbar.drawEffect_rainbow");
}

/** The colours a new custom effect starts from: the pen's own and a second. */
function startingColors(pen: DocumentInkPreset): string[] {
  const own = pen.color && pen.color !== "#ffffff" ? pen.color : "#ff2bd6";
  return [own, own === "#6c5cff" ? "#18e6a0" : "#6c5cff"];
}

export function OfficeInkEffectSection({
  pen,
  testIdPrefix,
  onPick,
}: {
  pen: DocumentInkPreset;
  /** `${testIdPrefix}-effect-…` names the tiles and the editor's controls. */
  testIdPrefix: string;
  onPick: (effect: InkEffectId) => void;
}) {
  const t = useTranslations("console-notebooks");
  const idBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const recents = useInkEffectRecents();
  const [editing, setEditing] = useState(false);
  const current = pen.effect ?? null;
  // The current pen's own custom effect is a tile even before it is remembered.
  const customTiles = [
    ...(isCustomInkEffect(current) && !recents.includes(current) ? [current] : []),
    ...recents,
  ];
  const tile = (effect: InkEffectId, face: ReactNode, extra?: { custom?: boolean }) => {
    const label = officeInkEffectLabel(t, effect);
    return (
      <button
        key={effect}
        type="button"
        className={styles.inkEffectTile}
        data-effect-face={extra?.custom ? "custom" : "stroke"}
        data-selected={current === effect || undefined}
        data-testid={`${testIdPrefix}-effect-${effect}`}
        aria-label={label}
        aria-pressed={current === effect}
        title={label}
        onClick={() => onPick(effect)}
      >
        {face}
      </button>
    );
  };
  return (
    <>
      <DropdownMenuLabel className={styles.inkMenuLabel}>{t("toolbar.drawInkEffect")}</DropdownMenuLabel>
      <div className={styles.inkEffectGrid} role="group" aria-label={t("toolbar.drawInkEffect")}>
        {OFFICE_INK_EFFECT_PAINTS.map((paint) => (
          <button
            key={paint.id}
            type="button"
            className={styles.inkEffectTile}
            data-selected={current === paint.id || undefined}
            data-testid={`${testIdPrefix}-effect-${paint.id}`}
            aria-label={t(`toolbar.drawEffect_${paint.id}` as "toolbar.drawEffect_rainbow")}
            aria-pressed={current === paint.id}
            title={t(`toolbar.drawEffect_${paint.id}` as "toolbar.drawEffect_rainbow")}
            style={{ background: inkEffectCssGradient(paint) }}
            onClick={() => onPick(paint.id)}
          />
        ))}
      </div>
      <DropdownMenuLabel className={styles.inkMenuLabel}>{t("toolbar.drawEffectMore")}</DropdownMenuLabel>
      <div
        className={`${styles.inkEffectGrid} ${styles.inkEffectStrokeGrid}`}
        role="group"
        aria-label={t("toolbar.drawEffectMore")}
      >
        {MRAI_INK_EFFECT_PAINTS.map((paint) =>
          tile(paint.id, <InkEffectSwatch effect={paint.id} id={`${idBase}-${paint.id}`} width={48} height={24} strokeWidth={3.6} />),
        )}
      </div>
      <DropdownMenuLabel className={styles.inkMenuLabel}>{t("toolbar.drawEffectCustom")}</DropdownMenuLabel>
      <div
        className={`${styles.inkEffectGrid} ${styles.inkEffectStrokeGrid}`}
        role="group"
        aria-label={t("toolbar.drawEffectCustom")}
      >
        {customTiles.map((effect, index) =>
          tile(
            effect,
            <InkEffectSwatch effect={effect} id={`${idBase}-custom-${index}`} width={48} height={24} strokeWidth={3.6} />,
            { custom: true },
          ),
        )}
        <button
          type="button"
          className={`${styles.inkEffectTile} ${styles.inkEffectAddTile}`}
          aria-expanded={editing}
          aria-label={t("toolbar.drawEffectCustomNew")}
          title={t("toolbar.drawEffectCustomNew")}
          data-testid={`${testIdPrefix}-effect-custom`}
          onClick={() => setEditing((open) => !open)}
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>
      {editing ? (
        <OfficeInkCustomEffectEditor
          pen={pen}
          testIdPrefix={`${testIdPrefix}-effect-custom`}
          idBase={idBase}
          recentColors={inkEffectRecentColors(recents)}
          onChange={onPick}
          onDone={(effect) => {
            if (effect) rememberInkEffect(effect);
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}

function OfficeInkCustomEffectEditor({
  pen,
  testIdPrefix,
  idBase,
  recentColors,
  onChange,
  onDone,
}: {
  pen: DocumentInkPreset;
  testIdPrefix: string;
  idBase: string;
  recentColors: readonly string[];
  onChange: (effect: InkEffectId) => void;
  onDone: (effect: InkEffectId | null) => void;
}) {
  const t = useTranslations("console-notebooks");
  const [initial] = useState(() => parseCustomInkEffect(pen.effect));
  const [kind, setKind] = useState<InkEffectKind>(initial?.kind ?? "gradient");
  const [colors, setColors] = useState<string[]>(() => initial?.colors ?? startingColors(pen));
  // The colour being picked, and the control its palette opens from.
  const [picking, setPicking] = useState<{ index: number; anchor: HTMLElement } | null>(null);
  const made = customInkEffectId(kind, colors);
  // Whatever the editor last made is remembered when it goes (Done, or the
  // menu closing under it).
  const changedRef = useRef<InkEffectId | null>(null);
  useEffect(
    () => () => {
      if (changedRef.current) rememberInkEffect(changedRef.current);
    },
    [],
  );
  const apply = (nextKind: InkEffectKind, nextColors: readonly string[]) => {
    const effect = customInkEffectId(nextKind, nextColors);
    if (!effect) return;
    changedRef.current = effect;
    onChange(effect);
  };
  return (
    <div className={styles.inkCustomEffect} data-testid={`${testIdPrefix}-editor`}>
      <div className={styles.inkCustomPreview} aria-hidden="true">
        {made ? <InkEffectSwatch effect={made} id={`${idBase}-custom-preview`} width={196} height={40} strokeWidth={6} /> : null}
      </div>
      <div className={styles.inkCustomCaption}>{t("toolbar.drawEffectStyle")}</div>
      <div className={styles.inkCustomKinds} role="radiogroup" aria-label={t("toolbar.drawEffectStyle")}>
        {INK_EFFECT_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            className={styles.inkCustomKind}
            data-selected={kind === option || undefined}
            data-testid={`${testIdPrefix}-kind-${option}`}
            onClick={() => {
              setKind(option);
              apply(option, colors);
            }}
          >
            {t(`toolbar.drawEffectKind_${option}` as "toolbar.drawEffectKind_gradient")}
          </button>
        ))}
      </div>
      <div className={styles.inkCustomCaption}>{t("toolbar.drawEffectColors")}</div>
      <div className={styles.inkCustomColors}>
        {colors.map((color, index) => (
          <button
            key={index}
            type="button"
            className={styles.inkCustomColor}
            style={{ background: color }}
            aria-label={t("toolbar.drawEffectColorN", { n: index + 1 })}
            title={`${t("toolbar.drawEffectColorN", { n: index + 1 })} · ${color}`}
            aria-expanded={picking?.index === index}
            data-testid={`${testIdPrefix}-color-${index}`}
            onClick={(event) => setPicking({ index, anchor: event.currentTarget })}
          />
        ))}
        {colors.length < INK_EFFECT_CUSTOM_MAX_COLORS ? (
          <button
            type="button"
            className={styles.inkCustomColorStep}
            aria-label={t("toolbar.drawEffectAddColor")}
            title={t("toolbar.drawEffectAddColor")}
            data-testid={`${testIdPrefix}-add-color`}
            onClick={(event) => {
              const next = [...colors, colors[colors.length - 1] ?? "#6c5cff"];
              setColors(next);
              apply(kind, next);
              setPicking({ index: next.length - 1, anchor: event.currentTarget });
            }}
          >
            <Plus size={14} aria-hidden />
          </button>
        ) : null}
        {colors.length > 1 ? (
          <button
            type="button"
            className={styles.inkCustomColorStep}
            aria-label={t("toolbar.drawEffectRemoveColor")}
            title={t("toolbar.drawEffectRemoveColor")}
            data-testid={`${testIdPrefix}-remove-color`}
            onClick={() => {
              const next = colors.slice(0, -1);
              setColors(next);
              setPicking(null);
              apply(kind, next);
            }}
          >
            <Minus size={14} aria-hidden />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.inkCustomDone}
        data-testid={`${testIdPrefix}-done`}
        onClick={() => {
          setPicking(null);
          const effect = changedRef.current ?? (made && pen.effect === made ? made : null);
          changedRef.current = null;
          onDone(effect);
        }}
      >
        <Check size={14} aria-hidden />
        {t("toolbar.drawEffectDone")}
      </button>
      {picking !== null ? (
        <OfficeColorPalettePopover
          anchorRef={{ current: picking.anchor }}
          value={colors[picking.index]}
          recents={recentColors}
          zIndex={100000}
          labels={{
            themeColors: t("toolbar.themeColors"),
            standardColors: t("toolbar.standardColors"),
            recentColors: t("spreadsheet.recentColors"),
            moreColors: t("toolbar.drawMoreColors"),
          }}
          onPick={(color) => {
            const index = picking.index;
            setPicking(null);
            if (!color) return;
            const next = colors.map((entry, at) => (at === index ? color.toLowerCase() : entry));
            setColors(next);
            apply(kind, next);
          }}
          onDismiss={() => setPicking(null)}
          testIdPrefix={`${testIdPrefix}-palette`}
        />
      ) : null}
    </div>
  );
}
