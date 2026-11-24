"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Choosing a page background: colour or image, opacity, fit, and which pages.
 *
 * The dialog only collects the choice — the host fetches the bytes and applies
 * it, exactly like the other page operations. Remove is offered here too,
 * because "take the background off" is the same decision surface as "put one
 * on", and hiding it elsewhere means nobody finds it.
 */

import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useEffect, useRef, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

import type { PageBackgroundFit } from "@/lib/pdf/page-background";
import { validateRangeSpec } from "../../../../lib/pdf/range-spec";

import styles from "./PdfDecorationDialog.module.css";

export type PdfBackgroundScope = "all" | "page" | "range";

export interface PdfBackgroundSelection {
  /** Empty means every page. */
  pages: number[];
  color?: string;
  opacity: number;
  image?: File;
  imageFit: PageBackgroundFit;
}

export interface PdfBackgroundDialogProps {
  open: boolean;
  currentPage: number;
  totalPages: number;
  /** The current document carries one of our backgrounds already. */
  hasBackground: boolean;
  busy?: boolean;
  onApply: (selection: PdfBackgroundSelection) => void;
  onRemove: () => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  container?: HTMLElement | null;
}

/** A small palette; the free control next to it takes anything. */
const PRESETS = [
  "#ffffff",
  "#f7f3e8",
  "#fdf6e3",
  "#eef4ee",
  "#e8f0f7",
  "#f4e8f0",
  "#1f2430",
] as const;

