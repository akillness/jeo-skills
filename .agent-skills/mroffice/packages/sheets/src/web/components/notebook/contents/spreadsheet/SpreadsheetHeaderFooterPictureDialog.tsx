"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { OfficeDraftNumberInput } from "@mrnote/core/web/components/office-ribbon/OfficeDraftNumberInput.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { imagePixelSizeFromDataUrl, loadOfficeImageNaturalSize } from "@mrnote/core/web/lib/office-picture-fit.ts";
import {
  HEADER_FOOTER_PICTURE_POINTS_PER_PIXEL,
  headerFooterPictureFormat,
  headerFooterPictureFromFormat,
  headerFooterPictureKeptOriginal,
  headerFooterPictureResized,
  type HeaderFooterPictureFormat,
} from "../../../../lib/spreadsheet/header-footer-picture";
import {
  MAX_HEADER_FOOTER_PICTURE_ALT,
  MAX_HEADER_FOOTER_PICTURE_POINTS,
  type PrintHeaderFooterPicture,
} from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";

import { SpreadsheetHeaderFooterPicture } from "./SpreadsheetHeaderFooterPicture";

/**
 * Excel's Format Picture dialog for a header or footer picture (Custom
 * Header / Footer > Format Picture): Size (Height, Width, Scale, Lock aspect
 * ratio, Relative to original picture size, Original size, Reset), Picture
 * (Crop from Left/Right/Top/Bottom, Image control Color, Brightness,
 * Contrast, Reset) and Alt Text. Presentation only: the result goes back to
 * the Page Setup draft, applied with the dialog's OK.
 */
type Tab = "size" | "picture" | "alt";
const TABS: readonly Tab[] = ["size", "picture", "alt"];

const POINTS_PER_INCH = 72;
const POINTS_PER_CM = 72 / 2.54;

