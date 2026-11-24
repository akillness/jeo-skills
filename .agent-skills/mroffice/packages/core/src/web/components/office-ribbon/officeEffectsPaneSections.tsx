"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Shape > Effects (PowerPoint for Mac 16.86, office/ppt-pane-shape-效果
 * .txt): Shadow, Reflection, Glow, Soft Edges, 3-D Format and 3-D Rotation,
 * each a Presets list over the parameters Office lets you type, in its units
 * and ranges. Over the shared effects model (lib/office-picture-effects) a
 * shape, a picture and Docs share, so every host's pane is this one.
 *
 * Office's ranges: shadow transparency 0–100 %, size 1–200 %, blur 0–100 pt,
 * angle 0–359°, distance 0–200 pt; reflection transparency, size 0–100 %,
 * blur, distance 0–100 pt; glow size 0–150 pt, transparency 0–100 %; soft
 * edges 0–100 pt; bevel width and height 0–1584 pt; rotation 0–359.9°.
 */

import {
  OFFICE_BEVEL_PRESETS,
  OFFICE_CAMERA_ROTATIONS,
  OFFICE_GLOW_ACCENTS,
  OFFICE_LIGHT_RIGS,
  OFFICE_MATERIAL_PRESETS,
  OFFICE_GLOW_SIZES_PT,
  OFFICE_REFLECTION_VARIATIONS,
  OFFICE_ROTATION_GALLERY,
  OFFICE_SOFT_EDGE_SIZES_PT,
  normalizeOfficeFormat3d,
  normalizeOfficePictureEffects,
  officeBevelVariation,
  officeCameraFieldOfView,
  officeGlowVariation,
  officeSoftEdgeVariation,
  sameOfficePictureEffect,
  type OfficeBevelPreset,
  type OfficeFormat3dEffect,
  type OfficeGlowEffect,
  type OfficeLightRig,
  type OfficeMaterialPreset,
  type OfficePictureEffectKind,
  type OfficePictureEffectValues,
  type OfficeReflectionEffect,
} from "../../lib/office-picture-effects";
import { OFFICE_SHADOW_GALLERY, type OfficeShadowEffect } from "../../lib/office-shadow-effects";

import type { OfficePictureEffectsMenuLabels } from "./OfficePictureEffectsMenu";
import type { OfficeShapeFormatPaneField, OfficeShapeFormatPaneSection } from "./OfficeShapeFormatPane";

const EMU_PER_PT = 12_700;
const ANGLE = 60_000;

export interface OfficeEffectsPaneLabels {
  /** The menu's own names for every preset and category. */
  readonly menu: OfficePictureEffectsMenuLabels;
  readonly presets: string;
  readonly custom: string;
  readonly color: string;
  readonly transparency: string;
  readonly size: string;
  readonly blur: string;
  readonly angle: string;
  readonly distance: string;
  readonly width: string;
  readonly height: string;
  readonly threeDFormat: string;
  readonly topBevel: string;
  readonly bottomBevel: string;
  /** Depth and Contour: their colour (Automatic: none stated) and size. */
  readonly depth: string;
  readonly contour: string;
  readonly automatic: string;
  readonly material: string;
  readonly materialName: (material: OfficeMaterialPreset) => string;
  readonly lighting: string;
  readonly lightingName: (rig: OfficeLightRig) => string;
  readonly xRotation: string;
  readonly yRotation: string;
  readonly zRotation: string;
  /** 3-D Rotation > Perspective (a perspective camera's field of view). */
  readonly perspective?: string;
  /** 3-D Rotation > Keep Text Flat (`a:flatTx`, a host whose shape has text). */
  readonly keepTextFlat?: string;
  /** 3-D Rotation > Distance from ground (`format3d.z`, `a:sp3d@z`). */
  readonly distanceFromGround?: string;
  readonly unitPt: string;
}

type Accent = (typeof OFFICE_GLOW_ACCENTS)[number];

