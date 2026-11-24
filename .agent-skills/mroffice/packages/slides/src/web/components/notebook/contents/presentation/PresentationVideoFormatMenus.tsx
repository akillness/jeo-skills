"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type { PresentationEmbedBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { OfficeAdjustSvgFilter } from "@mrnote/core/web/components/office-ribbon/OfficeAdjustSvgFilter.tsx";
import {
  OfficePictureAdjustSample,
  OfficePictureColorMenu,
  OfficePictureCorrectionsMenu,
} from "@mrnote/core/web/components/office-ribbon/OfficePictureAdjustMenus.tsx";
import { OfficePictureStyleGraphic } from "@mrnote/core/web/components/office-ribbon/OfficePictureStyleGraphic.tsx";
import { OFFICE_PICTURE_STYLE_SAMPLE_SRC } from "@mrnote/core/web/components/office-ribbon/OfficePictureStyleGallery.tsx";
import { OfficeStyleGallery } from "@mrnote/core/web/components/office-ribbon/OfficeStyleGallery.tsx";
import { OfficePictureMenuIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficePictureMenuIcon.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  isOfficeRecolorPreset,
  officeAdjustFilterSteps,
  officeRecolorLabelKey,
  OFFICE_RECOLOR_GALLERY_ROWS,
  type OfficeRecolorPresetId,
} from "@mrnote/core/web/lib/office-recolor-presets.ts";
import type { OfficeThemeGridColors } from "@mrnote/core/web/lib/office-theme-color-grid.ts";
import {
  OFFICE_VIDEO_STYLE_GROUPS,
  OFFICE_VIDEO_STYLE_IDS,
  officeVideoStyle,
  officeVideoStyleLabelKey,
  videoStyleAsPictureStyle,
  type OfficeVideoStyleId,
} from "@mrnote/core/web/lib/office-video-styles/catalog.ts";
import {
  videoCorrections,
  videoRecolor,
  videoStyleId,
} from "../../../../lib/presentation-video-format";

/**
 * Video Format > Adjust and Video Styles (PPT-A155), the ribbon's pieces:
 * Corrections and Color are the picture's shared galleries
 * (`OfficePictureAdjustMenus`) with a video's tiles -- 25 brightness /
 * contrast tiles, no sharpness; the 21 Recolor tiles, no saturation, tone or
 * transparent colour -- each drawn through the filter the canvas uses
 * (`office-recolor-presets`); Poster Frame is PowerPoint's three items; the
 * Video Styles gallery is the shared style gallery drawing each of the 41
 * recipes with the picture styles' renderer. The window only wires commits.
 */

function AdjustTile({ steps }: { steps: Parameters<typeof OfficeAdjustSvgFilter>[0]["steps"] }) {
  const id = `video-adjust-tile-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return (
    <>
      <OfficeAdjustSvgFilter id={id} steps={steps} />
      <OfficePictureAdjustSample filter={steps.length ? `url(#${id})` : undefined} />
    </>
  );
}

interface VideoMenuCommon {
  readonly block: PresentationEmbedBlock;
  readonly theme: OfficeThemeGridColors | null;
  readonly trigger: ReactNode;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly onOptions: () => void;
}

export function PresentationVideoCorrectionsMenu({
  block,
  theme,
  trigger,
  disabled,
  disabledReason,
  onOptions,
  onCommit,
}: VideoMenuCommon & { readonly onCommit: (brightness: number, contrast: number) => void }) {
  const t = useTranslations("console-notebooks");
  const recolor = videoRecolor(block);
  const current = videoCorrections(block);
  return (
    <OfficePictureCorrectionsMenu
      trigger={trigger}
      brightnessDelta={current.brightness}
      contrastDelta={current.contrast}
      recolor="none"
      disabled={disabled}
      disabledReason={disabledReason}
      sharpnessUnavailableReason=""
      showSharpness={false}
      renderTileSample={(brightness, contrast) => (
        <AdjustTile
          steps={officeAdjustFilterSteps(
            { recolor: recolor === "washout" ? null : recolor, brightness, contrast },
            theme,
          )}
        />
      )}
      onCommit={onCommit}
      optionsLabel={t("presentation.media.correctionsOptions")}
      onOptions={onOptions}
      testIdPrefix="presentation-ribbon-media-corrections"
    />
  );
}

