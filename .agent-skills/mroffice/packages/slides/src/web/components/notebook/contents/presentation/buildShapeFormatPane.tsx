/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Format Shape pane of a selected shape.
 *
 * Moved verbatim from the body of
 * `components/notebook/contents/PresentationWindow.tsx`: the window passes the
 * bindings it used to close over as `ctl` and calls this where the closure was.
 * No hooks run here.
 */

import type { OfficeGroupCameraControl } from "@mrnote/core/web/lib/office-group-camera.ts";
import type { PresentationShapeBlock, PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { ReactNode, Dispatch, SetStateAction } from "react";
import {
  normalizeShapeKind,
  normalizeShapeColor,
  DEFAULT_SHAPE_FILL,
  SHAPE_KINDS,
  SHAPE_FILL_IMAGE_FITS,
  DEFAULT_SHAPE_STROKE,
  SHAPE_OPACITY_MAX,
  normalizeShapeOpacity,
  normalizeShapeBlendMode,
  SHAPE_BLEND_MODES,
} from "@mrnote/core/web/lib/presentation-shapes.ts";
import { presentationShapeOutlineIsPreserveOnly } from "@mrnote/core/web/lib/presentation-shape-buttons.ts";
import { eyedropperCapability, applyPickedColor } from "../../../../lib/presentation/eyedropper";
import {
  Pipette,
  ImagePlus,
  X,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { type OfficeShapeFormatPaneField, OfficeShapeFormatPane, type OfficeShapeFormatPaneTab } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { presentationCanChangeToShape, presentationCanChangeShape, presentationShapeShownOutlineWidth } from "@mrnote/core/web/lib/presentation-shape-style-adapter.ts";
import { presentationShapeKindMessageKey } from "../../../../lib/presentation/ribbon-tabs";
import { inspectorChipStyle } from "../../../../lib/presentation/window-chrome-styles";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { officeChartFillLineSections, officePictureFillPaneArgs } from "@mrnote/core/web/components/office-ribbon/officeChartFillLinePage.tsx";
import { officePictureFillOptionsOf, type OfficePictureFillOptions } from "@mrnote/core/web/lib/office-picture-fill-options.ts";
import { pickOfficePictureFill } from "@mrnote/core/web/lib/office-picture-fill.ts";
import type { OfficeLineEndsState } from "@mrnote/core/web/lib/office-line-ends.ts";
import { presentationShapeFillLineChange, presentationShapeFillLineStyle } from "./presentationShapeFillLine";
import { presentationShapeEffectsPaneSections } from "./presentationShapeEffectsPane";
import { canEditBlockContent } from "@mrnote/core/web/lib/presentation-text-case.ts";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { presentationShapeBlockTakesText } from "../../../../lib/presentation/text-editing-host";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { JSX } from "react/jsx-runtime";
import type { PresentationTaskPaneDock } from "../../../../lib/presentation/presentationTaskPaneDock";
import type { PresentationTextFrameBlock } from "../../../../lib/presentation-text-frame-options";

/** The window bindings this reads, passed through unchanged. */
export interface BuildShapeFormatPaneCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  formatPaneOpen: boolean;
  setFormatPaneOpen: Dispatch<SetStateAction<boolean>>;
  formatPaneRequestedTab: { readonly id: string; readonly serial: number; readonly section?: string } | null;
  renderEyedropper: (onPick: (hex: string) => void, label: string, testId: string, disabled?: boolean) => JSX.Element | null;
  themeAccentColors: string[];
  taskPaneDock: PresentationTaskPaneDock;
  taskPaneTabsLabel: string;
  formatPaneInFront: boolean;
  renderInspectorGeometry: (block: PresentationBlock) => ReactNode;
  writeShapeAltText: (blockId: string, text: string, decorative: boolean) => boolean;
  textOptionsTabFor: (block: PresentationTextFrameBlock) => OfficeShapeFormatPaneTab;
  formatPaneLinkFields: (record: Record<string, unknown>, block: { id: string; }) => OfficeShapeFormatPaneField[];
  deleteBlock: (blockId: string) => void;
  updateShapeBlock: (blockId: string, patch: Partial<PresentationShapeBlock>) => boolean;
  updateShapeFillImage: (blockId: string, patch: { url?: string; fit?: string; options?: OfficePictureFillOptions }) => void;
  beginShapeFillImageUpload: (blockId: string) => void;
  /** The gradient stop each gradient editor of the pane has selected. */
  shapePaneStops: { readonly fill: number; readonly line: number };
  setShapePaneStops: Dispatch<SetStateAction<{ readonly fill: number; readonly line: number }>>;
  /** The selected line's Begin / End Arrow (`enabled`: it takes them) and their writer. */
  shapeLineEnds: { readonly value: OfficeLineEndsState | null; readonly enabled: boolean; readonly write: (ends: OfficeLineEndsState) => void };
  







  /** The camera of the group the shape is in (Format Shape > 3-D Rotation edits the group's). */
  groupCameraFor?: (block: PresentationShapeBlock) => OfficeGroupCameraControl | undefined;
  group?: {
    readonly blocks: readonly PresentationShapeBlock[];
    readonly update: (patchOf: (target: PresentationShapeBlock) => Partial<PresentationShapeBlock> | null) => boolean;
    readonly remove: () => void;
  };
}

export function buildShapeFormatPane(ctl: BuildShapeFormatPaneCtl) {
  const {
    t,
    formatPaneOpen,
    setFormatPaneOpen,
    formatPaneRequestedTab,
    renderEyedropper,
    themeAccentColors,
    taskPaneDock,
    taskPaneTabsLabel,
    formatPaneInFront,
    renderInspectorGeometry,
    writeShapeAltText,
    textOptionsTabFor,
    formatPaneLinkFields,
    deleteBlock,
    updateShapeBlock,
    updateShapeFillImage,
    beginShapeFillImageUpload,
    shapePaneStops,
    setShapePaneStops,
    shapeLineEnds,
    group,
    groupCameraFor,
  } = ctl;
  const renderShapeFormatPane = (block: PresentationShapeBlock): ReactNode => {
    // One shape's change, or every selected shape's, each from its own state.
    const update = (patchOf: (target: PresentationShapeBlock) => Partial<PresentationShapeBlock> | null): boolean => {
      if (group) return group.update(patchOf);
      const patch = patchOf(block);
      return patch ? updateShapeBlock(block.id, patch) : false;
    };
    const shapeKind = normalizeShapeKind(block.shape);
    const isLinear = shapeKind === "line" || shapeKind === "arrow";
    const outlineIsWritable = !presentationShapeOutlineIsPreserveOnly(block);
    const record = block as Record<string, unknown>;
    const outlineReason = outlineIsWritable ? undefined : t("presentation.changeShapeUnavailable");
    const eyeDropper = eyedropperCapability(
      typeof window === "undefined"
        ? undefined
        : (window as unknown as { EyeDropper?: unknown }),
      false,
    );
    const fillExtra = (
      <>
        {/* Eyedropper (取色器): lift a colour from the screen where the
            browser offers a picker, and say so plainly where it does not. */}
        <button
          type="button"
          data-testid="presentation-eyedropper-fill"
          disabled={eyeDropper.source === "unavailable"}
          aria-label={t("presentation.ui.eyedropper")}
          title={t("presentation.ui.eyedropper")}
          onClick={async () => {
            const scope = window as unknown as {
              EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
            };
            if (!scope.EyeDropper) return;
            try {
              const picked = await new scope.EyeDropper().open();
              const applied = applyPickedColor(picked, "fill");
              if (!applied) return;
              update(() => ({ fill: applied.color }));
            } catch {
              // The user dismissed the picker; nothing to apply.
            }
          }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            border: "1px solid #d1d5db",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Pipette size={13} aria-hidden />
        </button>
        {/* Theme-accent fill swatches beside the custom colour input. Empty
            for a themeless deck. */}
        {themeAccentColors.map((c) => (
          <button
            key={`theme-fill-${c}`}
            type="button"
            data-testid="presentation-shape-fill-theme"
            data-color={c}
            aria-label={`${t("presentation.theme.accentSwatchLabel")} ${c}`}
            title={t("presentation.theme.accentSwatchLabel")}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: c,
              border: "1px solid #d1d5db",
              cursor: "pointer",
              padding: 0,
            }}
            onClick={() =>
              update(() => ({
                fill: normalizeShapeColor(c, DEFAULT_SHAPE_FILL),
              }))
            }
          />
        ))}
        {renderEyedropper(
          (hex) =>
            update(() => ({
              fill: normalizeShapeColor(hex, DEFAULT_SHAPE_FILL),
            })),
          t("presentation.eyedropper"),
          "presentation-shape-fill-eyedropper",
        )}
      </>
    );
    // PowerPoint's Format Shape > Fill & Line: a Fill section whose choice
    // (No fill / Solid fill / Gradient fill / Picture or texture fill)
    // decides the rows under it, and a Line section (No line / Solid line /
    // Gradient line) likewise (Microsoft Support, "Change the color of a
    // shape" / "Add a gradient fill to a shape" / "Use a picture to fill a
    // shape"). The deck's pane had a colour well, a picture row and two
    // gradient check boxes and no way to say "none".
    const fillType = (() => {
      if (block.fill === "none") return "none";
      if (typeof block.fillImage?.url === "string" && block.fillImage.url) return "picture";
      if (typeof block.fillTo === "string") return "gradient";
      return "solid";
    })();
    const solidFill = normalizeShapeColor(block.fill, DEFAULT_SHAPE_FILL);
    const kindField: OfficeShapeFormatPaneField = {
      kind: "select",
      id: "kind",
      label: t("presentation.shapeKind"),
      value: shapeKind,
      options: SHAPE_KINDS.filter(
        (value) => value === shapeKind || presentationCanChangeToShape(value),
      ).map((value) => ({ value, label: t(presentationShapeKindMessageKey(value)) })),
      // No line-to-box fill seeding: a line or arrow is a connector, and
      // Change Shape does not apply to one (Office: "this feature button
      // does not apply to Line and Line Arrow shapes").
      disabled: !presentationCanChangeShape(block),
      disabledReason: !presentationCanChangeShape(block)
        ? t("presentation.changeShapeUnavailable")
        : undefined,
      onChange: (value) => update(() => ({ shape: normalizeShapeKind(value) })),
    };
    // The colours a fill or line turned on starts from: what the shape last
    // stated, else the deck's own default (never "none").
    const strokeSeed = (() => {
      const stroke = normalizeShapeColor(block.stroke, DEFAULT_SHAPE_STROKE);
      return stroke && stroke !== "none" ? stroke : DEFAULT_SHAPE_STROKE;
    })();
    const fillSeed = solidFill && solidFill !== "none" ? solidFill : DEFAULT_SHAPE_FILL;
    const fillColorRow: OfficeShapeFormatPaneField = {
      kind: "color",
      id: "fill",
      label: t("presentation.textOptions.color"),
      value: fillSeed,
      // A new colour keeps the fill's Transparency, as the pane's slider does.
      onChange: (value) =>
        update((target) => ({
          fill: normalizeShapeColor(value, DEFAULT_SHAPE_FILL),
          fillTransparency: target.fillTransparency,
        })),
      extra: fillExtra,
    };
    const lineColorRow: OfficeShapeFormatPaneField = {
      kind: "color",
      id: "stroke",
      label: t("presentation.textOptions.color"),
      value: strokeSeed,
      disabled: !outlineIsWritable,
      disabledReason: outlineReason,
      onChange: (value) =>
        update((target) => ({
          ...presentationShapeShownOutlineWidth(target),
          stroke: normalizeShapeColor(value, DEFAULT_SHAPE_STROKE),
          outlineTransparency: (target as Record<string, unknown>).outlineTransparency as number | undefined,
        })),
      extra: renderEyedropper(
        (hex) =>
          update((target) => ({
            ...presentationShapeShownOutlineWidth(target),
            stroke: normalizeShapeColor(hex, DEFAULT_SHAPE_STROKE),
          })),
        t("presentation.eyedropper"),
        "presentation-shape-stroke-eyedropper",
        !outlineIsWritable,
      ),
    };
    const pictureFields: OfficeShapeFormatPaneField[] = [
            {
              // PICTURE FILL -- box / polygon shapes only (PowerPoint "Picture
              // or texture fill"). A url + fit + upload from file; when set
              // the picture replaces the colour / gradient fill. Clearing the
              // url drops it back to the colour fill (byte-clean).
              kind: "custom",
              id: "fill-image",
              render: (
                <span style={inspectorChipStyle}>
                  {t("presentation.shapeFillPicture")}
                  <input
                    type="text"
                    value={(block.fillImage?.url as string) ?? ""}
                    onChange={(event) =>
                      updateShapeFillImage(block.id, { url: event.target.value })
                    }
                    placeholder={t("presentation.bgPictureUrlPlaceholder")}
                    data-testid="presentation-shape-fill-image-url"
                    aria-label={t("presentation.shapeFillPicture")}
                    style={{ width: 140, fontSize: 12 }}
                  />
                  <select
                    value={(block.fillImage?.fit as string) ?? "cover"}
                    onChange={(event) =>
                      updateShapeFillImage(block.id, { fit: event.target.value })
                    }
                    data-testid="presentation-shape-fill-image-fit"
                    aria-label={t("presentation.bgPictureFitLabel")}
                  >
                    {SHAPE_FILL_IMAGE_FITS.map((fit) => (
                      <option key={fit} value={fit}>
                        {t(`presentation.bgPictureFit.${fit}` as "presentation.bgPictureFit.cover")}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => beginShapeFillImageUpload(block.id)}
                    data-testid="presentation-shape-fill-image-upload"
                    title={t("presentation.bgPictureUpload")}
                    aria-label={t("presentation.bgPictureUpload")}
                  >
                    <ImagePlus size={13} />
                  </button>
                  {block.fillImage ? (
                    <button
                      type="button"
                      onClick={() => updateShapeFillImage(block.id, { url: "" })}
                      data-testid="presentation-shape-fill-image-clear"
                      title={t("presentation.shapeFillPictureClear")}
                      aria-label={t("presentation.shapeFillPictureClear")}
                    >
                      <X size={13} />
                    </button>
                  ) : null}
                </span>
              ),
            },
    ];
    // Format Shape > Fill & Line as Office lists it, through the page chart
    // elements use (Microsoft Support, "Change the color of a shape", "Add a
    // gradient fill to a shape", "Use a picture to fill a shape"): No fill,
    // Solid fill and its Transparency, Gradient fill with its presets, type,
    // direction, angle and stops, Picture or texture fill, Pattern fill
    // (Office's 48); No line, Solid line and its Transparency, Gradient line,
    // Width, Compound, Dash, Cap, Join, and Begin / End Arrow on a line.
    const paneStyle = presentationShapeFillLineStyle(block, shapeLineEnds.value);
    const word = (key: string, _zh: string, en: string, values?: Record<string, string | number>) =>
      (t.has as (key: string) => boolean)(key) ? (t as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values) : en;
    const fillLineSections = officeChartFillLineSections({
      style: paneStyle,
      area: "shape",
      fillAvailable: !isLinear,
      disabledReason: canEditBlockContent(block) ? null : t("presentation.changeShapeUnavailable"),
      word,
      fillColorRow,
      lineColorRow,
      automaticFill: fillSeed,
      automaticLine: strokeSeed,
      selectedStop: shapePaneStops,
      onSelectStop: (target, index) => setShapePaneStops((current) => ({ ...current, [target]: index })),
      onStyle: (next) => {
        const change = presentationShapeFillLineChange(block, paneStyle, next);
        if (change.patch) update((target) => presentationShapeFillLineChange(target, paneStyle, next).patch);
        if (change.ends && shapeLineEnds.enabled) shapeLineEnds.write(change.ends);
      },
      noAutomatic: true,
      // Picture or texture fill: the deck's own source row (URL, fit,
      // upload, clear), then Office's options through the shared builder.
      pictureFill: isLinear || group
        ? undefined
        : officePictureFillPaneArgs({
            active: fillType === "picture",
            label: t("presentation.shapeFillPicture"),
            buttonLabel: t("office.shapeFill.picture"),
            disabled: !canEditBlockContent(block),
            onPick: () => beginShapeFillImageUpload(block.id),
            // Texture: the gallery's texture tiled as Office tiles one; the
            // fill's Transparency and Rotate with shape stay.
            onTexture: (id) =>
              pickOfficePictureFill((src, tile) => {
                if (!src || !tile) return;
                const kept = officePictureFillOptionsOf(block.fillImage);
                updateShapeFillImage(block.id, {
                  url: src,
                  options: {
                    tile,
                    ...(kept.transparency !== undefined ? { transparency: kept.transparency } : {}),
                    ...(kept.rotWithShape !== undefined ? { rotWithShape: kept.rotWithShape } : {}),
                  },
                });
              }, `texture:${id}`),
            sourceExtra: pictureFields,
            options: block.fillImage?.url
              ? {
                  value: officePictureFillOptionsOf(block.fillImage),
                  word,
                  onChange: (next) => updateShapeFillImage(block.id, { options: next }),
                }
              : undefined,
          }),
      openLine: shapeLineEnds.enabled,
      lineJoinDefault: "miter",
      lineSectionTitle: "line",
    }).map((section) =>
      // A line the deck keeps as the file's (preserve-only) is not written here.
      section.id === "line" && !outlineIsWritable
        ? {
            ...section,
            fields: section.fields.map((field) =>
              field.kind === "custom" ? field : { ...field, disabled: true, disabledReason: outlineReason },
            ),
          }
        : section,
    );
    // Format Shape > Effects, as PowerPoint draws it (Shadow, Reflection,
    // Glow, Soft Edges, 3-D Format, 3-D Rotation): the shape's combinable
    // `shapeEffects`, the builder a text box's pane shares. Keep text flat on
    // a shape holding words. The deck's own object transparency and blend
    // follow.
    const officeEffects = presentationShapeEffectsPaneSections({
      block,
      themeAccentColors,
      t,
      disabled: !canEditBlockContent(block),
      update,
      holdsWords: typeof block.text === "string" && block.text.trim() !== "",
      groupCamera: groupCameraFor?.(block),
    });
    const effects: OfficeShapeFormatPaneField[] = [
      {
        kind: "custom",
        id: "opacity-field",
        render: (
          <label style={inspectorChipStyle}>
            {t("presentation.shapeOpacity")}
            {/* The slider is Transparency, as the picture's is: 0 is opaque
                and 100 clear. The shape stores its visible opacity, so the
                two are complements; reading the opacity straight made 100
                solid and 0 vanish (PPT-B162). */}
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={SHAPE_OPACITY_MAX - normalizeShapeOpacity(block.opacity)}
              disabled={!canEditBlockContent(block)}
              onChange={(event) => {
                const next = normalizeShapeOpacity(
                  SHAPE_OPACITY_MAX - Number(event.target.value),
                );
                update(() => ({
                  opacity: next >= SHAPE_OPACITY_MAX ? undefined : next,
                }));
              }}
              data-testid="presentation-shape-opacity"
            />
          </label>
        ),
      },
      {
        kind: "select",
        id: "blend",
        label: t("presentation.blendMode"),
        value: normalizeShapeBlendMode(record.blendMode),
        options: SHAPE_BLEND_MODES.map((mode) => ({
          value: mode,
          label: t(`presentation.blendModeOption.${mode}` as "presentation.blendModeOption.normal"),
        })),
        onChange: (value) => {
          const next = normalizeShapeBlendMode(value);
          update(() => ({ blendMode: next === "normal" ? undefined : next }));
        },
      },
    ];
    return (
      <OfficeShapeFormatPane
        testIdPrefix="presentation-shape"
        rootTestId="presentation-block-inspector"
        requestedTab={formatPaneRequestedTab ?? undefined}
        titleId="presentation-block-inspector-title"
        className={`presentation-window__inspector ${presentationChrome.taskPane}`}
        dockRight={false}
        hidden={!formatPaneInFront}
        // The inspector's tests read the inline display, as the generic
        // inspector sets it; the inspector class places the pane (absolute,
        // right of the stage) but its grid and padding are the generic
        // inspector's own, and the shared pane's column takes their place.
        style={{ display: formatPaneInFront ? "flex" : "none", padding: 0, gap: 0 }}
        dataAttributes={{ "data-open": formatPaneOpen ? "true" : "false" }}
        dockTabs={taskPaneDock.tabs("format")}
        dockTabsLabel={taskPaneTabsLabel}
        headerActions={
          // A labelled Delete, as the generic inspector shows it: in the
          // close button's round look the trash read as a second close.
          <button
            type="button"
            onClick={() => (group ? group.remove() : deleteBlock(block.id))}
            data-testid="presentation-delete-block"
            title={t("presentation.deleteBlock")}
            className={dialogParts.compactButton}
            data-tone="danger"
          >
            <Trash2 size={13} aria-hidden />
            {t("presentation.deleteBlock")}
          </button>
        }
        labels={{
          title: t("presentation.ui.shapeFormatPane.title"),
          close: t("common.close"),
          apply: t("presentation.ui.shapeFormatPane.apply"),
          cancel: t("common.cancel"),
        }}
        writable={canEditBlockContent(block)}
        onClose={() => setFormatPaneOpen(false)}
        tabs={[
          {
            id: "shape",
            label: t("presentation.ui.shapeFormatPane.shapeOptions"),
            sections: [
              {
                id: "fields",
                testId: "presentation-shape-fields",
                title: t("presentation.ui.shapeFormatPane.fillLine"),
                fields: [kindField],
              },
              ...fillLineSections,
              // The deck's own object transparency and blend (not Office's
              // Effects), after the line.
              { id: "effects", title: t("presentation.shapeOpacity"), fields: effects },
            ],
          },
          {
            id: "office-effects",
            label: t("presentation.ui.shapeFormatPane.effects"),
            sections: officeEffects,
          },
          ...(group ? [] : ([{
            id: "size",
            label: t("presentation.ui.shapeFormatPane.sizeProperties"),
            sections: [
              {
                id: "geometry",
                title: t("presentation.smartartContext.sizeGroup"),
                fields: [
                  { kind: "custom", id: "geometry", render: renderInspectorGeometry(block) },
                ],
              },
              {
                // Alt Text lives under Size & Properties in PowerPoint's pane;
                // the same words the Alt Text dialog writes, through the same
                // block patch (a decorative shape carries no description).
                id: "alt-text",
                title: t("presentation.shapeAltText"),
                fields: [
                  {
                    kind: "textarea",
                    id: "alt",
                    label: t("presentation.ui.shapeFormatPane.description"),
                    value: typeof record.alt === "string" ? record.alt : "",
                    rows: 4,
                    maxLength: 2_000,
                    disabled: record.decorative === true,
                    disabledReason:
                      record.decorative === true
                        ? t("presentation.ui.shapeFormatPane.decorativeNoDescription")
                        : undefined,
                    onCommit: (text) => writeShapeAltText(block.id, text, false),
                  },
                  {
                    kind: "checkbox",
                    id: "decorative",
                    label: t("presentation.ui.shapeFormatPane.markDecorative"),
                    checked: record.decorative === true,
                    onChange: (checked) =>
                      writeShapeAltText(
                        block.id,
                        checked ? "" : typeof record.alt === "string" ? record.alt : "",
                        checked,
                      ),
                  },
                ],
              },
              {
                // PowerPoint hangs a hyperlink on the whole shape (Insert >
                // Link with the shape selected; `a:hlinkClick` on its
                // cNvPr) and an Action Setting that jumps to a slide. The
                // deck's ribbon Link is a text-run command, so the shape's
                // own link lives here, as the inspector carried it before the
                // pane took its place: the slide picker and the URL are
                // mutually exclusive, a slide sets a `slide://` href and a
                // URL replaces it, and an unsafe scheme is dropped at the
                // edge (the writer sanitizes and clears).
                id: "link",
                title: t("presentation.link"),
                fields: formatPaneLinkFields(record, block),
              },
            ],
          }] satisfies OfficeShapeFormatPaneTab[])),
          // Text Options (PPT-A050): a shape that takes words; a line or an
          // arrow holds none.
          ...(presentationShapeBlockTakesText(block) && !group ? [textOptionsTabFor(block)] : []),
        ]}
      />
    );
  };
  return renderShapeFormatPane;
}
