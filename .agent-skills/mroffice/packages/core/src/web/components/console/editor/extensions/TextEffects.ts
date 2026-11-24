"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PT, EMU_PER_PX } from "../../../../lib/office-units";
import { officeTextOutlineLineOfStated, officeTextOutlineMarks } from "../../../../lib/office-text-outline/office-text-outline-css";
import {
  officeTextStated3dEffects,
  withOfficeTextStated3d,
  type OfficeText3dValues,
} from "../../../../lib/office-text-3d";
import { Mark as TiptapMark } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Mark as ProseMirrorMark } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  officeGradientCss,
  resolveOfficeStopColor,
  type OfficeColorSource,
} from "../../../../lib/office-shape-paint";
import {
  normalizeOfficeTextPaintStated,
  officeStatedLineColor,
  officeTextPaintDisplayFromStated,
  sortedStops,
  type OfficeStatedFill,
  type OfficeTextPaintStated,
} from "../../../../lib/office-text-paint-stated";
import { attachOfficeTextShadowCopy, officeTextShadowTransformed } from "../../../../lib/office-text-shadow-copy";
import type { OfficeTextShadow } from "../../../../lib/office-text-paint";

/**
 * Closed, developer-authored text-effect values. None of these values is ever
 * copied into CSS directly; each one resolves through the fixed declarations
 * below so imported or forged attributes cannot inject style text.
 */
/**
 * "hollow" and "legacy" are Word's Font dialog Outline and Shadow effects
 * (w:outline / w:shadow); the other values are the Text Effects gallery's
 * Word 2010 effects (w14:textOutline / w14:shadow).
 */
export const TEXT_OUTLINE_VALUES = [
  "none",
  "thin",
  "medium",
  "thick",
  "hollow",
] as const;
export const TEXT_SHADOW_VALUES = [
  "none",
  "subtle",
  "strong",
  "offset",
  "legacy",
] as const;
export const TEXT_REFLECTION_VALUES = [
  "none",
  "tight",
  "half",
  "full",
] as const;
export const TEXT_GLOW_VALUES = [
  "none",
  "blue",
  "orange",
  "green",
  "purple",
] as const;
/** Word's Font dialog Emboss / Engrave (w:emboss / w:imprint). */
export const TEXT_RELIEF_VALUES = ["none", "emboss", "engrave"] as const;

export type TextOutlineValue = (typeof TEXT_OUTLINE_VALUES)[number];
export type TextShadowValue = (typeof TEXT_SHADOW_VALUES)[number];
export type TextReflectionValue = (typeof TEXT_REFLECTION_VALUES)[number];
export type TextGlowValue = (typeof TEXT_GLOW_VALUES)[number];
export type TextReliefValue = (typeof TEXT_RELIEF_VALUES)[number];

export interface TextEffectAttributes {
  outline: TextOutlineValue;
  shadow: TextShadowValue;
  reflection: TextReflectionValue;
  glow: TextGlowValue;
  relief: TextReliefValue;
}

/** The gallery axes a Word 2010 effect of the source can belong to. */
export type TextEffectStatedAxis = "outline" | "shadow" | "reflection" | "glow";
const TEXT_EFFECT_STATED_AXES: readonly TextEffectStatedAxis[] = [
  "outline",
  "shadow",
  "reflection",
  "glow",
];

/**
 * The source's own Word 2010 effects (the importer's
 * `docx/run_appearance.py`): `paint` is Office's statement of them in Word's
 * dialect (`office-text-paint-stated`), `readAs` the gallery value each axis
 * it states was read as. An axis that still holds that value draws (and
 * saves) the stated effect; another gallery value replaces it. The text fill
 * and the 3-D belong to no axis.
 */
export interface TextEffectStatement {
  paint: OfficeTextPaintStated;
  readAs: Partial<Record<TextEffectStatedAxis, string>>;
}

/** The whole mark: the gallery axes and the source's own effects. */
export interface TextEffectMarkAttributes extends TextEffectAttributes {
  stated: TextEffectStatement | null;
}

/** Fifteen gallery cells, matching the 3 x 5 Home Text Effects layout. */
export const TEXT_EFFECT_PRESET_VALUES = [
  "none",
  "outline-thin",
  "outline-medium",
  "outline-thick",
  "shadow-subtle",
  "shadow-strong",
  "shadow-offset",
  "reflection-tight",
  "reflection-half",
  "reflection-full",
  "glow-blue",
  "glow-orange",
  "glow-green",
  "glow-purple",
  "outline-shadow",
] as const;

export type TextEffectPresetValue = (typeof TEXT_EFFECT_PRESET_VALUES)[number];

/**
 * Word's Number spacing (Default / Proportional / Tabular) and Number forms
 * (Default / Lining / Old-style), w14:numSpacing and w14:numForm, as one
 * value: either axis alone, or both joined.
 */
export const OPEN_TYPE_NUMBER_STYLE_VALUES = [
  "default",
  "proportional",
  "tabular",
  "lining",
  "oldstyle",
  "proportional-lining",
  "tabular-lining",
  "proportional-oldstyle",
  "tabular-oldstyle",
] as const;
/**
 * The ligature choices the Font dialog and the Typography gallery offer:
 * Word's None / Standard Only / Standard and Contextual / Historical and
 * Discretionary / All, plus the editor's own Historical and Discretionary.
 * Word's file vocabulary (w14:ligatures, [MS-DOCX] ST_Ligatures) has every
 * combination; {@link OPEN_TYPE_LIGATURE_ALL_VALUES} carries them all so an
 * imported value survives.
 */
export const OPEN_TYPE_LIGATURE_VALUES = [
  "default",
  "none",
  "standard",
  "standard-contextual",
  "historical-discretionary",
  "historical",
  "discretionary",
  "all",
] as const;
export const OPEN_TYPE_LIGATURE_ALL_VALUES = [
  ...OPEN_TYPE_LIGATURE_VALUES,
  "contextual",
  "standard-historical",
  "contextual-historical",
  "standard-discretionary",
  "contextual-discretionary",
  "standard-contextual-historical",
  "standard-contextual-discretionary",
  "standard-historical-discretionary",
  "contextual-historical-discretionary",
] as const;
export const OPEN_TYPE_STYLISTIC_SET_VALUES = [
  "default",
  "ss01",
  "ss02",
  "ss03",
  "ss04",
  "ss05",
  "ss06",
  "ss07",
  "ss08",
  "ss09",
  "ss10",
  "ss11",
  "ss12",
  "ss13",
  "ss14",
  "ss15",
  "ss16",
  "ss17",
  "ss18",
  "ss19",
  "ss20",
] as const;

export type OpenTypeNumberStyleValue =
  (typeof OPEN_TYPE_NUMBER_STYLE_VALUES)[number];
export type OpenTypeLigatureValue =
  (typeof OPEN_TYPE_LIGATURE_ALL_VALUES)[number];
export type OpenTypeStylisticSetValue =
  (typeof OPEN_TYPE_STYLISTIC_SET_VALUES)[number];

export interface OpenTypeFeatureAttributes {
  numberStyle: OpenTypeNumberStyleValue;
  ligatures: OpenTypeLigatureValue;
  stylisticSet: OpenTypeStylisticSetValue;
  /** Word's Use Contextual Alternates (w14:cntxtAlts, the calt feature). */
  contextualAlternates: boolean;
}

