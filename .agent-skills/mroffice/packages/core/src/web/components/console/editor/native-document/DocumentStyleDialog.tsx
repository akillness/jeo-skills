"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's "Create New Style from Formatting" / "Modify Style" dialog (Styles
 * pane > New Style / Modify; Microsoft Support "Customize or create new
 * styles"):
 *
 * - Properties: Name, Style type (Paragraph / Character / Linked (paragraph
 *   and character)), Style based on (Normal or another style), Style for
 *   following paragraph (the style itself by default; not for a character
 *   style).
 * - Formatting: font, size in points, Bold / Italic / Underline, color,
 *   alignment (left / center / right / justify), line spacing (single / 1.5
 *   / double), spacing before / after and the left indent, with a preview
 *   paragraph between grey "previous" and "following" paragraphs and Word's
 *   description line.
 * - "Add to the Styles gallery", "Automatically update", and "Only in this
 *   document" (the only place a style lives here; "New documents based on
 *   this template" is shown but unavailable).
 * - Format > Font... opens the Font dialog's Font page and Format >
 *   Paragraph... Word's Paragraph fields, both editing this style's
 *   definition rather than the selection.
 *
 * A style's own formatting is what differs from its based-on style; the
 * dialog shows the effective formatting and the caller stores the result.
 * Sizes are points here (the editor stores CSS pixels).
 */

import { WORD_LINE_MULTIPLE_MAX, WORD_LINE_MULTIPLE_MIN } from "../../../../lib/office-units";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "../../../../../host/next-intl";

import { OfficeDialogShell } from "../../../office-ribbon/OfficeDialogShell";
import { officeDialogParts } from "../../../office-ribbon/officeDialogChrome";
import { ribbonFontFamilyLabel } from "../../../office-ribbon/RibbonFontFamilyPicker";
import type { RibbonValueOption } from "../../../office-ribbon/RibbonValueCombobox";
import type { OfficeSemanticIconId } from "../../../office-ribbon/icons/officeIconRegistry";
import { DocumentDialogIcon } from "./DocumentDialogIcon";
import {
  CJK_FONT_FAMILY_VALUES,
  FONT_FAMILY_VALUES,
} from "../extensions/TextStyling";
import { officeFontFamilyLabels } from "../../../office-ribbon/officeTypographyCatalog";
import type { NamedStyleType } from "../extensions/DocumentPageSetup";
import type { DocumentTextAlign } from "../extensions/DocumentFormatting";
import {
  WORD_FONT_SIZE_POINTS,
  fontPixelsToPoints,
  fontPointsToPixels,
} from "../documentHomeRibbonCatalog";
import { documentValueInputClassName } from "../documentValueInput";
import DocumentFontDialogFontPage, {
  fontDialogStyleFromMarks,
  fontDialogStyleMarks,
  type DocumentFontPageDraft,
  type DocumentFontPageField,
  type FontDialogStyle,
  type FontDialogUnderline,
} from "./DocumentFontDialogFontPage";
import { UNDERLINE_STYLE_VALUES } from "./underlineExtension";

/** "Style for following paragraph": the style itself. */
export const STYLE_DIALOG_NEXT_SELF = "__self__";

export interface StyleDialogValue {
  name: string;
  styleType: NamedStyleType;
  /** "Normal" or a palette styleId. */
  basedOn: string;
  /** STYLE_DIALOG_NEXT_SELF, "Normal" or a palette styleId. */
  nextStyleId: string;
  /** A CSS font stack, or "" for the based-on style's font. */
  fontFamily: string;
  /** Points as typed; "" for the based-on size. */
  sizePt: string;
  /** #rrggbb or "" for Automatic. */
  textColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textAlign: DocumentTextAlign | "";
  /** Unitless multiple ("1", "1.5", "2", ...) or "". */
  lineHeight: string;
  spaceBeforePt: string;
  spaceAfterPt: string;
  indentLeftPt: string;
  indentRightPt: string;
  /** Positive first line, negative hanging, "" none. */
  firstLineIndentPt: string;
  quickStyle: boolean;
  autoUpdate: boolean;
}

