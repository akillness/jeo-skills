"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState, type RefObject } from "react";
import { Minus, Plus } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import styles from "@mrnote/core/web/components/console/editor/native-document/DocumentLayoutDialogs.module.css";
import {
  MAX_PAGE_NUMBER_CHAPTER_STYLE,
  MAX_PAGE_NUMBER_DIALOG_START,
  PAGE_NUMBER_CHAPTER_SEPARATORS,
  type PageNumberChapterSeparator,
  type PageNumberFormat,
} from "@mrnote/core/web/components/console/editor/native-document/pageNumberFormat.ts";
import {
  PAGE_NUMBER_DIALOG_ALIGNMENTS,
  PAGE_NUMBER_DIALOG_FORMATS,
  PAGE_NUMBER_DIALOG_POSITIONS,
  pageNumberAlignmentMirrors,
  pageNumberChapterExample,
  pageNumberDialogFormatOptions,
  pageNumberFacingAlignments,
  pageNumberPositionBlocker,
  type PageNumberDialogAlignment,
  type PageNumberDialogContext,
  type PageNumberDialogPosition,
  type PageNumberDialogValue,
  type PageNumberFormatDialogValue,
  type PageNumberOptionBlocker,
} from "./pageNumberDialogModel";
import type { PageNumberStoryAlignment } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";

/**
 * Word for Mac's Insert > Page Number > Page Numbers… and Format Page
 * Numbers… dialogs. They collect a choice and hand it to the toolbar, which
 * runs the existing section commands (pageNumberDialogModel.ts maps one to
 * the other). Options MRAI cannot represent (the margin-frame positions)
 * are listed, unavailable, with the reason underneath.
 */

type Translate = ReturnType<typeof useTranslations>;

function blockerText(t: Translate, blocker: PageNumberOptionBlocker): string {
  switch (blocker) {
    case "marginFrame":
      return t("toolbar.pageNumbersDialogBlockedMarginFrame");
  }
}

const POSITION_LABEL_KEYS = {
  top: "toolbar.pageNumbersDialogPosition_top",
  bottom: "toolbar.pageNumbersDialogPosition_bottom",
  pageCenter: "toolbar.pageNumbersDialogPosition_pageCenter",
  verticalInside: "toolbar.pageNumbersDialogPosition_verticalInside",
  verticalOutside: "toolbar.pageNumbersDialogPosition_verticalOutside",
} as const satisfies Record<PageNumberDialogPosition, string>;

const ALIGNMENT_LABEL_KEYS = {
  left: "toolbar.pageNumbersDialogAlignment_left",
  center: "toolbar.pageNumbersDialogAlignment_center",
  right: "toolbar.pageNumbersDialogAlignment_right",
  inside: "toolbar.pageNumbersDialogAlignment_inside",
  outside: "toolbar.pageNumbersDialogAlignment_outside",
} as const satisfies Record<PageNumberDialogAlignment, string>;

/** A page of text lines with the number where it will print, as Word's
 * preview draws it; Inside / Outside show a facing pair. */
function PageNumberPreview({
  position,
  alignment,
}: {
  readonly position: PageNumberDialogPosition;
  readonly alignment: PageNumberDialogAlignment;
}) {
  const facing = alignment === "inside" || alignment === "outside";
  const { odd, even } = pageNumberFacingAlignments(alignment);
  const pages: ReadonlyArray<{
    readonly key: "even" | "odd" | "single";
    readonly align: PageNumberStoryAlignment;
  }> = facing
    ? [
        { key: "even", align: even },
        { key: "odd", align: odd },
      ]
    : [{ key: "single", align: odd }];
  const width = 54;
  const height = 70;
  const margin = 8;
  const mark = 5;
  return (
    <div
      className={`${parts.well} ${styles.previewWell}`}
      data-testid="document-page-numbers-preview"
      data-position={position}
      data-alignment={alignment}
      aria-hidden
    >
      {pages.map((page) => {
        const x =
          page.align === "left"
            ? margin
            : page.align === "center"
              ? (width - mark) / 2
              : width - margin - mark;
        const y = position === "top" ? 3 : height - 3 - mark;
        return (
          <svg key={page.key} viewBox={`-1 -1 ${width + 2} ${height + 2}`}>
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="#ffffff"
              stroke="#9ca3af"
            />
            {Array.from({ length: 9 }, (_, line) => (
              <rect
                key={line}
                x={margin}
                y={12 + line * 5.2}
                width={line === 8 ? (width - 2 * margin) * 0.6 : width - 2 * margin}
                height={2}
                fill="#d1d5db"
              />
            ))}
            {position === "top" || position === "bottom" ? (
              <rect
                data-testid={`document-page-numbers-preview-mark-${page.key}`}
                data-align={page.align}
                x={x}
                y={y}
                width={mark}
                height={mark}
                style={{ fill: "var(--office-dialog-accent, #2563eb)" }}
              />
            ) : null}
          </svg>
        );
      })}
    </div>
  );
}

