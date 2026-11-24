"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's list definition dialogs for Docs (Home > Bullets / Numbering /
 * Multilevel List):
 *
 *   Define New Bullet          Symbol…, (Picture… not offered), Font… (not
 *                              offered), Alignment Left / Centered / Right.
 *   Define New Number Format   Number style, Number format (literal text around
 *                              the shaded number, e.g. "(1)", "1)", "Article 1"),
 *                              Alignment, Start at. Font… is not offered; the
 *                              list style dialog carries number formatting.
 *   Set Numbering Value        Start new list / Continue from previous list,
 *                              Advance value (skip numbers), Set value to.
 *   Define New Multilevel List Click level to modify (1-9), Number style for this
 *                              level, Enter formatting for number (with Include
 *                              level number from), Start at, Restart list after,
 *                              Alignment, Aligned at, Text indent at, Follow
 *                              number with (tab / space / nothing).
 *   Define New List Style      Name, Start at, Apply formatting to (level),
 *                              number style, size, bold, italic, colour.
 *
 * Semantics follow "Define new bullets, numbers, and multilevel lists" and
 * "Change the numbering in a numbered list" (Microsoft Support) and the OOXML
 * numbering model (ECMA-376 §17.9, see listLevelDefinition.ts). The dialogs
 * only draft; the toolbar applies the result through the list commands in one
 * transaction.
 */

import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { OfficeColorPalettePopover } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { OfficeSymbolDialog } from "@mrnote/core/web/components/office-ribbon/OfficeSymbolDialog.tsx";
import type { OfficeRecentSymbol, OfficeSymbolInsertion } from "@mrnote/core/web/lib/office-symbols.ts";

import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import {
  BULLET_STYLE_TYPES,
  bulletGlyph,
  type BulletStyleType,
} from "@mrnote/core/web/components/console/editor/native-document/bulletListStyle.ts";
import {
  LIST_DEFINITION_LEVELS,
  LIST_LEVEL_ALIGNMENTS,
  LIST_LEVEL_FORMATS,
  LIST_LEVEL_SUFFIXES,
  ListCounterState,
  MAX_LIST_LEVEL_START,
  MAX_LIST_POSITION_PT,
  isListFormatLiteral,
  listMarkerText,
  normalizeListDefinition,
  presetListDefinition,
  splitMultilevelLevelText,
  withNumberFormat,
  type DocumentListStyle,
  type ListDefinition,
  type ListLevelAlignment,
  type ListLevelDefinition,
  type ListLevelFormat,
  type ListLevelSuffix,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import { MAX_LIST_START, type ListStyleType } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";

export type DocumentListDialogKind =
  | "defineBullet"
  | "defineNumber"
  | "defineMultilevel"
  | "defineListStyle"
  | "listStart";

/** What the toolbar knows about the selection when a dialog opens. */
export interface DocumentListDialogContext {
  readonly bulletStyle: BulletStyleType;
  readonly bulletGlyph: string | null;
  readonly bulletFont: string | null;
  readonly bulletAlign: ListLevelAlignment;
  readonly orderedStyle: ListStyleType;
  /** The numbering definition in force at the selection (own or preset). */
  readonly definition: ListDefinition;
  /** 0-based list level of the selected item. */
  readonly level: number;
  /** The list's start value (Define New Number Format > Start at). */
  readonly start: number;
  /** Set Numbering Value facts for the selected item. */
  readonly numbering: {
    /** The number the item shows now. */
    readonly value: number;
    /** Whether the item begins its list (only then can it join the previous). */
    readonly first: boolean;
    /** The value it would read if it continued the previous list, if any. */
    readonly continueValue: number | null;
    /** Whether it already continues the previous list. */
    readonly continuing: boolean;
  };
  readonly listStyles: readonly DocumentListStyle[];
}

export type DocumentListDialogResult =
  | {
      kind: "defineBullet";
      galleryStyle: BulletStyleType | null;
      glyph: string;
      font: string | null;
      align: ListLevelAlignment;
    }
  | { kind: "defineNumber"; definition: ListDefinition; start: number }
  | { kind: "defineMultilevel"; definition: ListDefinition }
  | { kind: "defineListStyle"; name: string; definition: ListDefinition }
  | { kind: "listStart"; mode: "new" | "continue" | "advance"; value: number | null };

export interface DocumentListDefinitionDialogsProps {
  readonly kind: DocumentListDialogKind | null;
  readonly context: DocumentListDialogContext | null;
  readonly recentSymbols: readonly OfficeRecentSymbol[];
  readonly returnFocusTarget?: () => HTMLElement | null;
  /** Apply; returns false when the document refused (the dialog stays open). */
  readonly onSubmit: (result: DocumentListDialogResult) => boolean;
  readonly onCancel: () => void;
}

type Translate = ReturnType<typeof useTranslations>;

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function clampPt(raw: string, fallback: number): number {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value)
    ? Math.min(MAX_LIST_POSITION_PT, Math.max(0, Math.round(value * 100) / 100))
    : fallback;
}

