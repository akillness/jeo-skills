"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Table of Contents surfaces, as Word for Mac 16 shows them:
 *
 * - the References > Table of Contents gallery (Automatic / Manual blocks,
 *   "Custom Table of Contents...", "Remove Table of Contents"), drawn as
 *   thumbnails of the format each block inserts;
 * - the "Table of Contents" dialog: a print preview of the format on the
 *   left, Show page numbers / Right align page numbers / Use hyperlinks
 *   instead of page numbers, Formats, Show levels, Tab leader, and the
 *   Modify... and Options... buttons;
 * - "Table of Contents Options": build the table from Styles (a style /
 *   level grid), Outline levels, and Entry fields, with Reset;
 * - the Styles dialog Modify... opens, listing TOC 1-9 with a preview and
 *   the description of each.
 *
 * Every value here is one of the closed TocSettings (referenceSettings.ts);
 * the caller owns the editor transaction. The gallery blocks and the format
 * previews come from Word's own data (tocWordCatalog.json).
 */

import { useId, useMemo, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "../../../../../host/next-intl";
import { moveListboxSelection } from "../../../../lib/listbox-arrow-keys";
import {
  Check,
  Minus,
  Plus,
} from "../../../office-ribbon/icons/houseIcons";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../../../ui/dropdown-menu";
import { OfficeDialogShell } from "../../../office-ribbon/OfficeDialogShell";
import { officeDialogParts } from "../../../office-ribbon/officeDialogChrome";
import {
  TOC_FORMATS,
  TOC_TAB_LEADERS,
  normalizeTocSettings,
  type TocFormat,
  type TocLevelRange,
  type TocSettings,
  type TocStyleLevel,
  type TocTabLeader,
} from "./referenceSettings";
import {
  TOC_STYLE_IDS,
  tocCatalogLocale,
  tocFormatDefaults,
  tocGalleryAutomaticRows,
  tocGalleryManualRows,
  tocGalleryRowName,
  tocGalleryTitle,
  type TocCatalogLocale,
  type TocGalleryRow,
} from "../../../../lib/document-export/tocWordCatalog";

import styles from "./DocumentTocDialogs.module.css";
import { tocThumbnailLook } from "./referencesButtons";
import {
  DocumentStyleDialog,
  referenceDefinitionFromStyleValue,
  styleValueFromReferenceDefinition,
} from "./DocumentStyleDialog";
import {
  normalizeReferenceStyleDefinition,
  referenceStyleCss,
  type ReferenceStyleDefinition,
  type ReferenceStyleId,
  type ReferenceStyleMap,
} from "./referenceStyles";

/** Word's tab leader glyph rows, in the dialog's order. */
const TAB_LEADER_GLYPHS: Record<TocTabLeader, string> = {
  none: "",
  dot: "......",
  hyphen: "------",
  underscore: "______",
  middleDot: "······",
};

/** Heading styles the options grid always lists (Word: Heading 1-9). */
const HEADING_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Word's own name for a heading style inside a `\t` switch. */
export function tocHeadingStyleName(level: number): string {
  return `Heading ${level}`;
}

function headingStyleLevel(name: string): number | null {
  const match = /^Heading ([1-9])$/.exec(name);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * The options grid's view of the settings: every heading style's TOC level
 * (from `\o` for the contiguous run and `\t` for the rest) and the other
 * mapped styles.
 */
export function tocStyleGrid(settings: TocSettings): {
  headings: (number | null)[];
  others: TocStyleLevel[];
} {
  const [minimum, maximum] = settings.levels.split("-").map((part) => Number.parseInt(part, 10));
  const headings: (number | null)[] = HEADING_ROWS.map((level) =>
    level >= minimum && level <= maximum ? level : null,
  );
  const others: TocStyleLevel[] = [];
  for (const entry of settings.styleLevels) {
    const heading = headingStyleLevel(entry.name);
    if (heading !== null) headings[heading - 1] = entry.level;
    else others.push(entry);
  }
  return { headings, others };
}

/**
 * The inverse: the longest run Heading 1..k mapped to levels 1..k becomes
 * `\o "1-k"` (Word's own spelling), every other heading mapping and every
 * other style go to `\t`.
 */
export function tocSettingsFromStyleGrid(
  settings: TocSettings,
  headings: (number | null)[],
  others: TocStyleLevel[],
): TocSettings {
  // Word writes `\o "2-3"` when the run starts below a cleared Heading 1.
  const first = headings.findIndex((level) => level !== null);
  const start = first > 0 && headings[first] === first + 1 ? first : 0;
  let contiguous = start;
  while (contiguous < 9 && headings[contiguous] === contiguous + 1) contiguous += 1;
  const styleLevels: TocStyleLevel[] = [];
  headings.forEach((level, index) => {
    if (level === null || (index >= start && index < contiguous)) return;
    styleLevels.push({ name: tocHeadingStyleName(index + 1), level });
  });
  const levels = (
    contiguous > start ? `${start + 1}-${contiguous}` : "1-1"
  ) as TocLevelRange;
  return normalizeTocSettings({
    ...settings,
    levels,
    // A table built only from other styles keeps `\o` at one level, the
    // closest Word spelling the closed range allows.
    styleLevels: [...styleLevels, ...others],
  });
}

function useCatalogLocale(): TocCatalogLocale {
  return tocCatalogLocale(useLocale());
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

function GalleryThumbnail({
  row,
  manual,
  locale,
}: {
  row: TocGalleryRow;
  manual: boolean;
  locale: TocCatalogLocale;
}) {
  const t = useTranslations("console-notebooks");
  const title = tocGalleryTitle(locale);
  const lines = manual
    ? [
        t("toolbar.tocGalleryManualLine1"),
        t("toolbar.tocGalleryManualLine2"),
        t("toolbar.tocGalleryManualLine3"),
      ]
    : [
        t("toolbar.tocGalleryHeadingLine1"),
        t("toolbar.tocGalleryHeadingLine2"),
        t("toolbar.tocGalleryHeadingLine3"),
      ];
  // Each row draws the table it inserts: a manual row in its own look, an
  // automatic one in Word's TOC styles (Word's two Automatic tables differ
  // only in their title, so they look alike in Word too).
  const look = tocThumbnailLook(manual ? row.id : "classic");
  return (
    <div
      className={styles.thumb}
      data-toc-format={row.format}
      data-toc-look={manual ? row.id : "automatic"}
      aria-hidden
    >
      <div
        className={styles.thumbTitle}
        style={look.titleFont ? { fontFamily: look.titleFont } : undefined}
      >
        {title}
      </div>
      {lines.map((line, index) => {
        const level = look.levels[index] ?? look.levels[0];
        const style: CSSProperties = {
          paddingInlineStart: level.indent * 7,
          fontWeight: level.bold ? 700 : 400,
          fontStyle: level.italic ? "italic" : "normal",
          textTransform: level.caps ? "uppercase" : "none",
          fontVariantCaps: level.smallCaps ? "small-caps" : "normal",
          ...(level.font ? { fontFamily: level.font } : {}),
          ...(level.spaced ? { marginTop: 2 } : {}),
        };
        return (
          <div
            key={line}
            className={styles.thumbLine}
            data-level={index + 1}
            style={style}
          >
            <span
              className={styles.thumbText}
              style={level.underline ? { textDecoration: "underline" } : undefined}
            >
              {line}
            </span>
            <span
              className={styles.thumbLeader}
              data-leader={look.leader}
            />
            <span className={styles.thumbPage}>{index + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface DocumentTocGalleryMenuProps {
  readonly removeEnabled: boolean;
  readonly onInsertAutomatic: (row: TocGalleryRow) => void;
  readonly onInsertManual: (row: TocGalleryRow) => void;
  readonly onCustom: () => void;
  readonly onRemove: () => void;
}

/** The items of the Table of Contents gallery menu (the caller owns the menu). */
export function DocumentTocGalleryMenu({
  removeEnabled,
  onInsertAutomatic,
  onInsertManual,
  onCustom,
  onRemove,
}: DocumentTocGalleryMenuProps) {
  const t = useTranslations("console-notebooks");
  const locale = useCatalogLocale();
  return (
    <>
      {/* Word for Mac lists its Manual tables above its Automatic ones. */}
      <DropdownMenuLabel className={styles.galleryLabel}>
        {t("toolbar.tocGalleryManual")}
      </DropdownMenuLabel>
      <div className={styles.galleryGrid} role="presentation">
        {tocGalleryManualRows().map((row) => (
          <DropdownMenuItem
            key={`manual-${row.id}`}
            className={styles.galleryItem}
            data-testid={`document-toolbar-ribbon-references-toc-gallery-manual-${row.id}`}
            onSelect={() => onInsertManual(row)}
          >
            <GalleryThumbnail row={row} manual locale={locale} />
            <span className={styles.galleryName}>{tocGalleryRowName(row, locale)}</span>
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuLabel className={styles.galleryLabel}>
        {t("toolbar.tocGalleryAutomatic")}
      </DropdownMenuLabel>
      <div className={styles.galleryGrid} role="presentation">
        {tocGalleryAutomaticRows().map((row) => (
          <DropdownMenuItem
            key={`auto-${row.id}`}
            className={styles.galleryItem}
            data-testid={`document-toolbar-ribbon-references-toc-gallery-auto-${row.id}`}
            onSelect={() => onInsertAutomatic(row)}
          >
            <GalleryThumbnail row={row} manual={false} locale={locale} />
            <span className={styles.galleryName}>{tocGalleryRowName(row, locale)}</span>
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-testid="document-toolbar-ribbon-references-toc-settings"
        onSelect={onCustom}
      >
        {t("toolbar.tocCustom")}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!removeEnabled}
        data-testid="document-toolbar-ribbon-references-toc-remove"
        onSelect={onRemove}
      >
        {t("toolbar.removeTableOfContents")}
      </DropdownMenuItem>
    </>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function FormatPreview({
  settings,
  web,
}: {
  settings: TocSettings;
  web: boolean;
}) {
  const t = useTranslations("console-notebooks");
  const [minimum, maximum] = settings.levels.split("-").map((part) => Number.parseInt(part, 10));
  const rows = HEADING_ROWS.filter((level) => level >= minimum && level <= Math.min(maximum, 3));
  const showNumbers = web ? !settings.hyperlinks : settings.showPageNumbers;
  return (
    <div
      className={`note-editor-content ${styles.previewPage}`}
      data-testid={web ? "document-toc-web-preview" : "document-toc-print-preview"}
    >
      <div
        className={`note-editor-toc ${styles.previewToc}`}
        data-toc-format={settings.format}
        data-show-page-numbers={showNumbers ? "true" : "false"}
      >
        <ul className="note-editor-toc__list">
          {rows.map((level) => (
            <li
              key={level}
              className={`note-editor-toc__item note-editor-toc__item--level-${level}`}
              data-level={level}
            >
              <span
                className={`note-editor-toc__link ${web && settings.hyperlinks ? styles.previewLink : ""}`}
              >
                <span className="note-editor-toc__entry-label">
                  {t("toolbar.tocPreviewHeading", { level })}
                </span>
                {showNumbers ? (
                  settings.rightAlignPageNumbers ? (
                    <>
                      <span
                        className="note-editor-toc__leader"
                        data-leader={settings.tabLeader}
                        aria-hidden
                      />
                      <span className="note-editor-toc__page-number">{level}</span>
                    </>
                  ) : (
                    <>
                      <span className="note-editor-toc__separator" aria-hidden>
                        {" "}
                      </span>
                      <span className="note-editor-toc__page-number">{level}</span>
                    </>
                  )
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table of Contents dialog
// ---------------------------------------------------------------------------

export interface DocumentTocCustomDialogProps {
  readonly open: boolean;
  readonly value: TocSettings;
  readonly onChange: (next: TocSettings) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onOpenOptions: () => void;
  readonly onOpenStyles: () => void;
  readonly disabled?: boolean;
}

export function DocumentTocCustomDialog({
  open,
  value,
  onChange,
  onSubmit,
  onCancel,
  onOpenOptions,
  onOpenStyles,
  disabled = false,
}: DocumentTocCustomDialogProps) {
  const t = useTranslations("console-notebooks");
  const [minimum, maximum] = value.levels.split("-").map((part) => Number.parseInt(part, 10));
  const setLevels = (next: number) => {
    const clamped = Math.max(1, Math.min(9, next));
    onChange(normalizeTocSettings({ ...value, levels: `${Math.min(minimum, clamped)}-${clamped}` }));
  };
  const setFormat = (format: TocFormat) => {
    // Word's dialog preselects the format's own leader and alignment.
    const defaults = tocFormatDefaults(format);
    onChange(
      normalizeTocSettings({
        ...value,
        format,
        tabLeader: defaults.tabLeader,
        rightAlignPageNumbers: defaults.rightAlignPageNumbers,
      }),
    );
  };
  return (
    <OfficeDialogShell
      open={open}
      title={t("toolbar.tocDialogTitle")}
      description={t("toolbar.tocDialogDescription")}
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      onDefaultAction={onSubmit}
      onCancel={onCancel}
      defaultActionDisabled={disabled}
      className={styles.dialog}
      testIdPrefix="document-toc-settings"
    >
      <div className={styles.previews}>
        <div className={styles.previewColumn}>
          <div className={styles.sectionLabel}>{t("toolbar.tocPrintPreview")}</div>
          <FormatPreview settings={value} web={false} />
        </div>
        <div className={styles.previewColumn}>
          <div className={styles.sectionLabel}>{t("toolbar.tocWebPreview")}</div>
          <FormatPreview settings={value} web />
        </div>
      </div>
      <div className={styles.optionColumns}>
        <div className={styles.optionColumn}>
          <label className={styles.check}>
            <input
              type="checkbox"
              data-testid="document-toc-show-page-numbers"
              checked={value.showPageNumbers}
              onChange={(event) =>
                onChange(
                  normalizeTocSettings({
                    ...value,
                    showPageNumbers: event.target.checked,
                  }),
                )
              }
            />
            {t("toolbar.tocShowPageNumbers")}
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              data-testid="document-toc-right-align-page-numbers"
              checked={value.rightAlignPageNumbers}
              disabled={!value.showPageNumbers}
              onChange={(event) =>
                onChange(
                  normalizeTocSettings({
                    ...value,
                    rightAlignPageNumbers: event.target.checked,
                  }),
                )
              }
            />
            {t("toolbar.tocRightAlignPageNumbers")}
          </label>
          <label className={styles.field}>
            <span>{t("toolbar.tocTabLeader")}</span>
            <select
              className={styles.select}
              data-testid="document-toc-tab-leader"
              value={value.tabLeader}
              disabled={!value.showPageNumbers || !value.rightAlignPageNumbers}
              onChange={(event) =>
                onChange(
                  normalizeTocSettings({
                    ...value,
                    tabLeader: event.target.value,
                  }),
                )
              }
            >
              {TOC_TAB_LEADERS.map((leader) => (
                <option key={leader} value={leader}>
                  {leader === "none"
                    ? t("toolbar.tocTabLeader_none")
                    : TAB_LEADER_GLYPHS[leader]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.optionColumn}>
          <label className={styles.check}>
            <input
              type="checkbox"
              data-testid="document-toc-hyperlinks"
              checked={value.hyperlinks}
              onChange={(event) =>
                onChange(
                  normalizeTocSettings({
                    ...value,
                    hyperlinks: event.target.checked,
                  }),
                )
              }
            />
            {t("toolbar.tocHyperlinksInsteadOfPageNumbers")}
          </label>
        </div>
      </div>
      <fieldset className={styles.general}>
        <legend className={styles.sectionLabel}>{t("toolbar.tocGeneral")}</legend>
        <div className={styles.generalRow}>
          <label className={styles.field}>
            <span>{t("toolbar.tocFormats")}</span>
            <select
              className={styles.select}
              data-testid="document-toc-format"
              // A gallery table reads From template, as in Word: its TOC
              // styles are the document's own.
              value={value.format === "gallery" ? "template" : value.format}
              onChange={(event) => setFormat(event.target.value as TocFormat)}
            >
              {TOC_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {t(`toolbar.tocFormat_${format}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t("toolbar.tocLevelsLabel")}</span>
            {/* One field with its step buttons inside it, like every other
                number box on the Office dialog chrome. */}
            <span className={`${officeDialogParts.stepper} ${styles.spinner}`}>
              <button
                type="button"
                className={officeDialogParts.stepperButton}
                aria-label={t("toolbar.tocLevelsDecrease")}
                title={t("toolbar.tocLevelsDecrease")}
                data-testid="document-toc-levels-down"
                disabled={maximum <= 1}
                onClick={() => setLevels(maximum - 1)}
              >
                <Minus size={12} aria-hidden="true" />
              </button>
              <input
                type="number"
                data-testid="document-toc-levels"
                min={1}
                max={9}
                step={1}
                value={maximum}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (Number.isInteger(parsed)) setLevels(parsed);
                }}
              />
              <button
                type="button"
                className={officeDialogParts.stepperButton}
                aria-label={t("toolbar.tocLevelsIncrease")}
                title={t("toolbar.tocLevelsIncrease")}
                data-testid="document-toc-levels-up"
                disabled={maximum >= 9}
                onClick={() => setLevels(maximum + 1)}
              >
                <Plus size={12} aria-hidden="true" />
              </button>
            </span>
          </label>
        </div>
      </fieldset>
      <div className={styles.dialogButtons}>
        <button
          type="button"
          className={officeDialogParts.button}
          data-testid="document-toc-modify"
          onClick={onOpenStyles}
        >
          {t("toolbar.tocModify")}
        </button>
        <button
          type="button"
          className={officeDialogParts.button}
          data-testid="document-toc-options"
          onClick={onOpenOptions}
        >
          {t("toolbar.tocOptions")}
        </button>
      </div>
    </OfficeDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Table of Contents Options
// ---------------------------------------------------------------------------

export interface DocumentTocOptionsDialogProps {
  readonly open: boolean;
  readonly value: TocSettings;
  /** The document's own paragraph styles (Word lists every available style). */
  readonly documentStyleNames: readonly string[];
  readonly onSubmit: (next: TocSettings) => void;
  readonly onCancel: () => void;
}

export function DocumentTocOptionsDialog({
  open,
  value,
  documentStyleNames,
  onSubmit,
  onCancel,
}: DocumentTocOptionsDialogProps) {
  const t = useTranslations("console-notebooks");
  const initial = useMemo(() => tocStyleGrid(value), [value]);
  // Each level field is named by its row's style and the column, "Heading 2
  // TOC level", as its visible labels read.
  const gridId = useId();
  const levelColumnId = `${gridId}-level`;
  const [useStyles, setUseStyles] = useState(value.useStyles);
  const [headings, setHeadings] = useState<(number | null)[]>(initial.headings);
  const [others, setOthers] = useState<TocStyleLevel[]>(initial.others);
  const [useOutlineLevels, setUseOutlineLevels] = useState(value.useOutlineLevels);
  const [entryFields, setEntryFields] = useState(value.entryFields);
  // Every opening starts from the table's current settings (derived state,
  // reset while rendering the transition rather than in an effect).
  const [openedFor, setOpenedFor] = useState<TocSettings | null>(open ? value : null);
  if (open && openedFor !== value) {
    setOpenedFor(value);
    setUseStyles(value.useStyles);
    setHeadings(initial.headings);
    setOthers(initial.others);
    setUseOutlineLevels(value.useOutlineLevels);
    setEntryFields(value.entryFields);
  } else if (!open && openedFor !== null) {
    setOpenedFor(null);
  }

  const otherRows = useMemo(() => {
    const names = new Set<string>();
    for (const entry of others) names.add(entry.name);
    for (const name of documentStyleNames) {
      if (headingStyleLevel(name) === null) names.add(name);
    }
    return Array.from(names);
  }, [documentStyleNames, others]);

  const otherLevel = (name: string): number | null =>
    others.find((entry) => entry.name === name)?.level ?? null;
  const setOtherLevel = (name: string, level: number | null) => {
    setOthers((previous) => {
      const rest = previous.filter((entry) => entry.name !== name);
      return level === null ? rest : [...rest, { name, level }];
    });
  };
  const parseLevel = (raw: string): number | null | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 9 ? parsed : undefined;
  };
  const reset = () => {
    setUseStyles(true);
    setHeadings(HEADING_ROWS.map((level) => (level <= 3 ? level : null)));
    setOthers([]);
    setUseOutlineLevels(true);
    setEntryFields(false);
  };
  const submit = () => {
    const next = tocSettingsFromStyleGrid(
      value,
      useStyles ? headings : HEADING_ROWS.map(() => null),
      useStyles ? others : [],
    );
    onSubmit(normalizeTocSettings({ ...next, useStyles, useOutlineLevels, entryFields }));
  };
  return (
    <OfficeDialogShell
      open={open}
      title={t("toolbar.tocOptionsTitle")}
      description={t("toolbar.tocOptionsDescription")}
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      onDefaultAction={submit}
      onCancel={onCancel}
      className={styles.dialog}
      testIdPrefix="document-toc-options"
    >
      <div className={styles.sectionLabel}>{t("toolbar.tocBuildFrom")}</div>
      <label className={styles.check}>
        <input
          type="checkbox"
          data-testid="document-toc-options-styles"
          checked={useStyles}
          onChange={(event) => setUseStyles(event.target.checked)}
        />
        {t("toolbar.tocBuildFromStyles")}
      </label>
      <div className={styles.styleGrid} data-testid="document-toc-options-grid">
        <div className={styles.styleGridHead}>
          <span>{t("toolbar.tocAvailableStyles")}</span>
          <span id={levelColumnId}>{t("toolbar.tocLevelColumn")}</span>
        </div>
        <div className={styles.styleGridBody}>
          {HEADING_ROWS.map((level) => {
            const mapped = headings[level - 1];
            return (
              <div key={level} className={styles.styleRow}>
                <span className={styles.styleCheck} aria-hidden>
                  {mapped !== null ? <Check size={12} /> : null}
                </span>
                <span className={styles.styleName} id={`${gridId}-heading-${level}`}>
                  {t("toolbar.tocHeadingStyleName", { level })}
                </span>
                <input
                  className={styles.levelInput}
                  aria-labelledby={`${gridId}-heading-${level} ${levelColumnId}`}
                  data-testid={`document-toc-options-heading-${level}`}
                  disabled={!useStyles}
                  inputMode="numeric"
                  value={mapped ?? ""}
                  onChange={(event) => {
                    const parsed = parseLevel(event.target.value);
                    if (parsed === undefined) return;
                    setHeadings((previous) => {
                      const next = [...previous];
                      next[level - 1] = parsed;
                      return next;
                    });
                  }}
                />
              </div>
            );
          })}
          {otherRows.map((name, index) => {
            const mapped = otherLevel(name);
            return (
              <div key={name} className={styles.styleRow}>
                <span className={styles.styleCheck} aria-hidden>
                  {mapped !== null ? <Check size={12} /> : null}
                </span>
                <span className={styles.styleName} id={`${gridId}-style-${index}`}>
                  {name}
                </span>
                <input
                  className={styles.levelInput}
                  aria-labelledby={`${gridId}-style-${index} ${levelColumnId}`}
                  data-testid={`document-toc-options-style-${name}`}
                  disabled={!useStyles}
                  inputMode="numeric"
                  value={mapped ?? ""}
                  onChange={(event) => {
                    const parsed = parseLevel(event.target.value);
                    if (parsed === undefined) return;
                    setOtherLevel(name, parsed);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          data-testid="document-toc-options-outline-levels"
          checked={useOutlineLevels}
          onChange={(event) => setUseOutlineLevels(event.target.checked)}
        />
        {t("toolbar.tocBuildFromOutlineLevels")}
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          data-testid="document-toc-options-entry-fields"
          checked={entryFields}
          onChange={(event) => setEntryFields(event.target.checked)}
        />
        {t("toolbar.tocBuildFromEntryFields")}
      </label>
      <div className={styles.dialogButtons}>
        <button
          type="button"
          className={officeDialogParts.button}
          data-testid="document-toc-options-reset"
          onClick={reset}
        >
          {t("toolbar.tocReset")}
        </button>
      </div>
    </OfficeDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Styles (Modify...)
// ---------------------------------------------------------------------------

export interface DocumentTocStylesDialogProps {
  readonly open: boolean;
  readonly value: TocSettings;
  readonly onClose: () => void;
  /** The document's modified TOC 1..9 styles (doc.attrs.referenceStyles). */
  readonly referenceStyles?: ReferenceStyleMap | null;
  /**
   * Word's Style > Modify...: store a TOC level's definition (null clears
   * it back to the Format's). Absent = Modify unavailable.
   */
  readonly onSaveStyle?: (
    id: ReferenceStyleId,
    definition: ReferenceStyleDefinition | null,
  ) => boolean;
  readonly canEdit?: boolean;
}

/** What each format's TOC N style adds over Normal, in the dialog's words. */
function tocStyleDescription(
  format: TocFormat,
  level: number,
  t: ReturnType<typeof useTranslations>,
): string {
  const parts: string[] = [];
  const bold = t("toolbar.tocStyleBold");
  const italic = t("toolbar.tocStyleItalic");
  const caps = t("toolbar.tocStyleAllCaps");
  const smallCaps = t("toolbar.tocStyleSmallCaps");
  const underline = t("toolbar.tocStyleUnderline");
  const center = t("toolbar.tocStyleCentered");
  const size = (points: number) => t("toolbar.tocStyleSize", { points });
  const indent = (points: number) => t("toolbar.tocStyleIndent", { points });
  const before = (points: number) => t("toolbar.tocStyleSpaceBefore", { points });
  const after = (points: number) => t("toolbar.tocStyleSpaceAfter", { points });
  switch (format) {
    case "template":
      if (level >= 2) parts.push(t("toolbar.tocStyleIndentChars", { count: (level - 1) * 2 }));
      break;
    case "gallery":
      // The References gallery's TOC 1-3 (Word's glossary styles).
      if (level === 1) parts.push(bold, size(12), before(6));
      else if (level === 2) parts.push(italic, size(11), indent(10.8), before(6));
      else if (level === 3) parts.push(size(11), indent(22.3), before(6));
      else parts.push(t("toolbar.tocStyleIndentChars", { count: (level - 1) * 2 }));
      break;
    case "classic":
      if (level === 1) parts.push(bold, caps, size(12), before(18));
      else if (level === 2) parts.push(bold, size(10), before(12));
      else parts.push(size(10), indent((level - 2) * 11), after(3));
      break;
    case "distinctive":
      if (level === 1) parts.push(bold, italic, size(12), before(6));
      else if (level === 2) parts.push(bold, indent(11), before(6));
      else parts.push(indent((level - 1) * 11));
      break;
    case "fancy":
      if (level === 1) parts.push(bold, caps, underline, before(18), after(18));
      else if (level === 2) parts.push(bold, smallCaps);
      else parts.push(indent((level - 2) * 11));
      break;
    case "modern":
      parts.push(center, before(6), after(6));
      if (level === 1) parts.push(bold, italic, size(12));
      else if (level === 2) parts.push(italic, size(10));
      else parts.push(size(10));
      break;
    case "formal":
      parts.push(size(10));
      if (level === 1) parts.push(bold, caps, before(6), after(6));
      else if (level === 2) parts.push(smallCaps, indent(11));
      else parts.push(indent((level - 1) * 11));
      break;
    case "simple":
      parts.push(size(10));
      if (level === 1) parts.push(bold, before(12), after(6));
      else if (level === 2) parts.push(italic, indent(11), before(6));
      else parts.push(indent((level - 1) * 11));
      break;
  }
  return parts.join(", ");
}

export function DocumentTocStylesDialog({
  open,
  value,
  onClose,
  referenceStyles = null,
  onSaveStyle,
  canEdit = true,
}: DocumentTocStylesDialogProps) {
  const t = useTranslations("console-notebooks");
  const [selected, setSelected] = useState(1);
  const [modifying, setModifying] = useState(false);
  const selectedId = `TOC${selected}` as ReferenceStyleId;
  const modified = referenceStyles?.[selectedId];
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelected(1);
  }
  const basedOn = t("toolbar.tocStyleBasedOnNormal");
  const description = tocStyleDescription(value.format, selected, t);
  if (modifying && onSaveStyle) {
    return (
      <DocumentStyleDialog
        mode="modify"
        builtIn
        initial={styleValueFromReferenceDefinition(
          t("toolbar.tocStyleName", { level: selected }),
          modified,
        )}
        options={[]}
        canEdit={canEdit}
        onSave={(next) => {
          const definition = normalizeReferenceStyleDefinition(
            referenceDefinitionFromStyleValue(next),
          );
          if (!onSaveStyle(selectedId, definition)) return false;
          setModifying(false);
          return true;
        }}
        onCancel={() => setModifying(false)}
      />
    );
  }
  return (
    <OfficeDialogShell
      open={open}
      title={t("toolbar.tocStylesTitle")}
      description={t("toolbar.tocStylesDescription")}
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      onDefaultAction={onClose}
      onCancel={onClose}
      className={styles.dialog}
      testIdPrefix="document-toc-styles"
      footerStart={
        onSaveStyle ? (
          <button
            type="button"
            className={officeDialogParts.button}
            data-testid="document-toc-styles-modify"
            disabled={!canEdit}
            onClick={() => setModifying(true)}
          >
            {t("toolbar.tocModify")}
          </button>
        ) : undefined
      }
    >
      <div className={styles.sectionLabel}>{t("toolbar.tocStylesList")}</div>
      <div className={styles.stylesLayout}>
        <ul className={styles.stylesList} role="listbox" aria-label={t("toolbar.tocStylesList")} onKeyDown={moveListboxSelection}>
          {TOC_STYLE_IDS.map((id, index) => {
            const level = index + 1;
            return (
              <li key={id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === level}
                  className={styles.stylesItem}
                  data-testid={`document-toc-styles-item-${level}`}
                  onClick={() => setSelected(level)}
                >
                  {t("toolbar.tocStyleName", { level })}
                </button>
              </li>
            );
          })}
        </ul>
        <div className={styles.stylesPreview}>
          <div className={styles.sectionLabel}>{t("toolbar.tocStylesPreview")}</div>
          <div className={`note-editor-content ${styles.previewPage}`}>
            <div
              className={`note-editor-toc ${styles.previewToc}`}
              data-toc-format={value.format}
            >
              <ul className="note-editor-toc__list">
                <li
                  className={`note-editor-toc__item note-editor-toc__item--level-${selected}`}
                  data-level={selected}
                  style={referenceStyleCss(modified)}
                  data-testid="document-toc-styles-preview-entry"
                >
                  <span className="note-editor-toc__link">
                    <span className="note-editor-toc__entry-label">
                      {t("toolbar.tocPreviewHeading", { level: selected })}
                    </span>
                    <span
                      className="note-editor-toc__leader"
                      data-leader={value.tabLeader}
                      aria-hidden
                    />
                    <span className="note-editor-toc__page-number">{selected}</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <p className={styles.stylesDescription} data-testid="document-toc-styles-description">
            {modified
              ? `${basedOn} + ${t("toolbar.tocStyleModified")}`
              : description
                ? `${basedOn} + ${description}`
                : basedOn}
          </p>
        </div>
      </div>
    </OfficeDialogShell>
  );
}
