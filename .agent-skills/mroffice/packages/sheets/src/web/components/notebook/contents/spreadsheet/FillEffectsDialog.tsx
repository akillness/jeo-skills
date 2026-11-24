"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Cells > Fill > Fill Effects… (XLS-A061): Excel's two-colour gradient
 * dialog — Color 1 / Color 2, six Shading styles and their Variants, and a
 * Sample — writing the SpreadsheetML gradientFill the grid already draws
 * (lib/spreadsheet/fill-pattern). A gradient Excel's own dialog could not have
 * written (more stops, another angle) opens on the default choice.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  officeDialogClassName,
  officeDialogParts as dialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { ColorPalettePopover } from "../../../../lib/spreadsheet/ColorPalettePopover";
import {
  FILL_EFFECTS_SHADINGS,
  fillEffectsFromGradient,
  fillEffectsGradient,
  fillEffectsVariantCount,
  spreadsheetGradientFillCss,
  type FillEffectsShading,
  type SpreadsheetGradientFill,
} from "@mrnote/core/web/lib/spreadsheet/fill-pattern.ts";

const SHADING_LABEL_KEY: Record<FillEffectsShading, string> = {
  horizontal: "spreadsheet.fmtFillEffectsHorizontal",
  vertical: "spreadsheet.fmtFillEffectsVertical",
  diagonalUp: "spreadsheet.fmtFillEffectsDiagonalUp",
  diagonalDown: "spreadsheet.fmtFillEffectsDiagonalDown",
  fromCorner: "spreadsheet.fmtFillEffectsFromCorner",
  fromCenter: "spreadsheet.fmtFillEffectsFromCenter",
};

