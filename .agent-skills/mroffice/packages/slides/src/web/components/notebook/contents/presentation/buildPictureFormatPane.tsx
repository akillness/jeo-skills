/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Format Picture pane of a selected picture.
 *
 * Moved verbatim from the body of
 * `components/notebook/contents/PresentationWindow.tsx`: the window passes the
 * bindings it used to close over as `ctl` and calls this where the closure was.
 * No hooks run here.
 */

import type { PresentationImageBlock, PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type {
  ReactNode,
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import { OfficeShapeFormatPane } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import {
  Trash2,
  Crop,
  ImagePlus,
  Eraser,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { canEditBlockContent } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { presentationPictureFormatPaneTabs } from "./presentationPictureFormatPaneTabs";
import { presentationModel3dPaneSections } from "./presentationModel3dPane";
import { inspectorChipStyle } from "../../../../lib/presentation/window-chrome-styles";
import {
  normalizeImageBorderColor,
  DEFAULT_IMAGE_BORDER_COLOR,
  normalizeImageBorderWidth,
  DEFAULT_IMAGE_BORDER_WIDTH,
  MAX_IMAGE_BORDER_WIDTH,
  IMAGE_ADJUST_MIN,
  IMAGE_ADJUST_MAX,
  imageCorrectionStoredFromPersisted,
  imageCorrectionDeltaFromStored,
  isNativeImageRecolorMode,
  normalizeImageRecolor,
  NATIVE_IMAGE_RECOLOR_MODES,
  IMAGE_OPACITY_MIN,
  IMAGE_OPACITY_MAX,
  imageTransparencyFromOpacity,
  imageOpacityFromTransparency,
  type NativeImageRecolorMode,
} from "@mrnote/core/web/lib/presentation-image-effects.ts";
import { parseSlideLinkTarget, buildSlideLinkHref, sanitizeBlockHref } from "@mrnote/core/web/lib/presentation-block-fx.ts";
import { hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { isIdentityCrop } from "@mrnote/core/web/lib/presentation-crop-group.ts";
import { imageHasResettableFormatting } from "@mrnote/core/web/lib/presentation-conveniences.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { JSX } from "react/jsx-runtime";
import type { PresentationPictureBorderCommandPayload, PresentationPictureCropCommandAdapter } from "@mrnote/core/web/lib/presentation-command-adapters.ts";
import type { PresentationPictureCropFeatureId } from "@mrnote/core/web/components/notebook/contents/ribbon/commandRegistry.ts";
import type { PresentationTaskPaneDock } from "../../../../lib/presentation/presentationTaskPaneDock";
import type { OfficePictureEffectKind, OfficePictureEffectValues } from "@mrnote/core/web/lib/office-picture-effects.ts";
import { presentationPictureStyleBorder } from "@mrnote/core/web/lib/presentation-picture-style-native.ts";
import { presentationPictureEffectsBlocker } from "../../../../lib/presentation-picture-effects";
import { officeEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import type { OFFICE_GLOW_ACCENTS } from "@mrnote/core/web/lib/office-picture-effects.ts";
import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";

/** The window bindings this reads, passed through unchanged. */






function pictureFormatPaneBorder(block: PresentationImageBlock): {
  color: string;
  shownWidth: number;
  pickWidth: number | undefined;
  style: "solid" | "dashed" | "dotted";
} {
  const styled = presentationPictureStyleBorder(block);
  const ownWidth = normalizeImageBorderWidth(block.borderWidth);
  const rawStyle = styled ? styled.style : block.borderStyle;
  return {
    color: normalizeImageBorderColor(
      styled ? styled.color : block.borderColor,
      DEFAULT_IMAGE_BORDER_COLOR,
    ),
    shownWidth: styled ? styled.widthPx : ownWidth,
    pickWidth:
      styled !== null && styled.widthPx > 0 && !ownWidth
        ? undefined
        : ownWidth || DEFAULT_IMAGE_BORDER_WIDTH,
    style:
      rawStyle === "dashed" || rawStyle === "dotted"
        ? rawStyle
        : ("solid" as const),
  };
}

export interface BuildPictureFormatPaneCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  pictureReplaceBusy: boolean;
  pictureCorrectionsOptionsRef: RefObject<HTMLInputElement | null>;
  pictureTransparencyOptionsRef: RefObject<HTMLInputElement | null>;
  formatPaneOpen: boolean;
  setFormatPaneOpen: Dispatch<SetStateAction<boolean>>;
  formatPaneRequestedTab: { readonly id: string; readonly serial: number; readonly section?: string } | null;
  slides: SlideModel[];
  blockHrefDraft: { blockId: string; text: string; } | null;
  setBlockHrefDraft: Dispatch<SetStateAction<{ blockId: string; text: string; } | null>>;
  cropEditingId: string | null;
  slidesRef: RefObject<SlideModel[]>;
  deckSlideIds: Set<string>;
  renderEyedropper: (onPick: (hex: string) => void, label: string, testId: string, disabled?: boolean) => JSX.Element | null;
  contextualPictureSourcePreserveOnly: boolean;
  contextualPictureSourceReason: string | undefined;
  selectedPictureBorderEditable: boolean;
  selectedPictureTransparencyEditable: boolean;
  selectedPictureCorrectionsEditable: boolean;
  selectedPictureColorEditable: boolean;
  pictureCropCommand: PresentationPictureCropCommandAdapter<PresentationImageBlock, SlideModel>;
  isPictureCropCommandEnabled: (featureId: PresentationPictureCropFeatureId) => boolean;
  replaceBlock: (blockId: string, nextBlock: PresentationBlock) => void;
  taskPaneDock: PresentationTaskPaneDock;
  taskPaneTabsLabel: string;
  formatPaneInFront: boolean;
  renderInspectorGeometry: (block: PresentationBlock) => ReactNode;
  deleteBlock: (blockId: string) => void;
  resetSelectedImage: (blockId: string) => void;
  beginReplaceImage: (blockId: string, trigger?: HTMLElement | null) => void;
  resetImageCrop: (blockId: string) => boolean;
  invokePictureBorder: (payload: Omit<PresentationPictureBorderCommandPayload, "blockId">) => void;
  commitPictureEffect: <K extends OfficePictureEffectKind>(blockId: string, kind: K, value: OfficePictureEffectValues[K] | null) => void;
  /** The deck theme's Accent 1-6 (the Glow presets' colours). */
  deckAccentColors: Readonly<Record<(typeof OFFICE_GLOW_ACCENTS)[number], string>>;
  invokePictureTransparency: (opacity: number) => void;
  invokePictureCorrections: (brightnessDelta: number, contrastDelta: number) => void;
  invokePictureColor: (recolor: NativeImageRecolorMode) => void;
  invokePictureCrop: (blockId: string, mode: "crop" | "fill" | "fit", trigger?: HTMLElement | null) => void;
  updateBlockHref: (blockId: string, value: string, tooltip?: string | null) => void;
  updateImageEffects: (blockId: string, patch: Partial<Pick<PresentationImageBlock, "shadow" | "borderColor" | "borderWidth" | "borderStyle" | "cornerRadius" | "opacity" | "recolor" | "brightness" | "contrast" | "blendMode">>) => void;
  /** The page the deck is (a 3-D model's part is served by it). */
  pageId?: string | null;
  /** Replace a block as the live slide holds it (a change that lands later than it was asked). */
  commitLiveBlock?: (blockId: string, change: (live: PresentationBlock) => PresentationBlock | null) => boolean;
}

export function buildPictureFormatPane(ctl: BuildPictureFormatPaneCtl) {
  const {
    t,
    pictureReplaceBusy,
    pictureCorrectionsOptionsRef,
    pictureTransparencyOptionsRef,
    formatPaneOpen,
    setFormatPaneOpen,
    formatPaneRequestedTab,
    slides,
    blockHrefDraft,
    setBlockHrefDraft,
    cropEditingId,
    slidesRef,
    deckSlideIds,
    renderEyedropper,
    contextualPictureSourcePreserveOnly,
    contextualPictureSourceReason,
    selectedPictureBorderEditable,
    selectedPictureTransparencyEditable,
    selectedPictureCorrectionsEditable,
    selectedPictureColorEditable,
    pictureCropCommand,
    isPictureCropCommandEnabled,
    replaceBlock,
    taskPaneDock,
    taskPaneTabsLabel,
    formatPaneInFront,
    renderInspectorGeometry,
    deleteBlock,
    resetSelectedImage,
    beginReplaceImage,
    resetImageCrop,
    invokePictureBorder,
    commitPictureEffect,
    deckAccentColors,
    invokePictureTransparency,
    invokePictureCorrections,
    invokePictureColor,
    invokePictureCrop,
    updateBlockHref,
    pageId = null,
    commitLiveBlock,
  } = ctl;
  const renderPictureFormatPane = (block: PresentationImageBlock): ReactNode => (
    <OfficeShapeFormatPane
      testIdPrefix="presentation-picture"
      rootTestId="presentation-block-inspector"
      // A picture's own page first: the ribbon's Corrections / Color /
      // Transparency Options land there.
      initialTab="picture"
      requestedTab={formatPaneRequestedTab ?? undefined}
      titleId="presentation-block-inspector-title"
      className={`presentation-window__inspector ${presentationChrome.taskPane}`}
      dockRight={false}
      hidden={!formatPaneInFront}
      style={{ display: formatPaneInFront ? "flex" : "none", padding: 0, gap: 0 }}
      dataAttributes={{ "data-open": formatPaneOpen ? "true" : "false" }}
      dockTabs={taskPaneDock.tabs("format")}
      dockTabsLabel={taskPaneTabsLabel}
      headerActions={
        <button
          type="button"
          onClick={() => deleteBlock(block.id)}
          data-testid="presentation-delete-block"
          aria-label={t("presentation.deleteBlock")}
          title={t("presentation.deleteBlock")}
          className={presentationChrome.taskPaneClose}
        >
          <Trash2 size={15} aria-hidden />
        </button>
      }
      labels={{
        title: t("pictureFormatPane.title"),
        close: t("common.close"),
        apply: t("presentation.ui.shapeFormatPane.apply"),
        cancel: t("common.cancel"),
      }}
      writable={canEditBlockContent(block)}
      onClose={() => setFormatPaneOpen(false)}
      tabs={presentationPictureFormatPaneTabs(
        {
          line: <>
                    <label style={inspectorChipStyle}>
                      {t("presentation.imageBorderColor")}
                      <input
                        type="color"
                        disabled={!selectedPictureBorderEditable}
                        value={pictureFormatPaneBorder(block).color}
                        onChange={(event) =>
                          invokePictureBorder({
                            color: normalizeImageBorderColor(
                              event.target.value,
                              DEFAULT_IMAGE_BORDER_COLOR,
                            ),
                            width: pictureFormatPaneBorder(block).pickWidth,
                            style: pictureFormatPaneBorder(block).style,
                          })
                        }
                        data-testid="presentation-image-border-color"
                        aria-label={t("presentation.imageBorderColor")}
                      />
                      {selectedPictureBorderEditable
                        ? renderEyedropper(
                            (hex) =>
                              invokePictureBorder({
                                color: normalizeImageBorderColor(
                                  hex,
                                  DEFAULT_IMAGE_BORDER_COLOR,
                                ),
                                width: pictureFormatPaneBorder(block).pickWidth,
                                style: pictureFormatPaneBorder(block).style,
                              }),
                            t("presentation.eyedropper"),
                            "presentation-image-border-eyedropper",
                          )
                        : null}
                    </label>
                    <label style={inspectorChipStyle}>
                      {t("presentation.imageBorderWidth")}
                      <input
                        type="number"
                        min={0}
                        max={MAX_IMAGE_BORDER_WIDTH}
                        step={0.25}
                        disabled={!selectedPictureBorderEditable}
                        value={pictureFormatPaneBorder(block).shownWidth}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          const width = normalizeImageBorderWidth(
                            Number.isFinite(next) ? next : 0,
                          );
                          invokePictureBorder(
                            width > 0
                              ? {
                                  color: pictureFormatPaneBorder(block).color,
                                  width,
                                  style: pictureFormatPaneBorder(block).style,
                                }
                              : { style: "none" },
                          );
                        }}
                        style={{ width: 56 }}
                        data-testid="presentation-image-border-width"
                        aria-label={t("presentation.imageBorderWidth")}
                      />
                    </label>

      </>,
          // The older shadow switch, while it is on: Off is No Shadow (the
          // switch and a stated shadow both go).
          shadow: block.shadow === true ? <>
                    <label style={inspectorChipStyle}>
                      <input
                        type="checkbox"
                        checked
                        disabled={!canEditBlockContent(block)}
                        onChange={() => commitPictureEffect(block.id, "shadow", null)}
                        data-testid="presentation-image-shadow"
                      />
                      {t("presentation.imageShadow")}
                    </label>
      </> : null,
          // Format Picture > Effects, as PowerPoint draws it: the picture's
          // combinable `pictureEffects`, the Picture Effects menu's model.
          model3d: presentationModel3dPaneSections({
            block,
            pageId,
            writable: canEditBlockContent(block),
            labels: {
              title: t("pictureFormatPane.model3dRotation"),
              x: t("office.chartElements.xRotation"),
              y: t("office.chartElements.yRotation"),
              z: t("office.effectsPane.zRotation"),
              failed: t("pictureFormatPane.model3dTurnFailed"),
            },
            replaceBlock,
            commitLiveBlock,
            onFailed: (message) => {
              if (typeof window !== "undefined") window.alert(message);
            },
          }),
          effects: officeEffectsPaneSections({
            effects: block.pictureEffects,
            accentColors: deckAccentColors,
            labels: presentationEffectsPaneLabels(t),
            disabled: !canEditBlockContent(block) || presentationPictureEffectsBlocker(block) !== null,
            disabledReason:
              presentationPictureEffectsBlocker(block) === "preserved" ? t("presentation.shapeEffectsUnavailable") : undefined,
            testIdPrefix: "effects",
            onChange: (kind, value) => commitPictureEffect(block.id, kind, value),
          }),
          geometry: renderInspectorGeometry(block),
          caption: <>
                  <input
                    value={block.caption || ""}
                    onChange={(event) =>
                      replaceBlock(block.id, {
                        ...block,
                        caption: event.target.value,
                      } satisfies PresentationImageBlock)
                    }
                    placeholder={t("presentation.captionPlaceholder")}
                    data-testid="presentation-image-caption"
                  />
      </>,
          link: <>
                {(() => {
                  // The block's href can be EITHER an external web/mail URL OR
                  // an internal `slide://<id>` link. The slide <select> drives
                  // the internal case (validated against existing slides); the
                  // URL <input> drives the external case. They are mutually
                  // exclusive: picking a slide sets a `slide://` href, typing a
                  // URL replaces it. The URL field hides a `slide://` value (it
                  // is not a navigable URL) so the two controls never fight.
                  const slideLinkId = parseSlideLinkTarget(
                    block.href,
                    deckSlideIds,
                  );
                  const externalHrefValue =
                    typeof block.href === "string" && !slideLinkId
                      ? block.href
                      : "";
                  return (
                    <>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        {t("presentation.linkSlideLabel")}
                        <select
                          value={slideLinkId ?? ""}
                          onChange={(event) => {
                            const id = event.target.value;
                            // Empty → clear; a slide id → a `slide://` href the
                            // sanitizer round-trips against the live deck.
                            updateBlockHref(
                              block.id,
                              id ? (buildSlideLinkHref(id) ?? "") : "",
                            );
                          }}
                          data-testid="presentation-block-slide-link"
                          aria-label={t("presentation.linkSlideLabel")}
                        >
                          <option value="">
                            {t("presentation.linkSlideNone")}
                          </option>
                          {slides.map((slide, index) => (
                            <option key={slide.id} value={slide.id}>
                              {t("presentation.linkSlideOption", {
                                index: index + 1,
                                title:
                                  slide.title.trim() ||
                                  t("presentation.untitledSlide"),
                              })}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        {t("presentation.link")}
                        <input
                          type="url"
                          // The field holds what is being typed; the block
                          // takes it once it is an address the link rule
                          // accepts ("h", "https:" are on the way to one and
                          // were wiped at every key, PPT-B298). Leaving the
                          // field drops a draft that never became one.
                          value={
                            blockHrefDraft?.blockId === block.id
                              ? blockHrefDraft.text
                              : externalHrefValue
                          }
                          onChange={(event) => {
                            const text = event.target.value;
                            setBlockHrefDraft({ blockId: block.id, text });
                            if (
                              text.trim() === "" ||
                              sanitizeBlockHref(
                                text,
                                new Set(slidesRef.current.map((slide) => slide.id)),
                              )
                            ) {
                              updateBlockHref(block.id, text);
                            }
                          }}
                          onBlur={() => setBlockHrefDraft(null)}
                          placeholder={t("presentation.linkPlaceholder")}
                          data-testid="presentation-block-href"
                          aria-label={t("presentation.link")}
                        />
                      </label>
                    </>
                  );
                })()}
      </>,
          corrections: <>
                    <label style={inspectorChipStyle}>
                      {t("presentation.imageBrightness")}
                      <input
                        ref={pictureCorrectionsOptionsRef}
                        type="range"
                        min={IMAGE_ADJUST_MIN}
                        max={IMAGE_ADJUST_MAX}
                        step={5}
                        value={imageCorrectionStoredFromPersisted(
                          block.brightness,
                        )}
                        disabled={!selectedPictureCorrectionsEditable}
                        onChange={(event) => {
                          const next = Number.parseInt(event.target.value, 10);
                          invokePictureCorrections(
                            imageCorrectionDeltaFromStored(
                              Number.isFinite(next) ? next : 100,
                            ),
                            imageCorrectionDeltaFromStored(
                              block.contrast,
                            ),
                          );
                        }}
                        style={{ width: 80 }}
                        data-testid="presentation-image-brightness"
                        aria-label={t("presentation.imageBrightness")}
                      />
                    </label>
                    <label style={inspectorChipStyle}>
                      {t("presentation.imageContrast")}
                      <input
                        type="range"
                        min={IMAGE_ADJUST_MIN}
                        max={IMAGE_ADJUST_MAX}
                        step={5}
                        value={imageCorrectionStoredFromPersisted(
                          block.contrast,
                        )}
                        disabled={!selectedPictureCorrectionsEditable}
                        onChange={(event) => {
                          const next = Number.parseInt(event.target.value, 10);
                          invokePictureCorrections(
                            imageCorrectionDeltaFromStored(
                              block.brightness,
                            ),
                            imageCorrectionDeltaFromStored(
                              Number.isFinite(next) ? next : 100,
                            ),
                          );
                        }}
                        style={{ width: 80 }}
                        data-testid="presentation-image-contrast"
                        aria-label={t("presentation.imageContrast")}
                      />
                    </label>
      </>,
          color: <>
                    <label style={inspectorChipStyle}>
                      {t("presentation.imageRecolor")}
                      <select
                        value={
                          block.recolor === undefined
                            ? "none"
                            : isNativeImageRecolorMode(block.recolor)
                              ? block.recolor
                              : ""
                        }
                        disabled={!selectedPictureColorEditable}
                        onChange={(event) => {
                          const recolor = event.target.value;
                          if (isNativeImageRecolorMode(recolor)) {
                            invokePictureColor(recolor);
                          }
                        }}
                        data-testid="presentation-image-recolor"
                        aria-label={t("presentation.imageRecolor")}
                      >
                        {block.recolor !== undefined &&
                        !isNativeImageRecolorMode(block.recolor) ? (
                          <option value="" disabled>
                            {t(
                              `presentation.imageRecolorMode.${normalizeImageRecolor(block.recolor)}` as "presentation.imageRecolorMode.none",
                            )}
                          </option>
                        ) : null}
                        {NATIVE_IMAGE_RECOLOR_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {t(
                              `presentation.imageRecolorMode.${mode}` as "presentation.imageRecolorMode.none",
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
      </>,
          transparency: <>
                    <label style={inspectorChipStyle}>
                      {t("presentation.imageOpacity")}
                      <input
                        ref={pictureTransparencyOptionsRef}
                        type="range"
                        min={IMAGE_OPACITY_MIN}
                        max={IMAGE_OPACITY_MAX}
                        step={5}
                        value={imageTransparencyFromOpacity(
                          block.opacity,
                        )}
                        disabled={!selectedPictureTransparencyEditable}
                        onChange={(event) => {
                          const next = Number.parseInt(event.target.value, 10);
                          invokePictureTransparency(
                            imageOpacityFromTransparency(
                              Number.isFinite(next) ? next : 0,
                            ),
                          );
                        }}
                        style={{ width: 80 }}
                        data-testid="presentation-image-opacity"
                        aria-label={t("presentation.imageOpacity")}
                      />
                    </label>
      </>,
          crop: hasLayoutGeometry(block) ? (
<div
                      className="presentation-window__crop-controls"
                      data-testid="presentation-crop-controls"
                      style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                    >
                      <button
                        type="button"
                        className={dialogParts.compactButton}
                        onClick={(event) =>
                          invokePictureCrop(
                            block.id,
                            "crop",
                            event.currentTarget,
                          )
                        }
                        disabled={
                          !isPictureCropCommandEnabled(
                            pictureCropCommand.featureIds.crop,
                          )
                        }
                        aria-pressed={cropEditingId === block.id}
                        data-testid="presentation-crop-toggle"
                        title={t("presentation.crop.toggle")}
                        style={
                          cropEditingId === block.id
                            ? { background: "var(--office-dialog-accent-soft)" }
                            : undefined
                        }
                      >
                        <Crop size={13} aria-hidden="true" />
                        {t("presentation.crop.toggle")}
                      </button>
                      <button
                        type="button"
                        className={dialogParts.compactButton}
                        onClick={() => resetImageCrop(block.id)}
                        disabled={
                          !block.cropRect ||
                          isIdentityCrop(block.cropRect) ||
                          !isPictureCropCommandEnabled(
                            pictureCropCommand.featureIds.crop,
                          )
                        }
                        data-testid="presentation-crop-reset"
                        title={t("presentation.crop.reset")}
                      >
                        {t("presentation.crop.reset")}
                      </button>
                    </div>
          ) : null,
          actions: <div
                    className="presentation-window__picture-actions"
                    data-testid="presentation-picture-actions"
                    style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                  >
                    <button
                      type="button"
                      className={dialogParts.compactButton}
                      onClick={(event) =>
                        beginReplaceImage(
                          block.id,
                          event.currentTarget,
                        )
                      }
                      disabled={
                        pictureReplaceBusy ||
                        contextualPictureSourcePreserveOnly
                      }
                      aria-busy={pictureReplaceBusy}
                      data-testid="presentation-image-replace"
                      title={
                        contextualPictureSourceReason ??
                        t("presentation.image.replace")
                      }
                      aria-label={
                        contextualPictureSourceReason
                          ? `${t("presentation.image.replace")}: ${contextualPictureSourceReason}`
                          : t("presentation.image.replace")
                      }
                    >
                      <ImagePlus size={13} aria-hidden="true" />
                      {t("presentation.image.replace")}
                    </button>
                    <button
                      type="button"
                      className={dialogParts.compactButton}
                      onClick={() => resetSelectedImage(block.id)}
                      disabled={
                        contextualPictureSourcePreserveOnly ||
                        !imageHasResettableFormatting(block)
                      }
                      data-testid="presentation-image-reset"
                      title={
                        contextualPictureSourceReason ??
                        t("presentation.image.reset")
                      }
                      aria-label={
                        contextualPictureSourceReason
                          ? `${t("presentation.image.reset")}: ${contextualPictureSourceReason}`
                          : t("presentation.image.reset")
                      }
                    >
                      <Eraser size={13} aria-hidden="true" />
                      {t("presentation.image.reset")}
                    </button>
                  </div>,
        },
        {
          fillLine: t("pictureFormatPane.tab_fillLine"),
          line: t("pictureFormatPane.line"),
          effects: t("pictureFormatPane.tab_effects"),
          shadow: t("presentation.imageShadow"),
          sizeProperties: t("presentation.ui.shapeFormatPane.sizeProperties"),
          size: t("presentation.smartartContext.sizeGroup"),
          link: t("presentation.link"),
          picture: t("pictureFormatPane.tab_picture"),
          corrections: t("presentation.pictureFormat.corrections"),
          color: t("pictureFormatPane.pictureColor"),
          transparency: t("pictureFormatPane.transparencySection"),
          crop: t("pictureFormatPane.crop"),
          model3d: t("pictureFormatPane.tab_model3d"),
        },
      )}
    />
  );
  return renderPictureFormatPane;
}
