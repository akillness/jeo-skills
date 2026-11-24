"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "../../../../host/next-intl";

import {
  documentLengthUnit,
  formatDocumentLengthTwips,
  parseDocumentLengthTwips,
  type DocumentLengthUnit,
} from "../../../lib/document-length-fields";

import { OfficeDialogShell } from "../../office-ribbon/OfficeDialogShell";
import { DOCS_COLUMNS_PRESET_ICON_NAMES, DocsLayoutIcon } from "./DocumentLayoutRibbonIcons";

import { documentValueInputClassName } from "./documentValueInput";

import styles from "./native-document/DocumentLayoutDialogs.module.css";
import {
  defaultSectionApplyTo,
  sectionApplyToOptions,
  type SectionApplyTo,
} from "./native-document/sectionApplyTo";
import {
  columnsPresetOfSection,
  MAX_SECTION_COLUMNS,
  normalizeSectionLayouts,
  unequalTwoColumnPreset,
  type SectionLayout,
  type SectionLayoutColumn,
  type SectionLayoutPatch,
} from "./native-document/sectionLayouts";

const MIN_COLUMN_WIDTH_TWIPS = 57; // About one millimetre.

// Widths and spacing in Word's measurement unit for the locale (centimetres in
// Chinese Word, inches in US English), as every Docs length field; they were
// in millimetres, a unit no Word Columns dialog shows. A typed value may name
// its own unit ("12 mm", "0.5\"").
/** Reads one typed width or spacing as twips, or null below `minimum`. */
export type ColumnLengthReader = (value: string, minimum: number) => number | null;

function lengthToTwips(value: string, minimum: number, unit: DocumentLengthUnit): number | null {
  const twips = parseDocumentLengthTwips(value, unit);
  return twips !== null && twips >= minimum ? twips : null;
}

const readCentimetres: ColumnLengthReader = (value, minimum) =>
  lengthToTwips(value, minimum, "cm");

/**
 * The dialog's lengths in `unit`, each value it shows remembered with the
 * exact twips behind it: two decimals of a centimetre or an inch are not
 * exact (0.01" is 14 twips), and a width left as shown must not move.
 */
function columnLengths(unit: DocumentLengthUnit): {
  show: (twips: number) => string;
  read: ColumnLengthReader;
} {
  const shown = new Map<string, number>();
  return {
    show: (twips) => {
      const text = formatDocumentLengthTwips(twips, unit);
      shown.set(text, twips);
      return text;
    },
    read: (value, minimum) => {
      const exact = shown.get(value.trim());
      if (exact !== undefined) return exact >= minimum ? exact : null;
      return lengthToTwips(value, minimum, unit);
    },
  };
}

export function sectionContentWidthTwips(layout: SectionLayout): number {
  return Math.max(
    0,
    layout.pageSize.widthTwips -
      layout.pageMargins.leftTwips -
      layout.pageMargins.rightTwips -
      layout.pageMargins.gutterTwips,
  );
}

function initialColumnItems(layout: SectionLayout): SectionLayoutColumn[] {
  const { columns } = layout;
  if (
    !columns.equalWidth &&
    columns.items &&
    columns.items.length === columns.count
  ) {
    return columns.items.map((item) => ({ ...item }));
  }

  const available = sectionContentWidthTwips(layout);
  const totalGaps = columns.spaceTwips * Math.max(0, columns.count - 1);
  const usable = Math.max(columns.count, available - totalGaps);
  const width = Math.max(1, Math.floor(usable / columns.count));
  const items = Array.from({ length: columns.count }, (_, index) => ({
    widthTwips:
      index === columns.count - 1
        ? Math.max(1, available - totalGaps - width * (columns.count - 1))
        : width,
    ...(index === columns.count - 1 ? {} : { spaceTwips: columns.spaceTwips }),
  }));
  return items;
}

