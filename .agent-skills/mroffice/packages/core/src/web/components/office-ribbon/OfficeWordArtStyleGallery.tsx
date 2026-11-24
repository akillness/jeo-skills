"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo } from "react";
import { useTranslations } from "../../../host/next-intl";

import { DropdownMenuItem } from "../ui/dropdown-menu";
import { OfficeStyleGallery } from "./OfficeStyleGallery";
import {
  officeTextPaintCss,
  type OfficeTextPaint,
} from "../../lib/office-text-paint";
import type { OfficeWordArtRecipe } from "../../lib/office-wordart-style-catalog";
import {
  OFFICE_WORDART_GALLERY_RECIPES,
  officeWordArtRecipeName,
} from "../../lib/office-wordart-gallery";
import styles from "./OfficeWordArtStyleGallery.module.css";

// Memoized: a gallery tile's letters depend on its paint alone, and the
// ribbon around it re-renders with every edit of its host.
export const OfficeWordArtPreview = memo(function OfficeWordArtPreview({
  paint,
  sample = "Aa",
}: {
  paint: OfficeTextPaint;
  /** The letters a tile draws (PowerPoint's WordArt sheet shows "Aa"). */
  sample?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={styles.sample}
      // No caret ever blinks in a sample, which is what the words' own layer is
      // for: forty of them were forty render passes in every frame of the window.
      style={{ ...officeTextPaintCss(paint), willChange: "auto" }}
    >
      {sample}
    </span>
  );
});

/**
 * Insert > WordArt in every editor: the gallery's twenty "Aa" tiles, five to
 * a row, inside the host's dropdown. Picking one inserts that style.
 */
export function OfficeWordArtInsertGallery({
  recipes = OFFICE_WORDART_GALLERY_RECIPES,
  disabled,
  labelFor,
  onSelect,
  testIdPrefix,
}: {
  recipes?: readonly OfficeWordArtRecipe[];
  disabled?: boolean;
  labelFor?: (recipe: OfficeWordArtRecipe) => string;
  /**
   * A pick. `false` keeps the menu open: a host whose insert may be refused
   * (the page went read-only) closes the menu itself when it inserts.
   */
  onSelect: (recipe: OfficeWordArtRecipe) => boolean | void;
  /** `<prefix>-gallery` on the grid, `<prefix>-<id>` on each tile. */
  testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  return (
    <div role="group" className={styles.insertGrid} data-testid={`${testIdPrefix}-gallery`}>
      {recipes.map((recipe) => {
        const label =
          labelFor?.(recipe) ||
          officeWordArtRecipeName(recipe, t as unknown as (key: string, values?: Record<string, string>) => string);
        return (
          <DropdownMenuItem
            key={recipe.id}
            className={styles.insertTile}
            data-testid={`${testIdPrefix}-${recipe.id}`}
            data-chrome-preview
            disabled={disabled}
            aria-label={label}
            title={label}
            onSelect={(event) => {
              if (onSelect(recipe) === false) event.preventDefault();
            }}
          >
            <OfficeWordArtPreview paint={recipe.paint} />
          </DropdownMenuItem>
        );
      })}
    </div>
  );
}

export function OfficeWordArtStyleGallery({
  application = "docs",
  recipes = OFFICE_WORDART_GALLERY_RECIPES,
  sample,
  value,
  disabled,
  disabledReason,
  labels,
  labelFor,
  onCommit,
  testIdPrefix,
}: {
  application?: "docs" | "spreadsheet" | "presentation";
  /** A host's own gallery (the deck: PowerPoint's twenty, under its theme);
   * by default the shared recipes Docs and the worksheet offer. */
  recipes?: readonly OfficeWordArtRecipe[];
  sample?: string;
  value: string | null;
  disabled?: boolean;
  disabledReason?: string;
  labels?: { title: string; more: string };
  labelFor?: (recipe: OfficeWordArtRecipe) => string;
  onCommit: (recipe: OfficeWordArtRecipe) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  return (
    <OfficeStyleGallery
      application={application}
      ariaLabel={labels?.title ?? t("office.wordArt.title")}
      labels={{ more: labels?.more ?? t("office.wordArt.more") }}
      className={styles.gallery}
      // Office's WordArt sheet: five samples a row.
      menuGrid={{ columns: 5, thumbnail: [80, 74] }}
      menuMode="preview-only"
      items={recipes.map((recipe) => ({
        id: recipe.id,
        // A host's name for a tile, or the gallery's own where it gives none.
        label:
          labelFor?.(recipe) ||
          officeWordArtRecipeName(recipe, t as unknown as (key: string, values?: Record<string, string>) => string),
        ...(disabled && disabledReason
          ? { disabled: true, disabledReason }
          : {}),
      }))}
      quickIds={recipes.slice(0, 3).map(
        (recipe) => recipe.id,
      )}
      value={value}
      disabled={disabled}
      renderPreview={(item) => (
        <OfficeWordArtPreview
          sample={sample}
          paint={
            recipes.find(
              (recipe) => recipe.id === item.id,
            )!.paint
          }
        />
      )}
      onPreviewChange={() => undefined}
      onCommit={(id) => {
        const recipe = recipes.find(
          (item) => item.id === id,
        );
        if (recipe && !disabled) onCommit(recipe);
      }}
      testIdPrefix={testIdPrefix}
    />
  );
}
