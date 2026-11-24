"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Home > Replace > Replace Fonts: the dialog that swaps one font for another
 * across the deck.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { useRef, useState, type ReactElement } from "react";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { RUN_FONT_FAMILIES } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import type { MasterFontEntry } from "@mrnote/core/web/lib/presentation-replace-font.ts";

/**
 * Slide Size dialog (PowerPoint / WPS "Slide Size"): pick a preset aspect ratio
 * (Widescreen 16:9 / Standard 4:3 / On-screen 16:9) OR a custom width × height
 * in inches, then apply it deck-wide. Holds its OWN local state (selected preset
 * + custom inch values), seeded from the current deck size; on apply it calls
 * `onApply` with the resolved {@link SlideSizeEmu} (the editor writes it onto
 * every slide). Render-gated by the caller, so mounting it re-seeds from the
 * latest size.
 */
/**
 * Replace Fonts dialog (PowerPoint Home ▸ Replace ▸ Replace Fonts): pick a font
 * currently used in the deck and the font to swap it to, applied across every
 * slide. The "from" list is the deck's used fonts; the "to" list is the curated
 * run-font whitelist. The transform itself is the pure {@link replaceDeckFont}.
 */
export function ReplaceFontsDialog({
  usedFonts,
  masterFonts = [],
  onApply,
  onClose,
  t,
}: {
  usedFonts: readonly string[];
  /**
   * The fonts the masters provide (§73): a face a master's own `p:txStyles`
   * names, or one only the theme gives. Either is replaced where words draw
   * in it (`replaceFontsInDeck`); the text styles and the theme's font scheme
   * keep it, as PowerPoint's Replace Fonts leaves them.
   */
  masterFonts?: readonly MasterFontEntry[];
  onApply: (fromCss: string, toCss: string) => void;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const fontLabel = (css: string) =>
    RUN_FONT_FAMILIES.find((option) => option.css === css)?.label ?? css;
  // One list, slides' fonts first, then what only the masters provide.
  const fromOptions: Array<{ css: string; label: string }> = [
    ...usedFonts.map((css) => ({ css, label: fontLabel(css) })),
    // The slides' fonts are listed by primary face (PPT-B301); a master
    // face the slides already name is not listed twice.
    ...masterFonts
      .filter((entry) => !usedFonts.some((face) => face.toLowerCase() === entry.face.toLowerCase()))
      .map((entry) => ({
        css: entry.face,
        label: entry.editable
          ? t("presentation.replaceFonts.masterFont", { font: fontLabel(entry.face) })
          : t("presentation.replaceFonts.themeFont", { font: fontLabel(entry.face) }),
      })),
  ];
  const [fromCss, setFromCss] = useState<string>(fromOptions[0]?.css ?? "");
  const [toId, setToId] = useState<string>(RUN_FONT_FAMILIES[0]?.id ?? "");
  const toCss =
    RUN_FONT_FAMILIES.find((option) => option.id === toId)?.css ?? "";
  const fromRef = useRef<HTMLSelectElement | null>(null);
  return (
    <OfficeDialogShell
      open
      title={t("presentation.replaceFonts.label")}
      // PowerPoint's dialog says nothing beyond Replace: / With: (PPT-B023);
      // the masters' text styles are still replaced with the slides'.
      description=""
      defaultActionLabel={t("presentation.replaceFonts.apply")}
      cancelActionLabel={t("presentation.replaceFonts.cancel")}
      // A face only the theme gives (the masters' and layouts' words that
      // follow it) is replaced too, as PowerPoint's Fonts.Replace replaces
      // it (truth replacefont rf1 / c65fontref): those words take the new
      // face of their own, the theme's font scheme stays.
      defaultActionDisabled={fromOptions.length === 0 || !toCss}
      onDefaultAction={() => onApply(fromCss, toCss)}
      onCancel={onClose}
      initialFocusRef={fromRef}
      testIdPrefix="presentation-replace-fonts"
      defaultActionTestId="presentation-replace-fonts-apply"
    >
      {fromOptions.length === 0 ? (
        <p
          data-testid="presentation-replace-fonts-empty"
          className={dialogParts.hint}
        >
          {t("presentation.replaceFonts.empty")}
        </p>
      ) : (
        <>
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>
              {t("presentation.replaceFonts.from")}
            </span>
            <select
              ref={fromRef}
              value={fromCss}
              data-testid="presentation-replace-fonts-from"
              aria-label={t("presentation.replaceFonts.from")}
              onChange={(event) => setFromCss(event.target.value)}
            >
              {fromOptions.map((option) => (
                <option key={option.css} value={option.css}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>
              {t("presentation.replaceFonts.to")}
            </span>
            <select
              value={toId}
              data-testid="presentation-replace-fonts-to"
              aria-label={t("presentation.replaceFonts.to")}
              onChange={(event) => setToId(event.target.value)}
            >
              {RUN_FONT_FAMILIES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </OfficeDialogShell>
  );
}