export function buildUnequalColumnsPatch(
  layout: SectionLayout,
  widthDraftsMm: readonly string[],
  gapDraftsMm: readonly string[],
  separator: boolean,
  readLength: ColumnLengthReader = readCentimetres,
): SectionLayoutPatch | null {
  const count = layout.columns.count;
  if (
    count < 2 ||
    widthDraftsMm.length !== count - 1 ||
    gapDraftsMm.length !== count - 1
  ) {
    return null;
  }

  const widths = widthDraftsMm.map((value) =>
    readLength(value, MIN_COLUMN_WIDTH_TWIPS),
  );
  const gaps = gapDraftsMm.map((value) => readLength(value, 0));
  if (
    widths.some((value) => value === null) ||
    gaps.some((value) => value === null)
  ) {
    return null;
  }

  const explicitWidths = widths as number[];
  const explicitGaps = gaps as number[];
  const available = sectionContentWidthTwips(layout);
  const consumed =
    explicitWidths.reduce((sum, value) => sum + value, 0) +
    explicitGaps.reduce((sum, value) => sum + value, 0);
  const finalWidth = available - consumed;
  if (finalWidth < MIN_COLUMN_WIDTH_TWIPS) return null;

  const items: SectionLayoutColumn[] = [
    ...explicitWidths.map((widthTwips, index) => ({
      widthTwips,
      spaceTwips: explicitGaps[index],
    })),
    { widthTwips: finalWidth },
  ];
  const columns = {
    count,
    separator,
    equalWidth: false,
    spaceTwips: explicitGaps[0] ?? layout.columns.spaceTwips,
    items,
  } satisfies SectionLayout["columns"];
  const normalized = normalizeSectionLayouts([{ ...layout, columns }]);
  return normalized ? { columns } : null;
}

export interface ColumnsDialogApplyOptions {
  readonly applyTo: SectionApplyTo;
  /** Word's "Start new column": the new section starts in the next column. */
  readonly startNewColumn: boolean;
}

export interface UnequalColumnsDialogProps {
  layout: SectionLayout;
  canEdit?: boolean;
  /** Sections in the document; Word offers "This section" only past one. */
  sectionCount?: number;
  /** This point forward inserts a break, so it needs a collapsed caret. */
  pointForwardAvailable?: boolean;
  onApply: (patch: SectionLayoutPatch, options: ColumnsDialogApplyOptions) => boolean;
  onClose: () => void;
  /** Where the keyboard goes when the dialog closes (the page, in Word). */
  returnFocusTarget?: () => HTMLElement | null;
}

type ColumnsPreset = "one" | "two" | "three" | "left" | "right";

/**
 * Build the complete `columns` patch for Word's Columns dialog state. Equal
 * widths are written as `count` + `space` with no `<w:col>` list (Word's
 * `w:equalWidth="1"`); unequal widths go through
 * {@link buildUnequalColumnsPatch}, whose last column fills the remainder.
 */
export function buildColumnsDialogPatch(
  layout: SectionLayout,
  count: number,
  equalWidth: boolean,
  widthDraftsMm: readonly string[],
  gapDraftsMm: readonly string[],
  separator: boolean,
  readLength: ColumnLengthReader = readCentimetres,
): SectionLayoutPatch | null {
  if (!Number.isInteger(count) || count < 1 || count > MAX_SECTION_COLUMNS) {
    return null;
  }
  if (count === 1) {
    return {
      columns: {
        count: 1,
        separator: false,
        equalWidth: true,
        spaceTwips: layout.columns.spaceTwips,
        items: null,
      },
    };
  }
  if (!equalWidth) {
    return buildUnequalColumnsPatch(
      { ...layout, columns: { ...layout.columns, count } },
      widthDraftsMm.slice(0, count - 1),
      gapDraftsMm.slice(0, count - 1),
      separator,
      readLength,
    );
  }
  const gap = readLength(gapDraftsMm[0] ?? "", 0);
  if (gap === null) return null;
  const width = Math.floor(
    (sectionContentWidthTwips(layout) - gap * (count - 1)) / count,
  );
  if (width < MIN_COLUMN_WIDTH_TWIPS) return null;
  // The width the dialog shows must be the one written: a width typed that
  // leaves no room for the spacing (the spacing stayed as it was) is not
  // quietly swapped for the width the spacing allows. One twip covers the
  // round trip of a width the dialog computed itself (the reader knows the
  // exact twips behind every value the dialog showed).
  const shownWidth = readLength(widthDraftsMm[0] ?? "", 0);
  if (shownWidth === null || Math.abs(shownWidth - width) > 1) return null;
  const columns = {
    count,
    separator,
    equalWidth: true,
    spaceTwips: gap,
  } satisfies SectionLayout["columns"];
  const normalized = normalizeSectionLayouts([{ ...layout, columns }]);
  return normalized ? { columns: { ...columns, items: null } } : null;
}