export interface OfficeEffectsPaneArgs {
  readonly effects: unknown;
  readonly accentColors: Readonly<Record<Accent, string>>;
  readonly labels: OfficeEffectsPaneLabels;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly testIdPrefix: string;
  readonly onChange: <K extends OfficePictureEffectKind>(
    kind: K,
    value: OfficePictureEffectValues[K] | null,
  ) => void;
  /** 3-D Rotation > Keep Text Flat: the shape's words stay out of its 3-D
   * scene (its body's `a:flatTx`); a host whose shape holds words. */
  readonly keepTextFlat?: { readonly checked: boolean; readonly onChange: (checked: boolean) => void };
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A typed number, or null when it is not one in range. */
function typed(text: string, min: number, max: number): number | null {
  const value = Number.parseFloat(String(text).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(value) ? clamp(value, min, max) : null;
}

export function officeEffectsPaneSections(args: OfficeEffectsPaneArgs): OfficeShapeFormatPaneSection[] {
  const { labels, testIdPrefix: id } = args;
  const current = normalizeOfficePictureEffects(args.effects) ?? {};
  const gate = { disabled: args.disabled, disabledReason: args.disabledReason };
  const valueOf = <K extends OfficePictureEffectKind>(kind: K): OfficePictureEffectValues[K] | null => {
    const value = current[kind];
    return value && value !== "none" ? (value as OfficePictureEffectValues[K]) : null;
  };
  const number = (
    key: string,
    label: string,
    value: number,
    min: number,
    max: number,
    unit: string,
    commit: (value: number) => void,
    step = 1,
  ): OfficeShapeFormatPaneField => ({
    kind: "number",
    id: `${id}-${key}`,
    label,
    value: round(value, 1),
    min,
    max,
    step,
    unit,
    ...gate,
    onCommit: (text) => {
      const next = typed(text, min, max);
      if (next === null) return false;
      commit(next);
      return true;
    },
  });
  const presetSelect = <T,>(
    key: string,
    kind: OfficePictureEffectKind,
    entries: readonly { readonly value: string; readonly label: string; readonly effect: T }[],
    selected: unknown,
    pick: (effect: T | null) => void,
  ): OfficeShapeFormatPaneField => {
    const match = entries.find((entry) => sameOfficePictureEffect(selected, entry.effect));
    const value = selected ? (match?.value ?? "custom") : "none";
    return {
      kind: "select",
      id: `${id}-${key}-preset`,
      label: labels.presets,
      value,
      options: [
        { value: "none", label: labels.menu.none(kind) },
        ...entries.map(({ value: option, label }) => ({ value: option, label })),
        ...(value === "custom" ? [{ value: "custom", label: labels.custom, disabled: true }] : []),
      ],
      ...gate,
      onChange: (next) => {
        if (next === "none") pick(null);
        const entry = entries.find((candidate) => candidate.value === next);
        if (entry) pick(entry.effect);
      },
    };
  };

  // ---- Shadow ----------------------------------------------------------
  const shadowEntries = OFFICE_SHADOW_GALLERY.flatMap((group) =>
    group.variations.map((variation) => ({
      value: `${group.group}:${variation.id}`,
      label: `${labels.menu.shadowGroup(group.group)}: ${labels.menu.shadowVariation(group.group, variation.id)}`,
      effect: variation.value,
    })),
  );
  const shadow = valueOf("shadow");
  const shadowBase: OfficeShadowEffect = shadow ?? shadowEntries[0]!.effect;
  const setShadow = (patch: Partial<OfficeShadowEffect>) => args.onChange("shadow", { ...shadowBase, ...patch });
  const scale = (shadowBase.sx ?? 100_000) / 1000;
  const shadowFields: OfficeShapeFormatPaneField[] = [
    presetSelect("shadow", "shadow", shadowEntries, shadow, (effect) => args.onChange("shadow", effect)),
    {
      kind: "color",
      id: `${id}-shadow-color`,
      label: labels.color,
      value: shadowBase.color,
      ...gate,
      onChange: (color) => setShadow({ color }),
    },
    number("shadow-transparency", labels.transparency, 100 - shadowBase.alpha / 1000, 0, 100, "%", (value) =>
      setShadow({ alpha: Math.round((100 - value) * 1000) }),
    ),
    number("shadow-size", labels.size, scale, 1, 200, "%", (value) => {
      const factor = Math.round(value * 1000);
      setShadow({ sx: factor, sy: shadowBase.sy !== undefined && shadowBase.sy < 0 ? -factor : factor });
    }),
    number("shadow-blur", labels.blur, shadowBase.blurRad / EMU_PER_PT, 0, 100, labels.unitPt, (value) =>
      setShadow({ blurRad: Math.round(value * EMU_PER_PT) }),
    ),
    number("shadow-angle", labels.angle, shadowBase.dir / ANGLE, 0, 359, "°", (value) =>
      setShadow({ dir: Math.round(value * ANGLE) }),
    ),
    number("shadow-distance", labels.distance, shadowBase.dist / EMU_PER_PT, 0, 200, labels.unitPt, (value) =>
      setShadow({ dist: Math.round(value * EMU_PER_PT) }),
    ),
  ];

  // ---- Reflection ------------------------------------------------------
  const reflectionEntries = OFFICE_REFLECTION_VARIATIONS.map((variation) => ({
    value: variation.id,
    label: labels.menu.reflection(variation.id),
    effect: variation.value,
  }));
  const reflection = valueOf("reflection");
  const reflectionBase: OfficeReflectionEffect = reflection ?? reflectionEntries[0]!.effect;
  const setReflection = (patch: Partial<OfficeReflectionEffect>) =>
    args.onChange("reflection", { ...reflectionBase, ...patch });
  const reflectionFields: OfficeShapeFormatPaneField[] = [
    presetSelect("reflection", "reflection", reflectionEntries, reflection, (effect) => args.onChange("reflection", effect)),
    number("reflection-transparency", labels.transparency, 100 - reflectionBase.stA / 1000, 0, 100, "%", (value) =>
      setReflection({ stA: Math.round((100 - value) * 1000) }),
    ),
    number("reflection-size", labels.size, reflectionBase.endPos / 1000, 0, 100, "%", (value) =>
      setReflection({ endPos: Math.round(value * 1000) }),
    ),
    number("reflection-blur", labels.blur, reflectionBase.blurRad / EMU_PER_PT, 0, 100, labels.unitPt, (value) =>
      setReflection({ blurRad: Math.round(value * EMU_PER_PT) }),
    ),
    number("reflection-distance", labels.distance, reflectionBase.dist / EMU_PER_PT, 0, 100, labels.unitPt, (value) =>
      setReflection({ dist: Math.round(value * EMU_PER_PT) }),
    ),
  ];

  // ---- Glow ------------------------------------------------------------
  const glowEntries = OFFICE_GLOW_SIZES_PT.flatMap((sizePt) =>
    OFFICE_GLOW_ACCENTS.map((accent, index) => ({
      value: `${sizePt}:${accent}`,
      label: labels.menu.glow(sizePt, index + 1),
      effect: officeGlowVariation(sizePt, accent, args.accentColors[accent]),
    })),
  );
  const glow = valueOf("glow");
  const glowBase: OfficeGlowEffect = glow ?? glowEntries[0]!.effect;
  const setGlow = (patch: Partial<OfficeGlowEffect>) => {
    const next: OfficeGlowEffect = { ...glowBase, ...patch };
    // A typed colour is the colour itself, no longer the theme slot.
    if (patch.color) {
      const { themeColor: _theme, satMod: _satMod, ...plain } = next;
      args.onChange("glow", plain);
    } else {
      args.onChange("glow", next);
    }
  };
  const glowFields: OfficeShapeFormatPaneField[] = [
    presetSelect("glow", "glow", glowEntries, glow, (effect) => args.onChange("glow", effect)),
    {
      kind: "color",
      id: `${id}-glow-color`,
      label: labels.color,
      value: glowBase.color,
      ...gate,
      onChange: (color) => setGlow({ color }),
    },
    number("glow-size", labels.size, glowBase.radius / EMU_PER_PT, 0, 150, labels.unitPt, (value) =>
      setGlow({ radius: Math.round(value * EMU_PER_PT) }),
    ),
    number("glow-transparency", labels.transparency, 100 - glowBase.alpha / 1000, 0, 100, "%", (value) =>
      setGlow({ alpha: Math.round((100 - value) * 1000) }),
    ),
  ];

  // ---- Soft Edges --------------------------------------------------------
  const softEntries = OFFICE_SOFT_EDGE_SIZES_PT.map((sizePt) => ({
    value: String(sizePt),
    label: labels.menu.softEdge(sizePt),
    effect: officeSoftEdgeVariation(sizePt),
  }));
  const softEdge = valueOf("softEdge");
  const softFields: OfficeShapeFormatPaneField[] = [
    presetSelect("soft-edge", "softEdge", softEntries, softEdge, (effect) => args.onChange("softEdge", effect)),
    number("soft-edge-size", labels.size, (softEdge?.radius ?? 0) / EMU_PER_PT, 0, 100, labels.unitPt, (value) =>
      args.onChange("softEdge", value > 0 ? { radius: Math.round(value * EMU_PER_PT) } : null),
    ),
  ];

  // ---- 3-D Format (the top bevel) ----------------------------------------
  const bevelEntries = OFFICE_BEVEL_PRESETS.map((preset) => ({
    value: preset,
    label: labels.menu.bevel(preset),
    effect: officeBevelVariation(preset),
  }));
  const bevel = valueOf("bevel");
  const bevelFields: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: `${id}-bevel-top`,
      label: labels.topBevel,
      value: bevel?.preset ?? "none",
      options: [
        { value: "none", label: labels.menu.none("bevel") },
        ...bevelEntries.map(({ value, label }) => ({ value, label })),
      ],
      ...gate,
      onChange: (next) => {
        if (next === "none") args.onChange("bevel", null);
        else if ((OFFICE_BEVEL_PRESETS as readonly string[]).includes(next)) {
          const preset = next as OfficeBevelPreset;
          args.onChange("bevel", bevel ? { ...bevel, preset } : officeBevelVariation(preset));
        }
      },
    },
    number("bevel-width", labels.width, (bevel?.width ?? 0) / EMU_PER_PT, 0, 1584, labels.unitPt, (value) =>
      args.onChange("bevel", { ...(bevel ?? officeBevelVariation("circle")), width: Math.round(value * EMU_PER_PT) }),
    ),
    number("bevel-height", labels.height, (bevel?.height ?? 0) / EMU_PER_PT, 0, 1584, labels.unitPt, (value) =>
      args.onChange("bevel", { ...(bevel ?? officeBevelVariation("circle")), height: Math.round(value * EMU_PER_PT) }),
    ),
  ];

