"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useId, useMemo } from "react";
import { useTranslations } from "../../../host/next-intl";
import {
  OfficeStyleGallery,
  type OfficeStyleGalleryProps,
} from "./OfficeStyleGallery";
import {
  officeShapeStyleLabelKeys,
  type OfficeShapeStyleRecipe,
} from "../../lib/office-shape-style-catalog";
import { isOfficeShapeStylePresetRow } from "../../lib/office-shape-style-presets";
import styles from "./OfficeShapeStyleGallery.module.css";

/** A stable sample, never the selected object's geometry or user text.
 * Drawn again only for another recipe: the gallery re-renders with every
 * render of the editor showing it, and its tiles never change with it. */
export const OfficeShapeStylePreview = memo(function OfficeShapeStylePreview({
  recipe,
}: {
  recipe: OfficeShapeStyleRecipe;
}) {
  const id = useId().replace(/:/g, "");
  // The gradient runs along the recipe's CSS angle (180 = top to bottom, the
  // theme rows; 0 = bottom to top, the Presets' `a:lin ang="16200000"`).
  const angle = recipe.fillGradient?.angle ?? 180;
  const vector =
    angle === 180
      ? { x1: 0, y1: 0, x2: 0, y2: 1 }
      : {
          x1: 0.5 - Math.sin((angle * Math.PI) / 180) / 2,
          y1: 0.5 + Math.cos((angle * Math.PI) / 180) / 2,
          x2: 0.5 + Math.sin((angle * Math.PI) / 180) / 2,
          y2: 0.5 - Math.cos((angle * Math.PI) / 180) / 2,
        };
  // A Transparent preset shows the gallery's checkerboard through the tile.
  // …and so does a Semitransparent one, under its half-opaque fill.
  const translucent = recipe.fillTransparency !== undefined && recipe.fill !== "none";
  const transparent =
    isOfficeShapeStylePresetRow(recipe.row) && (recipe.fill === "none" || translucent);
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      data-office-shape-style-preview={recipe.id}
    >
      <defs>
        {transparent ? (
          <pattern id={`${id}-checker`} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#ffffff" />
            <rect width="3" height="3" fill="#d9d9d9" />
            <rect x="3" y="3" width="3" height="3" fill="#d9d9d9" />
          </pattern>
        ) : null}
        {recipe.fillTo ? (
          <linearGradient id={`${id}-fill`} {...vector}>
            {(recipe.fillGradient?.stops??[{position:0,color:recipe.fill},{position:1,color:recipe.fillTo}]).map(stop=><stop key={stop.position} offset={stop.position} stopColor={stop.color}/>)}
          </linearGradient>
        ) : null}
        {recipe.shadow ? (
          <filter
            id={`${id}-shadow`}
            x="-25%"
            y="-25%"
            width="150%"
            height="160%"
          >
            <feDropShadow dx="0" dy="1.53846" stdDeviation="1.53846" floodOpacity="0.631373" />
          </filter>
        ) : null}
      </defs>
      <rect
        x="5.5"
        y={recipe.shadow?4.5:5.5}
        width="37"
        height="37"
        rx="6.1667"
        fill={
          recipe.fillTo
            ? `url(#${id}-fill)`
            : transparent
              ? `url(#${id}-checker)`
              : recipe.fill
        }
        stroke={recipe.stroke}
        strokeWidth={recipe.strokeWidth * 0.76923}
        filter={recipe.shadow ? `url(#${id}-shadow)` : undefined}
      />
      {translucent ? (
        <rect
          x="5.5"
          y="5.5"
          width="37"
          height="37"
          rx="6.1667"
          fill={recipe.fill}
          fillOpacity={(100 - (recipe.fillTransparency ?? 0)) / 100}
        />
      ) : null}
      <text
        x="24"
        y="26"
        textAnchor="middle"
        fontFamily="Aptos Narrow, Arial, sans-serif"
        fontSize="12"
        fill={recipe.textColor}
      >
        Abc
      </text>
    </svg>
  );
});