/**
 * Word's dialog preview: a few items at their levels, each marker drawn with
 * its alignment at "Aligned at" and the text at "Text indent at" (scaled).
 */
export function ListDefinitionPreview({
  definition,
  items,
  start,
}: {
  readonly definition: ListDefinition;
  /** Item levels, in order. */
  readonly items: readonly number[];
  /** Level-0 start override (the list's start value), if any. */
  readonly start?: number | null;
}) {
  const rows = useMemo(() => {
    const state = new ListCounterState();
    if (typeof start === "number") state.seedTop(start);
    return items.map((level) => {
      const values = state.advance(definition, level);
      return { level, text: listMarkerText(definition, level, values) };
    });
  }, [definition, items, start]);
  const scale = 0.9;
  return (
    <div
      className="note-editor-list-definition-live-preview"
      data-testid="document-list-definition-preview"
    >
      {rows.map((row, index) => {
        const entry = definition.levels[row.level];
        const translate =
          entry.align === "center" ? "-50%" : entry.align === "right" ? "-100%" : "0";
        // The number's own size, on the preview's scale (as its indents
        // are); the row grows with it so a large number does not run into
        // the next level.
        const markerPx =
          typeof entry.sizePt === "number" && entry.sizePt > 0
            ? entry.sizePt * scale
            : null;
        return (
          <div
            key={index}
            className="note-editor-list-definition-live-preview__row"
            style={{
              paddingLeft: `${entry.indentPt * scale}px`,
              minHeight: markerPx ? `${Math.ceil(markerPx * 1.2)}px` : undefined,
            }}
          >
            <span
              className="note-editor-list-definition-live-preview__marker"
              data-testid="document-list-definition-preview-marker"
              style={{
                left: `${entry.alignAtPt * scale}px`,
                transform: `translateX(${translate})`,
                fontWeight: entry.bold ? 700 : undefined,
                fontStyle: entry.italic ? "italic" : undefined,
                color: entry.color ?? undefined,
                fontFamily: entry.font ?? undefined,
                fontSize: markerPx ? `${markerPx}px` : undefined,
                lineHeight: markerPx ? 1.2 : undefined,
              }}
            >
              {row.text}
            </span>
            <span className="note-editor-list-definition-live-preview__line" />
          </div>
        );
      })}
    </div>
  );
}

function formatLabel(t: Translate, format: ListLevelFormat): string {
  return t(`toolbar.listDef.format.${format}` as Parameters<Translate>[0]);
}

function alignmentLabel(t: Translate, align: ListLevelAlignment): string {
  return t(`toolbar.listDef.align.${align}` as Parameters<Translate>[0]);
}

