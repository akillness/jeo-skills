"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Effects > Shadow: PowerPoint's submenu -- "No Shadow" over the Outer, Inner
 * and Perspective galleries (`lib/office-shadow-effects`). One component for
 * every host that offers Shadow: Picture / Video / Graphics Effects
 * (`OfficePictureEffectsMenu`) and a table's Effects
 * (`PresentationTableEffectsMenu`). The host renders it inside its own
 * `DropdownMenuSubContent` and gets back one pick at a time (null = No Shadow).
 */

import type { CSSProperties } from "react";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import {
  OFFICE_SHADOW_GALLERY,
  officeShadowCss,
  sameOfficeShadowEffect,
  type OfficeShadowEffect,
  type OfficeShadowGroup,
} from "../../lib/office-shadow-effects";

import styles from "./OfficePictureEffectsMenu.module.css";

export interface OfficeShadowGalleryLabels {
  readonly none: string;
  readonly group: (group: OfficeShadowGroup) => string;
  readonly variation: (group: OfficeShadowGroup, id: string) => string;
}

const PREVIEW = { width: 34, height: 26 };
/** Gallery thumbnails draw each shadow at this fraction of its size. */
const PREVIEW_SCALE = 0.4;

/** One gallery thumbnail: the neutral tile with the shadow drawn on it. */
export function OfficeShadowPreview({ value }: { value: OfficeShadowEffect }) {
  const css = officeShadowCss(
    {
      ...value,
      // Offsets read better a little larger than the blur at thumbnail size.
      dist: Math.round(value.dist * PREVIEW_SCALE * 2),
      blurRad: Math.round(value.blurRad * PREVIEW_SCALE),
    },
    PREVIEW,
  );
  return (
    <span className={styles.previewCell} aria-hidden="true">
      <span
        className={styles.preview}
        style={{
          ...(css?.boxShadow ? { boxShadow: css.boxShadow } : {}),
          ...(css?.under ? { isolation: "isolate" } : {}),
        }}
      >
        {css?.under ? <span style={css.under} /> : null}
        {css?.over ? <span style={css.over} /> : null}
      </span>
    </span>
  );
}

export function OfficeShadowGallery({
  value,
  hasShadow,
  labels,
  testId,
  disabledReason,
  onPick,
}: {
  /** The object's shadow as the page states it (null when none or not one of the model's). */
  readonly value: unknown;
  /** Whether the object draws any shadow (its own, a style's, an older switch). */
  readonly hasShadow: boolean;
  readonly labels: OfficeShadowGalleryLabels;
  /** `${testId}-shadow-none`, `${testId}-shadow-<group>-<id>`. */
  readonly testId: string;
  readonly disabledReason?: string;
  readonly onPick: (value: OfficeShadowEffect | null) => void;
}) {
  return (
    <>
      <DropdownMenuItem
        data-testid={`${testId}-shadow-none`}
        disabled={Boolean(disabledReason)}
        title={disabledReason}
        data-disabled-reason={disabledReason}
        data-state={hasShadow ? "unchecked" : "checked"}
        onSelect={() => {
          if (hasShadow) onPick(null);
        }}
      >
        {labels.none}
      </DropdownMenuItem>
      {OFFICE_SHADOW_GALLERY.map((section) => (
        <div key={section.group} data-testid={`${testId}-shadow-${section.group}`}>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{labels.group(section.group)}</DropdownMenuLabel>
          <div className={styles.grid} style={{ "--columns": section.columns } as CSSProperties}>
            {section.variations.map((variation) => {
              const label = labels.variation(section.group, variation.id);
              return (
                <DropdownMenuItem
                  key={variation.id}
                  className={styles.tile}
                  data-testid={`${testId}-shadow-${section.group}-${variation.id}`}
                  data-checked={sameOfficeShadowEffect(value, variation.value) ? "true" : undefined}
                  disabled={Boolean(disabledReason)}
                  aria-label={label}
                  title={label}
                  onSelect={() => onPick(variation.value)}
                >
                  <OfficeShadowPreview value={variation.value} />
                </DropdownMenuItem>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