export default function PdfBackgroundDialog({
  open,
  currentPage,
  totalPages,
  hasBackground,
  busy = false,
  onApply,
  onRemove,
  onCancel,
  returnFocusRef,
  container,
}: PdfBackgroundDialogProps) {
  const t = useTranslations("console-notebooks");
  const [color, setColor] = useState<string>("#f7f3e8");
  const [useColor, setUseColor] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [image, setImage] = useState<File | null>(null);
  const [imageFit, setImageFit] = useState<PageBackgroundFit>("fit");
  const [scope, setScope] = useState<PdfBackgroundScope>("all");
  const [rangeSpec, setRangeSpec] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope("all");
    setRangeSpec("");
    setImage(null);
  }, [open]);

  useEffect(() => {
    if (
      !image ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      setImagePreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(image);
    setImagePreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image]);

  const rangePages =
    scope === "range" ? validateRangeSpec(rangeSpec, totalPages).pages : [];
  const rangeInvalid = scope === "range" && rangePages.length === 0;
  const nothingChosen = !useColor && !image;

  const submit = () => {
    if (busy || rangeInvalid || nothingChosen) return;
    onApply({
      pages:
        scope === "all" ? [] : scope === "page" ? [currentPage] : rangePages,
      ...(useColor ? { color } : {}),
      opacity,
      ...(image ? { image } : {}),
      imageFit,
    });
  };

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdfViewer.background")}
      description={t("pdfViewer.backgroundHint")}
      defaultActionLabel={
        <span data-testid="pdf-background-apply">
          {t("pdfViewer.backgroundApply")}
        </span>
      }
      cancelActionLabel={
        <span data-testid="pdf-background-close">
          {t("pdfViewer.backgroundClose")}
        </span>
      }
      onDefaultAction={submit}
      onCancel={onCancel}
      defaultActionDisabled={rangeInvalid || nothingChosen}
      busy={busy}
      busyActionLabel={
        <span data-testid="pdf-background-apply">
          {t("pdfViewer.backgroundApply")}
        </span>
      }
      initialFocusRef={firstFieldRef}
      returnFocusRef={returnFocusRef}
      container={container}
      className={styles.dialog}
      testIdPrefix="pdf-background"
    >
      <div className={styles.layout}>
        <div className={styles.form}>
          <fieldset className={styles.sourceFieldset}>
            <legend>{t("pdfViewer.backgroundColor")}</legend>
            <label className={styles.checkboxField}>
              <input
                ref={firstFieldRef}
                type="checkbox"
                checked={useColor}
                onChange={(event) => setUseColor(event.target.checked)}
                data-testid="pdf-background-use-color"
              />
              <span>{t("pdfViewer.backgroundColor")}</span>
            </label>
            <div
              className={styles.sourceChoices}
              role="radiogroup"
              aria-label={t("pdfViewer.backgroundColor")}
            >
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-label={preset}
                  aria-checked={color === preset}
                  data-testid={`pdf-background-preset-${preset.slice(1)}`}
                  onClick={() => {
                    setColor(preset);
                    setUseColor(true);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 5,
                      background: preset,
                      border:
                        color === preset
                          ? "2px solid var(--office-dialog-accent)"
                          : "1px solid var(--office-dialog-control-border)",
                    }}
                  />
                </button>
              ))}
              <span className="relative size-11 shrink-0">
                <input
                  type="color"
                  value={color}
                  onChange={(event) => {
                    setColor(event.target.value);
                    setUseColor(true);
                  }}
                  aria-label={t("pdfViewer.backgroundCustomColor")}
                  data-testid="pdf-background-custom-color"
                  className={`${parts.markInput} absolute inset-0 size-11 cursor-pointer`}
                />
                <span
                  aria-hidden
                  className={`${parts.mark} pointer-events-none absolute left-1/2 top-1/2 size-[26px] -translate-x-1/2 -translate-y-1/2`}
                  data-chrome-preview
                  style={{ background: color }}
                />
              </span>
            </div>
          </fieldset>

          <fieldset className={styles.sourceFieldset}>
            <legend>{t("pdfViewer.backgroundPickImage")}</legend>
            {/* A long file name is cut short with an ellipsis (its whole
                name in the tooltip); Clear keeps its own width beside it. */}
            <div className={`${styles.imageSource} ${styles.imageSourceChosen}`}>
              <button
                type="button"
                className={`${parts.compactButton} ${styles.imagePickButton}`}
                onClick={() => fileRef.current?.click()}
                data-testid="pdf-background-pick-image"
                title={image ? image.name : undefined}
              >
                <span className={styles.imagePickLabel}>
                  {image
                    ? t("pdfViewer.backgroundImageChosen", { name: image.name })
                    : t("pdfViewer.backgroundPickImage")}
                </span>
              </button>
              {image ? (
                <button
                  type="button"
                  className={parts.compactButton}
                  onClick={() => setImage(null)}
                  data-testid="pdf-background-clear-image"
                >
                  {t("pdfViewer.backgroundClearImage")}
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                data-testid="pdf-background-image-file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  if (file) setImage(file);
                }}
              />
            </div>
            {image ? (
              <div className={styles.sourceChoices}>
                {(["fit", "stretch"] as const).map((mode) => (
                  <label key={mode} className="min-h-11">
                    <span className="relative size-4 shrink-0">
                      <input
                          type="radio"
                          name="pdf-background-fit"
                          checked={imageFit === mode}
                          onChange={() => setImageFit(mode)}
                          data-testid={`pdf-background-fit-${mode}`}
                        className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
                      />
                      <span
                        aria-hidden
                        className={`${parts.mark} pointer-events-none absolute inset-0 inline-flex size-4 items-center justify-center`}
                        data-shape="radio"
                      />
                    </span>
                    <span>{t(`pdfViewer.backgroundFit_${mode}`)}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>

          <label className={styles.field}>
            <span>{t("pdfViewer.backgroundOpacity")}</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              data-testid="pdf-background-opacity"
              style={{ minHeight: 44 }}
            />
            <span>{Math.round(opacity * 100)}%</span>
          </label>

          <fieldset className={styles.geometryFieldset}>
            <legend>{t("pdfViewer.backgroundScope")}</legend>
            <div
              className={styles.sourceChoices}
              role="radiogroup"
              aria-label={t("pdfViewer.backgroundScope")}
            >
              {(["all", "page", "range"] as const).map((value) => (
                <label key={value} className="min-h-11">
                  <span className="relative size-4 shrink-0">
                    <input
                        type="radio"
                        name="pdf-background-scope"
                        checked={scope === value}
                        onChange={() => setScope(value)}
                        data-testid={`pdf-background-scope-${value}`}
                      className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
                    />
                    <span
                      aria-hidden
                      className={`${parts.mark} pointer-events-none absolute inset-0 inline-flex size-4 items-center justify-center`}
                      data-shape="radio"
                    />
                  </span>
                  <span>
                    {value === "page"
                      ? t("pdfViewer.backgroundScopePage", {
                          page: currentPage,
                        })
                      : t(
                          value === "all"
                            ? "pdfViewer.backgroundScopeAll"
                            : "pdfViewer.backgroundScopeRange",
                        )}
                  </span>
                </label>
              ))}
            </div>
            {scope === "range" ? (
              <label className={styles.field}>
                <span>{t("pdfViewer.backgroundScopeRange")}</span>
                <input
                  type="text"
                  value={rangeSpec}
                  placeholder="1-3,5"
                  onChange={(event) => setRangeSpec(event.target.value)}
                  aria-invalid={rangeInvalid}
                  data-testid="pdf-background-range"
                />
              </label>
            ) : null}
          </fieldset>

          {hasBackground ? (
            <button
              type="button"
              className={`${parts.compactButton} ${styles.removeButton}`}
              onClick={onRemove}
              disabled={busy}
              data-testid="pdf-background-remove"
            >
              {t("pdfViewer.backgroundRemove")}
            </button>
          ) : null}
        </div>

        <div className={styles.previewPanel}>
          <strong>{t("pdfViewer.background")}</strong>
          <div
            className={styles.previewPage}
            data-testid="pdf-background-preview"
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                opacity,
                backgroundColor: useColor ? color : "transparent",
                backgroundImage: imagePreviewUrl
                  ? `url(${imagePreviewUrl})`
                  : undefined,
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                backgroundSize:
                  imageFit === "stretch" ? "100% 100%" : "contain",
              }}
            />
            <div className={styles.previewText} aria-hidden="true" />
          </div>
          <span>
            {t("pdfViewer.backgroundScopePage", { page: currentPage })} /{" "}
            {totalPages}
          </span>
        </div>
      </div>
    </OfficeDialogShell>
  );
}