export default function FillEffectsDialog({
  current,
  paletteId,
  zIndex,
  returnFocusRef,
  onConfirm,
  onCancel,
}: {
  current: unknown;
  paletteId?: string;
  zIndex: number;
  /** Where the keyboard goes back to when this closes (its opener). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: (gradient: SpreadsheetGradientFill) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const initial = fillEffectsFromGradient(current);
  const [color1, setColor1] = useState(initial?.color1 ?? "#ffffff");
  const [color2, setColor2] = useState(initial?.color2 ?? "#4472c4");
  const [shading, setShading] = useState<FillEffectsShading>(initial?.shading ?? "horizontal");
  const [variant, setVariant] = useState(initial?.variant ?? 0);
  const [picking, setPicking] = useState<1 | 2 | null>(null);
  const color1Ref = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // A modal child takes the keyboard when it opens (Esc then cancels this
  // dialog alone, keeping the Format Cells draft: live audit S-196), and
  // hands it back to the button that opened it when it closes.
  useEffect(() => {
    const opener = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);
  const color2Ref = useRef<HTMLButtonElement>(null);
  const gradient = fillEffectsGradient(shading, variant, color1, color2);
  const labels = {
    themeColors: t("spreadsheet.themeColors"),
    standardColors: t("spreadsheet.standardColors"),
    recentColors: t("spreadsheet.recentColors"),
    moreColors: t("spreadsheet.moreColors"),
  };
  const colorButton = (which: 1 | 2) => {
    const ref = which === 1 ? color1Ref : color2Ref;
    const value = which === 1 ? color1 : color2;
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <button
          ref={ref}
          type="button"
          className={dialogParts.compactButton}
          aria-haspopup="dialog"
          aria-expanded={picking === which}
          onClick={() => setPicking((open) => (open === which ? null : which))}
          data-testid={`format-cells-fill-effects-color${which}`}
        >
          <span
            aria-hidden="true"
            style={{ width: 13, height: 13, borderRadius: 3, border: "1px solid rgba(0,0,0,0.2)", background: value }}
          />
          {t(which === 1 ? "spreadsheet.fmtFillEffectsColor1" : "spreadsheet.fmtFillEffectsColor2")}
        </button>
        {picking === which ? (
          <ColorPalettePopover
            anchorRef={ref}
            zIndex={zIndex + 1}
            value={value}
            labels={labels}
            testIdPrefix={`format-cells-fill-effects-color${which}`}
            paletteId={paletteId}
            onDismiss={() => setPicking(null)}
            onPick={(color) => {
              if (color) (which === 1 ? setColor1 : setColor2)(color);
              setPicking(null);
            }}
          />
        ) : null}
      </span>
    );
  };

  // Portalled to the body: the Format Cells card is a containing block for
  // fixed children, which would clip this dialog to it.
  const dialog = (
    <div className="app-modal-overlay" role="presentation" style={{ zIndex }} onClick={(event) => {
        // React carries a portal's events up its own tree: keep this click
        // from reaching the Format Cells overlay, which would close it too.
        event.stopPropagation();
        onCancel();
      }}>
      <div
        className={officeDialogClassName({ tone: "spreadsheet", size: "md" })}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("spreadsheet.fmtFillEffectsTitle")}
        data-testid="format-cells-fill-effects"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        <h2 className={dialogParts.title}>{t("spreadsheet.fmtFillEffectsTitle")}</h2>
        <fieldset className={dialogParts.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={dialogParts.label}>{t("spreadsheet.fmtFillEffectsColors")}</legend>
          <div style={{ display: "flex", gap: 10 }}>
            {colorButton(1)}
            {colorButton(2)}
          </div>
        </fieldset>
        <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
          <fieldset className={dialogParts.field} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={dialogParts.label}>{t("spreadsheet.fmtFillEffectsShading")}</legend>
            {FILL_EFFECTS_SHADINGS.map((style) => (
              <label key={style} className={dialogParts.check}>
                <input
                  type="radio"
                  name="fill-effects-shading"
                  checked={shading === style}
                  onChange={() => {
                    setShading(style);
                    setVariant(0);
                  }}
                  data-testid={`format-cells-fill-effects-shading-${style}`}
                />
                {t(SHADING_LABEL_KEY[style] as Parameters<typeof t>[0])}
              </label>
            ))}
          </fieldset>
          <div className={dialogParts.field}>
            <span className={dialogParts.label}>{t("spreadsheet.fmtFillEffectsVariants")}</span>
            <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(2, 56px)", gap: 6 }}>
              {Array.from({ length: fillEffectsVariantCount(shading) }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  role="radio"
                  aria-checked={variant === index}
                  aria-label={`${t("spreadsheet.fmtFillEffectsVariants")} ${index + 1}`}
                  onClick={() => setVariant(index)}
                  data-testid={`format-cells-fill-effects-variant-${index}`}
                  style={{
                    width: 56,
                    height: 40,
                    padding: 0,
                    border: variant === index ? "2px solid var(--console-accent, #0d9488)" : "1px solid var(--office-dialog-control-border)",
                    borderRadius: 4,
                    ...(spreadsheetGradientFillCss(fillEffectsGradient(shading, index, color1, color2)) ?? {}),
                  }}
                />
              ))}
            </div>
          </div>
          <div className={dialogParts.field}>
            <span className={dialogParts.label}>{t("spreadsheet.fmtFillSample")}</span>
            <div
              aria-hidden="true"
              data-testid="format-cells-fill-effects-sample"
              style={{
                width: 80,
                height: 60,
                border: "1px solid var(--office-dialog-control-border)",
                borderRadius: 4,
                ...(spreadsheetGradientFillCss(gradient) ?? {}),
              }}
            />
          </div>
        </div>
        <div className={dialogParts.footer}>
          <button type="button" className={dialogParts.button} onClick={onCancel} data-testid="format-cells-fill-effects-cancel">
            {t("spreadsheet.fmtCancel")}
          </button>
          <button
            type="button"
            className={dialogParts.primaryButton}
            onClick={() => onConfirm(gradient)}
            data-testid="format-cells-fill-effects-ok"
          >
            {t("spreadsheet.fmtOk")}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
