/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PX } from "@mrnote/core/web/lib/office-units.ts";
import {
  normalizeOfficePictureEffects,
  officeSoftEdgeRampPx,
  type OfficePictureEffects,
} from "@mrnote/core/web/lib/office-picture-effects.ts";
import { normalizeOfficeShadowEffect, type OfficeShadowEffect } from "@mrnote/core/web/lib/office-shadow-effects.ts";
import { normalizePictureShadow } from "./pictureLayoutEffects";

/**
 * A picture's own Picture Effects beyond its shadow, drawn: glow, reflection
 * and soft edges (`pictureGlow` / `pictureReflection` / `pictureSoftEdge`;
 * `apps/api/app/services/document_docx_picture_effects.py` reads and writes
 * them as Word's `a:glow` / `a:reflection` / `a:softEdge`, ECMA-376 20.1.8).
 *
 * The browser has no reflection or soft-edge primitive of Word's exact form,
 * so these are the nearest CSS: a glow is a zero-offset drop shadow in the
 * glow's colour; a reflection is the picture mirrored below it, fading from
 * its start transparency to nothing over its end position; soft edges feather
 * the picture's four sides by the radius.
 */


function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizePictureGlow(
  value: unknown,
): { radEmu: number; color: string; opacity: number; source?: unknown } | null {
  const glow = record(value);
  const radEmu = finite(glow?.radEmu);
  const opacity = finite(glow?.opacity);
  const color = typeof glow?.color === "string" && /^#[0-9a-f]{6}$/.test(glow.color) ? glow.color : null;
  if (!glow || radEmu === null || radEmu < 0 || opacity === null || opacity < 0 || opacity > 100 || !color) {
    return null;
  }
  return { radEmu, color, opacity, ...(glow.source ? { source: glow.source } : {}) };
}

export function normalizePictureReflection(value: unknown): Record<string, number | string | boolean> | null {
  const reflection = record(value);
  if (!reflection) return null;
  const out: Record<string, number | string | boolean> = {};
  for (const [key, raw] of Object.entries(reflection)) {
    if (key === "algn" && typeof raw === "string") out[key] = raw;
    else if (key === "rotWithShape" && typeof raw === "boolean") out[key] = raw;
    else if (typeof raw === "number" && Number.isInteger(raw)) out[key] = raw;
    else return null;
  }
  return out;
}

export function normalizePictureSoftEdge(value: unknown): { radEmu: number } | null {
  const soft = record(value);
  const radEmu = finite(soft?.radEmu);
  return soft && radEmu !== null && radEmu >= 0 ? { radEmu } : null;
}

/** The CSS a picture's effects add to its `<img>`. Every key is named so a
 * picture without them clears what an earlier render drew. Soft Edges are a
 * ramp (`softEdgeRampPx`, 0 for none) the node view draws in the picture's
 * SVG filter (`officeSoftEdgeMaskImage`): a CSS mask on the `<img>` would
 * also hide its reflection, which Word draws softened. */
export function pictureEffectsCss(
  attrs: Record<string, unknown>,
  size: { readonly width: number; readonly height: number },
): {
  filter: string;
  boxReflect: string;
  softEdgeRampPx: number;
} {
  const glow = normalizePictureGlow(attrs.pictureGlow);
  const reflection = normalizePictureReflection(attrs.pictureReflection);
  const soft = normalizePictureSoftEdge(attrs.pictureSoftEdge);
  const filter = glow
    ? (() => {
        const alpha = Math.round((glow.opacity / 100) * 255)
          .toString(16)
          .padStart(2, "0");
        const radius = Math.round((glow.radEmu / EMU_PER_PX) * 100) / 100;
        return `drop-shadow(0 0 ${radius / 2}px ${glow.color}${alpha}) drop-shadow(0 0 ${radius / 2}px ${glow.color}${alpha})`;
      })()
    : "";
  let boxReflect = "";
  if (reflection) {
    const distance = Math.round((Number(reflection.dist ?? 0) / EMU_PER_PX) * 100) / 100;
    const start = Number(reflection.stA ?? 100_000) / 100_000;
    const end = Number(reflection.endA ?? 0) / 100_000;
    const endPos = Number(reflection.endPos ?? 100_000) / 1000;
    boxReflect = `below ${distance}px linear-gradient(to top, rgba(0,0,0,${start}) 0%, rgba(0,0,0,${end}) ${endPos}%, transparent ${endPos}%)`;
  }
  const softEdgeRampPx = soft ? officeSoftEdgeRampPx(soft.radEmu, size) : 0;
  return { filter, boxReflect, softEdgeRampPx };
}