export const TEXT_EFFECTS_MARK = "textEffects";
export const OPEN_TYPE_FEATURES_MARK = "openTypeFeatures";

const TEXT_OUTLINE_SET = new Set<string>(TEXT_OUTLINE_VALUES);
const TEXT_SHADOW_SET = new Set<string>(TEXT_SHADOW_VALUES);
const TEXT_REFLECTION_SET = new Set<string>(TEXT_REFLECTION_VALUES);
const TEXT_GLOW_SET = new Set<string>(TEXT_GLOW_VALUES);
const TEXT_RELIEF_SET = new Set<string>(TEXT_RELIEF_VALUES);
const TEXT_EFFECT_PRESET_SET = new Set<string>(TEXT_EFFECT_PRESET_VALUES);
const OPEN_TYPE_NUMBER_STYLE_SET = new Set<string>(
  OPEN_TYPE_NUMBER_STYLE_VALUES,
);
const OPEN_TYPE_LIGATURE_SET = new Set<string>(OPEN_TYPE_LIGATURE_ALL_VALUES);
const OPEN_TYPE_STYLISTIC_SET_SET = new Set<string>(
  OPEN_TYPE_STYLISTIC_SET_VALUES,
);

const NO_TEXT_EFFECTS: TextEffectAttributes = Object.freeze({
  outline: "none",
  shadow: "none",
  reflection: "none",
  glow: "none",
  relief: "none",
});
const DEFAULT_OPEN_TYPE_FEATURES: OpenTypeFeatureAttributes = Object.freeze({
  numberStyle: "default",
  ligatures: "default",
  stylisticSet: "default",
  contextualAlternates: false,
});

const TEXT_EFFECT_PRESETS: Readonly<
  Record<TextEffectPresetValue, TextEffectAttributes>
> = Object.freeze({
  none: NO_TEXT_EFFECTS,
  "outline-thin": { ...NO_TEXT_EFFECTS, outline: "thin" },
  "outline-medium": { ...NO_TEXT_EFFECTS, outline: "medium" },
  "outline-thick": { ...NO_TEXT_EFFECTS, outline: "thick" },
  "shadow-subtle": { ...NO_TEXT_EFFECTS, shadow: "subtle" },
  "shadow-strong": { ...NO_TEXT_EFFECTS, shadow: "strong" },
  "shadow-offset": { ...NO_TEXT_EFFECTS, shadow: "offset" },
  "reflection-tight": { ...NO_TEXT_EFFECTS, reflection: "tight" },
  "reflection-half": { ...NO_TEXT_EFFECTS, reflection: "half" },
  "reflection-full": { ...NO_TEXT_EFFECTS, reflection: "full" },
  "glow-blue": { ...NO_TEXT_EFFECTS, glow: "blue" },
  "glow-orange": { ...NO_TEXT_EFFECTS, glow: "orange" },
  "glow-green": { ...NO_TEXT_EFFECTS, glow: "green" },
  "glow-purple": { ...NO_TEXT_EFFECTS, glow: "purple" },
  "outline-shadow": {
    ...NO_TEXT_EFFECTS,
    outline: "thin",
    shadow: "subtle",
  },
});

function normalizedMember<T extends string>(
  value: unknown,
  values: ReadonlySet<string>,
  fallback: T,
): T {
  return typeof value === "string" && values.has(value)
    ? (value as T)
    : fallback;
}

export function normalizeTextEffectPreset(
  value: unknown,
): TextEffectPresetValue | null {
  return typeof value === "string" && TEXT_EFFECT_PRESET_SET.has(value)
    ? (value as TextEffectPresetValue)
    : null;
}

/** Resolve a gallery preset to a defensive copy of its closed attributes. */
export function textEffectAttributesForPreset(
  value: unknown,
): TextEffectAttributes | null {
  const preset = normalizeTextEffectPreset(value);
  return preset ? { ...TEXT_EFFECT_PRESETS[preset] } : null;
}

export function normalizeTextEffectAttributes(
  value: unknown,
): TextEffectAttributes {
  const attrs =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    outline: normalizedMember(
      attrs.outline,
      TEXT_OUTLINE_SET,
      NO_TEXT_EFFECTS.outline,
    ),
    shadow: normalizedMember(
      attrs.shadow,
      TEXT_SHADOW_SET,
      NO_TEXT_EFFECTS.shadow,
    ),
    reflection: normalizedMember(
      attrs.reflection,
      TEXT_REFLECTION_SET,
      NO_TEXT_EFFECTS.reflection,
    ),
    glow: normalizedMember(attrs.glow, TEXT_GLOW_SET, NO_TEXT_EFFECTS.glow),
    relief: normalizedMember(
      attrs.relief,
      TEXT_RELIEF_SET,
      NO_TEXT_EFFECTS.relief,
    ),
  };
}

const AXIS_VALUE_SETS: Readonly<Record<TextEffectStatedAxis, ReadonlySet<string>>> = {
  outline: TEXT_OUTLINE_SET,
  shadow: TEXT_SHADOW_SET,
  reflection: TEXT_REFLECTION_SET,
  glow: TEXT_GLOW_SET,
};

function statedAxisPart(
  paint: OfficeTextPaintStated,
  axis: TextEffectStatedAxis,
): unknown {
  if (axis === "outline") return paint.line;
  if (axis === "shadow") return paint.effects?.outerShadow;
  return paint.effects?.[axis];
}

/** The colour transforms w14's CT_SRgbColor / CT_SchemeColor declare. */
const WORD_COLOR_TRANSFORMS = new Set([
  "tint", "shade", "alpha", "hueMod", "sat", "satOff", "satMod", "lum", "lumOff", "lumMod",
]);

function wordStatementColors(paint: OfficeTextPaintStated): OfficeColorSource[] {
  const colors: OfficeColorSource[] = [];
  const fill = (value: OfficeStatedFill | undefined) => {
    if (value?.kind === "solid") colors.push(value.color);
    if (value?.kind === "gradient") colors.push(...value.stops.map((stop) => stop.color));
  };
  fill(paint.line?.fill);
  fill(paint.fill);
  const effects = paint.effects;
  if (effects?.glow) colors.push(effects.glow.color);
  if (effects?.outerShadow) colors.push(effects.outerShadow.color);
  if (paint.shape3d?.extrusionColor) colors.push(paint.shape3d.extrusionColor);
  if (paint.shape3d?.contourColor) colors.push(paint.shape3d.contourColor);
  return colors;
}

/**
 * The source's own effects, validated, or null. Word's dialect has no inner
 * shadow, pattern fill, inherited fill, shape-rotating effect or colour other
 * than an RGB or theme one; `readAs` names exactly the axes it states.
 */
