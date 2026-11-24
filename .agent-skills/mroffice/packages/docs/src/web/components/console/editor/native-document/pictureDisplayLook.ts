/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A preserve-only picture's colour look, drawn (`pictureDisplayLook`; read by
 * apps/api/app/services/document_docx_picture_display_look.py). Word's Set
 * Transparent Color (`a:clrChange` to alpha 0), a duotone no Recolor tile
 * names, grayscale and the corrections, in the order Office applies a blip's
 * effects (ECMA-376 20.1.8): the colour change, the recolour, the
 * corrections. The page cannot edit them; the package keeps the blip and the
 * writers put it back, so this draws what Word draws and nothing more
 * (corpus R279-D02: a cover logo's peach ground made clear, recoloured in the
 * accent-6 duotone and brightened 10 %).
 */
import {
  officeAdjustStepsFilterCss,
  officeClearColorStep,
  type OfficePictureFilterStep,
} from "@mrnote/core/web/lib/office-picture-adjust-filter.ts";
import { officeAdjustFilterSteps } from "@mrnote/core/web/lib/office-recolor-presets.ts";

export interface PictureDisplayLook {
  readonly clearColor?: string;
  readonly grayscale?: true;
  readonly duotone?: readonly [string, string];
  readonly brightness?: number;
  readonly contrast?: number;
  readonly opacity?: number;
}

const HEX = /^#[0-9a-f]{6}$/;

function whole(value: unknown, low: number, high: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= low && value <= high
    ? value
    : undefined;
}

/** The canonical look, or null for anything else (the API's own rules). */
export function normalizePictureDisplayLook(value: unknown): PictureDisplayLook | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const known = new Set(["clearColor", "grayscale", "duotone", "brightness", "contrast", "opacity"]);
  if (Object.keys(record).some((key) => !known.has(key))) return null;
  const clearColor = typeof record.clearColor === "string" && HEX.test(record.clearColor) ? record.clearColor : undefined;
  if (record.clearColor !== undefined && clearColor === undefined) return null;
  if (record.grayscale !== undefined && record.grayscale !== true) return null;
  let duotone: readonly [string, string] | undefined;
  if (record.duotone !== undefined) {
    const pair = record.duotone;
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((item) => typeof item === "string" && HEX.test(item))) {
      return null;
    }
    duotone = [pair[0] as string, pair[1] as string];
  }
  const brightness = whole(record.brightness, -100, 100);
  const contrast = whole(record.contrast, -100, 100);
  const opacity = whole(record.opacity, 0, 100);
  if (
    (record.brightness !== undefined && brightness === undefined)
    || (record.contrast !== undefined && contrast === undefined)
    || (record.opacity !== undefined && opacity === undefined)
    || (!clearColor && !duotone)
  ) {
    return null;
  }
  return {
    ...(clearColor ? { clearColor } : {}),
    ...(record.grayscale === true ? { grayscale: true as const } : {}),
    ...(duotone ? { duotone } : {}),
    ...(brightness !== undefined ? { brightness } : {}),
    ...(contrast !== undefined ? { contrast } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

/** The look's SVG filter steps, in Office's order. */
export function pictureDisplayLookSteps(look: PictureDisplayLook): OfficePictureFilterStep[] {
  const steps: OfficePictureFilterStep[] = [];
  const clear = officeClearColorStep(look.clearColor);
  if (clear) steps.push(clear);
  if (look.grayscale) {
    // Luma, as the grayscale CSS term and Office's Grayscale both weigh it.
    const luma = [0.2126, 0.7152, 0.0722];
    steps.push({ type: "matrix", values: [...luma, 0, 0, ...luma, 0, 0, ...luma, 0, 0, 0, 0, 0, 1, 0] });
  }
  steps.push(
    ...officeAdjustFilterSteps({
      duotone: look.duotone ?? null,
      brightness: look.brightness ?? 0,
      contrast: look.contrast ?? 0,
    }),
  );
  return steps;
}

/** The CSS `filter` term and the opacity for a picture's display look. */
export function pictureDisplayLookCss(
  value: unknown,
  owner: Document | null = typeof document === "undefined" ? null : document,
): { filter: string; opacity: number | null } {
  const look = normalizePictureDisplayLook(value);
  if (!look) return { filter: "", opacity: null };
  return {
    filter: officeAdjustStepsFilterCss(pictureDisplayLookSteps(look), owner),
    opacity: look.opacity ?? null,
  };
}