export interface StyleDialogOption {
  styleId: string;
  name: string;
  styleType: NamedStyleType;
  /** The style this one is based on, to keep its descendants out of "Based on". */
  basedOn?: string;
}

export interface DocumentStyleDialogProps {
  readonly mode: "create" | "modify";
  readonly initial: StyleDialogValue;
  /** The palette styles offered in Based on / Following paragraph. */
  readonly options: readonly StyleDialogOption[];
  /** The style being modified (excluded from its own Based on list). */
  readonly selfStyleId?: string | null;
  /** A built-in style (TOC 1..9, Table of Figures): name and structure fixed. */
  readonly builtIn?: boolean;
  /** A paragraph style the Word file brought: only its Font group (font,
   * size, colour, bold, italic, underline) is changed here; its paragraph
   * formatting stays the file's. */
  readonly fontGroupOnly?: boolean;
  readonly canEdit: boolean;
  /** Lets the caller seed formatting from the selection ("" to hide). */
  readonly onReadSelection?: () => Partial<StyleDialogValue> | null;
  /** False when the selection has no one consistent format to read. */
  readonly selectionAvailable?: boolean;
  /** Where focus returns when the dialog closes (the control that opened it). */
  readonly returnFocusTarget?: () => HTMLElement | null;
  readonly onSave: (value: StyleDialogValue) => boolean;
  readonly onCancel: () => void;
}

const ALIGNMENTS: readonly DocumentTextAlign[] = [
  "left",
  "center",
  "right",
  "justify",
];

const LINE_SPACINGS = ["1", "1.5", "2"] as const;

const STYLE_ALIGNMENT_ICON = {
  left: "paragraph.align.left",
  center: "paragraph.align.center",
  right: "paragraph.align.right",
  justify: "paragraph.align.justify",
  distribute: "paragraph.align.distributed",
} as const satisfies Record<DocumentTextAlign, OfficeSemanticIconId>;