export function PresentationVideoColorMenu({
  block,
  theme,
  trigger,
  disabled,
  disabledReason,
  onOptions,
  onCommit,
}: VideoMenuCommon & { readonly onCommit: (preset: OfficeRecolorPresetId | null) => void }) {
  const t = useTranslations("console-notebooks");
  const current = videoCorrections(block);
  const corrections = videoRecolor(block) === "washout" ? { brightness: 0, contrast: 0 } : current;
  return (
    <OfficePictureColorMenu
      trigger={trigger}
      recolor="none"
      disabled={disabled}
      disabledReason={disabledReason}
      unavailableReason={t("presentation.pictureRibbon.colorUnavailable")}
      onCommitRecolor={() => undefined}
      showSaturationTone={false}
      showTransparentColor={false}
      recolorGallery={{
        rows: OFFICE_RECOLOR_GALLERY_ROWS,
        value: videoRecolor(block) ?? "none",
        label: (id) => t(officeRecolorLabelKey(id as OfficeRecolorPresetId)),
        renderSample: (id) => (
          <AdjustTile
            steps={officeAdjustFilterSteps(
              {
                recolor: isOfficeRecolorPreset(id) ? id : null,
                ...(id === "washout" ? {} : corrections),
              },
              theme,
            )}
          />
        ),
        onCommit: (id) => onCommit(isOfficeRecolorPreset(id) ? id : null),
      }}
      optionsLabel={t("presentation.media.colorOptions")}
      onOptions={onOptions}
      testIdPrefix="presentation-ribbon-media-color"
    />
  );
}

/**
 * Video Format > Poster Frame: Current Frame (the frame the video shows at
 * its player's position), Image from File..., Reset (the poster the video
 * had). Current Frame needs a player the browser plays; an imported video
 * draws its poster only, and says so.
 */