export interface DocumentPageNumbersDialogProps {
  readonly canEdit: boolean;
  readonly context: PageNumberDialogContext;
  readonly initial: PageNumberDialogValue;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  /** Place the numbers; false when the document refused the write. */
  readonly onSubmit: (value: PageNumberDialogValue) => boolean;
  readonly onOpenFormat: (trigger: HTMLElement | null) => void;
  readonly onClose: () => void;
}

export function DocumentPageNumbersDialog({
  canEdit,
  context,
  initial,
  returnFocusRef,
  onSubmit,
  onOpenFormat,
  onClose,
}: DocumentPageNumbersDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const positionRef = useRef<HTMLSelectElement | null>(null);
  const formatButtonRef = useRef<HTMLButtonElement | null>(null);
  const [value, setValue] = useState<PageNumberDialogValue>(initial);
  const [failed, setFailed] = useState(false);
  const positionBlocked = pageNumberPositionBlocker(value.position);
  const blockers = useMemo(() => {
    const found = new Set<PageNumberOptionBlocker>();
    for (const position of PAGE_NUMBER_DIALOG_POSITIONS) {
      const blocker = pageNumberPositionBlocker(position);
      if (blocker) found.add(blocker);
    }
    return [...found];
  }, []);

  const update = (patch: Partial<PageNumberDialogValue>) => {
    setValue((current) => ({ ...current, ...patch }));
    setFailed(false);
  };

  return (
    <OfficeDialogShell
      open
      title={t("toolbar.pageNumbersDialogTitle")}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      defaultActionDisabled={!canEdit || positionBlocked !== null}
      onDefaultAction={() => {
        if (!onSubmit(value)) {
          setFailed(true);
          return;
        }
        onClose();
      }}
      onCancel={onClose}
      initialFocusRef={positionRef}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[400px]"
      testIdPrefix="document-page-numbers"
      defaultActionTestId="document-page-numbers-apply"
      footerStart={
        <button
          ref={formatButtonRef}
          type="button"
          className={parts.button}
          data-testid="document-page-numbers-format"
          disabled={!canEdit}
          onClick={() => onOpenFormat(formatButtonRef.current)}
        >
          {t("toolbar.pageNumbersDialogFormat")}
        </button>
      }
    >
      <div className={styles.pageNumbersLayout}>
        <div className={styles.pageNumbersFields}>
          <label className={parts.field}>
            <span className={parts.label}>
              {t("toolbar.pageNumbersDialogPosition")}
            </span>
            <select
              ref={positionRef}
              data-testid="document-page-numbers-position"
              disabled={!canEdit}
              value={value.position}
              onChange={(event) =>
                update({
                  position: event.target.value as PageNumberDialogPosition,
                })
              }
            >
              {PAGE_NUMBER_DIALOG_POSITIONS.map((position) => {
                const blocker = pageNumberPositionBlocker(position);
                return (
                  <option
                    key={position}
                    value={position}
                    disabled={blocker !== null}
                    title={blocker ? blockerText(t, blocker) : undefined}
                  >
                    {t(POSITION_LABEL_KEYS[position])}
                  </option>
                );
              })}
            </select>
          </label>
          <label className={parts.field}>
            <span className={parts.label}>
              {t("toolbar.pageNumbersDialogAlignment")}
            </span>
            <select
              data-testid="document-page-numbers-alignment"
              disabled={!canEdit}
              value={value.alignment}
              onChange={(event) =>
                update({
                  alignment: event.target.value as PageNumberDialogAlignment,
                })
              }
            >
              {PAGE_NUMBER_DIALOG_ALIGNMENTS.map((alignment) => (
                <option key={alignment} value={alignment}>
                  {t(ALIGNMENT_LABEL_KEYS[alignment])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PageNumberPreview
          position={value.position}
          alignment={value.alignment}
        />
      </div>
      <label className={parts.check}>
        <input
          type="checkbox"
          data-testid="document-page-numbers-show-first"
          disabled={!canEdit}
          checked={value.showOnFirstPage}
          onChange={(event) => update({ showOnFirstPage: event.target.checked })}
        />
        <span>{t("toolbar.pageNumbersDialogShowFirst")}</span>
      </label>
      <label className={parts.check}>
        <input
          type="checkbox"
          data-testid="document-toolbar-page-number-include-count"
          disabled={!canEdit}
          checked={value.includePageCount}
          onChange={(event) =>
            update({ includePageCount: event.target.checked })
          }
        />
        <span>{t("toolbar.pageNumberIncludeCount")}</span>
      </label>
      {pageNumberAlignmentMirrors(value.alignment) &&
      !context.differentOddEven ? (
        <p
          className={parts.hint}
          data-testid="document-page-numbers-turns-on-odd-even"
        >
          {t("toolbar.pageNumbersDialogMirrorTurnsOnOddEven")}
        </p>
      ) : null}
      {blockers.length > 0 ? (
        <p className={parts.hint} data-testid="document-page-numbers-unavailable">
          {blockers.map((blocker) => blockerText(t, blocker)).join(" ")}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className={parts.error}>
          {t("toolbar.pageNumbersDialogFailed")}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}

const FORMAT_LABEL_KEYS = {
  decimal: "toolbar.pageNumberFormatDecimal",
  numberInDash: "toolbar.pageNumberFormatNumberInDash",
  decimalFullWidth: "toolbar.pageNumberFormatDecimalFullWidth",
  lowerLetter: "toolbar.pageNumberFormatLowerLetter",
  upperLetter: "toolbar.pageNumberFormatUpperLetter",
  lowerRoman: "toolbar.pageNumberFormatLowerRoman",
  upperRoman: "toolbar.pageNumberFormatUpperRoman",
  ideographLegalTraditional: "toolbar.pageNumberFormatIdeographLegalTraditional",
  taiwaneseCountingThousand: "toolbar.pageNumberFormatTaiwaneseCountingThousand",
  chineseCountingThousand: "toolbar.pageNumberFormatChineseCountingThousand",
  chineseLegalSimplified: "toolbar.pageNumberFormatChineseLegalSimplified",
  ideographTraditional: "toolbar.pageNumberFormatIdeographTraditional",
  ideographZodiac: "toolbar.pageNumberFormatIdeographZodiac",
} as const satisfies Record<
  (typeof PAGE_NUMBER_DIALOG_FORMATS)[number]["id"],
  string
>;

const SEPARATOR_LABEL_KEYS = {
  hyphen: "toolbar.pageNumberFormatDialogSeparator_hyphen",
  period: "toolbar.pageNumberFormatDialogSeparator_period",
  colon: "toolbar.pageNumberFormatDialogSeparator_colon",
  emDash: "toolbar.pageNumberFormatDialogSeparator_emDash",
  enDash: "toolbar.pageNumberFormatDialogSeparator_enDash",
} as const satisfies Record<PageNumberChapterSeparator, string>;

export interface DocumentPageNumberFormatDialogProps {
  readonly canEdit: boolean;
  readonly initial: PageNumberFormatDialogValue;
  /** Heading levels whose headings carry a number (a chapter number to show). */
  readonly numberedHeadingLevels: ReadonlySet<number>;
  /** False on a page without section layouts: one document-wide format and
   * start, so no chapter number and no Continue from previous section. */
  readonly sectionOptionsSupported?: boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  /** Apply to the section; false when the document refused the write. */
  readonly onSubmit: (value: PageNumberFormatDialogValue) => boolean;
  readonly onClose: () => void;
}

export function DocumentPageNumberFormatDialog({
  canEdit,
  initial,
  numberedHeadingLevels,
  sectionOptionsSupported = true,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentPageNumberFormatDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const formatRef = useRef<HTMLSelectElement | null>(null);
  const [value, setValue] = useState<PageNumberFormatDialogValue>(initial);
  // Word's list, plus the section's own style when it is not one of them.
  const formatOptions = useMemo(
    () => pageNumberDialogFormatOptions(initial.format),
    [initial.format],
  );
  const [startDraft, setStartDraft] = useState(String(initial.startAt));
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<PageNumberFormatDialogValue>) => {
    setValue((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const parsedStart = Number(startDraft.trim());
  const startValid =
    Number.isInteger(parsedStart) &&
    // Word's Start at accepts 0 (a title page numbered 0).
    parsedStart >= 0 &&
    parsedStart <= MAX_PAGE_NUMBER_DIALOG_START;
  const stepStart = (delta: number) => {
    const base = startValid ? parsedStart : value.startAt;
    const next = Math.min(MAX_PAGE_NUMBER_DIALOG_START, Math.max(0, base + delta));
    setStartDraft(String(next));
    update({ startAt: next, continuePrevious: false });
  };
  const chapterFieldsDisabled =
    !canEdit || !sectionOptionsSupported || !value.includeChapter;
  const startFieldsDisabled = !canEdit || value.continuePrevious;

  return (
    <OfficeDialogShell
      open
      title={t("toolbar.pageNumberFormatDialogTitle")}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      defaultActionDisabled={!canEdit}
      onDefaultAction={() => {
        if (!value.continuePrevious && !startValid) {
          setError(
            t("toolbar.pageNumberFormatDialogInvalidStart", {
              min: 0,
              max: MAX_PAGE_NUMBER_DIALOG_START,
            }),
          );
          return;
        }
        const next = value.continuePrevious
          ? value
          : { ...value, startAt: parsedStart };
        if (!onSubmit(next)) {
          setError(t("toolbar.pageNumberFormatDialogFailed"));
          return;
        }
        onClose();
      }}
      onCancel={onClose}
      initialFocusRef={formatRef}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[400px]"
      testIdPrefix="document-page-number-format"
      defaultActionTestId="document-page-number-format-apply"
    >
      <label className={parts.field}>
        <span className={parts.label}>
          {t("toolbar.pageNumberFormatDialogNumberFormat")}
        </span>
        <select
          ref={formatRef}
          data-testid="document-page-number-format-number-format"
          disabled={!canEdit}
          value={value.format}
          onChange={(event) =>
            update({ format: event.target.value as PageNumberFormat })
          }
        >
          {formatOptions.map((entry) => (
            <option key={entry.format} value={entry.format}>
              {entry.kind === "dialog"
                ? t(FORMAT_LABEL_KEYS[entry.id])
                : t("toolbar.pageNumberFormatDialogDocumentFormat", {
                    sample: entry.sample,
                  })}
            </option>
          ))}
        </select>
      </label>
      <label className={parts.check}>
        <input
          type="checkbox"
          data-testid="document-page-number-format-include-chapter"
          disabled={!canEdit || !sectionOptionsSupported}
          checked={value.includeChapter}
          onChange={(event) => update({ includeChapter: event.target.checked })}
        />
        <span>{t("toolbar.pageNumberFormatDialogIncludeChapter")}</span>
      </label>
      <div className={styles.pageNumberChapterFields}>
        <label className={parts.row}>
          <span className={parts.label}>
            {t("toolbar.pageNumberFormatDialogChapterStyle")}
          </span>
          <select
            data-testid="document-page-number-format-chapter-style"
            disabled={chapterFieldsDisabled}
            value={value.chapterStyle}
            onChange={(event) =>
              update({ chapterStyle: Number(event.target.value) })
            }
          >
            {Array.from({ length: MAX_PAGE_NUMBER_CHAPTER_STYLE }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {t("toolbar.pageNumberFormatDialogHeading", { level: index + 1 })}
              </option>
            ))}
          </select>
        </label>
        <label className={parts.row}>
          <span className={parts.label}>
            {t("toolbar.pageNumberFormatDialogSeparator")}
          </span>
          <select
            data-testid="document-page-number-format-chapter-separator"
            disabled={chapterFieldsDisabled}
            value={value.chapterSeparator}
            onChange={(event) =>
              update({
                chapterSeparator: event.target.value as PageNumberChapterSeparator,
              })
            }
          >
            {PAGE_NUMBER_CHAPTER_SEPARATORS.map((separator) => (
              <option key={separator} value={separator}>
                {t(SEPARATOR_LABEL_KEYS[separator])}
              </option>
            ))}
          </select>
        </label>
        <span
          className={parts.hint}
          data-testid="document-page-number-format-example"
        >
          {t("toolbar.pageNumberFormatDialogExamples", {
            example: pageNumberChapterExample(value.chapterSeparator),
          })}
        </span>
        {value.includeChapter && !numberedHeadingLevels.has(value.chapterStyle) ? (
          <span
            className={parts.hint}
            data-testid="document-page-number-format-chapter-unnumbered"
          >
            {t("toolbar.pageNumberFormatDialogChapterUnnumbered")}
          </span>
        ) : null}
      </div>
      <fieldset className={parts.group} disabled={!canEdit}>
        <legend className={parts.sectionTitle}>
          {t("toolbar.pageNumberFormatDialogNumbering")}
        </legend>
        <label className={parts.check}>
          <input
            type="radio"
            name="document-page-number-format-numbering"
            data-testid="document-page-number-format-continue"
            disabled={!sectionOptionsSupported}
            checked={value.continuePrevious}
            onChange={() => update({ continuePrevious: true })}
          />
          <DocumentDialogIcon icon="list.numbered" />
          <span>{t("toolbar.pageNumberFormatDialogContinue")}</span>
        </label>
        <div className={styles.valueRow}>
          <label className={parts.check}>
            <input
              type="radio"
              name="document-page-number-format-numbering"
              data-testid="document-page-number-format-start-at"
              checked={!value.continuePrevious}
              onChange={() => update({ continuePrevious: false })}
            />
            <DocumentDialogIcon icon="symbol.hash" />
            <span>{t("toolbar.pageNumberFormatDialogStartAt")}</span>
          </label>
          <span className={`${parts.stepper} ${styles.pageNumberStartStepper}`}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_PAGE_NUMBER_DIALOG_START}
              step={1}
              aria-label={t("toolbar.pageNumberFormatDialogStartAt")}
              data-testid="document-page-number-format-start"
              disabled={startFieldsDisabled}
              aria-invalid={error && !startValid ? "true" : undefined}
              value={startDraft}
              onChange={(event) => {
                setStartDraft(event.target.value);
                setError(null);
              }}
            />
            <button
              type="button"
              className={parts.stepperButton}
              aria-label={t("toolbar.pageNumberFormatDialogStartDecrease")}
              title={t("toolbar.pageNumberFormatDialogStartDecrease")}
              data-testid="document-page-number-format-start-down"
              disabled={startFieldsDisabled || (startValid && parsedStart <= 0)}
              onClick={() => stepStart(-1)}
            >
              <Minus size={12} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={parts.stepperButton}
              aria-label={t("toolbar.pageNumberFormatDialogStartIncrease")}
              title={t("toolbar.pageNumberFormatDialogStartIncrease")}
              data-testid="document-page-number-format-start-up"
              disabled={
                startFieldsDisabled ||
                (startValid && parsedStart >= MAX_PAGE_NUMBER_DIALOG_START)
              }
              onClick={() => stepStart(1)}
            >
              <Plus size={12} aria-hidden="true" />
            </button>
          </span>
        </div>
      </fieldset>
      {error ? (
        <p
          role="alert"
          className={parts.error}
          data-testid="document-page-number-format-error"
        >
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
