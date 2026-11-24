"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "../../../host/next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  IMAGE_CORRECTION_PRESET_DELTAS,
  IMAGE_TRANSPARENCY_PRESETS,
  NATIVE_IMAGE_RECOLOR_MODES,
  imageCorrectionStoredFromDelta,
  imageFilterCss,
  resolveImageEffects,
  type NativeImageRecolorMode,
} from "../../lib/presentation-image-effects";

import { OfficePictureMenuIcon } from "./icons/OfficePictureMenuIcon";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import { OFFICE_PICTURE_STYLE_SAMPLE_SRC } from "./OfficePictureStyleGallery";
import { officePreviewIgnoresPointer } from "./officeFormatPreview";

/**
 * Picture Format > Adjust: the Corrections, Color and Transparency galleries
 * as desktop Office draws them (Microsoft Support, "Change the brightness,
 * contrast, or sharpness of a picture", "Change the color of a picture",
 * "Make a picture transparent"). Each tile is the sample picture drawn with
 * the same filter the canvas uses. A part of a gallery the host's picture
 * model cannot store (sharpness, saturation, tone, variations, a transparent
 * colour) is listed disabled with the host's reason, never left out.
 *
 * Host-neutral: values, editability and commits come in as props, so the
 * deck uses it now and Docs / the worksheet can adopt it without changing
 * what they store.
 */

const SAMPLE_BACKGROUND = `center / cover no-repeat url("${OFFICE_PICTURE_STYLE_SAMPLE_SRC}")`;

const tileStyle: CSSProperties = {
  minWidth: 52,
  minHeight: 52,
  padding: 4,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: 2,
};

/** One gallery tile's sample picture (`filter`: CSS, e.g. a host's `url(#id)`). */
export function OfficePictureAdjustSample({ filter, opacity }: { filter?: string; opacity?: number }) {
  return <Sample filter={filter} opacity={opacity} />;
}

function Sample({ filter, opacity }: { filter?: string; opacity?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        width: 44,
        height: 30,
        border: "1px solid #cbd5e1",
        borderRadius: 3,
        overflow: "hidden",
        backgroundColor: "#fff",
        backgroundImage:
          opacity === undefined
            ? undefined
            : "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",
        backgroundSize: opacity === undefined ? undefined : "8px 8px",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: SAMPLE_BACKGROUND,
          filter: filter || undefined,
          opacity,
        }}
      />
    </span>
  );
}

interface CommonProps {
  /** The host's ribbon trigger. */
  readonly trigger: ReactNode;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  /** "… Options..." at the foot: opens the host's Format pane section. A
   * host with no Format pane (the PDF reader) leaves both out: no foot. */
  readonly optionsLabel?: string;
  readonly onOptions?: () => void;
  readonly testIdPrefix: string;
  /** Live preview on hover/focus; null restores the picture. */
  readonly onPreview?: (value: unknown | null) => void;
}

export interface OfficePictureCorrectionsMenuProps extends CommonProps {
  /** Brightness / contrast as Office's -100..100 deltas. */
  readonly brightnessDelta: number;
  readonly contrastDelta: number;
  readonly recolor: NativeImageRecolorMode;
  /** Why Sharpen/Soften is not offered (no sharpness in the host's model). */
  readonly sharpnessUnavailableReason: string;
  readonly onCommit: (brightnessDelta: number, contrastDelta: number) => void;
  /** Extra host items after the gallery (e.g. Auto Enhance). */
  readonly extraItems?: ReactNode;
  /** Sharpen/Soften row (default shown); a video's gallery has none. */
  readonly showSharpness?: boolean;
  /** The host's own drawing of a tile (default: the sample through the picture filter). */
  readonly renderTileSample?: (brightnessDelta: number, contrastDelta: number) => ReactNode;
  /** Sharpen/Soften the host stores (Office's -100..100): its tiles take it.
   * Absent, they are listed disabled with `sharpnessUnavailableReason`. */
  readonly sharpness?: Readonly<{ value: number; onCommit: (amount: number) => void }>;
}

