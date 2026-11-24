"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Design > Slide Size dialogs (custom size and the fit choice) and the Print
 * settings dialog, with the slide size draft helpers and the rehearsal total
 * format.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { useRef, useState, type ReactElement } from "react";
import { Maximize2, RectangleHorizontal, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useLocale } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import {
  officeDialogParts as dialogParts,
  presentationDialogClassName,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  OFFICE_PAGE_ORIENTATION_ICON_IDS,
} from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";
import {
  PAGE_SETUP_SLIDE_SIZE_PRESETS,
  matchPageSetupPresetId,
  type SlideSizeFitStrategy,
  type SlideSizeEmu,
  customSlideSize,
  presetSize,
} from "@mrnote/core/web/lib/presentation-slide-size.ts";
import {
  PRINT_SCALE_MAX,
  PRINT_SCALE_MIN,
  SLIDES_PER_PAGE_OPTIONS,
  normalizePrintScale,
  normalizeSlidesPerPage,
  type PresentationPrintSettings,
  type ResolvedPresentationPrintSettings,
} from "@mrnote/core/web/lib/presentation-print-settings.ts";
import {
  PRESENTATION_EMU_PER_INCH,
  PRESENTATION_INCH_MARK,
  formatPresentationMeasurement,
  parsePresentationMeasurement,
  presentationMeasurementUnit,
  type PresentationMeasurementUnit,
} from "@mrnote/core/web/lib/presentation-measurement.ts";
import {
  MAX_PRESENTATION_FIRST_SLIDE_NUMBER,
  MIN_PRESENTATION_FIRST_SLIDE_NUMBER,
  orientPresentationNotesSize,
  presentationNotesOrientation,
  type PresentationNotesOrientation,
  type PresentationNotesSize,
} from "@mrnote/core/web/lib/presentation-header-footer.ts";

/**
 * A slide dimension as Page Setup shows it, up to three decimals: "33.867"
 * cm, or 13.333" for inches.
 */
function slideSizeDraft(emu: number, unit: PresentationMeasurementUnit): string {
  return formatPresentationMeasurement(emu, unit, 3);
}

/** A Page Setup draft (in the dialog's unit, or its own) in inches; 0 when unreadable. */
function slideSizeDraftInches(
  raw: string,
  unit: PresentationMeasurementUnit,
): number {
  return (parsePresentationMeasurement(raw, unit) ?? 0) / PRESENTATION_EMU_PER_INCH;
}