function equalDrafts(
  layout: SectionLayout,
  count: number,
  gapTwips: number,
  show: (twips: number) => string,
): { widths: string[]; gaps: string[] } {
  const available = sectionContentWidthTwips(layout);
  const width = Math.max(
    1,
    Math.floor((available - gapTwips * (count - 1)) / Math.max(1, count)),
  );
  return {
    widths: Array.from({ length: count }, () => show(width)),
    gaps: Array.from({ length: Math.max(0, count - 1) }, () => show(gapTwips)),
  };
}

/**
 * Word's Columns dialog (Layout > Columns > More Columns…; "Create newsletter
 * columns", "Add columns to a document", Microsoft Support; ECMA-376 17.6.4
 * cols / 17.6.3 col):
 * - Presets One, Two, Three, Left, Right; Number of columns.
 * - Width and spacing, one row per column. With "Equal column width" checked
 *   only the first row can be edited and every column follows it (`w:cols
 *   w:equalWidth="1" w:space`); unchecked, each column's width and the
 *   spacing after it are its own (`w:col w:w w:space`), and the last column
 *   takes what is left of the text width.
 * - Line between (`w:sep`), available with two or more columns.
 * - Apply to: This section / This point forward / Whole document. This point
 *   forward inserts a Continuous section break, or a New Column one when
 *   "Start new column" is checked (only then can it be checked).
 */