export function SpreadsheetHeaderFooterPictureDialog({
  open,
  picture,
  unit,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  picture: PrintHeaderFooterPicture;
  unit: "in" | "cm";
  onConfirm: (next: PrintHeaderFooterPicture) => void;
  onCancel: () => void;
}): React.JSX.Element | null {
  const t = useTranslations("console-notebooks");
  const ids = useId();
  const [tab, setTab] = useState<Tab>("size");
  const [original, setOriginal] = useState<{ width: number; height: number }>(() => {
    const natural = imagePixelSizeFromDataUrl(picture.src);
    return natural
      ? {
          width: natural.width * HEADER_FOOTER_PICTURE_POINTS_PER_PIXEL,
          height: natural.height * HEADER_FOOTER_PICTURE_POINTS_PER_PIXEL,
        }
      : { width: picture.width, height: picture.height };
  });
  const [format, setFormat] = useState<HeaderFooterPictureFormat>(() =>
    headerFooterPictureFormat(picture, original),
  );
  const [relative, setRelative] = useState(true);
  // The size the dialog opened with: Scale is measured against it when
  // Relative to original picture size is off.
  const [opening] = useState(() => ({ width: picture.width, height: picture.height }));
  const [error, setError] = useState(false);

  // A picture whose header gives no size (WebP, BMP) is measured decoded.
  useEffect(() => {
    if (imagePixelSizeFromDataUrl(picture.src)) return;
    let live = true;
    void loadOfficeImageNaturalSize(picture.src, 2000).then((natural) => {
      if (!live || !natural) return;
      const measured = {
        width: natural.width * HEADER_FOOTER_PICTURE_POINTS_PER_PIXEL,
        height: natural.height * HEADER_FOOTER_PICTURE_POINTS_PER_PIXEL,
      };
      setOriginal(measured);
      setFormat(headerFooterPictureFormat(picture, measured));
    });
    return () => {
      live = false;
    };
  }, [picture]);

  const pointsPer = unit === "in" ? POINTS_PER_INCH : POINTS_PER_CM;
  const measure = {
    format: (points: number) => String(Number((points / pointsPer).toFixed(2))),
    parse: (text: string) => {
      const value = Number.parseFloat(text);
      return Number.isFinite(value) ? value * pointsPer : null;
    },
    min: 0,
    max: Number((MAX_HEADER_FOOTER_PICTURE_POINTS / pointsPer).toFixed(2)),
    step: 0.01,
  };
  const percent = {
    format: (value: number) => String(Math.round(value)),
    parse: (text: string) => {
      const value = Number.parseFloat(text.replace("%", ""));
      return Number.isFinite(value) ? value : null;
    },
  };
  const kept = headerFooterPictureKeptOriginal(format, original);
  const scaleBase = relative ? kept : opening;
  const scale = {
    height: (format.height / Math.max(0.01, scaleBase.height)) * 100,
    width: (format.width / Math.max(0.01, scaleBase.width)) * 100,
  };
  const update = (next: Partial<HeaderFooterPictureFormat>) => {
    setError(false);
    setFormat((current) => ({ ...current, ...next }));
  };
  const resize = (edit: { width?: number; height?: number }) =>
    update(headerFooterPictureResized(format, edit));
  const rescale = (edit: { width?: number; height?: number }) => {
    if (edit.height !== undefined) {
      const height = (scaleBase.height * edit.height) / 100;
      update(
        format.lockAspectRatio
          ? { height, width: (scaleBase.width * edit.height) / 100 }
          : { height },
      );
    } else if (edit.width !== undefined) {
      const width = (scaleBase.width * edit.width) / 100;
      update(
        format.lockAspectRatio
          ? { width, height: (scaleBase.height * edit.width) / 100 }
          : { width },
      );
    }
  };
  // Cropping keeps the scale: the printed picture loses what was cropped.
  const recrop = (side: "cropLeft" | "cropTop" | "cropRight" | "cropBottom", points: number) => {
    const nextFormat = { ...format, [side]: Math.max(0, points) };
    const nextKept = headerFooterPictureKeptOriginal(nextFormat, original);
    const scaleWidth = format.width / Math.max(0.01, kept.width);
    const scaleHeight = format.height / Math.max(0.01, kept.height);
    update({
      [side]: Math.max(0, points),
      width: nextKept.width * scaleWidth,
      height: nextKept.height * scaleHeight,
    });
  };
  const resetSize = () =>
    update({ width: kept.width, height: kept.height });
  const resetPicture = () =>
    update({
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
      colorType: "automatic",
      brightness: 0.5,
      contrast: 0.5,
      width: (format.width / Math.max(0.01, kept.width)) * original.width,
      height: (format.height / Math.max(0.01, kept.height)) * original.height,
    });
  const confirm = () => {
    const next = headerFooterPictureFromFormat(picture, format, original);
    if (!next) {
      setError(true);
      return;
    }
    onConfirm(next);
  };
  const preview = headerFooterPictureFromFormat(picture, format, original);
  const previewScale = preview
    ? Math.min(1, 96 / Math.max(1, ptToPx(preview.height)), 220 / Math.max(1, ptToPx(preview.width)))
    : 1;

  const field = (label: string, control: React.ReactNode, key?: string) => (
    <label key={key} className={dialogParts.field}>
      <span className={dialogParts.label}>{label}</span>
      {control}
    </label>
  );
  const tabStrip = (
    <div className={dialogParts.tabs} role="tablist" aria-label={t("spreadsheet.pageSetupDialog.hfPicture.formatTitle")}>
      {TABS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`${ids}-tab-${id}`}
          aria-controls={`${ids}-panel-${id}`}
          aria-selected={tab === id}
          tabIndex={tab === id ? 0 : -1}
          className={dialogParts.tab}
          onClick={() => setTab(id)}
          data-testid={`spreadsheet-hf-picture-tab-${id}`}
        >
          {t(`spreadsheet.pageSetupDialog.hfPicture.tab.${id}`)}
        </button>
      ))}
    </div>
  );
  const panelProps = (id: Tab) => ({
    role: "tabpanel" as const,
    id: `${ids}-panel-${id}`,
    "aria-labelledby": `${ids}-tab-${id}`,
    hidden: tab !== id,
    className: dialogParts.group,
  });

  return (
    <OfficeDialogShell
      open={open}
      title={t("spreadsheet.pageSetupDialog.hfPicture.formatTitle")}
      description={t("spreadsheet.pageSetupDialog.hfPicture.formatDescription")}
      defaultActionLabel={t("spreadsheet.fmtOk")}
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={confirm}
      onCancel={onCancel}
      testIdPrefix="spreadsheet-hf-picture"
      tabStrip={tabStrip}
    >
      <div {...panelProps("size")} data-testid="spreadsheet-hf-picture-panel-size">
        <div className={dialogParts.row}>
          {field(
            t("spreadsheet.pageSetupDialog.hfPicture.height"),
            <OfficeDraftNumberInput
              {...measure}
              value={format.height}
              onCommit={(points) => {
                if (points !== null && points > 0) resize({ height: points });
              }}
              testId="spreadsheet-hf-picture-height"
            />,
          )}
          {field(
            t("spreadsheet.pageSetupDialog.hfPicture.width"),
            <OfficeDraftNumberInput
              {...measure}
              value={format.width}
              onCommit={(points) => {
                if (points !== null && points > 0) resize({ width: points });
              }}
              testId="spreadsheet-hf-picture-width"
            />,
          )}
        </div>
        <span className={dialogParts.sectionTitle}>
          {t("spreadsheet.pageSetupDialog.hfPicture.scale")}
        </span>
        <div className={dialogParts.row}>
          {field(
            t("spreadsheet.pageSetupDialog.hfPicture.scaleHeight"),
            <OfficeDraftNumberInput
              {...percent}
              min={1}
              step={1}
              value={scale.height}
              onCommit={(value) => {
                if (value !== null && value > 0) rescale({ height: value });
              }}
              testId="spreadsheet-hf-picture-scale-height"
            />,
          )}
          {field(
            t("spreadsheet.pageSetupDialog.hfPicture.scaleWidth"),
            <OfficeDraftNumberInput
              {...percent}
              min={1}
              step={1}
              value={scale.width}
              onCommit={(value) => {
                if (value !== null && value > 0) rescale({ width: value });
              }}
              testId="spreadsheet-hf-picture-scale-width"
            />,
          )}
        </div>
        <label className={dialogParts.check}>
          <input
            type="checkbox"
            checked={format.lockAspectRatio}
            onChange={(event) => update({ lockAspectRatio: event.target.checked })}
            data-testid="spreadsheet-hf-picture-lock"
          />
          {t("spreadsheet.pageSetupDialog.hfPicture.lockAspectRatio")}
        </label>
        <label className={dialogParts.check}>
          <input
            type="checkbox"
            checked={relative}
            onChange={(event) => setRelative(event.target.checked)}
            data-testid="spreadsheet-hf-picture-relative"
          />
          {t("spreadsheet.pageSetupDialog.hfPicture.relativeToOriginal")}
        </label>
        <div className={dialogParts.row}>
          <span className={dialogParts.hint} data-testid="spreadsheet-hf-picture-original">
            {t("spreadsheet.pageSetupDialog.hfPicture.originalSize", {
              height: measure.format(original.height),
              width: measure.format(original.width),
              unit: unit === "in" ? "in" : "cm",
            })}
          </span>
          <button
            type="button"
            className={dialogParts.compactButton}
            onClick={resetSize}
            data-testid="spreadsheet-hf-picture-reset-size"
          >
            {t("spreadsheet.pageSetupDialog.hfPicture.reset")}
          </button>
        </div>
      </div>
      <div {...panelProps("picture")} data-testid="spreadsheet-hf-picture-panel-picture">
        <span className={dialogParts.sectionTitle}>
          {t("spreadsheet.pageSetupDialog.hfPicture.cropFrom")}
        </span>
        <div className={dialogParts.row}>
          {(
            [
              ["cropLeft", "left"],
              ["cropRight", "right"],
              ["cropTop", "top"],
              ["cropBottom", "bottom"],
            ] as const
          ).map(([key, side]) =>
            field(
              t(`spreadsheet.pageSetupDialog.hfPicture.crop.${side}`),
              <OfficeDraftNumberInput
                {...measure}
                value={format[key]}
                onCommit={(points) => {
                  if (points !== null) recrop(key, points);
                }}
                testId={`spreadsheet-hf-picture-crop-${side}`}
              />,
              key,
            ),
          )}
        </div>
        <span className={dialogParts.sectionTitle}>
          {t("spreadsheet.pageSetupDialog.hfPicture.imageControl")}
        </span>
        <div className={dialogParts.row}>
          {field(
            t("spreadsheet.pageSetupDialog.hfPicture.color"),
            <select
              value={format.colorType}
              onChange={(event) =>
                update({ colorType: event.target.value as HeaderFooterPictureFormat["colorType"] })
              }
              data-testid="spreadsheet-hf-picture-color"
            >
              {(["automatic", "grayscale", "blackAndWhite", "washout"] as const).map((id) => (
                <option key={id} value={id}>
                  {t(`spreadsheet.pageSetupDialog.hfPicture.colorType.${id}`)}
                </option>
              ))}
            </select>,
          )}
          {field(
            t("spreadsheet.pageSetupDialog.hfPicture.brightness"),
            <OfficeDraftNumberInput
              {...percent}
              min={0}
              max={100}
              step={1}
              value={format.brightness * 100}
              onCommit={(value) => {
                if (value !== null) update({ brightness: Math.max(0, Math.min(100, value)) / 100 });
              }}
              testId="spreadsheet-hf-picture-brightness"
            />,
          )}
          {field(
            t("spreadsheet.pageSetupDialog.hfPicture.contrast"),
            <OfficeDraftNumberInput
              {...percent}
              min={0}
              max={100}
              step={1}
              value={format.contrast * 100}
              onCommit={(value) => {
                if (value !== null) update({ contrast: Math.max(0, Math.min(100, value)) / 100 });
              }}
              testId="spreadsheet-hf-picture-contrast"
            />,
          )}
        </div>
        <div className={dialogParts.row}>
          <button
            type="button"
            className={dialogParts.compactButton}
            onClick={resetPicture}
            data-testid="spreadsheet-hf-picture-reset-picture"
          >
            {t("spreadsheet.pageSetupDialog.hfPicture.reset")}
          </button>
        </div>
      </div>
      <div {...panelProps("alt")} data-testid="spreadsheet-hf-picture-panel-alt">
        {field(
          t("spreadsheet.pageSetupDialog.hfPicture.altText"),
          <textarea
            value={format.alt}
            maxLength={MAX_HEADER_FOOTER_PICTURE_ALT}
            rows={4}
            onChange={(event) => update({ alt: event.target.value })}
            data-testid="spreadsheet-hf-picture-alt"
          />,
        )}
      </div>
      <div className={dialogParts.well} aria-hidden="true" data-testid="spreadsheet-hf-picture-preview">
        {preview ? (
          <SpreadsheetHeaderFooterPicture
            picture={preview}
            pointToPx={(points) => ptToPx(points) * previewScale}
          />
        ) : null}
      </div>
      {error ? (
        <span className={dialogParts.error} role="alert" data-testid="spreadsheet-hf-picture-error">
          {t("spreadsheet.pageSetupDialog.hfPicture.cropTooLarge")}
        </span>
      ) : null}
    </OfficeDialogShell>
  );
}

export default SpreadsheetHeaderFooterPictureDialog;