function numberOrBlank(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The CSS a draft paints on the preview paragraph. */
function previewStyle(value: StyleDialogValue): CSSProperties {
  const px = fontPointsToPixels(value.sizePt);
  const before = numberOrBlank(value.spaceBeforePt);
  const after = numberOrBlank(value.spaceAfterPt);
  const left = numberOrBlank(value.indentLeftPt);
  const right = numberOrBlank(value.indentRightPt);
  const first = numberOrBlank(value.firstLineIndentPt);
  return {
    fontFamily: value.fontFamily || undefined,
    fontSize: px ?? undefined,
    color: value.textColor || undefined,
    fontWeight: value.bold ? 700 : undefined,
    fontStyle: value.italic ? "italic" : undefined,
    textDecoration: value.underline ? "underline" : undefined,
    textAlign:
      value.textAlign === "distribute"
        ? "justify"
        : value.textAlign || undefined,
    textAlignLast: value.textAlign === "distribute" ? "justify" : undefined,
    lineHeight: value.lineHeight || undefined,
    marginTop: before !== null ? `${before}pt` : undefined,
    marginBottom: after !== null ? `${after}pt` : undefined,
    marginLeft: left !== null ? `${left}pt` : undefined,
    marginRight: right !== null ? `${right}pt` : undefined,
    textIndent: first !== null ? `${first}pt` : undefined,
  };
}

export function DocumentStyleDialog({
  mode,
  initial,
  options,
  selfStyleId = null,
  builtIn = false,
  fontGroupOnly = false,
  canEdit,
  onReadSelection,
  selectionAvailable = true,
  returnFocusTarget,
  onSave,
  onCancel,
}: DocumentStyleDialogProps) {
  const t = useTranslations("console-notebooks");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState<StyleDialogValue>(initial);
  const [subDialog, setSubDialog] = useState<"font" | "paragraph" | null>(null);
  // Word's Format > Font / Paragraph windows edit the style's draft live, and
  // their Cancel (or Escape) puts it back as it was when they opened.
  const subDialogBaseRef = useRef<StyleDialogValue | null>(null);
  const openSubDialog = (kind: "font" | "paragraph") => {
    subDialogBaseRef.current = value;
    setSubDialog(kind);
  };
  const acceptSubDialog = () => {
    subDialogBaseRef.current = null;
    setSubDialog(null);
  };
  const cancelSubDialog = () => {
    const base = subDialogBaseRef.current;
    subDialogBaseRef.current = null;
    if (base) setValue(base);
    setSubDialog(null);
  };
  const [saveRejected, setSaveRejected] = useState(false);
  const update = (patch: Partial<StyleDialogValue>) => {
    setSaveRejected(false);
    setValue((current) => ({ ...current, ...patch }));
  };
  const character = value.styleType === "character";

  // A style cannot be based on itself or on one of its own descendants:
  // Word leaves those out of the list (choosing one used to be accepted and
  
  const descendsFromSelf = (option: StyleDialogOption): boolean => {
    if (!selfStyleId) return false;
    const byId = new Map(options.map((entry) => [entry.styleId, entry]));
    const seen = new Set<string>();
    let cursor: string | undefined = option.basedOn;
    while (cursor && !seen.has(cursor)) {
      if (cursor === selfStyleId) return true;
      seen.add(cursor);
      cursor = byId.get(cursor)?.basedOn;
    }
    return false;
  };
  const basedOnOptions = options.filter(
    (option) =>
      option.styleId !== selfStyleId &&
      !descendsFromSelf(option) &&
      (option.styleType === "character") === character,
  );
  const nextOptions = options.filter(
    (option) =>
      option.styleId !== selfStyleId && option.styleType !== "character",
  );
  const familyOptions = useMemo(
    () =>
      [...new Set([...FONT_FAMILY_VALUES, ...CJK_FONT_FAMILY_VALUES])].map((family) => ({
        value: family,
        label: ribbonFontFamilyLabel(family, officeFontFamilyLabels(t)),
      })),
    [t],
  );
  // The summary names the base as the Style based on list does: a character
  // style's root is Default Paragraph Font there, not Normal (WUA 135).
  const nameOf = (styleId: string) =>
    styleId === "Normal"
      ? t(character ? "styleDialog.defaultParagraphFont" : "styleDialog.normal")
      : (options.find((option) => option.styleId === styleId)?.name ?? styleId);

  const description = [
    [
      value.fontFamily
        ? ribbonFontFamilyLabel(value.fontFamily, officeFontFamilyLabels(t))
        : "",
      value.sizePt ? `${value.sizePt} pt` : "",
      value.bold ? t("styleDialog.bold") : "",
      value.italic ? t("styleDialog.italic") : "",
      value.underline ? t("styleDialog.underline") : "",
      value.textAlign ? t(`styleDialog.align_${value.textAlign}`) : "",
    ]
      .filter(Boolean)
      .join(", "),
    value.quickStyle ? t("styleDialog.descriptionGallery") : "",
    `${t("styleDialog.basedOn")} ${nameOf(value.basedOn)}`,
    character
      ? ""
      : `${t("styleDialog.following")} ${
          value.nextStyleId === STYLE_DIALOG_NEXT_SELF
            ? value.name || t("styleDialog.thisStyle")
            : nameOf(value.nextStyleId)
        }`,
  ]
    .filter(Boolean)
    .join(" · ");

  const fontDraft: DocumentFontPageDraft = {
    family: value.fontFamily || null,
    cjkFamily: null,
    style:
      fontDialogStyleFromMarks(value.bold, value.italic, false) as FontDialogStyle,
    sizePt: value.sizePt,
    color: value.textColor || null,
    underline: value.underline ? "single" : "none",
    underlineColor: null,
    superscript: false,
    subscript: false,
  };
  const changeFontDraft = (
    field: DocumentFontPageField,
    next: DocumentFontPageDraft[DocumentFontPageField],
  ) => {
    if (field === "family") update({ fontFamily: typeof next === "string" ? next : "" });
    else if (field === "sizePt") update({ sizePt: String(next ?? "") });
    else if (field === "color") update({ textColor: typeof next === "string" ? next : "" });
    else if (field === "underline") update({ underline: next !== "none" && next !== "" });
    else if (field === "style" && typeof next === "string" && next) {
      update(fontDialogStyleMarks(next as FontDialogStyle));
    }
  };
  const sizeOptions: RibbonValueOption[] = WORD_FONT_SIZE_POINTS.map((points) => ({
    id: String(points),
    value: String(points),
    label: String(points),
  }));

  const valid =
    canEdit &&
    value.name.trim() !== "" &&
    (value.sizePt === "" || fontPointsToPixels(value.sizePt) !== null);

  return (
    <>
      <OfficeDialogShell
        open={subDialog === null}
        testIdPrefix="styles"
        title={
          builtIn || mode === "modify"
            ? t("styleDialog.modifyTitle")
            : t("styleDialog.createTitle")
        }
        description={saveRejected ? t("styleDialog.saveRejected") : t("styleDialog.description")}
        defaultActionLabel={t("styleDialog.ok")}
        defaultActionTestId="styles-dialog-save"
        cancelActionLabel={t("styleDialog.cancel")}
        cancelActionTestId="styles-dialog-cancel"
        defaultActionDisabled={!valid}
        onDefaultAction={() => {
          if (!valid) return;
          // A refused save (a name in use, the palette's 24-style cap, a
          // based-on cycle) keeps the dialog open and says so instead of
          
          setSaveRejected(!onSave({ ...value, name: value.name.trim() }));
        }}
        onCancel={onCancel}
        initialFocusRef={nameRef}
        returnFocusTarget={returnFocusTarget}
        className="sm:max-w-[640px]"
        footerStart={
          <>
            <button
              type="button"
              className={officeDialogParts.button}
              data-testid="styles-dialog-format-font"
              disabled={!canEdit}
              onClick={() => openSubDialog("font")}
            >
              <DocumentDialogIcon icon="file.font" />
              {t("styleDialog.formatFont")}
            </button>
            {character ? null : (
              <button
                type="button"
                className={officeDialogParts.button}
                data-testid="styles-dialog-format-paragraph"
                disabled={!canEdit || fontGroupOnly}
                onClick={() => openSubDialog("paragraph")}
              >
                <DocumentDialogIcon icon="text.paragraphMark" />
                {t("styleDialog.formatParagraph")}
              </button>
            )}
          </>
        }
      >
        <section className={officeDialogParts.group}>
          <h3 className={officeDialogParts.sectionTitle}>
            {t("styleDialog.properties")}
          </h3>
          <div className="note-editor-command-dialog__grid">
            <label className={officeDialogParts.field}>
              {t("styleDialog.name")}
              <input
                ref={nameRef}
                type="text"
                value={value.name}
                maxLength={64}
                readOnly={builtIn}
                disabled={!canEdit}
                data-testid="styles-dialog-name"
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label className={officeDialogParts.field}>
              {t("styleDialog.styleType")}
              <select
                value={value.styleType}
                disabled={!canEdit || builtIn || mode === "modify"}
                data-testid="styles-dialog-type"
                onChange={(event) => {
                  const styleType = event.target.value as NamedStyleType;
                  update({
                    styleType,
                    basedOn: "Normal",
                    nextStyleId: STYLE_DIALOG_NEXT_SELF,
                  });
                }}
              >
                {(["paragraph", "character", "linked"] as const).map((entry) => (
                  <option key={entry} value={entry}>
                    {t(`styleDialog.type_${entry}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={officeDialogParts.field}>
              {t("styleDialog.basedOnLabel")}
              <select
                value={value.basedOn}
                disabled={!canEdit || builtIn}
                data-testid="styles-dialog-based-on"
                onChange={(event) => update({ basedOn: event.target.value })}
              >
                <option value="Normal">
                  {character
                    ? t("styleDialog.defaultParagraphFont")
                    : t("styleDialog.normal")}
                </option>
                {basedOnOptions.map((option) => (
                  <option key={option.styleId} value={option.styleId}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={officeDialogParts.field}>
              {t("styleDialog.followingLabel")}
              <select
                value={value.nextStyleId}
                disabled={!canEdit || builtIn || character}
                data-testid="styles-dialog-next"
                onChange={(event) => update({ nextStyleId: event.target.value })}
              >
                <option value={STYLE_DIALOG_NEXT_SELF}>
                  {value.name.trim() || t("styleDialog.thisStyle")}
                </option>
                <option value="Normal">{t("styleDialog.normal")}</option>
                {nextOptions.map((option) => (
                  <option key={option.styleId} value={option.styleId}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className={officeDialogParts.group}>
          <h3 className={officeDialogParts.sectionTitle}>
            {t("styleDialog.formatting")}
          </h3>
          {onReadSelection ? (
            <button
              type="button"
              className={officeDialogParts.compactButton}
              data-testid="styles-dialog-from-selection"
              disabled={!canEdit || !selectionAvailable}
              title={
                selectionAvailable
                  ? t("styleDialog.fromSelection")
                  : t("styleDialog.fromSelectionUnavailable")
              }
              onClick={() => {
                const seed = onReadSelection();
                if (seed) update(seed);
              }}
            >
              <DocumentDialogIcon icon="format.painter" />
              {t("styleDialog.fromSelection")}
            </button>
          ) : null}
          <div className="document-style-dialog__row" role="group">
            <select
              aria-label={t("styleDialog.font")}
              value={value.fontFamily}
              disabled={!canEdit}
              data-testid="styles-dialog-font"
              onChange={(event) => update({ fontFamily: event.target.value })}
            >
              <option value="">{t("styleDialog.inheritFont")}</option>
              {familyOptions.map((family) => (
                <option key={family.value} value={family.value}>
                  {family.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              aria-label={t("styleDialog.sizePt")}
              title={t("styleDialog.sizePt")}
              className={documentValueInputClassName()}
              min={4.5}
              max={72}
              list="document-style-dialog-sizes"
              value={value.sizePt}
              disabled={!canEdit}
              data-testid="styles-dialog-size"
              onChange={(event) => update({ sizePt: event.target.value })}
            />
            <datalist id="document-style-dialog-sizes">
              {WORD_FONT_SIZE_POINTS.map((points) => (
                <option key={points} value={points} />
              ))}
            </datalist>
            {(["bold", "italic", "underline"] as const).map((toggle) => (
              <label key={toggle} className="document-style-dialog__toggle">
                <input
                  type="checkbox"
                  checked={value[toggle]}
                  disabled={!canEdit}
                  data-testid={`styles-dialog-${toggle}`}
                  onChange={(event) => update({ [toggle]: event.target.checked })}
                />
                <span>{t(`styleDialog.${toggle}`)}</span>
              </label>
            ))}
            <input
              type="color"
              aria-label={t("styleDialog.color")}
              title={t("styleDialog.color")}
              value={/^#[0-9a-f]{6}$/i.test(value.textColor) ? value.textColor : "#000000"}
              disabled={!canEdit}
              data-testid="styles-dialog-color"
              onChange={(event) => update({ textColor: event.target.value })}
            />
          </div>
          {character ? null : (
            <div className="document-style-dialog__row" role="group">
              {ALIGNMENTS.map((align) => (
                <button
                  key={align}
                  type="button"
                  className={officeDialogParts.compactButton}
                  aria-pressed={value.textAlign === align}
                  disabled={!canEdit || fontGroupOnly}
                  data-testid={`styles-dialog-align-${align}`}
                  onClick={() =>
                    update({ textAlign: value.textAlign === align ? "" : align })
                  }
                >
                  <DocumentDialogIcon icon={STYLE_ALIGNMENT_ICON[align]} />
                  {t(`styleDialog.align_${align}`)}
                </button>
              ))}
              {LINE_SPACINGS.map((spacing) => (
                <button
                  key={spacing}
                  type="button"
                  className={officeDialogParts.compactButton}
                  aria-pressed={value.lineHeight === spacing}
                  disabled={!canEdit || fontGroupOnly}
                  data-testid={`styles-dialog-line-${spacing}`}
                  onClick={() =>
                    update({ lineHeight: value.lineHeight === spacing ? "" : spacing })
                  }
                >
                  <DocumentDialogIcon icon="paragraph.spacing.line" />
                  {t(`styleDialog.line_${spacing.replace(".", "_")}`)}
                </button>
              ))}
              <label className="document-style-dialog__inline-field">
                {t("styleDialog.spaceBefore")}
                <input
                  type="number"
                  step="any"
                  className={documentValueInputClassName(undefined, { inline: true })}
                  min={0}
                  max={1584}
                  value={value.spaceBeforePt}
                  disabled={!canEdit || fontGroupOnly}
                  data-testid="styles-dialog-space-before"
                  onChange={(event) => update({ spaceBeforePt: event.target.value })}
                />
              </label>
              <label className="document-style-dialog__inline-field">
                {t("styleDialog.spaceAfter")}
                <input
                  type="number"
                  step="any"
                  className={documentValueInputClassName(undefined, { inline: true })}
                  min={0}
                  max={1584}
                  value={value.spaceAfterPt}
                  disabled={!canEdit || fontGroupOnly}
                  data-testid="styles-dialog-space-after"
                  onChange={(event) => update({ spaceAfterPt: event.target.value })}
                />
              </label>
              <label className="document-style-dialog__inline-field">
                {t("styleDialog.indentLeft")}
                <input
                  type="number"
                  step="any"
                  className={documentValueInputClassName(undefined, { inline: true })}
                  min={0}
                  max={1584}
                  value={value.indentLeftPt}
                  disabled={!canEdit || fontGroupOnly}
                  data-testid="styles-dialog-indent-left"
                  onChange={(event) => update({ indentLeftPt: event.target.value })}
                />
              </label>
            </div>
          )}
          <div
            className={`${officeDialogParts.well} document-style-dialog__preview`}
            data-testid="styles-dialog-preview"
            aria-label={t("styleDialog.preview")}
          >
            <p className="document-style-dialog__ghost">{t("styleDialog.previousParagraph")}</p>
            <p style={previewStyle(value)} data-testid="styles-dialog-preview-sample">
              {t("styleDialog.sampleText")}
            </p>
            <p className="document-style-dialog__ghost">{t("styleDialog.followingParagraph")}</p>
          </div>
          <p className={officeDialogParts.hint} data-testid="styles-dialog-description">
            {description}
          </p>
        </section>
        {builtIn ? null : (
          <section className={officeDialogParts.group}>
            <label className={officeDialogParts.check}>
              <input
                type="checkbox"
                checked={value.quickStyle}
                disabled={!canEdit}
                data-testid="styles-dialog-gallery"
                onChange={(event) => update({ quickStyle: event.target.checked })}
              />
              <span>{t("styleDialog.addToGallery")}</span>
            </label>
            <label className={officeDialogParts.check}>
              <input
                type="checkbox"
                checked={value.autoUpdate}
                disabled={!canEdit || character}
                data-testid="styles-dialog-auto-update"
                onChange={(event) => update({ autoUpdate: event.target.checked })}
              />
              <span>{t("styleDialog.autoUpdate")}</span>
            </label>
            <div className={officeDialogParts.row} role="radiogroup">
              <label className={officeDialogParts.check}>
                <input
                  type="radio"
                  name="styles-dialog-scope"
                  checked
                  readOnly
                  data-testid="styles-dialog-scope-document"
                />
                <DocumentDialogIcon icon="file.document" />
                <span>{t("styleDialog.onlyThisDocument")}</span>
              </label>
              <label className={officeDialogParts.check}>
                <input
                  type="radio"
                  name="styles-dialog-scope"
                  disabled
                  data-testid="styles-dialog-scope-template"
                />
                <DocumentDialogIcon icon="file.new" />
                <span>{t("styleDialog.newDocumentsTemplate")}</span>
              </label>
            </div>
          </section>
        )}
      </OfficeDialogShell>

      <OfficeDialogShell
        open={subDialog === "font"}
        testIdPrefix="styles-font"
        title={t("styleDialog.fontTitle")}
        description={t("styleDialog.fontDescription")}
        defaultActionLabel={t("styleDialog.ok")}
        cancelActionLabel={t("styleDialog.cancel")}
        onDefaultAction={acceptSubDialog}
        onCancel={cancelSubDialog}
        className="sm:max-w-[640px]"
      >
        {subDialog === "font" ? (
          <DocumentFontDialogFontPage
            draft={fontDraft}
            onDraftChange={changeFontDraft}
            effects={{
              strike: false,
              doubleStrike: false,
              smallCaps: false,
              allCaps: false,
              hidden: false,
            }}
            onEffectChange={() => {}}
            // A style keeps a Latin font, size, colour, bold/italic and a
            // single underline; the rest is shown but not offered.
            unsupported={{
              reason: t("styleDialog.fontOptionUnavailable"),
              asianFamily: true,
              underlineColor: true,
              effects: true,
              underlineStyles: ["single"],
            }}
            latinFamilies={FONT_FAMILY_VALUES.filter(
              (family) =>
                !(CJK_FONT_FAMILY_VALUES as readonly string[]).includes(family),
            ).map((family) => ({
              value: family,
              label: ribbonFontFamilyLabel(family, officeFontFamilyLabels(t)),
            }))}
            asianFamilies={CJK_FONT_FAMILY_VALUES.map((family) => ({
              value: family,
              label: ribbonFontFamilyLabel(family, officeFontFamilyLabels(t)),
            }))}
            documentDefaultFamily={t("styleDialog.inheritFont")}
            documentDefaultFamilyCss="inherit"
            sizeOptions={sizeOptions}
            normalizeSizePt={(raw) => {
              const px = fontPointsToPixels(raw);
              return px ? fontPixelsToPoints(px) : null;
            }}
            previewText={value.name || t("styleDialog.sampleText")}
            automaticColor="#000000"
            onSetAsDefault={() => {}}
            setAsDefaultDisabled
            labels={{
              sectionFont: t("toolbar.fontDialogSectionFont"),
              latinFamily: t("toolbar.fontDialogLatinFamily"),
              asianFamily: t("toolbar.fontDialogAsianFamily"),
              style: t("toolbar.fontDialogStyle"),
              size: t("toolbar.fontSize"),
              sectionColor: t("toolbar.fontDialogSectionColor"),
              color: t("toolbar.textColor"),
              underlineStyle: t("toolbar.underlineStyleLabel"),
              underlineColor: t("toolbar.underlineColorLabel"),
              sectionEffects: t("toolbar.fontSectionEffects"),
              strike: t("toolbar.strikethrough"),
              doubleStrike: t("toolbar.doubleStrikethrough"),
              superscript: t("toolbar.superscript"),
              subscript: t("toolbar.subscript"),
              smallCaps: t("toolbar.smallCaps"),
              allCaps: t("toolbar.allCaps"),
              hidden: t("toolbar.formattingMarksHiddenText"),
              preview: t("toolbar.fontDialogPreview"),
              previewSample: t("toolbar.fontDialogPreviewSample"),
              setAsDefault: t("toolbar.fontDialogSetDefault"),
              setAsDefaultHint: t("toolbar.fontDialogSetDefaultHint"),
              mixed: t("toolbar.fontPickerMixed"),
              documentDefault: t("toolbar.fontDialogDocumentDefault"),
              followLatin: t("toolbar.fontDialogFollowLatin"),
              automatic: t("toolbar.textColorAutomatic"),
              styleValue: Object.fromEntries(
                (["regular", "italic", "bold", "boldItalic"] as const).map(
                  (style) => [
                    style,
                    t(`toolbar.fontDialogStyleValue.${style}` as Parameters<typeof t>[0]),
                  ],
                ),
              ) as Record<FontDialogStyle, string>,
              underlineValue: Object.fromEntries(
                (["none", ...UNDERLINE_STYLE_VALUES] as const).map((style) => [
                  style,
                  t(`toolbar.underlineStyleValue.${style}` as Parameters<typeof t>[0]),
                ]),
              ) as Record<FontDialogUnderline, string>,
              themeColors: t("toolbar.themeColors"),
              standardColors: t("toolbar.standardColors"),
              recentColors: t("spreadsheet.recentColors"),
              moreColors: t("toolbar.textColorCustom"),
            }}
          />
        ) : null}
      </OfficeDialogShell>

      <OfficeDialogShell
        open={subDialog === "paragraph"}
        testIdPrefix="styles-paragraph"
        title={t("styleDialog.paragraphTitle")}
        description={t("styleDialog.paragraphDescription")}
        defaultActionLabel={t("styleDialog.ok")}
        cancelActionLabel={t("styleDialog.cancel")}
        onDefaultAction={acceptSubDialog}
        onCancel={cancelSubDialog}
        className="sm:max-w-[480px]"
      >
        <div className="note-editor-command-dialog__grid">
          <label className={officeDialogParts.field}>
            {t("styleDialog.alignment")}
            <select
              value={value.textAlign}
              data-testid="styles-paragraph-alignment"
              onChange={(event) =>
                update({ textAlign: event.target.value as DocumentTextAlign | "" })
              }
            >
              <option value="">{t("styleDialog.inherit")}</option>
              {ALIGNMENTS.map((align) => (
                <option key={align} value={align}>
                  {t(`styleDialog.align_${align}`)}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["indentLeftPt", "indentLeft"],
              ["indentRightPt", "indentRight"],
              ["firstLineIndentPt", "firstLine"],
              ["spaceBeforePt", "spaceBefore"],
              ["spaceAfterPt", "spaceAfter"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className={officeDialogParts.field}>
              {t(`styleDialog.${label}`)}
              <input
                type="number"
                step="any"
                className={documentValueInputClassName()}
                min={field === "firstLineIndentPt" ? -1584 : 0}
                max={1584}
                value={value[field]}
                data-testid={`styles-paragraph-${field}`}
                onChange={(event) => update({ [field]: event.target.value })}
              />
            </label>
          ))}
          <label className={officeDialogParts.field}>
            {t("styleDialog.lineSpacing")}
            <input
              type="number"
              step="any"
              className={documentValueInputClassName()}
              min={WORD_LINE_MULTIPLE_MIN}
              max={WORD_LINE_MULTIPLE_MAX}
              value={value.lineHeight}
              data-testid="styles-paragraph-line-height"
              onChange={(event) => update({ lineHeight: event.target.value })}
            />
          </label>
        </div>
      </OfficeDialogShell>
    </>
  );
}

/** A built-in reference style (TOC N, Table of Figures) in the dialog. */
export function styleValueFromReferenceDefinition(
  name: string,
  definition: import("./referenceStyles").ReferenceStyleDefinition | undefined,
): StyleDialogValue {
  const text = (value: number | undefined) =>
    value === undefined ? "" : String(value);
  return {
    name,
    styleType: "paragraph",
    basedOn: "Normal",
    nextStyleId: "Normal",
    fontFamily: definition?.fontFamily ?? "",
    sizePt: definition?.fontSize ? fontPixelsToPoints(definition.fontSize) : "",
    textColor: definition?.textColor ?? "",
    bold: definition?.bold === true,
    italic: definition?.italic === true,
    underline: definition?.underline === true,
    textAlign: definition?.textAlign ?? "",
    lineHeight: definition?.lineHeight ?? "",
    spaceBeforePt: text(definition?.spaceBeforePt),
    spaceAfterPt: text(definition?.spaceAfterPt),
    indentLeftPt: text(definition?.indentLeftPt),
    indentRightPt: text(definition?.indentRightPt),
    firstLineIndentPt: text(definition?.firstLineIndentPt),
    quickStyle: false,
    autoUpdate: false,
  };
}

/** The dialog's formatting as a reference-style definition (closed). */
export function referenceDefinitionFromStyleValue(
  value: StyleDialogValue,
): Record<string, unknown> {
  const number = (text: string) => {
    if (text.trim() === "") return undefined;
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    fontFamily: value.fontFamily || undefined,
    fontSize: fontPointsToPixels(value.sizePt) ?? undefined,
    textColor: value.textColor || undefined,
    bold: value.bold || undefined,
    italic: value.italic || undefined,
    underline: value.underline || undefined,
    textAlign: value.textAlign || undefined,
    lineHeight: value.lineHeight || undefined,
    spaceBeforePt: number(value.spaceBeforePt),
    spaceAfterPt: number(value.spaceAfterPt),
    indentLeftPt: number(value.indentLeftPt),
    indentRightPt: number(value.indentRightPt),
    firstLineIndentPt: number(value.firstLineIndentPt),
  };
}