  // ---- 3-D Format beyond the top bevel: bottom bevel, depth, contour,
  // material, lighting (`format3d`; Office's defaults stated by nothing) ----
  const format3d: OfficeFormat3dEffect = valueOf("format3d") ?? {};
  const write3d = (patch: { [K in keyof OfficeFormat3dEffect]?: OfficeFormat3dEffect[K] | null }) => {
    const merged: Record<string, unknown> = { ...format3d, ...patch };
    for (const key of Object.keys(merged)) if (merged[key] == null) delete merged[key];
    const next = normalizeOfficeFormat3d(merged);
    if (!next) return;
    // Nothing left is no 3-D format ("none": the file's goes too).
    args.onChange("format3d", Object.keys(next).length ? next : null);
  };
  const bottom = format3d.bottom;
  const sized = (key: "depth" | "contour") => {
    const part = format3d[key];
    const amount = part ? (key === "depth" ? (part as { height: number }).height : (part as { width: number }).width) : 0;
    const color = part?.color;
    const write = (size: number, nextColor: string | undefined) =>
      write3d({
        [key]:
          size > 0
            ? { [key === "depth" ? "height" : "width"]: size, ...(nextColor ? { color: nextColor } : {}) }
            : null,
      } as Partial<OfficeFormat3dEffect>);
    return [
      {
        kind: "color",
        id: `${id}-${key}-color`,
        label: key === "depth" ? labels.depth : labels.contour,
        value: color ?? "none",
        fallback: key === "depth" ? "#7f7f7f" : "#ffffff",
        none: { label: labels.automatic, restore: key === "depth" ? "#7f7f7f" : "#ffffff", testId: `${id}-${key}-automatic` },
        ...gate,
        // A colour picked before a size gives it Office's 1 pt.
        onChange: (value: string) => write(amount || EMU_PER_PT, value === "none" ? undefined : value.toLowerCase()),
      },
      number(`${key}-size`, labels.size, amount / EMU_PER_PT, 0, 1584, labels.unitPt, (value) =>
        write(Math.round(value * EMU_PER_PT), color),
      ),
    ] satisfies OfficeShapeFormatPaneField[];
  };
  const materials = OFFICE_MATERIAL_PRESETS.filter(
    (material) => !material.startsWith("legacy") && material !== "translucentPowder" || material === format3d.material,
  );
  const lighting = format3d.lighting;
  const rigs = OFFICE_LIGHT_RIGS.filter((rig) => !rig.startsWith("legacy") || rig === lighting?.rig);
  bevelFields.push(
    {
      kind: "select",
      id: `${id}-bevel-bottom`,
      label: labels.bottomBevel,
      value: bottom?.preset ?? "none",
      options: [
        { value: "none", label: labels.menu.none("bevel") },
        ...bevelEntries.map(({ value, label }) => ({ value, label })),
      ],
      ...gate,
      onChange: (next) => {
        if (next === "none") write3d({ bottom: null });
        else if ((OFFICE_BEVEL_PRESETS as readonly string[]).includes(next)) {
          const preset = next as OfficeBevelPreset;
          write3d({ bottom: bottom ? { ...bottom, preset } : officeBevelVariation(preset) });
        }
      },
    },
    number("bevel-bottom-width", labels.width, (bottom?.width ?? 0) / EMU_PER_PT, 0, 1584, labels.unitPt, (value) =>
      write3d({ bottom: { ...(bottom ?? officeBevelVariation("circle")), width: Math.round(value * EMU_PER_PT) } }),
    ),
    number("bevel-bottom-height", labels.height, (bottom?.height ?? 0) / EMU_PER_PT, 0, 1584, labels.unitPt, (value) =>
      write3d({ bottom: { ...(bottom ?? officeBevelVariation("circle")), height: Math.round(value * EMU_PER_PT) } }),
    ),
    ...sized("depth"),
    ...sized("contour"),
    {
      kind: "select",
      id: `${id}-material`,
      label: labels.material,
      value: format3d.material ?? "warmMatte",
      options: materials.map((material) => ({ value: material, label: labels.materialName(material) })),
      ...gate,
      onChange: (next) => write3d({ material: next === "warmMatte" ? null : (next as OfficeMaterialPreset) }),
    },
    {
      kind: "select",
      id: `${id}-lighting`,
      label: labels.lighting,
      value: lighting?.rig ?? "threePt",
      options: rigs.map((rig) => ({ value: rig, label: labels.lightingName(rig) })),
      ...gate,
      onChange: (next) =>
        write3d({ lighting: { ...(lighting ?? {}), rig: next as OfficeLightRig } }),
    },
    number("lighting-angle", labels.angle, (lighting?.angle ?? 0) / ANGLE, 0, 359.9, "°", (value) =>
      write3d({
        lighting: {
          ...(lighting ?? { rig: "threePt" as const }),
          angle: Math.round((((value % 360) + 360) % 360) * ANGLE) % 21_600_000,
        },
      }),
      0.1,
    ),
  );

