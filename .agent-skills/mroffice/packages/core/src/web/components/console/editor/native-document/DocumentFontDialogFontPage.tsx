"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Font page of Word's Font dialog (Home > Font > dialog launcher, Ctrl+D).
 *
 * Word's page, top to bottom (wdDialogFormatFont: Font, FontLowAnsi /
 * FontHighAnsi, Bold, Italic, Points, Color, Underline, UnderlineColor,
 * StrikeThrough, DoubleStrikeThrough, Superscript, Subscript, SmallCaps,
 * AllCaps, Hidden, Default):
 *   - Latin text font + Asian text font (two font boxes once East Asian
 *     support is on; MRAI always carries both marks), Font style (Regular /
 *     Italic / Bold / Bold Italic), Size (points).
 *   - Font color, Underline style (ECMA-376 ST_Underline list), Underline
 *     color (enabled while a line style is chosen).
 *   - Effects: Strikethrough, Double strikethrough, Superscript, Subscript,
 *     (Word for Mac: Shadow, Outline, Emboss, Engrave,) Small caps, All caps,
 *     Hidden. Strike/double strike, small/all caps and super/subscript are
 *     pairs that exclude each other, as in Word; Emboss and Engrave exclude
 *     each other and Shadow / Outline (wdDialogFormatFont Shadow, Outline,
 *     Emboss, Engrave).
 *   - Emphasis mark (w:em) beside the underline, once East Asian text is on.
 *   - Preview of the selection (or Word's sample) in the drafted formatting.
 *   - Set As Default (this document): the document defaults the Design tab
 *     reads. Text Effects... keeps its existing preset menu.
 *
 * The colour palettes render inline under their buttons (the dialog is a
 * Radix modal, which blocks pointer events on anything portalled outside it).
 *
 * A mixed selection shows an empty box for that field and leaves it alone on
 * OK unless the author changes it; every change is recorded in `touched` so OK
 * writes only what was edited.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { officePrimaryFontFamily } from "../../../office-ribbon/officeTypographyCatalog";

import { OfficeColorPalettePanel } from "../../../office-ribbon/OfficeColorPalettePanel";
import {
  RibbonValueCombobox,
  type RibbonValueOption,
} from "../../../office-ribbon/RibbonValueCombobox";

import { DocumentDialogIcon } from "./DocumentDialogIcon";
import {
  UNDERLINE_STYLE_VALUES,
  underlineStyleIsHeavy,
  underlineStyleToCssDecoration,
  type UnderlineStyle,
} from "./underlineStyles";

/** Word's Font style box: the bold/italic pair as one choice. */
export const FONT_DIALOG_STYLE_VALUES = [
  "regular",
  "italic",
  "bold",
  "boldItalic",
] as const;
export type FontDialogStyle = (typeof FONT_DIALOG_STYLE_VALUES)[number];

export type FontDialogUnderline = UnderlineStyle | "none";

/** A field's drafted value; "" means the selection is mixed and untouched. */
export interface DocumentFontPageDraft {
  /** Latin text font: a family, null for the document default, "" mixed. */
  family: string | null | "";
  /** Asian text font: a family, null to follow the Latin font, "" mixed. */
  cjkFamily: string | null | "";
  style: FontDialogStyle | "";
  /** Points as typed; "" mixed or unset. */
  sizePt: string;
  /** #rrggbb, null for Automatic, "" mixed. */
  color: string | null | "";
  underline: FontDialogUnderline | "";
  /** #rrggbb, null for Automatic (the text colour), "" mixed. */
  underlineColor: string | null | "";
  superscript: boolean;
  subscript: boolean;
}

export type DocumentFontPageField = keyof DocumentFontPageDraft;

export interface DocumentFontPageEffects {
  strike: boolean;
  doubleStrike: boolean;
  smallCaps: boolean;
  allCaps: boolean;
  hidden: boolean;
  /** The selection is partly in small caps: the box shows the mixture. */
  smallCapsMixed?: boolean;
  /** The selection is partly in all caps: the box shows the mixture. */
  allCapsMixed?: boolean;
}

/** Word's Font dialog Shadow / Outline / Emboss / Engrave (Word for Mac). */
export interface DocumentFontPageWordEffects {
  shadow: boolean;
  outline: boolean;
  emboss: boolean;
  engrave: boolean;
}

export interface DocumentFontPageFamilyOption {
  value: string;
  label: string;
}

export interface DocumentFontPageLabels {
  sectionFont: string;
  latinFamily: string;
  asianFamily: string;
  style: string;
  size: string;
  sectionColor: string;
  color: string;
  underlineStyle: string;
  underlineColor: string;
  sectionEffects: string;
  strike: string;
  doubleStrike: string;
  superscript: string;
  subscript: string;
  smallCaps: string;
  allCaps: string;
  hidden: string;
  preview: string;
  previewSample: string;
  setAsDefault: string;
  setAsDefaultHint: string;
  mixed: string;
  documentDefault: string;
  followLatin: string;
  automatic: string;
  styleValue: Record<FontDialogStyle, string>;
  underlineValue: Record<FontDialogUnderline, string>;
  themeColors: string;
  standardColors: string;
  recentColors: string;
  moreColors: string;
}

export interface DocumentFontPageProps {
  draft: DocumentFontPageDraft;
  onDraftChange: (field: DocumentFontPageField, value: DocumentFontPageDraft[DocumentFontPageField]) => void;
  effects: DocumentFontPageEffects;
  /** The host keeps the exclusive pairs and its touched-set in step. */
  onEffectChange: (
    effect: Exclude<keyof DocumentFontPageEffects, "smallCapsMixed" | "allCapsMixed">,
    checked: boolean,
  ) => void;
  latinFamilies: readonly DocumentFontPageFamilyOption[];
  asianFamilies: readonly DocumentFontPageFamilyOption[];
  /** The document default's display name, for the option label. */
  documentDefaultFamily: string;
  /** The document default as a CSS font stack, for the preview. */
  documentDefaultFamilyCss: string;
  sizeOptions: readonly RibbonValueOption[];
  /** Validates a typed size; returns the canonical points text or null. */
  normalizeSizePt: (raw: string) => string | null;
  paletteId?: string;
  recentColors?: readonly string[];
  /** The selected text, for the preview; falls back to Word's sample. */
  previewText: string;
  /** The colour the preview shows for Automatic. */
  automaticColor: string;
  /** Word's Set As Default; a host without one (a chart's text) leaves it out. */
  onSetAsDefault?: () => void;
  setAsDefaultDisabled?: boolean;
  /**
   * The DrawingML Font dialog's effects (Excel and PowerPoint, on a chart's
   * or a shape's text): the superscript / subscript Offset and Equalize
   * Character Height in place of Word's Hidden.
   */
  drawingEffects?: Readonly<{
    offset: string;
    offsetLabel: string;
    onOffsetChange: (value: string) => void;
    equalizeHeight: boolean;
    equalizeHeightLabel: string;
    onEqualizeHeightChange: (checked: boolean) => void;
  }>;
  labels: DocumentFontPageLabels;
  initialFocusRef?: React.RefObject<HTMLInputElement | null>;
  textEffectsControl?: ReactNode;
  /** Word's Emphasis mark box, shown on the colour/underline row. */
  emphasisControl?: ReactNode;
  /**
   * Word's legacy Shadow / Outline / Emboss / Engrave boxes (the Docs host;
   * a chart's text has no such effects).
   */
  wordEffects?: Readonly<{
    values: DocumentFontPageWordEffects;
    labels: Record<keyof DocumentFontPageWordEffects, string>;
    onChange: (effect: keyof DocumentFontPageWordEffects, checked: boolean) => void;
  }>;
  /**
   * What the host cannot store (a style's definition keeps no Asian font,
   * underline colour or effects): those controls are shown disabled with the
   * reason, instead of taking a choice the host would drop. `underlineStyles`
   * limits the underline list to the styles the host keeps.
   */
  unsupported?: Readonly<{
    reason: string;
    asianFamily?: boolean;
    underlineColor?: boolean;
    effects?: boolean;
    underlineStyles?: readonly FontDialogUnderline[];
    /**
     * Single effect boxes the host cannot store while it keeps the rest (a
     * slide's text keeps strikethrough and caps but no double strikethrough,
     * baseline offset or equalized height). Absent: every box follows
     * `effects`.
     */
    effectNames?: readonly ("doubleStrike" | "offset" | "equalizeHeight")[];
  }>;
}

const MIXED = "";

function styleFromMarks(bold: boolean, italic: boolean): FontDialogStyle {
  if (bold && italic) return "boldItalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "regular";
}

export function fontDialogStyleFromMarks(
  bold: boolean,
  italic: boolean,
  mixed: boolean,
): FontDialogStyle | "" {
  return mixed ? MIXED : styleFromMarks(bold, italic);
}

export function fontDialogStyleMarks(style: FontDialogStyle): {
  bold: boolean;
  italic: boolean;
} {
  return {
    bold: style === "bold" || style === "boldItalic",
    italic: style === "italic" || style === "boldItalic",
  };
}

export default function DocumentFontDialogFontPage({
  draft,
  onDraftChange,
  effects,
  onEffectChange,
  latinFamilies,
  asianFamilies,
  documentDefaultFamily,
  documentDefaultFamilyCss,
  sizeOptions,
  normalizeSizePt,
  paletteId,
  recentColors,
  previewText,
  automaticColor,
  onSetAsDefault,
  setAsDefaultDisabled = false,
  drawingEffects,
  labels,
  initialFocusRef,
  textEffectsControl,
  emphasisControl,
  wordEffects,
  unsupported,
}: DocumentFontPageProps) {
  const [sizeDraft, setSizeDraft] = useState(draft.sizePt);
  const effectsOff = unsupported?.effects === true;
  const effectsTitle = effectsOff ? unsupported?.reason : undefined;
  const effectOff = (name: "doubleStrike" | "offset" | "equalizeHeight"): boolean =>
    effectsOff || unsupported?.effectNames?.includes(name) === true;
  const effectTitle = (name: "doubleStrike" | "offset" | "equalizeHeight"): string | undefined =>
    effectOff(name) ? unsupported?.reason : undefined;
  const underlineStyles = unsupported?.underlineStyles
    ? UNDERLINE_STYLE_VALUES.filter((style) =>
        unsupported.underlineStyles?.includes(style),
      )
    : UNDERLINE_STYLE_VALUES;
  const [colorPicker, setColorPicker] = useState<"text" | "underline" | null>(null);
  // Esc closes the innermost thing that is open: the colour popup first, the
  // dialog only when no popup is. The dialog's own Esc listens on the
  
  useEffect(() => {
    if (colorPicker === null) return;
    const opened = colorPicker;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setColorPicker(null);
      document
        .querySelector<HTMLElement>(
          `[data-testid="document-font-dialog-${opened === "text" ? "color" : "underline-color"}"]`,
        )
        ?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [colorPicker]);

  const previewStyle = useMemo<CSSProperties>(() => {
    // The catalog values are CSS font stacks already; never re-quote them.
    const family =
      draft.family === MIXED
        ? undefined
        : (draft.family ?? documentDefaultFamilyCss);
    const cjk = draft.cjkFamily === MIXED || !draft.cjkFamily ? null : draft.cjkFamily;
    const marks = draft.style === MIXED ? null : fontDialogStyleMarks(draft.style);
    const size = draft.sizePt.trim() ? Number(draft.sizePt) : NaN;
    // Underline only: the strikethrough is drawn by its own inner element
    // (`previewStrikeStyle`), as the body draws two independent marks. One
    // element carries one text-decoration-style, so a Single underline turned
    
    const underline = draft.underline && draft.underline !== "none" ? draft.underline : null;
    const style: CSSProperties = {
      fontFamily: family ? [family, cjk].filter(Boolean).join(", ") : undefined,
      fontWeight: marks ? (marks.bold ? 700 : 400) : undefined,
      fontStyle: marks ? (marks.italic ? "italic" : "normal") : undefined,
      fontSize: Number.isFinite(size) && size > 0 ? `${Math.min(size, 72)}pt` : undefined,
      color: draft.color === MIXED ? undefined : (draft.color ?? automaticColor),
      textDecorationLine: underline ? "underline" : "none",
      textDecorationStyle: underline
        ? (underlineStyleToCssDecoration(underline) as CSSProperties["textDecorationStyle"])
        : undefined,
      textDecorationThickness: underline && underlineStyleIsHeavy(underline) ? "0.15em" : undefined,
      textDecorationColor:
        draft.underlineColor && draft.underlineColor !== MIXED ? draft.underlineColor : undefined,
      fontVariantCaps: effects.smallCaps ? "small-caps" : undefined,
      textTransform: effects.allCaps ? "uppercase" : undefined,
      verticalAlign: draft.superscript ? "super" : draft.subscript ? "sub" : undefined,
    };
    if (draft.superscript || draft.subscript) style.fontSize = "smaller";
    return style;
  }, [automaticColor, documentDefaultFamilyCss, draft, effects]);

  const previewStrikeStyle = useMemo<CSSProperties | undefined>(
    () =>
      effects.strike || effects.doubleStrike
        ? {
            textDecorationLine: "line-through",
            textDecorationStyle: effects.doubleStrike ? "double" : "solid",
            // Word draws the strikethrough in the text colour, not the
            // underline colour.
            textDecorationColor: "currentColor",
          }
        : undefined,
    [effects.doubleStrike, effects.strike],
  );

  const underlineChosen = draft.underline !== MIXED && draft.underline !== "none";
  const paletteLabels = {
    automatic: labels.automatic,
    themeColors: labels.themeColors,
    standardColors: labels.standardColors,
    recentColors: labels.recentColors,
    moreColors: labels.moreColors,
  };

  const swatch = (color: string | null | "") => (
    <span
      aria-hidden="true"
      className="note-editor-font-dialog__swatch"
      data-mixed={color === MIXED ? "true" : undefined}
      style={{ background: color === MIXED ? "transparent" : (color ?? automaticColor) }}
    />
  );

  // A font applied from the ribbon's own list (Tahoma, a loaded custom font)
  // need not be one of this dialog's presets. A select with no option for its
  // value shows its first option, so the dialog claimed "document default"
  
  const outsidePresets = (
    family: string | null,
    presets: readonly { readonly value: string }[],
  ): string | null =>
    typeof family === "string" && family !== MIXED && !presets.some((option) => option.value === family)
      ? family
      : null;
  const currentLatinFamily = outsidePresets(draft.family, latinFamilies);
  const currentAsianFamily = outsidePresets(draft.cjkFamily, asianFamilies);

  return (
    <>
      <section className="office-dialog__group">
        <h3>{labels.sectionFont}</h3>
        <div className="note-editor-font-dialog__grid note-editor-font-dialog__grid--font">
          <label className="office-dialog__field">
            {labels.latinFamily}
            <select
              ref={initialFocusRef as React.RefObject<HTMLSelectElement | null> | undefined}
              data-testid="document-font-dialog-family"
              value={draft.family === null ? "__default" : draft.family}
              onChange={(event) => {
                const value = event.target.value;
                onDraftChange(
                  "family",
                  value === "__default" ? null : value === MIXED ? MIXED : value,
                );
              }}
            >
              {draft.family === MIXED ? <option value="">{labels.mixed}</option> : null}
              <option value="__default">
                {labels.documentDefault} ({documentDefaultFamily})
              </option>
              {currentLatinFamily ? (
                <option value={currentLatinFamily} style={{ fontFamily: currentLatinFamily }}>
                  {officePrimaryFontFamily(currentLatinFamily)}
                </option>
              ) : null}
              {latinFamilies.map((option) => (
                <option key={option.value} value={option.value} style={{ fontFamily: option.value }}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="office-dialog__field">
            {labels.asianFamily}
            <select
              data-testid="document-font-dialog-asian-family"
              disabled={unsupported?.asianFamily === true}
              title={unsupported?.asianFamily ? unsupported.reason : undefined}
              value={draft.cjkFamily === null ? "__follow" : draft.cjkFamily}
              onChange={(event) => {
                const value = event.target.value;
                onDraftChange(
                  "cjkFamily",
                  value === "__follow" ? null : value === MIXED ? MIXED : value,
                );
              }}
            >
              {draft.cjkFamily === MIXED ? <option value="">{labels.mixed}</option> : null}
              <option value="__follow">{labels.followLatin}</option>
              {currentAsianFamily ? (
                <option value={currentAsianFamily} style={{ fontFamily: currentAsianFamily }}>
                  {officePrimaryFontFamily(currentAsianFamily)}
                </option>
              ) : null}
              {asianFamilies.map((option) => (
                <option key={option.value} value={option.value} style={{ fontFamily: option.value }}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="office-dialog__field">
            {labels.style}
            <select
              data-testid="document-font-dialog-style"
              value={draft.style}
              onChange={(event) =>
                onDraftChange("style", event.target.value as FontDialogStyle | "")
              }
            >
              {draft.style === MIXED ? <option value="">{labels.mixed}</option> : null}
              {FONT_DIALOG_STYLE_VALUES.map((style) => (
                <option key={style} value={style}>
                  {labels.styleValue[style]}
                </option>
              ))}
            </select>
          </label>
          <div className="office-dialog__field note-editor-font-dialog__size">
            <span>{labels.size}</span>
            <RibbonValueCombobox
              testId="document-font-dialog-size"
              label={labels.size}
              placeholder="12"
              inputMode="decimal"
              className="note-editor-ribbon-value-combobox--font-size"
              value={sizeDraft}
              options={sizeOptions}
              mixed={draft.sizePt === MIXED && sizeDraft === MIXED}
              mixedLabel={labels.mixed}
              selectOnFocus
              onDraftChange={setSizeDraft}
              onFocusChange={() => {}}
              onRememberSelection={() => {}}
              onCommit={(raw) => {
                const trimmed = raw.trim();
                if (!trimmed) {
                  setSizeDraft(MIXED);
                  onDraftChange("sizePt", MIXED);
                  return true;
                }
                const points = normalizeSizePt(trimmed);
                if (points === null) return false;
                setSizeDraft(points);
                onDraftChange("sizePt", points);
                return true;
              }}
            />
          </div>
        </div>
      </section>

      <section className="office-dialog__group">
        <h3>{labels.sectionColor}</h3>
        <div className="note-editor-font-dialog__grid note-editor-font-dialog__grid--color">
          <div className="office-dialog__field">
            <span>{labels.color}</span>
            <button
              type="button"
              className="office-dialog__color-button"
              data-testid="document-font-dialog-color"
              data-value={draft.color === MIXED ? "mixed" : (draft.color ?? "auto")}
              aria-haspopup="dialog"
              aria-expanded={colorPicker === "text"}
              onClick={() => setColorPicker((current) => (current === "text" ? null : "text"))}
            >
              {swatch(draft.color)}
              {draft.color === MIXED
                ? labels.mixed
                : draft.color === null
                  ? labels.automatic
                  : draft.color}
            </button>
            {colorPicker === "text" ? (
              <div className="note-editor-font-dialog__palette" data-testid="document-font-dialog-color-panel">
              <OfficeColorPalettePanel
                paletteId={paletteId}
                value={draft.color === MIXED ? undefined : (draft.color ?? undefined)}
                automaticSelected={draft.color === null}
                recents={recentColors}
                labels={paletteLabels}
                testIdPrefix="document-font-dialog-color"
                onPick={(color) => {
                  onDraftChange("color", color);
                  setColorPicker(null);
                }}
                onAutomatic={() => {
                  onDraftChange("color", null);
                  setColorPicker(null);
                }}
                focusOnMount
              />
              </div>
            ) : null}
          </div>
          <label className="office-dialog__field">
            {labels.underlineStyle}
            <select
              data-testid="document-font-dialog-underline"
              value={draft.underline}
              onChange={(event) =>
                onDraftChange("underline", event.target.value as FontDialogUnderline | "")
              }
            >
              {draft.underline === MIXED ? <option value="">{labels.mixed}</option> : null}
              <option value="none">{labels.underlineValue.none}</option>
              {
}
              {underlineStyles.filter((style) => style !== "none").map((style) => (
                <option key={style} value={style}>
                  {labels.underlineValue[style]}
                </option>
              ))}
            </select>
          </label>
          <div className="office-dialog__field">
            <span>{labels.underlineColor}</span>
            <button
              type="button"
              className="office-dialog__color-button"
              data-testid="document-font-dialog-underline-color"
              data-value={
                draft.underlineColor === MIXED ? "mixed" : (draft.underlineColor ?? "auto")
              }
              disabled={!underlineChosen || unsupported?.underlineColor === true}
              title={unsupported?.underlineColor ? unsupported.reason : undefined}
              aria-haspopup="dialog"
              aria-expanded={colorPicker === "underline"}
              onClick={() =>
                setColorPicker((current) => (current === "underline" ? null : "underline"))
              }
            >
              {swatch(draft.underlineColor)}
              {draft.underlineColor === MIXED
                ? labels.mixed
                : draft.underlineColor === null
                  ? labels.automatic
                  : draft.underlineColor}
            </button>
            {colorPicker === "underline" ? (
              <div className="note-editor-font-dialog__palette" data-testid="document-font-dialog-underline-color-panel">
              <OfficeColorPalettePanel
                paletteId={paletteId}
                value={
                  draft.underlineColor === MIXED ? undefined : (draft.underlineColor ?? undefined)
                }
                automaticSelected={draft.underlineColor === null}
                recents={recentColors}
                labels={paletteLabels}
                testIdPrefix="document-font-dialog-underline-color"
                onPick={(color) => {
                  onDraftChange("underlineColor", color);
                  setColorPicker(null);
                }}
                onAutomatic={() => {
                  onDraftChange("underlineColor", null);
                  setColorPicker(null);
                }}
                focusOnMount
              />
              </div>
            ) : null}
          </div>
          {emphasisControl}
        </div>
      </section>

      <section className="office-dialog__group" title={effectsTitle}>
        <h3>{labels.sectionEffects}</h3>
        <div className="note-editor-font-dialog__grid note-editor-font-dialog__grid--effects">
          <label className="office-dialog__check">
            <input
              type="checkbox"
              data-testid="document-font-dialog-strike"
              disabled={effectsOff}
              checked={effects.strike}
              onChange={(event) => onEffectChange("strike", event.target.checked)}
            />
            {labels.strike}
          </label>
          <label className="office-dialog__check" title={effectTitle("doubleStrike")}>
            <input
              type="checkbox"
              data-testid="document-font-dialog-double-strike"
              disabled={effectOff("doubleStrike")}
              checked={effects.doubleStrike}
              onChange={(event) => onEffectChange("doubleStrike", event.target.checked)}
            />
            {labels.doubleStrike}
          </label>
          <label className="office-dialog__check">
            <input
              type="checkbox"
              data-testid="document-font-dialog-superscript"
              disabled={effectsOff}
              checked={draft.superscript}
              onChange={(event) => onDraftChange("superscript", event.target.checked)}
            />
            {labels.superscript}
          </label>
          <label className="office-dialog__check">
            <input
              type="checkbox"
              data-testid="document-font-dialog-subscript"
              disabled={effectsOff}
              checked={draft.subscript}
              onChange={(event) => onDraftChange("subscript", event.target.checked)}
            />
            {labels.subscript}
          </label>
          {drawingEffects ? (
            <label className="office-dialog__field" title={effectTitle("offset")}>
              {drawingEffects.offsetLabel}
              <input
                type="number"
                min={-100}
                max={100}
                step="1"
                data-testid="document-font-dialog-offset"
                disabled={effectOff("offset") || (!draft.superscript && !draft.subscript)}
                value={drawingEffects.offset}
                onChange={(event) => drawingEffects.onOffsetChange(event.target.value)}
              />
            </label>
          ) : null}
          {wordEffects
            ? (["shadow", "outline", "emboss", "engrave"] as const).map((effect) => (
                <label key={effect} className="office-dialog__check">
                  <input
                    type="checkbox"
                    data-testid={`document-font-dialog-${effect}`}
                    disabled={effectsOff}
                    checked={wordEffects.values[effect]}
                    onChange={(event) => wordEffects.onChange(effect, event.target.checked)}
                  />
                  {wordEffects.labels[effect]}
                </label>
              ))
            : null}
          <label className="office-dialog__check">
            <input
              type="checkbox"
              data-testid="document-font-dialog-small-caps"
              ref={(box) => {
                if (box) box.indeterminate = Boolean(effects.smallCapsMixed);
              }}
              disabled={effectsOff}
              checked={effects.smallCaps}
              onChange={(event) => onEffectChange("smallCaps", event.target.checked)}
            />
            {labels.smallCaps}
          </label>
          <label className="office-dialog__check">
            <input
              type="checkbox"
              data-testid="document-font-dialog-all-caps"
              ref={(box) => {
                if (box) box.indeterminate = Boolean(effects.allCapsMixed);
              }}
              disabled={effectsOff}
              checked={effects.allCaps}
              onChange={(event) => onEffectChange("allCaps", event.target.checked)}
            />
            {labels.allCaps}
          </label>
          {drawingEffects ? (
            <label className="office-dialog__check" title={effectTitle("equalizeHeight")}>
              <input
                type="checkbox"
                data-testid="document-font-dialog-equalize-height"
                disabled={effectOff("equalizeHeight")}
                checked={drawingEffects.equalizeHeight}
                onChange={(event) => drawingEffects.onEqualizeHeightChange(event.target.checked)}
              />
              {drawingEffects.equalizeHeightLabel}
            </label>
          ) : (
            <label className="office-dialog__check">
              <input
                type="checkbox"
                data-testid="document-font-dialog-hidden-text"
                disabled={effectsOff}
                checked={effects.hidden}
                onChange={(event) => onEffectChange("hidden", event.target.checked)}
              />
              {labels.hidden}
            </label>
          )}
        </div>
      </section>

      <section className="office-dialog__group">
        <h3>{labels.preview}</h3>
        <div
          className="note-editor-font-dialog__preview"
          data-testid="document-font-dialog-preview"
          aria-live="polite"
        >
          <span style={previewStyle}>
            {previewStrikeStyle ? (
              <span data-preview-strike="true" style={previewStrikeStyle}>
                {previewText || labels.previewSample}
              </span>
            ) : (
              previewText || labels.previewSample
            )}
          </span>
        </div>
        {onSetAsDefault || textEffectsControl ? (
          <div className="note-editor-font-dialog__footer-row">
            {onSetAsDefault ? (
              <button
                type="button"
                className="office-dialog__button"
                data-testid="document-font-dialog-set-default"
                disabled={setAsDefaultDisabled}
                title={labels.setAsDefaultHint}
                onClick={onSetAsDefault}
              >
                <DocumentDialogIcon icon="file.checked" />
                {labels.setAsDefault}
              </button>
            ) : null}
            {textEffectsControl}
          </div>
        ) : null}
      </section>
    </>
  );
}