export function normalizeTextEffectStatement(
  value: unknown,
): TextEffectStatement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => key !== "paint" && key !== "readAs")) return null;
  let paint: OfficeTextPaintStated | undefined;
  try {
    paint = normalizeOfficeTextPaintStated(raw.paint);
  } catch {
    return null;
  }
  if (!paint) return null;
  const effects = paint.effects;
  if (
    paint.inheritedFill !== undefined ||
    paint.fill?.kind === "pattern" ||
    (paint.fill?.kind === "gradient" && paint.fill.rotateWithShape !== undefined) ||
    (effects && Object.keys(effects).length === 0) ||
    effects?.innerShadow ||
    effects?.outerShadow?.rotateWithShape !== undefined ||
    effects?.reflection?.rotateWithShape !== undefined ||
    wordStatementColors(paint).some(
      (color) =>
        (color.kind !== "srgb" && color.kind !== "scheme") ||
        (color.transforms ?? []).some(([name]) => !WORD_COLOR_TRANSFORMS.has(name)),
    )
  ) {
    return null;
  }
  const readAsRaw = raw.readAs ?? {};
  if (!readAsRaw || typeof readAsRaw !== "object" || Array.isArray(readAsRaw)) return null;
  const readAsRecord = readAsRaw as Record<string, unknown>;
  const readAs: TextEffectStatement["readAs"] = {};
  for (const key of Object.keys(readAsRecord)) {
    if (!(TEXT_EFFECT_STATED_AXES as readonly string[]).includes(key)) return null;
  }
  for (const axis of TEXT_EFFECT_STATED_AXES) {
    const stated = statedAxisPart(paint, axis) !== undefined;
    if (stated !== axis in readAsRecord) return null;
    if (!stated) continue;
    const readValue = readAsRecord[axis];
    if (typeof readValue !== "string" || !AXIS_VALUE_SETS[axis].has(readValue)) return null;
    readAs[axis] = readValue;
  }
  return { paint, readAs };
}

/** The whole mark's attrs: the gallery axes and the source's own effects. */
export function normalizeTextEffectMarkAttributes(
  value: unknown,
): TextEffectMarkAttributes {
  const attrs =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    ...normalizeTextEffectAttributes(attrs),
    stated: normalizeTextEffectStatement(attrs.stated),
  };
}

/** Whether an axis still draws (and saves) the source's own effect. */
function axisStatesSource(
  attrs: TextEffectMarkAttributes,
  axis: TextEffectStatedAxis,
): boolean {
  const stated = attrs.stated;
  return Boolean(
    stated &&
      stated.readAs[axis] === attrs[axis] &&
      statedAxisPart(stated.paint, axis) !== undefined,
  );
}

/**
 * The mark with one axis set: picking another gallery value for an axis
 * replaces the source's own effect for that axis (as Word's gallery does);
 * the other axes, the text fill and the 3-D stay as the source states them.
 */
function withTextEffectAxis<K extends keyof TextEffectAttributes>(
  attrs: TextEffectMarkAttributes,
  axis: K,
  value: TextEffectAttributes[K],
): TextEffectMarkAttributes {
  if (attrs[axis] === value) return attrs;
  const next = { ...attrs, [axis]: value } as TextEffectMarkAttributes;
  const stated = attrs.stated;
  if (
    !stated ||
    axis === "relief" ||
    !(axis in stated.readAs)
  ) {
    return next;
  }
  const statedAxis = axis as TextEffectStatedAxis;
  const paint = JSON.parse(JSON.stringify(stated.paint)) as OfficeTextPaintStated;
  if (statedAxis === "outline") delete paint.line;
  else if (paint.effects) {
    delete paint.effects[statedAxis === "shadow" ? "outerShadow" : statedAxis];
    if (!Object.keys(paint.effects).length) delete paint.effects;
  }
  const readAs = { ...stated.readAs };
  delete readAs[statedAxis];
  next.stated = Object.keys(paint).length ? { paint, readAs } : null;
  return next;
}

/** The kinds of the words' 3-D a Word run states: Format Text Effects >
 * 3-D Format (Word offers no 3-D Rotation for a document's words; its
 * `w14:camera` states a preset alone). */
export type TextEffect3dKind = "bevel" | "format3d";

/**
 * The mark with one 3-D Format pick on the source's statement (`value` null:
 * "No Bevel", Reset): the depth, contour, material, light and bevels it does
 * not name stay as Word stated them, as do the gallery axes.
 */
export function withTextEffect3d<K extends TextEffect3dKind>(
  attrs: TextEffectMarkAttributes,
  kind: K,
  value: OfficeText3dValues[K] | null,
): TextEffectMarkAttributes {
  const paint = withOfficeTextStated3d(attrs.stated?.paint, kind, value, "word");
  const readAs = attrs.stated?.readAs ?? {};
  const stated = paint ? normalizeTextEffectStatement({ paint, readAs }) : null;
  if (paint && !stated) return attrs;
  return { ...attrs, stated };
}

/** The words' 3-D Format as the shared effects model reads it. */
export function textEffect3dEffects(value: unknown): Partial<OfficeText3dValues> {
  const attrs = normalizeTextEffectMarkAttributes(value);
  const { bevel, format3d } = officeTextStated3dEffects(attrs.stated?.paint);
  return { ...(bevel ? { bevel } : {}), ...(format3d ? { format3d } : {}) };
}

function textEffectMarkHasValues(attrs: TextEffectMarkAttributes): boolean {
  return hasTextEffects(attrs) || attrs.stated !== null;
}

export function normalizeOpenTypeFeatureAttributes(
  value: unknown,
): OpenTypeFeatureAttributes {
  const attrs =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    numberStyle: normalizedMember(
      attrs.numberStyle,
      OPEN_TYPE_NUMBER_STYLE_SET,
      DEFAULT_OPEN_TYPE_FEATURES.numberStyle,
    ),
    ligatures: normalizedMember(
      attrs.ligatures,
      OPEN_TYPE_LIGATURE_SET,
      DEFAULT_OPEN_TYPE_FEATURES.ligatures,
    ),
    stylisticSet: normalizedMember(
      attrs.stylisticSet,
      OPEN_TYPE_STYLISTIC_SET_SET,
      DEFAULT_OPEN_TYPE_FEATURES.stylisticSet,
    ),
    contextualAlternates: attrs.contextualAlternates === true,
  };
}

export function hasTextEffects(attrs: TextEffectAttributes): boolean {
  return (
    attrs.outline !== "none" ||
    attrs.shadow !== "none" ||
    attrs.reflection !== "none" ||
    attrs.glow !== "none" ||
    attrs.relief !== "none"
  );
}

export function hasOpenTypeFeatures(attrs: OpenTypeFeatureAttributes): boolean {
  return (
    attrs.numberStyle !== "default" ||
    attrs.ligatures !== "default" ||
    attrs.stylisticSet !== "default" ||
    attrs.contextualAlternates
  );
}

function textEffectAttributesAreCanonical(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const attrs = value as Record<string, unknown>;
  const normalized = normalizeTextEffectAttributes(attrs);
  return (
    attrs.outline === normalized.outline &&
    attrs.shadow === normalized.shadow &&
    attrs.reflection === normalized.reflection &&
    attrs.glow === normalized.glow &&
    (attrs.relief === undefined || attrs.relief === normalized.relief) &&
    (attrs.stated == null || normalizeTextEffectStatement(attrs.stated) !== null)
  );
}

function openTypeFeatureAttributesAreCanonical(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const attrs = value as Record<string, unknown>;
  const normalized = normalizeOpenTypeFeatureAttributes(attrs);
  return (
    attrs.numberStyle === normalized.numberStyle &&
    attrs.ligatures === normalized.ligatures &&
    attrs.stylisticSet === normalized.stylisticSet &&
    (attrs.contextualAlternates === undefined ||
      attrs.contextualAlternates === normalized.contextualAlternates)
  );
}

