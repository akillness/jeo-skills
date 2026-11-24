"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import {
  IMAGE_BORDER_STYLES,
  MAX_IMAGE_CROP_PERCENT,
  normalizeImageBorderColor,
  normalizeImageBorderStyle,
  normalizeImageBorderWidth,
  normalizeImageCropPercent,
  normalizeImagePictureStyle,
  normalizeImageRotation,
  imagePictureStyleHasOutline,
  officePictureStyleOutlineWidthPt,
  type ImageBorderStyle,
} from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";
import {
  IMAGE_ADJUST_MAX,
  IMAGE_SATURATION_MAX,
  IMAGE_SATURATION_MIN,
  NATIVE_IMAGE_RECOLOR_MODES,
  imageCorrectionDeltaFromStored,
  imageCorrectionStoredFromDelta,
  imageOpacityFromTransparency,
  imageTransparencyFromOpacity,
  isNativeImageRecolorMode,
  normalizeImageOpacity,
  normalizeImageSaturation,
} from "@mrnote/core/web/lib/presentation-image-effects.ts";
import {
  OFFICE_PICTURE_STYLE_CATALOG,
  officePictureStyleLabelKey,
  type OfficePictureStyleId,
} from "@mrnote/core/web/lib/office-picture-styles/catalog.ts";
import {
  OFFICE_ARTISTIC_EFFECT_IDS,
  normalizeOfficeArtisticEffect,
  officeArtisticEffectDrawable,
  officeArtisticEffectLabelKey,
} from "@mrnote/core/web/lib/office-artistic-effects.ts";
import {
  OfficeTaskPaneDockedTitle,
  useOfficeTaskPaneChrome,
} from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { officeShapeFormatPaneStyles as shared } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import styles from "@mrnote/core/web/components/console/editor/native-document/DocumentShapeFormatPane.module.css";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import {
  OfficeShapeFormatPaneSections,
  revealOfficeShapeFormatPaneSection,
} from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { officeEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";
import { withOfficePictureEffect } from "@mrnote/core/web/lib/office-picture-effects.ts";
import {
  PICTURE_LOOK_EFFECT_KINDS,
  PICTURE_THREE_D_KINDS,
  normalizePicture3d,
  picture3dBlocker,
  pictureLookEffectAttrs,
  pictureLookEffects,
  pictureLookEffectsBlocker,
  pictureShadowBlocker,
  pictureShadowEffect,
  pictureShadowEffectAttrs,
  type PictureLookEffectKind,
} from "./pictureEffects";
import { documentPictureStylePatch } from "./DocumentPictureStyleGallery";
import {
  documentImageCropFrameSize,
  documentImageCropSourceSize,
} from "./documentImageCrop";

/**
 * Word's Format Picture pane (Picture Format > Picture Styles launcher;
 * Microsoft Support, "Format Picture pane"), four section tabs in Word's
 * order, each driving the picture attributes MRAI already writes to and reads
 * from DOCX (`pic:spPr` line, `a:blip` effects, `a:srcRect`, `a:xfrm/@rot`,
 * `wp:docPr/@descr`), through the same undoable node write as the ribbon:
 *
 *   Fill & Line  Line: No line / Solid line, Color, Width, Dash type
 *                (`pictureBorder*`; over a Picture Style it replaces only
 *                the style's outline, No line is the style's No Outline).
 *                A picture's own Fill (behind transparent pixels), gradient
 *                lines, compound / cap / join types are not in the picture
 *                model and are not offered.
 *   Effects      Shadow, Reflection, Glow, Soft Edges, 3-D Format and 3-D
 *                Rotation are Office's own sections (reading rows 544, 545,
 *                547) over the picture's own effects; they also reach a
 *                picture as one of Office's 28 Picture Styles, each a complete
 *                `pic:spPr` recipe (`pictureStyle`) that round-trips through
 *                both save paths; per-effect parameters have no carrier in
 *                the picture model and are not offered. Artistic Effects is
 *                the ribbon's shared gallery (`artisticEffect`, the
 *                `a14:imgEffect` layer): the five effects MRAI cannot draw
 *                are listed disabled, and a picture whose effect came from
 *                the Word file (already rendered) is not re-effected.
 *   Layout & Properties
 *                Alt Text (description, `wp:docPr/@descr`) and MRAI's
 *                Rotation box (Word keeps rotation in Layout > Size). A
 *                picture has no Text Box options and no exported alt Title.
 *   Picture      Picture Corrections (Brightness, Contrast as Word's signed
 *                percent), Picture Color (Saturation, Recolor none /
 *                grayscale), Picture Transparency, and Crop (per edge, in
 *                pixels of the whole picture as drawn). As in Word, a crop
 *                edge moves the frame over a picture that keeps its scale,
 *                so the frame's size changes with it. Sharpen/Soften and
 *                Color Tone are not in the model.
 *
 * All four sections stay mounted and the tab strip shows one of them, so a
 * value typed in one section survives a tab switch until it commits (Enter
 * or leaving the box), as Word's pane commits.
 */

type Edge = "top" | "right" | "bottom" | "left";
type PaneTab = "fillLine" | "effects" | "layout" | "picture";
const TABS: readonly PaneTab[] = ["fillLine", "effects", "layout", "picture"];
const CROP_FIELDS = [
  ["crop-top", "top", "pictureCropTop", "bottom"],
  ["crop-bottom", "bottom", "pictureCropBottom", "top"],
  ["crop-left", "left", "pictureCropLeft", "right"],
  ["crop-right", "right", "pictureCropRight", "left"],
] as const;
const NUMERIC_NAMES = new Set([
  "transparency",
  "rotation",
  "brightness",
  "contrast",
  "saturation",
  "line-width",
  ...CROP_FIELDS.map(([name]) => name),
]);

interface Props {
  attrs: Readonly<Record<string, unknown>>;
  authorityValid: boolean;
  editable: boolean;
  isChinese: boolean;
  onClose: () => void;
  onCommitAlt: (value: string) => boolean;
  onCommitVisual: (patch: Readonly<Record<string, unknown>>) => boolean;
  /** Open on a page (the right-click menu's Size and Position / Edit Alt
   *  Text), and at one section of it (Picture Effects > Glow > Glow
   *  Options... opens Effects at Glow); a new object turns to it again. */
  opening?: { readonly tab: PaneTab; readonly focusAlt: boolean; readonly section?: string } | null;
  sizePx: readonly [width: number, height: number];
  visualEditable: boolean;
}

/** The Glow presets' accents (the 3-D sections shown here use none). */
const DEFAULT_ACCENTS = {
  accent1: "#4472c4",
  accent2: "#ed7d31",
  accent3: "#a5a5a5",
  accent4: "#ffc000",
  accent5: "#5b9bd5",
  accent6: "#70ad47",
} as const;

const px = (percent: number, dimension: number) =>
  Math.round((percent * dimension) / 100);

export default function DocumentPictureFormatPane(props: Props) {
  const { attrs, authorityValid, editable, sizePx, visualEditable } = props;
  const t = useTranslations("console-notebooks");
  // Under Docs' pane chrome the frame, title row and close button are the
  // dialogs' (as OfficeTaskPane draws them); the pages keep this module.
  const chromeTone = useOfficeTaskPaneChrome();
  const [widthPx, heightPx] = sizePx;
  const visualDisabled = !authorityValid || !editable || !visualEditable;
  const [tab, setTab] = useState<PaneTab>(props.opening?.tab ?? "picture");
  const paneRef = useRef<HTMLElement>(null);
  const [seenOpening, setSeenOpening] = useState(props.opening);
  if (props.opening !== seenOpening) {
    setSeenOpening(props.opening);
    if (props.opening) setTab(props.opening.tab);
  }
  useEffect(() => {
    if (!props.opening?.focusAlt) return;
    const frame = requestAnimationFrame(() => {
      paneRef.current?.querySelector<HTMLElement>('[name="alt"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [props.opening]);
  useEffect(() => {
    if (props.opening?.section) revealOfficeShapeFormatPaneSection(paneRef.current, props.opening.section);
  }, [props.opening]);
  const [error, setError] = useState<string | null>(null);
  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  const crop = Object.fromEntries(
    CROP_FIELDS.map(([, edge, attr]) => [
      edge,
      normalizeImageCropPercent(attrs[attr]),
    ]),
  ) as Record<Edge, number>;
  const rotation = normalizeImageRotation(attrs.pictureRotation);
  const transparency = imageTransparencyFromOpacity(
    normalizeImageOpacity(attrs.pictureOpacity),
  );
  const brightness = imageCorrectionDeltaFromStored(attrs.pictureBrightness);
  const contrast = imageCorrectionDeltaFromStored(attrs.pictureContrast);
  const saturation = normalizeImageSaturation(attrs.pictureSaturation);
  const recolor = isNativeImageRecolorMode(attrs.pictureRecolor)
    ? attrs.pictureRecolor
    : "none";
  const pictureStyle = normalizeImagePictureStyle(attrs.pictureStyle);
  const picture3dBlock = picture3dBlocker(attrs as Record<string, unknown>);
  const lookEffectsBlock = pictureLookEffectsBlocker(attrs as Record<string, unknown>);
  const shadowBlock = pictureShadowBlocker(attrs as Record<string, unknown>);
  const pictureShadow = pictureShadowEffect(attrs as Record<string, unknown>);
  const artisticEffect = normalizeOfficeArtisticEffect(attrs.artisticEffect) ?? "none";
  const artisticRendered = attrs.artisticEffectRendered === true;
  const styleOutlineHidden = attrs.pictureStyleOutlineHidden === true;
  const lineWidth = normalizeImageBorderWidth(attrs.pictureBorderWidth);
  const lineColor = normalizeImageBorderColor(attrs.pictureBorderColor);
  const lineDash = normalizeImageBorderStyle(attrs.pictureBorderStyle);
  // Line is on when the picture draws an outline: its own border, or a
  // Picture Style's outline that has not been removed.
  const lineOn =
    lineWidth > 0 ||
    (pictureStyle !== null &&
      !styleOutlineHidden &&
      imagePictureStyleHasOutline(pictureStyle));
  const effectiveStyleOutlineWidthPt =
    lineWidth === 0 && pictureStyle !== null && !styleOutlineHidden
      ? officePictureStyleOutlineWidthPt(pictureStyle)
      : 0;
  const changed = t("pictureFormatPane.changed");
  const done = (ok: boolean, message = changed) =>
    setError(ok ? null : message);
  // The whole picture as drawn: the frame shows the kept part of it.
  const source = documentImageCropSourceSize(
    { width: widthPx, height: heightPx },
    crop,
  );
  const dimension = (edge: Edge) =>
    edge === "top" || edge === "bottom" ? source.height : source.width;
  const numberValue = (name: string): number => {
    switch (name) {
      case "transparency":
        return transparency;
      case "rotation":
        return rotation;
      case "brightness":
        return brightness;
      case "contrast":
        return contrast;
      case "saturation":
        return saturation;
      case "line-width":
        return lineWidth;
      default: {
        const edge = name.slice(5) as Edge;
        return px(crop[edge], dimension(edge));
      }
    }
  };
  const commitVisual = (patch: Readonly<Record<string, unknown>>) =>
    done(authorityValid && props.onCommitVisual(patch));
  const commitLine = (width: number, color: string, dash: ImageBorderStyle) =>
    commitVisual({
      pictureBorderWidth: normalizeImageBorderWidth(width),
      pictureBorderColor: normalizeImageBorderColor(color),
      pictureBorderStyle: normalizeImageBorderStyle(dash),
      // "No line" over a styled picture is the style's No Outline.
      pictureStyleOutlineHidden:
        width === 0 && imagePictureStyleHasOutline(pictureStyle),
    });
  const commitField = (name: string, raw: string) => {
    if (!authorityValid) return done(false);
    if (name === "alt") return done(raw === alt || props.onCommitAlt(raw));
    if (!NUMERIC_NAMES.has(name)) return;
    const value = Number(raw);
    const next = Math.round(value);
    const signed = name === "brightness" || name === "contrast";
    if (raw.trim() === "" || !Number.isFinite(value) || (!signed && value < 0))
      return done(false, t("pictureFormatPane.invalidValue"));
    if (next === numberValue(name) && name !== "rotation" && name !== "line-width")
      return done(true);
    switch (name) {
      case "transparency":
        return done(
          value <= 100 &&
            props.onCommitVisual({
              pictureOpacity: imageOpacityFromTransparency(next),
            }),
        );
      case "rotation": {
        // Word's pane takes any angle; the picture node keeps 0-360 with
        // three decimals (normalizeImageRotation), as the rotate handle.
        const angle = normalizeImageRotation(value);
        return done(
          value < 360 &&
            (angle === rotation ||
              props.onCommitVisual({ pictureRotation: angle })),
          value < 360 ? changed : t("pictureFormatPane.rotationRange"),
        );
      }
      case "brightness":
      case "contrast":
        // Word's Brightness / Contrast boxes: -100% to 100%.
        if (next < -100 || next > IMAGE_ADJUST_MAX - 100)
          return done(false, t("pictureFormatPane.correctionRange"));
        return done(
          props.onCommitVisual({
            [name === "brightness" ? "pictureBrightness" : "pictureContrast"]:
              imageCorrectionStoredFromDelta(next),
          }),
        );
      case "saturation":
        if (next < IMAGE_SATURATION_MIN || next > IMAGE_SATURATION_MAX)
          return done(false, t("pictureFormatPane.saturationRange"));
        return done(props.onCommitVisual({ pictureSaturation: next }));
      case "line-width": {
        const width = normalizeImageBorderWidth(value);
        if (value > 12) return done(false, t("pictureFormatPane.lineWidthRange"));
        if (width === lineWidth) return done(true);
        return commitLine(width, lineColor, lineDash);
      }
      default: {
        const field = CROP_FIELDS.find(([item]) => item === name)!;
        const [, edge, attr, opposite] = field;
        const extent = dimension(edge);
        const valid =
          value <= Math.floor((extent * MAX_IMAGE_CROP_PERCENT) / 100) &&
          next + px(crop[opposite], extent) < extent;
        if (!valid) return done(false, t("pictureFormatPane.cropOutOfBounds"));
        const nextCrop = {
          ...crop,
          [edge]: normalizeImageCropPercent((next / extent) * 100),
        };
        const frame = documentImageCropFrameSize(
          { width: widthPx, height: heightPx, widthEmu: attrs.widthEmu, heightEmu: attrs.heightEmu },
          crop,
          nextCrop,
        );
        return done(
          props.onCommitVisual({
            [attr]: nextCrop[edge],
            width: frame.width,
            height: frame.height,
            widthEmu: frame.widthEmu,
            heightEmu: frame.heightEmu,
            widthPercent: null,
          }),
        );
      }
    }
  };

  const numberField = (
    name: string,
    labelKey: string,
    options: { min?: number; max?: number; step?: number; unit?: string } = {},
  ) => (
    <label key={name} className={shared.field}>
      <span>{t(labelKey)}</span>
      <span className={shared.numberRow}>
        <input
          key={`${name}:${numberValue(name)}`}
          className={documentValueInputClassName()}
          data-testid={`document-picture-format-pane-${name}${name.startsWith("crop-") ? "-px" : ""}`}
          defaultValue={numberValue(name)}
          disabled={visualDisabled}
          max={options.max}
          min={options.min}
          name={name}
          step={options.step}
          type="number"
        />
        {options.unit ? <span className={shared.unit}>{options.unit}</span> : null}
      </span>
    </label>
  );
  const section = (id: string, titleKey: string, children: ReactNode, hint?: string) => (
    <fieldset
      key={id}
      className={shared.section}
      data-testid={`document-picture-format-pane-section-${id}`}
    >
      <legend>{t(titleKey)}</legend>
      {hint ? <p className={shared.hint}>{hint}</p> : null}
      {children}
    </fieldset>
  );

  const styleOptions: Array<{ value: OfficePictureStyleId | "none"; label: string }> = [
    { value: "none", label: t("pictureFormatPane.styleNone") },
    ...OFFICE_PICTURE_STYLE_CATALOG.map((entry) => ({
      value: entry.id,
      label: t(officePictureStyleLabelKey(entry.id)),
    })),
  ];

  const panels: Record<PaneTab, ReactNode> = {
    fillLine: (
      <>
        {section(
          "fill",
          "pictureFormatPane.fill",
          null,
          t("pictureFormatPane.fillUnavailable"),
        )}
        {section(
          "line",
          "pictureFormatPane.line",
          <>
            <div className={shared.row} role="radiogroup" aria-label={t("pictureFormatPane.line")}>
              {(
                [
                  ["none", "pictureFormatPane.noLine", !lineOn],
                  ["solid", "pictureFormatPane.solidLine", lineOn],
                ] as const
              ).map(([id, labelKey, checked]) => (
                <label key={id} className={shared.check}>
                  <input
                    type="radio"
                    name="document-picture-format-line"
                    checked={checked}
                    disabled={visualDisabled}
                    data-testid={`document-picture-format-pane-line-${id}`}
                    onChange={() =>
                      id === "none"
                        ? commitLine(0, lineColor, lineDash)
                        : commitLine(lineWidth || 0.75, lineColor, lineDash)
                    }
                  />
                  {t(labelKey)}
                </label>
              ))}
            </div>
            <label className={shared.field}>
              <span>{t("pictureFormatPane.lineColor")}</span>
              <input
                type="color"
                value={lineColor}
                disabled={visualDisabled}
                data-testid="document-picture-format-pane-line-color"
                onChange={(event) =>
                  commitLine(lineWidth || 0.75, event.target.value, lineDash)
                }
              />
            </label>
            {numberField("line-width", "pictureFormatPane.lineWidth", {
              min: 0,
              max: 12,
              step: 0.25,
              unit: t("pictureFormatPane.pt"),
            })}
            <label className={shared.field}>
              <span>{t("pictureFormatPane.dashType")}</span>
              <select
                value={lineDash}
                disabled={visualDisabled}
                data-testid="document-picture-format-pane-line-dash"
                onChange={(event) =>
                  commitLine(
                    // A styled picture's width 0 means "the style's own
                    // outline": changing only the dash keeps that width
                    
                    lineWidth || effectiveStyleOutlineWidthPt || 0.75,
                    lineColor,
                    event.target.value as ImageBorderStyle,
                  )
                }
              >
                {IMAGE_BORDER_STYLES.map((dash) => (
                  <option key={dash} value={dash}>
                    {t(`pictureFormatPane.dash_${dash}`)}
                  </option>
                ))}
              </select>
            </label>
          </>,
        )}
      </>
    ),
    effects: (
      <>
        {section(
          "effects-preset",
          "pictureFormatPane.effectsPreset",
          <label className={shared.field}>
            <span>{t("pictureFormatPane.pictureStyle")}</span>
            <select
              value={pictureStyle ?? "none"}
              disabled={visualDisabled}
              data-testid="document-picture-format-pane-picture-style"
              onChange={(event) =>
                commitVisual(
                  documentPictureStylePatch(
                    event.target.value === "none"
                      ? null
                      : (event.target.value as OfficePictureStyleId),
                  ),
                )
              }
            >
              {styleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>,
          t("pictureFormatPane.effectsHint"),
        )}
        {/* Format Picture > Shadow (reading row 547): Office's own section
            (presets, colour, transparency, size, blur, angle, distance) over
            the picture's shadow in the shared model, as a shape's pane and
            the deck's and sheet's pictures show it. */}
        <OfficeShapeFormatPaneSections
          sections={officeEffectsPaneSections({
            effects: pictureShadow ? { shadow: pictureShadow } : {},
            accentColors: DEFAULT_ACCENTS,
            labels: presentationEffectsPaneLabels(t),
            disabled: visualDisabled || shadowBlock !== null,
            disabledReason:
              shadowBlock === "styled"
                ? t("pictureFormatPane.effectsHint")
                : shadowBlock === "preserved"
                  ? t("presentation.shapeEffectsUnavailable")
                  : undefined,
            testIdPrefix: "effects",
            onChange: (kind, value) => {
              if (kind !== "shadow") return;
              commitVisual({ ...pictureShadowEffectAttrs(value), pictureShadowEditable: true });
            },
          }).filter((entry) => entry.id === "effects-shadow")}
          labels={{
            title: "",
            close: t("common.close"),
            apply: t("presentation.ui.shapeFormatPane.apply"),
            cancel: t("common.cancel"),
          }}
          testIdPrefix="document-picture-format-pane"
          writable={!visualDisabled}
        />
        {/* Format Picture > Reflection, Glow and Soft Edges (reading row
            545): Office's own sections over the picture's effect list, the
            ones a shape's pane and the deck's and sheet's pictures show. */}
        <OfficeShapeFormatPaneSections
          sections={officeEffectsPaneSections({
            effects: pictureLookEffects(attrs as Record<string, unknown>),
            accentColors: DEFAULT_ACCENTS,
            labels: presentationEffectsPaneLabels(t),
            disabled: visualDisabled || lookEffectsBlock !== null,
            disabledReason:
              lookEffectsBlock === "styled"
                ? t("pictureFormatPane.effectsHint")
                : lookEffectsBlock === "preserved"
                  ? t("presentation.shapeEffectsUnavailable")
                  : undefined,
            testIdPrefix: "effects",
            onChange: (kind, value) => {
              if (!(PICTURE_LOOK_EFFECT_KINDS as readonly string[]).includes(kind)) return;
              commitVisual({
                ...pictureLookEffectAttrs(attrs as Record<string, unknown>, kind as PictureLookEffectKind, value),
                pictureEffectsEditable: true,
              });
            },
          }).filter(
            (entry) => entry.id === "effects-reflection" || entry.id === "effects-glow" || entry.id === "effects-soft-edge",
          )}
          labels={{
            title: "",
            close: t("common.close"),
            apply: t("presentation.ui.shapeFormatPane.apply"),
            cancel: t("common.cancel"),
          }}
          testIdPrefix="document-picture-format-pane"
          writable={!visualDisabled}
        />
        {/* Format Picture > 3-D Format and 3-D Rotation (reading row 544):
            Office's own sections over the picture's `picture3d`, the ones a
            shape's pane and the deck's and sheet's pictures show. */}
        <OfficeShapeFormatPaneSections
          sections={officeEffectsPaneSections({
            effects: normalizePicture3d(attrs.picture3d) ?? undefined,
            accentColors: DEFAULT_ACCENTS,
            labels: presentationEffectsPaneLabels(t),
            disabled: visualDisabled || picture3dBlock !== null,
            disabledReason:
              picture3dBlock === "styled"
                ? t("pictureFormatPane.effectsHint")
                : picture3dBlock === "preserved"
                  ? t("presentation.shapeEffectsUnavailable")
                  : undefined,
            testIdPrefix: "effects",
            onChange: (kind, value) => {
              if (!(PICTURE_THREE_D_KINDS as readonly string[]).includes(kind)) return;
              const next = normalizePicture3d(
                withOfficePictureEffect(normalizePicture3d(attrs.picture3d) ?? undefined, kind, value, false),
              );
              commitVisual({ picture3d: next, picture3dEditable: true });
            },
          }).filter((entry) => entry.id === "effects-bevel" || entry.id === "effects-rotation")}
          labels={{
            title: "",
            close: t("common.close"),
            apply: t("presentation.ui.shapeFormatPane.apply"),
            cancel: t("common.cancel"),
          }}
          testIdPrefix="document-picture-format-pane"
          writable={!visualDisabled}
        />
        {section(
          "artistic",
          "pictureFormatPane.artisticEffects",
          <label className={shared.field}>
            <span>{t("pictureFormatPane.artisticEffect")}</span>
            <select
              value={artisticEffect}
              disabled={!authorityValid || !editable || artisticRendered}
              title={
                artisticRendered
                  ? t("pictureFormatPane.artisticRendered")
                  : undefined
              }
              data-testid="document-picture-format-pane-artistic-effect"
              onChange={(event) =>
                commitVisual({
                  artisticEffect: normalizeOfficeArtisticEffect(event.target.value),
                })
              }
            >
              {OFFICE_ARTISTIC_EFFECT_IDS.map((id) => (
                <option
                  key={id}
                  value={id}
                  disabled={!officeArtisticEffectDrawable(id)}
                >
                  {t(officeArtisticEffectLabelKey(id))}
                </option>
              ))}
            </select>
          </label>,
        )}
      </>
    ),
    layout: (
      <>
        {section(
          "alt",
          "pictureFormatPane.altText",
          <label className={shared.field}>
            <span>{t("pictureFormatPane.altDescription")}</span>
            <textarea
              key={alt}
              data-testid="document-picture-format-pane-alt"
              defaultValue={alt}
              disabled={!authorityValid || !editable}
              name="alt"
            />
          </label>,
        )}
        {section(
          "rotation",
          "pictureFormatPane.rotation",
          numberField("rotation", "pictureFormatPane.degrees", {
            min: 0,
            max: 359.999,
          }),
        )}
      </>
    ),
    picture: (
      <>
        {section(
          "corrections",
          "pictureFormatPane.corrections",
          <>
            {numberField("brightness", "pictureFormatPane.brightness", {
              min: -100,
              max: 100,
              unit: "%",
            })}
            {numberField("contrast", "pictureFormatPane.contrast", {
              min: -100,
              max: 100,
              unit: "%",
            })}
          </>,
        )}
        {section(
          "color",
          "pictureFormatPane.pictureColor",
          <>
            {numberField("saturation", "pictureFormatPane.saturation", {
              min: IMAGE_SATURATION_MIN,
              max: IMAGE_SATURATION_MAX,
              unit: "%",
            })}
            <label className={shared.field}>
              <span>{t("pictureFormatPane.recolor")}</span>
              <select
                value={recolor}
                disabled={visualDisabled}
                data-testid="document-picture-format-pane-recolor"
                onChange={(event) =>
                  commitVisual({ pictureRecolor: event.target.value })
                }
              >
                {NATIVE_IMAGE_RECOLOR_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`pictureFormatPane.recolor_${mode}`)}
                  </option>
                ))}
              </select>
            </label>
          </>,
        )}
        {section(
          "transparency",
          "pictureFormatPane.transparencySection",
          numberField("transparency", "pictureFormatPane.transparency", {
            min: 0,
            max: 100,
            unit: "%",
          }),
        )}
        {section(
          "crop",
          "pictureFormatPane.crop",
          CROP_FIELDS.map(([name, edge]) =>
            numberField(name, `pictureFormatPane.crop_${edge}`, {
              min: 0,
              unit: "px",
            }),
          ),
        )}
      </>
    ),
  };

  return (
    <aside
      aria-label={t("pictureFormatPane.title")}
      className={[
        shared.pane,
        styles.pane,
        chromeTone
          ? officeDialogClassName({ tone: chromeTone, pane: true })
          : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-authority-valid={authorityValid}
      data-testid="document-picture-format-pane"
      data-picture-format-tab={tab}
      ref={paneRef}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        props.onClose();
      }}
      role="dialog"
    >
      <header
        className={
          chromeTone
            ? `${styles.header} ${officeDialogParts.header}`
            : styles.header
        }
      >
        <OfficeTaskPaneDockedTitle title={t("pictureFormatPane.title")} />
        <button
          autoFocus
          aria-label={t("pictureFormatPane.close")}
          className={
            chromeTone
              ? `${styles.iconButton} ${officeDialogParts.close}`
              : styles.iconButton
          }
          data-testid="document-picture-format-pane-close"
          onClick={props.onClose}
          type="button"
        >
          <X size={17} aria-hidden />
        </button>
      </header>
      <div className={shared.tabs} role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            aria-selected={tab === id}
            className={shared.tab}
            data-testid={`document-picture-format-pane-tab-${id}`}
            onClick={() => setTab(id)}
            role="tab"
            title={t(`pictureFormatPane.tab_${id}`)}
            type="button"
          >
            {t(`pictureFormatPane.tab_${id}`)}
          </button>
        ))}
      </div>
      <div
        className={shared.body}
        onBlurCapture={(event) => {
          const field = event.target as HTMLInputElement;
          if (field.name) commitField(field.name, field.value);
        }}
        onKeyDownCapture={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement)
            event.target.blur();
        }}
      >
        {error || !authorityValid ? (
          <p
            className={shared.hint}
            data-testid="document-picture-format-pane-error"
            role="alert"
          >
            {error ?? changed}
          </p>
        ) : null}
        {TABS.map((id) => (
          <div
            key={id}
            role="tabpanel"
            hidden={tab !== id}
            data-testid={`document-picture-format-pane-panel-${id}`}
          >
            {panels[id]}
          </div>
        ))}
      </div>
    </aside>
  );
}