  // ---- 3-D Rotation --------------------------------------------------------
  const rotation = valueOf("rotation3d");
  const cameras = OFFICE_ROTATION_GALLERY.flatMap((section) =>
    section.cameras.map((camera) => ({ value: camera, label: labels.menu.camera(camera) })),
  );
  const rotationAngles = (() => {
    if (!rotation) return { x: 0, y: 0, z: 0 };
    if (typeof rotation.lon === "number") {
      return { x: rotation.lon / ANGLE, y: (rotation.lat ?? 0) / ANGLE, z: (rotation.rev ?? 0) / ANGLE };
    }
    // A preset states no angles of its own: the boxes show the preset's, as
    // PowerPoint's do (Isometric: Off Axis 2 Top read 0 / 0 / 0, and typing
    // one axis turned the picture away from the preset's other two).
    const [x, y, z] = OFFICE_CAMERA_ROTATIONS[rotation.camera] ?? [0, 0, 0];
    const shown = (value: number) => Math.round(((((value ?? 0) % 360) + 360) % 360) * 10) / 10 % 360;
    // The table's x is the turn the other way round from Office's X Rotation
    // (`officeCameraLonTurn`): Perspective: Left reads X 20, as in PowerPoint.
    return { x: shown(-x), y: shown(y), z: shown(z) };
  })();
  const setAngle = (axis: "x" | "y" | "z", degrees: number) => {
    const next = { ...rotationAngles, [axis]: degrees };
    const turn = (value: number) => Math.round((((value % 360) + 360) % 360) * ANGLE) % 21_600_000;
    args.onChange("rotation3d", {
      camera: rotation?.camera ?? "perspectiveFront",
      lon: turn(next.x),
      lat: turn(next.y),
      rev: turn(next.z),
      ...(typeof rotation?.fov === "number" ? { fov: rotation.fov } : {}),
    });
  };
  const rotationFields: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: `${id}-rotation-preset`,
      label: labels.presets,
      value: rotation?.camera ?? "none",
      options: [
        { value: "none", label: labels.menu.none("rotation3d") },
        ...cameras,
        // The front camera turned by its own X / Y / Z, which no preset names:
        // shown as the pane's Custom, its angles in the boxes below.
        ...(rotation && !cameras.some((camera) => camera.value === rotation.camera)
          ? [{ value: rotation.camera, label: labels.custom, disabled: true }]
          : []),
      ],
      ...gate,
      onChange: (next) => args.onChange("rotation3d", next === "none" ? null : { camera: next }),
    },
    number("rotation-x", labels.xRotation, rotationAngles.x, 0, 359.9, "°", (value) => setAngle("x", value), 0.1),
    number("rotation-y", labels.yRotation, rotationAngles.y, 0, 359.9, "°", (value) => setAngle("y", value), 0.1),
    number("rotation-z", labels.zRotation, rotationAngles.z, 0, 359.9, "°", (value) => setAngle("z", value), 0.1),
  ];
  // Perspective: the field of view of a perspective camera (PowerPoint
  // greys it out on the others), 0.1..120° as its pane takes it.
  if (labels.perspective && rotation?.camera.startsWith("perspective")) {
    rotationFields.push(
      number("rotation-perspective", labels.perspective, officeCameraFieldOfView(rotation), 0.1, 120, "°", (value) =>
        args.onChange("rotation3d", { ...rotation, fov: Math.round(value * ANGLE) }),
      0.1),
    );
  }
  if (labels.keepTextFlat && args.keepTextFlat) {
    const keep = args.keepTextFlat;
    rotationFields.push({
      kind: "checkbox",
      id: `${id}-rotation-keep-text-flat`,
      label: labels.keepTextFlat,
      checked: keep.checked,
      ...gate,
      onChange: (checked) => keep.onChange(checked),
    });
  }
  // Distance from ground: the shape off its ground along its own normal
  // (`a:sp3d@z`), -4000..4000 pt as PowerPoint's box takes it; it lives in
  // the 3-D Format the shape's `sp3d` states.
  if (labels.distanceFromGround) {
    rotationFields.push(
      number("rotation-distance", labels.distanceFromGround, (format3d.z ?? 0) / EMU_PER_PT, -4000, 4000, labels.unitPt, (value) =>
        write3d({ z: Math.round(value * EMU_PER_PT) || null }),
      0.1),
    );
  }

  return [
    { id: "effects-shadow", testId: `${id}-shadow`, title: labels.menu.category("shadow"), fields: shadowFields },
    { id: "effects-reflection", testId: `${id}-reflection`, title: labels.menu.category("reflection"), fields: reflectionFields },
    { id: "effects-glow", testId: `${id}-glow`, title: labels.menu.category("glow"), fields: glowFields },
    { id: "effects-soft-edge", testId: `${id}-soft-edge`, title: labels.menu.category("softEdge"), fields: softFields },
    { id: "effects-bevel", testId: `${id}-bevel`, title: labels.threeDFormat, fields: bevelFields },
    { id: "effects-rotation", testId: `${id}-rotation`, title: labels.menu.category("rotation3d"), fields: rotationFields },
  ];
}

