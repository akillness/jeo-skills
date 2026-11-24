"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  MAX_PRESENTATION_DATE_LENGTH,
  MAX_PRESENTATION_FOOTER_LENGTH,
  PRESENTATION_DATE_FIELD_FORMATS,
  PRESENTATION_DATE_FIELD_LOCALES,
  formatDeckDate,
  normalizeNotesHandouts,
  sanitizeFooterText,
  type NotesHandoutsHeaderFooter,
  type PresentationDateFieldFormat,
  type PresentationDateFieldLocale,
} from "@mrnote/core/web/lib/presentation-header-footer.ts";
import type { PresentationHeaderFooterDialogDraft } from "@mrnote/core/web/lib/presentation-slide-buttons.ts";

type HeaderFooterTab = "slide" | "notes";

/** What the Notes and Handouts page holds while the dialog is open. */
interface NotesDraft {
  dateEnabled: boolean;
  dateMode: "auto" | "fixed";
  fixedDateText: string;
  dateFormat: PresentationDateFieldFormat;
  dateLocale: PresentationDateFieldLocale;
  headerEnabled: boolean;
  headerText: string;
  pageNumber: boolean;
  footerEnabled: boolean;
  footerText: string;
}

function notesDraftFrom(
  value: NotesHandoutsHeaderFooter | undefined,
  locale: PresentationDateFieldLocale,
): NotesDraft {
  const date = value?.dateField;
  return {
    dateEnabled: date !== undefined,
    dateMode: date?.mode ?? "auto",
    fixedDateText: date?.mode === "fixed" ? date.text ?? "" : "",
    dateFormat: date?.format ?? "datetime1",
    dateLocale: date?.locale ?? locale,
    headerEnabled: value?.header !== undefined,
    headerText: value?.header ?? "",
    pageNumber: value?.pageNumber !== false,
    footerEnabled: value?.footer !== undefined,
    footerText: value?.footer ?? "",
  };
}

/** The Notes and Handouts page as the deck states it (undefined: the defaults). */
export function notesHandoutsFromDraft(draft: NotesDraft): NotesHandoutsHeaderFooter | undefined {
  return normalizeNotesHandouts({
    pageNumber: draft.pageNumber ? undefined : false,
    header: draft.headerEnabled ? draft.headerText : undefined,
    footer: draft.footerEnabled ? draft.footerText : undefined,
    dateField: !draft.dateEnabled
      ? undefined
      : draft.dateMode === "auto"
        ? { mode: "auto", format: draft.dateFormat, locale: draft.dateLocale }
        : { mode: "fixed", text: draft.fixedDateText },
  });
}

function notesDraftValid(draft: NotesDraft): boolean {
  return (
    (!draft.headerEnabled || sanitizeFooterText(draft.headerText).length > 0) &&
    (!draft.footerEnabled || sanitizeFooterText(draft.footerText).length > 0) &&
    (!draft.dateEnabled ||
      draft.dateMode !== "fixed" ||
      sanitizeFooterText(draft.fixedDateText).length > 0)
  );
}

export interface PresentationHeaderFooterDialogProps {
  readonly open: boolean;
  readonly entry: "footer" | "date" | "number";
  readonly draft: PresentationHeaderFooterDialogDraft;
  readonly setDraft: Dispatch<SetStateAction<PresentationHeaderFooterDialogDraft>>;
  readonly valid: boolean;
  /** The deck's Notes and Handouts page when the dialog opened. */
  readonly notesHandouts: NotesHandoutsHeaderFooter | undefined;
  readonly defaultDateLocale: PresentationDateFieldLocale;
  readonly now: Date;
  /** Slide and notes-page shapes for the previews (any unit, width / height). */
  readonly slideSize: { readonly width: number; readonly height: number };
  readonly notesSize: { readonly widthEmu: number; readonly heightEmu: number };
  readonly dateFocusRef: RefObject<HTMLInputElement | null>;
  readonly numberFocusRef: RefObject<HTMLInputElement | null>;
  readonly footerFocusRef: RefObject<HTMLInputElement | null>;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onApplySlides: (scope: "current" | "all") => void;
  readonly onApplyNotesHandouts: (value: NotesHandoutsHeaderFooter | undefined) => void;
  readonly onCancel: () => void;
}

