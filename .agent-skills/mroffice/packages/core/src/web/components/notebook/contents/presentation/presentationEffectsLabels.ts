"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PowerPoint's Effects names (the Shape / Picture / Video Effects menus and
 * Format Shape > Effects share them), from the deck's catalogue.
 */

import type { useTranslations } from "../../../../../host/next-intl";

import type { OfficeEffectsPaneLabels } from "../../../office-ribbon/officeEffectsPaneSections";
import type { OfficePictureEffectsMenuLabels } from "../../../office-ribbon/OfficePictureEffectsMenu";
import type { OfficeBevelPreset, OfficeLightRig, OfficeMaterialPreset } from "../../../../lib/office-picture-effects";

type T = ReturnType<typeof useTranslations<"console-notebooks">>;

const softEdgeKey = (sizePt: number) =>
  `office.pictureEffects.softEdge.p${String(sizePt).replace(".", "_")}`;

export function presentationEffectsMenuLabels(t: T, button: string): OfficePictureEffectsMenuLabels {
  return {
    button,
    presets: t("office.shapeEffects.presets"),
    preset: (preset) => t("office.pictureEffects.preset", { number: preset }),
    noPresets: t("office.pictureEffects.noPresets"),
    threeDOptions: t("office.pictureEffects.threeDOptions"),
    optionsUnavailable: t("office.pictureEffects.optionsUnavailable"),
    threeDRotationOptions: t("office.pictureEffects.threeDRotationOptions"),
    effectOptions: (kind) =>
      t(`office.pictureEffects.options.${kind}` as "office.pictureEffects.options.glow"),
    category: (kind) =>
      kind === "rotation3d"
        ? t("office.shapeEffects.threeDRotation")
        : t(
            `toolbar.shapeFormatOption.effect.${kind}` as "toolbar.shapeFormatOption.effect.none",
          ),
    none: (kind) =>
      t(
        `office.shapeEffects.none.${kind === "rotation3d" ? "threeD" : kind}` as "office.shapeEffects.none.shadow",
      ),
    variations: (kind) =>
      t(
        `office.pictureEffects.variations.${kind}` as "office.pictureEffects.variations.glow",
      ),
    shadowGroup: (group) =>
      t(`office.shadowEffects.group.${group}` as "office.shadowEffects.group.outer"),
    shadowVariation: (group, id) =>
      t(`office.shadowEffects.${group}.${id}` as "office.shadowEffects.outer.bottomRight"),
    reflection: (id) =>
      t(
        `office.pictureEffects.reflection.${id}` as "office.pictureEffects.reflection.tightTouching",
      ),
    glow: (sizePt, accent) =>
      t("office.pictureEffects.glow", {
        size: sizePt,
        accent,
      }),
    softEdge: (sizePt) =>
      t(softEdgeKey(sizePt) as "office.pictureEffects.softEdge.p1"),
    bevel: (preset: OfficeBevelPreset) =>
      t(
        `office.pictureEffects.bevel.${preset}` as "office.pictureEffects.bevel.circle",
      ),
    rotationSection: (section) =>
      t(
        `office.pictureEffects.rotation.${section}` as "office.pictureEffects.rotation.parallel",
      ),
    camera: (camera) =>
      t(
        `office.pictureEffects.camera.${camera}` as "office.pictureEffects.camera.perspectiveFront",
      ),
  };
}

export function presentationEffectsPaneLabels(t: T): OfficeEffectsPaneLabels {
  return {
    menu: presentationEffectsMenuLabels(t, t("presentation.ui.shapeFormatPane.effects")),
    presets: t("office.shapeEffects.presets"),
    custom: t("office.effectsPane.custom"),
    color: t("presentation.textOptions.color"),
    transparency: t("presentation.textOptions.transparency"),
    size: t("presentation.textOptions.size"),
    blur: t("presentation.textOptions.blur"),
    angle: t("presentation.textOptions.angle"),
    distance: t("presentation.textOptions.distance"),
    width: t("presentation.textOptions.width"),
    height: t("presentation.textOptions.height"),
    threeDFormat: t("presentation.textOptions.threeDFormat"),
    topBevel: t("presentation.textOptions.topBevel"),
    bottomBevel: t("office.effectsPane.bottomBevel"),
    depth: t("presentation.textOptions.depth"),
    contour: t("office.effectsPane.contour"),
    automatic: t("office.effectsPane.automatic"),
    material: t("office.effectsPane.materialLabel"),
    materialName: (material: OfficeMaterialPreset) =>
      t(`office.effectsPane.materials.${material}` as "office.effectsPane.materials.matte"),
    lighting: t("office.effectsPane.lightingLabel"),
    lightingName: (rig: OfficeLightRig) =>
      t(`office.effectsPane.lightings.${rig}` as "office.effectsPane.lightings.threePt"),
    xRotation: t("office.chartElements.xRotation"),
    yRotation: t("office.chartElements.yRotation"),
    zRotation: t("office.effectsPane.zRotation"),
    perspective: t("office.chartElements.perspective"),
    keepTextFlat: t("office.effectsPane.keepTextFlat"),
    distanceFromGround: t("office.effectsPane.distanceFromGround"),
    unitPt: t("presentation.pointsShort"),
  };
}