/**
 * Change one axis of a composable mark without flattening the other axes of a
 * mixed selection. Every selected text run is authenticated and transformed
 * from the same immutable state before the single transaction is touched.
 */
function updateSelectedCompositeMark<T extends object>({
  state,
  tr,
  dispatch,
  markName,
  normalize,
  isCanonical,
  hasValues,
  update,
}: {
  state: EditorState;
  tr: Transaction;
  dispatch?: (transaction: Transaction) => void;
  markName: string;
  normalize: (value: unknown) => T;
  isCanonical: (value: unknown) => boolean;
  hasValues: (attrs: T) => boolean;
  update: (attrs: T) => T;
}): boolean {
  const markType = state.schema.marks[markName];
  const { from, to } = state.selection;
  if (!markType || state.selection.empty) {
    tr.setMeta("preventDispatch", true);
    return false;
  }

  const patches: Array<{
    from: number;
    to: number;
    next: ProseMirrorMark | null;
  }> = [];
  let authorized = true;
  state.doc.nodesBetween(from, to, (node, position) => {
    if (!authorized || !node.isText) return authorized;
    const start = Math.max(from, position);
    const end = Math.min(to, position + node.nodeSize);
    if (start >= end) return;

    const existing = node.marks.find((mark) => mark.type === markType);
    if (existing && !isCanonical(existing.attrs)) {
      authorized = false;
      return false;
    }
    const nextAttrs = update(normalize(existing?.attrs));
    const next = hasValues(nextAttrs) ? markType.create(nextAttrs) : null;
    if ((!existing && !next) || (existing && next && existing.eq(next))) {
      return;
    }
    patches.push({ from: start, to: end, next });
  });
  if (!authorized || patches.length === 0) {
    tr.setMeta("preventDispatch", true);
    return false;
  }

  if (dispatch) {
    closeHistory(tr);
    for (const patch of patches) {
      tr.removeMark(patch.from, patch.to, markType);
      if (patch.next) tr.addMark(patch.from, patch.to, patch.next);
    }
    dispatch(tr);
  }
  return true;
}

const OUTLINE_CSS: Readonly<Record<Exclude<TextOutlineValue, "none">, string>> =
  Object.freeze({
    thin: "-webkit-text-stroke: 0.45px currentColor; paint-order: stroke fill",
    medium: "-webkit-text-stroke: 0.8px currentColor; paint-order: stroke fill",
    thick: "-webkit-text-stroke: 1.2px currentColor; paint-order: stroke fill",
    // Word's Font dialog Outline (w:outline): the glyph drawn as its outline
    // only, hollow, in the text colour.
    hollow:
      "-webkit-text-stroke: 0.045em currentColor; -webkit-text-fill-color: transparent",
  });

const SHADOW_CSS: Readonly<Record<Exclude<TextShadowValue, "none">, string>> =
  Object.freeze({
    subtle: "1px 1px 1px rgba(15, 23, 42, 0.28)",
    strong: "2px 2px 2px rgba(15, 23, 42, 0.42)",
    offset: "3px 3px 0 rgba(15, 23, 42, 0.34)",
    // Word's Font dialog Shadow (w:shadow): a soft grey copy down and right.
    legacy: "0.05em 0.05em 0.03em rgba(0, 0, 0, 0.45)",
  });

/**
 * Word's Emboss / Engrave (w:emboss / w:imprint), as Word 16 draws them: the
 * glyph with a grey copy offset down-right (emboss, raised) or up-left
 * (engrave, pressed in).
 */
const RELIEF_CSS: Readonly<Record<Exclude<TextReliefValue, "none">, string>> =
  Object.freeze({
    emboss:
      "-0.02em -0.02em 0 currentColor, 0.05em 0.05em 0 rgba(0, 0, 0, 0.35)",
    engrave:
      "-0.05em -0.05em 0 rgba(0, 0, 0, 0.35), 0.02em 0.02em 0 currentColor",
  });

const REFLECTION_CSS: Readonly<
  Record<Exclude<TextReflectionValue, "none">, string>
> = Object.freeze({
  // Word mirrors the text about its baseline (w14:reflection algn="bl",
  // dist 0: the descenders overlap their reflection). The reflected box's
  // bottom edge is its height (100%: its own line height, or the leaf
  // span's under the auto line boxes, where the run's own line-height is
  // 0) below the box top, so the mirror is pulled up to the baseline: the
  // edge sits (height - ascent + descent) / 2 below it, i.e. half of
  // (100% - ~0.6em) for Latin text faces. Without this the
  // reflection hung a doubled descent and half-leading (~30px at 36pt)
  // below the text. The fade is Word's preset ladder: 55% opaque at the text,
  // gone at 35.5% / 55.5% / 90% of the reflection (the mask is laid on the
  // unflipped box, so it runs bottom-up), 0 / 0.75 / 1.5pt away.
  tight: "below calc(0.6em - 100%) linear-gradient(transparent 64.5%, rgba(255, 255, 255, 0.55))",
  half: "below calc(0.6em - 100% + 1px) linear-gradient(transparent 44.5%, rgba(255, 255, 255, 0.55))",
  full: "below calc(0.6em - 100% + 2px) linear-gradient(transparent 10%, rgba(255, 255, 255, 0.55))",
});

const GLOW_CSS: Readonly<Record<Exclude<TextGlowValue, "none">, string>> =
  Object.freeze({
    blue: "0 0 4px rgba(37, 99, 235, 0.68), 0 0 9px rgba(37, 99, 235, 0.34)",
    orange: "0 0 4px rgba(234, 88, 12, 0.68), 0 0 9px rgba(234, 88, 12, 0.34)",
    green: "0 0 4px rgba(22, 163, 74, 0.68), 0 0 9px rgba(22, 163, 74, 0.34)",
    purple:
      "0 0 4px rgba(124, 58, 237, 0.68), 0 0 9px rgba(124, 58, 237, 0.34)",
  });

// ---------------------------------------------------------------------------
// The source's own Word 2010 effects, drawn as closely as CSS allows. Every
// value is a number this module formats or a colour it resolved to #rrggbb
// itself (`resolveOfficeStopColor`), never text from the attrs. In Word's
// dialect a colour's `alpha` is its transparency (Format Text Effects >
// Transparency 60% is w14:alpha 60000).

const css = (value: number) => Number(value.toFixed(3));

