/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Shape > Effects of a slide's shape or text box (a text box is a
 * shape, and PowerPoint gives it the same page): Shadow, Reflection, Glow,
 * Soft Edges, 3-D Format and 3-D Rotation (with Keep text flat on an object
 * holding words), over the object's one combinable model (`shapeEffects`,
 * `lib/presentation-shape-effects`). One builder for both panes.
 */

import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type {
  PresentationShapeBlock,
  PresentationTextBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { OfficeShapeFormatPaneSection } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { officeEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import { officeGroupCameraRotation, officeGroupCameraScene, type OfficeGroupCameraControl } from "@mrnote/core/web/lib/office-group-camera.ts";
import { smartArtNodeWearsStyleBevel } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { presentationShapeEffectPatch, presentationShapeEffects } from "../../../../lib/presentation-shape-effects";

import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";

type EffectsFields = Pick<PresentationShapeBlock, "shapeEffects" | "shadow" | "shapeShadow" | "effect">;

/** The fields one Effects page edit writes on an object of either kind. */
export type PresentationShapeEffectsPanePatch = Partial<
  Pick<PresentationShapeBlock, "shapeEffects" | "shadow" | "shapeShadow" | "effect" | "keepTextFlat">
>;

export function presentationShapeEffectsPaneSections<B extends PresentationShapeBlock | PresentationTextBlock>(args: {
  readonly block: B;
  readonly themeAccentColors: readonly string[];
  readonly t: ReturnType<typeof useTranslations<"console-notebooks">>;
  readonly disabled: boolean;
  /** Writes one change on the object (or on every selected one, each from its own state). */
  readonly update: (patchOf: (target: B) => PresentationShapeEffectsPanePatch | null) => boolean;
  /** The object holds words: 3-D Rotation offers Keep text flat (its body's `a:flatTx`). */
  readonly holdsWords: boolean;
  /**
   * The object is in a group with a 3-D Rotation (or is the whole group
   * selected): 3-D Rotation is the GROUP's camera, written on the group
   * (`grpSpPr/a:scene3d`); the object's own is not drawn under it.
   */
  readonly groupCamera?: OfficeGroupCameraControl;
}): OfficeShapeFormatPaneSection[] {
  const { block, themeAccentColors, t, update } = args;
  const accents = {
    accent1: themeAccentColors[0] ?? "#4472c4",
    accent2: themeAccentColors[1] ?? "#ed7d31",
    accent3: themeAccentColors[2] ?? "#a5a5a5",
    accent4: themeAccentColors[3] ?? "#ffc000",
    accent5: themeAccentColors[4] ?? "#5b9bd5",
    accent6: themeAccentColors[5] ?? "#70ad47",
  };
  const fields = (target: B) => target as unknown as EffectsFields;
  const groupCamera = args.groupCamera;
  const own = presentationShapeEffects(fields(block), accents.accent1);
  return officeEffectsPaneSections({
    effects: groupCamera
      ? { ...own, rotation3d: officeGroupCameraRotation(groupCamera.scene3d) }
      : own,
    accentColors: accents,
    labels: presentationEffectsPaneLabels(t),
    disabled: args.disabled,
    testIdPrefix: "effects",
    // A SmartArt shape's No Bevel over its style's bevel states it "none"
    // (`smartArtNodeWearsStyleBevel`), as the Shape Effects menu does.
    onChange: (kind, value) =>
      kind === "rotation3d" && groupCamera
        ? groupCamera.write(
            officeGroupCameraScene(value as Parameters<typeof officeGroupCameraScene>[0], groupCamera.scene3d),
          )
        : update((target) =>
        presentationShapeEffectPatch(
          fields(target),
          kind,
          value,
          accents.accent1,
          kind === "bevel" && value === null && smartArtNodeWearsStyleBevel(target),
        ),
      ),
    // 3-D Rotation > Keep text flat: checked states it, unchecked takes the
    // field off.
    ...(args.holdsWords
      ? {
          keepTextFlat: {
            checked: block.keepTextFlat === true,
            onChange: (checked: boolean) =>
              update((target) =>
                // (An object of the other kind among several selected keeps its own.)
                target.type !== block.type || (target.keepTextFlat === true) === checked
                  ? null
                  : { keepTextFlat: checked ? true : undefined },
              ),
          },
        }
      : {}),
  });
}