export interface OfficeShapeStyleGalleryProps {
  readonly application: OfficeStyleGalleryProps<string>["application"];
  readonly recipes: readonly OfficeShapeStyleRecipe[];
  readonly label: string;
  readonly moreLabel: string;
  /** A host's own name for a style; by default Office's, from the catalogue. */
  readonly labelFor?: (recipe: OfficeShapeStyleRecipe) => string;
  readonly value: string | null;
  readonly disabled?: boolean;
  readonly getDisabledReason?: (recipe: OfficeShapeStyleRecipe) => string | undefined;
  readonly quickRow?: OfficeShapeStyleRecipe["row"];
  /** Visible slots only; all recipes can be scrolled without paging controls. */
  readonly quickCount?: 3 | 7;
  readonly pagingLabels?: { previous: string; next: string };
  readonly onCommit: (recipe: OfficeShapeStyleRecipe) => void;
  readonly testIdPrefix: string;
  /**
   * The whole library behind a host's own button instead of an inline strip:
   * PowerPoint's Home > Quick Styles opens the same sheet Shape Format's
   * Shape Styles does.
   */
  readonly menuTrigger?: OfficeStyleGalleryProps<string>["menuTrigger"];
}

export function OfficeShapeStyleGallery({
  application,
  recipes,
  label,
  moreLabel,
  labelFor,
  value,
  disabled,
  getDisabledReason,
  quickRow = "shadow",
  quickCount = 7,
  onCommit,
  testIdPrefix,
  menuTrigger,
}: OfficeShapeStyleGalleryProps) {
  const t = useTranslations("console-notebooks");
  // Each name is two or three formatted messages; the library has dozens of
  // styles and is drawn with every render of the editor that shows it.
  const defaultNames = useMemo(() => {
    const nameOf = (recipe: OfficeShapeStyleRecipe) => {
      if (isOfficeShapeStylePresetRow(recipe.row)) {
        // PowerPoint's own preset templates ("Transparent - ^1, ^0", "Colored
        // Fill - ^1, ^0, No Outline"), which put the colour's name and its slot
        // in separate places.
        return t(`office.shapeStyle.${recipe.row}` as "office.shapeStyle.preset-fill", {
          name: t(`office.shapeStyle.colorName.${recipe.column}` as "office.shapeStyle.colorName.0"),
          slot: t(`office.shapeStyle.slotName.${recipe.column}` as "office.shapeStyle.slotName.0"),
        });
      }
      const keys = officeShapeStyleLabelKeys(recipe);
      return t("office.shapeStyle.name", {
        effect: t(keys.effect),
        color: t(keys.color),
      });
    };
    return new Map(recipes.map((recipe) => [recipe.id, nameOf(recipe)]));
  }, [recipes, t]);
  // PowerPoint heads the library "Theme Styles" and, below it, "Presets".
  const presetIds = recipes
    .filter((recipe) => isOfficeShapeStylePresetRow(recipe.row))
    .map((recipe) => recipe.id);
  const groups = presetIds.length
    ? [
        {
          id: "theme-styles",
          label: t("office.shapeStyle.group.themeStyles"),
          itemIds: recipes
            .filter((recipe) => !isOfficeShapeStylePresetRow(recipe.row))
            .map((recipe) => recipe.id),
        },
        { id: "presets", label: t("office.shapeStyle.group.presets"), itemIds: presetIds },
      ]
    : undefined;
  return (
    <OfficeStyleGallery
      application={application}
      ariaLabel={label}
      labels={{ more: moreLabel }}
      className={styles.gallery}
      visibleItemCount={quickCount}
      menuClassName={styles.menu}
      // PowerPoint's sheet: seven swatches a row under "Theme Styles" and
      // "Presets".
      menuGrid={{ columns: 7, thumbnail: [52, 52], gap: 4 }}
      menuMode="preview-only"
      groupHeadings
      menuTrigger={menuTrigger}
      items={recipes.map((recipe) => ({
        id: recipe.id,
        label: labelFor ? labelFor(recipe) : (defaultNames.get(recipe.id) ?? recipe.id),
        ...(getDisabledReason?.(recipe) ? { disabled: true, disabledReason: getDisabledReason(recipe) } : {}),
      }))}
      quickIds={recipes.filter((recipe) => recipe.row === quickRow).map((recipe) => recipe.id)}
      groups={groups}
      value={value}
      disabled={disabled}
      renderPreview={(item) => {
        const recipe = recipes.find((candidate) => candidate.id === item.id);
        return recipe ? <OfficeShapeStylePreview recipe={recipe} /> : null;
      }}
      onPreviewChange={() => undefined}
      onCommit={(id) => {
        const recipe = recipes.find((candidate) => candidate.id === id);
        if (recipe && !disabled && !getDisabledReason?.(recipe)) onCommit(recipe);
      }}
      testIdPrefix={testIdPrefix}
    />
  );
}
