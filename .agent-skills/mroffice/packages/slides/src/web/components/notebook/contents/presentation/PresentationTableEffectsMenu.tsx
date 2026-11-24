"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Table Design > Effects: PowerPoint's three submenus (PPT-A137). Cell Bevel
 * bevels the selected cells (the cell's `bevel`); Shadow and Reflection act
 * on the whole table (`tableEffects`), whatever cells are selected. The
 * galleries are the shared Shadow galleries (`OfficeShadowGallery`: Outer,
 * Inner, Perspective) and the picture model's measured Reflection variations; the previews draw on the
 * same neutral tile the picture effects menu uses.
 */

import type { CSSProperties } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import styles from "@mrnote/core/web/components/office-ribbon/OfficePictureEffectsMenu.module.css";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  OfficeShadowGallery,
  type OfficeShadowGalleryLabels,
} from "@mrnote/core/web/components/office-ribbon/OfficeShadowGallery.tsx";
import {
  OFFICE_REFLECTION_VARIATIONS,
  officeBevelVariation,
  officePictureEffectsCss,
  type OfficeReflectionEffect,
} from "@mrnote/core/web/lib/office-picture-effects.ts";
import {
  normalizePresentationTableEffects,
  samePresentationTableEffect,
  type PresentationTableEffectKind,
  type PresentationTableEffects,
} from "@mrnote/core/web/lib/presentation-table-effects.ts";
import {
  TABLE_CELL_BEVELS,
  type TableCellBevelPreset,
} from "@mrnote/core/web/lib/presentation-table-style.ts";

export interface PresentationTableEffectsMenuLabels {
  readonly button: string;
  readonly cellBevel: string;
  readonly noCellBevel: string;
  readonly bevel: (preset: TableCellBevelPreset) => string;
  readonly shadow: string;
  readonly noShadow: string;
  readonly shadowGroup: OfficeShadowGalleryLabels["group"];
  readonly shadowVariation: OfficeShadowGalleryLabels["variation"];
  readonly reflection: string;
  readonly noReflection: string;
  readonly reflectionVariations: string;
  readonly reflectionVariation: (id: string) => string;
}

const PREVIEW = { width: 34, height: 26 };
/** Gallery thumbnails draw each effect at this fraction of its size. */
const PREVIEW_SCALE = 0.4;

function ReflectionPreview({ value }: { value: OfficeReflectionEffect }) {
  const css = officePictureEffectsCss(
    {
      reflection: {
        ...value,
        dist: Math.round(value.dist * PREVIEW_SCALE),
        blurRad: Math.round(value.blurRad * PREVIEW_SCALE),
      },
    },
    PREVIEW,
  );
  return (
    <span className={styles.previewCell} aria-hidden="true">
      <span className={styles.preview} style={css?.wrapper as CSSProperties | undefined} />
    </span>
  );
}

function BevelPreview({ preset }: { preset: TableCellBevelPreset }) {
  const css = officePictureEffectsCss({ bevel: officeBevelVariation(preset) }, PREVIEW);
  return (
    <span className={styles.previewCell} aria-hidden="true">
      <span className={styles.preview}>{css?.bevel ? <span style={css.bevel} /> : null}</span>
    </span>
  );
}

export function PresentationTableEffectsMenu({
  bevel,
  bevelMixed,
  effects,
  labels,
  disabled = false,
  controlId,
  testId,
  onBevel,
  onEffect,
}: {
  /** The selected cells' bevel preset ("none" without one). */
  readonly bevel: TableCellBevelPreset | "none";
  readonly bevelMixed: boolean;
  /** The table's `tableEffects`. */
  readonly effects: unknown;
  readonly labels: PresentationTableEffectsMenuLabels;
  readonly disabled?: boolean;
  readonly controlId?: string;
  readonly testId: string;
  readonly onBevel: (preset: TableCellBevelPreset | null) => void;
  readonly onEffect: <K extends PresentationTableEffectKind>(
    kind: K,
    value: NonNullable<PresentationTableEffects[K]> | null,
  ) => void;
}) {
  const current = normalizePresentationTableEffects(effects) ?? {};
  const active = bevelMixed || bevel !== "none" || Boolean(current.shadow || current.reflection);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          active={active}
          controlId={controlId}
          disabled={disabled}
          hasMenuIndicator
          icon={<OfficeSemanticIcon semanticId="shape.effects" size={18} />}
          label={labels.button}
          displayLabel={labels.button}
          testId={testId}
          variant="compact"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={styles.menu}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid={`${testId}-bevel-menu`}>
            {labels.cellBevel}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={styles.menu}>
            <DropdownMenuItem
              data-testid={`${testId}-bevel-none`}
              data-state={!bevelMixed && bevel === "none" ? "checked" : "unchecked"}
              onSelect={() => onBevel(null)}
            >
              {labels.noCellBevel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className={styles.grid} style={{ "--columns": 4 } as CSSProperties}>
              {TABLE_CELL_BEVELS.map((preset) => (
                <DropdownMenuItem
                  key={preset}
                  className={styles.tile}
                  data-testid={`${testId}-bevel-${preset}`}
                  data-checked={!bevelMixed && bevel === preset ? "true" : undefined}
                  aria-label={labels.bevel(preset)}
                  title={labels.bevel(preset)}
                  onSelect={() => onBevel(preset)}
                >
                  <BevelPreview preset={preset} />
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid={`${testId}-shadow-menu`}>
            {labels.shadow}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={styles.menu}>
            <OfficeShadowGallery
              value={current.shadow ?? null}
              hasShadow={Boolean(current.shadow)}
              labels={{ none: labels.noShadow, group: labels.shadowGroup, variation: labels.shadowVariation }}
              testId={testId}
              onPick={(value) => onEffect("shadow", value)}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid={`${testId}-reflection-menu`}>
            {labels.reflection}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={styles.menu}>
            <DropdownMenuItem
              data-testid={`${testId}-reflection-none`}
              data-state={current.reflection ? "unchecked" : "checked"}
              onSelect={() => {
                if (current.reflection) onEffect("reflection", null);
              }}
            >
              {labels.noReflection}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{labels.reflectionVariations}</DropdownMenuLabel>
            <div className={styles.grid} style={{ "--columns": 3 } as CSSProperties}>
              {OFFICE_REFLECTION_VARIATIONS.map((variation) => (
                <DropdownMenuItem
                  key={variation.id}
                  className={styles.tile}
                  data-testid={`${testId}-reflection-${variation.id}`}
                  data-checked={
                    samePresentationTableEffect(current.reflection, variation.value) ? "true" : undefined
                  }
                  aria-label={labels.reflectionVariation(variation.id)}
                  title={labels.reflectionVariation(variation.id)}
                  onSelect={() => onEffect("reflection", variation.value)}
                >
                  <ReflectionPreview value={variation.value} />
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
