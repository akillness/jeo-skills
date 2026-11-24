/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { CSS_PX_PER_POINT } from "@mrnote/core/web/lib/presentation/text-units.ts";
import { officeTextEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import { officeTextPaintOfficeEffects, withOfficeTextEffect } from "@mrnote/core/web/lib/office-text-effects.ts";
import { presentationTextFrameWithKeepTextFlat } from "../../../../lib/presentation-shape-effects";
import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";
import type {
  OfficeShapeFormatPaneField,
  OfficeShapeFormatPaneTab,
} from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import {
  patchOfficeTextPaint,
  patchOfficeTextPaintParts,
  type OfficeTextPaint,
  type OfficeTextShadow,
} from "@mrnote/core/web/lib/office-text-paint.ts";
import {
  formatPresentationMeasurement,
  parsePresentationMeasurement,
  presentationMeasurementStep,
  type PresentationMeasurementUnit,
} from "@mrnote/core/web/lib/presentation-measurement.ts";
import {
  PRESENTATION_TEXT_FRAME_ANCHORS,
  PRESENTATION_TEXT_FRAME_DIRECTIONS,
  presentationTextFrameInsetsWritable,
  presentationTextFrameOptions,
  presentationTextFrameTakesAnchorCenter,
  presentationTextFrameWithAnchor,
  presentationTextFrameWithAutofit,
  presentationTextFrameWithDirection,
  presentationTextFrameWithInset,
  presentationTextFrameWithWrap,
  type PresentationTextFrameAnchor,
  type PresentationTextFrameBlock,
} from "../../../../lib/presentation-text-frame-options";
import { PRESENTATION_TEXT_INSET_EDGES } from "../../../../lib/presentation-text-insets";
import { isSmartArtGraphicShape } from "../../../../lib/presentation-smartart-shape-selection";
import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { WritingMode } from "@mrnote/core/web/lib/presentation-line-spacing.ts";

/**
 * Format Shape ▸ Text Options on the deck (PPT-A050): PowerPoint's second
 * set of pages in the one Format Shape pane, for a text box or a shape's
 * words -- Text Fill & Outline, Text Effects and Text Box (Microsoft
 * Support, "Format Shape pane"; the Mac pane's strings, `strman_f401` /
 * `strman_99a0`).
 *
 * The words' paint is the SHARED `OfficeTextPaint` the ribbon's WordArt
 * Styles write (`patchOfficeTextPaint` for fill and outline, the parts patch
 * for one effect at a time); the Text Box page writes the frame through
 * `presentation-text-frame-options`. A setting the deck cannot draw or save
 * (Do not rotate text, Resize shape to fit text, Soft Edges on text, 3-D
 * Rotation of text) is listed greyed with its reason, never dropped.
 *
 * Lengths: the margins in the system unit (centimetres, inches for en-US),
 * as PowerPoint shows them; effect sizes in points. The paint stores CSS px.
 */

/** The deck's message lookup for the keys this tab uses. */
/** The host's translator: the values fill a label's placeholders (Glow's
 * "{size} point; Accent color {accent}"). */
export type PresentationTextOptionsTranslate = (key: string, values?: Record<string, string | number>) => string;

export interface PresentationTextOptionsInput {
  readonly block: PresentationTextFrameBlock;
  readonly t: PresentationTextOptionsTranslate;
  readonly unit: PresentationMeasurementUnit;
  readonly unitLabel: string;
  /** What the words draw in when they wear no WordArt paint. */
  readonly textColor: string;
  /** Why the words cannot take a paint now (a text box with no words), or undefined. */
  readonly paintReason?: string;
  /**
   * The WordArt paint the characters the pane acts on wear (null: none), or
   * undefined to read the block's own. While the words are typed in these
   * are the selected ones.
   */
  readonly paint?: OfficeTextPaint | null;
  /** Edit the paint of each run the pane acts on: a run wearing none comes
   * as one in its own colour. */
  readonly editPaint: (edit: (paint: OfficeTextPaint) => OfficeTextPaint | null) => void;
  /** Commit the block a frame writer returns (null: nothing to commit). */
  readonly commitFrame: (
    transform: (block: PresentationTextFrameBlock) => PresentationTextFrameBlock | null,
  ) => void;
  /** Columns...: the Columns dialog for this block. */
  readonly openColumns: () => void;
}

/** CSS px (the paint's unit) <-> points, the pane's unit for effect sizes. */
const PX_PER_PT = CSS_PX_PER_POINT;
const pxToPt = (px: number) => Math.round((px / PX_PER_PT) * 10) / 10;
const ptToPx = (pt: number) => Math.round(pt * PX_PER_PT * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const parseNumber = (raw: string): number | null => {
  const value = Number(raw.trim().replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
};

/** PowerPoint's Outer shadow preset: offset bottom right, 4 pt blur. */
const OUTER_SHADOW: OfficeTextShadow = { color: "#000000", blur: 3, offsetX: 2, offsetY: 2, opacity: 0.4 };
/** PowerPoint's Inner shadow preset: offset top left, the glyphs pressed in. */
const INNER_SHADOW: OfficeTextShadow = { color: "#000000", blur: 5, offsetX: 3, offsetY: 3, opacity: 0.5 };
const REFLECTION = { opacity: 0.35, blur: 0, distance: 1 } as const;
const GLOW = { color: "#5b9bd5", radius: 5, opacity: 0.6 } as const;

function shadowAngle(shadow: OfficeTextShadow): number {
  return Math.round(((Math.atan2(shadow.offsetY, shadow.offsetX) * 180) / Math.PI + 360) % 360);
}
function shadowDistance(shadow: OfficeTextShadow): number {
  return Math.hypot(shadow.offsetX, shadow.offsetY);
}
function shadowAt(shadow: OfficeTextShadow, angle: number, distancePx: number): OfficeTextShadow {
  const radians = (angle * Math.PI) / 180;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    ...shadow,
    offsetX: clamp(round(Math.cos(radians) * distancePx), -64, 64),
    offsetY: clamp(round(Math.sin(radians) * distancePx), -64, 64),
  };
}

export function presentationTextOptionsTab(input: PresentationTextOptionsInput): OfficeShapeFormatPaneTab {
  const { block, t } = input;
  const paintReason = input.paintReason;
  const paint: OfficeTextPaint | null =
    input.paint !== undefined
      ? input.paint
      : (((block as { textPaint?: OfficeTextPaint }).textPaint as OfficeTextPaint | undefined) ?? null);
  const base: OfficeTextPaint = paint ?? { fill: input.textColor, outline: "none", outlineWidthPt: 0 };
  // Every write edits each run's own paint: a selection whose characters
  // wear different WordArt keeps each one's other parts.
  const writeParts = (parts: Parameters<typeof patchOfficeTextPaintParts>[1]) =>
    input.editPaint((own) => patchOfficeTextPaintParts(own, parts));
  const disabledPaint = Boolean(paintReason);
  const fillType = base.fillGradient ? "gradient" : base.fill === "none" ? "none" : "solid";
  const outlineOn = base.outline !== "none";

  const fillOutline: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: "text-fill-type",
      label: t("presentation.textOptions.textFill"),
      value: fillType,
      options: [
        { value: "none", label: t("presentation.textOptions.noFill") },
        { value: "solid", label: t("presentation.textOptions.solidFill") },
        {
          value: "gradient",
          label: t("presentation.textOptions.gradientFill"),
          disabled: fillType !== "gradient",
          title: t("presentation.textOptions.gradientFromWordArt"),
        },
      ],
      disabled: disabledPaint,
      disabledReason: paintReason,
      onChange: (value) => {
        if (value === fillType || value === "gradient") return;
        input.editPaint((own) =>
          patchOfficeTextPaint(own, {
            fill: value === "none" ? "none" : own.fill === "none" ? input.textColor : own.fill,
          }),
        );
      },
    },
    {
      kind: "color",
      id: "text-fill-color",
      label: t("presentation.textOptions.color"),
      value: base.fill === "none" ? "none" : base.fill,
      fallback: input.textColor,
      disabled: disabledPaint || fillType === "gradient",
      disabledReason: paintReason ?? t("presentation.textOptions.gradientFromWordArt"),
      onChange: (color) => {
        if (color !== "none") input.editPaint((own) => patchOfficeTextPaint(own, { fill: color }));
      },
    },
    {
      kind: "select",
      id: "text-outline-type",
      label: t("presentation.textOptions.textOutline"),
      value: outlineOn ? "solid" : "none",
      options: [
        { value: "none", label: t("presentation.textOptions.noLine") },
        { value: "solid", label: t("presentation.textOptions.solidLine") },
      ],
      disabled: disabledPaint,
      disabledReason: paintReason,
      onChange: (value) => {
        if ((value === "solid") === outlineOn) return;
        input.editPaint((own) =>
          patchOfficeTextPaint(own, { outline: value === "solid" ? "#000000" : "none" }),
        );
      },
    },
    {
      kind: "color",
      id: "text-outline-color",
      label: t("presentation.textOptions.color"),
      value: outlineOn ? base.outline : "none",
      fallback: "#000000",
      disabled: disabledPaint || !outlineOn,
      disabledReason: paintReason,
      onChange: (color) => {
        if (color !== "none") input.editPaint((own) => patchOfficeTextPaint(own, { outline: color }));
      },
    },
    {
      kind: "number",
      id: "text-outline-width",
      label: t("presentation.textOptions.width"),
      value: outlineOn ? base.outlineWidthPt : 0,
      min: 0,
      max: 12,
      step: 0.25,
      unit: t("presentation.home.pointsUnit"),
      disabled: disabledPaint || !outlineOn,
      disabledReason: paintReason,
      onCommit: (raw) => {
        const value = parseNumber(raw);
        if (value === null) return false;
        input.editPaint((own) =>
          patchOfficeTextPaint(own, { outlineWidthPt: clamp(Math.round(value * 4) / 4, 0, 12) }),
        );
        return true;
      },
    },
  ];

  const shadowKind = base.innerShadow ? "inner" : base.shadow ? "outer" : "none";
  const shadow = base.innerShadow ?? base.shadow;
  const writeShadow = (next: OfficeTextShadow) =>
    writeParts(shadowKind === "inner" ? { innerShadow: next } : { shadow: next });
  const numberField = (
    id: string,
    labelKey: string,
    value: number,
    unit: string,
    range: [number, number],
    write: (value: number) => void,
    disabled: boolean,
  ): OfficeShapeFormatPaneField => ({
    kind: "number",
    id,
    label: t(labelKey),
    value,
    min: range[0],
    max: range[1],
    step: 1,
    unit,
    disabled: disabledPaint || disabled,
    disabledReason: paintReason,
    onCommit: (raw) => {
      const parsed = parseNumber(raw);
      if (parsed === null) return false;
      write(clamp(parsed, range[0], range[1]));
      return true;
    },
  });
  const pt = t("presentation.home.pointsUnit");
  // Text Effects' shared fields over the words' paint (the deck's and the
  // sheet's panes and the ribbon's menu read and write the same way).
  const shared = officeTextEffectsPaneSections({
    effects: officeTextPaintOfficeEffects(base),
    accentColors: { accent1: "#4472c4", accent2: "#ed7d31", accent3: "#a5a5a5", accent4: "#ffc000", accent5: "#5b9bd5", accent6: "#70ad47" },
    labels: presentationEffectsPaneLabels(t as unknown as Parameters<typeof presentationEffectsPaneLabels>[0]),
    disabled: disabledPaint,
    disabledReason: paintReason,
    testIdPrefix: "text-effects",
    onChange: (kind, value) => input.editPaint((own) => withOfficeTextEffect(own, kind, value)),
    // 3-D Rotation > Keep text flat: the shape's own field (`keepTextFlat`,
    // the body's `a:flatTx`), which Shape Options' Effects sets too.
    keepTextFlat: {
      checked: block.keepTextFlat === true,
      onChange: (checked) =>
        input.commitFrame((target) => presentationTextFrameWithKeepTextFlat(target, checked)),
    },
  }, { threeD: "full" });
  /** A shared section's fields, its first one under `label`. */
  const sharedSection = (section: string, label: string): OfficeShapeFormatPaneField[] =>
    (shared.find((entry) => entry.id === section)?.fields ?? []).map((field, index) =>
      (index === 0 ? { ...field, label } : field) as OfficeShapeFormatPaneField,
    );
  const effects: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: "text-shadow",
      label: t("presentation.textOptions.shadow"),
      value: shadowKind,
      options: [
        { value: "none", label: t("presentation.textOptions.noShadow") },
        { value: "outer", label: t("presentation.textOptions.outer") },
        { value: "inner", label: t("presentation.textOptions.inner") },
      ],
      disabled: disabledPaint,
      disabledReason: paintReason,
      onChange: (value) =>
        writeParts({
          shadow: value === "outer" ? OUTER_SHADOW : null,
          innerShadow: value === "inner" ? INNER_SHADOW : null,
        }),
    },
    {
      kind: "color",
      id: "text-shadow-color",
      label: t("presentation.textOptions.color"),
      value: shadow?.color ?? "none",
      fallback: "#000000",
      disabled: disabledPaint || !shadow,
      disabledReason: paintReason,
      onChange: (color) => {
        if (shadow && color !== "none") writeShadow({ ...shadow, color });
      },
    },
    numberField(
      "text-shadow-transparency",
      "presentation.textOptions.transparency",
      shadow ? Math.round((1 - shadow.opacity) * 100) : 0,
      "%",
      [0, 100],
      (value) => shadow && writeShadow({ ...shadow, opacity: Math.round(100 - value) / 100 }),
      !shadow,
    ),
    numberField(
      "text-shadow-blur",
      "presentation.textOptions.blur",
      shadow ? pxToPt(shadow.blur) : 0,
      pt,
      [0, 48],
      (value) => shadow && writeShadow({ ...shadow, blur: clamp(ptToPx(value), 0, 64) }),
      !shadow,
    ),
    numberField(
      "text-shadow-angle",
      "presentation.textOptions.angle",
      shadow ? shadowAngle(shadow) : 0,
      "°",
      [0, 359],
      (value) => shadow && writeShadow(shadowAt(shadow, value, shadowDistance(shadow))),
      !shadow,
    ),
    numberField(
      "text-shadow-distance",
      "presentation.textOptions.distance",
      shadow ? pxToPt(shadowDistance(shadow)) : 0,
      pt,
      [0, 48],
      (value) => shadow && writeShadow(shadowAt(shadow, shadowAngle(shadow), ptToPx(value))),
      !shadow,
    ),
    {
      kind: "select",
      id: "text-reflection",
      label: t("presentation.textOptions.reflection"),
      value: base.reflection ? "on" : "none",
      options: [
        { value: "none", label: t("presentation.textOptions.none") },
        { value: "on", label: t("presentation.textOptions.reflection") },
      ],
      disabled: disabledPaint,
      disabledReason: paintReason,
      onChange: (value) => writeParts({ reflection: value === "on" ? { ...REFLECTION } : null }),
    },
    numberField(
      "text-reflection-transparency",
      "presentation.textOptions.transparency",
      base.reflection ? Math.round((1 - base.reflection.opacity) * 100) : 0,
      "%",
      [0, 100],
      (value) =>
        base.reflection &&
        writeParts({ reflection: { ...base.reflection, opacity: Math.round(100 - value) / 100 } }),
      !base.reflection,
    ),
    numberField(
      "text-reflection-distance",
      "presentation.textOptions.distance",
      base.reflection ? pxToPt(base.reflection.distance) : 0,
      pt,
      [0, 24],
      (value) =>
        base.reflection &&
        writeParts({ reflection: { ...base.reflection, distance: clamp(ptToPx(value), 0, 32) } }),
      !base.reflection,
    ),
    {
      kind: "select",
      id: "text-glow",
      label: t("presentation.textOptions.glow"),
      value: base.glow ? "on" : "none",
      options: [
        { value: "none", label: t("presentation.textOptions.none") },
        { value: "on", label: t("presentation.textOptions.glow") },
      ],
      disabled: disabledPaint,
      disabledReason: paintReason,
      onChange: (value) => writeParts({ glow: value === "on" ? { ...GLOW } : null }),
    },
    {
      kind: "color",
      id: "text-glow-color",
      label: t("presentation.textOptions.color"),
      value: base.glow?.color ?? "none",
      fallback: GLOW.color,
      disabled: disabledPaint || !base.glow,
      disabledReason: paintReason,
      onChange: (color) => {
        if (base.glow && color !== "none") writeParts({ glow: { ...base.glow, color } });
      },
    },
    numberField(
      "text-glow-size",
      "presentation.textOptions.size",
      base.glow ? pxToPt(base.glow.radius) : 0,
      pt,
      [0, 24],
      (value) => base.glow && writeParts({ glow: { ...base.glow, radius: clamp(ptToPx(value), 0, 32) } }),
      !base.glow,
    ),
    numberField(
      "text-glow-transparency",
      "presentation.textOptions.transparency",
      base.glow ? Math.round((1 - base.glow.opacity) * 100) : 0,
      "%",
      [0, 100],
      (value) => base.glow && writeParts({ glow: { ...base.glow, opacity: Math.round(100 - value) / 100 } }),
      !base.glow,
    ),
    {
      kind: "checkbox",
      id: "text-soft-edges",
      label: t("presentation.textOptions.softEdges"),
      checked: false,
      disabled: true,
      disabledReason: t("presentation.textOptions.softEdgesNotForText"),
      onChange: () => undefined,
    },
    // 3-D Format and 3-D Rotation, whole, as Format Text Effects shows them
    // for a shape's words (the shared fields over Office's statement of the
    // words' 3-D, `office-text-3d`): top and bottom bevels, depth, contour,
    // material, lighting and its angle; presets, X / Y / Z, Perspective.
    ...sharedSection("effects-bevel", `${t("presentation.textOptions.threeDFormat")} · ${t("presentation.textOptions.topBevel")}`),
    ...sharedSection("effects-rotation", t("presentation.textOptions.threeDRotation")),
  ];

  const frame = presentationTextFrameOptions(block);
  const centeredOk = presentationTextFrameTakesAnchorCenter(block);
  const anchorLabel: Record<PresentationTextFrameAnchor, string> = {
    top: t("presentation.valign.top"),
    middle: t("presentation.valign.middle"),
    bottom: t("presentation.valign.bottom"),
    "top-centered": t("presentation.textOptions.topCentered"),
    "middle-centered": t("presentation.textOptions.middleCentered"),
    "bottom-centered": t("presentation.textOptions.bottomCentered"),
  };
  const directionLabel: Record<WritingMode, string> = {
    "horizontal-tb": t("presentation.writingMode.horizontal"),
    "vertical-rl": t("presentation.writingMode.vertical"),
    rot90: t("presentation.home.textDirectionRotate90"),
    rot270: t("presentation.home.textDirectionRotate270"),
    stacked: t("presentation.home.textDirectionStacked"),
  };
  const insetsWritable = presentationTextFrameInsetsWritable(block);
  const marginLabel = {
    left: "presentation.textOptions.leftMargin",
    right: "presentation.textOptions.rightMargin",
    top: "presentation.textOptions.topMargin",
    bottom: "presentation.textOptions.bottomMargin",
  } as const;
  const textBox: OfficeShapeFormatPaneField[] = [
    {
      kind: "select",
      id: "text-vertical-alignment",
      label: t("presentation.textOptions.verticalAlignment"),
      value: frame.anchor,
      options: PRESENTATION_TEXT_FRAME_ANCHORS.map((anchor) => ({
        value: anchor,
        label: anchorLabel[anchor],
        disabled: anchor.endsWith("-centered") && !centeredOk,
        title: anchor.endsWith("-centered") && !centeredOk
          ? t("presentation.textOptions.centeredShapeUnavailable")
          : undefined,
      })),
      onChange: (value) =>
        input.commitFrame((current) =>
          presentationTextFrameWithAnchor(current, value as PresentationTextFrameAnchor),
        ),
    },
    {
      kind: "select",
      id: "text-direction",
      label: t("presentation.textOptions.textDirection"),
      value: frame.direction,
      options: PRESENTATION_TEXT_FRAME_DIRECTIONS.map((direction) => ({
        value: direction,
        label: directionLabel[direction],
      })),
      onChange: (value) =>
        input.commitFrame((current) => presentationTextFrameWithDirection(current, value as WritingMode)),
    },
    {
      kind: "checkbox",
      id: "text-do-not-rotate",
      label: t("presentation.textOptions.doNotRotate"),
      checked: false,
      disabled: true,
      disabledReason: t("presentation.textOptions.doNotRotateUnavailable"),
      onChange: () => undefined,
    },
    {
      kind: "select",
      id: "text-autofit",
      label: t("presentation.textOptions.autofit"),
      value: frame.autofit,
      // A SmartArt graphic's shape takes no Autofit value (office-truth probe
      // smartart-member-edits: TextFrame2.AutoSize 0/1/2 "out of range").
      ...(isSmartArtGraphicShape(input.block as unknown as PresentationBlock)
        ? { disabled: true, disabledReason: t("presentation.textOptions.autofitSmartArtShape") }
        : {}),
      options: [
        { value: "none", label: t("presentation.textOptions.doNotAutofit") },
        { value: "shrink", label: t("presentation.textOptions.shrinkOnOverflow") },
        // A text box's frame follows its words (`presentation-text-fit`); a
        // shape's label is not measured yet, so a shape keeps the two.
        input.block.type === "text"
          ? { value: "resize-shape", label: t("presentation.textOptions.resizeShapeToFit") }
          : {
              value: "resize-shape",
              label: t("presentation.textOptions.resizeShapeToFit"),
              disabled: true,
              title: t("presentation.textOptions.resizeShapeUnavailable"),
            },
      ],
      onChange: (value) => {
        if (value !== "none" && value !== "shrink" && value !== "resize-shape") return;
        if (value === "resize-shape" && input.block.type !== "text") return;
        input.commitFrame((current) => presentationTextFrameWithAutofit(current, value));
      },
    },
    ...PRESENTATION_TEXT_INSET_EDGES.map(
      (edge): OfficeShapeFormatPaneField => ({
        kind: "number",
        id: `text-margin-${edge}`,
        label: t(marginLabel[edge]),
        value: formatPresentationMeasurement(frame.insets[edge], input.unit),
        min: 0,
        step: presentationMeasurementStep(input.unit),
        unit: input.unitLabel,
        disabled: !insetsWritable,
        disabledReason: t("presentation.textOptions.marginsInherited"),
        onCommit: (raw) => {
          const emu = parsePresentationMeasurement(raw, input.unit);
          if (emu === null) return false;
          input.commitFrame((current) =>
            presentationTextFrameWithInset(current, edge, Math.round(emu)),
          );
          return true;
        },
      }),
    ),
    {
      kind: "checkbox",
      id: "text-wrap",
      label: t("presentation.textOptions.wrapTextInShape"),
      checked: frame.wrap,
      onChange: (checked) => input.commitFrame((current) => presentationTextFrameWithWrap(current, checked)),
    },
    {
      kind: "buttons",
      id: "text-columns",
      label: t("presentation.textOptions.columns"),
      buttons: [
        {
          id: "open",
          label: t("presentation.textOptions.columns"),
          onSelect: input.openColumns,
        },
      ],
    },
  ];

  return {
    id: "text",
    label: t("presentation.ui.shapeFormatPane.textOptions"),
    sections: [
      { id: "text-fill-outline", title: t("presentation.textOptions.fillOutline"), fields: fillOutline },
      { id: "text-effects", title: t("presentation.textOptions.effects"), fields: effects },
      { id: "text-box", title: t("presentation.textOptions.textBox"), fields: textBox },
    ],
  };
}