/**
 * PowerPoint's Header and Footer (Insert > Header & Footer, Date & Time,
 * Slide Number): a Slide page and a Notes and Handouts page, each with its
 * preview (the bold boxes are the items that are on), and Cancel, Apply,
 * Apply to All (PPT-B006, B007, B009; Mac 16.86 strings). Apply is the
 * current slide's; the Notes and Handouts page applies to every notes page
 * and handout, so it has Apply to All only.
 */
export function PresentationHeaderFooterDialog({
  open,
  entry,
  draft,
  setDraft,
  valid,
  notesHandouts,
  defaultDateLocale,
  now,
  slideSize,
  notesSize,
  dateFocusRef,
  numberFocusRef,
  footerFocusRef,
  returnFocusRef,
  onApplySlides,
  onApplyNotesHandouts,
  onCancel,
}: PresentationHeaderFooterDialogProps): React.JSX.Element | null {
  const t = useTranslations("console-notebooks");
  const id = useId();
  const [tab, setTab] = useState<HeaderFooterTab>("slide");
  const [notes, setNotes] = useState<NotesDraft>(() =>
    notesDraftFrom(notesHandouts, defaultDateLocale),
  );
  // Each opening starts on the Slide page from the deck's current values.
  const [openedWith, setOpenedWith] = useState<boolean>(open);
  if (open !== openedWith) {
    setOpenedWith(open);
    if (open) {
      setTab("slide");
      setNotes(notesDraftFrom(notesHandouts, defaultDateLocale));
    }
  }
  // Mounted closed with the editor and re-rendered with it on every
  // keystroke: one that has never opened builds nothing (its date choices
  // format the moment in every pattern), as its dialog shell draws nothing
  // then either. Once opened it stays built, for its closing animation.
  const [everOpened, setEverOpened] = useState<boolean>(open);
  if (open && !everOpened) setEverOpened(true);
  if (!open && !everOpened) return null;
  const notesValid = notesDraftValid(notes);
  const updateNotes = (patch: Partial<NotesDraft>) =>
    setNotes((current) => ({ ...current, ...patch }));
  const applyAll = () => {
    if (tab === "notes") {
      if (notesValid) onApplyNotesHandouts(notesHandoutsFromDraft(notes));
      return;
    }
    onApplySlides("all");
  };

  const dateSection = (
    page: HeaderFooterTab,
    value: {
      enabled: boolean;
      mode: "auto" | "fixed";
      format: PresentationDateFieldFormat;
      locale: PresentationDateFieldLocale;
      fixedText: string;
    },
    update: (patch: {
      enabled?: boolean;
      mode?: "auto" | "fixed";
      format?: PresentationDateFieldFormat;
      locale?: PresentationDateFieldLocale;
      fixedText?: string;
    }) => void,
  ) => {
    const prefix = page === "slide" ? "presentation-headerfooter" : "presentation-headerfooter-notes";
    const control = page === "slide" ? "SLIDES" : "NOTES";
    return (
      <>
        <label className="flex items-center gap-2">
          <input
            ref={page === "slide" ? dateFocusRef : undefined}
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
            data-control-id={`PPTCTL.DIALOG.HEADER_FOOTER.${control}.DATE_ENABLED`}
            data-testid={`${prefix}-date-enabled`}
          />
          {t("presentation.headerFooter.dateTime")}
        </label>
        <div className="grid gap-2 pl-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${id}-${page}-date-mode`}
              checked={value.mode === "auto"}
              disabled={!value.enabled}
              onChange={() => update({ mode: "auto" })}
              data-control-id={`PPTCTL.DIALOG.HEADER_FOOTER.${control}.DATE.AUTO`}
              data-testid={`${prefix}-date-auto`}
            />
            {t("presentation.headerFooter.dateAuto")}
          </label>
          <label className={`${officeDialogParts.field} grid gap-1`}>
            {t("presentation.headerFooter.dateFormat")}
            <select
              value={value.format}
              disabled={!value.enabled || value.mode !== "auto"}
              onChange={(event) =>
                update({ format: event.target.value as PresentationDateFieldFormat })
              }
              data-control-id={`PPTCTL.DIALOG.HEADER_FOOTER.${control}.DATE.FORMAT`}
              data-testid={`${prefix}-date-format`}
            >
              {PRESENTATION_DATE_FIELD_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {formatDeckDate({ mode: "auto", format, locale: value.locale }, now)}
                </option>
              ))}
            </select>
          </label>
          <label className={`${officeDialogParts.field} grid gap-1`}>
            {t("presentation.headerFooter.dateLanguage")}
            <select
              value={value.locale}
              disabled={!value.enabled || value.mode !== "auto"}
              onChange={(event) =>
                update({ locale: event.target.value as PresentationDateFieldLocale })
              }
              data-control-id={`PPTCTL.DIALOG.HEADER_FOOTER.${control}.DATE.LANGUAGE`}
              data-testid={`${prefix}-date-language`}
            >
              {PRESENTATION_DATE_FIELD_LOCALES.map((dateLocale) => (
                <option key={dateLocale} value={dateLocale}>
                  {t(
                    dateLocale === "zh-CN"
                      ? "presentation.headerFooter.dateLanguageZh"
                      : "presentation.headerFooter.dateLanguageEn",
                  )}
                </option>
              ))}
              { }
              {(PRESENTATION_DATE_FIELD_LOCALES as readonly string[]).includes(value.locale) ? null : (
                <option value={value.locale}>{value.locale}</option>
              )}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${id}-${page}-date-mode`}
              checked={value.mode === "fixed"}
              disabled={!value.enabled}
              onChange={() =>
                update({
                  mode: "fixed",
                  fixedText:
                    value.fixedText ||
                    formatDeckDate(
                      { mode: "auto", format: value.format, locale: value.locale },
                      now,
                    ),
                })
              }
              data-control-id={`PPTCTL.DIALOG.HEADER_FOOTER.${control}.DATE.FIXED`}
              data-testid={`${prefix}-date-fixed-choice`}
            />
            {t("presentation.headerFooter.dateFixed")}
          </label>
          <input
            type="text"
            value={value.fixedText}
            maxLength={MAX_PRESENTATION_DATE_LENGTH}
            disabled={!value.enabled || value.mode !== "fixed"}
            onChange={(event) => update({ fixedText: event.target.value })}
            placeholder={t("presentation.headerFooter.dateFixedPlaceholder")}
            aria-label={t("presentation.headerFooter.dateFixed")}
            data-control-id={`PPTCTL.DIALOG.HEADER_FOOTER.${control}.DATE.FIXED_INPUT`}
            data-testid={`${prefix}-date-fixed`}
          />
        </div>
      </>
    );
  };

  const textItem = (
    label: string,
    enabled: boolean,
    text: string,
    update: (patch: { enabled?: boolean; text?: string }) => void,
    testId: string,
    controlId: string,
    focusRef?: RefObject<HTMLInputElement | null>,
  ) => (
    <>
      <label className="flex items-center gap-2">
        <input
          ref={focusRef}
          type="checkbox"
          checked={enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
          data-control-id={`${controlId}_ENABLED`}
          data-testid={`${testId}-enabled`}
        />
        {label}
      </label>
      <input
        type="text"
        value={text}
        maxLength={MAX_PRESENTATION_FOOTER_LENGTH}
        disabled={!enabled}
        onChange={(event) => update({ text: event.target.value })}
        aria-label={label}
        data-control-id={`${controlId}_INPUT`}
        data-testid={testId}
      />
    </>
  );

  return (
    <OfficeDialogShell
      open={open}
      title={
        <span data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.ROOT">
          {t("presentation.headerFooter.toolbarLabel")}
        </span>
      }
      description={t("presentation.headerFooter.dialogDescription")}
      defaultActionLabel={
        <span data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.SLIDES.APPLY_ALL">
          {t("presentation.headerFooter.applyAll")}
        </span>
      }
      cancelActionLabel={
        <span data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.CANCEL">
          {t("toolbar.cancel")}
        </span>
      }
      footerBeforeDefault={
        <button
          type="button"
          disabled={tab !== "slide" || !valid}
          onClick={() => onApplySlides("current")}
          data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.SLIDES.APPLY"
          data-testid="presentation-headerfooter-apply-current"
          className={officeDialogParts.button}
        >
          {t("presentation.headerFooter.applyCurrent")}
        </button>
      }
      onDefaultAction={applyAll}
      onCancel={onCancel}
      defaultActionDisabled={tab === "slide" ? !valid : !notesValid}
      initialFocusRef={
        entry === "date" ? dateFocusRef : entry === "number" ? numberFocusRef : footerFocusRef
      }
      returnFocusRef={returnFocusRef}
      testIdPrefix="presentation-headerfooter"
      tabStrip={
        <div
          className={officeDialogParts.tabs}
          role="tablist"
          aria-label={t("presentation.headerFooter.toolbarLabel")}
        >
          {(["slide", "notes"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`${id}-${item}-tab`}
              aria-controls={`${id}-${item}-panel`}
              aria-selected={tab === item}
              tabIndex={tab === item ? 0 : -1}
              className={officeDialogParts.tab}
              onClick={() => setTab(item)}
              data-control-id={
                item === "slide"
                  ? "PPTCTL.DIALOG.HEADER_FOOTER.TAB.SLIDES"
                  : "PPTCTL.DIALOG.HEADER_FOOTER.TAB.NOTES"
              }
              data-testid={`presentation-headerfooter-tab-${item}`}
            >
              {t(
                item === "slide"
                  ? "presentation.headerFooter.slidesOnly"
                  : "presentation.headerFooter.notesAndHandouts",
              )}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-3">
        <HeaderFooterPreview
          tab={tab}
          slideSize={slideSize}
          notesSize={notesSize}
          on={
            tab === "slide"
              ? {
                  dt: draft.dateEnabled,
                  ftr: draft.footerEnabled,
                  sldNum: draft.slideNumber,
                }
              : {
                  hdr: notes.headerEnabled,
                  dt: notes.dateEnabled,
                  ftr: notes.footerEnabled,
                  sldNum: notes.pageNumber,
                }
          }
          label={t("presentation.headerFooter.preview")}
          description={t(
            tab === "slide"
              ? "presentation.headerFooter.slidePreview"
              : "presentation.headerFooter.notesPreview",
          )}
        />
        {tab === "slide" ? (
          <div
            role="tabpanel"
            id={`${id}-slide-panel`}
            aria-labelledby={`${id}-slide-tab`}
            data-testid="presentation-headerfooter-slides"
            className="grid gap-3"
          >
            {dateSection(
              "slide",
              {
                enabled: draft.dateEnabled,
                mode: draft.dateMode,
                format: draft.dateFormat,
                locale: draft.dateLocale,
                fixedText: draft.fixedDateText,
              },
              (patch) =>
                setDraft((current) => ({
                  ...current,
                  ...(patch.enabled === undefined ? {} : { dateEnabled: patch.enabled }),
                  ...(patch.mode === undefined ? {} : { dateMode: patch.mode }),
                  ...(patch.format === undefined ? {} : { dateFormat: patch.format }),
                  ...(patch.locale === undefined ? {} : { dateLocale: patch.locale }),
                  ...(patch.fixedText === undefined ? {} : { fixedDateText: patch.fixedText }),
                })),
            )}
            <label className="flex items-center gap-2">
              <input
                ref={numberFocusRef}
                type="checkbox"
                checked={draft.slideNumber}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, slideNumber: event.target.checked }))
                }
                data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.SLIDES.SLIDE_NUMBER"
                data-testid="presentation-headerfooter-slide-number"
              />
              {t("presentation.headerFooter.slideNumber")}
            </label>
            <label className="flex items-center gap-2">
              <input
                ref={footerFocusRef}
                type="checkbox"
                checked={draft.footerEnabled}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, footerEnabled: event.target.checked }))
                }
                data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.SLIDES.FOOTER_ENABLED"
                data-testid="presentation-headerfooter-footer-enabled"
              />
              {t("presentation.headerFooter.footer")}
            </label>
            <input
              type="text"
              value={draft.footerText}
              maxLength={MAX_PRESENTATION_FOOTER_LENGTH}
              disabled={!draft.footerEnabled}
              onChange={(event) =>
                setDraft((current) => ({ ...current, footerText: event.target.value }))
              }
              placeholder={t("presentation.headerFooter.footerPlaceholder")}
              aria-label={t("presentation.headerFooter.footer")}
              data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.SLIDES.FOOTER_INPUT"
              data-testid="presentation-headerfooter-footer"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.excludeTitleSlide}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, excludeTitleSlide: event.target.checked }))
                }
                data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.SLIDES.HIDE_TITLE"
                data-testid="presentation-headerfooter-exclude-title"
              />
              {t("presentation.headerFooter.excludeTitleSlide")}
            </label>
          </div>
        ) : (
          <div
            role="tabpanel"
            id={`${id}-notes-panel`}
            aria-labelledby={`${id}-notes-tab`}
            data-testid="presentation-headerfooter-notes"
            className="grid gap-3"
          >
            {dateSection(
              "notes",
              {
                enabled: notes.dateEnabled,
                mode: notes.dateMode,
                format: notes.dateFormat,
                locale: notes.dateLocale,
                fixedText: notes.fixedDateText,
              },
              (patch) =>
                updateNotes({
                  ...(patch.enabled === undefined ? {} : { dateEnabled: patch.enabled }),
                  ...(patch.mode === undefined ? {} : { dateMode: patch.mode }),
                  ...(patch.format === undefined ? {} : { dateFormat: patch.format }),
                  ...(patch.locale === undefined ? {} : { dateLocale: patch.locale }),
                  ...(patch.fixedText === undefined ? {} : { fixedDateText: patch.fixedText }),
                }),
            )}
            {textItem(
              t("presentation.headerFooter.header"),
              notes.headerEnabled,
              notes.headerText,
              (patch) =>
                updateNotes({
                  ...(patch.enabled === undefined ? {} : { headerEnabled: patch.enabled }),
                  ...(patch.text === undefined ? {} : { headerText: patch.text }),
                }),
              "presentation-headerfooter-notes-header",
              "PPTCTL.DIALOG.HEADER_FOOTER.NOTES.HEADER",
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notes.pageNumber}
                onChange={(event) => updateNotes({ pageNumber: event.target.checked })}
                data-control-id="PPTCTL.DIALOG.HEADER_FOOTER.NOTES.PAGE_NUMBER"
                data-testid="presentation-headerfooter-notes-page-number"
              />
              {t("presentation.headerFooter.pageNumber")}
            </label>
            {textItem(
              t("presentation.headerFooter.footer"),
              notes.footerEnabled,
              notes.footerText,
              (patch) =>
                updateNotes({
                  ...(patch.enabled === undefined ? {} : { footerEnabled: patch.enabled }),
                  ...(patch.text === undefined ? {} : { footerText: patch.text }),
                }),
              "presentation-headerfooter-notes-footer",
              "PPTCTL.DIALOG.HEADER_FOOTER.NOTES.FOOTER",
            )}
          </div>
        )}
      </div>
    </OfficeDialogShell>
  );
}

type PreviewItem = "hdr" | "dt" | "ftr" | "sldNum";

/**
 * The dialog's "Preview:" thumbnail: the page with its header and footer
 * boxes where PowerPoint puts them -- on a slide date, footer and number
 * along the bottom; on a notes page header and date at the top, footer and
 * page number at the bottom -- each drawn bold when it is on.
 */
function HeaderFooterPreview({
  tab,
  slideSize,
  notesSize,
  on,
  label,
  description,
}: {
  readonly tab: HeaderFooterTab;
  readonly slideSize: { readonly width: number; readonly height: number };
  readonly notesSize: { readonly widthEmu: number; readonly heightEmu: number };
  readonly on: Partial<Record<PreviewItem, boolean>>;
  readonly label: string;
  readonly description: string;
}) {
  const box = 96;
  const [pageWidth, pageHeight] =
    tab === "slide"
      ? [slideSize.width, slideSize.height]
      : [notesSize.widthEmu, notesSize.heightEmu];
  const scale = box / Math.max(pageWidth, pageHeight, 1);
  const width = Math.max(pageWidth * scale, 1);
  const height = Math.max(pageHeight * scale, 1);
  const bandHeight = height * 0.06;
  const items: Array<{ item: PreviewItem; x: number; y: number; w: number }> =
    tab === "slide"
      ? [
          { item: "dt", x: width * 0.07, y: height * 0.9, w: width * 0.26 },
          { item: "ftr", x: width * 0.36, y: height * 0.9, w: width * 0.28 },
          { item: "sldNum", x: width * 0.67, y: height * 0.9, w: width * 0.26 },
        ]
      : [
          { item: "hdr", x: width * 0.05, y: height * 0.03, w: width * 0.42 },
          { item: "dt", x: width * 0.53, y: height * 0.03, w: width * 0.42 },
          { item: "ftr", x: width * 0.05, y: height * 0.91, w: width * 0.42 },
          { item: "sldNum", x: width * 0.53, y: height * 0.91, w: width * 0.42 },
        ];
  return (
    <div className="flex items-center gap-3" data-testid="presentation-headerfooter-preview">
      <span>{label}</span>
      <svg
        role="img"
        aria-label={description}
        width={width + 8}
        height={height + 8}
        viewBox={`-4 -4 ${width + 8} ${height + 8}`}
        className={officeDialogParts.well}
      >
        <rect x={0} y={0} width={width} height={height} fill="var(--office-dialog-surface, #fff)" stroke="currentColor" strokeOpacity={0.35} />
        {tab === "notes" ? (
          <>
            <rect x={width * 0.15} y={height * 0.12} width={width * 0.7} height={height * 0.32} fill="none" stroke="currentColor" strokeOpacity={0.25} />
            {[0, 1, 2, 3, 4].map((line) => (
              <line key={line} x1={width * 0.12} x2={width * 0.88} y1={height * (0.52 + line * 0.07)} y2={height * (0.52 + line * 0.07)} stroke="currentColor" strokeOpacity={0.2} />
            ))}
          </>
        ) : null}
        {items.map(({ item, x, y, w }) => (
          <rect
            key={item}
            x={x}
            y={y}
            width={w}
            height={bandHeight}
            fill="none"
            stroke="currentColor"
            strokeWidth={on[item] ? 2 : 0.75}
            strokeOpacity={on[item] ? 1 : 0.35}
            data-testid={`presentation-headerfooter-preview-${item}`}
            data-on={on[item] ? "true" : "false"}
          />
        ))}
      </svg>
    </div>
  );
}