/** The kinds a picture's 3-D Format and 3-D Rotation keep (`picture3d`, reading row 544). */
export const PICTURE_THREE_D_KINDS = ["bevel", "rotation3d", "format3d"] as const;

/**
 * A picture's Format Picture > 3-D Format and 3-D Rotation (`picture3d`):
 * Bevel, 3-D Rotation and 3-D Format in the shared model
 * (lib/office-picture-effects; the server reads and writes them on
 * `pic:spPr`), or null for none.
 */
export function normalizePicture3d(value: unknown): OfficePictureEffects | null {
  const effects = normalizeOfficePictureEffects(value);
  if (!effects) return null;
  const kept = Object.fromEntries(
    Object.entries(effects).filter(
      ([kind, effect]) => (PICTURE_THREE_D_KINDS as readonly string[]).includes(kind) && effect !== "none",
    ),
  );
  return Object.keys(kept).length ? (kept as OfficePictureEffects) : null;
}

/**
 * Why a picture's 3-D cannot be edited, or null: a Picture Style owns its
 * 3-D; an imported picture whose 3-D the page cannot state (or a page read
 * before the reading) keeps the file's.
 */
export function picture3dBlocker(attrs: Record<string, unknown>): "styled" | "preserved" | null {
  const style = attrs.pictureStyle;
  if (typeof style === "string" && style && style !== "none") return "styled";
  if (attrs.picture3dEditable !== true && attrs.source && typeof attrs.source === "object") return "preserved";
  return null;
}

/** The kinds a picture's own effect list keeps on the page (reading row 545). */
export const PICTURE_LOOK_EFFECT_KINDS = ["glow", "reflection", "softEdge"] as const;
export type PictureLookEffectKind = (typeof PICTURE_LOOK_EFFECT_KINDS)[number];

/** Word's reflection attributes the shared model leaves implied (PowerPoint's
 * and Word's gallery write them on every reflection). */
const GALLERY_REFLECTION = { dir: 5_400_000, sy: -100_000, algn: "bl", rotWithShape: false } as const;

/**
 * A picture's glow, reflection and soft edges (`pictureGlow` /
 * `pictureReflection` / `pictureSoftEdge`) in the shared effects model the
 * menus and Format Picture's sections read (lib/office-picture-effects).
 */
export function pictureLookEffects(attrs: Record<string, unknown>): OfficePictureEffects {
  const out: Record<string, unknown> = {};
  const glow = normalizePictureGlow(attrs.pictureGlow);
  if (glow && glow.radEmu > 0) {
    out.glow = { radius: glow.radEmu, color: glow.color, alpha: Math.round(glow.opacity * 1_000) };
  }
  const reflection = normalizePictureReflection(attrs.pictureReflection);
  if (reflection) {
    out.reflection = {
      blurRad: Number(reflection.blurRad ?? 0),
      stA: Number(reflection.stA ?? 100_000),
      endA: Number(reflection.endA ?? 0),
      endPos: Number(reflection.endPos ?? 100_000),
      dist: Number(reflection.dist ?? 0),
    };
  }
  const soft = normalizePictureSoftEdge(attrs.pictureSoftEdge);
  if (soft && soft.radEmu > 0) out.softEdge = { radius: soft.radEmu };
  return (normalizeOfficePictureEffects(out) ?? {}) as OfficePictureEffects;
}

/**
 * The page attrs a glow, reflection or soft edges in the shared model asks of
 * a picture (`value` "none" or null takes it off): Word's own forms, the
 * stored colour's identity kept while its colour is, a reflection's other
 * attributes kept while the shared ones are what Word's gallery writes.
 */