/**
 * How much of the words' 3-D a host's Text Effects page edits:
 * - `full`: Format Text Effects as PowerPoint and Excel show it for text in a
 *   shape -- the whole 3-D Format (top and bottom bevels, depth, contour,
 *   material, lighting and its angle) and the whole 3-D Rotation (presets,
 *   X / Y / Z, Perspective, Keep text flat, Distance from ground); a host
 *   whose words carry Office's statement (`office-text-3d`);
 * - `format`: the whole 3-D Format and no 3-D Rotation, as Word shows it for
 *   the words of a document (its run's camera states a preset alone);
 * - `top`: the top bevel and the rotation preset, all a display paint holds.
 */
export type OfficeText3dReach = "full" | "format" | "top";

/**
 * Text Effects' sections for words (a WordArt paint, lib/office-text-effects):
 * the shared sections less what text does not hold -- Soft Edges always, and
 * what `threeD` (`OfficeText3dReach`) leaves out of 3-D Format and 3-D
 * Rotation.
 */
export function officeTextEffectsPaneSections(
  args: OfficeEffectsPaneArgs,
  options: { readonly threeD?: OfficeText3dReach } = {},
): OfficeShapeFormatPaneSection[] {
  const id = args.testIdPrefix;
  const reach = options.threeD ?? "top";
  const kept: Record<string, readonly string[] | null> = {
    "effects-shadow": null,
    "effects-reflection": null,
    "effects-glow": null,
    ...(reach === "top"
      ? {
          "effects-bevel": [`${id}-bevel-top`, `${id}-bevel-width`, `${id}-bevel-height`],
          "effects-rotation": [`${id}-rotation-preset`],
        }
      : reach === "format"
        ? { "effects-bevel": null }
        : { "effects-bevel": null, "effects-rotation": null }),
  };
  // Text Options > Text Effects > 3-D Rotation shows the shape's very
  // controls (PowerPoint, measured: Keep text flat and Distance from ground
  // under both tabs): the words' own ground (`a:sp3d@z` on their body) and
  // the one Keep text flat of the shape (`a:flatTx`, the host's
  // `keepTextFlat`). A host whose 3-D Rotation is the preset alone shows
  // neither.
  const shapeOnly = new Set(
    reach === "full" ? [] : [`${id}-rotation-distance`, `${id}-rotation-keep-text-flat`],
  );
  return officeEffectsPaneSections({ ...args, keepTextFlat: reach === "full" ? args.keepTextFlat : undefined })
    .filter((section) => section.id in kept)
    .map((section) => {
      const fields = kept[section.id];
      const own = section.fields.filter((field) => !shapeOnly.has(field.id));
      return fields ? { ...section, fields: own.filter((field) => fields.includes(field.id)) } : { ...section, fields: own };
    });
}

