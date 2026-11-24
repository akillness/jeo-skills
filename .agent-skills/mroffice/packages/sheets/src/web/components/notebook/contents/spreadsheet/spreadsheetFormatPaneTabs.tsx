"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPxRounded, pxToPtRounded } from "@mrnote/core/web/lib/office-units.ts";
import { officeChartFillLineSections, officePictureFillPaneArgs } from "@mrnote/core/web/components/office-ribbon/officeChartFillLinePage.tsx";
import { spreadsheetShapeHasPictureFill } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import type { OfficePictureFillSource } from "@mrnote/core/web/lib/office-picture-fill.ts";
import { officePictureFillOptionsOf } from "@mrnote/core/web/lib/office-picture-fill-options.ts";
import { spreadsheetShapeLineEnds } from "../../../../lib/spreadsheet/shape-line-ends";
import { spreadsheetShapeFillLineChange, spreadsheetShapeFillLineStyle } from "./spreadsheetShapeFillLine";
import { spreadsheetPictureEffectParameter, spreadsheetPictureEffectsBlocker, spreadsheetPictureShadowInEffects } from "../../../../lib/spreadsheet/picture-effects";
import { officeEffectsPaneSections, officeTextEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";
import { spreadsheetShapeOfficeEffects } from "../../../../lib/spreadsheet/shape-office-effects";
import { OFFICE_TEXT_EFFECT_KINDS, officeTextPaintOfficeEffects, withOfficeTextEffect } from "@mrnote/core/web/lib/office-text-effects.ts";
import { OFFICE_GLOW_ACCENTS, OFFICE_GLOW_SIZES_PT, officeGlowVariation } from "@mrnote/core/web/lib/office-picture-effects.ts";
import type { OfficeTextPaint } from "@mrnote/core/web/lib/office-text-paint.ts";
import { objectAspectLocked, objectPrints, objectSizePixels, spreadsheetObjectPlacement, spreadsheetObjectRotation, spreadsheetLineShapeTakesNoText, MAX_PICTURE_ALT_TEXT_LENGTH, SPREADSHEET_OBJECT_PLACEMENTS } from "../../../../lib/spreadsheet/drawing-buttons";
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { normalizeOfficeArtisticEffect, OFFICE_ARTISTIC_EFFECT_IDS, officeArtisticEffectDrawable } from "@mrnote/core/web/lib/office-artistic-effects.ts";
import { type SpreadsheetVisibleCommandReason } from "../../../../lib/spreadsheet/visible-command-authority";
import { DEFAULT_SHAPE_FILL, DEFAULT_SHAPE_STROKE, MAX_SHAPE_TEXT_LENGTH, MIN_SHAPE_TEXT_SIZE, MAX_SHAPE_TEXT_SIZE } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { type OfficeShapeFormatPaneSection, type OfficeShapeFormatPaneTab } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { SPREADSHEET_SHADOW_PRESETS, DEFAULT_SHADOW_COLOR } from "@mrnote/core/web/lib/spreadsheet/shape-effects.ts";
import { type SheetModel, type SpreadsheetObject } from "./spreadsheetSheetModel";
import { type PictureFormatWriterControlId, type PictureMetadataWriterControlId, type PictureMetadataMutationReceipt, type ShapeFormatWriterControlId, type ShapeRotationDialogAuthority } from "./spreadsheetMutationReceipts";
import { type SparseAxisSizeResolver } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { type Dispatch, type SetStateAction } from "react";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";

/** A shape's text size (px in the model) in the points the pane shows. */
const shapeTextPxToPt = (px: number) => pxToPtRounded(px);

/** What spreadsheetFormatPaneTabs reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetFormatPaneTabsInputs {
  /** Text Options > Text Effects: the words' WordArt paint edited as the
   * ribbon's Text Effects menu edits it (absent: no Text Effects sections). */
  editShapeTextPaint?: (edit: (paint: OfficeTextPaint) => OfficeTextPaint) => Promise<boolean | void>;
  shapeTextPaintDisabledReason?: string;
  cmToPx: (cm: string) => number;
  colWidth: SparseAxisSizeResolver;
  executePictureFormatMutation: (controlId: PictureFormatWriterControlId, parameter: string | number, surface?: "visible" | "keyboard" | "navigation") => Promise<boolean | void>;
  executePictureMetadataMutation: (controlId: PictureMetadataWriterControlId, patch: Pick<PictureMetadataMutationReceipt, "nextAlt" | "nextCaption" | "nextSrc">) => Promise<boolean>;
  executeShapeFormatMutation: (controlId: ShapeFormatWriterControlId, parameter: string | number, surface?: "visible" | "keyboard") => Promise<boolean | void>;
  executeVisibleCommand: (controlId: string) => Promise<boolean>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  pictureEffectsDisabledReason: string | undefined;
  pictureMetadataDisabledReason: string | undefined;
  pictureTransformDisabledReason: string | undefined;
  pxToCm: (px: number) => string;
  rowHeight: SparseAxisSizeResolver;
  selectedPictureObject: SpreadsheetObject | null;
  selectedShapeObject: SpreadsheetObject | null;
  selectedShapeStyle: SpreadsheetShapeStyle | null;
  /** A selected group's own turn (degrees), or null when no group is selected. */
  selectedGroupRotation?: number | null;
  setShapeLastFillColor: Dispatch<SetStateAction<string>>;
  setShapeLastStrokeColor: Dispatch<SetStateAction<string>>;
  setShapeRotationDraft: Dispatch<SetStateAction<{ authority: ShapeRotationDialogAuthority; value: string; error: string | null; silent?: boolean; } | null>>;
  shapeAltTextCommandState: ResolvedSpreadsheetVisibleControl;
  shapeFillColorCommandState: ResolvedSpreadsheetVisibleControl;
  shapeFormatDisabledReason: string | undefined;
  shapeLastFillColor: string;
  shapeLastStrokeColor: string;
  shapeOutlineColorCommandState: ResolvedSpreadsheetVisibleControl;
  shapeOutlineWeightDisabledReason: string | undefined;
  shapeOutlineWeightPx: number;
  shapeShadowCommandState: ResolvedSpreadsheetVisibleControl;
  shapeSizePx: { width: number; height: number; } | null;
  shapeTextCommandState: ResolvedSpreadsheetVisibleControl;
  /** Format Shape > Effects: its gate and the workbook theme's accents. */
  shapeEffectsDisabledReason: string | undefined;
  /** Format Shape > Line: Compound/Cap/Join and Dash type gates. */
  shapeLineDetailDisabledReason: string | undefined;
  shapeOutlineDashDisabledReason: string | undefined;
  /** Format Shape > Fill & Line: its gate, the Arrows gate and the stop each gradient editor has selected. */
  shapeFillLineDisabledReason: string | undefined;
  shapeLineEndsDisabledReason: string | undefined;
  shapePaneStops: { readonly fill: number; readonly line: number };
  /** Format Shape > Fill > Picture or texture fill: opens the file picker
   * for the selected shape's fill picture. */
  beginShapeFillPicture: (source?: OfficePictureFillSource) => void;
  setShapePaneStops: Dispatch<SetStateAction<{ readonly fill: number; readonly line: number }>>;
  workbookThemeAccentColors: readonly string[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  visibleCommandReason: (reasonKey: SpreadsheetVisibleCommandReason | null) => string | undefined;
}

/**
 * Size & Properties > Properties: Excel's "Object positioning" for a
 * picture, a shape and a chart alike (the anchor kind, `editAs` in the file).
 */
export function spreadsheetObjectPropertiesSection(
  t: ReturnType<typeof useTranslations<"console-notebooks">>,
  anchor: SpreadsheetObject["anchor"],
  disabledReason: string | undefined,
  onChange: (value: string) => void,
  /** Print object: the object's state and its toggle (Excel's checkbox
   * under Properties); absent where the host has none. */
  printObject?: { readonly checked: boolean; readonly disabledReason?: string; readonly onToggle: () => void },
): OfficeShapeFormatPaneSection {
  return {
    id: "properties",
    title: t("spreadsheet.objectProperties.title"),
    fields: [
      {
        kind: "select" as const,
        id: "placement",
        label: t("spreadsheet.objectProperties.positioning"),
        value: spreadsheetObjectPlacement(anchor),
        options: SPREADSHEET_OBJECT_PLACEMENTS.map((placement) => ({
          value: placement,
          label: t(`spreadsheet.objectProperties.${placement}`),
        })),
        disabled: Boolean(disabledReason),
        disabledReason,
        onChange,
      },
      ...(printObject
        ? [{
            kind: "checkbox" as const,
            id: "print-object",
            label: t("spreadsheet.objectProperties.printObject"),
            checked: printObject.checked,
            disabled: Boolean(printObject.disabledReason),
            disabledReason: printObject.disabledReason,
            onChange: () => printObject.onToggle(),
          }]
        : []),
    ],
  };
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetFormatPaneTabs({
  shapeLineDetailDisabledReason,
  shapeOutlineDashDisabledReason,
  shapeFillLineDisabledReason,
  shapeLineEndsDisabledReason,
  shapePaneStops,
  beginShapeFillPicture,
  setShapePaneStops,
  shapeEffectsDisabledReason,
  workbookThemeAccentColors,
  cmToPx,
  colWidth,
  editShapeTextPaint,
  shapeTextPaintDisabledReason,
  executePictureFormatMutation,
  executePictureMetadataMutation,
  executeShapeFormatMutation,
  executeVisibleCommand,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  pictureEffectsDisabledReason,
  pictureMetadataDisabledReason,
  pictureTransformDisabledReason,
  pxToCm,
  rowHeight,
  selectedPictureObject,
  selectedShapeObject,
  selectedShapeStyle,
  selectedGroupRotation = null,
  setShapeLastFillColor,
  setShapeLastStrokeColor,
  setShapeRotationDraft,
  shapeAltTextCommandState,
  shapeFillColorCommandState,
  shapeFormatDisabledReason,
  shapeLastFillColor,
  shapeLastStrokeColor,
  shapeOutlineColorCommandState,
  shapeSizePx,
  shapeTextCommandState,
  t,
  visibleCommandReason,
}: SpreadsheetFormatPaneTabsInputs) {
  const placementSection = (
    anchor: SpreadsheetObject["anchor"],
    disabledReason: string | undefined,
    onChange: (value: string) => void,
    printObject?: Parameters<typeof spreadsheetObjectPropertiesSection>[4],
  ) => spreadsheetObjectPropertiesSection(t, anchor, disabledReason, onChange, printObject);
  // XLS-A080 Format Picture: the shared Format Shape pane with a picture's
  // pages, each field on the writer the Picture Format tab uses.
  const sheetPictureFormatPaneTabs: OfficeShapeFormatPaneTab[] = selectedPictureObject
    ? (() => {
        const picture = selectedPictureObject;
        const size = objectSizePixels(picture, colWidth, rowHeight);
        const cm = (px: number) => ((px * 2.54) / 96).toFixed(2);
        const toPx = (value: string) => Math.max(1, Math.round((Number(value) * 96) / 2.54));
        const rotation = spreadsheetObjectRotation(picture.anchor);
        return [
          {
            id: "effects",
            label: t("spreadsheet.chartFormatCopy.pane.effects"),
            sections: [
              // The sheet's own shadow preset, unless the picture keeps its
              // Shadow in its Picture Effects (readings row 570): then
              // Office's Shadow section below is its one shadow.
              ...(spreadsheetPictureShadowInEffects(picture)
                ? []
                : [
              {
                id: "shadow",
                title: t("spreadsheet.chartFormatCopy.pane.shadow"),
                fields: [
                  {
                    kind: "select",
                    id: "shadow",
                    label: t("spreadsheet.chartFormatCopy.pane.shadow"),
                    value: picture.shadow?.preset ?? "none",
                    options: [
                      { value: "none", label: t("spreadsheet.shapeFormat.noShadow") },
                      ...SPREADSHEET_SHADOW_PRESETS.map((preset) => ({
                        value: preset,
                        label: t(`spreadsheet.objectShadow_${preset}`),
                      })),
                    ],
                    disabled: Boolean(pictureEffectsDisabledReason),
                    disabledReason: pictureEffectsDisabledReason,
                    onChange: (value) =>
                      void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.SHADOW_PRESET.MRAI.APPLY", value),
                  },
                  {
                    kind: "color",
                    id: "shadow-color",
                    label: t("spreadsheet.shapeFormat.shadowColor"),
                    value: picture.shadow?.color ?? DEFAULT_SHADOW_COLOR,
                    disabled: Boolean(pictureEffectsDisabledReason) || !picture.shadow,
                    disabledReason: pictureEffectsDisabledReason,
                    onChange: (value) =>
                      void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.SHADOW_COLOR.MRAI.APPLY", value),
                  },
                ],
              },
                  ] satisfies OfficeShapeFormatPaneSection[]),
              // Reflection, Glow, Soft Edges, 3-D Format and 3-D Rotation:
              // Office's sections over the picture's `pictureEffects` (the
              // deck's and the shapes' Effects pane; the Shadow above is the
              // sheet's own preset, or Office's Shadow section here where the
              // picture keeps its Shadow in its Picture Effects).
              ...(() => {
                const accents = {
                  accent1: workbookThemeAccentColors[0] ?? "#4472c4",
                  accent2: workbookThemeAccentColors[1] ?? "#ed7d31",
                  accent3: workbookThemeAccentColors[2] ?? "#a5a5a5",
                  accent4: workbookThemeAccentColors[3] ?? "#ffc000",
                  accent5: workbookThemeAccentColors[4] ?? "#5b9bd5",
                  accent6: workbookThemeAccentColors[5] ?? "#70ad47",
                };
                const preserved = spreadsheetPictureEffectsBlocker(picture) !== null;
                const reason = preserved ? t("presentation.shapeEffectsUnavailable") : pictureEffectsDisabledReason;
                return officeEffectsPaneSections({
                  effects: picture.pictureEffects,
                  accentColors: accents,
                  labels: presentationEffectsPaneLabels(t),
                  disabled: Boolean(reason),
                  disabledReason: reason,
                  testIdPrefix: "picture-effects",
                  onChange: (kind, value) =>
                    void executePictureFormatMutation(
                      "XLSCTL.CONTEXT.PICTURE.EFFECTS.MRAI.APPLY",
                      spreadsheetPictureEffectParameter(kind, value),
                    ),
                }).filter((section) => section.id !== "effects-shadow" || spreadsheetPictureShadowInEffects(picture));
              })(),
              {
                id: "artistic",
                title: t("toolbar.artisticEffects"),
                fields: [
                  {
                    kind: "select",
                    id: "artistic-effect",
                    label: t("toolbar.artisticEffects"),
                    value: normalizeOfficeArtisticEffect(picture.artisticEffect) ?? "none",
                    options: [
                      { value: "none", label: t("office.artisticEffect.none") },
                      ...OFFICE_ARTISTIC_EFFECT_IDS.filter((id) => officeArtisticEffectDrawable(id)).map((id) => ({
                        value: id,
                        label: t(`office.artisticEffect.${id}`),
                      })),
                    ],
                    disabled: Boolean(pictureEffectsDisabledReason) || picture.artisticEffectRendered === true,
                    disabledReason:
                      picture.artisticEffectRendered === true
                        ? t("spreadsheet.uiCopy.pictureArtisticEffectFromFile")
                        : pictureEffectsDisabledReason,
                    onChange: (value) =>
                      void executePictureFormatMutation(
                        "XLSCTL.CONTEXT.PICTURE.ARTISTIC_EFFECTS.MRAI.APPLY",
                        value === "none" ? "" : value,
                      ),
                  },
                ],
              },
            ],
          },
          {
            id: "size",
            label: t("spreadsheet.chartFormatCopy.pane.sizeAndProperties"),
            sections: [
              {
                id: "size",
                title: t("presentation.smartartContext.sizeGroup"),
                fields: [
                  {
                    kind: "number",
                    id: "height",
                    label: t("presentation.geometry.height"),
                    value: cm(size.height),
                    min: 0.1,
                    step: 0.1,
                    unit: "cm",
                    disabled: Boolean(pictureTransformDisabledReason),
                    disabledReason: pictureTransformDisabledReason,
                    onCommit: (value) => {
                      if (!(Number(value) > 0)) return false;
                      void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.HEIGHT.MRAI.APPLY", String(toPx(value)));
                      return true;
                    },
                  },
                  {
                    kind: "number",
                    id: "width",
                    label: t("presentation.geometry.width"),
                    value: cm(size.width),
                    min: 0.1,
                    step: 0.1,
                    unit: "cm",
                    disabled: Boolean(pictureTransformDisabledReason),
                    disabledReason: pictureTransformDisabledReason,
                    onCommit: (value) => {
                      if (!(Number(value) > 0)) return false;
                      void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.WIDTH.MRAI.APPLY", String(toPx(value)));
                      return true;
                    },
                  },
                  {
                    kind: "number",
                    id: "rotation",
                    label: t("spreadsheet.uiCopy.rotation"),
                    // The angle as Excel's box shows it, 0-359.9: a picture
                    // turned left shows 270, never a -90 below the field's
                    // own minimum (as the shape's, B349).
                    value: ((tenths) => (tenths >= 3600 ? 0 : tenths / 10))(
                      Math.round((((rotation % 360) + 360) % 360) * 10),
                    ),
                    min: 0,
                    max: 359.9,
                    step: 1,
                    unit: "°",
                    disabled: Boolean(pictureTransformDisabledReason),
                    disabledReason: pictureTransformDisabledReason,
                    onCommit: (value) => {
                      const degrees = Number(value);
                      if (!Number.isFinite(degrees) || degrees < 0 || degrees >= 360) return false;
                      // Not the ribbon: the apply row is the Rotation
                      // dialog's, gated on its draft (S-063).
                      void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.ROTATION.MRAI.APPLY", String(degrees), "keyboard");
                      return true;
                    },
                  },
                  {
                    // Excel's Size > Lock aspect ratio: a Height or Width typed
                    // then scales the other side in proportion.
                    kind: "checkbox",
                    id: "lock-aspect",
                    label: t("toolbar.lockAspectRatio"),
                    checked: objectAspectLocked(picture),
                    disabled: Boolean(pictureTransformDisabledReason),
                    disabledReason: pictureTransformDisabledReason,
                    onChange: () =>
                      void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.LOCK_ASPECT.MRAI.APPLY", "toggle"),
                  },
                ],
              },
              placementSection(picture.anchor, pictureTransformDisabledReason, (value) =>
                void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.PLACEMENT.MRAI.APPLY", value),
              {
                checked: objectPrints(picture),
                disabledReason: pictureTransformDisabledReason,
                onToggle: () => void executePictureFormatMutation("XLSCTL.CONTEXT.PICTURE.PRINT_OBJECT.MRAI.APPLY", "toggle"),
              }),
              {
                id: "alt-text",
                title: t("spreadsheet.contextMenu.altText"),
                fields: [
                  {
                    kind: "textarea",
                    id: "alt-text",
                    label: t("spreadsheet.altTextPane.label"),
                    value: picture.alt ?? "",
                    rows: 3,
                    disabled: Boolean(pictureMetadataDisabledReason),
                    disabledReason: pictureMetadataDisabledReason,
                    onCommit: (value) => {
                      void executePictureMetadataMutation("XLSCTL.CONTEXT.PICTURE.ALT_TEXT.MRAI.APPLY", { nextAlt: value });
                      return true;
                    },
                  },
                ],
              },
            ],
          },
          {
            id: "picture",
            label: t("spreadsheet.contextMenu.picture"),
            sections: [
              {
                id: "crop",
                title: t("editorCommands.spreadsheet.object.crop"),
                fields: [
                  {
                    kind: "buttons",
                    id: "crop",
                    label: t("editorCommands.spreadsheet.object.crop"),
                    buttons: [
                      {
                        id: "crop",
                        label: t("editorCommands.spreadsheet.object.crop"),
                        disabled: Boolean(pictureTransformDisabledReason),
                        onSelect: () => void executeVisibleCommand("XLSCTL.CONTEXT.PICTURE.CROP"),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ] satisfies OfficeShapeFormatPaneTab[];
      })()
    : [];
  // The pane's pages against the same writers the tab uses; a writer the
  // worksheet does not have yet is greyed with its reason, never dropped.
  const sheetShapeFormatPaneTabs: OfficeShapeFormatPaneTab[] =
    selectedShapeObject && selectedShapeStyle
      ? (() => {
          const reason = shapeFormatDisabledReason ?? undefined;
          const lineTakesNoText = spreadsheetLineShapeTakesNoText(selectedShapeStyle);
          // A selected group shows the GROUP's turn, as Excel's box does.
          const rotationDegrees = selectedGroupRotation ?? spreadsheetObjectRotation(selectedShapeObject.anchor);
          const commitRotation = (value: string): boolean => {
            const degrees = Number(value);
            if (!Number.isFinite(degrees) || degrees < 0 || degrees >= 360) return false;
            const liveWorkbook = liveSheetsRef.current;
            const liveIndex = liveActiveSheetIndexRef.current;
            const liveSheet = liveWorkbook[liveIndex];
            const liveObjects = liveSheet?.objects;
            const liveObject = liveObjects?.find(
              (object) => object.id === selectedShapeObject.id,
            );
            if (!liveSheet || !liveObjects || !liveObject) return false;
            // Rotation's apply row is gated on a draft the authority has seen
            // (the exact-rotation dialog's receipt); the pane files the same
            // draft silently and the effect below applies it.
            setShapeRotationDraft({
              authority: {
                workbook: liveWorkbook,
                activeSheetIndex: liveIndex,
                sheet: liveSheet,
                sheetId: liveSheet.id,
                objectCollection: liveObjects,
                object: liveObject,
                objectId: liveObject.id,
                selection: liveObject.id,
              },
              value: String(degrees),
              error: null,
              silent: true,
            });
            return true;
          };
          // Format Shape > Fill & Line as Excel lists it, through the page the
          // deck's and Word's shapes and every chart element use, each part on
          // the worksheet's own command (its receipt, one Undo).
          const shapeLineEnds = spreadsheetShapeLineEnds(selectedShapeObject.shape);
          const paneStyle = spreadsheetShapeFillLineStyle(selectedShapeStyle, shapeLineEnds);
          const word = (key: string, _zh: string, en: string, values?: Record<string, string | number>) =>
            (t.has as (key: string) => boolean)(key)
              ? (t as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values)
              : en;
          const fillSeed = selectedShapeStyle.fill === "none"
            ? (shapeLastFillColor === "none" ? DEFAULT_SHAPE_FILL : shapeLastFillColor)
            : selectedShapeStyle.fill;
          const strokeSeed = selectedShapeStyle.stroke === "none"
            ? (shapeLastStrokeColor === "none" ? DEFAULT_SHAPE_STROKE : shapeLastStrokeColor)
            : selectedShapeStyle.stroke;
          const fillLineSections = officeChartFillLineSections({
            style: paneStyle,
            area: "shape",
            fillAvailable: !lineTakesNoText,
            disabledReason: shapeFillLineDisabledReason ?? null,
            word,
            fillColorRow: {
              kind: "color",
              id: "fill",
              label: t("spreadsheet.shapeFill"),
              value: fillSeed,
              disabled: Boolean(reason) || !shapeFillColorCommandState.enabled,
              disabledReason: reason ?? visibleCommandReason(shapeFillColorCommandState.reasonKey),
              onChange: (value) => {
                setShapeLastFillColor(value);
                void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.FILL_COLOR.MRAI.APPLY", value);
              },
            },
            lineColorRow: {
              kind: "color",
              id: "outline",
              label: t("spreadsheet.shapeStroke"),
              value: strokeSeed,
              disabled: Boolean(reason) || !shapeOutlineColorCommandState.enabled,
              disabledReason: reason ?? visibleCommandReason(shapeOutlineColorCommandState.reasonKey),
              onChange: (value) => {
                setShapeLastStrokeColor(value);
                void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.OUTLINE_COLOR.MRAI.APPLY", value);
              },
            },
            automaticFill: fillSeed,
            automaticLine: strokeSeed,
            selectedStop: shapePaneStops,
            onSelectStop: (target, index) => setShapePaneStops((current) => ({ ...current, [target]: index })),
            onStyle: (next) => {
              const change = spreadsheetShapeFillLineChange(paneStyle, next);
              if (change.fillLine) void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.FILL_LINE.MRAI.APPLY", change.fillLine);
              if (change.dash && !shapeOutlineDashDisabledReason) {
                void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.OUTLINE_DASH.MRAI.APPLY", change.dash);
              }
              if (change.detail && !shapeLineDetailDisabledReason) {
                void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.LINE_DETAIL.MRAI.APPLY", change.detail);
              }
              if (change.ends && !shapeLineEndsDisabledReason) {
                void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.LINE_ENDS.MRAI.APPLY", JSON.stringify(change.ends));
              }
            },
            noAutomatic: true,
            // Picture or texture fill: the picture stretched over the shape,
            // written through Fill & Line's own command (one Undo).
            pictureFill: officePictureFillPaneArgs({
              active: spreadsheetShapeHasPictureFill(selectedShapeObject),
              label: t("presentation.shapeFillPicture"),
              buttonLabel: t("office.shapeFill.picture"),
              disabled: Boolean(shapeFillLineDisabledReason),
              disabledReason: shapeFillLineDisabledReason,
              onPick: () => beginShapeFillPicture(),
              onClipboard: () => beginShapeFillPicture("clipboard"),
              onTexture: (id) => beginShapeFillPicture(`texture:${id}`),
              onLeave: (next) => {
                const change = spreadsheetShapeFillLineChange(paneStyle, next, { fillRestated: true });
                if (change.fillLine) void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.FILL_LINE.MRAI.APPLY", change.fillLine);
              },
              // Office's picture options (tile, offsets, Transparency, Rotate
              // with shape), through the same Fill & Line command.
              options: spreadsheetShapeHasPictureFill(selectedShapeObject)
                ? {
                    value: officePictureFillOptionsOf(selectedShapeStyle?.fillPictureOptions),
                    word,
                    onChange: (next) =>
                      void executeShapeFormatMutation(
                        "XLSCTL.CONTEXT.SHAPE.FILL_LINE.MRAI.APPLY",
                        JSON.stringify({ fillPictureOptions: next }),
                      ),
                  }
                : undefined,
            }),
            openLine: !shapeLineEndsDisabledReason,
            lineJoinDefault: "miter",
            lineSectionTitle: "line",
          });
          return [
            {
              id: "shape",
              label: t("spreadsheet.shapeFormat.shapeOptions"),
              sections: [
                ...fillLineSections,
              ],
            },
            // Format Shape > Effects, as Excel draws it (Shadow, Reflection,
            // Glow, Soft Edges, 3-D Format, 3-D Rotation): the object's
            // combinable `shapeEffects`, the page the deck and Word use.
            {
              id: "effects",
              label: t("spreadsheet.chartFormatCopy.pane.effects"),
              sections: (() => {
                const accents = {
                  accent1: workbookThemeAccentColors[0] ?? "#4472c4",
                  accent2: workbookThemeAccentColors[1] ?? "#ed7d31",
                  accent3: workbookThemeAccentColors[2] ?? "#a5a5a5",
                  accent4: workbookThemeAccentColors[3] ?? "#ffc000",
                  accent5: workbookThemeAccentColors[4] ?? "#5b9bd5",
                  accent6: workbookThemeAccentColors[5] ?? "#70ad47",
                };
                return officeEffectsPaneSections({
                  effects: spreadsheetShapeOfficeEffects(selectedShapeObject, accents.accent1),
                  accentColors: accents,
                  labels: presentationEffectsPaneLabels(t),
                  disabled: Boolean(shapeEffectsDisabledReason),
                  disabledReason: shapeEffectsDisabledReason,
                  testIdPrefix: "effects",
                  onChange: (kind, value) =>
                    void executeShapeFormatMutation(
                      "XLSCTL.CONTEXT.SHAPE.EFFECTS.MRAI.APPLY",
                      JSON.stringify({ kind, value, accent1: accents.accent1 }),
                    ),
                  // 3-D Rotation > Keep text flat, on a shape holding words
                  // (`object.keepTextFlat`, the label body's `a:flatTx`).
                  ...((selectedShapeStyle.text ?? "").trim()
                    ? {
                        keepTextFlat: {
                          checked: (selectedShapeObject as { keepTextFlat?: unknown }).keepTextFlat === true,
                          onChange: (checked: boolean) =>
                            void executeShapeFormatMutation(
                              "XLSCTL.CONTEXT.SHAPE.EFFECTS.MRAI.APPLY",
                              JSON.stringify({ keepTextFlat: checked }),
                            ),
                        },
                      }
                    : {}),
                });
              })(),
            },
            {
              id: "size",
              label: t("spreadsheet.chartFormatCopy.pane.sizeAndProperties"),
              sections: [
                {
                  id: "size",
                  title: t("presentation.smartartContext.sizeGroup"),
                  fields: [
                    {
                      kind: "number",
                      id: "width",
                      label: t("presentation.geometry.width"),
                      value: shapeSizePx ? pxToCm(shapeSizePx.width) : "",
                      min: 0.1,
                      step: 0.1,
                      unit: "cm",
                      disabled: Boolean(reason),
                      disabledReason: reason,
                      onCommit: (value) => {
                        if (!(Number(value) > 0)) return false;
                        void executeShapeFormatMutation(
                          "XLSCTL.CONTEXT.SHAPE.WIDTH.MRAI.APPLY",
                          String(Math.max(1, cmToPx(value))),
                        );
                        return true;
                      },
                    },
                    {
                      kind: "number",
                      id: "height",
                      label: t("presentation.geometry.height"),
                      value: shapeSizePx ? pxToCm(shapeSizePx.height) : "",
                      min: 0.1,
                      step: 0.1,
                      unit: "cm",
                      disabled: Boolean(reason),
                      disabledReason: reason,
                      onCommit: (value) => {
                        if (!(Number(value) > 0)) return false;
                        void executeShapeFormatMutation(
                          "XLSCTL.CONTEXT.SHAPE.HEIGHT.MRAI.APPLY",
                          String(Math.max(1, cmToPx(value))),
                        );
                        return true;
                      },
                    },
                    {
                      kind: "number",
                      id: "rotation",
                      label: t("spreadsheet.uiCopy.rotation"),
                      // The angle as applied, to the tenth of a degree the
                      // writer keeps: 22.5 shows 22.5, and 359.96 shows 0,
                      // never a 360 past the field's own maximum (B349).
                      value: ((tenths) => (tenths >= 3600 ? 0 : tenths / 10))(
                        Math.round((((rotationDegrees % 360) + 360) % 360) * 10),
                      ),
                      min: 0,
                      max: 359.9,
                      step: 1,
                      unit: "°",
                      disabled: Boolean(reason),
                      disabledReason: reason,
                      onCommit: commitRotation,
                    },
                    {
                      // The Size group's Lock aspect ratio, on the pane's Size
                      // page as Excel's Format Shape has it.
                      kind: "checkbox",
                      id: "lock-aspect",
                      label: t("toolbar.lockAspectRatio"),
                      checked: selectedShapeObject.lockAspectRatio === true,
                      disabled: Boolean(reason),
                      disabledReason: reason,
                      onChange: () =>
                        void executeShapeFormatMutation(
                          "XLSCTL.CONTEXT.SHAPE.LOCK_ASPECT.MRAI.APPLY",
                          selectedShapeObject.lockAspectRatio === true ? "unlock" : "lock",
                        ),
                    },
                  ],
                },
                // A stroke of ink is always free-floating on the sheet (its
                // points are shares of a fixed box).
                placementSection(
                  selectedShapeObject.anchor,
                  selectedShapeStyle?.kind === "ink" ? t("spreadsheet.objectProperties.inkFloats") : reason,
                  (value) => void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.PLACEMENT.MRAI.APPLY", value),
                  {
                    checked: objectPrints(selectedShapeObject),
                    disabledReason: reason,
                    onToggle: () => void executeShapeFormatMutation("XLSCTL.CONTEXT.SHAPE.PRINT_OBJECT.MRAI.APPLY", "toggle"),
                  },
                ),
                {
                  id: "alt-text",
                  title: t("presentation.shapeAltText"),
                  fields: [
                    {
                      kind: "textarea",
                      id: "alt",
                      label: t("pictureFormatPane.altDescription"),
                      value: selectedShapeObject.alt ?? "",
                      maxLength: MAX_PICTURE_ALT_TEXT_LENGTH,
                      rows: 5,
                      disabled: Boolean(reason) || !shapeAltTextCommandState.enabled,
                      disabledReason:
                        reason ?? visibleCommandReason(shapeAltTextCommandState.reasonKey),
                      onCommit: (value) => {
                        void executeShapeFormatMutation(
                          "XLSCTL.CONTEXT.SHAPE.ALT_TEXT.MRAI.APPLY",
                          value,
                        );
                        return true;
                      },
                    },
                  ],
                },
              ],
            },
            {
              id: "text",
              label: t("spreadsheet.shapeFormat.textOptions"),
              sections: [
                {
                  id: "text-box",
                  title: t("spreadsheet.insertRibbon.textBox"),
                  hint: lineTakesNoText ? t("spreadsheet.shapeTextLineUnavailable") : undefined,
                  fields: [
                    {
                      kind: "textarea",
                      id: "text",
                      label: t("spreadsheet.shapeFormat.text"),
                      value: selectedShapeStyle.text ?? "",
                      maxLength: MAX_SHAPE_TEXT_LENGTH,
                      rows: 4,
                      disabled: Boolean(reason) || lineTakesNoText || !shapeTextCommandState.enabled,
                      disabledReason:
                        reason ??
                        (lineTakesNoText
                          ? t("spreadsheet.shapeTextLineUnavailable")
                          : visibleCommandReason(shapeTextCommandState.reasonKey)),
                      onCommit: (value) => {
                        void executeShapeFormatMutation(
                          "XLSCTL.CONTEXT.SHAPE.TEXT.MRAI.APPLY",
                          value,
                        );
                        return true;
                      },
                    },
                    {
                      kind: "number",
                      id: "font-size",
                      label: t("spreadsheet.shapeFormat.fontSize"),
                      // Points, as the field says; the shape keeps px (the
                      // px read as points showed 11 pt as 14.67, and 30
                      // typed drew 22.5 pt).
                      value: shapeTextPxToPt(selectedShapeStyle.textSize ?? 12),
                      min: shapeTextPxToPt(MIN_SHAPE_TEXT_SIZE),
                      max: shapeTextPxToPt(MAX_SHAPE_TEXT_SIZE),
                      step: 1,
                      unit: "pt",
                      disabled: Boolean(reason) || lineTakesNoText,
                      disabledReason: reason,
                      onCommit: (value) => {
                        const size = Number(value);
                        if (!Number.isFinite(size)) return false;
                        void executeShapeFormatMutation(
                          "XLSCTL.CONTEXT.SHAPE.TEXT_SIZE.MRAI.APPLY",
                          String(Math.min(MAX_SHAPE_TEXT_SIZE, ptToPxRounded(size))),
                        );
                        return true;
                      },
                    },
                    {
                      kind: "color",
                      id: "text-fill",
                      label: t("spreadsheet.chartFormatCopy.wordArt.textFill"),
                      // The colour the text is drawn in: a WordArt paint's
                      // fill when there is one (B524), as the ribbon shows it.
                      value:
                        (selectedShapeStyle.textPaint && /^#[0-9a-f]{6}$/i.test(selectedShapeStyle.textPaint.fill)
                          ? selectedShapeStyle.textPaint.fill
                          : undefined) ??
                        selectedShapeStyle.textColor ??
                        "#0f172a",
                      disabled: Boolean(reason) || lineTakesNoText,
                      disabledReason: reason,
                      onChange: (value) =>
                        void executeShapeFormatMutation(
                          "XLSCTL.CONTEXT.SHAPE.TEXT_COLOR.MRAI.APPLY",
                          value,
                        ),
                    },
                  ],
                },
                // Text Options > Text Effects: Excel's Shadow, Reflection,
                // Glow, 3-D Format and 3-D Rotation on the words' WordArt
                // paint, the sections the deck's and shapes' panes show
                // (officeEffectsPaneSections), each pick as the ribbon's
                // Text Effects menu makes it (withOfficeTextEffect); the whole
                // 3-D Format and 3-D Rotation on the words' statement.
                ...(editShapeTextPaint
                  ? (() => {
                      const accents = {
                        accent1: workbookThemeAccentColors[0] ?? "#4472c4",
                        accent2: workbookThemeAccentColors[1] ?? "#ed7d31",
                        accent3: workbookThemeAccentColors[2] ?? "#a5a5a5",
                        accent4: workbookThemeAccentColors[3] ?? "#ffc000",
                        accent5: workbookThemeAccentColors[4] ?? "#5b9bd5",
                        accent6: workbookThemeAccentColors[5] ?? "#70ad47",
                      };
                      const textReason = reason ?? (lineTakesNoText ? t("spreadsheet.shapeTextLineUnavailable") : shapeTextPaintDisabledReason);
                      return officeTextEffectsPaneSections({
                        effects: officeTextPaintOfficeEffects(
                          selectedShapeStyle.textPaint,
                          OFFICE_GLOW_SIZES_PT.flatMap((size) =>
                            OFFICE_GLOW_ACCENTS.map((accent) => officeGlowVariation(size, accent, accents[accent])),
                          ),
                        ),
                        accentColors: accents,
                        labels: presentationEffectsPaneLabels(t),
                        disabled: Boolean(textReason),
                        disabledReason: textReason,
                        testIdPrefix: "text-effects",
                        onChange: (kind, value) => {
                          // 3-D Format beyond the top bevel is the words'
                          // statement's (`office-text-3d`).
                          if (kind !== "format3d" && !(OFFICE_TEXT_EFFECT_KINDS as readonly string[]).includes(kind)) return;
                          void editShapeTextPaint((paint) => withOfficeTextEffect(paint, kind, value));
                        },
                        // 3-D Rotation > Keep text flat: the shape's one field
                        // (`object.keepTextFlat`, the label body's `a:flatTx`),
                        // the box Shape Options' Effects shows too.
                        keepTextFlat: {
                          checked: (selectedShapeObject as { keepTextFlat?: unknown }).keepTextFlat === true,
                          onChange: (checked: boolean) =>
                            void executeShapeFormatMutation(
                              "XLSCTL.CONTEXT.SHAPE.EFFECTS.MRAI.APPLY",
                              JSON.stringify({ keepTextFlat: checked }),
                            ),
                        },
                      }, { threeD: "full" });
                    })()
                  : []),
              ],
            },
          ];
        })()
      : [];
  return {
    sheetPictureFormatPaneTabs,
    sheetShapeFormatPaneTabs,
  };
}