export function OfficePictureCorrectionsMenu({
  trigger,
  disabled = false,
  disabledReason,
  optionsLabel,
  onOptions,
  testIdPrefix,
  onPreview,
  brightnessDelta,
  contrastDelta,
  recolor,
  sharpnessUnavailableReason,
  onCommit,
  extraItems,
  showSharpness = true,
  renderTileSample,
  sharpness,
}: OfficePictureCorrectionsMenuProps) {
  const t = useTranslations("console-notebooks");
  const sign = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => (open ? undefined : onPreview?.(null))}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="docs-cupertino-menu"
        data-testid={`${testIdPrefix}-menu`}
        onPointerLeave={() => onPreview?.(null)}
      >
        {showSharpness ? (<>
        <DropdownMenuLabel>{t("toolbar.sharpenSoften")}</DropdownMenuLabel>
        <div role="group" aria-label={t("toolbar.sharpenSoften")} style={{ display: "grid", gridTemplateColumns: "repeat(5, 56px)", gap: 4, padding: 4 }}>
          {[-50, -25, 0, 25, 50].map((amount) => (
            <DropdownMenuItem
              key={amount}
              disabled={sharpness ? disabled : true}
              title={sharpness ? `${t("toolbar.sharpenSoften")} ${sign(amount)}%` : sharpnessUnavailableReason}
              data-disabled-reason={sharpness ? undefined : sharpnessUnavailableReason}
              data-state={sharpness && sharpness.value === amount ? "checked" : undefined}
              data-testid={`${testIdPrefix}-sharpness-${amount}`}
              onSelect={sharpness ? () => sharpness.onCommit(amount) : undefined}
              style={sharpness && sharpness.value === amount
                ? { ...tileStyle, outline: "2px solid var(--office-accent, #2b579a)" } : tileStyle}
            >
              <Sample />
              <span aria-hidden="true" style={{ fontSize: 9, lineHeight: 1 }}>{sign(amount)}%</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        </>) : null}
        <DropdownMenuLabel>{t("toolbar.brightnessContrast")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={`${brightnessDelta}:${contrastDelta}`}
          style={{ display: "grid", gridTemplateColumns: "repeat(5, 56px)", gap: 4, padding: 4 }}
        >
          {IMAGE_CORRECTION_PRESET_DELTAS.flatMap((contrast) =>
            IMAGE_CORRECTION_PRESET_DELTAS.map((brightness) => {
              const label = t("toolbar.brightnessContrastPreset", {
                brightness: sign(brightness),
                contrast: sign(contrast),
              });
              const filter = imageFilterCss(
                resolveImageEffects({
                  recolor,
                  brightness: imageCorrectionStoredFromDelta(brightness),
                  contrast: imageCorrectionStoredFromDelta(contrast),
                }),
              );
              return (
                <DropdownMenuRadioItem
                  key={`${brightness}:${contrast}`}
                  value={`${brightness}:${contrast}`}
                  disabled={disabled}
                  aria-label={disabledReason && disabled ? `${label}: ${disabledReason}` : label}
                  title={disabledReason && disabled ? `${label}: ${disabledReason}` : label}
                  data-testid={`${testIdPrefix}-b${brightness}-c${contrast}`}
                  onPointerEnter={(event) =>
                    disabled || officePreviewIgnoresPointer(event) ? undefined : onPreview?.({ brightness, contrast })
                  }
                  onFocus={() => (disabled ? undefined : onPreview?.({ brightness, contrast }))}
                  onSelect={() => onCommit(brightness, contrast)}
                  style={tileStyle}
                >
                  {renderTileSample ? renderTileSample(brightness, contrast) : <Sample filter={filter} />}
                </DropdownMenuRadioItem>
              );
            }),
          )}
        </DropdownMenuRadioGroup>
        {extraItems}
        {onOptions ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOptions} data-testid={`${testIdPrefix}-options`}>
              <OfficePictureMenuIcon icon={{ kind: "sharpness" }} />
              {optionsLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface OfficePictureColorMenuProps extends CommonProps {
  readonly recolor: NativeImageRecolorMode;
  readonly brightness?: number;
  readonly contrast?: number;
  /** Why Saturation / Tone / More Variations / Set Transparent Color are not offered. */
  readonly unavailableReason: string;
  readonly onCommitRecolor: (recolor: NativeImageRecolorMode) => void;
  /** Color Saturation / Color Tone rows and Set Transparent Color (default shown); a video's Color has none. */
  readonly showSaturationTone?: boolean;
  readonly showTransparentColor?: boolean;
  /**
   * The full Recolor gallery a host can store (Office's 21 tiles, rows of
   * seven, `lib/office-recolor-presets`), in place of the native picture
   * subset: ids, the current one, each tile's name and drawing, the commit.
   */
  readonly recolorGallery?: {
    readonly rows: readonly (readonly string[])[];
    readonly value: string;
    readonly label: (id: string) => string;
    readonly renderSample: (id: string) => ReactNode;
    readonly onCommit: (id: string) => void;
  };
  /** Color Saturation the host stores (percent): its tiles take it. Absent,
   * they are listed disabled with `unavailableReason`. */
  readonly saturation?: Readonly<{ value: number; onCommit: (percent: number) => void }>;
  /** Color Tone the host stores (Kelvin): its tiles take it. */
  readonly tone?: Readonly<{ value: number; onCommit: (kelvin: number) => void }>;
  /** Leave out what the host cannot do (More Variations, Set Transparent
   * Color) instead of listing it disabled. */
  readonly omitUnavailable?: boolean;
}

export function OfficePictureColorMenu({
  trigger,
  disabled = false,
  disabledReason,
  optionsLabel,
  onOptions,
  testIdPrefix,
  onPreview,
  recolor,
  brightness,
  contrast,
  unavailableReason,
  onCommitRecolor,
  showSaturationTone = true,
  showTransparentColor = true,
  recolorGallery,
  saturation,
  tone,
  omitUnavailable = false,
}: OfficePictureColorMenuProps) {
  const t = useTranslations("console-notebooks");
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => (open ? undefined : onPreview?.(null))}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="docs-cupertino-menu"
        data-testid={`${testIdPrefix}-menu`}
        onPointerLeave={() => onPreview?.(null)}
      >
        {(showSaturationTone
          ? ([
              ["saturation", t("toolbar.colorSaturation"), [0, 33, 66, 100, 200, 300, 400].map((value) => `${value}%`)],
              ["tone", t("toolbar.colorTone"), ["4700 K", "5300 K", "5900 K", "6500 K", "7200 K", "8800 K", "11200 K"]],
            ] as const)
          : []
        ).map(([id, label, values]) => (
          <div key={id}>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <div role="group" aria-label={label} style={{ display: "grid", gridTemplateColumns: "repeat(7, 52px)", gap: 4, padding: 4 }}>
              {values.map((value) => {
                const amount = Number(value.replace(/[^0-9]/g, ""));
                const stored = id === "saturation" ? saturation : tone;
                const checked = stored?.value === amount;
                return (
                <DropdownMenuItem
                  key={value}
                  disabled={stored ? disabled : true}
                  title={stored ? `${label} ${value}` : `${label} ${value}: ${unavailableReason}`}
                  data-disabled-reason={stored ? undefined : unavailableReason}
                  data-state={checked ? "checked" : undefined}
                  data-testid={`${testIdPrefix}-${id}-${value.replace(/[^0-9]/g, "")}`}
                  onSelect={stored ? () => stored.onCommit(amount) : undefined}
                  style={checked ? { ...tileStyle, outline: "2px solid var(--office-accent, #2b579a)" } : tileStyle}
                >
                  <Sample />
                  <span aria-hidden="true" style={{ fontSize: 9, lineHeight: 1 }}>{value}</span>
                </DropdownMenuItem>
                );
              })}
            </div>
          </div>
        ))}
        <DropdownMenuLabel>{t("toolbar.recolor")}</DropdownMenuLabel>
        {recolorGallery ? (
          <DropdownMenuRadioGroup
            value={recolorGallery.value}
            style={{ display: "grid", gridTemplateColumns: "repeat(7, 52px)", gap: 4, padding: 4 }}
          >
            {recolorGallery.rows.flat().map((id) => {
              const label = recolorGallery.label(id);
              return (
                <DropdownMenuRadioItem
                  key={id}
                  value={id}
                  disabled={disabled}
                  aria-label={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
                  title={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
                  data-testid={`${testIdPrefix}-recolor-${id}`}
                  onPointerEnter={(event) =>
                    disabled || officePreviewIgnoresPointer(event) ? undefined : onPreview?.({ recolor: id })
                  }
                  onFocus={() => (disabled ? undefined : onPreview?.({ recolor: id }))}
                  onSelect={() => recolorGallery.onCommit(id)}
                  style={tileStyle}
                >
                  {recolorGallery.renderSample(id)}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        ) : (
        <DropdownMenuRadioGroup
          value={recolor}
          style={{ display: "grid", gridTemplateColumns: "repeat(7, 52px)", gap: 4, padding: 4 }}
        >
          {NATIVE_IMAGE_RECOLOR_MODES.map((mode) => {
            const label = mode === "grayscale" ? t("toolbar.grayscale") : t("toolbar.noRecolor");
            return (
              <DropdownMenuRadioItem
                key={mode}
                value={mode}
                disabled={disabled}
                aria-label={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
                title={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
                data-testid={`${testIdPrefix}-recolor-${mode}`}
                onPointerEnter={(event) =>
                    disabled || officePreviewIgnoresPointer(event) ? undefined : onPreview?.({ recolor: mode })
                  }
                onFocus={() => (disabled ? undefined : onPreview?.({ recolor: mode }))}
                onSelect={() => onCommitRecolor(mode)}
                style={tileStyle}
              >
                <Sample filter={imageFilterCss(resolveImageEffects({ recolor: mode, brightness, contrast }))} />
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        )}
        {omitUnavailable && !onOptions ? null : <DropdownMenuSeparator />}
        {(omitUnavailable ? [] : (
          [
            ["variations", "presentation.pictureRibbon.moreVariations", "color-variations"],
            ...(showTransparentColor
              ? ([["transparent-color", "toolbar.setTransparentColor", "set-transparent-color"]] as const)
              : []),
          ] as const
        )).map(([id, key, icon]) => (
          <DropdownMenuItem
            key={id}
            disabled
            title={unavailableReason}
            data-disabled-reason={unavailableReason}
            data-testid={`${testIdPrefix}-${id}`}
          >
            <OfficePictureMenuIcon icon={{ kind: icon }} />
            {t(key)}
          </DropdownMenuItem>
        ))}
        {onOptions ? (
          <DropdownMenuItem onSelect={onOptions} data-testid={`${testIdPrefix}-options`}>
            <OfficePictureMenuIcon icon={{ kind: "color-tone" }} />
            {optionsLabel}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface OfficePictureTransparencyMenuProps
  extends Omit<CommonProps, "optionsLabel" | "onOptions"> {
  /** Current transparency, 0..100 %. */
  readonly transparency: number;
  readonly onCommit: (transparency: number) => void;
  /** "Transparency Options..." at the foot; a host with no Format pane
   * (the PDF reader) leaves both out and the foot is not drawn. */
  readonly optionsLabel?: string;
  readonly onOptions?: () => void;
}

export function OfficePictureTransparencyMenu({
  trigger,
  disabled = false,
  disabledReason,
  optionsLabel,
  onOptions,
  testIdPrefix,
  onPreview,
  transparency,
  onCommit,
}: OfficePictureTransparencyMenuProps) {
  const t = useTranslations("console-notebooks");
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => (open ? undefined : onPreview?.(null))}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="docs-cupertino-menu"
        data-testid={`${testIdPrefix}-menu`}
        onPointerLeave={() => onPreview?.(null)}
      >
        <DropdownMenuRadioGroup
          value={String(transparency)}
          style={{ display: "grid", gridTemplateColumns: "repeat(7, 56px)", gap: 4, padding: 4 }}
        >
          {IMAGE_TRANSPARENCY_PRESETS.map((value) => {
            const label = `${t("toolbar.transparency")} ${value}%`;
            return (
              <DropdownMenuRadioItem
                key={value}
                value={String(value)}
                disabled={disabled}
                aria-label={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
                title={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
                data-testid={`${testIdPrefix}-${value}`}
                onPointerEnter={(event) =>
                    disabled || officePreviewIgnoresPointer(event) ? undefined : onPreview?.({ transparency: value })
                  }
                onFocus={() => (disabled ? undefined : onPreview?.({ transparency: value }))}
                onSelect={() => onCommit(value)}
                style={tileStyle}
              >
                <Sample opacity={(100 - value) / 100} />
                <span aria-hidden="true" style={{ fontSize: 9, lineHeight: 1 }}>{value}%</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {onOptions ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOptions} data-testid={`${testIdPrefix}-options`}>
              <OfficeSemanticIcon semanticId="image.transparency" size={16} />
              {optionsLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