function suffixLabel(t: Translate, suffix: ListLevelSuffix): string {
  return t(`toolbar.listDef.suffix.${suffix}` as Parameters<Translate>[0]);
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="office-dialog__field">
      {label}
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Define New Bullet
// ---------------------------------------------------------------------------

function DefineBulletBody({
  t,
  glyph,
  font,
  galleryStyle,
  align,
  onGallery,
  onAlign,
  onOpenSymbol,
}: {
  t: Translate;
  glyph: string;
  font: string | null;
  galleryStyle: BulletStyleType | null;
  align: ListLevelAlignment;
  onGallery: (style: BulletStyleType) => void;
  onAlign: (align: ListLevelAlignment) => void;
  onOpenSymbol: () => void;
}) {
  const definition = useMemo(
    () =>
      normalizeListDefinition({
        levels: presetListDefinition("decimal").levels.map((level) => ({
          ...level,
          format: "bullet",
          text: glyph,
          font,
          align,
        })),
      })!,
    [align, font, glyph],
  );
  return (
    <>
      <section className="office-dialog__group">
        <h3>{t("toolbar.listDef.bulletCharacter")}</h3>
        <div className="note-editor-list-definition-bullet-row">
          <span
            className="note-editor-list-definition-bullet-current"
            data-testid="document-define-bullet-current"
            style={font ? { fontFamily: JSON.stringify(font) } : undefined}
          >
            {glyph}
          </span>
          <button
            type="button"
            className="office-dialog__button"
            data-testid="document-define-bullet-symbol"
            onClick={onOpenSymbol}
          >
            <DocumentDialogIcon icon="symbol.insert" />
            {t("toolbar.listDef.symbolButton")}
          </button>
        </div>
        <div className="office-dialog__choices note-editor-list-definition-options note-editor-list-definition-options--bullets">
          {BULLET_STYLE_TYPES.map((style) => (
            <label
              key={`define-bullet-${style}`}
              className="office-dialog__choice note-editor-list-definition-option"
            >
              <input
                type="radio"
                name="bullet-style"
                value={style}
                checked={galleryStyle === style}
                onChange={() => onGallery(style)}
              />
              <span aria-hidden className="note-editor-list-definition-option__glyph">
                {bulletGlyph(style)}
              </span>
              <span>
                {t(`toolbar.bulletListStyle.${style}` as Parameters<Translate>[0])}
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="office-dialog__group">
        <Field label={t("toolbar.listDef.alignment")}>
          <select
            data-testid="document-define-bullet-alignment"
            value={align}
            onChange={(event) => onAlign(event.target.value as ListLevelAlignment)}
          >
            {LIST_LEVEL_ALIGNMENTS.map((value) => (
              <option key={value} value={value}>
                {alignmentLabel(t, value)}
              </option>
            ))}
          </select>
        </Field>
      </section>
      <PreviewGroup t={t}>
        <ListDefinitionPreview definition={definition} items={[0, 0, 0]} />
      </PreviewGroup>
    </>
  );
}

function PreviewGroup({ t, children }: { t: Translate; children: ReactNode }) {
  return (
    <div className="office-dialog__group note-editor-paragraph-preview">
      <span className="office-dialog__section-title">{t("toolbar.preview")}</span>
      <div className="office-dialog__well note-editor-paragraph-preview__paper note-editor-list-definition-preview">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-level editor (multilevel + list style share it)
// ---------------------------------------------------------------------------

function LevelEditor({
  t,
  definition,
  level,
  onLevel,
  onChange,
  showPosition,
  showFont,
}: {
  t: Translate;
  definition: ListDefinition;
  level: number;
  onLevel: (level: number) => void;
  onChange: (next: ListLevelDefinition) => void;
  showPosition: boolean;
  showFont: boolean;
}) {
  const entry = definition.levels[level];
  // The number format field's draft holds while the definition's own text
  // for this level is the one the draft was typed against (or produced): a
  // preset, a numbering type change or any other write that gives the level
  // another text retires the draft, so the field never shows a stale value
  // beside a preview and a commit built from the new definition.
  const [textDraft, setTextDraft] = useState<{
    level: number;
    text: string;
    expect: string;
  } | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLButtonElement | null>(null);
  const draftLive =
    textDraft !== null && textDraft.level === level && textDraft.expect === entry.text;
  const text = draftLive ? textDraft.text : entry.text;
  const commitText = (value: string) => {
    const candidate = normalizeListDefinition({
      levels: definition.levels.map((item, index) =>
        index === level ? { ...item, text: value } : item,
      ),
    });
    setTextDraft({
      level,
      text: value,
      expect: candidate ? candidate.levels[level].text : entry.text,
    });
    if (candidate) onChange(candidate.levels[level]);
  };
  const textInvalid = text !== entry.text;
  return (
    <>
      <div className="note-editor-paragraph-field-grid note-editor-paragraph-field-grid--two">
        <Field label={t("toolbar.listDef.levelToModify")}>
          <select
            data-testid="document-define-multilevel-level"
            value={level}
            onChange={(event) => onLevel(Number(event.target.value))}
          >
            {Array.from({ length: LIST_DEFINITION_LEVELS }, (_, index) => (
              <option key={index} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("toolbar.listDef.numberStyleForLevel")}>
          <select
            data-testid="document-define-multilevel-format"
            value={entry.format}
            onChange={(event) => {
              const format = event.target.value as ListLevelFormat;
              if (format === "bullet") {
                onChange({ ...entry, format, text: "•" });
              } else if (entry.format === "bullet") {
                onChange({ ...entry, format, text: `%${level + 1}.` });
              } else onChange({ ...entry, format });
              setTextDraft(null);
            }}
          >
            {LIST_LEVEL_FORMATS.map((format) => (
              <option key={format} value={format}>
                {formatLabel(t, format)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("toolbar.listDef.enterFormatting")}>
          <input
            type="text"
            maxLength={64}
            data-testid="document-define-multilevel-text"
            aria-invalid={textInvalid || undefined}
            value={text}
            onChange={(event) => commitText(event.target.value)}
          />
        </Field>
        {entry.format !== "bullet" ? (
          <Field label={t("toolbar.listDef.includeLevelFrom")}>
            <select
              data-testid="document-define-multilevel-include"
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                // Word inserts the higher level's number in front of this
                // level's own, where "Include level number from" places it.
                const token = `%${Number(event.target.value) + 1}`;
                const own = `%${level + 1}`;
                const index = text.indexOf(own);
                commitText(
                  index >= 0
                    ? `${text.slice(0, index)}${token}.${text.slice(index)}`
                    : `${text}${token}`,
                );
              }}
            >
              <option value="">{"—"}</option>
              {Array.from({ length: level }, (_, index) => (
                <option key={index} value={index}>
                  {t("toolbar.listDef.levelN", { level: index + 1 })}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {entry.format !== "bullet" ? (
          <Field label={t("toolbar.listDef.startAt")}>
            <input
              type="number"
              min={0}
              max={MAX_LIST_LEVEL_START}
              step={1}
              data-testid="document-define-multilevel-start"
              value={entry.start}
              onChange={(event) =>
                onChange({
                  ...entry,
                  start: clampInt(event.target.value, 0, MAX_LIST_LEVEL_START, entry.start),
                })
              }
            />
          </Field>
        ) : null}
        {level > 0 ? (
          <Field label={t("toolbar.listDef.restartAfter")}>
            <select
              data-testid="document-define-multilevel-restart"
              value={entry.restartAfter}
              onChange={(event) =>
                onChange({ ...entry, restartAfter: Number(event.target.value) })
              }
            >
              <option value={-1}>{t("toolbar.listDef.restartNever")}</option>
              {Array.from({ length: level }, (_, index) => (
                <option key={index} value={index}>
                  {t("toolbar.listDef.levelN", { level: index + 1 })}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      {showPosition ? (
        <section className="office-dialog__group">
          <h3>{t("toolbar.listDef.position")}</h3>
          <div className="note-editor-paragraph-field-grid note-editor-paragraph-field-grid--two">
            <Field label={t("toolbar.listDef.alignment")}>
              <select
                data-testid="document-define-multilevel-align"
                value={entry.align}
                onChange={(event) =>
                  onChange({ ...entry, align: event.target.value as ListLevelAlignment })
                }
              >
                {LIST_LEVEL_ALIGNMENTS.map((value) => (
                  <option key={value} value={value}>
                    {alignmentLabel(t, value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("toolbar.listDef.alignedAt")}>
              <input
                type="number"
                min={0}
                max={MAX_LIST_POSITION_PT}
                step={0.5}
                data-testid="document-define-multilevel-aligned-at"
                value={entry.alignAtPt}
                onChange={(event) =>
                  onChange({ ...entry, alignAtPt: clampPt(event.target.value, entry.alignAtPt) })
                }
              />
            </Field>
            <Field label={t("toolbar.listDef.textIndentAt")}>
              <input
                type="number"
                min={0}
                max={MAX_LIST_POSITION_PT}
                step={0.5}
                data-testid="document-define-multilevel-indent"
                value={entry.indentPt}
                onChange={(event) =>
                  onChange({ ...entry, indentPt: clampPt(event.target.value, entry.indentPt) })
                }
              />
            </Field>
            <Field label={t("toolbar.listDef.followWith")}>
              <select
                data-testid="document-define-multilevel-suffix"
                value={entry.suffix}
                onChange={(event) =>
                  onChange({ ...entry, suffix: event.target.value as ListLevelSuffix })
                }
              >
                {LIST_LEVEL_SUFFIXES.map((value) => (
                  <option key={value} value={value}>
                    {suffixLabel(t, value)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      ) : null}
      {showFont ? (
        <section className="office-dialog__group">
          <h3>{t("toolbar.listDef.formatting")}</h3>
          <div className="note-editor-paragraph-field-grid note-editor-paragraph-field-grid--two">
            <Field label={t("toolbar.listDef.fontSize")}>
              <input
                type="number"
                min={1}
                max={1638}
                step={0.5}
                data-testid="document-define-list-style-size"
                placeholder={t("toolbar.listDef.automatic")}
                value={entry.sizePt ?? ""}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const value = Number.parseFloat(raw);
                  onChange({
                    ...entry,
                    sizePt:
                      raw === "" || !Number.isFinite(value)
                        ? null
                        : Math.min(1638, Math.max(1, Math.round(value * 2) / 2)),
                  });
                }}
              />
            </Field>
            <Field label={t("toolbar.listDef.color")}>
              <button
                ref={colorRef}
                type="button"
                className="office-dialog__button note-editor-list-definition-color"
                data-testid="document-define-list-style-color"
                aria-expanded={colorOpen}
                onClick={() => setColorOpen((open) => !open)}
              >
                <span
                  aria-hidden
                  className="note-editor-list-definition-color__swatch"
                  style={{ background: entry.color ?? "currentColor" }}
                />
                {entry.color ?? t("toolbar.listDef.automatic")}
              </button>
            </Field>
            <label className="office-dialog__check">
              <input
                type="checkbox"
                data-testid="document-define-list-style-bold"
                checked={entry.bold === true}
                onChange={(event) =>
                  onChange({ ...entry, bold: event.target.checked ? true : null })
                }
              />
              {t("toolbar.listDef.bold")}
            </label>
            <label className="office-dialog__check">
              <input
                type="checkbox"
                data-testid="document-define-list-style-italic"
                checked={entry.italic === true}
                onChange={(event) =>
                  onChange({ ...entry, italic: event.target.checked ? true : null })
                }
              />
              {t("toolbar.listDef.italic")}
            </label>
          </div>
          {colorOpen ? (
            <OfficeColorPalettePopover
              anchorRef={colorRef}
              zIndex={1000}
              value={entry.color ?? undefined}
              automaticSelected={entry.color === null}
              labels={{
                automatic: t("toolbar.listDef.automatic"),
                themeColors: t("toolbar.themeColors"),
                standardColors: t("toolbar.standardColors"),
                moreColors: t("toolbar.listDef.color"),
              }}
              onAutomatic={() => {
                onChange({ ...entry, color: null });
                setColorOpen(false);
              }}
              onPick={(color) => {
                onChange({
                  ...entry,
                  color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null,
                });
                setColorOpen(false);
              }}
              onDismiss={() => setColorOpen(false)}
              testIdPrefix="document-define-list-style-palette"
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}

const PREVIEW_OUTLINE = [0, 1, 2, 2, 1, 0] as const;

// ---------------------------------------------------------------------------
// The dialogs
// ---------------------------------------------------------------------------

export function DocumentListDefinitionDialogs({
  kind,
  context,
  recentSymbols,
  returnFocusTarget,
  onSubmit,
  onCancel,
}: DocumentListDefinitionDialogsProps) {
  if (!kind || !context) return null;
  return (
    <DocumentListDefinitionDialog
      // A fresh draft per opening, as Word's dialogs open on the selection.
      key={kind}
      kind={kind}
      context={context}
      recentSymbols={recentSymbols}
      returnFocusTarget={returnFocusTarget}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

function DocumentListDefinitionDialog({
  kind,
  context,
  recentSymbols,
  returnFocusTarget,
  onSubmit,
  onCancel,
}: Omit<DocumentListDefinitionDialogsProps, "kind" | "context"> & {
  kind: DocumentListDialogKind;
  context: DocumentListDialogContext;
}) {
  const t = useTranslations("console-notebooks");
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // Define New Bullet
  const [bulletGallery, setBulletGallery] = useState<BulletStyleType | null>(
    context.bulletGlyph ? null : context.bulletStyle,
  );
  const [bulletCustom, setBulletCustom] = useState<{ glyph: string; font: string | null }>(
    context.bulletGlyph
      ? { glyph: context.bulletGlyph, font: context.bulletFont }
      : { glyph: bulletGlyph(context.bulletStyle), font: null },
  );
  const [bulletAlign, setBulletAlign] = useState<ListLevelAlignment>(context.bulletAlign);
  const [symbolOpen, setSymbolOpen] = useState(false);

  // Define New Number Format
  const numberLevel = Math.min(Math.max(context.level, 0), LIST_DEFINITION_LEVELS - 1);
  const numberEntry = context.definition.levels[numberLevel];
  // A multilevel level ("%1.%2.") keeps the other levels' counters around
  // the text authored here; a level text the form cannot express at all is
  // kept exactly as it is (the inputs are then read-only).
  const initialSplit =
    numberEntry.format !== "bullet"
      ? splitMultilevelLevelText(numberEntry.text, numberLevel)
      : null;
  const numberTextLocked =
    numberEntry.format !== "bullet" &&
    numberEntry.format !== "none" &&
    initialSplit === null;
  const [numberFormat, setNumberFormat] = useState<ListLevelFormat>(
    numberEntry.format === "bullet" || numberEntry.format === "none"
      ? "decimal"
      : numberEntry.format,
  );
  const [numberPrefix, setNumberPrefix] = useState(initialSplit?.prefix ?? "");
  const [numberSuffix, setNumberSuffix] = useState(initialSplit?.suffix ?? ".");
  const [numberAlign, setNumberAlign] = useState<ListLevelAlignment>(numberEntry.align);
  const [numberStart, setNumberStart] = useState(String(context.start));

  // Set Numbering Value
  const [valueMode, setValueMode] = useState<"new" | "continue">(
    context.numbering.first && !context.numbering.continuing ? "new" : "continue",
  );
  const [advance, setAdvance] = useState(false);
  const [valueDraft, setValueDraft] = useState(String(context.numbering.value));

  // Multilevel / list style
  const [multilevel, setMultilevel] = useState<ListDefinition>(context.definition);
  const [multilevelLevel, setMultilevelLevel] = useState(numberLevel);
  const [styleName, setStyleName] = useState("");

  const numberDefinition = useMemo(
    () =>
      withNumberFormat(context.definition, numberLevel, {
        format: numberFormat,
        prefix: numberPrefix,
        suffix: numberSuffix,
        align: numberAlign,
        before: initialSplit?.before,
        after: initialSplit?.after,
        keepText: numberTextLocked,
      }),
    [
      context.definition,
      initialSplit?.after,
      initialSplit?.before,
      numberAlign,
      numberFormat,
      numberLevel,
      numberPrefix,
      numberSuffix,
      numberTextLocked,
    ],
  );
  // The other levels' counters around this level's, drawn as Word shades
  // them in the number format field.
  const numberCounters = Array.from({ length: numberLevel + 1 }, () =>
    clampInt(numberStart, 0, MAX_LIST_START, 1),
  );
  const lockedNumberText = (text: string) =>
    text
      ? listMarkerText(
          {
            levels: context.definition.levels.map((level, index) =>
              index === numberLevel ? { ...level, format: numberFormat, text } : level,
            ),
          },
          numberLevel,
          numberCounters,
        )
      : "";

  const continueValue = context.numbering.first
    ? context.numbering.continueValue
    : context.numbering.value;
  const canContinue = context.numbering.first
    ? context.numbering.continueValue !== null
    : true;
  const minimumValue =
    valueMode === "continue" && advance && continueValue !== null ? continueValue : 0;

  const title =
    kind === "defineBullet"
      ? t("toolbar.defineNewBullet")
      : kind === "defineNumber"
        ? t("toolbar.defineNewNumberFormat")
        : kind === "defineMultilevel"
          ? t("toolbar.defineNewMultilevelList")
          : kind === "defineListStyle"
            ? t("toolbar.defineNewListStyle")
            : t("toolbar.listSetStartValue");

  const submit = () => {
    switch (kind) {
      case "defineBullet":
        onSubmit({
          kind,
          galleryStyle: bulletGallery,
          glyph: bulletGallery ? bulletGlyph(bulletGallery) : bulletCustom.glyph,
          font: bulletGallery ? null : bulletCustom.font,
          align: bulletAlign,
        });
        return;
      case "defineNumber":
        if (!numberDefinition) return;
        onSubmit({
          kind,
          definition: numberDefinition,
          start: clampInt(numberStart, 0, MAX_LIST_START, 1),
        });
        return;
      case "defineMultilevel":
        onSubmit({ kind, definition: multilevel });
        return;
      case "defineListStyle": {
        const name = styleName.trim().slice(0, 80);
        if (!name) return;
        const definition = normalizeListDefinition({ levels: multilevel.levels });
        if (!definition) return;
        onSubmit({ kind, name, definition });
        return;
      }
      case "listStart": {
        if (valueMode === "continue" && !advance) {
          onSubmit({ kind, mode: "continue", value: null });
          return;
        }
        const value = clampInt(valueDraft, minimumValue, MAX_LIST_START, minimumValue);
        onSubmit({ kind, mode: valueMode === "continue" ? "advance" : "new", value });
        return;
      }
    }
  };

  if (symbolOpen) {
    // Word's Symbol dialog replaces focus while it is open; the bullet draft
    // is kept here and the Define New Bullet dialog comes back afterwards.
    return (
      <OfficeSymbolDialog
        open
        labels={{
          title: t("toolbar.symbolDialogTitle"),
          close: t("toolbar.dialogClose"),
          symbolsTab: t("toolbar.symbolTabSymbols"),
          specialCharactersTab: t("toolbar.symbolTabSpecial"),
          fontLabel: t("toolbar.symbolFontLabel"),
          normalText: t("toolbar.symbolNormalText"),
          latinFontsGroup: t("toolbar.symbolLatinFonts"),
          cjkFontsGroup: t("toolbar.symbolCjkFonts"),
          symbolFontsGroup: t("toolbar.symbolSymbolFonts"),
          grid: t("toolbar.symbolGrid"),
          recent: t("toolbar.symbolRecent"),
          characterColumn: t("toolbar.symbolCharacterColumn"),
          shortcutColumn: t("toolbar.symbolShortcutColumn"),
          shortcutLabel: t("toolbar.symbolShortcutLabel"),
          shortcutNone: t("toolbar.symbolShortcutNone"),
          autoCorrect: t("toolbar.symbolAutoCorrect"),
          shortcutKey: t("toolbar.symbolShortcutKey"),
          cancel: t("toolbar.pageSetupCancel"),
          insert: t("toolbar.dialogOk"),
          readout: (values) => t("toolbar.symbolReadout", values),
          specialCharacterName: (id) =>
            t(`toolbar.symbolSpecial_${id}` as "toolbar.symbolSpecial_emDash"),
          subset: t("toolbar.symbolSubset"),
          characterCode: t("toolbar.symbolCharacterCode"),
          codeFrom: t("toolbar.symbolCodeFrom"),
          codeBaseName: (base) =>
            t(`toolbar.symbolCodeBase_${base}` as "toolbar.symbolCodeBase_unicodeHex"),
          subsetName: (id) =>
            t(`toolbar.symbolSubset_${id}` as "toolbar.symbolSubset_basicLatin"),
        }}
        recent={recentSymbols}
        testIdPrefix="document-symbol"
        onCancel={() => setSymbolOpen(false)}
        onInsert={(insertion: OfficeSymbolInsertion) => {
          const glyphs = Array.from(insertion.char);
          if (
            insertion.kind === "text" &&
            glyphs.length >= 1 &&
            glyphs.length <= 4 &&
            !/[\u0000-\u001f%]/u.test(insertion.char)
          ) {
            setBulletCustom({ glyph: insertion.char, font: insertion.font });
            setBulletGallery(null);
          }
          setSymbolOpen(false);
        }}
      />
    );
  }

  const numberInvalid =
    kind === "defineNumber" &&
    (!numberDefinition || !isListFormatLiteral(numberPrefix) || !isListFormatLiteral(numberSuffix));

  return (
    <OfficeDialogShell
      open
      testIdPrefix={kind === "listStart" ? "document-list-start" : `document-${kind}`}
      title={title}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      defaultActionTestId={
        kind === "listStart" ? "document-list-start-apply" : "document-list-definition-apply"
      }
      defaultActionDisabled={
        numberInvalid || (kind === "defineListStyle" && !styleName.trim())
      }
      cancelActionLabel={t("toolbar.cancel")}
      cancelActionTestId={
        kind === "listStart" ? undefined : "document-list-definition-cancel"
      }
      overlayTestId={kind === "listStart" ? undefined : "document-list-definition-layer"}
      onDefaultAction={submit}
      onCancel={onCancel}
      initialFocusRef={firstFieldRef}
      returnFocusTarget={returnFocusTarget}
      className={
        kind === "listStart"
          ? "sm:max-w-[380px]"
          : "note-editor-list-definition-dialog sm:max-w-[640px]"
      }
      bodyClassName="note-editor-dialog-scroll"
    >
      {kind === "defineBullet" ? (
        <DefineBulletBody
          t={t}
          glyph={bulletGallery ? bulletGlyph(bulletGallery) : bulletCustom.glyph}
          font={bulletGallery ? null : bulletCustom.font}
          galleryStyle={bulletGallery}
          align={bulletAlign}
          onGallery={setBulletGallery}
          onAlign={setBulletAlign}
          onOpenSymbol={() => setSymbolOpen(true)}
        />
      ) : null}

      {kind === "defineNumber" ? (
        <>
          <section className="office-dialog__group">
            <h3>{t("toolbar.numberFormat")}</h3>
            <div className="note-editor-paragraph-field-grid note-editor-paragraph-field-grid--two">
              <Field label={t("toolbar.numberStyle")}>
                <select
                  data-testid="document-define-number-style"
                  value={numberFormat}
                  onChange={(event) => setNumberFormat(event.target.value as ListLevelFormat)}
                >
                  {LIST_LEVEL_FORMATS.filter((format) => format !== "bullet").map((format) => (
                    <option key={format} value={format}>
                      {formatLabel(t, format)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("toolbar.listStartValueLabel")}>
                <input
                  type="number"
                  min={0}
                  max={MAX_LIST_START}
                  step={1}
                  data-testid="document-define-number-start"
                  value={numberStart}
                  onChange={(event) => setNumberStart(event.target.value)}
                />
              </Field>
            </div>
            <div className="office-dialog__field">
              {t("toolbar.listDef.numberFormatText")}
              <div
                className="note-editor-list-definition-format"
                data-testid="document-define-number-format"
              >
                {initialSplit?.before ? (
                  <span
                    className="note-editor-list-definition-format__number"
                    data-testid="document-define-number-before"
                  >
                    {lockedNumberText(initialSplit.before)}
                  </span>
                ) : null}
                <input
                  ref={firstFieldRef}
                  type="text"
                  maxLength={24}
                  aria-label={t("toolbar.listDef.textBefore")}
                  data-testid="document-define-number-prefix"
                  value={numberPrefix}
                  readOnly={numberTextLocked}
                  aria-invalid={!isListFormatLiteral(numberPrefix) || undefined}
                  onChange={(event) => setNumberPrefix(event.target.value)}
                />
                <span
                  className="note-editor-list-definition-format__number"
                  aria-label={t("toolbar.listDef.numberPlaceholder")}
                >
                  {lockedNumberText(
                    numberTextLocked ? numberEntry.text : `%${numberLevel + 1}`,
                  )}
                </span>
                <input
                  type="text"
                  maxLength={24}
                  aria-label={t("toolbar.listDef.textAfter")}
                  data-testid="document-define-number-suffix"
                  value={numberSuffix}
                  readOnly={numberTextLocked}
                  aria-invalid={!isListFormatLiteral(numberSuffix) || undefined}
                  onChange={(event) => setNumberSuffix(event.target.value)}
                />
                {initialSplit?.after ? (
                  <span
                    className="note-editor-list-definition-format__number"
                    data-testid="document-define-number-after"
                  >
                    {lockedNumberText(initialSplit.after)}
                  </span>
                ) : null}
              </div>
            </div>
            <Field label={t("toolbar.listDef.alignment")}>
              <select
                data-testid="document-define-number-alignment"
                value={numberAlign}
                onChange={(event) => setNumberAlign(event.target.value as ListLevelAlignment)}
              >
                {LIST_LEVEL_ALIGNMENTS.map((value) => (
                  <option key={value} value={value}>
                    {alignmentLabel(t, value)}
                  </option>
                ))}
              </select>
            </Field>
          </section>
          <PreviewGroup t={t}>
            {numberDefinition ? (
              <ListDefinitionPreview
                definition={numberDefinition}
                items={[numberLevel, numberLevel, numberLevel]}
                start={
                  numberLevel === 0 ? clampInt(numberStart, 0, MAX_LIST_START, 1) : null
                }
              />
            ) : null}
          </PreviewGroup>
        </>
      ) : null}

      {kind === "listStart" ? (
        <div className="office-dialog__group" role="radiogroup">
          <label className="office-dialog__choice flex items-center gap-2">
            <input
              type="radio"
              name="document-list-start-mode"
              data-testid="document-list-start-new"
              checked={valueMode === "new"}
              onChange={() => {
                setValueMode("new");
                setAdvance(false);
              }}
            />
            <DocumentDialogIcon icon="action.reset" />
            {t("toolbar.listDef.startNewList")}
          </label>
          <label className="office-dialog__choice flex items-center gap-2">
            <input
              type="radio"
              name="document-list-start-mode"
              data-testid="document-list-start-continue"
              disabled={!canContinue}
              checked={valueMode === "continue"}
              onChange={() => {
                setValueMode("continue");
                if (continueValue !== null) setValueDraft(String(continueValue));
              }}
            />
            <DocumentDialogIcon icon="list.numbered" />
            {t("toolbar.listDef.continuePrevious")}
          </label>
          <label className="office-dialog__check note-editor-list-start-advance">
            <input
              type="checkbox"
              data-testid="document-list-start-advance"
              disabled={valueMode !== "continue"}
              checked={advance}
              onChange={(event) => setAdvance(event.target.checked)}
            />
            {t("toolbar.listDef.advanceValue")}
          </label>
          <Field label={t("toolbar.listDef.setValueTo")}>
            <input
              ref={firstFieldRef}
              type="number"
              min={minimumValue}
              max={MAX_LIST_START}
              step="1"
              data-testid="document-list-start-value"
              aria-label={t("toolbar.listDef.setValueTo")}
              disabled={valueMode === "continue" && !advance}
              value={valueDraft}
              onChange={(event) => setValueDraft(event.target.value)}
            />
          </Field>
          <div className="note-editor-list-start-preview" data-testid="document-list-start-preview">
            {t("toolbar.preview")}:{" "}
            {listMarkerText(
              context.definition,
              0,
              [
                valueMode === "continue" && !advance
                  ? (continueValue ?? context.numbering.value)
                  : clampInt(valueDraft, minimumValue, MAX_LIST_START, minimumValue),
              ],
            )}
          </div>
        </div>
      ) : null}

      {kind === "defineMultilevel" ? (
        <>
          <section className="office-dialog__group">
            <div className="note-editor-list-definition-presets">
              <span>{t("toolbar.listDef.startFrom")}</span>
              {(["decimal-outline", "multi-level"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  className="office-dialog__button"
                  data-testid={`document-define-multilevel-preset-${style}`}
                  onClick={() => setMultilevel(presetListDefinition(style))}
                >
                  {t(`toolbar.numberedListStyle.${style}` as Parameters<Translate>[0])}
                </button>
              ))}
            </div>
            <LevelEditor
              t={t}
              definition={multilevel}
              level={multilevelLevel}
              onLevel={setMultilevelLevel}
              onChange={(entry) => {
                const next = normalizeListDefinition({
                  levels: multilevel.levels.map((item, index) =>
                    index === multilevelLevel ? entry : item,
                  ),
                });
                if (next) setMultilevel(next);
              }}
              showPosition
              showFont={false}
            />
          </section>
          <PreviewGroup t={t}>
            <ListDefinitionPreview definition={multilevel} items={PREVIEW_OUTLINE} />
          </PreviewGroup>
        </>
      ) : null}

      {kind === "defineListStyle" ? (
        <>
          <section className="office-dialog__group">
            <h3>{t("toolbar.listStyleDetails")}</h3>
            <div className="note-editor-paragraph-field-grid note-editor-paragraph-field-grid--two">
              <Field label={t("toolbar.listStyleName")}>
                <input
                  type="text"
                  ref={firstFieldRef}
                  maxLength={80}
                  required
                  data-testid="document-define-list-style-name"
                  value={styleName}
                  onChange={(event) => setStyleName(event.target.value)}
                />
              </Field>
              <Field label={t("toolbar.multilevelScheme")}>
                <select
                  data-testid="document-define-list-style-scheme"
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    setMultilevel(presetListDefinition(event.target.value as ListStyleType));
                  }}
                >
                  <option value="">{"—"}</option>
                  {(
                    [
                      "decimal",
                      "decimal-outline",
                      "multi-level",
                      "lower-alpha",
                      "upper-alpha",
                      "lower-roman",
                      "upper-roman",
                    ] as const
                  ).map((style) => (
                    <option key={style} value={style}>
                      {t(`toolbar.numberedListStyle.${style}` as Parameters<Translate>[0])}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("toolbar.listDef.startAt")}>
                <input
                  type="number"
                  min={0}
                  max={MAX_LIST_LEVEL_START}
                  step={1}
                  data-testid="document-define-list-style-start"
                  // Level 1's start, the same value the level settings
                  // below show for level 1: one draft, never two.
                  value={multilevel.levels[0].start}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMultilevel((current) => ({
                      ...current,
                      levels: current.levels.map((level, index) =>
                        index === 0
                          ? {
                              ...level,
                              start: clampInt(value, 0, MAX_LIST_LEVEL_START, level.start),
                            }
                          : level,
                      ),
                    }));
                  }}
                />
              </Field>
            </div>
            <LevelEditor
              t={t}
              definition={multilevel}
              level={multilevelLevel}
              onLevel={setMultilevelLevel}
              onChange={(entry) => {
                const next = normalizeListDefinition({
                  levels: multilevel.levels.map((item, index) =>
                    index === multilevelLevel ? entry : item,
                  ),
                });
                if (next) setMultilevel(next);
              }}
              showPosition={false}
              showFont
            />
          </section>
          <PreviewGroup t={t}>
            <ListDefinitionPreview
              definition={multilevel}
              items={PREVIEW_OUTLINE}
              start={multilevel.levels[0].start}
            />
          </PreviewGroup>
        </>
      ) : null}
    </OfficeDialogShell>
  );
}