function wordRgba(color: OfficeColorSource, extraOpacity = 1): string | null {
  const hex = resolveOfficeStopColor(color);
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  let transparency = 0;
  for (const [kind, raw] of color.transforms ?? []) {
    if (kind === "alpha") transparency = (raw ?? 0) / 100_000;
  }
  const opacity = Math.max(0, Math.min(1, (1 - transparency) * extraOpacity));
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${channels.join(", ")}, ${css(opacity)})`;
}

function wordFillCss(fill: OfficeStatedFill): string[] {
  if (fill.kind === "none") return ["-webkit-text-fill-color: transparent"];
  if (fill.kind === "solid") {
    const color = wordRgba(fill.color);
    return color ? [`-webkit-text-fill-color: ${color}`] : [];
  }
  if (fill.kind !== "gradient") return [];
  const stops = sortedStops(fill).map((stop) => {
    const color = resolveOfficeStopColor(stop.color);
    let transparency = 0;
    for (const [kind, raw] of stop.color.transforms ?? []) {
      if (kind === "alpha") transparency = (raw ?? 0) / 100_000;
    }
    return { position: stop.position / 100_000, color: color ?? "#000000", alpha: 1 - transparency };
  });
  const gradient = officeGradientCss({
    angle: (((fill.angle ?? 0) / 60_000 + 90) % 360 + 360) % 360,
    stops,
  });
  return [
    `background-image: ${gradient}`,
    "-webkit-background-clip: text",
    "background-clip: text",
    "-webkit-text-fill-color: transparent",
  ];
}

/** A colour as #rrggbb, with its opacity as a last byte when it has one. */
function wordHexAlpha(color: OfficeColorSource): string | null {
  const hex = resolveOfficeStopColor(color);
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  let transparency = 0;
  for (const [kind, raw] of color.transforms ?? []) {
    if (kind === "alpha") transparency = (raw ?? 0) / 100_000;
  }
  const alpha = Math.round(Math.max(0, Math.min(1, 1 - transparency)) * 255);
  return alpha >= 255 ? hex.toLowerCase() : `${hex.toLowerCase()}${alpha.toString(16).padStart(2, "0")}`;
}

function wordOutlineCss(line: NonNullable<OfficeTextPaintStated["line"]>): string[] {
  // A gradient outline is stroked in its first stop's colour: CSS has no
  // gradient text stroke.
  const source = officeStatedLineColor(line);
  const color = source ? wordRgba(source) : null;
  const hex = source ? wordHexAlpha(source) : null;
  if (!color || !hex) return [];
  // Word strokes each glyph's merged outline once, centred (pen alignment
  // ctr) and round, over the fill (office-text-outline-css.ts): the
  // overlay draws that; -webkit-text-stroke (every contour, mitred) stands
  // in until it has. A zero width is a hairline.
  const width = line.widthEmu ?? EMU_PER_PX;
  const widthPt = width ? width / EMU_PER_PT : 0.375;
  const declarations = [`-webkit-text-stroke: ${width ? `${css(widthPt)}pt` : "0.5px"} ${color}`];
  // Its join, cap and dash too, as Word draws them (round, solid where none
  // is stated).
  for (const [key, value] of Object.entries(officeTextOutlineMarks(hex, widthPt, officeTextOutlineLineOfStated(line)))) {
    declarations.push(`${key.startsWith("--") ? key : key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}: ${value}`);
  }
  return declarations;
}

function wordShadowCss(
  shadow: NonNullable<NonNullable<OfficeTextPaintStated["effects"]>["outerShadow"]>,
): string | null {
  const color = wordRgba(shadow.color);
  if (!color) return null;
  // `dir` is clockwise from the +x axis in 60 000ths of a degree; a shadow's
  // scale and skew have no text-shadow equivalent.
  const distance = (shadow.distanceEmu ?? 0) / EMU_PER_PX;
  const angle = (((shadow.direction ?? 0) / 60_000) * Math.PI) / 180;
  return `${css(distance * Math.cos(angle))}px ${css(distance * Math.sin(angle))}px ${css((shadow.blurEmu ?? 0) / EMU_PER_PX)}px ${color}`;
}

function wordGlowCss(
  glow: NonNullable<NonNullable<OfficeTextPaintStated["effects"]>["glow"]>,
): string | null {
  // The gallery's glow calibration (GLOW_CSS): a tight bright halo at 0.6x
  // the radius and a wide faint one at 1.35x.
  const radius = (glow.radiusEmu ?? 0) / EMU_PER_PX;
  const inner = wordRgba(glow.color, 1.7);
  const outer = wordRgba(glow.color, 0.85);
  if (!inner || !outer) return null;
  return `0 0 ${css(radius * 0.6)}px ${inner}, 0 0 ${css(radius * 1.35)}px ${outer}`;
}

function wordReflectionCss(
  reflection: NonNullable<NonNullable<OfficeTextPaintStated["effects"]>["reflection"]>,
): string {
  // The gallery's own mirror (REFLECTION_CSS): pulled up to the baseline,
  // fading from its start opacity to nothing at its end position.
  const distance = css((reflection.distanceEmu ?? 0) / EMU_PER_PX);
  const end = css(100 - (reflection.endPosition ?? 0) / 1000);
  const start = css((reflection.startAlpha ?? 0) / 100_000);
  const offset = distance ? `calc(0.6em - 100% + ${distance}px)` : "calc(0.6em - 100%)";
  return `below ${offset} linear-gradient(transparent ${end}%, rgba(255, 255, 255, ${start}))`;
}










export function textEffectsPerspectiveShadow(value: unknown): OfficeTextShadow | null {
  const attrs = normalizeTextEffectMarkAttributes(value);
  const outer = attrs.stated?.paint?.effects?.outerShadow;
  if (!outer || !axisStatesSource(attrs, "shadow")) return null;
  const shadow = officeTextPaintDisplayFromStated({ effects: { outerShadow: outer } } as OfficeTextPaintStated, "#000000").shadow;
  return shadow && officeTextShadowTransformed(shadow) ? (shadow as OfficeTextShadow) : null;
}

/** Fixed CSS declarations for a normalized text-effect mark. */
export function textEffectsCss(value: unknown): string {
  const attrs = normalizeTextEffectMarkAttributes(value);
  const paint = attrs.stated?.paint;
  const declarations: string[] = [];
  const ownOutline = Boolean(paint?.line && axisStatesSource(attrs, "outline"));
  if (paint?.line && ownOutline) {
    declarations.push(...wordOutlineCss(paint.line));
  } else if (attrs.outline !== "none") {
    declarations.push(OUTLINE_CSS[attrs.outline]);
  }
  if (paint?.fill) declarations.push(...wordFillCss(paint.fill));
  // Glyphs drawn without a fill of their own colour (Word's hollow outline,
  // an empty or gradient text fill): text-shadow would paint a solid glyph
  // silhouette through the transparent fill, where Word shadows only what
  // it drew. A drop-shadow filter shadows the painted outline / gradient.
  const transparentFill = paint?.fill
    ? paint.fill.kind === "none" || paint.fill.kind === "gradient"
    : attrs.outline === "hollow" && !ownOutline;

  const shadows: string[] = [];
  if (attrs.relief !== "none") shadows.push(RELIEF_CSS[attrs.relief]);
  const statedShadow = paint?.effects?.outerShadow;
  if (statedShadow && axisStatesSource(attrs, "shadow")) {
    // A perspective shadow is the copy the mark view paints behind the words
    // (`textEffectsPerspectiveShadow`), never a moved halo.
    const shadow = textEffectsPerspectiveShadow(attrs) ? null : wordShadowCss(statedShadow);
    if (shadow) shadows.push(shadow);
  } else if (attrs.shadow !== "none") {
    shadows.push(SHADOW_CSS[attrs.shadow]);
  }
  const statedGlow = paint?.effects?.glow;
  if (statedGlow && axisStatesSource(attrs, "glow")) {
    const glow = wordGlowCss(statedGlow);
    if (glow) shadows.push(glow);
  } else if (attrs.glow !== "none") {
    shadows.push(GLOW_CSS[attrs.glow]);
  }
  if (paint?.shape3d?.bevelTop) {
    // A 3-D bevel, as the shared WordArt paint draws one: lit top-left edges.
    shadows.push("-0.6px -0.6px 0 rgba(255, 255, 255, 0.5)", "0.6px 0.6px 0 rgba(0, 0, 0, 0.31)");
  }
  const contourWidth = paint?.shape3d?.contourWidthEmu ?? 0;
  if (contourWidth > 0) {
    // 3-D Format > Contour: a raised rim round the glyphs in its colour (the
    // text's own where none is stated), seen from the front as a ring.
    const rim = paint?.shape3d?.contourColor ? wordRgba(paint.shape3d.contourColor) : "currentColor";
    const width = css(Math.min(contourWidth / EMU_PER_PX, 12));
    if (rim) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
        shadows.push(`${css(dx * width)}px ${css(dy * width)}px 0 ${rim}`);
      }
    }
  }
  if (shadows.length && transparentFill) {
    const layers = shadows.flatMap((shadow) => shadow.split(/,\s*(?![^()]*\))/));
    declarations.push(`filter: ${layers.map((layer) => `drop-shadow(${layer})`).join(" ")}`);
  } else if (shadows.length) {
    declarations.push(`text-shadow: ${shadows.join(", ")}`);
  }

  const statedReflection = paint?.effects?.reflection;
  if (statedReflection && axisStatesSource(attrs, "reflection")) {
    declarations.push("display: inline-block");
    declarations.push(`-webkit-box-reflect: ${wordReflectionCss(statedReflection)}`);
  } else if (attrs.reflection !== "none") {
    declarations.push("display: inline-block");
    declarations.push(
      `-webkit-box-reflect: ${REFLECTION_CSS[attrs.reflection]}`,
    );
  }
  return declarations.join("; ");
}

const NUMBER_STYLE_CSS: Readonly<
  Record<Exclude<OpenTypeNumberStyleValue, "default">, string>
> = Object.freeze({
  proportional: "proportional-nums",
  tabular: "tabular-nums",
  lining: "lining-nums",
  oldstyle: "oldstyle-nums",
  "proportional-lining": "lining-nums proportional-nums",
  "tabular-lining": "lining-nums tabular-nums",
  "proportional-oldstyle": "oldstyle-nums proportional-nums",
  "tabular-oldstyle": "oldstyle-nums tabular-nums",
});

/**
 * The OpenType features a ligature value turns on. Word's ligature kinds
 * ([MS-DOCX] ST_Ligatures) are the font's standard (liga), contextual
 * (clig), historical (hlig) and discretionary (dlig) ligatures; a kind the
 * value does not name is off, as Word draws it.
 */
function ligatureFeatures(
  value: Exclude<OpenTypeLigatureValue, "default">,
): Record<"liga" | "clig" | "hlig" | "dlig", 0 | 1> {
  const parts = new Set(value === "all"
    ? ["standard", "contextual", "historical", "discretionary"]
    : value.split("-"));
  return {
    liga: parts.has("standard") ? 1 : 0,
    clig: parts.has("contextual") ? 1 : 0,
    hlig: parts.has("historical") ? 1 : 0,
    dlig: parts.has("discretionary") ? 1 : 0,
  };
}

/** Fixed CSS declarations for a normalized OpenType feature mark. */
export function openTypeFeaturesCss(value: unknown): string {
  const attrs = normalizeOpenTypeFeatureAttributes(value);
  const declarations: string[] = [];
  if (attrs.numberStyle !== "default") {
    declarations.push(
      `font-variant-numeric: ${NUMBER_STYLE_CSS[attrs.numberStyle]}`,
    );
  }
  // One font-feature-settings list: an inner span's declaration replaces an
  // outer one wholesale, so every feature this mark states goes in it.
  const features: string[] = [];
  if (attrs.ligatures !== "default") {
    for (const [tag, on] of Object.entries(ligatureFeatures(attrs.ligatures))) {
      features.push(`"${tag}" ${on}`);
    }
  }
  if (attrs.contextualAlternates) features.push('"calt" 1');
  if (attrs.stylisticSet !== "default") {
    features.push(`"${attrs.stylisticSet}" 1`);
  }
  if (features.length) {
    declarations.push(`font-feature-settings: ${features.join(", ")}`);
  }
  return declarations.join("; ");
}

function readTextEffects(element: HTMLElement): TextEffectMarkAttributes | false {
  let stated: unknown = null;
  const statedText = element.getAttribute("data-text-effects-stated");
  if (statedText) {
    try {
      stated = JSON.parse(statedText);
    } catch {
      stated = null;
    }
  }
  const attrs = normalizeTextEffectMarkAttributes({
    outline: element.getAttribute("data-text-outline"),
    shadow: element.getAttribute("data-text-shadow"),
    reflection: element.getAttribute("data-text-reflection"),
    glow: element.getAttribute("data-text-glow"),
    relief: element.getAttribute("data-text-relief"),
    stated,
  });
  return textEffectMarkHasValues(attrs) ? attrs : false;
}

function readOpenTypeFeatures(
  element: HTMLElement,
): OpenTypeFeatureAttributes | false {
  const attrs = normalizeOpenTypeFeatureAttributes({
    numberStyle: element.getAttribute("data-opentype-number-style"),
    ligatures: element.getAttribute("data-opentype-ligatures"),
    stylisticSet: element.getAttribute("data-opentype-stylistic-set"),
    contextualAlternates:
      element.getAttribute("data-opentype-contextual-alternates") === "true",
  });
  return hasOpenTypeFeatures(attrs) ? attrs : false;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textEffects: {
      setTextEffectPreset: (preset: string) => ReturnType;
      setTextOutlineEffect: (value: string) => ReturnType;
      setTextShadowEffect: (value: string) => ReturnType;
      setTextReflectionEffect: (value: string) => ReturnType;
      setTextGlowEffect: (value: string) => ReturnType;
      /** Word's Font dialog Emboss / Engrave (w:emboss / w:imprint). */
      setTextReliefEffect: (value: string) => ReturnType;
      /** Format Text Effects > 3-D Format (`withTextEffect3d`). */
      setTextEffect3d: (kind: TextEffect3dKind, value: unknown) => ReturnType;
      unsetTextEffects: () => ReturnType;
    };
    openTypeFeatures: {
      setOpenTypeNumberStyle: (value: string) => ReturnType;
      setOpenTypeLigatures: (value: string) => ReturnType;
      setOpenTypeStylisticSet: (value: string) => ReturnType;
      /** Word's Use Contextual Alternates (w14:cntxtAlts). */
      setOpenTypeContextualAlternates: (value: boolean) => ReturnType;
      unsetOpenTypeFeatures: () => ReturnType;
    };
  }
}

/** The span a text-effect mark renders: its data attributes and its CSS. */
function textEffectsRendered(value: unknown): Record<string, string> {
  const attrs = normalizeTextEffectMarkAttributes(value);
  const rendered: Record<string, string> = {};
  if (textEffectMarkHasValues(attrs)) {
    rendered["data-text-effects"] = "";
    // Copy and paste carry the source's own effects (validated on parse).
    if (attrs.stated) {
      rendered["data-text-effects-stated"] = JSON.stringify(attrs.stated);
    }
    if (attrs.outline !== "none") {
      rendered["data-text-outline"] = attrs.outline;
    }
    if (attrs.shadow !== "none") rendered["data-text-shadow"] = attrs.shadow;
    if (attrs.reflection !== "none") {
      rendered["data-text-reflection"] = attrs.reflection;
    }
    if (attrs.glow !== "none") rendered["data-text-glow"] = attrs.glow;
    if (attrs.relief !== "none") rendered["data-text-relief"] = attrs.relief;
    const style = textEffectsCss(attrs);
    if (style) rendered.style = style;
  }
  return rendered;
}

/** Text outline, shadow, reflection and glow stored as one composable mark. */
export const TextEffectsMark = TiptapMark.create({
  name: TEXT_EFFECTS_MARK,

  addAttributes() {
    return {
      outline: { default: "none", rendered: false },
      shadow: { default: "none", rendered: false },
      reflection: { default: "none", rendered: false },
      glow: { default: "none", rendered: false },
      relief: { default: "none", rendered: false },
      // The source's own Word 2010 effects (TextEffectStatement); null when
      // the run's effects are the gallery's own.
      stated: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-text-effects]",
        getAttrs: (element) =>
          element instanceof HTMLElement ? readTextEffects(element) : false,
      },
    ];
  },

  renderHTML({ mark }) {
    return ["span", textEffectsRendered(mark.attrs), 0];
  },

  /**
   * In the editor the span takes the outline overlay's picture in its own
   * style (office-text-outline-overlay.ts): that is no change to the
   * document, so the view does not read the span again for it.
   */
  addMarkView() {
    return ({ mark }) => {
      const dom = document.createElement("span");
      for (const [name, value] of Object.entries(textEffectsRendered(mark.attrs))) dom.setAttribute(name, value);
      const perspective = textEffectsPerspectiveShadow(mark.attrs);
      if (!perspective) {
        return {
          dom,
          contentDOM: dom,
          ignoreMutation: (mutation) =>
            mutation.type === "attributes" && mutation.target === dom && mutation.attributeName === "style",
        };
      }
      // A perspective shadow: the words in an inner span, the shared shadow
      // copy's canvas behind them in the outer one -- outside the content, so
      // the editor never reads it as text.
      const outer = document.createElement("span");
      outer.setAttribute("data-text-effects-shadow-copy", "");
      outer.append(dom);
      const dispose = attachOfficeTextShadowCopy({ source: dom, host: outer, shadow: perspective });
      return {
        dom: outer,
        contentDOM: dom,
        ignoreMutation: (mutation) =>
          mutation.target === outer ||
          (mutation.type === "attributes" && mutation.target === dom && mutation.attributeName === "style"),
        destroy: dispose,
      };
    };
  },

  addCommands() {
    const apply = (
      commands: {
        setMark: (name: string, attrs?: Record<string, unknown>) => boolean;
        unsetMark: (
          name: string,
          options?: { extendEmptyMarkRange?: boolean },
        ) => boolean;
      },
      attrs: TextEffectMarkAttributes,
    ) =>
      textEffectMarkHasValues(attrs)
        ? commands.setMark(TEXT_EFFECTS_MARK, { ...attrs })
        : commands.unsetMark(TEXT_EFFECTS_MARK, { extendEmptyMarkRange: false });

    return {
      setTextEffectPreset:
        (preset) =>
        ({ commands, editor }) => {
          if (!editor.isEditable) return false;
          const attrs = textEffectAttributesForPreset(preset);
          if (!attrs) return false;
          // A gallery cell is a whole effect set: the source's own effects
          // go with it (setMark would otherwise keep the old `stated`).
          return apply(commands, { ...attrs, stated: null });
        },
      setTextOutlineEffect:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!TEXT_OUTLINE_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: TEXT_EFFECTS_MARK,
              normalize: normalizeTextEffectMarkAttributes,
              isCanonical: textEffectAttributesAreCanonical,
              hasValues: textEffectMarkHasValues,
              update: (attrs) =>
                withTextEffectAxis(attrs, "outline", value as TextOutlineValue),
            });
          }
          return apply(
            commands,
            withTextEffectAxis(
              normalizeTextEffectMarkAttributes(
                editor.getAttributes(TEXT_EFFECTS_MARK),
              ),
              "outline",
              value as TextOutlineValue,
            ),
          );
        },
      setTextShadowEffect:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!TEXT_SHADOW_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: TEXT_EFFECTS_MARK,
              normalize: normalizeTextEffectMarkAttributes,
              isCanonical: textEffectAttributesAreCanonical,
              hasValues: textEffectMarkHasValues,
              update: (attrs) =>
                withTextEffectAxis(attrs, "shadow", value as TextShadowValue),
            });
          }
          return apply(
            commands,
            withTextEffectAxis(
              normalizeTextEffectMarkAttributes(
                editor.getAttributes(TEXT_EFFECTS_MARK),
              ),
              "shadow",
              value as TextShadowValue,
            ),
          );
        },
      setTextReflectionEffect:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!TEXT_REFLECTION_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: TEXT_EFFECTS_MARK,
              normalize: normalizeTextEffectMarkAttributes,
              isCanonical: textEffectAttributesAreCanonical,
              hasValues: textEffectMarkHasValues,
              update: (attrs) =>
                withTextEffectAxis(attrs, "reflection", value as TextReflectionValue),
            });
          }
          return apply(
            commands,
            withTextEffectAxis(
              normalizeTextEffectMarkAttributes(
                editor.getAttributes(TEXT_EFFECTS_MARK),
              ),
              "reflection",
              value as TextReflectionValue,
            ),
          );
        },
      setTextGlowEffect:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!TEXT_GLOW_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: TEXT_EFFECTS_MARK,
              normalize: normalizeTextEffectMarkAttributes,
              isCanonical: textEffectAttributesAreCanonical,
              hasValues: textEffectMarkHasValues,
              update: (attrs) =>
                withTextEffectAxis(attrs, "glow", value as TextGlowValue),
            });
          }
          return apply(
            commands,
            withTextEffectAxis(
              normalizeTextEffectMarkAttributes(
                editor.getAttributes(TEXT_EFFECTS_MARK),
              ),
              "glow",
              value as TextGlowValue,
            ),
          );
        },
      setTextReliefEffect:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!TEXT_RELIEF_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: TEXT_EFFECTS_MARK,
              normalize: normalizeTextEffectMarkAttributes,
              isCanonical: textEffectAttributesAreCanonical,
              hasValues: textEffectMarkHasValues,
              update: (attrs) =>
                withTextEffectAxis(attrs, "relief", value as TextReliefValue),
            });
          }
          return apply(
            commands,
            withTextEffectAxis(
              normalizeTextEffectMarkAttributes(
                editor.getAttributes(TEXT_EFFECTS_MARK),
              ),
              "relief",
              value as TextReliefValue,
            ),
          );
        },
      setTextEffect3d:
        (kind, value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (kind !== "bevel" && kind !== "format3d") return false;
          const update = (attrs: TextEffectMarkAttributes) =>
            withTextEffect3d(attrs, kind, value as OfficeText3dValues[typeof kind] | null);
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: TEXT_EFFECTS_MARK,
              normalize: normalizeTextEffectMarkAttributes,
              isCanonical: textEffectAttributesAreCanonical,
              hasValues: textEffectMarkHasValues,
              update,
            });
          }
          return apply(
            commands,
            update(normalizeTextEffectMarkAttributes(editor.getAttributes(TEXT_EFFECTS_MARK))),
          );
        },
      unsetTextEffects:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(TEXT_EFFECTS_MARK, {
            extendEmptyMarkRange: false,
          }),
    };
  },
});

/** OpenType number style, ligatures and stylistic-set feature mark. */
export const OpenTypeFeaturesMark = TiptapMark.create({
  name: OPEN_TYPE_FEATURES_MARK,

  addAttributes() {
    return {
      numberStyle: { default: "default", rendered: false },
      ligatures: { default: "default", rendered: false },
      stylisticSet: { default: "default", rendered: false },
      contextualAlternates: { default: false, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-opentype-features]",
        getAttrs: (element) =>
          element instanceof HTMLElement
            ? readOpenTypeFeatures(element)
            : false,
      },
    ];
  },

  renderHTML({ mark }) {
    const attrs = normalizeOpenTypeFeatureAttributes(mark.attrs);
    const rendered: Record<string, string> = {};
    if (hasOpenTypeFeatures(attrs)) {
      rendered["data-opentype-features"] = "";
      if (attrs.numberStyle !== "default") {
        rendered["data-opentype-number-style"] = attrs.numberStyle;
      }
      if (attrs.ligatures !== "default") {
        rendered["data-opentype-ligatures"] = attrs.ligatures;
      }
      if (attrs.stylisticSet !== "default") {
        rendered["data-opentype-stylistic-set"] = attrs.stylisticSet;
      }
      if (attrs.contextualAlternates) {
        rendered["data-opentype-contextual-alternates"] = "true";
      }
      const style = openTypeFeaturesCss(attrs);
      if (style) rendered.style = style;
    }
    return ["span", rendered, 0];
  },

  addCommands() {
    const apply = (
      commands: {
        setMark: (name: string, attrs?: Record<string, unknown>) => boolean;
        unsetMark: (
          name: string,
          options?: { extendEmptyMarkRange?: boolean },
        ) => boolean;
      },
      attrs: OpenTypeFeatureAttributes,
    ) =>
      hasOpenTypeFeatures(attrs)
        ? commands.setMark(OPEN_TYPE_FEATURES_MARK, { ...attrs })
        : commands.unsetMark(OPEN_TYPE_FEATURES_MARK, {
            extendEmptyMarkRange: false,
          });

    return {
      setOpenTypeNumberStyle:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!OPEN_TYPE_NUMBER_STYLE_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: OPEN_TYPE_FEATURES_MARK,
              normalize: normalizeOpenTypeFeatureAttributes,
              isCanonical: openTypeFeatureAttributesAreCanonical,
              hasValues: hasOpenTypeFeatures,
              update: (attrs) => ({
                ...attrs,
                numberStyle: value as OpenTypeNumberStyleValue,
              }),
            });
          }
          const attrs = normalizeOpenTypeFeatureAttributes(
            editor.getAttributes(OPEN_TYPE_FEATURES_MARK),
          );
          attrs.numberStyle = value as OpenTypeNumberStyleValue;
          return apply(commands, attrs);
        },
      setOpenTypeLigatures:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!OPEN_TYPE_LIGATURE_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: OPEN_TYPE_FEATURES_MARK,
              normalize: normalizeOpenTypeFeatureAttributes,
              isCanonical: openTypeFeatureAttributesAreCanonical,
              hasValues: hasOpenTypeFeatures,
              update: (attrs) => ({
                ...attrs,
                ligatures: value as OpenTypeLigatureValue,
              }),
            });
          }
          const attrs = normalizeOpenTypeFeatureAttributes(
            editor.getAttributes(OPEN_TYPE_FEATURES_MARK),
          );
          attrs.ligatures = value as OpenTypeLigatureValue;
          return apply(commands, attrs);
        },
      setOpenTypeStylisticSet:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!OPEN_TYPE_STYLISTIC_SET_SET.has(value)) return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: OPEN_TYPE_FEATURES_MARK,
              normalize: normalizeOpenTypeFeatureAttributes,
              isCanonical: openTypeFeatureAttributesAreCanonical,
              hasValues: hasOpenTypeFeatures,
              update: (attrs) => ({
                ...attrs,
                stylisticSet: value as OpenTypeStylisticSetValue,
              }),
            });
          }
          const attrs = normalizeOpenTypeFeatureAttributes(
            editor.getAttributes(OPEN_TYPE_FEATURES_MARK),
          );
          attrs.stylisticSet = value as OpenTypeStylisticSetValue;
          return apply(commands, attrs);
        },
      setOpenTypeContextualAlternates:
        (value) =>
        ({ commands, editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (typeof value !== "boolean") return false;
          if (!state.selection.empty) {
            return updateSelectedCompositeMark({
              state,
              tr,
              dispatch,
              markName: OPEN_TYPE_FEATURES_MARK,
              normalize: normalizeOpenTypeFeatureAttributes,
              isCanonical: openTypeFeatureAttributesAreCanonical,
              hasValues: hasOpenTypeFeatures,
              update: (attrs) => ({ ...attrs, contextualAlternates: value }),
            });
          }
          const attrs = normalizeOpenTypeFeatureAttributes(
            editor.getAttributes(OPEN_TYPE_FEATURES_MARK),
          );
          attrs.contextualAlternates = value;
          return apply(commands, attrs);
        },
      unsetOpenTypeFeatures:
        () =>
        ({ commands, editor }) =>
          editor.isEditable &&
          commands.unsetMark(OPEN_TYPE_FEATURES_MARK, {
            extendEmptyMarkRange: false,
          }),
    };
  },
});

export type OpenTypeNumberSpacing = "default" | "proportional" | "tabular";
export type OpenTypeNumberForm = "default" | "lining" | "oldstyle";

/** Word's two number boxes (Number spacing, Number forms) of a number style. */
export function openTypeNumberAxes(value: unknown): {
  spacing: OpenTypeNumberSpacing;
  form: OpenTypeNumberForm;
} {
  const style = normalizeOpenTypeFeatureAttributes({ numberStyle: value }).numberStyle;
  const parts = style === "default" ? [] : style.split("-");
  return {
    spacing: parts.includes("proportional")
      ? "proportional"
      : parts.includes("tabular")
        ? "tabular"
        : "default",
    form: parts.includes("lining")
      ? "lining"
      : parts.includes("oldstyle")
        ? "oldstyle"
        : "default",
  };
}

/** The number style Word's Number spacing and Number forms boxes make. */
export function openTypeNumberStyle(
  spacing: OpenTypeNumberSpacing,
  form: OpenTypeNumberForm,
): OpenTypeNumberStyleValue {
  const parts = [spacing, form].filter((part) => part !== "default");
  return (parts.length ? parts.join("-") : "default") as OpenTypeNumberStyleValue;
}