export function PresentationVideoPosterFrameMenu({
  trigger,
  disabled,
  currentFrameDisabledReason,
  canReset,
  onCurrentFrame,
  onImageFromFile,
  onReset,
}: {
  readonly trigger: ReactElement;
  readonly disabled: boolean;
  readonly currentFrameDisabledReason: string | null;
  readonly canReset: boolean;
  readonly onCurrentFrame: () => void;
  readonly onImageFromFile: () => void;
  readonly onReset: () => void;
}) {
  const t = useTranslations("console-notebooks");
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="docs-cupertino-menu" data-testid="presentation-ribbon-media-poster-frame-menu">
        <DropdownMenuItem
          disabled={currentFrameDisabledReason !== null}
          title={currentFrameDisabledReason ?? t("presentation.media.posterFrameCurrentTip")}
          data-disabled-reason={currentFrameDisabledReason ?? undefined}
          onSelect={onCurrentFrame}
          data-testid="presentation-ribbon-media-poster-frame-current"
        >
          <OfficePictureMenuIcon icon={{ kind: "crop-fit" }} />
          {t("presentation.media.posterFrameCurrent")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onImageFromFile} data-testid="presentation-ribbon-media-poster-frame-file">
          <OfficePictureMenuIcon icon={{ kind: "picture-from-device" }} />
          {t("presentation.media.posterFrameFromFile")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canReset} onSelect={onReset} data-testid="presentation-ribbon-media-poster-frame-reset">
          <OfficePictureMenuIcon icon={{ kind: "picture-reset" }} />
          {t("presentation.media.posterFrameReset")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One Video Styles tile: the recipe drawn by the picture styles' renderer. */
export function PresentationVideoStyleThumbnail({ styleId }: { readonly styleId: OfficeVideoStyleId }) {
  const style = officeVideoStyle(styleId);
  if (!style) return null;
  return (
    <OfficePictureStyleGraphic
      styleId={styleId}
      styleData={videoStyleAsPictureStyle(style)}
      src={OFFICE_PICTURE_STYLE_SAMPLE_SRC}
      widthPx={240}
      heightPx={135}
      decorative
      fillParent
      preview
      testId="presentation-video-style-thumbnail"
      imageTestId="presentation-video-style-thumbnail-image"
    />
  );
}

export function PresentationVideoStylesGallery({
  block,
  disabled,
  disabledReason,
  onPreviewChange,
  onCommit,
  className,
}: {
  readonly block: PresentationEmbedBlock;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly onPreviewChange: (id: OfficeVideoStyleId | null) => void;
  readonly onCommit: (id: OfficeVideoStyleId) => void;
  readonly className?: string;
}) {
  const t = useTranslations("console-notebooks");
  const label = t("presentation.media.videoStylesGallery");
  return (
    <OfficeStyleGallery<OfficeVideoStyleId>
      application="presentation"
      className={className}
      ariaLabel={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
      disabled={disabled}
      menuTile="picture"
      groups={OFFICE_VIDEO_STYLE_GROUPS.map((group) => ({
        id: group.id,
        label: t(`office.videoStyleGroup.${group.id}`),
        itemIds: group.itemIds,
      }))}
      items={OFFICE_VIDEO_STYLE_IDS.map((id) => ({
        id,
        label: t(officeVideoStyleLabelKey(id)),
        disabledReason: disabled ? disabledReason : undefined,
      }))}
      labels={{ more: t("toolbar.quickOverflow") }}
      quickIds={OFFICE_VIDEO_STYLE_IDS.slice(0, 6)}
      visibleItemCount={4}
      value={videoStyleId(block)}
      renderPreview={(item) => <PresentationVideoStyleThumbnail styleId={item.id} />}
      onCommit={(id) => {
        if (!disabled && officeVideoStyle(id)) onCommit(id);
      }}
      onPreviewChange={(id) => onPreviewChange(id && officeVideoStyle(id) ? id : null)}
      testIdPrefix="presentation-ribbon-media-video-styles"
    />
  );
}

/**
 * The Format pane's Video page, Corrections and Color (Movie Correction /
 * Color Options..., PPT-A155): Brightness and Contrast as whole percentages
 * (-100..100) and the Recolor presets, written by the same commits as the
 * ribbon galleries. Sections carry the test ids the ribbon's "Options..."
 * items scroll to.
 */
export function PresentationVideoFormatFields({
  block,
  disabled,
  disabledReason,
  onCorrections,
  onRecolor,
}: {
  readonly block: PresentationEmbedBlock;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly onCorrections: (brightness: number, contrast: number) => void;
  readonly onRecolor: (preset: OfficeRecolorPresetId | null) => void;
}) {
  const t = useTranslations("console-notebooks");
  const current = videoCorrections(block);
  const recolor = videoRecolor(block);
  const field = (key: "brightness" | "contrast", label: string) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
      {label}
      <input
        type="number"
        min={-100}
        max={100}
        step={1}
        value={current[key]}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        data-testid={`presentation-video-format-${key}`}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (!Number.isFinite(value)) return;
          const next = { ...current, [key]: Math.round(Math.max(-100, Math.min(100, value))) };
          onCorrections(next.brightness, next.contrast);
        }}
        style={{ width: 64 }}
      />
    </label>
  );
  return (
    <div className="presentation-window__inspector-fields" data-testid="presentation-video-format-fields">
      <section data-testid="presentation-video-format-corrections" style={{ display: "grid", gap: 4 }}>
        <strong style={{ fontSize: 12 }}>{t("presentation.media.videoCorrections")}</strong>
        {field("brightness", t("toolbar.brightness"))}
        {field("contrast", t("toolbar.contrast"))}
        <button
          type="button"
          disabled={disabled || (current.brightness === 0 && current.contrast === 0)}
          onClick={() => onCorrections(0, 0)}
          data-testid="presentation-video-format-corrections-reset"
        >
          {t("presentation.media.posterFrameReset")}
        </button>
      </section>
      <section data-testid="presentation-video-format-color" style={{ display: "grid", gap: 4 }}>
        <strong style={{ fontSize: 12 }}>{t("presentation.media.videoColor")}</strong>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          {t("toolbar.recolor")}
          <select
            value={recolor ?? "none"}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            data-testid="presentation-video-format-recolor"
            onChange={(event) => onRecolor(isOfficeRecolorPreset(event.target.value) ? event.target.value : null)}
          >
            {OFFICE_RECOLOR_GALLERY_ROWS.flat().map((id) => (
              <option key={id} value={id}>
                {t(officeRecolorLabelKey(id))}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}