export function pictureLookEffectAttrs(
  attrs: Record<string, unknown>,
  kind: PictureLookEffectKind,
  value: unknown,
): Record<string, unknown> {
  const effect = value && value !== "none" ? (normalizeOfficePictureEffects({ [kind]: value }) ?? {})[kind] : null;
  const live = effect && effect !== "none" ? (effect as unknown as Record<string, unknown>) : null;
  if (kind === "glow") {
    if (!live) return { pictureGlow: null };
    const before = normalizePictureGlow(attrs.pictureGlow);
    const color = String(live.color);
    const opacity = Math.round(Number(live.alpha) / 10) / 100;
    return {
      pictureGlow: {
        radEmu: Number(live.radius),
        color,
        opacity,
        ...(before?.source && before.color === color && before.opacity === opacity ? { source: before.source } : {}),
      },
    };
  }
  if (kind === "reflection") {
    if (!live) return { pictureReflection: null };
    const before = normalizePictureReflection(attrs.pictureReflection) ?? {};
    const next: Record<string, number | string | boolean> = { ...GALLERY_REFLECTION, ...before };
    for (const key of ["blurRad", "stA", "endA", "endPos", "dist"] as const) {
      const number = Number(live[key]);
      // Schema defaults left out, as Word leaves them out.
      const fallback = key === "stA" || key === "endPos" ? 100_000 : 0;
      if (number === fallback) delete next[key];
      else next[key] = number;
    }
    return { pictureReflection: next };
  }
  return { pictureSoftEdge: live ? { radEmu: Number(live.radius) } : null };
}

/**
 * Why a picture's glow, reflection and soft edges cannot be edited, or null:
 * a Picture Style owns its effects; an imported picture the page read before
 * reading row 545 (or whose effects it could not read) keeps the file's.
 */
export function pictureLookEffectsBlocker(attrs: Record<string, unknown>): "styled" | "preserved" | null {
  const style = attrs.pictureStyle;
  if (typeof style === "string" && style && style !== "none") return "styled";
  if (attrs.pictureEffectsEditable !== true && attrs.source && typeof attrs.source === "object") return "preserved";
  return null;
}

/**
 * A picture's own shadow (reading row 547) in the shared shadow model
 * (lib/office-shadow-effects): `pictureShadowEffect`, else the older outer
 * `pictureShadow` as the same outer shadow (its writer's `algn="tl"`), or
 * null for none.
 */
export function pictureShadowEffect(attrs: Record<string, unknown>): OfficeShadowEffect | null {
  const stated = normalizeOfficeShadowEffect(attrs.pictureShadowEffect);
  if (stated) return stated;
  const older = normalizePictureShadow(attrs.pictureShadow);
  if (!older) return null;
  return normalizeOfficeShadowEffect({
    blurRad: Math.round(older.blurPt * 12_700),
    dist: Math.round(older.distPt * 12_700),
    dir: Math.round(older.dirDeg * 60_000) % 21_600_000,
    algn: "tl",
    color: older.color,
    alpha: Math.round(older.opacity * 1_000),
  });
}

/**
 * The page attrs a Shadow pick asks of a picture (`value` "none" or null
 * takes it off): the shared model's `pictureShadowEffect`, the older
 * `pictureShadow` cleared (one shadow, one carrier).
 */
export function pictureShadowEffectAttrs(value: unknown): Record<string, unknown> {
  const shadow = value && value !== "none" ? normalizeOfficeShadowEffect(value) : null;
  if (!shadow) return { pictureShadowEffect: null, pictureShadow: null };
  // A 100 % scale and a zero skew are what the file leaves unstated.
  const stated: Record<string, unknown> = { ...shadow };
  for (const [key, neutral] of [["sx", 100_000], ["sy", 100_000], ["kx", 0], ["ky", 0]] as const) {
    if (stated[key] === neutral) delete stated[key];
  }
  return { pictureShadowEffect: stated, pictureShadow: null };
}

/**
 * Why a picture's shadow cannot be edited, or null: a Picture Style owns its
 * shadow; an imported picture whose shadow the page cannot state (a theme
 * colour, one turning with the picture), or one read before reading row 547,
 * keeps the file's.
 */
export function pictureShadowBlocker(attrs: Record<string, unknown>): "styled" | "preserved" | null {
  const style = attrs.pictureStyle;
  if (typeof style === "string" && style && style !== "none") return "styled";
  if (attrs.pictureShadowEditable !== true && attrs.source && typeof attrs.source === "object") return "preserved";
  return null;
}