export default function UnequalColumnsDialog({
  layout,
  canEdit = true,
  sectionCount = 1,
  pointForwardAvailable = true,
  onApply,
  onClose,
  returnFocusTarget,
}: UnequalColumnsDialogProps) {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const lengthUnit = documentLengthUnit(locale);
  const unitLabel =
    lengthUnit === "cm" ? t("toolbar.indentUnitCm") : t("toolbar.pageSetupUnitInches");
  const [{ show, read }] = useState(() => columnLengths(lengthUnit));
  const firstWidthRef = useRef<HTMLInputElement | null>(null);
  const initialItems = useMemo(() => initialColumnItems(layout), [layout]);
  const [countDraft, setCountDraft] = useState(String(layout.columns.count));
  const [equalWidth, setEqualWidth] = useState(layout.columns.equalWidth);
  const [widthDrafts, setWidthDrafts] = useState(() =>
    initialItems.map((item) => show(item.widthTwips)),
  );
  const [gapDrafts, setGapDrafts] = useState(() =>
    initialItems
      .slice(0, -1)
      .map((item) =>
        show(item.spaceTwips ?? layout.columns.spaceTwips),
      ),
  );
  const [separator, setSeparator] = useState(layout.columns.separator);
  const applyToOptions = sectionApplyToOptions(sectionCount);
  const [applyTo, setApplyTo] = useState<SectionApplyTo>(() =>
    defaultSectionApplyTo(sectionCount),
  );
  const [startNewColumn, setStartNewColumn] = useState(false);

  const count = /^\d+$/.test(countDraft.trim()) ? Number(countDraft) : NaN;
  const patch = useMemo(
    () =>
      buildColumnsDialogPatch(
        layout,
        count,
        equalWidth,
        widthDrafts,
        gapDrafts,
        separator,
        read,
      ),
    [count, equalWidth, gapDrafts, layout, read, separator, widthDrafts],
  );
  const patchItems = patch?.columns?.items ?? null;
  const rows = Number.isInteger(count) && count >= 1 ? Math.min(count, MAX_SECTION_COLUMNS) : 0;

  const resetRows = (nextCount: number, gapTwips: number) => {
    const drafts = equalDrafts(layout, nextCount, gapTwips, show);
    setWidthDrafts(drafts.widths);
    setGapDrafts(drafts.gaps);
  };

  // The spacing last shown, kept while one column has no spacing row, so
  // going back to several columns restores it.
  const lastGapTwipsRef = useRef<number | null>(null);
  // Zero is a spacing (columns that touch), not a missing one: only a
  // spacing that does not read at all falls back, to the one last shown,
  // then the section's own.
  const currentGapTwips = () => {
    const shown =
      gapDrafts[0] === undefined ? null : read(gapDrafts[0], 0);
    if (shown !== null) lastGapTwipsRef.current = shown;
    return shown ?? lastGapTwipsRef.current ?? layout.columns.spaceTwips;
  };

  const changeCount = (value: string) => {
    setCountDraft(value);
    const next = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
    if (Number.isInteger(next) && next >= 1 && next <= MAX_SECTION_COLUMNS) {
      resetRows(next, currentGapTwips());
      if (next === 1) setSeparator(false);
    }
  };

  const choosePreset = (preset: ColumnsPreset) => {
    const gapTwips = currentGapTwips();
    if (preset === "left" || preset === "right") {
      const items = unequalTwoColumnPreset(
        sectionContentWidthTwips(layout),
        gapTwips,
        preset,
      );
      if (!items) return;
      setCountDraft("2");
      setEqualWidth(false);
      setWidthDrafts(items.map((item) => show(item.widthTwips)));
      setGapDrafts([show(items[0].spaceTwips ?? gapTwips)]);
      return;
    }
    const nextCount = preset === "one" ? 1 : preset === "two" ? 2 : 3;
    setCountDraft(String(nextCount));
    setEqualWidth(true);
    resetRows(nextCount, gapTwips);
    if (nextCount === 1) setSeparator(false);
  };

  const activePreset: ColumnsPreset | null = (() => {
    if (!patch?.columns) return null;
    const next = patch.columns;
    if (next.equalWidth) {
      return next.count === 1 ? "one" : next.count === 2 ? "two" : next.count === 3 ? "three" : null;
    }
    const preset = columnsPresetOfSection({
      columns: {
        count: next.count ?? 0,
        separator: false,
        equalWidth: false,
        spaceTwips: next.spaceTwips ?? 0,
        items: next.items ?? undefined,
      },
    });
    return preset;
  })();

  const updateWidth = (index: number, value: string) => {
    if (equalWidth) {
      // Word: in equal mode the width and the spacing trade off against the
      // fixed text width, and every column follows the first.
      const width = read(value, 0);
      setWidthDrafts((current) => current.map(() => value));
      if (width !== null && rows > 1) {
        const gap = Math.floor(
          (sectionContentWidthTwips(layout) - width * rows) / (rows - 1),
        );
        if (gap >= 0) {
          setGapDrafts((current) => current.map(() => show(gap)));
        }
      }
      return;
    }
    setWidthDrafts((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    );
  };

  const updateGap = (index: number, value: string) => {
    if (equalWidth) {
      setGapDrafts((current) => current.map(() => value));
      const gap = read(value, 0);
      if (gap !== null && rows > 1) {
        const width = Math.floor(
          (sectionContentWidthTwips(layout) - gap * (rows - 1)) / rows,
        );
        if (width > 0) {
          setWidthDrafts((current) => current.map(() => show(width)));
        }
      }
      return;
    }
    setGapDrafts((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    );
  };

  const shownWidth = (index: number): string => {
    if (rows === 1) return show(sectionContentWidthTwips(layout));
    if (!equalWidth && index === rows - 1) {
      const finalWidth = patchItems?.at(-1)?.widthTwips;
      return finalWidth === undefined ? "" : show(finalWidth);
    }
    return widthDrafts[equalWidth ? 0 : index] ?? "";
  };

  const presets: readonly ColumnsPreset[] = ["one", "two", "three", "left", "right"];

  return (
    <OfficeDialogShell
      open
      testIdPrefix="document-unequal-columns"
      title={t("toolbar.columnsDialogTitle")}
      description={t("toolbar.columnsUnequalDescription")}
      defaultActionLabel={t("toolbar.dialogOk")}
      defaultActionTestId="document-unequal-columns-apply"
      defaultActionDisabled={!canEdit || !patch}
      cancelActionLabel={t("toolbar.pageSetupCancel")}
      onDefaultAction={() => {
        if (
          canEdit &&
          patch &&
          onApply(patch, {
            applyTo,
            startNewColumn: applyTo === "thisPointForward" && startNewColumn,
          })
        ) {
          onClose();
        }
      }}
      onCancel={onClose}
      initialFocusRef={firstWidthRef}
      returnFocusTarget={returnFocusTarget}
      className="sm:max-w-[540px]"
    >
      <section className="office-dialog__group">
        <h3 className="office-dialog__section-title">{t("toolbar.columnsPresets")}</h3>
        <div className={styles.presets} role="group" aria-label={t("toolbar.columnsPresets")}>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={styles.preset}
              aria-pressed={activePreset === preset}
              disabled={!canEdit}
              data-testid={`document-columns-preset-${preset}`}
              onClick={() => choosePreset(preset)}
            >
              <ColumnsPresetGlyph preset={preset} />
              {t(`toolbar.columnsPreset_${preset}` as "toolbar.columnsPreset_one")}
            </button>
          ))}
        </div>
      </section>
      <div className={styles.twoColumns}>
        <label className="office-dialog__field">
          <span className="office-dialog__label">{t("toolbar.columnsNumber")}</span>
          <input
            type="number"
            min={1}
            max={MAX_SECTION_COLUMNS}
            className={documentValueInputClassName("note-editor-office-toolbar__input")}
            data-testid="document-columns-number"
            value={countDraft}
            disabled={!canEdit}
            onChange={(event) => changeCount(event.currentTarget.value)}
          />
        </label>
        <div className="office-dialog__field">
          <label className="office-dialog__check">
            <input
              type="checkbox"
              checked={separator}
              data-testid="document-unequal-columns-line-between"
              disabled={!canEdit || rows < 2}
              onChange={(event) => setSeparator(event.currentTarget.checked)}
            />
            {t("toolbar.columnsLineBetween")}
          </label>
        </div>
      </div>
      <p
        className="office-dialog__hint"
        data-testid="document-unequal-columns-available-width"
      >
        {t("toolbar.columnsAvailableWidth", {
          width: show(sectionContentWidthTwips(layout)),
          unit: unitLabel,
        })}
      </p>
      <section className="office-dialog__group">
        <h3 className="office-dialog__section-title">{t("toolbar.columnsWidthAndSpacing")}</h3>
        <div className={styles.columnTable} role="group">
          <span aria-hidden>{t("toolbar.columnsColumnHeader")}</span>
          <span className="office-dialog__label" aria-hidden>
            {t("toolbar.columnWidthMm", { unit: unitLabel })}
          </span>
          <span className="office-dialog__label" aria-hidden>
            {t("toolbar.columnSpacingMm", { unit: unitLabel })}
          </span>
          {Array.from({ length: rows }, (_, index) => {
            const followsFirst = equalWidth && index > 0;
            const lastUnequal = !equalWidth && index === rows - 1;
            return (
              <Fragment key={index}>
                <strong>{t("toolbar.columnNumber", { number: index + 1 })}</strong>
                <input
                  ref={index === 0 ? firstWidthRef : undefined}
                  // Text, as Word's boxes: a value may carry its unit ("5 cm").
                  type="text"
                  inputMode="decimal"
                  className={documentValueInputClassName(
                    "note-editor-office-toolbar__input",
                  )}
                  data-testid={`document-unequal-column-width-${index}`}
                  aria-label={`${t("toolbar.columnNumber", { number: index + 1 })} ${t("toolbar.columnWidthMm", { unit: unitLabel })}`}
                  value={shownWidth(index)}
                  readOnly={lastUnequal || rows === 1}
                  disabled={!canEdit || followsFirst}
                  onChange={(event) => updateWidth(index, event.currentTarget.value)}
                />
                {index < rows - 1 ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    className={documentValueInputClassName(
                      "note-editor-office-toolbar__input",
                    )}
                    data-testid={`document-unequal-column-gap-${index}`}
                    aria-label={`${t("toolbar.columnNumber", { number: index + 1 })} ${t("toolbar.columnSpacingMm", { unit: unitLabel })}`}
                    value={gapDrafts[equalWidth ? 0 : index] ?? ""}
                    disabled={!canEdit || followsFirst}
                    onChange={(event) => updateGap(index, event.currentTarget.value)}
                  />
                ) : (
                  <span />
                )}
              </Fragment>
            );
          })}
        </div>
        <label className="office-dialog__check">
          <input
            type="checkbox"
            checked={equalWidth || rows < 2}
            data-testid="document-columns-equal-width"
            disabled={!canEdit || rows < 2}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              setEqualWidth(next);
              if (next && rows > 1) resetRows(rows, currentGapTwips());
            }}
          />
          {t("toolbar.columnsEqualWidth")}
        </label>
      </section>
      <div className={styles.twoColumns}>
        <label className="office-dialog__field">
          <span className="office-dialog__label">{t("toolbar.pageSetupApplyTo")}</span>
          <select
            data-testid="document-columns-apply-to"
            value={applyTo}
            disabled={!canEdit}
            onChange={(event) => {
              const next = event.currentTarget.value as SectionApplyTo;
              setApplyTo(next);
              if (next !== "thisPointForward") setStartNewColumn(false);
            }}
          >
            {applyToOptions.map((option) => (
              <option
                key={option}
                value={option}
                disabled={option === "thisPointForward" && !pointForwardAvailable}
              >
                {t(`toolbar.sectionApplyTo_${option}` as "toolbar.sectionApplyTo_wholeDocument")}
              </option>
            ))}
          </select>
        </label>
        <div className="office-dialog__field">
          <label className="office-dialog__check">
            <input
              type="checkbox"
              checked={startNewColumn}
              data-testid="document-columns-start-new-column"
              disabled={!canEdit || applyTo !== "thisPointForward"}
              onChange={(event) => setStartNewColumn(event.currentTarget.checked)}
            />
            {t("toolbar.columnsStartNewColumn")}
          </label>
        </div>
      </div>
      {!patch ? (
        <p className="office-dialog__message" role="alert">
          {t("toolbar.columnsUnequalInvalid")}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}

/** The Columns ribbon gallery's own preview (Layout ▸ Columns): the same
 * two-tone sheet ruled into columns, the narrow side of Left / Right in the
 * accent, so a choice reads the same in the menu and in this dialog. */
const COLUMNS_PRESET_ICON: Record<ColumnsPreset, "1" | "2" | "3" | "left" | "right"> = {
  one: "1",
  two: "2",
  three: "3",
  left: "left",
  right: "right",
};
function ColumnsPresetGlyph({ preset }: { preset: ColumnsPreset }) {
  return <DocsLayoutIcon name={DOCS_COLUMNS_PRESET_ICON_NAMES[COLUMNS_PRESET_ICON[preset]]} size={32} />;
}