export function SlideSizeDialog({
  current,
  currentFirstSlideNumber,
  currentNotesSize,
  firstSlideNumberEditable,
  notesSizeEditable,
  onApply,
  onClose,
  onOpenHeaderFooter,
  t,
}: {
  current: SlideSizeEmu;
  currentFirstSlideNumber: number;
  currentNotesSize: PresentationNotesSize;
  firstSlideNumberEditable: boolean;
  notesSizeEditable: boolean;
  onApply: (
    size: SlideSizeEmu,
    firstSlideNumber: number,
    notesSize: PresentationNotesSize,
  ) => void;
  onClose: () => void;
  /** Page Setup's "Header/Footer..." button (PPT-B004). */
  onOpenHeaderFooter?: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const [presetId, setPresetId] = useState<string>(() =>
    matchPageSetupPresetId(current),
  );
  // PowerPoint's Page Setup reads the system measurement unit (zh-CN:
  // "33.867 厘米", en-US: 13.333"); the drafts are in that unit, the model
  // stays EMU.
  const sizeUnit = presentationMeasurementUnit(useLocale());
  const sizeUnitLabel =
    sizeUnit === "in" ? PRESENTATION_INCH_MARK : t("presentation.unit.cm");
  const [widthDraft, setWidthDraft] = useState<string>(() =>
    slideSizeDraft(current.widthEmu, sizeUnit),
  );
  const [heightDraft, setHeightDraft] = useState<string>(() =>
    slideSizeDraft(current.heightEmu, sizeUnit),
  );
  const [exactCustomSize, setExactCustomSize] =
    useState<SlideSizeEmu | null>(null);
  const [firstSlideNumberDraft, setFirstSlideNumberDraft] = useState(() =>
    String(currentFirstSlideNumber),
  );
  const [notesOrientation, setNotesOrientation] =
    useState<PresentationNotesOrientation>(() =>
      presentationNotesOrientation(currentNotesSize),
    );
  const firstSlideNumber = Number(firstSlideNumberDraft);
  const firstSlideNumberValid =
    Number.isInteger(firstSlideNumber) &&
    firstSlideNumber >= MIN_PRESENTATION_FIRST_SLIDE_NUMBER &&
    firstSlideNumber <= MAX_PRESENTATION_FIRST_SLIDE_NUMBER;
  const isCustom = presetId === "custom";
  // A custom width or height left blank, or outside PowerPoint's 1-56 in, is
  // not a size yet: nothing is applied and the dialog says the range, as
  // PowerPoint's own message does. It used to read as zero and be clamped to
  // the one-inch minimum, a page nobody asked for (PPT-B391).
  const customSizeBounds = sizeUnit === "in" ? { min: 1, max: 56 } : { min: 2.54, max: 142.24 };
  const customDraftStated = (draft: string): boolean => {
    if (draft.trim() === "") return false;
    const value = Number(draft);
    return Number.isFinite(value) && value >= customSizeBounds.min && value <= customSizeBounds.max;
  };
  const widthStated = !isCustom || exactCustomSize !== null || customDraftStated(widthDraft);
  const heightStated = !isCustom || exactCustomSize !== null || customDraftStated(heightDraft);
  const customSizeStated = widthStated && heightStated;
  const resolved: SlideSizeEmu = isCustom
    ? (exactCustomSize ??
      customSlideSize(
        slideSizeDraftInches(widthDraft, sizeUnit),
        slideSizeDraftInches(heightDraft, sizeUnit),
      ))
    : (presetSize(presetId) ?? current);
  const portrait = resolved.heightEmu > resolved.widthEmu;
  const selectOrientation = (next: "landscape" | "portrait") => {
    const shouldBePortrait = next === "portrait";
    if (portrait === shouldBePortrait) return;
    const swapped = {
      widthEmu: resolved.heightEmu,
      heightEmu: resolved.widthEmu,
    };
    setExactCustomSize(swapped);
    setWidthDraft(slideSizeDraft(swapped.widthEmu, sizeUnit));
    setHeightDraft(slideSizeDraft(swapped.heightEmu, sizeUnit));
    setPresetId("custom");
  };
  const presetRef = useRef<HTMLSelectElement | null>(null);
  return (
    <OfficeDialogShell
      open
      title={t("presentation.slideSize.label")}
      description={t("presentation.slideSize.description")}
      defaultActionLabel={t("presentation.slideSize.ok")}
      cancelActionLabel={t("presentation.slideSize.cancel")}
      defaultActionDisabled={!firstSlideNumberValid || !customSizeStated}
      onDefaultAction={() =>
        onApply(
          resolved,
          firstSlideNumber,
          orientPresentationNotesSize(currentNotesSize, notesOrientation),
        )
      }
      onCancel={onClose}
      initialFocusRef={presetRef}
      testIdPrefix="presentation-slide-size"
      defaultActionTestId="presentation-slide-size-apply"
    >
      <label className={dialogParts.field}>
        <span className={dialogParts.label}>
          {t("presentation.slideSize.sizedFor")}
        </span>
        <select
          ref={presetRef}
          value={presetId}
          data-testid="presentation-slide-size-preset"
          aria-label={t("presentation.slideSize.sizedFor")}
          onChange={(event) => {
            const next = event.target.value;
            setPresetId(next);
            const size = presetSize(next);
            if (size) {
              setExactCustomSize(null);
              setWidthDraft(slideSizeDraft(size.widthEmu, sizeUnit));
              setHeightDraft(slideSizeDraft(size.heightEmu, sizeUnit));
            }
          }}
        >
          {PAGE_SETUP_SLIDE_SIZE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {t(preset.labelKey)}
            </option>
          ))}
          <option value="custom">{t("presentation.slideSize.custom")}</option>
        </select>
      </label>
      <div className={dialogParts.row}>
        <label className={dialogParts.field} style={{ flex: 1 }}>
          <span className={dialogParts.label}>
            {t("presentation.slideSize.widthLabel")}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="number"
              min={sizeUnit === "in" ? 1 : 2.54}
              max={sizeUnit === "in" ? 56 : 142.24}
              step="any"
              value={widthDraft}
              aria-invalid={!widthStated}
              data-testid="presentation-slide-size-width"
              aria-label={`${t("presentation.slideSize.widthLabel")} (${sizeUnitLabel})`}
              onChange={(event) => {
                setExactCustomSize(null);
                setWidthDraft(event.target.value);
                setPresetId("custom");
              }}
            />
            <span aria-hidden>{sizeUnitLabel}</span>
          </span>
        </label>
        <label className={dialogParts.field} style={{ flex: 1 }}>
          <span className={dialogParts.label}>
            {t("presentation.slideSize.heightLabel")}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="number"
              min={sizeUnit === "in" ? 1 : 2.54}
              max={sizeUnit === "in" ? 56 : 142.24}
              step="any"
              value={heightDraft}
              aria-invalid={!heightStated}
              data-testid="presentation-slide-size-height"
              aria-label={`${t("presentation.slideSize.heightLabel")} (${sizeUnitLabel})`}
              onChange={(event) => {
                setExactCustomSize(null);
                setHeightDraft(event.target.value);
                setPresetId("custom");
              }}
            />
            <span aria-hidden>{sizeUnitLabel}</span>
          </span>
        </label>
      </div>
      {!customSizeStated ? (
        <p role="alert" data-testid="presentation-slide-size-range" style={{ margin: "4px 0 0", fontSize: 12 }}>
          {t("presentation.slideSize.rangeMessage", {
            min: customSizeBounds.min,
            max: customSizeBounds.max,
          })}
        </p>
      ) : null}
      <fieldset data-testid="presentation-slide-size-orientation">
        {/* Page Setup's Orientation group: "Slides:" then "Notes, handouts &
            outlines:", each a landscape / portrait pair. */}
        <legend>
          {t("presentation.slideSize.orientationGroup")} ·{" "}
          {t("presentation.slideSize.slidesLabel")}
        </legend>
        <div className={dialogParts.row}>
          {(
            [
              ["landscape", "presentation.slideSize.landscape"],
              ["portrait", "presentation.slideSize.portrait"],
            ] as const
          ).map(([value, labelKey]) => (
            <label key={value} className={dialogParts.check}>
              <input
                type="radio"
                name="presentation-slide-orientation"
                value={value}
                checked={portrait === (value === "portrait")}
                data-control-id={`PPTCTL.DIALOG.PAGE_SETUP.SLIDE_ORIENTATION.${value.toUpperCase()}`}
                data-testid={`presentation-slide-size-orientation-${value}`}
                onChange={() => selectOrientation(value)}
              />
              <OfficeSemanticIcon
                semanticId={OFFICE_PAGE_ORIENTATION_ICON_IDS[value]}
                size={20}
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={dialogParts.field}>
        <span className={dialogParts.label}>
          {t("presentation.slideSize.firstSlideNumber")}
        </span>
        <input
          type="number"
          min={MIN_PRESENTATION_FIRST_SLIDE_NUMBER}
          max={MAX_PRESENTATION_FIRST_SLIDE_NUMBER}
          step={1}
          value={firstSlideNumberDraft}
          disabled={!firstSlideNumberEditable}
          title={
            firstSlideNumberEditable
              ? undefined
              : t(
                  "presentation.slideSize.firstSlideNumberNativeUnavailable",
                )
          }
          data-control-id="PPTCTL.DIALOG.PAGE_SETUP.NUMBER_SLIDES_FROM"
          data-testid="presentation-slide-size-first-slide-number"
          aria-label={t("presentation.slideSize.firstSlideNumber")}
          onChange={(event) => setFirstSlideNumberDraft(event.target.value)}
        />
      </label>
      <fieldset
        disabled={!notesSizeEditable}
        title={
          notesSizeEditable
            ? undefined
            : t("presentation.slideSize.notesOrientationNativeUnavailable")
        }
        data-testid="presentation-notes-orientation"
      >
        <legend>{t("presentation.slideSize.notesLabel")}</legend>
        <div className={dialogParts.row}>
          {(["portrait", "landscape"] as const).map((orientation) => (
            <label key={orientation} className={dialogParts.check}>
              <input
                type="radio"
                name="presentation-notes-orientation"
                value={orientation}
                checked={notesOrientation === orientation}
                data-control-id={`PPTCTL.DIALOG.PAGE_SETUP.NOTES_ORIENTATION.${orientation.toUpperCase()}`}
                onChange={() => setNotesOrientation(orientation)}
              />
              <OfficeSemanticIcon
                semanticId={OFFICE_PAGE_ORIENTATION_ICON_IDS[orientation]}
                size={20}
              />
              {t(`presentation.slideSize.${orientation}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {onOpenHeaderFooter ? (
        <div className={dialogParts.row}>
          <button
            type="button"
            className={dialogParts.button}
            data-testid="presentation-slide-size-header-footer"
            onClick={onOpenHeaderFooter}
          >
            {t("presentation.slideSize.headerFooter")}
          </button>
        </div>
      ) : null}
    </OfficeDialogShell>
  );
}

/** PowerPoint's rehearsal total, `h:mm:ss` ("0:00:09"). */
export function formatRehearsalTotal(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1_000) : 0;
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function SlideSizeFitChoiceDialog({
  onApply,
  onClose,
  t,
}: {
  onApply: (strategy: SlideSizeFitStrategy) => void;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  return (
    <div
      className={presentationDialogClassName("md")}
      role="dialog"
      aria-modal="true"
      aria-label={t("presentation.slideSize.fitChoiceTitle")}
      data-testid="presentation-slide-size-fit-dialog"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className={dialogParts.header}>
        <strong className={dialogParts.title}>
          {t("presentation.slideSize.fitChoiceTitle")}
        </strong>
        <button
          type="button"
          className={dialogParts.close}
          aria-label={t("presentation.slideSize.cancel")}
          data-testid="presentation-slide-size-fit-close"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <p className={dialogParts.description}>
        {t("presentation.slideSize.fitChoiceDescription")}
      </p>
      <div className={dialogParts.body}>
        <p className={dialogParts.hint}>
          <strong>{t("presentation.slideSize.maximize")}</strong>
          {": "}
          {t("presentation.slideSize.maximizeDescription")}
        </p>
        <p className={dialogParts.hint}>
          <strong>{t("presentation.slideSize.ensureFit")}</strong>
          {": "}
          {t("presentation.slideSize.ensureFitDescription")}
        </p>
      </div>
      <div className={dialogParts.footer}>
        <button
          type="button"
          className={dialogParts.button}
          data-testid="presentation-slide-size-fit-cancel"
          onClick={onClose}
        >
          {t("presentation.slideSize.cancel")}
        </button>
        <button
          type="button"
          className={dialogParts.button}
          data-testid="presentation-slide-size-maximize"
          onClick={() => onApply("maximize")}
        >
          <Maximize2 size={14} aria-hidden="true" />
          {t("presentation.slideSize.maximize")}
        </button>
        <button
          type="button"
          className={dialogParts.primaryButton}
          data-testid="presentation-slide-size-ensure-fit"
          data-initial-focus=""
          autoFocus
          onClick={() => onApply("ensure-fit")}
        >
          <RectangleHorizontal size={14} aria-hidden="true" />
          {t("presentation.slideSize.ensureFit")}
        </button>
      </div>
    </div>
  );
}

/**
 * Print / Handout Settings dialog (PowerPoint "Print ▸ Handouts" parity): pick
 * how many slides are tiled per printed page (1 / 2 / 3 / 6) + a print scale
 * percentage. Mirrors the spreadsheet Page Setup dialog (a draft form applied
 * on confirm). Reset clears back to the export default (2 slides/page, 100 %),
 * which persists as "no print settings" (byte-clean) so the handout export
 * reverts to handout-2. The chosen slides-per-page drives the handout PDF
 * export URL's `layout` param.
 */
export function PresentationPrintSettingsDialog({
  current,
  onApply,
  onReset,
  onClose,
  t,
}: {
  current: ResolvedPresentationPrintSettings;
  onApply: (settings: PresentationPrintSettings) => void;
  onReset: () => void;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const [slidesPerPage, setSlidesPerPage] = useState<number>(
    () => current.slidesPerPage,
  );
  const [scale, setScale] = useState<string>(() => String(current.scale));
  const [printHiddenSlides, setPrintHiddenSlides] = useState<boolean>(() => current.printHiddenSlides);
  const slidesPerPageRef = useRef<HTMLSelectElement | null>(null);
  return (
    <OfficeDialogShell
      open
      title={t("presentation.printSettings")}
      description={t("presentation.printSettingsDescription")}
      defaultActionLabel={t("presentation.printApply")}
      cancelActionLabel={t("toolbar.cancel")}
      onDefaultAction={() =>
        onApply({
          slidesPerPage: normalizeSlidesPerPage(slidesPerPage),
          scale: normalizePrintScale(Number(scale)),
          // Stated either way: the deck merges the dialog's answer over what
          // it holds, and an unchecked box left out kept the old "on"
          
          // (`printHiddenSlidesAnswer`): off is `false`, on is PowerPoint's
          // default (checked when the deck states nothing).
          printHiddenSlides,
        })
      }
      onCancel={onClose}
      initialFocusRef={slidesPerPageRef}
      footerStart={
        <button
          type="button"
          className={dialogParts.button}
          onClick={onReset}
          data-testid="presentation-print-settings-reset"
        >
          {t("presentation.printReset")}
        </button>
      }
      testIdPrefix="presentation-print-settings"
      defaultActionTestId="presentation-print-settings-apply"
    >
      <label className={dialogParts.field}>
        <span className={dialogParts.label}>
          {t("presentation.printSlidesPerPage")}
        </span>
        <select
          ref={slidesPerPageRef}
          value={slidesPerPage}
          data-testid="presentation-print-slides-per-page"
          aria-label={t("presentation.printSlidesPerPage")}
          onChange={(event) =>
            setSlidesPerPage(
              normalizeSlidesPerPage(Number(event.target.value)),
            )
          }
        >
          {SLIDES_PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t("presentation.printSlidesPerPageOption", { count: option })}
            </option>
          ))}
        </select>
      </label>
      <label className={dialogParts.field}>
        <span className={dialogParts.label}>{t("presentation.printScale")}</span>
        <input
          type="number"
          min={PRINT_SCALE_MIN}
          max={PRINT_SCALE_MAX}
          step={5}
          value={scale}
          data-testid="presentation-print-scale"
          aria-label={t("presentation.printScale")}
          onChange={(event) => setScale(event.target.value)}
        />
      </label>
      <label className={dialogParts.check}>
        <input
          type="checkbox"
          checked={printHiddenSlides}
          data-testid="presentation-print-hidden-slides"
          onChange={(event) => setPrintHiddenSlides(event.target.checked)}
        />
        <span>{t("presentation.printHiddenSlides")}</span>
      </label>
    </OfficeDialogShell>
  );
}
